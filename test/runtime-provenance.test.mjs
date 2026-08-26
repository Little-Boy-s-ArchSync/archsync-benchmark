import assert from "node:assert/strict";
import { test } from "node:test";

import {
  RUNTIME_CLOSURE_GATES,
  assertRuntimeClosure,
  createRuntimeFoundationManifest,
  evaluateRuntimeClosure,
  hashNamedContents,
  sha256,
} from "../scripts/lib/runtime-provenance.mjs";

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

test("runtime provenance hashes named inputs in stable order", () => {
  const hashes = hashNamedContents({ "z.json": "z", "a.json": "a" });
  assert.deepEqual(Object.keys(hashes), ["a.json", "z.json"]);
  assert.equal(hashes["a.json"], sha256("a"));
  assert.notEqual(hashes["a.json"], hashNamedContents({ "a.json": "changed" })["a.json"]);
});

test("runtime manifest is explicitly pre-approval and binds every artifact", () => {
  const manifest = runtimeManifest();

  assert.deepEqual(manifest.claims, {
    adr_approved: false,
    quality_goals_approved: false,
    experimental_validation_complete: false,
    architecture_change_accepted: false,
    phase_6_exit_gate_closed: false,
  });
  assert.equal(manifest.status, "blocked-pending-prerequisites-and-human-approval");
  assert.equal(manifest.blockers.length, 6);
  assert.equal(manifest.input_sha256["runtime/inputs/a.json"], sha256("input"));
  assert.equal(manifest.output_sha256["runtime/evidence/a.json"], sha256("output"));
});

function completeGates() {
  const human = (character) => ({ actor_type: "human", decision: "approved", url: "https://example.invalid/synthetic", commit: character.repeat(40), sha256: character.repeat(64) });
  return {
    phase5_closed: { complete: true, sha256: "1".repeat(64) },
    adr_approved: human("2"),
    quality_goals_approved: human("3"),
    privacy_security_approved: human("4"),
    gov103_satisfied: { complete: true, sha256: "5".repeat(64) },
    high_risk_candidate_decided: { actor_type: "human", risk_level: "high", decision: "rejected", sha256: "6".repeat(64) },
    independent_experimental_validation: { complete: true, sha256: "7".repeat(64), independent: true, synthetic: false },
    architecture_change_accepted: human("8"),
  };
}

test("P6-108 closure fails closed until every external gate is valid", () => {
  assert.equal(RUNTIME_CLOSURE_GATES.length, 8);
  const manifest = runtimeManifest();
  const blocked = evaluateRuntimeClosure(manifest, {});
  assert.equal(blocked.status, "PREPARATORY");
  assert.equal(blocked.closed, false);
  assert.deepEqual(blocked.blockers, RUNTIME_CLOSURE_GATES);
  assert.deepEqual(blocked.dependency_commits, manifest.dependencies);
  assert.throws(() => assertRuntimeClosure(manifest, {}), /P6_GATE_INCOMPLETE/u);

  const invalidManifest = evaluateRuntimeClosure(null, null);
  assert.equal(invalidManifest.dependency_commits, null);
  assert.equal(invalidManifest.blockers[0], "runtime_manifest_invalid");
  for (const mutation of [
    { input_sha256: {} },
    { input_sha256: { x: "bad" } },
    { output_sha256: {} },
    { output_sha256: { x: "bad" } },
    { dependencies: { ...manifest.dependencies, core_quality_goal_foundation_commit: "bad" } },
    { dependencies: { ...manifest.dependencies, guardian_runtime_foundation_commit: "bad" } },
  ]) assert.ok(evaluateRuntimeClosure({ ...manifest, ...mutation }, completeGates()).blockers.includes("runtime_manifest_invalid"));

  const gates = completeGates();
  const closed = assertRuntimeClosure(manifest, gates);
  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.closed, true);
  assert.deepEqual(closed.blockers, []);
  for (const [gate, invalid] of [
    ["phase5_closed", { complete: false, sha256: "1".repeat(64) }],
    ["adr_approved", { actor_type: "provider", decision: "approved", url: "http://invalid", commit: "bad", sha256: "bad" }],
    ["quality_goals_approved", null],
    ["privacy_security_approved", {}],
    ["gov103_satisfied", { complete: true, sha256: "bad" }],
    ["high_risk_candidate_decided", { actor_type: "human", risk_level: "low", decision: "pending", sha256: "bad" }],
    ["independent_experimental_validation", { complete: true, sha256: "7".repeat(64), independent: false, synthetic: true }],
    ["architecture_change_accepted", { actor_type: "human", decision: "approved", url: "https://example.invalid", commit: "8".repeat(40), sha256: "bad" }],
  ]) assert.deepEqual(evaluateRuntimeClosure(manifest, { ...gates, [gate]: invalid }).blockers, [gate]);
});
