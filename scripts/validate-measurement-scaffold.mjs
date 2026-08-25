import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  STUDY_STATISTICAL_PLAN_SOURCE,
  calculateStudyMetrics,
  validateInstrumentation,
  validateStatisticalPlanSource,
  validateStudyManifest,
  validateTaskSuite,
} from "./lib/measurement-study.mjs";

const root = new URL("../", import.meta.url);
const suite = JSON.parse(await readFile(new URL("measurement-study/task-suite.json", root), "utf8"));
const manifest = JSON.parse(await readFile(new URL("measurement-study/manifest.template.json", root), "utf8"));
const statisticalPlan = JSON.parse(await readFile(new URL("measurement-study/statistical-plan-source.json", root), "utf8"));
assert.deepEqual(validateTaskSuite(suite), []);
assert.deepEqual(validateStudyManifest(manifest), []);
assert.deepEqual(validateStatisticalPlanSource(statisticalPlan), []);
assert.deepEqual(statisticalPlan, STUDY_STATISTICAL_PLAN_SOURCE);
assert.equal(suite.status, "technical-dry-run-only");
assert.equal(manifest.status, "proposed");
assert.equal(manifest.approvals, null);
assert.equal(statisticalPlan.status, "proposed");

function payload(type, condition) {
  if (type === "run_started") return { environment_sha256: "a".repeat(64), task_suite_sha256: "b".repeat(64), study_manifest_sha256: "c".repeat(64) };
  if (type === "baseline_recorded") return { baseline_commit: "d".repeat(40), tree_sha256: "e".repeat(64) };
  if (type === "prompt_recorded") return {
    prompt_sha256: "1".repeat(64),
    response_sha256: "2".repeat(64),
    provider_config_sha256: "3".repeat(64),
    redaction: { passed: true, audit_sha256: "4".repeat(64) },
    prompt_path: `synthetic/${condition}/prompt.json`,
    output_path: `synthetic/${condition}/output.json`,
  };
  if (type === "task_submitted") return { commit_chain: ["5".repeat(40)], acceptance_commands: ["pnpm test"] };
  if (type === "tests_recorded") return {
    commands: ["pnpm test"],
    results: [{ command: "pnpm test", status: "passed", exit_code: 0, duration_ms: 0 }],
    findings: 0,
    approvals: 0,
    repairs: 0,
  };
  return { status: "completed", wall_time_ms: 0, tokens: condition === "A" ? 0 : 1, findings: 0, approvals: 0, repairs: 0, ended_at: "2026-08-26T00:00:06Z", deviations: [] };
}

const events = [];
for (const condition of ["A", "B", "C", "D"]) {
  const types = ["run_started", "baseline_recorded", ...(condition === "A" ? [] : ["prompt_recorded"]), "task_submitted", "tests_recorded", "run_finished"];
  types.forEach((type, index) => events.push({
    event_id: `dry-${condition}-${index}`,
    run_id: `dry-${condition}`,
    task_id: "TASK-001",
    condition,
    type,
    recorded_at: `2026-08-26T00:00:0${index}Z`,
    payload: payload(type, condition),
  }));
}
assert.deepEqual(validateInstrumentation(events), []);

const descriptive = calculateStudyMetrics(["A", "B", "C", "D"].map((condition, index) => ({
  run_id: `synthetic-metric-${condition}`,
  condition,
  status: index === 0 ? "completed" : index === 1 ? "failed" : "inconclusive",
  commits: 1,
  violations: 0,
  time_to_fix_ms: null,
  merge_delay_ms: 0,
  approvals: 0,
  false_blocks: 0,
  token_cost_usd: 0,
  compute_cost_usd: 0,
  repair: { attempted: false, success: false, regression: false },
})), statisticalPlan);
assert.equal(descriptive.analysis_status, "descriptive-preparatory");
assert.equal(descriptive.assigned_n, 4);
assert.equal(descriptive.analyzed_n, 4);

const readme = await readFile(new URL("measurement-study/README.md", root), "utf8");
assert.match(readme, /no participant, agent, pilot, or final-study result/iu);
assert.match(readme, /blocked by EXP-103, STAT-101, PILOT-101, ETH-101 and DATA-101/iu);
assert.match(readme, /Empty placeholder payloads fail/iu);
console.log("VALID MEASUREMENT SCAFFOLD (A-D synthetic non-empty logging dry run; proposed STAT-101 linked; no research execution)");
