import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files.sort();
}

async function hashTree(directory, predicate = () => true) {
  const hash = createHash("sha256");
  const files = (await listFiles(directory)).filter(predicate);
  for (const file of files) {
    const normalized = relative(directory, file).replaceAll("\\", "/");
    const content = await readFile(file);
    hash.update(normalized);
    hash.update("\0");
    hash.update(sha256(content));
    hash.update("\n");
  }
  return { sha256: hash.digest("hex"), files: files.length };
}

export async function calculateBenchmarkIntegrity(orderPlatformDirectory) {
  const architecture = await readFile(join(orderPlatformDirectory, "architecture.yaml"));
  const baseline = await hashTree(join(orderPlatformDirectory, "repository"));
  const patches = await hashTree(
    join(orderPlatformDirectory, "changes"),
    (file) => file.endsWith(".patch"),
  );

  return {
    algorithm: "sha256",
    architecture_sha256: sha256(architecture),
    baseline_tree_sha256: baseline.sha256,
    baseline_files: baseline.files,
    patch_set_sha256: patches.sha256,
    patch_files: patches.files,
  };
}
