import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { calculateBenchmarkIntegrity } from "./lib/integrity.mjs";

const orderPlatformUrl = new URL("../order-platform/", import.meta.url);
const orderPlatformDirectory = fileURLToPath(orderPlatformUrl);
const groundTruthUrl = new URL("ground-truth.json", orderPlatformUrl);
const groundTruth = JSON.parse(await readFile(groundTruthUrl, "utf8"));
const actual = await calculateBenchmarkIntegrity(orderPlatformDirectory);

if (process.argv.includes("--write")) {
  groundTruth.benchmark.integrity = actual;
  await writeFile(groundTruthUrl, `${JSON.stringify(groundTruth, null, 2)}\n`, "utf8");
  console.log(`WROTE BENCHMARK INTEGRITY ${groundTruthUrl.pathname}`);
} else {
  assert.deepEqual(
    groundTruth.benchmark.integrity,
    actual,
    "Benchmark integrity mismatch; inspect the fixture change, then run 'pnpm integrity:update'",
  );
  console.log(
    `VALID BENCHMARK INTEGRITY (${actual.baseline_files} baseline files, ${actual.patch_files} patches, sha256)`,
  );
}
