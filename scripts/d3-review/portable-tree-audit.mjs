import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../d3-source-review/files.mjs';
import { parseCommit, parseTreeListing } from './offline-source-audit.mjs';

const upstreamReceiptPath = 'holdout/d3-upstream-commit-audit-20260928/receipt.json';
const upstreamReceiptSha256 = '8356a69a4bf8c5c54dbcc092b245fc8e60cfc3996d0791e1a2defcd5049f6b60';
const repositories = [
  'hyperdxio/hyperdx', 'amruthpillai/reactive-resume', 'ether/etherpad',
];
const oid = /^[a-f0-9]{40}$/u;
const deviceName = /^(?:CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|COM[1-9]|LPT[1-9])(?:\.|$)/iu;

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

/** Conservative Windows-path triage. A clean result is not a runnable tree. */
export function auditPortableTree(entries) {
  assert(entries instanceof Map, 'Parsed exact Git tree required');
  const incompatible = [], symlinks = [], folded = new Map();
  let regular = 0, longestPath = 0;
  for (const [path, entry] of entries) {
    assert(typeof path === 'string' && typeof entry === 'object');
    assert(['100644', '100755', '120000'].includes(entry.mode) && oid.test(entry.blob));
    longestPath = Math.max(longestPath, path.length);
    if (entry.mode === '120000') symlinks.push({ path, git_blob: entry.blob });
    else regular++;
    const reasons = [];
    if (path.includes('\uFFFD')) reasons.push('non-utf8-or-replacement-character');
    if (path.length > 240) reasons.push('path-length-over-240');
    for (const segment of path.split('/')) {
      if (!segment || segment === '.' || segment === '..') reasons.push('unsafe-segment');
      if (/[<>:"\\|?*\x00-\x1f]/u.test(segment)) reasons.push('windows-forbidden-character');
      if (/[. ]$/u.test(segment)) reasons.push('windows-trailing-dot-or-space');
      if (deviceName.test(segment)) reasons.push('windows-reserved-device-name');
    }
    if (reasons.length) incompatible.push({ path, reasons: [...new Set(reasons)].sort() });
    const foldedPath = path.normalize('NFC').toLowerCase();
    const prior = folded.get(foldedPath);
    if (prior && prior !== path) incompatible.push({ path, reasons: [`casefold-collision-with:${prior}`] });
    else folded.set(foldedPath, path);
  }
  incompatible.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  symlinks.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  return { tree_entries: entries.size, regular_files: regular,
    symlink_entries_not_followed: symlinks.length, symlinks,
    longest_path_characters: longestPath, incompatible_paths: incompatible,
    materialized: false, tool_executed: false };
}

/** Verify one exact public commit/tree before path triage; never check it out. */
export function auditCommit(record, directory) {
  assert(repositories.includes(record.repository) && oid.test(record.sha));
  assert(record.remote_commit_match === true && record.tree_match === true && record.parents_match === true);
  assert(typeof directory === 'string' && directory);
  const rawCommit = git(directory, ['cat-file', 'commit', record.sha]);
  assert.equal(sha256(rawCommit), record.local_commit_object_sha256, 'Raw commit bytes changed');
  const parsed = parseCommit(rawCommit, record.sha);
  assert.equal(parsed.tree, record.local_tree);
  assert.deepEqual(parsed.parents, record.local_parents);
  const entries = parseTreeListing(git(directory, ['ls-tree', '-r', '-z', record.sha]));
  return { repository: record.repository, commit: record.sha, root_tree: parsed.tree,
    ...auditPortableTree(entries) };
}

/** Public source metadata only. Neither source materialization nor D3 inference. */
export function buildPortableAudit(receipt, directories) {
  assert.equal(receipt.schema, 'd3-upstream-commit-audit/1');
  assert.equal(receipt.results.length, 93);
  assert.deepEqual(Object.keys(directories).sort(), [...repositories].sort());
  const seen = new Set(), commits = [];
  for (const record of receipt.results) {
    assert(repositories.includes(record.repository) && oid.test(record.sha));
    const key = JSON.stringify([record.repository, record.sha]);
    assert(!seen.has(key), 'Duplicate selected commit'); seen.add(key);
    const directory = directories[record.repository];
    commits.push(auditCommit(record, directory));
  }
  commits.sort((a, b) => JSON.stringify([a.repository, a.commit]).localeCompare(
    JSON.stringify([b.repository, b.commit]), 'en'));
  const summary = { selected_commits: commits.length,
    regular_file_occurrences: commits.reduce((sum, row) => sum + row.regular_files, 0),
    symlink_occurrences_not_followed: commits.reduce((sum, row) => sum + row.symlink_entries_not_followed, 0),
    incompatible_path_occurrences: commits.reduce((sum, row) => sum + row.incompatible_paths.length, 0),
    source_trees_materialized: 0, tool_predictions_executed: 0 };
  return { schema: 'd3-portable-tree-preflight/1', status: 'source-path-audit-only-not-runnable',
    upstream_receipt_sha256: upstreamReceiptSha256, summary, commits };
}

async function main(args) {
  assert(args.length === 5 && ['--write', '--check'].includes(args[0]),
    'Usage: portable-tree-audit.mjs --write|--check OUTPUT HYPERDX_GIT REACTIVE_RESUME_GIT ETHERPAD_GIT');
  const receiptBytes = await readFile(resolve(upstreamReceiptPath));
  assert.equal(sha256(receiptBytes), upstreamReceiptSha256, 'Selected upstream receipt changed');
  const directories = Object.fromEntries(repositories.map((name, index) => [name, resolve(args[index + 2])]));
  const result = buildPortableAudit(JSON.parse(receiptBytes), directories);
  const bytes = Buffer.from(`${JSON.stringify(result, null, 2)}\n`);
  if (args[0] === '--write') await writeFile(resolve(args[1]), bytes, { flag: 'wx' });
  else assert.deepEqual(await readFile(resolve(args[1])), bytes, 'Retained portable-tree preflight changed');
  process.stdout.write(`${JSON.stringify(result.summary)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch(error => { console.error(error); process.exitCode = 1; });
}
