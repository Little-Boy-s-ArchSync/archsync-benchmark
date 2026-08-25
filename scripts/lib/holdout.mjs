import { createHash } from "node:crypto";

const labels = new Set(["component", "relationship", "violation", "evolution", "no-impact", "unknown"]);
const predictionValues = new Set(["positive", "negative", "failed"]);

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
  for (const [index, repository] of repositories.entries()) {
    if (!object(repository)) {
      issues.push(`repositories[${index}] must be an object`);
      continue;
    }
    if (!nonEmpty(repository.id) || seen.has(repository.id)) issues.push(`repositories[${index}].id must be unique`);
    else seen.add(repository.id);
    if (!/^https:\/\/github\.com\/[^/]+\/[^/]+$/u.test(repository.url ?? "")) issues.push(`repositories[${index}].url must be an exact GitHub repository URL`);
    if (!/^[0-9a-f]{40}$/u.test(repository.commit ?? "")) issues.push(`repositories[${index}].commit must be a full SHA`);
    if (!nonEmpty(repository.license_spdx)) issues.push(`repositories[${index}].license_spdx is required`);
    if (!nonEmpty(repository.scope)) issues.push(`repositories[${index}].scope is required`);
    if (!nonEmpty(repository.retrieved_at)) issues.push(`repositories[${index}].retrieved_at is required`);
    if (!/^[0-9a-f]{64}$/u.test(repository.tree_sha256 ?? "")) issues.push(`repositories[${index}].tree_sha256 is required`);
    if (!object(repository.environment) || !nonEmpty(repository.environment.node) || !nonEmpty(repository.environment.package_manager)) {
      issues.push(`repositories[${index}].environment requires Node and package manager versions`);
    }
  }
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

function ratio(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

export function calculateHoldoutMetrics(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("metric rows are required");
  const ids = new Set();
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  let failed = 0;
  let classificationCorrect = 0;
  let evidenceExact = 0;
  for (const row of rows) {
    if (!object(row) || !nonEmpty(row.id) || ids.has(row.id)) throw new Error("metric row IDs must be unique");
    ids.add(row.id);
    if (typeof row.truth_positive !== "boolean" || !predictionValues.has(row.prediction)) throw new Error(`invalid metric row ${row.id}`);
    if (row.prediction === "failed") failed += 1;
    else if (row.truth_positive && row.prediction === "positive") tp += 1;
    else if (!row.truth_positive && row.prediction === "positive") fp += 1;
    else if (!row.truth_positive) tn += 1;
    else fn += 1;
    if (row.prediction !== "failed" && row.truth_label === row.predicted_label) classificationCorrect += 1;
    if (row.evidence_exact === true) evidenceExact += 1;
  }
  const precision = ratio(tp, tp + fp);
  const recall = ratio(tp, tp + fn + rows.filter((row) => row.truth_positive && row.prediction === "failed").length);
  const f1 = precision === null || recall === null || precision + recall === 0 ? null : 2 * precision * recall / (precision + recall);
  return {
    n: rows.length,
    confusion: { tp, fp, tn, fn, failed },
    detection: { precision, recall, f1 },
    classification_accuracy: ratio(classificationCorrect, rows.length),
    exact_evidence_accuracy: ratio(evidenceExact, rows.length),
  };
}

export function classifyHoldoutErrors(rows) {
  return rows.filter((row) => row.prediction !== "failed" && row.truth_positive !== (row.prediction === "positive")).map((row) => ({
    id: row.id,
    type: row.truth_positive ? "false-negative" : "false-positive",
    evidence: row.evidence ?? "missing",
    action: row.scope === "out-of-scope" ? "document-out-of-scope" : row.detector_supported === false ? "document-limitation" : "fix",
  }));
}

function percentile(sorted, fraction) {
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

export function summarizeScalabilitySamples(samples) {
  if (!Array.isArray(samples) || samples.length < 2) throw new Error("at least two scalability samples are required");
  for (const sample of samples) {
    if (!object(sample) || !["full", "incremental"].includes(sample.mode) || !Number.isFinite(sample.duration_ms) || sample.duration_ms < 0 || !Number.isInteger(sample.files) || sample.files < 1 || !nonEmpty(sample.environment_id)) {
      throw new Error("invalid scalability sample");
    }
  }
  const groups = {};
  for (const mode of ["full", "incremental"]) {
    const rows = samples.filter((sample) => sample.mode === mode);
    if (rows.length === 0) continue;
    const durations = rows.map((row) => row.duration_ms).sort((a, b) => a - b);
    groups[mode] = {
      n: rows.length,
      p50_ms: percentile(durations, 0.5),
      p95_ms: percentile(durations, 0.95),
      oracle_agreement: ratio(rows.filter((row) => row.oracle_match === true).length, rows.length),
      environments: [...new Set(rows.map((row) => row.environment_id))].sort(),
    };
  }
  return { n: samples.length, by_mode: groups };
}
