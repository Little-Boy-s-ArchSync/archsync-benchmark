import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateQualityGoal } from "@archsync/core";
import {
  buildObservedRuntimeGraph,
  collectRuntimeEvidence,
  createEvolutionScorecard,
  createPendingApprovalRecord,
  sha256Canonical,
  validateApprovalRecord,
} from "@archsync/guardian";

import {
  RUNTIME_CLOSURE_GATES,
  assertRuntimeClosure,
  createRuntimeFoundationManifest,
  evaluateRuntimeClosure,
} from "./lib/runtime-provenance.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const writeMode = process.argv.includes("--write");
const requireClosed = process.argv.includes("--require-closed");
const inputDirectory = join(root, "runtime", "inputs");
const evidenceDirectory = join(root, "runtime", "evidence");
const inputFiles = {
  "package.json": join(root, "package.json"),
  "pnpm-lock.yaml": join(root, "pnpm-lock.yaml"),
  "runtime/inputs/baseline.otlp.json": join(inputDirectory, "baseline.otlp.json"),
  "runtime/inputs/redis-candidate.otlp.json": join(inputDirectory, "redis-candidate.otlp.json"),
  "runtime/inputs/mapping.json": join(inputDirectory, "mapping.json"),
  "runtime/inputs/options.json": join(inputDirectory, "options.json"),
  "runtime/inputs/quality-goals.json": join(inputDirectory, "quality-goals.json"),
  "runtime/evidence/closure.template.json": join(evidenceDirectory, "closure.template.json"),
  "scripts/lib/runtime-provenance.mjs": join(root, "scripts", "lib", "runtime-provenance.mjs"),
  "scripts/runtime-foundation.mjs": fileURLToPath(import.meta.url),
  "vendor/manifest.json": join(root, "vendor", "manifest.json"),
};

async function readInputs() {
  const text = Object.fromEntries(await Promise.all(
    Object.entries(inputFiles).map(async ([name, path]) => [name, await readFile(path, "utf8")]),
  ));
  return {
    text,
    baseline: JSON.parse(text["runtime/inputs/baseline.otlp.json"]),
    candidate: JSON.parse(text["runtime/inputs/redis-candidate.otlp.json"]),
    mapping: JSON.parse(text["runtime/inputs/mapping.json"]),
    options: JSON.parse(text["runtime/inputs/options.json"]),
    goals: JSON.parse(text["runtime/inputs/quality-goals.json"]),
    closure: JSON.parse(text["runtime/evidence/closure.template.json"]),
  };
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const inputs = await readInputs();
for (const goal of inputs.goals) {
  const result = await validateQualityGoal(goal);
  assert.equal(result.valid, true, `Invalid quality goal ${goal.id}: ${JSON.stringify(result.issues)}`);
}

const baselineSnapshot = collectRuntimeEvidence(inputs.baseline, inputs.options);
const candidateSnapshot = collectRuntimeEvidence(inputs.candidate, inputs.options);
assert.deepEqual(
  collectRuntimeEvidence(inputs.baseline, inputs.options),
  baselineSnapshot,
  "baseline OTLP replay changed normalized output",
);
assert.deepEqual(
  collectRuntimeEvidence(inputs.candidate, inputs.options),
  candidateSnapshot,
  "candidate OTLP replay changed normalized output",
);

const baselineGraph = buildObservedRuntimeGraph(baselineSnapshot, inputs.mapping);
const candidateGraph = buildObservedRuntimeGraph(candidateSnapshot, inputs.mapping);
const scorecard = createEvolutionScorecard(inputs.goals, baselineSnapshot, candidateSnapshot);
assert.deepEqual(
  Object.fromEntries(scorecard.rows.map((row) => [row.goal_id, row.change])),
  {
    "AVL-001": "improvement",
    "COST-001": "regression",
    "CPLX-001": "regression",
    "LAT-001": "improvement",
    "SEC-001": "unchanged",
  },
  "fixture trade-off directions changed",
);
assert.ok(
  candidateGraph.signals.some((signal) =>
    signal.code === "RUNTIME_UNDECLARED_EDGE" && signal.subject === "order-service|data|redis"
  ),
  "Redis candidate must remain an explicit model conflict",
);

const pendingApproval = createPendingApprovalRecord({
  record_id: "redis-runtime-candidate-001",
  risk_level: "high",
  evidence_snapshot_sha256: sha256Canonical({ baselineSnapshot, candidateSnapshot }),
  scorecard,
  rationale: "Latency and availability improve while cost and complexity regress; prerequisites and human review remain open.",
  rollback_plan: "Retain the current baseline and remove the Redis candidate deployment; no baseline update is authorized.",
});
assert.deepEqual(validateApprovalRecord(pendingApproval), { valid: true, issues: [] });
assert.equal(pendingApproval.decision, "pending");
assert.equal("approver" in pendingApproval, false);

const outputValues = {
  "runtime/evidence/approval.pending.json": pendingApproval,
  "runtime/evidence/baseline.graph.json": baselineGraph,
  "runtime/evidence/baseline.snapshot.json": baselineSnapshot,
  "runtime/evidence/redis-candidate.graph.json": candidateGraph,
  "runtime/evidence/redis-candidate.snapshot.json": candidateSnapshot,
  "runtime/evidence/scorecard.json": scorecard,
};
const outputText = Object.fromEntries(
  Object.entries(outputValues).map(([name, value]) => [name, serialize(value)]),
);
const manifest = createRuntimeFoundationManifest({
  inputs: inputs.text,
  outputs: outputText,
  coreCommit: "503b5fe97aa39a78d5e5de80b794a94508e106cc",
  guardianCommit: "ebaaf2711602890ef6ead8983bd33e2cf4853e17",
  collectorVersion: baselineSnapshot.collector.version,
  runtimeContractVersion: baselineSnapshot.contract_version,
  window: inputs.options.window,
});
assert.equal(inputs.closure.status, "preparatory");
assert.equal(inputs.closure.template_only, true);
assert.deepEqual(Object.keys(inputs.closure.gates), RUNTIME_CLOSURE_GATES);
const closure = evaluateRuntimeClosure(manifest, inputs.closure.gates);
assert.equal(closure.status, "PREPARATORY");
assert.equal(closure.closed, false);
assert.deepEqual(closure.blockers, RUNTIME_CLOSURE_GATES);
const allOutputs = {
  ...outputText,
  "runtime/evidence/manifest.json": serialize(manifest),
};

await mkdir(evidenceDirectory, { recursive: true });
for (const [name, content] of Object.entries(allOutputs)) {
  const path = join(root, name);
  if (writeMode) {
    await writeFile(path, content, "utf8");
  } else {
    assert.equal(
      await readFile(path, "utf8"),
      content,
      `${name} is stale; run 'pnpm runtime:update' and review the exact diff`,
    );
  }
}

if (requireClosed) assertRuntimeClosure(manifest, inputs.closure.gates);

console.log(
  `${writeMode ? "WROTE" : "VALID"} RUNTIME FOUNDATION (${Object.keys(allOutputs).length} artifacts; ${closure.blockers.length} closure blockers; no experimental claim)`,
);
