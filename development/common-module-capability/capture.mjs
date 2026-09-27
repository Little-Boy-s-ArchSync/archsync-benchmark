import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { hash, encode, normalize, inputNames } from './verify.mjs';
const base = resolve(import.meta.dirname);
const output = process.argv[2];
assert(process.argv.length === 3 && isAbsolute(output), 'One NEW absolute receipt directory required; no source-path option');
assert.equal(process.version, 'v22.16.0');
const versions = {};
for (const name of ['dependency-cruiser', 'typescript']) versions[name] = JSON.parse(await readFile(resolve(base, 'tools/node_modules', name, 'package.json'))).version;
assert.deepEqual(versions, { 'dependency-cruiser': '18.3.0', typescript: '5.9.3' });
const inputs = await Promise.all(inputNames.map(async (path) => ({ path, sha256: hash(await readFile(resolve(base, path))) })));
const pin = JSON.parse(await readFile(resolve(base, 'guardian-pin.json')));
for (const item of Object.values(pin.files)) assert.equal(hash(await readFile(resolve(base, item.retained_path))), item.sha256);
const fixtures = JSON.parse(await readFile(resolve(base, 'fixtures.json')));
assert.equal(fixtures.purpose, 'developer-authored-software-fixtures-not-research-ground-truth');
await mkdir(output); // Refuse overwrite; capture always has a separate destination.
const started = new Date().toISOString();
const scratch = await realpath(await mkdtemp(resolve(tmpdir(), 'archsync-non-d3-common-')));
const records = [];
for (const spec of fixtures.cases) {
  assert(/^[a-z-]+$/.test(spec.id));
  const root = resolve(scratch, spec.id);
  await mkdir(root);
  for (const [path, contents] of Object.entries(spec.files)) {
    assert(!isAbsolute(path) && path.split('/').every((part) => part !== '..' && part !== '.'));
    await mkdir(dirname(resolve(root, path)), { recursive: true });
    await writeFile(resolve(root, path), contents, { flag: 'wx' });
  }
  for (const [path, target] of Object.entries(spec.symlinks ?? {})) {
    assert(!target.includes('/') && !target.includes('\\') && target !== '..');
    await symlink(target, resolve(root, path));
  }
  await writeFile(resolve(root, 'mapping.json'), encode(spec.mapping));
  await writeFile(resolve(root, 'dependency-cruiser.json'), await readFile(resolve(base, 'dependency-cruiser.json')));
  const destination = resolve(output, spec.id); await mkdir(destination);
  const commands = [
    ['guardian', [resolve(base, 'tools/guardian-run.mjs'), root, resolve(root, 'mapping.json')]],
    ['comparator', [resolve(base, 'tools/node_modules/dependency-cruiser/bin/dependency-cruiser.mjs'), '--config', 'dependency-cruiser.json', '--output-type', 'json', 'src']],
  ];
  const invocations = [], outputs = {};
  for (const [tool, args] of commands) {
    const before = new Date().toISOString();
    const run = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', shell: false, timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
    const stdout = run.stdout ?? '', stderr = (run.stderr ?? '') + (run.error ? `\n${run.error.message}\n` : '');
    await writeFile(resolve(destination, `${tool}.stdout.txt`), stdout, { flag: 'wx' });
    await writeFile(resolve(destination, `${tool}.stderr.txt`), stderr, { flag: 'wx' });
    invocations.push({ tool, executable: process.execPath, args, cwd: root, started_at: before, finished_at: new Date().toISOString(), exit_code: run.status, signal: run.signal, stdout_sha256: hash(stdout), stderr_sha256: hash(stderr) });
    assert.equal(run.status, 0, `${tool}/${spec.id} failed; raw failure retained in ${destination}`);
    outputs[tool] = JSON.parse(stdout);
  }
  for (const [path, contents] of Object.entries(spec.files)) assert.equal(await readFile(resolve(root, path), 'utf8'), contents, 'Fixture bytes changed during execution');
  records.push({ id: spec.id, invocations, normalized: normalize(spec, outputs.guardian, outputs.comparator) });
  console.log(`${spec.id}: ${JSON.stringify(records.at(-1).normalized)}`);
}
for (const input of inputs) assert.equal(hash(await readFile(resolve(base, input.path))), input.sha256, 'Inputs changed during capture');
await writeFile(resolve(output, 'manifest.json'), encode({ schema: 'non-d3-common-capability-receipt/1', status: 'development-only-proposed-research-tooling', started_at: started, finished_at: new Date().toISOString(), node: process.version, platform: process.platform, arch: process.arch, guardian_commit: pin.commit, versions, inputs, cases: records, d3_executed: false, research_complete: false }), { flag: 'wx' });
console.log(`Retained temporary developer fixture source: ${scratch}`);
