import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createKnowledge, digest } from './knowledge.mjs';
import { dependencies, scripts, scaffoldFiles, packageManager, runPackage, checkNode } from './bootstrap.mjs';
import { verifyEnvironment } from './environment.mjs';

export const toolkitRoot = fileURLToPath(new URL('../', import.meta.url));
export const version = '0.1.0';
export async function exists(path) { try { await access(path); return true; } catch { return false; } }
export async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }

export async function initializationPlan(project, options = {}) {
  checkNode();
  const root = resolve(project);
  const pkg = await readJson(resolve(root, 'package.json'));
  const vue = pkg.dependencies?.vue ?? pkg.devDependencies?.vue;
  if (!vue || !/(?:^|[^0-9])3\./.test(vue)) throw new Error('Bootstrap requires an existing Vue 3 application; it does not create or migrate the application itself.');
  const manager = await packageManager(root, pkg, options.packageManager);
  const knowledge = await createKnowledge({ type: 'local', root: resolve(toolkitRoot, 'knowledge') });
  const rule = await knowledge.read('iho.behavior-testing');
  const profilePath = resolve(root, 'iho-test.config.json');
  const existingProfile = await exists(profilePath) ? await readJson(profilePath) : undefined;
  if (existingProfile && existingProfile.schemaVersion !== 1) throw new Error('Unsupported existing project profile; preserve it and migrate explicitly.');
  const profile = existingProfile ?? {
    schemaVersion: 1,
    toolkitVersion: version,
    project: pkg.name,
    knowledge: { type: 'local', root: 'tests/knowledge', catalog: 'catalog.json', catalogSha256: knowledge.provenance.catalogSha256 },
    scripts: { flows: 'test:flows', types: 'test:types' },
    flowConfig: 'vitest.iho.config.ts',
    flowDirectory: 'tests/flows',
    documentation: 'docs/agents/testing.md',
  };
  const adopted = !!existingProfile && profile.flowConfig !== 'vitest.iho.config.ts';
  const localSnapshot = profile.knowledge?.type === 'local' && profile.knowledge.root === 'tests/knowledge';
  const candidates = [
    ['iho-test.config.json', JSON.stringify(profile, null, 2) + '\n'],
    ...(localSnapshot ? [
      ['tests/knowledge/catalog.json', await readFile(resolve(toolkitRoot, 'knowledge/catalog.json'), 'utf8')],
      ['tests/knowledge/behavior-testing.md', rule.content],
      ['tests/knowledge/.gitattributes', '* text eol=lf\n'],
    ] : []),
    ...(adopted ? [] : scaffoldFiles({ extendsTsconfig: await exists(resolve(root, 'tsconfig.json')) })),
  ];
  const files = [];
  for (const [path, content] of candidates) {
    const full = resolve(root, path);
    const present = await exists(full);
    const current = present ? await readFile(full, 'utf8') : null;
    files.push({ path, action: !present ? 'create' : current === content ? 'unchanged' : 'preserve', sha256: digest(content), content });
  }
  const presentDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  const missing = Object.fromEntries(Object.entries(dependencies).filter(([name]) => !presentDeps[name]));
  const additions = adopted ? {} : Object.fromEntries(Object.entries(scripts).filter(([name]) => !pkg.scripts?.[name]));
  const verificationScripts = adopted ? { flows: profile.scripts?.flows, types: profile.scripts?.types } : { types: profile.scripts.types };
  for (const script of Object.values(verificationScripts)) {
    if (typeof script !== 'string' || !(pkg.scripts?.[script] || additions[script])) throw new Error('Mapped verification script is missing; repair the project profile or package scripts.');
  }
  return { project: root, templateVersion: version, mode: adopted ? 'existing-environment' : 'starter', verificationScripts, files, packageManager: manager, registry: options.registry, missingDependencies: missing,
    scriptAdditions: additions, originalPackage: await readFile(resolve(root, 'package.json'), 'utf8'),
    temporaryVerification: adopted ? undefined : 'Vue/DOM/MSW smoke and types; unchanged temporary files are removed after success.',
    next: ['Review preserved configuration conflicts.', 'Remove temporary probes and debug-only code after verification; preserve shared test support.', 'Add project render/host adapters and a genuine business flow.', 'Run doctor --run; environment smoke is not business coverage.'] };
}

export async function applyInitialization(plan, { install = true, verify = true } = {}) {
  const pkgPath = resolve(plan.project, 'package.json');
  const currentPackage = await readFile(pkgPath, 'utf8');
  if (currentPackage !== plan.originalPackage) throw new Error('package.json changed after planning; rerun init.');
  for (const file of plan.files) {
    if (file.action !== 'create') continue;
    const path = resolve(plan.project, file.path);
    await mkdir(dirname(path), { recursive: true });
    // Exclusive creation protects edits made after the plan was read.
    await writeFile(path, file.content, { flag: 'wx' });
  }
  const pkg = JSON.parse(currentPackage);
  if (Object.keys(plan.scriptAdditions).length) {
    pkg.scripts = { ...pkg.scripts, ...plan.scriptAdditions };
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  }
  const result = { installed: false, environment: 'not-run', types: 'not-run' };
  if (!install) return result;
  const packages = Object.entries(plan.missingDependencies).map(([name, v]) => `${name}@${v}`);
  // Also materialize already declared dependencies in a fresh checkout.
  const args = packages.length ? (plan.packageManager === 'npm' ? ['install', '--save-dev', ...packages] : ['add', '-D', ...packages]) : ['install'];
  if (plan.registry) args.push('--registry', plan.registry);
  const child = runPackage(plan.packageManager, args, plan.project);
  if (child.status !== 0) throw new Error('Dependency installation failed. Inspect the package-manager output for registry or Node engine requirements. Generated files remain for diagnosis; initialization is incomplete.');
  result.installed = true;
  if (verify) {
    if (plan.mode === 'starter') {
      result.cleanup = await verifyEnvironment(plan.project, plan.packageManager);
      result.environment = 'passed';
    }
    for (const [key, script] of Object.entries(plan.verificationScripts)) {
      const check = runPackage(plan.packageManager, ['run', script], plan.project);
      if (check.status !== 0) throw new Error(`${script} failed; initialization is incomplete. Preserve existing versions and resolve the reported compatibility issue.`);
      result[key] = 'passed';
    }
  }
  return result;
}

export async function loadProjectKnowledge(project, options = {}) {
  const root = resolve(project);
  const profile = await readJson(resolve(root, 'iho-test.config.json'));
  const config = { ...profile.knowledge };
  if (config.type === 'local' || config.type === 'git') config.root = resolve(root, config.root);
  return { profile, knowledge: await createKnowledge(config, options) };
}

export async function diagnose(project) {
  const root = resolve(project);
  const checks = [];
  const pkg = await readJson(resolve(root, 'package.json'));
  let profile;
  try {
    const loaded = await loadProjectKnowledge(root);
    profile = loaded.profile;
    if (profile.schemaVersion !== 1) throw new Error('Unsupported project profile');
    const rules = loaded.knowledge.search({ project: pkg.name });
    if (!rules.length) throw new Error('No accepted rules apply to this project');
    for (const r of rules) await loaded.knowledge.read(r.id);
    checks.push({ name: 'knowledge', ok: true, provenance: loaded.knowledge.provenance });
  } catch (e) { checks.push({ name: 'knowledge', ok: false, code: e.code, detail: e.message }); }
  if (!profile) return { project: root, ok: false, checks, execution: 'not-run' };
  for (const key of ['flows', 'types']) {
    const name = profile.scripts?.[key];
    checks.push({ name: `script:${key}`, ok: typeof name === 'string' && !!pkg.scripts?.[name], detail: name });
  }
  for (const key of ['flowConfig', 'flowDirectory', 'documentation']) {
    checks.push({ name: key, ok: typeof profile[key] === 'string' && await exists(resolve(root, profile[key])), detail: profile[key] });
  }
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const dep of ['vitest', '@testing-library/vue', '@testing-library/user-event', '@testing-library/jest-dom', 'msw']) {
    checks.push({ name: `dependency:${dep}`, ok: !!allDeps[dep], detail: allDeps[dep] });
  }
  return { project: root, ok: checks.every(c => c.ok), checks, execution: 'not-run' };
}
