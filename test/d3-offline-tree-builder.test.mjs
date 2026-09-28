import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { test } from 'node:test';
import { buildOfflineTree, validateMaterializableTree, verifyOfflineTree } from '../scripts/d3-review/offline-tree-builder.mjs';

test('builder refuses embedded Git metadata, file ancestors, and receipt collisions', () => {
  const entry = { mode: '100644', blob: 'a'.repeat(40) };
  assert.throws(() => validateMaterializableTree(new Map([['src/.git/config', entry]])),
    /Git metadata path/u);
  assert.throws(() => validateMaterializableTree(new Map([
    ['src', entry], ['src/index.ts', entry],
  ])), /file cannot be a path ancestor/u);
  assert.throws(() => validateMaterializableTree(new Map([['.archsync-tree-receipt.json', entry]])),
    /collides with the builder receipt/u);
  assert.throws(() => validateMaterializableTree(new Map([['.ARCHSYNC-TREE-RECEIPT.JSON', entry]])),
    /collides with the builder receipt/u);
  assert.throws(() => validateMaterializableTree(new Map([['.ARCHSYNC-TREE-RECEIPT.JSON/child', entry]])),
    /collides with the builder receipt/u);
  assert.throws(() => validateMaterializableTree(new Map([
    ['Source/a.ts', entry], ['source/b.ts', entry],
  ])), /Case-folded directory or file path collision/u);
});

function git(directory, args, input) {
  const result = spawnSync('git', ['-C', directory, ...args], {
    shell: false, windowsHide: true, input,
  });
  assert.equal(result.status, 0, result.stderr?.toString('utf8'));
  return result.stdout.toString('utf8').trim();
}

test('offline builder verifies pinned identities, writes exact regular bytes and never creates symlinks', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'archsync-tree-build-'));
  const work = join(temporary, 'work');
  const bare = join(temporary, 'source.git');
  const output = join(temporary, 'built');
  try {
    await mkdir(work);
    git(work, ['init', '-q']);
    await mkdir(join(work, 'src'));
    const sourceBytes = Buffer.from([0, 1, 2, 255, 10]);
    await writeFile(join(work, 'src', 'source.bin'), sourceBytes);
    git(work, ['add', 'src/source.bin']);
    const symlinkBlob = git(work, ['hash-object', '-w', '--stdin'], 'src/source.bin');
    git(work, ['update-index', '--add', '--cacheinfo', '120000', symlinkBlob, 'not-followed']);
    git(work, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
      'commit', '-qm', 'synthetic source tree']);
    const commit = git(work, ['rev-parse', 'HEAD']);
    const tree = git(work, ['rev-parse', 'HEAD^{tree}']);
    const rawCommit = spawnSync('git', ['-C', work, 'cat-file', 'commit', commit]).stdout;
    git(temporary, ['clone', '--bare', '-q', work, bare]);
    const record = { repository: 'fixture/repository', sha: commit, local_tree: tree,
      local_parents: [], local_commit_object_sha256: createHash('sha256').update(rawCommit).digest('hex'),
      remote_commit_match: true, tree_match: true, parents_match: true };
    const receipt = await buildOfflineTree(record, bare, output);
    assert.equal(receipt.files_written, 1);
    assert.equal(receipt.symlinks_not_materialized.length, 1);
    assert.equal(receipt.symlinks_not_materialized[0].path, 'not-followed');
    assert.equal(receipt.tools_executed, false);
    assert.equal(receipt.labels_created, false);
    assert.deepEqual(await readFile(join(output, 'src', 'source.bin')), sourceBytes);
    await assert.rejects(readFile(join(output, 'not-followed')), { code: 'ENOENT' });
    const receiptBytes = await readFile(join(output, '.archsync-tree-receipt.json'));
    const receiptDigest = createHash('sha256').update(receiptBytes).digest('hex');
    const retained = JSON.parse(receiptBytes);
    assert.deepEqual(retained, receipt);
    assert.equal((await verifyOfflineTree(output, receiptDigest)).verified_regular_files, 1);
    if (process.platform !== 'win32') {
      await chmod(join(output, 'src', 'source.bin'), 0o755);
      await assert.rejects(verifyOfflineTree(output, receiptDigest), /File executable mode changed/u);
      await chmod(join(output, 'src', 'source.bin'), 0o644);
      assert.equal((await verifyOfflineTree(output, receiptDigest)).verified_regular_files, 1);
    }
    await assert.rejects(verifyOfflineTree(output, '0'.repeat(64)), /receipt bytes changed/u);
    await writeFile(join(output, 'src', 'source.bin'), 'changed');
    await assert.rejects(verifyOfflineTree(output, receiptDigest), /File length changed/u);
    await writeFile(join(output, 'src', 'source.bin'), sourceBytes);
    await writeFile(join(output, 'extra.txt'), 'extra');
    await assert.rejects(verifyOfflineTree(output, receiptDigest), /Unexpected or duplicate file/u);
    await rm(join(output, 'extra.txt'));
    await mkdir(join(output, 'extra-dir'));
    await assert.rejects(verifyOfflineTree(output, receiptDigest), /Unexpected directory/u);
    await rm(join(output, 'extra-dir'), { recursive: true });
    assert.equal((await verifyOfflineTree(output, receiptDigest)).verified_regular_files, 1);
    await assert.rejects(buildOfflineTree(record, bare, output), { code: 'EEXIST' });
    await assert.rejects(buildOfflineTree({ ...record, local_tree: '0'.repeat(40) }, bare,
      join(temporary, 'bad-tree')), /Root tree differs/u);
    await assert.rejects(buildOfflineTree({ ...record, local_commit_object_sha256: '0'.repeat(64) },
      bare, join(temporary, 'bad-commit')), /Raw commit bytes changed/u);
    await assert.rejects(buildOfflineTree({ ...record, local_parents: ['0'.repeat(40)] },
      bare, join(temporary, 'bad-parents')), /Ordered parents differ/u);
    await assert.rejects(buildOfflineTree(record, join(work, '.git'),
      join(temporary, 'nonbare')), /isolated bare Git object store/u);
    for (const name of ['bad-tree', 'bad-commit', 'bad-parents', 'nonbare']) {
      await assert.rejects(readFile(join(temporary, name, '.archsync-tree-receipt.json')),
        { code: 'ENOENT' });
    }
    git(work, ['update-index', '--chmod=+x', 'src/source.bin']);
    git(work, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
      'commit', '-qm', 'synthetic executable source']);
    assert.match(git(work, ['ls-files', '--stage', 'src/source.bin']), /^100755 /u);
    const executableCommit = git(work, ['rev-parse', 'HEAD']);
    const executableTree = git(work, ['rev-parse', 'HEAD^{tree}']);
    const executableCommitBytes = spawnSync('git', ['-C', work, 'cat-file', 'commit', executableCommit]).stdout;
    const executableBare = join(temporary, 'source-executable.git');
    const executableOutput = join(temporary, 'built-executable');
    git(temporary, ['clone', '--bare', '-q', work, executableBare]);
    const executableRecord = { ...record, sha: executableCommit, local_tree: executableTree,
      local_parents: [commit],
      local_commit_object_sha256: createHash('sha256').update(executableCommitBytes).digest('hex') };
    if (process.platform === 'win32') {
      await assert.rejects(buildOfflineTree(executableRecord, executableBare, executableOutput),
        /Executable Git mode cannot be verified on Windows/u);
      await assert.rejects(readFile(join(executableOutput, '.archsync-tree-receipt.json')),
        { code: 'ENOENT' });
    } else {
      const executableReceipt = await buildOfflineTree(executableRecord, executableBare, executableOutput);
      const executableReceiptBytes = await readFile(join(executableOutput, '.archsync-tree-receipt.json'));
      const executableDigest = createHash('sha256').update(executableReceiptBytes).digest('hex');
      assert.equal(executableReceipt.files[0].mode, '100755');
      assert.equal((await verifyOfflineTree(executableOutput, executableDigest)).verified_regular_files, 1);
      await chmod(join(executableOutput, 'src', 'source.bin'), 0o644);
      await assert.rejects(verifyOfflineTree(executableOutput, executableDigest),
        /File executable mode changed/u);
    }
  } finally {
    assert(resolve(temporary).startsWith(`${resolve(tmpdir())}${sep}`),
      'Temporary cleanup escaped OS temp');
    await rm(temporary, { recursive: true });
  }
});
