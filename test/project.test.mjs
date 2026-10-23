import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializationPlan, applyInitialization, diagnose, loadProjectKnowledge } from '../lib/project.mjs';
import { checkNode, packageManager, runPackage } from '../lib/bootstrap.mjs';

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

test('initialization detects the existing package manager and preserves custom scripts', async t => {
  const root = await project(t);
  await writeFile(join(root, 'yarn.lock'), '# existing Yarn lock\n');
  const pkg = { name: 'sample-ui', dependencies: { vue: '3.5.13' }, scripts: { 'test:flows': 'vitest run --config custom.ts' } };
  await writeFile(join(root, 'package.json'), JSON.stringify(pkg));
  const plan = await initializationPlan(root);
  assert.equal(plan.packageManager, 'yarn');
  assert.equal(plan.scriptAdditions['test:flows'], undefined);
  await applyInitialization(plan, { install: false });
  assert.equal(JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).scripts['test:flows'], pkg.scripts['test:flows']);
  await writeFile(join(root, 'package-lock.json'), '{}');
  await assert.rejects(packageManager(root, pkg), /multiple lockfiles/);
});

test('unsupported runtime and non-Vue3 applications fail before modifying files', async t => {
  assert.throws(() => checkNode('20.19.0'), /incompatible/);
  assert.throws(() => checkNode('23.1.0'), /incompatible/);
  assert.doesNotThrow(() => checkNode('22.14.0'));
  const root = await project(t);
  await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { vue: '2.7.0' } }));
  await assert.rejects(initializationPlan(root), /Vue 3/);
  await assert.rejects(readFile(join(root, 'iho-test.config.json')), { code: 'ENOENT' });
});

test('test typechecking inherits existing module aliases', async t => {
  const root = await project(t);
  await writeFile(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { paths: { '@module/*': ['./src/module/*'] } } }));
  await applyInitialization(await initializationPlan(root), { install: false });
  const tsconfig = JSON.parse(await readFile(join(root, 'tsconfig.iho-tests.json'), 'utf8'));
  assert.equal(tsconfig.extends, './tsconfig.json');
  assert.equal(tsconfig.compilerOptions.paths, undefined, 'keep application paths inherited instead of replacing them');
});

test('an adopted project keeps its existing test framework instead of generating another', async t => {
  const root = await project(t);
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'sample-ui', dependencies: { vue: '3.5.13' },
    scripts: { 'test:behavior': 'vitest run tests/behavior', 'types:behavior': 'vue-tsc --noEmit -p tests.json' } }));
  const profile = { schemaVersion: 1, project: 'sample-ui', flowConfig: 'vitest.config.ts', flowDirectory: 'tests/behavior',
    knowledge: { type: 'local', root: 'tests/knowledge' }, scripts: { flows: 'test:behavior', types: 'types:behavior' } };
  await writeFile(join(root, 'iho-test.config.json'), JSON.stringify(profile));
  const plan = await initializationPlan(root);
  assert.equal(plan.mode, 'existing-environment');
  assert.deepEqual(plan.scriptAdditions, {});
  assert.ok(!plan.files.some(f => f.path === 'vitest.iho.config.ts'));
  await applyInitialization(plan, { install: false });
  await assert.rejects(readFile(join(root, 'vitest.iho.config.ts')), { code: 'ENOENT' });
  assert.deepEqual(JSON.parse(await readFile(join(root, 'iho-test.config.json'), 'utf8')), profile);
});

test('package scripts use the toolkit Node runtime', async t => {
  const root = await project(t);
  await writeFile(join(root, 'package.json'), JSON.stringify({ scripts: { 'runtime:check': 'node -p process.execPath' } }));
  const result = runPackage('npm', ['run', '--silent', 'runtime:check'], root, { capture: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim().toLowerCase(), process.execPath.toLowerCase());
});
