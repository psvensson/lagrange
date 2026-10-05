import {KEYS} from 'eslint-visitor-keys';
import fs from 'node:fs/promises';
import {
  FILE_CLASS,
  applyCountBaseline,
  buildGuidelineViolationReport,
  collectJavaScriptFiles,
  loadCountBaseline,
  writeCountBaseline,
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
const LOCAL_STR_OBJECTEXPRESSION = 'ObjectExpression';
const LOCAL_STR_ASSIGNMENTEXPRESSION = 'AssignmentExpression';
const LOCAL_STR_RETURNSTATEMENT = 'ReturnStatement';
const LOCAL_STR_COMMA_SPACE = ', ';
const LOCAL_STR_MULTIPLE_INDEPENDENT_IF_STATEMENTS_ASSIG = 'multiple independent if statements assign the same semantic outcome target';
const LOCAL_STR_MULTIPLE_INDEPENDENT_IF_STATEMENTS_RETUR = 'multiple independent if statements return semantic outcome objects';
const LOCAL_STR_DECISION_BOUNDARY_GUIDELINE = 'decision-boundary guideline';

const RULES_MD = 'docs/steering/rules.md ';
const RULE_REFERENCE =
  `${RULES_MD}R07. A semantic outcome is a named state`;

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
  WAIT_CONSTANT_UNDECLARED: 'wait_constant_end_event_undeclared',
  WAIT_CONSTANT_TIMER_ONLY: 'wait_constant_timer_only',
  WAIT_CONSTANT_UNKNOWN_NON_WAIT_KIND: 'wait_constant_unknown_non_wait_kind',
  WAIT_CONSTANT_EVENT_UNNAMED: 'wait_constant_end_event_unnamed',
  WAIT_CONSTANT_DECLARED: 'wait_constant_declared',
  WAIT_CONSTANT_DEAD_REFERENCED: 'wait_constant_dead_referenced',
  WAIT_CONSTANT_MISNAMED_UNJUSTIFIED: 'wait_constant_misnamed_unjustified',
  WAIT_CONSTANT_BASELINE_CEILING: 'wait_constant_baseline_ceiling',
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
  if (typeof name !== LOCAL_STR_STRING || name.length === 0) {
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
  if (!currentNode || typeof currentNode.type !== LOCAL_STR_STRING) {
    return;
  }
  if (currentNode !== functionNode && isFunctionLikeNode(currentNode)) {
    return;
  }

  const insideIf = ancestors.some((ancestor) => ancestor.type === 'IfStatement');
  if (currentNode.type === LOCAL_STR_IFSTATEMENT &&
      !isElseIfBranch(currentNode, currentParent)) {
    evidence.independentIfLines.add(currentNode.loc?.start?.line || 1);
  }

  if (insideIf && currentNode.type === LOCAL_STR_ASSIGNMENTEXPRESSION) {
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
      target: repeatedTargets.join(LOCAL_STR_COMMA_SPACE),
      kind: VIOLATION_KIND.ASSIGNMENT,
      reason:
        LOCAL_STR_MULTIPLE_INDEPENDENT_IF_STATEMENTS_ASSIG,
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
      target: repeatedReturnKeys.join(LOCAL_STR_COMMA_SPACE),
      kind: VIOLATION_KIND.RETURN,
      reason:
        LOCAL_STR_MULTIPLE_INDEPENDENT_IF_STATEMENTS_RETUR,
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

// Named waits declare their ending event (owner rule, 2026-10-04: "a spent
// wait is a failure"; every fully spent timeout so far hid a true bug). A
// named wait in src/ carries `// ends-on: <event>` on its line or in the
// comment lines directly above it. Named waits are declarators (const, let,
// var) and object-literal members (plain, Object.freeze, nested) whose name
// matches WAIT_NAME_PATTERN: an `_MS` declarator always, a member or a
// name without `_MS` when it holds a bound (isBoundShapedValue). The event
// names at least EVENT_MIN_WORDS words; one naming the timer (`timer`,
// `the timer`, `Timer`, ...) or the timer's own expiry anywhere in the text
// (`when the timer fires`, `timer expiry`, `timeout elapses`) is refused; a
// bound that is not a wait declares `ends-on: n/a <kind>` with a kind from
// NON_WAIT_KIND. `n/a dead` is checked: the bound has no reference in src/
// other than its declaration. `n/a misnamed` carries a justification of at
// least EVENT_MIN_WORDS words. Only timer-only waits may be baselined,
// one-way: the audit refuses a baseline above TIMER_ONLY_BASELINE_CEILING.
// Browser code (src/admin/static/*.html) is out of scope: the audit parses
// .js modules, and a page's fetch timeout is not a server wait.
const WAIT_NAME_PATTERN =
  /^(?:[A-Z0-9]+_)*(?:TIMEOUT|BACKSTOP|DEADLINE)(?:(?:_[A-Z0-9]+)*_MS)?$/u;
const MS_NAME_SUFFIX = '_MS';
const ENDS_ON_PATTERN = /\/\/\s*ends-on:\s*(.*)$/u;
const LINE_COMMENT_PREFIX = '//';
const TIMER_EVENT_PATTERN =
  /^(?:(?:the|its|a|an|their|this|that)\s+)?timer\b|\b(?:timer|timeout|deadline)\b.*\b(?:fires|expires|expiry|elapses|elapsed|runs out)\b/iu;
const NON_WAIT_PATTERN = /^n\/a(?:\s+(\S+))?(.*)$/iu;
const NON_WAIT_KIND_DEAD = 'dead';
const NON_WAIT_KIND_MISNAMED = 'misnamed';
const EVENT_WORD_PATTERN = /[a-z]/iu;
const EVENT_MIN_WORDS = 3;
const EXPORT_NAMED_DECLARATION = 'ExportNamedDeclaration';
const END_EVENT_UNDECLARED = Object.freeze({declared: false});
const SOURCE_ROOT_PREFIX = 'src/';
const SOURCE_ROOT_SEGMENT = '/src/';
const MEMBER_PATH_SEPARATOR = '.';
const UNNAMED_OBJECT = '<object>';
const NON_WAIT_KIND = Object.freeze(new Set([
  // a floor or cap applied to another wait's bound
  'clamp',
  // headroom subtracted from or added to another bound
  'margin',
  // a look-back window over past observations
  'lookback',
  // a recurring period
  'period',
  // a lifetime after which a record is stale
  'ttl',
  // a delay that is expected to elapse
  'delay',
  // a budget that is the designed normal exit of a best-effort step
  'timebox',
  // a named bound with no consumer: no reference in src/ but its declaration
  NON_WAIT_KIND_DEAD,
  // the name matches the wait pattern but the value is not a time (with a
  // justification of at least EVENT_MIN_WORDS words)
  NON_WAIT_KIND_MISNAMED,
]));
const NODE_TYPE_BINARY = 'BinaryExpression';
const NODE_TYPE_TEMPLATE = 'TemplateLiteral';
const NODE_TYPE_CALL = 'CallExpression';
// A value of these node types is never a bound (a nested object's members
// are visited themselves).
const NON_BOUND_VALUE_TYPE = Object.freeze(new Set([
  'ArrayExpression',
  'ArrowFunctionExpression',
  'ClassExpression',
  'FunctionExpression',
  LOCAL_STR_OBJECTEXPRESSION,
  NODE_TYPE_TEMPLATE,
]));
const OBJECT_FREEZE_CALLEE = 'Object.freeze';
const NUMBER_TYPE = 'number';
const WAIT_CONSTANT_RULE_REFERENCE =
  `${RULES_MD}R07. A semantic outcome is a named state ` +
  '(a named wait declares the event that ends it before its bound)';
const WAIT_CONSTANT_REASON = Object.freeze({
  [VIOLATION_KIND.WAIT_CONSTANT_UNDECLARED]:
    'named wait constant has no `// ends-on: <event>` declaration',
  [VIOLATION_KIND.WAIT_CONSTANT_TIMER_ONLY]:
    'a wait whose only exit is the timer is refused; name the event that ' +
    'should end it before the bound',
  [VIOLATION_KIND.WAIT_CONSTANT_UNKNOWN_NON_WAIT_KIND]:
    'ends-on: n/a must name an enumerated non-wait kind ' +
    `(${[...NON_WAIT_KIND].join(LOCAL_STR_COMMA_SPACE)})`,
  [VIOLATION_KIND.WAIT_CONSTANT_EVENT_UNNAMED]:
    `ends-on must name the ending event in at least ${EVENT_MIN_WORDS} words`,
  [VIOLATION_KIND.WAIT_CONSTANT_DEAD_REFERENCED]:
    'ends-on: n/a dead, but src/ references the bound outside its declaration',
  [VIOLATION_KIND.WAIT_CONSTANT_MISNAMED_UNJUSTIFIED]:
    'ends-on: n/a misnamed must say what the value is in at least ' +
    `${EVENT_MIN_WORDS} words`,
  [VIOLATION_KIND.WAIT_CONSTANT_BASELINE_CEILING]:
    'the timer-only wait baseline may only shrink; fix the wait instead',
});
// One-way: the shared baseline holds at most this many timer-only waits (the
// two 1 ms cold-reconnect defer constants). Lower it when an entry is
// removed; never raise it.
const TIMER_ONLY_BASELINE_CEILING = 2;
const DECISION_BASELINE_FILE_PATH =
  'scripts/check-guideline-decision-boundaries-baseline.json';
// The kinds the shared baseline can never admit: only a timer-only wait has
// a one-way baseline.
const UNBASELINABLE_WAIT_KIND = Object.freeze(new Set([
  VIOLATION_KIND.WAIT_CONSTANT_UNDECLARED,
  VIOLATION_KIND.WAIT_CONSTANT_UNKNOWN_NON_WAIT_KIND,
  VIOLATION_KIND.WAIT_CONSTANT_EVENT_UNNAMED,
  VIOLATION_KIND.WAIT_CONSTANT_DEAD_REFERENCED,
  VIOLATION_KIND.WAIT_CONSTANT_MISNAMED_UNJUSTIFIED,
  VIOLATION_KIND.WAIT_CONSTANT_BASELINE_CEILING,
]));

function isSourceRootPath(filePath) {
  const normalized = filePath.split('\\').join('/');
  return normalized.startsWith(SOURCE_ROOT_PREFIX) ||
    normalized.includes(SOURCE_ROOT_SEGMENT);
}

function readEndsOnDeclaration(sourceLines, statementNode) {
  const firstLineIndex = statementNode.loc.start.line - 1;
  const trailing = ENDS_ON_PATTERN.exec(sourceLines[firstLineIndex] || '');
  if (trailing) {
    return {declared: true, value: trailing[1].trim()};
  }
  for (let index = firstLineIndex - 1; index >= 0; index -= 1) {
    const text = sourceLines[index].trim();
    if (!text.startsWith(LINE_COMMENT_PREFIX)) {
      break;
    }
    const leading = ENDS_ON_PATTERN.exec(text);
    if (leading) {
      return {declared: true, value: leading[1].trim()};
    }
  }
  return END_EVENT_UNDECLARED;
}

function countEventWords(value) {
  return value.split(/\s+/u)
    .filter((word) => EVENT_WORD_PATTERN.test(word))
    .length;
}

function classifyNonWaitDeclaration(kind, justification) {
  if (!NON_WAIT_KIND.has(kind)) {
    return VIOLATION_KIND.WAIT_CONSTANT_UNKNOWN_NON_WAIT_KIND;
  }
  return kind === NON_WAIT_KIND_MISNAMED &&
    countEventWords(justification) < EVENT_MIN_WORDS ?
    VIOLATION_KIND.WAIT_CONSTANT_MISNAMED_UNJUSTIFIED :
    VIOLATION_KIND.WAIT_CONSTANT_DECLARED;
}

function isDeadClaim(constant) {
  return constant.kind === VIOLATION_KIND.WAIT_CONSTANT_DECLARED &&
    NON_WAIT_PATTERN.exec(constant.declaration.value)?.[1]?.toLowerCase() ===
      NON_WAIT_KIND_DEAD;
}

function classifyEndsOnDeclaration(declaration) {
  if (!declaration.declared || declaration.value.length === 0) {
    return VIOLATION_KIND.WAIT_CONSTANT_UNDECLARED;
  }
  if (TIMER_EVENT_PATTERN.test(declaration.value)) {
    return VIOLATION_KIND.WAIT_CONSTANT_TIMER_ONLY;
  }
  const nonWait = NON_WAIT_PATTERN.exec(declaration.value);
  if (nonWait) {
    return classifyNonWaitDeclaration(nonWait[1]?.toLowerCase(), nonWait[2]);
  }
  if (countEventWords(declaration.value) < EVENT_MIN_WORDS) {
    return VIOLATION_KIND.WAIT_CONSTANT_EVENT_UNNAMED;
  }
  return VIOLATION_KIND.WAIT_CONSTANT_DECLARED;
}

function isWaitName(name) {
  return typeof name === LOCAL_STR_STRING && WAIT_NAME_PATTERN.test(name);
}

function isStringShapedValue(node) {
  if (node?.type === LOCAL_STR_LITERAL) {
    return typeof node.value === LOCAL_STR_STRING;
  }
  if (node?.type === NODE_TYPE_BINARY) {
    return isStringShapedValue(node.left) || isStringShapedValue(node.right);
  }
  return node?.type === NODE_TYPE_TEMPLATE;
}

/**
 * Whether a value holds a bound: a number, an arithmetic or conditional
 * expression, a call, or a reference to something that is not itself a
 * governed wait name (an alias such as `CONFIG_KEY.X_TIMEOUT_MS` or a
 * shorthand `X_TIMEOUT_MS` is governed where it is defined).
 * @param {Object|null} node - The value node.
 * @return {boolean} True when the value is a bound.
 */
function isBoundShapedValue(node) {
  if (!node || NON_BOUND_VALUE_TYPE.has(node.type)) {
    return false;
  }
  if (node.type === LOCAL_STR_LITERAL) {
    return typeof node.value === NUMBER_TYPE;
  }
  if (node.type === LOCAL_STR_IDENTIFIER ||
      node.type === LOCAL_STR_MEMBEREXPRESSION) {
    const reference = extractTargetName(node) || '';
    return !isWaitName(reference.split(MEMBER_PATH_SEPARATOR).pop());
  }
  if (node.type === NODE_TYPE_CALL) {
    return extractTargetName(node.callee) !== OBJECT_FREEZE_CALLEE;
  }
  return !isStringShapedValue(node);
}

function readPropertyKeyName(property) {
  if (property.computed === true) {
    return null;
  }
  if (property.key?.type === LOCAL_STR_IDENTIFIER) {
    return property.key.name;
  }
  return typeof property.key?.value === LOCAL_STR_STRING ?
    property.key.value :
    null;
}

function isNamedWaitDeclarator(node) {
  if (node.type !== LOCAL_STR_VARIABLEDECLARATOR ||
      node.id?.type !== LOCAL_STR_IDENTIFIER ||
      !isWaitName(node.id.name)) {
    return false;
  }
  return node.id.name.endsWith(MS_NAME_SUFFIX) || isBoundShapedValue(node.init);
}

function isNamedWaitMember(node) {
  return node.type === LOCAL_STR_PROPERTY &&
    node.shorthand !== true &&
    isWaitName(readPropertyKeyName(node)) &&
    isBoundShapedValue(node.value);
}

// OBJECT.NESTED.MEMBER, named from the enclosing declarator and keys.
function buildMemberPath(node, ancestors) {
  const segments = [readPropertyKeyName(node)];
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index];
    if (ancestor.type === LOCAL_STR_PROPERTY) {
      segments.unshift(readPropertyKeyName(ancestor) || UNNAMED_OBJECT);
    } else if (ancestor.type === LOCAL_STR_VARIABLEDECLARATOR) {
      segments.unshift(extractTargetName(ancestor.id) || UNNAMED_OBJECT);
      return segments.join(MEMBER_PATH_SEPARATOR);
    } else if (isFunctionLikeNode(ancestor)) {
      break;
    }
  }
  segments.unshift(UNNAMED_OBJECT);
  return segments.join(MEMBER_PATH_SEPARATOR);
}

function describeDeclaratorWait(node, parent, ancestors) {
  const exportWrapper = ancestors[ancestors.length - 2];
  return {
    name: node.id.name,
    member: false,
    statementNode: exportWrapper?.type === EXPORT_NAMED_DECLARATION ?
      exportWrapper :
      parent,
  };
}

function describeMemberWait(node, parent, ancestors) {
  return {
    name: buildMemberPath(node, ancestors),
    member: true,
    statementNode: node,
  };
}

// Each named-wait shape: how it is recognized and how it is described.
const NAMED_WAIT_SHAPE = Object.freeze([
  Object.freeze({matches: isNamedWaitDeclarator, describe: describeDeclaratorWait}),
  Object.freeze({matches: isNamedWaitMember, describe: describeMemberWait}),
]);

function resolveNamedWait(node, parent, ancestors) {
  const shape = NAMED_WAIT_SHAPE.find((candidate) => candidate.matches(node));
  return shape ? shape.describe(node, parent, ancestors) : null;
}

/**
 * Every named wait (declarator or object member) in a source file with its
 * ends-on declaration, derived from the AST.
 * @param {string} source - File text.
 * @param {string} filePath - Path reported on each constant.
 * @return {Array<Object>} {filePath, name, member, line, declaration, kind}.
 */
function collectNamedWaitConstants(source, filePath) {
  const sourceLines = source.split('\n');
  const constants = [];
  walkAst(parseSourceFile(source), (node, parent, ancestors) => {
    const wait = resolveNamedWait(node, parent, ancestors);
    if (!wait) {
      return;
    }
    const declaration = readEndsOnDeclaration(sourceLines, wait.statementNode);
    constants.push({
      filePath,
      name: wait.name,
      member: wait.member,
      line: node.loc.start.line,
      declaration,
      kind: classifyEndsOnDeclaration(declaration),
    });
  });
  return constants;
}

function checkNamedWaitConstants(source, filePath, violations, deadClaims) {
  if (!isSourceRootPath(filePath)) {
    return;
  }
  for (const constant of collectNamedWaitConstants(source, filePath)) {
    if (isDeadClaim(constant)) {
      deadClaims?.push(constant);
    }
    if (constant.kind === VIOLATION_KIND.WAIT_CONSTANT_DECLARED) {
      continue;
    }
    violations.push({
      filePath,
      line: constant.line,
      column: 1,
      functionName: constant.name,
      kind: constant.kind,
      reason: WAIT_CONSTANT_REASON[constant.kind],
      ruleReference: WAIT_CONSTANT_RULE_REFERENCE,
    });
  }
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
  checkNamedWaitConstants(source, filePath, violations, options.deadWaitClaims);

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

// `n/a dead` is checked against every src/ file, not only the scanned ones.
// A reference is a use of the declared name path (`ROOT.A.LEAF`, or a
// declarator's name), a string literal equal to the leaf (computed access),
// or, once a prefix of the path escapes as a value (passed, spread, stored,
// destructured), any `.LEAF` access or `{LEAF}` pattern anywhere: an escaped
// object's members can be read under another name. Over-counting only
// refuses a claim; it never lets a live bound pass as dead.
const DEAD_CLAIM_REFERENCE_ROOTS = Object.freeze(['src']);
const SPECIFIER_TYPE = Object.freeze(new Set([
  'ExportSpecifier',
  'ImportDefaultSpecifier',
  'ImportNamespaceSpecifier',
  'ImportSpecifier',
]));
const OBJECT_PATTERN = 'ObjectPattern';

function isMemberChainTop(node, parent) {
  return !(parent?.type === LOCAL_STR_MEMBEREXPRESSION && parent.object === node);
}

// The static part of a member chain: `ROOT.A[key].B` reads through `ROOT.A`.
function readStaticChainPrefix(node) {
  let current = node;
  while (current.type === LOCAL_STR_MEMBEREXPRESSION &&
      extractTargetName(current) === null) {
    current = current.object;
  }
  return extractTargetName(current);
}

// The dotted name path a node reads, or null when it is not a read (a
// binding name, a property key, a member property, a specifier).
function readReferencePath(node, parent) {
  if (node.type === LOCAL_STR_MEMBEREXPRESSION) {
    return isMemberChainTop(node, parent) ? readStaticChainPrefix(node) : null;
  }
  if (node.type !== LOCAL_STR_IDENTIFIER || !isMemberChainTop(node, parent) ||
      SPECIFIER_TYPE.has(parent?.type)) {
    return null;
  }
  const isBindingName =
    (parent?.type === LOCAL_STR_VARIABLEDECLARATOR && parent.id === node) ||
    (parent?.type === LOCAL_STR_PROPERTY && parent.key === node &&
      parent.value !== node) ||
    (parent?.type === LOCAL_STR_MEMBEREXPRESSION && parent.property === node);
  return isBindingName ? null : node.name;
}

function readLeafReference(node, parent) {
  if (node.type === LOCAL_STR_LITERAL) {
    return typeof node.value === LOCAL_STR_STRING ? node.value : null;
  }
  if (node.type === LOCAL_STR_MEMBEREXPRESSION && !node.computed) {
    return extractTargetName(node.property);
  }
  return node.type === LOCAL_STR_PROPERTY && parent?.type === OBJECT_PATTERN ?
    readPropertyKeyName(node) :
    null;
}

function createDeadClaimTally(claim) {
  const segments = claim.name.split(MEMBER_PATH_SEPARATOR);
  return {
    claim,
    path: claim.name,
    leaf: segments[segments.length - 1],
    prefixes: new Set(segments.slice(0, -1)
      .map((_, index) => segments.slice(0, index + 1).join(MEMBER_PATH_SEPARATOR))),
    pathReferences: 0,
    leafReferences: 0,
    escaped: false,
  };
}

function tallyNode(tally, node, parent) {
  const referencePath = readReferencePath(node, parent);
  if (referencePath === tally.path ||
      referencePath?.startsWith(`${tally.path}${MEMBER_PATH_SEPARATOR}`)) {
    tally.pathReferences += 1;
  } else if (tally.prefixes.has(referencePath)) {
    tally.escaped = true;
  }
  if (readLeafReference(node, parent) === tally.leaf) {
    tally.leafReferences += 1;
  }
}

// The declaration itself is neither a read (a declarator name, an object
// key) nor a leaf occurrence (an object key is not a pattern key).
function isDeadClaimRefuted(tally) {
  return tally.pathReferences > 0 ||
    (tally.escaped && tally.leafReferences > 0);
}

async function listReferenceFiles(referenceRoots) {
  const files = [];
  for (const root of referenceRoots) {
    files.push(...await collectJavaScriptFiles(root));
  }
  return files;
}

async function tallyDeadClaimReferences(claims, referenceRoots) {
  const tallies = claims.map(createDeadClaimTally);
  const needles = [...new Set(tallies.flatMap((tally) =>
    [tally.leaf, ...tally.prefixes, tally.path]))];
  for (const filePath of await listReferenceFiles(referenceRoots)) {
    const source = await fs.readFile(filePath, 'utf8');
    if (!needles.some((needle) => source.includes(needle))) {
      continue;
    }
    walkAst(parseSourceFile(source), (node, parent) => {
      for (const tally of tallies) {
        tallyNode(tally, node, parent);
      }
    });
  }
  return tallies;
}

function buildWaitViolation(constant, kind) {
  return {
    filePath: constant.filePath,
    line: constant.line,
    column: 1,
    functionName: constant.name,
    kind,
    reason: WAIT_CONSTANT_REASON[kind],
    ruleReference: WAIT_CONSTANT_RULE_REFERENCE,
  };
}

function withAddedViolations(report, added) {
  if (added.length === 0) {
    return report;
  }
  const violations = [...report.violations, ...added];
  const byFile = new Map();
  for (const violation of violations) {
    byFile.set(violation.filePath, (byFile.get(violation.filePath) || 0) + 1);
  }
  return {
    ...report,
    totalViolationCount: report.totalViolationCount + added.length,
    filesWithViolations: [...byFile.entries()]
      .map(([filePath, violationCount]) => ({filePath, violationCount}))
      .sort((left, right) => right.violationCount - left.violationCount ||
        left.filePath.localeCompare(right.filePath)),
    violations,
  };
}

/**
 * The `n/a dead` claims that src/ refutes: each claimed bound that is still
 * referenced outside its declaration.
 * @param {Array<Object>} claims - Constants from collectNamedWaitConstants.
 * @param {Array<string>} referenceRoots - Directories that hold every reader.
 * @return {Promise<Array<Object>>} One violation per refuted claim.
 */
async function collectRefutedDeadClaims(
  claims,
  referenceRoots = DEAD_CLAIM_REFERENCE_ROOTS,
) {
  if (claims.length === 0) {
    return [];
  }
  const tallies = await tallyDeadClaimReferences(claims, referenceRoots);
  return tallies.filter(isDeadClaimRefuted).map((tally) =>
    buildWaitViolation(tally.claim, VIOLATION_KIND.WAIT_CONSTANT_DEAD_REFERENCED));
}

async function collectDecisionBoundaryViolations(pathsToScan, options = {}) {
  const deadWaitClaims = [];
  const report = await buildGuidelineViolationReport(
    pathsToScan,
    {...options, deadWaitClaims},
    collectDecisionBoundaryViolationsFromSource,
  );
  return withAddedViolations(report, await collectRefutedDeadClaims(
    deadWaitClaims,
    options.referenceRoots,
  ));
}

// 2026-07-28 upward re-anchor: the required CI gate was silently red (the
// static chain died at audit:current-capabilities before this audit ever ran
// on the recent push range), so 42 non-baseline violations landed unmeasured
// on top of the 813 inherited ones. Baseline re-anchored at the measured 855;
// refactor target remains the existing idiom (route decisions through frozen
// STATE/ACTION decision-table owners, rule ARCH-0013). Decision-log entry:
// solve/epics/self-hosting-circularity-generic-treatment.md (2026-07-28).
const DECISION_BASELINE_FILE_URL = new URL(
  './check-guideline-decision-boundaries-baseline.json',
  import.meta.url,
);
const NUMERIC_LITERAL_ZERO = 0;

function buildDecisionBoundaryViolationIdentity(violation) {
  // Line/column-independent so routine edits do not resurface inherited
  // violations as new; count-based application still blocks NET growth of
  // the same kind in the same function of the same file.
  return JSON.stringify([
    violation.filePath,
    violation.functionName,
    violation.kind,
  ]);
}

// An undeclared wait (or an unknown kind, or an unnamed event) entered into
// the shared baseline is not an allowance: only timer-only waits are.
function withoutUnbaselinableWaitAllowances(allowances) {
  return new Map([...allowances].filter(([identity]) =>
    !UNBASELINABLE_WAIT_KIND.has(JSON.parse(identity)[2])));
}

/**
 * The audit's own one-way ceiling on the shared baseline: more timer-only
 * wait allowances than TIMER_ONLY_BASELINE_CEILING is a violation.
 * @param {Map<string, number>} allowances - Baseline identity -> count.
 * @return {Array<Object>} Zero or one ceiling violation.
 */
function checkTimerOnlyBaselineCeiling(allowances) {
  let timerOnly = 0;
  for (const [identity, count] of allowances) {
    if (JSON.parse(identity)[2] === VIOLATION_KIND.WAIT_CONSTANT_TIMER_ONLY) {
      timerOnly += count;
    }
  }
  if (timerOnly <= TIMER_ONLY_BASELINE_CEILING) {
    return [];
  }
  return [buildWaitViolation({
    filePath: DECISION_BASELINE_FILE_PATH,
    line: 1,
    name: `${timerOnly} timer-only allowances > ${TIMER_ONLY_BASELINE_CEILING}`,
  }, VIOLATION_KIND.WAIT_CONSTANT_BASELINE_CEILING)];
}

async function collectDecisionBoundaryViolationsWithBaseline(
  pathsToScan,
  options = {},
) {
  const [report, baseline] = await Promise.all([
    collectDecisionBoundaryViolations(pathsToScan, options),
    loadCountBaseline(
      options.baselineFileUrl || DECISION_BASELINE_FILE_URL,
      buildDecisionBoundaryViolationIdentity,
    ),
  ]);
  return withAddedViolations(applyCountBaseline(
    report,
    withoutUnbaselinableWaitAllowances(baseline),
    buildDecisionBoundaryViolationIdentity,
  ), checkTimerOnlyBaselineCeiling(baseline));
}

function formatHumanSummary(report) {
  const summary = formatGuidelineHumanSummary(report, LOCAL_STR_DECISION_BOUNDARY_GUIDELINE);
  if (!Number.isFinite(report.inheritedViolationCount)) {
    return summary;
  }
  return [
    summary,
    `Matched ${report.inheritedViolationCount} inherited decision-boundary baseline violations`,
  ].join('\n');
}

const UPDATE_BASELINE_FLAG = '--update-baseline';


async function main(argv = process.argv.slice(2)) {
  if (argv.includes(UPDATE_BASELINE_FLAG)) {
    const report = await collectDecisionBoundaryViolations(
      argv.filter((arg) => arg !== UPDATE_BASELINE_FLAG),
      {},
    );
    await writeCountBaseline(
      DECISION_BASELINE_FILE_URL,
      report,
      'decision-boundary',
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
  DECISION_BASELINE_FILE_URL,
  FILE_CLASS,
  RULE_REFERENCE,
  TIMER_ONLY_BASELINE_CEILING,
  VIOLATION_KIND,
  buildDecisionBoundaryViolationIdentity,
  checkTimerOnlyBaselineCeiling,
  collectNamedWaitConstants,
  collectRefutedDeadClaims,
  classifyFilePath,
  collectDecisionBoundaryViolations,
  collectDecisionBoundaryViolationsWithBaseline,
  collectDecisionBoundaryViolationsFromSource,
  withoutUnbaselinableWaitAllowances,
};
