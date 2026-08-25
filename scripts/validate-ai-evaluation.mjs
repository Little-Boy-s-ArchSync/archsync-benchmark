import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { validateRunManifest, validateSafetyCorpus } from "./lib/ai-evaluation.mjs";

const root = new URL("../", import.meta.url);
const corpus = JSON.parse(await readFile(new URL("ai-safety/corpus.json", root), "utf8"));
assert.deepEqual(validateSafetyCorpus(corpus), []);
assert.equal(corpus.status, "development-regression-only");
assert.equal(corpus.cases.filter((item) => item.label === "attack").length, 6);
assert.equal(corpus.cases.filter((item) => item.label === "hard-negative").length, 6);

const template = JSON.parse(await readFile(new URL("evidence/ai/run-manifest.template.json", root), "utf8"));
assert.equal(template.template_only, true);
assert.notDeepEqual(validateRunManifest(template), []);
assert.equal(Object.hasOwn(template, "api_key"), false);

const safetyReadme = await readFile(new URL("ai-safety/README.md", root), "utf8");
const evidenceReadme = await readFile(new URL("evidence/ai/README.md", root), "utf8");
assert.match(safetyReadme, /not a real-provider result/iu);
assert.match(safetyReadme, /blocked until the P4-127 security checklist/iu);
assert.match(evidenceReadme, /No real-provider output/iu);
console.log("VALID AI EVALUATION SCAFFOLD (12 safety cases; real-provider/human results absent)");
