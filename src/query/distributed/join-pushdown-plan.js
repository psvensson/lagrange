import {EXPR_TYPE} from '../parser-constants.js';
import {QUERY_JOIN_TYPE, QUERY_OPERATOR} from '../query-constants.js';

/**
 * Cross-partition JOIN pushdown planning. Splits a JOIN query's WHERE
 * into AND-connected conjuncts classified by owning table (single-table
 * conjuncts run inside the per-partition SQL), derives the
 * per-join-table column projection, and plans the join-key semi-filter.
 * Pure planning: no I/O; the executor renders the returned ASTs.
 *
 * Attribution rule: an unqualified column ref is attributed to the main
 * (FROM) table and pushed into the main table's partition SQL — exactly
 * where the legacy path sent the whole WHERE — so a misattributed
 * join-table column surfaces as the same partition-side unknown-column
 * error as before, never as a silently wrong result.
 *
 * OUTER-join rule: SQL applies WHERE after the join, so a conjunct
 * owned by a table whose rows can be NULL-extended by any join in the
 * chain (the right side of a LEFT join; the accumulated left side of a
 * RIGHT join) is never pushed below the join — it stays coordinator-side
 * and runs after the join, preserving WHERE semantics exactly.
 */

/** Plan kinds: genuinely split WHERE vs legacy whole-WHERE-on-main. */
const JOIN_PUSHDOWN_PLAN_KIND = {SPLIT: 'split', LEGACY_WHERE: 'legacy_where'};

/** Semi-filter variants for one join edge. */
const SEMI_FILTER_KIND = {KEY_IN: 'key_in', NONE: 'none'};

/** Conjunct classification outcomes (single canonical decision). */
const CONJUNCT_CLASS = {
  OWNED: 'owned',
  RESIDUAL: 'residual',
  UNSUPPORTED: 'unsupported',
};

/**
 * Parser-emitted operator names QUERY_OPERATOR does not carry.
 */
const EXTENDED_OPERATOR = {
  OR: 'OR',
  IS_NULL: 'IS NULL',
  IS_NOT_NULL: 'IS NOT NULL',
  NOT: 'NOT',
  PLUS: '+',
  MINUS: '-',
};

/**
 * Binary operators supported by BOTH partition-side SQL rendering and
 * the coordinator evaluator (QueryExecutor#evaluateBinary); anything
 * else forces the legacy whole-WHERE path.
 */
const SUPPORTED_BINARY_OPERATORS = new Set([
  QUERY_OPERATOR.AND,
  EXTENDED_OPERATOR.OR,
  QUERY_OPERATOR.EQUALS,
  QUERY_OPERATOR.NOT_EQUALS,
  QUERY_OPERATOR.NOT_EQUALS_ALT,
  QUERY_OPERATOR.LESS_THAN,
  QUERY_OPERATOR.LESS_THAN_OR_EQUAL,
  QUERY_OPERATOR.GREATER_THAN,
  QUERY_OPERATOR.GREATER_THAN_OR_EQUAL,
  EXTENDED_OPERATOR.IS_NULL,
  EXTENDED_OPERATOR.IS_NOT_NULL,
]);

/** Unary operators supported by both rendering and evaluation. */
const SUPPORTED_UNARY_OPERATORS = new Set([
  EXTENDED_OPERATOR.NOT,
  EXTENDED_OPERATOR.PLUS,
  EXTENDED_OPERATOR.MINUS,
]);

/** JOIN types that NULL-extend their right side. */
const RIGHT_NULL_EXTENDING_JOIN_TYPES = new Set([
  QUERY_JOIN_TYPE.LEFT,
  QUERY_JOIN_TYPE.LEFT_OUTER,
]);

/** JOIN types that preserve unmatched right rows. */
const RIGHT_PRESERVING_JOIN_TYPES = new Set([
  QUERY_JOIN_TYPE.RIGHT,
  QUERY_JOIN_TYPE.RIGHT_OUTER,
]);

/**
 * Normalize a join's type to the canonical uppercase QUERY_JOIN_TYPE.
 * @param {Object} join - JOIN AST node.
 * @return {string} Normalized join type.
 */
function normalizeJoinType(join) {
  return (join.joinType || QUERY_JOIN_TYPE.INNER).toUpperCase();
}

/**
 * Register a table qualifier; a qualifier already registered for a
 * different ref makes the index ambiguous (invalid).
 * @param {Object} index - Table index (mutated).
 * @param {string|null} qualifier - Table name or alias.
 * @param {string|null} ref - Canonical table ref.
 */
function registerQualifier(index, qualifier, ref) {
  if (!qualifier) {
    return;
  }
  const existing = index.refByQualifier.get(qualifier);
  if (existing !== undefined && existing !== ref) {
    index.valid = false;
    return;
  }
  index.refByQualifier.set(qualifier, ref);
}

/**
 * Register one join edge in the table index.
 * @param {Object} index - Table index (mutated).
 * @param {Object} join - JOIN AST node.
 */
function registerJoinEdge(index, join) {
  const table = join.table || {};
  const name = table.name || null;
  const alias = table.alias || null;
  const ref = alias || name;
  if (!name || table.subquery) {
    index.valid = false;
  }
  registerQualifier(index, name, ref);
  registerQualifier(index, alias, ref);
  index.edges.push({
    ref,
    tableName: name,
    alias,
    joinType: normalizeJoinType(join),
  });
}

/**
 * Build the table index: canonical refs (alias || name) for the main
 * table and every join edge, plus a qualifier -> ref map. The index is
 * invalid (forcing the legacy WHERE path and disabling projection and
 * semi-filter planning) when a table is unnamed, a subquery, or a
 * qualifier is ambiguous (e.g. self-join without distinct aliases).
 * @param {Object} ast - SELECT AST with joins.
 * @return {Object} Table index.
 */
function buildTableIndex(ast) {
  const from = ast.from || {};
  const mainRef = from.alias || from.name || null;
  const index = {
    mainRef,
    edges: [],
    refByQualifier: new Map(),
    valid: Boolean(mainRef) && !from.subquery,
  };
  registerQualifier(index, from.name, mainRef);
  registerQualifier(index, from.alias, mainRef);
  for (const join of ast.joins || []) {
    registerJoinEdge(index, join);
  }
  return index;
}

/**
 * Compute which tables the join chain can NULL-extend: the right side
 * of a LEFT join, plus the main table and every earlier join table
 * when any RIGHT join appears (it NULL-extends the accumulated left).
 * @param {Object} index - Table index (edges mutated in place).
 * @return {boolean} Whether the main table is NULL-extensible.
 */
function computeNullExtensibility(index) {
  let mainNullExtensible = false;
  for (const edge of index.edges) {
    edge.nullExtensible = RIGHT_NULL_EXTENDING_JOIN_TYPES.has(edge.joinType);
    edge.preservesRightRows = RIGHT_PRESERVING_JOIN_TYPES.has(edge.joinType);
  }
  index.edges.forEach((edge, edgeIndex) => {
    if (RIGHT_PRESERVING_JOIN_TYPES.has(edge.joinType)) {
      mainNullExtensible = true;
      for (let earlier = 0; earlier < edgeIndex; earlier++) {
        index.edges[earlier].nullExtensible = true;
      }
    }
  });
  return mainNullExtensible;
}

/**
 * Flatten a WHERE tree into its AND-connected conjuncts.
 * @param {Object} node - WHERE AST node.
 * @param {Object[]} out - Accumulator.
 * @return {Object[]} Conjuncts in render order.
 */
function flattenAndConjuncts(node, out = []) {
  if (node.type === EXPR_TYPE.BINARY &&
    node.operator === QUERY_OPERATOR.AND) {
    flattenAndConjuncts(node.left, out);
    flattenAndConjuncts(node.right, out);
    return out;
  }
  out.push(node);
  return out;
}

/**
 * Per-node-type conjunct analyzers recording column-ref ownership and
 * parameter ordinals into the shared state; an unknown node type has
 * no analyzer and marks the conjunct unsupported.
 */
const CONJUNCT_NODE_ANALYZERS = {
  [EXPR_TYPE.LITERAL]: () => {},
  [EXPR_TYPE.PARAMETER]: (node, index, state) => {
    if (!Number.isInteger(node.index)) {
      state.supported = false;
      return;
    }
    state.paramIndexes.push(node.index);
  },
  [EXPR_TYPE.COLUMN_REF]: (node, index, state) => {
    if (node.table) {
      const ref = index.refByQualifier.get(node.table);
      if (ref === undefined) {
        state.unknownOwner = true;
        return;
      }
      state.ownerRefs.add(ref);
      return;
    }
    // Unqualified column: attributed to the main table (module doc).
    state.ownerRefs.add(index.mainRef);
  },
  [EXPR_TYPE.BINARY]: (node, index, state) => {
    if (!SUPPORTED_BINARY_OPERATORS.has(node.operator)) {
      state.supported = false;
      return;
    }
    analyzeConjunctNode(node.left, index, state);
    analyzeConjunctNode(node.right, index, state);
  },
  [EXPR_TYPE.UNARY]: (node, index, state) => {
    if (!SUPPORTED_UNARY_OPERATORS.has(node.operator)) {
      state.supported = false;
      return;
    }
    analyzeConjunctNode(node.operand, index, state);
  },
  [EXPR_TYPE.IN]: (node, index, state) => {
    if (!Array.isArray(node.values)) {
      // IN (SELECT ...) has a subquery instead of a value list — the
      // renderer and evaluator cannot handle it; force the legacy path.
      state.supported = false;
      return;
    }
    analyzeConjunctNode(node.expression, index, state);
    for (const value of node.values) {
      analyzeConjunctNode(value, index, state);
    }
  },
  [EXPR_TYPE.BETWEEN]: (node, index, state) => {
    analyzeConjunctNode(node.expression, index, state);
    analyzeConjunctNode(node.low, index, state);
    analyzeConjunctNode(node.high, index, state);
  },
  [EXPR_TYPE.LIKE]: (node, index, state) => {
    analyzeConjunctNode(node.expression, index, state);
    analyzeConjunctNode(node.pattern, index, state);
  },
};

/**
 * Analyze one conjunct AST node into the shared classification state.
 * @param {Object} node - Expression AST node.
 * @param {Object} index - Table index.
 * @param {Object} state - Mutable classification state.
 */
function analyzeConjunctNode(node, index, state) {
  const analyzer = node && typeof node === 'object' ?
    CONJUNCT_NODE_ANALYZERS[node.type] :
    undefined;
  if (!analyzer) {
    state.supported = false;
    return;
  }
  analyzer(node, index, state);
}

/**
 * Classify one conjunct: owned by a single table (no column refs at
 * all counts as main-table), residual (cross-table/unknown ownership;
 * evaluated coordinator-side after the join), or unsupported (forces
 * the legacy whole-WHERE path).
 * @param {Object} conjunct - Conjunct AST.
 * @param {Object} index - Table index.
 * @return {Object} {kind, ownerRef, paramIndexes}.
 */
function classifyConjunct(conjunct, index) {
  const state = {
    supported: true,
    ownerRefs: new Set(),
    unknownOwner: false,
    paramIndexes: [],
  };
  analyzeConjunctNode(conjunct, index, state);
  const kind = !state.supported ? CONJUNCT_CLASS.UNSUPPORTED :
    state.unknownOwner || state.ownerRefs.size > 1 ?
      CONJUNCT_CLASS.RESIDUAL : CONJUNCT_CLASS.OWNED;
  const [firstOwner] = state.ownerRefs;
  const ownerRef = state.ownerRefs.size === 0 ? index.mainRef : firstOwner;
  return {
    kind,
    ...(kind === CONJUNCT_CLASS.OWNED ? {ownerRef} : {}),
    paramIndexes: kind === CONJUNCT_CLASS.UNSUPPORTED ?
      [] : state.paramIndexes,
  };
}

/**
 * Resolve the pushdown bucket for a single-table conjunct, or null
 * when the owning table is NULL-extensible (OUTER rule: residual).
 * @param {string} ownerRef - Owning table ref.
 * @param {Object} index - Table index.
 * @param {Object} split - Split buckets under construction.
 * @param {boolean} mainNullExtensible - Main-table NULL-extensibility.
 * @return {Object|null} Target bucket, or null for residual.
 */
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

/**
 * Split the WHERE clause into main-table, per-edge, and residual
 * buckets.
 * @param {Object} ast - SELECT AST.
 * @param {Object} index - Table index.
 * @param {boolean} mainNullExtensible - Main-table NULL-extensibility.
 * @return {Object} Split buckets, or {legacy: true} when unsupported.
 */
function buildWhereSplit(ast, index, mainNullExtensible) {
  const split = {
    legacy: false,
    main: {conjuncts: [], paramIndexes: []},
    byEdgeRef: new Map(
      index.edges.map((edge) => [
        edge.ref,
        {conjuncts: [], paramIndexes: []},
      ]),
    ),
    residual: [],
  };
  if (!ast.where) {
    return split;
  }
  for (const conjunct of flattenAndConjuncts(ast.where)) {
    const outcome = classifyConjunct(conjunct, index);
    if (outcome.kind === CONJUNCT_CLASS.UNSUPPORTED) {
      split.legacy = true;
      return split;
    }
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
    bucket.paramIndexes.push(...outcome.paramIndexes);
  }
  return split;
}

/**
 * Visit every column_ref reachable from a clause (generic deep walk).
 * @param {Object|Array} node - Clause AST.
 * @param {Function} visit - Called with each column_ref node.
 */
function collectColumnRefs(node, visit) {
  if (!node || typeof node !== 'object') {
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((entry) => collectColumnRefs(entry, visit));
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

/**
 * Whether the SELECT list contains a star column.
 * @param {Array} columns - SELECT column entries.
 * @return {boolean} Star present.
 */
function selectListHasStar(columns) {
  return (columns || []).some(
    (col) =>
      col.type === EXPR_TYPE.STAR ||
      col.expression?.type === EXPR_TYPE.STAR,
  );
}

/**
 * Derive the per-edge column projection. Provable only when the SELECT
 * list has no star AND every column ref in the statement carries a
 * resolvable table qualifier — otherwise a join table falls back to
 * SELECT * because an unqualified ref might belong to it.
 * @param {Object} ast - SELECT AST.
 * @param {Object} index - Table index (edges mutated: projection).
 */
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

/**
 * Resolve a join-condition side's owning table ref via its qualifier.
 * @param {Object} node - column_ref node.
 * @param {Object} index - Table index.
 * @return {string|null} Owning ref, or null when unresolvable.
 */
function resolveConditionSideRef(node, index) {
  if (!node.table) {
    return null;
  }
  return index.refByQualifier.get(node.table) ?? null;
}

/**
 * Whether a join condition is an equality between two column refs.
 * @param {Object} condition - JOIN condition AST.
 * @return {boolean} Equi-join condition shape.
 */
function isEquiJoinCondition(condition) {
  return Boolean(condition) &&
    condition.type === EXPR_TYPE.BINARY &&
    condition.operator === QUERY_OPERATOR.EQUALS &&
    condition.left?.type === EXPR_TYPE.COLUMN_REF &&
    condition.right?.type === EXPR_TYPE.COLUMN_REF;
}

/**
 * Plan the join-key semi-filter for one edge. INNER equi-joins only:
 * a filtered-empty right fetch would change a LEFT join's NULL-extended
 * row shape, and RIGHT joins must preserve unmatched right rows.
 * @param {Object} join - JOIN AST node.
 * @param {Object} edge - Edge entry from the table index.
 * @param {Object} index - Table index.
 * @return {Object} Semi-filter descriptor ({kind} variant).
 */
function buildEdgeSemiFilter(join, edge, index) {
  const none = {kind: SEMI_FILTER_KIND.NONE};
  if (!index.valid || edge.joinType !== QUERY_JOIN_TYPE.INNER) {
    return none;
  }
  const condition = join.condition;
  if (!isEquiJoinCondition(condition)) {
    return none;
  }
  const leftIsEdge =
    resolveConditionSideRef(condition.left, index) === edge.ref;
  const rightIsEdge =
    resolveConditionSideRef(condition.right, index) === edge.ref;
  if (leftIsEdge === rightIsEdge) {
    return none;
  }
  const edgeSide = leftIsEdge ? condition.left : condition.right;
  const otherSide = leftIsEdge ? condition.right : condition.left;
  const otherRef = resolveConditionSideRef(otherSide, index);
  const leftKeyCandidates = [];
  if (otherRef) {
    // Joined rows expose collided columns under their qualified key.
    leftKeyCandidates.push(`${otherRef}.${otherSide.column}`);
  }
  leftKeyCandidates.push(otherSide.column);
  return {
    kind: SEMI_FILTER_KIND.KEY_IN,
    joinKeyColumn: edgeSide.column,
    leftKeyCandidates,
  };
}

/**
 * Look up a row value trying candidate keys in priority order.
 * @param {Object} row - Row object.
 * @param {string[]} candidates - Row keys to try.
 * @return {*} Found value, or undefined.
 */
function lookupRowValue(row, candidates) {
  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      return row[key];
    }
  }
  return undefined;
}

/**
 * Collect the distinct main-side join-key values for a semi-filter.
 * NULL keys are dropped: an equi-join never matches NULL.
 * @param {Object[]} rows - Current left-side rows.
 * @param {Object} semiFilter - KEY_IN semi-filter descriptor.
 * @param {number} maxValues - Inclusive distinct-value cap.
 * @return {{overLimit: boolean, values: Array}} Distinct key set.
 */
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

/**
 * Build the `joinKey IN (?, ..., ?)` filter AST for a semi-filter; the
 * key values are bound as parameters, never interpolated.
 * @param {Object} semiFilter - KEY_IN semi-filter descriptor.
 * @param {number} valueCount - Number of bound key values.
 * @return {Object} IN expression AST.
 */
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

/**
 * AND-combine conjuncts into one left-associated expression tree that
 * renders the conjuncts in their original order.
 * @param {Object[]} conjuncts - Conjunct ASTs.
 * @return {Object|null} Combined AST, or null for an empty list.
 */
function andCombineConjuncts(conjuncts) {
  if (conjuncts.length === 0) {
    return null;
  }
  return conjuncts.reduce((left, right) => ({
    type: EXPR_TYPE.BINARY,
    operator: QUERY_OPERATOR.AND,
    left,
    right,
  }));
}

/**
 * Clone a conjunct with every column qualifier rewritten to the
 * canonical table ref (alias || name) so rendered SQL matches the
 * per-table fetch's aliased FROM clause.
 * @param {Object} conjunct - Conjunct AST.
 * @param {Object} index - Table index.
 * @return {Object} Canonicalized clone.
 */
function canonicalizeQualifiers(conjunct, index) {
  const clone = structuredClone(conjunct);
  collectColumnRefs(clone, (node) => {
    if (node.table) {
      node.table = index.refByQualifier.get(node.table) ?? node.table;
    }
  });
  return clone;
}

/**
 * Replace parameter placeholders inside a residual clone with literal
 * nodes carrying the bound value (the partition SQL consumed only its
 * own parameters).
 * @param {Object} node - Residual conjunct clone (mutated in place).
 * @param {Array} params - Original positional parameters.
 */
function substituteResidualParameterLiterals(node, params) {
  if (!node || typeof node !== 'object') {
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (Array.isArray(value)) {
      value.forEach((entry, entryIndex) => {
        if (entry?.type === EXPR_TYPE.PARAMETER) {
          value[entryIndex] = {
            type: EXPR_TYPE.LITERAL,
            value: params[entry.index],
          };
        } else {
          substituteResidualParameterLiterals(entry, params);
        }
      });
      continue;
    }
    if (value && typeof value === 'object') {
      if (value.type === EXPR_TYPE.PARAMETER) {
        node[key] = {
          type: EXPR_TYPE.LITERAL,
          value: params[value.index],
        };
        continue;
      }
      substituteResidualParameterLiterals(value, params);
    }
  }
}

/**
 * Prepare a residual conjunct for coordinator-side evaluation:
 * canonicalize qualifiers and bind parameter literals.
 * @param {Object} conjunct - Residual conjunct AST.
 * @param {Array} params - Original positional parameters.
 * @param {Object} index - Table index.
 * @return {Object} Evaluation-ready clone.
 */
function prepareResidualConjunct(conjunct, params, index) {
  const clone = canonicalizeQualifiers(conjunct, index);
  substituteResidualParameterLiterals(clone, params);
  return clone;
}

/**
 * Resolve a residual conjunct's column refs against the joined-row key
 * format (combineJoinRows): collided columns live under the qualified
 * `ref.column` key, unique columns under their plain name.
 * @param {Object} conjunct - Prepared residual conjunct.
 * @param {Object} sampleRow - Representative joined row.
 * @return {Object} Clone whose column refs name actual row keys.
 */
function resolveResidualConjunctForRow(conjunct, sampleRow) {
  const clone = structuredClone(conjunct);
  collectColumnRefs(clone, (node) => {
    if (!node.table) {
      return;
    }
    const qualifiedKey = `${node.table}.${node.column}`;
    if (Object.prototype.hasOwnProperty.call(sampleRow, qualifiedKey)) {
      node.column = qualifiedKey;
    }
    node.table = null;
  });
  return clone;
}

/**
 * Shape one edge's plan entry from the indexed edge state.
 * @param {Object} edge - Edge entry from the table index.
 * @param {Object|null} where - Pushed WHERE AST for the edge.
 * @param {Array} params - Bound parameters for the pushed WHERE.
 * @return {Object} Edge plan entry.
 */
function buildEdgePlanEntry(edge, where, params) {
  return {
    tableName: edge.tableName,
    alias: edge.alias,
    ref: edge.ref,
    joinType: edge.joinType,
    preservesRightRows: edge.preservesRightRows,
    projection: edge.projection,
    semiFilter: edge.semiFilter,
    where,
    params,
  };
}

/**
 * Build the legacy-shaped plan: the whole WHERE and params array go to
 * the main-table fetch exactly as the pre-pushdown path did; projection
 * and semi-filter planning still apply where provable.
 * @param {Object} ast - SELECT AST.
 * @param {Array} params - Original positional parameters.
 * @param {Object} index - Table index.
 * @return {Object} Legacy plan.
 */
function buildLegacyPlan(ast, params, index) {
  return {
    kind: JOIN_PUSHDOWN_PLAN_KIND.LEGACY_WHERE,
    main: {where: ast.where || null, params},
    joins: index.edges.map((edge) => buildEdgePlanEntry(edge, null, [])),
    residualConjuncts: [],
  };
}

/**
 * Build the cross-partition JOIN pushdown plan: per-table WHERE
 * conjuncts with bound parameters, per-join-table projections, join-key
 * semi-filter descriptors, and coordinator-side residual conjuncts.
 * @param {Object} ast - Parsed SELECT AST with joins (not mutated).
 * @param {Array} params - Original positional parameters.
 * @return {Object} Pushdown plan.
 */
function buildJoinPushdownPlan(ast, params = []) {
  const index = buildTableIndex(ast);
  const mainNullExtensible = computeNullExtensibility(index);
  buildEdgeProjections(ast, index);
  (ast.joins || []).forEach((join, edgeIndex) => {
    index.edges[edgeIndex].semiFilter = buildEdgeSemiFilter(
      join,
      index.edges[edgeIndex],
      index,
    );
  });
  if (!index.valid) {
    return buildLegacyPlan(ast, params, index);
  }
  const split = buildWhereSplit(ast, index, mainNullExtensible);
  if (split.legacy) {
    return buildLegacyPlan(ast, params, index);
  }
  return {
    kind: JOIN_PUSHDOWN_PLAN_KIND.SPLIT,
    main: {
      where: andCombineConjuncts(
        split.main.conjuncts.map((conjunct) =>
          canonicalizeQualifiers(conjunct, index),
        ),
      ),
      params: split.main.paramIndexes.map((ordinal) => params[ordinal]),
    },
    joins: index.edges.map((edge) => {
      const bucket = split.byEdgeRef.get(edge.ref);
      return buildEdgePlanEntry(
        edge,
        andCombineConjuncts(
          bucket.conjuncts.map((conjunct) =>
            canonicalizeQualifiers(conjunct, index),
          ),
        ),
        bucket.paramIndexes.map((ordinal) => params[ordinal]),
      );
    }),
    residualConjuncts: split.residual.map((conjunct) =>
      prepareResidualConjunct(conjunct, params, index),
    ),
  };
}
export {
  SEMI_FILTER_KIND, andCombineConjuncts, buildJoinKeyInFilter,
  buildJoinPushdownPlan, collectDistinctJoinKeyValues,
  resolveResidualConjunctForRow,
};
