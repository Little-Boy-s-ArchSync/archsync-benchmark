import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encode, hash, inputNames, verifyReceipt } from '../common-module-capability/verify.mjs';

const sourceRoot = resolve(import.meta.dirname, '../common-module-capability');
const here = resolve(import.meta.dirname);
const defaultReceipt = join(here, 'receipt');
const profileVersion = 'non-d3-common-capability-modes-v3';

function fixtureOverlay(original) {
  assert.equal(original.purpose, 'developer-authored-software-fixtures-not-research-ground-truth');
  assert.equal(original.cases.length, 7);
  const value = original.cases.find((item) => item.id === 'value-syntax');
  const cjs = original.cases.find((item) => item.id === 'alias');
  const nodeNext = original.cases.find((item) => item.id === 'self-package-export');
  assert(value && cjs && nodeNext);
  const valueConfig = JSON.parse(value.files['tsconfig.json']);
  assert.equal(valueConfig.compilerOptions.verbatimModuleSyntax, false);
  valueConfig.compilerOptions.verbatimModuleSyntax = true;
  value.files['tsconfig.json'] = encode(valueConfig);
  value.files['src/app/main.ts'] = value.files['src/app/main.ts'].replace(
    "import type { Shape } from '../lib/types';",
    "import { type Shape } from '../lib/types';\nimport type { Shape as OtherShape } from '../lib/types';");
  value.description = 'Bundler plus verbatimModuleSyntax true: value and erased/bare type-binding forms remain separate evidence.';
  value.expected_pairs.push(['src/app/main.ts', 'src/lib/types.ts']);
  value.expected_pairs.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  value.expected_guardian_syntax.push('import');
  // First diagnostic capture rejected the false divergence hypothesis; see README.
  value.expected_shared = true;

  cjs.files['tsconfig.json'] = encode({ compilerOptions: {
    target: 'ES2022', module: 'CommonJS', moduleResolution: 'Node10',
    baseUrl: '.', paths: { '@lib/*': ['src/lib/*'] }, verbatimModuleSyntax: false,
  }, include: ['src/**/*.ts'] });
  cjs.files['src/app/main.ts'] = "const { value } = require('@lib/value');\nexport const used = value;\n";
  cjs.description = 'CommonJS mode with a literal require and a TypeScript path alias.';
  cjs.expected_shared = true;

  const nodeConfig = JSON.parse(nodeNext.files['tsconfig.json']);
  nodeConfig.compilerOptions.module = 'NodeNext';
  nodeConfig.compilerOptions.moduleResolution = 'NodeNext';
  nodeNext.files['tsconfig.json'] = encode(nodeConfig);
  nodeNext.description = 'NodeNext mode with an internal package self-export.';
  nodeNext.expected_shared = true;
  return original;
}

async function materialize() {
  const scratch = await mkdtemp(join(tmpdir(), 'archsync-common-modes-v3-'));
  const fixtures = fixtureOverlay(JSON.parse(await readFile(join(sourceRoot, 'fixtures.json'), 'utf8')));
  const historicalConfig = JSON.parse(await readFile(join(sourceRoot, 'dependency-cruiser.json'), 'utf8'));
  const revisedConfig = JSON.parse(await readFile(join(here, 'dependency-cruiser.json'), 'utf8'));
  assert.deepEqual(revisedConfig, { ...historicalConfig, options: {
    ...historicalConfig.options, enhancedResolveOptions: { exportsFields: ['exports'] },
  } }, 'v3 must use only the declared v2 export-field change');
  for (const name of inputNames) {
    const target = join(scratch, name);
    await mkdir(dirname(target), { recursive: true });
    if (name === 'fixtures.json') await writeFile(target, encode(fixtures), { flag: 'wx' });
    else if (name === 'dependency-cruiser.json') await copyFile(join(here, name), target);
    else await copyFile(join(sourceRoot, name), target);
  }
  return scratch;
}

async function cleanup(scratch) {
  assert.equal(resolve(dirname(scratch)), resolve(tmpdir()));
  assert(basename(scratch).startsWith('archsync-common-modes-v3-'));
  await rm(scratch, { recursive: true, force: false });
}

async function verifyHypothesisReceipt(profile, acceptedManifest) {
  const base = join(here, 'receipt-hypothesis');
  const bytes = await readFile(join(base, 'manifest.json'));
  assert.equal(hash(bytes), profile.hypothesis_manifest_sha256);
  const initial = JSON.parse(bytes);
  assert.equal(initial.d3_executed, false);
  assert.equal(initial.research_complete, false);
  assert.equal(initial.cases.length, 7);
  for (const [index, candidate] of initial.cases.entries()) {
    assert.equal(candidate.id, acceptedManifest.cases[index].id);
    assert.deepEqual(candidate.normalized, acceptedManifest.cases[index].normalized,
      'Raw fixture interpretation changed across the two diagnostic runs');
    for (const invocation of candidate.invocations) {
      for (const channel of ['stdout', 'stderr']) {
        const output = await readFile(join(base, candidate.id, `${invocation.tool}.${channel}.txt`));
        assert.equal(hash(output), invocation[`${channel}_sha256`], 'Initial raw output changed');
      }
    }
  }
  assert.equal(initial.cases[0].normalized.shared_fixture_pass, true);
}

export async function verifyV3(receiptDirectory = defaultReceipt) {
  const scratch = await materialize();
  try {
    if (resolve(receiptDirectory) === resolve(defaultReceipt)) {
      const profile = JSON.parse(await readFile(join(here, 'profile.json'), 'utf8'));
      assert.equal(profile.schema, 'non-d3-common-capability-profile/3');
      assert.equal(profile.profile, profileVersion);
      assert.equal(profile.status, 'candidate-development-fixture-not-d3-method-freeze');
      assert.equal(profile.d3_executed, false);
      assert.equal(profile.research_complete, false);
      assert.equal(profile.configuration_sha256, hash(await readFile(join(here, 'dependency-cruiser.json'))));
      const manifestBytes = await readFile(join(receiptDirectory, 'manifest.json'));
      assert.equal(profile.receipt_manifest_sha256, hash(manifestBytes));
      const manifest = JSON.parse(manifestBytes);
      assert.equal(profile.overlay_fixtures_sha256,
        manifest.inputs.find((row) => row.path === 'fixtures.json')?.sha256);
      await verifyHypothesisReceipt(profile, manifest);
    }
    return await verifyReceipt(scratch, receiptDirectory);
  } finally { await cleanup(scratch); }
}

async function captureV3(output) {
  assert.equal(process.version, 'v22.16.0');
  assert(isAbsolute(output), 'One new absolute receipt directory is required');
  const scratch = await materialize();
  try {
    for (const [name, version] of [['dependency-cruiser', '18.3.0'], ['typescript', '5.9.3']]) {
      const installed = JSON.parse(await readFile(join(sourceRoot, 'tools/node_modules', name, 'package.json'), 'utf8'));
      assert.equal(installed.version, version, `Install the pinned development tools first: ${name}`);
    }
    await cp(join(sourceRoot, 'tools/node_modules'), join(scratch, 'tools/node_modules'), {
      recursive: true, force: false, errorOnExist: true,
    });
    const run = spawnSync(process.execPath, [join(scratch, 'capture.mjs'), output], {
      cwd: scratch, encoding: 'utf8', shell: false, timeout: 120000, maxBuffer: 32 * 1024 * 1024,
    });
    if (run.stdout) process.stdout.write(run.stdout);
    if (run.stderr) process.stderr.write(run.stderr);
    assert.equal(run.status, 0, `v3 capture failed: ${run.error?.message ?? run.signal ?? run.status}`);
    return await verifyReceipt(scratch, output);
  } finally { await cleanup(scratch); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const command = process.argv[2] ?? 'verify';
  if (command === 'verify') {
    assert.equal(process.argv.length, 3);
    console.log(JSON.stringify(await verifyV3()));
  } else if (command === 'capture') {
    assert.equal(process.argv.length, 4);
    console.log(JSON.stringify(await captureV3(process.argv[3])));
  } else throw new Error('Usage: node runner.mjs verify | capture <new absolute receipt directory>');
}
