import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadArchitecture } from "@archsync/core";
import { analyzeTypeScriptRepository } from "@archsync/guardian";

import { validatePatternCorpus } from "./lib/pattern-corpus.mjs";
import { validateVendorArtifacts } from "./validate-vendor-artifacts.mjs";

const root = new URL("..", import.meta.url);
const manifestUrl = new URL("../typescript-patterns/signals.json", import.meta.url);
const baselineMode = process.argv.includes("--write-baseline");
const evidenceUrl = baselineMode
  ? new URL("../evidence/typescript-pattern-baseline-v0.1.json", import.meta.url)
  : new URL("../evidence/typescript-pattern-results.json", import.meta.url);
const writeMode = process.argv.includes("--write");
const validation = await validatePatternCorpus(fileURLToPath(manifestUrl));
assert.equal(validation.valid, true, validation.issues.join("\n"));

const { manifest, baseDirectory } = validation;
const architecturePath = resolve(baseDirectory, manifest.benchmark.architecture);
const repositoryPath = resolve(baseDirectory, manifest.benchmark.repository);
const architectureResult = await loadArchitecture(architecturePath);
assert.equal(architectureResult.valid, true, "Pattern corpus architecture is invalid");
assert.ok(architectureResult.value);

const first = await analyzeTypeScriptRepository(repositoryPath, architectureResult.value);
const second = await analyzeTypeScriptRepository(repositoryPath, architectureResult.value);
const deterministic = JSON.stringify(first) === JSON.stringify(second);

const detectionKey = ({ edge, detector, file, line }) => `${edge}\0${detector}\0${file}\0${line}`;
const locationKey = ({ detector, file, line }) => `${detector}\0${file}\0${line}`;
const expectedPositive = manifest.groups.flatMap((group) =>
  group.positive.map((signal) => ({
    id: signal.id,
    edge: group.edge,
    detector: group.detector,
    file: group.file,
    line: signal.line,
    pattern: signal.pattern,
  })),
);
const expectedNegative = manifest.groups.flatMap((group) =>
  group.negative.map((signal) => ({
    id: signal.id,
    detector: group.detector,
    file: group.file,
    line: signal.line,
    pattern: signal.pattern,
  })),
);
const actual = first.relationships.flatMap((relationship) => {
  const edge = `${relationship.from}|${relationship.type}|${relationship.to}`;
  return relationship.evidence.map((evidence) => ({
    edge,
    detector: evidence.detector,
    file: evidence.file,
    line: evidence.line,
    column: evidence.column,
  }));
});

const expectedKeys = new Set(expectedPositive.map(detectionKey));
const actualKeys = new Set(actual.map(detectionKey));
const actualLocations = new Set(actual.map(locationKey));

function rounded(value) {
  return Number(value.toFixed(6));
}

function metricsFor(detector) {
  const expected = expectedPositive.filter((signal) => !detector || signal.detector === detector);
  const negatives = expectedNegative.filter((signal) => !detector || signal.detector === detector);
  const detected = actual.filter((signal) => !detector || signal.detector === detector);
  const expectedSet = new Set(expected.map(detectionKey));
  const actualSet = new Set(detected.map(detectionKey));
  const truePositive = [...actualSet].filter((key) => expectedSet.has(key)).length;
  const falsePositive = [...actualSet].filter((key) => !expectedSet.has(key)).length;
  const falseNegative = [...expectedSet].filter((key) => !actualSet.has(key)).length;
  const trueNegative = negatives.filter((signal) => !actualLocations.has(locationKey(signal))).length;
  const falsePositiveSignals = negatives.length - trueNegative;
  const precision = truePositive + falsePositive === 0 ? 1 : truePositive / (truePositive + falsePositive);
  const recall = truePositive + falseNegative === 0 ? 1 : truePositive / (truePositive + falseNegative);
  const specificity = trueNegative + falsePositiveSignals === 0
    ? 1
    : trueNegative / (trueNegative + falsePositiveSignals);
  return {
    positive_signals: expected.length,
    negative_signals: negatives.length,
    true_positive: truePositive,
    false_positive: falsePositive,
    false_negative: falseNegative,
    true_negative: trueNegative,
    precision: rounded(precision),
    recall: rounded(recall),
    f1: rounded(precision + recall === 0 ? 0 : 2 * precision * recall / (precision + recall)),
    specificity: rounded(specificity),
  };
}

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

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const treeSource = [];
for (const file of await repositoryFiles(repositoryPath)) {
  treeSource.push(`${relative(repositoryPath, file).replaceAll("\\", "/")}\0${sha256(await readFile(file))}`);
}
const manifestSource = await readFile(manifestUrl, "utf8");
const architectureSource = await readFile(architecturePath, "utf8");
const vendorManifest = await validateVendorArtifacts(root);
const detectorIds = manifest.groups.map(({ detector }) => detector);
const perDetector = Object.fromEntries(detectorIds.map((detector) => [detector, metricsFor(detector)]));
const overall = metricsFor();
const unexpectedDetections = actual.filter((signal) => !expectedKeys.has(detectionKey(signal)));
const missedDetections = expectedPositive.filter((signal) => !actualKeys.has(detectionKey(signal)));
const result = {
  contract_version: "0.1",
  benchmark: manifest.benchmark.id,
  valid: deterministic && overall.false_positive === 0 && overall.false_negative === 0 && overall.specificity === 1,
  analyzer_executions: 2,
  scanned_files: first.metadata.scanned_files,
  deterministic,
  metrics: { overall, by_detector: perDetector },
  unexpected_detections: unexpectedDetections,
  missed_detections: missedDetections,
};
const evidence = {
  phase: 2,
  release: baselineMode ? "v0.1-baseline" : "v0.2",
  purpose: baselineMode
    ? "Frozen v0.1 analyzer result on the later TypeScript detector challenge corpus"
    : "Controlled positive and hard-negative TypeScript detector challenge corpus",
  runtime_artifact: vendorManifest.artifacts.guardian,
  provenance: {
    manifest_sha256: sha256(manifestSource),
    architecture_sha256: sha256(architectureSource),
    repository_tree_sha256: sha256(treeSource.join("\n")),
    result_sha256: sha256(JSON.stringify(result)),
  },
  result,
};
const serialized = `${JSON.stringify(evidence, null, 2)}\n`;

if (baselineMode) {
  assert.equal(result.valid, false, "The frozen v0.1 baseline is expected to expose challenge-corpus defects");
  await writeFile(evidenceUrl, serialized, "utf8");
  console.log(`WROTE TYPESCRIPT PATTERN BASELINE ${fileURLToPath(evidenceUrl)}`);
} else if (writeMode) {
  assert.equal(result.valid, true, JSON.stringify({ unexpectedDetections, missedDetections }, null, 2));
  await writeFile(evidenceUrl, serialized, "utf8");
  console.log(`WROTE TYPESCRIPT PATTERN EVIDENCE ${fileURLToPath(evidenceUrl)}`);
} else {
  assert.equal(result.valid, true, JSON.stringify({ unexpectedDetections, missedDetections }, null, 2));
  assert.equal(
    await readFile(evidenceUrl, "utf8"),
    serialized,
    "TypeScript pattern evidence is stale; run 'pnpm patterns:update' and commit the result",
  );
  console.log(
    `VALID TYPESCRIPT PATTERN EVIDENCE (${overall.true_positive}/${overall.positive_signals} positive, ` +
    `${overall.true_negative}/${overall.negative_signals} hard-negative signals)`,
  );
}
