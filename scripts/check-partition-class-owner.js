// System-partition classification census — quest
// partition-class-ladder-single-owner-table (epic
// self-hosting-circularity-generic-treatment Option 5, fifth semantic).
//
// The semantic "which ordered system-partition class applies" must be
// declared once in src/bootstrap/system-partition-classification.js. This
// analyzer counts production decision sites that still consume independent
// legacy predicates or the bootstrap-critical set directly. A literal
// critical || priority ladder is one decision site, not two call edges.
// Alias propagation covers imports, assignment chains, object destructuring,
// computed members, bind aliases, injected predicate members, and renamed
// local critical-set references. Exact legacy semantic names are fail-closed:
// a genuinely unrelated collision needs a committed, reasoned exclusion.
//
// Metric 0 means every production decision consumes the named classifier
// outcome or a new owner-derived predicate. The owner module is structurally
// checked for the named frozen class vocabulary, ordered row table, exported
// classifier, and frozen canonical outcome; it is not trusted merely because
// its path is excluded from the consumer census.

import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {
  parseSourceFile,
  runGuidelineCheckWhenDirect,
  walkAst,
} from './guideline-check-shared.js';

const REPO_ROOT = path.resolve(
  path.dirname(new globalThis.URL(import.meta.url).pathname),
  '..',
);
const SCAN_ROOT = 'src';
const OWNER_MODULE = 'src/bootstrap/system-partition-classification.js';
const ORACLE_FILE =
  'solve/oracle/partition-class-ladder-single-owner-table.json';
const ORACLE_TARGET = 0;
const ANALYZER_CONTRACT_VERSION = 2;
const EPIC_CENSUS_BASELINE = 119;
const HEAD_BASELINE_PREDICATE_EDGES = 122;
const HEAD_BASELINE_SET_MEMBERSHIPS = 3;
const HEAD_BASELINE_COLLAPSED_LADDER_EDGES = 6;
const CRITICAL_SET_EXPORT = 'CRITICAL_SYSTEM_PARTITION_IDS';

const OWNER_CONTRACT_NAME = Object.freeze({
  CLASS: 'SYSTEM_PARTITION_CLASS',
  ROWS: 'SYSTEM_PARTITION_CLASS_ROWS',
  CLASSIFIER: 'classifySystemPartition',
});

const EXPECTED_PARTITION_CLASS_VALUE = Object.freeze({
  BOOTSTRAP_CRITICAL: 'bootstrap_critical',
  PRIORITY_CONTROL_PLANE: 'priority_control_plane',
  DEFAULT: 'default',
});

const EXPECTED_CLASSIFIER_OUTCOME_FIELDS = Object.freeze([
  'partitionClass',
  'bootstrapCritical',
  'priorityControlPlane',
  'systemTable',
]);

const VIOLATION_KIND = Object.freeze({
  CRITICAL_CALL: 'critical_predicate_call',
  PRIORITY_CALL: 'priority_predicate_call',
  SYSTEM_TABLE_CALL: 'system_table_predicate_call',
  CRITICAL_SET_MEMBERSHIP: 'critical_set_membership',
  CRITICAL_SET_DECLARATION: 'critical_set_declaration',
  ORDERED_LADDER: 'ordered_partition_class_ladder',
  LEGACY_ALIAS_EXPORT: 'legacy_alias_export',
});

const LEGACY_NAME_KIND = Object.freeze(new Map([
  ['isCriticalSystemPartition', VIOLATION_KIND.CRITICAL_CALL],
  ['isPriorityControlPlanePartition', VIOLATION_KIND.PRIORITY_CALL],
  ['isSystemTablePartition', VIOLATION_KIND.SYSTEM_TABLE_CALL],
]));

const NODE_TYPE = Object.freeze({
  ASSIGNMENT: 'AssignmentExpression',
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
  VARIABLE_DECLARATOR: 'VariableDeclarator',
});

const EXIT_CODE = Object.freeze({SUCCESS: 0, FAILURE: 1});

const GATE_COMMANDS = Object.freeze([
  {label: 'lint', command: ['npm', 'run', 'lint', '--silent']},
  {
    label: 'decision-table-model',
    command: ['npm', 'run', 'model:decision-tables', '--silent'],
  },
  {
    label: 'targeted-suites',
    command: [
      'node',
      'scripts/run-test-files.js',
      'test/scripts/check-partition-class-owner.test.js',
      'test/bootstrap/traffic-readiness-utils.test.js',
      'test/rebalancer/system-partition-start-delay-preservation.property.test.js',
      'test/rebalancer/unified-rebalancer-triggers-system-partition-defer.test.js',
      'test/control-plane/priority-recovery-snapshot-operation-owner-outcome.test.js',
    ],
  },
]);

function normalizeRepoPath(filePath) {
  return path.relative(REPO_ROOT, path.resolve(filePath))
    .split(path.sep)
    .join('/');
}

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

function findEnclosingIdentifier(ancestors) {
  for (const ancestor of ancestors) {
    if (ancestor.type === NODE_TYPE.METHOD && resolvePropertyName(ancestor)) {
      return resolvePropertyName(ancestor);
    }
    if (ancestor.type === NODE_TYPE.FUNCTION_DECLARATION && ancestor.id?.name) {
      return ancestor.id.name;
    }
  }
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index];
    if (ancestor.type === NODE_TYPE.VARIABLE_DECLARATOR &&
        ancestor.id?.type === NODE_TYPE.IDENTIFIER) {
      return ancestor.id.name;
    }
    if (ancestor.type === NODE_TYPE.PROPERTY && resolvePropertyName(ancestor)) {
      return resolvePropertyName(ancestor);
    }
  }
  return '<module>';
}

function resolveLegacyValueKind(
  node,
  legacyKindByLocalName,
  legacyKindByAccessPath = new Map(),
) {
  const normalized = unwrapChain(node);
  const identifierName = resolveIdentifierName(normalized);
  if (identifierName) {
    return legacyKindByLocalName.get(identifierName) ||
      LEGACY_NAME_KIND.get(identifierName) ||
      null;
  }
  if (normalized?.type === NODE_TYPE.MEMBER) {
    const propertyName = resolvePropertyName(normalized);
    if (propertyName === 'bind') {
      return resolveLegacyValueKind(
        normalized.object,
        legacyKindByLocalName,
        legacyKindByAccessPath,
      );
    }
    return legacyKindByAccessPath.get(resolveAccessPath(normalized)) ||
      LEGACY_NAME_KIND.get(propertyName) ||
      null;
  }
  if (normalized?.type === NODE_TYPE.CALL) {
    return resolveLegacyValueKind(
      normalized.callee,
      legacyKindByLocalName,
      legacyKindByAccessPath,
    );
  }
  return null;
}

function resolvesCriticalSet(node, criticalSetLocalNames) {
  const normalized = unwrapChain(node);
  const accessPath = resolveAccessPath(normalized);
  if (accessPath && criticalSetLocalNames.has(accessPath)) return true;
  return normalized?.type === NODE_TYPE.MEMBER &&
    resolvePropertyName(normalized) === CRITICAL_SET_EXPORT;
}

function addLegacyAlias(map, name, kind) {
  if (!name || !kind || map.get(name) === kind) return false;
  map.set(name, kind);
  return true;
}

function addCriticalSetAlias(criticalSetLocalNames, name) {
  if (!name || criticalSetLocalNames.has(name)) return false;
  criticalSetLocalNames.add(name);
  return true;
}

function addPatternAliases(
  pattern,
  legacyKindByLocalName,
  criticalSetLocalNames,
) {
  if (pattern?.type !== NODE_TYPE.OBJECT_PATTERN) return false;
  let changed = false;
  for (const property of pattern.properties || []) {
    if (property.type !== NODE_TYPE.PROPERTY) continue;
    const sourceName = resolvePropertyName(property);
    const localName = resolveIdentifierName(property.value);
    if (!sourceName || !localName) continue;
    const kind = LEGACY_NAME_KIND.get(sourceName);
    if (kind && legacyKindByLocalName.get(localName) !== kind) {
      legacyKindByLocalName.set(localName, kind);
      changed = true;
    }
    if (sourceName === CRITICAL_SET_EXPORT &&
        !criticalSetLocalNames.has(localName)) {
      criticalSetLocalNames.add(localName);
      changed = true;
    }
  }
  return changed;
}

function isCriticalSetConstruction(node, source) {
  const normalized = unwrapChain(node);
  if (normalized?.type !== NODE_TYPE.NEW ||
      resolveIdentifierName(normalized.callee) !== 'Set' ||
      !normalized.range) return false;
  const declarationSource = source.slice(
    normalized.range[0],
    normalized.range[1],
  );
  return /Object\.values\s*\(\s*SYSTEM_TABLE_NAME\s*\)/u
    .test(declarationSource) &&
    /(?:-p1|\$\{[^}]+\}-p1)/u.test(declarationSource);
}

function addObjectAliases(
  objectName,
  initializer,
  aliasState,
) {
  const normalized = unwrapChain(initializer);
  if (!objectName || normalized?.type !== NODE_TYPE.OBJECT) return false;
  let changed = false;
  for (const property of normalized.properties || []) {
    if (property.type !== NODE_TYPE.PROPERTY) continue;
    const propertyName = resolvePropertyName(property);
    if (!propertyName) continue;
    const accessPath = `${objectName}.${propertyName}`;
    changed = addLegacyAlias(
      aliasState.legacyKindByAccessPath,
      accessPath,
      resolveLegacyValueKind(
        property.value,
        aliasState.legacyKindByLocalName,
        aliasState.legacyKindByAccessPath,
      ),
    ) || changed;
    if (resolvesCriticalSet(
      property.value,
      aliasState.criticalSetLocalNames,
    )) {
      changed = addCriticalSetAlias(
        aliasState.criticalSetLocalNames,
        accessPath,
      ) || changed;
    }
  }
  return changed;
}

function applyVariableAliases(node, aliasState, source) {
  let changed = addPatternAliases(
    node.id,
    aliasState.legacyKindByLocalName,
    aliasState.criticalSetLocalNames,
  );
  const localName = resolveIdentifierName(node.id);
  changed = addLegacyAlias(
    aliasState.legacyKindByLocalName,
    localName,
    resolveLegacyValueKind(
      node.init,
      aliasState.legacyKindByLocalName,
      aliasState.legacyKindByAccessPath,
    ),
  ) || changed;
  if (resolvesCriticalSet(node.init, aliasState.criticalSetLocalNames) ||
      isCriticalSetConstruction(node.init, source)) {
    changed = addCriticalSetAlias(
      aliasState.criticalSetLocalNames,
      localName,
    ) || changed;
  }
  return addObjectAliases(localName, node.init, aliasState) || changed;
}

function applyAssignmentAliases(node, aliasState) {
  const accessPath = resolveAccessPath(node.left);
  const kind = resolveLegacyValueKind(
    node.right,
    aliasState.legacyKindByLocalName,
    aliasState.legacyKindByAccessPath,
  );
  const targetMap = node.left?.type === NODE_TYPE.MEMBER ?
    aliasState.legacyKindByAccessPath :
    aliasState.legacyKindByLocalName;
  let changed = addLegacyAlias(targetMap, accessPath, kind);
  if (resolvesCriticalSet(node.right, aliasState.criticalSetLocalNames)) {
    changed = addCriticalSetAlias(
      aliasState.criticalSetLocalNames,
      accessPath,
    ) || changed;
  }
  return changed;
}

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

function collectFunctionParameterKinds(entries, functionByName, aliasState) {
  const kindsByFunction = new Map();
  for (const {node} of entries) {
    if (node.type !== NODE_TYPE.CALL) continue;
    const functionNode = functionByName.get(resolveIdentifierName(node.callee));
    if (!functionNode) continue;
    const parameterKinds = kindsByFunction.get(functionNode) || new Map();
    for (const [index, parameter] of (functionNode.params || []).entries()) {
      const parameterName = resolveIdentifierName(parameter);
      const kind = resolveLegacyValueKind(
        node.arguments?.[index],
        aliasState.legacyKindByLocalName,
        aliasState.legacyKindByAccessPath,
      );
      if (parameterName && kind) parameterKinds.set(parameterName, kind);
    }
    if (parameterKinds.size > 0) {
      kindsByFunction.set(functionNode, parameterKinds);
    }
  }
  return kindsByFunction;
}

function collectAliasState(ast, source) {
  const legacyKindByLocalName = new Map();
  const legacyKindByAccessPath = new Map();
  const criticalSetLocalNames = new Set([CRITICAL_SET_EXPORT]);
  const entries = [];
  walkAst(ast, (node, _parent, ancestors) => {
    entries.push({node, ancestors});
    if (node.type !== NODE_TYPE.IMPORT_DECLARATION) return;
    for (const specifier of node.specifiers || []) {
      if (specifier.type !== NODE_TYPE.IMPORT_SPECIFIER) continue;
      const importedName = specifier.imported?.name;
      const localName = specifier.local?.name;
      const kind = LEGACY_NAME_KIND.get(importedName);
      if (kind && localName) legacyKindByLocalName.set(localName, kind);
      if (importedName === CRITICAL_SET_EXPORT && localName) {
        criticalSetLocalNames.add(localName);
      }
    }
  });

  const aliasState = {
    criticalSetLocalNames,
    legacyKindByAccessPath,
    legacyKindByLocalName,
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const {node} of entries) {
      if (Array.isArray(node.params)) {
        for (const parameter of node.params) {
          changed = addPatternAliases(
            parameter,
            legacyKindByLocalName,
            criticalSetLocalNames,
          ) || changed;
        }
      }
      if (node.type === NODE_TYPE.VARIABLE_DECLARATOR) {
        changed = applyVariableAliases(node, aliasState, source) || changed;
      }
      if (node.type === NODE_TYPE.ASSIGNMENT) {
        changed = applyAssignmentAliases(node, aliasState) || changed;
      }
    }
  }
  return {
    ...aliasState,
    legacyKindByFunctionParameter: collectFunctionParameterKinds(
      entries,
      collectFunctionByName(entries),
      aliasState,
    ),
  };
}

function resolveFunctionParameterKind(node, ancestors, kindsByFunction) {
  const identifierName = resolveIdentifierName(node);
  if (!identifierName) return null;
  const functionNode = [...ancestors].reverse().find((ancestor) =>
    [
      NODE_TYPE.FUNCTION_DECLARATION,
      'FunctionExpression',
      'ArrowFunctionExpression',
    ].includes(ancestor.type));
  return kindsByFunction.get(functionNode)?.get(identifierName) || null;
}

function findNearestOrExpression(ancestors) {
  return [...ancestors].reverse().find((ancestor) =>
    ancestor.type === NODE_TYPE.LOGICAL && ancestor.operator === '||') || null;
}

function buildSite(repoPath, node, ancestors, kind, detail) {
  return {
    filePath: repoPath,
    line: node.loc?.start?.line ?? 0,
    kind,
    enclosingIdentifier: findEnclosingIdentifier(ancestors),
    detail,
  };
}

function collectFileCensus(filePath, source) {
  const repoPath = normalizeRepoPath(filePath);
  if (repoPath === OWNER_MODULE) {
    return {sites: [], predicateEdgeCount: 0, collapsedLadderEdges: 0};
  }
  const ast = parseSourceFile(source);
  const {
    criticalSetLocalNames,
    legacyKindByAccessPath,
    legacyKindByFunctionParameter,
    legacyKindByLocalName,
  } = collectAliasState(ast, source);
  const predicateEdges = [];
  const otherSites = [];
  const edgesByOrExpression = new Map();

  walkAst(ast, (node, _parent, ancestors) => {
    if (node.type === NODE_TYPE.CALL) {
      const kind = resolveLegacyValueKind(
        node.callee,
        legacyKindByLocalName,
        legacyKindByAccessPath,
      ) || resolveFunctionParameterKind(
        node.callee,
        ancestors,
        legacyKindByFunctionParameter,
      );
      const bindsAlias = resolvePropertyName(unwrapChain(node.callee)) ===
        'bind';
      if (kind && !bindsAlias) {
        const edge = buildSite(
          repoPath,
          node,
          ancestors,
          kind,
          resolveIdentifierName(node.callee) || resolvePropertyName(node.callee),
        );
        predicateEdges.push(edge);
        const orExpression = findNearestOrExpression(ancestors);
        if (orExpression) {
          const edges = edgesByOrExpression.get(orExpression) || [];
          edges.push(edge);
          edgesByOrExpression.set(orExpression, edges);
        }
      }
      const callee = unwrapChain(node.callee);
      if (resolvePropertyName(callee) === 'has' &&
          resolvesCriticalSet(callee?.object, criticalSetLocalNames)) {
        otherSites.push(buildSite(
          repoPath,
          node,
          ancestors,
          VIOLATION_KIND.CRITICAL_SET_MEMBERSHIP,
          CRITICAL_SET_EXPORT,
        ));
      }
    }
    if (node.type === NODE_TYPE.VARIABLE_DECLARATOR &&
        node.id?.type === NODE_TYPE.IDENTIFIER &&
        (node.id.name === CRITICAL_SET_EXPORT ||
          isCriticalSetConstruction(node.init, source))) {
      otherSites.push(buildSite(
        repoPath,
        node,
        ancestors,
        VIOLATION_KIND.CRITICAL_SET_DECLARATION,
        node.id.name,
      ));
    }
    if (node.type === NODE_TYPE.EXPORT_NAMED) {
      for (const specifier of node.specifiers || []) {
        const localName = specifier.local?.name;
        const exportedName = specifier.exported?.name;
        const kind = legacyKindByLocalName.get(localName) ||
          LEGACY_NAME_KIND.get(localName);
        if (kind && exportedName && exportedName !== localName) {
          otherSites.push(buildSite(
            repoPath,
            specifier,
            ancestors,
            VIOLATION_KIND.LEGACY_ALIAS_EXPORT,
            `${localName}->${exportedName}`,
          ));
        }
      }
    }
  });

  const suppressedEdges = new Set();
  const ladderSites = [];
  let collapsedLadderEdges = 0;
  for (const [orExpression, edges] of edgesByOrExpression) {
    const kinds = new Set(edges.map((edge) => edge.kind));
    if (!kinds.has(VIOLATION_KIND.CRITICAL_CALL) ||
        !kinds.has(VIOLATION_KIND.PRIORITY_CALL)) {
      continue;
    }
    for (const edge of edges) {
      if (edge.kind === VIOLATION_KIND.CRITICAL_CALL ||
          edge.kind === VIOLATION_KIND.PRIORITY_CALL) {
        suppressedEdges.add(edge);
      }
    }
    collapsedLadderEdges += Math.max(0, suppressedEdges.size + 1 -
      ladderSites.reduce((sum, site) => sum + site.collapsedEdgeCount, 0));
    ladderSites.push({
      filePath: repoPath,
      line: orExpression.loc?.start?.line ?? 0,
      kind: VIOLATION_KIND.ORDERED_LADDER,
      enclosingIdentifier: edges[0]?.enclosingIdentifier || '<module>',
      detail: [...kinds].sort().join('+'),
      collapsedEdgeCount: edges.filter((edge) =>
        suppressedEdges.has(edge)).length - 1,
    });
  }
  collapsedLadderEdges = ladderSites.reduce(
    (sum, site) => sum + site.collapsedEdgeCount,
    0,
  );
  const sites = [
    ...predicateEdges.filter((edge) => !suppressedEdges.has(edge)),
    ...otherSites,
    ...ladderSites.map(({collapsedEdgeCount: _count, ...site}) => site),
  ].sort((left, right) =>
    left.line - right.line || left.kind.localeCompare(right.kind));
  return {sites, predicateEdgeCount: predicateEdges.length, collapsedLadderEdges};
}

function collectFileSites(filePath, source) {
  return collectFileCensus(filePath, source).sites;
}

function isObjectFreezeCall(node) {
  const normalized = unwrapChain(node);
  return normalized?.type === NODE_TYPE.CALL &&
    normalized.callee?.type === NODE_TYPE.MEMBER &&
    resolveIdentifierName(normalized.callee.object) === 'Object' &&
    resolvePropertyName(normalized.callee) === 'freeze';
}

function objectFreezeArgument(node) {
  return isObjectFreezeCall(node) ? unwrapChain(node).arguments?.[0] : null;
}

function objectPropertiesByName(node) {
  const properties = new Map();
  if (node?.type !== NODE_TYPE.OBJECT) return properties;
  for (const property of node.properties || []) {
    if (property.type !== NODE_TYPE.PROPERTY) continue;
    const name = resolvePropertyName(property);
    if (name) properties.set(name, property);
  }
  return properties;
}

function hasExactObjectProperties(node, expectedNames) {
  if (node?.type !== NODE_TYPE.OBJECT ||
      node.properties?.length !== expectedNames.length ||
      node.properties.some((property) => property.type !== NODE_TYPE.PROPERTY)) {
    return false;
  }
  const properties = objectPropertiesByName(node);
  return properties.size === expectedNames.length &&
    expectedNames.every((name) => properties.has(name));
}

function declarationByName(ast) {
  const declarations = new Map();
  walkAst(ast, (node) => {
    if (node.type !== NODE_TYPE.VARIABLE_DECLARATOR || !node.id?.name) return;
    const existing = declarations.get(node.id.name) || [];
    existing.push(node);
    declarations.set(node.id.name, existing);
  });
  return declarations;
}

function classVocabularyProblems(classDeclaration) {
  const classObject = objectFreezeArgument(classDeclaration?.init);
  const properties = objectPropertiesByName(classObject);
  const problems = [];
  const expectedEntries = Object.entries(EXPECTED_PARTITION_CLASS_VALUE);
  if (!hasExactObjectProperties(
    classObject,
    expectedEntries.map(([name]) => name),
  )) {
    problems.push('SYSTEM_PARTITION_CLASS must declare exactly three classes');
  }
  for (const [name, value] of expectedEntries) {
    if (properties.get(name)?.value?.value !== value) {
      problems.push(`SYSTEM_PARTITION_CLASS.${name} must equal ${value}`);
    }
  }
  return problems;
}

function rowSource(source, node) {
  return node?.range ? source.slice(node.range[0], node.range[1]) : '';
}

function functionReturnExpression(node) {
  if (!node || (node.type !== 'ArrowFunctionExpression' &&
      node.type !== 'FunctionExpression')) {
    return null;
  }
  if (node.body?.type !== 'BlockStatement') return unwrapChain(node.body);
  if (node.body.body?.length !== 1 ||
      node.body.body[0]?.type !== 'ReturnStatement') {
    return null;
  }
  return unwrapChain(node.body.body[0].argument);
}

function destructuredContextBinding(node, propertyName) {
  const parameter = node?.params?.[0];
  if (parameter?.type !== 'ObjectPattern') return null;
  for (const property of parameter.properties || []) {
    if (property.type !== NODE_TYPE.PROPERTY ||
        resolvePropertyName(property) !== propertyName) {
      continue;
    }
    return property.value?.type === NODE_TYPE.IDENTIFIER ?
      property.value.name : null;
  }
  return null;
}

function isDirectSetMembership(node, setName, argumentName) {
  const expression = unwrapChain(node);
  if (expression?.type !== NODE_TYPE.CALL ||
      expression.arguments?.length !== 1 ||
      expression.arguments[0]?.type !== NODE_TYPE.IDENTIFIER ||
      expression.arguments[0].name !== argumentName) {
    return false;
  }
  const callee = unwrapChain(expression.callee);
  return callee?.type === NODE_TYPE.MEMBER &&
    resolveAccessPath(callee.object) === setName &&
    resolvePropertyName(callee) === 'has';
}

function rowOwnsSetMembership(rowObject, setName, contextProperty) {
  const matches = objectPropertiesByName(rowObject).get('matches')?.value;
  const binding = destructuredContextBinding(matches, contextProperty);
  return binding !== null && isDirectSetMembership(
    functionReturnExpression(matches),
    setName,
    binding,
  );
}

function rowOwnsDefaultMatch(rowObject) {
  const matches = objectPropertiesByName(rowObject).get('matches')?.value;
  const expression = functionReturnExpression(matches);
  return expression?.type === NODE_TYPE.LITERAL && expression.value === true;
}

function topLevelDeclarationByName(classifierNode) {
  const declarations = new Map();
  for (const statement of classifierNode?.body?.body || []) {
    if (statement.type !== 'VariableDeclaration') continue;
    for (const declaration of statement.declarations || []) {
      if (declaration.id?.type === NODE_TYPE.IDENTIFIER) {
        declarations.set(declaration.id.name, declaration);
      }
    }
  }
  return declarations;
}

function isNamedCallWithArgument(node, functionName, argumentPath) {
  const expression = unwrapChain(node);
  return expression?.type === NODE_TYPE.CALL &&
    resolveAccessPath(expression.callee) === functionName &&
    expression.arguments?.length === 1 &&
    resolveAccessPath(expression.arguments[0]) === argumentPath;
}

function canonicalClassifierInputProblems(classifierNode) {
  const problems = [];
  const parameter = classifierNode?.params?.[0];
  if (classifierNode?.params?.length !== 1 ||
      parameter?.type !== 'AssignmentPattern' ||
      parameter.left?.type !== NODE_TYPE.IDENTIFIER ||
      parameter.left.name !== 'options' ||
      parameter.right?.type !== NODE_TYPE.OBJECT ||
      parameter.right.properties?.length !== 0) {
    problems.push('classifySystemPartition must receive options = {}');
  }

  const declarations = topLevelDeclarationByName(classifierNode);
  const statements = classifierNode?.body?.body || [];
  const expectedDeclarationNames = [
    'partitionId',
    'tableId',
    'context',
    'row',
  ];
  const canonicalStatementOrder = statements.length === 5 &&
    expectedDeclarationNames.every((name, index) => {
      const statement = statements[index];
      return statement?.type === 'VariableDeclaration' &&
        statement.kind === 'const' &&
        statement.declarations?.length === 1 &&
        statement.declarations[0]?.id?.type === NODE_TYPE.IDENTIFIER &&
        statement.declarations[0].id.name === name;
    }) && statements[4]?.type === 'ReturnStatement';
  if (!canonicalStatementOrder) {
    problems.push(
      'classifySystemPartition must contain four canonical const declarations ' +
      'and one direct return',
    );
  }
  const partitionIdInitializer = unwrapChain(declarations.get('partitionId')?.init);
  if (partitionIdInitializer?.type !== NODE_TYPE.LOGICAL ||
      partitionIdInitializer.operator !== '||' ||
      !isNamedCallWithArgument(
        partitionIdInitializer.left,
        'getPartitionIdFromPartitionRow',
        'options.partitionRow',
      ) ||
      !isNamedCallWithArgument(
        partitionIdInitializer.right,
        'normalizeNonEmptyString',
        'options.partitionId',
      )) {
    problems.push('partitionId must derive from partitionRow then options.partitionId');
  }

  const tableIdInitializer = unwrapChain(declarations.get('tableId')?.init);
  const tableIdArgument = tableIdInitializer?.arguments?.[0];
  const tableIdFields = objectPropertiesByName(tableIdArgument);
  if (tableIdInitializer?.type !== NODE_TYPE.CALL ||
      resolveAccessPath(tableIdInitializer.callee) !== 'resolvePartitionTableId' ||
      tableIdInitializer.arguments?.length !== 1 ||
      !hasExactObjectProperties(
        tableIdArgument,
        ['partitionRow', 'partitionId'],
      ) ||
      resolveAccessPath(tableIdFields.get('partitionRow')?.value) !==
        'options.partitionRow' ||
      resolveAccessPath(tableIdFields.get('partitionId')?.value) !== 'partitionId') {
    problems.push('tableId must derive from resolvePartitionTableId canonical inputs');
  }
  return problems;
}

function orderedRowProblems(rowsDeclaration) {
  const rowsArray = objectFreezeArgument(rowsDeclaration?.init);
  const rowElements = rowsArray?.type === 'ArrayExpression' ?
    rowsArray.elements || [] : [];
  const problems = [];
  if (rowElements.length !== 3) {
    return ['SYSTEM_PARTITION_CLASS_ROWS must declare exactly three ordered rows'];
  }
  const expectedRows = [
    {
      className: 'BOOTSTRAP_CRITICAL',
      ownsPredicate: (rowObject) => rowOwnsSetMembership(
        rowObject,
        'CRITICAL_SYSTEM_PARTITION_IDS',
        'partitionId',
      ),
    },
    {
      className: 'PRIORITY_CONTROL_PLANE',
      ownsPredicate: (rowObject) => rowOwnsSetMembership(
        rowObject,
        'PRIORITY_CONTROL_PLANE_TABLE_IDS',
        'tableId',
      ),
    },
    {className: 'DEFAULT', ownsPredicate: rowOwnsDefaultMatch},
  ];
  for (const [index, expected] of expectedRows.entries()) {
    const rowObject = objectFreezeArgument(rowElements[index]);
    const properties = objectPropertiesByName(rowObject);
    if (!hasExactObjectProperties(rowObject, ['partitionClass', 'matches'])) {
      problems.push(
        `row ${index + 1} must declare exactly partitionClass and matches`,
      );
    }
    const classPath = resolveAccessPath(properties.get('partitionClass')?.value);
    if (classPath !== `SYSTEM_PARTITION_CLASS.${expected.className}`) {
      problems.push(`row ${index + 1} must classify ${expected.className}`);
    }
    if (!properties.has('matches') || !expected.ownsPredicate(rowObject)) {
      problems.push(`row ${index + 1} must own its declared match predicate`);
    }
  }
  return problems;
}

function canonicalContextNames(classifierNode) {
  const names = new Set();
  for (const statement of classifierNode?.body?.body || []) {
    if (statement.type !== 'VariableDeclaration') continue;
    for (const node of statement.declarations || []) {
      if (node.id?.type !== NODE_TYPE.IDENTIFIER) continue;
      const contextObject = objectFreezeArgument(node.init);
      const fields = objectPropertiesByName(contextObject);
      if (hasExactObjectProperties(contextObject, ['partitionId', 'tableId']) &&
          fields.get('partitionId')?.value?.type === NODE_TYPE.IDENTIFIER &&
          fields.get('partitionId').value.name === 'partitionId' &&
          fields.get('tableId')?.value?.type === NODE_TYPE.IDENTIFIER &&
          fields.get('tableId').value.name === 'tableId') {
        names.add(node.id.name);
      }
    }
  }
  return names;
}

function findInvokesRowMatch(callback, contextNames) {
  const candidateName = callback?.params?.length === 1 &&
      callback.params[0]?.type === NODE_TYPE.IDENTIFIER ?
    callback.params[0].name : null;
  const expression = functionReturnExpression(callback);
  const callee = unwrapChain(expression?.callee);
  return candidateName !== null &&
    expression?.type === NODE_TYPE.CALL &&
    expression.arguments?.length === 1 &&
    expression.arguments[0]?.type === NODE_TYPE.IDENTIFIER &&
    contextNames.has(expression.arguments[0].name) &&
    callee?.type === NODE_TYPE.MEMBER &&
    callee.object?.type === NODE_TYPE.IDENTIFIER &&
    callee.object.name === candidateName &&
    resolvePropertyName(callee) === 'matches';
}

function selectedRowNames(classifierNode) {
  const names = new Set();
  const contextNames = canonicalContextNames(classifierNode);
  for (const statement of classifierNode?.body?.body || []) {
    if (statement.type !== 'VariableDeclaration') continue;
    for (const node of statement.declarations || []) {
      if (node.id?.type !== NODE_TYPE.IDENTIFIER) continue;
      const initializer = unwrapChain(node.init);
      const callee = unwrapChain(initializer?.callee);
      if (initializer?.type === NODE_TYPE.CALL &&
          callee?.type === NODE_TYPE.MEMBER &&
          resolveAccessPath(callee.object) === OWNER_CONTRACT_NAME.ROWS &&
          resolvePropertyName(callee) === 'find' &&
          findInvokesRowMatch(initializer.arguments?.[0], contextNames)) {
        names.add(node.id.name);
      }
    }
  }
  return names;
}

function isSelectedPartitionClass(node, rowNames) {
  const expression = unwrapChain(node);
  return expression?.type === NODE_TYPE.MEMBER &&
    expression.object?.type === NODE_TYPE.IDENTIFIER &&
    rowNames.has(expression.object.name) &&
    resolvePropertyName(expression) === 'partitionClass';
}

function canonicalOutcomeProblems(fields, rowNames) {
  const problems = [];
  if (!isSelectedPartitionClass(fields.get('partitionClass')?.value, rowNames)) {
    problems.push('canonical partitionClass must come from the selected row');
  }
  const membershipFields = [
    ['bootstrapCritical', 'CRITICAL_SYSTEM_PARTITION_IDS', 'partitionId'],
    ['priorityControlPlane', 'PRIORITY_CONTROL_PLANE_TABLE_IDS', 'tableId'],
    ['systemTable', 'SYSTEM_TABLE_IDS', 'tableId'],
  ];
  for (const [fieldName, setName, argumentName] of membershipFields) {
    if (!isDirectSetMembership(
      fields.get(fieldName)?.value,
      setName,
      argumentName,
    )) {
      problems.push(
        `canonical ${fieldName} must derive from ${setName}.has(${argumentName})`,
      );
    }
  }
  return problems;
}

function classifierOutcomeProblems(classifierNode, source) {
  if (!classifierNode) return [];
  const classifierSource = rowSource(source, classifierNode);
  const problems = canonicalClassifierInputProblems(classifierNode);
  if (!classifierSource.includes(OWNER_CONTRACT_NAME.ROWS) ||
      !/SYSTEM_PARTITION_CLASS_ROWS\s*\.\s*find|for\s*\([^)]*SYSTEM_PARTITION_CLASS_ROWS/u
        .test(classifierSource)) {
    problems.push(
      'classifySystemPartition must select from SYSTEM_PARTITION_CLASS_ROWS',
    );
  }
  const rowNames = selectedRowNames(classifierNode);
  const classifierReturns = [];
  walkAst(classifierNode, (node, _parent, ancestors) => {
    if (node.type !== 'ReturnStatement') return;
    const belongsToNestedFunction = ancestors.some((ancestor) =>
      ancestor !== classifierNode && [
        'ArrowFunctionExpression',
        'FunctionDeclaration',
        'FunctionExpression',
      ].includes(ancestor.type),
    );
    if (!belongsToNestedFunction) classifierReturns.push(node);
  });
  const directReturn = classifierReturns.length === 1 &&
      classifierNode.body?.body?.includes(classifierReturns[0]) ?
    classifierReturns[0] : null;
  const outcomeObject = directReturn ?
    objectFreezeArgument(directReturn.argument) : null;
  const fields = objectPropertiesByName(outcomeObject);
  if (!outcomeObject ||
      !hasExactObjectProperties(
        outcomeObject,
        EXPECTED_CLASSIFIER_OUTCOME_FIELDS,
      ) ||
      !EXPECTED_CLASSIFIER_OUTCOME_FIELDS.every((field) => fields.has(field))) {
    problems.push(
      'classifySystemPartition must have one top-level frozen canonical return',
    );
  } else {
    problems.push(...canonicalOutcomeProblems(fields, rowNames));
  }
  return problems;
}

function evaluateOwnerContract(source) {
  const ast = parseSourceFile(source);
  const declarations = declarationByName(ast);
  const declarationCountByName = new Map();
  const exportedNames = new Set();
  let classifierNode = null;
  walkAst(ast, (node) => {
    if (node.type === NODE_TYPE.VARIABLE_DECLARATOR && node.id?.name) {
      declarationCountByName.set(
        node.id.name,
        (declarationCountByName.get(node.id.name) || 0) + 1,
      );
    }
    if (node.type === NODE_TYPE.FUNCTION_DECLARATION && node.id?.name) {
      declarationCountByName.set(
        node.id.name,
        (declarationCountByName.get(node.id.name) || 0) + 1,
      );
      if (node.id.name === OWNER_CONTRACT_NAME.CLASSIFIER) classifierNode = node;
    }
    if (node.type === NODE_TYPE.EXPORT_NAMED) {
      for (const specifier of node.specifiers || []) {
        if (specifier.exported?.name) exportedNames.add(specifier.exported.name);
      }
    }
  });
  const problems = [];
  for (const name of Object.values(OWNER_CONTRACT_NAME)) {
    if (declarationCountByName.get(name) !== 1) {
      problems.push(`${name} must have exactly one owner declaration`);
    }
    if (!exportedNames.has(name)) problems.push(`${name} must be exported`);
  }
  problems.push(...classVocabularyProblems(
    declarations.get(OWNER_CONTRACT_NAME.CLASS)?.[0],
  ));
  problems.push(...orderedRowProblems(
    declarations.get(OWNER_CONTRACT_NAME.ROWS)?.[0],
  ));
  problems.push(...classifierOutcomeProblems(classifierNode, source));
  return {passed: problems.length === 0, problems};
}

async function collectJavaScriptFiles(entryPath) {
  const stat = await fs.stat(entryPath);
  if (stat.isFile()) return entryPath.endsWith('.js') ? [entryPath] : [];
  if (!stat.isDirectory()) return [];
  const children = await fs.readdir(entryPath, {withFileTypes: true});
  const collected = [];
  for (const child of children) {
    const childPath = path.join(entryPath, child.name);
    if (child.isDirectory()) {
      collected.push(...await collectJavaScriptFiles(childPath));
    } else if (child.isFile() && childPath.endsWith('.js')) {
      collected.push(childPath);
    }
  }
  return collected;
}

async function collectCensus() {
  const files = await collectJavaScriptFiles(path.join(REPO_ROOT, SCAN_ROOT));
  const counted = [];
  let predicateEdgeCount = 0;
  let collapsedLadderEdges = 0;
  let ownerContract = {passed: false, problems: ['owner module not scanned']};
  for (const filePath of files.sort()) {
    const source = await fs.readFile(filePath, 'utf8');
    const repoPath = normalizeRepoPath(filePath);
    if (repoPath === OWNER_MODULE) {
      ownerContract = evaluateOwnerContract(source);
      continue;
    }
    const fileCensus = collectFileCensus(filePath, source);
    counted.push(...fileCensus.sites);
    predicateEdgeCount += fileCensus.predicateEdgeCount;
    collapsedLadderEdges += fileCensus.collapsedLadderEdges;
  }
  return {collapsedLadderEdges, counted, ownerContract, predicateEdgeCount};
}

function runGates() {
  return GATE_COMMANDS.map((gate) => {
    const [executable, ...args] = gate.command;
    const outcome = spawnSync(executable, args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {
      label: gate.label,
      passed: outcome.status === 0,
      exitCode: outcome.status,
    };
  });
}

function buildOraclePayload(census, gateResults, doneAt) {
  const metric = census.counted.length;
  const gatesGreen = gateResults !== null &&
    gateResults.every((gate) => gate.passed);
  const countsByKind = {};
  for (const site of census.counted) {
    countsByKind[site.kind] = (countsByKind[site.kind] || 0) + 1;
  }
  return {
    metric,
    target: doneAt,
    done: metric <= doneAt && census.ownerContract.passed && gatesGreen,
    classification: 'partition-class-single-owner-census',
    detail: {
      analyzerContractVersion: ANALYZER_CONTRACT_VERSION,
      generatedBy: 'scripts/check-partition-class-owner.js',
      ownerModule: OWNER_MODULE,
      ownerContract: census.ownerContract,
      baselineReconciliation: {
        epicDecisionSites: EPIC_CENSUS_BASELINE,
        headLegacyPredicateEdges: HEAD_BASELINE_PREDICATE_EDGES,
        headDirectCriticalSetMemberships: HEAD_BASELINE_SET_MEMBERSHIPS,
        collapsedDuplicateLadderEdges: HEAD_BASELINE_COLLAPSED_LADDER_EDGES,
        explanation:
          'The six literal critical||priority ladders each have two predicate ' +
          'call edges but one canonical decision site: 122 predicate edges + ' +
          '3 set memberships - 6 duplicate ladder edges = 119 sites.',
      },
      currentRawPredicateEdges: census.predicateEdgeCount,
      currentCollapsedLadderEdges: census.collapsedLadderEdges,
      countsByKind,
      countedSites: census.counted,
      gates: gateResults,
    },
  };
}

function readCliOption(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : null;
}

function resolveDoneAt(oracleFile, doneAtRaw) {
  const doneAt = doneAtRaw === null ? ORACLE_TARGET : Number(doneAtRaw);
  if (!Number.isInteger(doneAt) || doneAt < 0) {
    throw new Error(
      `--done-at must be a non-negative integer, got: ${doneAtRaw}`,
    );
  }
  const writesParentOracle = path.resolve(REPO_ROOT, oracleFile) ===
    path.resolve(REPO_ROOT, ORACLE_FILE);
  if (writesParentOracle && doneAt !== ORACLE_TARGET) {
    throw new Error(
      `--done-at cannot change the sealed parent target ${ORACLE_TARGET}; ` +
      'use a distinct --oracle-file for a bounded child Quest',
    );
  }
  return doneAt;
}

function resolveExitCode(payload, withGates) {
  const baseContractPassed = payload.metric <= payload.target &&
    payload.detail.ownerContract.passed;
  return baseContractPassed && (!withGates || payload.done) ?
    EXIT_CODE.SUCCESS :
    EXIT_CODE.FAILURE;
}

async function main() {
  const argv = process.argv.slice(2);
  const writeOracle = argv.includes('--oracle');
  const withGates = argv.includes('--with-gates');
  const oracleFile = readCliOption(argv, '--oracle-file') || ORACLE_FILE;
  const doneAt = resolveDoneAt(
    oracleFile,
    readCliOption(argv, '--done-at'),
  );
  const census = await collectCensus();
  const gateResults = withGates ? runGates() : null;
  const payload = buildOraclePayload(census, gateResults, doneAt);
  if (writeOracle) {
    const oraclePath = path.join(REPO_ROOT, oracleFile);
    await fs.mkdir(path.dirname(oraclePath), {recursive: true});
    await fs.writeFile(oraclePath, `${JSON.stringify(payload, null, 2)}\n`);
  }
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  return resolveExitCode(payload, withGates);
}

runGuidelineCheckWhenDirect(import.meta.url, main);

export {
  buildOraclePayload,
  collectCensus,
  collectFileSites,
  evaluateOwnerContract,
  resolveDoneAt,
  resolveExitCode,
};
