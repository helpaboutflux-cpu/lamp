#!/usr/bin/env python3
"""Chromium 실행에 필요한 Debian 라이브러리를 사용자 영역에 내려받아 푼다.

root 권한이 없는 환경에서 Playwright chromium을 띄우기 위한 준비 스크립트.
Packages 인덱스를 받아 의존성을 재귀적으로 해석하고 .deb을 /workspace/.libs/root 에 푼다.
"""
import lzma
import os
import re
import subprocess
import sys
import urllib.request

LIB = "/workspace/.libs"
ROOT = os.path.join(LIB, "root")
CACHE = os.path.join(LIB, "debs")
MIRRORS = ["http://deb.debian.org/debian", "http://security.debian.org/debian-security"]
SUITES = [("bookworm", "main"), ("bookworm-updates", "main"), ("bookworm-security", "main")]

ROOTS = [
    "libnss3", "libnspr4", "libatk1.0-0", "libatk-bridge2.0-0", "libcups2", "libdbus-1-3",
    "libdrm2", "libgbm1", "libxkbcommon0", "libxkbcommon-x11-0", "libxcomposite1", "libxdamage1",
    "libxfixes3", "libxrandr2", "libpango-1.0-0", "libcairo2", "libasound2", "libatspi2.0-0",
    "libx11-6", "libxcb1", "libxext6", "libxi6", "libxtst6", "libglib2.0-0", "libexpat1",
    "libuuid1", "libxau6", "libxdmcp6", "libbsd0", "libmd0", "libffi8", "libpcre2-8-0",
    "libselinux1", "libpixman-1-0", "libpng16-16", "libfreetype6", "libfontconfig1",
    "libxrender1", "libx11-xcb1", "libepoxy0", "libharfbuzz0b", "libgraphite2-3", "libbrotli1",
    "libzstd1", "libgcrypt20", "libgpg-error0", "libsystemd0", "libcap2", "libmount1",
    "libblkid1", "libfribidi0", "libthai0", "libdatrie1", "libxcb-render0", "libxcb-shm0",
    "libxcb-glx0", "libxcb-dri2-0", "libxcb-dri3-0", "libxcb-present0", "libxcb-sync1",
    "libxcb-xfixes0", "libxshmfence1", "libwayland-client0", "libwayland-server0", "liblz4-1",
]


def fetch(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return dest
    req = urllib.request.Request(url, headers={"User-Agent": "lamp-setup"})
    with urllib.request.urlopen(req, timeout=180) as r, open(dest, "wb") as f:
        f.write(r.read())
    return dest


def load_index():
    pkgs = {}
    for mirror, (suite, comp) in [(MIRRORS[1], SUITES[2]), (MIRRORS[0], SUITES[0]), (MIRRORS[0], SUITES[1])]:
        url = f"{mirror}/dists/{suite}/{comp}/binary-amd64/Packages.xz"
        path = os.path.join(CACHE, f"Packages-{suite}.xz")
        try:
            fetch(url, path)
        except Exception as e:
            print("index fail", url, e)
            continue
        data = lzma.open(path, "rt", encoding="utf-8", errors="replace").read()
        for block in data.split("\n\n"):
            if not block.strip():
                continue
            cur = {}
            key = None
            for line in block.split("\n"):
                if line.startswith(" ") and key:
                    cur[key] += " " + line.strip()
                    continue
                if ":" in line:
                    k, v = line.split(":", 1)
                    key = k.strip()
                    cur[key] = v.strip()
            name = cur.get("Package")
            if name and name not in pkgs:
                pkgs[name] = cur
            elif name and cur.get("Version", "") > pkgs[name].get("Version", ""):
                pkgs[name] = cur
    print("패키지 인덱스:", len(pkgs))
    return pkgs


def dep_names(depstr):
    out = []
    for part in (depstr or "").split(","):
        part = part.strip()
        if not part:
            continue
        # 대체 의존(a | b)은 첫 항목만
        first = part.split("|")[0].strip()
        m = re.match(r"([a-zA-Z0-9.+\-]+)", first)
        if m:
            out.append(m.group(1))
    return out


def resolve(pkgs, roots):
    want = set()
    stack = list(roots)
    while stack:
        name = stack.pop()
        if name in want:
            continue
        p = pkgs.get(name)
        if not p:
            print("  ! 인덱스에 없음:", name)
            continue
        want.add(name)
        for d in dep_names(p.get("Depends", "")) + dep_names(p.get("Pre-Depends", "")):
            if d not in want:
                stack.append(d)
    return want


def main():
    os.makedirs(CACHE, exist_ok=True)
    os.makedirs(ROOT, exist_ok=True)
    pkgs = load_index()
    if not pkgs:
        sys.exit("인덱스를 받지 못했습니다.")
    want = resolve(pkgs, ROOTS)
    print("필요 패키지:", len(want))
    for name in sorted(want):
        p = pkgs[name]
        fn = p["Filename"]
        dest = os.path.join(CACHE, os.path.basename(fn))
        if not os.path.exists(dest) or os.path.getsize(dest) == 0:
            ok = False
            for mirror in MIRRORS:
                try:
                    fetch(f"{mirror}/{fn}", dest)
                    ok = True
                    break
                except Exception:
                    # 보안 저장소 경로(pool/updates)는 별도 미러에 있다
                    try:
                        alt = f"{MIRRORS[1]}/{fn.replace('/updates/', '/')}" if "updates" in fn else None
                        if alt:
                            fetch(alt, dest)
                            ok = True
                            break
                    except Exception:
                        continue
            if not ok:
                print("  실패(다운로드)", name)
                continue
        try:
            subprocess.run(["dpkg-deb", "-x", dest, ROOT], check=True)
        except Exception as e:
            print("  실패(압축)", name, e)
    print("완료:", ROOT)


if __name__ == "__main__":
    main()
