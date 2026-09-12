import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

const CONDITIONS = ["A", "B", "C", "D"];
const TREATMENT_TOOLS = { A: [], B: ["model"], C: ["model", "repository-context"], D: ["model", "repository-context", "archsync-evidence"] };
const EVENT_TYPES = new Set([
  "run_started",
  "baseline_recorded",
  "prompt_recorded",
  "task_submitted",
  "tests_recorded",
  "run_finished",
]);
const STATUSES = new Set(["completed", "failed", "inconclusive"]);
const TEST_STATUSES = new Set(["passed", "failed"]);
const ABLATION_CONDITIONS = ["code-only", "code-iac", "code-iac-runtime", "evidence-grounded", "llm-only"];

export const STUDY_STATISTICAL_PLAN_SOURCE = Object.freeze({
  schema_version: 1,
  paper_pr: "https://github.com/Little-Boy-s-ArchSync/archsync-paper/pull/17",
  paper_commit: "a6f4be43171240dfa30e5d5a484b074a0a236830",
  path: "research/statistical-analysis-plan.md",
  sha256: "5d5b99204f7ebcfaf1573bb8eeecbbf08b28fdec8ee1be9ed15639899e202421",
  version: "0.1.0-draft",
  status: "proposed",
  task_id: "STAT-101",
});

function object(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function sha(value) {
  return /^[0-9a-f]{64}$/u.test(value ?? "");
}

function fullCommit(value) {
  return /^[0-9a-f]{40}$/u.test(value ?? "");
}

function safeRelativePath(value) {
  return nonEmpty(value) && !value.startsWith("/") && !/^[A-Za-z]:/u.test(value) && !value.includes("\\") && !value.split("/").includes("..") && !value.split("/").includes("");
}

function ratioRecord(numerator, denominator) {
  return { numerator, denominator, value: denominator === 0 ? null : numerator / denominator };
}

function median(values) {
  if (values.length === 0) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0 ? ordered[middle - 1] + (ordered[middle] - ordered[middle - 1]) / 2 : ordered[middle];
}

function percentile(ordered, fraction) {
  return ordered[Math.max(0, Math.ceil(ordered.length * fraction) - 1)];
}

function distribution(values) {
  const ordered = [...values].sort((a, b) => a - b);
  return {
    n: ordered.length,
    min: ordered.length === 0 ? null : ordered[0],
    q1: ordered.length === 0 ? null : percentile(ordered, 0.25),
    median: median(ordered),
    q3: ordered.length === 0 ? null : percentile(ordered, 0.75),
    max: ordered.length === 0 ? null : ordered.at(-1),
  };
}

function wilson(numerator, denominator, z = 1.96) {
  if (denominator === 0) return { method: "Wilson 95%", low: null, high: null };
  const observed = numerator / denominator;
  const z2 = z * z;
  const adjusted = 1 + z2 / denominator;
  const center = (observed + z2 / (2 * denominator)) / adjusted;
  const margin = z * Math.sqrt((observed * (1 - observed) + z2 / (4 * denominator)) / denominator) / adjusted;
  return { method: "Wilson 95%", low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactSet(values, expected) {
  return Array.isArray(values) && values.length === expected.length && new Set(values).size === expected.length
    && values.every((value) => typeof value === "string" && expected.includes(value));
}

export function validateStatisticalPlanSource(source) {
  if (!object(source)) return ["statistical plan source must be an object"];
  const issues = [];
  const expectedKeys = Object.keys(STUDY_STATISTICAL_PLAN_SOURCE).sort();
  if (Object.keys(source).sort().join("\0") !== expectedKeys.join("\0")) issues.push("statistical plan source fields must be exact");
  for (const [key, value] of Object.entries(STUDY_STATISTICAL_PLAN_SOURCE)) {
    if (source[key] !== value) issues.push(`${key} must match the pinned STAT-101 source`);
  }
  return issues;
}

export function validateTaskSuite(suite) {
  const issues = [];
  if (!object(suite)) return ["task suite must be an object"];
  if (suite.schema_version !== 1) issues.push("schema_version must equal 1");
  if (!exactSet(suite.conditions, CONDITIONS)) issues.push("conditions must be exactly A, B, C and D");
  if (!Array.isArray(suite.tasks) || suite.tasks.length === 0) return [...issues, "tasks must be a non-empty array"];
  const ids = new Set();
  suite.tasks.forEach((task, index) => {
    if (!object(task)) {
      issues.push(`task ${index} must be an object`);
      return;
    }
    if (!/^TASK-[0-9]{3}$/u.test(task.id ?? "") || ids.has(task.id)) issues.push(`task ${index} id must be unique and immutable`);
    else ids.add(task.id);
    if (!fullCommit(task.baseline_commit)) issues.push(`task ${index} baseline_commit must be a full SHA`);
    for (const key of ["difficulty", "rationale", "expected_behavior"]) {
      if (!nonEmpty(task[key])) issues.push(`task ${index} ${key} is required`);
    }
    if (!Array.isArray(task.feature_steps) || task.feature_steps.length === 0 || !task.feature_steps.every(nonEmpty)) issues.push(`task ${index} feature_steps are required`);
    if (!Array.isArray(task.acceptance_commands) || task.acceptance_commands.length === 0 || !task.acceptance_commands.every(nonEmpty)) issues.push(`task ${index} acceptance_commands are required`);
    if (!object(task.treatments) || !exactSet(Object.keys(task.treatments), CONDITIONS)) issues.push(`task ${index} requires four treatments`);
    else {
      for (const condition of CONDITIONS) {
        if (!object(task.treatments[condition]) || !Array.isArray(task.treatments[condition].allowed_tools)) issues.push(`task ${index} treatment ${condition} requires allowed_tools`);
        else if (!exactSet(Object.keys(task.treatments[condition]), ["allowed_tools"]) || !exactSet(task.treatments[condition].allowed_tools, TREATMENT_TOOLS[condition])) issues.push(`task ${index} treatment ${condition} must retain its exact declared tools without shared-task overrides`);
      }
    }
  });
  return issues;
}

export function validateStudyManifest(manifest) {
  const issues = [];
  if (!object(manifest)) return ["study manifest must be an object"];
  if (manifest.schema_version !== 1) issues.push("schema_version must equal 1");
  if (!["proposed", "frozen"].includes(manifest.status)) issues.push("status must be proposed or frozen");
  for (const key of ["protocol_version", "eligibility", "sample_size_rationale", "assignment", "counterbalancing", "task_order", "environment", "stop_rule", "exclusions"]) {
    if (!nonEmpty(manifest[key])) issues.push(`${key} is required`);
  }
  if (!object(manifest.treatment_config) || !exactSet(Object.keys(manifest.treatment_config), CONDITIONS)) issues.push("treatment_config must define A-D");
  if (manifest.status === "frozen") {
    if (!sha(manifest.manifest_sha256)) issues.push("frozen manifest requires manifest_sha256");
    for (const role of ["ethics", "data", "lead"]) {
      const approval = manifest.approvals?.[role];
      if (!object(approval) || approval.actor_type !== "human" || !nonEmpty(approval.reviewer_id) || !nonEmpty(approval.approved_at)) issues.push(`frozen manifest requires human ${role} approval`);
    }
  } else if (manifest.approvals !== null) {
    issues.push("proposed manifest approvals must be null");
  }
  return issues;
}

function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function eventPayloadIssues(event) {
  const payload = event.payload;
  if (!object(payload)) return [`${event.type} payload must be an object`];
  if (event.type === "run_started") {
    return ["environment_sha256", "task_suite_sha256", "study_manifest_sha256"].every((key) => sha(payload[key])) ? [] : ["run_started payload requires environment, task-suite, and study-manifest hashes"];
  }
  if (event.type === "baseline_recorded") {
    return fullCommit(payload.baseline_commit) && sha(payload.tree_sha256) ? [] : ["baseline_recorded payload requires commit and tree hashes"];
  }
  if (event.type === "prompt_recorded") {
    if (event.condition === "A") return ["manual condition A must not record a model prompt"];
    const valid = ["prompt_sha256", "response_sha256", "provider_config_sha256"].every((key) => sha(payload[key])) && object(payload.redaction) && payload.redaction.passed === true && sha(payload.redaction.audit_sha256) && safeRelativePath(payload.prompt_path) && safeRelativePath(payload.output_path);
    return valid ? [] : ["prompt_recorded payload requires redacted, hash-bound prompt, response, and provider configuration artifacts"];
  }
  if (event.type === "task_submitted") {
    const valid = Array.isArray(payload.commit_chain) && payload.commit_chain.length > 0 && payload.commit_chain.every(fullCommit) && Array.isArray(payload.acceptance_commands) && payload.acceptance_commands.length > 0 && payload.acceptance_commands.every(nonEmpty);
    return valid ? [] : ["task_submitted payload requires a non-empty commit chain and acceptance commands"];
  }
  if (event.type === "tests_recorded") {
    const validArrays = Array.isArray(payload.commands) && payload.commands.length > 0 && payload.commands.every(nonEmpty) && Array.isArray(payload.results) && payload.results.length === payload.commands.length;
    const validResults = validArrays && payload.results.every((result, index) => object(result) && result.command === payload.commands[index] && TEST_STATUSES.has(result.status) && nonNegativeInteger(result.exit_code) && ((result.status === "passed" && result.exit_code === 0) || (result.status === "failed" && result.exit_code > 0)) && Number.isFinite(result.duration_ms) && result.duration_ms >= 0);
    const validCounts = ["findings", "approvals", "repairs"].every((key) => nonNegativeInteger(payload[key]));
    return validResults && validCounts ? [] : ["tests_recorded payload requires non-empty commands, matched results, and count fields"];
  }
  if (event.type === "run_finished") {
    const valid = STATUSES.has(payload.status) && Number.isFinite(payload.wall_time_ms) && payload.wall_time_ms >= 0 && Number.isFinite(payload.tokens) && payload.tokens >= 0 && ["findings", "approvals", "repairs"].every((key) => nonNegativeInteger(payload[key])) && Number.isFinite(Date.parse(payload.ended_at)) && Array.isArray(payload.deviations) && payload.deviations.every(nonEmpty);
    return valid ? [] : ["run_finished payload requires status, timing, usage, counts, end time, and deviations"];
  }
  return ["unknown event payload type"];
}

export function validateInstrumentation(events) {
  if (!Array.isArray(events) || events.length === 0) return ["instrumentation events are required"];
  const issues = [];
  const eventIds = new Set();
  const runs = new Map();
  events.forEach((event, index) => {
    if (!object(event)) {
      issues.push(`event ${index} must be an object`);
      return;
    }
    if (!nonEmpty(event.event_id) || eventIds.has(event.event_id)) issues.push(`event ${index} id must be unique`);
    else eventIds.add(event.event_id);
    if (!nonEmpty(event.run_id) || !nonEmpty(event.task_id)) issues.push(`event ${index} requires run_id and task_id`);
    if (!CONDITIONS.includes(event.condition)) issues.push(`event ${index} has invalid condition`);
    if (!EVENT_TYPES.has(event.type)) issues.push(`event ${index} has invalid type`);
    if (!nonEmpty(event.recorded_at) || !Number.isFinite(Date.parse(event.recorded_at)) || !object(event.payload)) issues.push(`event ${index} requires timestamp and payload`);
    if (nonEmpty(event.type)) issues.push(...eventPayloadIssues(event).map((issue) => `event ${index}: ${issue}`));
    if (nonEmpty(event.run_id)) {
      const rows = runs.get(event.run_id) ?? [];
      rows.push(event);
      runs.set(event.run_id, rows);
    }
  });
  for (const [runId, rows] of runs) {
    const condition = rows[0].condition;
    if (rows.some((row) => row.condition !== condition || row.task_id !== rows[0].task_id)) issues.push(`${runId} changes condition or task`);
    const expected = ["run_started", "baseline_recorded", ...(condition === "A" ? [] : ["prompt_recorded"]), "task_submitted", "tests_recorded", "run_finished"];
    const actual = rows.map((row) => row.type);
    for (const type of expected) {
      const count = actual.filter((value) => value === type).length;
      if (count === 0) issues.push(`${runId} is missing ${type}`);
      else if (count > 1) issues.push(`${runId} has duplicate ${type}`);
    }
    if (condition === "A" && actual.includes("prompt_recorded")) issues.push(`${runId} manual condition contains prompt_recorded`);
    if (actual.join("\0") !== expected.join("\0")) issues.push(`${runId} event sequence is invalid`);
    const timestamps = rows.map((row) => Date.parse(row.recorded_at));
    if (timestamps.some((value, index) => index > 0 && value < timestamps[index - 1])) issues.push(`${runId} timestamps are not monotonic`);
    // Only reconcile structurally valid runs; malformed payloads already have specific errors.
    if (actual.join("\0") === expected.join("\0") && rows.every((row) => eventPayloadIssues(row).length === 0)) {
      const submitted = rows.find((row) => row.type === "task_submitted").payload;
      const tested = rows.find((row) => row.type === "tests_recorded");
      const finished = rows.at(-1);
      if (JSON.stringify(submitted.acceptance_commands) !== JSON.stringify(tested.payload.commands)) issues.push(`${runId} test execution does not match submitted acceptance commands`);
      for (const key of ["findings", "approvals", "repairs"]) {
        if (finished.payload[key] !== tested.payload[key]) issues.push(`${runId} final ${key} count does not match the recorded test evidence`);
      }
      if (finished.payload.status === "completed" && tested.payload.results.some((result) => result.status === "failed")) issues.push(`${runId} completed run has failed acceptance tests`);
      if (condition === "A" && finished.payload.tokens !== 0) issues.push(`${runId} manual condition A reports model tokens`);
      const endedAt = Date.parse(finished.payload.ended_at);
      if (endedAt < Date.parse(tested.recorded_at) || endedAt > Date.parse(finished.recorded_at)) issues.push(`${runId} end time falls outside the recorded test-to-finish interval`);
    }
  }
  return issues;
}

// Structural validation remains available for proposed/synthetic envelopes. This
// separate verifier requires bytes from the caller's trusted artifact store.
export async function validateInstrumentationArtifacts(events, readArtifact) {
  const issues = validateInstrumentation(events);
  if (issues.length > 0) return issues;
  if (typeof readArtifact !== "function") return ["artifact verification requires an injected byte reader"];
  // Snapshot before awaiting external I/O so callers cannot change the claims
  // during verification. No failed/inconclusive event is removed or rewritten.
  const snapshot = structuredClone(events);
  const attempts = new Map();
  const owners = new Map();
  for (const event of snapshot) {
    if (!nonEmpty(event.attempt_id)) issues.push(`${event.event_id} requires attempt_id for artifact verification`);
    else if (attempts.has(event.run_id) && attempts.get(event.run_id) !== event.attempt_id) issues.push(`${event.run_id} changes attempt_id`);
    else if (owners.has(event.attempt_id) && owners.get(event.attempt_id) !== event.run_id) issues.push(`${event.attempt_id} is reused by another run`);
    else {
      attempts.set(event.run_id, event.attempt_id);
      owners.set(event.attempt_id, event.run_id);
    }
  }
  if (issues.length > 0) return issues;

  async function readBoundArtifact(path, digest, label) {
    if (!safeRelativePath(path) || !/^[A-Za-z0-9_./-]+$/u.test(path) || path.split("/").includes(".") || !sha(digest)) {
      issues.push(`${label} requires a safe artifact path and SHA-256`);
      return null;
    }
    let bytes;
    try {
      bytes = await readArtifact(path);
    } catch {
      issues.push(`${label} artifact is missing or unreadable`);
      return null;
    }
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
      issues.push(`${label} artifact reader must return non-empty bytes`);
      return null;
    }
    // Copy reader-owned memory before checking or parsing it.
    const captured = Buffer.from(bytes);
    if (sha256(captured) !== digest) {
      issues.push(`${label} artifact SHA-256 mismatch`);
      return null;
    }
    return captured;
  }

  for (const event of snapshot) {
    const { artifact, ...envelope } = event;
    const receipt = await readBoundArtifact(artifact?.path, artifact?.sha256, `${event.event_id} receipt`);
    if (receipt !== null) {
      let recorded;
      try {
        recorded = JSON.parse(receipt.toString("utf8"));
      } catch {
        issues.push(`${event.event_id} receipt must contain JSON`);
      }
      if (!isDeepStrictEqual(recorded, { schema_version: 1, event: envelope })) issues.push(`${event.event_id} receipt does not match the exact event and run/attempt binding`);
    }
    const payload = event.payload;
    let references = [];
    if (event.type === "run_started") references = ["environment", "task_suite", "study_manifest"].map((key) => [payload[`${key}_path`], payload[`${key}_sha256`], key]);
    if (event.type === "baseline_recorded") references = [[payload.tree_path, payload.tree_sha256, "tree"]];
    if (event.type === "prompt_recorded") references = [
      [payload.prompt_path, payload.prompt_sha256, "prompt"],
      [payload.output_path, payload.response_sha256, "response"],
      [payload.provider_config_path, payload.provider_config_sha256, "provider configuration"],
      [payload.redaction.audit_path, payload.redaction.audit_sha256, "redaction audit"],
    ];
    for (const [path, digest, role] of references) await readBoundArtifact(path, digest, `${event.event_id} ${role}`);
  }
  return issues;
}

export function calculateStudyMetrics(rows, statisticalPlanSource) {
  const planIssues = validateStatisticalPlanSource(statisticalPlanSource);
  if (planIssues.length > 0) throw new Error(`statistical plan linkage is invalid: ${planIssues.join("; ")}`);
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("study rows are required");
  const ids = new Set();
  const grouped = new Map();
  for (const row of rows) {
    if (!object(row) || !nonEmpty(row.run_id) || ids.has(row.run_id) || !CONDITIONS.includes(row.condition) || !STATUSES.has(row.status)) throw new Error("invalid or duplicate study row");
    for (const key of ["commits", "violations", "merge_delay_ms", "approvals", "false_blocks", "token_cost_usd", "compute_cost_usd"]) {
      if (!Number.isFinite(row[key]) || row[key] < 0) throw new Error(`invalid study metric ${key}`);
    }
    if (!Number.isSafeInteger(row.commits) || row.commits < 1 || !Number.isSafeInteger(row.violations) || !Number.isSafeInteger(row.approvals) || !Number.isSafeInteger(row.false_blocks)) throw new Error("count metrics must be integers in the safe range");
    if (row.time_to_fix_ms !== null && (!Number.isFinite(row.time_to_fix_ms) || row.time_to_fix_ms < 0)) throw new Error("invalid time_to_fix_ms");
    if (!object(row.repair) || typeof row.repair.attempted !== "boolean" || typeof row.repair.success !== "boolean" || typeof row.repair.regression !== "boolean") throw new Error("repair metrics are required");
    if (!row.repair.attempted && (row.repair.success || row.repair.regression)) throw new Error("repair success or regression requires a recorded attempt");
    ids.add(row.run_id);
    const group = grouped.get(row.condition) ?? [];
    group.push(row);
    grouped.set(row.condition, group);
  }
  const conditions = {};
  for (const condition of [...grouped.keys()].sort()) {
    const group = grouped.get(condition);
    const attempted = group.filter((row) => row.repair.attempted);
    const sum = (key, count = true) => {
      const value = group.reduce((total, row) => total + row[key], 0);
      if (!Number.isFinite(value) || (count && !Number.isSafeInteger(value))) throw new Error(`study metric ${key} aggregate exceeds the numeric range`);
      return value;
    };
    const commits = sum("commits");
    const violations = sum("violations");
    const approvals = sum("approvals");
    const falseBlocks = sum("false_blocks");
    const successes = attempted.filter((row) => row.repair.success).length;
    const regressions = attempted.filter((row) => row.repair.regression).length;
    const completed = group.filter((row) => row.status === "completed").length;
    conditions[condition] = {
      assigned_n: group.length,
      analyzed_n: group.length,
      status_counts: {
        completed,
        failed: group.filter((row) => row.status === "failed").length,
        inconclusive: group.filter((row) => row.status === "inconclusive").length,
      },
      violations_per_commit: ratioRecord(violations, commits),
      approval_interventions_per_run: ratioRecord(approvals, group.length),
      false_block_burden_per_run: ratioRecord(falseBlocks, group.length),
      repair_success_rate: ratioRecord(successes, attempted.length),
      regression_rate: ratioRecord(regressions, attempted.length),
      time_to_fix_ms: distribution(group.filter((row) => row.time_to_fix_ms !== null).map((row) => row.time_to_fix_ms)),
      merge_delay_ms: distribution(group.map((row) => row.merge_delay_ms)),
      total_token_cost_usd: sum("token_cost_usd", false),
      total_compute_cost_usd: sum("compute_cost_usd", false),
      uncertainty: {
        completion_rate: { ...ratioRecord(completed, group.length), interval: wilson(completed, group.length) },
        repair_success_rate: wilson(successes, attempted.length),
        regression_rate: wilson(regressions, attempted.length),
        duration_summary: "median and observed IQR; no population inference before STAT-101 freeze",
      },
    };
  }
  return {
    schema_version: 1,
    analysis_status: "descriptive-preparatory",
    statistical_plan: structuredClone(statisticalPlanSource),
    assigned_n: rows.length,
    analyzed_n: rows.length,
    conditions,
  };
}

export function validateAblationDesign(design) {
  const issues = [];
  if (!object(design)) return ["ablation design must be an object"];
  if (!exactSet(design.conditions, ABLATION_CONDITIONS)) issues.push("ablation conditions must include all five locked sources");
  for (const key of ["truth_sha256", "task_set_sha256", "scoring_sha256", "exclusions_sha256"]) {
    if (!sha(design[key])) issues.push(`${key} must be SHA-256`);
  }
  if (!object(design.configs) || !exactSet(Object.keys(design.configs), ABLATION_CONDITIONS)) issues.push("configs must pin all ablation conditions");
  else {
    for (const condition of ABLATION_CONDITIONS) {
      if (!object(design.configs[condition]) || !nonEmpty(design.configs[condition].version)) issues.push(`${condition} config version is required`);
    }
  }
  if (design.status !== "prepared" || design.human_approval !== null) issues.push("design must remain prepared and unapproved before freeze");
  return issues;
}

export function createNormalizedAnalysis(rows, rawDatasetSha256) {
  if (!Array.isArray(rows) || rows.length === 0 || !sha(rawDatasetSha256)) throw new Error("rows and raw dataset hash are required");
  const ids = new Set();
  const normalized = rows.map((row) => {
    if (!object(row) || !nonEmpty(row.run_id) || ids.has(row.run_id) || !CONDITIONS.includes(row.condition) || !STATUSES.has(row.status)) throw new Error("invalid analysis row");
    ids.add(row.run_id);
    return { run_id: row.run_id, condition: row.condition, status: row.status, outcome: row.outcome ?? null };
  }).sort((a, b) => a.run_id.localeCompare(b.run_id));
  const serialized = `${JSON.stringify(normalized, null, 2)}\n`;
  return {
    schema_version: 1,
    raw_dataset_sha256: rawDatasetSha256,
    rows: normalized,
    normalized_sha256: sha256(serialized),
  };
}
