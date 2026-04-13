// @ts-nocheck
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {parse} from 'espree';
import {KEYS} from 'eslint-visitor-keys';
import {
  EXIT_CODE,
  GUIDELINE_LLM_SKIP_PATH_PART,
  SCRIPT_TEXT,
} from './guideline-check-constants.js';

const FILE_EXTENSION = Object.freeze({
  CJS: '.cjs',
  JS: '.js',
  MJS: '.mjs',
});

const FILE_CLASS = Object.freeze({
  CONSTANTS_OWNER: 'constants_owner',
  RUNTIME: 'runtime',
  TEST: 'test',
});

const OUTPUT_FORMAT = Object.freeze({
  JSON: '--json',
  INCLUDE_TESTS: '--include-tests',
});

const RULE_REFERENCE = 'system guidelines.md §4.1 Constants, Not Literals';
const DEFAULT_SCAN_ROOTS = Object.freeze(['src', 'scripts']);
const DEFAULT_OUTPUT_LIMIT = 20;
const HASHBANG_PATTERN = /^#!.*(?:\r?\n|$)/;

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function classifyFilePath(filePath) {
  const normalized = normalizePath(filePath);
  const basename = path.basename(normalized).toLowerCase();
  if (normalized.includes('/test/') ||
      basename.endsWith('.test.js') ||
      basename.endsWith('.test.mjs') ||
      basename.endsWith('.test.cjs')) {
    return FILE_CLASS.TEST;
  }
  if (normalized.includes('/src/constants/') ||
      basename.includes('constants')) {
    return FILE_CLASS.CONSTANTS_OWNER;
  }
  return FILE_CLASS.RUNTIME;
}

function isJavaScriptFile(filePath) {
  return [
    FILE_EXTENSION.CJS,
    FILE_EXTENSION.JS,
    FILE_EXTENSION.MJS,
  ].includes(path.extname(filePath));
}

function shouldSkipDirectory(directoryPath) {
  const normalized = normalizePath(directoryPath);
  return GUIDELINE_LLM_SKIP_PATH_PART.some((part) =>
    normalized.split('/').includes(part));
}

async function collectJavaScriptFiles(entryPath) {
  const stat = await fs.stat(entryPath);
  if (stat.isFile()) {
    return isJavaScriptFile(entryPath) ? [entryPath] : [];
  }
  if (!stat.isDirectory() || shouldSkipDirectory(entryPath)) {
    return [];
  }
  const children = await fs.readdir(entryPath, {withFileTypes: true});
  const collected = [];
  for (const child of children) {
    const childPath = path.join(entryPath, child.name);
    if (child.isDirectory()) {
      collected.push(...await collectJavaScriptFiles(childPath));
      continue;
    }
    if (child.isFile() && isJavaScriptFile(childPath)) {
      collected.push(childPath);
    }
  }
  return collected;
}

function stripHashbang(source) {
  return source.replace(HASHBANG_PATTERN, SCRIPT_TEXT.NEWLINE);
}

function parseSourceFile(source) {
  const normalizedSource = stripHashbang(source);
  const parseOptions = {
    ecmaVersion: 'latest',
    loc: true,
    range: true,
  };
  try {
    return parse(normalizedSource, {
      ...parseOptions,
      sourceType: 'module',
    });
  } catch (_moduleError) {
    return parse(normalizedSource, {
      ...parseOptions,
      sourceType: 'script',
    });
  }
}

function walkAst(node, visitor, parent = null, ancestors = []) {
  if (!node || typeof node.type !== 'string') {
    return;
  }
  visitor(node, parent, ancestors);
  const keys = KEYS[node.type] || [];
  for (const key of keys) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        walkAst(child, visitor, node, [...ancestors, node]);
      }
      continue;
    }
    walkAst(value, visitor, node, [...ancestors, node]);
  }
}

function isLiteralNode(node) {
  return node?.type === 'Literal' &&
    (typeof node.value === 'string' || typeof node.value === 'number');
}

function isDirectiveLiteral(node, parent, ancestors) {
  const grandparent = ancestors[ancestors.length - 1];
  return parent?.type === 'ExpressionStatement' &&
    grandparent?.type === 'Program' &&
    typeof parent.directive === 'string';
}

function isModuleSourceLiteral(node, parent) {
  return (
    (parent?.type === 'ImportDeclaration' && parent.source === node) ||
    (parent?.type === 'ExportAllDeclaration' && parent.source === node) ||
    (parent?.type === 'ExportNamedDeclaration' && parent.source === node)
  );
}

function isObjectKeyLiteral(node, parent) {
  return (
    (parent?.type === 'Property' && parent.key === node && parent.computed !== true) ||
    (parent?.type === 'MethodDefinition' && parent.key === node && parent.computed !== true) ||
    (parent?.type === 'PropertyDefinition' && parent.key === node &&
      parent.computed !== true)
  );
}

function isParseIntRadixLiteral(node, parent) {
  if (parent?.type !== 'CallExpression' || parent.arguments[1] !== node) {
    return false;
  }
  if (parent.callee?.type === 'Identifier' && parent.callee.name === 'parseInt') {
    return true;
  }
  return parent.callee?.type === 'MemberExpression' &&
    parent.callee.property?.type === 'Identifier' &&
    parent.callee.property.name === 'parseInt';
}

function findConstDeclarationContext(ancestors) {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index];
    if (ancestor?.type === 'VariableDeclarator') {
      const declaration = ancestors[index - 1];
      const exportDeclaration = ancestors[index - 2];
      if (declaration?.type !== 'VariableDeclaration' ||
          declaration.kind !== 'const' ||
          ancestor.id?.type !== 'Identifier') {
        return null;
      }
      return {
        declaration,
        declarator: ancestor,
        exported: exportDeclaration?.type === 'ExportNamedDeclaration',
      };
    }
  }
  return null;
}

function shouldIgnoreBecauseNamedConstant(node, ancestors, fileClass) {
  const context = findConstDeclarationContext(ancestors);
  if (!context) {
    return false;
  }
  if (fileClass === FILE_CLASS.TEST ||
      fileClass === FILE_CLASS.CONSTANTS_OWNER) {
    return true;
  }
  return context.exported !== true;
}

function buildViolationKind(node, ancestors, fileClass) {
  const context = findConstDeclarationContext(ancestors);
  if (context?.exported === true && fileClass !== FILE_CLASS.CONSTANTS_OWNER) {
    return 'exported_literal_outside_constants_owner';
  }
  return typeof node.value === 'number' ?
    'free_floating_number_literal' :
    'free_floating_string_literal';
}

function buildViolationReason(kind) {
  if (kind === 'exported_literal_outside_constants_owner') {
    return 'exported literal constant outside canonical constants-owner module';
  }
  return 'raw literal outside a named constant owner';
}

function collectMagicLiteralViolationsFromSource(
  source,
  filePath,
  options = {},
) {
  const fileClass = classifyFilePath(filePath);
  if (fileClass === FILE_CLASS.TEST && options.includeTests !== true) {
    return [];
  }

  const ast = parseSourceFile(source);
  const violations = [];

  walkAst(ast, (node, parent, ancestors) => {
    if (!isLiteralNode(node)) {
      return;
    }
    if (isDirectiveLiteral(node, parent, ancestors) ||
        isModuleSourceLiteral(node, parent) ||
        isObjectKeyLiteral(node, parent) ||
        isParseIntRadixLiteral(node, parent) ||
        shouldIgnoreBecauseNamedConstant(node, ancestors, fileClass)) {
      return;
    }

    violations.push({
      filePath,
      line: node.loc?.start?.line || 1,
      column: node.loc?.start?.column + 1 || 1,
      value: String(node.raw ?? node.value),
      kind: buildViolationKind(node, ancestors, fileClass),
      reason: buildViolationReason(
        buildViolationKind(node, ancestors, fileClass),
      ),
      ruleReference: RULE_REFERENCE,
    });
  });

  return violations;
}

async function collectMagicLiteralViolations(pathsToScan, options = {}) {
  const entryPaths = pathsToScan.length > 0 ?
    pathsToScan :
    [...DEFAULT_SCAN_ROOTS];
  const fileSet = new Set();
  for (const entryPath of entryPaths) {
    for (const filePath of await collectJavaScriptFiles(entryPath)) {
      fileSet.add(filePath);
    }
  }

  const files = [...fileSet].sort();
  const violations = [];
  for (const filePath of files) {
    const source = await fs.readFile(filePath, SCRIPT_TEXT.ENCODING_UTF8);
    violations.push(
      ...collectMagicLiteralViolationsFromSource(
        source,
        filePath,
        options,
      ),
    );
  }

  const violationsByFile = new Map();
  for (const violation of violations) {
    const existing = violationsByFile.get(violation.filePath) || [];
    existing.push(violation);
    violationsByFile.set(violation.filePath, existing);
  }

  const filesWithViolations = [...violationsByFile.entries()]
    .map(([filePath, fileViolations]) => ({
      filePath,
      violationCount: fileViolations.length,
    }))
    .sort((left, right) => {
      return right.violationCount - left.violationCount ||
        left.filePath.localeCompare(right.filePath);
    });

  return {
    scannedFileCount: files.length,
    totalViolationCount: violations.length,
    filesWithViolations,
    violations,
  };
}

function formatHumanSummary(report) {
  const lines = [
    `Scanned ${report.scannedFileCount} JavaScript files`,
    `Found ${report.totalViolationCount} literal-guideline violations`,
  ];
  if (report.filesWithViolations.length === 0) {
    return lines.join(SCRIPT_TEXT.NEWLINE);
  }
  lines.push('Top files:');
  for (const entry of report.filesWithViolations.slice(0, DEFAULT_OUTPUT_LIMIT)) {
    lines.push(`- ${entry.filePath}: ${entry.violationCount}`);
  }
  return lines.join(SCRIPT_TEXT.NEWLINE);
}

async function main(argv = process.argv.slice(2)) {
  const includeTests = argv.includes(OUTPUT_FORMAT.INCLUDE_TESTS);
  const jsonOutput = argv.includes(OUTPUT_FORMAT.JSON);
  const pathsToScan = argv.filter((arg) =>
    arg !== OUTPUT_FORMAT.INCLUDE_TESTS &&
    arg !== OUTPUT_FORMAT.JSON);

  const report = await collectMagicLiteralViolations(pathsToScan, {
    includeTests,
  });
  if (jsonOutput) {
    process.stdout.write(JSON.stringify(report, null, 2) + SCRIPT_TEXT.NEWLINE);
    return EXIT_CODE.SUCCESS;
  }
  process.stdout.write(formatHumanSummary(report) + SCRIPT_TEXT.NEWLINE);
  return report.totalViolationCount > 0 ?
    EXIT_CODE.FAILURE :
    EXIT_CODE.SUCCESS;
}

const isDirectExecution = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isDirectExecution) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    process.stderr.write(String(error?.stack || error) + SCRIPT_TEXT.NEWLINE);
    process.exitCode = EXIT_CODE.FAILURE;
  });
}

export {
  FILE_CLASS,
  RULE_REFERENCE,
  classifyFilePath,
  collectMagicLiteralViolations,
  collectMagicLiteralViolationsFromSource,
};
