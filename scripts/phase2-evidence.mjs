import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { evaluatePhase2Benchmark } from "@archsync/guardian";

const root = new URL("..", import.meta.url);
const manifest = new URL("../order-platform/ground-truth.json", import.meta.url);
const evidencePath = new URL("../evidence/phase-2-results.json", import.meta.url);
const writeMode = process.argv.includes("--write");
const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const result = await evaluatePhase2Benchmark(fileURLToPath(manifest));
assert.equal(result.valid, true, result.issues.join("\n"));
assert.equal(result.cases.length, 10);
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
assert.equal(result.metrics.deterministic_cases, 10);

const evidence = {
  phase: 2,
  release: "v0.1",
  guardian_dependency: packageJson.dependencies["@archsync/guardian"],
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
  console.log("VALID PHASE 2 BENCHMARK EVIDENCE (10/10 cases, exact source evidence)");
}
