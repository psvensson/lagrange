/**
 * The code-navigability detectors: the ONLY place each pattern of the
 * code-navigability-and-mistake-resistance budget is recognised. The budget
 * script, the guideline audit and the coverage census all read these sites;
 * none carries a second walk for the same pattern (R01, R05).
 *
 * Seven navigability patterns are recognised here; the fallback family
 * (two-source reads, typeof dual paths, catch-and-default, re-export-only
 * modules, alias exports, legacy vocabulary) lives in
 * code-navigability-fallback-detectors.js and is re-exported from here, so
 * this module stays the single import point. Sites are built by
 * code-navigability-source.js.
 *
 * state_read_defaults counts one site per state-read TERM of a maximal
 * `||`/`??` chain that has a term after it (any position); its site is the
 * term. row_field_alias_reads counts one site per ADJACENT PAIR of chain
 * terms reading one field of one object (structural object key) in two
 * spellings that normalise equal; its site spans the pair. Both flatten
 * chains with the one shared fallbackChainTerms.
 *
 * value_or_promise_then_checks counts typeof on `.then`/`.catch` (optional
 * chain or not) compared with `===`/`!==` against anything, a truthiness
 * test on `.then`/`.catch` as the test of an if or conditional, and
 * `instanceof Promise`; it excludes only the sites inside a function named
 * `turnFromForeignAnswer` in the one file `src/raft/raft-rs-turn-answer.js`
 * (the designated foreign-answer adapter; both conditions, by path).
 *
 * `detectNavigabilityPatterns(root)` scans `src/**\/*.js` once and returns
 * `{sites, counts, parseFailures, missingRoot}`. A file that does not parse
 * is listed in `parseFailures`, never skipped silently: its sites are
 * unknown, so a reader must treat every count as incomplete. A scanned
 * directory that does not exist is `missingRoot` (its path; null when it
 * exists) and is the same incompleteness: no tree was read, so no count is 0.
 *
 * Governed by the ambient-intrinsic audit: prototype methods are captured at
 * module load.
 */
import path from 'node:path';

import {
  FALLBACK_VISITORS,
  aliasExports,
  catchReturnsDefault,
  legacyTermIdentifiers,
  reexportOnlyModules,
  twoSourceFallbackReads,
  typeofDualPaths,
} from './code-navigability-fallback-detectors.js';
import {
  NODE,
  assignOccurrences,
  columnConstantName,
  directoryExists,
  isPromiseMethodMember,
  fallbackChainTerms,
  makeSite,
  memberObjectKey,
  memberOf,
  memberSpelling,
  memberTypeofComparison,
  moduleExportNames,
  ownField,
  parseNavigabilitySource,
  readSource,
  siteIdentity,
  sourceFiles,
  strictTypeofMember,
  typeofComparisonArgument,
  unwrapChain,
  walkNodes,
} from './code-navigability-source.js';

const arrayMap = Function.call.bind(Array.prototype.map);
const stringReplaceAll = Function.call.bind(String.prototype.replaceAll);
const stringToLowerCase = Function.call.bind(String.prototype.toLowerCase);

const SOURCE_DIRECTORY = 'src';
const NAME_WORD_SEPARATOR = '_';
const NO_SEPARATOR = '';

const ROW = Object.freeze({
  OWNER_PORT: 'owner_port_feature_detection',
  THEN_CHECKS: 'value_or_promise_then_checks',
  IDENTITY_STATE: 'identity_keyed_module_state',
  PROTOTYPE_BAGS: 'prototype_copy_bags',
  INHERITANCE: 'inheritance_depth_over_two',
  ALIAS_READS: 'row_field_alias_reads',
  STATE_DEFAULTS: 'state_read_defaults',
});

const MAX_INHERITANCE_DEPTH = 2;
const IDENTITY_STORES = Object.freeze(new Set(['WeakMap', 'Map', 'Set', 'WeakSet']));
const COPY_METHOD = 'getOwnPropertyNames';
const PROTOTYPE_PROPERTY = 'prototype';
const STATE_PROPERTIES = Object.freeze(new Set(['status', 'raft_role', 'raftRole',
  'workflow_step', 'workflowStep', 'role', 'phase', 'step']));
const STATE_COLUMNS = Object.freeze(new Set(['STATUS', 'RAFT_ROLE', 'WORKFLOW_STEP',
  'ROLE', 'PHASE', 'STEP']));

const NOT_OPERATOR = '!';
// The one designated adapter that names a foreign answer
// (always-promise-port-answers): its probe is the single legitimate
// value-or-promise check in src. Only a site inside a function of this name
// in this file (repo-relative path, not a basename) is excluded.
const FOREIGN_ANSWER_ADAPTER_FILE = 'src/raft/raft-rs-turn-answer.js';
const FOREIGN_ANSWER_ADAPTER_FUNCTION = 'turnFromForeignAnswer';
const INSTANCEOF_OPERATOR = 'instanceof';
const PROMISE_NAME = 'Promise';

const NODE_TYPE = Object.freeze({
  CALL: 'CallExpression',
  CONDITIONAL: 'ConditionalExpression',
  IF: 'IfStatement',
  CLASS_DECLARATION: 'ClassDeclaration',
  CLASS_EXPRESSION: 'ClassExpression',
  NEW: 'NewExpression',
  PROGRAM: 'Program',
  VARIABLE_DECLARATOR: 'VariableDeclarator',
  PROPERTY: 'Property',
  METHOD_DEFINITION: 'MethodDefinition',
  PROPERTY_DEFINITION: 'PropertyDefinition',
});
const FUNCTION_TYPES = Object.freeze(new Set([
  'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']));
const NAMING_KEY_PARENTS = Object.freeze(new Set([
  NODE_TYPE.PROPERTY, NODE_TYPE.METHOD_DEFINITION, NODE_TYPE.PROPERTY_DEFINITION]));

// typeof <member> === 'function' on any member except a promise method.
const ownerPortFeatureDetection = Object.freeze({
  row: ROW.OWNER_PORT,
  visit(node, _parent, parsed, sites) {
    if (!memberTypeofComparison(node)) return;
    if (isPromiseMethodMember(typeofComparisonArgument(node))) return;
    sites.push(makeSite(parsed, ROW.OWNER_PORT, node, node.operator));
  },
});

// The operands whose truthiness decides a test: through `!`, `&&`, `||`
// and `??`, never into a call or comparison.
function truthinessOperands(test, operands) {
  const node = unwrapChain(test);
  if (node.type === NODE.LOGICAL) {
    truthinessOperands(node.left, operands);
    truthinessOperands(node.right, operands);
  } else if (node.type === NODE.UNARY && node.operator === NOT_OPERATOR) {
    truthinessOperands(node.argument, operands);
  } else {
    operands.push(node);
  }
  return operands;
}

function isPromiseTruthinessTest(node) {
  if (node.type !== NODE_TYPE.IF && node.type !== NODE_TYPE.CONDITIONAL) return false;
  for (const operand of truthinessOperands(node.test, [])) {
    if (isPromiseMethodMember(memberOf(operand))) return true;
  }
  return false;
}

function isPromiseInstanceTest(node) {
  return node.type === NODE.BINARY && node.operator === INSTANCEOF_OPERATOR &&
    node.right.type === NODE.IDENTIFIER && node.right.name === PROMISE_NAME;
}

// typeof on `.then`/`.catch` compared strictly against anything.
function isPromiseTypeofTest(node) {
  return isPromiseMethodMember(strictTypeofMember(node));
}

// The name a function goes by: its own id, or the variable, property,
// method or class field whose value it is.
function functionName(node, parent) {
  if (node.id) return node.id.name;
  if (!parent) return undefined;
  if (parent.type === NODE_TYPE.VARIABLE_DECLARATOR && parent.init === node) {
    return parent.id.type === NODE.IDENTIFIER ? parent.id.name : undefined;
  }
  const keyed = NAMING_KEY_PARENTS.has(parent.type) && parent.value === node &&
    !parent.computed && parent.key.type === NODE.IDENTIFIER;
  return keyed ? parent.key.name : undefined;
}

// Whether a site node lies inside a function named turnFromForeignAnswer in
// the designated adapter file.
function isInForeignAnswerAdapter(parsed, site) {
  if (parsed.file !== FOREIGN_ANSWER_ADAPTER_FILE) return false;
  let inside = false;
  walkNodes(parsed.ast, (node, parent) => {
    const adapter = FUNCTION_TYPES.has(node.type) &&
      functionName(node, parent) === FOREIGN_ANSWER_ADAPTER_FUNCTION;
    if (adapter && node.range[0] <= site.range[0] && site.range[1] <= node.range[1]) {
      inside = true;
    }
  });
  return inside;
}

// A value-or-promise check: typeof on `.then`/`.catch` compared strictly
// against any value, a truthiness test on
// `.then`/`.catch` deciding an if or conditional, or `instanceof Promise`;
// never inside the designated foreign-answer adapter function.
const valueOrPromiseThenChecks = Object.freeze({
  row: ROW.THEN_CHECKS,
  visit(node, _parent, parsed, sites) {
    let site;
    let detail;
    if (isPromiseTypeofTest(node) || isPromiseInstanceTest(node)) {
      [site, detail] = [node, node.operator];
    } else if (isPromiseTruthinessTest(node)) {
      [site, detail] = [node.test, node.type];
    }
    if (!site || isInForeignAnswerAdapter(parsed, site)) return;
    sites.push(makeSite(parsed, ROW.THEN_CHECKS, site, detail));
  },
});

function isIdentityStore(init) {
  return Boolean(init) && init.type === NODE_TYPE.NEW &&
    init.callee.type === NODE.IDENTIFIER && IDENTITY_STORES.has(init.callee.name) &&
    init.arguments.length === 0;
}

function moduleVariableDeclaration(statement) {
  if (statement.type === NODE.VARIABLE_DECLARATION) return statement;
  const declaration = statement.type === NODE.EXPORT_NAMED && statement.declaration;
  return declaration && declaration.type === NODE.VARIABLE_DECLARATION ? declaration : false;
}

// Program-level (or exported) `new WeakMap()`, `Map()`, `Set()`, `WeakSet()`.
const identityKeyedModuleState = Object.freeze({
  row: ROW.IDENTITY_STATE,
  visit(node, _parent, parsed, sites) {
    if (node.type !== NODE_TYPE.PROGRAM) return;
    for (const statement of node.body) {
      const declaration = moduleVariableDeclaration(statement);
      if (!declaration) continue;
      for (const declarator of declaration.declarations) {
        if (!isIdentityStore(declarator.init)) continue;
        sites.push(makeSite(parsed, ROW.IDENTITY_STATE, declarator,
          declarator.init.callee.name));
      }
    }
  },
});

function isNamedMember(node, name) {
  return Boolean(node) && node.type === NODE.MEMBER && !node.computed &&
    node.property.name === name;
}

const prototypeCopyBags = Object.freeze({
  row: ROW.PROTOTYPE_BAGS,
  visit(node, _parent, parsed, sites) {
    if (node.type !== NODE_TYPE.CALL || !isNamedMember(node.callee, COPY_METHOD)) return;
    if (!isNamedMember(unwrapChain(node.arguments[0]), PROTOTYPE_PROPERTY)) return;
    sites.push(makeSite(parsed, ROW.PROTOTYPE_BAGS, node, COPY_METHOD));
  },
});

function normalisedName(name) {
  return stringReplaceAll(stringToLowerCase(name), NAME_WORD_SEPARATOR, NO_SEPARATOR);
}

// The spelling a member reads a field by: `a.x`, `a['x']`, or the column
// constant of `a[COLUMN.X]`.
function aliasSpelling(member) {
  return memberSpelling(member) || columnConstantName(member);
}

// One object, one field, two spellings: `a.node_id || a.nodeId`,
// `row[COLUMN.NODE_ID] || row.nodeId`, `a.node_id || a['nodeId']`.
function isSpellingAlias(left, right) {
  const leftName = aliasSpelling(left);
  const rightName = aliasSpelling(right);
  if (!leftName || !rightName || leftName === rightName) return false;
  return normalisedName(leftName) === normalisedName(rightName) &&
    memberObjectKey(left) === memberObjectKey(right);
}

// The span from one chain term to the next, as the site of their pair.
function termPair(left, right) {
  return {type: NODE.LOGICAL, range: [left.range[0], right.range[1]],
    loc: {start: left.loc.start, end: right.loc.end}};
}

// Counted once per adjacent pair of chain terms (Ti, Ti+1) reading one
// field of one object in two spellings, anywhere in the chain, so a
// three-spelling chain counts twice.
const rowFieldAliasReads = Object.freeze({
  row: ROW.ALIAS_READS,
  visit(node, parent, parsed, sites) {
    const terms = fallbackChainTerms(node, parent);
    if (!terms) return;
    for (let index = 0; index + 1 < terms.length; index += 1) {
      const left = memberOf(terms[index]);
      const right = memberOf(terms[index + 1]);
      if (!left || !right || !isSpellingAlias(left, right)) continue;
      sites.push(makeSite(parsed, ROW.ALIAS_READS, termPair(terms[index], terms[index + 1]),
        node.operator));
    }
  },
});

function stateReadName(member) {
  const column = columnConstantName(member);
  if (column) return STATE_COLUMNS.has(column) ? column : undefined;
  const field = memberSpelling(member);
  return STATE_PROPERTIES.has(field) ? field : undefined;
}

// Counted once per state-read TERM of a `||`/`??` chain that has a term
// after it (a default), at any position: `x || row.status || d` counts
// `row.status`; a state read in last position is the default, not
// defaulted.
const stateReadDefaults = Object.freeze({
  row: ROW.STATE_DEFAULTS,
  visit(node, parent, parsed, sites) {
    const terms = fallbackChainTerms(node, parent);
    if (!terms) return;
    for (let index = 0; index + 1 < terms.length; index += 1) {
      const member = memberOf(terms[index]);
      const name = member && stateReadName(member);
      if (name) sites.push(makeSite(parsed, ROW.STATE_DEFAULTS, terms[index], name));
    }
  },
});

const NAVIGABILITY_VISITORS = Object.freeze([
  ownerPortFeatureDetection,
  identityKeyedModuleState,
  prototypeCopyBags,
  rowFieldAliasReads,
  stateReadDefaults,
  valueOrPromiseThenChecks,
]);
const FILE_VISITORS = Object.freeze([...NAVIGABILITY_VISITORS, ...FALLBACK_VISITORS]);

// The sites of the given visitors in one parsed file, by row.
function visitFile(parsed, visitors, classes) {
  const byRow = new Map(arrayMap(visitors, (visitor) => [visitor.row, []]));
  walkNodes(parsed.ast, (node, parent) => {
    for (const visitor of visitors) visitor.visit(node, parent, parsed, byRow.get(visitor.row));
    if (classes && isExtendingClass(node)) classes.push({parsed, node});
  });
  return byRow;
}

function detectWith(visitor) {
  return (parsed) => assignOccurrences(visitFile(parsed, [visitor]).get(visitor.row));
}

function isExtendingClass(node) {
  return (node.type === NODE_TYPE.CLASS_DECLARATION ||
    node.type === NODE_TYPE.CLASS_EXPRESSION) && Boolean(node.id) &&
    Boolean(node.superClass) && node.superClass.type === NODE.IDENTIFIER;
}

function inheritanceDepth(supers, name) {
  const seen = new Set();
  let depth = 0;
  let current = name;
  while (supers.has(current) && !seen.has(current)) {
    seen.add(current);
    current = supers.get(current);
    depth += 1;
  }
  return depth;
}

// Class name -> superclass name across every file; an unresolved name ends
// a chain, a cycle is guarded, and a name declared twice keeps its last
// declaration.
function inheritanceSites(classes) {
  const supers = new Map();
  const declared = new Map();
  for (const entry of classes) {
    supers.set(entry.node.id.name, entry.node.superClass.name);
    declared.set(entry.node.id.name, entry);
  }
  const sites = [];
  for (const name of supers.keys()) {
    const depth = inheritanceDepth(supers, name);
    if (depth <= MAX_INHERITANCE_DEPTH) continue;
    const {parsed, node} = declared.get(name);
    sites.push(makeSite(parsed, ROW.INHERITANCE, node.id, `${name}:${depth}`));
  }
  return sites;
}

function detectInheritanceDepthOverTwo(parsedFiles) {
  const classes = [];
  for (const parsed of parsedFiles) visitFile(parsed, [], classes);
  return assignOccurrences(inheritanceSites(classes));
}

const ROW_ORDER = Object.freeze([
  ROW.OWNER_PORT, ROW.IDENTITY_STATE, ROW.PROTOTYPE_BAGS, ROW.INHERITANCE,
  ROW.ALIAS_READS, ROW.STATE_DEFAULTS, ROW.THEN_CHECKS,
  ...arrayMap(FALLBACK_VISITORS, (visitor) => visitor.row),
]);

function parseFile(root, file, unparsedFiles) {
  try {
    return parseNavigabilitySource(readSource(root, file), file);
  } catch (error) {
    unparsedFiles.push({file, message: String(error.message)});
    return undefined;
  }
}

/**
 * Scan every `.js` file under `<root>/src` once with every detector.
 * @param {string} root the checkout root
 * @param {Object} options `{directory}` to scan instead of `src`
 * @return {Object} `{sites, counts, parseFailures, missingRoot}`; sites in
 *   row order, missingRoot the absent scanned directory or null
 */
function detectNavigabilityPatterns(root, options = {}) {
  const directory = options.directory || SOURCE_DIRECTORY;
  const byRow = new Map(arrayMap(ROW_ORDER, (row) => [row, []]));
  const classes = [];
  const unparsedFiles = [];
  for (const file of sourceFiles(root, directory)) {
    const parsed = parseFile(root, file, unparsedFiles);
    if (!parsed) continue;
    for (const [row, sites] of visitFile(parsed, FILE_VISITORS, classes)) {
      byRow.get(row).push(...sites);
    }
  }
  byRow.get(ROW.INHERITANCE).push(...inheritanceSites(classes));
  const sites = [];
  const counts = {};
  for (const [row, rowSites] of byRow) {
    counts[row] = rowSites.length;
    sites.push(...rowSites);
  }
  const missingRoot = directoryExists(root, directory) ? null : path.join(root, directory);
  return {sites: assignOccurrences(sites), counts, parseFailures: unparsedFiles, missingRoot};
}

const detectOwnerPortFeatureDetection = detectWith(ownerPortFeatureDetection);
const detectValueOrPromiseThenChecks = detectWith(valueOrPromiseThenChecks);
const detectIdentityKeyedModuleState = detectWith(identityKeyedModuleState);
const detectPrototypeCopyBags = detectWith(prototypeCopyBags);
const detectRowFieldAliasReads = detectWith(rowFieldAliasReads);
const detectStateReadDefaults = detectWith(stateReadDefaults);
const detectTwoSourceFallbackReads = detectWith(twoSourceFallbackReads);
const detectTypeofDualPaths = detectWith(typeofDualPaths);
const detectCatchReturnsDefault = detectWith(catchReturnsDefault);
const detectReexportOnlyModules = detectWith(reexportOnlyModules);
const detectAliasExports = detectWith(aliasExports);
const detectLegacyTermIdentifiers = detectWith(legacyTermIdentifiers);

export {
  ROW_ORDER,
  detectAliasExports,
  detectCatchReturnsDefault,
  detectIdentityKeyedModuleState,
  detectInheritanceDepthOverTwo,
  detectLegacyTermIdentifiers,
  detectNavigabilityPatterns,
  detectOwnerPortFeatureDetection,
  detectPrototypeCopyBags,
  detectReexportOnlyModules,
  detectRowFieldAliasReads,
  detectStateReadDefaults,
  detectTwoSourceFallbackReads,
  detectTypeofDualPaths,
  detectValueOrPromiseThenChecks,
  moduleExportNames,
  ownField,
  parseNavigabilitySource,
  siteIdentity,
  sourceFiles,
};
