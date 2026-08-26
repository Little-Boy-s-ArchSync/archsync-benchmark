import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import {
  assertPublishableAnalysis,
  createPreparatoryAnalysisArtifacts,
  validateAnalysisDataset,
  verifyAnalysisArtifacts,
} from "./lib/analysis-pipeline.mjs";

const root = new URL("../", import.meta.url);
const outputRoot = new URL("analysis/preparatory/", root);
const write = process.argv.includes("--write");
const requirePublishable = process.argv.includes("--require-publishable");
const fixture = JSON.parse(await readFile(new URL("analysis/input.synthetic.json", root), "utf8"));
assert.deepEqual(validateAnalysisDataset(fixture), []);
assert.equal(fixture.status, "synthetic-provisional");
assert.equal(fixture.synthetic, true);
assert.equal(fixture.approval, null);

const artifacts = createPreparatoryAnalysisArtifacts(fixture);
const paths = {
  "results.csv": new URL("results.csv", outputRoot),
  "table.md": new URL("table.md", outputRoot),
  "figure.svg": new URL("figure.svg", outputRoot),
  manifest: new URL("manifest.json", outputRoot),
};
await mkdir(outputRoot, { recursive: true });
for (const [name, url] of Object.entries(paths)) {
  const content = name === "manifest" ? `${JSON.stringify(artifacts.manifest, null, 2)}\n` : artifacts[name];
  if (write) await writeFile(url, content, "utf8");
  else assert.equal(await readFile(url, "utf8"), content, `${url.pathname} is stale; run pnpm analysis:update`);
}
assert.equal(verifyAnalysisArtifacts(fixture, artifacts), true);
assert.match(artifacts["results.csv"], /synthetic-provisional/u);
assert.match(artifacts["table.md"], /NOT RESEARCH RESULTS/u);
assert.match(artifacts["figure.svg"], /SYNTHETIC PREPARATORY DRY RUN/u);
assert.equal(artifacts.manifest.publishable, false);

const template = JSON.parse(await readFile(new URL("analysis/input.template.json", root), "utf8"));
assert.equal(template.template_only, true);
assert.notDeepEqual(validateAnalysisDataset(template), []);
if (requirePublishable) assertPublishableAnalysis(template, template.independent_audit);
console.log(`${write ? "WROTE" : "VALID"} ANALYSIS-101 PREPARATORY PIPELINE (CSV + table + figure + manifest; publishable gate closed)`);
