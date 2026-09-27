import assert from 'node:assert/strict';
import { sha256, gitId } from '../d3-source-review/files.mjs';
import { isSafeHoldoutPath } from '../lib/holdout.mjs';

const text = (value) => typeof value === 'string' && value.trim().length > 0;
const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const identity = (r) => JSON.stringify([r.repository, r.case_id, r.rule_id, r.side, r.commit]);
const sourceKey = (r) => JSON.stringify([r.repository, r.commit, r.path]);

/** Proposal-only structural check. Does not accept the method or decide scientific truth.
 * verifiedSources must come from independently verified frozen packet/tree receipts.
 */
export function validateApplicabilityLedger(ledger, checklistBytes, expectedChecklistSha256, verifiedSources) {
  assert(Buffer.isBuffer(checklistBytes) && hash(expectedChecklistSha256));
  assert.equal(sha256(checklistBytes), expectedChecklistSha256, 'Blank checklist bytes changed');
  const checklist = JSON.parse(checklistBytes.toString('utf8'));
  assert.equal(checklist.schema, 'd3-historical-applicability-checklist/1');
  assert.equal(checklist.status, 'preparation-no-applicability-decision');
  assert.equal(checklist.rows.length, 152, 'Expected 152 blank rows');
  const expected = new Set(checklist.rows.map(identity));
  assert.equal(expected.size, 152, 'Duplicate blank identity');
  assert.equal(new Set(checklist.rows.map((r) => JSON.stringify([r.repository, r.case_id]))).size, 56, 'Expected 56 cases');
  for (const r of checklist.rows) {
    assert(['base', 'head'].includes(r.side) && /^[a-f0-9]{40}$/u.test(r.commit));
    assert([r.repository, r.case_id, r.rule_id].every(text));
    assert.equal(r.applicability, null, 'Checklist must remain blank');
    const other = { ...r, side: r.side === 'base' ? 'head' : 'base' };
    assert(checklist.rows.some((x) => x.repository === other.repository && x.case_id === other.case_id && x.rule_id === other.rule_id && x.side === other.side), 'Both historical sides required');
  }
  assert.equal(ledger.schema, 'd3-reviewed-applicability/1');
  assert.equal(ledger.status, 'proposed-reviewed-not-accepted');
  assert.equal(ledger.checklist_sha256, expectedChecklistSha256);
  assert.equal(ledger.rows.length, 152, 'Expected 152 reviewed rows');
  const seen = new Set();
  for (const r of ledger.rows) {
    const key = identity(r);
    assert(expected.has(key) && !seen.has(key), 'Missing, altered or duplicate row identity'); seen.add(key);
    assert(['applicable', 'not-applicable', 'unresolved'].includes(r.applicability), 'Decision missing');
    assert([r.rationale, r.reviewer_id, r.decision_reference].every(text), 'Actual decision provenance required');
    assert(typeof r.reviewed_at_utc === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(r.reviewed_at_utc)
      && Number.isFinite(Date.parse(r.reviewed_at_utc)) && new Date(r.reviewed_at_utc).toISOString() === r.reviewed_at_utc, 'Actual ISO UTC timestamp required');
    assert(r.applicability === 'unresolved' ? text(r.unknown_reason) : r.unknown_reason === null, 'Unknown reason mismatch');
    assert(Array.isArray(r.source_evidence), 'Source evidence required');
    assert(r.applicability === 'unresolved' || r.source_evidence.length > 0, 'Resolved decision requires source evidence');
    for (const e of r.source_evidence) {
      assert.equal(e.repository, r.repository); assert.equal(e.commit, r.commit);
      assert(isSafeHoldoutPath(e.path), 'Unsafe source path');
      assert(['100644', '100755'].includes(e.mode), 'Only regular source objects may support quotations');
      const source = verifiedSources.get(sourceKey(e));
      assert(source && Buffer.isBuffer(source.bytes), 'Source missing from verified historical receipt');
      assert.equal(e.mode, source.mode); assert.equal(e.git_blob, source.git_blob);
      assert.equal(gitId('blob', source.bytes), e.git_blob, 'Git object mismatch');
      assert(hash(e.sha256) && sha256(source.bytes) === e.sha256, 'Source byte hash mismatch');
      assert(hash(e.source_receipt_sha256) && e.source_receipt_sha256 === source.receipt_sha256, 'Source receipt mismatch');
      const lines = source.bytes.toString('utf8').split(/\r?\n/u);
      if (lines.at(-1) === '') lines.pop();
      assert(Number.isInteger(e.start_line) && Number.isInteger(e.end_line) && e.start_line > 0 && e.end_line >= e.start_line && e.end_line <= lines.length, 'Invalid physical line range');
      assert(text(e.quote) && e.quote === lines.slice(e.start_line - 1, e.end_line).join('\n'), 'Source quote mismatch');
    }
    const ai = r.ai_assistance;
    assert(ai && typeof ai.used === 'boolean' && text(ai.human_verification), 'Actual AI/human verification provenance required');
    if (ai.used) {
      assert([ai.tool_model, ai.input_scope, ai.prediction_exposure, ai.output_reference].every(text));
      assert(Array.isArray(ai.input_sha256) && ai.input_sha256.length > 0 && ai.input_sha256.every(hash));
      assert(hash(ai.output_sha256) && typeof ai.shared === 'boolean');
    }
  }
  return { status: 'STRUCTURALLY_VALID_NOT_ACCEPTED', rows: seen.size, cases: 56, research_complete: false };
}
