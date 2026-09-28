import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sha256 } from '../d3-source-review/files.mjs';
import { buildFileSidePreparation, ACCEPTED_CASES_SHA256 } from './file-side-preparation.mjs';

export const PARSER_VERSION = '5.9.3';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const guardianRequire = createRequire(realpathSync(resolve(repoRoot, 'node_modules/@archsync/guardian/package.json')));
const ts = guardianRequire('typescript');
const sourceKinds = new Map([
  ['.ts', ts.ScriptKind.TS], ['.tsx', ts.ScriptKind.TSX],
  ['.mts', ts.ScriptKind.TS], ['.cts', ts.ScriptKind.TS],
  ['.js', ts.ScriptKind.JS], ['.jsx', ts.ScriptKind.JSX],
  ['.mjs', ts.ScriptKind.JS], ['.cjs', ts.ScriptKind.JS],
]);
const key = (side, path) => JSON.stringify([side, path]);

/** Syntactic reading aid. A hint is never an accepted runtime edge or negative observation. */
export function collectSourceSyntaxHints(source, path) {
  assert.equal(ts.version, PARSER_VERSION, 'Pinned TypeScript parser version changed');
  assert(typeof source === 'string' && Buffer.byteLength(source, 'utf8') <= 4 * 1024 * 1024,
    'Bounded source text required');
  const kind = sourceKinds.get(extname(path).toLowerCase());
  if (!kind) return { parse_status: 'unsupported-extension', parse_diagnostics: [], hints: [] };
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, kind);
  const at = (node) => {
    const offset = node.getStart(file);
    const point = file.getLineAndCharacterOfPosition(offset);
    const quote = node.getText(file);
    return { line: point.line + 1, column: point.character + 1,
      quote: quote.slice(0, 256), quote_truncated: quote.length > 256,
      quote_sha256: sha256(Buffer.from(quote, 'utf8')) };
  };
  const hints = [];
  const push = (syntax, literal, detail = {}) => {
    hints.push({ syntax, ...at(literal), literal_value: ts.isStringLiteralLike(literal) ? literal.text : null,
      ...detail, review_status: 'unreviewed-syntax-hint' });
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const clause = node.importClause;
      const named = clause?.namedBindings;
      push('import-declaration', node.moduleSpecifier, {
        clause_type_only: clause?.isTypeOnly ?? false,
        named_bindings_all_type_only: named && ts.isNamedImports(named) && named.elements.length > 0 ?
          named.elements.every((item) => item.isTypeOnly) : false,
      });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      push('export-declaration', node.moduleSpecifier, { clause_type_only: node.isTypeOnly });
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const literal = node.moduleReference.expression;
      if (literal) push('import-equals', literal, { clause_type_only: node.isTypeOnly });
    } else if (ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      const syntax = node.expression.kind === ts.SyntaxKind.ImportKeyword ? 'dynamic-import-call' : 'require-call';
      const argument = node.arguments[0];
      if (argument && node.arguments.length === 1) push(syntax, argument, {
        argument_is_literal: ts.isStringLiteralLike(argument), binding_resolution: 'not-reviewed',
      });
      else push(syntax, node, { argument_is_literal: false, binding_resolution: 'not-reviewed' });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  hints.sort((a, b) => a.line - b.line || a.column - b.column || a.syntax.localeCompare(b.syntax));
  const diagnostics = file.parseDiagnostics.map((diagnostic) => {
    const point = file.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    return { code: diagnostic.code, line: point.line + 1, column: point.character + 1,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ').slice(0, 300) };
  });
  return { parse_status: diagnostics.length ? 'diagnostics-require-review' : 'parsed-not-reviewed',
    parse_diagnostics: diagnostics, hints };
}

export function buildSourceSyntaxHintPacket(raw) {
  const inventory = buildFileSidePreparation(raw, ACCEPTED_CASES_SHA256);
  const bundle = JSON.parse(raw.toString('utf8'));
  const cases = inventory.cases.map((item) => {
    const original = bundle.cases.find((sourceCase) => sourceCase.id === item.case_id &&
      sourceCase.repository === item.repository);
    assert(original, 'Selected source case missing');
    const sourceByKey = new Map(original.files.map((source) => [key(source.side, source.path), source]));
    return { repository: item.repository, case_id: item.case_id, base: item.base, head: item.head,
      file_sides: item.file_sides.map((side) => {
        const common = { side: side.side, commit: side.commit, path: side.path,
          git_blob: side.git_blob, source_sha256: side.sha256, source_status: side.source_status,
          review_status: 'unreviewed', zero_dependency_claim: false };
        if (side.source_status !== 'present-regular') return { ...common,
          parse_status: 'source-not-regular-at-side', parse_diagnostics: [], hints: [] };
        const source = sourceByKey.get(key(side.side, side.path));
        assert(source?.sha256 === side.sha256 && source.git_blob === side.git_blob);
        return { ...common, ...collectSourceSyntaxHints(source.text, side.path) };
      }) };
  });
  const all = cases.flatMap((item) => item.file_sides);
  const summary = { cases: cases.length, file_sides: all.length,
    present_regular: all.filter((side) => side.source_status === 'present-regular').length,
    absent_at_side: all.filter((side) => side.source_status === 'absent-at-side').length,
    syntax_hints: all.reduce((total, side) => total + side.hints.length, 0),
    parsed_without_hints_not_reviewed: all.filter((side) => side.parse_status === 'parsed-not-reviewed' &&
      side.hints.length === 0).length,
    diagnostics_requiring_review: all.filter((side) => side.parse_status === 'diagnostics-require-review').length,
    source_reviews_completed: 0, labels_created: 0, study_tool_predictions_executed: 0 };
  assert.equal(summary.cases, 56);
  assert.equal(summary.file_sides, 300);
  assert.equal(summary.present_regular, 281);
  assert.equal(summary.absent_at_side, 19);
  return { schema: 'd3-source-syntax-hints/1', status: 'parser-aided-source-reading-not-truth',
    cases_sha256: ACCEPTED_CASES_SHA256, parser: { name: 'typescript', version: PARSER_VERSION,
      role: 'development-associated-reading-aid-not-independent-reviewer' },
    study_tool_predictions_used: false, human_review_complete: false,
    empty_hints_are_not_negative_evidence: true, summary, cases };
}

async function main() {
  const [command, input, output] = process.argv.slice(2);
  assert(['build', 'verify'].includes(command) && input && output && process.argv.length === 5,
    'Usage: node source-syntax-hints.mjs build|verify <cases.json> <hints.json>');
  const bytes = Buffer.from(`${JSON.stringify(buildSourceSyntaxHintPacket(await readFile(resolve(input))), null, 2)}\n`);
  if (command === 'build') {
    await writeFile(resolve(output), bytes, { flag: 'wx' });
    process.stdout.write(`WROTE SOURCE SYNTAX HINTS ${output}\n`);
  } else {
    assert.deepEqual(await readFile(resolve(output)), bytes, 'Hints differ from pinned source and parser');
    process.stdout.write(`VERIFIED SOURCE SYNTAX HINTS ${output}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; });
}
