import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';
import {QUERY_JOIN_PUSHDOWN} from './query-constants.js';
import {
  SEMI_FILTER_KIND,
  andCombineConjuncts,
  buildJoinKeyInFilter,
  buildJoinPushdownPlan,
  collectDistinctJoinKeyValues,
  resolveResidualConjunctForRow,
} from './distributed/join-pushdown-plan.js';
import {
  residualPredicateAdmitsRow,
} from './distributed/residual-predicate-evaluator.js';

const {
  QUERY_AST_NODE,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_EXECUTOR_LITERAL,
  QUERY_JOIN_TYPE,
  QUERY_LOG_MSG,
  QUERY_OPERATOR,
  buildDistributedFailureSummary,
} = QUERY_EXECUTOR_SHARED;

/** Canonical outcomes for one join-table fetch decision. */
const JOIN_TABLE_FETCH_KIND = Object.freeze({
  FETCH: 'fetch',
  SKIP: 'skip',
});

const queryExecutorJoinExecutionMethods = {
  /**
   * Resolve JOIN table partition targets from canonical distributed plan.
   * @param {Object} ast - SELECT AST.
   * @param {Object} options - Execution options.
   * @return {Map<string, string[]>} Join table -> partition IDs map.
   * @private
   */
  resolveJoinPartitions(ast, options) {
    const joinPartitions = new Map();
    const distributedPlan = options.distributedPlan || null;
    const tablePlans = distributedPlan?.tablePlans || null;
    if (!tablePlans) {
      return joinPartitions;
    }
    for (const join of ast.joins || []) {
      const joinTableName = join.table?.name;
      const joinAlias = join.table?.alias || joinTableName;
      if (!joinTableName) {
        continue;
      }
      let partitionIds = [];
      if (tablePlans) {
        const planned = tablePlans.get ?
          tablePlans.get(joinAlias) || tablePlans.get(joinTableName) :
          tablePlans[joinAlias] || tablePlans[joinTableName];
        if (planned?.partitions) {
          partitionIds = planned.partitions;
        }
      }
      if (partitionIds.length > 0) {
        joinPartitions.set(joinTableName, partitionIds);
      }
    }
    return joinPartitions;
  },

  /**
   * Execute a cross-partition JOIN query.
   * Requirements: 22.2, 22.3
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
    params,
    options,
    queryTimestamp,
  ) {
    const {joinPartitions} = options;
    const fanoutMetrics = [];
    const pushdownPlan = buildJoinPushdownPlan(ast, params);
    this.logger.debug(QUERY_LOG_MSG.EXECUTING_CROSS_PARTITION_JOIN, {
      mainTable: ast.from.name,
      mainPartitionCount: mainPartitionIds.length,
      joinCount: ast.joins.length,
      pushdownKind: pushdownPlan.kind,
    });

    // Fetch the main table with its pushed WHERE conjuncts, then fetch
    // each join table with pushed conjuncts, projection, and join-key
    // semi-filter before executing the in-memory JOIN edge.
    const mainTableSql = this.buildSelectSQLWithoutJoins(
      ast,
      pushdownPlan.main.where,
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

    let resultRows = mainFetch.rows;
    let leftTableRef = ast.from.alias || ast.from.name;
    for (const [edgeIndex, join] of ast.joins.entries()) {
      const edgePlan = pushdownPlan.joins[edgeIndex];
      const rightTableRef = join.table.alias || join.table.name;
      const joinTablePartitions = joinPartitions.get(join.table.name) || [];
      let joinRows = [];
      if (joinTablePartitions.length > 0) {
        const fetchPlan = this.buildJoinTableFetch(edgePlan, resultRows);
        if (fetchPlan.kind === JOIN_TABLE_FETCH_KIND.FETCH) {
          const joinFetch = await this.fetchJoinFanoutRows(
            joinTablePartitions,
            fetchPlan.sql,
            fetchPlan.params,
            queryTimestamp,
            options,
            join.table.name,
            fanoutMetrics,
          );
          if (!joinFetch.ok) {
            return joinFetch.failureResult;
          }
          joinRows = joinFetch.rows;
        }
      }
      resultRows = this.performJoin(
        resultRows,
        joinRows,
        join,
        leftTableRef,
        rightTableRef,
      );
      leftTableRef = rightTableRef;
    }
    resultRows = this.applyResidualJoinWhere(
      resultRows,
      pushdownPlan.residualConjuncts,
    );

    const mergeStartTimeMs = Date.now();
    const aggregated = this.mergeEngine.mergePartitionResults(
      [
        {
          success: true,
          rows: resultRows,
        },
      ],
      ast,
      this,
    );
    const mergeDurationMs = Date.now() - mergeStartTimeMs;
    const allPartitions = [...mainPartitionIds];
    for (const partitions of joinPartitions.values()) {
      allPartitions.push(...partitions);
    }
    return {
      success: true,
      rows: aggregated.rows,
      count: aggregated.rows.length,
      partitions: [...new Set(allPartitions)],
      timestamp: queryTimestamp.toString(),
      distributedMetrics: {
        fanout: fanoutMetrics,
        mergeDurationMs,
        failedPartitionCount: 0,
      },
    };
  },

  /**
   * Run one JOIN-path partition fanout and normalize the outcome:
   * either the concatenated rows or a canonical distributed failure.
   * @param {Array} partitionIds - Target partition IDs.
   * @param {string} sql - Rendered per-partition SQL.
   * @param {Array} sqlParams - Bound parameters for the SQL.
   * @param {Object} queryTimestamp - HLC timestamp.
   * @param {Object} options - Execution options.
   * @param {string} tableName - Table being fetched.
   * @param {Array} fanoutMetrics - Accumulated fanout metrics (mutated).
   * @return {Promise<Object>} {ok: true, rows} or {ok: false,
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
    const results = await this.executeOnPartitions(
      partitionIds,
      sql,
      sqlParams,
      queryTimestamp,
      true,
      options.preferLeader || false,
      options.preferSameLatencyGroup === true,
      {
        deliveryPriority: options.deliveryPriority,
        routingReadinessDimension: options.routingReadinessDimension,
        timeoutMs: options.timeoutMs,
        cancellationToken: options.cancellationToken || null,
        tableName,
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
    return {ok: true, rows};
  },

  /**
   * Decide one join-table fetch: skip it when the accumulated left side
   * is empty and the join cannot preserve unmatched right rows,
   * otherwise render the pushed WHERE, projection, and — for INNER
   * equi-joins with a bounded distinct key set — the join-key IN
   * semi-filter into the per-partition SQL.
   * @param {Object} edgePlan - Edge entry from the pushdown plan.
   * @param {Array} leftRows - Accumulated left-side rows.
   * @return {Object} {kind: FETCH, sql, params} or {kind: SKIP}.
   * @private
   */
  buildJoinTableFetch(edgePlan, leftRows) {
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
    return {
      kind: JOIN_TABLE_FETCH_KIND.FETCH,
      sql: this.buildJoinTableFetchSql(edgePlan, whereAst),
      params: fetchParams,
    };
  },

  /**
   * Render the per-partition SQL for one join-table fetch.
   * @param {Object} edgePlan - Edge entry from the pushdown plan.
   * @param {Object|null} whereAst - Combined pushed WHERE AST.
   * @return {string} SQL string.
   * @private
   */
  buildJoinTableFetchSql(edgePlan, whereAst) {
    const projectionSql = edgePlan.projection ?
      edgePlan.projection.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14) :
      QUERY_EXECUTOR_LITERAL.STRING_VALUE_3;
    let sql =
      `${QUERY_EXECUTOR_LITERAL.STRING_SELECT}${projectionSql}` +
      ` FROM ${edgePlan.tableName}`;
    if (edgePlan.alias) {
      sql += ` AS ${edgePlan.alias}`;
    }
    if (whereAst) {
      sql += ` WHERE ${this.buildExpressionSQL(whereAst)}`;
    }
    return sql;
  },

  /**
   * Apply the coordinator-side residual WHERE conjuncts (cross-table,
   * unknown-ownership, or OUTER-protected) after the join, matching
   * SQL's WHERE-after-join semantics.
   * @param {Array} rows - Joined rows.
   * @param {Array} residualConjuncts - Prepared residual conjuncts.
   * @return {Array} Filtered rows.
   * @private
   */
  applyResidualJoinWhere(rows, residualConjuncts) {
    if (residualConjuncts.length === 0 || rows.length === 0) {
      return rows;
    }
    const resolved = residualConjuncts.map((conjunct) =>
      resolveResidualConjunctForRow(conjunct, rows[0]),
    );
    // SQL three-valued logic: FALSE and UNKNOWN both filter the row —
    // JS-strict evaluation would keep NULL rows SQLite filters.
    return rows.filter((row) =>
      resolved.every((conjunct) => residualPredicateAdmitsRow(conjunct, row)),
    );
  },

  /**
   * Perform an in-memory JOIN between two result sets.
   * @param {Array} leftRows - Left table rows.
   * @param {Array} rightRows - Right table rows.
   * @param {Object} join - JOIN clause AST.
   * @param {string} leftTableName - Left table name.
   * @param {string} rightTableName - Right table name.
   * @return {Array} Joined rows.
   * @private
   */
  performJoin(leftRows, rightRows, join, leftTableName, rightTableName) {
    const joinType = (join.joinType || QUERY_JOIN_TYPE.INNER).toUpperCase();
    const condition = join.condition;

    const {leftColumn, rightColumn} = this.extractJoinColumns(
      condition,
      leftTableName,
      rightTableName,
    );
    if (!leftColumn || !rightColumn) {
      return this.nestedLoopJoin(
        leftRows,
        rightRows,
        condition,
        joinType,
        leftTableName,
        rightTableName,
      );
    }

    const rightIndex = new Map();
    for (const row of rightRows) {
      const key = row[rightColumn];
      if (!rightIndex.has(key)) {
        rightIndex.set(key, []);
      }
      rightIndex.get(key).push(row);
    }
    const result = [];
    const matchedRight = new Set();
    for (const leftRow of leftRows) {
      const key = leftRow[leftColumn];
      const matches = rightIndex.get(key) || [];
      if (matches.length > 0) {
        for (const rightRow of matches) {
          result.push(
            this.combineJoinRows(
              leftRow,
              rightRow,
              leftTableName,
              rightTableName,
            ),
          );
          matchedRight.add(rightRow);
        }
      } else if (
        joinType === QUERY_JOIN_TYPE.LEFT ||
        joinType === QUERY_JOIN_TYPE.LEFT_OUTER
      ) {
        const nullRight = {};
        if (rightRows.length > 0) {
          for (const col of Object.keys(rightRows[0])) {
            nullRight[col] = null;
          }
        }
        result.push(
          this.combineJoinRows(
            leftRow,
            nullRight,
            leftTableName,
            rightTableName,
          ),
        );
      }
    }

    if (
      joinType === QUERY_JOIN_TYPE.RIGHT ||
      joinType === QUERY_JOIN_TYPE.RIGHT_OUTER
    ) {
      for (const rightRow of rightRows) {
        if (!matchedRight.has(rightRow)) {
          const nullLeft = {};
          if (leftRows.length > 0) {
            for (const col of Object.keys(leftRows[0])) {
              nullLeft[col] = null;
            }
          }
          result.push(
            this.combineJoinRows(
              nullLeft,
              rightRow,
              leftTableName,
              rightTableName,
            ),
          );
        }
      }
    }
    return result;
  },

  /**
   * Extract join columns from a join condition.
   * @param {Object} condition - JOIN condition AST.
   * @param {string} leftTable - Left table name.
   * @param {string} rightTable - Right table name.
   * @return {Object} {leftColumn, rightColumn} or nulls if not extractable.
   * @private
   */
  extractJoinColumns(condition, leftTable, rightTable) {
    if (
      !condition ||
      condition.type !== QUERY_AST_NODE.BINARY ||
      condition.operator !== QUERY_OPERATOR.EQUALS
    ) {
      return {
        leftColumn: null,
        rightColumn: null,
      };
    }
    const left = condition.left;
    const right = condition.right;
    if (
      left.type !== QUERY_AST_NODE.COLUMN_REF ||
      right.type !== QUERY_AST_NODE.COLUMN_REF
    ) {
      return {
        leftColumn: null,
        rightColumn: null,
      };
    }

    let leftColumn = null;
    let rightColumn = null;
    if (left.table === leftTable || !left.table) {
      leftColumn = left.column;
    }
    if (right.table === leftTable || !right.table) {
      leftColumn = leftColumn || right.column;
    }
    if (left.table === rightTable) {
      rightColumn = left.column;
    }
    if (right.table === rightTable) {
      rightColumn = rightColumn || right.column;
    }

    if (!leftColumn && !rightColumn) {
      leftColumn = left.column;
      rightColumn = right.column;
    }
    return {
      leftColumn,
      rightColumn,
    };
  },

  /**
   * Perform a nested loop join for complex conditions.
   * @param {Array} leftRows - Left table rows.
   * @param {Array} rightRows - Right table rows.
   * @param {Object} condition - JOIN condition.
   * @param {string} joinType - JOIN type.
   * @return {Array} Joined rows.
   * @private
   */
  nestedLoopJoin(
    leftRows,
    rightRows,
    condition,
    joinType,
    leftTableRef = QUERY_EXECUTOR_LITERAL.STRING_LEFT,
    rightTableRef = QUERY_EXECUTOR_LITERAL.STRING_RIGHT,
  ) {
    const result = [];
    const matchedRight = new Set();
    for (const leftRow of leftRows) {
      let hasMatch = false;
      for (const rightRow of rightRows) {
        const combined = {
          ...leftRow,
          ...rightRow,
        };
        if (this.evaluateExpression(combined, condition)) {
          result.push(
            this.combineJoinRows(
              leftRow,
              rightRow,
              leftTableRef,
              rightTableRef,
            ),
          );
          matchedRight.add(rightRow);
          hasMatch = true;
        }
      }
      if (
        !hasMatch &&
        (joinType === QUERY_JOIN_TYPE.LEFT ||
          joinType === QUERY_JOIN_TYPE.LEFT_OUTER)
      ) {
        const nullRight = {};
        if (rightRows.length > 0) {
          for (const col of Object.keys(rightRows[0])) {
            nullRight[col] = null;
          }
        }
        result.push(
          this.combineJoinRows(leftRow, nullRight, leftTableRef, rightTableRef),
        );
      }
    }
    if (
      joinType === QUERY_JOIN_TYPE.RIGHT ||
      joinType === QUERY_JOIN_TYPE.RIGHT_OUTER
    ) {
      for (const rightRow of rightRows) {
        if (!matchedRight.has(rightRow)) {
          const nullLeft = {};
          if (leftRows.length > 0) {
            for (const col of Object.keys(leftRows[0])) {
              nullLeft[col] = null;
            }
          }
          result.push(
            this.combineJoinRows(
              nullLeft,
              rightRow,
              leftTableRef,
              rightTableRef,
            ),
          );
        }
      }
    }
    return result;
  },

  /**
   * Combine rows while preserving unqualified keys and qualified collisions.
   * @param {Object} leftRow - Left row.
   * @param {Object} rightRow - Right row.
   * @param {string} leftTableRef - Left table/alias reference.
   * @param {string} rightTableRef - Right table/alias reference.
   * @return {Object} Combined row.
   * @private
   */
  combineJoinRows(leftRow, rightRow, leftTableRef, rightTableRef) {
    const combined = {
      ...leftRow,
    };
    for (const [column, value] of Object.entries(rightRow)) {
      if (Object.prototype.hasOwnProperty.call(combined, column)) {
        const leftQualified = `${leftTableRef}.${column}`;
        const rightQualified = `${rightTableRef}.${column}`;
        if (!Object.prototype.hasOwnProperty.call(combined, leftQualified)) {
          combined[leftQualified] = leftRow[column];
        }
        combined[rightQualified] = value;
        continue;
      }
      combined[column] = value;
    }
    return combined;
  },

  /**
   * Build SELECT SQL without JOIN clauses (for fetching main table
   * data) using the pushdown plan's main-table WHERE — the conjuncts
   * that provably reference only the main table.
   * @param {Object} ast - SELECT AST.
   * @param {Object|null} mainWhere - Pushed main-table WHERE AST.
   * @return {string} SQL string without JOINs.
   * @private
   */
  buildSelectSQLWithoutJoins(ast, mainWhere) {
    let sql = QUERY_EXECUTOR_LITERAL.STRING_SELECT;
    if (ast.distinct) {
      sql += QUERY_EXECUTOR_LITERAL.STRING_DISTINCT;
    }

    sql += QUERY_EXECUTOR_LITERAL.STRING_VALUE_3;

    if (ast.from.subquery) {
      sql += ` FROM (${this.buildSelectSQL(ast.from.subquery)})`;
    } else {
      sql += ` FROM ${ast.from.name}`;
    }
    if (ast.from.alias) {
      sql += ` AS ${ast.from.alias}`;
    }

    if (mainWhere) {
      sql += ` WHERE ${this.buildExpressionSQL(mainWhere)}`;
    }
    return sql;
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
