import { mkdir, lstat, realpath, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { resolve, relative, isAbsolute, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

const names = ['iho-test-bootstrap', 'iho-behavior-testing'];
const manifestName = 'iho-skill-manifest.json';
const hash = value => createHash('sha256').update(value).digest('hex');
const inside = (base, path) => {
  const rel = relative(base, path);
  return rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\') && !isAbsolute(rel);
};
async function stat(path) {
  try { return await lstat(path); } catch (e) { if (e.code !== 'ENOENT') throw e; }
}
async function collect(folder, prefix = '', files = new Map()) {
  for (const entry of (await readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const source = join(folder, entry.name);
    const path = prefix + entry.name;
    if (entry.isDirectory()) await collect(source, path + '/', files);
    else if (entry.isFile()) files.set(path, (await readFile(source, 'utf8')).replace(/\r\n/g, '\n'));
    else throw new Error(`Unsupported linked snapshot source: ${source}`);
  }
  return files;
}
async function snapshot(root, name) {
  const files = await collect(resolve(root, 'skills', name));
  files.set('.gitattributes', '* text eol=lf\n');
  if (name === 'iho-test-bootstrap') {
    // One portable runtime shared by the two project skills; no dependencies or credentials bundled.
    for (const folder of ['bin', 'lib', 'knowledge', 'docs']) {
      await collect(resolve(root, folder), `toolkit/${folder}/`, files);
    }
  }
  return files;
}
async function checkPath(base, path) {
  if (!inside(base, path) || path === base) throw new Error('Invalid managed skill path.');
  let current = path;
  while (current !== base) {
    if ((await stat(current))?.isSymbolicLink()) throw new Error(`Preserve linked project content: ${current}`);
    current = dirname(current);
  }
}
async function planSkill(root, destination, name) {
  const path = resolve(destination, name);
  const current = await stat(path);
  const files = await snapshot(root, name);
  let migrateLink = false;
  let previous = {};
  let originalManifest = null;
  if (current?.isSymbolicLink()) {
    if (await realpath(path) !== await realpath(resolve(root, 'skills', name))) {
      throw new Error(`Existing skill points elsewhere; preserved: ${path}`);
    }
    migrateLink = true;
  } else if (current) {
    const manifestPath = resolve(path, manifestName);
    await checkPath(path, manifestPath);
    if (!await stat(manifestPath)) throw new Error(`Existing skill has no installation manifest; preserved: ${path}`);
    originalManifest = await readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(originalManifest);
    if (manifest.schemaVersion !== 1 || manifest.skill !== name || !manifest.files || Array.isArray(manifest.files) || typeof manifest.files !== 'object') {
      throw new Error(`Invalid installation manifest; preserved: ${path}`);
    }
    previous = manifest.files;
    for (const [file, digest] of Object.entries(previous)) {
      const target = resolve(path, file);
      await checkPath(path, target);
      if (file === manifestName || !/^[a-f0-9]{64}$/.test(digest) || !(await stat(target))?.isFile() || hash(await readFile(target)) !== digest) {
        throw new Error(`Project-modified skill file; preserved: ${target}`);
      }
    }
    for (const file of files.keys()) {
      const target = resolve(path, file);
      await checkPath(path, target);
      if (!Object.hasOwn(previous, file) && await stat(target)) throw new Error(`Unmanaged project file; preserved: ${target}`);
    }
  }
  const manifest = JSON.stringify({ schemaVersion: 1, skill: name, source: 'https://github.com/cnhis-frontend/iho-e2e',
    files: Object.fromEntries([...files].map(([file, content]) => [file, hash(content)])) }, null, 2) + '\n';
  return { name, path, files, previous, migrateLink, originalManifest, manifest };
}

export async function planSkillInstallation(projectPath, sourceRoot) {
  const root = await realpath(sourceRoot);
  const project = await realpath(resolve(projectPath));
  const pkg = JSON.parse(await readFile(resolve(project, 'package.json'), 'utf8'));
  const vue = pkg.dependencies?.vue ?? pkg.devDependencies?.vue;
  if (!vue || !/(?:^|[^0-9])3\./.test(vue)) throw new Error('Choose an existing Vue 3 IHO application.');
  for (const path of [resolve(project, '.agents'), resolve(project, '.agents/skills')]) {
    if (await stat(path) && !inside(project, await realpath(path))) {
      throw new Error(`Skill discovery directory resolves outside the project: ${path}`);
    }
  }
  const destination = resolve(project, '.agents/skills');
  const plans = [];
  for (const name of names) plans.push(await planSkill(root, destination, name));
  const ignorePath = resolve(destination, '.gitignore');
  let ignore;
  if (await stat(ignorePath)) {
    if ((await lstat(ignorePath)).isSymbolicLink()) throw new Error('Preserve linked skill .gitignore; use a project-local file.');
    ignore = await readFile(ignorePath, 'utf8');
  }

  return { project, plans, ignorePath, ignore };
}

export async function applySkillInstallation({ plans, ignorePath, ignore }) {
  // Preflight all existing content before replacing the known legacy links or writing snapshots.
  for (const { path, files, previous, migrateLink, manifest } of plans) {
    if (migrateLink) await unlink(path); // Remove only the verified link, never its target.
    await mkdir(path, { recursive: true });
    for (const [file, content] of files) {
      if (previous[file] === hash(content)) continue;
      const target = resolve(path, file);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content, { flag: Object.hasOwn(previous, file) ? 'w' : 'wx' });
    }
    for (const file of Object.keys(previous)) if (!files.has(file)) await unlink(resolve(path, file));
    const manifestPath = resolve(path, manifestName);
    if (!await stat(manifestPath) || await readFile(manifestPath, 'utf8') !== manifest) await writeFile(manifestPath, manifest);
  }
  if (ignore !== undefined) {
    const removed = new Set(names.map(name => `/${name}/`));
    const next = ignore.split(/(?<=\n)/).filter(line => !removed.has(line.trim())).join('');
    if (next !== ignore) {
      if (next.trim()) await writeFile(ignorePath, next);
      else await unlink(ignorePath);
    }
  }
}
