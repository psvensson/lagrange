// Timeout-declaration extraction for the test harness.
//
// tap silently caps every test at its 30s default and only the TAP_TIMEOUT env
// genuinely lifts it, so run-test-files.js must read each file's declared
// timeout and export it. That extraction used to be a regex over raw source
// matching only literal digits — but system-guidelines forbids magic numbers,
// so the guideline-compliant form `{timeout: TOOLCHAIN_TIMEOUT_MS}` was INERT
// and 18 files silently ran under the 30s cap while declaring 45s-300s.
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
const NODE_TYPE = Object.freeze({
  ASSIGNMENT: 'AssignmentExpression',
  BINARY: 'BinaryExpression',
  CALL: 'CallExpression',
  SPREAD: 'SpreadElement',
  VARIABLE_DECLARATION: 'VariableDeclaration',
  IMPORT_DECLARATION: 'ImportDeclaration',
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

// Returns {milliseconds, problems}. `milliseconds` is the largest resolvable
// declaration (0 when there is none); `problems` is non-empty when a
// declaration exists but could not be resolved — callers must fail closed on
// it rather than fall back to the default cap.
export function extractTimeoutDeclarations(source, filePath) {
  const problems = [];
  let ast;
  try {
    ast = espree.parse(source, PARSE_OPTIONS);
  } catch (error) {
    return {
      milliseconds: 0,
      problems: [`${filePath} ${PARSE_FAILURE_PROBLEM}: ${error.message}`],
    };
  }
  const bindings = collectNumericConstants(ast);
  bindings.imports = collectImportBindings(ast);
  let largest = 0;
  walk(ast, (node) => {
    if (node.type !== NODE_TYPE.CALL || !isTestCallee(node.callee)) return;
    for (const argument of node.arguments) {
      if (argument?.type !== NODE_TYPE.OBJECT) continue;
      for (const property of argument.properties) {
        const line = property.loc?.start?.line ?? 0;
        const location = `${filePath}:${line}`;
        // An options object assembled by spread may carry a timeout this
        // module cannot see; staying silent would reinstate the 30s cap.
        if (property.type === NODE_TYPE.SPREAD) {
          problems.push(`${SPREAD_OPTIONS_PROBLEM} at ${location}`);
          continue;
        }
        if (!isTimeoutKey(property)) continue;
        if (property.computed) {
          problems.push(`${COMPUTED_KEY_PROBLEM} at ${location}`);
          continue;
        }
        const value = resolveTimeoutValue(property.value, bindings, {
          fromFile: filePath,
          location,
        }, problems);
        if (value !== null && value > largest) largest = value;
      }
    }
  });
  return {milliseconds: largest, problems};
}
