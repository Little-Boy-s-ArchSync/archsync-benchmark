import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { parse } from "yaml";

const repositoryRoot = new URL("..", import.meta.url);
const groundTruth = parse(
  await readFile(new URL("../order-platform/ground-truth.json", import.meta.url), "utf8"),
);

for (const scenario of groundTruth.cases) {
  const patchPath = `order-platform/${scenario.patch}`;
  const patchSource = await readFile(new URL(`../${patchPath}`, import.meta.url), "utf8");
  const patchFiles = [...patchSource.matchAll(/^\+\+\+ b\/(.+)$/gm)]
    .map((match) => match[1])
    .sort();
  const declaredFiles = [...scenario.changed_files].sort();
  if (JSON.stringify(patchFiles) !== JSON.stringify(declaredFiles)) {
    throw new Error(
      `${scenario.id}: changed_files ${JSON.stringify(declaredFiles)} ` +
      `do not match patch files ${JSON.stringify(patchFiles)}`,
    );
  }

  const result = spawnSync(
    "git",
    ["apply", "--check", "--directory=order-platform/repository", patchPath],
    { cwd: repositoryRoot, encoding: "utf8", shell: false },
  );
  if (result.status !== 0) {
    throw new Error(`${scenario.id}: patch does not apply cleanly\n${result.stderr}`);
  }
}

console.log(`VALID PATCHES (${groundTruth.cases.length}/10 apply cleanly)`);
