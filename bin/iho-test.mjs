#!/usr/bin/env node
import { resolve } from 'node:path';
import { initializationPlan, applyInitialization, diagnose, loadProjectKnowledge, toolkitRoot, version } from '../lib/project.mjs';
import { runChecks } from '../lib/checks.mjs';

const [command, ...args] = process.argv.slice(2);
const valueFlags = new Set(['--project', '--pm', '--query', '--id', '--registry']);
const switches = new Set(['--apply', '--no-install', '--no-verify', '--run', '--host']);
for (let i = 0; i < args.length; i++) {
  if (valueFlags.has(args[i])) {
    if (!args[i + 1] || args[i + 1].startsWith('--')) {
      process.stderr.write(`Missing value for ${args[i]}\n`);
      process.exit(1);
    }
    i++;
  } else if (!switches.has(args[i])) {
    process.stderr.write(`Unknown option: ${args[i]}\n`);
    process.exit(1);
  }
}
const option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const root = resolve(option('--project', process.cwd()));
const print = obj => process.stdout.write(JSON.stringify(obj, null, 2) + '\n');

try {
  if (args.includes('--host') && (command !== 'doctor' || args.includes('--run'))) {
    throw new Error('Use doctor --host for host acceptance or doctor --run for all configured suites.');
  }
  if (command === 'info') {
    print({ version, toolkitRoot, adaptationGuide: resolve(toolkitRoot, 'docs/project-adaptation.md') });
  } else if (command === 'init') {
    const plan = await initializationPlan(root, { packageManager: option('--pm'), registry: option('--registry') });
    const result = args.includes('--apply') ? await applyInitialization(plan, { install: !args.includes('--no-install'), verify: !args.includes('--no-verify') }) : undefined;
    const { originalPackage, ...summary } = plan;
    print({ ...summary, applied: args.includes('--apply'), result, files: plan.files.map(({ content, ...f }) => f) });
  } else if (command === 'doctor') {
    const report = await diagnose(root);
    if ((args.includes('--run') || args.includes('--host')) && report.ok) await runChecks(root, report, { hostOnly: args.includes('--host') });
    print(report);
    if (!report.ok) process.exitCode = 1;
  } else if (command === 'rules') {
    const { knowledge, profile } = await loadProjectKnowledge(root);
    const id = option('--id');
    print(id ? await knowledge.read(id) : { provenance: knowledge.provenance, rules: knowledge.search({ query: option('--query', ''), project: profile.project }) });
  } else {
    process.stdout.write('iho-test init --project PATH [--apply] [--pm npm|yarn|pnpm] [--registry URL] [--no-install] [--no-verify]\niho-test doctor --project PATH [--host | --run]\niho-test rules --project PATH [--query TEXT | --id ID]\n');
    if (command && command !== '--help') process.exitCode = 1;
  }
} catch (e) { print({ ok: false, code: e.code ?? 'ERROR', message: e.message }); process.exitCode = 1; }
