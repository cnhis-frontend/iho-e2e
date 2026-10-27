import { access } from 'node:fs/promises';
import { existsSync, realpathSync } from 'node:fs';
import { resolve, dirname, delimiter } from 'node:path';
import { spawnSync } from 'node:child_process';

// Baseline verified in a clean Vue 3 fixture; each application validates its own adapters.
// Existing declared versions are preserved and must pass actual environment checks.
export const dependencies = {
  vite: '8.3.4', vitest: '5.0.0', 'happy-dom': '20.10.6',
  '@vitejs/plugin-vue': '6.0.10', '@vitejs/plugin-vue-jsx': '5.1.6',
  '@vue/test-utils': '2.5.1', '@testing-library/vue': '8.1.0',
  '@testing-library/dom': '10.4.1', '@testing-library/user-event': '14.6.8',
  '@testing-library/jest-dom': '7.0.1', msw: '2.15.0',
  typescript: '6.0.3', 'vue-tsc': '3.3.9', '@types/node': '22.12.0',
};
export const scripts = {
  'test:flows': 'vitest run --config vitest.iho.config.ts tests/flows',
  'test:types': 'vue-tsc --noEmit -p tsconfig.iho-tests.json',
};

export function checkNode(version = process.versions.node) {
  const [major, minor] = version.split('.').map(Number);
  if (!(major === 22 && minor >= 12 || major === 24 || major >= 26)) {
    throw new Error(`Node ${version} is incompatible with the default Vitest 5 baseline; use Node ^22.12, ^24 or >=26.`);
  }
}

export async function packageManager(root, pkg, requested) {
  const locks = [];
  for (const [file, pm] of [['yarn.lock', 'yarn'], ['pnpm-lock.yaml', 'pnpm'], ['package-lock.json', 'npm']]) {
    try { await access(resolve(root, file)); locks.push(pm); } catch {}
  }
  const declared = pkg.packageManager?.split('@')[0];
  const pm = requested ?? declared ?? (locks.length === 1 ? locks[0] : locks.length === 0 ? 'npm' : undefined);
  if (!['npm', 'yarn', 'pnpm'].includes(pm)) throw new Error('Choose npm, yarn or pnpm; multiple lockfiles require an explicit choice.');
  if (locks.some(x => x !== pm)) throw new Error('Package manager conflicts with existing lockfiles; resolve the project convention before installation.');
  return pm;
}

export function runPackage(pm, args, root, { capture = false, timeout = 300000 } = {}) {
  let command = pm;
  let argv = args;
  const inheritedPath = Object.entries(process.env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
  let env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'path'));
  env.PATH = dirname(process.execPath) + delimiter + inheritedPath;
  // Windows npm.cmd can hardcode its adjacent node.exe, ignoring PATH.
  // Launch known JavaScript CLIs with the selected interpreter when available.
  const lookup = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', [process.platform === 'win32' ? `${pm}.cmd` : pm], {
    encoding: 'utf8', windowsHide: true, env, timeout: 5000,
  });
  const launchers = (lookup.stdout ?? '').trim().split(/\r?\n/).filter(Boolean);
  const entries = { npm: 'npm/bin/npm-cli.js', yarn: 'yarn/bin/yarn.js', pnpm: 'pnpm/bin/pnpm.cjs' };
  const candidates = [resolve(dirname(process.execPath), 'node_modules', entries[pm])];
  for (const launcher of launchers) {
    try {
      const actual = realpathSync(launcher);
      if (/\.[cm]?js$/.test(actual)) candidates.push(actual);
    } catch {}
    candidates.push(resolve(dirname(launcher), 'node_modules', entries[pm]), resolve(dirname(launcher), 'node_modules/corepack/dist', `${pm}.js`));
  }
  let entry = candidates.find(path => existsSync(path));
  if (pm === 'npm' && entry) {
    // Match npm's own shim: a globally upgraded CLI at its configured prefix wins.
    const prefixScript = resolve(dirname(entry), 'npm-prefix.js');
    if (existsSync(prefixScript)) {
      const probe = spawnSync(process.execPath, [prefixScript], { cwd: root, env, encoding: 'utf8', windowsHide: true, timeout: 5000 });
      if (probe.status === 0 && probe.stdout?.trim()) {
        const upgraded = resolve(probe.stdout.trim(), 'node_modules/npm/bin/npm-cli.js');
        if (existsSync(upgraded)) entry = upgraded;
      }
    }
  }
  if (entry) { command = process.execPath; argv = [entry, ...args]; }
  else if (process.platform === 'win32') {
    command = 'powershell.exe';
    argv = ['-NoProfile', '-NonInteractive', '-Command', '$s = $env:IHO_TOOLKIT_PROCESS | ConvertFrom-Json; $a = @($s.args); & $s.command @a; exit $LASTEXITCODE'];
    env.IHO_TOOLKIT_PROCESS = JSON.stringify({ command: `${pm}.cmd`, args });
  }
  return spawnSync(command, argv, { cwd: root, env, windowsHide: true, timeout, encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', maxBuffer: 4 * 1024 * 1024 });
}

export function scaffoldFiles({ extendsTsconfig }) {
  const ts = {
    ...(extendsTsconfig ? { extends: './tsconfig.json' } : {}),
    compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler',
      lib: ['ES2022', 'DOM', 'DOM.Iterable'], strict: true, skipLibCheck: true,
      types: ['vite/client', 'vitest/globals', 'node'], esModuleInterop: true,
      jsx: 'preserve', noEmit: true, ...(extendsTsconfig ? {} : { paths: { '@/*': ['./src/*'] } }) },
    include: ['tests/flows/**/*.ts', 'tests/flows/**/*.tsx', 'tests/flows/**/*.vue', 'tests/host/**/*.ts', 'tests/host/**/*.tsx', 'tests/host/**/*.vue', 'tests/support/**/*.ts'],
  };
  return [
    ['vitest.iho.config.ts', `import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  plugins: [vue(), vueJsx()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'happy-dom',
    include: ['tests/flows/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['./tests/support/iho-setup.ts'],
    passWithNoTests: false,
  },
});
`],
    ['tsconfig.iho-tests.json', JSON.stringify(ts, null, 2) + '\n'],
    ['tests/support/iho-http.ts', `import { setupServer } from 'msw/node';
export const server = setupServer();
`],
    ['tests/support/iho-setup.ts', `import '@testing-library/jest-dom/vitest';
import { beforeAll, afterEach, afterAll, expect } from 'vitest';
import { cleanup } from '@testing-library/vue';
import { server } from './iho-http';
const unexpected: string[] = [];
beforeAll(() => server.listen({ onUnhandledRequest(request, print) {
  unexpected.push(request.method + ' ' + request.url);
  print.error();
} }));
afterEach(() => {
  cleanup(); server.resetHandlers(); localStorage.clear(); sessionStorage.clear();
  expect(unexpected.splice(0), 'Unspecified network requests').toEqual([]);
});
afterAll(() => server.close());
`],
    ['tests/flows/.gitkeep', ''],
  ];
}

export function environmentFiles(directory) {
  return [
    [`${directory}/vitest.config.ts`, `import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('../../', import.meta.url)),
  plugins: [vue(), vueJsx()],
  resolve: { alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) } },
  test: {
    environment: 'happy-dom',
    include: [${JSON.stringify(directory + '/environment.test.ts')}],
    setupFiles: ['./tests/support/iho-setup.ts'],
    passWithNoTests: false,
  },
});
`],
    [`${directory}/tsconfig.json`, JSON.stringify({ extends: '../../tsconfig.iho-tests.json',
      include: ['./*.ts', './*.vue', '../support/**/*.ts'] }, null, 2) + '\n'],
    [`${directory}/Harness.vue`, `<script setup lang="ts">
import { ref } from 'vue';
const name = ref('');
const result = ref('');
async function save() {
  const response = await fetch('http://iho-test.invalid/profile', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.value }),
  });
  result.value = (await response.json()).message;
}
</script>
<template>
  <form @submit.prevent="save">
    <label>姓名<input v-model="name" /></label>
    <button type="submit">保存</button>
    <p role="status">{{ result }}</p>
  </form>
</template>
`],
    [`${directory}/environment.test.ts`, `import { test, expect } from 'vitest';
import { render, screen } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../support/iho-http';
import Harness from './Harness.vue';
test('环境：Vue 表单通过 HTTP 保存并显示响应', async () => {
  let received: unknown;
  server.use(http.post('http://iho-test.invalid/profile', async ({ request }) => {
    received = await request.json();
    return HttpResponse.json({ message: '保存成功' });
  }));
  const user = userEvent.setup();
  render(Harness);
  await user.type(screen.getByRole('textbox', { name: '姓名' }), '测试用户');
  await user.click(screen.getByRole('button', { name: '保存' }));
  expect(await screen.findByText('保存成功')).toBeVisible();
  expect(received).toEqual({ name: '测试用户' });
});
`],
  ];
}
