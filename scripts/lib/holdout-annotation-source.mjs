import { createHash } from "node:crypto";

import { computeTrackedTreeSha256, isSafeHoldoutPath, validateIndependentAnnotations } from "./holdout.mjs";
import { serializeRepositoryCaptureManifest } from "./holdout-repeat-capture.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const encode = (value) => `${JSON.stringify(value, null, 2)}\n`;

/**
 * Read-only mechanical check of a single repository's annotation packet.
 * The capture digest must come from separately reviewed immutable input.
 * No fetching, inference, label approval, freeze, or human authentication occurs.
 */
export function verifyAnnotationSourceEvidence({ annotations, captureManifest, expectedCaptureSha256, trackedEntries }) {
  const canonical = JSON.parse(serializeRepositoryCaptureManifest(captureManifest, expectedCaptureSha256));
  const pin = canonical.repository;
  if (validateIndependentAnnotations(annotations).length > 0) throw new Error("HOLDOUT_ANNOTATION_ROWS_INVALID");
  // Complete source bytes, not merely the cited files, must bind to the capture.
  if (computeTrackedTreeSha256(trackedEntries) !== pin.tree_sha256 || trackedEntries.length !== pin.tracked_files.length) throw new Error("HOLDOUT_ANNOTATION_TREE_MISMATCH");
  const files = new Map(trackedEntries.map((entry) => [entry.path, Buffer.from(entry.content)]));
  let totalBytes = 0;
  for (const entry of pin.tracked_files) {
    // A matching tree covers paths and SHA-256, but also verify retained Git IDs.
    const bytes = files.get(entry.path);
    const blob = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    if (blob !== entry.git_blob) throw new Error("HOLDOUT_ANNOTATION_BLOB_MISMATCH");
    totalBytes += bytes.length;
  }
  if (totalBytes > 64 * 1024 * 1024) throw new Error("HOLDOUT_ANNOTATION_SIZE_LIMIT");

  const inspectedFiles = new Map();
  const evidence = annotations.map((row, index) => {
    if (row.repository_id !== pin.id || row.repository_commit !== pin.commit) throw new Error("HOLDOUT_ANNOTATION_REPOSITORY_MISMATCH");
    if (!isSafeHoldoutPath(row.evidence_file) || !row.evidence_file.startsWith(`${pin.scope}/`) || !files.has(row.evidence_file)) throw new Error("HOLDOUT_ANNOTATION_FILE_OUTSIDE_CAPTURE_SCOPE");
    if (!Number.isSafeInteger(row.evidence_line)) throw new Error("HOLDOUT_ANNOTATION_LINE_INVALID");
    if (!inspectedFiles.has(row.evidence_file)) {
      const bytes = files.get(row.evidence_file);
      let source;
      try {
        source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw new Error("HOLDOUT_ANNOTATION_SOURCE_NOT_UTF8");
      }
      if (source.includes("\0")) throw new Error("HOLDOUT_ANNOTATION_SOURCE_BINARY");
      // Match TypeScript's LF/CRLF/CR/U+2028/U+2029 source line boundaries.
      // A terminal delimiter does not add
      // an evidence-bearing phantom line; an empty file has no physical lines.
      const lineCount = source.length === 0 ? 0 : source.split(/\r\n|[\r\n\u2028\u2029]/u).length - (/[\r\n\u2028\u2029]$/u.test(source) ? 1 : 0);
      inspectedFiles.set(row.evidence_file, { line_count: lineCount, file_sha256: hash(bytes) });
    }
    const file = inspectedFiles.get(row.evidence_file);
    if (row.evidence_line > file.line_count) throw new Error("HOLDOUT_ANNOTATION_LINE_OUT_OF_RANGE");
    return { row_index: index, evidence_file: row.evidence_file, evidence_line: row.evidence_line, ...file };
  });

  const body = {
    schema_version: 1,
    scope: "annotation-source-location-only",
    status: "SOURCE_LOCATIONS_VERIFIED",
    research_closure: false,
    repository_id: pin.id,
    repository_commit: pin.commit,
    capture_manifest_sha256: canonical.manifest_sha256,
    annotation_rows_sha256: hash(encode(annotations)),
    evidence,
  };
  return { ...body, receipt_sha256: hash(encode(body)) };
}
