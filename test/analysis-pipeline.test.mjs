import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  analysisDatasetSha256,
  assertPublishableAnalysis,
  createPreparatoryAnalysisArtifacts,
  validateAnalysisDataset,
  verifyAnalysisArtifacts,
} from "../scripts/lib/analysis-pipeline.mjs";

function row(overrides = {}) {
  return {
    run_id: "synthetic-run-1",
    condition: "A",
    status: "completed",
    outcome: "violations_per_commit",
    numerator: 1,
    denominator: 2,
    value: 0.5,
    ...overrides,
  };
}

function dataset(overrides = {}) {
  const rows = overrides.rows ?? [row()];
  return {
    schema_version: 1,
    dataset_id: "synthetic-dataset",
    status: "synthetic-provisional",
    synthetic: true,
    raw_dataset_sha256: analysisDatasetSha256(rows),
    statistical_plan: { status: "proposed", version: "0.1.0-draft", sha256: "a".repeat(64) },
    approval: null,
    ...overrides,
    rows,
  };
}

test("ANALYSIS-101 validates non-empty hash-bound rows and retained failures", async () => {
  const fixture = JSON.parse(await readFile(new URL("../analysis/input.synthetic.json", import.meta.url), "utf8"));
  assert.deepEqual(validateAnalysisDataset(fixture), []);
  assert.deepEqual(validateAnalysisDataset(null), ["analysis dataset must be an object"]);
  assert.throws(() => analysisDatasetSha256(null), /array/u);

  const empty = dataset({
    schema_version: 2,
    dataset_id: "",
    status: "invalid",
    synthetic: "yes",
    statistical_plan: null,
    rows: [],
  });
  const emptyIssues = validateAnalysisDataset(empty);
  for (const expected of ["schema_version", "dataset_id", "status", "synthetic", "statistical_plan", "non-empty"]) assert.ok(emptyIssues.some((issue) => issue.includes(expected)), expected);

  const invalidRows = [
    null,
    row({ run_id: "bad path", outcome: "Bad Outcome", condition: "?", status: "unknown", numerator: -1, denominator: 0, value: 99 }),
    row({ run_id: "duplicate" }),
    row({ run_id: "duplicate", condition: "B" }),
  ];
  const rowIssues = validateAnalysisDataset(dataset({ rows: invalidRows }));
  for (const expected of ["row 0", "run/outcome", "condition", "status", "numerator/denominator", "row 3"]) assert.ok(rowIssues.some((issue) => issue.includes(expected)), expected);
  assert.ok(validateAnalysisDataset(dataset({ raw_dataset_sha256: "bad" })).some((issue) => issue.includes("raw_dataset_sha256")));
  assert.ok(validateAnalysisDataset(dataset({ approval: {} })).some((issue) => issue.includes("approval must be null")));
  assert.deepEqual(validateAnalysisDataset(dataset({ rows: [row({ status: "failed", numerator: null, denominator: null, value: null })] })), []);

  const frozenWithoutApproval = dataset({ status: "frozen", synthetic: false, statistical_plan: { status: "frozen", version: "v1", sha256: "b".repeat(64) } });
  assert.ok(validateAnalysisDataset(frozenWithoutApproval).some((issue) => issue.includes("human approval")));
  assert.ok(validateAnalysisDataset(dataset({ status: "frozen", synthetic: true })).some((issue) => issue.includes("synthetic data")));
});

test("preparatory pipeline emits deterministic watermarked CSV, table, figure and manifest", () => {
  const input = dataset({ rows: [
    row({ run_id: "z", numerator: 2, denominator: 2, value: 1 }),
    row({ run_id: "a", condition: "B", status: "failed", numerator: null, denominator: null, value: null }),
  ] });
  const first = createPreparatoryAnalysisArtifacts(input);
  const second = createPreparatoryAnalysisArtifacts(structuredClone(input));
  assert.deepEqual(first, second);
  assert.match(first["results.csv"], /synthetic-provisional/u);
  assert.match(first["table.md"], /NOT RESEARCH RESULTS/u);
  assert.match(first["figure.svg"], /SYNTHETIC PREPARATORY DRY RUN/u);
  assert.equal(first.manifest.publishable, false);
  assert.equal(first.manifest.status, "synthetic-preparatory");
  assert.match(first.manifest.manifest_sha256, /^[0-9a-f]{64}$/u);
  assert.equal(verifyAnalysisArtifacts(input, first), true);
  assert.equal(verifyAnalysisArtifacts(input, null), false);
  assert.equal(verifyAnalysisArtifacts(input, { ...first, "table.md": "changed" }), false);
  assert.equal(verifyAnalysisArtifacts({ ...input, status: "invalid" }, first), false);
  assert.throws(() => createPreparatoryAnalysisArtifacts({ ...input, status: "invalid" }), /invalid analysis dataset/u);

  const frozenRows = [row({ run_id: "frozen-run" })];
  const frozen = dataset({
    dataset_id: "unit-fixture-frozen",
    status: "frozen",
    synthetic: false,
    rows: frozenRows,
    raw_dataset_sha256: analysisDatasetSha256(frozenRows),
    statistical_plan: { status: "frozen", version: "unit-fixture-v1", sha256: "c".repeat(64) },
    approval: { actor_type: "human", decision: "approved", reviewer_id: "unit-fixture-reviewer", approved_at: "2026-08-26T00:00:00Z", sha256: "d".repeat(64) },
  });
  assert.throws(() => createPreparatoryAnalysisArtifacts(frozen), /only unapproved synthetic/u);
});

test("publishable analysis rejects empty, unapproved, synthetic, unfrozen and unaudited inputs", () => {
  const template = dataset();
  assert.throws(() => assertPublishableAnalysis(template, null), /ANALYSIS_GATE_INCOMPLETE/u);
  const syntheticAsResult = dataset({ status: "frozen" });
  assert.throws(() => assertPublishableAnalysis(syntheticAsResult, null), /dataset_is_synthetic/u);

  const rows = [row({ run_id: "frozen-run" })];
  const frozen = dataset({
    dataset_id: "unit-fixture-frozen",
    status: "frozen",
    synthetic: false,
    rows,
    raw_dataset_sha256: analysisDatasetSha256(rows),
    statistical_plan: { status: "frozen", version: "unit-fixture-v1", sha256: "c".repeat(64) },
    approval: { actor_type: "human", decision: "approved", reviewer_id: "unit-fixture-reviewer", approved_at: "2026-08-26T00:00:00Z", sha256: "d".repeat(64) },
  });
  const audit = { actor_type: "human", independent: true, decision: "reproduced", url: "https://example.invalid/unit-fixture", commit: "e".repeat(40), sha256: "f".repeat(64) };
  const artifacts = assertPublishableAnalysis(frozen, audit);
  assert.equal(artifacts.manifest.publishable, true);
  assert.equal(artifacts.manifest.status, "frozen-analysis");
  assert.match(artifacts["table.md"], /FROZEN ANALYSIS/u);
  assert.equal(verifyAnalysisArtifacts(frozen, { ...artifacts, independent_audit: audit }, true), true);
  assert.equal(verifyAnalysisArtifacts(frozen, { ...artifacts, independent_audit: null }, true), false);
  for (const invalid of [
    null,
    { ...audit, actor_type: "provider" },
    { ...audit, independent: false },
    { ...audit, decision: "approved" },
    { ...audit, url: "http://invalid" },
    { ...audit, commit: "bad" },
    { ...audit, sha256: "bad" },
  ]) assert.throws(() => assertPublishableAnalysis(frozen, invalid), /independent_reproduction_missing/u);
});
