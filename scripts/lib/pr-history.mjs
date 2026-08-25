import { createHash } from "node:crypto";

function object(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function sha(value) {
  return /^[0-9a-f]{64}$/u.test(value);
}

function commit(value) {
  return /^[0-9a-f]{40}$/u.test(value);
}

function safePath(value) {
  return nonEmpty(value) && !value.startsWith("/") && !/^[A-Za-z]:/u.test(value) && !value.includes("\\") && !value.split("/").includes("..") && !value.split("/").includes("");
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (object(value)) return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

function digest(value) {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function validRepository(repository) {
  return object(repository) && /^https:\/\/github\.com\/[^/]+\/[^/]+$/u.test(repository.url) && commit(repository.commit) && sha(repository.tree_sha256);
}

function validPrRange(range) {
  return object(range) && Number.isInteger(range.first) && Number.isInteger(range.last) && Number.isInteger(range.expected_count) && range.first >= 1 && range.last >= range.first && range.expected_count >= 1;
}

function validEnvironment(environment) {
  return object(environment) && nonEmpty(environment.id) && nonEmpty(environment.os) && nonEmpty(environment.node) && nonEmpty(environment.pnpm) && nonEmpty(environment.cpu) && Number.isInteger(environment.memory_bytes) && environment.memory_bytes >= 1;
}

export function createPrHistoryApprovalScopeSha256(manifest) {
  if (!object(manifest) || !validRepository(manifest.repository) || !validPrRange(manifest.pr_range) || !validEnvironment(manifest.environment)) throw new Error("PR_HISTORY_APPROVAL_SCOPE_INVALID");
  return digest({ repository: manifest.repository, pr_range: manifest.pr_range, environment: manifest.environment });
}

export function validatePrHistoryManifest(manifest) {
  const issues = [];
  if (!object(manifest)) return ["PR-history manifest must be an object"];
  if (manifest.schema_version !== 1) issues.push("schema_version must equal 1");
  if (!["synthetic-provisional", "approved-real-system"].includes(manifest.status)) issues.push("status must be synthetic-provisional or approved-real-system");
  if (typeof manifest.synthetic !== "boolean" || (manifest.status === "synthetic-provisional") !== (manifest.synthetic === true)) issues.push("synthetic flag and status must agree");
  const repositoryValid = validRepository(manifest.repository);
  const rangeValid = validPrRange(manifest.pr_range);
  const environmentValid = validEnvironment(manifest.environment);
  if (!repositoryValid) issues.push("repository URL, full commit, and tree hash are required");
  if (!rangeValid) issues.push("PR range must be non-empty and ordered");
  if (!environmentValid) issues.push("environment must pin ID, OS, Node, pnpm, CPU, and memory");
  if (manifest.synthetic === true && manifest.approval !== null) issues.push("synthetic manifest approval must be null");
  if (manifest.synthetic === false && (!object(manifest.approval) || manifest.approval.actor_type !== "human" || manifest.approval.decision !== "approved" || !nonEmpty(manifest.approval.reviewer_id) || !Number.isFinite(Date.parse(manifest.approval.approved_at)) || !sha(manifest.approval.sha256) || (repositoryValid && rangeValid && environmentValid && manifest.approval.sha256 !== createPrHistoryApprovalScopeSha256(manifest)))) issues.push("real-system extraction requires human approval bound to the exact repository, PR range, and environment");
  return issues;
}

function validatePullRequests(rows, range) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("PR_HISTORY_EMPTY_EXTRACTION");
  if (rows.length !== range.expected_count) throw new Error("PR_HISTORY_COUNT_MISMATCH");
  const numbers = new Set();
  for (const row of rows) {
    if (!object(row) || !Number.isInteger(row.number) || row.number < range.first || row.number > range.last || numbers.has(row.number) || !commit(row.base_commit) || !commit(row.merged_commit) || !Array.isArray(row.changed_files) || row.changed_files.length === 0 || !row.changed_files.every(safePath) || !Number.isFinite(Date.parse(row.opened_at)) || !Number.isFinite(Date.parse(row.merged_at)) || Date.parse(row.merged_at) < Date.parse(row.opened_at)) throw new Error("PR_HISTORY_INVALID_ROW");
    numbers.add(row.number);
  }
}

export async function runPrHistoryReplay({ manifest, extract, analyze }) {
  const issues = validatePrHistoryManifest(manifest);
  if (issues.length > 0 || typeof extract !== "function" || typeof analyze !== "function") throw new Error(`PR_HISTORY_INPUT_INVALID: ${issues.join("; ")}`);
  const passes = [];
  for (let pass = 1; pass <= 2; pass += 1) {
    const extracted = await extract({ repository: structuredClone(manifest.repository), pr_range: structuredClone(manifest.pr_range), pass });
    validatePullRequests(extracted, manifest.pr_range);
    const normalized = await analyze(structuredClone(extracted), { environment: structuredClone(manifest.environment), pass });
    if (!object(normalized) || Object.keys(normalized).length === 0) throw new Error("PR_HISTORY_ANALYSIS_EMPTY");
    passes.push({ pass, extraction_sha256: digest(extracted), normalized_sha256: digest(normalized) });
  }
  const deterministic = passes[0].extraction_sha256 === passes[1].extraction_sha256 && passes[0].normalized_sha256 === passes[1].normalized_sha256;
  return {
    schema_version: 1,
    status: deterministic ? (manifest.synthetic ? "SYNTHETIC_REPLAY_COMPLETE" : "PREPARATORY_REAL_REPLAY_COMPLETE") : "BLOCKED_NONDETERMINISTIC",
    deterministic,
    claims_allowed: false,
    manifest_sha256: digest(manifest),
    repository: structuredClone(manifest.repository),
    pr_range: structuredClone(manifest.pr_range),
    environment: structuredClone(manifest.environment),
    passes,
  };
}

export function createPrHistoryPreparation(manifest, fixture, runnerSource) {
  const issues = validatePrHistoryManifest(manifest);
  if (issues.length > 0 || manifest.synthetic !== true || !Array.isArray(fixture) || fixture.length === 0 || !nonEmpty(runnerSource)) throw new Error("PR_HISTORY_PREPARATION_INVALID");
  return {
    schema_version: 1,
    status: "synthetic-preparatory",
    claims_allowed: false,
    human_approval: null,
    manifest_sha256: digest(manifest),
    fixture_sha256: digest(fixture),
    runner_sha256: createHash("sha256").update(runnerSource).digest("hex"),
  };
}
