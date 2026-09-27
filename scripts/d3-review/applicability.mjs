import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha256 } from '../d3-source-review/files.mjs';
import { digest, encode, validateCases } from './review.mjs';

const active = ['D3-HDX-MOD-001', 'D3-RR-MOD-001', 'D3-EP-MOD-001', 'D3-EP-MOD-002'];
const context = ['D3-RR-MOD-002', 'D3-RR-MOD-003'];

/** Mechanical join only: an anchor's byte similarity does not decide rule applicability. */
export function buildApplicabilityChecklist(bundle, contract, historical, selection, sourceHashes) {
  validateCases(bundle);
  assert(bundle.scope_proposal_sha256, 'Selected case bundle required');
  assert(contract?.schema === 'd3-research-contract-proposal/1');
  assert(historical?.schema === 'd3-contract-historical-context/1');
  assert(selection?.schema === 'd3-conditional-rule-selection/1');
  assert.equal(selection.status, 'accepted-conditional-pending-historical-applicability');
  assert.equal(selection.review_cases_sha256, digest(bundle));
  assert.deepEqual([...selection.active_candidate_rule_ids].sort(), [...active].sort());
  assert.deepEqual([...selection.context_only_rule_ids].sort(), [...context].sort());
  assert.equal(selection.historical_applicability_complete, false);
  assert(Array.isArray(contract.repositories) && Array.isArray(historical.rows));
  const rules = new Map(contract.repositories.flatMap((repo) => repo.rules.map((rule) => [rule.id, { ...rule, repository: repo.id }])));
  for (const id of [...active, ...context]) assert(rules.has(id), `Missing source-backed rule ${id}`);
  const anchors = new Map();
  for (const row of historical.rows) {
    const key = `${row.case_id}\0${row.repository}\0${row.side}\0${row.commit}\0${row.path}`;
    assert(!anchors.has(key), 'Duplicate historical anchor');
    anchors.set(key, row);
  }
  const rows = [];
  for (const item of bundle.cases) {
    for (const id of active) {
      const rule = rules.get(id);
      if (rule.repository !== item.repository) continue;
      assert(Array.isArray(rule.historical_anchor_paths) && rule.historical_anchor_paths.length > 0);
      for (const [side, commit] of [['base', item.base], ['head', item.head]]) {
        const evidence = rule.historical_anchor_paths.map((path) => {
          const row = anchors.get(`${item.id}\0${item.repository}\0${side}\0${commit}\0${path}`);
          assert(row && row.rule_applicability === 'not-decided-by-this-check', `Missing undecided historical anchor ${item.id} ${id} ${side} ${path}`);
          assert(['same-bytes-as-reference', 'different-from-reference', 'missing-in-commit'].includes(row.status));
          return { path, anchor_status: row.status, sha256: row.sha256 ?? null, git_blob: row.git_blob ?? null };
        });
        rows.push({ case_id: item.id, repository: item.repository, rule_id: id, side, commit,
          anchors: evidence, applicability: null, rationale: null, source_evidence: [], ai_assistance: null });
      }
    }
  }
  assert(rows.length > 0);
  return { schema: 'd3-historical-applicability-checklist/1', status: 'preparation-no-applicability-decision',
    cases_sha256: digest(bundle), source_sha256: sourceHashes, active_candidate_rule_ids: active,
    context_only_rule_ids: context, rows, decisions_created: 0, predictions_executed: false };
}

async function pinnedJson(path, expected) {
  assert(isAbsolute(path) && /^[a-f0-9]{64}$/u.test(expected), 'Absolute path and retained SHA-256 required');
  const bytes = await readFile(path);
  assert.equal(sha256(bytes), expected, `${path} changed`);
  return JSON.parse(bytes);
}

async function main() {
  const [casesPath, casesSha, contractPath, contractSha, historicalPath, historicalSha, selectionPath, selectionSha, outputPath] = process.argv.slice(2);
  assert(isAbsolute(outputPath), 'New absolute output path required');
  const bundle = await pinnedJson(casesPath, casesSha);
  const contract = await pinnedJson(contractPath, contractSha);
  const historical = await pinnedJson(historicalPath, historicalSha);
  const selection = await pinnedJson(selectionPath, selectionSha);
  const checklist = buildApplicabilityChecklist(bundle, contract, historical, selection,
    { contract_sha256: contractSha, historical_sha256: historicalSha, selection_sha256: selectionSha });
  await writeFile(outputPath, encode(checklist), { flag: 'wx', mode: 0o600 });
  console.log(encode({ status: checklist.status, output: outputPath, rows: checklist.rows.length,
    cases: new Set(checklist.rows.map((row) => row.case_id)).size,
    checklist_sha256: sha256(encode(checklist)), decisions_created: 0, predictions_executed: false }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(`D3_APPLICABILITY_BLOCKED: ${error.message}`); process.exitCode = 1; });
}
