import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { validateProposal, policyModel, quoteEvidence, historicalFile } from '../scripts/d3-review/contracts.mjs';
import { gitId, sha256 } from '../scripts/d3-source-review/files.mjs';
import { fixture } from '../test-support/holdout-git-fixture.mjs';

const load = async () => JSON.parse(await readFile(new URL('../holdout/contracts/v0.1.0/proposal.json', import.meta.url)));

test('three real contract proposals are schema-valid policy fragments, not accepted graphs', async () => {
  const p = await load();
  await validateProposal(p);
  assert.equal(p.repositories.flatMap((r) => r.rules).length, 6);
  for (const repo of p.repositories) {
    const model = policyModel(repo);
    assert.deepEqual(model.relationships, []);
    assert.match(model.metadata.description, /NOT an expected topology/u);
    assert(model.rules.every((r) => !Object.hasOwn(r, 'evidence_ids')));
  }
});

test('proposal cannot self-approve or assert upstream acceptance', async () => {
  for (const mutation of [
    (p) => { p.status = 'accepted'; },
    (p) => { p.intent_authority = 'upstream-approved'; },
    (p) => { p.human_acceptances.push('fabricated'); },
    (p) => { p.historical_policy.rule_activation = 'all-cases'; },
    (p) => { p.historical_policy.upstream_bug_claim_allowed = true; },
  ]) {
    const p = await load(); mutation(p);
    await assert.rejects(validateProposal(p));
  }
});

test('proposal rejects broken source pins, duplicate rules and missing evidence', async () => {
  for (const mutation of [
    (p) => { p.repositories[0].source.manifest = '../escape.json'; },
    (p) => { p.repositories[0].source.manifest_sha256 = 'invalid'; },
    (p) => { p.repositories[0].rules[0].evidence_ids = ['NO-SUCH-CITATION']; },
    (p) => { p.repositories[1].rules[0].id = p.repositories[0].rules[0].id; },
    (p) => { p.repositories[0].rules[0].historical_anchor_paths = ['README-not-retained.md']; },
    (p) => { p.repositories[0].evidence[0].start = 0; },
    (p) => { p.repositories[0].rules[0].to = 'missing-component'; },
    (p) => { p.repositories[0].mapping.push(p.repositories[0].mapping[0]); },
  ]) {
    const p = await load(); mutation(p);
    await assert.rejects(validateProposal(p));
  }
});

// Controlled data below tests mechanics only. It is not a D3 label or human statement.
function citationFixture() {
  const bytes = Buffer.from('\uFEFFfirst\r\nsecond\nthird\n');
  return { bytes, repo: { id: 'fixture/source', reference_commit: 'a'.repeat(40) },
    citation: { id: 'TEST', path: 'src/example.ts', start: 2, end: 3, supports: 'Fixture only' },
    entry: { mode: '100644', git_blob: gitId('blob', bytes), sha256: sha256(bytes) } };
}

test('citations bind exact raw bytes and physical source lines, not prose paraphrase', () => {
  const f = citationFixture();
  const result = quoteEvidence(f.repo, f.citation, f.bytes, f.entry);
  assert.equal(result.quote, 'second\nthird');
  assert.equal(result.file_sha256, f.entry.sha256);
  assert.match(result.url, /\/blob\/a{40}\/src\/example.ts#L2-L3$/u);
});

test('citation verification rejects tampering, impossible lines and symlink source', () => {
  for (const mutation of [
    (f) => { f.bytes = Buffer.from('changed'); },
    (f) => { f.entry.sha256 = '0'.repeat(64); },
    (f) => { f.entry.mode = '120000'; },
    (f) => { f.citation.end = 4; },
    (f) => { f.citation.start = 0; },
  ]) {
    const f = citationFixture(); mutation(f);
    assert.throws(() => quoteEvidence(f.repo, f.citation, f.bytes, f.entry));
  }
});

test('historical context distinguishes equal, different and absent source without labels', async (t) => {
  const f = await fixture(t);
  const path = 'packages/api/index.ts';
  const bytes = f.files.find((e) => e.path === path).content;
  const root = join(f.source, '.git');
  assert.equal(historicalFile(root, f.pin.commit, path, sha256(bytes)).status, 'same-bytes-as-reference');
  assert.equal(historicalFile(root, f.pin.commit, path, '0'.repeat(64)).status, 'different-from-reference');
  assert.equal(historicalFile(root, f.pin.commit, 'missing.ts', '0'.repeat(64)).status, 'absent-at-commit');
  assert.throws(() => historicalFile(root, '0'.repeat(40), path, '0'.repeat(64)), /Retained Git read failed/u);
  assert.throws(() => historicalFile(root, f.pin.commit, '../escape', '0'.repeat(64)));
});

test('historical symlink object is never dereferenced even when target exists', async (t) => {
  const f = await fixture(t);
  const blob = await f.git('rev-parse', `${f.pin.commit}:packages/api/index.ts`);
  await f.git('update-index', '--add', '--cacheinfo', `120000,${blob},link.ts`);
  await f.git('commit', '-m', 'Controlled symlink object, never checked out');
  const commit = await f.git('rev-parse', 'HEAD');
  const entry = historicalFile(join(f.source, '.git'), commit, 'link.ts', '0'.repeat(64));
  assert.equal(entry.status, 'symlink-not-followed');
  assert.equal(entry.sha256, null);
});
