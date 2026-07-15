import {EXPR_TYPE} from '../parser-constants.js';

/** Aggregate function names as the parser normalizes them. */
const AGGREGATE_FN = Object.freeze({
  COUNT: 'COUNT',
  SUM: 'SUM',
  AVG: 'AVG',
  MIN: 'MIN',
  MAX: 'MAX',
});

/** Row-key text fragments mirroring QueryExecutor#getArgName. */
const ARG_NAME = Object.freeze({
  STAR: '*',
  UNKNOWN: '?',
});

/**
 * Fan-out plan kinds for a distributed SELECT. Explicit variants — the
 * merge engine branches on this single canonical outcome instead of
 * re-deriving aggregate-ness from the AST.
 */
const FANOUT_PLAN_KIND = {
  RAW_ROWS: 'raw_rows',
  PARTIAL_AGGREGATE: 'partial_aggregate',
};

/** Internal construction states before the public plan kind is emitted. */
const FANOUT_BUILD_STATE = {
  ORIGINAL_RAW_ROWS: 'original_raw_rows',
  DISTRIBUTED_RAW_ROWS: 'distributed_raw_rows',
  PARTIAL_AGGREGATE: 'partial_aggregate',
};

/**
 * Deterministic partition-side aliases for combinable partial columns.
 * Prefixed so they can never collide with user column names, and stable
 * per column index so the coordinator can address them positionally.
 */
const PARTIAL_ALIAS = {
  GROUP_KEY_PREFIX: '__fanout_gk_',
  AGGREGATE_PREFIX: '__fanout_agg_',
  BARE_PREFIX: '__fanout_bare_',
  DISTINCT_VALUES_SUFFIX: '_dv',
  SUM_SUFFIX: '_sum',
  COUNT_SUFFIX: '_count',
  MIN_SUFFIX: '_min',
  MAX_SUFFIX: '_max',
};

/**
 * Per-aggregate combine strategies. One canonical decision table:
 * every supported aggregate maps to the partial columns it needs
 * partition-side and the combine rule the coordinator applies.
 */
const AGGREGATE_COMBINE_MODE = {
  SUM_OF_COUNTS: 'sum_of_counts',
  SUM_OF_SUMS: 'sum_of_sums',
  SUM_PAIR_RATIO: 'sum_pair_ratio',
  MIN_OF_MINS: 'min_of_mins',
  MAX_OF_MAXES: 'max_of_maxes',
  DISTINCT_VALUES: 'distinct_values',
};

const COMBINE_MODE_BY_FUNCTION = {
  [AGGREGATE_FN.COUNT]: AGGREGATE_COMBINE_MODE.SUM_OF_COUNTS,
  [AGGREGATE_FN.SUM]: AGGREGATE_COMBINE_MODE.SUM_OF_SUMS,
  [AGGREGATE_FN.AVG]: AGGREGATE_COMBINE_MODE.SUM_PAIR_RATIO,
  [AGGREGATE_FN.MIN]: AGGREGATE_COMBINE_MODE.MIN_OF_MINS,
  [AGGREGATE_FN.MAX]: AGGREGATE_COMBINE_MODE.MAX_OF_MAXES,
};

/**
 * Coordinator-side expression node type marking a combined aggregate
 * value inside a SELECT expression (e.g. `SUM(x) + 1`): the partition
 * ships the aggregate's partials, and the combiner substitutes the
 * globally-combined value at this marker before evaluating the rest of
 * the expression.
 */
const COMBINED_AGGREGATE_MARKER = 'combined_aggregate_marker';

/**
 * Expression node types the coordinator-side scalar evaluator supports.
 * A SELECT expression containing any other node type (CASE, CAST,
 * function calls, subqueries, ...) forces the whole plan back to legacy
 * RAW_ROWS behavior instead of producing silently-wrong values.
 */
const EVALUABLE_EXPRESSION_TYPES = new Set([
  EXPR_TYPE.BINARY,
  EXPR_TYPE.UNARY,
  EXPR_TYPE.LITERAL,
  EXPR_TYPE.COLUMN_REF,
  EXPR_TYPE.PARAMETER,
  EXPR_TYPE.AGGREGATE,
]);

/**
 * Binary operators the coordinator scalar evaluator supports, with
 * SQLite affinity semantics: integer/integer division truncates and
 * modulo casts its operands to integer; division or modulo by zero is
 * NULL; comparisons surface as 1/0. This table is the single source of
 * truth for BOTH plan-time evaluability (an unsupported operator forces
 * the RAW_ROWS fallback) and combine-time evaluation.
 */
const SCALAR_BINARY_OPS = Object.freeze({
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': (a, b) => a * b,
  '/': (a, b) => {
    if (Number(b) === 0) {
      return null;
    }
    if (Number.isInteger(a) && Number.isInteger(b)) {
      return Math.trunc(a / b);
    }
    return a / b;
  },
  '%': (a, b) => {
    const divisor = Math.trunc(Number(b));
    if (divisor === 0) {
      return null;
    }
    return Math.trunc(Number(a)) % divisor;
  },
  '=': (a, b) => (a === b ? 1 : 0),
  '!=': (a, b) => (a !== b ? 1 : 0),
  '<>': (a, b) => (a !== b ? 1 : 0),
  '<': (a, b) => (a < b ? 1 : 0),
  '<=': (a, b) => (a <= b ? 1 : 0),
  '>': (a, b) => (a > b ? 1 : 0),
  '>=': (a, b) => (a >= b ? 1 : 0),
});

/** Unary operators the coordinator scalar evaluator supports. */
const SCALAR_UNARY_OPS = Object.freeze({
  '-': (value) => -value,
  '+': (value) => +value,
});

/**
 * Render an expression AST to a canonical comparison string. Used to
 * structurally match SELECT columns against GROUP BY expressions without
 * relying on object identity.
 * @param {Object} expr - Expression AST node.
 * @return {string} Canonical rendering.
 */
function canonicalExpressionKey(expr) {
  return JSON.stringify(normalizeForKey(expr));
}

function normalizeForKey(node) {
  if (node === null || typeof node !== 'object') {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map(normalizeForKey);
  }
  const out = {};
  for (const key of Object.keys(node).sort()) {
    out[key] = normalizeForKey(node[key]);
  }
  return out;
}

/**
 * The alias the legacy coordinator aggregation gives an aggregate output
 * row key: user alias when present, otherwise `FUNC(argName)` where
 * argName mirrors QueryExecutor#getArgName.
 * @param {Object} col - SELECT column AST entry.
 * @param {Object} expr - The aggregate expression inside it.
 * @return {string} Output row key.
 */
function aggregateOutputKey(col, expr) {
  return col.alias || canonicalAggregateName(expr);
}

/**
 * Canonical `FUNC(arg)` name; matches evaluateExpression's HAVING lookup.
 * @param {Object} expr - Aggregate expression AST.
 * @return {string} Canonical aggregate name.
 */
function canonicalAggregateName(expr) {
  let argName = ARG_NAME.UNKNOWN;
  if (expr.argument?.type === EXPR_TYPE.STAR) {
    argName = ARG_NAME.STAR;
  } else if (
    expr.argument?.type === EXPR_TYPE.COLUMN_REF
  ) {
    argName = expr.argument.column;
  }
  return `${expr.function}(${argName})`;
}

/**
 * Collect every aggregate expression referenced by the SELECT columns and
 * the HAVING clause, deduplicated by canonical shape, so HAVING can filter
 * on aggregates that are not projected.
 * @param {Object} ast - SELECT AST.
 * @return {Array<{expr: Object, outputKeys: string[], havingKey: string}>}
 */
function collectAggregateSpecs(ast) {
  const specs = [];
  const byShape = new Map();

  const register = (expr, outputKey) => {
    const shape = canonicalExpressionKey(expr);
    let spec = byShape.get(shape);
    if (!spec) {
      spec = {
        expr,
        outputKeys: [],
        havingKey: canonicalAggregateName(expr),
        combineMode: expr.distinct ?
          AGGREGATE_COMBINE_MODE.DISTINCT_VALUES :
          COMBINE_MODE_BY_FUNCTION[expr.function.toUpperCase()],
        index: specs.length,
      };
      byShape.set(shape, spec);
      specs.push(spec);
    }
    if (outputKey && !spec.outputKeys.includes(outputKey)) {
      spec.outputKeys.push(outputKey);
    }
    return spec;
  };

  for (const col of ast.columns) {
    const expr = col.expression || col;
    if (expr.type === EXPR_TYPE.AGGREGATE) {
      register(expr, aggregateOutputKey(col, expr));
    } else {
      // Aggregates nested inside a SELECT expression (SUM(x) + 1) still
      // need partials shipped; the expression itself is evaluated at the
      // coordinator over the combined values.
      walkAggregates(expr, (nested) => register(nested, null));
    }
  }
  walkAggregates(ast.having, (expr) => register(expr, null));
  return specs;
}

function containsAggregate(node) {
  let found = false;
  walkAggregates(node, () => {
    found = true;
  });
  return found;
}

/**
 * Replace every aggregate node inside an expression clone with a
 * combined-aggregate marker pointing at its registered spec.
 * @param {Object} node - Expression AST clone (mutated in place).
 * @param {Map} specByShape - Canonical shape -> aggregate spec.
 */
function replaceAggregatesWithMarkers(node, specByShape) {
  if (!node || typeof node !== 'object') {
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => {
        if (entry?.type === EXPR_TYPE.AGGREGATE) {
          value[index] = buildAggregateMarker(entry, specByShape);
        } else {
          replaceAggregatesWithMarkers(entry, specByShape);
        }
      });
      continue;
    }
    if (value && typeof value === 'object') {
      if (value.type === EXPR_TYPE.AGGREGATE) {
        node[key] = buildAggregateMarker(value, specByShape);
        continue;
      }
      replaceAggregatesWithMarkers(value, specByShape);
    }
  }
}

function buildAggregateMarker(aggregateNode, specByShape) {
  const spec = specByShape.get(canonicalExpressionKey(aggregateNode));
  return {type: COMBINED_AGGREGATE_MARKER, specIndex: spec.index};
}

/**
 * Visit column refs that sit outside any aggregate (aggregates are
 * already replaced by markers when this runs).
 * @param {Object} node - Expression AST.
 * @param {Function} visit - Called with each column_ref node.
 */
function collectOutsideColumnRefs(node, visit) {
  if (!node || typeof node !== 'object') {
    return;
  }
  if (node.type === EXPR_TYPE.COLUMN_REF) {
    visit(node);
    return;
  }
  if (node.type === COMBINED_AGGREGATE_MARKER) {
    return;
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      value.forEach((entry) => collectOutsideColumnRefs(entry, visit));
    } else if (value && typeof value === 'object') {
      collectOutsideColumnRefs(value, visit);
    }
  }
}

/**
 * Whether a SELECT expression containing aggregates can be evaluated at
 * the coordinator after its aggregates are combined.
 * @param {Object} node - Expression AST.
 * @return {boolean} True when every node type is evaluable.
 */
function expressionEvaluable(node) {
  if (!node || typeof node !== 'object') {
    return true;
  }
  if (node.type === EXPR_TYPE.AGGREGATE) {
    // The aggregate itself is replaced by its combined value; its
    // argument runs partition-side inside the partial.
    return true;
  }
  if (node.type && !EVALUABLE_EXPRESSION_TYPES.has(node.type)) {
    return false;
  }
  if (node.type === EXPR_TYPE.BINARY &&
    !Object.hasOwn(SCALAR_BINARY_OPS, node.operator)) {
    return false;
  }
  if (node.type === EXPR_TYPE.UNARY &&
    !Object.hasOwn(SCALAR_UNARY_OPS, node.operator)) {
    return false;
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      if (!value.every((entry) => expressionEvaluable(entry))) {
        return false;
      }
    } else if (value && typeof value === 'object') {
      if (!expressionEvaluable(value)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * True when some SELECT column mixes aggregates into an expression the
 * coordinator evaluator cannot compute — forces legacy fallback.
 * @param {Object} ast - SELECT AST.
 * @return {boolean} Unsupported mixed expression present.
 */
function hasUnsupportedAggregateExpression(ast) {
  return ast.columns.some((col) => {
    const expr = col.expression || col;
    return expr.type !== EXPR_TYPE.AGGREGATE &&
      containsAggregate(expr) &&
      !expressionEvaluable(expr);
  });
}

function walkAggregates(node, visit) {
  if (!node || typeof node !== 'object') {
    return;
  }
  if (node.type === EXPR_TYPE.AGGREGATE) {
    visit(node);
    return;
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      value.forEach((entry) => walkAggregates(entry, visit));
    } else if (value && typeof value === 'object') {
      walkAggregates(value, visit);
    }
  }
}

/**
 * Whether every aggregate in the AST has a supported combine mode; an
 * unsupported function falls the whole plan back to legacy behavior
 * rather than producing silently-wrong partials.
 * @param {Array} specs - Aggregate specs.
 * @return {boolean} True when all combine modes are known.
 */
function allAggregatesCombinable(specs) {
  return specs.every((spec) => Boolean(spec.combineMode));
}

/**
 * True when the SELECT shape supports the partial/raw fan-out rewrite.
 * Set operations, CTEs, subquery FROM, and JOINs keep legacy rendering
 * (JOINs are rewritten separately by the join execution path).
 * @param {Object} ast - SELECT AST.
 * @return {boolean} Rewrite applicability.
 */
function fanoutRewriteApplies(ast) {
  return !ast.setOperation &&
    !(ast.ctes && ast.ctes.length > 0) &&
    !ast.from?.subquery &&
    !(ast.joins && ast.joins.length > 0);
}

function hasAggregatesOrGroupBy(ast, specs) {
  return specs.length > 0 || Boolean(ast.groupBy);
}

/**
 * Tag every parameter node with its ordinal in the original render order
 * (columns, where, groupBy, having, orderBy — the clause order
 * buildSelectSQL emits placeholders in for rewrite-eligible shapes).
 * @param {Object} ast - SELECT AST (mutated: parameter nodes get
 *   `__fanoutParamIndex`).
 * @return {number} Total parameter count.
 */
function tagParameterOrdinals(ast) {
  let ordinal = 0;
  const visit = (node) => {
    if (!node || typeof node !== 'object') {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node.type === EXPR_TYPE.PARAMETER) {
      node.__fanoutParamIndex = ordinal;
      ordinal += 1;
      return;
    }
    for (const value of Object.values(node)) {
      visit(value);
    }
  };
  visit(ast.columns);
  visit(ast.where);
  visit(ast.groupBy);
  visit(ast.having);
  visit(ast.orderBy);
  return ordinal;
}

/**
 * Collect the original ordinals of every parameter node reachable from
 * the (rewritten) partition AST, in partition render order, so the
 * partition params array can be assembled from the original one.
 * @param {Object} partitionAst - Rewritten AST.
 * @return {number[]} Original parameter ordinals in partition order.
 */
function collectPartitionParamOrdinals(partitionAst) {
  const ordinals = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node.type === EXPR_TYPE.PARAMETER) {
      ordinals.push(node.__fanoutParamIndex);
      return;
    }
    for (const value of Object.values(node)) {
      visit(value);
    }
  };
  visit(partitionAst.columns);
  visit(partitionAst.where);
  visit(partitionAst.groupBy);
  visit(partitionAst.having);
  visit(partitionAst.orderBy);
  return ordinals;
}

function cloneAst(node) {
  return structuredClone(node);
}

/**
 * Replace parameter nodes inside a coordinator-side clause with literal
 * nodes carrying the bound value, so HAVING can be evaluated at the
 * coordinator after the partition SQL (which no longer contains those
 * placeholders) consumed only its own parameters.
 * @param {Object} node - Clause AST (mutated in place).
 * @param {Array} params - Original positional parameters.
 */
function substituteParameterLiterals(node, params) {
  if (!node || typeof node !== 'object') {
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (Array.isArray(value)) {
      value.forEach((entry) => substituteParameterLiterals(entry, params));
      continue;
    }
    if (value && typeof value === 'object') {
      if (value.type === EXPR_TYPE.PARAMETER) {
        node[key] = {
          type: EXPR_TYPE.LITERAL,
          value: params[value.__fanoutParamIndex],
        };
        continue;
      }
      substituteParameterLiterals(value, params);
    }
  }
}

/**
 * Build the partition-side over-fetch limit for raw-row fan-out: OFFSET
 * must be applied exactly once globally, so each partition returns its
 * first (count + offset) rows and the coordinator slices.
 * @param {Object} limit - Original limit AST ({count, offset}).
 * @return {Object} Rewritten limit AST.
 */
function buildOverfetchLimit(limit) {
  const offset = Number.isInteger(limit.offset) ? Math.max(limit.offset, 0) : 0;
  if (!Number.isInteger(limit.count)) {
    return {count: limit.count, offset: 0};
  }
  return {count: Math.max(limit.count, 0) + offset, offset: 0};
}

/**
 * Build the partition-side projection and GROUP BY for a
 * partial-aggregate fan-out, plus the coordinator combine spec.
 * @param {Object} ast - Original SELECT AST.
 * @param {Array} specs - Aggregate specs from collectAggregateSpecs.
 * @return {{partitionAst: Object, combineSpec: Object}} Plan parts.
 */
function buildPartialAggregateParts(ast, specs, renderExpression) {
  const partitionAst = cloneAst(ast);
  const columns = [];
  const groupKeys = [];
  const bareColumns = [];
  const partitionGroupBy = [];

  const groupByEntries = ast.groupBy || [];
  const groupKeyByShape = new Map();
  groupByEntries.forEach((groupExpr, index) => {
    const alias = `${PARTIAL_ALIAS.GROUP_KEY_PREFIX}${index}`;
    const shape = canonicalExpressionKey(groupExpr);
    const key = {alias, shape, outputKeys: []};
    groupKeyByShape.set(shape, key);
    groupKeys.push(key);
    columns.push({expression: cloneAst(groupExpr), alias});
    partitionGroupBy.push(cloneAst(groupExpr));
  });

  const expressionColumns = [];
  let includeStar = false;
  const specByShape = new Map(
    specs.map((spec) => [canonicalExpressionKey(spec.expr), spec]),
  );
  const bareByColumn = new Map();
  const ensureBareColumn = (expr, outputKey, index, projected) => {
    const existing = bareByColumn.get(outputKey);
    if (existing) {
      existing.projected = existing.projected || projected;
      return;
    }
    const alias = `${PARTIAL_ALIAS.BARE_PREFIX}${index}_${bareByColumn.size}`;
    const bare = {alias, outputKey, projected};
    bareByColumn.set(outputKey, bare);
    bareColumns.push(bare);
    columns.push({expression: cloneAst(expr), alias});
  };

  ast.columns.forEach((col, index) => {
    const expr = col.expression || col;
    if (expr.type === EXPR_TYPE.AGGREGATE) {
      return;
    }
    if (expr.type === EXPR_TYPE.STAR) {
      // SELECT * alongside aggregates/GROUP BY: ship the raw columns and
      // let the combiner surface an arbitrary row's values per group —
      // SQLite's own bare-column semantics.
      includeStar = true;
      columns.push({type: EXPR_TYPE.STAR});
      return;
    }
    const shape = canonicalExpressionKey(expr);
    const outputKey = col.alias ||
      (expr.type === EXPR_TYPE.COLUMN_REF ?
        expr.column :
        renderExpression(expr));
    const groupKey = groupKeyByShape.get(shape);
    if (groupKey) {
      groupKey.outputKeys.push(outputKey);
      return;
    }
    if (containsAggregate(expr)) {
      // Combined-aggregate expression: replace each aggregate node with
      // a marker resolving to the globally-combined value, and project
      // any raw columns it references as bare partials.
      const markerExpr = cloneAst(expr);
      replaceAggregatesWithMarkers(markerExpr, specByShape);
      collectOutsideColumnRefs(markerExpr, (refExpr) =>
        ensureBareColumn(refExpr, refExpr.column, index, false),
      );
      expressionColumns.push({outputKey, expression: markerExpr});
      return;
    }
    ensureBareColumn(expr, outputKey, index, true);
  });

  const distinctArgShapes = new Map();
  for (const spec of specs) {
    const base = `${PARTIAL_ALIAS.AGGREGATE_PREFIX}${spec.index}`;
    if (spec.combineMode === AGGREGATE_COMBINE_MODE.DISTINCT_VALUES) {
      const argShape = canonicalExpressionKey(spec.expr.argument);
      let valueAlias = distinctArgShapes.get(argShape);
      if (!valueAlias) {
        valueAlias = `${base}${PARTIAL_ALIAS.DISTINCT_VALUES_SUFFIX}`;
        distinctArgShapes.set(argShape, valueAlias);
        columns.push({
          expression: cloneAst(spec.expr.argument),
          alias: valueAlias,
        });
        partitionGroupBy.push(cloneAst(spec.expr.argument));
      }
      spec.partials = {values: valueAlias};
      continue;
    }
    if (spec.combineMode === AGGREGATE_COMBINE_MODE.SUM_PAIR_RATIO) {
      const sumAlias = `${base}${PARTIAL_ALIAS.SUM_SUFFIX}`;
      const countAlias = `${base}${PARTIAL_ALIAS.COUNT_SUFFIX}`;
      columns.push({
        expression: {
          type: EXPR_TYPE.AGGREGATE,
          function: AGGREGATE_FN.SUM,
          argument: cloneAst(spec.expr.argument),
          distinct: false,
        },
        alias: sumAlias,
      });
      columns.push({
        expression: {
          type: EXPR_TYPE.AGGREGATE,
          function: AGGREGATE_FN.COUNT,
          argument: cloneAst(spec.expr.argument),
          distinct: false,
        },
        alias: countAlias,
      });
      spec.partials = {sum: sumAlias, count: countAlias};
      continue;
    }
    const suffixByMode = {
      [AGGREGATE_COMBINE_MODE.SUM_OF_COUNTS]: PARTIAL_ALIAS.COUNT_SUFFIX,
      [AGGREGATE_COMBINE_MODE.SUM_OF_SUMS]: PARTIAL_ALIAS.SUM_SUFFIX,
      [AGGREGATE_COMBINE_MODE.MIN_OF_MINS]: PARTIAL_ALIAS.MIN_SUFFIX,
      [AGGREGATE_COMBINE_MODE.MAX_OF_MAXES]: PARTIAL_ALIAS.MAX_SUFFIX,
    };
    const alias = `${base}${suffixByMode[spec.combineMode]}`;
    columns.push({
      expression: cloneAst(spec.expr),
      alias,
    });
    spec.partials = {value: alias};
  }

  partitionAst.columns = columns;
  partitionAst.groupBy = partitionGroupBy.length > 0 ?
    partitionGroupBy :
    null;
  partitionAst.having = null;
  partitionAst.orderBy = null;
  partitionAst.limit = null;
  partitionAst.distinct = false;

  const combineSpec = {
    groupKeys,
    bareColumns,
    aggregates: specs.map((spec) => ({
      index: spec.index,
      combineMode: spec.combineMode,
      outputKeys: spec.outputKeys,
      havingKey: spec.havingKey,
      partials: spec.partials,
      fn: spec.expr.function.toUpperCase(),
    })),
    having: ast.having || null,
    orderBy: ast.orderBy || null,
    limit: ast.limit || null,
    hasGroupBy: groupByEntries.length > 0,
    expressionColumns,
    includeStar,
  };

  return {partitionAst, combineSpec};
}

/**
 * Build the fan-out plan for a distributed SELECT: what SQL each
 * partition executes and how the coordinator must merge the results so
 * aggregates, GROUP BY/HAVING, and LIMIT/OFFSET are applied with global
 * semantics exactly once.
 * @param {Object} ast - Parsed SELECT AST (not mutated).
 * @param {Array} params - Original positional parameters.
 * @param {Function} renderExpression - Renders an expression AST to SQL
 *   text (QueryExecutor#buildExpressionSQL); names unaliased outputs.
 * @return {{kind: string, partitionAst: Object, partitionParams: Array,
 *   combineSpec: (Object|null)}} Fan-out plan.
 */
function buildSelectFanoutPlan(ast, params = [], renderExpression = null) {
  const workingAst = cloneAst(ast);
  tagParameterOrdinals(workingAst);
  const specs = collectAggregateSpecs(workingAst);
  const renderExpr = renderExpression ||
    ((expr) => canonicalExpressionKey(expr));

  const hasAggregatePlan = hasAggregatesOrGroupBy(workingAst, specs);
  const mustUseOriginalRows = !fanoutRewriteApplies(workingAst) ||
    (hasAggregatePlan && (!allAggregatesCombinable(specs) ||
      hasUnsupportedAggregateExpression(workingAst)));
  const buildState = mustUseOriginalRows ?
    FANOUT_BUILD_STATE.ORIGINAL_RAW_ROWS :
    hasAggregatePlan ?
      FANOUT_BUILD_STATE.PARTIAL_AGGREGATE :
      FANOUT_BUILD_STATE.DISTRIBUTED_RAW_ROWS;

  switch (buildState) {
  case FANOUT_BUILD_STATE.ORIGINAL_RAW_ROWS:
    return {
      kind: FANOUT_PLAN_KIND.RAW_ROWS,
      partitionAst: ast,
      partitionParams: params,
      combineSpec: null,
    };
  case FANOUT_BUILD_STATE.DISTRIBUTED_RAW_ROWS: {
    const partitionAst = workingAst;
    if (partitionAst.limit) {
      partitionAst.limit = buildOverfetchLimit(partitionAst.limit);
    }
    const ordinals = collectPartitionParamOrdinals(partitionAst);
    return {
      kind: FANOUT_PLAN_KIND.RAW_ROWS,
      partitionAst,
      partitionParams: ordinals.map((ordinal) => params[ordinal]),
      combineSpec: null,
    };
  }
  default:
    break;
  }

  const {partitionAst, combineSpec} = buildPartialAggregateParts(
    workingAst,
    specs,
    renderExpr,
  );
  substituteParameterLiterals(combineSpec.having, params);
  for (const expressionColumn of combineSpec.expressionColumns) {
    substituteParameterLiterals(expressionColumn, params);
  }
  const ordinals = collectPartitionParamOrdinals(partitionAst);
  return {
    kind: FANOUT_PLAN_KIND.PARTIAL_AGGREGATE,
    partitionAst,
    partitionParams: ordinals.map((ordinal) => params[ordinal]),
    combineSpec,
  };
}

export {
  FANOUT_PLAN_KIND,
  AGGREGATE_COMBINE_MODE,
  COMBINED_AGGREGATE_MARKER,
  PARTIAL_ALIAS,
  SCALAR_BINARY_OPS,
  SCALAR_UNARY_OPS,
  buildSelectFanoutPlan,
};
