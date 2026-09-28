import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { test } from 'node:test';
import { auditCommit, auditPortableTree } from '../scripts/d3-review/portable-tree-audit.mjs';

const blob = 'a'.repeat(40);
const entry = mode => ({ mode, blob });

test('portable tree audit counts regular files but never materializes or executes', () => {
  const result = auditPortableTree(new Map([
    ['src/index.ts', entry('100644')],
    ['scripts/build.ts', entry('100755')],
  ]));
  assert.equal(result.tree_entries, 2);
  assert.equal(result.regular_files, 2);
  assert.equal(result.symlink_entries_not_followed, 0);
  assert.deepEqual(result.incompatible_paths, []);
  assert.equal(result.materialized, false);
  assert.equal(result.tool_executed, false);
});

test('symlink is recorded by Git blob identity without following it', () => {
  const result = auditPortableTree(new Map([
    ['CLAUDE.md', entry('120000')],
    ['src/index.ts', entry('100644')],
  ]));
  assert.equal(result.regular_files, 1);
  assert.deepEqual(result.symlinks, [{ path: 'CLAUDE.md', git_blob: blob }]);
  assert.equal(result.symlink_entries_not_followed, 1);
});

test('Windows path hazards and aliases remain explicit rather than silently normalizing', () => {
  const result = auditPortableTree(new Map([
    ['src/A.ts', entry('100644')],
    ['src/a.ts', entry('100644')],
    ['docs/CON.txt', entry('100644')],
    ['bad/name?.ts', entry('100644')],
    ['bad/trailing. ', entry('100644')],
    [`long/${'x'.repeat(241)}.ts`, entry('100644')],
  ]));
  assert(result.incompatible_paths.some(row => row.path === 'src/a.ts' &&
    row.reasons.includes('casefold-collision-with:src/A.ts')));
  assert(result.incompatible_paths.some(row => row.path === 'docs/CON.txt' &&
    row.reasons.includes('windows-reserved-device-name')));
  assert(result.incompatible_paths.some(row => row.path === 'bad/name?.ts' &&
    row.reasons.includes('windows-forbidden-character')));
  assert(result.incompatible_paths.some(row => row.path === 'bad/trailing. ' &&
    row.reasons.includes('windows-trailing-dot-or-space')));
  assert(result.incompatible_paths.some(row => row.path.startsWith('long/') &&
    row.reasons.includes('path-length-over-240')));
});

test('unexpected Git entry mode or object ID is rejected', () => {
  assert.throws(() => auditPortableTree(new Map([['submodule', entry('160000')]])));
  assert.throws(() => auditPortableTree(new Map([['src/index.ts', { mode: '100644', blob: 'not-an-oid' }]])));
});

test('offline Git fixture verifies exact commit bytes and tree before path triage', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'archsync-d3-tree-'));
  const git = (args, options = {}) => {
    const result = spawnSync('git', ['-C', directory, ...args], {
      shell: false, windowsHide: true, ...options,
    });
    assert.equal(result.status, 0, result.stderr?.toString('utf8'));
    return result.stdout;
  };
  try {
    git(['init', '-q']);
    await mkdir(join(directory, 'src'));
    await writeFile(join(directory, 'src', 'index.ts'), 'export const n = 1;\n');
    git(['add', 'src/index.ts']);
    git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
      'commit', '-qm', 'source-only fixture']);
    const sha = git(['rev-parse', 'HEAD']).toString('utf8').trim();
    const tree = git(['rev-parse', 'HEAD^{tree}']).toString('utf8').trim();
    const raw = git(['cat-file', 'commit', sha]);
    const record = { repository: 'hyperdxio/hyperdx', sha,
      local_commit_object_sha256: createHash('sha256').update(raw).digest('hex'),
      local_tree: tree, local_parents: [], remote_commit_match: true,
      tree_match: true, parents_match: true };
    const report = auditCommit(record, join(directory, '.git'));
    assert.equal(report.commit, sha);
    assert.equal(report.root_tree, tree);
    assert.equal(report.regular_files, 1);
    assert.equal(report.materialized, false);
    assert.throws(() => auditCommit({ ...record, local_tree: '0'.repeat(40) }, join(directory, '.git')));
    assert.throws(() => auditCommit({ ...record, local_commit_object_sha256: '0'.repeat(64) }, join(directory, '.git')));
  } finally {
    assert(resolve(directory).startsWith(`${resolve(tmpdir())}${sep}`), 'Temporary cleanup escaped OS temp');
    await rm(directory, { recursive: true });
  }
});

test('retained 93-commit receipt pins source-only output with no runnable claim', async () => {
  const bytes = await readFile(new URL('../holdout/d3-portable-tree-preflight-20260928/receipt.json', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),
    '09c60fe18a12e5bd5292e360ec50c9a402afbd62378be9499e396a3e8c19bfee');
  const receipt = JSON.parse(bytes);
  assert.equal(receipt.schema, 'd3-portable-tree-preflight/1');
  assert.equal(receipt.status, 'source-path-audit-only-not-runnable');
  assert.equal(receipt.summary.selected_commits, 93);
  assert.equal(receipt.summary.regular_file_occurrences, 128656);
  assert.equal(receipt.summary.symlink_occurrences_not_followed, 32);
  assert.equal(receipt.summary.incompatible_path_occurrences, 0);
  assert.equal(receipt.summary.source_trees_materialized, 0);
  assert.equal(receipt.summary.tool_predictions_executed, 0);
  assert(receipt.commits.every(row => row.materialized === false && row.tool_executed === false));
});
