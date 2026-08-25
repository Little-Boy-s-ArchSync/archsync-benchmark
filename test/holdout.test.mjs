import assert from "node:assert/strict";
import test from "node:test";

import {
  HOLDOUT_ERROR_CAUSES,
  calculateHoldoutMetrics,
  classifyHoldoutErrors,
  computeTrackedTreeSha256,
  createFrozenManifest,
  materializeRepositoryPin,
  runFrozenHoldoutTwice,
  summarizeScalabilitySamples,
  validateAdjudications,
  validateHoldoutManifest,
  validateIndependentAnnotations,
  verifyFrozenManifest,
  verifyRepositoryPin,
} from "../scripts/lib/holdout.mjs";

const licenseContent = "MIT License\n";
const treeEntries = [
  { path: "packages/api/index.ts", content: "export {};\n" },
  { path: "LICENSE", content: Buffer.from(licenseContent) },
];

function repository(id = "alpha") {
  return {
    id,
    url: `https://github.com/example/${id}`,
    commit: "a".repeat(40),
    license_spdx: "MIT",
    license_file: "LICENSE",
    license_sha256: "29".repeat(32),
    scope: "packages/api",
    retrieved_at: "2026-08-26T00:00:00Z",
    tree_sha256: computeTrackedTreeSha256(treeEntries),
    environment: { node: "22.0.0", package_manager: "pnpm@11.16.0" },
  };
}

function observation(value = repository()) {
  return {
    url: value.url,
    commit: value.commit,
    scope: value.scope,
    tree_sha256: value.tree_sha256,
    license_file: value.license_file,
    license_sha256: value.license_sha256,
  };
}

function manifest(status = "frozen") {
  return {
    schema_version: 1,
    protocol_version: "d3-v1",
    status,
    tuning_repository_urls: ["https://github.com/example/tuning"],
    repositories: status === "frozen" ? [repository("alpha"), repository("beta")] : [],
    ...(status === "frozen" ? {
      approval: { actor_type: "human", reviewer_id: "synthetic-lead", approved_at: "2026-08-26T00:00:00Z" },
      ground_truth_sha256: "c".repeat(64),
    } : {}),
  };
}

test("holdout manifest accepts proposed and complete synthetic frozen fixtures", () => {
  assert.deepEqual(validateHoldoutManifest(manifest("proposed")), []);
  assert.deepEqual(validateHoldoutManifest(manifest()), []);
  assert.deepEqual(validateHoldoutManifest(null), ["manifest must be an object"]);
});

test("holdout manifest reports provenance, leakage, path, and approval issues", () => {
  const value = manifest();
  value.schema_version = 2;
  value.protocol_version = "";
  value.status = "unknown";
  value.repositories = [null, {
    id: "same",
    url: "http://bad",
    commit: "short",
    license_spdx: "",
    license_file: "/LICENSE",
    license_sha256: "bad",
    scope: "../scope",
    retrieved_at: "",
    tree_sha256: "bad",
    environment: null,
  }, { ...repository("same"), url: "https://github.com/example/tuning" }];
  value.approval = { actor_type: "provider", reviewer_id: "", approved_at: "" };
  value.ground_truth_sha256 = "bad";
  const issues = validateHoldoutManifest(value);
  for (const text of [
    "schema_version", "protocol_version", "status", "repositories[0]", "repositories[1].url", "repositories[1].commit",
    "repositories[1].license", "repositories[1].scope", "repositories[1].retrieved", "repositories[1].tree",
    "repositories[1].environment", "repositories[2].id", "appears in the tuning set",
  ]) assert.ok(issues.some((issue) => issue.includes(text)), text);

  for (const unsafe of ["C:/LICENSE", "dir\\LICENSE", "dir//LICENSE", ""]) {
    const invalid = repository();
    invalid.license_file = unsafe;
    assert.ok(validateHoldoutManifest({ ...manifest("proposed"), repositories: [invalid] }).some((issue) => issue.includes("license_file")));
  }
  const frozen = manifest();
  frozen.repositories = [repository()];
  frozen.approval = null;
  delete frozen.ground_truth_sha256;
  assert.deepEqual(validateHoldoutManifest(frozen), [
    "a frozen holdout requires 2-3 repositories",
    "frozen manifest requires human Lead approval",
    "frozen manifest requires ground_truth_sha256",
  ]);
  assert.ok(validateHoldoutManifest({ ...manifest("proposed"), repositories: null }).includes("repositories must be an array"));
  assert.deepEqual(validateHoldoutManifest({ ...manifest("proposed"), tuning_repository_urls: null }), []);
});

test("tracked tree hashing is path-stable and rejects unsafe or ambiguous entries", () => {
  const forward = computeTrackedTreeSha256(treeEntries);
  assert.equal(computeTrackedTreeSha256([...treeEntries].reverse()), forward);
  assert.throws(() => computeTrackedTreeSha256([]), /required/);
  assert.throws(() => computeTrackedTreeSha256(null), /required/);
  for (const entries of [
    [null],
    [{ path: "../escape", content: "x" }],
    [{ path: "a", content: "x" }, { path: "a", content: "y" }],
    [{ path: "a", content: 7 }],
  ]) assert.throws(() => computeTrackedTreeSha256(entries), /unique safe paths/);
});

test("repository pins bind URL, commit, scope, tree, and license", async () => {
  const expected = repository();
  const observed = observation(expected);
  assert.deepEqual(verifyRepositoryPin(expected, observed), []);
  assert.ok(verifyRepositoryPin({ id: "" }, null).some((issue) => issue.includes("observation")));
  const mismatched = { ...observed, url: "x", commit: "x", scope: "x", tree_sha256: "x", license_file: "x", license_sha256: "x" };
  assert.deepEqual(verifyRepositoryPin(expected, mismatched).length, 5);

  const calls = [];
  const materialized = await materializeRepositoryPin(expected, {
    clone: async (input) => { calls.push(input); return "/synthetic/checkout"; },
    inspect: async (checkout, source) => { assert.equal(checkout, "/synthetic/checkout"); return observation(source); },
  });
  assert.equal(materialized.checkout, "/synthetic/checkout");
  assert.equal(calls[0].commit, expected.commit);
  await assert.rejects(materializeRepositoryPin({ ...expected, commit: "bad" }, {}), /full SHA/);
  await assert.rejects(materializeRepositoryPin(expected, null), /adapters/);
  await assert.rejects(materializeRepositoryPin(expected, { clone: async () => "x", inspect: async () => ({}) }), /does not match/);
});

function annotation(item, reviewer, label) {
  return { item_id: item, reviewer_id: reviewer, label, confidence: 0.8, evidence_file: "a.ts", evidence_line: 1, saw_prediction: false };
}

function decision(item, aLabel, bLabel, finalLabel, overrides = {}) {
  return {
    item_id: item,
    reviewer_a_id: "a",
    reviewer_a_label: aLabel,
    reviewer_b_id: "b",
    reviewer_b_label: bLabel,
    agreement: aLabel === bLabel,
    final_label: finalLabel,
    actor_type: "human",
    adjudicator_id: "synthetic-adjudicator",
    rationale: "Synthetic validator fixture only.",
    decided_at: "2026-08-26T00:00:00Z",
    ...overrides,
  };
}

test("dual annotations and adjudication preserve originals and require human sign-off", () => {
  const rows = [annotation("i1", "a", "violation"), annotation("i1", "b", "unknown"), annotation("i2", "a", "component"), annotation("i2", "b", "component")];
  assert.deepEqual(validateIndependentAnnotations(rows), []);
  assert.deepEqual(validateAdjudications(rows, [decision("i1", "violation", "unknown", "violation"), decision("i2", "component", "component", "component")]), []);
  assert.deepEqual(validateAdjudications(rows, null), ["adjudications must be an array"]);
  assert.deepEqual(validateIndependentAnnotations([]), ["annotations must contain rows"]);
  assert.ok(validateAdjudications([], []).some((issue) => issue.includes("annotations")));

  const invalidAnnotations = [null, annotation("i3", "a", "violation"), annotation("i3", "a", "violation"), {
    item_id: "i4", reviewer_id: "b", label: "bad", confidence: 2, evidence_file: "", evidence_line: 0, saw_prediction: true,
  }];
  const annotationIssues = validateIndependentAnnotations(invalidAnnotations);
  for (const text of ["row 0", "duplicate", "unsupported label", "confidence", "source evidence", "blind", "exactly two"]) {
    assert.ok(annotationIssues.some((issue) => issue.includes(text)), text);
  }

  const invalidDecisions = [
    null,
    decision("missing", "x", "y", "unknown"),
    decision("i1", "wrong", "unknown", "bad", { agreement: true, actor_type: "provider", adjudicator_id: "", rationale: "", decided_at: "" }),
    decision("i2", "component", "component", "violation"),
    decision("i2", "component", "component", "component"),
  ];
  const decisionIssues = validateAdjudications(rows, invalidDecisions);
  for (const text of ["missing or duplicate", "no original", "preserve original", "agreement flag", "supported final", "cannot change", "human sign-off"]) {
    assert.ok(decisionIssues.some((issue) => issue.includes(text)), text);
  }
  assert.ok(validateAdjudications(rows, [decision("i2", "component", "component", "component")]).some((issue) => issue.includes("disagreement requires")));
});

test("freeze record is deterministic and detects mutation", () => {
  const frozen = createFrozenManifest(manifest(), { "truth.json": "truth", "source.tar": Buffer.from("source") });
  assert.equal(frozen.artifacts[0].file, "source.tar");
  assert.match(frozen.freeze_sha256, /^[0-9a-f]{64}$/u);
  assert.equal(verifyFrozenManifest(frozen, { "source.tar": Buffer.from("source"), "truth.json": "truth" }), true);
  assert.equal(verifyFrozenManifest(frozen, { "source.tar": "mutated", "truth.json": "truth" }), false);
  assert.equal(verifyFrozenManifest(null, {}), false);
  assert.equal(verifyFrozenManifest({ ...frozen, manifest: manifest("proposed") }, {}), false);
  assert.throws(() => createFrozenManifest(manifest("proposed"), {}), /status must be frozen/);
  assert.throws(() => createFrozenManifest(manifest(), {}), /at least one/);
});

function frozenInputs() {
  const artifacts = { "truth.json": "truth", "source.tar": "source" };
  const frozen = createFrozenManifest(manifest(), artifacts);
  const observations = Object.fromEntries(frozen.manifest.repositories.map((item) => [item.id, observation(item)]));
  const packages = {
    core: { version: "0.1.1", commit: "d".repeat(40), artifact_sha256: "e".repeat(64) },
    guardian: { version: "0.3.3", commit: "f".repeat(40), artifact_sha256: "1".repeat(64) },
  };
  const environment = { id: "synthetic-env", node: "22.0.0", package_manager: "pnpm@11.16.0" };
  return { artifacts, frozen, observations, packages, environment };
}

test("holdout harness verifies pins, retains failures, and replays exactly twice", async () => {
  const input = frozenInputs();
  const result = await runFrozenHoldoutTwice({
    ...input,
    analyze: async ({ repository: source }) => {
      if (source.id === "beta") throw new TypeError("synthetic failure");
      return { raw: { order: [2, 1] }, normalized: { repository_id: source.id, findings: [] }, duration_ms: 2 };
    },
  });
  assert.equal(result.status, "PREPARATORY_REPLAY_COMPLETE");
  assert.equal(result.deterministic, true);
  assert.equal(result.runs.length, 2);
  assert.equal(result.runs.flatMap((run) => run.repositories).filter((row) => row.status === "failed").length, 2);
  assert.match(result.normalized_replay_sha256, /^[0-9a-f]{64}$/u);

  const noRaw = await runFrozenHoldoutTwice({ ...input, analyze: async ({ repository: source }) => ({ normalized: { id: source.id }, duration_ms: 0 }) });
  assert.equal(noRaw.runs[0].repositories[0].raw, null);
  const nonError = await runFrozenHoldoutTwice({ ...input, analyze: async () => { throw "synthetic"; } });
  assert.equal(nonError.runs[0].repositories[0].normalized.error_class, "NonErrorFailure");
  const invalidOutput = await runFrozenHoldoutTwice({ ...input, analyze: async () => null });
  assert.equal(invalidOutput.runs[0].repositories[0].normalized.error_class, "Error");
});

test("holdout harness fails closed on freeze, configuration, pin, and replay drift", async () => {
  const input = frozenInputs();
  await assert.rejects(runFrozenHoldoutTwice({ ...input, artifacts: {}, analyze: async () => ({}) }), /NOT_FROZEN/);
  for (const changes of [
    { observations: null },
    { packages: null },
    { packages: { ...input.packages, core: { version: "", commit: "bad", artifact_sha256: "bad" } } },
    { packages: { ...input.packages, guardian: { version: "", commit: "bad", artifact_sha256: "bad" } } },
    { environment: null },
    { environment: { id: "", node: "", package_manager: "" } },
    { analyze: null },
  ]) await assert.rejects(runFrozenHoldoutTwice({ ...input, analyze: async () => ({}), ...changes }), /CONFIGURATION_INVALID/);
  await assert.rejects(runFrozenHoldoutTwice({ ...input, observations: { ...input.observations, alpha: {} }, analyze: async () => ({}) }), /PIN_INVALID/);
  const drift = await runFrozenHoldoutTwice({ ...input, analyze: async ({ repository: source, run }) => ({ raw: {}, normalized: { id: source.id, run }, duration_ms: 1 }) });
  assert.equal(drift.status, "BLOCKED_NONDETERMINISTIC");
  assert.equal(drift.normalized_replay_sha256, null);
});

function metricRow(id, repositoryId, unitType, overrides = {}) {
  return {
    id,
    repository_id: repositoryId,
    unit_type: unitType,
    truth_positive: true,
    prediction: "positive",
    truth_label: "violation",
    predicted_label: "violation",
    rule_match: unitType === "rule",
    evidence_required: true,
    evidence_file_exact: true,
    evidence_line_exact: true,
    ...overrides,
  };
}

test("holdout metrics separate node, edge, and rule units per repository with explicit denominators", () => {
  const rows = [
    metricRow("node-tp", "alpha", "node"),
    metricRow("node-fp", "alpha", "node", { truth_positive: false, truth_label: "no-impact", predicted_label: "violation", evidence_required: false, evidence_file_exact: false, evidence_line_exact: false }),
    metricRow("edge-tn", "alpha", "edge", { truth_positive: false, prediction: "negative", truth_label: "no-impact", predicted_label: "no-impact", evidence_required: false }),
    metricRow("edge-fn", "beta", "edge", { prediction: "negative", predicted_label: "no-impact", evidence_file_exact: false, evidence_line_exact: false }),
    metricRow("rule-failed", "beta", "rule", { prediction: "failed", predicted_label: null, rule_match: false, evidence_file_exact: false, evidence_line_exact: false }),
    metricRow("rule-tp", "beta", "rule", { rule_match: true, evidence_line_exact: false }),
  ];
  const metrics = calculateHoldoutMetrics(rows);
  assert.deepEqual(metrics.pooled.units.node.precision, { numerator: 1, denominator: 2, value: 0.5 });
  assert.deepEqual(metrics.pooled.units.edge.recall, { numerator: 0, denominator: 1, value: 0 });
  assert.deepEqual(metrics.pooled.units.rule.f1, { numerator: 2, denominator: 3, value: 2 / 3 });
  assert.deepEqual(metrics.pooled.classification, { numerator: 3, denominator: 6, value: 0.5 });
  assert.deepEqual(metrics.pooled.rule_match, { numerator: 1, denominator: 2, value: 0.5 });
  assert.deepEqual(metrics.pooled.evidence_file, { numerator: 2, denominator: 4, value: 0.5 });
  assert.deepEqual(metrics.pooled.evidence_line, { numerator: 1, denominator: 4, value: 0.25 });
  assert.equal(metrics.by_repository.alpha.n, 3);
  assert.equal(metrics.by_repository.beta.n, 3);
  assert.deepEqual(metrics.by_repository.alpha.units.rule.precision, { numerator: 0, denominator: 0, value: null });
});

test("holdout metrics reject incomplete rows and duplicate IDs", () => {
  assert.throws(() => calculateHoldoutMetrics([]), /required/);
  assert.throws(() => calculateHoldoutMetrics([null]), /unique/);
  assert.throws(() => calculateHoldoutMetrics([metricRow("x", "a", "node"), metricRow("x", "b", "edge")]), /unique/);
  for (const changes of [
    { repository_id: "" }, { unit_type: "bad" }, { truth_positive: "yes" }, { prediction: "bad" }, { truth_label: "" },
    { predicted_label: "" }, { rule_match: null }, { evidence_required: null }, { evidence_file_exact: null }, { evidence_line_exact: null },
  ]) assert.throws(() => calculateHoldoutMetrics([metricRow("x", "a", "node", changes)]), /invalid/);
  assert.doesNotThrow(() => calculateHoldoutMetrics([metricRow("failed", "a", "node", { prediction: "failed", predicted_label: null })]));
});

test("error taxonomy requires every declared causal category plus evidence and action", () => {
  assert.deepEqual(HOLDOUT_ERROR_CAUSES, ["wrapper", "dynamic-endpoint", "alias", "dependency-injection", "monorepo", "generated-code", "unsupported-library", "mapping-ambiguity"]);
  const rows = HOLDOUT_ERROR_CAUSES.map((rootCause, index) => ({
    id: `error-${index}`,
    truth_positive: index % 2 === 0,
    prediction: index % 2 === 0 ? "negative" : "positive",
    root_cause: rootCause,
    evidence: `fixture.ts:${index + 1}`,
    scope: index === 1 ? "out-of-scope" : "in",
    detector_supported: index !== 2,
  }));
  rows.push({ id: "ok", truth_positive: true, prediction: "positive" }, { id: "failed", truth_positive: true, prediction: "failed" });
  const errors = classifyHoldoutErrors(rows);
  assert.equal(errors.length, HOLDOUT_ERROR_CAUSES.length);
  assert.equal(errors[0].action, "fix");
  assert.equal(errors[1].action, "document-out-of-scope");
  assert.equal(errors[2].action, "document-limitation");
  assert.throws(() => classifyHoldoutErrors(null), /array/);
  assert.throws(() => classifyHoldoutErrors([null]), /objects/);
  for (const changes of [{ id: "" }, { evidence: "" }, { root_cause: "other" }]) {
    assert.throws(() => classifyHoldoutErrors([{ ...rows[0], ...changes }]), /requires/);
  }
});

function scalabilitySample(repositoryId, environmentId, mode, overrides = {}) {
  return {
    repository_id: repositoryId,
    environment_id: environmentId,
    mode,
    status: "completed",
    duration_ms: mode === "full" ? 20 : 3,
    cpu_ms: mode === "full" ? 15 : 2,
    peak_memory_bytes: 1024,
    files: 10,
    parsed_files: mode === "full" ? 10 : 2,
    component_count: 4,
    parsed_scope: "packages/api",
    oracle_match: true,
    ...overrides,
  };
}

test("scalability summaries retain resource, scope, failures, and multi-repository evidence", () => {
  const samples = [
    scalabilitySample("alpha", "m1", "full"),
    scalabilitySample("alpha", "m1", "incremental"),
    scalabilitySample("beta", "m2", "full", { status: "failed", duration_ms: null, cpu_ms: null, peak_memory_bytes: null, failure_class: "PARSE_FAILURE", oracle_match: false }),
    scalabilitySample("beta", "m2", "incremental", { duration_ms: 4, cpu_ms: 3, peak_memory_bytes: 2048, parsed_files: 1, oracle_match: false }),
  ];
  const result = summarizeScalabilitySamples(samples);
  assert.deepEqual(result.repositories, ["alpha", "beta"]);
  assert.deepEqual(result.environments, ["m1", "m2"]);
  assert.equal(result.by_mode.full.failed, 1);
  assert.deepEqual(result.by_mode.incremental.duration_ms, { n: 2, p50: 3, p95: 4 });
  assert.deepEqual(result.by_repository.beta.oracle_agreement, { numerator: 0, denominator: 1, value: 0 });
  assert.deepEqual(result.by_repository.beta.failures, [{ repository_id: "beta", mode: "full", failure_class: "PARSE_FAILURE" }]);
  const allFailed = samples.map((sample) => sample.repository_id === "beta" ? { ...sample, status: "failed", duration_ms: null, cpu_ms: null, peak_memory_bytes: null, failure_class: "FAILED" } : sample);
  assert.deepEqual(summarizeScalabilitySamples(allFailed).by_repository.beta.duration_ms, { n: 0, p50: null, p95: null });
});

test("scalability summaries reject malformed or one-case generalization", () => {
  const valid = [
    scalabilitySample("alpha", "m1", "full"), scalabilitySample("alpha", "m1", "incremental"),
    scalabilitySample("beta", "m2", "full"), scalabilitySample("beta", "m2", "incremental"),
  ];
  assert.throws(() => summarizeScalabilitySamples([]), /four/);
  for (const sample of [
    null,
    { ...valid[0], mode: "bad" }, { ...valid[0], repository_id: "" }, { ...valid[0], environment_id: "" }, { ...valid[0], parsed_scope: "" },
    { ...valid[0], files: 0 }, { ...valid[0], parsed_files: -1 }, { ...valid[0], parsed_files: 11 }, { ...valid[0], component_count: 0 },
    { ...valid[0], duration_ms: -1 }, { ...valid[0], cpu_ms: -1 }, { ...valid[0], peak_memory_bytes: -1 },
    { ...valid[0], status: "failed", failure_class: "", duration_ms: null, cpu_ms: null, peak_memory_bytes: null },
  ]) assert.throws(() => summarizeScalabilitySamples([sample, ...valid.slice(1)]), /invalid/);
  assert.throws(() => summarizeScalabilitySamples(valid.map((sample) => ({ ...sample, repository_id: "only" }))), /2-3 repositories/);
  assert.throws(() => summarizeScalabilitySamples(valid.map((sample) => ({ ...sample, environment_id: "one" }))), /two environments/);
  const fourRepos = ["a", "b", "c", "d"].flatMap((id, index) => [scalabilitySample(id, `m${index}`, "full"), scalabilitySample(id, `m${index}`, "incremental")]);
  assert.throws(() => summarizeScalabilitySamples(fourRepos), /2-3 repositories/);
  assert.throws(() => summarizeScalabilitySamples(valid.map((sample) => sample.repository_id === "beta" ? { ...sample, mode: "full" } : sample)), /requires full and incremental/);
});
