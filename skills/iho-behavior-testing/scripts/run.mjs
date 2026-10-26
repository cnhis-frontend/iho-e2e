import { existsSync } from 'node:fs';
const bundled = new URL('../../iho-test-bootstrap/toolkit/bin/iho-test.mjs', import.meta.url);
await import(existsSync(bundled) ? bundled.href : new URL('../../../bin/iho-test.mjs', import.meta.url).href);
