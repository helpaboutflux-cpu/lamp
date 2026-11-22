#!/usr/bin/env python3
"""Lamp 대시보드를 Cloudflare Pages에 직접 업로드한다(wrangler 없이).

사용:
  CF_API_TOKEN=... CF_ACCOUNT_ID=... python3 deploy_pages.py [--project lamp] [--dir ..]

정적 파일만 올린다(테스트·워커·문서는 제외).
"""
import argparse
import hashlib
import json
import mimetypes
import os
import sys
import urllib.request
import uuid

API = "https://api.cloudflare.com/client/v4"
SKIP_DIRS = {".git", "node_modules", "tests", "worker", ".github", "docs", "downloads"}
SKIP_FILES = {"package.json", "supabase_schema.sql", "README.md", ".gitignore", ".nojekyll"}


def collect(root):
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        for f in filenames:
            if f in SKIP_FILES or f.startswith("."):
                continue
            full = os.path.join(dirpath, f)
            rel = "/" + os.path.relpath(full, root).replace(os.sep, "/")
            with open(full, "rb") as fh:
                out.append((rel, fh.read()))
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--token", default=os.environ.get("CF_API_TOKEN"))
    p.add_argument("--account", default=os.environ.get("CF_ACCOUNT_ID"))
    p.add_argument("--project", default="lamp")
    p.add_argument("--branch", default="main")
    p.add_argument("--dir", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    p.add_argument("--message", default="Lamp 대시보드 배포")
    a = p.parse_args()
    if not (a.token and a.account):
        sys.exit("CF_API_TOKEN / CF_ACCOUNT_ID 필요")

    files = collect(os.path.abspath(a.dir))
    manifest = {}
    blobs = {}
    for rel, data in files:
        digest = hashlib.sha256(data).hexdigest()
        manifest[rel] = digest
        blobs[digest] = (os.path.basename(rel), data)
    print("업로드 파일:", len(files), "개 / 고유 조각:", len(blobs))

    boundary = "----lamp" + uuid.uuid4().hex
    body = b""
    fields = {"branch": a.branch, "commit_message": a.message, "manifest": json.dumps(manifest)}
    for k, v in fields.items():
        body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
    for digest, (name, data) in blobs.items():
        ctype = mimetypes.guess_type(name)[0] or "application/octet-stream"
        body += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{digest}\"; filename=\"{name}\"\r\n"
                 f"Content-Type: {ctype}\r\n\r\n").encode() + data + b"\r\n"
    body += f"--{boundary}--\r\n".encode()

    req = urllib.request.Request(f"{API}/accounts/{a.account}/pages/projects/{a.project}/deployments", data=body, method="POST")
    req.add_header("Authorization", "Bearer " + a.token)
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    try:
        with urllib.request.urlopen(req, timeout=240) as r:
            res = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        print("배포 실패", e.code, e.read().decode()[:600])
        sys.exit(1)
    print("배포 완료:", res["result"].get("url"), "id=", res["result"].get("id"))


if __name__ == "__main__":
    main()
