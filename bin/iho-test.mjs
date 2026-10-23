#!/usr/bin/env node
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { initializationPlan, applyInitialization, diagnose, loadProjectKnowledge, exists, readJson } from '../lib/project.mjs';
import { packageManager, runPackage } from '../lib/bootstrap.mjs';

const [command, ...args] = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const root = resolve(option('--project', process.cwd()));
const print = obj => process.stdout.write(JSON.stringify(obj, null, 2) + '\n');

async function runChecks(report) {
  const profile = await readJson(resolve(root, 'iho-test.config.json'));
  const manager = await packageManager(root, await readJson(resolve(root, 'package.json')));
  const folder = await mkdtemp(join(tmpdir(), 'iho-test-report-'));
  try {
    const results = [];
    for (const kind of ['flows', 'types']) {
      const name = profile.scripts[kind];
      const output = join(folder, 'vitest.json');
      const extra = kind === 'flows' ? ['--', '--reporter=json', `--outputFile=${output}`] : [];
      const child = runPackage(manager, ['run', name, ...extra], root, { capture: true });
      let count;
      let skipped;
      let flowSuccess;
      if (kind === 'flows' && await exists(output)) {
        const result = await readJson(output);
        count = result.numPassedTests;
        skipped = (result.numPendingTests ?? 0) + (result.numTodoTests ?? 0);
        flowSuccess = result.success === true && result.numFailedTests === 0;
      }
      const ok = child.status === 0 && (kind !== 'flows' || (flowSuccess && count > 0 && skipped === 0));
      results.push({ script: name, ok, exitCode: child.status, passed: count, skipped, error: child.error?.message,
        output: [child.stdout, child.stderr].filter(Boolean).join('\n').slice(-14000) });
    }
    report.execution = results;
    report.ok = report.ok && results.every(r => r.ok);
  } finally { await rm(folder, { recursive: true, force: true }); }
}

try {
  if (command === 'init') {
    const plan = await initializationPlan(root, { packageManager: option('--pm') });
    const result = args.includes('--apply') ? await applyInitialization(plan, { install: !args.includes('--no-install'), verify: !args.includes('--no-verify') }) : undefined;
    const { originalPackage, ...summary } = plan;
    print({ ...summary, applied: args.includes('--apply'), result, files: plan.files.map(({ content, ...f }) => f) });
  } else if (command === 'doctor') {
    const report = await diagnose(root);
    if (args.includes('--run') && report.ok) await runChecks(report);
    print(report);
    if (!report.ok) process.exitCode = 1;
  } else if (command === 'rules') {
    const { knowledge, profile } = await loadProjectKnowledge(root);
    const id = option('--id');
    print(id ? await knowledge.read(id) : { provenance: knowledge.provenance, rules: knowledge.search({ query: option('--query', ''), project: profile.project }) });
  } else {
    process.stdout.write('iho-test init --project PATH [--apply] [--pm npm|yarn|pnpm] [--no-install] [--no-verify]\niho-test doctor --project PATH [--run]\niho-test rules --project PATH [--query TEXT | --id ID]\n');
    if (command && command !== '--help') process.exitCode = 1;
  }
} catch (e) { print({ ok: false, code: e.code ?? 'ERROR', message: e.message }); process.exitCode = 1; }
