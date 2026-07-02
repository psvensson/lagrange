import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';

const {
  DISTRIBUTED_JOIN_STRATEGY,
  NUM,
  QUERY_AST_NODE,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_EXECUTOR_LITERAL,
  QUERY_JOIN_TYPE,
  QUERY_LOG_MSG,
  QUERY_OPERATOR,
  QUERY_SQL,
  buildDistributedFailureSummary,
} = QUERY_EXECUTOR_SHARED;

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
      if (partitionIds.length > NUM.ZERO) {
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
    this.logger.debug(QUERY_LOG_MSG.EXECUTING_CROSS_PARTITION_JOIN, {
      mainTable: ast.from.name,
      mainPartitionCount: mainPartitionIds.length,
      joinCount: ast.joins.length,
    });

    // Fetch data from all tables, then execute the planned in-memory JOIN.
    const mainTableSql = this.buildSelectSQLWithoutJoins(ast);
    const mainResults = await this.executeOnPartitions(
      mainPartitionIds,
      mainTableSql,
      params,
      queryTimestamp,
      true,
      options.preferLeader || false,
      options.preferSameLatencyGroup === true,
      {
        deliveryPriority: options.deliveryPriority,
        routingReadinessDimension: options.routingReadinessDimension,
        timeoutMs: options.timeoutMs,
        cancellationToken: options.cancellationToken || null,
        tableName: ast.from.name,
      },
    );
    fanoutMetrics.push(this.getLastCoordinatorMetrics());
    const mainFailures = mainResults.filter((result) => !result.success);
    if (mainFailures.length > NUM.ZERO) {
      const failureSummary = buildDistributedFailureSummary(mainFailures);
      return {
        success: false,
        errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
        error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
        ...failureSummary,
        distributedMetrics: {
          fanout: fanoutMetrics,
          mergeDurationMs: NUM.ZERO,
          failedPartitionCount: mainFailures.length,
        },
      };
    }
    let mainRows = [];
    for (const result of mainResults) {
      if (result.success && result.rows) {
        mainRows = mainRows.concat(result.rows);
      }
    }

    const joinedData = new Map();

    for (const join of ast.joins) {
      const joinTableName = join.table.name;
      const joinTablePartitions = joinPartitions.get(joinTableName) || [];
      if (joinTablePartitions.length > NUM.ZERO) {
        const joinSql = `${QUERY_SQL.SELECT_ALL_FROM_PREFIX}${joinTableName}`;
        const joinResults = await this.executeOnPartitions(
          joinTablePartitions,
          joinSql,
          [],
          queryTimestamp,
          true,
          options.preferLeader || false,
          options.preferSameLatencyGroup === true,
          {
            deliveryPriority: options.deliveryPriority,
            routingReadinessDimension: options.routingReadinessDimension,
            timeoutMs: options.timeoutMs,
            cancellationToken: options.cancellationToken || null,
            tableName: joinTableName,
          },
        );
        fanoutMetrics.push(this.getLastCoordinatorMetrics());
        const joinFailures = joinResults.filter((result) => !result.success);
        if (joinFailures.length > NUM.ZERO) {
          const failureSummary = buildDistributedFailureSummary(joinFailures);
          return {
            success: false,
            errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
            error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
            ...failureSummary,
            distributedMetrics: {
              fanout: fanoutMetrics,
              mergeDurationMs: NUM.ZERO,
              failedPartitionCount: joinFailures.length,
            },
          };
        }
        let joinRows = [];
        for (const result of joinResults) {
          if (result.success && result.rows) {
            joinRows = joinRows.concat(result.rows);
          }
        }
        joinedData.set(joinTableName, joinRows);
      }
    }

    let resultRows = mainRows;
    let leftTableRef = ast.from.alias || ast.from.name;
    for (const join of ast.joins) {
      const joinTableName = join.table.name;
      const rightTableRef = join.table.alias || join.table.name;
      const joinRows = joinedData.get(joinTableName) || [];
      const strategy = this.resolveJoinStrategy(
        join,
        leftTableRef,
        options.distributedPlan,
      );
      resultRows = this.executeJoinByStrategy(
        resultRows,
        joinRows,
        join,
        leftTableRef,
        rightTableRef,
        strategy,
      );
      leftTableRef = rightTableRef;
    }

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
        failedPartitionCount: NUM.ZERO,
      },
    };
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
      if (matches.length > NUM.ZERO) {
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
        if (rightRows.length > NUM.ZERO) {
          for (const col of Object.keys(rightRows[NUM.ZERO])) {
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
          if (leftRows.length > NUM.ZERO) {
            for (const col of Object.keys(leftRows[NUM.ZERO])) {
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
        if (rightRows.length > NUM.ZERO) {
          for (const col of Object.keys(rightRows[NUM.ZERO])) {
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
          if (leftRows.length > NUM.ZERO) {
            for (const col of Object.keys(leftRows[NUM.ZERO])) {
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
   * Execute one JOIN edge with the selected distributed strategy.
   * @param {Object[]} leftRows - Left-side rows.
   * @param {Object[]} rightRows - Right-side rows.
   * @param {Object} join - JOIN AST node.
   * @param {string} leftTableRef - Left table/alias reference.
   * @param {string} rightTableRef - Right table/alias reference.
   * @param {string} strategy - Planner-selected join strategy.
   * @return {Object[]} Joined rows.
   * @private
   */
  executeJoinByStrategy(
    leftRows,
    rightRows,
    join,
    leftTableRef,
    rightTableRef,
    strategy,
  ) {
    switch (strategy) {
    case DISTRIBUTED_JOIN_STRATEGY.BROADCAST:
      return this.performJoin(
        leftRows,
        rightRows,
        join,
        leftTableRef,
        rightTableRef,
      );
    case DISTRIBUTED_JOIN_STRATEGY.REPARTITION:
      return this.performJoin(
        leftRows,
        rightRows,
        join,
        leftTableRef,
        rightTableRef,
      );
    case DISTRIBUTED_JOIN_STRATEGY.NESTED_LOOP:
      return this.nestedLoopJoin(
        leftRows,
        rightRows,
        join.condition,
        (join.joinType || QUERY_JOIN_TYPE.INNER).toUpperCase(),
        leftTableRef,
        rightTableRef,
      );
    default:
      return this.performJoin(
        leftRows,
        rightRows,
        join,
        leftTableRef,
        rightTableRef,
      );
    }
  },

  /**
   * Resolve strategy for one JOIN edge from distributed plan metadata.
   * @param {Object} join - JOIN AST node.
   * @param {string} leftTableRef - Left table/alias reference.
   * @param {Object|null} distributedPlan - Distributed plan object.
   * @return {string} Join strategy.
   * @private
   */
  resolveJoinStrategy(join, leftTableRef, distributedPlan) {
    const joinPlan = distributedPlan?.joinPlan || null;
    const rightTableRef = join.table?.alias || join.table?.name || null;
    if (!joinPlan || !rightTableRef) {
      return DISTRIBUTED_JOIN_STRATEGY.BROADCAST;
    }
    const edge =
      joinPlan.find(
        (entry) =>
          entry.leftAlias === leftTableRef &&
          entry.rightAlias === rightTableRef,
      ) || joinPlan.find((entry) => entry.rightAlias === rightTableRef);
    return edge?.strategy || DISTRIBUTED_JOIN_STRATEGY.BROADCAST;
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
   * Build SELECT SQL without JOIN clauses (for fetching base table data).
   * @param {Object} ast - SELECT AST.
   * @return {string} SQL string without JOINs.
   * @private
   */
  buildSelectSQLWithoutJoins(ast) {
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

    if (ast.where) {
      const mainTableWhere = this.filterWhereForTable(ast.where, ast.from.name);
      if (mainTableWhere) {
        sql += ` WHERE ${this.buildExpressionSQL(mainTableWhere)}`;
      }
    }
    return sql;
  },

  /**
   * Filter WHERE clause to only include conditions for a specific table.
   * @param {Object} where - WHERE clause AST.
   * @param {string} tableName - Table name to filter for.
   * @return {Object|null} Filtered WHERE clause or null.
   * @private
   */
  filterWhereForTable(where, _tableName) {
    if (!where) return null;
    return where;
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
