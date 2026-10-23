import { readFile, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export class KnowledgeError extends Error {
  constructor(code, message) { super(message); this.name = 'KnowledgeError'; this.code = code; }
}
export const digest = text => createHash('sha256').update(text).digest('hex');
const fail = (code, message) => { throw new KnowledgeError(code, message); };

function validateCatalog(value) {
  if (value?.schemaVersion !== 1 || !Array.isArray(value.rules)) fail('INVALID', 'Expected rules catalog schemaVersion 1');
  const ids = new Set();
  for (const r of value.rules) {
    if (!r || typeof r.id !== 'string' || !r.id || ids.has(r.id) ||
        typeof r.title !== 'string' || typeof r.ref !== 'string' ||
        !['accepted', 'draft', 'memory'].includes(r.status) ||
        !Array.isArray(r.projects) || !r.projects.every(x => typeof x === 'string') ||
        !/^[a-f0-9]{64}$/.test(r.sha256 ?? '')) fail('INVALID', 'Invalid or duplicate rule entry');
    ids.add(r.id);
  }
  return value;
}

async function localReader(root) {
  let base;
  try { base = await realpath(root); } catch { fail('UNAVAILABLE', 'Knowledge directory is unavailable'); }
  return async ref => {
    if (typeof ref !== 'string' || isAbsolute(ref)) fail('INVALID', 'Local references must be relative');
    let target;
    try { target = await realpath(resolve(base, ref)); } catch (e) {
      fail(e.code === 'ENOENT' ? 'NOT_FOUND' : 'UNAVAILABLE', `Cannot read rule reference: ${ref}`);
    }
    const rel = relative(base, target);
    if (rel.startsWith('..') || isAbsolute(rel)) fail('INVALID', 'Rule reference escapes the knowledge directory');
    try { return await readFile(target, 'utf8'); } catch { fail('UNAVAILABLE', `Cannot read rule reference: ${ref}`); }
  };
}

function openVikingReader(config, { fetchImpl = fetch, env = process.env } = {}) {
  let base;
  try { base = new URL(config.baseUrl); } catch { fail('INVALID', 'OpenViking baseUrl is required'); }
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    fail('INVALID', 'Use an HTTP(S) base URL without embedded credentials, query or fragment');
  }
  if (!config.rootUri?.startsWith('viking://')) fail('INVALID', 'OpenViking rootUri is required');
  const root = config.rootUri.replace(/\/+$/, '') + '/';
  return async ref => {
    if (ref.startsWith('/') || ref.includes('://') || ref.split(/[\\/]/).some(p => p === '..') || /[?#%]/.test(ref)) {
      fail('INVALID', 'OpenViking references must be relative document paths');
    }
    const url = new URL('api/v1/content/read', base.href.replace(/\/?$/, '/'));
    url.searchParams.set('uri', root + ref);
    url.searchParams.set('raw', 'true');
    const headers = {};
    if (config.tokenEnv) {
      if (!env[config.tokenEnv]) fail('UNAVAILABLE', `Missing credential environment variable: ${config.tokenEnv}`);
      headers.Authorization = `Bearer ${env[config.tokenEnv]}`;
    }
    let response;
    try { response = await fetchImpl(url, { headers, redirect: 'error', signal: AbortSignal.timeout(config.timeoutMs ?? 10000) }); }
    catch { fail('UNAVAILABLE', 'OpenViking request failed or timed out'); }
    if (response.status === 404) fail('NOT_FOUND', `OpenViking document missing: ${ref}`);
    if (response.status === 401 || response.status === 403) fail('ACCESS_DENIED', 'OpenViking denied access');
    if (!response.ok) fail('UNAVAILABLE', `OpenViking HTTP status ${response.status}`);
    let body;
    try { body = await response.json(); } catch { fail('INVALID', 'OpenViking did not return JSON'); }
    if (body.status !== 'ok' || typeof body.result !== 'string') fail('INVALID', 'Unexpected OpenViking content response');
    return body.result;
  };
}

export async function createKnowledge(config, options = {}) {
  let readText;
  let revision;
  if (config.type === 'local' || config.type === 'git') {
    if (!config.root) fail('INVALID', 'Knowledge root is required');
    if (config.type === 'git') {
      if (!/^[a-f0-9]{40,64}$/.test(config.commit ?? '')) fail('INVALID', 'Pin the full Git commit');
      try { revision = execFileSync('git', ['-C', config.root, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
      catch { fail('UNAVAILABLE', 'Git checkout is unavailable'); }
      if (revision !== config.commit) fail('VERSION_MISMATCH', 'Knowledge checkout HEAD differs from pinned commit');
      const prefix = execFileSync('git', ['-C', config.root, 'rev-parse', '--show-prefix'], { encoding: 'utf8', windowsHide: true }).trim();
      readText = async ref => {
        if (isAbsolute(ref) || ref.includes('\\') || ref.split('/').some(p => p === '..')) fail('INVALID', 'Git references must stay within the knowledge directory');
        try {
          return execFileSync('git', ['-C', config.root, 'show', `${revision}:${prefix}${ref}`], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 4 * 1024 * 1024 });
        } catch { fail('NOT_FOUND', `Rule is absent from pinned Git revision: ${ref}`); }
      };
    }
    else readText = await localReader(config.root);
  } else if (config.type === 'openviking') readText = openVikingReader(config, options);
  else fail('INVALID', `Unknown knowledge provider: ${config.type}`);

  const catalogText = await readText(config.catalog ?? 'catalog.json');
  const catalogHash = digest(catalogText);
  if (config.catalogSha256 && config.catalogSha256 !== catalogHash) fail('VERSION_MISMATCH', 'Rules catalog changed');
  let catalog;
  try { catalog = JSON.parse(catalogText); } catch { fail('INVALID', 'Rules catalog is not JSON'); }
  validateCatalog(catalog);
  const source = config.type === 'openviking' ? config.rootUri : resolve(config.root);
  return {
    provenance: { provider: config.type, source, revision, catalogSha256: catalogHash },
    search({ query = '', project, status = 'accepted' } = {}) {
      const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
      return catalog.rules.filter(r => (!status || r.status === status) &&
        (!project || r.projects.includes('*') || r.projects.includes(project)) &&
        terms.every(t => `${r.id} ${r.title} ${(r.tags ?? []).join(' ')}`.toLocaleLowerCase().includes(t)));
    },
    async read(id) {
      const entry = catalog.rules.find(r => r.id === id);
      if (!entry) fail('NOT_FOUND', `Unknown rule id: ${id}`);
      const content = await readText(entry.ref);
      if (digest(content) !== entry.sha256) fail('VERSION_MISMATCH', `Rule content changed: ${id}`);
      return { ...entry, content, source, provider: config.type, catalogSha256: catalogHash };
    },
  };
}
