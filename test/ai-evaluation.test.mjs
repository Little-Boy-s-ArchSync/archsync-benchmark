import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  calculateRepairMetrics,
  calculateUnsupportedClaimRate,
  createPreparedEvidenceManifest,
  summarizeAblationRuns,
  validateRunManifest,
  validateSafetyCorpus,
  verifyPreparedEvidenceManifest,
} from "../scripts/lib/ai-evaluation.mjs";

function validManifest(overrides = {}) {
  return {
    schema_version: 1,
    run_id: "run-1",
    condition: "grounded",
    provider: "fake",
    model: "fake-model",
    model_version: "1",
    prompt_version: "p1",
    config_sha256: "a".repeat(64),
    request_sha256: "b".repeat(64),
    started_at: "2026-08-26T00:00:00Z",
    ended_at: "2026-08-26T00:00:01Z",
    status: "completed",
    retries: 0,
    input_tokens: 10,
    output_tokens: 5,
    latency_ms: 100,
    cost_usd: 0,
    evidence_ids: ["E-1"],
    redaction: { passed: true, audit_sha256: "c".repeat(64) },
    raw_response_path: "raw/run-1.json",
    ...overrides,
  };
}

test("run manifests enforce provenance, cost, redaction and failure retention", () => {
  assert.deepEqual(validateRunManifest(validManifest()), []);
  assert.deepEqual(validateRunManifest(null), ["run manifest must be an object"]);
  assert.deepEqual(validateRunManifest(validManifest({
    condition: "llm-only",
    status: "failed",
    error_class: "quota",
    evidence_ids: [],
    ended_at: null,
    raw_response_path: null,
  })), []);

  const invalid = validManifest({
    schema_version: 2,
    run_id: "",
    provider: "",
    model: "",
    model_version: "",
    prompt_version: "",
    started_at: "",
    request_sha256: "bad",
    config_sha256: "bad",
    condition: "invalid",
    status: "invalid",
    retries: -1,
    input_tokens: -1,
    output_tokens: Number.NaN,
    latency_ms: -1,
    cost_usd: Number.NaN,
    evidence_ids: [],
    redaction: null,
    api_key: "forbidden",
    ended_at: "",
    raw_response_path: "",
  });
  const issues = validateRunManifest(invalid);
  for (const text of ["schema_version", "run_id", "provider", "model", "model_version", "prompt_version", "started_at", "request_sha256", "config_sha256", "condition", "status", "retries", "input_tokens", "output_tokens", "latency_ms", "cost_usd", "redaction", "credentials", "error_class"]) {
    assert.ok(issues.some((issue) => issue.includes(text)), text);
  }
  assert.ok(validateRunManifest(validManifest({ evidence_ids: [] })).some((issue) => issue.includes("evidence_ids")));
  assert.ok(validateRunManifest(validManifest({ ended_at: "", raw_response_path: "" })).some((issue) => issue.includes("end time")));
  assert.ok(validateRunManifest(validManifest({ redaction: { passed: false, audit_sha256: "bad" } })).some((issue) => issue.includes("redaction")));
  assert.ok(validateRunManifest(validManifest({ redaction: { passed: true } })).some((issue) => issue.includes("redaction")));
  assert.ok(validateRunManifest(validManifest({ request_sha256: undefined, config_sha256: undefined, redaction: {} })).length > 0);
  assert.ok(validateRunManifest(validManifest({ authorization: "forbidden" })).some((issue) => issue.includes("credentials")));
  assert.ok(validateRunManifest(validManifest({ retries: 0.5 })).some((issue) => issue.includes("retries")));
});

test("safety corpus covers all attacks and hard negatives", async () => {
  const corpus = JSON.parse(await readFile(new URL("../ai-safety/corpus.json", import.meta.url), "utf8"));
  assert.deepEqual(validateSafetyCorpus(corpus), []);
  assert.deepEqual(validateSafetyCorpus(null), ["safety corpus must be an object"]);
  assert.deepEqual(validateSafetyCorpus({ schema_version: 2, cases: [] }), ["schema_version must equal 1", "cases must be a non-empty array"]);

  const invalid = {
    schema_version: 1,
    cases: [
      null,
      { id: "same", label: "bad", category: "bad", content: "", expected: null },
      { id: "same", label: "bad", category: "bad", content: "x", expected: { hard_decision_unchanged: false, disposition: "" } },
    ],
  };
  const issues = validateSafetyCorpus(invalid);
  for (const text of ["case 0", "id", "label", "category", "content", "disposition", "attack", "hard-negative", "source-instruction", "verification-bypass"]) {
    assert.ok(issues.some((issue) => issue.includes(text)), text);
  }
});

function reviews(claim, first, second) {
  return [
    { claim_id: claim, reviewer_id: "a", unsupported: first, blind: true },
    { claim_id: claim, reviewer_id: "b", unsupported: second, blind: true },
  ];
}

test("unsupported claim rate requires two blind reviewers and adjudication", () => {
  const result = calculateUnsupportedClaimRate([
    ...reviews("c1", true, true),
    ...reviews("c2", true, false),
    ...reviews("c3", false, false),
  ], [{ claim_id: "c2", final_unsupported: false, actor_type: "human" }]);
  assert.equal(result.claims, 3);
  assert.equal(result.reviewer_agreement, 2 / 3);
  assert.equal(result.unsupported, 1);
  assert.equal(result.rate, 1 / 3);
  assert.match(result.method, /Wilson/);
  assert.ok(result.confidence_interval.low >= 0 && result.confidence_interval.high <= 1);

  assert.throws(() => calculateUnsupportedClaimRate([]), /required/);
  assert.throws(() => calculateUnsupportedClaimRate(reviews("c", true, true), [], 0), /positive/);
  for (const invalid of [null, { claim_id: "", reviewer_id: "", unsupported: "no", blind: false }]) {
    assert.throws(() => calculateUnsupportedClaimRate([invalid]), /invalid blind/);
  }
  assert.throws(() => calculateUnsupportedClaimRate([reviews("c", true, true)[0], reviews("c", true, true)[0]]), /duplicate/);
  assert.throws(() => calculateUnsupportedClaimRate([reviews("c", true, true)[0]]), /two reviewers/);
  assert.throws(() => calculateUnsupportedClaimRate(reviews("c", true, false)), /adjudication/);
  assert.throws(() => calculateUnsupportedClaimRate(reviews("c", true, false), [null]), /invalid claim adjudication/);
  assert.throws(() => calculateUnsupportedClaimRate(reviews("c", true, false), [
    { claim_id: "c", final_unsupported: true, actor_type: "human" },
    { claim_id: "c", final_unsupported: false, actor_type: "human" },
  ]), /invalid claim adjudication/);
  assert.throws(() => calculateUnsupportedClaimRate(reviews("c", true, false), [{ claim_id: "c", final_unsupported: true, actor_type: "provider" }]), /invalid claim adjudication/);
});

test("repair metrics never count unrun or inconclusive candidates as success", () => {
  const result = calculateRepairMetrics([
    { candidate_id: "ok", attempted: true, decision: "ACCEPTABLE_FOR_REVIEW", patch_applied: true, tests_passed: true, conformance_passed: true, new_regressions: 0 },
    { candidate_id: "regression", attempted: true, decision: "REJECT_TEST", patch_applied: true, tests_passed: false, conformance_passed: true, new_regressions: 1 },
    { candidate_id: "uncertain", attempted: true, decision: "INCONCLUSIVE", patch_applied: true, tests_passed: true, conformance_passed: false, new_regressions: 0 },
    { candidate_id: "unrun", attempted: false },
  ]);
  assert.deepEqual(result, {
    n: 4,
    attempted: 3,
    successful: 1,
    repair_success_rate: 0.25,
    attempted_repair_success_rate: 1 / 3,
    regressions: 1,
    regression_rate: 1 / 3,
    inconclusive: 2,
  });
  assert.throws(() => calculateRepairMetrics([]), /required/);
  assert.throws(() => calculateRepairMetrics([null]), /invalid/);
  assert.throws(() => calculateRepairMetrics([
    { candidate_id: "x", attempted: false },
    { candidate_id: "x", attempted: false },
  ]), /duplicate/);
  const unrun = calculateRepairMetrics([{ candidate_id: "x", attempted: false }]);
  assert.equal(unrun.attempted_repair_success_rate, null);
  assert.equal(unrun.regression_rate, null);
});

function ablationRun(overrides = {}) {
  return {
    run_id: "r1",
    condition: "grounded",
    status: "completed",
    config_sha256: "a".repeat(64),
    correctness: "correct",
    claims: 2,
    unsupported_claims: 0,
    latency_ms: 10,
    tokens: 20,
    cost_usd: 0.01,
    ...overrides,
  };
}

test("ablation summaries retain failures and separate locked configurations", () => {
  const summary = summarizeAblationRuns([
    ablationRun(),
    ablationRun({ run_id: "r2", correctness: "incorrect", unsupported_claims: 1, latency_ms: 20, tokens: 30, cost_usd: 0.02, config_sha256: "b".repeat(64) }),
    ablationRun({ run_id: "r3", condition: "llm-only", status: "failed", config_sha256: "c".repeat(64), correctness: undefined, claims: undefined, unsupported_claims: undefined, latency_ms: undefined, tokens: undefined, cost_usd: undefined }),
  ]);
  assert.deepEqual(summary.grounded, {
    n: 2,
    completed: 2,
    failures: 0,
    config_hashes: ["a".repeat(64), "b".repeat(64)],
    correctness_rate: 0.5,
    unsupported_claim_rate: 0.25,
    median_latency_ms: 15,
    total_tokens: 50,
    total_cost_usd: 0.03,
  });
  assert.equal(summary["llm-only"].n, 1);
  assert.equal(summary["llm-only"].correctness_rate, 0);
  assert.equal(summary["llm-only"].unsupported_claim_rate, null);
  assert.equal(summary["llm-only"].median_latency_ms, null);
  assert.equal(summarizeAblationRuns([ablationRun({ condition: "llm-only" })])["llm-only"].median_latency_ms, 10);
  assert.throws(() => summarizeAblationRuns([]), /required/);
  for (const invalid of [
    null,
    ablationRun({ run_id: "" }),
    ablationRun({ condition: "bad" }),
    ablationRun({ status: "bad" }),
    ablationRun({ config_sha256: "" }),
  ]) assert.throws(() => summarizeAblationRuns([invalid]), /invalid or duplicate/);
  assert.throws(() => summarizeAblationRuns([ablationRun(), ablationRun()]), /duplicate/);
  for (const changes of [
    { correctness: "unknown" },
    { claims: -1 },
    { claims: 1.5 },
    { unsupported_claims: -1 },
    { unsupported_claims: 3 },
    { latency_ms: -1 },
    { latency_ms: Number.NaN },
    { tokens: -1 },
    { tokens: Number.NaN },
    { cost_usd: -1 },
    { cost_usd: Number.NaN },
  ]) assert.throws(() => summarizeAblationRuns([ablationRun(changes)]), /invalid metrics/);
});

test("prepared evidence indexes are deterministic and cannot claim approval", () => {
  const metadata = {
    status: "prepared",
    protocol_version: "p4-draft-v1",
    code_commit: "a".repeat(40),
    human_approval: null,
  };
  const artifacts = { "b.json": Buffer.from("b"), "a.json": "a" };
  const manifest = createPreparedEvidenceManifest(metadata, artifacts);
  assert.deepEqual(manifest.files.map((item) => item.file), ["a.json", "b.json"]);
  assert.match(manifest.manifest_sha256, /^[0-9a-f]{64}$/u);
  assert.equal(verifyPreparedEvidenceManifest(manifest, artifacts), true);
  assert.equal(verifyPreparedEvidenceManifest(manifest, { ...artifacts, "a.json": "changed" }), false);
  assert.equal(verifyPreparedEvidenceManifest(null, artifacts), false);
  assert.equal(verifyPreparedEvidenceManifest({ metadata: null }, artifacts), false);
  for (const invalid of [
    null,
    { ...metadata, status: "frozen" },
    { ...metadata, protocol_version: "" },
    { ...metadata, code_commit: undefined },
    { ...metadata, code_commit: "short" },
    { ...metadata, human_approval: { actor_type: "human" } },
  ]) assert.throws(() => createPreparedEvidenceManifest(invalid, artifacts), /unapproved/);
  assert.throws(() => createPreparedEvidenceManifest(metadata, {}), /required/);
  assert.throws(() => createPreparedEvidenceManifest(metadata, null), /required/);
});
