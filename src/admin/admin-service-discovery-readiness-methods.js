const LOCAL_STR_REPAIR_REQUIRED = 'repair_required';
const LOCAL_STR_REPAIR = 'repair';
const LOCAL_STR_AGEMS = 'ageMs=';
const LOCAL_STR_TIMEOUTMS = 'timeoutMs=';
const LOCAL_STR_CONSTRUCTOR = 'constructor';

function assignAdminServiceDiscoveryReadinessMethods(
  AdminServiceDiscovery,
  options = {},
) {
  const {
    ADMIN_CACHE_DUMP,
    ADMIN_SERVICE_DISCOVERY_LITERAL,
    AUTHORITATIVE_DISCOVERY_REPAIR_REASON_CONTROL_SNAPSHOT,
    AUTHORITATIVE_DISCOVERY_REPAIR_REASON_SERVICE_DISCOVERY_SNAPSHOT,
    AUTHORITATIVE_DISCOVERY_CACHE_GAP_REASON_CODES,
    AUTHORITATIVE_DISCOVERY_REPAIR,
    BENCHMARK_ADMISSION_STATE,
    BENCHMARK_DEGRADATION_PRIORITY,
    BENCHMARK_DEGRADATION_STATE,
    buildControlPlaneWorkloadProfile,
    CANONICAL_LEADER_ROUTING_GAP_STATE,
    COLUMN,
    CONTROL_PLANE_DELIVERY_PRIORITY,
    CONTROL_PLANE_WORKLOAD_CLASS,
    CONTROL_PLANE_READINESS_DIMENSION,
    CONTROL_PLANE_READ_STRATEGY,
    DEFAULT_STEP_TIMEOUT_MS_BY_WORKFLOW_STEP,
    DISCOVERY_ROUTING_SNAPSHOT_FIELD,
    EMPTY_STRING,
    ENDPOINT_SYNC_HEALTH,
    LEADER_RAFT_ROLE,
    NUM,
    REPLICA_OPERATION_TYPE,
    SERVICE_DISCOVERY_READINESS_REASON,
    SERVICE_DISCOVERY_REASON_DETAIL_SEPARATOR,
    SERVICE_TYPE_PARTITION,
    STATUS_ACTIVE,
    TABLES,
    TYPEOF,
    evaluateAuthoritativeRepairPolicy,
    evaluateSharedMetadataNodeCoverage,
    filterActiveServingPartitionRows,
    firstStringField,
    getControlPlaneRetryAfterMs,
    isReplicaOperationInFlight,
    isReplicaOperationStale,
    isReplicaOperationTerminalSuccess,
    isTableCdcReadinessRelevant,
    isActiveVoterReadyPartitionReplica,
    markDiscoveryLocalPartitionCdcBuffered,
    markDiscoveryLocalPartitionCdcDiagnosticsMissing,
    markDiscoveryLocalPartitionCdcNoSubscriber,
    normalizeLocalQueryTransportDiagnostic,
    normalizeDiscoveryTableId,
    normalizeIdentifier,
    normalizeReplicaOperationRecord,
    resolveCanonicalLeaderRoutingGapState,
    extractSchemaVersionFromRecord,
    selectNewestSchemaVersion,
    uniqueSorted,
  } = options;

  class AdminServiceDiscoveryReadinessMethods {
    /**
     * Determine whether discovery snapshot warrants authoritative
     * cache repair.
     * @param {Object} snapshot
     * @param {Object} [options={}]
     * @return {boolean}
     */
    evaluateAuthoritativeDiscoveryRepair(snapshot, options = {}) {
      if (!this.canEvaluateAuthoritativeDiscoveryRepairSnapshot(snapshot)) {
        return null;
      }
      const freshness = this.resolveAuthoritativeDiscoveryRepairFreshness();
      const readinessSummary =
        this.collectAuthoritativeDiscoveryReplicaReadiness(snapshot.services);
      return evaluateAuthoritativeRepairPolicy({
        cacheStalenessMs: freshness.stalenessMs,
        staleThresholdMs: AUTHORITATIVE_DISCOVERY_REPAIR.STALE_THRESHOLD_MS,
        cacheRepairEligible: freshness.cacheRepairEligible,
        scopedQuery: this.isScopedAuthoritativeDiscoveryRepair(options),
        serviceCount: snapshot.serviceCount,
        replicaCount: snapshot.replicaCount,
        readyReplicaCount: readinessSummary.readyReplicaCount,
        selectedNodeCount: readinessSummary.selectedNodeIds.size,
        serviceEndpointsCount: this.resolveDiscoveryServiceEndpointsCount(),
        nodeCoverageGap:
          this.resolveDiscoveryMetadataNodeCoverage().hasCoverageGap,
        staleReplicaOpsInFlightCount: Number(
          snapshot?.replicaOperations?.staleInFlightCount,
        ),
        hasCacheGapReasons: readinessSummary.hasCacheGapReasons,
      });
    }

    canEvaluateAuthoritativeDiscoveryRepairSnapshot(snapshot) {
      return Boolean(
        this.systemTableCache &&
          this.cacheMutationTarget &&
          typeof this.cacheMutationTarget.applySystemTableChange ===
            TYPEOF.FUNCTION &&
          this.canReadAuthoritativeDiscoveryRows() &&
          snapshot &&
          typeof snapshot === TYPEOF.OBJECT,
      );
    }

    resolveAuthoritativeDiscoveryRepairFreshness() {
      const freshness = this.buildPreflightCacheFreshnessSummary ?
        this.buildPreflightCacheFreshnessSummary({
          capturedAtMs: Date.now(),
        }) :
        null;
      const stalenessMs = Number(freshness?.stalenessMs);
      return {
        stalenessMs,
        cacheRepairEligible:
          !Number.isFinite(stalenessMs) ||
          stalenessMs >= AUTHORITATIVE_DISCOVERY_REPAIR.STALE_THRESHOLD_MS,
      };
    }

    isScopedAuthoritativeDiscoveryRepair(options = {}) {
      return (
        normalizeIdentifier(options.tableName) !== null ||
        normalizeDiscoveryTableId(options.tableId) !== null
      );
    }

    collectAuthoritativeDiscoveryReplicaReadiness(services = []) {
      const readinessSummary = {
        readyReplicaCount: NUM.ZERO,
        selectedNodeIds: new Set(),
        hasCacheGapReasons: false,
      };
      for (const service of Array.isArray(services) ?
        services :
        ADMIN_CACHE_DUMP.EMPTY) {
        this.collectAuthoritativeDiscoveryReplicaReadinessForService(
          readinessSummary,
          service,
        );
      }
      return readinessSummary;
    }

    collectAuthoritativeDiscoveryReplicaReadinessForService(
      readinessSummary,
      service,
    ) {
      const replicas = Array.isArray(service?.replicas) ?
        service.replicas :
        ADMIN_CACHE_DUMP.EMPTY;
      for (const replica of replicas) {
        const readiness = replica?.readiness || null;
        if (!readiness || typeof readiness !== TYPEOF.OBJECT) {
          continue;
        }
        const reasons = Array.isArray(readiness.reasons) ?
          readiness.reasons :
          ADMIN_CACHE_DUMP.EMPTY;
        this.recordAuthoritativeDiscoveryReplicaReadiness(
          readinessSummary,
          replica,
          readiness,
          reasons,
        );
      }
    }

    recordAuthoritativeDiscoveryReplicaReadiness(
      readinessSummary,
      replica,
      readiness,
      reasons,
    ) {
      if (readiness.benchmarkReady === true || reasons.length === NUM.ZERO) {
        readinessSummary.readyReplicaCount += NUM.ONE;
        const nodeId = String(replica?.nodeId || EMPTY_STRING);
        if (nodeId) {
          readinessSummary.selectedNodeIds.add(nodeId);
        }
      }
      if (this.hasAuthoritativeDiscoveryCacheGapReason(reasons)) {
        readinessSummary.hasCacheGapReasons = true;
      }
    }

    hasAuthoritativeDiscoveryCacheGapReason(reasons = []) {
      for (const reason of Array.isArray(reasons) ?
        reasons :
        ADMIN_CACHE_DUMP.EMPTY) {
        const code = String(reason?.code || EMPTY_STRING);
        if (AUTHORITATIVE_DISCOVERY_CACHE_GAP_REASON_CODES.has(code)) {
          return true;
        }
      }
      return false;
    }

    resolveDiscoveryServiceEndpointsCount() {
      if (typeof this.systemTableCache.count === TYPEOF.FUNCTION) {
        return this.systemTableCache.count(TABLES.SERVICE_ENDPOINTS);
      }
      return this.systemTableCache.getAll(TABLES.SERVICE_ENDPOINTS).length;
    }

    resolveDiscoveryMetadataNodeCoverage() {
      return evaluateSharedMetadataNodeCoverage({
        nodeRows: this.systemTableCache.getAll(TABLES.NODES),
        serviceRows: this.systemTableCache.getAll(TABLES.SERVICES),
        partitionRows: this.systemTableCache.getAll(TABLES.PARTITIONS),
        nodeEndpointRows: this.systemTableCache.getAll(TABLES.NODE_ENDPOINTS),
      });
    }

    /**
     * Determine whether discovery snapshot warrants authoritative
     * cache repair.
     * @param {Object} snapshot
     * @param {Object} [options={}]
     * @return {boolean}
     */
    shouldAttemptAuthoritativeDiscoveryRepair(snapshot, options = {}) {
      return (
        this.evaluateAuthoritativeDiscoveryRepair(snapshot, options)
          ?.shouldRepair === true
      );
    } /**
     * Build per-replica readiness context from local cache state.
     * @param {Object} [options={}]
     * @return {Object}
     */
    buildServiceDiscoveryReadinessContext(options = {}) {
      const tableName = normalizeIdentifier(options.tableName);
      const tableId = normalizeDiscoveryTableId(options.tableId);
      const nodeRows = this.systemTableCache.getAll(TABLES.NODES);
      const serviceRows = this.systemTableCache.getAll(TABLES.SERVICES);
      const partitionRows = this.systemTableCache.getAll(TABLES.PARTITIONS);
      const tableRows = this.systemTableCache.getAll(TABLES.TABLES);
      const replicaOperationRows = this.systemTableCache.getAll(
        TABLES.REPLICA_OPERATIONS,
      );
      const activeNodeIds = new Set(
        nodeRows
          .map((row) => ({
            nodeId: firstStringField(
              row,
              COLUMN.NODE_ID,
              'node_id',
              'nodeId',
              'id',
            ),
            status: firstStringField(row, COLUMN.STATUS, 'status'),
          }))
          .filter(
            (entry) =>
              entry.nodeId &&
              String(entry.status || '').toLowerCase() === STATUS_ACTIVE,
          )
          .map((entry) => entry.nodeId),
      );
      const tablePartitionContext = this.resolveDiscoveryTablePartitionContext(
        tableName,
        tableId,
        partitionRows,
        tableRows,
      );
      const schemaReady = this.resolveDiscoverySchemaReady(
        tablePartitionContext.partitionIds,
        serviceRows,
      );
      const leadershipStable = this.resolveDiscoveryLeadershipStable(
        tablePartitionContext.partitionIds,
        partitionRows,
        serviceRows,
      );
      const localTargetReplicaStateByNodeId =
        this.buildDiscoveryLocalTargetReplicaStateByNodeId(
          tablePartitionContext.partitionIds,
          serviceRows,
        );
      const localTargetPartitionIds =
        this.buildDiscoveryLocalTargetPartitionIds(
          tablePartitionContext.partitionIds,
          serviceRows,
        );
      const localPartitionCdcState = this.buildDiscoveryLocalPartitionCdcState({
        localTargetPartitionIds,
        tableName,
        cdcReadinessApplies: tablePartitionContext.cdcReadinessApplies,
      });
      const replicaOperationSummary = this
        .buildControlSnapshotReplicaOperationSummary ?
        this.buildControlSnapshotReplicaOperationSummary(
          replicaOperationRows,
          {
            partitionIds: tablePartitionContext.partitionIds,
            serviceRows,
          },
        ) :
        {
          inFlightCount: NUM.ZERO,
          staleInFlightCount: NUM.ZERO,
          stepHistogram: {},
          oldestInFlightAgeMs: null,
          operationTimelineById: {},
        };
      const replicaOperationDegradationByNodeId =
        this.buildDiscoveryReplicaOperationDegradationByNodeId(
          replicaOperationRows,
          {
            partitionIds: tablePartitionContext.partitionIds,
            serviceRows,
          },
        );
      return {
        tableName,
        tableFound: tablePartitionContext.tableFound,
        appliedSchemaVersion: tablePartitionContext.appliedSchemaVersion,
        activeNodeIds,
        schemaReady,
        leadershipStable,
        localTargetReplicaStateByNodeId,
        localPartitionCdcState,
        replicaOpsInFlight: replicaOperationSummary.inFlightCount,
        staleReplicaOpsInFlight: Number(
          replicaOperationSummary.staleInFlightCount || NUM.ZERO,
        ),
        oldestReplicaOperationAgeMs: Number.isFinite(
          replicaOperationSummary.oldestInFlightAgeMs,
        ) ?
          Math.floor(replicaOperationSummary.oldestInFlightAgeMs) :
          null,
        replicaOperationTimelineById:
          replicaOperationSummary.operationTimelineById &&
          typeof replicaOperationSummary.operationTimelineById === TYPEOF.OBJECT ?
            replicaOperationSummary.operationTimelineById :
            {},
        replicaOperationSummary,
        replicaOperationDegradationByNodeId,
      };
    } /**
     * Resolve local active target partition IDs for table-scoped
     * discovery.
     * @param {Set<string>} partitionIds
     * @param {Array<Object>} serviceRows
     * @return {Set<string>}
     */
    buildDiscoveryLocalTargetPartitionIds(partitionIds, serviceRows) {
      const localPartitionIds = new Set();
      if (!(partitionIds instanceof Set) || partitionIds.size === NUM.ZERO) {
        return localPartitionIds;
      }
      for (const serviceRow of serviceRows) {
        const serviceType = firstStringField(
          serviceRow,
          COLUMN.SERVICE_TYPE,
          'service_type',
          'serviceType',
          'type',
        );
        if (serviceType !== SERVICE_TYPE_PARTITION) {
          continue;
        }
        const partitionId = firstStringField(
          serviceRow,
          COLUMN.PARTITION_ID,
          'partition_id',
          'partitionId',
          'id',
        );
        if (!partitionId || !partitionIds.has(partitionId)) {
          continue;
        }
        const nodeId = firstStringField(
          serviceRow,
          COLUMN.NODE_ID,
          'node_id',
          'nodeId',
        );
        if (nodeId !== this.nodeId) {
          continue;
        }
        const status = firstStringField(serviceRow, COLUMN.STATUS, 'status');
        if (
          String(
            status || ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE,
          ).toLowerCase() !== STATUS_ACTIVE
        ) {
          continue;
        }
        localPartitionIds.add(partitionId);
      }
      return localPartitionIds;
    } /**
     * Resolve one node-local partition-services registry.
     * @return {Map<string, Object>|null}
     */
    resolveLocalPartitionServices() {
      if (this.partitionServicesProvider) {
        const provided = this.partitionServicesProvider();
        return provided instanceof Map ? provided : null;
      }
      return this.partitionServices instanceof Map ?
        this.partitionServices :
        null;
    } /**
     * Return true when the injected authoritative system-table read owner is
     * available.
     * @return {boolean}
     */
    hasAuthoritativeDiscoveryReadOwner() {
      return Boolean(
        this.controlPlaneSystemTableGateway &&
          typeof this.controlPlaneSystemTableGateway.executeRead ===
            TYPEOF.FUNCTION,
      );
    } /**
     * Return true when authoritative discovery repair can read canonical rows.
     * @return {boolean}
     */
    canReadAuthoritativeDiscoveryRows() {
      return this.hasAuthoritativeDiscoveryReadOwner();
    } /**
     * Resolve one local partition service by partition ID.
     * @param {Map<string, Object>|null} partitionServices
     * @param {string} partitionId
     * @return {Object|null}
     */
    resolveLocalPartitionService(partitionServices, partitionId) {
      if (!(partitionServices instanceof Map) || !partitionId) {
        return null;
      }
      if (partitionServices.has(partitionId)) {
        return partitionServices.get(partitionId) || null;
      }
      for (const partitionService of partitionServices.values()) {
        if (partitionService?.partitionId === partitionId) {
          return partitionService;
        }
      }
      return null;
    } /**
     * Read one authoritative system-table row set through the injected CDC
     * owner when available.
     * @param {string} tableName
     * @param {Object} options
     * @return {Promise<{tableName:string,rows:Object[]}|null>}
     * @private
     */
    async readAuthoritativeSystemTableRowsViaOwner(tableName, options = {}) {
      if (
        !this.hasAuthoritativeDiscoveryReadOwner() ||
        typeof this.controlPlaneSystemTableGateway?.executeRead !==
          TYPEOF.FUNCTION
      ) {
        return null;
      }
      const now = options.nowMs || Date.now();
      const queryResult = await this.controlPlaneSystemTableGateway.executeRead(
        {
          tableName,
          sql: `SELECT * FROM ${tableName}`,
          params: ADMIN_CACHE_DUMP.EMPTY,
          strategy: CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED,
          owner: 'admin-service-discovery',
        },
        this.buildAuthoritativeDiscoveryReadOptions(tableName, options, now),
      );
      if (queryResult?.success !== true) {
        throw this.buildAuthoritativeDiscoveryReadError(queryResult, tableName);
      }
      return {
        tableName,
        rows: Array.isArray(queryResult?.rows) ?
          queryResult.rows :
          ADMIN_CACHE_DUMP.EMPTY,
      };
    }

    /**
     * Build canonical gateway read options for one authoritative discovery
     * repair query.
     * @param {string} tableName
     * @param {Object} options
     * @param {number} now
     * @return {Object}
     * @private
     */
    buildAuthoritativeDiscoveryReadOptions(tableName, options, now) {
      const reason = String(options.reason || EMPTY_STRING);
      const controlSnapshotRepairRead =
        reason === AUTHORITATIVE_DISCOVERY_REPAIR_REASON_CONTROL_SNAPSHOT;
      const tableScopedDiscoveryRepair =
        reason ===
          AUTHORITATIVE_DISCOVERY_REPAIR_REASON_SERVICE_DISCOVERY_SNAPSHOT &&
        (typeof options.tableName === TYPEOF.STRING ||
          typeof options.tableId === TYPEOF.STRING);
      const transportProfile =
        this.resolveAuthoritativeDiscoveryReadTransportProfile(
          controlSnapshotRepairRead,
        );
      const routingReadinessDimension =
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
      return {
        readProfile: LOCAL_STR_REPAIR_REQUIRED,
        queryTimeoutMs: AUTHORITATIVE_DISCOVERY_REPAIR.QUERY_TIMEOUT_MS,
        sessionId: `${reason || LOCAL_STR_REPAIR}:${tableName}:${now}`,
        allowSqlFallback: tableScopedDiscoveryRepair === true,
        allowPressureDegrade: transportProfile.allowPressureDegrade,
        allowPressureDefer: transportProfile.allowPressureDefer,
        workloadClass: transportProfile.workloadClass,
        workClass: transportProfile.workClass,
        deliveryPriority: transportProfile.deliveryPriority,
        routingReadinessDimension,
      };
    }

    resolveAuthoritativeDiscoveryReadTransportProfile(
      controlSnapshotRepairRead = false,
    ) {
      const workloadProfile = buildControlPlaneWorkloadProfile(
        CONTROL_PLANE_WORKLOAD_CLASS.ADMIN_DIAGNOSTIC_READ,
        {
          allowPressureDegrade: controlSnapshotRepairRead ? false : undefined,
        },
      );
      return Object.freeze({
        workloadClass: workloadProfile.workloadClass,
        workClass: workloadProfile.workClass,
        allowPressureDegrade: workloadProfile.allowPressureDegrade === true,
        allowPressureDefer: workloadProfile.allowPressureDefer === true,
        deliveryPriority: CONTROL_PLANE_DELIVERY_PRIORITY.BACKGROUND,
      });
    }

    /**
     * Normalize one authoritative discovery read failure for callers that
     * apply bounded cache repair.
     * @param {Object} queryResult
     * @param {string} tableName
     * @return {Error}
     * @private
     */
    buildAuthoritativeDiscoveryReadError(queryResult, tableName) {
      const error = new Error(
        queryResult.error || 'authoritative_query_failed',
      );
      error.code = queryResult?.errorCode || null;
      error.retryAfterMs = getControlPlaneRetryAfterMs(queryResult) || null;
      error.readSource =
        typeof queryResult?.source === TYPEOF.STRING ?
          queryResult.source :
          null;
      error.localQueryTransport = normalizeLocalQueryTransportDiagnostic(
        queryResult?.localQueryTransport,
      );
      error.tableName = tableName;
      error.failedPartitions = Array.isArray(queryResult?.failedPartitions) ?
        [...queryResult.failedPartitions] :
        [];
      error.partitionErrors = Array.isArray(queryResult?.partitionErrors) ?
        queryResult.partitionErrors.map((entry) => ({
          ...entry,
        })) :
        [];
      error.participantFailures = Array.isArray(
        queryResult?.participantFailures,
      ) ?
        queryResult.participantFailures.map((entry) => ({
          ...entry,
        })) :
        [];
      error.firstFailedParticipant =
        queryResult?.firstFailedParticipant &&
        typeof queryResult.firstFailedParticipant === TYPEOF.OBJECT ?
          {
            ...queryResult.firstFailedParticipant,
          } :
          null;
      error.distributedMetrics =
        queryResult?.distributedMetrics &&
        typeof queryResult.distributedMetrics === TYPEOF.OBJECT ?
          queryResult.distributedMetrics :
          null;
      return error;
    }

    /**
     * Resolve one authoritative row set for bounded discovery repair.
     * Uses the canonical control-plane read gateway only.
     * @param {string} tableName
     * @param {Object} options
     * @return {Promise<{tableName: string, rows: Object[]}>}
     */
    async readAuthoritativeSystemTableRows(tableName, options = {}) {
      const ownerRows = await this.readAuthoritativeSystemTableRowsViaOwner(
        tableName,
        options,
      );
      if (ownerRows) {
        return ownerRows;
      }
      throw new Error(
        ADMIN_SERVICE_DISCOVERY_LITERAL.AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE,
      );
    } /**
     * Build node-local CDC readiness state for active propagated
     * system-table partitions.
     * @param {Object} options
     * @return {Object}
     */
    buildDiscoveryLocalPartitionCdcState(options = {}) {
      const state = {
        applies: false,
        ready: true,
        diagnosticsAvailable: true,
        missingDiagnosticsPartitionIds: [],
        noSubscriberPartitionIds: [],
        bufferedPartitionIds: [],
      };
      const localTargetPartitionIds = options.localTargetPartitionIds;
      const tableName = String(options.tableName || '');
      if (
        options.cdcReadinessApplies !== true ||
        !isTableCdcReadinessRelevant(tableName) ||
        !(localTargetPartitionIds instanceof Set) ||
        localTargetPartitionIds.size === NUM.ZERO
      ) {
        return state;
      }
      const partitionServices = this.resolveLocalPartitionServices();
      if (!(partitionServices instanceof Map)) {
        return state;
      }
      state.applies = true;
      for (const partitionId of localTargetPartitionIds) {
        const partitionService = this.resolveLocalPartitionService(
          partitionServices,
          partitionId,
        );
        if (
          !partitionService ||
          typeof partitionService.getCDCSubscriptionDiagnostics !==
            TYPEOF.FUNCTION
        ) {
          markDiscoveryLocalPartitionCdcDiagnosticsMissing(state, partitionId);
          continue;
        }
        const diagnostics = partitionService.getCDCSubscriptionDiagnostics();
        if (!diagnostics || typeof diagnostics !== TYPEOF.OBJECT) {
          markDiscoveryLocalPartitionCdcDiagnosticsMissing(state, partitionId);
          continue;
        }
        const subscriberCount = Number(diagnostics.subscriberCount || NUM.ZERO);
        const bufferedEvents = Number(diagnostics.bufferedEvents || NUM.ZERO);
        const replayInFlight = diagnostics.bufferReplayInFlight === true;
        if (subscriberCount <= NUM.ZERO) {
          markDiscoveryLocalPartitionCdcNoSubscriber(state, partitionId);
        }
        if (bufferedEvents > NUM.ZERO || replayInFlight) {
          markDiscoveryLocalPartitionCdcBuffered(state, partitionId);
        }
      }
      state.missingDiagnosticsPartitionIds = uniqueSorted(
        state.missingDiagnosticsPartitionIds,
      );
      state.noSubscriberPartitionIds = uniqueSorted(
        state.noSubscriberPartitionIds,
      );
      state.bufferedPartitionIds = uniqueSorted(state.bufferedPartitionIds);
      return state;
    } /**
     * Build per-node local target-replica readiness for table-scoped
     * discovery.
     * @param {Set<string>} partitionIds
     * @param {Array<Object>} serviceRows
     * @return {Map<string, Object>}
     */
    buildDiscoveryLocalTargetReplicaStateByNodeId(partitionIds, serviceRows) {
      const stateByNodeId = new Map();
      if (!(partitionIds instanceof Set) || partitionIds.size === NUM.ZERO) {
        return stateByNodeId;
      }
      for (const serviceRow of serviceRows) {
        const serviceType = firstStringField(
          serviceRow,
          COLUMN.SERVICE_TYPE,
          'service_type',
          'serviceType',
          'type',
        );
        if (serviceType !== SERVICE_TYPE_PARTITION) {
          continue;
        }
        const partitionId = firstStringField(
          serviceRow,
          COLUMN.PARTITION_ID,
          'partition_id',
          'partitionId',
          'id',
        );
        if (!partitionId || !partitionIds.has(partitionId)) {
          continue;
        }
        const status = firstStringField(serviceRow, COLUMN.STATUS, 'status');
        if (
          String(
            status || ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE,
          ).toLowerCase() !== STATUS_ACTIVE
        ) {
          continue;
        }
        const nodeId = firstStringField(
          serviceRow,
          COLUMN.NODE_ID,
          'node_id',
          'nodeId',
        );
        if (!nodeId) {
          continue;
        }
        const nodeState = stateByNodeId.get(nodeId) || {
          nonVoterPartitionIds: new Set(),
          replicaRoles: new Set(),
        };
        const raftRole = String(
          firstStringField(
            serviceRow,
            COLUMN.RAFT_ROLE,
            'raft_role',
            'raftRole',
          ) || EMPTY_STRING,
        ).toLowerCase();
        if (raftRole.length > NUM.ZERO) {
          nodeState.replicaRoles.add(raftRole);
        }
        if (!isActiveVoterReadyPartitionReplica(serviceRow)) {
          nodeState.nonVoterPartitionIds.add(partitionId);
        }
        stateByNodeId.set(nodeId, nodeState);
      }
      return stateByNodeId;
    }

    /**
     * Resolve partition context for optional table-scoped readiness.
     * @param {string|null} tableName
     * @param {string|null} tableId
     * @param {Array<Object>} partitionRows
     * @param {Array<Object>} tableRows
     * @return {Object}
     */
    resolveDiscoveryTablePartitionContext(
      tableName,
      tableId,
      partitionRows,
      tableRows,
    ) {
      if (!tableName && !tableId) {
        return {
          tableFound: true,
          partitionIds: new Set(),
          appliedSchemaVersion: null,
          cdcReadinessApplies: false,
        };
      }
      const tableContext = this.collectDiscoveryMatchingTableContext(
        tableName,
        tableId,
        tableRows,
      );
      const partitionContext = this.collectDiscoveryMatchingPartitionContext(
        tableName,
        tableContext.tableIds,
        partitionRows,
        tableContext.appliedSchemaVersion,
      );
      const activeServingPartitionRows = filterActiveServingPartitionRows(
        partitionContext.matchingPartitionRows,
        tableContext.matchingTableRows,
      );
      return {
        tableFound:
          tableContext.matchingTableRows.length > NUM.ZERO ||
          partitionContext.matchingPartitionRows.length > NUM.ZERO,
        partitionIds: this.buildDiscoveryPartitionIdSet(
          activeServingPartitionRows,
        ),
        appliedSchemaVersion: partitionContext.appliedSchemaVersion,
        cdcReadinessApplies: tableContext.cdcReadinessApplies,
      };
    }

    collectDiscoveryMatchingTableContext(tableName, tableId, tableRows) {
      const context = {
        tableIds: new Set(),
        matchingTableRows: [],
        appliedSchemaVersion: null,
        cdcReadinessApplies: false,
      };
      for (const tableRow of Array.isArray(tableRows) ?
        tableRows :
        ADMIN_CACHE_DUMP.EMPTY) {
        if (!this.isDiscoveryMatchingTableRow(tableRow, tableName, tableId)) {
          continue;
        }
        context.matchingTableRows.push(tableRow);
        const rowTableId = firstStringField(
          tableRow,
          COLUMN.TABLE_ID,
          'table_id',
          'tableId',
          'id',
        );
        if (rowTableId) {
          context.tableIds.add(rowTableId);
        }
        const rowTableName = firstStringField(
          tableRow,
          COLUMN.TABLE_NAME,
          'table_name',
          'tableName',
          'name',
        );
        if (isTableCdcReadinessRelevant(rowTableName)) {
          context.cdcReadinessApplies = true;
        }
        context.appliedSchemaVersion = selectNewestSchemaVersion(
          context.appliedSchemaVersion,
          extractSchemaVersionFromRecord(tableRow),
        );
      }
      if (tableId) {
        context.tableIds.add(tableId);
      }
      return context;
    }

    isDiscoveryMatchingTableRow(tableRow, tableName, tableId) {
      const rowTableName = firstStringField(
        tableRow,
        COLUMN.TABLE_NAME,
        'table_name',
        'tableName',
        'name',
      );
      const rowTableId = firstStringField(
        tableRow,
        COLUMN.TABLE_ID,
        'table_id',
        'tableId',
        'id',
      );
      return (
        (Boolean(tableName) && rowTableName === tableName) ||
        (Boolean(tableId) && rowTableId === tableId)
      );
    }

    collectDiscoveryMatchingPartitionContext(
      tableName,
      tableIds,
      partitionRows,
      appliedSchemaVersion,
    ) {
      const context = {
        matchingPartitionRows: [],
        appliedSchemaVersion,
      };
      for (const partitionRow of Array.isArray(partitionRows) ?
        partitionRows :
        ADMIN_CACHE_DUMP.EMPTY) {
        const rowTableName = firstStringField(
          partitionRow,
          COLUMN.TABLE_NAME,
          'table_name',
          'tableName',
          'name',
        );
        const rowTableId = firstStringField(
          partitionRow,
          COLUMN.TABLE_ID,
          'table_id',
          'tableId',
        );
        const matchesTableName =
          Boolean(tableName) && rowTableName === tableName;
        const matchesTableId = Boolean(rowTableId) && tableIds.has(rowTableId);
        if (!matchesTableName && !matchesTableId) {
          continue;
        }
        context.matchingPartitionRows.push(partitionRow);
        context.appliedSchemaVersion = selectNewestSchemaVersion(
          context.appliedSchemaVersion,
          extractSchemaVersionFromRecord(partitionRow),
        );
      }
      return context;
    }

    buildDiscoveryPartitionIdSet(partitionRows) {
      const partitionIds = new Set();
      for (const partitionRow of Array.isArray(partitionRows) ?
        partitionRows :
        ADMIN_CACHE_DUMP.EMPTY) {
        const partitionId = firstStringField(
          partitionRow,
          COLUMN.PARTITION_ID,
          'partition_id',
          'partitionId',
          'id',
        );
        if (partitionId) {
          partitionIds.add(partitionId);
        }
      }
      return partitionIds;
    }

    /**
     * Resolve table-scope schema readiness from active partition
     * coverage.
     * @param {Set<string>} partitionIds
     * @param {Array<Object>} serviceRows
     * @return {boolean}
     */
    resolveDiscoverySchemaReady(partitionIds, serviceRows) {
      if (!(partitionIds instanceof Set) || partitionIds.size === NUM.ZERO) {
        return false;
      }
      const readyPartitionIds = new Set();
      for (const serviceRow of serviceRows) {
        const serviceType = firstStringField(
          serviceRow,
          COLUMN.SERVICE_TYPE,
          'service_type',
          'serviceType',
          'type',
        );
        if (serviceType !== SERVICE_TYPE_PARTITION) {
          continue;
        }
        const partitionId = firstStringField(
          serviceRow,
          COLUMN.PARTITION_ID,
          'partition_id',
          'partitionId',
          'id',
        );
        if (!partitionId || !partitionIds.has(partitionId)) {
          continue;
        }
        const status = firstStringField(serviceRow, COLUMN.STATUS, 'status');
        if (
          String(
            status || ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE,
          ).toLowerCase() !== STATUS_ACTIVE
        ) {
          continue;
        }
        const nodeId = firstStringField(
          serviceRow,
          COLUMN.NODE_ID,
          'node_id',
          'nodeId',
        );
        if (!nodeId) {
          continue;
        }
        readyPartitionIds.add(partitionId);
      }
      return readyPartitionIds.size === partitionIds.size;
    }

    /**
     * Resolve leader-coverage stability for target partitions.
     * @param {Set<string>} partitionIds
     * @param {Array<Object>} partitionRows
     * @param {Array<Object>} serviceRows
     * @return {boolean}
     */
    resolveDiscoveryLeadershipStable(partitionIds, partitionRows, serviceRows) {
      if (!(partitionIds instanceof Set) || partitionIds.size === NUM.ZERO) {
        return true;
      }
      const activeReplicaCoverage = this.buildDiscoveryActiveReplicaCoverage(
        partitionIds,
        serviceRows,
      );
      const partitionRowsById = this.buildDiscoveryPartitionRowsById(
        partitionIds,
        partitionRows,
      );
      for (const partitionId of partitionIds) {
        if (
          !this.isDiscoveryPartitionLeadershipStable(
            partitionId,
            activeReplicaCoverage,
            partitionRowsById,
          )
        ) {
          return false;
        }
      }
      return true;
    }

    buildDiscoveryActiveReplicaCoverage(partitionIds, serviceRows) {
      const coverage = {
        activeReplicaNodeIdsByPartition: new Map(),
        advisoryLeaderPartitionIds: new Set(),
      };
      for (const serviceRow of Array.isArray(serviceRows) ?
        serviceRows :
        ADMIN_CACHE_DUMP.EMPTY) {
        const replicaRecord = this.resolveDiscoveryActiveReplicaRecord(
          serviceRow,
          partitionIds,
        );
        if (!replicaRecord) {
          continue;
        }
        let activeReplicaNodeIds = coverage.activeReplicaNodeIdsByPartition.get(
          replicaRecord.partitionId,
        );
        if (!activeReplicaNodeIds) {
          activeReplicaNodeIds = new Set();
          coverage.activeReplicaNodeIdsByPartition.set(
            replicaRecord.partitionId,
            activeReplicaNodeIds,
          );
        }
        activeReplicaNodeIds.add(replicaRecord.nodeId);
        if (replicaRecord.advisoryLeader === true) {
          coverage.advisoryLeaderPartitionIds.add(replicaRecord.partitionId);
        }
      }
      return coverage;
    }

    resolveDiscoveryActiveReplicaRecord(serviceRow, partitionIds) {
      const serviceType = firstStringField(
        serviceRow,
        COLUMN.SERVICE_TYPE,
        'service_type',
        'serviceType',
        'type',
      );
      if (serviceType !== SERVICE_TYPE_PARTITION) {
        return null;
      }
      const partitionId = firstStringField(
        serviceRow,
        COLUMN.PARTITION_ID,
        'partition_id',
        'partitionId',
        'id',
      );
      if (!partitionId || !partitionIds.has(partitionId)) {
        return null;
      }
      const status = firstStringField(serviceRow, COLUMN.STATUS, 'status');
      if (
        String(
          status || ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE,
        ).toLowerCase() !== STATUS_ACTIVE
      ) {
        return null;
      }
      const nodeId = firstStringField(
        serviceRow,
        COLUMN.NODE_ID,
        'node_id',
        'nodeId',
      );
      if (!nodeId) {
        return null;
      }
      const raftRole = firstStringField(
        serviceRow,
        COLUMN.RAFT_ROLE,
        'raft_role',
        'raftRole',
      );
      return {
        partitionId,
        nodeId,
        advisoryLeader:
          String(
            raftRole || ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE,
          ).toLowerCase() === LEADER_RAFT_ROLE,
      };
    }

    buildDiscoveryPartitionRowsById(partitionIds, partitionRows) {
      const partitionRowsById = new Map();
      for (const partitionRow of Array.isArray(partitionRows) ?
        partitionRows :
        ADMIN_CACHE_DUMP.EMPTY) {
        const partitionId = firstStringField(
          partitionRow,
          COLUMN.PARTITION_ID,
          'partition_id',
          'partitionId',
          'id',
        );
        if (
          !partitionId ||
          !partitionIds.has(partitionId) ||
          partitionRowsById.has(partitionId)
        ) {
          continue;
        }
        partitionRowsById.set(partitionId, partitionRow);
      }
      return partitionRowsById;
    }

    isDiscoveryPartitionLeadershipStable(
      partitionId,
      activeReplicaCoverage,
      partitionRowsById,
    ) {
      const activeReplicaNodeIds =
        activeReplicaCoverage.activeReplicaNodeIdsByPartition.get(partitionId);
      const routingSnapshot =
        this.resolveDiscoveryCanonicalLeaderRoutingSnapshot(partitionId);
      if (routingSnapshot) {
        return this.isDiscoveryRoutingSnapshotLeaderStable(
          routingSnapshot,
          activeReplicaNodeIds,
        );
      }
      const partitionRow = partitionRowsById.get(partitionId) || null;
      const canonicalLeaderNodeId = firstStringField(
        partitionRow,
        COLUMN.LEADER_NODE_ID,
        'leader_node_id',
        'leaderNodeId',
      );
      if (canonicalLeaderNodeId) {
        return this.hasDiscoveryActiveLeaderNode(
          activeReplicaNodeIds,
          canonicalLeaderNodeId,
        );
      }
      return activeReplicaCoverage.advisoryLeaderPartitionIds.has(partitionId);
    }

    isDiscoveryRoutingSnapshotLeaderStable(
      routingSnapshot,
      activeReplicaNodeIds,
    ) {
      const canonicalLeaderRoutingGapState =
        resolveCanonicalLeaderRoutingGapState(routingSnapshot);
      const canonicalLeaderNodeId = firstStringField(
        routingSnapshot,
        DISCOVERY_ROUTING_SNAPSHOT_FIELD.CANONICAL_LEADER_NODE_ID,
      );
      if (
        canonicalLeaderRoutingGapState !==
          CANONICAL_LEADER_ROUTING_GAP_STATE.NONE ||
        !canonicalLeaderNodeId
      ) {
        return false;
      }
      return this.hasDiscoveryActiveLeaderNode(
        activeReplicaNodeIds,
        canonicalLeaderNodeId,
      );
    }

    hasDiscoveryActiveLeaderNode(activeReplicaNodeIds, canonicalLeaderNodeId) {
      return (
        activeReplicaNodeIds instanceof Set &&
        activeReplicaNodeIds.has(canonicalLeaderNodeId)
      );
    }

    /**
     * Resolve the shared query-routing snapshot for one discovery partition.
     * When present, discovery must consume this canonical leader-gap state
     * instead of reconstructing its own bootstrap/stale-owner interpretation.
     * @param {string} partitionId
     * @return {Object|null}
     */
    resolveDiscoveryCanonicalLeaderRoutingSnapshot(partitionId) {
      if (
        typeof partitionId !== TYPEOF.STRING ||
        partitionId.length === NUM.ZERO
      ) {
        return null;
      }
      const queryExecutor = this.sqlQueryEngine?.queryExecutor || null;
      if (
        !queryExecutor ||
        typeof queryExecutor.getPartitionRoutingSnapshot !== TYPEOF.FUNCTION
      ) {
        return null;
      }
      try {
        const routingSnapshot =
          queryExecutor.getPartitionRoutingSnapshot(partitionId);
        return routingSnapshot && typeof routingSnapshot === TYPEOF.OBJECT ?
          routingSnapshot :
          null;
      } catch (_error) {
        return null;
      }
    } /**
     * Resolve one canonical leader node from the shared routing snapshot.
     * @param {string} partitionId
     * @return {string|null}
     */
    resolveDiscoveryBootstrapLeaderNodeId(partitionId) {
      const routingSnapshot =
        this.resolveDiscoveryCanonicalLeaderRoutingSnapshot(partitionId);
      if (!routingSnapshot) {
        return null;
      }
      if (
        resolveCanonicalLeaderRoutingGapState(routingSnapshot) !==
        CANONICAL_LEADER_ROUTING_GAP_STATE.NONE
      ) {
        return null;
      }
      return firstStringField(
        routingSnapshot,
        DISCOVERY_ROUTING_SNAPSHOT_FIELD.CANONICAL_LEADER_NODE_ID,
      );
    } /**
     * Build additive canonical readiness block for one discovery
     * replica.
     * @param {Object} replica
     * @param {Object} readinessContext
     * @return {Object}
     */
    buildServiceDiscoveryReplicaReadiness(replica, readinessContext) {
      const nodeId = String(replica?.nodeId || EMPTY_STRING);
      const healthyEndpoint =
        String(replica?.healthStatus || EMPTY_STRING).toLowerCase() ===
        ENDPOINT_SYNC_HEALTH.HEALTHY;
      const routingReady =
        healthyEndpoint && readinessContext.activeNodeIds.has(nodeId);
      const schemaReady = readinessContext.tableName ?
        readinessContext.tableFound && readinessContext.schemaReady === true :
        true;
      const localTargetReplicaState =
        readinessContext.localTargetReplicaStateByNodeId instanceof Map ?
          readinessContext.localTargetReplicaStateByNodeId.get(nodeId) :
          null;
      const localReplicaReady =
        !localTargetReplicaState ||
        localTargetReplicaState.nonVoterPartitionIds.size === NUM.ZERO;
      const localPartitionCdcState =
        nodeId === this.nodeId &&
        readinessContext.localPartitionCdcState &&
        typeof readinessContext.localPartitionCdcState === TYPEOF.OBJECT ?
          readinessContext.localPartitionCdcState :
          null;
      const localCdcReady =
        !localPartitionCdcState ||
        localPartitionCdcState.applies !== true ||
        localPartitionCdcState.ready === true;
      const operationDegradation =
        readinessContext.replicaOperationDegradationByNodeId instanceof Map ?
          readinessContext.replicaOperationDegradationByNodeId.get(nodeId) :
          null;
      const operationDegraded =
        operationDegradation?.degradationState &&
        operationDegradation.degradationState !==
          BENCHMARK_DEGRADATION_STATE.HEALTHY;
      const topologyReady =
        localReplicaReady &&
        localCdcReady &&
        !operationDegraded &&
        readinessContext.leadershipStable === true;
      const benchmarkReady = routingReady && schemaReady && topologyReady;
      return {
        workloadReady: benchmarkReady,
        benchmarkReady,
        routingReady,
        schemaReady,
        topologyReady,
        appliedSchemaVersion: readinessContext.tableName ?
          readinessContext.appliedSchemaVersion :
          null,
        replicaOpsInFlight: readinessContext.replicaOpsInFlight,
        leadershipStable: readinessContext.leadershipStable,
        tableName: readinessContext.tableName,
        reasons: this.buildServiceDiscoveryReplicaReadinessReasons({
          localPartitionCdcState,
          localReplicaReady,
          localTargetReplicaState,
          operationDegradation,
          operationDegraded,
          readinessContext,
          routingReady,
          schemaReady,
        }),
      };
    }

    /**
     * Build canonical readiness reasons for one discovery replica.
     * @param {Object} options
     * @return {Array<Object>}
     * @private
     */
    buildServiceDiscoveryReplicaReadinessReasons(options) {
      const reasons = [];
      if (options.routingReady !== true) {
        reasons.push({
          code: SERVICE_DISCOVERY_READINESS_REASON.ROUTING_NOT_READY,
          detail:
            ADMIN_SERVICE_DISCOVERY_LITERAL.ENDPOINT_UNHEALTHY_OR_NODE_NOT_ACTIVE,
        });
      }
      this.appendServiceDiscoveryReplicaSchemaReasons(
        reasons,
        options.readinessContext,
        options.schemaReady,
      );
      if (
        options.operationDegraded === true &&
        Array.isArray(options.operationDegradation?.reasons)
      ) {
        for (const reason of options.operationDegradation.reasons) {
          reasons.push({
            code: reason.code,
            detail: reason.detail,
          });
        }
      }
      if (options.readinessContext.leadershipStable !== true) {
        reasons.push({
          code: SERVICE_DISCOVERY_READINESS_REASON.LEADERSHIP_UNSTABLE,
          detail:
            ADMIN_SERVICE_DISCOVERY_LITERAL.LEADER_COVERAGE_INCOMPLETE_FOR_READINESS_SCOPE,
        });
      }
      if (options.localReplicaReady !== true) {
        reasons.push({
          code: SERVICE_DISCOVERY_READINESS_REASON.LOCAL_REPLICA_NOT_VOTER_READY,
          detail: uniqueSorted([
            ...options.localTargetReplicaState.nonVoterPartitionIds,
          ]).join(ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE_3),
        });
      }
      this.appendServiceDiscoveryReplicaLocalCdcReasons(
        reasons,
        options.localPartitionCdcState,
      );
      return reasons;
    }

    /**
     * Append schema-scoped readiness reasons for one discovery replica.
     * @param {Array<Object>} reasons
     * @param {Object} readinessContext
     * @param {boolean} schemaReady
     * @private
     */
    appendServiceDiscoveryReplicaSchemaReasons(
      reasons,
      readinessContext,
      schemaReady,
    ) {
      if (!readinessContext.tableName) {
        return;
      }
      if (readinessContext.tableFound !== true) {
        reasons.push({
          code: SERVICE_DISCOVERY_READINESS_REASON.SCHEMA_TABLE_MISSING,
          detail:
            ADMIN_SERVICE_DISCOVERY_LITERAL.TABLE +
            readinessContext.tableName +
            ADMIN_SERVICE_DISCOVERY_LITERAL.NOT_FOUND,
        });
        return;
      }
      if (schemaReady !== true) {
        reasons.push({
          code: SERVICE_DISCOVERY_READINESS_REASON.SCHEMA_PARTITION_UNAVAILABLE,
          detail:
            ADMIN_SERVICE_DISCOVERY_LITERAL.TABLE +
            readinessContext.tableName +
            ADMIN_SERVICE_DISCOVERY_LITERAL.NOT_QUERY_READY_ON_NODE,
        });
      }
    }

    /**
     * Append node-local CDC readiness reasons for one discovery replica.
     * @param {Array<Object>} reasons
     * @param {Object|null} localPartitionCdcState
     * @private
     */
    appendServiceDiscoveryReplicaLocalCdcReasons(
      reasons,
      localPartitionCdcState,
    ) {
      if (localPartitionCdcState?.applies !== true) {
        return;
      }
      if (
        localPartitionCdcState.diagnosticsAvailable === false &&
        localPartitionCdcState.missingDiagnosticsPartitionIds.length > NUM.ZERO
      ) {
        reasons.push({
          code: SERVICE_DISCOVERY_READINESS_REASON.LOCAL_CDC_DIAGNOSTICS_UNAVAILABLE,
          detail: localPartitionCdcState.missingDiagnosticsPartitionIds.join(
            ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE_3,
          ),
        });
      }
      if (localPartitionCdcState.noSubscriberPartitionIds.length > NUM.ZERO) {
        reasons.push({
          code: SERVICE_DISCOVERY_READINESS_REASON.LOCAL_CDC_SUBSCRIBER_MISSING,
          detail: localPartitionCdcState.noSubscriberPartitionIds.join(
            ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE_3,
          ),
        });
      }
      if (localPartitionCdcState.bufferedPartitionIds.length > NUM.ZERO) {
        reasons.push({
          code: SERVICE_DISCOVERY_READINESS_REASON.LOCAL_CDC_BUFFER_NOT_DRAINED,
          detail: localPartitionCdcState.bufferedPartitionIds.join(
            ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE_3,
          ),
        });
      }
    }

    /**
     * Build canonical benchmark-admission block for one discovery
     * replica.
     * @param {Object} replica
     * @param {Object} readinessContext
     * @param {Object} readiness
     * @return {Object}
     */
    buildServiceDiscoveryReplicaBenchmarkAdmission(
      replica,
      readinessContext,
      readiness,
    ) {
      const nodeId = String(replica?.nodeId || EMPTY_STRING);
      const operationDegradation =
        readinessContext.replicaOperationDegradationByNodeId instanceof Map ?
          readinessContext.replicaOperationDegradationByNodeId.get(nodeId) :
          null;
      const localTargetReplicaState =
        readinessContext.localTargetReplicaStateByNodeId instanceof Map ?
          readinessContext.localTargetReplicaStateByNodeId.get(nodeId) :
          null;
      let localReplicaRole = null;
      if (
        localTargetReplicaState?.replicaRoles instanceof Set &&
        localTargetReplicaState.replicaRoles.size === NUM.ONE
      ) {
        localReplicaRole = [...localTargetReplicaState.replicaRoles][NUM.ZERO];
      } else if (
        localTargetReplicaState?.replicaRoles instanceof Set &&
        localTargetReplicaState.replicaRoles.size > NUM.ONE
      ) {
        localReplicaRole = ADMIN_SERVICE_DISCOVERY_LITERAL.MIXED;
      }
      const reasons = Array.isArray(readiness?.reasons) ?
        readiness.reasons.map((reason) => ({
          code: String(reason?.code || EMPTY_STRING),
          detail:
              typeof reason?.detail === TYPEOF.STRING &&
              reason.detail.length > NUM.ZERO ?
                reason.detail :
                null,
        })) :
        [];
      const degradedByOperationIds = Array.isArray(
        operationDegradation?.operationIds,
      ) ?
        [...operationDegradation.operationIds] :
        [];
      const timelineByOperationId =
        readinessContext.replicaOperationTimelineById &&
        typeof readinessContext.replicaOperationTimelineById === TYPEOF.OBJECT ?
          readinessContext.replicaOperationTimelineById :
          {};
      const replicaOperationTimeline = [];
      for (const operationId of degradedByOperationIds) {
        const operationTimeline = timelineByOperationId[operationId];
        if (!Array.isArray(operationTimeline)) {
          continue;
        }
        for (const entry of operationTimeline) {
          replicaOperationTimeline.push(entry);
        }
      }
      return {
        tableName: readiness?.tableName || null,
        nodeId,
        state:
          readiness?.benchmarkReady === true ?
            BENCHMARK_ADMISSION_STATE.READY :
            BENCHMARK_ADMISSION_STATE.BLOCKED,
        degradationState:
          operationDegradation?.degradationState ||
          BENCHMARK_DEGRADATION_STATE.HEALTHY,
        routingReady: readiness?.routingReady === true,
        schemaReady: readiness?.schemaReady === true,
        topologyReady: readiness?.topologyReady === true,
        localReplicaRole,
        degradedByOperationIds,
        reasons,
        replicaOperationTimeline,
      };
    } /**
     * Build per-node replica-operation degradation state for
     * benchmark admission.
     * @param {Array<Object>} replicaOperationRows
     * @param {Object} [options={}]
     * @return {Map<string, Object>}
     */
    buildDiscoveryReplicaOperationDegradationByNodeId(
      replicaOperationRows = [],
      options = {},
    ) {
      const degradationByNodeId = new Map();
      const scopedPartitionIds =
        options.partitionIds instanceof Set ? options.partitionIds : null;
      const serviceRows = Array.isArray(options.serviceRows) ?
        options.serviceRows :
        ADMIN_CACHE_DUMP.EMPTY;
      for (const row of replicaOperationRows) {
        const degradationContext =
          this.resolveReplicaOperationDegradationContext(
            row,
            scopedPartitionIds,
            serviceRows,
          );
        if (degradationContext.applies !== true) {
          continue;
        }
        for (const nodeId of degradationContext.nodeIds) {
          this.mergeReplicaOperationDegradationEntry(
            degradationByNodeId,
            nodeId,
            degradationContext,
          );
        }
      }
      return degradationByNodeId;
    }

    /**
     * Resolve one replica-operation degradation context for discovery
     * readiness.
     * @param {Object} row
     * @param {Set<string>|null} scopedPartitionIds
     * @param {Array<Object>} serviceRows
     * @return {Object}
     */
    resolveReplicaOperationDegradationContext(
      row,
      scopedPartitionIds,
      serviceRows,
    ) {
      if (
        !this.isReplicaOperationRelevantToDiscoveryScope(
          row,
          scopedPartitionIds,
        )
      ) {
        return {
          applies: false,
        };
      }
      const normalizedOperation = normalizeReplicaOperationRecord(row);
      const operationId = normalizedOperation.operationId;
      const nodeIds =
        this.resolveReplicaOperationDegradedNodeIds(normalizedOperation);
      if (!operationId || nodeIds.length === NUM.ZERO) {
        return {
          applies: false,
        };
      }
      const terminalSuccess =
        isReplicaOperationTerminalSuccess(normalizedOperation);
      const failedOperation = normalizedOperation.status === 'failed';
      const inFlightOperation = isReplicaOperationInFlight(
        normalizedOperation,
        {
          serviceRows,
        },
      );
      const observedConverged =
        terminalSuccess !== true &&
        failedOperation !== true &&
        inFlightOperation !== true;
      if (terminalSuccess === true || observedConverged === true) {
        return {
          applies: false,
        };
      }
      const staleTimeout = isReplicaOperationStale(normalizedOperation, {
        serviceRows,
        stepTimeoutMsByWorkflowStep: DEFAULT_STEP_TIMEOUT_MS_BY_WORKFLOW_STEP,
        nowMs: this.nowFn(),
      });
      const degradationState = this.resolveReplicaOperationDegradationState(
        normalizedOperation.type,
        normalizedOperation.status,
        {
          staleTimeout,
        },
      );
      if (degradationState === BENCHMARK_DEGRADATION_STATE.HEALTHY) {
        return {
          applies: false,
        };
      }
      return {
        applies: true,
        nodeIds,
        operationId,
        degradationState,
        reason: this.buildReplicaOperationDegradationReason(
          normalizedOperation,
          staleTimeout,
        ),
      };
    }

    /**
     * Build one canonical readiness reason for replica-operation degradation.
     * @param {Object} normalizedOperation
     * @param {boolean} staleTimeout
     * @return {Object}
     */
    buildReplicaOperationDegradationReason(normalizedOperation, staleTimeout) {
      const timeoutMs = Number(
        DEFAULT_STEP_TIMEOUT_MS_BY_WORKFLOW_STEP[
          normalizedOperation.workflowStep
        ],
      );
      const reasonCode =
        normalizedOperation.status === 'failed' ?
          SERVICE_DISCOVERY_READINESS_REASON.REPLICA_OPERATION_FAILED :
          staleTimeout ?
            SERVICE_DISCOVERY_READINESS_REASON.REPLICA_OPERATION_STALE_TIMEOUT :
            SERVICE_DISCOVERY_READINESS_REASON.REPLICA_OPERATION_IN_FLIGHT;
      const reasonDetail =
        `${normalizedOperation.operationId}:${normalizedOperation.type}:` +
        `${normalizedOperation.status}`;
      if (staleTimeout !== true) {
        return {
          code: reasonCode,
          detail: reasonDetail,
        };
      }
      return {
        code: reasonCode,
        detail:
          reasonDetail +
          SERVICE_DISCOVERY_REASON_DETAIL_SEPARATOR +
          String(normalizedOperation.workflowStep || EMPTY_STRING) +
          SERVICE_DISCOVERY_REASON_DETAIL_SEPARATOR +
          LOCAL_STR_AGEMS +
          String(normalizedOperation.ageMs) +
          SERVICE_DISCOVERY_REASON_DETAIL_SEPARATOR +
          LOCAL_STR_TIMEOUTMS +
          (Number.isFinite(timeoutMs) ? String(timeoutMs) : EMPTY_STRING),
      };
    }

    /**
     * Merge one replica-operation degradation entry into node-scoped
     * readiness.
     * @param {Map<string, Object>} degradationByNodeId
     * @param {string} nodeId
     * @param {Object} degradationContext
     * @private
     */
    mergeReplicaOperationDegradationEntry(
      degradationByNodeId,
      nodeId,
      degradationContext,
    ) {
      const existing = degradationByNodeId.get(nodeId) || {
        degradationState: BENCHMARK_DEGRADATION_STATE.HEALTHY,
        operationIds: [],
        reasons: [],
      };
      if (
        (BENCHMARK_DEGRADATION_PRIORITY[degradationContext.degradationState] ||
          NUM.ZERO) >
        (BENCHMARK_DEGRADATION_PRIORITY[existing.degradationState] || NUM.ZERO)
      ) {
        existing.degradationState = degradationContext.degradationState;
      }
      existing.operationIds = uniqueSorted([
        ...existing.operationIds,
        degradationContext.operationId,
      ]);
      if (
        !existing.reasons.some(
          (reason) =>
            reason.code === degradationContext.reason.code &&
            reason.detail === degradationContext.reason.detail,
        )
      ) {
        existing.reasons.push({
          code: degradationContext.reason.code,
          detail: degradationContext.reason.detail,
        });
      }
      degradationByNodeId.set(nodeId, existing);
    }

    /**
     * Resolve which nodes should be benchmark-degraded by one
     * replica operation.
     * ADD/REMOVE rows degrade the node hosting the affected replica.
     * REPLACE rows degrade both the source and the replacement target.
     * @param {Object} operation
     * @return {Array<string>}
     */
    resolveReplicaOperationDegradedNodeIds(operation) {
      const sourceNodeId = String(operation?.sourceNodeId || EMPTY_STRING);
      const targetNodeId = String(operation?.targetNodeId || EMPTY_STRING);
      if (
        operation?.type === REPLICA_OPERATION_TYPE.ADD ||
        operation?.type === REPLICA_OPERATION_TYPE.REMOVE
      ) {
        return uniqueSorted([targetNodeId || sourceNodeId]);
      }
      return uniqueSorted([sourceNodeId, targetNodeId]);
    }

    /**
     * Determine whether one replica operation applies to the
     * discovered scope.
     * @param {Object} row
     * @param {Set<string>|null} scopedPartitionIds
     * @return {boolean}
     */
    isReplicaOperationRelevantToDiscoveryScope(row, scopedPartitionIds) {
      if (
        !(scopedPartitionIds instanceof Set) ||
        scopedPartitionIds.size === NUM.ZERO
      ) {
        return true;
      }
      const partitionId = firstStringField(
        row,
        COLUMN.PARTITION_ID,
        'partition_id',
        'partitionId',
        'entity_id',
        'entityId',
      );
      return Boolean(partitionId) && scopedPartitionIds.has(partitionId);
    }

    /**
     * Resolve one benchmark degradation state from
     * replica-operation type/status.
     * @param {string} type
     * @param {string} status
     * @return {string}
     */
    resolveReplicaOperationDegradationState(type, status, options = {}) {
      if (!type || !status) {
        return BENCHMARK_DEGRADATION_STATE.HEALTHY;
      }
      const isFailed = status === 'failed';
      const staleTimeout = options?.staleTimeout === true;
      const treatAsFailed = isFailed || staleTimeout;
      if (type === REPLICA_OPERATION_TYPE.REPLACE) {
        return treatAsFailed ?
          BENCHMARK_DEGRADATION_STATE.MOVE_FAILED :
          BENCHMARK_DEGRADATION_STATE.MOVE_PENDING;
      }
      if (type === REPLICA_OPERATION_TYPE.ADD) {
        return treatAsFailed ?
          BENCHMARK_DEGRADATION_STATE.PROMOTION_FAILED :
          BENCHMARK_DEGRADATION_STATE.PROMOTION_PENDING;
      }
      if (type === REPLICA_OPERATION_TYPE.REMOVE) {
        return BENCHMARK_DEGRADATION_STATE.DRAIN_BLOCKED;
      }
      return BENCHMARK_DEGRADATION_STATE.HEALTHY;
    }
  }

  for (const methodName of Object.getOwnPropertyNames(
    AdminServiceDiscoveryReadinessMethods.prototype,
  )) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      AdminServiceDiscovery.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        AdminServiceDiscoveryReadinessMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignAdminServiceDiscoveryReadinessMethods};
