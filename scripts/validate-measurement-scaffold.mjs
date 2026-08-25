import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { validateInstrumentation, validateStudyManifest, validateTaskSuite } from "./lib/measurement-study.mjs";

const root = new URL("../", import.meta.url);
const suite = JSON.parse(await readFile(new URL("measurement-study/task-suite.json", root), "utf8"));
const manifest = JSON.parse(await readFile(new URL("measurement-study/manifest.template.json", root), "utf8"));
assert.deepEqual(validateTaskSuite(suite), []);
assert.deepEqual(validateStudyManifest(manifest), []);
assert.equal(suite.status, "technical-dry-run-only");
assert.equal(manifest.status, "proposed");
assert.equal(manifest.approvals, null);

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
    payload: type === "run_finished" ? { status: "completed", wall_time_ms: 0, tokens: 0, findings: 0, approvals: 0, repairs: 0 } : {},
  }));
}
assert.deepEqual(validateInstrumentation(events), []);

const readme = await readFile(new URL("measurement-study/README.md", root), "utf8");
assert.match(readme, /no participant, agent, pilot, or final-study result/iu);
assert.match(readme, /blocked by EXP-103, STAT-101, PILOT-101, ETH-101 and DATA-101/iu);
console.log("VALID MEASUREMENT SCAFFOLD (A-D synthetic logging dry run; no research execution)");
