import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { checkReview, collectCases, compareReviews, digest, encode, reviewTemplate, selectProposedCases, sourceLines, validateAcceptedScope, validateCases, validateMethod, validateReadyModuleContract } from '../scripts/d3-review/review.mjs';
import { buildApplicabilityChecklist } from '../scripts/d3-review/applicability.mjs';
import { historicalFile } from '../scripts/d3-review/contracts.mjs';
import { summarizeRuleSourceCoverage } from '../scripts/d3-review/coverage.mjs';
import { gitId, sha256 } from '../scripts/d3-source-review/files.mjs';
import { fixture } from '../test-support/holdout-git-fixture.mjs';

// Controlled fixtures only. These names, dates, declarations and labels are NOT D3 evidence.
function setup(count = 4) {
  const content = 'first\nfetch("https://example.invalid");\n';
  const file = { path: 'src/test.ts', side: 'head', mode: '100644', git_blob: gitId('blob', Buffer.from(content)), sha256: sha256(content), bytes: Buffer.byteLength(content), text: content, citable: true, line_count: 2 };
  const bundle = { schema: 'd3-review-cases/1', status: 'preparation-not-approved-study', transfer_sha256: 'a'.repeat(64), summary_sha256: 'b'.repeat(64), population: 'controlled-fixture', cases: Array.from({ length: count }, (_, i) => ({ id: `TEST-${i}`, repository: i % 2 ? 'test/two' : 'test/one', scope: 'src', base: 'a'.repeat(40), head: 'b'.repeat(40), changed_paths: ['src/test.ts'], diff: '+source', diff_sha256: sha256('+source'), files: [structuredClone(file)] })) };
  const method = { schema: 'd3-author-method/1', status: 'accepted', version: 'fixture-only', cases_sha256: digest(bundle), reviewer_ids: ['fixture-a', 'fixture-b'], annotation_design: 'two-development-associated-authors-blinded-to-tool-outputs', disagreement_policy: 'joint-consensus-else-unknown', rule_ids: ['TEST-RULE'], acceptance: { reviewer_id: 'fixture-a', reference: 'controlled test, not actual approval', at_utc: '2026-01-01T00:00:00Z' } };
  for (const key of ['rubric_sha256', 'contract_sha256', 'scope_sha256', 'tool_pins_sha256', 'analysis_plan_sha256']) method[key] = 'f'.repeat(64);
  const reviews = method.reviewer_ids.map((id) => {
    const review = reviewTemplate(bundle, id);
    review.method_sha256 = digest(method);
    Object.assign(review.reviewer, { declaration_reference: 'test-only-not-a-person', declared_at_utc: '2026-01-03T00:00:00Z', saw_tool_predictions: false, saw_other_reviewer_decisions: false, used_cases_to_tune_tool: false });
    review.rows.forEach((row, i) => Object.assign(row, { label: ['no-impact', 'evolution'][i % 2], rationale: 'test rationale', confidence: 0.8, reviewed_at_utc: '2026-01-02T00:00:00Z', ai_assistance: { used: false, description: 'fixture only' }, covered_changed_paths: ['src/test.ts'], evidence: [{ side: 'head', path: 'src/test.ts', line: 2, quote: 'fetch(' }] }));
    return review;
  });
  return { bundle, method, reviews };
}

test('blank template never becomes a reviewer declaration or accepted label', () => {
  const { bundle, method } = setup();
  const empty = reviewTemplate(bundle, 'fixture-a');
  assert.equal(empty.reviewer.saw_tool_predictions, null);
  assert(empty.rows.every((row) => row.label === null && row.evidence.length === 0));
  const report = checkReview(bundle, empty, method);
  assert.equal(report.status, 'REVIEW_INCOMPLETE');
  assert(report.issues.includes('actual_reviewer_declaration_missing'));
  assert.equal(report.execution_authorized, false);
});

test('proposed scope selects only primary cases and retains every excluded case in context inventory', () => {
  const { bundle } = setup();
  const proposal = { schema: 'd3-scope-candidate/1', status: 'proposed-not-accepted', human_acceptances: [],
    case_rows: bundle.cases.map((item, index) => ({ case_id: item.id, repository: item.repository, base: item.base, head: item.head,
      proposed_role: index === 0 ? 'context-only' : 'primary-candidate', reason: 'controlled fixture', label: null })),
    changed_path_rows: bundle.cases.map((item, index) => ({ case_id: item.id, repository: item.repository, path: item.changed_paths[0],
      base_git_blob: '0'.repeat(40), head_git_blob: item.files[0].git_blob, proposed_role: index === 0 ? 'context-only' : 'primary-candidate' })) };
  const selected = selectProposedCases(bundle, proposal, 'c'.repeat(64));
  assert.equal(selected.captured_case_count, 4);
  assert.equal(selected.cases.length, 3);
  assert.deepEqual(selected.context_only_cases.map((item) => item.id), ['TEST-0']);
  assert.deepEqual(selected.cases[0].scope_path_roles, [{ path: 'src/test.ts', role: 'primary-candidate' }]);
  assert.equal(reviewTemplate(selected, 'fixture-a').rows.length, 3);
  const acceptance = { schema: 'd3-accepted-case-scope/1', status: 'accepted-for-case-disposition-only',
    proposal_sha256: 'c'.repeat(64), review_cases_sha256: digest(selected), captured_cases: 4,
    primary_cases: 3, context_only_cases: 1, etherpad_h019_tar_json_role: 'required-context-non-ts',
    decision_quote: 'controlled fixture', decision_channel: 'controlled fixture', decision_record: 'controlled fixture',
    method_accepted: false, labels_created: false, predictions_executed: false };
  validateAcceptedScope(selected, acceptance);
  assert.throws(() => validateAcceptedScope(selected, { ...acceptance, primary_cases: 4 }));
  assert.throws(() => validateReadyModuleContract(selected, { schema: 'd3-conditional-rule-selection/1',
    status: 'accepted-conditional-pending-historical-applicability', historical_applicability_complete: false },
  { rule_ids: ['TEST-RULE'] }), /Final module contract required/);
  const bad = structuredClone(proposal);
  bad.case_rows[1].head = 'd'.repeat(40);
  assert.throws(() => selectProposedCases(bundle, bad, 'c'.repeat(64)), /Scope head mismatch/);
  const missing = structuredClone(proposal);
  missing.changed_path_rows.pop();
  assert.throws(() => selectProposedCases(bundle, missing, 'c'.repeat(64)), /missing from scope/);
  const accepted = structuredClone(proposal);
  accepted.status = 'accepted';
  assert.throws(() => selectProposedCases(bundle, accepted, 'c'.repeat(64)), /cannot silently accept/);
});

test('historical applicability preparation retains anchors but invents no rule decision', async (t) => {
  const { bundle } = setup();
  const repositories = ['hyperdxio/hyperdx', 'amruthpillai/reactive-resume', 'ether/etherpad', 'ether/etherpad'];
  bundle.cases.forEach((item, index) => {
    item.repository = repositories[index];
    item.scope_path_roles = [{ path: 'src/test.ts', role: 'primary-candidate' }];
  });
  bundle.scope_proposal_sha256 = 'c'.repeat(64);
  bundle.captured_case_count = 4;
  bundle.context_only_cases = [];
  const ids = ['D3-HDX-MOD-001', 'D3-RR-MOD-001', 'D3-EP-MOD-001', 'D3-EP-MOD-002'];
  const contract = { schema: 'd3-research-contract-proposal/1', transfer_sha256: bundle.transfer_sha256, cases_sha256: 'e'.repeat(64), repositories: [...new Set(repositories)].map((id) => ({ id,
    rules: ids.filter((rule) => rule.startsWith(id === 'hyperdxio/hyperdx' ? 'D3-HDX' : id === 'amruthpillai/reactive-resume' ? 'D3-RR' : 'D3-EP'))
      .map((rule) => ({ id: rule, historical_anchor_paths: ['src/test.ts'] })) })) };
  contract.repositories[1].rules.push(...['D3-RR-MOD-002', 'D3-RR-MOD-003'].map((id) => ({ id, historical_anchor_paths: ['src/test.ts'] })));
  const historical = { schema: 'd3-contract-historical-context/1', cases_sha256: contract.cases_sha256, rows: bundle.cases.flatMap((item) => ['base', 'head'].map((side) => ({
    case_id: item.id, repository: item.repository, side, commit: item[side], path: 'src/test.ts',
    status: 'different-from-reference', sha256: 'a'.repeat(64), git_blob: 'b'.repeat(40), rule_applicability: 'not-decided-by-this-check' }))) };
  const selection = { schema: 'd3-conditional-rule-selection/1', status: 'accepted-conditional-pending-historical-applicability',
    review_cases_sha256: digest(bundle), source_contract_sha256: 'd'.repeat(64), active_candidate_rule_ids: ids,
    context_only_rule_ids: ['D3-RR-MOD-002', 'D3-RR-MOD-003'], historical_applicability_complete: false };
  const checklist = buildApplicabilityChecklist(bundle, contract, historical, selection, { contract_sha256: 'd'.repeat(64) });
  assert.equal(checklist.rows.length, 12);
  assert(checklist.rows.every((row) => row.applicability === null && row.anchors[0].anchor_status === 'different-from-reference'));
  assert.equal(checklist.decisions_created, 0);
  const missing = structuredClone(historical);
  missing.rows.pop();
  assert.throws(() => buildApplicabilityChecklist(bundle, contract, missing, selection, { contract_sha256: 'd'.repeat(64) }), /Missing undecided historical anchor/);
  const source = await fixture(t);
  const gitDir = join(source.source, '.git');
  const absent = historicalFile(gitDir, source.pin.commit, 'missing.ts', '0'.repeat(64));
  assert.equal(absent.status, 'absent-at-commit');
  const symlinkBlob = await source.git('rev-parse', `${source.pin.commit}:packages/api/index.ts`);
  await source.git('update-index', '--add', '--cacheinfo', `120000,${symlinkBlob},link.ts`);
  await source.git('commit', '-m', 'Controlled symlink object, never checked out');
  const symlinkCommit = await source.git('rev-parse', 'HEAD');
  const symlink = historicalFile(gitDir, symlinkCommit, 'link.ts', '0'.repeat(64));
  assert.equal(symlink.status, 'symlink-not-followed');
  historical.rows[0] = { ...historical.rows[0], ...absent };
  historical.rows[1] = { ...historical.rows[1], ...symlink };
  const retained = buildApplicabilityChecklist(bundle, contract, historical, selection, { contract_sha256: 'd'.repeat(64) });
  assert.deepEqual(retained.rows[0].anchors.map((anchor) => anchor.anchor_status), ['absent-at-commit']);
  assert.deepEqual(retained.rows[1].anchors.map((anchor) => anchor.anchor_status), ['symlink-not-followed']);
  assert(retained.rows.every((row) => row.applicability === null && row.rationale === null));
  const invalid = structuredClone(historical);
  invalid.rows[0].status = 'missing-in-commit';
  assert.throws(() => buildApplicabilityChecklist(bundle, contract, invalid, selection, { contract_sha256: 'd'.repeat(64) }), /Unknown historical anchor status/);
});

test('source-path preflight distinguishes an exact file from its directory and excludes test-only paths', () => {
  const { bundle } = setup();
  const paths = ['src/db/DB.ts', 'src/db/Pad.ts', 'src/db/DB.test.ts', 'src/api/router.ts'];
  bundle.scope_proposal_sha256 = 'c'.repeat(64);
  bundle.captured_case_count = 4;
  bundle.context_only_cases = [];
  bundle.cases.forEach((item, index) => {
    item.repository = 'ether/etherpad';
    item.changed_paths = [paths[index]];
    item.files[0].path = paths[index];
    item.scope_path_roles = [{ path: paths[index], role: 'primary-candidate' }];
  });
  const contract = { schema: 'd3-research-contract-proposal/1', transfer_sha256: bundle.transfer_sha256,
    module_semantics: { test_path_regex: '\\.(test|spec)\\.[jt]sx?$', source_extensions: ['.ts'] },
    repositories: [{ id: 'ether/etherpad', mapping: [
      { component: 'database-adapter', path: 'src/db/DB.ts' },
      { component: 'db-prefix', prefix: 'src/db/' },
    ], rules: [
      { id: 'EXACT', from: 'database-adapter' }, { id: 'PREFIX', from: 'db-prefix' },
    ] }] };
  const selection = { schema: 'd3-conditional-rule-selection/1', review_cases_sha256: digest(bundle),
    active_candidate_rule_ids: ['EXACT', 'PREFIX'] };
  const report = summarizeRuleSourceCoverage(bundle, contract, selection);
  assert.equal(report.primary_cases, 4);
  assert.deepEqual(report.repositories[0].rules.map((rule) => [rule.rule_id,
    rule.cases_with_changed_mapped_source, rule.cases_with_changed_production_source]),
  [['EXACT', 1, 1], ['PREFIX', 3, 2]]);
  assert.equal(report.labels_created, false);
  assert.equal(report.predictions_executed, false);
});

test('source-bound fixture review passes structural checks, not truth or identity', () => {
  const { bundle, method, reviews } = setup();
  const before = encode(reviews[0]);
  const report = checkReview(bundle, reviews[0], method);
  assert.deepEqual(report.issues, []);
  assert.equal(report.scientific_truth_verified, false);
  assert.equal(report.human_identity_verified, false);
  assert.equal(before, encode(reviews[0]));
});

test('each exposure field and actor role fails closed', () => {
  for (const field of ['saw_tool_predictions', 'saw_other_reviewer_decisions', 'used_cases_to_tune_tool']) {
    for (const value of [true, null, 'false']) {
      const { bundle, method, reviews } = setup();
      reviews[0].reviewer[field] = value;
      assert(checkReview(bundle, reviews[0], method).issues.includes(`${field}_not_cleared`));
    }
  }
  const { bundle, method, reviews } = setup();
  reviews[0].reviewer.relationship = 'independent';
  assert(checkReview(bundle, reviews[0], method).issues.includes('author_relationship_required'));
});

test('nonblind exploratory design permits AI review with explicit provenance, while blind design stays strict', () => {
  const { bundle, method, reviews } = setup();
  method.annotation_design = 'two-development-associated-authors-nonblind-ai-assisted-exploratory';
  for (const review of reviews) {
    Object.assign(review.reviewer, {
      saw_tool_predictions: true, saw_other_reviewer_decisions: null,
      used_cases_to_tune_tool: null,
      exposure_note: 'Controlled fixture: prediction exposure disclosed; scope unknown',
    });
    review.method_sha256 = digest(method);
  }
  reviews[0].rows[0].ai_assistance = {
    used: true, description: 'AI proposed a source-bound label for this controlled fixture',
    input_scope: 'prediction-exposed', output_reference: 'fixture-ai-output-sha256',
    human_verification: 'sampled', shared_with_other_reviewer: true,
  };
  assert.deepEqual(checkReview(bundle, reviews[0], method).issues, []);
  assert.deepEqual(checkReview(bundle, reviews[0], method).ai_assistance,
    { assisted_rows: 1, shared_suggestion_rows: 1, not_fully_checked_rows: 1 });
  const agreement = compareReviews({ bundle, method, reviewA: reviews[0], reviewB: reviews[1], sealedReviewSha256: reviews.map(digest) });
  assert.match(agreement.interpretation, /nonblind, potentially AI-assisted/);
  assert.equal(agreement.ai_assistance.reviewer_a.shared_suggestion_rows, 1);
  const missingProvenance = structuredClone(reviews[0]);
  delete missingProvenance.rows[0].ai_assistance.output_reference;
  assert(checkReview(bundle, missingProvenance, method).issues.some((issue) => issue.includes('ai_output_reference_missing')));
  const missingExposure = structuredClone(reviews[0]);
  missingExposure.reviewer.exposure_note = null;
  assert(checkReview(bundle, missingExposure, method).issues.includes('exposure_note_missing'));
  const falseExposure = structuredClone(reviews[0]);
  falseExposure.reviewer.saw_tool_predictions = false;
  assert(checkReview(bundle, falseExposure, method).issues.includes('known_prediction_exposure_not_disclosed'));
  method.annotation_design = 'two-development-associated-authors-blinded-to-tool-outputs';
  reviews[0].method_sha256 = digest(method);
  assert(checkReview(bundle, reviews[0], method).issues.includes('saw_tool_predictions_not_cleared'));
});

test('pins, complete population, duplicate/missing rows and source identities checked', () => {
  for (const mutate of [
    (r) => { r.cases_sha256 = '0'.repeat(64); },
    (r) => { r.method_sha256 = '0'.repeat(64); },
    (r) => { r.rows.pop(); },
    (r) => { r.rows.push(structuredClone(r.rows[0])); },
    (r) => { r.rows[0].head = 'c'.repeat(40); },
    (r) => { r.rows[0].case_id = 'unexpected'; },
    (r) => { r.rows = {}; },
    (r) => { r.rows[0] = null; },
    (r) => { r.rows[0].covered_changed_paths = []; },
  ]) {
    const { bundle, method, reviews } = setup();
    mutate(reviews[0]);
    assert(checkReview(bundle, reviews[0], method).issues.length > 0);
  }
});

test('evidence requires exact side/path and real physical line with matching quote', () => {
  for (const mutate of [
    (e) => { e.side = 'base'; }, (e) => { e.path = '../src/test.ts'; },
    (e) => { e.line = 0; }, (e) => { e.line = 3; },
    (e) => { e.line = 1.1; }, (e) => { e.quote = 'absent'; },
    (e) => { e.quote = ''; },
  ]) {
    const { bundle, method, reviews } = setup();
    mutate(reviews[0].rows[0].evidence[0]);
    assert(checkReview(bundle, reviews[0], method).issues.length > 0);
  }
});

test('Unknown must retain reason; violation must bind accepted rule', () => {
  const { bundle, method, reviews } = setup();
  const row = reviews[0].rows[0];
  row.label = 'unknown';
  assert(checkReview(bundle, reviews[0], method).issues.some((s) => s.includes('unknown_reason')));
  row.unknown_reason = 'Missing context';
  assert.deepEqual(checkReview(bundle, reviews[0], method).issues, []);
  row.label = 'violation';
  assert(checkReview(bundle, reviews[0], method).issues.some((s) => s.includes('accepted_rule')));
  row.rule_id = 'TEST-RULE';
  assert.deepEqual(checkReview(bundle, reviews[0], method).issues, []);
});

test('rationale, confidence, AI disclosure and review chronology mandatory', () => {
  for (const mutate of [
    (r) => { r.rows[0].rationale = ''; }, (r) => { r.rows[0].confidence = null; },
    (r) => { r.rows[0].confidence = 2; }, (r) => { r.rows[0].ai_assistance = null; },
    (r) => { r.rows[0].reviewed_at_utc = '2025-01-01T00:00:00Z'; },
    (r) => { r.reviewer.declared_at_utc = '2026-01-01T00:00:00Z'; },
  ]) {
    const { bundle, method, reviews } = setup(); mutate(reviews[0]);
    assert(checkReview(bundle, reviews[0], method).issues.length > 0);
  }
});

test('reject changed source text, byte count, blob identity, diff and duplicate case', () => {
  for (const mutate of [
    (b) => { b.cases[0].files[0].text = 'changed'; },
    (b) => { b.cases[0].files[0].bytes++; },
    (b) => { b.cases[0].files[0].git_blob = 'd'.repeat(40); },
    (b) => { b.cases[0].diff = 'changed'; },
    (b) => { b.cases[1].id = b.cases[0].id; },
    (b) => { b.cases[0].files[0].mode = '120000'; },
    (b) => { b.cases[0].files[0].path = '../escape'; },
  ]) { const { bundle } = setup(); mutate(bundle); assert.throws(() => validateCases(bundle)); }
});

test('physical lines handle BOM, CRLF, empty file, terminal newline, Unicode separators', () => {
  assert.deepEqual(sourceLines(''), []);
  assert.deepEqual(sourceLines('\ufeffa\r\nb\rc\u2028d\u2029'), ['\ufeffa', 'b', 'c', 'd']);
  assert.equal(sourceLines('a\0b'), null);
  assert.deepEqual(sourceLines('a\n\n'), ['a', '']);
});

test('method must have two distinct IDs, versioned artifact pins and real acceptance fields', () => {
  for (const mutate of [
    (m) => { m.status = 'proposed'; }, (m) => { m.rubric_sha256 = null; },
    (m) => { m.reviewer_ids[1] = m.reviewer_ids[0]; },
    (m) => { m.acceptance = null; }, (m) => { m.rule_ids.push('TEST-RULE'); },
    (m) => { m.annotation_design = 'external-reviewers'; },
  ]) { const { method } = setup(); mutate(method); assert.throws(() => validateMethod(method)); }
});

test('pre-adjudication agreement computed from original labels and preserves inputs', () => {
  const { bundle, method, reviews } = setup();
  reviews[1].rows[0].label = 'evolution';
  const before = encode(reviews);
  const report = compareReviews({ bundle, method, reviewA: reviews[0], reviewB: reviews[1], sealedReviewSha256: reviews.map(digest) });
  assert.equal(report.pooled.agreement, 3 / 4);
  assert.equal(report.pooled.cohens_kappa, 0.5);
  assert.equal(report.disagreements.length, 1);
  assert.equal(report.by_repository['test/one'].agreement, 1 / 2);
  assert.equal(report.execution_authorized, false);
  assert.equal(before, encode(reviews));
});

test('degenerate agreement is not reported as perfect kappa', () => {
  const { bundle, method, reviews } = setup(1);
  const report = compareReviews({ bundle, method, reviewA: reviews[0], reviewB: reviews[1], sealedReviewSha256: reviews.map(digest) });
  assert.equal(report.pooled.agreement, 1);
  assert.equal(report.pooled.cohens_kappa, null);
  assert.equal(report.pooled.kappa_undefined_reason, 'degenerate_marginals');
});

test('comparison rejects same reviewer, incomplete input and different retained hashes', () => {
  const { bundle, method, reviews } = setup();
  const args = { bundle, method, reviewA: reviews[0], reviewB: reviews[1], sealedReviewSha256: reviews.map(digest) };
  assert.throws(() => compareReviews({ ...args, sealedReviewSha256: ['0'.repeat(64), digest(reviews[1])] }));
  assert.throws(() => compareReviews({ ...args, reviewB: reviews[0] }));
  reviews[1].rows[0].label = null;
  assert.throws(() => compareReviews(args));
});

async function makePacket(root) {
  const { bundle } = setup(1);
  const file = bundle.cases[0].files[0];
  const item = { id: 'TEST-0', base: 'a'.repeat(40), head: 'b'.repeat(40), status: 'CHANGE_SOURCE_CAPTURED_NOT_LABELLED', label: null, predictions_executed: false, unsupported_submodule_paths: [], changes: [{ path: file.path }], blobs: [{ path: file.path, side: file.side, mode: file.mode, git_blob: file.git_blob, sha256: file.sha256, bytes: file.bytes }], artifacts: { 'scope.diff': { sha256: sha256('+source'), bytes: 7 } } };
  const summary = { schema: 'd3-change-packets/1', labels_present: false, predictions_executed: false, research_complete: false, repositories: [{ repository: 'test/one', scope: 'src', status: 'GIT_OBJECTS_RETAINED', cases: [item] }] };
  const contents = { 'data/change-summary.json': encode(summary), 'data/test--one/cases/TEST-0/case-receipt.json': encode(item), 'data/test--one/cases/TEST-0/scope.diff': '+source', [`data/test--one/blobs/${file.git_blob}`]: file.text };
  for (const [path, bytes] of Object.entries(contents)) { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), bytes); }
  const manifest = { schema: 'archsync-d3-source-transfer/1', research_complete: false, files: Object.entries(contents).map(([path, bytes]) => ({ path, sha256: sha256(bytes), bytes: Buffer.byteLength(bytes) })) };
  await writeFile(join(root, 'TRANSFER-MANIFEST.json'), encode(manifest));
  await writeFile(join(root, 'TRANSFER-MANIFEST.sha256'), `${digest(manifest)}\n`);
  return { source: root, transferSha256: digest(manifest), summaryPath: 'data/change-summary.json', summarySha256: digest(summary) };
}

test('collect pinned packet creates no labels, rejects transfer/hash or source mismatch', async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'd3-review-test-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = await makePacket(root);
  const bundle = await collectCases(input);
  assert.equal(bundle.cases.length, 1);
  assert.equal(bundle.cases[0].files[0].text, 'first\nfetch("https://example.invalid");\n');
  await assert.rejects(collectCases({ ...input, summarySha256: '0'.repeat(64) }), /Summary changed/);
  await writeFile(join(root, 'data/test--one/cases/TEST-0/scope.diff'), 'tamper');
  await assert.rejects(collectCases(input));
});

test('CLI prepares only new private kit and reports incomplete; refuses overwrite/tamper', async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'd3-review-cli-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packet = join(root, 'packet'); await mkdir(packet);
  const input = await makePacket(packet);
  const kit = join(root, 'kit');
  const cli = resolve('scripts/d3-review/cli.mjs');
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', windowsHide: true });
  const prepareArgs = ['prepare', packet, kit, input.transferSha256, input.summaryPath, input.summarySha256];
  const overlapping = run('prepare', packet, join(packet, 'nested-output'), input.transferSha256, input.summaryPath, input.summarySha256);
  assert.equal(overlapping.status, 1);
  assert.match(overlapping.stderr, /outside original packet/);
  const result = run(...prepareArgs); assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.labels_created, 0);
  const preparedMethod = JSON.parse(await readFile(join(kit, 'method.json'), 'utf8'));
  assert.equal(preparedMethod.annotation_design, 'two-development-associated-authors-nonblind-ai-assisted-exploratory');
  assert.equal(run(...prepareArgs).status, 1);
  const status = run('status', kit, receipt.cases_sha256);
  assert.equal(status.status, 2);
  assert.equal(JSON.parse(status.stdout).research_complete, false);
  assert.equal(run('status', kit, '0'.repeat(64)).status, 1);
  const md = await readFile(join(kit, 'cases', 'TEST-0.md'), 'utf8');
  assert.match(md, /2 \| fetch/);
  assert.match(md, /No tool prediction/);
});

test('CLI checks pinned method bytes and both raw review hashes before comparison', async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'd3-review-method-cli-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { bundle, method, reviews } = setup();
  const artifactNames = { rubric_sha256: 'rubric.md', contract_sha256: 'contract.json', scope_sha256: 'scope.json', tool_pins_sha256: 'tool-pins.json', analysis_plan_sha256: 'analysis-plan.md' };
  for (const [key, name] of Object.entries(artifactNames)) {
    const bytes = `controlled test artifact: ${name}\n`;
    await writeFile(join(root, name), bytes);
    method[key] = sha256(bytes);
  }
  for (const review of reviews) review.method_sha256 = digest(method);
  await writeFile(join(root, 'cases.json'), encode(bundle));
  await writeFile(join(root, 'method.json'), encode(method));
  await writeFile(join(root, 'a.json'), encode(reviews[0]));
  await writeFile(join(root, 'b.json'), encode(reviews[1]));
  const run = (...args) => spawnSync(process.execPath, [resolve('scripts/d3-review/cli.mjs'), ...args], { encoding: 'utf8', windowsHide: true });
  const result = run('check', root, digest(bundle), join(root, 'a.json'));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).raw_file_sha256, sha256(encode(reviews[0])));
  const args = ['compare', root, digest(bundle), join(root, 'a.json'), join(root, 'b.json'), sha256(encode(reviews[0])), sha256(encode(reviews[1]))];
  const compared = run(...args);
  assert.equal(compared.status, 0, compared.stderr);
  assert.equal(JSON.parse(compared.stdout).chronology_verified, false);
  assert.equal(run(...args.slice(0, -1), '0'.repeat(64)).status, 1);
  await writeFile(join(root, 'rubric.md'), 'changed after method pin');
  assert.equal(run('check', root, digest(bundle), join(root, 'a.json')).status, 1);
});
