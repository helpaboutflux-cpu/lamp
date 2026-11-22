/* Lamp — 공통 유틸 */
import { icon } from './icons.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function attr(name, value) {
  return value == null || value === false ? '' : ` ${name}="${esc(value)}"`;
}

export function fmtBytes(n) {
  if (n == null) return '0 B';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1).replace(/\.0$/, '') + ' KB';
  return (n / 1048576).toFixed(2) + ' MB';
}

export function fmtNum(n) {
  return Number(n || 0).toLocaleString('ko-KR');
}

export function fmtDate(iso, opts = {}) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', ...opts });
}

export function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

export function relTime(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const s = Math.round((Date.now() - then) / 1000);
  if (s < 45) return '방금 전';
  if (s < 3600) return Math.round(s / 60) + '분 전';
  if (s < 86400) return Math.round(s / 3600) + '시간 전';
  if (s < 86400 * 7) return Math.round(s / 86400) + '일 전';
  return fmtDate(iso, { year: undefined });
}

export function dayLabel(iso) {
  const d = new Date(iso + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

export function uid(prefix = '') {
  return prefix + Math.random().toString(36).slice(2, 9);
}

export function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }

export function debounce(fn, ms = 240) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function safeJson(str, fallback) {
  try { return JSON.parse(str); } catch (e) { return fallback; }
}

export const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem('lamp:' + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('lamp:' + key, JSON.stringify(value)); } catch (e) { /* 용량 초과 무시 */ }
  },
  del(key) {
    try { localStorage.removeItem('lamp:' + key); } catch (e) { /* noop */ }
  }
};

export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* 폴백으로 진행 */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) { return false; }
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadText(filename, text, type = 'text/plain;charset=utf-8') {
  downloadBlob(filename, new Blob([text], { type }));
}

/* ------------------------------------------------------------ 파일 다루기 */

const TEXT_EXT = /\.(html?|css|js|mjs|json|txt|md|xml|svg|yml|yaml|csv|ts|tsx|jsx|map|webmanifest)$/i;

export function isTextPath(path) {
  return TEXT_EXT.test(path);
}

export function mimeOf(path) {
  const ext = (path.match(/\.([a-z0-9]+)$/i) || [])[1];
  const map = {
    html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8',
    css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8',
    mjs: 'text/javascript; charset=utf-8', json: 'application/json; charset=utf-8',
    txt: 'text/plain; charset=utf-8', md: 'text/markdown; charset=utf-8',
    xml: 'application/xml; charset=utf-8', svg: 'image/svg+xml',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon',
    woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
    pdf: 'application/pdf', zip: 'application/zip', mp4: 'video/mp4',
    webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', csv: 'text/csv; charset=utf-8'
  };
  return map[(ext || '').toLowerCase()] || 'application/octet-stream';
}

export function fileToBase64(bytes) {
  let s = '';
  const chunk = 0x8000;
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i += chunk) s += String.fromCharCode.apply(null, arr.subarray(i, i + chunk));
  return btoa(s);
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function fileToPayload(file, path) {
  const buf = await file.arrayBuffer();
  if (isTextPath(path) && !/\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|pdf|zip|mp4|webm|mp3|wav)$/i.test(path)) {
    return { path, text: new TextDecoder().decode(buf), type: mimeOf(path) };
  }
  return { path, base64: fileToBase64(buf), type: mimeOf(path) };
}

/** 드래그한 폴더/파일을 재귀적으로 읽는다. */
export async function readDataTransfer(dt) {
  const out = [];
  const items = Array.from(dt.items || []);
  const entries = items.map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null)).filter(Boolean);

  async function walk(entry, prefix = '') {
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej));
      out.push({ path: prefix + entry.name, file });
      return;
    }
    if (entry.isDirectory) {
      const reader = entry.createReader();
      const read = () => new Promise((res) => reader.readEntries(res, () => res([])));
      let batch = await read();
      while (batch.length) {
        for (const child of batch) await walk(child, prefix + entry.name + '/');
        batch = await read();
      }
    }
  }

  if (entries.length) {
    for (const e of entries) await walk(e);
  } else {
    for (const f of Array.from(dt.files || [])) out.push({ path: f.name, file: f });
  }

  // 최상위 공통 폴더가 하나면 벗겨낸다 (site/index.html -> index.html)
  if (out.length > 1) {
    const first = out[0].path.split('/')[0];
    const allSame = out.every((f) => f.path.startsWith(first + '/'));
    if (allSame && out.every((f) => f.path.split('/').length > 1)) {
      out.forEach((f) => { f.path = f.path.slice(first.length + 1); });
    }
  }
  return out.filter((f) => f.path && !f.path.split('/').some((seg) => seg === '.git' || seg === '__MACOSX'));
}

/* ZIP 읽기 (store + deflate, DecompressionStream 사용) */
export async function readZip(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP 중앙 디렉터리를 찾지 못했습니다.');
  const count = view.getUint16(eocd + 10, true);
  let ptr = view.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const files = [];
  let total = 0;

  for (let n = 0; n < count; n++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) break;
    const method = view.getUint16(ptr + 10, true);
    const compSize = view.getUint32(ptr + 20, true);
    const rawSize = view.getUint32(ptr + 24, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOff = view.getUint32(ptr + 42, true);
    const name = dec.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    ptr += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    if (name.startsWith('__MACOSX') || name.split('/').includes('.git')) continue;

    const lNameLen = view.getUint16(localOff + 26, true);
    const lExtraLen = view.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = bytes.subarray(dataStart, dataStart + compSize);
    let out;
    if (method === 0) out = raw;
    else if (method === 8) {
      const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      out = new Uint8Array(await new Response(stream).arrayBuffer());
    } else throw new Error('압축 방식(' + method + ')은 지원하지 않습니다: ' + name);
    if (out.length !== rawSize && method === 8) throw new Error('압축 해제 크기가 맞지 않습니다: ' + name);
    total += out.length;
    if (total > 12 * 1024 * 1024) throw new Error('압축을 푼 용량이 12MB를 넘습니다.');
    files.push({ path: name, bytes: out });
  }

  // 공통 최상위 폴더 제거
  if (files.length > 1) {
    const first = files[0].path.split('/')[0];
    if (files.every((f) => f.path.startsWith(first + '/') && f.path.split('/').length > 1)) {
      files.forEach((f) => { f.path = f.path.slice(first.length + 1); });
    }
  }

  return files.map((f) => (isTextPath(f.path)
    ? { path: f.path, text: new TextDecoder().decode(f.bytes), type: mimeOf(f.path), size: f.bytes.length }
    : { path: f.path, base64: fileToBase64(f.bytes), type: mimeOf(f.path), size: f.bytes.length }));
}

/* ------------------------------------------------------------ 알림 */

let noteTimer = null;

export function note(kind, message, ms = 4200) {
  const host = $('#noteHost');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'note note--' + kind;
  el.innerHTML = `<span class="note__ico">${icon(kind === 'ok' ? 'check' : kind === 'bad' ? 'alert' : kind === 'warn' ? 'alert' : 'info')}</span><div class="note__body">${esc(message)}</div>`;
  host.innerHTML = '';
  host.appendChild(el);
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .2s'; setTimeout(() => el.remove(), 220); }, ms);
}

export function inlineNote(kind, title, body = '') {
  const ico = kind === 'ok' ? 'check' : kind === 'bad' ? 'alert' : kind === 'warn' ? 'alert' : 'info';
  return `<div class="note note--${kind}">${icon(ico)}<div class="note__body">${title ? `<b>${esc(title)}</b>` : ''}${body}</div></div>`;
}

export { icon };
