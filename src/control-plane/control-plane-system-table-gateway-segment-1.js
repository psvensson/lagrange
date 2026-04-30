import {
  CDC_OPERATION,
  CONTROL_PLANE_CACHE_RECONCILE_DELETE_POLICY,
  CONTROL_PLANE_GATEWAY_LIMIT,
  CONTROL_PLANE_MUTATION_OUTCOME,
  CONTROL_PLANE_OPERATION_LEDGER_LIMIT,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_ROUTING_SNAPSHOT_FIELD,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SOURCE,
  ControlPlaneDiagnosticsLedger,
  INITIAL_PARTITION_IDS,
  NUM,
  PressureGovernor,
  SYSTEM_TABLE_NAME,
  TYPEOF,
  applyMutationWorkloadProfileDefaults,
  areCanonicalSystemTableRowsEqual,
  buildControlPlaneCacheReconcileContract,
  buildControlPlaneQueryOptions,
  buildLocalControlPlaneMutationReadinessFailure,
  canonicalizeSystemTableRow,
  copyOption,
  getControlPlaneErrorCode,
  getControlPlaneFailureSummary,
  getControlPlaneRetryAfterMs,
  getLocalControlPlaneMutationReadinessBlocker,
  getRemainingBudgetMs,
  getSystemCachePrimaryKeyFieldOrFallback,
  hasUsablePrimaryKeyValue,
  normalizePositiveInteger,
  requiresStableLocalControlPlaneMutationReadiness,
  resolveCanonicalLeaderIdentitySnapshot,
  resolveCanonicalLeaderRoutingGapState,
  resolveControlPlaneSystemTableDeliverySource,
} from './control-plane-system-table-gateway-shared.js';

class ControlPlaneSystemTableGatewaySegment1 {
  constructor(options = {}) {
    this.nodeId = options.nodeId || null;
    this._sqlQueryEngine = options.sqlQueryEngine || null;
    this._cdcIntegrationService = options.cdcIntegrationService || null;
    this._systemTableCache = options.systemTableCache || null;
    this._messageRouter = options.messageRouter || null;
    this._controlPlaneReadinessService =
      options.controlPlaneReadinessService || null;
    this.sqlQueryEngineProvider =
      typeof options.getSqlQueryEngine === TYPEOF.FUNCTION ?
        options.getSqlQueryEngine :
        null;
    this.cdcIntegrationServiceProvider =
      typeof options.getCdcIntegrationService === TYPEOF.FUNCTION ?
        options.getCdcIntegrationService :
        null;
    this.systemTableCacheProvider =
      typeof options.getSystemTableCache === TYPEOF.FUNCTION ?
        options.getSystemTableCache :
        null;
    this.messageRouterProvider =
      typeof options.getMessageRouter === TYPEOF.FUNCTION ?
        options.getMessageRouter :
        null;
    this.controlPlaneReadinessServiceProvider =
      typeof options.getControlPlaneReadinessService === TYPEOF.FUNCTION ?
        options.getControlPlaneReadinessService :
        null;
    this.pressureGovernor = options.pressureGovernor || null;
    this.logger = options.logger || null;
    this.now =
      typeof options.now === TYPEOF.FUNCTION ? options.now : () => Date.now();
    this.controlPlaneOperationLedger =
      options.controlPlaneOperationLedger ||
      new ControlPlaneDiagnosticsLedger({
        maxEntries: normalizePositiveInteger(
          options.controlPlaneOperationLedgerMaxEntries,
          CONTROL_PLANE_OPERATION_LEDGER_LIMIT,
        ),
        now: this.now,
      });
    this.inFlightReadRequestsByKey = new Map();
    this.inFlightQueryRequestsByKey = new Map();
    this.inFlightMutationRequestsByKey = new Map();
    this.pendingReplaceMutationRequestsByKey = new Map();
    this.gatewayLimits = Object.freeze({
      maxTrackedReadRequests: normalizePositiveInteger(
        options.maxTrackedReadRequests,
        CONTROL_PLANE_GATEWAY_LIMIT.MAX_TRACKED_READ_REQUESTS,
      ),
      maxTrackedQueryRequests: normalizePositiveInteger(
        options.maxTrackedQueryRequests,
        CONTROL_PLANE_GATEWAY_LIMIT.MAX_TRACKED_QUERY_REQUESTS,
      ),
      maxTrackedMutationRequests: normalizePositiveInteger(
        options.maxTrackedMutationRequests,
        CONTROL_PLANE_GATEWAY_LIMIT.MAX_TRACKED_MUTATION_REQUESTS,
      ),
      maxPendingReplaceMutationRequests: normalizePositiveInteger(
        options.maxPendingReplaceMutationRequests,
        CONTROL_PLANE_GATEWAY_LIMIT.MAX_PENDING_REPLACE_MUTATION_REQUESTS,
      ),
    });
    this.gatewayMetrics = {
      readSingleFlightJoinCount: NUM.ZERO,
      querySingleFlightJoinCount: NUM.ZERO,
      mutationSingleFlightJoinCount: NUM.ZERO,
      readTrackingBypassCount: NUM.ZERO,
      queryTrackingBypassCount: NUM.ZERO,
      mutationReplacePendingQueuedCount: NUM.ZERO,
      mutationReplacePendingSupersededCount: NUM.ZERO,
      mutationTrackingRejectedCount: NUM.ZERO,
      authoritativeRowSourceUnavailableCount: NUM.ZERO,
      distributedParticipantFailureCount: NUM.ZERO,
      reconnectDeliveryFailureCount: NUM.ZERO,
      maxObservedInFlightReadRequests: NUM.ZERO,
      maxObservedInFlightQueryRequests: NUM.ZERO,
      maxObservedInFlightMutationRequests: NUM.ZERO,
      maxObservedPendingReplaceMutationRequests: NUM.ZERO,
      maxObservedRetainedRequestCount: NUM.ZERO,
      maxObservedReadLatencyMs: NUM.ZERO,
      maxObservedMutationLatencyMs: NUM.ZERO,
      maxObservedMutationQueueWaitMs: NUM.ZERO,
      maxObservedTransportPendingNodeConnectionCount: NUM.ZERO,
      readOutcomeCounts: Object.create(null),
      mutationOutcomeCounts: Object.create(null),
      mutationFailureReasonCounts: Object.create(null),
    };
    this.lastRetentionMetricSignature = null;
    this.recordGatewayRetentionSnapshot();
  }

  /**
   * @param {Object} entry
   * @return {void}
   * @private
   */
  recordControlPlaneOperation(entry = {}) {
    if (!this.controlPlaneOperationLedger) {
      return;
    }
    this.controlPlaneOperationLedger.append({
      nodeId: entry.nodeId || this.nodeId || null,
      ...entry,
    });
  }

  /**
   * @param {Object} [options={}]
   * @return {Object[]}
   */
  getControlPlaneOperationLedgerEntries(options = {}) {
    return this.controlPlaneOperationLedger ?
      this.controlPlaneOperationLedger.getEntries(options) :
      Object.freeze([]);
  }

  get sqlQueryEngine() {
    const providedSqlQueryEngine = this.sqlQueryEngineProvider?.() || null;
    return providedSqlQueryEngine || this._sqlQueryEngine || null;
  }

  set sqlQueryEngine(sqlQueryEngine) {
    this._sqlQueryEngine = sqlQueryEngine || null;
  }

  get cdcIntegrationService() {
    const providedCdcIntegrationService =
      this.cdcIntegrationServiceProvider?.() || null;
    return providedCdcIntegrationService || this._cdcIntegrationService || null;
  }

  set cdcIntegrationService(cdcIntegrationService) {
    this._cdcIntegrationService = cdcIntegrationService || null;
  }

  get systemTableCache() {
    const providedSystemTableCache = this.systemTableCacheProvider?.() || null;
    return providedSystemTableCache || this._systemTableCache || null;
  }

  set systemTableCache(systemTableCache) {
    this._systemTableCache = systemTableCache || null;
  }

  get messageRouter() {
    const providedMessageRouter = this.messageRouterProvider?.() || null;
    return providedMessageRouter || this._messageRouter || null;
  }

  set messageRouter(messageRouter) {
    this._messageRouter = messageRouter || null;
  }

  get controlPlaneReadinessService() {
    const providedControlPlaneReadinessService =
      this.controlPlaneReadinessServiceProvider?.() || null;
    return (
      providedControlPlaneReadinessService ||
      this._controlPlaneReadinessService ||
      null
    );
  }

  set controlPlaneReadinessService(controlPlaneReadinessService) {
    this._controlPlaneReadinessService = controlPlaneReadinessService || null;
  }

  /**
   * @param {Object|null} sqlQueryEngine
   */
  setSqlQueryEngine(sqlQueryEngine) {
    this.sqlQueryEngine = sqlQueryEngine;
  }

  /**
   * @param {Object|null} cdcIntegrationService
   */
  setCdcIntegrationService(cdcIntegrationService) {
    this.cdcIntegrationService = cdcIntegrationService;
  }

  /**
   * @param {Object|null} systemTableCache
   */
  setSystemTableCache(systemTableCache) {
    this.systemTableCache = systemTableCache;
  }

  /**
   * @param {Object|null} messageRouter
   */
  setMessageRouter(messageRouter) {
    this.messageRouter = messageRouter;
  }

  /**
   * @param {Object|null} controlPlaneReadinessService
   */
  setControlPlaneReadinessService(controlPlaneReadinessService) {
    this.controlPlaneReadinessService = controlPlaneReadinessService;
  }

  resolveSqlQueryEngine() {
    if (this.sqlQueryEngine) {
      return this.sqlQueryEngine;
    }
    return this.resolveCdcIntegrationService()?.sqlQueryEngine || null;
  }

  resolveCdcIntegrationService() {
    return this.cdcIntegrationService;
  }

  resolveSystemTableCache() {
    return this.systemTableCache;
  }

  resolveMessageRouter() {
    return this.messageRouter;
  }

  resolveControlPlaneReadinessService() {
    return this.controlPlaneReadinessService;
  }

  /**
   * Return one canonical deferred mutation result when the local readiness
   * owner says background metadata work should wait for authority
   * establishment instead of adding more ingress churn.
   * @param {string} tableName
   * @param {Object} writeOptions
   * @return {Object|null}
   * @private
   */
  resolveLocalDeferredMutationReadinessFailure(tableName, writeOptions = {}) {
    if (
      writeOptions?.allowPressureDefer !== true ||
      !requiresStableLocalControlPlaneMutationReadiness(writeOptions?.workClass)
    ) {
      return null;
    }
    const controlPlaneReadinessService =
      this.resolveControlPlaneReadinessService();
    if (!controlPlaneReadinessService || !this.nodeId) {
      return null;
    }
    const blocker = getLocalControlPlaneMutationReadinessBlocker({
      nodeId: this.nodeId,
      controlPlaneReadinessService,
      requirePublishedConvergence: true,
    });
    if (!blocker) {
      return null;
    }
    return this.normalizeMutationResult(
      buildLocalControlPlaneMutationReadinessFailure({
        blocker,
        tableName,
        workClass: writeOptions?.workClass || null,
      }),
    );
  }

  /**
   * Reconcile authoritative rows into the writable system-table cache.
   * This is the only runtime cache-repair ingress outside CDC delivery.
   *
   * @param {string} tableName
   * @param {Object[]} authoritativeRows
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async reconcileAuthoritativeCacheRows(
    tableName,
    authoritativeRows = [],
    options = {},
  ) {
    const defaultCache = this.resolveSystemTableCache();
    const writableCache = options?.cacheMutationTarget || defaultCache;
    const readableCache =
      options?.systemTableCache || defaultCache || writableCache;
    if (
      !writableCache ||
      typeof writableCache.applySystemTableChange !== TYPEOF.FUNCTION ||
      !readableCache
    ) {
      return {
        success: false,
        tableName,
        mutationCount: NUM.ZERO,
        outcome: CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY,
        error:
          CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.SYSTEM_TABLE_CACHE_UNAVAILABLE,
      };
    }

    const primaryKeyField =
      options?.primaryKeyField ||
      getSystemCachePrimaryKeyFieldOrFallback(tableName, 'id');
    const {reconcileIntent, deleteMissingPolicy} =
      buildControlPlaneCacheReconcileContract(options);
    const authoritativeEntries = Array.isArray(authoritativeRows) ?
      authoritativeRows :
      [];
    const cachedEntries = Array.isArray(options?.cachedRows) ?
      options.cachedRows :
      typeof options?.cachedRowFilter === TYPEOF.FUNCTION &&
          typeof readableCache.filter === TYPEOF.FUNCTION ?
        readableCache.filter(tableName, options.cachedRowFilter) || [] :
        typeof readableCache.getAll === TYPEOF.FUNCTION ?
          readableCache.getAll(tableName) || [] :
          [];
    const rowComparator =
      typeof options?.areRowsEqual === TYPEOF.FUNCTION ?
        options.areRowsEqual :
        (left, right) =>
          areCanonicalSystemTableRowsEqual(tableName, left, right);
    const causeOptions =
      typeof options?.causeId === TYPEOF.STRING &&
      options.causeId.length > NUM.ZERO ?
        {causeId: options.causeId} :
        undefined;
    const cachedRowsByKey = new Map();
    const authoritativeKeys = new Set();
    let mutationCount = NUM.ZERO;

    for (const row of cachedEntries) {
      const key = row?.[primaryKeyField] ?? row?.id;
      if (!hasUsablePrimaryKeyValue(key)) {
        continue;
      }
      cachedRowsByKey.set(String(key), row);
    }

    for (const row of authoritativeEntries) {
      const canonicalRow = canonicalizeSystemTableRow(tableName, row);
      const key = canonicalRow?.[primaryKeyField] ?? canonicalRow?.id;
      if (!hasUsablePrimaryKeyValue(key)) {
        continue;
      }
      const normalizedKey = String(key);
      authoritativeKeys.add(normalizedKey);
      const cachedRow = cachedRowsByKey.get(normalizedKey) || null;
      if (rowComparator && rowComparator(cachedRow, canonicalRow)) {
        continue;
      }
      writableCache.applySystemTableChange(
        tableName,
        CDC_OPERATION.UPSERT,
        canonicalRow,
        causeOptions,
      );
      mutationCount += NUM.ONE;
    }

    if (
      deleteMissingPolicy ===
      CONTROL_PLANE_CACHE_RECONCILE_DELETE_POLICY.DELETE_MISSING
    ) {
      for (const cachedRow of cachedEntries) {
        const key = cachedRow?.[primaryKeyField] ?? cachedRow?.id;
        if (
          !hasUsablePrimaryKeyValue(key) ||
          authoritativeKeys.has(String(key))
        ) {
          continue;
        }
        writableCache.applySystemTableChange(
          tableName,
          CDC_OPERATION.DELETE,
          cachedRow,
          causeOptions,
        );
        mutationCount += NUM.ONE;
      }
    }

    return {
      success: true,
      tableName,
      reconcileIntent,
      mutationCount,
      outcome:
        mutationCount > NUM.ZERO ?
          CONTROL_PLANE_MUTATION_OUTCOME.APPLIED :
          CONTROL_PLANE_MUTATION_OUTCOME.NO_OP,
    };
  }

  /**
   * @return {PressureGovernor}
   * @private
   */
  getPressureGovernor() {
    if (this.pressureGovernor) {
      this.pressureGovernor.configure({
        nodeId: this.nodeId,
        messageRouter: this.resolveMessageRouter(),
        logger: this.logger,
      });
      return this.pressureGovernor;
    }
    this.pressureGovernor = PressureGovernor.getShared({
      nodeId: this.nodeId,
      messageRouter: this.resolveMessageRouter(),
      logger: this.logger,
    });
    return this.pressureGovernor;
  }

  /**
   * @param {string|null} tableName
   * @return {string|null}
   * @private
   */
  resolveSystemTablePartitionId(tableName) {
    if (typeof tableName !== TYPEOF.STRING || tableName.length === NUM.ZERO) {
      return null;
    }
    const cdcIntegrationService = this.resolveCdcIntegrationService();
    if (
      typeof cdcIntegrationService?.resolveSystemTablePartitionIds ===
      TYPEOF.FUNCTION
    ) {
      const partitionIds =
        cdcIntegrationService.resolveSystemTablePartitionIds(tableName);
      if (Array.isArray(partitionIds)) {
        const partitionId =
          partitionIds.find(
            (entry) =>
              typeof entry === TYPEOF.STRING && entry.length > NUM.ZERO,
          ) || null;
        if (partitionId) {
          return partitionId;
        }
      }
    }
    return INITIAL_PARTITION_IDS[tableName] || null;
  }

  /**
   * @param {string|null} tableName
   * @param {string|null} routingReadinessDimension
   * @return {Object}
   * @private
   */
  buildFallbackSystemTableRoutingDiagnostics(
    tableName,
    routingReadinessDimension = null,
  ) {
    const partitionId = this.resolveSystemTablePartitionId(tableName);
    let routingSnapshot = null;
    const sqlQueryEngine = this.resolveSqlQueryEngine();
    if (
      partitionId &&
      sqlQueryEngine?.queryExecutor &&
      typeof sqlQueryEngine.queryExecutor.getPartitionRoutingSnapshot ===
        TYPEOF.FUNCTION
    ) {
      try {
        routingSnapshot =
          sqlQueryEngine.queryExecutor.getPartitionRoutingSnapshot(
            partitionId,
            routingReadinessDimension ||
              CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
          );
      } catch (_error) {
        routingSnapshot = null;
      }
    }

    let partitionRow = null;
    let serviceRows = [];
    const systemTableCache = this.resolveSystemTableCache();
    if (
      systemTableCache &&
      typeof systemTableCache.filter === TYPEOF.FUNCTION
    ) {
      const partitionRows =
        systemTableCache.filter(SYSTEM_TABLE_NAME.PARTITIONS, (row) => {
          const rowPartitionId =
            row?.partition_id || row?.partitionId || row?.id || null;
          if (partitionId && rowPartitionId === partitionId) {
            return true;
          }
          return row?.table_name === tableName || row?.tableName === tableName;
        }) || [];
      partitionRow = partitionRows[NUM.ZERO] || null;
      if (partitionId) {
        serviceRows =
          systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES, (row) => {
            return (
              row?.partition_id === partitionId &&
              row?.service_type ===
                CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.PARTITION
            );
          }) || [];
      }
    }

    const hasRoutingSnapshot =
      routingSnapshot && typeof routingSnapshot === TYPEOF.OBJECT;
    const fallbackCanonicalLeaderIdentity = hasRoutingSnapshot ?
      null :
      resolveCanonicalLeaderIdentitySnapshot({
        partition: partitionRow || null,
        partitionPresent: partitionRow !== null,
        serviceRows,
      });
    const leaderNodeId = hasRoutingSnapshot ?
      routingSnapshot[
        CONTROL_PLANE_ROUTING_SNAPSHOT_FIELD.CANONICAL_LEADER_NODE_ID
      ] :
      fallbackCanonicalLeaderIdentity?.leaderNodeId;
    const canonicalLeaderIdentityState = hasRoutingSnapshot ?
      typeof routingSnapshot[
        CONTROL_PLANE_ROUTING_SNAPSHOT_FIELD.CANONICAL_LEADER_IDENTITY_STATE
      ] === TYPEOF.STRING ?
        routingSnapshot[
          CONTROL_PLANE_ROUTING_SNAPSHOT_FIELD.CANONICAL_LEADER_IDENTITY_STATE
        ] :
        null :
      fallbackCanonicalLeaderIdentity?.state || null;
    const routableServiceCount = Number.isFinite(
      routingSnapshot?.routableServiceCount,
    ) ?
      routingSnapshot.routableServiceCount :
      serviceRows.filter(
        (row) =>
          row?.status === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ACTIVE &&
            typeof row?.address === TYPEOF.STRING &&
            row.address.length > NUM.ZERO,
      ).length;
    const serviceRowCount = Number.isFinite(routingSnapshot?.serviceRowCount) ?
      routingSnapshot.serviceRowCount :
      serviceRows.length;
    const canonicalLeaderRoutingGapState = hasRoutingSnapshot ?
      typeof routingSnapshot[
        CONTROL_PLANE_ROUTING_SNAPSHOT_FIELD
          .CANONICAL_LEADER_ROUTING_GAP_STATE
      ] === TYPEOF.STRING ?
        routingSnapshot[
          CONTROL_PLANE_ROUTING_SNAPSHOT_FIELD
            .CANONICAL_LEADER_ROUTING_GAP_STATE
        ] :
        null :
      resolveCanonicalLeaderRoutingGapState({
        canonicalLeaderIdentityState,
        canonicalLeaderNodeId: leaderNodeId,
        serviceRowCount,
        activeAddressedServiceCount: routableServiceCount,
      });
    return {
      partitionId,
      ...(typeof canonicalLeaderIdentityState === TYPEOF.STRING ?
        {
          canonicalLeaderIdentityState,
        } :
        {}),
      ...(typeof canonicalLeaderRoutingGapState === TYPEOF.STRING ?
        {
          canonicalLeaderRoutingGapState,
        } :
        {}),
      ...(typeof leaderNodeId === TYPEOF.STRING &&
      leaderNodeId.length > NUM.ZERO ?
        {
          leaderNodeId,
        } :
        {}),
      serviceRowCount,
      routableServiceCount,
      deniedByReadiness:
        routingSnapshot &&
        typeof routingSnapshot.deniedByNodeId === TYPEOF.OBJECT ?
          Object.keys(routingSnapshot.deniedByNodeId).length > NUM.ZERO :
          false,
    };
  }

  /**
   * @param {string|null} tableName
   * @param {Object|null} result
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  buildOperationLedgerDiagnostics(tableName, result = null, options = {}) {
    const routingReadinessDimension =
      options?.routingReadinessDimension ||
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
    const hasFailureSignals =
      result?.success === false ||
      typeof result?.error === TYPEOF.STRING ||
      typeof result?.message === TYPEOF.STRING ||
      Array.isArray(result?.participantFailures);
    const systemTableDiagnostics =
      result?.systemTableDiagnostics &&
      typeof result.systemTableDiagnostics === TYPEOF.OBJECT ?
        result.systemTableDiagnostics :
        {};
    const failureSummary = hasFailureSignals ?
      getControlPlaneFailureSummary(result) :
      null;
    const retryAfterMs = hasFailureSignals ?
      getControlPlaneRetryAfterMs(result) :
      NUM.ZERO;
    const errorCode = hasFailureSignals ?
      getControlPlaneErrorCode(result) || null :
      null;
    const fallbackDiagnostics = this.buildFallbackSystemTableRoutingDiagnostics(
      tableName,
      routingReadinessDimension,
    );
    const canonicalLeaderIdentityState =
      systemTableDiagnostics.canonicalLeaderIdentityState ||
      fallbackDiagnostics.canonicalLeaderIdentityState ||
      null;
    const canonicalLeaderRoutingGapState =
      systemTableDiagnostics.canonicalLeaderRoutingGapState ||
      fallbackDiagnostics.canonicalLeaderRoutingGapState ||
      null;
    const leaderNodeId =
      typeof systemTableDiagnostics.leaderNodeId === TYPEOF.STRING &&
      systemTableDiagnostics.leaderNodeId.length > NUM.ZERO ?
        systemTableDiagnostics.leaderNodeId :
        typeof fallbackDiagnostics.leaderNodeId === TYPEOF.STRING &&
            fallbackDiagnostics.leaderNodeId.length > NUM.ZERO ?
          fallbackDiagnostics.leaderNodeId :
          null;
    const queryTimeoutMs = Number.isFinite(
      systemTableDiagnostics.queryTimeoutMs,
    ) ?
      systemTableDiagnostics.queryTimeoutMs :
      Number.isFinite(result?.queryTimeoutMs) ?
        result.queryTimeoutMs :
        Number.isFinite(options?.timeoutMs) ?
          options.timeoutMs :
          Number.isFinite(options?.queryTimeoutMs) ?
            options.queryTimeoutMs :
            Number.isFinite(options?.requestedTimeoutMs) ?
              options.requestedTimeoutMs :
              null;
    const routedToNode =
      systemTableDiagnostics.routedToNode ||
      (result?.source ===
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SOURCE.SQL_QUERY_ENGINE ||
      result?.source ===
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.OWNER_RPC_LANE ||
      options?.operationClass ===
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION ||
      options?.operationClass ===
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.QUERY ?
        leaderNodeId :
        null);
    return {
      partitionId:
        systemTableDiagnostics.partitionId ||
        fallbackDiagnostics.partitionId ||
        null,
      localReadHit:
        result?.localReadHit === true ||
        systemTableDiagnostics.localReadHit === true ||
        result?.source ===
          CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.LOCAL_PARTITION_REPLICA,
      localReplicaFallbackHit:
        result?.localReplicaFallbackHit === true ||
        systemTableDiagnostics.localReplicaFallbackHit === true,
      ...(typeof routedToNode === TYPEOF.STRING &&
      routedToNode.length > NUM.ZERO ?
        {
          routedToNode,
        } :
        {}),
      deniedByReadiness:
        systemTableDiagnostics.deniedByReadiness === true ||
        fallbackDiagnostics.deniedByReadiness === true ||
        result?.errorCode ===
          CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ROUTER_QUERY_TRANSPORT_NOT_READY ||
        (result?.success === false && result?.deferRetry === true),
      ...(typeof canonicalLeaderIdentityState === TYPEOF.STRING ?
        {
          canonicalLeaderIdentityState,
        } :
        {}),
      ...(typeof canonicalLeaderRoutingGapState === TYPEOF.STRING ?
        {
          canonicalLeaderRoutingGapState,
        } :
        {}),
      ...(typeof leaderNodeId === TYPEOF.STRING &&
      leaderNodeId.length > NUM.ZERO ?
        {
          leaderNodeId,
        } :
        {}),
      serviceRowCount: Number.isFinite(systemTableDiagnostics.serviceRowCount) ?
        systemTableDiagnostics.serviceRowCount :
        fallbackDiagnostics.serviceRowCount,
      routableServiceCount: Number.isFinite(
        systemTableDiagnostics.routableServiceCount,
      ) ?
        systemTableDiagnostics.routableServiceCount :
        fallbackDiagnostics.routableServiceCount,
      queryTimeoutMs:
        Number.isFinite(queryTimeoutMs) && queryTimeoutMs > NUM.ZERO ?
          Math.floor(queryTimeoutMs) :
          null,
      ...(typeof errorCode === TYPEOF.STRING && errorCode.length > NUM.ZERO ?
        {
          errorCode,
        } :
        {}),
      ...(retryAfterMs > NUM.ZERO ?
        {
          retryAfterMs,
        } :
        {}),
      ...(failureSummary && failureSummary.linkedFailureCount > NUM.ZERO ?
        {
          canonicalFailureReason: failureSummary.primaryReason,
          linkedFailureCount: failureSummary.linkedFailureCount,
          authoritativeRowSourceUnavailableCount:
              failureSummary.authoritativeRowSourceUnavailableCount,
          distributedParticipantFailureCount:
              failureSummary.distributedParticipantFailureCount,
          reconnectDeliveryFailureCount:
              failureSummary.reconnectDeliveryFailureCount,
        } :
        {}),
      ...(Number.isFinite(result?.queueWaitMs) ?
        {
          queueWaitMs: Math.max(NUM.ZERO, Math.floor(result.queueWaitMs)),
        } :
        {}),
      ...(typeof result?.queueState === TYPEOF.STRING ?
        {
          queueState: result.queueState,
        } :
        {}),
    };
  }

  /**
   * @return {boolean}
   */
  supportsReadRows() {
    const systemTableCache = this.resolveSystemTableCache();
    const cdcIntegrationService = this.resolveCdcIntegrationService();
    const sqlQueryEngine = this.resolveSqlQueryEngine();
    return (
      Boolean(systemTableCache) ||
      typeof cdcIntegrationService?.executeAuthoritativeSystemTableRead ===
        TYPEOF.FUNCTION ||
      typeof sqlQueryEngine?.executeQuery === TYPEOF.FUNCTION
    );
  }

  /**
   * @return {boolean}
   */
  supportsMutationSubmission() {
    const cdcIntegrationService = this.resolveCdcIntegrationService();
    return (
      typeof cdcIntegrationService?.insertSystemTableRow === TYPEOF.FUNCTION ||
      typeof cdcIntegrationService?.updateSystemTableRow === TYPEOF.FUNCTION ||
      typeof cdcIntegrationService?.upsertSystemTableRow === TYPEOF.FUNCTION ||
      typeof cdcIntegrationService?.deleteSystemTableRow === TYPEOF.FUNCTION
    );
  }

  /**
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  buildQueryOptions(options = {}, context = {}) {
    const requestedTimeoutMs = Number.isFinite(options?.timeoutMs) ?
      options.timeoutMs :
      Number.isFinite(options?.queryTimeoutMs) ?
        options.queryTimeoutMs :
        options?.requestedTimeoutMs;
    const deliverySource = resolveControlPlaneSystemTableDeliverySource({
      deliverySource: options?.deliverySource,
      tableName: context?.tableName || null,
      sql: context?.sql || null,
      operationKind: context?.operationKind || null,
      coalescingKey: options?.coalescingKey || null,
    });
    let queryOptions = {
      ...buildControlPlaneQueryOptions({
        requestedTimeoutMs,
        timeoutBudget: options?.timeoutBudget,
        now: this.now,
      }),
      routingReadinessDimension:
        options?.routingReadinessDimension ||
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    };
    if (
      typeof options?.sessionId === TYPEOF.STRING &&
      options.sessionId.length > CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ZERO
    ) {
      queryOptions.sessionId = options.sessionId;
    }
    if (options?.cancellationToken) {
      queryOptions.cancellationToken = options.cancellationToken;
    }
    queryOptions = copyOption(
      queryOptions,
      options,
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.DELIVERYPRIORITY,
    );
    if (typeof deliverySource === TYPEOF.STRING &&
      deliverySource.length > CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ZERO) {
      queryOptions[CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.DELIVERYSOURCE] =
        deliverySource;
    }
    return queryOptions;
  }

  /**
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  buildWriteOptions(options = {}, context = {}) {
    const deliverySource = resolveControlPlaneSystemTableDeliverySource({
      deliverySource: options?.deliverySource,
      tableName: context?.tableName || null,
      operationKind: context?.operationKind || null,
      coalescingKey: options?.coalescingKey || null,
    });
    let writeOptions = {
      routingReadinessDimension:
        options?.routingReadinessDimension ||
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    };
    const queryTimeoutMs = Number.isFinite(options?.queryTimeoutMs) ?
      options.queryTimeoutMs :
      options?.timeoutMs;
    if (Number.isFinite(queryTimeoutMs)) {
      writeOptions.queryTimeoutMs = queryTimeoutMs;
    } else if (
      options?.timeoutBudget &&
      typeof options.timeoutBudget === TYPEOF.OBJECT
    ) {
      const remainingBudgetMs = getRemainingBudgetMs(options.timeoutBudget, {
        now: this.now,
      });
      if (remainingBudgetMs > NUM.ZERO) {
        writeOptions.queryTimeoutMs = Math.max(
          NUM.ONE,
          Math.floor(remainingBudgetMs),
        );
      }
    }
    writeOptions = copyOption(
      writeOptions,
      options,
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.CANCELLATIONTOKEN,
    );
    writeOptions = copyOption(
      writeOptions,
      options,
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.TIMEOUTBUDGET,
    );
    writeOptions = copyOption(
      writeOptions,
      options,
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.SKIPCACHEWAIT,
    );
    writeOptions = copyOption(
      writeOptions,
      options,
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ALLOWPENDINGVISIBILITY,
    );
    writeOptions = copyOption(
      writeOptions,
      options,
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.EXPECTEDCACHEFIELDS,
    );
    writeOptions = copyOption(
      writeOptions,
      options,
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MINIMUMCACHEFIELDS,
    );
    writeOptions = copyOption(
      writeOptions,
      options,
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.FALLBACKPHASE,
    );
    writeOptions = copyOption(
      writeOptions,
      options,
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.DISABLESYSTEMWRITESESSION,
    );
    writeOptions = copyOption(
      writeOptions,
      options,
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.SESSIONID,
    );
    writeOptions = copyOption(
      writeOptions,
      options,
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.DELIVERYPRIORITY,
    );
    writeOptions = copyOption(
      writeOptions,
      options,
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.WORKCLASS,
    );
    writeOptions = copyOption(
      writeOptions,
      options,
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.WORKLOADCLASS,
    );
    writeOptions = copyOption(
      writeOptions,
      options,
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.IGNOREEXISTING,
    );
    writeOptions = copyOption(
      writeOptions,
      options,
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ALLOWPRESSUREDEFER,
    );
    writeOptions = copyOption(
      writeOptions,
      options,
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.PRESSURERETRYAFTERMS,
    );
    writeOptions = copyOption(
      writeOptions,
      options,
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.RESOURCEKEYS,
    );
    writeOptions = copyOption(
      writeOptions,
      options,
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.COALESCINGKEY,
    );
    writeOptions = copyOption(
      writeOptions,
      options,
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ALLOWCOALESCING,
    );
    writeOptions = copyOption(
      writeOptions,
      options,
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MERGEPOLICY,
    );
    writeOptions = copyOption(
      writeOptions,
      options,
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.PHASESCOPE,
    );
    writeOptions = copyOption(
      writeOptions,
      options,
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.RECOVERYCANDIDATESELECTIONKEY,
    );
    writeOptions = applyMutationWorkloadProfileDefaults(writeOptions, options);
    if (typeof deliverySource === TYPEOF.STRING &&
      deliverySource.length > CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ZERO) {
      writeOptions[CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.DELIVERYSOURCE] =
        deliverySource;
    }
    return writeOptions;
  }

  /**
   * @return {Object}
   */
  getStats() {
    return {
      limits: {...this.gatewayLimits},
      retainedRequests: {
        inFlightReads: this.inFlightReadRequestsByKey.size,
        inFlightQueries: this.inFlightQueryRequestsByKey.size,
        inFlightMutations: this.inFlightMutationRequestsByKey.size,
        pendingReplaceMutations: this.pendingReplaceMutationRequestsByKey.size,
        total:
          this.inFlightReadRequestsByKey.size +
          this.inFlightQueryRequestsByKey.size +
          this.inFlightMutationRequestsByKey.size +
          this.pendingReplaceMutationRequestsByKey.size,
      },
      metrics: this.buildGatewayMetricsSnapshot(),
    };
  }

  /**
   * @return {Object}
   * @private
   */
  buildGatewayMetricsSnapshot() {
    return {
      ...this.gatewayMetrics,
      readOutcomeCounts: {...this.gatewayMetrics.readOutcomeCounts},
      mutationOutcomeCounts: {...this.gatewayMetrics.mutationOutcomeCounts},
      mutationFailureReasonCounts: {
        ...this.gatewayMetrics.mutationFailureReasonCounts,
      },
    };
  }

  /**
   * @return {Object}
   * @private
   */
  buildRetainedRequestsSnapshot() {
    return {
      inFlightReads: this.inFlightReadRequestsByKey.size,
      inFlightQueries: this.inFlightQueryRequestsByKey.size,
      inFlightMutations: this.inFlightMutationRequestsByKey.size,
      pendingReplaceMutations: this.pendingReplaceMutationRequestsByKey.size,
      total:
        this.inFlightReadRequestsByKey.size +
        this.inFlightQueryRequestsByKey.size +
        this.inFlightMutationRequestsByKey.size +
        this.pendingReplaceMutationRequestsByKey.size,
    };
  }

  /**
   * @return {Object}
   * @private
   */
  buildRetentionMetricData() {
    const retainedRequests = this.buildRetainedRequestsSnapshot();
    const retainedRequestCapacity =
      this.gatewayLimits.maxTrackedReadRequests +
      this.gatewayLimits.maxTrackedQueryRequests +
      this.gatewayLimits.maxTrackedMutationRequests +
      this.gatewayLimits.maxPendingReplaceMutationRequests;
    return {
      nodeId: this.nodeId,
      retainedRequests,
      limits: {...this.gatewayLimits},
      retainedRequestCapacity,
      retainedRequestUtilization:
        retainedRequestCapacity > NUM.ZERO ?
          retainedRequests.total / retainedRequestCapacity :
          NUM.ZERO,
      boundedByTrackedCapacity:
        retainedRequests.total <= retainedRequestCapacity,
      maxObservedRetainedRequestCount:
        this.gatewayMetrics.maxObservedRetainedRequestCount,
    };
  }

  /**
   * @private
   */
  recordGatewayRetentionSnapshot() {
    const retainedRequests = this.buildRetainedRequestsSnapshot();
    const retainedRequestCount = retainedRequests.total;
    this.gatewayMetrics.maxObservedInFlightReadRequests = Math.max(
      this.gatewayMetrics.maxObservedInFlightReadRequests,
      retainedRequests.inFlightReads,
    );
    this.gatewayMetrics.maxObservedInFlightQueryRequests = Math.max(
      this.gatewayMetrics.maxObservedInFlightQueryRequests,
      retainedRequests.inFlightQueries,
    );
    this.gatewayMetrics.maxObservedInFlightMutationRequests = Math.max(
      this.gatewayMetrics.maxObservedInFlightMutationRequests,
      retainedRequests.inFlightMutations,
    );
    this.gatewayMetrics.maxObservedPendingReplaceMutationRequests = Math.max(
      this.gatewayMetrics.maxObservedPendingReplaceMutationRequests,
      retainedRequests.pendingReplaceMutations,
    );
    this.gatewayMetrics.maxObservedRetainedRequestCount = Math.max(
      this.gatewayMetrics.maxObservedRetainedRequestCount,
      retainedRequestCount,
    );
    this.emitGatewayRetentionMetric();
  }

  /**
   * @param {string} metricName
   * @private
   */
  incrementGatewayMetric(metricName) {
    if (typeof this.gatewayMetrics?.[metricName] !== TYPEOF.NUMBER) {
      return;
    }
    this.gatewayMetrics[metricName] +=
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ONE;
  }

  /**
   * @param {string} metricName
   * @param {number} amount
   * @private
   */
  addGatewayMetric(metricName, amount) {
    if (typeof this.gatewayMetrics?.[metricName] !== TYPEOF.NUMBER) {
      return;
    }
    if (!Number.isFinite(amount) || amount <= NUM.ZERO) {
      return;
    }
    this.gatewayMetrics[metricName] += Math.floor(amount);
  }

  /**
   * @param {string} metricName
   * @param {number} latencyMs
   * @private
   */
  recordGatewayLatency(metricName, latencyMs) {
    if (typeof this.gatewayMetrics?.[metricName] !== TYPEOF.NUMBER) {
      return;
    }
    if (!Number.isFinite(latencyMs) || latencyMs < NUM.ZERO) {
      return;
    }
    this.gatewayMetrics[metricName] = Math.max(
      this.gatewayMetrics[metricName],
      Math.floor(latencyMs),
    );
  }

  /**
   * @param {string} bucketName
   * @param {string|null} outcome
   * @private
   */
}

export {ControlPlaneSystemTableGatewaySegment1};
