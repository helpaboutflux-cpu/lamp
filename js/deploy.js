/* Lamp — 배포 도우미 (드래그·ZIP·GitHub·템플릿) */

import { $, $$, esc, note, fmtBytes, readZip, readDataTransfer, fileToPayload, isTextPath } from './util.js';
import { icon } from './icons.js';
import { api } from './api.js';
import { inlineNote, errorBox } from './core.js';
import { TEMPLATES } from './templates.js';

const MAX = 10 * 1024 * 1024;

export function deployPanelHTML() {
  return `<div class="drop" data-drop tabindex="0" role="button" aria-label="사이트 파일 끌어다 놓기">
      <div class="drop__ico">${icon('uploadCloud', 22)}</div>
      <div class="drop__t">사이트 폴더를 여기로 끌어다 놓으세요</div>
      <div class="drop__s">또는 눌러서 파일 선택 · HTML 한 장도 됩니다 · 최대 10MB</div>
    </div>
    <input type="file" hidden multiple data-file-input>
    <input type="file" hidden webkitdirectory directory multiple data-dir-input>
    <div class="row mt-8">
      <button class="btn btn--sm" data-act="pick-files">${icon('file', 14)}<span>파일 선택</span></button>
      <button class="btn btn--sm" data-act="pick-dir">${icon('folder', 14)}<span>폴더 선택</span></button>
      <button class="btn btn--sm" data-act="pick-zip">${icon('download', 14)}<span>ZIP</span></button>
      <button class="btn btn--sm" data-act="open-github">${icon('github', 14)}<span>GitHub</span></button>
      <button class="btn btn--sm" data-act="open-templates">${icon('layers', 14)}<span>템플릿</span></button>
      <span class="spacer"></span>
      <label class="switch" title="배포하되 사이트는 바꾸지 않습니다">
        <input type="checkbox" data-preview-flag>
        <span class="switch__track"></span>
        <span class="switch__label">미리보기 배포</span>
      </label>
    </div>
    <div data-panel-host class="mt-8"></div>`;
}

export function mountDeployPanel(root, { slug, onDone, openTab }) {
  const host = root.querySelector('[data-panel-host]');
  const drop = root.querySelector('[data-drop]');
  const fileInput = root.querySelector('[data-file-input]');
  const dirInput = root.querySelector('[data-dir-input]');
  const previewFlag = root.querySelector('[data-preview-flag]');
  let busy = false;

  const status = (html) => { if (host) host.innerHTML = html; };

  const handlePayloads = async (payloads, label) => {
    if (!payloads.length) return;
    const total = payloads.reduce((n, f) => n + (f.text ? new Blob([f.text]).size : Math.ceil((f.base64 || '').length * 0.75)), 0);
    status(`<div class="note note--info">${icon('clock', 16)}<div class="note__body"><b>${esc(label)} · ${payloads.length}개 파일 · ${fmtBytes(total)}</b>
      배포 준비 중입니다. 잠시만 기다려 주세요.</div></div>`);
    if (total > MAX) {
      status(errorBox({ message: '사이트 용량은 10MB까지입니다. 지금 선택한 파일은 ' + fmtBytes(total) + '입니다.' }, '용량 초과'));
      return;
    }
    await runDeploy(payloads, label);
  };

  const runDeploy = async (payloads, label) => {
    if (busy) return;
    busy = true;
    try {
      const res = await api.deploy(slug, payloads, { preview: previewFlag && previewFlag.checked, message: label });
      const d = res.deploy;
      const s = res.version;
      status(`<div class="note note--ok">${icon('check', 16)}<div class="note__body">
        <b>${esc(d.preview ? '미리보기 배포 완료' : '배포 완료')} · v${d.v} · ${d.files}개 파일 · ${fmtBytes(d.bytes)}</b>
        ${d.preview
          ? `<div class="mt-8"><a class="link" href="${esc(s.previewUrl)}" target="_blank" rel="noopener">미리보기 열기 ${icon('external', 12)}</a></div>`
          : `<div class="mt-8 row"><a class="link" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a>
             <button class="btn btn--sm" data-act="copy" data-value="${esc(s.url)}">${icon('copy', 14)}<span>주소 복사</span></button></div>`}
        </div></div>`);
      note('ok', d.preview ? 'v' + d.v + ' 미리보기로 배포했습니다.' : 'v' + d.v + ' 배포 완료');
      if (onDone) onDone(res);
    } catch (e) {
      status(errorBox(e, e.code === 'blocked_scan' ? '배포가 차단되었습니다' : '배포하지 못했습니다'));
    } finally {
      busy = false;
    }
  };

  const fromFiles = async (files) => {
    const payloads = [];
    for (const f of files) {
      if (/\.zip$/i.test(f.path || f.name || '')) {
        const buf = await f.file.arrayBuffer();
        const unzipped = await readZip(buf);
        payloads.push(...unzipped.map((x) => ({ path: x.path, text: x.text, base64: x.base64, type: x.type })));
      } else {
        payloads.push(await fileToPayload(f.file, f.path));
      }
    }
    return payloads;
  };

  const onDrop = async (e) => {
    e.preventDefault();
    drop.classList.remove('drop--hot');
    try {
      const files = await readDataTransfer(e.dataTransfer);
      await handlePayloads(await fromFiles(files), '끌어다 놓은 파일');
    } catch (err) { status(errorBox(err, '파일을 읽지 못했습니다')); }
  };

  if (drop) {
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('drop--hot'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('drop--hot')));
    drop.addEventListener('drop', onDrop);
    drop.addEventListener('click', () => fileInput.click());
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
  }

  fileInput.addEventListener('change', async () => {
    const list = Array.from(fileInput.files || []).map((f) => ({ path: f.name, file: f }));
    fileInput.value = '';
    if (list.length) await handlePayloads(await fromFiles(list), '선택한 파일');
  });
  dirInput.addEventListener('change', async () => {
    const list = Array.from(dirInput.files || []).map((f) => ({ path: f.webkitRelativePath || f.name, file: f }));
    dirInput.value = '';
    if (!list.length) return;
    const first = list[0].path.split('/')[0];
    if (list.every((f) => f.path.startsWith(first + '/'))) list.forEach((f) => { f.path = f.path.slice(first.length + 1); });
    await handlePayloads(await fromFiles(list), '선택한 폴더');
  });

  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'pick-files') fileInput.click();
    if (act === 'pick-dir') dirInput.click();
    if (act === 'pick-zip') {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.zip';
      inp.onchange = async () => {
        const f = inp.files[0];
        if (!f) return;
        status(`<div class="note note--info">${icon('clock', 16)}<div class="note__body">ZIP 압축을 푸는 중입니다.</div></div>`);
        try {
          const files = await readZip(await f.arrayBuffer());
          await handlePayloads(files, f.name);
        } catch (err) {
          status(errorBox(err, 'ZIP을 읽지 못했습니다'));
        }
      };
      inp.click();
    }
    if (act === 'open-github') showGithub();
    if (act === 'open-templates') showTemplates();
    if (act === 'gh-load') await loadGithub();
    if (act === 'gh-deploy') await githubDeploy();
    if (act === 'tpl-use') await useTemplate(btn.dataset.id);
  });

  const showGithub = () => {
    status(`<div class="card card--flat" style="border:1px solid var(--line)">
      <div class="card__body stack">
        <div class="field"><label for="gh-repo">GitHub 저장소</label>
          <div class="row row--tight">
            <input class="input input--mono" id="gh-repo" placeholder="owner/repository" style="flex:1;min-width:180px" data-gh-repo>
            <input class="input input--mono" id="gh-branch" placeholder="브랜치 (기본 main)" style="width:150px" data-gh-branch>
            <button class="btn" data-act="gh-load">${icon('search', 15)}<span>불러오기</span></button>
          </div>
          <span class="hint">공개 저장소를 그대로 배포합니다. 비공개 저장소는 지원 예정입니다.</span>
        </div>
        <div data-gh-list></div>
      </div></div>`);
  };

  const loadGithub = async () => {
    const repo = (root.querySelector('[data-gh-repo]') || {}).value || '';
    const branch = (root.querySelector('[data-gh-branch]') || {}).value || '';
    const listEl = root.querySelector('[data-gh-list]');
    if (!repo.trim()) { note('warn', '저장소 주소를 입력해 주세요.'); return; }
    listEl.innerHTML = `<div class="note note--info">${icon('clock', 16)}<div class="note__body">저장소 파일 목록을 가져오는 중입니다.</div></div>`;
    try {
      const res = await api.ghTree(repo.trim(), branch.trim());
      const files = res.files.slice(0, 120);
      const total = files.reduce((n, f) => n + f.size, 0);
      listEl.innerHTML = `<div class="note note--ok">${icon('check', 16)}<div class="note__body">
        <b>${esc(res.repo)} · ${esc(res.branch)}</b>${files.length}개 파일 · ${fmtBytes(total)}${res.files.length > 120 ? ' (앞 120개만)' : ''}
        </div></div>
        <div class="row mt-8"><button class="btn btn--brand" data-act="gh-deploy">${icon('rocket', 15)}<span>저장소 배포</span></button></div>
        <div class="code mt-8">${files.slice(0, 14).map((f) => esc(f.path)).join('\n')}${files.length > 14 ? '\n...' : ''}</div>`;
      root._gh = { repo: res.repo, branch: res.branch, files };
    } catch (e) {
      listEl.innerHTML = errorBox(e, '저장소를 읽지 못했습니다');
    }
  };

  const githubDeploy = async () => {
    const gh = root._gh;
    if (!gh) return;
    if (gh.files.length > 60) { note('warn', '한 번에 60개 파일까지 가져옵니다. 저장소 루트에 index.html이 있는지 확인해 주세요.'); }
    status(`<div class="note note--info">${icon('clock', 16)}<div class="note__body">저장소에서 파일을 가져오는 중입니다. (${gh.files.length}개)</div></div>`);
    try {
      const payloads = [];
      for (const f of gh.files.slice(0, 60)) {
        const res = await api.ghFile(gh.repo, gh.branch, f.path);
        payloads.push({ path: f.path, base64: res.base64, type: res.type });
      }
      await handlePayloads(payloads, 'GitHub · ' + gh.repo);
    } catch (e) {
      status(errorBox(e, '파일을 가져오지 못했습니다'));
    }
  };

  const showTemplates = () => {
    status(`<div class="grid grid--2">${TEMPLATES.map((t) => `
      <div class="card card--flat" style="border:1px solid var(--line)">
        <div class="card__body">
          <div class="row row--tight" style="gap:8px">${icon(t.icon, 16)}<b style="font-size:13.5px">${esc(t.name)}</b></div>
          <div class="small dim" style="margin:4px 0 10px">${esc(t.note)}</div>
          <button class="btn btn--sm" data-act="tpl-use" data-id="${t.id}">이 템플릿으로 배포</button>
        </div>
      </div>`).join('')}</div>`);
  };

  const useTemplate = async (id) => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    const files = t.files();
    const payloads = Object.entries(files).map(([path, text]) => ({ path, text, type: path.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8' }));
    await handlePayloads(payloads, '템플릿 · ' + t.name);
  };
}

/* ---------------------------------------------------------------- IDE 미리보기 */

export function buildPreviewDoc(files, entry = 'index.html') {
  const urls = new Map();
  for (const [path, f] of files) {
    if (f.text === undefined) continue;
    if (/\.css$/i.test(path)) urls.set(path, URL.createObjectURL(new Blob([f.text], { type: 'text/css' })));
    else if (/\.m?js$/i.test(path)) urls.set(path, URL.createObjectURL(new Blob([f.text], { type: 'text/javascript' })));
    else if (/\.svg$/i.test(path)) urls.set(path, URL.createObjectURL(new Blob([f.text], { type: 'image/svg+xml' })));
    else if (/\.json$/i.test(path)) urls.set(path, URL.createObjectURL(new Blob([f.text], { type: 'application/json' })));
  }
  let doc = files.get(entry) && files.get(entry).text;
  if (!doc) {
    const first = [...files.keys()].find((p) => /\.html?$/i.test(p));
    doc = first ? files.get(first).text : '<!doctype html><meta charset="utf-8"><p style="font-family:sans-serif;padding:24px;color:#666">index.html이 없습니다.</p>';
  }
  doc = doc.replace(/(href|src)=["']([^"'#?]+)["']/g, (m, attr, url) => {
    const clean = url.replace(/^\.?\//, '');
    if (urls.has(clean)) return `${attr}="${urls.get(clean)}"`;
    if (!/^(https?:|data:|blob:|\/\/)/.test(url)) return `${attr}="about:blank"`;
    return m;
  });
  return doc;
}

export function revokePreview(urls) {
  (urls || []).forEach((u) => URL.revokeObjectURL(u));
}
