import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';

const {
  CONTROL_PLANE_READINESS_DIMENSION,
  ConfigurationManager,
  DISTRIBUTED_JOIN_STRATEGY,
  DistributedMergeEngine,
  HLCClockService,
  LoggingService,
  METRICS_LOG_TAG,
  NUM,
  ParallelQueryCoordinator,
  QUERY_AST_NODE,
  QUERY_CONFIG_KEY,
  QUERY_DEFAULTS,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_EXECUTOR_LITERAL,
  QUERY_JOIN_TYPE,
  QUERY_LOG_MSG,
  QUERY_OPERATOR,
  QUERY_SQL,
  QUERY_SUBSYSTEM,
  buildDistributedFailureSummary,
} = QUERY_EXECUTOR_SHARED;

class QueryExecutorSegment1 {
  constructor(options = {}) {
    this.messageRouter = options.messageRouter || null;
    this.systemCache = options.systemCache || null;
    this.routingMetadataOverlay = options.routingMetadataOverlay || null;
    this.bootstrapTopologySnapshotOwner =
      options.bootstrapTopologySnapshotOwner || null;
    this.controlPlaneReadinessService =
      options.controlPlaneReadinessService || null;
    this.defaultRoutingReadinessDimension =
      options.defaultRoutingReadinessDimension ||
      CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE;
    this.nodeId = options.nodeId || QUERY_SUBSYSTEM.QUERY_EXECUTOR;
    this.hlcClock = new HLCClockService(this.nodeId);
    this.mergeEngine = options.mergeEngine || new DistributedMergeEngine();
    this.parallelQueryCoordinator =
      options.parallelQueryCoordinator ||
      new ParallelQueryCoordinator({
        systemCache: this.systemCache,
        nodeId: this.nodeId,
        partitionQueryExecutor: (
          sql,
          partitionId,
          params,
          coordinatorOptions = {},
        ) =>
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
    this.queryTimeoutMs =
      config.get(QUERY_CONFIG_KEY.QUERY_TIMEOUT_MS) ||
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
    this.noServiceWarnThrottleMs = QUERY_DEFAULTS.NO_SERVICE_WARN_THROTTLE_MS;
    this.noHandlerAddressQuarantineMsExplicit =
      Number.isFinite(options.noHandlerAddressQuarantineMs) &&
      options.noHandlerAddressQuarantineMs > NUM.ZERO;
    this.noHandlerAddressQuarantineMs = this
      .noHandlerAddressQuarantineMsExplicit ?
      Math.floor(options.noHandlerAddressQuarantineMs) :
      this.noServiceWarnThrottleMs;
    this.temporarilyUnroutableAddressesByPartition = new Map();
    this.sessionPartitionAddresses = new Map();
    this.retainedCanonicalLeaderNodeIdsByPartition = new Map();
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
   * Build one stable affinity key for session-bound partition routing.
   * @param {string|null|undefined} sessionId
   * @param {string|null|undefined} partitionId
   * @return {string|null}
   * @private
   */
  buildSessionPartitionAddressKey(sessionId, partitionId) {
    if (
      typeof sessionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      sessionId.length === NUM.ZERO ||
      typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      partitionId.length === NUM.ZERO
    ) {
      return null;
    }
    return `${sessionId}::${partitionId}`;
  }

  /**
   * Get the currently pinned address for one session-bound partition.
   * @param {string|null|undefined} sessionId
   * @param {string|null|undefined} partitionId
   * @return {string|null}
   * @private
   */
  getSessionPartitionAddress(sessionId, partitionId) {
    const pinState = this.getSessionPartitionAddressState(
      sessionId,
      partitionId,
    );
    return pinState.state === QUERY_EXECUTOR_LITERAL.STRING_PINNED ?
      pinState.address :
      null;
  }

  /**
   * Resolve one explicit session-bound partition pin state.
   * @param {string|null|undefined} sessionId
   * @param {string|null|undefined} partitionId
   * @return {Object}
   * @private
   */
  getSessionPartitionAddressState(sessionId, partitionId) {
    const key = this.buildSessionPartitionAddressKey(sessionId, partitionId);
    if (!key) {
      return Object.freeze({
        state: QUERY_EXECUTOR_LITERAL.STRING_UNPINNED,
      });
    }
    const address = this.sessionPartitionAddresses.get(key);
    if (
      typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      address.length === NUM.ZERO
    ) {
      return Object.freeze({
        state: QUERY_EXECUTOR_LITERAL.STRING_UNPINNED,
      });
    }
    return Object.freeze({
      state: QUERY_EXECUTOR_LITERAL.STRING_PINNED,
      address,
    });
  }

  /**
   * Pin one session-bound partition to the replica address that actually
   * accepted the previous transactional step.
   * @param {string|null|undefined} sessionId
   * @param {string|null|undefined} partitionId
   * @param {string|null|undefined} address
   * @private
   */
  setSessionPartitionAddress(sessionId, partitionId, address) {
    const key = this.buildSessionPartitionAddressKey(sessionId, partitionId);
    if (
      !key ||
      typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      address.length === NUM.ZERO
    ) {
      return;
    }
    this.sessionPartitionAddresses.set(key, address);
  }

  /**
   * Clear a stale session-bound partition address pin.
   * @param {string|null|undefined} sessionId
   * @param {string|null|undefined} partitionId
   * @private
   */
  clearSessionPartitionAddress(sessionId, partitionId) {
    const key = this.buildSessionPartitionAddressKey(sessionId, partitionId);
    if (!key) {
      return;
    }
    this.sessionPartitionAddresses.delete(key);
  }

  /**
   * Prefer the previously successful transactional replica when it is still
   * among the current routable candidates.
   * @param {Array<Object>} candidates
   * @param {string|null|undefined} sessionId
   * @param {string|null|undefined} partitionId
   * @return {Array<Object>}
   * @private
   */
  prioritizeSessionPartitionAddress(
    candidates,
    routingSnapshot,
    sessionId,
    partitionId,
  ) {
    if (!Array.isArray(candidates)) {
      return [];
    }
    const pinState = this.getSessionPartitionAddressState(
      sessionId,
      partitionId,
    );
    if (pinState.state !== QUERY_EXECUTOR_LITERAL.STRING_PINNED) {
      return candidates;
    }
    const preferredAddress = pinState.address;
    const preferredCandidateIndex = candidates.findIndex(
      (candidate) => candidate?.address === preferredAddress,
    );
    if (preferredCandidateIndex <= NUM.ZERO) {
      if (preferredCandidateIndex === NUM.ZERO) {
        return candidates;
      }
      const preferredService = Array.isArray(routingSnapshot?.routableServices) ?
        routingSnapshot.routableServices.find(
          (service) => service?.address === preferredAddress,
        ) :
        null;
      if (
        !preferredService ||
        this.isTemporarilyUnroutableAddress(partitionId, preferredAddress)
      ) {
        return candidates;
      }
      return [
        {
          address: preferredAddress,
          nodeId: preferredService.node_id || preferredService.nodeId || null,
          replicaId:
            preferredService.service_id ||
            preferredService.replica_id ||
            preferredService.replicaId ||
            null,
        },
        ...candidates,
      ];
    }
    return [
      candidates[preferredCandidateIndex],
      ...candidates.slice(NUM.ZERO, preferredCandidateIndex),
      ...candidates.slice(preferredCandidateIndex + NUM.ONE),
    ];
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
   * Set optional bootstrap topology owner used for bootstrap-era active-node
   * and leader identity answers.
   * @param {Object|null} owner
   */
  setBootstrapTopologySnapshotOwner(owner) {
    this.bootstrapTopologySnapshotOwner = owner || null;
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
      readinessDimension || CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE;
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
        partitionErrors: [
          {
            partitionId: null,
            error: QUERY_ERROR_MSG.MISSING_JOIN_PLAN,
          },
        ],
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
      true,
      // forRead = true for SELECT
      options.preferLeader || false,
      options.preferSameLatencyGroup === true,
      {
        deliveryPriority: options.deliveryPriority,
        routingReadinessDimension: options.routingReadinessDimension,
        timeoutMs: options.timeoutMs,
        cancellationToken: options.cancellationToken || null,
        tableName: ast.table,
      },
    );
    const fanoutMetrics = this.getLastCoordinatorMetrics();
    const failedPartitions = results
      .filter((result) => !result.success)
      .map((result) => result.partitionId);
    if (failedPartitions.length > NUM.ZERO) {
      const failureSummary = buildDistributedFailureSummary(
        results.filter((result) => !result.success),
      );
      return {
        success: false,
        errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
        error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
        ...failureSummary,
        partitions: partitionIds,
        distributedMetrics: {
          fanout: fanoutMetrics,
          mergeDurationMs: NUM.ZERO,
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
        stragglerCount: fanoutMetrics?.stragglers?.length ?? NUM.ZERO,
        speculativeExecutions: fanoutMetrics?.speculativeExecutions ?? NUM.ZERO,
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
        failedPartitionCount: NUM.ZERO,
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

    // 3. Perform in-memory JOIN
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

    // 4. Apply remaining clauses (WHERE on joined data, GROUP BY, etc.)
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
        // Include left row with nulls for right columns
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

    // Handle RIGHT JOIN
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
    return {
      leftColumn,
      rightColumn,
    };
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
    const edge =
      joinPlan.find(
        (entry) =>
          entry.leftAlias === leftTableRef &&
          entry.rightAlias === rightTableRef,
      ) || joinPlan.find((entry) => entry.rightAlias === rightTableRef);
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
  }

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

    // For cross-partition JOINs, select all columns from main table
    sql += QUERY_EXECUTOR_LITERAL.STRING_VALUE_3;

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
    const coordinatorResult =
      await this.parallelQueryCoordinator.executeParallel(
        sql,
        partitionIds,
        params,
        {
          forRead,
          preferLeader,
          preferSameLatencyGroup,
          deliveryPriority: executionOptions.deliveryPriority,
          deliverySource: executionOptions.deliverySource,
          replacePendingKey: executionOptions.replacePendingKey,
          routingReadinessDimension:
            executionOptions.routingReadinessDimension ||
            this.defaultRoutingReadinessDimension,
          splitMirrorOrigin: executionOptions.splitMirrorOrigin || null,
          timestamp: _timestamp,
          timeoutMs: executionOptions.timeoutMs,
          cancellationToken: executionOptions.cancellationToken || null,
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
}

export {QueryExecutorSegment1};
