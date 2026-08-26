import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { ABLATION_CONDITIONS, assertAblationClosure, evaluateAblationClosure, validateAblationEvidence } from "./lib/ablation-evidence.mjs";

const root = new URL("../", import.meta.url);
const evidence = JSON.parse(await readFile(new URL("evidence/ablation/evidence.template.json", root), "utf8"));
assert.deepEqual(validateAblationEvidence(evidence), []);
assert.equal(evidence.status, "pending");
assert.equal(evidence.template_only, true);
assert.deepEqual(evidence.design.conditions, ABLATION_CONDITIONS);
assert.deepEqual(evidence.runs, []);
assert.equal(evidence.results, null);
const closure = evaluateAblationClosure(evidence);
assert.equal(closure.status, "PREPARATORY");
assert.deepEqual(closure.blockers, ["ablation_not_executed"]);
const readme = await readFile(new URL("evidence/ablation/README.md", root), "utf8");
assert.match(readme, /no ablation run or result/iu);
assert.match(readme, /identical STUDY-103 subset/iu);
if (process.argv.includes("--require-complete")) assertAblationClosure(evidence);
console.log("VALID ABL-101 PREPARATION (exact five-condition pending template; no results claimed)");
