/**
 * The semantic rows of the fallback-read closure ratchet
 * (fallback-read-closure.js): alternate reads the three syntactic census
 * rows cannot see (reports/w4-fallback-read-closure.md D.2,
 * reports/w3-leader-authority-migration.md 5.2). Each row counts sites; the
 * ratchet keys them by row and top-level directory.
 *
 * read_mode_fallback_members (src): a read mode or read source that answers
 *   from a second source. A read-mode enum is a const named `*READ_MODE`,
 *   `*READ_SOURCE` or `*SUPPLEMENT_MODE`; its fallback members are those whose
 *   name has a PREFERRED, FALLBACK, SUPPLEMENT or CONFIRM_EMPTY word or whose
 *   string value has one (`OWNER_RPC_PREFERRED_SQL_FALLBACK`,
 *   `CACHE_PREFERRED`, `AUTHORITATIVE_SUPPLEMENT`, `PLANNING:
 *   'owner_rpc_preferred_sql_fallback'`). Counted: each such member, each
 *   access `X.MEMBER` on an object named like a read-mode enum (an alias
 *   such as `READ_MODE` included), each raw string equal to a fallback mode
 *   value, and every `replicaFallbackConsistency` /
 *   `*REPLICA_FALLBACK_CONSISTENCY` name.
 * non_required_leader_mode (src): `X.PREFERRED` / `X.ANY` on a leader-mode
 *   enum and those enum members, `leaderMode: 'preferred' | 'any'`, and an
 *   owner read option object - one with `authoritativeReadMode` - that has
 *   no `leaderMode` (the absent mode is whatever the normaliser defaults to).
 * role_derived_leader_reads (src): a comparison (`===`, `!==`, `==`, `!=`,
 *   a switch case, `Set.has` / `includes` on a module-level leader
 *   collection) of a LEADER token with a value read from a row's role
 *   column (`x.raft_role`, `x[COLUMN.RAFT_ROLE]`, `x.raftRole` with `x` not
 *   `this`), directly, through a normalising call, through a local bound
 *   from such a read, through a parameter named for the column, through a
 *   call given the column key (`firstStringField(row, COLUMN.RAFT_ROLE)`),
 *   or through a same-file function returning one. A LEADER token is
 *   `'leader'`, `<ROLE enum>.LEADER`, a const or import bound to one, or one
 *   normalised (`String(RAFT_ROLE.LEADER).toLowerCase()`). Live reads
 *   (`this.role`, `readStatus().role`) are not row reads.
 * fixture_leader_role_rows[_message_group] (test): an object literal
 *   writing a leader role into a row's role column (also through a
 *   conditional, a default or a generator argument), an assignment of one,
 *   or a defaulted `raftRole = 'leader'` parameter. The literal's
 *   service_type / entity_type / service_id decides: wasm or meta rows are
 *   exempt (reported, not counted), message-group rows have their own row,
 *   everything else - partition rows and rows of unresolved type - counts.
 *
 * Name-based scoping (a local's or function's taint) is per file, not per
 * scope: an over-count, never an under-count, of the same shape.
 *
 * Governed by the ambient-intrinsic audit: prototype methods are captured at
 * module load.
 */
import {
  NODE, parseNavigabilitySource, readSource, sourceFiles, unwrapChain, walkNodes,
} from './code-navigability-source.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arraySome = Function.call.bind(Array.prototype.some);
const regexpTest = Function.call.bind(RegExp.prototype.test);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringSlice = Function.call.bind(String.prototype.slice);
const stringToLowerCase = Function.call.bind(String.prototype.toLowerCase);
const stringToUpperCase = Function.call.bind(String.prototype.toUpperCase);

const SEMANTIC_ROW = Object.freeze({
  READ_MODE: 'read_mode_fallback_members',
  LEADER_MODE: 'non_required_leader_mode',
  ROLE_READ: 'role_derived_leader_reads',
  FIXTURE: 'fixture_leader_role_rows',
  FIXTURE_MESSAGE_GROUP: 'fixture_leader_role_rows_message_group',
  FIXTURE_EXEMPT: 'fixture_leader_role_rows_exempt',
});
const SOURCE_DIRECTORY = 'src';
const TEST_DIRECTORY = 'test';

const READ_MODE_ENUM = /(?:^|_)READ_(?:MODE|SOURCE)$|(?:^|_)SUPPLEMENT_MODE$/u;
const READ_MODE_WORD = /(?:^|_)(?:PREFERRED|FALLBACK|SUPPLEMENT|CONFIRM_EMPTY)(?:_|$)/u;
const READ_MODE_VALUE_WORD = /(?:^|_)(?:preferred|fallback|supplement|confirm_empty)(?:_|$)/u;
const REPLICA_FALLBACK_CONSISTENCY = /^replicaFallbackConsistency$|(?:^|_)REPLICA_FALLBACK_CONSISTENCY(?:_|$)/u;
const SOURCE_HINTS = Object.freeze({
  [SEMANTIC_ROW.READ_MODE]: /READ_MODE|READ_SOURCE|SUPPLEMENT_MODE|preferred|fallback|supplement|confirm_empty|replicaFallbackConsistency|REPLICA_FALLBACK_CONSISTENCY/u,
  [SEMANTIC_ROW.LEADER_MODE]: /LEADER_MODE|leaderMode|authoritativeReadMode/u,
  [SEMANTIC_ROW.ROLE_READ]: /raft_role|RAFT_ROLE|raftRole/u,
});
const FIXTURE_HINT = /raft_role|RAFT_ROLE|raftRole/u;

const LEADER_MODE_OBJECT = 'LEADER_MODE';
const WEAK_LEADER_MODES = Object.freeze(new Set(['PREFERRED', 'ANY']));
const WEAK_LEADER_VALUES = Object.freeze(new Set(['preferred', 'any']));
const LEADER_MODE_KEY = 'leaderMode';
const OWNER_READ_MODE_KEY = 'authoritativeReadMode';

const LEADER_VALUE = 'leader';
const LEADER_MEMBER = 'LEADER';
const ROLE_WORD = 'ROLE';
const ROLE_FIELDS = Object.freeze(new Set(['raft_role', 'raftRole']));
const ROLE_COLUMN = 'RAFT_ROLE';
const IMPORTED_LEADER_NAME = /LEADER/u;
const IMPORTED_ROLE_NAME = /ROLE/u;
const MEMBERSHIP_METHODS = Object.freeze(new Set(['has', 'includes']));
const COMPARISON_OPERATORS = Object.freeze(new Set(['===', '!==', '==', '!=']));
const FIXPOINT_PASSES = 4;
const COLLECTION_FREEZE = 'freeze';
const SET_CONSTRUCTOR = 'Set';
const STRING_CONVERTER = 'String';

const TYPE_KEYS = Object.freeze(new Set([
  'service_type', 'serviceType', 'entity_type', 'entityType', 'service_id', 'serviceId',
]));
const TYPE_COLUMNS = Object.freeze(new Set(['SERVICE_TYPE', 'ENTITY_TYPE', 'SERVICE_ID']));
const EXEMPT_TYPE = /wasm|meta/u;
const MESSAGE_GROUP_TYPE = /message/u;

const NODE_TYPE = Object.freeze({
  PROPERTY: 'Property', OBJECT: 'ObjectExpression', ARRAY: 'ArrayExpression',
  CONDITIONAL: 'ConditionalExpression', SWITCH: 'SwitchStatement', ASSIGNMENT: 'AssignmentExpression',
  ASSIGNMENT_PATTERN: 'AssignmentPattern', OBJECT_PATTERN: 'ObjectPattern',
  VARIABLE_DECLARATOR: 'VariableDeclarator', IMPORT_SPECIFIER: 'ImportSpecifier',
  FUNCTION_DECLARATION: 'FunctionDeclaration', FUNCTION_EXPRESSION: 'FunctionExpression',
  ARROW: 'ArrowFunctionExpression', METHOD: 'MethodDefinition', RETURN: 'ReturnStatement',
  NEW: 'NewExpression', AWAIT: 'AwaitExpression', THIS: 'ThisExpression', PROGRAM: 'Program',
  VARIABLE_DECLARATION: 'VariableDeclaration', EXPORT_NAMED: 'ExportNamedDeclaration',
  BLOCK: 'BlockStatement',
});
const FUNCTION_TYPES = Object.freeze(new Set([
  NODE_TYPE.FUNCTION_DECLARATION, NODE_TYPE.FUNCTION_EXPRESSION, NODE_TYPE.ARROW,
]));

function site(row, parsed, node) {
  return {row, file: parsed.file, line: node.loc.start.line};
}

function nameOf(node) {
  const unwrapped = unwrapChain(node);
  if (!unwrapped) return undefined;
  if (unwrapped.type === NODE.IDENTIFIER) return unwrapped.name;
  if (unwrapped.type === NODE.MEMBER && !unwrapped.computed) return unwrapped.property.name;
  return undefined;
}

function keyName(property) {
  if (property.computed) return undefined;
  if (property.key.type === NODE.IDENTIFIER) return property.key.name;
  return property.key.type === NODE.LITERAL ? String(property.key.value) : undefined;
}

// The column constant a computed key or member names: `[COLUMN.X]` -> X.
function columnName(node) {
  return node && node.type === NODE.MEMBER && !node.computed ? node.property.name : undefined;
}

// --- read_mode_fallback_members, non_required_leader_mode ------------------

function isFallbackModeMember(property) {
  if (property.type !== NODE_TYPE.PROPERTY) return false;
  const value = property.value.type === NODE.LITERAL ? property.value.value : undefined;
  return regexpTest(READ_MODE_WORD, String(keyName(property))) ||
    (typeof value === 'string' && regexpTest(READ_MODE_VALUE_WORD, value));
}

// Pass one: the fallback members of every read-mode enum in the tree.
function collectReadModeEnums(parsed, enums) {
  walkNodes(parsed.ast, (node) => {
    if (node.type !== NODE_TYPE.VARIABLE_DECLARATOR ||
        !regexpTest(READ_MODE_ENUM, String(nameOf(node.id)))) {
      return;
    }
    const init = unwrapFreeze(node.init);
    if (!init || init.type !== NODE_TYPE.OBJECT) return;
    for (const property of arrayFilter(init.properties, isFallbackModeMember)) {
      enums.keys.add(keyName(property));
      if (property.value.type === NODE.LITERAL) {
        enums.values.add(property.value.value);
        enums.declaredValues.add(property.value);
      }
      enums.members.push(site(SEMANTIC_ROW.READ_MODE, parsed, property));
    }
  });
}

// Pass two: uses of those members, their raw values, and the replica
// fallback consistency names.
function isReadModeEnumObject(node) {
  return regexpTest(READ_MODE_ENUM, String(nameOf(node)));
}

// A `replicaFallbackConsistency` name, once per token: not the value half of
// a shorthand property, not a member of a read-mode enum.
function isReplicaFallbackName(node, parent) {
  if (node.type !== NODE.IDENTIFIER || !regexpTest(REPLICA_FALLBACK_CONSISTENCY, node.name)) {
    return false;
  }
  if (parent?.type === NODE_TYPE.PROPERTY) return !(parent.shorthand && parent.value === node);
  return !(parent?.type === NODE.MEMBER && parent.property === node &&
    isReadModeEnumObject(parent.object));
}

function isReadModeUse(node, parent, enums) {
  if (node.type === NODE.MEMBER) {
    return !node.computed && enums.keys.has(node.property.name) &&
      isReadModeEnumObject(node.object);
  }
  if (node.type === NODE.LITERAL) {
    return enums.values.has(node.value) && !enums.declaredValues.has(node);
  }
  return isReplicaFallbackName(node, parent);
}

function readModeSites(parsed, enums, sites) {
  walkNodes(parsed.ast, (node, parent) => {
    if (isReadModeUse(node, parent, enums)) sites.push(site(SEMANTIC_ROW.READ_MODE, parsed, node));
  });
}

function isLeaderModeObject(node) {
  const name = nameOf(node);
  return typeof name === 'string' && stringIncludes(stringToUpperCase(name), LEADER_MODE_OBJECT);
}

function leaderModeEnumMembers(declarator, parsed, sites) {
  const init = unwrapFreeze(declarator.init);
  if (!init || init.type !== NODE_TYPE.OBJECT || !isLeaderModeObject(declarator.id)) return;
  for (const property of init.properties) {
    if (property.type === NODE_TYPE.PROPERTY && WEAK_LEADER_MODES.has(keyName(property))) {
      sites.push(site(SEMANTIC_ROW.LEADER_MODE, parsed, property));
    }
  }
}

function ownerReadWithoutLeaderMode(node) {
  const keys = new Set();
  for (const property of node.properties) {
    if (property.type === NODE_TYPE.PROPERTY) keys.add(keyName(property));
  }
  return keys.has(OWNER_READ_MODE_KEY) && !keys.has(LEADER_MODE_KEY);
}

function leaderModeSites(parsed, sites) {
  walkNodes(parsed.ast, (node) => {
    if (node.type === NODE.MEMBER && !node.computed && WEAK_LEADER_MODES.has(node.property.name) &&
        isLeaderModeObject(node.object)) {
      sites.push(site(SEMANTIC_ROW.LEADER_MODE, parsed, node));
    } else if (node.type === NODE_TYPE.VARIABLE_DECLARATOR) {
      leaderModeEnumMembers(node, parsed, sites);
    } else if (node.type === NODE_TYPE.PROPERTY && keyName(node) === LEADER_MODE_KEY &&
        node.value.type === NODE.LITERAL && WEAK_LEADER_VALUES.has(node.value.value)) {
      sites.push(site(SEMANTIC_ROW.LEADER_MODE, parsed, node));
    } else if (node.type === NODE_TYPE.OBJECT && ownerReadWithoutLeaderMode(node)) {
      sites.push(site(SEMANTIC_ROW.LEADER_MODE, parsed, node));
    }
  });
}

// --- leader tokens and row role reads ---------------------------------------

function unwrapFreeze(node) {
  const unwrapped = unwrapChain(node);
  const frozen = unwrapped && unwrapped.type === NODE.CALL && nameOf(unwrapped.callee) ===
    COLLECTION_FREEZE && unwrapped.arguments.length === 1;
  return frozen ? unwrapped.arguments[0] : unwrapped;
}

function isLeaderToken(node, context) {
  const unwrapped = unwrapChain(node);
  if (!unwrapped) return false;
  if (unwrapped.type === NODE.LITERAL) {
    return typeof unwrapped.value === 'string' &&
      stringToLowerCase(unwrapped.value) === LEADER_VALUE;
  }
  if (unwrapped.type === NODE.IDENTIFIER) return context.leaderNames.has(unwrapped.name);
  if (unwrapped.type === NODE.CALL) return isNormalisedLeader(unwrapped, context);
  if (unwrapped.type !== NODE.MEMBER || unwrapped.computed ||
      unwrapped.property.name !== LEADER_MEMBER) {
    return false;
  }
  const owner = nameOf(unwrapped.object);
  return typeof owner === 'string' && stringIncludes(stringToUpperCase(owner), ROLE_WORD);
}

// `String(LEADER)`, `LEADER.toLowerCase()`, `String(LEADER).toLowerCase()`.
function isNormalisedLeader(call, context) {
  const callee = unwrapChain(call.callee);
  if (callee.type === NODE.MEMBER && !callee.computed) return isLeaderToken(callee.object, context);
  return nameOf(callee) === STRING_CONVERTER && call.arguments.length === 1 &&
    isLeaderToken(call.arguments[0], context);
}

// Whether an expression contains a leader token where a value is chosen:
// itself, a conditional branch, a logical term, a call or array element.
function containsLeader(node, context) {
  const unwrapped = unwrapChain(node);
  if (!unwrapped) return false;
  if (isLeaderToken(unwrapped, context)) return true;
  switch (unwrapped.type) {
  case NODE_TYPE.CONDITIONAL:
    return containsLeader(unwrapped.consequent, context) ||
      containsLeader(unwrapped.alternate, context);
  case NODE.LOGICAL:
    return containsLeader(unwrapped.left, context) || containsLeader(unwrapped.right, context);
  case NODE.CALL:
    return arraySome(unwrapped.arguments, (argument) => containsLeader(argument, context));
  case NODE_TYPE.ARRAY:
    return arraySome(unwrapped.elements, (element) => containsLeader(element, context));
  default:
    return false;
  }
}

function isRoleField(node) {
  const member = unwrapChain(node);
  if (!member || member.type !== NODE.MEMBER || member.object.type === NODE_TYPE.THIS) return false;
  if (!member.computed) return ROLE_FIELDS.has(member.property.name);
  if (member.property.type === NODE.LITERAL) return ROLE_FIELDS.has(member.property.value);
  return columnName(member.property) === ROLE_COLUMN;
}

function isTainted(node, context) {
  const unwrapped = unwrapChain(node);
  if (!unwrapped) return false;
  switch (unwrapped.type) {
  case NODE.MEMBER: return isRoleField(unwrapped);
  case NODE.IDENTIFIER: return context.taintedNames.has(unwrapped.name);
  case NODE.CALL: return taintedCall(unwrapped, context);
  case NODE.LOGICAL:
    return isTainted(unwrapped.left, context) || isTainted(unwrapped.right, context);
  case NODE_TYPE.CONDITIONAL:
    return isTainted(unwrapped.consequent, context) || isTainted(unwrapped.alternate, context);
  case NODE.TEMPLATE: return arraySome(unwrapped.expressions, (part) => isTainted(part, context));
  case NODE_TYPE.AWAIT: return isTainted(unwrapped.argument, context);
  default: return false;
  }
}

// The role column's key passed as a value: `COLUMN.RAFT_ROLE`, `'raft_role'`.
function isRoleColumnKey(node) {
  const unwrapped = unwrapChain(node);
  if (unwrapped.type === NODE.LITERAL) return ROLE_FIELDS.has(unwrapped.value);
  return columnName(unwrapped) === ROLE_COLUMN;
}

function taintedCall(call, context) {
  if (arraySome(call.arguments, (argument) => isTainted(argument, context) ||
    isRoleColumnKey(argument))) {
    return true;
  }
  const callee = unwrapChain(call.callee);
  if (callee.type === NODE.MEMBER && isTainted(callee.object, context)) return true;
  return context.taintedFunctions.has(nameOf(callee));
}

function patternNames(pattern, names) {
  if (!pattern) return names;
  if (pattern.type === NODE.IDENTIFIER) names.push(pattern.name);
  else if (pattern.type === NODE_TYPE.ASSIGNMENT_PATTERN) patternNames(pattern.left, names);
  return names;
}

// Locals bound from a row's role field by destructuring: `{raft_role}`,
// `{raftRole: role}`, `{[COLUMN.RAFT_ROLE]: role}`.
function destructuredRoleNames(pattern, names) {
  if (!pattern || pattern.type !== NODE_TYPE.OBJECT_PATTERN) return names;
  for (const property of pattern.properties) {
    if (property.type !== NODE_TYPE.PROPERTY) continue;
    const field = property.computed ? columnName(property.key) : keyName(property);
    if (ROLE_FIELDS.has(field) || field === ROLE_COLUMN) patternNames(property.value, names);
  }
  return names;
}

function functionName(node, parent) {
  if (node.id) return node.id.name;
  if (parent?.type === NODE_TYPE.VARIABLE_DECLARATOR) return nameOf(parent.id);
  if (parent?.type === NODE_TYPE.METHOD || parent?.type === NODE_TYPE.PROPERTY) {
    return keyName(parent);
  }
  return undefined;
}

function returnsTainted(fn, context) {
  if (fn.body.type !== NODE_TYPE.BLOCK) return isTainted(fn.body, context);
  let found = false;
  walkNodes(fn.body, (node) => {
    if (!found && node.type === NODE_TYPE.RETURN && isTainted(node.argument, context)) found = true;
  });
  return found;
}

// The local names a node binds from a row's role field.
function taintedBindings(node, context) {
  if (node.type === NODE_TYPE.VARIABLE_DECLARATOR) {
    const bound = node.init && isTainted(node.init, context) ? patternNames(node.id, []) : [];
    return [...destructuredRoleNames(node.id, []), ...bound];
  }
  if (node.type === NODE_TYPE.ASSIGNMENT && node.left.type === NODE.IDENTIFIER) {
    return isTainted(node.right, context) ? [node.left.name] : [];
  }
  if (!FUNCTION_TYPES.has(node.type)) return [];
  const names = [];
  for (const param of node.params) {
    names.push(...arrayFilter(patternNames(param, []), (name) => ROLE_FIELDS.has(name)),
      ...destructuredRoleNames(param, []));
  }
  return names;
}

function taintPass(parsed, context) {
  const before = context.taintedNames.size + context.taintedFunctions.size;
  walkNodes(parsed.ast, (node, parent) => {
    for (const name of taintedBindings(node, context)) context.taintedNames.add(name);
    if (FUNCTION_TYPES.has(node.type) && returnsTainted(node, context)) {
      const name = functionName(node, parent);
      if (typeof name === 'string') context.taintedFunctions.add(name);
    }
  });
  return context.taintedNames.size + context.taintedFunctions.size > before;
}

function isLeaderCollection(init, context) {
  const value = unwrapFreeze(init);
  if (!value) return false;
  if (value.type === NODE_TYPE.ARRAY) return containsLeader(value, context);
  return value.type === NODE_TYPE.NEW && nameOf(value.callee) === SET_CONSTRUCTOR &&
    value.arguments.length === 1 && containsLeader(value.arguments[0], context);
}

function moduleDeclarators(ast) {
  const declarators = [];
  for (const statement of ast.body) {
    const declaration = statement.type === NODE_TYPE.EXPORT_NAMED ?
      statement.declaration : statement;
    if (declaration?.type === NODE_TYPE.VARIABLE_DECLARATION) {
      declarators.push(...declaration.declarations);
    }
  }
  return declarators;
}

function leaderContext(parsed) {
  const context = {leaderNames: new Set(), leaderCollections: new Set(),
    taintedNames: new Set(), taintedFunctions: new Set()};
  walkNodes(parsed.ast, (node) => {
    const name = node.type === NODE_TYPE.IMPORT_SPECIFIER ? node.local.name : undefined;
    if (name && regexpTest(IMPORTED_LEADER_NAME, name) && regexpTest(IMPORTED_ROLE_NAME, name)) {
      context.leaderNames.add(name);
    }
  });
  const declarators = arrayFilter(moduleDeclarators(parsed.ast), (declarator) =>
    declarator.id.type === NODE.IDENTIFIER && declarator.init);
  for (let pass = 0; pass < FIXPOINT_PASSES; pass += 1) {
    for (const declarator of declarators) {
      if (isLeaderToken(declarator.init, context)) context.leaderNames.add(declarator.id.name);
      if (isLeaderCollection(declarator.init, context)) {
        context.leaderCollections.add(declarator.id.name);
      }
    }
  }
  return context;
}

function roleReadSites(parsed, sites) {
  const context = leaderContext(parsed);
  for (let pass = 0; pass < FIXPOINT_PASSES && taintPass(parsed, context); pass += 1) {
    // Each pass widens the tainted locals and functions until none is added.
  }
  walkNodes(parsed.ast, (node) => {
    for (const found of roleComparisons(node, context)) {
      sites.push(site(SEMANTIC_ROW.ROLE_READ, parsed, found));
    }
  });
}

// The nodes at which `node` compares a row role read with a leader token.
function roleComparisons(node, context) {
  if (node.type === NODE.BINARY && COMPARISON_OPERATORS.has(node.operator)) {
    const compares = (isLeaderToken(node.left, context) && isTainted(node.right, context)) ||
      (isLeaderToken(node.right, context) && isTainted(node.left, context));
    return compares ? [node] : [];
  }
  if (node.type === NODE_TYPE.SWITCH && isTainted(node.discriminant, context)) {
    return arrayFilter(node.cases, (switchCase) =>
      Boolean(switchCase.test) && isLeaderToken(switchCase.test, context));
  }
  return node.type === NODE.CALL && isLeaderMembership(node, context) ? [node] : [];
}

function isLeaderMembership(call, context) {
  const callee = unwrapChain(call.callee);
  return callee.type === NODE.MEMBER && !callee.computed &&
    MEMBERSHIP_METHODS.has(callee.property.name) &&
    context.leaderCollections.has(nameOf(callee.object)) &&
    call.arguments.length === 1 && isTainted(call.arguments[0], context);
}

// --- fixture rows -----------------------------------------------------------

function isRoleKey(property) {
  if (property.type !== NODE_TYPE.PROPERTY) return false;
  if (property.computed) return columnName(property.key) === ROLE_COLUMN;
  return ROLE_FIELDS.has(keyName(property));
}

function fixtureRowKind(object, parsed) {
  for (const property of object.properties) {
    if (property.type !== NODE_TYPE.PROPERTY) continue;
    const typed = property.computed ? TYPE_COLUMNS.has(columnName(property.key)) :
      TYPE_KEYS.has(keyName(property));
    if (!typed) continue;
    const text = stringToLowerCase(stringSlice(parsed.text, property.value.range[0],
      property.value.range[1]));
    if (regexpTest(EXEMPT_TYPE, text)) return SEMANTIC_ROW.FIXTURE_EXEMPT;
    if (regexpTest(MESSAGE_GROUP_TYPE, text)) return SEMANTIC_ROW.FIXTURE_MESSAGE_GROUP;
  }
  return SEMANTIC_ROW.FIXTURE;
}

function fixtureSites(parsed, sites) {
  const context = leaderContext(parsed);
  walkNodes(parsed.ast, (node) => {
    if (node.type === NODE_TYPE.OBJECT) {
      for (const property of node.properties) {
        if (isRoleKey(property) && containsLeader(property.value, context)) {
          sites.push(site(fixtureRowKind(node, parsed), parsed, property));
        }
      }
    } else if (node.type === NODE_TYPE.ASSIGNMENT && isRoleField(node.left) &&
        containsLeader(node.right, context)) {
      sites.push(site(SEMANTIC_ROW.FIXTURE, parsed, node));
    } else if (node.type === NODE_TYPE.ASSIGNMENT_PATTERN &&
        ROLE_FIELDS.has(nameOf(node.left)) && containsLeader(node.right, context)) {
      sites.push(site(SEMANTIC_ROW.FIXTURE, parsed, node));
    }
  });
}

function parseOrRecord(root, file, failures) {
  try {
    return parseNavigabilitySource(readSource(root, file), file);
  } catch (error) {
    failures.push({file, message: String(error.message)});
    return undefined;
  }
}

function testFixtureSites(root, sites, unparsedFiles) {
  for (const file of sourceFiles(root, TEST_DIRECTORY)) {
    if (!regexpTest(FIXTURE_HINT, readSource(root, file))) continue;
    const parsed = parseOrRecord(root, file, unparsedFiles);
    if (parsed) fixtureSites(parsed, sites);
  }
}

/**
 * Every semantic-row site of a checkout.
 * @param {string} root the checkout
 * @param {{rows?: Set<string>}} options the rows to measure (default all)
 * @return {{sites: Array<{row, file, line}>, parseFailures: Array}} the sites
 */
function detectSemanticSites(root, options = {}) {
  const wanted = (row) => !options.rows || options.rows.has(row);
  const sites = [];
  const unparsedFiles = [];
  const sourceRows = arrayFilter([SEMANTIC_ROW.READ_MODE, SEMANTIC_ROW.LEADER_MODE,
    SEMANTIC_ROW.ROLE_READ], wanted);
  const scanners = {
    [SEMANTIC_ROW.LEADER_MODE]: leaderModeSites,
    [SEMANTIC_ROW.ROLE_READ]: roleReadSites,
  };
  const enums = {keys: new Set(), values: new Set(), declaredValues: new Set(), members: []};
  const readModeFiles = [];
  for (const file of sourceRows.length > 0 ? sourceFiles(root, SOURCE_DIRECTORY) : []) {
    const text = readSource(root, file);
    const rows = arrayFilter(sourceRows, (row) => regexpTest(SOURCE_HINTS[row], text));
    if (rows.length === 0) continue;
    const parsed = parseOrRecord(root, file, unparsedFiles);
    if (!parsed) continue;
    for (const row of rows) {
      if (row === SEMANTIC_ROW.READ_MODE) {
        collectReadModeEnums(parsed, enums);
        readModeFiles.push(parsed);
      } else {
        scanners[row](parsed, sites);
      }
    }
  }
  sites.push(...enums.members);
  for (const parsed of readModeFiles) readModeSites(parsed, enums, sites);
  if (wanted(SEMANTIC_ROW.FIXTURE) || wanted(SEMANTIC_ROW.FIXTURE_MESSAGE_GROUP)) {
    testFixtureSites(root, sites, unparsedFiles);
  }
  return {sites, parseFailures: unparsedFiles};
}

export {SEMANTIC_ROW, detectSemanticSites};
