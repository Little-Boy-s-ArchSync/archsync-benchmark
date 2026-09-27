import assert from 'node:assert/strict';
import { restoreCopy, verifyTransfer } from './transfer.mjs';
import { openObjectSource } from './object-source.mjs';

const [mode, ...args] = process.argv.slice(2);
let report;
if (mode === 'restore-copy') {
  assert.equal(args.length, 3, 'restore-copy ABS_SOURCE ABS_NEW_COPY TRANSFER_SHA256');
  report = await restoreCopy({ source: args[0], destination: args[1], expectedSha256: args[2] });
} else if (mode === 'verify-transfer') {
  assert.equal(args.length, 2, 'verify-transfer ABS_PACKET TRANSFER_SHA256');
  const result = await verifyTransfer(...args);
  report = { status: 'TRANSFER_BYTES_VERIFIED_NOT_MODES_OR_LABELS', files: result.manifest.files.length, research_complete: false };
} else {
  assert.equal(mode, 'verify-object', 'Modes: restore-copy, verify-transfer, verify-object');
  assert.equal(args.length, 2, 'verify-object ABS_OBJECT_PACKET OBJECT_MANIFEST_SHA256');
  const source = await openObjectSource(...args);
  let regular = 0;
  const symlinks = [];
  for (const entry of source.entries) {
    if (entry.mode === '120000') { source.inspectLink(entry.path); symlinks.push({ path: entry.path, git_blob: entry.git_blob, mode: entry.mode }); }
    else { source.readRegularFile(entry.path); regular++; }
  }
  report = { status: 'OBJECT_SOURCE_READABLE_NOT_EXECUTION_APPROVED', repository: source.repository,
    object_manifest_sha256: source.manifest_sha256, tracked_entries: source.entries.length,
    regular_files_read: regular, preserved_symlinks: symlinks, research_complete: false };
}
console.log(JSON.stringify(report, null, 2));
