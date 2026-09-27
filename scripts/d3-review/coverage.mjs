import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha256 } from '../d3-source-review/files.mjs';
import { digest, encode, validateCases } from './review.mjs';

const hex = /^[a-f0-9]{64}$/u;

function pathInMapping(path, entry) {
  if (entry.path !== undefined) return path === entry.path;
  assert(typeof entry.prefix === 'string' && entry.prefix.endsWith('/'), 'Invalid component prefix');
  return path.startsWith(entry.prefix);
}

/** Source-path feasibility only. It creates no architecture labels or detector results. */
export function summarizeRuleSourceCoverage(bundle, contract, selection) {
  validateCases(bundle);
  assert(bundle.scope_proposal_sha256, 'Selected source bundle required');
  assert.equal(contract?.schema, 'd3-research-contract-proposal/1');
  assert.equal(contract.transfer_sha256, bundle.transfer_sha256);
  assert.equal(selection?.schema, 'd3-conditional-rule-selection/1');
  assert.equal(selection.review_cases_sha256, digest(bundle));
  assert(Array.isArray(selection.active_candidate_rule_ids));
  const active = new Set(selection.active_candidate_rule_ids);
  const testPattern = new RegExp(contract.module_semantics.test_path_regex, 'u');
  const sourceExtensions = new Set(contract.module_semantics.source_extensions);
  const repositories = [];
  const seenRules = new Set();
  for (const repo of contract.repositories) {
    const cases = bundle.cases.filter((item) => item.repository === repo.id);
    if (cases.length === 0) continue;
    const rules = [];
    for (const rule of repo.rules) {
      if (!active.has(rule.id)) continue;
      seenRules.add(rule.id);
      const sourceMappings = repo.mapping.filter((entry) => entry.component === rule.from);
      assert(sourceMappings.length > 0, `Rule ${rule.id} has no source mapping`);
      const affected = [];
      for (const item of cases) {
        const primaryPaths = item.scope_path_roles.filter((row) => row.role === 'primary-candidate').map((row) => row.path);
        const mapped = primaryPaths.filter((path) => sourceMappings.some((entry) => pathInMapping(path, entry)));
        const production = mapped.filter((path) => !testPattern.test(path) &&
          [...sourceExtensions].some((extension) => path.endsWith(extension)));
        if (mapped.length > 0) affected.push({ case_id: item.id, mapped_changed_paths: mapped, production_changed_paths: production });
      }
      rules.push({ rule_id: rule.id, source_component: rule.from, cases_with_changed_mapped_source: affected.length,
        cases_with_changed_production_source: affected.filter((row) => row.production_changed_paths.length > 0).length,
        affected_cases: affected });
    }
    repositories.push({ repository: repo.id, primary_cases: cases.length, rules });
  }
  assert.deepEqual([...seenRules].sort(), [...active].sort(), 'Active rule coverage is incomplete');
  return { schema: 'd3-rule-source-path-preflight/1', status: 'source-feasibility-not-truth',
    cases_sha256: digest(bundle), captured_cases: bundle.captured_case_count,
    primary_cases: bundle.cases.length, context_only_cases: bundle.context_only_cases.length,
    repositories, labels_created: false, predictions_executed: false };
}

async function readPinned(path, expected) {
  assert(isAbsolute(path) && hex.test(expected), 'Absolute path and SHA-256 required');
  const bytes = await readFile(path);
  assert.equal(sha256(bytes), expected, `Pinned file changed: ${path}`);
  return JSON.parse(bytes);
}

async function main() {
  const [casesPath, casesSha, contractPath, contractSha, selectionPath, selectionSha] = process.argv.slice(2);
  const bundle = await readPinned(casesPath, casesSha);
  const contract = await readPinned(contractPath, contractSha);
  const selection = await readPinned(selectionPath, selectionSha);
  assert.equal(selection.source_contract_sha256, contractSha);
  console.log(encode(summarizeRuleSourceCoverage(bundle, contract, selection)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(`D3_PREFLIGHT_BLOCKED: ${error.message}`); process.exitCode = 1; });
}
