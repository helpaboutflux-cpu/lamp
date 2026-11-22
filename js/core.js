/* Lamp — 앱 상태와 공통 렌더링 */

import { $, esc, store, note, inlineNote } from './util.js';
import { icon } from './icons.js';
import { api } from './api.js';
import { currentUser, isSignedIn } from './auth.js';

export const state = {
  user: null,
  sites: [],
  limits: { sitesPerUser: 10, bytesPerSite: 10485760, deploysPerMinute: 5 },
  base: '',
  route: { name: 'landing', params: {} },
  theme: store.get('theme', 'light'),
  loadingSites: false,
  lastError: ''
};

let renderer = () => {};
export function setRenderer(fn) { renderer = fn; }
export function rerender() { renderer(); }

export function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  store.set('theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#100f0c' : '#f6f4ee');
  const label = $('#themeLabel');
  const ico = $('#themeIco');
  if (label) label.textContent = theme === 'dark' ? '라이트 모드' : '다크 모드';
  if (ico) ico.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon', 17);
}

export function toggleTheme() {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
}

/* ---------------------------------------------------------------- 라우팅 */

export function parseHash() {
  const raw = (location.hash || '#/').replace(/^#/, '');
  const [pathPart, queryPart] = raw.split('?');
  const seg = pathPart.split('/').filter(Boolean);
  const query = new URLSearchParams(queryPart || '');
  if (!seg.length) return { name: 'root', params: {}, query };
  const name = seg[0];
  if (name === 'site' && seg[1]) {
    return { name: 'site', params: { slug: seg[1], tab: seg[2] || 'overview' }, query };
  }
  return { name, params: Object.fromEntries(seg.slice(1).map((v, i) => [i, v])), query };
}

export function go(path) {
  if (location.hash === '#' + path) { renderer(); return; }
  location.hash = path;
}

/* ---------------------------------------------------------------- 데이터 */

export async function loadSites(force = false) {
  if (state.loadingSites) return state.sites;
  if (state.sites.length && !force) return state.sites;
  state.loadingSites = true;
  try {
    const res = await api.sites();
    state.sites = res.sites || [];
    state.lastError = '';
  } catch (e) {
    state.lastError = e.message;
    if (e.status === 401) { state.sites = []; }
    else throw e;
  } finally {
    state.loadingSites = false;
  }
  return state.sites;
}

export function siteBySlug(slug) {
  return state.sites.find((s) => s.slug === slug) || null;
}

/* ---------------------------------------------------------------- 페이지 뼈대 */

export function paint({ title, sub = '', actions = '' }) {
  $('#pageTitle').textContent = title;
  $('#pageSub').textContent = sub;
  $('#topActions').innerHTML = actions;
}

export function paintNav() {
  const nav = $('#nav');
  if (!nav) return;
  const r = state.route;
  const is = (name, extra) => (r.name === name || (extra && extra())) ? ' aria-current="page"' : '';
  const count = state.sites.length;
  nav.innerHTML = `
    <button class="nav__item"${is('dashboard')} data-act="go" data-path="/dashboard">${icon('dashboard', 18)}<span>대시보드</span></button>
    <button class="nav__item"${is('sites', () => r.name === 'site')} data-act="go" data-path="/sites">${icon('sites', 18)}<span>사이트</span>${count ? `<span class="nav__count">${count}</span>` : ''}</button>
    <button class="nav__item"${is('deploys')} data-act="go" data-path="/deploys">${icon('deploys', 18)}<span>배포</span></button>
    <button class="nav__item"${is('domains')} data-act="go" data-path="/domains">${icon('domains', 18)}<span>도메인</span></button>
    <div class="nav__label">관리</div>
    <button class="nav__item"${is('analytics')} data-act="go" data-path="/analytics">${icon('analytics', 18)}<span>방문자 분석</span></button>
    <button class="nav__item"${is('forms')} data-act="go" data-path="/forms">${icon('forms', 18)}<span>Forms</span></button>
    <button class="nav__item"${is('tools')} data-act="go" data-path="/tools">${icon('tools', 18)}<span>도구·생성기</span></button>
    <div class="nav__label">계정</div>
    <button class="nav__item"${is('settings')} data-act="go" data-path="/settings">${icon('settings', 18)}<span>설정</span></button>
    <button class="nav__item"${is('docs')} data-act="go" data-path="/docs">${icon('book', 18)}<span>문서</span></button>
  `;

  const user = state.user || currentUser();
  const av = $('#acctAvatar');
  const nameEl = $('#acctName');
  const mailEl = $('#acctMail');
  if (av) {
    if (user && user.avatar) av.innerHTML = `<img src="${esc(user.avatar)}" alt="">`;
    else av.textContent = (user && user.name ? user.name.trim()[0] : 'L').toUpperCase();
  }
  if (nameEl) nameEl.textContent = user ? user.name : '로그인';
  if (mailEl) mailEl.textContent = user ? (user.email || 'Lamp 계정') : '계정을 연결하세요';
}

/* ---------------------------------------------------------------- 알림 */

export function flash(kind, text) { note(kind, text); }

export function errorBox(e, title = '문제가 발생했습니다') {
  if (e && e.extra && e.extra.reasons && e.extra.reasons.length) {
    return inlineNote('bad', title, `<div>${esc(e.message)}</div><ul>${e.extra.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`);
  }
  return inlineNote('bad', title, esc(e && e.message ? e.message : String(e)));
}

export function emptyBox({ ico = 'deploys', title, text, action = '' }) {
  return `<div class="empty">
    <div class="empty__ico">${icon(ico, 22)}</div>
    <h3>${esc(title)}</h3>
    <p>${esc(text)}</p>
    ${action}
  </div>`;
}

/* ---------------------------------------------------------------- 사이트 썸네일 */

const THUMB_COLORS = ['#f0a81e', '#2f7a5f', '#2d5b8e', '#7c4dbe', '#b4392a', '#0f7b6c', '#a96a10', '#4a4a8a'];

export function thumbFor(site) {
  const label = (site.name || site.slug || 'L').replace(/[^가-힣a-zA-Z0-9 ]/g, '').trim().slice(0, 2) || 'L';
  let h = 0;
  for (const ch of String(site.slug || '')) h = (h * 31 + ch.charCodeAt(0)) % 997;
  const color = THUMB_COLORS[h % THUMB_COLORS.length];
  return `<span class="thumb" style="background:${color}1a;color:${color};border-color:${color}33">${esc(label.toUpperCase())}</span>`;
}

export { isSignedIn };
export { esc, icon, inlineNote };
export { note };
