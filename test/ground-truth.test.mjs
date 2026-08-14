import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateGroundTruth } from "../scripts/lib/ground-truth.mjs";

const canonical = JSON.parse(
  await readFile(new URL("../order-platform/ground-truth.json", import.meta.url), "utf8"),
);

function mutate(callback) {
  const copy = structuredClone(canonical);
  callback(copy);
  return copy;
}

test("canonical ground truth satisfies the Phase 1 contract", () => {
  assert.deepEqual(validateGroundTruth(canonical), {
    "no-impact": 9,
    violation: 7,
    evolution: 4,
  });
});

const mutations = [
  ["missing metadata", (value) => { delete value.benchmark; }, /benchmark metadata/],
  ["array metadata", (value) => { value.benchmark = []; }, /benchmark metadata/],
  ["missing cases", (value) => { delete value.cases; }, /at least one case/],
  ["empty cases", (value) => { value.cases = []; }, /at least one case/],
  ["missing distribution", (value) => { delete value.benchmark.expected_distribution; }, /non-negative distribution/],
  ["missing distribution category", (value) => { delete value.benchmark.expected_distribution.evolution; }, /non-negative distribution/],
  ["negative distribution", (value) => { value.benchmark.expected_distribution.evolution = -1; }, /non-negative distribution/],
  ["non-integer distribution", (value) => { value.benchmark.expected_distribution.evolution = 4.5; }, /non-negative distribution/],
  ["unknown distribution category", (value) => { value.benchmark.expected_distribution.other = 0; }, /non-negative distribution/],
  ["case count", (value) => value.cases.pop(), /distribution total differs/],
  ["non-object case", (value) => { value.cases[0] = null; }, /object with an id/],
  ["missing case id", (value) => { delete value.cases[0].id; }, /object with an id/],
  ["duplicate id", (value) => { value.cases[1].id = "case-01"; }, /Duplicate case id/],
  ["unknown category", (value) => { value.cases[0].category = "other"; }, /Unknown category/],
  ["classification", (value) => { value.cases[0].expected.classification = "violation"; }, /category differs/],
  ["owner", (value) => { value.cases[0].owner = ""; }, /owner, patch and changed_files/],
  ["patch", (value) => { value.cases[0].patch = ""; }, /owner, patch and changed_files/],
  ["changed files", (value) => { value.cases[0].changed_files = []; }, /owner, patch and changed_files/],
  ["duplicate patch", (value) => { value.cases[1].patch = value.cases[0].patch; }, /Duplicate patch path/],
  ["acceptance criteria", (value) => { value.cases[0].acceptance_criteria = []; }, /acceptance_criteria/],
  ["non-array acceptance criteria", (value) => { value.cases[0].acceptance_criteria = "yes"; }, /acceptance_criteria/],
  ["non-string acceptance criterion", (value) => { value.cases[0].acceptance_criteria = [1]; }, /acceptance_criteria/],
  ["blank acceptance criterion", (value) => { value.cases[0].acceptance_criteria = ["   "]; }, /acceptance_criteria/],
  ["duplicate changed file", (value) => { value.cases[0].changed_files.push(value.cases[0].changed_files[0]); }, /changed_files must be unique/],
  ["non-string path", (value) => { value.cases[0].changed_files = [1]; }, /unsafe changed file path/],
  ["empty path", (value) => { value.cases[0].changed_files = [""]; }, /unsafe changed file path/],
  ["backslash path", (value) => { value.cases[0].changed_files = ["service\\file.ts"]; }, /unsafe changed file path/],
  ["absolute path", (value) => { value.cases[0].changed_files = ["/service/file.ts"]; }, /unsafe changed file path/],
  ["unsafe path", (value) => { value.cases[0].changed_files = ["../escape.ts"]; }, /unsafe changed file path/],
  ["missing delta", (value) => { delete value.cases[0].delta; }, /explicit graph delta/],
  ["array delta", (value) => { value.cases[0].delta = []; }, /explicit graph delta/],
  ["unsupported delta key", (value) => { value.cases[0].delta.other = []; }, /unsupported key/],
  ["no-impact delta", (value) => { value.cases[0].delta.components_removed = ["postgres"]; }, /empty graph delta/],
  ["missing topology delta", (value) => { value.cases[5].delta = {}; }, /topology-changing case/],
  ["evolution approval", (value) => { value.cases[8].expected.approval_required = false; }, /must require approval/],
  ["violation finding", (value) => { value.cases[5].expected.findings = []; }, /must declare expected findings/],
  ["approval on no-impact", (value) => { value.cases[0].expected.approval_required = true; }, /only evolution/],
  ["missing evidence", (value) => { delete value.cases[0].expected.evidence; }, /source evidence is required/],
  ["empty evidence", (value) => { value.cases[0].expected.evidence = []; }, /source evidence is required/],
  ["evidence file", (value) => { value.cases[5].expected.evidence[0].file = "other.ts"; }, /evidence file/],
  ["evidence line", (value) => { value.cases[5].expected.evidence[0].line = 0; }, /positive source location/],
  ["non-integer evidence line", (value) => { value.cases[5].expected.evidence[0].line = 1.5; }, /positive source location/],
  ["evidence kind", (value) => { value.cases[5].expected.evidence[0].kind = "trace"; }, /positive source location/],
  ["non-contiguous ids", (value) => { value.cases[19].id = "case-21"; }, /Case ids must be contiguous/],
  ["distribution", (value) => { value.benchmark.expected_distribution.violation = 4; }, /metadata distribution/],
  ["distribution key order", (value) => {
    const { violation, evolution, ...rest } = value.benchmark.expected_distribution;
    value.benchmark.expected_distribution = { ...rest, evolution, violation };
  }, /Unexpected distribution/],
];

for (const [name, callback, expected] of mutations) {
  test(`mutation is rejected: ${name}`, () => {
    assert.throws(() => validateGroundTruth(mutate(callback)), expected);
  });
}

test("non-object ground truth is rejected before any nested access", () => {
  assert.throws(() => validateGroundTruth(null), /benchmark metadata/);
});
