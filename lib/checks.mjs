import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { readJson, exists } from './project.mjs';
import { packageManager, runPackage } from './bootstrap.mjs';

export async function runChecks(root, report, { hostOnly = false, run = runPackage } = {}) {
  const profile = await readJson(resolve(root, 'iho-test.config.json'));
  const pkg = await readJson(resolve(root, 'package.json'));
  const manager = await packageManager(root, pkg);
  report.verification = { host: profile.scripts?.host ? 'not-run' : 'not-configured', flows: 'not-run', types: 'not-run' };
  const kinds = hostOnly ? ['host', 'types'] : [...(profile.scripts?.host ? ['host'] : []), 'flows', 'types'];
  const folder = await mkdtemp(join(tmpdir(), 'iho-test-report-'));
  try {
    const results = [];
    for (const kind of kinds) {
      const name = profile.scripts?.[kind];
      if (typeof name !== 'string' || !pkg.scripts?.[name]) {
        results.push({ kind, script: name, ok: false, error: 'Configure scripts.' + kind + ' in the project profile and package.json.' });
        report.verification[kind] = 'not-configured';
        continue;
      }
      const output = join(folder, `${kind}.json`);
      const extra = kind !== 'types' ? ['--', '--reporter=json', `--outputFile=${output}`] : [];
      const child = run(manager, ['run', name, ...extra], root, { capture: true });
      let count;
      let skipped;
      let suiteSuccess;
      let failures;
      if (kind !== 'types' && await exists(output)) {
        const result = await readJson(output);
        count = result.numPassedTests;
        skipped = (result.numPendingTests ?? 0) + (result.numTodoTests ?? 0);
        suiteSuccess = result.success === true && result.numFailedTests === 0;
        failures = (result.testResults ?? []).filter(file => file.status === 'failed').map(file => ({
          file: file.name,
          message: file.message?.slice(0, 6000),
          assertions: (file.assertionResults ?? []).filter(a => a.status === 'failed').map(a => ({
            title: a.fullName ?? a.title, messages: (a.failureMessages ?? []).map(m => m.slice(0, 6000)),
          })),
        }));
      }
      const ok = child.status === 0 && (kind === 'types' || (suiteSuccess === true && count > 0 && skipped === 0));
      report.verification[kind] = ok ? 'passed' : 'failed';
      results.push({ kind, script: name, ok, exitCode: child.status, passed: count, skipped, failures, error: child.error?.message,
        output: [child.stdout, child.stderr].filter(Boolean).join('\n').slice(-14000) });
    }
    report.execution = results;
    report.ok = report.ok && results.every(r => r.ok);
  } finally { await rm(folder, { recursive: true, force: true }); }
}

