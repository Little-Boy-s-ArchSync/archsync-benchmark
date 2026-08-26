import { createHash } from "node:crypto";

const labels = new Set(["component", "relationship", "violation", "evolution", "no-impact", "unknown"]);
const predictionValues = new Set(["positive", "negative", "failed"]);
const unitTypes = ["node", "edge", "rule"];

export const HOLDOUT_ERROR_CAUSES = Object.freeze([
  "wrapper",
  "dynamic-endpoint",
  "alias",
  "dependency-injection",
  "monorepo",
  "generated-code",
  "unsupported-library",
  "mapping-ambiguity",
]);

const errorCauses = new Set(HOLDOUT_ERROR_CAUSES);

function object(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (object(value)) {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function safeRelativePath(value) {
  return nonEmpty(value) && !value.startsWith("/") && !/^[A-Za-z]:/u.test(value) && !value.includes("\\") && !value.split("/").includes("..") && !value.split("/").includes("");
}

function repositoryIssues(repository, index = 0) {
  const issues = [];
  const prefix = `repositories[${index}]`;
  if (!object(repository)) return [`${prefix} must be an object`];
  if (!nonEmpty(repository.id)) issues.push(`${prefix}.id is required`);
  if (!/^https:\/\/github\.com\/[^/]+\/[^/]+$/u.test(repository.url ?? "")) issues.push(`${prefix}.url must be an exact GitHub repository URL`);
  if (!/^[0-9a-f]{40}$/u.test(repository.commit ?? "")) issues.push(`${prefix}.commit must be a full SHA`);
  if (!nonEmpty(repository.license_spdx)) issues.push(`${prefix}.license_spdx is required`);
  if (!safeRelativePath(repository.license_file)) issues.push(`${prefix}.license_file must be a safe tracked path`);
  if (!/^[0-9a-f]{64}$/u.test(repository.license_sha256 ?? "")) issues.push(`${prefix}.license_sha256 is required`);
  if (!safeRelativePath(repository.scope)) issues.push(`${prefix}.scope is required and must be safe`);
  if (!nonEmpty(repository.retrieved_at)) issues.push(`${prefix}.retrieved_at is required`);
  if (!/^[0-9a-f]{64}$/u.test(repository.tree_sha256 ?? "")) issues.push(`${prefix}.tree_sha256 is required`);
  if (!object(repository.environment) || !nonEmpty(repository.environment.node) || !nonEmpty(repository.environment.package_manager)) {
    issues.push(`${prefix}.environment requires Node and package manager versions`);
  }
  return issues;
}

export function validateHoldoutManifest(manifest) {
  const issues = [];
  if (!object(manifest)) return ["manifest must be an object"];
  if (manifest.schema_version !== 1) issues.push("schema_version must equal 1");
  if (!nonEmpty(manifest.protocol_version)) issues.push("protocol_version is required");
  if (!["proposed", "frozen"].includes(manifest.status)) issues.push("status must be proposed or frozen");
  if (!Array.isArray(manifest.repositories)) issues.push("repositories must be an array");
  const repositories = Array.isArray(manifest.repositories) ? manifest.repositories : [];
  if (manifest.status === "frozen" && (repositories.length < 2 || repositories.length > 3)) {
    issues.push("a frozen holdout requires 2-3 repositories");
  }
  const seen = new Set();
  repositories.forEach((repository, index) => {
    issues.push(...repositoryIssues(repository, index));
    if (object(repository) && nonEmpty(repository.id)) {
      if (seen.has(repository.id)) issues.push(`repositories[${index}].id must be unique`);
      seen.add(repository.id);
    }
  });
  const tuning = new Set(Array.isArray(manifest.tuning_repository_urls) ? manifest.tuning_repository_urls : []);
  for (const repository of repositories) {
    if (object(repository) && tuning.has(repository.url)) issues.push(`${repository.url} appears in the tuning set`);
  }
  if (manifest.status === "frozen") {
    if (!object(manifest.approval) || manifest.approval.actor_type !== "human" || !nonEmpty(manifest.approval.reviewer_id) || !nonEmpty(manifest.approval.approved_at)) {
      issues.push("frozen manifest requires human Lead approval");
    }
    if (!/^[0-9a-f]{64}$/u.test(manifest.ground_truth_sha256 ?? "")) issues.push("frozen manifest requires ground_truth_sha256");
  }
  return issues;
}

export function computeTrackedTreeSha256(entries) {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error("tracked tree entries are required");
  const seen = new Set();
  const records = entries.map((entry) => {
    if (!object(entry) || !safeRelativePath(entry.path) || seen.has(entry.path) || !(typeof entry.content === "string" || Buffer.isBuffer(entry.content))) {
      throw new Error("tracked tree entries require unique safe paths and byte content");
    }
    seen.add(entry.path);
    return { path: entry.path, sha256: sha256(entry.content) };
  }).sort((left, right) => left.path.localeCompare(right.path));
  return sha256(records.map(({ path, sha256: digest }) => `${path}\0${digest}`).join("\n"));
}

export function verifyRepositoryPin(repository, observation) {
  const issues = repositoryIssues(repository);
  if (!object(observation)) return [...issues, "repository observation must be an object"];
  if (observation.url !== repository.url) issues.push("repository URL does not match the frozen pin");
  if (observation.commit !== repository.commit) issues.push("repository commit does not match the frozen pin");
  if (observation.scope !== repository.scope) issues.push("repository scope does not match the frozen pin");
  if (observation.tree_sha256 !== repository.tree_sha256) issues.push("repository tree hash does not match the frozen pin");
  if (observation.license_file !== repository.license_file || observation.license_sha256 !== repository.license_sha256) {
    issues.push("repository license artifact does not match the frozen pin");
  }
  return issues;
}

export async function materializeRepositoryPin(repository, adapters) {
  const repositoryValidation = repositoryIssues(repository);
  if (repositoryValidation.length > 0) throw new Error(repositoryValidation.join("; "));
  if (!object(adapters) || typeof adapters.clone !== "function" || typeof adapters.inspect !== "function") {
    throw new Error("clone and inspect adapters are required");
  }
  const checkout = await adapters.clone({ url: repository.url, commit: repository.commit, scope: repository.scope });
  const observation = await adapters.inspect(checkout, repository);
  const issues = verifyRepositoryPin(repository, observation);
  if (issues.length > 0) throw new Error(issues.join("; "));
  return { checkout, observation: structuredClone(observation) };
}

export function validateIndependentAnnotations(rows) {
  const issues = [];
  if (!Array.isArray(rows) || rows.length === 0) return ["annotations must contain rows"];
  const perItem = new Map();
  const seen = new Set();
  rows.forEach((row, index) => {
    if (!object(row)) {
      issues.push(`row ${index} must be an object`);
      return;
    }
    const key = `${row.item_id}\0${row.reviewer_id}`;
    if (!nonEmpty(row.item_id) || !nonEmpty(row.reviewer_id) || seen.has(key)) issues.push(`row ${index} has missing or duplicate item/reviewer`);
    else seen.add(key);
    if (!labels.has(row.label)) issues.push(`row ${index} has unsupported label`);
    if (!Number.isFinite(row.confidence) || row.confidence < 0 || row.confidence > 1) issues.push(`row ${index} confidence must be 0..1`);
    if (!nonEmpty(row.evidence_file) || !Number.isInteger(row.evidence_line) || row.evidence_line < 1) issues.push(`row ${index} requires source evidence`);
    if (row.saw_prediction !== false) issues.push(`row ${index} must be blind to predictions`);
    const reviewers = perItem.get(row.item_id) ?? new Set();
    reviewers.add(row.reviewer_id);
    perItem.set(row.item_id, reviewers);
  });
  for (const [item, reviewers] of perItem) {
    if (reviewers.size !== 2) issues.push(`${item} must have exactly two independent reviewers`);
  }
  return issues;
}

export function validateAdjudications(annotations, adjudications) {
  const issues = validateIndependentAnnotations(annotations);
  if (!Array.isArray(adjudications)) return [...issues, "adjudications must be an array"];
  if (issues.length > 0) return issues;
  const annotationGroups = new Map();
  for (const annotation of annotations) {
    const rows = annotationGroups.get(annotation.item_id) ?? [];
    rows.push(annotation);
    annotationGroups.set(annotation.item_id, rows);
  }
  const decisions = new Map();
  adjudications.forEach((decision, index) => {
    if (!object(decision) || !nonEmpty(decision.item_id) || decisions.has(decision.item_id)) {
      issues.push(`adjudication ${index} has a missing or duplicate item_id`);
      return;
    }
    decisions.set(decision.item_id, decision);
    const originals = annotationGroups.get(decision.item_id);
    if (!originals) {
      issues.push(`adjudication ${decision.item_id} has no original annotations`);
      return;
    }
    const ordered = [...originals].sort((left, right) => left.reviewer_id.localeCompare(right.reviewer_id));
    if (decision.reviewer_a_id !== ordered[0].reviewer_id || decision.reviewer_a_label !== ordered[0].label || decision.reviewer_b_id !== ordered[1].reviewer_id || decision.reviewer_b_label !== ordered[1].label) {
      issues.push(`adjudication ${decision.item_id} does not preserve original labels`);
    }
    const agreement = ordered[0].label === ordered[1].label;
    if (decision.agreement !== agreement) issues.push(`adjudication ${decision.item_id} has an incorrect agreement flag`);
    if (!labels.has(decision.final_label)) issues.push(`adjudication ${decision.item_id} requires a supported final label`);
    if (agreement && decision.final_label !== ordered[0].label) issues.push(`adjudication ${decision.item_id} cannot change an agreed label`);
    if (decision.actor_type !== "human" || !nonEmpty(decision.adjudicator_id) || !nonEmpty(decision.rationale) || !nonEmpty(decision.decided_at)) {
      issues.push(`adjudication ${decision.item_id} requires human sign-off, rationale, and time`);
    }
  });
  for (const [itemId, originals] of annotationGroups) {
    if (originals[0].label !== originals[1].label && !decisions.has(itemId)) issues.push(`${itemId} disagreement requires adjudication`);
  }
  return issues;
}

export function createFrozenManifest(manifest, artifacts) {
  const issues = validateHoldoutManifest(manifest);
  if (manifest?.status !== "frozen") issues.push("manifest status must be frozen before hashing");
  if (issues.length > 0) throw new Error(issues.join("; "));
  const files = Object.entries(artifacts).sort(([a], [b]) => a.localeCompare(b)).map(([file, content]) => ({
    file,
    sha256: sha256(typeof content === "string" ? content : Buffer.from(content)),
  }));
  if (files.length === 0) throw new Error("at least one freeze artifact is required");
  return {
    schema_version: 1,
    manifest: structuredClone(manifest),
    artifacts: files,
    freeze_sha256: sha256(stable({ manifest, files })),
  };
}

export function verifyFrozenManifest(frozen, artifacts) {
  if (!object(frozen) || !Array.isArray(frozen.artifacts)) return false;
  try {
    const rebuilt = createFrozenManifest(frozen.manifest, artifacts);
    return stable(rebuilt.artifacts) === stable(frozen.artifacts) && rebuilt.freeze_sha256 === frozen.freeze_sha256;
  } catch {
    return false;
  }
}

function validateRunPackages(packages) {
  if (!object(packages)) return false;
  return ["core", "guardian"].every((name) => {
    const item = packages[name];
    return object(item) && nonEmpty(item.version) && /^[0-9a-f]{40}$/u.test(item.commit) && /^[0-9a-f]{64}$/u.test(item.artifact_sha256);
  });
}

export async function runFrozenHoldoutTwice({ frozen, artifacts, observations, packages, environment, analyze }) {
  if (!verifyFrozenManifest(frozen, artifacts)) throw new Error("HOLDOUT_NOT_FROZEN");
  if (!object(observations) || !validateRunPackages(packages) || !object(environment) || !nonEmpty(environment.id) || !nonEmpty(environment.node) || !nonEmpty(environment.package_manager) || typeof analyze !== "function") {
    throw new Error("HOLDOUT_RUN_CONFIGURATION_INVALID");
  }
  for (const repository of frozen.manifest.repositories) {
    const issues = verifyRepositoryPin(repository, observations[repository.id]);
    if (issues.length > 0) throw new Error(`HOLDOUT_PIN_INVALID: ${issues.join("; ")}`);
  }
  const runs = [];
  for (let run = 1; run <= 2; run += 1) {
    const repositories = [];
    for (const repository of frozen.manifest.repositories) {
      try {
        const output = await analyze({ repository: structuredClone(repository), run, packages: structuredClone(packages), environment: structuredClone(environment) });
        if (!object(output) || !object(output.normalized) || !Number.isFinite(output.duration_ms) || output.duration_ms < 0) throw new Error("INVALID_ANALYZER_OUTPUT");
        repositories.push({
          repository_id: repository.id,
          status: "completed",
          duration_ms: output.duration_ms,
          raw: output.raw ?? null,
          raw_sha256: sha256(stable(output.raw ?? null)),
          normalized: output.normalized,
          normalized_sha256: sha256(stable(output.normalized)),
        });
      } catch (error) {
        const errorClass = error instanceof Error ? error.name : "NonErrorFailure";
        const normalized = { status: "failed", error_class: errorClass };
        repositories.push({
          repository_id: repository.id,
          status: "failed",
          duration_ms: null,
          raw: null,
          raw_sha256: sha256(stable(null)),
          normalized,
          normalized_sha256: sha256(stable(normalized)),
        });
      }
    }
    runs.push({ run, repositories });
  }
  const first = Object.fromEntries(runs[0].repositories.map((item) => [item.repository_id, item.normalized_sha256]));
  const second = Object.fromEntries(runs[1].repositories.map((item) => [item.repository_id, item.normalized_sha256]));
  const deterministic = stable(first) === stable(second);
  return {
    schema_version: 1,
    status: deterministic ? "PREPARATORY_REPLAY_COMPLETE" : "BLOCKED_NONDETERMINISTIC",
    deterministic,
    freeze_sha256: frozen.freeze_sha256,
    packages: structuredClone(packages),
    environment: structuredClone(environment),
    runs,
    normalized_replay_sha256: deterministic ? sha256(stable(first)) : null,
  };
}

function ratioRecord(numerator, denominator) {
  return { numerator, denominator, value: denominator === 0 ? null : numerator / denominator };
}

function metricSummary(rows) {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  let failed = 0;
  for (const row of rows) {
    if (row.prediction === "failed") failed += 1;
    else if (row.truth_positive && row.prediction === "positive") tp += 1;
    else if (!row.truth_positive && row.prediction === "positive") fp += 1;
    else if (!row.truth_positive) tn += 1;
    else fn += 1;
  }
  const failedPositive = rows.filter((row) => row.truth_positive && row.prediction === "failed").length;
  return {
    n: rows.length,
    confusion: { tp, fp, tn, fn, failed },
    precision: ratioRecord(tp, tp + fp),
    recall: ratioRecord(tp, tp + fn + failedPositive),
    f1: ratioRecord(2 * tp, 2 * tp + fp + fn + failedPositive),
  };
}

function groupedMetricSummary(rows) {
  const units = Object.fromEntries(unitTypes.map((unit) => [unit, metricSummary(rows.filter((row) => row.unit_type === unit))]));
  const ruleRows = rows.filter((row) => row.unit_type === "rule");
  const evidenceRows = rows.filter((row) => row.evidence_required);
  return {
    n: rows.length,
    units,
    classification: ratioRecord(rows.filter((row) => row.prediction !== "failed" && row.truth_label === row.predicted_label).length, rows.length),
    rule_match: ratioRecord(ruleRows.filter((row) => row.prediction !== "failed" && row.rule_match).length, ruleRows.length),
    evidence_file: ratioRecord(evidenceRows.filter((row) => row.prediction !== "failed" && row.evidence_file_exact).length, evidenceRows.length),
    evidence_line: ratioRecord(evidenceRows.filter((row) => row.prediction !== "failed" && row.evidence_line_exact).length, evidenceRows.length),
  };
}

export function calculateHoldoutMetrics(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("metric rows are required");
  const ids = new Set();
  for (const row of rows) {
    if (!object(row) || !nonEmpty(row.id) || ids.has(row.id)) throw new Error("metric row IDs must be unique");
    ids.add(row.id);
    if (!nonEmpty(row.repository_id) || !unitTypes.includes(row.unit_type) || typeof row.truth_positive !== "boolean" || !predictionValues.has(row.prediction) || !nonEmpty(row.truth_label) || (row.prediction !== "failed" && !nonEmpty(row.predicted_label)) || typeof row.rule_match !== "boolean" || typeof row.evidence_required !== "boolean" || typeof row.evidence_file_exact !== "boolean" || typeof row.evidence_line_exact !== "boolean") {
      throw new Error(`invalid metric row ${row.id}`);
    }
  }
  const repositories = [...new Set(rows.map((row) => row.repository_id))].sort();
  return {
    schema_version: 1,
    pooled: groupedMetricSummary(rows),
    by_repository: Object.fromEntries(repositories.map((repository) => [repository, groupedMetricSummary(rows.filter((row) => row.repository_id === repository))])),
  };
}

export function classifyHoldoutErrors(rows) {
  if (!Array.isArray(rows)) throw new Error("error rows must be an array");
  return rows.filter((row) => {
    if (!object(row)) throw new Error("error rows must contain objects");
    return row.prediction !== "failed" && row.truth_positive !== (row.prediction === "positive");
  }).map((row) => {
    if (!nonEmpty(row.id) || !nonEmpty(row.evidence) || !errorCauses.has(row.root_cause)) {
      throw new Error("each FP/FN requires an ID, evidence, and supported root cause");
    }
    return {
      id: row.id,
      type: row.truth_positive ? "false-negative" : "false-positive",
      root_cause: row.root_cause,
      evidence: row.evidence,
      action: row.scope === "out-of-scope" ? "document-out-of-scope" : row.detector_supported === false ? "document-limitation" : "fix",
    };
  });
}

function percentile(sorted, fraction) {
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

function distribution(rows, key) {
  const values = rows.filter((row) => row.status === "completed").map((row) => row[key]).sort((left, right) => left - right);
  return {
    n: values.length,
    p50: values.length === 0 ? null : percentile(values, 0.5),
    p95: values.length === 0 ? null : percentile(values, 0.95),
  };
}

function scalabilityGroup(rows) {
  return {
    n: rows.length,
    completed: rows.filter((row) => row.status === "completed").length,
    failed: rows.filter((row) => row.status === "failed").length,
    duration_ms: distribution(rows, "duration_ms"),
    cpu_ms: distribution(rows, "cpu_ms"),
    peak_memory_bytes: distribution(rows, "peak_memory_bytes"),
    files: distribution(rows, "files"),
    parsed_files: distribution(rows, "parsed_files"),
    components: distribution(rows, "component_count"),
    oracle_agreement: ratioRecord(rows.filter((row) => row.status === "completed" && row.oracle_match === true).length, rows.filter((row) => row.status === "completed").length),
    environments: [...new Set(rows.map((row) => row.environment_id))].sort(),
    parsed_scopes: [...new Set(rows.map((row) => row.parsed_scope))].sort(),
    failures: rows.filter((row) => row.status === "failed").map((row) => ({ repository_id: row.repository_id, mode: row.mode, failure_class: row.failure_class })),
  };
}

export function summarizeScalabilitySamples(samples) {
  if (!Array.isArray(samples) || samples.length < 4) throw new Error("at least four scalability samples are required");
  for (const sample of samples) {
    const completedMetricsValid = sample?.status === "completed" && ["duration_ms", "cpu_ms", "peak_memory_bytes"].every((key) => Number.isFinite(sample[key]) && sample[key] >= 0);
    const failedMetricsValid = sample?.status === "failed" && nonEmpty(sample.failure_class) && sample.duration_ms === null && sample.cpu_ms === null && sample.peak_memory_bytes === null;
    if (!object(sample) || !["full", "incremental"].includes(sample.mode) || !nonEmpty(sample.repository_id) || !nonEmpty(sample.environment_id) || !nonEmpty(sample.parsed_scope) || !Number.isInteger(sample.files) || sample.files < 1 || !Number.isInteger(sample.parsed_files) || sample.parsed_files < 0 || sample.parsed_files > sample.files || !Number.isInteger(sample.component_count) || sample.component_count < 1 || (!completedMetricsValid && !failedMetricsValid)) {
      throw new Error("invalid scalability sample");
    }
  }
  const repositories = [...new Set(samples.map((sample) => sample.repository_id))].sort();
  const environments = [...new Set(samples.map((sample) => sample.environment_id))].sort();
  if (repositories.length < 2 || repositories.length > 3 || environments.length < 2) throw new Error("scalability claims require 2-3 repositories and at least two environments");
  for (const repository of repositories) {
    const modes = new Set(samples.filter((sample) => sample.repository_id === repository).map((sample) => sample.mode));
    if (!modes.has("full") || !modes.has("incremental")) throw new Error(`${repository} requires full and incremental samples`);
  }
  return {
    schema_version: 1,
    n: samples.length,
    repositories,
    environments,
    by_mode: Object.fromEntries(["full", "incremental"].map((mode) => [mode, scalabilityGroup(samples.filter((sample) => sample.mode === mode))])),
    by_repository: Object.fromEntries(repositories.map((repository) => [repository, scalabilityGroup(samples.filter((sample) => sample.repository_id === repository))])),
  };
}
