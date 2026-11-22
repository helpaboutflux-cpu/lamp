/* Lamp — IDE · SEO · 방문자 분석 · Forms */

import { $, $$, esc, fmtBytes, fmtNum, fmtDate, fmtTime, relTime, copyText, downloadText, note, debounce } from './util.js';
import { icon } from './icons.js';
import { api, formEndpoint } from './api.js';
import { state, rerender, errorBox, emptyBox, inlineNote } from './core.js';
import { editorHTML, bindEditor, langOf, areaChart, ringHTML, selectHTML, bindSelects, getSelectValue, colorPickerHTML, bindColorPickers, getColor } from './ui.js';
import { buildPreviewDoc } from './deploy.js';
import { analyzeSite, robotsTxt, sitemapXml, privacyPage, termsPage, adsTxt, notFoundPage } from './seo.js';
import { qrSvg } from './qr.js';

/* ================================================================ IDE */

export async function ideTab(slug, site, versions, setBody) {
  let filesRes;
  try {
    filesRes = await api.files(slug, site.version);
  } catch (e) {
    setBody(`<div class="mt-16">${errorBox(e, '파일을 불러오지 못했습니다')}</div>`, () => {});
    return;
  }

  const files = new Map();
  for (const [p, f] of Object.entries(filesRes.files)) files.set(p, { text: f.text, base64: f.base64, type: f.type, size: f.size });
  let current = files.has('index.html') ? 'index.html' : [...files.keys()][0] || '';
  let dirty = new Set();
  let mode = 'split';

  const treeHTML = () => [...files.keys()].sort().map((p) => `
    <button class="tree__item" data-path="${esc(p)}" aria-current="${p === current}">
      ${icon(/\.html?$/i.test(p) ? 'file' : /\.(css)$/i.test(p) ? 'pen' : /\.(js|mjs)$/i.test(p) ? 'code' : /\.(png|jpe?g|svg|webp|gif)$/i.test(p) ? 'image' : 'file', 13)}
      <span class="tree__name">${esc(p)}</span>
      ${dirty.has(p) ? '<span class="badge badge--warn" style="height:16px;font-size:10px;padding:0 5px">수정</span>' : ''}
    </button>`).join('');

  const value = () => {
    const f = files.get(current);
    return f ? (f.text !== undefined ? f.text : '') : '';
  };

  const html = `<div class="grid grid--site mt-16">
    <div class="card">
      <div class="card__head">
        <div><div class="card__title">코드 편집기</div><div class="card__sub">편집 후 재배포하면 새 버전이 됩니다</div></div>
        <div class="row row--tight">
          <div class="seg" role="group" aria-label="화면 배치">
            <button class="seg__btn" data-mode="split" aria-pressed="true">분할</button>
            <button class="seg__btn" data-mode="code" aria-pressed="false">코드</button>
            <button class="seg__btn" data-mode="preview" aria-pressed="false">미리보기</button>
          </div>
        </div>
      </div>
      <div class="card__body">
        <div class="ide">
          <div class="ide__side">
            <div class="row row--tight">
              <span class="eyebrow">파일 ${files.size}</span>
              <span class="spacer"></span>
              <button class="icon-btn icon-btn--bordered" data-act="new-file" title="새 파일" aria-label="새 파일">${icon('plus', 15)}</button>
            </div>
            <div class="tree" data-tree>${treeHTML()}</div>
            <div class="small dim">${fmtBytes([...files.values()].reduce((n, f) => n + (f.size || 0), 0))} · v${site.version}</div>
            <div class="divider"></div>
            <button class="btn btn--brand btn--sm" data-act="redeploy">${icon('rocket', 15)}<span>재배포</span></button>
            <button class="btn btn--sm" data-act="save-local">${icon('save', 15)}<span>초안 저장</span></button>
            <div class="small dim" data-ed-status>${current ? esc(current) : '파일 없음'}</div>
          </div>
          <div>
            <div data-ed-host>${current ? editorHTML(current, value()) : emptyBox({ ico: 'file', title: '파일이 없습니다', text: '왼쪽 + 버튼으로 첫 파일을 만드세요.' })}</div>
            <div class="mt-8" data-preview-host></div>
          </div>
        </div>
      </div>
    </div>
    <div class="stack">
      <div class="card card--pad">
        <div class="section-title">빠른 파일</div>
        <div class="stack" style="gap:8px">
          <button class="btn btn--sm btn--block" data-act="quick-404">${icon('file', 14)}<span>커스텀 404.html</span></button>
          <button class="btn btn--sm btn--block" data-act="quick-robots">${icon('shield', 14)}<span>robots.txt</span></button>
          <button class="btn btn--sm btn--block" data-act="quick-sitemap">${icon('globe', 14)}<span>sitemap.xml</span></button>
        </div>
      </div>
      <div class="card card--pad">
        <div class="section-title">단축키</div>
        <div class="kv small">
          <dt>저장</dt><dd><code class="code--inline">Ctrl / Cmd + S</code></dd>
          <dt>들여쓰기</dt><dd><code class="code--inline">Tab</code></dd>
        </div>
      </div>
    </div>
  </div>`;

  setBody(html, (root) => {
    let ed = null;
    const host = root.querySelector('[data-ed-host]');
    const previewHost = root.querySelector('[data-preview-host]');
    const treeEl = root.querySelector('[data-tree]');
    const statusEl = root.querySelector('[data-ed-status]');

    const objectUrls = [];

    const renderPreview = () => {
      objectUrls.forEach((u) => URL.revokeObjectURL(u));
      objectUrls.length = 0;
      if (!previewHost) return;
      const doc = buildPreviewDoc(files);
      previewHost.innerHTML = `<div class="preview ${mode === 'preview' ? 'preview--mobile' : ''}">
        <div class="preview__bar"><span class="preview__dots"><i></i><i></i><i></i></span>
          <span class="preview__url">${esc(site.slug)}/index.html · 저장 전 미리보기</span>
          <button class="btn btn--sm btn--ghost" data-act="reload-preview" title="새로고침">${icon('refresh', 14)}</button>
        </div>
        <iframe sandbox="allow-scripts allow-same-origin allow-forms allow-popups" srcdoc="${esc(doc)}" title="미리보기"></iframe>
      </div>`;
      previewHost.querySelector('[data-act="reload-preview"]').addEventListener('click', renderPreview);
    };

    const attachEditor = () => {
      if (!host || !current) return;
      host.innerHTML = editorHTML(current, value());
      ed = bindEditor(host, {
        onChange: (v) => {
          const f = files.get(current) || {};
          f.text = v;
          f.size = new Blob([v]).size;
          files.set(current, f);
          dirty.add(current);
          const st = root.querySelector('[data-ed-status]');
          if (st) st.innerHTML = `${esc(current)} · ${v.split('\n').length}줄 · 저장 안 됨`;
        }
      });
      host.addEventListener('lamp:save', saveLocal, { once: false });
    };

    const saveLocal = () => {
      if (!ed) return;
      const draft = {};
      for (const [p, f] of files) if (f.text !== undefined) draft[p] = f.text;
      try {
        localStorage.setItem('lamp:draft:' + slug, JSON.stringify(draft));
        note('ok', '초안을 이 브라우저에 저장했습니다. 재배포해야 사이트에 반영됩니다.');
      } catch (e) { note('bad', '초안을 저장하지 못했습니다. 용량이 부족합니다.'); }
    };

    const pickFile = (p) => {
      current = p;
      if (statusEl) statusEl.textContent = p;
      if (treeEl) treeEl.innerHTML = treeHTML();
      bindTree();
      attachEditor();
      renderPreview();
    };

    const bindTree = () => {
      root.querySelectorAll('.tree__item').forEach((b) => {
        b.addEventListener('click', () => pickFile(b.dataset.path));
      });
    };

    const setMode = (m) => {
      mode = m;
      root.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
      const ideCols = root.querySelector('.ide');
      if (ideCols) ideCols.style.gridTemplateColumns = m === 'preview' ? '214px minmax(0,1fr)' : '';
      if (host) host.style.display = m === 'preview' ? 'none' : '';
      if (previewHost) previewHost.style.display = m === 'code' ? 'none' : '';
      renderPreview();
    };

    root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
    bindTree();
    attachEditor();
    renderPreview();

    root.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;

      if (act === 'redeploy') {
        btn.disabled = true;
        btn.innerHTML = `${icon('clock', 15)}<span>배포 중</span>`;
        try {
          const payload = [];
          for (const [p, f] of files) {
            if (f.text !== undefined) payload.push({ path: p, text: f.text, type: f.type });
            else payload.push({ path: p, base64: f.base64, type: f.type });
          }
          const res = await api.deploy(slug, payload, { message: 'IDE 편집 배포' });
          dirty.clear();
          note('ok', 'v' + res.deploy.v + ' 배포 완료');
          rerender();
        } catch (err) {
          note('bad', err.message);
          btn.disabled = false;
          btn.innerHTML = `${icon('rocket', 15)}<span>재배포</span>`;
        }
      }

      if (act === 'new-file') {
        const hostEl = root.querySelector('[data-new-file-host]');
        const name = (root.querySelector('[data-new-name]') || {}).value;
        if (!name) {
          const side = root.querySelector('.ide__side');
          const box = document.createElement('div');
          box.className = 'stack';
          box.innerHTML = `<input class="input input--sm input--mono" placeholder="about.html 또는 css/main.css" data-new-name>
            <div class="row row--tight"><button class="btn btn--sm btn--brand" data-act="create-file">만들기</button></div>`;
          side.insertBefore(box, side.querySelector('.divider'));
          box.querySelector('[data-new-name]').focus();
          btn.remove();
          return;
        }
      }

      if (act === 'create-file') {
        const nameEl = root.querySelector('[data-new-name]');
        const path = (nameEl.value || '').trim().replace(/^\/+/, '');
        if (!path || files.has(path)) { note('warn', '사용할 수 없는 파일 이름입니다.'); return; }
        files.set(path, { text: '', type: path.endsWith('.css') ? 'text/css; charset=utf-8' : path.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8', size: 0 });
        dirty.add(path);
        nameEl.value = '';
        pickFile(path);
        note('ok', path + ' 파일을 만들었습니다.');
      }

      if (act === 'quick-404') {
        files.set('404.html', { text: notFoundPage({ siteName: site.name, homeUrl: '/' + slug + '/' }), type: 'text/html; charset=utf-8' });
        dirty.add('404.html');
        pickFile('404.html');
      }
      if (act === 'quick-robots') {
        files.set('robots.txt', { text: robotsTxt(site.url), type: 'text/plain; charset=utf-8' });
        dirty.add('robots.txt');
        pickFile('robots.txt');
      }
      if (act === 'quick-sitemap') {
        const paths = [...files.keys()].filter((p) => /\.html?$/i.test(p));
        files.set('sitemap.xml', { text: sitemapXml(site.url, paths), type: 'application/xml; charset=utf-8' });
        dirty.add('sitemap.xml');
        pickFile('sitemap.xml');
      }
    });
  });
}

/* ================================================================ SEO */

export async function seoTab(slug, site, setBody) {
  let filesRes;
  let texts = {};
  try {
    filesRes = await api.files(slug, site.version);
    for (const [p, f] of Object.entries(filesRes.files)) if (f.text !== undefined) texts[p] = f.text;
  } catch (e) {
    setBody(`<div class="mt-16">${errorBox(e, '파일을 불러오지 못했습니다')}</div>`, () => {});
    return;
  }

  const result = analyzeSite({ files: texts, baseUrl: site.url, siteSlug: slug });
  const p = result.preview;

  const statusBadge = (s) => s === 'pass' ? `<span class="badge badge--ok">통과</span>` : s === 'warn' ? `<span class="badge badge--warn">주의</span>` : `<span class="badge badge--bad">실패</span>`;

  const html = `<div class="grid grid--site mt-16">
    <div class="card">
      <div class="card__head"><div><div class="card__title">진단 결과</div><div class="card__sub">${result.counts.pass}개 통과 · ${result.counts.warn}개 주의 · ${result.counts.fail}개 실패</div></div>
        <button class="btn btn--sm" data-act="rerun">${icon('refresh', 14)}<span>다시 진단</span></button></div>
      <div class="card__body">
        <div class="stack" style="gap:0">
          ${result.checks.map((c) => `<div class="tl-item" style="grid-template-columns:minmax(0,1fr) auto">
            <div class="tl-main"><div class="tl-title">${esc(c.label)}</div><div class="tl-meta">${esc(c.detail)}</div>
            ${c.fix ? `<div class="small dim" style="margin-top:3px">권장: ${esc(c.fix)}</div>` : ''}</div>
            <div>${statusBadge(c.status)}</div>
          </div>`).join('')}
        </div>
      </div>
    </div>

    <div class="stack">
      <div class="card card--pad">
        <div class="section-title">종합 점수</div>
        ${ringHTML(result.score, { color: result.score >= 90 ? 'var(--ok)' : result.score >= 70 ? 'var(--brand)' : 'var(--bad)' })}
        <div style="text-align:center;margin-top:8px" class="small ${result.score >= 90 ? '' : 'muted'}">
          <b>${result.score >= 90 ? '아주 좋습니다' : result.score >= 70 ? '조금만 고치면 좋습니다' : '손볼 곳이 있습니다'}</b>
        </div>
      </div>

      <div class="card card--pad">
        <div class="section-title">구글 검색 미리보기</div>
        <div style="background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 16px">
          <div style="font-size:12px;color:#4d5156">${esc(p.url)}</div>
          <div style="font-size:17px;color:#1a0dab;margin:2px 0 3px;line-height:1.35">${esc(p.title)}</div>
          <div style="font-size:13px;color:#4d5156;line-height:1.5">${esc(p.description).slice(0, 170)}</div>
        </div>
      </div>

      <div class="card card--pad">
        <div class="section-title">SNS 공유 카드</div>
        <div style="border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--surface-2)">
          <div style="aspect-ratio:1.91/1;display:grid;place-items:center;background:linear-gradient(140deg,#fdf0cd,#f6e6bd);color:#7a6420;font-size:12px">
            ${p.image ? `<img src="${esc(p.image)}" alt="" style="width:100%;height:100%;object-fit:cover">` : 'og:image 가 없습니다'}
          </div>
          <div style="padding:10px 12px">
            <div class="tiny dim">${esc(site.url.replace(/^https?:\/\//, '').split('/')[0])}</div>
            <div class="small strong" style="margin-top:2px">${esc(p.title)}</div>
            <div class="tiny dim" style="margin-top:2px">${esc(p.description).slice(0, 80)}</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="card mt-16">
    <div class="card__head"><div><div class="card__title">검색·공유 파일 만들기</div><div class="card__sub">한 번 누르면 사이트에 파일이 추가되고 새 버전으로 배포됩니다</div></div></div>
    <div class="card__body grid grid--3">
      <div class="stack">
        <div class="small"><b>robots.txt</b></div>
        <div class="tiny dim">검색 로봇에 사이트맵 위치를 알려 줍니다.</div>
        <button class="btn btn--sm" data-act="gen-robots" ${texts['robots.txt'] ? 'disabled' : ''}>${icon('shield', 14)}<span>${texts['robots.txt'] ? '이미 있음' : '만들기'}</span></button>
      </div>
      <div class="stack">
        <div class="small"><b>sitemap.xml</b></div>
        <div class="tiny dim">모든 HTML 페이지를 모아 사이트맵을 만듭니다.</div>
        <button class="btn btn--sm" data-act="gen-sitemap" ${texts['sitemap.xml'] ? 'disabled' : ''}>${icon('globe', 14)}<span>${texts['sitemap.xml'] ? '이미 있음' : '만들기'}</span></button>
      </div>
      <div class="stack">
        <div class="small"><b>404.html</b></div>
        <div class="tiny dim">없는 주소로 들어왔을 때 보여 줄 페이지입니다.</div>
        <button class="btn btn--sm" data-act="gen-404">${icon('file', 14)}<span>만들기</span></button>
      </div>
    </div>
  </div>

  <div class="card mt-16">
    <div class="card__head"><div><div class="card__title">페이지 미리보기</div><div class="card__sub">실제 배포본을 불러옵니다</div></div>
      <a class="btn btn--sm" href="${esc(site.url)}" target="_blank" rel="noopener">${icon('external', 14)}<span>새 창</span></a></div>
    <div class="card__body">
      <iframe class="iframe-full" src="${esc(site.url)}" title="사이트 미리보기" loading="lazy"></iframe>
    </div>
  </div>`;

  setBody(html, (root) => {
    const patch = async (path, text, label) => {
      try {
        await api.patchFiles(slug, [{ path, text, type: path.endsWith('.xml') ? 'application/xml; charset=utf-8' : 'text/plain; charset=utf-8' }], [], label);
        note('ok', label + ' 완료 · 새 버전으로 배포했습니다.');
        rerender();
      } catch (e) { note('bad', e.message); }
    };
    root.querySelector('[data-act="gen-robots"]')?.addEventListener('click', () => patch('robots.txt', robotsTxt(site.url), 'robots.txt 생성'));
    root.querySelector('[data-act="gen-sitemap"]')?.addEventListener('click', () => {
      const paths = Object.keys(texts).filter((x) => /\.html?$/i.test(x));
      patch('sitemap.xml', sitemapXml(site.url, paths), 'sitemap.xml 생성');
    });
    root.querySelector('[data-act="gen-404"]')?.addEventListener('click', () => {
      const text = notFoundPage({ siteName: site.name, homeUrl: '/' + slug + '/' });
      patch('404.html', text, '404.html 생성');
    });
    root.querySelector('[data-act="rerun"]')?.addEventListener('click', () => rerender());
  });
}

/* ================================================================ 방문자 */

export async function analyticsTab(slug, site, setBody) {
  let a;
  try { a = await api.analytics(slug, 14); } catch (e) {
    setBody(`<div class="mt-16">${errorBox(e, '분석을 불러오지 못했습니다')}</div>`, () => {});
    return;
  }
  const points = a.daily.map((d) => ({ label: d.date.slice(5).replace('-', '/'), value: d.views }));
  const total = a.daily.reduce((n, d) => n + d.views, 0);
  const today = a.daily[a.daily.length - 1] ? a.daily[a.daily.length - 1].views : 0;
  const peak = a.daily.reduce((m, d) => (d.views > m.views ? d : m), { views: 0, date: '' });

  const html = `<div class="grid grid--3 mt-16">
    <div class="card card--pad"><div class="eyebrow">최근 14일</div><div class="stat__num">${fmtNum(total)}</div><div class="small dim">페이지 조회</div></div>
    <div class="card card--pad"><div class="eyebrow">오늘</div><div class="stat__num">${fmtNum(today)}</div><div class="small dim">지금까지</div></div>
    <div class="card card--pad"><div class="eyebrow">가장 많았던 날</div><div class="stat__num">${fmtNum(peak.views)}</div><div class="small dim">${peak.date ? fmtDate(peak.date) : '—'}</div></div>
  </div>

  <div class="card mt-16">
    <div class="card__head"><div><div class="card__title">일별 방문</div><div class="card__sub">봇과 미리보기 요청은 제외합니다</div></div></div>
    <div class="card__body">${areaChart(points, { height: 180, labelEvery: 2 })}</div>
  </div>

  <div class="grid grid--2 mt-16">
    <div class="card">
      <div class="card__head"><div><div class="card__title">실시간 (3시간)</div><div class="card__sub">최근 3시간 조회수</div></div>
        <span class="badge badge--ok"><span class="dot dot--live"></span>${fmtNum(a.live)}</span></div>
      <div class="card__body">
        <div class="stack" style="gap:6px">
          ${a.hours.slice(-12).map((h) => {
            const max = Math.max(1, ...a.hours.map((x) => x.views));
            return `<div class="row" style="gap:8px">
              <span class="tiny dim" style="width:42px">${h.hour.slice(-2)}시</span>
              <span style="flex:1;height:7px;border-radius:4px;background:var(--surface-3);overflow:hidden">
                <span style="display:block;height:100%;width:${Math.round((h.views / max) * 100)}%;background:var(--brand)"></span>
              </span>
              <span class="tiny" style="width:26px;text-align:right">${h.views}</span>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card__head"><div><div class="card__title">A/B 변형</div><div class="card__sub">${site.abtest && site.abtest.active ? '지금 테스트 중입니다' : '설정에서 A/B 테스트를 켤 수 있습니다'}</div></div></div>
      <div class="card__body">
        ${a.ab && a.ab.length ? `<div class="stack" style="gap:10px">
          ${a.ab.map((v) => `<div class="row"><span class="badge badge--brand">${esc(v.name)}</span>
            <span class="small">v${v.version}</span><span class="spacer"></span><b>${fmtNum(v.views)}</b><span class="tiny dim">회</span></div>`).join('')}
          <div class="small dim">변형별 조회는 오늘 하루 기준입니다.</div>
        </div>` : `<div class="small dim">${site.abtest && site.abtest.active ? '아직 변형별 기록이 없습니다.' : '<a class="link link--muted" href="#/site/' + encodeURIComponent(slug) + '/settings">설정</a>에서 A/B 테스트를 켜면 두 버전의 반응을 비교할 수 있습니다.'}</div>`}
      </div>
    </div>
  </div>

  <div class="note note--info mt-16">${icon('info', 16)}<div class="note__body">
    Lamp는 개인정보를 저장하지 않습니다. 방문 횟수만 시간 단위로 셉니다.</div></div>`;

  setBody(html, () => {});
}

/* ================================================================ Forms */

export async function formsTab(slug, site, setBody) {
  let forms = [];
  let subs = [];
  try {
    const r = await api.forms(slug);
    forms = r.forms || [];
    const s = await api.submissions(slug);
    subs = s.submissions || [];
  } catch (e) {
    setBody(`<div class="mt-16">${errorBox(e, 'Forms를 불러오지 못했습니다')}</div>`, () => {});
    return;
  }

  const html = `<div class="grid grid--site mt-16">
    <div class="stack">
      <div class="card">
        <div class="card__head"><div><div class="card__title">폼 만들기</div><div class="card__sub">폼을 만들면 받은 내용이 여기에 쌓입니다</div></div></div>
        <div class="card__body stack">
          <div class="field"><label for="form-name">폼 이름</label><input class="input" id="form-name" placeholder="문의하기" data-form-name></div>
          <div class="field"><label>받을 항목</label>
            <div class="stack" style="gap:8px">
              <label class="check"><input type="checkbox" data-field="name" checked> 이름</label>
              <label class="check"><input type="checkbox" data-field="email" checked> 이메일</label>
              <label class="check"><input type="checkbox" data-field="message" checked> 내용</label>
              <label class="check"><input type="checkbox" data-field="phone"> 연락처</label>
            </div>
          </div>
          <div class="row"><button class="btn btn--brand" data-act="create-form">${icon('plus', 15)}<span>폼 만들기</span></button></div>
        </div>
      </div>

      <div class="card">
        <div class="card__head"><div><div class="card__title">받은 제출</div><div class="card__sub">${subs.length}건</div></div>
          ${subs.length ? `<button class="btn btn--sm" data-act="export-csv">${icon('download', 14)}<span>CSV</span></button>` : ''}</div>
        <div class="card__body">
          ${subs.length ? `<div class="table-wrap"><table class="table">
            <thead><tr><th>시각</th><th>내용</th></tr></thead>
            <tbody>${subs.slice(0, 30).map((s) => `<tr><td class="tiny dim nowrap">${esc(relTime(s.at))}</td>
              <td>${Object.entries(s.data || {}).map(([k, v]) => `<div class="small"><b>${esc(k)}</b> ${esc(String(v)).slice(0, 200)}</div>`).join('')}</td></tr>`).join('')}</tbody>
          </table></div>` : `<div class="small dim">아직 제출이 없습니다.</div>`}
        </div>
      </div>
    </div>

    <div class="stack">
      ${forms.length ? forms.map((f) => `
        <div class="card card--pad">
          <div class="row"><b>${esc(f.name)}</b><span class="spacer"></span><span class="badge">${f.count || 0}건</span></div>
          <div class="small dim mt-8">아래 주소로 POST 하면 됩니다.</div>
          <div class="code mt-8" style="font-size:11px">${esc(formEndpoint(f.id))}</div>
          <div class="row row--tight mt-8">
            <button class="btn btn--sm" data-act="copy" data-value="${esc(formEndpoint(f.id))}">${icon('copy', 14)}<span>주소 복사</span></button>
            <button class="btn btn--sm" data-act="copy-form" data-id="${f.id}">${icon('code', 14)}<span>HTML 폼 복사</span></button>
          </div>
        </div>`).join('') : `<div class="card card--pad"><div class="small dim">아직 만든 폼이 없습니다. 왼쪽에서 첫 폼을 만들어 보세요.</div></div>`}
      <div class="card card--pad">
        <div class="section-title">폼 사용 방법</div>
        <div class="small muted stack" style="gap:8px">
          <div>1. 폼을 만들고 <b>HTML 폼 복사</b>를 누릅니다.</div>
          <div>2. IDE에서 원하는 페이지에 붙여 넣고 재배포합니다.</div>
          <div>3. 제출된 내용은 이 화면과 CSV로 확인합니다.</div>
        </div>
      </div>
    </div>
  </div>`;

  setBody(html, (root) => {
    const copyBtn = async (text, msg = '복사했습니다.') => {
      const ok = await copyText(text);
      note(ok ? 'ok' : 'bad', ok ? msg : '복사하지 못했습니다.');
    };

    root.querySelectorAll('[data-act="copy"]').forEach((b) => b.addEventListener('click', () => copyBtn(b.dataset.value)));
    root.querySelectorAll('[data-act="copy-form"]').forEach((b) => b.addEventListener('click', async () => {
      const id = b.dataset.id;
      const html = `<form method="post" action="${formEndpoint(id)}">
  <label>이름 <input type="text" name="name" required></label>
  <label>이메일 <input type="email" name="email" required></label>
  <label>내용 <textarea name="message" rows="4" required></textarea></label>
  <button type="submit">보내기</button>
</form>`;
      copyBtn(html, 'HTML 폼 코드를 복사했습니다.');
    }));

    root.querySelector('[data-act="create-form"]')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const name = (root.querySelector('[data-form-name]') || {}).value || '문의 폼';
      const fields = [];
      root.querySelectorAll('[data-field]').forEach((c) => { if (c.checked) fields.push({ name: c.dataset.field, label: c.dataset.field }); });
      if (!fields.length) { note('warn', '받을 항목을 하나 이상 선택해 주세요.'); return; }
      btn.disabled = true;
      try {
        await api.createForm(slug, { name, fields });
        note('ok', '폼을 만들었습니다.');
        rerender();
      } catch (err) { note('bad', err.message); btn.disabled = false; }
    });

    root.querySelector('[data-act="export-csv"]')?.addEventListener('click', () => {
      const keys = [...new Set(subs.flatMap((s) => Object.keys(s.data || {})))];
      const rows = [['시각', ...keys].join(',')].concat(
        subs.map((s) => [s.at, ...keys.map((k) => '"' + String((s.data || {})[k] || '').replace(/"/g, '""') + '"')].join(','))
      );
      downloadText(slug + '-forms.csv', '\ufeff' + rows.join('\n'), 'text/csv;charset=utf-8');
      note('ok', 'CSV를 내려받았습니다.');
    });
  });
}
