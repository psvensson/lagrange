import fs from 'node:fs/promises';
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
  RAW_NULL_OR_EMPTY_STATE: 'raw_null_empty_state_outcome',
  MIXED_CACHE_AND_SQL: 'mixed_cache_and_sql_decision',
  SCHEMA_UNSAFE_WRITE: 'schema_unsafe_system_table_write',
  LOCAL_RETRY_LOOP: 'local_retry_loop',
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
  'propagation',
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

function checkRawNullOrEmptyState(node, functionName, filePath, violations) {
  if (node.type === 'AssignmentExpression' || node.type === 'VariableDeclarator') {
    const targetNode = node.type === 'AssignmentExpression' ? node.left : node.id;
    const valueNode = node.type === 'AssignmentExpression' ? node.right : node.init;
    const targetName = extractTargetName(targetNode);
    if (isSemanticName(targetName) && valueNode) {
      if (
        (valueNode.type === 'Literal' && valueNode.value === null) ||
        (valueNode.type === 'Identifier' && valueNode.name === 'undefined') ||
        (valueNode.type === 'ArrayExpression' && valueNode.elements.length === 0)
      ) {
        violations.push({
          filePath,
          line: node.loc?.start?.line || 1,
          column: node.loc?.start?.column + 1 || 1,
          functionName,
          kind: VIOLATION_KIND.RAW_NULL_OR_EMPTY_STATE,
          reason: `raw null or empty-state outcome assigned/declared for semantic target "${targetName}"`,
          ruleReference: 'system guidelines.md §4.5 Raw null or undefined must not encode runtime state',
        });
      }
    }
  } else if (node.type === 'ReturnStatement') {
    if (isSemanticName(functionName)) {
      const arg = node.argument;
      if (
        arg &&
        ((arg.type === 'Literal' && arg.value === null) ||
         (arg.type === 'Identifier' && arg.name === 'undefined') ||
         (arg.type === 'ArrayExpression' && arg.elements.length === 0))
      ) {
        violations.push({
          filePath,
          line: node.loc?.start?.line || 1,
          column: node.loc?.start?.column + 1 || 1,
          functionName,
          kind: VIOLATION_KIND.RAW_NULL_OR_EMPTY_STATE,
          reason: 'raw null or empty-state outcome returned for semantic target',
          ruleReference: 'system guidelines.md §4.5 Raw null or undefined must not encode runtime state',
        });
      }
    }
    if (node.argument?.type === 'ObjectExpression') {
      for (const prop of node.argument.properties || []) {
        if (prop.type !== 'Property' || prop.computed === true) {
          continue;
        }
        let keyName = null;
        if (prop.key?.type === 'Identifier') {
          keyName = prop.key.name;
        } else if (prop.key?.type === 'Literal' && typeof prop.key.value === 'string') {
          keyName = prop.key.value;
        }
        if (isSemanticName(keyName)) {
          const val = prop.value;
          if (
            val &&
            ((val.type === 'Literal' && val.value === null) ||
             (val.type === 'Identifier' && val.name === 'undefined') ||
             (val.type === 'ArrayExpression' && val.elements.length === 0))
          ) {
            violations.push({
              filePath,
              line: prop.loc?.start?.line || node.loc?.start?.line || 1,
              column: prop.loc?.start?.column + 1 || node.loc?.start?.column + 1 || 1,
              functionName,
              kind: VIOLATION_KIND.RAW_NULL_OR_EMPTY_STATE,
              reason: `semantic outcome object property "${keyName}" has raw null or empty-state value`,
              ruleReference: 'system guidelines.md §4.5 Raw null or undefined must not encode runtime state',
            });
          }
        }
      }
    }
  }
}

function checkMixedCacheAndSqlDecision(node, functionName, filePath, fileClass, violations) {
  if (fileClass !== FILE_CLASS.RUNTIME) {
    return;
  }
  let hasCacheAccess = false;
  let hasSqlAccess = false;
  let cacheLine = null;
  let sqlLine = null;

  walkAst(node.body || node, (child) => {
    if (child.type === 'Identifier') {
      const name = child.name.toLowerCase();
      if (name.includes('cache')) {
        hasCacheAccess = true;
        cacheLine = child.loc?.start?.line;
      }
      if (name.includes('sql') || name.includes('db') || name.includes('query') || name.includes('execute')) {
        hasSqlAccess = true;
        sqlLine = child.loc?.start?.line;
      }
    }
  });

  if (hasCacheAccess && hasSqlAccess) {
    violations.push({
      filePath,
      line: cacheLine || node.loc?.start?.line || 1,
      column: 1,
      functionName,
      kind: VIOLATION_KIND.MIXED_CACHE_AND_SQL,
      reason: `decision branch mixes cache (line ${cacheLine}) and SQL/DB (line ${sqlLine}) as equivalent truth for one meaning`,
      ruleReference: 'system guidelines.md §3 One Path Per Semantic Decision (Mixed cache and SQL)',
    });
  }
}

function checkSchemaUnsafeWrite(node, filePath, violations) {
  if (node.type === 'Literal' && typeof node.value === 'string') {
    if (/\b(?:INSERT\s+OR\s+REPLACE|REPLACE\s+INTO)\b/iu.test(node.value)) {
      violations.push({
        filePath,
        line: node.loc?.start?.line || 1,
        column: node.loc?.start?.column + 1 || 1,
        kind: VIOLATION_KIND.SCHEMA_UNSAFE_WRITE,
        reason: 'INSERT OR REPLACE or full-row replacement is forbidden for steady-state lifecycle/status mutation of existing system rows',
        ruleReference: 'system guidelines.md §6.3 Persistent system state authority',
      });
    }
  }
}

function checkLocalRetryLoop(node, functionName, filePath, violations) {
  walkAst(node.body || node, (child) => {
    if (child.type === 'CallExpression') {
      if (child.callee?.type === 'Identifier' &&
          (child.callee.name === 'setTimeout' || child.callee.name === 'setInterval')) {
        let hasRetry = false;
        walkAst(child, (argNode) => {
          if (argNode.type === 'Identifier' && argNode.name.toLowerCase().includes('retry')) {
            hasRetry = true;
          }
        });
        if (hasRetry) {
          violations.push({
            filePath,
            line: child.loc?.start?.line || 1,
            column: child.loc?.start?.column + 1 || 1,
            functionName,
            kind: VIOLATION_KIND.LOCAL_RETRY_LOOP,
            reason: 'local retry loops using setTimeout or setInterval are forbidden; use canonical retry registries or owners instead',
            ruleReference: 'system guidelines.md §7.1 and §9.7 Local retry loop guardrails',
          });
        }
      }
    } else if (child.type === 'WhileStatement' || child.type === 'DoWhileStatement' || child.type === 'ForStatement') {
      let hasRetry = false;
      walkAst(child, (loopNode) => {
        if (loopNode.type === 'Identifier' && loopNode.name.toLowerCase().includes('retry')) {
          hasRetry = true;
        }
      });
      if (hasRetry) {
        violations.push({
          filePath,
          line: child.loc?.start?.line || 1,
          column: child.loc?.start?.column + 1 || 1,
          functionName,
          kind: VIOLATION_KIND.LOCAL_RETRY_LOOP,
          reason: 'local retry loops using while, do-while, or for statement are forbidden; use canonical retry registries or owners instead',
          ruleReference: 'system guidelines.md §7.1 and §9.7 Local retry loop guardrails',
        });
      }
    }
  });
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
    checkSchemaUnsafeWrite(node, filePath, violations);

    if (!isFunctionLikeNode(node)) {
      return;
    }
    if (ancestors.some((ancestor) => isFunctionLikeNode(ancestor))) {
      return;
    }
    violations.push(...collectFunctionViolations(node, parent, filePath));

    const functionName = getFunctionName(node, parent);
    checkMixedCacheAndSqlDecision(node, functionName, filePath, fileClass, violations);
    checkLocalRetryLoop(node, functionName, filePath, violations);

    walkAst(node.body || node, (child) => {
      checkRawNullOrEmptyState(child, functionName, filePath, violations);
    });
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

const DECISION_BASELINE_FILE_URL = new URL(
  './check-guideline-decision-boundaries-baseline.json',
  import.meta.url,
);
const FILE_NOT_FOUND_ERROR_CODE = 'ENOENT';
const NUMERIC_LITERAL_ZERO = 0;
const NUMERIC_LITERAL_ONE = 1;

function buildDecisionBoundaryViolationIdentity(violation) {
  return JSON.stringify([
    violation.filePath,
    violation.line,
    violation.column,
    violation.kind,
  ]);
}

function summarizeDecisionBoundaryViolationsByFile(violations) {
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

async function loadDecisionBoundaryBaseline() {
  try {
    const rawBaseline = await fs.readFile(
      DECISION_BASELINE_FILE_URL,
      'utf8',
    );
    const parsedBaseline = JSON.parse(rawBaseline);
    return new Set(
      (Array.isArray(parsedBaseline?.violations) ?
        parsedBaseline.violations :
        []).map(buildDecisionBoundaryViolationIdentity),
    );
  } catch (error) {
    if (error?.code === FILE_NOT_FOUND_ERROR_CODE) {
      return new Set();
    }
    throw error;
  }
}

function applyDecisionBoundaryBaseline(report, baseline) {
  const newViolations = [];
  let inheritedViolationCount = NUMERIC_LITERAL_ZERO;
  for (const violation of report.violations) {
    if (baseline.has(buildDecisionBoundaryViolationIdentity(violation))) {
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
    filesWithViolations: summarizeDecisionBoundaryViolationsByFile(newViolations),
    violations: newViolations,
  };
}

async function collectDecisionBoundaryViolationsWithBaseline(
  pathsToScan,
  options = {},
) {
  const [report, baseline] = await Promise.all([
    collectDecisionBoundaryViolations(pathsToScan, options),
    loadDecisionBoundaryBaseline(),
  ]);
  return applyDecisionBoundaryBaseline(report, baseline);
}

function formatHumanSummary(report) {
  const summary = formatGuidelineHumanSummary(report, LOCAL_STR_1PNFN);
  if (!Number.isFinite(report.inheritedViolationCount)) {
    return summary;
  }
  return [
    summary,
    `Matched ${report.inheritedViolationCount} inherited decision-boundary baseline violations`,
  ].join('\n');
}

const UPDATE_BASELINE_FLAG = '--update-baseline';
const BASELINE_VERSION = 1;
const BASELINE_JSON_INDENT = 2;

async function writeDecisionBoundaryBaseline(pathsToScan) {
  const report = await collectDecisionBoundaryViolations(pathsToScan, {});
  const baseline = {
    version: BASELINE_VERSION,
    generatedAt: new Date().toISOString(),
    rawViolationCount: report.totalViolationCount,
    violations: report.violations,
  };
  await fs.writeFile(
    DECISION_BASELINE_FILE_URL,
    JSON.stringify(baseline, null, BASELINE_JSON_INDENT) + '\n',
    'utf8',
  );
  process.stdout.write(
    `Wrote ${report.totalViolationCount} decision-boundary baseline entries\n`,
  );
}

async function main(argv = process.argv.slice(LOCAL_NUM_TWO)) {
  if (argv.includes(UPDATE_BASELINE_FLAG)) {
    await writeDecisionBoundaryBaseline(
      argv.filter((arg) => arg !== UPDATE_BASELINE_FLAG),
    );
    return NUMERIC_LITERAL_ZERO;
  }
  return runGuidelineCheck(
    argv,
    collectDecisionBoundaryViolationsWithBaseline,
    formatHumanSummary,
  );
}

runGuidelineCheckWhenDirect(import.meta.url, main);

export {
  FILE_CLASS,
  RULE_REFERENCE,
  applyDecisionBoundaryBaseline,
  buildDecisionBoundaryViolationIdentity,
  classifyFilePath,
  collectDecisionBoundaryViolations,
  collectDecisionBoundaryViolationsWithBaseline,
  collectDecisionBoundaryViolationsFromSource,
};
