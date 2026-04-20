import { CONTROL_PLANE_READINESS_SERVICE_SHARED } from './control-plane-readiness-service-shared.js';
import { ControlPlaneReadinessServiceSegment4 } from './control-plane-readiness-service-segment-4.js';

const {
  AUTHORITATIVE_READINESS_REPAIR,
  AUTHORITY_DESCRIPTOR_STATE,
  AUTHORITY_PUBLICATION_OBSERVATION_STATE,
  AuthoritativeControlPlaneView,
  AuthoritativeNodeEvidenceReconciler,
  COLUMN,
  CONTROL_PLANE_PARTICIPATION_DECISION,
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
  CONTROL_PLANE_PUBLICATION_MODE,
  CONTROL_PLANE_PUBLICATION_STATUS,
  CONTROL_PLANE_READINESS_DEFAULT,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_OWNER,
  CONTROL_PLANE_READINESS_REASON,
  CONTROL_PLANE_READINESS_SUBSYSTEM,
  ControlPlaneDiagnosticsLedger,
  DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS,
  DurableWorkflowCoordinator,
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
  LoggingService,
  MEMBERSHIP_PUBLICATION_AUTHORITATIVE_READ_MODE,
  MEMBERSHIP_PUBLICATION_PLANNING,
  MEMBERSHIP_PUBLICATION_PLANNING_READ_OPTIONS,
  MEMBERSHIP_PUBLICATION_PLANNING_SOURCE,
  MEMBERSHIP_PUBLICATION_READ_LANE,
  MEMBERSHIP_PUBLICATION_READ_OPTIONS,
  MEMBERSHIP_PUBLICATION_READ_SCOPE,
  MISSING_NODE_READINESS_REASON,
  MISSING_NODE_READINESS_STATE,
  NUM,
  OperationLane,
  PRESSURE_STATE,
  PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE,
  PROVISIONING_ELIGIBILITY_STATE,
  PUBLICATION_REASON_CONFIG_SAFE_MODE,
  READINESS_DIAGNOSTICS_LEDGER_LIMIT,
  READINESS_ERROR_MSG,
  READINESS_TRANSITION_HISTORY_LIMIT,
  RECOVERY_EPOCH_EVENT_LIMIT,
  RECOVERY_EPOCH_HISTORY_LIMIT,
  RECOVERY_GRACE_MESSAGE_GROUP_SERVICE_STATUSES,
  RECOVERY_PROTOCOL_STATE,
  RUNTIME_AUTHORITY_PUBLICATION_STATE,
  RUNTIME_AUTHORITY_REPAIR_STATE,
  RUNTIME_AUTHORITY_STATE,
  RUNTIME_AUTHORITY_VISIBILITY_STATE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STARTUP_AUTHORITY_STATE,
  STATE,
  TABLES,
  TIME_MS,
  TYPEOF,
  assertCritical,
  buildControlPlanePublicationStory,
  buildParticipationErrorCode,
  buildParticipationErrorMessage,
  buildPublicationRecoveryGateSnapshot,
  buildPublicationRecoveryProtocolSnapshot,
  buildReadinessTransitionOwnerState,
  buildReason,
  buildStartupAuthorityFailureOwnerDescriptor,
  buildStartupAuthorityHealthDetails,
  buildStartupAuthorityOwnerContract,
  buildStartupAuthorityOwnerSnapshotFromPlanningAnswer,
  buildStartupAuthorityOwnerUnavailableSnapshot,
  buildStartupAuthorityPriorityPartitionOwnerDescriptor,
  buildStartupAuthorityPublicationOwnerDescriptor,
  buildStartupAuthorityRecoveryProtocolOwnerDescriptor,
  buildStartupAuthorityTargetParticipationOwnerDescriptor,
  compactEligibilitySnapshot,
  compareNodeHeartbeatWatermarks,
  createControlPlaneRuntimeBundle,
  createEligibilitySnapshot,
  evaluateEligibilityDecision,
  isNodeReadyLeaseExplicitlyCleared,
  isNodeRecordReady,
  normalizeControlPlaneParticipationKind,
  normalizeDiagnosticTimestampMs,
  normalizeIsoTimestamp,
  normalizeLocalQueryTransportEvidence,
  normalizeNodeIdList,
  normalizePositiveInteger,
  resolveMembershipPublicationPlanningSource,
  resolveMembershipPublicationReadLane,
  resolveMembershipPublicationReadOptions,
  resolveMembershipPublicationReadScope,
  resolveParticipationDecisionDimension,
  resolvePriorityRecoveryActiveNodeCohort,
  shouldAllowLocalExecutionForParticipation,
  unwrapRowReadResult,
  wasNodeRecordReadyWhenWritten,
} = CONTROL_PLANE_READINESS_SERVICE_SHARED;

class ControlPlaneReadinessService extends ControlPlaneReadinessServiceSegment4 {

  getPriorityControlPlaneRecoveryHealthSync(
    nodeId = this.nodeId,
    observedAt = this.now(),
  ) {
    const service = this.membershipPublicationService;
    if (!service || typeof service !== TYPEOF.OBJECT) {
      return this.buildPriorityControlPlaneRecoveryUnavailableHealth(
        PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.SERVICE_UNAVAILABLE,
      );
    }
    const hasPlanningProvider =
      typeof service.getLatestClusterPublicationSync === TYPEOF.FUNCTION ||
      typeof service.getLatestPublicationForNodeSync === TYPEOF.FUNCTION;
    if (!hasPlanningProvider) {
      return this.buildPriorityControlPlaneRecoveryUnavailableHealth(
        PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE
          .PLANNING_PROVIDER_UNAVAILABLE,
      );
    }
    try {
      return this.buildPriorityControlPlaneRecoveryHealthFromPlanningAnswer(
        this.getPriorityRecoveryPlanningAnswerSync(nodeId, observedAt),
      );
    } catch (error) {
      return this.buildPriorityControlPlaneRecoveryUnavailableHealth(
        PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.PLANNING_READ_FAILED,
        error,
      );
    }
  }

  async getPriorityControlPlaneRecoveryHealth(
    nodeId = this.nodeId,
    observedAt = this.now(),
  ) {
    const service = this.membershipPublicationService;
    if (!service || typeof service !== TYPEOF.OBJECT) {
      return this.buildPriorityControlPlaneRecoveryUnavailableHealth(
        PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.SERVICE_UNAVAILABLE,
      );
    }
    const hasPlanningProvider =
      typeof service.getLatestClusterPublication === TYPEOF.FUNCTION ||
      typeof service.getLatestPublicationForNode === TYPEOF.FUNCTION ||
      typeof service.getLatestClusterPublicationSync === TYPEOF.FUNCTION ||
      typeof service.getLatestPublicationForNodeSync === TYPEOF.FUNCTION;
    if (!hasPlanningProvider) {
      return this.buildPriorityControlPlaneRecoveryUnavailableHealth(
        PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE
          .PLANNING_PROVIDER_UNAVAILABLE,
      );
    }
    try {
      return this.buildPriorityControlPlaneRecoveryHealthFromPlanningAnswer(
        await this.getPriorityRecoveryPlanningAnswerBestEffort(
          nodeId,
          observedAt,
        ),
      );
    } catch (error) {
      return this.buildPriorityControlPlaneRecoveryUnavailableHealth(
        PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.PLANNING_READ_FAILED,
        error,
      );
    }
  }

  getCapacitySnapshotSync(nodeId, _nodeRow) {
    if (this.storageAccountingService &&
        typeof this.storageAccountingService.getCapacitySnapshotForNodeSync ===
          TYPEOF.FUNCTION) {
      return this.storageAccountingService.getCapacitySnapshotForNodeSync(nodeId);
    }

    return null;
  }

  getPriorityControlPlaneRecoveryState(context = {}) {
    const dimensions = context.dimensions && typeof context.dimensions === TYPEOF.OBJECT ?
      context.dimensions :
      {};
    const membershipPublication =
      context.membershipPublication &&
      typeof context.membershipPublication === TYPEOF.OBJECT ?
        context.membershipPublication :
        null;
    const planningSnapshot =
      this.resolveMembershipPublicationPlanningSnapshot(context);
    const publicationRecoveryGate =
      planningSnapshot?.publicationRecoveryGate &&
        typeof planningSnapshot.publicationRecoveryGate === TYPEOF.OBJECT ?
        planningSnapshot.publicationRecoveryGate :
        buildPublicationRecoveryGateSnapshot(planningSnapshot || {});
    const priorityPartitionSummary =
      publicationRecoveryGate.priorityPartitionSummary ||
      planningSnapshot?.priorityPartitionSummary ||
      null;
    const reasonCodes = Array.isArray(publicationRecoveryGate.reasonCodes) ?
      [...publicationRecoveryGate.reasonCodes] :
      [];
    if (dimensions[
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE
    ] !== true) {
      reasonCodes.push(
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.CONTROL_PLANE_NOT_WRITABLE,
      );
    }
    const publicationPendingReasonCodePresent = reasonCodes.includes(
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
    );
    const controlPlaneNotWritable = reasonCodes.includes(
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.CONTROL_PLANE_NOT_WRITABLE,
    );
    if (dimensions[
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
    ] !== true &&
      !publicationPendingReasonCodePresent &&
      !controlPlaneNotWritable) {
      reasonCodes.push(
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.RECOVERY_ELIGIBILITY_PENDING,
      );
    }

    const dedupedReasonCodes = Object.freeze([...new Set(reasonCodes)]);
    const enteredAt = membershipPublication?.createdAt ||
      membershipPublication?.updatedAt ||
      normalizeDiagnosticTimestampMs(context.observedAt) ||
      this.now();

    return Object.freeze({
      active:
        publicationRecoveryGate.active === true ||
        dedupedReasonCodes.length > NUM.ZERO,
      reasonCodes: dedupedReasonCodes,
      publicationEpoch: publicationRecoveryGate.publicationEpoch ??
        planningSnapshot?.publicationEpoch ??
        membershipPublication?.publicationEpoch ??
        null,
      publicationStatus: publicationRecoveryGate.publicationStatus ??
        planningSnapshot?.publicationStatus ??
        (membershipPublication?.status || null),
      publicationRecoveryGate,
      priorityPartitionSummary,
      enteredAt,
    });
  }

  /**
   * Return true when the local node already has stronger self-owned readiness
   * evidence than an immediate authoritative repair would provide.
   *
   * The local node's active status plus locally hosted control-plane services
   * are sufficient to keep self admission open while CDC catches up. Forcing a
   * synchronous read-your-own-write round-trip to the seed on every stale local
   * heartbeat only recreates the chokepoint we are trying to avoid.
   *
   * @param {Object} context
   * @param {string|null} context.nodeId
   * @param {Object|null} context.nodeRow
   * @param {Object[]} context.serviceRows
   * @return {boolean}
   * @private
   */
  shouldPreferLocalSelfNodeEvidence(context = {}) {
    const nodeId = context?.nodeId || null;
    if (!nodeId || nodeId !== this.nodeId) {
      return false;
    }

    const nodeRow = context?.nodeRow || null;
    const status = String(nodeRow?.[COLUMN.STATUS] || '').toLowerCase();
    const serviceRows = Array.isArray(context?.serviceRows) ?
      context.serviceRows :
      [];
    if (!nodeRow || typeof nodeRow !== TYPEOF.OBJECT) {
      const lifecycleState = this.getLifecycleState(nodeId, null);
      return this.resolveMissingNodeReadinessState({
        nodeId,
        lifecycleState,
        serviceRows,
      }).state === MISSING_NODE_READINESS_STATE.SELF_RUNTIME_GRACE;
    }

    if (status !== SERVICE_STATUS.ACTIVE) {
      return false;
    }
    return this.hasRoutableService(serviceRows) &&
      this.hasWritableControlPlaneService(serviceRows);
  }

  async readNodeRow(nodeId, options = {}) {
    if (Array.isArray(options.allNodeRows)) {
      return options.allNodeRows.find((row) => row?.[COLUMN.NODE_ID] === nodeId) ||
        null;
    }
    if (options.allowAuthoritativeRefresh === true &&
        this.nodesOwner &&
        typeof this.nodesOwner.getNode === TYPEOF.FUNCTION) {
      const result = await this.nodesOwner.getNode(nodeId, options);
      return unwrapRowReadResult(result);
    }
    if (this.nodesOwner &&
        typeof this.nodesOwner.getNodeFromCache === TYPEOF.FUNCTION) {
      const result = await this.nodesOwner.getNodeFromCache(nodeId, options);
      return unwrapRowReadResult(result);
    }
    return this.getNodeRow(nodeId);
  }

  async readNodeRows(options = {}) {
    if (options.allowAuthoritativeRefresh === true &&
        this.nodesOwner &&
        typeof this.nodesOwner.listNodes === TYPEOF.FUNCTION) {
      const result = await this.nodesOwner.listNodes(options);
      return Array.isArray(result?.rows) ? result.rows : [];
    }
    if (this.nodesOwner &&
        typeof this.nodesOwner.listNodesFromCache === TYPEOF.FUNCTION) {
      const result = await this.nodesOwner.listNodesFromCache(options);
      return Array.isArray(result?.rows) ? result.rows : [];
    }
    return this.getNodeRows();
  }

  async readNodeServiceRows(nodeId, options = {}) {
    if (Array.isArray(options.allServiceRows)) {
      return options.allServiceRows.filter((row) => row?.[COLUMN.NODE_ID] === nodeId);
    }
    if (options.allowAuthoritativeRefresh === true &&
        this.servicesOwner &&
        typeof this.servicesOwner.listServices === TYPEOF.FUNCTION) {
      const result = await this.servicesOwner.listServices(options);
      return Array.isArray(result?.rows) ?
        result.rows.filter((row) => row?.[COLUMN.NODE_ID] === nodeId) :
        [];
    }
    if (this.servicesOwner &&
        typeof this.servicesOwner.listServicesForNodeFromCache ===
          TYPEOF.FUNCTION) {
      const result = await this.servicesOwner.listServicesForNodeFromCache(
        nodeId,
        options,
      );
      return Array.isArray(result?.rows) ? result.rows : [];
    }
    return this.getNodeServiceRows(nodeId);
  }

  async readAllNodeServiceRows(options = {}) {
    if (options.allowAuthoritativeRefresh === true &&
        this.servicesOwner &&
        typeof this.servicesOwner.listServices === TYPEOF.FUNCTION) {
      const result = await this.servicesOwner.listServices(options);
      return Array.isArray(result?.rows) ? result.rows : [];
    }
    if (this.servicesOwner &&
        typeof this.servicesOwner.listServicesFromCache === TYPEOF.FUNCTION) {
      const result = await this.servicesOwner.listServicesFromCache(options);
      return Array.isArray(result?.rows) ? result.rows : [];
    }
    if (!this.systemTableCache ||
        typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION) {
      return [];
    }
    return this.systemTableCache.getAll(TABLES.SERVICES) || [];
  }

  /**
   * Resolve one node row from cache.
   * @param {string} nodeId
   * @return {Object|null}
   * @private
   */
  getNodeRow(nodeId) {
    if (!this.systemTableCache) {
      return null;
    }
    if (typeof this.systemTableCache.get === TYPEOF.FUNCTION) {
      return this.systemTableCache.get(TABLES.NODES, nodeId) || null;
    }

    return this.getNodeRows().find((row) => row?.[COLUMN.NODE_ID] === nodeId) ||
      null;
  }

  /**
   * Resolve all node rows from cache.
   * @return {Object[]}
   * @private
   */
  getNodeRows() {
    if (!this.systemTableCache ||
        typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION) {
      return [];
    }
    return this.systemTableCache.getAll(TABLES.NODES);
  }

  /**
   * Resolve service rows for one node.
   * @param {string} nodeId
   * @return {Object[]}
   * @private
   */
  getNodeServiceRows(nodeId) {
    if (!this.systemTableCache) {
      return [];
    }
    if (typeof this.systemTableCache.filter === TYPEOF.FUNCTION) {
      return this.systemTableCache.filter(TABLES.SERVICES, (row) => {
        return row?.[COLUMN.NODE_ID] === nodeId;
      });
    }
    if (typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION) {
      return [];
    }
    return this.systemTableCache.getAll(TABLES.SERVICES).filter((row) => {
      return row?.[COLUMN.NODE_ID] === nodeId;
    });
  }

  /**
   * Resolve the canonical lifecycle state for one node.
   * @param {string} nodeId
   * @param {Object} nodeRow
   * @return {string|null}
   * @private
   */
  getLifecycleState(nodeId, nodeRow) {
    if (nodeId === this.nodeId &&
        this.nodeLifecycleStateMachine &&
        typeof this.nodeLifecycleStateMachine.getState === TYPEOF.FUNCTION) {
      return this.nodeLifecycleStateMachine.getState();
    }
    return nodeRow?.[COLUMN.STATUS] || null;
  }

  /**
   * Resolve the storage snapshot for one node.
   * @param {string} nodeId
   * @param {Object} nodeRow
   * @return {Promise<Object|null>}
   * @private
   */
  async getCapacitySnapshot(nodeId, _nodeRow) {
    if (this.storageAccountingService &&
        typeof this.storageAccountingService.getCapacitySnapshotForNode ===
          TYPEOF.FUNCTION) {
      return this.storageAccountingService.getCapacitySnapshotForNode(nodeId);
    }

    if (!this.loggedMissingStorageAccountingOwner) {
      this.loggedMissingStorageAccountingOwner = true;
      this.logMissingOwner(
        'ControlPlaneReadinessService missing storage accounting owner',
        CONTROL_PLANE_READINESS_OWNER.STORAGE_ACCOUNTING,
      );
    }

    if (this.strictOwnerDependencies) {
      throw new Error(READINESS_ERROR_MSG.STORAGE_ACCOUNTING_OWNER_REQUIRED);
    }

    return null;
  }

  /**
   * Return true when the node has at least one active addressed service.
   * @param {Object[]} serviceRows
   * @return {boolean}
   * @private
   */
  hasRoutableService(serviceRows) {
    if (serviceRows.length === NUM.ZERO) {
      return true;
    }
    if (!serviceRows.some((serviceRow) => {
      return this.hasAddressedService(serviceRow);
    })) {
      return true;
    }
    return serviceRows.some((serviceRow) => {
      return String(serviceRow?.[COLUMN.STATUS] || '').toLowerCase() ===
        SERVICE_STATUS.ACTIVE &&
        this.hasAddressedService(serviceRow);
    });
  }

  /**
   * Return true when the node has an active message-group control-plane path.
   * @param {Object[]} serviceRows
   * @return {boolean}
   * @private
   */
  hasWritableControlPlaneService(serviceRows) {
    if (serviceRows.length === NUM.ZERO) {
      return true;
    }
    const hasMessageGroupRows = serviceRows.some((serviceRow) => {
      return serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP;
    });
    if (!hasMessageGroupRows) {
      return true;
    }
    if (this.hasActiveAddressedMessageGroupService(serviceRows)) {
      return true;
    }
    return this.hasStartupControlPlaneWriteGrace(serviceRows);
  }

  hasServeEligibleControlPlaneService(serviceRows) {
    if (serviceRows.length === NUM.ZERO) {
      return true;
    }
    const hasMessageGroupRows = serviceRows.some((serviceRow) => {
      return serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP;
    });
    if (!hasMessageGroupRows) {
      return true;
    }
    return this.hasActiveAddressedMessageGroupService(serviceRows);
  }

  hasActiveAddressedMessageGroupService(serviceRows) {
    return serviceRows.some((serviceRow) => {
      return serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP &&
        String(serviceRow?.[COLUMN.STATUS] || '').toLowerCase() ===
          SERVICE_STATUS.ACTIVE &&
        this.hasAddressedService(serviceRow);
    });
  }

  hasRecoveryGraceControlPlaneService(serviceRows) {
    if (this.hasWritableControlPlaneService(serviceRows)) {
      return true;
    }
    // A restarted joiner can expose addressed but still-converging message-group
    // service rows before the local replica flips ACTIVE again. Keep recovery
    // admission open so it can finish re-registering through the owner path.
    if (!this.hasAddressedMessageGroupServiceWithStatuses(
      serviceRows,
      RECOVERY_GRACE_MESSAGE_GROUP_SERVICE_STATUSES,
    )) {
      return false;
    }
    return this.hasActiveAddressedNonMessageGroupService(serviceRows);
  }

  hasStartupControlPlaneWriteGrace(serviceRows) {
    if (!this.hasAddressedMessageGroupServiceWithStatuses(
      serviceRows,
      [SERVICE_STATUS.STOPPED],
    )) {
      return false;
    }
    return this.hasActiveAddressedNonMessageGroupService(serviceRows);
  }

  hasAddressedService(serviceRow) {
    return typeof serviceRow?.[COLUMN.ADDRESS] === TYPEOF.STRING &&
      serviceRow[COLUMN.ADDRESS].length > NUM.ZERO;
  }

  hasAddressedMessageGroupServiceWithStatuses(serviceRows, allowedStatuses) {
    if (!Array.isArray(allowedStatuses) || allowedStatuses.length === NUM.ZERO) {
      return false;
    }
    return serviceRows.some((serviceRow) => {
      return serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP &&
        allowedStatuses.includes(
          String(serviceRow?.[COLUMN.STATUS] || '').toLowerCase(),
        ) &&
        this.hasAddressedService(serviceRow);
    });
  }

  hasActiveAddressedNonMessageGroupService(serviceRows) {
    return serviceRows.some((serviceRow) => {
      return serviceRow?.[COLUMN.SERVICE_TYPE] !== SERVICE_TYPE.MESSAGE_GROUP &&
        String(serviceRow?.[COLUMN.STATUS] || '').toLowerCase() ===
          SERVICE_STATUS.ACTIVE &&
        this.hasAddressedService(serviceRow);
    });
  }

  /**
   * Return true when node resource usage is below the blocking threshold.
   * @param {Object} nodeRow
   * @return {boolean}
   * @private
   */
  isLoadReady(nodeRow) {
    const loadValues = [
      Number(nodeRow?.[COLUMN.CPU_USAGE_PERCENT]),
      Number(nodeRow?.[COLUMN.MEMORY_USAGE_PERCENT]),
      Number(nodeRow?.[COLUMN.DISK_USAGE_PERCENT]),
    ];

    return loadValues.every((value) => {
      return !Number.isFinite(value) ||
        value < CONTROL_PLANE_READINESS_DEFAULT.LOAD_READY_MAX_PERCENT;
    });
  }

  /**
   * Return true when storage state permits placement.
   * @param {Object|null} capacity
   * @return {boolean}
   * @private
   */
  isCapacityPlacementEligible(capacity) {
    if (!capacity) {
      return false;
    }
    if (!Number.isFinite(Number(capacity.budgetBytes)) ||
        Number(capacity.budgetBytes) <= NUM.ZERO) {
      return false;
    }
    return !CONTROL_PLANE_READINESS_DEFAULT
      .PLACEMENT_BLOCKING_PRESSURE_STATES.includes(
        String(capacity.pressureState || ''),
      );
  }

  /**
   * Map storage state to a stable readiness reason code.
   * @param {Object|null} capacity
   * @return {string|null}
   * @private
   */
  getCapacityReasonCode(capacity) {
    if (!capacity) {
      return CONTROL_PLANE_READINESS_REASON.STORAGE_BUDGET_UNAVAILABLE;
    }
    if (!Number.isFinite(Number(capacity.budgetBytes)) ||
        Number(capacity.budgetBytes) <= NUM.ZERO) {
      return CONTROL_PLANE_READINESS_REASON.STORAGE_BUDGET_UNAVAILABLE;
    }
    if (capacity.pressureState === PRESSURE_STATE.HARD) {
      return CONTROL_PLANE_READINESS_REASON.STORAGE_PRESSURE_HARD;
    }
    if (capacity.pressureState === PRESSURE_STATE.EXHAUSTED) {
      return CONTROL_PLANE_READINESS_REASON.STORAGE_PRESSURE_EXHAUSTED;
    }
    return null;
  }

  /**
   * Build structured diagnostics for one cluster-member-health miss.
   * @param {string} nodeId
   * @param {Object} nodeRow
   * @return {Object}
   * @private
   */
  buildClusterMemberHealthDetails(nodeId, nodeRow) {
    const now = this.now();
    const transportState = this.getNodeTransportState(nodeId, nodeRow);
    const localQueryTransport = this.getLocalQueryTransportEvidence(nodeId);
    const lastHeartbeat = Number(nodeRow?.[COLUMN.LAST_HEARTBEAT]);
    const readyLeaseExpiresAt = Number(nodeRow?.[COLUMN.READY_LEASE_EXPIRES_AT]);
    const heartbeatAgeMs = Number.isFinite(lastHeartbeat) ?
      now - lastHeartbeat :
      null;
    const readyLeaseAgeMs = Number.isFinite(readyLeaseExpiresAt) ?
      now - readyLeaseExpiresAt :
      null;
    const status = String(nodeRow?.[COLUMN.STATUS] || '').toLowerCase();

    return Object.freeze({
      status: status.length > NUM.ZERO ? status : null,
      rowConnectionState: transportState.rowState,
      routerConnectionState: transportState.routerState,
      transportConnected: transportState.connected,
      localQueryTransportState: localQueryTransport?.state || null,
      localQueryTransportReady:
        typeof localQueryTransport?.ready === 'boolean' ?
          localQueryTransport.ready :
          null,
      localQueryTransportReason: localQueryTransport?.reason || null,
      localQueryTransportReasonCode:
        localQueryTransport?.reasonCode || null,
      localQueryTransportErrorCode:
        localQueryTransport?.errorCode || null,
      localQueryTransportRetryAfterMs:
        Number.isFinite(localQueryTransport?.retryAfterMs) ?
          localQueryTransport.retryAfterMs :
          null,
      lastHeartbeat: Number.isFinite(lastHeartbeat) ? lastHeartbeat : null,
      heartbeatAgeMs: Number.isFinite(heartbeatAgeMs) ? heartbeatAgeMs : null,
      readyLeaseExpiresAt: Number.isFinite(readyLeaseExpiresAt) ?
        readyLeaseExpiresAt :
        null,
      readyLeaseAgeMs: Number.isFinite(readyLeaseAgeMs) ? readyLeaseAgeMs : null,
      staleHeartbeatLimitMs: this.clusterMemberStaleHeartbeatMaxAgeMs,
      readyNow: isNodeRecordReady(nodeRow, {now}),
      readyWhenWritten: wasNodeRecordReadyWhenWritten(nodeRow, {now}),
    });
  }

  /**
   * Resolve bounded local query/data-plane transport evidence for self-node
   * readiness diagnostics.
   * @param {string} nodeId
   * @return {{state:string,ready:boolean|null,reason:string|null,retryAfterMs:number|null}|null}
   * @private
   */
  getLocalQueryTransportEvidence(nodeId) {
    if (nodeId !== this.nodeId) {
      return null;
    }
    if (!this.messageRouter ||
        typeof this.messageRouter.getQueryDataPlaneTransportReadiness !==
          TYPEOF.FUNCTION) {
      return normalizeLocalQueryTransportEvidence(null);
    }
    return normalizeLocalQueryTransportEvidence(
      this.messageRouter.getQueryDataPlaneTransportReadiness(),
    );
  }

  /**
   * Resolve transport connectivity evidence from row and live router state.
   * @param {string} nodeId
   * @param {Object} nodeRow
   * @return {{connected:boolean,rowState:string|null,routerState:string|null}}
   * @private
   */
  getNodeTransportState(nodeId, nodeRow) {
    let routerState = null;
    if (nodeId &&
        this.messageRouter &&
        typeof this.messageRouter.getConnectionState === TYPEOF.FUNCTION) {
      routerState = String(
        this.messageRouter.getConnectionState(nodeId) || '',
      ).toLowerCase();
    }

    const rowStateRaw = String(nodeRow?.[COLUMN.CONNECTION_STATE] || '')
      .toLowerCase();
    const normalizedRowState = rowStateRaw.length > NUM.ZERO ?
      rowStateRaw :
      null;
    const normalizedRouterState =
      typeof routerState === TYPEOF.STRING && routerState.length > NUM.ZERO ?
        routerState :
        null;

    let connected = false;
    if (normalizedRouterState === STATE.DISCONNECTED) {
      connected = false;
    } else if (
      normalizedRouterState === STATE.CONNECTED ||
      normalizedRouterState === STATE.READY
    ) {
      connected = true;
    } else {
      connected = normalizedRowState === STATE.CONNECTED ||
        normalizedRowState === STATE.READY;
    }

    return Object.freeze({
      connected,
      rowState: normalizedRowState,
      routerState: normalizedRouterState,
    });
  }

  /**
   * Return true when a node row encodes a transport-connected state.
   * @param {string} nodeId
   * @param {Object} nodeRow
   * @return {boolean}
   * @private
   */
  isNodeTransportConnected(nodeId, nodeRow) {
    return this.getNodeTransportState(nodeId, nodeRow).connected;
  }

  /**
   * Return true when heartbeat evidence is recent enough for stale-lease grace.
   * @param {Object} nodeRow
   * @return {boolean}
   * @private
   */
  isRecentHeartbeat(nodeRow) {
    const lastHeartbeat = Number(nodeRow?.[COLUMN.LAST_HEARTBEAT]);
    if (!Number.isFinite(lastHeartbeat)) {
      return false;
    }
    return (this.now() - lastHeartbeat) <=
      this.clusterMemberStaleHeartbeatMaxAgeMs;
  }

  /**
   * Evaluate cluster membership health using canonical readiness row data and
   * live transport connectivity when available.
   *
   * Node rows with valid leases are healthy. Rows that were ready when written
   * remain healthy through short cache-propagation lag as long as transport is
   * connected and heartbeat evidence is still fresh.
   *
   * @param {string} nodeId
   * @param {Object} nodeRow
   * @return {boolean}
   * @private
   */
  isClusterMemberHealthy(nodeId, nodeRow) {
    const hasLeaseField = Number.isFinite(Number(
      nodeRow?.[COLUMN.READY_LEASE_EXPIRES_AT],
    ));
    const hasStatusField = typeof nodeRow?.[COLUMN.STATUS] === TYPEOF.STRING &&
      nodeRow[COLUMN.STATUS].length > NUM.ZERO;

    if (!hasLeaseField && !hasStatusField) {
      return !!nodeRow;
    }

    const now = this.now();
    if (isNodeRecordReady(nodeRow, {now})) {
      return true;
    }

    const statusActive =
      String(nodeRow?.[COLUMN.STATUS] || '').toLowerCase() ===
        SERVICE_STATUS.ACTIVE;

    if (!statusActive) {
      return false;
    }

    if (nodeId !== this.nodeId &&
        isNodeReadyLeaseExplicitlyCleared(nodeRow)) {
      return false;
    }

    // §1.4.12 self-node fast path: a running node evaluating its own
    // cluster membership is trivially healthy — it is alive and
    // executing this check. This is the strongest possible signal,
    // stronger than any cache lease or transport evidence. Without
    // this, CDC propagation delays during topology changes (splits,
    // rebalance) cause the local cache lease to expire before the
    // heartbeat CDC event propagates back, leading to self-denial
    // of load-lane admission.
    if (nodeId === this.nodeId) {
      return true;
    }

    if (!this.isNodeTransportConnected(nodeId, nodeRow)) {
      return false;
    }

    const connectionState = String(
      nodeRow?.[COLUMN.CONNECTION_STATE] || '',
    ).toLowerCase();
    if (connectionState !== STATE.READY) {
      return false;
    }

    return this.isRecentHeartbeat(nodeRow);
  }

  /**
   * Build a compact snapshot summary suitable for persistence
   * alongside admission, dispatch, and progression decisions.
   *
   * Extracts only the key fields needed for diagnostics linkage
   * without the full verbose snapshot (publication details, capacity
   * breakdown, etc.).
   *
   * @param {Object|null} snapshot - Frozen readiness snapshot from
   *   getNodeReadiness / getNodeReadinessSync.
   * @param {string|null} [decisionDimension] - Canonical dimension used by
   *   the caller when evaluating this snapshot.
   * @return {Object|null} Compact frozen summary or null.
   */
  static compactSnapshotSummary(snapshot, decisionDimension = null) {
    return compactEligibilitySnapshot(snapshot, decisionDimension);
  }
}
export {
  ControlPlaneReadinessService,
  MEMBERSHIP_PUBLICATION_PLANNING_SOURCE,
};

