import { NODE_JOINING_SERVICE_SHARED } from './node-joining-service-shared.js';
import { NodeJoiningServiceSegment5 } from './node-joining-service-segment-5.js';

const {
  BOOTSTRAP_EVENT,
  BOOTSTRAP_SUBSYSTEM,
  BootstrapMessageGroupSelectionOwner,
  BootstrapTopologySnapshotOwner,
  CACHE_DEFAULT,
  CACHE_HYDRATION_TABLES,
  CDCIntegrationSetup,
  CDCPipelineReadinessGate,
  CDC_EVENT,
  CDC_LIFECYCLE_LOG_MSG,
  CDC_PROPAGATED_TABLES,
  CDC_REESTABLISHMENT,
  CDC_SUBSCRIPTION_STATUS,
  COLUMN,
  CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE,
  CONTROL_PLANE_NODE_STATE_REPLAY_CONTEXT,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_ROLLOUT_REQUIRED,
  CONTROL_PLANE_WORKLOAD_CLASS,
  ConnectWebSocketPhase,
  ContactSeedPhase,
  ControlPlaneField,
  ControlPlaneKernelIngress,
  ControlPlaneMessageType,
  ControlPlaneSetup,
  CreateMessageGroupPhase,
  DEFAULT_NODE_CAPABILITIES,
  EventEmitter,
  HEARTBEAT_STATE,
  JOINING_DEFAULT,
  JOINING_ERROR_MSG,
  JOINING_ERROR_NAME,
  JOINING_HTTP,
  JOINING_LOG_MSG,
  JOINING_PHASE,
  JOINING_PHASE_TO_SUB_PHASE,
  JOINING_UNIFIED_RECONCILE,
  JOIN_BACKFILL_QUERY,
  JOIN_CHECKPOINT,
  JOIN_DELEGATE_BUNDLE,
  JOIN_PLAN_SEGMENT,
  JOIN_READINESS_REPAIR,
  JOIN_REJOIN_PROMOTION_RESTORE_STATE,
  JOIN_SESSION_PHASE,
  JoinCleanupHandler,
  JoinCoordinator,
  JoinMessageGroupRuntimeOwner,
  JoinReadinessEvaluator,
  JoinSessionStore,
  JoiningEvent,
  JoiningPhase,
  LEASE_STATE,
  LatencyTopologySetup,
  LoggingService,
  MembershipLifecycleController,
  MessageGroupServiceHandlerSetup,
  NODE_JOINING_SERVICE_LITERAL,
  NODE_STATE_UPDATE_PUBLICATION_DEFER_REASON,
  NODE_STATE_UPDATE_PUBLICATION_DEFER_STATE,
  NODE_STATE_UPDATE_PUBLICATION_PATH,
  NODE_STATE_UPDATE_PUBLICATION_RETRY_TARGET,
  NODE_STATE_UPDATE_RETRY_CLASS,
  NUM,
  NodeLifecycleStateMachine,
  NodeService,
  NodeState,
  NodeStatePublicationOwner,
  NodeStorageBudgetSetup,
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PartitionService,
  PgWireStartupSafetyGate,
  PressureGovernor,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QuerySystemStatePhase,
  RAFT_ROLE,
  RPCClient,
  ReplicaHandlerSetup,
  ReplicaStatus,
  RuntimeServiceHandlerSetup,
  SERVICE_DESCRIPTOR_FIELD,
  SERVICE_LIFECYCLE_STATE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  SQLQueryEngine,
  STARTUP_JOIN_MODE,
  STATE,
  STORAGE_DEFAULT,
  STRING,
  StartupPipelineRunner,
  StartupRuntimeHandoffOwner,
  StartupRuntimeSurfaceOwner,
  StartupServiceLifecycleOwner,
  TABLES,
  TIME_MS,
  TYPEOF,
  TablePolicyService,
  UNIFIED_SERVICE_TYPE,
  WORK_CLASS,
  WaitForLeadershipPhase,
  WorkClassScheduler,
  _deriveWsAddressFromNodeAddress,
  _formatLeaderMetadataDetails,
  _parseBootstrapError,
  _resolveSeedContactRetryAfterMs,
  activateMessageGroupServiceRows,
  activatePartitionServiceRows,
  activateSteadyStateRuntimeHandoff,
  assertCritical,
  assertJoinPlanSegments,
  assertRequiredControlPlaneRollout,
  buildControlPlaneWorkloadProfile,
  buildDurableRejoinPartitionRestorePlans,
  buildNodeStateUpdateDeliveryError,
  buildNodeStateUpdatePublicationDiagnostics,
  buildNodeStateUpdatePublicationFailureAction,
  buildNodeStateUpdatePublicationFailureError,
  buildNodeStateUpdatePublicationOutcome,
  buildOwnerContractOutcome,
  buildPartitionCdcPropagationSubscriber,
  canonicalizeSystemTableRow,
  classifyTransportDeliveryOutcome,
  compareJoinSchemaVersions,
  createJoinStartupPlan,
  createJoiningPhaseOwners,
  createNodeStateUpdateDeferredPublicationState,
  createRuntimeStartupWiring,
  extractJoinSchemaVersionFromRecord,
  formatReplicatedServiceAddress,
  getControlPlaneErrorCode,
  getControlPlaneErrorMessage,
  getControlPlaneMessageRequiredTables,
  getControlPlaneNodeStatePublicationProfile,
  getControlPlaneRetryAfterMs,
  getSystemCachePrimaryKeyFieldOrFallback,
  isDeliveredTransportDeliveryOutcome,
  isHeartbeatEscalatedControlPlaneNodeStatePublicationMode,
  isRetryableControlPlaneError,
  resolveCanonicalLeaderIdentitySnapshot,
  resolveControlPlaneNodeStatePublicationMode,
  resolveMembershipJoinIntentType,
  resolveReplayControlPlaneNodeStatePublicationMode,
  shouldAttachPartitionCdcPropagation,
  uuidv4,
  waitForLocalQueryTransportReadiness,
  waitForMetadataPublicationReadiness,
  wireMigrationWorkflowOwners,
} = NODE_JOINING_SERVICE_SHARED;

class NodeJoiningService extends NodeJoiningServiceSegment5 {
  ensureLatencyTopologyOwners() {
    if (this.latencyTopology) {
      return this.latencyTopology;
    }
    this.latencyTopology = LatencyTopologySetup.create({
      nodeId: this.nodeId,
      systemTableCache: NodeService.getInstance().getSystemTableCache(),
      cdcIntegrationService: this.cdcIntegrationService,
      messageRouter: this.messageRouter,
    });
    this.latencyTopology.latencyTreeService.start({
      recomputeImmediately: true,
    });
    this.latencyTopology.cdcGroupPropagationService.start();
    this.logger.info(JOINING_LOG_MSG.LATENCY_TOPOLOGY_READY, {
      nodeId: this.nodeId,
      owner: NODE_JOINING_SERVICE_LITERAL.LATENCYTOPOLOGYSETUP,
    });
    return this.latencyTopology;
  }
  /**
   * Start latency topology lifecycle owners.
   * This is intentionally non-blocking relative to READY transition.
   * @private
   */
  startLatencyTopologyLifecycle() {
    return this.runtimeHandoffOwner.startLatencyTopologyLifecycle();
  }
  /**
   * Propagate partition CDC via topology-owned propagation path.
   * @param {Object} messageGroupService
   * @param {Object} cdcEvent
   * @return {Promise<Object>}
   * @private
   */
  async propagatePartitionCDCEvent(messageGroupService, cdcEvent) {
    const topologyOwners = assertCritical(
      this.latencyTopology,
      JOINING_ERROR_MSG.LATENCY_TOPOLOGY_MISSING,
    );
    return topologyOwners.cdcGroupPropagationService.propagateCDCEvent({
      tableName: cdcEvent.tableName,
      operation: cdcEvent.operation,
      data: cdcEvent.data,
      sourceMessageGroupService: messageGroupService,
    });
  }
  /**
   * Get the node storage budget service.
   * @return {NodeStorageBudgetService}
   * @private
   */
  getNodeStorageBudgetService() {
    if (this.nodeStorageBudgetService) {
      return this.nodeStorageBudgetService;
    }
    const service = NodeStorageBudgetSetup.create({
      nodeId: this.nodeId,
      cdcIntegrationService: this.cdcIntegrationService,
    });
    this.nodeStorageBudgetService = service;
    return service;
  }
  /**
   * Expose the bootstrap topology owner surface to the steady-state SQL
   * runtime so joined nodes can retain canonical leader identity while local
   * system-table rows converge after bootstrap.
   * @return {BootstrapTopologySnapshotOwner}
   */
  getBootstrapTopologySnapshotOwner() {
    if (!this.bootstrapTopologySnapshotOwner) {
      this.bootstrapTopologySnapshotOwner = new BootstrapTopologySnapshotOwner({
        delegates: {
          getSystemTableCache: () =>
            NodeService.getInstance().getSystemTableCache(),
          getPartitionServices: () => this.partitionServices,
          getSeedNodeId: () => this.seedNodeId,
          getLogger: () => this.logger,
          getCurrentEpoch: () => this.epochManager?.getCurrentEpoch?.() || null,
        },
      });
    }
    return this.bootstrapTopologySnapshotOwner;
  }
  /**
   * Get the current joining phase.
   * @return {string} Current phase.
   */
  getPhase() {
    return this.phase;
  }
  /**
   * Get joining status.
   * @return {Object} Joining status.
   */
  getStatus() {
    const baseStatus = {
      nodeId: this.nodeId,
      phase: this.phase,
      lifecycleState: this.lifecycleStateMachine.getState(),
      startTime: this.startTime,
      duration: this.startTime ? this.now() - this.startTime : NUM.ZERO,
      messageGroupCount: this.messageGroupServices.size,
      lastError: this.lastError?.message || null,
    };
    if (
      !this.joinReadinessEvaluator ||
      typeof this.joinReadinessEvaluator.buildCanonicalJoinReadinessSnapshot !==
        TYPEOF.FUNCTION ||
      typeof this.joinReadinessEvaluator
        .evaluateCanonicalJoinReadinessSnapshot !== TYPEOF.FUNCTION
    ) {
      return baseStatus;
    }
    try {
      const readinessSnapshot =
        this.joinReadinessEvaluator.buildCanonicalJoinReadinessSnapshot();
      const evaluation =
        this.joinReadinessEvaluator.evaluateCanonicalJoinReadinessSnapshot(
          readinessSnapshot,
        );
      return {
        ...baseStatus,
        promotionState: evaluation?.promotionState || null,
        promotionReasons: Array.isArray(evaluation?.promotionReasons)
          ? [...evaluation.promotionReasons]
          : [],
        snapshotRevision: evaluation?.snapshotRevision ?? null,
        snapshotRevisionState: evaluation?.snapshotRevisionState || null,
        snapshotExpectedMinimumRevision:
          evaluation?.snapshotExpectedMinimumRevision ?? null,
        snapshotRevisionGap: evaluation?.snapshotRevisionGap ?? null,
        snapshotResumeToken: evaluation?.snapshotResumeToken || null,
      };
    } catch (_error) {
      return baseStatus;
    }
  }
  /**
   * Get the node lifecycle state machine.
   * @return {NodeLifecycleStateMachine} The lifecycle state machine.
   */
  getLifecycleStateMachine() {
    return this.lifecycleStateMachine;
  }
  /**
   * Check if joining has local message group replica with leadership.
   * @return {boolean} True if has operational message group.
   */
  hasOperationalMessageGroup() {
    return this.getLeaderMessageGroupService() !== null;
  }
  /**
   * Check if any joined message group has a leader in the system cache.
   * @param {Object} systemTableCache - System table cache.
   * @return {boolean} True if cache reports a leader for any joined group.
   * @private
   */
  hasMessageGroupLeaderInCache(systemTableCache) {
    if (!systemTableCache) {
      return false;
    }
    const groupIds = new Set();
    for (const service of this.messageGroupServices.values()) {
      if (service?.groupId) {
        groupIds.add(service.groupId);
      }
    }
    if (groupIds.size === NUM.ZERO) {
      return false;
    }
    const services =
      typeof systemTableCache.filter === TYPEOF.FUNCTION
        ? systemTableCache.filter(
            TABLES.SERVICES,
            (service) =>
              service?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP &&
              groupIds.has(service?.[COLUMN.GROUP_ID]) &&
              service?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE,
          )
        : (systemTableCache.getAll?.(TABLES.SERVICES) || []).filter(
            (service) =>
              service?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP &&
              groupIds.has(service?.[COLUMN.GROUP_ID]) &&
              service?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE,
          );
    if (services.length === NUM.ZERO) {
      return false;
    }
    const groupRows =
      typeof systemTableCache.filter === TYPEOF.FUNCTION
        ? systemTableCache.filter(TABLES.MESSAGE_GROUPS, (group) =>
            groupIds.has(group?.[COLUMN.GROUP_ID]),
          )
        : (systemTableCache.getAll?.(TABLES.MESSAGE_GROUPS) || []).filter(
            (group) => groupIds.has(group?.[COLUMN.GROUP_ID]),
          );
    const activeServiceExistsForCanonicalLeader = groupRows.some((group) => {
      const groupId =
        group?.[COLUMN.GROUP_ID] || group?.group_id || group?.groupId || null;
      if (typeof groupId !== TYPEOF.STRING || groupId.length === NUM.ZERO) {
        return false;
      }
      const groupServices = services.filter(
        (service) => service?.[COLUMN.GROUP_ID] === groupId,
      );
      if (groupServices.length === NUM.ZERO) {
        return false;
      }
      const leaderIdentity = resolveCanonicalLeaderIdentitySnapshot({
        partition: group,
        partitionPresent: true,
        serviceRows: groupServices,
      });
      return (
        typeof leaderIdentity?.leaderNodeId === TYPEOF.STRING &&
        leaderIdentity.leaderNodeId.length > NUM.ZERO
      );
    });
    if (activeServiceExistsForCanonicalLeader) {
      return true;
    }
    return services.some((service) => {
      return (
        String(service?.[COLUMN.RAFT_ROLE] || "").toLowerCase() ===
        String(RAFT_ROLE.LEADER).toLowerCase()
      );
    });
  }
  /**
   * Sleep for a specified duration.
   * @param {number} ms - Milliseconds to sleep.
   * @return {Promise<void>}
   * @private
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
export { NodeJoiningService, JoiningPhase, NodeState };

