import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';
import {
  installQueryExecutorJoinExecutionHelpers,
} from './query-executor-join-execution.js';
import {
  buildSelectFanoutPlan,
} from './distributed/distributed-select-fanout-plan.js';

function partitionBudgetShare(limit, partitionCount) {
  if (!Number.isSafeInteger(limit) || limit < 0) return null;
  return Math.floor(limit / Math.max(1, partitionCount));
}

const {
  CONTROL_PLANE_READINESS_DIMENSION,
  ConfigurationManager,
  DistributedMergeEngine,
  HLCClockService,
  LoggingService,
  METRICS_LOG_TAG,
  ParallelQueryCoordinator,
  QUERY_CONFIG_KEY,
  QUERY_DEFAULTS,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_EXECUTOR_LITERAL,
  QUERY_LOG_MSG,
  QUERY_SUBSYSTEM,
  buildDistributedFailureSummary,
} = QUERY_EXECUTOR_SHARED;

class QueryExecutorBase {
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
      options.noHandlerAddressQuarantineMs > 0;
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
      sessionId.length === 0 ||
      typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      partitionId.length === 0
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
      address.length === 0
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
      address.length === 0
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
    if (preferredCandidateIndex <= 0) {
      if (preferredCandidateIndex === 0) {
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
      ...candidates.slice(0, preferredCandidateIndex),
      ...candidates.slice(preferredCandidateIndex + 1),
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
    if (partitionIds.length === 0) {
      return {
        success: true,
        rows: [],
        count: 0,
        partitions: [],
      };
    }

    // Get consistent snapshot timestamp
    const queryTimestamp = this.hlcClock.now();
    this.logger.debug(QUERY_LOG_MSG.EXECUTING_DISTRIBUTED_SELECT, {
      partitionCount: partitionIds.length,
      timestamp: queryTimestamp.toString(),
      hasJoins: (ast.joins && ast.joins.length > 0) || false,
      hasAggregates: this.hasAggregates(ast),
    });

    // Check if this is a cross-partition JOIN query
    if (ast.joins && ast.joins.length > 0) {
      const joinPartitions = this.resolveJoinPartitions(ast, options);
      if (joinPartitions.size > 0) {
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

    // Build the fan-out plan: partition-side SQL with combinable partial
    // aggregates and over-fetched LIMIT, so global clauses (aggregates,
    // GROUP BY/HAVING, OFFSET) are applied exactly once at the merge.
    const fanoutPlan = buildSelectFanoutPlan(
      ast,
      params,
      (expr) => this.buildExpressionSQL(expr),
    );
    const sql = this.buildSelectSQL(fanoutPlan.partitionAst);
    const resultMaxBytes = partitionBudgetShare(
      options.resultMaxBytes,
      partitionIds.length,
    );
    const resultMaxRows = partitionBudgetShare(
      options.resultMaxRows,
      partitionIds.length,
    );

    // Execute on all partitions in parallel (read operations can go to any replica)
    const results = await this.executeOnPartitions(
      partitionIds,
      sql,
      fanoutPlan.partitionParams,
      queryTimestamp,
      true,
      // forRead = true for SELECT
      options.preferLeader || false,
      options.preferSameLatencyGroup === true,
      {
        deliveryPriority: options.deliveryPriority,
        routingReadinessDimension: options.routingReadinessDimension,
        timeoutMs: options.timeoutMs,
        timeoutBudget: options.timeoutBudget || null,
        cancellationToken: options.cancellationToken || null,
        resultMaxBytes,
        resultMaxRows,
        tableName: ast.table,
      },
    );
    const fanoutMetrics = this.getLastCoordinatorMetrics();
    const failedPartitions = results
      .filter((result) => !result.success)
      .map((result) => result.partitionId);
    if (failedPartitions.length > 0) {
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
      fanoutPlan,
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
        speculativeExecutions: fanoutMetrics?.speculativeExecutions ?? 0,
      });
    } catch (_metricsErr) {
      // Metrics logging must not propagate to callers
    }
    return {
      success: true,
      rows: aggregated.rows,
      count: aggregated.rows.length,
      partitions: partitionIds,
      readAuthorityWitnesses: results.map(
        (result) => result.readAuthorityWitness,
      ).filter(Boolean),
      timestamp: queryTimestamp.toString(),
      distributedMetrics: {
        fanout: fanoutMetrics,
        mergeDurationMs,
        failedPartitionCount: 0,
      },
    };
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
          ...executionOptions,
          forRead,
          preferLeader,
          preferSameLatencyGroup,
          routingReadinessDimension:
            executionOptions.routingReadinessDimension ||
            this.defaultRoutingReadinessDimension,
          timestamp: _timestamp,
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

installQueryExecutorJoinExecutionHelpers(QueryExecutorBase);

export {QueryExecutorBase};
