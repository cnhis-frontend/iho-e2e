import { mkdir, lstat, realpath, symlink, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const usage = 'node scripts/install-skills.mjs --project <Vue-3-project-path>';
async function stat(path) {
  try { return await lstat(path); } catch (e) { if (e.code !== 'ENOENT') throw e; }
}

try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log(usage);
  } else {
    if (args.length !== 2 || args[0] !== '--project' || !args[1] || args[1].startsWith('--')) {
      throw new Error(`An explicit project is required; user-wide installation is not supported. Usage: ${usage}`);
    }
    const project = await realpath(resolve(args[1]));
    const pkg = JSON.parse(await readFile(resolve(project, 'package.json'), 'utf8'));
    const vue = pkg.dependencies?.vue ?? pkg.devDependencies?.vue;
    if (!vue || !/(?:^|[^0-9])3\./.test(vue)) throw new Error('Choose an existing Vue 3 IHO application.');

    // A project can link its .agents directory elsewhere; never install into a shared/user directory.
    for (const path of [resolve(project, '.agents'), resolve(project, '.agents/skills')]) {
      if (await stat(path)) {
        const rel = relative(project, await realpath(path));
        if (rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel)) {
          throw new Error(`Skill discovery directory resolves outside the project: ${path}`);
        }
      }
    }
    const destination = resolve(project, '.agents/skills');
    const entries = [];
    for (const name of ['iho-test-bootstrap', 'iho-behavior-testing']) {
      const target = resolve(root, 'skills', name);
      const link = resolve(destination, name);
      const current = await stat(link);
      if (current && (!current.isSymbolicLink() || await realpath(link) !== await realpath(target))) {
        throw new Error(`Existing skill differs; preserved without overwriting: ${link}`);
      }
      entries.push({ name, target, link, current });
    }
    await mkdir(destination, { recursive: true });
    // Machine-local directory links are reinstalled per checkout, never committed as portable skills.
    const ignorePath = resolve(destination, '.gitignore');
    let ignore = '';
    if (await stat(ignorePath)) {
      if ((await lstat(ignorePath)).isSymbolicLink()) throw new Error('Preserve linked skill .gitignore; use a project-local file.');
      ignore = await readFile(ignorePath, 'utf8');
    }
    const missing = entries.map(({ name }) => `/${name}/`).filter(line => !ignore.split(/\r?\n/).includes(line));
    if (missing.length) await writeFile(ignorePath, ignore + (ignore && !ignore.endsWith('\n') ? '\n' : '') + missing.join('\n') + '\n');
    for (const { target, link, current } of entries) {
      if (current) console.log(`Unchanged: ${link}`);
      else {
        await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
        console.log(`Installed: ${link}`);
      }
    }
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
