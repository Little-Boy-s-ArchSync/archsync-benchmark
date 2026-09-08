import { createHash } from "node:crypto";

export const RUNTIME_CLOSURE_GATES = Object.freeze([
  "phase5_closed",
  "adr_approved",
  "quality_goals_approved",
  "privacy_security_approved",
  "gov103_satisfied",
  "high_risk_candidate_decided",
  "independent_experimental_validation",
  "architecture_change_accepted",
]);

export const RUNTIME_AUTHORITATIVE_BLOCKERS = Object.freeze({
  phase5_closed: "authoritative_phase5_verification_unavailable",
  adr_approved: "authoritative_adr_verification_unavailable",
  quality_goals_approved: "authoritative_quality_goals_verification_unavailable",
  privacy_security_approved: "authoritative_privacy_security_verification_unavailable",
  gov103_satisfied: "authoritative_gov103_core_source_not_imported",
  high_risk_candidate_decided: "authoritative_high_risk_decision_verification_unavailable",
  independent_experimental_validation: "authoritative_independent_experiment_verification_unavailable",
  architecture_change_accepted: "authoritative_architecture_change_verification_unavailable",
});

export const GOV103_CORE_ACCEPTANCE_RECORD_FIELDS = Object.freeze([
  "schema_version",
  "policy_id",
  "policy_revision",
  "policy_commit",
  "policy_sha256",
  "actor_type",
  "accepted_by",
  "accountable_role",
  "decision",
  "accepted_at_utc",
  "evidence_commit",
  "evidence_url",
]);

export const GOV103_CORE_APPROVAL_EVIDENCE_FIELDS = Object.freeze([
  "schema_version",
  "policy_id",
  "policy_revision",
  "policy_commit",
  "policy_sha256",
  "policy_authors",
  "actor_type",
  "accepted_by",
  "accountable_role",
  "decision",
  "accepted_at_utc",
  "acceptance_authorization_reference",
  "non_author_review",
]);

const COMPLETE_ACCEPTANCE_RECORD_FIELDS = Object.freeze([
  ...GOV103_CORE_ACCEPTANCE_RECORD_FIELDS,
  "acceptance_record_sha256",
]);
const NON_AUTHOR_REVIEW_FIELDS = Object.freeze([
  "actor_type",
  "reviewed_by",
  "reviewer_role",
  "decision",
  "reviewed_at_utc",
  "policy_sha256",
  "authorization_reference",
]);
const RUNTIME_CLAIM_FIELDS = Object.freeze([
  "phase5_closed",
  "adr_approved",
  "quality_goals_approved",
  "privacy_security_approved",
  "gov103_accepted",
  "high_risk_candidate_decided",
  "experimental_validation_complete",
  "architecture_change_accepted",
  "phase_6_exit_gate_closed",
]);
const SOURCE_IMPORT_FIELDS = Object.freeze([
  "core_gov103_contract",
  "core_gov103_policy",
  "core_gov103_approval_evidence",
  "core_gov103_closure_record",
  "phase6_success_validators",
]);
const GOV103_BINDING_FIELDS = Object.freeze([
  "policy_id",
  "policy_revision",
  "policy_commit",
  "policy_sha256",
  "actor_type",
  "accepted_by",
  "accountable_role",
  "decision",
  "accepted_at_utc",
]);
const immutableEvidenceUrl = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/blob\/([0-9a-f]{40})\/([^?#\s]+)(?:#L[0-9]+(?:-L[0-9]+)?)?$/u;
const placeholder = /^(?:n\/?a|none|null|placeholder|tbd|todo|unknown|unassigned|unfilled|pending)$/iu;

function object(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactFields(value, expected) {
  return object(value)
    && Object.keys(value).length === expected.length
    && expected.every((field) => Object.hasOwn(value, field));
}

function digest(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function commit(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/u.test(value);
}

function utcSecond(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value)) return false;
  const instant = Date.parse(value);
  return Number.isFinite(instant) && new Date(instant).toISOString() === value.replace(/Z$/u, ".000Z");
}

function validNamedValue(value) {
  return typeof value === "string"
    && /^\S(?:.{0,126}\S)?$/u.test(value)
    && !placeholder.test(value);
}

function validReference(value) {
  return typeof value === "string"
    && /^\S(?:.{0,2046}\S)?$/u.test(value)
    && !placeholder.test(value);
}

function notFuture(value, now) {
  const verificationInstant = now instanceof Date
    ? now.getTime()
    : typeof now === "number"
      ? now
      : typeof now === "string"
        ? Date.parse(now)
        : Number.NaN;
  return Number.isFinite(verificationInstant) && Date.parse(value) <= verificationInstant;
}

function immutableUrlMatchesCommit(value, evidenceCommit) {
  const match = typeof value === "string" ? immutableEvidenceUrl.exec(value) : null;
  if (match === null || match[1] !== evidenceCommit) return false;
  try {
    const path = decodeURIComponent(match[2]);
    return !path.startsWith("/") && !path.split("/").includes("..");
  } catch {
    return false;
  }
}

function allFalseFields(value, fields) {
  return exactFields(value, fields) && fields.every((field) => value[field] === false);
}

function preparatoryClaims() {
  return Object.fromEntries(RUNTIME_CLAIM_FIELDS.map((field) => [field, false]));
}

function sourceImports() {
  return Object.fromEntries(SOURCE_IMPORT_FIELDS.map((field) => [field, false]));
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function gov103AcceptanceRecordSha256(value) {
  return sha256(JSON.stringify(Object.fromEntries(
    GOV103_CORE_ACCEPTANCE_RECORD_FIELDS.map((field) => [field, value?.[field]]),
  )));
}

export function wellFormedGov103AcceptanceRecord(value, { now = Date.now() } = {}) {
  return exactFields(value, COMPLETE_ACCEPTANCE_RECORD_FIELDS)
    && value.schema_version === 1
    && value.policy_id === "GOV-103"
    && value.policy_revision === "GOV-103-r1"
    && commit(value.policy_commit)
    && digest(value.policy_sha256)
    && value.actor_type === "human"
    && value.accepted_by === "Hiếu"
    && value.accountable_role === "Repository Lead"
    && value.decision === "approved"
    && utcSecond(value.accepted_at_utc)
    && notFuture(value.accepted_at_utc, now)
    && commit(value.evidence_commit)
    && immutableUrlMatchesCommit(value.evidence_url, value.evidence_commit)
    && digest(value.acceptance_record_sha256)
    && value.acceptance_record_sha256 === gov103AcceptanceRecordSha256(value);
}

export function wellFormedGov103ApprovalEvidence(value, { now = Date.now() } = {}) {
  const review = value?.non_author_review;
  return exactFields(value, GOV103_CORE_APPROVAL_EVIDENCE_FIELDS)
    && value.schema_version === 1
    && value.policy_id === "GOV-103"
    && value.policy_revision === "GOV-103-r1"
    && commit(value.policy_commit)
    && digest(value.policy_sha256)
    && Array.isArray(value.policy_authors)
    && value.policy_authors.length > 0
    && value.policy_authors.every(validNamedValue)
    && new Set(value.policy_authors).size === value.policy_authors.length
    && value.actor_type === "human"
    && value.accepted_by === "Hiếu"
    && value.accountable_role === "Repository Lead"
    && value.decision === "approved"
    && utcSecond(value.accepted_at_utc)
    && notFuture(value.accepted_at_utc, now)
    && validReference(value.acceptance_authorization_reference)
    && exactFields(review, NON_AUTHOR_REVIEW_FIELDS)
    && review.actor_type === "human"
    && validNamedValue(review.reviewed_by)
    && review.reviewed_by !== value.accepted_by
    && !value.policy_authors.includes(review.reviewed_by)
    && validNamedValue(review.reviewer_role)
    && review.decision === "approved"
    && utcSecond(review.reviewed_at_utc)
    && notFuture(review.reviewed_at_utc, now)
    && Date.parse(review.reviewed_at_utc) <= Date.parse(value.accepted_at_utc)
    && review.policy_sha256 === value.policy_sha256
    && validReference(review.authorization_reference);
}

export function inspectGov103CoreContract({
  acceptanceRecord,
  approvalEvidence,
  verificationTime = Date.now(),
} = {}) {
  const recordWellFormed = wellFormedGov103AcceptanceRecord(acceptanceRecord, { now: verificationTime });
  const evidenceWellFormed = wellFormedGov103ApprovalEvidence(approvalEvidence, { now: verificationTime });
  const bindingWellFormed = recordWellFormed && evidenceWellFormed
    && GOV103_BINDING_FIELDS.every((field) => acceptanceRecord[field] === approvalEvidence[field]);
  const blockers = [
    "authoritative_gov103_core_contract_source_not_imported",
    "authoritative_gov103_policy_source_not_imported",
    "authoritative_gov103_approval_evidence_source_not_imported",
    "authoritative_gov103_closure_record_source_not_imported",
  ];
  if (!recordWellFormed) blockers.push("gov103_acceptance_record_not_well_formed");
  if (!evidenceWellFormed) blockers.push("gov103_approval_evidence_not_well_formed");
  if (!bindingWellFormed) blockers.push("gov103_record_evidence_binding_not_well_formed");
  return Object.freeze({
    contract: "Core GOV-103-r1 flat schema-v1 preparatory mirror",
    record_well_formed: recordWellFormed,
    approval_evidence_well_formed: evidenceWellFormed,
    record_evidence_binding_well_formed: bindingWellFormed,
    closure_record_digest_recomputed: recordWellFormed
      ? gov103AcceptanceRecordSha256(acceptanceRecord)
      : null,
    authoritative_source_imported: false,
    authoritative_policy_bytes_verified: false,
    authoritative_approval_evidence_verified: false,
    authoritative_closure_record_verified: false,
    acceptance_verified: false,
    blockers: Object.freeze(blockers),
  });
}

export function hashNamedContents(contents) {
  return Object.fromEntries(
    Object.entries(contents)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([file, value]) => [file, sha256(value)]),
  );
}

export function createRuntimeFoundationManifest({
  inputs,
  outputs,
  coreCommit,
  guardianCommit,
  collectorVersion,
  runtimeContractVersion,
  window,
}) {
  return {
    schema_version: "0.1",
    status: "preparatory-authoritative-source-imports-required",
    claims: preparatoryClaims(),
    authoritative_source_imports: sourceImports(),
    dependencies: {
      core_quality_goal_foundation_commit: coreCommit,
      guardian_runtime_foundation_commit: guardianCommit,
    },
    contracts: {
      collector_version: collectorVersion,
      runtime_evidence_version: runtimeContractVersion,
      runtime_closure_version: "0.4-preparatory",
      gov103_acceptance_record_version: "Core schema-v1 mirror",
      gov103_approval_evidence_version: "Core schema-v1 mirror",
      quality_goal_version: "0.2",
      scorecard_version: "0.1",
      approval_record_version: "0.1",
    },
    evidence_window: window,
    input_sha256: hashNamedContents(inputs),
    output_sha256: hashNamedContents(outputs),
    blockers: Object.values(RUNTIME_AUTHORITATIVE_BLOCKERS),
  };
}

function validRuntimeManifest(manifest) {
  return object(manifest)
    && manifest.schema_version === "0.1"
    && manifest.status === "preparatory-authoritative-source-imports-required"
    && allFalseFields(manifest.claims, RUNTIME_CLAIM_FIELDS)
    && allFalseFields(manifest.authoritative_source_imports, SOURCE_IMPORT_FIELDS)
    && object(manifest.input_sha256)
    && Object.keys(manifest.input_sha256).length > 0
    && Object.values(manifest.input_sha256).every(digest)
    && object(manifest.output_sha256)
    && Object.keys(manifest.output_sha256).length > 0
    && Object.values(manifest.output_sha256).every(digest)
    && commit(manifest.dependencies?.core_quality_goal_foundation_commit)
    && commit(manifest.dependencies?.guardian_runtime_foundation_commit);
}

export function evaluateRuntimeClosure(manifest, gates) {
  const blockers = validRuntimeManifest(manifest) ? [] : ["runtime_manifest_invalid"];
  blockers.push(...Object.values(RUNTIME_AUTHORITATIVE_BLOCKERS));
  const gov103Diagnostics = inspectGov103CoreContract({
    acceptanceRecord: gates?.gov103_satisfied,
  });
  return {
    schema_version: 4,
    status: "PREPARATORY",
    closed: false,
    authoritative_verification_available: false,
    blockers,
    claims: preparatoryClaims(),
    gov103_diagnostics: gov103Diagnostics,
    dependency_commits: object(manifest?.dependencies) ? structuredClone(manifest.dependencies) : null,
  };
}

export function assertRuntimeClosure(manifest, gates) {
  const result = evaluateRuntimeClosure(manifest, gates);
  throw new Error(`P6_AUTHORITATIVE_SOURCE_IMPORTS_REQUIRED: ${result.blockers.join(",")}`);
}
