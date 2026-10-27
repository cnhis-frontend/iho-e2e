import { mkdtemp, mkdir, writeFile, rm, readdir, readFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve, dirname, basename } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { initializationPlan } from '../lib/project.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
await mkdir(resolve(repo, 'work'), { recursive: true });
const project = await mkdtemp(resolve(repo, 'work/bootstrap-verification-'));
console.log(`Fresh verification project: ${project}`);
await writeFile(join(project, 'package.json'), JSON.stringify({ name: 'iho-bootstrap-verification', private: true, type: 'module', dependencies: { vue: '3.5.13' } }, null, 2));

async function cli(args, expected = 0) {
  let stdout = '';
  const code = await new Promise((done, reject) => {
    const child = spawn(process.execPath, [resolve(repo, 'bin/iho-test.mjs'), ...args, '--project', project], { stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true });
    child.stdout.on('data', data => { stdout += data; process.stdout.write(data); });
    child.on('error', reject);
    child.on('close', code => done(code));
  });
  assert.equal(code, expected, `Unexpected CLI exit for ${args.join(' ')}`);
  return stdout;
}

await cli(['init', '--apply']);
assert.ok(!(await readdir(join(project, 'tests'))).some(name => name.startsWith('.iho-env-') || name === 'iho-env'));
assert.equal(JSON.parse(await readFile(join(project, 'package.json'), 'utf8')).scripts['test:env'], undefined);
const plan = await initializationPlan(project);
assert.ok(plan.files.every(f => f.action === 'unchanged'));
assert.deepEqual(plan.missingDependencies, {});
assert.deepEqual(plan.scriptAdditions, {});
await mkdir(join(project, 'docs/agents'), { recursive: true });
await writeFile(join(project, 'docs/agents/testing.md'), 'Temporary toolkit verification fixture, not production business coverage.\n');
const missingHost = JSON.parse(await cli(['doctor', '--host'], 1));
assert.equal(missingHost.verification.host, 'not-configured');

// Synthetic application startup contract: importing a real module needs the host first.
await mkdir(join(project, 'src'), { recursive: true });
await mkdir(join(project, 'tests/host'), { recursive: true });
await writeFile(join(project, 'src/host-dependent.ts'), `const host = (globalThis as any).__sampleHost;
if (!host) throw new Error('Application host must be active before module import');
export function notify() { host.messages.push('loaded'); }
`);
await writeFile(join(project, 'vitest.host.config.ts'), `import { defineConfig } from 'vitest/config';
import base from './vitest.iho.config';
export default defineConfig({ ...base, test: { ...base.test, include: ['tests/host/**/*.test.ts'] } });
`);
const pkg = JSON.parse(await readFile(join(project, 'package.json'), 'utf8'));
pkg.scripts['test:host'] = 'vitest run --config vitest.host.config.ts';
await writeFile(join(project, 'package.json'), JSON.stringify(pkg, null, 2));
const profile = JSON.parse(await readFile(join(project, 'iho-test.config.json'), 'utf8'));
profile.scripts.host = 'test:host';
await writeFile(join(project, 'iho-test.config.json'), JSON.stringify(profile, null, 2));
const hostTest = join(project, 'tests/host/startup.test.ts');
await writeFile(hostTest, `import { test } from 'vitest';
import { notify } from '../../src/host-dependent';
test('host startup', () => notify());
`);
const hostFailure = JSON.parse(await cli(['doctor', '--host'], 1));
assert.equal(hostFailure.verification.host, 'failed');
assert.match(JSON.stringify(hostFailure.execution[0].failures), /host must be active before module import/);
await writeFile(hostTest, `import { beforeAll, beforeEach, afterAll, test, expect } from 'vitest';
const host = { messages: [] as string[] };
let notify: typeof import('../../src/host-dependent').notify;
beforeAll(async () => {
  (globalThis as any).__sampleHost = host;
  ({ notify } = await import('../../src/host-dependent'));
});
beforeEach(() => { host.messages.length = 0; });
afterAll(() => { delete (globalThis as any).__sampleHost; });
test.each([1, 2])('host scenario %i starts clean', () => {
  expect(host.messages).toEqual([]);
  notify();
  expect(host.messages).toEqual(['loaded']);
});
`);
const hostPassed = JSON.parse(await cli(['doctor', '--host']));
assert.deepEqual(hostPassed.verification, { host: 'passed', flows: 'not-run', types: 'passed' });
await cli(['doctor', '--run'], 1); // Empty business suite must fail despite the successful environment smoke.

const negative = join(project, 'tests/flows/network.test.ts');
await writeFile(negative, `import { test } from 'vitest';
test('swallowed undeclared request is still rejected', async () => {
  await fetch('http://iho-test.invalid/undeclared').catch(() => undefined);
});
`);
const negativeReport = JSON.parse(await cli(['doctor', '--run'], 1));
assert.match(JSON.stringify(negativeReport.execution.find(r => r.kind === 'flows').failures), /Unspecified network requests/);
await rm(negative);

// A real component is used here to test doctor integration, not to claim IHO business coverage.
await mkdir(join(project, 'src'), { recursive: true });
await writeFile(join(project, 'src/Counter.vue'), `<script setup lang="ts">import { ref } from 'vue'; const n = ref(0);</script>
<template><button @click="n++">增加</button><p role="status">{{ n }}</p></template>
`);
await writeFile(join(project, 'tests/flows/counter.test.ts'), `import { test, expect } from 'vitest';
import { render, screen } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import Counter from '../../src/Counter.vue';
test('doctor accepts an executed DOM behavior', async () => {
  const user = userEvent.setup(); render(Counter);
  await user.click(screen.getByRole('button', { name: '增加' }));
  expect(screen.getByRole('status')).toHaveTextContent('1');
});
`);
await cli(['doctor', '--run']);
// This entire directory was created by this run; remove successful synthetic probes and dependencies.
const parent = await realpath(resolve(repo, 'work'));
const actual = await realpath(project);
assert.equal(dirname(actual), parent);
assert.ok(basename(actual).startsWith('bootstrap-verification-'));
await rm(actual, { recursive: true });
const report = { project, cleaned: true, passed: true, checks: ['dependency-install', 'sfc-dom-msw-smoke', 'temporary-files-cleaned', 'test-typecheck', 'idempotent-plan', 'missing-host-rejected', 'host-import-order-rejected', 'host-repeat-scenarios-accepted', 'empty-flow-rejected', 'caught-unhandled-network-rejected', 'executed-flow-accepted'] };
await writeFile(resolve(repo, 'work/bootstrap-verification-latest.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
