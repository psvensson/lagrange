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

const RULE_REFERENCE =
  'system guidelines.md §4.1.1 Semantic Decision Boundaries Must Use Explicit State Models';
const DEFAULT_SCAN_ROOTS = Object.freeze(['src', 'scripts']);
const DEFAULT_OUTPUT_LIMIT = 20;
const HASHBANG_PATTERN = /^#!.*(?:\r?\n|$)/;

const FUNCTION_TYPE = Object.freeze({
  ARROW: 'ArrowFunctionExpression',
  DECLARATION: 'FunctionDeclaration',
  EXPRESSION: 'FunctionExpression',
});

const VIOLATION_KIND = Object.freeze({
  ASSIGNMENT: 'independent_if_semantic_assignment',
  RETURN: 'independent_if_semantic_returns',
});

const SEMANTIC_NAME_PART = Object.freeze([
  'state',
  'status',
  'phase',
  'reason',
  'ready',
  'retry',
  'admit',
  'admission',
  'decision',
  'outcome',
  'kind',
  'failure',
  'publication',
  'authority',
  'lifecycle',
  'blocked',
]);

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

function isFunctionLikeNode(node) {
  return [
    FUNCTION_TYPE.ARROW,
    FUNCTION_TYPE.DECLARATION,
    FUNCTION_TYPE.EXPRESSION,
  ].includes(node?.type);
}

function isElseIfBranch(node, parent) {
  return parent?.type === 'IfStatement' && parent.alternate === node;
}

function getFunctionName(node, parent) {
  if (node.id?.type === 'Identifier') {
    return node.id.name;
  }
  if (parent?.type === 'VariableDeclarator' &&
      parent.id?.type === 'Identifier') {
    return parent.id.name;
  }
  if ((parent?.type === 'Property' || parent?.type === 'MethodDefinition') &&
      parent.key) {
    if (parent.key.type === 'Identifier') {
      return parent.key.name;
    }
    if (parent.key.type === 'Literal' && typeof parent.key.value === 'string') {
      return parent.key.value;
    }
  }
  return '<anonymous>';
}

function extractTargetName(node) {
  if (!node) {
    return null;
  }
  if (node.type === 'Identifier') {
    return node.name;
  }
  if (node.type === 'MemberExpression') {
    const objectName = extractTargetName(node.object);
    const propertyName = node.computed ?
      (node.property?.type === 'Literal' ? String(node.property.value) : null) :
      extractTargetName(node.property);
    if (!objectName || !propertyName) {
      return null;
    }
    return `${objectName}.${propertyName}`;
  }
  return null;
}

function isSemanticName(name) {
  if (typeof name !== 'string' || name.length === 0) {
    return false;
  }
  const normalized = name.toLowerCase();
  return SEMANTIC_NAME_PART.some((part) => normalized.includes(part));
}

function collectSemanticKeysFromObject(node) {
  if (node?.type !== 'ObjectExpression') {
    return [];
  }
  const keys = [];
  for (const property of node.properties || []) {
    if (property.type !== 'Property' || property.computed === true) {
      continue;
    }
    let keyName = null;
    if (property.key?.type === 'Identifier') {
      keyName = property.key.name;
    } else if (property.key?.type === 'Literal' &&
      typeof property.key.value === 'string') {
      keyName = property.key.value;
    }
    if (isSemanticName(keyName)) {
      keys.push(keyName);
    }
  }
  return keys;
}

function addLineToMap(map, key, line) {
  const lines = map.get(key) || new Set();
  lines.add(line);
  map.set(key, lines);
}

function collectFunctionViolations(node, parent, filePath) {
  const functionName = getFunctionName(node, parent);
  const independentIfLines = new Set();
  const semanticAssignments = new Map();
  const semanticReturnKeys = new Map();
  let semanticReturnCount = 0;

  function traverse(currentNode, currentParent = null, ancestors = []) {
    if (!currentNode || typeof currentNode.type !== 'string') {
      return;
    }
    if (currentNode !== node && isFunctionLikeNode(currentNode)) {
      return;
    }

    const insideIf = ancestors.some((ancestor) => ancestor.type === 'IfStatement');

    if (currentNode.type === 'IfStatement' &&
        !isElseIfBranch(currentNode, currentParent)) {
      independentIfLines.add(currentNode.loc?.start?.line || 1);
    }

    if (insideIf &&
        currentNode.type === 'AssignmentExpression') {
      const targetName = extractTargetName(currentNode.left);
      if (isSemanticName(targetName)) {
        addLineToMap(
          semanticAssignments,
          targetName,
          currentNode.loc?.start?.line || 1,
        );
      }
    }

    if (insideIf && currentNode.type === 'ReturnStatement') {
      const semanticKeys = collectSemanticKeysFromObject(currentNode.argument);
      if (semanticKeys.length > 0) {
        semanticReturnCount += 1;
        for (const key of semanticKeys) {
          addLineToMap(
            semanticReturnKeys,
            key,
            currentNode.loc?.start?.line || 1,
          );
        }
      }
    }

    const keys = KEYS[currentNode.type] || [];
    for (const key of keys) {
      const value = currentNode[key];
      if (Array.isArray(value)) {
        for (const child of value) {
          traverse(child, currentNode, [...ancestors, currentNode]);
        }
        continue;
      }
      traverse(value, currentNode, [...ancestors, currentNode]);
    }
  }

  traverse(node.body || node);

  const violations = [];
  const independentIfCount = independentIfLines.size;
  if (independentIfCount < 2) {
    return violations;
  }

  const repeatedTargets = [...semanticAssignments.entries()]
    .filter(([, lines]) => lines.size >= 2)
    .map(([target]) => target)
    .sort();
  if (repeatedTargets.length > 0) {
    violations.push({
      filePath,
      line: Math.min(...independentIfLines),
      column: 1,
      functionName,
      independentIfCount,
      target: repeatedTargets.join(', '),
      kind: VIOLATION_KIND.ASSIGNMENT,
      reason:
        'multiple independent if statements assign the same semantic outcome target',
      ruleReference: RULE_REFERENCE,
    });
  }

  const repeatedReturnKeys = [...semanticReturnKeys.keys()].sort();
  if (semanticReturnCount >= 2 && repeatedReturnKeys.length > 0) {
    violations.push({
      filePath,
      line: Math.min(...independentIfLines),
      column: 1,
      functionName,
      independentIfCount,
      target: repeatedReturnKeys.join(', '),
      kind: VIOLATION_KIND.RETURN,
      reason:
        'multiple independent if statements return semantic outcome objects',
      ruleReference: RULE_REFERENCE,
    });
  }

  return violations;
}

function collectDecisionBoundaryViolationsFromSource(
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
    if (!isFunctionLikeNode(node)) {
      return;
    }
    if (ancestors.some((ancestor) => isFunctionLikeNode(ancestor))) {
      return;
    }
    violations.push(...collectFunctionViolations(node, parent, filePath));
  });

  return violations;
}

async function collectDecisionBoundaryViolations(pathsToScan, options = {}) {
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
      ...collectDecisionBoundaryViolationsFromSource(
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

function formatHumanSummary(report) {
  const lines = [
    `Scanned ${report.scannedFileCount} JavaScript files`,
    `Found ${report.totalViolationCount} decision-boundary guideline violations`,
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

  const report = await collectDecisionBoundaryViolations(pathsToScan, {
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
  collectDecisionBoundaryViolations,
  collectDecisionBoundaryViolationsFromSource,
};
