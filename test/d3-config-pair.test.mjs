import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateTechnicalPair, verifyTechnicalPair } from '../scripts/d3-review/config-pair.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const path = join(root, 'holdout/d3-module-method/v0.2.1/tool-pair.proposal.json');

test('confirmed candidate binds exact comparator configuration to its own receipt', async () => {
  const pair = JSON.parse(await readFile(path));
  const report = validateTechnicalPair(pair);
  assert.equal(report.selected_configuration_sha256,
    '422d947bbb0c59321eaa3bf5b4e87c3efeb2107f4655bd168c2c7f5ed4ea6333');
  assert.equal(report.research_complete, false);
  const checked = await verifyTechnicalPair(root);
  assert.equal(checked.selected_non_d3_capability.common_fixture_passes, 3);
  assert.equal(checked.selected_non_d3_capability.unsupported_probes, 4);
  assert.equal(checked.parent_method_status, 'VERIFIED_PROPOSAL_NOT_READY_TO_FREEZE');
});

test('cross-pairing, broadened capability and premature acceptance fail closed', async () => {
  const pair = JSON.parse(await readFile(path));
  const swapped = structuredClone(pair);
  swapped.selected.receipt_manifest_sha256 = pair.historical_diagnostic.receipt_manifest_sha256;
  assert.throws(() => validateTechnicalPair(swapped), /Selected configuration must match/u);
  const broadened = structuredClone(pair);
  broadened.selected.probes.narrow_shared_candidates = 7;
  assert.throws(() => validateTechnicalPair(broadened), /Selected configuration must match/u);
  const accepted = structuredClone(pair);
  accepted.human_final_method_acceptance.hieu = 'not independently verified';
  assert.throws(() => validateTechnicalPair(accepted));
  const ranD3 = structuredClone(pair);
  ranD3.d3_tool_runs_executed = true;
  assert.throws(() => validateTechnicalPair(ranD3));
});
