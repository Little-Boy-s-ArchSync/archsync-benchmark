import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import test from 'node:test';
import { auditSources, parseCommit, parseTreeListing } from '../scripts/d3-review/offline-source-audit.mjs';
import { gitId, sha256 } from '../scripts/d3-source-review/files.mjs';

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test('commit and tree parsing verify Git identity, modes and safe paths', () => {
  const raw = Buffer.from(`tree ${'a'.repeat(40)}\nparent ${'b'.repeat(40)}\nauthor Test <test@example.org> 0 +0000\n\nmessage\n`);
  assert.deepEqual(parseCommit(raw, gitId('commit', raw)), {
    tree: 'a'.repeat(40), parents: ['b'.repeat(40)],
  });
  assert.throws(() => parseCommit(raw, '0'.repeat(40)), /identity mismatch/u);
  const listing = Buffer.from(`100644 blob ${'c'.repeat(40)}\tsrc/a.ts\0` +
    `120000 blob ${'d'.repeat(40)}\tCLAUDE.md\0`);
  assert.equal(parseTreeListing(listing).get('CLAUDE.md').mode, '120000');
  assert.throws(() => parseTreeListing(Buffer.from(`160000 commit ${'c'.repeat(40)}\tsub\0`)),
    /Unsupported Git tree/u);
  assert.throws(() => parseTreeListing(Buffer.from(`100644 blob ${'c'.repeat(40)}\t..\/escape\0`)),
    /Unsafe Git path/u);
});

test('offline audit matches pinned side bytes and fails closed on a changed source hash', async () => {
  const root = await mkdtemp(join(tmpdir(), 'archsync-offline-source-audit-'));
  assert(resolve(root).startsWith(resolve(tmpdir()) + sep), 'Temporary test directory escaped temp root');
  try {
    const source = join(root, 'source'), bare = join(root, 'bare.git');
    await mkdir(join(source, 'src'), { recursive: true });
    git(['init', '-q', source]);
    git(['-C', source, 'config', 'user.name', 'Audit Test']);
    git(['-C', source, 'config', 'user.email', 'audit@example.org']);
    const bytes = Buffer.from('export const value = 1;\n');
    await writeFile(join(source, 'src', 'a.ts'), bytes);
    git(['-C', source, 'add', '--', 'src/a.ts']);
    git(['-C', source, 'commit', '-q', '-m', 'source fixture']);
    git(['clone', '--bare', '-q', source, bare]);
    const commit = git(['-C', source, 'rev-parse', 'HEAD']);
    const tree = git(['-C', source, 'rev-parse', 'HEAD^{tree}']);
    const blob = git(['-C', source, 'rev-parse', 'HEAD:src/a.ts']);
    assert.deepEqual(await readFile(join(source, 'src', 'a.ts')), bytes);
    const result = { sha: commit, local_tree: tree, local_parents: [],
      remote_commit_match: true, tree_match: true, parents_match: true };
    const receipt = { schema: 'd3-upstream-commit-audit/1', kit_sha256: 'e'.repeat(64),
      results: ['hyperdxio/hyperdx', 'amruthpillai/reactive-resume', 'ether/etherpad']
        .map(repository => ({ repository, ...result })) };
    const present = side => ({ side, commit, path: 'src/a.ts', source_status: 'present-regular',
      tree_mode: '100644', git_blob: blob, sha256: sha256(bytes) });
    const absent = { side: 'base', commit, path: 'src/missing.ts', source_status: 'absent-at-side',
      tree_mode: 'absent', git_blob: null, sha256: null };
    const inventory = { schema: 'd3-file-side-preparation/1', cases_sha256: receipt.kit_sha256,
      cases: [{ repository: 'hyperdxio/hyperdx', file_sides: [present('base'), present('head'), absent] }] };
    const dirs = Object.fromEntries(receipt.results.map(row => [row.repository, bare]));
    const report = auditSources(receipt, inventory, dirs);
    assert.deepEqual(report.totals, { commits: 3, file_sides_matched: 3,
      present_regular_file_sides_matched: 2, absent_file_sides_matched: 1,
      symlink_entries_not_followed: 0 });
    assert.equal(report.claims.study_tool_predictions_executed, false);
    const changed = structuredClone(inventory);
    changed.cases[0].file_sides[0].sha256 = '0'.repeat(64);
    assert.throws(() => auditSources(receipt, changed, dirs), /Source SHA-256 differs/u);
    const changedCommit = structuredClone(receipt);
    changedCommit.results[0].local_tree = '0'.repeat(40);
    assert.throws(() => auditSources(changedCommit, inventory, dirs), /Root tree differs/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
