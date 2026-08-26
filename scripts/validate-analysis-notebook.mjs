import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { summarizeAnalysisNotebook, validateAnalysisNotebook } from "./lib/analysis-notebook.mjs";

const notebook = JSON.parse(await readFile(new URL("../analysis/analysis-101.ipynb", import.meta.url), "utf8"));
assert.deepEqual(validateAnalysisNotebook(notebook), []);
const summary = summarizeAnalysisNotebook(notebook);
assert.equal(summary.executed_cells, 0);
assert.equal(summary.output_items, 0);
assert.equal(summary.results_embedded, false);
console.log(`VALID ANALYSIS-101 NOTEBOOK INDEX (${summary.cells} cells; 0 outputs; ${summary.notebook_sha256}; no Python/Jupyter runtime required)`);
