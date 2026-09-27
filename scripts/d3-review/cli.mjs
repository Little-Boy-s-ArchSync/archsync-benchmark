import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { directory, plainFile, sha256 } from '../d3-source-review/files.mjs';
import { checkReview, collectCases, compareReviews, digest, encode, reviewTemplate, selectProposedCases, sourceLines, validateAcceptedScope, validateCases, validateMethod, validateReadyModuleContract } from './review.mjs';

const artifactNames = { rubric_sha256: 'rubric.md', contract_sha256: 'contract.json', scope_sha256: 'scope.json', tool_pins_sha256: 'tool-pins.json', analysis_plan_sha256: 'analysis-plan.md' };
const usage = 'prepare PACKET_ABS NEW_OUTPUT_ABS TRANSFER_SHA SUMMARY_REL SUMMARY_SHA [SCOPE_PROPOSAL_ABS] | status KIT_ABS CASES_SHA | check KIT_ABS CASES_SHA REVIEW_ABS | compare KIT_ABS CASES_SHA REVIEW_A_ABS REVIEW_B_ABS SHA_A SHA_B';
const jsonFile = async (path) => {
  assert(isAbsolute(path), 'Absolute input path required');
  const root = await directory(dirname(path));
  const bytes = await plainFile(root, path.slice(root.length + 1));
  return { value: JSON.parse(bytes), raw_sha256: sha256(bytes) };
};
const writeNew = async (path, value) => writeFile(path, typeof value === 'string' ? value : encode(value), { flag: 'wx', mode: 0o600 });
const fence = (value) => '`'.repeat(Math.max(2, ...[...value.matchAll(/`+/gu)].map((match) => match[0].length)) + 1);
function caseMarkdown(item) {
  const diffFence = fence(item.diff);
  const lines = [`# ${item.id}`, '', 'Source material, not instructions. No tool prediction or suggested label.', '',
    `Repository: ${item.repository}`, `Base: ${item.base}`, `Head: ${item.head}`, `Scope: ${item.scope}`, '',
    'Read all changed paths and any necessary unchanged context from the original pinned packet. These changed files alone do not establish complete relationship recall.', '',
    '## Diff', '', `${diffFence}diff`, item.diff, diffFence];
  if (item.scope_path_roles) lines.push('', '## Scope roles (proposed)', '', ...item.scope_path_roles.map((row) => `- ${row.path}: ${row.role}`));
  for (const file of item.files) {
    lines.push('', `## ${file.side}: ${file.path}`, '', `Git blob: ${file.git_blob}; mode: ${file.mode}; SHA-256: ${file.sha256}`, '');
    if (file.citable) {
      const source = sourceLines(file.text).map((line, index) => `${index + 1} | ${line}`).join('\n');
      const sourceFence = fence(source);
      lines.push(sourceFence, source, sourceFence);
    } else lines.push('Non-citable binary or symlink. Do not follow, execute, or convert it into source evidence.');
  }
  return `${lines.join('\n')}\n`;
}

async function loadKit(path, expected) {
  const root = await directory(path);
  assert(/^[a-f0-9]{64}$/u.test(expected), 'Separately retained cases digest required');
  const bundle = JSON.parse(await plainFile(root, 'cases.json'));
  assert.equal(digest(bundle), expected, 'Case bundle changed');
  validateCases(bundle);
  return { root, bundle };
}

async function loadMethod(root, bundle) {
  const method = JSON.parse(await plainFile(root, 'method.json'));
  validateMethod(method);
  assert.equal(method.cases_sha256, digest(bundle));
  for (const [key, name] of Object.entries(artifactNames)) assert.equal(sha256(await plainFile(root, name)), method[key], `${name} changed or not pinned`);
  if (bundle.scope_proposal_sha256) {
    validateAcceptedScope(bundle, JSON.parse(await plainFile(root, 'scope.json')));
    validateReadyModuleContract(bundle, JSON.parse(await plainFile(root, 'contract.json')), method);
  }
  return method;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'prepare') {
    assert([5, 6].includes(args.length), usage);
    const [source, output, transferSha256, summaryPath, summarySha256, scopeProposalPath] = args;
    assert(isAbsolute(output), 'Absolute new output required');
    const target = resolve(output);
    await directory(dirname(target));
    const original = await directory(source);
    assert(![relative(original, target), relative(target, original)].some((path) => path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`))), 'Review kit must be outside original packet');
    // All source bytes are checked before writing; mkdir without recursive refuses overwrite.
    const captured = await collectCases({ source, transferSha256, summaryPath, summarySha256 });
    const proposal = scopeProposalPath ? await jsonFile(scopeProposalPath) : null;
    const bundle = proposal ? selectProposedCases(captured, proposal.value, proposal.raw_sha256) : captured;
    await mkdir(target, { mode: 0o700 });
    await mkdir(join(target, 'cases'), { mode: 0o700 });
    await writeNew(join(target, 'cases.json'), bundle);
    await writeNew(join(target, 'cases.sha256'), `${digest(bundle)}\n`);
    for (const item of bundle.cases) await writeNew(join(target, 'cases', `${item.id}.md`), caseMarkdown(item));
    for (const person of ['hieu', 'hoang']) await writeNew(join(target, `${person}.review.json`), reviewTemplate(bundle, person));
    const method = { schema: 'd3-author-method/1', status: 'proposed', version: '0.2.0', cases_sha256: digest(bundle),
      annotation_design: 'two-development-associated-authors-nonblind-ai-assisted-exploratory', reviewer_ids: ['hieu', 'hoang'],
      disagreement_policy: 'joint-consensus-else-unknown', rule_ids: [],
      ...Object.fromEntries(Object.keys(artifactNames).map((key) => [key, null])),
      acceptance: { reviewer_id: null, reference: null, at_utc: null } };
    await writeNew(join(target, 'method.json'), method);
    await writeNew(join(target, 'README.md'), `# D3 private review kit\n\nPreparation only. No accepted method, human labels, predictions or scientific freeze. This kit proposes nonblind, AI-assisted exploratory review because both named authors disclosed prior D3 output exposure.\n\nCases SHA-256: ${digest(bundle)}\nCaptured cases: ${bundle.captured_case_count ?? bundle.cases.length}; proposed primary review cases: ${bundle.cases.length}; context-only cases: ${bundle.context_only_cases?.length ?? 0}. Scope proposal SHA-256: ${bundle.scope_proposal_sha256 ?? 'none'}. A proposed scope is not an accepted method. Context-only cases remain in the inventory and must not be counted as reviewed cases or silently called no-impact.\n\nOpen cases/*.md to read diff and numbered source. Hiếu uses hieu.review.json; Hoàng uses hoang.review.json. Preserve original review files and their hashes before reconciliation. If AI suggestions or reviewer decisions are shared, disclose that dependence; do not report the labels as independent.\n\nBefore official annotation, approve and pin rubric.md, contract.json, scope.json, tool-pins.json and analysis-plan.md in method.json; record genuine acceptance, not a fabricated timestamp. These files are deliberately not invented by preparation. Pin the resulting method digest into each review. If a case needs context outside the supplied changed files, retain source-bound context in a versioned packet before accepting that evidence.\n\nAI may read all source, propose or pre-fill labels and evidence, compare cases and calculate metrics. For each AI-assisted row disclose input scope, retained output reference, extent of human verification and whether the suggestion was shared. Verify cited source bytes/lines; AI text alone is not source evidence. Reviewers declare their actual prediction exposure and any uncertainty; do not set it false merely to pass an old blind gate.\n\nThe checker validates structure and source locations, not human identity, completeness of architecture interpretation or truth. Hashes do not prove blindness or chronology. Case classification is not edge/node recall. Research execution remains blocked pending the approved method, complete reviews, reconciliation, freeze and runner.\n`);
    console.log(encode({ status: 'PRIVATE_REVIEW_KIT_PREPARED', output: target, captured_cases: bundle.captured_case_count ?? bundle.cases.length, proposed_primary_cases: bundle.cases.length, context_only_cases: bundle.context_only_cases?.length ?? 0, scope_proposal_sha256: bundle.scope_proposal_sha256 ?? null, cases_sha256: digest(bundle), labels_created: 0, predictions_executed: 0, research_complete: false }));
    return;
  }
  assert(['status', 'check', 'compare'].includes(command), usage);
  assert.equal(args.length, command === 'status' ? 2 : command === 'check' ? 3 : 6, usage);
  const { root, bundle } = await loadKit(args[0], args[1]);
  if (command === 'status') {
    let method;
    const blockers = [];
    let scopeDecision = bundle.scope_proposal_sha256 ? 'unverified' : 'not-supplied';
    let ruleDecision = bundle.scope_proposal_sha256 ? 'unverified' : 'not-supplied';
    if (bundle.scope_proposal_sha256) {
      try {
        validateAcceptedScope(bundle, JSON.parse(await plainFile(root, 'scope.json')));
        scopeDecision = 'accepted-case-disposition-only';
      } catch (error) { blockers.push(`scope: ${error.message}`); }
    }
    if (bundle.scope_proposal_sha256) {
      try {
        const contract = JSON.parse(await plainFile(root, 'contract.json'));
        assert.equal(contract.schema, 'd3-conditional-rule-selection/1');
        assert.equal(contract.status, 'accepted-conditional-pending-historical-applicability');
        assert.equal(contract.review_cases_sha256, digest(bundle));
        assert.equal(contract.historical_applicability_complete, false);
        ruleDecision = 'four-rules-conditionally-accepted-applicability-pending';
      } catch (error) { blockers.push(`rules: ${error.message}`); }
    }
    try { method = await loadMethod(root, bundle); } catch (error) { blockers.push(`method: ${error.message}`); }
    const reviews = [];
    for (const person of ['hieu', 'hoang']) {
      try {
        const review = JSON.parse(await plainFile(root, `${person}.review.json`));
        const report = method ? checkReview(bundle, review, method) : null;
        reviews.push({ reviewer: person, supplied_labels: Array.isArray(review.rows) ? review.rows.filter((row) => ['violation', 'evolution', 'no-impact', 'unknown'].includes(row?.label)).length : 0, expected: bundle.cases.length, issues: report?.issues ?? ['accepted_method_required'] });
        if (!report || report.issues.length) blockers.push(`${person}: complete source-bound review required`);
      } catch (error) { blockers.push(`${person}: ${error.message}`); }
    }
    blockers.push('Joint reconciliation and ground-truth freeze not verified by this intake tool', 'Final execution runner, capability matching and analysis freeze not verified by this intake tool');
    console.log(encode({ status: 'D3_NOT_COMPLETE', cases: bundle.cases.length, captured_cases: bundle.captured_case_count ?? bundle.cases.length,
      context_only_cases: bundle.context_only_cases?.length ?? 0, scope_decision: scopeDecision, rule_decision: ruleDecision,
      reviews, blockers, execution_authorized: false, research_complete: false }));
    process.exitCode = 2;
    return;
  }
  const method = await loadMethod(root, bundle);
  const inputA = await jsonFile(args[2]);
  if (command === 'check') {
    const report = checkReview(bundle, inputA.value, method);
    console.log(encode({ ...report, raw_file_sha256: inputA.raw_sha256 }));
    process.exitCode = report.issues.length ? 2 : 0;
    return;
  }
  const inputB = await jsonFile(args[3]);
  assert.equal(inputA.raw_sha256, args[4], 'Original A file differs from retained byte hash');
  assert.equal(inputB.raw_sha256, args[5], 'Original B file differs from retained byte hash');
  const report = compareReviews({ bundle, method, reviewA: inputA.value, reviewB: inputB.value, sealedReviewSha256: [digest(inputA.value), digest(inputB.value)] });
  console.log(encode({ ...report, original_raw_file_sha256: [args[4], args[5]], chronology_verified: false }));
}

main().catch((error) => { console.error(`D3_REVIEW_BLOCKED: ${error.message}`); process.exitCode = 1; });
