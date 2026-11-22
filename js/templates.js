/* Lamp — 스타터 템플릿 */

export const TEMPLATES = [
  {
    id: 'landing',
    name: '제품 랜딩 페이지',
    note: '히어로 · 기능 3개 · 문의 버튼',
    icon: 'rocket',
    files: () => ({
      'index.html': `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>제품 이름 - 한 줄 소개</title>
<meta name="description" content="이 페이지는 Lamp로 만든 제품 소개 페이지입니다. 무엇을 하는지, 누구를 위한 것인지 한두 문장으로 알려 주세요.">
<meta property="og:title" content="제품 이름 - 한 줄 소개">
<meta property="og:description" content="무엇을 하는지 한두 문장으로 알려 주세요.">
<meta property="og:type" content="website">
<style>
  :root { --ink: #17150f; --muted: #6b6455; --line: #e7e1d3; --brand: #f0a81e; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Pretendard", "Malgun Gothic", system-ui, sans-serif;
    color: var(--ink); background: #fffdf9; line-height: 1.65; -webkit-font-smoothing: antialiased; }
  .wrap { max-width: 940px; margin: 0 auto; padding: 0 22px; }
  header { display: flex; align-items: center; justify-content: space-between; padding: 22px 0; }
  .logo { display: flex; align-items: center; gap: 9px; font-weight: 700; font-size: 17px; }
  .logo i { width: 22px; height: 22px; border-radius: 50%; background: radial-gradient(circle at 50% 40%, #fff8d0, #ffd23f 55%, rgba(255,210,63,0) 75%); display: block; }
  nav a { color: var(--muted); text-decoration: none; font-size: 14px; marginleft: 18px; margin-left: 18px; }
  .hero { padding: 74px 0 54px; }
  .eyebrow { font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
  h1 { font-size: clamp(30px, 5vw, 48px); line-height: 1.16; letter-spacing: -0.03em; margin: 14px 0 16px; }
  .hero p { font-size: 17px; color: var(--muted); max-width: 560px; margin: 0 0 28px; }
  .cta { display: inline-flex; align-items: center; gap: 8px; background: var(--ink); color: #fff; text-decoration: none;
    padding: 13px 22px; border-radius: 12px; font-weight: 600; font-size: 15px; }
  .cta:hover { background: #2c2820; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; padding: 8px 0 64px; }
  .card { border: 1px solid var(--line); border-radius: 16px; padding: 20px; background: #fff; }
  .card b { display: block; font-size: 15px; margin-bottom: 6px; }
  .card span { color: var(--muted); font-size: 13.5px; }
  footer { border-top: 1px solid var(--line); padding: 22px 0 40px; color: var(--muted); font-size: 13px; }
  @media (max-width: 640px) { .hero { padding: 48px 0 36px; } }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="logo"><i></i>제품 이름</div>
    <nav><a href="#features">기능</a><a href="#contact">문의</a></nav>
  </header>

  <section class="hero">
    <div class="eyebrow">New</div>
    <h1>한 문장으로 설명하는<br>제품의 가치</h1>
    <p>누구의 어떤 문제를 어떻게 해결하는지 두 문장으로 적어 보세요. 처음 방문한 사람이 3초 안에 이해할 수 있어야 합니다.</p>
    <a class="cta" href="#contact">시작하기</a>
  </section>

  <section class="grid" id="features">
    <div class="card"><b>빠르다</b><span>핵심 기능 하나를 구체적인 숫자와 함께 소개하세요.</span></div>
    <div class="card"><b>간단하다</b><span>설정 없이 바로 쓸 수 있다는 점을 강조하세요.</span></div>
    <div class="card"><b>안전하다</b><span>데이터를 어떻게 다루는지 한 줄로 알려 주세요.</span></div>
  </section>

  <footer id="contact">
    문의: <a href="mailto:hello@example.com">hello@example.com</a> · © 2026 제품 이름
  </footer>
</div>
</body>
</html>
`,
      'robots.txt': `User-agent: *\nAllow: /\n`,
      '404.html': `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>페이지를 찾을 수 없습니다</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:-apple-system,"Segoe UI","Malgun Gothic",sans-serif;background:#fffdf9;color:#17150f;text-align:center;padding:24px}
h1{font-size:22px;margin:0 0 10px}p{color:#6b6455;margin:0 0 20px}a{color:#17150f;font-weight:600}</style></head>
<body><div><h1>페이지를 찾을 수 없습니다</h1><p>주소를 다시 확인해 주세요.</p><a href="/">첫 화면으로</a></div></body></html>
`
    })
  },
  {
    id: 'portfolio',
    name: '개인 포트폴리오',
    note: '소개 · 작업 3개 · 연락처',
    icon: 'pen',
    files: () => ({
      'index.html': `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>이름 - 포트폴리오</title>
<meta name="description" content="디자인과 개발 작업을 정리한 개인 포트폴리오입니다. 프로젝트 세 개와 연락 방법을 담았습니다.">
<meta property="og:title" content="이름 - 포트폴리오">
<meta property="og:description" content="디자인과 개발 작업을 정리한 개인 포트폴리오입니다.">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Pretendard", "Malgun Gothic", system-ui, sans-serif;
    background: #f7f5f0; color: #17150f; line-height: 1.65; -webkit-font-smoothing: antialiased; }
  .wrap { max-width: 780px; margin: 0 auto; padding: 64px 22px 90px; }
  header { display: flex; align-items: center; gap: 16px; margin-bottom: 46px; }
  .avatar { width: 56px; height: 56px; border-radius: 50%; background: linear-gradient(140deg, #ffe28a, #f0a81e); flex: none; }
  h1 { font-size: 26px; margin: 0; letter-spacing: -0.03em; }
  .role { color: #6b6455; font-size: 14px; }
  p.lead { font-size: 16.5px; color: #423d33; max-width: 620px; margin: 0 0 44px; }
  h2 { font-size: 13px; letter-spacing: .12em; text-transform: uppercase; color: #8b8474; margin: 0 0 16px; }
  .work { display: grid; gap: 12px; margin-bottom: 48px; }
  .item { display: flex; align-items: center; gap: 16px; padding: 16px 18px; background: #fffdf9; border: 1px solid #e7e1d3; border-radius: 14px; text-decoration: none; color: inherit; }
  .item:hover { border-color: #d6cdb8; }
  .item .tag { font-size: 11.5px; color: #8b8474; }
  .item b { display: block; font-size: 15px; }
  .item .arrow { margin-left: auto; color: #8b8474; }
  footer a { color: #17150f; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="avatar"></div>
    <div><h1>이름</h1><div class="role">만드는 사람 · 서울</div></div>
  </header>

  <p class="lead">짧게 자기소개를 적는 곳입니다. 무엇을 만들고, 어떤 문제를 좋아하는지 두세 문장으로 보여 주세요.</p>

  <h2>작업</h2>
  <div class="work">
    <a class="item" href="#"><div><span class="tag">2026 · 웹</span><b>프로젝트 하나</b></div><span class="arrow">→</span></a>
    <a class="item" href="#"><div><span class="tag">2025 · 앱</span><b>프로젝트 둘</b></div><span class="arrow">→</span></a>
    <a class="item" href="#"><div><span class="tag">2025 · 글</span><b>프로젝트 셋</b></div><span class="arrow">→</span></a>
  </div>

  <h2>연락</h2>
  <footer><p>이메일 <a href="mailto:hello@example.com">hello@example.com</a></p></footer>
</div>
</body>
</html>
`
    })
  },
  {
    id: 'docs',
    name: '문서·가이드 페이지',
    note: '목차 · 본문 · 코드 블록',
    icon: 'book',
    files: () => ({
      'index.html': `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>가이드 - 시작하기</title>
<meta name="description" content="처음 사용하는 사람을 위한 단계별 가이드입니다. 설치, 설정, 첫 실행 순서로 설명합니다.">
<meta property="og:title" content="가이드 - 시작하기">
<meta property="og:description" content="처음 사용하는 사람을 위한 단계별 가이드입니다.">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Pretendard", "Malgun Gothic", system-ui, sans-serif;
    color: #17150f; background: #fff; line-height: 1.75; -webkit-font-smoothing: antialiased; }
  .layout { display: grid; grid-template-columns: 220px minmax(0, 1fr); max-width: 1040px; margin: 0 auto; gap: 40px; padding: 40px 22px 80px; }
  aside { position: sticky; top: 32px; align-self: start; font-size: 13.5px; }
  aside b { display: block; font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: #8b8474; margin-bottom: 10px; }
  aside a { display: block; color: #6b6455; text-decoration: none; padding: 5px 0; }
  aside a:hover { color: #17150f; }
  h1 { font-size: 30px; letter-spacing: -0.03em; margin: 0 0 10px; }
  .lead { color: #6b6455; font-size: 16px; margin: 0 0 34px; }
  h2 { font-size: 19px; margin: 40px 0 10px; letter-spacing: -0.02em; }
  p, li { color: #423d33; }
  code { background: #f4f1e9; padding: 2px 6px; border-radius: 5px; font-size: 13px; }
  pre { background: #17150f; color: #f6f1e6; padding: 16px 18px; border-radius: 12px; overflow-x: auto; font-size: 13px; }
  pre code { background: none; color: inherit; padding: 0; }
  @media (max-width: 800px) { .layout { grid-template-columns: 1fr; } aside { display: none; } }
</style>
</head>
<body>
<div class="layout">
  <aside>
    <b>목차</b>
    <a href="#install">설치</a>
    <a href="#setup">설정</a>
    <a href="#first">첫 실행</a>
    <a href="#faq">자주 묻는 질문</a>
  </aside>
  <main>
    <h1>시작하기</h1>
    <p class="lead">이 가이드는 처음 사용하는 사람이 10분 안에 첫 결과를 만들 수 있도록 정리했습니다.</p>

    <h2 id="install">1. 설치</h2>
    <p>설치는 한 줄이면 됩니다. 아래 명령을 터미널에 붙여 넣으세요.</p>
    <pre><code>npm install example-package</code></pre>

    <h2 id="setup">2. 설정</h2>
    <p>프로젝트 폴더에 <code>config.json</code> 파일을 만들고 필요한 값을 채웁니다.</p>

    <h2 id="first">3. 첫 실행</h2>
    <p>설정이 끝났다면 실행해 봅니다. 오류가 나면 메시지를 그대로 복사해 검색해 보세요.</p>

    <h2 id="faq">자주 묻는 질문</h2>
    <p><b>질문을 적는 곳입니다.</b><br>답변을 적는 곳입니다. 짧고 분명하게 쓰면 읽는 사람이 편합니다.</p>
  </main>
</div>
</body>
</html>
`,
      'robots.txt': `User-agent: *\nAllow: /\n`
    })
  },
  {
    id: 'comingsoon',
    name: '오픈 준비 페이지',
    note: '큰 제목 · 이메일 수집 폼',
    icon: 'bolt',
    files: () => ({
      'index.html': `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>곧 열립니다</title>
<meta name="description" content="서비스를 준비하고 있습니다. 이메일을 남기면 가장 먼저 알려 드립니다.">
<meta property="og:title" content="곧 열립니다">
<meta property="og:description" content="서비스를 준비하고 있습니다. 이메일을 남기면 가장 먼저 알려 드립니다.">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; text-align: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Pretendard", "Malgun Gothic", system-ui, sans-serif;
    background: radial-gradient(90% 70% at 50% 0%, #fff6dc 0%, #f7f3e9 55%, #efeade 100%); color: #17150f; }
  .orb { width: 58px; height: 58px; border-radius: 50%; margin: 0 auto 26px;
    background: radial-gradient(circle at 50% 42%, #fffce0 0%, #ffe968 34%, #f8c62c 62%, rgba(248,198,44,0) 78%);
    box-shadow: 0 0 46px 14px rgba(255,214,64,.55); animation: glow 3.4s ease-in-out infinite; }
  @keyframes glow { 50% { box-shadow: 0 0 60px 20px rgba(255,214,64,.7); } }
  h1 { font-size: clamp(28px, 6vw, 46px); letter-spacing: -0.035em; margin: 0 0 12px; }
  p { color: #6b6455; font-size: 15.5px; max-width: 400px; margin: 0 auto 26px; }
  form { display: flex; gap: 8px; max-width: 380px; margin: 0 auto; }
  input { flex: 1; height: 44px; padding: 0 14px; border-radius: 11px; border: 1px solid #ddd5c4; background: #fff; font-size: 14px; }
  button { height: 44px; padding: 0 18px; border: 0; border-radius: 11px; background: #17150f; color: #fff; font-size: 14px; font-weight: 600; }
  small { display: block; margin-top: 14px; color: #9a9284; font-size: 11.5px; }
</style>
</head>
<body>
  <div>
    <div class="orb"></div>
    <h1>곧 열립니다</h1>
    <p>지금 준비하고 있습니다. 이메일을 남겨 주시면 가장 먼저 알려 드립니다.</p>
    <form method="post" action="#">
      <input type="email" name="email" placeholder="you@example.com" required aria-label="이메일">
      <button type="submit">알림 받기</button>
    </form>
    <small>Lamp로 만든 페이지</small>
  </div>
</body>
</html>
`
    })
  }
];

export function templateById(id) {
  return TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];
}
