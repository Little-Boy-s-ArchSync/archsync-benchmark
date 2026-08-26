import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import { summarizeHoldoutCandidateInventory, validateHoldoutCandidateInventory } from "./lib/holdout-candidates.mjs";

const root = new URL("../", import.meta.url);
const inventoryUrl = new URL("holdout/candidates.eval-102.json", root);
const schemaUrl = new URL("holdout/candidate-inventory.schema.json", root);
const evidenceUrl = new URL("evidence/holdout/eval-102-candidates.validation.json", root);
const inventory = JSON.parse(await readFile(inventoryUrl, "utf8"));
const schemaBytes = await readFile(schemaUrl);
const schema = JSON.parse(schemaBytes);
assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
assert.equal(schema.properties?.task_id?.const, "EVAL-102");
assert.equal(schema.properties?.candidates?.minItems, 10);
assert.equal(schema.properties?.candidates?.maxItems, 10);
const issues = validateHoldoutCandidateInventory(inventory);
assert.deepEqual(issues, [], `EVAL-102 candidate inventory is invalid:\n${issues.join("\n")}`);
const summary = {
  ...summarizeHoldoutCandidateInventory(inventory),
  schema_sha256: createHash("sha256").update(schemaBytes).digest("hex"),
};
const serialized = `${JSON.stringify(summary, null, 2)}\n`;

if (process.argv.includes("--write")) {
  await writeFile(evidenceUrl, serialized, "utf8");
  console.log(`WROTE evidence/holdout/eval-102-candidates.validation.json (${summary.validated_candidates} candidate-only targets)`);
} else {
  assert.equal(await readFile(evidenceUrl, "utf8"), serialized, "EVAL-102 candidate validation evidence is stale; run 'pnpm holdout:candidates:update'");
  console.log(`VALID EVAL-102 CANDIDATE INVENTORY (${summary.validated_candidates}/10; ${summary.inventory_sha256}; selection/freeze false)`);
}
