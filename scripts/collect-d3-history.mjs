import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [directory, ghExecutable] = process.argv.slice(2);
if (!directory || !isAbsolute(directory) || !ghExecutable || !isAbsolute(ghExecutable)) throw new Error('Usage: node scripts/collect-d3-history.mjs ABS_NEW_DIRECTORY ABS_GH_EXE');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const selection = JSON.parse(await readFile(join(root, 'holdout/selection-preparation-20260927.json')));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
await mkdir(directory);
const plan = { schema_version: 1, status: 'candidate-history-not-ground-truth', recorded_at: new Date().toISOString(),
  rule: 'First 20 commits returned by GitHub commits API for the pinned revision and fixed backend path, in provider order; keep merges, test-only changes, missing patches and failures. No filtering by message, tool prediction or desired outcome.',
  limit_per_repository: 20, repositories: selection.repositories, predictions_executed: false,
  note: 'Five-entry metadata previews for HyperDX/Etherpad preceded this plan; no tool outcome was observed. This is not a blind preregistration or a final freeze.' };
await writeFile(join(directory, 'history-collection-plan.json'), json(plan), { flag: 'wx' });
const receipts = [];
for (const repository of selection.repositories) {
  const folder = join(directory, repository.id.replace('/', '--'));
  await mkdir(folder);
  const endpoint = `repos/${repository.id}/commits?sha=${repository.commit}&path=${encodeURIComponent(repository.scope)}&per_page=20`;
  const receipt = { repository: repository.id, pinned_head: repository.commit, scope: repository.scope, endpoint, started_at: new Date().toISOString(), records: [] };
  try {
    const bytes = execFileSync(ghExecutable, ['api', endpoint], { encoding: 'buffer', shell: false, windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout: 120000 });
    await writeFile(join(folder, 'raw-commits.json'), bytes, { flag: 'wx' });
    const commits = JSON.parse(bytes);
    if (!Array.isArray(commits) || commits.length > 20) throw new Error('D3_HISTORY_RESPONSE_INVALID');
    receipt.raw_sha256 = digest(bytes);
    for (const [index, commit] of commits.entries()) {
      if (!/^[a-f0-9]{40}$/u.test(commit.sha) || !Array.isArray(commit.parents)) throw new Error('D3_HISTORY_COMMIT_INVALID');
      const parents = commit.parents.map((parent) => parent.sha);
      if (parents.some((parent) => !/^[a-f0-9]{40}$/u.test(parent))) throw new Error('D3_HISTORY_PARENT_INVALID');
      receipt.records.push({ candidate_id: `${repository.id.replace('/', '--')}-H${String(index + 1).padStart(3, '0')}`, commit: commit.sha, parents, committed_at: commit.commit?.committer?.date ?? null,
        subject: commit.commit?.message?.split('\n')[0] ?? '', human_decision: null, source_snapshots_captured: false,
        comparison_parent: parents.length === 1 ? parents[0] : null, merge_or_root_requires_review: parents.length !== 1 });
    }
    receipt.status = 'HISTORY_METADATA_CAPTURED_NOT_CASE_LABELS';
  } catch (error) {
    receipt.status = 'HISTORY_CAPTURE_FAILED';
    receipt.error = String(error.message).slice(0, 2000);
  }
  receipt.finished_at = new Date().toISOString();
  await writeFile(join(folder, 'history-receipt.json'), json(receipt), { flag: 'wx' });
  receipts.push(receipt);
  console.log(`${repository.id}: ${receipt.status}, ${receipt.records.length} candidate records`);
}
const summary = { schema_version: 1, status: 'preparation-only', plan_sha256: digest(json(plan)), receipts, predictions_executed: false, labels_present: false, research_complete: false };
await writeFile(join(directory, 'history-summary.json'), json(summary), { flag: 'wx' });
if (receipts.some((receipt) => receipt.status === 'HISTORY_CAPTURE_FAILED')) process.exitCode = 1;
