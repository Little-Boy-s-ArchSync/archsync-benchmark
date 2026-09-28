import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const receipt = JSON.parse(await readFile(new URL("holdout/d3-package-preflight/receipt.json", root), "utf8"));
const lock = JSON.parse(await readFile(new URL("development/common-module-capability/tools/package-lock.json", root), "utf8"));
const [guardianPath, comparatorPath] = process.argv.slice(2);
if (!guardianPath || !comparatorPath || process.argv.length !== 4) {
  throw new Error("Usage: node scripts/verify-d3-package-preflight.mjs <Guardian .tgz> <dependency-cruiser .tgz>");
}

async function checkArchive(path, expected) {
  const bytes = await readFile(path);
  assert.equal((await stat(path)).size, expected.archive_bytes, `${expected.archive_filename}: byte count`);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), expected.archive_sha256, `${expected.archive_filename}: SHA-256`);
  return bytes;
}

function archiveText(path, entry) {
  const result = spawnSync("tar", ["-xOf", path, entry], { encoding: "utf8", maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0, `${entry}: tar read failed: ${result.stderr}`);
  return result.stdout;
}

await checkArchive(guardianPath, receipt.guardian);
const comparatorBytes = await checkArchive(comparatorPath, receipt.comparator);
const provenance = JSON.parse(archiveText(guardianPath, "package/dist/provenance.json"));
const guardianPackage = JSON.parse(archiveText(guardianPath, "package/package.json"));
assert.equal(provenance.package_name, receipt.guardian.package_name);
assert.equal(provenance.package_version, receipt.guardian.package_version);
assert.equal(provenance.source_commit, receipt.guardian.source_commit);
assert.equal(provenance.package_content_sha256, receipt.guardian.package_content_sha256);
assert.equal(guardianPackage.name, receipt.guardian.package_name);
assert.equal(guardianPackage.version, receipt.guardian.package_version);
assert.ok(archiveText(guardianPath, "package/dist/module-dependencies.js").length > 0);

const comparatorPackage = JSON.parse(archiveText(comparatorPath, "package/package.json"));
assert.equal(comparatorPackage.name, receipt.comparator.registry_package);
assert.equal(comparatorPackage.version, receipt.comparator.package_version);
assert.equal(comparatorPackage.license, receipt.comparator.license);
assert.ok(archiveText(comparatorPath, "package/LICENSE").length > 0);
const comparatorIntegrity = `sha512-${createHash("sha512").update(comparatorBytes).digest("base64")}`;
assert.equal(comparatorIntegrity, receipt.comparator.archive_sha512_integrity);
assert.equal(comparatorIntegrity, lock.packages["node_modules/dependency-cruiser"].integrity);

console.log("PASS: candidate D3 archive bytes, identities, provenance and lockfile integrity verified");
console.log("NOT A D3 METHOD FREEZE OR RESEARCH RESULT");
