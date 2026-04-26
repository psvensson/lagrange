import fs from 'node:fs/promises';

import {
  FILE_CLASS,
  buildGuidelineViolationReport,
  classifyFilePath,
  formatGuidelineHumanSummary,
  parseSourceFile,
  runGuidelineCheck,
  runGuidelineCheckWhenDirect,
  walkAst,
} from './guideline-check-shared.js';
import {SCRIPT_TEXT} from './guideline-check-constants.js';

const RULE_REFERENCE = 'system guidelines.md §4.1 Constants, Not Literals';
const LITERAL_BASELINE_FILE_URL = new URL(
  './check-guideline-literals-baseline.json',
  import.meta.url,
);
const FILE_NOT_FOUND_ERROR_CODE = 'ENOENT';
const NUMERIC_LITERAL_ZERO = 0;
const NUMERIC_LITERAL_ONE = 1;

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
  return buildGuidelineViolationReport(
    pathsToScan,
    options,
    collectMagicLiteralViolationsFromSource,
  );
}

function buildLiteralViolationIdentity(violation) {
  return JSON.stringify([
    violation.filePath,
    violation.line,
    violation.column,
    violation.value,
    violation.kind,
  ]);
}

function summarizeLiteralViolationsByFile(violations) {
  const violationsByFile = new Map();
  for (const violation of violations) {
    const existing = violationsByFile.get(violation.filePath) || [];
    existing.push(violation);
    violationsByFile.set(violation.filePath, existing);
  }
  return [...violationsByFile.entries()]
    .map(([filePath, fileViolations]) => ({
      filePath,
      violationCount: fileViolations.length,
    }))
    .sort((left, right) =>
      right.violationCount - left.violationCount ||
      left.filePath.localeCompare(right.filePath));
}

async function loadMagicLiteralBaseline() {
  try {
    const rawBaseline = await fs.readFile(
      LITERAL_BASELINE_FILE_URL,
      SCRIPT_TEXT.ENCODING_UTF8,
    );
    const parsedBaseline = JSON.parse(rawBaseline);
    return new Set(
      (Array.isArray(parsedBaseline?.violations) ?
        parsedBaseline.violations :
        []).map(buildLiteralViolationIdentity),
    );
  } catch (error) {
    if (error?.code === FILE_NOT_FOUND_ERROR_CODE) {
      return new Set();
    }
    throw error;
  }
}

function applyMagicLiteralBaseline(report, baseline) {
  const newViolations = [];
  let inheritedViolationCount = NUMERIC_LITERAL_ZERO;
  for (const violation of report.violations) {
    if (baseline.has(buildLiteralViolationIdentity(violation))) {
      inheritedViolationCount += NUMERIC_LITERAL_ONE;
      continue;
    }
    newViolations.push(violation);
  }
  return {
    ...report,
    rawViolationCount: report.totalViolationCount,
    inheritedViolationCount,
    baselineViolationCount: baseline.size,
    totalViolationCount: newViolations.length,
    filesWithViolations: summarizeLiteralViolationsByFile(newViolations),
    violations: newViolations,
  };
}

async function collectMagicLiteralViolationsWithBaseline(
  pathsToScan,
  options = {},
) {
  const [report, baseline] = await Promise.all([
    collectMagicLiteralViolations(pathsToScan, options),
    loadMagicLiteralBaseline(),
  ]);
  return applyMagicLiteralBaseline(report, baseline);
}

function formatHumanSummary(report) {
  const summary = formatGuidelineHumanSummary(report, 'new literal-guideline');
  if (!Number.isFinite(report.inheritedViolationCount)) {
    return summary;
  }
  return [
    summary,
    `Matched ${report.inheritedViolationCount} inherited literal-guideline baseline violations`,
  ].join(SCRIPT_TEXT.NEWLINE);
}

async function main(argv = process.argv.slice(2)) {
  return runGuidelineCheck(
    argv,
    collectMagicLiteralViolationsWithBaseline,
    formatHumanSummary,
  );
}

runGuidelineCheckWhenDirect(import.meta.url, main);

export {
  FILE_CLASS,
  RULE_REFERENCE,
  applyMagicLiteralBaseline,
  buildLiteralViolationIdentity,
  classifyFilePath,
  collectMagicLiteralViolations,
  collectMagicLiteralViolationsWithBaseline,
  collectMagicLiteralViolationsFromSource,
};
