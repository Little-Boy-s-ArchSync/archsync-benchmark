import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { verifyReceipt } from "../development/common-module-capability/verify.mjs";
import { verifyV2 } from "../development/common-module-capability-exports-v2/runner.mjs";

const original = resolve(import.meta.dirname, "../development/common-module-capability");
const revised = resolve(import.meta.dirname, "../development/common-module-capability-exports-v2");

test("v1 remains historical while exports-field v2 qualifies one additional developer fixture", async () => {
  assert.deepEqual(await verifyReceipt(original, join(original, "receipt")), {
    cases: 7, common_fixture_passes: 2, failed_common_candidates: 1,
    unsupported_probes: 4, d3_executed: false
  });
  assert.deepEqual(await verifyV2(), {
    profile: "non-d3-common-capability-exports-v2",
    cases: 7, common_fixture_passes: 3, failed_common_candidates: 0,
    unsupported_probes: 4, d3_executed: false
  });
  const manifest = JSON.parse(await readFile(join(revised, "receipt/manifest.json"), "utf8"));
  assert.equal(manifest.cases.find((row) => row.id === "self-package-export").normalized.shared_fixture_pass, true);
  for (const id of ["unresolved", "computed-dynamic", "shadowed-require", "symlink"]) {
    assert.equal(manifest.cases.find((row) => row.id === id).normalized.shared_fixture_pass, false);
  }
  assert.equal(manifest.d3_executed, false);
  assert.equal(manifest.research_complete, false);
});

test("exports-field v2 rejects altered raw comparator output", async (t) => {
  const copy = await mkdtemp(join(tmpdir(), "common-exports-v2-test-"));
  t.after(() => rm(copy, { recursive: true, force: true }));
  await cp(join(revised, "receipt"), copy, { recursive: true });
  const path = join(copy, "self-package-export/comparator.stdout.txt");
  await writeFile(path, "{}");
  await assert.rejects(verifyV2(copy), /Output changed/);
});
