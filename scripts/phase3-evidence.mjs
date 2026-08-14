import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { cpus, platform, release, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadArchitecture } from "@archsync/core";
import {
  analyzeTypeScriptRepository,
  checkRepositoryDiff,
  evaluateObservedArchitecture,
} from "@archsync/guardian";
import { validateVendorArtifacts } from "./validate-vendor-artifacts.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const benchmarkRoot = join(root, "order-platform");
const manifestPath = join(benchmarkRoot, "ground-truth.json");
const architecturePath = join(benchmarkRoot, "architecture.yaml");
const baselinePath = join(benchmarkRoot, "repository");
const evidencePath = join(root, "evidence", "phase-3-results.json");
const writeMode = process.argv.includes("--write");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function git(repository, args) {
  const result = spawnSync("git", ["-C", repository, ...args], {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: "2026-08-14T00:00:00Z",
      GIT_COMMITTER_DATE: "2026-08-14T00:00:00Z",
    },
  });
  assert.equal(result.status, 0, result.stderr);
}

async function controlledRepository(scenario) {
  const repository = await mkdtemp(join(tmpdir(), `archsync-phase3-${scenario.id}-`));
  await cp(baselinePath, repository, { recursive: true });
  git(repository, ["init", "-b", "main"]);
  git(repository, ["config", "user.email", "phase3-benchmark@archsync.invalid"]);
  git(repository, ["config", "user.name", "ArchSync Phase 3 Benchmark"]);
  git(repository, ["add", "."]);
  git(repository, ["commit", "-m", "controlled order-platform baseline"]);
  git(repository, ["apply", join(benchmarkRoot, scenario.patch)]);
  return repository;
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function stableFinding(finding) {
  return {
    id: finding.id,
    kind: finding.kind,
    ...(finding.rule_id ? { rule_id: finding.rule_id } : {}),
    ...(finding.edge ? { edge: finding.edge.key } : {}),
    ...(finding.component ? { component: finding.component } : {}),
    ...(finding.change ? { change: finding.change } : {}),
    source_evidence: finding.source_evidence.map(({ file, line, column, detector }) => ({
      file,
      line,
      column,
      detector,
    })),
  };
}

function stableFindings(findings) {
  return findings.map(stableFinding).sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)),
  );
}

function stableResult(result) {
  return {
    classification: result.classification,
    decision: result.decision,
    changed_files: result.changed_files,
    affected_components: result.affected_components,
    architecture_delta: result.architecture_delta,
    introduced_findings: stableFindings(result.introduced_findings),
    resolved_findings: result.resolved_findings.map((finding) => ({
      id: finding.id,
      kind: finding.kind,
      ...(finding.rule_id ? { rule_id: finding.rule_id } : {}),
    })),
    pre_existing_findings: result.pre_existing_findings,
    analysis: {
      strategy: result.analysis.strategy,
      baseline_scanned_files: result.analysis.baseline_scanned_files,
      incremental_scanned_files: result.analysis.incremental_scanned_files,
      head_scanned_files: result.analysis.head_scanned_files,
      analyzed_components: result.analysis.analyzed_components,
    },
  };
}

function sameSet(actual, expected) {
  return JSON.stringify([...new Set(actual)].sort()) === JSON.stringify([...new Set(expected)].sort());
}

function expectedArchitectureDelta(scenario) {
  const edgeKeys = (values = []) => values
    .map(({ from, to, type }) => `${from}|${type}|${to}`)
    .sort();
  return {
    added_nodes: Object.keys(scenario.delta?.components_added ?? {}).sort(),
    removed_nodes: Object.keys(scenario.delta?.components_removed ?? {}).sort(),
    changed_nodes: Object.keys(scenario.delta?.components_changed ?? {}).sort(),
    added_edges: edgeKeys(scenario.delta?.relationships_added),
    removed_edges: edgeKeys(scenario.delta?.relationships_removed),
  };
}

function sameJson(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function evidenceMatch(result, expectedEvidence) {
  const actual = result.introduced_findings.flatMap((finding) => finding.source_evidence);
  const expected = asArray(expectedEvidence);
  return {
    file: expected.every((item) => actual.some((evidence) => evidence.file === item.file)),
    exact_line: expected.every((item) => actual.some((evidence) =>
      evidence.file === item.file && evidence.line === item.line,
    )),
  };
}

function percentile(values, percentileValue) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(percentileValue * sorted.length) - 1);
  return Math.round(sorted[index] * 100) / 100;
}

const manifestSource = await readFile(manifestPath, "utf8");
const manifest = JSON.parse(manifestSource);
const architectureResult = await loadArchitecture(architecturePath);
assert.equal(architectureResult.valid, true);
assert.ok(architectureResult.value);
const expectedArchitecture = architectureResult.value;
const vendorManifest = await validateVendorArtifacts(new URL("../", import.meta.url));

const caseResults = [];
const coldTimings = [];
const warmTimings = [];
for (const scenario of manifest.cases) {
  const repository = await controlledRepository(scenario);
  try {
    const cold = await checkRepositoryDiff(expectedArchitecture, repository, { base_ref: "." });
    const warm = await checkRepositoryDiff(expectedArchitecture, repository, { base_ref: "." });
    const fullObserved = await analyzeTypeScriptRepository(repository, expectedArchitecture);
    const full = evaluateObservedArchitecture(expectedArchitecture, fullObserved);
    const coldStable = stableResult(cold);
    const warmStable = stableResult(warm);
    assert.deepEqual(warmStable, coldStable, `${scenario.id}: output changed after cache warm-up`);
    assert.equal(cold.cache.hit, false, `${scenario.id}: first baseline load must be cold`);
    assert.equal(warm.cache.hit, true, `${scenario.id}: repeated baseline load must hit cache`);
    assert.equal(cold.baseline.classification, "no-impact", `${scenario.id}: benchmark baseline must be clean`);
    assert.equal(cold.baseline.findings, 0, `${scenario.id}: benchmark baseline must have no findings`);

    const expectedFindings = asArray(scenario.expected.findings);
    const expectedRuleIds = expectedFindings
      .filter((finding) => finding.kind !== "architecture-evolution")
      .map((finding) => finding.id);
    const actualRuleIds = cold.introduced_findings
      .flatMap((finding) => finding.rule_id ? [finding.rule_id] : []);
    const evidence = evidenceMatch(cold, scenario.expected.evidence);
    const expectedDecision = scenario.category === "violation"
      ? "BLOCK"
      : scenario.category === "evolution"
        ? "REVIEW"
        : "PASS";
    const actualChangedFiles = cold.changed_files.map(({ path }) => path).sort();
    const expectedChangedFiles = [...scenario.changed_files].sort();
    const expectedDelta = expectedArchitectureDelta(scenario);
    const architectureDeltaMatch = sameJson(cold.architecture_delta, expectedDelta);
    const fullScanMatch =
      cold.head.classification === full.classification &&
      cold.head.decision === full.decision &&
      cold.head.findings === full.findings.length &&
      cold.analysis.head_scanned_files === full.observed.metadata.scanned_files &&
      sameJson(cold.architecture_delta, full.diff) &&
      sameJson(stableFindings(cold.introduced_findings), stableFindings(full.findings));

    caseResults.push({
      id: scenario.id,
      title: scenario.title,
      expected_classification: scenario.category,
      actual_classification: cold.classification,
      expected_decision: expectedDecision,
      actual_decision: cold.decision,
      classification_match: cold.classification === scenario.category,
      decision_match: cold.decision === expectedDecision,
      changed_files_match: JSON.stringify(actualChangedFiles) === JSON.stringify(expectedChangedFiles),
      architecture_delta_match: architectureDeltaMatch,
      incremental_full_scan_match: fullScanMatch,
      expected_rule_ids: expectedRuleIds.sort(),
      actual_rule_ids: [...new Set(actualRuleIds)].sort(),
      rule_match: scenario.category !== "violation" || sameSet(actualRuleIds, expectedRuleIds),
      evidence_file_match: expectedFindings.length === 0 || evidence.file,
      evidence_exact_line_match: expectedFindings.length === 0 || evidence.exact_line,
      deterministic: true,
      cache_hit_on_repeat: warm.cache.hit,
      changed_files: cold.changed_files,
      affected_components: cold.affected_components,
      architecture_delta: cold.architecture_delta,
      introduced_findings: coldStable.introduced_findings,
      incremental_scanned_files: cold.analysis.incremental_scanned_files,
      head_scanned_files: cold.analysis.head_scanned_files,
      full_scan_scanned_files: full.observed.metadata.scanned_files,
      cold_total_ms: cold.analysis.total_ms,
      warm_total_ms: warm.analysis.total_ms,
    });
    coldTimings.push(cold.analysis.total_ms);
    warmTimings.push(warm.analysis.total_ms);
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
}

const findingCases = caseResults.filter(({ expected_classification }) => expected_classification !== "no-impact");
const violationCases = caseResults.filter(({ expected_classification }) => expected_classification === "violation");
const deterministicCases = caseResults.map(({ cold_total_ms: _cold, warm_total_ms: _warm, ...result }) => result);
const incrementalFiles = caseResults.reduce((sum, result) => sum + result.incremental_scanned_files, 0);
const headFiles = caseResults.reduce((sum, result) => sum + result.head_scanned_files, 0);
const staticEvidence = {
  phase: 3,
  release: "v0.3",
  dependencies: Object.fromEntries(Object.entries(vendorManifest.artifacts).map(([name, artifact]) => [
    name,
    `git+${artifact.source_repository}#${artifact.source_commit}`,
  ])),
  protocol: {
    cases: caseResults.length,
    patch_isolation: "Each patch is applied to a fresh Git repository committed from the unchanged Order Platform baseline.",
    analyses_per_case: 2,
    full_scan_oracles_per_case: 1,
    analyzer_calls_per_case: 4,
    merge_base: "HEAD baseline versus patched working tree",
    cache_protocol: "First execution must miss; identical second execution must hit and produce the same normalized result.",
  },
  provenance: {
    manifest_sha256: sha256(manifestSource),
    architecture_sha256: manifest.benchmark.integrity.architecture_sha256,
    baseline_tree_sha256: manifest.benchmark.integrity.baseline_tree_sha256,
    patch_set_sha256: manifest.benchmark.integrity.patch_set_sha256,
    guardian_artifact_sha256: vendorManifest.artifacts.guardian.sha256,
    normalized_results_sha256: sha256(JSON.stringify(deterministicCases)),
  },
  outcome_counts: {
    classification_matches: caseResults.filter(({ classification_match }) => classification_match).length,
    decision_matches: caseResults.filter(({ decision_match }) => decision_match).length,
    changed_file_matches: caseResults.filter(({ changed_files_match }) => changed_files_match).length,
    architecture_delta_matches: caseResults.filter(({ architecture_delta_match }) => architecture_delta_match).length,
    incremental_full_scan_matches: caseResults.filter(({ incremental_full_scan_match }) => incremental_full_scan_match).length,
    violation_rule_set_matches: violationCases.filter(({ rule_match }) => rule_match).length,
    violation_rule_cases: violationCases.length,
    evidence_file_matches: findingCases.filter(({ evidence_file_match }) => evidence_file_match).length,
    evidence_exact_line_matches: findingCases.filter(({ evidence_exact_line_match }) => evidence_exact_line_match).length,
    source_evidence_cases: findingCases.length,
    deterministic_cases: caseResults.filter(({ deterministic }) => deterministic).length,
    cache_hits_on_repeat: caseResults.filter(({ cache_hit_on_repeat }) => cache_hit_on_repeat).length,
    total_cases: caseResults.length,
  },
  incremental_scope: {
    parsed_typescript_files: incrementalFiles,
    head_typescript_files: headFiles,
    parsed_fraction: Math.round((incrementalFiles / headFiles) * 10000) / 10000,
    affected_components_total: caseResults.reduce((sum, result) => sum + result.affected_components.length, 0),
  },
  cases: deterministicCases,
};

assert.equal(staticEvidence.outcome_counts.classification_matches, manifest.cases.length);
assert.equal(staticEvidence.outcome_counts.decision_matches, manifest.cases.length);
assert.equal(staticEvidence.outcome_counts.changed_file_matches, manifest.cases.length);
assert.equal(staticEvidence.outcome_counts.architecture_delta_matches, manifest.cases.length);
assert.equal(staticEvidence.outcome_counts.incremental_full_scan_matches, manifest.cases.length);
assert.equal(staticEvidence.outcome_counts.violation_rule_set_matches, violationCases.length);
assert.equal(staticEvidence.outcome_counts.evidence_file_matches, findingCases.length);
assert.equal(staticEvidence.outcome_counts.evidence_exact_line_matches, findingCases.length);
assert.equal(staticEvidence.outcome_counts.deterministic_cases, manifest.cases.length);
assert.equal(staticEvidence.outcome_counts.cache_hits_on_repeat, manifest.cases.length);

if (writeMode) {
  const evidence = {
    ...staticEvidence,
    environment: {
      platform: platform(),
      os_release: release(),
      node: process.version,
      cpu: cpus()[0]?.model ?? "unknown",
      logical_cpus: cpus().length,
    },
    performance: {
      samples_per_mode: caseResults.length,
      cold_median_ms: percentile(coldTimings, 0.5),
      cold_p95_ms: percentile(coldTimings, 0.95),
      warm_median_ms: percentile(warmTimings, 0.5),
      warm_p95_ms: percentile(warmTimings, 0.95),
      cold_total_ms: coldTimings,
      warm_total_ms: warmTimings,
    },
  };
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(`WROTE PHASE 3 BENCHMARK EVIDENCE ${evidencePath}`);
} else {
  const committed = JSON.parse(await readFile(evidencePath, "utf8"));
  const { environment: _environment, performance, ...committedStatic } = committed;
  assert.deepEqual(committedStatic, staticEvidence, "Phase 3 evidence is stale; run 'pnpm phase3:update'");
  assert.equal(performance.samples_per_mode, manifest.cases.length);
  assert.equal(performance.cold_total_ms.length, manifest.cases.length);
  assert.equal(performance.warm_total_ms.length, manifest.cases.length);
  assert.ok(performance.cold_total_ms.every((value) => value > 0));
  assert.ok(performance.warm_total_ms.every((value) => value > 0));
  assert.equal(performance.cold_median_ms, percentile(performance.cold_total_ms, 0.5));
  assert.equal(performance.cold_p95_ms, percentile(performance.cold_total_ms, 0.95));
  assert.equal(performance.warm_median_ms, percentile(performance.warm_total_ms, 0.5));
  assert.equal(performance.warm_p95_ms, percentile(performance.warm_total_ms, 0.95));
  console.log(
    `VALID PHASE 3 BENCHMARK EVIDENCE ` +
    `(${manifest.cases.length}/${manifest.cases.length} decisions, ` +
    `${manifest.cases.length}/${manifest.cases.length} incremental/full-scan equivalence, ` +
    `${findingCases.length}/${findingCases.length} exact evidence, ` +
    `${staticEvidence.incremental_scope.parsed_typescript_files}/${staticEvidence.incremental_scope.head_typescript_files} files parsed)`,
  );
}
