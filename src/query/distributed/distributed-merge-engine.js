/**
 * DistributedMergeEngine: coordinator SQLite merge engine backed by
 * CoordinatorMergeSession (design coordinator-sqlite-merge §2.1, §2.2, §2.8).
 *
 * Executes per-statement in-memory SQLite merge sessions ingesting partition
 * fragments in canonical layout.
 *
 * @module query/distributed/distributed-merge-engine
 */

import {EXPR_TYPE} from '../parser-constants.js';
import {
  presentRawSqlRows,
  presentSqlRowObjects,
} from '../sql-value-presentation.js';
import {
  PRESENTED_SAFE_INTEGERS_SYMBOL,
  RESIDENT_RESULT_BYTES_SYMBOL,
  stampPresentedRowCollection,
} from './parallel-query-execution-metrics.js';
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

const LAZY_ROWS_GETTER_SYMBOL_KEY = 'lagrange.query.lazyRowsGetter';
const LAZY_ROWS_GETTER_SYMBOL = Symbol.for(LAZY_ROWS_GETTER_SYMBOL_KEY);
const PROP_ROWS = 'rows';

function isPresentedForPolicy(collection, safeIntegers) {
  return (
    Array.isArray(collection) &&
    collection[PRESENTED_SAFE_INTEGERS_SYMBOL] === safeIntegers
  );
}

function hasUnevaluatedLazyRows(fragment) {
  if (!fragment || typeof fragment !== 'object') return false;
  if (!fragment[LAZY_ROWS_GETTER_SYMBOL]) return false;
  const descriptor = Object.getOwnPropertyDescriptor(fragment, PROP_ROWS);
  return Boolean(descriptor?.get);
}

function materializeRowObjectsFromPresentedRaw(
  columns,
  rawRows,
  safeIntegers,
  residentBytes,
) {
  const colCount = Array.isArray(columns) ? columns.length : 0;
  const rows = new Array(rawRows.length);
  for (let r = 0; r < rawRows.length; r += 1) {
    const rawRow = rawRows[r];
    const obj = {};
    for (let c = 0; c < colCount; c += 1) {
      obj[columns[c]] = rawRow[c] === undefined ? null : rawRow[c];
    }
    rows[r] = obj;
  }
  return stampPresentedRowCollection(rows, safeIntegers, residentBytes);
}

function attachLazyRowsGetter(target, getRows) {
  Object.defineProperty(target, LAZY_ROWS_GETTER_SYMBOL, {
    value: getRows,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(target, PROP_ROWS, {
    enumerable: true,
    configurable: true,
    get() {
      const materialized = getRows();
      Object.defineProperty(target, PROP_ROWS, {
        value: materialized,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      return materialized;
    },
    set(nextRows) {
      Object.defineProperty(target, PROP_ROWS, {
        value: nextRows,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    },
  });
  return target;
}

function resolveFastPathRawRows(first, normalizedSafeIntegers) {
  if (!Array.isArray(first.rawRows)) {
    return null;
  }
  if (isPresentedForPolicy(first.rawRows, normalizedSafeIntegers)) {
    return first.rawRows;
  }
  return stampPresentedRowCollection(
    presentRawSqlRows(first.rawRows, {safeIntegers: normalizedSafeIntegers}),
    normalizedSafeIntegers,
    first.rawRows[RESIDENT_RESULT_BYTES_SYMBOL],
  );
}

function resolveFastPathObjectRows(first, rawRows, columns, normalizedSafeIntegers) {
  if (isPresentedForPolicy(first.rows, normalizedSafeIntegers)) {
    return first.rows;
  }
  if (Array.isArray(rawRows) && Array.isArray(columns)) {
    return materializeRowObjectsFromPresentedRaw(
      columns,
      rawRows,
      normalizedSafeIntegers,
      rawRows[RESIDENT_RESULT_BYTES_SYMBOL],
    );
  }
  if (Array.isArray(first.rows)) {
    return stampPresentedRowCollection(
      presentSqlRowObjects(first.rows, {safeIntegers: normalizedSafeIntegers}),
      normalizedSafeIntegers,
      first.rows[RESIDENT_RESULT_BYTES_SYMBOL],
    );
  }
  return [];
}

function buildSinglePartitionFastPathResult(
  validFragments,
  effectivePlan,
  safeIntegers,
) {
  const normalizedSafeIntegers = safeIntegers === true;
  const first = validFragments[0] || {rows: [], columns: null, rowSet: null};
  const columns = Array.isArray(first.columns) ?
    first.columns :
    effectivePlan.expectedColumns;
  const rawAlreadyPresented = isPresentedForPolicy(
    first.rawRows,
    normalizedSafeIntegers,
  );
  const rawRows = resolveFastPathRawRows(first, normalizedSafeIntegers);
  if (rawAlreadyPresented && hasUnevaluatedLazyRows(first)) {
    return attachLazyRowsGetter({
      guardOutcome: GUARD_OUTCOME.GUARD_HELD,
      rawRows,
      columns,
      rowSet: first.rowSet || null,
    }, first[LAZY_ROWS_GETTER_SYMBOL]);
  }
  return {
    guardOutcome: GUARD_OUTCOME.GUARD_HELD,
    rows: resolveFastPathObjectRows(first, rawRows, columns, normalizedSafeIntegers),
    rawRows,
    columns,
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
  const normalizedSafeIntegers = safeIntegers === true;
  const rawRows = Array.isArray(merged.rawRows) ?
    (isPresentedForPolicy(merged.rawRows, normalizedSafeIntegers) ?
      merged.rawRows :
      stampPresentedRowCollection(
        presentRawSqlRows(merged.rawRows, {safeIntegers: normalizedSafeIntegers}),
        normalizedSafeIntegers,
      )) :
    merged.rawRows;
  const rows = Array.isArray(rawRows) && Array.isArray(merged.columns) ?
    materializeRowObjectsFromPresentedRaw(
      merged.columns,
      rawRows,
      normalizedSafeIntegers,
    ) :
    presentSqlRowObjects(merged.rows, {safeIntegers: normalizedSafeIntegers});
  return {
    guardOutcome: GUARD_OUTCOME.GUARD_HELD,
    rows,
    rawRows,
    columns: merged.columns,
    rowSet: merged.rowSet,
    byteLength: merged.byteLength,
  };
}

function pickDefinedValue(firstValue, secondValue, defaultValue = undefined) {
  if (firstValue !== undefined && firstValue !== null) return firstValue;
  if (secondValue !== undefined && secondValue !== null) return secondValue;
  return defaultValue;
}

function resolveDeadlineFromOptions(sessionDeadline, topDeadline, timeoutMs) {
  const explicit = pickDefinedValue(sessionDeadline, topDeadline, null);
  if (Number.isSafeInteger(explicit) && explicit > 0) {
    return explicit;
  }
  if (Number.isSafeInteger(timeoutMs) && timeoutMs > 0) {
    return Date.now() + timeoutMs;
  }
  return null;
}

function buildEffectiveSessionOptions(options = {}) {
  const base = options.sessionOptions || {};
  const timeoutMs = pickDefinedValue(base.timeoutMs, options.timeoutMs, null);
  const deadlineMs = resolveDeadlineFromOptions(
    base.deadlineMs,
    options.deadlineMs,
    timeoutMs,
  );
  return {
    ...base,
    budget: pickDefinedValue(base.budget, options.budget),
    memoryLimitBytes: pickDefinedValue(base.memoryLimitBytes, options.memoryLimitBytes),
    mergeInputMaxRows: pickDefinedValue(base.mergeInputMaxRows, options.mergeInputMaxRows),
    resultMaxRows: pickDefinedValue(base.resultMaxRows, options.resultMaxRows),
    resultMaxBytes: pickDefinedValue(base.resultMaxBytes, options.resultMaxBytes),
    deadlineMs,
    timeoutMs,
    cancellationToken: pickDefinedValue(
      base.cancellationToken,
      options.cancellationToken,
      null,
    ),
    signal: pickDefinedValue(base.signal, options.signal, null),
    isCancelled: pickDefinedValue(base.isCancelled, options.isCancelled, null),
  };
}

function hasActiveInterruptionContract(sessionOptions) {
  return (
    sessionOptions.deadlineMs !== null ||
    Boolean(sessionOptions.cancellationToken) ||
    Boolean(sessionOptions.signal) ||
    Boolean(sessionOptions.isCancelled)
  );
}

function shouldUseProcessPool(effectivePlan, options, sessionOptions, ownedPool) {
  if (effectivePlan.kind !== FANOUT_PLAN_KIND.COORDINATOR_EVALUATED) {
    return false;
  }
  if (options.useProcessPool === false) {
    return false;
  }
  if (
    options.useProcessPool === true ||
    Boolean(options.processPool) ||
    Boolean(ownedPool)
  ) {
    return true;
  }
  return hasActiveInterruptionContract(sessionOptions);
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
  sessionOptions,
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
    sessionOptions,
  });
  return presentMergedExecutionResult(merged, options.safeIntegers === true);
}

class DistributedMergeEngine {
  constructor(options = {}) {
    this.processPool = options.processPool || null;
  }

  resolveProcessPool(overridePool = null) {
    if (overridePool) return overridePool;
    if (this.processPool === null) {
      this.processPool = getDefaultMergeProcessPool();
    }
    return this.processPool;
  }

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
    const safeIntegers = options.safeIntegers === true;

    if (
      effectivePlan.kind === FANOUT_PLAN_KIND.SINGLE_PARTITION &&
      validFragments.length <= 1
    ) {
      return buildSinglePartitionFastPathResult(
        validFragments,
        effectivePlan,
        safeIntegers,
      );
    }

    const tableName = resolveCoordinatorTableName(effectivePlan, ast);
    const sessionOptions = buildEffectiveSessionOptions(options);
    if (shouldUseProcessPool(effectivePlan, options, sessionOptions, this.processPool)) {
      const pool = this.resolveProcessPool(options.processPool);
      return executePooledCoordinatorMerge(
        pool,
        tableName,
        validFragments,
        ast,
        effectivePlan,
        options,
        sessionOptions,
      );
    }

    return this.executeInProcessSessionMerge(
      tableName,
      validFragments,
      ast,
      effectivePlan,
      options,
      sessionOptions,
    );
  }

  async executeInProcessSessionMerge(
    tableName,
    validFragments,
    ast,
    effectivePlan,
    options,
    sessionOptions = null,
  ) {
    const effectiveSessionOptions = sessionOptions || buildEffectiveSessionOptions(options);
    const session = new CoordinatorMergeSession(effectiveSessionOptions);
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

  shutdown() {
    this.processPool?.shutdown?.();
  }

  close() {
    this.shutdown();
  }
}

export {DistributedMergeEngine};
