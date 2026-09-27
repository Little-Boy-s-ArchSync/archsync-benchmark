import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, parse, resolve } from 'node:path';
import { isSafeHoldoutPath } from '../lib/holdout.mjs';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const gitId = (type, bytes) => createHash('sha1').update(Buffer.concat([Buffer.from(`${type} ${bytes.length}\0`), bytes])).digest('hex');

// Use only under exclusive coordinator control; this is not a hostile-process sandbox.
export async function directory(input) {
  assert(typeof input === 'string' && isAbsolute(input), 'Absolute directory required');
  const path = resolve(input);
  assert.equal(await realpath(path), path, 'Directory alias/symlink rejected');
  let cursor = parse(path).root;
  for (const part of path.slice(cursor.length).split(/[\\/]/u).filter(Boolean)) {
    cursor = join(cursor, part);
    const stat = await lstat(cursor);
    assert(stat.isDirectory() && !stat.isSymbolicLink(), 'Directory symlink rejected');
  }
  return path;
}

export async function plainFile(root, path, limit = 64 * 1024 * 1024) {
  assert(isSafeHoldoutPath(path), 'Unsafe file path');
  const parts = path.split('/');
  let cursor = root;
  for (const part of parts.slice(0, -1)) {
    cursor = join(cursor, part);
    const stat = await lstat(cursor);
    assert(stat.isDirectory() && !stat.isSymbolicLink(), 'Directory symlink rejected');
  }
  const absolute = join(root, ...parts);
  const stat = await lstat(absolute);
  assert(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size <= limit, 'Unsafe or oversized file');
  const bytes = await readFile(absolute);
  assert.equal(bytes.length, stat.size, 'File changed during read');
  return bytes;
}

export async function inventory(root, directories = []) {
  const paths = [];
  const names = new Set();
  let total = 0;
  async function walk(path, prefix = '') {
    for (const name of await readdir(path)) {
      const key = prefix + name;
      assert(isSafeHoldoutPath(key), 'Unsafe inventory path');
      assert(!names.has(key.toLowerCase()) && names.size < 100000 && key.split('/').length < 128, 'Aliased or excessive inventory');
      names.add(key.toLowerCase());
      const stat = await lstat(join(path, name));
      assert(!stat.isSymbolicLink(), 'Filesystem symlink rejected');
      if (stat.isDirectory()) {
        directories.push(key);
        await walk(join(path, name), key + '/');
      }
      else {
        assert(stat.isFile() && stat.nlink === 1, 'Nonregular inventory entry');
        total += stat.size;
        paths.push(key);
        assert(paths.length <= 100000 && total <= 512 * 1024 * 1024, 'Transfer size limit');
      }
    }
  }
  await walk(root);
  return paths.sort();
}
