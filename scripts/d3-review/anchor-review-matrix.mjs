import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../d3-source-review/files.mjs';

const inputs = Object.freeze({
  ledger: { path: 'holdout/d3-applicability-proposal-20260928/evidence-ledger.json',
    sha256: 'b9655af035700e12ada897db9c8be3a6d803d17a8a97642a57fca776f746a095' },
  candidates: { path: 'holdout/d3-production-role-candidates-20260928/receipt.json',
    sha256: 'a34ceb1fcad5d840d55ca1431eea2dd4b5d57aca2bd535f175ccb57c738af958' },
});

function rowKey(row) {
  return JSON.stringify([row.repository, row.case_id, row.rule_id, row.side, row.commit]);
}

/** Duplicate anchor bytes are a reading aid, not a shared scientific decision. */
export function buildAnchorReviewMatrix(ledger, candidates) {
  assert.equal(ledger.schema, 'd3-proposed-applicability-evidence/1');
  assert.equal(ledger.status, 'ai-proposed-not-human-verified');
  assert.equal(ledger.labels_created, false);
  assert.equal(ledger.predictions_executed, false);
  assert.deepEqual(ledger.human_acceptances, []);
  assert.equal(candidates.schema, 'd3-historical-production-role-candidates/1');
  assert.equal(candidates.status, 'lexical-path-filter-only-not-applicability');
  assert.equal(ledger.rows.length, 152);
  assert.equal(candidates.rows.length, 152);
  const candidateMap = new Map();
  for (const row of candidates.rows) {
    const key = rowKey(row);
    assert(!candidateMap.has(key), 'Duplicate production-candidate identity');
    assert.equal(row.historical_role_verified, false);
    assert.equal(row.rule_applicability, null);
    assert.equal(row.truth_label, null);
    assert.equal(row.tool_prediction, null);
    candidateMap.set(key, row);
  }
  const groups = new Map(), seen = new Set(), distinctAnchors = new Set();
  for (const row of ledger.rows) {
    const key = rowKey(row);
    assert(!seen.has(key), 'Duplicate source-evidence identity'); seen.add(key);
    const candidate = candidateMap.get(key);
    assert(candidate, 'Missing exact production-candidate identity');
    assert.equal(row.applicability, null);
    assert.equal(row.human_verification, 'pending-both-authors');
    assert(Array.isArray(row.anchors) && row.anchors.length > 0);
    const anchors = row.anchors.map(anchor => {
      assert(/^[a-f0-9]{40}$/u.test(anchor.git_blob));
      assert(/^[a-f0-9]{64}$/u.test(anchor.sha256));
      assert(['100644', '100755'].includes(anchor.mode));
      distinctAnchors.add(JSON.stringify([row.repository, anchor.path, anchor.git_blob]));
      return { path: anchor.path, mode: anchor.mode, git_blob: anchor.git_blob, sha256: anchor.sha256 };
    }).sort((a, b) => a.path.localeCompare(b.path, 'en'));
    const fingerprint = sha256(Buffer.from(JSON.stringify(anchors)));
    const groupKey = JSON.stringify([row.repository, row.rule_id, fingerprint]);
    if (!groups.has(groupKey)) groups.set(groupKey, {
      repository: row.repository, rule_id: row.rule_id, anchor_set_sha256: fingerprint,
      anchors, members: [], group_review_status: 'unreviewed-not-a-row-decision',
    });
    groups.get(groupKey).members.push({ case_id: row.case_id, side: row.side,
      commit: row.commit, source_candidate_paths: candidate.source_candidate_paths,
      target_candidate_paths: candidate.target_candidate_paths,
      applicability: null, truth_label: null, tool_prediction: null });
  }
  assert.equal(candidateMap.size, seen.size, 'Candidate set contains unmatched rows');
  const ordered = [...groups.values()].sort((a, b) =>
    JSON.stringify([a.repository, a.rule_id, a.anchor_set_sha256]).localeCompare(
      JSON.stringify([b.repository, b.rule_id, b.anchor_set_sha256]), 'en'));
  ordered.forEach((group, index) => {
    group.group_id = `ANCHOR-${String(index + 1).padStart(2, '0')}`;
    group.members.sort((a, b) =>
      JSON.stringify([a.case_id, a.side, a.commit]).localeCompare(
        JSON.stringify([b.case_id, b.side, b.commit]), 'en'));
  });
  return { schema: 'd3-historical-anchor-review-matrix/1',
    status: 'byte-equivalence-review-aid-not-applicability',
    inputs: { source_evidence_ledger_sha256: inputs.ledger.sha256,
      production_candidates_sha256: inputs.candidates.sha256 },
    summary: { source_rows: seen.size, anchor_groups: ordered.length,
      distinct_anchor_blobs: distinctAnchors.size, author_decisions: 0,
      truth_labels: 0, tool_predictions: 0 },
    groups: ordered };
}

async function main(args) {
  assert(args.length === 2 && ['--write', '--check'].includes(args[0]),
    'Usage: anchor-review-matrix.mjs --write|--check OUTPUT');
  const parsed = {};
  for (const [name, pin] of Object.entries(inputs)) {
    const bytes = await readFile(resolve(pin.path));
    assert.equal(sha256(bytes), pin.sha256, `${name} raw bytes changed`);
    parsed[name] = JSON.parse(bytes);
  }
  const result = buildAnchorReviewMatrix(parsed.ledger, parsed.candidates);
  const bytes = Buffer.from(`${JSON.stringify(result, null, 2)}\n`);
  if (args[0] === '--write') await writeFile(resolve(args[1]), bytes, { flag: 'wx' });
  else assert.deepEqual(await readFile(resolve(args[1])), bytes, 'Retained anchor matrix changed');
  process.stdout.write(`${JSON.stringify(result.summary)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch(error => { console.error(error); process.exitCode = 1; });
}
