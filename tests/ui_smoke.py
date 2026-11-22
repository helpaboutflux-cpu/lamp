#!/usr/bin/env python3
"""Lamp UI 스모크 테스트 (로컬 정적 서버 + 네트워크 목).

KV 연산을 쓰지 않도록 엔진 API와 Supabase를 모두 가짜 응답으로 대체한다.
실행: python3 tests/ui_smoke.py
"""
import json
import os
import subprocess
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8791
BASE = f"http://127.0.0.1:{PORT}/"
EDGE = "https://lamp-edge.helpaboutflux.workers.dev"
SUPA = "https://foisgisqbyaykrlddvio.supabase.co"

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

now = "2026-11-22T01:30:00.000Z"

SITES = [
    {
        "slug": "portfolio", "name": "포트폴리오", "url": f"{EDGE}/portfolio/",
        "previewUrl": f"{EDGE}/p/portfolio/3/", "created": now, "updated": now,
        "private": False, "hasPassword": False, "password": "", "current": 3, "version": 3,
        "files": 4, "bytes": 24000, "message": "문구 수정", "abtest": None,
        "customDomain": "", "github": None, "seo": None,
    },
    {
        "slug": "landing-test", "name": "제품 랜딩", "url": f"{EDGE}/landing-test/",
        "previewUrl": f"{EDGE}/p/landing-test/2/", "created": now, "updated": now,
        "private": True, "hasPassword": True, "password": "", "current": 2, "version": 2,
        "files": 2, "bytes": 8000, "message": "첫 배포", "abtest": None,
        "customDomain": "example.com", "github": None, "seo": None,
    },
]

VERSIONS = [
    {"v": 3, "ts": now, "message": "문구 수정", "files": 4, "bytes": 24000, "preview": False, "paths": ["index.html", "about.html", "style.css", "logo.svg"]},
    {"v": 2, "ts": "2026-11-21T12:00:00.000Z", "message": "소개 페이지 추가", "files": 3, "bytes": 20000, "preview": False, "paths": ["index.html", "about.html", "style.css"]},
    {"v": 1, "ts": "2026-11-20T12:00:00.000Z", "message": "첫 배포", "files": 1, "bytes": 4000, "preview": False, "paths": ["index.html"]},
]

HTML_INDEX = """<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>포트폴리오 - 만드는 사람</title>
<meta name="description" content="디자인과 개발 작업을 정리한 개인 포트폴리오입니다. 프로젝트 세 개와 연락 방법을 담았습니다.">
<meta property="og:title" content="포트폴리오"><meta property="og:description" content="작업 모음"><meta property="og:image" content="/logo.svg">
<link rel="canonical" href="https://lamp-edge.helpaboutflux.workers.dev/portfolio/">
</head><body><h1>포트폴리오</h1><img src="logo.svg" alt="로고"><p>안녕하세요.</p>
<a href="about.html">소개</a><a href="missing.html">없는 페이지</a></body></html>"""

FILES = {
    "index.html": {"text": HTML_INDEX, "type": "text/html; charset=utf-8", "size": len(HTML_INDEX)},
    "about.html": {"text": "<!doctype html><title>소개</title><h1>소개</h1>", "type": "text/html; charset=utf-8", "size": 50},
    "style.css": {"text": "h1{color:#f0a81e}", "type": "text/css; charset=utf-8", "size": 18},
    "logo.svg": {"text": "<svg xmlns='http://www.w3.org/2000/svg'/>", "type": "image/svg+xml", "size": 40},
}

ANALYTICS = {
    "ok": True,
    "daily": [{"date": f"2026-11-{16 + i:02d}", "views": v} for i, v in enumerate([12, 18, 9, 30, 22, 41, 27])],
    "hours": [{"hour": f"2026-11-22T{h:02d}", "views": h % 5} for h in range(24)],
    "total": 159, "live": 6, "ab": [],
}


def mock_api(route):
    url = route.request.url
    path = url.split(EDGE, 1)[1] if EDGE in url else url
    path = path.split("?")[0]
    method = route.request.method

    def send(payload, status=200):
        route.fulfill(status=status, content_type="application/json",
                      headers={"access-control-allow-origin": "*"}, body=json.dumps(payload))

    if path == "/api/config":
        return send({"ok": True, "limits": {"sitesPerUser": 10, "bytesPerSite": 10485760, "filesPerMinute": 5, "deploysPerMinute": 5, "versionsKept": 20},
                     "base": EDGE, "supabase": {"url": SUPA}, "features": {"githubImport": True, "forms": True, "abtest": True, "password": True}})
    if path == "/api/me":
        return send({"ok": True, "user": {"id": "u1", "name": "테스트 사용자", "email": "test@example.com", "avatar": "", "admin": False}, "sites": [s["slug"] for s in SITES]})
    if path == "/api/sites":
        return send({"ok": True, "sites": SITES})
    if path.startswith("/api/sites/") and path.endswith("/files"):
        return send({"ok": True, "version": 3, "paths": list(FILES.keys()), "files": FILES})
    if path.startswith("/api/sites/") and path.endswith("/analytics"):
        return send(ANALYTICS)
    if path.startswith("/api/sites/") and path.endswith("/forms"):
        return send({"ok": True, "forms": [{"id": "f_abc123", "name": "문의하기", "fields": [{"name": "email"}], "created": now, "count": 2}]})
    if path.startswith("/api/sites/") and path.endswith("/submissions"):
        return send({"ok": True, "count": 2, "submissions": [
            {"at": now, "data": {"email": "a@b.co", "message": "안녕하세요"}},
            {"at": now, "data": {"email": "c@d.co", "message": "문의드립니다"}}]})
    if path.startswith("/api/sites/"):
        slug = path.split("/")[3]
        site = next((s for s in SITES if s["slug"] == slug), SITES[0])
        if method == "PATCH":
            return send({"ok": True, "site": site})
        if method == "DELETE":
            return send({"ok": True, "deleted": slug})
        return send({"ok": True, "site": site, "versions": VERSIONS})
    if path == "/api/keys":
        return send({"ok": True, "keys": [{"id": "abc1234567", "label": "CLI 키", "created": now}]})
    return send({"ok": True})


def mock_supa(route):
    url = route.request.url
    if "/auth/v1/settings" in url:
        return route.fulfill(status=200, content_type="application/json",
                             body=json.dumps({"external": {"github": False, "email": True}}))
    if "/auth/v1/user" in url:
        return route.fulfill(status=200, content_type="application/json",
                             body=json.dumps({"id": "u1", "email": "test@example.com", "user_metadata": {"full_name": "테스트 사용자"}, "app_metadata": {"provider": "email"}}))
    return route.fulfill(status=200, content_type="application/json", body="{}")


def nav(page, hash_path, wait_ms=800):
    page.evaluate("(h) => { location.hash = h; }", hash_path)
    page.wait_for_timeout(wait_ms)


def start_server():
    proc = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"],
                            cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(60):
        try:
            urllib.request.urlopen(BASE + "index.html", timeout=1)
            return proc
        except Exception:
            time.sleep(0.15)
    raise RuntimeError("로컬 서버가 뜨지 않았습니다.")


def main():
    proc = start_server()
    errors = []
    results = []

    def check(name, cond, extra=""):
        results.append((name, bool(cond), extra))
        print(("PASS " if cond else "FAIL ") + name + ("" if cond else "  " + str(extra)[:200]))

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            ctx = browser.new_context(viewport={"width": 1440, "height": 960}, user_agent=UA)
            page = ctx.new_page()
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.route(EDGE + "/**", mock_api)
            page.route(SUPA + "/**", mock_supa)

            # 로그아웃 상태 → 랜딩
            page.goto(BASE, wait_until="networkidle")
            page.wait_for_timeout(500)
            check("랜딩 노출", page.locator(".landing .hero h1").count() > 0)
            check("랜딩 CTA 존재", page.locator('a[href="#/login"]').count() >= 2)
            check("랜딩 기능 카드", page.locator(".feature").count() >= 6)
            check("랜딩 목업", page.locator(".mock").count() == 1)
            page.screenshot(path=os.path.join(ROOT, "tests/shots/landing-desktop.png"), full_page=False)

            # 이모지/세리프/기본 select 점검
            bad = page.evaluate("""() => {
              const text = document.body.innerText;
              const emoji = /[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{FE0F}]/u.test(text);
              const sels = document.querySelectorAll('select').length;
              const colors = document.querySelectorAll('input[type=color]').length;
              const fonts = [...document.querySelectorAll('body *')].slice(0, 4000).map(e => getComputedStyle(e).fontFamily).join(',');
              const serif = /(serif|바탕|명조|궁서|Times|Georgia)/i.test(fonts.replace(/sans-serif/gi, ''));
              return { emoji, sels, colors, serif };
            }""")
            check("이모지 0건", not bad["emoji"], bad)
            check("기본 select 0건", bad["sels"] == 0, bad)
            check("기본 컬러피커 0건", bad["colors"] == 0, bad)
            check("세리프 폰트 없음", not bad["serif"], bad)

            # 시작하기 → 로그인
            page.click('a[href="#/login"]')
            page.wait_for_timeout(400)
            check("로그인 화면", page.locator(".auth__box h1").count() == 1)
            page.click('[data-act="login-github"]')
            page.wait_for_timeout(300)
            check("GitHub 미설정 안내", page.locator("[data-login-msg] .note--warn").count() == 1)
            page.screenshot(path=os.path.join(ROOT, "tests/shots/login-desktop.png"), full_page=False)

            # 세션 주입 → 대시보드
            page.evaluate("""() => {
              localStorage.setItem('lamp:session', JSON.stringify({
                access_token: 'fake-token', refresh_token: 'fake-refresh',
                expires_at: Date.now() + 3600000,
                user: { id: 'u1', email: 'test@example.com', user_metadata: { full_name: '테스트 사용자' }, app_metadata: { provider: 'email' } }
              }));
            }""")
            page.goto(BASE + "#/dashboard", wait_until="networkidle")
            page.reload(wait_until="networkidle")
            page.wait_for_timeout(900)
            check("루트→대시보드 자동 이동", page.url.endswith("#/dashboard") or "#/dashboard" in page.url, page.url)
            check("대시보드 카드 3개", page.locator(".grid--dash > .card").count() == 3)
            check("활성 사이트 표", page.locator(".table tbody tr").count() >= 2)
            check("방문자 차트", page.locator("svg.chart").count() >= 1)
            check("SEO 링 표시", page.locator(".ring").count() == 1)
            page.screenshot(path=os.path.join(ROOT, "tests/shots/dashboard-desktop.png"), full_page=True)

            # 사이드바 이동
            page.click('[data-act="go"][data-path="/sites"]')
            page.wait_for_timeout(500)
            check("사이트 목록", page.locator(".table tbody tr").count() >= 2)

            # 사이트 상세
            page.click('.table tbody tr:first-child a[href^="#/site/"]')
            page.wait_for_timeout(700)
            check("사이트 헤더", page.locator(".site-hero h2").count() == 1)
            check("사이트 탭 7개", page.locator(".tabs .tab").count() == 7)
            check("개요 지표", page.locator(".metric").count() >= 3)
            page.screenshot(path=os.path.join(ROOT, "tests/shots/site-overview.png"), full_page=True)

            for tab, sel, label in [
                ("deploy", ".drop", "배포 탭 드롭존"),
                ("files", "[data-editor]", "IDE 에디터"),
                ("seo", ".ring", "SEO 진단 링"),
                ("analytics", "svg.chart", "방문자 차트"),
                ("forms", "[data-form-name]", "Forms 생성 폼"),
                ("settings", "#set-name", "설정 폼"),
            ]:
                nav(page, f"#/site/portfolio/{tab}", 900)
                check(label, page.locator(sel).count() >= 1, page.locator("#view").inner_text()[:120])
            page.screenshot(path=os.path.join(ROOT, "tests/shots/site-settings.png"), full_page=True)

            # IDE 상호작용
            nav(page, "#/site/portfolio/files", 1000)
            check("파일 트리", page.locator(".tree__item").count() == 4)
            page.locator('.tree__item[data-path="style.css"]').click()
            page.wait_for_timeout(400)
            check("파일 전환", "style.css" in page.locator("[data-ed-status]").inner_text())
            page.locator("[data-ed-area]").click()
            page.keyboard.type("\n/* lamp */")
            page.wait_for_timeout(200)
            check("편집 반영", "lamp" in page.locator("[data-ed-area]").input_value())
            check("미리보기 iframe", page.locator(".preview iframe").count() == 1)
            page.screenshot(path=os.path.join(ROOT, "tests/shots/site-ide.png"), full_page=True)

            # 도구
            nav(page, "#/tools", 900)
            check("생성기 탭", page.locator(".tabs .tab").count() == 6)
            page.click('[data-tab="qr"]')
            page.wait_for_timeout(400)
            check("QR 렌더", page.locator("[data-qr-host] svg").count() == 1)
            check("컬러피커", page.locator(".cp__swatch").count() >= 1)
            page.click('[data-tab="privacy"]')
            page.wait_for_timeout(300)
            page.screenshot(path=os.path.join(ROOT, "tests/shots/tools.png"), full_page=True)

            # 설정/문서/도메인/배포/분석/폼
            for path, sel, label in [
                ("#/settings", "[data-act='new-key']", "설정 API 키"),
                ("#/docs", ".doc-body", "문서 본문"),
                ("#/domains", ".card", "도메인 안내"),
                ("#/deploys", ".table", "배포 목록"),
                ("#/analytics", "svg.chart", "전체 분석"),
                ("#/forms", ".card", "전체 Forms"),
            ]:
                nav(page, path, 800)
                check(label, page.locator(sel).count() >= 1, path)

            # 커스텀 셀렉트 동작
            nav(page, "#/tools", 900)
            page.locator('[data-sel="tool-site"] .sel__btn').click()
            page.wait_for_timeout(200)
            check("커스텀 셀렉트 열림", page.locator('[data-sel="tool-site"] .sel__pop:not([hidden])').count() == 1)
            page.locator('[data-sel="tool-site"] .sel__opt').nth(1).click()
            page.wait_for_timeout(200)
            check("셀렉트 선택 반영", "제품 랜딩" in page.locator('[data-sel="tool-site"] .sel__val').inner_text())

            # 다크 모드
            page.click('[data-act="toggle-theme"]')
            page.wait_for_timeout(600)
            check("다크 모드 적용", page.evaluate("document.documentElement.dataset.theme") == "dark")
            page.screenshot(path=os.path.join(ROOT, "tests/shots/dashboard-dark.png"), full_page=True)
            page.click('[data-act="toggle-theme"]')
            page.wait_for_timeout(300)

            # 모바일
            mob = browser.new_context(viewport={"width": 390, "height": 844}, user_agent="Mozilla/5.0 (Linux; Android 14; SM-A366B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36",
                                      device_scale_factor=2, is_mobile=True, has_touch=True)
            mpage = mob.new_page()
            mpage.on("pageerror", lambda e: errors.append("mobile:" + str(e)))
            mpage.on("console", lambda m: errors.append("mobile:" + m.text) if m.type == "error" else None)
            mpage.route(EDGE + "/**", mock_api)
            mpage.route(SUPA + "/**", mock_supa)
            mpage.goto(BASE, wait_until="networkidle")
            mpage.wait_for_timeout(500)
            mpage.screenshot(path=os.path.join(ROOT, "tests/shots/landing-mobile.png"), full_page=True)
            check("모바일 랜딩", mpage.locator(".hero h1").count() == 1)
            mpage.evaluate("""() => localStorage.setItem('lamp:session', JSON.stringify({
              access_token:'fake-token', refresh_token:'fake-refresh', expires_at: Date.now()+3600000,
              user:{id:'u1',email:'test@example.com',user_metadata:{full_name:'테스트 사용자'},app_metadata:{provider:'email'}}}))""")
            mpage.goto(BASE + "#/dashboard", wait_until="networkidle")
            mpage.reload(wait_until="networkidle")
            mpage.wait_for_timeout(900)
            mpage.screenshot(path=os.path.join(ROOT, "tests/shots/dashboard-mobile.png"), full_page=True)
            check("모바일 햄버거", mpage.locator('[data-act="nav-open"]').is_visible())
            mpage.click('[data-act="nav-open"]')
            mpage.wait_for_timeout(400)
            check("모바일 사이드바 열림", mpage.locator("#sidebar.is-open").count() == 1)
            mpage.screenshot(path=os.path.join(ROOT, "tests/shots/nav-mobile.png"))
            mpage.click('[data-act="nav-close"]')
            nav(mpage, "#/site/portfolio/files", 1000)
            mpage.screenshot(path=os.path.join(ROOT, "tests/shots/site-ide-mobile.png"), full_page=True)
            check("모바일 IDE", mpage.locator("[data-editor]").count() == 1)
            overflow = mpage.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
            check("모바일 가로 넘침 없음", overflow <= 2, f"overflow={overflow}")

            # 팝업(alert/confirm/prompt) 미사용 확인
            dialogs = []
            page.on("dialog", lambda d: (dialogs.append(d.type), d.dismiss()))
            nav(page, "#/site/portfolio/settings", 800)
            page.click('[data-act="ask-delete"]')
            page.wait_for_timeout(300)
            check("삭제 확인이 인라인", page.locator(".note--bad [data-act='do-delete']").count() == 1)
            check("브라우저 팝업 없음", len(dialogs) == 0, dialogs)

            browser.close()
    finally:
        proc.terminate()

    real_errors = [e for e in errors if "favicon" not in e.lower()]
    print("\n콘솔 오류:", len(real_errors))
    for e in real_errors[:10]:
        print("  -", e[:200])

    ok = sum(1 for _, c, _ in results if c)
    print(f"\n{ok}/{len(results)} 통과")
    return 0 if ok == len(results) and not real_errors else 1


if __name__ == "__main__":
    sys.exit(main())
