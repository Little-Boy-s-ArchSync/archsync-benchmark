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
const totals = report.match(/^(?:#|ℹ)\s+all files\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|/m);
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
  const match = report.match(new RegExp(`^(?:#|ℹ)\\s+${label} (\\d+)$`, "m"));
  assert.ok(match, `Unable to parse test count '${label}'`);
  return Number(match[1]);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

const provenanceFiles = [
  "test/common-module-capability.test.mjs",
  "development/common-module-capability/README.md",
  "development/common-module-capability/verify.mjs",
  "development/common-module-capability/capture.mjs",
  "development/common-module-capability/fixtures.json",
  "development/common-module-capability/guardian-pin.json",
  "development/common-module-capability/dependency-cruiser.json",
  "development/common-module-capability/tools/package-lock.json",
  "development/common-module-capability/receipt/manifest.json",
  "scripts/d3-review/proposed-applicability.mjs",
  "test/d3-proposed-applicability.test.mjs",
  "scripts/d3-review/file-side-preparation.mjs",
  "test/d3-file-side-preparation.test.mjs",
  "holdout/d3-file-side-preparation/README.md",
  "holdout/d3-file-side-preparation/inventory.json",
  "holdout/D3-APPLICABILITY-AI-NOTES-20260928.md",
  "holdout/d3-applicability-proposal-20260928/evidence-ledger.json",
  "holdout/d3-applicability-proposal-20260928/original-checklist.json",
  "holdout/d3-applicability-proposal-20260928/AI-ANALYSIS.md",
  "holdout/d3-applicability-proposal-20260928/validation.json",
  "holdout/d3-applicability-proposal-20260928/README.md",
  "scripts/d3-review/method-packet.mjs",
  "test/d3-method-packet.test.mjs",
  "holdout/D3-METHOD-PACKET.v0.1.0.md",
  "holdout/D3-APPLICABILITY-LEDGER.v0.1.0.md",
  "holdout/D3-HIEU-PREFLIGHT-20260928.md",
  "holdout/D3-MODULE-EDGE-TRUTH-RUBRIC.v0.1.0.md",
  "holdout/D3-RULE-DECISION-20260928.md",
  "scripts/d3-review/contracts.mjs",
  "test/d3-contracts.test.mjs",
  "holdout/contracts/v0.1.0/proposal.json",
  "holdout/contracts/v0.1.0/README.md",
  "scripts/d3-review/review.mjs",
  "scripts/d3-review/cli.mjs",
  "scripts/d3-review/applicability.mjs",
  "test/d3-review.test.mjs",
  "holdout/D3-TWO-AUTHOR-REVIEW.md",
  "holdout/D3-AUTHOR-ANNOTATION-AMENDMENT.md",
  "holdout/D3-CASE-RUBRIC.v0.1.0.md",
  "holdout/D3-CASE-RUBRIC.v0.2.0.md",
  "holdout/D3-ANALYSIS-PLAN.v0.1.0.md",
  "holdout/D3-SCOPE-ACCEPTANCE-20260928.md",
  "holdout/D3-EVALUATION-UNIT-DECISION-20260928.md",
  "holdout/D3-RULE-DECISION-20260928.md",
  "holdout/D3-MODULE-CAPABILITY-AUDIT-20260928.md",
  "holdout/D3-NEXT-EXECUTION-RUNBOOK-20260928.md",
  "scripts/d3-source-review/files.mjs",
  "scripts/d3-source-review/transfer.mjs",
  "scripts/d3-source-review/object-source.mjs",
  "scripts/d3-source-review/cli.mjs",
  "test/d3-portable-review.test.mjs",
  "scripts/lib/ablation-evidence.mjs",
  "scripts/lib/ai-evaluation.mjs",
  "scripts/lib/analysis-notebook.mjs",
  "scripts/lib/analysis-pipeline.mjs",
  "scripts/lib/ground-truth.mjs",
  "scripts/lib/holdout-annotation-source.mjs",
  "scripts/lib/holdout-candidates.mjs",
  "scripts/lib/holdout-repository.mjs",
  "scripts/lib/holdout-repeat-capture.mjs",
  "scripts/lib/holdout.mjs",
  "scripts/lib/iac-benchmark.mjs",
  "scripts/lib/integrity.mjs",
  "scripts/lib/measurement-study.mjs",
  "scripts/lib/pattern-corpus.mjs",
  "scripts/lib/pilot-evidence.mjs",
  "scripts/lib/pr-history.mjs",
  "scripts/lib/reproducibility-audit.mjs",
  "scripts/lib/runtime-provenance.mjs",
  "scripts/lib/study-artifact-store.mjs",
  "scripts/unit-coverage-evidence.mjs",
  "scripts/prepare-d3-sources.mjs",
  "scripts/prepare-d3-change-packets.mjs",
  "scripts/prepare-d3-change-review.mjs",
  "scripts/capture-d3-object-packet.mjs",
  "scripts/collect-d3-history.mjs",
  "scripts/verify-d3-history.mjs",
  "scripts/verify-d3-preparation.mjs",
  "scripts/validate-analysis-notebook.mjs",
  "scripts/validate-holdout-candidates.mjs",
  "scripts/validate-measurement-scaffold.mjs",
  "test/ablation-evidence.test.mjs",
  "test/ai-evaluation.test.mjs",
  "test/analysis-notebook.test.mjs",
  "test/analysis-pipeline.test.mjs",
  "test/ground-truth.test.mjs",
  "test/d3-preparation.test.mjs",
  "test/d3-change-packets.test.mjs",
  "test/d3-object-packet.test.mjs",
  "test/holdout-annotation-source.test.mjs",
  "test/holdout-candidates.test.mjs",
  "test/holdout-repository.test.mjs",
  "test/holdout-repeat-capture.test.mjs",
  "test-support/holdout-git-fixture.mjs",
  "test/holdout.test.mjs",
  "test/iac-benchmark.test.mjs",
  "test/integrity.test.mjs",
  "test/measurement-study.test.mjs",
  "test/pattern-corpus.test.mjs",
  "test/pilot-evidence.test.mjs",
  "test/pr-history.test.mjs",
  "test/reproducibility-audit.test.mjs",
  "test/runtime-provenance.test.mjs",
  "test/study-artifact-store.test.mjs",
  "package.json",
  "pnpm-lock.yaml",
  "vendor/manifest.json",
  "analysis/analysis-101.ipynb",
  "holdout/candidate-inventory.schema.json",
  "holdout/candidates.eval-102.json",
  "holdout/selection-preparation-20260927.json",
  "evidence/holdout/eval-102-candidates.validation.json",
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
