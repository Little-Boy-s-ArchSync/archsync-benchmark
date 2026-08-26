import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

export const IAC_CATEGORIES = [
  "baseline",
  "valid-change",
  "violation",
  "evolution",
  "hard-negative",
];

export const IAC_RULE_IDS = [
  "IAC-PUBLIC-DATABASE",
  "IAC-TRUST-BOUNDARY",
  "IAC-UNAPPROVED-DATA-SERVICE",
  "IAC-UNEXPECTED-INGRESS",
];

export const IAC_ERROR_TAXONOMY = {
  IAC_INPUT_INVALID: "Corpus metadata or a fixture input violates the benchmark contract.",
  IAC_PARSE_ERROR: "Guardian reported an error-level Terraform or Kubernetes diagnostic.",
  IAC_FINDING_MISMATCH: "The exact security finding key set differs from ground truth.",
  IAC_EVIDENCE_MISMATCH: "A required finding source, file, or line is absent.",
  IAC_DIAGNOSTIC_MISMATCH: "The exact parser diagnostic-code multiset differs from ground truth.",
  IAC_CLAIM_MISMATCH: "A required cross-source claim or conflict count differs from ground truth.",
  IAC_IDENTITY_MISMATCH: "A required identity-resolution outcome differs from ground truth.",
  IAC_PUBLIC_EXPOSURE_MISS: "A labeled public-exposure event was not detected exactly.",
  IAC_ANALYZER_FAILURE: "The pinned analyzer threw instead of returning a bounded result.",
  IAC_NONDETERMINISTIC: "Two complete corpus runs produced different normalized output hashes.",
  IAC_INPUT_MUTATION: "An input file changed while the benchmark was executing.",
  IAC_PROVENANCE_MISMATCH: "The runtime package does not match its pinned source or artifact hash.",
  P5_GATE_INCOMPLETE: "Technical evidence exists, but one or more governed closure gates remain open.",
};

export class IacBenchmarkError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "IacBenchmarkError";
    this.code = code;
  }
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertCondition(condition, message) {
  if (!condition) throw new IacBenchmarkError("IAC_INPUT_INVALID", message);
}

function safeRelativePath(value, label) {
  assertCondition(typeof value === "string" && value.length > 0, `${label} must be a path`);
  assertCondition(
    !value.startsWith("/") && !value.includes("\\") && !value.split("/").includes(".."),
    `${label} must be a portable repository-relative path`,
  );
  return value;
}

function stableJson(value) {
  return JSON.stringify(value);
}

function sameJson(left, right) {
  return stableJson(left) === stableJson(right);
}

function sortStrings(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function findingKey(value) {
  return `${value.rule_id}|${value.subject}|${value.edge ?? ""}`;
}

export function validateIacGroundTruth(value) {
  assertCondition(isObject(value) && value.schema_version === 1, "IaC ground truth must use schema version 1");
  assertCondition(isObject(value.benchmark), "IaC ground truth requires benchmark metadata");
  assertCondition(
    value.benchmark.status === "preparatory-awaiting-human-freeze",
    "The preparatory corpus must not claim a completed freeze",
  );
  assertCondition(value.benchmark.contract_version === "0.1", "Unexpected IaC contract version");
  assertCondition(
    /^[0-9a-f]{40}$/.test(value.benchmark.guardian_source_commit ?? ""),
    "Guardian source commit must be a full SHA",
  );
  assertCondition(Array.isArray(value.cases) && value.cases.length > 0, "IaC ground truth requires cases");
  assertCondition(isObject(value.benchmark.expected_distribution), "Expected category distribution is required");
  assertCondition(isObject(value.benchmark.governance), "Governance state is required");

  const distribution = Object.fromEntries(IAC_CATEGORIES.map((category) => [category, 0]));
  const ids = new Set();
  const directories = new Set();
  for (const [index, scenario] of value.cases.entries()) {
    assertCondition(isObject(scenario), `Case ${index + 1} must be an object`);
    const expectedId = `iac-case-${String(index + 1).padStart(2, "0")}`;
    assertCondition(scenario.id === expectedId, `Expected contiguous case id ${expectedId}`);
    assertCondition(!ids.has(scenario.id), `Duplicate case id ${scenario.id}`);
    ids.add(scenario.id);
    assertCondition(IAC_CATEGORIES.includes(scenario.category), `${scenario.id}: invalid category`);
    distribution[scenario.category] += 1;
    safeRelativePath(scenario.directory, `${scenario.id}.directory`);
    assertCondition(!directories.has(scenario.directory), `${scenario.id}: duplicate directory`);
    directories.add(scenario.directory);
    assertCondition(Array.isArray(scenario.targets) && scenario.targets.length > 0, `${scenario.id}: targets are required`);
    assertCondition(isObject(scenario.expected), `${scenario.id}: expected result is required`);
    for (const key of ["findings", "diagnostic_codes", "claim_checks", "identity_checks", "public_exposures"]) {
      assertCondition(Array.isArray(scenario.expected[key]), `${scenario.id}: expected.${key} must be an array`);
    }
    assertCondition(isObject(scenario.expected.conflict_counts), `${scenario.id}: conflict counts are required`);
    for (const finding of scenario.expected.findings) {
      assertCondition(IAC_RULE_IDS.includes(finding.rule_id), `${scenario.id}: unknown security rule`);
      assertCondition(typeof finding.subject === "string" && finding.subject.length > 0, `${scenario.id}: finding subject is required`);
      assertCondition(Array.isArray(finding.evidence) && finding.evidence.length > 0, `${scenario.id}: finding evidence is required`);
      for (const evidence of finding.evidence) {
        safeRelativePath(evidence.file, `${scenario.id}.finding.evidence.file`);
        assertCondition(Number.isInteger(evidence.line) && evidence.line > 0, `${scenario.id}: evidence line must be positive`);
      }
    }
  }
  assertCondition(
    sameJson(distribution, value.benchmark.expected_distribution),
    `IaC category distribution mismatch: ${stableJson(distribution)}`,
  );
  return distribution;
}

async function listFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort((left, right) => left.localeCompare(right));
}

async function readSourceMap(root, caseDirectory, subdirectory, extensions) {
  const directory = join(root, caseDirectory, subdirectory);
  const files = (await listFiles(directory)).filter((file) => extensions.some((extension) => file.endsWith(extension)));
  const result = {};
  for (const file of files) {
    const key = relative(root, file).replaceAll("\\", "/");
    result[key] = await readFile(file, "utf8");
  }
  return result;
}

async function evidenceFromFixture(root, caseDirectory, source, compact) {
  assertCondition(isObject(compact), `${caseDirectory}: evidence must be an object`);
  const localFile = safeRelativePath(compact.file, `${caseDirectory}.evidence.file`);
  assertCondition(Number.isInteger(compact.line) && compact.line > 0, `${caseDirectory}: evidence line must be positive`);
  const absolute = join(root, caseDirectory, localFile);
  const content = await readFile(absolute, "utf8");
  const lines = content.split("\n");
  assertCondition(compact.line <= lines.length, `${caseDirectory}: evidence line is outside ${localFile}`);
  const line = lines[compact.line - 1];
  assertCondition(line.includes(compact.snippet), `${caseDirectory}: evidence snippet does not match ${localFile}:${compact.line}`);
  const prefix = lines.slice(0, compact.line - 1).join("\n");
  const offset = prefix.length + (compact.line === 1 ? 0 : 1);
  const column = line.indexOf(compact.snippet) + 1;
  const start = offset + column - 1;
  return {
    source,
    file: `${caseDirectory}/${localFile}`,
    range: {
      start: { line: compact.line, column, offset: start },
      end: { line: compact.line, column: column + compact.snippet.length, offset: start + compact.snippet.length },
    },
    snippet: compact.snippet,
    detector: compact.detector,
    confidence: 1,
  };
}

async function expandObservation(root, caseDirectory, compact) {
  assertCondition(compact.source === "spec" || compact.source === "code", `${caseDirectory}: fixture observations must be spec or code`);
  return {
    source: compact.source,
    source_class: compact.source,
    native_id: compact.native_id,
    name: compact.name,
    namespace: compact.namespace,
    aliases: compact.aliases,
    kind: compact.kind,
    exposure: compact.exposure,
    approved: compact.approved,
    trust_boundary: compact.trust_boundary,
    attributes: compact.attributes,
    evidence: [await evidenceFromFixture(root, caseDirectory, compact.source, compact.evidence)],
  };
}

export async function loadIacCase(root, scenario) {
  const caseDirectory = safeRelativePath(scenario.directory, `${scenario.id}.directory`);
  const controlPath = join(root, caseDirectory, "sources.json");
  const compact = JSON.parse(await readFile(controlPath, "utf8"));
  assertCondition(Array.isArray(compact.observations), `${scenario.id}: observations must be an array`);
  assertCondition(Array.isArray(compact.references), `${scenario.id}: references must be an array`);
  assertCondition(Array.isArray(compact.alias_rules), `${scenario.id}: alias_rules must be an array`);
  const architectureObservations = [];
  for (const observation of compact.observations) {
    architectureObservations.push(await expandObservation(root, caseDirectory, observation));
  }
  assertCondition(compact.references.length === 0, `${scenario.id}: compact references are not enabled in v0.1`);
  const terraformFiles = await readSourceMap(root, caseDirectory, "terraform", [".tf"]);
  const kubernetesFiles = await readSourceMap(root, caseDirectory, "kubernetes", [".yaml", ".yml"]);
  assertCondition(
    Object.keys(terraformFiles).length + Object.keys(kubernetesFiles).length > 0,
    `${scenario.id}: at least one Terraform or Kubernetes input is required`,
  );
  return {
    terraform_files: terraformFiles,
    kubernetes_files: kubernetesFiles,
    architecture_observations: architectureObservations,
    architecture_references: [],
    alias_rules: compact.alias_rules,
  };
}

function normalizeEvidence(values) {
  const unique = new Map();
  for (const evidence of values) {
    const value = {
      source: evidence.source,
      file: evidence.file,
      line: evidence.range.start.line,
      column: evidence.range.start.column,
      detector: evidence.detector,
    };
    unique.set(stableJson(value), value);
  }
  return [...unique.values()].sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
}

export function normalizeIacAnalysis(result) {
  return {
    contract_version: result.contract_version,
    findings: result.security_findings.map((finding) => ({
      rule_id: finding.rule_id,
      subject: finding.subject,
      edge: finding.edge,
      severity: finding.severity,
      evidence: normalizeEvidence(finding.evidence),
    })).sort((left, right) => findingKey(left).localeCompare(findingKey(right))),
    diagnostics: result.graph.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      severity: diagnostic.severity,
      source: diagnostic.evidence.source,
      file: diagnostic.evidence.file,
      line: diagnostic.evidence.range.start.line,
    })).sort((left, right) => stableJson(left).localeCompare(stableJson(right))),
    claims: result.claims.map((claim) => ({
      id: claim.id,
      subject: claim.subject,
      property: claim.property,
      classification: claim.classification,
      confidence: claim.confidence,
      values: sortStrings(claim.values.map((value) => `${value.source}:${String(value.value)}`)),
      missing_sources: sortStrings(claim.missing_sources),
    })).sort((left, right) => left.id.localeCompare(right.id)),
    identities: result.identities.resolutions.map((identity) => ({
      observation_key: identity.observation_key,
      canonical_id: identity.canonical_id,
      method: identity.method,
      confidence: identity.confidence,
    })).sort((left, right) => left.observation_key.localeCompare(right.observation_key)),
    counts: {
      terraform_resources: result.terraform.resources.length,
      kubernetes_resources: result.kubernetes.resources.length,
      nodes: result.graph.nodes.length,
      edges: result.graph.edges.length,
    },
  };
}

function issue(code, message) {
  return { code, message };
}

export function evaluateIacCase(scenario, actual) {
  const issues = [];
  const expectedFindingKeys = sortStrings(scenario.expected.findings.map(findingKey));
  const actualFindingKeys = sortStrings(actual.findings.map(findingKey));
  if (!sameJson(actualFindingKeys, expectedFindingKeys)) {
    issues.push(issue("IAC_FINDING_MISMATCH", `${scenario.id}: expected ${stableJson(expectedFindingKeys)}, received ${stableJson(actualFindingKeys)}`));
  }
  for (const expected of scenario.expected.findings) {
    const finding = actual.findings.find((candidate) => findingKey(candidate) === findingKey(expected));
    for (const evidence of expected.evidence) {
      const matched = finding?.evidence.some((candidate) =>
        candidate.source === evidence.source && candidate.file === evidence.file && candidate.line === evidence.line,
      );
      if (!matched) issues.push(issue("IAC_EVIDENCE_MISMATCH", `${scenario.id}: missing ${evidence.source} evidence at ${evidence.file}:${evidence.line}`));
    }
  }
  const expectedDiagnostics = sortStrings(scenario.expected.diagnostic_codes);
  const actualDiagnostics = sortStrings(actual.diagnostics.map(({ code }) => code));
  if (!sameJson(actualDiagnostics, expectedDiagnostics)) {
    issues.push(issue("IAC_DIAGNOSTIC_MISMATCH", `${scenario.id}: expected diagnostics ${stableJson(expectedDiagnostics)}, received ${stableJson(actualDiagnostics)}`));
  }
  if (actual.diagnostics.some(({ severity }) => severity === "error")) {
    issues.push(issue("IAC_PARSE_ERROR", `${scenario.id}: error-level parser diagnostic`));
  }
  for (const expected of scenario.expected.claim_checks) {
    const claim = actual.claims.find((candidate) => candidate.subject === expected.subject && candidate.property === expected.property);
    const matched = claim
      && claim.classification === expected.classification
      && sameJson(claim.values, sortStrings(expected.values))
      && (expected.missing_sources === undefined || sameJson(claim.missing_sources, sortStrings(expected.missing_sources)));
    if (!matched) issues.push(issue("IAC_CLAIM_MISMATCH", `${scenario.id}: claim ${expected.subject}:${expected.property} differs`));
  }
  for (const classification of ["contradiction", "identity-uncertain"]) {
    const actualCount = actual.claims.filter((claim) => claim.classification === classification).length;
    if (actualCount !== scenario.expected.conflict_counts[classification]) {
      issues.push(issue("IAC_CLAIM_MISMATCH", `${scenario.id}: ${classification} count expected ${scenario.expected.conflict_counts[classification]}, received ${actualCount}`));
    }
  }
  for (const expected of scenario.expected.identity_checks) {
    const actualCount = actual.identities.filter((identity) =>
      identity.method === expected.method
      && (expected.canonical_id === undefined || identity.canonical_id === expected.canonical_id),
    ).length;
    if (actualCount !== expected.count) issues.push(issue("IAC_IDENTITY_MISMATCH", `${scenario.id}: identity ${expected.method} expected ${expected.count}, received ${actualCount}`));
  }
  for (const exposure of scenario.expected.public_exposures) {
    const detected = actual.findings.some((finding) => finding.rule_id === exposure.rule_id && finding.subject === exposure.subject);
    if (!detected) issues.push(issue("IAC_PUBLIC_EXPOSURE_MISS", `${scenario.id}: missed ${exposure.rule_id} for ${exposure.subject}`));
  }
  return { valid: issues.length === 0, issues };
}

export async function runIacCorpus(root, groundTruth, analyze) {
  const distribution = validateIacGroundTruth(groundTruth);
  const cases = [];
  for (const scenario of groundTruth.cases) {
    const input = await loadIacCase(root, scenario);
    let normalized;
    try {
      normalized = normalizeIacAnalysis(await analyze(input));
    } catch (error) {
      throw new IacBenchmarkError("IAC_ANALYZER_FAILURE", `${scenario.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const evaluation = evaluateIacCase(scenario, normalized);
    cases.push({
      id: scenario.id,
      title: scenario.title,
      category: scenario.category,
      targets: scenario.targets,
      valid: evaluation.valid,
      issues: evaluation.issues,
      expected_finding_keys: sortStrings(scenario.expected.findings.map(findingKey)),
      actual_finding_keys: sortStrings(normalized.findings.map(findingKey)),
      expected_public_exposures: scenario.expected.public_exposures,
      findings: normalized.findings,
      diagnostics: normalized.diagnostics,
      claims: normalized.claims,
      identities: normalized.identities,
      counts: normalized.counts,
    });
  }
  return { distribution, cases, valid: cases.every(({ valid }) => valid) };
}

function ratio(numerator, denominator) {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(6));
}

export function calculateIacMetrics(run) {
  const securityRules = {};
  for (const ruleId of IAC_RULE_IDS) {
    let truePositive = 0;
    let falsePositive = 0;
    let falseNegative = 0;
    let trueNegative = 0;
    for (const result of run.cases) {
      const expected = result.expected_finding_keys.some((key) => key.startsWith(`${ruleId}|`));
      const actual = result.actual_finding_keys.some((key) => key.startsWith(`${ruleId}|`));
      if (expected && actual) truePositive += 1;
      else if (!expected && actual) falsePositive += 1;
      else if (expected) falseNegative += 1;
      else trueNegative += 1;
    }
    securityRules[ruleId] = {
      true_positive: truePositive,
      false_positive: falsePositive,
      false_negative: falseNegative,
      true_negative: trueNegative,
      precision: ratio(truePositive, truePositive + falsePositive),
      recall: ratio(truePositive, truePositive + falseNegative),
      f1: ratio(2 * truePositive, 2 * truePositive + falsePositive + falseNegative),
      specificity: ratio(trueNegative, trueNegative + falsePositive),
    };
  }
  const expectedPublic = run.cases.flatMap(({ expected_public_exposures }) => expected_public_exposures);
  const actualPublic = run.cases.flatMap(({ findings }) => findings.filter(({ rule_id }) =>
    rule_id === "IAC-PUBLIC-DATABASE" || rule_id === "IAC-UNEXPECTED-INGRESS",
  ));
  const issueCounts = {};
  for (const problem of run.cases.flatMap(({ issues }) => issues)) {
    issueCounts[problem.code] = (issueCounts[problem.code] ?? 0) + 1;
  }
  return {
    cases: {
      total: run.cases.length,
      valid: run.cases.filter(({ valid }) => valid).length,
      parseable: run.cases.filter(({ issues }) => !issues.some(({ code }) => code === "IAC_PARSE_ERROR")).length,
    },
    exact_findings: {
      matched_cases: run.cases.filter(({ issues }) => !issues.some(({ code }) => code === "IAC_FINDING_MISMATCH")).length,
      total_cases: run.cases.length,
    },
    exact_required_evidence: {
      matched_cases: run.cases.filter(({ issues }) => !issues.some(({ code }) => code === "IAC_EVIDENCE_MISMATCH")).length,
      total_cases: run.cases.length,
    },
    public_exposure: {
      expected: expectedPublic.length,
      detected: expectedPublic.filter((expected) => actualPublic.some((actual) => actual.rule_id === expected.rule_id && actual.subject === expected.subject)).length,
      unexpected: actualPublic.filter((actual) => !expectedPublic.some((expected) => expected.rule_id === actual.rule_id && expected.subject === actual.subject)).length,
    },
    security_rules: securityRules,
    error_counts: issueCounts,
  };
}

export async function hashIacCorpus(root) {
  const directory = join(root, "iac");
  const files = (await listFiles(directory)).filter((file) => !file.endsWith("README.md"));
  const entries = [];
  for (const file of files) {
    entries.push({ file: relative(root, file).replaceAll("\\", "/"), sha256: sha256(await readFile(file)) });
  }
  return { files: entries, tree_sha256: sha256(stableJson(entries)) };
}

export async function runIacReplay(root, groundTruth, analyze) {
  const before = await hashIacCorpus(root);
  const first = await runIacCorpus(root, groundTruth, analyze);
  const second = await runIacCorpus(root, groundTruth, analyze);
  const after = await hashIacCorpus(root);
  const runHashes = [sha256(stableJson(first)), sha256(stableJson(second))];
  const replayIssues = [];
  if (runHashes[0] !== runHashes[1]) replayIssues.push(issue("IAC_NONDETERMINISTIC", "Complete corpus run hashes differ"));
  if (!sameJson(before, after)) replayIssues.push(issue("IAC_INPUT_MUTATION", "IaC corpus changed during execution"));
  return {
    first,
    run_hashes: runHashes,
    identical: runHashes[0] === runHashes[1],
    input_unchanged: sameJson(before, after),
    corpus: before,
    replay_issues: replayIssues,
  };
}

export function closureBlockers(governance, sourceCommit, groundTruthStatus = "preparatory-awaiting-human-freeze") {
  const blockers = [];
  if (groundTruthStatus !== "frozen") blockers.push("Corpus metadata is not marked frozen");
  if (!governance.p4_120_approved) blockers.push("P4-120 approval is not recorded");
  if (!governance.phase5_adr_accepted) blockers.push("Phase 5 ADR acceptance is not recorded");
  if (!governance.security_review_approved) blockers.push("Independent Security approval is not recorded");
  if (!governance.ground_truth_frozen) blockers.push("Ground truth is not frozen before the final run");
  const approvals = Array.isArray(governance.approval_records) ? governance.approval_records : [];
  for (const role of ["phase5-lead", "independent-security-reviewer"]) {
    const approval = approvals.find((record) => record.role === role);
    if (!approval || approval.approved_commit !== sourceCommit || !/^https:\/\//.test(approval.url ?? "")) {
      blockers.push(`${role} approval is absent or not bound to the exact Guardian commit`);
    }
  }
  return blockers;
}

export function assertPhase5Closure(evidence) {
  if (!evidence.technical_evidence.valid) {
    throw new IacBenchmarkError("P5_GATE_INCOMPLETE", "Technical evidence is not valid");
  }
  if (evidence.closure.blockers.length > 0 || evidence.status !== "CLOSED") {
    throw new IacBenchmarkError("P5_GATE_INCOMPLETE", evidence.closure.blockers.join("; ") || "Phase 5 status is not CLOSED");
  }
  return true;
}
