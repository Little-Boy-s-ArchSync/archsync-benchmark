import assert from "node:assert/strict";
import test from "node:test";

import {
  ABLATION_CONDITIONS,
  ablationDesignSha256,
  assertAblationClosure,
  evaluateAblationClosure,
  validateAblationEvidence,
} from "../scripts/lib/ablation-evidence.mjs";

function pending(overrides = {}) {
  return {
    schema_version: 1,
    status: "pending",
    design: { status: "prepared", conditions: [...ABLATION_CONDITIONS], configs: Object.fromEntries(ABLATION_CONDITIONS.map((condition) => [condition, { version: null, sha256: null }])), human_approval: null },
    study_dataset_sha256: null,
    runs: [],
    results: null,
    replay: null,
    post_outcome_changes: [],
    ...overrides,
  };
}

function complete(overrides = {}) {
  const design = {
    status: "frozen",
    conditions: [...ABLATION_CONDITIONS],
    truth_sha256: "1".repeat(64),
    task_set_sha256: "2".repeat(64),
    scoring_sha256: "3".repeat(64),
    exclusions_sha256: "4".repeat(64),
    parser_sha256: "5".repeat(64),
    prompt_sha256: "6".repeat(64),
    configs: Object.fromEntries(ABLATION_CONDITIONS.map((condition, index) => [condition, { version: "unit-fixture-v1", sha256: String(index + 1).repeat(64) }])),
    human_approval: { actor_type: "human", decision: "approved", sha256: "7".repeat(64) },
  };
  const designSha = ablationDesignSha256(design);
  return pending({
    status: "complete",
    design,
    study_dataset_sha256: "8".repeat(64),
    runs: ABLATION_CONDITIONS.map((condition, index) => ({ run_id: `unit-fixture-${index}`, case_id: "unit-fixture-case", condition, design_sha256: designSha, config_sha256: design.configs[condition].sha256, status: "completed", score: index / 10, claims: 2, citation_supported_claims: 1, repair_verified: false })),
    results: { analysis_code_commit: "9".repeat(40), normalized_results_sha256: "a".repeat(64), metrics_sha256: "b".repeat(64) },
    replay: { first_sha256: "c".repeat(64), second_sha256: "c".repeat(64) },
    post_outcome_changes: [],
    ...overrides,
  });
}

test("ABL-101 pending workspace contains the exact five conditions and no invented results", () => {
  assert.deepEqual(validateAblationEvidence(pending()), []);
  assert.deepEqual(validateAblationEvidence(null), ["ablation evidence must be an object"]);
  assert.throws(() => ablationDesignSha256(null), /object/u);
  const invalid = pending({ schema_version: 2, status: "unknown", design: null });
  const issues = validateAblationEvidence(invalid);
  for (const expected of ["schema_version", "status", "exact five"]) assert.ok(issues.some((issue) => issue.includes(expected)), expected);
  assert.ok(validateAblationEvidence(pending({ runs: [{}] })).some((issue) => issue.includes("no frozen configuration")));
  const invalidConfigs = pending();
  invalidConfigs.design.configs["code-only"] = null;
  assert.ok(validateAblationEvidence(invalidConfigs).some((issue) => issue.includes("no frozen configuration")));
});

test("ABL-101 complete evidence binds one exact five-condition matrix and deterministic replay", () => {
  assert.deepEqual(validateAblationEvidence(complete()), []);
  const invalid = complete();
  invalid.design.status = "prepared";
  invalid.design.truth_sha256 = "bad";
  invalid.design.task_set_sha256 = "bad";
  invalid.design.scoring_sha256 = "bad";
  invalid.design.exclusions_sha256 = "bad";
  invalid.design.parser_sha256 = "bad";
  invalid.design.prompt_sha256 = "bad";
  invalid.design.configs["code-only"] = null;
  invalid.design.human_approval = null;
  invalid.study_dataset_sha256 = "bad";
  invalid.runs = [];
  invalid.results = null;
  invalid.replay = null;
  invalid.post_outcome_changes = ["forbidden"];
  const issues = validateAblationEvidence(invalid);
  for (const expected of ["frozen design", "truth_sha256", "task_set_sha256", "scoring_sha256", "exclusions_sha256", "parser_sha256", "prompt_sha256", "code-only", "human approval", "STUDY-103", "run rows", "analysis results", "metric replay", "forbidden"]) assert.ok(issues.some((issue) => issue.includes(expected)), expected);

  const badRuns = complete();
  badRuns.runs = [null, { run_id: "same", case_id: "", condition: "invalid", design_sha256: "bad", config_sha256: "bad", status: "unknown" }, { ...complete().runs[0], run_id: "same", score: Number.NaN, claims: -1, citation_supported_claims: 9, repair_verified: "no" }];
  const runIssues = validateAblationEvidence(badRuns);
  for (const expected of ["run 0", "unique ID", "frozen design/config", "invalid status", "incomplete result", "exactly once"]) assert.ok(runIssues.some((issue) => issue.includes(expected)), expected);
  const failed = complete();
  failed.runs[0] = { ...failed.runs[0], status: "failed", score: Number.NaN, claims: -1, citation_supported_claims: -1, repair_verified: "no" };
  assert.deepEqual(validateAblationEvidence(failed), []);
});

test("ABL-101 closure refuses a pending template and accepts only complete fixture evidence", () => {
  const blocked = evaluateAblationClosure(pending());
  assert.equal(blocked.status, "PREPARATORY");
  assert.deepEqual(blocked.blockers, ["ablation_not_executed"]);
  assert.throws(() => assertAblationClosure(pending()), /ABLATION_GATE_INCOMPLETE/u);
  assert.ok(evaluateAblationClosure(null).blockers.includes("ablation_validation_1"));
  const closed = assertAblationClosure(complete());
  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.closed, true);
});
