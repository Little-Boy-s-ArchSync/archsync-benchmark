import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256, gitId, plainFile } from '../d3-source-review/files.mjs';
import { verifyTransfer } from '../d3-source-review/transfer.mjs';
import { encode } from './review.mjs';

export const pins = Object.freeze({ transfer: '0cb702b6df6e684b587f97cc39d64dc1cb7d535c92aff2896962b2d55c26f341',
  checklist: '2c20c4694b749e565ebce149385407b808e224ee0f5d5471f4aab1e37a1d979a',
  cases: '44cc064a3555c90cc20d2a38ab61d67c6af598c1825bf5290cca2269ec801d35' });
const key = r => JSON.stringify([r.repository, r.case_id, r.rule_id, r.side, r.commit]);
const oid = s => typeof s === 'string' && /^[a-f0-9]{40}$/u.test(s);
const ranges = {
  'packages/api/src/models/index.ts': [[1, 6]],
  'packages/api/src/routers/api/alerts.ts': [[29, 34]],
  'docs/adr/0001-workspace-boundaries.md': [[15, 24]],
  'docs/contributing/architecture.mdx': [[6, 8], [68, 75]],
  'apps/server/src/rpc/handler.ts': [[1, 8]],
  'src/node/db/DB.ts': [[3, 6], [39, 43]],
  'src/node/server.ts': [[3, 7], [58, 62]],
};

/** Parse retained Git tree bytes without checking out or executing upstream code. */
export function treeEntries(bytes) {
  const entries = []; let offset = 0;
  while (offset < bytes.length) {
    const space = bytes.indexOf(32, offset), nul = bytes.indexOf(0, space + 1);
    assert(space > offset && nul > space && nul + 21 <= bytes.length, 'Malformed Git tree');
    const mode = bytes.subarray(offset, space).toString('ascii');
    const name = bytes.subarray(space + 1, nul).toString('utf8');
    assert(name && !name.includes('/') && !entries.some(e => e.name === name));
    entries.push({ mode, name, oid: bytes.subarray(nul + 1, nul + 21).toString('hex') }); offset = nul + 21;
  }
  return entries;
}
export async function proveSource(readObject, commit, path) {
  assert(oid(commit) && typeof path === 'string' && path.split('/').every(p => p && p !== '.' && p !== '..'));
  const get = async (type, id) => { assert(oid(id)); const b = await readObject(type, id); assert.equal(gitId(type, b), id, 'Retained Git object hash mismatch'); return b; };
  const commitBytes = await get('commit', commit);
  const tree = /^tree ([a-f0-9]{40})\n/u.exec(commitBytes.toString('utf8'))?.[1]; assert(tree, 'Commit root tree missing');
  let current = tree; const proof = [{ type: 'commit', oid: commit }];
  const parts = path.split('/');
  for (let i = 0; i < parts.length; i++) {
    const entries = treeEntries(await get('tree', current)); proof.push({ type: 'tree', oid: current });
    const entry = entries.find(e => e.name === parts[i]); assert(entry, 'Historical path missing');
    if (i < parts.length - 1) { assert.equal(entry.mode, '40000', 'Do not traverse symlinks'); current = entry.oid; }
    else {
      assert(['100644', '100755'].includes(entry.mode), 'Only regular historical sources');
      const bytes = await get('blob', entry.oid); proof.push({ type: 'blob', oid: entry.oid });
      return { bytes, git_blob: entry.oid, mode: entry.mode, proof };
    }
  }
}
const quote = (bytes, start, end) => {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes), lines = text.split(/\r?\n/u);
  if (lines.at(-1) === '') lines.pop();
  assert(Number.isInteger(start) && Number.isInteger(end) && start >= 1 && end >= start && end <= lines.length, 'Citation outside source');
  return lines.slice(start - 1, end).join('\n');
};

export async function validateProposedLedger(ledger, checklistBytes, analysisBytes, readObject) {
  assert.equal(sha256(checklistBytes), pins.checklist, 'Original checklist changed');
  return validateLedgerStructure(ledger, JSON.parse(checklistBytes), sha256(checklistBytes), analysisBytes, readObject);
}
// Exported for synthetic mechanical tests; production entry always enforces the original checklist pin.
export async function validateLedgerStructure(ledger, checklist, checklistSha, analysisBytes, readObject) {
  assert.equal(ledger.schema, 'd3-proposed-applicability-evidence/1'); assert.equal(ledger.status, 'ai-proposed-not-human-verified');
  assert.equal(ledger.checklist_sha256, checklistSha); assert.equal(ledger.cases_sha256, checklist.cases_sha256);
  assert.equal(ledger.source_transfer_sha256, pins.transfer); assert.equal(ledger.analysis_sha256, sha256(analysisBytes));
  assert.equal(ledger.labels_created, false); assert.equal(ledger.predictions_executed, false); assert.deepEqual(ledger.human_acceptances, []);
  assert.equal(checklist.schema, 'd3-historical-applicability-checklist/1'); assert.equal(checklist.status, 'preparation-no-applicability-decision');
  assert.equal(checklist.rows.length, 152); assert.equal(ledger.rows.length, 152);
  const expected = new Map(checklist.rows.map(r => [key(r), r])); assert.equal(expected.size, 152);
  assert.equal(new Set(checklist.rows.map(r => `${r.repository}\0${r.case_id}`)).size, 56);
  const seen = new Set(); let citations = 0;
  for (const row of ledger.rows) {
    const original = expected.get(key(row)); assert(original && !seen.has(key(row)), 'Duplicate, altered or unexpected row'); seen.add(key(row));
    assert.equal(original.applicability, null); assert.equal(row.applicability, null); assert.equal(row.human_verification, 'pending-both-authors');
    assert.deepEqual(row.human_acceptances, []); assert(['applicable', 'unresolved'].includes(row.proposed_applicability));
    assert(typeof row.rationale === 'string' && row.rationale.trim());
    assert.equal(row.ai_assistance.used, true); assert.equal(row.ai_assistance.human_verification, 'not-performed-pending-both-authors');
    assert.equal(row.ai_assistance.output_sha256, ledger.analysis_sha256); assert.equal(row.ai_assistance.output_reference, 'AI-ANALYSIS.md');
    assert.equal(row.ai_assistance.shared_packet, true); assert.equal(row.ai_assistance.input_checklist_sha256, checklistSha);
    assert.equal(row.anchors.length, original.anchors.length);
    for (let i = 0; i < row.anchors.length; i++) {
      const a = row.anchors[i], expectedAnchor = original.anchors[i];
      assert.equal(a.path, expectedAnchor.path); assert.equal(a.anchor_status, expectedAnchor.anchor_status);
      assert.equal(a.sha256, expectedAnchor.sha256); assert.equal(a.git_blob, expectedAnchor.git_blob);
      const source = await proveSource(readObject, row.commit, a.path);
      assert.equal(a.git_blob, source.git_blob); assert.equal(a.mode, source.mode); assert.equal(a.sha256, sha256(source.bytes));
      assert.deepEqual(a.git_proof, source.proof); assert(a.citations.length > 0);
      for (const e of a.citations) { assert.equal(e.quote, quote(source.bytes, e.start_line, e.end_line)); citations++; }
    }
  }
  return { status: 'SOURCE_EVIDENCE_VERIFIED_NOT_ACCEPTED', rows: seen.size, citations,
    final_decisions: 0, pending_human_rows: seen.size, proposed_applicable: ledger.rows.filter(r => r.proposed_applicability === 'applicable').length,
    proposed_unresolved: ledger.rows.filter(r => r.proposed_applicability === 'unresolved').length, labels_created: false, predictions_executed: false };
}

async function build(packetPath, kitPath, outputPath) {
  const { root } = await verifyTransfer(packetPath, pins.transfer);
  const original = await plainFile(kitPath, 'historical-applicability-checklist.json'); assert.equal(sha256(original), pins.checklist);
  const checklist = JSON.parse(original); assert.equal(checklist.cases_sha256, pins.cases);
  const notes = await readFile(new URL('../../holdout/D3-APPLICABILITY-AI-NOTES-20260928.md', import.meta.url));
  await mkdir(outputPath); await mkdir(join(outputPath, 'objects'));
  await writeFile(join(outputPath, 'original-checklist.json'), original, { flag: 'wx' });
  await writeFile(join(outputPath, 'AI-ANALYSIS.md'), notes, { flag: 'wx' });
  const objects = new Map();
  const rows = [];
  for (const row of checklist.rows) {
    const gitDir = join(root, 'data/d3-change-packets-20260927-01', row.repository.replace('/', '--'), 'objects.git');
    const readObject = async (type, id) => {
      if (objects.has(id)) return objects.get(id).bytes;
      const result = spawnSync('git', ['--no-replace-objects', '--git-dir', gitDir, 'cat-file', type, id], {
        maxBuffer: 16 * 1024 * 1024, timeout: 30000, env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_ALLOW_PROTOCOL: '', GIT_TERMINAL_PROMPT: '0' } });
      assert.equal(result.status, 0, 'Pinned Git object unavailable'); assert.equal(gitId(type, result.stdout), id);
      objects.set(id, { type, bytes: result.stdout }); return result.stdout;
    };
    const anchors = [];
    for (const a of row.anchors) {
      const source = await proveSource(readObject, row.commit, a.path); assert.equal(sha256(source.bytes), a.sha256); assert.equal(source.git_blob, a.git_blob);
      anchors.push({ ...a, mode: source.mode, git_proof: source.proof,
        citations: ranges[a.path].map(([start_line, end_line]) => ({ start_line, end_line, quote: quote(source.bytes, start_line, end_line) })) });
    }
    const documented = row.rule_id === 'D3-RR-MOD-001';
    rows.push({ repository: row.repository, case_id: row.case_id, rule_id: row.rule_id, side: row.side, commit: row.commit,
      applicability: null, proposed_applicability: documented ? 'applicable' : 'unresolved',
      rationale: documented
        ? 'AI proposal only: the pinned historical ADR and architecture document explicitly restrict cross-workspace private source imports; the server adapter imports a public API package. These anchors support considering the selected server-to-private-web study restriction at this side. Both authors must verify applicability and exceptions; this is not a violation label or accepted rule activation.'
        : 'AI proposal unresolved: historical source anchors support the selected model/router or database/server roles, but do not establish an upstream prohibition or historical activation of this study-defined restriction. Both authors must decide whether the conditional study rule applies to this case-side; byte equality and unchanged files do not decide it.',
      human_verification: 'pending-both-authors', human_acceptances: [], anchors,
      ai_assistance: { used: true, tool_model: 'Codex; exact model identifier not recorded', input_checklist_sha256: pins.checklist,
        input_scope: 'All 152 checklist rows and 13 retained historical anchor byte versions; source/provenance only, no D3 tool outputs used',
        output_reference: 'AI-ANALYSIS.md', output_sha256: sha256(notes), shared_packet: true,
        human_verification: 'not-performed-pending-both-authors' } });
  }
  for (const [id, value] of objects) await writeFile(join(outputPath, 'objects', id), value.bytes, { flag: 'wx' });
  const ledger = { schema: 'd3-proposed-applicability-evidence/1', status: 'ai-proposed-not-human-verified',
    checklist_sha256: pins.checklist, cases_sha256: pins.cases, source_transfer_sha256: pins.transfer,
    analysis_sha256: sha256(notes), labels_created: false, predictions_executed: false, human_acceptances: [], rows };
  await writeFile(join(outputPath, 'evidence-ledger.json'), encode(ledger), { flag: 'wx' });
  const result = await validateProposedLedger(ledger, original, notes, async (type, id) => objects.get(id).bytes);
  await writeFile(join(outputPath, 'validation.json'), encode(result), { flag: 'wx' });
  console.log(encode({ ...result, ledger_sha256: sha256(encode(ledger)), retained_objects: objects.size }));
}
async function check(root) {
  const original = await plainFile(root, 'original-checklist.json'), notes = await plainFile(root, 'AI-ANALYSIS.md');
  const ledger = JSON.parse(await plainFile(root, 'evidence-ledger.json'));
  const result = await validateProposedLedger(ledger, original, notes, (type, id) => plainFile(root, `objects/${id}`));
  assert.deepEqual(result, JSON.parse(await plainFile(root, 'validation.json'))); console.log(encode(result));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === 'build' && args.length === 3) await build(...args.map(p => resolve(p)));
  else if (mode === 'check' && args.length === 1) await check(resolve(args[0]));
  else throw new Error('Usage: proposed-applicability.mjs build PACKET KIT NEW_OUTPUT | check OUTPUT');
}
