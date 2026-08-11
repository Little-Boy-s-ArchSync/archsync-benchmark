import { readFile } from "node:fs/promises";

import { validateGroundTruth } from "./lib/ground-truth.mjs";

const source = await readFile(
  new URL("../order-platform/ground-truth.json", import.meta.url),
  "utf8",
);
let groundTruth;
try {
  groundTruth = JSON.parse(source);
} catch (error) {
  throw new Error(`Ground truth must be valid JSON: ${error.message}`);
}

const actual = validateGroundTruth(groundTruth);
console.log(
  `VALID GROUND TRUTH (${actual["no-impact"]} no-impact, ${actual.violation} violation, ${actual.evolution} evolution)`,
);
