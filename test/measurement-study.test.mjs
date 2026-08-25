import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  calculateStudyMetrics,
  createNormalizedAnalysis,
  validateAblationDesign,
  validateInstrumentation,
  validateStudyManifest,
  validateTaskSuite,
} from "../scripts/lib/measurement-study.mjs";

const conditions = ["A", "B", "C", "D"];

test("task suite locks shared task fields outside A-D treatments", async () => {
  const suite = JSON.parse(await readFile(new URL("../measurement-study/task-suite.json", import.meta.url), "utf8"));
  assert.deepEqual(validateTaskSuite(suite), []);
  assert.deepEqual(validateTaskSuite(null), ["task suite must be an object"]);
  assert.deepEqual(validateTaskSuite({ schema_version: 2, conditions: [], tasks: [] }), [
    "schema_version must equal 1",
    "conditions must be exactly A, B, C and D",
    "tasks must be a non-empty array",
  ]);

  const invalid = {
    schema_version: 1,
    conditions,
    tasks: [
      null,
      {
        id: "bad",
        baseline_commit: "short",
        difficulty: "",
        rationale: "",
        expected_behavior: "",
        feature_steps: [""],
        acceptance_commands: null,
        treatments: null,
      },
      {
        baseline_commit: undefined,
        difficulty: "d",
        rationale: "r",
        expected_behavior: "e",
        feature_steps: ["step"],
        acceptance_commands: ["test"],
        treatments: Object.fromEntries(conditions.map((condition) => [condition, { allowed_tools: [] }])),
      },
      {
        id: "TASK-001",
        baseline_commit: "a".repeat(40),
        difficulty: "d",
        rationale: "r",
        expected_behavior: "e",
        feature_steps: ["step"],
        acceptance_commands: ["test"],
        treatments: Object.fromEntries(conditions.map((condition) => [condition, condition === "A" ? null : { allowed_tools: condition === "B" ? null : [] }])),
      },
      {
        id: "TASK-001",
        baseline_commit: "a".repeat(40),
        difficulty: "d",
        rationale: "r",
        expected_behavior: "e",
        feature_steps: [],
        acceptance_commands: [""],
        treatments: Object.fromEntries(conditions.map((condition) => [condition, { allowed_tools: [] }])),
      },
    ],
  };
  const issues = validateTaskSuite(invalid);
  for (const text of ["task 0", "id", "baseline", "difficulty", "rationale", "expected_behavior", "feature_steps", "acceptance_commands", "four treatments", "treatment A", "treatment B"]) {
    assert.ok(issues.some((issue) => issue.includes(text)), text);
  }
});

function frozenStudyManifest(overrides = {}) {
  return {
    schema_version: 1,
    status: "frozen",
    protocol_version: "v1",
    eligibility: "eligible",
    sample_size_rationale: "power and feasibility",
    assignment: "locked randomization",
    counterbalancing: "latin square",
    task_order: "locked",
    environment: "hash-bound",
    stop_rule: "locked",
    exclusions: "locked",
    treatment_config: Object.fromEntries(conditions.map((condition) => [condition, {}])),
    manifest_sha256: "a".repeat(64),
    approvals: Object.fromEntries(["ethics", "data", "lead"].map((role) => [role, { actor_type: "human", reviewer_id: role, approved_at: "2026-08-26T00:00:00Z" }])),
    ...overrides,
  };
}

test("study manifests cannot freeze without all human gates", async () => {
  const proposed = JSON.parse(await readFile(new URL("../measurement-study/manifest.template.json", import.meta.url), "utf8"));
  assert.deepEqual(validateStudyManifest(proposed), []);
  assert.deepEqual(validateStudyManifest(frozenStudyManifest()), []);
  assert.deepEqual(validateStudyManifest(null), ["study manifest must be an object"]);
  const invalid = frozenStudyManifest({
    schema_version: 2,
    status: "invalid",
    protocol_version: "",
    eligibility: "",
    sample_size_rationale: "",
    assignment: "",
    counterbalancing: "",
    task_order: "",
    environment: "",
    stop_rule: "",
    exclusions: "",
    treatment_config: null,
    manifest_sha256: "bad",
  });
  const issues = validateStudyManifest(invalid);
  for (const text of ["schema_version", "status", "protocol_version", "eligibility", "sample_size", "assignment", "counterbalancing", "task_order", "environment", "stop_rule", "exclusions", "treatment_config"]) {
    assert.ok(issues.some((issue) => issue.includes(text)), text);
  }
  const unapproved = frozenStudyManifest({ manifest_sha256: "bad", approvals: { ethics: null, data: { actor_type: "provider" } } });
  const approvalIssues = validateStudyManifest(unapproved);
  for (const text of ["manifest_sha256", "ethics", "data", "lead"]) assert.ok(approvalIssues.some((issue) => issue.includes(text)), text);
  const missingHash = frozenStudyManifest();
  delete missingHash.manifest_sha256;
  assert.ok(validateStudyManifest(missingHash).some((issue) => issue.includes("manifest_sha256")));
  const proposedWithApproval = { ...proposed, approvals: {} };
  assert.ok(validateStudyManifest(proposedWithApproval).some((issue) => issue.includes("approvals must be null")));
});

function runEvents(runId, condition = "A") {
  const types = ["run_started", "baseline_recorded", ...(condition === "A" ? [] : ["prompt_recorded"]), "task_submitted", "tests_recorded", "run_finished"];
  return types.map((type, index) => ({
    event_id: `${runId}-${index}`,
    run_id: runId,
    task_id: "TASK-001",
    condition,
    type,
    recorded_at: `2026-08-26T00:00:0${index}Z`,
    payload: type === "run_finished" ? { status: "completed", wall_time_ms: 10, tokens: condition === "A" ? 0 : 5, findings: 1, approvals: 0, repairs: 0 } : {},
  }));
}

test("instrumentation dry run requires a complete failure-retaining event envelope", () => {
  assert.deepEqual(validateInstrumentation([...runEvents("a", "A"), ...runEvents("b", "B")]), []);
  assert.deepEqual(validateInstrumentation([]), ["instrumentation events are required"]);
  const invalidEvents = [
    null,
    { event_id: "same", run_id: "", task_id: "", condition: "bad", type: "bad", recorded_at: "", payload: null },
    { event_id: "same", run_id: "broken", task_id: "TASK-001", condition: "A", type: "run_started", recorded_at: "now", payload: {} },
  ];
  const issues = validateInstrumentation(invalidEvents);
  for (const text of ["event 0", "id", "run_id", "condition", "type", "timestamp", "missing baseline_recorded", "missing run_finished", "incomplete final"]) {
    assert.ok(issues.some((issue) => issue.includes(text)), text);
  }

  const changed = runEvents("changed", "B");
  changed[1] = { ...changed[1], condition: "C", task_id: "TASK-002" };
  assert.ok(validateInstrumentation(changed).some((issue) => issue.includes("changes condition or task")));
  const noPrompt = runEvents("no-prompt", "B").filter((event) => event.type !== "prompt_recorded");
  assert.ok(validateInstrumentation(noPrompt).some((issue) => issue.includes("missing prompt_recorded")));

  const base = runEvents("invalid-finish", "A");
  const finishIndex = base.findIndex((event) => event.type === "run_finished");
  for (const payload of [
    null,
    { status: "bad", wall_time_ms: 1, tokens: 1, findings: 1, approvals: 1, repairs: 1 },
    { status: "failed", wall_time_ms: -1, tokens: 1, findings: 1, approvals: 1, repairs: 1 },
    { status: "failed", wall_time_ms: Number.NaN, tokens: 1, findings: 1, approvals: 1, repairs: 1 },
    { status: "failed", wall_time_ms: 1, tokens: -1, findings: 1, approvals: 1, repairs: 1 },
    { status: "failed", wall_time_ms: 1, tokens: Number.NaN, findings: 1, approvals: 1, repairs: 1 },
    { status: "failed", wall_time_ms: 1, tokens: 1, findings: -1, approvals: 1, repairs: 1 },
    { status: "failed", wall_time_ms: 1, tokens: 1, findings: 1.5, approvals: 1, repairs: 1 },
    { status: "failed", wall_time_ms: 1, tokens: 1, findings: 1, approvals: -1, repairs: 1 },
    { status: "failed", wall_time_ms: 1, tokens: 1, findings: 1, approvals: 1, repairs: -1 },
  ]) {
    const events = structuredClone(base);
    events[finishIndex].payload = payload;
    assert.ok(validateInstrumentation(events).some((issue) => issue.includes("incomplete final")));
  }
});

function studyRow(overrides = {}) {
  return {
    run_id: "r1",
    condition: "A",
    status: "completed",
    commits: 2,
    violations: 1,
    time_to_fix_ms: 10,
    merge_delay_ms: 20,
    approvals: 1,
    false_blocks: 0,
    token_cost_usd: 0,
    compute_cost_usd: 0.1,
    repair: { attempted: true, success: true, regression: false },
    ...overrides,
  };
}

test("study metrics expose denominators, failures, burden and costs", () => {
  const metrics = calculateStudyMetrics([
    studyRow(),
    studyRow({ run_id: "r2", status: "failed", commits: 1, violations: 2, time_to_fix_ms: 30, merge_delay_ms: 40, approvals: 0, false_blocks: 1, repair: { attempted: true, success: false, regression: true } }),
    studyRow({ run_id: "r3", condition: "B", status: "inconclusive", commits: 1, violations: 0, time_to_fix_ms: null, merge_delay_ms: 5, approvals: 0, false_blocks: 0, token_cost_usd: 0.02, compute_cost_usd: 0.03, repair: { attempted: false, success: false, regression: false } }),
  ]);
  assert.deepEqual(metrics.A, {
    n: 2,
    completed: 1,
    failed: 1,
    inconclusive: 0,
    violations_per_commit: 1,
    median_time_to_fix_ms: 20,
    median_merge_delay_ms: 30,
    approval_interventions_per_run: 0.5,
    false_block_burden_per_run: 0.5,
    repair_success_rate: 0.5,
    regression_rate: 0.5,
    total_token_cost_usd: 0,
    total_compute_cost_usd: 0.2,
  });
  assert.equal(metrics.B.inconclusive, 1);
  assert.equal(metrics.B.median_time_to_fix_ms, null);
  assert.equal(metrics.B.repair_success_rate, null);
  assert.throws(() => calculateStudyMetrics([]), /required/);
  for (const invalid of [
    null,
    studyRow({ run_id: "" }),
    studyRow({ condition: "X" }),
    studyRow({ status: "X" }),
  ]) assert.throws(() => calculateStudyMetrics([invalid]), /invalid or duplicate/);
  assert.throws(() => calculateStudyMetrics([studyRow(), studyRow()]), /duplicate/);
  for (const [key, value] of [
    ["commits", -1], ["violations", Number.NaN], ["merge_delay_ms", -1], ["approvals", -1], ["false_blocks", -1], ["token_cost_usd", -1], ["compute_cost_usd", -1],
  ]) assert.throws(() => calculateStudyMetrics([studyRow({ [key]: value })]), /invalid study metric/);
  for (const changes of [{ commits: 1.5 }, { violations: 1.5 }, { approvals: 1.5 }, { false_blocks: 1.5 }]) {
    assert.throws(() => calculateStudyMetrics([studyRow(changes)]), /count metrics/);
  }
  for (const time of [-1, Number.NaN]) assert.throws(() => calculateStudyMetrics([studyRow({ time_to_fix_ms: time })]), /time_to_fix/);
  for (const repair of [null, { attempted: "yes", success: true, regression: false }, { attempted: true, success: "yes", regression: false }, { attempted: true, success: true, regression: "no" }]) {
    assert.throws(() => calculateStudyMetrics([studyRow({ repair })]), /repair metrics/);
  }
});

function ablationDesign(overrides = {}) {
  const ablationConditions = ["code-only", "code-iac", "code-iac-runtime", "evidence-grounded", "llm-only"];
  return {
    status: "prepared",
    conditions: ablationConditions,
    truth_sha256: "a".repeat(64),
    task_set_sha256: "b".repeat(64),
    scoring_sha256: "c".repeat(64),
    exclusions_sha256: "d".repeat(64),
    configs: Object.fromEntries(ablationConditions.map((condition) => [condition, { version: "draft-v1" }])),
    human_approval: null,
    ...overrides,
  };
}

test("multi-source ablation design remains prepared until its sources are frozen", () => {
  assert.deepEqual(validateAblationDesign(ablationDesign()), []);
  assert.deepEqual(validateAblationDesign(null), ["ablation design must be an object"]);
  const invalid = ablationDesign({
    status: "frozen",
    conditions: [],
    truth_sha256: "bad",
    task_set_sha256: "bad",
    scoring_sha256: "bad",
    exclusions_sha256: "bad",
    configs: null,
    human_approval: {},
  });
  const issues = validateAblationDesign(invalid);
  for (const text of ["five", "truth", "task_set", "scoring", "exclusions", "configs", "prepared"]) assert.ok(issues.some((issue) => issue.includes(text)), text);
  const missingVersion = ablationDesign();
  missingVersion.configs["code-only"].version = "";
  assert.ok(validateAblationDesign(missingVersion).some((issue) => issue.includes("code-only")));
  const missingHash = ablationDesign();
  delete missingHash.truth_sha256;
  assert.ok(validateAblationDesign(missingHash).some((issue) => issue.includes("truth_sha256")));
});

test("analysis normalization is deterministic and hash-bound", () => {
  const result = createNormalizedAnalysis([
    { run_id: "b", condition: "B", status: "failed" },
    { run_id: "a", condition: "A", status: "completed", outcome: 1 },
  ], "a".repeat(64));
  assert.deepEqual(result.rows, [
    { run_id: "a", condition: "A", status: "completed", outcome: 1 },
    { run_id: "b", condition: "B", status: "failed", outcome: null },
  ]);
  assert.match(result.normalized_sha256, /^[0-9a-f]{64}$/u);
  assert.throws(() => createNormalizedAnalysis([], "a".repeat(64)), /required/);
  assert.throws(() => createNormalizedAnalysis([{}], "bad"), /required/);
  assert.throws(() => createNormalizedAnalysis([{}], undefined), /required/);
  for (const invalid of [
    null,
    { run_id: "", condition: "A", status: "completed" },
    { run_id: "a", condition: "X", status: "completed" },
    { run_id: "a", condition: "A", status: "X" },
  ]) assert.throws(() => createNormalizedAnalysis([invalid], "a".repeat(64)), /invalid analysis row/);
  assert.throws(() => createNormalizedAnalysis([
    { run_id: "a", condition: "A", status: "completed" },
    { run_id: "a", condition: "B", status: "failed" },
  ], "a".repeat(64)), /invalid analysis row/);
});
