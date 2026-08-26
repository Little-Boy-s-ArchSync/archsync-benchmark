import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

export const ANALYSIS_NOTEBOOK_WATERMARK = "NO RESEARCH RESULTS — GOVERNED NODE PIPELINE INDEX ONLY";

const expectedMetadata = {
  task_id: "ANALYSIS-101",
  status: "scaffold-only-no-results",
  watermark: ANALYSIS_NOTEBOOK_WATERMARK,
  canonical_executor: "scripts/analysis-pipeline.mjs",
  canonical_library: "scripts/lib/analysis-pipeline.mjs",
  verify_command: "pnpm analysis:verify",
  publication_gate_command: "pnpm analysis:gate",
  input_template: "analysis/input.template.json",
  synthetic_fixture: "analysis/input.synthetic.json",
  preparatory_output_directory: "analysis/preparatory/",
  notebook_execution_authorized: false,
  results_embedded: false,
};

const expectedCells = [
  {
    cell_type: "markdown",
    metadata: { tags: ["archsync-watermark", "no-results"] },
    source: [
      "# ANALYSIS-101 governed notebook index\n",
      "\n",
      `> **${ANALYSIS_NOTEBOOK_WATERMARK}**\n`,
      "\n",
      "This result-free notebook is a transparent front-end to the canonical Node pipeline. It contains no estimates, tables, figures, embedded data, or executable analysis logic.",
    ],
  },
  {
    cell_type: "markdown",
    metadata: { tags: ["archsync-pipeline-map", "no-results"] },
    source: [
      "## Governed pipeline map\n",
      "\n",
      "- Canonical executor: `scripts/analysis-pipeline.mjs`\n",
      "- Validation/rendering library: `scripts/lib/analysis-pipeline.mjs`\n",
      "- Empty governed input template: `analysis/input.template.json`\n",
      "- Explicitly synthetic dry-run fixture: `analysis/input.synthetic.json`\n",
      "- Watermarked dry-run outputs: `analysis/preparatory/results.csv`, `analysis/preparatory/table.md`, `analysis/preparatory/figure.svg`, and `analysis/preparatory/manifest.json`\n",
      "- Verify deterministic preparation: `pnpm analysis:verify`\n",
      "- Publication closure gate: `pnpm analysis:gate` (expected to remain closed until frozen human-approved evidence exists)",
    ],
  },
  {
    cell_type: "code",
    execution_count: null,
    metadata: { tags: ["archsync-command-index", "no-execute", "no-results"] },
    outputs: [],
    source: [
      "# INDEX ONLY — do not execute analysis in this notebook.\n",
      "# Canonical verification command: pnpm analysis:verify\n",
      "# Governed publication gate: pnpm analysis:gate",
    ],
  },
];

function object(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateAnalysisNotebook(notebook) {
  if (!object(notebook)) return ["analysis notebook must be an object"];
  const issues = [];
  if (notebook.nbformat !== 4 || notebook.nbformat_minor !== 5) issues.push("notebook format must be exactly nbformat 4.5");
  if (!object(notebook.metadata) || !isDeepStrictEqual(notebook.metadata.archsync, expectedMetadata) || Object.keys(notebook.metadata).length !== 1) {
    issues.push("notebook metadata must exactly pin the ANALYSIS-101 result-free pipeline contract");
  }
  if (!Array.isArray(notebook.cells)) return [...issues, "notebook cells must be an array"];
  if (notebook.cells.length !== expectedCells.length) issues.push("notebook must contain exactly three pinned index cells");

  expectedCells.forEach((expected, index) => {
    const cell = notebook.cells[index];
    if (!object(cell)) {
      issues.push(`cell ${index} must be an object`);
    } else if (!isDeepStrictEqual(cell, expected)) {
      issues.push(`cell ${index} does not match the result-free governed index`);
    }
  });
  notebook.cells.forEach((cell, index) => {
    if (!object(cell)) return;
    if (Object.hasOwn(cell, "execution_count") && cell.execution_count !== null) issues.push(`cell ${index} execution_count must be null`);
    if (Object.hasOwn(cell, "outputs") && (!Array.isArray(cell.outputs) || cell.outputs.length !== 0)) issues.push(`cell ${index} outputs must be empty`);
  });
  return issues;
}

export function summarizeAnalysisNotebook(notebook) {
  const issues = validateAnalysisNotebook(notebook);
  if (issues.length > 0) throw new Error(`ANALYSIS_NOTEBOOK_INVALID: ${issues.join("; ")}`);
  return {
    schema_version: 1,
    task_id: "ANALYSIS-101",
    status: "VALID_RESULT_FREE_NOTEBOOK_INDEX",
    notebook_sha256: createHash("sha256").update(JSON.stringify(notebook)).digest("hex"),
    cells: notebook.cells.length,
    executed_cells: 0,
    output_items: 0,
    results_embedded: false,
    canonical_executor: expectedMetadata.canonical_executor,
    verify_command: expectedMetadata.verify_command,
    publication_gate_command: expectedMetadata.publication_gate_command,
  };
}
