import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  REPRODUCIBILITY_CHECKS,
  assertReproducibilityClosure,
  evaluateReproducibilityClosure,
  validateReproducibilityAudit,
} from "./lib/reproducibility-audit.mjs";

const root = new URL("../", import.meta.url);
const audit = JSON.parse(await readFile(new URL("reproducibility/audit.template.json", root), "utf8"));
assert.equal(audit.status, "pending");
assert.equal(audit.template_only, true);
assert.equal(audit.auditor, null);
assert.deepEqual(Object.keys(audit.checks), REPRODUCIBILITY_CHECKS);
assert.ok(Object.values(audit.checks).every((value) => value === null));
const issues = validateReproducibilityAudit(audit);
assert.deepEqual(issues, ["repository and full commit are required"]);
const closure = evaluateReproducibilityClosure(audit);
assert.equal(closure.status, "PREPARATORY");
assert.equal(closure.closed, false);
assert.ok(closure.blockers.includes("independent_audit_not_reproduced"));
const runbook = await readFile(new URL("reproducibility/RUNBOOK.md", root), "utf8");
assert.match(runbook, /no independent audit has occurred/iu);
assert.match(runbook, /new clean checkout/iu);
assert.match(runbook, /negative gate unexpectedly passing/iu);
if (process.argv.includes("--require-reproduced")) assertReproducibilityClosure(audit);
console.log("VALID REPL-101 PREPARATION (pending template and independent runbook; no audit claimed)");
