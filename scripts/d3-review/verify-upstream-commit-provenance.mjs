import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "../..");
const checklistPath = join(root, "holdout/d3-applicability-proposal-20260928/original-checklist.json");
const objectRoot = join(root, "holdout/d3-applicability-proposal-20260928/objects");
const defaultAuditDir = join(root, "holdout/d3-upstream-commit-audit-20260928");
const checklistSha = "2c20c4694b749e565ebce149385407b808e224ee0f5d5471f4aab1e37a1d979a";
const casesSha = "44cc064a3555c90cc20d2a38ab61d67c6af598c1825bf5290cca2269ec801d35";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function commitFields(bytes, expectedSha) {
  const actualSha = createHash("sha1")
    .update(Buffer.concat([Buffer.from(`commit ${bytes.length}\0`), bytes]))
    .digest("hex");
  assert.equal(actualSha, expectedSha, "retained commit object identity");
  const text = bytes.toString("utf8");
  const tree = text.match(/^tree ([a-f0-9]{40})$/m)?.[1];
  assert(tree, "retained commit tree missing");
  return {
    tree,
    parents: [...text.matchAll(/^parent ([a-f0-9]{40})$/gm)].map((match) => match[1])
  };
}

export async function verifyAudit(auditDir = defaultAuditDir, { live = false } = {}) {
  const checklistBytes = await readFile(checklistPath);
  assert.equal(sha256(checklistBytes), checklistSha, "accepted checklist bytes changed");
  const checklist = JSON.parse(checklistBytes);
  assert.equal(checklist.cases_sha256, casesSha);
  assert.equal(checklist.rows.length, 152);
  assert.equal(new Set(checklist.rows.map((row) => row.case_id)).size, 56);
  const expected = new Map();
  for (const row of checklist.rows) {
    assert(/^[a-z0-9-]+\/[a-z0-9-]+$/i.test(row.repository));
    assert(/^[a-f0-9]{40}$/.test(row.commit));
    expected.set(`${row.repository}@${row.commit}`, row);
  }
  assert.equal(expected.size, 93);
  const receipt = JSON.parse(await readFile(join(auditDir, "receipt.json"), "utf8"));
  assert.equal(receipt.schema, "d3-upstream-commit-audit/1");
  assert.equal(receipt.status, "source-provenance-check-only-not-d3-result");
  assert.equal(receipt.kit_sha256, casesSha);
  assert.equal(receipt.unique_commits, 93);
  assert.equal(receipt.checked, 93);
  assert.equal(receipt.passed, 93);
  assert.equal(receipt.results.length, 93);
  const seen = new Set();
  const expectedResponseFiles = new Set();
  for (const row of receipt.results) {
    const key = `${row.repository}@${row.sha}`;
    assert(expected.has(key), `unselected commit: ${key}`);
    assert(!seen.has(key), `duplicate commit: ${key}`);
    seen.add(key);
    assert.equal(row.endpoint, `repos/${row.repository}/git/commits/${row.sha}`);
    assert(Number.isFinite(Date.parse(row.invoked_at_utc)), "invalid invocation time");
    assert.equal(row.response_exit_code, 0);
    assert.equal(row.error, null);
    assert.equal(row.tree_match, true);
    assert.equal(row.parents_match, true);
    assert.equal(row.remote_commit_match, true);
    const localBytes = await readFile(join(objectRoot, row.sha));
    const local = commitFields(localBytes, row.sha);
    assert.equal(row.local_commit_object_sha256, sha256(localBytes));
    assert.equal(row.local_tree, local.tree);
    assert.deepEqual(row.local_parents, local.parents);
    const filename = `${row.repository.replace("/", "--")}--${row.sha}.json`;
    expectedResponseFiles.add(filename);
    const raw = await readFile(join(auditDir, "responses", filename));
    assert.equal(row.response_sha256, sha256(raw), `raw response changed: ${key}`);
    const captured = JSON.parse(raw);
    assert.equal(captured.sha, row.sha);
    assert.equal(captured.tree?.sha, local.tree);
    assert.deepEqual(captured.parents?.map((item) => item.sha), local.parents);
    if (live) {
      const current = spawnSync("gh", ["api", "--method", "GET", row.endpoint], {
        encoding: "utf8", shell: false, timeout: 30000, maxBuffer: 2 * 1024 * 1024
      });
      assert.equal(current.status, 0, `live upstream fetch failed for ${key}: ${current.stderr}`);
      const remote = JSON.parse(current.stdout);
      assert.equal(remote.sha, row.sha);
      assert.equal(remote.tree?.sha, local.tree);
      assert.deepEqual(remote.parents?.map((item) => item.sha), local.parents);
    }
  }
  assert.deepEqual(seen, new Set(expected.keys()), "selected commit set incomplete");
  assert.deepEqual(
    new Set(await readdir(join(auditDir, "responses"))),
    expectedResponseFiles,
    "response inventory differs from exact selected commit set"
  );
  return {
    commits: seen.size,
    repositories: new Set(receipt.results.map((row) => row.repository)).size,
    mode: live ? "live-and-retained" : "retained-only",
    d3_labels_or_predictions_checked: false
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--live"));
  console.log(JSON.stringify(await verifyAudit(defaultAuditDir, { live: process.argv[2] === "--live" })));
}
