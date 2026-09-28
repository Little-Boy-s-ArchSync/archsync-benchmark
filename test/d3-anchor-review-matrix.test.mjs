import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { sha256 } from '../scripts/d3-source-review/files.mjs';
import { buildAnchorReviewMatrix } from '../scripts/d3-review/anchor-review-matrix.mjs';

function fixture() {
  const rows = Array.from({ length: 152 }, (_, index) => ({
    repository: 'fixture/repo', case_id: `CASE-${String(index).padStart(3, '0')}`,
    rule_id: 'RULE-1', side: index % 2 ? 'head' : 'base',
    commit: index % 2 ? 'a'.repeat(40) : 'b'.repeat(40), applicability: null,
    human_verification: 'pending-both-authors',
    anchors: [{ path: 'src/model.ts', mode: '100644', git_blob: index < 100 ?
      'c'.repeat(40) : 'd'.repeat(40), sha256: 'e'.repeat(64) }],
  }));
  const ledger = { schema: 'd3-proposed-applicability-evidence/1',
    status: 'ai-proposed-not-human-verified', labels_created: false,
    predictions_executed: false, human_acceptances: [], rows };
  const candidates = { schema: 'd3-historical-production-role-candidates/1',
    status: 'lexical-path-filter-only-not-applicability',
    rows: rows.map(row => ({ repository: row.repository, case_id: row.case_id,
      rule_id: row.rule_id, side: row.side, commit: row.commit,
      source_candidate_paths: 2, target_candidate_paths: 3,
      historical_role_verified: false, rule_applicability: null,
      truth_label: null, tool_prediction: null })) };
  return { ledger, candidates };
}

test('same anchor bytes group for reading but preserve every unresolved case-side', () => {
  const { ledger, candidates } = fixture();
  const result = buildAnchorReviewMatrix(ledger, candidates);
  assert.deepEqual(result.summary, { source_rows: 152, anchor_groups: 2,
    distinct_anchor_blobs: 2, author_decisions: 0, truth_labels: 0, tool_predictions: 0 });
  assert.deepEqual(result.groups.map(group => group.members.length).sort((a, b) => a - b), [52, 100]);
  assert(result.groups.every(group => group.group_review_status === 'unreviewed-not-a-row-decision'));
  assert(result.groups.flatMap(group => group.members).every(member => member.applicability === null));
});

test('missing or prematurely decided candidate rows fail closed', () => {
  const { ledger, candidates } = fixture();
  candidates.rows.pop();
  assert.throws(() => buildAnchorReviewMatrix(ledger, candidates), /152/u);
  candidates.rows.push(structuredClone(candidates.rows[0]));
  assert.throws(() => buildAnchorReviewMatrix(ledger, candidates), /Duplicate production-candidate identity/u);
  candidates.rows[151].case_id = ledger.rows[151].case_id;
  candidates.rows[151].side = ledger.rows[151].side;
  candidates.rows[151].commit = ledger.rows[151].commit;
  candidates.rows[0].rule_applicability = 'applicable';
  assert.throws(() => buildAnchorReviewMatrix(ledger, candidates), /Expected values to be strictly equal/u);
});

test('retained 152-row matrix reproduces exactly from two pinned source receipts', async () => {
  const ledgerBytes = await readFile('holdout/d3-applicability-proposal-20260928/evidence-ledger.json');
  const candidateBytes = await readFile('holdout/d3-production-role-candidates-20260928/receipt.json');
  assert.equal(sha256(ledgerBytes), 'b9655af035700e12ada897db9c8be3a6d803d17a8a97642a57fca776f746a095');
  assert.equal(sha256(candidateBytes), 'a34ceb1fcad5d840d55ca1431eea2dd4b5d57aca2bd535f175ccb57c738af958');
  const result = buildAnchorReviewMatrix(JSON.parse(ledgerBytes), JSON.parse(candidateBytes));
  assert.equal(result.summary.source_rows, 152);
  assert.equal(result.summary.anchor_groups, 10);
  assert.equal(result.summary.distinct_anchor_blobs, 13);
  assert.equal(result.summary.author_decisions, 0);
  const retained = await readFile('holdout/d3-anchor-review-matrix-20260928/matrix.json');
  assert.deepEqual(retained, Buffer.from(`${JSON.stringify(result, null, 2)}\n`));
  assert.equal(sha256(retained), 'e3d1877cc6d70c2a0bf36ca7ef0aa0e63d6788d40244bbcb7d77f698a08377ef');
});
