import { createHash } from "node:crypto";

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
