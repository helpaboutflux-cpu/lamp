#!/usr/bin/env python3
"""Lamp 라이브 E2E — 실제 엔진과 Supabase로 최소 경로만 확인한다.

KV 연산을 아끼기 위해 사이트 1개 생성 + 배포 1회 + 조회만 수행한다.
이미 있으면 다시 만들지 않는다.

  python3 tests/live_e2e.py
"""
import os
import sys
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get("LAMP_URL", "https://lamp-edge.helpaboutflux.workers.dev/")
EDGE = "https://lamp-edge.helpaboutflux.workers.dev"
EMAIL = os.environ.get("LAMP_E2E_EMAIL", "lamp.e2e.test@example.com")
PASSWORD = os.environ.get("LAMP_E2E_PW", "LampTest!2026")
SLUG = "lamp-demo"
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots")

ok = 0
bad = 0


def check(name, cond, extra=""):
    global ok, bad
    if cond:
        ok += 1
        print("PASS", name)
    else:
        bad += 1
        print("FAIL", name, str(extra)[:220])


def main():
    os.makedirs(SHOTS, exist_ok=True)
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 960})
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        # 1) 랜딩
        page.goto(BASE, wait_until="networkidle")
        page.wait_for_timeout(800)
        check("랜딩 노출", page.locator(".hero h1").count() == 1)

        # 2) 로그인 (이메일 + 비밀번호)
        page.click('a[href="#/login"]')
        page.wait_for_timeout(500)
        page.click('[data-act="toggle-password"]')
        page.wait_for_timeout(200)
        page.fill("[data-email]", EMAIL)
        page.fill("[data-password]", PASSWORD)
        page.click('[data-act="email-send"]')
        page.wait_for_timeout(3500)
        check("로그인 후 대시보드", "#/dashboard" in page.url and page.locator(".grid--dash").count() == 1, page.url)
        check("계정 이름 표시", "테스트" in page.locator("#acctName").inner_text() or "lamp" in page.locator("#acctMail").inner_text().lower(), page.locator("#acctName").inner_text())
        page.screenshot(path=os.path.join(SHOTS, "live-dashboard.png"), full_page=True)

        # 3) 사이트 생성 (없을 때만)
        has_site = page.locator(f'a[href="#/site/{SLUG}"]').count() > 0
        if not has_site:
            page.click('[data-act="quick-deploy"]')
            page.wait_for_timeout(400)
            page.fill("[data-ns-name]", "Lamp 데모")
            page.fill("[data-ns-slug]", SLUG)
            page.click('[data-act="create-site"]')
            page.wait_for_timeout(3000)
            check("사이트 생성", f"/site/{SLUG}" in page.url, page.url)
        else:
            page.goto(BASE + f"#/site/{SLUG}/deploy", wait_until="networkidle")
            page.wait_for_timeout(800)
            check("기존 사이트 재사용", True)

        # 4) 템플릿 배포 (버전이 없을 때만)
        if not has_site:
            page.click('[data-act="open-templates"]')
            page.wait_for_timeout(500)
            page.click('[data-act="tpl-use"]')
            page.wait_for_timeout(6000)
            body = page.locator("[data-panel-host]").inner_text()
            check("배포 완료", "배포 완료" in body or "배포하지 못했습니다" in body, body[:160])
            check("배포 성공", "배포 완료" in body, body[:160])
            page.screenshot(path=os.path.join(SHOTS, "live-deploy.png"), full_page=True)

        # 5) 배포된 사이트 확인
        page.wait_for_timeout(1500)
        res = page.goto(f"{EDGE}/{SLUG}/", wait_until="domcontentloaded")
        check("배포 사이트 200", res.status == 200, res.status if res else "no response")
        text = page.locator("body").inner_text()
        check("배포 사이트 내용", len(text) > 20, text[:80])
        page.screenshot(path=os.path.join(SHOTS, "live-site.png"))

        # 6) 대시보드/사이트 상세 화면
        page.goto(BASE + "#/dashboard", wait_until="networkidle")
        page.wait_for_timeout(2500)
        page.screenshot(path=os.path.join(SHOTS, "live-dashboard-site.png"), full_page=True)
        page.goto(BASE + f"#/site/{SLUG}", wait_until="networkidle")
        page.wait_for_timeout(2500)
        check("사이트 개요", page.locator(".site-hero h2").count() == 1)
        page.screenshot(path=os.path.join(SHOTS, "live-site-overview.png"), full_page=True)

        # 7) IDE / SEO / 분석 탭
        for tab, sel, name in [("files", "[data-editor]", "IDE"), ("seo", ".ring", "SEO"), ("analytics", "svg.chart", "분석")]:
            page.goto(BASE + f"#/site/{SLUG}/{tab}", wait_until="networkidle")
            page.wait_for_timeout(1800)
            check(f"{name} 탭", page.locator(sel).count() >= 1, page.locator("#view").inner_text()[:100])
            page.screenshot(path=os.path.join(SHOTS, f"live-{tab}.png"), full_page=True)

        # 8) 모바일
        mob = b.new_context(storage_state=ctx.storage_state(),
                            viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True,
                            user_agent="Mozilla/5.0 (Linux; Android 14; SM-A366B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36",
                            device_scale_factor=2)
        m = mob.new_page()
        m.goto(BASE + "#/dashboard", wait_until="networkidle")
        m.wait_for_timeout(2500)
        check("모바일 대시보드", m.locator(".grid--dash").count() == 1)
        overflow = m.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
        check("모바일 가로 넘침 없음", overflow <= 2, f"overflow={overflow}")
        m.screenshot(path=os.path.join(SHOTS, "live-mobile-dashboard.png"), full_page=True)

        real_errors = [e for e in errors if "favicon" not in e.lower()]
        check("콘솔 오류 없음", not real_errors, real_errors[:3])
        b.close()

    print(f"\n{ok}/{ok + bad} 통과")
    return 0 if bad == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
