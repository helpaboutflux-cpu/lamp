// QR 인코더 검증용 행렬 덤프: node tests/qr_dump.mjs > out.json
import { qrMatrix } from '../js/qr.js';

const cases = [
  'https://lamp-edge.helpaboutflux.workers.dev/my-site/',
  'https://example.com',
  'Lamp 배포 테스트 - 한글 주소도 담아 봅니다 https://lamp-edge.helpaboutflux.workers.dev/portfolio/?k=abc123',
  'https://lamp-edge.helpaboutflux.workers.dev/a-very-long-slug-name-for-testing-purposes-1234567890/',
  '안녕하세요',
  'x'.repeat(180)
];

const out = cases.map((t) => {
  const m = qrMatrix(t);
  return { text: t, version: m.version, mask: m.mask, size: m.size, grid: m.modules };
});
console.log(JSON.stringify(out));
