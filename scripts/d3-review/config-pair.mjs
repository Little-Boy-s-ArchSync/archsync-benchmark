import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sha256 } from '../d3-source-review/files.mjs';
import { verifyReceipt as verifyCommon } from '../../development/common-module-capability/verify.mjs';
import { verifyV3 as verifyModes } from '../../development/common-module-capability-modes-v3/runner.mjs';
import { validateFreezeManifest } from './module-method.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const proposalPath = 'holdout/d3-module-method/v0.2.1/tool-pair.proposal.json';
const parentPath = 'holdout/d3-module-method/v0.2.0/freeze-manifest.json';
const expected = Object.freeze({
  parent: 'd06f3c27505de127e06538abc92bc7250412be798b4d1676436ccbc596605ed7',
  selectedConfig: '422d947bbb0c59321eaa3bf5b4e87c3efeb2107f4655bd168c2c7f5ed4ea6333',
  selectedReceipt: 'adcaf0af23caf126087906e55b8ed99784a641ddfeb6e46cfa77e4c0f7c3946f',
  selectedProfile: 'c4ccf5d0f2c6b90da8509dcad49707dbd20166b83ea2f394a191edadf853aab6',
  historicalConfig: '451b1ece50e08129425cc76c5fc314ae121be68571e01ce23ce7c0d8d38711b6',
  historicalReceipt: '83962338666783d771469c5bc36092857be46987cbc14729326abe7cc6c8d4a9',
});

export function validateTechnicalPair(pair) {
  assert.equal(pair.schema, 'd3-comparator-technical-pair/1');
  assert.equal(pair.version, '0.2.1-candidate');
  assert.equal(pair.status, 'technical-pair-confirmed-not-method-freeze');
  assert.equal(pair.parent_method_manifest_sha256, expected.parent);
  assert.deepEqual(pair.selected, {
    configuration_path: 'development/common-module-capability-modes-v3/dependency-cruiser.json',
    configuration_sha256: expected.selectedConfig,
    receipt_manifest_path: 'development/common-module-capability-modes-v3/receipt/manifest.json',
    receipt_manifest_sha256: expected.selectedReceipt,
    profile_path: 'development/common-module-capability-modes-v3/profile.json',
    profile_sha256: expected.selectedProfile,
    capability: 'deduplicated-cross-group-source-file-edge-only',
    probes: { total: 7, narrow_shared_candidates: 3, unsupported: 4 },
  }, 'Selected configuration must match only the modes-v3 receipt');
  assert.deepEqual(pair.historical_diagnostic, {
    configuration_path: 'development/common-module-capability/dependency-cruiser.json',
    configuration_sha256: expected.historicalConfig,
    receipt_manifest_path: 'development/common-module-capability/receipt/manifest.json',
    receipt_manifest_sha256: expected.historicalReceipt,
    probes: { total: 7, narrow_shared_candidates: 2, failed_common_candidates: 1, unsupported: 4 },
  }, 'Historical configuration and receipt must stay paired');
  assert.deepEqual(pair.open_gates, {
    effective_case_side_project_configurations: true,
    package_and_workspace_resolution: true,
    guardian_configuration_pin: true,
    independent_person_reproduction: true,
    historical_applicability_decisions: true,
    author_source_reviews: true,
    joint_final_method_acceptance: true,
  });
  assert.deepEqual(pair.human_final_method_acceptance, { hieu: null, hoang: null });
  assert.equal(pair.d3_tool_runs_executed, false);
  assert.equal(pair.d3_results_computed, false);
  return { status: pair.status, selected_configuration_sha256: expected.selectedConfig,
    selected_receipt_sha256: expected.selectedReceipt, open_gates: Object.keys(pair.open_gates),
    d3_executed: false, research_complete: false };
}

export async function verifyTechnicalPair(repoRoot = root) {
  const pairBytes = await readFile(join(repoRoot, proposalPath));
  const pair = JSON.parse(pairBytes);
  const report = validateTechnicalPair(pair);
  const parentBytes = await readFile(join(repoRoot, parentPath));
  assert.equal(sha256(parentBytes), expected.parent, 'Parent method manifest changed');
  const parent = await validateFreezeManifest(JSON.parse(parentBytes), repoRoot);
  assert.equal(parent.status, 'VERIFIED_PROPOSAL_NOT_READY_TO_FREEZE');
  for (const [record, prefix] of [[pair.selected, 'selected'], [pair.historical_diagnostic, 'historical']]) {
    const configBytes = await readFile(join(repoRoot, record.configuration_path));
    const receiptBytes = await readFile(join(repoRoot, record.receipt_manifest_path));
    assert.equal(sha256(configBytes), record.configuration_sha256, `${prefix} config bytes changed`);
    assert.equal(sha256(receiptBytes), record.receipt_manifest_sha256, `${prefix} receipt bytes changed`);
    const receipt = JSON.parse(receiptBytes);
    assert.equal(receipt.inputs.find(input => input.path === 'dependency-cruiser.json')?.sha256,
      record.configuration_sha256, `${prefix} receipt/config cross-pairing`);
  }
  const profileBytes = await readFile(join(repoRoot, pair.selected.profile_path));
  assert.equal(sha256(profileBytes), pair.selected.profile_sha256, 'Modes profile changed');
  const profile = JSON.parse(profileBytes);
  assert.equal(profile.configuration_sha256, expected.selectedConfig);
  assert.equal(profile.receipt_manifest_sha256, expected.selectedReceipt);
  const historical = JSON.parse(await readFile(join(repoRoot, pair.historical_diagnostic.configuration_path)));
  const selected = JSON.parse(await readFile(join(repoRoot, pair.selected.configuration_path)));
  assert.deepEqual(selected.options.enhancedResolveOptions, { exportsFields: ['exports'] },
    'Unsupported comparator configuration change');
  delete selected.options.enhancedResolveOptions;
  assert.deepEqual(selected, historical, 'Comparator configurations differ beyond exportsFields');
  const common = await verifyCommon(join(repoRoot, 'development/common-module-capability'),
    join(repoRoot, 'development/common-module-capability/receipt'));
  const modes = await verifyModes(join(repoRoot, 'development/common-module-capability-modes-v3/receipt'));
  assert.deepEqual(common, { cases: 7, common_fixture_passes: 2, failed_common_candidates: 1,
    unsupported_probes: 4, d3_executed: false });
  assert.deepEqual(modes, { cases: 7, common_fixture_passes: 3, failed_common_candidates: 0,
    unsupported_probes: 4, d3_executed: false });
  return { ...report, proposal_raw_sha256: sha256(pairBytes), parent_method_status: parent.status,
    selected_non_d3_capability: modes, historical_non_d3_capability: common };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verifyTechnicalPair().then(report => console.log(JSON.stringify(report, null, 2)))
    .catch(error => { console.error(`D3_TECHNICAL_PAIR_INVALID: ${error.message}`); process.exitCode = 1; });
}
