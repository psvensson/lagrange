// Source census for the native lifecycle administration contract, not every
// unrelated owner that happens to expose a method named retireReplica.
import {parse} from 'espree';
import {dirname, resolve} from 'node:path';

const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);
const CENSUS_AST = Object.freeze({
  CALL_EXPRESSION: 'CallExpression',
  IDENTIFIER: 'Identifier',
  IMPORT_DECLARATION: 'ImportDeclaration',
  IMPORT_SPECIFIER: 'ImportSpecifier',
  LITERAL: 'Literal',
  MEMBER_EXPRESSION: 'MemberExpression',
  OBJECT_EXPRESSION: 'ObjectExpression',
  PROPERTY: 'Property',
  VARIABLE_DECLARATOR: 'VariableDeclarator',
});
const CENSUS_SYNTAX = Object.freeze({CONST: 'const', INIT: 'init'});
const LIFECYCLE_ADMINISTRATION_BINDING = 'raftRsLifecycleAdministration';
const NATIVE_RETIREMENT_METHOD = 'retireReplica';
const RUNTIME_OPTION = 'runtime';
const CENSUS_REASON = Object.freeze({
  IMPORT: 'unsupported lifecycle administration import or re-export',
  BINDING: 'unsupported lifecycle administration binding',
  ESCAPE: 'lifecycle administration binding escapes direct invocation',
  DYNAMIC: 'dynamic lifecycle administration method',
  RUNTIME: 'retirement requires an explicit non-overwritten runtime',
});

function walk(node, parent, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parent);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => walk(child, node, visit));
    else if (value && typeof value.type === 'string') walk(value, node, visit);
  }
}

function propertyName(node) {
  if (!node.computed && node.key?.type === CENSUS_AST.IDENTIFIER) return node.key.name;
  if (node.key?.type === CENSUS_AST.LITERAL) return node.key.value;
  return null;
}

function runtimeIsExplicit(call) {
  const options = call.arguments[2];
  if (options?.type !== CENSUS_AST.OBJECT_EXPRESSION) return false;
  const matches = arrayFilter(options.properties, (property) =>
    property.type === CENSUS_AST.PROPERTY && propertyName(property) === RUNTIME_OPTION);
  if (matches.length !== 1 || matches[0].kind !== CENSUS_SYNTAX.INIT) return false;
  // A later spread or unknown computed key can replace the captured runtime.
  return arrayEvery(options.properties.slice(arrayIndexOf(options.properties, matches[0]) + 1),
    (property) => property.type === CENSUS_AST.PROPERTY && propertyName(property) !== null);
}

function isNonReference(node, parent) {
  return parent?.type === CENSUS_AST.IMPORT_SPECIFIER ||
    (parent?.type === CENSUS_AST.MEMBER_EXPRESSION && parent.property === node &&
      !parent.computed) ||
    (parent?.type === CENSUS_AST.PROPERTY && parent.key === node && !parent.computed &&
      !parent.shorthand);
}

function inspectLifecycleRetirements(source, {file, ownerFile}) {
  const ast = parse(source, {ecmaVersion: 'latest', sourceType: 'module', loc: true});
  const bindings = new Set();
  const parents = new WeakMap();
  const violations = [];
  const calls = [];
  const aliasNodes = new WeakSet();
  const report = (node, reason) => violations.push({file, line: node.loc.start.line, reason});
  const isOwner = (specifier) => typeof specifier === 'string' &&
    resolve(dirname(file), specifier) === resolve(ownerFile);
  walk(ast, null, (node, parent) => {
    parents.set(node, parent);
    if (!isOwner(node.source?.value)) return;
    if (node.type !== CENSUS_AST.IMPORT_DECLARATION) {
      report(node, CENSUS_REASON.IMPORT);
      return;
    }
    for (const specifier of node.specifiers) {
      if (specifier.type !== CENSUS_AST.IMPORT_SPECIFIER ||
          specifier.imported.name !== LIFECYCLE_ADMINISTRATION_BINDING) {
        report(specifier, CENSUS_REASON.BINDING);
      } else bindings.add(specifier.local.name);
    }
  });
  // Follow immutable object aliases, including an alias scoped to a helper.
  // Reassignment and binding shadowing still fail closed in the reference pass.
  let changed = true;
  while (changed) {
    changed = false;
    walk(ast, null, (node, parent) => {
      if (node.type !== CENSUS_AST.VARIABLE_DECLARATOR || parent?.kind !== CENSUS_SYNTAX.CONST ||
          node.id.type !== CENSUS_AST.IDENTIFIER || node.init?.type !== CENSUS_AST.IDENTIFIER ||
          !bindings.has(node.init.name)) return;
      aliasNodes.add(node.id);
      aliasNodes.add(node.init);
      if (!bindings.has(node.id.name)) {
        bindings.add(node.id.name);
        changed = true;
      }
    });
  }
  walk(ast, null, (node, parent) => {
    if (node.type !== CENSUS_AST.IDENTIFIER || !bindings.has(node.name) ||
        aliasNodes.has(node) || isNonReference(node, parent)) return;
    // Import renames and const object aliases are supported. Escapes and
    // shadowing fail closed rather than silently disappearing from the census.
    const call = parents.get(parent);
    if (parent?.type !== CENSUS_AST.MEMBER_EXPRESSION || parent.object !== node ||
        call?.type !== CENSUS_AST.CALL_EXPRESSION || call.callee !== parent) {
      report(node, CENSUS_REASON.ESCAPE);
      return;
    }
    const method = parent.computed ? parent.property.value : parent.property.name;
    if (typeof method !== 'string') {
      report(node, CENSUS_REASON.DYNAMIC);
      return;
    }
    if (method !== NATIVE_RETIREMENT_METHOD) return;
    calls.push({file, line: node.loc.start.line});
    if (!runtimeIsExplicit(call)) report(node, CENSUS_REASON.RUNTIME);
  });
  return {calls, violations};
}

export {inspectLifecycleRetirements, NATIVE_RETIREMENT_METHOD};
