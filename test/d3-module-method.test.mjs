import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  ACCEPTED_SELECTED_CASES_SHA256,
  GUARDIAN_SOURCE_COMMIT,
  METHOD_ARTIFACT_PATHS,
  buildFreezeManifest,
  edgeKey,
  occurrenceKey,
  validateAcceptedD3Review,
  validateFreezeManifest,
  validateModuleReview,
} from '../scripts/d3-review/module-method.mjs';
import { gitId, sha256 } from '../scripts/d3-source-review/files.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

function sealedReviewFixture() {
  const base = 'a'.repeat(40), head = 'b'.repeat(40);
  const sourceText = "import './b.js';\n", sourceBytes = Buffer.from(sourceText);
  const sourceSha = sha256(sourceBytes), targetSha = 'd'.repeat(64);
  const sourceBlob = gitId('blob', sourceBytes), targetBlob = 'f'.repeat(40);
  const case_envelopes = Array.from({ length: 56 }, (_, index) => {
    const case_id = `FIXTURE-${String(index + 1).padStart(2, '0')}`;
    const occurrence = {
      repository: 'fixture/repository', case_id, side: 'head', commit: head,
      source_path: 'src/a.ts', start_line: 1, start_column: 1, syntax: 'import',
      quote: "import './b.js';", literal_specifier: './b.js', source_git_blob: sourceBlob, source_sha256: sourceSha,
      resolved_target_path: 'src/b.ts', target_git_blob: targetBlob, target_sha256: targetSha,
      source_group: 'group-a', target_group: 'group-b', disposition: 'resolved-in-scope', reason: 'Controlled fixture edge',
      resolver_evidence_refs: ['fixture://resolver'], ai_provenance: { used: false, human_verification: 'full' },
    };
    return { repository: 'fixture/repository', case_id, base, head,
      file_coverage: [
        { repository: 'fixture/repository', case_id, side: 'base', commit: base, path: 'src/a.ts', tree_mode: '100644', git_blob: sourceBlob,
          sha256: sourceSha, eligibility: 'eligible-production', review_status: 'reviewed', occurrence_count: 0, reason: 'Controlled zero-occurrence side' },
        { repository: 'fixture/repository', case_id, side: 'head', commit: head, path: 'src/a.ts', tree_mode: '100644', git_blob: sourceBlob,
          sha256: sourceSha, eligibility: 'eligible-production', review_status: 'reviewed', occurrence_count: 1, reason: 'Controlled occurrence side' },
      ], occurrences: [occurrence], edges: [{ repository: 'fixture/repository', case_id, side: 'head', commit: head,
        source_path: 'src/a.ts', target_path: 'src/b.ts', source_group: 'group-a', dependency: 'module-import', target_group: 'group-b', occurrence_keys: [occurrenceKey(occurrence)] }],
    };
  });
  return { schema: 'd3-module-inventory-review/2', status: 'original-sealed', method_manifest_sha256: '1'.repeat(64), cases_sha256: '2'.repeat(64),
    reviewer: { id: 'fixture-reviewer', relationship: 'development-associated-author', declaration_reference: 'fixture://declaration',
      declared_at_utc: '2026-01-01T00:00:00.000Z', prior_output_exposure: 'controlled fixture only',
      development_involvement: 'controlled fixture only', ai_assistance_summary: 'none for controlled fixture' }, case_envelopes };
}

function boundCases(review) {
  const cases = { cases: review.case_envelopes.map((e) => ({ repository: e.repository, id: e.case_id,
    base: e.base, head: e.head, scope_path_roles: [{ role: 'primary-candidate', path: 'src/a.ts' }],
    files: e.file_coverage.map((f) => ({ path: f.path, side: f.side, mode: f.tree_mode, git_blob: f.git_blob,
      sha256: f.sha256, citable: true, text: "import './b.js';\n" })) })),
  context_only_cases: [{}, {}, {}, {}] };
  const raw = Buffer.from(`${JSON.stringify(cases)}\n`);
  review.cases_sha256 = sha256(raw);
  return { cases, raw };
}

test('blank scaffold carries no declaration, labels, outputs or acceptance', async () => {
  const review = JSON.parse(await readFile(join(root, 'holdout/d3-module-method/v0.2.0/review.template.json')));
  assert.deepEqual(validateModuleReview(review), { status: 'BLANK_PREPARATION_NOT_A_REVIEW', research_complete: false, cases: 0 });
  assert.equal(review.reviewer.id, null);
  assert.equal(review.reviewer.prior_output_exposure, null);
  assert.deepEqual(review.case_envelopes, []);
});

test('legacy four-label sheet is categorically incompatible with module endpoint', () => {
  for (const schema of ['d3-author-review/1', 'd3-change-case-review/1']) {
    assert.throws(() => validateModuleReview({ schema, rows: [] }), /Legacy four-label review cannot satisfy/);
  }
  assert.throws(() => validateModuleReview({ schema: 'd3-module-inventory-review/2', status: 'original-sealed', method_manifest_sha256: 'a'.repeat(64),
    cases_sha256: 'b'.repeat(64), reviewer: { relationship: 'development-associated-author' }, case_envelopes: [] }), /56 primary cases/);
});

test('occurrence and edge identities retain physical location and exact endpoint', () => {
  const occurrence = { repository: 'fixture/repo', case_id: 'F-1', side: 'head', source_path: 'src/a.ts', start_line: 3,
    start_column: 8, syntax: 'import', literal_specifier: './b.js', resolved_target_path: 'src/b.ts' };
  const edge = { repository: 'fixture/repo', case_id: 'F-1', side: 'head', source_path: 'src/a.ts', target_path: 'src/b.ts',
    source_group: 'a', dependency: 'module-import', target_group: 'b' };
  assert.deepEqual(occurrenceKey(occurrence), ['fixture/repo', 'F-1', 'head', 'src/a.ts', 3, 8, 'import', './b.js', 'src/b.ts']);
  assert.deepEqual(edgeKey(edge), ['fixture/repo', 'F-1', 'head', 'src/a.ts', 'module-import', 'src/b.ts']);
});

test('sealed review requires an internally consistent occurrence-to-edge graph', () => {
  const review = sealedReviewFixture();
  assert.deepEqual(validateModuleReview(review), { status: 'STRUCTURALLY_VALID_NOT_SCIENTIFICALLY_VERIFIED', research_complete: false, cases: 56 });
});

test('review graph rejects wrong side, wrong groups, unresolved references and missing derived edges', () => {
  const mutations = [
    { message: /side differ/, apply: (r) => { r.case_envelopes[0].edges[0].side = 'base'; r.case_envelopes[0].edges[0].commit = r.case_envelopes[0].base; } },
    { message: /source group differ/, apply: (r) => { r.case_envelopes[0].edges[0].source_group = 'wrong-group'; } },
    { message: /target file differ/, apply: (r) => { r.case_envelopes[0].edges[0].target_path = 'src/wrong.ts'; } },
    { message: /Only resolved-in-scope/, apply: (r) => { const envelope = r.case_envelopes[0], o = envelope.occurrences[0];
      o.disposition = 'unresolved-target'; o.resolved_target_path = null; o.target_git_blob = null; o.target_sha256 = null;
      envelope.edges[0].occurrence_keys = [occurrenceKey(o)]; } },
    { message: /exactly one derived edge/, apply: (r) => { r.case_envelopes[0].edges = []; } },
  ];
  for (const mutation of mutations) {
    const review = sealedReviewFixture(); mutation.apply(review);
    assert.throws(() => validateModuleReview(review), mutation.message);
  }
});

test('file-side modes and review status cannot turn absence or symlinks into reviewed negatives', () => {
  for (const mutation of [
    (row) => { row.tree_mode = 'absent'; row.git_blob = null; row.sha256 = null; },
    (row) => { row.tree_mode = '120000'; row.sha256 = null; },
  ]) {
    const review = sealedReviewFixture();
    mutation(review.case_envelopes[0].file_coverage[0]);
    assert.throws(() => validateModuleReview(review), /cannot be an eligible/);
  }
});

test('each occurrence must match its reviewed regular source object and per-file count', () => {
  const mismatchedHash = sealedReviewFixture();
  mismatchedHash.case_envelopes[0].occurrences[0].source_sha256 = '0'.repeat(64);
  assert.throws(() => validateModuleReview(mismatchedHash), /source SHA-256 differs/);

  const offsetCount = sealedReviewFixture();
  const envelope = offsetCount.case_envelopes[0];
  envelope.file_coverage[1].occurrence_count = 0;
  envelope.file_coverage.push({ ...envelope.file_coverage[1], path: 'src/other.ts', occurrence_count: 1 });
  assert.throws(() => validateModuleReview(offsetCount), /occurrence count differs/);

  const excludedSource = sealedReviewFixture();
  const excludedEnvelope = excludedSource.case_envelopes[0];
  excludedEnvelope.file_coverage[1].eligibility = 'excluded-test';
  excludedEnvelope.file_coverage[1].review_status = 'excluded';
  excludedEnvelope.file_coverage[1].occurrence_count = null;
  excludedEnvelope.file_coverage.push({ ...excludedEnvelope.file_coverage[0], side: 'head', commit: excludedEnvelope.head,
    path: 'src/other.ts', review_status: 'reviewed', occurrence_count: 1 });
  assert.throws(() => validateModuleReview(excludedSource), /source file-side was not reviewed/);
});

test('case-bound review cannot add unselected source paths to its coverage', () => {
  const review = sealedReviewFixture();
  const { raw } = boundCases(review);
  assert.equal(validateModuleReview(review, raw).cases, 56);
  review.case_envelopes[0].file_coverage.push({ ...review.case_envelopes[0].file_coverage[0], path: 'src/extra.ts' });
  assert.throws(() => validateModuleReview(review, raw), /differs from primary-candidate scope/);
});

test('case-bound review verifies pinned source bytes and exact occurrence position', () => {
  const review = sealedReviewFixture();
  const { cases, raw } = boundCases(review);
  assert.equal(validateModuleReview(review, raw).cases, 56);

  assert.throws(() => validateModuleReview(review, cases), /requires original raw case bytes/);
  const alteredRaw = Buffer.from(`${JSON.stringify(cases)} `);
  assert.throws(() => validateModuleReview(review, alteredRaw), /raw SHA-256 differs from review pin/);

  const changedSource = structuredClone(cases);
  changedSource.cases[0].files[1].text = "import './different.js';\n";
  const changedRaw = Buffer.from(`${JSON.stringify(changedSource)}\n`);
  review.cases_sha256 = sha256(changedRaw);
  assert.throws(() => validateModuleReview(review, changedRaw), /source text differs from the pinned SHA-256/);
  review.cases_sha256 = sha256(raw);

  const shiftedQuote = structuredClone(review);
  shiftedQuote.case_envelopes[0].occurrences[0].start_column = 2;
  shiftedQuote.case_envelopes[0].edges[0].occurrence_keys = [occurrenceKey(shiftedQuote.case_envelopes[0].occurrences[0])];
  assert.throws(() => validateModuleReview(shiftedQuote, raw), /quote differs from the exact source position/);

  const missingSource = structuredClone(cases);
  missingSource.cases[0].files.pop();
  const missingRaw = Buffer.from(`${JSON.stringify(missingSource)}\n`);
  review.cases_sha256 = sha256(missingRaw);
  assert.throws(() => validateModuleReview(review, missingRaw), /File-side source is missing/);
});

test('official D3 review cannot substitute a self-pinned synthetic case bundle', () => {
  const review = sealedReviewFixture();
  const { raw } = boundCases(review);
  assert.equal(validateModuleReview(review, raw).cases, 56);
  assert.throws(() => validateAcceptedD3Review(review, raw), /not pinned to the accepted selected D3 case bundle/);
  review.cases_sha256 = ACCEPTED_SELECTED_CASES_SHA256;
  assert.throws(() => validateAcceptedD3Review(review, raw), /Raw case bundle differs from the accepted D3 scope/);
  assert.throws(() => validateAcceptedD3Review(review, JSON.parse(raw)), /requires original raw case bytes/);
});

test('freeze manifest binds the merged development receipt without pretending method acceptance', async () => {
  const manifest = await buildFreezeManifest(root);
  assert.equal(manifest.guardian_source_commit, GUARDIAN_SOURCE_COMMIT);
  assert.equal(manifest.endpoint, 'direct-module-occurrences-and-deduplicated-cross-group-file-edges');
  assert.deepEqual(manifest.artifacts.map((row) => row.path), [...METHOD_ARTIFACT_PATHS]);
  assert.deepEqual(manifest.human_acceptance, { hieu: null, hoang: null });
  const report = await validateFreezeManifest(manifest, root);
  assert.equal(report.status, 'VERIFIED_PROPOSAL_NOT_READY_TO_FREEZE');
  assert.equal(report.tools.guardian_source_pinned, true);
  assert.equal(report.tools.development_packet_bound, true);
  assert.equal(report.tools.occurrence_scoring_supported, false);
  assert.equal(report.tools.fixture_freeze_complete, false);
  assert.deepEqual(report.tools.missing_package_pins,
    ['guardian.package_version', 'guardian.package_sha256', 'guardian.configuration_sha256', 'dependency_cruiser.package_sha256']);
  assert.equal(report.open_gates.reviewed_applicability_ledger_missing, true);
  assert.equal(report.open_gates.development_fixture_not_research_freeze, true);
  assert.deepEqual(report.common_capability_receipt,
    { cases: 7, common_fixture_passes: 2, failed_common_candidates: 1, unsupported_probes: 4, d3_executed: false });
  assert(report.resolver.unresolved.includes('source_eligibility'));
});

test('freeze manifest fails closed after a byte changes', async (t) => {
  const temp = await mkdtemp(join(tmpdir(), 'd3-module-method-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  await mkdir(join(temp, 'development/common-module-capability'), { recursive: true });
  await cp(join(root, 'development/common-module-capability/receipt'),
    join(temp, 'development/common-module-capability/receipt'), { recursive: true });
  for (const path of METHOD_ARTIFACT_PATHS) {
    const destination = join(temp, path); await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, await readFile(join(root, path)));
  }
  const manifest = await buildFreezeManifest(temp);
  const target = join(temp, METHOD_ARTIFACT_PATHS[0]);
  await writeFile(target, Buffer.concat([await readFile(target), Buffer.from(' ')]));
  await assert.rejects(() => validateFreezeManifest(manifest, temp), /Method artifact changed/);
});

test('statistical plan leaves zero-denominator recall unestimated', async () => {
  const planBytes = await readFile(join(root, 'holdout/d3-module-method/v0.2.0/statistical-plan.template.json'));
  const plan = JSON.parse(planBytes);
  assert.match(plan.metrics.recall, /null with reason when denominator is zero/);
  assert.match(plan.zero_positive_policy, /Never report 100% recall/);
  assert.equal(plan.tasks.occurrence.comparative_scoring_supported, false);
  assert.equal(sha256(planBytes).length, 64);
});
