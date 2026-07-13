// Option-5 system-partition classification census. It counts production
// decisions that still consume legacy predicates or rebuilt critical sets;
// one critical || priority ladder is one site. Alias propagation covers
// imports, assignments, destructuring, computed/bound members, injection, and
// renamed sets. Metric 0 requires direct owner-outcome consumption, while the
// owner module is separately checked for its frozen vocabulary, ordered rows,
// classifier selection, and canonical frozen outcome.

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  parseSourceFile,
  runGuidelineCheckWhenDirect,
  walkAst,
} from './guideline-check-shared.js';
import {
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
} from './partition-class-owner-ast.js';
import {evaluateOwnerContract} from './partition-class-owner-contract.js';
import {runGates} from './partition-class-owner-gates.js';
import {
  collectDestructuredAliases,
  collectFunctionParameterAliases,
  resolveFunctionParameterValue,
} from './partition-class-owner-parameter-flow.js';

const REPO_ROOT = path.resolve(
  path.dirname(new globalThis.URL(import.meta.url).pathname),
  '..',
);
const SCAN_ROOT = 'src';
const OWNER_MODULE = 'src/bootstrap/system-partition-classification.js';
const ORACLE_FILE =
  'solve/oracle/partition-class-ladder-single-owner-table.json';
const ORACLE_TARGET = 0;
const ANALYZER_CONTRACT_VERSION = 3;
const EPIC_CENSUS_BASELINE = 119;
const HEAD_BASELINE_PREDICATE_EDGES = 122;
const HEAD_BASELINE_SET_MEMBERSHIPS = 3;
const HEAD_BASELINE_COLLAPSED_LADDER_EDGES = 6;
const CRITICAL_SET_EXPORT = 'CRITICAL_SYSTEM_PARTITION_IDS';
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
const EXIT_CODE = Object.freeze({SUCCESS: 0, FAILURE: 1});
function normalizeRepoPath(filePath) {
  return path.relative(REPO_ROOT, path.resolve(filePath))
    .split(path.sep)
    .join('/');
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

function addPatternAliases(
  pattern,
  legacyKindByLocalName,
  criticalSetLocalNames,
  criticalCollectionLocalNames,
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
      criticalCollectionLocalNames.add(localName);
      changed = true;
    }
  }
  return changed;
}

function addObjectAliases(
  objectName,
  initializer,
  aliasState,
  source,
  mergeOnly = false,
) {
  return applyObjectAliases({
    aliasState,
    evaluateProperty: (value) => ({
      kind: resolveLegacyValueKind(
        value,
        aliasState.legacyKindByLocalName,
        aliasState.legacyKindByAccessPath,
      ),
      criticalSet: resolvesCriticalSet(
        value,
        aliasState.criticalSetLocalNames,
      ),
      criticalCollection: isCriticalCollectionExpression(
        value,
        source,
        aliasState.criticalCollectionLocalNames,
      ) || isCriticalSetConstruction(
        value,
        source,
        aliasState.criticalCollectionLocalNames,
      ),
    }),
    initializer,
    mergeOnly,
    objectName,
  });
}

function applyDestructuredAliases(pattern, initializer, aliasState, source) {
  if (pattern?.type !== NODE_TYPE.OBJECT_PATTERN) return false;
  const destructured = collectDestructuredAliases(
    pattern,
    initializer,
    aliasState,
    resolveLegacyValueKind,
    (value) => resolvesCriticalSet(
      value,
      aliasState.criticalSetLocalNames,
    ) || isCriticalSetConstruction(
      value,
      source,
      aliasState.criticalCollectionLocalNames,
    ),
  );
  let changed = false;
  for (const [localName, kind] of destructured.kinds) {
    const targetMap = localName.includes('.') ?
      aliasState.legacyKindByAccessPath :
      aliasState.legacyKindByLocalName;
    changed = addLegacyAlias(
      targetMap,
      localName,
      kind,
    ) || changed;
  }
  for (const localName of destructured.criticalSets) {
    changed = addCriticalSetAlias(
      aliasState.criticalSetLocalNames,
      localName,
    ) || changed;
    changed = addCriticalSetAlias(
      aliasState.criticalCollectionLocalNames,
      localName,
    ) || changed;
  }
  return changed;
}

function applyVariableAliases(node, aliasState, source) {
  let changed = addPatternAliases(
    node.id,
    aliasState.legacyKindByLocalName,
    aliasState.criticalSetLocalNames,
    aliasState.criticalCollectionLocalNames,
  );
  changed = applyDestructuredAliases(
    node.id,
    node.init,
    aliasState,
    source,
  ) || changed;
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
  const isCriticalConstruction = isCriticalSetConstruction(
    node.init,
    source,
    aliasState.criticalCollectionLocalNames,
  );
  if (resolvesCriticalSet(node.init, aliasState.criticalSetLocalNames) ||
      isCriticalConstruction) {
    changed = addCriticalSetAlias(
      aliasState.criticalSetLocalNames,
      localName,
    ) || changed;
  }
  if (isCriticalCollectionExpression(
    node.init,
    source,
    aliasState.criticalCollectionLocalNames,
  ) || isCriticalConstruction) {
    changed = addCriticalSetAlias(
      aliasState.criticalCollectionLocalNames,
      localName,
    ) || changed;
  }
  if (unwrapChain(node.init)?.type !== NODE_TYPE.OBJECT) {
    changed = propagateAccessPathAliases(
      node.init,
      localName,
      aliasState.legacyKindByAccessPath,
      aliasState.criticalSetLocalNames,
    ) || changed;
    changed = propagateAccessPathAliases(
      node.init,
      localName,
      new Map(),
      aliasState.criticalCollectionLocalNames,
    ) || changed;
    changed = propagateAccessPathAliases(
      node.init,
      localName,
      new Map(),
      aliasState.objectPropertyPaths,
    ) || changed;
  }
  return addObjectAliases(localName, node.init, aliasState, source) || changed;
}

function applyAssignmentAliases(node, aliasState, source) {
  if (node.left?.type === NODE_TYPE.OBJECT_PATTERN) {
    return applyDestructuredAliases(
      node.left,
      node.right,
      aliasState,
      source,
    );
  }
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
  if (node.left?.type === NODE_TYPE.MEMBER) {
    changed = addCriticalSetAlias(
      aliasState.objectPropertyPaths,
      accessPath,
    ) || changed;
  }
  const isCriticalConstruction = isCriticalSetConstruction(
    node.right,
    source,
    aliasState.criticalCollectionLocalNames,
  );
  if (resolvesCriticalSet(node.right, aliasState.criticalSetLocalNames) ||
      isCriticalConstruction) {
    changed = addCriticalSetAlias(
      aliasState.criticalSetLocalNames,
      accessPath,
    ) || changed;
  }
  if (isCriticalCollectionExpression(
    node.right,
    source,
    aliasState.criticalCollectionLocalNames,
  ) || isCriticalConstruction) {
    changed = addCriticalSetAlias(
      aliasState.criticalCollectionLocalNames,
      accessPath,
    ) || changed;
  }
  if (unwrapChain(node.right)?.type !== NODE_TYPE.OBJECT) {
    changed = propagateAccessPathAliases(
      node.right,
      accessPath,
      aliasState.legacyKindByAccessPath,
      aliasState.criticalSetLocalNames,
    ) || changed;
    changed = propagateAccessPathAliases(
      node.right,
      accessPath,
      new Map(),
      aliasState.criticalCollectionLocalNames,
    ) || changed;
    changed = propagateAccessPathAliases(
      node.right,
      accessPath,
      new Map(),
      aliasState.objectPropertyPaths,
    ) || changed;
  }
  return addObjectAliases(
    accessPath,
    node.right,
    aliasState,
    source,
    true,
  ) || changed;
}

function collectAliasState(ast, source) {
  const legacyKindByLocalName = new Map();
  const legacyKindByAccessPath = new Map();
  const objectPropertyPaths = new Set();
  const criticalCollectionLocalNames = new Set([CRITICAL_SET_EXPORT]);
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
        criticalCollectionLocalNames.add(localName);
      }
    }
  });

  const aliasState = {
    criticalCollectionLocalNames,
    criticalSetLocalNames,
    legacyKindByAccessPath,
    legacyKindByLocalName,
    objectPropertyPaths,
  };
  const stateFingerprint = () => JSON.stringify([
    [...legacyKindByLocalName].sort(),
    [...legacyKindByAccessPath].sort(),
    [...criticalSetLocalNames].sort(),
    [...criticalCollectionLocalNames].sort(),
    [...objectPropertyPaths].sort(),
  ]);
  let changed = true;
  while (changed) {
    const beforeFingerprint = stateFingerprint();
    changed = false;
    for (const {node} of entries) {
      if (Array.isArray(node.params)) {
        for (const parameter of node.params) {
          changed = addPatternAliases(
            parameter,
            legacyKindByLocalName,
            criticalSetLocalNames,
            criticalCollectionLocalNames,
          ) || changed;
        }
      }
      if (node.type === NODE_TYPE.VARIABLE_DECLARATOR) {
        changed = applyVariableAliases(node, aliasState, source) || changed;
      }
      if (node.type === NODE_TYPE.ASSIGNMENT) {
        changed = applyAssignmentAliases(node, aliasState, source) || changed;
      }
    }
    if (stateFingerprint() === beforeFingerprint) break;
  }
  const isCriticalSetValue = (node) => resolvesCriticalSet(
    node,
    aliasState.criticalSetLocalNames,
  ) || isCriticalSetConstruction(
    node,
    source,
    aliasState.criticalCollectionLocalNames,
  );
  const parameterAliases = collectFunctionParameterAliases(
    entries,
    aliasState,
    resolveLegacyValueKind,
    isCriticalSetValue,
  );
  return {...aliasState, ...parameterAliases};
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
    criticalCollectionLocalNames,
    criticalSetsByFunction,
    criticalSetLocalNames,
    legacyKindByAccessPath,
    kindsByFunction,
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
      ) || resolveFunctionParameterValue(
        node.callee,
        ancestors,
        kindsByFunction,
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
          (resolvesCriticalSet(callee?.object, criticalSetLocalNames) ||
            resolveFunctionParameterValue(
              callee?.object,
              ancestors,
              criticalSetsByFunction,
            ))) {
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
          isCriticalSetConstruction(
            node.init,
            source,
            criticalCollectionLocalNames,
          ))) {
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
  const gateResults = withGates ? runGates(REPO_ROOT) : null;
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
