#!/usr/bin/env python3
"""Lamp Edge 워커를 Cloudflare API로 배포한다.

사용:
  python3 deploy_worker.py --token <CF_TOKEN> --account <ACCOUNT_ID> \
      --kv <KV_NAMESPACE_ID> --admin-key <ADMIN_KEY> --salt <SECRET_SALT>

시크릿은 CLI 기록에 남지 않도록 환경변수(CF_API_TOKEN, CF_ACCOUNT_ID,
LAMP_KV_ID, LAMP_ADMIN_KEY, LAMP_SECRET_SALT)로도 받는다.
"""
import argparse
import json
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
API = "https://api.cloudflare.com/client/v4"
SCRIPT = "lamp-edge"


def multipart(fields, files):
    boundary = "----lampboundary7f3a9c"
    body = b""
    for name, value in fields.items():
        body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode()
    for name, filename, ctype, data in files:
        body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"{filename}\"\r\nContent-Type: {ctype}\r\n\r\n".encode()
        body += data + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    return body, f"multipart/form-data; boundary={boundary}"


def call(method, path, token, data=None, ctype=None):
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Authorization", "Bearer " + token)
    if ctype:
        req.add_header("Content-Type", ctype)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return {"success": False, "http": e.code, "body": e.read().decode()[:800]}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--token", default=os.environ.get("CF_API_TOKEN"))
    p.add_argument("--account", default=os.environ.get("CF_ACCOUNT_ID"))
    p.add_argument("--kv", default=os.environ.get("LAMP_KV_ID"))
    p.add_argument("--admin-key", default=os.environ.get("LAMP_ADMIN_KEY"))
    p.add_argument("--salt", default=os.environ.get("LAMP_SECRET_SALT"))
    p.add_argument("--supabase-url", default="https://foisgisqbyaykrlddvio.supabase.co")
    p.add_argument("--supabase-key", default="sb_publishable_HyWOEZAtTR0r2lUYBjK6Sw_cn-yUdXD")
    p.add_argument("--base", default="https://lamp-edge.helpaboutflux.workers.dev")
    a = p.parse_args()
    if not (a.token and a.account and a.kv and a.admin_key and a.salt):
        sys.exit("token/account/kv/admin-key/salt 가 필요합니다.")

    meta = {
        "main_module": "lamp-edge.js",
        "compatibility_date": "2024-11-01",
        "bindings": [
            {"type": "kv_namespace", "name": "LAMP_KV", "namespace_id": a.kv},
            {"type": "plain_text", "name": "SUPABASE_URL", "text": a.supabase_url},
            {"type": "plain_text", "name": "SUPABASE_ANON_KEY", "text": a.supabase_key},
            {"type": "plain_text", "name": "PUBLIC_BASE", "text": a.base},
            {"type": "secret_text", "name": "ADMIN_KEY", "text": a.admin_key},
            {"type": "secret_text", "name": "SECRET_SALT", "text": a.salt},
        ],
        "observability": {"enabled": True},
    }
    with open(os.path.join(HERE, "lamp-edge.js"), "rb") as f:
        src = f.read()
    body, ctype = multipart({"metadata": json.dumps(meta)}, [("lamp-edge.js", "lamp-edge.js", "application/javascript+module", src)])
    res = call("PUT", f"/accounts/{a.account}/workers/scripts/{SCRIPT}", a.token, body, ctype)
    if not res.get("success"):
        print(json.dumps(res)[:1500])
        sys.exit(1)
    print("deployed:", res["result"].get("modified_on"))

    # workers.dev 라우트 활성화
    r = call("POST", f"/accounts/{a.account}/workers/scripts/{SCRIPT}/subdomain", a.token,
             json.dumps({"enabled": True, "previews_enabled": True}).encode(), "application/json")
    print("subdomain:", json.dumps(r.get("result", r))[:200])


if __name__ == "__main__":
    main()
