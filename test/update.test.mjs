import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, cp, rm, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { digest } from '../lib/knowledge.mjs';
import { planUpdate, applyUpdate } from '../lib/update.mjs';
import { planSkillInstallation, applySkillInstallation } from '../lib/skill-installation.mjs';
import { loadProjectKnowledge } from '../lib/project.mjs';

const toolkit = fileURLToPath(new URL('../', import.meta.url));
async function tree(root) {
  const files = {};
  async function walk(dir, prefix = '') {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const path = prefix + item.name;
      if (item.isDirectory()) await walk(join(dir, item.name), path + '/');
      else files[path] = await readFile(join(dir, item.name), 'utf8');
    }
  }
  await walk(root);
  return files;
}
async function fixture(t) {
  const container = await mkdtemp(join(tmpdir(), 'iho-update-'));
  t.after(() => rm(container, { recursive: true, force: true }));
  const root = join(container, 'application');
  const source = join(container, 'source');
  await mkdir(root);
  await mkdir(source);
  for (const folder of ['skills', 'scripts', 'bin', 'lib', 'knowledge', 'docs']) await cp(join(toolkit, folder), join(source, folder), { recursive: true });
  await cp(join(toolkit, 'package.json'), join(source, 'package.json'));
  const sourcePackage = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
  sourcePackage.version = '0.1.0';
  await writeFile(join(source, 'package.json'), JSON.stringify(sourcePackage));
  const catalog = JSON.parse(await readFile(join(source, 'knowledge/catalog.json'), 'utf8'));
  const oldRule = 'A synthetic previous accepted rule.\n';
  catalog.rules[0].version = '1';
  catalog.rules[0].sha256 = digest(oldRule);
  const catalogBody = JSON.stringify(catalog);
  await writeFile(join(source, 'knowledge/catalog.json'), catalogBody);
  await writeFile(join(source, 'knowledge/behavior-testing.md'), oldRule);
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'sample-ui', dependencies: { vue: '3.5.13' }, scripts: { 'custom:host': 'vitest run --config custom.ts' } }));
  await mkdir(join(root, 'tests/knowledge'), { recursive: true });
  await writeFile(join(root, 'tests/knowledge/catalog.json'), catalogBody);
  await writeFile(join(root, 'tests/knowledge/behavior-testing.md'), oldRule);
  await writeFile(join(root, 'vitest.iho.config.ts'), '// project-owned configuration\n');
  await mkdir(join(root, 'tests/support'), { recursive: true });
  await writeFile(join(root, 'tests/support/business-host.ts'), '// Project-specific host implementation\n');
  await writeFile(join(root, 'yarn.lock'), '# Project lockfile\n');
  const profile = { schemaVersion: 1, toolkitVersion: '0.1.0', project: 'sample-ui',
    scripts: { host: 'custom:host', types: 'custom:types', flows: 'custom:flows' },
    knowledge: { type: 'local', root: 'tests/knowledge', catalog: 'catalog.json', catalogSha256: digest(catalogBody) }, custom: { preserve: true } };
  await writeFile(join(root, 'iho-test.config.json'), JSON.stringify(profile));
  await writeFile(join(source, 'docs/retired-guide.md'), 'Previous upstream file\n');
  await applySkillInstallation(await planSkillInstallation(root, source));
  // Upstream changes after the old installation.
  sourcePackage.version = '0.2.0';
  await writeFile(join(source, 'package.json'), JSON.stringify(sourcePackage));
  await cp(join(toolkit, 'knowledge'), join(source, 'knowledge'), { recursive: true });
  await writeFile(join(source, 'docs/update-marker.md'), 'New upstream documentation.\n');
  await rm(join(source, 'docs/retired-guide.md'));
  return { root, source, oldRule, profile, container };
}

test('update preview is read-only; apply updates both skills and preserves project configuration', async t => {
  const { root, source, profile } = await fixture(t);
  const before = await tree(root);
  const plan = await planUpdate(root, { source });
  assert.equal(plan.summary.source.version, '0.2.0');
  assert.ok(plan.summary.changes.length > 0);
  assert.deepEqual(await tree(root), before);
  const result = await applyUpdate(plan);
  assert.equal(result.applied, true);
  assert.equal(result.validation, 'not-run');
  const after = await tree(root);
  for (const path of Object.keys(before).filter(p => !p.startsWith('.agents/skills/') && p !== 'iho-test.config.json')) assert.equal(after[path], before[path]);
  assert.deepEqual(JSON.parse(after['iho-test.config.json']), { ...profile, toolkitVersion: '0.2.0' });
  assert.equal(JSON.parse(after['iho-test.lock.json']).source.snapshotSha256, result.source.snapshotSha256);
  assert.ok(after['.agents/skills/iho-test-bootstrap/toolkit/docs/update-marker.md']);
  assert.equal(after['.agents/skills/iho-test-bootstrap/toolkit/docs/retired-guide.md'], undefined);
  const again = await planUpdate(root, { source });
  assert.deepEqual(again.summary.changes, []);
  await applyUpdate(again);
  assert.deepEqual(await tree(root), after);
});

test('rules can be upgraded after a separate tool update without losing the managed baseline', async t => {
  const { root, source, oldRule } = await fixture(t);
  await applyUpdate(await planUpdate(root, { source }));
  assert.equal((await (await loadProjectKnowledge(root)).knowledge.read('iho.behavior-testing')).content, oldRule);
  await applyUpdate(await planUpdate(root, { source, updateRules: true }));
  const rule = await (await loadProjectKnowledge(root)).knowledge.read('iho.behavior-testing');
  assert.equal(rule.version, '2');
  assert.notEqual(rule.content, oldRule);
  assert.deepEqual((await planUpdate(root, { source, updateRules: true })).summary.changes, []);
});

test('modified skills or rules block the whole update before any file is written', async t => {
  const { root, source } = await fixture(t);
  const skill = join(root, '.agents/skills/iho-behavior-testing/SKILL.md');
  const original = await readFile(skill, 'utf8');
  await writeFile(skill, 'Project customization');
  let before = await tree(root);
  await assert.rejects(planUpdate(root, { source, updateRules: true }), /Project-modified skill/);
  assert.deepEqual(await tree(root), before);
  await writeFile(skill, original);
  await writeFile(join(root, 'tests/knowledge/behavior-testing.md'), 'Project rule edits');
  before = await tree(root);
  await assert.rejects(planUpdate(root, { source, updateRules: true }), /managed baseline/);
  assert.deepEqual(await tree(root), before);
  await applyUpdate(await planUpdate(root, { source }));
  assert.equal(await readFile(join(root, 'tests/knowledge/behavior-testing.md'), 'utf8'), 'Project rule edits');
});

test('external knowledge is preserved without connecting and cannot be silently replaced', async t => {
  const { root, source, profile } = await fixture(t);
  profile.knowledge = { type: 'openviking', baseUrl: 'https://unreachable.invalid', tokenEnv: 'DO_NOT_READ', rootUri: 'viking://rules' };
  await writeFile(join(root, 'iho-test.config.json'), JSON.stringify(profile));
  const before = await tree(root);
  await assert.rejects(planUpdate(root, { source, updateRules: true }), /only upgrades the managed/);
  assert.deepEqual(await tree(root), before);
  await applyUpdate(await planUpdate(root, { source }));
  assert.deepEqual(JSON.parse(await readFile(join(root, 'iho-test.config.json'), 'utf8')).knowledge, profile.knowledge);
});

test('edits after preview are detected before applying the update', async t => {
  const { root, source } = await fixture(t);
  const plan = await planUpdate(root, { source });
  await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { vue: '3.5.13' }, scripts: { custom: 'changed' } }));
  const before = await tree(root);
  await assert.rejects(applyUpdate(plan), /changed after planning/);
  assert.deepEqual(await tree(root), before);
  const next = await planUpdate(root, { source });
  await writeFile(join(source, 'docs/update-marker.md'), 'Source changed after preview');
  await assert.rejects(applyUpdate(next), /changed after planning/);
  assert.deepEqual(await tree(root), before);
});

test('linked project knowledge is rejected without touching its target', async t => {
  const { root, source, container } = await fixture(t);
  const outside = join(container, 'external-knowledge');
  await cp(join(root, 'tests/knowledge'), outside, { recursive: true });
  await rm(join(root, 'tests/knowledge'), { recursive: true });
  await symlink(outside, join(root, 'tests/knowledge'), process.platform === 'win32' ? 'junction' : 'dir');
  const before = await tree(outside);
  await assert.rejects(planUpdate(root, { source, updateRules: true }), /linked project file/);
  assert.deepEqual(await tree(outside), before);
});

test('the bundled CLI updates from an explicit checkout without the original toolkit path', async t => {
  const { root, source } = await fixture(t);
  const entry = join(root, '.agents/skills/iho-test-bootstrap/scripts/run.mjs');
  const run = args => spawnSync(process.execPath, [entry, 'update', '--project', root, ...args], { encoding: 'utf8', windowsHide: true });
  const preview = run(['--source', source, '--update-rules']);
  assert.equal(preview.status, 0, preview.stdout + preview.stderr);
  assert.equal(JSON.parse(preview.stdout).applied, false);
  const applied = run(['--source', source, '--update-rules', '--apply']);
  assert.equal(applied.status, 0, applied.stdout + applied.stderr);
  assert.equal(JSON.parse(applied.stdout).applied, true);
  const missingSource = run([]);
  assert.notEqual(missingSource.status, 0);
  assert.match(missingSource.stdout, /--source PATH/);
});
