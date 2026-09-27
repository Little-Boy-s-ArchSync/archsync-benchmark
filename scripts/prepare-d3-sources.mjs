import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGitRepositoryAdapters } from './lib/holdout-repository.mjs';
import { createRepositoryCaptureManifest } from './lib/holdout-repeat-capture.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const args = process.argv.slice(2);
if (args.length !== 3 || args.some((arg) => !isAbsolute(arg))) {
  throw new Error('Usage: node scripts/prepare-d3-sources.mjs ABS_NEW_OUTPUT_DIR ABS_GIT_EXE ABS_NPM_CLI_JS');
}
const [outputPath, gitExecutable, npmCli] = args;
// Exclusive creation: never overwrite an earlier capture or receipt.
await mkdir(outputPath);
const output = await realpath(outputPath);
const planBytes = await readFile(join(root, 'holdout/selection-preparation-20260927.json'));
const plan = JSON.parse(planBytes);
const inventoryBytes = await readFile(join(root, plan.inventory));
const inventory = JSON.parse(inventoryBytes);
if (plan.status !== 'source-preparation-only' || plan.predictions_permitted !== false || plan.repositories.length !== 3) {
  throw new Error('D3_PREPARATION_PLAN_INVALID');
}
for (const repo of plan.repositories) {
  const source = inventory.candidates.find((candidate) => candidate.rank === repo.rank);
  if (!source || source.id !== repo.id || source.canonical_url !== repo.url ||
      source.observed_default_branch_commit_sha !== repo.commit || source.license.path !== repo.license_file ||
      source.license.spdx_id !== repo.license_spdx) throw new Error('D3_PREPARATION_INVENTORY_MISMATCH');
}
const selection = {
  ...plan, recorded_at: new Date().toISOString(),
  plan_sha256: sha256(planBytes), inventory_sha256: sha256(inventoryBytes),
};
await writeFile(join(output, 'selection-before-capture.json'), json(selection), { flag: 'wx' });
const results = [];
for (const repo of plan.repositories) {
  const id = repo.id.replace('/', '--');
  const workspace = join(output, id);
  await mkdir(workspace);
  const record = { id: repo.id, commit: repo.commit, scope: repo.scope, started_at: new Date().toISOString() };
  console.log(`CAPTURING ${repo.id} ${repo.commit}`);
  try {
    const adapters = createGitRepositoryAdapters({
      workspaceRoot: await realpath(workspace), gitExecutable,
      packageManager: { name: 'npm', executable: process.execPath, arguments: [npmCli] },
    });
    const source = await adapters.clone(repo);
    const observation = await adapters.inspect(source, repo);
    const manifest = createRepositoryCaptureManifest({ id: repo.id, license_spdx: repo.license_spdx, ...observation });
    const files = [];
    for (const entry of observation.tracked_files) {
      if (!entry.path.startsWith(`${repo.scope}/`) || !/\.tsx?$/u.test(entry.path)) continue;
      const content = await readFile(join(source, entry.path));
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(content); }
      catch { throw new Error('D3_SOURCE_TEXT_INVALID'); }
      const excluded = /\.d\.ts$/u.test(entry.path) ? 'declaration' :
        /(?:^|\/)(?:test|tests|__tests__|fixtures|__fixtures__|__mocks__)(?:\/|$)|\.(?:test|spec)\.tsx?$/u.test(entry.path) ? 'test-or-fixture' : null;
      const lines = text.length === 0 ? 0 : text.split(/\r\n|[\n\r\u2028\u2029]/u).length - (/[\n\r\u2028\u2029]$/u.test(text) ? 1 : 0);
      files.push({ path: entry.path, sha256: entry.sha256, physical_lines: lines, proposed_exclusion: excluded });
    }
    await writeFile(join(workspace, 'capture-manifest.json'), json(manifest), { flag: 'wx' });
    const population = {
      schema_version: 1, status: 'proposed-source-inventory-not-labels', repository: repo.id,
      commit: repo.commit, scope: repo.scope, capture_manifest_sha256: manifest.manifest_sha256,
      files, predictions_executed: false, human_annotations_present: false,
    };
    await writeFile(join(workspace, 'annotation-source-inventory.json'), json(population), { flag: 'wx' });
    await writeFile(join(workspace, 'local-source-location.json'), json({ source }), { flag: 'wx' });
    Object.assign(record, {
      status: 'SOURCE_CAPTURED_NOT_D3_COMPLETE', capture_manifest_sha256: manifest.manifest_sha256,
      tree_sha256: observation.tree_sha256, tracked_files: observation.tracked_files.length,
      scoped_typescript_files: files.length, proposed_review_files: files.filter((file) => file.proposed_exclusion === null).length,
      population_sha256: sha256(json(population)),
    });
  } catch (error) {
    Object.assign(record, {
      status: 'CAPTURE_FAILED', error: String(error.message).slice(0, 4000),
      code: error.code ?? null, stderr: error.stderr ? String(error.stderr).slice(0, 8000) : null,
    });
  }
  record.finished_at = new Date().toISOString();
  await writeFile(join(workspace, 'capture-receipt.json'), json(record), { flag: 'wx' });
  results.push(record);
  console.log(`${record.status} ${repo.id}`);
}
const summary = {
  schema_version: 1, status: 'source-preparation-only', selection_sha256: sha256(json(selection)),
  results, predictions_executed: false, independent_labels_present: false, research_complete: false,
  finished_at: new Date().toISOString(),
};
await writeFile(join(output, 'collection-summary.json'), json(summary), { flag: 'wx' });
console.log(json(summary));
if (results.some((record) => record.status === 'CAPTURE_FAILED')) process.exitCode = 1;
