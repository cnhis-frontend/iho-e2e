import { mkdir, mkdtemp, writeFile, readFile, lstat, realpath, unlink, rmdir } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { environmentFiles, runPackage } from './bootstrap.mjs';

export async function verifyEnvironment(project, manager, { run = runPackage } = {}) {
  const root = await realpath(project);
  const tests = resolve(root, 'tests');
  await mkdir(tests, { recursive: true });
  if (await realpath(tests) !== tests) throw new Error('Temporary validation requires a project-local tests directory.');
  const folder = await mkdtemp(resolve(tests, '.iho-env-'));
  const directory = relative(root, folder).replaceAll('\\', '/');
  const files = environmentFiles(directory);
  for (const [path, content] of files) await writeFile(resolve(root, path), content, { flag: 'wx' });
  const exec = (binary, args) => run(manager,
    manager === 'npm' ? ['exec', '--offline', '--', binary, ...args]
      : manager === 'yarn' ? ['run', binary, ...args] : ['exec', binary, ...args], root);
  for (const [binary, args] of [
    ['vitest', ['run', '--config', `${directory}/vitest.config.ts`]],
    ['vue-tsc', ['--noEmit', '-p', `${directory}/tsconfig.json`]],
  ]) {
    const result = exec(binary, args);
    if (result.status !== 0) throw new Error(`Temporary environment ${binary} validation failed; diagnostic files retained at ${folder}`);
  }

  const removed = [];
  const retained = [];
  // Only remove the files created by this run, and only if they are still unchanged ordinary files.
  if ((await lstat(folder)).isSymbolicLink() || await realpath(folder) !== folder || dirname(folder) !== tests) {
    return { directory, removed, retained: [directory], reason: 'Temporary directory changed during verification' };
  }
  for (const [path, content] of files) {
    const target = resolve(root, path);
    let current;
    try { current = await lstat(target); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
    if (current.isFile() && await readFile(target, 'utf8') === content) {
      await unlink(target);
      removed.push(path);
    } else retained.push(path);
  }
  try { await rmdir(folder); } catch (e) {
    if (!['ENOTEMPTY', 'EEXIST'].includes(e.code)) throw e;
    retained.push(directory);
  }
  return { directory, removed, retained };
}
