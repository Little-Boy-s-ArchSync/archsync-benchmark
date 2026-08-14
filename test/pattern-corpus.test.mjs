import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { validatePatternCorpus } from "../scripts/lib/pattern-corpus.mjs";

const canonicalRoot = resolve("typescript-patterns");

async function validateMutation(context, mutate, mutateFiles) {
  const root = await mkdtemp(join(tmpdir(), "archsync-pattern-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await cp(canonicalRoot, root, { recursive: true });
  const manifestPath = join(root, "signals.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  await mutate?.(manifest);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await mutateFiles?.(root, manifest);
  return validatePatternCorpus(manifestPath);
}

test("canonical detector challenge corpus is valid with exact distribution", async () => {
  const result = await validatePatternCorpus(join(canonicalRoot, "signals.json"));
  assert.equal(result.valid, true);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.counts, { positive: 20, negative: 20 });
  assert.equal(result.baseDirectory, canonicalRoot);
});

test("invalid corpus envelope is rejected", async (context) => {
  await assert.rejects(
    () => validateMutation(context, (manifest) => { manifest.version = "1"; }),
    /version 0\.1/,
  );
  await assert.rejects(
    () => validateMutation(context, (manifest) => { delete manifest.benchmark; }),
    /benchmark metadata/,
  );
  await assert.rejects(
    () => validateMutation(context, (manifest) => { manifest.groups = {}; }),
    /groups/,
  );
});

test("group contract reports count, detector, duplicate, path, edge and missing-fixture issues", async (context) => {
  const result = await validateMutation(context, (manifest) => {
    manifest.groups.pop();
    manifest.groups[0].file = "../escape.ts";
    manifest.groups[0].edge = "invalid";
    manifest.groups[1].detector = manifest.groups[0].detector;
    manifest.groups[2].detector = "typescript-unknown";
    manifest.groups[3].file = "missing.ts";
  });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.startsWith("Expected 5 detector groups")));
  assert.ok(result.issues.some((issue) => issue.includes("unsafe fixture path")));
  assert.ok(result.issues.some((issue) => issue.includes("canonical edge key")));
  assert.ok(result.issues.some((issue) => issue.includes("Duplicate detector group")));
  assert.ok(result.issues.some((issue) => issue.includes("Unknown detector")));
  assert.ok(result.issues.some((issue) => issue.includes("missing fixture")));
  assert.ok(result.issues.some((issue) => issue.includes("Missing detector group")));
});

test("signal contract reports missing collections, IDs, locations, patterns and stale source anchors", async (context) => {
  const result = await validateMutation(context, (manifest) => {
    const fetch = manifest.groups[0];
    fetch.positive[1].id = fetch.positive[0].id;
    fetch.positive[2].line = fetch.positive[0].line;
    fetch.positive[3].line = 0;
    fetch.negative[0].pattern = "   ";
    fetch.negative[1].contains = "not present";
    fetch.negative[2].id = null;
    fetch.negative[3].line = 999;
    manifest.groups[1].positive = [];
    delete manifest.groups[2].negative;
  });
  assert.equal(result.valid, false);
  for (const expected of [
    "duplicate or missing signal id",
    "duplicate detector/file/line location",
    "line 0 is outside",
    "line 999 is outside",
    "pattern description is required",
    "source line no longer contains",
    "positive signals are required",
    "negative signals are required",
  ]) {
    assert.ok(result.issues.some((issue) => issue.includes(expected)), `missing issue: ${expected}`);
  }
});

test("distribution and benchmark input paths are checked", async (context) => {
  const result = await validateMutation(context, (manifest) => {
    manifest.benchmark.expected_distribution.positive = 999;
    manifest.benchmark.architecture = "missing.yaml";
    manifest.benchmark.repository = "missing-repository";
  });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.startsWith("Signal distribution")));
  assert.ok(result.issues.includes("Pattern corpus architecture or repository is missing"));
});

test("safe path validation rejects every unsafe representation", async (context) => {
  for (const unsafe of [null, "", "folder\\file.ts", "/absolute.ts", "../escape.ts"]) {
    const result = await validateMutation(context, (manifest) => {
      manifest.groups[0].file = unsafe;
    });
    assert.ok(result.issues.some((issue) => issue.includes("unsafe fixture path")));
  }
});
