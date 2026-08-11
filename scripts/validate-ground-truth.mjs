import { readFile } from "node:fs/promises";
import { parseDocument } from "yaml";

const source = await readFile(new URL("../order-platform/ground-truth.json", import.meta.url), "utf8");
const parsed = parseDocument(source, { prettyErrors: true, uniqueKeys: true });

if (parsed.errors.length > 0) {
  throw new Error(parsed.errors.map((error) => error.message).join("\n"));
}

const groundTruth = parsed.toJS();
const expected = { "no-impact": 5, violation: 3, evolution: 2 };
const actual = { "no-impact": 0, violation: 0, evolution: 0 };
const ids = new Set();

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

if (!Array.isArray(groundTruth.cases) || groundTruth.cases.length !== 10) {
  throw new Error("Ground truth must contain exactly 10 cases");
}

for (const scenario of groundTruth.cases) {
  if (ids.has(scenario.id)) throw new Error(`Duplicate case id: ${scenario.id}`);
  ids.add(scenario.id);
  if (!(scenario.category in actual)) throw new Error(`Unknown category: ${scenario.category}`);
  if (scenario.category !== scenario.expected?.classification) {
    throw new Error(`${scenario.id}: category differs from expected classification`);
  }
  if (!scenario.owner || !scenario.patch || !scenario.changed_files?.length) {
    throw new Error(`${scenario.id}: owner, patch and changed_files are required`);
  }
  if (!isObject(scenario.delta)) {
    throw new Error(`${scenario.id}: an explicit graph delta object is required`);
  }
  const deltaKeys = Object.keys(scenario.delta);
  if (scenario.category === "no-impact" && deltaKeys.length !== 0) {
    throw new Error(`${scenario.id}: no-impact case must have an empty graph delta`);
  }
  if (scenario.category !== "no-impact" && deltaKeys.length === 0) {
    throw new Error(`${scenario.id}: topology-changing case must declare a graph delta`);
  }
  if (scenario.category === "evolution" && !scenario.expected.approval_required) {
    throw new Error(`${scenario.id}: evolution must require approval`);
  }
  if (scenario.category === "violation" && !scenario.expected.findings?.length) {
    throw new Error(`${scenario.id}: violation must declare expected findings`);
  }
  actual[scenario.category] += 1;
}

if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error(`Unexpected distribution: ${JSON.stringify(actual)}`);
}
if (JSON.stringify(groundTruth.benchmark?.expected_distribution) !== JSON.stringify(expected)) {
  throw new Error("Benchmark metadata distribution differs from the required 5/3/2 split");
}

console.log(`VALID GROUND TRUTH (${actual["no-impact"]} no-impact, ${actual.violation} violation, ${actual.evolution} evolution)`);
