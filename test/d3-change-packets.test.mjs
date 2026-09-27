import assert from 'node:assert/strict';
import test from 'node:test';
import { commitParents, diffArguments, parseRawChanges } from '../scripts/prepare-d3-change-packets.mjs';
import { changeReviewerCsv, commitTime } from '../scripts/prepare-d3-change-review.mjs';
const a = 'a'.repeat(40);
const b = 'b'.repeat(40);
const zero = '0'.repeat(40);
test('retains additions, deletions, modifications and symlink type changes', () => {
  const bytes = Buffer.from(`:000000 100644 ${zero} ${a} A\0src/add.ts\0:100644 000000 ${a} ${zero} D\0src/remove.ts\0:100644 100644 ${a} ${b} M\0src/change.ts\0:100644 120000 ${a} ${b} T\0LINK\0`);
  const rows = parseRawChanges(bytes);
  assert.deepEqual(rows.map((row) => row.status), ['A', 'D', 'M', 'T']);
  assert.equal(rows[3].head_mode, '120000');
  assert.deepEqual(parseRawChanges(Buffer.alloc(0)), []);
});
test('rejects traversal, duplicate paths, inferred renames and contradictory object IDs', () => {
  const entry = `:100644 100644 ${a} ${b} M\0src/file.ts\0`;
  for (const value of [entry.replace('src/file.ts', '../bad'), entry.repeat(2), entry.replace(' M\0', ' R100\0'), entry.replace(a, zero), entry.slice(0, -1)]) {
    assert.throws(() => parseRawChanges(Buffer.from(value)));
  }
});
test('preserves every real commit parent instead of silently choosing one', () => {
  assert.deepEqual(commitParents(Buffer.from(`tree ${a}\nparent ${a}\nparent ${b}\nauthor Test\n\nfixture\n`)), [a, b]);
  assert.deepEqual(commitParents(Buffer.from(`tree ${a}\n\nroot fixture\n`)), []);
  assert.throws(() => commitParents(Buffer.from('no tree\n')));
});
test('diff command disables repository transforms and freezes options', () => {
  const args = diffArguments('patch', a, b, 'src/node');
  for (const flag of ['--no-ext-diff', '--no-textconv', '--no-renames', '--binary', '--full-index', '--diff-algorithm=myers']) assert(args.includes(flag));
  assert.deepEqual(args.slice(-4), [a, b, '--', 'src/node']);
  assert.throws(() => diffArguments('patch', '--bad', b));
  assert.throws(() => diffArguments('patch', a, b, '../outside'));
});
test('uses the commit timestamp as UTC without leaking contact fields', () => {
  assert.equal(commitTime(Buffer.from(`tree ${a}\ncommitter Fixture <fixture@example.invalid> 0 +0700\n\nnot research data\n`)), '1970-01-01T00:00:00.000Z');
  assert.throws(() => commitTime(Buffer.from('no committer\n')));
});
test('review worksheet contains source identities but no invented human decisions', () => {
  const csv = changeReviewerCsv([{ id: 'controlled--fixture-H001', repository: 'controlled/fixture', base: a, head: b, scope: 'src', changed_paths_in_scope: 2 }]);
  assert(csv.includes(a) && csv.includes(b));
  assert(csv.endsWith('"2","","","","","","","",""\n'));
  assert(!csv.includes('"false"'));
});
