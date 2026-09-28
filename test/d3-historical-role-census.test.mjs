import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import test from 'node:test';
import { censusRoles, mappedEntries } from '../scripts/d3-review/historical-role-census.mjs';

function git(args) {
  const run = spawnSync('git', args, { encoding: 'utf8', timeout: 10000 });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.trim();
}

test('role mapping is exact or slash-bounded and excludes symlink entries', () => {
  const tree = new Map([
    ['src/source/a.ts', { mode: '100644', blob: 'a'.repeat(40) }],
    ['src/source2/b.ts', { mode: '100644', blob: 'b'.repeat(40) }],
    ['src/source/link.ts', { mode: '120000', blob: 'c'.repeat(40) }],
    ['src/target.ts', { mode: '100755', blob: 'd'.repeat(40) }],
  ]);
  const mappings = [{ component: 'source', prefix: 'src/source/' },
    { component: 'target', path: 'src/target.ts' }];
  assert.deepEqual(mappedEntries(tree, mappings, 'source'),
    [{ path: 'src/source/a.ts', mode: '100644', git_blob: 'a'.repeat(40) }]);
  assert.equal(mappedEntries(tree, mappings, 'target').length, 1);
  assert.throws(() => mappedEntries(tree, mappings, 'unknown'), /Missing component mapping/u);
});

test('historical source census preserves 152 null decisions and fails closed on early acceptance', async () => {
  const root = await mkdtemp(join(tmpdir(), 'archsync-d3-role-census-'));
  assert(resolve(root).startsWith(resolve(tmpdir()) + sep));
  try {
    const source = join(root, 'source'), bare = join(root, 'bare.git');
    await mkdir(join(source, 'src/source'), { recursive: true });
    await mkdir(join(source, 'src/target'), { recursive: true });
    git(['init', '-q', source]);
    git(['-C', source, 'config', 'user.name', 'Census Test']);
    git(['-C', source, 'config', 'user.email', 'census@example.org']);
    await writeFile(join(source, 'src/source/a.ts'), 'export const source = true;\n');
    await writeFile(join(source, 'src/target/b.ts'), 'export const target = true;\n');
    git(['-C', source, 'add', '--', 'src/source/a.ts', 'src/target/b.ts']);
    git(['-C', source, 'commit', '-q', '-m', 'source roles']);
    git(['clone', '--bare', '-q', source, bare]);
    const commit = git(['-C', source, 'rev-parse', 'HEAD']);
    const tree = git(['-C', source, 'rev-parse', 'HEAD^{tree}']);
    const repositories = ['hyperdxio/hyperdx', 'amruthpillai/reactive-resume', 'ether/etherpad'];
    const receipt = { schema: 'd3-upstream-commit-audit/1', kit_sha256: 'e'.repeat(64),
      results: repositories.map(repository => ({ repository, sha: commit, local_tree: tree,
        local_parents: [], remote_commit_match: true, tree_match: true, parents_match: true })) };
    const contract = { schema: 'd3-research-contract-proposal/1', status: 'proposed-not-accepted',
      intent_authority: 'study-defined-not-upstream-approved',
      repositories: repositories.map(id => ({ id,
        mapping: [{ component: 'source', prefix: 'src/source/' },
          { component: 'target', prefix: 'src/target/' }],
        rules: [{ id: 'RULE-1', type: 'deny', relationship_type: 'dependency',
          from: 'source', to: 'target' }] })) };
    const ledger = { schema: 'd3-proposed-applicability-evidence/1',
      status: 'ai-proposed-not-human-verified', cases_sha256: receipt.kit_sha256,
      labels_created: false, predictions_executed: false, human_acceptances: [],
      rows: Array.from({ length: 152 }, (_, index) => ({ repository: repositories[index % 3],
        case_id: `CASE-${index}`, rule_id: 'RULE-1', side: index % 2 ? 'head' : 'base',
        commit, applicability: null })) };
    const directories = Object.fromEntries(repositories.map(repository => [repository, bare]));
    const census = censusRoles(ledger, receipt, contract, directories);
    assert.equal(census.summary.rows, 152);
    assert.equal(census.summary.both_roles_present, 152);
    assert.equal(census.summary.applicability_decisions_accepted, 0);
    assert(census.rows.every(row => row.rule_applicability === null && row.truth_label === null));
    const accepted = structuredClone(ledger);
    accepted.rows[0].applicability = 'applicable';
    assert.throws(() => censusRoles(accepted, receipt, contract, directories),
      /cannot accept rule applicability/u);
    const wrongCommit = structuredClone(ledger);
    wrongCommit.rows[0].commit = '0'.repeat(40);
    assert.throws(() => censusRoles(wrongCommit, receipt, contract, directories),
      /commit missing/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
