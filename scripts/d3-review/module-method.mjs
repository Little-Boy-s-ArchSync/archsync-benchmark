import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sha256 } from '../d3-source-review/files.mjs';
import { isSafeHoldoutPath } from '../lib/holdout.mjs';

export const METHOD_VERSION = '0.2.0';
export const GUARDIAN_SOURCE_COMMIT = 'e32ef53eeb07bc8c904b6a1e6a8b897d16def820';
export const LEGACY_REVIEW_SCHEMAS = Object.freeze(['d3-author-review/1', 'd3-change-case-review/1']);
const hex = /^[a-f0-9]{64}$/u;
const oid = /^[a-f0-9]{40}$/u;
const text = (v) => typeof v === 'string' && v.trim().length > 0;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const methodDir = `holdout/d3-module-method/v${METHOD_VERSION}`;

export const METHOD_ARTIFACT_PATHS = Object.freeze([
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
  'scripts/d3-review/module-method.mjs',
  'test/d3-module-method.test.mjs',
].sort());

function safe(path) {
  assert(isSafeHoldoutPath(path) && METHOD_ARTIFACT_PATHS.includes(path), `Unsafe method artifact path: ${path}`);
}

export function occurrenceKey(o) {
  return [o.repository, o.case_id, o.side, o.source_path, o.start_line, o.start_column, o.syntax, o.literal_specifier, o.resolved_target_path];
}

export function edgeKey(e) {
  return [e.repository, e.case_id, e.side, e.source_group, e.dependency, e.target_group];
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
export function validateModuleReview(review, cases = null) {
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
    const coverageKeys = new Set(), localOccurrences = new Map();
    for (const row of envelope.file_coverage) {
      validateCoverage(row, envelope);
      const key = JSON.stringify([row.side, row.path]); assert(!coverageKeys.has(key), 'Duplicate file-side coverage'); coverageKeys.add(key);
    }
    let reviewedCount = 0;
    for (const row of envelope.occurrences) {
      validateOccurrence(row, envelope); const key = JSON.stringify(occurrenceKey(row));
      assert(!occurrenceKeys.has(key), 'Duplicate occurrence key'); occurrenceKeys.add(key); localOccurrences.set(key, row); reviewedCount++;
      assert(coverageKeys.has(JSON.stringify([row.side, row.source_path])), 'Occurrence lacks file-side coverage');
    }
    assert.equal(envelope.file_coverage.filter((r) => r.review_status === 'reviewed').reduce((n, r) => n + r.occurrence_count, 0), reviewedCount,
      'Reviewed file occurrence counts must equal inventory length');
    const seenEdges = new Set(), referenceCounts = new Map();
    for (const edge of envelope.edges) {
      assert.equal(edge.repository, envelope.repository); assert.equal(edge.case_id, envelope.case_id);
      assert(['base', 'head'].includes(edge.side) && edge.commit === envelope[edge.side]);
      assert(edge.dependency === 'module-import' && [edge.source_group, edge.target_group].every(text));
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
  if (cases) {
    assert.equal(cases.cases.length, 56); assert.equal(cases.context_only_cases.length, 4);
    const expected = new Map(cases.cases.map((c) => [JSON.stringify([c.repository, c.id]), c]));
    assert.deepEqual(new Set(seenCases), new Set(expected.keys()), 'Review case population differs from selected 56-case scope');
    for (const envelope of review.case_envelopes) {
      const item = expected.get(JSON.stringify([envelope.repository, envelope.case_id]));
      assert.equal(envelope.base, item.base); assert.equal(envelope.head, item.head);
      const expectedPaths = item.scope_path_roles.filter((r) => r.role === 'primary-candidate').map((r) => r.path);
      for (const side of ['base', 'head']) for (const path of expectedPaths)
        assert(envelope.file_coverage.some((r) => r.side === side && r.path === path), `Missing file-side coverage: ${envelope.case_id}:${side}:${path}`);
    }
  }
  return { status: 'STRUCTURALLY_VALID_NOT_SCIENTIFICALLY_VERIFIED', research_complete: false, cases: seenCases.size };
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
  assert.match(plan.zero_positive_policy, /Never report 100% recall/u);
  assert.equal(plan.human_acceptance.hieu, null); assert.equal(plan.human_acceptance.hoang, null);
  return { accepted: false, primary_attempts: 56 };
}

export function validateToolPins(pins) {
  assert.equal(pins.schema, 'd3-module-tool-pins/2'); assert.equal(pins.version, METHOD_VERSION);
  assert.equal(pins.tools.guardian.source_commit, GUARDIAN_SOURCE_COMMIT);
  assert.equal(pins.tools.guardian.repository, 'Little-Boy-s-ArchSync/archsync-guardian');
  assert.equal(pins.tools.dependency_cruiser.package_name, 'dependency-cruiser');
  assert.equal(pins.human_acceptance.hieu, null); assert.equal(pins.human_acceptance.hoang, null);
  return { guardian_source_pinned: true, fixture_freeze_complete: false, accepted: false };
}

export async function buildFreezeManifest(repoRoot = root) {
  const artifacts = [];
  for (const path of METHOD_ARTIFACT_PATHS) {
    safe(path); const bytes = await readFile(join(repoRoot, path));
    artifacts.push({ path, sha256: sha256(bytes), bytes: bytes.length });
  }
  return {
    schema: 'd3-module-method-freeze-manifest/2', version: METHOD_VERSION, status: 'proposal-not-accepted',
    endpoint: 'direct-module-occurrences-and-deduplicated-module-group-edges',
    guardian_source_commit: GUARDIAN_SOURCE_COMMIT,
    legacy_review_schemas_rejected: [...LEGACY_REVIEW_SCHEMAS], artifacts,
    scientific_claims: { labels_created: false, predictions_executed: false, results_computed: false, d3_complete: false },
    human_acceptance: { hieu: null, hoang: null },
  };
}

export async function validateFreezeManifest(manifest, repoRoot = root) {
  assert.equal(manifest.schema, 'd3-module-method-freeze-manifest/2'); assert.equal(manifest.version, METHOD_VERSION);
  assert.equal(manifest.status, 'proposal-not-accepted'); assert.equal(manifest.guardian_source_commit, GUARDIAN_SOURCE_COMMIT);
  assert.deepEqual(manifest.legacy_review_schemas_rejected, [...LEGACY_REVIEW_SCHEMAS]);
  assert.deepEqual(manifest.artifacts.map((a) => a.path), [...METHOD_ARTIFACT_PATHS]);
  for (const artifact of manifest.artifacts) {
    safe(artifact.path); const bytes = await readFile(join(repoRoot, artifact.path));
    assert.equal(artifact.sha256, sha256(bytes), `Method artifact changed: ${artifact.path}`);
    assert.equal(artifact.bytes, bytes.length, `Method artifact size changed: ${artifact.path}`);
  }
  assert.deepEqual(manifest.scientific_claims, { labels_created: false, predictions_executed: false, results_computed: false, d3_complete: false });
  assert.equal(manifest.human_acceptance.hieu, null); assert.equal(manifest.human_acceptance.hoang, null);
  const policy = JSON.parse(await readFile(join(repoRoot, `${methodDir}/resolver-policy.template.json`)));
  const plan = JSON.parse(await readFile(join(repoRoot, `${methodDir}/statistical-plan.template.json`)));
  const pins = JSON.parse(await readFile(join(repoRoot, `${methodDir}/tool-pins.template.json`)));
  const review = JSON.parse(await readFile(join(repoRoot, `${methodDir}/review.template.json`)));
  return { status: 'VERIFIED_PROPOSAL_BLOCKED_ON_HUMANS_AND_FIXTURES', method_sha256: sha256(Buffer.from(`${JSON.stringify(manifest)}\n`)),
    resolver: validatePolicyScaffold(policy), statistics: validateStatisticalPlan(plan), tools: validateToolPins(pins), review: validateModuleReview(review) };
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
