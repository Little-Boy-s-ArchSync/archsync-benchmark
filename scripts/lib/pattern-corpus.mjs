import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const allowedDetectors = new Set([
  "typescript-fetch",
  "typescript-pg",
  "typescript-redis",
  "typescript-amqp-publish",
  "typescript-amqp-consume",
]);

function safeRelativePath(value) {
  return typeof value === "string" &&
    value.length > 0 &&
    !value.includes("\\") &&
    !value.startsWith("/") &&
    !value.split("/").includes("..");
}

export async function validatePatternCorpus(manifestPath) {
  const absoluteManifest = resolve(manifestPath);
  const baseDirectory = dirname(absoluteManifest);
  const manifest = JSON.parse(await readFile(absoluteManifest, "utf8"));
  const issues = [];
  const ids = new Set();
  const locations = new Set();
  const detectors = new Set();
  const counts = { positive: 0, negative: 0 };

  if (manifest?.version !== "0.1" || !manifest?.benchmark || !Array.isArray(manifest.groups)) {
    throw new Error("Pattern corpus must contain version 0.1, benchmark metadata and groups");
  }
  if (manifest.groups.length !== allowedDetectors.size) {
    issues.push(`Expected ${allowedDetectors.size} detector groups, found ${manifest.groups.length}`);
  }

  for (const group of manifest.groups) {
    if (!allowedDetectors.has(group.detector)) {
      issues.push(`Unknown detector '${String(group.detector)}'`);
      continue;
    }
    if (detectors.has(group.detector)) issues.push(`Duplicate detector group '${group.detector}'`);
    detectors.add(group.detector);
    const fixturePathIsSafe = safeRelativePath(group.file);
    if (!fixturePathIsSafe) issues.push(`${group.detector}: unsafe fixture path`);
    if (typeof group.edge !== "string" || group.edge.split("|").length !== 3) {
      issues.push(`${group.detector}: canonical edge key is required`);
    }
    let sourceLines = [];
    if (fixturePathIsSafe) {
      const sourcePath = resolve(baseDirectory, manifest.benchmark.repository, group.file);
      try {
        sourceLines = (await readFile(sourcePath, "utf8")).split(/\r?\n/);
      } catch {
        issues.push(`${group.detector}: missing fixture '${group.file}'`);
      }
    }

    for (const category of ["positive", "negative"]) {
      const signals = group[category];
      if (!Array.isArray(signals) || signals.length === 0) {
        issues.push(`${group.detector}: ${category} signals are required`);
        continue;
      }
      for (const signal of signals) {
        counts[category] += 1;
        if (typeof signal.id !== "string" || ids.has(signal.id)) {
          issues.push(`${group.detector}: duplicate or missing signal id '${String(signal.id)}'`);
        }
        ids.add(signal.id);
        if (!Number.isInteger(signal.line) || signal.line < 1 || signal.line > sourceLines.length) {
          issues.push(`${signal.id}: line ${String(signal.line)} is outside '${group.file}'`);
          continue;
        }
        const location = `${group.detector}\0${group.file}\0${signal.line}`;
        if (locations.has(location)) issues.push(`${signal.id}: duplicate detector/file/line location`);
        locations.add(location);
        if (typeof signal.pattern !== "string" || !signal.pattern.trim()) {
          issues.push(`${signal.id}: pattern description is required`);
        }
        if (typeof signal.contains !== "string" || !sourceLines[signal.line - 1]?.includes(signal.contains)) {
          issues.push(`${signal.id}: source line no longer contains '${String(signal.contains)}'`);
        }
      }
    }
  }

  for (const detector of allowedDetectors) {
    if (!detectors.has(detector)) issues.push(`Missing detector group '${detector}'`);
  }
  const expected = manifest.benchmark.expected_distribution;
  if (expected?.positive !== counts.positive || expected?.negative !== counts.negative) {
    issues.push(`Signal distribution ${JSON.stringify(counts)} differs from ${JSON.stringify(expected)}`);
  }
  try {
    await access(resolve(baseDirectory, manifest.benchmark.architecture));
    await access(resolve(baseDirectory, manifest.benchmark.repository));
  } catch {
    issues.push("Pattern corpus architecture or repository is missing");
  }

  return { valid: issues.length === 0, issues, manifest, counts, baseDirectory };
}
