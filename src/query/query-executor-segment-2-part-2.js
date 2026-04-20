import { QUERY_EXECUTOR_SHARED } from "./query-executor-shared.js";
import { QueryExecutorSegment2Part1 } from "./query-executor-segment-2-part-1.js";

const {
  COLUMN,
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_WRITE_RETRY_DECISION_STATE,
  ConfigurationManager,
  DISTRIBUTED_JOIN_STRATEGY,
  DistributedMergeEngine,
  ERRORS,
  HLCClockService,
  LEADER_GAP_REASON_OWNER_MISSING,
  LEADER_GAP_REASON_SERVICE_MISSING,
  LOG_MSG,
  LoggingService,
  METRICS_LOG_TAG,
  MIGRATION_PARTITION_OPERATION,
  NUM,
  PARTITION_SERVICE_ERROR_MSG,
  PG_EXPR_TYPE,
  ParallelQueryCoordinator,
  QUERY_AST_NODE,
  QUERY_AST_TYPE,
  QUERY_CONFIG_KEY,
  QUERY_DEFAULTS,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_EXECUTOR_LITERAL,
  QUERY_JOIN_TYPE,
  QUERY_LOG_MSG,
  QUERY_MESSAGE_FIELD_MIGRATION_ID,
  QUERY_MESSAGE_FIELD_MIGRATION_OPERATION,
  QUERY_MESSAGE_FIELD_SESSION_ID,
  QUERY_MESSAGE_FIELD_SPLIT_MIRROR_ORIGIN,
  QUERY_MESSAGE_TYPE,
  QUERY_OPERATOR,
  QUERY_RESPONSE_TYPE,
  QUERY_ROUTING_DIAGNOSTIC_REASON,
  QUERY_ROUTING_REPAIR_REASON,
  QUERY_SQL,
  QUERY_SUBSYSTEM,
  RAFT_ROLE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  SQL,
  SYSTEM_TABLE_NAMES,
  TABLES,
  TRANSPORT_ERROR_MSG,
  buildDistributedFailureSummary,
  buildParticipantFailureEntry,
  buildPartitionServiceWitnessFingerprint,
  compactEligibilitySnapshot,
  evaluateEligibilityDecision,
  isRetryableControlPlaneError,
  normalizeParticipantFailureString,
  normalizeParticipantRetryAfterMs,
  resolveBootstrapLeaderSelection,
  resolveParticipantBackpressureState,
} = QUERY_EXECUTOR_SHARED;

class QueryExecutorSegment2 extends QueryExecutorSegment2Part1 {


  /**
   * Queue alternative live replica targets after the canonical leader path has
   * been disproven at runtime.
   * @param {Object|null} routingSnapshot
   * @param {Set<string>} attemptedAddresses
   * @param {boolean} preferSameLatencyGroup
   * @return {Array<Object>}
   * @private
   */
  getLeaderRecoveryCandidates(
    routingSnapshot,
    attemptedAddresses = new Set(),
    preferSameLatencyGroup = false,
  ) {
    const routableServices = Array.isArray(routingSnapshot?.routableServices)
      ? routingSnapshot.routableServices
      : [];
    const localGroupId = this.resolveNodeLatencyGroupId(this.nodeId);
    const orderedServices = this.orderServicesByLatencyGroup(
      routableServices,
      localGroupId,
      preferSameLatencyGroup,
    );
    const candidates = [];
    const seen = new Set();
    for (const service of orderedServices) {
      const address = service?.address;
      if (
        typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
        address.length === NUM.ZERO ||
        this.isTemporarilyUnroutableAddress(
          routingSnapshot?.partitionId || null,
          address,
          service,
        ) ||
        attemptedAddresses.has(address)
      ) {
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
        replicaId: service.service_id || service.replica_id,
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
  collectRuntimeRoutingRepairNodeIds(
    routingSnapshot,
    participantNodeId = null,
  ) {
    const repairNodeIds = [];
    const seen = new Set();
    const addNodeId = (nodeId) => {
      if (
        typeof nodeId !== "string" ||
        nodeId.length === NUM.ZERO ||
        seen.has(nodeId)
      ) {
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
    const allowReadinessAuthoritativeRefresh =
      this.shouldAllowRoutingAuthoritativeRefresh(options);
    const routingReadinessDimension =
      options.routingReadinessDimension ||
      routingSnapshot?.routingReadinessDimension ||
      this.defaultRoutingReadinessDimension;
    let repaired = false;
    if (
      allowReadinessAuthoritativeRefresh &&
      this.controlPlaneReadinessService &&
      typeof this.controlPlaneReadinessService.getNodeReadiness ===
        QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
    ) {
      const repairNodeIds = this.collectRuntimeRoutingRepairNodeIds(
        routingSnapshot,
        options.participantNodeId || null,
      );
      if (repairNodeIds.length > NUM.ZERO) {
        await Promise.all(
          repairNodeIds.map(async (nodeId) => {
            try {
              await this.controlPlaneReadinessService.getNodeReadiness(nodeId, {
                allowAuthoritativeRefresh: true,
                requireFreshOnIneligible: true,
                forceAuthoritativeRefresh: true,
                maxCachedAgeMs: NUM.ZERO,
                decisionDimension: routingReadinessDimension,
                refreshReason:
                  options.refreshReason ||
                  QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE,
              });
              repaired = true;
            } catch (_error) {
              return null;
            }
            return null;
          }),
        );
      }
    }
    const routingOverlay = this.routingMetadataOverlay;
    if (
      routingOverlay &&
      typeof routingOverlay.refreshPartitionRouting ===
        QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
    ) {
      const overlayRepaired = await this.refreshRoutingMetadataOverlay(
        routingSnapshot,
        {
          partitionId: options.partitionId,
          participantNodeId: options.participantNodeId || null,
          routingReadinessDimension,
          refreshReason:
            options.refreshReason ||
            QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE,
        },
      );
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
    if (
      !routingOverlay ||
      typeof routingOverlay.refreshPartitionRouting !==
        QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
    ) {
      return false;
    }
    const partitionId =
      typeof options.partitionId === "string" &&
      options.partitionId.length > NUM.ZERO
        ? options.partitionId
        : routingSnapshot?.partitionId || null;
    if (
      typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      partitionId.length === NUM.ZERO
    ) {
      return false;
    }
    const routingReadinessDimension =
      options.routingReadinessDimension ||
      routingSnapshot?.routingReadinessDimension ||
      this.defaultRoutingReadinessDimension;
    try {
      return (
        (await routingOverlay.refreshPartitionRouting(partitionId, {
          partitionId,
          participantNodeId: options.participantNodeId || null,
          routingReadinessDimension,
          routingSnapshot,
          refreshReason:
            options.refreshReason ||
            QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE,
        })) === true
      );
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
      Number.isFinite(options?.timeoutMs) && options.timeoutMs > NUM.ZERO
        ? Math.floor(options.timeoutMs)
        : this.queryTimeoutMs;
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
    return (
      typeof errorMessage === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      errorMessage.includes(ERRORS.NO_HANDLER_FOR_ADDRESS)
    );
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
    return (
      errorMessage &&
      (errorMessage.includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE) ||
        errorMessage.includes(TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT) ||
        errorMessage.includes(ERRORS.NO_HANDLER_FOR_ADDRESS) ||
        (errorMessage.includes(
          QUERY_EXECUTOR_LITERAL.STRING_CONNECTION_TO_NODE,
        ) &&
          errorMessage.includes(QUERY_EXECUTOR_LITERAL.STRING_CLOSED)) ||
        errorMessage.includes(
          QUERY_EXECUTOR_LITERAL.STRING_NO_CONNECTION_TO_NODE,
        ) ||
        errorMessage.includes(
          QUERY_EXECUTOR_LITERAL.STRING_FAILED_TO_FORWARD_WRITE_TO_LEADER,
        ))
    );
  }

  /**
   * Resolve the logical table name for one partition.
   * @param {string} partitionId
   * @return {string|null}
   * @private
   */
  resolvePartitionTableName(partitionId) {
    const partition = this.getPartitionRecord(partitionId);
    const tableName =
      partition?.[COLUMN.TABLE_NAME] ??
      partition?.table_name ??
      partition?.tableName ??
      partition?.table_id ??
      partition?.tableId ??
      null;
    if (
      typeof tableName === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      tableName.length > NUM.ZERO
    ) {
      return tableName;
    }
    if (
      typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      partitionId.length === NUM.ZERO
    ) {
      return null;
    }
    const fallbackTableName = partitionId.replace(/-p\d+$/, "");
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
    if (
      !SYSTEM_TABLE_NAMES.has(
        String(tableName || QUERY_EXECUTOR_LITERAL.STRING_VALUE),
      )
    ) {
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
  resolveControlPlaneWriteRetryDecision(
    partitionId,
    executionOptions,
    failure,
    forRead = false,
  ) {
    const retryAfterMs = normalizeParticipantRetryAfterMs(
      failure?.retryAfterMs,
    );
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
        state: CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.DEFER_PARTITION_RETRY,
      };
    }
    const retryable = this.isRetryableControlPlaneWriteFailure(
      partitionId,
      failure,
      forRead,
    );
    if (!retryable) {
      return {
        state: CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.NONE,
      };
    }
    if (
      this.shouldRetryTransactionActiveWriteOnSameAddress(
        partitionId,
        executionOptions,
        failure,
        forRead,
      )
    ) {
      return {
        state: CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.RETRY_SAME_ADDRESS,
      };
    }
    return {
      state:
        CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.WIDEN_TO_RECOVERY_CANDIDATE,
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
  shouldRetryTransactionActiveWriteOnSameAddress(
    partitionId,
    executionOptions,
    failure,
    forRead = false,
  ) {
    if (
      !this.isRetryableControlPlaneWriteFailure(partitionId, failure, forRead)
    ) {
      return false;
    }
    if (
      typeof executionOptions?.sessionId !==
        QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      executionOptions.sessionId.length <= NUM.ZERO
    ) {
      return false;
    }
    const failureMessage =
      typeof failure?.message === "string"
        ? failure.message
        : typeof failure?.error === "string"
          ? failure.error
          : "";
    return failureMessage.includes(
      PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE,
    );
  }

  /**
   * Delay helper for retry backoff.
   * @param {number} delayMs - Delay duration in ms.
   * @return {Promise<void>}
   * @private
   */
}

export { QueryExecutorSegment2 };
