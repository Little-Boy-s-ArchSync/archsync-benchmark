import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { link, lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import test from 'node:test';
import { createRepositoryCaptureManifest } from '../scripts/lib/holdout-repeat-capture.mjs';
import { computeTrackedTreeSha256 } from '../scripts/lib/holdout.mjs';
import { restoreCopy, verifyTransfer } from '../scripts/d3-source-review/transfer.mjs';
import { openObjectSource, verifyObjectAnnotationLocations } from '../scripts/d3-source-review/object-source.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const oid = (type, bytes) => createHash('sha1').update(Buffer.concat([Buffer.from(`${type} ${bytes.length}\0`), Buffer.from(bytes)])).digest('hex');
const encode = (value) => JSON.stringify(value, null, 2) + '\n';
async function temporary(t) {
  const parent = await realpath(tmpdir());
  const root = await realpath(await mkdtemp(join(parent, 'archsync-portable-fixture-')));
  t.after(async () => {
    assert(root.startsWith(parent + sep) && root.slice(parent.length + 1).startsWith('archsync-portable-fixture-'));
    await rm(root, { recursive: true, force: true });
  });
  return root;
}
async function put(root, path, bytes) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), bytes);
}

async function transfer(t) {
  const parent = await temporary(t);
  const source = join(parent, 'original');
  await mkdir(source);
  const tracked = [
    { path: 'LICENSE', mode: '100644', content: Buffer.from('Controlled test license, not research data.\n') },
    { path: 'src/main.ts', mode: '100644', content: Buffer.from('export {};\n') },
    { path: 'run.sh', mode: '100755', content: Buffer.from('#!/bin/sh\nexit 97\n') },
  ];
  const capture = createRepositoryCaptureManifest({
    id: 'controlled/fixture', url: 'https://github.com/controlled/fixture', commit: 'a'.repeat(40),
    license_spdx: 'MIT', license_file: 'LICENSE', license_sha256: hash(tracked[0].content), scope: 'src',
    retrieved_at: '2026-09-27T00:00:00Z', tree_sha256: computeTrackedTreeSha256(tracked),
    environment: { node: '22.16.0', package_manager: 'pnpm@11.16.0', platform: 'win32', arch: 'x64' },
    tracked_files: tracked.map(({ path, mode, content }) => ({ path, mode, git_blob: oid('blob', content), sha256: hash(content) })),
  });
  const files = new Map([
    ['PORTABLE-LOCATIONS.json', Buffer.from(encode({ schema: 1, regular_sources: [{ repository: 'controlled/fixture', source: 'data/source', manifest: 'capture.json', capture_manifest_sha256: capture.manifest_sha256 }] }))],
    ['capture.json', Buffer.from(encode(capture))],
    ...tracked.map((file) => ['data/source/' + file.path, file.content]),
  ]);
  for (const [path, content] of files) await put(source, path, content);
  const manifest = { schema: 'archsync-d3-source-transfer/1', research_complete: false,
    files: [...files].map(([path, content]) => ({ path, bytes: content.length, sha256: hash(content) })) };
  const text = encode(manifest);
  const digest = hash(text);
  await put(source, 'TRANSFER-MANIFEST.json', text);
  await put(source, 'TRANSFER-MANIFEST.sha256', digest + '\n');
  return { source, destination: join(parent, 'review-copy'), expectedSha256: digest, manifest };
}

test('portable review copy preserves bytes and restores only manifest-bound modes', async (t) => {
  const input = await transfer(t);
  const originalMode = (await lstat(join(input.source, 'data/source/run.sh'))).mode;
  const result = await restoreCopy(input);
  assert.equal(result.research_complete, false);
  assert.equal(result.tracked_executable_files, 1);
  assert.equal(result.tracked_regular_files, 3);
  assert.equal(result.posix_modes_verified, process.platform !== 'win32');
  await verifyTransfer(input.destination, input.expectedSha256);
  assert.equal((await lstat(join(input.source, 'data/source/run.sh'))).mode, originalMode);
  if (process.platform !== 'win32') assert.equal((await lstat(join(input.destination, 'data/source/run.sh'))).mode & 0o777, 0o755);
});

test('copy refuses changed bytes, wrong external digest and extra files before creating output', async (t) => {
  const input = await transfer(t);
  await assert.rejects(restoreCopy({ ...input, expectedSha256: 'b'.repeat(64) }), /digest mismatch/);
  await put(input.source, 'data/source/run.sh', 'modified');
  await assert.rejects(restoreCopy(input), /Size changed|Bytes changed/);
  await assert.rejects(lstat(input.destination), { code: 'ENOENT' });
  await put(input.source, 'extra.txt', 'unexpected');
  await assert.rejects(verifyTransfer(input.source, input.expectedSha256), /extra transfer/);
});

test('copy retains empty directory structure needed by offline bare Git repositories', async (t) => {
  const input = await transfer(t);
  await mkdir(join(input.source, 'archive.git/refs/heads'), {recursive: true});
  await mkdir(join(input.source, 'archive.git/refs/tags'), {recursive: true});
  const result = await restoreCopy(input);
  assert((await lstat(join(input.destination, 'archive.git/refs/heads'))).isDirectory());
  assert((await lstat(join(input.destination, 'archive.git/refs/tags'))).isDirectory());
  assert(result.copied_directories >= 4);
  assert.equal(result.directory_layout, 'copied-from-extraction-not-hash-bound-by-transfer-schema');
  await verifyTransfer(input.source, input.expectedSha256);
});

test('copy rejects existing or overlapping destinations and never rewrites original', async (t) => {
  const input = await transfer(t);
  await assert.rejects(restoreCopy({ ...input, destination: input.source }), /outside/);
  await assert.rejects(restoreCopy({ ...input, destination: join(input.source, '..hidden-child') }), /outside/);
  await mkdir(input.destination);
  await assert.rejects(restoreCopy(input), /already exists/);
  await verifyTransfer(input.source, input.expectedSha256);
});

test('transfer rejects unsafe and duplicate manifest paths even when a caller repins them', async (t) => {
  const input = await transfer(t);
  for (const replacement of ['../outside', input.manifest.files[1].path]) {
    const changed = structuredClone(input.manifest);
    changed.files[0].path = replacement;
    const bytes = encode(changed);
    await put(input.source, 'TRANSFER-MANIFEST.json', bytes);
    await put(input.source, 'TRANSFER-MANIFEST.sha256', hash(bytes) + '\n');
    await assert.rejects(verifyTransfer(input.source, hash(bytes)), /Unsafe or duplicate/);
  }
});

test('transfer rejects hard links and directory aliases without modifying input', async (t) => {
  const input = await transfer(t);
  const alias = join(dirname(input.source), 'alias');
  await symlink(input.source, alias, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(verifyTransfer(alias, input.expectedSha256), /alias|symlink/);
  await link(join(input.source, 'data/source/run.sh'), join(dirname(input.source), 'hardlink'));
  await assert.rejects(restoreCopy(input), /Nonregular|Unsafe/);
  await assert.rejects(lstat(input.destination), { code: 'ENOENT' });
});

async function objectFixture(t, sourceContent = 'export {};\n') {
  const root = await temporary(t);
  await mkdir(join(root, 'blobs'));
  await mkdir(join(root, 'trees'));
  const files = [
    { path: 'LICENSE', mode: '100644', content: Buffer.from('Test fixture license\n') },
    { path: 'src/app.ts', mode: '100644', content: Buffer.from(sourceContent) },
    { path: 'src/link.ts', mode: '120000', content: Buffer.from('../../not-to-be-followed') },
  ];
  const entries = files.map(({ path, mode, content }) => ({ path, mode, git_blob: oid('blob', content), bytes: content.length, sha256: hash(content) }));
  const treeEntry = (mode, name, id) => Buffer.concat([Buffer.from(`${mode} ${name}\0`), Buffer.from(id, 'hex')]);
  const child = Buffer.concat([treeEntry('100644', 'app.ts', entries[1].git_blob), treeEntry('120000', 'link.ts', entries[2].git_blob)]);
  const top = Buffer.concat([treeEntry('100644', 'LICENSE', entries[0].git_blob), treeEntry('40000', 'src', oid('tree', child))]);
  for (const bytes of [child, top]) await put(root, 'trees/' + oid('tree', bytes), bytes);
  for (const [index, file] of files.entries()) await put(root, 'blobs/' + entries[index].git_blob, file.content);
  const commit = Buffer.from(`tree ${oid('tree', top)}\n\nControlled fixture only.\n`);
  const repository = { id: 'controlled/fixture', url: 'https://github.com/controlled/fixture', commit: oid('commit', commit), scope: 'src', license_file: 'LICENSE' };
  const selection = encode({ repository });
  const listing = entries.map((entry) => `${entry.mode} blob ${entry.git_blob} ${entry.bytes}\t${entry.path}\0`).join('');
  const manifest = { schema: 'd3-git-object-packet/1', status: 'preparation-only-not-execution-approved',
    repository, selection_sha256: hash(selection), raw_tree_sha256: hash(listing), license_sha256: entries[0].sha256,
    entries, predictions_executed: false, independent_labels_present: false };
  await put(root, 'object-manifest.json', encode(manifest));
  await put(root, 'selection-before-fetch.json', selection);
  await put(root, 'git-commit.raw', commit);
  await put(root, 'git-ls-tree.raw', listing);
  return { root, manifest, digest: hash(encode(manifest)), entries };
}
function annotations(source) {
  return ['fixture-a', 'fixture-b'].map((reviewer_id) => ({ item_id: 'controlled-only', reviewer_id,
    repository_id: source.repository.id, repository_commit: source.repository.commit,
    label: 'unknown', confidence: 0.5, evidence_file: 'src/app.ts', evidence_line: 1, saw_prediction: false }));
}

test('object source preserves links as links and exposes copied regular bytes without execution', async (t) => {
  const data = await objectFixture(t);
  const source = await openObjectSource(data.root, data.digest);
  assert.equal(source.research_complete, false);
  const link = source.inspectLink('src/link.ts');
  assert.equal(link.mode, '120000');
  assert.equal(link.dereferenced, false);
  assert.equal(link.target_bytes.toString(), '../../not-to-be-followed');
  assert.throws(() => source.readRegularFile('src/link.ts'), /never followed/);
  const content = source.readRegularFile('src/app.ts');
  content.fill(0);
  assert.equal(source.readRegularFile('src/app.ts').toString(), 'export {};\n');
  assert.throws(() => source.inspectLink('src/app.ts'), /Not a tracked symlink/);
});

test('object source requires a separately pinned manifest and rejects modified blobs', async (t) => {
  const data = await objectFixture(t);
  await assert.rejects(openObjectSource(data.root, 'c'.repeat(64)), /manifest changed/);
  await put(data.root, 'blobs/' + data.entries[1].git_blob, 'corrupt');
  await assert.rejects(openObjectSource(data.root, data.digest));
});

test('object source rejects changed commits and extra objects', async (t) => {
  const data = await objectFixture(t);
  const original = await readFile(join(data.root, 'git-commit.raw'));
  await put(data.root, 'git-commit.raw', 'changed');
  await assert.rejects(openObjectSource(data.root, data.digest), /Commit changed/);
  await put(data.root, 'git-commit.raw', original);
  await put(data.root, 'blobs/extra', 'unexpected');
  await assert.rejects(openObjectSource(data.root, data.digest), /extra blobs/);
});

test('object source rejects changed recursive tree bytes and filesystem-linked blobs', async (t) => {
  const first = await objectFixture(t);
  const commit = await readFile(join(first.root, 'git-commit.raw'), 'utf8');
  const rootId = /^tree ([a-f0-9]{40})/u.exec(commit)[1];
  await put(first.root, 'trees/' + rootId, 'changed-tree');
  await assert.rejects(openObjectSource(first.root, first.digest), /Tree changed/);
  const second = await objectFixture(t);
  await link(join(second.root, 'blobs', second.entries[1].git_blob), join(second.root, 'hardlink'));
  await assert.rejects(openObjectSource(second.root, second.digest), /Unsafe/);
});

test('object source rejects relabelled symlinks even with a repinned outer manifest', async (t) => {
  const data = await objectFixture(t);
  data.manifest.entries[2].mode = '100644';
  const bytes = encode(data.manifest);
  await put(data.root, 'object-manifest.json', bytes);
  await assert.rejects(openObjectSource(data.root, hash(bytes)), /Manifest\/tree disagreement/);
});

test('source-bound annotation check covers exact commit, scope, existing lines and original row hash', async (t) => {
  const data = await objectFixture(t, 'one\r\ntwo\u2028three\n');
  const source = await openObjectSource(data.root, data.digest);
  const rows = annotations(source);
  const result = verifyObjectAnnotationLocations(source, rows);
  assert.equal(result.research_complete, false);
  assert.equal(result.annotations_sha256, hash(JSON.stringify(rows)));
  for (const change of [{ repository_commit: '0'.repeat(40) }, { evidence_file: 'LICENSE' },
    { evidence_file: 'src/link.ts' }, { evidence_file: 'src/missing.ts' }, { evidence_line: 4 }, { saw_prediction: true }]) {
    assert.throws(() => verifyObjectAnnotationLocations(source, rows.map((row) => ({ ...row, ...change }))));
  }
  assert.throws(() => verifyObjectAnnotationLocations({}, rows), /verified object-source/);
});

test('source-bound annotation check rejects binary, invalid UTF-8 and empty evidence', async (t) => {
  for (const content of [Buffer.from([0xff]), Buffer.from('x\0y'), Buffer.alloc(0)]) {
    const data = await objectFixture(t, content);
    const source = await openObjectSource(data.root, data.digest);
    assert.throws(() => verifyObjectAnnotationLocations(source, annotations(source)));
  }
});
