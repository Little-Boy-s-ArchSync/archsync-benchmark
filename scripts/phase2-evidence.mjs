import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { evaluatePhase2Benchmark } from "@archsync/guardian";
import { validateVendorArtifacts } from "./validate-vendor-artifacts.mjs";

const root = new URL("..", import.meta.url);
const manifest = new URL("../order-platform/ground-truth.json", import.meta.url);
const evidencePath = new URL("../evidence/phase-2-results.json", import.meta.url);
const writeMode = process.argv.includes("--write");
const vendorManifest = await validateVendorArtifacts(root);
const sourcePin = ({ source_repository, source_commit }) =>
  `git+${source_repository}#${source_commit}`;
const dependencyPins = Object.fromEntries(
  Object.entries(vendorManifest.artifacts).map(([name, artifact]) => [name, sourcePin(artifact)]),
);
const runtimeArtifacts = Object.fromEntries(
  Object.entries(vendorManifest.artifacts).map(([name, artifact]) => [name, {
    package: artifact.package,
    file: artifact.file,
    sha256: artifact.sha256,
  }]),
);
const groundTruthSource = await readFile(manifest, "utf8");
const groundTruth = JSON.parse(groundTruthSource);
const result = await evaluatePhase2Benchmark(fileURLToPath(manifest));
assert.equal(result.valid, true, result.issues.join("\n"));
assert.equal(result.cases.length, groundTruth.cases.length);
assert.ok(result.cases.length >= 20, "Expanded Phase 2 benchmark must contain at least 20 cases");
assert.ok(result.metrics.full_graph_nodes.precision >= 0.85);
assert.ok(result.metrics.full_graph_nodes.recall >= 0.85);
assert.ok(result.metrics.full_graph_edges.precision >= 0.85);
assert.ok(result.metrics.full_graph_edges.recall >= 0.85);
assert.ok(result.metrics.changed_nodes.precision >= 0.85);
assert.ok(result.metrics.changed_nodes.recall >= 0.85);
assert.ok(result.metrics.changed_edges.precision >= 0.85);
assert.ok(result.metrics.changed_edges.recall >= 0.85);
assert.equal(result.metrics.classification_accuracy, 1);
assert.equal(result.metrics.evidence_file_accuracy, 1);
assert.equal(result.metrics.evidence_line_accuracy, 1);
assert.equal(result.metrics.deterministic_cases, groundTruth.cases.length);

const findingCaseIds = new Set(
  groundTruth.cases
    .filter((scenario) => scenario.expected.findings.length > 0)
    .map((scenario) => scenario.id),
);
const violationRuleCaseIds = new Set(
  groundTruth.cases
    .filter((scenario) => scenario.category === "violation")
    .map((scenario) => scenario.id),
);
const findingCases = result.cases.filter(({ id }) => findingCaseIds.has(id));
const violationRuleCases = result.cases.filter(({ id }) => violationRuleCaseIds.has(id));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const serializedResult = JSON.stringify(result);

const evidence = {
  phase: 2,
  release: "v0.2",
  dependencies: dependencyPins,
  guardian_dependency: dependencyPins.guardian,
  runtime_artifacts: runtimeArtifacts,
  evaluation_protocol: {
    patch_isolation: "Each patch is applied independently to a fresh copy of the unchanged baseline.",
    baseline_analyses: 2,
    analyses_per_case: 2,
    total_analyzer_executions: 2 * (groundTruth.cases.length + 1),
    classification_cases: groundTruth.cases.length,
    violation_rule_cases: violationRuleCases.length,
    source_evidence_cases: findingCases.length,
  },
  provenance: {
    manifest_sha256: sha256(groundTruthSource),
    architecture_sha256: groundTruth.benchmark.integrity.architecture_sha256,
    baseline_tree_sha256: groundTruth.benchmark.integrity.baseline_tree_sha256,
    patch_set_sha256: groundTruth.benchmark.integrity.patch_set_sha256,
    result_sha256: sha256(serializedResult),
  },
  outcome_counts: {
    classification_matches: result.cases.filter(({ classification_match }) => classification_match).length,
    classification_cases: result.cases.length,
    violation_rule_set_matches: violationRuleCases.filter(({ rule_match }) => rule_match).length,
    violation_rule_cases: violationRuleCases.length,
    evidence_file_matches: findingCases.filter(({ evidence_file_match }) => evidence_file_match).length,
    evidence_exact_line_matches: findingCases.filter(({ evidence_line_match }) => evidence_line_match).length,
    source_evidence_cases: findingCases.length,
    deterministic_cases: result.cases.filter(({ deterministic }) => deterministic).length,
    deterministic_cases_total: result.cases.length,
  },
  result,
};
const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
if (writeMode) {
  await writeFile(evidencePath, serialized, "utf8");
  console.log(`WROTE PHASE 2 BENCHMARK EVIDENCE ${fileURLToPath(evidencePath)}`);
} else {
  assert.equal(
    await readFile(evidencePath, "utf8"),
    serialized,
    "Phase 2 benchmark evidence is stale; run 'pnpm phase2:update' and commit the result",
  );
  console.log(`VALID PHASE 2 BENCHMARK EVIDENCE (${groundTruth.cases.length}/${groundTruth.cases.length} cases, exact source evidence)`);
}
