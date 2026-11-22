/* Lamp — 도구·생성기 · 설정 · 문서 */

import { $, $$, esc, fmtBytes, fmtDate, note, copyText, downloadText, downloadBlob } from './util.js';
import { icon } from './icons.js';
import { api } from './api.js';
import { state, rerender, errorBox, emptyBox, applyTheme, go } from './core.js';
import { selectHTML, bindSelects, getSelectValue, colorPickerHTML, bindColorPickers, getColor } from './ui.js';
import { privacyPage, termsPage, adsTxt, notFoundPage, robotsTxt, sitemapXml } from './seo.js';
import { qrSvg } from './qr.js';
import { signOut, currentUser, CONFIG } from './auth.js';
import { CONFIG as CFG } from './config.js';

const today = () => new Date().toISOString().slice(0, 10);

/* ================================================================ 도구 */

export async function toolsView() {
  const sites = state.sites || [];
  if (!sites.length) {
    return {
      title: '도구·생성기',
      sub: '문서 생성기는 사이트에 바로 배포합니다.',
      actions: '',
      body: emptyBox({ ico: 'tools', title: '먼저 사이트가 필요합니다', text: '생성기는 만든 사이트에 페이지를 추가합니다. 첫 사이트를 배포한 뒤 다시 오세요.', action: '<a class="btn btn--brand btn--sm mt-8" href="#/dashboard">사이트 만들기</a>' }),
      mount() {}
    };
  }

  const siteOptions = sites.map((s) => ({ value: s.slug, label: s.name, note: s.slug }));

  return {
    title: '도구·생성기',
    sub: '개인정보 처리방침, 이용약관, ads.txt, 404 페이지를 만들어 바로 배포합니다.',
    actions: '',
    body: `<div class="card">
      <div class="card__head"><div><div class="card__title">대상 사이트</div><div class="card__sub">생성한 페이지가 이 사이트에 배포됩니다</div></div></div>
      <div class="card__body" style="max-width:420px">${selectHTML({ name: 'tool-site', block: true, value: sites[0].slug, options: siteOptions })}</div>
    </div>

    <div class="tabs mt-16" role="tablist">
      <button class="tab" data-tab="privacy" aria-selected="true">개인정보 처리방침</button>
      <button class="tab" data-tab="terms" aria-selected="false">이용약관</button>
      <button class="tab" data-tab="ads" aria-selected="false">ads.txt</button>
      <button class="tab" data-tab="notfound" aria-selected="false">404 페이지</button>
      <button class="tab" data-tab="qr" aria-selected="false">QR·배지</button>
      <button class="tab" data-tab="image" aria-selected="false">이미지 압축</button>
    </div>

    <div data-panel="privacy">
      <div class="grid grid--site">
        <div class="card">
          <div class="card__head"><div><div class="card__title">개인정보 처리방침 초안</div><div class="card__sub">/privacy/ 페이지로 배포됩니다</div></div></div>
          <div class="card__body stack">
            <div class="grid grid--2" style="gap:12px">
              <div class="field"><label>사이트 이름</label><input class="input" data-pp="siteName" value="${esc(sites[0].name)}"></div>
              <div class="field"><label>운영자</label><input class="input" data-pp="operator" placeholder="운영자 이름 또는 상호"></div>
              <div class="field"><label>문의 이메일</label><input class="input" type="email" data-pp="email" placeholder="hello@example.com"></div>
              <div class="field"><label>시행일</label><input class="input" type="date" data-pp="effectiveDate" value="${today()}"></div>
            </div>
            <div class="field"><label>수집하는 개인정보</label>
              <div class="stack" style="gap:7px">
                <label class="check"><input type="checkbox" data-ppc="contact" checked> 문의 폼 (이름·이메일·내용)</label>
                <label class="check"><input type="checkbox" data-ppc="account"> 회원 계정</label>
                <label class="check"><input type="checkbox" data-ppc="order"> 주문·결제</label>
                <label class="check"><input type="checkbox" data-ppc="analytics" checked> 접속 기록(통계)</label>
                <label class="check"><input type="checkbox" data-ppc="ads"> Google AdSense 광고</label>
              </div>
            </div>
            <div class="row"><button class="btn btn--brand" data-act="deploy-privacy">${icon('rocket', 15)}<span>초안 만들고 배포</span></button>
              <button class="btn" data-act="preview-privacy">${icon('eye', 15)}<span>미리보기</span></button></div>
          </div>
        </div>
        <div class="card card--pad">
          <div class="section-title">배포 위치</div>
          <div class="code">/privacy/index.html</div>
          <div class="small muted mt-8">사이트 푸터나 설정 화면에서 이 주소로 링크하면 됩니다.</div>
          <div class="divider"></div>
          <div class="small muted">초안은 일반적인 형태로 만든 문서입니다. 실제 수집 항목과 보관 기간을 확인하고, 필요한 경우 법률 검토를 받으세요.</div>
        </div>
      </div>
    </div>

    <div data-panel="terms" hidden>
      <div class="grid grid--site">
        <div class="card">
          <div class="card__head"><div><div class="card__title">이용약관 초안</div><div class="card__sub">/terms/ 페이지로 배포됩니다</div></div></div>
          <div class="card__body stack">
            <div class="grid grid--2" style="gap:12px">
              <div class="field"><label>사이트 이름</label><input class="input" data-tp="siteName" value="${esc(sites[0].name)}"></div>
              <div class="field"><label>운영자</label><input class="input" data-tp="operator" placeholder="운영자 이름 또는 상호"></div>
              <div class="field"><label>문의 이메일</label><input class="input" type="email" data-tp="email" placeholder="hello@example.com"></div>
              <div class="field"><label>시행일</label><input class="input" type="date" data-tp="effectiveDate" value="${today()}"></div>
            </div>
            <div class="row">
              <label class="check"><input type="checkbox" data-tpc="account"> 회원 계정이 있습니다</label>
              <label class="check"><input type="checkbox" data-tpc="goods"> 상품·용역을 판매합니다</label>
            </div>
            <div class="row"><button class="btn btn--brand" data-act="deploy-terms">${icon('rocket', 15)}<span>초안 만들고 배포</span></button>
              <button class="btn" data-act="preview-terms">${icon('eye', 15)}<span>미리보기</span></button></div>
          </div>
        </div>
        <div class="card card--pad">
          <div class="section-title">배포 위치</div>
          <div class="code">/terms/index.html</div>
          <div class="small muted mt-8">약관·정책 페이지는 검색 결과에서 제외되도록 robots 메타를 넣지 않고, 사이트 구조에 맞게 자유롭게 고칠 수 있습니다.</div>
        </div>
      </div>
    </div>

    <div data-panel="ads" hidden>
      <div class="card">
        <div class="card__head"><div><div class="card__title">ads.txt 생성기</div><div class="card__sub">AdSense 게시자 ID만 있으면 됩니다</div></div></div>
        <div class="card__body stack" style="max-width:560px">
          <div class="field"><label>게시자 ID</label><input class="input input--mono" data-ads="publisherId" placeholder="pub-0000000000000000">
            <span class="hint">AdSense → 계정 정보에서 확인할 수 있습니다. pub- 를 붙여도 됩니다.</span></div>
          <div class="field"><label>직접 입력 (선택)</label><textarea class="textarea input--mono" data-ads="custom" placeholder="google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0"></textarea></div>
          <div class="row"><button class="btn btn--brand" data-act="deploy-ads">${icon('rocket', 15)}<span>ads.txt 배포</span></button>
            <button class="btn" data-act="copy-ads">${icon('copy', 15)}<span>내용 복사</span></button></div>
          <div class="note note--info">${icon('info', 16)}<div class="note__body">ads.txt는 사이트 루트(<code>/ads.txt</code>)에 있어야 합니다. 배포 후 1~2일 안에 광고 심사에 반영됩니다.</div></div>
        </div>
      </div>
    </div>

    <div data-panel="notfound" hidden>
      <div class="grid grid--site">
        <div class="card">
          <div class="card__head"><div><div class="card__title">404 페이지 생성기</div><div class="card__sub">404.html 로 배포됩니다</div></div></div>
          <div class="card__body stack">
            <div class="grid grid--2" style="gap:12px">
              <div class="field"><label>사이트 이름</label><input class="input" data-nf="siteName" value="${esc(sites[0].name)}"></div>
              <div class="field"><label>첫 화면 주소</label><input class="input input--mono" data-nf="homeUrl" value="/${esc(sites[0].slug)}/"></div>
            </div>
            <div class="field" style="max-width:200px"><label>강조 색</label>${colorPickerHTML({ name: 'nf-accent', value: '#f0a81e', label: '404 강조 색' })}</div>
            <div class="row"><button class="btn btn--brand" data-act="deploy-404">${icon('rocket', 15)}<span>만들고 배포</span></button>
              <button class="btn" data-act="preview-404">${icon('eye', 15)}<span>미리보기</span></button></div>
          </div>
        </div>
        <div class="card card--pad">
          <div class="section-title">동작 방식</div>
          <div class="small muted">없는 주소로 들어오면 이 페이지를 404 상태로 보여 줍니다. 방문자는 첫 화면으로 돌아갈 수 있습니다.</div>
        </div>
      </div>
    </div>

    <div data-panel="qr" hidden>
      <div class="grid grid--site">
        <div class="card">
          <div class="card__head"><div><div class="card__title">QR 코드와 배지</div><div class="card__sub">인쇄물·명함·발표 자료에 붙이세요</div></div></div>
          <div class="card__body stack">
            <div class="field"><label>주소</label><input class="input input--mono" data-qr="url" value="${esc(sites[0].url)}"></div>
            <div class="row" style="gap:16px;align-items:flex-end">
              <div class="field"><label>색</label>${colorPickerHTML({ name: 'qr-color', value: '#17150f', label: 'QR 색' })}</div>
              <div class="field"><label>크기</label>${selectHTML({ name: 'qr-size', value: '320', options: [{ value: '220', label: '작게 (220px)' }, { value: '320', label: '보통 (320px)' }, { value: '512', label: '크게 (512px)' }] })}</div>
            </div>
            <div class="row">
              <button class="btn btn--sm" data-act="qr-svg">${icon('download', 14)}<span>SVG 저장</span></button>
              <button class="btn btn--sm" data-act="qr-png">${icon('download', 14)}<span>PNG 저장</span></button>
              <button class="btn btn--sm" data-act="copy" data-value="&lt;img src=&quot;${esc((state.base || 'https://lamp-edge.helpaboutflux.workers.dev') + '/__lamp/badge.svg?label=Powered by Lamp')}&quot; alt=&quot;Lamp&quot;&gt;">${icon('tag', 14)}<span>배지 코드 복사</span></button>
            </div>
          </div>
        </div>
        <div class="card card--pad" style="display:grid;place-items:center">
          <div data-qr-host style="background:#fff;padding:14px;border-radius:16px;border:1px solid var(--line)">${qrSvg(sites[0].url, { size: 240 })}</div>
          <div class="small dim mt-8">휴대폰 카메라로 스캔</div>
        </div>
      </div>
    </div>

    <div data-panel="image" hidden>
      <div class="grid grid--site">
        <div class="card">
          <div class="card__head"><div><div class="card__title">이미지 압축</div><div class="card__sub">브라우저 안에서만 처리합니다. 서버로 보내지 않습니다.</div></div></div>
          <div class="card__body stack">
            <div class="field"><label>이미지 선택</label><input class="input" type="file" accept="image/*" data-img-input></div>
            <div class="row" style="gap:16px">
              <div class="field" style="max-width:220px"><label>최대 너비</label>
                ${selectHTML({ name: 'img-width', value: '1600', options: [{ value: '800', label: '800px' }, { value: '1280', label: '1280px' }, { value: '1600', label: '1600px' }, { value: '2400', label: '2400px' }] })}
              </div>
              <div class="field" style="flex:1"><label>품질 <span data-q-label class="dim">78</span></label>
                <input type="range" min="40" max="95" value="78" data-img-quality style="width:100%">
              </div>
            </div>
            <div data-img-result class="small dim">이미지를 선택하면 원본과 압축 결과를 비교해 보여 드립니다.</div>
          </div>
        </div>
        <div class="card card--pad">
          <div class="section-title">팁</div>
          <div class="small muted stack" style="gap:8px">
            <div>사이트 용량은 10MB까지입니다. 사진은 1600px·품질 78이면 웬만한 화면에서 충분합니다.</div>
            <div>압축한 파일은 내려받은 뒤 IDE의 새 파일로 추가하거나 폴더에 넣어 다시 배포하세요.</div>
          </div>
        </div>
      </div>
    </div>`,
    mount(root) {
      bindSelects(root);
      bindColorPickers(root);
      bindTools(root);
    }
  };
}

function siteBySlugFrom(root) {
  const slug = getSelectValue(root, 'tool-site') || (state.sites[0] && state.sites[0].slug);
  return state.sites.find((s) => s.slug === slug) || state.sites[0];
}

function bindTools(root) {
  const tabs = root.querySelectorAll('[data-tab]');
  tabs.forEach((t) => t.addEventListener('click', () => {
    tabs.forEach((x) => x.setAttribute('aria-selected', String(x === t)));
    root.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== t.dataset.tab; });
  }));

  const val = (sel) => { const el = root.querySelector(sel); return el ? el.value : ''; };
  const checked = (sel) => { const el = root.querySelector(sel); return el ? el.checked : false; };

  const deployPages = async (pages, label) => {
    const site = siteBySlugFrom(root);
    if (!site) return;
    try {
      const upsert = pages.map(([path, text]) => ({ path, text, type: 'text/html; charset=utf-8' }));
      const res = await api.patchFiles(site.slug, upsert, [], label);
      note('ok', label + ' 완료 · v' + res.deploy.v);
      const url = site.url.replace(/\/$/, '') + '/' + pages[0][0].replace(/\/index\.html$/, '/') + '/';
      root.querySelector('[data-tools-msg]');
      const st = document.createElement('div');
      st.className = 'note note--ok mt-16';
      st.innerHTML = `${icon('check', 16)}<div class="note__body"><b>${esc(label)} 완료</b>
        새 버전 v${res.deploy.v}로 배포했습니다. <a class="link" href="${esc(url)}" target="_blank" rel="noopener">페이지 열기 ${icon('external', 12)}</a></div>`;
      (root.querySelector('[data-panel="' + (label.includes('약관') ? 'terms' : label.includes('ads') ? 'ads' : label.includes('404') ? 'notfound' : 'privacy') + '"]') || root.querySelector('.tabs')).after(st);
    } catch (e) {
      note('bad', e.message);
    }
  };

  const openPreview = (html, title) => {
    const w = window.open('', '_blank');
    if (!w) { note('warn', '브라우저가 새 창을 막았습니다. 팝업 차단을 해제해 주세요.'); return; }
    w.document.write(html);
    w.document.title = title;
    w.document.close();
  };

  const privacyOpts = () => ({
    siteName: val('[data-pp="siteName"]') || '우리 사이트',
    operator: val('[data-pp="operator"]') || '운영자',
    email: val('[data-pp="email"]') || 'hello@example.com',
    effectiveDate: val('[data-pp="effectiveDate"]') || today(),
    collects: ['contact', 'account', 'order'].filter((k) => checked('[data-ppc="' + k + '"]')),
    analytics: checked('[data-ppc="analytics"]'),
    ads: checked('[data-ppc="ads"]')
  });

  const termsOpts = () => ({
    siteName: val('[data-tp="siteName"]') || '우리 사이트',
    operator: val('[data-tp="operator"]') || '운영자',
    email: val('[data-tp="email"]') || 'hello@example.com',
    effectiveDate: val('[data-tp="effectiveDate"]') || today(),
    usesAccount: checked('[data-tpc="account"]'),
    sellsGoods: checked('[data-tpc="goods"]')
  });

  root.querySelector('[data-act="deploy-privacy"]')?.addEventListener('click', () => {
    deployPages([['privacy/index.html', privacyPage(privacyOpts())]], '개인정보 처리방침 배포');
  });
  root.querySelector('[data-act="preview-privacy"]')?.addEventListener('click', () => openPreview(privacyPage(privacyOpts()), '개인정보 처리방침'));
  root.querySelector('[data-act="deploy-terms"]')?.addEventListener('click', () => {
    deployPages([['terms/index.html', termsPage(termsOpts())]], '이용약관 배포');
  });
  root.querySelector('[data-act="preview-terms"]')?.addEventListener('click', () => openPreview(termsPage(termsOpts()), '이용약관'));

  root.querySelector('[data-act="deploy-ads"]')?.addEventListener('click', async () => {
    const site = siteBySlugFrom(root);
    const text = adsTxt({ publisherId: val('[data-ads="publisherId"]'), custom: val('[data-ads="custom"]') });
    if (!text) { note('warn', '게시자 ID 또는 ads.txt 내용을 입력해 주세요.'); return; }
    try {
      const res = await api.patchFiles(site.slug, [{ path: 'ads.txt', text, type: 'text/plain; charset=utf-8' }], [], 'ads.txt 배포');
      note('ok', 'ads.txt를 배포했습니다. v' + res.deploy.v);
    } catch (e) { note('bad', e.message); }
  });
  root.querySelector('[data-act="copy-ads"]')?.addEventListener('click', async () => {
    const text = adsTxt({ publisherId: val('[data-ads="publisherId"]'), custom: val('[data-ads="custom"]') });
    if (!text) { note('warn', '게시자 ID를 입력해 주세요.'); return; }
    const ok = await copyText(text);
    note(ok ? 'ok' : 'bad', ok ? '복사했습니다.' : '복사하지 못했습니다.');
  });

  const nfOptions = () => ({
    siteName: val('[data-nf="siteName"]') || '우리 사이트',
    homeUrl: val('[data-nf="homeUrl"]') || '/',
    accent: getColor(root, 'nf-accent') || '#f0a81e'
  });
  root.querySelector('[data-act="deploy-404"]')?.addEventListener('click', () => {
    const o = nfOptions();
    deployPages([['404.html', notFoundPage(o)]], '404 페이지 배포');
  });
  root.querySelector('[data-act="preview-404"]')?.addEventListener('click', () => openPreview(notFoundPage(nfOptions()), '404'));

  const rerenderQr = () => {
    const host = root.querySelector('[data-qr-host]');
    if (!host) return;
    const url = val('[data-qr="url"]') || siteBySlugFrom(root).url;
    const color = getColor(root, 'qr-color') || '#17150f';
    const size = Number(getSelectValue(root, 'qr-size') || 220);
    try {
      host.innerHTML = qrSvg(url, { size: Math.min(size, 260), dark: color });
    } catch (e) {
      host.innerHTML = `<div class="small dim">${esc(e.message)}</div>`;
    }
  };
  root.querySelector('[data-qr="url"]')?.addEventListener('input', rerenderQr);
  root.querySelectorAll('.cp').forEach((cp) => cp.addEventListener('click', () => setTimeout(rerenderQr, 30)));
  root.querySelectorAll('.sel__opt').forEach((o) => o.addEventListener('click', () => setTimeout(rerenderQr, 30)));

  const qrTarget = () => ({
    url: (root.querySelector('[data-qr="url"]') || {}).value || siteBySlugFrom(root).url,
    color: getColor(root, 'qr-color') || '#17150f',
    size: Number(getSelectValue(root, 'qr-size') || 220)
  });

  root.querySelector('[data-act="qr-svg"]')?.addEventListener('click', () => {
    const q = qrTarget();
    downloadText('lamp-qr.svg', qrSvg(q.url, { size: q.size, dark: q.color }), 'image/svg+xml');
  });
  root.querySelector('[data-act="qr-png"]')?.addEventListener('click', () => {
    const q = qrTarget();
    const svg = qrSvg(q.url, { size: q.size, dark: q.color });
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = q.size;
      canvas.height = q.size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, q.size, q.size);
      ctx.drawImage(img, 0, 0, q.size, q.size);
      canvas.toBlob((blob) => { if (blob) downloadBlob('lamp-qr.png', blob); }, 'image/png');
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });

  // 이미지 압축
  const imgInput = root.querySelector('[data-img-input]');
  const quality = root.querySelector('[data-img-quality]');
  const qLabel = root.querySelector('[data-q-label]');
  quality?.addEventListener('input', () => { if (qLabel) qLabel.textContent = quality.value; });
  imgInput?.addEventListener('change', async () => {
    const file = imgInput.files[0];
    if (!file) return;
    const out = root.querySelector('[data-img-result]');
    out.innerHTML = `<div class="small dim">처리하는 중입니다.</div>`;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      const maxW = Number(getSelectValue(root, 'img-width') || 1600);
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/webp', Number(quality.value) / 100));
      const before = file.size;
      const after = blob.size;
      out.innerHTML = `<div class="row" style="gap:14px;align-items:flex-start">
        <div style="flex:1"><div class="metric"><b>${fmtBytes(before)} → ${fmtBytes(after)}</b><span>${Math.round((1 - after / before) * 100)}% 줄었습니다 · ${canvas.width}×${canvas.height} WebP</span></div></div>
        <button class="btn btn--sm btn--brand" data-act="img-save">내려받기</button>
      </div>`;
      out.querySelector('[data-act="img-save"]').addEventListener('click', () => {
        downloadBlob(file.name.replace(/\.[^.]+$/, '') + '.webp', blob);
        note('ok', '압축한 이미지를 내려받았습니다.');
      });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

/* ================================================================ 설정 */

export async function settingsView() {
  let keys = [];
  try { keys = (await api.keys()).keys || []; } catch (e) { keys = []; }
  const user = state.user || currentUser() || {};

  return {
    title: '설정',
    sub: '계정, API 키, 화면 테마를 관리합니다.',
    actions: '',
    body: `<div class="grid grid--2">
      <div class="card card--pad">
        <div class="section-title">계정</div>
        <div class="row" style="gap:14px">
          <span class="account__av" style="width:44px;height:44px;font-size:16px">${user.avatar ? `<img src="${esc(user.avatar)}" alt="">` : esc((user.name || 'L')[0])}</span>
          <div><b>${esc(user.name || '이름 없음')}</b><div class="small dim">${esc(user.email || '이메일 없음')}</div></div>
        </div>
        <div class="divider"></div>
        <div class="kv small">
          <dt>로그인 방식</dt><dd>${esc(user.provider || 'email')}</dd>
          <dt>플랜</dt><dd>무료 (사이트 ${state.sites.length} / ${state.limits.sitesPerUser})</dd>
          <dt>월 비용</dt><dd><b>0원</b></dd>
        </div>
        <div class="row mt-16"><button class="btn btn--sm btn--danger" data-act="sign-out">로그아웃</button></div>
      </div>

      <div class="card card--pad">
        <div class="section-title">화면</div>
        <div class="stack">
          <div class="row"><span class="small">테마</span><span class="spacer"></span>
            <div class="seg">
              <button class="seg__btn" data-theme-set="light" aria-pressed="${state.theme === 'light'}">라이트</button>
              <button class="seg__btn" data-theme-set="dark" aria-pressed="${state.theme === 'dark'}">다크</button>
            </div>
          </div>
          <div class="small dim">설정은 이 브라우저에 저장됩니다.</div>
        </div>
        <div class="divider"></div>
        <div class="section-title">한도</div>
        <div class="kv small">
          <dt>사이트</dt><dd>${state.sites.length} / ${state.limits.sitesPerUser}개</dd>
          <dt>사이트 용량</dt><dd>10MB</dd>
          <dt>배포 속도</dt><dd>1분에 5회</dd>
          <dt>버전 보관</dt><dd>사이트당 20개</dd>
        </div>
      </div>

      <div class="card card--pad" style="grid-column:1/-1">
        <div class="row"><div class="section-title" style="margin:0">API 키</div><span class="spacer"></span>
          <button class="btn btn--sm btn--brand" data-act="new-key">${icon('key', 14)}<span>키 만들기</span></button></div>
        <div class="small muted mt-8">명령줄이나 GitHub Actions에서 배포할 때 씁니다. 키는 만든 순간에만 보이니 안전한 곳에 보관하세요.</div>
        <div data-key-result class="mt-8"></div>
        <div class="mt-16">
          ${keys.length ? `<div class="table-wrap"><table class="table">
            <thead><tr><th>이름</th><th>만든 날</th><th>ID</th><th></th></tr></thead>
            <tbody>${keys.map((k) => `<tr><td>${esc(k.label)}</td><td class="small dim">${fmtDate(k.created)}</td>
              <td class="mono tiny">${esc(k.id)}</td>
              <td style="text-align:right"><button class="btn btn--sm btn--danger" data-act="revoke-key" data-id="${esc(k.id)}">삭제</button></td></tr>`).join('')}</tbody>
          </table></div>` : `<div class="small dim">아직 발급한 키가 없습니다.</div>`}
        </div>
        <div class="divider"></div>
        <div class="section-title">명령줄에서 배포하기</div>
        <div class="code">curl -X POST ${esc(state.base || CFG.edge)}/api/sites/내-주소/deploy \\
  -H "x-lamp-key: lamp_발급받은키" \\
  -H "content-type: application/json" \\
  -d '{"files":[{"path":"index.html","text":"<h1>hello</h1>"}]}'</div>
      </div>

      <div class="card card--pad" style="grid-column:1/-1">
        <div class="section-title">연결 상태</div>
        <div class="kv small">
          <dt>배포 엔진</dt><dd>${esc(state.base || CFG.edge)}</dd>
          <dt>로그인</dt><dd>Supabase · ${esc(CONFIG.supabase.url)}</dd>
          <dt>버전</dt><dd>Lamp v${CFG.version}</dd>
        </div>
      </div>
    </div>`,
    mount(root) {
      root.querySelectorAll('[data-theme-set]').forEach((b) => b.addEventListener('click', () => {
        applyTheme(b.dataset.themeSet);
        root.querySelectorAll('[data-theme-set]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      }));

      root.querySelector('[data-act="sign-out"]')?.addEventListener('click', () => {
        signOut();
        location.hash = '#/';
        location.reload();
      });

      root.querySelector('[data-act="new-key"]')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          const res = await api.createKey('CLI 키 ' + new Date().toLocaleDateString('ko-KR'));
          root.querySelector('[data-key-result]').innerHTML = `<div class="note note--warn">${icon('key', 16)}<div class="note__body">
            <b>이 키는 지금만 보입니다</b>
            <div class="row mt-8"><code class="code" style="flex:1;overflow-wrap:anywhere">${esc(res.key)}</code>
            <button class="btn btn--sm" data-act="copy" data-value="${esc(res.key)}">${icon('copy', 14)}<span>복사</span></button></div></div></div>`;
          root.querySelector('[data-key-result] [data-act="copy"]').addEventListener('click', async (ev) => {
            const ok = await copyText(ev.currentTarget.dataset.value);
            note(ok ? 'ok' : 'bad', ok ? '복사했습니다.' : '복사하지 못했습니다.');
          });
          note('ok', 'API 키를 만들었습니다.');
        } catch (err) { note('bad', err.message); }
        btn.disabled = false;
      });

      root.querySelectorAll('[data-act="revoke-key"]').forEach((b) => b.addEventListener('click', async () => {
        try {
          await api.deleteKey(b.dataset.id);
          note('ok', '키를 삭제했습니다.');
          rerender();
        } catch (e) { note('bad', e.message); }
      }));
    }
  };
}

/* ================================================================ 문서 */

export function docsView() {
  const sections = [
    ['start', '시작하기', `<ol class="doc-list">
      <li>로그인합니다. 이메일 링크 또는 GitHub 계정으로 들어옵니다.</li>
      <li>대시보드에서 <b>새 사이트</b>를 누르고 주소와 이름을 정합니다.</li>
      <li>사이트 폴더나 ZIP을 끌어다 놓습니다. index.html이 첫 화면이 됩니다.</li>
      <li>만들어진 주소를 공유합니다. 끝입니다.</li>
    </ol>`],
    ['rules', '배포 규칙 파일', `<div class="stack small">
      <div><code class="code--inline">_redirects</code> — 한 줄에 <code class="code--inline">/옛주소 /새주소 301</code>. <code class="code--inline">*</code> 와 <code class="code--inline">:splat</code> 을 지원합니다.</div>
      <div><code class="code--inline">_headers</code> — <code class="code--inline">/*</code> 같은 경로 줄 아래에 <code class="code--inline">X-Frame-Options: DENY</code> 처럼 헤더를 적습니다.</div>
      <div><code class="code--inline">404.html</code> — 없는 주소로 들어왔을 때 보여 줄 페이지.</div>
      <div><code class="code--inline">index.html</code> — 폴더 주소로 들어왔을 때 열리는 파일.</div>
    </div>`],
    ['limits', '한도', `<div class="kv small">
      <dt>사이트</dt><dd>계정당 10개</dd>
      <dt>용량</dt><dd>사이트당 10MB, 한 번에 300개 파일</dd>
      <dt>버전</dt><dd>사이트당 20개 보관</dd>
      <dt>배포 속도</dt><dd>1분 5회 (넘으면 잠시 차단)</dd>
      <dt>폼</dt><dd>폼당 200건까지 목록 표시</dd>
    </div>`],
    ['security', '안전과 개인정보', `<div class="stack small">
      <div>비밀번호를 외부로 보내는 폼, 다른 서비스 로그인을 흉내 내는 화면, 난독화된 스크립트는 배포 전에 차단하고 이유를 알려 드립니다.</div>
      <div>방문자 분석은 페이지 조회 수만 셉니다. IP·쿠키·개인 식별 정보를 저장하지 않습니다.</div>
      <div>사이트를 비밀번호로 잠그면 잠금 화면을 먼저 보여 주고, 통과한 브라우저에만 하루 동안 열어 줍니다.</div>
    </div>`],
    ['domain', '커스텀 도메인', `<ol class="doc-list">
      <li>Cloudflare에 도메인을 추가하고 네임서버를 Cloudflare로 지정합니다.</li>
      <li>DNS에 <code class="code--inline">CNAME www → lamp-edge.helpaboutflux.workers.dev</code> 를 만듭니다.</li>
      <li>Workers → lamp-edge → Settings → Domains &amp; Routes 에서 도메인을 추가합니다.</li>
      <li>Lamp 사이트 설정에 도메인을 적어 둡니다.</li>
    </ol>`],
    ['api', 'API로 배포하기', `<div class="small">설정에서 API 키를 만들고 아래처럼 호출합니다.</div>
      <div class="code mt-8">POST ${esc((state.base || CFG.edge))}/api/sites/&lt;slug&gt;/deploy
x-lamp-key: lamp_...
content-type: application/json

{"files":[{"path":"index.html","text":"<h1>hi</h1>"}],"message":"CI 배포"}</div>
      <div class="small muted mt-8">GET /api/sites, GET /api/sites/&lt;slug&gt;/analytics, POST /api/sites/&lt;slug&gt;/rollback 도 같은 키로 호출합니다.</div>`]
  ];

  return {
    title: '문서',
    sub: 'Lamp 사용법과 한도, 안전 정책을 정리했습니다.',
    actions: '',
    body: `<div class="grid grid--site">
      <div class="stack">
        ${sections.map(([id, title, content]) => `<div class="card card--pad" id="${id}">
          <div class="section-title">${esc(title)}</div>
          <div class="doc-body">${content}</div>
        </div>`).join('')}
      </div>
      <div class="card card--pad" style="position:sticky;top:96px">
        <div class="eyebrow">목차</div>
        <div class="stack mt-8" style="gap:6px">
          ${sections.map(([id, title]) => `<a class="link link--muted small" href="#${'/' + 'docs'}#${id}" data-doc="${id}">${esc(title)}</a>`).join('')}
        </div>
        <div class="divider"></div>
        <div class="small dim">배포 엔진: Cloudflare Workers + KV<br>Lamp v${CFG.version}</div>
      </div>
    </div>`,
    mount(root) {
      root.querySelectorAll('[data-doc]').forEach((a) => a.addEventListener('click', (e) => {
        e.preventDefault();
        const el = root.querySelector('#' + a.dataset.doc);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }));
    }
  };
}
