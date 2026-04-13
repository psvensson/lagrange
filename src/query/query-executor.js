/**
 * Query Executor - Executes queries across partitions in parallel.
 * Implements parallel query execution and result aggregation.
 * All queries route through message router using service addresses from system cache.
 * Requirements: 7.2, 7.4, 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7
 */

import { LoggingService } from '../logging/logging-service.js';
import { HLCClockService } from '../hlc/hlc-clock-service.js';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { COLUMN, ERRORS, LOG_MSG, METRICS_LOG_TAG, NUM, SQL, TABLES, SERVICE_STATUS, SERVICE_TYPE } from '../constants/index.js';
import { TRANSPORT_ERROR_MSG } from '../constants/transport.js';
import { RAFT_ROLE } from '../raft/constants.js';
import { QUERY_AST_TYPE, QUERY_CONFIG_KEY, QUERY_DEFAULTS, QUERY_ERROR_CODE, QUERY_ERROR_MSG, QUERY_JOIN_TYPE, QUERY_LOG_MSG, QUERY_MESSAGE_TYPE, QUERY_OPERATOR, QUERY_ROUTING_DIAGNOSTIC_REASON, QUERY_ROUTING_REPAIR_REASON, QUERY_AST_NODE, QUERY_RESPONSE_TYPE, QUERY_SQL, QUERY_SUBSYSTEM } from './query-constants.js';
import { PG_EXPR_TYPE } from './pg/pg-compat-constants.js';
import { DistributedMergeEngine } from './distributed/distributed-merge-engine.js';
import { ParallelQueryCoordinator } from './distributed/parallel-query-coordinator.js';
import { DISTRIBUTED_JOIN_STRATEGY } from './distributed/distributed-query-plan-constants.js';
import { MIGRATION_PARTITION_OPERATION } from '../migration/migration-constants.js';
import { CONTROL_PLANE_PARTICIPATION_KIND, CONTROL_PLANE_READINESS_DIMENSION } from '../control-plane/control-plane-readiness-constants.js';
import { compactEligibilitySnapshot, evaluateEligibilityDecision } from '../control-plane/eligibility-snapshot.js';
import { isRetryableControlPlaneError } from '../control-plane/control-plane-error-classification.js';
import { PARTITION_SERVICE_ERROR_MSG } from '../partition/partition-service-constants.js';
import { resolveBootstrapLeaderSelection } from './bootstrap-leader-selection.js';
const QUERY_EXECUTOR_LITERAL = Object.freeze({
  STRING_OBJECT: "object",
  STRING_VALUE: "",
  STRING_VALUE_2: "|",
  STRING_STRING: "string",
  STRING_BOOLEAN: "boolean",
  STRING_PINNED: "pinned",
  STRING_UNPINNED: "unpinned",
  STRING_LEFT: "left",
  STRING_RIGHT: "right",
  STRING_SELECT: "SELECT ",
  STRING_DISTINCT: "DISTINCT ",
  STRING_VALUE_3: "*",
  STRING_FUNCTION: "function",
  STRING_ROUTER_CONNECTION_CLOSED: "ROUTER_CONNECTION_CLOSED",
  STRING_CONNECTION_TO_NODE: "Connection to node",
  STRING_CLOSED: "closed",
  STRING_RECONNECTING: "reconnecting",
  STRING_DISCONNECTED: "disconnected",
  STRING_NO_CONNECTION_TO_NODE: "No connection to node",
  STRING_FAILED_TO_FORWARD_WRITE_TO_LEADER: "Failed to forward write to leader",
  STRING_AGGREGATE: "aggregate",
  STRING_COLUMN_REF: "column_ref",
  STRING_STAR: "star",
  STRING_VALUE_4: "?",
  STRING_COUNT: "COUNT",
  STRING_SUM: "SUM",
  STRING_AVG: "AVG",
  STRING_MIN: "MIN",
  STRING_MAX: "MAX",
  STRING_BINARY: "binary",
  STRING_UNARY: "unary",
  STRING_IN: "in",
  STRING_BETWEEN: "between",
  STRING_LIKE: "like",
  STRING_LITERAL: "literal",
  STRING_AND: "AND",
  STRING_OR: "OR",
  STRING_VALUE_5: "=",
  STRING_VALUE_6: "!=",
  STRING_VALUE_7: "<>",
  STRING_VALUE_8: "<",
  STRING_VALUE_9: "<=",
  STRING_VALUE_10: ">",
  STRING_VALUE_11: ">=",
  STRING_IS_NULL: "IS NULL",
  STRING_IS_NOT_NULL: "IS NOT NULL",
  STRING_NOT: "NOT",
  STRING_VALUE_12: "+",
  STRING_VALUE_13: "-",
  STRING_VALUE_14: ", ",
  STRING_NULL: "NULL",
  STRING_NOT_LIKE: "NOT LIKE",
  STRING_LIKE_2: "LIKE",
  STRING_PARAMETER: "parameter",
  STRING_CASE: "CASE",
  STRING_VALUE_15: " ",
  STRING_WHEN: " WHEN ",
  STRING_THEN: " THEN ",
  STRING_ELSE: " ELSE ",
  STRING_END: " END",
  STRING_EXECUTING_INSERT: "Executing INSERT",
  STRING_INSERT: "INSERT",
  STRING_NUMBER: "number",
  STRING_EXECUTING_UPDATE: "Executing UPDATE",
  STRING_EXECUTING_DELETE: "Executing DELETE"
});
const QUERY_MESSAGE_FIELD_SPLIT_MIRROR_ORIGIN = 'splitMirrorOrigin';
const QUERY_MESSAGE_FIELD_MIGRATION_OPERATION = 'migrationOperation';
const QUERY_MESSAGE_FIELD_MIGRATION_ID = 'migrationId';
const QUERY_MESSAGE_FIELD_SESSION_ID = 'sessionId';
const LEADER_GAP_REASON_OWNER_MISSING = 'owner_missing';
const LEADER_GAP_REASON_SERVICE_MISSING = 'service_missing';
const SYSTEM_TABLE_NAMES = new Set(Object.values(TABLES));
const CONTROL_PLANE_WRITE_RETRY_DECISION_STATE = Object.freeze({
  NONE: 'none',
  RETRY_SAME_ADDRESS: 'retry_same_address',
  DEFER_PARTITION_RETRY: 'defer_partition_retry',
  WIDEN_TO_RECOVERY_CANDIDATE: 'widen_to_recovery_candidate'
});
function buildPartitionServiceWitnessFingerprint(service) {
  if (!service || typeof service !== QUERY_EXECUTOR_LITERAL.STRING_OBJECT) {
    return null;
  }
  const serviceId = String(service.service_id || service.replica_id || service.serviceId || service.replicaId || '');
  const address = String(service.address || '');
  if (serviceId.length === NUM.ZERO && address.length === NUM.ZERO) {
    return null;
  }
  const updatedAt = service.updated_at ?? service.updatedAt ?? service.created_at ?? service.createdAt ?? null;
  return [serviceId, address, String(service.node_id || service.nodeId || QUERY_EXECUTOR_LITERAL.STRING_VALUE), String(service.raft_role || service.raftRole || QUERY_EXECUTOR_LITERAL.STRING_VALUE), String(service.status || QUERY_EXECUTOR_LITERAL.STRING_VALUE), Number.isFinite(updatedAt) ? String(Math.floor(updatedAt)) : QUERY_EXECUTOR_LITERAL.STRING_VALUE].join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_2);
}
function normalizeParticipantFailureString(value) {
  return typeof value === QUERY_EXECUTOR_LITERAL.STRING_STRING && value.length > NUM.ZERO ? value : null;
}
function normalizeParticipantRetryAfterMs(value) {
  return Number.isFinite(value) && value >= NUM.ZERO ? Math.floor(value) : null;
}
function resolveParticipantBackpressureState(result = {}) {
  if (typeof result?.backpressured === QUERY_EXECUTOR_LITERAL.STRING_BOOLEAN) {
    return result.backpressured;
  }
  if (result?.deferRetry === true) {
    return true;
  }
  return Number.isFinite(result?.retryAfterMs) && result.retryAfterMs > NUM.ZERO;
}
function buildParticipantFailureEntry(result) {
  return {
    partitionId: result.partitionId,
    participantNodeId: normalizeParticipantFailureString(result.participantNodeId),
    participantAddress: normalizeParticipantFailureString(result.participantAddress),
    errorCode: normalizeParticipantFailureString(result.errorCode),
    error: result.error || ERRORS.QUERY_FAILED,
    durationMs: Number.isFinite(result?.durationMs) ? Math.max(NUM.ZERO, Math.floor(result.durationMs)) : null,
    retryAfterMs: normalizeParticipantRetryAfterMs(result?.retryAfterMs),
    deferRetry: result?.deferRetry === true,
    backpressured: resolveParticipantBackpressureState(result),
    failedTable: normalizeParticipantFailureString(result.failedTable)
  };
}
function buildDistributedFailureSummary(failedResults) {
  const participantFailures = failedResults.map(result => buildParticipantFailureEntry(result));
  return {
    failedPartitions: failedResults.map(result => result.partitionId),
    partitionErrors: participantFailures,
    participantFailures,
    firstFailedParticipant: participantFailures.length > NUM.ZERO ? participantFailures[NUM.ZERO] : null
  };
}

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
    this.bootstrapTopologySnapshotOwner = options.bootstrapTopologySnapshotOwner || null;
    this.controlPlaneReadinessService = options.controlPlaneReadinessService || null;
    this.defaultRoutingReadinessDimension = options.defaultRoutingReadinessDimension || CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE;
    this.nodeId = options.nodeId || QUERY_SUBSYSTEM.QUERY_EXECUTOR;
    this.hlcClock = new HLCClockService(this.nodeId);
    this.mergeEngine = options.mergeEngine || new DistributedMergeEngine();
    this.parallelQueryCoordinator = options.parallelQueryCoordinator || new ParallelQueryCoordinator({
      systemCache: this.systemCache,
      nodeId: this.nodeId,
      partitionQueryExecutor: (sql, partitionId, params, coordinatorOptions = {}) => this.executeOnPartition(partitionId, sql, params, coordinatorOptions.forRead === true, coordinatorOptions.preferLeader === true, coordinatorOptions.preferSameLatencyGroup === true, coordinatorOptions)
    });
    this.lastCoordinatorMetrics = null;
    this.logger = this.initLogger();

    // Per-partition warning throttle to prevent log floods when a
    // partition has no active service (e.g. during rebalancer lag).
    this.noServiceWarnLastAt = new Map();
    this.canonicalLeaderWarnLastAt = new Map();

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.queryTimeoutMs = config.get(QUERY_CONFIG_KEY.QUERY_TIMEOUT_MS) || QUERY_DEFAULTS.QUERY_TIMEOUT_MS;
    this.leaderRetryAttempts = config.get(QUERY_CONFIG_KEY.LEADER_RETRY_ATTEMPTS) || QUERY_DEFAULTS.LEADER_RETRY_ATTEMPTS;
    this.leaderRetryDelayMs = config.get(QUERY_CONFIG_KEY.LEADER_RETRY_DELAY_MS) || QUERY_DEFAULTS.LEADER_RETRY_DELAY_MS;
    this.readRetryAttempts = config.get(QUERY_CONFIG_KEY.READ_RETRY_ATTEMPTS) || QUERY_DEFAULTS.READ_RETRY_ATTEMPTS;
    this.noServiceWarnThrottleMs = QUERY_DEFAULTS.NO_SERVICE_WARN_THROTTLE_MS;
    this.noHandlerAddressQuarantineMsExplicit = Number.isFinite(options.noHandlerAddressQuarantineMs) && options.noHandlerAddressQuarantineMs > NUM.ZERO;
    this.noHandlerAddressQuarantineMs = this.noHandlerAddressQuarantineMsExplicit ? Math.floor(options.noHandlerAddressQuarantineMs) : this.noServiceWarnThrottleMs;
    this.temporarilyUnroutableAddressesByPartition = new Map();
    this.sessionPartitionAddresses = new Map();
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
    if (typeof sessionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING || sessionId.length === NUM.ZERO || typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING || partitionId.length === NUM.ZERO) {
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
    const pinState = this.getSessionPartitionAddressState(sessionId, partitionId);
    return pinState.state === QUERY_EXECUTOR_LITERAL.STRING_PINNED ? pinState.address : null;
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
        state: QUERY_EXECUTOR_LITERAL.STRING_UNPINNED
      });
    }
    const address = this.sessionPartitionAddresses.get(key);
    if (typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING || address.length === NUM.ZERO) {
      return Object.freeze({
        state: QUERY_EXECUTOR_LITERAL.STRING_UNPINNED
      });
    }
    return Object.freeze({
      state: QUERY_EXECUTOR_LITERAL.STRING_PINNED,
      address
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
    if (!key || typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING || address.length === NUM.ZERO) {
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
  prioritizeSessionPartitionAddress(candidates, routingSnapshot, sessionId, partitionId) {
    if (!Array.isArray(candidates)) {
      return [];
    }
    const pinState = this.getSessionPartitionAddressState(sessionId, partitionId);
    if (pinState.state !== QUERY_EXECUTOR_LITERAL.STRING_PINNED) {
      return candidates;
    }
    const preferredAddress = pinState.address;
    const preferredCandidateIndex = candidates.findIndex(candidate => candidate?.address === preferredAddress);
    if (preferredCandidateIndex <= NUM.ZERO) {
      if (preferredCandidateIndex === NUM.ZERO) {
        return candidates;
      }
      const preferredService = Array.isArray(routingSnapshot?.routableServices) ? routingSnapshot.routableServices.find(service => service?.address === preferredAddress) : null;
      if (!preferredService || this.isTemporarilyUnroutableAddress(partitionId, preferredAddress)) {
        return candidates;
      }
      return [{
        address: preferredAddress,
        nodeId: preferredService.node_id || preferredService.nodeId || null,
        replicaId: preferredService.service_id || preferredService.replica_id || preferredService.replicaId || null
      }, ...candidates];
    }
    return [candidates[preferredCandidateIndex], ...candidates.slice(NUM.ZERO, preferredCandidateIndex), ...candidates.slice(preferredCandidateIndex + NUM.ONE)];
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
    this.defaultRoutingReadinessDimension = readinessDimension || CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE;
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
        partitions: []
      };
    }

    // Get consistent snapshot timestamp
    const queryTimestamp = this.hlcClock.now();
    this.logger.debug(QUERY_LOG_MSG.EXECUTING_DISTRIBUTED_SELECT, {
      partitionCount: partitionIds.length,
      timestamp: queryTimestamp.toString(),
      hasJoins: ast.joins && ast.joins.length > NUM.ZERO || false,
      hasAggregates: this.hasAggregates(ast)
    });

    // Check if this is a cross-partition JOIN query
    if (ast.joins && ast.joins.length > NUM.ZERO) {
      const joinPartitions = this.resolveJoinPartitions(ast, options);
      if (joinPartitions.size > NUM.ZERO) {
        return this.executeCrossPartitionJoin(ast, partitionIds, params, {
          ...options,
          joinPartitions
        }, queryTimestamp);
      }
      return {
        success: false,
        errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
        error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
        failedPartitions: [],
        partitionErrors: [{
          partitionId: null,
          error: QUERY_ERROR_MSG.MISSING_JOIN_PLAN
        }],
        partitions: partitionIds
      };
    }

    // Build SQL from AST
    const sql = this.buildSelectSQL(ast);

    // Execute on all partitions in parallel (read operations can go to any replica)
    const results = await this.executeOnPartitions(partitionIds, sql, params, queryTimestamp, true,
    // forRead = true for SELECT
    options.preferLeader || false, options.preferSameLatencyGroup === true, {
      deliveryPriority: options.deliveryPriority,
      timeoutMs: options.timeoutMs,
      cancellationToken: options.cancellationToken || null,
      tableName: ast.table
    });
    const fanoutMetrics = this.getLastCoordinatorMetrics();
    const failedPartitions = results.filter(result => !result.success).map(result => result.partitionId);
    if (failedPartitions.length > NUM.ZERO) {
      const failureSummary = buildDistributedFailureSummary(results.filter(result => !result.success));
      return {
        success: false,
        errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
        error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
        ...failureSummary,
        partitions: partitionIds,
        distributedMetrics: {
          fanout: fanoutMetrics,
          mergeDurationMs: NUM.ZERO,
          failedPartitionCount: failedPartitions.length
        }
      };
    }

    // Aggregate results
    const mergeStartTimeMs = Date.now();
    const aggregated = this.mergeEngine.mergePartitionResults(results, ast, this);
    const mergeDurationMs = Date.now() - mergeStartTimeMs;
    try {
      this.logger.info(METRICS_LOG_TAG.SELECT_DISTRIBUTED, {
        partitionCount: partitionIds.length,
        fanoutTotalLatencyMs: fanoutMetrics?.totalLatencyMs,
        fanoutMedianLatencyMs: fanoutMetrics?.medianLatencyMs,
        mergeDurationMs,
        totalRows: aggregated.rows.length,
        stragglerCount: fanoutMetrics?.stragglers?.length ?? NUM.ZERO,
        speculativeExecutions: fanoutMetrics?.speculativeExecutions ?? NUM.ZERO
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
        failedPartitionCount: NUM.ZERO
      }
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
        const planned = tablePlans.get ? tablePlans.get(joinAlias) || tablePlans.get(joinTableName) : tablePlans[joinAlias] || tablePlans[joinTableName];
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
    const {
      joinPartitions
    } = options;
    const fanoutMetrics = [];
    this.logger.debug(QUERY_LOG_MSG.EXECUTING_CROSS_PARTITION_JOIN, {
      mainTable: ast.from.name,
      mainPartitionCount: mainPartitionIds.length,
      joinCount: ast.joins.length
    });

    // Strategy: Fetch data from all tables in parallel, then perform JOIN in memory
    // This is a simple hash-join approach suitable for moderate data sizes

    // 1. Fetch main table data from all partitions
    const mainTableSql = this.buildSelectSQLWithoutJoins(ast);
    const mainResults = await this.executeOnPartitions(mainPartitionIds, mainTableSql, params, queryTimestamp, true, options.preferLeader || false, options.preferSameLatencyGroup === true, {
      deliveryPriority: options.deliveryPriority,
      timeoutMs: options.timeoutMs,
      cancellationToken: options.cancellationToken || null,
      tableName: ast.from.name
    });
    fanoutMetrics.push(this.getLastCoordinatorMetrics());
    const mainFailures = mainResults.filter(result => !result.success);
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
          failedPartitionCount: mainFailures.length
        }
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
        const joinResults = await this.executeOnPartitions(joinTablePartitions, joinSql, [], queryTimestamp, true, options.preferLeader || false, options.preferSameLatencyGroup === true, {
          deliveryPriority: options.deliveryPriority,
          timeoutMs: options.timeoutMs,
          cancellationToken: options.cancellationToken || null,
          tableName: joinTableName
        });
        fanoutMetrics.push(this.getLastCoordinatorMetrics());
        const joinFailures = joinResults.filter(result => !result.success);
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
              failedPartitionCount: joinFailures.length
            }
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
      resultRows = this.executeJoinByStrategy(resultRows, joinRows, join, leftTableRef, rightTableRef, strategy);
      leftTableRef = rightTableRef;
    }

    // 4. Apply remaining clauses (WHERE on joined data, GROUP BY, etc.)
    const mergeStartTimeMs = Date.now();
    const aggregated = this.mergeEngine.mergePartitionResults([{
      success: true,
      rows: resultRows
    }], ast, this);
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
        failedPartitionCount: NUM.ZERO
      }
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
    const {
      leftColumn,
      rightColumn
    } = this.extractJoinColumns(condition, leftTableName, rightTableName);
    if (!leftColumn || !rightColumn) {
      // Can't optimize, do nested loop join
      return this.nestedLoopJoin(leftRows, rightRows, condition, joinType, leftTableName, rightTableName);
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
          result.push(this.combineJoinRows(leftRow, rightRow, leftTableName, rightTableName));
          matchedRight.add(rightRow);
        }
      } else if (joinType === QUERY_JOIN_TYPE.LEFT || joinType === QUERY_JOIN_TYPE.LEFT_OUTER) {
        // Include left row with nulls for right columns
        const nullRight = {};
        if (rightRows.length > NUM.ZERO) {
          for (const col of Object.keys(rightRows[NUM.ZERO])) {
            nullRight[col] = null;
          }
        }
        result.push(this.combineJoinRows(leftRow, nullRight, leftTableName, rightTableName));
      }
    }

    // Handle RIGHT JOIN
    if (joinType === QUERY_JOIN_TYPE.RIGHT || joinType === QUERY_JOIN_TYPE.RIGHT_OUTER) {
      for (const rightRow of rightRows) {
        if (!matchedRight.has(rightRow)) {
          const nullLeft = {};
          if (leftRows.length > NUM.ZERO) {
            for (const col of Object.keys(leftRows[NUM.ZERO])) {
              nullLeft[col] = null;
            }
          }
          result.push(this.combineJoinRows(nullLeft, rightRow, leftTableName, rightTableName));
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
    if (!condition || condition.type !== QUERY_AST_NODE.BINARY || condition.operator !== QUERY_OPERATOR.EQUALS) {
      return {
        leftColumn: null,
        rightColumn: null
      };
    }
    const left = condition.left;
    const right = condition.right;
    if (left.type !== QUERY_AST_NODE.COLUMN_REF || right.type !== QUERY_AST_NODE.COLUMN_REF) {
      return {
        leftColumn: null,
        rightColumn: null
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
      rightColumn
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
  nestedLoopJoin(leftRows, rightRows, condition, joinType, leftTableRef = QUERY_EXECUTOR_LITERAL.STRING_LEFT, rightTableRef = QUERY_EXECUTOR_LITERAL.STRING_RIGHT) {
    const result = [];
    const matchedRight = new Set();
    for (const leftRow of leftRows) {
      let hasMatch = false;
      for (const rightRow of rightRows) {
        const combined = {
          ...leftRow,
          ...rightRow
        };
        if (this.evaluateExpression(combined, condition)) {
          result.push(this.combineJoinRows(leftRow, rightRow, leftTableRef, rightTableRef));
          matchedRight.add(rightRow);
          hasMatch = true;
        }
      }
      if (!hasMatch && (joinType === QUERY_JOIN_TYPE.LEFT || joinType === QUERY_JOIN_TYPE.LEFT_OUTER)) {
        const nullRight = {};
        if (rightRows.length > NUM.ZERO) {
          for (const col of Object.keys(rightRows[NUM.ZERO])) {
            nullRight[col] = null;
          }
        }
        result.push(this.combineJoinRows(leftRow, nullRight, leftTableRef, rightTableRef));
      }
    }
    if (joinType === QUERY_JOIN_TYPE.RIGHT || joinType === QUERY_JOIN_TYPE.RIGHT_OUTER) {
      for (const rightRow of rightRows) {
        if (!matchedRight.has(rightRow)) {
          const nullLeft = {};
          if (leftRows.length > NUM.ZERO) {
            for (const col of Object.keys(leftRows[NUM.ZERO])) {
              nullLeft[col] = null;
            }
          }
          result.push(this.combineJoinRows(nullLeft, rightRow, leftTableRef, rightTableRef));
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
  executeJoinByStrategy(leftRows, rightRows, join, leftTableRef, rightTableRef, strategy) {
    switch (strategy) {
      case DISTRIBUTED_JOIN_STRATEGY.BROADCAST:
        return this.performJoin(leftRows, rightRows, join, leftTableRef, rightTableRef);
      case DISTRIBUTED_JOIN_STRATEGY.REPARTITION:
        return this.performJoin(leftRows, rightRows, join, leftTableRef, rightTableRef);
      case DISTRIBUTED_JOIN_STRATEGY.NESTED_LOOP:
        return this.nestedLoopJoin(leftRows, rightRows, join.condition, (join.joinType || QUERY_JOIN_TYPE.INNER).toUpperCase(), leftTableRef, rightTableRef);
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
    const edge = joinPlan.find(entry => entry.leftAlias === leftTableRef && entry.rightAlias === rightTableRef) || joinPlan.find(entry => entry.rightAlias === rightTableRef);
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
      ...leftRow
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
  async executeOnPartitions(partitionIds, sql, params, _timestamp, forRead = false, preferLeader = false, preferSameLatencyGroup = false, executionOptions = {}) {
    const coordinatorResult = await this.parallelQueryCoordinator.executeParallel(sql, partitionIds, params, {
      forRead,
      preferLeader,
      preferSameLatencyGroup,
      deliveryPriority: executionOptions.deliveryPriority,
      routingReadinessDimension: executionOptions.routingReadinessDimension || this.defaultRoutingReadinessDimension,
      splitMirrorOrigin: executionOptions.splitMirrorOrigin || null,
      timestamp: _timestamp,
      timeoutMs: executionOptions.timeoutMs,
      cancellationToken: executionOptions.cancellationToken || null
    });
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
  async executeOnPartition(partitionId, sql, params, forRead, preferLeader, preferSameLatencyGroup, executionOptions = {}) {
    const cancellationToken = executionOptions?.cancellationToken || null;
    const failedTable = normalizeParticipantFailureString(executionOptions?.tableName);
    const executionTimeoutMs =
      Number.isFinite(executionOptions?.timeoutMs) &&
      executionOptions.timeoutMs > NUM.ZERO ?
        Math.floor(executionOptions.timeoutMs) :
        null;
    const executionDeadlineMs =
      executionTimeoutMs === null ?
        null :
        Date.now() + executionTimeoutMs;
    const getRemainingExecutionBudgetMs = () => {
      if (executionDeadlineMs === null) {
        return null;
      }
      return Math.max(NUM.ZERO, executionDeadlineMs - Date.now());
    };
    const buildRouterDeliveryOptions = () => {
      const routerOptions = {};
      if (typeof executionOptions?.deliveryPriority ===
          QUERY_EXECUTOR_LITERAL.STRING_STRING &&
          executionOptions.deliveryPriority.length > NUM.ZERO) {
        routerOptions.deliveryPriority = executionOptions.deliveryPriority;
      }
      const remainingBudgetMs = getRemainingExecutionBudgetMs();
      if (remainingBudgetMs !== null) {
        if (remainingBudgetMs <= NUM.ZERO) {
          return null;
        }
        routerOptions.timeoutMs = remainingBudgetMs;
      }
      if (Object.keys(routerOptions).length === NUM.ZERO) {
        return undefined;
      }
      return routerOptions;
    };
    const waitForRetryBudget = async (retryDelayMs) => {
      const normalizedRetryDelayMs =
        Number.isFinite(retryDelayMs) && retryDelayMs > NUM.ZERO ?
          Math.floor(retryDelayMs) :
          NUM.ZERO;
      const remainingBudgetMs = getRemainingExecutionBudgetMs();
      if (remainingBudgetMs === null) {
        if (normalizedRetryDelayMs > NUM.ZERO) {
          await this.delay(normalizedRetryDelayMs);
          this.throwIfCancelled(cancellationToken);
        }
        return true;
      }
      if (remainingBudgetMs <= NUM.ZERO) {
        return false;
      }
      if (normalizedRetryDelayMs > remainingBudgetMs) {
        return false;
      }
      if (normalizedRetryDelayMs > NUM.ZERO) {
        await this.delay(normalizedRetryDelayMs);
        this.throwIfCancelled(cancellationToken);
      }
      const nextRemainingBudgetMs = getRemainingExecutionBudgetMs();
      return nextRemainingBudgetMs === null || nextRemainingBudgetMs > NUM.ZERO;
    };
    this.throwIfCancelled(cancellationToken);
    const buildFailureResult = (errorMessage, details = {}) => ({
      partitionId,
      success: false,
      error: errorMessage || ERRORS.QUERY_FAILED,
      errorCode: normalizeParticipantFailureString(details?.errorCode || details?.code),
      retryAfterMs: normalizeParticipantRetryAfterMs(details?.retryAfterMs),
      deferRetry: details?.deferRetry === true,
      participantNodeId: normalizeParticipantFailureString(details?.participantNodeId),
      participantAddress: normalizeParticipantFailureString(details?.participantAddress),
      backpressured: resolveParticipantBackpressureState(details),
      failedTable,
      rows: []
    });
    const resolveRetryableLeaderFailureRetryAfterMs = (
      failure,
      participantNodeId,
    ) => {
      const explicitRetryAfterMs =
        normalizeParticipantRetryAfterMs(failure?.retryAfterMs);
      if (explicitRetryAfterMs !== null) {
        return explicitRetryAfterMs;
      }
      if (typeof participantNodeId !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
          participantNodeId.length === NUM.ZERO ||
          forRead ||
          typeof this.messageRouter?.getConnectionState !==
            QUERY_EXECUTOR_LITERAL.STRING_FUNCTION) {
        return null;
      }
      const errorMessage =
        typeof failure?.error === QUERY_EXECUTOR_LITERAL.STRING_STRING ?
          failure.error :
          (typeof failure?.message === QUERY_EXECUTOR_LITERAL.STRING_STRING ?
            failure.message :
            QUERY_EXECUTOR_LITERAL.STRING_VALUE);
      const errorCode =
        typeof failure?.errorCode === QUERY_EXECUTOR_LITERAL.STRING_STRING ?
          failure.errorCode :
          (typeof failure?.code === QUERY_EXECUTOR_LITERAL.STRING_STRING ?
            failure.code :
            null);
      if (!this.isLeaderUnavailable(errorMessage, errorCode)) {
        return null;
      }
      const connectionState =
        this.messageRouter.getConnectionState(participantNodeId);
      if (connectionState !== QUERY_EXECUTOR_LITERAL.STRING_RECONNECTING &&
          connectionState !== QUERY_EXECUTOR_LITERAL.STRING_DISCONNECTED) {
        return null;
      }
      const reconnectIntervalMs =
        Number(this.messageRouter?.reconnectIntervalMs);
      if (!Number.isFinite(reconnectIntervalMs) ||
          reconnectIntervalMs <= NUM.ZERO) {
        return null;
      }
      return Math.floor(reconnectIntervalMs);
    };

    // Validate dependencies
    if (!this.messageRouter) {
      this.logger.error(QUERY_LOG_MSG.MESSAGE_ROUTER_UNAVAILABLE, {
        partitionId
      });
      return {
        ...buildFailureResult(QUERY_ERROR_MSG.MESSAGE_ROUTER_UNAVAILABLE)
      };
    }
    if (!this.systemCache) {
      this.logger.error(LOG_MSG.SYSTEM_CACHE_NOT_AVAILABLE, {
        partitionId
      });
      return {
        ...buildFailureResult(ERRORS.SYSTEM_CACHE_NOT_AVAILABLE)
      };
    }
    const maxAttempts = forRead ?
      this.getReadRetryAttemptLimit() :
      this.getWriteRetryAttemptLimit(executionOptions);
    let lastError = null;
    let lastFailureDetails = null;
    let awaitedRoutingRepair = false;
    let awaitedRuntimeRoutingRepair = false;
    const routingReadinessDimension = executionOptions.routingReadinessDimension || this.defaultRoutingReadinessDimension;
    const allowReadinessAuthoritativeRefresh = this.shouldAllowRoutingAuthoritativeRefresh(executionOptions);
    const buildRequest = typeof executionOptions.buildRequest === 'function' ? executionOptions.buildRequest : () => {
      const request = {
        type: QUERY_MESSAGE_TYPE.QUERY,
        sql,
        params
      };
      if (typeof executionOptions.sessionId === 'string' && executionOptions.sessionId.length > NUM.ZERO) {
        request[QUERY_MESSAGE_FIELD_SESSION_ID] = executionOptions.sessionId;
      }
      if (executionOptions.splitMirrorOrigin) {
        request[QUERY_MESSAGE_FIELD_SPLIT_MIRROR_ORIGIN] = executionOptions.splitMirrorOrigin;
      }
      if (executionOptions.migrationOperation === MIGRATION_PARTITION_OPERATION.ALTER_TABLE) {
        request[QUERY_MESSAGE_FIELD_MIGRATION_OPERATION] = executionOptions.migrationOperation;
        if (executionOptions.migrationId) {
          request[QUERY_MESSAGE_FIELD_MIGRATION_ID] = executionOptions.migrationId;
        }
      }
      return request;
    };
    const isSuccessfulResponse = typeof executionOptions.isSuccessfulResponse === 'function' ? executionOptions.isSuccessfulResponse : response => response?.acknowledged && response?.success;
    const buildSuccessResult = typeof executionOptions.buildSuccessResult === 'function' ? executionOptions.buildSuccessResult : response => ({
      partitionId,
      success: true,
      rows: response.rows || [],
      changes: response.changes
    });
    for (let attempt = NUM.ONE; attempt <= maxAttempts; attempt++) {
      this.throwIfCancelled(cancellationToken);
      const attemptBudgetMs = getRemainingExecutionBudgetMs();
      if (attemptBudgetMs !== null && attemptBudgetMs <= NUM.ZERO) {
        return {
          ...buildFailureResult(lastError || ERRORS.QUERY_FAILED, lastFailureDetails)
        };
      }
      let {
        candidates: serviceCandidates,
        routingSnapshot
      } = this.resolvePartitionServiceCandidates(partitionId, forRead, preferLeader, preferSameLatencyGroup, routingReadinessDimension, {
        allowReadinessAuthoritativeRefresh
      });
      if (!awaitedRoutingRepair && serviceCandidates.length === NUM.ZERO && (await this.maybeAwaitDeniedPartitionRoutingRepair(routingSnapshot, {
        allowReadinessAuthoritativeRefresh
      }))) {
        awaitedRoutingRepair = true;
        this.throwIfCancelled(cancellationToken);
        ({
          candidates: serviceCandidates,
          routingSnapshot
        } = this.resolvePartitionServiceCandidates(partitionId, forRead, preferLeader, preferSameLatencyGroup, routingReadinessDimension, {
          allowReadinessAuthoritativeRefresh
        }));
      }
      serviceCandidates = this.prioritizeSessionPartitionAddress(serviceCandidates, routingSnapshot, executionOptions.sessionId, partitionId);
      if (serviceCandidates.length === NUM.ZERO) {
        const hasRoutableService = routingSnapshot.routableServiceCount > NUM.ZERO;
        const hasPartitionRecord = this.hasPartitionRecord(partitionId);
        if (!forRead) {
          if (hasRoutableService && attempt < maxAttempts) {
            lastError = ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE;
            if (!(await waitForRetryBudget(this.leaderRetryDelayMs))) {
              return {
                ...buildFailureResult(lastError, lastFailureDetails)
              };
            }
            continue;
          }
          if (!hasRoutableService && hasPartitionRecord && attempt < maxAttempts) {
            lastError = ERRORS.PARTITION_SERVICE_NOT_FOUND;
            if (!(await waitForRetryBudget(this.leaderRetryDelayMs))) {
              return {
                ...buildFailureResult(lastError, lastFailureDetails)
              };
            }
            continue;
          }
          if (hasRoutableService) {
            this.logger.warn(QUERY_LOG_MSG.NO_LEADER_SERVICE_FOR_PARTITION, {
              partitionId,
              attempts: attempt
            });
            return {
              ...buildFailureResult(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE)
            };
          }
          if (!hasRoutableService) {
            this.logNoServiceForPartition(partitionId, routingSnapshot);
            return {
              ...buildFailureResult(QUERY_ERROR_MSG.PARTITION_SERVICE_NOT_FOUND)
            };
          }
        } else {
          // §1.10/§1.12: Reads get bounded retries so routing
          // repair and cache convergence can discover candidates.
          if (hasPartitionRecord && attempt < maxAttempts) {
            lastError = QUERY_ERROR_MSG.PARTITION_SERVICE_NOT_FOUND;
            if (!(await waitForRetryBudget(this.leaderRetryDelayMs))) {
              return {
                ...buildFailureResult(lastError, lastFailureDetails)
              };
            }
            continue;
          }
          this.logNoServiceForPartition(partitionId, routingSnapshot);
          return {
            ...buildFailureResult(QUERY_ERROR_MSG.PARTITION_SERVICE_NOT_FOUND)
          };
        }
      }
      const candidateQueue = [...serviceCandidates];
      const attemptedAddresses = new Set();
      let retryCurrentAddressOnNextAttempt = false;
      let deferPartitionRetryOnNextAttempt = false;
      let leaderRecoveryQueued = false;
      const queueLeaderRecoveryCandidates = () => {
        if (forRead || leaderRecoveryQueued) {
          return;
        }
        const recoveryCandidates = this.getLeaderRecoveryCandidates(routingSnapshot, attemptedAddresses, preferSameLatencyGroup);
        if (recoveryCandidates.length === 0) {
          return;
        }
        leaderRecoveryQueued = true;
        candidateQueue.push(...recoveryCandidates);
      };
      const buildCandidateFailureDetails = (failure, participantNodeId, participantAddress) => ({
        errorCode: failure?.errorCode || failure?.code,
        retryAfterMs: resolveRetryableLeaderFailureRetryAfterMs(
          failure,
          participantNodeId,
        ),
        deferRetry: failure?.deferRetry,
        participantNodeId,
        participantAddress,
        backpressured: resolveParticipantBackpressureState(failure)
      });
      const recordCandidateFailure = (errorMessage, failure, participantNodeId, participantAddress) => {
        lastError = errorMessage;
        lastFailureDetails = buildCandidateFailureDetails(failure, participantNodeId, participantAddress);
      };
      const requestRetryCurrentAddress = () => {
        retryCurrentAddressOnNextAttempt = true;
      };
      const requestDeferredPartitionRetry = () => {
        deferPartitionRetryOnNextAttempt = true;
      };
      for (let candidateIndex = NUM.ZERO; candidateIndex < candidateQueue.length; candidateIndex += NUM.ONE) {
        const serviceInfo = candidateQueue[candidateIndex];
        const {
          address
        } = serviceInfo;
        attemptedAddresses.add(address);
        this.logger.debug(QUERY_LOG_MSG.ROUTING_QUERY_TO_PARTITION, {
          partitionId,
          address
        });
        try {
          this.throwIfCancelled(cancellationToken);
          const request = buildRequest({
            partitionId,
            address,
            sql,
            params,
            executionOptions
          });
          const attemptRouterDeliveryOptions = buildRouterDeliveryOptions();
          if (attemptRouterDeliveryOptions === null) {
            return {
              ...buildFailureResult(lastError || ERRORS.QUERY_FAILED, lastFailureDetails)
            };
          }
          const response = await this.messageRouter.deliver(
            address,
            request,
            attemptRouterDeliveryOptions,
          );
          this.throwIfCancelled(cancellationToken);
          if (isSuccessfulResponse(response)) {
            this.clearTemporarilyUnroutableAddress(partitionId, address);
            if (executionOptions.clearSessionPartitionAffinityOnSuccess === true) {
              this.clearSessionPartitionAddress(executionOptions.sessionId, partitionId);
            } else {
              this.setSessionPartitionAddress(executionOptions.sessionId, partitionId, address);
            }
            return buildSuccessResult(response, {
              partitionId,
              address,
              request,
              executionOptions
            });
          }

          // Handle leader redirect response - immediately retry with provided address
          if (response.redirect === QUERY_RESPONSE_TYPE.LEADER_REDIRECT && response.leaderAddress) {
            this.logger.debug(QUERY_LOG_MSG.FOLLOWING_LEADER_REDIRECT, {
              partitionId,
              fromAddress: address,
              leaderAddress: response.leaderAddress
            });
            const redirectRouterDeliveryOptions =
              buildRouterDeliveryOptions();
            if (redirectRouterDeliveryOptions === null) {
              return {
                ...buildFailureResult(lastError || errorMessage, lastFailureDetails)
              };
            }
            const redirectResponse = await this.messageRouter.deliver(
              response.leaderAddress,
              buildRequest({
                partitionId,
                address: response.leaderAddress,
                redirectedFromAddress: address,
                leaderAddress: response.leaderAddress,
                sql,
                params,
                executionOptions
              }),
              redirectRouterDeliveryOptions,
            );
            if (isSuccessfulResponse(redirectResponse)) {
              this.clearTemporarilyUnroutableAddress(partitionId, response.leaderAddress);
              if (executionOptions.clearSessionPartitionAffinityOnSuccess === true) {
                this.clearSessionPartitionAddress(executionOptions.sessionId, partitionId);
              } else {
                this.setSessionPartitionAddress(executionOptions.sessionId, partitionId, response.leaderAddress);
              }
              return buildSuccessResult(redirectResponse, {
                partitionId,
                address: response.leaderAddress,
                redirectedFromAddress: address,
                executionOptions
              });
            }

            // Redirect target also failed - continue to next candidate
            const redirectFailureMessage =
              redirectResponse.error || ERRORS.QUERY_FAILED;
            const redirectRetryDecision =
              this.resolveControlPlaneWriteRetryDecision(
                partitionId,
                executionOptions,
                redirectResponse,
                forRead,
              );
            recordCandidateFailure(
              redirectFailureMessage,
              redirectResponse,
              serviceInfo?.nodeId,
              response.leaderAddress,
            );
            if (redirectRetryDecision.state ===
              CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.RETRY_SAME_ADDRESS) {
              requestRetryCurrentAddress();
              break;
            }
            if (redirectRetryDecision.state ===
              CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.DEFER_PARTITION_RETRY) {
              requestDeferredPartitionRetry();
              break;
            }
            if (redirectRetryDecision.state ===
              CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.WIDEN_TO_RECOVERY_CANDIDATE) {
              queueLeaderRecoveryCandidates();
            }
            continue;
          }
          if (response.noHandler) {
            const errorMessage = response.error || `${ERRORS.NO_HANDLER_FOR_ADDRESS} ${address}`;
            const witnessedService = this.findRoutingSnapshotService(routingSnapshot, serviceInfo, address);
            this.logger.warn(QUERY_LOG_MSG.NO_HANDLER_FOR_PARTITION, {
              partitionId,
              address
            });
            this.markTemporarilyUnroutableAddress(partitionId, address, witnessedService);
            if (this.getSessionPartitionAddress(executionOptions.sessionId, partitionId) === address) {
              this.clearSessionPartitionAddress(executionOptions.sessionId, partitionId);
            }
            if (!awaitedRuntimeRoutingRepair && (await this.maybeAwaitRuntimeRoutingRepair(routingSnapshot, {
              partitionId,
              participantNodeId: serviceInfo?.nodeId || null,
              routingReadinessDimension,
              allowReadinessAuthoritativeRefresh,
              refreshReason: QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE
            }))) {
              awaitedRuntimeRoutingRepair = true;
              const refreshedResolution = this.resolvePartitionServiceCandidates(partitionId, forRead, preferLeader, preferSameLatencyGroup, routingReadinessDimension, {
                allowReadinessAuthoritativeRefresh
              });
              routingSnapshot = refreshedResolution.routingSnapshot;
              const refreshedRecoveryCandidates = this.getLeaderRecoveryCandidates(routingSnapshot, attemptedAddresses, preferSameLatencyGroup);
              if (refreshedRecoveryCandidates.length > NUM.ZERO) {
                candidateQueue.push(...refreshedRecoveryCandidates);
              }
            }
            recordCandidateFailure(errorMessage, response, serviceInfo?.nodeId, address);
            if (!forRead && this.isLeaderUnavailable(errorMessage, response?.errorCode)) {
              queueLeaderRecoveryCandidates();
              continue;
            }
            continue;
          }
          const errorMessage = response.error || ERRORS.QUERY_FAILED;
          const controlPlaneWriteRetryDecision =
            this.resolveControlPlaneWriteRetryDecision(
              partitionId,
              executionOptions,
              {
                error: errorMessage,
                errorCode: response?.errorCode,
                retryAfterMs: response?.retryAfterMs,
                deferRetry: response?.deferRetry
              },
              forRead,
            );
          if (controlPlaneWriteRetryDecision.state !==
            CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.NONE) {
            recordCandidateFailure(errorMessage, response, serviceInfo?.nodeId, address);
            if (controlPlaneWriteRetryDecision.state ===
              CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.RETRY_SAME_ADDRESS) {
              requestRetryCurrentAddress();
              break;
            }
            if (controlPlaneWriteRetryDecision.state ===
              CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.DEFER_PARTITION_RETRY) {
              requestDeferredPartitionRetry();
              break;
            }
            queueLeaderRecoveryCandidates();
            continue;
          }
          if (!forRead && this.isLeaderUnavailable(errorMessage, response?.errorCode)) {
            recordCandidateFailure(errorMessage, response, serviceInfo?.nodeId, address);
            if (this.getSessionPartitionAddress(executionOptions.sessionId, partitionId) === address) {
              this.clearSessionPartitionAddress(executionOptions.sessionId, partitionId);
            }
            queueLeaderRecoveryCandidates();
            continue;
          }

          // §1.12: For reads, treat transient failures as reasons
          // to try the next candidate rather than hard-failing.
          if (forRead) {
            this.logger.debug(QUERY_LOG_MSG.READ_CANDIDATE_TRANSIENT_FAILURE, {
              partitionId,
              address
            });
            recordCandidateFailure(errorMessage, response, serviceInfo?.nodeId, address);
            continue;
          }
          return {
            ...buildFailureResult(errorMessage, {
              errorCode: response?.errorCode,
              retryAfterMs: response?.retryAfterMs,
              deferRetry: response?.deferRetry,
              participantNodeId: serviceInfo?.nodeId,
              participantAddress: address,
              backpressured: resolveParticipantBackpressureState(response)
            })
          };
        } catch (error) {
          const errorMessage = typeof error?.message === 'string' && error.message.length > NUM.ZERO ? error.message : ERRORS.QUERY_FAILED;
          if (this.isNoHandlerFailure(errorMessage)) {
            const witnessedService = this.findRoutingSnapshotService(routingSnapshot, serviceInfo, address);
            this.logger.warn(QUERY_LOG_MSG.NO_HANDLER_FOR_PARTITION, {
              partitionId,
              address
            });
            this.markTemporarilyUnroutableAddress(partitionId, address, witnessedService);
            if (this.getSessionPartitionAddress(executionOptions.sessionId, partitionId) === address) {
              this.clearSessionPartitionAddress(executionOptions.sessionId, partitionId);
            }
            if (!awaitedRuntimeRoutingRepair && (await this.maybeAwaitRuntimeRoutingRepair(routingSnapshot, {
              partitionId,
              participantNodeId: serviceInfo?.nodeId || null,
              routingReadinessDimension,
              allowReadinessAuthoritativeRefresh,
              refreshReason: QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE
            }))) {
              awaitedRuntimeRoutingRepair = true;
              const refreshedResolution = this.resolvePartitionServiceCandidates(partitionId, forRead, preferLeader, preferSameLatencyGroup, routingReadinessDimension, {
                allowReadinessAuthoritativeRefresh
              });
              routingSnapshot = refreshedResolution.routingSnapshot;
              const refreshedRecoveryCandidates = this.getLeaderRecoveryCandidates(routingSnapshot, attemptedAddresses, preferSameLatencyGroup);
              if (refreshedRecoveryCandidates.length > NUM.ZERO) {
                candidateQueue.push(...refreshedRecoveryCandidates);
              }
            }
            recordCandidateFailure(errorMessage, error, serviceInfo?.nodeId, address);
            if (!forRead) {
              if (this.getSessionPartitionAddress(executionOptions.sessionId, partitionId) === address) {
                this.clearSessionPartitionAddress(executionOptions.sessionId, partitionId);
              }
              queueLeaderRecoveryCandidates();
            }
            continue;
          }
          if (!forRead && this.isLeaderUnavailable(errorMessage, error?.code || error?.errorCode)) {
            const controlPlaneWriteRetryDecision =
              this.resolveControlPlaneWriteRetryDecision(
                partitionId,
                executionOptions,
                error,
                forRead,
              );
            if (controlPlaneWriteRetryDecision.state !==
              CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.NONE) {
              recordCandidateFailure(errorMessage, error, serviceInfo?.nodeId, address);
              if (controlPlaneWriteRetryDecision.state ===
                CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.RETRY_SAME_ADDRESS) {
                requestRetryCurrentAddress();
                break;
              }
              if (controlPlaneWriteRetryDecision.state ===
                CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.DEFER_PARTITION_RETRY) {
                requestDeferredPartitionRetry();
                break;
              }
              queueLeaderRecoveryCandidates();
              continue;
            }
            recordCandidateFailure(errorMessage, error, serviceInfo?.nodeId, address);
            if (this.getSessionPartitionAddress(executionOptions.sessionId, partitionId) === address) {
              this.clearSessionPartitionAddress(executionOptions.sessionId, partitionId);
            }
            queueLeaderRecoveryCandidates();
            continue;
          }
          const controlPlaneWriteRetryDecision =
            this.resolveControlPlaneWriteRetryDecision(
              partitionId,
              executionOptions,
              error,
              forRead,
            );
          if (controlPlaneWriteRetryDecision.state !==
            CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.NONE) {
            recordCandidateFailure(errorMessage, error, serviceInfo?.nodeId, address);
            if (controlPlaneWriteRetryDecision.state ===
              CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.RETRY_SAME_ADDRESS) {
              requestRetryCurrentAddress();
              break;
            }
            if (controlPlaneWriteRetryDecision.state ===
              CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.DEFER_PARTITION_RETRY) {
              requestDeferredPartitionRetry();
              break;
            }
            queueLeaderRecoveryCandidates();
            continue;
          }

          // §1.12: For reads, catch transient transport errors
          // and try the next candidate.
          if (forRead) {
            this.logger.debug(QUERY_LOG_MSG.READ_CANDIDATE_TRANSIENT_FAILURE, {
              partitionId,
              address,
              error: errorMessage
            });
            recordCandidateFailure(errorMessage, error, serviceInfo?.nodeId, address);
            continue;
          }
          this.logger.error(QUERY_LOG_MSG.QUERY_ROUTING_FAILED, {
            partitionId,
            address,
            error: errorMessage
          });
          throw error;
        }
      }
      if (retryCurrentAddressOnNextAttempt) {
        if (attempt < maxAttempts) {
          const retryDelayMs =
            Number.isFinite(lastFailureDetails?.retryAfterMs) &&
            lastFailureDetails.retryAfterMs > NUM.ZERO ?
              Math.max(this.leaderRetryDelayMs,
                lastFailureDetails.retryAfterMs) :
              this.leaderRetryDelayMs;
          if (!(await waitForRetryBudget(retryDelayMs))) {
            return {
              ...buildFailureResult(lastError || ERRORS.QUERY_FAILED, lastFailureDetails)
            };
          }
          continue;
        }
        return {
          ...buildFailureResult(lastError || ERRORS.QUERY_FAILED, lastFailureDetails)
        };
      }
      if (deferPartitionRetryOnNextAttempt) {
        if (attempt < maxAttempts) {
          const retryDelayMs =
            Number.isFinite(lastFailureDetails?.retryAfterMs) &&
            lastFailureDetails.retryAfterMs > NUM.ZERO ?
              Math.max(this.leaderRetryDelayMs,
                lastFailureDetails.retryAfterMs) :
              this.leaderRetryDelayMs;
          if (!(await waitForRetryBudget(retryDelayMs))) {
            return {
              ...buildFailureResult(lastError || ERRORS.QUERY_FAILED, lastFailureDetails)
            };
          }
          continue;
        }
        return {
          ...buildFailureResult(lastError || ERRORS.QUERY_FAILED, lastFailureDetails)
        };
      }
      if (attempt < maxAttempts) {
        const retryDelayMs =
          Number.isFinite(lastFailureDetails?.retryAfterMs) &&
          lastFailureDetails.retryAfterMs > NUM.ZERO ?
            Math.max(this.leaderRetryDelayMs,
              lastFailureDetails.retryAfterMs) :
            this.leaderRetryDelayMs;
        if (!(await waitForRetryBudget(retryDelayMs))) {
          return {
            ...buildFailureResult(lastError || ERRORS.QUERY_FAILED, lastFailureDetails)
          };
        }
      }
    }
    return {
      ...buildFailureResult(lastError || ERRORS.QUERY_FAILED, lastFailureDetails)
    };
  }

  /**
   * Queue alternative live replica targets after the canonical leader path has
   * been disproven at runtime.
   * @param {Object|null} routingSnapshot
   * @param {Set<string>} attemptedAddresses
   * @param {boolean} preferSameLatencyGroup
   * @return {Array<Object>}
   * @private
   */
  getLeaderRecoveryCandidates(routingSnapshot, attemptedAddresses = new Set(), preferSameLatencyGroup = false) {
    const routableServices = Array.isArray(routingSnapshot?.routableServices) ? routingSnapshot.routableServices : [];
    const localGroupId = this.resolveNodeLatencyGroupId(this.nodeId);
    const orderedServices = this.orderServicesByLatencyGroup(routableServices, localGroupId, preferSameLatencyGroup);
    const candidates = [];
    const seen = new Set();
    for (const service of orderedServices) {
      const address = service?.address;
      if (typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING || address.length === NUM.ZERO || this.isTemporarilyUnroutableAddress(routingSnapshot?.partitionId || null, address, service) || attemptedAddresses.has(address)) {
        continue;
      }
      const dedupeKey = service.service_id || service.replica_id || address;
      if (!dedupeKey || seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      candidates.push({
        address,
        nodeId: service.node_id,
        replicaId: service.service_id || service.replica_id
      });
    }
    return candidates;
  }

  /**
   * Collect node IDs that should be refreshed when runtime routing disproves
   * local partition-service metadata.
   * @param {Object|null} routingSnapshot
   * @param {string|null} participantNodeId
   * @return {Array<string>}
   * @private
   */
  collectRuntimeRoutingRepairNodeIds(routingSnapshot, participantNodeId = null) {
    const repairNodeIds = [];
    const seen = new Set();
    const addNodeId = nodeId => {
      if (typeof nodeId !== 'string' || nodeId.length === NUM.ZERO || seen.has(nodeId)) {
        return;
      }
      seen.add(nodeId);
      repairNodeIds.push(nodeId);
    };
    addNodeId(participantNodeId);
    addNodeId(routingSnapshot?.canonicalLeaderNodeId || null);
    return repairNodeIds;
  }

  /**
   * Await one authoritative node/service refresh when runtime routing shows a
   * stale service address (for example, no handler at a cached partition
   * service endpoint).
   * @param {Object|null} routingSnapshot
   * @param {Object} [options]
   * @return {Promise<boolean>}
   * @private
   */
  async maybeAwaitRuntimeRoutingRepair(routingSnapshot, options = {}) {
    const allowReadinessAuthoritativeRefresh = this.shouldAllowRoutingAuthoritativeRefresh(options);
    const routingReadinessDimension = options.routingReadinessDimension || routingSnapshot?.routingReadinessDimension || this.defaultRoutingReadinessDimension;
    let repaired = false;
    if (allowReadinessAuthoritativeRefresh && this.controlPlaneReadinessService && typeof this.controlPlaneReadinessService.getNodeReadiness === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION) {
      const repairNodeIds = this.collectRuntimeRoutingRepairNodeIds(routingSnapshot, options.participantNodeId || null);
      if (repairNodeIds.length > NUM.ZERO) {
        await Promise.all(repairNodeIds.map(async nodeId => {
          try {
            await this.controlPlaneReadinessService.getNodeReadiness(nodeId, {
              allowAuthoritativeRefresh: true,
              requireFreshOnIneligible: true,
              forceAuthoritativeRefresh: true,
              maxCachedAgeMs: NUM.ZERO,
              decisionDimension: routingReadinessDimension,
              refreshReason: options.refreshReason || QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE
            });
            repaired = true;
          } catch (_error) {
            return null;
          }
          return null;
        }));
      }
    }
    const routingOverlay = this.routingMetadataOverlay;
    if (routingOverlay && typeof routingOverlay.refreshPartitionRouting === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION) {
      const overlayRepaired = await this.refreshRoutingMetadataOverlay(routingSnapshot, {
        partitionId: options.partitionId,
        participantNodeId: options.participantNodeId || null,
        routingReadinessDimension,
        refreshReason: options.refreshReason || QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE
      });
      repaired = overlayRepaired === true || repaired;
    }
    return repaired;
  }

  /**
   * Refresh authoritative overlay service metadata for one partition.
   * @param {Object|null} routingSnapshot
   * @param {Object} [options]
   * @return {Promise<boolean>}
   * @private
   */
  async refreshRoutingMetadataOverlay(routingSnapshot, options = {}) {
    const routingOverlay = this.routingMetadataOverlay;
    if (!routingOverlay || typeof routingOverlay.refreshPartitionRouting !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION) {
      return false;
    }
    const partitionId = typeof options.partitionId === 'string' && options.partitionId.length > NUM.ZERO ? options.partitionId : routingSnapshot?.partitionId || null;
    if (typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING || partitionId.length === NUM.ZERO) {
      return false;
    }
    const routingReadinessDimension = options.routingReadinessDimension || routingSnapshot?.routingReadinessDimension || this.defaultRoutingReadinessDimension;
    try {
      return (await routingOverlay.refreshPartitionRouting(partitionId, {
        partitionId,
        participantNodeId: options.participantNodeId || null,
        routingReadinessDimension,
        routingSnapshot,
        refreshReason: options.refreshReason || QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE
      })) === true;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Authoritative owner-RPC reads must not recurse back into routing-triggered
   * readiness repair, or the repair path can re-enter itself through query
   * routing.
   * @param {Object} [options={}]
   * @return {boolean}
   * @private
   */
  shouldAllowRoutingAuthoritativeRefresh(options = {}) {
    return options?.allowReadinessAuthoritativeRefresh !== false;
  }

  /**
   * Get write retry attempt limit for transient leader-election gaps.
   * @return {number} Maximum attempts.
   * @private
   */
  getWriteRetryAttemptLimit(options = {}) {
    const maxRecoveryAttempts = NUM.TEN * NUM.FOUR;
    const retryDelayMs = Math.max(this.leaderRetryDelayMs || NUM.ZERO, NUM.ONE);
    const executionTimeoutMs =
      Number.isFinite(options?.timeoutMs) &&
      options.timeoutMs > NUM.ZERO ?
        Math.floor(options.timeoutMs) :
        this.queryTimeoutMs;
    const timeoutBoundAttempts = Math.ceil(executionTimeoutMs / retryDelayMs);
    const boundedAttempts = Math.min(timeoutBoundAttempts, maxRecoveryAttempts);
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
   * Check if an error represents a stale no-handler transport witness.
   * @param {string} errorMessage - Error message.
   * @return {boolean}
   * @private
   */
  isNoHandlerFailure(errorMessage) {
    return typeof errorMessage === QUERY_EXECUTOR_LITERAL.STRING_STRING && errorMessage.includes(ERRORS.NO_HANDLER_FOR_ADDRESS);
  }

  /**
   * Check if an error indicates missing partition leadership.
   * @param {string} errorMessage - Error message.
   * @return {boolean} True if leader is unavailable.
   * @private
   */
  isLeaderUnavailable(errorMessage, errorCode = null) {
    if (errorCode === QUERY_EXECUTOR_LITERAL.STRING_ROUTER_CONNECTION_CLOSED) {
      return true;
    }
    return errorMessage && (errorMessage.includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE) || errorMessage.includes(TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT) || errorMessage.includes(ERRORS.NO_HANDLER_FOR_ADDRESS) || errorMessage.includes(QUERY_EXECUTOR_LITERAL.STRING_CONNECTION_TO_NODE) && errorMessage.includes(QUERY_EXECUTOR_LITERAL.STRING_CLOSED) || errorMessage.includes(QUERY_EXECUTOR_LITERAL.STRING_NO_CONNECTION_TO_NODE) || errorMessage.includes(QUERY_EXECUTOR_LITERAL.STRING_FAILED_TO_FORWARD_WRITE_TO_LEADER));
  }

  /**
   * Resolve the logical table name for one partition.
   * @param {string} partitionId
   * @return {string|null}
   * @private
   */
  resolvePartitionTableName(partitionId) {
    const partition = this.getPartitionRecord(partitionId);
    const tableName = partition?.[COLUMN.TABLE_NAME] ?? partition?.table_name ?? partition?.tableName ?? partition?.table_id ?? partition?.tableId ?? null;
    if (typeof tableName === QUERY_EXECUTOR_LITERAL.STRING_STRING && tableName.length > NUM.ZERO) {
      return tableName;
    }
    if (typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING || partitionId.length === NUM.ZERO) {
      return null;
    }
    const fallbackTableName = partitionId.replace(/-p\d+$/, '');
    return fallbackTableName.length > NUM.ZERO ? fallbackTableName : null;
  }

  /**
   * Check whether one routed failure should widen to alternative live
   * candidates for system-table writes.
   * @param {string} partitionId
   * @param {Object} failure
   * @param {boolean} forRead
   * @return {boolean}
   * @private
   */
  isRetryableControlPlaneWriteFailure(partitionId, failure, forRead = false) {
    if (forRead) {
      return false;
    }
    const tableName = this.resolvePartitionTableName(partitionId);
    if (!SYSTEM_TABLE_NAMES.has(String(tableName || QUERY_EXECUTOR_LITERAL.STRING_VALUE))) {
      return false;
    }
    return isRetryableControlPlaneError(failure);
  }

  /**
   * Resolve the canonical retry decision for routed control-plane writes.
   * Deferred transport failures must pause the current partition attempt so
   * reconnect timers can complete before the next write attempt is issued.
   * @param {string} partitionId
   * @param {Object} executionOptions
   * @param {Object} failure
   * @param {boolean} forRead
   * @return {{state:string}}
   * @private
   */
  resolveControlPlaneWriteRetryDecision(partitionId, executionOptions, failure, forRead = false) {
    const retryAfterMs =
      normalizeParticipantRetryAfterMs(failure?.retryAfterMs);
    const deferredFailure =
      failure?.deferRetry === true ||
      (Number.isFinite(retryAfterMs) && retryAfterMs > NUM.ZERO);
    const tableName = this.resolvePartitionTableName(partitionId);
    const systemTableWrite =
      !forRead &&
      SYSTEM_TABLE_NAMES.has(
        String(tableName || QUERY_EXECUTOR_LITERAL.STRING_VALUE),
      );
    if (systemTableWrite && deferredFailure) {
      return {
        state: CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.DEFER_PARTITION_RETRY
      };
    }
    const retryable =
      this.isRetryableControlPlaneWriteFailure(partitionId, failure, forRead);
    if (!retryable) {
      return {
        state: CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.NONE
      };
    }
    if (this.shouldRetryTransactionActiveWriteOnSameAddress(
      partitionId,
      executionOptions,
      failure,
      forRead,
    )) {
      return {
        state: CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.RETRY_SAME_ADDRESS
      };
    }
    return {
      state: CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.WIDEN_TO_RECOVERY_CANDIDATE
    };
  }

  /**
   * Session-bound transactional control-plane writes must stay on the replica
   * that already owns the in-flight transaction instead of widening to a
   * different live replica mid-attempt.
   * @param {string} partitionId
   * @param {Object} executionOptions
   * @param {Object} failure
   * @param {boolean} forRead
   * @return {boolean}
   * @private
   */
  shouldRetryTransactionActiveWriteOnSameAddress(partitionId, executionOptions, failure, forRead = false) {
    if (!this.isRetryableControlPlaneWriteFailure(partitionId, failure, forRead)) {
      return false;
    }
    if (typeof executionOptions?.sessionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING || executionOptions.sessionId.length <= NUM.ZERO) {
      return false;
    }
    const failureMessage = typeof failure?.message === 'string' ? failure.message : typeof failure?.error === 'string' ? failure.error : '';
    return failureMessage.includes(PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE);
  }

  /**
   * Delay helper for retry backoff.
   * @param {number} delayMs - Delay duration in ms.
   * @return {Promise<void>}
   * @private
   */
  async delay(delayMs) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  /**
   * Throw when cooperative cancellation has been requested.
   * @param {Object|null} cancellationToken
   * @private
   */
  throwIfCancelled(cancellationToken) {
    if (!cancellationToken || typeof cancellationToken.throwIfCancelled !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION) {
      return;
    }
    cancellationToken.throwIfCancelled();
  }

  /**
   * Mark one partition service endpoint as temporarily unroutable after a
   * runtime no-handler witness so follow-up calls do not immediately retry the
   * same stale address.
   * @param {string} partitionId
   * @param {string} address
   * @private
   */
  markTemporarilyUnroutableAddress(partitionId, address, service = null) {
    if (typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING || partitionId.length === NUM.ZERO || typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING || address.length === NUM.ZERO) {
      return;
    }
    const expiresAt = Date.now() + this.resolveNoHandlerAddressQuarantineMs(partitionId);
    const fingerprint = buildPartitionServiceWitnessFingerprint(service);
    const existing = this.temporarilyUnroutableAddressesByPartition.get(partitionId);
    if (existing instanceof Map) {
      existing.set(address, Object.freeze({
        expiresAt,
        fingerprint
      }));
      return;
    }
    const addressExpiryMap = new Map();
    addressExpiryMap.set(address, Object.freeze({
      expiresAt,
      fingerprint
    }));
    this.temporarilyUnroutableAddressesByPartition.set(partitionId, addressExpiryMap);
  }

  /**
   * Clear one temporary unroutable endpoint marker after a successful route.
   * @param {string} partitionId
   * @param {string} address
   * @private
   */
  clearTemporarilyUnroutableAddress(partitionId, address) {
    if (typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING || partitionId.length === NUM.ZERO || typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING || address.length === NUM.ZERO) {
      return;
    }
    const existing = this.temporarilyUnroutableAddressesByPartition.get(partitionId);
    if (!(existing instanceof Map)) {
      return;
    }
    existing.delete(address);
    if (existing.size === NUM.ZERO) {
      this.temporarilyUnroutableAddressesByPartition.delete(partitionId);
    }
  }

  /**
   * Return true when one partition endpoint is still inside the temporary
   * no-handler quarantine window.
   * @param {string} partitionId
   * @param {string} address
   * @return {boolean}
   * @private
   */
  isTemporarilyUnroutableAddress(partitionId, address, service = null) {
    if (typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING || partitionId.length === NUM.ZERO || typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING || address.length === NUM.ZERO) {
      return false;
    }
    const existing = this.temporarilyUnroutableAddressesByPartition.get(partitionId);
    if (!(existing instanceof Map)) {
      return false;
    }
    const entry = existing.get(address);
    const expiresAt = Number.isFinite(entry) ? entry : Number.isFinite(entry?.expiresAt) ? entry.expiresAt : null;
    if (!Number.isFinite(expiresAt)) {
      existing.delete(address);
      if (existing.size === NUM.ZERO) {
        this.temporarilyUnroutableAddressesByPartition.delete(partitionId);
      }
      return false;
    }
    const currentFingerprint = buildPartitionServiceWitnessFingerprint(service);
    if (typeof entry?.fingerprint === QUERY_EXECUTOR_LITERAL.STRING_STRING && entry.fingerprint.length > NUM.ZERO && typeof currentFingerprint === QUERY_EXECUTOR_LITERAL.STRING_STRING && currentFingerprint.length > NUM.ZERO && currentFingerprint !== entry.fingerprint) {
      existing.delete(address);
      if (existing.size === NUM.ZERO) {
        this.temporarilyUnroutableAddressesByPartition.delete(partitionId);
      }
      return false;
    }
    if (expiresAt > Date.now()) {
      return true;
    }
    existing.delete(address);
    if (existing.size === NUM.ZERO) {
      this.temporarilyUnroutableAddressesByPartition.delete(partitionId);
    }
    return false;
  }

  /**
   * Resolve the quarantine duration for one runtime no-handler witness.
   * Control-plane partitions keep stale addresses shadowed longer so routed
   * writes stop chasing cache rows that lag behind removal/publication.
   * @param {string} partitionId
   * @return {number}
   * @private
   */
  resolveNoHandlerAddressQuarantineMs(partitionId) {
    if (this.noHandlerAddressQuarantineMsExplicit) {
      return this.noHandlerAddressQuarantineMs;
    }
    const tableName = this.resolvePartitionTableName(partitionId);
    if (SYSTEM_TABLE_NAMES.has(String(tableName || QUERY_EXECUTOR_LITERAL.STRING_VALUE))) {
      return Math.max(this.noHandlerAddressQuarantineMs, QUERY_DEFAULTS.CONTROL_PLANE_NO_HANDLER_ADDRESS_QUARANTINE_MS);
    }
    return this.noHandlerAddressQuarantineMs;
  }

  /**
   * Resolve the routed service row that produced the current delivery target.
   * @param {Object|null} routingSnapshot
   * @param {Object|null} serviceInfo
   * @param {string|null} address
   * @return {Object|null}
   * @private
   */
  findRoutingSnapshotService(routingSnapshot, serviceInfo, address) {
    const serviceRows = Array.isArray(routingSnapshot?.serviceRows) ? routingSnapshot.serviceRows : [];
    const replicaId = typeof serviceInfo?.replicaId === 'string' && serviceInfo.replicaId.length > NUM.ZERO ? serviceInfo.replicaId : null;
    const nodeId = typeof serviceInfo?.nodeId === 'string' && serviceInfo.nodeId.length > NUM.ZERO ? serviceInfo.nodeId : null;
    const normalizedAddress = typeof address === 'string' && address.length > NUM.ZERO ? address : null;
    for (const service of serviceRows) {
      if (replicaId && (service?.service_id === replicaId || service?.replica_id === replicaId)) {
        return service;
      }
      if (normalizedAddress && service?.address === normalizedAddress) {
        return service;
      }
    }
    if (nodeId) {
      return serviceRows.find(service => service?.node_id === nodeId) || null;
    }
    return null;
  }

  /**
   * Get partition service candidates in preferred order.
   * @param {string} partitionId - Partition ID.
   * @param {boolean} forRead - True when executing read-only queries.
   * @return {Array<Object>} Ordered list of service info objects.
   * @private
   */
  getPartitionServiceCandidates(partitionId, forRead = false, preferLeader = false, preferSameLatencyGroup = false, routingReadinessDimension = this.defaultRoutingReadinessDimension) {
    return this.resolvePartitionServiceCandidates(partitionId, forRead, preferLeader, preferSameLatencyGroup, routingReadinessDimension).candidates;
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
  resolvePartitionServiceCandidates(partitionId, forRead = false, preferLeader = false, preferSameLatencyGroup = false, routingReadinessDimension = this.defaultRoutingReadinessDimension, routingOptions = {}) {
    const prioritizeLeader = preferLeader || !forRead;
    const routingSnapshot = this.getPartitionRoutingSnapshot(partitionId, routingReadinessDimension, routingOptions);
    const services = routingSnapshot.routableServices;
    if (services.length === NUM.ZERO) {
      this.logPartitionRoutingDenial(routingSnapshot);
      return {
        candidates: [],
        routingSnapshot
      };
    }
    const localGroupId = this.resolveNodeLatencyGroupId(this.nodeId);
    const orderedServices = this.orderServicesByLatencyGroup(services, localGroupId, forRead && preferSameLatencyGroup);
    const canonicalLeaderNodeId = routingSnapshot.canonicalLeaderNodeId;
    const bootstrapLeaderServices = !forRead && !canonicalLeaderNodeId ? this.getFreshBootstrapLeaderServices(partitionId, orderedServices) : [];
    const candidates = [];
    const seen = new Set();
    const addService = service => {
      if (!service) {
        return;
      }
      if (this.isTemporarilyUnroutableAddress(partitionId, service.address, service)) {
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
        replicaId: service.service_id || service.replica_id
      });
    };
    const canonicalLeaderServices = canonicalLeaderNodeId ? orderedServices.filter(service => service.node_id === canonicalLeaderNodeId) : [];
    if (!forRead) {
      if (!canonicalLeaderNodeId) {
        if (bootstrapLeaderServices.length > NUM.ZERO) {
          bootstrapLeaderServices.forEach(addService);
          return {
            candidates,
            routingSnapshot
          };
        }
        this.logCanonicalLeaderRoutingGap(partitionId, {
          reason: LEADER_GAP_REASON_OWNER_MISSING,
          services: orderedServices,
          routingSnapshot
        });
        return {
          candidates: [],
          routingSnapshot
        };
      }
      if (canonicalLeaderServices.length === NUM.ZERO) {
        this.logCanonicalLeaderRoutingGap(partitionId, {
          reason: LEADER_GAP_REASON_SERVICE_MISSING,
          canonicalLeaderNodeId,
          services: orderedServices,
          routingSnapshot
        });
        return {
          candidates: [],
          routingSnapshot
        };
      }
      canonicalLeaderServices.forEach(addService);
      if (candidates.length === NUM.ZERO) {
        // Canonical leader rows are present but were quarantined after runtime
        // no-handler witnesses. Try other live replicas to follow redirects.
        orderedServices.forEach(addService);
      }
      return {
        candidates,
        routingSnapshot
      };
    }
    if (prioritizeLeader) {
      if (canonicalLeaderNodeId) {
        canonicalLeaderServices.forEach(addService);
      }
      orderedServices.filter(service => service.node_id === this.nodeId).forEach(addService);
    }
    orderedServices.forEach(addService);
    return {
      candidates,
      routingSnapshot
    };
  }

  /**
   * Build one owner-style snapshot for partition routing diagnostics.
   * @param {string} partitionId
   * @param {string} [routingReadinessDimension]
   * @return {Object}
   */
  getPartitionRoutingSnapshot(partitionId, routingReadinessDimension = this.defaultRoutingReadinessDimension, routingOptions = {}) {
    const serviceRows = this.getPartitionServiceRows(partitionId);
    const canonicalLeaderNodeId = this.getPartitionLeaderNodeId(partitionId);
    const evaluatedServices = serviceRows.map(service => ({
      service,
      routing: this.evaluatePartitionServiceRoutability(service, routingReadinessDimension, routingOptions)
    }));
    const activeAddressedServices = evaluatedServices.filter(entry => {
      return entry.routing.reasonCode !== QUERY_ROUTING_DIAGNOSTIC_REASON.SERVICE_INACTIVE && entry.routing.reasonCode !== QUERY_ROUTING_DIAGNOSTIC_REASON.SERVICE_ADDRESS_MISSING;
    }).map(entry => entry.service);
    const routableServices = evaluatedServices.filter(entry => entry.routing.routable === true).map(entry => entry.service);
    const canonicalLeaderServiceCount = canonicalLeaderNodeId ? serviceRows.filter(service => service?.node_id === canonicalLeaderNodeId).length : NUM.ZERO;
    return Object.freeze({
      partitionId,
      routingReadinessDimension,
      reasonCode: this.resolvePartitionRoutingReasonCode(serviceRows, activeAddressedServices, routableServices),
      canonicalLeaderNodeId,
      leaderKnown: canonicalLeaderNodeId !== null,
      serviceRowCount: serviceRows.length,
      activeAddressedServiceCount: activeAddressedServices.length,
      routableServiceCount: routableServices.length,
      canonicalLeaderServiceCount,
      serviceRows: Object.freeze([...serviceRows]),
      routableServices: Object.freeze([...routableServices]),
      deniedByNodeId: this.buildRoutingDeniedNodeSummary(evaluatedServices, routingReadinessDimension)
    });
  }

  /**
   * Resolve node latency-group assignment from system cache.
   * @param {string} nodeId - Node ID.
   * @return {string|null}
   * @private
   */
  resolveNodeLatencyGroupId(nodeId) {
    if (!nodeId || typeof this.systemCache?.get !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION) {
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
    if (!enabled || !localGroupId || typeof this.systemCache?.get !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION) {
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
      this.logger.warn(LOG_MSG.SYSTEM_CACHE_PARTITION_LOOKUP_UNAVAILABLE, {
        partitionId
      });
      return [];
    }
    if (!hasOverlayServices && typeof this.systemCache?.filter !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION) {
      this.logger.warn(QUERY_LOG_MSG.SYSTEM_CACHE_FILTER_UNSUPPORTED, {
        partitionId
      });
      return [];
    }
    const services = [];

    // Overlay metadata is authoritative during runtime repair and must
    // override stale cache rows for the same replica/service identity.
    const overlayRows = this.getOverlayPartitionServices(partitionId).filter(service => service.partition_id === partitionId && service.service_type === SERVICE_TYPE.PARTITION);
    services.push(...overlayRows);
    if (this.systemCache && typeof this.systemCache.filter === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION) {
      const cacheRows = this.systemCache.filter(TABLES.SERVICES, service => service.partition_id === partitionId && service.service_type === SERVICE_TYPE.PARTITION) || [];
      services.push(...cacheRows);
    }
    if (services.length === NUM.ZERO) {
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
  resolvePartitionRoutingReasonCode(serviceRows, activeAddressedServices, routableServices) {
    if (serviceRows.length === NUM.ZERO) {
      return QUERY_ROUTING_DIAGNOSTIC_REASON.NO_SERVICE_ROWS;
    }
    if (activeAddressedServices.length === NUM.ZERO) {
      return QUERY_ROUTING_DIAGNOSTIC_REASON.NO_ACTIVE_ADDRESSED_SERVICES;
    }
    if (routableServices.length === NUM.ZERO) {
      return QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS;
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
  buildRoutingDeniedNodeSummary(evaluatedServices, routingReadinessDimension) {
    const deniedByNodeId = {};
    for (const entry of Array.isArray(evaluatedServices) ? evaluatedServices : []) {
      const service = entry?.service || null;
      const routing = entry?.routing || null;
      const nodeId = String(service?.node_id || service?.nodeId || '');
      if (!nodeId || !routing || routing.routable === true || !routing.readinessSummary) {
        continue;
      }
      const existing = deniedByNodeId[nodeId] || {
        decisionDimension: routingReadinessDimension,
        observedAt: routing.readinessSummary.observedAt || null,
        lifecycleState: routing.readinessSummary.lifecycleState || null,
        reasonCodes: [],
        failedDimensions: []
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
    if (!routingSnapshot || typeof routingSnapshot !== QUERY_EXECUTOR_LITERAL.STRING_OBJECT) {
      return null;
    }
    return {
      reasonCode: routingSnapshot.reasonCode || null,
      routingReadinessDimension: routingSnapshot.routingReadinessDimension || null,
      serviceRowCount: Number(routingSnapshot.serviceRowCount || NUM.ZERO),
      activeAddressedServiceCount: Number(routingSnapshot.activeAddressedServiceCount || NUM.ZERO),
      routableServiceCount: Number(routingSnapshot.routableServiceCount || NUM.ZERO),
      canonicalLeaderServiceCount: Number(routingSnapshot.canonicalLeaderServiceCount || NUM.ZERO),
      leaderKnown: routingSnapshot.leaderKnown === true,
      canonicalLeaderNodeId: routingSnapshot.canonicalLeaderNodeId || null,
      deniedByNodeId: routingSnapshot.deniedByNodeId || {}
    };
  }

  /**
   * Emit typed diagnostics when partition routing has no usable candidates.
   * @param {Object|null} routingSnapshot
   * @private
   */
  logPartitionRoutingDenial(routingSnapshot) {
    const reasonCode = String(routingSnapshot?.reasonCode || QUERY_ROUTING_DIAGNOSTIC_REASON.NO_SERVICE_ROWS);
    const warnKey = String(routingSnapshot?.partitionId || '') + ':' + reasonCode;
    const now = Date.now();
    const lastWarnAt = this.noServiceWarnLastAt.get(warnKey);
    if (Number.isFinite(lastWarnAt) && now - lastWarnAt < this.noServiceWarnThrottleMs) {
      return;
    }
    this.noServiceWarnLastAt.set(warnKey, now);
    const message = reasonCode === QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS ? QUERY_LOG_MSG.PARTITION_ROUTING_CANDIDATES_FILTERED : QUERY_LOG_MSG.NO_ACTIVE_SERVICE_FOR_PARTITION;
    this.logger.warn(message, {
      partitionId: routingSnapshot?.partitionId || null,
      routingSnapshot: this.summarizePartitionRoutingSnapshot(routingSnapshot)
    });
  }

  /**
   * Await one authoritative readiness repair when routing denial indicates the
   * local cache filtered all active candidates based on stale node evidence.
   * @param {Object|null} routingSnapshot
   * @return {Promise<boolean>}
   * @private
   */
  async maybeAwaitDeniedPartitionRoutingRepair(routingSnapshot, options = {}) {
    if (!routingSnapshot) {
      return false;
    }
    const allowReadinessAuthoritativeRefresh = this.shouldAllowRoutingAuthoritativeRefresh(options);
    const canRefreshReadiness = this.controlPlaneReadinessService && typeof this.controlPlaneReadinessService.getNodeReadiness === 'function';
    const deniedNodeIds = routingSnapshot.reasonCode === QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS && routingSnapshot.activeAddressedServiceCount > NUM.ZERO ? Object.keys(routingSnapshot.deniedByNodeId || {}) : [];
    const shouldRepairServiceGap = this.shouldRepairCanonicalLeaderServiceGap(routingSnapshot);
    const repairNodeIds = new Set(deniedNodeIds);
    if (shouldRepairServiceGap) {
      repairNodeIds.add(routingSnapshot.canonicalLeaderNodeId);
    }
    let attemptedRepair = false;
    if (allowReadinessAuthoritativeRefresh && canRefreshReadiness && repairNodeIds.size > NUM.ZERO) {
      attemptedRepair = true;
      await Promise.all([...repairNodeIds].map(async nodeId => {
        try {
          await this.controlPlaneReadinessService.getNodeReadiness(nodeId, {
            allowAuthoritativeRefresh: true,
            requireFreshOnIneligible: true,
            decisionDimension: routingSnapshot.routingReadinessDimension
          });
        } catch (_error) {
          return null;
        }
        return null;
      }));
    }
    if (!shouldRepairServiceGap) {
      return attemptedRepair;
    }
    const overlayRepaired = await this.refreshRoutingMetadataOverlay(routingSnapshot, {
      partitionId: routingSnapshot.partitionId || null,
      routingReadinessDimension: routingSnapshot.routingReadinessDimension || this.defaultRoutingReadinessDimension,
      refreshReason: QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE
    });
    return attemptedRepair || overlayRepaired;
  }

  /**
   * Return true when authoritative node/service repair should refresh the
   * canonical leader node because its service rows are missing locally, either
   * while peer replicas remain visible or when the local cache has no service
   * rows for the partition at all.
   * @param {Object|null} routingSnapshot
   * @return {boolean}
   * @private
   */
  shouldRepairCanonicalLeaderServiceGap(routingSnapshot) {
    return Boolean(routingSnapshot && routingSnapshot.leaderKnown === true && typeof routingSnapshot.canonicalLeaderNodeId === QUERY_EXECUTOR_LITERAL.STRING_STRING && routingSnapshot.canonicalLeaderNodeId.length > NUM.ZERO && Number(routingSnapshot.canonicalLeaderServiceCount) === NUM.ZERO && (Number(routingSnapshot.activeAddressedServiceCount) > NUM.ZERO || Number(routingSnapshot.serviceRowCount) === NUM.ZERO));
  }

  /**
   * Emit the generic no-service warning only when typed routing diagnostics did
   * not already capture a more specific readiness-filtered denial.
   * @param {string} partitionId
   * @param {Object|null} routingSnapshot
   * @private
   */
  logNoServiceForPartition(partitionId, routingSnapshot = null) {
    if (routingSnapshot?.reasonCode === QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS) {
      return;
    }
    const now = Date.now();
    const lastAt = this.noServiceWarnLastAt.get(partitionId);
    if (Number.isFinite(lastAt) && now - lastAt < this.noServiceWarnThrottleMs) {
      return;
    }
    this.noServiceWarnLastAt.set(partitionId, now);
    this.logger.warn(QUERY_LOG_MSG.NO_SERVICE_FOR_PARTITION, {
      partitionId
    });
  }

  /**
   * Get write-routable partition services from system cache.
   * @param {string} partitionId - Partition ID.
   * @return {Array<Object>} Routable services for the partition.
   * @private
   */
  getRoutablePartitionServices(partitionId, routingReadinessDimension = this.defaultRoutingReadinessDimension) {
    return this.getPartitionRoutingSnapshot(partitionId, routingReadinessDimension).routableServices;
  }

  /**
   * Check whether a partition has write-routable services in the system cache.
   * @param {string} partitionId - Partition ID.
   * @return {boolean} True when routable services exist.
   * @private
   */
  hasRoutablePartitionService(partitionId, routingReadinessDimension = this.defaultRoutingReadinessDimension) {
    return this.getPartitionRoutingSnapshot(partitionId, routingReadinessDimension).routableServiceCount > NUM.ZERO;
  }

  /**
   * Check whether partition metadata exists in the cache.
   * @param {string} partitionId - Partition ID.
   * @return {boolean} True when partition metadata exists.
   * @private
   */
  hasPartitionRecord(partitionId) {
    if (this.systemCache) {
      if (typeof this.systemCache.has === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION) {
        if (this.systemCache.has(TABLES.PARTITIONS, partitionId)) {
          return true;
        }
      } else if (typeof this.systemCache.get === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION) {
        if (this.systemCache.get(TABLES.PARTITIONS, partitionId)) {
          return true;
        }
      } else if (typeof this.systemCache.filter === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION) {
        if (this.systemCache.filter(TABLES.PARTITIONS, partition => partition.partition_id === partitionId).length > NUM.ZERO) {
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
  findPartitionLeaderAddress(partitionId, routingReadinessDimension = this.defaultRoutingReadinessDimension) {
    const service = this.findPartitionService(partitionId, false, routingReadinessDimension);
    if (!service || typeof service.address !== QUERY_EXECUTOR_LITERAL.STRING_STRING || service.address.length === NUM.ZERO) {
      this.logger.debug(QUERY_LOG_MSG.NO_LEADER_SERVICE_FOR_PARTITION, {
        partitionId
      });
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
  findPartitionService(partitionId, forRead = false, routingReadinessDimension = this.defaultRoutingReadinessDimension) {
    const candidates = this.getPartitionServiceCandidates(partitionId, forRead, false, false, routingReadinessDimension);
    return candidates[NUM.ZERO] || null;
  }

  /**
   * Determine whether a service row is routable.
   * @param {Object} service - Service row.
   * @return {boolean} True when row can be used for routing.
   * @private
   */
  isRoutablePartitionService(service, routingReadinessDimension = this.defaultRoutingReadinessDimension) {
    return this.evaluatePartitionServiceRoutability(service, routingReadinessDimension).routable === true;
  }

  /**
   * Evaluate one partition service row against the canonical readiness owner.
   * @param {Object} service
   * @param {string} routingReadinessDimension
   * @return {Object}
   * @private
   */
  evaluatePartitionServiceRoutability(service, routingReadinessDimension = this.defaultRoutingReadinessDimension, routingOptions = {}) {
    const allowReadinessAuthoritativeRefresh = this.shouldAllowRoutingAuthoritativeRefresh(routingOptions);
    let routabilityResult;
    if (service.status !== SERVICE_STATUS.ACTIVE) {
      routabilityResult = {
        routable: false,
        reasonCode: QUERY_ROUTING_DIAGNOSTIC_REASON.SERVICE_INACTIVE,
        readinessSummary: null
      };
    } else if (typeof service.address !== QUERY_EXECUTOR_LITERAL.STRING_STRING || service.address.length === NUM.ZERO) {
      routabilityResult = {
        routable: false,
        reasonCode: QUERY_ROUTING_DIAGNOSTIC_REASON.SERVICE_ADDRESS_MISSING,
        readinessSummary: null
      };
    }
    if (routabilityResult) {
      return routabilityResult;
    }
    const nodeId = service?.node_id || service?.nodeId || null;
    if (!nodeId || !this.controlPlaneReadinessService || typeof this.controlPlaneReadinessService.getControlPlaneParticipationSync !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION && typeof this.controlPlaneReadinessService.getNodeReadinessSync !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION) {
      routabilityResult = {
        routable: true,
        reasonCode: QUERY_ROUTING_DIAGNOSTIC_REASON.OK,
        readinessSummary: null
      };
    }
    if (routabilityResult) {
      return routabilityResult;
    }
    const partitionId = String(service?.partition_id || service?.partitionId || '');
    const partitionRow = partitionId.length > NUM.ZERO ? this.getPartitionRecord(partitionId) : null;
    const tableName = String(partitionRow?.table_name || partitionRow?.tableName || partitionRow?.table_id || partitionRow?.tableId || '') || null;
    let evaluation;
    if (typeof this.controlPlaneReadinessService.getControlPlaneParticipationSync === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION) {
      const participationKind = routingReadinessDimension === CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE ? CONTROL_PLANE_PARTICIPATION_KIND.CONTROL_PLANE_RECOVERY : CONTROL_PLANE_PARTICIPATION_KIND.ROUTED_READ;
      const participation = this.controlPlaneReadinessService.getControlPlaneParticipationSync(nodeId, {
        allowAuthoritativeRefresh: allowReadinessAuthoritativeRefresh,
        requireFreshOnIneligible: allowReadinessAuthoritativeRefresh,
        participationKind,
        decisionDimension: routingReadinessDimension,
        partitionId: partitionId || null,
        tableName
      });
      evaluation = {
        readiness: participation?.snapshot || null,
        decision: {
          eligible: participation?.eligible === true,
          failedDimensions: Array.isArray(participation?.failedDimensions) ? participation.failedDimensions : Object.freeze([])
        },
        compactSnapshot: participation?.summary || null
      };
    } else {
      const readiness = this.controlPlaneReadinessService.getNodeReadinessSync(nodeId, {
        allowAuthoritativeRefresh: allowReadinessAuthoritativeRefresh,
        requireFreshOnIneligible: allowReadinessAuthoritativeRefresh,
        decisionDimension: routingReadinessDimension
      });
      if (!readiness || !readiness.dimensions) {
        routabilityResult = {
          routable: false,
          reasonCode: QUERY_ROUTING_DIAGNOSTIC_REASON.READINESS_UNAVAILABLE,
          readinessSummary: null
        };
      } else {
        evaluation = {
          readiness,
          decision: evaluateEligibilityDecision(readiness, routingReadinessDimension),
          compactSnapshot: compactEligibilitySnapshot(readiness, routingReadinessDimension)
        };
      }
    }
    if (routabilityResult) {
      return routabilityResult;
    }
    const readiness = evaluation.readiness;
    const decision = evaluation.decision;
    const compactSnapshot = evaluation.compactSnapshot;
    const bootstrapGraceRoutable = decision?.eligible !== true && this.shouldAllowFreshBootstrapRoutingGrace(service, readiness, decision);
    return {
      routable: decision.eligible === true || bootstrapGraceRoutable,
      reasonCode: decision.eligible === true || bootstrapGraceRoutable ? QUERY_ROUTING_DIAGNOSTIC_REASON.OK : QUERY_ROUTING_DIAGNOSTIC_REASON.NODE_NOT_ELIGIBLE,
      readinessSummary: compactSnapshot ? {
        decisionDimension: compactSnapshot.decisionDimension || routingReadinessDimension,
        observedAt: compactSnapshot.observedAt || null,
        lifecycleState: compactSnapshot.lifecycleState || null,
        reasonCodes: compactSnapshot.reasonCodes || Object.freeze([]),
        failedDimensions: decision.failedDimensions || Object.freeze([])
      } : null
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
    const partitionId = String(service?.partition_id || service?.partitionId || '');
    if (partitionId.length === NUM.ZERO) {
      return false;
    }
    const partition = this.getPartitionRecord(partitionId);
    if (!this.isBootstrapRoutingGraceWindow(partition)) {
      return false;
    }
    const dimensions = readiness?.dimensions;
    const nodeEvidence = readiness?.nodeEvidence;
    if (!dimensions || typeof dimensions !== QUERY_EXECUTOR_LITERAL.STRING_OBJECT || !nodeEvidence || typeof nodeEvidence !== QUERY_EXECUTOR_LITERAL.STRING_OBJECT) {
      return false;
    }
    if (dimensions[CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE] !== true || dimensions[CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY] !== true || dimensions[CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY] !== true || dimensions[CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY] !== true || nodeEvidence.transportConnected !== true || nodeEvidence.readyWhenWritten !== true) {
      return false;
    }
    const allowedFailedDimensions = new Set([CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY, CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE, CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE, CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE, CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]);
    const failedDimensions = Array.isArray(decision?.failedDimensions) ? decision.failedDimensions : [];
    return failedDimensions.length > NUM.ZERO && failedDimensions.every(dimension => allowedFailedDimensions.has(dimension));
  }

  /**
   * Resolve overlay partition row by ID.
   * @param {string} partitionId - Partition ID.
   * @return {Object|null} Overlay partition row.
   * @private
   */
  getOverlayPartitionRecord(partitionId) {
    const overlay = this.routingMetadataOverlay;
    if (!overlay || typeof overlay.getPartitionById !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION) {
      return null;
    }
    const partition = overlay.getPartitionById(partitionId);
    return partition && typeof partition === QUERY_EXECUTOR_LITERAL.STRING_OBJECT ? partition : null;
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
    if (typeof this.systemCache.get === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION) {
      const record = this.systemCache.get(TABLES.PARTITIONS, partitionId);
      if (record) {
        return record;
      }
    }
    if (typeof this.systemCache.filter === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION) {
      const records = this.systemCache.filter(TABLES.PARTITIONS, partition => partition.partition_id === partitionId);
      if (records.length > NUM.ZERO) {
        return records[NUM.ZERO];
      }
    }
    if (typeof this.systemCache.getAll === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION) {
      const records = this.systemCache.getAll(TABLES.PARTITIONS) || [];
      return records.find(partition => partition.partition_id === partitionId) || null;
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
    if (typeof this.bootstrapTopologySnapshotOwner?.resolveCanonicalPartitionLeaderNodeId === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION) {
      const leaderNodeId = this.bootstrapTopologySnapshotOwner.resolveCanonicalPartitionLeaderNodeId(partitionId);
      if (typeof leaderNodeId === QUERY_EXECUTOR_LITERAL.STRING_STRING && leaderNodeId.length > NUM.ZERO) {
        return leaderNodeId;
      }
    }
    const partition = this.getPartitionRecord(partitionId);
    const leaderNodeId = partition?.[COLUMN.LEADER_NODE_ID] ?? partition?.leaderNodeId ?? null;
    return typeof leaderNodeId === QUERY_EXECUTOR_LITERAL.STRING_STRING && leaderNodeId.length > NUM.ZERO ? leaderNodeId : null;
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
    if (typeof this.bootstrapTopologySnapshotOwner?.getFreshBootstrapLeaderServices === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION) {
      const ownerServices = this.bootstrapTopologySnapshotOwner.getFreshBootstrapLeaderServices(partitionId, services);
      if (Array.isArray(ownerServices) && ownerServices.length > NUM.ZERO) {
        return ownerServices;
      }
    }
    const partition = this.getPartitionRecord(partitionId);
    if (!this.isFreshPartitionBootstrapWindow(partition)) {
      return [];
    }
    const leaderSelection = resolveBootstrapLeaderSelection({
      services
    });
    return leaderSelection.selectedService ? [leaderSelection.selectedService] : [];
  }

  /**
   * Identify the narrow bootstrap window where a partition has been created
   * but the canonical leader_node_id has not yet been persisted.
   * @param {Object|null} partition
   * @return {boolean}
   * @private
   */
  isFreshPartitionBootstrapWindow(partition) {
    if (typeof this.bootstrapTopologySnapshotOwner?.isFreshPartitionBootstrapWindow === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION) {
      return this.bootstrapTopologySnapshotOwner.isFreshPartitionBootstrapWindow(partition);
    }
    if (!partition || !this.isBootstrapRoutingGraceWindow(partition)) {
      return false;
    }
    const leaderNodeId = partition?.[COLUMN.LEADER_NODE_ID] ?? partition?.leader_node_id ?? partition?.leaderNodeId ?? null;
    return typeof leaderNodeId !== QUERY_EXECUTOR_LITERAL.STRING_STRING || leaderNodeId.length === NUM.ZERO;
  }

  /**
   * Identify the short-lived partition bootstrap grace window before the
   * partition owner row is updated post-creation.
   * @param {Object|null} partition
   * @return {boolean}
   * @private
   */
  isBootstrapRoutingGraceWindow(partition) {
    if (typeof this.bootstrapTopologySnapshotOwner?.isBootstrapRoutingGraceWindow === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION) {
      return this.bootstrapTopologySnapshotOwner.isBootstrapRoutingGraceWindow(partition);
    }
    if (!partition) {
      return false;
    }
    const createdAt = partition?.[COLUMN.CREATED_AT] ?? partition?.created_at ?? partition?.createdAt ?? null;
    const updatedAt = partition?.[COLUMN.UPDATED_AT] ?? partition?.updated_at ?? partition?.updatedAt ?? null;
    return Number.isFinite(createdAt) && Number.isFinite(updatedAt) && createdAt === updatedAt;
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
    if (Number.isFinite(lastWarnAt) && now - lastWarnAt < this.noServiceWarnThrottleMs) {
      return;
    }
    this.canonicalLeaderWarnLastAt.set(warnKey, now);
    const services = Array.isArray(options.services) ? options.services : [];
    const routableNodeIds = [...new Set(services.map(service => service?.node_id).filter(nodeId => typeof nodeId === 'string' && nodeId.length > NUM.ZERO))];
    const staleLeaderNodeIds = [...new Set(services.filter(service => service?.raft_role === RAFT_ROLE.LEADER).map(service => service?.node_id).filter(nodeId => typeof nodeId === 'string' && nodeId.length > NUM.ZERO))];
    if (reason === LEADER_GAP_REASON_SERVICE_MISSING) {
      this.logger.warn(QUERY_LOG_MSG.CANONICAL_LEADER_SERVICE_MISSING_FOR_PARTITION, {
        partitionId,
        leaderNodeId: options.canonicalLeaderNodeId || null,
        routableNodeIds,
        staleLeaderNodeIds,
        routingSnapshot: this.summarizePartitionRoutingSnapshot(options.routingSnapshot)
      });
      return;
    }
    this.logger.warn(QUERY_LOG_MSG.CANONICAL_LEADER_METADATA_MISSING_FOR_PARTITION, {
      partitionId,
      routableNodeIds,
      staleLeaderNodeIds,
      routingSnapshot: this.summarizePartitionRoutingSnapshot(options.routingSnapshot)
    });
  }

  /**
   * Resolve overlay services for a partition.
   * @param {string} partitionId - Partition ID.
   * @return {Array<Object>} Overlay service rows.
   * @private
   */
  getOverlayPartitionServices(partitionId) {
    const overlay = this.routingMetadataOverlay;
    if (!overlay || typeof overlay.getServicesForPartition !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION) {
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
    return {
      rows
    };
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
      return {
        rows: this.applyGroupBy(allRows, ast)
      };
    } else {
      return {
        rows: this.applyAggregates(allRows, ast)
      };
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
    return rows.filter(row => {
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
    return ast.columns.some(col => col.expression?.type === QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE || col.type === QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE);
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
    const groupByColumns = ast.groupBy.map(g => g.column || g.expression?.column || g);

    // Group rows
    for (const row of rows) {
      const key = groupByColumns.map(col => row[col]).join('|');
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
    if (ast.groupBy && rows.length > NUM.ZERO) {
      for (const g of ast.groupBy) {
        const col = g.column || g.expression?.column || g;
        result[col] = rows[NUM.ZERO][col];
      }
    }

    // Compute aggregates
    for (const col of ast.columns) {
      const expr = col.expression || col;
      if (expr.type === QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE) {
        const alias = col.alias || `${expr.function}(${this.getArgName(expr)})`;
        result[alias] = this.computeAggregate(rows, expr);
      } else if (expr.type === QUERY_EXECUTOR_LITERAL.STRING_COLUMN_REF) {
        const colName = expr.column;
        if (rows.length > NUM.ZERO) {
          result[colName] = rows[NUM.ZERO][colName];
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
    if (expr.argument?.type === QUERY_EXECUTOR_LITERAL.STRING_STAR) return QUERY_EXECUTOR_LITERAL.STRING_VALUE_3;
    if (expr.argument?.type === QUERY_EXECUTOR_LITERAL.STRING_COLUMN_REF) return expr.argument.column;
    return QUERY_EXECUTOR_LITERAL.STRING_VALUE_4;
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
      if (expr.type === QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE) {
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
      values = rows.map(r => r[colName]).filter(v => v !== null && v !== undefined);
    }
    if (expr.distinct && colName) {
      values = [...new Set(values)];
    }
    switch (func) {
      case QUERY_EXECUTOR_LITERAL.STRING_COUNT:
        // COUNT(*) counts all rows, COUNT(column) counts non-null values
        if (arg?.type === QUERY_EXECUTOR_LITERAL.STRING_STAR) {
          return rows.length;
        }
        return values.length;
      case QUERY_EXECUTOR_LITERAL.STRING_SUM:
        // SUM aggregates numeric values across all partitions
        return values.reduce((sum, v) => sum + (Number(v) || NUM.ZERO), NUM.ZERO);
      case QUERY_EXECUTOR_LITERAL.STRING_AVG:
        {
          // AVG must be computed on combined data, not averaged averages
          if (values.length === NUM.ZERO) return null;
          const avgSum = values.reduce((s, v) => s + (Number(v) || 0), 0);
          return avgSum / values.length;
        }
      case QUERY_EXECUTOR_LITERAL.STRING_MIN:
        // MIN finds the minimum across all partitions
        if (values.length === NUM.ZERO) return null;
        return values.reduce((min, v) => v < min ? v : min, values[NUM.ZERO]);
      case QUERY_EXECUTOR_LITERAL.STRING_MAX:
        // MAX finds the maximum across all partitions
        if (values.length === NUM.ZERO) return null;
        return values.reduce((max, v) => v > max ? v : max, values[NUM.ZERO]);
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
    return rows.filter(row => this.evaluateExpression(row, having));
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
      case QUERY_EXECUTOR_LITERAL.STRING_BINARY:
        return this.evaluateBinary(row, expr);
      case QUERY_EXECUTOR_LITERAL.STRING_UNARY:
        return this.evaluateUnary(row, expr);
      case QUERY_EXECUTOR_LITERAL.STRING_IN:
        return this.evaluateIn(row, expr);
      case QUERY_EXECUTOR_LITERAL.STRING_BETWEEN:
        return this.evaluateBetween(row, expr);
      case QUERY_EXECUTOR_LITERAL.STRING_LIKE:
        return this.evaluateLike(row, expr);
      case QUERY_EXECUTOR_LITERAL.STRING_LITERAL:
        return expr.value;
      case QUERY_EXECUTOR_LITERAL.STRING_COLUMN_REF:
        return row[expr.column];
      case QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE:
        {
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
      case QUERY_EXECUTOR_LITERAL.STRING_AND:
        return left && right;
      case QUERY_EXECUTOR_LITERAL.STRING_OR:
        return left || right;
      case QUERY_EXECUTOR_LITERAL.STRING_VALUE_5:
        return left === right;
      case QUERY_EXECUTOR_LITERAL.STRING_VALUE_6:
      case QUERY_EXECUTOR_LITERAL.STRING_VALUE_7:
        return left !== right;
      case QUERY_EXECUTOR_LITERAL.STRING_VALUE_8:
        return left < right;
      case QUERY_EXECUTOR_LITERAL.STRING_VALUE_9:
        return left <= right;
      case QUERY_EXECUTOR_LITERAL.STRING_VALUE_10:
        return left > right;
      case QUERY_EXECUTOR_LITERAL.STRING_VALUE_11:
        return left >= right;
      case QUERY_EXECUTOR_LITERAL.STRING_IS_NULL:
        return left === null || left === undefined;
      case QUERY_EXECUTOR_LITERAL.STRING_IS_NOT_NULL:
        return left !== null && left !== undefined;
      default:
        return true;
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
      case QUERY_EXECUTOR_LITERAL.STRING_NOT:
        return !operand;
      case QUERY_EXECUTOR_LITERAL.STRING_VALUE_12:
        return +operand;
      case QUERY_EXECUTOR_LITERAL.STRING_VALUE_13:
        return -operand;
      default:
        return operand;
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
    const set = expr.values.map(v => this.evaluateExpression(row, v));
    const matches = set.some(candidate => candidate === value);
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
        if (typeof aVal === QUERY_EXECUTOR_LITERAL.STRING_STRING && typeof bVal === QUERY_EXECUTOR_LITERAL.STRING_STRING) {
          const cmp = aVal.localeCompare(bVal);
          if (cmp !== NUM.ZERO) return cmp * dir;
        } else {
          if (aVal < bVal) return -dir;
          if (aVal > bVal) return dir;
        }
      }
      return NUM.ZERO;
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
    const offset = Number.isInteger(limit.offset) ? Math.max(limit.offset, NUM.ZERO) : NUM.ZERO;
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
    let sql = QUERY_EXECUTOR_LITERAL.STRING_SELECT;
    if (ast.distinct) {
      sql += QUERY_EXECUTOR_LITERAL.STRING_DISTINCT;
    }

    // Columns
    const cols = ast.columns.map(col => this.buildColumnSQL(col));
    sql += cols.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14);

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
        sql += ` ${join.joinType} JOIN` + ` (${this.buildSelectSQL(join.table.subquery)})`;
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
      const groups = ast.groupBy.map(g => this.buildExpressionSQL(g));
      sql += ` GROUP BY ${groups.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14)}`;
    }

    // HAVING
    if (ast.having) {
      sql += ` HAVING ${this.buildExpressionSQL(ast.having)}`;
    }

    // ORDER BY
    if (ast.orderBy) {
      const orders = ast.orderBy.map(o => `${this.buildExpressionSQL(o.expression)} ${o.direction}`);
      sql += ` ORDER BY ${orders.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14)}`;
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
      sql += ` ${ast.setOperation.type}` + ` ${this.buildSelectSQL(ast.setOperation.right)}`;
    }

    // CTE prefix
    if (ast.ctes && ast.ctes.length > NUM.ZERO) {
      const recursive = ast.recursive ? 'RECURSIVE ' : '';
      const cteDefs = ast.ctes.map(c => `${c.name} AS (${this.buildSelectSQL(c.query)})`);
      sql = `WITH ${recursive}${cteDefs.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14)} ` + sql;
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
    if (col.type === QUERY_EXECUTOR_LITERAL.STRING_STAR) return QUERY_EXECUTOR_LITERAL.STRING_VALUE_3;
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
    if (!expr) return QUERY_EXECUTOR_LITERAL.STRING_VALUE;
    switch (expr.type) {
      case QUERY_EXECUTOR_LITERAL.STRING_STAR:
        return QUERY_EXECUTOR_LITERAL.STRING_VALUE_3;
      case QUERY_EXECUTOR_LITERAL.STRING_LITERAL:
        if (expr.value === null) return QUERY_EXECUTOR_LITERAL.STRING_NULL;
        if (typeof expr.value === QUERY_EXECUTOR_LITERAL.STRING_STRING) return `'${expr.value}'`;
        return String(expr.value);
      case QUERY_EXECUTOR_LITERAL.STRING_COLUMN_REF:
        if (expr.table) return `${expr.table}.${expr.column}`;
        return expr.column;
      case QUERY_EXECUTOR_LITERAL.STRING_BINARY:
        if (expr.operator === QUERY_EXECUTOR_LITERAL.STRING_IS_NULL || expr.operator === QUERY_EXECUTOR_LITERAL.STRING_IS_NOT_NULL) {
          return `(${this.buildExpressionSQL(expr.left)} ${expr.operator})`;
        }
        return `(${this.buildExpressionSQL(expr.left)} ` + `${expr.operator} ${this.buildExpressionSQL(expr.right)})`;
      case QUERY_EXECUTOR_LITERAL.STRING_UNARY:
        return `${expr.operator} ${this.buildExpressionSQL(expr.operand)}`;
      case QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE:
        {
          const aggArg = this.buildExpressionSQL(expr.argument);
          const aggDistinct = expr.distinct ? 'DISTINCT ' : '';
          return `${expr.function}(${aggDistinct}${aggArg})`;
        }
      case QUERY_EXECUTOR_LITERAL.STRING_IN:
        {
          const inVals = expr.values.map(v => this.buildExpressionSQL(v));
          const operator = expr.negated ? 'NOT IN' : 'IN';
          return `${this.buildExpressionSQL(expr.expression)} ${operator} (${inVals.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14)})`;
        }
      case QUERY_EXECUTOR_LITERAL.STRING_BETWEEN:
        return `${this.buildExpressionSQL(expr.expression)} BETWEEN ` + `${this.buildExpressionSQL(expr.low)} AND ` + `${this.buildExpressionSQL(expr.high)}`;
      case QUERY_EXECUTOR_LITERAL.STRING_LIKE:
        return `${this.buildExpressionSQL(expr.expression)} ${expr.negated ? QUERY_EXECUTOR_LITERAL.STRING_NOT_LIKE : QUERY_EXECUTOR_LITERAL.STRING_LIKE_2} ` + `${this.buildExpressionSQL(expr.pattern)}`;
      case QUERY_EXECUTOR_LITERAL.STRING_PARAMETER:
        return QUERY_EXECUTOR_LITERAL.STRING_VALUE_4;
      case PG_EXPR_TYPE.CAST:
        return `CAST(${this.buildExpressionSQL(expr.expression)} AS ${expr.affinity})`;
      case PG_EXPR_TYPE.CASE:
        return this.buildCaseSQL(expr);
      case PG_EXPR_TYPE.SUBQUERY:
        return `(${this.buildSelectSQL(expr.query)})`;
      case PG_EXPR_TYPE.EXISTS:
        return `EXISTS (${this.buildSelectSQL(expr.query)})`;
      case PG_EXPR_TYPE.FUNCTION_CALL:
        {
          const fnArgs = expr.args.map(a => this.buildExpressionSQL(a));
          return `${expr.name}(${fnArgs.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14)})`;
        }
      default:
        return QUERY_EXECUTOR_LITERAL.STRING_VALUE;
    }
  }

  /**
   * Build SQL for a CASE WHEN expression.
   * Handles both searched CASE (CASE WHEN ...) and simple CASE (CASE expr WHEN ...).
   * @param {Object} expr - CASE AST node.
   * @return {string} Reconstructed CASE SQL.
   */
  buildCaseSQL(expr) {
    let sql = QUERY_EXECUTOR_LITERAL.STRING_CASE;
    if (expr.operand) {
      sql += QUERY_EXECUTOR_LITERAL.STRING_VALUE_15 + this.buildExpressionSQL(expr.operand);
    }
    for (const cond of expr.conditions) {
      sql += QUERY_EXECUTOR_LITERAL.STRING_WHEN + this.buildExpressionSQL(cond.when);
      sql += QUERY_EXECUTOR_LITERAL.STRING_THEN + this.buildExpressionSQL(cond.then);
    }
    if (expr.elseExpr) {
      sql += QUERY_EXECUTOR_LITERAL.STRING_ELSE + this.buildExpressionSQL(expr.elseExpr);
    }
    sql += QUERY_EXECUTOR_LITERAL.STRING_END;
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
    this.logger.debug(QUERY_EXECUTOR_LITERAL.STRING_EXECUTING_INSERT, {
      table: ast.table,
      partitionId,
      rowCount: ast.values.length
    });

    // Route through message router like all other operations
    const result = await this.executeOnPartition(partitionId, sql, params, false, false, false, executionOptions);
    if (!result.success) {
      const error = new Error(
        result.error || `Insert failed on partition: ${partitionId}`,
      );
      if (typeof result?.errorCode === 'string' &&
          result.errorCode.length > NUM.ZERO) {
        error.code = result.errorCode;
        error.errorCode = result.errorCode;
      }
      if (Number.isFinite(result?.retryAfterMs) &&
          result.retryAfterMs > NUM.ZERO) {
        error.retryAfterMs = Math.floor(result.retryAfterMs);
      }
      if (result?.deferRetry === true) {
        error.deferRetry = true;
      }
      if (Array.isArray(result?.participantFailures)) {
        error.participantFailures = result.participantFailures
          .filter((entry) => entry && typeof entry === 'object')
          .map((entry) => ({...entry}));
      }
      if (result?.firstFailedParticipant &&
          typeof result.firstFailedParticipant === 'object') {
        error.firstFailedParticipant = {
          ...result.firstFailedParticipant,
        };
      }
      if (typeof result?.participantNodeId === 'string' &&
          result.participantNodeId.length > NUM.ZERO) {
        error.participantNodeId = result.participantNodeId;
      }
      if (typeof result?.participantAddress === 'string' &&
          result.participantAddress.length > NUM.ZERO) {
        error.participantAddress = result.participantAddress;
      }
      if (typeof result?.reasonCode === 'string' &&
          result.reasonCode.length > NUM.ZERO) {
        error.reasonCode = result.reasonCode;
      }
      if (typeof result?.participationKind === 'string' &&
          result.participationKind.length > NUM.ZERO) {
        error.participationKind = result.participationKind;
      }
      if (typeof result?.tableName === 'string' &&
          result.tableName.length > NUM.ZERO) {
        error.tableName = result.tableName;
      } else if (typeof ast?.table === 'string' &&
          ast.table.length > NUM.ZERO) {
        error.tableName = ast.table;
      }
      if (typeof result?.failedTable === 'string' &&
          result.failedTable.length > NUM.ZERO) {
        error.failedTable = result.failedTable;
      }
      throw error;
    }
    return {
      success: true,
      operation: QUERY_EXECUTOR_LITERAL.STRING_INSERT,
      affectedRows: typeof result?.changes === QUERY_EXECUTOR_LITERAL.STRING_NUMBER ? result.changes : ast.values.length,
      rows: Array.isArray(result.rows) ? result.rows : [],
      partitions: [partitionId]
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
    const cols = returning === '*' ? '*' : returning.join(', ');
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
      sql += ` (${ast.columns.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14)})`;
    }
    sql += ` ${SQL.VALUES} `;
    const rows = ast.values.map(row => {
      const vals = row.map(v => this.buildExpressionSQL(v));
      return `(${vals.join(', ')})`;
    });
    sql += rows.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14);
    return this.appendReturning(sql, ast.returning);
  }

  /**
   * Execute an UPDATE statement.
   * @param {Object} ast - Parsed UPDATE AST.
   * @param {Array} partitionIds - Target partition IDs.
   * @param {Array} params - Query parameters.
   * @return {Promise<Object>} Update result.
   */
  async executeUpdate(ast, partitionIds, params = [], executionOptions = {}) {
    const sql = this.buildUpdateSQL(ast);
    this.logger.debug(QUERY_EXECUTOR_LITERAL.STRING_EXECUTING_UPDATE, {
      table: ast.table,
      partitionCount: partitionIds.length
    });
    const results = await this.executeOnPartitions(partitionIds, sql, params, this.hlcClock.now(), false, false, false, {
      ...executionOptions,
      tableName: ast.table
    });
    const fanoutMetrics = this.getLastCoordinatorMetrics();
    const failedResults = results.filter(result => !result.success);
    const totalChanges = results.reduce((sum, result) => sum + (result.success ? result.changes || 0 : 0), 0);
    const returningRows = [];
    for (const result of results) {
      if (result.success && Array.isArray(result.rows) && result.rows.length > NUM.ZERO) {
        returningRows.push(...result.rows);
      }
    }
    if (failedResults.length > NUM.ZERO) {
      const failureSummary = buildDistributedFailureSummary(failedResults);
      return {
        success: false,
        operation: QUERY_AST_TYPE.UPDATE,
        affectedRows: totalChanges,
        partitions: partitionIds,
        ...failureSummary,
        errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
        error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
        rows: returningRows,
        distributedMetrics: {
          fanout: fanoutMetrics,
          failedPartitionCount: failedResults.length
        }
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
        failedPartitionCount: NUM.ZERO
      }
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
    const sets = ast.assignments.map(a => `${a.column} = ${this.buildExpressionSQL(a.value)}`);
    sql += sets.join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_14);
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
  async executeDelete(ast, partitionIds, params = [], executionOptions = {}) {
    const sql = this.buildDeleteSQL(ast);
    this.logger.debug(QUERY_EXECUTOR_LITERAL.STRING_EXECUTING_DELETE, {
      table: ast.table,
      partitionCount: partitionIds.length
    });
    const results = await this.executeOnPartitions(partitionIds, sql, params, this.hlcClock.now(), false, false, false, {
      ...executionOptions,
      tableName: ast.table
    });
    const fanoutMetrics = this.getLastCoordinatorMetrics();
    const failedResults = results.filter(result => !result.success);
    const totalChanges = results.reduce((sum, result) => sum + (result.success ? result.changes || 0 : 0), 0);
    const returningRows = [];
    for (const result of results) {
      if (result.success && Array.isArray(result.rows) && result.rows.length > NUM.ZERO) {
        returningRows.push(...result.rows);
      }
    }
    if (failedResults.length > NUM.ZERO) {
      const failureSummary = buildDistributedFailureSummary(failedResults);
      return {
        success: false,
        operation: QUERY_AST_TYPE.DELETE,
        affectedRows: totalChanges,
        partitions: partitionIds,
        ...failureSummary,
        errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
        error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
        rows: returningRows,
        distributedMetrics: {
          fanout: fanoutMetrics,
          failedPartitionCount: failedResults.length
        }
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
        failedPartitionCount: NUM.ZERO
      }
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
export { QueryExecutor };
