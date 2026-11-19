/**
 * Cross-partition JOIN pushdown and COORDINATOR_EVALUATED table-reference
 * planner (design coordinator-sqlite-merge §2.2, Sub-package 3c).
 *
 * Splits a JOIN query's WHERE clause into AND-connected conjuncts, pushes
 * deterministic single-table conjuncts to non-NULL-extensible table fragments,
 * derives per-edge column projections, gates the join-key `IN (?, ...)`
 * semi-filter on catalog type/collation parity and absence of explicit
 * `COLLATE` in `ON`, and assigns each table reference its own coordinator
 * main table (supporting self-joins `t a JOIN t b` as `t__a` and `t__b`).
 *
 * All residual evaluation and join execution occur in CoordinatorMergeSession
 * (SQLite). No legacy whole-WHERE fallback or JavaScript predicate evaluator
 * exists.
 *
 * @module query/distributed/join-pushdown-plan
 */

import {EXPR_TYPE, SQL_DEFAULT_COLLATION} from '../parser-constants.js';
import {PG_EXPR_TYPE} from '../pg/pg-compat-constants.js';
import {QUERY_ERROR_CODE, QUERY_JOIN_TYPE, QUERY_OPERATOR} from '../query-constants.js';
import {
  createParameterResolver,
  extractCatalogSchema,
} from './distributed-select-fanout-plan.js';
import {
  findSchemaColumn,
  isAllowlistedColumnExpr,
  isDeterministicExpression,
} from './distributed-select-fanout-soundness.js';

const ROWID_ALIASES = new Set(['rowid', '_rowid_', 'oid']);
const JOIN_ROWID_REFUSAL_MSG =
  'rowid/_rowid_/oid is not supported in multi-partition distributed queries';

const SEMI_FILTER_KIND = Object.freeze({
  KEY_IN: 'key_in',
  NONE: 'none',
});

const CONJUNCT_CLASS = Object.freeze({
  OWNED: 'owned',
  RESIDUAL: 'residual',
});

const RIGHT_NULL_EXTENDING_JOIN_TYPES = new Set([
  QUERY_JOIN_TYPE.LEFT,
  QUERY_JOIN_TYPE.LEFT_OUTER,
]);

const RIGHT_PRESERVING_JOIN_TYPES = new Set([
  QUERY_JOIN_TYPE.RIGHT,
  QUERY_JOIN_TYPE.RIGHT_OUTER,
]);

function normalizeJoinType(join) {
  return String(join?.joinType || QUERY_JOIN_TYPE.INNER).toUpperCase();
}

function registerQualifier(index, qualifier, ref) {
  if (!qualifier) return;
  const existing = index.refByQualifier.get(qualifier);
  if (existing !== undefined && existing !== ref) {
    index.ambiguousQualifiers.add(qualifier);
    index.refByQualifier.delete(qualifier);
    return;
  }
  if (!index.ambiguousQualifiers.has(qualifier)) {
    index.refByQualifier.set(qualifier, ref);
  }
}

function assignCoordinatorTableNames(mainEntry, edges) {
  const countsByTable = new Map();
  const allEntries = [mainEntry, ...edges];
  for (const entry of allEntries) {
    if (!entry.tableName) continue;
    countsByTable.set(entry.tableName, (countsByTable.get(entry.tableName) || 0) + 1);
  }
  allEntries.forEach((entry, position) => {
    if (!entry.tableName) {
      entry.coordinatorTableName = null;
      return;
    }
    const count = countsByTable.get(entry.tableName) || 1;
    if (count === 1) {
      entry.coordinatorTableName = entry.tableName;
      return;
    }
    const suffix = entry.alias || String(position);
    entry.coordinatorTableName = `${entry.tableName}__${suffix}`;
  });
}

function registerEdgeEntries(joins, index) {
  const list = Array.isArray(joins) ? joins : [];
  list.forEach((join, edgeIdx) => {
    const table = join.table || {};
    const name = table.name || null;
    const alias = table.alias || null;
    const ref = alias || name || `__join_${edgeIdx}`;
    if (!name || table.subquery) {
      index.valid = false;
    }
    registerQualifier(index, alias || name, ref);
    index.edges.push({
      ref,
      tableName: name,
      alias,
      joinType: normalizeJoinType(join),
      coordinatorTableName: name,
    });
  });
}

function registerUnambiguousBaseTableNames(allEntries, index) {
  const nameCounts = new Map();
  for (const entry of allEntries) {
    if (entry.tableName) {
      nameCounts.set(entry.tableName, (nameCounts.get(entry.tableName) || 0) + 1);
    }
  }
  for (const entry of allEntries) {
    if (entry.tableName && nameCounts.get(entry.tableName) === 1) {
      registerQualifier(index, entry.tableName, entry.ref);
    }
  }
}

function buildTableIndex(ast) {
  const from = ast.from || {};
  const mainName = from.name || null;
  const mainAlias = from.alias || null;
  const mainRef = mainAlias || mainName || null;
  const mainEntry = {
    ref: mainRef,
    tableName: mainName,
    alias: mainAlias,
    coordinatorTableName: mainName,
  };
  const index = {
    main: mainEntry,
    mainRef,
    edges: [],
    refByQualifier: new Map(),
    ambiguousQualifiers: new Set(),
    valid: Boolean(mainRef) && !from.subquery,
  };

  registerQualifier(index, mainAlias || mainName, mainRef);
  registerEdgeEntries(ast.joins, index);
  registerUnambiguousBaseTableNames([mainEntry, ...index.edges], index);

  if (index.ambiguousQualifiers.size > 0) {
    index.valid = false;
  }
  assignCoordinatorTableNames(mainEntry, index.edges);
  return index;
}

function computeNullExtensibility(index) {
  let mainNullExtensible = false;
  for (const edge of index.edges) {
    edge.nullExtensible = RIGHT_NULL_EXTENDING_JOIN_TYPES.has(edge.joinType);
    edge.preservesRightRows = RIGHT_PRESERVING_JOIN_TYPES.has(edge.joinType);
  }
  index.edges.forEach((edge, edgeIndex) => {
    if (RIGHT_PRESERVING_JOIN_TYPES.has(edge.joinType)) {
      mainNullExtensible = true;
      for (let earlier = 0; earlier < edgeIndex; earlier += 1) {
        index.edges[earlier].nullExtensible = true;
      }
    }
  });
  return mainNullExtensible;
}

function flattenAndConjuncts(node, out = []) {
  if (!node) return out;
  if (node.type === EXPR_TYPE.BINARY && node.operator === QUERY_OPERATOR.AND) {
    flattenAndConjuncts(node.left, out);
    flattenAndConjuncts(node.right, out);
    return out;
  }
  out.push(node);
  return out;
}

function collectColumnRefs(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const entry of node) collectColumnRefs(entry, visit);
    return;
  }
  if (node.type === EXPR_TYPE.COLUMN_REF) {
    visit(node);
    return;
  }
  for (const value of Object.values(node)) {
    collectColumnRefs(value, visit);
  }
}

function nodeContainsSubquery(node) {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(nodeContainsSubquery);
  if (
    node.type === PG_EXPR_TYPE.SUBQUERY ||
    node.type === PG_EXPR_TYPE.EXISTS ||
    (node.type === EXPR_TYPE.IN && Boolean(node.subquery))
  ) {
    return true;
  }
  return Object.values(node).some(nodeContainsSubquery);
}

function extractSingleConjunctOwnerRef(conjunct, index) {
  if (
    !index.valid ||
    nodeContainsSubquery(conjunct) ||
    !isDeterministicExpression(conjunct)
  ) {
    return null;
  }
  const ownerRefs = new Set();
  let unknownOwner = false;
  collectColumnRefs(conjunct, (colNode) => {
    if (colNode.table) {
      const ref = index.refByQualifier.get(colNode.table);
      if (ref === undefined) {
        unknownOwner = true;
        return;
      }
      ownerRefs.add(ref);
      return;
    }
    // Unqualified column in WHERE is attributed to the main table.
    ownerRefs.add(index.mainRef);
  });
  if (unknownOwner || ownerRefs.size > 1) {
    return null;
  }
  const [firstOwner] = ownerRefs;
  return ownerRefs.size === 0 ? index.mainRef : firstOwner;
}

function classifyConjunct(conjunct, index) {
  const ownerRef = extractSingleConjunctOwnerRef(conjunct, index);
  return ownerRef === null ?
    {kind: CONJUNCT_CLASS.RESIDUAL} :
    {kind: CONJUNCT_CLASS.OWNED, ownerRef};
}

function resolveOwnedConjunctBucket(ownerRef, index, split, mainNullExtensible) {
  if (ownerRef === index.mainRef) {
    return mainNullExtensible ? null : split.main;
  }
  const edge = index.edges.find((entry) => entry.ref === ownerRef);
  if (!edge || edge.nullExtensible) {
    return null;
  }
  return split.byEdgeRef.get(ownerRef);
}

function buildWhereSplit(ast, index, mainNullExtensible) {
  const split = {
    main: {conjuncts: []},
    byEdgeRef: new Map(
      index.edges.map((edge) => [edge.ref, {conjuncts: []}]),
    ),
    residual: [],
  };
  if (!ast.where) return split;
  for (const conjunct of flattenAndConjuncts(ast.where)) {
    const outcome = classifyConjunct(conjunct, index);
    if (outcome.kind === CONJUNCT_CLASS.RESIDUAL) {
      split.residual.push(conjunct);
      continue;
    }
    const bucket = resolveOwnedConjunctBucket(
      outcome.ownerRef,
      index,
      split,
      mainNullExtensible,
    );
    if (!bucket) {
      split.residual.push(conjunct);
      continue;
    }
    bucket.conjuncts.push(conjunct);
  }
  return split;
}

function selectListHasStar(columns) {
  return (columns || []).some(
    (col) =>
      col.type === EXPR_TYPE.STAR ||
      col.expression?.type === EXPR_TYPE.STAR,
  );
}

function buildEdgeProjections(ast, index) {
  const clauses = [
    ast.columns,
    ast.where,
    ast.groupBy,
    ast.having,
    ast.orderBy,
    (ast.joins || []).map((join) => join.condition),
  ];
  let provable = index.valid && !selectListHasStar(ast.columns);
  const columnsByRef = new Map(
    index.edges.map((edge) => [edge.ref, new Set()]),
  );
  for (const clause of clauses) {
    collectColumnRefs(clause, (node) => {
      const ref = node.table ?
        index.refByQualifier.get(node.table) :
        undefined;
      if (ref === undefined) {
        provable = false;
        return;
      }
      columnsByRef.get(ref)?.add(node.column);
    });
  }
  for (const edge of index.edges) {
    const columns = columnsByRef.get(edge.ref);
    edge.projection =
      provable && columns.size > 0 ? [...columns].sort() : null;
  }
}

function holdsExplicitCollate(node) {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(holdsExplicitCollate);
  if (node.type === EXPR_TYPE.COLLATE) return true;
  return Object.values(node).some(holdsExplicitCollate);
}

function resolveConditionSideRef(node, index) {
  if (!node?.table) return null;
  return index.refByQualifier.get(node.table) ?? null;
}

function isEquiJoinCondition(condition) {
  return Boolean(condition) &&
    condition.type === EXPR_TYPE.BINARY &&
    condition.operator === QUERY_OPERATOR.EQUALS &&
    condition.left?.type === EXPR_TYPE.COLUMN_REF &&
    condition.right?.type === EXPR_TYPE.COLUMN_REF;
}

function resolveTableNameByRef(ref, index) {
  if (ref === index.mainRef) return index.main.tableName;
  const edge = index.edges.find((e) => e.ref === ref);
  return edge?.tableName || null;
}

function normalizeColumnSignature(colDef) {
  if (!colDef || typeof colDef !== 'object') return null;
  const rawType = typeof colDef.type === 'string' ?
    colDef.type :
    (typeof colDef.dataType === 'string' ? colDef.dataType : '');
  const rawCollation = typeof colDef.collation === 'string' && colDef.collation.length > 0 ?
    colDef.collation :
    SQL_DEFAULT_COLLATION;
  return `${rawType.toUpperCase()}:${rawCollation.toUpperCase()}`;
}

function columnsShareEqualTypeAndCollation(
  leftTableName,
  leftColName,
  rightTableName,
  rightColName,
  resolveTableSchema,
) {
  if (!resolveTableSchema) return true;
  const leftSchema = extractCatalogSchema(resolveTableSchema(leftTableName));
  const rightSchema = extractCatalogSchema(resolveTableSchema(rightTableName));
  if (!leftSchema && !rightSchema) return true;
  if (!leftSchema || !rightSchema) return false;
  const leftSig = normalizeColumnSignature(findSchemaColumn(leftSchema, leftColName));
  const rightSig = normalizeColumnSignature(findSchemaColumn(rightSchema, rightColName));
  return leftSig !== null && leftSig === rightSig;
}

function buildEdgeSemiFilter(join, edge, index, resolveTableSchema) {
  const none = {kind: SEMI_FILTER_KIND.NONE};
  if (!index.valid || edge.joinType !== QUERY_JOIN_TYPE.INNER) {
    return none;
  }
  const condition = join.condition;
  if (!isEquiJoinCondition(condition) || holdsExplicitCollate(condition)) {
    return none;
  }
  const leftIsEdge = resolveConditionSideRef(condition.left, index) === edge.ref;
  const rightIsEdge = resolveConditionSideRef(condition.right, index) === edge.ref;
  if (leftIsEdge === rightIsEdge) {
    return none;
  }
  const edgeSide = leftIsEdge ? condition.left : condition.right;
  const otherSide = leftIsEdge ? condition.right : condition.left;
  const otherRef = resolveConditionSideRef(otherSide, index);
  if (otherRef !== index.mainRef) {
    return none;
  }
  const otherTableName = resolveTableNameByRef(otherRef, index);
  if (!columnsShareEqualTypeAndCollation(
    otherTableName,
    otherSide.column,
    edge.tableName,
    edgeSide.column,
    resolveTableSchema,
  )) {
    return none;
  }
  return {
    kind: SEMI_FILTER_KIND.KEY_IN,
    joinKeyColumn: edgeSide.column,
    leftKeyCandidates: [
      `${otherRef}.${otherSide.column}`,
      otherSide.column,
    ],
  };
}

function lookupRowValue(row, candidates) {
  for (const key of candidates) {
    if (Object.hasOwn(row, key)) {
      return row[key];
    }
  }
  return undefined;
}

function collectDistinctJoinKeyValues(rows, semiFilter, maxValues) {
  const values = new Set();
  for (const row of rows) {
    const value = lookupRowValue(row, semiFilter.leftKeyCandidates);
    if (value === null || value === undefined) {
      continue;
    }
    values.add(value);
    if (values.size > maxValues) {
      return {overLimit: true, values: []};
    }
  }
  return {overLimit: false, values: [...values]};
}

function buildJoinKeyInFilter(semiFilter, valueCount) {
  return {
    type: EXPR_TYPE.IN,
    expression: {
      type: EXPR_TYPE.COLUMN_REF,
      table: null,
      column: semiFilter.joinKeyColumn,
    },
    values: Array.from({length: valueCount}, () => ({
      type: EXPR_TYPE.PARAMETER,
    })),
    negated: false,
  };
}

function andCombineConjuncts(conjuncts) {
  if (!Array.isArray(conjuncts) || conjuncts.length === 0) {
    return null;
  }
  return conjuncts.reduce((left, right) => ({
    type: EXPR_TYPE.BINARY,
    operator: QUERY_OPERATOR.AND,
    left,
    right,
  }));
}

function canonicalizeQualifiers(conjunct, index) {
  const clone = structuredClone(conjunct);
  collectColumnRefs(clone, (node) => {
    if (node.table) {
      node.table = index.refByQualifier.get(node.table) ?? node.table;
    }
  });
  return clone;
}

function collectOrderedParameterValues(expr, resolveParam) {
  const values = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node.type === EXPR_TYPE.PARAMETER) {
      values.push(resolveParam(node));
      return;
    }
    for (const val of Object.values(node)) {
      walk(val);
    }
  };
  walk(expr);
  return values;
}

function hasAggregatesOrGroupOrHaving(ast) {
  if (Array.isArray(ast?.groupBy) && ast.groupBy.length > 0) return true;
  if (ast?.having) return true;
  let found = false;
  const walk = (node) => {
    if (found || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node.type === EXPR_TYPE.AGGREGATE) {
      found = true;
      return;
    }
    for (const val of Object.values(node)) walk(val);
  };
  walk(ast?.columns);
  walk(ast?.orderBy);
  return found;
}

function isDistinctJoinColumnAllowlisted(col, index, resolveTableSchema) {
  if (col?.type === EXPR_TYPE.STAR) return false;
  const expr = col?.expression;
  if (expr?.type !== EXPR_TYPE.COLUMN_REF) return false;
  const ref = expr.table ? index.refByQualifier.get(expr.table) : index.mainRef;
  const tableName = resolveTableNameByRef(ref, index);
  const schema = tableName ? extractCatalogSchema(resolveTableSchema(tableName)) : null;
  return Boolean(schema) && isAllowlistedColumnExpr(expr, schema);
}

function isJoinOrderIndependent(ast, index, resolveTableSchema) {
  if (hasAggregatesOrGroupOrHaving(ast)) return false;
  if (ast.setOperation || (Array.isArray(ast.ctes) && ast.ctes.length > 0)) {
    return false;
  }
  if (!ast.distinct) return true;
  if (!resolveTableSchema) return false;
  const columns = Array.isArray(ast.columns) ? ast.columns : [];
  return columns.every((col) =>
    isDistinctJoinColumnAllowlisted(col, index, resolveTableSchema));
}

function assertJoinRowidAdmissible(ast, index, resolveTableSchema) {
  const allTableNames = [
    index.main.tableName,
    ...index.edges.map((e) => e.tableName),
  ].filter(Boolean);

  collectColumnRefs(ast, (node) => {
    const colLower = String(node.column || '').toLowerCase();
    if (!ROWID_ALIASES.has(colLower)) return;
    if (resolveTableSchema) {
      if (node.table) {
        const ref = index.refByQualifier.get(node.table);
        const tableName = resolveTableNameByRef(ref, index);
        const schema = tableName ? extractCatalogSchema(resolveTableSchema(tableName)) : null;
        if (findSchemaColumn(schema, node.column)) return;
      } else {
        const shadowed = allTableNames.some((tName) => {
          const schema = extractCatalogSchema(resolveTableSchema(tName));
          return Boolean(findSchemaColumn(schema, node.column));
        });
        if (shadowed) return;
      }
    }
    const error = new Error(JOIN_ROWID_REFUSAL_MSG);
    error.code = QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE;
    error.errorCode = QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE;
    throw error;
  });
}

function buildCoordinatorJoinAst(ast, index, split, orderIndependent) {
  const mainAlias = index.main.alias ||
    (index.main.coordinatorTableName !== index.main.tableName ? index.main.tableName : null);
  const rewrittenFrom = {
    ...ast.from,
    name: index.main.coordinatorTableName,
    alias: mainAlias,
  };
  const rewrittenJoins = (ast.joins || []).map((join, edgeIdx) => {
    const edge = index.edges[edgeIdx];
    const edgeAlias = edge.alias ||
      (edge.coordinatorTableName !== edge.tableName ? edge.tableName : null);
    return {
      ...join,
      table: {
        ...join.table,
        name: edge.coordinatorTableName,
        alias: edgeAlias,
      },
    };
  });
  return {
    ...ast,
    from: rewrittenFrom,
    joins: rewrittenJoins,
    where: orderIndependent ? andCombineConjuncts(split.residual) : ast.where,
  };
}

/**
 * Build the cross-partition JOIN pushdown and COORDINATOR_EVALUATED execution
 * plan.
 * @param {Object} ast - Parsed SELECT AST with joins.
 * @param {Array<*>} [params=[]] - Original positional parameters.
 * @param {Object} [options={}]
 * @param {Function|null} [options.resolveTableSchema] - Catalog schema resolver.
 * @return {Object} Join pushdown plan.
 */
function buildJoinPushdownPlan(ast, params = [], options = {}) {
  const resolveParam = createParameterResolver(params);
  const resolveTableSchema = options?.resolveTableSchema || null;
  const index = buildTableIndex(ast);
  assertJoinRowidAdmissible(ast, index, resolveTableSchema);
  const mainNullExtensible = computeNullExtensibility(index);
  buildEdgeProjections(ast, index);
  (ast.joins || []).forEach((join, edgeIndex) => {
    index.edges[edgeIndex].semiFilter = buildEdgeSemiFilter(
      join,
      index.edges[edgeIndex],
      index,
      resolveTableSchema,
    );
  });
  const split = buildWhereSplit(ast, index, mainNullExtensible);
  const mainWhere = andCombineConjuncts(
    split.main.conjuncts.map((conjunct) => canonicalizeQualifiers(conjunct, index)),
  );
  const orderIndependent = isJoinOrderIndependent(ast, index, resolveTableSchema);
  const coordinatorAst = buildCoordinatorJoinAst(ast, index, split, orderIndependent);

  return {
    orderIndependent,
    coordinatorAst,
    main: {
      tableName: index.main.tableName,
      alias: index.main.alias,
      ref: index.main.ref,
      coordinatorTableName: index.main.coordinatorTableName,
      where: mainWhere,
      params: collectOrderedParameterValues(mainWhere, resolveParam),
    },
    joins: index.edges.map((edge) => {
      const bucket = split.byEdgeRef.get(edge.ref);
      const edgeWhere = andCombineConjuncts(
        (bucket?.conjuncts || []).map((conjunct) =>
          canonicalizeQualifiers(conjunct, index),
        ),
      );
      return {
        tableName: edge.tableName,
        alias: edge.alias,
        ref: edge.ref,
        coordinatorTableName: edge.coordinatorTableName,
        joinType: edge.joinType,
        preservesRightRows: edge.preservesRightRows,
        projection: edge.projection,
        semiFilter: edge.semiFilter,
        where: edgeWhere,
        params: collectOrderedParameterValues(edgeWhere, resolveParam),
      };
    }),
  };
}

export {
  SEMI_FILTER_KIND,
  andCombineConjuncts,
  buildJoinKeyInFilter,
  buildJoinPushdownPlan,
  collectDistinctJoinKeyValues,
};
