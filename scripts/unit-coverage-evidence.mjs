import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidencePath = join(root, "evidence", "unit-coverage.json");
const writeMode = process.argv.includes("--write");
const coverageArguments = [
  "--test",
  "--experimental-test-coverage",
  "--test-coverage-include=scripts/lib/*.mjs",
  "--test-coverage-lines=100",
  "--test-coverage-functions=100",
  "--test-coverage-branches=100",
];

const result = spawnSync(process.execPath, coverageArguments, {
  cwd: root,
  encoding: "utf8",
  shell: false,
  windowsHide: true,
});
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
assert.equal(result.status, 0, "Node test coverage gate failed");

const report = result.stdout ?? "";
const totals = report.match(/^# all files\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|/m);
assert.ok(totals, "Unable to parse the Node coverage totals");
const measured = {
  lines_percent: Number(totals[1]),
  branches_percent: Number(totals[2]),
  functions_percent: Number(totals[3]),
};
for (const [metric, value] of Object.entries(measured)) {
  assert.equal(value, 100, `${metric} must be 100%`);
}

function parseTestCount(label) {
  const match = report.match(new RegExp(`^# ${label} (\\d+)$`, "m"));
  assert.ok(match, `Unable to parse test count '${label}'`);
  return Number(match[1]);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

const provenanceFiles = [
  "scripts/lib/ground-truth.mjs",
  "scripts/lib/integrity.mjs",
  "scripts/lib/pattern-corpus.mjs",
  "scripts/unit-coverage-evidence.mjs",
  "test/ground-truth.test.mjs",
  "test/integrity.test.mjs",
  "test/pattern-corpus.test.mjs",
  "package.json",
  "pnpm-lock.yaml",
  "vendor/manifest.json",
];
const provenance = [];
for (const file of provenanceFiles) {
  provenance.push({ file, sha256: sha256(await readFile(join(root, file))) });
}

const evidence = {
  schema_version: 1,
  scope: {
    kind: "deterministic benchmark validation libraries",
    include: "scripts/lib/*.mjs",
    excluded_orchestration: "Top-level evidence/demo processes are exercised by the complete integration gate.",
  },
  command: `node ${coverageArguments.join(" ")}`,
  enforced_thresholds_percent: {
    lines: 100,
    branches: 100,
    functions: 100,
  },
  measured_coverage_percent: measured,
  tests: {
    total: parseTestCount("tests"),
    passed: parseTestCount("pass"),
    failed: parseTestCount("fail"),
  },
  provenance: {
    files: provenance,
    manifest_sha256: sha256(JSON.stringify(provenance)),
  },
};
assert.equal(evidence.tests.total, evidence.tests.passed);
assert.equal(evidence.tests.failed, 0);

const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
if (writeMode) {
  await writeFile(evidencePath, serialized, "utf8");
  console.log(`WROTE ${relative(root, evidencePath)}`);
} else {
  assert.equal(
    await readFile(evidencePath, "utf8"),
    serialized,
    "Unit coverage evidence is stale; run 'pnpm coverage:update' and review the result",
  );
  console.log(`VALID UNIT COVERAGE EVIDENCE ${relative(root, evidencePath)}`);
}
