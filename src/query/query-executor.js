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
  NUM,
  SQL,
  TABLES,
  SERVICE_TYPE,
  STATE,
} from '../constants/index.js';
import {TRANSPORT_ERROR_MSG} from '../constants/transport.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {
  QUERY_CONFIG_KEY,
  QUERY_DEFAULTS,
  QUERY_ERROR_MSG,
  QUERY_JOIN_TYPE,
  QUERY_LOG_MSG,
  QUERY_MESSAGE_TYPE,
  QUERY_OPERATOR,
  QUERY_AST_NODE,
  QUERY_RESPONSE_TYPE,
  QUERY_SQL,
  QUERY_SUBSYSTEM,
} from './query-constants.js';

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
    this.nodeId = options.nodeId || QUERY_SUBSYSTEM.QUERY_EXECUTOR;
    this.hlcClock = new HLCClockService(this.nodeId);
    this.logger = this.initLogger();

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.queryTimeoutMs = config.get(QUERY_CONFIG_KEY.QUERY_TIMEOUT_MS) ||
      QUERY_DEFAULTS.QUERY_TIMEOUT_MS;
    this.maxParallelPartitions = config.get(QUERY_CONFIG_KEY.MAX_PARALLEL_PARTITIONS) ||
      QUERY_DEFAULTS.MAX_PARALLEL_PARTITIONS;
    this.leaderRetryAttempts = config.get(QUERY_CONFIG_KEY.LEADER_RETRY_ATTEMPTS) ||
      QUERY_DEFAULTS.LEADER_RETRY_ATTEMPTS;
    this.leaderRetryDelayMs = config.get(QUERY_CONFIG_KEY.LEADER_RETRY_DELAY_MS) ||
      QUERY_DEFAULTS.LEADER_RETRY_DELAY_MS;
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
    } catch {
      // Logging not available
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
  }

  /**
   * Execute a SELECT query across partitions in parallel.
   * Supports cross-partition queries including JOINs and aggregates.
   * Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7
   * @param {Object} ast - Parsed SELECT AST.
   * @param {Array} partitionIds - Partition IDs to query.
   * @param {Array} params - Query parameters.
   * @param {Object} options - Execution options.
   * @param {Map} options.joinPartitions - Map of table name to partition IDs for JOINs.
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
    if (ast.joins && ast.joins.length > NUM.ZERO && options.joinPartitions) {
      return this.executeCrossPartitionJoin(ast, partitionIds, params, options, queryTimestamp);
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
    );

    // Aggregate results
    const aggregated = this.aggregateSelectResults(results, ast);

    return {
      success: true,
      rows: aggregated.rows,
      count: aggregated.rows.length,
      partitions: partitionIds,
      timestamp: queryTimestamp.toString(),
    };
  }

  /**
   * Execute a cross-partition JOIN query.
   * Requirements: 22.2, 22.3
   * @param {Object} ast - Parsed SELECT AST with JOINs.
   * @param {Array} mainPartitionIds - Partition IDs for main table.
   * @param {Array} params - Query parameters.
   * @param {Object} options - Execution options with joinPartitions map.
   * @param {Object} queryTimestamp - HLC timestamp for consistent snapshot.
   * @return {Promise<Object>} Query result.
   * @private
   */
  async executeCrossPartitionJoin(ast, mainPartitionIds, params, options, queryTimestamp) {
    const {joinPartitions} = options;

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
    );

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
        );

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
    for (const join of ast.joins) {
      const joinTableName = join.table.name;
      const joinRows = joinedData.get(joinTableName) || [];
      resultRows = this.performJoin(resultRows, joinRows, join, ast.from.name, joinTableName);
    }

    // 4. Apply remaining clauses (WHERE on joined data, GROUP BY, etc.)
    const aggregated = this.aggregateSelectResults(
      [{success: true, rows: resultRows}],
      ast,
    );

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
      return this.nestedLoopJoin(leftRows, rightRows, condition, joinType);
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
          result.push({...leftRow, ...rightRow});
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
        result.push({...leftRow, ...nullRight});
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
          result.push({...nullLeft, ...rightRow});
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
  nestedLoopJoin(leftRows, rightRows, condition, joinType) {
    const result = [];
    const matchedRight = new Set();

    for (const leftRow of leftRows) {
      let hasMatch = false;

      for (const rightRow of rightRows) {
        const combined = {...leftRow, ...rightRow};
        if (this.evaluateExpression(combined, condition)) {
          result.push(combined);
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
        result.push({...leftRow, ...nullRight});
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
          result.push({...nullLeft, ...rightRow});
        }
      }
    }

    return result;
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
    sql += ` FROM ${ast.from.name}`;
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
  ) {
    // Limit parallel partitions
    const limitedIds = partitionIds.slice(0, this.maxParallelPartitions);

    if (limitedIds.length < partitionIds.length) {
      this.logger.warn('Partition count exceeds limit', {
        requested: partitionIds.length,
        limit: this.maxParallelPartitions,
      });
    }

    // Create promises for parallel execution
    const promises = limitedIds.map((partitionId) =>
      this.executeOnPartition(
        partitionId,
        sql,
        params,
        forRead,
        preferLeader,
        preferSameLatencyGroup,
      ),
    );

    // Execute with timeout - ensure timer is always cleared
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(QUERY_ERROR_MSG.QUERY_TIMEOUT)),
        this.queryTimeoutMs,
      );
    });

    try {
      const results = await Promise.race([
        Promise.all(promises),
        timeoutPromise,
      ]);
      return results;
    } catch (error) {
      if (error.message === QUERY_ERROR_MSG.QUERY_TIMEOUT) {
        this.logger.error(QUERY_LOG_MSG.QUERY_TIMED_OUT, {
          partitionCount: limitedIds.length,
          timeoutMs: this.queryTimeoutMs,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
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
  ) {
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

    const maxAttempts = forRead ? NUM.ONE : this.getWriteRetryAttemptLimit();
    let lastError = null;

    for (let attempt = NUM.ONE; attempt <= maxAttempts; attempt++) {
      let serviceCandidates = this.getPartitionServiceCandidates(
        partitionId,
        forRead,
        preferLeader,
        preferSameLatencyGroup,
      );
      if (serviceCandidates.length === 0) {
        const hasRoutableService = this.hasRoutablePartitionService(partitionId);
        const hasPartitionRecord = this.hasPartitionRecord(partitionId);

        if (!forRead) {
          if (hasRoutableService) {
            // If leader metadata is stale/missing, route to routable replicas and
            // rely on follower forwarding/redirect to reach the current leader.
            serviceCandidates = this.getPartitionServiceCandidates(
              partitionId,
              true,
              false,
              preferSameLatencyGroup,
            );
          }

          if (serviceCandidates.length > 0) {
            // Continue with routable replica candidates in the normal routing loop.
          } else if (hasRoutableService && attempt < maxAttempts) {
            lastError = ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE;
            await this.delay(this.leaderRetryDelayMs);
            continue;
          } else if (!hasRoutableService && hasPartitionRecord && attempt < maxAttempts) {
            lastError = ERRORS.PARTITION_SERVICE_NOT_FOUND;
            await this.delay(this.leaderRetryDelayMs);
            continue;
          } else if (hasRoutableService) {
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
          } else if (!hasRoutableService) {
            this.logger.warn(QUERY_LOG_MSG.NO_SERVICE_FOR_PARTITION, {partitionId});
            return {
              partitionId,
              success: false,
              error: QUERY_ERROR_MSG.PARTITION_SERVICE_NOT_FOUND,
              rows: [],
            };
          }
        } else {
          this.logger.warn(QUERY_LOG_MSG.NO_SERVICE_FOR_PARTITION, {partitionId});
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
          const response = await this.messageRouter.deliver(address, {
            type: QUERY_MESSAGE_TYPE.QUERY,
            sql,
            params,
          });

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
              {type: QUERY_MESSAGE_TYPE.QUERY, sql, params},
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

          this.logger.error(QUERY_LOG_MSG.QUERY_ROUTING_FAILED, {
            partitionId,
            address,
            error: error.message,
          });
          throw error;
        }
      }

      if (!forRead && attempt < maxAttempts) {
        await this.delay(this.leaderRetryDelayMs);
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
    const retryDelayMs = Math.max(this.leaderRetryDelayMs || NUM.ZERO, NUM.ONE);
    const timeoutBoundAttempts = Math.ceil(this.queryTimeoutMs / retryDelayMs);
    const boundedAttempts = Math.min(timeoutBoundAttempts, maxRecoveryAttempts);
    return Math.max(this.leaderRetryAttempts, boundedAttempts);
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
  ) {
    const prioritizeLeader = preferLeader || !forRead;

    if (!this.systemCache) {
      this.logger.warn(LOG_MSG.SYSTEM_CACHE_PARTITION_LOOKUP_UNAVAILABLE, {partitionId});
      return [];
    }

    if (typeof this.systemCache.filter !== 'function') {
      this.logger.warn(QUERY_LOG_MSG.SYSTEM_CACHE_FILTER_UNSUPPORTED, {partitionId});
      return [];
    }

    const services = this.getRoutablePartitionServices(partitionId);

    if (services.length === 0) {
      this.logger.warn(QUERY_LOG_MSG.NO_ACTIVE_SERVICE_FOR_PARTITION, {partitionId});
      return [];
    }

    const localGroupId = this.resolveNodeLatencyGroupId(this.nodeId);
    const orderedServices = this.orderServicesByLatencyGroup(
      services,
      localGroupId,
      forRead && preferSameLatencyGroup,
    );
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

    const leaders = orderedServices
      .filter((service) => service.raft_role === RAFT_ROLE.LEADER);

    if (!forRead) {
      leaders.forEach(addService);
      return candidates;
    }

    if (prioritizeLeader) {
      leaders.forEach(addService);
      orderedServices
        .filter((service) => service.node_id === this.nodeId)
        .forEach(addService);
    }

    orderedServices.forEach(addService);

    return candidates;
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
   * Get write-routable partition services from system cache.
   * @param {string} partitionId - Partition ID.
   * @return {Array<Object>} Routable services for the partition.
   * @private
   */
  getRoutablePartitionServices(partitionId) {
    if (!this.systemCache || typeof this.systemCache.filter !== 'function') {
      return [];
    }

    return this.systemCache.filter(TABLES.SERVICES, (service) =>
      service.partition_id === partitionId &&
      service.service_type === SERVICE_TYPE.PARTITION &&
      service.status !== ReplicaStatus.FAILED &&
      service.status !== ReplicaStatus.REMOVED &&
      typeof service.address === 'string' &&
      service.address.length > NUM.ZERO,
    ) || [];
  }

  /**
   * Check whether a partition has write-routable services in the system cache.
   * @param {string} partitionId - Partition ID.
   * @return {boolean} True when routable services exist.
   * @private
   */
  hasRoutablePartitionService(partitionId) {
    return this.getRoutablePartitionServices(partitionId).length > NUM.ZERO;
  }

  /**
   * Check whether partition metadata exists in the cache.
   * @param {string} partitionId - Partition ID.
   * @return {boolean} True when partition metadata exists.
   * @private
   */
  hasPartitionRecord(partitionId) {
    if (!this.systemCache) {
      return false;
    }

    if (typeof this.systemCache.has === 'function') {
      return this.systemCache.has(TABLES.PARTITIONS, partitionId);
    }

    if (typeof this.systemCache.get === 'function') {
      return Boolean(this.systemCache.get(TABLES.PARTITIONS, partitionId));
    }

    if (typeof this.systemCache.filter === 'function') {
      return this.systemCache.filter(TABLES.PARTITIONS, (partition) =>
        partition.partition_id === partitionId,
      ).length > NUM.ZERO;
    }

    return false;
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
    if (!this.systemCache) {
      this.logger.warn(LOG_MSG.SYSTEM_CACHE_NOT_AVAILABLE, {partitionId});
      return null;
    }

    if (typeof this.systemCache.filter !== 'function') {
      this.logger.warn(QUERY_LOG_MSG.SYSTEM_CACHE_FILTER_UNSUPPORTED, {partitionId});
      return null;
    }

    // Query services table for partition leader
    const services = this.systemCache.filter(TABLES.SERVICES, (s) =>
      s.partition_id === partitionId &&
      s.service_type === SERVICE_TYPE.PARTITION &&
      s.raft_role === RAFT_ROLE.LEADER &&
      s.status === STATE.ACTIVE,
    ) || [];

    if (services.length === 0) {
      this.logger.debug(QUERY_LOG_MSG.NO_LEADER_SERVICE_FOR_PARTITION, {partitionId});
      return null;
    }

    return services[0].address;
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
    const offset = limit.offset || 0;
    const count = limit.count;
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
    sql += ` FROM ${ast.from.name}`;
    if (ast.from.alias) {
      sql += ` AS ${ast.from.alias}`;
    }

    // JOINs
    for (const join of ast.joins || []) {
      sql += ` ${join.joinType} JOIN ${join.table.name}`;
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

    default:
      return '';
    }
  }

  /**
   * Execute an INSERT statement.
   * Routes ALL queries through message router - no local vs remote distinction.
   * @param {Object} ast - Parsed INSERT AST.
   * @param {string} partitionId - Target partition ID.
   * @param {Array} params - Query parameters.
   * @return {Promise<Object>} Insert result.
   */
  async executeInsert(ast, partitionId, params = []) {
    const sql = this.buildInsertSQL(ast);

    this.logger.debug('Executing INSERT', {
      table: ast.table,
      partitionId,
      rowCount: ast.values.length,
    });

    // Route through message router like all other operations
    const result = await this.executeOnPartition(partitionId, sql, params);

    if (!result.success) {
      throw new Error(result.error || `Insert failed on partition: ${partitionId}`);
    }

    return {
      success: true,
      operation: 'INSERT',
      affectedRows: result.changes || ast.values.length,
      partitions: [partitionId],
    };
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

    return sql;
  }

  /**
   * Execute an UPDATE statement.
   * @param {Object} ast - Parsed UPDATE AST.
   * @param {Array} partitionIds - Target partition IDs.
   * @param {Array} params - Query parameters.
   * @return {Promise<Object>} Update result.
   */
  async executeUpdate(ast, partitionIds, params = []) {
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
    );

    const totalChanges = results.reduce(
      (sum, r) => sum + (r.changes || 0),
      0,
    );

    return {
      success: true,
      operation: 'UPDATE',
      affectedRows: totalChanges,
      partitions: partitionIds,
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

    return sql;
  }

  /**
   * Execute a DELETE statement.
   * @param {Object} ast - Parsed DELETE AST.
   * @param {Array} partitionIds - Target partition IDs.
   * @param {Array} params - Query parameters.
   * @return {Promise<Object>} Delete result.
   */
  async executeDelete(ast, partitionIds, params = []) {
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
    );

    const totalChanges = results.reduce(
      (sum, r) => sum + (r.changes || 0),
      0,
    );

    return {
      success: true,
      operation: 'DELETE',
      affectedRows: totalChanges,
      partitions: partitionIds,
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

    return sql;
  }
}

export {QueryExecutor};
