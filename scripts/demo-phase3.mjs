import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadArchitecture } from "@archsync/core";
import { checkRepositoryDiff, formatPhase3Result } from "@archsync/guardian";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const benchmarkRoot = join(root, "order-platform");
const manifest = JSON.parse(await readFile(join(benchmarkRoot, "ground-truth.json"), "utf8"));
const caseId = process.argv[2];
const scenario = manifest.cases.find(({ id }) => id === caseId);

if (!scenario) {
  console.error(`Usage: node scripts/demo-phase3.mjs <case-id>`);
  console.error(`Available cases: ${manifest.cases.map(({ id }) => id).join(", ")}`);
  process.exit(2);
}

function git(repository, args) {
  const result = spawnSync("git", ["-C", repository, ...args], {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: "2026-08-14T00:00:00Z",
      GIT_COMMITTER_DATE: "2026-08-14T00:00:00Z",
    },
  });
  assert.equal(result.status, 0, result.stderr);
}

const architecture = await loadArchitecture(join(benchmarkRoot, "architecture.yaml"));
assert.equal(architecture.valid, true);
assert.ok(architecture.value);
const repository = await mkdtemp(join(tmpdir(), `archsync-phase3-demo-${caseId}-`));

try {
  await cp(join(benchmarkRoot, "repository"), repository, { recursive: true });
  git(repository, ["init", "-b", "main"]);
  git(repository, ["config", "user.email", "phase3-demo@archsync.invalid"]);
  git(repository, ["config", "user.name", "ArchSync Phase 3 Demo"]);
  git(repository, ["add", "."]);
  git(repository, ["commit", "-m", "controlled order-platform baseline"]);
  git(repository, ["apply", join(benchmarkRoot, scenario.patch)]);

  const cold = await checkRepositoryDiff(architecture.value, repository, { base_ref: "." });
  const warm = await checkRepositoryDiff(architecture.value, repository, { base_ref: "." });
  const expectedDecision = scenario.category === "violation"
    ? "BLOCK"
    : scenario.category === "evolution"
      ? "REVIEW"
      : "PASS";
  const changedFilesMatch = JSON.stringify(warm.changed_files.map(({ path }) => path).sort()) ===
    JSON.stringify([...scenario.changed_files].sort());

  console.log(`CASE ${scenario.id}: ${scenario.title}`);
  console.log(formatPhase3Result(warm));
  console.log(`CACHE CHECK: first ${cold.cache.hit ? "HIT" : "MISS"}, repeat ${warm.cache.hit ? "HIT" : "MISS"}`);

  assert.equal(warm.classification, scenario.category);
  assert.equal(warm.decision, expectedDecision);
  assert.equal(changedFilesMatch, true);
  assert.equal(cold.cache.hit, false);
  assert.equal(warm.cache.hit, true);
  console.log(`PHASE 3 DEMO MATCH ${scenario.id}: ${expectedDecision}`);
} finally {
  await rm(repository, { recursive: true, force: true });
}
