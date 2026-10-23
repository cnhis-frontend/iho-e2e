import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, realpath, lstat, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const toolkit = fileURLToPath(new URL('../', import.meta.url));
const names = ['iho-test-bootstrap', 'iho-behavior-testing'];
const run = args => spawnSync(process.execPath, [resolve(toolkit, 'scripts/install-skills.mjs'), ...args], {
  encoding: 'utf8', windowsHide: true,
});
async function fixture(t, vue = '^3.5.13') {
  const root = await mkdtemp(join(tmpdir(), 'iho-project-skills-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { vue } }));
  return root;
}

test('skills install inside the project, work through links and preserve existing ignore rules on repeat', async t => {
  const root = await fixture(t);
  const destination = join(root, '.agents/skills');
  await mkdir(destination, { recursive: true });
  await writeFile(join(destination, '.gitignore'), '/other-local-skill/\n');
  const first = run(['--project', root]);
  assert.equal(first.status, 0, first.stderr);
  for (const name of names) {
    const installed = join(destination, name);
    assert.equal(await realpath(installed), await realpath(join(toolkit, 'skills', name)));
    const info = spawnSync(process.execPath, [join(installed, 'scripts/run.mjs'), 'info'], { encoding: 'utf8', windowsHide: true });
    assert.equal(info.status, 0, info.stderr);
    assert.equal(await realpath(JSON.parse(info.stdout).toolkitRoot), await realpath(toolkit));
  }
  const ignore = await readFile(join(destination, '.gitignore'), 'utf8');
  assert.ok(ignore.startsWith('/other-local-skill/\n'));
  for (const name of names) assert.ok(ignore.includes(`/${name}/`));
  assert.equal(run(['--project', root]).status, 0);
  assert.equal(await readFile(join(destination, '.gitignore'), 'utf8'), ignore);
});

test('a conflicting project skill is preserved before any other skill is installed', async t => {
  const root = await fixture(t);
  const existing = join(root, '.agents/skills/iho-behavior-testing');
  await mkdir(existing, { recursive: true });
  await writeFile(join(existing, 'SKILL.md'), 'User-owned instructions');
  const result = run(['--project', root]);
  assert.notEqual(result.status, 0);
  assert.equal(await readFile(join(existing, 'SKILL.md'), 'utf8'), 'User-owned instructions');
  await assert.rejects(lstat(join(root, '.agents/skills/iho-test-bootstrap')), { code: 'ENOENT' });
});

test('installer requires an explicit Vue project and rejects shared discovery directories', async t => {
  assert.notEqual(run([]).status, 0);
  const nonVue3 = await fixture(t, '^2.7.0');
  assert.notEqual(run(['--project', nonVue3]).status, 0);
  await assert.rejects(lstat(join(nonVue3, '.agents')), { code: 'ENOENT' });
  const root = await fixture(t);
  const outside = await fixture(t);
  assert.notEqual(run(['--to', outside]).status, 0);
  await symlink(outside, join(root, '.agents'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.notEqual(run(['--project', root]).status, 0);
  await assert.rejects(lstat(join(outside, 'skills')), { code: 'ENOENT' });
});
