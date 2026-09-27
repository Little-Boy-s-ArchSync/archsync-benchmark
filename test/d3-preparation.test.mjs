import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createRepositoryCaptureManifest } from '../scripts/lib/holdout-repeat-capture.mjs';
import { reviewerLedger, verifyCapturedTree } from '../scripts/verify-d3-preparation.mjs';

const hash = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
async function fixture(t) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'archsync-d3-preparation-test-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'src'));
  const files = [{ path: 'LICENSE', content: Buffer.from('Controlled test fixture only') }, { path: 'src/app.ts', content: Buffer.from('export {};\n') }];
  for (const entry of files) await writeFile(join(directory, entry.path), entry.content);
  const entries = files.map(({ path, content }) => ({ path, mode: '100644', git_blob: hash(Buffer.concat([Buffer.from(`blob ${content.length}\0`), content]), 'sha1'), sha256: hash(content) }));
  const manifest = createRepositoryCaptureManifest({
    id: 'controlled/fixture', url: 'https://github.com/controlled/fixture', commit: 'a'.repeat(40), scope: 'src',
    license_spdx: 'MIT', license_file: 'LICENSE', license_sha256: entries[0].sha256,
    tree_sha256: hash(entries.map((entry) => `${entry.path}\0${entry.sha256}`).join('\n')),
    retrieved_at: '2026-09-27T00:00:00.000Z', environment: { node: '22.16.0', package_manager: 'npm@10.9.2', platform: 'win32', arch: 'x64' }, tracked_files: entries,
  });
  return { directory, manifest };
}

test('verifies actual bytes against pinned digests without claiming annotation', async (t) => {
  const { directory, manifest } = await fixture(t);
  const result = await verifyCapturedTree(manifest, directory, manifest.manifest_sha256);
  assert.equal(result.files, 2);
  assert(!Object.hasOwn(result, 'accuracy'));
});
test('rejects changed source and added files', async (t) => {
  const { directory, manifest } = await fixture(t);
  await writeFile(join(directory, 'src/app.ts'), 'changed');
  await assert.rejects(verifyCapturedTree(manifest, directory, manifest.manifest_sha256), /SHA-256 changed/u);
  await writeFile(join(directory, 'src/app.ts'), 'export {};\n');
  await writeFile(join(directory, 'src/extra.ts'), 'extra');
  await assert.rejects(verifyCapturedTree(manifest, directory, manifest.manifest_sha256), /Untracked or unsafe/u);
});
test('rejects missing source and changed receipt hash', async (t) => {
  const { directory, manifest } = await fixture(t);
  await assert.rejects(verifyCapturedTree(manifest, directory, '0'.repeat(64)), /MANIFEST_CHANGED/u);
  await rm(join(directory, 'src/app.ts'));
  await assert.rejects(verifyCapturedTree(manifest, directory, manifest.manifest_sha256), /Captured files missing/u);
});
test('reviewer ledger leaves identities, decisions and completion blank', () => {
  const population = { status: 'proposed-source-inventory-not-labels', predictions_executed: false, human_annotations_present: false,
    repository: 'controlled/fixture', commit: 'a'.repeat(40), files: [{ path: 'src/a,b.ts', sha256: 'b'.repeat(64), physical_lines: 2, proposed_exclusion: null }] };
  const ledger = reviewerLedger(population);
  assert(ledger.includes('"src/a,b.ts"'));
  assert(ledger.endsWith('"2","","","","",""\n'));
  assert.throws(() => reviewerLedger({ ...population, human_annotations_present: true }));
  assert.throws(() => reviewerLedger({ ...population, predictions_executed: true }));
});
