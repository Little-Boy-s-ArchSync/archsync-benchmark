import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createRuntimeFoundationManifest,
  hashNamedContents,
  sha256,
} from "../scripts/lib/runtime-provenance.mjs";

test("runtime provenance hashes named inputs in stable order", () => {
  const hashes = hashNamedContents({ "z.json": "z", "a.json": "a" });
  assert.deepEqual(Object.keys(hashes), ["a.json", "z.json"]);
  assert.equal(hashes["a.json"], sha256("a"));
  assert.notEqual(hashes["a.json"], hashNamedContents({ "a.json": "changed" })["a.json"]);
});

test("runtime manifest is explicitly pre-approval and binds every artifact", () => {
  const manifest = createRuntimeFoundationManifest({
    inputs: { "runtime/inputs/a.json": "input" },
    outputs: { "runtime/evidence/a.json": "output" },
    coreCommit: "a".repeat(40),
    guardianCommit: "b".repeat(40),
    collectorVersion: "0.1.0-foundation",
    runtimeContractVersion: "0.1",
    window: { start_unix_nano: "1", end_unix_nano: "2" },
  });

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
