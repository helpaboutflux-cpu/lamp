/* Lamp — 인증 (Supabase Auth + LK ID) */

import { CONFIG } from './config.js';
export { CONFIG };
import { store, safeJson } from './util.js';

const SESSION_KEY = 'session';
const SUPA = CONFIG.supabase.url.replace(/\/$/, '');

let session = store.get(SESSION_KEY, null);
let settingsCache = null;

export function getSession() { return session; }
export function isSignedIn() { return !!(session && session.access_token); }

export function currentUser() {
  if (!session) return null;
  const u = session.user || {};
  const meta = u.user_metadata || {};
  return {
    id: u.id,
    email: u.email || '',
    name: meta.full_name || meta.name || meta.user_name || (u.email ? u.email.split('@')[0] : '사용자'),
    avatar: meta.avatar_url || '',
    provider: (u.app_metadata && u.app_metadata.provider) || 'email'
  };
}

function saveSession(next) {
  session = next;
  if (next) store.set(SESSION_KEY, next); else store.del(SESSION_KEY);
}

function sessionFromToken(payload, previous = {}) {
  const expiresIn = Number(payload.expires_in || 3600);
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token || previous.refresh_token || '',
    expires_at: Date.now() + (expiresIn - 60) * 1000,
    user: payload.user || previous.user || null
  };
}

/** 앱이 실제로 열린 주소(끝 슬래시 포함). OAuth 승인 후 돌아올 곳이다. */
export function appRoot() {
  try {
    const u = new URL(location.href);
    let path = u.pathname || '/';
    path = path.replace(/index\.html$/, '');
    if (!path.endsWith('/')) path = path.replace(/[^/]*$/, '');
    return u.origin + path;
  } catch (e) {
    return CONFIG.site;
  }
}

async function authFetch(path, body, extra = {}) {
  const res = await fetch(SUPA + path, {
    method: 'POST',
    headers: { apikey: CONFIG.supabase.key, 'content-type': 'application/json', ...extra },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.msg || data.error_description || data.message || '요청을 처리하지 못했습니다.');
    err.status = res.status;
    err.code = data.error_code || data.error || 'auth_error';
    throw err;
  }
  return data;
}

export async function fetchSettings() {
  if (settingsCache) return settingsCache;
  try {
    const res = await fetch(SUPA + '/auth/v1/settings', { headers: { apikey: CONFIG.supabase.key } });
    if (res.ok) settingsCache = await res.json();
  } catch (e) { settingsCache = null; }
  return settingsCache || { external: {} };
}

export async function providerEnabled(name) {
  const s = await fetchSettings();
  return !!(s.external && s.external[name]);
}

export async function signInEmail(email, password) {
  const data = await authFetch('/auth/v1/token?grant_type=password', { email, password });
  const u = await loadUser(data.access_token);
  saveSession({ ...sessionFromToken(data), user: u });
  return currentUser();
}

/** 메일로 6자리 인증 코드를 보낸다. 링크가 아닌 코드만 온다. */
export async function sendEmailCode(email) {
  await authFetch('/auth/v1/otp', { email, create_user: true });
  return true;
}

/** 메일로 받은 6자리 코드를 확인한다. 신규 사용자는 signup 유형으로 한 번 더 시도한다. */
export async function verifyEmailCode(email, token) {
  let lastErr = null;
  for (const type of ['email', 'signup']) {
    try {
      const data = await authFetch('/auth/v1/verify', { type, email, token });
      const u = await loadUser(data.access_token);
      saveSession({ ...sessionFromToken(data), user: u });
      return currentUser();
    } catch (e) {
      lastErr = e;
      const m = String(e.code || '') + ' ' + String(e.message || '');
      const retriable = /expired|invalid|otp|token|not\s*found|signup|email/i.test(m);
      if (!retriable || e.status === 429) throw e;
    }
  }
  throw lastErr || new Error('코드를 확인하지 못했습니다.');
}

export function githubUrl() {
  const redirect = appRoot();
  return `${SUPA}/auth/v1/authorize?provider=github&redirect_to=${encodeURIComponent(redirect)}&flow_type=implicit&scopes=read:user%20user:email`;
}

/** LK ID 승인 주소. clientId는 엔진 설정(/api/config)에서 받아 쓴다. */
export function lkIdUrl(clientId) {
  const id = clientId || CONFIG.lk.clientId;
  if (!id) return '';
  const redirect = appRoot();
  const state = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  store.set('lk_state', state);
  return CONFIG.lk.authorize + '?client_id=' + encodeURIComponent(id) +
    '&redirect_uri=' + encodeURIComponent(redirect) +
    '&response_type=code&scope=' + encodeURIComponent(CONFIG.lk.scope || 'profile:basic') +
    '&state=' + encodeURIComponent(state);
}

/** 엔진에 LK 승인 코드를 건네고 Lamp 세션 토큰을 받는다. */
async function lkSession(code) {
  const base = CONFIG.edge.replace(/\/$/, '');
  let res;
  try {
    res = await fetch(base + '/api/lk/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, redirectUri: appRoot() })
    });
  } catch (e) {
    throw new Error('LK ID 확인 서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !data.token) {
    const msg = (data && data.error && data.error.message) || 'LK ID 로그인을 마치지 못했습니다.';
    throw new Error(msg);
  }
  return data;
}

async function loadUser(accessToken) {
  const res = await fetch(SUPA + '/auth/v1/user', {
    headers: { apikey: CONFIG.supabase.key, Authorization: 'Bearer ' + accessToken }
  });
  if (!res.ok) return null;
  return await res.json();
}

export async function refreshSession() {
  if (!session || !session.refresh_token) return null;
  try {
    const data = await authFetch('/auth/v1/token?grant_type=refresh_token', { refresh_token: session.refresh_token });
    saveSession({ ...sessionFromToken(data, session), user: session.user });
    return session;
  } catch (e) {
    saveSession(null);
    return null;
  }
}

/** 토큰이 만료됐으면 갱신한다. 네트워크 실패 시 기존 토큰을 유지한다. */
export async function ensureFresh() {
  if (!session) return null;
  if (Date.now() < (session.expires_at || 0)) return session;
  if (session.lk) { saveSession(null); return null; }   // LK 세션은 만료되면 다시 로그인한다.
  return await refreshSession();
}

export async function accessToken() {
  const s = await ensureFresh();
  return s ? s.access_token : '';
}

export function signOut() {
  saveSession(null);
}

/** OAuth 리다이렉트 결과를 흡수한다. */
export async function consumeRedirect() {
  const hash = window.location.hash || '';
  const search = window.location.search || '';

  if (hash.includes('access_token=')) {
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const payload = {
      access_token: params.get('access_token'),
      refresh_token: params.get('refresh_token'),
      expires_in: params.get('expires_in')
    };
    if (payload.access_token) {
      const u = await loadUser(payload.access_token);
      saveSession({ ...sessionFromToken(payload), user: u });
      history.replaceState(null, '', window.location.pathname + window.location.search.replace(/[?&]code=[^&]*/, ''));
      return true;
    }
  }

  if (hash.includes('error')) {
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const err = params.get('error_description') || params.get('error') || '로그인에 실패했습니다.';
    history.replaceState(null, '', window.location.pathname);
    throw new Error(decodeURIComponent(err.replace(/\+/g, ' ')));
  }

  // LK ID 콜백: ?code=...&state=...
  if (search.includes('code=') || search.includes('error=')) {
    const params = new URLSearchParams(search);
    const expected = store.get('lk_state', '');
    const code = params.get('code') || '';
    if (!code && params.get('state') !== expected) return false;

    history.replaceState(null, '', location.pathname);
    store.del('lk_state');

    if (!code) {
      throw new Error('LK ID 로그인이 취소되었습니다.');
    }
    if (!expected || params.get('state') !== expected) {
      throw new Error('LK ID 로그인 요청이 만료되었거나 출처가 다릅니다. Lamp에서 다시 시도해 주세요.');
    }

    const data = await lkSession(code);
    const u = data.user || {};
    saveSession({
      access_token: data.token,
      refresh_token: '',
      expires_at: data.expires_at || Date.now() + 29 * 86400000,
      lk: true,
      user: {
        id: u.id || '',
        email: u.email || '',
        user_metadata: { full_name: u.name || '', lk_color: u.color || '', lk_text: u.text || '' },
        app_metadata: { provider: 'lk' }
      }
    });
    return true;
  }
  return false;
}

export async function bootSession() {
  if (!session || !session.access_token) return null;
  if (!session.user) {
    const u = await loadUser(session.access_token);
    if (u) { session.user = u; saveSession(session); }
  }
  await ensureFresh();
  return session;
}
