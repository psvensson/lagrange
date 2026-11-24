/**
 * Cross-partition JOIN execution via CoordinatorMergeSession
 * (`COORDINATOR_EVALUATED`, design coordinator-sqlite-merge §2.2, Sub-package 3c).
 *
 * Pushes deterministic single-table WHERE conjuncts, column projections, and
 * type/collation-compatible join-key `IN (?, ...)` semi-filters to per-table
 * partition fetches, ingests each table reference's fragments into its own
 * coordinator main table (`t__a`, `t__b` for self-joins) at canonical rowids,
 * and evaluates the join, residual WHERE, GROUP BY, HAVING, ORDER BY, and
 * LIMIT/OFFSET in SQLite.
 *
 * @module query/query-executor-join-execution
 */

import {
  INITIAL_PARTITION_IDS,
  getSchemaByTableName,
} from '../bootstrap/system-table-schemas-constants.js';
import {
  FANOUT_PLAN_KIND,
  assertQueryParametersBound,
  buildPrimaryKeyOrderBy,
  createParameterResolver,
  extractCatalogSchema,
  resolveExpectedOutputColumns,
} from './distributed/distributed-select-fanout-plan.js';
import {classifySingleTableStatement} from './distributed/distributed-select-fanout-soundness.js';
import {
  SEMI_FILTER_KIND,
  andCombineConjuncts,
  buildJoinKeyInFilter,
  buildJoinPushdownPlan,
  collectDistinctJoinKeyValues,
} from './distributed/join-pushdown-plan.js';
import {EXPR_TYPE} from './parser-constants.js';
import {QUERY_JOIN_PUSHDOWN} from './query-constants.js';
import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';
import {
  QUERY_RESULT_BUDGET_ERROR_CODE,
} from './query-result-budget.js';
import {
  renderSelect,
  renderSelectWithParameters,
} from './sql-statement-renderer.js';

const {
  QUERY_AST_TYPE,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  buildDistributedFailureSummary,
} = QUERY_EXECUTOR_SHARED;

function partitionBudgetShare(limit, partitionCount) {
  if (!Number.isSafeInteger(limit) || limit < 0) return null;
  return Math.floor(limit / Math.max(1, partitionCount));
}

/** Canonical outcomes for one join-table fetch decision. */
const JOIN_TABLE_FETCH_KIND = Object.freeze({
  FETCH: 'fetch',
  SKIP: 'skip',
});

const NON_EXPRESSION_AST_KEYS = new Set(['type', 'alias', 'span']);

function tableFetchAst(columns, from, where, distinct, orderBy = null) {
  return {
    type: QUERY_AST_TYPE.SELECT,
    distinct,
    columns,
    from,
    joins: [],
    where: where || null,
    groupBy: null,
    having: null,
    orderBy: orderBy || null,
    limit: null,
    ctes: null,
    setOperation: null,
  };
}

function extractSingleFragmentColumns(fragment) {
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

function collectFragmentColumnNames(fragments) {
  const list = Array.isArray(fragments) ? fragments : [];
  for (const fragment of list) {
    const cols = extractSingleFragmentColumns(fragment);
    if (cols !== null) return cols;
  }
  return [];
}

function matchesQualifiedColumnRef(node, qualifiers, includeUnqualified) {
  if (node?.type !== EXPR_TYPE.COLUMN_REF || typeof node.column !== 'string') {
    return false;
  }
  if (node.table) {
    return qualifiers.has(node.table);
  }
  return includeUnqualified;
}

function collectAstColumnsForQualifier(ast, qualifiers, includeUnqualified = false) {
  const columns = new Set();
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (matchesQualifiedColumnRef(node, qualifiers, includeUnqualified)) {
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

function buildEmptySchemaFragments(schema) {
  const cols = Array.isArray(schema?.columns) ?
    schema.columns.map((c) => c.name).filter(Boolean) : [];
  return cols.length > 0 ? [{success: true, rows: [], columns: cols}] : [];
}

function buildEdgeDeclaredColumns(ast, edgePlan, fragments, edgeSchema = null) {
  const fromFragments = collectFragmentColumnNames(fragments);
  if (fromFragments.length > 0) return fromFragments;
  if (Array.isArray(edgeSchema?.columns) && edgeSchema.columns.length > 0) {
    return edgeSchema.columns.map((c) => c.name).filter(Boolean);
  }
  if (Array.isArray(edgePlan.projection) && edgePlan.projection.length > 0) {
    return edgePlan.projection;
  }
  const qualifiers = new Set([edgePlan.ref, edgePlan.alias, edgePlan.tableName].filter(Boolean));
  return collectAstColumnsForQualifier(ast, qualifiers, false);
}

function lookupTablePlanEntry(tablePlans, key) {
  if (!tablePlans || !key) return null;
  if (tablePlans instanceof Map) {
    return tablePlans.get(key) || null;
  }
  return tablePlans[key] || null;
}

function resolvePlannedJoinEntry(tablePlans, joinTableName, joinAlias) {
  const entry = (joinAlias ? lookupTablePlanEntry(tablePlans, joinAlias) : null) ||
    lookupTablePlanEntry(tablePlans, joinTableName);
  const partitionIds = Array.isArray(entry?.partitions) ? entry.partitions : [];
  if (partitionIds.length > 0 || entry?.prunedEmpty === true) {
    return partitionIds;
  }
  return null;
}

function lookupPlannedPartitionsForTable(tablePlans, tableName, aliasName = null) {
  const byAlias = aliasName ? lookupTablePlanEntry(tablePlans, aliasName) : null;
  const entry = byAlias || lookupTablePlanEntry(tablePlans, tableName);
  return Array.isArray(entry?.partitions) ? entry.partitions : [];
}

function sumSucceededRowCount(res) {
  return Array.isArray(res?.rawRows) ?
    res.rawRows.length :
    (Array.isArray(res?.rows) ? res.rows.length : 0);
}

function sumSucceededUsage(results) {
  let usedRows = 0;
  let usedBytes = 0;
  for (const res of results) {
    if (res?.success) {
      usedRows += sumSucceededRowCount(res);
      usedBytes += Number.isSafeInteger(res.byteLength) ? res.byteLength : 0;
    }
  }
  return {usedRows, usedBytes};
}

function remainingBudgetLimit(totalLimit, usedAmount) {
  return Number.isSafeInteger(totalLimit) ? Math.max(0, totalLimit - usedAmount) : totalLimit;
}

const queryExecutorJoinExecutionMethods = {
  hasAggregates(ast) {
    const classified = classifySingleTableStatement(ast);
    return classified.aggregates.length > 0 || Boolean(ast?.having);
  },

  isPartitionCapExhaustedFailure(result) {
    if (!result || result.success === true) return false;
    const code = String(result.errorCode || result.failureCode || '');
    if (
      code === QUERY_RESULT_BUDGET_ERROR_CODE.ROWS_EXHAUSTED ||
      code === QUERY_RESULT_BUDGET_ERROR_CODE.BYTES_EXHAUSTED
    ) {
      return true;
    }
    return /query_result_(?:rows|bytes)_exhausted|Query result (?:row|byte) budget exhausted/u
      .test(String(result.error || ''));
  },

  async refetchCapExhaustedPartitions(
    results, partitionIds, sql, sqlParams, queryTimestamp, preferLeader, options, buildExecOpts,
  ) {
    if (partitionIds.length <= 1) return;
    const capIndices = [];
    for (let idx = 0; idx < results.length; idx += 1) {
      const res = results[idx];
      if (!res?.success) {
        if (!this.isPartitionCapExhaustedFailure(res)) return;
        capIndices.push(idx);
      }
    }
    if (capIndices.length === 0) return;

    let {usedRows, usedBytes} = sumSucceededUsage(results);
    for (const idx of capIndices) {
      const remRows = remainingBudgetLimit(options.resultMaxRows, usedRows);
      const remBytes = remainingBudgetLimit(options.resultMaxBytes, usedBytes);
      const [refetched] = await this.executeOnPartitions(
        [partitionIds[idx]],
        sql,
        sqlParams,
        queryTimestamp,
        true,
        preferLeader,
        options.preferSameLatencyGroup === true,
        buildExecOpts(remBytes, remRows),
      );
      results[idx] = refetched;
      if (refetched?.success) {
        usedRows += sumSucceededRowCount(refetched);
        usedBytes += Number.isSafeInteger(refetched.byteLength) ? refetched.byteLength : 0;
      }
    }
  },

  async fetchSelectPartitionResults(
    partitionIds,
    sql,
    sqlParams,
    queryTimestamp,
    tableName,
    options,
  ) {
    const resultMaxBytes = partitionBudgetShare(
      options.resultMaxBytes,
      partitionIds.length,
    );
    const resultMaxRows = partitionBudgetShare(
      options.resultMaxRows,
      partitionIds.length,
    );
    const preferLeader =
      options.preferLeader === true ||
      Boolean(tableName && INITIAL_PARTITION_IDS[tableName]);
    const buildExecOpts = (maxBytes, maxRows) => ({
      sessionId: options.sessionId,
      transactionIdentity: options.transactionIdentity,
      deliveryPriority: options.deliveryPriority,
      routingReadinessDimension: options.routingReadinessDimension,
      timeoutMs: options.timeoutMs,
      timeoutBudget: options.timeoutBudget || null,
      cancellationToken: options.cancellationToken || null,
      resultMaxBytes: maxBytes,
      resultMaxRows: maxRows,
      tableName,
      safeIntegers: true,
    });

    const results = await this.executeOnPartitions(
      partitionIds,
      sql,
      sqlParams,
      queryTimestamp,
      true,
      preferLeader,
      options.preferSameLatencyGroup === true,
      buildExecOpts(resultMaxBytes, resultMaxRows),
    );
    const fanoutMetrics = this.getLastCoordinatorMetrics();

    await this.refetchCapExhaustedPartitions(
      results,
      partitionIds,
      sql,
      sqlParams,
      queryTimestamp,
      preferLeader,
      options,
      buildExecOpts,
    );

    const failures = results.filter((result) => !result.success);
    if (failures.length > 0) {
      const failureSummary = buildDistributedFailureSummary(failures);
      return {
        ok: false,
        failureResult: {
          success: false,
          errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
          error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
          ...failureSummary,
          partitions: partitionIds,
          distributedMetrics: {
            fanout: fanoutMetrics,
            mergeDurationMs: 0,
            failedPartitionCount: failures.length,
          },
        },
      };
    }
    return {ok: true, results, fanoutMetrics};
  },

  async fetchExtraNestedBaseTables(
    ast,
    extraBaseTableNames,
    queryTimestamp,
    options,
  ) {
    const extraTables = [];
    if (!Array.isArray(extraBaseTableNames) || extraBaseTableNames.length === 0) {
      return {ok: true, extraTables};
    }
    const tablePlans = options.distributedPlan?.tablePlans || null;
    for (const extraTableName of extraBaseTableNames) {
      const extraPartitions = lookupPlannedPartitionsForTable(
        tablePlans,
        extraTableName,
      );
      const extraSchema = this.resolveJoinTableSchema(extraTableName);
      let extraResults = [];
      if (extraPartitions.length > 0) {
        const extraSql = renderSelect(
          tableFetchAst(
            [{type: EXPR_TYPE.STAR, table: null}],
            {type: EXPR_TYPE.TABLE, name: extraTableName, alias: null},
            null,
            false,
            buildPrimaryKeyOrderBy(extraSchema),
          ),
        );
        const extraFetch = await this.fetchSelectPartitionResults(
          extraPartitions,
          extraSql,
          [],
          queryTimestamp,
          extraTableName,
          options,
        );
        if (!extraFetch.ok) {
          return extraFetch;
        }
        extraResults = extraFetch.results;
      }
      extraTables.push({
        tableName: extraTableName,
        schema: extraSchema,
        fragments: extraResults,
      });
    }
    return {ok: true, extraTables};
  },

  /**
   * Resolve JOIN table partition targets from canonical distributed plan.
   * @param {Object} ast - SELECT AST.
   * @param {Object} options - Execution options.
   * @return {Map<string, string[]>} Join table/alias -> partition IDs map.
   * @private
   */
  resolveJoinPartitions(ast, options) {
    const joinPartitions = new Map();
    const tablePlans = options.distributedPlan?.tablePlans || null;
    if (!tablePlans) {
      return joinPartitions;
    }
    for (const join of ast.joins || []) {
      const joinTableName = join.table?.name;
      const joinAlias = join.table?.alias || joinTableName;
      if (!joinTableName) continue;
      const partitionIds = resolvePlannedJoinEntry(tablePlans, joinTableName, joinAlias);
      if (partitionIds !== null) {
        joinPartitions.set(joinTableName, partitionIds);
        if (joinAlias) joinPartitions.set(joinAlias, partitionIds);
      }
    }
    return joinPartitions;
  },

  /**
   * Resolve catalog or system-table schema for a joined base table.
   * @param {string} tableName
   * @return {Object|null}
   * @private
   */
  resolveJoinTableSchema(tableName) {
    if (typeof tableName !== 'string' || tableName.length === 0) {
      return null;
    }
    const fromCatalog = extractCatalogSchema(this.resolveTableInfo(tableName));
    if (fromCatalog) {
      return fromCatalog;
    }
    return extractCatalogSchema(getSchemaByTableName(tableName));
  },

  resolveEdgePartitions(edgePlan, joinPartitions, mainTableName, mainPartitionIds) {
    if (joinPartitions.has(edgePlan.ref)) return joinPartitions.get(edgePlan.ref);
    if (joinPartitions.has(edgePlan.tableName)) return joinPartitions.get(edgePlan.tableName);
    return edgePlan.tableName === mainTableName ? mainPartitionIds : [];
  },

  async fetchSingleJoinEdgeTable(
    ast,
    edgePlan,
    edgePartitions,
    mainRows,
    orderIndependent,
    queryTimestamp,
    options,
    fanoutMetrics,
  ) {
    const edgeSchema = this.resolveJoinTableSchema(edgePlan.tableName);
    let edgeResults = [];
    if (edgePartitions.length > 0) {
      const fetchPlan = this.buildJoinTableFetch(
        edgePlan,
        mainRows,
        orderIndependent,
        edgeSchema,
      );
      if (fetchPlan.kind === JOIN_TABLE_FETCH_KIND.FETCH) {
        const joinFetch = await this.fetchJoinFanoutRows(
          edgePartitions,
          fetchPlan.sql,
          fetchPlan.params,
          queryTimestamp,
          options,
          edgePlan.tableName,
          fanoutMetrics,
        );
        if (!joinFetch.ok) {
          return joinFetch;
        }
        edgeResults = joinFetch.results;
      }
    }
    return {
      ok: true,
      extraTable: {
        tableName: edgePlan.coordinatorTableName,
        schema: edgeSchema,
        declaredColumns: buildEdgeDeclaredColumns(ast, edgePlan, edgeResults, edgeSchema),
        fragments: edgeResults,
      },
    };
  },

  /**
   * Execute a cross-partition JOIN query via CoordinatorMergeSession.
   * @param {Object} ast - Parsed SELECT AST with JOINs.
   * @param {Array} mainPartitionIds - Partition IDs for main table.
   * @param {Array} params - Query parameters.
   * @param {Object} options - Execution options with distributed plan.
   * @param {Object} queryTimestamp - HLC timestamp for consistent snapshot.
   * @return {Promise<Object>} Query result.
   * @private
   */
  async executeCrossPartitionJoin(
    ast,
    mainPartitionIds,
    params = [],
    options = {},
    queryTimestamp = null,
  ) {
    assertQueryParametersBound(ast, params);
    const requestDeadlineMs = this.resolveRequestDeadlineMs(options);
    const joinPartitions = options.joinPartitions || new Map();
    const fanoutMetrics = [];
    const resolveTableSchema = (name) => this.resolveJoinTableSchema(name);
    const pushdownPlan = buildJoinPushdownPlan(ast, params, {resolveTableSchema});

    this.logger.debug(QUERY_LOG_MSG.EXECUTING_CROSS_PARTITION_JOIN, {
      mainTable: ast.from.name,
      mainPartitionCount: mainPartitionIds.length,
      joinCount: ast.joins.length,
    });

    const mainSchema = resolveTableSchema(ast.from.name);
    const mainOrderBy = pushdownPlan.orderIndependent ?
      null :
      buildPrimaryKeyOrderBy(mainSchema);
    const mainTableSql = this.buildSelectSQLWithoutJoins(
      ast,
      pushdownPlan.main.where,
      mainOrderBy,
    );
    const mainFetch = await this.fetchJoinFanoutRows(
      mainPartitionIds,
      mainTableSql,
      pushdownPlan.main.params,
      queryTimestamp,
      options,
      ast.from.name,
      fanoutMetrics,
    );
    if (!mainFetch.ok) {
      return mainFetch.failureResult;
    }

    const extraTables = [];
    const allPartitions = [...mainPartitionIds];
    for (const edgePlan of pushdownPlan.joins) {
      const edgePartitions = this.resolveEdgePartitions(
        edgePlan,
        joinPartitions,
        ast.from?.name,
        mainPartitionIds,
      );
      allPartitions.push(...edgePartitions);
      const edgeOutcome = await this.fetchSingleJoinEdgeTable(
        ast,
        edgePlan,
        edgePartitions,
        mainFetch.rows,
        pushdownPlan.orderIndependent,
        queryTimestamp,
        options,
        fanoutMetrics,
      );
      if (!edgeOutcome.ok) {
        return edgeOutcome.failureResult;
      }
      extraTables.push(edgeOutcome.extraTable);
    }

    const renderedCoordinator = renderSelectWithParameters(
      pushdownPlan.coordinatorAst,
      createParameterResolver(params),
    );
    const coordinatorPlan = {
      kind: FANOUT_PLAN_KIND.COORDINATOR_EVALUATED,
      orderIndependent: pushdownPlan.orderIndependent,
      coordinatorTableName: pushdownPlan.main.coordinatorTableName,
      coordinatorTableSchema: mainSchema,
      coordinatorSql: renderedCoordinator.sql,
      coordinatorParams: renderedCoordinator.params,
      expectedColumns: resolveExpectedOutputColumns(ast),
    };

    const mergeStartTimeMs = Date.now();
    const mergeOptions = this.buildCoordinatorMergeOptions(
      options,
      extraTables,
      requestDeadlineMs,
    );
    const aggregated = await this.mergeEngine.mergePartitionResults(
      mainFetch.results.length > 0 ? mainFetch.results : buildEmptySchemaFragments(mainSchema),
      ast,
      this,
      coordinatorPlan,
      params,
      mergeOptions,
    );
    const mergeDurationMs = Date.now() - mergeStartTimeMs;

    return {
      success: true,
      rows: aggregated.rows,
      rawRows: aggregated.rawRows,
      columns: aggregated.columns,
      rowSet: aggregated.rowSet,
      count: aggregated.rows.length,
      partitions: [...new Set(allPartitions)],
      timestamp: queryTimestamp ? queryTimestamp.toString() : null,
      distributedMetrics: {
        fanout: fanoutMetrics,
        mergeDurationMs,
        failedPartitionCount: 0,
      },
    };
  },

  /**
   * Run one JOIN-path partition fanout and normalize the outcome:
   * either the ordered partition results + concatenated rows or a canonical
   * distributed failure.
   * @param {Array} partitionIds - Target partition IDs.
   * @param {string} sql - Rendered per-partition SQL.
   * @param {Array} sqlParams - Bound parameters for the SQL.
   * @param {Object} queryTimestamp - HLC timestamp.
   * @param {Object} options - Execution options.
   * @param {string} tableName - Table being fetched.
   * @param {Array} fanoutMetrics - Accumulated fanout metrics (mutated).
   * @return {Promise<Object>} {ok: true, results, rows} or {ok: false,
   *   failureResult}.
   * @private
   */
  async fetchJoinFanoutRows(
    partitionIds,
    sql,
    sqlParams,
    queryTimestamp,
    options,
    tableName,
    fanoutMetrics,
  ) {
    if (partitionIds.length === 0) {
      return {ok: true, results: [], rows: []};
    }
    const results = await this.executeOnPartitions(
      partitionIds,
      sql,
      sqlParams,
      queryTimestamp,
      true,
      options.preferLeader || false,
      options.preferSameLatencyGroup === true,
      {
        sessionId: options.sessionId,
        transactionIdentity: options.transactionIdentity,
        deliveryPriority: options.deliveryPriority,
        routingReadinessDimension: options.routingReadinessDimension,
        timeoutMs: options.timeoutMs,
        timeoutBudget: options.timeoutBudget || null,
        resultMaxBytes: options.resultMaxBytes,
        resultMaxRows: options.resultMaxRows,
        cancellationToken: options.cancellationToken || null,
        tableName,
        safeIntegers: true,
      },
    );
    fanoutMetrics.push(this.getLastCoordinatorMetrics());
    const failures = results.filter((result) => !result.success);
    if (failures.length > 0) {
      const failureSummary = buildDistributedFailureSummary(failures);
      return {
        ok: false,
        failureResult: {
          success: false,
          errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
          error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
          ...failureSummary,
          distributedMetrics: {
            fanout: fanoutMetrics,
            mergeDurationMs: 0,
            failedPartitionCount: failures.length,
          },
        },
      };
    }
    let rows = [];
    for (const result of results) {
      if (result.success && result.rows) {
        rows = rows.concat(result.rows);
      }
    }
    return {ok: true, results, rows};
  },

  /**
   * Decide one join-table fetch: skip it when the main side is empty and the
   * join cannot preserve unmatched right rows; otherwise render the pushed
   * WHERE, projection, and — for INNER equi-joins with compatible catalog
   * type/collation and a bounded distinct key set — the join-key IN
   * semi-filter into the per-partition SQL.
   * @param {Object} edgePlan - Edge entry from the pushdown plan.
   * @param {Array} leftRows - Accumulated main-side rows.
   * @param {boolean} [orderIndependent=true]
   * @param {Object|null} [edgeSchema=null]
   * @return {Object} {kind: FETCH, sql, params} or {kind: SKIP}.
   * @private
   */
  buildJoinTableFetch(
    edgePlan,
    leftRows,
    orderIndependent = true,
    edgeSchema = null,
  ) {
    if (leftRows.length === 0 && !edgePlan.preservesRightRows) {
      return {kind: JOIN_TABLE_FETCH_KIND.SKIP};
    }
    let whereAst = edgePlan.where;
    let fetchParams = edgePlan.params;
    if (edgePlan.semiFilter.kind === SEMI_FILTER_KIND.KEY_IN) {
      const keySet = collectDistinctJoinKeyValues(
        leftRows,
        edgePlan.semiFilter,
        QUERY_JOIN_PUSHDOWN.JOIN_KEY_PUSHDOWN_MAX_VALUES,
      );
      if (!keySet.overLimit && keySet.values.length > 0) {
        const inFilter = buildJoinKeyInFilter(
          edgePlan.semiFilter,
          keySet.values.length,
        );
        whereAst = whereAst ?
          andCombineConjuncts([whereAst, inFilter]) :
          inFilter;
        fetchParams = [...edgePlan.params, ...keySet.values];
      }
    }
    const orderBy = orderIndependent ? null : buildPrimaryKeyOrderBy(edgeSchema);
    return {
      kind: JOIN_TABLE_FETCH_KIND.FETCH,
      sql: this.buildJoinTableFetchSql(edgePlan, whereAst, orderBy),
      params: fetchParams,
    };
  },

  /**
   * Render the per-partition SQL for one join-table fetch.
   * @param {Object} edgePlan - Edge entry from the pushdown plan.
   * @param {Object|null} whereAst - Combined pushed WHERE AST.
   * @param {Array|null} [orderBy=null] - Optional primary-key ORDER BY.
   * @return {string} SQL string.
   * @private
   */
  buildJoinTableFetchSql(edgePlan, whereAst, orderBy = null) {
    const columns = edgePlan.projection ?
      edgePlan.projection.map((column) => ({
        type: EXPR_TYPE.COLUMN,
        expression: {type: EXPR_TYPE.COLUMN_REF, table: null, column},
        alias: null,
      })) :
      [{type: EXPR_TYPE.STAR, table: null}];
    return renderSelect(
      tableFetchAst(
        columns,
        {name: edgePlan.tableName, alias: edgePlan.alias || null},
        whereAst,
        false,
        orderBy,
      ),
    );
  },

  /**
   * Build SELECT SQL without JOIN clauses (for fetching main table data) using
   * the pushdown plan's main-table WHERE.
   * @param {Object} ast - SELECT AST.
   * @param {Object|null} mainWhere - Pushed main-table WHERE AST.
   * @param {Array|null} [orderBy=null] - Optional primary-key ORDER BY.
   * @return {string} SQL string without JOINs.
   * @private
   */
  buildSelectSQLWithoutJoins(ast, mainWhere, orderBy = null) {
    return renderSelect(
      tableFetchAst(
        [{type: EXPR_TYPE.STAR, table: null}],
        ast.from,
        mainWhere,
        false,
        orderBy,
      ),
    );
  },
};

function installQueryExecutorJoinExecutionHelpers(target) {
  for (const [name, value] of Object.entries(
    queryExecutorJoinExecutionMethods,
  )) {
    Object.defineProperty(target.prototype, name, {
      value,
      configurable: true,
      writable: true,
    });
  }
}

export {installQueryExecutorJoinExecutionHelpers};
