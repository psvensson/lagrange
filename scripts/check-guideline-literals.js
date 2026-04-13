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

const RULE_REFERENCE = 'system guidelines.md §4.1 Constants, Not Literals';

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

function formatHumanSummary(report) {
  return formatGuidelineHumanSummary(report, 'literal-guideline');
}

async function main(argv = process.argv.slice(2)) {
  return runGuidelineCheck(
    argv,
    collectMagicLiteralViolations,
    formatHumanSummary,
  );
}

runGuidelineCheckWhenDirect(import.meta.url, main);

export {
  FILE_CLASS,
  RULE_REFERENCE,
  classifyFilePath,
  collectMagicLiteralViolations,
  collectMagicLiteralViolationsFromSource,
};
