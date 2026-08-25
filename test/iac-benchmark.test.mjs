import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { analyzeInfrastructureSources } from "@archsync/guardian-phase5";

import {
  IAC_CATEGORIES,
  IAC_ERROR_TAXONOMY,
  IAC_RULE_IDS,
  IacBenchmarkError,
  assertPhase5Closure,
  calculateIacMetrics,
  closureBlockers,
  evaluateIacCase,
  hashIacCorpus,
  loadIacCase,
  normalizeIacAnalysis,
  runIacCorpus,
  runIacReplay,
  sha256,
  validateIacGroundTruth,
} from "../scripts/lib/iac-benchmark.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const groundTruth = JSON.parse(await readFile(join(root, "iac/ground-truth.json"), "utf8"));

function clone(value) {
  return structuredClone(value);
}

function expectInputError(value, pattern) {
  assert.throws(
    () => validateIacGroundTruth(value),
    (error) => error instanceof IacBenchmarkError && error.code === "IAC_INPUT_INVALID" && pattern.test(error.message),
  );
}

function emptyAnalysis() {
  return {
    contract_version: "0.1",
    terraform: { resources: [], references: [], diagnostics: [] },
    kubernetes: { resources: [], references: [], diagnostics: [] },
    identities: { resolutions: [], unknowns: [] },
    graph: { version: "0.1", identity_contract_version: "0.1", nodes: [], edges: [], diagnostics: [] },
    claims: [],
    security_findings: [],
  };
}

function minimalGroundTruth(directory) {
  return {
    schema_version: 1,
    benchmark: {
      status: "preparatory-awaiting-human-freeze",
      contract_version: "0.1",
      guardian_source_commit: "a".repeat(40),
      expected_distribution: {
        baseline: 1,
        "valid-change": 0,
        violation: 0,
        evolution: 0,
        "hard-negative": 0,
      },
      governance: {},
    },
    cases: [{
      id: "iac-case-01",
      title: "fixture",
      category: "baseline",
      directory,
      targets: ["terraform"],
      expected: {
        findings: [],
        diagnostic_codes: [],
        claim_checks: [],
        conflict_counts: { contradiction: 0, "identity-uncertain": 0 },
        identity_checks: [],
        public_exposures: [],
      },
    }],
  };
}

async function tempCorpus(context, configure = async () => {}) {
  const directory = await mkdtemp(join(tmpdir(), "archsync-iac-test-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const caseDirectory = join(directory, "iac/cases/iac-case-01");
  await mkdir(join(caseDirectory, "terraform"), { recursive: true });
  await writeFile(join(caseDirectory, "terraform/main.tf"), 'resource "aws_db_instance" "db" { name = "db" }\n', "utf8");
  await writeFile(join(caseDirectory, "sources.json"), '{"observations":[],"references":[],"alias_rules":[]}\n', "utf8");
  await configure({ directory, caseDirectory });
  return { directory, manifest: minimalGroundTruth("iac/cases/iac-case-01") };
}

test("the complete P5 corpus passes twice against the exact pinned Guardian contract", async () => {
  assert.deepEqual(IAC_CATEGORIES, ["baseline", "valid-change", "violation", "evolution", "hard-negative"]);
  assert.equal(IAC_RULE_IDS.length, 4);
  assert.equal(Object.keys(IAC_ERROR_TAXONOMY).length, 13);
  assert.equal(sha256("archsync").length, 64);
  assert.deepEqual(validateIacGroundTruth(groundTruth), groundTruth.benchmark.expected_distribution);

  const oneInput = await loadIacCase(root, groundTruth.cases[0]);
  assert.equal(Object.keys(oneInput.terraform_files).length, 1);
  assert.equal(oneInput.architecture_observations.length, 2);
  const oneResult = normalizeIacAnalysis(analyzeInfrastructureSources(oneInput));
  assert.equal(evaluateIacCase(groundTruth.cases[0], oneResult).valid, true);

  const replay = await runIacReplay(root, groundTruth, analyzeInfrastructureSources);
  assert.equal(replay.first.valid, true, JSON.stringify(replay.first.cases.flatMap(({ issues }) => issues), null, 2));
  assert.equal(replay.identical, true);
  assert.equal(replay.input_unchanged, true);
  assert.deepEqual(replay.replay_issues, []);
  assert.equal(replay.run_hashes[0], replay.run_hashes[1]);
  assert.equal(replay.corpus.files.length > 40, true);
  const metrics = calculateIacMetrics(replay.first);
  assert.deepEqual(metrics.cases, { total: 20, valid: 20, parseable: 20 });
  assert.deepEqual(metrics.public_exposure, { expected: 4, detected: 4, unexpected: 0 });
  for (const metric of Object.values(metrics.security_rules)) {
    assert.equal(metric.false_positive, 0);
    assert.equal(metric.false_negative, 0);
    assert.equal(metric.precision, 1);
    assert.equal(metric.recall, 1);
    assert.equal(metric.f1, 1);
    assert.equal(metric.specificity, 1);
  }
});

test("ground-truth validation rejects malformed, unsafe, incomplete, and falsely frozen metadata", () => {
  const invalid = [];
  invalid.push([null, /schema version/]);
  invalid.push([{ ...clone(groundTruth), schema_version: 2 }, /schema version/]);
  invalid.push([{ ...clone(groundTruth), benchmark: null }, /metadata/]);
  for (const [field, value, pattern] of [
    ["status", "closed", /must not claim/],
    ["contract_version", "9", /contract version/],
    ["guardian_source_commit", "short", /full SHA/],
    ["expected_distribution", null, /distribution/],
    ["governance", null, /Governance/],
  ]) {
    const candidate = clone(groundTruth);
    candidate.benchmark[field] = value;
    invalid.push([candidate, pattern]);
  }
  const missingCommit = clone(groundTruth);
  delete missingCommit.benchmark.guardian_source_commit;
  invalid.push([missingCommit, /full SHA/]);
  const noCases = clone(groundTruth);
  noCases.cases = [];
  invalid.push([noCases, /requires cases/]);
  const nonObject = clone(groundTruth);
  nonObject.cases[0] = null;
  invalid.push([nonObject, /must be an object/]);
  const badId = clone(groundTruth);
  badId.cases[0].id = "wrong";
  invalid.push([badId, /contiguous/]);
  const badCategory = clone(groundTruth);
  badCategory.cases[0].category = "unknown";
  invalid.push([badCategory, /invalid category/]);
  for (const [path, pattern] of [["", /must be a path/], ["/tmp/x", /portable/], ["bad\\path", /portable/], ["a/../b", /portable/]]) {
    const candidate = clone(groundTruth);
    candidate.cases[0].directory = path;
    invalid.push([candidate, pattern]);
  }
  const duplicateDirectory = clone(groundTruth);
  duplicateDirectory.cases[1].directory = duplicateDirectory.cases[0].directory;
  invalid.push([duplicateDirectory, /duplicate directory/]);
  const noTargets = clone(groundTruth);
  noTargets.cases[0].targets = [];
  invalid.push([noTargets, /targets/]);
  const noExpected = clone(groundTruth);
  noExpected.cases[0].expected = null;
  invalid.push([noExpected, /expected result/]);
  for (const field of ["findings", "diagnostic_codes", "claim_checks", "identity_checks", "public_exposures"]) {
    const candidate = clone(groundTruth);
    candidate.cases[0].expected[field] = null;
    invalid.push([candidate, new RegExp(field)]);
  }
  const noCounts = clone(groundTruth);
  noCounts.cases[0].expected.conflict_counts = null;
  invalid.push([noCounts, /conflict counts/]);
  const badRule = clone(groundTruth);
  badRule.cases[4].expected.findings[0].rule_id = "IAC-NOPE";
  invalid.push([badRule, /unknown security rule/]);
  const noSubject = clone(groundTruth);
  noSubject.cases[4].expected.findings[0].subject = "";
  invalid.push([noSubject, /subject/]);
  const noEvidence = clone(groundTruth);
  noEvidence.cases[4].expected.findings[0].evidence = [];
  invalid.push([noEvidence, /finding evidence/]);
  const unsafeEvidence = clone(groundTruth);
  unsafeEvidence.cases[4].expected.findings[0].evidence[0].file = "../secret";
  invalid.push([unsafeEvidence, /portable/]);
  const badLine = clone(groundTruth);
  badLine.cases[4].expected.findings[0].evidence[0].line = 0;
  invalid.push([badLine, /positive/]);
  const wrongDistribution = clone(groundTruth);
  wrongDistribution.benchmark.expected_distribution.violation = 99;
  invalid.push([wrongDistribution, /distribution mismatch/]);

  for (const [candidate, pattern] of invalid) expectInputError(candidate, pattern);
});

test("case loading rejects invalid compact fixtures and accepts absent source-language directories", async (context) => {
  const fixture = await tempCorpus(context);
  await rm(join(fixture.directory, "iac/cases/iac-case-01/terraform"), { recursive: true });
  await assert.rejects(() => loadIacCase(fixture.directory, fixture.manifest.cases[0]), /at least one/);

  const controls = [
    ['{"observations":{},"references":[],"alias_rules":[]}', /observations/],
    ['{"observations":[],"references":{},"alias_rules":[]}', /references/],
    ['{"observations":[],"references":[],"alias_rules":{}}', /alias_rules/],
    ['{"observations":[],"references":[{}],"alias_rules":[]}', /references are not enabled/],
  ];
  for (const [source, pattern] of controls) {
    await writeFile(join(fixture.directory, "iac/cases/iac-case-01/sources.json"), source, "utf8");
    await assert.rejects(() => loadIacCase(fixture.directory, fixture.manifest.cases[0]), pattern);
  }

  await mkdir(join(fixture.directory, "iac/cases/iac-case-01/kubernetes"), { recursive: true });
  await writeFile(join(fixture.directory, "iac/cases/iac-case-01/kubernetes/main.yml"), "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: ok\n", "utf8");
  await writeFile(join(fixture.directory, "iac/cases/iac-case-01/sources.json"), '{"observations":[],"references":[],"alias_rules":[]}\n', "utf8");
  const kubernetesOnly = await loadIacCase(fixture.directory, fixture.manifest.cases[0]);
  assert.equal(Object.keys(kubernetesOnly.kubernetes_files).length, 1);

  await writeFile(join(fixture.directory, "iac/cases/iac-case-01/terraform"), "not a directory", "utf8");
  await assert.rejects(() => loadIacCase(fixture.directory, fixture.manifest.cases[0]), /ENOTDIR/);
});

test("case loading validates compact observation source locations", async (context) => {
  const fixture = await tempCorpus(context, async ({ caseDirectory }) => {
    await mkdir(join(caseDirectory, "architecture"), { recursive: true });
    await writeFile(join(caseDirectory, "architecture/spec.yaml"), "component: db\n", "utf8");
  });
  const controlPath = join(fixture.directory, "iac/cases/iac-case-01/sources.json");
  const baseObservation = {
    source: "spec", native_id: "db", name: "db", namespace: "architecture", aliases: ["db"],
    kind: "database", exposure: "private", approved: true, trust_boundary: "data", attributes: {},
    evidence: { file: "architecture/spec.yaml", line: 1, snippet: "component: db", detector: "fixture" },
  };
  const writeControl = (observation) => writeFile(controlPath, `${JSON.stringify({ observations: [observation], references: [], alias_rules: [] })}\n`, "utf8");

  await writeControl(baseObservation);
  const loaded = await loadIacCase(fixture.directory, fixture.manifest.cases[0]);
  assert.deepEqual(loaded.architecture_observations[0].evidence[0].range.start, { line: 1, column: 1, offset: 0 });

  await writeFile(join(fixture.directory, "iac/cases/iac-case-01/architecture/spec.yaml"), "header: true\ncomponent: db\n", "utf8");
  await writeControl({ ...baseObservation, evidence: { ...baseObservation.evidence, line: 2 } });
  const secondLine = await loadIacCase(fixture.directory, fixture.manifest.cases[0]);
  assert.deepEqual(secondLine.architecture_observations[0].evidence[0].range.start, { line: 2, column: 1, offset: 13 });

  await writeControl({ ...baseObservation, source: "terraform" });
  await assert.rejects(() => loadIacCase(fixture.directory, fixture.manifest.cases[0]), /spec or code/);
  await writeControl({ ...baseObservation, evidence: null });
  await assert.rejects(() => loadIacCase(fixture.directory, fixture.manifest.cases[0]), /evidence must be an object/);
  await writeControl({ ...baseObservation, evidence: { ...baseObservation.evidence, file: "" } });
  await assert.rejects(() => loadIacCase(fixture.directory, fixture.manifest.cases[0]), /must be a path/);
  await writeControl({ ...baseObservation, evidence: { ...baseObservation.evidence, line: 0 } });
  await assert.rejects(() => loadIacCase(fixture.directory, fixture.manifest.cases[0]), /positive/);
  await writeControl({ ...baseObservation, evidence: { ...baseObservation.evidence, line: 9 } });
  await assert.rejects(() => loadIacCase(fixture.directory, fixture.manifest.cases[0]), /outside/);
  await writeControl({ ...baseObservation, evidence: { ...baseObservation.evidence, snippet: "missing" } });
  await assert.rejects(() => loadIacCase(fixture.directory, fixture.manifest.cases[0]), /does not match/);
});

test("case evaluation emits every mismatch class without hiding parser errors", () => {
  const scenario = clone(groundTruth.cases[4]);
  const actual = {
    findings: [],
    diagnostics: [{ code: "malformed-document", severity: "error", source: "terraform", file: "broken.tf", line: 1 }],
    claims: [{ subject: "other", property: "kind", classification: "contradiction", values: [], missing_sources: [] }],
    identities: [],
  };
  scenario.expected.claim_checks = [{ subject: "missing", property: "kind", classification: "aligned", values: [] }];
  scenario.expected.identity_checks = [{ method: "explicit-alias", canonical_id: "missing", count: 1 }];
  scenario.expected.public_exposures = [{ rule_id: "IAC-PUBLIC-DATABASE", subject: "missing" }];
  const evaluation = evaluateIacCase(scenario, actual);
  assert.equal(evaluation.valid, false);
  assert.deepEqual(new Set(evaluation.issues.map(({ code }) => code)), new Set([
    "IAC_FINDING_MISMATCH",
    "IAC_EVIDENCE_MISMATCH",
    "IAC_DIAGNOSTIC_MISMATCH",
    "IAC_PARSE_ERROR",
    "IAC_CLAIM_MISMATCH",
    "IAC_IDENTITY_MISMATCH",
    "IAC_PUBLIC_EXPOSURE_MISS",
  ]));

  const findingWithoutEvidence = clone(actual);
  findingWithoutEvidence.findings = [{ rule_id: "IAC-PUBLIC-DATABASE", subject: "data/aws-orders-db", edge: "", evidence: [] }];
  assert.equal(evaluateIacCase(groundTruth.cases[4], findingWithoutEvidence).issues.some(({ code }) => code === "IAC_EVIDENCE_MISMATCH"), true);

  const edgeOptionalScenario = clone(groundTruth.cases[4]);
  delete edgeOptionalScenario.expected.findings[0].edge;
  edgeOptionalScenario.expected.findings[0].evidence = [];
  const edgeOptionalActual = { findings: [{ rule_id: "IAC-PUBLIC-DATABASE", subject: "data/aws-orders-db", evidence: [] }], diagnostics: [], claims: [], identities: [] };
  assert.equal(evaluateIacCase(edgeOptionalScenario, edgeOptionalActual).issues.some(({ code }) => code === "IAC_FINDING_MISMATCH"), false);

  const multiple = emptyAnalysis();
  multiple.security_findings = [
    { rule_id: "IAC-UNEXPECTED-INGRESS", subject: "z", edge: "", severity: "high", evidence: [] },
    { rule_id: "IAC-PUBLIC-DATABASE", subject: "a", edge: "", severity: "critical", evidence: [] },
  ];
  multiple.graph.diagnostics = [
    { code: "unsupported-resource", severity: "warning", evidence: { source: "terraform", file: "z.tf", range: { start: { line: 2, column: 1 } } } },
    { code: "missing-reference", severity: "warning", evidence: { source: "kubernetes", file: "a.yaml", range: { start: { line: 1, column: 1 } } } },
  ];
  const normalized = normalizeIacAnalysis(multiple);
  assert.deepEqual(normalized.findings.map(({ rule_id }) => rule_id), ["IAC-PUBLIC-DATABASE", "IAC-UNEXPECTED-INGRESS"]);
  assert.deepEqual(normalized.diagnostics.map(({ code }) => code), ["missing-reference", "unsupported-resource"]);
});

test("corpus runner wraps analyzer failures and metrics count TP, FP, FN, TN, zero denominators, and errors", async (context) => {
  const fixture = await tempCorpus(context);
  await assert.rejects(
    () => runIacCorpus(fixture.directory, fixture.manifest, () => { throw new Error("boom"); }),
    (error) => error.code === "IAC_ANALYZER_FAILURE" && /boom/.test(error.message),
  );
  await assert.rejects(
    () => runIacCorpus(fixture.directory, fixture.manifest, () => { throw "plain"; }),
    (error) => error.code === "IAC_ANALYZER_FAILURE" && /plain/.test(error.message),
  );
  const run = {
    cases: [
      { valid: true, issues: [], expected_finding_keys: ["IAC-PUBLIC-DATABASE|a|"], actual_finding_keys: ["IAC-PUBLIC-DATABASE|a|"], expected_public_exposures: [{ rule_id: "IAC-PUBLIC-DATABASE", subject: "a" }], findings: [{ rule_id: "IAC-PUBLIC-DATABASE", subject: "a" }] },
      { valid: false, issues: [{ code: "X" }], expected_finding_keys: [], actual_finding_keys: ["IAC-PUBLIC-DATABASE|b|"], expected_public_exposures: [], findings: [{ rule_id: "IAC-PUBLIC-DATABASE", subject: "b" }] },
      { valid: false, issues: [{ code: "X" }, { code: "IAC_PARSE_ERROR" }], expected_finding_keys: ["IAC-PUBLIC-DATABASE|c|"], actual_finding_keys: [], expected_public_exposures: [{ rule_id: "IAC-PUBLIC-DATABASE", subject: "c" }], findings: [] },
      { valid: true, issues: [], expected_finding_keys: [], actual_finding_keys: [], expected_public_exposures: [], findings: [{ rule_id: "IAC-TRUST-BOUNDARY", subject: "ignored" }] },
    ],
  };
  const metrics = calculateIacMetrics(run);
  assert.deepEqual(metrics.security_rules["IAC-PUBLIC-DATABASE"], {
    true_positive: 1, false_positive: 1, false_negative: 1, true_negative: 1,
    precision: 0.5, recall: 0.5, f1: 0.5, specificity: 0.5,
  });
  assert.equal(metrics.security_rules["IAC-UNEXPECTED-INGRESS"].precision, 0);
  assert.deepEqual(metrics.public_exposure, { expected: 2, detected: 1, unexpected: 1 });
  assert.deepEqual(metrics.error_counts, { X: 2, IAC_PARSE_ERROR: 1 });
  assert.deepEqual(metrics.cases, { total: 4, valid: 2, parseable: 3 });
});

test("replay detects nondeterminism and corpus mutation", async (context) => {
  const fixture = await tempCorpus(context);
  let calls = 0;
  const nondeterministic = await runIacReplay(fixture.directory, fixture.manifest, () => {
    calls += 1;
    const result = emptyAnalysis();
    if (calls === 1) result.terraform.resources.push({ id: "first-run-only" });
    return result;
  });
  assert.equal(nondeterministic.identical, false);
  assert.equal(nondeterministic.replay_issues[0].code, "IAC_NONDETERMINISTIC");

  const mutable = await tempCorpus(context);
  let mutated = false;
  const changed = await runIacReplay(mutable.directory, mutable.manifest, async () => {
    if (!mutated) {
      mutated = true;
      await writeFile(join(mutable.directory, "iac/cases/iac-case-01/terraform/main.tf"), 'resource "aws_db_instance" "changed" { name = "changed" }\n', "utf8");
    }
    return emptyAnalysis();
  });
  assert.equal(changed.input_unchanged, false);
  assert.equal(changed.replay_issues.some(({ code }) => code === "IAC_INPUT_MUTATION"), true);
  const corpusHash = await hashIacCorpus(mutable.directory);
  assert.equal(corpusHash.tree_sha256.length, 64);
});

test("the Phase 5 closure verifier is explicitly human-gated and commit-bound", () => {
  const commit = "a".repeat(40);
  const pending = { p4_120_approved: false, phase5_adr_accepted: false, security_review_approved: false, ground_truth_frozen: false, approval_records: [] };
  assert.equal(closureBlockers(pending, commit).length, 7);
  assert.equal(closureBlockers({ ...pending, approval_records: null }, commit).length, 7);
  const complete = {
    p4_120_approved: true,
    phase5_adr_accepted: true,
    security_review_approved: true,
    ground_truth_frozen: true,
    approval_records: [
      { role: "phase5-lead", approved_commit: commit, url: "https://example.invalid/lead" },
      { role: "independent-security-reviewer", approved_commit: commit, url: "https://example.invalid/security" },
    ],
  };
  assert.deepEqual(closureBlockers(complete, commit, "frozen"), []);
  const badApproval = clone(complete);
  badApproval.approval_records[0].approved_commit = "b".repeat(40);
  delete badApproval.approval_records[1].url;
  assert.equal(closureBlockers(badApproval, commit, "frozen").length, 2);

  assert.throws(() => assertPhase5Closure({ technical_evidence: { valid: false }, closure: { blockers: [] }, status: "CLOSED" }), /Technical evidence/);
  assert.throws(() => assertPhase5Closure({ technical_evidence: { valid: true }, closure: { blockers: ["human"] }, status: "PREPARATORY" }), /human/);
  assert.throws(() => assertPhase5Closure({ technical_evidence: { valid: true }, closure: { blockers: [] }, status: "PREPARATORY" }), /not CLOSED/);
  assert.equal(assertPhase5Closure({ technical_evidence: { valid: true }, closure: { blockers: [] }, status: "CLOSED" }), true);
});
