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
const scenarioAliases = {
  pass: "case-01",
  block: "case-06",
  review: "case-09",
};

function usage() {
  return `ArchSync benchmark demo

Usage:
  pnpm demo
  pnpm demo --scenario pass|block|review|all|case-id
  pnpm demo --scenario all --verbose
  pnpm demo --scenario all --json

The demo applies real Git patches and verifies classification, merge decision,
changed files and the cold MISS -> warm HIT cache transition.`;
}

function parseArguments(argv) {
  const options = { scenario: "all", verbose: false, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--scenario") {
      const value = argv[index + 1];
      if (!value) throw new Error("--scenario requires a value");
      options.scenario = value.toLowerCase();
      index += 1;
    } else if (argument === "--verbose") {
      options.verbose = true;
    } else if (argument === "--json") {
      options.json = true;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown option '${argument}'`);
    }
  }
  return options;
}

function selectScenarios(selection) {
  const ids = selection === "all"
    ? Object.values(scenarioAliases)
    : [scenarioAliases[selection] ?? selection];
  return ids.map((id) => {
    const scenario = manifest.cases.find((candidate) => candidate.id === id);
    if (!scenario) {
      throw new Error(`Unknown scenario '${selection}'. Use pass, block, review, all, or a case ID.`);
    }
    return scenario;
  });
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
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
}

function expectedDecision(category) {
  if (category === "violation") return "BLOCK";
  if (category === "evolution") return "REVIEW";
  return "PASS";
}

function evidenceSummary(result) {
  const evidence = result.introduced_findings
    .flatMap((finding) => finding.source_evidence)
    .find(Boolean);
  if (!evidence) return "No architecture finding; topology is unchanged.";
  return `${evidence.file}:${evidence.line}:${evidence.column}`;
}

async function runScenario(architecture, scenario, verbose) {
  const repository = await mkdtemp(join(tmpdir(), `archsync-demo-${scenario.id}-`));
  try {
    await cp(join(benchmarkRoot, "repository"), repository, { recursive: true });
    git(repository, ["init", "-b", "main"]);
    git(repository, ["config", "user.email", "demo@archsync.invalid"]);
    git(repository, ["config", "user.name", "ArchSync Demo"]);
    git(repository, ["add", "."]);
    git(repository, ["commit", "-m", "controlled baseline"]);
    git(repository, ["apply", join(benchmarkRoot, scenario.patch)]);

    const cold = await checkRepositoryDiff(architecture, repository, { base_ref: "." });
    const warm = await checkRepositoryDiff(architecture, repository, { base_ref: "." });
    const decision = expectedDecision(scenario.category);
    const actualChangedFiles = warm.changed_files.map(({ path }) => path).sort();
    const declaredChangedFiles = [...scenario.changed_files].sort();

    assert.equal(warm.classification, scenario.category, `${scenario.id}: classification mismatch`);
    assert.equal(warm.decision, decision, `${scenario.id}: decision mismatch`);
    assert.deepEqual(actualChangedFiles, declaredChangedFiles, `${scenario.id}: changed-file mismatch`);
    assert.equal(cold.cache.hit, false, `${scenario.id}: first run must miss cache`);
    assert.equal(warm.cache.hit, true, `${scenario.id}: repeat run must hit cache`);

    return {
      id: scenario.id,
      title: scenario.title,
      classification: warm.classification,
      decision: warm.decision,
      changed_files: actualChangedFiles,
      evidence: evidenceSummary(warm),
      cache: { cold: "MISS", warm: "HIT" },
      ...(verbose ? { details: formatPhase3Result(warm) } : {}),
    };
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
}

function printHuman(results, verbose) {
  console.log("ARCHSYNC REAL-PATCH DEMO");
  console.log("Expected architecture vs. TypeScript source from real Git changes\n");
  for (const result of results) {
    console.log(`[${result.decision}] ${result.id} - ${result.title}`);
    console.log(`  Classification: ${result.classification}`);
    console.log(`  Changed files: ${result.changed_files.join(", ")}`);
    console.log(`  Evidence: ${result.evidence}`);
    console.log(`  Cache: ${result.cache.cold} -> ${result.cache.warm}`);
    if (verbose) console.log(`\n${result.details}`);
    console.log("");
  }
  console.log(`DEMO COMPLETE: ${results.length}/${results.length} decisions matched ground truth.`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  const architecture = await loadArchitecture(join(benchmarkRoot, "architecture.yaml"));
  assert.equal(architecture.valid, true, "Benchmark architecture must be valid");
  assert.ok(architecture.value);
  const results = [];
  for (const scenario of selectScenarios(options.scenario)) {
    results.push(await runScenario(architecture.value, scenario, options.verbose));
  }
  if (options.json) {
    console.log(JSON.stringify({ valid: true, results }, null, 2));
  } else {
    printHuman(results, options.verbose);
  }
}

main().catch((error) => {
  console.error(`DEMO FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
