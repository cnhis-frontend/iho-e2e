import { mkdir, lstat, realpath, symlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const at = process.argv.indexOf('--to');
const destination = at >= 0 ? resolve(process.argv[at + 1]) : resolve(homedir(), '.agents/skills');
await mkdir(destination, { recursive: true });
for (const name of ['iho-test-bootstrap', 'iho-behavior-testing']) {
  const target = resolve(root, 'skills', name);
  const link = resolve(destination, name);
  let current;
  try { current = await lstat(link); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (current) {
    if (await realpath(link) !== await realpath(target)) throw new Error(`Existing skill differs; preserve it and choose another destination: ${link}`);
    console.log(`Unchanged: ${link}`);
  } else {
    await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
    console.log(`Installed: ${link}`);
  }
}
