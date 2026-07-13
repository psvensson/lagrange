import {
  NODE_TYPE,
  resolveAccessPath,
  resolveIdentifierName,
  resolvePropertyName,
  unwrapChain,
} from './partition-class-owner-ast.js';

function collectFunctionByName(entries) {
  const functionByName = new Map();
  for (const {node} of entries) {
    if (node.type === NODE_TYPE.FUNCTION_DECLARATION && node.id?.name) {
      functionByName.set(node.id.name, node);
    }
    if (node.type === NODE_TYPE.VARIABLE_DECLARATOR && node.id?.name &&
        ['ArrowFunctionExpression', 'FunctionExpression'].includes(
          node.init?.type,
        )) {
      functionByName.set(node.id.name, node.init);
    }
  }
  return functionByName;
}

function resolveArgumentProperty(
  argument,
  propertyPath,
  aliasState,
  resolveLegacyValueKind,
  isCriticalSetValue,
) {
  const [propertyName, ...remainingPath] = Array.isArray(propertyPath) ?
    propertyPath : [propertyPath];
  const normalized = unwrapChain(argument);
  if (normalized?.type === NODE_TYPE.OBJECT) {
    for (const property of [...(normalized.properties || [])].reverse()) {
      if (property.type === NODE_TYPE.SPREAD) {
        const resolved = resolveArgumentProperty(
          property.argument,
          [propertyName, ...remainingPath],
          aliasState,
          resolveLegacyValueKind,
          isCriticalSetValue,
        );
        if (resolved.found) return resolved;
        continue;
      }
      if (property.type !== NODE_TYPE.PROPERTY ||
          resolvePropertyName(property) !== propertyName) continue;
      if (remainingPath.length > 0) {
        return resolveArgumentProperty(
          property.value,
          remainingPath,
          aliasState,
          resolveLegacyValueKind,
          isCriticalSetValue,
        );
      }
      return {
        found: true,
        kind: resolveLegacyValueKind(
          property.value,
          aliasState.legacyKindByLocalName,
          aliasState.legacyKindByAccessPath,
        ),
        criticalSet: isCriticalSetValue(property.value),
      };
    }
    return {found: false, kind: null, criticalSet: false};
  }
  const argumentPath = resolveAccessPath(normalized);
  const suffix = [propertyName, ...remainingPath].join('.');
  const accessPath = argumentPath ? `${argumentPath}.${suffix}` : null;
  const kind = accessPath ?
    aliasState.legacyKindByAccessPath.get(accessPath) || null : null;
  const criticalSet = accessPath ?
    aliasState.criticalSetLocalNames.has(accessPath) : false;
  return {
    found: Boolean(
      kind || criticalSet || aliasState.objectPropertyPaths.has(accessPath),
    ),
    kind,
    criticalSet,
  };
}

function clearParameterAliasSubtree(parameterKinds, parameterSets, prefix) {
  for (const accessPath of [...parameterKinds.keys()]) {
    if (accessPath === prefix || accessPath.startsWith(`${prefix}.`)) {
      parameterKinds.delete(accessPath);
    }
  }
  for (const accessPath of [...parameterSets]) {
    if (accessPath === prefix || accessPath.startsWith(`${prefix}.`)) {
      parameterSets.delete(accessPath);
    }
  }
}

function collectAccessPathParameterAliases(
  parameterKinds,
  parameterSets,
  parameterName,
  argument,
  aliasState,
) {
  const normalized = unwrapChain(argument);
  if (normalized?.type === NODE_TYPE.OBJECT) {
    for (const property of normalized.properties || []) {
      if (property.type === NODE_TYPE.SPREAD) {
        collectAccessPathParameterAliases(
          parameterKinds,
          parameterSets,
          parameterName,
          property.argument,
          aliasState,
        );
      }
    }
    return;
  }
  const argumentPath = resolveAccessPath(normalized);
  if (!argumentPath) return;
  const prefix = `${argumentPath}.`;
  for (const accessPath of aliasState.objectPropertyPaths) {
    if (accessPath.startsWith(prefix)) {
      clearParameterAliasSubtree(
        parameterKinds,
        parameterSets,
        `${parameterName}.${accessPath.slice(prefix.length)}`,
      );
    }
  }
  for (const [accessPath, kind] of aliasState.legacyKindByAccessPath) {
    if (accessPath.startsWith(prefix)) {
      parameterKinds.set(
        `${parameterName}.${accessPath.slice(prefix.length)}`,
        kind,
      );
    }
  }
  for (const accessPath of aliasState.criticalSetLocalNames) {
    if (accessPath.startsWith(prefix)) {
      parameterSets.add(
        `${parameterName}.${accessPath.slice(prefix.length)}`,
      );
    }
  }
}

function collectIdentifierParameterAliases(
  parameterKinds,
  parameterSets,
  parameterName,
  argument,
  aliasState,
  resolveLegacyValueKind,
  isCriticalSetValue,
) {
  const directKind = resolveLegacyValueKind(
    argument,
    aliasState.legacyKindByLocalName,
    aliasState.legacyKindByAccessPath,
  );
  if (directKind) parameterKinds.set(parameterName, directKind);
  if (isCriticalSetValue(argument)) {
    parameterSets.add(parameterName);
  }
  const normalized = unwrapChain(argument);
  if (normalized?.type === NODE_TYPE.OBJECT) {
    for (const property of normalized.properties || []) {
      if (property.type === NODE_TYPE.SPREAD) {
        collectIdentifierParameterAliases(
          parameterKinds,
          parameterSets,
          parameterName,
          property.argument,
          aliasState,
          resolveLegacyValueKind,
          isCriticalSetValue,
        );
        continue;
      }
      if (property.type !== NODE_TYPE.PROPERTY) continue;
      const propertyName = resolvePropertyName(property);
      const parameterPath = propertyName ?
        `${parameterName}.${propertyName}` : null;
      if (parameterPath) {
        clearParameterAliasSubtree(
          parameterKinds,
          parameterSets,
          parameterPath,
        );
      }
      const kind = resolveLegacyValueKind(
        property.value,
        aliasState.legacyKindByLocalName,
        aliasState.legacyKindByAccessPath,
      );
      if (propertyName && kind) {
        parameterKinds.set(`${parameterName}.${propertyName}`, kind);
      }
      if (propertyName && isCriticalSetValue(property.value)) {
        parameterSets.add(`${parameterName}.${propertyName}`);
      }
      if (propertyName &&
          unwrapChain(property.value)?.type === NODE_TYPE.OBJECT) {
        collectIdentifierParameterAliases(
          parameterKinds,
          parameterSets,
          `${parameterName}.${propertyName}`,
          property.value,
          aliasState,
          resolveLegacyValueKind,
          isCriticalSetValue,
        );
      }
    }
    return;
  }
  collectAccessPathParameterAliases(
    parameterKinds,
    parameterSets,
    parameterName,
    argument,
    aliasState,
  );
}

function collectPatternParameterAliases(
  parameterKinds,
  parameterSets,
  parameter,
  argument,
  aliasState,
  resolveLegacyValueKind,
  isCriticalSetValue,
  sourcePath = [],
) {
  const excludedPropertyNames = new Set();
  for (const property of parameter.properties || []) {
    if (property.type === NODE_TYPE.REST) {
      const localName = resolveIdentifierName(property.argument);
      if (localName) {
        const sourceRoot = '__destructuredSource';
        const allKinds = new Map();
        const allSets = new Set();
        collectIdentifierParameterAliases(
          allKinds,
          allSets,
          sourceRoot,
          argument,
          aliasState,
          resolveLegacyValueKind,
          isCriticalSetValue,
        );
        clearParameterAliasSubtree(parameterKinds, parameterSets, localName);
        const sourcePrefix = [sourceRoot, ...sourcePath].join('.');
        const prefix = `${sourcePrefix}.`;
        for (const [accessPath, kind] of allKinds) {
          if (!accessPath.startsWith(prefix)) continue;
          const relativePath = accessPath.slice(prefix.length);
          const [propertyName] = relativePath.split('.');
          if (!excludedPropertyNames.has(propertyName)) {
            parameterKinds.set(`${localName}.${relativePath}`, kind);
          }
        }
        for (const accessPath of allSets) {
          if (!accessPath.startsWith(prefix)) continue;
          const relativePath = accessPath.slice(prefix.length);
          const [propertyName] = relativePath.split('.');
          if (!excludedPropertyNames.has(propertyName)) {
            parameterSets.add(`${localName}.${relativePath}`);
          }
        }
      }
      continue;
    }
    if (property.type !== NODE_TYPE.PROPERTY) continue;
    const propertyName = resolvePropertyName(property);
    if (!propertyName) continue;
    excludedPropertyNames.add(propertyName);
    const propertyValue = unwrapChain(property.value);
    const nextPath = [...sourcePath, propertyName];
    if (propertyValue?.type === NODE_TYPE.OBJECT_PATTERN) {
      collectPatternParameterAliases(
        parameterKinds,
        parameterSets,
        propertyValue,
        argument,
        aliasState,
        resolveLegacyValueKind,
        isCriticalSetValue,
        nextPath,
      );
      continue;
    }
    const localName = resolveIdentifierName(propertyValue) ||
      resolveIdentifierName(propertyValue?.left);
    if (!localName) continue;
    const resolved = resolveArgumentProperty(
      argument,
      nextPath,
      aliasState,
      resolveLegacyValueKind,
      isCriticalSetValue,
    );
    if (resolved.kind) parameterKinds.set(localName, resolved.kind);
    if (resolved.criticalSet) parameterSets.add(localName);
    if (!resolved.found &&
        propertyValue?.type === NODE_TYPE.ASSIGNMENT_PATTERN) {
      const defaultKind = resolveLegacyValueKind(
        propertyValue.right,
        aliasState.legacyKindByLocalName,
        aliasState.legacyKindByAccessPath,
      );
      if (defaultKind) parameterKinds.set(localName, defaultKind);
      if (isCriticalSetValue(propertyValue.right)) {
        parameterSets.add(localName);
      }
    }
  }
}

function collectFunctionParameterAliases(
  entries,
  aliasState,
  resolveLegacyValueKind,
  isCriticalSetValue,
) {
  const functionByName = collectFunctionByName(entries);
  const kindsByFunction = new Map();
  const criticalSetsByFunction = new Map();
  for (const {node} of entries) {
    if (node.type !== NODE_TYPE.CALL) continue;
    const functionNode = functionByName.get(resolveIdentifierName(node.callee));
    if (!functionNode) continue;
    const aggregateKinds = kindsByFunction.get(functionNode) || new Map();
    const aggregateSets = criticalSetsByFunction.get(functionNode) || new Set();
    const parameterKinds = new Map();
    const parameterSets = new Set();
    for (const [index, parameter] of (functionNode.params || []).entries()) {
      const argument = node.arguments?.[index];
      const parameterName = resolveIdentifierName(parameter);
      if (parameterName) {
        collectIdentifierParameterAliases(
          parameterKinds,
          parameterSets,
          parameterName,
          argument,
          aliasState,
          resolveLegacyValueKind,
          isCriticalSetValue,
        );
      } else if (parameter.type === NODE_TYPE.OBJECT_PATTERN) {
        collectPatternParameterAliases(
          parameterKinds,
          parameterSets,
          parameter,
          argument,
          aliasState,
          resolveLegacyValueKind,
          isCriticalSetValue,
        );
      }
    }
    for (const [accessPath, kind] of parameterKinds) {
      aggregateKinds.set(accessPath, kind);
    }
    for (const accessPath of parameterSets) aggregateSets.add(accessPath);
    if (aggregateKinds.size > 0) {
      kindsByFunction.set(functionNode, aggregateKinds);
    }
    if (aggregateSets.size > 0) {
      criticalSetsByFunction.set(functionNode, aggregateSets);
    }
  }
  return {criticalSetsByFunction, kindsByFunction};
}

function collectDestructuredAliases(
  pattern,
  argument,
  aliasState,
  resolveLegacyValueKind,
  isCriticalSetValue,
) {
  const kinds = new Map();
  const criticalSets = new Set();
  collectPatternParameterAliases(
    kinds,
    criticalSets,
    pattern,
    argument,
    aliasState,
    resolveLegacyValueKind,
    isCriticalSetValue,
  );
  return {criticalSets, kinds};
}

function resolveFunctionParameterValue(node, ancestors, valuesByFunction) {
  const accessPath = resolveAccessPath(node);
  if (!accessPath) return null;
  const functionNode = [...ancestors].reverse().find((ancestor) =>
    [
      NODE_TYPE.FUNCTION_DECLARATION,
      'FunctionExpression',
      'ArrowFunctionExpression',
    ].includes(ancestor.type));
  const values = valuesByFunction.get(functionNode);
  return values instanceof Map ? values.get(accessPath) || null :
    values?.has(accessPath) || false;
}

export {
  collectDestructuredAliases,
  collectFunctionParameterAliases,
  resolveFunctionParameterValue,
};
