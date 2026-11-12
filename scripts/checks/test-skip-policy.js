// No-skipped-tests source policy. Resolve framework bindings through ESLint's
// lexical scopes: a spelling such as `it` or `t.test` is not test authority.
// Source snippets, comments, data objects and shadowed imports are not tests.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Linter} from 'eslint';
import {parse} from 'espree';

const NODE = Object.freeze({
  MEMBER: 'MemberExpression',
  IDENTIFIER: 'Identifier',
  LITERAL: 'Literal',
  IMPORT_NAMESPACE: 'ImportNamespaceSpecifier',
  IMPORT_DEFAULT: 'ImportDefaultSpecifier',
  CALL: 'CallExpression',
  OBJECT_PATTERN: 'ObjectPattern',
  OBJECT: 'ObjectExpression',
  SPREAD: 'SpreadElement',
  TEMPLATE: 'TemplateLiteral',
  TEMPLATE_ELEMENT: 'TemplateElement',
});
const DEFINITION = Object.freeze({IMPORT: 'ImportBinding', PARAMETER: 'Parameter',
  VARIABLE: 'Variable'});
const CONST_KIND = 'const';
const DEFAULT_EXPORT = 'default';
const TEST = 'test';
const TAP_ROOT = 't';
const RELATIVE_PREFIX = '.';
const TAP_HELPER = fileURLToPath(new URL('../../src/test-helpers/tap.js', import.meta.url));
const FRAMEWORK = Object.freeze({NODE: 'node:test', TAP: 'tap', HELPER: 'tap-helper'});
const KIND = Object.freeze({NAMESPACE: 'namespace', REGISTER: 'register', CONTEXT: 'context',
  SKIP: 'skip', SUITE: 'suite', SUITE_CONTEXT: 'suite-context',
  HOOK: 'hook', UNRESOLVED: 'unresolved'});
const PROJECTION = Object.freeze({ABSENT: 'absent', PRESENT: 'present',
  UNRESOLVED: 'unresolved'});
const REGISTRATIONS = new Set([TEST, 'it', 'describe', 'suite']);
const SUITES = new Set(['describe', 'suite']);
const MODIFIERS = new Set(['only', 'todo']);
const EACH_HOOKS = new Set(['beforeEach', 'afterEach']);
const NODE_HOOKS = new Set([...EACH_HOOKS, 'before', 'after']);
const UNDEFINED = 'undefined';
const SKIP = 'skip';
const RULE = 'permission-policy/no-skipped-tests';

function propertyName(node, source, visited = new Set()) {
  const key = node.type === NODE.MEMBER ? node.property : node.key;
  if (!node.computed && key?.type === NODE.IDENTIFIER) return key.name;
  const value = constantValue(key, source, visited);
  return value?.type === NODE.LITERAL ? String(value.value) : null;
}

// Project the selected property, never the whole initializer of a
// destructured binding. Lexical aliases and constant computed keys share this
// value resolver, so ordinary sibling data cannot become a test option.
function projectedProperty(property, name, source, visited) {
  if (property.type === NODE.SPREAD) {
    return objectMember(constantValue(property.argument, source, visited),
      name, source, visited, true);
  }
  const key = propertyName(property, source, visited);
  if (key === null) return {kind: PROJECTION.UNRESOLVED};
  return key === name ? {kind: PROJECTION.PRESENT,
    value: constantValue(property.value, source, visited)} : {kind: PROJECTION.ABSENT};
}

// Only parser-owned literal values are boxed here, never executable source.
// String indices are enumerable; length is own but not copied by a spread.
function literalMember(value, name, enumerableOnly) {
  const descriptor = value === null || value === undefined ? null :
    Object.getOwnPropertyDescriptor(Object(value), name);
  if (!descriptor || (enumerableOnly && !descriptor.enumerable)) {
    return {kind: PROJECTION.ABSENT};
  }
  return {kind: PROJECTION.PRESENT, value: {type: NODE.LITERAL, value: descriptor.value}};
}

function objectMember(node, name, source, visited, enumerableOnly = false) {
  if (name === null) return {kind: PROJECTION.UNRESOLVED};
  if (node?.type === NODE.LITERAL) return literalMember(node.value, name, enumerableOnly);
  if (node?.type !== NODE.OBJECT || visited.has(node)) {
    return {kind: PROJECTION.UNRESOLVED};
  }
  visited.add(node);
  try {
    for (const property of [...node.properties].reverse()) {
      const result = projectedProperty(property, name, source, visited);
      // Present-but-unknown and unresolved spreads must stop projection;
      // neither means an earlier value survived the overwrite.
      if (result.kind !== PROJECTION.ABSENT) return result;
    }
    return {kind: PROJECTION.ABSENT};
  } finally {
    visited.delete(node);
  }
}

function destructuredValue(pattern, name, value, source, visited) {
  if (pattern.type === NODE.IDENTIFIER) return pattern.name === name ? value : null;
  if (pattern.type !== NODE.OBJECT_PATTERN) return null;
  for (const property of pattern.properties) {
    if (!property.value) continue;
    const member = objectMember(value,
      propertyName(property, source, visited), source, visited).value;
    const result = destructuredValue(property.value, name, member, source, visited);
    if (result) return result;
  }
  return null;
}

function constantValue(node, source, visited = new Set()) {
  if (!node || visited.has(node)) return null;
  if (node.type === NODE.TEMPLATE && node.expressions.length === 0) {
    return {type: NODE.LITERAL, value: node.quasis[0].value.cooked};
  }
  if (node.type !== NODE.IDENTIFIER && node.type !== NODE.MEMBER) return node;
  visited.add(node);
  try {
    if (node.type === NODE.MEMBER) {
      return objectMember(constantValue(node.object, source, visited),
        propertyName(node, source, visited), source, visited).value;
    }
    return identifierValue(node, source, visited);
  } finally {
    visited.delete(node);
  }
}

function identifierValue(node, source, visited) {
  const definition = variableOf(node, source)?.defs[0];
  if (!definition && node.name === UNDEFINED) return {type: NODE.LITERAL, value: undefined};
  if (definition?.type !== DEFINITION.VARIABLE || definition.parent.kind !== CONST_KIND) {
    return null;
  }
  const declaration = definition.node;
  return destructuredValue(declaration.id, node.name,
    constantValue(declaration.init, source, visited), source, visited);
}

function variableOf(node, source) {
  for (let scope = source.getScope(node); scope; scope = scope.upper) {
    const variable = scope.set.get(node.name);
    if (variable) return variable;
  }
  return null;
}

function frameworkOf(specifier, filename) {
  if (specifier === FRAMEWORK.NODE || specifier === FRAMEWORK.TAP) return specifier;
  if (specifier.startsWith(RELATIVE_PREFIX) &&
    path.resolve(path.dirname(filename), specifier) === TAP_HELPER) return FRAMEWORK.HELPER;
  return null;
}

function exportedBinding(framework, name) {
  if (framework === FRAMEWORK.TAP && name === TAP_ROOT) return {framework, kind: KIND.CONTEXT};
  if (framework === FRAMEWORK.TAP && name === SKIP) return {framework, kind: KIND.SKIP};
  if (name === DEFAULT_EXPORT) {
    return {framework, kind: framework === FRAMEWORK.NODE ? KIND.REGISTER : KIND.CONTEXT};
  }
  if (name === TEST || (framework === FRAMEWORK.NODE && REGISTRATIONS.has(name))) {
    return {framework, kind: SUITES.has(name) ? KIND.SUITE : KIND.REGISTER};
  }
  return hookBinding(framework, name, false);
}

function hookBinding(framework, name, onContext) {
  if (framework === FRAMEWORK.NODE && NODE_HOOKS.has(name)) {
    return {framework, kind: KIND.HOOK,
      contextKind: onContext ? KIND.CONTEXT : KIND.UNRESOLVED};
  }
  if (framework !== FRAMEWORK.NODE && EACH_HOOKS.has(name)) {
    return {framework, kind: KIND.HOOK, contextKind: KIND.CONTEXT};
  }
  return null;
}

// Most files contain no skip syntax at all. Parse every file (including
// escaped/computed keys), but only pay for lexical scopes where needed.
function containsSkipSyntax(node) {
  if (!node || typeof node !== 'object') return false;
  if ((node.type === NODE.IDENTIFIER && node.name === SKIP) ||
    (node.type === NODE.LITERAL && node.value === SKIP) ||
    (node.type === NODE.TEMPLATE_ELEMENT && node.value.cooked === SKIP)) return true;
  return Object.values(node).some((value) => Array.isArray(value) ?
    value.some(containsSkipSyntax) : containsSkipSyntax(value));
}

function memberBinding(owner, name) {
  if (!owner || owner.kind === KIND.SUITE_CONTEXT) return null;
  if (owner.kind === KIND.UNRESOLVED) return name === SKIP || name === TEST ? owner : null;
  if (owner.kind === KIND.NAMESPACE) return exportedBinding(owner.framework, name);
  if (name === SKIP) return {...owner, kind: KIND.SKIP};
  return registrationMember(owner, name);
}

function registrationMember(owner, name) {
  if (MODIFIERS.has(name) && isRegistration(owner)) return owner;
  if (name === TEST && owner.kind !== KIND.SUITE) return {...owner, kind: KIND.REGISTER};
  if (owner.kind === KIND.REGISTER && owner.framework === FRAMEWORK.NODE) {
    return exportedBinding(owner.framework, name);
  }
  return owner.kind === KIND.CONTEXT ? hookBinding(owner.framework, name, true) : null;
}

function importedBinding(definition, filename) {
  const framework = frameworkOf(definition.parent.source.value, filename);
  if (!framework) return null;
  const entry = definition.node;
  if (entry.type === NODE.IMPORT_NAMESPACE) return {framework, kind: KIND.NAMESPACE};
  return exportedBinding(framework, entry.type === NODE.IMPORT_DEFAULT ?
    DEFAULT_EXPORT : entry.imported.name);
}

// Callback parameters acquire authority only from real registrations or hooks.
function isRegistration(binding) {
  return binding?.kind === KIND.REGISTER || binding?.kind === KIND.SUITE;
}

function callbackBinding(definition, resolve, source) {
  const callback = definition.node;
  const call = callback.parent;
  if (call?.type !== NODE.CALL) return null;
  const owner = resolve(call.callee);
  const context = callbackContext(owner);
  if (!context || call.arguments.at(owner.kind === KIND.HOOK ? 0 : -1) !== callback) return null;
  return patternBinding(callback.params[0], definition.name.name, context, source);
}

function callbackContext(owner) {
  if (owner?.kind === KIND.HOOK) return {...owner, kind: owner.contextKind};
  if (!isRegistration(owner)) return null;
  return {...owner, kind: owner.kind === KIND.SUITE ? KIND.SUITE_CONTEXT : KIND.CONTEXT};
}

function patternBinding(pattern, name, owner, source) {
  if (pattern?.type === NODE.IDENTIFIER) return pattern.name === name ? owner : null;
  if (pattern?.type !== NODE.OBJECT_PATTERN) return null;
  const property = pattern.properties.find((entry) => entry.value?.name === name);
  return property ? memberBinding(owner, propertyName(property, source)) : null;
}

function constBinding(definition, name, resolve, source) {
  if (definition.parent.kind !== CONST_KIND) return null;
  const declaration = definition.node;
  const owner = resolve(declaration.init);
  return patternBinding(declaration.id, name, owner, source);
}

function declaredBinding(variable, name, resolve, context) {
  const {filename, source} = context;
  const [definition] = variable.defs;
  if (definition?.type === DEFINITION.IMPORT) return importedBinding(definition, filename);
  if (definition?.type === DEFINITION.PARAMETER) {
    const binding = callbackBinding(definition, resolve, source);
    if (binding && variable.references.some((reference) => reference.isWrite())) {
      return {...binding, kind: KIND.UNRESOLVED};
    }
    return binding;
  }
  if (definition?.type === DEFINITION.VARIABLE) {
    return constBinding(definition, name, resolve, source);
  }
  return null;
}

function bindingResolver(source, filename) {
  const resolving = new Set();
  function resolve(node) {
    if (!node) return null;
    if (node.type === NODE.MEMBER) {
      return memberBinding(resolve(node.object), propertyName(node, source));
    }
    if (node.type !== NODE.IDENTIFIER) return null;
    const variable = variableOf(node, source);
    if (!variable || resolving.has(variable)) return null;
    resolving.add(variable);
    try {
      return declaredBinding(variable, node.name, resolve, {filename, source});
    } finally {
      resolving.delete(variable);
    }
  }
  return resolve;
}

function hasSkipOption(node, source, visited = new Set()) {
  if (!node || visited.has(node)) return false;
  visited.add(node);
  const value = constantValue(node, source);
  return value?.type === NODE.OBJECT && value.properties.some((property) =>
    property.type === NODE.SPREAD ? hasSkipOption(property.argument, source, visited) :
      propertyName(property, source) === SKIP);
}

/**
 * Find forbidden skip registrations or context calls without executing source.
 * Parse failures throw: an unexamined file can never certify no skipped tests.
 * @param {string} content JavaScript source.
 * @param {string} filename Actual path, used to bind the repository TAP helper.
 * @return {Array<Object>} Locations and diagnostics of forbidden calls.
 */
export function findSkippedTests(content, filename) {
  const ast = parse(content, {ecmaVersion: 'latest', sourceType: 'module'});
  if (!containsSkipSyntax(ast)) return [];
  const rule = {
    meta: {schema: [], messages: {
      skip: 'framework test uses a skip mechanism',
      unresolved: 'test context authority cannot be resolved for skip policy',
    }},
    create(context) {
      const source = context.sourceCode;
      const resolve = bindingResolver(source, filename);
      return {CallExpression(node) {
        const binding = resolve(node.callee);
        if (binding?.kind === KIND.UNRESOLVED) {
          context.report({node, messageId: KIND.UNRESOLVED});
        } else if (binding?.kind === KIND.SKIP ||
          (isRegistration(binding) &&
            node.arguments.some((argument) => hasSkipOption(argument, source)))) {
          context.report({node, messageId: SKIP});
        }
      }};
    },
  };
  const messages = new Linter().verify(content, [{
    languageOptions: {ecmaVersion: 'latest', sourceType: 'module'},
    linterOptions: {noInlineConfig: true},
    plugins: {'permission-policy': {rules: {'no-skipped-tests': rule}}},
    rules: {[RULE]: 'error'},
  }]);
  const failure = messages.find((message) => message.fatal);
  if (failure) throw new Error(`${filename}:${failure.line}: ${failure.message}`);
  return messages.filter((message) => message.ruleId === RULE);
}
