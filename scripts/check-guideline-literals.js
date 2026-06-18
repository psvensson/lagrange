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

const LOCAL_STR_LITERAL = 'Literal';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_NUMBER = 'number';
const LOCAL_STR_FGIQ5 = 'ExpressionStatement';
const LOCAL_STR_PROGRAM = 'Program';
const LOCAL_STR_IMPORTDECLARATION = 'ImportDeclaration';
const LOCAL_STR_ASBFD = 'ExportAllDeclaration';
const LOCAL_STR_1067J = 'ExportNamedDeclaration';
const LOCAL_STR_PROPERTY = 'Property';
const LOCAL_STR_METHODDEFINITION = 'MethodDefinition';
const LOCAL_STR_PROPERTYDEFINITION = 'PropertyDefinition';
const LOCAL_STR_CALLEXPRESSION = 'CallExpression';
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_IDENTIFIER = 'Identifier';
const LOCAL_STR_PARSEINT = 'parseInt';
const LOCAL_STR_MEMBEREXPRESSION = 'MemberExpression';
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_VARIABLEDECLARATOR = 'VariableDeclarator';
const LOCAL_STR_1QEZR = 'VariableDeclaration';
const LOCAL_STR_CONST = 'const';
const LOCAL_STR_1RKTJ = 'exported_literal_outside_constants_owner';
const LOCAL_STR_1R1QC = 'free_floating_number_literal';
const LOCAL_STR_THMXD = 'free_floating_string_literal';
const LOCAL_STR_1E8GB = 'exported literal constant outside canonical constants-owner module';
const LOCAL_STR_B3TUC = 'raw literal outside a named constant owner';
const LOCAL_NUM_TWO = 2;

const RULE_REFERENCE = 'system guidelines.md §4.1 Constants, Not Literals';
const LITERAL_BASELINE_FILE_URL = new URL(
  './check-guideline-literals-baseline.json',
  import.meta.url,
);
const FILE_NOT_FOUND_ERROR_CODE = 'ENOENT';
const NUMERIC_LITERAL_ZERO = 0;
const NUMERIC_LITERAL_ONE = 1;

function isLiteralNode(node) {
  return node?.type === LOCAL_STR_LITERAL &&
    (typeof node.value === LOCAL_STR_STRING || typeof node.value === LOCAL_STR_NUMBER);
}

function isDirectiveLiteral(node, parent, ancestors) {
  const grandparent = ancestors[ancestors.length - 1];
  return parent?.type === LOCAL_STR_FGIQ5 &&
    grandparent?.type === LOCAL_STR_PROGRAM &&
    typeof parent.directive === LOCAL_STR_STRING;
}

function isModuleSourceLiteral(node, parent) {
  return (
    (parent?.type === LOCAL_STR_IMPORTDECLARATION && parent.source === node) ||
    (parent?.type === LOCAL_STR_ASBFD && parent.source === node) ||
    (parent?.type === LOCAL_STR_1067J && parent.source === node)
  );
}

function isObjectKeyLiteral(node, parent) {
  return (
    (parent?.type === LOCAL_STR_PROPERTY && parent.key === node && parent.computed !== true) ||
    (parent?.type === LOCAL_STR_METHODDEFINITION && parent.key === node &&
      parent.computed !== true) ||
    (parent?.type === LOCAL_STR_PROPERTYDEFINITION && parent.key === node &&
      parent.computed !== true)
  );
}

function isParseIntRadixLiteral(node, parent) {
  if (parent?.type !== LOCAL_STR_CALLEXPRESSION || parent.arguments[LOCAL_NUM_ONE] !== node) {
    return false;
  }
  if (parent.callee?.type === LOCAL_STR_IDENTIFIER && parent.callee.name === LOCAL_STR_PARSEINT) {
    return true;
  }
  return parent.callee?.type === LOCAL_STR_MEMBEREXPRESSION &&
    parent.callee.property?.type === LOCAL_STR_IDENTIFIER &&
    parent.callee.property.name === LOCAL_STR_PARSEINT;
}

function findConstDeclarationContext(ancestors) {
  for (let index = ancestors.length - LOCAL_NUM_ONE;
    index >= LOCAL_NUM_ZERO; index -= LOCAL_NUM_ONE) {
    const ancestor = ancestors[index];
    if (ancestor?.type === LOCAL_STR_VARIABLEDECLARATOR) {
      const declaration = ancestors[index - 1];
      const exportDeclaration = ancestors[index - 2];
      if (declaration?.type !== LOCAL_STR_1QEZR ||
          declaration.kind !== LOCAL_STR_CONST ||
          ancestor.id?.type !== LOCAL_STR_IDENTIFIER) {
        return null;
      }
      return {
        declaration,
        declarator: ancestor,
        exported: exportDeclaration?.type === LOCAL_STR_1067J,
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
    return LOCAL_STR_1RKTJ;
  }
  return typeof node.value === LOCAL_STR_NUMBER ?
    LOCAL_STR_1R1QC :
    LOCAL_STR_THMXD;
}

function buildViolationReason(kind) {
  if (kind === LOCAL_STR_1RKTJ) {
    return LOCAL_STR_1E8GB;
  }
  return LOCAL_STR_B3TUC;
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
      line: node.loc?.start?.line || LOCAL_NUM_ONE,
      column: node.loc?.start?.column + LOCAL_NUM_ONE || LOCAL_NUM_ONE,
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

async function main(argv = process.argv.slice(LOCAL_NUM_TWO)) {
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
