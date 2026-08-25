import assert from "node:assert/strict";
import test from "node:test";

import {
  REPRODUCIBILITY_CHECKS,
  assertReproducibilityClosure,
  evaluateReproducibilityClosure,
  validateReproducibilityAudit,
} from "../scripts/lib/reproducibility-audit.mjs";

function pending(overrides = {}) {
  return {
    schema_version: 1,
    status: "pending",
    repository: "https://github.com/Little-Boy-s-ArchSync/archsync-benchmark",
    commit: "a".repeat(40),
    auditor: null,
    environment: null,
    started_at: null,
    finished_at: null,
    checks: Object.fromEntries(REPRODUCIBILITY_CHECKS.map((check) => [check, null])),
    report_sha256: null,
    ...overrides,
  };
}

function reproduced(overrides = {}) {
  return pending({
    status: "reproduced",
    auditor: { actor_type: "human", independent: true, reviewer_id: "unit-fixture-auditor", affiliation: "unit-fixture-lab", conflict_declared: false },
    environment: { os: "fixture-os", node: "v22.0.0", pnpm: "11.16.0" },
    started_at: "2026-08-26T00:00:00Z",
    finished_at: "2026-08-26T00:10:00Z",
    checks: Object.fromEntries(REPRODUCIBILITY_CHECKS.map((check, index) => [check, { status: "passed", evidence_sha256: String(index + 1).repeat(64) }])),
    report_sha256: "f".repeat(64),
    ...overrides,
  });
}

test("REPL-101 pending template contains no fabricated audit", () => {
  assert.deepEqual(validateReproducibilityAudit(pending()), []);
  assert.deepEqual(validateReproducibilityAudit(null), ["reproducibility audit must be an object"]);
  const invalid = pending({ schema_version: 2, status: "unknown", repository: "", commit: "bad", checks: {}, auditor: {}, environment: {}, started_at: "x", finished_at: "y", report_sha256: "bad" });
  const issues = validateReproducibilityAudit(invalid);
  for (const expected of ["schema_version", "status", "repository", "exact"]) assert.ok(issues.some((issue) => issue.includes(expected)), expected);
  assert.ok(validateReproducibilityAudit(pending({ auditor: {}, environment: {}, started_at: "x", finished_at: "y", report_sha256: "bad" })).some((issue) => issue.includes("pending audit")));
});

test("REPL-101 reproduced evidence requires an independent human and every exact hash-bound check", () => {
  assert.deepEqual(validateReproducibilityAudit(reproduced()), []);
  const invalid = reproduced({
    auditor: { actor_type: "provider", independent: false, reviewer_id: "", affiliation: "", conflict_declared: true },
    environment: { os: "", node: "", pnpm: "" },
    started_at: "invalid",
    finished_at: "invalid",
    report_sha256: "bad",
    checks: Object.fromEntries(REPRODUCIBILITY_CHECKS.map((check) => [check, null])),
  });
  const issues = validateReproducibilityAudit(invalid);
  for (const expected of ["independent", "environment", "start", "report_sha256", ...REPRODUCIBILITY_CHECKS]) assert.ok(issues.some((issue) => issue.includes(expected)), expected);
  assert.ok(validateReproducibilityAudit(reproduced({ finished_at: "2026-08-25T00:00:00Z" })).some((issue) => issue.includes("times")));
  const badCheck = reproduced();
  badCheck.checks.full_verify = { status: "failed", evidence_sha256: "bad" };
  assert.ok(validateReproducibilityAudit(badCheck).some((issue) => issue.includes("full_verify")));
});

test("REPL-101 closure stays open without a real independent audit", () => {
  const blocked = evaluateReproducibilityClosure(pending());
  assert.equal(blocked.status, "PREPARATORY");
  assert.equal(blocked.closed, false);
  assert.deepEqual(blocked.blockers, ["independent_audit_not_reproduced"]);
  assert.equal(blocked.audited_commit, "a".repeat(40));
  assert.throws(() => assertReproducibilityClosure(pending()), /REPL_GATE_INCOMPLETE/u);
  const malformed = evaluateReproducibilityClosure(null);
  assert.equal(malformed.audited_commit, null);
  assert.ok(malformed.blockers.includes("audit_validation_1"));
  const closed = assertReproducibilityClosure(reproduced());
  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.closed, true);
  assert.deepEqual(closed.blockers, []);
});
