import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitId, sha256 } from '../d3-source-review/files.mjs';

const receiptPin = '8356a69a4bf8c5c54dbcc092b245fc8e60cfc3996d0791e1a2defcd5049f6b60';
const inventoryPin = 'c629044a356c2a83a1a28eb85078f813b227862a088e64476674e1c54f06f68a';
const repositories = [
  'hyperdxio/hyperdx', 'amruthpillai/reactive-resume', 'ether/etherpad',
];
const oid = value => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);

function git(directory, args, input) {
  const result = spawnSync('git', [`--git-dir=${directory}`, ...args], {
    input, env: { ...process.env, GIT_NO_LAZY_FETCH: '1' },
    timeout: 30000, maxBuffer: 64 * 1024 * 1024, shell: false,
  });
  assert(!result.error && result.status === 0,
    `Offline Git read failed (${args.join(' ')}): ${result.stderr?.toString('utf8').slice(0, 500)}`);
  return result.stdout;
}

export function parseCommit(bytes, expectedOid) {
  assert(oid(expectedOid) && gitId('commit', bytes) === expectedOid, 'Git commit object identity mismatch');
  const header = bytes.toString('utf8').split('\n\n', 1)[0];
  const tree = /^tree ([a-f0-9]{40})$/mu.exec(header)?.[1];
  assert(tree, 'Commit root tree missing');
  return { tree, parents: [...header.matchAll(/^parent ([a-f0-9]{40})$/gmu)].map(match => match[1]) };
}

export function parseTreeListing(bytes) {
  const text = bytes.toString('utf8');
  assert(text.endsWith('\0'), 'Tree listing must be NUL terminated');
  const entries = new Map();
  for (const row of text.slice(0, -1).split('\0')) {
    const match = /^(100644|100755|120000) blob ([a-f0-9]{40})\t([^\0]+)$/u.exec(row);
    assert(match, 'Unsupported Git tree entry or mode');
    const [, mode, blob, path] = match;
    assert(!path.startsWith('/') && !path.includes('\\') &&
      path.split('/').every(part => part && part !== '.' && part !== '..'), 'Unsafe Git path');
    assert(!entries.has(path), 'Duplicate Git tree path');
    entries.set(path, { mode, blob });
  }
  return entries;
}

function checkBlobsOffline(directory, blobIds) {
  const ids = [...blobIds].sort();
  if (ids.length === 0) return 0;
  const lines = git(directory, ['cat-file', '--batch-check'], `${ids.join('\n')}\n`)
    .toString('utf8').trimEnd().split('\n');
  assert.equal(lines.length, ids.length, 'Incomplete offline blob check');
  for (let i = 0; i < ids.length; i++) {
    assert(new RegExp(`^${ids[i]} blob [0-9]+$`, 'u').test(lines[i]),
      `Missing or non-blob Git object: ${ids[i]}`);
  }
  return ids.length;
}

/** Source provenance only. It never executes a project, analyzer or comparator. */
export function auditSources(receipt, inventory, gitDirectories, inputHashes = {}) {
  assert.equal(receipt.schema, 'd3-upstream-commit-audit/1');
  assert.equal(inventory.schema, 'd3-file-side-preparation/1');
  assert.equal(receipt.kit_sha256, inventory.cases_sha256, 'Selected source packet mismatch');
  assert(receipt.results.length > 0 && inventory.cases.length > 0);
  const rowsByRepo = new Map();
  const resultByRepo = new Map(repositories.map(id => [id, []]));
  for (const row of receipt.results) {
    assert(resultByRepo.has(row.repository) && oid(row.sha) && row.passed !== false);
    resultByRepo.get(row.repository).push(row);
  }
  for (const studyCase of inventory.cases) {
    assert(resultByRepo.has(studyCase.repository));
    const rows = rowsByRepo.get(studyCase.repository) ?? [];
    rows.push(...studyCase.file_sides);
    rowsByRepo.set(studyCase.repository, rows);
  }
  const reports = [];
  for (const repository of repositories) {
    const directory = gitDirectories[repository];
    assert(typeof directory === 'string' && directory, `Missing Git object store: ${repository}`);
    assert.equal(git(directory, ['rev-parse', '--is-bare-repository']).toString('utf8').trim(), 'true',
      'Use an isolated bare Git object store');
    const commits = resultByRepo.get(repository);
    const trees = new Map(), blobIds = new Set(), seen = new Set();
    let treeEntries = 0, symlinks = 0;
    for (const record of commits) {
      assert(!seen.has(record.sha), 'Duplicate audited commit'); seen.add(record.sha);
      assert(record.remote_commit_match === true && record.tree_match === true && record.parents_match === true,
        'Upstream commit provenance not accepted');
      const actual = parseCommit(git(directory, ['cat-file', 'commit', record.sha]), record.sha);
      assert.equal(actual.tree, record.local_tree, 'Root tree differs from upstream receipt');
      assert.deepEqual(actual.parents, record.local_parents, 'Ordered parents differ from upstream receipt');
      const entries = parseTreeListing(git(directory, ['ls-tree', '-r', '-z', record.sha]));
      trees.set(record.sha, entries); treeEntries += entries.size;
      for (const entry of entries.values()) {
        blobIds.add(entry.blob);
        if (entry.mode === '120000') symlinks++;
      }
    }
    const offlineBlobs = checkBlobsOffline(directory, blobIds);
    const sourceHashes = new Map();
    let present = 0, absent = 0;
    for (const row of rowsByRepo.get(repository) ?? []) {
      const entry = trees.get(row.commit)?.get(row.path);
      assert(trees.has(row.commit), 'File-side commit absent from provenance receipt');
      if (row.source_status === 'absent-at-side') {
        assert(!entry && row.tree_mode === 'absent' && row.git_blob === null && row.sha256 === null,
          'Absent file-side disagrees with upstream tree');
        absent++; continue;
      }
      assert.equal(row.source_status, 'present-regular');
      assert(entry && ['100644', '100755'].includes(entry.mode), 'Expected regular source file');
      assert.equal(entry.mode, row.tree_mode);
      assert.equal(entry.blob, row.git_blob, 'File-side Git blob differs from upstream tree');
      let digest = sourceHashes.get(entry.blob);
      if (!digest) {
        const bytes = git(directory, ['cat-file', 'blob', entry.blob]);
        assert.equal(gitId('blob', bytes), entry.blob, 'Source Git blob identity mismatch');
        digest = sha256(bytes); sourceHashes.set(entry.blob, digest);
      }
      assert.equal(digest, row.sha256, 'Source SHA-256 differs from captured packet');
      present++;
    }
    reports.push({ repository, commits: commits.length, case_commit_tree_entries: treeEntries,
      unique_blobs_available_offline: offlineBlobs, symlink_entries_not_followed: symlinks,
      present_regular_file_sides_matched: present, absent_file_sides_matched: absent,
      unique_file_side_blobs_rehashed: sourceHashes.size });
  }
  return { schema: 'd3-offline-source-audit/1', status: 'source-provenance-only-not-d3-result',
    inputs: { upstream_receipt_sha256: inputHashes.receipt ?? null,
      file_side_inventory_sha256: inputHashes.inventory ?? null,
      selected_cases_sha256: inventory.cases_sha256 },
    repositories: reports,
    totals: {
      commits: reports.reduce((sum, row) => sum + row.commits, 0),
      file_sides_matched: reports.reduce((sum, row) => sum + row.present_regular_file_sides_matched + row.absent_file_sides_matched, 0),
      present_regular_file_sides_matched: reports.reduce((sum, row) => sum + row.present_regular_file_sides_matched, 0),
      absent_file_sides_matched: reports.reduce((sum, row) => sum + row.absent_file_sides_matched, 0),
      symlink_entries_not_followed: reports.reduce((sum, row) => sum + row.symlink_entries_not_followed, 0),
    },
    claims: { selected_file_side_bytes_verified: true, historical_blob_objects_available_offline: true,
      project_code_executed: false,
      study_tool_predictions_executed: false, truth_labels_created: false,
      effective_project_configs_accepted: false, method_frozen: false, research_complete: false } };
}

async function main(args) {
  assert(args.length === 5 && ['--write', '--check'].includes(args[0]),
    'Usage: offline-source-audit.mjs --write|--check OUTPUT HYPERDX_GIT REACTIVE_GIT ETHERPAD_GIT');
  const [mode, output, hyperdx, reactive, etherpad] = args;
  const receiptBytes = await readFile(resolve('holdout/d3-upstream-commit-audit-20260928/receipt.json'));
  const inventoryBytes = await readFile(resolve('holdout/d3-file-side-preparation/inventory.json'));
  assert.equal(sha256(receiptBytes), receiptPin, 'Upstream provenance receipt changed');
  assert.equal(sha256(inventoryBytes), inventoryPin, 'File-side inventory changed');
  const report = auditSources(JSON.parse(receiptBytes), JSON.parse(inventoryBytes), {
    'hyperdxio/hyperdx': hyperdx, 'amruthpillai/reactive-resume': reactive, 'ether/etherpad': etherpad,
  }, { receipt: receiptPin, inventory: inventoryPin });
  assert.equal(report.totals.commits, 93);
  assert.equal(report.totals.file_sides_matched, 300);
  const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
  if (mode === '--write') await writeFile(output, bytes, { flag: 'wx' });
  else assert.deepEqual(await readFile(output), bytes, 'Retained source audit changed');
  process.stdout.write(`${JSON.stringify(report.totals)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch(error => { console.error(error); process.exitCode = 1; });
}
