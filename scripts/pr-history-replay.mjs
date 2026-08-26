import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

import { createPrHistoryPreparation, runPrHistoryReplay, validatePrHistoryManifest } from "./lib/pr-history.mjs";

const root = new URL("../", import.meta.url);
const write = process.argv.includes("--write");
const requireApproved = process.argv.includes("--require-approved-real-system");
const manifest = JSON.parse(await readFile(new URL("pr-history/manifest.synthetic.json", root), "utf8"));
const rows = JSON.parse(await readFile(new URL("pr-history/prs.synthetic.json", root), "utf8"));
const runnerSource = await readFile(new URL("scripts/pr-history-replay.mjs", root), "utf8");
assert.deepEqual(validatePrHistoryManifest(manifest), []);
const replay = await runPrHistoryReplay({ manifest, extract: async () => structuredClone(rows), analyze: async (items) => ({ ids: items.map((item) => item.number), changed_files: items.flatMap((item) => item.changed_files).sort() }) });
assert.equal(replay.status, "SYNTHETIC_REPLAY_COMPLETE");
assert.equal(replay.claims_allowed, false);
const preparation = createPrHistoryPreparation(manifest, rows, runnerSource);
const evidenceUrl = new URL("evidence/pr-history/preparation.json", root);
const serialized = `${JSON.stringify(preparation, null, 2)}\n`;
if (write) await writeFile(evidenceUrl, serialized, "utf8");
else assert.equal(await readFile(evidenceUrl, "utf8"), serialized, "PR-history preparation is stale; run pnpm pr-history:update");
const template = JSON.parse(await readFile(new URL("pr-history/manifest.template.json", root), "utf8"));
assert.notDeepEqual(validatePrHistoryManifest(template), []);
const readme = await readFile(new URL("evidence/pr-history/README.md", root), "utf8");
assert.match(readme, /No real repository/iu);
if (requireApproved) {
  const issues = validatePrHistoryManifest(template);
  throw new Error(`PR_HISTORY_INPUT_INVALID: ${issues.join("; ")}`);
}
console.log(`${write ? "WROTE" : "VALID"} EVAL-112 PR-HISTORY PREPARATION (2 explicit synthetic rows; double replay; no claims)`);
