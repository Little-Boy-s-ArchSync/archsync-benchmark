import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  GUARDIAN_RUN_MANIFEST_SOURCE,
  PHASE4_CLOSURE_GATES,
  PHASE4_PREPARED_ARTIFACTS,
  assertPhase4Closure,
  calculateRepairMetrics,
  calculateUnsupportedClaimRate,
  createBenchmarkRunManifest,
  createPreparedEvidenceManifest,
  evaluatePhase4Closure,
  summarizeAblationRuns,
  validateGuardianRunManifest,
  validateHumanReviewRubric,
  validateRunManifest,
  validateSafetyCorpus,
  verifyPreparedEvidenceManifest,
} from "../scripts/lib/ai-evaluation.mjs";

const hash = (character) => character.repeat(64);

function guardianManifest(overrides = {}) {
  return {
    schema_version: 1,
    run_id: "synthetic-run-1",
    provider: "fake",
    model: "locked-fixture",
    prompt_version: "p1",
    request_hash: hash("a"),
    started_at: "2026-08-26T00:00:00.000Z",
    finished_at: "2026-08-26T00:00:01.000Z",
    temperature: 0,
    attempts: 1,
    tokens: { input: 10, output: 5 },
    cost_usd: 0,
    raw_response_path: "raw/synthetic-run-1.json",
    status: "success",
    failures: [],
    ...overrides,
  };
}

function benchmarkExtension(overrides = {}) {
  return {
    condition: "grounded",
    model_version: "fixture-v1",
    config_sha256: hash("b"),
    latency_ms: 1_000,
    evidence_ids: ["SYNTHETIC-EVIDENCE-1"],
    redaction: { passed: true, audit_sha256: hash("c") },
    ...overrides,
  };
}

test("Benchmark pins and accepts the exact canonical Guardian RunManifest contract", () => {
  assert.deepEqual(GUARDIAN_RUN_MANIFEST_SOURCE, {
    schema_version: 1,
    guardian_integration_pr: "https://github.com/Little-Boy-s-ArchSync/archsync-guardian/pull/8",
    guardian_integration_commit: "ebaaf2711602890ef6ead8983bd33e2cf4853e17",
    contract_path: "src/reasoner/provider.ts",
    contract_sha256: "7d6c0b8c8e1b3c426cbb640ee497c6397cd9d9a7871ec930652a7750c5f4c4b0",
    contract: "Guardian RunManifest schema_version 1",
  });
  assert.deepEqual(validateGuardianRunManifest(guardianManifest()), []);
  assert.deepEqual(validateGuardianRunManifest(guardianManifest({ seed: 7 })), []);
  assert.deepEqual(validateGuardianRunManifest(guardianManifest({
    attempts: 0,
    status: "failed",
    failures: [{ attempt: 0, kind: "budget", message: "synthetic prompt rejected before provider execution" }],
  })), []);
  assert.deepEqual(validateGuardianRunManifest(guardianManifest({
    attempts: 0,
    status: "failed",
    failures: [{ attempt: 0, kind: "cancelled", message: "synthetic run cancelled before provider execution" }],
  })), []);
  assert.deepEqual(validateGuardianRunManifest(null), ["Guardian run manifest must be an object"]);

  const invalid = guardianManifest({
    schema_version: 2,
    run_id: "",
    provider: "",
    model: "",
    prompt_version: "",
    request_hash: "bad",
    started_at: "",
    finished_at: "",
    temperature: Number.NaN,
    seed: 1.5,
    attempts: -1,
    tokens: null,
    cost_usd: -1,
    raw_response_path: "",
    status: "unknown",
    failures: null,
    api_key: "forbidden",
    authorization: "forbidden",
  });
  const issues = validateGuardianRunManifest(invalid);
  for (const expected of ["schema_version", "run_id", "provider", "model", "prompt_version", "request_hash", "started_at", "finished_at", "temperature", "seed", "attempts", "tokens", "cost_usd", "raw_response_path", "status", "failures", "credentials"]) {
    assert.ok(issues.some((issue) => issue.includes(expected)), expected);
  }

  assert.ok(validateGuardianRunManifest(guardianManifest({ attempts: 0 })).some((issue) => issue.includes("successful")));
  assert.ok(validateGuardianRunManifest(guardianManifest({ temperature: -1 })).some((issue) => issue.includes("temperature")));
  assert.ok(validateGuardianRunManifest(guardianManifest({ attempts: 0.5 })).some((issue) => issue.includes("attempts")));
  for (const tokens of [{ input: -1, output: 0 }, { input: 0, output: -1 }, { input: 0.5, output: 0 }, { input: 0, output: 0.5 }]) {
    assert.ok(validateGuardianRunManifest(guardianManifest({ tokens })).some((issue) => issue.includes("tokens")));
  }
  assert.ok(validateGuardianRunManifest(guardianManifest({ status: "failed", failures: [] })).some((issue) => issue.includes("failure record")));
  const failureIssues = validateGuardianRunManifest(guardianManifest({
    status: "failed",
    attempts: 1,
    failures: [
      null,
      { attempt: -1, kind: "provider", message: "x" },
      { attempt: 2, kind: "provider", message: "x" },
      { attempt: 0, kind: "provider", message: "x" },
      { attempt: 1, kind: "unknown", message: "x" },
      { attempt: 1, kind: "quota", message: "" },
    ],
  }));
  assert.equal(failureIssues.filter((issue) => issue.includes("failure ")).length, 6);
});

test("Benchmark data is a nested extension and cannot weaken Guardian provenance", () => {
  const guardian = guardianManifest();
  const extension = benchmarkExtension();
  const combined = createBenchmarkRunManifest(guardian, extension);
  assert.deepEqual(validateRunManifest(combined), []);
  guardian.provider = "changed-after-create";
  extension.evidence_ids.push("changed-after-create");
  assert.equal(combined.provider, "fake");
  assert.deepEqual(combined.benchmark.evidence_ids, ["SYNTHETIC-EVIDENCE-1"]);
  assert.deepEqual(validateRunManifest(null), ["run manifest must be an object"]);
  assert.ok(validateRunManifest(guardianManifest()).some((issue) => issue.includes("extension")));
  assert.deepEqual(validateRunManifest(createBenchmarkRunManifest(
    guardianManifest(),
    benchmarkExtension({ condition: "llm-only", evidence_ids: [] }),
  )), []);

  const invalid = benchmarkExtension({
    condition: "unknown",
    model_version: "",
    config_sha256: "bad",
    latency_ms: -1,
    evidence_ids: [""],
    redaction: { passed: false, audit_sha256: "bad" },
  });
  const extensionIssues = validateRunManifest({ ...guardianManifest(), benchmark: invalid });
  for (const expected of ["condition", "model_version", "config_sha256", "latency_ms", "evidence_ids", "redaction"]) {
    assert.ok(extensionIssues.some((issue) => issue.includes(expected)), expected);
  }
  assert.ok(validateRunManifest({ ...guardianManifest(), benchmark: benchmarkExtension({ evidence_ids: [] }) }).some((issue) => issue.includes("evidence_ids")));
  assert.ok(validateRunManifest({ ...guardianManifest(), benchmark: benchmarkExtension({ evidence_ids: null }) }).some((issue) => issue.includes("evidence_ids")));
  assert.ok(validateRunManifest({ ...guardianManifest(), benchmark: benchmarkExtension({ redaction: null }) }).some((issue) => issue.includes("redaction")));
  assert.throws(() => createBenchmarkRunManifest(guardianManifest({ request_hash: "bad" }), benchmarkExtension()), /request_hash/u);
  assert.throws(() => createBenchmarkRunManifest(guardianManifest(), null), /extension/u);
});

function rubricRow(overrides = {}) {
  return {
    run_id: "synthetic-run-1",
    case_id: "synthetic-case-1",
    claim_id: "synthetic-claim-1",
    reviewer_id: "synthetic-reviewer-1",
    condition: "manual",
    blind: true,
    training_case: false,
    correctness: "correct",
    completeness: 4,
    actionability: 5,
    citation_quality: 3,
    unsupported: false,
    manual_baseline: true,
    saw_ai_output: false,
    started_at: "2026-08-26T00:00:00.000Z",
    finished_at: "2026-08-26T00:00:02.000Z",
    duration_ms: 2_000,
    ...overrides,
  };
}

test("P4-123 rubric validates correctness, completeness, actionability, citation and manual timing", () => {
  assert.deepEqual(validateHumanReviewRubric([
    rubricRow(),
    rubricRow({ run_id: "synthetic-run-2", claim_id: "synthetic-claim-2", reviewer_id: "synthetic-reviewer-2", condition: "grounded", manual_baseline: false, saw_ai_output: true }),
    rubricRow({ run_id: "synthetic-run-3", claim_id: "synthetic-claim-3", reviewer_id: "synthetic-reviewer-3", condition: "llm-only", manual_baseline: false, saw_ai_output: true, correctness: "uncertain" }),
  ]), []);
  assert.deepEqual(validateHumanReviewRubric([]), ["review rubric rows are required"]);
  assert.deepEqual(validateHumanReviewRubric(null), ["review rubric rows are required"]);
  assert.ok(validateHumanReviewRubric([null]).some((issue) => issue.includes("object")));

  const invalid = rubricRow({
    run_id: "",
    case_id: "",
    claim_id: "",
    reviewer_id: "",
    condition: "invalid",
    blind: false,
    training_case: true,
    correctness: "invalid",
    completeness: 0,
    actionability: 6,
    citation_quality: 1.5,
    unsupported: "no",
    manual_baseline: "yes",
    saw_ai_output: "no",
    started_at: "invalid",
    finished_at: "invalid",
    duration_ms: -1,
  });
  const issues = validateHumanReviewRubric([invalid]);
  for (const expected of ["IDs", "condition", "blind", "correctness", "completeness", "actionability", "citation_quality", "booleans", "timing"]) {
    assert.ok(issues.some((issue) => issue.includes(expected)), expected);
  }
  const duplicate = rubricRow({ run_id: "duplicate" });
  assert.ok(validateHumanReviewRubric([duplicate, { ...duplicate, case_id: "different-case" }]).some((issue) => issue.includes("unique")));
  assert.ok(validateHumanReviewRubric([rubricRow({ condition: "grounded", saw_ai_output: false })]).some((issue) => issue.includes("baseline boundary")));
  assert.ok(validateHumanReviewRubric([rubricRow({ condition: "manual", manual_baseline: false })]).some((issue) => issue.includes("baseline boundary")));
  for (const timing of [
    { finished_at: "2026-08-25T23:59:59.000Z", duration_ms: 0 },
    { duration_ms: Number.NaN },
    { duration_ms: 1_999 },
  ]) assert.ok(validateHumanReviewRubric([rubricRow(timing)]).some((issue) => issue.includes("timing")));
});

test("safety corpus covers all attacks and hard negatives", async () => {
  const corpus = JSON.parse(await readFile(new URL("../ai-safety/corpus.json", import.meta.url), "utf8"));
  assert.deepEqual(validateSafetyCorpus(corpus), []);
  assert.deepEqual(validateSafetyCorpus(null), ["safety corpus must be an object"]);
  assert.deepEqual(validateSafetyCorpus({ schema_version: 2, cases: [] }), ["schema_version must equal 1", "cases must be a non-empty array"]);
  const issues = validateSafetyCorpus({
    schema_version: 1,
    cases: [
      null,
      { id: "same", label: "bad", category: "bad", content: "", expected: null },
      { id: "same", label: "bad", category: "bad", content: "x", expected: { hard_decision_unchanged: false, disposition: "" } },
    ],
  });
  for (const expected of ["case 0", "id", "label", "category", "content", "disposition", "attack", "hard-negative", "source-instruction", "verification-bypass"]) {
    assert.ok(issues.some((issue) => issue.includes(expected)), expected);
  }
});

function reviews(claim, first, second) {
  return [
    { claim_id: claim, reviewer_id: "synthetic-a", unsupported: first, blind: true },
    { claim_id: claim, reviewer_id: "synthetic-b", unsupported: second, blind: true },
  ];
}

test("unsupported-claim rate retains denominators, uncertainty and human disagreement gates", () => {
  const result = calculateUnsupportedClaimRate([
    ...reviews("c1", true, true),
    ...reviews("c2", true, false),
    ...reviews("c3", false, false),
  ], [{ claim_id: "c2", final_unsupported: false, actor_type: "human" }]);
  assert.equal(result.claims, 3);
  assert.equal(result.reviewer_agreement, 2 / 3);
  assert.equal(result.unsupported, 1);
  assert.equal(result.rate, 1 / 3);
  assert.match(result.method, /Wilson/u);
  assert.ok(result.confidence_interval.low >= 0 && result.confidence_interval.high <= 1);
  const noneUnsupported = calculateUnsupportedClaimRate(reviews("none", false, false));
  assert.equal(noneUnsupported.confidence_interval.low, 0);
  const allUnsupported = calculateUnsupportedClaimRate(reviews("all", true, true));
  assert.equal(allUnsupported.confidence_interval.high, 1);

  assert.throws(() => calculateUnsupportedClaimRate([]), /required/u);
  assert.throws(() => calculateUnsupportedClaimRate(reviews("c", true, true), [], 0), /positive/u);
  for (const invalid of [null, { claim_id: "", reviewer_id: "", unsupported: "no", blind: false }]) assert.throws(() => calculateUnsupportedClaimRate([invalid]), /invalid blind/u);
  assert.throws(() => calculateUnsupportedClaimRate([reviews("c", true, true)[0], reviews("c", true, true)[0]]), /duplicate/u);
  assert.throws(() => calculateUnsupportedClaimRate([reviews("c", true, true)[0]]), /two reviewers/u);
  assert.throws(() => calculateUnsupportedClaimRate(reviews("c", true, false)), /adjudication/u);
  for (const invalid of [
    null,
    { claim_id: "", final_unsupported: true, actor_type: "human" },
    { claim_id: "c", final_unsupported: "yes", actor_type: "human" },
    { claim_id: "c", final_unsupported: true, actor_type: "provider" },
  ]) assert.throws(() => calculateUnsupportedClaimRate(reviews("c", true, false), [invalid]), /invalid claim adjudication/u);
  assert.throws(() => calculateUnsupportedClaimRate(reviews("c", true, false), [
    { claim_id: "c", final_unsupported: true, actor_type: "human" },
    { claim_id: "c", final_unsupported: false, actor_type: "human" },
  ]), /invalid claim adjudication/u);
});

test("repair metrics retain attempts, failures, regressions and inconclusive rows", () => {
  const result = calculateRepairMetrics([
    { candidate_id: "c1", attempted: true, decision: "ACCEPTABLE_FOR_REVIEW", patch_applied: true, tests_passed: true, conformance_passed: true, new_regressions: 0 },
    { candidate_id: "c2", attempted: true, decision: "INCONCLUSIVE", patch_applied: false, tests_passed: false, conformance_passed: false, new_regressions: 1 },
    { candidate_id: "c3", attempted: false },
  ]);
  assert.deepEqual(result, {
    n: 3,
    attempted: 2,
    successful: 1,
    repair_success_rate: 1 / 3,
    attempted_repair_success_rate: 1 / 2,
    regressions: 1,
    regression_rate: 1 / 2,
    inconclusive: 2,
  });
  const noAttempts = calculateRepairMetrics([{ candidate_id: "none", attempted: false }]);
  assert.equal(noAttempts.attempted_repair_success_rate, null);
  assert.equal(noAttempts.regression_rate, null);
  assert.throws(() => calculateRepairMetrics([]), /required/u);
  for (const invalid of [null, { candidate_id: "", attempted: true }, { candidate_id: "x", attempted: "yes" }]) assert.throws(() => calculateRepairMetrics([invalid]), /invalid/u);
  assert.throws(() => calculateRepairMetrics([{ candidate_id: "x", attempted: false }, { candidate_id: "x", attempted: false }]), /duplicate/u);
});

function ablationRun(overrides = {}) {
  return {
    run_id: "synthetic-ablation-1",
    case_id: "synthetic-case-1",
    condition: "grounded",
    config_sha256: hash("d"),
    status: "success",
    correctness: "correct",
    claims: 4,
    unsupported_claims: 1,
    citation_supported_claims: 3,
    latency_ms: 100,
    tokens: 10,
    cost_usd: 0.01,
    repair: { attempted: true, verified: true, regression: false },
    ...overrides,
  };
}

test("ablation summaries never aggregate incompatible hashes and include citation/repair metrics", () => {
  const otherHash = hash("e");
  const result = summarizeAblationRuns([
    ablationRun(),
    ablationRun({ run_id: "synthetic-ablation-2", case_id: "synthetic-case-2", correctness: "incorrect", claims: 2, unsupported_claims: 0, citation_supported_claims: 1, latency_ms: 200, repair: { attempted: true, verified: false, regression: true } }),
    ablationRun({ run_id: "synthetic-ablation-3", config_sha256: otherHash, claims: 0, unsupported_claims: 0, citation_supported_claims: 0, repair: { attempted: false, verified: false, regression: false } }),
    ablationRun({ run_id: "synthetic-ablation-4", case_id: "synthetic-case-2", config_sha256: otherHash, status: "failed" }),
    ablationRun({ run_id: "synthetic-ablation-5", condition: "llm-only", config_sha256: hash("f"), status: "failed" }),
  ]);
  assert.deepEqual(result.grounded.config_hashes, [hash("d"), otherHash]);
  const first = result.grounded.configurations[hash("d")];
  assert.equal(first.n, 2);
  assert.equal(first.correctness_rate, 1 / 2);
  assert.equal(first.unsupported_claim_rate, 1 / 6);
  assert.equal(first.citation_coverage, 4 / 6);
  assert.equal(first.repair_verification_rate, 1 / 2);
  assert.equal(first.repair_regression_rate, 1 / 2);
  assert.equal(first.median_latency_ms, 150);
  assert.equal(first.total_tokens, 20);
  assert.equal(first.total_cost_usd, 0.02);
  const second = result.grounded.configurations[otherHash];
  assert.equal(second.n, 2);
  assert.equal(second.completed, 1);
  assert.equal(second.failures, 1);
  assert.equal(second.unsupported_claim_rate, null);
  assert.equal(second.citation_coverage, null);
  assert.equal(second.repair_verification_rate, null);
  assert.equal(second.repair_regression_rate, null);
  assert.equal(second.median_latency_ms, 100);
  assert.equal(result["llm-only"].configurations[hash("f")].median_latency_ms, null);

  assert.throws(() => summarizeAblationRuns([]), /required/u);
  for (const invalid of [
    null,
    ablationRun({ run_id: "" }),
    ablationRun({ case_id: "" }),
    ablationRun({ condition: "invalid" }),
    ablationRun({ status: "invalid" }),
    ablationRun({ config_sha256: "bad" }),
  ]) assert.throws(() => summarizeAblationRuns([invalid]), /invalid or duplicate/u);
  assert.throws(() => summarizeAblationRuns([ablationRun(), ablationRun()]), /duplicate/u);
  for (const changes of [
    { correctness: "invalid" },
    { claims: -1 },
    { unsupported_claims: -1 },
    { unsupported_claims: 5 },
    { citation_supported_claims: -1 },
    { citation_supported_claims: 5 },
    { latency_ms: -1 },
    { tokens: -1 },
    { cost_usd: -1 },
    { repair: null },
    { repair: { attempted: "yes", verified: false, regression: false } },
    { repair: { attempted: true, verified: "yes", regression: false } },
    { repair: { attempted: true, verified: false, regression: "yes" } },
  ]) assert.throws(() => summarizeAblationRuns([ablationRun(changes)]), /invalid metrics/u);
  assert.doesNotThrow(() => summarizeAblationRuns([ablationRun({ status: "failed", claims: -1, repair: null })]));
});

function preparedArtifacts() {
  return Object.fromEntries(PHASE4_PREPARED_ARTIFACTS.map((file, index) => [file, index === 0 ? Buffer.from(`synthetic-${index}`) : `synthetic-${index}`]));
}

function preparedMetadata(overrides = {}) {
  return {
    status: "prepared",
    protocol_version: "phase4-preparatory-v1",
    source_commit: null,
    human_approval: null,
    ...overrides,
  };
}

function completeClosureGates() {
  return {
    real_provider_run: { complete: true, sha256: hash("1") },
    provider_config_frozen: { status: "frozen", sha256: hash("2") },
    dataset_frozen: { status: "frozen", sha256: hash("3") },
    human_review_complete: { complete: true, sha256: hash("4") },
    security_approved: { actor_type: "human", decision: "approved", url: "https://example.invalid/synthetic-approval", commit: "5".repeat(40) },
    statistical_plan_frozen: { status: "frozen", sha256: hash("6") },
    safety_corpus_passed: { complete: true, sha256: hash("7") },
    metrics_reproduced: { complete: true, sha256: hash("8") },
  };
}

test("prepared artifact manifests are exact and closure remains fail closed", () => {
  assert.equal(PHASE4_CLOSURE_GATES.length, 8);
  const artifacts = preparedArtifacts();
  const manifest = createPreparedEvidenceManifest(preparedMetadata(), artifacts);
  assert.equal(manifest.files.length, PHASE4_PREPARED_ARTIFACTS.length);
  assert.match(manifest.manifest_sha256, /^[0-9a-f]{64}$/u);
  assert.equal(verifyPreparedEvidenceManifest(manifest, artifacts), true);
  assert.equal(verifyPreparedEvidenceManifest(null, artifacts), false);
  assert.equal(verifyPreparedEvidenceManifest({ ...manifest, manifest_sha256: hash("0") }, artifacts), false);
  assert.equal(verifyPreparedEvidenceManifest(manifest, { ...artifacts, extra: "forbidden" }), false);

  for (const metadata of [
    null,
    preparedMetadata({ status: "closed" }),
    preparedMetadata({ protocol_version: "" }),
    preparedMetadata({ source_commit: "1".repeat(40) }),
    preparedMetadata({ human_approval: {} }),
  ]) assert.throws(() => createPreparedEvidenceManifest(metadata, artifacts), /prepared metadata/u);
  assert.throws(() => createPreparedEvidenceManifest(preparedMetadata(), null), /artifacts/u);
  const missing = { ...artifacts };
  delete missing[PHASE4_PREPARED_ARTIFACTS[0]];
  assert.throws(() => createPreparedEvidenceManifest(preparedMetadata(), missing), /exact/u);
  assert.throws(() => createPreparedEvidenceManifest(preparedMetadata(), { ...artifacts, extra: "no" }), /exact/u);

  const blocked = evaluatePhase4Closure(manifest, artifacts, {});
  assert.equal(blocked.status, "PREPARATORY");
  assert.equal(blocked.closed, false);
  assert.deepEqual(blocked.blockers, PHASE4_CLOSURE_GATES);
  assert.throws(() => assertPhase4Closure(manifest, artifacts, {}), /P4_GATE_INCOMPLETE/u);
  const invalidManifest = evaluatePhase4Closure(null, artifacts, null);
  assert.equal(invalidManifest.prepared_manifest_sha256, null);
  assert.ok(invalidManifest.blockers.includes("prepared_artifact_manifest_invalid"));
  assert.equal(evaluatePhase4Closure({}, artifacts, null).prepared_manifest_sha256, null);

  const gates = completeClosureGates();
  const closed = assertPhase4Closure(manifest, artifacts, gates);
  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.closed, true);
  assert.deepEqual(closed.blockers, []);
  for (const [gate, invalid] of [
    ["real_provider_run", { complete: false, sha256: hash("1") }],
    ["provider_config_frozen", { status: "prepared", sha256: hash("2") }],
    ["dataset_frozen", { status: "frozen", sha256: "bad" }],
    ["human_review_complete", null],
    ["security_approved", { actor_type: "provider", decision: "approved", url: "http://invalid", commit: "bad" }],
    ["statistical_plan_frozen", {}],
    ["safety_corpus_passed", { complete: true, sha256: "bad" }],
    ["metrics_reproduced", { complete: false, sha256: hash("8") }],
  ]) {
    const result = evaluatePhase4Closure(manifest, artifacts, { ...gates, [gate]: invalid });
    assert.deepEqual(result.blockers, [gate]);
  }
});
