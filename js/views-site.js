/* Lamp — 사이트 상세 (개요·배포·설정) */

import { $, $$, esc, fmtBytes, fmtNum, relTime, copyText, downloadBlob, note } from './util.js';
import { icon } from './icons.js';
import { api, downloadZip } from './api.js';
import { inlineNote, errorBox, emptyBox, thumbFor, rerender, state, go } from './core.js';
import { deployPanelHTML, mountDeployPanel } from './deploy.js';
import { selectHTML, bindSelects, getSelectValue, colorPickerHTML, bindColorPickers, getColor, areaChart } from './ui.js';
import { ideTab, seoTab, analyticsTab, formsTab } from './views-ide.js';
import { qrSvg } from './qr.js';
import { edgeUrl } from './api.js';

const TABS = [
  ['overview', '개요', 'dashboard'],
  ['deploy', '배포', 'deploys'],
  ['files', '파일·IDE', 'code'],
  ['seo', 'SEO', 'gauge'],
  ['analytics', '방문자', 'analytics'],
  ['forms', 'Forms', 'forms'],
  ['settings', '설정', 'settings']
];

export async function siteView(route) {
  const slug = route.params.slug;
  const tab = route.params.tab || 'overview';

  let data;
  try {
    data = await api.site(slug);
  } catch (e) {
    return {
      title: '사이트를 찾을 수 없습니다',
      sub: slug,
      actions: `<a class="btn" href="#/sites">${icon('arrowLeft', 16)}<span>사이트 목록</span></a>`,
      body: errorBox(e, '사이트를 불러오지 못했습니다'),
      mount() {}
    };
  }
  const site = data.site;
  const versions = data.versions || [];

  const tabsHTML = `<div class="tabs">${TABS.map(([id, label, ico]) => `
    <a class="tab" href="#/site/${encodeURIComponent(slug)}/${id}" aria-selected="${tab === id}">${label}</a>`).join('')}</div>`;

  const head = `<div class="card card--pad">
    <div class="site-hero">
      ${thumbFor(site).replace('class="thumb"', 'class="thumb site-hero__thumb"')}
      <div style="min-width:0;flex:1">
        <h2 class="truncate">${esc(site.name)}</h2>
        <div class="row row--tight mt-8">
          <a class="site-url" href="${esc(site.url)}" target="_blank" rel="noopener">${esc(site.url.replace(/^https?:\/\//, ''))}${icon('external', 12)}</a>
          <button class="icon-btn" data-act="copy" data-value="${esc(site.url)}" title="주소 복사" aria-label="주소 복사">${icon('copy', 15)}</button>
        </div>
      </div>
      <div class="row row--tight">
        ${site.hasPassword ? `<span class="badge badge--warn">${icon('lock', 12)}비공개</span>` : `<span class="badge badge--ok"><span class="dot dot--live"></span>공개</span>`}
        <span class="badge">v${site.version}</span>
        <a class="btn btn--brand" href="#/site/${encodeURIComponent(slug)}/deploy">${icon('rocket', 16)}<span>새 배포</span></a>
        <a class="btn" href="#/site/${encodeURIComponent(slug)}/files">${icon('code', 16)}<span>IDE</span></a>
      </div>
    </div>
  </div>`;

  let body = head + tabsHTML;
  let mount = () => {};

  if (tab === 'overview') {
    const overview = await renderOverview(site, versions);
    body += overview.html;
    mount = (root) => {
      bindCommon(root, site);
      overview.mount && overview.mount(root);
    };
  } else if (tab === 'deploy') {
    body += `<div class="grid grid--site">
      <div class="card">
        <div class="card__head"><div><div class="card__title">새 배포</div><div class="card__sub">폴더·ZIP·파일을 끌어다 놓거나 GitHub에서 가져옵니다</div></div></div>
        <div class="card__body">${deployPanelHTML()}</div>
      </div>
      <div class="card">
        <div class="card__head"><div><div class="card__title">버전 타임라인</div><div class="card__sub">최근 ${versions.length}개 · 최대 20개 보관</div></div></div>
        <div class="card__body">${timelineHTML(site, versions, true)}</div>
      </div>
    </div>`;
    mount = (root) => {
      bindCommon(root, site);
      mountDeployPanel(root, { slug, onDone: () => rerender() });
      bindTimeline(root, site);
    };
  } else if (tab === 'files') {
    await ideTab(slug, site, versions, (b, m) => { body = b; mount = m; });
  } else if (tab === 'seo') {
    await seoTab(slug, site, (b, m) => { body = b; mount = m; });
  } else if (tab === 'analytics') {
    await analyticsTab(slug, site, (b, m) => { body = b; mount = m; });
  } else if (tab === 'forms') {
    await formsTab(slug, site, (b, m) => { body = b; mount = m; });
  } else if (tab === 'settings') {
    body += settingsHTML(site);
    mount = (root) => bindSettings(root, site);
  }

  const actions = `<a class="btn btn--ghost" href="${esc(site.url)}" target="_blank" rel="noopener">${icon('external', 16)}<span>사이트 열기</span></a>`;

  return {
    title: site.name,
    sub: 'Lamp 사이트 · ' + relTime(site.updated) + ' 업데이트',
    actions,
    body,
    mount
  };
}

/* ---------------------------------------------------------------- 개요 */

async function renderOverview(site, versions) {
  let analytics = null;
  try { analytics = await api.analytics(site.slug, 7); } catch (e) { analytics = null; }
  const daily = analytics ? analytics.daily : [];
  const totalViews = analytics ? analytics.total : 0;
  const weekViews = daily.reduce((n, d) => n + d.views, 0);
  const half = Math.floor(daily.length / 2);
  const prev = daily.slice(0, half).reduce((n, d) => n + d.views, 0);
  const recent = daily.slice(half).reduce((n, d) => n + d.views, 0);
  const delta = prev ? Math.round(((recent - prev) / prev) * 100) : 0;
  const liveNow = analytics ? analytics.live : 0;

  const points = daily.length
    ? daily.map((d) => ({ label: d.date.slice(5).replace('-', '/'), value: d.views }))
    : [{ label: '오늘', value: 0 }];

  const bandage = `${edgeUrl(site.slug)}`;
  const qr = qrSvg(site.url, { size: 132, dark: state.theme === 'dark' ? '#f7f2e6' : '#17150f', light: 'none' });

  return {
    html: `<div class="grid grid--dash mt-16">
      <div class="card">
        <div class="card__head"><div><div class="card__title">사이트 상태</div><div class="card__sub">지금 이 주소로 열립니다</div></div></div>
        <div class="card__body stack">
          <div class="metric-row">
            <div class="metric"><b>v${site.version}</b><span>현재 버전</span></div>
            <div class="metric"><b>${fmtBytes(site.bytes)}</b><span>${site.files}개 파일</span></div>
            <div class="metric"><b>${fmtNum(weekViews)}</b><span>최근 7일 방문</span></div>
          </div>
          <div class="row">
            <button class="btn btn--sm" data-act="copy" data-value="${esc(site.url)}">${icon('copy', 14)}<span>주소 복사</span></button>
            <a class="btn btn--sm" href="${esc(site.previewUrl)}" target="_blank" rel="noopener">${icon('eye', 14)}<span>프리뷰</span></a>
            <button class="btn btn--sm" data-act="show-qr">${icon('qr', 14)}<span>QR</span></button>
            <button class="btn btn--sm" data-act="copy" data-value="&lt;a href=&quot;${esc(site.url)}&quot;&gt;${esc(site.name)}&lt;/a&gt;">${icon('tag', 14)}<span>배지 코드</span></button>
          </div>
          <div data-qr-host class="row" hidden></div>
          <div class="divider"></div>
          <div class="small muted">비밀번호 잠금, 커스텀 도메인, A/B 테스트는 <a class="link link--muted" href="#/site/${encodeURIComponent(site.slug)}/settings">설정</a>에서 바꿉니다.</div>
        </div>
      </div>

      <div class="card">
        <div class="card__head"><div><div class="card__title">SEO 건강도</div><div class="card__sub">제목·설명·공유 카드 진단</div></div>
          <a class="link link--muted small" href="#/site/${encodeURIComponent(site.slug)}/seo">전체 보기 ${icon('chevronRight', 12)}</a></div>
        <div class="card__body">
          <div data-seo-mini class="small dim">진단하는 중입니다.</div>
        </div>
      </div>

      <div class="card">
        <div class="card__head"><div><div class="card__title">방문자</div><div class="card__sub">최근 7일</div></div>
          <a class="link link--muted small" href="#/site/${encodeURIComponent(site.slug)}/analytics">자세히</a></div>
        <div class="card__body">
          <div class="stat">
            <div class="stat__num">${fmtNum(weekViews)}</div>
            ${weekViews ? `<div class="stat__delta ${delta >= 0 ? 'stat__delta--up' : 'stat__delta--down'}">${delta >= 0 ? '상승' : '하락'} ${Math.abs(delta)}% <span class="dim" style="font-weight:500">최근 3일 대비 이전 3일</span></div>
              <div class="small dim">실시간 3시간 ${fmtNum(liveNow)}회</div>` : '<div class="small dim">첫 방문을 기다리는 중입니다.</div>'}
          </div>
          ${areaChart(points, { labelEvery: 2 })}
        </div>
      </div>
    </div>

    <div class="card mt-16">
      <div class="card__head"><div><div class="card__title">최근 배포</div><div class="card__sub">되돌리기와 ZIP 내려받기를 지원합니다</div></div>
        <a class="link link--muted small" href="#/site/${encodeURIComponent(site.slug)}/deploy">전체 ${versions.length}개 ${icon('chevronRight', 12)}</a></div>
      <div class="card__body">${timelineHTML(site, versions.slice(0, 5), false)}</div>
    </div>`,
    mount: async (root) => {
      bindCommon(root, site);
      bindTimeline(root, site);
      root.querySelector('[data-act="show-qr"]')?.addEventListener('click', (e) => {
        const host = root.querySelector('[data-qr-host]');
        host.hidden = !host.hidden;
        if (!host.innerHTML) {
          host.innerHTML = `<div style="background:#fff;padding:8px;border-radius:12px;border:1px solid var(--line)">${qrSvg(site.url, { size: 132 })}</div>
            <div class="small dim" style="align-self:center">휴대폰 카메라로 스캔하면 이 사이트가 열립니다.<br>배지: <code class="code--inline">${esc(bandage)}/__lamp/badge.svg</code></div>`;
        }
      });
      // 간이 SEO 진단
      try {
        const filesRes = await api.files(site.slug, site.version);
        const texts = {};
        for (const [p, f] of Object.entries(filesRes.files)) if (f.text !== undefined) texts[p] = f.text;
        const { analyzeSite } = await import('./seo.js');
        const res = analyzeSite({ files: texts, baseUrl: site.url, siteSlug: site.slug });
        const mini = root.querySelector('[data-seo-mini]');
        if (mini) {
          mini.innerHTML = `${ringHTML(res.score, { size: 132, color: res.score >= 90 ? 'var(--ok)' : res.score >= 70 ? 'var(--brand)' : 'var(--bad)' })}
            <div style="text-align:center" class="mt-8"><b>${res.score >= 90 ? '아주 좋습니다' : res.score >= 70 ? '조금만 고치면 좋습니다' : '손볼 곳이 있습니다'}</b></div>
            <div class="row mt-8" style="justify-content:center">
              <span class="badge badge--ok">통과 ${res.counts.pass}</span>
              <span class="badge badge--warn">주의 ${res.counts.warn}</span>
              <span class="badge badge--bad">실패 ${res.counts.fail}</span>
            </div>
            <a class="btn btn--sm btn--block mt-16" href="#/site/${encodeURIComponent(site.slug)}/seo">진단 자세히</a>`;
        }
      } catch (e) {
        const mini = root.querySelector('[data-seo-mini]');
        if (mini) mini.innerHTML = `<div class="small dim">진단하지 못했습니다. ${esc(e.message)}</div>`;
      }
    }
  };
}

/* ---------------------------------------------------------------- 타임라인 */

export function timelineHTML(site, versions, full) {
  if (!versions.length) {
    return emptyBox({ ico: 'deploys', title: '아직 배포가 없습니다', text: '오른쪽 배포 카드에서 폴더를 끌어다 놓으면 첫 버전이 만들어집니다.' });
  }
  return `<div class="timeline">${versions.map((v) => `
    <div class="tl-item">
      <div class="tl-dot ${v.v === site.current ? 'tl-dot--live' : ''}">${v.v === site.current ? icon('check', 12) : icon('clock', 12)}</div>
      <div class="tl-main">
        <div class="tl-title">v${v.v} · ${esc(v.message)}
          ${v.v === site.current ? '<span class="badge badge--ok">현재</span>' : ''}
          ${v.preview ? '<span class="badge badge--info">미리보기</span>' : ''}
        </div>
        <div class="tl-meta">${relTime(v.ts)} · ${v.files}개 파일 · ${fmtBytes(v.bytes)}</div>
      </div>
      <div class="row row--tight">
        ${v.v === site.current ? `<a class="btn btn--sm btn--ghost" href="${esc(site.url)}" target="_blank" rel="noopener">${icon('external', 14)}</a>` : `<button class="btn btn--sm" data-act="rollback" data-version="${v.v}">되돌리기</button>`}
        <a class="btn btn--sm btn--ghost" href="${esc(site.previewUrl.replace(/\/\d+\/$/, '/' + v.v + '/'))}" target="_blank" rel="noopener" title="이 버전 미리보기">${icon('eye', 14)}</a>
        <button class="btn btn--sm btn--ghost" data-act="zip" data-version="${v.v}" title="ZIP 내려받기">${icon('download', 14)}</button>
      </div>
    </div>`).join('')}</div>
    ${full ? `<div class="small dim mt-8">버전은 최대 20개까지 보관됩니다. ZIP은 각 버전의 파일을 그대로 담습니다.</div>` : ''}`;
}

function bindTimeline(root, site) {
  root.querySelectorAll('[data-act="rollback"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const v = btn.dataset.version;
      btn.disabled = true;
      btn.textContent = '되돌리는 중';
      try {
        await api.rollback(site.slug, Number(v));
        note('ok', 'v' + v + '로 되돌렸습니다.');
        rerender();
      } catch (e) {
        note('bad', e.message);
        btn.disabled = false;
        btn.textContent = '되돌리기';
      }
    });
  });
  root.querySelectorAll('[data-act="zip"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const blob = await downloadZip(site.slug, Number(btn.dataset.version));
        downloadBlob(site.slug + '-v' + btn.dataset.version + '.zip', blob);
        note('ok', 'ZIP을 내려받았습니다.');
      } catch (e) {
        note('bad', e.message);
      } finally { btn.disabled = false; }
    });
  });
}

/* ---------------------------------------------------------------- 설정 */

function settingsHTML(site) {
  return `<div class="grid grid--2 mt-16">
    <div class="card card--pad">
      <div class="section-title">기본 정보</div>
      <div class="stack">
        <div class="field"><label for="set-name">사이트 이름</label>
          <input class="input" id="set-name" value="${esc(site.name)}" maxlength="60" data-f="name">
        </div>
        <div class="field"><label>주소</label>
          <div class="input-group"><input class="input input--mono" value="${esc(site.slug)}" disabled><span class="input-group__suffix">lamp</span></div>
          <span class="hint">주소는 만든 뒤에는 바꿀 수 없습니다. 새 주소가 필요하면 새 사이트로 배포하세요.</span>
        </div>
        <div class="row"><button class="btn btn--brand" data-act="save-basic">${icon('save', 15)}<span>저장</span></button></div>
      </div>
    </div>

    <div class="card card--pad">
      <div class="section-title">공개 범위</div>
      <div class="stack">
        <label class="switch">
          <input type="checkbox" data-f="private" ${site.hasPassword ? 'checked' : ''}>
          <span class="switch__track"></span>
          <span class="switch__label">비밀번호로 잠그기</span>
        </label>
        <div class="field"><label for="set-pw">비밀번호</label>
          <div class="row row--tight">
            <input class="input" id="set-pw" type="text" placeholder="${site.hasPassword ? '바꿀 비밀번호 (비우면 그대로)' : '4자 이상'}" data-f="password" autocomplete="new-password">
            <button class="btn" data-act="save-password">${icon('lock', 15)}<span>적용</span></button>
          </div>
          <span class="hint">${site.hasPassword ? '지금 비밀번호로 보호되어 있습니다. 이 주소를 아는 사람도 비밀번호가 있어야 열 수 있습니다.' : '비밀번호를 걸면 방문자는 잠금 화면을 먼저 보게 됩니다.'}</span>
        </div>
      </div>
    </div>

    <div class="card card--pad">
      <div class="section-title">커스텀 도메인</div>
      <div class="stack">
        <div class="field"><label for="set-domain">도메인</label>
          <input class="input input--mono" id="set-domain" placeholder="www.example.com" value="${esc(site.customDomain || '')}" data-f="customDomain">
        </div>
        <div class="small muted">도메인을 연결하려면 DNS에 아래 레코드를 추가한 뒤 Cloudflare Workers에 라우트를 등록합니다.</div>
        <div class="code">CNAME  www   lamp-edge.helpaboutflux.workers.dev
A      @     192.0.2.1  (루트 도메인은 Cloudflare 프록시 사용)</div>
        <button class="btn" data-act="save-domain">${icon('domains', 15)}<span>도메인 저장</span></button>
        <div class="small dim">Cloudflare 계정에 도메인을 추가한 뒤 Workers → lamp-edge → Settings → Domains & Routes 에서 연결하세요. 자세한 순서는 <a class="link link--muted" href="#/docs">문서</a>에 있습니다.</div>
      </div>
    </div>

    <div class="card card--pad">
      <div class="section-title">A/B 분할 테스트</div>
      <div class="stack">
        <div class="small muted">두 버전을 방문자에게 무작위로 나눠 보여 줍니다. 결과는 방문자 분석의 변형별 표에서 확인합니다.</div>
        <div class="row row--tight">
          <div class="field" style="flex:1"><label>A 버전</label>
            ${selectHTML({ name: 'ab-a', value: String(site.current || 1), options: versionOptions(site) })}
          </div>
          <div class="field" style="flex:1"><label>B 버전</label>
            ${selectHTML({ name: 'ab-b', value: String(Math.max(1, (site.current || 2) - 1)), options: versionOptions(site) })}
          </div>
        </div>
        <label class="switch"><input type="checkbox" data-f="ab-on" ${site.abtest && site.abtest.active ? 'checked' : ''}>
          <span class="switch__track"></span><span class="switch__label">A/B 테스트 켜기</span></label>
        <div class="row"><button class="btn" data-act="save-ab">${icon('split', 15)}<span>A/B 설정 저장</span></button></div>
      </div>
    </div>

    <div class="card card--pad">
      <div class="section-title">배포 규칙 파일</div>
      <div class="stack small muted">
        <div>사이트 루트에 아래 파일을 두면 엔진이 그대로 따릅니다.</div>
        <div class="code">_redirects   예: /old  /new  301
_headers     예: /* → X-Frame-Options: DENY
404.html     커스텀 404 페이지
robots.txt   검색 로봇 규칙
sitemap.xml  사이트맵</div>
        <a class="btn btn--sm" href="#/site/${encodeURIComponent(site.slug)}/files">${icon('code', 14)}<span>IDE에서 편집</span></a>
      </div>
    </div>

    <div class="card card--pad" style="border-color:color-mix(in srgb, var(--bad) 26%, var(--line))">
      <div class="section-title" style="color:var(--bad)">사이트 삭제</div>
      <div class="stack">
        <div class="small muted">모든 버전과 파일이 지워지고 주소가 즉시 풀립니다. 되돌릴 수 없습니다.</div>
        <div data-delete-host>
          <button class="btn btn--danger" data-act="ask-delete">${icon('trash', 15)}<span>이 사이트 삭제</span></button>
        </div>
      </div>
    </div>
  </div>`;
}

function versionOptions(site) {
  const opts = [];
  for (let i = site.version; i >= 1 && i > site.version - 10; i--) opts.push({ value: String(i), label: 'v' + i + (i === site.version ? ' (현재)' : '') });
  if (!opts.length) opts.push({ value: '1', label: 'v1' });
  return opts;
}

function bindSettings(root, site) {
  bindCommon(root, site);
  bindSelects(root, () => {});

  const val = (name) => {
    const el = root.querySelector(`[data-f="${name}"]`);
    if (!el) return '';
    return el.type === 'checkbox' ? el.checked : el.value;
  };

  root.querySelector('[data-act="save-basic"]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await api.patchSite(site.slug, { name: val('name') });
      note('ok', '사이트 이름을 저장했습니다.');
      rerender();
    } catch (err) { note('bad', err.message); btn.disabled = false; }
  });

  root.querySelector('[data-act="save-password"]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const pw = val('password');
    const locked = val('private');
    btn.disabled = true;
    try {
      await api.patchSite(site.slug, { password: locked ? (pw || undefined) : '', private: locked });
      note('ok', locked ? '비밀번호를 걸었습니다.' : '비밀번호 잠금을 풀었습니다.');
      rerender();
    } catch (err) { note('bad', err.message); btn.disabled = false; }
  });

  root.querySelector('[data-act="save-domain"]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await api.patchSite(site.slug, { customDomain: val('customDomain') });
      note('ok', '도메인을 저장했습니다.');
    } catch (err) { note('bad', err.message); }
    btn.disabled = false;
  });

  root.querySelector('[data-act="save-ab"]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const on = val('ab-on');
    const a = Number(getSelectValue(root, 'ab-a'));
    const b = Number(getSelectValue(root, 'ab-b'));
    btn.disabled = true;
    try {
      await api.patchSite(site.slug, {
        abtest: on ? { active: true, variants: [{ name: 'A', version: a, weight: 50 }, { name: 'B', version: b, weight: 50 }] } : null
      });
      note('ok', on ? 'A/B 테스트를 켰습니다.' : 'A/B 테스트를 껐습니다.');
      rerender();
    } catch (err) { note('bad', err.message); btn.disabled = false; }
  });

  root.querySelector('[data-act="ask-delete"]')?.addEventListener('click', (e) => {
    const host = root.querySelector('[data-delete-host]');
    host.innerHTML = `<div class="note note--bad">${icon('alert', 16)}<div class="note__body">
      <b>${esc(site.name)} (${esc(site.slug)}) 사이트를 정말 삭제할까요?</b>
      버전 ${site.version}개와 파일 ${site.files}개가 함께 지워집니다.
      <div class="row mt-8">
        <button class="btn btn--sm btn--danger" data-act="do-delete">삭제합니다</button>
        <button class="btn btn--sm" data-act="cancel-delete">취소</button>
      </div></div></div>`;
    host.querySelector('[data-act="cancel-delete"]').addEventListener('click', () => {
      host.innerHTML = `<button class="btn btn--danger" data-act="ask-delete">${icon('trash', 15)}<span>이 사이트 삭제</span></button>`;
    });
    host.querySelector('[data-act="do-delete"]').addEventListener('click', async () => {
      try {
        await api.deleteSite(site.slug);
        note('ok', '사이트를 삭제했습니다.');
        state.sites = state.sites.filter((s) => s.slug !== site.slug);
        go('/sites');
      } catch (err) { note('bad', err.message); }
    });
  });
}

/* ---------------------------------------------------------------- 공통 */

export function bindCommon(root) {
  root.querySelectorAll('[data-act="copy"]').forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', async () => {
      const ok = await copyText(btn.dataset.value || '');
      note(ok ? 'ok' : 'bad', ok ? '복사했습니다.' : '복사하지 못했습니다. 직접 선택해 주세요.');
    });
  });
}

export { areaChart, colorPickerHTML, bindColorPickers, getColor, selectHTML, fmtNum };
