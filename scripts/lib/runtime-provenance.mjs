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

function object(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function digest(value) {
  return /^[0-9a-f]{64}$/u.test(value);
}

function commit(value) {
  return /^[0-9a-f]{40}$/u.test(value);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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
    status: "blocked-pending-prerequisites-and-human-approval",
    claims: {
      adr_approved: false,
      quality_goals_approved: false,
      experimental_validation_complete: false,
      architecture_change_accepted: false,
      phase_6_exit_gate_closed: false,
    },
    dependencies: {
      core_quality_goal_foundation_commit: coreCommit,
      guardian_runtime_foundation_commit: guardianCommit,
    },
    contracts: {
      collector_version: collectorVersion,
      runtime_evidence_version: runtimeContractVersion,
      quality_goal_version: "0.2",
      scorecard_version: "0.1",
      approval_record_version: "0.1",
    },
    evidence_window: window,
    input_sha256: hashNamedContents(inputs),
    output_sha256: hashNamedContents(outputs),
    blockers: [
      "P5-110 Phase 5 evidence gate is not closed",
      "P6-101 ADR requires lead and privacy/security approval",
      "P6-104 quality-goal targets require stakeholder approval",
      "P6-106 high-risk candidate requires a real human approver",
      "GOV-103 prerequisite is not satisfied",
      "No production or independent experimental validation has run",
    ],
  };
}

function completeHashGate(value) {
  return object(value) && value.complete === true && digest(value.sha256);
}

function humanApprovalGate(value) {
  return object(value) && value.actor_type === "human" && value.decision === "approved" && /^https:\/\//u.test(value.url) && commit(value.commit) && digest(value.sha256);
}

function highRiskDecisionGate(value) {
  return object(value) && value.actor_type === "human" && value.risk_level === "high" && ["approved", "rejected"].includes(value.decision) && digest(value.sha256);
}

function independentValidationGate(value) {
  return completeHashGate(value) && value.independent === true && value.synthetic === false;
}

function validRuntimeManifest(manifest) {
  return object(manifest) && manifest.schema_version === "0.1" && object(manifest.input_sha256) && Object.keys(manifest.input_sha256).length > 0 && Object.values(manifest.input_sha256).every(digest) && object(manifest.output_sha256) && Object.keys(manifest.output_sha256).length > 0 && Object.values(manifest.output_sha256).every(digest) && commit(manifest.dependencies?.core_quality_goal_foundation_commit) && commit(manifest.dependencies?.guardian_runtime_foundation_commit);
}

export function evaluateRuntimeClosure(manifest, gates) {
  const blockers = [];
  if (!validRuntimeManifest(manifest)) blockers.push("runtime_manifest_invalid");
  const validators = {
    phase5_closed: completeHashGate,
    adr_approved: humanApprovalGate,
    quality_goals_approved: humanApprovalGate,
    privacy_security_approved: humanApprovalGate,
    gov103_satisfied: completeHashGate,
    high_risk_candidate_decided: highRiskDecisionGate,
    independent_experimental_validation: independentValidationGate,
    architecture_change_accepted: humanApprovalGate,
  };
  for (const gate of RUNTIME_CLOSURE_GATES) {
    if (!validators[gate](gates?.[gate])) blockers.push(gate);
  }
  return {
    schema_version: 1,
    status: blockers.length === 0 ? "CLOSED" : "PREPARATORY",
    closed: blockers.length === 0,
    blockers,
    dependency_commits: object(manifest?.dependencies) ? structuredClone(manifest.dependencies) : null,
  };
}

export function assertRuntimeClosure(manifest, gates) {
  const result = evaluateRuntimeClosure(manifest, gates);
  if (!result.closed) throw new Error(`P6_GATE_INCOMPLETE: ${result.blockers.join(",")}`);
  return result;
}
