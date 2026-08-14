const allowedDeltaKeys = new Set([
  "components_added",
  "components_removed",
  "relationships_added",
  "relationships_removed",
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateGroundTruth(groundTruth) {
  const actual = { "no-impact": 0, violation: 0, evolution: 0 };
  const ids = new Set();
  const patches = new Set();

  if (!isObject(groundTruth) || !isObject(groundTruth.benchmark)) {
    throw new Error("Ground truth must contain benchmark metadata");
  }
  if (!Array.isArray(groundTruth.cases) || groundTruth.cases.length === 0) {
    throw new Error("Ground truth must contain at least one case");
  }
  const expectedDistribution = groundTruth.benchmark.expected_distribution;
  if (!isObject(expectedDistribution) ||
      Object.keys(actual).some((category) => !Number.isInteger(expectedDistribution[category]) || expectedDistribution[category] < 0) ||
      Object.keys(expectedDistribution).some((category) => !(category in actual))) {
    throw new Error("Benchmark metadata must declare a non-negative distribution for every category");
  }
  const declaredTotal = Object.values(expectedDistribution).reduce((sum, count) => sum + count, 0);
  if (declaredTotal !== groundTruth.cases.length) {
    throw new Error("Benchmark metadata distribution total differs from the number of cases");
  }

  for (const scenario of groundTruth.cases) {
    if (!isObject(scenario) || typeof scenario.id !== "string") {
      throw new Error("Every benchmark case must be an object with an id");
    }
    if (ids.has(scenario.id)) throw new Error(`Duplicate case id: ${scenario.id}`);
    ids.add(scenario.id);
    if (!(scenario.category in actual)) throw new Error(`Unknown category: ${scenario.category}`);
    if (scenario.category !== scenario.expected?.classification) {
      throw new Error(`${scenario.id}: category differs from expected classification`);
    }
    if (!scenario.owner || !scenario.patch || !scenario.changed_files?.length) {
      throw new Error(`${scenario.id}: owner, patch and changed_files are required`);
    }
    if (patches.has(scenario.patch)) throw new Error(`Duplicate patch path: ${scenario.patch}`);
    patches.add(scenario.patch);
    if (!Array.isArray(scenario.acceptance_criteria) ||
        scenario.acceptance_criteria.length === 0 ||
        scenario.acceptance_criteria.some((criterion) => typeof criterion !== "string" || !criterion.trim())) {
      throw new Error(`${scenario.id}: acceptance_criteria must contain non-empty strings`);
    }
    if (new Set(scenario.changed_files).size !== scenario.changed_files.length) {
      throw new Error(`${scenario.id}: changed_files must be unique`);
    }
    for (const file of scenario.changed_files) {
      if (typeof file !== "string" || !file || file.includes("\\") || file.startsWith("/") || file.split("/").includes("..")) {
        throw new Error(`${scenario.id}: unsafe changed file path: ${String(file)}`);
      }
    }
    if (!isObject(scenario.delta)) {
      throw new Error(`${scenario.id}: an explicit graph delta object is required`);
    }
    const deltaKeys = Object.keys(scenario.delta);
    if (deltaKeys.some((key) => !allowedDeltaKeys.has(key))) {
      throw new Error(`${scenario.id}: graph delta contains an unsupported key`);
    }
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
    if (scenario.category !== "evolution" && scenario.expected.approval_required) {
      throw new Error(`${scenario.id}: only evolution cases may require approval`);
    }
    if (!Array.isArray(scenario.expected.evidence) || scenario.expected.evidence.length === 0) {
      throw new Error(`${scenario.id}: expected source evidence is required`);
    }
    for (const evidence of scenario.expected.evidence) {
      if (!scenario.changed_files.includes(evidence.file)) {
        throw new Error(`${scenario.id}: evidence file must be listed in changed_files`);
      }
      if (evidence.kind !== "source-location" || !Number.isInteger(evidence.line) || evidence.line < 1) {
        throw new Error(`${scenario.id}: evidence must be a positive source location`);
      }
    }
    actual[scenario.category] += 1;
  }

  const expectedIds = Array.from(
    { length: groundTruth.cases.length },
    (_, index) => `case-${String(index + 1).padStart(2, "0")}`,
  );
  if (JSON.stringify([...ids].sort()) !== JSON.stringify(expectedIds)) {
    throw new Error(`Case ids must be contiguous from case-01 through case-${String(groundTruth.cases.length).padStart(2, "0")}`);
  }
  if (JSON.stringify(actual) !== JSON.stringify(expectedDistribution)) {
    throw new Error(`Unexpected distribution: ${JSON.stringify(actual)}`);
  }
  return actual;
}
