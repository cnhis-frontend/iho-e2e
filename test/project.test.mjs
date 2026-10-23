import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializationPlan, applyInitialization, diagnose, loadProjectKnowledge } from '../lib/project.mjs';

async function project(t) {
  const root = await mkdtemp(join(tmpdir(), 'iho-project-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'sample-ui', dependencies: { vue: '3.5.13' }, scripts: {} }));
  return root;
}

test('initialization is repeatable and preserves project-owned settings', async t => {
  const root = await project(t);
  await applyInitialization(await initializationPlan(root), { install: false });
  assert.ok((await initializationPlan(root)).files.every(f => f.action === 'unchanged'));
  const path = join(root, 'iho-test.config.json');
  const custom = JSON.parse(await readFile(path, 'utf8'));
  custom.scripts.flows = 'custom:flow';
  await writeFile(path, JSON.stringify(custom));
  const plan = await initializationPlan(root);
  assert.equal(plan.files.find(f => f.path === 'iho-test.config.json').action, 'preserve');
  await applyInitialization(plan, { install: false });
  assert.equal(JSON.parse(await readFile(path, 'utf8')).scripts.flows, 'custom:flow');
  const { knowledge } = await loadProjectKnowledge(root);
  assert.ok((await knowledge.read('iho.behavior-testing')).content.includes('真实'));
});

test('a scaffold without runnable project adapters fails diagnosis', async t => {
  const root = await project(t);
  await applyInitialization(await initializationPlan(root), { install: false });
  const report = await diagnose(root);
  assert.equal(report.ok, false);
  assert.equal(report.execution, 'not-run');
  assert.equal(report.checks.find(c => c.name === 'dependency:vitest').ok, false);
  assert.equal(report.checks.find(c => c.name === 'documentation').ok, false);
  assert.equal(report.checks.find(c => c.name === 'knowledge').ok, true);
});

test('initialization does not overwrite a rule customized before migration', async t => {
  const root = await project(t);
  await mkdir(join(root, 'tests/knowledge'), { recursive: true });
  await writeFile(join(root, 'tests/knowledge/behavior-testing.md'), 'project-specific rules');
  await applyInitialization(await initializationPlan(root), { install: false });
  const report = await diagnose(root);
  assert.equal(report.checks.find(c => c.name === 'knowledge').code, 'VERSION_MISMATCH');
  assert.equal(await readFile(join(root, 'tests/knowledge/behavior-testing.md'), 'utf8'), 'project-specific rules');
});
