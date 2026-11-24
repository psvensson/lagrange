import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';
import {
  buildLocalAuthoritativeObservation,
} from '../cdc/cdc-integration-service-local-system-table-routing.js';
import {
  GUARD_OUTCOME,
} from './distributed/coordinator-merge-session.js';
import {
  FANOUT_PLAN_KIND,
  assertQueryParametersBound,
  buildSelectFanoutPlan,
} from './distributed/distributed-select-fanout-plan.js';
import {
  collectAllBaseTableNames,
  hasSubqueryCteOrCompound,
} from './distributed/distributed-select-fanout-soundness.js';
import {
  attachAggregatedSelectRows,
  getResultRowCount,
  resolveSinglePartitionMergeOptions,
} from './distributed/parallel-query-partition-outcomes.js';
import {PartitionResolver} from './partition-resolver.js';
import {
  installQueryExecutorJoinExecutionHelpers,
} from './query-executor-join-execution.js';
import {resolveTimeSource} from '../time/time-source.js';

function createExecutorTableInfoResolver(executor, options) {
  if (options.getTableInfo) {
    return options.getTableInfo;
  }
  return (tableName) => {
    if (!executor.systemCache) return null;
    return new PartitionResolver({systemCache: executor.systemCache}).getTableInfo(tableName);
  };
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
} = QUERY_EXECUTOR_SHARED;

/**
 * The one table-name read for a SELECT that executeSelect fans out. The SQL
 * parser's SELECT shape (sql-parser-select-methods convertSelect/convertFrom)
 * names the base table only as `from.name`: `from` is an object, or null for
 * a FROM-less SELECT, and its name is null for a derived-table subquery. The
 * locking-read PK select builds the same `{from: {name}}` shape. Top-level
 * `table` belongs to INSERT/UPDATE/DELETE ASTs, which never reach SELECT
 * execution, and the parser never produces a string `from`.
 * @param {Object} ast - Parsed SELECT AST.
 * @return {string|null} Base table name, or null when the SELECT has none.
 */
function collectReadGenerationsByPartition(results) {
  const generations = {};
  for (const result of results) {
    if (result?.partitionId && Number.isSafeInteger(result.readGeneration)) {
      generations[result.partitionId] = result.readGeneration;
    }
  }
  return generations;
}

function resolveSelectTableName(ast) {
  return ast?.from?.name || null;
}

class QueryExecutorBase {
  constructor(options = {}) {
    this.messageRouter = options.messageRouter || null;
    this.partitionReadShutdownController = new AbortController();
    this.systemCache = options.systemCache || null;
    this.resolveTableInfo = createExecutorTableInfoResolver(this, options);
    this.routingMetadataOverlay = options.routingMetadataOverlay || null;
    this.bootstrapTopologySnapshotOwner =
      options.bootstrapTopologySnapshotOwner || null;
    this.controlPlaneReadinessService =
      options.controlPlaneReadinessService || null;
    this.defaultRoutingReadinessDimension =
      options.defaultRoutingReadinessDimension ||
      CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE;
    this.nodeId = options.nodeId || QUERY_SUBSYSTEM.QUERY_EXECUTOR;
    this.dataDir = typeof options.dataDir === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      options.dataDir.length > 0 ? options.dataDir : null;
    this.getLocalPartitionReplicas = options.getLocalPartitionReplicas ?? null;
    // The executor runs on the clock of the node it runs for: its HLC orders
    // on it and every timed decision it makes (the no-handler address
    // quarantine) reads it. Unsupplied, it is the host clock exactly as before.
    this.nowFn = typeof options.nowFn === 'function' ? options.nowFn : null;
    this.timeSource = resolveTimeSource({
      timeSource: this.nowFn ? {now: this.nowFn} : undefined,
    });
    this.hlcClock = new HLCClockService(this.nodeId, {timeSource: this.timeSource});
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

  async executeEmptyAggregateSelect(ast, params, queryTimestamp, requestDeadlineMs, options) {
    const resolveTableSchema = (name) => this.resolveJoinTableSchema(name);
    const fanoutPlan = buildSelectFanoutPlan(ast, params, 2, {resolveTableSchema});
    const effectivePlan = fanoutPlan.unmergedPlan || fanoutPlan;
    const extraFetch = await this.fetchExtraNestedBaseTables(
      ast,
      effectivePlan.extraBaseTableNames,
      queryTimestamp,
      options,
    );
    if (!extraFetch.ok) {
      return extraFetch.failureResult;
    }
    const mergeOptions = this.buildCoordinatorMergeOptions(
      options,
      extraFetch.extraTables,
      requestDeadlineMs,
    );
    const schemaCols = Array.isArray(effectivePlan.coordinatorTableSchema?.columns) ?
      effectivePlan.coordinatorTableSchema.columns.map((c) => c.name).filter(Boolean) :
      [];
    const emptyFragments = schemaCols.length > 0 ?
      [{success: true, rows: [], columns: schemaCols}] :
      [];
    const aggregated = await this.mergeEngine.mergePartitionResults(
      emptyFragments,
      ast,
      this,
      effectivePlan,
      params,
      mergeOptions,
    );
    return attachAggregatedSelectRows(
      {
        success: true,
        partitions: [],
        timestamp: queryTimestamp ? queryTimestamp.toString() : null,
      },
      aggregated,
      mergeOptions,
    );
  }

  tryExecuteJoinSelect(ast, partitionIds, params, options, queryTimestamp) {
    if (!ast.joins || ast.joins.length === 0 || hasSubqueryCteOrCompound(ast)) {
      return null;
    }
    const joinPartitions = this.resolveJoinPartitions(ast, options);
    const isSelfJoin = ast.joins.every(
      (join) => join?.table?.name && join.table.name === ast.from?.name,
    );
    if (joinPartitions.size > 0 || isSelfJoin) {
      return this.executeCrossPartitionJoin(
        ast,
        partitionIds,
        params,
        {...options, joinPartitions},
        queryTimestamp,
      );
    }
    if (partitionIds.length === 0) {
      return Promise.resolve({success: true, rows: [], count: 0, partitions: []});
    }
    return Promise.resolve({
      success: false,
      errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
      error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
      failedPartitions: [],
      partitionErrors: [{partitionId: null, error: QUERY_ERROR_MSG.MISSING_JOIN_PLAN}],
      partitions: partitionIds,
    });
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
    assertQueryParametersBound(ast, params);
    const requestDeadlineMs = this.resolveRequestDeadlineMs(options);
    const queryTimestamp = this.hlcClock.now();
    this.logger.debug(QUERY_LOG_MSG.EXECUTING_DISTRIBUTED_SELECT, {
      partitionCount: partitionIds.length,
      timestamp: queryTimestamp.toString(),
      hasJoins: (ast.joins && ast.joins.length > 0) || false,
      hasAggregates: this.hasAggregates(ast),
    });

    const joinResult = this.tryExecuteJoinSelect(
      ast, partitionIds, params, options, queryTimestamp);
    if (joinResult !== null) {
      return joinResult;
    }

    if (partitionIds.length === 0) {
      if (!this.hasAggregates(ast)) {
        return {
          success: true,
          rows: [],
          count: 0,
          partitions: [],
        };
      }
      return this.executeEmptyAggregateSelect(
        ast,
        params,
        queryTimestamp,
        requestDeadlineMs,
        options,
      );
    }

    const baseTables = collectAllBaseTableNames(ast);
    const tableName = resolveSelectTableName(ast) || baseTables[0] || null;
    const resolveTableSchema = (name) => this.resolveJoinTableSchema(name);

    const fanoutPlan = buildSelectFanoutPlan(ast, params, partitionIds.length, {
      resolveTableSchema,
    });
    const sql = fanoutPlan.partitionSql;

    const initialFetch = await this.fetchSelectPartitionResults(
      partitionIds,
      sql,
      fanoutPlan.partitionParams,
      queryTimestamp,
      tableName,
      options,
    );
    if (!initialFetch.ok) {
      return initialFetch.failureResult;
    }
    let results = initialFetch.results;
    const fanoutMetrics = initialFetch.fanoutMetrics;

    const extraFetch = await this.fetchExtraNestedBaseTables(
      ast,
      fanoutPlan.extraBaseTableNames,
      queryTimestamp,
      options,
    );
    if (!extraFetch.ok) {
      return extraFetch.failureResult;
    }
    const {extraTables} = extraFetch;

    const mergeOptions = this.buildCoordinatorMergeOptions(
      options,
      extraTables,
      requestDeadlineMs,
    );
    const mergeStartTimeMs = Date.now();
    let aggregated = await this.mergeEngine.mergePartitionResults(
      results,
      ast,
      this,
      fanoutPlan,
      params,
      resolveSinglePartitionMergeOptions(fanoutPlan, results, mergeOptions),
    );
    if (
      fanoutPlan.kind === FANOUT_PLAN_KIND.GUARDED_PARTIAL &&
      aggregated.guardOutcome === GUARD_OUTCOME.GUARD_FAILED &&
      fanoutPlan.unmergedPlan
    ) {
      const unmergedFetch = await this.fetchSelectPartitionResults(
        partitionIds,
        fanoutPlan.unmergedPlan.partitionSql,
        fanoutPlan.unmergedPlan.partitionParams,
        queryTimestamp,
        tableName,
        options,
      );
      if (!unmergedFetch.ok) {
        return unmergedFetch.failureResult;
      }
      results = unmergedFetch.results;
      aggregated = await this.mergeEngine.mergePartitionResults(
        results,
        ast,
        this,
        fanoutPlan.unmergedPlan,
        params,
        resolveSinglePartitionMergeOptions(fanoutPlan.unmergedPlan, results, mergeOptions),
      );
    }
    const mergeDurationMs = Date.now() - mergeStartTimeMs;
    const totalRows = getResultRowCount(aggregated);

    try {
      this.logger.info(METRICS_LOG_TAG.SELECT_DISTRIBUTED, {
        partitionCount: partitionIds.length,
        fanoutTotalLatencyMs: fanoutMetrics?.totalLatencyMs,
        fanoutMedianLatencyMs: fanoutMetrics?.medianLatencyMs,
        mergeDurationMs,
        totalRows,
        stragglerCount: fanoutMetrics?.stragglers?.length ?? 0,
        speculativeExecutions: fanoutMetrics?.speculativeExecutions ?? 0,
      });
    } catch (_metricsErr) {
      // Metrics logging must not propagate to callers
    }
    const readAuthorityWitnesses = results.map((r) => r.readAuthorityWitness).filter(Boolean);
    const rowSetComplete = partitionIds.length > 0 && results.length === partitionIds.length &&
      results.every((r) =>
        r?.success === true && r?.rowSetComplete === true && r?.partial !== true);
    const authoritativeObservation = rowSetComplete ?
      (results.length === 1 && results[0]?.authoritativeObservation ?
        results[0].authoritativeObservation :
        buildLocalAuthoritativeObservation(
          tableName, rowSetComplete, readAuthorityWitnesses, sql, params)) :
      null;
    const readGenerationsByPartition = collectReadGenerationsByPartition(results);
    return attachAggregatedSelectRows({
      success: true,
      partitions: partitionIds,
      tableName,
      rowSetComplete,
      readAuthorityWitness: readAuthorityWitnesses[0] || null,
      readAuthorityWitnesses,
      authoritativeObservation,
      ...(Object.keys(readGenerationsByPartition).length > 0 ? {readGenerationsByPartition} : {}),
      timestamp: queryTimestamp.toString(),
      distributedMetrics: {fanout: fanoutMetrics, mergeDurationMs, failedPartitionCount: 0},
    }, aggregated, mergeOptions);
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

  resolveRequestDeadlineMs(options = {}) {
    return computeDeadlineFromNumbers(
      options.deadlineMs,
      options.timeoutBudget?.deadlineMs,
      options.timeoutMs,
    );
  }

  buildCoordinatorMergeOptions(options = {}, extraTables = [], requestDeadlineMs = null) {
    const baseSession = options.sessionOptions || {};
    const budget = pickFirstDefined(options.budget, options.budgets, baseSession.budget);
    const deadlineMs = pickFirstDefined(requestDeadlineMs, baseSession.deadlineMs, null);
    const sessionOptions = {
      ...baseSession,
      budget,
      memoryLimitBytes: pickFirstDefined(
        options.memoryLimitBytes,
        budget?.MEMORY_LIMIT_BYTES,
        baseSession.memoryLimitBytes,
      ),
      mergeInputMaxRows: pickFirstDefined(
        options.mergeInputMaxRows,
        budget?.MERGE_INPUT_MAX_ROWS,
        baseSession.mergeInputMaxRows,
      ),
      resultMaxRows: pickFirstDefined(
        options.resultMaxRows,
        budget?.RESULT_MAX_ROWS,
        baseSession.resultMaxRows,
      ),
      resultMaxBytes: pickFirstDefined(
        options.resultMaxBytes,
        budget?.RESULT_MAX_BYTES,
        baseSession.resultMaxBytes,
      ),
      deadlineMs,
      timeoutMs: pickFirstDefined(options.timeoutMs, baseSession.timeoutMs, null),
      cancellationToken: pickFirstDefined(
        options.cancellationToken,
        baseSession.cancellationToken,
        null,
      ),
      signal: pickFirstDefined(options.signal, baseSession.signal, null),
      isCancelled: pickFirstDefined(options.isCancelled, baseSession.isCancelled, null),
    };
    return {
      extraTables,
      safeIntegers: options.safeIntegers === true,
      deadlineMs: sessionOptions.deadlineMs,
      timeoutMs: sessionOptions.timeoutMs,
      cancellationToken: sessionOptions.cancellationToken,
      signal: sessionOptions.signal,
      isCancelled: sessionOptions.isCancelled,
      useProcessPool: options.useProcessPool,
      processPool: options.processPool || null,
      sessionOptions,
    };
  }
}

function pickFirstDefined(firstValue, secondValue, defaultValue = undefined) {
  if (firstValue !== undefined && firstValue !== null) return firstValue;
  if (secondValue !== undefined && secondValue !== null) return secondValue;
  return defaultValue;
}

function computeDeadlineFromNumbers(explicitDeadlineMs, budgetDeadlineMs, timeoutMs) {
  const chosenDeadline = pickFirstDefined(explicitDeadlineMs, budgetDeadlineMs, null);
  if (Number.isSafeInteger(chosenDeadline) && chosenDeadline > 0) {
    return chosenDeadline;
  }
  if (Number.isSafeInteger(timeoutMs) && timeoutMs > 0) {
    return Date.now() + timeoutMs;
  }
  return null;
}

installQueryExecutorJoinExecutionHelpers(QueryExecutorBase);

export {QueryExecutorBase};
