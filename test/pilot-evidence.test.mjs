import assert from "node:assert/strict";
import test from "node:test";

import { assertPilotClosure, evaluatePilotClosure, validatePilotReport } from "../scripts/lib/pilot-evidence.mjs";

function pending(overrides = {}) {
  return { schema_version: 1, status: "pending", pilot_id: null, final_sample_excluded: true, final_claims_allowed: false, operator: null, protocol_before_version: null, protocol_after_version: null, runs: [], issues: [], protocol_changes: [], report_sha256: null, ...overrides };
}

function complete(overrides = {}) {
  return pending({
    status: "complete",
    pilot_id: "unit-fixture-pilot",
    operator: { actor_type: "human", operator_id: "unit-fixture-operator" },
    protocol_before_version: "unit-fixture-v1",
    protocol_after_version: "unit-fixture-v2",
    runs: [{ run_id: "unit-fixture-run", outside_final_sample: true, logging_complete: true, instructions_understood: true, annotation_comprehension_checked: true, approval_delay_ms: 10, false_blocks: 1, failure_recovery: { exercised: true, outcome: "passed" }, missing_fields: ["unit fixture missing field"], ambiguities: ["unit fixture ambiguity"] }],
    issues: [
      { issue_id: "fixture-1", run_id: "unit-fixture-run", kind: "missing-field", description: "unit fixture missing field", url: "https://example.invalid/fixture-1", status: "resolved" },
      { issue_id: "fixture-2", run_id: "unit-fixture-run", kind: "ambiguity", description: "unit fixture ambiguity", url: "https://example.invalid/fixture-2", status: "open" },
    ],
    protocol_changes: [{ issue_id: "fixture-1", description: "Unit fixture versioned correction", version: "unit-fixture-v2" }],
    report_sha256: "a".repeat(64),
    ...overrides,
  });
}

test("PILOT-101 pending template contains no invented execution evidence", () => {
  assert.deepEqual(validatePilotReport(pending()), []);
  assert.deepEqual(validatePilotReport(null), ["pilot report must be an object"]);
  const invalid = pending({ schema_version: 2, status: "unknown", final_sample_excluded: false, final_claims_allowed: true });
  const issues = validatePilotReport(invalid);
  for (const expected of ["schema_version", "status", "final sample"]) assert.ok(issues.some((issue) => issue.includes(expected)), expected);
  assert.ok(validatePilotReport(pending({ pilot_id: "fake" })).some((issue) => issue.includes("no execution evidence")));
});

test("PILOT-101 complete reports cover the instrumentation and protocol-fix acceptance criteria", () => {
  assert.deepEqual(validatePilotReport(complete()), []);
  const invalid = complete({ pilot_id: "", operator: null, protocol_before_version: "", protocol_after_version: "", runs: [], issues: null, protocol_changes: null, report_sha256: "bad" });
  const issues = validatePilotReport(invalid);
  for (const expected of ["pilot_id", "human operator", "versions", "at least one sequence", "issues", "protocol_changes", "report_sha256"]) assert.ok(issues.some((issue) => issue.includes(expected)), expected);
  const badRun = complete({ runs: [null, { run_id: "same", outside_final_sample: false, logging_complete: false, instructions_understood: false, annotation_comprehension_checked: false, approval_delay_ms: -1, false_blocks: -1, failure_recovery: null, missing_fields: null, ambiguities: null }, { ...complete().runs[0], run_id: "same", missing_fields: [], ambiguities: [] }] });
  const runIssues = validatePilotReport(badRun);
  for (const expected of ["run 0", "unique", "separation", "approval delay", "failure-recovery", "missing_fields", "ambiguities"]) assert.ok(runIssues.some((issue) => issue.includes(expected)), expected);
  const untracked = complete({ issues: [] });
  assert.ok(validatePilotReport(untracked).some((issue) => issue.includes("lacks a tracked issue")));
  const badIssue = complete({ issues: [null], protocol_changes: [] });
  assert.ok(validatePilotReport(badIssue).some((issue) => issue.includes("issue 0")));
  const sameVersion = complete({ protocol_after_version: "unit-fixture-v1" });
  assert.ok(validatePilotReport(sameVersion).some((issue) => issue.includes("new version")));
  const noFindings = complete({ runs: [{ ...complete().runs[0], missing_fields: [], ambiguities: [] }], issues: [], protocol_changes: [], protocol_before_version: "v1", protocol_after_version: "v1" });
  assert.deepEqual(validatePilotReport(noFindings), []);
});

test("PILOT-101 gate remains closed until a real outside-sample pilot completes", () => {
  const blocked = evaluatePilotClosure(pending());
  assert.equal(blocked.status, "PREPARATORY");
  assert.deepEqual(blocked.blockers, ["pilot_not_executed"]);
  assert.throws(() => assertPilotClosure(pending()), /PILOT_GATE_INCOMPLETE/u);
  assert.ok(evaluatePilotClosure(null).blockers.includes("pilot_validation_1"));
  const closed = assertPilotClosure(complete());
  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.closed, true);
});
