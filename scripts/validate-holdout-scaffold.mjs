import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { validateHoldoutManifest } from "./lib/holdout.mjs";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("holdout/manifest.template.json", root), "utf8"));
assert.deepEqual(validateHoldoutManifest(manifest), []);
assert.equal(manifest.status, "proposed");
assert.equal(manifest.repositories.length, 0);
assert.equal(manifest.approval, null);
const protocol = await readFile(new URL("holdout/PROTOCOL.md", root), "utf8");
const handbook = await readFile(new URL("holdout/README.md", root), "utf8");
assert.match(protocol, /blocked by EXP-102 and Lead approval/iu);
assert.match(protocol, /never used to tune ArchSync/iu);
assert.match(protocol, /Failed runs stay in n/iu);
assert.match(handbook, /Do not select final repositories/iu);
assert.match(handbook, /saw_prediction=false/u);
console.log("VALID HOLDOUT SCAFFOLD (proposed only; inference/freeze human-gated)");
