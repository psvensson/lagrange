/**
 * Query Executor - Executes queries across partitions in parallel.
 * Implements parallel query execution and result aggregation.
 * All queries route through message router using service addresses from system cache.
 * Requirements: 7.2, 7.4, 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7
 */

import {LoggingService} from '../logging/logging-service.js';
import {HLCClockService} from '../hlc/hlc-clock-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {
  COLUMN,
  ERRORS,
  LOG_MSG,
  METRICS_LOG_TAG,
  NUM,
  SQL,
  TABLES,
  SERVICE_STATUS,
  SERVICE_TYPE,
} from '../constants/index.js';
import {TRANSPORT_ERROR_MSG} from '../constants/transport.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {
  QUERY_AST_TYPE,
  QUERY_CONFIG_KEY,
  QUERY_DEFAULTS,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_JOIN_TYPE,
  QUERY_LOG_MSG,
  QUERY_MESSAGE_TYPE,
  QUERY_OPERATOR,
  QUERY_ROUTING_DIAGNOSTIC_REASON,
  QUERY_AST_NODE,
  QUERY_RESPONSE_TYPE,
  QUERY_SQL,
  QUERY_SUBSYSTEM,
} from './query-constants.js';
import {PG_EXPR_TYPE} from './pg/pg-compat-constants.js';
import {DistributedMergeEngine} from './distributed/distributed-merge-engine.js';
import {ParallelQueryCoordinator} from './distributed/parallel-query-coordinator.js';
import {DISTRIBUTED_JOIN_STRATEGY} from './distributed/distributed-query-plan-constants.js';
import {MIGRATION_PARTITION_OPERATION} from '../migration/migration-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane/control-plane-readiness-constants.js';
import {
  compactEligibilitySnapshot,
  evaluateEligibilityDecision,
} from '../control-plane/eligibility-snapshot.js';

const QUERY_MESSAGE_FIELD_SPLIT_MIRROR_ORIGIN = 'splitMirrorOrigin';
const QUERY_MESSAGE_FIELD_MIGRATION_OPERATION = 'migrationOperation';
const QUERY_MESSAGE_FIELD_MIGRATION_ID = 'migrationId';
const QUERY_MESSAGE_FIELD_SESSION_ID = 'sessionId';
const LEADER_GAP_REASON_OWNER_MISSING = 'owner_missing';
const LEADER_GAP_REASON_SERVICE_MISSING = 'service_missing';

/**
 * QueryExecutor handles parallel query execution across partitions
 * and aggregates results while preserving SQL semantics.
 * Supports distributed read-only queries with cross-partition JOINs
 * and aggregate functions (COUNT, SUM, AVG, MIN, MAX).
 * Routes ALL queries through message router - no local vs remote distinction.
 */
class QueryExecutor {
  /**
   * Create a new query executor.
   * @param {Object} options - Configuration options.
   * @param {Object} options.messageRouter - Message router for query routing.
   * @param {Object} options.systemCache - System table cache for service address lookup.
   * @param {string} options.nodeId - Node ID for HLC.
   */
  constructor(options = {}) {
    this.messageRouter = options.messageRouter || null;
    this.systemCache = options.systemCache || null;
    this.routingMetadataOverlay = options.routingMetadataOverlay || null;
    this.controlPlaneReadinessService =
      options.controlPlaneReadinessService || null;
    this.defaultRoutingReadinessDimension =
      options.defaultRoutingReadinessDimension ||
      CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE;
    this.nodeId = options.nodeId || QUERY_SUBSYSTEM.QUERY_EXECUTOR;
    this.hlcClock = new HLCClockService(this.nodeId);
    this.mergeEngine = options.mergeEngine || new DistributedMergeEngine();
    this.parallelQueryCoordinator = options.parallelQueryCoordinator ||
      new ParallelQueryCoordinator({
        systemCache: this.systemCache,
        nodeId: this.nodeId,
        partitionQueryExecutor:
          (sql, partitionId, params, coordinatorOptions = {}) =>
            this.executeOnPartition(
              partitionId,
              sql,
              params,
              coordinatorOptions.forRead === true,
              coordinatorOptions.preferLeader === true,
              coordinatorOptions.preferSameLatencyGroup === true,
              coordinatorOptions,
            ),
      });
    this.lastCoordinatorMetrics = null;
    this.logger = this.initLogger();

    // Per-partition warning throttle to prevent log floods when a
    // partition has no active service (e.g. during rebalancer lag).
    this.noServiceWarnLastAt = new Map();
    this.canonicalLeaderWarnLastAt = new Map();

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.queryTimeoutMs = config.get(QUERY_CONFIG_KEY.QUERY_TIMEOUT_MS) ||
      QUERY_DEFAULTS.QUERY_TIMEOUT_MS;
    this.leaderRetryAttempts =
      config.get(QUERY_CONFIG_KEY.LEADER_RETRY_ATTEMPTS) ||
      QUERY_DEFAULTS.LEADER_RETRY_ATTEMPTS;
    this.leaderRetryDelayMs =
      config.get(QUERY_CONFIG_KEY.LEADER_RETRY_DELAY_MS) ||
      QUERY_DEFAULTS.LEADER_RETRY_DELAY_MS;
    this.readRetryAttempts =
      config.get(QUERY_CONFIG_KEY.READ_RETRY_ATTEMPTS) ||
      QUERY_DEFAULTS.READ_RETRY_ATTEMPTS;
    this.noServiceWarnThrottleMs =
      QUERY_DEFAULTS.NO_SERVICE_WARN_THROTTLE_MS;
  }

  /**
   * Initialize logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    try {
      const loggingService = LoggingService.getInstance();
      if (loggingService.isInitialized()) {
        return loggingService.forSubsystem(QUERY_SUBSYSTEM.QUERY_EXECUTOR);
      }
    } catch (_logErr) {
      // Logging not available — fall through to console
    }
    return console;
  }

  /**
   * Set the message router for query routing.
   * @param {Object} router - Message router instance.
   */
  setMessageRouter(router) {
    this.messageRouter = router;
  }

  /**
   * Set the system cache for service address lookup.
   * @param {Object} cache - System table cache instance.
   */
  setSystemCache(cache) {
    this.systemCache = cache;
    if (this.parallelQueryCoordinator) {
      this.parallelQueryCoordinator.setSystemCache(cache);
    }
  }

  /**
   * Set optional routing metadata overlay.
   * Overlay entries are used when local cache is stale or incomplete.
   * @param {Object|null} overlay - Overlay provider.
   */
  setRoutingMetadataOverlay(overlay) {
    this.routingMetadataOverlay = overlay || null;
  }

  /**
   * Set canonical readiness owner used for serve-routing decisions.
   * @param {Object|null} readinessService
   */
  setControlPlaneReadinessService(readinessService) {
    this.controlPlaneReadinessService = readinessService || null;
  }

  /**
   * Set the default readiness dimension for routed partition work.
   * @param {string} readinessDimension
   */
  setDefaultRoutingReadinessDimension(readinessDimension) {
    this.defaultRoutingReadinessDimension =
      readinessDimension ||
      CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE;
  }

  /**
   * Execute a SELECT query across partitions in parallel.
   * Supports cross-partition queries including JOINs and aggregates.
   * Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7
   * @param {Object} ast - Parsed SELECT AST.
   * @param {Array} partitionIds - Partition IDs to query.
   * @param {Array} params - Query parameters.
   * @param {Object} options - Execution options.
   * @return {Promise<Object>} Query result.
   */
  async executeSelect(ast, partitionIds, params = [], options = {}) {
    if (partitionIds.length === NUM.ZERO) {
      return {
        success: true,
        rows: [],
        count: NUM.ZERO,
        partitions: [],
      };
    }

    // Get consistent snapshot timestamp
    const queryTimestamp = this.hlcClock.now();

    this.logger.debug(QUERY_LOG_MSG.EXECUTING_DISTRIBUTED_SELECT, {
      partitionCount: partitionIds.length,
      timestamp: queryTimestamp.toString(),
      hasJoins: (ast.joins && ast.joins.length > NUM.ZERO) || false,
      hasAggregates: this.hasAggregates(ast),
    });

    // Check if this is a cross-partition JOIN query
    if (ast.joins && ast.joins.length > NUM.ZERO) {
      const joinPartitions = this.resolveJoinPartitions(ast, options);
      if (joinPartitions.size > NUM.ZERO) {
        return this.executeCrossPartitionJoin(
          ast,
          partitionIds,
          params,
          {
            ...options,
            joinPartitions,
          },
          queryTimestamp,
        );
      }
      return {
        success: false,
        errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
        error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
        failedPartitions: [],
        partitionErrors: [{
          partitionId: null,
          error: QUERY_ERROR_MSG.MISSING_JOIN_PLAN,
        }],
        partitions: partitionIds,
      };
    }

    // Build SQL from AST
    const sql = this.buildSelectSQL(ast);

    // Execute on all partitions in parallel (read operations can go to any replica)
    const results = await this.executeOnPartitions(
      partitionIds,
      sql,
      params,
      queryTimestamp,
      true, // forRead = true for SELECT
      options.preferLeader || false,
      options.preferSameLatencyGroup === true,
      {
        deliveryPriority: options.deliveryPriority,
        timeoutMs: options.timeoutMs,
        cancellationToken:
          options.cancellationToken || null,
      },
    );
    const fanoutMetrics = this.getLastCoordinatorMetrics();

    const failedPartitions = results
      .filter((result) => !result.success)
      .map((result) => result.partitionId);
    if (failedPartitions.length > NUM.ZERO) {
      return {
        success: false,
        errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
        error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
        failedPartitions,
        partitionErrors: results
          .filter((result) => !result.success)
          .map((result) => ({
            partitionId: result.partitionId,
            error: result.error || ERRORS.QUERY_FAILED,
          })),
        partitions: partitionIds,
        distributedMetrics: {
          fanout: fanoutMetrics,
          mergeDurationMs: 0,
          failedPartitionCount: failedPartitions.length,
        },
      };
    }

    // Aggregate results
    const mergeStartTimeMs = Date.now();
    const aggregated = this.mergeEngine.mergePartitionResults(
      results,
      ast,
      this,
    );
    const mergeDurationMs = Date.now() - mergeStartTimeMs;

    try {
      this.logger.info(METRICS_LOG_TAG.SELECT_DISTRIBUTED, {
        partitionCount: partitionIds.length,
        fanoutTotalLatencyMs: fanoutMetrics?.totalLatencyMs,
        fanoutMedianLatencyMs: fanoutMetrics?.medianLatencyMs,
        mergeDurationMs,
        totalRows: aggregated.rows.length,
        stragglerCount: fanoutMetrics?.stragglers?.length ?? 0,
        speculativeExecutions:
          fanoutMetrics?.speculativeExecutions ?? 0,
      });
    } catch (_metricsErr) {
      // Metrics logging must not propagate to callers
    }

    return {
      success: true,
      rows: aggregated.rows,
      count: aggregated.rows.length,
      partitions: partitionIds,
      timestamp: queryTimestamp.toString(),
      distributedMetrics: {
        fanout: fanoutMetrics,
        mergeDurationMs,
        failedPartitionCount: 0,
      },
    };
  }

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
          (tablePlans.get(joinAlias) || tablePlans.get(joinTableName)) :
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
  }

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
  async executeCrossPartitionJoin(ast, mainPartitionIds, params, options, queryTimestamp) {
    const {joinPartitions} = options;
    const fanoutMetrics = [];

    this.logger.debug(QUERY_LOG_MSG.EXECUTING_CROSS_PARTITION_JOIN, {
      mainTable: ast.from.name,
      mainPartitionCount: mainPartitionIds.length,
      joinCount: ast.joins.length,
    });

    // Strategy: Fetch data from all tables in parallel, then perform JOIN in memory
    // This is a simple hash-join approach suitable for moderate data sizes

    // 1. Fetch main table data from all partitions
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
        timeoutMs: options.timeoutMs,
        cancellationToken:
          options.cancellationToken || null,
      },
    );
    fanoutMetrics.push(this.getLastCoordinatorMetrics());
    const mainFailures = mainResults.filter((result) => !result.success);
    if (mainFailures.length > NUM.ZERO) {
      return {
        success: false,
        errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
        error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
        failedPartitions: mainFailures.map((result) => result.partitionId),
        partitionErrors: mainFailures.map((result) => ({
          partitionId: result.partitionId,
          error: result.error || ERRORS.QUERY_FAILED,
        })),
        distributedMetrics: {
          fanout: fanoutMetrics,
          mergeDurationMs: 0,
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

    // 2. Fetch joined table data from their partitions
    const joinedData = new Map(); // tableName -> rows

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
            timeoutMs: options.timeoutMs,
            cancellationToken:
              options.cancellationToken || null,
          },
        );
        fanoutMetrics.push(this.getLastCoordinatorMetrics());
        const joinFailures = joinResults.filter((result) => !result.success);
        if (joinFailures.length > NUM.ZERO) {
          return {
            success: false,
            errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
            error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
            failedPartitions: joinFailures.map((result) => result.partitionId),
            partitionErrors: joinFailures.map((result) => ({
              partitionId: result.partitionId,
              error: result.error || ERRORS.QUERY_FAILED,
            })),
            distributedMetrics: {
              fanout: fanoutMetrics,
              mergeDurationMs: 0,
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

    // 3. Perform in-memory JOIN
    let resultRows = mainRows;
    let leftTableRef = ast.from.alias || ast.from.name;
    for (const join of ast.joins) {
      const joinTableName = join.table.name;
      const rightTableRef = join.table.alias || join.table.name;
      const joinRows = joinedData.get(joinTableName) || [];
      const strategy = this.resolveJoinStrategy(join, leftTableRef, options.distributedPlan);
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

    // 4. Apply remaining clauses (WHERE on joined data, GROUP BY, etc.)
    const mergeStartTimeMs = Date.now();
    const aggregated = this.mergeEngine.mergePartitionResults(
      [{success: true, rows: resultRows}],
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
  }

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

    // Extract join columns from condition
    const {leftColumn, rightColumn} = this.extractJoinColumns(
      condition,
      leftTableName,
      rightTableName,
    );

    if (!leftColumn || !rightColumn) {
      // Can't optimize, do nested loop join
      return this.nestedLoopJoin(
        leftRows,
        rightRows,
        condition,
        joinType,
        leftTableName,
        rightTableName,
      );
    }

    // Build hash index on right table for efficient join
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
            this.combineJoinRows(leftRow, rightRow, leftTableName, rightTableName),
          );
          matchedRight.add(rightRow);
        }
      } else if (joinType === QUERY_JOIN_TYPE.LEFT ||
        joinType === QUERY_JOIN_TYPE.LEFT_OUTER) {
        // Include left row with nulls for right columns
        const nullRight = {};
        if (rightRows.length > 0) {
          for (const col of Object.keys(rightRows[0])) {
            nullRight[col] = null;
          }
        }
        result.push(
          this.combineJoinRows(leftRow, nullRight, leftTableName, rightTableName),
        );
      }
    }

    // Handle RIGHT JOIN
    if (joinType === QUERY_JOIN_TYPE.RIGHT ||
      joinType === QUERY_JOIN_TYPE.RIGHT_OUTER) {
      for (const rightRow of rightRows) {
        if (!matchedRight.has(rightRow)) {
          const nullLeft = {};
          if (leftRows.length > 0) {
            for (const col of Object.keys(leftRows[0])) {
              nullLeft[col] = null;
            }
          }
          result.push(
            this.combineJoinRows(nullLeft, rightRow, leftTableName, rightTableName),
          );
        }
      }
    }

    return result;
  }

  /**
   * Extract join columns from a join condition.
   * @param {Object} condition - JOIN condition AST.
   * @param {string} leftTable - Left table name.
   * @param {string} rightTable - Right table name.
   * @return {Object} {leftColumn, rightColumn} or nulls if not extractable.
   * @private
   */
  extractJoinColumns(condition, leftTable, rightTable) {
    if (!condition ||
      condition.type !== QUERY_AST_NODE.BINARY ||
      condition.operator !== QUERY_OPERATOR.EQUALS) {
      return {leftColumn: null, rightColumn: null};
    }

    const left = condition.left;
    const right = condition.right;

    if (left.type !== QUERY_AST_NODE.COLUMN_REF ||
      right.type !== QUERY_AST_NODE.COLUMN_REF) {
      return {leftColumn: null, rightColumn: null};
    }

    // Determine which column belongs to which table
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

    // If tables not specified, assume left.column is from left table
    if (!leftColumn && !rightColumn) {
      leftColumn = left.column;
      rightColumn = right.column;
    }

    return {leftColumn, rightColumn};
  }

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
    leftTableRef = 'left',
    rightTableRef = 'right',
  ) {
    const result = [];
    const matchedRight = new Set();

    for (const leftRow of leftRows) {
      let hasMatch = false;

      for (const rightRow of rightRows) {
        const combined = {...leftRow, ...rightRow};
        if (this.evaluateExpression(combined, condition)) {
          result.push(
            this.combineJoinRows(leftRow, rightRow, leftTableRef, rightTableRef),
          );
          matchedRight.add(rightRow);
          hasMatch = true;
        }
      }

      if (!hasMatch && (joinType === QUERY_JOIN_TYPE.LEFT ||
        joinType === QUERY_JOIN_TYPE.LEFT_OUTER)) {
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

    if (joinType === QUERY_JOIN_TYPE.RIGHT ||
      joinType === QUERY_JOIN_TYPE.RIGHT_OUTER) {
      for (const rightRow of rightRows) {
        if (!matchedRight.has(rightRow)) {
          const nullLeft = {};
          if (leftRows.length > 0) {
            for (const col of Object.keys(leftRows[0])) {
              nullLeft[col] = null;
            }
          }
          result.push(
            this.combineJoinRows(nullLeft, rightRow, leftTableRef, rightTableRef),
          );
        }
      }
    }

    return result;
  }

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
      return this.performJoin(leftRows, rightRows, join, leftTableRef, rightTableRef);
    case DISTRIBUTED_JOIN_STRATEGY.REPARTITION:
      return this.performJoin(leftRows, rightRows, join, leftTableRef, rightTableRef);
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
      return this.performJoin(leftRows, rightRows, join, leftTableRef, rightTableRef);
    }
  }

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
    const edge = joinPlan.find((entry) =>
      entry.leftAlias === leftTableRef &&
        entry.rightAlias === rightTableRef,
    ) || joinPlan.find((entry) =>
      entry.rightAlias === rightTableRef,
    );
    return edge?.strategy || DISTRIBUTED_JOIN_STRATEGY.BROADCAST;
  }

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
    const combined = {...leftRow};
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
  }

  /**
   * Build SELECT SQL without JOIN clauses (for fetching base table data).
   * @param {Object} ast - SELECT AST.
   * @return {string} SQL string without JOINs.
   * @private
   */
  buildSelectSQLWithoutJoins(ast) {
    let sql = 'SELECT ';

    if (ast.distinct) {
      sql += 'DISTINCT ';
    }

    // For cross-partition JOINs, select all columns from main table
    sql += '*';

    // FROM
    if (ast.from.subquery) {
      sql += ` FROM (${this.buildSelectSQL(ast.from.subquery)})`;
    } else {
      sql += ` FROM ${ast.from.name}`;
    }
    if (ast.from.alias) {
      sql += ` AS ${ast.from.alias}`;
    }

    // WHERE (only conditions on main table)
    if (ast.where) {
      const mainTableWhere = this.filterWhereForTable(ast.where, ast.from.name);
      if (mainTableWhere) {
        sql += ` WHERE ${this.buildExpressionSQL(mainTableWhere)}`;
      }
    }

    return sql;
  }

  /**
   * Filter WHERE clause to only include conditions for a specific table.
   * @param {Object} where - WHERE clause AST.
   * @param {string} tableName - Table name to filter for.
   * @return {Object|null} Filtered WHERE clause or null.
   * @private
   */
  filterWhereForTable(where, _tableName) {
    if (!where) return null;

    // For simplicity, return the full WHERE clause
    // A more sophisticated implementation would filter by table
    return where;
  }

  /**
   * Execute a query on multiple partitions in parallel.
   * All queries route through message router using service addresses from system cache.
   * Requirements: 22.1, 22.4, 22.5
   * @param {Array} partitionIds - Partition IDs.
   * @param {string} sql - SQL query.
   * @param {Array} params - Query parameters.
   * @param {Object} _timestamp - HLC timestamp (unused for now).
   * @param {boolean} forRead - True when executing read-only queries.
   * @return {Promise<Array>} Array of partition results.
   * @private
   */
  async executeOnPartitions(
    partitionIds,
    sql,
    params,
    _timestamp,
    forRead = false,
    preferLeader = false,
    preferSameLatencyGroup = false,
    executionOptions = {},
  ) {
    const coordinatorResult = await this.parallelQueryCoordinator.executeParallel(
      sql,
      partitionIds,
      params,
      {
        forRead,
        preferLeader,
        preferSameLatencyGroup,
        deliveryPriority: executionOptions.deliveryPriority,
        routingReadinessDimension:
          executionOptions.routingReadinessDimension ||
          this.defaultRoutingReadinessDimension,
        splitMirrorOrigin: executionOptions.splitMirrorOrigin || null,
        timestamp: _timestamp,
        timeoutMs: executionOptions.timeoutMs,
        cancellationToken:
          executionOptions.cancellationToken || null,
      },
    );
    this.lastCoordinatorMetrics = coordinatorResult.metrics || null;
    return coordinatorResult.results;
  }

  /**
   * Return coordinator metrics for the most recent fanout execution.
   * @return {Object|null} Last coordinator metrics payload.
   */
  getLastCoordinatorMetrics() {
    return this.lastCoordinatorMetrics;
  }

  /**
   * Execute a query on a single partition.
   * Routes ALL queries through message router - no local vs remote distinction.
   * Looks up service address from system cache and delivers via message router.
   * Requirements: 22.4, 22.5
   * @param {string} partitionId - Partition ID.
   * @param {string} sql - SQL query.
   * @param {Array} params - Query parameters.
   * @return {Promise<Object>} Partition result.
   * @private
   */
  async executeOnPartition(
    partitionId,
    sql,
    params,
    forRead,
    preferLeader,
    preferSameLatencyGroup,
    executionOptions = {},
  ) {
    const cancellationToken =
      executionOptions?.cancellationToken || null;
    this.throwIfCancelled(cancellationToken);

    // Validate dependencies
    if (!this.messageRouter) {
      this.logger.error(QUERY_LOG_MSG.MESSAGE_ROUTER_UNAVAILABLE, {partitionId});
      return {
        partitionId,
        success: false,
        error: QUERY_ERROR_MSG.MESSAGE_ROUTER_UNAVAILABLE,
        rows: [],
      };
    }

    if (!this.systemCache) {
      this.logger.error(LOG_MSG.SYSTEM_CACHE_NOT_AVAILABLE, {partitionId});
      return {
        partitionId,
        success: false,
        error: ERRORS.SYSTEM_CACHE_NOT_AVAILABLE,
        rows: [],
      };
    }

    const maxAttempts = forRead ?
      this.getReadRetryAttemptLimit() :
      this.getWriteRetryAttemptLimit();
    let lastError = null;
    let awaitedRoutingRepair = false;
    const routingReadinessDimension =
      executionOptions.routingReadinessDimension ||
      this.defaultRoutingReadinessDimension;

    for (let attempt = NUM.ONE; attempt <= maxAttempts; attempt++) {
      this.throwIfCancelled(cancellationToken);
      let {
        candidates: serviceCandidates,
        routingSnapshot,
      } = this.resolvePartitionServiceCandidates(
        partitionId,
        forRead,
        preferLeader,
        preferSameLatencyGroup,
        routingReadinessDimension,
      );
      if (!awaitedRoutingRepair &&
          serviceCandidates.length === NUM.ZERO &&
          await this.maybeAwaitDeniedPartitionRoutingRepair(routingSnapshot)) {
        awaitedRoutingRepair = true;
        this.throwIfCancelled(cancellationToken);
        ({
          candidates: serviceCandidates,
          routingSnapshot,
        } = this.resolvePartitionServiceCandidates(
            partitionId,
            forRead,
            preferLeader,
            preferSameLatencyGroup,
            routingReadinessDimension,
          ));
      }
      if (serviceCandidates.length === 0) {
        const hasRoutableService = routingSnapshot.routableServiceCount >
          NUM.ZERO;
        const hasPartitionRecord = this.hasPartitionRecord(partitionId);

        if (!forRead) {
          if (hasRoutableService && attempt < maxAttempts) {
            lastError = ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE;
            await this.delay(this.leaderRetryDelayMs);
            this.throwIfCancelled(cancellationToken);
            continue;
          }
          if (!hasRoutableService &&
              hasPartitionRecord &&
              attempt < maxAttempts) {
            lastError = ERRORS.PARTITION_SERVICE_NOT_FOUND;
            await this.delay(this.leaderRetryDelayMs);
            this.throwIfCancelled(cancellationToken);
            continue;
          }
          if (hasRoutableService) {
            this.logger.warn(QUERY_LOG_MSG.NO_LEADER_SERVICE_FOR_PARTITION, {
              partitionId,
              attempts: attempt,
            });
            return {
              partitionId,
              success: false,
              error: ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE,
              rows: [],
            };
          }
          if (!hasRoutableService) {
            this.logNoServiceForPartition(partitionId, routingSnapshot);
            return {
              partitionId,
              success: false,
              error: QUERY_ERROR_MSG.PARTITION_SERVICE_NOT_FOUND,
              rows: [],
            };
          }
        } else {
          // §1.10/§1.12: Reads get bounded retries so routing
          // repair and cache convergence can discover candidates.
          if (hasPartitionRecord && attempt < maxAttempts) {
            lastError =
              QUERY_ERROR_MSG.PARTITION_SERVICE_NOT_FOUND;
            await this.delay(this.leaderRetryDelayMs);
            this.throwIfCancelled(cancellationToken);
            continue;
          }
          this.logNoServiceForPartition(
            partitionId, routingSnapshot,
          );
          return {
            partitionId,
            success: false,
            error: QUERY_ERROR_MSG.PARTITION_SERVICE_NOT_FOUND,
            rows: [],
          };
        }
      }

      for (const serviceInfo of serviceCandidates) {
        const {address} = serviceInfo;
        this.logger.debug(QUERY_LOG_MSG.ROUTING_QUERY_TO_PARTITION, {
          partitionId,
          address,
        });

        try {
          this.throwIfCancelled(cancellationToken);
          const request = {
            type: QUERY_MESSAGE_TYPE.QUERY,
            sql,
            params,
          };
          if (typeof executionOptions.sessionId === 'string' &&
              executionOptions.sessionId.length > NUM.ZERO) {
            request[QUERY_MESSAGE_FIELD_SESSION_ID] =
              executionOptions.sessionId;
          }
          if (executionOptions.splitMirrorOrigin) {
            request[QUERY_MESSAGE_FIELD_SPLIT_MIRROR_ORIGIN] =
              executionOptions.splitMirrorOrigin;
          }
          if (executionOptions.migrationOperation ===
            MIGRATION_PARTITION_OPERATION.ALTER_TABLE) {
            request[QUERY_MESSAGE_FIELD_MIGRATION_OPERATION] =
              executionOptions.migrationOperation;
            if (executionOptions.migrationId) {
              request[QUERY_MESSAGE_FIELD_MIGRATION_ID] =
                executionOptions.migrationId;
            }
          }
          const response = await this.messageRouter.deliver(
            address,
            request,
            {deliveryPriority: executionOptions.deliveryPriority},
          );
          this.throwIfCancelled(cancellationToken);

          if (response.acknowledged && response.success) {
            return {
              partitionId,
              success: true,
              rows: response.rows || [],
              changes: response.changes,
            };
          }

          // Handle leader redirect response - immediately retry with provided address
          if (response.redirect === QUERY_RESPONSE_TYPE.LEADER_REDIRECT &&
              response.leaderAddress) {
            this.logger.debug(QUERY_LOG_MSG.FOLLOWING_LEADER_REDIRECT, {
              partitionId,
              fromAddress: address,
              leaderAddress: response.leaderAddress,
            });

            const redirectResponse = await this.messageRouter.deliver(
              response.leaderAddress,
              {
                type: QUERY_MESSAGE_TYPE.QUERY,
                sql,
                params,
                [QUERY_MESSAGE_FIELD_SESSION_ID]:
                  executionOptions.sessionId || null,
                [QUERY_MESSAGE_FIELD_SPLIT_MIRROR_ORIGIN]:
                  executionOptions.splitMirrorOrigin || null,
                [QUERY_MESSAGE_FIELD_MIGRATION_OPERATION]:
                  executionOptions.migrationOperation ||
                  null,
                [QUERY_MESSAGE_FIELD_MIGRATION_ID]:
                  executionOptions.migrationId || null,
              },
              {deliveryPriority: executionOptions.deliveryPriority},
            );

            if (redirectResponse.acknowledged && redirectResponse.success) {
              return {
                partitionId,
                success: true,
                rows: redirectResponse.rows || [],
                changes: redirectResponse.changes,
              };
            }

            // Redirect target also failed - continue to next candidate
            lastError = redirectResponse.error || ERRORS.QUERY_FAILED;
            continue;
          }

          if (response.noHandler) {
            const errorMessage = response.error ||
              `${ERRORS.NO_HANDLER_FOR_ADDRESS} ${address}`;
            this.logger.warn(QUERY_LOG_MSG.NO_HANDLER_FOR_PARTITION, {
              partitionId,
              address,
            });
            lastError = errorMessage;
            if (!forRead && this.isLeaderUnavailable(errorMessage)) {
              continue;
            }
            continue;
          }

          const errorMessage = response.error || ERRORS.QUERY_FAILED;
          if (!forRead && this.isLeaderUnavailable(errorMessage)) {
            lastError = errorMessage;
            continue;
          }

          // §1.12: For reads, treat transient failures as reasons
          // to try the next candidate rather than hard-failing.
          if (forRead) {
            this.logger.debug(
              QUERY_LOG_MSG.READ_CANDIDATE_TRANSIENT_FAILURE,
              {partitionId, address},
            );
            lastError = errorMessage;
            continue;
          }

          return {
            partitionId,
            success: false,
            error: errorMessage,
            rows: [],
          };
        } catch (error) {
          if (!forRead && this.isLeaderUnavailable(error.message)) {
            lastError = error.message;
            continue;
          }

          // §1.12: For reads, catch transient transport errors
          // and try the next candidate.
          if (forRead) {
            this.logger.debug(
              QUERY_LOG_MSG.READ_CANDIDATE_TRANSIENT_FAILURE,
              {partitionId, address, error: error.message},
            );
            lastError = error.message;
            continue;
          }

          this.logger.error(QUERY_LOG_MSG.QUERY_ROUTING_FAILED, {
            partitionId,
            address,
            error: error.message,
          });
          throw error;
        }
      }

      if (attempt < maxAttempts) {
        await this.delay(this.leaderRetryDelayMs);
        this.throwIfCancelled(cancellationToken);
      }
    }

    return {
      partitionId,
      success: false,
      error: lastError || ERRORS.QUERY_FAILED,
      rows: [],
    };
  }

  /**
   * Get write retry attempt limit for transient leader-election gaps.
   * @return {number} Maximum attempts.
   * @private
   */
  getWriteRetryAttemptLimit() {
    const maxRecoveryAttempts = NUM.TEN * NUM.FOUR;
    const retryDelayMs =
      Math.max(this.leaderRetryDelayMs || NUM.ZERO, NUM.ONE);
    const timeoutBoundAttempts =
      Math.ceil(this.queryTimeoutMs / retryDelayMs);
    const boundedAttempts =
      Math.min(timeoutBoundAttempts, maxRecoveryAttempts);
    return Math.max(this.leaderRetryAttempts, boundedAttempts);
  }

  /**
   * Get read retry attempt limit for transient topology gaps.
   * §1.10/§1.12: Reads get bounded retries so transient failures
   * during topology transitions (splits, rebalance) can be
   * recovered by trying the next candidate or waiting for routing
   * repair.
   * @return {number} Maximum attempts.
   * @private
   */
  getReadRetryAttemptLimit() {
    return this.readRetryAttempts;
  }

  /**
   * Check if an error indicates missing partition leadership.
   * @param {string} errorMessage - Error message.
   * @return {boolean} True if leader is unavailable.
   * @private
   */
  isLeaderUnavailable(errorMessage) {
    return errorMessage &&
      (
        errorMessage.includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE) ||
        errorMessage.includes(TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT) ||
        errorMessage.includes(ERRORS.NO_HANDLER_FOR_ADDRESS) ||
        errorMessage.includes('No connection to node') ||
        errorMessage.includes('Failed to forward write to leader')
      );
  }

  /**
   * Delay helper for retry backoff.
   * @param {number} delayMs - Delay duration in ms.
   * @return {Promise<void>}
   * @private
   */
  async delay(delayMs) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  /**
   * Throw when cooperative cancellation has been requested.
   * @param {Object|null} cancellationToken
   * @private
   */
  throwIfCancelled(cancellationToken) {
    if (!cancellationToken ||
      typeof cancellationToken.throwIfCancelled !== 'function') {
      return;
    }
    cancellationToken.throwIfCancelled();
  }

  /**
   * Get partition service candidates in preferred order.
   * @param {string} partitionId - Partition ID.
   * @param {boolean} forRead - True when executing read-only queries.
   * @return {Array<Object>} Ordered list of service info objects.
   * @private
   */
  getPartitionServiceCandidates(
    partitionId,
    forRead = false,
    preferLeader = false,
    preferSameLatencyGroup = false,
    routingReadinessDimension = this.defaultRoutingReadinessDimension,
  ) {
    return this.resolvePartitionServiceCandidates(
      partitionId,
      forRead,
      preferLeader,
      preferSameLatencyGroup,
      routingReadinessDimension,
    ).candidates;
  }

  /**
   * Resolve ordered candidates together with the routing snapshot used to build
   * them so request paths can reuse the same owner evidence for retries.
   * @param {string} partitionId
   * @param {boolean} forRead
   * @param {boolean} preferLeader
   * @param {boolean} preferSameLatencyGroup
   * @param {string} routingReadinessDimension
   * @return {{candidates: Array<Object>, routingSnapshot: Object}}
   * @private
   */
  resolvePartitionServiceCandidates(
    partitionId,
    forRead = false,
    preferLeader = false,
    preferSameLatencyGroup = false,
    routingReadinessDimension = this.defaultRoutingReadinessDimension,
  ) {
    const prioritizeLeader = preferLeader || !forRead;
    const routingSnapshot = this.getPartitionRoutingSnapshot(
      partitionId,
      routingReadinessDimension,
    );
    const services = routingSnapshot.routableServices;

    if (services.length === 0) {
      this.logPartitionRoutingDenial(routingSnapshot);
      return {
        candidates: [],
        routingSnapshot,
      };
    }

    const localGroupId = this.resolveNodeLatencyGroupId(this.nodeId);
    const orderedServices = this.orderServicesByLatencyGroup(
      services,
      localGroupId,
      forRead && preferSameLatencyGroup,
    );
    const canonicalLeaderNodeId = routingSnapshot.canonicalLeaderNodeId;
    const bootstrapLeaderServices = !forRead && !canonicalLeaderNodeId ?
      this.getFreshBootstrapLeaderServices(partitionId, orderedServices) :
      [];
    const candidates = [];
    const seen = new Set();
    const addService = (service) => {
      if (!service) {
        return;
      }
      const key = service.service_id || service.replica_id || service.address;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      candidates.push({
        address: service.address,
        nodeId: service.node_id,
        replicaId: service.service_id || service.replica_id,
      });
    };

    const canonicalLeaderServices = canonicalLeaderNodeId ?
      orderedServices.filter((service) => service.node_id === canonicalLeaderNodeId) :
      [];

    if (!forRead) {
      if (!canonicalLeaderNodeId) {
        if (bootstrapLeaderServices.length > NUM.ZERO) {
          bootstrapLeaderServices.forEach(addService);
          return {
            candidates,
            routingSnapshot,
          };
        }
        this.logCanonicalLeaderRoutingGap(partitionId, {
          reason: LEADER_GAP_REASON_OWNER_MISSING,
          services: orderedServices,
          routingSnapshot,
        });
        return {
          candidates: [],
          routingSnapshot,
        };
      }
      if (canonicalLeaderServices.length === NUM.ZERO) {
        this.logCanonicalLeaderRoutingGap(partitionId, {
          reason: LEADER_GAP_REASON_SERVICE_MISSING,
          canonicalLeaderNodeId,
          services: orderedServices,
          routingSnapshot,
        });
        return {
          candidates: [],
          routingSnapshot,
        };
      }
      canonicalLeaderServices.forEach(addService);
      return {
        candidates,
        routingSnapshot,
      };
    }

    if (prioritizeLeader) {
      if (canonicalLeaderNodeId) {
        canonicalLeaderServices.forEach(addService);
      }
      orderedServices
        .filter((service) => service.node_id === this.nodeId)
        .forEach(addService);
    }

    orderedServices.forEach(addService);

    return {
      candidates,
      routingSnapshot,
    };
  }

  /**
   * Build one owner-style snapshot for partition routing diagnostics.
   * @param {string} partitionId
   * @param {string} [routingReadinessDimension]
   * @return {Object}
   */
  getPartitionRoutingSnapshot(
    partitionId,
    routingReadinessDimension = this.defaultRoutingReadinessDimension,
  ) {
    const serviceRows = this.getPartitionServiceRows(partitionId);
    const canonicalLeaderNodeId = this.getPartitionLeaderNodeId(partitionId);
    const evaluatedServices = serviceRows.map((service) => ({
      service,
      routing: this.evaluatePartitionServiceRoutability(
        service,
        routingReadinessDimension,
      ),
    }));
    const activeAddressedServices = evaluatedServices
      .filter((entry) => {
        return entry.routing.reasonCode !==
            QUERY_ROUTING_DIAGNOSTIC_REASON.SERVICE_INACTIVE &&
          entry.routing.reasonCode !==
            QUERY_ROUTING_DIAGNOSTIC_REASON.SERVICE_ADDRESS_MISSING;
      })
      .map((entry) => entry.service);
    const routableServices = evaluatedServices
      .filter((entry) => entry.routing.routable === true)
      .map((entry) => entry.service);
    const canonicalLeaderServiceCount = canonicalLeaderNodeId ?
      serviceRows.filter((service) => service?.node_id === canonicalLeaderNodeId)
        .length :
      NUM.ZERO;

    return Object.freeze({
      partitionId,
      routingReadinessDimension,
      reasonCode: this.resolvePartitionRoutingReasonCode(
        serviceRows,
        activeAddressedServices,
        routableServices,
      ),
      canonicalLeaderNodeId,
      leaderKnown: canonicalLeaderNodeId !== null,
      serviceRowCount: serviceRows.length,
      activeAddressedServiceCount: activeAddressedServices.length,
      routableServiceCount: routableServices.length,
      canonicalLeaderServiceCount,
      serviceRows: Object.freeze([...serviceRows]),
      routableServices: Object.freeze([...routableServices]),
      deniedByNodeId: this.buildRoutingDeniedNodeSummary(
        evaluatedServices,
        routingReadinessDimension,
      ),
    });
  }

  /**
   * Resolve node latency-group assignment from system cache.
   * @param {string} nodeId - Node ID.
   * @return {string|null}
   * @private
   */
  resolveNodeLatencyGroupId(nodeId) {
    if (!nodeId || typeof this.systemCache?.get !== 'function') {
      return null;
    }
    const nodeRow = this.systemCache.get(TABLES.NODES, nodeId);
    return nodeRow?.[COLUMN.LATENCY_GROUP_ID] || null;
  }

  /**
   * Sort services to prefer same-group replicas for read queries.
   * @param {Object[]} services - Routable services.
   * @param {string|null} localGroupId - Local node's latency group.
   * @param {boolean} enabled - Preference enabled flag.
   * @return {Object[]}
   * @private
   */
  orderServicesByLatencyGroup(services, localGroupId, enabled) {
    if (!enabled || !localGroupId || typeof this.systemCache?.get !== 'function') {
      return services;
    }
    return [...services].sort((left, right) => {
      const leftGroupId = this.resolveNodeLatencyGroupId(left?.node_id);
      const rightGroupId = this.resolveNodeLatencyGroupId(right?.node_id);
      const leftPreferred = leftGroupId === localGroupId;
      const rightPreferred = rightGroupId === localGroupId;
      if (leftPreferred && !rightPreferred) {
        return NUM.NEGATIVE_ONE;
      }
      if (!leftPreferred && rightPreferred) {
        return NUM.ONE;
      }
      return NUM.ZERO;
    });
  }

  /**
   * Resolve partition service rows from cache and overlay metadata.
   * @param {string} partitionId - Partition ID.
   * @return {Array<Object>} Partition service rows.
   * @private
   */
  getPartitionServiceRows(partitionId) {
    const overlayServices = this.getOverlayPartitionServices(partitionId);
    const hasOverlayServices = overlayServices.length > 0;

    if (!this.systemCache && !hasOverlayServices) {
      this.logger.warn(
        LOG_MSG.SYSTEM_CACHE_PARTITION_LOOKUP_UNAVAILABLE,
        {partitionId},
      );
      return [];
    }

    if (!hasOverlayServices && typeof this.systemCache?.filter !== 'function') {
      this.logger.warn(
        QUERY_LOG_MSG.SYSTEM_CACHE_FILTER_UNSUPPORTED,
        {partitionId},
      );
      return [];
    }

    const services = [];

    if (this.systemCache && typeof this.systemCache.filter === 'function') {
      const cacheRows = this.systemCache.filter(TABLES.SERVICES, (service) =>
        service.partition_id === partitionId &&
        service.service_type === SERVICE_TYPE.PARTITION,
      ) || [];
      services.push(...cacheRows);
    }

    const overlayRows = this.getOverlayPartitionServices(partitionId)
      .filter((service) =>
        service.partition_id === partitionId &&
        service.service_type === SERVICE_TYPE.PARTITION,
      );
    services.push(...overlayRows);

    if (services.length === 0) {
      return [];
    }

    const deduped = [];
    const seen = new Set();
    for (const service of services) {
      const dedupeKey = service.service_id || service.replica_id || service.address;
      if (!dedupeKey || seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      deduped.push(service);
    }

    return deduped;
  }

  /**
   * Resolve one typed routing reason from the partition service snapshot.
   * @param {Object[]} serviceRows
   * @param {Object[]} activeAddressedServices
   * @param {Object[]} routableServices
   * @return {string}
   * @private
   */
  resolvePartitionRoutingReasonCode(
    serviceRows,
    activeAddressedServices,
    routableServices,
  ) {
    if (serviceRows.length === NUM.ZERO) {
      return QUERY_ROUTING_DIAGNOSTIC_REASON.NO_SERVICE_ROWS;
    }
    if (activeAddressedServices.length === NUM.ZERO) {
      return QUERY_ROUTING_DIAGNOSTIC_REASON.NO_ACTIVE_ADDRESSED_SERVICES;
    }
    if (routableServices.length === NUM.ZERO) {
      return QUERY_ROUTING_DIAGNOSTIC_REASON
        .ALL_SERVICES_FILTERED_BY_READINESS;
    }
    return QUERY_ROUTING_DIAGNOSTIC_REASON.OK;
  }

  /**
   * Build per-node denial summaries for one routing snapshot.
   * @param {Array<Object>} evaluatedServices
   * @param {string} routingReadinessDimension
   * @return {Object}
   * @private
   */
  buildRoutingDeniedNodeSummary(
    evaluatedServices,
    routingReadinessDimension,
  ) {
    const deniedByNodeId = {};

    for (const entry of Array.isArray(evaluatedServices) ? evaluatedServices : []) {
      const service = entry?.service || null;
      const routing = entry?.routing || null;
      const nodeId = String(service?.node_id || service?.nodeId || '');
      if (!nodeId ||
          !routing ||
          routing.routable === true ||
          !routing.readinessSummary) {
        continue;
      }

      const existing = deniedByNodeId[nodeId] || {
        decisionDimension: routingReadinessDimension,
        observedAt: routing.readinessSummary.observedAt || null,
        lifecycleState: routing.readinessSummary.lifecycleState || null,
        reasonCodes: [],
        failedDimensions: [],
      };
      for (const reasonCode of routing.readinessSummary.reasonCodes) {
        if (!existing.reasonCodes.includes(reasonCode)) {
          existing.reasonCodes.push(reasonCode);
        }
      }
      for (const failedDimension of routing.readinessSummary.failedDimensions) {
        if (!existing.failedDimensions.includes(failedDimension)) {
          existing.failedDimensions.push(failedDimension);
        }
      }
      deniedByNodeId[nodeId] = existing;
    }

    return Object.freeze(deniedByNodeId);
  }

  /**
   * Build a compact routing snapshot summary suitable for logs.
   * @param {Object|null} routingSnapshot
   * @return {Object|null}
   * @private
   */
  summarizePartitionRoutingSnapshot(routingSnapshot) {
    if (!routingSnapshot || typeof routingSnapshot !== 'object') {
      return null;
    }
    return {
      reasonCode: routingSnapshot.reasonCode || null,
      routingReadinessDimension:
        routingSnapshot.routingReadinessDimension || null,
      serviceRowCount: Number(routingSnapshot.serviceRowCount || NUM.ZERO),
      activeAddressedServiceCount: Number(
        routingSnapshot.activeAddressedServiceCount || NUM.ZERO,
      ),
      routableServiceCount: Number(
        routingSnapshot.routableServiceCount || NUM.ZERO,
      ),
      canonicalLeaderServiceCount: Number(
        routingSnapshot.canonicalLeaderServiceCount || NUM.ZERO,
      ),
      leaderKnown: routingSnapshot.leaderKnown === true,
      canonicalLeaderNodeId: routingSnapshot.canonicalLeaderNodeId || null,
      deniedByNodeId: routingSnapshot.deniedByNodeId || {},
    };
  }

  /**
   * Emit typed diagnostics when partition routing has no usable candidates.
   * @param {Object|null} routingSnapshot
   * @private
   */
  logPartitionRoutingDenial(routingSnapshot) {
    const reasonCode = String(
      routingSnapshot?.reasonCode ||
      QUERY_ROUTING_DIAGNOSTIC_REASON.NO_SERVICE_ROWS,
    );
    const warnKey = String(routingSnapshot?.partitionId || '') + ':' + reasonCode;
    const now = Date.now();
    const lastWarnAt = this.noServiceWarnLastAt.get(warnKey);
    if (Number.isFinite(lastWarnAt) &&
        now - lastWarnAt < this.noServiceWarnThrottleMs) {
      return;
    }
    this.noServiceWarnLastAt.set(warnKey, now);
    const message = reasonCode === QUERY_ROUTING_DIAGNOSTIC_REASON
      .ALL_SERVICES_FILTERED_BY_READINESS ?
      QUERY_LOG_MSG.PARTITION_ROUTING_CANDIDATES_FILTERED :
      QUERY_LOG_MSG.NO_ACTIVE_SERVICE_FOR_PARTITION;
    this.logger.warn(message, {
      partitionId: routingSnapshot?.partitionId || null,
      routingSnapshot: this.summarizePartitionRoutingSnapshot(
        routingSnapshot,
      ),
    });
  }

  /**
   * Await one authoritative readiness repair when routing denial indicates the
   * local cache filtered all active candidates based on stale node evidence.
   * @param {Object|null} routingSnapshot
   * @return {Promise<boolean>}
   * @private
   */
  async maybeAwaitDeniedPartitionRoutingRepair(routingSnapshot) {
    if (!routingSnapshot ||
        !this.controlPlaneReadinessService ||
        typeof this.controlPlaneReadinessService.getNodeReadiness !==
          'function') {
      return false;
    }

    const deniedNodeIds = routingSnapshot.reasonCode ===
      QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS &&
      routingSnapshot.activeAddressedServiceCount > NUM.ZERO ?
      Object.keys(routingSnapshot.deniedByNodeId || {}) :
      [];
    const repairNodeIds = new Set(deniedNodeIds);
    if (this.shouldRepairCanonicalLeaderServiceGap(routingSnapshot)) {
      repairNodeIds.add(routingSnapshot.canonicalLeaderNodeId);
    }
    if (repairNodeIds.size === NUM.ZERO) {
      return false;
    }

    await Promise.all([...repairNodeIds].map(async (nodeId) => {
      try {
        await this.controlPlaneReadinessService.getNodeReadiness(
          nodeId,
          {
            allowAuthoritativeRefresh: true,
            requireFreshOnIneligible: true,
            decisionDimension: routingSnapshot.routingReadinessDimension,
          },
        );
      } catch (_error) {
        return null;
      }
      return null;
    }));
    return true;
  }

  /**
   * Return true when authoritative node/service repair should refresh the
   * canonical leader node because its service rows are missing locally while
   * peer replicas remain visible.
   * @param {Object|null} routingSnapshot
   * @return {boolean}
   * @private
   */
  shouldRepairCanonicalLeaderServiceGap(routingSnapshot) {
    return Boolean(
      routingSnapshot &&
      routingSnapshot.leaderKnown === true &&
      typeof routingSnapshot.canonicalLeaderNodeId === 'string' &&
      routingSnapshot.canonicalLeaderNodeId.length > NUM.ZERO &&
      Number(routingSnapshot.canonicalLeaderServiceCount) === NUM.ZERO &&
      Number(routingSnapshot.activeAddressedServiceCount) > NUM.ZERO,
    );
  }

  /**
   * Emit the generic no-service warning only when typed routing diagnostics did
   * not already capture a more specific readiness-filtered denial.
   * @param {string} partitionId
   * @param {Object|null} routingSnapshot
   * @private
   */
  logNoServiceForPartition(partitionId, routingSnapshot = null) {
    if (routingSnapshot?.reasonCode ===
        QUERY_ROUTING_DIAGNOSTIC_REASON
          .ALL_SERVICES_FILTERED_BY_READINESS) {
      return;
    }
    const now = Date.now();
    const lastAt = this.noServiceWarnLastAt.get(partitionId);
    if (Number.isFinite(lastAt) &&
        now - lastAt < this.noServiceWarnThrottleMs) {
      return;
    }
    this.noServiceWarnLastAt.set(partitionId, now);
    this.logger.warn(
      QUERY_LOG_MSG.NO_SERVICE_FOR_PARTITION,
      {partitionId},
    );
  }

  /**
   * Get write-routable partition services from system cache.
   * @param {string} partitionId - Partition ID.
   * @return {Array<Object>} Routable services for the partition.
   * @private
   */
  getRoutablePartitionServices(
    partitionId,
    routingReadinessDimension = this.defaultRoutingReadinessDimension,
  ) {
    return this.getPartitionRoutingSnapshot(
      partitionId,
      routingReadinessDimension,
    ).routableServices;
  }

  /**
   * Check whether a partition has write-routable services in the system cache.
   * @param {string} partitionId - Partition ID.
   * @return {boolean} True when routable services exist.
   * @private
   */
  hasRoutablePartitionService(
    partitionId,
    routingReadinessDimension = this.defaultRoutingReadinessDimension,
  ) {
    return this.getPartitionRoutingSnapshot(
      partitionId,
      routingReadinessDimension,
    ).routableServiceCount > NUM.ZERO;
  }

  /**
   * Check whether partition metadata exists in the cache.
   * @param {string} partitionId - Partition ID.
   * @return {boolean} True when partition metadata exists.
   * @private
   */
  hasPartitionRecord(partitionId) {
    if (this.systemCache) {
      if (typeof this.systemCache.has === 'function') {
        if (this.systemCache.has(TABLES.PARTITIONS, partitionId)) {
          return true;
        }
      } else if (typeof this.systemCache.get === 'function') {
        if (Boolean(this.systemCache.get(TABLES.PARTITIONS, partitionId))) {
          return true;
        }
      } else if (typeof this.systemCache.filter === 'function') {
        if (this.systemCache.filter(TABLES.PARTITIONS, (partition) =>
          partition.partition_id === partitionId,
        ).length > NUM.ZERO) {
          return true;
        }
      }
    }

    return this.getOverlayPartitionRecord(partitionId) !== null;
  }

  /**
   * Find partition leader address from system cache.
   * Queries the services table in the cache for the partition leader.
   * Returns the leader address for routing write queries.
   * Handles missing leader gracefully by returning null.
   * Requirements: 5.2
   * @param {string} partitionId - Partition ID.
   * @return {string|null} Leader address or null if not found.
   */
  findPartitionLeaderAddress(partitionId) {
    const service = this.findPartitionService(partitionId);
    if (!service || typeof service.address !== 'string' || service.address.length === 0) {
      this.logger.debug(QUERY_LOG_MSG.NO_LEADER_SERVICE_FOR_PARTITION, {partitionId});
      return null;
    }

    return service.address;
  }

  /**
   * Find partition service information from system cache.
   * Returns the service address for routing queries.
   * Uses ONLY the system cache - no fallbacks.
   * @param {string} partitionId - Partition ID.
   * @return {Object|null} {address, nodeId, replicaId} or null if not found.
   * @private
   */
  findPartitionService(partitionId, forRead = false) {
    const candidates = this.getPartitionServiceCandidates(partitionId, forRead);
    return candidates[0] || null;
  }

  /**
   * Determine whether a service row is routable.
   * @param {Object} service - Service row.
   * @return {boolean} True when row can be used for routing.
   * @private
   */
  isRoutablePartitionService(
    service,
    routingReadinessDimension = this.defaultRoutingReadinessDimension,
  ) {
    return this.evaluatePartitionServiceRoutability(
      service,
      routingReadinessDimension,
    ).routable === true;
  }

  /**
   * Evaluate one partition service row against the canonical readiness owner.
   * @param {Object} service
   * @param {string} routingReadinessDimension
   * @return {Object}
   * @private
   */
  evaluatePartitionServiceRoutability(
    service,
    routingReadinessDimension = this.defaultRoutingReadinessDimension,
  ) {
    if (service.status !== SERVICE_STATUS.ACTIVE) {
      return {
        routable: false,
        reasonCode: QUERY_ROUTING_DIAGNOSTIC_REASON.SERVICE_INACTIVE,
        readinessSummary: null,
      };
    }
    if (typeof service.address !== 'string' ||
        service.address.length === NUM.ZERO) {
      return {
        routable: false,
        reasonCode: QUERY_ROUTING_DIAGNOSTIC_REASON.SERVICE_ADDRESS_MISSING,
        readinessSummary: null,
      };
    }

    const nodeId = service?.node_id || service?.nodeId || null;
    if (!nodeId ||
        !this.controlPlaneReadinessService ||
        typeof this.controlPlaneReadinessService.getNodeReadinessSync !==
          'function') {
      return {
        routable: true,
        reasonCode: QUERY_ROUTING_DIAGNOSTIC_REASON.OK,
        readinessSummary: null,
      };
    }

    const readiness =
      this.controlPlaneReadinessService.getNodeReadinessSync(
        nodeId,
        {
          allowAuthoritativeRefresh: true,
          requireFreshOnIneligible: true,
          decisionDimension: routingReadinessDimension,
        },
      );
    if (!readiness || !readiness.dimensions) {
      return {
        routable: false,
        reasonCode: QUERY_ROUTING_DIAGNOSTIC_REASON.READINESS_UNAVAILABLE,
        readinessSummary: null,
      };
    }

    const decision = evaluateEligibilityDecision(
      readiness,
      routingReadinessDimension,
    );
    const compactSnapshot = compactEligibilitySnapshot(
      readiness,
      routingReadinessDimension,
    );
    const bootstrapGraceRoutable =
      decision.eligible !== true &&
      this.shouldAllowFreshBootstrapRoutingGrace(
        service,
        readiness,
        decision,
      );

    return {
      routable: decision.eligible === true || bootstrapGraceRoutable,
      reasonCode: decision.eligible === true || bootstrapGraceRoutable ?
        QUERY_ROUTING_DIAGNOSTIC_REASON.OK :
        QUERY_ROUTING_DIAGNOSTIC_REASON.NODE_NOT_ELIGIBLE,
      readinessSummary: compactSnapshot ? {
        decisionDimension: compactSnapshot.decisionDimension ||
          routingReadinessDimension,
        observedAt: compactSnapshot.observedAt || null,
        lifecycleState: compactSnapshot.lifecycleState || null,
        reasonCodes: compactSnapshot.reasonCodes || Object.freeze([]),
        failedDimensions: decision.failedDimensions || Object.freeze([]),
      } : null,
    };
  }

  /**
   * Admit one fresh bootstrap partition service when cache heartbeat
   * publication lags but transport and service evidence remain positive.
   * This grace stays bounded to the initial creation window where
   * `leader_node_id` has not converged yet.
   * @param {Object} service
   * @param {Object|null} readiness
   * @param {Object|null} decision
   * @return {boolean}
   * @private
   */
  shouldAllowFreshBootstrapRoutingGrace(service, readiness, decision) {
    const partitionId = String(
      service?.partition_id ||
      service?.partitionId ||
      '',
    );
    if (partitionId.length === NUM.ZERO) {
      return false;
    }

    const partition = this.getPartitionRecord(partitionId);
    if (!this.isBootstrapRoutingGraceWindow(partition)) {
      return false;
    }

    const dimensions = readiness?.dimensions;
    const nodeEvidence = readiness?.nodeEvidence;
    if (!dimensions ||
        typeof dimensions !== 'object' ||
        !nodeEvidence ||
        typeof nodeEvidence !== 'object') {
      return false;
    }

    if (dimensions[CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE] !== true ||
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY] !== true ||
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY] !== true ||
        dimensions[
          CONTROL_PLANE_READINESS_DIMENSION
            .METADATA_PUBLICATION_HEALTHY
        ] !== true ||
        nodeEvidence.transportConnected !== true ||
        nodeEvidence.readyWhenWritten !== true) {
      return false;
    }

    const allowedFailedDimensions = new Set([
      CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE,
      CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
      CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
      CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE,
    ]);
    const failedDimensions = Array.isArray(decision?.failedDimensions) ?
      decision.failedDimensions :
      [];
    return failedDimensions.length > NUM.ZERO &&
      failedDimensions.every((dimension) =>
        allowedFailedDimensions.has(dimension),
      );
  }

  /**
   * Resolve overlay partition row by ID.
   * @param {string} partitionId - Partition ID.
   * @return {Object|null} Overlay partition row.
   * @private
   */
  getOverlayPartitionRecord(partitionId) {
    const overlay = this.routingMetadataOverlay;
    if (!overlay || typeof overlay.getPartitionById !== 'function') {
      return null;
    }
    const partition = overlay.getPartitionById(partitionId);
    return partition && typeof partition === 'object' ? partition : null;
  }

  /**
   * Resolve the canonical partition record for routing decisions.
   * Overlay metadata outranks cache metadata while transition routing is active.
   * @param {string} partitionId - Partition ID.
   * @return {Object|null}
   * @private
   */
  getPartitionRecord(partitionId) {
    const overlayPartition = this.getOverlayPartitionRecord(partitionId);
    if (overlayPartition) {
      return overlayPartition;
    }
    if (!this.systemCache) {
      return null;
    }
    if (typeof this.systemCache.get === 'function') {
      const record = this.systemCache.get(TABLES.PARTITIONS, partitionId);
      if (record) {
        return record;
      }
    }
    if (typeof this.systemCache.filter === 'function') {
      const records = this.systemCache.filter(TABLES.PARTITIONS, (partition) =>
        partition.partition_id === partitionId,
      );
      if (records.length > NUM.ZERO) {
        return records[NUM.ZERO];
      }
    }
    if (typeof this.systemCache.getAll === 'function') {
      const records = this.systemCache.getAll(TABLES.PARTITIONS) || [];
      return records.find((partition) => partition.partition_id === partitionId) || null;
    }
    return null;
  }

  /**
   * Resolve the canonical leader node for one partition from owner metadata.
   * @param {string} partitionId - Partition ID.
   * @return {string|null}
   * @private
   */
  getPartitionLeaderNodeId(partitionId) {
    const partition = this.getPartitionRecord(partitionId);
    const leaderNodeId = partition?.[COLUMN.LEADER_NODE_ID] ?? partition?.leaderNodeId ?? null;
    return typeof leaderNodeId === 'string' && leaderNodeId.length > NUM.ZERO ?
      leaderNodeId :
      null;
  }

  /**
   * Resolve a bootstrap-only leader fallback while the partition owner row is
   * still in its fresh-creation window and leader_node_id has not converged.
   * Steady-state writes still fail closed when canonical owner metadata is
   * absent or ambiguous.
   * @param {string} partitionId
   * @param {Object[]} services
   * @return {Object[]}
   * @private
   */
  getFreshBootstrapLeaderServices(partitionId, services) {
    const partition = this.getPartitionRecord(partitionId);
    if (!this.isFreshPartitionBootstrapWindow(partition)) {
      return [];
    }

    const leaderServices = services.filter((service) =>
      String(service?.raft_role || '').toLowerCase() ===
        String(RAFT_ROLE.LEADER).toLowerCase(),
    );
    if (leaderServices.length === NUM.ONE) {
      return leaderServices;
    }

    return services.length === NUM.ONE ? [services[NUM.ZERO]] : [];
  }

  /**
   * Identify the narrow bootstrap window where a partition has been created
   * but the canonical leader_node_id has not yet been persisted.
   * @param {Object|null} partition
   * @return {boolean}
   * @private
   */
  isFreshPartitionBootstrapWindow(partition) {
    if (!partition || !this.isBootstrapRoutingGraceWindow(partition)) {
      return false;
    }
    const leaderNodeId =
      partition?.[COLUMN.LEADER_NODE_ID] ??
      partition?.leader_node_id ??
      partition?.leaderNodeId ??
      null;
    return typeof leaderNodeId !== 'string' || leaderNodeId.length === NUM.ZERO;
  }

  /**
   * Identify the short-lived partition bootstrap grace window before the
   * partition owner row is updated post-creation.
   * @param {Object|null} partition
   * @return {boolean}
   * @private
   */
  isBootstrapRoutingGraceWindow(partition) {
    if (!partition) {
      return false;
    }
    const createdAt =
      partition?.[COLUMN.CREATED_AT] ??
      partition?.created_at ??
      partition?.createdAt ??
      null;
    const updatedAt =
      partition?.[COLUMN.UPDATED_AT] ??
      partition?.updated_at ??
      partition?.updatedAt ??
      null;
    return Number.isFinite(createdAt) &&
      Number.isFinite(updatedAt) &&
      createdAt === updatedAt;
  }

  /**
   * Emit throttled diagnostics when canonical partition leader routing cannot
   * map owner metadata to a routable service.
   * @param {string} partitionId
   * @param {Object} options
   * @private
   */
  logCanonicalLeaderRoutingGap(partitionId, options = {}) {
    const reason = String(options.reason || LEADER_GAP_REASON_OWNER_MISSING);
    const warnKey = partitionId + ':' + reason;
    const now = Date.now();
    const lastWarnAt = this.canonicalLeaderWarnLastAt.get(warnKey);
    if (Number.isFinite(lastWarnAt) &&
        now - lastWarnAt < this.noServiceWarnThrottleMs) {
      return;
    }
    this.canonicalLeaderWarnLastAt.set(warnKey, now);
    const services = Array.isArray(options.services) ? options.services : [];
    const routableNodeIds = [...new Set(services
      .map((service) => service?.node_id)
      .filter((nodeId) => typeof nodeId === 'string' && nodeId.length > NUM.ZERO))];
    const staleLeaderNodeIds = [...new Set(services
      .filter((service) => service?.raft_role === RAFT_ROLE.LEADER)
      .map((service) => service?.node_id)
      .filter((nodeId) => typeof nodeId === 'string' && nodeId.length > NUM.ZERO))];

    if (reason === LEADER_GAP_REASON_SERVICE_MISSING) {
      this.logger.warn(
        QUERY_LOG_MSG.CANONICAL_LEADER_SERVICE_MISSING_FOR_PARTITION,
        {
          partitionId,
          leaderNodeId: options.canonicalLeaderNodeId || null,
          routableNodeIds,
          staleLeaderNodeIds,
          routingSnapshot: this.summarizePartitionRoutingSnapshot(
            options.routingSnapshot,
          ),
        },
      );
      return;
    }

    this.logger.warn(
      QUERY_LOG_MSG.CANONICAL_LEADER_METADATA_MISSING_FOR_PARTITION,
      {
        partitionId,
        routableNodeIds,
        staleLeaderNodeIds,
        routingSnapshot: this.summarizePartitionRoutingSnapshot(
          options.routingSnapshot,
        ),
      },
    );
  }

  /**
   * Resolve overlay services for a partition.
   * @param {string} partitionId - Partition ID.
   * @return {Array<Object>} Overlay service rows.
   * @private
   */
  getOverlayPartitionServices(partitionId) {
    const overlay = this.routingMetadataOverlay;
    if (!overlay || typeof overlay.getServicesForPartition !== 'function') {
      return [];
    }
    const services = overlay.getServicesForPartition(partitionId);
    return Array.isArray(services) ? services : [];
  }

  /**
   * Aggregate SELECT results from multiple partitions.
   * Properly handles cross-partition aggregation for COUNT, SUM, AVG, MIN, MAX.
   * Requirements: 22.3, 22.6, 22.7
   * @param {Array} results - Partition results.
   * @param {Object} ast - Parsed SELECT AST.
   * @return {Object} Aggregated result.
   * @private
   */
  aggregateSelectResults(results, ast) {
    // Combine rows from all partitions
    let rows = [];
    for (const result of results) {
      if (result.success && result.rows) {
        rows = rows.concat(result.rows);
      }
    }

    // Handle DISTINCT
    if (ast.distinct) {
      rows = this.applyDistinct(rows);
    }

    // Handle GROUP BY with aggregates
    if (ast.groupBy) {
      rows = this.applyGroupBy(rows, ast);
    } else if (this.hasAggregates(ast)) {
      // Aggregates without GROUP BY - aggregate across all partitions
      rows = this.applyAggregates(rows, ast);
    }

    // Handle HAVING
    if (ast.having) {
      rows = this.applyHaving(rows, ast.having);
    }

    // Handle ORDER BY
    if (ast.orderBy) {
      rows = this.applyOrderBy(rows, ast.orderBy);
    }

    // Handle LIMIT/OFFSET
    if (ast.limit) {
      rows = this.applyLimit(rows, ast.limit);
    }

    return {rows};
  }

  /**
   * Aggregate results from multiple partitions for cross-partition queries.
   * This method handles partial aggregates that need to be combined.
   * Requirements: 22.3, 22.7
   * @param {Array} partitionResults - Results from each partition.
   * @param {Object} ast - Parsed SELECT AST.
   * @return {Object} Combined aggregated result.
   */
  aggregateCrossPartitionResults(partitionResults, ast) {
    // For queries with aggregates, we need to combine partial results
    if (!this.hasAggregates(ast)) {
      return this.aggregateSelectResults(partitionResults, ast);
    }

    // Collect all rows first
    let allRows = [];
    for (const result of partitionResults) {
      if (result.success && result.rows) {
        allRows = allRows.concat(result.rows);
      }
    }

    // Re-compute aggregates on combined data
    if (ast.groupBy) {
      return {rows: this.applyGroupBy(allRows, ast)};
    } else {
      return {rows: this.applyAggregates(allRows, ast)};
    }
  }

  /**
   * Apply DISTINCT to rows.
   * @param {Array} rows - Input rows.
   * @return {Array} Distinct rows.
   * @private
   */
  applyDistinct(rows) {
    const seen = new Set();
    return rows.filter((row) => {
      const key = JSON.stringify(row);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Check if AST has aggregate functions.
   * @param {Object} ast - SELECT AST.
   * @return {boolean} True if has aggregates.
   * @private
   */
  hasAggregates(ast) {
    return ast.columns.some((col) =>
      col.expression?.type === 'aggregate' ||
      col.type === 'aggregate',
    );
  }

  /**
   * Apply GROUP BY to rows.
   * @param {Array} rows - Input rows.
   * @param {Object} ast - SELECT AST.
   * @return {Array} Grouped rows.
   * @private
   */
  applyGroupBy(rows, ast) {
    const groups = new Map();
    const groupByColumns = ast.groupBy.map((g) =>
      g.column || g.expression?.column || g,
    );

    // Group rows
    for (const row of rows) {
      const key = groupByColumns.map((col) => row[col]).join('|');
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(row);
    }

    // Apply aggregates to each group
    const result = [];
    for (const groupRows of groups.values()) {
      const aggregatedRow = this.computeGroupAggregates(groupRows, ast);
      result.push(aggregatedRow);
    }

    return result;
  }

  /**
   * Compute aggregates for a group of rows.
   * @param {Array} rows - Group rows.
   * @param {Object} ast - SELECT AST.
   * @return {Object} Aggregated row.
   * @private
   */
  computeGroupAggregates(rows, ast) {
    const result = {};

    // Copy group by columns from first row
    if (ast.groupBy && rows.length > 0) {
      for (const g of ast.groupBy) {
        const col = g.column || g.expression?.column || g;
        result[col] = rows[0][col];
      }
    }

    // Compute aggregates
    for (const col of ast.columns) {
      const expr = col.expression || col;
      if (expr.type === 'aggregate') {
        const alias = col.alias || `${expr.function}(${this.getArgName(expr)})`;
        result[alias] = this.computeAggregate(rows, expr);
      } else if (expr.type === 'column_ref') {
        const colName = expr.column;
        if (rows.length > 0) {
          result[colName] = rows[0][colName];
        }
      }
    }

    return result;
  }

  /**
   * Get argument name for aggregate function.
   * @param {Object} expr - Aggregate expression.
   * @return {string} Argument name.
   * @private
   */
  getArgName(expr) {
    if (expr.argument?.type === 'star') return '*';
    if (expr.argument?.type === 'column_ref') return expr.argument.column;
    return '?';
  }

  /**
   * Apply aggregates without GROUP BY.
   * @param {Array} rows - Input rows.
   * @param {Object} ast - SELECT AST.
   * @return {Array} Single aggregated row.
   * @private
   */
  applyAggregates(rows, ast) {
    const result = {};

    for (const col of ast.columns) {
      const expr = col.expression || col;
      if (expr.type === 'aggregate') {
        const alias = col.alias || `${expr.function}(${this.getArgName(expr)})`;
        result[alias] = this.computeAggregate(rows, expr);
      }
    }

    return [result];
  }

  /**
   * Compute a single aggregate value across all rows.
   * Supports COUNT, SUM, AVG, MIN, MAX for cross-partition aggregation.
   * Requirements: 22.7
   * @param {Array} rows - Input rows.
   * @param {Object} expr - Aggregate expression.
   * @return {*} Aggregate value.
   * @private
   */
  computeAggregate(rows, expr) {
    const func = expr.function.toUpperCase();
    const arg = expr.argument;
    const colName = arg?.type === 'column_ref' ? arg.column : null;

    let values = rows;
    if (colName) {
      values = rows.map((r) => r[colName]).filter((v) => v !== null && v !== undefined);
    }

    if (expr.distinct && colName) {
      values = [...new Set(values)];
    }

    switch (func) {
    case 'COUNT':
      // COUNT(*) counts all rows, COUNT(column) counts non-null values
      if (arg?.type === 'star') {
        return rows.length;
      }
      return values.length;

    case 'SUM':
      // SUM aggregates numeric values across all partitions
      return values.reduce((sum, v) => sum + (Number(v) || 0), 0);

    case 'AVG': {
      // AVG must be computed on combined data, not averaged averages
      if (values.length === 0) return null;
      const avgSum = values.reduce((s, v) => s + (Number(v) || 0), 0);
      return avgSum / values.length;
    }

    case 'MIN':
      // MIN finds the minimum across all partitions
      if (values.length === 0) return null;
      return values.reduce((min, v) => v < min ? v : min, values[0]);

    case 'MAX':
      // MAX finds the maximum across all partitions
      if (values.length === 0) return null;
      return values.reduce((max, v) => v > max ? v : max, values[0]);

    default:
      return null;
    }
  }

  /**
   * Apply HAVING clause to grouped rows.
   * @param {Array} rows - Grouped rows.
   * @param {Object} having - HAVING clause AST.
   * @return {Array} Filtered rows.
   * @private
   */
  applyHaving(rows, having) {
    return rows.filter((row) => this.evaluateExpression(row, having));
  }

  /**
   * Evaluate an expression against a row.
   * @param {Object} row - Data row.
   * @param {Object} expr - Expression AST.
   * @return {*} Expression value.
   * @private
   */
  evaluateExpression(row, expr) {
    if (!expr) return true;

    switch (expr.type) {
    case 'binary':
      return this.evaluateBinary(row, expr);
    case 'unary':
      return this.evaluateUnary(row, expr);
    case 'in':
      return this.evaluateIn(row, expr);
    case 'between':
      return this.evaluateBetween(row, expr);
    case 'like':
      return this.evaluateLike(row, expr);
    case 'literal':
      return expr.value;
    case 'column_ref':
      return row[expr.column];
    case 'aggregate': {
      // For HAVING, aggregate values should already be computed
      const alias = `${expr.function}(${this.getArgName(expr)})`;
      return row[alias];
    }
    default:
      return true;
    }
  }

  /**
   * Evaluate a binary expression.
   * @param {Object} row - Data row.
   * @param {Object} expr - Binary expression.
   * @return {boolean} Expression result.
   * @private
   */
  evaluateBinary(row, expr) {
    const left = this.evaluateExpression(row, expr.left);
    const right = this.evaluateExpression(row, expr.right);

    switch (expr.operator) {
    case 'AND': return left && right;
    case 'OR': return left || right;
    case '=': return left === right;
    case '!=':
    case '<>': return left !== right;
    case '<': return left < right;
    case '<=': return left <= right;
    case '>': return left > right;
    case '>=': return left >= right;
    case 'IS NULL': return left === null || left === undefined;
    case 'IS NOT NULL': return left !== null && left !== undefined;
    default: return true;
    }
  }

  /**
   * Evaluate a unary expression.
   * @param {Object} row - Data row.
   * @param {Object} expr - Unary expression.
   * @return {*} Expression result.
   * @private
   */
  evaluateUnary(row, expr) {
    const operand = this.evaluateExpression(row, expr.operand);

    switch (expr.operator) {
    case 'NOT': return !operand;
    case '+': return +operand;
    case '-': return -operand;
    default: return operand;
    }
  }

  /**
   * Evaluate an IN/NOT IN expression.
   * @param {Object} row - Data row.
   * @param {Object} expr - IN expression AST.
   * @return {boolean} Expression result.
   * @private
   */
  evaluateIn(row, expr) {
    const value = this.evaluateExpression(row, expr.expression);
    const set = expr.values.map((v) => this.evaluateExpression(row, v));
    const matches = set.some((candidate) => candidate === value);
    return expr.negated ? !matches : matches;
  }

  /**
   * Evaluate a BETWEEN expression.
   * @param {Object} row - Data row.
   * @param {Object} expr - BETWEEN expression AST.
   * @return {boolean} Expression result.
   * @private
   */
  evaluateBetween(row, expr) {
    const value = this.evaluateExpression(row, expr.expression);
    const low = this.evaluateExpression(row, expr.low);
    const high = this.evaluateExpression(row, expr.high);
    return value >= low && value <= high;
  }

  /**
   * Evaluate a LIKE/NOT LIKE expression.
   * @param {Object} row - Data row.
   * @param {Object} expr - LIKE expression AST.
   * @return {boolean} Expression result.
   * @private
   */
  evaluateLike(row, expr) {
    const value = this.evaluateExpression(row, expr.expression);
    const pattern = this.evaluateExpression(row, expr.pattern);
    if (value === null || value === undefined || pattern === null || pattern === undefined) {
      return false;
    }

    const regex = this.buildLikeRegex(String(pattern));
    const matches = regex.test(String(value));
    return expr.negated ? !matches : matches;
  }

  /**
   * Build regex for SQL LIKE semantics.
   * @param {string} pattern - SQL LIKE pattern.
   * @return {RegExp} Regex matcher.
   * @private
   */
  buildLikeRegex(pattern) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regexPattern = escaped.replace(/%/g, '.*').replace(/_/g, '.');
    return new RegExp(`^${regexPattern}$`);
  }

  /**
   * Apply ORDER BY to rows.
   * @param {Array} rows - Input rows.
   * @param {Array} orderBy - ORDER BY clauses.
   * @return {Array} Sorted rows.
   * @private
   */
  applyOrderBy(rows, orderBy) {
    return [...rows].sort((a, b) => {
      for (const clause of orderBy) {
        const col = clause.expression?.column || clause.column;
        const dir = clause.direction === 'DESC' ? -1 : 1;

        const aVal = a[col];
        const bVal = b[col];

        if (aVal === bVal) continue;
        if (aVal === null) return dir;
        if (bVal === null) return -dir;

        if (typeof aVal === 'string' && typeof bVal === 'string') {
          const cmp = aVal.localeCompare(bVal);
          if (cmp !== 0) return cmp * dir;
        } else {
          if (aVal < bVal) return -dir;
          if (aVal > bVal) return dir;
        }
      }
      return 0;
    });
  }

  /**
   * Apply LIMIT and OFFSET to rows.
   * @param {Array} rows - Input rows.
   * @param {Object} limit - LIMIT clause.
   * @return {Array} Limited rows.
   * @private
   */
  applyLimit(rows, limit) {
    const offset = Number.isInteger(limit.offset) ?
      Math.max(limit.offset, NUM.ZERO) :
      NUM.ZERO;
    if (!Number.isInteger(limit.count)) {
      return rows.slice(offset);
    }
    const count = Math.max(limit.count, NUM.ZERO);
    return rows.slice(offset, offset + count);
  }

  /**
   * Build SQL string from SELECT AST.
   * @param {Object} ast - SELECT AST.
   * @return {string} SQL string.
   * @private
   */
  buildSelectSQL(ast) {
    let sql = 'SELECT ';

    if (ast.distinct) {
      sql += 'DISTINCT ';
    }

    // Columns
    const cols = ast.columns.map((col) => this.buildColumnSQL(col));
    sql += cols.join(', ');

    // FROM
    if (ast.from.subquery) {
      sql += ` FROM (${this.buildSelectSQL(ast.from.subquery)})`;
    } else {
      sql += ` FROM ${ast.from.name}`;
    }
    if (ast.from.alias) {
      sql += ` AS ${ast.from.alias}`;
    }

    // JOINs
    for (const join of ast.joins || []) {
      if (join.table.subquery) {
        sql += ` ${join.joinType} JOIN` +
          ` (${this.buildSelectSQL(join.table.subquery)})`;
      } else {
        sql += ` ${join.joinType} JOIN ${join.table.name}`;
      }
      if (join.table.alias) {
        sql += ` AS ${join.table.alias}`;
      }
      sql += ` ON ${this.buildExpressionSQL(join.condition)}`;
    }

    // WHERE
    if (ast.where) {
      sql += ` WHERE ${this.buildExpressionSQL(ast.where)}`;
    }

    // GROUP BY
    if (ast.groupBy) {
      const groups = ast.groupBy.map((g) => this.buildExpressionSQL(g));
      sql += ` GROUP BY ${groups.join(', ')}`;
    }

    // HAVING
    if (ast.having) {
      sql += ` HAVING ${this.buildExpressionSQL(ast.having)}`;
    }

    // ORDER BY
    if (ast.orderBy) {
      const orders = ast.orderBy.map((o) =>
        `${this.buildExpressionSQL(o.expression)} ${o.direction}`,
      );
      sql += ` ORDER BY ${orders.join(', ')}`;
    }

    // LIMIT
    if (ast.limit) {
      sql += ` LIMIT ${ast.limit.count}`;
      if (ast.limit.offset) {
        sql += ` OFFSET ${ast.limit.offset}`;
      }
    }

    // Set operations (UNION, UNION ALL, INTERSECT, EXCEPT)
    if (ast.setOperation) {
      sql += ` ${ast.setOperation.type}` +
        ` ${this.buildSelectSQL(ast.setOperation.right)}`;
    }

    // CTE prefix
    if (ast.ctes && ast.ctes.length > 0) {
      const recursive = ast.recursive ? 'RECURSIVE ' : '';
      const cteDefs = ast.ctes.map((c) =>
        `${c.name} AS (${this.buildSelectSQL(c.query)})`,
      );
      sql = `WITH ${recursive}${cteDefs.join(', ')} ` + sql;
    }

    return sql;
  }

  /**
   * Build SQL for a column.
   * @param {Object} col - Column AST.
   * @return {string} Column SQL.
   * @private
   */
  buildColumnSQL(col) {
    if (col.type === 'star') return '*';

    let sql = this.buildExpressionSQL(col.expression || col);
    if (col.alias) {
      sql += ` AS ${col.alias}`;
    }
    return sql;
  }

  /**
   * Build SQL for an expression.
   * @param {Object} expr - Expression AST.
   * @return {string} Expression SQL.
   * @private
   */
  buildExpressionSQL(expr) {
    if (!expr) return '';

    switch (expr.type) {
    case 'star':
      return '*';

    case 'literal':
      if (expr.value === null) return 'NULL';
      if (typeof expr.value === 'string') return `'${expr.value}'`;
      return String(expr.value);

    case 'column_ref':
      if (expr.table) return `${expr.table}.${expr.column}`;
      return expr.column;

    case 'binary':
      if (expr.operator === 'IS NULL' || expr.operator === 'IS NOT NULL') {
        return `(${this.buildExpressionSQL(expr.left)} ${expr.operator})`;
      }
      return `(${this.buildExpressionSQL(expr.left)} ` +
             `${expr.operator} ${this.buildExpressionSQL(expr.right)})`;

    case 'unary':
      return `${expr.operator} ${this.buildExpressionSQL(expr.operand)}`;

    case 'aggregate': {
      const aggArg = this.buildExpressionSQL(expr.argument);
      const aggDistinct = expr.distinct ? 'DISTINCT ' : '';
      return `${expr.function}(${aggDistinct}${aggArg})`;
    }

    case 'in': {
      const inVals = expr.values.map((v) => this.buildExpressionSQL(v));
      const operator = expr.negated ? 'NOT IN' : 'IN';
      return `${this.buildExpressionSQL(expr.expression)} ${operator} (${inVals.join(', ')})`;
    }

    case 'between':
      return `${this.buildExpressionSQL(expr.expression)} BETWEEN ` +
             `${this.buildExpressionSQL(expr.low)} AND ` +
             `${this.buildExpressionSQL(expr.high)}`;

    case 'like':
      return `${this.buildExpressionSQL(expr.expression)} ${expr.negated ? 'NOT LIKE' : 'LIKE'} ` +
             `${this.buildExpressionSQL(expr.pattern)}`;

    case 'parameter':
      return '?';

    case PG_EXPR_TYPE.CAST:
      return `CAST(${this.buildExpressionSQL(expr.expression)} AS ${expr.affinity})`;

    case PG_EXPR_TYPE.CASE:
      return this.buildCaseSQL(expr);

    case PG_EXPR_TYPE.SUBQUERY:
      return `(${this.buildSelectSQL(expr.query)})`;

    case PG_EXPR_TYPE.EXISTS:
      return `EXISTS (${this.buildSelectSQL(expr.query)})`;

    case PG_EXPR_TYPE.FUNCTION_CALL: {
      const fnArgs = expr.args.map((a) => this.buildExpressionSQL(a));
      return `${expr.name}(${fnArgs.join(', ')})`;
    }

    default:
      return '';
    }
  }

  /**
   * Build SQL for a CASE WHEN expression.
   * Handles both searched CASE (CASE WHEN ...) and simple CASE (CASE expr WHEN ...).
   * @param {Object} expr - CASE AST node.
   * @return {string} Reconstructed CASE SQL.
   */
  buildCaseSQL(expr) {
    let sql = 'CASE';
    if (expr.operand) {
      sql += ' ' + this.buildExpressionSQL(expr.operand);
    }
    for (const cond of expr.conditions) {
      sql += ' WHEN ' + this.buildExpressionSQL(cond.when);
      sql += ' THEN ' + this.buildExpressionSQL(cond.then);
    }
    if (expr.elseExpr) {
      sql += ' ELSE ' + this.buildExpressionSQL(expr.elseExpr);
    }
    sql += ' END';
    return sql;
  }

  /**
   * Execute an INSERT statement.
   * Routes ALL queries through message router - no local vs remote distinction.
   * @param {Object} ast - Parsed INSERT AST.
   * @param {string} partitionId - Target partition ID.
   * @param {Array} params - Query parameters.
   * @return {Promise<Object>} Insert result.
   */
  async executeInsert(ast, partitionId, params = [], executionOptions = {}) {
    const sql = this.buildInsertSQL(ast);

    this.logger.debug('Executing INSERT', {
      table: ast.table,
      partitionId,
      rowCount: ast.values.length,
    });

    // Route through message router like all other operations
    const result = await this.executeOnPartition(
      partitionId,
      sql,
      params,
      false,
      false,
      false,
      executionOptions,
    );

    if (!result.success) {
      throw new Error(result.error || `Insert failed on partition: ${partitionId}`);
    }

    return {
      success: true,
      operation: 'INSERT',
      affectedRows: result.changes || ast.values.length,
      rows: Array.isArray(result.rows) ? result.rows : [],
      partitions: [partitionId],
    };
  }

  /**
   * Append RETURNING clause to a SQL string when present in the AST.
   * @param {string} sql - SQL string to append to.
   * @param {string[]|string|null} returning - RETURNING clause info.
   * @return {string} SQL string with RETURNING appended if applicable.
   * @private
   */
  appendReturning(sql, returning) {
    if (!returning) {
      return sql;
    }
    const cols = returning === '*' ?
      '*' :
      returning.join(', ');
    return `${sql} ${SQL.RETURNING} ${cols}`;
  }

  /**
   * Build SQL for INSERT statement.
   * @param {Object} ast - INSERT AST.
   * @return {string} SQL string.
   * @private
   */
  buildInsertSQL(ast) {
    let sql;
    if (ast.orReplace) {
      sql = `${SQL.INSERT_OR_REPLACE_INTO} `;
    } else if (ast.orIgnore) {
      sql = `${SQL.INSERT_OR_IGNORE_INTO} `;
    } else {
      sql = `${SQL.INSERT_INTO} `;
    }
    sql += ast.table;

    if (ast.columns) {
      sql += ` (${ast.columns.join(', ')})`;
    }

    sql += ` ${SQL.VALUES} `;

    const rows = ast.values.map((row) => {
      const vals = row.map((v) => this.buildExpressionSQL(v));
      return `(${vals.join(', ')})`;
    });

    sql += rows.join(', ');

    return this.appendReturning(sql, ast.returning);
  }

  /**
   * Execute an UPDATE statement.
   * @param {Object} ast - Parsed UPDATE AST.
   * @param {Array} partitionIds - Target partition IDs.
   * @param {Array} params - Query parameters.
   * @return {Promise<Object>} Update result.
   */
  async executeUpdate(
    ast,
    partitionIds,
    params = [],
    executionOptions = {},
  ) {
    const sql = this.buildUpdateSQL(ast);

    this.logger.debug('Executing UPDATE', {
      table: ast.table,
      partitionCount: partitionIds.length,
    });

    const results = await this.executeOnPartitions(
      partitionIds,
      sql,
      params,
      this.hlcClock.now(),
      false,
      false,
      false,
      executionOptions,
    );
    const fanoutMetrics = this.getLastCoordinatorMetrics();

    const failedResults = results.filter((result) => !result.success);
    const totalChanges = results.reduce(
      (sum, result) => sum + (result.success ? (result.changes || 0) : 0),
      0,
    );
    const returningRows = [];
    for (const result of results) {
      if (result.success && Array.isArray(result.rows) && result.rows.length > NUM.ZERO) {
        returningRows.push(...result.rows);
      }
    }

    if (failedResults.length > NUM.ZERO) {
      return {
        success: false,
        operation: QUERY_AST_TYPE.UPDATE,
        affectedRows: totalChanges,
        partitions: partitionIds,
        failedPartitions: failedResults.map((result) => result.partitionId),
        partitionErrors: failedResults.map((result) => ({
          partitionId: result.partitionId,
          error: result.error || ERRORS.QUERY_FAILED,
        })),
        errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
        error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
        rows: returningRows,
        distributedMetrics: {
          fanout: fanoutMetrics,
          failedPartitionCount: failedResults.length,
        },
      };
    }

    return {
      success: true,
      operation: QUERY_AST_TYPE.UPDATE,
      affectedRows: totalChanges,
      partitions: partitionIds,
      rows: returningRows,
      distributedMetrics: {
        fanout: fanoutMetrics,
        failedPartitionCount: 0,
      },
    };
  }

  /**
   * Build SQL for UPDATE statement.
   * @param {Object} ast - UPDATE AST.
   * @return {string} SQL string.
   * @private
   */
  buildUpdateSQL(ast) {
    let sql = `UPDATE ${ast.table} SET `;

    const sets = ast.assignments.map((a) =>
      `${a.column} = ${this.buildExpressionSQL(a.value)}`,
    );
    sql += sets.join(', ');

    if (ast.where) {
      sql += ` WHERE ${this.buildExpressionSQL(ast.where)}`;
    }

    return this.appendReturning(sql, ast.returning);
  }

  /**
   * Execute a DELETE statement.
   * @param {Object} ast - Parsed DELETE AST.
   * @param {Array} partitionIds - Target partition IDs.
   * @param {Array} params - Query parameters.
   * @return {Promise<Object>} Delete result.
   */
  async executeDelete(
    ast,
    partitionIds,
    params = [],
    executionOptions = {},
  ) {
    const sql = this.buildDeleteSQL(ast);

    this.logger.debug('Executing DELETE', {
      table: ast.table,
      partitionCount: partitionIds.length,
    });

    const results = await this.executeOnPartitions(
      partitionIds,
      sql,
      params,
      this.hlcClock.now(),
      false,
      false,
      false,
      executionOptions,
    );
    const fanoutMetrics = this.getLastCoordinatorMetrics();

    const failedResults = results.filter((result) => !result.success);
    const totalChanges = results.reduce(
      (sum, result) => sum + (result.success ? (result.changes || 0) : 0),
      0,
    );
    const returningRows = [];
    for (const result of results) {
      if (result.success && Array.isArray(result.rows) && result.rows.length > NUM.ZERO) {
        returningRows.push(...result.rows);
      }
    }

    if (failedResults.length > NUM.ZERO) {
      return {
        success: false,
        operation: QUERY_AST_TYPE.DELETE,
        affectedRows: totalChanges,
        partitions: partitionIds,
        failedPartitions: failedResults.map((result) => result.partitionId),
        partitionErrors: failedResults.map((result) => ({
          partitionId: result.partitionId,
          error: result.error || ERRORS.QUERY_FAILED,
        })),
        errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
        error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
        rows: returningRows,
        distributedMetrics: {
          fanout: fanoutMetrics,
          failedPartitionCount: failedResults.length,
        },
      };
    }

    return {
      success: true,
      operation: QUERY_AST_TYPE.DELETE,
      affectedRows: totalChanges,
      partitions: partitionIds,
      rows: returningRows,
      distributedMetrics: {
        fanout: fanoutMetrics,
        failedPartitionCount: 0,
      },
    };
  }

  /**
   * Build SQL for DELETE statement.
   * @param {Object} ast - DELETE AST.
   * @return {string} SQL string.
   * @private
   */
  buildDeleteSQL(ast) {
    let sql = `DELETE FROM ${ast.table}`;

    if (ast.where) {
      sql += ` WHERE ${this.buildExpressionSQL(ast.where)}`;
    }

    return this.appendReturning(sql, ast.returning);
  }
}

export {QueryExecutor};
