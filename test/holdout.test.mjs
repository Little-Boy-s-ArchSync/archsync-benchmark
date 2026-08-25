import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateHoldoutMetrics,
  classifyHoldoutErrors,
  createFrozenManifest,
  summarizeScalabilitySamples,
  validateHoldoutManifest,
  validateIndependentAnnotations,
  verifyFrozenManifest,
} from "../scripts/lib/holdout.mjs";

function repository(id = "alpha") {
  return {
    id,
    url: `https://github.com/example/${id}`,
    commit: "a".repeat(40),
    license_spdx: "MIT",
    scope: "packages/api",
    retrieved_at: "2026-08-26T00:00:00Z",
    tree_sha256: "b".repeat(64),
    environment: { node: "22.0.0", package_manager: "pnpm@11.16.0" },
  };
}

function manifest(status = "frozen") {
  return {
    schema_version: 1,
    protocol_version: "d3-v1",
    status,
    tuning_repository_urls: ["https://github.com/example/tuning"],
    repositories: status === "frozen" ? [repository("alpha"), repository("beta")] : [],
    ...(status === "frozen" ? {
      approval: { actor_type: "human", reviewer_id: "lead", approved_at: "2026-08-26T00:00:00Z" },
      ground_truth_sha256: "c".repeat(64),
    } : {}),
  };
}

test("holdout manifest accepts proposed and fully frozen states", () => {
  assert.deepEqual(validateHoldoutManifest(manifest("proposed")), []);
  assert.deepEqual(validateHoldoutManifest(manifest()), []);
  assert.deepEqual(validateHoldoutManifest(null), ["manifest must be an object"]);
});

test("holdout manifest reports every provenance, leakage and approval issue", () => {
  const value = manifest();
  value.schema_version = 2;
  value.protocol_version = "";
  value.status = "unknown";
  value.repositories = [null, {
    id: "same", url: "http://bad", commit: "short", license_spdx: "", scope: "", retrieved_at: "", tree_sha256: "bad", environment: null,
  }, {
    ...repository("same"),
    url: "https://github.com/example/tuning",
  }];
  value.tuning_repository_urls = ["https://github.com/example/tuning"];
  value.approval = { actor_type: "provider", reviewer_id: "", approved_at: "" };
  value.ground_truth_sha256 = "bad";
  const issues = validateHoldoutManifest(value);
  for (const text of [
    "schema_version", "protocol_version", "status", "repositories[0]", "repositories[1].url", "repositories[1].commit",
    "repositories[1].license", "repositories[1].scope", "repositories[1].retrieved", "repositories[1].tree",
    "repositories[1].environment", "repositories[2].id", "appears in the tuning set",
  ]) assert.ok(issues.some((issue) => issue.includes(text)), text);

  const frozen = manifest();
  frozen.repositories = [repository()];
  frozen.approval = null;
  delete frozen.ground_truth_sha256;
  assert.deepEqual(validateHoldoutManifest(frozen), [
    "a frozen holdout requires 2-3 repositories",
    "frozen manifest requires human Lead approval",
    "frozen manifest requires ground_truth_sha256",
  ]);
  assert.ok(validateHoldoutManifest({ ...manifest("proposed"), repositories: null }).includes("repositories must be an array"));
  const missing = manifest("proposed");
  missing.tuning_repository_urls = null;
  missing.repositories = [{ id: "", license_spdx: "MIT", scope: "scope", retrieved_at: "now", environment: { node: "22", package_manager: "pnpm" } }];
  const missingIssues = validateHoldoutManifest(missing);
  assert.ok(missingIssues.some((issue) => issue.includes(".url")));
  assert.ok(missingIssues.some((issue) => issue.includes(".commit")));
  assert.ok(missingIssues.some((issue) => issue.includes(".tree_sha256")));
});

test("dual blind annotations require two reviewers and exact evidence", () => {
  const rows = [
    { item_id: "i1", reviewer_id: "a", label: "violation", confidence: 0.9, evidence_file: "a.ts", evidence_line: 1, saw_prediction: false },
    { item_id: "i1", reviewer_id: "b", label: "unknown", confidence: 0.5, evidence_file: "a.ts", evidence_line: 1, saw_prediction: false },
  ];
  assert.deepEqual(validateIndependentAnnotations(rows), []);
  assert.deepEqual(validateIndependentAnnotations([]), ["annotations must contain rows"]);
  const invalid = [null, rows[0], { ...rows[0] }, {
    item_id: "i2", reviewer_id: "a", label: "bad", confidence: 2, evidence_file: "", evidence_line: 0, saw_prediction: true,
  }];
  const issues = validateIndependentAnnotations(invalid);
  for (const text of ["row 0", "duplicate", "unsupported label", "confidence", "source evidence", "blind", "exactly two"]) {
    assert.ok(issues.some((issue) => issue.includes(text)), text);
  }
});

test("freeze record is deterministic and detects mutation", () => {
  const frozen = createFrozenManifest(manifest(), { "truth.json": "truth", "source.tar": Buffer.from("source") });
  assert.equal(frozen.artifacts[0].file, "source.tar");
  assert.match(frozen.freeze_sha256, /^[0-9a-f]{64}$/u);
  assert.equal(verifyFrozenManifest(frozen, { "source.tar": Buffer.from("source"), "truth.json": "truth" }), true);
  assert.equal(verifyFrozenManifest(frozen, { "source.tar": "mutated", "truth.json": "truth" }), false);
  assert.equal(verifyFrozenManifest(null, {}), false);
  assert.equal(verifyFrozenManifest({ ...frozen, manifest: manifest("proposed") }, {}), false);
  assert.throws(() => createFrozenManifest(manifest("proposed"), {}), /status must be frozen/);
  assert.throws(() => createFrozenManifest(manifest(), {}), /at least one/);
});

test("holdout metrics count failures and use explicit denominators", () => {
  const rows = [
    { id: "tp", truth_positive: true, prediction: "positive", truth_label: "violation", predicted_label: "violation", evidence_exact: true },
    { id: "fp", truth_positive: false, prediction: "positive", truth_label: "no-impact", predicted_label: "violation", evidence_exact: false },
    { id: "tn", truth_positive: false, prediction: "negative", truth_label: "no-impact", predicted_label: "no-impact", evidence_exact: true },
    { id: "fn", truth_positive: true, prediction: "negative", truth_label: "violation", predicted_label: "no-impact", evidence_exact: false },
    { id: "failed", truth_positive: true, prediction: "failed", truth_label: "violation", predicted_label: null, evidence_exact: false },
  ];
  assert.deepEqual(calculateHoldoutMetrics(rows), {
    n: 5,
    confusion: { tp: 1, fp: 1, tn: 1, fn: 1, failed: 1 },
    detection: { precision: 0.5, recall: 1 / 3, f1: 0.4 },
    classification_accuracy: 0.4,
    exact_evidence_accuracy: 0.4,
  });
  assert.throws(() => calculateHoldoutMetrics([]), /required/);
  assert.throws(() => calculateHoldoutMetrics([null]), /unique/);
  assert.throws(() => calculateHoldoutMetrics([{ id: "x", truth_positive: "yes", prediction: "positive" }]), /invalid/);
  assert.throws(() => calculateHoldoutMetrics([
    { id: "x", truth_positive: true, prediction: "positive" },
    { id: "x", truth_positive: true, prediction: "positive" },
  ]), /unique/);
});

test("zero-denominator metrics remain explicit nulls", () => {
  const negative = calculateHoldoutMetrics([{ id: "n", truth_positive: false, prediction: "negative", truth_label: "n", predicted_label: "n", evidence_exact: true }]);
  assert.deepEqual(negative.detection, { precision: null, recall: null, f1: null });
  const noCorrectPositive = calculateHoldoutMetrics([
    { id: "fp", truth_positive: false, prediction: "positive", truth_label: "n", predicted_label: "p", evidence_exact: false },
    { id: "fn", truth_positive: true, prediction: "negative", truth_label: "p", predicted_label: "n", evidence_exact: false },
  ]);
  assert.equal(noCorrectPositive.detection.f1, null);
});

test("error taxonomy preserves evidence and remediation action", () => {
  const errors = classifyHoldoutErrors([
    { id: "fp", truth_positive: false, prediction: "positive", evidence: "a.ts:1", scope: "in", detector_supported: true },
    { id: "fn", truth_positive: true, prediction: "negative", scope: "in", detector_supported: false },
    { id: "scope", truth_positive: true, prediction: "negative", scope: "out-of-scope", detector_supported: true },
    { id: "ok", truth_positive: true, prediction: "positive" },
    { id: "failed", truth_positive: true, prediction: "failed" },
  ]);
  assert.deepEqual(errors.map(({ type, action, evidence }) => [type, action, evidence]), [
    ["false-positive", "fix", "a.ts:1"],
    ["false-negative", "document-limitation", "missing"],
    ["false-negative", "document-out-of-scope", "missing"],
  ]);
});

test("scalability summary reports distributions, environments and oracle agreement", () => {
  const result = summarizeScalabilitySamples([
    { mode: "full", duration_ms: 20, files: 10, environment_id: "m1", oracle_match: true },
    { mode: "full", duration_ms: 10, files: 10, environment_id: "m2", oracle_match: false },
    { mode: "incremental", duration_ms: 3, files: 1, environment_id: "m1", oracle_match: true },
  ]);
  assert.deepEqual(result, {
    n: 3,
    by_mode: {
      full: { n: 2, p50_ms: 10, p95_ms: 20, oracle_agreement: 0.5, environments: ["m1", "m2"] },
      incremental: { n: 1, p50_ms: 3, p95_ms: 3, oracle_agreement: 1, environments: ["m1"] },
    },
  });
  assert.throws(() => summarizeScalabilitySamples([]), /at least two/);
  for (const sample of [null, { mode: "bad", duration_ms: -1, files: 0, environment_id: "" }]) {
    assert.throws(() => summarizeScalabilitySamples([sample, sample]), /invalid/);
  }
  assert.deepEqual(summarizeScalabilitySamples([
    { mode: "full", duration_ms: 1, files: 1, environment_id: "m", oracle_match: true },
    { mode: "full", duration_ms: 2, files: 1, environment_id: "m", oracle_match: true },
  ]).by_mode.incremental, undefined);
});
