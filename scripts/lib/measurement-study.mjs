import { createHash } from "node:crypto";

const CONDITIONS = ["A", "B", "C", "D"];
const EVENT_TYPES = new Set([
  "run_started",
  "baseline_recorded",
  "prompt_recorded",
  "task_submitted",
  "tests_recorded",
  "run_finished",
]);
const STATUSES = new Set(["completed", "failed", "inconclusive"]);
const ABLATION_CONDITIONS = ["code-only", "code-iac", "code-iac-runtime", "evidence-grounded", "llm-only"];

function object(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function ratio(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

function median(values) {
  if (values.length === 0) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0 ? (ordered[middle - 1] + ordered[middle]) / 2 : ordered[middle];
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactSet(values, expected) {
  return Array.isArray(values) && values.length === expected.length && [...values].sort().join("\0") === [...expected].sort().join("\0");
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
    if (!/^[0-9a-f]{40}$/u.test(task.baseline_commit ?? "")) issues.push(`task ${index} baseline_commit must be a full SHA`);
    for (const key of ["difficulty", "rationale", "expected_behavior"]) {
      if (!nonEmpty(task[key])) issues.push(`task ${index} ${key} is required`);
    }
    if (!Array.isArray(task.feature_steps) || task.feature_steps.length === 0 || !task.feature_steps.every(nonEmpty)) issues.push(`task ${index} feature_steps are required`);
    if (!Array.isArray(task.acceptance_commands) || task.acceptance_commands.length === 0 || !task.acceptance_commands.every(nonEmpty)) issues.push(`task ${index} acceptance_commands are required`);
    if (!object(task.treatments) || !exactSet(Object.keys(task.treatments), CONDITIONS)) issues.push(`task ${index} requires four treatments`);
    else {
      for (const condition of CONDITIONS) {
        if (!object(task.treatments[condition]) || !Array.isArray(task.treatments[condition].allowed_tools)) issues.push(`task ${index} treatment ${condition} requires allowed_tools`);
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
    if (!/^[0-9a-f]{64}$/u.test(manifest.manifest_sha256 ?? "")) issues.push("frozen manifest requires manifest_sha256");
    for (const role of ["ethics", "data", "lead"]) {
      const approval = manifest.approvals?.[role];
      if (!object(approval) || approval.actor_type !== "human" || !nonEmpty(approval.reviewer_id) || !nonEmpty(approval.approved_at)) issues.push(`frozen manifest requires human ${role} approval`);
    }
  } else if (manifest.approvals !== null) {
    issues.push("proposed manifest approvals must be null");
  }
  return issues;
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
    if (!nonEmpty(event.recorded_at) || !object(event.payload)) issues.push(`event ${index} requires timestamp and payload`);
    if (nonEmpty(event.run_id)) {
      const rows = runs.get(event.run_id) ?? [];
      rows.push(event);
      runs.set(event.run_id, rows);
    }
  });
  for (const [runId, rows] of runs) {
    const types = new Set(rows.map((row) => row.type));
    const condition = rows[0].condition;
    if (rows.some((row) => row.condition !== condition || row.task_id !== rows[0].task_id)) issues.push(`${runId} changes condition or task`);
    for (const type of ["run_started", "baseline_recorded", "task_submitted", "tests_recorded", "run_finished"]) {
      if (!types.has(type)) issues.push(`${runId} is missing ${type}`);
    }
    if (condition !== "A" && !types.has("prompt_recorded")) issues.push(`${runId} is missing prompt_recorded`);
    const finished = rows.find((row) => row.type === "run_finished");
    if (!finished || !object(finished.payload) || !STATUSES.has(finished.payload.status) || !Number.isFinite(finished.payload.wall_time_ms) || finished.payload.wall_time_ms < 0 || !Number.isFinite(finished.payload.tokens) || finished.payload.tokens < 0 || !Number.isInteger(finished.payload.findings) || finished.payload.findings < 0 || !Number.isInteger(finished.payload.approvals) || finished.payload.approvals < 0 || !Number.isInteger(finished.payload.repairs) || finished.payload.repairs < 0) {
      issues.push(`${runId} has incomplete final instrumentation`);
    }
  }
  return issues;
}

export function calculateStudyMetrics(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("study rows are required");
  const ids = new Set();
  const grouped = new Map();
  for (const row of rows) {
    if (!object(row) || !nonEmpty(row.run_id) || ids.has(row.run_id) || !CONDITIONS.includes(row.condition) || !STATUSES.has(row.status)) throw new Error("invalid or duplicate study row");
    for (const key of ["commits", "violations", "merge_delay_ms", "approvals", "false_blocks", "token_cost_usd", "compute_cost_usd"]) {
      if (!Number.isFinite(row[key]) || row[key] < 0) throw new Error(`invalid study metric ${key}`);
    }
    if (!Number.isInteger(row.commits) || row.commits < 1 || !Number.isInteger(row.violations) || !Number.isInteger(row.approvals) || !Number.isInteger(row.false_blocks)) throw new Error("count metrics must be integers");
    if (row.time_to_fix_ms !== null && (!Number.isFinite(row.time_to_fix_ms) || row.time_to_fix_ms < 0)) throw new Error("invalid time_to_fix_ms");
    if (!object(row.repair) || typeof row.repair.attempted !== "boolean" || typeof row.repair.success !== "boolean" || typeof row.repair.regression !== "boolean") throw new Error("repair metrics are required");
    ids.add(row.run_id);
    const group = grouped.get(row.condition) ?? [];
    group.push(row);
    grouped.set(row.condition, group);
  }
  const result = {};
  for (const condition of [...grouped.keys()].sort()) {
    const group = grouped.get(condition);
    const attempted = group.filter((row) => row.repair.attempted);
    const commits = group.reduce((sum, row) => sum + row.commits, 0);
    result[condition] = {
      n: group.length,
      completed: group.filter((row) => row.status === "completed").length,
      failed: group.filter((row) => row.status === "failed").length,
      inconclusive: group.filter((row) => row.status === "inconclusive").length,
      violations_per_commit: ratio(group.reduce((sum, row) => sum + row.violations, 0), commits),
      median_time_to_fix_ms: median(group.filter((row) => row.time_to_fix_ms !== null).map((row) => row.time_to_fix_ms)),
      median_merge_delay_ms: median(group.map((row) => row.merge_delay_ms)),
      approval_interventions_per_run: ratio(group.reduce((sum, row) => sum + row.approvals, 0), group.length),
      false_block_burden_per_run: ratio(group.reduce((sum, row) => sum + row.false_blocks, 0), group.length),
      repair_success_rate: ratio(attempted.filter((row) => row.repair.success).length, attempted.length),
      regression_rate: ratio(attempted.filter((row) => row.repair.regression).length, attempted.length),
      total_token_cost_usd: group.reduce((sum, row) => sum + row.token_cost_usd, 0),
      total_compute_cost_usd: group.reduce((sum, row) => sum + row.compute_cost_usd, 0),
    };
  }
  return result;
}

export function validateAblationDesign(design) {
  const issues = [];
  if (!object(design)) return ["ablation design must be an object"];
  if (!exactSet(design.conditions, ABLATION_CONDITIONS)) issues.push("ablation conditions must include all five locked sources");
  for (const key of ["truth_sha256", "task_set_sha256", "scoring_sha256", "exclusions_sha256"]) {
    if (!/^[0-9a-f]{64}$/u.test(design[key] ?? "")) issues.push(`${key} must be SHA-256`);
  }
  if (!object(design.configs) || !exactSet(Object.keys(design.configs), ABLATION_CONDITIONS)) issues.push("configs must pin all ablation conditions");
  else {
    for (const condition of ABLATION_CONDITIONS) {
      if (!nonEmpty(design.configs[condition].version)) issues.push(`${condition} config version is required`);
    }
  }
  if (design.status !== "prepared" || design.human_approval !== null) issues.push("design must remain prepared and unapproved before freeze");
  return issues;
}

export function createNormalizedAnalysis(rows, rawDatasetSha256) {
  if (!Array.isArray(rows) || rows.length === 0 || !/^[0-9a-f]{64}$/u.test(rawDatasetSha256 ?? "")) throw new Error("rows and raw dataset hash are required");
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
