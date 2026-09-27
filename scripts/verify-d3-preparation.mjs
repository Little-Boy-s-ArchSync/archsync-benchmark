import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serializeRepositoryCaptureManifest } from './lib/holdout-repeat-capture.mjs';
import { matchesTrackedExecutableMode } from './lib/holdout-repository.mjs';

const hash = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const csv = (value) => `"${String(value).replaceAll('"', '""')}"`;

export async function verifyCapturedTree(manifest, source, expectedDigest) {
  serializeRepositoryCaptureManifest(manifest, expectedDigest);
  assert(isAbsolute(source) && await realpath(source) === source, 'Source must be a canonical absolute path');
  const entries = new Map(manifest.repository.tracked_files.map((entry) => [entry.path, entry]));
  const seen = new Set();
  let totalBytes = 0;
  const metadata = [];
  async function walk(directory, prefix) {
    for (const name of await readdir(directory)) {
      const path = `${prefix}${name}`;
      const absolute = join(directory, name);
      const stat = await lstat(absolute);
      if (stat.isDirectory()) {
        assert([...entries.keys()].some((key) => key.startsWith(`${path}/`)), `Untracked directory: ${path}`);
        await walk(absolute, `${path}/`);
      } else {
        const expected = entries.get(path);
        assert(expected && stat.isFile() && stat.nlink === 1, `Untracked or unsafe file: ${path}`);
        assert(matchesTrackedExecutableMode(stat.mode, expected.mode), `Mode changed: ${path}`);
        const bytes = await readFile(absolute);
        assert.equal(hash(bytes), expected.sha256, `SHA-256 changed: ${path}`);
        assert.equal(hash(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]), 'sha1'), expected.git_blob, `Git blob changed: ${path}`);
        seen.add(path);
        totalBytes += bytes.length;
        metadata.push({ path, bytes: bytes.length });
      }
    }
  }
  await walk(source, '');
  assert.equal(seen.size, entries.size, 'Captured files missing');
  assert(totalBytes <= 64 * 1024 * 1024, 'Capture exceeds declared limit');
  return { files: seen.size, bytes: totalBytes, metadata };
}

export function reviewerLedger(population) {
  assert.equal(population.status, 'proposed-source-inventory-not-labels');
  assert.equal(population.predictions_executed, false);
  assert.equal(population.human_annotations_present, false);
  const header = ['repository_id', 'repository_commit', 'file', 'sha256', 'physical_lines', 'proposed_exclusion', 'reviewer_id', 'reviewed_at_utc', 'inspection_complete', 'notes'];
  const rows = population.files.map((file) => [population.repository, population.commit, file.path, file.sha256, file.physical_lines, file.proposed_exclusion ?? '', '', '', '', '']);
  return [header, ...rows].map((row) => row.map(csv).join(',')).join('\n') + '\n';
}

export async function verifyPreparation(directory, writePackets = false) {
  const summaryBytes = await readFile(join(directory, 'collection-summary.json'));
  const summary = JSON.parse(summaryBytes);
  const selectionBytes = await readFile(join(directory, 'selection-before-capture.json'));
  const selection = JSON.parse(selectionBytes);
  assert.equal(hash(selectionBytes), summary.selection_sha256, 'Selection receipt changed');
  assert.equal(summary.predictions_executed, false);
  assert.equal(summary.independent_labels_present, false);
  assert.equal(summary.research_complete, false);
  assert.deepEqual(summary.results.map((row) => row.id), selection.repositories.map((row) => row.id));
  const results = [];
  for (const item of summary.results) {
    const folder = join(directory, item.id.replace('/', '--'));
    const receipt = JSON.parse(await readFile(join(folder, 'capture-receipt.json')));
    assert.deepEqual(receipt, item, 'Capture receipt changed');
    if (item.status === 'CAPTURE_FAILED') {
      assert.equal(typeof item.error, 'string');
      results.push({ repository: item.id, status: 'RETAINED_CAPTURE_FAILURE', error: item.error });
      continue;
    }
    assert.equal(item.status, 'SOURCE_CAPTURED_NOT_D3_COMPLETE');
    const manifest = JSON.parse(await readFile(join(folder, 'capture-manifest.json')));
    const populationBytes = await readFile(join(folder, 'annotation-source-inventory.json'));
    const population = JSON.parse(populationBytes);
    assert.equal(hash(populationBytes), item.population_sha256, 'Source population changed');
    const selected = selection.repositories.find((repo) => repo.id === item.id);
    for (const field of ['id', 'commit', 'scope', 'url', 'license_file', 'license_spdx']) {
      assert.equal(manifest.repository[field], selected[field], `Selected ${field} changed`);
    }
    assert.equal(population.repository, item.id);
    assert.equal(population.commit, item.commit);
    assert.equal(population.scope, item.scope);
    assert.equal(population.capture_manifest_sha256, item.capture_manifest_sha256);
    const { source } = JSON.parse(await readFile(join(folder, 'local-source-location.json')));
    const verified = await verifyCapturedTree(manifest, source, item.capture_manifest_sha256);
    const expectedFiles = manifest.repository.tracked_files.filter((file) => file.path.startsWith(`${item.scope}/`) && /\.tsx?$/u.test(file.path));
    assert.deepEqual(population.files.map((file) => file.path).sort(), expectedFiles.map((file) => file.path).sort(), 'Population omits or adds TypeScript files');
    for (const file of population.files) {
      assert.equal(file.sha256, expectedFiles.find((entry) => entry.path === file.path).sha256);
      const bytes = await readFile(join(source, file.path));
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      // Independent line-boundary count, including non-ASCII TypeScript separators.
      const boundaries = [...text.matchAll(/\r\n|[\r\n\u2028\u2029]/gu)].length;
      const terminal = text.length > 0 && /[\r\n\u2028\u2029]$/u.test(text);
      assert.equal(file.physical_lines, text.length === 0 ? 0 : boundaries + (terminal ? 0 : 1));
      const expectedExclusion = /\.d\.ts$/u.test(file.path) ? 'declaration' : /(?:^|\/)(?:test|tests|__tests__|fixtures|__fixtures__|__mocks__)(?:\/|$)|\.(?:test|spec)\.tsx?$/u.test(file.path) ? 'test-or-fixture' : null;
      assert.equal(file.proposed_exclusion, expectedExclusion, 'Population exclusion changed');
    }
    const ledger = reviewerLedger(population);
    if (writePackets) {
      for (const reviewer of ['a', 'b']) {
        await writeFile(join(folder, `reviewer-${reviewer}-file-ledger.csv`), ledger, { flag: 'wx' });
        await writeFile(join(folder, `reviewer-${reviewer}-observations.csv`), 'item_id,repository_id,repository_commit,reviewer_id,unit_type,source_component,target_component,relationship_type,label,evidence_file,evidence_line,rationale,confidence,saw_prediction\n', { flag: 'wx' });
      }
    }
    results.push({ repository: item.id, status: 'BYTES_VERIFIED_NOT_LABELS', files: verified.files, bytes: verified.bytes,
      scoped_typescript_files: population.files.length,
      proposed_review_files: population.files.filter((file) => file.proposed_exclusion === null).length,
      scoped_physical_lines: population.files.reduce((n, file) => n + file.physical_lines, 0),
      proposed_review_physical_lines: population.files.filter((file) => file.proposed_exclusion === null).reduce((n, file) => n + file.physical_lines, 0),
      ledger_sha256: hash(ledger),
    });
  }
  const report = { scope: 'mechanical-source-preparation-only', summary_sha256: hash(summaryBytes), results, research_complete: false, verified_at: new Date().toISOString() };
  if (writePackets) await writeFile(join(directory, 'packet-verification.json'), json(report), { flag: 'wx' });
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [directory, option] = process.argv.slice(2);
  assert(directory && isAbsolute(directory) && [undefined, '--write-packets'].includes(option), 'Usage: node scripts/verify-d3-preparation.mjs ABS_CAPTURE_DIR [--write-packets]');
  console.log(json(await verifyPreparation(directory, option === '--write-packets')));
}
