import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runChecks } from '../lib/checks.mjs';

async function fixture(t, scripts = { host: 'test:host', flows: 'test:flows', types: 'test:types' }) {
  const root = await mkdtemp(join(tmpdir(), 'iho-checks-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'package.json'), JSON.stringify({ scripts: Object.fromEntries(Object.values(scripts).map(s => [s, 'vitest run'])) }));
  await writeFile(join(root, 'iho-test.config.json'), JSON.stringify({ scripts }));
  return root;
}

const passed = { success: true, numPassedTests: 2, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0 };
function runner(calls, hostReport = passed) {
  return (_pm, args) => {
    calls.push(args[1]);
    const output = args.find(a => a.startsWith('--outputFile='));
    if (output) writeFileSync(output.slice('--outputFile='.length), JSON.stringify(args[1] === 'test:host' ? hostReport : passed));
    return { status: 0, stdout: '', stderr: '' };
  };
}

test('host acceptance runs host and types without requiring business coverage', async t => {
  const root = await fixture(t);
  const calls = [];
  const report = { ok: true };
  await runChecks(root, report, { hostOnly: true, run: runner(calls) });
  assert.deepEqual(calls, ['test:host', 'test:types']);
  assert.equal(report.ok, true);
  assert.deepEqual(report.verification, { host: 'passed', flows: 'not-run', types: 'passed' });
});

test('missing host mapping cannot be accepted even when flow tests pass', async t => {
  const root = await fixture(t, { flows: 'test:flows', types: 'test:types' });
  const report = { ok: true };
  await runChecks(root, report, { hostOnly: true, run: runner([]) });
  assert.equal(report.ok, false);
  assert.equal(report.verification.host, 'not-configured');
  assert.match(report.execution[0].error, /scripts.host/);
  const legacy = { ok: true };
  await runChecks(root, legacy, { run: runner([]) });
  assert.equal(legacy.ok, true);
  assert.equal(legacy.verification.host, 'not-configured');
  assert.equal(legacy.verification.flows, 'passed');
});

test('empty, skipped and failed host suites fail independently of passing business tests', async t => {
  const root = await fixture(t);
  for (const hostReport of [
    { ...passed, numPassedTests: 0 },
    { ...passed, numPendingTests: 1 },
    { ...passed, numTodoTests: 1 },
    { ...passed, success: false, testResults: [{ name: 'host.test.ts', status: 'failed', message: 'No active state at module import' }] },
  ]) {
    const report = { ok: true };
    await runChecks(root, report, { run: runner([], hostReport) });
    assert.equal(report.ok, false);
    assert.equal(report.verification.host, 'failed');
    assert.equal(report.verification.flows, 'passed');
  }
});

test('host exit success without a JSON report and typecheck failure cannot claim acceptance', async t => {
  const root = await fixture(t);
  const report = { ok: true };
  await runChecks(root, report, { hostOnly: true, run: () => ({ status: 0 }) });
  assert.equal(report.verification.host, 'failed');
  const types = { ok: true };
  await runChecks(root, types, { hostOnly: true, run: (...args) => args[1][1] === 'test:types'
    ? { status: 1, stderr: 'Type error in host adapter' } : runner([])(...args) });
  assert.equal(types.ok, false);
  assert.equal(types.verification.types, 'failed');
});

test('a flow script without a report cannot reuse the host report', async t => {
  const root = await fixture(t);
  const report = { ok: true };
  await runChecks(root, report, { run: (...args) => args[1][1] === 'test:flows'
    ? { status: 0 } : runner([])(...args) });
  assert.equal(report.ok, false);
  assert.equal(report.verification.host, 'passed');
  assert.equal(report.verification.flows, 'failed');
});
