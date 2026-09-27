import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArchitecture } from '@archsync/core';
import { isSafeHoldoutPath } from '../lib/holdout.mjs';
import { directory, gitId, plainFile, sha256 } from '../d3-source-review/files.mjs';
import { openObjectSource } from '../d3-source-review/object-source.mjs';
import { verifyTransfer } from '../d3-source-review/transfer.mjs';
import { digest, encode, sourceLines, validateCases } from './review.mjs';

const defaultProposal = resolve(dirname(fileURLToPath(import.meta.url)), '../../holdout/contracts/v0.1.0/proposal.json');
const hex = /^[a-f0-9]{64}$/u;
const oid = /^[a-f0-9]{40}$/u;
const nonempty = (s) => typeof s === 'string' && s.trim().length > 0;
export const HISTORICAL_ANCHOR_STATUSES = Object.freeze([
  'absent-at-commit',
  'symlink-not-followed',
  'same-bytes-as-reference',
  'different-from-reference',
]);

export async function validateProposal(proposal) {
  assert.equal(proposal.schema, 'd3-research-contract-proposal/1');
  assert.equal(proposal.status, 'proposed-not-accepted');
  assert.equal(proposal.intent_authority, 'study-defined-not-upstream-approved');
  assert.deepEqual(proposal.human_acceptances, []);
  assert(hex.test(proposal.cases_sha256) && hex.test(proposal.transfer_sha256));
  assert.equal(proposal.historical_policy.rule_activation, 'pending-per-case-human-applicability-review');
  assert.equal(proposal.historical_policy.upstream_bug_claim_allowed, false);
  assert.equal(proposal.historical_policy.reference_snapshot_is_not_historical_intent, true);
  assert(proposal.repositories.length === 3);
  const repositories = new Set();
  const allIds = new Set();
  for (const repo of proposal.repositories) {
    assert(isSafeHoldoutPath(repo.id) && repo.id.split('/').length === 2 && !repositories.has(repo.id));
    repositories.add(repo.id);
    assert(oid.test(repo.reference_commit) && isSafeHoldoutPath(repo.case_scope));
    assert(['captured-files', 'git-object-packet'].includes(repo.source.kind));
    assert(isSafeHoldoutPath(repo.source.manifest) && isSafeHoldoutPath(repo.source.root) && hex.test(repo.source.manifest_sha256));
    const evidenceIds = new Set();
    for (const citation of repo.evidence) {
      assert(nonempty(citation.id) && !evidenceIds.has(citation.id));
      evidenceIds.add(citation.id);
      assert(isSafeHoldoutPath(citation.path) && nonempty(citation.supports));
      assert(Number.isSafeInteger(citation.start) && citation.start > 0 && Number.isSafeInteger(citation.end) && citation.end >= citation.start);
    }
    const selectors = new Set();
    for (const mapping of repo.mapping) {
      assert(repo.components[mapping.component]);
      assert(Boolean(mapping.path) !== Boolean(mapping.prefix));
      const path = mapping.path ?? mapping.prefix.slice(0, -1);
      assert(isSafeHoldoutPath(path) && (!mapping.prefix || mapping.prefix.endsWith('/')));
      const selector = `${mapping.path ? 'file' : 'prefix'}:${path}`;
      assert(!selectors.has(selector), 'Ambiguous duplicate mapping');
      selectors.add(selector);
    }
    for (const id of Object.keys(repo.components)) assert(repo.mapping.some((m) => m.component === id));
    for (const rule of repo.rules) {
      assert(!allIds.has(rule.id) && rule.evidence_ids.length > 0 && rule.historical_anchor_paths.length > 0);
      allIds.add(rule.id);
      assert(rule.evidence_ids.every((id) => evidenceIds.has(id)));
      assert(rule.historical_anchor_paths.every((path) => isSafeHoldoutPath(path) && repo.evidence.some((e) => e.path === path)));
      assert(nonempty(rule.basis) && rule.type === 'deny' && rule.relationship_type === 'dependency');
    }
    const parsed = await parseArchitecture(encode(policyModel(repo)));
    assert(parsed.valid, `Core rejects ${repo.id}: ${JSON.stringify(parsed.issues)}`);
  }
}

export function policyModel(repo) {
  return { version: '0.1.1', metadata: { name: `D3 proposed module policy: ${repo.id}`,
    description: 'Study-defined deny-rule fragment only. Empty relationships is NOT an expected topology. Not approved for execution.' },
  components: repo.components, relationships: [],
  rules: repo.rules.map(({ evidence_ids, historical_anchor_paths, basis, ...rule }) => rule) };
}

export function quoteEvidence(repo, citation, bytes, entry) {
  assert(['100644', '100755'].includes(entry.mode), 'Citation must be regular source, never a symlink');
  assert.equal(gitId('blob', bytes), entry.git_blob, 'Citation Git blob mismatch');
  assert.equal(sha256(bytes), entry.sha256, 'Citation SHA-256 mismatch');
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const lines = sourceLines(text);
  assert(lines && citation.start >= 1 && citation.end <= lines.length, 'Citation range unavailable');
  return { ...citation, repository: repo.id, commit: repo.reference_commit,
    file_sha256: sha256(bytes), git_blob: entry.git_blob, mode: entry.mode,
    quote: lines.slice(citation.start - 1, citation.end).join('\n'),
    url: `https://github.com/${repo.id}/blob/${repo.reference_commit}/${citation.path}#L${citation.start}-L${citation.end}` };
}

// Only reads retained objects. No checkout, hooks, upstream JS, lazy fetch or analyzer.
function gitRead(gitDir, args) {
  const result = spawnSync('git', ['--no-replace-objects', '--git-dir', gitDir, ...args], {
    shell: false, windowsHide: true, maxBuffer: 16 * 1024 * 1024, timeout: 30000,
    env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_LITERAL_PATHSPECS: '1', GIT_TERMINAL_PROMPT: '0', GIT_ALLOW_PROTOCOL: '' },
  });
  assert.equal(result.status, 0, `Retained Git read failed: ${result.error?.message ?? result.stderr?.toString().slice(0, 800)}`);
  return result.stdout;
}

export function historicalFile(gitDir, commit, path, referenceSha256) {
  assert(oid.test(commit) && isSafeHoldoutPath(path));
  const tree = gitRead(gitDir, ['ls-tree', '-z', commit, '--', path]).toString('utf8');
  if (!tree) return { status: 'absent-at-commit', sha256: null, git_blob: null };
  const match = /^(100644|100755|120000) blob ([a-f0-9]{40})\t([^\0]+)\0$/u.exec(tree);
  assert(match && match[3] === path, 'Unexpected historical tree entry');
  if (match[1] === '120000') return { status: 'symlink-not-followed', sha256: null, git_blob: match[2] };
  const bytes = gitRead(gitDir, ['cat-file', 'blob', match[2]]);
  assert.equal(gitId('blob', bytes), match[2]);
  return { status: sha256(bytes) === referenceSha256 ? 'same-bytes-as-reference' : 'different-from-reference',
    sha256: sha256(bytes), git_blob: match[2] };
}

export async function buildContracts(packetPath, casesPath, proposalPath = defaultProposal) {
  const proposalBytes = await readFile(proposalPath);
  const proposal = JSON.parse(proposalBytes);
  await validateProposal(proposal);
  const casesBytes = await readFile(casesPath);
  assert.equal(sha256(casesBytes), proposal.cases_sha256, 'Cases raw bytes changed');
  const bundle = JSON.parse(casesBytes);
  validateCases(bundle);
  assert.equal(digest(bundle), proposal.cases_sha256, 'Cases canonical digest changed');
  assert.equal(bundle.transfer_sha256, proposal.transfer_sha256);
  const { root } = await verifyTransfer(packetPath, proposal.transfer_sha256);
  const evidence = [];
  const historical = [];
  const models = {};
  const checkedCommits = new Set();
  const cache = new Map();
  assert.deepEqual([...new Set(bundle.cases.map((c) => c.repository))].sort(), proposal.repositories.map((r) => r.id).sort());
  for (const repo of proposal.repositories) {
    const manifestBytes = await plainFile(root, repo.source.manifest);
    assert.equal(sha256(manifestBytes), repo.source.manifest_sha256, 'Reference manifest changed');
    const manifest = JSON.parse(manifestBytes);
    assert.equal(manifest.repository.commit, repo.reference_commit);
    assert.equal(manifest.repository.id, repo.id);
    const sourceRoot = await directory(join(root, repo.source.root));
    let entries, read;
    if (repo.source.kind === 'git-object-packet') {
      const source = await openObjectSource(sourceRoot, repo.source.manifest_sha256);
      entries = manifest.entries;
      read = (path) => source.readRegularFile(path);
    } else {
      entries = manifest.repository.tracked_files;
      read = (path) => plainFile(sourceRoot, path);
    }
    for (const citation of repo.evidence) {
      const entry = entries.find((e) => e.path === citation.path);
      assert(entry, `Missing citation ${citation.id}`);
      evidence.push(quoteEvidence(repo, citation, await read(citation.path), entry));
    }
    const gitDir = await directory(join(root, 'data/d3-change-packets-20260927-01', repo.id.replace('/', '--'), 'objects.git'));
    const anchors = [...new Set(repo.rules.flatMap((r) => r.historical_anchor_paths))];
    for (const item of bundle.cases.filter((c) => c.repository === repo.id)) {
      assert.equal(item.scope, repo.case_scope, 'Case scope changed');
      for (const side of ['base', 'head']) {
        const commit = item[side];
        const commitKey = `${repo.id}:${commit}`;
        if (!checkedCommits.has(commitKey)) {
          assert.equal(gitId('commit', gitRead(gitDir, ['cat-file', 'commit', commit])), commit, 'Historical commit changed');
          checkedCommits.add(commitKey);
        }
        for (const path of anchors) {
          const key = `${commitKey}:${path}`;
          if (!cache.has(key)) {
            const reference = evidence.find((e) => e.repository === repo.id && e.path === path);
            cache.set(key, historicalFile(gitDir, commit, path, reference.file_sha256));
          }
          historical.push({ case_id: item.id, repository: repo.id, side, commit, path,
            ...cache.get(key), rule_applicability: 'not-decided-by-this-check' });
        }
      }
    }
    models[`${repo.id.replace('/', '--')}.policy.architecture.json`] = policyModel(repo);
  }
  const history = { schema: 'd3-contract-historical-context/1', cases_sha256: proposal.cases_sha256,
    meaning: 'Source anchor byte comparison only, not decisions, rule applicability, tool output or absence of violations.', rows: historical };
  const contract = { ...proposal, proposal_raw_sha256: sha256(proposalBytes),
    rule_ids: proposal.repositories.flatMap((r) => r.rules.map((rule) => rule.id)),
    evidence, historical_context_sha256: digest(history),
    policy_models: Object.entries(models).map(([path, model]) => ({ path, sha256: digest(model), role: 'deny-rule-fragment-not-expected-graph' })),
    labels_created: false, tool_predictions_executed: false, study_execution_authorized: false,
    validation_scope: 'Source integrity, exact quotation, retained historical objects and Core policy syntax only. No scientific acceptance or empirical performance claim.' };
  return { 'contract.json': contract, 'historical-context.json': history, ...models };
}

async function main() {
  const [mode, packetPath, casesPath, outputPath, ...extra] = process.argv.slice(2);
  assert(['build', 'check'].includes(mode) && [packetPath, casesPath, outputPath].every((p) => p && isAbsolute(p)) && extra.length === 0,
    'Usage: node scripts/d3-review/contracts.mjs build|check PACKET_ABS CASES_JSON_ABS NEW_OUTPUT_ABS');
  const target = resolve(outputPath);
  const source = resolve(packetPath);
  assert(target !== source && !target.startsWith(source + sep) && !source.startsWith(target + sep), 'Output must not overlap source packet');
  const artifacts = await buildContracts(source, casesPath);
  if (mode === 'build') {
    await directory(dirname(target));
    await mkdir(target); // Never overwrite an existing kit or evidence folder.
    for (const [path, value] of Object.entries(artifacts)) await writeFile(join(target, path), encode(value), { flag: 'wx' });
  } else {
    await directory(target);
    for (const [path, value] of Object.entries(artifacts)) assert.equal((await plainFile(target, path)).toString('utf8'), encode(value), `Artifact drift: ${path}`);
  }
  const contract = artifacts['contract.json'];
  const counts = {};
  for (const row of artifacts['historical-context.json'].rows) counts[row.status] = (counts[row.status] ?? 0) + 1;
  console.log(JSON.stringify({ status: 'PROPOSED_SOURCE_VERIFIED_NOT_ACCEPTED', mode,
    repositories: contract.repositories.length, rules: contract.rule_ids.length, citations: contract.evidence.length,
    historical_anchor_checks: counts, contract_sha256: digest(contract), labels_created: false, predictions_executed: false }, null, 2));
}

if (process.argv[1] && relative(resolve(process.argv[1]), fileURLToPath(import.meta.url)) === '') {
  main().catch((error) => { console.error(`D3 CONTRACT ERROR: ${error.message}`); process.exitCode = 1; });
}
