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

export async function signUpEmail(email, password, name) {
  const data = await authFetch('/auth/v1/signup', { email, password, data: { full_name: name || '' } });
  if (data.access_token) {
    const u = await loadUser(data.access_token);
    saveSession({ ...sessionFromToken(data), user: u });
    return { confirmed: true, user: currentUser() };
  }
  return { confirmed: false, user: null };
}

export async function sendMagicLink(email) {
  await authFetch('/auth/v1/otp', { email, create_user: true });
  return true;
}

export async function verifyEmailCode(email, token) {
  const data = await authFetch('/auth/v1/verify', { type: 'email', email, token });
  const u = await loadUser(data.access_token);
  saveSession({ ...sessionFromToken(data), user: u });
  return currentUser();
}

export function githubUrl() {
  const redirect = CONFIG.site.replace(/\/$/, '') + '/';
  return `${SUPA}/auth/v1/authorize?provider=github&redirect_to=${encodeURIComponent(redirect)}&flow_type=implicit&scopes=read:user%20user:email`;
}

export function lkIdUrl() {
  if (!CONFIG.lk.clientId) return '';
  const redirect = CONFIG.site.replace(/\/$/, '') + '/';
  const state = Math.random().toString(36).slice(2, 10);
  store.set('lk_state', state);
  return CONFIG.lk.authorize + '?client_id=' + encodeURIComponent(CONFIG.lk.clientId) +
    '&redirect_uri=' + encodeURIComponent(redirect) +
    '&response_type=code&scope=' + encodeURIComponent(CONFIG.lk.scope) +
    '&state=' + encodeURIComponent(state);
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
  if (search.includes('code=') && search.includes('state=')) {
    const params = new URLSearchParams(search);
    const expected = store.get('lk_state', '');
    if (params.get('state') && params.get('state') === expected) {
      history.replaceState(null, '', window.location.pathname);
      const err = new Error('LK ID 승인은 확인됐지만 Lamp에는 아직 LK ID 앱 등록(client_id)이 없어 계정을 연결할 수 없습니다.');
      err.lkCode = params.get('code');
      throw err;
    }
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
