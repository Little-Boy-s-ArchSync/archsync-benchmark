import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitId, sha256 } from '../d3-source-review/files.mjs';
import { parseCommit, parseTreeListing } from './offline-source-audit.mjs';

const pins = Object.freeze({
  ledger: 'b9655af035700e12ada897db9c8be3a6d803d17a8a97642a57fca776f746a095',
  commits: '8356a69a4bf8c5c54dbcc092b245fc8e60cfc3996d0791e1a2defcd5049f6b60',
  contract: 'ace17e11043efbf4bcff9728f2702b0d39725fcd8cda80d6cd1d99eae47c4ca6',
});
const repositories = ['hyperdxio/hyperdx', 'amruthpillai/reactive-resume', 'ether/etherpad'];
const oid = value => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);

function git(directory, args) {
  const run = spawnSync('git', [`--git-dir=${directory}`, ...args], {
    env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' },
    timeout: 30000, maxBuffer: 64 * 1024 * 1024, shell: false,
  });
  assert(!run.error && run.status === 0,
    `Offline Git read failed (${args.join(' ')}): ${run.stderr?.toString('utf8').slice(0, 300)}`);
  return run.stdout;
}

export function mappedEntries(tree, mappings, component) {
  const selected = mappings.filter(mapping => mapping.component === component);
  assert(selected.length > 0, `Missing component mapping: ${component}`);
  const matches = [];
  for (const [path, entry] of tree) {
    if (!['100644', '100755'].includes(entry.mode)) continue;
    if (selected.some(mapping => mapping.path === path ||
        (typeof mapping.prefix === 'string' && mapping.prefix.endsWith('/') && path.startsWith(mapping.prefix)))) {
      matches.push({ path, mode: entry.mode, git_blob: entry.blob });
    }
  }
  return matches.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

/** Historical path-role presence only; never a rule decision, label or detector run. */
export function censusRoles(ledger, receipt, contract, gitDirectories) {
  assert.equal(ledger.schema, 'd3-proposed-applicability-evidence/1');
  assert.equal(ledger.status, 'ai-proposed-not-human-verified');
  assert.equal(receipt.schema, 'd3-upstream-commit-audit/1');
  assert.equal(ledger.cases_sha256, receipt.kit_sha256);
  assert.equal(ledger.rows.length, 152);
  assert.equal(ledger.labels_created, false);
  assert.equal(ledger.predictions_executed, false);
  assert.deepEqual(ledger.human_acceptances, []);
  assert.equal(contract.schema, 'd3-research-contract-proposal/1');
  assert.equal(contract.status, 'proposed-not-accepted');
  assert.equal(contract.intent_authority, 'study-defined-not-upstream-approved');
  const commits = new Map(repositories.map(repository => [repository, new Map()]));
  for (const row of receipt.results) {
    assert(commits.has(row.repository) && oid(row.sha) && !commits.get(row.repository).has(row.sha));
    assert(row.remote_commit_match === true && row.tree_match === true && row.parents_match === true,
      'Pinned upstream commit comparison is not accepted');
    commits.get(row.repository).set(row.sha, row);
  }
  const contractRepos = new Map(contract.repositories.map(repository => [repository.id, repository]));
  assert.deepEqual([...contractRepos.keys()].sort(), [...repositories].sort());
  const trees = new Map(), seen = new Set(), rows = [];
  for (const row of ledger.rows) {
    const historical = commits.get(row.repository)?.get(row.commit);
    assert(historical, 'Historical case-side commit missing from pinned upstream receipt');
    assert(['base', 'head'].includes(row.side));
    assert.equal(row.applicability, null, 'Source census cannot accept rule applicability');
    const identity = JSON.stringify([row.repository, row.case_id, row.rule_id, row.side, row.commit]);
    assert(!seen.has(identity), 'Duplicate historical applicability row'); seen.add(identity);
    const repo = contractRepos.get(row.repository);
    const rule = repo.rules.find(candidate => candidate.id === row.rule_id);
    assert(rule && rule.type === 'deny' && rule.relationship_type === 'dependency');
    const directory = gitDirectories[row.repository];
    assert(typeof directory === 'string' && directory);
    const treeKey = `${row.repository}\0${row.commit}`;
    if (!trees.has(treeKey)) {
      const commit = git(directory, ['cat-file', 'commit', row.commit]);
      assert.equal(gitId('commit', commit), row.commit);
      const parsed = parseCommit(commit, row.commit);
      assert.equal(parsed.tree, historical.local_tree);
      assert.deepEqual(parsed.parents, historical.local_parents);
      trees.set(treeKey, parseTreeListing(git(directory, ['ls-tree', '-r', '-z', row.commit])));
    }
    const tree = trees.get(treeKey);
    const source = mappedEntries(tree, repo.mapping, rule.from);
    const target = mappedEntries(tree, repo.mapping, rule.to);
    rows.push({ repository: row.repository, case_id: row.case_id, rule_id: row.rule_id,
      side: row.side, commit: row.commit, commit_tree: historical.local_tree,
      source_component: rule.from, source_regular_paths: source.length, source_example: source[0] ?? null,
      target_component: rule.to, target_regular_paths: target.length, target_example: target[0] ?? null,
      proposed_role_presence: source.length > 0 && target.length > 0 ? 'both-present' : 'group-missing',
      rule_applicability: null, truth_label: null, tool_prediction: null });
  }
  return { schema: 'd3-historical-source-role-census/1',
    status: 'source-role-metadata-only-not-applicability',
    inputs: { proposed_ledger_sha256: pins.ledger, upstream_receipt_sha256: pins.commits,
      proposed_contract_sha256: pins.contract },
    rows,
    summary: { rows: rows.length, distinct_commit_trees: trees.size,
      both_roles_present: rows.filter(row => row.proposed_role_presence === 'both-present').length,
      group_missing: rows.filter(row => row.proposed_role_presence === 'group-missing').length,
      applicability_decisions_accepted: 0, truth_labels_created: 0, tool_predictions_executed: 0 } };
}

async function main(args) {
  assert(args.length === 5 && ['--write', '--check'].includes(args[0]),
    'Usage: historical-role-census.mjs --write|--check OUTPUT HYPERDX_GIT REACTIVE_GIT ETHERPAD_GIT');
  const [mode, output, hyperdx, reactive, etherpad] = args;
  const inputs = [
    ['ledger', 'holdout/d3-applicability-proposal-20260928/evidence-ledger.json'],
    ['commits', 'holdout/d3-upstream-commit-audit-20260928/receipt.json'],
    ['contract', 'holdout/contracts/v0.1.0/proposal.json'],
  ];
  const parsed = {};
  for (const [key, path] of inputs) {
    const bytes = await readFile(resolve(path));
    assert.equal(sha256(bytes), pins[key], `${key} raw bytes changed`);
    parsed[key] = JSON.parse(bytes);
  }
  const census = censusRoles(parsed.ledger, parsed.commits, parsed.contract, {
    'hyperdxio/hyperdx': hyperdx, 'amruthpillai/reactive-resume': reactive, 'ether/etherpad': etherpad,
  });
  const bytes = Buffer.from(`${JSON.stringify(census, null, 2)}\n`);
  if (mode === '--write') await writeFile(output, bytes, { flag: 'wx' });
  else assert.deepEqual(await readFile(output), bytes, 'Retained source-role census changed');
  process.stdout.write(`${JSON.stringify(census.summary)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch(error => { console.error(error); process.exitCode = 1; });
}
