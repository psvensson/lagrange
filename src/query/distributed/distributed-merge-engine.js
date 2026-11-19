/**
 * DistributedMergeEngine: coordinator SQLite merge engine backed by
 * CoordinatorMergeSession (design coordinator-sqlite-merge §2.1, §2.2, §2.8).
 *
 * Replaces the legacy JavaScript StreamingAggregator and
 * partial-aggregate-combiner with per-statement in-memory SQLite merge
 * sessions ingesting partition fragments in canonical layout.
 *
 * @module query/distributed/distributed-merge-engine
 */

import {EXPR_TYPE} from '../parser-constants.js';
import {
  presentRawSqlRows,
  presentSqlRowObjects,
} from '../sql-value-presentation.js';
import {getDefaultMergeProcessPool} from './coordinator-merge-process.js';
import {
  CoordinatorMergeSession,
  GUARD_OUTCOME,
} from './coordinator-merge-session.js';
import {
  FANOUT_PLAN_KIND,
  buildSelectFanoutPlan,
} from './distributed-select-fanout-plan.js';

const DEFAULT_COORDINATOR_TABLE = '__table';
const NON_EXPRESSION_AST_KEYS = new Set(['type', 'alias', 'span']);

function collectAstReferencedColumns(ast) {
  const columns = new Set();
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node.type === EXPR_TYPE.COLUMN_REF && typeof node.column === 'string') {
      columns.add(node.column);
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (NON_EXPRESSION_AST_KEYS.has(key)) continue;
      walk(value);
    }
  };
  walk(ast);
  return [...columns];
}

function extractColumnsFromFragment(fragment) {
  if (!fragment || typeof fragment !== 'object') return null;
  if (Array.isArray(fragment.rowSet?.columns) && fragment.rowSet.columns.length > 0) {
    return fragment.rowSet.columns;
  }
  if (Array.isArray(fragment.columns) && fragment.columns.length > 0) {
    return fragment.columns;
  }
  const firstRow = Array.isArray(fragment.rows) ? fragment.rows[0] : null;
  if (firstRow && typeof firstRow === 'object' && !Array.isArray(firstRow)) {
    return Object.keys(firstRow);
  }
  return null;
}

function inferFragmentColumns(fragments, ast = null) {
  const list = Array.isArray(fragments) ? fragments : [];
  for (const fragment of list) {
    const columns = extractColumnsFromFragment(fragment);
    if (columns !== null) return columns;
  }
  return ast ? collectAstReferencedColumns(ast) : [];
}

function resolveCoordinatorTableName(effectivePlan, ast) {
  if (
    typeof effectivePlan?.coordinatorTableName === 'string' &&
    effectivePlan.coordinatorTableName.length > 0
  ) {
    return effectivePlan.coordinatorTableName;
  }
  if (typeof ast?.from?.name === 'string' && ast.from.name.length > 0) {
    return ast.from.name;
  }
  return DEFAULT_COORDINATOR_TABLE;
}

function buildSinglePartitionFastPathResult(validFragments, effectivePlan) {
  const first = validFragments[0] || {rows: [], columns: null, rowSet: null};
  return {
    guardOutcome: GUARD_OUTCOME.GUARD_HELD,
    rows: Array.isArray(first.rows) ? first.rows : [],
    rawRows: Array.isArray(first.rawRows) ? first.rawRows : null,
    columns: Array.isArray(first.columns) ? first.columns : effectivePlan.expectedColumns,
    rowSet: first.rowSet || null,
  };
}

function buildGuardFailedResult() {
  return {
    guardOutcome: GUARD_OUTCOME.GUARD_FAILED,
    rows: [],
    rawRows: [],
    columns: null,
    rowSet: null,
  };
}

function presentMergedExecutionResult(merged, safeIntegers) {
  return {
    guardOutcome: GUARD_OUTCOME.GUARD_HELD,
    rows: presentSqlRowObjects(merged.rows, {safeIntegers}),
    rawRows: presentRawSqlRows(merged.rawRows, {safeIntegers}),
    columns: merged.columns,
    rowSet: merged.rowSet,
    byteLength: merged.byteLength,
  };
}

async function ingestSessionTables(
  session,
  tableName,
  validFragments,
  ast,
  effectivePlan,
  extraTables,
) {
  const declaredColumns = inferFragmentColumns(validFragments, ast);
  session.createTable(
    tableName,
    effectivePlan.coordinatorTableSchema || null,
    declaredColumns,
  );
  await session.ingestTableFragments(tableName, validFragments, {
    columns: declaredColumns,
  });

  if (!Array.isArray(extraTables)) return;
  for (const extra of extraTables) {
    const extraDeclaredColumns = Array.isArray(extra.declaredColumns) ?
      extra.declaredColumns :
      inferFragmentColumns(extra.fragments);
    session.createTable(extra.tableName, extra.schema || null, extraDeclaredColumns);
    await session.ingestTableFragments(extra.tableName, extra.fragments || [], {
      columns: extraDeclaredColumns,
    });
  }
}

function isPartialAggregatePlanKind(kind) {
  return (
    kind === FANOUT_PLAN_KIND.PARTIAL_AGGREGATE ||
    kind === FANOUT_PLAN_KIND.GUARDED_PARTIAL
  );
}

async function executePooledCoordinatorMerge(
  pool,
  tableName,
  validFragments,
  ast,
  effectivePlan,
  options,
) {
  const declaredColumns = inferFragmentColumns(validFragments, ast);
  const tables = [{
    tableName,
    schema: effectivePlan.coordinatorTableSchema || null,
    declaredColumns,
    fragments: validFragments,
  }];
  if (Array.isArray(options.extraTables)) {
    for (const extra of options.extraTables) {
      tables.push({
        tableName: extra.tableName,
        schema: extra.schema || null,
        declaredColumns: Array.isArray(extra.declaredColumns) ?
          extra.declaredColumns :
          inferFragmentColumns(extra.fragments),
        fragments: extra.fragments || [],
      });
    }
  }
  const merged = await pool.execute({
    tables,
    sql: effectivePlan.coordinatorSql,
    params: effectivePlan.coordinatorParams || [],
    expectedColumns: effectivePlan.expectedColumns || null,
    sessionOptions: options.sessionOptions || {},
  });
  return presentMergedExecutionResult(merged, options.safeIntegers === true);
}

class DistributedMergeEngine {
  /**
   * Merge partition results through an in-memory SQLite CoordinatorMergeSession
   * in canonical partition layout.
   * @param {Object[]} partitionResults - Ordered partition execution results.
   * @param {Object} ast - Parsed SELECT AST.
   * @param {Object} [queryExecutor] - QueryExecutor instance (for catalog schema lookup).
   * @param {Object|null} [fanoutPlan] - Fan-out plan from buildSelectFanoutPlan.
   * @param {Array<*>} [params=[]] - Bound query parameters.
   * @param {Object} [options={}] - Optional session and extra-table options.
   * @return {Promise<Object>} Merged result `{rows, rawRows, columns, rowSet, guardOutcome}`.
   */
  async mergePartitionResults(
    partitionResults,
    ast,
    queryExecutor = null,
    fanoutPlan = null,
    params = [],
    options = {},
  ) {
    const validFragments = (partitionResults || []).filter(
      (result) => result && result.success !== false,
    );
    const effectivePlan = fanoutPlan || buildSelectFanoutPlan(
      ast,
      params,
      Math.max(validFragments.length, 2),
      {resolveTableSchema: queryExecutor?.resolveTableInfo},
    );

    if (
      effectivePlan.kind === FANOUT_PLAN_KIND.SINGLE_PARTITION &&
      validFragments.length <= 1
    ) {
      return buildSinglePartitionFastPathResult(validFragments, effectivePlan);
    }

    const tableName = resolveCoordinatorTableName(effectivePlan, ast);
    if (
      effectivePlan.kind === FANOUT_PLAN_KIND.COORDINATOR_EVALUATED &&
      (options.useProcessPool === true || Boolean(options.processPool))
    ) {
      const pool = options.processPool || getDefaultMergeProcessPool();
      return executePooledCoordinatorMerge(
        pool,
        tableName,
        validFragments,
        ast,
        effectivePlan,
        options,
      );
    }

    return this.executeInProcessSessionMerge(
      tableName,
      validFragments,
      ast,
      effectivePlan,
      options,
    );
  }

  async executeInProcessSessionMerge(
    tableName,
    validFragments,
    ast,
    effectivePlan,
    options,
  ) {
    const session = new CoordinatorMergeSession(options.sessionOptions || {});
    try {
      await ingestSessionTables(
        session,
        tableName,
        validFragments,
        ast,
        effectivePlan,
        options.extraTables,
      );

      const shouldRunGuard =
        effectivePlan.kind === FANOUT_PLAN_KIND.GUARDED_PARTIAL &&
        typeof effectivePlan.guardSql === 'string';
      const guardOutcome = shouldRunGuard ?
        session.evaluateGuardSql(
          effectivePlan.guardSql,
          effectivePlan.guardParams || [],
        ) :
        GUARD_OUTCOME.GUARD_HELD;

      if (guardOutcome === GUARD_OUTCOME.GUARD_FAILED) {
        return buildGuardFailedResult();
      }

      const merged = session.executeMergeSql(
        effectivePlan.coordinatorSql,
        effectivePlan.coordinatorParams || [],
        {
          expectedColumns: effectivePlan.expectedColumns || null,
          partialAggregate: isPartialAggregatePlanKind(effectivePlan.kind),
        },
      );
      return presentMergedExecutionResult(merged, options.safeIntegers === true);
    } finally {
      session.close();
    }
  }
}

export {DistributedMergeEngine};
