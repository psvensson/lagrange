import {walkAst} from '../guideline-check-shared.js';

const NODE = Object.freeze({
  IDENTIFIER: 'Identifier', DECLARATOR: 'VariableDeclarator',
  DECLARATION: 'VariableDeclaration', ARRAY: 'ArrayExpression',
  BLOCK: 'BlockStatement', MEMBER: 'MemberExpression', CALL: 'CallExpression',
  EXPRESSION: 'ExpressionStatement', CATCH: 'CatchClause',
  IF: 'IfStatement', BINARY: 'BinaryExpression', LITERAL: 'Literal',
  THROW: 'ThrowStatement', NEW: 'NewExpression', WITH: 'WithStatement',
});
const SYNTAX = Object.freeze({
  CONST: 'const', PUSH: 'push', LENGTH: 'length',
  AGGREGATE: 'AggregateError', GREATER: '>', EVAL: 'eval',
});
const DEFERRED_SCOPE = new Set([
  'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
  'ClassDeclaration', 'ClassExpression',
]);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arraySome = Function.call.bind(Array.prototype.some);

function recordsWithin(tree) {
  const records = [];
  walkAst(tree, (node, parent, ancestors) => records.push({node, parent, ancestors}));
  return records;
}

function lastAncestor(ancestors, type) {
  for (let index = ancestors.length - 1; index >= 0; index--) {
    if (ancestors[index].type === type) return ancestors[index];
  }
  return null;
}

function isNamedIdentifier(node, name) {
  return node?.type === NODE.IDENTIFIER && node.name === name;
}

function isDirectMember(node, name) {
  return node?.type === NODE.MEMBER && !node.computed && !node.optional &&
    isNamedIdentifier(node.property, name);
}

function hasUnsupportedBindings(ast) {
  let unknown = false;
  walkAst(ast, (node, parent) => {
    if (node.type === NODE.WITH ||
        (node.type === NODE.CALL && isNamedIdentifier(node.callee, SYNTAX.EVAL))) unknown = true;
    if (!isNamedIdentifier(node, SYNTAX.AGGREGATE)) return;
    if (parent?.type !== NODE.NEW || parent.callee !== node) unknown = true;
  });
  return unknown;
}

function collectionScope({node, parent, ancestors}) {
  if (node.type !== NODE.DECLARATOR || parent?.type !== NODE.DECLARATION ||
      parent.kind !== SYNTAX.CONST || node.id.type !== NODE.IDENTIFIER ||
      node.init?.type !== NODE.ARRAY || node.init.elements.length !== 0) return null;
  const scope = lastAncestor(ancestors, NODE.BLOCK);
  return scope && arrayIncludes(scope.body, parent) ? scope : null;
}

function isLocalReference(record, declaration, scope) {
  return arrayIncludes(record.ancestors, scope) &&
    record.node.range[0] > declaration.range[1] &&
    !arraySome(record.ancestors, (node) => DEFERRED_SCOPE.has(node.type));
}

function isOnlyCatchRead(caught, argument) {
  if (!isNamedIdentifier(caught?.param, argument?.name)) return false;
  let found = false;
  let otherUse = false;
  walkAst(caught.body, (node) => {
    if (!isNamedIdentifier(node, argument.name)) return;
    if (node === argument) found = true;
    else otherUse = true;
  });
  return found && !otherUse;
}

function isCaughtPush(record) {
  const member = record.parent;
  const call = record.ancestors.at(-2);
  const statement = record.ancestors.at(-3);
  if (!isDirectMember(member, SYNTAX.PUSH) || member.object !== record.node ||
      call?.type !== NODE.CALL || call.callee !== member || call.optional ||
      call.arguments.length !== 1) return false;
  if (statement?.type !== NODE.EXPRESSION || statement.expression !== call) return false;
  const caught = lastAncestor(record.ancestors, NODE.CATCH);
  return isOnlyCatchRead(caught, call.arguments[0]);
}

function isNonemptyCondition(node, name) {
  if (node?.type !== NODE.BINARY || node.operator !== SYNTAX.GREATER) return false;
  return isDirectMember(node.left, SYNTAX.LENGTH) &&
    isNamedIdentifier(node.left.object, name) &&
    node.right.type === NODE.LITERAL && node.right.value === 0;
}

function terminalGuardThrow(guard) {
  if (guard?.type !== NODE.IF || guard.alternate ||
      guard.consequent.type !== NODE.BLOCK) return null;
  const terminal = guard.consequent.body.at(-1);
  return terminal?.type === NODE.THROW ? terminal : null;
}

function nonemptyGuard(record) {
  const member = record.parent;
  const condition = record.ancestors.at(-2);
  const guard = record.ancestors.at(-3);
  if (!isDirectMember(member, SYNTAX.LENGTH) || member.object !== record.node ||
      guard?.test !== condition || !isNonemptyCondition(condition, record.node.name)) return null;
  return terminalGuardThrow(guard) ? guard : null;
}

function thrownAggregateGuard(record) {
  const aggregate = record.parent;
  if (aggregate?.type !== NODE.NEW || !isNamedIdentifier(aggregate.callee, SYNTAX.AGGREGATE) ||
      aggregate.arguments[0] !== record.node) return null;
  const thrown = lastAncestor(record.ancestors, NODE.THROW);
  const guard = lastAncestor(record.ancestors, NODE.IF);
  if (!thrown || terminalGuardThrow(guard) !== thrown ||
      !isNonemptyCondition(guard.test, record.node.name)) return null;
  return guard;
}

function provesCollection(records, declaration, scope) {
  let pushes = 0;
  const lengthGuards = new Set();
  const aggregateGuards = new Set();
  for (const record of records) {
    if (!isNamedIdentifier(record.node, declaration.id.name) ||
        record.node === declaration.id) continue;
    if (!isLocalReference(record, declaration, scope)) return false;
    if (isCaughtPush(record)) {
      pushes++;
      continue;
    }
    const guard = nonemptyGuard(record);
    if (guard) {
      lengthGuards.add(guard);
      continue;
    }
    const aggregateGuard = thrownAggregateGuard(record);
    if (!aggregateGuard) return false;
    aggregateGuards.add(aggregateGuard);
  }
  return pushes > 0 && lengthGuards.size === 1 && aggregateGuards.size === 1 &&
    aggregateGuards.has(lengthGuards.values().next().value);
}

/**
 * Prove local exception-data roles; unknown references remain findings.
 * This recognizes syntax and bindings, not arbitrary global/prototype mutation.
 * @param {Object} functionNode - The top-level function being audited.
 * @param {Object} ast - Its complete program, including imported/local bindings.
 * @return {Set<Object>} Only the proved empty-array declaration nodes.
 */
function collectCaughtExceptionCollections(functionNode, ast) {
  const collections = new Set();
  const records = recordsWithin(functionNode.body || functionNode);
  const candidates = [];
  for (const record of records) {
    const scope = collectionScope(record);
    if (scope) candidates.push({declaration: record.node, scope});
  }
  if (candidates.length === 0 || hasUnsupportedBindings(ast)) return collections;
  for (const {declaration, scope} of candidates) {
    if (provesCollection(records, declaration, scope)) collections.add(declaration);
  }
  return collections;
}

export {collectCaughtExceptionCollections};
