#!/usr/bin/env python3
"""Lamp Edge 워커를 코드만 갱신해 배포한다.

기존 시크릿(ADMIN_KEY, SECRET_SALT)은 keep_bindings 로 보존하고,
KV 바인딩과 일반 변수는 metadata 로 다시 지정한다. (값은 바뀌지 않는다)

사용:
  python3 deploy_worker_keep.py --token <CF_TOKEN> --account <ACCOUNT_ID>
"""
import argparse
import json
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
API = "https://api.cloudflare.com/client/v4"
SCRIPT = "lamp-edge"
KV_ID = "623e2ab5da254c248b4df29146bf1452"


def multipart(fields, files):
    boundary = "----lampkeep7f3a9c"
    body = b""
    for name, value in fields.items():
        body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode()
    for name, filename, ctype, data in files:
        body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"{filename}\"\r\nContent-Type: {ctype}\r\n\r\n".encode()
        body += data + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    return body, f"multipart/form-data; boundary={boundary}"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--token", default=os.environ.get("CF_API_TOKEN"))
    p.add_argument("--account", default=os.environ.get("CF_ACCOUNT_ID"))
    p.add_argument("--kv", default=KV_ID)
    p.add_argument("--base", default="https://lamp-edge.helpaboutflux.workers.dev")
    a = p.parse_args()
    if not (a.token and a.account):
        sys.exit("token/account 필요")

    meta = {
        "main_module": "lamp-edge.js",
        "compatibility_date": "2024-11-01",
        "bindings": [
            {"type": "kv_namespace", "name": "LAMP_KV", "namespace_id": a.kv},
            {"type": "plain_text", "name": "SUPABASE_URL", "text": "https://foisgisqbyaykrlddvio.supabase.co"},
            {"type": "plain_text", "name": "SUPABASE_ANON_KEY", "text": "sb_publishable_HyWOEZAtTR0r2lUYBjK6Sw_cn-yUdXD"},
            {"type": "plain_text", "name": "PUBLIC_BASE", "text": a.base},
        ],
        "keep_bindings": ["secret_text"],
        "observability": {"enabled": True},
    }
    with open(os.path.join(HERE, "lamp-edge.js"), "rb") as f:
        src = f.read()
    body, ctype = multipart({"metadata": json.dumps(meta)},
                            [("lamp-edge.js", "lamp-edge.js", "application/javascript+module", src)])
    req = urllib.request.Request(f"{API}/accounts/{a.account}/workers/scripts/{SCRIPT}",
                                 data=body, method="PUT")
    req.add_header("Authorization", "Bearer " + a.token)
    req.add_header("Content-Type", ctype)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            res = json.loads(r.read().decode())
            print("deployed:", res["result"].get("modified_on"))
    except urllib.error.HTTPError as e:
        print("실패", e.code, e.read().decode()[:800])
        sys.exit(1)


if __name__ == "__main__":
    main()
