/**
 * Lamp Edge - Lamp v1.0 정적 호스팅 엔진
 * Cloudflare Workers + Workers KV 멀티테넌트 호스팅.
 *
 * KV 연산 절약 설계 (무료 티어 일일 연산 한도 보호):
 *  - 배포 1회 = KV 쓰기 3회 (파일 번들 1 + 버전 인덱스 1 + 사이트 메타 1)
 *  - 방문자 집계는 메모리에 모았다가 시간이 바뀔 때 1회만 기록 (사이트당 시간당 1회)
 *  - 속도 제한은 요청 시 메모리 카운터를 먼저 보고, 필요할 때만 KV에 남긴다
 *  - 목록 조회(list)는 쓰지 않고 인덱스 키를 읽는다
 */

const LIMITS = {
  sitesPerUser: 10,
  bytesPerSite: 10 * 1024 * 1024,
  filesPerSite: 300,
  deploysPerMinute: 5,
  versionsKept: 20,
  bundleMax: 2 * 1024 * 1024
};

const RESERVED = new Set(['api', 'p', 'f', '__lamp', 'js', 'css', 'assets', 'favicon.ico', 'robots.txt', 'sitemap.xml']);
const DASH_PREFIXES = ['js/', 'css/', 'assets/'];
let dashCache = null;
let dashCacheAt = 0;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

const MIME = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8', json: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8', md: 'text/markdown; charset=utf-8',
  xml: 'application/xml; charset=utf-8', svg: 'image/svg+xml',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
  pdf: 'application/pdf', zip: 'application/zip',
  mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav',
  wasm: 'application/wasm', csv: 'text/csv; charset=utf-8'
};

const BOT_UA = /bot|crawler|spider|crawling|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|preview|monitor|uptime|headless|lighthouse|curl|wget|python-requests|axios/i;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': 'authorization,content-type,x-lamp-key',
  'access-control-max-age': '86400'
};

/* ------------------------------------------------------------------ */
/* 유틸                                                                */
/* ------------------------------------------------------------------ */

const enc = new TextEncoder();

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS, ...extra }
  });
}

function fail(message, status = 400, code = 'bad_request', extra = {}) {
  return json({ ok: false, error: { code, message, ...extra } }, status);
}

function html(body, status = 200) {
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmac(text, secret) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(s);
}

function parseCookies(req) {
  const out = {};
  (req.headers.get('cookie') || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i < 0) return;
    out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function guessType(path) {
  const m = /\.([a-z0-9]+)$/i.exec(path || '');
  return MIME[m ? m[1].toLowerCase() : ''] || 'application/octet-stream';
}

function isTextType(path, type) {
  return /^text\/|json|xml|svg|javascript/.test(type || guessType(path));
}

function normalizePath(p) {
  let s = String(p || '').replace(/\\/g, '/').trim();
  s = s.replace(/^\/+/, '');
  if (!s) return 'index.html';
  if (s.includes('..')) return null;
  if (s.endsWith('/')) s += 'index.html';
  return s;
}

const nowIso = () => new Date().toISOString();
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
const hourKey = (d = new Date()) => d.toISOString().slice(0, 13);

/* ------------------------------------------------------------------ */
/* 버전 저장소 (번들 우선)                                              */
/* ------------------------------------------------------------------ */

const bundleCache = new Map(); // "slug:v" -> {files: Map(path -> {text, b64, ct}), at}

function cacheBundle(key, value) {
  bundleCache.set(key, value);
  if (bundleCache.size > 8) bundleCache.delete(bundleCache.keys().next().value);
}

async function readBundle(env, slug, v) {
  const key = 'f:' + slug + ':' + v;
  const cached = bundleCache.get(key);
  if (cached) return cached;
  const raw = await env.LAMP_KV.get(key, 'json');
  if (!raw) return null;
  const map = new Map();
  for (const [p, f] of Object.entries(raw.files || {})) map.set(p, f);
  const bundle = { files: map, at: Date.now() };
  cacheBundle(key, bundle);
  return bundle;
}

/** 버전의 파일 하나를 꺼낸다. 없으면 null. */
async function readFile(env, slug, v, path) {
  const bundle = await readBundle(env, slug, v);
  if (bundle) {
    const f = bundle.files.get(path);
    if (!f) return null;
    if (f.t !== undefined) return { text: f.t, type: f.ct || guessType(path) };
    return { bytes: b64ToBytes(f.b || ''), type: f.ct || guessType(path) };
  }
  const buf = await env.LAMP_KV.get('f:' + slug + ':' + v + ':' + path, 'arrayBuffer');
  if (!buf) return null;
  return { bytes: buf, type: guessType(path) };
}

async function writeVersion(env, slug, v, files) {
  const total = files.reduce((n, f) => n + f.bytes.length, 0);
  const useBundle = total <= LIMITS.bundleMax && files.length <= 400;
  if (useBundle) {
    const obj = { v, files: {} };
    for (const f of files) {
      obj.files[f.path] = f.text !== null && f.text !== undefined && isTextType(f.path, f.type)
        ? { t: f.text, ct: f.type }
        : { b: bytesToB64(f.bytes), ct: f.type };
    }
    await env.LAMP_KV.put('f:' + slug + ':' + v, JSON.stringify(obj));
    bundleCache.delete('f:' + slug + ':' + v);
    return { mode: 'bundle', writes: 1 };
  }
  for (const f of files) {
    const key = 'f:' + slug + ':' + v + ':' + f.path;
    if (f.text !== null && f.text !== undefined && isTextType(f.path, f.type)) {
      await env.LAMP_KV.put(key, f.text, { metadata: { ct: f.type } });
    } else {
      await env.LAMP_KV.put(key, f.bytes, { metadata: { ct: f.type } });
    }
  }
  return { mode: 'files', writes: files.length };
}

async function deleteVersion(env, slug, version) {
  const bundle = await readBundle(env, slug, version.v);
  if (bundle) {
    await env.LAMP_KV.delete('f:' + slug + ':' + version.v);
    bundleCache.delete('f:' + slug + ':' + version.v);
    return;
  }
  for (const p of version.paths || []) await env.LAMP_KV.delete('f:' + slug + ':' + version.v + ':' + p);
}

/* ------------------------------------------------------------------ */
/* 인증                                                                */
/* ------------------------------------------------------------------ */

const userCache = new Map();

async function supabaseUser(token, env) {
  const hit = userCache.get(token);
  if (hit && hit.exp > Date.now()) return hit.user;
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  const res = await fetch(env.SUPABASE_URL.replace(/\/$/, '') + '/auth/v1/user', {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token }
  });
  if (!res.ok) return null;
  const u = await res.json();
  if (!u || !u.id) return null;
  const user = {
    id: u.id,
    email: u.email || '',
    name: (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.user_name || u.user_metadata.name)) || u.email || '사용자',
    avatar: (u.user_metadata && u.user_metadata.avatar_url) || '',
    provider: (u.app_metadata && u.app_metadata.provider) || 'email'
  };
  userCache.set(token, { user, exp: Date.now() + 60_000 });
  if (userCache.size > 400) userCache.delete(userCache.keys().next().value);
  return user;
}

async function apiKeyUser(key, env) {
  if (!key) return null;
  if (env.ADMIN_KEY && key === env.ADMIN_KEY) return { id: 'admin', name: 'Lamp 운영자', admin: true, email: '' };
  if (!key.startsWith('lamp_')) return null;
  const rec = await env.LAMP_KV.get('key:' + (await sha256(key)), 'json');
  if (!rec || rec.revoked) return null;
  return { id: rec.uid, name: rec.label || 'API 키', email: '', apiKey: true };
}

async function identify(req, env) {
  const auth = req.headers.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    const u = await supabaseUser(auth.slice(7).trim(), env);
    if (u) return u;
  }
  const key = req.headers.get('x-lamp-key') || '';
  if (key) return await apiKeyUser(key.trim(), env);
  return null;
}

async function requireUser(req, env) {
  const u = await identify(req, env);
  if (!u) return { error: fail('로그인이 필요합니다. Lamp 계정으로 로그인한 뒤 다시 시도해 주세요.', 401, 'unauthorized') };
  return { user: u };
}

/* ------------------------------------------------------------------ */
/* 사이트 읽기/쓰기                                                     */
/* ------------------------------------------------------------------ */

const getSite = async (env, slug) => await env.LAMP_KV.get('site:' + slug, 'json');

async function putSite(env, site) {
  site.updated = nowIso();
  await env.LAMP_KV.put('site:' + site.slug, JSON.stringify(site));
}

const userSites = async (env, uid) => (await env.LAMP_KV.get('u:' + uid + ':sites', 'json')) || [];

async function addUserSite(env, uid, slug) {
  const list = await userSites(env, uid);
  if (!list.includes(slug)) list.push(slug);
  await env.LAMP_KV.put('u:' + uid + ':sites', JSON.stringify(list));
}

async function removeUserSite(env, uid, slug) {
  const list = (await userSites(env, uid)).filter((s) => s !== slug);
  if (list.length) await env.LAMP_KV.put('u:' + uid + ':sites', JSON.stringify(list));
  else await env.LAMP_KV.delete('u:' + uid + ':sites');
}

const siteVersions = async (env, slug) => (await env.LAMP_KV.get('site:' + slug + ':versions', 'json')) || [];

function publicSite(env, site, versions) {
  const base = env.PUBLIC_BASE || '';
  const current = versions.find((v) => v.v === site.current) || versions[0] || null;
  return {
    slug: site.slug,
    name: site.name,
    url: base + '/' + site.slug + '/',
    previewUrl: current ? base + '/p/' + site.slug + '/' + current.v + '/' : '',
    created: site.created,
    updated: site.updated,
    private: !!site.private,
    hasPassword: !!site.passwordHash,
    password: site.password || '',
    current: site.current || 0,
    version: current ? current.v : 0,
    files: current ? current.files : 0,
    bytes: current ? current.bytes : 0,
    message: current ? current.message : '',
    abtest: site.abtest || null,
    customDomain: site.customDomain || '',
    github: site.github || null,
    seo: site.seo || null
  };
}

/* ------------------------------------------------------------------ */
/* 스팸/악성 검사                                                       */
/* ------------------------------------------------------------------ */

const BRANDS = ['paypal', 'apple', 'icloud', 'microsoft', 'office365', 'google', 'gmail', 'naver', 'kakao', 'netflix', 'instagram', 'facebook', 'amazon', 'coinbase', 'binance', 'upbit', 'bithumb', '국민은행', '신한은행', '우리은행', '하나은행', '농협', '카카오뱅크', '토스'];

function scanSite(files) {
  const reasons = [];
  let joined = '';
  for (const f of files) {
    if (typeof f.text === 'string' && /html?$|js$|mjs$|txt$|json$/i.test(f.path)) joined += '\n' + f.text.slice(0, 400000);
  }
  if (!joined) return reasons;
  const lower = joined.toLowerCase();

  const hasPasswordInput = /<input[^>]*type\s*=\s*["']?password/i.test(joined);
  if (hasPasswordInput) {
    const forms = joined.match(/<form[\s\S]{0,2000}?<\/form>/gi) || [];
    for (const form of forms) {
      if (!/<input[^>]*type\s*=\s*["']?password/i.test(form)) continue;
      const action = (/<form[^>]*action\s*=\s*["']([^"']*)["']/i.exec(form) || [])[1] || '';
      const external = /^https?:\/\//i.test(action) && !/lamp|workers\.dev|localhost/i.test(action);
      const brandHit = BRANDS.find((b) => form.toLowerCase().includes(b));
      if (external) reasons.push('비밀번호를 외부 주소로 보내는 로그인 폼이 있습니다 (' + action.slice(0, 80) + ')');
      else if (brandHit) reasons.push('다른 서비스의 로그인 화면을 흉내 내는 비밀번호 폼이 있습니다 (' + brandHit + ')');
      break;
    }
  }

  if (/<title>[^<]*(login|sign in|로그인)/i.test(joined)) {
    const brandHit = BRANDS.find((b) => lower.includes(b));
    if (brandHit) reasons.push('제목이 다른 서비스의 로그인 화면처럼 보입니다 (' + brandHit + ')');
  }

  if (/eval\s*\(\s*atob\s*\(/i.test(joined)) reasons.push('난독화된 코드를 실행하는 eval(atob(...)) 패턴이 있습니다');
  if (/document\.write\s*\(\s*unescape\s*\(/i.test(joined)) reasons.push('document.write(unescape(...)) 난독화 패턴이 있습니다');
  if (/new\s+Function\s*\(\s*atob\s*\(/i.test(joined)) reasons.push('new Function(atob(...)) 실행 패턴이 있습니다');
  if (/[A-Za-z0-9+/]{1200,}={0,2}/.test(joined) && /eval|Function\(|innerHTML/.test(joined)) {
    reasons.push('긴 난독화 문자열을 실행하는 스크립트가 있습니다');
  }

  const walletHits = ['seed phrase', '시드 구문', '복구 구문', 'private key', '개인키', '지갑 복구'];
  const walletHit = walletHits.find((w) => lower.includes(w));
  if (walletHit && /<input|<form/i.test(joined)) reasons.push('지갑 복구 문구나 개인키를 입력받는 화면입니다 (' + walletHit + ')');

  if (/window\.location\s*=\s*['"]https?:\/\/[^'"]*(\.apk|\.exe|\.dmg)['"]/i.test(joined)) {
    reasons.push('실행 파일을 자동으로 내려받게 하는 리다이렉트가 있습니다');
  }

  return [...new Set(reasons)];
}

/* ------------------------------------------------------------------ */
/* 속도 제한 (메모리 우선)                                              */
/* ------------------------------------------------------------------ */

const rlMemory = new Map();

async function rateLimit(env, uid, kind, max, windowSec) {
  const bucket = Math.floor(Date.now() / (windowSec * 1000));
  const memKey = kind + ':' + uid;
  const cur = rlMemory.get(memKey);
  if (cur && cur.bucket === bucket) {
    cur.n++;
    if (cur.n > max) {
      return { blocked: true, retryAfter: Math.ceil(((bucket + 1) * windowSec * 1000 - Date.now()) / 1000) };
    }
    return { blocked: false, count: cur.n };
  }
  rlMemory.set(memKey, { bucket, n: 1 });
  if (rlMemory.size > 2000) rlMemory.delete(rlMemory.keys().next().value);
  return { blocked: false, count: 1 };
}

/* ------------------------------------------------------------------ */
/* 방문자 집계 (메모리 버퍼 → 시간당 1회 기록)                          */
/* ------------------------------------------------------------------ */

const hitBuffer = new Map(); // "slug|kind|bucket[|variant]" -> 증분
let lastFlush = Date.now();
const FLUSH_AFTER_MS = 55 * 60 * 1000;

function isBot(req) {
  const ua = req.headers.get('user-agent') || '';
  if (!ua) return true;
  return BOT_UA.test(ua);
}

function bump(key, n = 1) {
  hitBuffer.set(key, (hitBuffer.get(key) || 0) + n);
}

/** 메모리에 모은 방문 수를 사이트별 값 하나(an:<slug>)에 합쳐 쓴다. 사이트당 flush 1회 = 쓰기 1회. */
async function flushHits(env) {
  const entries = [...hitBuffer.entries()];
  hitBuffer.clear();
  lastFlush = Date.now();
  const bySite = new Map();
  for (const [key, n] of entries) {
    const [slug] = key.split('|');
    if (!bySite.has(slug)) bySite.set(slug, []);
    bySite.get(slug).push([key, n]);
  }
  for (const [slug, list] of bySite) {
    try {
      const key = 'an:' + slug;
      const cur = (await env.LAMP_KV.get(key, 'json')) || { d: {}, h: {}, ab: {}, t: 0 };
      for (const [raw, n] of list) {
        const parts = raw.split('|');
        const kind = parts[1];
        const bucket = parts[2];
        if (kind === 'h') {
          cur.h[bucket] = (cur.h[bucket] || 0) + n;
        } else if (kind === 'd') {
          cur.d[bucket] = (cur.d[bucket] || 0) + n;
        } else if (kind === 'v') {
          const variant = parts[3];
          cur.ab[bucket] = cur.ab[bucket] || {};
          cur.ab[bucket][variant] = (cur.ab[bucket][variant] || 0) + n;
        }
        cur.t = (cur.t || 0) + n;
      }
      const dayCut = dayKey(new Date(Date.now() - 45 * 86400000));
      for (const k of Object.keys(cur.d)) if (k < dayCut) delete cur.d[k];
      const hourCut = hourKey(new Date(Date.now() - 72 * 3600000));
      for (const k of Object.keys(cur.h)) if (k < hourCut) delete cur.h[k];
      const abCut = dayKey(new Date(Date.now() - 30 * 86400000));
      for (const k of Object.keys(cur.ab)) if (k < abCut) delete cur.ab[k];
      await env.LAMP_KV.put(key, JSON.stringify(cur));
    } catch (e) { /* 집계 실패는 요청을 막지 않는다 */ }
  }
}

function countHit(env, ctx, slug) {
  bump(slug + '|h|' + hourKey());
  bump(slug + '|d|' + dayKey());
  if (Date.now() - lastFlush < FLUSH_AFTER_MS) return;
  const task = flushHits(env);
  if (ctx && ctx.waitUntil) ctx.waitUntil(task);
}

function countVariant(env, ctx, slug, variant) {
  bump(slug + '|v|' + dayKey() + '|' + variant);
}

/* ------------------------------------------------------------------ */
/* _redirects / _headers                                               */
/* ------------------------------------------------------------------ */

function parseRedirects(text) {
  const rules = [];
  (text || '').split(/\r?\n/).forEach((line) => {
    const s = line.trim();
    if (!s || s.startsWith('#')) return;
    const parts = s.split(/\s+/);
    if (parts.length < 2) return;
    const from = parts[0].replace(/^\/+/, '');
    rules.push({ from, to: parts[1], status: parseInt(parts[2] || '301', 10), splat: from.includes('*') });
  });
  return rules;
}

function matchRedirect(rules, path) {
  for (const r of rules) {
    if (r.splat) {
      const [pre, post] = r.from.split('*');
      if (path.startsWith(pre) && (!post || path.endsWith(post))) {
        const mid = path.slice(pre.length, path.length - (post || '').length);
        return { to: r.to.replace(':splat', mid).replace('*', mid), status: r.status };
      }
    } else if (r.from === path) {
      return { to: r.to, status: r.status };
    }
  }
  return null;
}

function applyHeaders(text, path) {
  const out = {};
  let active = false;
  (text || '').split(/\r?\n/).forEach((line) => {
    const raw = line.trim();
    if (!raw || raw.startsWith('#')) return;
    if (!/^[\w-]+:/.test(raw)) {
      const pat = raw.replace(/\/\*$/, '');
      active = pat === '' || ('/' + path).startsWith(pat) || pat === '/*';
      return;
    }
    if (!active) return;
    const i = raw.indexOf(':');
    const name = raw.slice(0, i).trim();
    const value = raw.slice(i + 1).trim();
    if (name && value) out[name] = value;
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* 페이지: 비밀번호 잠금 / 404                                         */
/* ------------------------------------------------------------------ */

function gatePage(slug, message, needPassword) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>비공개 사이트</title>
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;
font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Malgun Gothic","Apple SD Gothic Neo",system-ui,sans-serif;
background:radial-gradient(120% 100% at 50% 0%,#fff7e2 0%,#f6f2ea 45%,#efeae1 100%);color:#1b1a17}
.card{width:100%;max-width:400px;background:#fffdf8;border:1px solid #e8e1d3;border-radius:22px;
padding:30px 26px;box-shadow:0 22px 60px -30px rgba(80,60,10,.45)}
.orb{width:44px;height:44px;border-radius:50%;
background:radial-gradient(circle at 50% 42%,#fffce0 0%,#ffe968 34%,#f8c62c 62%,rgba(248,198,44,0) 78%);
box-shadow:0 0 34px 10px rgba(255,214,64,.5);margin:0 auto 18px}
h1{font-size:19px;margin:0 0 8px;text-align:center;letter-spacing:-.02em}
p{font-size:13.5px;line-height:1.6;color:#6c6455;margin:0 0 18px;text-align:center}
label{display:block;font-size:12.5px;font-weight:600;color:#4a4438;margin-bottom:6px}
input{width:100%;padding:12px 14px;border-radius:12px;border:1px solid #ddd5c4;background:#fff;font-size:14px;color:#1b1a17}
button{width:100%;margin-top:12px;padding:12px;border:0;border-radius:12px;background:#1b1a17;color:#fff;font-size:14px;font-weight:600;cursor:pointer}
.msg{margin-top:12px;font-size:12.5px;color:#b4462f;text-align:center}
.foot{margin-top:16px;text-align:center;font-size:11.5px;color:#9a9284}
</style></head><body>
<form class="card" method="post" action="/__lamp/unlock">
<div class="orb"></div>
<h1>비밀번호가 필요합니다</h1>
<p>${esc(message)}</p>
${needPassword ? `<label for="pw">비밀번호</label><input id="pw" name="pw" type="password" autocomplete="current-password" required>
<button type="submit">들어가기</button>` : ''}
<input type="hidden" name="slug" value="${esc(slug)}">
<div class="foot">Lamp로 배포된 사이트</div>
</form></body></html>`;
}

function notFoundPage(slug, requestPath) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>404 - 페이지를 찾을 수 없습니다</title>
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;
font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Malgun Gothic","Apple SD Gothic Neo",system-ui,sans-serif;
background:#f7f4ee;color:#1b1a17}
.box{text-align:center;max-width:440px}
.code{font-size:64px;font-weight:700;letter-spacing:-.04em;color:#f0b52a;line-height:1}
h1{font-size:18px;margin:14px 0 8px}
p{font-size:13.5px;color:#6c6455;line-height:1.6;margin:0 0 6px}
code{font-size:12px;background:#eee8dc;padding:2px 7px;border-radius:6px}
a{color:#1b1a17;font-size:13px;font-weight:600}
</style></head><body><div class="box">
<div class="code">404</div>
<h1>페이지를 찾을 수 없습니다</h1>
<p><code>${esc(requestPath)}</code> 경로에 파일이 없습니다.</p>
<p>${slug ? esc(slug) + ' 사이트의 주소를 다시 확인해 주세요.' : '주소를 다시 확인해 주세요.'}</p>
<p style="margin-top:18px"><a href="/${esc(slug)}/">사이트 첫 화면으로</a></p>
</div></body></html>`;
}

/* ------------------------------------------------------------------ */
/* 사이트 응답                                                          */
/* ------------------------------------------------------------------ */

function pickVariant(site, req) {
  const ab = site.abtest;
  if (!ab || !ab.active || !Array.isArray(ab.variants) || !ab.variants.length) return null;
  const cookieName = 'lamp_ab_' + site.slug;
  let bucket = parseCookies(req)[cookieName];
  if (!bucket) {
    const r = Math.random() * 100;
    let acc = 0;
    bucket = ab.variants[0].name;
    for (const v of ab.variants) {
      acc += Number(v.weight || 0);
      if (r <= acc) { bucket = v.name; break; }
    }
  }
  const match = ab.variants.find((v) => v.name === bucket);
  return match ? { name: bucket, version: match.version } : null;
}

async function serveSite(req, env, ctx, slug, restPath, forcedVersion) {
  const site = await getSite(env, slug);
  if (!site) {
    return new Response(notFoundPage('', '/' + slug + '/' + (restPath || '')), { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }

  const url = new URL(req.url);

  if (site.passwordHash) {
    const expected = await hmac(slug + ':' + site.passwordHash, env.SECRET_SALT || 'lamp');
    const token = parseCookies(req)['lamp_pw_' + slug] || url.searchParams.get('k') || '';
    if (token !== expected && (await sha256(token)) !== site.passwordHash) {
      if (req.method !== 'GET') return new Response('forbidden', { status: 403 });
      return html(gatePage(slug, url.searchParams.get('__lamp_unlock') === 'wrong'
        ? '비밀번호가 맞지 않습니다. 다시 입력해 주세요.'
        : '이 사이트는 비밀번호로 보호되어 있습니다.', true));
    }
  }

  let version = forcedVersion;
  let variant = null;
  if (!version) {
    version = site.current || 0;
    const v = pickVariant(site, req);
    if (v && v.version) { variant = v.name; version = v.version; }
  }
  if (!version) {
    return new Response(notFoundPage(slug, restPath), { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }

  let path = normalizePath(restPath);
  if (path === null) return new Response('bad path', { status: 400 });

  const bundle = await readBundle(env, slug, version);
  const has = (p) => (bundle ? bundle.files.has(p) : false);
  const getText = async (p) => {
    const f = await readFile(env, slug, version, p);
    if (!f) return '';
    if (f.text !== undefined) return f.text;
    return new TextDecoder().decode(f.bytes);
  };

  const redirectsRaw = await getText('_redirects');
  if (redirectsRaw) {
    const hit = matchRedirect(parseRedirects(redirectsRaw), path);
    if (hit) {
      const target = /^https?:\/\//.test(hit.to) ? hit.to : '/' + slug + '/' + hit.to.replace(/^\//, '');
      return new Response(null, { status: hit.status || 301, headers: { location: target } });
    }
  }

  let file = null;
  let hitPath = path;
  const candidates = [path];
  if (!/\.[a-z0-9]+$/i.test(path)) candidates.push(path + '.html', path + '/index.html');
  for (const c of candidates) {
    const f = await readFile(env, slug, version, c);
    if (f) { file = f; hitPath = c; break; }
  }

  const headers = new Headers();
  let status = 200;
  if (!file) {
    const custom404 = await readFile(env, slug, version, '404.html');
    if (custom404) {
      file = custom404;
      status = 404;
    } else {
      return new Response(notFoundPage(slug, path), { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
  } else if (false) { /* 번들에 없는 큰 사이트는 개별 키로 읽는다 */ }

  headers.set('content-type', file.type || guessType(hitPath));
  headers.set('x-lamp-site', slug);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('cache-control', /\.html?$/.test(hitPath) ? 'public, max-age=0, must-revalidate' : 'public, max-age=300');
  if (variant) headers.set('x-lamp-variant', variant);

  const headerRules = await getText('_headers');
  if (headerRules) {
    for (const [k, v] of Object.entries(applyHeaders(headerRules, hitPath))) {
      try { headers.set(k, v); } catch (e) { /* 예약 헤더 무시 */ }
    }
  }

  if (req.method === 'GET' && !isBot(req)) {
    if (variant) countVariant(env, ctx, slug, variant);
    countHit(env, ctx, slug);
  }

  const body = file.text !== undefined ? file.text : file.bytes;
  return new Response(body, { status, headers });
}

/* ------------------------------------------------------------------ */
/* ZIP                                                                 */
/* ------------------------------------------------------------------ */

function crc32(bytes) {
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZip(entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  const te = new TextEncoder();
  for (const e of entries) {
    const nameBytes = te.encode(e.path);
    const crc = crc32(e.bytes);
    const size = e.bytes.length;
    const local = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0x0800, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, size, true);
    dv.setUint32(22, size, true);
    dv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    parts.push(local, e.bytes);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    central.push(cd);
    offset += local.length + size;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const all = [...parts, ...central, end];
  const total = all.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const a of all) { out.set(a, pos); pos += a.length; }
  return out;
}

/* ------------------------------------------------------------------ */
/* API 핸들러                                                          */
/* ------------------------------------------------------------------ */

async function handleCreateSite(req, env, user) {
  const body = await req.json().catch(() => ({}));
  const slug = String(body.slug || '').toLowerCase().trim();
  const name = String(body.name || '').trim().slice(0, 60);
  if (!SLUG_RE.test(slug)) return fail('주소는 영문 소문자·숫자·하이픈 3~40자로 입력해 주세요. 예: my-portfolio', 400, 'bad_slug');
  if (RESERVED.has(slug)) return fail('이 주소는 Lamp가 이미 사용하고 있습니다. 다른 주소를 선택해 주세요.', 409, 'reserved');
  if (await getSite(env, slug)) return fail('이미 사용 중인 주소입니다: ' + slug, 409, 'taken');
  const sites = await userSites(env, user.id);
  if (sites.length >= LIMITS.sitesPerUser) {
    return fail('사이트는 계정당 ' + LIMITS.sitesPerUser + '개까지 만들 수 있습니다. 사용하지 않는 사이트를 삭제해 주세요.', 403, 'site_limit');
  }
  const site = {
    slug, name: name || slug, ownerId: user.id, ownerEmail: user.email || '',
    created: nowIso(), updated: nowIso(), current: 0, private: false,
    passwordHash: '', abtest: null, customDomain: '', github: null, seo: null
  };
  await putSite(env, site);
  await addUserSite(env, user.id, slug);
  return json({ ok: true, site: publicSite(env, site, []) }, 201);
}

function parseFiles(rawFiles) {
  const files = [];
  let total = 0;
  for (const f of rawFiles) {
    const p = normalizePath(f.path);
    if (!p) return { error: '파일 경로가 올바르지 않습니다: ' + String(f.path).slice(0, 80) };
    if (p.startsWith('_lamp/')) return { error: '_lamp/ 경로는 예약되어 있습니다.' };
    let bytes, text = null;
    if (typeof f.base64 === 'string') bytes = b64ToBytes(f.base64);
    else if (typeof f.text === 'string') { bytes = enc.encode(f.text); text = f.text; }
    else return { error: '파일 내용이 비어 있습니다: ' + p };
    total += bytes.length;
    files.push({ path: p, bytes, text, type: f.type || guessType(p) });
  }
  return { files, total };
}

async function handleDeploy(req, env, ctx, user, slug) {
  const site = await getSite(env, slug);
  if (!site) return fail('사이트를 찾을 수 없습니다.', 404, 'not_found');
  if (site.ownerId !== user.id && !user.admin) return fail('이 사이트를 배포할 권한이 없습니다.', 403, 'forbidden');

  const rl = await rateLimit(env, user.id, 'deploy', LIMITS.deploysPerMinute, 60);
  if (rl.blocked) {
    return fail('1분 안에 배포를 5번 넘게 시도했습니다. 스팸으로 의심되어 잠시 막았습니다. ' + rl.retryAfter + '초 뒤에 다시 시도해 주세요.', 429, 'rate_limited', { retryAfter: rl.retryAfter });
  }

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.files) || !body.files.length) return fail('배포할 파일이 없습니다.', 400, 'no_files');
  if (body.files.length > LIMITS.filesPerSite) return fail('한 번에 ' + LIMITS.filesPerSite + '개 파일까지 배포할 수 있습니다.', 413, 'too_many_files');

  const parsed = parseFiles(body.files);
  if (parsed.error) return fail(parsed.error, 400, 'bad_file');
  const { files, total } = parsed;
  if (total > LIMITS.bytesPerSite) {
    return fail('사이트 용량은 10MB까지입니다. 지금 배포본은 ' + (total / 1048576).toFixed(2) + 'MB입니다.', 413, 'too_large');
  }

  const threats = scanSite(files);
  if (threats.length) return fail('악성·스팸 패턴이 감지되어 배포를 차단했습니다.', 422, 'blocked_scan', { reasons: threats });

  const versions = await siteVersions(env, slug);
  const nextV = versions.reduce((m, v) => Math.max(m, v.v), 0) + 1;
  const written = await writeVersion(env, slug, nextV, files);

  const version = {
    v: nextV, ts: nowIso(), message: String(body.message || '').slice(0, 200) || '배포 ' + nextV,
    files: files.length, bytes: total, preview: !!body.preview, mode: written.mode,
    entry: files.some((f) => f.path === 'index.html'),
    paths: files.map((f) => f.path)
  };
  versions.unshift(version);
  await env.LAMP_KV.put('site:' + slug + ':versions', JSON.stringify(versions.slice(0, LIMITS.versionsKept)));
  if (!body.preview) {
    site.current = nextV;
    await putSite(env, site);
  }
  return json({
    ok: true,
    version: publicSite(env, { ...site, current: body.preview ? site.current : nextV }, versions),
    deploy: version
  });
}

async function handleApi(req, env, ctx, url) {
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const method = req.method;

  if (parts[0] === 'config') {
    return json({
      ok: true, limits: LIMITS, base: env.PUBLIC_BASE || '',
      supabase: { url: env.SUPABASE_URL || '' },
      features: { githubImport: true, forms: true, abtest: true, password: true }
    });
  }
  if (parts[0] === 'health') return json({ ok: true, ts: nowIso(), base: env.PUBLIC_BASE || '' });

  const gate = await requireUser(req, env);
  if (gate.error) return gate.error;
  const user = gate.user;

  if (parts[0] === 'me') {
    const sites = await userSites(env, user.id);
    return json({ ok: true, user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar, admin: !!user.admin }, sites });
  }

  if (parts[0] === 'sites' && parts.length === 1) {
    if (method === 'GET') {
      const slugs = await userSites(env, user.id);
      const out = [];
      for (const s of slugs) {
        const site = await getSite(env, s);
        if (!site) continue;
        out.push(publicSite(env, site, await siteVersions(env, s)));
      }
      out.sort((a, b) => (a.updated < b.updated ? 1 : -1));
      return json({ ok: true, sites: out });
    }
    if (method === 'POST') return await handleCreateSite(req, env, user);
  }

  if (parts[0] === 'sites' && parts[1]) {
    const slug = parts[1];
    const site = await getSite(env, slug);
    if (!site) return fail('사이트를 찾을 수 없습니다.', 404, 'not_found');
    const mine = site.ownerId === user.id || user.admin;
    const versions = await siteVersions(env, slug);

    if (parts.length === 2) {
      if (method === 'GET') return json({ ok: true, site: publicSite(env, site, versions), versions });
      if (method === 'DELETE') {
        if (!mine) return fail('삭제 권한이 없습니다.', 403, 'forbidden');
        for (const v of versions) await deleteVersion(env, slug, v);
        await env.LAMP_KV.delete('site:' + slug);
        await env.LAMP_KV.delete('site:' + slug + ':versions');
        await removeUserSite(env, site.ownerId, slug);
        return json({ ok: true, deleted: slug });
      }
      if (method === 'PATCH') {
        if (!mine) return fail('변경 권한이 없습니다.', 403, 'forbidden');
        const b = await req.json().catch(() => ({}));
        if (typeof b.name === 'string' && b.name.trim()) site.name = b.name.trim().slice(0, 60);
        if (typeof b.private === 'boolean') site.private = b.private;
        if (b.abtest !== undefined) site.abtest = b.abtest;
        if (typeof b.customDomain === 'string') site.customDomain = b.customDomain.trim().slice(0, 120);
        if (typeof b.seo === 'object' && b.seo) site.seo = b.seo;
        if (typeof b.github === 'object' && b.github) site.github = b.github;
        if (typeof b.password === 'string') {
          if (b.password === '') { site.password = ''; site.passwordHash = ''; }
          else {
            if (b.password.length < 4) return fail('비밀번호는 4자 이상이어야 합니다.', 400, 'weak_password');
            site.password = b.password.slice(0, 64);
            site.passwordHash = await sha256(b.password);
          }
        }
        await putSite(env, site);
        return json({ ok: true, site: publicSite(env, site, versions) });
      }
    }

    if (parts[2] === 'deploy') {
      if (method === 'POST') return await handleDeploy(req, env, ctx, user, slug);
      if (method === 'GET') return json({ ok: true, versions });
    }

    if (parts[2] === 'files' && method === 'GET') {
      if (!mine) return fail('권한이 없습니다.', 403, 'forbidden');
      const v = Number(url.searchParams.get('version') || site.current || 0);
      const version = versions.find((x) => x.v === v);
      if (!version) return fail('그 버전이 없습니다.', 404, 'no_version');
      const out = {};
      const bundle = await readBundle(env, slug, v);
      for (const p of version.paths || []) {
        if (bundle) {
          const f = bundle.files.get(p);
          if (!f) continue;
          if (f.t !== undefined) out[p] = { text: f.t, type: f.ct || guessType(p), size: enc.encode(f.t).length };
          else out[p] = { base64: f.b || '', type: f.ct || guessType(p), size: b64ToBytes(f.b || '').length };
        } else {
          const f = await readFile(env, slug, v, p);
          if (!f) continue;
          if (f.text !== undefined) out[p] = { text: f.text, type: f.type, size: enc.encode(f.text).length };
          else out[p] = { base64: bytesToB64(new Uint8Array(f.bytes)), type: f.type, size: f.bytes.length };
        }
      }
      return json({ ok: true, version: v, paths: version.paths || [], files: out });
    }

    if (parts[2] === 'file' && method === 'GET') {
      if (!mine) return fail('권한이 없습니다.', 403, 'forbidden');
      const v = Number(url.searchParams.get('version') || site.current || 0);
      const p = normalizePath(url.searchParams.get('path') || 'index.html');
      if (!p) return fail('잘못된 경로입니다.', 400);
      const f = await readFile(env, slug, v, p);
      if (!f) return fail('파일이 없습니다: ' + p, 404, 'no_file');
      if (url.searchParams.get('b64') === '1') {
        const b64 = f.text !== undefined ? bytesToB64(enc.encode(f.text)) : bytesToB64(new Uint8Array(f.bytes));
        return json({ ok: true, path: p, base64: b64, type: f.type });
      }
      const text = f.text !== undefined ? f.text : new TextDecoder().decode(f.bytes);
      return json({ ok: true, path: p, text, type: f.type });
    }

    if (parts[2] === 'patch' && method === 'POST') {
      if (!mine) return fail('권한이 없습니다.', 403, 'forbidden');
      const rl = await rateLimit(env, user.id, 'deploy', LIMITS.deploysPerMinute, 60);
      if (rl.blocked) return fail('잠시 뒤 다시 시도해 주세요.', 429, 'rate_limited', { retryAfter: rl.retryAfter });
      const b = await req.json().catch(() => ({}));
      const baseV = Number(b.baseVersion || site.current || 0);
      const baseVersion = versions.find((x) => x.v === baseV);
      if (!baseVersion) return fail('기준 버전이 없습니다.', 404, 'no_version');

      const remove = new Set((b.remove || []).map((p) => normalizePath(p)).filter(Boolean));
      const upserts = [];
      let total = 0;
      for (const f of b.upsert || []) {
        const p = normalizePath(f.path);
        if (!p) return fail('잘못된 경로: ' + String(f.path).slice(0, 60), 400);
        let bytes, text = null;
        if (typeof f.base64 === 'string') bytes = b64ToBytes(f.base64);
        else if (typeof f.text === 'string') { bytes = enc.encode(f.text); text = f.text; }
        else continue;
        total += bytes.length;
        upserts.push({ path: p, bytes, text, type: f.type || guessType(p) });
      }
      const threats = scanSite(upserts);
      if (threats.length) return fail('악성·스팸 패턴이 감지되어 배포를 차단했습니다.', 422, 'blocked_scan', { reasons: threats });

      const baseBundle = await readBundle(env, slug, baseV);
      const nextV = versions.reduce((m, v) => Math.max(m, v.v), 0) + 1;
      const all = [];
      if (baseBundle) {
        for (const [p, f] of baseBundle.files) {
          if (remove.has(p) || upserts.some((u) => u.path === p)) continue;
          if (f.t !== undefined) all.push({ path: p, text: f.t, bytes: enc.encode(f.t), type: f.ct || guessType(p) });
          else { const bytes = b64ToBytes(f.b || ''); all.push({ path: p, bytes, text: null, type: f.ct || guessType(p) }); }
          total += all[all.length - 1].bytes.length;
        }
      } else {
        for (const p of baseVersion.paths || []) {
          if (remove.has(p) || upserts.some((u) => u.path === p)) continue;
          const f = await readFile(env, slug, baseV, p);
          if (!f) continue;
          const bytes = f.text !== undefined ? enc.encode(f.text) : new Uint8Array(f.bytes);
          total += bytes.length;
          all.push({ path: p, text: f.text !== undefined ? f.text : null, bytes, type: f.type || guessType(p) });
        }
      }
      all.push(...upserts);
      if (total > LIMITS.bytesPerSite) return fail('사이트 용량 10MB를 넘었습니다.', 413, 'too_large');

      await writeVersion(env, slug, nextV, all);
      const version = {
        v: nextV, ts: nowIso(), message: String(b.message || '').slice(0, 200) || '파일 추가 배포',
        files: all.length, bytes: total, preview: false, entry: all.some((f) => f.path === 'index.html'),
        paths: all.map((f) => f.path)
      };
      versions.unshift(version);
      await env.LAMP_KV.put('site:' + slug + ':versions', JSON.stringify(versions.slice(0, LIMITS.versionsKept)));
      site.current = nextV;
      await putSite(env, site);
      return json({ ok: true, deploy: version, site: publicSite(env, site, versions) });
    }

    if (parts[2] === 'rollback' && method === 'POST') {
      if (!mine) return fail('권한이 없습니다.', 403, 'forbidden');
      const b = await req.json().catch(() => ({}));
      const target = Number(b.version);
      if (!versions.some((v) => v.v === target)) return fail('그 버전이 없습니다.', 404, 'no_version');
      site.current = target;
      await putSite(env, site);
      return json({ ok: true, site: publicSite(env, site, versions) });
    }

    if (parts[2] === 'zip' && method === 'GET') {
      const v = Number(parts[3] || site.current);
      const version = versions.find((x) => x.v === v);
      if (!version) return fail('그 버전이 없습니다.', 404, 'no_version');
      const entries = [];
      const bundle = await readBundle(env, slug, v);
      if (bundle) {
        for (const [p, f] of bundle.files) {
          entries.push({ path: p, bytes: f.t !== undefined ? enc.encode(f.t) : b64ToBytes(f.b || '') });
        }
      } else {
        for (const p of version.paths || []) {
          const f = await readFile(env, slug, v, p);
          if (f) entries.push({ path: p, bytes: f.text !== undefined ? enc.encode(f.text) : new Uint8Array(f.bytes) });
        }
      }
      const zip = buildZip(entries);
      return new Response(zip, {
        headers: {
          'content-type': 'application/zip',
          'content-disposition': `attachment; filename="${slug}-v${v}.zip"`,
          'cache-control': 'no-store', ...CORS
        }
      });
    }

    if (parts[2] === 'analytics' && method === 'GET') {
      const days = Math.min(30, Number(url.searchParams.get('days') || 7));
      const stored = (await env.LAMP_KV.get('an:' + slug, 'json')) || { d: {}, h: {}, ab: {}, t: 0 };
      const bufD = {};
      const bufH = {};
      const bufV = {};
      for (const [key, n] of hitBuffer) {
        const [s2, kind, bucket, variant] = key.split('|');
        if (s2 !== slug) continue;
        if (kind === 'd') bufD[bucket] = (bufD[bucket] || 0) + n;
        if (kind === 'h') bufH[bucket] = (bufH[bucket] || 0) + n;
        if (kind === 'v') { bufV[bucket] = bufV[bucket] || {}; bufV[bucket][variant] = (bufV[bucket][variant] || 0) + n; }
      }
      const daily = [];
      let total = 0;
      for (let i = days - 1; i >= 0; i--) {
        const d = dayKey(new Date(Date.now() - i * 86400000));
        const v = (stored.d[d] || 0) + (bufD[d] || 0);
        daily.push({ date: d, views: v });
        total += v;
      }
      const hours = [];
      for (let i = 23; i >= 0; i--) {
        const h = hourKey(new Date(Date.now() - i * 3600000));
        hours.push({ hour: h, views: (stored.h[h] || 0) + (bufH[h] || 0) });
      }
      let ab = [];
      if (site.abtest && site.abtest.variants) {
        const today = dayKey();
        const base = (stored.ab && stored.ab[today]) || {};
        const extra = bufV[today] || {};
        ab = site.abtest.variants.map((v) => ({
          name: v.name, version: v.version,
          views: (base[v.name] || 0) + (extra[v.name] || 0)
        }));
      }
      return json({ ok: true, daily, hours, total: total || stored.t || 0, live: hours.slice(-3).reduce((n, h) => n + h.views, 0), ab });
    }

    if (parts[2] === 'forms') {
      if (method === 'GET') {
        const ids = (await env.LAMP_KV.get('site:' + slug + ':forms', 'json')) || [];
        const out = [];
        for (const id of ids) {
          const f = await env.LAMP_KV.get('form:' + id, 'json');
          if (!f) continue;
          const subs = (await env.LAMP_KV.get('sub:' + id + ':index', 'json')) || [];
          out.push({ ...f, count: subs.length, submissions: subs.slice(0, 20) });
        }
        return json({ ok: true, forms: out });
      }
      if (method === 'POST') {
        if (!mine) return fail('권한이 없습니다.', 403, 'forbidden');
        const b = await req.json().catch(() => ({}));
        const id = 'f_' + (await sha256(slug + Date.now() + Math.random())).slice(0, 12);
        const form = { id, slug, name: String(b.name || '문의 폼').slice(0, 60), fields: (b.fields || []).slice(0, 30), created: nowIso() };
        await env.LAMP_KV.put('form:' + id, JSON.stringify(form));
        const ids = (await env.LAMP_KV.get('site:' + slug + ':forms', 'json')) || [];
        ids.push(id);
        await env.LAMP_KV.put('site:' + slug + ':forms', JSON.stringify(ids));
        return json({ ok: true, form });
      }
    }

    if (parts[2] === 'submissions') {
      const ids = (await env.LAMP_KV.get('site:' + slug + ':forms', 'json')) || [];
      const all = [];
      for (const id of ids) {
        const list = (await env.LAMP_KV.get('sub:' + id + ':index', 'json')) || [];
        for (const s of list.slice(0, 100)) all.push({ formId: id, ...s });
      }
      return json({ ok: true, submissions: all, count: all.length });
    }
  }

  if (parts[0] === 'keys') {
    const list = (await env.LAMP_KV.get('u:' + user.id + ':keys', 'json')) || [];
    if (method === 'GET') return json({ ok: true, keys: list });
    if (method === 'POST') {
      const b = await req.json().catch(() => ({}));
      if (list.length >= 5) return fail('API 키는 5개까지 만들 수 있습니다.', 403, 'key_limit');
      const raw = 'lamp_' + bytesToB64(crypto.getRandomValues(new Uint8Array(24))).replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);
      const digest = await sha256(raw);
      const rec = { id: digest.slice(0, 10), label: String(b.label || '기본 키').slice(0, 40), created: nowIso() };
      await env.LAMP_KV.put('key:' + digest, JSON.stringify({ uid: user.id, label: rec.label, created: rec.created }));
      list.push(rec);
      await env.LAMP_KV.put('u:' + user.id + ':keys', JSON.stringify(list));
      return json({ ok: true, key: raw, record: rec });
    }
    if (method === 'DELETE') {
      const id = parts[1] || url.searchParams.get('id');
      const rest = list.filter((k) => k.id !== id);
      await env.LAMP_KV.put('u:' + user.id + ':keys', JSON.stringify(rest));
      return json({ ok: true, keys: rest });
    }
  }

  if (parts[0] === 'github' && parts[1] === 'tree' && method === 'GET') {
    const repo = String(url.searchParams.get('repo') || '').trim();
    const branch = String(url.searchParams.get('branch') || '').trim();
    const sub = String(url.searchParams.get('path') || '').replace(/^\/+|\/+$/g, '');
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return fail('저장소는 owner/name 형식으로 입력해 주세요.', 400, 'bad_repo');
    const ghHeaders = { 'user-agent': 'Lamp/1.0', accept: 'application/vnd.github+json' };
    if (env.GITHUB_TOKEN) ghHeaders.authorization = 'Bearer ' + env.GITHUB_TOKEN;
    const metaRes = await fetch('https://api.github.com/repos/' + repo, { headers: ghHeaders });
    if (!metaRes.ok) return fail('저장소를 읽을 수 없습니다. 공개 저장소인지 확인해 주세요. (HTTP ' + metaRes.status + ')', 404, 'repo_unreadable');
    const meta = await metaRes.json();
    const ref = branch || meta.default_branch || 'main';
    const treeRes = await fetch('https://api.github.com/repos/' + repo + '/git/trees/' + encodeURIComponent(ref) + '?recursive=1', { headers: ghHeaders });
    if (!treeRes.ok) return fail('브랜치 파일 목록을 읽을 수 없습니다. (HTTP ' + treeRes.status + ')', 404, 'tree_unreadable');
    const tree = await treeRes.json();
    const files = (tree.tree || [])
      .filter((n) => n.type === 'blob' && (!sub || n.path.startsWith(sub + '/') || n.path === sub))
      .map((n) => ({ path: sub ? n.path.slice(sub.length + 1) : n.path, size: n.size }))
      .filter((n) => n.path && n.size <= 3 * 1024 * 1024)
      .slice(0, 300);
    return json({ ok: true, repo: meta.full_name, branch: ref, defaultBranch: meta.default_branch, files });
  }

  if (parts[0] === 'github' && parts[1] === 'file' && method === 'GET') {
    const repo = String(url.searchParams.get('repo') || '').trim();
    const branch = String(url.searchParams.get('branch') || 'main');
    const path = String(url.searchParams.get('path') || '');
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !path || path.includes('..')) return fail('잘못된 요청입니다.', 400);
    const ghHeaders = { 'user-agent': 'Lamp/1.0' };
    if (env.GITHUB_TOKEN) ghHeaders.authorization = 'Bearer ' + env.GITHUB_TOKEN;
    const r = await fetch('https://raw.githubusercontent.com/' + repo + '/' + encodeURIComponent(branch) + '/' + path.split('/').map(encodeURIComponent).join('/'), { headers: ghHeaders });
    if (!r.ok) return fail('파일을 읽을 수 없습니다. (HTTP ' + r.status + ')', 404, 'file_unreadable');
    const buf = await r.arrayBuffer();
    return json({ ok: true, path, base64: bytesToB64(new Uint8Array(buf)), type: guessType(path) });
  }

  return fail('없는 API 경로입니다: ' + url.pathname, 404, 'no_route');
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (url.pathname.startsWith('/f/')) {
      const id = url.pathname.slice(3).replace(/\/$/, '');
      if (req.method === 'POST') {
        const form = await env.LAMP_KV.get('form:' + id, 'json');
        if (!form) return fail('폼을 찾을 수 없습니다.', 404, 'no_form');
        const ct = req.headers.get('content-type') || '';
        let data = {};
        if (ct.includes('application/json')) data = await req.json().catch(() => ({}));
        else {
          const fd = await req.formData().catch(() => null);
          if (fd) fd.forEach((v, k) => { data[k] = String(v).slice(0, 2000); });
        }
        const rl = await rateLimit(env, id, 'form', 20, 60);
        if (rl.blocked) return fail('전송이 너무 많습니다. 잠시 뒤 다시 시도해 주세요.', 429, 'rate_limited');
        const entry = { at: nowIso(), data, ua: (req.headers.get('user-agent') || '').slice(0, 120), country: req.headers.get('cf-ipcountry') || '' };
        await env.LAMP_KV.put('sub:' + id + ':' + Date.now(), JSON.stringify(entry));
        const idx = (await env.LAMP_KV.get('sub:' + id + ':index', 'json')) || [];
        idx.unshift({ at: entry.at, data });
        await env.LAMP_KV.put('sub:' + id + ':index', JSON.stringify(idx.slice(0, 200)));
        if (ct.includes('application/json')) return json({ ok: true });
        const back = url.searchParams.get('redirect');
        if (back && /^https?:\/\//.test(back)) return Response.redirect(back, 303);
        return html('<meta charset="utf-8"><div style="font-family:system-ui,sans-serif;padding:32px;text-align:center">전송되었습니다. 감사합니다.<br><a href="javascript:history.back()">돌아가기</a></div>');
      }
    }

    if (url.pathname.startsWith('/p/')) {
      const seg = url.pathname.slice(3).split('/');
      const slug = seg[0];
      if (!SLUG_RE.test(slug)) return new Response('bad slug', { status: 404 });
      return await serveSite(req, env, ctx, slug, seg.slice(2).join('/'), Number(seg[1] || 0));
    }

    if (url.pathname === '/__lamp/unlock' && req.method === 'POST') {
      const fd = await req.formData();
      const slug = String(fd.get('slug') || '');
      const pw = String(fd.get('pw') || '');
      const site = await getSite(env, slug);
      if (!site) return Response.redirect('/' + slug + '/', 303);
      if ((await sha256(pw)) === site.passwordHash) {
        const token = await hmac(slug + ':' + site.passwordHash, env.SECRET_SALT || 'lamp');
        return new Response(null, {
          status: 303,
          headers: { location: '/' + slug + '/', 'set-cookie': `lamp_pw_${slug}=${token}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax` }
        });
      }
      return Response.redirect('/' + slug + '/?__lamp_unlock=wrong', 303);
    }

    if (url.pathname === '/__lamp/health') return json({ ok: true, ts: nowIso(), base: env.PUBLIC_BASE || '' });

    if (url.pathname === '/__lamp/badge.svg') {
      const label = url.searchParams.get('label') || 'Powered by Lamp';
      return new Response(badgeSvg(label), { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=3600' } });
    }

    if (url.pathname.startsWith('/api/')) return await handleApi(req, env, ctx, url);

    const dashPath = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, '');
    if (url.pathname === '/' || DASH_PREFIXES.some((pre) => dashPath.startsWith(pre)) || url.pathname === '/index.html') {
      const res = await serveDashboard(env, dashPath);
      if (res) return res;
    }
    if (url.pathname === '/__lamp/info') return html(landingPage(env));

    const seg = url.pathname.slice(1).split('/');
    const slug = seg[0];
    if (!SLUG_RE.test(slug)) {
      return new Response(notFoundPage('', url.pathname), { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    return await serveSite(req, env, ctx, slug, seg.slice(1).join('/'), 0);
  }
};

function badgeSvg(label) {
  const text = String(label).slice(0, 40);
  const w = Math.max(120, 34 + text.length * 6.6);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="28" role="img" aria-label="${esc(text)}">
<rect width="${w}" height="28" rx="6" fill="#141310"/>
<circle cx="16" cy="14" r="6" fill="#ffd23f"/>
<text x="28" y="18" font-family="-apple-system,Segoe UI,sans-serif" font-size="11.5" fill="#f6f1e6">${esc(text)}</text>
</svg>`;
}

async function serveDashboard(env, path) {
  const url = new URL(env.PUBLIC_BASE || 'https://lamp-edge.helpaboutflux.workers.dev');
  if (!dashCache || Date.now() - dashCacheAt > 60_000) {
    const bundle = await env.LAMP_KV.get('dash:files', 'json');
    if (!bundle) return null;
    dashCache = bundle;
    dashCacheAt = Date.now();
  }
  let p = path || 'index.html';
  if (p === '' || p === '/') p = 'index.html';
  p = p.replace(/^\/+/, '');
  const b64 = dashCache[p];
  if (!b64) return null;
  const m = /\.([a-z0-9]+)$/i.exec(p);
  const type = guessType(p);
  const bin = b64ToBytes(b64);
  const isText = /^text\/|json|xml|svg|javascript/.test(type);
  return new Response(isText ? new TextDecoder().decode(bin) : bin, {
    headers: {
      'content-type': type,
      'cache-control': p === 'index.html' ? 'no-cache' : 'public, max-age=600',
      'x-lamp-app': '1'
    }
  });
}

function landingPage(env) {
  const base = env.PUBLIC_BASE || '';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lamp Edge</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#141310;color:#f6f1e6;
font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Malgun Gothic",system-ui,sans-serif}
.box{max-width:520px;padding:34px}
h1{font-size:22px;margin:0 0 10px}p{font-size:14px;line-height:1.7;color:#c9c2b4;margin:0 0 8px}
code{background:#241f18;padding:3px 7px;border-radius:6px;font-size:12.5px;color:#ffd23f}
a{color:#ffd23f}</style></head><body><div class="box">
<h1>Lamp Edge</h1>
<p>Lamp가 배포한 사이트를 전달하는 정적 호스팅 엔진입니다.</p>
<p>사이트 주소는 <code>${esc(base)}/사이트-주소/</code> 형태입니다.</p>
<p><a href="https://helpaboutflux-cpu.github.io/lamp/">Lamp 대시보드로 이동</a></p>
</div></body></html>`;
}
