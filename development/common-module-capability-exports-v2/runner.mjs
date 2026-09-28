import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { encode, hash, inputNames, verifyReceipt } from "../common-module-capability/verify.mjs";

const sourceRoot = resolve(import.meta.dirname, "../common-module-capability");
const here = resolve(import.meta.dirname);
const defaultReceipt = join(here, "receipt");
const profileVersion = "non-d3-common-capability-exports-v2";

async function materialize() {
  const scratch = await mkdtemp(join(tmpdir(), "archsync-common-exports-v2-"));
  const originalFixtures = JSON.parse(await readFile(join(sourceRoot, "fixtures.json"), "utf8"));
  assert.equal(originalFixtures.purpose, "developer-authored-software-fixtures-not-research-ground-truth");
  const selfExport = originalFixtures.cases.find((item) => item.id === "self-package-export");
  assert.equal(selfExport?.expected_shared, false, "v1 historical expectation changed");
  selfExport.expected_shared = true;
  const originalConfig = JSON.parse(await readFile(join(sourceRoot, "dependency-cruiser.json"), "utf8"));
  const nextConfig = JSON.parse(await readFile(join(here, "dependency-cruiser.json"), "utf8"));
  assert.deepEqual(nextConfig, {
    ...originalConfig,
    options: {
      ...originalConfig.options,
      enhancedResolveOptions: { exportsFields: ["exports"] }
    }
  }, "v2 must only enable package exports resolution");
  for (const name of inputNames) {
    const target = join(scratch, name);
    await mkdir(dirname(target), { recursive: true });
    if (name === "fixtures.json") await writeFile(target, encode(originalFixtures), { flag: "wx" });
    else if (name === "dependency-cruiser.json") await copyFile(join(here, name), target);
    else await copyFile(join(sourceRoot, name), target);
  }
  return scratch;
}

async function cleanup(scratch) {
  assert.equal(resolve(dirname(scratch)), resolve(tmpdir()));
  assert(basename(scratch).startsWith("archsync-common-exports-v2-"));
  await rm(scratch, { recursive: true, force: false });
}

function expectedSummary(actual) {
  assert.deepEqual(actual, {
    cases: 7,
    common_fixture_passes: 3,
    failed_common_candidates: 0,
    unsupported_probes: 4,
    d3_executed: false
  });
  return { profile: profileVersion, ...actual };
}

export async function verifyV2(receiptDirectory = defaultReceipt) {
  const scratch = await materialize();
  try {
    if (resolve(receiptDirectory) === resolve(defaultReceipt)) {
      const profile = JSON.parse(await readFile(join(here, "profile.json"), "utf8"));
      assert.equal(profile.schema, "non-d3-common-capability-profile/2");
      assert.equal(profile.status, "candidate-development-fixture-not-d3-method-freeze");
      assert.equal(profile.profile, profileVersion);
      assert.equal(profile.d3_executed, false);
      assert.equal(profile.research_complete, false);
      assert.equal(profile.historical_v1_receipt_sha256,
        hash(await readFile(join(sourceRoot, "receipt/manifest.json"))));
      assert.equal(profile.configuration_sha256, hash(await readFile(join(here, "dependency-cruiser.json"))));
      const manifestBytes = await readFile(join(receiptDirectory, "manifest.json"));
      assert.equal(profile.receipt_manifest_sha256, hash(manifestBytes));
      const manifest = JSON.parse(manifestBytes);
      assert.equal(profile.overlay_fixtures_sha256,
        manifest.inputs.find((row) => row.path === "fixtures.json")?.sha256);
    }
    return expectedSummary(await verifyReceipt(scratch, receiptDirectory));
  } finally {
    await cleanup(scratch);
  }
}

async function captureV2(output) {
  assert.equal(process.version, "v22.16.0");
  assert(isAbsolute(output), "One NEW absolute receipt directory is required");
  const scratch = await materialize();
  try {
    for (const [name, version] of [["dependency-cruiser", "18.3.0"], ["typescript", "5.9.3"]]) {
      const installed = JSON.parse(await readFile(join(sourceRoot, "tools/node_modules", name, "package.json"), "utf8"));
      assert.equal(installed.version, version, `install v1 development tools before v2 capture: ${name}`);
    }
    await cp(join(sourceRoot, "tools/node_modules"), join(scratch, "tools/node_modules"), { recursive: true, force: false, errorOnExist: true });
    const run = spawnSync(process.execPath, [join(scratch, "capture.mjs"), output], {
      cwd: scratch, encoding: "utf8", shell: false, timeout: 120000, maxBuffer: 32 * 1024 * 1024
    });
    if (run.stdout) process.stdout.write(run.stdout);
    if (run.stderr) process.stderr.write(run.stderr);
    assert.equal(run.status, 0, `v2 capture failed: ${run.error?.message ?? run.signal ?? run.status}`);
    return expectedSummary(await verifyReceipt(scratch, output));
  } finally {
    await cleanup(scratch);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const command = process.argv[2] ?? "verify";
  if (command === "verify") {
    assert.equal(process.argv.length, 3);
    console.log(JSON.stringify(await verifyV2()));
  } else if (command === "capture") {
    assert.equal(process.argv.length, 4);
    console.log(JSON.stringify(await captureV2(process.argv[3])));
  } else throw new Error("Usage: node runner.mjs verify | capture <new absolute receipt directory>");
}
