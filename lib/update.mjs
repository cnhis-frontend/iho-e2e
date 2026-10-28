import { readFile, writeFile, mkdir, lstat, realpath } from 'node:fs/promises';
import { resolve, relative, dirname, isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createKnowledge, digest } from './knowledge.mjs';
import { toolkitRoot } from './project.mjs';
import { planSkillInstallation, applySkillInstallation } from './skill-installation.mjs';

const lockName = 'iho-test.lock.json';
const profileName = 'iho-test.config.json';
async function contents(path) {
  try { return await readFile(path, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
async function projectPath(root, path) {
  const target = resolve(root, path);
  const rel = relative(root, target);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`Update path must stay inside the project: ${path}`);
  for (let current = target; current !== root; current = dirname(current)) {
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error(`Preserve linked project file: ${current}`); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return target;
}
function skillChanges(plan) {
  return plan.plans.flatMap(skill => {
    const changes = [];
    for (const [path, body] of skill.files) {
      if (skill.previous[path] !== digest(body)) changes.push({ path: `.agents/skills/${skill.name}/${path}`, action: skill.previous[path] ? 'update' : 'create' });
    }
    for (const path of Object.keys(skill.previous)) {
      if (!skill.files.has(path)) changes.push({ path: `.agents/skills/${skill.name}/${path}`, action: 'remove' });
    }
    if (skill.manifest !== skill.originalManifest) changes.push({ path: `.agents/skills/${skill.name}/iho-skill-manifest.json`, action: skill.originalManifest === null ? 'create' : 'update' });
    return changes;
  });
}

export async function planUpdate(project, { source = toolkitRoot, updateRules = false } = {}) {
  const root = await realpath(resolve(project));
  const sourceRoot = await realpath(resolve(source));
  const sourcePackage = await contents(resolve(sourceRoot, 'package.json'));
  if (!sourcePackage || JSON.parse(sourcePackage).name !== '@cnhis-frontend/iho-e2e') {
    throw new Error('Choose a toolkit source checkout with --source PATH. A bundled runtime is not an upstream update source.');
  }
  const sourceVersion = JSON.parse(sourcePackage).version;
  if (typeof sourceVersion !== 'string' || !sourceVersion) throw new Error('Update source is missing its toolkit version.');
  const profilePath = await projectPath(root, profileName);
  const originalProfile = await contents(profilePath);
  if (originalProfile === null) throw new Error('Project is not initialized; run init before update.');
  const profile = JSON.parse(originalProfile);
  if (profile.schemaVersion !== 1) throw new Error('Unsupported project profile; preserve it and migrate explicitly.');
  const lockPath = await projectPath(root, lockName);
  const originalLock = await contents(lockPath);
  const oldLock = originalLock === null ? undefined : JSON.parse(originalLock);
  if (oldLock && (oldLock.schemaVersion !== 1 || oldLock.tool !== '@cnhis-frontend/iho-e2e')) {
    throw new Error(`Unrecognized ${lockName}; preserved.`);
  }
  // Check both skills before any project file is written.
  const skills = await planSkillInstallation(root, sourceRoot);
  const changes = skillChanges(skills);
  const writes = [];
  const watched = new Map([[profileName, originalProfile], [lockName, originalLock], ['package.json', await contents(resolve(root, 'package.json'))]]);
  let managedKnowledge = oldLock?.managedKnowledge;
  let knowledge = { action: 'preserve', reason: 'Pinned knowledge is unchanged; use --update-rules to upgrade a managed local snapshot.' };
  const standardLocal = profile.knowledge?.type === 'local' && profile.knowledge.root === 'tests/knowledge'
    && (profile.knowledge.catalog ?? 'catalog.json') === 'catalog.json';

  if (standardLocal) {
    // The installed, manifest-verified snapshot bootstraps ownership for projects predating this updater.
    const installed = skills.plans.find(s => s.name === 'iho-test-bootstrap');
    const baselineCatalog = managedKnowledge?.catalogSha256 ?? installed.previous['toolkit/knowledge/catalog.json'];
    const catalogPath = await projectPath(root, 'tests/knowledge/catalog.json');
    const currentCatalog = await contents(catalogPath);
    watched.set('tests/knowledge/catalog.json', currentCatalog);
    if (!managedKnowledge && currentCatalog !== null && digest(currentCatalog) === baselineCatalog
      && profile.knowledge.catalogSha256 === baselineCatalog) {
      const catalog = JSON.parse(currentCatalog);
      const files = { 'tests/knowledge/catalog.json': baselineCatalog };
      let matches = true;
      for (const rule of catalog.rules ?? []) {
        const path = `tests/knowledge/${rule.ref}`;
        const body = await contents(await projectPath(root, path));
        watched.set(path, body);
        if (body === null || digest(body) !== rule.sha256 || installed.previous[`toolkit/knowledge/${rule.ref}`] !== rule.sha256) matches = false;
        files[path] = rule.sha256;
      }
      if (matches) managedKnowledge = { catalogSha256: baselineCatalog, files };
    }
    if (updateRules) {
      if (!managedKnowledge || profile.knowledge.catalogSha256 !== managedKnowledge.catalogSha256) {
        throw new Error('Local rules have no matching managed baseline or were repinned; preserved. Review the project knowledge customization before upgrading.');
      }
      for (const [path, hash] of Object.entries(managedKnowledge.files)) {
        const body = await contents(await projectPath(root, path));
        watched.set(path, body);
        if (body === null || digest(body) !== hash) throw new Error(`Project-modified knowledge file; preserved: ${path}`);
      }
      const nextKnowledge = await createKnowledge({ type: 'local', root: resolve(sourceRoot, 'knowledge') });
      const catalogBody = await readFile(resolve(sourceRoot, 'knowledge/catalog.json'), 'utf8');
      const catalog = JSON.parse(catalogBody);
      const nextFiles = new Map([['tests/knowledge/catalog.json', catalogBody]]);
      for (const rule of catalog.rules) {
        nextFiles.set(`tests/knowledge/${rule.ref}`, (await nextKnowledge.read(rule.id)).content);
      }
      for (const [path, body] of nextFiles) {
        const current = await contents(await projectPath(root, path));
        watched.set(path, current);
        if (!(path in managedKnowledge.files) && current !== null) throw new Error(`Unmanaged knowledge file; preserved: ${path}`);
        if (current !== body) writes.push({ path, content: body });
      }
      // Unreferenced old rule files stay in place; removing project files requires a separate review.
      profile.knowledge.catalogSha256 = nextKnowledge.provenance.catalogSha256;
      managedKnowledge = { catalogSha256: profile.knowledge.catalogSha256, files: Object.fromEntries([...nextFiles].map(([path, body]) => [path, digest(body)])) };
      knowledge = { action: JSON.parse(originalProfile).knowledge.catalogSha256 === profile.knowledge.catalogSha256 ? 'unchanged' : 'update', from: JSON.parse(originalProfile).knowledge.catalogSha256, to: profile.knowledge.catalogSha256,
        rules: catalog.rules.map(({ id, version }) => ({ id, version })) };
    }
  } else if (updateRules) {
    throw new Error('--update-rules only upgrades the managed tests/knowledge local snapshot. Custom, Git and OpenViking sources are preserved; update their pins through their own review process.');
  } else {
    managedKnowledge = undefined;
    knowledge.reason = 'Custom or external knowledge configuration is preserved; no service was contacted.';
  }

  const snapshotSha256 = digest(JSON.stringify(skills.plans.map(s => [s.name, [...s.files].map(([path, body]) => [path, digest(body)])])));
  let revision;
  let dirty;
  try {
    await lstat(resolve(sourceRoot, '.git'));
    const git = args => spawnSync('git', ['-C', sourceRoot, ...args], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    const head = git(['rev-parse', 'HEAD']);
    if (head.status === 0) {
      revision = head.stdout.trim();
      const status = git(['status', '--porcelain']);
      if (status.status === 0) dirty = !!status.stdout.trim();
    }
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const sourceInfo = { version: sourceVersion, revision, dirty, snapshotSha256 };
  const lock = { schemaVersion: 1, tool: '@cnhis-frontend/iho-e2e', source: sourceInfo, managedKnowledge };
  profile.toolkitVersion = sourceVersion;
  if (JSON.stringify(profile) !== JSON.stringify(JSON.parse(originalProfile))) writes.push({ path: profileName, content: JSON.stringify(profile, null, 2) + '\n' });
  const lockBody = JSON.stringify(lock, null, 2) + '\n';
  if (lockBody !== originalLock) writes.push({ path: lockName, content: lockBody });
  for (const write of writes) changes.push({ path: write.path, action: watched.get(write.path) === null ? 'create' : 'update' });
  return { root, sourceRoot, updateRules, skills, writes, watched, summary: {
    project: root, previousVersion: JSON.parse(originalProfile).toolkitVersion, source: sourceInfo, changes, knowledge,
    validation: 'not-run',
    next: [
      ...(profile.scripts?.host ? ['Run doctor --host to verify the mapped application host.'] : ['Application host is not mapped. Adapt the project using docs/project-adaptation.md, add scripts.host, then run doctor --host.']),
      'Run doctor --run when business cases exist; snapshot synchronization is not application acceptance.',
      'Review and commit both skill directories, the update lock and any profile/rule changes in the application repository.',
    ],
  } };
}

export async function applyUpdate(plan) {
  // Re-plan immediately before applying to catch source edits, project edits and changed manifests.
  const fresh = await planUpdate(plan.root, { source: plan.sourceRoot, updateRules: plan.updateRules });
  if (JSON.stringify(fresh.summary) !== JSON.stringify(plan.summary)
    || JSON.stringify([...fresh.watched]) !== JSON.stringify([...plan.watched])) {
    throw new Error('Source or project changed after planning; rerun update.');
  }
  for (const [path, before] of plan.watched) {
    if (await contents(await projectPath(plan.root, path)) !== before) throw new Error(`Project changed after planning: ${path}`);
  }
  await applySkillInstallation(fresh.skills);
  for (const { path, content } of fresh.writes) {
    const target = await projectPath(plan.root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, { flag: plan.watched.get(path) === null ? 'wx' : 'w' });
  }
  return { ...fresh.summary, applied: true };
}
