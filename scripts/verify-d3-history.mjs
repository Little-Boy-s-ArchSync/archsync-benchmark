import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

const [directory] = process.argv.slice(2);
assert(directory && isAbsolute(directory), 'Usage: node scripts/verify-d3-history.mjs ABS_HISTORY_DIRECTORY');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const planBytes = await readFile(join(directory, 'history-collection-plan.json'));
const plan = JSON.parse(planBytes);
const summary = JSON.parse(await readFile(join(directory, 'history-summary.json')));
assert.equal(hash(planBytes), summary.plan_sha256);
assert.equal(plan.limit_per_repository, 20);
for (const key of ['predictions_executed', 'labels_present', 'research_complete']) assert.equal(summary[key], false);
assert.deepEqual(summary.receipts.map((receipt) => receipt.repository), plan.repositories.map((repo) => repo.id));
let candidates = 0;
let unresolvedParents = 0;
let failedRepositories = 0;
for (const receipt of summary.receipts) {
  const folder = join(directory, receipt.repository.replace('/', '--'));
  assert.deepEqual(JSON.parse(await readFile(join(folder, 'history-receipt.json'))), receipt);
  const repo = plan.repositories.find((entry) => entry.id === receipt.repository);
  assert.equal(receipt.pinned_head, repo.commit);
  assert.equal(receipt.scope, repo.scope);
  if (receipt.status === 'HISTORY_CAPTURE_FAILED') { failedRepositories += 1; continue; }
  assert.equal(receipt.status, 'HISTORY_METADATA_CAPTURED_NOT_CASE_LABELS');
  const bytes = await readFile(join(folder, 'raw-commits.json'));
  assert.equal(hash(bytes), receipt.raw_sha256);
  const raw = JSON.parse(bytes);
  assert.equal(raw.length, receipt.records.length);
  assert(raw.length <= 20);
  assert.equal(new Set(raw.map((entry) => entry.sha)).size, raw.length);
  for (const [index, entry] of raw.entries()) {
    const row = receipt.records[index];
    assert.equal(row.candidate_id, `${repo.id.replace('/', '--')}-H${String(index + 1).padStart(3, '0')}`);
    assert.equal(row.commit, entry.sha);
    assert.deepEqual(row.parents, entry.parents.map((parent) => parent.sha));
    assert.equal(row.subject, entry.commit.message.split('\n')[0]);
    assert.equal(row.committed_at, entry.commit.committer.date);
    assert.equal(row.comparison_parent, row.parents.length === 1 ? row.parents[0] : null);
    assert.equal(row.merge_or_root_requires_review, row.parents.length !== 1);
    assert.equal(row.human_decision, null);
    assert.equal(row.source_snapshots_captured, false);
    candidates += 1;
    if (row.merge_or_root_requires_review) unresolvedParents += 1;
  }
}
console.log(JSON.stringify({ status: 'HISTORY_METADATA_VERIFIED_NOT_EVALUATION', repositories: summary.receipts.length, candidate_commits: candidates,
  merge_or_root_candidates: unresolvedParents, failed_repositories: failedRepositories, labels: 0, predictions: 0, research_complete: false }, null, 2));
