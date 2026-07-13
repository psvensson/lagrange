import {SYSTEM_TABLE_NAME} from '../src/bootstrap/system-table-schemas-constants.js';

const NODE_TYPE = Object.freeze({
  ARRAY: 'ArrayExpression',
  ASSIGNMENT: 'AssignmentExpression',
  ASSIGNMENT_PATTERN: 'AssignmentPattern',
  BINARY: 'BinaryExpression',
  CALL: 'CallExpression',
  CHAIN: 'ChainExpression',
  EXPORT_NAMED: 'ExportNamedDeclaration',
  FUNCTION_DECLARATION: 'FunctionDeclaration',
  IDENTIFIER: 'Identifier',
  IMPORT_DECLARATION: 'ImportDeclaration',
  IMPORT_SPECIFIER: 'ImportSpecifier',
  LITERAL: 'Literal',
  LOGICAL: 'LogicalExpression',
  MEMBER: 'MemberExpression',
  METHOD: 'MethodDefinition',
  NEW: 'NewExpression',
  OBJECT: 'ObjectExpression',
  OBJECT_PATTERN: 'ObjectPattern',
  PROPERTY: 'Property',
  REST: 'RestElement',
  SPREAD: 'SpreadElement',
  TEMPLATE_LITERAL: 'TemplateLiteral',
  VARIABLE_DECLARATOR: 'VariableDeclarator',
});

const CANONICAL_CRITICAL_PARTITION_IDS = new Set(
  Object.values(SYSTEM_TABLE_NAME).map((tableName) => `${tableName}-p1`),
);

function unwrapChain(node) {
  return node?.type === NODE_TYPE.CHAIN ? node.expression : node;
}

function resolveIdentifierName(node) {
  const normalized = unwrapChain(node);
  return normalized?.type === NODE_TYPE.IDENTIFIER ? normalized.name : null;
}

function resolvePropertyName(propertyOrMember) {
  const normalized = unwrapChain(propertyOrMember);
  const property = normalized?.type === NODE_TYPE.MEMBER ?
    normalized.property :
    normalized?.key;
  const computed = normalized?.computed === true;
  if (!computed && property?.type === NODE_TYPE.IDENTIFIER) {
    return property.name;
  }
  if (computed && property?.type === NODE_TYPE.LITERAL &&
      typeof property.value === 'string') {
    return property.value;
  }
  return null;
}

function resolveAccessPath(node) {
  const normalized = unwrapChain(node);
  const identifierName = resolveIdentifierName(normalized);
  if (identifierName) return identifierName;
  if (normalized?.type !== NODE_TYPE.MEMBER) return null;
  const objectPath = resolveAccessPath(normalized.object);
  const propertyName = resolvePropertyName(normalized);
  return objectPath && propertyName ? `${objectPath}.${propertyName}` : null;
}

function literalStringValue(node) {
  const normalized = unwrapChain(node);
  if (normalized?.type === NODE_TYPE.LITERAL &&
      typeof normalized.value === 'string') {
    return normalized.value;
  }
  if (normalized?.type !== NODE_TYPE.TEMPLATE_LITERAL ||
      normalized.expressions?.length > 0) {
    if (normalized?.type !== NODE_TYPE.BINARY ||
        normalized.operator !== '+') return null;
    const left = literalStringValue(normalized.left);
    const right = literalStringValue(normalized.right);
    return left === null || right === null ? null : `${left}${right}`;
  }
  return (normalized.quasis || []).map((quasi) =>
    quasi.value?.cooked ?? quasi.value?.raw ?? '').join('');
}

function isObjectDerivedCriticalCollection(node, source) {
  const normalized = unwrapChain(node);
  if (!normalized?.range) return false;
  const expressionSource = source.slice(
    normalized.range[0],
    normalized.range[1],
  );
  return /Object\.(?:entries|keys|values)\s*\(\s*SYSTEM_TABLE_NAME\s*\)/u
    .test(expressionSource) &&
    /(?:-p1|\$\{[^}]+\}-p1)/u.test(expressionSource);
}

function extractCanonicalCriticalIds(node, source, knownCollections) {
  const normalized = unwrapChain(node);
  const accessPath = resolveAccessPath(normalized);
  if (accessPath && knownCollections.has(accessPath)) {
    return new Set(CANONICAL_CRITICAL_PARTITION_IDS);
  }
  if (isObjectDerivedCriticalCollection(normalized, source)) {
    return new Set(CANONICAL_CRITICAL_PARTITION_IDS);
  }
  if (normalized?.type !== NODE_TYPE.ARRAY) return null;
  const partitionIds = new Set();
  for (const element of normalized.elements || []) {
    if (element?.type === NODE_TYPE.SPREAD) {
      const spreadIds = extractCanonicalCriticalIds(
        element.argument,
        source,
        knownCollections,
      );
      if (!spreadIds) return null;
      for (const partitionId of spreadIds) partitionIds.add(partitionId);
      continue;
    }
    const partitionId = literalStringValue(element);
    if (partitionId === null) return null;
    partitionIds.add(partitionId);
  }
  return partitionIds;
}

function isCriticalCollectionExpression(node, source, knownCollections) {
  const partitionIds = extractCanonicalCriticalIds(
    node,
    source,
    knownCollections,
  );
  return partitionIds?.size === CANONICAL_CRITICAL_PARTITION_IDS.size &&
    [...partitionIds].every((partitionId) =>
      CANONICAL_CRITICAL_PARTITION_IDS.has(partitionId));
}

function isCriticalSetConstruction(node, source, knownCollections) {
  const normalized = unwrapChain(node);
  return normalized?.type === NODE_TYPE.NEW &&
    resolveIdentifierName(normalized.callee) === 'Set' &&
    isCriticalCollectionExpression(
      normalized.arguments?.[0],
      source,
      knownCollections,
    );
}

function propagateAccessPathAliases(
  sourceNode,
  targetPath,
  aliasMap,
  aliasSet,
) {
  const normalized = unwrapChain(sourceNode);
  if (!targetPath) return false;
  let changed = false;
  if (normalized?.type === NODE_TYPE.OBJECT) {
    for (const property of normalized.properties || []) {
      if (property.type !== NODE_TYPE.SPREAD) continue;
      changed = propagateAccessPathAliases(
        property.argument,
        targetPath,
        aliasMap,
        aliasSet,
      ) || changed;
    }
  }
  const sourcePath = resolveAccessPath(normalized);
  if (!sourcePath || sourcePath === targetPath) return changed;
  const sourcePrefix = `${sourcePath}.`;
  for (const [accessPath, value] of [...aliasMap]) {
    if (!accessPath.startsWith(sourcePrefix)) continue;
    const forwardedPath = `${targetPath}.${accessPath.slice(sourcePrefix.length)}`;
    if (aliasMap.get(forwardedPath) === value) continue;
    aliasMap.set(forwardedPath, value);
    changed = true;
  }
  for (const accessPath of [...aliasSet]) {
    if (!accessPath.startsWith(sourcePrefix)) continue;
    const forwardedPath = `${targetPath}.${accessPath.slice(sourcePrefix.length)}`;
    if (aliasSet.has(forwardedPath)) continue;
    aliasSet.add(forwardedPath);
    changed = true;
  }
  return changed;
}

function addLegacyAlias(map, name, kind) {
  if (!name || !kind || map.get(name) === kind) return false;
  map.set(name, kind);
  return true;
}

function addCriticalSetAlias(aliasSet, name) {
  if (!name || aliasSet.has(name)) return false;
  aliasSet.add(name);
  return true;
}

function pathIsWithin(accessPath, prefix) {
  return accessPath === prefix || accessPath.startsWith(`${prefix}.`);
}

function clearObjectAliasSubtree(state, prefix) {
  for (const accessPath of [...state.legacyKindByAccessPath.keys()]) {
    if (pathIsWithin(accessPath, prefix)) {
      state.legacyKindByAccessPath.delete(accessPath);
    }
  }
  for (const aliasSet of [
    state.criticalCollectionLocalNames,
    state.criticalSetLocalNames,
    state.objectPropertyPaths,
  ]) {
    for (const accessPath of [...aliasSet]) {
      if (pathIsWithin(accessPath, prefix)) aliasSet.delete(accessPath);
    }
  }
}

function copyObjectAliases(
  sourceNode,
  targetPath,
  aliasState,
  localState,
  evaluateProperty,
) {
  const normalized = unwrapChain(sourceNode);
  if (normalized?.type === NODE_TYPE.OBJECT) {
    buildObjectAliases(
      targetPath,
      normalized,
      aliasState,
      localState,
      evaluateProperty,
    );
    return;
  }
  const sourcePath = resolveAccessPath(normalized);
  if (!sourcePath) return;
  const sourcePrefix = `${sourcePath}.`;
  for (const accessPath of aliasState.objectPropertyPaths) {
    if (!accessPath.startsWith(sourcePrefix)) continue;
    const copiedPath = `${targetPath}.${accessPath.slice(sourcePrefix.length)}`;
    clearObjectAliasSubtree(localState, copiedPath);
    localState.objectPropertyPaths.add(copiedPath);
  }
  for (const [accessPath, kind] of aliasState.legacyKindByAccessPath) {
    if (accessPath.startsWith(sourcePrefix)) {
      localState.legacyKindByAccessPath.set(
        `${targetPath}.${accessPath.slice(sourcePrefix.length)}`,
        kind,
      );
    }
  }
  for (const [sourceSet, targetSet] of [
    [aliasState.criticalSetLocalNames, localState.criticalSetLocalNames],
    [
      aliasState.criticalCollectionLocalNames,
      localState.criticalCollectionLocalNames,
    ],
  ]) {
    for (const accessPath of sourceSet) {
      if (accessPath.startsWith(sourcePrefix)) {
        targetSet.add(`${targetPath}.${accessPath.slice(sourcePrefix.length)}`);
      }
    }
  }
}

function buildObjectAliases(
  objectName,
  objectNode,
  aliasState,
  localState,
  evaluateProperty,
) {
  for (const property of objectNode.properties || []) {
    if (property.type === NODE_TYPE.SPREAD) {
      copyObjectAliases(
        property.argument,
        objectName,
        aliasState,
        localState,
        evaluateProperty,
      );
      continue;
    }
    if (property.type !== NODE_TYPE.PROPERTY) continue;
    const propertyName = resolvePropertyName(property);
    if (!propertyName) continue;
    const accessPath = `${objectName}.${propertyName}`;
    clearObjectAliasSubtree(localState, accessPath);
    localState.objectPropertyPaths.add(accessPath);
    const evaluation = evaluateProperty(property.value);
    if (evaluation.kind) {
      localState.legacyKindByAccessPath.set(accessPath, evaluation.kind);
    }
    if (evaluation.criticalSet) {
      localState.criticalSetLocalNames.add(accessPath);
    }
    if (evaluation.criticalCollection) {
      localState.criticalCollectionLocalNames.add(accessPath);
    }
    if (unwrapChain(property.value)?.type === NODE_TYPE.OBJECT) {
      buildObjectAliases(
        accessPath,
        unwrapChain(property.value),
        aliasState,
        localState,
        evaluateProperty,
      );
    }
  }
}

function syncAliasCollection(target, desired, prefix, mergeOnly) {
  let changed = false;
  if (!mergeOnly) {
    const targetEntries = target instanceof Map ? [...target.keys()] : [...target];
    for (const accessPath of targetEntries) {
      if (!pathIsWithin(accessPath, prefix) || desired.has(accessPath)) continue;
      target.delete(accessPath);
      changed = true;
    }
  }
  for (const entry of desired) {
    const [accessPath, value] = target instanceof Map ? entry : [entry, null];
    if (target instanceof Map ? target.get(accessPath) === value :
      target.has(accessPath)) continue;
    if (target instanceof Map) target.set(accessPath, value);
    else target.add(accessPath);
    changed = true;
  }
  return changed;
}

function applyObjectAliases({
  aliasState,
  evaluateProperty,
  initializer,
  mergeOnly = false,
  objectName,
}) {
  const normalized = unwrapChain(initializer);
  if (!objectName || normalized?.type !== NODE_TYPE.OBJECT) return false;
  const localState = {
    criticalCollectionLocalNames: new Set(),
    criticalSetLocalNames: new Set(),
    legacyKindByAccessPath: new Map(),
    objectPropertyPaths: new Set(),
  };
  buildObjectAliases(
    objectName,
    normalized,
    aliasState,
    localState,
    evaluateProperty,
  );
  return [
    ['legacyKindByAccessPath', aliasState.legacyKindByAccessPath],
    ['criticalSetLocalNames', aliasState.criticalSetLocalNames],
    ['criticalCollectionLocalNames', aliasState.criticalCollectionLocalNames],
    ['objectPropertyPaths', aliasState.objectPropertyPaths],
  ].reduce((changed, [key, target]) =>
    syncAliasCollection(
      target,
      localState[key],
      objectName,
      mergeOnly,
    ) || changed, false);
}

export {
  addCriticalSetAlias,
  addLegacyAlias,
  applyObjectAliases,
  isCriticalCollectionExpression,
  isCriticalSetConstruction,
  NODE_TYPE,
  propagateAccessPathAliases,
  resolveAccessPath,
  resolveIdentifierName,
  resolvePropertyName,
  unwrapChain,
};
