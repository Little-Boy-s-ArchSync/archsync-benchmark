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
  ["case count", (value) => value.cases.pop(), /distribution total differs/],
  ["duplicate id", (value) => { value.cases[1].id = "case-01"; }, /Duplicate case id/],
  ["classification", (value) => { value.cases[0].expected.classification = "violation"; }, /category differs/],
  ["owner", (value) => { value.cases[0].owner = ""; }, /owner, patch and changed_files/],
  ["duplicate patch", (value) => { value.cases[1].patch = value.cases[0].patch; }, /Duplicate patch path/],
  ["acceptance criteria", (value) => { value.cases[0].acceptance_criteria = []; }, /acceptance_criteria/],
  ["unsafe path", (value) => { value.cases[0].changed_files = ["../escape.ts"]; }, /unsafe changed file path/],
  ["no-impact delta", (value) => { value.cases[0].delta.components_removed = ["postgres"]; }, /empty graph delta/],
  ["evolution approval", (value) => { value.cases[8].expected.approval_required = false; }, /must require approval/],
  ["violation finding", (value) => { value.cases[5].expected.findings = []; }, /must declare expected findings/],
  ["evidence file", (value) => { value.cases[5].expected.evidence[0].file = "other.ts"; }, /evidence file/],
  ["evidence line", (value) => { value.cases[5].expected.evidence[0].line = 0; }, /positive source location/],
  ["distribution", (value) => { value.benchmark.expected_distribution.violation = 4; }, /metadata distribution/],
];

for (const [name, callback, expected] of mutations) {
  test(`mutation is rejected: ${name}`, () => {
    assert.throws(() => validateGroundTruth(mutate(callback)), expected);
  });
}
