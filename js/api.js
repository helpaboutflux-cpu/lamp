/* Lamp — 엔진 API 클라이언트 */

import { CONFIG } from './config.js';
import { accessToken } from './auth.js';

const BASE = CONFIG.edge.replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, code = 'error', status = 0, extra = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

let cachedConfig = null;

async function request(path, { method = 'GET', body, keepalive } = {}) {
  const headers = {};
  const token = await accessToken();
  if (token) headers.authorization = 'Bearer ' + token;
  if (body !== undefined) headers['content-type'] = 'application/json';

  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      keepalive
    });
  } catch (e) {
    throw new ApiError('엔진에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.', 'offline');
  }

  let data = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) data = await res.json().catch(() => null);
  else data = { raw: await res.text() };

  if (!res.ok) {
    const err = (data && data.error) || {};
    throw new ApiError(err.message || `요청이 실패했습니다 (HTTP ${res.status})`, err.code || 'http_' + res.status, res.status, err);
  }
  return data;
}

export async function engineConfig() {
  if (cachedConfig) return cachedConfig;
  cachedConfig = await request('/api/config');
  return cachedConfig;
}

export const api = {
  me: () => request('/api/me'),
  sites: () => request('/api/sites'),
  createSite: (slug, name) => request('/api/sites', { method: 'POST', body: { slug, name } }),
  site: (slug) => request('/api/sites/' + encodeURIComponent(slug)),
  deleteSite: (slug) => request('/api/sites/' + encodeURIComponent(slug), { method: 'DELETE' }),
  patchSite: (slug, patch) => request('/api/sites/' + encodeURIComponent(slug), { method: 'PATCH', body: patch }),
  deploy: (slug, files, opt = {}) => request('/api/sites/' + encodeURIComponent(slug) + '/deploy',
    { method: 'POST', body: { files, message: opt.message, preview: !!opt.preview } }),
  patchFiles: (slug, upsert, remove, message) => request('/api/sites/' + encodeURIComponent(slug) + '/patch',
    { method: 'POST', body: { upsert, remove, message } }),
  rollback: (slug, version) => request('/api/sites/' + encodeURIComponent(slug) + '/rollback', { method: 'POST', body: { version } }),
  files: (slug, version) => request('/api/sites/' + encodeURIComponent(slug) + '/files' + (version ? '?version=' + version : '')),
  file: (slug, path, version, binary) => request('/api/sites/' + encodeURIComponent(slug) + '/file?path=' +
    encodeURIComponent(path) + (version ? '&version=' + version : '') + (binary ? '&b64=1' : '')),
  analytics: (slug, days = 7) => request('/api/sites/' + encodeURIComponent(slug) + '/analytics?days=' + days),
  zipUrl: (slug, version) => BASE + '/api/sites/' + encodeURIComponent(slug) + '/zip/' + version,
  forms: (slug) => request('/api/sites/' + encodeURIComponent(slug) + '/forms'),
  createForm: (slug, form) => request('/api/sites/' + encodeURIComponent(slug) + '/forms', { method: 'POST', body: form }),
  submissions: (slug) => request('/api/sites/' + encodeURIComponent(slug) + '/submissions'),
  keys: () => request('/api/keys'),
  createKey: (label) => request('/api/keys', { method: 'POST', body: { label } }),
  deleteKey: (id) => request('/api/keys?id=' + encodeURIComponent(id), { method: 'DELETE' }),
  ghTree: (repo, branch, path) => request('/api/github/tree?repo=' + encodeURIComponent(repo) +
    '&branch=' + encodeURIComponent(branch || '') + '&path=' + encodeURIComponent(path || '')),
  ghFile: (repo, branch, path) => request('/api/github/file?repo=' + encodeURIComponent(repo) +
    '&branch=' + encodeURIComponent(branch || 'main') + '&path=' + encodeURIComponent(path))
};

export function edgeUrl(slug, path = '') {
  return BASE + '/' + slug + '/' + path;
}

export function baseUrl() { return BASE; }

export function formEndpoint(formId) { return BASE + '/f/' + formId; }

/** ZIP 내려받기는 인증 헤더가 필요하므로 fetch로 받아 저장한다. */
export async function downloadZip(slug, version) {
  const token = await accessToken();
  const res = await fetch(api.zipUrl(slug, version), { headers: { authorization: 'Bearer ' + token } });
  if (!res.ok) throw new ApiError('ZIP을 내려받지 못했습니다.', 'zip_failed', res.status);
  return await res.blob();
}
