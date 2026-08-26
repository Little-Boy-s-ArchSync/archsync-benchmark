import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { HOLDOUT_ERROR_CAUSES, validateHoldoutManifest } from "./lib/holdout.mjs";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("holdout/manifest.template.json", root), "utf8"));
assert.deepEqual(validateHoldoutManifest(manifest), []);
assert.equal(manifest.status, "proposed");
assert.equal(manifest.repositories.length, 0);
assert.equal(manifest.approval, null);
assert.deepEqual(HOLDOUT_ERROR_CAUSES, [
  "wrapper",
  "dynamic-endpoint",
  "alias",
  "dependency-injection",
  "monorepo",
  "generated-code",
  "unsupported-library",
  "mapping-ambiguity",
]);
const adjudication = await readFile(new URL("holdout/adjudication.template.csv", root), "utf8");
assert.equal(adjudication.split("\n")[0], "item_id,reviewer_a_id,reviewer_a_label,reviewer_b_id,reviewer_b_label,agreement,final_label,actor_type,adjudicator_id,rationale,decided_at");
const protocol = await readFile(new URL("holdout/PROTOCOL.md", root), "utf8");
const handbook = await readFile(new URL("holdout/README.md", root), "utf8");
assert.match(protocol, /blocked by EXP-102 and Lead approval/iu);
assert.match(protocol, /never used to tune ArchSync/iu);
assert.match(protocol, /Failed runs stay in n/iu);
assert.match(handbook, /Do not select final repositories/iu);
assert.match(handbook, /saw_prediction=false/u);
assert.match(handbook, /exactly twice/iu);
assert.match(handbook, /2–3 repositories/iu);
if (process.argv.includes("--require-runnable")) {
  const blockers = [
    ...(manifest.status === "frozen" ? [] : ["manifest_not_frozen"]),
    ...(manifest.repositories.length >= 2 && manifest.repositories.length <= 3 ? [] : ["repository_pins_missing"]),
    ...(manifest.approval?.actor_type === "human" ? [] : ["human_lead_approval_missing"]),
    ...(/^[0-9a-f]{64}$/u.test(manifest.ground_truth_sha256 ?? "") ? [] : ["ground_truth_freeze_missing"]),
    "core_guardian_package_pins_missing",
    "statistical_plan_freeze_missing",
  ];
  throw new Error(`HOLDOUT_GATE_INCOMPLETE: ${blockers.join(",")}`);
}
console.log("VALID HOLDOUT SCAFFOLD (proposed only; inference/freeze human-gated)");
