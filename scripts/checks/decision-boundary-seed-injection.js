// Source proof for one constructor injection contract. This supplies individual
// AST occurrences to passiveConstructionOccurrences, never a file/method waiver.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {parseSourceFile, walkAst} from '../guideline-check-shared.js';

const TYPE = Object.freeze({
  OBJECT: 'ObjectExpression',
  PROPERTY: 'Property',
  IMPORT: 'ImportDeclaration',
  IMPORT_SPECIFIER: 'ImportSpecifier',
  DECLARATOR: 'VariableDeclarator',
  CATCH: 'CatchClause',
  IDENTIFIER: 'Identifier',
  ASSIGNMENT: 'AssignmentExpression',
  FOR_IN: 'ForInStatement',
  FOR_OF: 'ForOfStatement',
  UPDATE: 'UpdateExpression',
  UNARY: 'UnaryExpression',
  EXPORT: 'ExportNamedDeclaration',
  DECLARATION: 'VariableDeclaration',
  CALL: 'CallExpression',
  MEMBER: 'MemberExpression',
  BLOCK: 'BlockStatement',
  THIS: 'ThisExpression',
});
const BINDING = Object.freeze({
  COMPOSE_METHOD: '_composeSeedDelegates',
  WIRING: 'buildRuntimeWiringDelegates',
  COMPOSE: 'composeSeedDelegates',
  DELEGATE_FACTORY: 'createBootstrapServiceSeedDelegateMethods',
  HANDLE: 'getSystemTableCache',
  PEEK: 'peekSystemTableCache',
  ASSERT: 'assertCritical',
  RUNTIME_FACTORY: 'createBootstrapServiceRuntimeMethods',
  ENGINE: 'sqlQueryEngine',
  BUNDLES: 'delegateBundles',
  COMPOSED: 'seedDelegates',
  HOSTED: 'resolveHostedReplicaAuthorities',
  LOCAL: 'd',
  CDC: 'cdcIntegrationService',
  DELEGATES: 'delegates',
  PARTITION: 'PartitionService',
});
const SYNTAX = Object.freeze({
  DELETE: 'delete',
  CONST: 'const',
  INITIALIZER: 'init',
  METHOD: 'method',
});
const HOSTED_OWNER = 'src/bootstrap/shared/hosted-replica-authorities.js';
const ENCODING = 'utf8';
const MISSING_FILE = 'ENOENT';
const LOCAL_CONTRACT = 'const d = this.delegates;';
const CDC_CONTRACT = 'const cdcIntegrationService = d.getCdcIntegrationService();';
const COMPOSE_WRAPPER_OPEN = '({_composeSeedDelegates(bundles, options = {}) {';
const COMPOSE_WRAPPER_CLOSE = 'return composeSeedDelegates(bundles, options); }})';

const arraySome = Function.call.bind(Array.prototype.some);
const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayFindLast = Function.call.bind(Array.prototype.findLast);
const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arraySlice = Function.call.bind(Array.prototype.slice);
const arrayAt = Function.call.bind(Array.prototype.at);
const arrayPush = Function.call.bind(Array.prototype.push);
const arrayIsArray = Array.isArray;
const arrayMap = Function.call.bind(Array.prototype.map);
const objectKeys = Object.keys;
const objectCreate = Object.create;
const objectFreeze = Object.freeze;
const setHas = Function.call.bind(Set.prototype.has);
const mapGet = Function.call.bind(Map.prototype.get);
const mapSet = Function.call.bind(Map.prototype.set);
const weakMapGet = Function.call.bind(WeakMap.prototype.get);
const weakMapSet = Function.call.bind(WeakMap.prototype.set);

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const CALLER = 'src/bootstrap/phases/seed-partitions-phase.js';
const DELEGATES = 'src/bootstrap/bootstrap-service-seed-delegates.js';
const RUNTIME = 'src/bootstrap/bootstrap-service-runtime-methods.js';
const CDC = 'src/cdc/cdc-integration-service.js';
const SERVICE = 'src/bootstrap/bootstrap-service.js';
const ASSERT = 'src/utils/assert.js';
const PARTITION = 'src/partition/partition-service.js';
const METHOD = 'createBootstrapPartitionReplica';
const CONTEXTS = new WeakMap();
const CONTRACT_AST = new Map();
const TRIVIA = new Set(['loc', 'range', 'start', 'end', 'raw', 'comments', 'tokens']);
const FUNCTION_TYPES = new Set([
  'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
]);
const CLASS_TYPES = new Set(['ClassDeclaration', 'ClassExpression']);
const IMPORT_TYPES = new Set([
  'ImportSpecifier', 'ImportDefaultSpecifier', 'ImportNamespaceSpecifier',
]);
const PROPERTY_TYPES = new Set(['Property', 'MethodDefinition', 'PropertyDefinition']);

const WIRING_CONTRACT = `function buildRuntimeWiringDelegates(service) {
  const self = service;
  return {
    getSystemTableCache: () => self.getSystemTableCache(),
    getMessageRouter: () => self.messageRouter,
    getRebalanceCoordinator: () => self.rebalanceCoordinator,
    getCdcIntegrationService: () => self.cdcIntegrationService,
    getEpochManager: () => self.epochManager,
  };
}`;
const BUNDLES_CONTRACT = `function buildSeedDelegateBundles(service) {
  return {
    [SEED_DELEGATE_BUNDLE.PHASE_EXECUTION]: service._buildPhaseExecutionDelegates(),
    [SEED_DELEGATE_BUNDLE.READINESS]: service._buildReadinessDelegates(),
    [SEED_DELEGATE_BUNDLE.CLEANUP]: service._buildCleanupDelegates(),
    [SEED_DELEGATE_BUNDLE.RUNTIME_WIRING]: service._buildRuntimeWiringDelegates(),
  };
}`;
const COMPOSE_CONTRACT = `function composeSeedDelegates(bundles, options = {}) {
  if (options.cleanupOnly) {
    return {
      ...bundles[SEED_DELEGATE_BUNDLE.CLEANUP],
      ...bundles[SEED_DELEGATE_BUNDLE.READINESS],
    };
  }
  return {
    ...bundles[SEED_DELEGATE_BUNDLE.PHASE_EXECUTION],
    ...bundles[SEED_DELEGATE_BUNDLE.READINESS],
    ...bundles[SEED_DELEGATE_BUNDLE.CLEANUP],
    ...bundles[SEED_DELEGATE_BUNDLE.RUNTIME_WIRING],
  };
}`;
const CACHE_CONTRACT = `({getSystemTableCache() {
  return assertCritical(this.peekSystemTableCache(), bootstrapError.SYSTEM_CACHE_MISSING);
}})`;
const PEEK_CONTRACT = `({peekSystemTableCache() {
  if (this.systemTableCache) { return this.systemTableCache; }
  for (const svc of this.messageGroupServices.values()) {
    if (svc?.systemTableCache) { return svc.systemTableCache; }
  }
  return null;
}})`;
const PHASE_CONSTRUCTOR = `class SeedPartitionsPhase {
  constructor(options = {}) {
    this.delegates = options.delegates || {};
    this.satisfiedPartitionLeadershipSetKey = null;
  }
}`;

function semanticAst(value) {
  if (arrayIsArray(value)) return arrayMap(value, semanticAst);
  if (value === null || typeof value !== 'object') return value;
  const result = objectCreate(null);
  for (const key of objectKeys(value)) {
    if (!setHas(TRIVIA, key)) result[key] = semanticAst(value[key]);
  }
  return result;
}

function same(actual, expected) {
  return actual !== undefined && isDeepStrictEqual(semanticAst(actual), semanticAst(expected));
}

function records(ast) {
  const found = [];
  walkAst(ast, (node, parent, ancestors) => arrayPush(found, {node, parent, ancestors}));
  return found;
}

// Contract text is private and finite; parse each fixed contract only once.
function expectedAst(source) {
  let ast = mapGet(CONTRACT_AST, source);
  if (ast === undefined) {
    ast = parseSourceFile(source);
    mapSet(CONTRACT_AST, source, ast);
  }
  return ast;
}

function expression(source) {
  return expectedAst(source).body[0].expression;
}

function namedProperty(node, name) {
  return setHas(PROPERTY_TYPES, node.type) && !node.computed && node.key?.name === name;
}

function uniqueProperty(ast, name, expected) {
  const found = arrayFilter(records(ast), ({node}) => namedProperty(node, name));
  return found.length === 1 && same(found[0].node, expected) &&
    noLaterOverride(found[0]);
}

function noLaterOverride(record) {
  if (record.parent?.type !== TYPE.OBJECT) return false;
  const properties = record.parent.properties;
  return arrayEvery(arraySlice(properties, arrayIndexOf(properties, record.node) + 1), (property) =>
    property.type === TYPE.PROPERTY && !property.computed);
}

function uniqueFunction(ast, source) {
  const expected = expectedAst(source).body[0];
  const found = arrayFilter(records(ast), ({node}) =>
    node.type === 'FunctionDeclaration' && node.id?.name === expected.id.name);
  return found.length === 1 && same(found[0].node, expected);
}

function imported(ast, file, local, owner) {
  return arraySome(ast.body, (node) => node.type === TYPE.IMPORT &&
    path.posix.normalize(path.posix.join(path.posix.dirname(file), node.source.value)) === owner &&
    arraySome(node.specifiers, (specifier) => specifier.type === TYPE.IMPORT_SPECIFIER &&
      specifier.local.name === local && specifier.imported.name === local));
}

function bindings(node) {
  if (node.type === TYPE.DECLARATOR) return [node.id];
  if (setHas(FUNCTION_TYPES, node.type)) return [node.id, ...node.params];
  if (setHas(CLASS_TYPES, node.type)) return [node.id];
  if (node.type === TYPE.CATCH) return [node.param];
  return setHas(IMPORT_TYPES, node.type) ? [node.local] : [];
}

function containsName(node, name) {
  return arraySome(records(node), ({node: child}) =>
    child.type === TYPE.IDENTIFIER && child.name === name);
}

function mutationTarget(node) {
  if (arrayIncludes([TYPE.ASSIGNMENT, TYPE.FOR_IN, TYPE.FOR_OF], node.type)) {
    return node.left;
  }
  if (node.type === TYPE.UPDATE ||
      (node.type === TYPE.UNARY && node.operator === SYNTAX.DELETE)) return node.argument;
  return null;
}

function stableBinding(ast, name, expected = 1) {
  let count = 0;
  for (const {node} of records(ast)) {
    count += arrayFilter(bindings(node), (pattern) => containsName(pattern, name)).length;
    if (containsName(mutationTarget(node), name)) return false;
  }
  return count === expected;
}

function exportsName(ast, name) {
  return stableBinding(ast, name) && arraySome(ast.body, (node) =>
    node.type === TYPE.EXPORT && !node.source &&
    arraySome(node.specifiers, (specifier) =>
      specifier.local.name === name && specifier.exported.name === name));
}

function delegateWrappersProved(ast) {
  const methods = [
    ['_buildSeedDelegateBundles', 'return buildSeedDelegateBundles(this);'],
    ['_buildRuntimeWiringDelegates', 'return buildRuntimeWiringDelegates(this);'],
  ];
  return arrayEvery(methods, ([name, body]) => uniqueProperty(ast, name,
    expression(`({${name}() { ${body} }})`).properties[0])) &&
    uniqueProperty(ast, BINDING.COMPOSE_METHOD, expression(
      COMPOSE_WRAPPER_OPEN +
      COMPOSE_WRAPPER_CLOSE).properties[0]);
}

function delegatesProved(ast) {
  return uniqueFunction(ast, WIRING_CONTRACT) && uniqueFunction(ast, COMPOSE_CONTRACT) &&
    uniqueFunction(ast, BUNDLES_CONTRACT) &&
    stableBinding(ast, BINDING.WIRING) && stableBinding(ast, BINDING.COMPOSE) &&
    exportsName(ast, BINDING.DELEGATE_FACTORY) && delegateWrappersProved(ast);
}

function cacheProved(ast) {
  return uniqueProperty(ast, BINDING.HANDLE, expression(CACHE_CONTRACT).properties[0]) &&
    uniqueProperty(ast, BINDING.PEEK, expression(PEEK_CONTRACT).properties[0]) &&
    imported(ast, RUNTIME, BINDING.ASSERT, ASSERT) &&
    stableBinding(ast, BINDING.ASSERT) &&
    exportsName(ast, BINDING.RUNTIME_FACTORY);
}

function cdcProved(ast) {
  const owners = arrayFilter(records(ast), ({node}) =>
    node.type === 'ClassDeclaration' && node.id?.name === 'CDCIntegrationService');
  if (owners.length !== 1) return false;
  const owner = owners[0].node;
  if (arraySome(owner.body.body, (member) => member.computed ||
      namedProperty(member, BINDING.ENGINE))) return false;
  const constructor = arrayFind(owner.body.body, (member) => member.kind === 'constructor');
  const expected = expectedAst('this.sqlQueryEngine = options.sqlQueryEngine || null;').body[0];
  return same(constructor?.value.body.body[1], expected);
}

function partitionProved(ast) {
  const expected = expectedAst(
    'export {PartitionService} from \'./partition-service-assembly.js\';').body[0];
  return arrayFilter(ast.body, (node) => same(node, expected)).length === 1;
}

function serviceProved(ast) {
  const imports = [['SeedPartitionsPhase', CALLER],
    ['createBootstrapServiceSeedDelegateMethods', DELEGATES],
    ['createBootstrapServiceRuntimeMethods', RUNTIME]];
  if (!arrayEvery(imports, ([name, file]) => imported(ast, SERVICE, name, file) &&
      stableBinding(ast, name))) return false;
  const owner = arrayFind(ast.body, (node) =>
    node.type === 'ClassDeclaration' && node.id?.name === 'BootstrapService');
  const constructor = arrayFind(owner?.body.body, (node) => node.kind === 'constructor');
  if (!constructor) return false;
  const statements = constructor.value.body.body;
  const contracts = [
    'const delegateBundles = this._buildSeedDelegateBundles();',
    'const seedDelegates = this._composeSeedDelegates(delegateBundles);',
    'this.seedPartitionsPhase = new SeedPartitionsPhase({delegates: seedDelegates});',
  ];
  return arrayEvery(contracts, (source) => arraySome(statements, (node) =>
    same(node, expectedAst(source).body[0]))) &&
    stableBinding(constructor, BINDING.BUNDLES) && stableBinding(constructor, BINDING.COMPOSED);
}

function assertionProved(ast) {
  const source = `export function assertCritical(value, message, options = {}) {
    if (!value) {
      const ErrorClass = options.ErrorClass || Error;
      const errorOptions = options.context ? {context: options.context} : undefined;
      let error;
      try {
        error = errorOptions ? new ErrorClass(message, errorOptions) : new ErrorClass(message);
      } catch { error = new Error(message); }
      if (options.context && error.context === undefined) { error.context = options.context; }
      error.isCritical = true;
      throw error;
    }
    return value;
  }`;
  return arraySome(ast.body, (node) => same(node, expectedAst(source).body[0]));
}

// Only the collector issues proof, bound to the actual caller bytes and path.
// Missing owner files revoke the allowance rather than supplying a fallback.
export async function loadSeedConstructorInjectionProof(root = ROOT) {
  const files = [CALLER, DELEGATES, RUNTIME, CDC, PARTITION, SERVICE, ASSERT];
  const sources = new Map();
  try {
    for (const file of files) {
      mapSet(sources, file, await fs.readFile(path.join(root, file), ENCODING));
    }
  } catch (error) {
    if (error.code !== MISSING_FILE) throw error;
    return null;
  }
  const checks = [[DELEGATES, delegatesProved], [RUNTIME, cacheProved],
    [CDC, cdcProved], [PARTITION, partitionProved],
    [SERVICE, serviceProved], [ASSERT, assertionProved]];
  if (!arrayEvery(checks, ([file, check]) => check(parseSourceFile(mapGet(sources, file))))) {
    return null;
  }
  const context = objectFreeze({});
  weakMapSet(CONTEXTS, context, {root, source: mapGet(sources, CALLER)});
  return context;
}

function declarationIs(record, contract) {
  return record.parent?.type === TYPE.DECLARATION && record.parent.kind === SYNTAX.CONST &&
    record.parent.declarations.length === 1 &&
    same(record.parent, expectedAst(contract).body[0]);
}

function hostedAuthorityArgument(node, parent) {
  return parent.type === TYPE.CALL && parent.arguments.length === 1 &&
    parent.arguments[0] === node && parent.callee.name === BINDING.HOSTED;
}

function shorthandOccurrence(node, parent) {
  return parent.type === TYPE.PROPERTY && parent.shorthand &&
    (parent.value === node || parent.key === node);
}

function escapedLocal({node, parent}, name) {
  if (node.type !== TYPE.IDENTIFIER || node.name !== name) return false;
  if (parent.type === TYPE.DECLARATOR && parent.id === node) return false;
  if (parent.type === TYPE.MEMBER && parent.object === node && !parent.computed) return false;
  return name === BINDING.LOCAL ?
    !hostedAuthorityArgument(node, parent) : !shorthandOccurrence(node, parent);
}

function localsUnescaped(all) {
  return !arraySome(all, (record) => escapedLocal(record, BINDING.LOCAL) ||
    escapedLocal(record, BINDING.CDC));
}

function provedLocals(fn, construction, all) {
  const declarations = arrayFilter(all, ({node}) => node.type === 'VariableDeclarator');
  const d = arrayFind(declarations, ({node}) => node.id.name === 'd');
  const cdc = arrayFind(declarations, ({node}) => node.id.name === 'cdcIntegrationService');
  return d && cdc && declarationIs(d, LOCAL_CONTRACT) &&
    declarationIs(cdc, CDC_CONTRACT) &&
    d.parent === fn.body.body[0] &&
    arrayAt(cdc.ancestors, -2) === arrayFindLast(construction.ancestors,
      (node) => node.type === TYPE.BLOCK) &&
    cdc.node.range[1] < construction.node.range[0] &&
    stableBinding(fn, BINDING.LOCAL) && stableBinding(fn, BINDING.CDC) && localsUnescaped(all);
}

function injectionProperties(construction) {
  if (construction.node.arguments.length !== 1) return null;
  const options = construction.node.arguments[0];
  if (options.type !== TYPE.OBJECT ||
      arraySome(options.properties, (property) => property.computed)) return null;
  const inputs = [['systemTableCache', 'd.getSystemTableCache()'],
    ['sqlQueryEngine', 'cdcIntegrationService?.sqlQueryEngine']];
  const found = [];
  for (const [name, source] of inputs) {
    const properties = arrayFilter(options.properties, (node) => namedProperty(node, name));
    if (properties.length !== 1 || properties[0].kind !== SYNTAX.INITIALIZER ||
        properties[0].method || !same(properties[0].value, expression(source))) return null;
    arrayPush(found, properties[0].value);
  }
  return found;
}

function delegatesUnchanged(owner, constructor) {
  const initialization = constructor.value.body.body[0].expression;
  return !arraySome(records(owner), ({node}) => {
    if (node === initialization) return false;
    return arraySome(records(mutationTarget(node)), ({node: target}) =>
      target.type === TYPE.MEMBER && target.object.type === TYPE.THIS &&
      (target.computed || target.property.name === BINDING.DELEGATES));
  });
}

function injectionMethod(ast) {
  const owner = arrayFind(ast.body, (node) =>
    node.type === 'ClassDeclaration' && node.id?.name === 'SeedPartitionsPhase');
  if (!owner || owner.superClass || arraySome(owner.body.body, (member) =>
    member.computed || namedProperty(member, BINDING.DELEGATES))) return null;
  const constructor = arrayFind(owner.body.body, (node) => node.kind === 'constructor');
  if (!same(constructor, expectedAst(PHASE_CONSTRUCTOR).body[0].body.body[0]) ||
      !delegatesUnchanged(owner, constructor)) return null;
  const methods = arrayFilter(owner.body.body, (node) => namedProperty(node, METHOD));
  if (methods.length !== 1 || methods[0].kind !== SYNTAX.METHOD || methods[0].static) return null;
  return methods[0].value;
}

function verifiedInputs(ast) {
  if (!imported(ast, CALLER, BINDING.PARTITION, PARTITION) ||
      !stableBinding(ast, BINDING.PARTITION) ||
      !imported(ast, CALLER, BINDING.HOSTED,
        HOSTED_OWNER) ||
      !stableBinding(ast, BINDING.HOSTED)) return [];
  const fn = injectionMethod(ast);
  if (!fn) return [];
  const all = records(fn);
  const constructions = arrayFilter(all, ({node}) => node.type === 'NewExpression' &&
    node.callee.type === 'Identifier' && node.callee.name === 'PartitionService');
  if (constructions.length !== 1 || !provedLocals(fn, constructions[0], all)) return [];
  return injectionProperties(constructions[0]) || [];
}

export function verifiedSeedConstructorInputs(ast, source, file, context) {
  const proof = weakMapGet(CONTEXTS, context);
  if (!proof || proof.source !== source ||
      path.resolve(file) !== path.resolve(proof.root, CALLER)) return [];
  return verifiedInputs(ast);
}
