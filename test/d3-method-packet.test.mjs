import assert from 'node:assert/strict';
import test from 'node:test';
import { validateApplicabilityLedger } from '../scripts/d3-review/method-packet.mjs';
import { sha256, gitId } from '../scripts/d3-source-review/files.mjs';

// Synthetic mechanics only: no D3 labels, decisions or human acceptance.
function fixture() {
  const bytes = Buffer.from('synthetic source\nsecond line\n');
  const commit = 'a'.repeat(40), receipt = 'b'.repeat(64);
  const rows = [];
  for (let i = 0; i < 56; i++) for (let rule = 0; rule < (i < 20 ? 2 : 1); rule++) for (const side of ['base', 'head'])
    rows.push({ repository: 'synthetic', case_id: `C${i}`, rule_id: `R${rule}`, side, commit, applicability: null });
  const checklistBytes = Buffer.from(JSON.stringify({ schema: 'd3-historical-applicability-checklist/1', status: 'preparation-no-applicability-decision', rows }));
  const digest = sha256(checklistBytes);
  const ledger = { schema: 'd3-reviewed-applicability/1', status: 'proposed-reviewed-not-accepted', checklist_sha256: digest,
    rows: rows.map((r) => ({ ...r, applicability: 'applicable', rationale: 'Synthetic fixture only', unknown_reason: null,
      reviewer_id: 'test-reviewer', reviewed_at_utc: '2026-01-01T00:00:00.000Z', decision_reference: 'test-only',
      source_evidence: [{ repository: r.repository, commit, path: 'src/test.ts', mode: '100644', git_blob: gitId('blob', bytes), sha256: sha256(bytes),
        start_line: 1, end_line: 1, quote: 'synthetic source', source_receipt_sha256: receipt }],
      ai_assistance: { used: false, human_verification: 'Synthetic fixture, not a human statement' } })) };
  const sources = new Map([[JSON.stringify(['synthetic', commit, 'src/test.ts']), { bytes, mode: '100644', git_blob: gitId('blob', bytes), receipt_sha256: receipt }]]);
  return { ledger, checklistBytes, digest, sources };
}
const check = (f) => validateApplicabilityLedger(f.ledger, f.checklistBytes, f.digest, f.sources);

test('152-row source-bound contract validates mechanics without accepting science', () => {
  const f = fixture();
  assert.deepEqual(check(f), { status: 'STRUCTURALLY_VALID_NOT_ACCEPTED', rows: 152, cases: 56, research_complete: false });
  Object.assign(f.ledger.rows[0], { applicability: 'unresolved', unknown_reason: 'Required source unavailable', source_evidence: [] });
  assert.equal(check(f).status, 'STRUCTURALLY_VALID_NOT_ACCEPTED');
});

test('rejects incomplete or altered identities, missing decisions and fabricated source evidence', () => {
  for (const mutate of [
    f => f.ledger.rows.pop(), f => { f.ledger.rows[1] = f.ledger.rows[0]; },
    f => { f.ledger.rows[0].commit = 'c'.repeat(40); }, f => { f.ledger.rows[0].applicability = null; },
    f => { f.ledger.rows[0].source_evidence = []; }, f => { f.ledger.rows[0].source_evidence[0].quote = 'invented'; },
    f => { f.ledger.rows[0].source_evidence[0].mode = '120000'; }, f => { f.ledger.rows[0].source_evidence[0].sha256 = 'c'.repeat(64); },
    f => { f.ledger.rows[0].source_evidence[0].end_line = 3; }, f => { f.ledger.rows[0].source_evidence[0].source_receipt_sha256 = 'c'.repeat(64); },
    f => f.sources.clear(), f => { f.checklistBytes = Buffer.concat([f.checklistBytes, Buffer.from(' ')]); },
    f => { f.ledger.rows[0].reviewed_at_utc = '2026-02-30T00:00:00.000Z'; },
    f => { f.ledger.rows[0].applicability = 'unresolved'; }, f => { f.ledger.status = 'accepted'; },
  ]) { const f = fixture(); mutate(f); assert.throws(() => check(f)); }
});

test('AI provenance requires actual input/output references and explicit sharing', () => {
  const f = fixture();
  f.ledger.rows[0].ai_assistance = { used: true, human_verification: 'Synthetic mechanics only', tool_model: 'unknown',
    input_scope: 'synthetic source', input_sha256: ['d'.repeat(64)], prediction_exposure: 'synthetic input only', output_reference: 'test://output', output_sha256: 'e'.repeat(64), shared: true };
  assert.equal(check(f).rows, 152);
  delete f.ledger.rows[0].ai_assistance.output_sha256;
  assert.throws(() => check(f));
});
