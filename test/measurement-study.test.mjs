import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  STUDY_STATISTICAL_PLAN_SOURCE,
  calculateStudyMetrics,
  createNormalizedAnalysis,
  validateAblationDesign,
  validateInstrumentation,
  validateStatisticalPlanSource,
  validateStudyManifest,
  validateTaskSuite,
} from "../scripts/lib/measurement-study.mjs";

const conditions = ["A", "B", "C", "D"];

test("STUDY-104 preparation is linked to the exact proposed STAT-101 source", async () => {
  const source = JSON.parse(await readFile(new URL("../measurement-study/statistical-plan-source.json", import.meta.url), "utf8"));
  assert.deepEqual(source, STUDY_STATISTICAL_PLAN_SOURCE);
  assert.deepEqual(validateStatisticalPlanSource(source), []);
  assert.deepEqual(validateStatisticalPlanSource(null), ["statistical plan source must be an object"]);
  const invalid = { ...source, paper_commit: "bad", extra: true };
  const issues = validateStatisticalPlanSource(invalid);
  assert.ok(issues.some((issue) => issue.includes("fields")));
  assert.ok(issues.some((issue) => issue.includes("paper_commit")));
});

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

function payload(type, condition) {
  if (type === "run_started") return { environment_sha256: "a".repeat(64), task_suite_sha256: "b".repeat(64), study_manifest_sha256: "c".repeat(64) };
  if (type === "baseline_recorded") return { baseline_commit: "d".repeat(40), tree_sha256: "e".repeat(64) };
  if (type === "prompt_recorded") return {
    prompt_sha256: "1".repeat(64),
    response_sha256: "2".repeat(64),
    provider_config_sha256: "3".repeat(64),
    redaction: { passed: true, audit_sha256: "4".repeat(64) },
    prompt_path: `redacted/${condition}/prompt.json`,
    output_path: `redacted/${condition}/output.json`,
  };
  if (type === "task_submitted") return { commit_chain: ["5".repeat(40)], acceptance_commands: ["pnpm test"] };
  if (type === "tests_recorded") return {
    commands: ["pnpm test"],
    results: [{ command: "pnpm test", status: "passed", exit_code: 0, duration_ms: 10 }],
    findings: 1,
    approvals: 0,
    repairs: 0,
  };
  return { status: "completed", wall_time_ms: 10, tokens: condition === "A" ? 0 : 5, findings: 1, approvals: 0, repairs: 0, ended_at: "2026-08-26T00:00:06Z", deviations: [] };
}

function runEvents(runId, condition = "A") {
  const types = ["run_started", "baseline_recorded", ...(condition === "A" ? [] : ["prompt_recorded"]), "task_submitted", "tests_recorded", "run_finished"];
  return types.map((type, index) => ({
    event_id: `${runId}-${index}`,
    run_id: runId,
    task_id: "TASK-001",
    condition,
    type,
    recorded_at: `2026-08-26T00:00:0${index}Z`,
    payload: payload(type, condition),
  }));
}

test("instrumentation dry run requires a complete failure-retaining event envelope", () => {
  assert.deepEqual(validateInstrumentation([...runEvents("a", "A"), ...runEvents("b", "B")]), []);
  assert.deepEqual(validateInstrumentation([]), ["instrumentation events are required"]);
  const invalidEvents = [
    null,
    { event_id: "same", run_id: "", task_id: "", condition: "bad", type: "bad", recorded_at: "", payload: null },
    { event_id: "same", run_id: "broken", task_id: "TASK-001", condition: "A", type: "run_started", recorded_at: "now", payload: {} },
    { event_id: "unknown", run_id: "unknown", task_id: "TASK-001", condition: "A", type: "unknown", recorded_at: "2026-08-26T00:00:00Z", payload: {} },
  ];
  const issues = validateInstrumentation(invalidEvents);
  for (const text of ["event 0", "id", "run_id", "condition", "type", "timestamp", "run_started payload", "missing baseline_recorded", "missing run_finished", "sequence"]) {
    assert.ok(issues.some((issue) => issue.includes(text)), text);
  }

  const changed = runEvents("changed", "B");
  changed[1] = { ...changed[1], condition: "C", task_id: "TASK-002" };
  assert.ok(validateInstrumentation(changed).some((issue) => issue.includes("changes condition or task")));
  const noPrompt = runEvents("no-prompt", "B").filter((event) => event.type !== "prompt_recorded");
  assert.ok(validateInstrumentation(noPrompt).some((issue) => issue.includes("missing prompt_recorded")));

  const manualPrompt = runEvents("manual-prompt", "A");
  manualPrompt.splice(2, 0, { ...runEvents("manual-prompt", "B")[2], event_id: "manual-prompt-extra", run_id: "manual-prompt", condition: "A" });
  assert.ok(validateInstrumentation(manualPrompt).some((issue) => issue.includes("must not record")));
  assert.ok(validateInstrumentation(manualPrompt).some((issue) => issue.includes("manual condition contains")));

  const reordered = runEvents("reordered", "A");
  [reordered[1], reordered[2]] = [reordered[2], reordered[1]];
  assert.ok(validateInstrumentation(reordered).some((issue) => issue.includes("sequence")));
  assert.ok(validateInstrumentation(reordered).some((issue) => issue.includes("monotonic")));

  const duplicate = runEvents("duplicate", "A");
  duplicate.splice(1, 0, { ...structuredClone(duplicate[0]), event_id: "duplicate-extra" });
  assert.ok(validateInstrumentation(duplicate).some((issue) => issue.includes("duplicate run_started")));

  for (const type of ["run_started", "baseline_recorded", "prompt_recorded", "task_submitted", "tests_recorded", "run_finished"]) {
    const condition = type === "prompt_recorded" ? "B" : "A";
    const events = runEvents(`invalid-${type}`, condition);
    events.find((event) => event.type === type).payload = {};
    assert.ok(validateInstrumentation(events).some((issue) => issue.includes(`${type} payload`)), type);
  }

  const invalidTests = runEvents("invalid-tests-detail", "A");
  invalidTests.find((event) => event.type === "tests_recorded").payload = {
    commands: ["pnpm test"],
    results: [{ command: "different", status: "unknown", exit_code: -1, duration_ms: -1 }],
    findings: -1,
    approvals: 1.5,
    repairs: -1,
  };
  assert.ok(validateInstrumentation(invalidTests).some((issue) => issue.includes("matched results")));
  for (const result of [
    { command: "pnpm test", status: "passed", exit_code: 1, duration_ms: 1 },
    { command: "pnpm test", status: "failed", exit_code: 0, duration_ms: 1 },
    { command: "pnpm test", status: "failed", exit_code: 1, duration_ms: 1 },
  ]) {
    const events = runEvents(`result-${result.status}-${result.exit_code}`, "A");
    events.find((event) => event.type === "tests_recorded").payload.results = [result];
    assert.equal(validateInstrumentation(events).some((issue) => issue.includes("matched results")), result.status !== "failed" || result.exit_code === 0);
  }

  const invalidPath = runEvents("invalid-path", "B");
  invalidPath.find((event) => event.type === "prompt_recorded").payload.prompt_path = "../secret";
  assert.ok(validateInstrumentation(invalidPath).some((issue) => issue.includes("redacted")));
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
  ], STUDY_STATISTICAL_PLAN_SOURCE);
  assert.equal(metrics.analysis_status, "descriptive-preparatory");
  assert.deepEqual(metrics.statistical_plan, STUDY_STATISTICAL_PLAN_SOURCE);
  assert.equal(metrics.assigned_n, 3);
  assert.equal(metrics.analyzed_n, 3);
  assert.deepEqual(metrics.conditions.A.violations_per_commit, { numerator: 3, denominator: 3, value: 1 });
  assert.deepEqual(metrics.conditions.A.approval_interventions_per_run, { numerator: 1, denominator: 2, value: 0.5 });
  assert.deepEqual(metrics.conditions.A.false_block_burden_per_run, { numerator: 1, denominator: 2, value: 0.5 });
  assert.deepEqual(metrics.conditions.A.repair_success_rate, { numerator: 1, denominator: 2, value: 0.5 });
  assert.deepEqual(metrics.conditions.A.regression_rate, { numerator: 1, denominator: 2, value: 0.5 });
  assert.deepEqual(metrics.conditions.A.time_to_fix_ms, { n: 2, min: 10, q1: 10, median: 20, q3: 30, max: 30 });
  assert.deepEqual(metrics.conditions.A.merge_delay_ms, { n: 2, min: 20, q1: 20, median: 30, q3: 40, max: 40 });
  assert.deepEqual(metrics.conditions.A.status_counts, { completed: 1, failed: 1, inconclusive: 0 });
  assert.equal(metrics.conditions.A.total_compute_cost_usd, 0.2);
  assert.ok(metrics.conditions.A.uncertainty.completion_rate.interval.low >= 0);
  assert.equal(metrics.conditions.B.status_counts.inconclusive, 1);
  assert.deepEqual(metrics.conditions.B.time_to_fix_ms, { n: 0, min: null, q1: null, median: null, q3: null, max: null });
  assert.deepEqual(metrics.conditions.B.repair_success_rate, { numerator: 0, denominator: 0, value: null });
  assert.equal(metrics.conditions.B.uncertainty.repair_success_rate.low, null);
  assert.throws(() => calculateStudyMetrics([], STUDY_STATISTICAL_PLAN_SOURCE), /required/);
  assert.throws(() => calculateStudyMetrics([studyRow()], null), /statistical plan linkage/);
  for (const invalid of [
    null,
    studyRow({ run_id: "" }),
    studyRow({ condition: "X" }),
    studyRow({ status: "X" }),
  ]) assert.throws(() => calculateStudyMetrics([invalid], STUDY_STATISTICAL_PLAN_SOURCE), /invalid or duplicate/);
  assert.throws(() => calculateStudyMetrics([studyRow(), studyRow()], STUDY_STATISTICAL_PLAN_SOURCE), /duplicate/);
  for (const [key, value] of [
    ["commits", -1], ["violations", Number.NaN], ["merge_delay_ms", -1], ["approvals", -1], ["false_blocks", -1], ["token_cost_usd", -1], ["compute_cost_usd", -1],
  ]) assert.throws(() => calculateStudyMetrics([studyRow({ [key]: value })], STUDY_STATISTICAL_PLAN_SOURCE), /invalid study metric/);
  for (const changes of [{ commits: 1.5 }, { violations: 1.5 }, { approvals: 1.5 }, { false_blocks: 1.5 }]) {
    assert.throws(() => calculateStudyMetrics([studyRow(changes)], STUDY_STATISTICAL_PLAN_SOURCE), /count metrics/);
  }
  for (const time of [-1, Number.NaN]) assert.throws(() => calculateStudyMetrics([studyRow({ time_to_fix_ms: time })], STUDY_STATISTICAL_PLAN_SOURCE), /time_to_fix/);
  for (const repair of [null, { attempted: "yes", success: true, regression: false }, { attempted: true, success: "yes", regression: false }, { attempted: true, success: true, regression: "no" }]) {
    assert.throws(() => calculateStudyMetrics([studyRow({ repair })], STUDY_STATISTICAL_PLAN_SOURCE), /repair metrics/);
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
