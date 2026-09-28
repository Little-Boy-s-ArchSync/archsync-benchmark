import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { verifyAudit } from "../scripts/d3-review/verify-upstream-commit-provenance.mjs";

const retained = resolve(import.meta.dirname, "../holdout/d3-upstream-commit-audit-20260928");

async function copyAudit(t) {
  const copy = await mkdtemp(join(tmpdir(), "d3-upstream-audit-test-"));
  t.after(() => rm(copy, { recursive: true, force: true }));
  await cp(retained, copy, { recursive: true });
  return copy;
}

test("all selected D3 historical commits match retained public upstream response bytes", async () => {
  assert.deepEqual(await verifyAudit(), {
    commits: 93,
    repositories: 3,
    mode: "retained-only",
    d3_labels_or_predictions_checked: false
  });
});

test("a changed upstream response cannot pass the retained audit", async (t) => {
  const copy = await copyAudit(t);
  const receipt = JSON.parse(await readFile(join(copy, "receipt.json"), "utf8"));
  const first = receipt.results[0];
  const filename = `${first.repository.replace("/", "--")}--${first.sha}.json`;
  const path = join(copy, "responses", filename);
  await writeFile(path, `${await readFile(path, "utf8")} `);
  await assert.rejects(verifyAudit(copy), /raw response changed/);
});

test("a missing or invented selected commit is rejected", async (t) => {
  const copy = await copyAudit(t);
  const path = join(copy, "receipt.json");
  const receipt = JSON.parse(await readFile(path, "utf8"));
  receipt.results[0].sha = "0".repeat(40);
  await writeFile(path, JSON.stringify(receipt));
  await assert.rejects(verifyAudit(copy), /unselected commit/);
});
