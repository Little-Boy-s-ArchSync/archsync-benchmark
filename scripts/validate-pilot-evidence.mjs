import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { assertPilotClosure, evaluatePilotClosure, validatePilotReport } from "./lib/pilot-evidence.mjs";

const root = new URL("../", import.meta.url);
const report = JSON.parse(await readFile(new URL("evidence/pilot/report.template.json", root), "utf8"));
assert.deepEqual(validatePilotReport(report), []);
assert.equal(report.status, "pending");
assert.equal(report.template_only, true);
assert.equal(report.operator, null);
assert.deepEqual(report.runs, []);
assert.deepEqual(report.issues, []);
const closure = evaluatePilotClosure(report);
assert.equal(closure.status, "PREPARATORY");
assert.deepEqual(closure.blockers, ["pilot_not_executed"]);
const readme = await readFile(new URL("evidence/pilot/README.md", root), "utf8");
assert.match(readme, /no pilot execution or result/iu);
assert.match(readme, /permanently excluded from the final sample/iu);
if (process.argv.includes("--require-complete")) assertPilotClosure(report);
console.log("VALID PILOT-101 PREPARATION (empty report template; human/provider execution gate preserved)");
