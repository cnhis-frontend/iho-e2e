import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
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
    child.on('exit', code => done(code));
  });
  assert.equal(code, expected, `Unexpected CLI exit for ${args.join(' ')}`);
  return stdout;
}

await cli(['init', '--apply']);
const plan = await initializationPlan(project);
assert.ok(plan.files.every(f => f.action === 'unchanged'));
assert.deepEqual(plan.missingDependencies, {});
assert.deepEqual(plan.scriptAdditions, {});
await mkdir(join(project, 'docs/agents'), { recursive: true });
await writeFile(join(project, 'docs/agents/testing.md'), 'Temporary toolkit verification fixture, not production business coverage.\n');
await cli(['doctor', '--run'], 1); // Empty business suite must fail despite the successful environment smoke.

const negative = join(project, 'tests/flows/network.test.ts');
await writeFile(negative, `import { test } from 'vitest';
test('swallowed undeclared request is still rejected', async () => {
  await fetch('http://iho-test.invalid/undeclared').catch(() => undefined);
});
`);
const negativeReport = JSON.parse(await cli(['doctor', '--run'], 1));
assert.match(JSON.stringify(negativeReport.execution[0].failures), /Unspecified network requests/);
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
const report = { project, passed: true, checks: ['dependency-install', 'sfc-dom-msw-smoke', 'test-typecheck', 'idempotent-plan', 'empty-flow-rejected', 'caught-unhandled-network-rejected', 'executed-flow-accepted'] };
await writeFile(resolve(repo, 'work/bootstrap-verification-latest.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
