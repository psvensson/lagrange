/**
 * Source model for the code-navigability detectors: how a file under `src/`
 * is parsed, walked and turned into sites. The patterns themselves are
 * recognised only in scripts/checks/code-navigability-detectors.js (and the
 * fallback-family module it re-exports); this module owns what a site IS,
 * so every pattern reports the same identity.
 *
 * A site is `{row, file, range, loc, hash, occurrence, kind, detail}`: `file`
 * repo-relative with `/`, `hash` the sha256 of `file + '\n' + slice`, and
 * `occurrence` the 0-based index among sites of one file with the same hash
 * (two identical slices in one file are told apart by order). The census
 * binds its records to (file, hash, occurrence), so a site survives edits
 * elsewhere in its file and is voided when its own text changes.
 *
 * The typeof-function comparison is defined here once, because three rows
 * (owner-port feature detection, value-or-promise checks, typeof dual
 * paths) read it.
 *
 * Governed by the ambient-intrinsic audit: prototype methods are captured at
 * module load.
 */
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {parse} from 'espree';
import {KEYS} from 'eslint-visitor-keys';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringSplit = Function.call.bind(String.prototype.split);
const objectHasOwn = Object.hasOwn;

const PARSE_OPTIONS = Object.freeze({
  ecmaVersion: 'latest', sourceType: 'module', loc: true, range: true,
});
const DIGEST_ALGORITHM = 'sha256';
const DIGEST_ENCODING = 'hex';
const HASH_SEPARATOR = '\n';
const TEXT_ENCODING = 'utf8';
const JS_SUFFIX = '.js';
const PATH_SEPARATOR = '/';
const NO_KEYS = Object.freeze([]);
const NODE_TYPE_FIELD = 'string';

const NODE = Object.freeze({
  BINARY: 'BinaryExpression',
  CALL: 'CallExpression',
  CHAIN: 'ChainExpression',
  CLASS_DECLARATION: 'ClassDeclaration',
  EXPORT_NAMED: 'ExportNamedDeclaration',
  FUNCTION_DECLARATION: 'FunctionDeclaration',
  IDENTIFIER: 'Identifier',
  LITERAL: 'Literal',
  LOGICAL: 'LogicalExpression',
  MEMBER: 'MemberExpression',
  TEMPLATE: 'TemplateLiteral',
  THIS: 'ThisExpression',
  UNARY: 'UnaryExpression',
  VARIABLE_DECLARATION: 'VariableDeclaration',
});

const STRICT_EQUALITY = '===';
const STRICT_INEQUALITY = '!==';
const TYPEOF_OPERATOR = 'typeof';
const FUNCTION_TYPE_NAME = 'function';
const FUNCTION_CONSTANT_NAME = /(^|_)FUNCTION(_|$)/u;
const PROMISE_METHODS = Object.freeze(new Set(['then', 'catch']));
const STRING_TYPE_NAME = 'string';
const OBJECT_TYPE_NAME = 'object';
const NUMBER_TYPE_NAME = 'number';
const IDENTITY_FIELD = Object.freeze({
  ROW: 'row', FILE: 'file', HASH: 'hash', OCCURRENCE: 'occurrence',
});
const FALLBACK_OPERATORS = Object.freeze(new Set(['||', '??']));
const THIS_KEY = 'this';
const OPAQUE_KEY_PREFIX = '?';
const KEY_FIELD = '.';
const KEY_INDEX_OPEN = '[';
const KEY_INDEX_CLOSE = ']';
const KEY_CALL_OPEN = '(';
const KEY_CALL_CLOSE = ')';
const KEY_RANGE_SEPARATOR = ':';

function sha256(text) {
  return createHash(DIGEST_ALGORITHM).update(text).digest(DIGEST_ENCODING);
}

function parseNavigabilitySource(text, file) {
  return {file, text, ast: parse(text, PARSE_OPTIONS)};
}

function isPlainObject(value) {
  return typeof value === OBJECT_TYPE_NAME && value !== null && !Array.isArray(value);
}

// A field an object holds itself, or undefined: a record read from a census
// or classification file is judged by its own fields only, so a property
// inherited from a polluted Object.prototype never stands in for one.
function ownField(value, key) {
  const holds = typeof value === OBJECT_TYPE_NAME && value !== null && objectHasOwn(value, key);
  return holds ? value[key] : undefined;
}

function isNode(value) {
  return Boolean(value) && typeof value.type === NODE_TYPE_FIELD;
}

// The child nodes of a node, in visitor-key (source) order.
function childNodes(node) {
  const children = [];
  for (const key of KEYS[node.type] || NO_KEYS) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) if (isNode(child)) children.push(child);
    } else if (isNode(value)) {
      children.push(value);
    }
  }
  return children;
}

// Pre-order walk in source order, with the parent.
function walkNodes(node, visit, parent = null) {
  if (!isNode(node)) return;
  visit(node, parent);
  for (const child of childNodes(node)) walkNodes(child, visit, node);
}

function sourceSlice(parsed, node) {
  return parsed.text.slice(node.range[0], node.range[1]);
}

function rangeOf(node) {
  return [node.range[0], node.range[1]];
}

function makeSite(parsed, row, node, detail) {
  return {
    row,
    file: parsed.file,
    range: rangeOf(node),
    loc: node.loc,
    hash: sha256(`${parsed.file}${HASH_SEPARATOR}${sourceSlice(parsed, node)}`),
    occurrence: 0,
    kind: node.type,
    detail,
  };
}

// The identity of a site: (row, file, hash, occurrence). The census and the
// classification match on all four. Only an object whose row, file and hash
// are strings and whose occurrence is an integer number has one: null, an
// array, a string occurrence (`"0"` is not `0`) or a missing field has no
// identity and matches nothing, never coerced and never thrown on. Only own
// fields count (ownField).
function siteIdentity(entry) {
  if (!isPlainObject(entry)) return undefined;
  const row = ownField(entry, IDENTITY_FIELD.ROW);
  const file = ownField(entry, IDENTITY_FIELD.FILE);
  const hash = ownField(entry, IDENTITY_FIELD.HASH);
  const occurrence = ownField(entry, IDENTITY_FIELD.OCCURRENCE);
  const valid = typeof row === STRING_TYPE_NAME && typeof file === STRING_TYPE_NAME &&
    typeof hash === STRING_TYPE_NAME && Number.isInteger(occurrence);
  if (!valid) return undefined;
  return `${row}${HASH_SEPARATOR}${file}${HASH_SEPARATOR}` +
    `${hash}${HASH_SEPARATOR}${occurrence}`;
}

function isFallbackChainTop(node, parent) {
  return node.type === NODE.LOGICAL && FALLBACK_OPERATORS.has(node.operator) &&
    !(parent && parent.type === NODE.LOGICAL && parent.operator === node.operator);
}

/**
 * The terms of a maximal same-operator `||` or `??` chain, left to right:
 * the one flattening every chain-reading detector uses.
 * @param {Object} node an AST node
 * @param {Object|null} parent its parent
 * @return {Array<Object>|undefined} the terms when node heads a chain
 */
function fallbackChainTerms(node, parent) {
  if (!isFallbackChainTop(node, parent)) return undefined;
  const terms = [];
  const stack = [node];
  while (stack.length > 0) {
    const term = stack.pop();
    if (term.type === NODE.LOGICAL && term.operator === node.operator) {
      stack.push(term.right, term.left);
    } else {
      terms.push(term);
    }
  }
  return terms;
}

// Number the sites of one row in one file that share a hash, in the order
// given, so every entry point numbers a site identically.
function assignOccurrences(sites) {
  const seen = new Map();
  for (const site of sites) {
    const key = `${site.row}${HASH_SEPARATOR}${site.file}${HASH_SEPARATOR}${site.hash}`;
    const occurrence = seen.get(key) || 0;
    site.occurrence = occurrence;
    seen.set(key, occurrence + 1);
  }
  return sites;
}

// 'function', or a named constant for it: an identifier or a non-computed
// member property with FUNCTION as a whole underscore-separated word
// (LOCAL_STR_FUNCTION, WATCHDOG_FUNCTION_TYPE, TYPE.FUNCTION; not isFunctional).
function isFunctionTypeOperand(node) {
  if (node.type === NODE.LITERAL) return node.value === FUNCTION_TYPE_NAME;
  if (node.type === NODE.IDENTIFIER) return FUNCTION_CONSTANT_NAME.test(node.name);
  return node.type === NODE.MEMBER && !node.computed &&
    FUNCTION_CONSTANT_NAME.test(String(node.property.name));
}

function isTypeofOperand(node) {
  return node.type === NODE.UNARY && node.operator === TYPEOF_OPERATOR;
}

// The typeof operand of a strict (in)equality, or undefined.
function strictTypeofOperand(node) {
  if (node.type !== NODE.BINARY) return undefined;
  if (node.operator !== STRICT_EQUALITY && node.operator !== STRICT_INEQUALITY) return undefined;
  if (isTypeofOperand(node.left)) return node.left;
  return isTypeofOperand(node.right) ? node.right : undefined;
}

// The member a strict typeof comparison inspects, whatever it is compared
// against (`typeof x.then === anything`), optional chain unwrapped.
function strictTypeofMember(node) {
  const operand = strictTypeofOperand(node);
  return operand ? memberOf(operand.argument) : undefined;
}

/**
 * The one definition of a typeof-function comparison: `typeof x === 'function'`
 * or `!==`, either side, or compared to a named constant for 'function': an
 * identifier or member property with FUNCTION as a whole underscore-separated
 * word (LOCAL_STR_FUNCTION, WATCHDOG_FUNCTION_TYPE, TYPE.FUNCTION).
 * @param {Object} node an AST node
 * @return {boolean} whether the node is such a comparison
 */
function isTypeofFunctionComparison(node) {
  if (node.type !== NODE.BINARY) return false;
  if (node.operator !== STRICT_EQUALITY && node.operator !== STRICT_INEQUALITY) return false;
  const typeofSide = isTypeofOperand(node.left) ? node.left :
    isTypeofOperand(node.right) ? node.right : node;
  const other = typeofSide === node.left ? node.right : node.left;
  return typeofSide !== node && isFunctionTypeOperand(other);
}

// An optional chain around a member (`a?.b`) is that member: every detector
// that tests for a member reads it through here.
function unwrapChain(node) {
  return node && node.type === NODE.CHAIN ? node.expression : node;
}

// The member a node reads, optional chain unwrapped, or undefined.
function memberOf(node) {
  const unwrapped = unwrapChain(node);
  return unwrapped && unwrapped.type === NODE.MEMBER ? unwrapped : undefined;
}

// The operand of a typeof-function comparison (the comparison must hold),
// optional chain unwrapped.
function typeofComparisonArgument(node) {
  return unwrapChain(isTypeofOperand(node.left) ? node.left.argument : node.right.argument);
}

// The string a computed key spells: a string literal or a template literal
// without expressions.
function staticKeyString(property) {
  if (property.type === NODE.LITERAL && typeof property.value === STRING_TYPE_NAME) {
    return property.value;
  }
  const template = property.type === NODE.TEMPLATE && property.expressions.length === 0;
  return template ? property.quasis[0].value.cooked : undefined;
}

// The field spelling a member reads: `a.x`, `a['x']` and a['x'] as a
// template literal read `x`.
function memberSpelling(member) {
  if (!member.computed) return member.property.name;
  return staticKeyString(member.property);
}

// The column constant a computed member reads: `row[COLUMN.X]` reads `X`.
function columnConstantName(member) {
  const property = member.property;
  return member.computed && property.type === NODE.MEMBER && !property.computed ?
    property.property.name : undefined;
}

function isPromiseMethodMember(member) {
  return Boolean(member) && PROMISE_METHODS.has(memberSpelling(member));
}

function memberTypeofComparison(node) {
  return isTypeofFunctionComparison(node) &&
    typeofComparisonArgument(node).type === NODE.MEMBER;
}

function memberPropertyKey(member) {
  const spelled = memberSpelling(member);
  if (spelled !== undefined) return `${KEY_FIELD}${spelled}`;
  const property = member.property;
  const index = property.type === NODE.LITERAL && typeof property.value === NUMBER_TYPE_NAME ?
    String(property.value) : structuralKey(property);
  return `${KEY_INDEX_OPEN}${index}${KEY_INDEX_CLOSE}`;
}

/**
 * A canonical serialisation of an expression's AST, so two reads of one
 * object compare equal however they are written: identifiers by name,
 * `this`, a field by its name whether written `.b`, `['b']` or a static
 * template, a numeric index by value, a call by its callee and argument
 * count (two calls of one callee with as many arguments read one object:
 * keying arguments by range would split textually identical calls), an
 * optional chain as its plain member. Any other node is opaque: keyed by its
 * own source range, it equals only itself.
 * @param {Object} node an AST node
 * @return {string} the key
 */
function structuralKey(node) {
  switch (node.type) {
  case NODE.CHAIN: return structuralKey(node.expression);
  case NODE.IDENTIFIER: return node.name;
  case NODE.THIS: return THIS_KEY;
  case NODE.MEMBER: return `${structuralKey(node.object)}${memberPropertyKey(node)}`;
  case NODE.CALL: return `${structuralKey(node.callee)}${KEY_CALL_OPEN}` +
    `${node.arguments.length}${KEY_CALL_CLOSE}`;
  default: return `${OPAQUE_KEY_PREFIX}${node.type}${KEY_RANGE_SEPARATOR}` +
    `${node.range[0]}${KEY_RANGE_SEPARATOR}${node.range[1]}`;
  }
}

// The object a member reads, as its structural key: `a?.b.x`, `a.b.x` and
// `a['b'].x` read one object, and `a[COLUMN.X]` reads object `a`.
function memberObjectKey(member) {
  return structuralKey(member.object);
}

function collectFiles(directory, files) {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectFiles(entryPath, files);
    else if (entry.isFile() && stringEndsWith(entry.name, JS_SUFFIX)) files.push(entryPath);
  }
  return files;
}

function relativeFile(root, file) {
  return stringSplit(path.relative(root, file), path.sep).join(PATH_SEPARATOR);
}

// Whether `<root>/<directory>` exists as a directory.
function directoryExists(root, directory) {
  const base = path.join(root, directory);
  return fs.existsSync(base) && fs.statSync(base).isDirectory();
}

// Every `.js` file under `<root>/<directory>`, repo-relative, sorted.
function sourceFiles(root, directory) {
  const base = path.join(root, directory);
  if (!fs.existsSync(base)) return [];
  const files = collectFiles(base, []);
  return arrayMap(files, (file) => relativeFile(root, file)).sort();
}

function readSource(root, file) {
  return fs.readFileSync(path.join(root, file), TEXT_ENCODING);
}

function declarationNames(declaration) {
  if (declaration.type === NODE.VARIABLE_DECLARATION) {
    return arrayFilter(arrayMap(declaration.declarations, (declarator) =>
      declarator.id.name), Boolean);
  }
  const named = declaration.type === NODE.FUNCTION_DECLARATION ||
    declaration.type === NODE.CLASS_DECLARATION;
  return named && declaration.id ? [declaration.id.name] : [];
}

// The names a module exports by declaration or specifier.
function moduleExportNames(parsed) {
  const names = [];
  for (const statement of parsed.ast.body) {
    if (statement.type !== NODE.EXPORT_NAMED) continue;
    if (statement.declaration) names.push(...declarationNames(statement.declaration));
    for (const specifier of statement.specifiers) names.push(specifier.exported.name);
  }
  return names;
}

export {
  NODE,
  assignOccurrences,
  childNodes,
  directoryExists,
  fallbackChainTerms,
  columnConstantName,
  isPromiseMethodMember,
  isTypeofFunctionComparison,
  makeSite,
  memberObjectKey,
  memberOf,
  memberSpelling,
  memberTypeofComparison,
  strictTypeofMember,
  moduleExportNames,
  ownField,
  parseNavigabilitySource,
  rangeOf,
  readSource,
  sha256,
  siteIdentity,
  sourceFiles,
  sourceSlice,
  structuralKey,
  typeofComparisonArgument,
  unwrapChain,
  walkNodes,
};
