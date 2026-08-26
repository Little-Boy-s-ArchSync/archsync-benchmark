function object(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function sha(value) {
  return /^[0-9a-f]{64}$/u.test(value ?? "");
}

export function validatePilotReport(report) {
  const issues = [];
  if (!object(report)) return ["pilot report must be an object"];
  if (report.schema_version !== 1) issues.push("schema_version must equal 1");
  if (!["pending", "complete"].includes(report.status)) issues.push("status must be pending or complete");
  if (report.final_sample_excluded !== true || report.final_claims_allowed !== false) issues.push("pilot must stay outside the final sample and cannot support final claims");
  if (report.status === "pending") {
    if (report.pilot_id !== null || report.operator !== null || report.protocol_before_version !== null || report.protocol_after_version !== null || !Array.isArray(report.runs) || report.runs.length !== 0 || !Array.isArray(report.issues) || report.issues.length !== 0 || !Array.isArray(report.protocol_changes) || report.protocol_changes.length !== 0 || report.report_sha256 !== null) issues.push("pending pilot template must contain no execution evidence");
    return issues;
  }
  if (!nonEmpty(report.pilot_id)) issues.push("complete pilot requires pilot_id");
  if (!object(report.operator) || report.operator.actor_type !== "human" || !nonEmpty(report.operator.operator_id)) issues.push("complete pilot requires a human operator record");
  if (!nonEmpty(report.protocol_before_version) || !nonEmpty(report.protocol_after_version)) issues.push("complete pilot requires before/after protocol versions");
  if (!Array.isArray(report.runs) || report.runs.length === 0) issues.push("complete pilot requires at least one sequence");
  const runIds = new Set();
  const requiredIssues = [];
  if (Array.isArray(report.runs)) report.runs.forEach((run, index) => {
    if (!object(run)) {
      issues.push(`run ${index} must be an object`);
      return;
    }
    if (!nonEmpty(run.run_id) || runIds.has(run.run_id)) issues.push(`run ${index} requires unique run_id`);
    else runIds.add(run.run_id);
    if (run.outside_final_sample !== true || run.logging_complete !== true || run.instructions_understood !== true || run.annotation_comprehension_checked !== true) issues.push(`run ${index} must confirm separation, logging, instructions, and annotation comprehension`);
    if (!Number.isFinite(run.approval_delay_ms) || run.approval_delay_ms < 0 || !Number.isInteger(run.false_blocks) || run.false_blocks < 0) issues.push(`run ${index} requires approval delay and false-block burden`);
    if (!object(run.failure_recovery) || typeof run.failure_recovery.exercised !== "boolean" || !["passed", "failed", "not-triggered"].includes(run.failure_recovery.outcome)) issues.push(`run ${index} requires failure-recovery evidence`);
    for (const [field, kind] of [["missing_fields", "missing-field"], ["ambiguities", "ambiguity"]]) {
      if (!Array.isArray(run[field]) || !run[field].every(nonEmpty)) issues.push(`run ${index} ${field} must be an array`);
      else run[field].forEach((description) => requiredIssues.push({ run_id: run.run_id, kind, description }));
    }
  });
  if (!Array.isArray(report.issues)) issues.push("pilot issues must be an array");
  else {
    const issueIds = new Set();
    report.issues.forEach((issue, index) => {
      if (!object(issue) || !nonEmpty(issue.issue_id) || issueIds.has(issue.issue_id) || !nonEmpty(issue.run_id) || !["missing-field", "ambiguity"].includes(issue.kind) || !nonEmpty(issue.description) || !/^https:\/\//u.test(issue.url) || !["open", "resolved"].includes(issue.status)) issues.push(`issue ${index} must be unique, linked, and reviewable`);
      else issueIds.add(issue.issue_id);
    });
    for (const required of requiredIssues) {
      if (!report.issues.some((issue) => object(issue) && issue.run_id === required.run_id && issue.kind === required.kind && issue.description === required.description)) issues.push(`${required.run_id} ${required.kind} lacks a tracked issue`);
    }
  }
  if (!Array.isArray(report.protocol_changes) || !report.protocol_changes.every((change) => object(change) && nonEmpty(change.issue_id) && nonEmpty(change.description) && nonEmpty(change.version))) issues.push("protocol_changes must be versioned and issue-linked");
  if ((requiredIssues.length > 0 || report.protocol_changes?.length > 0) && report.protocol_before_version === report.protocol_after_version) issues.push("protocol fixes require a new version before freeze");
  if (!sha(report.report_sha256)) issues.push("complete pilot requires report_sha256");
  return issues;
}

export function evaluatePilotClosure(report) {
  const issues = validatePilotReport(report);
  const blockers = issues.map((_, index) => `pilot_validation_${index + 1}`);
  if (report?.status !== "complete") blockers.push("pilot_not_executed");
  return { schema_version: 1, status: blockers.length === 0 ? "CLOSED" : "PREPARATORY", closed: blockers.length === 0, blockers };
}

export function assertPilotClosure(report) {
  const result = evaluatePilotClosure(report);
  if (!result.closed) throw new Error(`PILOT_GATE_INCOMPLETE: ${result.blockers.join(",")}`);
  return result;
}
