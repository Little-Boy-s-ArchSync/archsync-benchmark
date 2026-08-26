import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  analyzeInfrastructureSources,
  infrastructureContractVersion,
} from "@archsync/guardian-phase5";

import {
  IAC_ERROR_TAXONOMY,
  IacBenchmarkError,
  assertPhase5Closure,
  calculateIacMetrics,
  closureBlockers,
  runIacReplay,
  sha256,
} from "./lib/iac-benchmark.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const groundTruthPath = resolve(root, "iac/ground-truth.json");
const sourcePath = resolve(root, "iac/guardian-source.json");
const evidencePath = resolve(root, "evidence/iac/phase-5-preparatory.json");

async function packageProvenance() {
  const entry = import.meta.resolve("@archsync/guardian-phase5");
  return JSON.parse(await readFile(new URL("./provenance.json", entry), "utf8"));
}

async function provenanceFiles(paths) {
  const entries = [];
  for (const file of paths) {
    entries.push({ file, sha256: sha256(await readFile(resolve(root, file))) });
  }
  return entries;
}

export async function createEvidence() {
  const groundTruth = JSON.parse(await readFile(groundTruthPath, "utf8"));
  const source = JSON.parse(await readFile(sourcePath, "utf8"));
  const runtime = await packageProvenance();
  const artifactSha256 = createHash("sha256").update(await readFile(resolve(root, source.artifact))).digest("hex");
  const provenanceIssues = [];
  if (source.contract_version !== infrastructureContractVersion) provenanceIssues.push("contract version");
  if (source.source_commit !== groundTruth.benchmark.guardian_source_commit) provenanceIssues.push("ground-truth source commit");
  if (source.source_commit !== runtime.source_commit) provenanceIssues.push("runtime source commit");
  if (source.package_name !== runtime.package_name || source.package_version !== runtime.package_version) provenanceIssues.push("runtime package identity");
  if (source.package_content_sha256 !== runtime.package_content_sha256) provenanceIssues.push("runtime package content");
  if (source.artifact_sha256 !== artifactSha256) provenanceIssues.push("artifact hash");
  if (provenanceIssues.length > 0) {
    throw new IacBenchmarkError("IAC_PROVENANCE_MISMATCH", `Mismatched ${provenanceIssues.join(", ")}`);
  }

  const replay = await runIacReplay(root, groundTruth, analyzeInfrastructureSources);
  const metrics = calculateIacMetrics(replay.first);
  const technicalValid = replay.first.valid
    && replay.identical
    && replay.input_unchanged
    && replay.replay_issues.length === 0
    && metrics.cases.valid === metrics.cases.total
    && metrics.public_exposure.detected === metrics.public_exposure.expected
    && metrics.public_exposure.unexpected === 0;
  const blockers = closureBlockers(
    groundTruth.benchmark.governance,
    source.source_commit,
    groundTruth.benchmark.status,
  );
  const files = await provenanceFiles([
    "iac/ground-truth.json",
    "iac/guardian-source.json",
    "scripts/iac-evidence.mjs",
    "scripts/lib/iac-benchmark.mjs",
    "test/iac-benchmark.test.mjs",
    "package.json",
    "pnpm-lock.yaml",
    source.artifact,
  ]);
  const evidence = {
    schema_version: 1,
    phase: 5,
    status: blockers.length === 0 && technicalValid ? "CLOSED" : "PREPARATORY",
    work_items: ["P5-109", "P5-110"],
    implementation: {
      package_alias: source.package_alias,
      package_name: source.package_name,
      package_version: source.package_version,
      contract_version: source.contract_version,
      source_repository: source.source_repository,
      source_commit: source.source_commit,
      source_pull_request: source.source_pull_request,
      artifact: source.artifact,
      artifact_sha256: artifactSha256,
      package_content_sha256: runtime.package_content_sha256,
    },
    protocol: {
      runs: 2,
      execution: "non-executing Terraform literal parse and Kubernetes document parse",
      provider_or_cluster_access: false,
      corpus_write_allowed: false,
      ground_truth_status: groundTruth.benchmark.status,
    },
    technical_evidence: {
      valid: technicalValid,
      run_hashes: replay.run_hashes,
      deterministic: replay.identical,
      input_unchanged: replay.input_unchanged,
      replay_issues: replay.replay_issues,
      metrics,
    },
    closure: {
      closed: blockers.length === 0 && technicalValid,
      blockers,
      governance: groundTruth.benchmark.governance,
    },
    error_taxonomy: IAC_ERROR_TAXONOMY,
    corpus: {
      id: groundTruth.benchmark.id,
      cases: groundTruth.cases.length,
      distribution: replay.first.distribution,
      files: replay.corpus.files,
      tree_sha256: replay.corpus.tree_sha256,
    },
    results: replay.first.cases,
    provenance: {
      files,
      manifest_sha256: sha256(JSON.stringify(files)),
    },
  };
  assert.equal(evidence.technical_evidence.valid, true, "Preparatory IaC technical evidence is invalid");
  return evidence;
}

export async function main(arguments_) {
  const writeMode = arguments_.includes("--write");
  const requireClosed = arguments_.includes("--require-closed");
  const evidence = await createEvidence();
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  if (writeMode) {
    await mkdir(dirname(evidencePath), { recursive: true });
    await writeFile(evidencePath, serialized, "utf8");
    console.log(`WROTE PREPARATORY PHASE 5 IAC EVIDENCE ${relative(root, evidencePath)}`);
  } else {
    assert.equal(
      await readFile(evidencePath, "utf8"),
      serialized,
      "Phase 5 IaC evidence is stale; inspect the change, then run 'pnpm iac:update'",
    );
    console.log(`VALID PREPARATORY PHASE 5 IAC EVIDENCE (${evidence.corpus.cases}/${evidence.corpus.cases} cases, two identical runs)`);
  }
  if (requireClosed) assertPhase5Closure(evidence);
  else if (!writeMode) console.log(`PHASE 5 GATE REMAINS CLOSED (${evidence.closure.blockers.length} governed blockers)`);
}

const invokedDirectly = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  main(process.argv.slice(2)).catch((error) => {
    const code = error instanceof IacBenchmarkError ? error.code : "IAC_VERIFY_FAILED";
    console.error(`${code}: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
