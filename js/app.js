/* Lamp — 진입점, 라우터, 공통 이벤트 */

import { $, $$, esc, note, store } from './util.js';
import { icon } from './icons.js';
import { CONFIG } from './config.js';
import {
  consumeRedirect, bootSession, isSignedIn, currentUser, signOut, getSession
} from './auth.js';
import { state, setRenderer, applyTheme, toggleTheme, parseHash, go, paint, paintNav, rerender, errorBox } from './core.js';
import { api } from './api.js';
import { closeAllPops } from './ui.js';
import { landingView, loginView, dashboardView, sitesView, deploysView, domainsView, analyticsView, formsAllView } from './views-main.js';
import { siteView } from './views-site.js';
import { toolsView, settingsView, docsView } from './views-tools.js';

let renderToken = 0;
let bootError = '';

/* ---------------------------------------------------------------- 뼈대 */

function showAuth(html) {
  $('#app').hidden = true;
  $('#auth').hidden = false;
  $('#auth').innerHTML = html;
  $('#boot').hidden = true;
}

function showApp() {
  $('#auth').hidden = true;
  $('#auth').innerHTML = '';
  $('#app').hidden = false;
}

function setNavOpen(open) {
  const sb = $('#sidebar');
  const scrim = $('#scrim');
  if (!sb) return;
  sb.classList.toggle('is-open', open);
  if (scrim) scrim.classList.toggle('is-open', open);
}

/* ---------------------------------------------------------------- 라우터 */

async function route() {
  const token = ++renderToken;
  const r = parseHash();
  state.route = r;
  $('#boot').hidden = true;

  if (!isSignedIn()) {
    showAuth('');
    const view = r.name === 'login' || bootError ? await loginView() : landingView();
    if (token !== renderToken) return;
    $('#auth').innerHTML = (view && view.body) || '';
    if (view && view.mount && $('#auth')) view.mount($('#auth'));
    if (bootError) {
      const host = document.createElement('div');
      host.className = 'note note--bad';
      host.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:18px;z-index:200;max-width:min(560px,92vw)';
      host.innerHTML = `${icon('alert', 16)}<div class="note__body"><b>로그인을 마치지 못했습니다</b>${esc(bootError)}</div>`;
      document.body.appendChild(host);
      setTimeout(() => host.remove(), 9000);
      bootError = '';
    }
    if (r.name === 'login' || !$('#auth').querySelector('.landing')) return;
    return;
  }

  if (r.name === 'root' || r.name === 'login') { location.replace('#/dashboard'); return; }

  showApp();
  paintNav();

  let view;
  try {
    if (r.name === 'dashboard') view = await dashboardView();
    else if (r.name === 'sites') view = await sitesView();
    else if (r.name === 'site') view = await siteView(r);
    else if (r.name === 'deploys') view = await deploysView();
    else if (r.name === 'domains') view = await domainsView();
    else if (r.name === 'analytics') view = await analyticsView();
    else if (r.name === 'forms') view = await formsAllView();
    else if (r.name === 'tools') view = await toolsView();
    else if (r.name === 'settings') view = await settingsView();
    else if (r.name === 'docs') view = docsView();
    else view = await dashboardView();
  } catch (e) {
    if (e.status === 401) {
      signOut();
      showAuth('');
      const login = await loginView();
      $('#auth').innerHTML = login.body;
      login.mount($('#auth'));
      return;
    }
    view = {
      title: '문제가 발생했습니다',
      sub: '',
      actions: `<button class="btn" data-act="retry">${icon('refresh', 16)}<span>다시 시도</span></button>`,
      body: errorBox(e),
      mount() {}
    };
  }

  if (token !== renderToken) return;
  paint({ title: view.title, sub: view.sub, actions: view.actions || '' });
  const host = $('#view');
  host.innerHTML = view.body || '';
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'auto' : 'auto' });
  if (view.mount) {
    try { await view.mount(host); } catch (e) { host.prepend(document.createRange().createContextualFragment(errorBox(e))); }
  }
  if (r.query && r.query.get('new') === '1') {
    const btn = host.querySelector('[data-act="quick-deploy"]');
    if (btn) btn.click();
  }
}

setRenderer(route);

/* ---------------------------------------------------------------- 공통 이벤트 */

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) {
    if (!e.target.closest('.sel, .cp')) closeAllPops();
    return;
  }
  const act = el.dataset.act;
  if (act === 'toggle-theme') {
    toggleTheme();
    if (state.route.name === '' || state.route.name === 'root' || state.route.name === 'login') route();
  }
  if (act === 'nav-open') setNavOpen(true);
  if (act === 'nav-close') setNavOpen(false);
  if (act === 'go') {
    setNavOpen(false);
    go(el.dataset.path);
  }
  if (act === 'go-account') go('/settings');
  if (act === 'quick-deploy') {
    if (state.sites.length) {
      go('/site/' + encodeURIComponent(state.sites[0].slug) + '/deploy');
    } else {
      const form = document.querySelector('[data-new-site]');
      const wrap = document.querySelector('[data-deploy-wrap]');
      if (form) {
        form.hidden = false;
        if (wrap) wrap.hidden = true;
        const name = form.querySelector('[data-ns-name]');
        if (name) name.focus();
      }
    }
  }
  if (act === 'retry') rerender();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeAllPops(); setNavOpen(false); }
});

window.addEventListener('hashchange', () => {
  closeAllPops();
  setNavOpen(false);
  route();
});

/* ---------------------------------------------------------------- 부팅 */

async function boot() {
  applyTheme(state.theme || 'light');

  try {
    await consumeRedirect();
  } catch (e) {
    bootError = e.message || String(e);
  }

  try { await bootSession(); } catch (e) { /* 세션 없음 */ }
  state.user = currentUser();

  if (isSignedIn()) {
    try {
      const cfg = await api.engineConfig();
      state.base = cfg.base || CONFIG.edge;
      state.limits = cfg.limits || state.limits;
    } catch (e) { state.base = CONFIG.edge; }
    try {
      const me = await api.me();
      if (me && me.user) state.user = me.user;
      const res = await api.sites();
      state.sites = res.sites || [];
    } catch (e) {
      if (e.status === 401) { signOut(); state.user = null; }
    }
  }

  await route();
}

boot();
