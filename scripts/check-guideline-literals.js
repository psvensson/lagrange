import {
  FILE_CLASS,
  applyCountBaseline,
  buildGuidelineViolationReport,
  loadCountBaseline,
  writeCountBaseline,
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

const RULE_REFERENCE =
  'system-guidelines.md §4 Scalars, State, And Naming Have Owners';

// JavaScript-language primitives are not domain scalars
// (docs/steering/code-style.md "Constants And Naming"): typeof-comparison
// strings, the empty string, and the structural integers -1/0/1/2 may be
// written literally.
const LOCAL_STR_BINARYEXPRESSION = 'BinaryExpression';
const LOCAL_STR_UNARYEXPRESSION = 'UnaryExpression';
const LOCAL_STR_TYPEOF = 'typeof';
const LOCAL_STR_SWITCHCASE = 'SwitchCase';
const LOCAL_STR_SWITCHSTATEMENT = 'SwitchStatement';
const EQUALITY_OPERATORS = new Set(['===', '!==', '==', '!=']);
const STRUCTURAL_INTEGER_EXEMPTIONS = new Set([0, 1, 2]);

function isTypeofOperand(node) {
  return node?.type === LOCAL_STR_UNARYEXPRESSION &&
    node.operator === LOCAL_STR_TYPEOF;
}

function isTypeofComparisonLiteral(node, parent, ancestors) {
  if (typeof node.value !== LOCAL_STR_STRING) {
    return false;
  }
  if (parent?.type === LOCAL_STR_BINARYEXPRESSION &&
      EQUALITY_OPERATORS.has(parent.operator) &&
      ((parent.left === node && isTypeofOperand(parent.right)) ||
       (parent.right === node && isTypeofOperand(parent.left)))) {
    return true;
  }
  if (parent?.type === LOCAL_STR_SWITCHCASE && parent.test === node) {
    // walkAst ancestors include the direct parent as the last entry, so the
    // enclosing SwitchStatement sits one position earlier.
    const switchStatement = ancestors[ancestors.length - LOCAL_NUM_TWO];
    return switchStatement?.type === LOCAL_STR_SWITCHSTATEMENT &&
      isTypeofOperand(switchStatement.discriminant);
  }
  return false;
}

function isJsLanguagePrimitiveLiteral(node, parent, ancestors) {
  if (typeof node.value === LOCAL_STR_NUMBER) {
    // -1 parses as UnaryExpression('-') around Literal(1), so the negative
    // structural case is covered by exempting the positive literal.
    return STRUCTURAL_INTEGER_EXEMPTIONS.has(node.value);
  }
  if (node.value === '') {
    return true;
  }
  return isTypeofComparisonLiteral(node, parent, ancestors);
}
// 2026-07-28 upward re-anchor: the required CI gate was silently red (the
// static chain died at audit:current-capabilities before this audit ever ran
// on the recent push range), so 499 non-baseline violations landed unmeasured
// on top of the 2006 inherited ones. Baseline re-anchored at the measured
// 2505; refactor target remains the existing idiom (hoist raw literals into
// named constant owners per code-style.md). Decision-log entry:
// solve/epics/self-hosting-circularity-generic-treatment.md (2026-07-28).
const LITERAL_BASELINE_FILE_URL = new URL(
  './check-guideline-literals-baseline.json',
  import.meta.url,
);
const NUMERIC_LITERAL_ZERO = 0;

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
        isJsLanguagePrimitiveLiteral(node, parent, ancestors) ||
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
  // Line/column-independent so routine edits do not resurface inherited
  // literals as new; count-based application still blocks NET growth of the
  // same literal in the same file.
  return JSON.stringify([
    violation.filePath,
    violation.value,
    violation.kind,
  ]);
}

function applyMagicLiteralBaseline(report, baseline) {
  const countBaseline = baseline instanceof Map ?
    baseline :
    new Map([...baseline].map((identity) => [identity, LOCAL_NUM_ONE]));
  return applyCountBaseline(
    report,
    countBaseline,
    buildLiteralViolationIdentity,
  );
}

async function collectMagicLiteralViolationsWithBaseline(
  pathsToScan,
  options = {},
) {
  const [report, baseline] = await Promise.all([
    collectMagicLiteralViolations(pathsToScan, options),
    loadCountBaseline(
      LITERAL_BASELINE_FILE_URL,
      buildLiteralViolationIdentity,
    ),
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

const UPDATE_BASELINE_FLAG = '--update-baseline';

async function main(argv = process.argv.slice(LOCAL_NUM_TWO)) {
  if (argv.includes(UPDATE_BASELINE_FLAG)) {
    const report = await collectMagicLiteralViolations(
      argv.filter((arg) => arg !== UPDATE_BASELINE_FLAG),
      {},
    );
    await writeCountBaseline(
      LITERAL_BASELINE_FILE_URL,
      report,
      'literal-guideline',
    );
    return NUMERIC_LITERAL_ZERO;
  }
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
