import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {parse} from 'espree';
import {KEYS} from 'eslint-visitor-keys';

import {
  EXIT_CODE,
  GUIDELINE_SKIP_PATH_PART,
  SCRIPT_TEXT,
} from './guideline-check-constants.js';

const LOCAL_STR_SLASH = '/';
const LOCAL_STR_TEST = '/test/';
const LOCAL_STR_TEST_JS = '.test.js';
const LOCAL_STR_TEST_MJS = '.test.mjs';
const LOCAL_STR_TEST_CJS = '.test.cjs';
const LOCAL_STR_SRC_CONSTANTS = '/src/constants/';
const LOCAL_STR_CONSTANTS = 'constants';
const LOCAL_STR_MODULE = 'module';
const LOCAL_STR_SCRIPT = 'script';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_TOP_FILES = 'Top files:';

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

const DEFAULT_SCAN_ROOTS = Object.freeze(['src', 'scripts']);
const DEFAULT_OUTPUT_LIMIT = 20;
const HASHBANG_PATTERN = /^#!.*(?:\r?\n|$)/;

function normalizePath(filePath) {
  return filePath.split(path.sep).join(LOCAL_STR_SLASH);
}

function classifyFilePath(filePath) {
  const normalized = normalizePath(filePath);
  const basename = path.basename(normalized).toLowerCase();
  if (normalized.includes(LOCAL_STR_TEST) ||
      basename.endsWith(LOCAL_STR_TEST_JS) ||
      basename.endsWith(LOCAL_STR_TEST_MJS) ||
      basename.endsWith(LOCAL_STR_TEST_CJS)) {
    return FILE_CLASS.TEST;
  }
  if (normalized.includes(LOCAL_STR_SRC_CONSTANTS) ||
      basename.includes(LOCAL_STR_CONSTANTS)) {
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
  return GUIDELINE_SKIP_PATH_PART.some((part) =>
    normalized.split(LOCAL_STR_SLASH).includes(part));
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
      sourceType: LOCAL_STR_MODULE,
    });
  } catch (_moduleError) {
    return parse(normalizedSource, {
      ...parseOptions,
      sourceType: LOCAL_STR_SCRIPT,
    });
  }
}

function walkAst(node, visitor, parent = null, ancestors = []) {
  if (!node || typeof node.type !== LOCAL_STR_STRING) {
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

async function buildGuidelineViolationReport(
  pathsToScan,
  options,
  collectViolationsFromSource,
) {
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
      ...collectViolationsFromSource(
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
    .sort((left, right) =>
      right.violationCount - left.violationCount ||
      left.filePath.localeCompare(right.filePath));

  return {
    scannedFileCount: files.length,
    totalViolationCount: violations.length,
    filesWithViolations,
    violations,
  };
}

function formatGuidelineHumanSummary(report, violationLabel) {
  const lines = [
    `Scanned ${report.scannedFileCount} JavaScript files`,
    `Found ${report.totalViolationCount} ${violationLabel} violations`,
  ];
  if (report.filesWithViolations.length === 0) {
    return lines.join(SCRIPT_TEXT.NEWLINE);
  }
  lines.push(LOCAL_STR_TOP_FILES);
  for (const entry of report.filesWithViolations.slice(0, DEFAULT_OUTPUT_LIMIT)) {
    lines.push(`- ${entry.filePath}: ${entry.violationCount}`);
  }
  return lines.join(SCRIPT_TEXT.NEWLINE);
}

function parseGuidelineCliArgs(argv = process.argv.slice(2)) {
  return {
    includeTests: argv.includes(OUTPUT_FORMAT.INCLUDE_TESTS),
    jsonOutput: argv.includes(OUTPUT_FORMAT.JSON),
    pathsToScan: argv.filter((arg) =>
      arg !== OUTPUT_FORMAT.INCLUDE_TESTS &&
      arg !== OUTPUT_FORMAT.JSON),
  };
}

async function runGuidelineCheck(argv, collectReport, formatHumanSummary) {
  const {
    includeTests,
    jsonOutput,
    pathsToScan,
  } = parseGuidelineCliArgs(argv);
  const report = await collectReport(pathsToScan, {includeTests});
  if (jsonOutput) {
    process.stdout.write(JSON.stringify(report, null, 2) + SCRIPT_TEXT.NEWLINE);
    return EXIT_CODE.SUCCESS;
  }
  process.stdout.write(formatHumanSummary(report) + SCRIPT_TEXT.NEWLINE);
  return report.totalViolationCount > 0 ?
    EXIT_CODE.FAILURE :
    EXIT_CODE.SUCCESS;
}

function runGuidelineCheckWhenDirect(metaUrl, main) {
  const isDirectExecution = process.argv[1] &&
    path.resolve(process.argv[1]) ===
      path.resolve(new globalThis.URL(metaUrl).pathname);
  if (!isDirectExecution) {
    return;
  }
  main().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    process.stderr.write(String(error?.stack || error) + SCRIPT_TEXT.NEWLINE);
    process.exitCode = EXIT_CODE.FAILURE;
  });
}


// Count-based baseline machinery shared by guideline checks. Identities are
// line/column-INDEPENDENT (file + semantic fields) so routine edits do not
// resurface inherited violations; count-based application still blocks NET
// growth of the same identity.
const BASELINE_FILE_NOT_FOUND_CODE = 'ENOENT';
const BASELINE_ENCODING_UTF8 = 'utf8';
const BASELINE_VERSION = 1;
const BASELINE_JSON_INDENT = 2;

async function loadCountBaseline(baselineFileUrl, buildIdentity) {
  try {
    const rawBaseline = await fs.readFile(baselineFileUrl, BASELINE_ENCODING_UTF8);
    const parsedBaseline = JSON.parse(rawBaseline);
    const allowedCounts = new Map();
    for (const violation of (Array.isArray(parsedBaseline?.violations) ?
      parsedBaseline.violations :
      [])) {
      const identity = buildIdentity(violation);
      allowedCounts.set(identity, (allowedCounts.get(identity) || 0) + 1);
    }
    return allowedCounts;
  } catch (error) {
    if (error?.code === BASELINE_FILE_NOT_FOUND_CODE) {
      return new Map();
    }
    throw error;
  }
}

function summarizeBaselineViolationsByFile(violations) {
  const countsByFile = new Map();
  for (const violation of violations) {
    countsByFile.set(
      violation.filePath,
      (countsByFile.get(violation.filePath) || 0) + 1,
    );
  }
  return [...countsByFile.entries()]
    .map(([filePath, violationCount]) => ({filePath, violationCount}))
    .sort((left, right) =>
      right.violationCount - left.violationCount ||
      left.filePath.localeCompare(right.filePath));
}

function applyCountBaseline(report, baseline, buildIdentity) {
  const newViolations = [];
  const remainingAllowances = new Map(baseline);
  let inheritedViolationCount = 0;
  for (const violation of report.violations) {
    const identity = buildIdentity(violation);
    const allowance = remainingAllowances.get(identity) || 0;
    if (allowance > 0) {
      remainingAllowances.set(identity, allowance - 1);
      inheritedViolationCount += 1;
      continue;
    }
    newViolations.push(violation);
  }
  let baselineViolationCount = 0;
  for (const allowance of baseline.values()) {
    baselineViolationCount += allowance;
  }
  return {
    ...report,
    rawViolationCount: report.totalViolationCount,
    inheritedViolationCount,
    baselineViolationCount,
    totalViolationCount: newViolations.length,
    filesWithViolations: summarizeBaselineViolationsByFile(newViolations),
    violations: newViolations,
  };
}

async function writeCountBaseline(baselineFileUrl, report, label) {
  const baseline = {
    version: BASELINE_VERSION,
    generatedAt: new Date().toISOString(),
    rawViolationCount: report.totalViolationCount,
    violations: report.violations,
  };
  await fs.writeFile(
    baselineFileUrl,
    JSON.stringify(baseline, null, BASELINE_JSON_INDENT) + SCRIPT_TEXT.NEWLINE,
    BASELINE_ENCODING_UTF8,
  );
  process.stdout.write(
    `Wrote ${report.totalViolationCount} ${label} baseline entries\n`,
  );
}


// Resolve the nearest enclosing function name for a violation site (used by
// AST-based guideline checks for line-independent violation identities).
const ENCLOSING_FUNCTION_NODE_TYPES = Object.freeze([
  'ArrowFunctionExpression',
  'FunctionDeclaration',
  'FunctionExpression',
]);
const ENCLOSING_ANONYMOUS_FUNCTION_NAME = '<anonymous>';
const ENCLOSING_NODE_TYPE = Object.freeze({
  IDENTIFIER: 'Identifier',
  VARIABLE_DECLARATOR: 'VariableDeclarator',
  PROPERTY: 'Property',
  METHOD_DEFINITION: 'MethodDefinition',
});

function getEnclosingFunctionName(ancestors) {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const node = ancestors[index];
    if (!ENCLOSING_FUNCTION_NODE_TYPES.includes(node?.type)) {
      continue;
    }
    if (node.id?.type === ENCLOSING_NODE_TYPE.IDENTIFIER) {
      return node.id.name;
    }
    const parent = ancestors[index - 1];
    if (parent?.type === ENCLOSING_NODE_TYPE.VARIABLE_DECLARATOR &&
        parent.id?.type === ENCLOSING_NODE_TYPE.IDENTIFIER) {
      return parent.id.name;
    }
    if ((parent?.type === ENCLOSING_NODE_TYPE.PROPERTY ||
         parent?.type === ENCLOSING_NODE_TYPE.METHOD_DEFINITION) &&
        parent.key?.type === ENCLOSING_NODE_TYPE.IDENTIFIER) {
      return parent.key.name;
    }
    return ENCLOSING_ANONYMOUS_FUNCTION_NAME;
  }
  return ENCLOSING_ANONYMOUS_FUNCTION_NAME;
}

export {
  FILE_CLASS,
  OUTPUT_FORMAT,
  applyCountBaseline,
  getEnclosingFunctionName,
  buildGuidelineViolationReport,
  classifyFilePath,
  formatGuidelineHumanSummary,
  loadCountBaseline,
  parseSourceFile,
  runGuidelineCheck,
  runGuidelineCheckWhenDirect,
  walkAst,
  writeCountBaseline,
};
