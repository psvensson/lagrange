#!/usr/bin/env node

// Constant-member existence audit (rules R06/R07, owner guideline-audits).
//
// `SOME_CONST.MISSING_MEMBER` evaluates to `undefined` without any error, and
// the undefined then acts as a key, an argument, a comparison operand or a
// message. The 2026-11-11 census found 40 such reads in src: option defaults
// written under the key "undefined", SQL naming a column `undefined`, errors
// thrown with no message. ESLint cannot see the class: no rule reads a
// property against the value of a named import, and the project is not
// type-checked.
//
// The audit fails on every read of a member that does not exist on a CLOSED
// constants object. Closed means the member set is fixed and known:
//
//   - an imported binding whose value is a plain object, or a module
//     namespace (the module is loaded and the real value inspected, so
//     re-exports, spreads and computed members are exact). The value is
//     judged by its members at module load: an imported object that gains
//     members later is a registry, and a registry is read by computed key;
//   - a `const X = Object.freeze({...})` literal in the same file, in any
//     scope, whose keys are all statically known;
//   - a `const` alias or destructure of either, and a frozen object nested
//     inside either.
//
//   - an injected bag: a parameter named like a constant, or a key of a
//     destructured parameter or unresolvable value (`const {COLUMN} =
//     options`), is judged against the one module export of that name once
//     every module is loaded; a name no module exports, or two modules export
//     with different values, is counted unexamined;
//   - an imported or same-file exported class, by its static members.
//
// Reads are `X.MEMBER`, `X?.MEMBER`, `X['MEMBER']`, `` X[`MEMBER`] ``,
// `const {MEMBER} = X` and nested destructures `const {A: {B}} = X`.
// A write target, a destructure with a default and a same-file literal that
// is not frozen are not judged. A module that cannot be loaded fails the
// audit, because every read through it would otherwise go unexamined.
//
// Violations have no baseline: the count is zero or the audit fails. What
// the audit could not judge is counted per reason, listed under --json, and
// ratcheted one-way against UNEXAMINED_BASELINE_FILE.
//
// Usage:
//   node scripts/checks/check-constant-member-existence.js [--root <dir>]...
//                                                          [--json]

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {Linter} from 'eslint';
import {KEYS} from 'eslint-visitor-keys';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_ROOTS = Object.freeze(['src']);
// The AST and its scope analysis come from ESLint's own parse of the file:
// one rule reads them from the SourceCode it is handed.
const SCOPE_PLUGIN = 'constant-member-existence';
const SCOPE_RULE = 'capture-scope';
const SCOPE_CONFIG = Object.freeze([{
  plugins: {[SCOPE_PLUGIN]: {rules: {[SCOPE_RULE]: {
    create: (context) => ({Program() {
      context.settings.capture(context.sourceCode);
    }}),
  }}}},
  rules: {[`${SCOPE_PLUGIN}/${SCOPE_RULE}`]: 'error'},
  languageOptions: {ecmaVersion: 'latest', sourceType: 'module'},
}]);
const TEXT_ENCODING = 'utf8';
const JS_SUFFIX = '.js';
const MJS_SUFFIX = '.mjs';
const RELATIVE_PREFIX = '.';
const POSIX_SEPARATOR = '/';
const SKIPPED_DIRECTORY = 'node_modules';
const ROOT_FLAG = '--root';
const JSON_FLAG = '--json';
const FREEZE_OBJECT = 'Object';
const FREEZE_METHOD = 'freeze';
const CONST_KIND = 'const';
const DEFAULT_EXPORT = 'default';
const CONSTANT_BASE_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const TYPEOF_OBJECT = 'object';
const TYPEOF_STRING = 'string';
const TYPEOF_NUMBER = 'number';
const NO_KEYS = Object.freeze([]);
const MODULE_NAMESPACE_TAG = 'Module';
const UNDESCRIBED_BASE = '<expression>';
const LINE_SEPARATOR = '\n';

const NODE = Object.freeze({
  ASSIGNMENT: 'AssignmentExpression',
  ASSIGNMENT_PATTERN: 'AssignmentPattern',
  CALL: 'CallExpression',
  IDENTIFIER: 'Identifier',
  IMPORT_DECLARATION: 'ImportDeclaration',
  IMPORT_DEFAULT: 'ImportDefaultSpecifier',
  IMPORT_NAMESPACE: 'ImportNamespaceSpecifier',
  IMPORT_SPECIFIER: 'ImportSpecifier',
  LITERAL: 'Literal',
  MEMBER: 'MemberExpression',
  OBJECT: 'ObjectExpression',
  OBJECT_PATTERN: 'ObjectPattern',
  TEMPLATE: 'TemplateLiteral',
  PROPERTY: 'Property',
  SPREAD: 'SpreadElement',
  UNARY: 'UnaryExpression',
  UPDATE: 'UpdateExpression',
  VARIABLE_DECLARATOR: 'VariableDeclarator',
});
const DEFINITION = Object.freeze({
  CLASS: 'ClassName',
  IMPORT: 'ImportBinding',
  PARAMETER: 'Parameter',
  VARIABLE: 'Variable',
});
const DELETE_OPERATOR = 'delete';
const VIOLATION_KIND = Object.freeze({
  MEMBER_READ: 'missing_member_read',
  DESTRUCTURE: 'missing_member_destructure',
  INJECTED: 'missing_member_injected',
});
// Why a constant-looking read (`ALL_CAPS.member`) was not judged.
const UNCHECKED_REASON = Object.freeze({
  UNRESOLVED_BASE: 'base_not_a_resolvable_const',
  MUTABLE_BASE: 'base_object_not_frozen',
  OPEN_LITERAL: 'base_literal_has_unknown_keys',
  NOT_AN_OBJECT: 'base_value_not_a_plain_object',
  EXTERNAL_MODULE: 'base_imported_from_a_package',
  // An injected bag (a parameter, or a destructure of one) carries a
  // constants object under a name no module exports as a plain object, or
  // under a name two modules export with different values.
  INJECTED_UNKNOWN_NAME: 'injected_bag_name_not_an_exported_constant',
  INJECTED_AMBIGUOUS_NAME: 'injected_bag_name_exported_with_two_values',
  INJECTED_DEFAULTED: 'injected_bag_binding_has_a_default',
});
const MESSAGE = Object.freeze({
  FAILURE: 'constant-member existence: a read of a member that does not ' +
    'exist evaluates to undefined; use the owner\'s existing member or ' +
    'define the member in its owner constants module',
  LOAD_FAILURE: 'constant-member existence: a module could not be loaded, ' +
    'so reads through it were not examined',
  NO_SUCH_MEMBER: 'no such member',
  SUCCESS_PREFIX: 'constant-member existence: ok',
  RATCHET_FAILURE: 'constant-member existence: unexamined-read ratchet',
});
// The unexamined count is one-way (R23): per reason, it may fall and never
// rise above the committed baseline. A missing baseline is refused rather
// than read as unlimited. It applies to the default scope only.
const UNEXAMINED_BASELINE_FILE =
  'scripts/checks/constant-member-existence-unexamined-baseline.json';

// Module-load intrinsic captures (governed-tree rule: no direct ambient
// prototype-method calls on data in scripts/checks).
const arrayFind = Function.call.bind(Array.prototype.find);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringSplit = Function.call.bind(String.prototype.split);
const regexpTest = Function.call.bind(RegExp.prototype.test);
const objectHasOwn = Object.hasOwn;

const OPAQUE = Object.freeze({closed: false, reason: UNCHECKED_REASON.NOT_AN_OBJECT});
const UNRESOLVED = Object.freeze({
  closed: false, reason: UNCHECKED_REASON.UNRESOLVED_BASE,
});
const MUTABLE = Object.freeze({
  closed: false, reason: UNCHECKED_REASON.MUTABLE_BASE,
});
const EXTERNAL = Object.freeze({
  closed: false, reason: UNCHECKED_REASON.EXTERNAL_MODULE,
});

function firstLine(error) {
  return stringSplit(String(error?.message ?? error), LINE_SEPARATOR)[0];
}

function toPosix(filePath) {
  return stringSplit(filePath, path.sep).join(POSIX_SEPARATOR);
}

function* walkSourceFiles(directory) {
  const stat = fs.statSync(directory, {throwIfNoEntry: false});
  if (!stat) return;
  if (stat.isFile()) {
    if (stringEndsWith(directory, JS_SUFFIX)) yield directory;
    return;
  }
  const entries = fs.readdirSync(directory, {withFileTypes: true});
  entries.sort((left, right) => (left.name < right.name ? -1 : 1));
  for (const entry of entries) {
    if (entry.name === SKIPPED_DIRECTORY) continue;
    yield* walkSourceFiles(path.join(directory, entry.name));
  }
}

function isModuleNamespace(value) {
  return value !== null && typeof value === TYPEOF_OBJECT &&
    value[Symbol.toStringTag] === MODULE_NAMESPACE_TAG;
}

function isPlainObject(value) {
  if (value === null || typeof value !== TYPEOF_OBJECT) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

const functionToString = Function.call.bind(Function.prototype.toString);
const CLASS_SOURCE_PREFIX = 'class';
function isClassValue(value) {
  return typeof value === 'function' &&
    stringStartsWith(functionToString(value), CLASS_SOURCE_PREFIX);
}

// The model of a value loaded from a real module.
function loadedValueModel(value) {
  if (isModuleNamespace(value)) {
    return {
      closed: true,
      has: (name) => name in value,
      get: (name) => loadedValueModel(value[name]),
    };
  }
  if (isClassValue(value)) {
    return {closed: true, has: (name) => name in value,
      get: (name) => loadedValueModel(value[name])};
  }
  if (!isPlainObject(value)) return OPAQUE;
  return {
    closed: true,
    has: (name) => name in value,
    get: (name) => loadedValueModel(value[name]),
  };
}

// `Object.freeze` itself, as a callee or as a captured intrinsic's value.
function isObjectFreezeReference(node) {
  return node?.type === NODE.MEMBER &&
    node.computed === false &&
    node.object?.type === NODE.IDENTIFIER &&
    node.object.name === FREEZE_OBJECT &&
    node.property?.name === FREEZE_METHOD;
}

function staticKeyName(node, computed) {
  if (!computed && node.type === NODE.IDENTIFIER) return node.name;
  if (computed && node.type === NODE.TEMPLATE && node.expressions.length === 0) {
    return node.quasis[0].value.cooked;
  }
  if (node.type === NODE.LITERAL &&
      (typeof node.value === TYPEOF_STRING ||
       typeof node.value === TYPEOF_NUMBER)) {
    return String(node.value);
  }
  return null;
}

// The key path from a destructuring pattern to one of its bindings:
// `{A: {B: target}}` is ['A', 'B']. A default anywhere on the way is noted,
// because a binding with a default states its own absent case.
function findBindingPath(pattern, target) {
  if (!pattern) return null;
  if (pattern === target) return {path: [], defaulted: false};
  if (pattern.type === NODE.ASSIGNMENT_PATTERN) {
    const found = findBindingPath(pattern.left, target);
    return found ? {path: found.path, defaulted: true} : null;
  }
  if (pattern.type !== NODE.OBJECT_PATTERN) return null;
  for (const property of pattern.properties) {
    if (property.type !== NODE.PROPERTY) continue;
    const found = findBindingPath(property.value, target);
    if (!found) continue;
    const key = staticKeyName(property.key, property.computed);
    return key === null ? null :
      {path: [key, ...found.path], defaulted: found.defaulted};
  }
  return null;
}

// A constants object handed in through an injected bag (`function f(COLUMN)`,
// `const {COLUMN} = options`): the bag carries it under its owner's exported
// name, so its member set is that export's, judged once every module is
// loaded. Reads through it extend the key path.
function injectedModel(name, path) {
  return {
    closed: false,
    reason: UNCHECKED_REASON.INJECTED_UNKNOWN_NAME,
    injected: {name, path},
    get: (member) => injectedModel(name, [...path, member]),
  };
}

function memberModel(model, name) {
  return typeof model.get === 'function' ? model.get(name) : UNRESOLVED;
}

// ESLint resolves references to the built-in globals it declares (a
// global-scope variable with no definition); this audit judges the module's
// own declarations only, so such a reference stays unresolved.
const GLOBAL_SCOPE_TYPE = 'global';
function isDeclaredInSource(variable) {
  return variable.scope.type !== GLOBAL_SCOPE_TYPE || variable.defs.length > 0;
}

/**
 * Parse one module and analyze its scopes through ESLint's public API.
 * @param {string} text - The module source.
 * @return {{ast: Object, scopeManager: Object}} ESLint's AST and scopes.
 */
function analyzeSource(text) {
  let sourceCode = null;
  const config = [{...SCOPE_CONFIG[0], settings: {capture: (captured) => {
    sourceCode = captured;
  }}}];
  const fatal = arrayFind(new Linter().verify(text, config), (message) => message.fatal);
  if (fatal) throw new Error(fatal.message);
  return {ast: sourceCode.ast, scopeManager: sourceCode.scopeManager};
}

/**
 * One file's analysis: resolves expressions to value models and reports the
 * reads that name a member a closed model does not have.
 */
class FileAnalysis {
  constructor({filePath, relativePath, loadModule}) {
    this.filePath = filePath;
    this.relativePath = relativePath;
    this.loadModule = loadModule;
    this.variableByIdentifier = new Map();
    this.modelByVariable = new Map();
    this.resolving = new Set();
    this.violations = [];
    this.checkedReads = 0;
    this.uncheckedReads = [];
    this.injectedReads = [];
  }

  async run() {
    const text = fs.readFileSync(this.filePath, TEXT_ENCODING);
    const {ast, scopeManager} = analyzeSource(text);
    for (const scope of scopeManager.scopes) {
      for (const reference of scope.references) {
        if (reference.resolved && isDeclaredInSource(reference.resolved)) {
          this.variableByIdentifier.set(
            reference.identifier, reference.resolved);
        }
      }
    }
    await this.preloadImports(ast);
    this.visit(ast, null);
  }

  // Loading is asynchronous and resolution is not, so every relative module
  // this file imports is loaded before the walk.
  async preloadImports(ast) {
    for (const statement of ast.body) {
      // An import, or a re-export (`export ... from`): the module it names
      // exports constants an injected bag may carry.
      if (!statement.source) continue;
      const target = this.resolveImportTarget(statement.source.value);
      if (target) await this.loadModule(target);
    }
  }

  resolveImportTarget(source) {
    if (typeof source !== TYPEOF_STRING ||
        !stringStartsWith(source, RELATIVE_PREFIX)) {
      return null;
    }
    if (!stringEndsWith(source, JS_SUFFIX) &&
        !stringEndsWith(source, MJS_SUFFIX)) {
      return null;
    }
    return path.resolve(path.dirname(this.filePath), source);
  }

  visit(node, parent) {
    if (!node || typeof node.type !== TYPEOF_STRING) return;
    if (node.type === NODE.MEMBER) this.checkMemberRead(node, parent);
    if (node.type === NODE.VARIABLE_DECLARATOR) this.checkDestructure(node);
    const keys = KEYS[node.type] || NO_KEYS;
    for (const key of keys) {
      const child = node[key];
      if (Array.isArray(child)) {
        for (const item of child) this.visit(item, node);
      } else {
        this.visit(child, node);
      }
    }
  }

  isWriteTarget(node, parent) {
    if (!parent) return false;
    if (parent.type === NODE.ASSIGNMENT && parent.left === node) return true;
    if (parent.type === NODE.UPDATE) return true;
    return parent.type === NODE.UNARY && parent.operator === DELETE_OPERATOR;
  }

  checkMemberRead(node, parent) {
    const name = staticKeyName(node.property, node.computed);
    if (name === null || this.isWriteTarget(node, parent)) return;
    const model = this.resolveExpression(node.object);
    this.judgeRead({model, name, site: node, kind: VIOLATION_KIND.MEMBER_READ,
      baseNode: node.object, base: this.describe(node.object)});
  }

  checkDestructure(declarator) {
    if (declarator.id?.type !== NODE.OBJECT_PATTERN || !declarator.init) return;
    this.checkPattern(declarator.id, this.resolveExpression(declarator.init),
      declarator.init, this.describe(declarator.init));
  }

  // Every key of a destructuring pattern is a read of its base, and a
  // nested pattern reads the member it names.
  checkPattern(pattern, model, baseNode, base) {
    for (const property of pattern.properties) {
      if (property.type !== NODE.PROPERTY) continue;
      if (property.value?.type === NODE.ASSIGNMENT_PATTERN) continue;
      const name = staticKeyName(property.key, property.computed);
      if (name === null) continue;
      this.judgeRead({model, name, site: property,
        kind: VIOLATION_KIND.DESTRUCTURE, baseNode, base});
      if (property.value?.type === NODE.OBJECT_PATTERN) {
        this.checkPattern(property.value, memberModel(model, name), baseNode,
          `${base}.${name}`);
      }
    }
  }

  judgeRead({model, name, site, kind, baseNode, base}) {
    const root = this.constantRoot(baseNode);
    if (model.injected && root) {
      this.injectedReads.push({...this.siteOf(site), base, member: name,
        name: model.injected.name, path: model.injected.path});
      return;
    }
    if (model.closed !== true) {
      if (root) this.countUnchecked(site, root, model.reason);
      return;
    }
    this.checkedReads += 1;
    if (!model.has(name)) {
      this.violations.push({kind, ...this.siteOf(site), base, member: name});
    }
  }

  // The binding a read goes through, when it is named like a constant and
  // bound in this file. A global root (JSON, Math) is no constants object,
  // so it is not part of what went unexamined.
  constantRoot(node) {
    let root = node;
    while (root?.type === NODE.MEMBER) root = root.object;
    return root?.type === NODE.IDENTIFIER &&
      regexpTest(CONSTANT_BASE_NAME_PATTERN, root.name) &&
      this.variableByIdentifier.has(root) ? root : null;
  }

  siteOf(node) {
    return {
      file: this.relativePath,
      line: node.loc.start.line,
      column: node.loc.start.column + 1,
    };
  }

  countUnchecked(node, root, modelReason) {
    const reason = modelReason || UNCHECKED_REASON.UNRESOLVED_BASE;
    this.uncheckedReads.push({
      file: this.relativePath,
      line: node.loc.start.line,
      base: root.name,
      reason,
    });
  }

  describe(node) {
    if (node.type === NODE.IDENTIFIER) return node.name;
    if (node.type === NODE.MEMBER) {
      const name = staticKeyName(node.property, node.computed);
      return `${this.describe(node.object)}.${name}`;
    }
    return UNDESCRIBED_BASE;
  }

  resolveExpression(node) {
    if (!node) return UNRESOLVED;
    if (node.type === NODE.IDENTIFIER) {
      const variable = this.variableByIdentifier.get(node);
      return variable ? this.resolveVariable(variable) : UNRESOLVED;
    }
    if (node.type === NODE.MEMBER) {
      const name = staticKeyName(node.property, node.computed);
      if (name === null) return UNRESOLVED;
      const base = this.resolveExpression(node.object);
      return typeof base.get === 'function' ? base.get(name) : UNRESOLVED;
    }
    if (this.isFreezeCall(node)) {
      return this.resolveLiteral(node.arguments[0], true);
    }
    if (node.type === NODE.OBJECT) return this.resolveLiteral(node, false);
    return UNRESOLVED;
  }

  // `Object.freeze(x)`, or a call of a const that captures Object.freeze
  // (`const objectFreeze = Object.freeze`, the module-load capture idiom).
  isFreezeCall(node) {
    if (node?.type !== NODE.CALL || node.arguments.length !== 1) return false;
    if (isObjectFreezeReference(node.callee)) return true;
    if (node.callee?.type !== NODE.IDENTIFIER) return false;
    const variable = this.variableByIdentifier.get(node.callee);
    const definition = variable?.defs.length === 1 ? variable.defs[0] : null;
    if (definition?.type !== DEFINITION.VARIABLE ||
        definition.parent?.kind !== CONST_KIND) {
      return false;
    }
    const {id, init} = definition.node;
    if (id.type === NODE.IDENTIFIER) return isObjectFreezeReference(init);
    // `const {freeze: objectFreeze} = Object`.
    const found = findBindingPath(id, definition.name);
    return init?.type === NODE.IDENTIFIER && init.name === FREEZE_OBJECT &&
      !this.variableByIdentifier.has(init) && found?.defaulted === false &&
      found.path.length === 1 && found.path[0] === FREEZE_METHOD;
  }

  // A same-file object literal. Its key set is known only when every key is
  // static and every spread is itself a closed model.
  resolveLiteral(node, frozen) {
    if (node?.type !== NODE.OBJECT) {
      return frozen ? this.resolveExpression(node) : UNRESOLVED;
    }
    const valueByKey = new Map();
    const spreads = [];
    let complete = true;
    for (const property of node.properties) {
      if (property.type === NODE.SPREAD) {
        const spread = this.resolveExpression(property.argument);
        if (spread.closed === true) {
          spreads.push(spread);
        } else {
          complete = false;
        }
        continue;
      }
      const name = staticKeyName(property.key, property.computed);
      if (name === null) {
        complete = false;
        continue;
      }
      valueByKey.set(name, property.value);
    }
    const get = (name) => {
      if (valueByKey.has(name)) {
        return this.resolveExpression(valueByKey.get(name));
      }
      for (const spread of spreads) {
        if (spread.has(name)) return spread.get(name);
      }
      return UNRESOLVED;
    };
    // A member of a literal that is not frozen can be reassigned, so neither
    // the literal nor anything read through it is closed.
    if (!frozen) return MUTABLE;
    if (!complete) {
      return {closed: false, reason: UNCHECKED_REASON.OPEN_LITERAL, get};
    }
    const has = (name) => {
      if (valueByKey.has(name) || name in Object.prototype) return true;
      for (const spread of spreads) {
        if (spread.has(name)) return true;
      }
      return false;
    };
    return {closed: true, has, get};
  }

  resolveVariable(variable) {
    if (this.modelByVariable.has(variable)) {
      return this.modelByVariable.get(variable);
    }
    if (this.resolving.has(variable)) return UNRESOLVED;
    this.resolving.add(variable);
    const model = this.resolveDefinition(variable);
    this.resolving.delete(variable);
    this.modelByVariable.set(variable, model);
    return model;
  }

  resolveDefinition(variable) {
    if (variable.defs.length !== 1) return UNRESOLVED;
    const definition = variable.defs[0];
    if (definition.type === DEFINITION.IMPORT) {
      return this.resolveImport(definition);
    }
    if (definition.type === DEFINITION.PARAMETER) {
      return this.resolveParameter(definition);
    }
    if (definition.type === DEFINITION.CLASS) {
      return this.resolveOwnClass(definition.name.name);
    }
    if (definition.type !== DEFINITION.VARIABLE ||
        definition.parent?.kind !== CONST_KIND) {
      return UNRESOLVED;
    }
    const declarator = definition.node;
    if (declarator.id.type === NODE.IDENTIFIER) {
      return this.resolveExpression(declarator.init);
    }
    const found = findBindingPath(declarator.id, definition.name);
    if (!found || found.defaulted) return UNRESOLVED;
    const base = this.resolveExpression(declarator.init);
    // A destructure of a value this file cannot resolve (a parameter, a
    // call's result) unpacks a bag; a same-file literal is never one.
    if (typeof base.get !== 'function' && base !== MUTABLE &&
        declarator.init?.type !== NODE.OBJECT) {
      return this.injectedBinding(found.path);
    }
    let model = base;
    for (const name of found.path) model = memberModel(model, name);
    return model;
  }

  // A class this file declares and exports under its own name, once some
  // other module has loaded this one (this audit never loads a module only
  // to read its own statics). Its static members are judged as loaded.
  resolveOwnClass(name) {
    const own = this.loadModule.peek(this.filePath);
    return own && objectHasOwn(own, name) && isClassValue(own[name]) ?
      loadedValueModel(own[name]) : UNRESOLVED;
  }

  resolveParameter(definition) {
    for (const parameter of definition.node.params || NO_KEYS) {
      const found = findBindingPath(parameter, definition.name);
      if (!found) continue;
      if (found.defaulted) {
        return {closed: false, reason: UNCHECKED_REASON.INJECTED_DEFAULTED};
      }
      return this.injectedBinding(found.path.length > 0 ?
        found.path : [definition.name.name]);
    }
    return UNRESOLVED;
  }

  // The bag's key names the constant; deeper keys are reads through it.
  injectedBinding(path) {
    const [name, ...rest] = path;
    return regexpTest(CONSTANT_BASE_NAME_PATTERN, name) ?
      injectedModel(name, rest) : UNRESOLVED;
  }

  resolveImport(definition) {
    const source = definition.parent.source.value;
    const target = this.resolveImportTarget(source);
    if (!target) {
      return stringStartsWith(String(source), RELATIVE_PREFIX) ?
        UNRESOLVED : EXTERNAL;
    }
    const loaded = this.loadModule.peek(target);
    if (!loaded) return UNRESOLVED;
    const specifier = definition.node;
    if (specifier.type === NODE.IMPORT_NAMESPACE) {
      return loadedValueModel(loaded);
    }
    const exportedName = specifier.type === NODE.IMPORT_DEFAULT ?
      DEFAULT_EXPORT :
      (specifier.imported.name ?? String(specifier.imported.value));
    if (!objectHasOwn(loaded, exportedName) && !(exportedName in loaded)) {
      return UNRESOLVED;
    }
    return loadedValueModel(loaded[exportedName]);
  }
}

function createModuleLoader(repoRoot) {
  const moduleByPath = new Map();
  const unloadableModules = [];
  const loadModule = async (filePath) => {
    if (moduleByPath.has(filePath)) return moduleByPath.get(filePath);
    let loaded = null;
    try {
      loaded = await import(pathToFileURL(filePath).href);
    } catch (error) {
      unloadableModules.push({
        file: toPosix(path.relative(repoRoot, filePath)),
        error: firstLine(error),
      });
    }
    moduleByPath.set(filePath, loaded);
    return loaded;
  };
  loadModule.peek = (filePath) => moduleByPath.get(filePath) || null;
  loadModule.loaded = () => [...moduleByPath.values()];
  return {loadModule, failures: unloadableModules};
}

// Every constant-named export of every loaded module, by name, with the
// distinct values exported under it.
function indexExportedConstants(loadedModules) {
  const valuesByName = new Map();
  for (const loaded of loadedModules) {
    if (!loaded) continue;
    for (const name of Object.keys(loaded)) {
      if (!regexpTest(CONSTANT_BASE_NAME_PATTERN, name)) continue;
      if (!valuesByName.has(name)) valuesByName.set(name, new Set());
      valuesByName.get(name).add(loaded[name]);
    }
  }
  return valuesByName;
}

function judgeInjectedRead(read, exportedConstants) {
  const {name, path: keyPath, member, ...site} = read;
  const values = exportedConstants.get(name);
  const uncheckedAs = (reason) => ({unchecked: {file: site.file,
    line: site.line, base: site.base, reason}});
  if (!values) return uncheckedAs(UNCHECKED_REASON.INJECTED_UNKNOWN_NAME);
  if (values.size !== 1) {
    return uncheckedAs(UNCHECKED_REASON.INJECTED_AMBIGUOUS_NAME);
  }
  let model = loadedValueModel([...values][0]);
  for (const key of keyPath) model = memberModel(model, key);
  if (model.closed !== true) {
    return uncheckedAs(model.reason || UNCHECKED_REASON.UNRESOLVED_BASE);
  }
  if (model.has(member)) return {checked: true};
  return {checked: true, violation: {kind: VIOLATION_KIND.INJECTED,
    file: site.file, line: site.line, column: site.column, base: site.base,
    member}};
}

/**
 * Audit every `.js` file under the given roots.
 * @param {Object} [options]
 * @param {string} [options.repoRoot] - Directory the roots are relative to.
 * @param {string[]} [options.roots] - Directories or files to audit.
 * @return {Promise<{violations: Object[], loadFailures: Object[],
 *   parseFailures: Object[], stats: Object}>}
 */
async function auditConstantMemberExistence(options = {}) {
  const repoRoot = options.repoRoot || REPO_ROOT;
  const roots = options.roots || DEFAULT_ROOTS;
  const {loadModule, failures: loadFailures} = createModuleLoader(repoRoot);
  const violations = [];
  const unparsedFiles = [];
  const uncheckedByReason = {};
  const uncheckedReads = [];
  const injectedReads = [];
  let fileCount = 0;
  let checkedReads = 0;
  for (const root of roots) {
    for (const filePath of walkSourceFiles(path.resolve(repoRoot, root))) {
      fileCount += 1;
      const relativePath = toPosix(path.relative(repoRoot, filePath));
      const analysis = new FileAnalysis({filePath, relativePath, loadModule});
      try {
        await analysis.run();
      } catch (error) {
        unparsedFiles.push({
          file: relativePath,
          error: firstLine(error),
        });
        continue;
      }
      checkedReads += analysis.checkedReads;
      violations.push(...analysis.violations);
      uncheckedReads.push(...analysis.uncheckedReads);
      injectedReads.push(...analysis.injectedReads);
    }
  }
  const exportedConstants = indexExportedConstants(loadModule.loaded());
  for (const read of injectedReads) {
    const judged = judgeInjectedRead(read, exportedConstants);
    if (judged.violation) violations.push(judged.violation);
    if (judged.checked) checkedReads += 1;
    if (judged.unchecked) uncheckedReads.push(judged.unchecked);
  }
  for (const read of uncheckedReads) {
    uncheckedByReason[read.reason] = (uncheckedByReason[read.reason] || 0) + 1;
  }
  return {
    violations,
    loadFailures,
    parseFailures: unparsedFiles,
    uncheckedReads,
    stats: {fileCount, checkedReads, uncheckedByReason},
  };
}

function formatViolation(violation) {
  return `${violation.file}:${violation.line}:${violation.column} ` +
    `${violation.base}.${violation.member}: ${MESSAGE.NO_SUCH_MEMBER} ` +
    `(${violation.kind})`;
}

/**
 * Compare unexamined reads, per reason, with the committed one-way baseline.
 * @param {string} repoRoot - Directory holding the baseline file.
 * @param {Object<string, number>} uncheckedByReason - This run's counts.
 * @return {{failures: string[], tightenable: string[]}} Rises (failures)
 *   and falls the baseline can be tightened to.
 */
function judgeUnexaminedRatchet(repoRoot, uncheckedByReason) {
  const baselinePath = path.join(repoRoot, UNEXAMINED_BASELINE_FILE);
  let baseline;
  try {
    baseline = JSON.parse(fs.readFileSync(baselinePath, TEXT_ENCODING))
      .unexaminedByReason;
  } catch (error) {
    return {failures: [`unreadable ${UNEXAMINED_BASELINE_FILE}: ` +
      `${firstLine(error)}; the ratchet refuses to run without a baseline`],
    tightenable: []};
  }
  const failures = [];
  const tightenable = [];
  const reasons = new Set([...Object.keys(baseline ?? {}),
    ...Object.keys(uncheckedByReason)]);
  for (const reason of reasons) {
    const allowed = baseline?.[reason] ?? 0;
    const count = uncheckedByReason[reason] ?? 0;
    if (!Number.isSafeInteger(allowed) || allowed < 0) {
      failures.push(`${reason}: baseline is not a non-negative integer`);
    } else if (count > allowed) {
      failures.push(`${reason}: ${count} unexamined reads exceed the ` +
        `one-way baseline of ${allowed}; make the base resolvable (import ` +
        'the owner constant, freeze the literal) instead of raising it');
    } else if (count < allowed) {
      tightenable.push(`${reason} from ${allowed} to ${count}`);
    }
  }
  return {failures, tightenable};
}

function parseArguments(argv) {
  const roots = [];
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === ROOT_FLAG) {
      index += 1;
      if (typeof argv[index] === TYPEOF_STRING) roots.push(argv[index]);
    } else if (argv[index] === JSON_FLAG) {
      json = true;
    }
  }
  return {roots: roots.length > 0 ? roots : DEFAULT_ROOTS, json};
}

// The process ends with process.exit, which drops buffered pipe output, so
// every line is written synchronously.
const STDOUT = 1;
const STDERR = 2;
function writeLine(descriptor, text) {
  fs.writeSync(descriptor, `${text}${LINE_SEPARATOR}`);
}

async function main(argv) {
  const {roots, json} = parseArguments(argv);
  const result = await auditConstantMemberExistence({
    repoRoot: process.cwd(),
    roots,
  });
  const ratchet = roots === DEFAULT_ROOTS ?
    judgeUnexaminedRatchet(process.cwd(), result.stats.uncheckedByReason) :
    null;
  const failed = result.violations.length > 0 ||
    result.loadFailures.length > 0 || result.parseFailures.length > 0 ||
    (ratchet !== null && ratchet.failures.length > 0);
  if (json) {
    writeLine(STDOUT, JSON.stringify({ok: !failed, ratchet, ...result}, null, 2));
    return failed ? 1 : 0;
  }
  for (const failure of ratchet?.failures ?? NO_KEYS) {
    writeLine(STDERR, `${MESSAGE.RATCHET_FAILURE}: ${failure}`);
  }
  for (const violation of result.violations) {
    writeLine(STDERR, formatViolation(violation));
  }
  for (const failure of [...result.loadFailures, ...result.parseFailures]) {
    writeLine(STDERR, `${failure.file}: ${failure.error}`);
  }
  const summary = `${result.stats.fileCount} files, ` +
    `${result.stats.checkedReads} member reads checked, ` +
    `${result.uncheckedReads.length} constant-looking reads unexamined ` +
    `${JSON.stringify(result.stats.uncheckedByReason)}`;
  if (result.violations.length > 0) {
    writeLine(STDERR, `${MESSAGE.FAILURE} (${result.violations.length})`);
  }
  if (result.loadFailures.length + result.parseFailures.length > 0) {
    writeLine(STDERR, MESSAGE.LOAD_FAILURE);
  }
  if (failed) {
    writeLine(STDERR, summary);
    return 1;
  }
  writeLine(STDOUT, `${MESSAGE.SUCCESS_PREFIX} (${summary})`);
  for (const hint of ratchet?.tightenable ?? NO_KEYS) {
    writeLine(STDOUT, `Baseline can be tightened in ${UNEXAMINED_BASELINE_FILE}: ` +
      hint);
  }
  return 0;
}

if (process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Loaded source modules may hold timers or handles; the verdict is final
  // once computed, so the process ends on it.
  process.exit(await main(process.argv.slice(2)));
}

export {
  UNEXAMINED_BASELINE_FILE,
  UNCHECKED_REASON,
  VIOLATION_KIND,
  auditConstantMemberExistence,
  formatViolation,
};
