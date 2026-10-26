import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { verifyEnvironment } from '../lib/environment.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'iho-environment-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'tests/support'), { recursive: true });
  await writeFile(join(root, 'tests/support/project-helper.ts'), 'project-owned');
  return root;
}

test('successful temporary verification removes its files and leaves project support intact', async t => {
  const root = await fixture(t);
  const calls = [];
  const report = await verifyEnvironment(root, 'npm', { run: (manager, args, cwd) => {
    calls.push({ manager, args, cwd });
    return { status: 0 };
  } });
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.manager === 'npm' && call.args.includes('--offline')));
  assert.deepEqual(report.retained, []);
  assert.ok(report.removed.length > 0);
  assert.deepEqual(await readdir(join(root, 'tests')), ['support']);
  assert.equal(await readFile(join(root, 'tests/support/project-helper.ts'), 'utf8'), 'project-owned');
});

test('failed validation preserves diagnostics and does not proceed to the next check', async t => {
  const root = await fixture(t);
  let calls = 0;
  await assert.rejects(verifyEnvironment(root, 'npm', { run: () => { calls++; return { status: 1 }; } }), /diagnostic files retained/);
  assert.equal(calls, 1);
  const directory = (await readdir(join(root, 'tests'))).find(name => name.startsWith('.iho-env-'));
  assert.ok((await readFile(join(root, 'tests', directory, 'environment.test.ts'), 'utf8')).length > 0);
});

test('cleanup preserves files modified or added during validation', async t => {
  const root = await fixture(t);
  const report = await verifyEnvironment(root, 'pnpm', { run: (_manager, args) => {
    if (args.includes('vitest')) {
      const folder = join(root, dirname(args.at(-1)));
      writeFileSync(join(folder, 'Harness.vue'), 'user-modified');
      writeFileSync(join(folder, 'notes.txt'), 'user-added');
    }
    return { status: 0 };
  } });
  assert.ok(report.retained.includes(report.directory + '/Harness.vue'));
  assert.equal(await readFile(join(root, report.directory, 'Harness.vue'), 'utf8'), 'user-modified');
  assert.equal(await readFile(join(root, report.directory, 'notes.txt'), 'utf8'), 'user-added');
  assert.deepEqual((await readdir(join(root, report.directory))).sort(), ['Harness.vue', 'notes.txt']);
});
