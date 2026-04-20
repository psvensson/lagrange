import { NODE_JOINING_SERVICE_SHARED } from "./node-joining-service-shared.js";
import { NodeJoiningServiceSegment3 } from "./node-joining-service-segment-3.js";

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

class NodeJoiningServiceSegment4 extends NodeJoiningServiceSegment3 {
  async sendControlPlaneNodeStateUpdate(options = {}) {
    const state = options.state;
    if (!state) {
      return;
    }

    this.triggerBackgroundClusterMeshReconciliation(state);

    const publicationMode = resolveControlPlaneNodeStatePublicationMode({
      publicationMode: options.nodeStatePublicationMode,
      heartbeatOnly: options.heartbeatOnly === true,
      state,
    });
    const publicationProfile = getControlPlaneNodeStatePublicationProfile({
      publicationMode,
    });
    const message = {
      [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
      [ControlPlaneField.NODE_ID]: this.nodeId,
      [ControlPlaneField.NODE_ADDRESS]: this.nodeAddress,
      [ControlPlaneField.CAPABILITIES]:
        options.capabilities ?? this.getNodeCapabilities(),
      [ControlPlaneField.STATE]: state,
      [ControlPlaneField.NODE_STATE_PUBLICATION_MODE]: publicationMode,
    };

    if (options.heartbeatOnly === true) {
      message[ControlPlaneField.HEARTBEAT_ONLY] = true;
    }
    if (Number.isFinite(options.heartbeatAt)) {
      message[ControlPlaneField.HEARTBEAT_AT] = options.heartbeatAt;
    }
    if (Number.isFinite(options.readyLeaseExpiresAt)) {
      message[ControlPlaneField.READY_LEASE_EXPIRES_AT] =
        options.readyLeaseExpiresAt;
    }
    if (
      options.nodeRow &&
      typeof options.nodeRow === NODE_JOINING_SERVICE_LITERAL.OBJECT
    ) {
      message[ControlPlaneField.NODE_ROW] = options.nodeRow;
    }

    const deferredOutcome =
      this.resolveDeferredNodeStateUpdatePublicationOutcome(
        message,
        publicationMode,
        publicationProfile,
      );
    if (deferredOutcome) {
      return deferredOutcome;
    }

    let targetCandidates = this.resolveNodeStateUpdateTargetCandidates({
      state,
      heartbeatAt: options.heartbeatAt,
    });
    if (!Array.isArray(targetCandidates)) {
      targetCandidates = [];
    }
    if (
      targetCandidates.length === NUM.ZERO &&
      typeof this.resolveControlPlaneTargetAddressCandidates === TYPEOF.FUNCTION
    ) {
      const legacyTargetCandidates =
        this.resolveControlPlaneTargetAddressCandidates({
          allowBootstrapHints: true,
          allowSelfTarget: false,
        });
      if (Array.isArray(legacyTargetCandidates)) {
        targetCandidates = legacyTargetCandidates.filter(
          (candidate, index, list) => {
            return list.indexOf(candidate) === index;
          },
        );
      }
    }
    if (targetCandidates.length === NUM.ZERO) {
      const publicationDiagnostics = Object.freeze({
        publicationPath: NODE_STATE_UPDATE_PUBLICATION_PATH,
        nodeStatePublicationMode: publicationMode,
      });
      const failureAction = buildNodeStateUpdatePublicationFailureAction({
        contractState: OWNER_CONTRACT_STATE.FAILED,
        nextAction: OWNER_CONTRACT_NEXT_ACTION.STOP,
      });
      this.logger.warn(JOINING_LOG_MSG.READY_SIGNAL_TARGET_MISSING, {
        nodeId: this.nodeId,
        state,
        publicationMode,
      });
      throw buildNodeStateUpdatePublicationFailureError(
        new Error(JOINING_ERROR_MSG.CONTROL_PLANE_TARGET_MISSING),
        publicationDiagnostics,
        failureAction,
      );
    }

    const deliveryTimeoutBudgetMs =
      this.resolveControlPlaneNodeStateUpdateTimeoutMs(options);
    const deliveryDeadlineMs = Number.isFinite(deliveryTimeoutBudgetMs)
      ? this.now() + deliveryTimeoutBudgetMs
      : null;
    let lastError = null;
    let sameTargetRetryCount = NUM.ZERO;

    for (let attempt = NUM.ZERO; attempt < targetCandidates.length; attempt++) {
      const targetAddress = targetCandidates[attempt];
      if (
        this.controlPlaneTargetAddress &&
        this.controlPlaneTargetAddress !== targetAddress
      ) {
        this.logger.info(JOINING_LOG_MSG.CONTROL_PLANE_TARGET_UPDATED, {
          nodeId: this.nodeId,
          previousTargetAddress: this.controlPlaneTargetAddress,
          targetAddress,
          state,
          publicationMode,
        });
      }
      this.controlPlaneTargetAddress = targetAddress;

      const publicationDiagnostics = buildNodeStateUpdatePublicationDiagnostics(
        targetAddress,
        publicationMode,
      );

      try {
        const remainingAttempts = targetCandidates.length - attempt;
        const deliveryTimeoutMs = Number.isFinite(deliveryDeadlineMs)
          ? Math.max(
              NUM.ONE,
              Math.floor(
                Math.max(NUM.ZERO, deliveryDeadlineMs - this.now()) /
                  Math.max(NUM.ONE, remainingAttempts),
              ),
            )
          : deliveryTimeoutBudgetMs;
        const deliveryResult = await this.messageRouter.deliver(
          targetAddress,
          message,
          {
            deliveryPriority: publicationProfile.deliveryPriority,
            timeoutMs: deliveryTimeoutMs,
          },
        );
        if (
          !isDeliveredTransportDeliveryOutcome(deliveryResult) ||
          deliveryResult?.noHandler === true
        ) {
          throw buildNodeStateUpdateDeliveryError(
            deliveryResult,
            targetAddress,
          );
        }

        this.clearDeferredNodeStateUpdatePublication();
        this.logger.info(JOINING_LOG_MSG.NODE_STATE_UPDATE_SENT, {
          nodeId: this.nodeId,
          targetAddress,
          state,
          publicationMode,
        });
        if (
          typeof this.controlPlaneKernelIngress?.noteSuccessfulTarget ===
          TYPEOF.FUNCTION
        ) {
          this.controlPlaneKernelIngress.noteSuccessfulTarget(targetAddress);
        }
        return buildNodeStateUpdatePublicationOutcome({
          publicationMode,
          publicationDiagnostics,
        });
      } catch (error) {
        error.publicationDiagnostics = publicationDiagnostics;
        lastError = error;
        const retryAfterMs = getControlPlaneRetryAfterMs(error);
        const retryableTargetFailure =
          this.shouldRetryControlPlaneNodeStateUpdate(error, publicationMode);
        const isFinalAttempt = attempt >= targetCandidates.length - NUM.ONE;
        const shouldRetryAlternateTarget =
          !isFinalAttempt && retryableTargetFailure;
        const shouldRetrySameTarget =
          isFinalAttempt &&
          sameTargetRetryCount < NUM.ONE &&
          retryableTargetFailure &&
          (options.heartbeatOnly !== true ||
            isHeartbeatEscalatedControlPlaneNodeStatePublicationMode(
              publicationMode,
            ));
        const failureAction = this.shouldDeferNodeStateUpdatePublication(
          error,
          publicationProfile,
        )
          ? buildNodeStateUpdatePublicationFailureAction({
              contractState: OWNER_CONTRACT_STATE.DEFERRED,
              nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
              retryTarget:
                NODE_STATE_UPDATE_PUBLICATION_RETRY_TARGET.DEFERRED_SLOT,
              retryAfterMs,
            })
          : shouldRetrySameTarget
            ? buildNodeStateUpdatePublicationFailureAction({
                contractState: OWNER_CONTRACT_STATE.PENDING,
                nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
                retryTarget:
                  NODE_STATE_UPDATE_PUBLICATION_RETRY_TARGET.SAME_TARGET,
                retryAfterMs,
              })
            : shouldRetryAlternateTarget
              ? buildNodeStateUpdatePublicationFailureAction({
                  contractState: OWNER_CONTRACT_STATE.PENDING,
                  nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
                  retryTarget:
                    NODE_STATE_UPDATE_PUBLICATION_RETRY_TARGET.ALTERNATE_TARGET,
                  retryAfterMs,
                })
              : buildNodeStateUpdatePublicationFailureAction({
                  contractState: OWNER_CONTRACT_STATE.FAILED,
                  nextAction: OWNER_CONTRACT_NEXT_ACTION.STOP,
                  retryAfterMs,
                });

        if (
          failureAction.retryTarget ===
          NODE_STATE_UPDATE_PUBLICATION_RETRY_TARGET.DEFERRED_SLOT
        ) {
          if (
            typeof this.controlPlaneKernelIngress?.invalidateTarget ===
            TYPEOF.FUNCTION
          ) {
            this.controlPlaneKernelIngress.invalidateTarget(targetAddress);
          }
          this.controlPlaneTargetAddress = null;
          return this.deferNodeStateUpdatePublication({
            error,
            message,
            publicationMode,
            publicationDiagnostics,
            state,
          });
        }

        if (
          failureAction.retryTarget ===
          NODE_STATE_UPDATE_PUBLICATION_RETRY_TARGET.SAME_TARGET
        ) {
          sameTargetRetryCount += NUM.ONE;
          if (failureAction.retryAfterMs > NUM.ZERO) {
            await this.sleep(failureAction.retryAfterMs);
          }
          if (
            typeof this.controlPlaneKernelIngress?.invalidateTarget ===
            TYPEOF.FUNCTION
          ) {
            this.controlPlaneKernelIngress.invalidateTarget(targetAddress);
          }
          this.logger.warn(JOINING_LOG_MSG.NODE_STATE_UPDATE_RETRYING, {
            nodeId: this.nodeId,
            targetAddress,
            nextTargetAddress: targetAddress,
            state,
            publicationMode,
            attempt: attempt + NUM.ONE,
            maxAttempts: targetCandidates.length + sameTargetRetryCount,
            retryAfterMs: failureAction.retryAfterMs,
            error: error.message,
          });
          this.controlPlaneTargetAddress = null;
          targetCandidates.push(targetAddress);
          continue;
        }

        if (
          failureAction.retryTarget ===
          NODE_STATE_UPDATE_PUBLICATION_RETRY_TARGET.ALTERNATE_TARGET
        ) {
          if (
            typeof this.controlPlaneKernelIngress?.invalidateTarget ===
            TYPEOF.FUNCTION
          ) {
            this.controlPlaneKernelIngress.invalidateTarget(targetAddress);
          }
          this.logger.warn(JOINING_LOG_MSG.NODE_STATE_UPDATE_RETRYING, {
            nodeId: this.nodeId,
            targetAddress,
            nextTargetAddress: targetCandidates[attempt + NUM.ONE],
            state,
            publicationMode,
            attempt: attempt + NUM.ONE,
            maxAttempts: targetCandidates.length,
            error: error.message,
          });
          this.controlPlaneTargetAddress = null;
          continue;
        }

        this.logger.error(JOINING_LOG_MSG.NODE_STATE_UPDATE_FAILED, {
          nodeId: this.nodeId,
          targetAddress,
          state,
          publicationMode,
          error: error.message,
        });
        throw buildNodeStateUpdatePublicationFailureError(
          error,
          publicationDiagnostics,
          failureAction,
        );
      }
    }

    throw lastError;
  }
  /**
   * Reconcile peer mesh connectivity without blocking node-state publication.
   * Control-plane publication is a liveness signal and should not wait on
   * best-effort background connection maintenance.
   * @param {string} state - Node connection state being reported.
   * @return {void}
   * @private
   */
  triggerBackgroundClusterMeshReconciliation(state) {
    const normalizedState = String(state || "").toLowerCase();
    if (
      !this.messageRouter ||
      normalizedState === STATE.DISCONNECTED ||
      normalizedState === NODE_JOINING_SERVICE_LITERAL.FAILED ||
      normalizedState === NODE_JOINING_SERVICE_LITERAL.SHUTTING_DOWN ||
      normalizedState === NODE_JOINING_SERVICE_LITERAL.STOPPED ||
      !this.joinReadinessEvaluator.shouldReconnectClusterMesh()
    ) {
      return;
    }
    if (this.pendingClusterMeshReconciliation) {
      return;
    }
    const reconciliation = Promise.resolve()
      .then(() => this.connectToClusterNodes())
      .catch((error) => {
        this.logger.warn(
          "Failed to reconcile cluster mesh during node-state publication",
          { nodeId: this.nodeId, state, error: error.message },
        );
      })
      .finally(() => {
        if (this.pendingClusterMeshReconciliation === reconciliation) {
          this.pendingClusterMeshReconciliation = null;
        }
      });
    this.pendingClusterMeshReconciliation = reconciliation;
  }
  /**
   * Phase 2: Connect to seed node via WebSocket for cross-node communication.
   * Requirements: 8.1, 8.2, 8.3, 8.4 - Bootstrap sequence: server → self-connect → services.
   * @return {Promise<void>}
   * @private
   */
  async phaseConnectWebSocket() {
    return this.connectWebSocketPhase.phaseConnectWebSocket();
  }
  /**
   * Connect to all cluster nodes for full mesh connectivity.
   * Skips nodes we're already connected to (checked via messageRouter).
   * All nodes are equal peers - no special treatment for any node.
   * @return {Promise<void>}
   * @private
   */
  async connectToClusterNodes(options = {}) {
    return this.connectWebSocketPhase.connectToClusterNodes(options);
  }
  /**
   * Derive WebSocket address from node REST address.
   * @param {string} nodeAddress - Node address in format "hostname:port".
   * @return {string|null} WebSocket address or null if cannot derive.
   * @private
   */
  deriveWsAddressFromNodeAddress(nodeAddress) {
    return _deriveWsAddressFromNodeAddress(nodeAddress);
  }
  /**
   * Hydrate system cache from bootstrap response snapshots.
   * Delegates to QuerySystemStatePhase.
   * @return {Promise<void>}
   * @private
   */
  async hydrateSystemCacheFromBootstrap() {
    return this.querySystemStatePhase.hydrateSystemCacheFromBootstrap();
  }
  /**
   * Resolve the cache operation for a bootstrap snapshot record.
   * Delegates to QuerySystemStatePhase.
   * @param {Object} systemTableCache - System table cache.
   * @param {string} tableName - System table name.
   * @param {Object} record - Snapshot row.
   * @return {string|null} CDC operation or null when row should be skipped.
   * @private
   */
  getSnapshotHydrationOperation(systemTableCache, tableName, record) {
    return this.querySystemStatePhase.getSnapshotHydrationOperation(
      systemTableCache,
      tableName,
      record,
    );
  }
  /**
   * Phase 5: Query system partitions for cluster state and register this node.
   * Delegates to QuerySystemStatePhase.
   * @return {Promise<void>}
   * @private
   */
  async phaseQuerySystemState() {
    return this.querySystemStatePhase.phaseQuerySystemState();
  }
  /**
   * Register this node in the cluster's nodes table.
   * Delegates to QuerySystemStatePhase.
   * @return {Promise<void>}
   * @private
   */
  async registerNodeInCluster() {
    return this.querySystemStatePhase.registerNodeInCluster();
  }
  /**
   * Register the WebSocket endpoint for this node.
   * Delegates to QuerySystemStatePhase.
   * @param {number} now - Current timestamp.
   * @return {Promise<Object>}
   * @private
   */
  async registerNodeEndpoint(now) {
    return this.querySystemStatePhase.registerNodeEndpoint(now);
  }
  /**
   * Register built-in meta service endpoints for this joining node.
   * Delegates to QuerySystemStatePhase.
   * @return {Promise<Array<Object>>}
   * @private
   */
  async registerMetaServiceEndpoints() {
    return this.querySystemStatePhase.registerMetaServiceEndpoints();
  }
  /**
   * Upsert a system-table row through CDC integration service.
   * Delegates to QuerySystemStatePhase.
   * @param {string} tableName - System table name.
   * @param {Object} rowData - Row payload.
   * @return {Promise<Object>} Upsert result.
   * @private
   */
  async upsertSystemTableRow(tableName, rowData) {
    return this.querySystemStatePhase.upsertSystemTableRow(tableName, rowData);
  }
  /**
   * Upsert a system-table row through the shared retryable join-time
   * control-plane publication path.
   * Delegates to QuerySystemStatePhase.
   * @param {string} tableName
   * @param {Object} rowData
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   * @private
   */
  async upsertSystemTableRowWithRetry(tableName, rowData, options = {}) {
    return this.querySystemStatePhase.upsertSystemTableRowWithRetry(
      tableName,
      rowData,
      options,
    );
  }
  /**
   * Determine whether join-time upserts can require local cache visibility.
   * Delegates to QuerySystemStatePhase.
   * @return {Object|undefined}
   * @private
   */
  getJoinTimeUpsertOptions() {
    return this.querySystemStatePhase.getJoinTimeUpsertOptions();
  }
  /**
   * Seed successful join-time control-plane writes into the local cache.
   * Delegates to QuerySystemStatePhase.
   * @param {string} tableName
   * @param {Object|null} rowData
   * @return {void}
   * @private
   */
  seedJoinTimeCacheRow(tableName, rowData) {
    return this.querySystemStatePhase.seedJoinTimeCacheRow(tableName, rowData);
  }
  /**
   * Subscribe to CDC events for default cache-sync tables.
   * This keeps the system cache updated as cluster state changes.
   * The subscription is wrapped in a bounded retry loop with
   * structured diagnostics. The total time is bounded by
   * CDC_REESTABLISHMENT.TIMEOUT_MS.
   * Requirements: 4.1, 4.2, 4.3, 5.1, 5.2, 5.4
   * @return {Promise<void>}
   * @private
   */
  async subscribeToCDCEvents() {
    if (!this.cdcIntegrationService) {
      const error = new Error(
        JOINING_ERROR_MSG.controlPlaneCdcSubscribeFailed(
          "default cache-sync tables",
          "CDC integration service not available",
        ),
      );
      this.logger.error(JOINING_LOG_MSG.CDC_SUBSCRIPTION_FAILED, {
        nodeId: this.nodeId,
        error: error.message,
      });
      throw error;
    }
    const systemTables = CACHE_HYDRATION_TABLES;
    this.logger.info(JOINING_LOG_MSG.CDC_INTEGRATION_CREATE, {
      nodeId: this.nodeId,
      tables: systemTables,
    });
    const startMs = this.now();
    const timeoutMs = CDC_REESTABLISHMENT.TIMEOUT_MS;
    const maxRetries = CDC_REESTABLISHMENT.MAX_RETRIES;
    const retryDelayMs = CDC_REESTABLISHMENT.RETRY_DELAY_MS; // Subscribe to all CDC events (insert, update, delete, upsert)
    // The CDCIntegrationService emits these events when system
    // tables change. The system cache is automatically updated by
    // the cache hydration service.
    const cdcEventHandler = (event) => {
      this.logger.debug(JOINING_LOG_MSG.CDC_EVENT_RECEIVED, {
        nodeId: this.nodeId,
        tableName: event.tableName,
        operation: event.operation || STRING.UNKNOWN,
      });
      this.handleMeshConnectivityCDCEvent(event);
    };
    const eventTypes = [
      CDC_EVENT.INSERT,
      CDC_EVENT.UPDATE,
      CDC_EVENT.DELETE,
      CDC_EVENT.UPSERT,
    ]; // Periodic diagnostic emission during CDC recovery
    // (Requirement 8.2). Cleared in finally block so it
    // is always cleaned up on success, failure, or timeout.
    const diagnosticIntervalMs = CDC_REESTABLISHMENT.DIAGNOSTIC_INTERVAL_MS;
    const diagnosticInterval = setInterval(() => {
      const leaderService = this.getLeaderMessageGroupService();
      const messageGroupLeader = leaderService
        ? {
            nodeId: leaderService.nodeId || null,
            groupId: leaderService.groupId || null,
            isLeader:
              typeof leaderService.isLeaderReplica === TYPEOF.FUNCTION
                ? leaderService.isLeaderReplica()
                : null,
          }
        : null;
      this.logger.info(JOINING_LOG_MSG.CDC_RECOVERY_DIAGNOSTICS, {
        nodeId: this.nodeId,
        subscriptionStatus: this.getCdcSubscriptionStatus(),
        messageGroupLeader,
        elapsedMs: this.now() - startMs,
      });
    }, diagnosticIntervalMs); // Bounded retry loop for CDC subscription establishment
    let subscribed = false;
    try {
      for (let attempt = NUM.ZERO; attempt <= maxRetries; attempt++) {
        const elapsedMs = this.now() - startMs;
        const remainingBudgetMs = timeoutMs - elapsedMs; // Respect overall timeout budget (§1.9)
        if (remainingBudgetMs <= NUM.ZERO) {
          this.logger.warn(JOINING_LOG_MSG.CDC_REESTABLISHMENT_TIMEOUT, {
            nodeId: this.nodeId,
            tables: systemTables,
            attempt,
            maxRetries,
            elapsedMs,
          });
          break;
        }
        try {
          for (const eventType of eventTypes) {
            this.cdcIntegrationService.on(eventType, cdcEventHandler);
          } // Verify listeners were registered
          const subscriptionStatus = {};
          for (const eventType of eventTypes) {
            const listenerCount =
              this.cdcIntegrationService.listenerCount(eventType);
            subscriptionStatus[eventType] = listenerCount;
            if (listenerCount === NUM.ZERO) {
              throw new Error(
                JOINING_ERROR_MSG.controlPlaneCdcSubscribeFailed(
                  systemTables.join(NODE_JOINING_SERVICE_LITERAL.VALUE),
                  `no listeners for ${eventType}`,
                ),
              );
            }
          }
          subscribed = true;
          this.logger.info(JOINING_LOG_MSG.CDC_REESTABLISHMENT_COMPLETE, {
            nodeId: this.nodeId,
            tableCount: systemTables.length,
            elapsedMs: this.now() - startMs,
            subscriptionStatus,
          });
          break;
        } catch (error) {
          // Remove partially registered listeners before
          // retry
          for (const eventType of eventTypes) {
            this.cdcIntegrationService.removeListener(
              eventType,
              cdcEventHandler,
            );
          }
          const currentElapsedMs = this.now() - startMs;
          const currentRemainingMs = timeoutMs - currentElapsedMs;
          this.logger.warn(JOINING_LOG_MSG.CDC_SUBSCRIPTION_RETRY, {
            nodeId: this.nodeId,
            tables: systemTables,
            error: error.message,
            attempt: attempt + NUM.ONE,
            maxRetries,
            remainingBudgetMs: currentRemainingMs,
          });
          if (attempt < maxRetries && currentRemainingMs > NUM.ZERO) {
            const waitMs = Math.min(retryDelayMs, currentRemainingMs);
            await this.sleep(waitMs);
          }
        }
      }
    } finally {
      clearInterval(diagnosticInterval);
    } // Build final subscription status for logging
    const finalStatus = {};
    for (const eventType of eventTypes) {
      finalStatus[eventType] =
        this.cdcIntegrationService.listenerCount(eventType);
    }
    if (!subscribed) {
      // All retries exhausted or timeout expired
      this.logger.warn(JOINING_LOG_MSG.CDC_SUBSCRIPTION_RETRY_EXHAUSTED, {
        nodeId: this.nodeId,
        tables: systemTables,
        elapsedMs: this.now() - startMs,
        maxRetries,
        subscriptionStatus: finalStatus,
      });
    }
    this.logger.info(JOINING_LOG_MSG.CDC_SUBSCRIPTION_REGISTERED, {
      nodeId: this.nodeId,
      eventTypes,
      tableCount: systemTables.length,
      subscriptionStatus: finalStatus,
    }); // Mark CDC subscriptions as active even if retries were
    // exhausted — partial progress is better than blocking
    // indefinitely. Task 6.4 gates readiness on full status.
    this.cdcSubscriptionsActive = true;
  }
  /**
   * Determine whether one CDC event affects peer mesh-connectivity authority.
   * Mesh connectivity should react to canonical peer membership and endpoint
   * publication, not only to local join-state publication.
   * @param {Object|null} event
   * @return {boolean}
   * @private
   */
  isMeshConnectivityCDCEvent(event) {
    const tableName = String(event?.tableName || "");
    if (tableName !== TABLES.NODES && tableName !== TABLES.NODE_ENDPOINTS) {
      return false;
    }
    const operation = String(event?.operation || "").toLowerCase();
    return (
      operation === CDC_EVENT.INSERT ||
      operation === CDC_EVENT.UPDATE ||
      operation === CDC_EVENT.UPSERT ||
      operation === CDC_EVENT.DELETE
    );
  }
  /**
   * Trigger best-effort peer mesh reconciliation when authoritative peer
   * visibility changes in CDC. This keeps peer dialing bound to the same
   * owner-path regardless of whether connectivity changes originate from join,
   * restart, or concurrent peer publication.
   * @param {Object|null} event
   * @return {void}
   * @private
   */
  handleMeshConnectivityCDCEvent(event) {
    if (
      !this.isMeshConnectivityCDCEvent(event) ||
      !this.joinReadinessEvaluator.shouldReconnectClusterMesh()
    ) {
      return;
    }
    const normalizedOperation = String(
      event?.operation || STRING.UNKNOWN,
    ).toLowerCase();
    this.triggerBackgroundClusterMeshReconciliation(
      `cdc:${event.tableName}:${normalizedOperation}`,
    );
  }
  /**
   * Return per-table CDC subscription status.
   *
   * Reads from existing subscription state on
   * `this.cdcIntegrationService` (EventEmitter listener counts)
   * and `this.cdcSubscriptionsActive`. Does not create new state.
   *
   * @return {object} Diagnostic snapshot with:
   *   - `active` {boolean} whether subscriptions are active
   *   - `tables` {Array<object>} per-table status entries
   *   - `eventTypes` {object} per-event-type listener counts
   */
  getCdcSubscriptionStatus() {
    const tables = CACHE_HYDRATION_TABLES;
    const active = this.cdcSubscriptionsActive === true;
    const eventTypes = [
      CDC_EVENT.INSERT,
      CDC_EVENT.UPDATE,
      CDC_EVENT.DELETE,
      CDC_EVENT.UPSERT,
    ]; // Per-event-type listener counts from the integration
    // service (single source of truth — §1.4).
    const eventListenerCounts = {};
    for (const eventType of eventTypes) {
      eventListenerCounts[eventType] = this.cdcIntegrationService
        ? this.cdcIntegrationService.listenerCount(eventType)
        : NUM.ZERO;
    } // Derive overall subscription health: at least one
    // listener on every event type means subscribed.
    const hasAllListeners = eventTypes.every(
      (et) => eventListenerCounts[et] > NUM.ZERO,
    ); // Build per-table status. All tables share the same
    // event-level listeners so the status is uniform, but
    // the per-table shape is required by the diagnostic
    // contract (Requirement 8.1).
    const tableStatuses = tables.map((tableName) => {
      let status;
      if (active && hasAllListeners) {
        status = CDC_SUBSCRIPTION_STATUS.SUBSCRIBED;
      } else if (!active && !hasAllListeners) {
        status = CDC_SUBSCRIPTION_STATUS.FAILED;
      } else {
        status = CDC_SUBSCRIPTION_STATUS.PENDING;
      }
      return { tableName, status };
    });
    return { active, tables: tableStatuses, eventTypes: eventListenerCounts };
  }
  /**
   * Backfill propagated cache tables from authoritative routed reads.
   *
   * This closes the blind window between the initial bootstrap snapshot and
   * the moment CDC subscriptions become active, during which discovery rows
   * written by concurrently joining peers could otherwise be missed forever.
   *
   * @return {Promise<void>}
   * @private
   */
  async backfillPropagatedCacheTablesFromAuthoritativeState(
    tableNames = CACHE_HYDRATION_TABLES,
    options = {},
  ) {
    const propagatedTables =
      this.normalizeAuthoritativeBackfillTableNames(tableNames);
    const requestKey =
      this.buildAuthoritativeBackfillRequestKey(propagatedTables);
    const existingBackfill = this.inFlightBackfillsByKey.get(requestKey);
    if (existingBackfill) {
      return existingBackfill;
    }
    const backfillOptions = this.resolveAuthoritativeBackfillOptions(
      propagatedTables,
      options,
    );
    const sqlQueryEngine = assertCritical(
      this.cdcIntegrationService?.sqlQueryEngine,
      JOINING_ERROR_MSG.STATE_QUERY_ENGINE_REQUIRED,
    );
    const systemTableCache = assertCritical(
      NodeService.getInstance().getSystemTableCache(),
      JOINING_ERROR_MSG.STATE_QUERY_CACHE_REQUIRED,
    );
    const backfillPromise = (async () => {
      let totalRowsApplied = NUM.ZERO;
      const tableRowCounts = {};
      for (const tableName of propagatedTables) {
        const rows = await this.resolveAuthoritativeBackfillRows(
          sqlQueryEngine,
          tableName,
          backfillOptions,
        );
        tableRowCounts[tableName] = rows.length;
        for (const row of rows) {
          const operation = this.getSnapshotHydrationOperation(
            systemTableCache,
            tableName,
            row,
          );
          if (!operation) {
            continue;
          }
          systemTableCache.applySystemTableChange(tableName, operation, row);
          totalRowsApplied += NUM.ONE;
        }
      }
      this.logger.info(
        "Backfilled propagated cache tables from authoritative state",
        {
          nodeId: this.nodeId,
          tableCount: propagatedTables.length,
          totalRowsApplied,
          tableRowCounts,
          deliveryPriority: backfillOptions.deliveryPriority,
          pressureDegraded: backfillOptions.pressureDegraded,
          pressureAction: backfillOptions.pressureAction,
          pressureReason: backfillOptions.pressureReason,
          allowReplicaFanout: backfillOptions.allowReplicaFanout,
        },
      );
    })().finally(() => {
      if (this.inFlightBackfillsByKey.get(requestKey) === backfillPromise) {
        this.inFlightBackfillsByKey.delete(requestKey);
      }
    });
    this.inFlightBackfillsByKey.set(requestKey, backfillPromise);
    return backfillPromise;
  }
  /**
   * Normalize the authoritative backfill table list.
   * @param {Array<string>|undefined|null} tableNames
   * @return {Array<string>}
   * @private
   */
  normalizeAuthoritativeBackfillTableNames(tableNames) {
    return Array.isArray(tableNames) && tableNames.length > NUM.ZERO
      ? [...new Set(tableNames)]
      : [...CACHE_HYDRATION_TABLES];
  }
  /**
   * Build a canonical in-flight key for one authoritative backfill request.
   * @param {Array<string>} tableNames
   * @return {string}
   * @private
   */
  buildAuthoritativeBackfillRequestKey(tableNames) {
    return [...tableNames].sort().join(NODE_JOINING_SERVICE_LITERAL.VALUE_2);
  }
  /**
   * Resolve one shared-pressure decision for authoritative join backfill.
   * @param {Array<string>} tableNames
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  evaluateAuthoritativeBackfillPressure(tableNames, options = {}) {
    const blockingTableSet = new Set(JOIN_READINESS_REPAIR.TABLES);
    const blocking =
      typeof options.blocking === TYPEOF.BOOLEAN
        ? options.blocking
        : tableNames.some((tableName) => blockingTableSet.has(tableName));
    const workloadProfile = buildControlPlaneWorkloadProfile(
      blocking
        ? CONTROL_PLANE_WORKLOAD_CLASS.READINESS_CRITICAL_READ
        : CONTROL_PLANE_WORKLOAD_CLASS.JOIN_REPAIR,
      {
        additionalResourceKeys: [
          NODE_JOINING_SERVICE_LITERAL.JOIN_BACKFILL,
          NODE_JOINING_SERVICE_LITERAL.CONTROL_PLANE_READ,
          ...tableNames.map((tableName) => `control-plane:table:${tableName}`),
        ],
      },
    );
    return PressureGovernor.getShared({
      nodeId: this.nodeId,
      messageRouter: this.messageRouter,
    }).evaluate({
      workClass: workloadProfile.workClass || PRESSURE_WORK_CLASS.BACKGROUND,
      resourceKeys: workloadProfile.resourceKeys,
      allowDegrade: workloadProfile.allowPressureDegrade,
      allowDefer: workloadProfile.allowPressureDefer,
      retryAfterMs: options?.pressureRetryAfterMs,
    });
  }
  /**
   * Resolve owner options for one authoritative backfill pass.
   * @param {Array<string>} tableNames
   * @param {Object} options
   * @return {Object}
   * @private
   */
  resolveAuthoritativeBackfillOptions(tableNames, options = {}) {
    const blockingTableSet = new Set(JOIN_READINESS_REPAIR.TABLES);
    const blocking =
      typeof options.blocking === TYPEOF.BOOLEAN
        ? options.blocking
        : tableNames.some((tableName) => blockingTableSet.has(tableName));
    const pressureDecision = this.evaluateAuthoritativeBackfillPressure(
      tableNames,
      options,
    );
    const pressureDegraded =
      options.pressureDegraded === true ||
      pressureDecision?.action !== PRESSURE_GOVERNOR_ACTION.ALLOW;
    return {
      blocking,
      deliveryPriority:
        typeof options.deliveryPriority === TYPEOF.STRING &&
        options.deliveryPriority.length > NUM.ZERO
          ? options.deliveryPriority
          : blocking
            ? NODE_JOINING_SERVICE_LITERAL.CRITICAL
            : NODE_JOINING_SERVICE_LITERAL.BACKGROUND,
      queryTimeoutMs: this.resolveAuthoritativeBackfillQueryTimeoutMs(options),
      preferBootstrapSnapshot:
        typeof options.preferBootstrapSnapshot === TYPEOF.BOOLEAN
          ? options.preferBootstrapSnapshot
          : blocking,
      allowReplicaFanout:
        typeof options.allowReplicaFanout === TYPEOF.BOOLEAN
          ? options.allowReplicaFanout
          : !pressureDegraded,
      pressureDegraded,
      pressureAction: pressureDecision?.action || null,
      pressureReason: pressureDecision?.reason || null,
      pressureSummary: pressureDecision?.summary || null,
    };
  }
  /**
   * Resolve the timeout budget for authoritative join backfill reads.
   * Backfill runs inside the querying_state phase and should inherit the
   * broader join-readiness budget rather than the shorter seed-contact HTTP
   * timeout.
   * @param {Object} [options={}]
   * @return {number}
   * @private
   */
  resolveAuthoritativeBackfillQueryTimeoutMs(options = {}) {
    if (
      Number.isFinite(options.queryTimeoutMs) &&
      options.queryTimeoutMs > NUM.ZERO
    ) {
      return Math.floor(options.queryTimeoutMs);
    }
    if (
      Number.isFinite(this.config?.leadershipWaitTimeoutMs) &&
      this.config.leadershipWaitTimeoutMs > NUM.ZERO
    ) {
      return Math.floor(this.config.leadershipWaitTimeoutMs);
    }
    if (
      Number.isFinite(this.config?.httpTimeoutMs) &&
      this.config.httpTimeoutMs > NUM.ZERO
    ) {
      return Math.floor(this.config.httpTimeoutMs);
    }
    return JOINING_DEFAULT.leadershipWaitTimeoutMs;
  }
  /**
   * Resolve one propagated-table snapshot for join backfill.
   * Merges routed SQL reads with direct replica fanout so a stale replica
   * cannot silently hide rows during a multi-node join burst.
   * @param {Object} sqlQueryEngine
   * @param {string} tableName
   * @return {Promise<Object[]>}
   * @private
   */
}

export { NodeJoiningServiceSegment4 };
