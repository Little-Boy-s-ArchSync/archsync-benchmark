import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { treeEntries, proveSource, validateProposedLedger } from '../scripts/d3-review/proposed-applicability.mjs';
import { gitId } from '../scripts/d3-source-review/files.mjs';
const root = new URL('../holdout/d3-applicability-proposal-20260928/', import.meta.url);
const checklist = await readFile(new URL('original-checklist.json', root));
const notes = await readFile(new URL('AI-ANALYSIS.md', root));
const originalLedger = JSON.parse(await readFile(new URL('evidence-ledger.json', root)));
const cache = new Map();
const readObject = async (type, id) => {
  if (!cache.has(id)) cache.set(id, await readFile(new URL(`objects/${id}`, root)));
  return cache.get(id);
};

test('retained152-row proposal proves historical paths and quotations without accepting decisions', async () => {
  const result = await validateProposedLedger(originalLedger, checklist, notes, readObject);
  assert.deepEqual(result, { status: 'SOURCE_EVIDENCE_VERIFIED_NOT_ACCEPTED', rows: 152, citations: 532,
    final_decisions: 0, pending_human_rows: 152, proposed_applicable: 34, proposed_unresolved: 118,
    labels_created: false, predictions_executed: false });
});

test('rejects altered blanks, fabricated decisions, duplicated identities and quote/proof drift', async () => {
  for (const mutate of [
    l => { l.rows.pop(); }, l => { l.rows[1] = l.rows[0]; }, l => { l.rows[0].commit = '0'.repeat(40); },
    l => { l.rows[0].applicability = 'applicable'; }, l => { l.human_acceptances = ['fabricated']; },
    l => { l.rows[0].human_verification = 'complete'; }, l => { l.rows[0].human_acceptances = ['fabricated']; },
    l => { l.labels_created = true; }, l => { l.predictions_executed = true; },
    l => { l.rows[0].anchors[0].citations[0].quote = 'invented'; }, l => { l.rows[0].anchors[0].citations[0].start_line = 0; },
    l => { l.rows[0].anchors[0].git_proof.pop(); }, l => { l.rows[0].anchors[0].mode = '120000'; },
    l => { l.rows[0].anchors[0].path = '../elsewhere'; }, l => { l.rows[0].ai_assistance.used = false; },
  ]) { const ledger = structuredClone(originalLedger); mutate(ledger); await assert.rejects(validateProposedLedger(ledger, checklist, notes, readObject)); }
  await assert.rejects(validateProposedLedger(originalLedger, Buffer.concat([checklist, Buffer.from(' ')]), notes, readObject));
  await assert.rejects(validateProposedLedger(originalLedger, checklist, Buffer.from('changed AI notes'), readObject));
  await assert.rejects(validateProposedLedger(originalLedger, checklist, notes, async () => Buffer.from('tampered object')));
});

test('synthetic Git proof rejects missing paths, symlink traversal and corrupt tree bytes', async () => {
  const blob = Buffer.from('test-only\n'), blobId = gitId('blob', blob);
  const tree = Buffer.concat([Buffer.from('120000 source\0'), Buffer.from(blobId, 'hex')]);
  const treeId = gitId('tree', tree), commit = Buffer.from(`tree ${treeId}\n\nsynthetic test\n`), commitId = gitId('commit', commit);
  const objects = new Map([[blobId, blob], [treeId, tree], [commitId, commit]]);
  await assert.rejects(proveSource(async (type, id) => objects.get(id), commitId, 'source'), /regular historical/);
  await assert.rejects(proveSource(async (type, id) => objects.get(id), commitId, 'source/child'), /symlinks/);
  await assert.rejects(proveSource(async (type, id) => objects.get(id), commitId, 'missing'), /missing/);
  assert.throws(() => treeEntries(Buffer.from('100644 broken\0short')), /Malformed/);
});
