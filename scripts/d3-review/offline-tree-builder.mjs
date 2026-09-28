import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitId, sha256 } from '../d3-source-review/files.mjs';
import { parseCommit, parseTreeListing } from './offline-source-audit.mjs';
import { auditPortableTree } from './portable-tree-audit.mjs';

const sourceReceipt = 'holdout/d3-upstream-commit-audit-20260928/receipt.json';
const sourceReceiptSha256 = '8356a69a4bf8c5c54dbcc092b245fc8e60cfc3996d0791e1a2defcd5049f6b60';
const receiptName = '.archsync-tree-receipt.json';
const oid = /^[a-f0-9]{40}$/u;

export function validateMaterializableTree(entries) {
  const audit = auditPortableTree(entries);
  assert.equal(audit.incompatible_paths.length, 0, 'Tree contains unsafe or nonportable paths');
  assert(!entries.has(receiptName), 'Source tree collides with the builder receipt');
  for (const path of entries.keys()) {
    const parts = path.split('/');
    assert(!parts.some(part => part.toLowerCase() === '.git'), 'Embedded Git metadata path is forbidden');
    for (let index = 1; index < parts.length; index++) {
      assert(!entries.has(parts.slice(0, index).join('/')), 'A file cannot be a path ancestor');
    }
  }
  return audit;
}

function git(directory, args) {
  const result = spawnSync('git', ['--no-replace-objects', `--git-dir=${directory}`, ...args], {
    shell: false, windowsHide: true, timeout: 30000, maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_ALLOW_PROTOCOL: '',
      GIT_TERMINAL_PROMPT: '0' },
  });
  assert(!result.error && result.status === 0,
    `Offline Git read failed (${args.join(' ')}): ${result.stderr?.toString('utf8').slice(0, 300)}`);
  return result.stdout;
}

/** A newly created directory is the only write target. On failure it is retained without a receipt. */
export async function buildOfflineTree(record, gitDirectory, outputDirectory) {
  assert(record && typeof record.repository === 'string' && oid.test(record.sha));
  assert(record.remote_commit_match === true && record.tree_match === true &&
    record.parents_match === true, 'Upstream identity was not corroborated');
  assert.equal(git(gitDirectory, ['rev-parse', '--is-bare-repository']).toString('utf8').trim(),
    'true', 'An isolated bare Git object store is required');
  const commitBytes = git(gitDirectory, ['cat-file', 'commit', record.sha]);
  assert.equal(sha256(commitBytes), record.local_commit_object_sha256, 'Raw commit bytes changed');
  const commit = parseCommit(commitBytes, record.sha);
  assert.equal(commit.tree, record.local_tree, 'Root tree differs from the pinned receipt');
  assert.deepEqual(commit.parents, record.local_parents, 'Ordered parents differ from the pinned receipt');
  const entries = parseTreeListing(git(gitDirectory, ['ls-tree', '-r', '-z', record.sha]));
  const audit = validateMaterializableTree(entries);
  const root = resolve(outputDirectory);
  await mkdir(root); // Fails if the target already exists. Never overlays another checkout.
  const files = [];
  for (const [path, entry] of [...entries].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    if (entry.mode === '120000') continue; // Retain identity in receipt, never follow or create links.
    const bytes = git(gitDirectory, ['cat-file', 'blob', entry.blob]);
    assert.equal(gitId('blob', bytes), entry.blob, `Blob identity changed: ${path}`);
    const destination = join(root, ...path.split('/'));
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes, { flag: 'wx', mode: entry.mode === '100755' ? 0o755 : 0o644 });
    assert.deepEqual(await readFile(destination), bytes, `Written bytes changed: ${path}`);
    files.push({ path, mode: entry.mode, git_blob: entry.blob,
      sha256: sha256(bytes), bytes: bytes.length });
  }
  const receipt = { schema: 'd3-offline-tree-build/1', status: 'source-input-only-not-study-run',
    source_receipt_sha256: sourceReceiptSha256, repository: record.repository,
    commit: record.sha, root_tree: commit.tree, files,
    symlinks_not_materialized: audit.symlinks,
    files_written: files.length, tools_executed: false, labels_created: false };
  await writeFile(join(root, receiptName), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  return receipt;
}

async function main(args) {
  assert(args.length === 4,
    'Usage: offline-tree-builder.mjs REPOSITORY COMMIT BARE_GIT_DIR NEW_OUTPUT_DIR');
  const [repository, commit, gitDirectory, outputDirectory] = args;
  const receiptBytes = await readFile(resolve(sourceReceipt));
  assert.equal(sha256(receiptBytes), sourceReceiptSha256, 'Pinned source receipt changed');
  const receipt = JSON.parse(receiptBytes);
  assert.equal(receipt.schema, 'd3-upstream-commit-audit/1');
  const records = receipt.results.filter(row => row.repository === repository && row.sha === commit);
  assert.equal(records.length, 1, 'Repository/commit not in the pinned D3 source set');
  const result = await buildOfflineTree(records[0], resolve(gitDirectory), outputDirectory);
  process.stdout.write(`${JSON.stringify({ repository, commit, files: result.files_written,
    symlinks_not_materialized: result.symlinks_not_materialized.length })}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch(error => { console.error(error); process.exitCode = 1; });
}
