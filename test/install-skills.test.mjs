import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, realpath, lstat, symlink, rm, cp, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const toolkit = fileURLToPath(new URL('../', import.meta.url));
const names = ['iho-test-bootstrap', 'iho-behavior-testing'];
const run = (args, source = toolkit) => spawnSync(process.execPath, [resolve(source, 'scripts/install-skills.mjs'), ...args], {
  encoding: 'utf8', windowsHide: true,
});
async function fixture(t, vue = '^3.5.13') {
  const root = await mkdtemp(join(tmpdir(), 'iho-project-skills-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { vue } }));
  return root;
}

test('committed skill snapshots run after a fresh Git clone without the original toolkit', async t => {
  const root = await fixture(t);
  const first = run(['--project', root]);
  assert.equal(first.status, 0, first.stderr);
  const git = (args, cwd = root) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  git(['init']);
  git(['config', 'core.autocrlf', 'true']);
  git(['add', '.']);
  git(['-c', 'user.name=Toolkit Tests', '-c', 'user.email=tests@example.invalid', 'commit', '-m', 'Project skills']);
  const container = await fixture(t);
  const clone = join(container, 'cloned-project');
  git(['clone', '--no-hardlinks', root, clone]);
  for (const name of names) {
    const installed = join(clone, '.agents/skills', name);
    assert.equal((await lstat(installed)).isSymbolicLink(), false);
    const info = spawnSync(process.execPath, [join(installed, 'scripts/run.mjs'), 'info'], { encoding: 'utf8', windowsHide: true });
    assert.equal(info.status, 0, info.stderr);
    const resolved = JSON.parse(info.stdout);
    assert.equal(await realpath(resolved.toolkitRoot), await realpath(join(clone, '.agents/skills/iho-test-bootstrap/toolkit')));
    await access(resolved.adaptationGuide);
    assert.ok(git(['ls-files', '.agents/skills/' + name], clone).includes('SKILL.md'));
  }
  const entry = join(clone, '.agents/skills/iho-test-bootstrap/scripts/run.mjs');
  const init = spawnSync(process.execPath, [entry, 'init', '--project', clone, '--apply', '--no-install', '--no-verify'], { encoding: 'utf8', windowsHide: true });
  assert.equal(init.status, 0, init.stdout + init.stderr);
  const rules = spawnSync(process.execPath, [join(clone, '.agents/skills/iho-behavior-testing/scripts/run.mjs'), 'rules', '--project', clone, '--id', 'iho.behavior-testing'], { encoding: 'utf8', windowsHide: true });
  assert.equal(rules.status, 0, rules.stdout + rules.stderr);
  assert.equal(JSON.parse(rules.stdout).provider, 'local');
  await assert.rejects(lstat(join(root, '.agents/skills/.gitignore')), { code: 'ENOENT' });
  assert.equal(run(['--project', root]).status, 0);
  assert.equal(git(['status', '--porcelain']), '', 'Repeat installation must leave the committed snapshot unchanged');
});

test('legacy project links migrate to ordinary files without deleting source or unrelated ignore rules', async t => {
  const root = await fixture(t);
  const destination = join(root, '.agents/skills');
  await mkdir(destination, { recursive: true });
  for (const name of names) await symlink(join(toolkit, 'skills', name), join(destination, name), process.platform === 'win32' ? 'junction' : 'dir');
  await writeFile(join(destination, '.gitignore'), '/other-local-skill/\r\n/iho-test-bootstrap/\r\n/iho-behavior-testing/\r\n');
  const result = run(['--project', root]);
  assert.equal(result.status, 0, result.stderr);
  for (const name of names) {
    assert.equal((await lstat(join(destination, name))).isSymbolicLink(), false);
    await access(join(toolkit, 'skills', name, 'SKILL.md'));
  }
  assert.equal(await readFile(join(destination, '.gitignore'), 'utf8'), '/other-local-skill/\r\n');
  await writeFile(join(destination, '.gitignore'), '/iho-test-bootstrap/\n/iho-behavior-testing/\n');
  assert.equal(run(['--project', root]).status, 0);
  await assert.rejects(lstat(join(destination, '.gitignore')), { code: 'ENOENT' });
});

test('managed snapshots upgrade cleanly but preserve project edits before updating either skill', async t => {
  const root = await fixture(t);
  assert.equal(run(['--project', root]).status, 0);
  const source = await fixture(t);
  for (const folder of ['skills', 'scripts', 'bin', 'lib', 'knowledge', 'docs']) await cp(join(toolkit, folder), join(source, folder), { recursive: true });
  const sourceFile = join(source, 'skills/iho-test-bootstrap/SKILL.md');
  const updated = (await readFile(sourceFile, 'utf8')).trimEnd() + '\n\nNew upstream guidance.\n';
  await writeFile(sourceFile, updated);
  const upgrade = run(['--project', root], source);
  assert.equal(upgrade.status, 0, upgrade.stderr);
  const installedFile = join(root, '.agents/skills/iho-test-bootstrap/SKILL.md');
  assert.equal(await readFile(installedFile, 'utf8'), updated.replace(/\r\n/g, '\n'));
  const edited = join(root, '.agents/skills/iho-behavior-testing/SKILL.md');
  await writeFile(edited, 'Project customization');
  await writeFile(sourceFile, updated + 'Another upstream change.\n');
  assert.notEqual(run(['--project', root], source).status, 0);
  assert.equal(await readFile(edited, 'utf8'), 'Project customization');
  assert.equal(await readFile(installedFile, 'utf8'), updated.replace(/\r\n/g, '\n'));
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
