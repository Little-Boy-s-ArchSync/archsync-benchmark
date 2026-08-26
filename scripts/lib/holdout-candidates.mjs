import { createHash } from "node:crypto";

export const EVAL_102_PERMISSIVE_LICENSES = Object.freeze([
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "MIT",
]);

export const EVAL_102_PATTERN_KINDS = Object.freeze(["http", "data", "cache", "message"]);

const permissiveLicenses = new Set(EVAL_102_PERMISSIVE_LICENSES);
const patternKinds = new Set(EVAL_102_PATTERN_KINDS);

function object(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function fullSha(value) {
  return /^[0-9a-f]{40}$/u.test(value ?? "");
}

function utcTimestamp(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value) && Number.isFinite(Date.parse(value));
}

function safePath(value) {
  return nonEmpty(value) && !value.startsWith("/") && !value.includes("\\") && !value.split("/").includes("..") && !value.split("/").includes("");
}

function repositoryParts(url) {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)$/u.exec(url ?? "");
  return match ? { owner: match[1], repository: match[2] } : null;
}

function pinnedBlobUrl(repositoryUrl, commit, path) {
  return `${repositoryUrl}/blob/${commit}/${path}`;
}

function integerAtLeast(value, minimum) {
  return Number.isInteger(value) && value >= minimum;
}

function candidateIssues(candidate, index, state) {
  const issues = [];
  const prefix = `candidates[${index}]`;
  if (!object(candidate)) return [`${prefix} must be an object`];

  if (!integerAtLeast(candidate.rank, 1) || candidate.rank > 10) issues.push(`${prefix}.rank must be an integer from 1 through 10`);
  if (!nonEmpty(candidate.id)) issues.push(`${prefix}.id is required`);
  if (!nonEmpty(candidate.name)) issues.push(`${prefix}.name is required`);
  const parts = repositoryParts(candidate.canonical_url);
  if (!parts) issues.push(`${prefix}.canonical_url must be an exact GitHub repository URL`);
  if (!nonEmpty(candidate.default_branch)) issues.push(`${prefix}.default_branch is required`);
  if (!fullSha(candidate.observed_default_branch_commit_sha)) issues.push(`${prefix}.observed_default_branch_commit_sha must be a full SHA`);
  if (!utcTimestamp(candidate.retrieved_at)) issues.push(`${prefix}.retrieved_at must be a second-precision UTC timestamp`);
  if (candidate.primary_language !== "TypeScript") issues.push(`${prefix}.primary_language must be TypeScript`);
  if (candidate.prior_tuning_leakage_status !== "unknown-needs-human-check") issues.push(`${prefix}.prior_tuning_leakage_status must remain human-gated`);
  if (candidate.selection_decision !== "not-evaluated-human-gated") issues.push(`${prefix}.selection_decision must remain human-gated`);
  if (!nonEmpty(candidate.rationale)) issues.push(`${prefix}.rationale is required`);
  if (!Array.isArray(candidate.risks) || candidate.risks.length === 0 || candidate.risks.some((risk) => !nonEmpty(risk))) issues.push(`${prefix}.risks must contain non-empty entries`);

  if (nonEmpty(candidate.id)) {
    if (state.ids.has(candidate.id)) issues.push(`${prefix}.id must be unique`);
    state.ids.add(candidate.id);
  }
  if (parts) {
    const canonicalId = `${parts.owner}/${parts.repository}`;
    if (candidate.id !== canonicalId) issues.push(`${prefix}.id must match canonical_url`);
    if (state.urls.has(candidate.canonical_url)) issues.push(`${prefix}.canonical_url must be unique`);
    state.urls.add(candidate.canonical_url);
    if (candidate.github_api_repository_url !== `https://api.github.com/repos/${canonicalId}`) issues.push(`${prefix}.github_api_repository_url must match canonical_url`);
    if (candidate.github_api_head_url !== `https://api.github.com/repos/${canonicalId}/commits/${candidate.default_branch}`) issues.push(`${prefix}.github_api_head_url must bind the observed default branch`);
  }

  const snapshot = candidate.github_snapshot;
  if (!object(snapshot)) {
    issues.push(`${prefix}.github_snapshot is required`);
  } else {
    for (const field of ["size_kib_approx", "stars", "forks", "open_issues"]) {
      if (!integerAtLeast(snapshot[field], 0)) issues.push(`${prefix}.github_snapshot.${field} must be a non-negative integer`);
    }
    for (const field of ["pushed_at", "updated_at", "default_branch_commit_committed_at"]) {
      if (!utcTimestamp(snapshot[field])) issues.push(`${prefix}.github_snapshot.${field} must be a second-precision UTC timestamp`);
    }
    for (const field of ["archived", "disabled", "fork"]) {
      if (snapshot[field] !== false) issues.push(`${prefix}.github_snapshot.${field} must be false`);
    }
  }

  const license = candidate.license;
  if (!object(license)) {
    issues.push(`${prefix}.license is required`);
  } else {
    if (!permissiveLicenses.has(license.spdx_id)) issues.push(`${prefix}.license.spdx_id must be an allowlisted permissive license`);
    if (!safePath(license.path)) issues.push(`${prefix}.license.path must be a safe tracked path`);
    if (!fullSha(license.blob_sha)) issues.push(`${prefix}.license.blob_sha must be a full Git blob SHA`);
    if (parts && license.api_url !== `https://api.github.com/repos/${parts.owner}/${parts.repository}/license`) issues.push(`${prefix}.license.api_url must be the GitHub license endpoint`);
    if (parts && fullSha(candidate.observed_default_branch_commit_sha) && safePath(license.path) && license.file_url !== pinnedBlobUrl(candidate.canonical_url, candidate.observed_default_branch_commit_sha, license.path)) {
      issues.push(`${prefix}.license.file_url must be immutable and commit-pinned`);
    }
  }

  const topology = candidate.package_topology;
  if (!object(topology)) {
    issues.push(`${prefix}.package_topology is required`);
  } else {
    if (!/^(npm|pnpm|yarn)@\S+$/u.test(topology.package_manager ?? "")) issues.push(`${prefix}.package_topology.package_manager must be an exact npm, pnpm, or yarn version`);
    if (topology.monorepo !== true) issues.push(`${prefix}.package_topology.monorepo must be true`);
    if (!Array.isArray(topology.manifest_urls) || topology.manifest_urls.length < 2) {
      issues.push(`${prefix}.package_topology.manifest_urls must contain at least two immutable links`);
    } else {
      const expectedPrefix = `${candidate.canonical_url}/blob/${candidate.observed_default_branch_commit_sha}/`;
      if (topology.manifest_urls.some((url) => !nonEmpty(url) || !url.startsWith(expectedPrefix))) issues.push(`${prefix}.package_topology.manifest_urls must be commit-pinned to the candidate`);
      if (!topology.manifest_urls.some((url) => url.endsWith("/package.json"))) issues.push(`${prefix}.package_topology.manifest_urls must include package.json`);
      if (new Set(topology.manifest_urls).size !== topology.manifest_urls.length) issues.push(`${prefix}.package_topology.manifest_urls must be unique`);
    }
    if (!nonEmpty(topology.signals)) issues.push(`${prefix}.package_topology.signals is required`);
  }

  if (!Array.isArray(candidate.architecture_evidence) || candidate.architecture_evidence.length < 2) {
    issues.push(`${prefix}.architecture_evidence must contain at least two records`);
  } else {
    const observedKinds = new Set();
    const sourceUrls = new Set();
    candidate.architecture_evidence.forEach((evidence, evidenceIndex) => {
      const evidencePrefix = `${prefix}.architecture_evidence[${evidenceIndex}]`;
      if (!object(evidence)) {
        issues.push(`${evidencePrefix} must be an object`);
        return;
      }
      if (!patternKinds.has(evidence.kind)) issues.push(`${evidencePrefix}.kind is unsupported`);
      else observedKinds.add(evidence.kind);
      const expectedPrefix = `${candidate.canonical_url}/blob/${candidate.observed_default_branch_commit_sha}/`;
      if (!nonEmpty(evidence.source_url) || !evidence.source_url.startsWith(expectedPrefix)) issues.push(`${evidencePrefix}.source_url must be commit-pinned to the candidate`);
      if (sourceUrls.has(evidence.source_url)) issues.push(`${evidencePrefix}.source_url must be unique`);
      sourceUrls.add(evidence.source_url);
      if (!fullSha(evidence.source_blob_sha)) issues.push(`${evidencePrefix}.source_blob_sha must be a full Git blob SHA`);
      if (!nonEmpty(evidence.observation)) issues.push(`${evidencePrefix}.observation is required`);
    });
    if (observedKinds.size < 2) issues.push(`${prefix}.architecture_evidence must cover at least two supported pattern kinds`);
  }

  return issues;
}

export function validateHoldoutCandidateInventory(inventory) {
  if (!object(inventory)) return ["candidate inventory must be an object"];
  const issues = [];
  if (inventory.schema_version !== 1) issues.push("schema_version must equal 1");
  if (inventory.task_id !== "EVAL-102") issues.push("task_id must equal EVAL-102");
  if (inventory.artifact_kind !== "ranked-candidate-inventory") issues.push("artifact_kind must identify a ranked candidate inventory");
  if (inventory.status !== "candidate-only-not-selected") issues.push("status must remain candidate-only-not-selected");
  for (const field of ["selection_authorized", "freeze_authorized", "ground_truth_collected"]) {
    if (inventory[field] !== false) issues.push(`${field} must be false`);
  }
  if (!utcTimestamp(inventory.snapshot_completed_at)) issues.push("snapshot_completed_at must be a second-precision UTC timestamp");
  if (!nonEmpty(inventory.ranking_method)) issues.push("ranking_method is required");
  if (!Array.isArray(inventory.blockers) || inventory.blockers.length === 0 || inventory.blockers.some((blocker) => !nonEmpty(blocker))) issues.push("blockers must contain non-empty human-gate descriptions");
  if (!object(inventory.automation_status)) {
    issues.push("automation_status is required");
  } else {
    if (inventory.automation_status.github_api_access !== "completed-authenticated") issues.push("automation_status must record completed authenticated GitHub API access");
    if (inventory.automation_status.billing_blocked !== false) issues.push("candidate discovery billing_blocked must be false");
    if (!nonEmpty(inventory.automation_status.billing_note)) issues.push("automation_status.billing_note is required");
  }
  if (!Array.isArray(inventory.candidates)) return [...issues, "candidates must be an array"];
  if (inventory.candidates.length !== 10) issues.push("candidate inventory must contain exactly 10 candidates");

  const state = { ids: new Set(), urls: new Set() };
  inventory.candidates.forEach((candidate, index) => issues.push(...candidateIssues(candidate, index, state)));
  const ranks = new Set(inventory.candidates.filter(object).map((candidate) => candidate.rank));
  if (ranks.size !== 10 || !Array.from({ length: 10 }, (_, index) => index + 1).every((rank) => ranks.has(rank))) issues.push("candidate ranks must be unique and contiguous from 1 through 10");
  return issues;
}

export function summarizeHoldoutCandidateInventory(inventory) {
  const issues = validateHoldoutCandidateInventory(inventory);
  if (issues.length > 0) throw new Error(`EVAL_102_CANDIDATE_INVENTORY_INVALID: ${issues.join("; ")}`);
  const licenseCounts = Object.fromEntries(EVAL_102_PERMISSIVE_LICENSES.map((license) => [license, inventory.candidates.filter((candidate) => candidate.license.spdx_id === license).length]).filter(([, count]) => count > 0));
  const patternCounts = Object.fromEntries(EVAL_102_PATTERN_KINDS.map((kind) => [kind, inventory.candidates.filter((candidate) => candidate.architecture_evidence.some((evidence) => evidence.kind === kind)).length]));
  return {
    schema_version: 1,
    task_id: "EVAL-102",
    validation: "PASS_CANDIDATE_ONLY",
    inventory_sha256: createHash("sha256").update(JSON.stringify(inventory)).digest("hex"),
    validated_candidates: inventory.candidates.length,
    licenses: licenseCounts,
    candidates_with_pattern: patternCounts,
    ranked_targets: inventory.candidates.map((candidate) => ({ rank: candidate.rank, url: candidate.canonical_url, head: candidate.observed_default_branch_commit_sha })),
    selection_authorized: false,
    freeze_authorized: false,
    ground_truth_collected: false,
    automation_status: structuredClone(inventory.automation_status),
    human_gates_remaining: inventory.blockers,
  };
}
