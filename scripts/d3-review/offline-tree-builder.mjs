import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
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
  const foldedPrefixes = new Map();
  for (const path of entries.keys()) {
    const parts = path.split('/');
    assert(!parts.some(part => part.toLowerCase() === '.git'), 'Embedded Git metadata path is forbidden');
    for (let index = 1; index <= parts.length; index++) {
      const prefix = parts.slice(0, index).join('/');
      const key = prefix.normalize('NFC').toLowerCase();
      const prior = foldedPrefixes.get(key);
      assert(!prior || prior === prefix, 'Case-folded directory or file path collision');
      foldedPrefixes.set(key, prefix);
      if (index < parts.length) {
        assert(!entries.has(prefix), 'A file cannot be a path ancestor');
      }
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

/** Verify retained bytes against an externally recorded receipt SHA-256, without following links. */
export async function verifyOfflineTree(outputDirectory, expectedReceiptSha256) {
  assert(/^[a-f0-9]{64}$/u.test(expectedReceiptSha256), 'Expected receipt SHA-256 is required');
  const root = resolve(outputDirectory);
  const rootInfo = await lstat(root);
  assert(rootInfo.isDirectory() && !rootInfo.isSymbolicLink(), 'Output root must be a real directory');
  const receiptInfo = await lstat(join(root, receiptName));
  assert(receiptInfo.isFile() && !receiptInfo.isSymbolicLink() && receiptInfo.nlink === 1,
    'Retained receipt must be a regular unlinked file');
  const receiptBytes = await readFile(join(root, receiptName));
  assert.equal(sha256(receiptBytes), expectedReceiptSha256, 'Retained receipt bytes changed');
  const receipt = JSON.parse(receiptBytes);
  assert.equal(receipt.schema, 'd3-offline-tree-build/1');
  assert.equal(receipt.status, 'source-input-only-not-study-run');
  assert.equal(receipt.source_receipt_sha256, sourceReceiptSha256);
  assert(oid.test(receipt.commit) && oid.test(receipt.root_tree));
  assert.equal(receipt.tools_executed, false);
  assert.equal(receipt.labels_created, false);
  assert(Array.isArray(receipt.files) && Array.isArray(receipt.symlinks_not_materialized));
  assert.equal(receipt.files_written, receipt.files.length);
  const expected = new Map(), tree = new Map(), directories = new Set();
  for (const file of receipt.files) {
    assert(typeof file.path === 'string' && Number.isSafeInteger(file.bytes) && file.bytes >= 0);
    assert(/^[a-f0-9]{64}$/u.test(file.sha256) && !expected.has(file.path));
    expected.set(file.path, file);
    tree.set(file.path, { mode: file.mode, blob: file.git_blob });
    const parts = file.path.split('/');
    for (let index = 1; index < parts.length; index++) {
      directories.add(parts.slice(0, index).join('/'));
    }
  }
  for (const link of receipt.symlinks_not_materialized) {
    assert(typeof link.path === 'string' && !tree.has(link.path));
    tree.set(link.path, { mode: '120000', blob: link.git_blob });
  }
  validateMaterializableTree(tree);
  const found = new Set(), stack = [root];
  while (stack.length) {
    const directory = stack.pop();
    for (const name of await readdir(directory)) {
      const candidate = join(directory, name);
      const info = await lstat(candidate);
      assert(!info.isSymbolicLink(), 'Materialized tree contains a symlink');
      const path = relative(root, candidate).split(sep).join('/');
      if (info.isDirectory()) {
        assert(directories.has(path), `Unexpected directory: ${path}`);
        stack.push(candidate);
      } else {
        assert(info.isFile() && info.nlink === 1, `Nonregular or linked file: ${path}`);
        if (path === receiptName) continue;
        const file = expected.get(path);
        assert(file && !found.has(path), `Unexpected or duplicate file: ${path}`);
        const bytes = await readFile(candidate);
        assert.equal(bytes.length, file.bytes, `File length changed: ${path}`);
        assert.equal(sha256(bytes), file.sha256, `File bytes changed: ${path}`);
        found.add(path);
      }
    }
  }
  assert.equal(found.size, expected.size, 'Materialized source file is missing');
  return { repository: receipt.repository, commit: receipt.commit,
    verified_regular_files: found.size, symlinks_not_materialized: receipt.symlinks_not_materialized.length,
    tools_executed: false, labels_created: false };
}

async function main(args) {
  if (args[0] === 'verify') {
    assert.equal(args.length, 3, 'Usage: offline-tree-builder.mjs verify OUTPUT_DIR RECEIPT_SHA256');
    process.stdout.write(`${JSON.stringify(await verifyOfflineTree(args[1], args[2]))}\n`);
    return;
  }
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
