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

function createViolationEvidence() {
  return {
    independentIfLines: new Set(),
    semanticAssignments: new Map(),
    semanticReturnKeys: new Map(),
    semanticReturnCount: 0,
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
    currentNode.loc?.start?.line || 1,
  );
}

function collectReturnEvidence(currentNode, evidence) {
  const semanticKeys = collectSemanticKeysFromObject(currentNode.argument);
  if (semanticKeys.length === 0) {
    return;
  }

  evidence.semanticReturnCount += 1;
  for (const key of semanticKeys) {
    addLineToMap(
      evidence.semanticReturnKeys,
      key,
      currentNode.loc?.start?.line || 1,
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
  if (!currentNode || typeof currentNode.type !== 'string') {
    return;
  }
  if (currentNode !== functionNode && isFunctionLikeNode(currentNode)) {
    return;
  }

  const insideIf = ancestors.some((ancestor) => ancestor.type === 'IfStatement');
  if (currentNode.type === 'IfStatement' &&
      !isElseIfBranch(currentNode, currentParent)) {
    evidence.independentIfLines.add(currentNode.loc?.start?.line || 1);
  }

  if (insideIf && currentNode.type === 'AssignmentExpression') {
    collectAssignmentEvidence(currentNode, evidence);
  }
  if (insideIf && currentNode.type === 'ReturnStatement') {
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
  if (independentIfCount < 2) {
    return violations;
  }

  const repeatedTargets = [...evidence.semanticAssignments.entries()]
    .filter(([, lines]) => lines.size >= 2)
    .map(([target]) => target)
    .sort();
  if (repeatedTargets.length > 0) {
    violations.push({
      filePath,
      line: Math.min(...evidence.independentIfLines),
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

  const repeatedReturnKeys = [...evidence.semanticReturnKeys.keys()].sort();
  if (evidence.semanticReturnCount >= 2 && repeatedReturnKeys.length > 0) {
    violations.push({
      filePath,
      line: Math.min(...evidence.independentIfLines),
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
  return buildGuidelineViolationReport(
    pathsToScan,
    options,
    collectDecisionBoundaryViolationsFromSource,
  );
}

function formatHumanSummary(report) {
  return formatGuidelineHumanSummary(
    report,
    'decision-boundary guideline',
  );
}

async function main(argv = process.argv.slice(2)) {
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
