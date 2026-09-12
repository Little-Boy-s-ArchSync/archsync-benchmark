import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  STUDY_STATISTICAL_PLAN_SOURCE,
  calculateStudyMetrics,
  createNormalizedAnalysis,
  validateAblationDesign,
  validateInstrumentation,
  validateInstrumentationArtifacts,
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
    recorded_at: `2026-08-26T00:00:0${type === "run_finished" ? 6 : index}Z`,
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


test("instrumentation binds submitted acceptance commands to actual test execution", () => {
  const events = runEvents("command-substitution");
  events.find((event) => event.type === "tests_recorded").payload.commands = ["node -e 'process.exit(0)'"];
  events.find((event) => event.type === "tests_recorded").payload.results[0].command = "node -e 'process.exit(0)'";
  assert.ok(validateInstrumentation(events).some((issue) => issue.includes("submitted acceptance commands")));
});

test("instrumentation rejects dropped, reordered and duplicate acceptance commands", () => {
  for (const actual of [["test-a"], ["test-b", "test-a"], ["test-a", "test-a"]]) {
    const events = runEvents("commands");
    events.find((event) => event.type === "task_submitted").payload.acceptance_commands = ["test-a", "test-b"];
    const tests = events.find((event) => event.type === "tests_recorded").payload;
    tests.commands = actual;
    tests.results = actual.map((command) => ({ command, status: "passed", exit_code: 0, duration_ms: 0 }));
    assert.ok(validateInstrumentation(events).some((issue) => issue.includes("submitted acceptance commands")));
  }
});

test("instrumentation preserves findings, approvals and repairs in final counts", () => {
  for (const key of ["findings", "approvals", "repairs"]) {
    const events = runEvents(`counts-${key}`);
    events.at(-1).payload[key] += 1;
    assert.ok(validateInstrumentation(events).some((issue) => issue.includes(`final ${key} count`)));
  }
});

test("instrumentation cannot claim completed when acceptance tests failed", () => {
  const events = runEvents("failed-tests", "B");
  const result = events.find((event) => event.type === "tests_recorded").payload.results[0];
  Object.assign(result, { status: "failed", exit_code: 1 });
  assert.ok(validateInstrumentation(events).some((issue) => issue.includes("completed run has failed acceptance tests")));
  for (const status of ["failed", "inconclusive"]) {
    events.at(-1).payload.status = status;
    assert.deepEqual(validateInstrumentation(events), []);
  }
});

test("instrumentation rejects model usage in the human-only condition", () => {
  const events = runEvents("manual-token-usage");
  events.at(-1).payload.tokens = 1;
  assert.ok(validateInstrumentation(events).some((issue) => issue.includes("manual condition A reports model tokens")));
});

test("instrumentation requires end time after tests and before finish was recorded", () => {
  for (const endedAt of ["2026-08-25T23:59:59Z", "2026-08-26T00:00:07Z"]) {
    const events = runEvents("end-time");
    events.at(-1).payload.ended_at = endedAt;
    assert.ok(validateInstrumentation(events).some((issue) => issue.includes("end time falls outside")));
  }
});

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function artifactFixture(runId = "synthetic-artifact-run", condition = "B", status = "completed") {
  const events = runEvents(runId, condition);
  const files = new Map();
  const references = [];
  function bind(payload, pathKey, hashKey, role) {
    const path = `${runId}-${role}.json`;
    const bytes = Buffer.from(JSON.stringify({ fixture: "synthetic-only", run_id: runId, role }));
    payload[pathKey] = path;
    payload[hashKey] = digest(bytes);
    files.set(path, bytes);
    references.push({ path, role });
  }
  for (const event of events) {
    event.attempt_id = `${runId}-attempt-1`;
    const payload = event.payload;
    if (event.type === "run_started") {
      for (const key of ["environment", "task_suite", "study_manifest"]) bind(payload, `${key}_path`, `${key}_sha256`, key);
    }
    if (event.type === "baseline_recorded") bind(payload, "tree_path", "tree_sha256", "tree");
    if (event.type === "prompt_recorded") {
      bind(payload, "prompt_path", "prompt_sha256", "prompt");
      bind(payload, "output_path", "response_sha256", "response");
      bind(payload, "provider_config_path", "provider_config_sha256", "provider-config");
      bind(payload.redaction, "audit_path", "audit_sha256", "redaction-audit");
    }
    if (event.type === "tests_recorded" && status !== "completed") Object.assign(payload.results[0], { status: "failed", exit_code: 1 });
    if (event.type === "run_finished") payload.status = status;
    const bytes = Buffer.from(JSON.stringify({ schema_version: 1, event }));
    const path = `${event.event_id}-receipt.json`;
    event.artifact = { path, sha256: digest(bytes) };
    files.set(path, bytes);
  }
  const readArtifact = async (path) => {
    if (!files.has(path)) throw new Error("ENOENT");
    return files.get(path);
  };
  return { events, files, references, readArtifact };
}

test("strict artifact verification retains complete A-D completed, failed and inconclusive attempts", async () => {
  for (const condition of conditions) {
    for (const status of ["completed", "failed", "inconclusive"]) {
      const fixture = artifactFixture(`synthetic-${condition}-${status}`, condition, status);
      const original = structuredClone(fixture.events);
      assert.deepEqual(await validateInstrumentationArtifacts(fixture.events, fixture.readArtifact), []);
      assert.deepEqual(fixture.events, original);
      assert.equal(fixture.events.at(-1).payload.status, status);
    }
  }
});

test("strict artifact verification rejects missing and changed bytes for every claimed artifact", async () => {
  const fixture = artifactFixture();
  for (const [path, original] of [...fixture.files]) {
    // The previous structural validator accepts both missing and substituted files.
    fixture.files.delete(path);
    assert.deepEqual(validateInstrumentation(fixture.events), []);
    assert.ok((await validateInstrumentationArtifacts(fixture.events, fixture.readArtifact)).some((issue) => issue.includes("missing or unreadable")), path);
    fixture.files.set(path, Buffer.concat([original, Buffer.from("\n")]));
    assert.deepEqual(validateInstrumentation(fixture.events), []);
    assert.ok((await validateInstrumentationArtifacts(fixture.events, fixture.readArtifact)).some((issue) => issue.includes("SHA-256 mismatch")), path);
    fixture.files.set(path, original);
  }
  assert.deepEqual(await validateInstrumentationArtifacts(fixture.events, fixture.readArtifact), []);
});

test("strict receipts reject correctly hashed substitutions across event, run and attempt identities", async () => {
  for (const [key, value] of [
    ["schema_version", 2], ["event_id", "other-event"], ["run_id", "other-run"], ["attempt_id", "other-attempt"],
    ["task_id", "TASK-002"], ["condition", "C"], ["type", "run_started"], ["recorded_at", "2026-08-26T00:00:00Z"],
    ["payload", {}], ["extra", true],
  ]) {
    const fixture = artifactFixture();
    const event = fixture.events.find((row) => row.type === "tests_recorded");
    const receipt = JSON.parse(fixture.files.get(event.artifact.path));
    if (["schema_version", "extra"].includes(key)) receipt[key] = value;
    else receipt.event[key] = value;
    const replacement = Buffer.from(JSON.stringify(receipt));
    fixture.files.set(event.artifact.path, replacement);
    event.artifact.sha256 = digest(replacement);
    assert.deepEqual(validateInstrumentation(fixture.events), []);
    assert.ok((await validateInstrumentationArtifacts(fixture.events, fixture.readArtifact)).some((issue) => issue.includes("exact event and run/attempt binding")), key);
  }
});

test("strict verification rejects passed summaries substituted for recorded failed acceptance tests", async () => {
  const fixture = artifactFixture("synthetic-failed-attempt", "B", "failed");
  const originalFiles = [...fixture.files].map(([path, bytes]) => [path, Buffer.from(bytes)]);
  Object.assign(fixture.events.find((row) => row.type === "tests_recorded").payload.results[0], { status: "passed", exit_code: 0 });
  fixture.events.at(-1).payload.status = "completed";
  assert.deepEqual(validateInstrumentation(fixture.events), []);
  const issues = await validateInstrumentationArtifacts(fixture.events, fixture.readArtifact);
  assert.equal(issues.filter((issue) => issue.includes("exact event and run/attempt binding")).length, 2);
  assert.deepEqual([...fixture.files], originalFiles);
});

test("strict verification requires one stable attempt per run and an injected byte reader", async () => {
  assert.deepEqual(await validateInstrumentationArtifacts([]), ["instrumentation events are required"]);
  const fixture = artifactFixture();
  assert.deepEqual(await validateInstrumentationArtifacts(fixture.events), ["artifact verification requires an injected byte reader"]);
  const noRead = () => assert.fail("invalid attempt envelopes must not read artifacts");
  for (const attempt of [undefined, ""]) {
    const events = structuredClone(fixture.events);
    events[0].attempt_id = attempt;
    assert.ok((await validateInstrumentationArtifacts(events, noRead)).some((issue) => issue.includes("requires attempt_id")));
  }
  const changed = structuredClone(fixture.events);
  changed[1].attempt_id = "other-attempt";
  assert.ok((await validateInstrumentationArtifacts(changed, noRead)).some((issue) => issue.includes("changes attempt_id")));
  const second = artifactFixture("synthetic-other-run");
  second.events.forEach((event) => { event.attempt_id = fixture.events[0].attempt_id; });
  assert.ok((await validateInstrumentationArtifacts([...fixture.events, ...second.events], noRead)).some((issue) => issue.includes("reused by another run")));
});

test("strict verification rejects invalid references before handing their paths to the reader", async () => {
  const fixture = artifactFixture();
  for (const descriptor of [
    undefined, null, {}, { path: "receipt.json", sha256: "bad" },
    ...["../secret", "/absolute", "C:/absolute", "a\\b", "a//b", "a/./b", "a:b", "a\0b", "https://example.com/a", "%2e%2e/a"].map((path) => ({ path, sha256: "a".repeat(64) })),
  ]) {
    const events = structuredClone(fixture.events);
    events[0].artifact = descriptor;
    const visited = [];
    const issues = await validateInstrumentationArtifacts(events, async (path) => {
      visited.push(path);
      return fixture.readArtifact(path);
    });
    assert.ok(issues.some((issue) => issue.includes("safe artifact path and SHA-256")));
    assert.ok(!visited.includes(descriptor?.path));
  }
  for (const [type, key] of [["run_started", "environment_path"], ["baseline_recorded", "tree_path"], ["prompt_recorded", "provider_config_path"]]) {
    const events = structuredClone(fixture.events);
    delete events.find((event) => event.type === type).payload[key];
    assert.ok((await validateInstrumentationArtifacts(events, fixture.readArtifact)).some((issue) => issue.includes("safe artifact path and SHA-256")));
  }
});

test("strict verification requires actual nonempty bytes and valid exact receipt JSON", async () => {
  const fixture = artifactFixture();
  for (const result of [undefined, null, "text", {}, Buffer.alloc(0)]) {
    assert.ok((await validateInstrumentationArtifacts(fixture.events, async () => result)).some((issue) => issue.includes("non-empty bytes")));
  }
  for (const content of ["not JSON", "null", "[]"]) {
    const events = structuredClone(fixture.events);
    const bytes = Buffer.from(content);
    events[0].artifact.sha256 = digest(bytes);
    const issues = await validateInstrumentationArtifacts(events, async (path) => path === events[0].artifact.path ? bytes : fixture.readArtifact(path));
    assert.ok(issues.some((issue) => issue.includes(content === "not JSON" ? "must contain JSON" : "exact event and run/attempt binding")));
  }
});

test("strict verification snapshots event claims before awaiting the reader", async () => {
  const fixture = artifactFixture();
  const issues = await validateInstrumentationArtifacts(fixture.events, async (path) => {
    // Mutating caller-owned input must not change the attempt being verified.
    fixture.events.at(-1).payload.status = "failed";
    fixture.events.at(-1).artifact.sha256 = "f".repeat(64);
    return fixture.readArtifact(path);
  });
  assert.deepEqual(issues, []);
});

test("strict verification observes deletion and substitution through a real temporary-file reader", async () => {
  const fixture = artifactFixture();
  const directory = await mkdtemp(join(tmpdir(), "archsync-study-artifacts-"));
  try {
    for (const [path, bytes] of fixture.files) await writeFile(join(directory, path), bytes);
    const reader = (path) => readFile(join(directory, path));
    assert.deepEqual(await validateInstrumentationArtifacts(fixture.events, reader), []);
    const prompt = fixture.references.find((reference) => reference.role === "prompt").path;
    await rm(join(directory, prompt));
    assert.deepEqual(validateInstrumentation(fixture.events), []);
    assert.ok((await validateInstrumentationArtifacts(fixture.events, reader)).some((issue) => issue.includes("prompt artifact is missing or unreadable")));
    await writeFile(join(directory, prompt), "substituted synthetic prompt bytes");
    assert.ok((await validateInstrumentationArtifacts(fixture.events, reader)).some((issue) => issue.includes("prompt artifact SHA-256 mismatch")));
  } finally {
    await rm(directory, { recursive: true, force: true });
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
