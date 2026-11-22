/* Lamp — SEO·품질 진단 */

import { esc } from './util.js';

function tag(html, re) {
  const m = re.exec(html);
  return m ? m[1] : '';
}

function stripTags(s) {
  return s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function analyzeSite({ files, baseUrl, siteSlug }) {
  const paths = Object.keys(files);
  const index = files['index.html'] || files['index.htm'] || '';
  const html = index;
  const lower = html.toLowerCase();
  const checks = [];
  const add = (id, label, status, detail, weight = 1, fix = '') => checks.push({ id, label, status, detail, weight, fix });

  const title = tag(html, /<title[^>]*>([\s\S]*?)<\/title>/i).trim();
  if (!title) add('title', '페이지 제목(title)', 'fail', 'index.html에 <title>이 없습니다.', 3, 'title 태그를 추가하세요');
  else if (title.length < 10) add('title', '페이지 제목(title)', 'warn', `제목이 ${title.length}자로 짧습니다. 10~60자를 권장합니다.`, 3);
  else if (title.length > 65) add('title', '페이지 제목(title)', 'warn', `제목이 ${title.length}자로 깁니다. 검색 결과에서 잘릴 수 있습니다.`, 3);
  else add('title', '페이지 제목(title)', 'pass', `${title.length}자 · ${title}`, 3);

  const desc = tag(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
    tag(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  if (!desc) add('desc', '메타 설명', 'fail', '검색 결과에 보일 설명(description)이 없습니다.', 3, 'meta description을 추가하세요');
  else if (desc.length < 50) add('desc', '메타 설명', 'warn', `${desc.length}자로 짧습니다. 50~160자를 권장합니다.`, 3);
  else if (desc.length > 165) add('desc', '메타 설명', 'warn', `${desc.length}자로 깁니다. 160자 이하를 권장합니다.`, 3);
  else add('desc', '메타 설명', 'pass', `${desc.length}자`, 3);

  const h1s = (html.match(/<h1[\s>]/gi) || []).length;
  if (h1s === 0) add('h1', 'H1 제목', 'fail', '페이지에 H1이 없습니다.', 2, '<h1> 제목을 넣으세요');
  else if (h1s > 1) add('h1', 'H1 제목', 'warn', `H1이 ${h1s}개입니다. 페이지당 1개를 권장합니다.`, 2);
  else add('h1', 'H1 제목', 'pass', 'H1이 1개 있습니다.', 2);

  const viewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  add('viewport', '모바일 뷰포트', viewport ? 'pass' : 'fail', viewport ? 'viewport 메타가 있습니다.' : 'viewport 메타가 없어 모바일에서 축소돼 보입니다.', 3, '<meta name="viewport" content="width=device-width, initial-scale=1">');

  const lang = /<html[^>]+lang=/i.test(html);
  add('lang', '문서 언어(lang)', lang ? 'pass' : 'warn', lang ? 'html lang이 지정되어 있습니다.' : 'html 태그에 lang이 없습니다.', 1);

  const charset = /<meta[^>]+charset/i.test(html);
  add('charset', '문자 인코딩', charset ? 'pass' : 'warn', charset ? 'charset이 지정되어 있습니다.' : 'utf-8 charset을 지정하세요.', 1);

  const ogTitle = /property=["']og:title["']/i.test(html);
  const ogImage = tag(html, /property=["']og:image["'][^>]+content=["']([^"']*)["']/i) ||
    tag(html, /content=["']([^"']*)["'][^>]+property=["']og:image["']/i);
  const ogDesc = /property=["']og:description["']/i.test(html);
  if (ogTitle && ogImage && ogDesc) add('og', 'SNS 공유 미리보기', 'pass', 'og:title·og:description·og:image가 모두 있습니다.', 2);
  else {
    const missing = [!ogTitle && 'og:title', !ogDesc && 'og:description', !ogImage && 'og:image'].filter(Boolean);
    add('og', 'SNS 공유 미리보기', ogTitle || ogImage ? 'warn' : 'fail', `빠진 항목: ${missing.join(', ')}`, 2, '공유 카드용 og 태그를 추가하세요');
  }

  const canonical = /rel=["']canonical["']/i.test(html);
  add('canonical', '표준 URL(canonical)', canonical ? 'pass' : 'warn', canonical ? 'canonical이 지정되어 있습니다.' : 'canonical 링크가 없습니다.', 1);

  const imgs = html.match(/<img\b[^>]*>/gi) || [];
  const noAlt = imgs.filter((t) => !/\balt\s*=/.test(t));
  if (!imgs.length) add('alt', '이미지 대체 텍스트', 'pass', '이미지가 없습니다.', 1);
  else if (noAlt.length) add('alt', '이미지 대체 텍스트', 'warn', `이미지 ${imgs.length}개 중 ${noAlt.length}개에 alt가 없습니다.`, 2, 'alt 속성을 채우세요');
  else add('alt', '이미지 대체 텍스트', 'pass', `이미지 ${imgs.length}개 모두 alt가 있습니다.`, 2);

  // 내부 링크 깨짐
  const set = new Set(paths.map((p) => p.toLowerCase()));
  const refs = [];
  const re = /(?:href|src)=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) refs.push(m[1]);
  const broken = [];
  for (const ref of refs) {
    if (/^(https?:)?\/\//i.test(ref) || ref.startsWith('#') || ref.startsWith('mailto:') || ref.startsWith('tel:') || ref.startsWith('data:')) continue;
    let p = ref.split('?')[0].split('#')[0].replace(/^\//, '');
    if (!p) p = 'index.html';
    if (p.endsWith('/')) p += 'index.html';
    const lc = p.toLowerCase();
    if (set.has(lc) || set.has(lc + '.html') || set.has(lc + '/index.html') || set.has(lc.replace(/\/$/, '') + '/index.html')) continue;
    if (/\.(html?|css|js|png|jpe?g|svg|webp|ico|woff2?)$/i.test(p)) broken.push(ref);
  }
  add('links', '내부 링크', broken.length ? 'fail' : 'pass',
    broken.length ? `깨진 참조 ${broken.length}개: ${broken.slice(0, 4).join(', ')}` : '깨진 내부 참조가 없습니다.', 2);

  const robots = files['robots.txt'] || '';
  add('robots', 'robots.txt', robots ? 'pass' : 'warn', robots ? 'robots.txt가 있습니다.' : 'robots.txt가 없습니다. 검색 로봇 안내를 추가하세요.', 1);

  const sitemap = files['sitemap.xml'] || '';
  add('sitemap', 'sitemap.xml', sitemap ? 'pass' : 'warn', sitemap ? 'sitemap.xml이 있습니다.' : 'sitemap.xml이 없습니다.', 1);

  const favicon = paths.some((p) => /favicon|apple-touch-icon/i.test(p)) || /rel=["'](?:shortcut )?icon["']/i.test(html);
  add('favicon', '파비콘', favicon ? 'pass' : 'warn', favicon ? '파비콘이 있습니다.' : '파비콘이 없습니다.', 1);

  const jsonld = /application\/ld\+json/i.test(html);
  add('jsonld', '구조화 데이터', jsonld ? 'pass' : 'warn', jsonld ? 'JSON-LD 구조화 데이터가 있습니다.' : 'JSON-LD가 없습니다. 검색 결과에 풍부하게 보일 수 있습니다.', 1);

  const words = stripTags(html).split(/\s+/).filter(Boolean).length;
  if (words < 120) add('content', '본문 분량', 'warn', `본문이 약 ${words}단어입니다. 검색 노출에는 300단어 이상이 유리합니다.`, 1);
  else add('content', '본문 분량', 'pass', `약 ${words}단어`, 1);

  const size = new Blob([html]).size;
  const totalSize = Object.values(files).reduce((n, t) => n + new Blob([t]).size, 0);
  add('weight', '페이지 용량', totalSize > 3 * 1024 * 1024 ? 'warn' : 'pass',
    `HTML ${(size / 1024).toFixed(1)}KB · 전체 텍스트 ${(totalSize / 1024).toFixed(0)}KB`, 1);

  const fixedWidth = /width\s*:\s*(\d{4,})px/i.test(html);
  add('responsive', '반응형 레이아웃', fixedWidth ? 'warn' : 'pass', fixedWidth ? '고정 px 폭이 감지되었습니다. 모바일에서 넘칠 수 있습니다.' : '고정 폭 문제가 보이지 않습니다.', 1);

  const https = /^https:\/\//.test(baseUrl || '');
  add('https', 'HTTPS', https ? 'pass' : 'fail', https ? 'HTTPS로 제공됩니다.' : 'HTTPS가 아닙니다.', 2);

  const totalW = checks.reduce((n, c) => n + c.weight, 0);
  const earned = checks.reduce((n, c) => n + c.weight * (c.status === 'pass' ? 1 : c.status === 'warn' ? 0.5 : 0), 0);
  const score = Math.round((earned / totalW) * 100);

  let image = ogImage || '';
  if (image && !/^https?:/.test(image)) {
    try { image = new URL(image, baseUrl || 'https://example.com').href; } catch (e) { image = ''; }
  }
  const preview = {
    title: title || '(제목 없음)',
    description: desc || '(설명 없음)',
    url: (baseUrl || '').replace(/\/$/, '') + '/' + (siteSlug || ''),
    image
  };

  return { score, checks, preview, counts: {
    pass: checks.filter((c) => c.status === 'pass').length,
    warn: checks.filter((c) => c.status === 'warn').length,
    fail: checks.filter((c) => c.status === 'fail').length
  } };
}

/* ---------------------------------------------------------------- 생성기 */

export function robotsTxt(siteUrl, { disallow = false } = {}) {
  return `User-agent: *
${disallow ? 'Disallow: /' : 'Allow: /'}

Sitemap: ${siteUrl.replace(/\/$/, '')}/sitemap.xml
`;
}

export function sitemapXml(siteUrl, paths) {
  const base = siteUrl.replace(/\/$/, '');
  const today = new Date().toISOString().slice(0, 10);
  const urls = paths
    .filter((p) => /\.html?$/i.test(p) && !/^404\./i.test(p))
    .map((p) => {
      const loc = p === 'index.html' ? base + '/' : base + '/' + p.replace(/index\.html$/i, '');
      return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n  </url>`;
    });
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
}

const pageShell = (title, body, accent = '#f0a81e') => `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(title)}">
<meta name="theme-color" content="${esc(accent)}">
<style>
:root { color-scheme: light dark; --accent: ${esc(accent)}; }
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif;
  background: #fffdf9; color: #1c1a14; line-height: 1.75; font-size: 15px; -webkit-font-smoothing: antialiased; }
.wrap { max-width: 720px; margin: 0 auto; padding: 56px 22px 80px; }
h1 { font-size: 27px; letter-spacing: -0.02em; margin: 0 0 6px; }
.updated { color: #8b8474; font-size: 13px; margin: 0 0 28px; }
h2 { font-size: 16.5px; margin: 34px 0 8px; letter-spacing: -0.01em; }
p, li { color: #423d33; }
ul { padding-left: 20px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; margin: 10px 0; }
th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid #e8e2d4; vertical-align: top; }
th { color: #6b6455; font-weight: 600; font-size: 12.5px; }
a { color: #1c1a14; }
.note { background: #fdf6e3; border: 1px solid #f0e3c2; border-radius: 10px; padding: 12px 14px; font-size: 13px; color: #6b5a2c; margin: 22px 0; }
@media (prefers-color-scheme: dark) {
  body { background: #14120e; color: #f4efe3; }
  p, li { color: #cfc7b6; } th, td { border-color: #2b2620; }
  .note { background: #241f13; border-color: #3b3320; color: #e6d3a3; }
}
</style>
</head>
<body><div class="wrap">
${body}
</div></body></html>
`;

export function privacyPage({ siteName, operator, email, effectiveDate, collects, ads, analytics }) {
  const items = [];
  if (collects.includes('contact')) items.push(['문의 폼', '이름, 이메일, 문의 내용', '문의 처리 후 3년']);
  if (collects.includes('account')) items.push(['회원 정보', '아이디, 비밀번호(암호화), 이메일', '회원 탈퇴 시까지']);
  if (collects.includes('order')) items.push(['주문 정보', '이름, 연락처, 배송지, 결제 기록', '전자상거래법에 따른 5년']);
  if (analytics) items.push(['접속 기록', '방문 페이지, 브라우저 종류, 접속 시각(개인 식별 불가)', '3개월']);
  const table = items.length
    ? `<table><thead><tr><th>구분</th><th>수집 항목</th><th>보관 기간</th></tr></thead><tbody>
${items.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('\n')}
</tbody></table>`
    : '<p>별도의 개인정보를 직접 수집하지 않습니다.</p>';

  return pageShell(siteName + ' 개인정보 처리방침', `
<h1>개인정보 처리방침</h1>
<p class="updated">시행일 ${esc(effectiveDate)}</p>
<p>${esc(operator)}('${esc(siteName)}' 운영자, 이하 "운영자")는 이용자의 개인정보를 소중히 여기며, 「개인정보 보호법」 등 관련 법령에 따라 다음과 같이 개인정보를 처리합니다.</p>

<h2>1. 수집하는 개인정보 항목</h2>
${table}

<h2>2. 개인정보의 처리 목적</h2>
<p>문의 응대, 서비스 제공 및 운영, 이용자 문의에 대한 답변, 서비스 개선을 위한 통계 분석을 위해 개인정보를 처리합니다. 목적 외의 용도로 이용하지 않습니다.</p>

<h2>3. 보유 및 이용 기간</h2>
<p>수집한 개인정보는 위 표에 적힌 기간 동안 보관하며, 기간이 지나면 지체 없이 파기합니다. 이용자가 삭제를 요청하면 즉시 파기합니다. 관계 법령에 따라 보존할 의무가 있는 경우에는 해당 기간 동안 보관합니다.</p>

<h2>4. 개인정보의 제3자 제공</h2>
<p>이용자의 동의 없이 개인정보를 제3자에게 제공하지 않습니다. 다만 법령에 따라 요구되는 경우에는 예외로 합니다.</p>

<h2>5. 개인정보 처리의 위탁</h2>
<p>서비스 운영을 위해 호스팅(Cloudflare, GitHub Pages)과 로그인(Supabase) 서비스를 이용하며, 해당 서비스에는 개인정보가 최소한으로 저장됩니다.</p>

${ads ? `<h2>6. 광고 및 쿠키</h2>
<p>이 사이트는 Google AdSense 등 제3자 광고 서비스를 이용할 수 있습니다. 광고 사업자는 이용자의 관심에 기반한 광고를 제공하기 위해 쿠키를 사용할 수 있으며, 이용자는 <a href="https://adssettings.google.com" rel="noopener" target="_blank">Google 광고 설정</a>에서 맞춤 광고를 끌 수 있습니다.</p>` : `<h2>6. 쿠키의 사용</h2>
<p>이 사이트는 로그인 상태 유지 등 서비스 제공에 필요한 최소한의 쿠키만 사용합니다. 브라우저 설정에서 쿠키를 거부할 수 있으나, 일부 기능이 제한될 수 있습니다.</p>`}

<h2>7. 이용자의 권리</h2>
<p>이용자는 언제든지 자신의 개인정보를 조회, 수정, 삭제하거나 처리 정지를 요청할 수 있습니다. 아래 문의처로 연락하면 지체 없이 조치합니다.</p>

<h2>8. 개인정보의 안전성 확보 조치</h2>
<p>비밀번호를 암호화하여 보관하고, 개인정보에 접근할 수 있는 인원을 최소화하며, 전송 구간은 HTTPS로 보호합니다.</p>

<h2>9. 개인정보 보호 책임자 및 문의처</h2>
<p>운영자: ${esc(operator)}<br>이메일: <a href="mailto:${esc(email)}">${esc(email)}</a></p>

<h2>10. 고지의 의무</h2>
<p>이 방침의 내용이 변경되면 시행 7일 전부터 이 페이지에 게시합니다. 중요한 변경은 30일 전에 알립니다.</p>

<div class="note">이 문서는 Lamp가 작성한 초안입니다. 실제 서비스의 수집 항목과 보관 기간에 맞게 확인하고, 필요한 경우 법률 검토를 받으세요.</div>
`, '#f0a81e');
}

export function termsPage({ siteName, operator, email, effectiveDate, usesAccount, sellsGoods }) {
  return pageShell(siteName + ' 이용약관', `
<h1>이용약관</h1>
<p class="updated">시행일 ${esc(effectiveDate)}</p>

<h2>제1조 (목적)</h2>
<p>이 약관은 ${esc(operator)}가 운영하는 '${esc(siteName)}'(이하 "서비스")의 이용 조건과 절차, 운영자와 이용자의 권리와 의무를 정하는 것을 목적으로 합니다.</p>

<h2>제2조 (정의)</h2>
<p>"이용자"란 이 서비스에 접속하여 약관에 따라 서비스를 이용하는 사람을 말합니다.</p>

<h2>제3조 (약관의 효력과 변경)</h2>
<p>이 약관은 서비스 화면에 게시함으로써 효력이 발생합니다. 운영자는 필요한 경우 약관을 변경할 수 있으며, 변경된 약관은 시행 7일 전부터 공지합니다.</p>

<h2>제4조 (서비스의 제공)</h2>
<p>운영자는 다음과 같은 서비스를 제공합니다. 서비스 내용은 운영 상황에 따라 변경되거나 중단될 수 있습니다.</p>
<ul><li>정보 제공 및 콘텐츠 열람</li>${usesAccount ? '<li>회원 가입과 계정 기반 기능</li>' : ''}${sellsGoods ? '<li>상품·용역의 판매 및 결제</li>' : ''}<li>문의 접수와 답변</li></ul>

<h2>제5조 (이용자의 의무)</h2>
<p>이용자는 다음 행위를 하지 않습니다.</p>
<ul>
<li>타인의 정보를 도용하거나 허위 정보를 입력하는 행위</li>
<li>서비스의 운영을 방해하거나 서버에 과도한 부하를 주는 행위</li>
<li>법령 또는 공서양속에 반하는 내용을 게시하는 행위</li>
<li>운영자 또는 제3자의 지식재산권을 침해하는 행위</li>
</ul>

<h2>제6조 (지식재산권)</h2>
<p>서비스에 게시된 콘텐츠의 저작권은 운영자 또는 해당 권리자에게 있습니다. 이용자는 운영자의 사전 동의 없이 이를 복제, 배포, 상업적으로 이용할 수 없습니다.</p>

<h2>제7조 (책임의 제한)</h2>
<p>운영자는 천재지변, 통신 장애 등 불가항력으로 서비스를 제공하지 못한 경우 책임을 지지 않습니다. 이용자가 서비스를 이용하여 얻은 정보에 대한 판단과 그 결과는 이용자에게 있습니다.</p>

<h2>제8조 (분쟁의 해결)</h2>
<p>이 약관과 관련한 분쟁은 대한민국 법률을 적용하며, 관할 법원은 운영자의 소재지를 관할하는 법원으로 합니다.</p>

<h2>제9조 (문의)</h2>
<p>서비스 이용에 관한 문의는 <a href="mailto:${esc(email)}">${esc(email)}</a>로 보내 주세요.</p>

<div class="note">이 문서는 Lamp가 작성한 초안입니다. 실제 서비스 내용에 맞게 확인하고, 필요한 경우 법률 검토를 받으세요.</div>
`, '#2d5b8e');
}

export function adsTxt({ publisherId, custom }) {
  if (custom) return custom.trim() + '\n';
  const id = (publisherId || '').replace(/^pub-/, '').trim();
  if (!id) return '';
  return `google.com, pub-${id}, DIRECT, f08c47fec0942fa0\n`;
}

export function notFoundPage({ siteName, homeUrl, accent = '#f0a81e' }) {
  return pageShell(siteName + ' · 페이지를 찾을 수 없습니다', `
<div style="text-align:center;padding:40px 0">
  <p style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#8b8474;margin:0">404</p>
  <h1 style="font-size:30px;margin:10px 0 10px">페이지를 찾을 수 없습니다</h1>
  <p style="margin:0 0 26px">주소가 바뀌었거나 삭제된 페이지입니다. 아래 버튼으로 첫 화면에 돌아가세요.</p>
  <p><a href="${esc(homeUrl || '/')}" style="display:inline-block;background:${esc(accent)};color:#191405;text-decoration:none;
    padding:12px 22px;border-radius:12px;font-weight:600;font-size:14px">첫 화면으로</a></p>
</div>`, accent);
}
