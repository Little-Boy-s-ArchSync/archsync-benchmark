import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitId, sha256 } from '../d3-source-review/files.mjs';
import { mappedEntries } from './historical-role-census.mjs';
import { parseCommit, parseTreeListing } from './offline-source-audit.mjs';

const expected = Object.freeze({
  census: '369c4d5a39e021acf5424df2c51de33a736b9058d132d460fc2423a1c4e431a7',
  contract: 'ace17e11043efbf4bcff9728f2702b0d39725fcd8cda80d6cd1d99eae47c4ca6',
});

function git(directory, args) {
  const run = spawnSync('git', [`--git-dir=${directory}`, ...args], {
    env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' },
    timeout: 30000, maxBuffer: 64 * 1024 * 1024, shell: false,
  });
  assert(!run.error && run.status === 0,
    `Offline Git read failed: ${run.stderr?.toString('utf8').slice(0, 300)}`);
  return run.stdout;
}

/** A lexical prefilter only: generated/vendor status and role semantics still need review. */
export function candidatePaths(entries, semantics) {
  const test = new RegExp(semantics.test_path_regex, 'u');
  const extensions = semantics.source_extensions;
  assert(Array.isArray(extensions) && extensions.length > 0);
  return entries.filter(entry => !test.test(entry.path) &&
    extensions.some(extension => entry.path.endsWith(extension)));
}

/** Exact historical Git paths, not rule applicability, truth, or a tool result. */
export function censusProductionCandidates(census, contract, directories) {
  assert.equal(census.schema, 'd3-historical-source-role-census/1');
  assert.equal(census.status, 'source-role-metadata-only-not-applicability');
  assert.equal(census.rows.length, 152);
  assert.equal(contract.schema, 'd3-research-contract-proposal/1');
  assert.equal(contract.status, 'proposed-not-accepted');
  const repos = new Map(contract.repositories.map(repo => [repo.id, repo]));
  const trees = new Map();
  const rows = census.rows.map(row => {
    assert.equal(row.rule_applicability, null);
    assert.equal(row.truth_label, null);
    assert.equal(row.tool_prediction, null);
    const repo = repos.get(row.repository);
    const directory = directories[row.repository];
    assert(repo && directory, 'Missing pinned repository or bare Git directory');
    const key = `${row.repository}\0${row.commit}`;
    if (!trees.has(key)) {
      const bytes = git(directory, ['cat-file', 'commit', row.commit]);
      assert.equal(gitId('commit', bytes), row.commit);
      assert.equal(parseCommit(bytes, row.commit).tree, row.commit_tree);
      trees.set(key, parseTreeListing(git(directory, ['ls-tree', '-r', '-z', row.commit])));
    }
    const tree = trees.get(key);
    const source = candidatePaths(mappedEntries(tree, repo.mapping, row.source_component), contract.module_semantics);
    const target = candidatePaths(mappedEntries(tree, repo.mapping, row.target_component), contract.module_semantics);
    assert(source.length <= row.source_regular_paths && target.length <= row.target_regular_paths);
    return {
      repository: row.repository, case_id: row.case_id, rule_id: row.rule_id,
      side: row.side, commit: row.commit, commit_tree: row.commit_tree,
      source_candidate_paths: source.length, source_example: source[0] ?? null,
      target_candidate_paths: target.length, target_example: target[0] ?? null,
      candidate_presence: source.length && target.length ? 'both-candidate-paths' : 'candidate-path-missing',
      historical_role_verified: false, rule_applicability: null, truth_label: null, tool_prediction: null,
    };
  });
  return {
    schema: 'd3-historical-production-role-candidates/1',
    status: 'lexical-path-filter-only-not-applicability',
    inputs: { historical_census_sha256: expected.census, proposed_contract_sha256: expected.contract },
    rows,
    summary: { rows: rows.length, distinct_commit_trees: trees.size,
      both_candidate_paths: rows.filter(row => row.candidate_presence === 'both-candidate-paths').length,
      candidate_path_missing: rows.filter(row => row.candidate_presence === 'candidate-path-missing').length,
      historical_roles_verified: 0, applicability_decisions_accepted: 0,
      truth_labels_created: 0, tool_predictions_executed: 0 },
  };
}

async function main(args) {
  assert(args.length === 5 && ['--write', '--check'].includes(args[0]),
    'Usage: production-role-candidates.mjs --write|--check OUTPUT HYPERDX_GIT REACTIVE_GIT ETHERPAD_GIT');
  const [mode, output, hyperdx, reactive, etherpad] = args;
  const paths = {
    census: 'holdout/d3-historical-role-census-20260928/receipt.json',
    contract: 'holdout/contracts/v0.1.0/proposal.json',
  };
  const parsed = {};
  for (const [key, path] of Object.entries(paths)) {
    const bytes = await readFile(resolve(path));
    assert.equal(sha256(bytes), expected[key], `${key} raw bytes changed`);
    parsed[key] = JSON.parse(bytes);
  }
  const result = censusProductionCandidates(parsed.census, parsed.contract, {
    'hyperdxio/hyperdx': hyperdx,
    'amruthpillai/reactive-resume': reactive,
    'ether/etherpad': etherpad,
  });
  const bytes = Buffer.from(`${JSON.stringify(result, null, 2)}\n`);
  if (mode === '--write') await writeFile(output, bytes, { flag: 'wx' });
  else assert.deepEqual(await readFile(output), bytes, 'Retained production-role candidates changed');
  process.stdout.write(`${JSON.stringify(result.summary)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch(error => { console.error(error); process.exitCode = 1; });
}
