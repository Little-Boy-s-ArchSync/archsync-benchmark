import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

import {
  GUARDIAN_RUN_MANIFEST_SOURCE,
  PHASE4_CLOSURE_GATES,
  PHASE4_PREPARED_ARTIFACTS,
  assertPhase4Closure,
  createPreparedEvidenceManifest,
  evaluatePhase4Closure,
  validateHumanReviewRubric,
  validateRunManifest,
  validateSafetyCorpus,
  verifyPreparedEvidenceManifest,
} from "./lib/ai-evaluation.mjs";

const root = new URL("../", import.meta.url);
const write = process.argv.includes("--write");
const requireClosed = process.argv.includes("--require-closed");

async function json(path) {
  return JSON.parse(await readFile(new URL(path, root), "utf8"));
}

const corpus = await json("ai-safety/corpus.json");
assert.deepEqual(validateSafetyCorpus(corpus), []);
assert.equal(corpus.status, "development-regression-only");
assert.equal(corpus.cases.filter((item) => item.label === "attack").length, 6);
assert.equal(corpus.cases.filter((item) => item.label === "hard-negative").length, 6);

const source = await json("evidence/ai/guardian-run-manifest-source.json");
assert.deepEqual(source, GUARDIAN_RUN_MANIFEST_SOURCE);

const runTemplate = await json("evidence/ai/run-manifest.template.json");
assert.equal(runTemplate.template_only, true);
assert.notDeepEqual(validateRunManifest(runTemplate), []);
assert.equal(Object.hasOwn(runTemplate, "api_key"), false);
assert.equal(Object.hasOwn(runTemplate, "authorization"), false);
assert.equal(Object.hasOwn(runTemplate, "condition"), false);
assert.equal(typeof runTemplate.benchmark, "object");

const rubricTemplate = JSON.parse(await readFile(new URL("evidence/ai/claim-review.template.jsonl", root), "utf8"));
assert.equal(rubricTemplate.template_only, true);
assert.notDeepEqual(validateHumanReviewRubric([rubricTemplate]), []);
for (const dimension of ["correctness", "completeness", "actionability", "citation_quality", "started_at", "finished_at", "duration_ms"]) {
  assert.equal(Object.hasOwn(rubricTemplate, dimension), true);
}

const modelTemplate = await json("evidence/ai/model-config.template.json");
assert.equal(modelTemplate.status, "prepared");
assert.equal(modelTemplate.template_only, true);
assert.equal(modelTemplate.provider, null);
assert.equal(modelTemplate.model, null);
assert.equal(modelTemplate.config_sha256, null);
assert.equal(modelTemplate.security_review, null);
assert.equal(modelTemplate.human_approval, null);

const closureTemplate = await json("evidence/ai/phase-4-closure.template.json");
assert.equal(closureTemplate.status, "preparatory");
assert.equal(closureTemplate.template_only, true);
assert.deepEqual(Object.keys(closureTemplate.gates), PHASE4_CLOSURE_GATES);
assert.ok(Object.values(closureTemplate.gates).every((value) => value === null));

const artifacts = Object.fromEntries(await Promise.all(PHASE4_PREPARED_ARTIFACTS.map(async (path) => [
  path,
  await readFile(new URL(path, root)),
])));
const expected = createPreparedEvidenceManifest({
  status: "prepared",
  protocol_version: "phase4-preparatory-v1",
  source_commit: null,
  human_approval: null,
}, artifacts);
const evidenceUrl = new URL("evidence/ai/phase-4-preparatory.json", root);
if (write) await writeFile(evidenceUrl, `${JSON.stringify(expected, null, 2)}\n`, "utf8");
const recorded = await json("evidence/ai/phase-4-preparatory.json");
assert.equal(verifyPreparedEvidenceManifest(recorded, artifacts), true);
assert.deepEqual(recorded, expected);

const closure = evaluatePhase4Closure(recorded, artifacts, closureTemplate.gates);
assert.equal(closure.status, "PREPARATORY");
assert.equal(closure.closed, false);
assert.deepEqual(closure.blockers, PHASE4_CLOSURE_GATES);
assert.equal(closure.prepared_manifest_sha256, recorded.manifest_sha256);

const safetyReadme = await readFile(new URL("ai-safety/README.md", root), "utf8");
const evidenceReadme = await readFile(new URL("evidence/ai/README.md", root), "utf8");
assert.match(safetyReadme, /not a real-provider result/iu);
assert.match(safetyReadme, /blocked until the P4-127 security checklist/iu);
assert.match(evidenceReadme, /No real-provider output/iu);
assert.match(evidenceReadme, /P4_GATE_INCOMPLETE/u);

if (requireClosed) assertPhase4Closure(recorded, artifacts, closureTemplate.gates);
console.log(`VALID AI EVALUATION PREPARATION (${recorded.files.length} exact artifacts; 12 synthetic safety cases; closure blocked by ${closure.blockers.length} external gates)`);
