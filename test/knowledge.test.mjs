import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createKnowledge, digest } from '../lib/knowledge.mjs';
import { execFileSync } from 'node:child_process';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'iho-knowledge-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const content = 'Verify a visible result after a user action.\n';
  const rules = [
    { id: 'behavior', title: '行为测试', ref: 'rule.md', status: 'accepted', projects: ['*'], sha256: digest(content) },
    { id: 'draft', title: '未确认经验', ref: 'rule.md', status: 'memory', projects: ['expense'], sha256: digest(content) },
  ];
  const catalog = JSON.stringify({ schemaVersion: 1, rules });
  await writeFile(join(root, 'rule.md'), content);
  await writeFile(join(root, 'catalog.json'), catalog);
  return { root, content, catalog };
}

test('local and OpenViking providers expose identical pinned rule contents', async t => {
  const f = await fixture(t);
  const requests = [];
  const remote = await createKnowledge({ type: 'openviking', baseUrl: 'https://knowledge.example/', rootUri: 'viking://resources/test-rules', tokenEnv: 'TEST_KEY' }, {
    env: { TEST_KEY: 'fake-test-key' },
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      const result = url.searchParams.get('uri').endsWith('catalog.json') ? f.catalog : f.content;
      return new Response(JSON.stringify({ status: 'ok', result }));
    },
  });
  const local = await createKnowledge({ type: 'local', root: f.root });
  assert.deepEqual(local.search({ project: 'otc' }), remote.search({ project: 'otc' }));
  assert.equal(local.search().length, 1, 'memory is not promoted into accepted rules');
  assert.equal((await remote.read('behavior')).content, (await local.read('behavior')).content);
  assert.equal(requests[0].init.headers.Authorization, 'Bearer fake-test-key');
  assert.equal(requests[0].url.pathname, '/api/v1/content/read');
  assert.equal(requests[0].url.searchParams.get('raw'), 'true');
});

test('content changes and catalog changes fail distinctly from missing documents', async t => {
  const f = await fixture(t);
  const source = await createKnowledge({ type: 'local', root: f.root });
  await writeFile(join(f.root, 'rule.md'), 'changed');
  await assert.rejects(source.read('behavior'), { code: 'VERSION_MISMATCH' });
  await assert.rejects(source.read('unknown'), { code: 'NOT_FOUND' });
  await assert.rejects(createKnowledge({ type: 'local', root: f.root, catalogSha256: '0'.repeat(64) }), { code: 'VERSION_MISMATCH' });
});

test('network failures do not become an empty successful search', async () => {
  await assert.rejects(createKnowledge({ type: 'openviking', baseUrl: 'https://knowledge.example', rootUri: 'viking://resources/rules' }, {
    fetchImpl: async () => { throw new Error('offline'); },
  }), { code: 'UNAVAILABLE' });
});

test('authentication denial and missing content are distinguishable', async () => {
  for (const [status, code] of [[403, 'ACCESS_DENIED'], [404, 'NOT_FOUND']]) {
    await assert.rejects(createKnowledge({ type: 'openviking', baseUrl: 'https://knowledge.example', rootUri: 'viking://resources/rules' }, {
      fetchImpl: async () => new Response('', { status }),
    }), { code });
  }
});

test('a catalog cannot read a document outside the local root', async t => {
  const f = await fixture(t);
  const nested = join(f.root, 'knowledge');
  await mkdir(nested);
  await writeFile(join(f.root, 'outside.md'), f.content);
  const catalog = JSON.parse(f.catalog);
  catalog.rules[0].ref = '../outside.md';
  await writeFile(join(nested, 'catalog.json'), JSON.stringify(catalog));
  const source = await createKnowledge({ type: 'local', root: nested });
  await assert.rejects(source.read('behavior'), { code: 'INVALID' });
});

test('Git provider reads the pinned revision even with local uncommitted edits', async t => {
  const f = await fixture(t);
  const git = args => execFileSync('git', ['-C', f.root, ...args], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git(['init']);
  git(['-c', 'core.autocrlf=false', 'add', '.']);
  git(['-c', 'user.name=Toolkit Tests', '-c', 'user.email=tests@example.invalid', 'commit', '-m', 'fixture']);
  const commit = git(['rev-parse', 'HEAD']);
  await writeFile(join(f.root, 'rule.md'), 'uncommitted rule change');
  const source = await createKnowledge({ type: 'git', root: f.root, commit });
  assert.equal((await source.read('behavior')).content, f.content);
  await assert.rejects(createKnowledge({ type: 'git', root: f.root, commit: '0'.repeat(40) }), { code: 'VERSION_MISMATCH' });
});
