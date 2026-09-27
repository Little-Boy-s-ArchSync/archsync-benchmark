import assert from 'node:assert/strict';
import { isHoldoutTimestamp, isSafeHoldoutPath } from '../lib/holdout.mjs';
import { gitId, plainFile, sha256 } from '../d3-source-review/files.mjs';
import { verifyTransfer } from '../d3-source-review/transfer.mjs';

export const encode = (value) => `${JSON.stringify(value, null, 2)}\n`;
export const digest = (value) => sha256(encode(value));
const hex = /^[a-f0-9]{64}$/u;
const oid = /^[a-f0-9]{40}$/u;
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const labels = ['no-impact', 'violation', 'evolution', 'unknown'];
const blindDesign = 'two-development-associated-authors-blinded-to-tool-outputs';
const exploratoryDesign = 'two-development-associated-authors-nonblind-ai-assisted-exploratory';
const token = (value) => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(value);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function sourceLines(source) {
  if (typeof source !== 'string' || source.includes('\0')) return null;
  const lines = source.split(/\r\n|[\r\n\u2028\u2029]/u);
  if (source === '' || /[\r\n\u2028\u2029]$/u.test(source)) lines.pop();
  return lines;
}

/** Reads a pinned, previously source-verified packet. No fetch, inference or code execution. */
export async function collectCases({ source, transferSha256, summaryPath, summarySha256 }) {
  const { root } = await verifyTransfer(source, transferSha256);
  assert(isSafeHoldoutPath(summaryPath) && hex.test(summarySha256), 'Summary pin required');
  const summaryBytes = await plainFile(root, summaryPath);
  assert.equal(sha256(summaryBytes), summarySha256, 'Summary changed');
  const summary = JSON.parse(summaryBytes);
  assert.equal(summary.schema, 'd3-change-packets/1');
  for (const key of ['labels_present', 'predictions_executed', 'research_complete']) assert.equal(summary[key], false);
  assert(Array.isArray(summary.repositories) && summary.repositories.length > 0);
  const prefix = summaryPath.slice(0, summaryPath.lastIndexOf('/'));
  const cases = [];
  const ids = new Set();
  const repositories = new Set();
  for (const repo of summary.repositories) {
    assert(typeof repo.repository === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repo.repository));
    assert(isSafeHoldoutPath(repo.repository) && isSafeHoldoutPath(repo.scope));
    assert(!repositories.has(repo.repository.toLowerCase()), 'Duplicate repository');
    repositories.add(repo.repository.toLowerCase());
    const folder = `${prefix}/${repo.repository.replace('/', '--')}`;
    assert.equal(repo.status, 'GIT_OBJECTS_RETAINED', 'Capture failures must be resolved/reported before preparing reviews');
    assert(Array.isArray(repo.cases) && repo.cases.length > 0);
    for (const item of repo.cases) {
      assert(token(item.id) && !ids.has(item.id.toLowerCase()), 'Duplicate/unsafe case ID');
      ids.add(item.id.toLowerCase());
      assert(oid.test(item.base) && oid.test(item.head) && item.base !== item.head);
      assert.equal(item.status, 'CHANGE_SOURCE_CAPTURED_NOT_LABELLED');
      assert.equal(item.label, null);
      assert.equal(item.predictions_executed, false);
      assert.deepEqual(item.unsupported_submodule_paths, [], 'Submodule case requires explicit scope design');
      const caseFolder = `${folder}/cases/${item.id}`;
      assert.deepEqual(JSON.parse(await plainFile(root, `${caseFolder}/case-receipt.json`)), item);
      const diff = await plainFile(root, `${caseFolder}/scope.diff`);
      assert.equal(sha256(diff), item.artifacts['scope.diff'].sha256);
      assert.equal(diff.length, item.artifacts['scope.diff'].bytes);
      const files = [];
      const keys = new Set();
      for (const blob of item.blobs) {
        assert(isSafeHoldoutPath(blob.path) && blob.path.startsWith(`${repo.scope}/`));
        assert(['base', 'head'].includes(blob.side) && oid.test(blob.git_blob));
        assert(['100644', '100755', '120000'].includes(blob.mode));
        const key = `${blob.side}\0${blob.path}`;
        assert(!keys.has(key), 'Duplicate source side/path');
        keys.add(key);
        const bytes = await plainFile(root, `${folder}/blobs/${blob.git_blob}`);
        assert.equal(sha256(bytes), blob.sha256);
        assert.equal(gitId('blob', bytes), blob.git_blob);
        assert.equal(bytes.length, blob.bytes);
        let sourceText = null;
        if (blob.mode !== '120000') {
          try { sourceText = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); } catch { /* Retain binary as non-citable. */ }
          if (sourceText?.includes('\0')) sourceText = null;
        }
        files.push({ ...blob, text: sourceText, citable: sourceText !== null, line_count: sourceText === null ? null : sourceLines(sourceText).length });
      }
      cases.push({ id: item.id, repository: repo.repository, scope: repo.scope,
        base: item.base, head: item.head, changed_paths: item.changes.map((entry) => entry.path),
        diff_sha256: sha256(diff), diff: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(diff), files });
    }
  }
  const bundle = { schema: 'd3-review-cases/1', status: 'preparation-not-approved-study',
    transfer_sha256: transferSha256, summary_sha256: summarySha256,
    population: 'all-captured-change-candidates-not-selected-by-tool-output', cases };
  validateCases(bundle);
  return bundle;
}

/** Bind a proposed study subset to every captured case, without accepting it as a study protocol. */
export function selectProposedCases(bundle, proposal, proposalSha256) {
  validateCases(bundle);
  assert(hex.test(proposalSha256), 'Separately retained scope proposal digest required');
  assert(object(proposal) && proposal.schema === 'd3-scope-candidate/1');
  assert.equal(proposal.status, 'proposed-not-accepted', 'Preparation cannot silently accept a proposed scope');
  assert.deepEqual(proposal.human_acceptances, [], 'Scope acceptance must be recorded separately');
  assert(Array.isArray(proposal.case_rows), 'Case scope rows required');
  assert.equal(proposal.case_rows.length, bundle.cases.length, 'Scope must account for every captured case');
  const sourceById = new Map(bundle.cases.map((item) => [item.id, item]));
  const seen = new Set();
  const selected = [];
  const context = [];
  for (const row of proposal.case_rows) {
    assert(object(row) && token(row.case_id) && !seen.has(row.case_id), 'Duplicate or invalid scope case');
    seen.add(row.case_id);
    const item = sourceById.get(row.case_id);
    assert(item, 'Scope contains an unknown case');
    assert.equal(row.repository, item.repository, 'Scope repository mismatch');
    assert.equal(row.base, item.base, 'Scope base mismatch');
    assert.equal(row.head, item.head, 'Scope head mismatch');
    assert.equal(row.label, null, 'Scope proposal must not contain labels');
    assert(['primary-candidate', 'context-only'].includes(row.proposed_role), 'Unsupported case scope role');
    if (row.proposed_role === 'primary-candidate') selected.push(item);
    else context.push({ id: item.id, repository: item.repository, base: item.base, head: item.head, reason: row.reason });
  }
  assert(selected.length > 0, 'No primary cases selected');
  assert(Array.isArray(proposal.changed_path_rows), 'Changed-path scope rows required');
  const pathKeys = new Set();
  const pathRoles = new Map();
  for (const row of proposal.changed_path_rows) {
    assert(object(row) && typeof row.case_id === 'string' && typeof row.path === 'string');
    const item = sourceById.get(row.case_id);
    assert(item && row.repository === item.repository && item.changed_paths.includes(row.path), 'Scope changed path not in captured case');
    const key = `${row.case_id}\0${row.path}`;
    assert(!pathKeys.has(key), 'Duplicate changed-path scope row');
    pathKeys.add(key);
    assert(['primary-candidate', 'context-only', 'required-context-non-ts'].includes(row.proposed_role), 'Unsupported changed-path role');
    pathRoles.set(key, row.proposed_role);
    const base = item.files.find((file) => file.side === 'base' && file.path === row.path);
    const head = item.files.find((file) => file.side === 'head' && file.path === row.path);
    assert.equal(row.base_git_blob, base?.git_blob ?? '0'.repeat(40), 'Scope base blob mismatch');
    assert.equal(row.head_git_blob, head?.git_blob ?? '0'.repeat(40), 'Scope head blob mismatch');
  }
  for (const item of bundle.cases) for (const path of item.changed_paths) {
    assert(pathKeys.has(`${item.id}\0${path}`), 'Captured changed path missing from scope');
  }
  for (const row of proposal.case_rows) {
    const item = sourceById.get(row.case_id);
    const roles = item.changed_paths.map((path) => pathRoles.get(`${item.id}\0${path}`));
    assert.equal(row.proposed_role === 'primary-candidate', roles.includes('primary-candidate'), 'Case role contradicts changed-path roles');
  }
  const result = { ...bundle, population: 'proposed-primary-cases-not-accepted',
    scope_proposal_sha256: proposalSha256, captured_case_count: bundle.cases.length,
    context_only_cases: context, cases: selected.map((item) => ({ ...item,
      scope_path_roles: item.changed_paths.map((path) => ({ path, role: pathRoles.get(`${item.id}\0${path}`) })) })) };
  validateCases(result);
  return result;
}

export function validateCases(bundle) {
  assert(object(bundle) && bundle.schema === 'd3-review-cases/1');
  assert.equal(bundle.status, 'preparation-not-approved-study');
  assert(hex.test(bundle.transfer_sha256) && hex.test(bundle.summary_sha256));
  assert(Array.isArray(bundle.cases) && bundle.cases.length > 0);
  if (bundle.scope_proposal_sha256 !== undefined) {
    assert(hex.test(bundle.scope_proposal_sha256), 'Proposed scope digest required');
    assert(Number.isSafeInteger(bundle.captured_case_count) && bundle.captured_case_count >= bundle.cases.length);
    assert(Array.isArray(bundle.context_only_cases) && bundle.context_only_cases.length + bundle.cases.length === bundle.captured_case_count);
    const selectedIds = new Set(bundle.cases.map((item) => item.id));
    const contextIds = new Set();
    for (const item of bundle.context_only_cases) {
      assert(object(item) && token(item.id) && !selectedIds.has(item.id) && !contextIds.has(item.id));
      contextIds.add(item.id);
      assert(isSafeHoldoutPath(item.repository) && oid.test(item.base) && oid.test(item.head) && text(item.reason));
    }
  }
  const ids = new Set();
  for (const item of bundle.cases) {
    assert(token(item.id) && !ids.has(item.id.toLowerCase()), 'Case IDs must be unique');
    ids.add(item.id.toLowerCase());
    assert(isSafeHoldoutPath(item.repository) && item.repository.split('/').length === 2 && isSafeHoldoutPath(item.scope));
    assert(oid.test(item.base) && oid.test(item.head) && item.base !== item.head);
    assert(Array.isArray(item.changed_paths) && item.changed_paths.every((path) => isSafeHoldoutPath(path) && path.startsWith(`${item.scope}/`)));
    if (bundle.scope_proposal_sha256 !== undefined) {
      assert(Array.isArray(item.scope_path_roles) && item.scope_path_roles.length === item.changed_paths.length);
      assert.deepEqual(item.scope_path_roles.map((row) => row.path), item.changed_paths);
      assert(item.scope_path_roles.some((row) => row.role === 'primary-candidate'));
      assert(item.scope_path_roles.every((row) => ['primary-candidate', 'context-only', 'required-context-non-ts'].includes(row.role)));
    }
    assert.equal(sha256(item.diff), item.diff_sha256, 'Diff bytes changed');
    assert(Array.isArray(item.files));
    const keys = new Set();
    for (const file of item.files) {
      const key = `${file.side}\0${file.path}`;
      assert(!keys.has(key) && ['base', 'head'].includes(file.side) && item.changed_paths.includes(file.path));
      keys.add(key);
      assert(oid.test(file.git_blob) && hex.test(file.sha256) && Number.isSafeInteger(file.bytes) && file.bytes >= 0);
      assert(['100644', '100755', '120000'].includes(file.mode));
      assert.equal(file.citable, file.text !== null);
      if (file.citable) {
        assert(file.mode !== '120000' && sourceLines(file.text) !== null);
        assert.equal(Buffer.byteLength(file.text), file.bytes);
        assert.equal(sha256(file.text), file.sha256);
        assert.equal(gitId('blob', Buffer.from(file.text)), file.git_blob);
        assert.equal(sourceLines(file.text).length, file.line_count);
      } else assert.equal(file.line_count, null);
    }
  }
}

export function validateAcceptedScope(bundle, scope) {
  validateCases(bundle);
  assert(bundle.scope_proposal_sha256, 'Selected case bundle required for accepted scope');
  assert(object(scope) && scope.schema === 'd3-accepted-case-scope/1');
  assert.equal(scope.status, 'accepted-for-case-disposition-only');
  assert.equal(scope.proposal_sha256, bundle.scope_proposal_sha256);
  assert.equal(scope.review_cases_sha256, digest(bundle));
  assert.equal(scope.captured_cases, bundle.captured_case_count);
  assert.equal(scope.primary_cases, bundle.cases.length);
  assert.equal(scope.context_only_cases, bundle.context_only_cases.length);
  assert.equal(scope.etherpad_h019_tar_json_role, 'required-context-non-ts');
  assert(text(scope.decision_quote) && text(scope.decision_channel) && text(scope.decision_record));
  assert.equal(scope.method_accepted, false, 'Case-scope approval must not be presented as whole-method approval');
  assert.equal(scope.labels_created, false);
  assert.equal(scope.predictions_executed, false);
}

export function validateReadyModuleContract(bundle, contract, method) {
  validateCases(bundle);
  assert(bundle.scope_proposal_sha256, 'Selected D3 case bundle required');
  assert(object(contract) && contract.schema === 'd3-final-module-contract/1', 'Final module contract required');
  assert.equal(contract.status, 'accepted-historical-applicability-complete');
  assert.equal(contract.review_cases_sha256, digest(bundle));
  assert.equal(contract.historical_applicability_complete, true);
  assert.equal(contract.upstream_maintainer_approved, false, 'Study rules must not claim upstream approval');
  assert(Array.isArray(contract.active_rule_ids) && contract.active_rule_ids.length > 0);
  assert.deepEqual([...contract.active_rule_ids].sort(), [...method.rule_ids].sort(), 'Method and active rule set differ');
  assert(Array.isArray(contract.context_only_rule_ids));
  assert(contract.context_only_rule_ids.every((id) => !method.rule_ids.includes(id)), 'Context rule counted as active');
  assert(hex.test(contract.applicability_evidence_sha256), 'Per-case historical applicability evidence must be pinned');
}

export function reviewTemplate(bundle, reviewerId) {
  validateCases(bundle);
  assert(token(reviewerId), 'Reviewer ID required');
  return { schema: 'd3-author-review/1', cases_sha256: digest(bundle), method_sha256: null,
    reviewer: { id: reviewerId, relationship: 'development-associated', declaration_reference: null,
      declared_at_utc: null, saw_tool_predictions: null, saw_other_reviewer_decisions: null,
      used_cases_to_tune_tool: null, exposure_note: null },
    rows: bundle.cases.map((item) => ({ case_id: item.id, repository: item.repository, base: item.base, head: item.head,
      label: null, rationale: '', confidence: null, reviewed_at_utc: null, ai_assistance: null,
      evidence: [], unknown_reason: null, rule_id: null, covered_changed_paths: [] })) };
}

export function validateMethod(method) {
  assert(object(method) && method.schema === 'd3-author-method/1', 'Method schema required');
  assert.equal(method.status, 'accepted', 'Method must be accepted before official annotation');
  assert(text(method.version) && hex.test(method.cases_sha256));
  for (const key of ['rubric_sha256', 'contract_sha256', 'scope_sha256', 'tool_pins_sha256', 'analysis_plan_sha256']) assert(hex.test(method[key]), `${key} required`);
  assert(Array.isArray(method.reviewer_ids) && method.reviewer_ids.length === 2 && method.reviewer_ids.every(token) && new Set(method.reviewer_ids.map((id) => id.toLowerCase())).size === 2);
  assert([blindDesign, exploratoryDesign].includes(method.annotation_design), 'Supported annotation design required');
  assert.equal(method.disagreement_policy, 'joint-consensus-else-unknown');
  assert(Array.isArray(method.rule_ids) && method.rule_ids.every(text) && new Set(method.rule_ids).size === method.rule_ids.length);
  assert(object(method.acceptance) && method.reviewer_ids.includes(method.acceptance.reviewer_id) && text(method.acceptance.reference) && isHoldoutTimestamp(method.acceptance.at_utc));
  // Identity and acceptance-reference truth are not authenticated by this structural check.
}

export function checkReview(bundle, review, method) {
  validateCases(bundle);
  validateMethod(method);
  const issues = [];
  const need = (condition, message) => { if (!condition) issues.push(message); };
  assert(object(review), 'Review object required');
  need(review.schema === 'd3-author-review/1', 'review_schema_invalid');
  const casesSha = digest(bundle);
  need(method.cases_sha256 === casesSha && review.cases_sha256 === casesSha, 'case_population_binding_mismatch');
  need(review.method_sha256 === digest(method), 'method_binding_mismatch');
  const reviewer = review.reviewer ?? {};
  need(method.reviewer_ids.includes(reviewer.id), 'reviewer_not_assigned');
  need(reviewer.relationship === 'development-associated', 'author_relationship_required');
  need(text(reviewer.declaration_reference) && isHoldoutTimestamp(reviewer.declared_at_utc), 'actual_reviewer_declaration_missing');
  if (method.annotation_design === blindDesign) {
    for (const key of ['saw_tool_predictions', 'saw_other_reviewer_decisions', 'used_cases_to_tune_tool']) need(reviewer[key] === false, `${key}_not_cleared`);
  } else {
    need(reviewer.saw_tool_predictions === true, 'known_prediction_exposure_not_disclosed');
    need([true, false, null].includes(reviewer.saw_other_reviewer_decisions), 'peer_decision_exposure_invalid');
    need([true, false, null].includes(reviewer.used_cases_to_tune_tool), 'tuning_exposure_invalid');
    need(text(reviewer.exposure_note), 'exposure_note_missing');
  }
  need(Array.isArray(review.rows), 'review_rows_missing');
  const byId = new Map(bundle.cases.map((item) => [item.id, item]));
  const seen = new Set();
  for (const row of Array.isArray(review.rows) ? review.rows : []) {
    if (!object(row) || !byId.has(row.case_id) || seen.has(row.case_id)) { issues.push('unexpected_or_duplicate_case'); continue; }
    seen.add(row.case_id);
    const item = byId.get(row.case_id);
    const prefix = `${row.case_id}: `;
    need(row.repository === item.repository && row.base === item.base && row.head === item.head, `${prefix}source_identity_mismatch`);
    need(labels.includes(row.label), `${prefix}label_missing_or_invalid`);
    need(text(row.rationale), `${prefix}rationale_missing`);
    need(Number.isFinite(row.confidence) && row.confidence >= 0 && row.confidence <= 1, `${prefix}confidence_missing`);
    need(isHoldoutTimestamp(row.reviewed_at_utc) && Date.parse(row.reviewed_at_utc) >= Date.parse(method.acceptance.at_utc), `${prefix}review_time_missing_or_before_method`);
    need(object(row.ai_assistance) && typeof row.ai_assistance.used === 'boolean' && text(row.ai_assistance.description), `${prefix}ai_assistance_disclosure_missing`);
    if (method.annotation_design === exploratoryDesign && row.ai_assistance?.used === true) {
      need(['source-only', 'prediction-exposed', 'unknown'].includes(row.ai_assistance.input_scope), `${prefix}ai_input_scope_missing`);
      need(text(row.ai_assistance.output_reference), `${prefix}ai_output_reference_missing`);
      need(['full', 'sampled', 'not-checked'].includes(row.ai_assistance.human_verification), `${prefix}ai_verification_extent_missing`);
      need(typeof row.ai_assistance.shared_with_other_reviewer === 'boolean', `${prefix}shared_ai_disclosure_missing`);
    }
    need(Array.isArray(row.covered_changed_paths) && same([...row.covered_changed_paths].sort(), [...item.changed_paths].sort()), `${prefix}changed_path_review_incomplete`);
    need(row.label !== 'unknown' || text(row.unknown_reason), `${prefix}unknown_reason_missing`);
    need(row.label !== 'violation' || method.rule_ids.includes(row.rule_id), `${prefix}accepted_rule_missing`);
    need(Array.isArray(row.evidence) && row.evidence.length > 0, `${prefix}source_evidence_missing`);
    for (const entry of Array.isArray(row.evidence) ? row.evidence : []) {
      const file = object(entry) && item.files.find((candidate) => candidate.side === entry.side && candidate.path === entry.path);
      const lineOk = file?.citable && Number.isSafeInteger(entry.line) && entry.line > 0 && entry.line <= file.line_count;
      need(lineOk, `${prefix}nonexistent_or_nonregular_source_location`);
      if (lineOk) need(typeof entry.quote === 'string' && entry.quote.trim().length > 0 && sourceLines(file.text)[entry.line - 1].includes(entry.quote), `${prefix}quote_not_on_source_line`);
    }
  }
  for (const item of bundle.cases) need(seen.has(item.id), `${item.id}: review_missing`);
  const dates = (Array.isArray(review.rows) ? review.rows : []).map((row) => Date.parse(row?.reviewed_at_utc));
  need(isHoldoutTimestamp(reviewer.declared_at_utc) && dates.every((date) => date <= Date.parse(reviewer.declared_at_utc)), 'declaration_must_follow_own_reviews');
  const aiRows = (Array.isArray(review.rows) ? review.rows : []).filter((row) => row?.ai_assistance?.used === true);
  return { status: issues.length ? 'REVIEW_INCOMPLETE' : 'REVIEW_STRUCTURALLY_VALID_NOT_AUTHENTICATED',
    reviewer_id: reviewer.id ?? null, expected_cases: bundle.cases.length, received_cases: seen.size,
    review_sha256: digest(review), cases_sha256: casesSha, issues,
    ai_assistance: { assisted_rows: aiRows.length,
      shared_suggestion_rows: aiRows.filter((row) => row.ai_assistance.shared_with_other_reviewer === true).length,
      not_fully_checked_rows: aiRows.filter((row) => row.ai_assistance.human_verification !== 'full').length },
    human_identity_verified: false, scientific_truth_verified: false, execution_authorized: false };
}

function agreement(rows) {
  const counts = Object.fromEntries(labels.map((label) => [label, { a: 0, b: 0 }]));
  let matches = 0;
  for (const row of rows) { counts[row.a].a++; counts[row.b].b++; if (row.a === row.b) matches++; }
  const n = rows.length;
  const observed = n ? matches / n : null;
  const expected = n ? labels.reduce((sum, label) => sum + counts[label].a * counts[label].b, 0) / (n * n) : null;
  return { n, matches, agreement: observed, cohens_kappa: expected === null || expected === 1 ? null : (observed - expected) / (1 - expected),
    kappa_undefined_reason: expected === 1 ? 'degenerate_marginals' : n ? null : 'empty_population', counts };
}

export function compareReviews({ bundle, method, reviewA, reviewB, sealedReviewSha256 }) {
  const a = checkReview(bundle, reviewA, method);
  const b = checkReview(bundle, reviewB, method);
  assert.equal(a.issues.length + b.issues.length, 0, 'Both original reviews must be complete');
  assert.notEqual(a.reviewer_id, b.reviewer_id, 'Two distinct reviewers required');
  assert.deepEqual(sealedReviewSha256, [a.review_sha256, b.review_sha256], 'Separately retained review hashes must match before comparison');
  const aRows = new Map(reviewA.rows.map((row) => [row.case_id, row]));
  const bRows = new Map(reviewB.rows.map((row) => [row.case_id, row]));
  const rows = bundle.cases.map((item) => ({ case_id: item.id, repository: item.repository, a: aRows.get(item.id).label, b: bRows.get(item.id).label }));
  return { schema: 'd3-author-agreement/1', status: 'PRE_ADJUDICATION_AGREEMENT_ONLY', method_sha256: digest(method),
    cases_sha256: digest(bundle), original_review_sha256: sealedReviewSha256,
    pooled: agreement(rows), by_repository: Object.fromEntries([...new Set(rows.map((row) => row.repository))].map((repo) => [repo, agreement(rows.filter((row) => row.repository === repo))])),
    disagreements: rows.filter((row) => row.a !== row.b),
    ai_assistance: { reviewer_a: a.ai_assistance, reviewer_b: b.ai_assistance },
    interpretation: method.annotation_design === exploratoryDesign
      ? 'Original labels before reconciliation; nonblind, potentially AI-assisted author review. Shared AI suggestions can make agreement dependent. Not independent validation or tool accuracy.'
      : 'Original labels before reconciliation; author-associated review, not independent validation or tool accuracy.',
    execution_authorized: false, research_complete: false };
}
