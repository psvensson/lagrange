import {walkAst} from '../guideline-check-shared.js';

const NODE_TYPE = Object.freeze({
  ARROW: 'ArrowFunctionExpression',
  FUNCTION: 'FunctionDeclaration',
  FUNCTION_EXPRESSION: 'FunctionExpression',
  LITERAL: 'Literal',
  IDENTIFIER: 'Identifier',
  CLASS: 'ClassDeclaration',
  CLASS_EXPRESSION: 'ClassExpression',
  MEMBER: 'MemberExpression',
  PROPERTY: 'Property',
  OBJECT: 'ObjectExpression',
  NEW: 'NewExpression',
  DECLARATOR: 'VariableDeclarator',
  CATCH: 'CatchClause',
  ASSIGNMENT: 'AssignmentExpression',
  UPDATE: 'UpdateExpression',
  BLOCK: 'BlockStatement',
  DECLARATION: 'VariableDeclaration',
  THIS: 'ThisExpression',
  METHOD: 'MethodDefinition',
  FIELD: 'PropertyDefinition',
  UNARY: 'UnaryExpression',
  BINARY: 'BinaryExpression',
  RETURN: 'ReturnStatement',
  CALL: 'CallExpression',
});

const SYNTAX = Object.freeze({
  CONST: 'const',
  ASSIGN: '=',
  GETTER: 'get',
  SETTER: 'set',
  DELETE: 'delete',
  EQUAL: '===',
  NOT_EQUAL: '!==',
});

const arraySome = Function.call.bind(Array.prototype.some);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayFindLast = Function.call.bind(Array.prototype.findLast);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const stringToUpperCase = Function.call.bind(String.prototype.toUpperCase);

const FUNCTION_TYPES = new Set([
  NODE_TYPE.ARROW, NODE_TYPE.FUNCTION, NODE_TYPE.FUNCTION_EXPRESSION,
]);

function isFunction(node) {
  return FUNCTION_TYPES.has(node.type);
}

function isNull(node) {
  return node?.type === NODE_TYPE.LITERAL && node.value === null;
}

function recordsWithin(node) {
  const records = [];
  walkAst(node, (child, parent, ancestors) => {
    records.push({node: child, parent, ancestors});
  });
  return records;
}

function containsNode(tree, node) {
  return tree && tree.range[0] <= node.range[0] && tree.range[1] >= node.range[1];
}

function hasNamedIdentifier(tree, name) {
  let found = false;
  walkAst(tree, (node) => {
    if (node.type === NODE_TYPE.IDENTIFIER && node.name === name) found = true;
  });
  return found;
}

function isCurrentFunction(record) {
  return !arraySome(record.ancestors, (node) => isFunction(node) ||
    node.type === NODE_TYPE.CLASS || node.type === NODE_TYPE.CLASS_EXPRESSION);
}

function staticConstructorLabels(node) {
  if (node.type === NODE_TYPE.IDENTIFIER) return [node];
  if (node.type !== NODE_TYPE.MEMBER || node.computed) return null;
  const receiver = staticConstructorLabels(node.object);
  return receiver ? [...receiver, node.property] : null;
}

function isConstructorOptionKey({node, parent, ancestors}) {
  if (node.type !== NODE_TYPE.PROPERTY || parent?.type !== NODE_TYPE.OBJECT ||
      node.computed || node.shorthand) return false;
  const construction = ancestors.at(-2);
  return construction?.type === NODE_TYPE.NEW && arrayIncludes(construction.arguments, parent);
}

function markSyntaxLabels(records, passive) {
  for (const record of records) {
    const {node} = record;
    if (node.type === NODE_TYPE.NEW) {
      for (const label of staticConstructorLabels(node.callee) || []) passive.add(label);
    }
    if (isConstructorOptionKey(record)) passive.add(node.key);
  }
}

function bindingPatterns(node) {
  if (node.type === NODE_TYPE.DECLARATOR) return [node.id];
  if (isFunction(node)) return [node.id, ...node.params];
  if (node.type === NODE_TYPE.CATCH) return [node.param];
  if (node.type === NODE_TYPE.CLASS || node.type === NODE_TYPE.CLASS_EXPRESSION) return [node.id];
  return [];
}

function hasBindingConflict(records, declaration) {
  const name = declaration.id.name;
  return arraySome(records, ({node}) => {
    if (node !== declaration && arraySome(bindingPatterns(node), (pattern) =>
      hasNamedIdentifier(pattern, name))) return true;
    if (node.type === NODE_TYPE.ASSIGNMENT) return hasNamedIdentifier(node.left, name);
    if (node.type === NODE_TYPE.UPDATE) return hasNamedIdentifier(node.argument, name);
    return false;
  });
}

function constructedBindings(fn, records) {
  const bindings = new Map();
  const statements = fn.body.type === NODE_TYPE.BLOCK ? fn.body.body : [];
  for (const statement of statements) {
    if (statement.type !== NODE_TYPE.DECLARATION || statement.kind !== SYNTAX.CONST) continue;
    for (const declaration of statement.declarations) {
      if (declaration.id.type !== NODE_TYPE.IDENTIFIER ||
          declaration.init?.type !== NODE_TYPE.NEW) continue;
      if (!hasBindingConflict(records, declaration)) bindings.set(declaration.id.name, declaration);
    }
  }
  return bindings;
}

function thisFieldName(node) {
  if (node?.type !== NODE_TYPE.MEMBER || node.computed ||
      node.object.type !== NODE_TYPE.THIS ||
      node.property.type !== NODE_TYPE.IDENTIFIER) return null;
  return node.property.name;
}

function enclosingPlainClass(parent, ancestors) {
  if (parent?.type !== NODE_TYPE.METHOD || parent.static || parent.computed) return null;
  const owner = arrayFindLast(ancestors, (node) =>
    node.type === NODE_TYPE.CLASS || node.type === NODE_TYPE.CLASS_EXPRESSION);
  return owner && !owner.superClass ? owner : null;
}

function fieldPublications(records, bindings) {
  return arrayMap(arrayFilter(records, (record) => {
    const {node} = record;
    return isCurrentFunction(record) && node.type === NODE_TYPE.ASSIGNMENT &&
      node.operator === SYNTAX.ASSIGN && thisFieldName(node.left) !== null &&
      node.right.type === NODE_TYPE.IDENTIFIER && bindings.has(node.right.name);
  }), ({node}) => ({
    name: thisFieldName(node.left), binding: node.right.name, assignment: node,
  }));
}

function unsafeClassMember(node, field) {
  if (node.type !== NODE_TYPE.METHOD && node.type !== NODE_TYPE.FIELD) return false;
  if (node.computed) return true;
  const name = node.key.name ?? node.key.value;
  if (name !== field.name) return false;
  if (node.kind === SYNTAX.GETTER || node.kind === SYNTAX.SETTER) return true;
  return node.type === NODE_TYPE.FIELD && !isNull(node.value);
}

function unsafeThisUse(node, parent) {
  if (node.type !== NODE_TYPE.THIS) return false;
  return parent?.type !== NODE_TYPE.MEMBER || parent.object !== node || parent.computed;
}

function unsafeFieldMutation({node, ancestors}, field) {
  if (thisFieldName(node) !== field.name) return false;
  return arraySome(ancestors, (ancestor) => {
    if (ancestor.type === NODE_TYPE.ASSIGNMENT && containsNode(ancestor.left, node)) {
      return ancestor !== field.assignment &&
        !(ancestor.left === node && ancestor.operator === SYNTAX.ASSIGN && isNull(ancestor.right));
    }
    if (ancestor.type === NODE_TYPE.UPDATE) return containsNode(ancestor.argument, node);
    return ancestor.type === NODE_TYPE.UNARY && ancestor.operator === SYNTAX.DELETE &&
      containsNode(ancestor.argument, node);
  });
}

function provedFields(owner, records, bindings) {
  if (!owner) return [];
  const classRecords = recordsWithin(owner);
  return arrayFilter(fieldPublications(records, bindings), (field) =>
    !arraySome(classRecords, (record) => unsafeClassMember(record.node, field) ||
      unsafeThisUse(record.node, record.parent) || unsafeFieldMutation(record, field)));
}

function isIdentityGuard(node, parent) {
  if (parent?.type !== NODE_TYPE.BINARY ||
      !arrayIncludes([SYNTAX.EQUAL, SYNTAX.NOT_EQUAL], parent.operator)) return false;
  return (parent.left === node && isNull(parent.right)) ||
    (parent.right === node && isNull(parent.left));
}

function isReturned(node, parent) {
  return parent?.type === NODE_TYPE.RETURN && parent.argument === node;
}

function isHandlePublication(call, fields) {
  if (call.type !== NODE_TYPE.CALL || call.arguments.length !== 1) return false;
  const member = call.callee;
  if (member.type !== NODE_TYPE.MEMBER || member.computed ||
      member.property.type !== NODE_TYPE.IDENTIFIER ||
      call.arguments[0].type !== NODE_TYPE.IDENTIFIER) return false;
  return arraySome(fields, (field) => call.arguments[0].name === field.binding &&
    member.property.name === `set${stringToUpperCase(field.name[0])}${field.name.slice(1)}`);
}

function markPublications(records, fields, passive) {
  for (const record of records) {
    if (!isCurrentFunction(record) || !isHandlePublication(record.node, fields)) continue;
    passive.add(record.node.callee.property);
    passive.add(record.node.arguments[0]);
  }
}

function markBindingUses(record, bindings, fields, passive) {
  const {node, parent} = record;
  if (node.type !== NODE_TYPE.IDENTIFIER || !bindings.has(node.name)) return;
  if (bindings.get(node.name).id === node || isReturned(node, parent) ||
      isIdentityGuard(node, parent) ||
      arraySome(fields, (field) => field.assignment.right === node)) {
    passive.add(node);
  }
}

function markFieldUses(record, fields, passive) {
  const {node, parent} = record;
  const field = arrayFind(fields, (entry) => thisFieldName(node) === entry.name);
  if (!field) return;
  if (isReturned(node, parent) || isIdentityGuard(node, parent) || field.assignment.left === node) {
    passive.add(node.property);
  }
}

// These are individual syntactic occurrences, never exempt subtrees. Unknown
// bindings and uses retain the existing conservative identifier evidence.
// Plain-class checks rule out visible accessors/mutations; they do not prove
// arbitrary effects of inherited objects, proxies or dynamically installed code.
export function passiveConstructionOccurrences(fn, parent, ancestors) {
  const records = recordsWithin(fn.body || fn);
  const passive = new WeakSet();
  markSyntaxLabels(records, passive);
  const bindings = constructedBindings(fn, records);
  const fields = provedFields(enclosingPlainClass(parent, ancestors), records, bindings);
  markPublications(records, fields, passive);
  for (const record of records) {
    if (!isCurrentFunction(record)) continue;
    markBindingUses(record, bindings, fields, passive);
    markFieldUses(record, fields, passive);
  }
  return passive;
}
