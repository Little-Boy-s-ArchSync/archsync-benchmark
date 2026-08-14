import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { basename } from "node:path";

const repositoryRoot = new URL("..", import.meta.url);
const groundTruth = JSON.parse(
  await readFile(new URL("../order-platform/ground-truth.json", import.meta.url), "utf8"),
);
const declaredPatchFiles = groundTruth.cases.map((scenario) => basename(scenario.patch)).sort();
const actualPatchFiles = (await readdir(new URL("../order-platform/changes/", import.meta.url)))
  .filter((file) => file.endsWith(".patch"))
  .sort();
if (JSON.stringify(declaredPatchFiles) !== JSON.stringify(actualPatchFiles)) {
  throw new Error(
    `Declared patch set ${JSON.stringify(declaredPatchFiles)} ` +
    `does not match files on disk ${JSON.stringify(actualPatchFiles)}`,
  );
}

function newLineRangesByFile(patchSource) {
  const ranges = new Map();
  for (const section of patchSource.split(/^diff --git /m).slice(1)) {
    const file = section.match(/^--- .+\r?\n\+\+\+ b\/(.+)$/m)?.[1];
    if (!file) continue;
    ranges.set(
      file,
      [...section.matchAll(/^@@ .+ \+(\d+)(?:,(\d+))? @@/gm)].map((match) => ({
        start: Number(match[1]),
        count: match[2] === undefined ? 1 : Number(match[2]),
      })),
    );
  }
  return ranges;
}

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

  const evidenceRanges = newLineRangesByFile(patchSource);
  for (const evidence of scenario.expected.evidence) {
    const ranges = evidenceRanges.get(evidence.file) ?? [];
    const withinTouchedHunk = ranges.some(({ start, count }) =>
      count > 0 && evidence.line >= start && evidence.line < start + count,
    );
    if (!withinTouchedHunk) {
      throw new Error(
        `${scenario.id}: evidence ${evidence.file}:${evidence.line} is outside the patch hunks`,
      );
    }
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

console.log(`VALID PATCHES (${groundTruth.cases.length}/${groundTruth.cases.length} apply cleanly)`);
