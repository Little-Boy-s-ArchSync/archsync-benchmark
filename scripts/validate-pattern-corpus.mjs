import { fileURLToPath } from "node:url";

import { validatePatternCorpus } from "./lib/pattern-corpus.mjs";

const manifest = fileURLToPath(new URL("../typescript-patterns/signals.json", import.meta.url));
const result = await validatePatternCorpus(manifest);
if (!result.valid) throw new Error(result.issues.join("\n"));
console.log(
  `VALID TYPESCRIPT PATTERN CORPUS (${result.counts.positive} positive, ` +
  `${result.counts.negative} hard-negative signals)`,
);

