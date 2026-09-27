import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { isHoldoutRepositoryUrl, isSafeHoldoutPath, validateIndependentAnnotations } from '../lib/holdout.mjs';
import { directory, gitId, plainFile, sha256 } from './files.mjs';

const opened = new WeakMap();
const oid = /^[a-f0-9]{40}$/u;
const decode = (bytes) => new TextDecoder('utf-8', { fatal: true }).decode(bytes);

/** Distinct read-only object representation. Never converts links to regular files. */
export async function openObjectSource(path, expectedSha256) {
  const root = await directory(path);
  assert(/^[a-f0-9]{64}$/u.test(expectedSha256), 'Reviewed object-manifest digest required');
  const bytes = await plainFile(root, 'object-manifest.json', 16 * 1024 * 1024);
  assert.equal(sha256(bytes), expectedSha256, 'Object manifest changed');
  const manifest = JSON.parse(bytes);
  assert.equal(manifest.schema, 'd3-git-object-packet/1');
  assert.equal(manifest.status, 'preparation-only-not-execution-approved');
  assert.equal(manifest.predictions_executed, false);
  assert.equal(manifest.independent_labels_present, false);
  assert(isSafeHoldoutPath(manifest.repository.scope) && oid.test(manifest.repository.commit));
  assert(typeof manifest.repository.id === 'string' && manifest.repository.id.trim());
  assert(isHoldoutRepositoryUrl(manifest.repository.url) && isSafeHoldoutPath(manifest.repository.license_file));
  const selectionBytes = await plainFile(root, 'selection-before-fetch.json');
  assert.equal(sha256(selectionBytes), manifest.selection_sha256);
  assert.deepEqual(JSON.parse(selectionBytes).repository, manifest.repository);
  const commit = await plainFile(root, 'git-commit.raw');
  assert.equal(gitId('commit', commit), manifest.repository.commit, 'Commit changed');
  const rootTree = /^tree ([a-f0-9]{40})\n/u.exec(decode(commit))?.[1];
  assert(rootTree, 'Root tree missing');
  const entries = [];
  const trees = new Set();
  async function tree(id, prefix = '', depth = 0) {
    assert(oid.test(id) && depth < 100 && entries.length < 100000, 'Invalid tree or recursion limit');
    const raw = await plainFile(root, `trees/${id}`);
    assert.equal(gitId('tree', raw), id, 'Tree changed');
    trees.add(id);
    let offset = 0;
    const names = new Set();
    while (offset < raw.length) {
      const space = raw.indexOf(32, offset);
      const nul = raw.indexOf(0, space + 1);
      assert(space > offset && nul > space && nul + 21 <= raw.length, 'Malformed tree');
      const mode = raw.subarray(offset, space).toString('ascii');
      const name = decode(raw.subarray(space + 1, nul));
      assert(isSafeHoldoutPath(name) && !name.includes('/') && !names.has(name.toLowerCase()), 'Unsafe or aliased tree name');
      names.add(name.toLowerCase());
      const child = raw.subarray(nul + 1, nul + 21).toString('hex');
      offset = nul + 21;
      if (mode === '40000') await tree(child, `${prefix}${name}/`, depth + 1);
      else {
        assert(['100644', '100755', '120000'].includes(mode), 'Unsupported Git mode');
        entries.push({ path: prefix + name, mode, git_blob: child });
      }
    }
  }
  await tree(rootTree);
  assert.deepEqual((await readdir(join(root, 'trees'))).sort(), [...trees].sort(), 'Missing/extra trees');
  assert(Array.isArray(manifest.entries) && manifest.entries.length > 0 && manifest.entries.length <= 100000);
  assert.deepEqual(manifest.entries.map(({ path, mode, git_blob }) => ({ path, mode, git_blob })), entries, 'Manifest/tree disagreement');
  const listing = await plainFile(root, 'git-ls-tree.raw');
  assert.equal(sha256(listing), manifest.raw_tree_sha256);
  const parsed = decode(listing).split('\0');
  assert.equal(parsed.pop(), '');
  assert.deepEqual(parsed.map((row) => {
    const match = /^(100644|100755|120000) blob ([a-f0-9]{40}) +([0-9]+)\t(.+)$/u.exec(row);
    assert(match, 'Malformed tree listing');
    return { path: match[4], mode: match[1], git_blob: match[2], bytes: Number(match[3]) };
  }), manifest.entries.map(({ path, mode, git_blob, bytes }) => ({ path, mode, git_blob, bytes })), 'Listing disagreement');
  const ids = [...new Set(entries.map((entry) => entry.git_blob))].sort();
  assert.deepEqual((await readdir(join(root, 'blobs'))).sort(), ids, 'Missing/extra blobs');
  const blobs = new Map();
  let total = 0;
  for (const entry of manifest.entries) {
    assert(Number.isSafeInteger(entry.bytes) && entry.bytes >= 0);
    total += entry.bytes;
    assert(total <= 64 * 1024 * 1024, 'Object byte limit');
    if (!blobs.has(entry.git_blob)) blobs.set(entry.git_blob, await plainFile(root, `blobs/${entry.git_blob}`));
    const blob = blobs.get(entry.git_blob);
    assert.equal(blob.length, entry.bytes);
    assert.equal(sha256(blob), entry.sha256, 'Blob SHA changed');
    assert.equal(gitId('blob', blob), entry.git_blob, 'Blob identity changed');
  }
  assert(entries.some((entry) => entry.path.startsWith(manifest.repository.scope + '/')), 'Scope missing');
  const index = new Map(manifest.entries.map((entry) => [entry.path, entry]));
  const license = index.get(manifest.repository.license_file);
  assert(license && license.mode !== '120000' && license.sha256 === manifest.license_sha256, 'License bytes not bound');
  const handle = Object.freeze({
    representation: 'verified-git-objects-not-filesystem', manifest_sha256: expectedSha256,
    repository: Object.freeze(structuredClone(manifest.repository)),
    entries: Object.freeze(manifest.entries.map((entry) => Object.freeze({ ...entry }))),
    research_complete: false,
    readRegularFile(path) {
      const entry = index.get(path);
      assert(entry && ['100644', '100755'].includes(entry.mode), 'Not a regular tracked file; links are never followed');
      return Buffer.from(blobs.get(entry.git_blob));
    },
    inspectLink(path) {
      const entry = index.get(path);
      assert(entry?.mode === '120000', 'Not a tracked symlink');
      return { ...entry, kind: 'symlink', target_bytes: Buffer.from(blobs.get(entry.git_blob)), dereferenced: false };
    },
  });
  opened.set(handle, { manifest, blobs });
  return handle;
}

/** Checks location consistency only, not truth, independence, agreement or freeze. */
export function verifyObjectAnnotationLocations(handle, rows) {
  assert(opened.has(handle), 'Expected verified object-source handle');
  const issues = validateIndependentAnnotations(rows);
  assert.equal(issues.length, 0, issues.join('; '));
  const { repository } = handle;
  const evidence = rows.map((row, index) => {
    assert(row.repository_id === repository.id && row.repository_commit === repository.commit, 'Wrong repository or commit');
    assert(isSafeHoldoutPath(row.evidence_file) && row.evidence_file.startsWith(repository.scope + '/'), 'Evidence outside scope');
    const bytes = handle.readRegularFile(row.evidence_file);
    const source = decode(bytes);
    assert(!source.includes('\0'), 'Binary evidence');
    const lines = source.length === 0 ? 0 : source.split(/\r\n|[\r\n\u2028\u2029]/u).length - (/[\r\n\u2028\u2029]$/u.test(source) ? 1 : 0);
    assert(row.evidence_line <= lines, 'Evidence line does not exist');
    return { row_index: index, path: row.evidence_file, line: row.evidence_line, file_sha256: sha256(bytes) };
  });
  return { status: 'OBJECT_SOURCE_LOCATIONS_VERIFIED_NOT_LABELS', research_complete: false,
    object_manifest_sha256: handle.manifest_sha256, annotations_sha256: sha256(JSON.stringify(rows)), evidence };
}
