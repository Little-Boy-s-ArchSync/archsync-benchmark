import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadArchitecture } from "@archsync/core";
import { checkRepository, formatGuardianResult } from "@archsync/guardian";

const caseId = process.argv[2] ?? "case-06";
const base = new URL("../order-platform/", import.meta.url);
const groundTruth = JSON.parse(await readFile(new URL("ground-truth.json", base), "utf8"));
const scenario = groundTruth.cases.find(({ id }) => id === caseId);
if (!scenario) {
  throw new Error(`Unknown benchmark case '${caseId}'`);
}
const architectureResult = await loadArchitecture(new URL(groundTruth.benchmark.architecture, base));
if (!architectureResult.valid || !architectureResult.value) {
  throw new Error("Benchmark architecture is invalid");
}

const temporary = await mkdtemp(join(tmpdir(), `archsync-demo-${caseId}-`));
try {
  await cp(new URL(`${groundTruth.benchmark.repository}/`, base), temporary, { recursive: true });
  const applied = spawnSync("git", ["apply", "--whitespace=nowarn", fileURLToPath(new URL(scenario.patch, base))], {
    cwd: temporary,
    encoding: "utf8",
    shell: false,
  });
  if (applied.status !== 0) throw new Error(applied.stderr.trim());
  const result = await checkRepository(architectureResult.value, temporary);
  console.log(`CASE ${scenario.id}: ${scenario.title}`);
  console.log(formatGuardianResult(result));
  if (result.classification !== scenario.expected.classification) {
    throw new Error(`Expected ${scenario.expected.classification}, found ${result.classification}`);
  }
  console.log(`DEMO MATCH ${scenario.id}: ${result.classification}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
