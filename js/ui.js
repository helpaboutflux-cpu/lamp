/* Lamp — UI 부품 (커스텀 셀렉트·컬러피커·차트·에디터) */

import { esc, clamp } from './util.js';
import { icon } from './icons.js';

/* ------------------------------------------------------------ 커스텀 셀렉트 */

export function selectHTML({ name, value = '', options = [], block = false, ariaLabel = '', size = '' }) {
  const cur = options.find((o) => String(o.value) === String(value)) || options[0];
  const opts = options.map((o) => `
    <button type="button" class="sel__opt" role="option" data-value="${esc(o.value)}"
      aria-selected="${String(o.value) === String(cur ? cur.value : '')}">
      <span>${esc(o.label)}</span>${o.note ? `<small>${esc(o.note)}</small>` : ''}
    </button>`).join('');
  return `<div class="sel ${block ? 'sel--block' : ''}" data-sel="${esc(name)}" data-value="${esc(cur ? cur.value : '')}">
    <button type="button" class="sel__btn ${size === 'sm' ? 'btn--sm' : ''}" aria-haspopup="listbox" aria-expanded="false"
      aria-label="${esc(ariaLabel || name)}">
      <span class="sel__val">${esc(cur ? cur.label : '선택')}</span>
      ${icon('chevronDown', 15, 'sel__chev')}
    </button>
    <div class="sel__pop" role="listbox" hidden>${opts}</div>
  </div>`;
}

export function bindSelects(root, onChange) {
  root.querySelectorAll('[data-sel]').forEach((sel) => {
    if (sel.dataset.bound) return;
    sel.dataset.bound = '1';
    const btn = sel.querySelector('.sel__btn');
    const pop = sel.querySelector('.sel__pop');
    const valEl = sel.querySelector('.sel__val');

    const closeAll = (except) => {
      root.querySelectorAll('[data-sel]').forEach((s) => {
        if (s === except) return;
        s.querySelector('.sel__pop').hidden = true;
        s.querySelector('.sel__btn').setAttribute('aria-expanded', 'false');
      });
    };

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = pop.hidden;
      closeAll(sel);
      pop.hidden = !willOpen;
      btn.setAttribute('aria-expanded', String(willOpen));
    });

    pop.querySelectorAll('.sel__opt').forEach((opt) => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const value = opt.dataset.value;
        sel.dataset.value = value;
        valEl.textContent = opt.querySelector('span').textContent;
        pop.querySelectorAll('.sel__opt').forEach((o) => o.setAttribute('aria-selected', String(o === opt)));
        pop.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        if (onChange) onChange(sel.dataset.sel, value, sel);
      });
    });
  });
}

export function getSelectValue(root, name) {
  const el = root.querySelector(`[data-sel="${name}"]`);
  return el ? el.dataset.value : '';
}

export function setSelectValue(root, name, value) {
  const el = root.querySelector(`[data-sel="${name}"]`);
  if (!el) return;
  const opt = Array.from(el.querySelectorAll('.sel__opt')).find((o) => o.dataset.value === String(value));
  if (!opt) return;
  el.dataset.value = String(value);
  el.querySelector('.sel__val').textContent = opt.querySelector('span').textContent;
  el.querySelectorAll('.sel__opt').forEach((o) => o.setAttribute('aria-selected', String(o === opt)));
}

/* ------------------------------------------------------------ 컬러 피커 */

const PRESETS = ['#f0a81e', '#e05b3a', '#2f7a5f', '#2d5b8e', '#7c4dbe', '#17150f', '#8d8575', '#c9a227'];

export function colorPickerHTML({ name, value = '#f0a81e', label = '' } = {}) {
  return `<div class="cp" data-cp="${esc(name)}" data-value="${esc(value)}" style="--cp-color:${esc(value)}">
    <button type="button" class="cp__swatch" aria-label="${esc(label || '색상 선택')}" aria-expanded="false"></button>
    <div class="cp__pop" hidden>
      <div class="cp__sv" data-cp-sv><span class="cp__knob"></span></div>
      <div class="cp__hue" data-cp-hue><span class="cp__hue-knob"></span></div>
      <div class="cp__row">
        <input class="cp__hex" data-cp-hex value="${esc(value)}" spellcheck="false" aria-label="색상 코드">
        <button type="button" class="btn btn--sm" data-cp-done>적용</button>
      </div>
      <div class="cp__presets">
        ${PRESETS.map((c) => `<button type="button" class="cp__preset" data-cp-preset="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}
      </div>
    </div>
  </div>`;
}

let colorState = null;

function hexToHsv(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let hue = 0;
  if (d) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return { h: hue, s: max ? d / max : 0, v: max };
}

function hsvToHex(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    const val = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    return Math.round(val * 255).toString(16).padStart(2, '0');
  };
  return '#' + f(5) + f(3) + f(1);
}

function paintCp(cp) {
  const st = cp._st;
  const sv = cp.querySelector('.cp__sv');
  const knob = cp.querySelector('.cp__knob');
  const hueBar = cp.querySelector('.cp__hue');
  const hueKnob = cp.querySelector('.cp__hue-knob');
  sv.style.setProperty('--cp-hue', `hsl(${st.h} 100% 50%)`);
  knob.style.left = (st.s * 100) + '%';
  knob.style.top = ((1 - st.v) * 100) + '%';
  knob.style.background = hsvToHex(st.h, st.s, st.v);
  hueKnob.style.left = (st.h / 360 * 100) + '%';
  const hex = hsvToHex(st.h, st.s, st.v);
  cp.querySelector('[data-cp-hex]').value = hex;
  cp.dataset.value = hex;
  cp.style.setProperty('--cp-color', hex);
}

export function bindColorPickers(root, onChange) {
  root.querySelectorAll('[data-cp]').forEach((cp) => {
    if (cp.dataset.bound) return;
    cp.dataset.bound = '1';
    cp._st = hexToHsv(cp.dataset.value || '#f0a81e');
    paintCp(cp);
    const pop = cp.querySelector('.cp__pop');
    const swatch = cp.querySelector('.cp__swatch');

    swatch.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = pop.hidden;
      root.querySelectorAll('.cp__pop').forEach((p) => { p.hidden = true; });
      pop.hidden = !open;
      swatch.setAttribute('aria-expanded', String(open));
    });
    pop.addEventListener('click', (e) => e.stopPropagation());

    const dragSv = (e) => {
      const r = cp.querySelector('.cp__sv').getBoundingClientRect();
      cp._st.s = clamp((e.clientX - r.left) / r.width, 0, 1);
      cp._st.v = clamp(1 - (e.clientY - r.top) / r.height, 0, 1);
      paintCp(cp);
      if (onChange) onChange(cp.dataset.cp, cp.dataset.value);
    };
    cp.querySelector('.cp__sv').addEventListener('pointerdown', (e) => {
      e.target.setPointerCapture(e.pointerId);
      cp._dragSv = true;
      dragSv(e);
    });
    cp.querySelectorAll('.cp__sv').forEach((el) => {
      el.addEventListener('pointermove', (e) => { if (cp._dragSv) dragSv(e); });
      el.addEventListener('pointerup', () => { cp._dragSv = false; });
      el.addEventListener('pointercancel', () => { cp._dragSv = false; });
    });

    const dragHue = (e) => {
      const r = cp.querySelector('.cp__hue').getBoundingClientRect();
      cp._st.h = clamp((e.clientX - r.left) / r.width, 0, 0.999) * 360;
      paintCp(cp);
      if (onChange) onChange(cp.dataset.cp, cp.dataset.value);
    };
    const hueEl = cp.querySelector('.cp__hue');
    hueEl.addEventListener('pointerdown', (e) => { e.target.setPointerCapture(e.pointerId); cp._dragH = true; dragHue(e); });
    hueEl.addEventListener('pointermove', (e) => { if (cp._dragH) dragHue(e); });
    hueEl.addEventListener('pointerup', () => { cp._dragH = false; });
    hueEl.addEventListener('pointercancel', () => { cp._dragH = false; });

    cp.querySelector('[data-cp-hex]').addEventListener('input', (e) => {
      const v = e.target.value.trim();
      if (/^#?[0-9a-f]{6}$/i.test(v)) {
        const hex = v.startsWith('#') ? v : '#' + v;
        cp._st = hexToHsv(hex);
        paintCp(cp);
        if (onChange) onChange(cp.dataset.cp, cp.dataset.value);
      }
    });
    cp.querySelectorAll('[data-cp-preset]').forEach((b) => {
      b.addEventListener('click', () => {
        cp._st = hexToHsv(b.dataset.cpPreset);
        paintCp(cp);
        if (onChange) onChange(cp.dataset.cp, cp.dataset.value);
      });
    });
    cp.querySelector('[data-cp-done]').addEventListener('click', () => { pop.hidden = true; swatch.setAttribute('aria-expanded', 'false'); });
  });
}

export function getColor(root, name) {
  const cp = root.querySelector(`[data-cp="${name}"]`);
  return cp ? cp.dataset.value : '';
}

/* ------------------------------------------------------------ 차트 */

let chartSeq = 0;

export function areaChart(points, { height = 132, labelEvery = 1 } = {}) {
  const w = 560;
  const h = height;
  const pad = { t: 8, r: 8, b: 20, l: 8 };
  const max = Math.max(1, ...points.map((p) => p.value));
  const stepX = (w - pad.l - pad.r) / Math.max(1, points.length - 1);
  const y = (v) => pad.t + (1 - v / max) * (h - pad.t - pad.b);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(pad.l + i * stepX).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${path} L${(pad.l + (points.length - 1) * stepX).toFixed(1)},${h - pad.b} L${pad.l},${h - pad.b} Z`;
  const id = 'lampArea' + (++chartSeq);
  const grid = [0, 0.5, 1].map((f) => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${(pad.t + f * (h - pad.t - pad.b)).toFixed(1)}" y2="${(pad.t + f * (h - pad.t - pad.b)).toFixed(1)}"/>`).join('');
  const dots = points.map((p, i) => `<circle class="chart__dot" cx="${(pad.l + i * stepX).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="2.6"/>`).join('');
  const labels = points.map((p, i) => (i % labelEvery === 0
    ? `<text class="chart__x" x="${(pad.l + i * stepX).toFixed(1)}" y="${h - 4}" text-anchor="middle">${esc(p.label)}</text>` : '')).join('');

  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="방문자 추이">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--brand)" stop-opacity=".34"/>
      <stop offset="100%" stop-color="var(--brand)" stop-opacity="0"/>
    </linearGradient></defs>
    <g class="chart__grid">${grid}</g>
    <path d="${area}" fill="url(#${id})"/>
    <path class="chart__line" d="${path}"/>
    ${dots}${labels}
  </svg>`;
}

export function ringHTML(score, { size = 148, label = '', color = '' } = {}) {
  const r = 62;
  const c = 2 * Math.PI * r;
  const dash = (clamp(score, 0, 100) / 100) * c;
  return `<div class="ring" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 148 148">
      <circle class="ring__track" cx="74" cy="74" r="${r}"/>
      <circle class="ring__bar" cx="74" cy="74" r="${r}" stroke="${color || 'var(--ok)'}"
        stroke-dasharray="${dash.toFixed(1)} ${(c - dash).toFixed(1)}"/>
    </svg>
    <div class="ring__mid"><div class="ring__score">${Math.round(score)}</div><div class="ring__of">/ 100</div></div>
  </div>`;
}

/* ------------------------------------------------------------ 코드 하이라이트 */

function escapeCode(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function highlight(code, lang) {
  const src = escapeCode(code);
  const L = lang || '';
  let out = '';
  if (L === 'html' || L === 'xml' || L === 'svg') {
    out = src
      .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="t-com">$1</span>')
      .replace(/(&lt;\/?)([a-zA-Z][\w:-]*)/g, '$1<span class="t-tag">$2</span>')
      .replace(/([\w-]+)=(&quot;[^&]*?&quot;)/g, '<span class="t-attr">$1</span>=<span class="t-str">$2</span>');
  } else if (L === 'css') {
    out = src
      .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="t-com">$1</span>')
      .replace(/([.#][\w-]+)/g, '<span class="t-tag">$1</span>')
      .replace(/([\w-]+)(\s*:)/g, '<span class="t-attr">$1</span>$2')
      .replace(/(#[0-9a-fA-F]{3,8}|\b\d+(\.\d+)?(px|rem|em|%|vh|vw|s|ms)?\b)/g, '<span class="t-num">$1</span>');
  } else if (L === 'js') {
    out = src
      .replace(/(\/\*[\s\S]*?\*\/|\/\/[^\n]*)/g, '<span class="t-com">$1</span>')
      .replace(/(&quot;[^&\n]*?&quot;|'[^'\n]*'|`[^`]*`)/g, '<span class="t-str">$1</span>')
      .replace(/\b(const|let|var|function|return|if|else|for|while|new|class|import|export|from|await|async|try|catch|throw|typeof|in|of|this|null|true|false|undefined)\b/g, '<span class="t-kw">$1</span>')
      .replace(/\b(\d+(\.\d+)?)\b/g, '<span class="t-num">$1</span>');
  } else if (L === 'md') {
    out = src.replace(/^(#{1,6} .*)$/gm, '<span class="t-tag">$1</span>').replace(/(\*\*[^*]+\*\*)/g, '<span class="t-attr">$1</span>');
  } else {
    out = src;
  }
  return out;
}

export function langOf(path) {
  const p = (path || '').toLowerCase();
  if (/\.html?$/.test(p)) return 'html';
  if (/\.css$/.test(p)) return 'css';
  if (/\.m?js$/.test(p)) return 'js';
  if (/\.json$/.test(p)) return 'js';
  if (/\.svg$/.test(p)) return 'svg';
  if (/\.md$/.test(p)) return 'md';
  return 'text';
}

/* ------------------------------------------------------------ 에디터 */

export function editorHTML(path, value) {
  return `<div class="editor" data-editor>
    <div class="editor__gutter" data-ed-gutter>1</div>
    <div class="editor__pane">
      <pre class="editor__hl" data-ed-hl aria-hidden="true"></pre>
      <textarea class="editor__area" data-ed-area spellcheck="false" wrap="off" aria-label="코드 편집기">${esc(value)}</textarea>
    </div>
  </div>`;
}

export function bindEditor(root, { onInput, onChange } = {}) {
  const wrap = root.querySelector('[data-editor]');
  if (!wrap) return null;
  const area = wrap.querySelector('[data-ed-area]');
  const hl = wrap.querySelector('[data-ed-hl]');
  const gutter = wrap.querySelector('[data-ed-gutter]');
  const path = wrap.dataset.path || '';

  const render = () => {
    const code = area.value;
    hl.innerHTML = highlight(code, langOf(path)) + '\n';
    const lines = code.split('\n').length;
    gutter.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
    hl.scrollTop = area.scrollTop;
    hl.scrollLeft = area.scrollLeft;
    gutter.scrollTop = area.scrollTop;
  };

  area.addEventListener('scroll', render);
  area.addEventListener('input', () => {
    render();
    if (onInput) onInput(area.value);
    if (onChange) onChange(area.value);
  });
  area.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const { selectionStart: s, selectionEnd: en, value } = area;
      area.value = value.slice(0, s) + '  ' + value.slice(en);
      area.selectionStart = area.selectionEnd = s + 2;
      render();
      if (onInput) onInput(area.value);
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      area.dispatchEvent(new CustomEvent('lamp:save', { bubbles: true }));
    }
  });
  render();
  return {
    area,
    render,
    setValue(v) { area.value = v; render(); },
    getValue() { return area.value; },
    setPath(p) { wrap.dataset.path = p; render(); }
  };
}

/* ------------------------------------------------------------ 기타 */

export function bindTabs(root, onSelect) {
  const tabs = root.querySelectorAll('[data-tab]');
  tabs.forEach((t) => {
    t.addEventListener('click', () => {
      tabs.forEach((x) => x.setAttribute('aria-selected', String(x === t)));
      root.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== t.dataset.tab; });
      if (onSelect) onSelect(t.dataset.tab);
    });
  });
  const active = Array.from(tabs).find((t) => t.getAttribute('aria-selected') === 'true') || tabs[0];
  if (active) {
    root.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== active.dataset.tab; });
  }
}

export function closeAllPops() {
  document.querySelectorAll('.sel__pop, .cp__pop').forEach((p) => { p.hidden = true; });
  document.querySelectorAll('.sel__btn, .cp__swatch').forEach((b) => b.setAttribute('aria-expanded', 'false'));
}
