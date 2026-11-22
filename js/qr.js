/* Lamp — QR 코드 생성기 (외부 라이브러리 없음, 바이트 모드 / ECC M / 버전 1~10) */

const EC_FORMAT_BITS_M = 0; // L=1, M=0, Q=3, H=2

const TABLE_M = {
  1: { ec: 10, blocks: [[1, 16]] },
  2: { ec: 16, blocks: [[1, 28]] },
  3: { ec: 26, blocks: [[1, 44]] },
  4: { ec: 18, blocks: [[2, 32]] },
  5: { ec: 24, blocks: [[2, 43]] },
  6: { ec: 16, blocks: [[4, 27]] },
  7: { ec: 18, blocks: [[4, 31]] },
  8: { ec: 22, blocks: [[2, 38], [2, 39]] },
  9: { ec: 22, blocks: [[3, 36], [2, 37]] },
  10: { ec: 26, blocks: [[4, 43], [1, 44]] }
};

const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };

/* ---------------------------------------------------------------- GF(256) */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

function rsGenerator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data, degree) {
  const gen = rsGenerator(degree);
  const res = new Array(data.length + degree).fill(0);
  for (let i = 0; i < data.length; i++) res[i] = data[i];
  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (coef === 0) continue;
    for (let j = 1; j < gen.length; j++) res[i + j] ^= gfMul(gen[j], coef);
  }
  return res.slice(data.length);
}

/* ---------------------------------------------------------------- 인코딩 */
function pickVersion(byteLen) {
  for (let v = 1; v <= 10; v++) {
    const t = TABLE_M[v];
    const dataCw = t.blocks.reduce((n, [cnt, len]) => n + cnt * len, 0);
    const countBits = v <= 9 ? 8 : 16;
    if (4 + countBits + byteLen * 8 <= dataCw * 8) return v;
  }
  throw new Error('QR 코드에 담기에는 내용이 너무 깁니다.');
}

function buildCodewords(data, version) {
  const t = TABLE_M[version];
  const dataCw = t.blocks.reduce((n, [cnt, len]) => n + cnt * len, 0);
  const countBits = version <= 9 ? 8 : 16;
  const bits = [];
  const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  push(0b0100, 4);
  push(data.length, countBits);
  for (const b of data) push(b, 8);
  const capacity = dataCw * 8;
  for (let i = 0; i < 4 && bits.length < capacity; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);
  const bytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    bytes.push(v);
  }
  const pad = [0xec, 0x11];
  let p = 0;
  while (bytes.length < dataCw) bytes.push(pad[p++ % 2]);

  const blocks = [];
  let offset = 0;
  for (const [cnt, len] of t.blocks) {
    for (let i = 0; i < cnt; i++) {
      const chunk = bytes.slice(offset, offset + len);
      offset += len;
      blocks.push({ data: chunk, ec: rsEncode(chunk, t.ec) });
    }
  }
  const maxLen = Math.max(...blocks.map((b) => b.data.length));
  const out = [];
  for (let i = 0; i < maxLen; i++) for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
  for (let i = 0; i < t.ec; i++) for (const b of blocks) out.push(b.ec[i]);
  return out;
}

/* ---------------------------------------------------------------- 행렬 */
const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x, y) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
];

function formatBits(mask) {
  const data = (EC_FORMAT_BITS_M << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function buildGrid(version, codewords, mask) {
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, v) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    modules[y][x] = v;
    fn[y][x] = true;
  };

  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }

  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(cx + dx, cy + dy, d !== 2 && d !== 4);
      }
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);

  const pos = ALIGN[version];
  const n = pos.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      const cx = pos[i], cy = pos[j];
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  // 포맷 정보 (모듈 예약 + 실제 값)
  const bits = formatBits(mask);
  const bit = (i) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) set(8, i, bit(i));
  set(8, 7, bit(6));
  set(8, 8, bit(7));
  set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
  set(8, size - 8, true);

  // 버전 정보
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const vbits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const b = ((vbits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const c = Math.floor(i / 3);
      set(a, c, b);
      set(c, a, b);
    }
  }

  // 데이터 배치
  let bitIndex = 0;
  const totalBits = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!fn[y][x] && bitIndex < totalBits) {
          modules[y][x] = ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) === 1;
          bitIndex++;
        }
      }
    }
  }

  // 마스크
  const f = MASKS[mask];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!fn[y][x] && f(x, y)) modules[y][x] = !modules[y][x];
    }
  }
  return { size, modules };
}

function penalty(grid) {
  const size = grid.length;
  let score = 0;

  const scanLine = (get) => {
    for (let a = 0; a < size; a++) {
      let run = 1;
      for (let b = 1; b < size; b++) {
        if (get(a, b) === get(a, b - 1)) run++;
        else { if (run >= 5) score += run - 2; run = 1; }
      }
      if (run >= 5) score += run - 2;
    }
  };
  scanLine((a, b) => grid[a][b]);
  scanLine((a, b) => grid[b][a]);

  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = grid[y][x];
      if (c === grid[y][x + 1] && c === grid[y + 1][x] && c === grid[y + 1][x + 1]) score += 3;
    }
  }

  const pat = [true, false, true, true, true, false, true, false, false, false, false];
  const hasPattern = (line, i) => {
    for (let k = 0; k < 11; k++) {
      const want = k < 7 ? pat[k] : false;
      if (line[i + k] !== want) return false;
    }
    return true;
  };
  for (let y = 0; y < size; y++) {
    const row = grid[y];
    for (let x = 0; x + 11 <= size; x++) if (hasPattern(row, x)) score += 40;
  }
  for (let x = 0; x < size; x++) {
    const col = grid.map((r) => r[x]);
    for (let y = 0; y + 11 <= size; y++) if (hasPattern(col, y)) score += 40;
  }

  let dark = 0;
  for (const row of grid) for (const v of row) if (v) dark++;
  const ratio = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(ratio - 50) / 5) * 10;
  return score;
}

export function qrMatrix(text) {
  const data = Array.from(new TextEncoder().encode(String(text)));
  const version = pickVersion(data.length);
  const codewords = buildCodewords(data, version);
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const g = buildGrid(version, codewords, mask);
    const p = penalty(g.modules);
    if (!best || p < best.p) best = { p, ...g, mask, version };
  }
  return best;
}

export function qrSvg(text, { size = 220, quiet = 4, dark = '#17150f', light = '#ffffff', radius = 0, title = 'QR 코드' } = {}) {
  const { modules, size: n } = qrMatrix(text);
  const total = n + quiet * 2;
  let rects = '';
  for (let y = 0; y < n; y++) {
    let start = -1;
    for (let x = 0; x <= n; x++) {
      const on = x < n && modules[y][x];
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        rects += `<rect x="${start + quiet}" y="${y + quiet}" width="${x - start}" height="1"/>`;
        start = -1;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${total} ${total}" role="img" aria-label="${title}" shape-rendering="crispEdges">
  <rect width="${total}" height="${total}" fill="${light}"${radius ? ` rx="${radius}"` : ''}/>
  <g fill="${dark}">${rects}</g>
</svg>`;
}

export function qrDataUrl(text, opts = {}) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(qrSvg(text, opts));
}
