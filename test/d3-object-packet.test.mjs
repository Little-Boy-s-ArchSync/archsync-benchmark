import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parseBinaryTree, parseObjectTree, verifyObjectPacket } from '../scripts/capture-d3-object-packet.mjs';

const hash = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const objectId = (type, bytes) => hash(Buffer.concat([Buffer.from(`${type} ${bytes.length}\0`), bytes]), 'sha1');
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'archsync-d3-object-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'blobs'));
  await mkdir(join(directory, 'trees'));
  const inputs = [{ path: 'LINK', mode: '120000', content: Buffer.from('../../outside-secret') },
    { path: 'src/app.ts', mode: '100644', content: Buffer.from('export {};\n') }];
  const entries = inputs.map(({ path, mode, content }) => ({ path, mode, git_blob: objectId('blob', content), bytes: content.length, sha256: hash(content) }));
  const treeEntry = (mode, name, oid) => Buffer.concat([Buffer.from(`${mode} ${name}\0`), Buffer.from(oid, 'hex')]);
  const nestedTree = treeEntry('100644', 'app.ts', entries[1].git_blob);
  const rootTree = Buffer.concat([treeEntry('120000', 'LINK', entries[0].git_blob), treeEntry('40000', 'src', objectId('tree', nestedTree))]);
  for (const bytes of [rootTree, nestedTree]) await writeFile(join(directory, 'trees', objectId('tree', bytes)), bytes);
  const commit = Buffer.from(`tree ${objectId('tree', rootTree)}\n\nControlled engineering fixture; not research data.\n`);
  const repository = { id: 'controlled/fixture', commit: objectId('commit', commit), scope: 'src' };
  const selection = json({ repository });
  const tree = Buffer.from(entries.map((entry) => `${entry.mode} blob ${entry.git_blob} ${entry.bytes}\t${entry.path}\0`).join(''));
  for (let index = 0; index < inputs.length; index++) await writeFile(join(directory, 'blobs', entries[index].git_blob), inputs[index].content);
  const manifest = { schema: 'd3-git-object-packet/1', status: 'preparation-only-not-execution-approved', repository,
    selection_sha256: hash(selection), raw_tree_sha256: hash(tree), entries, predictions_executed: false, independent_labels_present: false };
  await writeFile(join(directory, 'selection-before-fetch.json'), selection);
  await writeFile(join(directory, 'git-commit.raw'), commit);
  await writeFile(join(directory, 'git-ls-tree.raw'), tree);
  await writeFile(join(directory, 'object-manifest.json'), json(manifest));
  return { directory, entries };
}
test('preserves symlink bytes as blobs and does not dereference their target', async (t) => {
  const { directory } = await fixture(t);
  const result = await verifyObjectPacket(directory);
  assert.equal(result.tracked_entries, 2);
  assert.equal(result.regular_files, 1);
  assert.equal(result.preserved_symlinks[0].path, 'LINK');
  assert.equal(result.proposed_review_files, 1);
  assert.equal(result.research_complete, false);
});
test('rejects changed or additional objects', async (t) => {
  const { directory, entries } = await fixture(t);
  await writeFile(join(directory, 'blobs', entries[0].git_blob), 'wrong');
  await assert.rejects(verifyObjectPacket(directory), /Blob size changed|Blob identity changed/u);
  await writeFile(join(directory, 'blobs', 'extra'), 'extra');
  await assert.rejects(verifyObjectPacket(directory), /Missing or extra blob/u);
});
test('rejects relabelled symlinks and modified commit bytes', async (t) => {
  const { directory } = await fixture(t);
  const file = join(directory, 'object-manifest.json');
  const original = await readFile(file);
  const manifest = JSON.parse(original);
  manifest.entries[0].mode = '100644';
  await writeFile(file, json(manifest));
  await assert.rejects(verifyObjectPacket(directory), /Tree entries changed/u);
  await writeFile(file, original);
  await writeFile(join(directory, 'git-commit.raw'), 'wrong');
  await assert.rejects(verifyObjectPacket(directory), /Commit changed/u);
});
test('rejects altered recursive tree bytes and malformed entries', async (t) => {
  const { directory } = await fixture(t);
  const commit = await readFile(join(directory, 'git-commit.raw'), 'utf8');
  await writeFile(join(directory, 'trees', /^tree (.+)\n/u.exec(commit)[1]), 'wrong');
  await assert.rejects(verifyObjectPacket(directory), /Tree identity changed/u);
  assert.throws(() => parseBinaryTree(Buffer.from('100644 bad\0')));
  assert.throws(() => parseBinaryTree(Buffer.concat([Buffer.from('100644 ../bad\0'), Buffer.alloc(20)])));
});
test('rejects submodules, traversal, duplicate entries and excessive size', () => {
  for (const row of [`160000 commit ${'a'.repeat(40)} -\tsub\0`, `100644 blob ${'a'.repeat(40)} 1\t../bad\0`,
    `100644 blob ${'a'.repeat(40)} 67108865\tfile\0`, `100644 blob ${'a'.repeat(40)} 1\tfile\0`.repeat(2)]) {
    assert.throws(() => parseObjectTree(Buffer.from(row)));
  }
});
