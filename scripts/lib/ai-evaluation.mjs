import { createHash } from "node:crypto";

const CONDITIONS = new Set(["grounded", "llm-only"]);
const GUARDIAN_RUN_STATUSES = new Set(["success", "failed"]);
const PROVIDER_FAILURE_KINDS = new Set(["timeout", "rate-limit", "quota", "budget", "invalid-response", "provider", "cancelled"]);
const SAFETY_LABELS = new Set(["attack", "hard-negative"]);
const SAFETY_CATEGORIES = new Set([
  "source-instruction",
  "fake-evidence",
  "path-traversal",
  "oversized-context",
  "poisoned-architecture",
  "verification-bypass",
]);
const REVIEW_CONDITIONS = new Set(["manual", "grounded", "llm-only"]);
const REVIEW_CORRECTNESS = new Set(["correct", "incorrect", "uncertain"]);
const REPAIR_DECISIONS = new Set([
  "ACCEPTABLE_FOR_REVIEW",
  "REJECT_TEST",
  "REJECT_CONFORMANCE",
  "REJECT_UNSAFE",
  "INCONCLUSIVE",
]);
const REPAIR_CANDIDATE_STATUSES = new Set(["PROPOSED", "VERIFIED_FOR_REVIEW"]);
const REPAIR_ISOLATION_STATUSES = new Set(["APPROVED", "TEST_ONLY", "REJECTED"]);

export const GUARDIAN_RUN_MANIFEST_SOURCE = Object.freeze({
  schema_version: 1,
  guardian_integration_pr: "https://github.com/Little-Boy-s-ArchSync/archsync-guardian/pull/8",
  guardian_integration_commit: "5ac01f1fa5b008103f274612b9aa9f602b111fae",
  contract_path: "src/reasoner/provider.ts",
  contract_sha256: "7d6c0b8c8e1b3c426cbb640ee497c6397cd9d9a7871ec930652a7750c5f4c4b0",
  contract: "Guardian RunManifest schema_version 1",
  repair_contract: Object.freeze({
    candidate_path: "src/reasoner/contracts.ts",
    candidate_sha256: "11276a3f9c40fcc66739ed5649bf5e39b1fa7f7f099c9ea8e7a0356a81c7ce41",
    verification_path: "src/repair-verification.ts",
    verification_sha256: "090558f0323bdaed3f991dfa6426ed49b98b8e490a39a2b7ce004bce7927fd2d",
    isolation_path: "src/repair-isolation.ts",
    isolation_sha256: "4afa9b389bdd02e69376d414415cf9c17abdb1d0cd98d973e98f82414a38d5b8",
    handoff_path: "src/reasoner/handoff.ts",
    handoff_sha256: "c3f0db14370b3b7dcb7ad7bb2727602139db0aea4c4086fcb0d83ce6d9e9a1e5",
    schema_path: "specs/repair-candidate.schema.json",
    schema_sha256: "5cf3e4bd1281869b4eb08e7ba5029385f0d47f4a957563ae50ff2ceb75135437",
    candidate_contract: "Guardian RepairCandidate 0.1.0-preparatory",
    isolation_contract: "Guardian repair isolation attestation 1.0.0-preparatory",
  }),
});

export const PHASE4_PREPARED_ARTIFACTS = Object.freeze([
  "ai-safety/corpus.json",
  "evidence/ai/README.md",
  "evidence/ai/claim-adjudication.template.jsonl",
  "evidence/ai/claim-review.template.jsonl",
  "evidence/ai/guardian-run-manifest-source.json",
  "evidence/ai/model-config.template.json",
  "evidence/ai/phase-4-closure.template.json",
  "evidence/ai/run-manifest.template.json",
  "scripts/lib/ai-evaluation.mjs",
  "scripts/validate-ai-evaluation.mjs",
  "test/ai-evaluation.test.mjs",
]);

export const PHASE4_CLOSURE_GATES = Object.freeze([
  "real_provider_run",
  "provider_config_frozen",
  "dataset_frozen",
  "human_review_complete",
  "security_approved",
  "statistical_plan_frozen",
  "safety_corpus_passed",
  "metrics_reproduced",
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

function sha(value) {
  return /^[0-9a-f]{64}$/u.test(value);
}

export function validateGuardianRunManifest(manifest) {
  const issues = [];
  if (!object(manifest)) return ["Guardian run manifest must be an object"];
  if (manifest.schema_version !== 1) issues.push("schema_version must equal Guardian contract 1");
  for (const key of ["run_id", "provider", "model", "prompt_version", "started_at", "finished_at", "raw_response_path"]) {
    if (!nonEmpty(manifest[key])) issues.push(`${key} is required by the Guardian run contract`);
  }
  if (!sha(manifest.request_hash)) issues.push("request_hash must be SHA-256");
  if (!Number.isFinite(manifest.temperature) || manifest.temperature < 0) issues.push("temperature must be non-negative and finite");
  if (manifest.seed !== undefined && !Number.isSafeInteger(manifest.seed)) issues.push("seed must be a safe integer when present");
  if (!Number.isSafeInteger(manifest.attempts) || manifest.attempts < 0) issues.push("attempts must be a non-negative safe integer");
  if (!object(manifest.tokens) || !Number.isSafeInteger(manifest.tokens.input) || manifest.tokens.input < 0 || !Number.isSafeInteger(manifest.tokens.output) || manifest.tokens.output < 0) {
    issues.push("tokens must contain non-negative safe integer input and output values");
  }
  if (!Number.isFinite(manifest.cost_usd) || manifest.cost_usd < 0) issues.push("cost_usd must be non-negative");
  if (!GUARDIAN_RUN_STATUSES.has(manifest.status)) issues.push("status must be success or failed");
  if (!Array.isArray(manifest.failures)) issues.push("failures must be an array");
  else {
    manifest.failures.forEach((failure, index) => {
      if (!object(failure) || !Number.isInteger(failure.attempt) || failure.attempt < 0 || failure.attempt > manifest.attempts || (failure.attempt === 0 && !["budget", "cancelled"].includes(failure.kind)) || !PROVIDER_FAILURE_KINDS.has(failure.kind) || !nonEmpty(failure.message)) {
        issues.push(`failure ${index} does not match the Guardian failure contract`);
      }
    });
    if (manifest.status === "failed" && manifest.failures.length === 0) issues.push("failed runs require a failure record");
    if (manifest.status === "success" && manifest.attempts < 1) issues.push("successful runs require at least one attempt");
  }
  if ("api_key" in manifest || "authorization" in manifest) issues.push("credentials must never appear in a run manifest");
  return issues;
}

function validateBenchmarkExtension(extension) {
  const issues = [];
  if (!object(extension)) return ["benchmark extension is required"];
  if (!CONDITIONS.has(extension.condition)) issues.push("benchmark.condition must be grounded or llm-only");
  if (!nonEmpty(extension.model_version)) issues.push("benchmark.model_version is required");
  if (!sha(extension.config_sha256)) issues.push("benchmark.config_sha256 must be SHA-256");
  if (!Number.isFinite(extension.latency_ms) || extension.latency_ms < 0) issues.push("benchmark.latency_ms must be non-negative");
  if (!Array.isArray(extension.evidence_ids) || (extension.condition === "grounded" && extension.evidence_ids.length === 0) || extension.evidence_ids.some((item) => !nonEmpty(item))) {
    issues.push("benchmark.evidence_ids are invalid");
  }
  if (!object(extension.redaction) || extension.redaction.passed !== true || !sha(extension.redaction.audit_sha256)) {
    issues.push("benchmark redaction audit must pass and be hash-bound");
  }
  return issues;
}

export function createBenchmarkRunManifest(guardianManifest, benchmarkExtension) {
  const issues = [...validateGuardianRunManifest(guardianManifest), ...validateBenchmarkExtension(benchmarkExtension)];
  if (issues.length > 0) throw new Error(issues.join("; "));
  return { ...structuredClone(guardianManifest), benchmark: structuredClone(benchmarkExtension) };
}

export function validateRunManifest(manifest) {
  if (!object(manifest)) return ["run manifest must be an object"];
  return [...validateGuardianRunManifest(manifest), ...validateBenchmarkExtension(manifest.benchmark)];
}

export function validateHumanReviewRubric(rows) {
  const issues = [];
  if (!Array.isArray(rows) || rows.length === 0) return ["review rubric rows are required"];
  const seen = new Set();
  rows.forEach((row, index) => {
    if (!object(row)) {
      issues.push(`review ${index} must be an object`);
      return;
    }
    const key = `${row.run_id}\0${row.claim_id}\0${row.reviewer_id}`;
    if (!["run_id", "case_id", "claim_id", "reviewer_id"].every((field) => nonEmpty(row[field])) || seen.has(key)) issues.push(`review ${index} requires unique run/case/claim/reviewer IDs`);
    else seen.add(key);
    if (!REVIEW_CONDITIONS.has(row.condition)) issues.push(`review ${index} has an invalid condition`);
    if (row.blind !== true || row.training_case !== false) issues.push(`review ${index} must be blind and outside training cases`);
    if (!REVIEW_CORRECTNESS.has(row.correctness)) issues.push(`review ${index} has invalid correctness`);
    for (const dimension of ["completeness", "actionability", "citation_quality"]) {
      if (!Number.isInteger(row[dimension]) || row[dimension] < 1 || row[dimension] > 5) issues.push(`review ${index} ${dimension} must be 1..5`);
    }
    if (typeof row.unsupported !== "boolean" || typeof row.manual_baseline !== "boolean" || typeof row.saw_ai_output !== "boolean") issues.push(`review ${index} requires unsupported/manual/AI booleans`);
    if ((row.manual_baseline && (row.condition !== "manual" || row.saw_ai_output)) || (!row.manual_baseline && row.condition === "manual")) {
      issues.push(`review ${index} has an invalid manual baseline boundary`);
    }
    const started = Date.parse(row.started_at);
    const finished = Date.parse(row.finished_at);
    if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started || !Number.isFinite(row.duration_ms) || row.duration_ms < 0 || row.duration_ms !== finished - started) {
      issues.push(`review ${index} has invalid manual timing`);
    }
  });
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
    const verification = row.verification;
    const execution = row.execution;
    if (
      !REPAIR_CANDIDATE_STATUSES.has(row.candidate_status) ||
      !object(verification) ||
      !REPAIR_DECISIONS.has(verification.decision) ||
      !["pass", "fail", "not-run"].includes(verification.tests) ||
      !["pass", "fail", "not-run"].includes(verification.conformance) ||
      typeof verification.safe_apply !== "boolean" ||
      !Number.isInteger(verification.new_blocking_findings) || verification.new_blocking_findings < 0 ||
      !["approved", "not-approved"].includes(verification.filesystem_isolation) ||
      (verification.isolation_attestation_sha256 !== null && !sha(verification.isolation_attestation_sha256)) ||
      !object(execution) ||
      !REPAIR_ISOLATION_STATUSES.has(execution.isolation_status) ||
      typeof execution.project_test_process_spawned !== "boolean" ||
      (execution.attestation_sha256 !== null && !sha(execution.attestation_sha256))
    ) {
      throw new Error("attempted repair row must match the canonical Guardian repair observation contract");
    }
    const accepted = verification.decision === "ACCEPTABLE_FOR_REVIEW" &&
      row.candidate_status === "VERIFIED_FOR_REVIEW" &&
      verification.tests === "pass" && verification.conformance === "pass" &&
      verification.safe_apply && verification.new_blocking_findings === 0 &&
      verification.filesystem_isolation === "approved" &&
      sha(verification.isolation_attestation_sha256) &&
      execution.isolation_status === "APPROVED" &&
      execution.project_test_process_spawned &&
      execution.attestation_sha256 === verification.isolation_attestation_sha256;
    const testOnlyBoundary = execution.isolation_status !== "TEST_ONLY" ||
      (row.candidate_status === "PROPOSED" &&
        verification.decision === "INCONCLUSIVE" &&
        verification.filesystem_isolation === "not-approved" &&
        verification.isolation_attestation_sha256 === null &&
        execution.project_test_process_spawned === false);
    const rejectedBoundary = execution.isolation_status !== "REJECTED" ||
      (row.candidate_status === "PROPOSED" &&
        verification.filesystem_isolation === "not-approved" &&
        verification.isolation_attestation_sha256 === null &&
        execution.project_test_process_spawned === false);
    const approvedBoundary = execution.isolation_status !== "APPROVED" ||
      (verification.filesystem_isolation === "approved" &&
        sha(execution.attestation_sha256) &&
        execution.attestation_sha256 === verification.isolation_attestation_sha256 &&
        execution.project_test_process_spawned);
    if (!testOnlyBoundary || !rejectedBoundary || !approvedBoundary) {
      throw new Error("repair isolation evidence cannot weaken the Guardian isolation boundary");
    }
    if ((verification.decision === "ACCEPTABLE_FOR_REVIEW" || row.candidate_status === "VERIFIED_FOR_REVIEW") && !accepted) {
      throw new Error("reviewable repair rows require every Guardian acceptance invariant");
    }
    attempted += 1;
    if (accepted) successful += 1;
    if (verification.new_blocking_findings > 0) regressions += 1;
    if (verification.decision === "INCONCLUSIVE") inconclusive += 1;
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

function validateCompletedAblationRun(run) {
  return ["correct", "incorrect"].includes(run.correctness) && Number.isInteger(run.claims) && run.claims >= 0 && Number.isInteger(run.unsupported_claims) && run.unsupported_claims >= 0 && run.unsupported_claims <= run.claims && Number.isInteger(run.citation_supported_claims) && run.citation_supported_claims >= 0 && run.citation_supported_claims <= run.claims && Number.isFinite(run.latency_ms) && run.latency_ms >= 0 && Number.isFinite(run.tokens) && run.tokens >= 0 && Number.isFinite(run.cost_usd) && run.cost_usd >= 0 && object(run.repair) && typeof run.repair.attempted === "boolean" && typeof run.repair.verified === "boolean" && typeof run.repair.regression === "boolean";
}

function ablationConfigurationSummary(rows) {
  const completed = rows.filter((row) => row.status === "success");
  const claims = completed.reduce((sum, row) => sum + row.claims, 0);
  const unsupported = completed.reduce((sum, row) => sum + row.unsupported_claims, 0);
  const cited = completed.reduce((sum, row) => sum + row.citation_supported_claims, 0);
  const attempted = completed.filter((row) => row.repair.attempted);
  return {
    n: rows.length,
    completed: completed.length,
    failures: rows.length - completed.length,
    case_ids: [...new Set(rows.map((row) => row.case_id))].sort(),
    correctness_rate: ratio(completed.filter((row) => row.correctness === "correct").length, rows.length),
    unsupported_claim_rate: ratio(unsupported, claims),
    citation_coverage: ratio(cited, claims),
    repair_verification_rate: ratio(attempted.filter((row) => row.repair.verified).length, attempted.length),
    repair_regression_rate: ratio(attempted.filter((row) => row.repair.regression).length, attempted.length),
    median_latency_ms: median(completed.map((row) => row.latency_ms)),
    total_tokens: completed.reduce((sum, row) => sum + row.tokens, 0),
    total_cost_usd: completed.reduce((sum, row) => sum + row.cost_usd, 0),
  };
}

export function summarizeAblationRuns(runs) {
  if (!Array.isArray(runs) || runs.length === 0) throw new Error("ablation runs are required");
  const ids = new Set();
  const grouped = new Map();
  for (const run of runs) {
    if (!object(run) || !nonEmpty(run.run_id) || ids.has(run.run_id) || !nonEmpty(run.case_id) || !CONDITIONS.has(run.condition) || !GUARDIAN_RUN_STATUSES.has(run.status) || !sha(run.config_sha256)) {
      throw new Error("invalid or duplicate ablation run");
    }
    ids.add(run.run_id);
    if (run.status === "success" && !validateCompletedAblationRun(run)) throw new Error("completed ablation run has invalid metrics");
    const key = `${run.condition}\0${run.config_sha256}`;
    const rows = grouped.get(key) ?? [];
    rows.push(run);
    grouped.set(key, rows);
  }
  const result = {};
  for (const condition of [...CONDITIONS].sort()) {
    const configurations = [...grouped.entries()].filter(([key]) => key.startsWith(`${condition}\0`)).sort(([left], [right]) => left.localeCompare(right));
    if (configurations.length === 0) continue;
    result[condition] = {
      config_hashes: configurations.map(([key]) => key.split("\0")[1]),
      configurations: Object.fromEntries(configurations.map(([key, rows]) => [key.split("\0")[1], ablationConfigurationSummary(rows)])),
    };
  }
  return result;
}

export function createPreparedEvidenceManifest(metadata, artifacts) {
  if (!object(metadata) || metadata.status !== "prepared" || !nonEmpty(metadata.protocol_version) || metadata.source_commit !== null || metadata.human_approval !== null) {
    throw new Error("prepared metadata must remain uncommitted and unapproved technical scaffolding");
  }
  if (!object(artifacts)) throw new Error("prepared evidence artifacts are required");
  const actual = Object.keys(artifacts).sort();
  if (actual.join("\n") !== [...PHASE4_PREPARED_ARTIFACTS].sort().join("\n")) throw new Error("prepared evidence artifact set must be exact");
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

function completeHashGate(value) {
  return object(value) && value.complete === true && sha(value.sha256);
}

function frozenHashGate(value) {
  return object(value) && value.status === "frozen" && sha(value.sha256);
}

function securityGate(value) {
  return object(value) && value.actor_type === "human" && value.decision === "approved" && /^https:\/\//u.test(value.url) && /^[0-9a-f]{40}$/u.test(value.commit);
}

export function evaluatePhase4Closure(manifest, artifacts, gates) {
  const blockers = [];
  if (!verifyPreparedEvidenceManifest(manifest, artifacts)) blockers.push("prepared_artifact_manifest_invalid");
  const validators = {
    real_provider_run: completeHashGate,
    provider_config_frozen: frozenHashGate,
    dataset_frozen: frozenHashGate,
    human_review_complete: completeHashGate,
    security_approved: securityGate,
    statistical_plan_frozen: frozenHashGate,
    safety_corpus_passed: completeHashGate,
    metrics_reproduced: completeHashGate,
  };
  for (const gate of PHASE4_CLOSURE_GATES) {
    if (!validators[gate](gates?.[gate])) blockers.push(gate);
  }
  return {
    schema_version: 1,
    status: blockers.length === 0 ? "CLOSED" : "PREPARATORY",
    closed: blockers.length === 0,
    blockers,
    prepared_manifest_sha256: object(manifest) ? manifest.manifest_sha256 ?? null : null,
  };
}

export function assertPhase4Closure(manifest, artifacts, gates) {
  const result = evaluatePhase4Closure(manifest, artifacts, gates);
  if (!result.closed) throw new Error(`P4_GATE_INCOMPLETE: ${result.blockers.join(",")}`);
  return result;
}
