import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { calculateBenchmarkIntegrity } from "../scripts/lib/integrity.mjs";

test("benchmark integrity hashes architecture, nested baseline files and only patch files deterministically", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "archsync-integrity-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "repository", "nested"), { recursive: true });
  await mkdir(join(root, "changes"), { recursive: true });
  await writeFile(join(root, "architecture.yaml"), "version: 0.1\n", "utf8");
  await writeFile(join(root, "repository", "root.ts"), "export {};\n", "utf8");
  await writeFile(join(root, "repository", "nested", "child.ts"), "export const child = true;\n", "utf8");
  await writeFile(join(root, "changes", "case.patch"), "patch one\n", "utf8");
  await writeFile(join(root, "changes", "README.txt"), "not part of patch hash\n", "utf8");

  const first = await calculateBenchmarkIntegrity(root);
  const repeated = await calculateBenchmarkIntegrity(root);
  assert.deepEqual(repeated, first);
  assert.deepEqual(Object.keys(first), [
    "algorithm",
    "architecture_sha256",
    "baseline_tree_sha256",
    "baseline_files",
    "patch_set_sha256",
    "patch_files",
  ]);
  assert.equal(first.algorithm, "sha256");
  assert.equal(first.architecture_sha256.length, 64);
  assert.equal(first.baseline_files, 2);
  assert.equal(first.patch_files, 1);

  await writeFile(join(root, "changes", "README.txt"), "still ignored\n", "utf8");
  assert.deepEqual(await calculateBenchmarkIntegrity(root), first);

  await writeFile(join(root, "changes", "case.patch"), "patch two\n", "utf8");
  const changedPatch = await calculateBenchmarkIntegrity(root);
  assert.notEqual(changedPatch.patch_set_sha256, first.patch_set_sha256);
  assert.equal(changedPatch.baseline_tree_sha256, first.baseline_tree_sha256);

  await writeFile(join(root, "repository", "nested", "child.ts"), "export const child = false;\n", "utf8");
  const changedBaseline = await calculateBenchmarkIntegrity(root);
  assert.notEqual(changedBaseline.baseline_tree_sha256, first.baseline_tree_sha256);
});
