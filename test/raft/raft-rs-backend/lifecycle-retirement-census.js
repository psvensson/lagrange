// Source census for the native lifecycle administration contract, not every
// unrelated owner that happens to expose a method named retireReplica.
import {parse} from 'espree';
import {dirname, resolve} from 'node:path';

function walk(node, parent, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parent);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => walk(child, node, visit));
    else if (value && typeof value.type === 'string') walk(value, node, visit);
  }
}

function propertyName(node) {
  if (!node.computed && node.key?.type === 'Identifier') return node.key.name;
  if (node.key?.type === 'Literal') return node.key.value;
  return null;
}

function runtimeIsExplicit(call) {
  const options = call.arguments[2];
  if (options?.type !== 'ObjectExpression') return false;
  const matches = options.properties.filter((property) =>
    property.type === 'Property' && propertyName(property) === 'runtime');
  if (matches.length !== 1 || matches[0].kind !== 'init') return false;
  // A later spread or unknown computed key can replace the captured runtime.
  return options.properties.slice(options.properties.indexOf(matches[0]) + 1)
    .every((property) => property.type === 'Property' && propertyName(property) !== null);
}

function isNonReference(node, parent) {
  return parent?.type === 'ImportSpecifier' ||
    (parent?.type === 'MemberExpression' && parent.property === node && !parent.computed) ||
    (parent?.type === 'Property' && parent.key === node && !parent.computed && !parent.shorthand);
}

const INVOCATION = Object.freeze({DIRECT: 'direct', REFUSED: 'refused'});

// How one binding reference is used: a direct `binding.method(...)` call with a
// static method name, or the reason the census refuses it.
function directInvocationOf(node, parent, parents) {
  const call = parents.get(parent);
  if (parent?.type !== 'MemberExpression' || parent.object !== node ||
      call?.type !== 'CallExpression' || call.callee !== parent) {
    return {kind: INVOCATION.REFUSED,
      reason: 'lifecycle administration binding escapes direct invocation'};
  }
  const method = parent.computed ? parent.property.value : parent.property.name;
  if (typeof method !== 'string') {
    return {kind: INVOCATION.REFUSED, reason: 'dynamic lifecycle administration method'};
  }
  return {kind: INVOCATION.DIRECT, call, method};
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
    if (node.type !== 'ImportDeclaration') {
      report(node, 'unsupported lifecycle administration import or re-export');
      return;
    }
    for (const specifier of node.specifiers) {
      if (specifier.type !== 'ImportSpecifier' ||
          specifier.imported.name !== 'raftRsLifecycleAdministration') {
        report(specifier, 'unsupported lifecycle administration binding');
      } else bindings.add(specifier.local.name);
    }
  });
  // Follow immutable object aliases, including an alias scoped to a helper.
  // Reassignment and binding shadowing still fail closed in the reference pass.
  let changed = true;
  while (changed) {
    changed = false;
    walk(ast, null, (node, parent) => {
      if (node.type !== 'VariableDeclarator' || parent?.kind !== 'const' ||
          node.id.type !== 'Identifier' || node.init?.type !== 'Identifier' ||
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
    if (node.type !== 'Identifier' || !bindings.has(node.name) ||
        aliasNodes.has(node) || isNonReference(node, parent)) return;
    // Import renames and const object aliases are supported. Escapes and
    // shadowing fail closed rather than silently disappearing from the census.
    const invocation = directInvocationOf(node, parent, parents);
    if (invocation.kind === INVOCATION.REFUSED) {
      report(node, invocation.reason);
      return;
    }
    if (invocation.method !== 'retireReplica') return;
    calls.push({file, line: node.loc.start.line});
    if (!runtimeIsExplicit(invocation.call)) {
      report(node, 'retirement requires an explicit non-overwritten runtime');
    }
  });
  return {calls, violations};
}

export {inspectLifecycleRetirements};
