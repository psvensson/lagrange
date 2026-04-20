import { NODE_JOINING_SERVICE_SHARED } from "./node-joining-service-shared.js";
import { NodeJoiningServiceSegment2 } from "./node-joining-service-segment-2.js";

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

class NodeJoiningServiceSegment3 extends NodeJoiningServiceSegment2 {
  async createJoinPartitionReplica(context) {
    const definition = context?.definition || {};
    const directOptions = context?.replicaOptions || null;
    const serviceId =
      directOptions?.replicaId ||
      definition[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID];
    const options =
      directOptions ||
      this.resolveJoinReplicaOptions(serviceId, UNIFIED_SERVICE_TYPE.PARTITION);
    if (this.partitionServices.has(options.replicaId)) {
      return { status: SERVICE_LIFECYCLE_STATE.CREATED };
    }
    if (options.createDelayMs > NUM.ZERO) {
      await this.sleep(options.createDelayMs);
    }
    await this.createJoinLocalPartitionService(options);
    return { status: SERVICE_LIFECYCLE_STATE.CREATED };
  }
  /**
   * Unified lifecycle start hook for join partition replicas.
   * @param {Object} replicaHandle
   * @param {Object} context
   * @return {Promise<Object>}
   * @private
   */
  async startJoinPartitionReplica(replicaHandle, context) {
    const directOptions = context?.replicaOptions || null;
    const serviceId =
      directOptions?.replicaId ||
      replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] ||
      replicaHandle[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID];
    const options =
      directOptions ||
      this.resolveJoinReplicaOptions(serviceId, UNIFIED_SERVICE_TYPE.PARTITION);
    const partition = this.partitionServices.get(options.replicaId);
    assertCritical(
      partition,
      `Join partition replica ${options.replicaId} missing at start`,
    );
    if (
      !options.deferElection &&
      typeof partition.startElection === TYPEOF.FUNCTION
    ) {
      partition.startElection();
    }
    return {
      status: SERVICE_LIFECYCLE_STATE.RUNNING,
      deferred: Boolean(options.deferElection),
    };
  }
  /**
   * Unified lifecycle stop hook for join partition replicas.
   * @param {Object} replicaHandle
   * @param {Object} context
   * @return {Promise<Object>}
   * @private
   */
  async stopJoinPartitionReplica(replicaHandle, context) {
    const directOptions = context?.replicaOptions || null;
    const serviceId =
      directOptions?.replicaId ||
      replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] ||
      replicaHandle[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID];
    const options =
      directOptions ||
      this.resolveJoinReplicaOptions(serviceId, UNIFIED_SERVICE_TYPE.PARTITION);
    const partition = this.partitionServices.get(options.replicaId);
    if (!partition) {
      return { status: SERVICE_LIFECYCLE_STATE.STOPPED };
    }
    if (typeof partition.shutdown === TYPEOF.FUNCTION) {
      await partition.shutdown();
    }
    const unifiedAddress =
      typeof partition.getUnifiedAddress === TYPEOF.FUNCTION
        ? partition.getUnifiedAddress()
        : formatReplicatedServiceAddress(
            SERVICE_TYPE.PARTITION,
            this.nodeId,
            options.replicaId,
          );
    this.messageRouter?.unregister?.(unifiedAddress);
    this.partitionServices.delete(options.replicaId);
    this.replicaHandler?.localServices?.delete?.(options.replicaId);
    this.replicaHandler?.localReplicas?.delete?.(options.replicaId);
    return { status: SERVICE_LIFECYCLE_STATE.STOPPED };
  }
  /**
   * Unified lifecycle start hook for join message-group replicas.
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   * @private
   */
  async startJoinMessageGroupReplica(replicaHandle, _context) {
    return this.createMessageGroupPhase.startJoinMessageGroupReplica(
      replicaHandle,
      _context,
    );
  }
  /**
   * Unified lifecycle stop hook for join message-group replicas.
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   * @private
   */
  async stopJoinMessageGroupReplica(replicaHandle, _context) {
    return this.createMessageGroupPhase.stopJoinMessageGroupReplica(
      replicaHandle,
      _context,
    );
  }
  /**
   * Compatibility shim for deferred self-hosted join elections.
   * Replica create/start ownership remains in unified lifecycle adapters.
   * @param {string} groupId - Message group ID.
   * @return {void}
   * @private
   */
  startDeferredJoinMessageGroupElections(groupId) {
    return this.createMessageGroupPhase.startDeferredJoinMessageGroupElections(
      groupId,
    );
  }
  /**
   * Phase 3a: Create self-hosted message group (3 replicas on this node).
   * Requirements: 8.3 - Services created AFTER self-connection established.
   * @param {Object} assignment - Assignment instructions.
   * @return {Promise<void>}
   * @private
   */
  async phaseCreateSelfHostedMessageGroup(assignment) {
    return this.createMessageGroupPhase.phaseCreateSelfHostedMessageGroup(
      assignment,
    );
  }
  /**
   * Get the leader message group service for sending lifecycle messages.
   * Returns the first local ingress-ready leader, or an ingress-ready relay
   * replica when the leader is remote.
   * @return {Object|null} Message group service or null.
   * @private
   */
  resolveOperationalMessageGroupSelection(options = {}) {
    const requiredTables =
      Array.isArray(options.requiredTables) && options.requiredTables.length > 0
        ? options.requiredTables
        : getControlPlaneMessageRequiredTables(
            ControlPlaneMessageType.NODE_STATE_UPDATE,
          );
    return this.messageGroupSelectionOwner.resolveOperationalMessageGroupSelection(
      { ...options, requiredTables },
    );
  }
  /**
   * Resolve the local message-group transport used for query/data-plane
   * participation. This deliberately avoids control-plane metadata-ingress
   * gating so bootstrap reads can proceed during join convergence.
   * @return {Object}
   * @private
   */
  resolveQueryTransportMessageGroupSelection() {
    return this.messageGroupSelectionOwner.resolveQueryTransportMessageGroupSelection();
  }
  /**
   * Resolve operational ingress after authoritative strict-forward repair for
   * system-table CDC during join convergence.
   * @param {Object} [options]
   * @param {Array<string>} [options.requiredTables]
   * @return {Promise<Object>}
   * @private
   */
  async resolveOperationalMessageGroupSelectionAsync(options = {}) {
    const requiredTables =
      Array.isArray(options.requiredTables) && options.requiredTables.length > 0
        ? options.requiredTables
        : getControlPlaneMessageRequiredTables(
            ControlPlaneMessageType.NODE_STATE_UPDATE,
          );
    return this.messageGroupSelectionOwner.resolveOperationalMessageGroupSelectionAsync(
      { ...options, requiredTables },
    );
  }
  /**
   * Get the operational message-group service for sending lifecycle messages.
   * Returns the first local ingress-ready leader, or an ingress-ready relay
   * replica when the leader is remote.
   * @param {Object} [options]
   * @param {Array<string>} [options.requiredTables]
   * @return {Object|null} Message group service or null.
   * @private
   */
  getLeaderMessageGroupService(options = {}) {
    return this.resolveOperationalMessageGroupSelection(options).service;
  }
  buildMessageGroupOwnerNotReadyError(selection = {}, options = {}) {
    return this.messageGroupSelectionOwner.buildMessageGroupOwnerNotReadyError(
      selection,
      options,
    );
  }
  /**
   * Resolve the message-group service to use for partition CDC propagation.
   * Prefers the current operational ingress and falls back to the captured
   * subscription ingress when it still satisfies metadata-ingress readiness.
   * @param {Object|null} preferredMessageGroupService
   * @param {Object} [options]
   * @param {Array<string>} [options.requiredTables]
   * @return {Promise<Object|null>}
   */
  async resolveCdcPropagationMessageGroup(
    preferredMessageGroupService,
    options = {},
  ) {
    const selection = await this.resolveOperationalMessageGroupSelectionAsync({
      requiredTables: Array.isArray(options.requiredTables)
        ? options.requiredTables
        : [],
      preferredService: preferredMessageGroupService,
      reuseCapturedIngress: true,
    });
    return selection.service || null;
  }
  /**
   * Enforce single-owner invariant before starting a local message-group replica.
   * Unauthorized duplicate startup must fail fast.
   * @param {string} replicaId
   * @return {void}
   * @private
   */
  assertReplicaStartupOwnership(replicaId) {
    return this.joinMessageGroupRuntimeOwner.assertReplicaStartupOwnership(
      replicaId,
    );
  }
  /**
   * Phase 3b: Join existing message group by moving a replica.
   * Requirements: 8.3 - Services created AFTER self-connection established.
   * @param {Object} assignment - Assignment instructions.
   * @return {Promise<void>}
   * @private
   */
  async phaseJoinExistingMessageGroup(assignment) {
    return this.joinMessageGroupRuntimeOwner.phaseJoinExistingMessageGroup(
      assignment,
    );
  }
  /**
   * Register a message group service in the cluster's services table.
   * This ensures other nodes can discover this replica.
   * @param {string} groupId - Message group ID.
   * @param {string} replicaId - Replica ID.
   * @param {MessageGroupService} service - The message group service.
   * @return {Promise<void>}
   * @private
   */
  async registerMessageGroupService(groupId, replicaId, service, options = {}) {
    return this.createMessageGroupPhase.registerMessageGroupService(
      groupId,
      replicaId,
      service,
      options,
    );
  }
  hasPublishedLocalServiceEndpoints() {
    const systemTableCache = NodeService.getInstance().getSystemTableCache();
    const localEndpointRows =
      systemTableCache?.filter?.(
        TABLES.SERVICE_ENDPOINTS,
        (row) => row?.[COLUMN.NODE_ID] === this.nodeId,
      ) ||
      (systemTableCache?.getAll?.(TABLES.SERVICE_ENDPOINTS) || []).filter(
        (row) => row?.[COLUMN.NODE_ID] === this.nodeId,
      );
    return localEndpointRows.length > NUM.ZERO;
  }
  getRegisteredJoinNodeId() {
    const systemTableCache = NodeService.getInstance().getSystemTableCache();
    const nodeRow = systemTableCache?.get?.(TABLES.NODES, this.nodeId);
    return nodeRow ? this.nodeId : null;
  }
  async activateMessageGroupServiceRows() {
    return activateMessageGroupServiceRows({
      nodeId: this.nodeId,
      activateReplica: async ({ groupId, replicaId, service }) => {
        await this.registerMessageGroupService(groupId, replicaId, service, {
          status: SERVICE_STATUS.ACTIVE,
        });
      },
      messageRouter: this.messageRouter,
      messageGroupServiceHandler: this.messageGroupServiceHandler,
      endpointsPublished: this.hasPublishedLocalServiceEndpoints(),
      messageGroupServices: this.messageGroupServices,
    });
  }
  async activateJoinPartitionServiceRows(replicaIds = null) {
    const partitionServices =
      replicaIds == null
        ? this.partitionServices
        : new Map(
            replicaIds
              .map((replicaId) => [
                replicaId,
                this.partitionServices.get(replicaId),
              ])
              .filter(([, service]) => service != null),
          );
    return activatePartitionServiceRows({
      nodeId: this.nodeId,
      systemTableWriter: this.createCdcIntegrationService(),
      messageRouter: this.messageRouter,
      deferTransientFailures: true,
      onDeferredActivation: ({ partitionId, replicaId, error }) => {
        this.logger.warn(
          NODE_JOINING_SERVICE_LITERAL.DEFERRING_JOIN_PARTITION_SERVICE_ROW_ACTIVATION,
          {
            nodeId: this.nodeId,
            partitionId,
            replicaId,
            error: error?.message || String(error),
          },
        );
      },
      partitionServices,
    });
  }
  startJoinOpportunisticBackfill() {
    return this.querySystemStatePhase.startJoinOpportunisticBackfill();
  }
  /**
   * Persist metadata required for CREATE_SELF_HOSTED joins.
   * Ensures message_groups and per-replica services rows are present before
   * join can complete successfully.
   * @return {Promise<void>}
   * @private
   */
  async registerCreateSelfHostedMetadata() {
    return this.createMessageGroupPhase.registerCreateSelfHostedMetadata();
  }
  /**
   * Phase 3: Wait for message group leadership establishment.
   * @return {Promise<void>}
   * @private
   */
  async phaseWaitForLeadership() {
    return this.waitForLeadershipPhase.phaseWaitForLeadership();
  }
  /**
   * Build bootstrap payload for IDENTIFY message.
   * @return {Object|null} Identify bootstrap payload.
   * @private
   */
  getIdentifyBootstrapPayload() {
    if (!this.bootstrapResponse) {
      return null;
    }
    return {
      seedNodeId: this.seedNodeId,
      seedNodeWsAddress: this.seedNodeWsAddress,
      messageGroupAssignment: this.bootstrapResponse.messageGroupAssignment,
      partitionLeaders: this.bootstrapResponse.partitionLeaders,
      latencyTopologyHints: this.bootstrapResponse.latencyTopologyHints,
      clusterConfig: this.bootstrapResponse.clusterConfig,
      timestamp: this.bootstrapResponse.timestamp,
    };
  }
  /**
   * Get the default node capabilities for control plane registration.
   * @return {Array<string>} Capabilities list.
   * @private
   */
  getNodeCapabilities() {
    return [...DEFAULT_NODE_CAPABILITIES];
  }
  /**
   * Resolve the control plane message target address.
   * Prefer authoritative services-table metadata. Bootstrap peer hints are
   * used only when authoritative metadata is not yet available.
   * @param {Object} [options] - Resolution options.
   * @param {boolean} [options.allowBootstrapHints=true] - Allow hint fallback.
   * @param {boolean} [options.allowSelfTarget=false] - Allow local message-group targets.
   * @return {string|null} Target address or null.
   * @private
   */
  resolveControlPlaneTargetAddress(options = {}) {
    return (
      this.resolveControlPlaneTargetAddressCandidates(options)[NUM.ZERO] || null
    );
  }
  /**
   * Resolve ordered control-plane target candidates.
   * Prefer local authoritative ingress, then remote authoritative ingress,
   * then bootstrap hints as a last resort.
   * @param {Object} [options] - Resolution options.
   * @param {boolean} [options.allowBootstrapHints=true] - Allow hint fallback.
   * @param {boolean} [options.allowSelfTarget=false] - Allow local targets.
   * @return {Array<string>} Ordered unique target addresses.
   * @private
   */
  resolveControlPlaneTargetAddressCandidates(options = {}) {
    return this.controlPlaneKernelIngress.resolveTargetCandidates(options);
  }
  /**
   * Resolve ordered target candidates for one NODE_STATE_UPDATE publication.
   * READY heartbeat publications prefer remote authoritative ingress first so
   * a newly self-hosted local ingress replica does not trap liveness updates
   * behind its own still-converging metadata path. Earlier lifecycle updates
   * keep the existing local-first behavior, and READY heartbeats still retain
   * local fallback when no remote ingress is reachable.
   * @param {Object} [options]
   * @param {string} [options.state]
   * @param {number} [options.heartbeatAt]
   * @return {Array<string>}
   * @private
   */
  resolveNodeStateUpdateTargetCandidates(options = {}) {
    return this.controlPlaneKernelIngress.resolveNodeStateUpdateTargetCandidates(
      {
        ...options,
        allowBootstrapHints: true,
        localTargetMode: NODE_JOINING_SERVICE_LITERAL.ANY_REPLICA,
        requiredTables: getControlPlaneMessageRequiredTables(
          ControlPlaneMessageType.NODE_STATE_UPDATE,
        ),
      },
    );
  }
  /**
   * Determine whether a control-plane publication failure should be retried
   * against a different target address.
   * @param {?Error} error
   * @return {boolean}
   * @private
   */
  shouldRetryControlPlaneNodeStateUpdate(error, publicationMode = null) {
    if (
      isHeartbeatEscalatedControlPlaneNodeStatePublicationMode(publicationMode)
    ) {
      return isRetryableControlPlaneError(error);
    }
    const message =
      typeof error?.message === TYPEOF.STRING ? error.message : "";
    return (
      message.includes(NODE_JOINING_SERVICE_LITERAL.NO_CONNECTION_TO_NODE) ||
      (message.includes(NODE_JOINING_SERVICE_LITERAL.CONNECTION_TO_NODE) &&
        message.includes(NODE_JOINING_SERVICE_LITERAL.CLOSED)) ||
      message.includes(NODE_JOINING_SERVICE_LITERAL.MESSAGE_TIMEOUT) ||
      message.includes(
        NODE_JOINING_SERVICE_LITERAL.NO_HANDLER_REGISTERED_FOR_ADDRESS,
      ) ||
      message.includes(JOINING_ERROR_MSG.CONTROL_PLANE_TARGET_MISSING)
    );
  }
  /**
   * Classify one NODE_STATE_UPDATE send failure using the same publication
   * pressure contract that the receiver owner already uses.
   * @param {?Error} error
   * @return {string}
   * @private
   */
  resolveNodeStateUpdatePublicationRetryClass(error) {
    const errorCode = getControlPlaneErrorCode(error);
    const errorMessage = getControlPlaneErrorMessage(error);
    if (
      errorCode === QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE ||
      errorMessage.includes(QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE) ||
      errorMessage.includes(QUERY_ERROR_MSG.QUERY_ROUTING_FAILED) ||
      errorMessage.includes(QUERY_ERROR_MSG.NO_ACTIVE_SERVICE_FOR_PARTITION)
    ) {
      return NODE_STATE_UPDATE_RETRY_CLASS.PUBLICATION_PRESSURE;
    }
    return NODE_STATE_UPDATE_RETRY_CLASS.TRANSIENT;
  }
  /**
   * Determine whether one send failure should collapse into the sender-owned
   * deferred publication slot instead of fanning out to more ingress targets.
   * @param {?Error} error
   * @param {?Object} publicationProfile
   * @return {boolean}
   * @private
   */
  shouldDeferNodeStateUpdatePublication(error, publicationProfile = null) {
    if (publicationProfile?.allowPressureDefer !== true) {
      return false;
    }
    return (
      this.resolveNodeStateUpdatePublicationRetryClass(error) ===
      NODE_STATE_UPDATE_RETRY_CLASS.PUBLICATION_PRESSURE
    );
  }
  /**
   * Resolve the bounded retry delay for sender-owned deferred publications.
   * @param {?Error} error
   * @return {number}
   * @private
   */
  resolveNodeStateUpdatePublicationRetryAfterMs(error) {
    const retryAfterMs = getControlPlaneRetryAfterMs(error);
    if (retryAfterMs > NUM.ZERO) {
      return Math.max(NUM.ONE, Math.floor(retryAfterMs));
    }
    const configuredRetryAfterMs = Number(this.config?.readySignalRetryDelayMs);
    if (
      Number.isFinite(configuredRetryAfterMs) &&
      configuredRetryAfterMs > NUM.ZERO
    ) {
      return Math.floor(configuredRetryAfterMs);
    }
    return JOINING_DEFAULT.readySignalRetryDelayMs;
  }
  /**
   * Clear the sender-owned deferred publication slot.
   * @return {void}
   * @private
   */
  clearDeferredNodeStateUpdatePublication() {
    this.nodeStateUpdateDeferredPublication =
      createNodeStateUpdateDeferredPublicationState();
  }
  /**
   * Build one canonical deferred publication outcome.
   * @param {Object} deferredPublication
   * @param {number} nowMs
   * @return {Object}
   * @private
   */
  buildDeferredNodeStateUpdatePublicationOutcome(deferredPublication, nowMs) {
    const remainingRetryAfterMs = Math.max(
      NUM.ZERO,
      deferredPublication.nextAttemptAtMs - nowMs,
    );
    const publicationDiagnostics =
      deferredPublication.publicationDiagnostics ||
      Object.freeze({
        publicationPath: NODE_STATE_UPDATE_PUBLICATION_PATH,
        nodeStatePublicationMode: deferredPublication.publicationMode,
      });
    const reasonCodes =
      deferredPublication.reason !==
      NODE_STATE_UPDATE_PUBLICATION_DEFER_REASON.NONE
        ? Object.freeze([deferredPublication.reason])
        : Object.freeze([]);
    return buildNodeStateUpdatePublicationOutcome({
      contractState: OWNER_CONTRACT_STATE.DEFERRED,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
      reasonCodes,
      retryAfterMs: remainingRetryAfterMs,
      nextAttemptAtMs: deferredPublication.nextAttemptAtMs,
      publicationMode: deferredPublication.publicationMode,
      publicationDiagnostics,
    });
  }
  /**
   * Reuse one existing deferred publication slot when the sender is still
   * inside the bounded publication-pressure backoff window.
   * @param {Object} message
   * @param {string} publicationMode
   * @param {Object} publicationProfile
   * @return {Object|null}
   * @private
   */
  resolveDeferredNodeStateUpdatePublicationOutcome(
    message,
    publicationMode,
    publicationProfile,
  ) {
    if (publicationProfile?.allowPressureDefer !== true) {
      return null;
    }
    const deferredPublication = this.nodeStateUpdateDeferredPublication;
    if (
      deferredPublication.state !==
      NODE_STATE_UPDATE_PUBLICATION_DEFER_STATE.PENDING
    ) {
      return null;
    }
    const nowMs = this.now();
    if (nowMs >= deferredPublication.nextAttemptAtMs) {
      this.clearDeferredNodeStateUpdatePublication();
      return null;
    }
    const deferredPublicationMode =
      resolveReplayControlPlaneNodeStatePublicationMode({
        publicationMode,
        heartbeatOnly: message?.[ControlPlaneField.HEARTBEAT_ONLY] === true,
        replayContext: CONTROL_PLANE_NODE_STATE_REPLAY_CONTEXT.DEFERRED_PENDING,
        state: message?.[ControlPlaneField.STATE],
      });
    const deferredMessage =
      deferredPublicationMode === publicationMode
        ? message
        : {
            ...message,
            [ControlPlaneField.NODE_STATE_PUBLICATION_MODE]:
              deferredPublicationMode,
          };
    deferredPublication.message = deferredMessage;
    deferredPublication.publicationMode = deferredPublicationMode;
    deferredPublication.publicationDiagnostics = Object.freeze({
      ...(deferredPublication.publicationDiagnostics ||
        Object.freeze({
          publicationPath: NODE_STATE_UPDATE_PUBLICATION_PATH,
        })),
      nodeStatePublicationMode: deferredPublicationMode,
    });
    this.logger.debug(JOINING_LOG_MSG.NODE_STATE_UPDATE_DEFERRED, {
      nodeId: this.nodeId,
      publicationMode: deferredPublicationMode,
      retryAfterMs: Math.max(
        NUM.ZERO,
        deferredPublication.nextAttemptAtMs - nowMs,
      ),
      nextAttemptAtMs: deferredPublication.nextAttemptAtMs,
      reason: deferredPublication.reason,
    });
    return this.buildDeferredNodeStateUpdatePublicationOutcome(
      deferredPublication,
      nowMs,
    );
  }
  /**
   * Store the latest heartbeat publication payload in one canonical deferred
   * owner slot instead of issuing more immediate ingress retries.
   * @param {Object} options
   * @return {Object}
   * @private
   */
  deferNodeStateUpdatePublication(options = {}) {
    const retryAfterMs = this.resolveNodeStateUpdatePublicationRetryAfterMs(
      options.error,
    );
    const nowMs = this.now();
    const nextAttemptAtMs = nowMs + retryAfterMs;
    const deferredPublicationMode =
      resolveReplayControlPlaneNodeStatePublicationMode({
        publicationMode: options.publicationMode,
        heartbeatOnly:
          options.message?.[ControlPlaneField.HEARTBEAT_ONLY] === true,
        replayContext: CONTROL_PLANE_NODE_STATE_REPLAY_CONTEXT.DEFERRED_PENDING,
        state: options.message?.[ControlPlaneField.STATE],
      });
    const deferredMessage =
      deferredPublicationMode === options.publicationMode
        ? options.message
        : {
            ...options.message,
            [ControlPlaneField.NODE_STATE_PUBLICATION_MODE]:
              deferredPublicationMode,
          };
    const publicationDiagnostics = Object.freeze({
      publicationPath: NODE_STATE_UPDATE_PUBLICATION_PATH,
      ...(options.publicationDiagnostics || Object.freeze({})),
      nodeStatePublicationMode: deferredPublicationMode,
    });
    this.nodeStateUpdateDeferredPublication =
      createNodeStateUpdateDeferredPublicationState({
        state: NODE_STATE_UPDATE_PUBLICATION_DEFER_STATE.PENDING,
        reason: NODE_STATE_UPDATE_PUBLICATION_DEFER_REASON.PUBLICATION_PRESSURE,
        retryAfterMs,
        nextAttemptAtMs,
        message: deferredMessage,
        publicationMode: deferredPublicationMode,
        publicationDiagnostics,
      });
    this.logger.warn(JOINING_LOG_MSG.NODE_STATE_UPDATE_DEFERRED, {
      nodeId: this.nodeId,
      targetAddress: options.publicationDiagnostics?.targetAddress || null,
      state: options.state,
      publicationMode: deferredPublicationMode,
      retryAfterMs,
      nextAttemptAtMs,
      reason: NODE_STATE_UPDATE_PUBLICATION_DEFER_REASON.PUBLICATION_PRESSURE,
      error: options.error?.message || null,
    });
    return this.buildDeferredNodeStateUpdatePublicationOutcome(
      this.nodeStateUpdateDeferredPublication,
      nowMs,
    );
  }
  /**
   * Send a NODE_STATE_UPDATE control-plane message through the current
   * authoritative target address.
   * @param {Object} options - Node state payload.
   * @param {string} options.state - Node connection state.
   * @param {Array<string>|string} [options.capabilities] - Node capabilities.
   * @param {number} [options.heartbeatAt] - Heartbeat timestamp.
   * @param {number} [options.readyLeaseExpiresAt] - Lease expiry timestamp.
   * @param {boolean} [options.heartbeatOnly] - Set for liveness-only updates.
   * @param {Object} [options.nodeRow] - Full node row payload.
   * @return {Promise<void>}
   * @private
   */
}

export { NodeJoiningServiceSegment3 };
