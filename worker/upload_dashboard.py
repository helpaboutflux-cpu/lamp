#!/usr/bin/env python3
"""Lamp 대시보드 정적 파일을 엔진 KV에 한 덩어리로 올린다(쓰기 1회).

사용:
  python3 upload_dashboard.py --token ... --account ... --kv ...
"""
import argparse
import base64
import json
import os
import sys
import urllib.request

API = "https://api.cloudflare.com/client/v4"
SKIP_DIRS = {".git", "node_modules", "tests", "worker", ".github", "docs", "downloads"}
SKIP_FILES = {"package.json", "supabase_schema.sql", "README.md", ".gitignore", ".nojekyll"}


def collect(root):
    out = {}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        for f in filenames:
            if f in SKIP_FILES or f.startswith("."):
                continue
            full = os.path.join(dirpath, f)
            rel = os.path.relpath(full, root).replace(os.sep, "/")
            with open(full, "rb") as fh:
                out[rel] = base64.b64encode(fh.read()).decode()
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--token", default=os.environ.get("CF_API_TOKEN"))
    p.add_argument("--account", default=os.environ.get("CF_ACCOUNT_ID"))
    p.add_argument("--kv", default=os.environ.get("LAMP_KV_ID"))
    p.add_argument("--dir", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    a = p.parse_args()
    if not (a.token and a.account and a.kv):
        sys.exit("token/account/kv 필요")

    files = collect(os.path.abspath(a.dir))
    payload = json.dumps(files)
    print("파일", len(files), "개 ·", round(len(payload) / 1024), "KB")
    url = f"{API}/accounts/{a.account}/storage/kv/namespaces/{a.kv}/values/dash:files"
    req = urllib.request.Request(url, data=payload.encode(), method="PUT")
    req.add_header("Authorization", "Bearer " + a.token)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            print("업로드 완료", r.status)
    except urllib.error.HTTPError as e:
        print("실패", e.code, e.read().decode()[:400])
        sys.exit(1)


if __name__ == "__main__":
    main()
