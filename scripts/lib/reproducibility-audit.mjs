const REQUIRED_CHECKS = Object.freeze([
  "clean_checkout",
  "frozen_install",
  "full_verify",
  "negative_closure_gates",
  "artifact_hashes",
]);

export const REPRODUCIBILITY_CHECKS = REQUIRED_CHECKS;

function object(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function sha(value) {
  return /^[0-9a-f]{64}$/u.test(value);
}

function commit(value) {
  return /^[0-9a-f]{40}$/u.test(value ?? "");
}

function exactKeys(value, expected) {
  return object(value) && Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}

export function validateReproducibilityAudit(audit) {
  const issues = [];
  if (!object(audit)) return ["reproducibility audit must be an object"];
  if (audit.schema_version !== 1) issues.push("schema_version must equal 1");
  if (!["pending", "reproduced"].includes(audit.status)) issues.push("status must be pending or reproduced");
  if (!nonEmpty(audit.repository) || !commit(audit.commit)) issues.push("repository and full commit are required");
  if (!exactKeys(audit.checks, REQUIRED_CHECKS)) issues.push("checks must contain the exact REPL-101 set");
  if (audit.status === "pending") {
    if (audit.auditor !== null || audit.environment !== null || audit.started_at !== null || audit.finished_at !== null || audit.report_sha256 !== null || !object(audit.checks) || !Object.values(audit.checks).every((value) => value === null)) issues.push("pending audit must contain no auditor or result evidence");
    return issues;
  }
  if (!object(audit.auditor) || audit.auditor.actor_type !== "human" || audit.auditor.independent !== true || !nonEmpty(audit.auditor.reviewer_id) || !nonEmpty(audit.auditor.affiliation) || audit.auditor.conflict_declared !== false) issues.push("reproduced audit requires an independent conflict-free human auditor");
  if (!object(audit.environment) || !nonEmpty(audit.environment.os) || !nonEmpty(audit.environment.node) || !nonEmpty(audit.environment.pnpm)) issues.push("reproduced audit requires OS, Node, and pnpm environment");
  const started = Date.parse(audit.started_at);
  const finished = Date.parse(audit.finished_at);
  if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started) issues.push("reproduced audit requires valid start and finish times");
  if (!sha(audit.report_sha256)) issues.push("reproduced audit requires report_sha256");
  if (object(audit.checks)) {
    for (const check of REQUIRED_CHECKS) {
      const value = audit.checks[check];
      if (!object(value) || value.status !== "passed" || !sha(value.evidence_sha256)) issues.push(`${check} requires passed hash-bound evidence`);
    }
  }
  return issues;
}

export function evaluateReproducibilityClosure(audit) {
  const issues = validateReproducibilityAudit(audit);
  const blockers = issues.map((_, index) => `audit_validation_${index + 1}`);
  if (audit?.status !== "reproduced") blockers.push("independent_audit_not_reproduced");
  return {
    schema_version: 1,
    status: blockers.length === 0 ? "CLOSED" : "PREPARATORY",
    closed: blockers.length === 0,
    blockers,
    audited_commit: commit(audit?.commit) ? audit.commit : null,
  };
}

export function assertReproducibilityClosure(audit) {
  const result = evaluateReproducibilityClosure(audit);
  if (!result.closed) throw new Error(`REPL_GATE_INCOMPLETE: ${result.blockers.join(",")}`);
  return result;
}
