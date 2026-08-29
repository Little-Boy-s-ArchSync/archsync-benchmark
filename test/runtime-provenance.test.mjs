import assert from "node:assert/strict";
import { test } from "node:test";

import * as runtimeProvenance from "../scripts/lib/runtime-provenance.mjs";

const {
  GOV103_CORE_ACCEPTANCE_RECORD_FIELDS,
  GOV103_CORE_APPROVAL_EVIDENCE_FIELDS,
  RUNTIME_AUTHORITATIVE_BLOCKERS,
  RUNTIME_CLOSURE_GATES,
  assertRuntimeClosure,
  createRuntimeFoundationManifest,
  evaluateRuntimeClosure,
  gov103AcceptanceRecordSha256,
  hashNamedContents,
  inspectGov103CoreContract,
  sha256,
  wellFormedGov103AcceptanceRecord,
  wellFormedGov103ApprovalEvidence,
} = runtimeProvenance;

const POLICY_COMMIT = "1".repeat(40);
const EVIDENCE_COMMIT = "2".repeat(40);
const POLICY_SHA256 = "3".repeat(64);
const VERIFICATION_TIME = "2020-01-03T00:00:00Z";

function acceptanceRecord() {
  const record = {
    schema_version: 1,
    policy_id: "GOV-103",
    policy_revision: "GOV-103-r1",
    policy_commit: POLICY_COMMIT,
    policy_sha256: POLICY_SHA256,
    actor_type: "human",
    accepted_by: "Hiếu",
    accountable_role: "Repository Lead",
    decision: "approved",
    accepted_at_utc: "2020-01-02T10:00:00Z",
    evidence_commit: EVIDENCE_COMMIT,
    evidence_url: `https://github.com/Little-Boy-s-ArchSync/archsync-core/blob/${EVIDENCE_COMMIT}/docs/adr/acceptance-evidence/20200102-GOV-103-r1.json`,
    acceptance_record_sha256: "",
  };
  record.acceptance_record_sha256 = gov103AcceptanceRecordSha256(record);
  return record;
}

function approvalEvidence() {
  return {
    schema_version: 1,
    policy_id: "GOV-103",
    policy_revision: "GOV-103-r1",
    policy_commit: POLICY_COMMIT,
    policy_sha256: POLICY_SHA256,
    policy_authors: ["Policy Author"],
    actor_type: "human",
    accepted_by: "Hiếu",
    accountable_role: "Repository Lead",
    decision: "approved",
    accepted_at_utc: "2020-01-02T10:00:00Z",
    acceptance_authorization_reference: "reviewed authorization record",
    non_author_review: {
      actor_type: "human",
      reviewed_by: "Independent Reviewer",
      reviewer_role: "Governance Reviewer",
      decision: "approved",
      reviewed_at_utc: "2020-01-02T09:00:00Z",
      policy_sha256: POLICY_SHA256,
      authorization_reference: "reviewer authorization record",
    },
  };
}

function mutatedRecord(mutate, { rehash = true } = {}) {
  const record = acceptanceRecord();
  mutate(record);
  if (rehash) record.acceptance_record_sha256 = gov103AcceptanceRecordSha256(record);
  return record;
}

function runtimeManifest() {
  return createRuntimeFoundationManifest({
    inputs: { "runtime/inputs/a.json": "input" },
    outputs: { "runtime/evidence/a.json": "output" },
    coreCommit: "a".repeat(40),
    guardianCommit: "b".repeat(40),
    collectorVersion: "0.1.0-foundation",
    runtimeContractVersion: "0.1",
    window: { start_unix_nano: "1", end_unix_nano: "2" },
  });
}

function syntacticallyCompleteGates(record = acceptanceRecord()) {
  const human = (character) => ({
    actor_type: "human",
    decision: "approved",
    url: `https://example.invalid/${character}`,
    commit: character.repeat(40),
    sha256: character.repeat(64),
  });
  return {
    phase5_closed: { complete: true, sha256: "1".repeat(64) },
    adr_approved: human("2"),
    quality_goals_approved: human("3"),
    privacy_security_approved: human("4"),
    gov103_satisfied: record,
    high_risk_candidate_decided: {
      actor_type: "human",
      risk_level: "high",
      decision: "approved",
      sha256: "6".repeat(64),
    },
    independent_experimental_validation: {
      complete: true,
      sha256: "7".repeat(64),
      independent: true,
      synthetic: false,
    },
    architecture_change_accepted: human("8"),
  };
}

test("runtime provenance hashes named inputs in stable order", () => {
  const hashes = hashNamedContents({ "z.json": "z", "a.json": "a" });
  assert.deepEqual(Object.keys(hashes), ["a.json", "z.json"]);
  assert.equal(hashes["a.json"], sha256("a"));
  assert.notEqual(hashes["a.json"], hashNamedContents({ "a.json": "changed" })["a.json"]);
});

test("the preparatory mirror uses the exact flat Core v1 field contracts", () => {
  assert.deepEqual(GOV103_CORE_ACCEPTANCE_RECORD_FIELDS, [
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
  assert.deepEqual(GOV103_CORE_APPROVAL_EVIDENCE_FIELDS, [
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
  const record = acceptanceRecord();
  assert.equal(record.acceptance_record_sha256, gov103AcceptanceRecordSha256(record));
  assert.notEqual(
    record.acceptance_record_sha256,
    gov103AcceptanceRecordSha256({ ...record, accepted_at_utc: "2020-01-02T10:00:01Z" }),
  );
  assert.equal(typeof gov103AcceptanceRecordSha256(), "string");
});

test("Core v1 closure-record shape is strict but never confers authority", () => {
  const record = acceptanceRecord();
  assert.equal(wellFormedGov103AcceptanceRecord(record), true);
  assert.equal(wellFormedGov103AcceptanceRecord(record, { now: VERIFICATION_TIME }), true);
  assert.equal(wellFormedGov103AcceptanceRecord(record, { now: Date.parse(VERIFICATION_TIME) }), true);
  assert.equal(wellFormedGov103AcceptanceRecord(record, { now: new Date(VERIFICATION_TIME) }), true);

  const invalidRecords = [
    null,
    [],
    mutatedRecord((value) => { delete value.policy_id; }),
    mutatedRecord((value) => { value.extra = true; }),
    mutatedRecord((value) => { value.schema_version = 2; }),
    mutatedRecord((value) => { value.policy_id = "GOV-104"; }),
    mutatedRecord((value) => { value.policy_revision = "GOV-103-r2"; }),
    mutatedRecord((value) => { value.policy_commit = null; }),
    mutatedRecord((value) => { value.policy_commit = "bad"; }),
    mutatedRecord((value) => { value.policy_sha256 = null; }),
    mutatedRecord((value) => { value.policy_sha256 = "bad"; }),
    mutatedRecord((value) => { value.actor_type = "automation"; }),
    mutatedRecord((value) => { value.accepted_by = "Hieu"; }),
    mutatedRecord((value) => { value.accountable_role = "Operator"; }),
    mutatedRecord((value) => { value.decision = "pending"; }),
    mutatedRecord((value) => { value.accepted_at_utc = null; }),
    mutatedRecord((value) => { value.accepted_at_utc = "not-a-time"; }),
    mutatedRecord((value) => { value.accepted_at_utc = "2020-02-30T10:00:00Z"; }),
    mutatedRecord((value) => { value.accepted_at_utc = "2020-01-04T00:00:00Z"; }),
    mutatedRecord((value) => { value.evidence_commit = null; }),
    mutatedRecord((value) => { value.evidence_commit = "bad"; }),
    mutatedRecord((value) => { value.evidence_url = null; }),
    mutatedRecord((value) => { value.evidence_url = "https://example.invalid/floating/main"; }),
    mutatedRecord((value) => {
      value.evidence_url = `https://github.com/Little-Boy-s-ArchSync/archsync-core/blob/${"4".repeat(40)}/evidence.json`;
    }),
    mutatedRecord((value) => {
      value.evidence_url = `https://github.com/Little-Boy-s-ArchSync/archsync-core/blob/${EVIDENCE_COMMIT}/%2Foutside.json`;
    }),
    mutatedRecord((value) => {
      value.evidence_url = `https://github.com/Little-Boy-s-ArchSync/archsync-core/blob/${EVIDENCE_COMMIT}/evidence/%2E%2E/forged.json`;
    }),
    mutatedRecord((value) => {
      value.evidence_url = `https://github.com/Little-Boy-s-ArchSync/archsync-core/blob/${EVIDENCE_COMMIT}/evidence/%ZZ.json`;
    }),
    mutatedRecord((value) => { value.acceptance_record_sha256 = null; }, { rehash: false }),
    mutatedRecord((value) => { value.acceptance_record_sha256 = "bad"; }, { rehash: false }),
    mutatedRecord((value) => { value.acceptance_record_sha256 = "f".repeat(64); }, { rehash: false }),
  ];
  for (const candidate of invalidRecords) {
    assert.equal(wellFormedGov103AcceptanceRecord(candidate, { now: VERIFICATION_TIME }), false);
  }
  assert.equal(wellFormedGov103AcceptanceRecord(record, { now: "not-a-time" }), false);
  assert.equal(wellFormedGov103AcceptanceRecord(record, { now: null }), false);
});

test("Core v1 approval evidence requires authors, authorization references and a separate non-author review", () => {
  const evidence = approvalEvidence();
  assert.equal(wellFormedGov103ApprovalEvidence(evidence), true);
  assert.equal(wellFormedGov103ApprovalEvidence(evidence, { now: VERIFICATION_TIME }), true);

  const invalidEvidence = [
    null,
    [],
    (() => { const value = approvalEvidence(); delete value.policy_id; return value; })(),
    { ...approvalEvidence(), extra: true },
    { ...approvalEvidence(), schema_version: 2 },
    { ...approvalEvidence(), policy_id: "GOV-104" },
    { ...approvalEvidence(), policy_revision: "GOV-103-r2" },
    { ...approvalEvidence(), policy_commit: null },
    { ...approvalEvidence(), policy_commit: "bad" },
    { ...approvalEvidence(), policy_sha256: null },
    { ...approvalEvidence(), policy_sha256: "bad" },
    { ...approvalEvidence(), policy_authors: null },
    { ...approvalEvidence(), policy_authors: [] },
    { ...approvalEvidence(), policy_authors: [null] },
    { ...approvalEvidence(), policy_authors: [" leading"] },
    { ...approvalEvidence(), policy_authors: ["pending"] },
    { ...approvalEvidence(), policy_authors: ["Policy Author", "Policy Author"] },
    { ...approvalEvidence(), actor_type: "automation" },
    { ...approvalEvidence(), accepted_by: "Hieu" },
    { ...approvalEvidence(), accountable_role: "Operator" },
    { ...approvalEvidence(), decision: "pending" },
    { ...approvalEvidence(), accepted_at_utc: null },
    { ...approvalEvidence(), accepted_at_utc: "not-a-time" },
    { ...approvalEvidence(), accepted_at_utc: "2020-02-30T10:00:00Z" },
    { ...approvalEvidence(), accepted_at_utc: "2020-01-04T00:00:00Z" },
    { ...approvalEvidence(), acceptance_authorization_reference: null },
    { ...approvalEvidence(), acceptance_authorization_reference: "x".repeat(2049) },
    { ...approvalEvidence(), acceptance_authorization_reference: " leading" },
    { ...approvalEvidence(), acceptance_authorization_reference: "pending" },
    { ...approvalEvidence(), non_author_review: null },
    { ...approvalEvidence(), non_author_review: { ...approvalEvidence().non_author_review, extra: true } },
    { ...approvalEvidence(), non_author_review: { ...approvalEvidence().non_author_review, actor_type: "automation" } },
    { ...approvalEvidence(), non_author_review: { ...approvalEvidence().non_author_review, reviewed_by: null } },
    { ...approvalEvidence(), non_author_review: { ...approvalEvidence().non_author_review, reviewed_by: "Hiếu" } },
    { ...approvalEvidence(), non_author_review: { ...approvalEvidence().non_author_review, reviewed_by: "Policy Author" } },
    { ...approvalEvidence(), non_author_review: { ...approvalEvidence().non_author_review, reviewer_role: "pending" } },
    { ...approvalEvidence(), non_author_review: { ...approvalEvidence().non_author_review, decision: "pending" } },
    { ...approvalEvidence(), non_author_review: { ...approvalEvidence().non_author_review, reviewed_at_utc: null } },
    { ...approvalEvidence(), non_author_review: { ...approvalEvidence().non_author_review, reviewed_at_utc: "not-a-time" } },
    { ...approvalEvidence(), non_author_review: { ...approvalEvidence().non_author_review, reviewed_at_utc: "2020-01-04T00:00:00Z" } },
    { ...approvalEvidence(), non_author_review: { ...approvalEvidence().non_author_review, reviewed_at_utc: "2020-01-02T11:00:00Z" } },
    { ...approvalEvidence(), non_author_review: { ...approvalEvidence().non_author_review, policy_sha256: "4".repeat(64) } },
    { ...approvalEvidence(), non_author_review: { ...approvalEvidence().non_author_review, authorization_reference: "pending" } },
    { ...approvalEvidence(), non_author_review: { ...approvalEvidence().non_author_review, authorization_reference: "x".repeat(2049) } },
  ];
  for (const candidate of invalidEvidence) {
    assert.equal(wellFormedGov103ApprovalEvidence(candidate, { now: VERIFICATION_TIME }), false);
  }
  assert.equal(wellFormedGov103ApprovalEvidence(evidence, { now: "not-a-time" }), false);

  const longReferences = approvalEvidence();
  longReferences.acceptance_authorization_reference = "a".repeat(2048);
  longReferences.non_author_review.authorization_reference = "b".repeat(2048);
  assert.equal(
    wellFormedGov103ApprovalEvidence(longReferences, { now: VERIFICATION_TIME }),
    true,
  );
});

test("well-formed Core-looking P, E and C data stays diagnostic and preparatory", () => {
  const record = acceptanceRecord();
  const evidence = approvalEvidence();
  const diagnostic = inspectGov103CoreContract({
    acceptanceRecord: record,
    approvalEvidence: evidence,
    verificationTime: VERIFICATION_TIME,
  });
  assert.equal(diagnostic.record_well_formed, true);
  assert.equal(diagnostic.approval_evidence_well_formed, true);
  assert.equal(diagnostic.record_evidence_binding_well_formed, true);
  assert.equal(diagnostic.closure_record_digest_recomputed, record.acceptance_record_sha256);
  assert.equal(diagnostic.authoritative_source_imported, false);
  assert.equal(diagnostic.authoritative_policy_bytes_verified, false);
  assert.equal(diagnostic.authoritative_approval_evidence_verified, false);
  assert.equal(diagnostic.authoritative_closure_record_verified, false);
  assert.equal(diagnostic.acceptance_verified, false);
  assert.deepEqual(diagnostic.blockers, [
    "authoritative_gov103_core_contract_source_not_imported",
    "authoritative_gov103_policy_source_not_imported",
    "authoritative_gov103_approval_evidence_source_not_imported",
    "authoritative_gov103_closure_record_source_not_imported",
  ]);
  assert.deepEqual(Object.getOwnPropertySymbols(diagnostic), []);

  const mismatchedEvidence = approvalEvidence();
  mismatchedEvidence.policy_commit = "4".repeat(40);
  const mismatch = inspectGov103CoreContract({
    acceptanceRecord: record,
    approvalEvidence: mismatchedEvidence,
    verificationTime: VERIFICATION_TIME,
  });
  assert.equal(mismatch.record_well_formed, true);
  assert.equal(mismatch.approval_evidence_well_formed, true);
  assert.equal(mismatch.record_evidence_binding_well_formed, false);
  assert.ok(mismatch.blockers.includes("gov103_record_evidence_binding_not_well_formed"));

  const absent = inspectGov103CoreContract();
  assert.equal(absent.record_well_formed, false);
  assert.equal(absent.approval_evidence_well_formed, false);
  assert.equal(absent.closure_record_digest_recomputed, null);
  assert.deepEqual(absent.blockers.slice(-3), [
    "gov103_acceptance_record_not_well_formed",
    "gov103_approval_evidence_not_well_formed",
    "gov103_record_evidence_binding_not_well_formed",
  ]);
});

test("foundation manifest keeps every claim and source import explicitly false", () => {
  const manifest = runtimeManifest();
  assert.equal(manifest.status, "preparatory-authoritative-source-imports-required");
  assert.ok(Object.values(manifest.claims).every((value) => value === false));
  assert.ok(Object.values(manifest.authoritative_source_imports).every((value) => value === false));
  assert.equal(manifest.contracts.runtime_closure_version, "0.4-preparatory");
  assert.equal(manifest.contracts.gov103_acceptance_record_version, "Core schema-v1 mirror");
  assert.equal(manifest.contracts.gov103_approval_evidence_version, "Core schema-v1 mirror");
  assert.deepEqual(manifest.blockers, Object.values(RUNTIME_AUTHORITATIVE_BLOCKERS));
  assert.equal(manifest.input_sha256["runtime/inputs/a.json"], sha256("input"));
  assert.equal(manifest.output_sha256["runtime/evidence/a.json"], sha256("output"));

  const result = evaluateRuntimeClosure(manifest, {});
  assert.equal(result.schema_version, 4);
  assert.equal(result.status, "PREPARATORY");
  assert.equal(result.closed, false);
  assert.equal(result.authoritative_verification_available, false);
  assert.ok(Object.values(result.claims).every((value) => value === false));
  assert.deepEqual(result.blockers, Object.values(RUNTIME_AUTHORITATIVE_BLOCKERS));
  assert.deepEqual(result.dependency_commits, manifest.dependencies);
});

test("malformed or self-asserting manifests remain preparatory", () => {
  const manifest = runtimeManifest();
  const mutations = [
    null,
    [],
    { ...manifest, schema_version: "9" },
    { ...manifest, status: "closure-candidate" },
    { ...manifest, claims: null },
    { ...manifest, claims: { ...manifest.claims, extra: false } },
    { ...manifest, claims: { ...manifest.claims, phase5_closed: true } },
    { ...manifest, authoritative_source_imports: null },
    { ...manifest, authoritative_source_imports: { ...manifest.authoritative_source_imports, core_gov103_contract: true } },
    { ...manifest, input_sha256: null },
    { ...manifest, input_sha256: {} },
    { ...manifest, input_sha256: { x: null } },
    { ...manifest, input_sha256: { x: "bad" } },
    { ...manifest, output_sha256: null },
    { ...manifest, output_sha256: {} },
    { ...manifest, output_sha256: { x: null } },
    { ...manifest, output_sha256: { x: "bad" } },
    { ...manifest, dependencies: { ...manifest.dependencies, core_quality_goal_foundation_commit: null } },
    { ...manifest, dependencies: { ...manifest.dependencies, core_quality_goal_foundation_commit: "bad" } },
    { ...manifest, dependencies: { ...manifest.dependencies, guardian_runtime_foundation_commit: null } },
    { ...manifest, dependencies: { ...manifest.dependencies, guardian_runtime_foundation_commit: "bad" } },
  ];
  for (const candidate of mutations) {
    const result = evaluateRuntimeClosure(candidate, syntacticallyCompleteGates());
    assert.equal(result.status, "PREPARATORY");
    assert.equal(result.closed, false);
    assert.ok(result.blockers.includes("runtime_manifest_invalid"));
  }
  assert.equal(evaluateRuntimeClosure(null, null).dependency_commits, null);
});

test("fake hashes, URLs, humans, symbols, files and local repositories cannot close Phase 6", () => {
  assert.equal(RUNTIME_CLOSURE_GATES.length, 8);
  assert.equal("verifyGov103Acceptance" in runtimeProvenance, false);
  assert.equal(Object.values(runtimeProvenance).some((value) => typeof value === "symbol"), false);

  const manifest = runtimeManifest();
  const gates = syntacticallyCompleteGates();
  const recoveredSymbol = Symbol("verified-gov103-acceptance");
  const forgedVerification = {
    [recoveredSymbol]: true,
    acceptance_verified: true,
    sourceRepositories: {
      policy: "/tmp/fake-policy-repository",
      evidence: "/tmp/fake-evidence-repository",
    },
    protectedRef: "refs/remotes/origin/main",
  };
  const result = evaluateRuntimeClosure(manifest, gates, forgedVerification);
  assert.equal(result.closed, false);
  assert.equal(result.claims.gov103_accepted, false);
  assert.equal(result.claims.phase_6_exit_gate_closed, false);
  assert.equal(result.gov103_diagnostics.record_well_formed, true);
  assert.equal(result.gov103_diagnostics.acceptance_verified, false);
  assert.deepEqual(result.blockers, Object.values(RUNTIME_AUTHORITATIVE_BLOCKERS));

  const arbitraryExternalFile = mutatedRecord((record) => {
    record.local_path = "/tmp/arbitrary-acceptance.json";
  });
  const externalFileResult = evaluateRuntimeClosure(
    manifest,
    syntacticallyCompleteGates(arbitraryExternalFile),
    { localArtifacts: { "/tmp/arbitrary-acceptance.json": "forged bytes" } },
  );
  assert.equal(externalFileResult.closed, false);
  assert.equal(externalFileResult.gov103_diagnostics.record_well_formed, false);

  const zeroRecord = mutatedRecord((record) => {
    record.policy_commit = "0".repeat(40);
    record.evidence_commit = "0".repeat(40);
    record.policy_sha256 = "0".repeat(64);
    record.evidence_url = `https://github.com/untrusted/fake/blob/${"0".repeat(40)}/evidence.json`;
  });
  assert.equal(wellFormedGov103AcceptanceRecord(zeroRecord, { now: VERIFICATION_TIME }), true);
  const zeroResult = evaluateRuntimeClosure(manifest, syntacticallyCompleteGates(zeroRecord), {
    repositories: ["/tmp/fake"],
    refs: ["refs/remotes/origin/main"],
  });
  assert.equal(zeroResult.closed, false);
  assert.equal(zeroResult.gov103_diagnostics.acceptance_verified, false);

  const futureRecord = mutatedRecord((record) => { record.accepted_at_utc = "2999-01-01T00:00:00Z"; });
  assert.equal(wellFormedGov103AcceptanceRecord(futureRecord, { now: VERIFICATION_TIME }), false);
  assert.equal(evaluateRuntimeClosure(manifest, syntacticallyCompleteGates(futureRecord)).closed, false);
  assert.throws(
    () => assertRuntimeClosure(manifest, gates),
    /P6_AUTHORITATIVE_SOURCE_IMPORTS_REQUIRED: authoritative_phase5_verification_unavailable/u,
  );
});
