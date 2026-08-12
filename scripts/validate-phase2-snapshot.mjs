import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const groundTruth = JSON.parse(await readFile(new URL("../order-platform/ground-truth.json", import.meta.url), "utf8"));
const evidence = JSON.parse(await readFile(new URL("../evidence/phase-2-results.json", import.meta.url), "utf8"));
const result = evidence.result;

assert.equal(evidence.guardian_dependency, packageJson.dependencies["@archsync/guardian"]);
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

console.log("VALID PHASE 2 SNAPSHOT (10/10 cases, node/edge precision/recall and exact evidence gates)");
