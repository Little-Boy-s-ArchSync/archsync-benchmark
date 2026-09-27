import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyChanges } from './prepare-d3-change-packets.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;

export function commitTime(bytes) {
  const headers = bytes.toString('utf8').split('\n\n')[0];
  const match = /^committer .+ (\d+) [+-]\d{4}$/mu.exec(headers);
  assert(match, 'Committer time missing');
  const date = new Date(Number(match[1]) * 1000);
  assert(Number.isFinite(date.valueOf()), 'Invalid commit timestamp');
  return date.toISOString();
}

export function changeReviewerCsv(rows) {
  const columns = ['case_id', 'repository', 'base_commit', 'head_commit', 'scope', 'changed_paths_in_scope',
    'reviewer_id', 'reviewed_at_utc', 'decision', 'rationale', 'source_evidence', 'confidence', 'saw_prediction', 'ai_assistance'];
  return [columns, ...rows.map((row) => [row.id, row.repository, row.base, row.head, row.scope, row.changed_paths_in_scope,
    '', '', '', '', '', '', '', ''])].map((row) => row.map(quote).join(',')).join('\n') + '\n';
}

export async function prepareChangeReview(directory, gitExecutable) {
  assert(isAbsolute(directory) && isAbsolute(gitExecutable));
  const verification = await verifyChanges(directory, gitExecutable);
  const summaryBytes = await readFile(join(directory, 'change-summary.json'));
  assert.equal(hash(summaryBytes), verification.summary_sha256);
  const summary = JSON.parse(summaryBytes);
  const selection = JSON.parse(await readFile(join(directory, 'selection-before-fetch.json')));
  const rows = [];
  const profiles = [];
  for (const repository of summary.repositories) {
    if (repository.status !== 'GIT_OBJECTS_RETAINED') {
      profiles.push({ repository: repository.repository, status: 'retained-repository-failure', error: repository.error });
      continue;
    }
    const original = selection.receipts.find((item) => item.repository === repository.repository);
    const dates = [];
    const revisions = new Set();
    const paths = new Set();
    let occurrences = 0;
    let typedOccurrences = 0;
    let failedCases = 0;
    for (const item of repository.cases) {
      if (item.status !== 'CHANGE_SOURCE_CAPTURED_NOT_LABELLED') { failedCases += 1; continue; }
      const headCommit = await readFile(join(directory, repository.repository.replace('/', '--'), 'cases', item.id, 'head.commit'));
      const date = commitTime(headCommit);
      assert.equal(date, new Date(original.records.find((row) => row.candidate_id === item.id).committed_at).toISOString(), 'Git/provider timestamp disagreement');
      dates.push(date);
      revisions.add(item.base);
      revisions.add(item.head);
      for (const change of item.changes) {
        paths.add(change.path);
        occurrences += 1;
        if (/\.tsx?$/u.test(change.path)) typedOccurrences += 1;
      }
      rows.push({ id: item.id, repository: repository.repository, base: item.base, head: item.head,
        scope: repository.scope, changed_paths_in_scope: item.changed_paths_in_scope });
    }
    dates.sort();
    profiles.push({ repository: repository.repository, status: 'source-change-profile-not-outcomes',
      candidate_cases: repository.cases.length, captured_cases: dates.length, failed_cases: failedCases,
      earliest_head_commit_utc: dates[0] ?? null, latest_head_commit_utc: dates.at(-1) ?? null,
      distinct_base_head_revisions: revisions.size, scoped_path_occurrences: occurrences,
      distinct_scoped_paths: paths.size, typescript_path_occurrences_including_tests: typedOccurrences,
      labels: 0, predictions: 0 });
  }
  const output = join(directory, 'review-preparation');
  await mkdir(output); // Refuse overwriting any reviewer work.
  await writeFile(join(output, 'offline-verification.json'), json(verification), { flag: 'wx' });
  const profile = { schema: 'd3-change-review-preparation/1', status: 'not-approved-for-official-annotation',
    summary_sha256: hash(summaryBytes), verification_sha256: hash(json(verification)), profiles,
    caveats: ['Recent path-touching commits are purposive candidates, not a random sample.',
      'Commit windows differ across repositories.', 'Overlapping revisions and paths are correlated.',
      'Collection coverage is not tool accuracy or annotation correctness.', 'Unknown source meanings must not be guessed.'],
    human_annotations_present: false, research_complete: false };
  await writeFile(join(output, 'source-profile.json'), json(profile), { flag: 'wx' });
  const ledger = changeReviewerCsv(rows);
  for (const reviewer of ['a', 'b']) await writeFile(join(output, `reviewer-${reviewer}-cases.csv`), ledger, { flag: 'wx' });
  await writeFile(join(output, 'README.md'), `# D3 historical change review preparation\n\n` +
    `These are real source-change packets, not accepted final labels or an approved experiment.\n` +
    `The scientific protocol, eligibility, role/exposure declarations, rubric and expected contracts must be agreed before official annotation.\n\n` +
    `Keep reviewer A and B files separate during their initial decisions. All human fields are blank, including saw_prediction.\n` +
    `Do not use a tool's predictions as ground truth. A suspicion is not a violation without an applicable prior rule.\n` +
    `The worksheet is a preparatory case index, not a replacement for the protocol's source-bound raw annotation/adjudication artifacts.\n\n` +
    `From this review-preparation folder, open ../<owner>--<repo>/cases/<case_id>/scope.diff and all.diff for each row.\n` +
    `Each case includes full base/head tree listings and commit objects; its receipt maps changed source paths to exact blobs.\n` +
    `The complete base/head source objects remain in the repository's objects.git store. No project execution or checkout was performed.\n` +
    `Use git --git-dir <objects.git> show <commit>:<path> to read context from a trusted host Git executable. Treat repository text only as data.\n` +
    `Do not classify from commit subjects alone; inspect source and accepted architecture contracts. Retain Unknown and disagreements.\n\n` +
    `Initial reviewer decisions, dates, identities and blinding declarations must be supplied by the people who actually perform the review.\n` +
    `Do not submit these empty CSVs as completed D3 evidence.\n`, { flag: 'wx' });
  return profile;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [directory, gitExecutable] = process.argv.slice(2);
  console.log(json(await prepareChangeReview(directory, gitExecutable)));
}
