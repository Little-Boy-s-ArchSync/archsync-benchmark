import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = new URL("../", import.meta.url);

export async function validateVendorArtifacts(root = defaultRoot) {
  const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("vendor/manifest.json", root), "utf8"));

  assert.equal(manifest.schema_version, 1);
  assert.deepEqual(Object.keys(manifest.artifacts), ["core", "guardian"]);

  for (const [name, artifact] of Object.entries(manifest.artifacts)) {
    assert.match(artifact.package, /^@archsync\/[a-z-]+$/, `${name}: invalid package name`);
    assert.match(artifact.source_commit, /^[0-9a-f]{40}$/, `${name}: invalid source commit`);
    assert.match(
      artifact.source_repository,
      /^https:\/\/github\.com\/Little-Boy-s-ArchSync\/archsync-[a-z-]+\.git$/,
      `${name}: invalid source repository`,
    );
    assert.match(artifact.file, /^vendor\/[a-z0-9.-]+\.tgz$/, `${name}: invalid artifact path`);
    assert.match(artifact.sha256, /^[0-9a-f]{64}$/, `${name}: invalid SHA-256`);
    assert.equal(
      packageJson.dependencies[artifact.package],
      `file:${artifact.file}`,
      `${name}: package dependency does not select the declared artifact`,
    );

    const bytes = await readFile(new URL(artifact.file, root));
    const actualSha256 = createHash("sha256").update(bytes).digest("hex");
    assert.equal(actualSha256, artifact.sha256, `${name}: artifact SHA-256 mismatch`);

    if (Object.hasOwn(artifact, "package_content_sha256")) {
      assert.match(
        artifact.package_content_sha256,
        /^[0-9a-f]{64}$/,
        `${name}: invalid embedded package-content SHA-256`,
      );
      const provenance = JSON.parse(await readFile(
        new URL(`node_modules/${artifact.package}/dist/provenance.json`, root),
        "utf8",
      ));
      assert.equal(provenance.package_name, artifact.package, `${name}: embedded package name mismatch`);
      assert.equal(provenance.source_commit, artifact.source_commit, `${name}: embedded source commit mismatch`);
      assert.equal(
        provenance.package_content_sha256,
        artifact.package_content_sha256,
        `${name}: embedded package-content SHA-256 mismatch`,
      );
    }
  }

  return manifest;
}

const invokedDirectly = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const manifest = await validateVendorArtifacts();
  console.log(
    `VALID VENDORED PACKAGES (${Object.keys(manifest.artifacts).length}/2 artifacts, source pins and SHA-256)`,
  );
}
