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
const LOCAL_STR_1RKTJ = 'exported_literal_outside_constants_owner';
const LOCAL_STR_1R1QC = 'free_floating_number_literal';
const LOCAL_STR_THMXD = 'free_floating_string_literal';
const LOCAL_STR_1E8GB = 'exported literal constant outside canonical constants-owner module';
const LOCAL_STR_B3TUC = 'raw literal outside a named constant owner';
const LOCAL_NUM_TWO = 2;

const RULES_MD = 'docs/steering/rules.md ';
const RULE_REFERENCE =
  `${RULES_MD}R06. Scalars, states and names have owners`;

// JavaScript-language primitives are not domain scalars
// (docs/development/code-style.md "Constants And Naming"): typeof-comparison
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

function isBinaryTypeofComparison(node, parent) {
  if (parent?.type !== LOCAL_STR_BINARYEXPRESSION ||
      !EQUALITY_OPERATORS.has(parent.operator)) {
    return false;
  }
  return (parent.left === node && isTypeofOperand(parent.right)) ||
    (parent.right === node && isTypeofOperand(parent.left));
}

function isSwitchCaseTypeofComparison(node, parent, ancestors) {
  if (parent?.type !== LOCAL_STR_SWITCHCASE || parent.test !== node) {
    return false;
  }
  // walkAst ancestors include the direct parent as the last entry, so the
  // enclosing SwitchStatement sits one position earlier.
  const switchStatement = ancestors[ancestors.length - LOCAL_NUM_TWO];
  return switchStatement?.type === LOCAL_STR_SWITCHSTATEMENT &&
    isTypeofOperand(switchStatement.discriminant);
}

function isTypeofComparisonLiteral(node, parent, ancestors) {
  if (typeof node.value !== LOCAL_STR_STRING) {
    return false;
  }
  return isBinaryTypeofComparison(node, parent) ||
    isSwitchCaseTypeofComparison(node, parent, ancestors);
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
//
// 2026-11-17 checker-measurement repair re-anchor (code-style.md & release-gate.md):
// findConstDeclarationContext previously crossed function/arrow/method/class
// boundaries into outer const declarations and exempted calculated runtime local
// const initializers (e.g. `const retryDelayMs = value > 0 ? value : 250;`).
// Independently verified on pinned base 540418614772acc8c5c82be8d8cf6b0ecbe32ef3
// (1,233 -> 4,824 raw violations before script witness cleanup; 4,752 after
// hoisting 72 raw literal occurrences across scripts/checks/apparatus-release-
// consolidation-budget.js and scripts/lab/{lagrange-lab,probe}.js; tightened
// 4,752 -> 4,729 upon candidate integration after sibling repairs retired 23
// additional baseline entries).
const LITERAL_BASELINE_FILENAME = './check-guideline-literals-baseline.json';
const LITERAL_BASELINE_FILE_URL = new URL(
  LITERAL_BASELINE_FILENAME,
  import.meta.url,
);
const NUMERIC_LITERAL_ZERO = 0;
const NEW_LITERAL_VIOLATION_LABEL = 'new literal-guideline';

const SCOPE_BOUNDARY_NODE_TYPES = new Set([
  'ArrowFunctionExpression',
  'ClassDeclaration',
  'ClassExpression',
  'FunctionDeclaration',
  'FunctionExpression',
  'StaticBlock',
]);

const CONSTANT_UNARY_OPERATORS = new Set(['-', '+', '!', '~']);
const CONSTANT_BINARY_OPERATORS = new Set([
  '+',
  '-',
  '*',
  '/',
  '%',
  '**',
  '<<',
  '>>',
  '>>>',
  '|',
  '&',
  '^',
]);
const CONSTANT_COLLECTION_CONSTRUCTORS = new Set(['Set', 'Map']);
const TOP_LEVEL_RUNTIME_BRANCH_NODES = new Set([
  'AwaitExpression',
  'ConditionalExpression',
  'LogicalExpression',
]);
const UPPER_SNAKE_CASE_PATTERN = /^[A-Z][A-Z0-9_]*$/u;
const OBJECT_GLOBAL_NAME = 'Object';
const OBJECT_FREEZE_METHOD = 'freeze';
const BUFFER_GLOBAL_NAME = 'Buffer';
const BUFFER_FROM_METHOD = 'from';
const PROPERTY_INIT_KIND = 'init';
const BINARY_EXPRESSION_NODE = 'BinaryExpression';
const UNARY_EXPRESSION_NODE = 'UnaryExpression';
const ARRAY_EXPRESSION_NODE = 'ArrayExpression';
const OBJECT_EXPRESSION_NODE = 'ObjectExpression';
const SPREAD_ELEMENT_NODE = 'SpreadElement';
const NEW_EXPRESSION_NODE = 'NewExpression';
const TEMPLATE_LITERAL_NODE = 'TemplateLiteral';
const IMPORT_EXPRESSION_NODE = 'ImportExpression';
const OBJECT_PATTERN_NODE = 'ObjectPattern';
const PROGRAM_NODE = 'Program';
const EXPORT_NAMED_NODE = 'ExportNamedDeclaration';
const VARIABLE_DECLARATION_NODE = 'VariableDeclaration';
const VARIABLE_DECLARATOR_NODE = 'VariableDeclarator';
const IDENTIFIER_NODE = 'Identifier';
const MEMBER_EXPRESSION_NODE = 'MemberExpression';
const CALL_EXPRESSION_NODE = 'CallExpression';
const LITERAL_NODE = 'Literal';
const PROPERTY_NODE = 'Property';
const CONST_KIND = 'const';
const BUFFER_FROM_MAX_ARGS = 2;

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
    (parent?.type === IMPORT_EXPRESSION_NODE && parent.source === node) ||
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

function isStaticMember(expression, objectName, propertyName) {
  return expression?.type === MEMBER_EXPRESSION_NODE &&
    expression.computed !== true &&
    expression.object?.type === IDENTIFIER_NODE &&
    expression.object.name === objectName &&
    expression.property?.type === IDENTIFIER_NODE &&
    expression.property.name === propertyName;
}

function isUpperSnakeConstantReference(expression) {
  if (expression?.type === IDENTIFIER_NODE) {
    return UPPER_SNAKE_CASE_PATTERN.test(expression.name);
  }
  if (expression?.type === MEMBER_EXPRESSION_NODE &&
      expression.computed !== true &&
      expression.property?.type === IDENTIFIER_NODE) {
    return isUpperSnakeConstantReference(expression.object);
  }
  return false;
}

function isFreezeAliasProperty(property) {
  return property?.type === PROPERTY_NODE &&
    property.computed !== true &&
    property.key?.type === IDENTIFIER_NODE &&
    property.key.name === OBJECT_FREEZE_METHOD &&
    property.value?.type === IDENTIFIER_NODE;
}

function collectDestructuredFreezeAliases(declarator, aliases) {
  if (declarator.id?.type !== OBJECT_PATTERN_NODE ||
      declarator.init?.type !== IDENTIFIER_NODE ||
      declarator.init.name !== OBJECT_GLOBAL_NAME) {
    return;
  }
  for (const property of declarator.id.properties || []) {
    if (isFreezeAliasProperty(property)) {
      aliases.add(property.value.name);
    }
  }
}

function collectDeclarationFreezeAliases(statement, aliases) {
  const declaration = statement?.type === EXPORT_NAMED_NODE ?
    statement.declaration :
    statement;
  if (declaration?.type !== VARIABLE_DECLARATION_NODE ||
      declaration.kind !== CONST_KIND) {
    return;
  }
  for (const declarator of declaration.declarations || []) {
    if (declarator.id?.type === IDENTIFIER_NODE &&
        isStaticMember(declarator.init, OBJECT_GLOBAL_NAME, OBJECT_FREEZE_METHOD)) {
      aliases.add(declarator.id.name);
      continue;
    }
    collectDestructuredFreezeAliases(declarator, aliases);
  }
}

/**
 * Collect top-level const identifiers initialized directly to Object.freeze
 * (for modules avoiding direct ambient intrinsics).
 */
function collectObjectFreezeAliases(ast) {
  const aliases = new Set();
  for (const statement of ast?.body || []) {
    collectDeclarationFreezeAliases(statement, aliases);
  }
  return aliases;
}

function isObjectFreezeCall(expression, freezeAliases) {
  if (expression?.type !== CALL_EXPRESSION_NODE ||
      expression.arguments.length !== LOCAL_NUM_ONE) {
    return false;
  }
  if (isStaticMember(
    expression.callee,
    OBJECT_GLOBAL_NAME,
    OBJECT_FREEZE_METHOD,
  )) {
    return true;
  }
  return expression.callee?.type === IDENTIFIER_NODE &&
    freezeAliases.has(expression.callee.name);
}

function isConstantCollectionNew(expression) {
  return expression?.type === NEW_EXPRESSION_NODE &&
    expression.callee?.type === IDENTIFIER_NODE &&
    CONSTANT_COLLECTION_CONSTRUCTORS.has(expression.callee.name) &&
    expression.arguments.length <= LOCAL_NUM_ONE;
}

function isStaticBufferFromCall(expression, freezeAliases) {
  if (expression?.type !== CALL_EXPRESSION_NODE ||
      !isStaticMember(expression.callee, BUFFER_GLOBAL_NAME, BUFFER_FROM_METHOD)) {
    return false;
  }
  const argCount = expression.arguments.length;
  return argCount >= LOCAL_NUM_ONE &&
    argCount <= BUFFER_FROM_MAX_ARGS &&
    expression.arguments.every((argument) =>
      isStaticConstantExpression(argument, freezeAliases));
}

function isStaticArrayElement(element, freezeAliases) {
  if (!element) {
    return false;
  }
  if (element.type === SPREAD_ELEMENT_NODE) {
    return isStaticConstantExpression(element.argument, freezeAliases);
  }
  return isStaticConstantExpression(element, freezeAliases);
}

function isStaticObjectProperty(property, freezeAliases) {
  if (property?.type === SPREAD_ELEMENT_NODE) {
    return isStaticConstantExpression(property.argument, freezeAliases);
  }
  if (property?.type !== PROPERTY_NODE || property.kind !== PROPERTY_INIT_KIND) {
    return false;
  }
  if (property.computed === true &&
      !isStaticConstantExpression(property.key, freezeAliases)) {
    return false;
  }
  return isStaticConstantExpression(property.value, freezeAliases);
}

function isStaticCallExpression(expression, freezeAliases) {
  if (isObjectFreezeCall(expression, freezeAliases)) {
    return isStaticConstantExpression(expression.arguments[0], freezeAliases);
  }
  return isStaticBufferFromCall(expression, freezeAliases);
}

function isStaticNewExpression(expression, freezeAliases) {
  if (!isConstantCollectionNew(expression)) {
    return false;
  }
  return expression.arguments.length === NUMERIC_LITERAL_ZERO ||
    isStaticConstantExpression(expression.arguments[0], freezeAliases);
}

const STATIC_EXPRESSION_EVALUATORS = Object.freeze(new Map([
  [LITERAL_NODE, () => true],
  [UNARY_EXPRESSION_NODE, (expression, freezeAliases) =>
    CONSTANT_UNARY_OPERATORS.has(expression.operator) &&
    isStaticConstantExpression(expression.argument, freezeAliases)],
  [BINARY_EXPRESSION_NODE, (expression, freezeAliases) =>
    CONSTANT_BINARY_OPERATORS.has(expression.operator) &&
    isStaticConstantExpression(expression.left, freezeAliases) &&
    isStaticConstantExpression(expression.right, freezeAliases)],
  [TEMPLATE_LITERAL_NODE, (expression, freezeAliases) =>
    expression.expressions.every((embedded) =>
      isStaticConstantExpression(embedded, freezeAliases))],
  [ARRAY_EXPRESSION_NODE, (expression, freezeAliases) =>
    expression.elements.every((element) =>
      isStaticArrayElement(element, freezeAliases))],
  [OBJECT_EXPRESSION_NODE, (expression, freezeAliases) =>
    expression.properties.every((property) =>
      isStaticObjectProperty(property, freezeAliases))],
  [CALL_EXPRESSION_NODE, isStaticCallExpression],
  [NEW_EXPRESSION_NODE, isStaticNewExpression],
]));

/**
 * Determine whether a local const initializer defines a static constant or
 * frozen table rather than a calculated runtime local variable.
 */
function isStaticConstantExpression(expression, freezeAliases) {
  if (!expression) {
    return false;
  }
  if (isUpperSnakeConstantReference(expression)) {
    return true;
  }
  const evaluator = STATIC_EXPRESSION_EVALUATORS.get(expression.type);
  return evaluator ? evaluator(expression, freezeAliases) : false;
}

function isModuleTopLevelDeclaration(ancestors, declaratorIndex, exported) {
  const declarationIndex = declaratorIndex - LOCAL_NUM_ONE;
  const statementIndex = exported ?
    declarationIndex - LOCAL_NUM_ONE :
    declarationIndex;
  return statementIndex === LOCAL_NUM_ONE &&
    ancestors[0]?.type === PROGRAM_NODE;
}

function hasTopLevelRuntimeBranchOnPath(ancestors, declaratorIndex) {
  for (let index = declaratorIndex + LOCAL_NUM_ONE;
    index < ancestors.length; index += LOCAL_NUM_ONE) {
    if (TOP_LEVEL_RUNTIME_BRANCH_NODES.has(ancestors[index]?.type)) {
      return true;
    }
  }
  return false;
}

function resolveConstDeclarator(
  declarator,
  declaratorIndex,
  node,
  ancestors,
  freezeAliases,
) {
  const declaration = ancestors[declaratorIndex - 1];
  const exportDeclaration = ancestors[declaratorIndex - LOCAL_NUM_TWO];
  const initChild = declaratorIndex === ancestors.length - LOCAL_NUM_ONE ?
    node :
    ancestors[declaratorIndex + LOCAL_NUM_ONE];
  if (declaration?.type !== VARIABLE_DECLARATION_NODE ||
      declaration.kind !== CONST_KIND ||
      declarator.id?.type !== IDENTIFIER_NODE ||
      declarator.init !== initChild) {
    return null;
  }
  const exported = exportDeclaration?.type === EXPORT_NAMED_NODE;
  const isTopLevel = isModuleTopLevelDeclaration(
    ancestors,
    declaratorIndex,
    exported,
  );
  const isConstantInit = isTopLevel ?
    !hasTopLevelRuntimeBranchOnPath(ancestors, declaratorIndex) :
    isStaticConstantExpression(declarator.init, freezeAliases);
  return isConstantInit ? {declaration, declarator, exported} : null;
}

/**
 * Resolve an enclosing named-constant declaration without crossing scope
 * boundaries or exempting runtime-calculated local initializers.
 */
function findConstDeclarationContext(node, ancestors, freezeAliases) {
  for (let index = ancestors.length - LOCAL_NUM_ONE;
    index >= LOCAL_NUM_ZERO; index -= LOCAL_NUM_ONE) {
    const ancestor = ancestors[index];
    if (SCOPE_BOUNDARY_NODE_TYPES.has(ancestor?.type)) {
      return null;
    }
    if (ancestor?.type === VARIABLE_DECLARATOR_NODE) {
      return resolveConstDeclarator(
        ancestor,
        index,
        node,
        ancestors,
        freezeAliases,
      );
    }
  }
  return null;
}

function shouldIgnoreBecauseNamedConstant(
  node,
  ancestors,
  fileClass,
  freezeAliases,
) {
  const context = findConstDeclarationContext(node, ancestors, freezeAliases);
  if (!context) {
    return false;
  }
  if (fileClass === FILE_CLASS.TEST ||
      fileClass === FILE_CLASS.CONSTANTS_OWNER) {
    return true;
  }
  return context.exported !== true;
}

function buildViolationKind(node, ancestors, fileClass, freezeAliases) {
  const context = findConstDeclarationContext(node, ancestors, freezeAliases);
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

function isExemptLiteral(node, parent, ancestors, fileClass, freezeAliases) {
  return isDirectiveLiteral(node, parent, ancestors) ||
    isModuleSourceLiteral(node, parent) ||
    isObjectKeyLiteral(node, parent) ||
    isParseIntRadixLiteral(node, parent) ||
    isJsLanguagePrimitiveLiteral(node, parent, ancestors) ||
    shouldIgnoreBecauseNamedConstant(
      node,
      ancestors,
      fileClass,
      freezeAliases,
    );
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
  const freezeAliases = collectObjectFreezeAliases(ast);
  const violations = [];

  walkAst(ast, (node, parent, ancestors) => {
    if (!isLiteralNode(node)) {
      return;
    }
    if (isExemptLiteral(node, parent, ancestors, fileClass, freezeAliases)) {
      return;
    }

    const kind = buildViolationKind(node, ancestors, fileClass, freezeAliases);
    violations.push({
      filePath,
      line: node.loc?.start?.line || LOCAL_NUM_ONE,
      column: node.loc?.start?.column + LOCAL_NUM_ONE || LOCAL_NUM_ONE,
      value: String(node.raw ?? node.value),
      kind,
      reason: buildViolationReason(kind),
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
  const summary = formatGuidelineHumanSummary(
    report,
    NEW_LITERAL_VIOLATION_LABEL,
  );
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
