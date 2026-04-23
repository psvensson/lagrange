import { NODE_JOINING_SERVICE_SHARED } from "./node-joining-service-shared.js";
import { NodeJoiningServiceSegment1 } from "./node-joining-service-segment-1.js";

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

const JOIN_WORKFLOW_PLAN_VERSION = 'join-startup-plan/v1';

class NodeJoiningServiceSegment2 extends NodeJoiningServiceSegment1 {
  _buildJoinRuntimeWiringDelegates() {
    const self = this;
    return {
      getSystemTableCache: () =>
        NodeService.getInstance().getSystemTableCache(),
      getMessageRouter: () => self.messageRouter,
      getRebalanceCoordinator: () => self.rebalanceCoordinator,
      getCdcIntegrationService: () => self.cdcIntegrationService,
    };
  }
  /**
   * Execute checkpointed join infrastructure setup after the seed contact
   * step has completed.
   * @param {StartupPipelineRunner} startupPipelineRunner
   * @param {Object} joinPlan
   * @return {Promise<void>}
   * @private
   */
  async runJoinInfrastructurePhases(startupPipelineRunner, joinPlan) {
    const infraPhases = joinPlan.segments[JOIN_PLAN_SEGMENT.INFRASTRUCTURE];
    await startupPipelineRunner.run({
      phases: infraPhases.slice(NUM.ZERO, NUM.ONE),
    });
    this.lifecycleStateMachine.transition(NodeState.DISCOVERING);
    await startupPipelineRunner.run({ phases: infraPhases.slice(NUM.ONE) });
    await this.initializeJoinInfrastructure();
    await this.notifyLocalAdminRuntimeReady();
    this.lifecycleStateMachine.transition(NodeState.JOINING);
    this._applyDeferredJoinSubPhases();
  }
  /**
   * Apply sub-phase transitions for join phases that completed
   * before the lifecycle state machine reached JOINING state.
   * Walks through deferred phases in order so the sub-phase chain
   * is consistent with the declarative map (D5.1, Req 4.1, 4.4).
   * @private
   */
  _applyDeferredJoinSubPhases() {
    for (const phaseName of this._completedJoinPhases) {
      const subPhase = JOINING_PHASE_TO_SUB_PHASE[phaseName];
      if (subPhase) {
        this.lifecycleStateMachine.transitionSubPhase(subPhase);
      }
    }
    this._completedJoinPhases = [];
  }
  /**
   * Initialize join-owned infrastructure after message-group establishment.
   * @return {Promise<void>}
   * @private
   */
  async initializeJoinInfrastructure() {
    // Initialize ReplicaHandler BEFORE registering node in cluster
    // because node registration can trigger CREATE_REPLICA traffic.
    if (!this.rpcClient) {
      const leaderMessageGroup = assertCritical(
        this.getLeaderMessageGroupService(),
        JOINING_ERROR_MSG.MESSAGE_GROUP_LEADER_REQUIRED,
      );
      this.rpcClient = new RPCClient({
        messageGroupService: leaderMessageGroup,
      });
    }
    this.createCdcIntegrationService();
    this.ensureLatencyTopologyOwners();
    this.initializeReplicaHandler();
    this.initializeMessageGroupServiceHandler();
    await this.initializeControlPlaneService();
    this.initializeRuntimeServiceHandler();
    this.openExternalTransportAdmission();
  }
  /**
   * Open remote transport admission after join-owned runtime handlers exist.
   * Self-routing remains available earlier during bootstrap discovery.
   * @return {void}
   * @private
   */
  openExternalTransportAdmission() {
    if (
      this.messageRouter &&
      typeof this.messageRouter.setExternalAdmissionEnabled === TYPEOF.FUNCTION
    ) {
      this.messageRouter.setExternalAdmissionEnabled(true);
    }
  }
  /**
   * Notify one startup-owned hook that cache-backed local admin surfaces can
   * come online before full join publication completes.
   * @return {Promise<void>}
   * @private
   */
  async notifyLocalAdminRuntimeReady() {
    await this.runtimeSurfaceOwner.notifyLocalAdminRuntimeReady();
  }
  /**
   * Determine whether join-owned runtime infrastructure is already available
   * locally and can be reused for the current session.
   * @return {boolean}
   * @private
   */
  hasJoinInfrastructureReady() {
    return Boolean(
      this.bootstrapResponse &&
      this.messageRouter &&
      this.hasOperationalMessageGroup() &&
      this.rpcClient &&
      this.cdcIntegrationService &&
      this.heartbeatService,
    );
  }
  /**
   * Complete successful join finalization and emit the completion event.
   * @return {void}
   * @private
   */
  completeSuccessfulJoin() {
    this.lifecycleStateMachine.transition(NodeState.READY);
    for (const messageGroupService of this.messageGroupServices.values()) {
      if (
        typeof messageGroupService?.completeJoinConvergence === TYPEOF.FUNCTION
      ) {
        messageGroupService.completeJoinConvergence();
      }
    }
    this.disableSteadyStateControlPlaneReporter();
    activateSteadyStateRuntimeHandoff({
      owner: this.runtimeHandoffOwner,
      activateControlPlaneBackgroundWriters: true,
      flushDeferredCreateSelfHostedMetadata: true,
      activateDistributedTransactionRecovery: true,
      startLatencyTopologyLifecycle: true,
    });
    this.phase = JoiningPhase.COMPLETE;
    const duration = this.now() - this.startTime;
    this.logger.info(JOINING_LOG_MSG.COMPLETED, {
      nodeId: this.nodeId,
      duration,
      messageGroupCount: this.messageGroupServices.size,
      lifecycleState: this.lifecycleStateMachine.getState(),
    });
    this.emit(JoiningEvent.COMPLETE, {
      nodeId: this.nodeId,
      duration,
      messageGroupServices: this.messageGroupServices,
      transport: this.transport,
      messageRouter: this.messageRouter,
      lifecycleState: this.lifecycleStateMachine.getState(),
    });
  }
  /**
   * Build checkpointed join steps for durable join progression.
   * @param {StartupPipelineRunner} startupPipelineRunner
   * @param {Object} joinPlan
   * @return {Array<Object>}
   * @private
   */
  buildJoinCheckpointSteps(startupPipelineRunner, joinPlan) {
    return [
      {
        checkpoint: JOIN_CHECKPOINT.SEED_CONTACTED,
        phase: JOIN_SESSION_PHASE.SEED_CONTACTED,
        segment: JOIN_PLAN_SEGMENT.SEED_CONTACT,
        shouldRerun: () => {
          return (
            !this.bootstrapResponse ||
            !this.seedNodeId ||
            !this.seedNodeWsAddress
          );
        },
        run: async () => {
          await startupPipelineRunner.run({
            phases: joinPlan.segments[JOIN_PLAN_SEGMENT.SEED_CONTACT],
          });
        },
      },
      {
        checkpoint: JOIN_CHECKPOINT.JOIN_INFRASTRUCTURE_READY,
        phase: JOIN_SESSION_PHASE.INFRASTRUCTURE_READY,
        segment: JOIN_PLAN_SEGMENT.INFRASTRUCTURE,
        shouldRerun: () => !this.hasJoinInfrastructureReady(),
        run: async () => {
          await this.runJoinInfrastructurePhases(
            startupPipelineRunner,
            joinPlan,
          );
        },
      },
      {
        checkpoint: JOIN_CHECKPOINT.MEMBERSHIP_WRITTEN,
        phase: JOIN_SESSION_PHASE.MEMBERSHIP_WRITTEN,
        segment: JOIN_PLAN_SEGMENT.MEMBERSHIP,
        run: async () => {
          await startupPipelineRunner.run({
            phases: joinPlan.segments[JOIN_PLAN_SEGMENT.MEMBERSHIP],
          });
          await this.activateMessageGroupServiceRows();
          this.startJoinOpportunisticBackfill();
        },
      },
      {
        checkpoint: JOIN_CHECKPOINT.READY_LEASE_ASSIGNED,
        phase: JOIN_SESSION_PHASE.READY_LEASE_ASSIGNED,
        segment: JOIN_PLAN_SEGMENT.READINESS,
        run: async () => {
          await startupPipelineRunner.run({
            phases: joinPlan.segments[JOIN_PLAN_SEGMENT.READINESS],
          });
          await this.signalReadyForReplicas();
        },
      },
      {
        checkpoint: JOIN_CHECKPOINT.FINALIZED,
        phase: JOIN_SESSION_PHASE.FINALIZED,
        segment: JOIN_PLAN_SEGMENT.READINESS,
        terminal: true,
        shouldRerun: () => {
          return (
            this.phase !== JoiningPhase.COMPLETE ||
            this.lifecycleStateMachine.getState() !== NodeState.READY ||
            this.hasActiveControlPlaneBackgroundWriters() !== true
          );
        },
        run: async () => {
          this.completeSuccessfulJoin();
        },
      },
    ];
  }
  /**
   * Execute the full joining process.
   * Requirements: 4.1, 4.6, 4.7, 8.1, 8.2, 8.3 - Bootstrap sequence with lifecycle states.
   * @return {Promise<Object>} Joining result.
   */
  async join() {
    this.startTime = this.now();
    const allowResumeLatest =
      this.joinSessionIdProvided !== true &&
      this.config.autoResumeRetryableFailures === true;
    const resumedSessionId = await this.joinSessionStore.resolveSessionId({
      nodeId: this.nodeId,
      allowResumeLatest,
    });
    if (typeof resumedSessionId === TYPEOF.STRING &&
        resumedSessionId.length > NUM.ZERO) {
      this.joinSessionId = resumedSessionId;
    }
    const membershipLifecycleIntent =
      await this.membershipLifecycleController.submitJoinIntent({
        nodeId: this.nodeId,
        joinSessionId: this.joinSessionId,
        nodeAddress: this.nodeAddress,
        seedNodeAddress: this.seedNodeAddress,
        startupMode: this.startupMode,
      });
    const membershipLifecycleIntentType =
      membershipLifecycleIntent?.intentType ||
      resolveMembershipJoinIntentType(this.startupMode);
    this.logger.info(JOINING_LOG_MSG.STARTING, {
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
      seedNodeAddress: this.seedNodeAddress,
      lifecycleState: this.lifecycleStateMachine.getState(),
      joinSessionId: this.joinSessionId,
      membershipLifecycleIntentType,
    });
    const resumePolicy = this.resolveRetryableJoinResumePolicy();
    let attempt = NUM.ZERO;
    while (true) {
      attempt += NUM.ONE;
      this.resetLifecycleStateForRetryableResumeAttempt(attempt);
      try {
        if (this.lifecycleStateMachine.getState() !== NodeState.CONNECTING) {
          this.lifecycleStateMachine.transition(NodeState.CONNECTING);
        }
        const startupPipelineRunner = new StartupPipelineRunner({
          logger: this.logger,
          eventSink: this,
        });
        const joinPlan = createJoinStartupPlan(this);
        assertJoinPlanSegments(joinPlan);
        await this.joinCoordinator.run({
          nodeId: this.nodeId,
          sessionId: this.joinSessionId,
          allowResumeLatest,
          planVersion: JOIN_WORKFLOW_PLAN_VERSION,
          steps: this.buildJoinCheckpointSteps(startupPipelineRunner, joinPlan),
        });
        return {
          success: true,
          nodeId: this.nodeId,
          duration: this.now() - this.startTime,
          messageGroupServices: this.messageGroupServices,
          partitionServices: this.partitionServices,
          replicaHandler: this.replicaHandler,
          replicaStateMachine: this.replicaStateMachine,
          transport: this.transport,
          messageRouter: this.messageRouter,
          bootstrapResponse: this.bootstrapResponse,
          lifecycleStateMachine: this.lifecycleStateMachine,
        };
      } catch (error) {
        const failureResult = await this.handleJoiningFailure(error);
        if (
          !this.shouldAutoResumeRetryableJoinFailure(
            error,
            failureResult,
            attempt,
            resumePolicy,
          )
        ) {
          return failureResult;
        }
        const delayMs = this.computeRetryableJoinResumeDelayMs(
          error,
          attempt,
          resumePolicy,
        );
        this.logger.warn(JOINING_LOG_MSG.RETRYABLE_FAILURE_RESUMING, {
          nodeId: this.nodeId,
          joinSessionId: this.joinSessionId,
          attempt,
          maxAttempts: resumePolicy.maxAttempts,
          retryAfterMs: delayMs,
          phase: failureResult.phase,
          error: failureResult.error,
        });
        await this.sleep(delayMs);
      }
    }
  }
  /**
   * Retryable join-resume attempts must re-enter lifecycle transitions from a
   * valid bootstrap root state. Failed-attempt cleanup intentionally drives
   * the previous lifecycle machine to STOPPED, which is terminal by contract.
   * Reset only when resuming in-process so a retry does not fail closed on an
   * invalid STOPPED -> CONNECTING transition.
   *
   * @param {number} attempt
   * @return {void}
   */
  resetLifecycleStateForRetryableResumeAttempt(attempt) {
    if (attempt <= NUM.ONE) {
      return;
    }
    if (
      !this.lifecycleStateMachine ||
      typeof this.lifecycleStateMachine.getState !== TYPEOF.FUNCTION
    ) {
      return;
    }
    const currentState = this.lifecycleStateMachine.getState();
    if (currentState !== NodeState.STOPPED) {
      return;
    }
    this.lifecycleStateMachine = new NodeLifecycleStateMachine({
      nodeId: this.nodeId,
      initialState: NodeState.STARTING,
      now: this.now,
    });
    this._completedJoinPhases = [];
    this.phase = JoiningPhase.NOT_STARTED;
    this.logger.info(JOINING_LOG_MSG.RETRYABLE_FAILURE_LIFECYCLE_RESET, {
      nodeId: this.nodeId,
      joinSessionId: this.joinSessionId,
      attempt,
      previousState: currentState,
      nextState: NodeState.STARTING,
    });
  }
  resolveRetryableJoinResumePolicy() {
    const joinRetryPolicy = this.resolveJoinRetryPolicy();
    const joinHttpTimeoutMs = Number.isFinite(this.config.httpTimeoutMs)
      ? Math.max(NUM.ZERO, Math.floor(this.config.httpTimeoutMs))
      : JOINING_DEFAULT.httpTimeoutMs;
    const minimumMaxElapsedMs = Math.max(
      NUM.ZERO,
      joinRetryPolicy.retryTimeoutMs + joinHttpTimeoutMs,
    );
    return {
      enabled: this.config.autoResumeRetryableFailures === true,
      maxAttempts: Number.isFinite(
        this.config.retryableFailureResumeMaxAttempts,
      )
        ? Math.max(
            NUM.ONE,
            Math.floor(this.config.retryableFailureResumeMaxAttempts),
          )
        : JOINING_DEFAULT.retryableFailureResumeMaxAttempts,
      baseDelayMs: Number.isFinite(
        this.config.retryableFailureResumeBaseDelayMs,
      )
        ? Math.max(
            NUM.ONE,
            Math.floor(this.config.retryableFailureResumeBaseDelayMs),
          )
        : JOINING_DEFAULT.retryableFailureResumeBaseDelayMs,
      maxDelayMs: Number.isFinite(this.config.retryableFailureResumeMaxDelayMs)
        ? Math.max(
            NUM.ONE,
            Math.floor(this.config.retryableFailureResumeMaxDelayMs),
          )
        : JOINING_DEFAULT.retryableFailureResumeMaxDelayMs,
      maxElapsedMs: Number.isFinite(
        this.config.retryableFailureResumeMaxElapsedMs,
      )
        ? Math.max(
            minimumMaxElapsedMs,
            Math.floor(this.config.retryableFailureResumeMaxElapsedMs),
          )
        : Math.max(
            JOINING_DEFAULT.retryableFailureResumeMaxElapsedMs,
            minimumMaxElapsedMs,
          ),
    };
  }
  shouldAutoResumeRetryableJoinFailure(error, failureResult, attempt, policy) {
    if (policy?.enabled !== true) {
      return false;
    }
    if (error?.name === JOINING_ERROR_NAME.ABORT) {
      return false;
    }
    const elapsedMs = this.now() - this.startTime;
    if (attempt >= policy.maxAttempts || elapsedMs >= policy.maxElapsedMs) {
      this.logger.warn(JOINING_LOG_MSG.RETRYABLE_FAILURE_RESUME_EXHAUSTED, {
        nodeId: this.nodeId,
        joinSessionId: this.joinSessionId,
        attempt,
        maxAttempts: policy.maxAttempts,
        elapsedMs,
        maxElapsedMs: policy.maxElapsedMs,
        phase: failureResult?.phase || this.getPhase(),
        error: failureResult?.error || error?.message || null,
      });
      return false;
    }
    return isRetryableControlPlaneError(error);
  }
  computeRetryableJoinResumeDelayMs(error, attempt, policy) {
    const hintedDelayMs = getControlPlaneRetryAfterMs(error);
    if (hintedDelayMs > NUM.ZERO) {
      return Math.min(policy.maxDelayMs, hintedDelayMs);
    }
    const exponentialDelayMs =
      policy.baseDelayMs * NUM.TWO ** Math.max(NUM.ZERO, attempt - NUM.ONE);
    return Math.min(policy.maxDelayMs, exponentialDelayMs);
  }
  /**
   * Wait for local query/data-plane transport readiness before
   * advertising READY through the control plane.
   * @return {Promise<void>}
   * @private
   */
  async awaitLocalQueryTransportReadinessForReadySignal() {
    await waitForLocalQueryTransportReadiness({
      messageRouter: this.messageRouter,
      sleep: (delayMs) => this.sleep(delayMs),
      maxAttempts: this.config.readySignalMaxAttempts,
      initialDelayMs: this.config.readySignalRetryDelayMs,
      maxDelayMs: this.config.readySignalRetryMaxDelayMs,
      backoffMultiplier: this.config.readySignalRetryBackoffMultiplier,
      onRetry: ({ attempt, maxAttempts, delayMs, readiness }) => {
        this.logger.warn(JOINING_LOG_MSG.READY_SIGNAL_RETRYING, {
          nodeId: this.nodeId,
          attempt,
          maxAttempts,
          nextDelayMs: delayMs,
          error:
            readiness?.reason ||
            NODE_JOINING_SERVICE_LITERAL.LOCAL_QUERY_DATA_PLANE_TRANSPORT_IS_NOT_READY,
          gate: NODE_JOINING_SERVICE_LITERAL.LOCAL_QUERY_TRANSPORT,
          localQueryTransport: readiness,
        });
      },
    });
  }
  /**
   * Wait for canonical lifecycle metadata-publication readiness before
   * advertising READY through the control plane.
   * @return {Promise<void>}
   * @private
   */
  async awaitMetadataPublicationReadinessForReadySignal() {
    await waitForMetadataPublicationReadiness({
      readinessState: this.bootstrapReadinessState,
      sleep: (delayMs) => this.sleep(delayMs),
      maxAttempts: this.config.readySignalMaxAttempts,
      initialDelayMs: this.config.readySignalRetryDelayMs,
      maxDelayMs: this.config.readySignalRetryMaxDelayMs,
      backoffMultiplier: this.config.readySignalRetryBackoffMultiplier,
      onRetry: ({ attempt, maxAttempts, delayMs, snapshot }) => {
        this.logger.warn(JOINING_LOG_MSG.READY_SIGNAL_RETRYING, {
          nodeId: this.nodeId,
          attempt,
          maxAttempts,
          nextDelayMs: delayMs,
          error:
            NODE_JOINING_SERVICE_LITERAL.LIFECYCLE_METADATA_PUBLICATION_READINESS_IS_NOT_SATISFIED,
          gate: NODE_JOINING_SERVICE_LITERAL.METADATA_PUBLICATION_READINESS,
          lifecycleReadiness: snapshot || null,
        });
      },
    });
  }
  /**
   * Signal readiness to accept replica assignments.
   * @return {Promise<void>}
   * @private
   */
  async signalReadyForReplicas() {
    // Gate: verify CDC subscriptions are active before advertising
    // readiness. If not confirmed within timeout, proceed with
    // degraded status rather than blocking indefinitely (Req 5.3).
    await this.awaitCdcSubscriptionsForReadiness();
    try {
      await this.awaitLocalQueryTransportReadinessForReadySignal();
    } catch (error) {
      this.logger.error(JOINING_LOG_MSG.READY_SIGNAL_FAILED, {
        nodeId: this.nodeId,
        error:
          error?.message ||
          NODE_JOINING_SERVICE_LITERAL.LOCAL_QUERY_DATA_PLANE_TRANSPORT_IS_NOT_READY,
        gate: NODE_JOINING_SERVICE_LITERAL.LOCAL_QUERY_TRANSPORT,
        localQueryTransport: error?.localQueryTransport || null,
      });
      throw error;
    }
    try {
      await this.awaitMetadataPublicationReadinessForReadySignal();
    } catch (error) {
      this.logger.error(JOINING_LOG_MSG.READY_SIGNAL_FAILED, {
        nodeId: this.nodeId,
        error:
          error?.message ||
          NODE_JOINING_SERVICE_LITERAL.LIFECYCLE_METADATA_PUBLICATION_READINESS_IS_NOT_SATISFIED,
        gate: NODE_JOINING_SERVICE_LITERAL.METADATA_PUBLICATION_READINESS,
        lifecycleReadiness: error?.lifecycleReadiness || null,
      });
      throw error;
    }
    const heartbeat = assertCritical(
      this.heartbeatService,
      JOINING_ERROR_MSG.CONTROL_PLANE_SERVICE_REQUIRED,
    );
    const nodeService = NodeService.getInstance();
    const capabilities = this.getNodeCapabilities();
    const stats = await nodeService.getNodeStats();
    const heartbeatPayload = {
      cpu: { count: stats.cpu?.count, usagePercent: stats.cpu?.usagePercent },
      memory: {
        totalBytes: stats.memory?.totalBytes,
        usagePercent: stats.memory?.usagePercent,
      },
      diskGb: stats.diskGb,
      diskUsagePercent: stats.diskUsagePercent,
    };
    const maxAttempts = Number.isFinite(this.config.readySignalMaxAttempts)
      ? Math.max(NUM.ONE, Math.floor(this.config.readySignalMaxAttempts))
      : JOINING_DEFAULT.readySignalMaxAttempts;
    const maxDelayMs = Number.isFinite(this.config.readySignalRetryMaxDelayMs)
      ? Math.max(NUM.ONE, Math.floor(this.config.readySignalRetryMaxDelayMs))
      : JOINING_DEFAULT.readySignalRetryMaxDelayMs;
    const backoffMultiplier =
      Number.isFinite(this.config.readySignalRetryBackoffMultiplier) &&
      this.config.readySignalRetryBackoffMultiplier > NUM.ZERO
        ? this.config.readySignalRetryBackoffMultiplier
        : JOINING_DEFAULT.readySignalRetryBackoffMultiplier;
    let delayMs = Number.isFinite(this.config.readySignalRetryDelayMs)
      ? Math.max(NUM.ONE, Math.floor(this.config.readySignalRetryDelayMs))
      : JOINING_DEFAULT.readySignalRetryDelayMs;
    let lastError = null;
    for (let attempt = NUM.ONE; attempt <= maxAttempts; attempt++) {
      try {
        await heartbeat.sendHeartbeat(heartbeatPayload, capabilities);
        this.logger.info(JOINING_LOG_MSG.READY_SIGNAL_SUCCESS, {
          nodeId: this.nodeId,
          attempt,
          maxAttempts,
        });
        return;
      } catch (error) {
        lastError = error;
        if (attempt >= maxAttempts) {
          break;
        }
        this.logger.warn(JOINING_LOG_MSG.READY_SIGNAL_RETRYING, {
          nodeId: this.nodeId,
          attempt,
          maxAttempts,
          nextDelayMs: delayMs,
          error: error.message,
        });
        await this.sleep(delayMs);
        delayMs = Math.min(Math.floor(delayMs * backoffMultiplier), maxDelayMs);
      }
    }
    this.logger.error(JOINING_LOG_MSG.READY_SIGNAL_FAILED, {
      nodeId: this.nodeId,
      attempts: maxAttempts,
      error: lastError?.message || STRING.UNKNOWN,
    });
    throw lastError;
  }
  /**
   * Wait for CDC subscriptions to become active before advertising
   * node readiness. If subscriptions are not confirmed within the
   * re-establishment timeout, log a degraded-status warning and
   * proceed so the node is not blocked indefinitely.
   * @return {Promise<void>}
   * @private
   */
  async awaitCdcSubscriptionsForReadiness() {
    if (this.cdcSubscriptionsActive === true) {
      this.logger.info(JOINING_LOG_MSG.CDC_READINESS_GATE_PASSED, {
        nodeId: this.nodeId,
      });
      return;
    }
    const timeoutMs = CDC_REESTABLISHMENT.TIMEOUT_MS;
    const pollMs = CDC_REESTABLISHMENT.READINESS_GATE_POLL_MS;
    const startMs = this.now();
    this.logger.info(JOINING_LOG_MSG.CDC_READINESS_GATE_WAITING, {
      nodeId: this.nodeId,
      timeoutMs,
    });
    while (this.now() - startMs < timeoutMs) {
      if (this.cdcSubscriptionsActive === true) {
        this.logger.info(JOINING_LOG_MSG.CDC_READINESS_GATE_PASSED, {
          nodeId: this.nodeId,
          elapsedMs: this.now() - startMs,
        });
        return;
      }
      await this.sleep(pollMs);
    }
    this.logger.warn(JOINING_LOG_MSG.CDC_READINESS_GATE_DEGRADED, {
      nodeId: this.nodeId,
      timeoutMs,
      elapsedMs: this.now() - startMs,
    });
  }
  /**
   * Disable control-plane heartbeat reporting when a caller explicitly wants
   * direct CDC heartbeats to be the active publication path.
   * @return {void}
   * @private
   */
  disableSteadyStateControlPlaneReporter() {
    if (this.startupMode === STARTUP_JOIN_MODE.DURABLE_REJOIN) {
      return;
    }
    if (
      typeof this.heartbeatService?.setNodeStateReporter !== TYPEOF.FUNCTION
    ) {
      return;
    }
    this.heartbeatService.setNodeStateReporter(null);
  }
  resolveControlPlaneNodeStateUpdateTimeoutMs(options = {}) {
    const explicitTimeoutMs = Number(options.timeoutMs);
    if (Number.isFinite(explicitTimeoutMs) && explicitTimeoutMs > NUM.ZERO) {
      return Math.floor(explicitTimeoutMs);
    }
    const leadershipWaitTimeoutMs = Number(
      this.config?.leadershipWaitTimeoutMs,
    );
    if (
      Number.isFinite(leadershipWaitTimeoutMs) &&
      leadershipWaitTimeoutMs > NUM.ZERO
    ) {
      return Math.floor(leadershipWaitTimeoutMs);
    }
    const httpTimeoutMs = Number(this.config?.httpTimeoutMs);
    if (Number.isFinite(httpTimeoutMs) && httpTimeoutMs > NUM.ZERO) {
      return Math.floor(httpTimeoutMs);
    }
    return null;
  }
  /**
   * Activate non-critical periodic control-plane writers once the joining
   * node reaches READY.
   * @return {void}
   * @private
   */
  activateControlPlaneBackgroundWriters() {
    return this.runtimeHandoffOwner.activateControlPlaneBackgroundWriters();
  }
  /**
   * Activate steady-state distributed transaction recovery after the node has
   * crossed the READY cutover. Join-time query engines intentionally defer
   * recovery replay until this point to avoid querying through an incomplete
   * self-hosted control-plane path during restart hydration.
   *
   * @return {void}
   * @private
   */
  activateDistributedTransactionRecovery() {
    return this.runtimeHandoffOwner.activateDistributedTransactionRecovery();
  }
  hasActiveControlPlaneBackgroundWriters() {
    return this.runtimeHandoffOwner.hasActiveControlPlaneBackgroundWriters();
  }
  buildControlPlaneHeartbeatStartOptions() {
    return {
      getStats: () => NodeService.getInstance().getNodeStats(),
      capabilities: this.getNodeCapabilities(),
    };
  }
  /**
   * Flush staged CREATE_SELF_HOSTED message-group metadata after the READY
   * cutover. This is intentionally non-blocking.
   *
   * @return {void}
   * @private
   */
  flushDeferredCreateSelfHostedMetadata() {
    return this.runtimeHandoffOwner.flushDeferredCreateSelfHostedMetadata();
  }
  /**
   * Execute a joining phase with logging and timing.
   * @param {string} phaseName - Phase name.
   * @param {Function} phaseFunction - Phase implementation function.
   * @return {Promise<void>}
   * @private
   */
  async executePhase(phaseName, phaseFunction) {
    const subPhase = JOINING_PHASE_TO_SUB_PHASE[phaseName];
    if (subPhase) {
      if (this.lifecycleStateMachine.getState() === NodeState.JOINING) {
        const currentSubPhase = this.lifecycleStateMachine.getSubPhase();
        if (currentSubPhase !== subPhase) {
          this.lifecycleStateMachine.transitionSubPhase(subPhase);
        }
      } else {
        this._completedJoinPhases.push(phaseName);
      }
    }
    this.phase = phaseName;
    this.phaseStartTime = this.now();
    const state = this.lifecycleStateMachine.getState();
    const activeSubPhase = this.lifecycleStateMachine.getSubPhase() || null;
    this.logger.info(JOINING_LOG_MSG.PHASE_STARTING, {
      nodeId: this.nodeId,
      state,
      phase: phaseName,
      subPhase: activeSubPhase,
    });
    this.emit(JoiningEvent.PHASE_START, {
      phase: phaseName,
      nodeId: this.nodeId,
      state,
      subPhase: activeSubPhase,
    });
    try {
      await this.workClassScheduler.enqueue(WORK_CLASS.A, async () => {
        await phaseFunction();
      });
      const phaseDuration = this.now() - this.phaseStartTime;
      this.logger.info(JOINING_LOG_MSG.PHASE_COMPLETED, {
        nodeId: this.nodeId,
        state,
        phase: phaseName,
        subPhase: activeSubPhase,
        duration: phaseDuration,
      });
      this.emit(JoiningEvent.PHASE_COMPLETE, {
        phase: phaseName,
        nodeId: this.nodeId,
        state,
        subPhase: activeSubPhase,
        duration: phaseDuration,
      });
    } catch (error) {
      const phaseDuration = this.now() - this.phaseStartTime;
      this.logger.error(JOINING_LOG_MSG.PHASE_FAILED, {
        nodeId: this.nodeId,
        state,
        phase: phaseName,
        subPhase: activeSubPhase,
        duration: phaseDuration,
        error: error.message,
        stack: error.stack,
        joinReadiness: error?.joinReadiness || null,
      });
      this.emit(JoiningEvent.PHASE_FAILED, {
        phase: phaseName,
        nodeId: this.nodeId,
        state,
        subPhase: activeSubPhase,
        duration: phaseDuration,
        error: error.message,
      });
      throw error;
    }
  }
  /**
   * Phase 1: Contact seed node via HTTP.
   * @return {Promise<void>}
   * @private
   */
  async phaseContactSeed() {
    return this.contactSeedPhase.phaseContactSeed();
  }
  /**
   * Resolve bounded retry policy for join-time HTTP operations.
   * @return {Object}
   * @private
   */
  resolveJoinRetryPolicy() {
    return this.contactSeedPhase.resolveJoinRetryPolicy();
  }
  /**
   * Classify one seed contact failure for retry/backoff behavior.
   * @param {Error} error
   * @param {string} retryableTimeoutErrorMessage
   * @return {Object}
   * @private
   */
  classifySeedContactFailure(error, retryableTimeoutErrorMessage) {
    return this.contactSeedPhase.classifySeedContactFailure(
      error,
      retryableTimeoutErrorMessage,
    );
  }
  /**
   * Compute retry delay using bootstrap hints + bounded jitter.
   * @param {Object} options
   * @param {number} options.baseDelayMs
   * @param {number} options.maxDelayMs
   * @param {number|null} options.retryAfterMs
   * @return {number}
   * @private
   */
  computeSeedContactRetryDelayMs(options = {}) {
    return this.contactSeedPhase.computeSeedContactRetryDelayMs(options);
  }
  /**
   * Apply bounded symmetric jitter to one retry delay.
   * @param {number} delayMs
   * @param {number} maxDelayMs
   * @return {number}
   * @private
   */
  applySeedContactRetryJitter(delayMs, maxDelayMs) {
    return this.contactSeedPhase.applySeedContactRetryJitter(
      delayMs,
      maxDelayMs,
    );
  }
  /**
   * Resolve retry hint (ms) from parsed body and transport metadata.
   * @param {Error} error
   * @param {Object|null} parsedError
   * @return {number|null}
   * @private
   */
  resolveSeedContactRetryAfterMs(error, parsedError) {
    return _resolveSeedContactRetryAfterMs(error, parsedError);
  }
  /**
   * Parse bootstrap HTTP error bodies from the default HTTP client.
   * @param {Error} error
   * @return {Object|null}
   * @private
   */
  parseBootstrapError(error) {
    return _parseBootstrapError(error);
  }
  /**
   * Build a consistent error message for bootstrap failures.
   * @param {Object} response
   * @return {string}
   * @private
   */
  buildBootstrapFailureError(response) {
    return this.contactSeedPhase.buildBootstrapFailureError(response);
  }
  /**
   * Format leader metadata details for error reporting.
   * @param {Object} details
   * @return {string}
   * @private
   */
  formatLeaderMetadataDetails(details) {
    return _formatLeaderMetadataDetails(details);
  }
  /**
   * Build a canonical descriptor for join-managed unified lifecycle replicas.
   * @param {string} serviceType
   * @param {string} serviceId
   * @return {Object}
   * @private
   */
  createJoinServiceDescriptor(serviceType, serviceId) {
    return {
      [SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]: serviceId,
      [SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE]: serviceType,
      [SERVICE_DESCRIPTOR_FIELD.TENANT_ID]: this.nodeId,
      [SERVICE_DESCRIPTOR_FIELD.REPLICA_ID]: serviceId,
      [SERVICE_DESCRIPTOR_FIELD.REPLICA_COUNT]: NUM.ONE,
      [SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND]:
        JOINING_UNIFIED_RECONCILE.RUNTIME_KIND,
      [SERVICE_DESCRIPTOR_FIELD.RUNTIME_REF]: null,
      [SERVICE_DESCRIPTOR_FIELD.RUNTIME_CONFIG]: null,
    };
  }
  /**
   * Queue one join replica for desired-state reconciliation.
   * @param {Object} descriptor
   * @param {Object} options
   * @return {void}
   * @private
   */
  queueJoinServiceReplica(descriptor, options) {
    const serviceId = descriptor[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID];
    this.joinDesiredServiceDefinitions.set(serviceId, descriptor);
    this.joinReplicaOptionsByServiceId.set(serviceId, options);
  }
  /**
   * Resolve join replica options for one serviceId.
   * @param {string} serviceId
   * @param {string} serviceType
   * @return {Object}
   * @private
   */
  resolveJoinReplicaOptions(serviceId, serviceType) {
    const options = this.joinReplicaOptionsByServiceId.get(serviceId) || null;
    assertCritical(options, `Missing join replica options for ${serviceId}`);
    assertCritical(
      options.serviceType === serviceType,
      `Join replica type mismatch for ${serviceId}: expected ${serviceType}`,
    );
    return options;
  }
  /**
   * Build local actual-state rows for join reconciliation.
   * @return {Object[]}
   * @private
   */
  buildJoinActualStateRows() {
    if (!this.serviceLifecycleManager) {
      return [];
    }
    const rows = [];
    for (const replicaId of this.messageGroupServices.keys()) {
      const handle = this.createJoinServiceDescriptor(
        UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
        replicaId,
      );
      rows.push({
        ...handle,
        [SERVICE_DESCRIPTOR_FIELD.LIFECYCLE_STATE]:
          this.serviceLifecycleManager.getReplicaState(handle),
      });
    }
    for (const replicaId of this.partitionServices.keys()) {
      const handle = this.createJoinServiceDescriptor(
        UNIFIED_SERVICE_TYPE.PARTITION,
        replicaId,
      );
      rows.push({
        ...handle,
        [SERVICE_DESCRIPTOR_FIELD.LIFECYCLE_STATE]:
          this.serviceLifecycleManager.getReplicaState(handle),
      });
    }
    return rows;
  }
  /**
   * Initialize unified lifecycle owners for join-time service startup.
   * @return {Promise<void>}
   * @private
   */
  async initializeJoiningLifecycleOwners() {
    await this.startupServiceLifecycleOwner.ensureOwners();
  }
  /**
   * Trigger one join reconciliation cycle.
   * @param {string} reason
   * @return {Promise<void>}
   * @private
   */
  async triggerJoinReconciler(reason) {
    await this.startupServiceLifecycleOwner.triggerReconciler(reason);
  }
  /**
   * Stop unified lifecycle owners and clear join desired-state catalogs.
   * @return {void}
   * @private
   */
  stopJoiningLifecycleOwners() {
    this.startupServiceLifecycleOwner.stopOwners();
  }
  /**
   * Unified lifecycle create hook for join message-group replicas.
   * @param {Object} context
   * @return {Promise<Object>}
   * @private
   */
  async createJoinMessageGroupReplica(context) {
    return this.createMessageGroupPhase.createJoinMessageGroupReplica(context);
  }
  /**
   * Unified lifecycle create hook for join partition replicas.
   * @param {Object} context
   * @return {Promise<Object>}
   * @private
   */
}

export { NodeJoiningServiceSegment2 };
