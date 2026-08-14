import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { validateVendorArtifacts } from "./validate-vendor-artifacts.mjs";

const root = new URL("../", import.meta.url);
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
const groundTruthSource = await readFile(new URL("../order-platform/ground-truth.json", import.meta.url), "utf8");
const groundTruth = JSON.parse(groundTruthSource);
const evidence = JSON.parse(await readFile(new URL("../evidence/phase-2-results.json", import.meta.url), "utf8"));
const result = evidence.result;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

assert.equal(evidence.guardian_dependency, dependencyPins.guardian);
assert.deepEqual(evidence.dependencies, dependencyPins);
assert.deepEqual(evidence.runtime_artifacts, runtimeArtifacts);
assert.deepEqual(evidence.evaluation_protocol, {
  patch_isolation: "Each patch is applied independently to a fresh copy of the unchanged baseline.",
  baseline_analyses: 2,
  analyses_per_case: 2,
  total_analyzer_executions: 42,
  classification_cases: 20,
  violation_rule_cases: 7,
  source_evidence_cases: 11,
});
assert.deepEqual(evidence.provenance, {
  manifest_sha256: sha256(groundTruthSource),
  architecture_sha256: groundTruth.benchmark.integrity.architecture_sha256,
  baseline_tree_sha256: groundTruth.benchmark.integrity.baseline_tree_sha256,
  patch_set_sha256: groundTruth.benchmark.integrity.patch_set_sha256,
  result_sha256: sha256(JSON.stringify(result)),
});
assert.deepEqual(evidence.outcome_counts, {
  classification_matches: 20,
  classification_cases: 20,
  violation_rule_set_matches: 7,
  violation_rule_cases: 7,
  evidence_file_matches: 11,
  evidence_exact_line_matches: 11,
  source_evidence_cases: 11,
  deterministic_cases: 20,
  deterministic_cases_total: 20,
});
assert.equal(result.valid, true);
assert.deepEqual(result.cases.map(({ id }) => id), groundTruth.cases.map(({ id }) => id));
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
assert.equal(result.cases.every(({ classification_match, rule_match, evidence_file_match, evidence_line_match, deterministic }) =>
  classification_match && rule_match && evidence_file_match && evidence_line_match && deterministic,
), true);

console.log("VALID PHASE 2 SNAPSHOT (20/20 cases, node/edge precision/recall and exact evidence gates)");
