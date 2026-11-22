/* Lamp — 랜딩 · 로그인 · 대시보드 · 목록 화면 */

import { $, $$, esc, fmtBytes, fmtNum, fmtDate, relTime, note, store, debounce, slugify, copyText } from './util.js';
import { icon } from './icons.js';
import { api } from './api.js';
import { state, go, rerender, paint, thumbFor, errorBox, emptyBox, applyTheme } from './core.js';
import { deployPanelHTML, mountDeployPanel } from './deploy.js';
import { areaChart, ringHTML, selectHTML, bindSelects, getSelectValue } from './ui.js';
import { analyzeSite } from './seo.js';
import {
  isSignedIn, providerEnabled, githubUrl, lkIdUrl, signInEmail, signUpEmail,
  sendMagicLink, verifyEmailCode, consumeRedirect, signOut, currentUser, CONFIG
} from './auth.js';
import { CONFIG as CFG } from './config.js';

/* ================================================================ 랜딩 */

export function landingView() {
  const signed = isSignedIn();
  const cta = signed ? ['대시보드로', '#/dashboard'] : ['시작하기', '#/login'];

  return {
    chrome: false,
    title: '',
    sub: '',
    actions: '',
    body: `<div class="landing">
      <header class="landing__nav">
        <a class="brand" href="#/">
          <img class="brand__orb" src="assets/lamp-orb.svg" alt="" width="26" height="26">
          <span class="brand__word">Lamp</span>
        </a>
        <nav class="landing__links">
          <a href="#features">기능</a>
          <a href="#how">작동 방식</a>
          <a href="#tools">생성기</a>
          <a href="#limits">한도</a>
        </nav>
        <div class="row row--tight">
          <button class="icon-btn" data-act="toggle-theme" aria-label="라이트·다크 전환">${icon(state.theme === 'dark' ? 'sun' : 'moon', 18)}</button>
          <a class="btn btn--ghost" href="#/login">로그인</a>
          <a class="btn btn--brand" href="${cta[1]}">${cta[0]}</a>
        </div>
      </header>

      <section class="hero">
        <div class="hero__glow" aria-hidden="true"></div>
        <div class="hero__badge"><span class="dot dot--live"></span>0원 · 무료로 시작</div>
        <h1>폴더 하나면,<br><span class="hero__accent">사이트 하나.</span></h1>
        <p class="hero__sub">HTML 폴더를 끌어다 놓으면 3초 뒤에 주소가 생깁니다. 버전 되돌리기, 내장 편집기, SEO 진단, 폼 수집, 방문자 분석까지 한 곳에서.</p>
        <div class="hero__cta">
          <a class="btn btn--brand btn--lg" href="${cta[1]}">${icon('rocket', 17)}<span>${signed ? '대시보드 열기' : '무료로 시작하기'}</span></a>
          <a class="btn btn--lg" href="#how">어떻게 동작하나요</a>
        </div>
        <div class="hero__stats">
          <div><b>10</b><span>계정당 사이트</span></div>
          <div><b>10MB</b><span>사이트당 용량</span></div>
          <div><b>0원</b><span>월 비용</span></div>
          <div><b>5분</b><span>첫 배포까지</span></div>
        </div>

        <div class="mock" aria-hidden="true">
          <div class="mock__bar"><span></span><span></span><span></span><em>lamp.app/dashboard</em></div>
          <div class="mock__body">
            <div class="mock__side">
              <div class="mock__logo"></div>
              <i></i><i></i><i></i><i></i><i></i>
            </div>
            <div class="mock__main">
              <div class="mock__row">
                <div class="mock__card mock__card--drop"><span class="mock__drop"></span></div>
                <div class="mock__card"><span class="mock__ring"></span></div>
                <div class="mock__card"><span class="mock__chart"></span></div>
              </div>
              <div class="mock__table"><i></i><i></i><i></i></div>
            </div>
          </div>
        </div>
      </section>

      <section class="section" id="features">
        <div class="section__head">
          <div class="eyebrow">기능</div>
          <h2>배포에 필요한 것을 전부 담았습니다</h2>
          <p>Netlify가 하던 일을, 무료 한도 안에서 필요한 만큼만.</p>
        </div>
        <div class="feature-grid">
          ${[
            ['uploadCloud', '끌어다 놓으면 끝', '폴더·ZIP·개별 파일 모두 됩니다. 파일 경로 그대로 배포되고 index.html이 첫 화면이 됩니다.'],
            ['history', '버전과 되돌리기', '배포할 때마다 버전이 쌓입니다. 문제가 생기면 한 번 눌러 이전 버전으로. ZIP으로 내려받을 수도 있습니다.'],
            ['code', '내장 코드 편집기', '파일 트리와 구문 강조 편집기, 실시간 미리보기. PC는 분할, 모바일은 탭으로 봅니다.'],
            ['gauge', 'SEO 진단 0~100', '제목·설명·H1·공유 카드·깨진 링크를 검사하고 구글·SNS 미리보기를 보여 줍니다.'],
            ['forms', 'Forms와 방문자 분석', '폼을 만들면 제출이 쌓이고 CSV로 받습니다. 방문 수는 개인정보 없이 숫자만 셉니다.'],
            ['status:shield', '스팸·피싱 자동 차단', '1분 5회 초과 배포는 잠시 막고, 비밀번호 탈취 폼과 난독화 스크립트는 배포 전에 검사합니다.']
          ].map(([ico, title, text]) => `
            <article class="feature">
              <div class="feature__ico">${icon(ico.replace('status:', ''), 19)}</div>
              <h3>${title}</h3>
              <p>${text}</p>
            </article>`).join('')}
        </div>
      </section>

      <section class="section section--alt" id="how">
        <div class="section__head">
          <div class="eyebrow">작동 방식</div>
          <h2>세 단계면 주소가 생깁니다</h2>
        </div>
        <div class="steps">
          ${[
            ['01', '로그인', '이메일 링크나 GitHub 계정으로 시작합니다. 카드 등록은 없습니다.'],
            ['02', '끌어다 놓기', '사이트 폴더나 ZIP을 던지면 파일을 검사하고 새 버전을 만듭니다.'],
            ['03', '주소 공유', '생긴 주소를 그대로 쓰거나 도메인을 붙입니다. QR과 배지도 만들 수 있습니다.']
          ].map(([n, t, d]) => `<div class="step"><div class="step__n">${n}</div><h3>${t}</h3><p>${d}</p></div>`).join('')}
        </div>
      </section>

      <section class="section" id="tools">
        <div class="section__head">
          <div class="eyebrow">문서·설정 생성기</div>
          <h2>귀찮은 페이지는 자동으로</h2>
          <p>사이트에 바로 배포되는 초안을 만듭니다. 내용은 언제든 고칠 수 있습니다.</p>
        </div>
        <div class="gen-grid">
          ${[
            ['shield', '개인정보 처리방침', '수집 항목·보관 기간·문의처를 채워 /privacy 페이지로'],
            ['scale', '이용약관', '서비스 내용과 책임 범위를 담아 /terms 페이지로'],
            ['tag', 'ads.txt', 'AdSense 게시자 ID만 넣으면 바로 생성'],
            ['file', '커스텀 404', '사이트 분위기에 맞춘 404.html']
          ].map(([ico, t, d]) => `<div class="gen"><div class="feature__ico">${icon(ico, 18)}</div><div><b>${t}</b><p>${d}</p></div></div>`).join('')}
        </div>
      </section>

      <section class="section section--alt" id="limits">
        <div class="section__head">
          <div class="eyebrow">한도와 안전</div>
          <h2>무료 한도도 분명하게</h2>
        </div>
        <div class="limit-grid">
          <div class="limit"><b>10개</b><span>계정당 사이트</span></div>
          <div class="limit"><b>10MB</b><span>사이트당 용량</span></div>
          <div class="limit"><b>20개</b><span>버전 보관</span></div>
          <div class="limit"><b>5회/분</b><span>배포 속도 제한</span></div>
        </div>
        <div class="note note--info" style="max-width:760px;margin:22px auto 0">
          ${icon('shield', 16)}
          <div class="note__body"><b>스팸과 피싱은 배포 전에 검사합니다.</b>
          비밀번호를 다른 곳으로 보내는 폼, 다른 서비스 로그인을 흉내 내는 화면, 난독화된 스크립트는 차단되고 이유를 그대로 알려 드립니다.</div>
        </div>
      </section>

      <section class="section cta-foot">
        <div class="cta-foot__glow" aria-hidden="true"></div>
        <h2>오늘 만들고, 오늘 공유하세요</h2>
        <p>가입은 30초, 카드 등록은 없습니다.</p>
        <div class="row" style="justify-content:center">
          <a class="btn btn--brand btn--lg" href="${cta[1]}">${icon('spark', 17)}<span>${cta[0]}</span></a>
          <a class="btn btn--lg" href="#/login">로그인</a>
        </div>
      </section>

      <footer class="landing__foot">
        <div class="brand"><img class="brand__orb" src="assets/lamp-orb.svg" alt="" width="20" height="20"><span class="brand__word" style="font-size:15px">Lamp</span></div>
        <div class="small dim">폴더를 끌어다 놓으면 사이트가 되는 0원 배포 플랫폼 · v${CFG.version}</div>
      </footer>
    </div>`,
    mount(root) {
      root.querySelectorAll('a[href^="#"]').forEach((a) => {
        a.addEventListener('click', (e) => {
          const href = a.getAttribute('href');
          if (href.startsWith('#/')) return;
          e.preventDefault();
          const target = document.querySelector(href);
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    }
  };
}

/* ================================================================ 로그인 */

export async function loginView() {
  if (isSignedIn()) { go('/dashboard'); return null; }
  let ghOn = false;
  try { ghOn = await providerEnabled('github'); } catch (e) { ghOn = false; }
  const lkOn = !!CFG.lk.clientId;

  return {
    chrome: false,
    body: `<div class="auth">
      <div class="auth__art">
        <div class="auth__brand"><img src="assets/lamp-orb.svg" alt="">Lamp</div>
        <div class="auth__pitch">
          <h2>폴더를 끌어다 놓으면<br>사이트가 됩니다</h2>
          <p>무료로 10개 사이트, 사이트당 10MB. 버전 되돌리기와 내장 편집기, SEO 진단까지 함께.</p>
          <div class="auth__points">
            <div class="auth__point">${icon('check', 15)}<span>카드 등록 없이 0원으로 시작</span></div>
            <div class="auth__point">${icon('check', 15)}<span>배포할 때마다 버전이 쌓이고 되돌릴 수 있습니다</span></div>
            <div class="auth__point">${icon('check', 15)}<span>피싱·악성 스크립트는 배포 전에 차단</span></div>
          </div>
        </div>
        <div class="auth__foot">Lamp v${CFG.version} · 폴더 하나로 끝나는 배포</div>
      </div>

      <div class="auth__panel">
        <div class="auth__box">
          <div class="auth__mob-brand"><img src="assets/lamp-orb.svg" alt="">Lamp</div>
          <h1>Lamp 시작하기</h1>
          <p>로그인하면 바로 배포할 수 있습니다.</p>

          <div class="auth__providers">
            <button class="btn btn--lg btn--block ${ghOn ? '' : 'btn--muted'}" data-act="login-github">
              ${icon('github', 18)}<span>GitHub로 계속</span>
            </button>
            <button class="btn btn--lg btn--block" data-act="login-lk">
              ${icon('key', 18)}<span>LK ID로 계속</span>
            </button>
          </div>
          <div data-provider-note class="mt-8"></div>

          <div class="divider-or">또는 이메일</div>

          <div class="stack">
            <div class="field"><label for="login-email">이메일</label>
              <input class="input" id="login-email" type="email" placeholder="you@example.com" autocomplete="email" data-email>
            </div>
            <div class="field" data-code-field hidden><label for="login-code">메일로 온 6자리 코드</label>
              <input class="input input--mono" id="login-code" inputmode="numeric" placeholder="123456" data-code>
            </div>
            <button class="btn btn--dark btn--block btn--lg" data-act="email-send">로그인 링크 받기</button>
            <button class="btn btn--ghost btn--sm btn--block" data-act="toggle-password">비밀번호로 로그인</button>
          </div>

          <div data-login-msg class="mt-16"></div>

          <p class="tiny dim mt-16" style="text-align:center">계속하면 Lamp의 이용 규칙에 동의하는 것으로 봅니다.<br>로그인 정보는 Supabase가 처리하고 Lamp는 비밀번호를 저장하지 않습니다.</p>
        </div>
      </div>
    </div>`,
    mount(root) {
      const msg = (kind, text) => { root.querySelector('[data-login-msg]').innerHTML = text; };

      root.querySelector('[data-act="login-github"]').addEventListener('click', () => {
        if (ghOn) { location.href = githubUrl(); return; }
        msg('warn', `<div class="note note--warn">${icon('alert', 16)}<div class="note__body">
          <b>GitHub 로그인이 아직 설정되지 않았습니다.</b>
          Supabase 프로젝트에서 Authentication → Providers → GitHub을 켜고 OAuth 앱의 Client ID·Secret을 넣으면 바로 동작합니다.
          지금은 아래 이메일 로그인을 사용해 주세요.</div></div>`);
      });

      root.querySelector('[data-act="login-lk"]').addEventListener('click', () => {
        if (lkOn) { location.href = lkIdUrl(); return; }
        msg('warn', `<div class="note note--warn">${icon('alert', 16)}<div class="note__body">
          <b>LK ID 앱 등록이 필요합니다.</b>
          Lamp가 LK 로그인을 쓰려면 LK 쪽에 Lamp의 client_id와 돌아올 주소(${esc(CFG.site)})가 등록되어야 합니다.
          등록되면 이 버튼이 바로 동작합니다. 지금은 이메일 로그인을 사용해 주세요.</div></div>`);
      });

      let passwordMode = false;
      root.querySelector('[data-act="toggle-password"]').addEventListener('click', (e) => {
        passwordMode = !passwordMode;
        e.currentTarget.textContent = passwordMode ? '이메일 링크로 로그인' : '비밀번호로 로그인';
        const pw = root.querySelector('[data-password]');
        if (pw) pw.remove();
        if (passwordMode) {
          const host = root.querySelector('[data-code-field]');
          const wrap = document.createElement('div');
          wrap.className = 'field';
          wrap.innerHTML = `<label for="login-pw">비밀번호</label><input class="input" id="login-pw" type="password" autocomplete="current-password" data-password>`;
          host.insertAdjacentElement('beforebegin', wrap);
          root.querySelector('[data-code-field]').hidden = true;
          root.querySelector('[data-act="email-send"]').textContent = '로그인';
          root.querySelector('[data-act="email-send"]').dataset.mode = 'password';
        } else {
          root.querySelector('[data-act="email-send"]').textContent = '로그인 링크 받기';
          root.querySelector('[data-act="email-send"]').dataset.mode = 'link';
        }
      });

      root.querySelector('[data-act="email-send"]').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const email = (root.querySelector('[data-email]').value || '').trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          msg('warn', `<div class="note note--warn">${icon('alert', 16)}<div class="note__body">이메일 주소를 확인해 주세요.</div></div>`);
          return;
        }
        btn.disabled = true;
        const mode = btn.dataset.mode || 'link';
        try {
          if (mode === 'password') {
            const pw = (root.querySelector('[data-password]') || {}).value || '';
            await signInEmail(email, pw);
            location.hash = '#/dashboard';
            location.reload();
            return;
          }
          await sendMagicLink(email);
          root.querySelector('[data-code-field]').hidden = false;
          msg('ok', `<div class="note note--ok">${icon('check', 16)}<div class="note__body">
            <b>${esc(email)}로 로그인 링크를 보냈습니다.</b>
            메일의 링크를 열거나, 메일에 6자리 코드가 있으면 아래에 입력하세요. 메일이 오지 않으면 스팸함을 확인해 주세요.</div></div>`);
          const codeBtn = document.createElement('button');
          codeBtn.className = 'btn btn--sm btn--block mt-8';
          codeBtn.textContent = '코드로 로그인';
          codeBtn.addEventListener('click', async () => {
            const code = (root.querySelector('[data-code]').value || '').trim();
            if (code.length < 4) { msg('warn', '코드를 입력해 주세요.'); return; }
            try {
              await verifyEmailCode(email, code);
              location.hash = '#/dashboard';
              location.reload();
            } catch (err) {
              msg('bad', `<div class="note note--bad">${icon('alert', 16)}<div class="note__body">${esc(err.message)}</div></div>`);
            }
          });
          root.querySelector('[data-login-msg]').appendChild(codeBtn);
        } catch (err) {
          msg('bad', `<div class="note note--bad">${icon('alert', 16)}<div class="note__body"><b>로그인하지 못했습니다</b>${esc(err.message)}</div></div>`);
        } finally {
          btn.disabled = false;
        }
      });
    }
  };
}

/* ================================================================ 대시보드 */

export async function dashboardView() {
  await loadSitesSafe();
  const sites = state.sites;
  const first = sites[0] || null;

  const totalViews = await aggregateViews(sites);
  const seoTarget = first;

  const active = sites.slice(0, 6);

  return {
    title: '대시보드',
    sub: state.user ? `${state.user.name}님, 오늘도 가볍게 배포해 보세요.` : '폴더를 끌어다 놓으면 사이트가 됩니다.',
    actions: `<button class="btn btn--brand" data-act="quick-deploy">${icon('plus', 16)}<span>새 사이트</span></button>`,
    body: `<div class="grid grid--dash">
      <div class="card">
        <div class="card__head"><div><div class="card__title">사이트 배포</div><div class="card__sub">폴더를 끌어다 놓으면 새 버전이 됩니다</div></div></div>
        <div class="card__body stack">
          ${sites.length ? `<div class="field"><label>배포할 사이트</label>
            ${selectHTML({ name: 'target', block: true, value: first.slug, options: sites.map((s) => ({ value: s.slug, label: s.name, note: 'v' + s.version })) })}
          </div>` : ''}
          <div data-deploy-wrap>${sites.length ? deployPanelHTML() : `<div class="drop" data-empty-drop tabindex="0" role="button">
              <div class="drop__ico">${icon('uploadCloud', 22)}</div>
              <div class="drop__t">첫 사이트를 만들어 보세요</div>
              <div class="drop__s">주소와 이름을 정하고 폴더를 끌어다 놓으면 끝납니다</div>
            </div>`}</div>
          <div data-new-site hidden>
            <div class="stack">
              <div class="field"><label for="ns-name">사이트 이름</label><input class="input" id="ns-name" placeholder="내 포트폴리오" data-ns-name></div>
              <div class="field"><label for="ns-slug">주소</label>
                <div class="input-group"><span class="input-group__suffix" style="border-radius:10px 0 0 10px;border-right:0;border-left:1px solid var(--line-2)">lamp/</span>
                  <input class="input input--mono" id="ns-slug" placeholder="my-portfolio" data-ns-slug style="border-radius:0 10px 10px 0"></div>
                <span class="hint">영문 소문자·숫자·하이픈 3~40자. 만든 뒤에는 바꿀 수 없습니다.</span>
              </div>
              <div class="row"><button class="btn btn--brand" data-act="create-site">${icon('check', 15)}<span>사이트 만들기</span></button></div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card__head"><div><div class="card__title">SEO 건강도</div><div class="card__sub">${seoTarget ? esc(seoTarget.name) : '사이트를 만들면 진단합니다'}</div></div>
          ${seoTarget ? `<a class="link link--muted small" href="#/site/${encodeURIComponent(seoTarget.slug)}/seo">전체 ${icon('chevronRight', 12)}</a>` : ''}</div>
        <div class="card__body">
          <div data-seo-host>${seoTarget ? '<div class="small dim">진단하는 중입니다.</div>' : emptyBox({ ico: 'gauge', title: '아직 사이트가 없습니다', text: '첫 배포를 하면 제목·설명·공유 카드 점수를 계산해 드립니다.' })}</div>
        </div>
      </div>

      <div class="card">
        <div class="card__head"><div><div class="card__title">방문자</div><div class="card__sub">모든 사이트 · 최근 7일</div></div>
          <a class="link link--muted small" href="#/analytics">자세히</a></div>
        <div class="card__body">
          <div class="stat">
            <div class="stat__num">${fmtNum(totalViews.week)}</div>
            <div class="small dim">${totalViews.live ? `최근 3시간 ${fmtNum(totalViews.live)}회` : '페이지 조회 기준'}</div>
          </div>
          ${areaChart(totalViews.points, { labelEvery: 2 })}
        </div>
      </div>
    </div>

    <div class="card mt-16">
      <div class="card__head"><div><div class="card__title">활성 사이트</div><div class="card__sub">${sites.length} / ${state.limits.sitesPerUser}개 사용 중</div></div>
        <a class="link link--muted small" href="#/sites">전체 보기 ${icon('chevronRight', 12)}</a></div>
      <div class="card__body" style="padding-top:0">
        ${active.length ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>사이트</th><th class="hide-sm">주소</th><th>상태</th><th class="hide-sm">버전</th><th class="hide-sm">업데이트</th><th></th></tr></thead>
          <tbody>${active.map((s) => `<tr>
            <td><div class="cell-site">${thumbFor(s)}<div style="min-width:0"><b class="truncate" style="display:block">${esc(s.name)}</b><span class="tiny dim">${s.files}개 파일 · ${fmtBytes(s.bytes)}</span></div></div></td>
            <td class="hide-sm"><a class="cell-url" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a></td>
            <td>${s.hasPassword ? '<span class="badge badge--warn">비공개</span>' : '<span class="badge badge--ok"><span class="dot dot--live"></span>공개</span>'}</td>
            <td class="hide-sm small">v${s.version}</td>
            <td class="hide-sm small dim">${relTime(s.updated)}</td>
            <td style="text-align:right"><a class="btn btn--sm" href="#/site/${encodeURIComponent(s.slug)}">관리</a></td>
          </tr>`).join('')}</tbody>
        </table></div>` : emptyBox({ ico: 'sites', title: '아직 사이트가 없습니다', text: '위 카드에서 폴더를 끌어다 놓거나 새 사이트를 만들어 보세요.', action: '<button class="btn btn--brand btn--sm mt-8" data-act="quick-deploy">새 사이트 만들기</button>' })}
      </div>
    </div>

    ${sites.length < 2 ? `<div class="card mt-16 card--pad">
      <div class="row" style="gap:14px;align-items:flex-start">
        <div class="feature__ico">${icon('spark', 18)}</div>
        <div style="flex:1"><b>다음에 해 보면 좋은 것</b>
          <div class="small muted mt-8">템플릿으로 두 번째 사이트를 만들고, IDE에서 문구를 바꿔 보세요. 생성기로 개인정보 처리방침도 바로 붙일 수 있습니다.</div>
        </div>
        <div class="row row--tight"><a class="btn btn--sm" href="#/tools">도구·생성기</a><a class="btn btn--sm" href="#/docs">문서</a></div>
      </div>
    </div>` : ''}`,
    async mount(root) {
      bindDashboard(root);
    }
  };
}

async function aggregateViews(sites) {
  const week = [];
  let live = 0;
  const today = new Date();
  const map = new Map();
  for (const s of sites.slice(0, 10)) {
    try {
      const a = await api.analytics(s.slug, 7);
      live += a.live || 0;
      for (const d of a.daily) map.set(d.date, (map.get(d.date) || 0) + d.views);
    } catch (e) { /* 개별 실패 무시 */ }
  }
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10);
    week.push({ date: d, views: map.get(d) || 0 });
  }
  const points = week.map((d) => ({ label: d.date.slice(5).replace('-', '/'), value: d.views }));
  return { week: week.reduce((n, d) => n + d.views, 0), live, points };
}

function bindDashboard(root) {
  bindSelects(root);
  let currentSlug = root.querySelector('[data-sel="target"]') ? root.querySelector('[data-sel="target"]').dataset.value : (state.sites[0] ? state.sites[0].slug : '');

  const wrap = root.querySelector('[data-deploy-wrap]');
  const newSite = root.querySelector('[data-new-site]');

  const mountPanel = () => {
    if (!wrap || !currentSlug) return;
    wrap.innerHTML = deployPanelHTML();
    mountDeployPanel(wrap, { slug: currentSlug, onDone: async () => { await loadSitesSafe(true); rerender(); } });
  };
  if (currentSlug) mountPanel();

  root.addEventListener('sel:change', () => {});
  const selBtn = root.querySelector('.sel__pop .sel__opt');
  root.querySelectorAll('.sel__opt').forEach((o) => o.addEventListener('click', () => {
    currentSlug = o.dataset.value;
    mountPanel();
  }));

  root.querySelector('[data-act="quick-deploy"]')?.addEventListener('click', () => {
    if (state.sites.length) { go('/site/' + encodeURIComponent(state.sites[0].slug) + '/deploy'); return; }
    if (newSite) { newSite.hidden = false; wrap.hidden = true; root.querySelector('[data-ns-name]').focus(); }
  });

  const nsName = root.querySelector('[data-ns-name]');
  const nsSlug = root.querySelector('[data-ns-slug]');
  if (nsName && nsSlug) {
    nsName.addEventListener('input', () => { if (!nsSlug.dataset.touched) nsSlug.value = slugify(nsName.value); });
    nsSlug.addEventListener('input', () => { nsSlug.dataset.touched = '1'; nsSlug.value = slugify(nsSlug.value); });
  }

  root.querySelector('[data-act="create-site"]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const name = (nsName.value || '').trim();
    const slug = (nsSlug.value || '').trim();
    if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) {
      note('warn', '주소는 영문 소문자·숫자·하이픈 3~40자로 입력해 주세요.');
      return;
    }
    btn.disabled = true;
    try {
      await api.createSite(slug, name || slug);
      await loadSitesSafe(true);
      note('ok', '사이트를 만들었습니다. 이제 폴더를 끌어다 놓으세요.');
      go('/site/' + encodeURIComponent(slug) + '/deploy');
    } catch (err) {
      note('bad', err.message);
      btn.disabled = false;
    }
  });

  // SEO 진단
  const seoHost = root.querySelector('[data-seo-host]');
  const target = state.sites[0];
  if (seoHost && target) {
    (async () => {
      try {
        const res = await api.files(target.slug, target.version);
        const texts = {};
        for (const [p, f] of Object.entries(res.files)) if (f.text !== undefined) texts[p] = f.text;
        const r = analyzeSite({ files: texts, baseUrl: target.url, siteSlug: target.slug });
        seoHost.innerHTML = `${ringHTML(r.score, { color: r.score >= 90 ? 'var(--ok)' : r.score >= 70 ? 'var(--brand)' : 'var(--bad)' })}
          <div style="text-align:center" class="mt-8"><b>${r.score >= 90 ? '아주 좋습니다' : r.score >= 70 ? '조금만 고치면 좋습니다' : '손볼 곳이 있습니다'}</b></div>
          <div class="row mt-8" style="justify-content:center">
            <span class="badge badge--ok">통과 ${r.counts.pass}</span>
            <span class="badge badge--warn">주의 ${r.counts.warn}</span>
            <span class="badge badge--bad">실패 ${r.counts.fail}</span>
          </div>
          <a class="btn btn--sm btn--block mt-16" href="#/site/${encodeURIComponent(target.slug)}/seo">진단 자세히</a>`;
      } catch (e) {
        seoHost.innerHTML = `<div class="small dim">진단하지 못했습니다. ${esc(e.message)}</div>`;
      }
    })();
  }
}

async function loadSitesSafe(force = false) {
  try { await loadSites(force); } catch (e) { state.sites = []; }
}

async function loadSites(force) {
  const { loadSites: ls } = await import('./core.js');
  return await ls(force);
}

/* ================================================================ 사이트 목록 */

export async function sitesView() {
  await loadSitesSafe();
  const sites = state.sites;

  return {
    title: '사이트',
    sub: `${sites.length} / ${state.limits.sitesPerUser}개 사용 중 · 사이트당 10MB`,
    actions: `<a class="btn btn--brand" href="#/dashboard">${icon('plus', 16)}<span>새 사이트</span></a>`,
    body: sites.length ? `<div class="card">
      <div class="table-wrap"><table class="table">
        <thead><tr><th>사이트</th><th class="hide-sm">주소</th><th>상태</th><th class="hide-sm">용량</th><th class="hide-sm">업데이트</th><th></th></tr></thead>
        <tbody>${sites.map((s) => `<tr>
          <td><div class="cell-site">${thumbFor(s)}<div style="min-width:0"><b class="truncate" style="display:block">${esc(s.name)}</b><span class="tiny dim">v${s.version} · ${s.files}개 파일</span></div></div></td>
          <td class="hide-sm"><a class="cell-url" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url.replace(/^https?:\/\//, ''))}</a></td>
          <td>${s.hasPassword ? '<span class="badge badge--warn">비공개</span>' : '<span class="badge badge--ok"><span class="dot dot--live"></span>공개</span>'}</td>
          <td class="hide-sm small">${fmtBytes(s.bytes)}</td>
          <td class="hide-sm small dim">${relTime(s.updated)}</td>
          <td style="text-align:right"><div class="row row--tight" style="justify-content:flex-end">
            <a class="btn btn--sm" href="#/site/${encodeURIComponent(s.slug)}">관리</a>
            <a class="btn btn--sm btn--ghost" href="#/site/${encodeURIComponent(s.slug)}/deploy">배포</a>
          </div></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>` : emptyBox({ ico: 'sites', title: '아직 사이트가 없습니다', text: '대시보드에서 주소와 이름을 정하고 폴더를 끌어다 놓으면 첫 사이트가 만들어집니다.', action: `<a class="btn btn--brand mt-8" href="#/dashboard">첫 사이트 만들기</a>` }),
    mount(root) {
      if (!sites.length) return;
    }
  };
}

/* ================================================================ 배포 목록 */

export async function deploysView() {
  await loadSitesSafe();
  const sites = state.sites;
  const rows = [];
  for (const s of sites) {
    try {
      const r = await api.site(s.slug);
      for (const v of (r.versions || []).slice(0, 6)) rows.push({ site: s, v });
    } catch (e) { /* 무시 */ }
  }
  rows.sort((a, b) => (a.v.ts < b.v.ts ? 1 : -1));

  return {
    title: '배포',
    sub: '모든 사이트의 버전 기록입니다. 되돌리기와 ZIP 내려받기를 지원합니다.',
    actions: sites.length ? `<a class="btn" href="#/sites">${icon('sites', 16)}<span>사이트 관리</span></a>` : '',
    body: rows.length ? `<div class="card">
      <div class="table-wrap"><table class="table">
        <thead><tr><th>시각</th><th>사이트</th><th>버전</th><th class="hide-sm">내용</th><th class="hide-sm">크기</th><th></th></tr></thead>
        <tbody>${rows.map(({ site, v }) => `<tr>
          <td class="small dim nowrap">${relTime(v.ts)}</td>
          <td><a href="#/site/${encodeURIComponent(site.slug)}/deploy" class="link link--muted">${esc(site.name)}</a></td>
          <td><span class="badge ${v.v === site.current ? 'badge--ok' : ''}">v${v.v}</span> ${v.preview ? '<span class="badge badge--info">미리보기</span>' : ''}</td>
          <td class="hide-sm small">${esc(v.message)}</td>
          <td class="hide-sm small dim">${fmtBytes(v.bytes)} · ${v.files}개</td>
          <td style="text-align:right"><a class="btn btn--sm" href="#/site/${encodeURIComponent(site.slug)}/deploy">열기</a></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>` : emptyBox({ ico: 'deploys', title: '배포 기록이 없습니다', text: '사이트에 폴더를 끌어다 놓으면 여기에 버전이 쌓입니다.', action: '<a class="btn btn--brand btn--sm mt-8" href="#/dashboard">배포하러 가기</a>' }),
    mount() {}
  };
}

/* ================================================================ 도메인 */

export async function domainsView() {
  await loadSitesSafe();
  const sites = state.sites;
  return {
    title: '도메인',
    sub: 'Lamp 주소를 그대로 쓰거나, 가진 도메인을 연결할 수 있습니다.',
    actions: '',
    body: `<div class="grid grid--site">
      <div class="card">
        <div class="card__head"><div><div class="card__title">사이트별 주소</div><div class="card__sub">기본 주소는 항상 동작합니다</div></div></div>
        <div class="card__body">
          ${sites.length ? `<div class="stack" style="gap:0">
            ${sites.map((s) => `<div class="tl-item" style="grid-template-columns:minmax(0,1fr) auto">
              <div class="tl-main"><div class="tl-title">${esc(s.name)}</div>
                <div class="tl-meta">${esc(s.url)}${s.customDomain ? ` · 도메인 ${esc(s.customDomain)}` : ''}</div></div>
              <div class="row row--tight">
                <button class="btn btn--sm" data-act="copy" data-value="${esc(s.url)}">${icon('copy', 14)}<span>복사</span></button>
                <a class="btn btn--sm" href="#/site/${encodeURIComponent(s.slug)}/settings">${icon('domains', 14)}<span>연결</span></a>
              </div></div>`).join('')}
          </div>` : emptyBox({ ico: 'domains', title: '사이트가 없습니다', text: '먼저 사이트를 배포하면 주소가 생깁니다.' })}
        </div>
      </div>

      <div class="stack">
        <div class="card card--pad">
          <div class="section-title">커스텀 도메인 연결 순서</div>
          <div class="stack small muted" style="gap:10px">
            <div><b>1.</b> Cloudflare에 도메인을 추가하고 네임서버를 Cloudflare로 바꿉니다.</div>
            <div><b>2.</b> DNS에 <code class="code--inline">CNAME www → lamp-edge.helpaboutflux.workers.dev</code> 를 추가합니다.</div>
            <div><b>3.</b> Workers → lamp-edge → Settings → Domains &amp; Routes 에서 도메인을 추가합니다.</div>
            <div><b>4.</b> Lamp 사이트 설정에 도메인을 적어 두면 관리 화면에서 함께 보입니다.</div>
          </div>
        </div>
        <div class="note note--info">${icon('info', 16)}<div class="note__body">
          HTTPS 인증서는 Cloudflare가 자동으로 발급합니다. 전파까지 보통 5분~1시간 걸립니다.</div></div>
      </div>
    </div>`,
    mount(root) {
      root.querySelectorAll('[data-act="copy"]').forEach((b) => b.addEventListener('click', async () => {
        const ok = await copyText(b.dataset.value);
        note(ok ? 'ok' : 'bad', ok ? '복사했습니다.' : '복사하지 못했습니다.');
      }));
    }
  };
}

/* ================================================================ 전체 분석 */

export async function analyticsView() {
  await loadSitesSafe();
  const rows = [];
  let live = 0;
  const dayMap = new Map();
  for (const s of state.sites) {
    try {
      const a = await api.analytics(s.slug, 14);
      live += a.live || 0;
      const week = a.daily.reduce((n, d) => n + d.views, 0);
      rows.push({ site: s, week, today: a.daily[a.daily.length - 1] ? a.daily[a.daily.length - 1].views : 0 });
      for (const d of a.daily) dayMap.set(d.date, (dayMap.get(d.date) || 0) + d.views);
    } catch (e) { /* 무시 */ }
  }
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    days.push({ date: d, views: dayMap.get(d) || 0 });
  }
  rows.sort((a, b) => b.week - a.week);

  return {
    title: '방문자 분석',
    sub: '개인정보 없이 페이지 조회 수만 셉니다.',
    actions: '',
    body: `<div class="grid grid--3">
      <div class="card card--pad"><div class="eyebrow">최근 14일</div><div class="stat__num">${fmtNum(days.reduce((n, d) => n + d.views, 0))}</div><div class="small dim">전체 페이지 조회</div></div>
      <div class="card card--pad"><div class="eyebrow">실시간</div><div class="stat__num">${fmtNum(live)}</div><div class="small dim">최근 3시간</div></div>
      <div class="card card--pad"><div class="eyebrow">사이트</div><div class="stat__num">${state.sites.length}</div><div class="small dim">집계 대상</div></div>
    </div>

    <div class="card mt-16">
      <div class="card__head"><div><div class="card__title">일별 방문</div><div class="card__sub">봇·미리보기 제외</div></div></div>
      <div class="card__body">${areaChart(days.map((d) => ({ label: d.date.slice(5).replace('-', '/'), value: d.views })), { height: 180, labelEvery: 2 })}</div>
    </div>

    <div class="card mt-16">
      <div class="card__head"><div><div class="card__title">사이트별</div><div class="card__sub">최근 14일</div></div></div>
      <div class="card__body" style="padding-top:0">
        ${rows.length ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>사이트</th><th>오늘</th><th>14일</th><th></th></tr></thead>
          <tbody>${rows.map((r) => `<tr><td><div class="cell-site">${thumbFor(r.site)}<b>${esc(r.site.name)}</b></div></td>
            <td>${fmtNum(r.today)}</td><td><b>${fmtNum(r.week)}</b></td>
            <td style="text-align:right"><a class="btn btn--sm" href="#/site/${encodeURIComponent(r.site.slug)}/analytics">자세히</a></td></tr>`).join('')}</tbody>
        </table></div>` : `<div class="small dim">아직 기록이 없습니다.</div>`}
      </div>
    </div>`,
    mount() {}
  };
}

/* ================================================================ 전체 Forms */

export async function formsAllView() {
  await loadSitesSafe();
  const all = [];
  for (const s of state.sites) {
    try {
      const r = await api.forms(s.slug);
      for (const f of r.forms || []) all.push({ site: s, form: f });
    } catch (e) { /* 무시 */ }
  }
  const total = all.reduce((n, x) => n + (x.form.count || 0), 0);

  return {
    title: 'Forms',
    sub: `${all.length}개 폼 · 제출 ${total}건`,
    actions: state.sites.length ? `<a class="btn" href="#/site/${encodeURIComponent(state.sites[0].slug)}/forms">${icon('plus', 16)}<span>폼 만들기</span></a>` : '',
    body: all.length ? `<div class="grid grid--3">
      ${all.map(({ site, form }) => `<div class="card card--pad">
        <div class="row"><b>${esc(form.name)}</b><span class="spacer"></span><span class="badge">${form.count || 0}건</span></div>
        <div class="small dim mt-8">${esc(site.name)}</div>
        <div class="row row--tight mt-16">
          <button class="btn btn--sm" data-act="copy" data-value="${esc(formEndpointOf(form.id))}">${icon('copy', 14)}<span>주소</span></button>
          <a class="btn btn--sm" href="#/site/${encodeURIComponent(site.slug)}/forms">${icon('forms', 14)}<span>제출 보기</span></a>
        </div>
      </div>`).join('')}
    </div>` : emptyBox({ ico: 'forms', title: '아직 폼이 없습니다', text: '사이트 상세의 Forms 탭에서 폼을 만들면 제출이 여기에 모입니다.', action: '<a class="btn btn--brand btn--sm mt-8" href="#/sites">사이트 선택</a>' }),
    mount(root) {
      root.querySelectorAll('[data-act="copy"]').forEach((b) => b.addEventListener('click', async () => {
        const ok = await copyText(b.dataset.value);
        note(ok ? 'ok' : 'bad', ok ? '복사했습니다.' : '복사하지 못했습니다.');
      }));
    }
  };
}

function formEndpointOf(id) {
  return `${state.base || 'https://lamp-edge.helpaboutflux.workers.dev'}/f/${id}`;
}
