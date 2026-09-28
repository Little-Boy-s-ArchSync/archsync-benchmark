import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFile, copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');
const script = join(root, 'scripts/verify-d3-package-preflight.mjs');
const guardian = join(root, 'holdout/d3-package-archives/archsync-guardian-0.3.3.tgz');
const comparator = join(root, 'holdout/d3-package-archives/dependency-cruiser-18.3.0.tgz');
const verify = (guardianPath) => spawnSync(process.execPath, [script, guardianPath, comparator], {
  cwd: root, encoding: 'utf8', shell: false, timeout: 30000, maxBuffer: 1024 * 1024,
});

test('retained candidate archives match source provenance, package identities and comparator lockfile', () => {
  const result = verify(guardian);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS: candidate D3 archive bytes/);
  assert.match(result.stdout, /NOT A D3 METHOD FREEZE OR RESEARCH RESULT/);
});

test('altered retained archive cannot pass the package gate', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'd3-archive-packet-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const altered = join(dir, 'archsync-guardian-0.3.3.tgz');
  await copyFile(guardian, altered);
  await appendFile(altered, 'x');
  const result = verify(altered);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /byte count/);
});
