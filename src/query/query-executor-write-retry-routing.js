import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';
import {
  classifySystemPartition,
} from '../bootstrap/system-partition-classification.js';
import {
  QueryExecutorCanonicalLeaderRoutingMethods,
} from './query-executor-canonical-leader-routing-methods.js';

const {
  COLUMN,
  CONTROL_PLANE_READ_PURPOSE,
  CONTROL_PLANE_READ_LEADER_MODE,
  CONTROL_PLANE_WRITE_RETRY_DECISION_STATE,
  ERRORS,
  PARTITION_SERVICE_ERROR_MSG,
  QUERY_EXECUTOR_LITERAL,
  QUERY_EXECUTOR_ROUTING_OPTION_FIELD,
  QUERY_ROUTING_REPAIR_REASON,
  SYSTEM_TABLE_NAMES,
  TRANSPORT_ERROR_MSG,
  isRetryableControlPlaneError,
  normalizeParticipantRetryAfterMs,
} = QUERY_EXECUTOR_SHARED;

class QueryExecutorWriteRetryRouting extends QueryExecutorCanonicalLeaderRoutingMethods {
  /**
   * Queue alternative live replica targets after the canonical leader path has
   * been disproven at runtime.
   * @param {Object|null} routingSnapshot
   * @param {Set<string>} attemptedAddresses
   * @param {boolean} preferSameLatencyGroup
   * @param {Object} [routingOptions]
   * @return {Array<Object>}
   * @private
   */
  getLeaderRecoveryCandidates(
    routingSnapshot,
    attemptedAddresses = new Set(),
    preferSameLatencyGroup = false,
    routingOptions = {},
  ) {
    if (
      routingOptions?.[
        QUERY_EXECUTOR_ROUTING_OPTION_FIELD.READ_AUTHORITY
      ]?.leaderMode === CONTROL_PLANE_READ_LEADER_MODE.REQUIRED
    ) {
      return [];
    }
    const routableServices = Array.isArray(routingSnapshot?.routableServices) ?
      routingSnapshot.routableServices :
      [];
    const localGroupId = this.resolveNodeLatencyGroupId(this.nodeId);
    const latencyOrderedServices = this.orderServicesByLatencyGroup(
      routableServices,
      localGroupId,
      preferSameLatencyGroup,
    );
    const orderedServices = this.orderRecoveryCandidateServices(
      latencyOrderedServices,
      routingOptions,
    );
    const candidateServices = this.resolveLeaderRecoveryCandidateServices(
      routingSnapshot,
      orderedServices,
      routableServices,
      attemptedAddresses,
    );
    const candidates = [];
    const seen = new Set();
    for (const service of candidateServices) {
      const address = service?.address;
      if (
        typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
        address.length === 0 ||
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
   * Reorder recovery candidates so runtime-disproven nodes are tried after
   * fresher alternatives on the priority recovery lane.
   * @param {Object|null} routingSnapshot
   * @param {Array<Object>} orderedServices
   * @param {Array<Object>} routableServices
   * @param {Set<string>} attemptedAddresses
   * @return {Array<Object>}
   * @private
   */
  resolveLeaderRecoveryCandidateServices(
    routingSnapshot,
    orderedServices,
    routableServices,
    attemptedAddresses,
  ) {
    const deprioritizedNodeIds =
      this.collectDeprioritizedLeaderRecoveryNodeIds(
        routingSnapshot,
        routableServices,
        attemptedAddresses,
      );
    if (deprioritizedNodeIds.size === 0) {
      return orderedServices;
    }
    return [
      ...orderedServices.filter(
        (service) => !deprioritizedNodeIds.has(service?.node_id),
      ),
      ...orderedServices.filter(
        (service) => deprioritizedNodeIds.has(service?.node_id),
      ),
    ];
  }

  /**
   * Resolve node IDs that should be demoted after a runtime witness disproves
   * the current priority-recovery owner path.
   * @param {Object|null} routingSnapshot
   * @param {Array<Object>} routableServices
   * @param {Set<string>} attemptedAddresses
   * @return {Set<string>}
   * @private
   */
  collectDeprioritizedLeaderRecoveryNodeIds(
    routingSnapshot,
    routableServices,
    attemptedAddresses,
  ) {
    const partitionId =
      typeof routingSnapshot?.partitionId ===
        QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      routingSnapshot.partitionId.length > 0 ?
        routingSnapshot.partitionId :
        null;
    const recoveryRoutingContract =
      this.resolveCanonicalLeaderGapRecoveryRoutingContract(
        partitionId,
        routingSnapshot,
        routingSnapshot?.routingReadinessDimension ||
          this.defaultRoutingReadinessDimension,
      );
    const deprioritizedNodeIds = new Set();
    if (
      recoveryRoutingContract.preferDifferentNodeAfterRuntimeWitness === true &&
      attemptedAddresses instanceof Set &&
      attemptedAddresses.size > 0
    ) {
      for (const service of routableServices) {
        if (
          attemptedAddresses.has(service?.address) &&
          typeof service?.node_id === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
          service.node_id.length > 0
        ) {
          deprioritizedNodeIds.add(service.node_id);
        }
      }
    }
    const canonicalLeaderNodeId =
      typeof routingSnapshot?.canonicalLeaderNodeId ===
        QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      routingSnapshot.canonicalLeaderNodeId.length > 0 ?
        routingSnapshot.canonicalLeaderNodeId :
        null;
    if (
      recoveryRoutingContract.recoveryCandidateWidening === true &&
      canonicalLeaderNodeId
    ) {
      deprioritizedNodeIds.add(canonicalLeaderNodeId);
    }
    return deprioritizedNodeIds;
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
        typeof nodeId !== 'string' ||
        nodeId.length === 0 ||
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
      if (repairNodeIds.length > 0) {
        await Promise.all(
          repairNodeIds.map(async (nodeId) => {
            try {
              await this.controlPlaneReadinessService.getNodeReadiness(nodeId, {
                allowAuthoritativeRefresh: true,
                requireFreshOnIneligible: true,
                forceAuthoritativeRefresh: true,
                maxCachedAgeMs: 0,
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
      typeof options.partitionId === 'string' &&
      options.partitionId.length > 0 ?
        options.partitionId :
        routingSnapshot?.partitionId || null;
    if (
      typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      partitionId.length === 0
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
    const readPurpose = options?.readAuthority?.purpose || null;
    return readPurpose !== CONTROL_PLANE_READ_PURPOSE.READINESS_INTERNAL &&
      options?.allowReadinessAuthoritativeRefresh !== false;
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
      tableName.length > 0
    ) {
      return tableName;
    }
    if (
      typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      partitionId.length === 0
    ) {
      return null;
    }
    const fallbackTableName = partitionId.replace(/-p\d+$/, '');
    return fallbackTableName.length > 0 ? fallbackTableName : null;
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

  buildControlPlaneWriteRetryDecision(state) {
    return {state};
  }

  /**
   * Resolve the canonical retry decision for routed control-plane writes.
   * Deferred transport failures normally pause the current partition attempt
   * so reconnect timers can complete before the next write attempt is issued.
   * Priority-recovery partitions instead widen to another live candidate once
   * the current target has been disproven or admitted as too hot to accept
   * the write on the current attempt.
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
      (Number.isFinite(retryAfterMs) && retryAfterMs > 0);
    const tableName = this.resolvePartitionTableName(partitionId);
    const systemTableWrite =
      !forRead &&
      SYSTEM_TABLE_NAMES.has(
        String(tableName || QUERY_EXECUTOR_LITERAL.STRING_VALUE),
      );
    const retryable = this.isRetryableControlPlaneWriteFailure(
      partitionId,
      failure,
      forRead,
    );
    if (
      this.shouldRetryTransactionActiveWriteOnSameAddress(
        partitionId,
        executionOptions,
        failure,
        forRead,
      )
    ) {
      return this.buildControlPlaneWriteRetryDecision(
        CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.RETRY_SAME_ADDRESS,
      );
    }
    const priorityControlPlaneWrite =
      !forRead &&
      classifySystemPartition({
        partitionId,
        partitionRow: this.getPartitionRecord(partitionId),
      }).priorityControlPlane;
    if (systemTableWrite && deferredFailure) {
      if (priorityControlPlaneWrite && retryable) {
        return this.buildControlPlaneWriteRetryDecision(
          CONTROL_PLANE_WRITE_RETRY_DECISION_STATE
            .WIDEN_TO_RECOVERY_CANDIDATE,
        );
      }
      return this.buildControlPlaneWriteRetryDecision(
        CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.DEFER_PARTITION_RETRY,
      );
    }
    if (!retryable) {
      return this.buildControlPlaneWriteRetryDecision(
        CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.NONE,
      );
    }
    return this.buildControlPlaneWriteRetryDecision(
      CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.WIDEN_TO_RECOVERY_CANDIDATE,
    );
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
      executionOptions.sessionId.length <= 0
    ) {
      return false;
    }
    const failureMessage =
      typeof failure?.message === 'string' ?
        failure.message :
        typeof failure?.error === 'string' ?
          failure.error :
          '';
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

export {QueryExecutorWriteRetryRouting};
