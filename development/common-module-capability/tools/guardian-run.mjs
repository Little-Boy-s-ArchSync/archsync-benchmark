import { readFile } from 'node:fs/promises';
import { analyzeModuleDependencies } from './guardian/module-dependencies.js';
const [root, mapping] = process.argv.slice(2);
console.log(JSON.stringify(await analyzeModuleDependencies(root, JSON.parse(await readFile(mapping, 'utf8'))), null, 2));
