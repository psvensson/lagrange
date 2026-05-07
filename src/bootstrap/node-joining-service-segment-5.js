import {NODE_JOINING_SERVICE_SHARED} from './node-joining-service-shared.js';
import {NodeJoiningServiceSegment4} from './node-joining-service-segment-4.js';

const {
  BootstrapTopologySnapshotOwner,
  CACHE_DEFAULT,
  CACHE_HYDRATION_TABLES,
  CDCIntegrationSetup,
  CDCPipelineReadinessGate,
  CDC_PROPAGATED_TABLES,
  COLUMN,
  CONTROL_PLANE_READINESS_DIMENSION,
  ControlPlaneSetup,
  JOINING_ERROR_MSG,
  JOINING_ERROR_NAME,
  JOINING_HTTP,
  JOINING_LOG_MSG,
  JOINING_UNIFIED_RECONCILE,
  JOIN_BACKFILL_QUERY,
  JOIN_REJOIN_PROMOTION_RESTORE_STATE,
  LatencyTopologySetup,
  MessageGroupServiceHandlerSetup,
  NODE_JOINING_SERVICE_LITERAL,
  NUM,
  NodeService,
  NodeStorageBudgetSetup,
  PartitionService,
  PgWireStartupSafetyGate,
  RAFT_ROLE,
  ReplicaHandlerSetup,
  ReplicaStatus,
  RuntimeServiceHandlerSetup,
  SERVICE_STATUS,
  SERVICE_TYPE,
  SQLQueryEngine,
  STARTUP_JOIN_MODE,
  STRING,
  TABLES,
  TIME_MS,
  TYPEOF,
  TablePolicyService,
  UNIFIED_SERVICE_TYPE,
  _deriveWsAddressFromNodeAddress,
  _formatLeaderMetadataDetails,
  _parseBootstrapError,
  _resolveSeedContactRetryAfterMs,
  assertCritical,
  buildDurableRejoinPartitionRestorePlans,
  buildPartitionCdcPropagationSubscriber,
  canonicalizeSystemTableRow,
  classifyTransportDeliveryOutcome,
  compareJoinSchemaVersions,
  extractJoinSchemaVersionFromRecord,
  formatReplicatedServiceAddress,
  getSystemCachePrimaryKeyFieldOrFallback,
  isDeliveredTransportDeliveryOutcome,
  resolveCanonicalLeaderIdentitySnapshot,
  shouldAttachPartitionCdcPropagation,
  wireMigrationWorkflowOwners,
} = NODE_JOINING_SERVICE_SHARED;

class NodeJoiningServiceSegment5 extends NodeJoiningServiceSegment4 {
  async resolveAuthoritativeBackfillRows(
    sqlQueryEngine,
    tableName,
    options = {},
  ) {
    const sql = `SELECT * FROM ${tableName}`;
    const rowSets = [];
    const systemTableSnapshots =
      this.bootstrapResponse?.systemTableSnapshots || null;
    const hasBootstrapSnapshot =
      systemTableSnapshots !== null &&
      typeof systemTableSnapshots === TYPEOF.OBJECT &&
      Object.prototype.hasOwnProperty.call(systemTableSnapshots, tableName);
    const bootstrapSnapshotRows = Array.isArray(
      systemTableSnapshots?.[tableName],
    ) ?
      systemTableSnapshots[tableName] :
      [];
    if (hasBootstrapSnapshot) {
      rowSets.push(bootstrapSnapshotRows);
    }
    if (options.preferBootstrapSnapshot === true && hasBootstrapSnapshot) {
      return this.mergeBackfillRowSets(tableName, rowSets);
    }
    const routedResult = await sqlQueryEngine.executeQuery(sql, [], {
      deliveryPriority: options.deliveryPriority,
      timeoutMs: options.queryTimeoutMs,
    });
    if (routedResult?.success) {
      rowSets.push(Array.isArray(routedResult.rows) ? routedResult.rows : []);
    }
    const replicaQuery = await this.queryBackfillRowsAcrossReplicas(
      sqlQueryEngine,
      tableName,
      sql,
      options,
    );
    if (replicaQuery && replicaQuery.rowSets.length > NUM.ZERO) {
      rowSets.push(...replicaQuery.rowSets);
      const observedCounts = replicaQuery.rowSets.map((rows) => rows.length);
      const mergedCount = this.mergeBackfillRowSets(
        tableName,
        replicaQuery.rowSets,
      ).length;
      const minReplicaCount = Math.min(...observedCounts);
      const maxReplicaCount = Math.max(...observedCounts);
      if (
        minReplicaCount !== maxReplicaCount ||
        mergedCount > maxReplicaCount
      ) {
        this.logger.warn(
          NODE_JOINING_SERVICE_LITERAL.JOIN_BACKFILL_DETECTED_REPLICA_DIVERGENCE,
          {
            nodeId: this.nodeId,
            tableName,
            partitionId: replicaQuery.partitionId,
            replicaCount: replicaQuery.rowSets.length,
            observedCounts,
            mergedCount,
          },
        );
      }
    }
    if (rowSets.length === NUM.ZERO) {
      throw new Error(
        `Failed to backfill propagated table ${tableName}: ` +
          `${routedResult?.error || NODE_JOINING_SERVICE_LITERAL.QUERY_FAILED}`,
      );
    }
    return this.mergeBackfillRowSets(tableName, rowSets);
  }
  /**
   * Query all known routable replicas for one propagated table and return
   * successful row sets. This is used only during join-time cache repair.
   * @param {Object} sqlQueryEngine
   * @param {string} tableName
   * @param {string} sql
   * @return {Promise<{partitionId: string, rowSets: Object[][]}|null>}
   * @private
   */
  async queryBackfillRowsAcrossReplicas(
    sqlQueryEngine,
    tableName,
    sql,
    options = {},
  ) {
    if (options.allowReplicaFanout === false) {
      return null;
    }
    const partitions =
      typeof sqlQueryEngine?.getTablePartitions === TYPEOF.FUNCTION ?
        sqlQueryEngine.getTablePartitions(tableName) :
        [];
    if (!Array.isArray(partitions) || partitions.length !== NUM.ONE) {
      return null;
    }
    const partitionId =
      partitions[0]?.partition_id || partitions[0]?.partitionId || null;
    if (!partitionId) {
      return null;
    }
    const queryExecutor = sqlQueryEngine?.queryExecutor || null;
    const partitionServices =
      typeof queryExecutor?.getRoutablePartitionServices === TYPEOF.FUNCTION ?
        queryExecutor.getRoutablePartitionServices(partitionId) :
        [];
    if (
      !Array.isArray(partitionServices) ||
      partitionServices.length === NUM.ZERO
    ) {
      return null;
    }
    const seenAddresses = new Set();
    const deliveryTargets = [];
    for (const service of partitionServices) {
      const address = service?.address || null;
      if (
        typeof address !== TYPEOF.STRING ||
        address.length === NUM.ZERO ||
        seenAddresses.has(address)
      ) {
        continue;
      }
      seenAddresses.add(address);
      deliveryTargets.push(address);
    }
    if (deliveryTargets.length === NUM.ZERO) {
      return null;
    }
    const messageRouter =
      queryExecutor?.messageRouter || this.messageRouter || null;
    if (!messageRouter || typeof messageRouter.deliver !== TYPEOF.FUNCTION) {
      return null;
    }
    const replicaResults = [];
    for (const address of deliveryTargets) {
      replicaResults.push(
        await this.queryBackfillReplicaAddress(
          messageRouter,
          address,
          sql,
          options,
        ),
      );
    }
    const rowSets = replicaResults
      .filter((result) => result.success)
      .map((result) => result.rows);
    return rowSets.length > NUM.ZERO ? {partitionId, rowSets} : null;
  }
  /**
   * Query one partition replica address for join backfill.
   * @param {Object} messageRouter
   * @param {string} address
   * @param {string} sql
   * @return {Promise<{success: boolean, rows: Object[], error?: string}>}
   * @private
   */
  async queryBackfillReplicaAddress(
    messageRouter,
    address,
    sql,
    options = {},
    seenAddresses = new Set(),
  ) {
    if (seenAddresses.has(address)) {
      return {
        success: false,
        rows: [],
        error: `redirect loop detected for ${address}`,
      };
    }
    const nextSeenAddresses = new Set(seenAddresses);
    nextSeenAddresses.add(address);
    try {
      const response = classifyTransportDeliveryOutcome(
        await messageRouter.deliver(
          address,
          {type: JOIN_BACKFILL_QUERY.MESSAGE_TYPE, sql, params: []},
          {deliveryPriority: options.deliveryPriority},
        ),
      );
      if (
        response?.redirect ===
          JOIN_BACKFILL_QUERY.RESPONSE_TYPE.LEADER_REDIRECT &&
        response?.leaderAddress
      ) {
        return this.queryBackfillReplicaAddress(
          messageRouter,
          response.leaderAddress,
          sql,
          options,
          nextSeenAddresses,
        );
      }
      if (isDeliveredTransportDeliveryOutcome(response) && response?.success) {
        return {
          success: true,
          rows: Array.isArray(response.rows) ? response.rows : [],
        };
      }
      return {
        success: false,
        rows: [],
        error: response?.error || NODE_JOINING_SERVICE_LITERAL.QUERY_FAILED,
      };
    } catch (error) {
      return {success: false, rows: [], error: error.message};
    }
  }
  /**
   * Merge replicated row sets by primary key, preferring the freshest row.
   * @param {string} tableName
   * @param {Object[][]} rowSets
   * @return {Object[]}
   * @private
   */
  mergeBackfillRowSets(tableName, rowSets) {
    const keyField = getSystemCachePrimaryKeyFieldOrFallback(
      tableName,
      CACHE_DEFAULT.PRIMARY_KEY_FALLBACK,
    );
    const mergedRows = new Map();
    for (const rowSet of rowSets) {
      const rows = Array.isArray(rowSet) ? rowSet : [];
      for (const row of rows) {
        const canonicalRow = canonicalizeSystemTableRow(tableName, row);
        const key =
          canonicalRow?.[keyField] ??
          canonicalRow?.[CACHE_DEFAULT.PRIMARY_KEY_FALLBACK];
        if (typeof key === TYPEOF.UNDEFINED || key === null) {
          continue;
        }
        const existing = mergedRows.get(key);
        if (!existing || this.isBackfillRowNewer(canonicalRow, existing)) {
          mergedRows.set(key, canonicalRow);
        }
      }
    }
    return [...mergedRows.values()];
  }
  /**
   * Prefer the row with the newest schema/version watermark.
   * @param {Object} candidate
   * @param {Object} existing
   * @return {boolean}
   * @private
   */
  isBackfillRowNewer(candidate, existing) {
    const candidateVersion = extractJoinSchemaVersionFromRecord(candidate);
    const existingVersion = extractJoinSchemaVersionFromRecord(existing);
    if (candidateVersion && existingVersion) {
      return (
        compareJoinSchemaVersions(candidateVersion, existingVersion) > NUM.ZERO
      );
    }
    if (candidateVersion && !existingVersion) {
      return true;
    }
    if (!candidateVersion && existingVersion) {
      return false;
    }
    return JSON.stringify(candidate).length > JSON.stringify(existing).length;
  }
  /**
   * Make an HTTP POST request.
   * @param {string} url - URL to post to.
   * @param {Object} body - Request body.
   * @return {Promise<Object>} Response body.
   * @private
   */
  async httpPost(url, body, options = {}) {
    const timeoutMs = Number.isFinite(options?.timeoutMs) &&
      options.timeoutMs > NUM.ZERO ?
      Math.floor(options.timeoutMs) :
      this.config.httpTimeoutMs;
    // AbortController is a global in Node.js 22+
    const controller = new globalThis.AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      timeoutMs,
    );
    try {
      const response = await fetch(url, {
        method: JOINING_HTTP.METHOD_POST,
        headers: {
          [JOINING_HTTP.HEADER_CONTENT_TYPE]: JOINING_HTTP.CONTENT_TYPE_JSON,
          [JOINING_HTTP.HEADER_CONNECTION]: JOINING_HTTP.CONNECTION_CLOSE,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        const retryAfterHeader = response.headers.get(
          JOINING_HTTP.HEADER_RETRY_AFTER,
        );
        const errorBody = await response.text();
        let parsedBody = null;
        try {
          parsedBody = JSON.parse(errorBody);
        } catch (_parseError) {
          parsedBody = null;
        }
        const httpStatusError = JOINING_ERROR_MSG.httpStatus;
        const error = new Error(httpStatusError(response.status, errorBody));
        error.statusCode = response.status;
        error.responseBody = errorBody;
        error.responseJson = parsedBody;
        const retryAfterHintMs = this.parseRetryAfterHeaderMs(retryAfterHeader);
        const retryAfterBodyMs = Number.isFinite(parsedBody?.retryAfterMs) ?
          Math.floor(parsedBody.retryAfterMs) :
          null;
        const retryAfterMs =
          Number.isFinite(retryAfterHintMs) && Number.isFinite(retryAfterBodyMs) ?
            Math.max(retryAfterHintMs, retryAfterBodyMs) :
            Number.isFinite(retryAfterHintMs) ?
              retryAfterHintMs :
              retryAfterBodyMs;
        if (Number.isFinite(retryAfterMs)) {
          error.retryAfterMs = retryAfterMs;
        }
        throw error;
      }
      const responseBody = await response.json();
      clearTimeout(timeoutId);
      return responseBody;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === JOINING_ERROR_NAME.ABORT) {
        const httpTimeoutError = JOINING_ERROR_MSG.httpTimeout;
        throw new Error(httpTimeoutError(timeoutMs));
      }
      throw error;
    }
  }
  /**
   * Parse Retry-After header into milliseconds when possible.
   * Supports delta-seconds and HTTP date formats.
   * @param {string|null} retryAfterHeader
   * @return {number|null}
   * @private
   */
  parseRetryAfterHeaderMs(retryAfterHeader) {
    if (
      typeof retryAfterHeader !== TYPEOF.STRING ||
      retryAfterHeader.length === NUM.ZERO
    ) {
      return null;
    }
    const deltaSeconds = Number(retryAfterHeader);
    if (Number.isFinite(deltaSeconds) && deltaSeconds >= NUM.ZERO) {
      return Math.floor(deltaSeconds * TIME_MS.SECOND);
    }
    const retryAtMs = Date.parse(retryAfterHeader);
    if (!Number.isFinite(retryAtMs)) {
      return null;
    }
    return Math.max(NUM.ZERO, retryAtMs - this.now());
  }
  /**
   * Create the shared CDC pipeline readiness gate.
   * Tests override this to inject manual time instead of wall-clock waits.
   * @param {Object} systemTableCache
   * @return {CDCPipelineReadinessGate}
   */
  createCdcPipelineReadinessGate(systemTableCache) {
    return new CDCPipelineReadinessGate({
      systemTableCache,
      cdcPropagatedTables: CDC_PROPAGATED_TABLES,
      now: () => this.now(),
      sleep: (delayMs) => this.sleep(delayMs),
    });
  }
  /**
   * Handle joining failure.
   * @param {Error} error - The error that caused failure.
   * @return {Object} Failure result.
   * @private
   */
  async handleJoiningFailure(error) {
    return this.joinCleanupHandler.handleJoiningFailure(error);
  }
  /**
   * Clean up a failed join in reverse phase order.
   * Each cleanup step undoes the work of the corresponding join phase.
   * Errors are logged but never thrown — cleanup is best-effort.
   * @param {string} failedPhase - The JOINING_PHASE that failed.
   * @param {Object} cleanupContext - Tracking info for cleanup.
   * @param {string} cleanupContext.registeredNodeId - Node ID if
   *   registered before failure.
   * @param {string[]} cleanupContext.createdServiceIds - Service IDs
   *   created before failure.
   * @param {string[]} cleanupContext.createdMessageGroupIds - Message
   *   group IDs created before failure.
   * @return {Promise<void>}
   */
  async cleanupFailedJoin(failedPhase, cleanupContext) {
    return this.joinCleanupHandler.cleanupFailedJoin(
      failedPhase,
      cleanupContext,
    );
  }
  /**
   * Execute a single join cleanup step. Each step is wrapped in
   * try/catch so that cleanup errors are logged but never thrown.
   * @param {string} step - The cleanup step to execute.
   * @param {Object} cleanupContext - Cleanup context.
   * @return {Promise<string>} Cleanup result constant.
   * @private
   */
  async _executeJoinCleanupStep(step, cleanupContext) {
    return this.joinCleanupHandler._executeJoinCleanupStep(
      step,
      cleanupContext,
    );
  }
  /**
   * Cleanup step: remove self from nodes table and remove
   * service entries created during join.
   * @param {Object} cleanupContext - Cleanup context.
   * @return {Promise<string>} Cleanup result constant.
   * @private
   */
  async _cleanupQueryingState(cleanupContext) {
    return this.joinCleanupHandler._cleanupQueryingState(cleanupContext);
  }
  /**
   * Cleanup step: stop message group services that were
   * waiting for leadership.
   * @return {Promise<string>} Cleanup result constant.
   * @private
   */
  async _cleanupWaitingLeadership() {
    return this.joinCleanupHandler._cleanupWaitingLeadership();
  }
  /**
   * Cleanup step: stop message group replicas and remove
   * their service entries.
   * @param {Object} cleanupContext - Cleanup context.
   * @return {Promise<string>} Cleanup result constant.
   * @private
   */
  async _cleanupMessageGroup(cleanupContext) {
    return this.joinCleanupHandler._cleanupMessageGroup(cleanupContext);
  }
  /**
   * Cleanup step: disconnect from seed node and stop
   * the message router.
   * @return {Promise<string>} Cleanup result constant.
   * @private
   */
  async _cleanupConnectingWebSocket() {
    return this.joinCleanupHandler._cleanupConnectingWebSocket();
  }
  /**
   * Clean up partially initialized services.
   * @return {Promise<void>}
   * @private
   */
  async cleanup() {
    return this.joinCleanupHandler.cleanup();
  }
  /**
   * Restore durable local partition runtimes from hydrated system metadata
   * before join admission writes depend on canonical partition leadership.
   * @param {Object} systemTableCache
   * @return {Promise<Object[]>}
   * @private
   */
  async restoreDurableRejoinLocalPartitionServices(systemTableCache) {
    if (this.startupMode !== STARTUP_JOIN_MODE.DURABLE_REJOIN) {
      this.durableRejoinRestoreState =
        JOIN_REJOIN_PROMOTION_RESTORE_STATE.NOT_APPLICABLE;
      return [];
    }
    const restorePlans = buildDurableRejoinPartitionRestorePlans({
      systemTableCache,
      nodeId: this.nodeId,
      dataDir: this.dataDir,
    });
    if (restorePlans.length === NUM.ZERO) {
      this.durableRejoinRestoreState =
        JOIN_REJOIN_PROMOTION_RESTORE_STATE.RESTORED;
      return [];
    }
    this.durableRejoinRestoreState =
      JOIN_REJOIN_PROMOTION_RESTORE_STATE.RESTORING;
    await this.initializeJoiningLifecycleOwners();
    for (const restorePlan of restorePlans) {
      this.queueJoinServiceReplica(
        this.createJoinServiceDescriptor(
          UNIFIED_SERVICE_TYPE.PARTITION,
          restorePlan.replicaId,
        ),
        restorePlan,
      );
    }
    await this.triggerJoinReconciler(
      JOINING_UNIFIED_RECONCILE.HYDRATION_REASON,
    );
    await this.activateJoinPartitionServiceRows(
      restorePlans.map(({replicaId}) => replicaId),
    );
    this.startDurableRejoinLocalPartitionElections(restorePlans);
    this.durableRejoinRestoreState =
      JOIN_REJOIN_PROMOTION_RESTORE_STATE.RESTORED;
    this.logger.info(
      NODE_JOINING_SERVICE_LITERAL.RESTORED_DURABLE_LOCAL_PARTITION_SERVICES_FROM_CACHED_TOPOLOGY,
      {
        nodeId: this.nodeId,
        restoredReplicaCount: restorePlans.length,
        restoredPartitionIds: restorePlans.map(
          ({partitionId}) => partitionId,
        ),
      },
    );
    return restorePlans;
  }
  /**
   * Start elections for restored durable partition replicas once the batch
   * has been recreated locally.
   * @param {Object[]} restorePlans
   * @return {void}
   * @private
   */
  startDurableRejoinLocalPartitionElections(restorePlans = []) {
    for (const restorePlan of restorePlans) {
      const replicaId = restorePlan?.replicaId;
      if (typeof replicaId !== TYPEOF.STRING || replicaId.length === NUM.ZERO) {
        continue;
      }
      const partition = this.partitionServices.get(replicaId);
      if (typeof partition?.startElection === TYPEOF.FUNCTION) {
        partition.startElection();
      }
    }
  }
  /**
   * Initialize the ReplicaHandler to handle CREATE_REPLICA/REMOVE_REPLICA.
   * Requirements: 3.1, 3.2 - Use MessageRouter directly for all communication.
   * @private
   */
  initializeReplicaHandler() {
    const messageGroupService = this.getLeaderMessageGroupService();
    if (!this.messageRouter) {
      this.logger.error(JOINING_LOG_MSG.REPLICA_HANDLER_ROUTER_MISSING, {
        nodeId: this.nodeId,
      });
      throw new Error(JOINING_ERROR_MSG.REPLICA_HANDLER_ROUTER_REQUIRED);
    }
    const cdcIntegrationService = this.createCdcIntegrationService();
    const systemTableCache = NodeService.getInstance().getSystemTableCache();
    if (!this.tablePolicyService) {
      this.tablePolicyService = new TablePolicyService({
        systemTableCache: systemTableCache,
        cdcIntegrationService: cdcIntegrationService,
      });
      this.tablePolicyService.initialize();
    }
    const createPartitionService = async (options) =>
      this.createJoinLocalPartitionService({...options, messageGroupService}); // Use shared ReplicaHandlerSetup component
    const {replicaHandler, replicaStateMachine} = ReplicaHandlerSetup.create({
      nodeId: this.nodeId,
      messageRouter: this.messageRouter,
      cdcIntegrationService: cdcIntegrationService,
      systemTableCache: systemTableCache,
      createPartitionService: createPartitionService,
      dataDir: this.dataDir,
      rpcClient: this.rpcClient,
      executorOutcomeEmitter:
        this.rebalanceCoordinator?.executorOutcomeEmitter,
    });
    this.replicaHandler = replicaHandler;
    this.replicaStateMachine = replicaStateMachine;
    this.logger.info(JOINING_LOG_MSG.REPLICA_HANDLER_READY, {
      nodeId: this.nodeId,
      hasMessageGroupService: !!messageGroupService,
    });
  }
  /**
   * Create and initialize one local partition service on the join path.
   * Shared by the replica handler and durable-rejoin restore lifecycle.
   * @param {Object} options
   * @return {Promise<PartitionService>}
   * @private
   */
  async createJoinLocalPartitionService(options) {
    const cdcIntegrationService = this.createCdcIntegrationService();
    const systemTableCache = NodeService.getInstance().getSystemTableCache();
    if (!this.tablePolicyService) {
      this.tablePolicyService = new TablePolicyService({
        systemTableCache,
        cdcIntegrationService,
      });
      this.tablePolicyService.initialize();
    }
    const cacheForPartition = this.systemCacheHydrated ?
      systemTableCache :
      null;
    const messageGroupService =
      options.messageGroupService || this.getLeaderMessageGroupService();
    const partition = new PartitionService({
      ...options,
      transport: this.transport,
      messageGroupService,
      messageRouter: this.messageRouter,
      rebalanceCoordinator: this.rebalanceCoordinator,
      replicaStateMachine: this.replicaStateMachine,
      systemTableCache: cacheForPartition,
      cdcIntegrationService,
      sqlQueryEngine: cdcIntegrationService?.sqlQueryEngine || null,
      tablePolicyService: this.tablePolicyService,
      bootstrapReadinessState: this.bootstrapReadinessState,
    });
    await partition.initialize();
    this.partitionServices.set(options.replicaId, partition);
    this.trackJoinPartitionReplica(
      options.replicaId,
      options.partitionId,
      partition,
    );
    const tableName = options.tableName;
    if (tableName && shouldAttachPartitionCdcPropagation(tableName)) {
      const subscriptionSelection =
        await this.resolveOperationalMessageGroupSelectionAsync({
          requiredTables: [tableName],
        });
      const subscriptionMessageGroupService = subscriptionSelection.service;
      if (!subscriptionMessageGroupService) {
        throw this.buildMessageGroupOwnerNotReadyError(subscriptionSelection, {
          message:
            NODE_JOINING_SERVICE_LITERAL
              .OPERATIONAL_MESSAGE_GROUP_CDC_INGRESS_NOT_READY +
            `for ${tableName} CDC subscription`,
        });
      }
      await subscriptionMessageGroupService.subscribeToCDC(tableName);
      const subscriberId = [
        'joining',
        this.nodeId,
        tableName,
        options.replicaId,
        subscriptionMessageGroupService?.groupId || 'message-group',
      ].join(':');
      const cdcSubscriber = buildPartitionCdcPropagationSubscriber({
        tableName,
        partitionId: options.partitionId,
        replicaId: options.replicaId,
        logger: this.logger,
        eventLogMessage: JOINING_LOG_MSG.CDC_EVENT_RECEIVED,
        preferredService: subscriptionMessageGroupService,
        resolveOperationalMessageGroupSelection: (selectionOptions = {}) =>
          this.resolveOperationalMessageGroupSelection(selectionOptions),
        resolveOperationalMessageGroupSelectionAsync: (selectionOptions = {}) =>
          this.resolveOperationalMessageGroupSelectionAsync(selectionOptions),
        buildMessageGroupOwnerNotReadyError: (selection, errorOptions) =>
          this.buildMessageGroupOwnerNotReadyError(selection, errorOptions),
        propagatePartitionCDCEvent: (messageGroupService, cdcEvent) =>
          this.propagatePartitionCDCEvent(messageGroupService, cdcEvent),
      });
      const handshake = await partition.subscribeToCDCWithHandshake(
        cdcSubscriber,
        {subscriberId},
      );
      this.logger.debug(JOINING_LOG_MSG.CDC_SUBSCRIPTION_REGISTERED, {
        tableName,
        partitionId: options.partitionId,
        replicaId: options.replicaId,
        subscriberId: handshake.subscriberId,
        subscriptionEpoch: handshake.subscriptionEpoch,
        catchupMode: handshake.catchup.mode,
        bufferedEventsReplayed: handshake.catchup.bufferedEventsReplayed,
      });
    }
    return partition;
  }
  /**
   * Register one locally restored partition with replica-handler recovery state.
   * @param {string} replicaId
   * @param {string} partitionId
   * @param {Object} partition
   * @return {void}
   * @private
   */
  trackJoinPartitionReplica(replicaId, partitionId, partition) {
    if (!this.replicaHandler) {
      return;
    }
    this.replicaHandler.localServices?.set?.(replicaId, partition);
    this.replicaHandler.setLocalReplica?.(replicaId, {
      replicaId,
      partitionId,
      status: ReplicaStatus.ACTIVE,
      service: partition,
    });
    this.replicaHandler.replicaStateMachine?.registerReplicaSnapshot?.(
      replicaId,
      {
        partitionId,
        nodeId: this.nodeId,
        state: ReplicaStatus.ACTIVE,
        serviceId: replicaId,
        serviceType: SERVICE_TYPE.PARTITION,
        serviceAddress:
          typeof partition?.getUnifiedAddress === TYPEOF.FUNCTION ?
            partition.getUnifiedAddress() :
            formatReplicatedServiceAddress(
              SERVICE_TYPE.PARTITION,
              this.nodeId,
              replicaId,
            ),
      },
    );
  }
  /**
   * Initialize the control plane service for ordered registration and dispatch.
   * @private
   */
  async initializeControlPlaneService() {
    if (this.heartbeatService) {
      return;
    }
    const leaderMessageGroup = assertCritical(
      this.getLeaderMessageGroupService(),
      JOINING_ERROR_MSG.MESSAGE_GROUP_LEADER_REQUIRED,
    );
    const systemTableCache =
      leaderMessageGroup.systemTableCache ||
      NodeService.getInstance().getSystemTableCache();
    const cdcIntegrationService = this.createCdcIntegrationService();
    if (!this.tablePolicyService) {
      this.tablePolicyService = new TablePolicyService({
        systemTableCache,
        cdcIntegrationService,
      });
      this.tablePolicyService.initialize();
    } else {
      this.tablePolicyService.systemTableCache = systemTableCache;
      this.tablePolicyService.cdcIntegrationService = cdcIntegrationService;
    }
    for (const messageGroupService of this.messageGroupServices.values()) {
      assertCritical(
        messageGroupService &&
          typeof messageGroupService.subscribeToCDC === TYPEOF.FUNCTION,
        JOINING_ERROR_MSG.controlPlaneCdcSubscribeFailed(
          STRING.UNKNOWN,
          NODE_JOINING_SERVICE_LITERAL.SUBSCRIBETOCDC_NOT_AVAILABLE,
        ),
      );
      for (const tableName of CACHE_HYDRATION_TABLES) {
        try {
          await messageGroupService.subscribeToCDC(tableName);
        } catch (error) {
          this.logger.error(JOINING_LOG_MSG.CDC_SUBSCRIPTION_FAILED, {
            nodeId: this.nodeId,
            tableName,
            error: error.message,
          });
          throw new Error(
            JOINING_ERROR_MSG.controlPlaneCdcSubscribeFailed(
              tableName,
              error.message,
            ),
          );
        }
      }
    }
    const controlPlane = await ControlPlaneSetup.create({
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
      advertisedNodeWsAddress: this.advertisedNodeWsAddress,
      messageRouter: this.messageRouter,
      cdcIntegrationService,
      cdcGroupPropagationService:
        this.latencyTopology?.cdcGroupPropagationService || null,
      systemTableCache,
      tablePolicyService: this.tablePolicyService,
      messageGroupServices: this.messageGroupServices,
      getLocalClusterIncarnationFence: () => this.clusterIncarnationFence,
      rebalanceCoordinator: this.rebalanceCoordinator,
      bootstrapReadinessState: this.bootstrapReadinessState,
      executorOutcomeEmitter: this.replicaHandler?.executorOutcomeEmitter,
    });
    this.heartbeatService = controlPlane.heartbeatService;
    if (
      typeof this.heartbeatService?.setNodeStateReporter === TYPEOF.FUNCTION
    ) {
      this.heartbeatService.setNodeStateReporter(async (payload = {}) => {
        return this.sendControlPlaneNodeStateUpdate({
          state: payload.state,
          capabilities: payload.capabilities,
          heartbeatAt: payload.heartbeatAt,
          readyLeaseExpiresAt: payload.readyLeaseExpiresAt,
          heartbeatOnly: true,
          nodeRow: payload.nodeRow,
          nodeStatePublicationMode: payload.nodeStatePublicationMode,
        });
      });
    }
    this.leaseService = controlPlane.leaseService;
    this.endpointService = controlPlane.endpointService;
    this.dispatchService = controlPlane.dispatchService;
    this.rebalanceCoordinator = controlPlane.rebalanceCoordinator;
    const resolvedExecutorOutcomeEmitter =
      this.rebalanceCoordinator?.executorOutcomeEmitter;
    if (
      this.replicaHandler &&
      resolvedExecutorOutcomeEmitter
    ) {
      this.replicaHandler.executorOutcomeEmitter =
        resolvedExecutorOutcomeEmitter;
    }
    if (
      this.messageGroupServiceHandler &&
      resolvedExecutorOutcomeEmitter
    ) {
      this.messageGroupServiceHandler.executorOutcomeEmitter =
        resolvedExecutorOutcomeEmitter;
    }
    this.runtimeSurfaceOwner.bindControlPlaneServices();
    this.logger.info(
      NODE_JOINING_SERVICE_LITERAL.CONTROL_PLANE_INITIALIZED_BY_OWNER,
      {
        nodeId: this.nodeId,
        owner: NODE_JOINING_SERVICE_LITERAL.CONTROLPLANESETUP,
        messageGroupCount: this.messageGroupServices.size,
      },
    );
  }
  /**
   * Initialize the RuntimeServiceHandler behind the PG wire safety
   * gate. The gate ensures control-plane readiness before allowing
   * runtime-service replica operations. Startup failure is isolated
   * so join completes even if PG wire fails.
   *
   * Requirements: 11.2, 11.3, 11.4
   * @private
   */
  initializeRuntimeServiceHandler() {
    const systemTableCache = NodeService.getInstance().getSystemTableCache();
    const gate = new PgWireStartupSafetyGate({
      nodeId: this.nodeId,
      serviceLifecycleManager: this.serviceLifecycleManager,
      systemTableCache,
      heartbeatService: this.heartbeatService,
    });
    const result = gate.guardedSetup(() => {
      return RuntimeServiceHandlerSetup.create({
        nodeId: this.nodeId,
        messageRouter: this.messageRouter,
        cdcIntegrationService: this.cdcIntegrationService,
        systemTableCache,
        serviceLifecycleManager: this.serviceLifecycleManager,
        rpcClient: this.rpcClient,
        executorOutcomeEmitter:
          this.rebalanceCoordinator?.executorOutcomeEmitter,
      });
    });
    if (result) {
      this.runtimeServiceHandler = result.runtimeServiceHandler;
    }
  }
  /**
   * Initialize the MessageGroupServiceHandler for control-plane
   * message-group replica operations.
   * @private
   */
  initializeMessageGroupServiceHandler() {
    const systemTableCache = NodeService.getInstance().getSystemTableCache();
    const descriptorForReplica = (replicaId) => ({
      serviceId: replicaId,
      serviceType: 'message_group',
      replicaId,
    });
    const result = MessageGroupServiceHandlerSetup.create({
      nodeId: this.nodeId,
      messageRouter: this.messageRouter,
      cdcIntegrationService: this.cdcIntegrationService,
      systemTableCache,
      createMessageGroupReplica: async (options) => {
        return this.createJoinMessageGroupReplica({
          definition: descriptorForReplica(options.replicaId),
          replicaOptions: options,
        });
      },
      startMessageGroupReplica: async (options) => {
        return this.startJoinMessageGroupReplica(
          descriptorForReplica(options.replicaId),
          {replicaOptions: options},
        );
      },
      stopMessageGroupReplica: async (options) => {
        return this.stopJoinMessageGroupReplica(
          descriptorForReplica(options.replicaId),
          {replicaOptions: options},
        );
      },
      resolveLocalMessageGroupReplica: (replicaId) =>
        this.messageGroupServices.get(replicaId) || null,
      rpcClient: this.rpcClient,
      executorOutcomeEmitter:
        this.rebalanceCoordinator?.executorOutcomeEmitter,
    });
    if (result) {
      this.messageGroupServiceHandler = result.messageGroupServiceHandler;
    }
  }
  /**
   * Create a CDC integration service for the joining node.
   * Routes system table writes through SQL query engine which transparently
   * routes to partition leaders via message router.
   * The system cache will be populated later during phaseQuerySystemState().
   * @return {CDCIntegrationService} The CDC integration service.
   * @private
   */
  createCdcIntegrationService() {
    if (this.cdcIntegrationService) {
      return this.cdcIntegrationService;
    }
    const seedNodeId = assertCritical(
      this.seedNodeId,
      JOINING_ERROR_MSG.SEED_NODE_ID_REQUIRED,
    );
    this.logger.debug(JOINING_LOG_MSG.CDC_INTEGRATION_CREATE, {
      nodeId: this.nodeId,
      seedNodeId,
    }); // Get system table cache from message group services
    let systemTableCache = null;
    let cacheMutationTarget = null;
    for (const mgService of this.messageGroupServices.values()) {
      // Get the read-only wrapper for the query engine
      if (mgService.getReadOnlyCache) {
        systemTableCache = mgService.getReadOnlyCache();
      } else if (mgService.systemTableCache) {
        systemTableCache = mgService.systemTableCache;
      }
      if (mgService.getWritableCache) {
        cacheMutationTarget = mgService.getWritableCache();
      } else if (mgService.systemTableCache) {
        cacheMutationTarget = mgService.systemTableCache;
      }
      break;
    }
    if (!systemTableCache) {
      systemTableCache = NodeService.getInstance().getSystemTableCache();
    }
    if (!cacheMutationTarget) {
      cacheMutationTarget = NodeService.getInstance().getSystemTableCache();
    }
    assertCritical(
      systemTableCache,
      JOINING_ERROR_MSG.STATE_QUERY_CACHE_REQUIRED,
    );
    assertCritical(
      this.messageRouter,
      JOINING_ERROR_MSG.MESSAGE_ROUTER_REQUIRED,
    ); // Create SQL query engine with message router for transparent remote routing
    // The query engine will route queries to remote partitions via message router
    // System cache will be populated during phaseQuerySystemState()
    const sqlQueryEngine = new SQLQueryEngine({
      systemCache: systemTableCache,
      messageRouter: this.messageRouter,
      nodeId: this.nodeId,
      rebalanceCoordinator: this.rebalanceCoordinator,
      controlPlaneReadinessService:
        this.rebalanceCoordinator?.controlPlaneReadinessService || null,
      defaultRoutingReadinessDimension:
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      migrationAutoWire: false,
      autoStartDistributedTransactionRecovery: false,
      unrefRetryDelayTimers: true,
    });
    sqlQueryEngine.seedBootstrapRoutingOverlayFromSnapshots(
      this.bootstrapResponse?.systemTableSnapshots || null,
    );
    wireMigrationWorkflowOwners({
      sqlCore: sqlQueryEngine,
      systemTableCache,
      transactionCoordinator: sqlQueryEngine.transactionCoordinator,
      logger: this.logger,
      now: () => Date.now(),
    });
    const cdcIntegrationService = CDCIntegrationSetup.createForNormal({
      nodeId: this.nodeId,
      sqlQueryEngine,
      systemTableCache,
      messageRouter: this.messageRouter,
      cacheMutationTarget,
      partitionServicesProvider: () => this.partitionServices,
    });
    sqlQueryEngine.setCDCIntegrationService(cdcIntegrationService);
    for (const messageGroup of this.messageGroupServices.values()) {
      if (messageGroup.setCdcIntegrationService) {
        messageGroup.setCdcIntegrationService(cdcIntegrationService);
      }
    }
    this.cdcIntegrationService = cdcIntegrationService;
    this.logger.debug(
      NODE_JOINING_SERVICE_LITERAL.CDC_INTEGRATION_INITIALIZED_BY_OWNER,
      {
        nodeId: this.nodeId,
        owner: NODE_JOINING_SERVICE_LITERAL.CDCINTEGRATIONSETUP,
        mode: NODE_JOINING_SERVICE_LITERAL.NORMAL,
      },
    );
    return cdcIntegrationService;
  }
  /**
   * Ensure latency topology owners are initialized.
   * @return {Object}
   * @private
   */
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
          getCurrentEpoch: () =>
            this.epochManager?.getCurrentEpoch?.() || null,
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
        promotionReasons: Array.isArray(evaluation?.promotionReasons) ?
          [...evaluation.promotionReasons] :
          [],
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
   * Return seed-contact startup authority captured before full admission.
   * @return {Object|null}
   */
  getSeedContactStartupAuthoritySnapshot() {
    return this.seedContactStartupAuthority &&
      typeof this.seedContactStartupAuthority === TYPEOF.OBJECT ?
      this.seedContactStartupAuthority :
      null;
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
      typeof systemTableCache.filter === TYPEOF.FUNCTION ?
        systemTableCache.filter(
          TABLES.SERVICES,
          (service) =>
            service?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP &&
              groupIds.has(service?.[COLUMN.GROUP_ID]) &&
              service?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE,
        ) :
        (systemTableCache.getAll?.(TABLES.SERVICES) || []).filter(
          (service) =>
            service?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP &&
              groupIds.has(service?.[COLUMN.GROUP_ID]) &&
              service?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE,
        );
    if (services.length === NUM.ZERO) {
      return false;
    }
    const groupRows =
      typeof systemTableCache.filter === TYPEOF.FUNCTION ?
        systemTableCache.filter(TABLES.MESSAGE_GROUPS, (group) =>
          groupIds.has(group?.[COLUMN.GROUP_ID]),
        ) :
        (systemTableCache.getAll?.(TABLES.MESSAGE_GROUPS) || []).filter(
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
        String(service?.[COLUMN.RAFT_ROLE] || STRING.EMPTY).toLowerCase() ===
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

export {NodeJoiningServiceSegment5};
