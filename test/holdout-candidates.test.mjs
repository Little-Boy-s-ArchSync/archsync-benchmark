import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  EVAL_102_PATTERN_KINDS,
  EVAL_102_PERMISSIVE_LICENSES,
  summarizeHoldoutCandidateInventory,
  validateHoldoutCandidateInventory,
} from "../scripts/lib/holdout-candidates.mjs";

const source = JSON.parse(await readFile(new URL("../holdout/candidates.eval-102.json", import.meta.url), "utf8"));
const schema = JSON.parse(await readFile(new URL("../holdout/candidate-inventory.schema.json", import.meta.url), "utf8"));

function fixture() {
  return structuredClone(source);
}

test("real EVAL-102 inventory is exactly ten validated candidates without selection authority", () => {
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.properties.task_id.const, "EVAL-102");
  assert.equal(schema.properties.candidates.minItems, 10);
  assert.equal(schema.properties.candidates.maxItems, 10);
  assert.deepEqual(EVAL_102_PERMISSIVE_LICENSES, ["Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "MIT"]);
  assert.deepEqual(EVAL_102_PATTERN_KINDS, ["http", "data", "cache", "message"]);
  assert.deepEqual(validateHoldoutCandidateInventory(source), []);
  const summary = summarizeHoldoutCandidateInventory(source);
  assert.equal(summary.validation, "PASS_CANDIDATE_ONLY");
  assert.equal(summary.validated_candidates, 10);
  assert.deepEqual(summary.licenses, { "Apache-2.0": 5, MIT: 5 });
  assert.deepEqual(summary.candidates_with_pattern, { http: 10, data: 10, cache: 0, message: 10 });
  assert.equal(summary.ranked_targets[0].rank, 1);
  assert.match(summary.ranked_targets[0].head, /^[0-9a-f]{40}$/u);
  assert.match(summary.inventory_sha256, /^[0-9a-f]{64}$/u);
  assert.equal(summary.selection_authorized, false);
  assert.equal(summary.freeze_authorized, false);
  assert.equal(summary.ground_truth_collected, false);
  assert.equal(summary.automation_status.billing_blocked, false);
  assert.equal(summary.human_gates_remaining.length, 5);
  assert.deepEqual(summarizeHoldoutCandidateInventory(fixture()), summary);
  assert.deepEqual(validateHoldoutCandidateInventory(null), ["candidate inventory must be an object"]);
  assert.throws(() => summarizeHoldoutCandidateInventory(null), /EVAL_102_CANDIDATE_INVENTORY_INVALID/u);
});

test("inventory envelope fails closed on missing authority, provenance, billing, and cardinality", () => {
  const invalid = fixture();
  invalid.schema_version = 2;
  invalid.task_id = "other";
  invalid.artifact_kind = "selection";
  invalid.status = "frozen";
  invalid.selection_authorized = true;
  invalid.freeze_authorized = true;
  invalid.ground_truth_collected = true;
  invalid.snapshot_completed_at = "2026-99-99T00:00:00Z";
  invalid.ranking_method = "";
  invalid.blockers = [""];
  invalid.automation_status = { github_api_access: "anonymous", billing_blocked: true, billing_note: "" };
  invalid.candidates.pop();
  invalid.candidates[1].rank = invalid.candidates[0].rank;
  const issues = validateHoldoutCandidateInventory(invalid);
  for (const expected of [
    "schema_version", "task_id", "artifact_kind", "status", "selection_authorized", "freeze_authorized",
    "ground_truth_collected", "snapshot_completed_at", "ranking_method", "blockers", "authenticated GitHub",
    "billing_blocked", "billing_note", "exactly 10", "ranks must be unique",
  ]) assert.ok(issues.some((issue) => issue.includes(expected)), expected);

  const noAutomation = fixture();
  noAutomation.automation_status = null;
  assert.ok(validateHoldoutCandidateInventory(noAutomation).includes("automation_status is required"));
  const noCandidates = fixture();
  noCandidates.candidates = null;
  assert.ok(validateHoldoutCandidateInventory(noCandidates).includes("candidates must be an array"));
  const noBlockers = fixture();
  noBlockers.blockers = [];
  assert.ok(validateHoldoutCandidateInventory(noBlockers).some((issue) => issue.includes("blockers")));
});

test("candidate identity and GitHub snapshot metadata fail closed", () => {
  const nonObject = fixture();
  nonObject.candidates[0] = null;
  assert.ok(validateHoldoutCandidateInventory(nonObject).some((issue) => issue.includes("candidates[0] must be an object")));

  const invalid = fixture();
  Object.assign(invalid.candidates[0], {
    rank: 0,
    id: "",
    name: "",
    canonical_url: "http://github.com/not-exact/path",
    default_branch: "",
    observed_default_branch_commit_sha: "bad",
    retrieved_at: "not-utc",
    primary_language: "JavaScript",
    prior_tuning_leakage_status: "clear",
    selection_decision: "selected",
    rationale: "",
    risks: [""],
  });
  const issues = validateHoldoutCandidateInventory(invalid);
  for (const expected of ["rank", ".id", ".name", "canonical_url", "default_branch", "full SHA", "retrieved_at", "TypeScript", "human-gated", "rationale", "risks"]) {
    assert.ok(issues.some((issue) => issue.includes(expected)), expected);
  }

  const identity = fixture();
  identity.candidates[1].id = identity.candidates[0].id;
  identity.candidates[1].github_api_repository_url = "wrong";
  identity.candidates[1].github_api_head_url = "wrong";
  identity.candidates[2].canonical_url = identity.candidates[0].canonical_url;
  const identityIssues = validateHoldoutCandidateInventory(identity);
  for (const expected of ["id must be unique", "id must match", "canonical_url must be unique", "repository_url", "head_url"]) {
    assert.ok(identityIssues.some((issue) => issue.includes(expected)), expected);
  }

  const noSnapshot = fixture();
  noSnapshot.candidates[0].github_snapshot = null;
  assert.ok(validateHoldoutCandidateInventory(noSnapshot).some((issue) => issue.includes("github_snapshot is required")));
  const snapshot = fixture();
  for (const field of ["size_kib_approx", "stars", "forks", "open_issues"]) snapshot.candidates[0].github_snapshot[field] = -1;
  for (const field of ["pushed_at", "updated_at", "default_branch_commit_committed_at"]) snapshot.candidates[0].github_snapshot[field] = "bad";
  for (const field of ["archived", "disabled", "fork"]) snapshot.candidates[0].github_snapshot[field] = true;
  const snapshotIssues = validateHoldoutCandidateInventory(snapshot);
  for (const expected of ["size_kib_approx", "stars", "forks", "open_issues", "pushed_at", "updated_at", "committed_at", "archived", "disabled", ".fork"]) {
    assert.ok(snapshotIssues.some((issue) => issue.includes(expected)), expected);
  }
  const nonInteger = fixture();
  nonInteger.candidates[0].github_snapshot.stars = "many";
  assert.ok(validateHoldoutCandidateInventory(nonInteger).some((issue) => issue.includes("stars")));
  const absent = fixture();
  absent.candidates[0].canonical_url = undefined;
  absent.candidates[0].observed_default_branch_commit_sha = undefined;
  absent.candidates[0].package_topology.package_manager = undefined;
  assert.ok(validateHoldoutCandidateInventory(absent).length > 0);
});

test("license and package topology require permissive immutable evidence", () => {
  const noLicense = fixture();
  noLicense.candidates[0].license = null;
  assert.ok(validateHoldoutCandidateInventory(noLicense).some((issue) => issue.includes("license is required")));

  const license = fixture();
  Object.assign(license.candidates[0].license, { spdx_id: "AGPL-3.0", path: "/LICENSE", blob_sha: "bad", api_url: "wrong", file_url: "mutable" });
  const licenseIssues = validateHoldoutCandidateInventory(license);
  for (const expected of ["allowlisted", "safe tracked", "blob_sha", "api_url"]) assert.ok(licenseIssues.some((issue) => issue.includes(expected)), expected);
  for (const path of ["dir\\LICENSE", "dir/../LICENSE", "dir//LICENSE", ""]) {
    const unsafe = fixture();
    unsafe.candidates[0].license.path = path;
    assert.ok(validateHoldoutCandidateInventory(unsafe).some((issue) => issue.includes("license.path")), path);
  }
  const mutableLicense = fixture();
  mutableLicense.candidates[0].license.file_url = "https://github.com/hyperdxio/hyperdx/blob/main/LICENSE";
  assert.ok(validateHoldoutCandidateInventory(mutableLicense).some((issue) => issue.includes("commit-pinned")));

  const noTopology = fixture();
  noTopology.candidates[0].package_topology = null;
  assert.ok(validateHoldoutCandidateInventory(noTopology).some((issue) => issue.includes("package_topology is required")));
  const topology = fixture();
  Object.assign(topology.candidates[0].package_topology, { package_manager: "bun", monorepo: false, manifest_urls: [], signals: "" });
  const topologyIssues = validateHoldoutCandidateInventory(topology);
  for (const expected of ["package_manager", "monorepo", "at least two", "signals"]) assert.ok(topologyIssues.some((issue) => issue.includes(expected)), expected);
  const links = fixture();
  links.candidates[0].package_topology.manifest_urls = ["mutable", "mutable"];
  const linkIssues = validateHoldoutCandidateInventory(links);
  for (const expected of ["commit-pinned", "package.json", "unique"]) assert.ok(linkIssues.some((issue) => issue.includes(expected)), expected);
});

test("architecture evidence requires two supported pinned and attributable pattern kinds", () => {
  const missing = fixture();
  missing.candidates[0].architecture_evidence = [];
  assert.ok(validateHoldoutCandidateInventory(missing).some((issue) => issue.includes("at least two records")));

  const invalid = fixture();
  invalid.candidates[0].architecture_evidence = [null, {
    kind: "filesystem",
    source_url: "mutable",
    source_blob_sha: "bad",
    observation: "",
  }];
  const issues = validateHoldoutCandidateInventory(invalid);
  for (const expected of ["must be an object", "kind is unsupported", "source_url", "source_blob_sha", "observation", "two supported pattern kinds"]) {
    assert.ok(issues.some((issue) => issue.includes(expected)), expected);
  }

  const duplicate = fixture();
  duplicate.candidates[0].architecture_evidence[1].source_url = duplicate.candidates[0].architecture_evidence[0].source_url;
  assert.ok(validateHoldoutCandidateInventory(duplicate).some((issue) => issue.includes("source_url must be unique")));
});
