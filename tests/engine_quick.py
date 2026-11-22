#!/usr/bin/env python3
"""Lamp 엔진 최소 확인 — KV 연산을 아껴 배포·규칙·롤백·잠금만 빠르게 본다.

  LAMP_ADMIN_KEY=... python3 tests/engine_quick.py

사이트 1개를 만들고 지우는 동안 KV 쓰기는 10회 안팎입니다.
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

B = os.environ.get("LAMP_BASE", "https://lamp-edge.helpaboutflux.workers.dev")
K = os.environ.get("LAMP_ADMIN_KEY", "lampadm_9f4cChZqT2vRn7YbKp3LsDxW")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"
SLUG = os.environ.get("LAMP_TEST_SLUG", "eng-check")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


OP = urllib.request.build_opener(NoRedirect)


def rq(method, path, body=None, headers=None, raw=False):
    h = {"x-lamp-key": K, "user-agent": UA}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        h["content-type"] = "application/json"
    if headers:
        h.update(headers)
    req = urllib.request.Request(B + path, data=data, method=method, headers=h)
    try:
        r = OP.open(req, timeout=40)
        payload = r.read()
        return r.status, (payload if raw else json.loads(payload)), r.headers
    except urllib.error.HTTPError as e:
        payload = e.read()
        try:
            return e.code, json.loads(payload), e.headers
        except Exception:
            return e.code, payload, e.headers


ok = 0
bad = 0


def ck(name, cond, extra=""):
    global ok, bad
    if cond:
        ok += 1
        print("PASS", name)
    else:
        bad += 1
        print("FAIL", name, str(extra)[:200])


def main():
    rq("DELETE", "/api/sites/" + SLUG)
    ck("create", rq("POST", "/api/sites", {"slug": SLUG, "name": "엔진 확인"})[0] in (201, 409))
    files = [
        {"path": "index.html", "text": "<h1>v1</h1>"},
        {"path": "_redirects", "text": "/old /new 301\n"},
        {"path": "_headers", "text": "/*\n  X-Frame-Options: DENY\n"},
        {"path": "404.html", "text": "<h1>custom404</h1>"}
    ]
    ck("deploy v1", rq("POST", f"/api/sites/{SLUG}/deploy", {"files": files, "message": "v1"})[0] == 200)

    c, b, h = rq("GET", f"/{SLUG}/old", raw=True)
    ck("redirect", c == 301 and str(h.get("location", "")).endswith("/new"), f"{c} {h.get('location')}")
    c, b, h = rq("GET", f"/{SLUG}/", raw=True)
    ck("headers", h.get("x-frame-options") == "DENY", h.get("x-frame-options"))
    c, b, h = rq("GET", f"/{SLUG}/zzz", raw=True)
    ck("custom 404", c == 404 and b"custom404" in b, b[:40])

    rq("POST", f"/api/sites/{SLUG}/deploy", {"files": [{"path": "index.html", "text": "<h1>v2</h1>"}], "message": "v2"})
    c, b, _ = rq("GET", f"/{SLUG}/", raw=True)
    ck("v2 live", b"v2" in b)

    r = rq("POST", f"/api/sites/{SLUG}/rollback", {"version": 1})[1]
    ck("rollback", r["site"]["current"] == 1)
    c, b, _ = rq("GET", f"/{SLUG}/", raw=True)
    ck("v1 after rollback", b"v1" in b and b"v2" not in b)
    c, b, _ = rq("GET", f"/{SLUG}/old", raw=True)
    ck("redirect after rollback", c == 301)
    c, z, _ = rq("GET", f"/api/sites/{SLUG}/zip/1", raw=True)
    ck("zip", c == 200 and z[:2] == b"PK")

    r = rq("PATCH", f"/api/sites/{SLUG}", {"password": "lamp1234"})[1]
    ck("password set", r["site"]["hasPassword"] is True)
    c, b, _ = rq("GET", f"/{SLUG}/", raw=True)
    ck("gate", b"v1" not in b and "비밀번호".encode() in b)

    body = urllib.parse.urlencode({"slug": SLUG, "pw": "lamp1234"}).encode()
    req = urllib.request.Request(B + "/__lamp/unlock", data=body, method="POST",
                                 headers={"content-type": "application/x-www-form-urlencoded", "user-agent": UA})
    try:
        resp = OP.open(req, timeout=30)
    except urllib.error.HTTPError as e:
        resp = e
    cookie = resp.headers.get("set-cookie", "").split(";")[0]
    rq("PATCH", f"/api/sites/{SLUG}", {"password": ""})
    c, b, _ = rq("GET", f"/{SLUG}/", raw=True, headers={"cookie": cookie})
    ck("unlock then open", b"v1" in b)

    ck("delete", rq("DELETE", "/api/sites/" + SLUG)[0] == 200)
    print(f"\n{ok} passed, {bad} failed")
    return 0 if bad == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
