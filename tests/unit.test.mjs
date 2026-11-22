// Lamp 단위 테스트 — node --test tests/unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { qrMatrix, qrSvg } from '../js/qr.js';
import { analyzeSite, robotsTxt, sitemapXml, adsTxt, privacyPage, termsPage, notFoundPage } from '../js/seo.js';
import { TEMPLATES, templateById } from '../js/templates.js';

test('QR: 버전 선택과 크기', () => {
  const short = qrMatrix('https://a.co');
  assert.equal(short.version, 1);
  assert.equal(short.size, 21);
  const long = qrMatrix('https://example.com/' + 'x'.repeat(120));
  assert.ok(long.version >= 5);
  assert.equal(long.size, long.version * 4 + 17);
});

test('QR: 파인더 패턴과 타이밍 패턴', () => {
  const m = qrMatrix('https://lamp-edge.helpaboutflux.workers.dev/test/');
  const g = m.modules;
  // 좌상단 파인더 7x7
  assert.equal(g[0][0], true);
  assert.equal(g[1][1], false);
  assert.equal(g[2][2], true);
  assert.equal(g[3][3], true);
  // 타이밍 패턴: 6행이 번갈아
  for (let x = 8; x < m.size - 8; x++) assert.equal(g[8][6] === undefined ? null : g[6][x], x % 2 === 0);
});

test('QR: 같은 입력은 같은 결과', () => {
  const a = qrMatrix('lamp');
  const b = qrMatrix('lamp');
  assert.deepEqual(a.modules, b.modules);
});

test('QR: SVG 출력', () => {
  const svg = qrSvg('https://example.com', { size: 240 });
  assert.match(svg, /^<svg[^>]+width="240"/);
  assert.match(svg, /<rect/);
  assert.ok(!svg.includes('NaN'));
});

test('QR: 너무 긴 입력은 오류', () => {
  assert.throws(() => qrMatrix('x'.repeat(400)), /너무 깁니다/);
});

const goodHtml = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>좋은 페이지 제목입니다 - 사이트</title>
<meta name="description" content="이 페이지는 검색과 공유를 충분히 고려한 예시 설명을 담고 있습니다. 길이도 적당합니다.">
<meta property="og:title" content="제목"><meta property="og:description" content="설명"><meta property="og:image" content="/og.png">
<link rel="canonical" href="https://ex.com/"><link rel="icon" href="/favicon.svg">
</head><body><h1>제목</h1><img src="a.png" alt="그림"><a href="/about/">소개</a>
<script type="application/ld+json">{"@type":"WebSite"}</script>
<p>${'본문 내용입니다. '.repeat(60)}</p></body></html>`;

test('SEO: 좋은 페이지는 높은 점수', () => {
  const files = { 'index.html': goodHtml, 'about/index.html': goodHtml, 'a.png': '', 'favicon.svg': '<svg/>', 'og.png': '', 'robots.txt': 'User-agent: *', 'sitemap.xml': '<urlset/>' };
  const r = analyzeSite({ files, baseUrl: 'https://ex.com/test/', siteSlug: 'test' });
  assert.ok(r.score >= 85, 'score=' + r.score);
  assert.equal(r.counts.fail, 0);
});

test('SEO: 빈 HTML은 실패 항목이 나온다', () => {
  const r = analyzeSite({ files: { 'index.html': '<html><body><p>hi</p></body></html>' }, baseUrl: 'https://ex.com/' });
  assert.ok(r.score < 60);
  assert.ok(r.checks.some((c) => c.id === 'title' && c.status === 'fail'));
  assert.ok(r.checks.some((c) => c.id === 'desc' && c.status === 'fail'));
});

test('SEO: 깨진 내부 링크 탐지', () => {
  const html = goodHtml.replace('</body>', '<a href="/missing.html">없음</a></body>');
  const r = analyzeSite({ files: { 'index.html': html }, baseUrl: 'https://ex.com/' });
  const linkCheck = r.checks.find((c) => c.id === 'links');
  assert.equal(linkCheck.status, 'fail');
});

test('생성기: robots / sitemap / ads.txt', () => {
  assert.match(robotsTxt('https://ex.com/'), /Sitemap: https:\/\/ex\.com\/sitemap\.xml/);
  const sm = sitemapXml('https://ex.com/', ['index.html', 'about.html', '404.html']);
  assert.match(sm, /<loc>https:\/\/ex\.com\/<\/loc>/);
  assert.match(sm, /<loc>https:\/\/ex\.com\/about.html<\/loc>/);
  assert.ok(!sm.includes('404.html'));
  assert.equal(adsTxt({ publisherId: 'pub-123' }), 'google.com, pub-123, DIRECT, f08c47fec0942fa0\n');
  assert.equal(adsTxt({ publisherId: '' }), '');
});

test('생성기: 개인정보 처리방침·이용약관·404', () => {
  const p = privacyPage({ siteName: '테스트', operator: '운영자', email: 'a@b.co', effectiveDate: '2026-11-22', collects: ['contact'], analytics: true, ads: true });
  assert.match(p, /개인정보 처리방침/);
  assert.match(p, /a@b\.co/);
  assert.match(p, /AdSense/);
  assert.ok(!p.includes('undefined'));
  const t = termsPage({ siteName: '테스트', operator: '운영자', email: 'a@b.co', effectiveDate: '2026-11-22', usesAccount: true, sellsGoods: false });
  assert.match(t, /이용약관/);
  const nf = notFoundPage({ siteName: '테스트', homeUrl: '/test/' });
  assert.match(nf, /페이지를 찾을 수 없습니다/);
});

test('템플릿: 4종 모두 index.html 포함', () => {
  assert.ok(TEMPLATES.length >= 4);
  for (const t of TEMPLATES) {
    const files = t.files();
    assert.ok(files['index.html'], t.id);
    assert.match(files['index.html'], /<html lang="ko">/);
    assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(files['index.html']), '이모지 없음: ' + t.id);
  }
  assert.equal(templateById('nope').id, TEMPLATES[0].id);
});
