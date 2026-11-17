import {walkAst} from './guideline-check-shared.js';

const NODE = Object.freeze({
  ARRAY_PATTERN: 'ArrayPattern',
  ASSIGNMENT_PATTERN: 'AssignmentPattern',
  BLOCK: 'BlockStatement',
  CATCH: 'CatchClause',
  CLASS_DECLARATION: 'ClassDeclaration',
  CLASS_EXPRESSION: 'ClassExpression',
  FUNCTION_DECLARATION: 'FunctionDeclaration',
  IDENTIFIER: 'Identifier',
  IMPORT: 'ImportDeclaration',
  OBJECT_PATTERN: 'ObjectPattern',
  PROGRAM: 'Program',
  REST: 'RestElement',
  STATIC_BLOCK: 'StaticBlock',
  SWITCH: 'SwitchStatement',
  VARIABLE_DECLARATION: 'VariableDeclaration',
});
const FUNCTION_NODES = new Set([
  NODE.FUNCTION_DECLARATION,
  'FunctionExpression',
  'ArrowFunctionExpression',
]);
const LEXICAL_SCOPE_NODES = new Set([
  NODE.BLOCK,
  NODE.CATCH,
  NODE.CLASS_DECLARATION,
  NODE.CLASS_EXPRESSION,
  NODE.STATIC_BLOCK,
  NODE.SWITCH,
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
]);
const VAR_KIND = 'var';

function createScope(parent, ownsVarBindings) {
  const scope = {parent, bindings: new Map()};
  scope.varScope = ownsVarBindings ? scope : parent.varScope;
  return scope;
}

function scopeForNode(node, parent, scopes) {
  if (node.type === NODE.PROGRAM) {
    return createScope(undefined, true);
  }
  const parentScope = scopes.get(parent);
  // Case lexical declarations are not in scope for the discriminant.
  if (parent.type === NODE.SWITCH && parent.discriminant === node) {
    return parentScope.parent;
  }
  // Parameter initializers cannot see declarations in the function body.
  if (node.type === NODE.BLOCK && FUNCTION_NODES.has(parent.type)) {
    return createScope(parentScope, true);
  }
  if (FUNCTION_NODES.has(node.type)) {
    return createScope(parentScope, true);
  }
  if (LEXICAL_SCOPE_NODES.has(node.type)) {
    return createScope(parentScope, node.type === NODE.STATIC_BLOCK);
  }
  return parentScope;
}

function bindPattern(pattern, scope, definition) {
  if (!pattern) {
    return;
  }
  if (pattern.type === NODE.IDENTIFIER) {
    scope.bindings.set(pattern.name, {
      ...definition,
      identifier: pattern,
      moduleOwned: scope.parent === undefined,
    });
    return;
  }
  if (pattern.type === NODE.REST) {
    bindPattern(pattern.argument, scope, definition);
  } else if (pattern.type === NODE.ASSIGNMENT_PATTERN) {
    bindPattern(pattern.left, scope, definition);
  } else if (pattern.type === NODE.ARRAY_PATTERN) {
    for (const element of pattern.elements) {
      bindPattern(element, scope, definition);
    }
  } else if (pattern.type === NODE.OBJECT_PATTERN) {
    for (const property of pattern.properties) {
      const binding = property.type === NODE.REST ? property.argument : property.value;
      bindPattern(binding, scope, definition);
    }
  }
}

function bindNamedScope(node, scope) {
  if (node.type === NODE.FUNCTION_DECLARATION || node.type === NODE.CLASS_DECLARATION) {
    bindPattern(node.id, scope.parent, {owner: node});
  }
  bindPattern(node.id, scope, {owner: node});
}

function bindDeclarations(node, scope) {
  if (node.type === NODE.VARIABLE_DECLARATION) {
    const declarationScope = node.kind === VAR_KIND ? scope.varScope : scope;
    for (const declarator of node.declarations) {
      bindPattern(declarator.id, declarationScope, {owner: node, declarator});
    }
    return;
  }
  if (node.type === NODE.IMPORT) {
    for (const specifier of node.specifiers) {
      bindPattern(specifier.local, scope, {owner: node});
    }
    return;
  }
  if (FUNCTION_NODES.has(node.type)) {
    bindNamedScope(node, scope);
    for (const parameter of node.params) {
      bindPattern(parameter, scope, {owner: node});
    }
    return;
  }
  if (node.type === NODE.CLASS_DECLARATION || node.type === NODE.CLASS_EXPRESSION) {
    bindNamedScope(node, scope);
  } else if (node.type === NODE.CATCH) {
    bindPattern(node.param, scope, {owner: node});
  }
}

/**
 * Resolve identifier uses to declarations for the literal checker's constant
 * ownership decision. The complete declaration pass precedes lookup, so a
 * later declaration still shadows an outer constant (including hoisted var).
 * This indexes lexical bindings; it does not evaluate values or execute code.
 */
function createLiteralConstantBindingResolver(ast) {
  const scopes = new WeakMap();
  walkAst(ast, (node, parent) => {
    const scope = scopeForNode(node, parent, scopes);
    scopes.set(node, scope);
    bindDeclarations(node, scope);
  });
  return (identifier) => {
    let scope = scopes.get(identifier);
    while (scope) {
      if (scope.bindings.has(identifier.name)) {
        return scope.bindings.get(identifier.name);
      }
      scope = scope.parent;
    }
    return undefined;
  };
}

export {createLiteralConstantBindingResolver};
