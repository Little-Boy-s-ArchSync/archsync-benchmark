// Development-only bridge for a separately approved module comparison.
// It does not infer architecture rules or execute any D3 source.
import { readFileSync } from 'node:fs';

export function normalizeModuleGroups(graph, mapping) {
  if (graph?.adapter !== 'archsync-static-esm' || graph.adapter_version !== '0.1.1' ||
      graph.scope !== 'configured-internal-typescript-static-esm' ||
      graph.status !== 'complete-within-scope' || graph.issues?.length) {
    throw new Error('Unsupported or incomplete module observation');
  }
  if (!Array.isArray(graph.modules) || !Array.isArray(graph.edges) ||
      !mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
    throw new Error('Invalid graph or mapping');
  }
  const files = new Set();
  const ids = new Set();
  for (const module of graph.modules) {
    if (typeof module.file !== 'string' || !module.file || files.has(module.file) ||
        typeof module.id !== 'string' || !module.id || ids.has(module.id)) {
      throw new Error('Duplicate or invalid module identity');
    }
    files.add(module.file);
    ids.add(module.id);
  }
  if (Object.keys(mapping).length !== files.size ||
      Object.keys(mapping).some((file) => !files.has(file))) {
    throw new Error('Mapping must cover exactly the observed source files');
  }
  for (const file of files) {
    if (typeof mapping[file] !== 'string' || !mapping[file].trim()) {
      throw new Error(`Missing group for ${file}`);
    }
  }
  const groups = new Map();
  for (const edge of graph.edges) {
    if (!files.has(edge.from) || !files.has(edge.to) ||
        !Array.isArray(edge.evidence) || !edge.evidence.length) {
      throw new Error('Edge has an unknown endpoint or no evidence');
    }
    const from = mapping[edge.from];
    const to = mapping[edge.to];
    const key = JSON.stringify([from, to]);
    const row = groups.get(key) ?? { from, to, file_edges: [] };
    row.file_edges.push({ from: edge.from, to: edge.to, evidence: edge.evidence });
    groups.set(key, row);
  }
  return [...groups.values()].sort((a, b) =>
    JSON.stringify([a.from, a.to]).localeCompare(JSON.stringify([b.from, b.to])));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  if (process.argv.length !== 4) {
    process.stderr.write('Usage: node module-group-normalizer.mjs graph.json mapping.json\n');
    process.exitCode = 2;
  } else {
    try {
      const graph = JSON.parse(readFileSync(process.argv[2], 'utf8'));
      const mapping = JSON.parse(readFileSync(process.argv[3], 'utf8'));
      process.stdout.write(`${JSON.stringify(normalizeModuleGroups(graph, mapping), null, 2)}\n`);
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 2;
    }
  }
}
