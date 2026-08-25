import { createHash } from "node:crypto";

const CONDITIONS = new Set(["grounded", "llm-only"]);
const RUN_STATUSES = new Set(["completed", "failed", "cancelled"]);
const SAFETY_LABELS = new Set(["attack", "hard-negative"]);
const SAFETY_CATEGORIES = new Set([
  "source-instruction",
  "fake-evidence",
  "path-traversal",
  "oversized-context",
  "poisoned-architecture",
  "verification-bypass",
]);

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

function ratio(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

function median(values) {
  if (values.length === 0) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0 ? (ordered[middle - 1] + ordered[middle]) / 2 : ordered[middle];
}

export function validateRunManifest(manifest) {
  const issues = [];
  if (!object(manifest)) return ["run manifest must be an object"];
  if (manifest.schema_version !== 1) issues.push("schema_version must equal 1");
  for (const key of ["run_id", "provider", "model", "model_version", "prompt_version", "started_at", "request_sha256", "config_sha256"]) {
    if (!nonEmpty(manifest[key])) issues.push(`${key} is required`);
  }
  if (!CONDITIONS.has(manifest.condition)) issues.push("condition must be grounded or llm-only");
  if (!RUN_STATUSES.has(manifest.status)) issues.push("status must be completed, failed or cancelled");
  if (!/^[0-9a-f]{64}$/u.test(manifest.request_sha256 ?? "")) issues.push("request_sha256 must be SHA-256");
  if (!/^[0-9a-f]{64}$/u.test(manifest.config_sha256 ?? "")) issues.push("config_sha256 must be SHA-256");
  if (!Number.isInteger(manifest.retries) || manifest.retries < 0) issues.push("retries must be a non-negative integer");
  for (const key of ["input_tokens", "output_tokens", "latency_ms", "cost_usd"]) {
    if (!Number.isFinite(manifest[key]) || manifest[key] < 0) issues.push(`${key} must be a non-negative number`);
  }
  if (manifest.condition === "grounded" && (!Array.isArray(manifest.evidence_ids) || manifest.evidence_ids.length === 0)) {
    issues.push("grounded runs require evidence_ids");
  }
  if (!object(manifest.redaction) || manifest.redaction.passed !== true || !/^[0-9a-f]{64}$/u.test(manifest.redaction.audit_sha256 ?? "")) {
    issues.push("a passing redaction audit hash is required");
  }
  if ("api_key" in manifest || "authorization" in manifest) issues.push("credentials must never appear in a run manifest");
  if (manifest.status === "completed" && (!nonEmpty(manifest.ended_at) || !nonEmpty(manifest.raw_response_path))) {
    issues.push("completed runs require end time and raw response path");
  }
  if (manifest.status !== "completed" && !nonEmpty(manifest.error_class)) issues.push("failed/cancelled runs require error_class");
  return issues;
}

export function validateSafetyCorpus(corpus) {
  const issues = [];
  if (!object(corpus)) return ["safety corpus must be an object"];
  if (corpus.schema_version !== 1) issues.push("schema_version must equal 1");
  if (!Array.isArray(corpus.cases) || corpus.cases.length === 0) return [...issues, "cases must be a non-empty array"];
  const ids = new Set();
  const labels = new Set();
  const categories = new Set();
  corpus.cases.forEach((item, index) => {
    if (!object(item)) {
      issues.push(`case ${index} must be an object`);
      return;
    }
    if (!nonEmpty(item.id) || ids.has(item.id)) issues.push(`case ${index} id must be unique`);
    else ids.add(item.id);
    if (!SAFETY_LABELS.has(item.label)) issues.push(`case ${index} has unsupported label`);
    else labels.add(item.label);
    if (!SAFETY_CATEGORIES.has(item.category)) issues.push(`case ${index} has unsupported category`);
    else categories.add(item.category);
    if (!nonEmpty(item.content)) issues.push(`case ${index} content is required`);
    if (!object(item.expected) || item.expected.hard_decision_unchanged !== true || !nonEmpty(item.expected.disposition)) {
      issues.push(`case ${index} requires a safe expected disposition`);
    }
  });
  for (const label of SAFETY_LABELS) {
    if (!labels.has(label)) issues.push(`corpus requires ${label} cases`);
  }
  for (const category of SAFETY_CATEGORIES) {
    if (!categories.has(category)) issues.push(`corpus requires category ${category}`);
  }
  return issues;
}

function wilsonInterval(numerator, denominator, z) {
  const observed = numerator / denominator;
  const z2 = z * z;
  const denominatorAdjusted = 1 + z2 / denominator;
  const center = (observed + z2 / (2 * denominator)) / denominatorAdjusted;
  const margin = z * Math.sqrt((observed * (1 - observed) + z2 / (4 * denominator)) / denominator) / denominatorAdjusted;
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

export function calculateUnsupportedClaimRate(rows, adjudications = [], z = 1.96) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("claim reviews are required");
  if (!Number.isFinite(z) || z <= 0) throw new Error("z must be positive");
  const byClaim = new Map();
  const seen = new Set();
  for (const row of rows) {
    if (!object(row) || !nonEmpty(row.claim_id) || !nonEmpty(row.reviewer_id) || typeof row.unsupported !== "boolean" || row.blind !== true) {
      throw new Error("invalid blind claim review");
    }
    const key = `${row.claim_id}\0${row.reviewer_id}`;
    if (seen.has(key)) throw new Error("duplicate claim review");
    seen.add(key);
    const values = byClaim.get(row.claim_id) ?? [];
    values.push(row);
    byClaim.set(row.claim_id, values);
  }
  const decisions = new Map();
  for (const item of adjudications) {
    if (!object(item) || !nonEmpty(item.claim_id) || typeof item.final_unsupported !== "boolean" || item.actor_type !== "human" || decisions.has(item.claim_id)) {
      throw new Error("invalid claim adjudication");
    }
    decisions.set(item.claim_id, item.final_unsupported);
  }
  let agreements = 0;
  let unsupported = 0;
  for (const [claimId, reviews] of byClaim) {
    if (reviews.length !== 2 || reviews[0].reviewer_id === reviews[1].reviewer_id) throw new Error(`${claimId} requires two reviewers`);
    const agrees = reviews[0].unsupported === reviews[1].unsupported;
    if (agrees) agreements += 1;
    if (!agrees && !decisions.has(claimId)) throw new Error(`${claimId} requires human adjudication`);
    const decision = agrees ? reviews[0].unsupported : decisions.get(claimId);
    if (decision) unsupported += 1;
  }
  return {
    claims: byClaim.size,
    reviewer_agreement: ratio(agreements, byClaim.size),
    unsupported,
    rate: ratio(unsupported, byClaim.size),
    confidence_interval: wilsonInterval(unsupported, byClaim.size, z),
    method: `Wilson score interval (z=${z})`,
  };
}

export function calculateRepairMetrics(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("repair rows are required");
  const ids = new Set();
  let attempted = 0;
  let successful = 0;
  let regressions = 0;
  let inconclusive = 0;
  for (const row of rows) {
    if (!object(row) || !nonEmpty(row.candidate_id) || ids.has(row.candidate_id) || typeof row.attempted !== "boolean") {
      throw new Error("invalid or duplicate repair row");
    }
    ids.add(row.candidate_id);
    if (!row.attempted) {
      inconclusive += 1;
      continue;
    }
    attempted += 1;
    const success = row.decision === "ACCEPTABLE_FOR_REVIEW" && row.patch_applied === true && row.tests_passed === true && row.conformance_passed === true;
    if (success) successful += 1;
    if (Number.isInteger(row.new_regressions) && row.new_regressions > 0) regressions += 1;
    if (row.decision === "INCONCLUSIVE") inconclusive += 1;
  }
  return {
    n: rows.length,
    attempted,
    successful,
    repair_success_rate: ratio(successful, rows.length),
    attempted_repair_success_rate: ratio(successful, attempted),
    regressions,
    regression_rate: ratio(regressions, attempted),
    inconclusive,
  };
}

export function summarizeAblationRuns(runs) {
  if (!Array.isArray(runs) || runs.length === 0) throw new Error("ablation runs are required");
  const ids = new Set();
  const grouped = new Map();
  for (const run of runs) {
    if (!object(run) || !nonEmpty(run.run_id) || ids.has(run.run_id) || !CONDITIONS.has(run.condition) || !RUN_STATUSES.has(run.status) || !nonEmpty(run.config_sha256)) {
      throw new Error("invalid or duplicate ablation run");
    }
    ids.add(run.run_id);
    if (run.status === "completed" && (!["correct", "incorrect"].includes(run.correctness) || !Number.isInteger(run.claims) || run.claims < 0 || !Number.isInteger(run.unsupported_claims) || run.unsupported_claims < 0 || run.unsupported_claims > run.claims || !Number.isFinite(run.latency_ms) || run.latency_ms < 0 || !Number.isFinite(run.tokens) || run.tokens < 0 || !Number.isFinite(run.cost_usd) || run.cost_usd < 0)) {
      throw new Error("completed ablation run has invalid metrics");
    }
    const rows = grouped.get(run.condition) ?? [];
    rows.push(run);
    grouped.set(run.condition, rows);
  }
  const result = {};
  for (const condition of [...grouped.keys()].sort()) {
    const rows = grouped.get(condition);
    const completed = rows.filter((row) => row.status === "completed");
    const claims = completed.reduce((sum, row) => sum + row.claims, 0);
    const unsupported = completed.reduce((sum, row) => sum + row.unsupported_claims, 0);
    result[condition] = {
      n: rows.length,
      completed: completed.length,
      failures: rows.length - completed.length,
      config_hashes: [...new Set(rows.map((row) => row.config_sha256))].sort(),
      correctness_rate: ratio(completed.filter((row) => row.correctness === "correct").length, rows.length),
      unsupported_claim_rate: ratio(unsupported, claims),
      median_latency_ms: median(completed.map((row) => row.latency_ms)),
      total_tokens: completed.reduce((sum, row) => sum + row.tokens, 0),
      total_cost_usd: completed.reduce((sum, row) => sum + row.cost_usd, 0),
    };
  }
  return result;
}

export function createPreparedEvidenceManifest(metadata, artifacts) {
  if (!object(metadata) || metadata.status !== "prepared" || !nonEmpty(metadata.protocol_version) || !/^[0-9a-f]{40}$/u.test(metadata.code_commit ?? "") || metadata.human_approval !== null) {
    throw new Error("prepared metadata must be unhashed, unapproved technical scaffolding");
  }
  if (!object(artifacts) || Object.keys(artifacts).length === 0) throw new Error("evidence artifacts are required");
  const files = Object.entries(artifacts).sort(([a], [b]) => a.localeCompare(b)).map(([file, content]) => ({
    file,
    sha256: sha256(typeof content === "string" ? content : Buffer.from(content)),
  }));
  return {
    schema_version: 1,
    metadata: structuredClone(metadata),
    files,
    manifest_sha256: sha256(stable({ metadata, files })),
  };
}

export function verifyPreparedEvidenceManifest(manifest, artifacts) {
  if (!object(manifest)) return false;
  try {
    return stable(createPreparedEvidenceManifest(manifest.metadata, artifacts)) === stable(manifest);
  } catch {
    return false;
  }
}
