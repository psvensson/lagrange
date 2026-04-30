import {KEYS} from 'eslint-visitor-keys';
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

const LOCAL_STR_IFSTATEMENT = 'IfStatement';
const LOCAL_STR_IDENTIFIER = 'Identifier';
const LOCAL_STR_VARIABLEDECLARATOR = 'VariableDeclarator';
const LOCAL_STR_PROPERTY = 'Property';
const LOCAL_STR_METHODDEFINITION = 'MethodDefinition';
const LOCAL_STR_LITERAL = 'Literal';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_ANONYMOUS = '<anonymous>';
const LOCAL_STR_MEMBEREXPRESSION = 'MemberExpression';
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_OBJECTEXPRESSION = 'ObjectExpression';
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_1NCMF = 'AssignmentExpression';
const LOCAL_STR_RETURNSTATEMENT = 'ReturnStatement';
const LOCAL_NUM_TWO = 2;
const LOCAL_STR_128KJ = ', ';
const LOCAL_STR_1JNGK = 'multiple independent if statements assign the same semantic outcome target';
const LOCAL_STR_1MBIR = 'multiple independent if statements return semantic outcome objects';
const LOCAL_STR_1PNFN = 'decision-boundary guideline';

const RULE_REFERENCE =
  'system guidelines.md §4.1.1 Semantic Decision Boundaries Must Use Explicit State Models';

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

function isFunctionLikeNode(node) {
  return [
    FUNCTION_TYPE.ARROW,
    FUNCTION_TYPE.DECLARATION,
    FUNCTION_TYPE.EXPRESSION,
  ].includes(node?.type);
}

function isElseIfBranch(node, parent) {
  return parent?.type === LOCAL_STR_IFSTATEMENT && parent.alternate === node;
}

function getFunctionName(node, parent) {
  if (node.id?.type === LOCAL_STR_IDENTIFIER) {
    return node.id.name;
  }
  if (parent?.type === LOCAL_STR_VARIABLEDECLARATOR &&
      parent.id?.type === LOCAL_STR_IDENTIFIER) {
    return parent.id.name;
  }
  if ((parent?.type === LOCAL_STR_PROPERTY || parent?.type === LOCAL_STR_METHODDEFINITION) &&
      parent.key) {
    if (parent.key.type === LOCAL_STR_IDENTIFIER) {
      return parent.key.name;
    }
    if (parent.key.type === LOCAL_STR_LITERAL && typeof parent.key.value === LOCAL_STR_STRING) {
      return parent.key.value;
    }
  }
  return LOCAL_STR_ANONYMOUS;
}

function extractTargetName(node) {
  if (!node) {
    return null;
  }
  if (node.type === LOCAL_STR_IDENTIFIER) {
    return node.name;
  }
  if (node.type === LOCAL_STR_MEMBEREXPRESSION) {
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
  if (typeof name !== LOCAL_STR_STRING || name.length === LOCAL_NUM_ZERO) {
    return false;
  }
  const normalized = name.toLowerCase();
  return SEMANTIC_NAME_PART.some((part) => normalized.includes(part));
}

function collectSemanticKeysFromObject(node) {
  if (node?.type !== LOCAL_STR_OBJECTEXPRESSION) {
    return [];
  }
  const keys = [];
  for (const property of node.properties || []) {
    if (property.type !== LOCAL_STR_PROPERTY || property.computed === true) {
      continue;
    }
    let keyName = null;
    if (property.key?.type === LOCAL_STR_IDENTIFIER) {
      keyName = property.key.name;
    } else if (property.key?.type === LOCAL_STR_LITERAL &&
      typeof property.key.value === LOCAL_STR_STRING) {
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

function createViolationEvidence() {
  return {
    independentIfLines: new Set(),
    semanticAssignments: new Map(),
    semanticReturnKeys: new Map(),
    semanticReturnCount: LOCAL_NUM_ZERO,
  };
}

function collectAssignmentEvidence(currentNode, evidence) {
  const targetName = extractTargetName(currentNode.left);
  if (!isSemanticName(targetName)) {
    return;
  }

  addLineToMap(
    evidence.semanticAssignments,
    targetName,
    currentNode.loc?.start?.line || LOCAL_NUM_ONE,
  );
}

function collectReturnEvidence(currentNode, evidence) {
  const semanticKeys = collectSemanticKeysFromObject(currentNode.argument);
  if (semanticKeys.length === LOCAL_NUM_ZERO) {
    return;
  }

  evidence.semanticReturnCount += LOCAL_NUM_ONE;
  for (const key of semanticKeys) {
    addLineToMap(
      evidence.semanticReturnKeys,
      key,
      currentNode.loc?.start?.line || LOCAL_NUM_ONE,
    );
  }
}

function traverseFunctionEvidence(
  functionNode,
  currentNode,
  currentParent,
  ancestors,
  evidence,
) {
  if (!currentNode || typeof currentNode.type !== LOCAL_STR_STRING) {
    return;
  }
  if (currentNode !== functionNode && isFunctionLikeNode(currentNode)) {
    return;
  }

  const insideIf = ancestors.some((ancestor) => ancestor.type === 'IfStatement');
  if (currentNode.type === LOCAL_STR_IFSTATEMENT &&
      !isElseIfBranch(currentNode, currentParent)) {
    evidence.independentIfLines.add(currentNode.loc?.start?.line || LOCAL_NUM_ONE);
  }

  if (insideIf && currentNode.type === LOCAL_STR_1NCMF) {
    collectAssignmentEvidence(currentNode, evidence);
  }
  if (insideIf && currentNode.type === LOCAL_STR_RETURNSTATEMENT) {
    collectReturnEvidence(currentNode, evidence);
  }

  const nextAncestors = [...ancestors, currentNode];
  const keys = KEYS[currentNode.type] || [];
  for (const key of keys) {
    const value = currentNode[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        traverseFunctionEvidence(
          functionNode,
          child,
          currentNode,
          nextAncestors,
          evidence,
        );
      }
      continue;
    }
    traverseFunctionEvidence(
      functionNode,
      value,
      currentNode,
      nextAncestors,
      evidence,
    );
  }
}

function collectFunctionViolations(node, parent, filePath) {
  const functionName = getFunctionName(node, parent);
  const evidence = createViolationEvidence();
  traverseFunctionEvidence(node, node.body || node, null, [], evidence);

  const violations = [];
  const independentIfCount = evidence.independentIfLines.size;
  if (independentIfCount < LOCAL_NUM_TWO) {
    return violations;
  }

  const repeatedTargets = [...evidence.semanticAssignments.entries()]
    .filter(([, lines]) => lines.size >= 2)
    .map(([target]) => target)
    .sort();
  if (repeatedTargets.length > LOCAL_NUM_ZERO) {
    violations.push({
      filePath,
      line: Math.min(...evidence.independentIfLines),
      column: LOCAL_NUM_ONE,
      functionName,
      independentIfCount,
      target: repeatedTargets.join(LOCAL_STR_128KJ),
      kind: VIOLATION_KIND.ASSIGNMENT,
      reason:
        LOCAL_STR_1JNGK,
      ruleReference: RULE_REFERENCE,
    });
  }

  const repeatedReturnKeys = [...evidence.semanticReturnKeys.keys()].sort();
  if (evidence.semanticReturnCount >= LOCAL_NUM_TWO && repeatedReturnKeys.length > LOCAL_NUM_ZERO) {
    violations.push({
      filePath,
      line: Math.min(...evidence.independentIfLines),
      column: LOCAL_NUM_ONE,
      functionName,
      independentIfCount,
      target: repeatedReturnKeys.join(LOCAL_STR_128KJ),
      kind: VIOLATION_KIND.RETURN,
      reason:
        LOCAL_STR_1MBIR,
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
  return buildGuidelineViolationReport(
    pathsToScan,
    options,
    collectDecisionBoundaryViolationsFromSource,
  );
}

function formatHumanSummary(report) {
  return formatGuidelineHumanSummary(
    report,
    LOCAL_STR_1PNFN,
  );
}

async function main(argv = process.argv.slice(LOCAL_NUM_TWO)) {
  return runGuidelineCheck(
    argv,
    collectDecisionBoundaryViolations,
    formatHumanSummary,
  );
}

runGuidelineCheckWhenDirect(import.meta.url, main);

export {
  FILE_CLASS,
  RULE_REFERENCE,
  classifyFilePath,
  collectDecisionBoundaryViolations,
  collectDecisionBoundaryViolationsFromSource,
};
