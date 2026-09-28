import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gitId, sha256 } from '../d3-source-review/files.mjs';
import { isSafeHoldoutPath } from '../lib/holdout.mjs';
import { verifyReceipt as verifyCommonCapabilityReceipt } from '../../development/common-module-capability/verify.mjs';
import { verifyV3 as verifyModeCapabilityReceipt } from '../../development/common-module-capability-modes-v3/runner.mjs';

export const METHOD_VERSION = '0.2.0';
export const GUARDIAN_SOURCE_COMMIT = 'e32ef53eeb07bc8c904b6a1e6a8b897d16def820';
export const COMMON_CAPABILITY_MERGE_COMMIT = 'efc1a14bc650056f98fd2093c79effb79ce7cc87';
export const COMMON_CAPABILITY_RECEIPT_SHA256 = '83962338666783d771469c5bc36092857be46987cbc14729326abe7cc6c8d4a9';
export const PACKAGE_PREFLIGHT_MERGE_COMMIT = 'ab0a93266601bc45cf817f1771fba8d37cb062c7';
export const PACKAGE_PREFLIGHT_RECEIPT_SHA256 = '8babd058869f5c81027ba3e6091ccc3df0de460a43766c01c67d6c473e0276c5';
export const ACCEPTED_SELECTED_CASES_SHA256 = '44cc064a3555c90cc20d2a38ab61d67c6af598c1825bf5290cca2269ec801d35';
export const LEGACY_REVIEW_SCHEMAS = Object.freeze(['d3-author-review/1', 'd3-change-case-review/1']);
const hex = /^[a-f0-9]{64}$/u;
const oid = /^[a-f0-9]{40}$/u;
const text = (v) => typeof v === 'string' && v.trim().length > 0;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const methodDir = `holdout/d3-module-method/v${METHOD_VERSION}`;

export const METHOD_ARTIFACT_PATHS = Object.freeze([
  'holdout/D3-ANALYSIS-PLAN.v0.2.0.md',
  `${methodDir}/README.md`,
  `${methodDir}/applicability-reviewed.template.json`,
  `${methodDir}/file-coverage.schema.json`,
  `${methodDir}/freeze-manifest.schema.json`,
  `${methodDir}/module-edge.schema.json`,
  `${methodDir}/occurrence.schema.json`,
  `${methodDir}/resolver-policy.template.json`,
  `${methodDir}/review.schema.json`,
  `${methodDir}/review.template.json`,
  `${methodDir}/statistical-plan.template.json`,
  `${methodDir}/tool-pins.template.json`,
  'holdout/d3-package-preflight/README.md',
  'holdout/d3-package-preflight/receipt.json',
  'holdout/d3-package-archives/README.md',
  'holdout/d3-package-archives/archsync-guardian-0.3.3.tgz',
  'holdout/d3-package-archives/dependency-cruiser-18.3.0.tgz',
  'holdout/d3-project-config-preparation/README.md',
  'holdout/d3-project-config-preparation/inventory.json',
  'development/common-module-capability/README.md',
  'development/common-module-capability/capture.mjs',
  'development/common-module-capability/dependency-cruiser.json',
  'development/common-module-capability/fixtures.json',
  'development/common-module-capability/guardian-pin.json',
  'development/common-module-capability/receipt/manifest.json',
  'development/common-module-capability/tools/guardian/module-dependencies.js',
  'development/common-module-capability/tools/guardian/module-dependencies.ts',
  'development/common-module-capability/tools/package-lock.json',
  'development/common-module-capability/tools/package.json',
  'development/common-module-capability/verify.mjs',
  'development/common-module-capability-modes-v3/README.md',
  'development/common-module-capability-modes-v3/dependency-cruiser.json',
  'development/common-module-capability-modes-v3/profile.json',
  'development/common-module-capability-modes-v3/receipt-hypothesis/manifest.json',
  'development/common-module-capability-modes-v3/receipt/manifest.json',
  'development/common-module-capability-modes-v3/runner.mjs',
  'scripts/d3-review/module-method.mjs',
  'scripts/d3-review/project-config-preparation.mjs',
  'scripts/verify-d3-package-preflight.mjs',
  'test/d3-archive-packet.test.mjs',
  'test/d3-module-method.test.mjs',
  'test/d3-mode-qualification.test.mjs',
  'test/d3-project-config-preparation.test.mjs',
].sort());

function safe(path) {
  assert(isSafeHoldoutPath(path) && METHOD_ARTIFACT_PATHS.includes(path), `Unsafe method artifact path: ${path}`);
}

export function occurrenceKey(o) {
  return [o.repository, o.case_id, o.side, o.source_path, o.start_line, o.start_column, o.syntax, o.literal_specifier, o.resolved_target_path];
}

export function edgeKey(e) {
  return [e.repository, e.case_id, e.side, e.source_path, e.dependency, e.target_path];
}

function validateCoverage(row, envelope) {
  assert.equal(row.repository, envelope.repository); assert.equal(row.case_id, envelope.case_id);
  assert(['base', 'head'].includes(row.side) && row.commit === envelope[row.side]);
  assert(isSafeHoldoutPath(row.path));
  assert(['100644', '100755', '120000', 'absent'].includes(row.tree_mode));
  assert(row.tree_mode === 'absent' ? row.git_blob === null && row.sha256 === null : oid.test(row.git_blob));
  assert(row.tree_mode === '120000' ? row.sha256 === null : row.tree_mode === 'absent' || hex.test(row.sha256));
  assert(['eligible-production', 'excluded-test', 'excluded-generated', 'excluded-vendor', 'excluded-extension', 'symlink-not-followed', 'absent-at-side', 'unknown'].includes(row.eligibility));
  assert(['reviewed', 'excluded', 'missing', 'unknown'].includes(row.review_status));
  if (row.tree_mode === 'absent') {
    assert.equal(row.eligibility, 'absent-at-side', 'An absent side cannot be an eligible source file');
    assert.equal(row.review_status, 'missing', 'An absent side cannot be source-reviewed');
  } else if (row.tree_mode === '120000') {
    assert.equal(row.eligibility, 'symlink-not-followed', 'A symlink cannot be an eligible regular source file');
    assert.equal(row.review_status, 'excluded', 'A symlink cannot be source-reviewed');
  } else {
    assert(!['absent-at-side', 'symlink-not-followed'].includes(row.eligibility), 'A regular file cannot have absent/symlink eligibility');
  }
  if (row.review_status === 'reviewed') assert.equal(row.eligibility, 'eligible-production', 'Only eligible production files may be source-reviewed');
  if (row.eligibility.startsWith('excluded-')) assert.equal(row.review_status, 'excluded', 'Excluded files cannot be source-reviewed');
  assert(row.review_status === 'reviewed' ? Number.isInteger(row.occurrence_count) && row.occurrence_count >= 0 : row.occurrence_count === null);
  assert(text(row.reason));
}

function validateOccurrence(row, envelope) {
  assert.equal(row.repository, envelope.repository); assert.equal(row.case_id, envelope.case_id);
  assert(['base', 'head'].includes(row.side) && row.commit === envelope[row.side]);
  assert(isSafeHoldoutPath(row.source_path)); assert(Number.isInteger(row.start_line) && row.start_line > 0);
  assert(Number.isInteger(row.start_column) && row.start_column > 0);
  assert(['import', 're-export', 'require', 'dynamic-import'].includes(row.syntax));
  assert([row.quote, row.literal_specifier, row.reason].every(text));
  assert(oid.test(row.source_git_blob) && hex.test(row.source_sha256));
  assert(['resolved-in-scope', 'resolved-out-of-scope', 'unresolved-target', 'unsupported-syntax-or-resolver', 'missing-or-conflicting-source'].includes(row.disposition));
  const resolved = row.disposition === 'resolved-in-scope';
  assert(resolved ? [row.resolved_target_path, row.source_group, row.target_group].every(text) : true);
  assert(Array.isArray(row.resolver_evidence_refs) && row.resolver_evidence_refs.length > 0 && row.resolver_evidence_refs.every(text));
  assert(row.ai_provenance && typeof row.ai_provenance.used === 'boolean');
  assert(['full', 'sampled', 'not-checked'].includes(row.ai_provenance.human_verification));
  if (row.ai_provenance.used) {
    assert([row.ai_provenance.tool_model, row.ai_provenance.input_scope, row.ai_provenance.output_reference].every(text));
    assert(Array.isArray(row.ai_provenance.input_sha256) && row.ai_provenance.input_sha256.length > 0 && row.ai_provenance.input_sha256.every(hex.test.bind(hex)));
    assert(hex.test(row.ai_provenance.output_sha256) && typeof row.ai_provenance.shared === 'boolean');
  }
}

/** Structural check only. It never establishes source truth, reviewer identity or acceptance. */
export function validateModuleReview(review, casesRawBytes = null) {
  assert(!LEGACY_REVIEW_SCHEMAS.includes(review?.schema), 'Legacy four-label review cannot satisfy the module occurrence/edge endpoint');
  assert.equal(review?.schema, 'd3-module-inventory-review/2');
  assert(['blank-preparation', 'original-sealed', 'adjudicated'].includes(review.status));
  assert.equal(review.reviewer?.relationship, 'development-associated-author');
  assert(Array.isArray(review.case_envelopes));
  if (review.status === 'blank-preparation') {
    assert.equal(review.method_manifest_sha256, null); assert.equal(review.cases_sha256, null);
    assert.deepEqual(review.case_envelopes, []);
    for (const key of ['id', 'declaration_reference', 'declared_at_utc', 'prior_output_exposure', 'development_involvement', 'ai_assistance_summary']) assert.equal(review.reviewer[key], null);
    return { status: 'BLANK_PREPARATION_NOT_A_REVIEW', research_complete: false, cases: 0 };
  }
  assert(hex.test(review.method_manifest_sha256) && hex.test(review.cases_sha256));
  assert(review.case_envelopes.length === 56, 'A sealed review must contain all 56 primary cases');
  assert([review.reviewer.id, review.reviewer.declaration_reference, review.reviewer.declared_at_utc,
    review.reviewer.prior_output_exposure, review.reviewer.development_involvement, review.reviewer.ai_assistance_summary].every(text), 'Actual reviewer declaration is required');
  const seenCases = new Set(), occurrenceKeys = new Set();
  for (const envelope of review.case_envelopes) {
    assert([envelope.repository, envelope.case_id].every(text) && oid.test(envelope.base) && oid.test(envelope.head));
    const caseKey = JSON.stringify([envelope.repository, envelope.case_id]);
    assert(!seenCases.has(caseKey), 'Duplicate case envelope'); seenCases.add(caseKey);
    assert(Array.isArray(envelope.file_coverage) && Array.isArray(envelope.occurrences) && Array.isArray(envelope.edges));
    const coverageByKey = new Map(), localOccurrences = new Map(), occurrenceCounts = new Map();
    for (const row of envelope.file_coverage) {
      validateCoverage(row, envelope);
      const key = JSON.stringify([row.side, row.path]); assert(!coverageByKey.has(key), 'Duplicate file-side coverage'); coverageByKey.set(key, row);
    }
    for (const row of envelope.occurrences) {
      validateOccurrence(row, envelope); const key = JSON.stringify(occurrenceKey(row));
      assert(!occurrenceKeys.has(key), 'Duplicate occurrence key'); occurrenceKeys.add(key); localOccurrences.set(key, row);
      const coverageKey = JSON.stringify([row.side, row.source_path]);
      const coverage = coverageByKey.get(coverageKey);
      assert(coverage, 'Occurrence lacks file-side coverage');
      assert.equal(coverage.review_status, 'reviewed', 'Occurrence source file-side was not reviewed');
      assert.equal(coverage.eligibility, 'eligible-production', 'Occurrence source file-side is not eligible production');
      assert.equal(row.source_git_blob, coverage.git_blob, 'Occurrence source Git blob differs from file-side coverage');
      assert.equal(row.source_sha256, coverage.sha256, 'Occurrence source SHA-256 differs from file-side coverage');
      occurrenceCounts.set(coverageKey, (occurrenceCounts.get(coverageKey) ?? 0) + 1);
    }
    for (const [key, coverage] of coverageByKey) if (coverage.review_status === 'reviewed')
      assert.equal(coverage.occurrence_count, occurrenceCounts.get(key) ?? 0, 'Reviewed file occurrence count differs from its inventory');
    const seenEdges = new Set(), referenceCounts = new Map();
    for (const edge of envelope.edges) {
      assert.equal(edge.repository, envelope.repository); assert.equal(edge.case_id, envelope.case_id);
      assert(['base', 'head'].includes(edge.side) && edge.commit === envelope[edge.side]);
      assert(edge.dependency === 'module-import' && [edge.source_group, edge.target_group].every(text));
      assert(isSafeHoldoutPath(edge.source_path) && isSafeHoldoutPath(edge.target_path));
      assert.notEqual(edge.source_group, edge.target_group, 'Only cross-group file edges are in the common comparison');
      const key = JSON.stringify(edgeKey(edge)); assert(!seenEdges.has(key), 'Duplicate module edge'); seenEdges.add(key);
      assert(Array.isArray(edge.occurrence_keys) && edge.occurrence_keys.length > 0);
      const edgeReferences = new Set();
      for (const occurrenceKeyValue of edge.occurrence_keys) {
        const occurrenceKeyString = JSON.stringify(occurrenceKeyValue);
        assert(!edgeReferences.has(occurrenceKeyString), 'Duplicate occurrence reference in module edge'); edgeReferences.add(occurrenceKeyString);
        const occurrence = localOccurrences.get(occurrenceKeyString);
        assert(occurrence, 'Edge references an unknown occurrence in its case envelope');
        assert.equal(occurrence.side, edge.side, 'Edge and occurrence side differ');
        assert.equal(occurrence.commit, edge.commit, 'Edge and occurrence commit differ');
        assert.equal(occurrence.disposition, 'resolved-in-scope', 'Only resolved-in-scope occurrences may support an edge');
        assert.equal(occurrence.source_path, edge.source_path, 'Edge and occurrence source file differ');
        assert.equal(occurrence.resolved_target_path, edge.target_path, 'Edge and occurrence target file differ');
        assert.equal(occurrence.source_group, edge.source_group, 'Edge and occurrence source group differ');
        assert.equal(occurrence.target_group, edge.target_group, 'Edge and occurrence target group differ');
        referenceCounts.set(occurrenceKeyString, (referenceCounts.get(occurrenceKeyString) ?? 0) + 1);
      }
    }
    for (const [key, occurrence] of localOccurrences) {
      const expected = occurrence.disposition === 'resolved-in-scope' ? 1 : 0;
      assert.equal(referenceCounts.get(key) ?? 0, expected,
        occurrence.disposition === 'resolved-in-scope'
          ? 'Every resolved-in-scope occurrence must support exactly one derived edge'
          : 'Non-resolved occurrence must not support a derived edge');
    }
  }
  if (casesRawBytes !== null) {
    assert(Buffer.isBuffer(casesRawBytes), 'Case-bound review requires original raw case bytes');
    assert.equal(sha256(casesRawBytes), review.cases_sha256, 'Selected case bundle raw SHA-256 differs from review pin');
    const cases = JSON.parse(casesRawBytes.toString('utf8'));
    assert.equal(cases.cases.length, 56); assert.equal(cases.context_only_cases.length, 4);
    const expected = new Map(cases.cases.map((c) => [JSON.stringify([c.repository, c.id]), c]));
    assert.deepEqual(new Set(seenCases), new Set(expected.keys()), 'Review case population differs from selected 56-case scope');
    for (const envelope of review.case_envelopes) {
      const item = expected.get(JSON.stringify([envelope.repository, envelope.case_id]));
      assert.equal(envelope.base, item.base); assert.equal(envelope.head, item.head);
      const expectedPaths = item.scope_path_roles.filter((r) => r.role === 'primary-candidate').map((r) => r.path);
      const expectedCoverage = new Set(['base', 'head'].flatMap((side) => expectedPaths.map((path) => JSON.stringify([side, path]))));
      assert.deepEqual(new Set(envelope.file_coverage.map((r) => JSON.stringify([r.side, r.path]))), expectedCoverage,
        `File-side coverage differs from primary-candidate scope: ${envelope.case_id}`);
      assert(Array.isArray(item.files), 'Verified case source files are required for a case-bound review');
      const sourceBySidePath = new Map();
      for (const source of item.files) {
        const sourceKey = JSON.stringify([source.side, source.path]);
        assert(!sourceBySidePath.has(sourceKey), 'Duplicate source file-side in case packet');
        sourceBySidePath.set(sourceKey, source);
      }
      for (const coverage of envelope.file_coverage) {
        const source = sourceBySidePath.get(JSON.stringify([coverage.side, coverage.path]));
        if (coverage.tree_mode === 'absent') {
          assert.equal(source, undefined, 'An absent file-side has source bytes in the case packet');
          continue;
        }
        assert(source, 'File-side source is missing from the case packet');
        assert.equal(coverage.tree_mode, source.mode, 'File-side Git mode differs from the case packet');
        assert.equal(coverage.git_blob, source.git_blob, 'File-side Git blob differs from the case packet');
        if (coverage.tree_mode === '120000') continue;
        assert.equal(coverage.sha256, source.sha256, 'File-side SHA-256 differs from the case packet');
        if (coverage.review_status !== 'reviewed') continue;
        assert(source.citable === true && typeof source.text === 'string', 'Reviewed source is not citable text');
        const bytes = Buffer.from(source.text, 'utf8');
        assert.equal(sha256(bytes), coverage.sha256, 'Reviewed source text differs from the pinned SHA-256');
        assert.equal(gitId('blob', bytes), coverage.git_blob, 'Reviewed source text differs from the pinned Git blob');
      }
      for (const occurrence of envelope.occurrences) {
        const source = sourceBySidePath.get(JSON.stringify([occurrence.side, occurrence.source_path]));
        assert(source?.citable === true && typeof source.text === 'string', 'Occurrence has no citable source text');
        const lines = source.text.split(/\r\n|[\r\n\u2028\u2029]/u);
        if (source.text === '' || /[\r\n\u2028\u2029]$/u.test(source.text)) lines.pop();
        const line = lines[occurrence.start_line - 1];
        assert(line !== undefined && occurrence.start_column <= line.length + 1, 'Occurrence location is outside source text');
        const starts = [0];
        for (const match of source.text.matchAll(/\r\n|[\r\n\u2028\u2029]/gu)) starts.push(match.index + match[0].length);
        const offset = starts[occurrence.start_line - 1] + occurrence.start_column - 1;
        assert(source.text.startsWith(occurrence.quote, offset), 'Occurrence quote differs from the exact source position');
      }
    }
  }
  return { status: 'STRUCTURALLY_VALID_NOT_SCIENTIFICALLY_VERIFIED', research_complete: false, cases: seenCases.size };
}

/** Official selected-scope binding; structural validity is still not scientific truth or method acceptance. */
export function validateAcceptedD3Review(review, casesRawBytes) {
  assert.equal(review?.cases_sha256, ACCEPTED_SELECTED_CASES_SHA256, 'Review is not pinned to the accepted selected D3 case bundle');
  assert(Buffer.isBuffer(casesRawBytes), 'Accepted D3 review requires original raw case bytes');
  assert.equal(sha256(casesRawBytes), ACCEPTED_SELECTED_CASES_SHA256, 'Raw case bundle differs from the accepted D3 scope');
  return validateModuleReview(review, casesRawBytes);
}

export function validatePolicyScaffold(policy) {
  assert.equal(policy.schema, 'd3-module-resolver-policy/2'); assert.equal(policy.version, METHOD_VERSION);
  assert.equal(policy.status, 'proposal-not-accepted');
  const dimensions = ['source_eligibility', 'esm_runtime_bindings', 'require_and_dynamic_import', 'relative_target_resolution', 'project_configuration', 'package_and_workspace_resolution', 'git_trees_and_symlinks', 'tool_normalization'];
  assert.deepEqual(Object.keys(policy.decisions), dimensions);
  assert.deepEqual(policy.unknown_policy.truth_dispositions,
    ['unresolved-target', 'unsupported-syntax-or-resolver', 'missing-or-conflicting-source']);
  assert.match(policy.unknown_policy.file_side, /unscorable for both tools/u);
  assert.match(policy.unknown_policy.case_side, /unscorable/u);
  assert.match(policy.unknown_policy.tool_failure, /failed attempted run/u);
  assert.match(policy.unknown_policy.adjudication, /remains Unknown/u);
  assert.equal(policy.human_acceptance.hieu, null); assert.equal(policy.human_acceptance.hoang, null);
  return { unresolved: dimensions.filter((key) => !text(policy.decisions[key])), accepted: false };
}

export function validateStatisticalPlan(plan) {
  assert.equal(plan.schema, 'd3-module-statistical-plan/2'); assert.equal(plan.version, METHOD_VERSION);
  assert.deepEqual(plan.population, { captured_cases: 60, primary_attempts: 56, context_only: 4,
    repositories: { 'hyperdxio/hyperdx': 19, 'amruthpillai/reactive-resume': 17, 'ether/etherpad': 20 } });
  assert.match(plan.metrics.precision, /null/u); assert.match(plan.metrics.recall, /null/u);
  assert.equal(plan.tasks.occurrence.comparative_scoring_supported, false);
  assert.match(plan.tasks.occurrence.reason, /no physical source positions/u);
  assert.deepEqual(plan.tasks.module_edge.deduplicate_by, ['repository', 'case_id', 'side', 'source_path', 'dependency', 'target_path']);
  assert.match(plan.zero_positive_policy, /Never report 100% recall/u);
  assert.equal(plan.human_acceptance.hieu, null); assert.equal(plan.human_acceptance.hoang, null);
  return { accepted: false, primary_attempts: 56 };
}

export function validateToolPins(pins) {
  assert.equal(pins.schema, 'd3-module-tool-pins/2'); assert.equal(pins.version, METHOD_VERSION);
  assert.equal(pins.tools.guardian.source_commit, GUARDIAN_SOURCE_COMMIT);
  assert.equal(pins.tools.guardian.repository, 'Little-Boy-s-ArchSync/archsync-guardian');
  assert.equal(pins.tools.guardian.package_version, '0.3.3');
  assert.equal(pins.tools.guardian.package_sha256, '7e87d932b0da6b930de9da229f3da439ca1b9ee826d40566fb320692c03b217f');
  assert.equal(pins.tools.guardian.package_content_sha256, '608e9213681f9172103463e63da8bafc46291e28f1b577e6744344c972c677be');
  assert.equal(pins.tools.dependency_cruiser.package_name, 'dependency-cruiser');
  assert.equal(pins.tools.dependency_cruiser.package_version, '18.3.0');
  assert.equal(pins.tools.dependency_cruiser.package_sha256, '268d21e1e4060717289db373a7f9fcc2c912e6ef9720d8b34575fe1cd965da93');
  assert.equal(pins.tools.dependency_cruiser.configuration_sha256, null,
    'No comparator configuration is selected before capability reconciliation');
  assert.equal(pins.tools.dependency_cruiser.configuration_reconciliation_complete, false);
  assert.deepEqual(pins.tools.dependency_cruiser.candidate_configurations, {
    original_common_fixture: {
      path: 'development/common-module-capability/dependency-cruiser.json',
      sha256: '451b1ece50e08129425cc76c5fc314ae121be68571e01ce23ce7c0d8d38711b6',
    },
    compiler_mode_fixture: {
      path: 'development/common-module-capability-modes-v3/dependency-cruiser.json',
      sha256: '422d947bbb0c59321eaa3bf5b4e87c3efeb2107f4655bd168c2c7f5ed4ea6333',
    },
  });
  assert.notEqual(pins.tools.dependency_cruiser.candidate_configurations.original_common_fixture.sha256,
    pins.tools.dependency_cruiser.candidate_configurations.compiler_mode_fixture.sha256);
  assert.equal(pins.tools.guardian.non_d3_fixture_receipt_sha256, COMMON_CAPABILITY_RECEIPT_SHA256);
  assert.equal(pins.tools.dependency_cruiser.non_d3_fixture_receipt_sha256, COMMON_CAPABILITY_RECEIPT_SHA256);
  assert.equal(pins.common_capability_packet.merged_benchmark_commit, COMMON_CAPABILITY_MERGE_COMMIT);
  assert.equal(pins.common_capability_packet.receipt_manifest_sha256, COMMON_CAPABILITY_RECEIPT_SHA256);
  assert.equal(pins.common_capability_packet.comparison_capability, 'cross-group-file-edge-only');
  assert.equal(pins.common_capability_packet.occurrence_scoring_supported, false);
  assert.deepEqual([pins.common_capability_packet.cases, pins.common_capability_packet.common_fixture_passes,
    pins.common_capability_packet.failed_common_candidates, pins.common_capability_packet.unsupported_probes], [7, 2, 1, 4]);
  assert.equal(pins.common_capability_packet.d3_executed, false);
  assert.equal(pins.common_capability_packet.research_complete, false);
  assert.equal(pins.package_preflight.merged_benchmark_commit, PACKAGE_PREFLIGHT_MERGE_COMMIT);
  assert.equal(pins.package_preflight.receipt_sha256, PACKAGE_PREFLIGHT_RECEIPT_SHA256);
  assert.equal(pins.package_preflight.status, 'candidate_package_preflight_not_method_freeze');
  assert.equal(pins.package_preflight.archives_committed, false);
  assert.equal(pins.package_preflight.independent_reproduction_complete, false);
  assert.equal(pins.package_preflight.d3_executed, false);
  assert.equal(pins.package_preflight.research_complete, false);
  assert.equal(pins.archive_packet.status, 'candidate-archives-retained-not-independent-method-freeze');
  assert.equal(pins.archive_packet.guardian_path, 'holdout/d3-package-archives/archsync-guardian-0.3.3.tgz');
  assert.equal(pins.archive_packet.guardian_sha256, pins.tools.guardian.package_sha256);
  assert.equal(pins.archive_packet.comparator_path, 'holdout/d3-package-archives/dependency-cruiser-18.3.0.tgz');
  assert.equal(pins.archive_packet.comparator_sha256, pins.tools.dependency_cruiser.package_sha256);
  assert.equal(pins.archive_packet.bytes_retained, true);
  assert.equal(pins.archive_packet.independent_person_reproduction_complete, false);
  assert.equal(pins.archive_packet.d3_executed, false);
  assert.equal(pins.human_acceptance.hieu, null); assert.equal(pins.human_acceptance.hoang, null);
  const missingPackagePins = [
    ['guardian.configuration_sha256', pins.tools.guardian.configuration_sha256],
    ['dependency_cruiser.configuration_sha256', pins.tools.dependency_cruiser.configuration_sha256],
  ].filter(([, value]) => !text(value)).map(([name]) => name);
  return { guardian_source_pinned: true, development_packet_bound: true, occurrence_scoring_supported: false,
    candidate_package_receipt_bound: true, package_archives_available: true, independent_package_reproduction_complete: false,
    fixture_freeze_complete: false, missing_package_pins: missingPackagePins,
    comparator_configuration_candidates: pins.tools.dependency_cruiser.candidate_configurations,
    comparator_configuration_reconciliation_complete: false, accepted: false };
}

function validatePackagePreflight(receipt) {
  assert.equal(receipt.schema_version, 1);
  assert.equal(receipt.status, 'candidate_package_preflight_not_method_freeze');
  assert.deepEqual(receipt.environment, { os: 'Windows', node: '22.16.0', pnpm: '11.16.0' });
  assert.equal(receipt.guardian.source_repository, 'Little-Boy-s-ArchSync/archsync-guardian');
  assert.equal(receipt.guardian.source_commit, GUARDIAN_SOURCE_COMMIT);
  assert.equal(receipt.guardian.package_name, '@archsync/guardian');
  assert.equal(receipt.guardian.package_version, '0.3.3');
  assert.equal(receipt.guardian.archive_sha256, '7e87d932b0da6b930de9da229f3da439ca1b9ee826d40566fb320692c03b217f');
  assert.equal(receipt.guardian.package_content_sha256, '608e9213681f9172103463e63da8bafc46291e28f1b577e6744344c972c677be');
  assert.equal(receipt.guardian.module_analyzer_version, '0.1.0-development');
  assert.equal(receipt.comparator.registry_package, 'dependency-cruiser');
  assert.equal(receipt.comparator.package_version, '18.3.0');
  assert.equal(receipt.comparator.archive_sha256, '268d21e1e4060717289db373a7f9fcc2c912e6ef9720d8b34575fe1cd965da93');
  assert.equal(receipt.selected_source_bundle_sha256, ACCEPTED_SELECTED_CASES_SHA256);
  return { status: receipt.status, guardian_package: '@archsync/guardian@0.3.3', comparator_package: 'dependency-cruiser@18.3.0',
    archives_available: false, independently_reproduced: false, d3_executed: false, research_complete: false };
}

export async function buildFreezeManifest(repoRoot = root) {
  const artifacts = [];
  for (const path of METHOD_ARTIFACT_PATHS) {
    safe(path); const bytes = await readFile(join(repoRoot, path));
    artifacts.push({ path, sha256: sha256(bytes), bytes: bytes.length });
  }
  return {
    schema: 'd3-module-method-freeze-manifest/2', version: METHOD_VERSION, status: 'proposal-not-accepted',
    endpoint: 'direct-module-occurrences-and-deduplicated-cross-group-file-edges',
    guardian_source_commit: GUARDIAN_SOURCE_COMMIT,
    legacy_review_schemas_rejected: [...LEGACY_REVIEW_SCHEMAS], artifacts,
    scientific_claims: { labels_created: false, predictions_executed: false, results_computed: false, d3_complete: false },
    human_acceptance: { hieu: null, hoang: null },
  };
}

export async function validateFreezeManifest(manifest, repoRoot = root) {
  assert.equal(manifest.schema, 'd3-module-method-freeze-manifest/2'); assert.equal(manifest.version, METHOD_VERSION);
  assert.equal(manifest.status, 'proposal-not-accepted'); assert.equal(manifest.guardian_source_commit, GUARDIAN_SOURCE_COMMIT);
  assert.equal(manifest.endpoint, 'direct-module-occurrences-and-deduplicated-cross-group-file-edges');
  assert.deepEqual(manifest.legacy_review_schemas_rejected, [...LEGACY_REVIEW_SCHEMAS]);
  assert.deepEqual(manifest.artifacts.map((a) => a.path), [...METHOD_ARTIFACT_PATHS]);
  for (const artifact of manifest.artifacts) {
    safe(artifact.path); const bytes = await readFile(join(repoRoot, artifact.path));
    assert.equal(artifact.sha256, sha256(bytes), `Method artifact changed: ${artifact.path}`);
    assert.equal(artifact.bytes, bytes.length, `Method artifact size changed: ${artifact.path}`);
  }
  const retainedPins = JSON.parse(await readFile(join(repoRoot, `${methodDir}/tool-pins.template.json`)));
  for (const [path, hash] of [[retainedPins.archive_packet.guardian_path, retainedPins.archive_packet.guardian_sha256],
    [retainedPins.archive_packet.comparator_path, retainedPins.archive_packet.comparator_sha256]]) {
    assert.equal(manifest.artifacts.find((artifact) => artifact.path === path)?.sha256, hash,
      `Retained archive differs from pinned package: ${path}`);
  }
  assert.deepEqual(manifest.scientific_claims, { labels_created: false, predictions_executed: false, results_computed: false, d3_complete: false });
  assert.equal(manifest.human_acceptance.hieu, null); assert.equal(manifest.human_acceptance.hoang, null);
  const policy = JSON.parse(await readFile(join(repoRoot, `${methodDir}/resolver-policy.template.json`)));
  const plan = JSON.parse(await readFile(join(repoRoot, `${methodDir}/statistical-plan.template.json`)));
  const pins = JSON.parse(await readFile(join(repoRoot, `${methodDir}/tool-pins.template.json`)));
  const review = JSON.parse(await readFile(join(repoRoot, `${methodDir}/review.template.json`)));
  const packageReceiptBytes = await readFile(join(repoRoot, 'holdout/d3-package-preflight/receipt.json'));
  assert.equal(sha256(packageReceiptBytes), PACKAGE_PREFLIGHT_RECEIPT_SHA256);
  const packagePreflight = validatePackagePreflight(JSON.parse(packageReceiptBytes));
  assert.equal(sha256(await readFile(join(repoRoot, 'development/common-module-capability/receipt/manifest.json'))), COMMON_CAPABILITY_RECEIPT_SHA256);
  const capability = await verifyCommonCapabilityReceipt(join(repoRoot, 'development/common-module-capability'),
    join(repoRoot, 'development/common-module-capability/receipt'));
  assert.deepEqual(capability, { cases: 7, common_fixture_passes: 2, failed_common_candidates: 1, unsupported_probes: 4, d3_executed: false });
  const modeCapability = await verifyModeCapabilityReceipt();
  assert.deepEqual(modeCapability, { cases: 7, common_fixture_passes: 3,
    failed_common_candidates: 0, unsupported_probes: 4, d3_executed: false });
  const resolver = validatePolicyScaffold(policy), statistics = validateStatisticalPlan(plan), tools = validateToolPins(pins);
  for (const candidate of Object.values(tools.comparator_configuration_candidates)) {
    assert.equal(sha256(await readFile(join(repoRoot, candidate.path))), candidate.sha256,
      `Comparator candidate configuration changed: ${candidate.path}`);
  }
  return { status: 'VERIFIED_PROPOSAL_NOT_READY_TO_FREEZE', method_sha256: sha256(Buffer.from(`${JSON.stringify(manifest)}\n`)),
    open_gates: { resolver_dimensions: resolver.unresolved, package_pins: tools.missing_package_pins,
      comparator_configuration_reconciliation_required: !tools.comparator_configuration_reconciliation_complete,
      package_archives_available: tools.package_archives_available,
      independent_package_reproduction_complete: tools.independent_package_reproduction_complete,
      development_fixture_not_research_freeze: !tools.fixture_freeze_complete,
      reviewed_applicability_ledger_missing: true, source_review_inventories_missing: true,
      human_acceptances_missing: ['hieu', 'hoang'], d3_predictions_not_executed: true },
    resolver, statistics, tools,
    common_capability_receipt: capability, mode_capability_receipt: modeCapability,
    package_preflight: packagePreflight, review: validateModuleReview(review) };
}

async function main() {
  const path = join(root, `${methodDir}/freeze-manifest.json`);
  if (process.argv.includes('--write')) await writeFile(path, `${JSON.stringify(await buildFreezeManifest(root), null, 2)}\n`);
  const bytes = await readFile(path); const manifest = JSON.parse(bytes);
  const report = await validateFreezeManifest(manifest, root);
  console.log(JSON.stringify({ ...report, manifest_raw_sha256: sha256(bytes) }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(`D3_METHOD_FREEZE_INVALID: ${error.message}`); process.exitCode = 1; });
}
