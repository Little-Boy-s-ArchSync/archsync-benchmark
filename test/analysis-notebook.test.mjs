import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ANALYSIS_NOTEBOOK_WATERMARK,
  summarizeAnalysisNotebook,
  validateAnalysisNotebook,
} from "../scripts/lib/analysis-notebook.mjs";

const notebook = JSON.parse(await readFile(new URL("../analysis/analysis-101.ipynb", import.meta.url), "utf8"));

function fixture() {
  return structuredClone(notebook);
}

test("ANALYSIS-101 notebook is an unexecuted result-free index to the governed Node pipeline", () => {
  assert.equal(ANALYSIS_NOTEBOOK_WATERMARK, "NO RESEARCH RESULTS — GOVERNED NODE PIPELINE INDEX ONLY");
  assert.deepEqual(validateAnalysisNotebook(notebook), []);
  const summary = summarizeAnalysisNotebook(notebook);
  assert.equal(summary.status, "VALID_RESULT_FREE_NOTEBOOK_INDEX");
  assert.equal(summary.cells, 3);
  assert.equal(summary.executed_cells, 0);
  assert.equal(summary.output_items, 0);
  assert.equal(summary.results_embedded, false);
  assert.equal(summary.canonical_executor, "scripts/analysis-pipeline.mjs");
  assert.equal(summary.verify_command, "pnpm analysis:verify");
  assert.equal(summary.publication_gate_command, "pnpm analysis:gate");
  assert.match(summary.notebook_sha256, /^[0-9a-f]{64}$/u);
  assert.deepEqual(summarizeAnalysisNotebook(fixture()), summary);
  assert.deepEqual(validateAnalysisNotebook(null), ["analysis notebook must be an object"]);
  assert.throws(() => summarizeAnalysisNotebook(null), /ANALYSIS_NOTEBOOK_INVALID/u);
});

test("notebook envelope and pinned cells reject structural or pipeline-contract drift", () => {
  const invalid = fixture();
  invalid.nbformat = 5;
  invalid.nbformat_minor = 4;
  invalid.metadata.archsync.status = "results";
  invalid.metadata.unexpected = true;
  invalid.cells.push({ cell_type: "markdown", metadata: {}, source: ["result"] });
  invalid.cells[0].source = ["tampered"];
  invalid.cells[1] = null;
  const issues = validateAnalysisNotebook(invalid);
  for (const expected of ["nbformat", "metadata", "exactly three", "cell 0", "cell 1"]) {
    assert.ok(issues.some((issue) => issue.includes(expected)), expected);
  }

  const noMetadata = fixture();
  noMetadata.metadata = null;
  assert.ok(validateAnalysisNotebook(noMetadata).some((issue) => issue.includes("metadata")));
  const noCells = fixture();
  noCells.cells = null;
  assert.ok(validateAnalysisNotebook(noCells).some((issue) => issue.includes("cells must be an array")));
  const missingCell = fixture();
  missingCell.cells.pop();
  assert.ok(validateAnalysisNotebook(missingCell).some((issue) => issue.includes("cell 2 must be an object")));
});

test("notebook rejects execution, outputs, and populated result cells", () => {
  const executed = fixture();
  executed.cells[2].execution_count = 1;
  executed.cells[2].outputs = [{ output_type: "stream", text: ["0.95"] }];
  executed.cells[2].source = ["result = 0.95"];
  const issues = validateAnalysisNotebook(executed);
  for (const expected of ["cell 2 does not match", "execution_count", "outputs must be empty"]) {
    assert.ok(issues.some((issue) => issue.includes(expected)), expected);
  }

  const malformedOutputs = fixture();
  malformedOutputs.cells[2].outputs = null;
  assert.ok(validateAnalysisNotebook(malformedOutputs).some((issue) => issue.includes("outputs must be empty")));
  const markdownExecution = fixture();
  markdownExecution.cells[0].execution_count = 0;
  markdownExecution.cells[0].outputs = [];
  assert.ok(validateAnalysisNotebook(markdownExecution).some((issue) => issue.includes("execution_count")));
});
