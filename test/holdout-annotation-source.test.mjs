import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { verifyAnnotationSourceEvidence } from "../scripts/lib/holdout-annotation-source.mjs";
import { computeTrackedTreeSha256, validateIndependentAnnotations } from "../scripts/lib/holdout.mjs";
import { createRepositoryCaptureManifest } from "../scripts/lib/holdout-repeat-capture.mjs";
import { createGitRepositoryAdapters } from "../scripts/lib/holdout-repository.mjs";
import { fixture as gitFixture } from "../test-support/holdout-git-fixture.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const encode = (value) => `${JSON.stringify(value, null, 2)}\n`;

// Explicit software fixtures only, never D3 sources or human decisions.
function fixture(content = "const a = 1;\nexport { a };\n") {
  const trackedEntries = [{ path: "LICENSE", content: "MIT fixture only\n" }, { path: "src/main.ts", content }];
  const pin = {
    id: "synthetic-alpha", url: "https://github.com/example/synthetic-alpha", commit: "a".repeat(40),
    license_spdx: "MIT", license_file: "LICENSE", license_sha256: hash(trackedEntries[0].content),
    scope: "src", retrieved_at: "2026-09-27T00:00:00Z", tree_sha256: computeTrackedTreeSha256(trackedEntries),
    environment: { node: "22.16.0", package_manager: "pnpm@11.16.0", platform: "win32", arch: "x64" },
    tracked_files: trackedEntries.map(({ path, content }) => {
      const bytes = Buffer.from(content);
      return { path, mode: "100644", sha256: hash(bytes), git_blob: createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex") };
    }),
  };
  const captureManifest = createRepositoryCaptureManifest(pin);
  const annotations = ["synthetic-a", "synthetic-b"].map((reviewer_id) => ({
    item_id: "synthetic-item", reviewer_id, label: "unknown", confidence: 0,
    evidence_file: "src/main.ts", evidence_line: 1, saw_prediction: false,
    repository_id: pin.id, repository_commit: pin.commit,
  }));
  return { annotations, captureManifest, expectedCaptureSha256: captureManifest.manifest_sha256, trackedEntries };
}

test("source-bound check catches nonexistent evidence accepted by shape-only validation", () => {
  const input = fixture();
  input.annotations.forEach((row) => { row.evidence_file = "src/nonexistent.ts"; row.evidence_line = 9000; });
  assert.deepEqual(validateIndependentAnnotations(input.annotations), []);
  assert.throws(() => verifyAnnotationSourceEvidence(input), /FILE_OUTSIDE_CAPTURE_SCOPE/);
});

test("source verification binds immutable capture, annotation bytes and exact physical locations without approval", () => {
  const input = fixture();
  input.annotations[1].evidence_line = 2;
  const before = encode(input);
  const receipt = verifyAnnotationSourceEvidence(input);
  assert.equal(encode(input), before);
  assert.equal(receipt.status, "SOURCE_LOCATIONS_VERIFIED");
  assert.equal(receipt.research_closure, false);
  assert.equal(receipt.capture_manifest_sha256, input.expectedCaptureSha256);
  assert.equal(receipt.annotation_rows_sha256, hash(encode(input.annotations)));
  assert.deepEqual(receipt.evidence.map((row) => [row.evidence_line, row.line_count]), [[1, 2], [2, 2]]);
  const { receipt_sha256, ...body } = receipt;
  assert.equal(receipt_sha256, hash(encode(body)));
  assert.deepEqual(verifyAnnotationSourceEvidence({ ...input, trackedEntries: input.trackedEntries.toReversed() }), receipt);
  input.annotations[0].confidence = 0.1;
  assert.notEqual(verifyAnnotationSourceEvidence(input).annotation_rows_sha256, receipt.annotation_rows_sha256);
});

test("snapshot and pin mutation cannot be validated against the separately retained capture digest", () => {
  const input = fixture();
  assert.throws(() => verifyAnnotationSourceEvidence({ ...input, expectedCaptureSha256: "0".repeat(64) }), /MANIFEST_CHANGED/);
  for (const entries of [[], null, [input.trackedEntries[1]], [...input.trackedEntries, input.trackedEntries[0]], [{ path: "LICENSE", content: "changed" }, input.trackedEntries[1]], [...input.trackedEntries, { path: "src/extra.ts", content: "extra" }]]) {
    assert.throws(() => verifyAnnotationSourceEvidence({ ...input, trackedEntries: entries }));
  }
  const badBlob = structuredClone(input.captureManifest.repository);
  badBlob.tracked_files[0].git_blob = "0".repeat(40);
  const updated = createRepositoryCaptureManifest(badBlob);
  assert.throws(() => verifyAnnotationSourceEvidence({ ...input, captureManifest: updated, expectedCaptureSha256: updated.manifest_sha256 }), /BLOB_MISMATCH/);
});

test("wrong repository/commit, unsafe paths, out-of-scope paths and malformed annotations fail closed", () => {
  for (const change of [{ repository_id: "other" }, { repository_commit: "b".repeat(40) }, { repository_commit: undefined }]) {
    const input = fixture(); Object.assign(input.annotations[0], change);
    assert.throws(() => verifyAnnotationSourceEvidence(input), /REPOSITORY_MISMATCH/);
  }
  for (const evidence_file of ["../src/main.ts", "C:/src/main.ts", "src\\main.ts", "src//main.ts", "LICENSE", "src/MAIN.ts", "src/missing.ts"]) {
    const input = fixture(); input.annotations[0].evidence_file = evidence_file;
    assert.throws(() => verifyAnnotationSourceEvidence(input), /FILE_OUTSIDE_CAPTURE_SCOPE/);
  }
  const input = fixture();
  for (const annotations of [[], null, [input.annotations[0]], [input.annotations[0], input.annotations[0]], [{ ...input.annotations[0], saw_prediction: true }, input.annotations[1]]]) {
    assert.throws(() => verifyAnnotationSourceEvidence({ ...input, annotations }), /ROWS_INVALID/);
  }
  input.annotations[0].evidence_line = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(() => verifyAnnotationSourceEvidence(input), /LINE_INVALID/);
});

test("line counting preserves LF/CRLF/CR, Unicode and terminal-newline boundaries", () => {
  for (const [content, count] of [["a\nb", 2], ["a\r\nb\r\n", 2], ["a\rb\r", 2], ["a\n", 1], ["\n", 1], ["", 0], ["a\n\n", 2], ["a\u2028b", 2], ["a\u2029b\u2029", 2], ["a\u0085b", 1], [Buffer.from("\ufeffXin chào\r\n世界"), 2]]) {
    const input = fixture(content);
    if (count > 0) {
      input.annotations.forEach((row) => { row.evidence_line = count; });
      const receipt = verifyAnnotationSourceEvidence(input);
      assert.equal(receipt.evidence[0].line_count, count);
      assert.equal(receipt.evidence[0].file_sha256, hash(content));
    }
    input.annotations.forEach((row) => { row.evidence_line = count + 1; });
    assert.throws(() => verifyAnnotationSourceEvidence(input), /LINE_OUT_OF_RANGE/);
  }
});

test("binary or invalid UTF-8 evidence and oversize source captures are rejected", () => {
  assert.throws(() => verifyAnnotationSourceEvidence(fixture(Buffer.from([0xc3, 0x28]))), /SOURCE_NOT_UTF8/);
  assert.throws(() => verifyAnnotationSourceEvidence(fixture("a\0b")), /SOURCE_BINARY/);
  assert.throws(() => verifyAnnotationSourceEvidence(fixture(Buffer.alloc(64 * 1024 * 1024, 65))), /SIZE_LIMIT/);
});

test("controlled local Git capture feeds source verification without remote retrieval or inference", async (t) => {
  const f = await gitFixture(t);
  const adapters = createGitRepositoryAdapters(f.options);
  const checkout = await adapters.clone(f.pin);
  const observation = await adapters.inspect(checkout, f.pin);
  const captureManifest = createRepositoryCaptureManifest({ ...f.pin, ...observation });
  const trackedEntries = await Promise.all(observation.tracked_files.map(async ({ path }) => ({ path, content: await readFile(join(checkout, path)) })));
  const annotations = fixture().annotations.map((row) => ({ ...row,
    repository_id: f.pin.id, repository_commit: f.pin.commit, evidence_file: "packages/api/index.ts",
  }));
  const input = { annotations, captureManifest, expectedCaptureSha256: captureManifest.manifest_sha256, trackedEntries };
  const receipt = verifyAnnotationSourceEvidence(input);
  assert.equal(receipt.repository_commit, f.pin.commit);
  assert.equal(receipt.evidence[0].line_count, 1);
  assert.equal(receipt.evidence[0].file_sha256, observation.tracked_files.find((row) => row.path === "packages/api/index.ts").sha256);
  assert.equal(f.calls.filter((call) => call.args.includes("fetch")).length, 1);
  trackedEntries.find((entry) => entry.path === "other/Z.ts").content = Buffer.from("changed outside cited scope\n");
  assert.throws(() => verifyAnnotationSourceEvidence(input), /TREE_MISMATCH/);
});
