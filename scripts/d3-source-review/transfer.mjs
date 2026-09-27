import assert from 'node:assert/strict';
import { chmod, lstat, mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { serializeRepositoryCaptureManifest } from '../lib/holdout-repeat-capture.mjs';
import { isSafeHoldoutPath } from '../lib/holdout.mjs';
import { directory, inventory, plainFile, sha256 } from './files.mjs';

export async function verifyTransfer(source, expectedSha256) {
  const root = await directory(source);
  assert(/^[a-f0-9]{64}$/u.test(expectedSha256), 'Separately supplied transfer digest required');
  const bytes = await plainFile(root, 'TRANSFER-MANIFEST.json', 16 * 1024 * 1024);
  assert.equal(sha256(bytes), expectedSha256, 'Transfer digest mismatch');
  assert.equal((await plainFile(root, 'TRANSFER-MANIFEST.sha256')).toString('utf8').trim(), expectedSha256);
  const manifest = JSON.parse(bytes);
  assert.equal(manifest.schema, 'archsync-d3-source-transfer/1');
  assert.equal(manifest.research_complete, false);
  assert(Array.isArray(manifest.files) && manifest.files.length > 0);
  const controls = ['TRANSFER-MANIFEST.json', 'TRANSFER-MANIFEST.sha256'];
  const paths = new Set();
  for (const file of manifest.files) {
    assert(isSafeHoldoutPath(file.path) && !controls.includes(file.path) && !paths.has(file.path.toLowerCase()), 'Unsafe or duplicate transfer path');
    paths.add(file.path.toLowerCase());
    assert(Number.isSafeInteger(file.bytes) && file.bytes >= 0 && /^[a-f0-9]{64}$/u.test(file.sha256), 'Invalid transfer record');
  }
  const directories = [];
  assert.deepEqual(await inventory(root, directories), [...manifest.files.map((file) => file.path), ...controls].sort(), 'Missing or extra transfer files');
  for (const file of manifest.files) {
    const content = await plainFile(root, file.path);
    assert.equal(content.length, file.bytes, `Size changed: ${file.path}`);
    assert.equal(sha256(content), file.sha256, `Bytes changed: ${file.path}`);
  }
  return { root, manifest, directories };
}

export async function restoreCopy({ source, destination, expectedSha256 }) {
  const { root, manifest, directories } = await verifyTransfer(source, expectedSha256);
  assert(typeof destination === 'string' && isAbsolute(destination), 'Absolute new destination required');
  const target = resolve(destination);
  await directory(dirname(target));
  assert(![relative(root, target), relative(target, root)].some((path) => path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith('..' + sep))), 'Copy must be outside original packet');
  try { await lstat(target); throw new Error('Destination already exists'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const locations = JSON.parse(await plainFile(root, 'PORTABLE-LOCATIONS.json'));
  assert.equal(locations.schema, 1);
  assert(Array.isArray(locations.regular_sources) && locations.regular_sources.length > 0);
  const records = new Map(manifest.files.map((file) => [file.path, file]));
  const modes = new Map();
  for (const item of locations.regular_sources) {
    assert(isSafeHoldoutPath(item.source) && isSafeHoldoutPath(item.manifest), 'Unsafe portable location');
    const capture = JSON.parse(await plainFile(root, item.manifest));
    serializeRepositoryCaptureManifest(capture, item.capture_manifest_sha256);
    assert.equal(capture.repository.id, item.repository);
    for (const entry of capture.repository.tracked_files) {
      const path = item.source + '/' + entry.path;
      assert(records.has(path) && !modes.has(path) && records.get(path).sha256 === entry.sha256, 'Unbound or duplicate mode entry');
      modes.set(path, entry.mode === '100755' ? 0o755 : 0o644);
    }
  }
  // Validate every input before creating a new copy. Never modify the original.
  await mkdir(target, { mode: 0o755 });
  // Empty directories (notably bare Git refs/) are required by the original
  // offline verifier. The transfer schema hashes files, not directory metadata.
  for (const path of directories) await mkdir(join(target, path), { recursive: true, mode: 0o755 });
  const files = [...manifest.files, ...await Promise.all(['TRANSFER-MANIFEST.json', 'TRANSFER-MANIFEST.sha256'].map(async (path) => {
    const bytes = await plainFile(root, path);
    return { path, bytes: bytes.length, sha256: sha256(bytes) };
  }))];
  for (const entry of files) {
    const bytes = await plainFile(root, entry.path);
    assert.equal(sha256(bytes), entry.sha256, 'Source changed while copying');
    const path = join(target, entry.path);
    await mkdir(dirname(path), { recursive: true, mode: 0o755 });
    await writeFile(path, bytes, { flag: 'wx', mode: modes.get(entry.path) ?? 0o644 });
    await chmod(path, modes.get(entry.path) ?? 0o644);
  }
  const copy = await verifyTransfer(target, expectedSha256);
  assert.deepEqual(copy.directories.sort(), directories.sort(), 'Directory layout changed during copy');
  if (process.platform !== 'win32') {
    for (const [path, mode] of modes) assert.equal((await lstat(join(target, path))).mode & 0o777, mode, `POSIX mode not restored: ${path}`);
  }
  return { status: 'NEW_REVIEW_COPY_BYTES_VERIFIED', transfer_manifest_sha256: expectedSha256,
    original_unchanged: true, files: files.length, copied_directories: directories.length,
    directory_layout: 'copied-from-extraction-not-hash-bound-by-transfer-schema', tracked_regular_files: modes.size,
    tracked_executable_files: [...modes.values()].filter((mode) => mode === 0o755).length,
    posix_modes_verified: process.platform !== 'win32', platform: process.platform, node: process.versions.node,
    created_at: new Date().toISOString(), research_complete: false };
}
