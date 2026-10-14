// Timeout-declaration extraction for the test harness.
//
// tap arms ONE root timer per file - TAP_TIMEOUT seconds, 30 by default - and
// a test's own `{timeout: N}` cannot extend it, so run-test-files.js must read
// each file's declarations and export the root budget they add up to. That
// extraction used to be a regex over raw source matching only literal digits
// — but system-guidelines forbids magic numbers, so the guideline-compliant
// form `{timeout: TOOLCHAIN_TIMEOUT_MS}` was INERT and 18 files silently ran
// under the 30s root timer while declaring 45s-300s.
//
// This module parses instead of pattern-matching, for three reasons a wider
// regex could not satisfy: comments and string literals can never be mistaken
// for declarations, only options objects actually passed to a test call are
// considered, and — most important — anything it cannot resolve is REPORTED
// rather than silently treated as absent. A future refactor to
// `const T = BASE * MULTIPLIER;` must fail loudly, not quietly reinstate the
// 30s cap.

import fs from 'node:fs';
import path from 'node:path';

import * as espree from 'espree';

const PARSE_OPTIONS = Object.freeze({
  ecmaVersion: 'latest',
  loc: true,
  sourceType: 'module',
});
const TIMEOUT_PROPERTY = 'timeout';
const TEST_CALLEE_NAMES = Object.freeze(new Set([
  'test', 'it', 'describe', 'suite',
]));
// `test.only`, `t.skip`, `it.todo` are still test declarations; matching only
// on the property name missed them entirely and silently returned no timeout.
const TEST_ROOT_NAMES = Object.freeze(new Set([
  'test', 't', 'tap', 'it', 'describe', 'suite',
]));
const TEST_MODIFIER_NAMES = Object.freeze(new Set(['only', 'skip', 'todo']));
const TAP_MODULE_SPECIFIER = 'tap';
const NODE_TEST_MODULE = 'node:test';
const SHARED_TAP_MODULE_SUFFIX = `${'src'}${path.sep}${'test-helpers'}${path.sep}${'tap.js'}`;
const SET_TIMEOUT_METHOD = 'setTimeout';
const NODE_TYPE = Object.freeze({
  ASSIGNMENT: 'AssignmentExpression',
  AWAIT: 'AwaitExpression',
  IMPORT_EXPRESSION: 'ImportExpression',
  IMPORT_DECLARATION: 'ImportDeclaration',
  BINARY: 'BinaryExpression',
  CALL: 'CallExpression',
  EXPRESSION_STATEMENT: 'ExpressionStatement',
  SPREAD: 'SpreadElement',
  VARIABLE_DECLARATION: 'VariableDeclaration',
  IMPORT_SPECIFIER: 'ImportSpecifier',
  IDENTIFIER: 'Identifier',
  LITERAL: 'Literal',
  MEMBER: 'MemberExpression',
  OBJECT: 'ObjectExpression',
  PROPERTY: 'Property',
  VARIABLE_DECLARATOR: 'VariableDeclarator',
});
const AMBIGUOUS_IDENTIFIER_PROBLEM =
  'timeout declaration names an identifier bound more than once to different ' +
  'numeric values, so its value is ambiguous';
const UNRESOLVED_IDENTIFIER_PROBLEM =
  'timeout declaration names an identifier that is not a file-local numeric ' +
  'const';
const UNSUPPORTED_EXPRESSION_PROBLEM =
  'timeout declaration is an expression this harness cannot resolve ' +
  'statically; use a literal or a file-local numeric const';
const PARSE_FAILURE_PROBLEM = 'could not be parsed for timeout declarations';
const COMPUTED_KEY_PROBLEM =
  'timeout declaration uses a computed key, which this harness does not ' +
  'resolve; write it as a plain `timeout:` property';
const SPREAD_OPTIONS_PROBLEM =
  'test options object is built by spread, so a timeout inside it cannot be ' +
  'resolved statically; declare `timeout:` directly on the options object';
const DIVIDE_BY_ZERO_PROBLEM =
  'timeout declaration divides by zero';
const CONST_KIND = 'const';
const RELATIVE_SPECIFIER_PREFIX = '.';
const UTF8_ENCODING = 'utf8';
const OPERATOR_MULTIPLY = '*';
const OPERATOR_ADD = '+';
const OPERATOR_SUBTRACT = '-';
const OPERATOR_DIVIDE = '/';
const ARITHMETIC_OPERATORS = Object.freeze(new Set([
  OPERATOR_MULTIPLY, OPERATOR_ADD, OPERATOR_SUBTRACT, OPERATOR_DIVIDE,
]));
const AST_METADATA_KEYS = Object.freeze(new Set(['loc', 'range', 'parent']));

// Ambient-intrinsic hardening (system-guidelines): capture at module load so a
// replaced prototype cannot reroute declaration resolution.
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);

function applyArithmetic(operator, left, right) {
  if (operator === OPERATOR_MULTIPLY) return left * right;
  if (operator === OPERATOR_ADD) return left + right;
  if (operator === OPERATOR_SUBTRACT) return left - right;
  return right === 0 ? null : left / right;
}

function isTimeoutKeyName(key, computed) {
  if (computed) {
    return key.type === NODE_TYPE.LITERAL && key.value === TIMEOUT_PROPERTY;
  }
  if (key.type === NODE_TYPE.IDENTIFIER) return key.name === TIMEOUT_PROPERTY;
  return key.type === NODE_TYPE.LITERAL && key.value === TIMEOUT_PROPERTY;
}

function isTestCallee(callee) {
  if (!callee) return false;
  if (callee.type === NODE_TYPE.IDENTIFIER) {
    return TEST_CALLEE_NAMES.has(callee.name);
  }
  if (callee.type === NODE_TYPE.MEMBER && !callee.computed) {
    const property = callee.property?.type === NODE_TYPE.IDENTIFIER ?
      callee.property.name : null;
    if (property === null) return false;
    // Over-inclusive on purpose for the `<anything>.test(...)` shape: the only
    // consequence is lifting a watchdog that did not need lifting, whereas
    // missing a declaration reinstates the silent 30s cap.
    if (TEST_CALLEE_NAMES.has(property)) return true;
    return TEST_MODIFIER_NAMES.has(property) &&
      callee.object?.type === NODE_TYPE.IDENTIFIER &&
      TEST_ROOT_NAMES.has(callee.object.name);
  }
  return false;
}

function isTimeoutKey(property) {
  if (property.type !== NODE_TYPE.PROPERTY) return false;
  return isTimeoutKeyName(property.key, property.computed);
}

// Every `const NAME = <number>` binding at any depth, plus the names bound
// more than once to DIFFERENT values. Ambiguity is reported lazily, only if a
// timeout declaration actually references such a name: test files are full of
// ordinary re-bound numerics (`i`, `now`, `port`) that have nothing to do with
// timeouts, and flagging those would be noise, not safety.
function collectNumericConstants(ast) {
  const constants = new Map();
  const ambiguous = new Set();
  walk(ast, (node) => {
    // Only `const` bindings are stable enough to resolve. A `let`/`var` holding
    // a number can be reassigned anywhere, so treating it as constant would
    // silently report whichever literal happened to be written last.
    if (node.type === NODE_TYPE.VARIABLE_DECLARATION &&
      node.kind !== CONST_KIND) {
      for (const declarator of node.declarations) {
        if (declarator.id?.type === NODE_TYPE.IDENTIFIER) {
          ambiguous.add(declarator.id.name);
        }
      }
      return;
    }
    // Any later assignment to a name also makes it unresolvable.
    if (node.type === NODE_TYPE.ASSIGNMENT &&
      node.left?.type === NODE_TYPE.IDENTIFIER) {
      ambiguous.add(node.left.name);
      return;
    }
    if (node.type !== NODE_TYPE.VARIABLE_DECLARATOR) return;
    if (node.id?.type !== NODE_TYPE.IDENTIFIER) return;
    if (node.init?.type !== NODE_TYPE.LITERAL) return;
    if (typeof node.init.value !== 'number') return;
    const existing = constants.get(node.id.name);
    if (existing !== undefined && existing !== node.init.value) {
      ambiguous.add(node.id.name);
    }
    constants.set(node.id.name, node.init.value);
  });
  return {ambiguous, constants};
}

// localName -> {specifier, importedName} for plain named imports.
function collectImportBindings(ast) {
  const imports = new Map();
  for (const node of ast.body) {
    if (node.type !== NODE_TYPE.IMPORT_DECLARATION) continue;
    const specifier = node.source?.value;
    if (typeof specifier !== 'string') continue;
    for (const entry of node.specifiers) {
      if (entry.type !== NODE_TYPE.IMPORT_SPECIFIER) continue;
      imports.set(entry.local.name, {
        importedName: entry.imported?.name ?? entry.local.name,
        specifier,
      });
    }
  }
  return imports;
}

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (AST_METADATA_KEYS.has(key)) continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) walk(item, visit);
    } else if (child && typeof child.type === 'string') {
      walk(child, visit);
    }
  }
}

// Named imports of numeric constants, resolved ONE level deep against a
// relative specifier. The project's canonical pattern is a shared owner such
// as src/test-helpers/test-timeout-constants.js, so refusing to follow it
// would force files to duplicate a constant purely to satisfy this harness.
// Only `export const NAME = <number>` is honoured; a re-export or a computed
// export stays unresolved and is reported.
function resolveImportedConstant(bindings, name, fromFile) {
  const binding = bindings.imports?.get(name);
  if (!binding ||
    !stringStartsWith(binding.specifier, RELATIVE_SPECIFIER_PREFIX)) {
    return null;
  }
  const modulePath = path.resolve(path.dirname(fromFile), binding.specifier);
  let source;
  try {
    source = fs.readFileSync(modulePath, UTF8_ENCODING);
  } catch {
    return null;
  }
  let ast;
  try {
    ast = espree.parse(source, PARSE_OPTIONS);
  } catch {
    return null;
  }
  const exported = collectNumericConstants(ast);
  if (exported.ambiguous.has(binding.importedName)) return null;
  const value = exported.constants.get(binding.importedName);
  return value === undefined ? null : value;
}

function resolveTimeoutValue(valueNode, bindings, context, problems) {
  const {location, fromFile} = context;
  if (valueNode.type === NODE_TYPE.LITERAL &&
    typeof valueNode.value === 'number') {
    return valueNode.value;
  }
  if (valueNode.type === NODE_TYPE.IDENTIFIER) {
    const {name} = valueNode;
    if (bindings.ambiguous.has(name)) {
      problems.push(`${AMBIGUOUS_IDENTIFIER_PROBLEM}: ${name} at ${location}`);
      return null;
    }
    const local = bindings.constants.get(name);
    if (local !== undefined) return local;
    const imported = resolveImportedConstant(bindings, name, fromFile);
    if (imported !== null) return imported;
    problems.push(`${UNRESOLVED_IDENTIFIER_PROBLEM}: ${name} at ${location}`);
    return null;
  }
  // Constant folding over resolvable operands, so a deliberate
  // `TOOLCHAIN_TIMEOUT_MS * 2` stays legible instead of forcing a magic
  // number. Still fully static: an operand this function cannot resolve
  // propagates as a reported problem, never as a silent fallback.
  if (valueNode.type === NODE_TYPE.BINARY &&
    ARITHMETIC_OPERATORS.has(valueNode.operator)) {
    const left = resolveTimeoutValue(valueNode.left, bindings, context, problems);
    const right =
      resolveTimeoutValue(valueNode.right, bindings, context, problems);
    if (left === null || right === null) return null;
    const folded = applyArithmetic(valueNode.operator, left, right);
    if (folded === null) {
      problems.push(`${DIVIDE_BY_ZERO_PROBLEM} at ${location}`);
      return null;
    }
    if (!Number.isFinite(folded)) {
      problems.push(
        `${UNSUPPORTED_EXPRESSION_PROBLEM}: non-finite result at ${location}`);
      return null;
    }
    return folded;
  }
  problems.push(
    `${UNSUPPORTED_EXPRESSION_PROBLEM}: ${valueNode.type} at ${location}`);
  return null;
}

// The call a top-level statement makes, if it is one: `t.test(...)`,
// `await t.test(...)` or `t.setTimeout(...)` written at the file's top level.
// Only these are known to run exactly once, directly under the root test; a
// call inside a loop, a function or a subtest body is not top-level.
function topLevelCall(statement) {
  if (statement.type !== NODE_TYPE.EXPRESSION_STATEMENT) return null;
  const expression = statement.expression?.type === NODE_TYPE.AWAIT ?
    statement.expression.argument : statement.expression;
  return expression?.type === NODE_TYPE.CALL ? expression : null;
}

function collectTopLevelCalls(ast) {
  const calls = new Set();
  for (const statement of ast.body) {
    const call = topLevelCall(statement);
    if (call !== null) calls.add(call);
  }
  return calls;
}

// `t.setTimeout(N)` / `tap.setTimeout(N)` on a test root: the file's own
// declaration of its whole root budget.
function isRootSetTimeoutCallee(callee) {
  return callee?.type === NODE_TYPE.MEMBER && !callee.computed &&
    callee.property?.type === NODE_TYPE.IDENTIFIER &&
    callee.property.name === SET_TIMEOUT_METHOD &&
    callee.object?.type === NODE_TYPE.IDENTIFIER &&
    TEST_ROOT_NAMES.has(callee.object.name);
}

// One property of a test call's options object: its resolved `timeout:`, or
// null when it is not a resolvable timeout declaration (a spread or a
// computed key is reported, like an unresolvable value).
function declaredPropertyTimeout(property, bindings, filePath, problems) {
  const line = property.loc?.start?.line ?? 0;
  const location = `${filePath}:${line}`;
  // An options object assembled by spread may carry a timeout this module
  // cannot see; staying silent would reinstate the 30s cap.
  if (property.type === NODE_TYPE.SPREAD) {
    problems.push(`${SPREAD_OPTIONS_PROBLEM} at ${location}`);
    return null;
  }
  if (!isTimeoutKey(property)) return null;
  if (property.computed) {
    problems.push(`${COMPUTED_KEY_PROBLEM} at ${location}`);
    return null;
  }
  return resolveTimeoutValue(property.value, bindings, {
    fromFile: filePath,
    location,
  }, problems);
}

// The largest resolvable `timeout:` among one test call's options objects, or
// null when the call declares none.
function declaredCallTimeout(node, bindings, filePath, problems) {
  let declared = null;
  for (const argument of node.arguments) {
    if (argument?.type !== NODE_TYPE.OBJECT) continue;
    for (const property of argument.properties) {
      const value =
        declaredPropertyTimeout(property, bindings, filePath, problems);
      if (value !== null && (declared === null || value > declared)) {
        declared = value;
      }
    }
  }
  return declared;
}

// The budget a top-level `t.setTimeout(N)` declares, or null when the call is
// not one or its argument does not resolve (reported, like any declaration).
function declaredRootTimeout(call, bindings, filePath, problems) {
  if (!isRootSetTimeoutCallee(call.callee)) return null;
  const [budget] = call.arguments;
  if (budget === undefined) return null;
  const line = budget.loc?.start?.line ?? 0;
  return resolveTimeoutValue(budget, bindings, {
    fromFile: filePath,
    location: `${filePath}:${line}`,
  }, problems);
}

// What a file's imports declare, over one parsed AST, at import-statement
// and dynamic-import-call altitude alike. The classification is decided by
// resolved import specifiers, never by a filename pattern. `tap` reports
// whether the file arms the tap root timer; `nodeTest` reports whether it
// declares itself a pure node:test file; the fail-closed rule applies
// whenever the extraction cannot resolve what a dynamic import reaches.
function classifyDeclaredModules(imports, unresolvedDynamic) {
  let nodeTest = false;
  let tap = false;
  const reach = (specifier) => {
    if (specifier === NODE_TEST_MODULE) nodeTest = true;
    if (specifier === TAP_MODULE_SPECIFIER ||
        stringEndsWith(path.resolve(imports.directory, specifier),
          SHARED_TAP_MODULE_SUFFIX)) {
      tap = true;
    }
  };
  for (const specifier of imports.specifiers) reach(specifier);
  // An unresolvable runtime is never a silent exemption: fail closed to the
  // budgeted class (tap), whose admission decides against the watchdog.
  return {
    nodeTest: nodeTest && !tap && !unresolvedDynamic,
    tap: tap || unresolvedDynamic,
  };
}

function collectDeclaredModules(ast, filePath) {
  const imports = {directory: path.dirname(filePath), specifiers: []};
  let unresolvedDynamic = false;
  for (const node of ast.body) {
    if (node.type !== NODE_TYPE.IMPORT_DECLARATION) continue;
    if (typeof node.source?.value === 'string') {
      imports.specifiers.push(node.source.value);
    } else {
      unresolvedDynamic = true;
    }
  }
  walk(ast, (node) => {
    if (node.type !== NODE_TYPE.IMPORT_EXPRESSION) return;
    // espree models a dynamic `import(specifier)` as an ImportExpression
    // whose `source` is the specifier expression (acorn's shape, not a
    // CallExpression with an `Import` callee).
    const source = node.source;
    if (source?.type === NODE_TYPE.LITERAL &&
        typeof source.value === 'string') {
      imports.specifiers.push(source.value);
    } else {
      unresolvedDynamic = true;
    }
  });
  return classifyDeclaredModules(imports, unresolvedDynamic);
}

// One source read by the caller, one parse here: the runtime a file declares
// and the timeout declarations it carries, for the runner's single budget
// decision. `runtime` is the fail-closed classification (tap arms the root
// timer even when node:test is imported beside it, and an unresolvable
// dynamic import is treated as reaching tap rather than silently bypassing
// admission); `timeouts` is the same shape extractTimeoutDeclarations pins.
export function extractTestFileProfile(source, filePath) {
  let ast;
  try {
    ast = espree.parse(source, PARSE_OPTIONS);
  } catch (error) {
    return {
      runtime: {nodeTest: false, tap: true},
      timeouts: {
        fileMilliseconds: 0,
        milliseconds: 0,
        problems: [`${filePath} ${PARSE_FAILURE_PROBLEM}: ${error.message}`],
        topLevelMilliseconds: 0,
      },
    };
  }
  return {
    runtime: collectDeclaredModules(ast, filePath),
    timeouts: extractDeclarationsFromAst(ast, filePath),
  };
}

export function declaredTestRuntime(source, filePath) {
  try {
    const ast = espree.parse(source, PARSE_OPTIONS);
    return collectDeclaredModules(ast, filePath);
  } catch {
    return {nodeTest: false, tap: true};
  }
}

export function extractTimeoutDeclarations(source, filePath) {
  let ast;
  try {
    ast = espree.parse(source, PARSE_OPTIONS);
  } catch (error) {
    return {
      fileMilliseconds: 0,
      milliseconds: 0,
      problems: [`${filePath} ${PARSE_FAILURE_PROBLEM}: ${error.message}`],
      topLevelMilliseconds: 0,
    };
  }
  return extractDeclarationsFromAst(ast, filePath);
}

function extractDeclarationsFromAst(ast, filePath) {
  const problems = [];
  const bindings = collectNumericConstants(ast);
  bindings.imports = collectImportBindings(ast);
  const topLevelCalls = collectTopLevelCalls(ast);
  let largest = 0;
  let topLevelSum = 0;
  let fileBudget = 0;
  walk(ast, (node) => {
    if (node.type !== NODE_TYPE.CALL || !isTestCallee(node.callee)) return;
    const declared = declaredCallTimeout(node, bindings, filePath, problems);
    if (declared === null) return;
    if (declared > largest) largest = declared;
    if (topLevelCalls.has(node)) topLevelSum += declared;
  });
  for (const call of topLevelCalls) {
    const declared = declaredRootTimeout(call, bindings, filePath, problems);
    if (declared !== null && declared > fileBudget) fileBudget = declared;
  }
  return {
    fileMilliseconds: fileBudget,
    milliseconds: largest,
    problems,
    topLevelMilliseconds: topLevelSum,
  };
}
