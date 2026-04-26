import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';
import {QueryExecutorSegment2Part1} from './query-executor-segment-2-part-1.js';

const {
  CANONICAL_LEADER_IDENTITY_STATE,
  CANONICAL_LEADER_ROUTING_GAP_STATE,
  COLUMN,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_WRITE_RETRY_DECISION_STATE,
  ERRORS,
  NUM,
  PARTITION_SERVICE_ERROR_MSG,
  QUERY_EXECUTOR_LITERAL,
  QUERY_ROUTING_REPAIR_REASON,
  SERVICE_STATUS,
  SYSTEM_TABLE_NAMES,
  TRANSPORT_ERROR_MSG,
  isPriorityControlPlanePartition,
  isRetryableControlPlaneError,
  normalizeParticipantRetryAfterMs,
  resolveCanonicalLeaderIdentitySnapshot,
  resolveCanonicalLeaderRoutingGapState,
} = QUERY_EXECUTOR_SHARED;

class QueryExecutorSegment2 extends QueryExecutorSegment2Part1 {
  resolveCanonicalPartitionLeaderIdentity(
    partitionId,
    serviceRows = null,
    partitionRow = null,
  ) {
    const resolvedPartitionRow = partitionRow || this.getPartitionRecord(partitionId);
    const resolvedServiceRows =
      Array.isArray(serviceRows) ?
        serviceRows :
        this.getPartitionServiceRows(partitionId);
    if (
      typeof this.bootstrapTopologySnapshotOwner
        ?.resolveCanonicalPartitionLeaderIdentity ===
      QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
    ) {
      const ownerIdentity =
        this.bootstrapTopologySnapshotOwner.resolveCanonicalPartitionLeaderIdentity(
          partitionId,
          resolvedServiceRows,
        );
      if (
        ownerIdentity &&
        typeof ownerIdentity === QUERY_EXECUTOR_LITERAL.STRING_OBJECT
      ) {
        return ownerIdentity;
      }
    }
    const bootstrapOwnerLeaderNodeId =
      this.resolveBootstrapCanonicalLeaderNodeId(partitionId);
    const retainedLeaderNodeId =
      bootstrapOwnerLeaderNodeId === null ?
        this.resolveRetainedCanonicalLeaderNodeId(
          partitionId,
          resolvedPartitionRow,
          resolvedServiceRows,
        ) :
        null;
    const identity = resolveCanonicalLeaderIdentitySnapshot({
      partition: resolvedPartitionRow,
      partitionPresent:
        resolvedPartitionRow &&
        typeof resolvedPartitionRow === QUERY_EXECUTOR_LITERAL.STRING_OBJECT,
      ownerLeaderNodeId: bootstrapOwnerLeaderNodeId,
      retainedLeaderNodeId,
      serviceRows: resolvedServiceRows,
    });
    this.rememberCanonicalLeaderIdentity(
      partitionId,
      resolvedPartitionRow,
      resolvedServiceRows,
      identity,
    );
    return identity;
  }

  resolveBootstrapCanonicalLeaderNodeId(partitionId) {
    if (
      typeof this.bootstrapTopologySnapshotOwner
        ?.resolveCanonicalPartitionLeaderNodeId !==
      QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
    ) {
      return null;
    }
    const leaderNodeId =
      this.bootstrapTopologySnapshotOwner.resolveCanonicalPartitionLeaderNodeId(
        partitionId,
      );
    return typeof leaderNodeId === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      leaderNodeId.length > NUM.ZERO ?
      leaderNodeId :
      null;
  }

  shouldRetainCanonicalLeaderIdentity(partitionId, partitionRow = null) {
    return isPriorityControlPlanePartition({
      partitionId,
      partitionRow,
    });
  }

  hasActiveCanonicalLeaderService(serviceRows = [], leaderNodeId = null) {
    if (
      typeof leaderNodeId !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      leaderNodeId.length === NUM.ZERO
    ) {
      return false;
    }
    return (Array.isArray(serviceRows) ? serviceRows : []).some((service) => {
      const serviceNodeId =
        service?.[COLUMN.NODE_ID] ??
        service?.node_id ??
        service?.nodeId ??
        null;
      const serviceStatus =
        service?.[COLUMN.STATUS] ??
        service?.status ??
        null;
      return serviceNodeId === leaderNodeId &&
        serviceStatus === SERVICE_STATUS.ACTIVE;
    });
  }

  resolveRetainedCanonicalLeaderNodeId(
    partitionId,
    partitionRow = null,
    serviceRows = [],
  ) {
    if (!this.shouldRetainCanonicalLeaderIdentity(partitionId, partitionRow)) {
      this.retainedCanonicalLeaderNodeIdsByPartition.delete(partitionId);
      return null;
    }
    const retainedLeaderNodeId =
      this.retainedCanonicalLeaderNodeIdsByPartition.get(partitionId);
    if (
      typeof retainedLeaderNodeId !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      retainedLeaderNodeId.length === NUM.ZERO
    ) {
      return null;
    }
    if (
      this.hasActiveCanonicalLeaderService(serviceRows, retainedLeaderNodeId)
    ) {
      return retainedLeaderNodeId;
    }
    this.retainedCanonicalLeaderNodeIdsByPartition.delete(partitionId);
    return null;
  }

  rememberCanonicalLeaderIdentity(
    partitionId,
    partitionRow = null,
    serviceRows = [],
    identity = null,
  ) {
    if (!this.shouldRetainCanonicalLeaderIdentity(partitionId, partitionRow)) {
      this.retainedCanonicalLeaderNodeIdsByPartition.delete(partitionId);
      return;
    }
    if (
      identity?.state !== CANONICAL_LEADER_IDENTITY_STATE.OWNER_CONFIRMED ||
      typeof identity?.leaderNodeId !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      identity.leaderNodeId.length === NUM.ZERO
    ) {
      return;
    }
    if (!this.hasActiveCanonicalLeaderService(serviceRows, identity.leaderNodeId)) {
      return;
    }
    this.retainedCanonicalLeaderNodeIdsByPartition.set(
      partitionId,
      identity.leaderNodeId,
    );
  }

  resolveCanonicalLeaderGapRecoveryRoutingContract(
    partitionId,
    routingSnapshot = null,
    routingReadinessDimension = this.defaultRoutingReadinessDimension,
    allowReadinessAuthoritativeRefresh = false,
  ) {
    const resolvedPartitionId =
      typeof partitionId === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      partitionId.length > NUM.ZERO ?
        partitionId :
        routingSnapshot?.partitionId || null;
    const resolvedRoutingReadinessDimension =
      typeof routingReadinessDimension === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      routingReadinessDimension.length > NUM.ZERO ?
        routingReadinessDimension :
        this.defaultRoutingReadinessDimension;
    const resolvedRoutingSnapshot =
      routingSnapshot && typeof routingSnapshot ===
        QUERY_EXECUTOR_LITERAL.STRING_OBJECT ?
        routingSnapshot :
        resolvedPartitionId ?
          this.getPartitionRoutingSnapshot(
            resolvedPartitionId,
            resolvedRoutingReadinessDimension,
            {
              allowReadinessAuthoritativeRefresh,
            },
          ) :
          null;
    const canonicalLeaderRoutingGapState =
      resolveCanonicalLeaderRoutingGapState(resolvedRoutingSnapshot);
    const partitionRow =
      resolvedPartitionId !== null ?
        this.getPartitionRecord(resolvedPartitionId) :
        null;
    const priorityRecoveryRouting =
      resolvedRoutingReadinessDimension ===
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE &&
      isPriorityControlPlanePartition({
        partitionId: resolvedPartitionId,
        partitionRow,
      }) &&
      Number(resolvedRoutingSnapshot?.routableServiceCount) > NUM.ZERO;
    const partitionTableName =
      resolvedPartitionId !== null ?
        this.resolvePartitionTableName(resolvedPartitionId) :
        null;
    const systemTableRecoveryRouting =
      resolvedRoutingReadinessDimension ===
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE &&
      SYSTEM_TABLE_NAMES.has(
        String(partitionTableName || QUERY_EXECUTOR_LITERAL.STRING_VALUE),
      ) &&
      Number(resolvedRoutingSnapshot?.routableServiceCount) > NUM.ZERO;
    const canonicalLeaderNodeId =
      typeof resolvedRoutingSnapshot?.canonicalLeaderNodeId ===
        QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      resolvedRoutingSnapshot.canonicalLeaderNodeId.length > NUM.ZERO ?
        resolvedRoutingSnapshot.canonicalLeaderNodeId :
        null;
    const deniedByNodeId =
      resolvedRoutingSnapshot?.deniedByNodeId &&
      typeof resolvedRoutingSnapshot.deniedByNodeId ===
        QUERY_EXECUTOR_LITERAL.STRING_OBJECT ?
        resolvedRoutingSnapshot.deniedByNodeId :
        Object.freeze({});
    const canonicalLeaderFilteredByReadiness =
      canonicalLeaderNodeId !== null &&
      Number(resolvedRoutingSnapshot?.canonicalLeaderServiceCount) > NUM.ZERO &&
      Number(resolvedRoutingSnapshot?.routableServiceCount) > NUM.ZERO &&
      Boolean(deniedByNodeId[canonicalLeaderNodeId]);
    const preferDifferentNodeAfterRuntimeWitness = priorityRecoveryRouting;
    const systemTableRecoveryServiceGap =
      systemTableRecoveryRouting &&
      canonicalLeaderRoutingGapState ===
        CANONICAL_LEADER_ROUTING_GAP_STATE.SERVICE_MISSING;
    const priorityRecoveryOwnerGap =
      priorityRecoveryRouting &&
      canonicalLeaderRoutingGapState ===
        CANONICAL_LEADER_ROUTING_GAP_STATE.OWNER_MISSING;
    const recoveryCandidateWidening =
      systemTableRecoveryServiceGap ||
      priorityRecoveryOwnerGap ||
      (
        priorityRecoveryRouting &&
        canonicalLeaderFilteredByReadiness
      );
    return Object.freeze({
      partitionId: resolvedPartitionId,
      routingReadinessDimension: resolvedRoutingReadinessDimension,
      canonicalLeaderRoutingGapState,
      canonicalLeaderFilteredByReadiness,
      priorityRecoveryRouting,
      preferDifferentNodeAfterRuntimeWitness,
      recoveryCandidateWidening,
    });
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
  getLeaderRecoveryCandidates(
    routingSnapshot,
    attemptedAddresses = new Set(),
    preferSameLatencyGroup = false,
  ) {
    const routableServices = Array.isArray(routingSnapshot?.routableServices) ?
      routingSnapshot.routableServices :
      [];
    const localGroupId = this.resolveNodeLatencyGroupId(this.nodeId);
    const orderedServices = this.orderServicesByLatencyGroup(
      routableServices,
      localGroupId,
      preferSameLatencyGroup,
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
    if (deprioritizedNodeIds.size === NUM.ZERO) {
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
      routingSnapshot.partitionId.length > NUM.ZERO ?
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
      attemptedAddresses.size > NUM.ZERO
    ) {
      for (const service of routableServices) {
        if (
          attemptedAddresses.has(service?.address) &&
          typeof service?.node_id === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
          service.node_id.length > NUM.ZERO
        ) {
          deprioritizedNodeIds.add(service.node_id);
        }
      }
    }
    const canonicalLeaderNodeId =
      typeof routingSnapshot?.canonicalLeaderNodeId ===
        QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      routingSnapshot.canonicalLeaderNodeId.length > NUM.ZERO ?
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
      typeof options.partitionId === 'string' &&
      options.partitionId.length > NUM.ZERO ?
        options.partitionId :
        routingSnapshot?.partitionId || null;
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
      Number.isFinite(options?.timeoutMs) && options.timeoutMs > NUM.ZERO ?
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
      (Number.isFinite(retryAfterMs) && retryAfterMs > NUM.ZERO);
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
      isPriorityControlPlanePartition({
        partitionId,
        partitionRow: this.getPartitionRecord(partitionId),
      });
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
      executionOptions.sessionId.length <= NUM.ZERO
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

export {QueryExecutorSegment2};
