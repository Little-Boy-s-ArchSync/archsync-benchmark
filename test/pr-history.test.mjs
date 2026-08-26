import assert from "node:assert/strict";
import test from "node:test";

import { createPrHistoryApprovalScopeSha256, createPrHistoryPreparation, runPrHistoryReplay, validatePrHistoryManifest } from "../scripts/lib/pr-history.mjs";

function manifest(overrides = {}) {
  return {
    schema_version: 1,
    status: "synthetic-provisional",
    synthetic: true,
    repository: { url: "https://github.com/example/synthetic-fixture", commit: "a".repeat(40), tree_sha256: "b".repeat(64) },
    pr_range: { first: 1, last: 2, expected_count: 2 },
    environment: { id: "synthetic-env", os: "fixture-os", node: "v22.0.0", pnpm: "11.16.0", cpu: "fixture-cpu", memory_bytes: 1024 },
    approval: null,
    ...overrides,
  };
}

function rows() {
  return [1, 2].map((number) => ({ number, base_commit: String(number).repeat(40), merged_commit: String(number + 2).repeat(40), changed_files: [`src/file-${number}.ts`], opened_at: `2026-08-2${number}T00:00:00Z`, merged_at: `2026-08-2${number}T01:00:00Z` }));
}

test("EVAL-112 PR-history manifest pins repository, range, environment, and real-system approval", () => {
  assert.deepEqual(validatePrHistoryManifest(manifest()), []);
  assert.deepEqual(validatePrHistoryManifest(null), ["PR-history manifest must be an object"]);
  const invalid = manifest({ schema_version: 2, status: "unknown", synthetic: "yes", repository: null, pr_range: null, environment: null, approval: {} });
  const issues = validatePrHistoryManifest(invalid);
  for (const expected of ["schema_version", "status", "synthetic", "repository", "PR range", "environment"]) assert.ok(issues.some((issue) => issue.includes(expected)), expected);
  assert.ok(validatePrHistoryManifest(manifest({ approval: {} })).some((issue) => issue.includes("approval must be null")));
  for (const pr_range of [{ first: 0, last: 1, expected_count: 1 }, { first: 2, last: 1, expected_count: 1 }, { first: 1, last: 2, expected_count: 0 }]) assert.ok(validatePrHistoryManifest(manifest({ pr_range })).some((issue) => issue.includes("non-empty")));
  const real = manifest({ status: "approved-real-system", synthetic: false, approval: null });
  assert.ok(validatePrHistoryManifest(real).some((issue) => issue.includes("human approval")));
  assert.throws(() => createPrHistoryApprovalScopeSha256(null), /APPROVAL_SCOPE_INVALID/u);
  const approved = { actor_type: "human", decision: "approved", reviewer_id: "unit-fixture-reviewer", approved_at: "2026-08-26T00:00:00Z", sha256: createPrHistoryApprovalScopeSha256(real) };
  assert.deepEqual(validatePrHistoryManifest({ ...real, approval: approved }), []);
  assert.ok(validatePrHistoryManifest({ ...real, approval: { ...approved, sha256: "c".repeat(64) } }).some((issue) => issue.includes("exact repository")));
  assert.ok(validatePrHistoryManifest({ ...real, approval: { ...approved, approved_at: "invalid" } }).some((issue) => issue.includes("exact repository")));
});

test("EVAL-112 runner replays extraction and analysis twice without making claims", async () => {
  const calls = [];
  const result = await runPrHistoryReplay({
    manifest: manifest(),
    extract: async (input) => { calls.push(input); return rows(); },
    analyze: async (input) => ({ pr_count: input.length, changed_file_count: input.flatMap((row) => row.changed_files).length }),
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.pass), [1, 2]);
  assert.equal(result.status, "SYNTHETIC_REPLAY_COMPLETE");
  assert.equal(result.deterministic, true);
  assert.equal(result.claims_allowed, false);
  assert.equal(result.passes.length, 2);
  assert.deepEqual(result.repository, manifest().repository);

  let pass = 0;
  const drift = await runPrHistoryReplay({ manifest: manifest(), extract: async () => rows(), analyze: async () => ({ value: ++pass }) });
  assert.equal(drift.status, "BLOCKED_NONDETERMINISTIC");
  assert.equal(drift.deterministic, false);

  const real = manifest({ status: "approved-real-system", synthetic: false, approval: null });
  const approved = { actor_type: "human", decision: "approved", reviewer_id: "unit-fixture-reviewer", approved_at: "2026-08-26T00:00:00Z", sha256: createPrHistoryApprovalScopeSha256(real) };
  const realResult = await runPrHistoryReplay({ manifest: { ...real, approval: approved }, extract: async () => rows(), analyze: async () => ({ value: 1 }) });
  assert.equal(realResult.status, "PREPARATORY_REAL_REPLAY_COMPLETE");
});

test("EVAL-112 runner rejects empty, malformed, mismatched, and unapproved inputs", async () => {
  await assert.rejects(() => runPrHistoryReplay({ manifest: null, extract: async () => rows(), analyze: async () => ({ ok: true }) }), /PR_HISTORY_INPUT_INVALID/u);
  await assert.rejects(() => runPrHistoryReplay({ manifest: manifest(), extract: null, analyze: null }), /PR_HISTORY_INPUT_INVALID/u);
  await assert.rejects(() => runPrHistoryReplay({ manifest: manifest(), extract: async () => [], analyze: async () => ({}) }), /EMPTY_EXTRACTION/u);
  await assert.rejects(() => runPrHistoryReplay({ manifest: manifest(), extract: async () => [rows()[0]], analyze: async () => ({}) }), /COUNT_MISMATCH/u);
  for (const mutation of [
    null,
    { ...rows()[0], number: 3 },
    { ...rows()[0], base_commit: "bad" },
    { ...rows()[0], merged_commit: "bad" },
    { ...rows()[0], changed_files: [] },
    { ...rows()[0], changed_files: ["../bad"] },
    { ...rows()[0], opened_at: "invalid" },
    { ...rows()[0], merged_at: "2026-08-20T00:00:00Z" },
  ]) await assert.rejects(() => runPrHistoryReplay({ manifest: manifest(), extract: async () => [mutation, rows()[1]], analyze: async () => ({}) }), /INVALID_ROW/u);
  await assert.rejects(() => runPrHistoryReplay({ manifest: manifest(), extract: async () => [rows()[0], rows()[0]], analyze: async () => ({}) }), /INVALID_ROW/u);
  await assert.rejects(() => runPrHistoryReplay({ manifest: manifest(), extract: async () => rows(), analyze: async () => ({}) }), /ANALYSIS_EMPTY/u);
});

test("EVAL-112 preparation hashes only explicit synthetic fixtures", () => {
  const preparation = createPrHistoryPreparation(manifest(), rows(), "synthetic runner source");
  assert.equal(preparation.status, "synthetic-preparatory");
  assert.equal(preparation.claims_allowed, false);
  assert.equal(preparation.human_approval, null);
  assert.match(preparation.fixture_sha256, /^[0-9a-f]{64}$/u);
  for (const args of [[null, rows(), "x"], [manifest({ status: "approved-real-system", synthetic: false }), rows(), "x"], [manifest(), [], "x"], [manifest(), rows(), ""]]) assert.throws(() => createPrHistoryPreparation(...args), /PREPARATION_INVALID/u);
});
