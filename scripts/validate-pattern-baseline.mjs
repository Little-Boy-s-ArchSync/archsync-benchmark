import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const evidenceUrl = new URL("../evidence/typescript-pattern-baseline-v0.1.json", import.meta.url);
const patternsRoot = fileURLToPath(new URL("../typescript-patterns/", import.meta.url));
const evidence = JSON.parse(await readFile(evidenceUrl, "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

async function repositoryFiles(directory) {
  const files = [];
  async function visit(current) {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else files.push(path);
    }
  }
  await visit(directory);
  return files;
}

const manifestSource = await readFile(join(patternsRoot, "signals.json"), "utf8");
const manifest = JSON.parse(manifestSource);
const architecturePath = resolve(patternsRoot, manifest.benchmark.architecture);
const repositoryPath = resolve(patternsRoot, manifest.benchmark.repository);
const treeSource = [];
for (const file of await repositoryFiles(repositoryPath)) {
  treeSource.push(`${relative(repositoryPath, file).replaceAll("\\", "/")}\0${sha256(await readFile(file))}`);
}

assert.equal(evidence.phase, 2);
assert.equal(evidence.release, "v0.1-baseline");
assert.deepEqual(evidence.runtime_artifact, {
  package: "@archsync/guardian",
  source_repository: "https://github.com/Little-Boy-s-ArchSync/archsync-guardian.git",
  source_commit: "e1cd989568568d88849b80254dda73403f3aa910",
  file: "vendor/archsync-guardian-0.1.0-e1cd989.tgz",
  sha256: "2fd7a085e33859d9155a68660aa4a1a33d4c4a1797f9212fafef54f640382f9f",
});
const baselineBytes = await readFile(new URL(`../${evidence.runtime_artifact.file}`, import.meta.url));
assert.equal(sha256(baselineBytes), evidence.runtime_artifact.sha256);
assert.deepEqual(evidence.provenance, {
  manifest_sha256: sha256(manifestSource),
  architecture_sha256: sha256(await readFile(architecturePath, "utf8")),
  repository_tree_sha256: sha256(treeSource.join("\n")),
  result_sha256: sha256(JSON.stringify(evidence.result)),
});
assert.equal(evidence.result.valid, false);
assert.equal(evidence.result.deterministic, true);
assert.deepEqual(evidence.result.metrics.overall, {
  positive_signals: 20,
  negative_signals: 20,
  true_positive: 18,
  false_positive: 4,
  false_negative: 2,
  true_negative: 16,
  precision: 0.818182,
  recall: 0.9,
  f1: 0.857143,
  specificity: 0.8,
});
assert.equal(evidence.result.unexpected_detections.length, 4);
assert.equal(evidence.result.missed_detections.length, 2);

console.log("VALID FROZEN v0.1 PATTERN BASELINE (TP 18, FP 4, FN 2, TN 16; provenance bound)");
