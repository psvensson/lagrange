import {
  buildProjectionReadinessState,
} from '../control-plane/projection-readiness-state.js';
import {trackSyncSection} from '../diagnostics/event-loop-gap-watchdog.js';

// Sync-section attribution (instrumentation-only, projection-readiness
// re-measurement): full-normalize build path outside the evidence owner.
const PROJECTION_READINESS_ADMIN_STATE_BUILD_SECTION =
  'projection_readiness_admin_state_build';

const LOCAL_STR_REPAIR_REQUIRED = 'repair_required';
const LOCAL_STR_REPAIR = 'repair';
const LOCAL_STR_CONSTRUCTOR = 'constructor';

function hasValidAuthoritativeReadTime(receipt) {
  return Number.isFinite(receipt?.observedAtMs);
}

function hasValidAuthoritativeReadCause(receipt) {
  return typeof receipt?.causeId === 'string' && receipt.causeId.length > 0;
}

function hasCompleteAuthoritativeReadResult(result, tableName, completeScope) {
  const receipt = result?.authoritativeObservation;
  return Boolean(
    result?.rowSetComplete === true &&
    receipt?.scope === completeScope &&
    receipt?.tableName === tableName &&
    receipt?.rowSetComplete === true &&
    hasValidAuthoritativeReadTime(receipt) &&
    hasValidAuthoritativeReadCause(receipt),
  );
}

function assignAdminServiceDiscoveryReadinessContextMethods(
  AdminServiceDiscovery,
  options = {},
) {
  const {
    ADMIN_CACHE_DUMP,
    ADMIN_SERVICE_DISCOVERY_LITERAL,
    AUTHORITATIVE_DISCOVERY_REPAIR_REASON_CONTROL_SNAPSHOT,
    AUTHORITATIVE_DISCOVERY_REPAIR,
    buildControlPlaneWorkloadProfile,
    COLUMN,
    CONTROL_PLANE_DELIVERY_PRIORITY,
    CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR,
    CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE,
    CONTROL_PLANE_WORKLOAD_CLASS,
    CONTROL_PLANE_READINESS_DIMENSION,
    CONTROL_PLANE_READ_STRATEGY,
    EMPTY_STRING,
    SERVICE_TYPE_PARTITION,
    STATUS_ACTIVE,
    TABLES,
    firstStringField,
    getControlPlaneRetryAfterMs,
    isTableCdcReadinessRelevant,
    isActiveVoterReadyPartitionReplica,
    markDiscoveryLocalPartitionCdcBuffered,
    markDiscoveryLocalPartitionCdcDiagnosticsMissing,
    markDiscoveryLocalPartitionCdcNoSubscriber,
    normalizeLocalQueryTransportDiagnostic,
    normalizeDiscoveryTableId,
    normalizeIdentifier,
    uniqueSorted,
  } = options;

  class AdminServiceDiscoveryReadinessContextMethods {
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
      const projectionReadinessByNodeId =
        this.buildServiceDiscoveryProjectionReadinessByNodeId(options);
      const activeNodeIds = new Set(
        this.resolveServiceDiscoveryActiveNodeIds(
          nodeRows,
          projectionReadinessByNodeId,
        ),
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
          inFlightCount: 0,
          staleInFlightCount: 0,
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
        projectionReadinessByNodeId,
        schemaReady,
        leadershipStable,
        localTargetReplicaStateByNodeId,
        localPartitionCdcState,
        replicaOpsInFlight: replicaOperationSummary.inFlightCount,
        staleReplicaOpsInFlight: Number(
          replicaOperationSummary.staleInFlightCount || 0,
        ),
        oldestReplicaOperationAgeMs: Number.isFinite(
          replicaOperationSummary.oldestInFlightAgeMs,
        ) ?
          Math.floor(replicaOperationSummary.oldestInFlightAgeMs) :
          null,
        replicaOperationTimelineById:
          replicaOperationSummary.operationTimelineById &&
          typeof replicaOperationSummary.operationTimelineById === 'object' ?
            replicaOperationSummary.operationTimelineById :
            {},
        replicaOperationSummary,
        replicaOperationDegradationByNodeId,
      };
    } /**
     * Build projection-readiness outcomes for service-discovery consumers.
     * @param {Object} options
     * @return {Map<string, Object>}
     */
    buildServiceDiscoveryProjectionReadinessByNodeId(options = {}) {
      const providedReadinessByNodeId =
        options.projectionReadinessByNodeId &&
          typeof options.projectionReadinessByNodeId === 'object' ?
          options.projectionReadinessByNodeId :
          options.readinessByNodeId &&
            typeof options.readinessByNodeId === 'object' ?
            options.readinessByNodeId :
            options.controlPlaneDiagnostics?.readinessByNodeId &&
              typeof options.controlPlaneDiagnostics.readinessByNodeId ===
                'object' ?
              options.controlPlaneDiagnostics.readinessByNodeId :
              null;
      const projectionReadinessByNodeId = new Map();
      if (!providedReadinessByNodeId) {
        return projectionReadinessByNodeId;
      }
      const entries = providedReadinessByNodeId instanceof Map ?
        providedReadinessByNodeId.entries() :
        Object.entries(providedReadinessByNodeId);
      for (const [nodeId, readiness] of entries) {
        const normalizedNodeId = String(nodeId || EMPTY_STRING);
        if (!normalizedNodeId) {
          continue;
        }
        projectionReadinessByNodeId.set(
          normalizedNodeId,
          this.normalizeServiceDiscoveryProjectionReadiness(readiness),
        );
      }
      return projectionReadinessByNodeId;
    } /**
     * Normalize one projection-readiness entry without rebuilding an already
     * canonical owner outcome.
     * @param {Object} readiness
     * @return {Object}
     */
    normalizeServiceDiscoveryProjectionReadiness(readiness) {
      if (readiness?.lanes && typeof readiness.lanes === 'object') {
        return readiness;
      }
      return trackSyncSection(
        PROJECTION_READINESS_ADMIN_STATE_BUILD_SECTION,
        () => buildProjectionReadinessState(readiness || {}),
      );
    } /**
     * Resolve node IDs that may serve discovery replicas.
     * @param {Array<Object>} nodeRows
     * @param {Map<string, Object>} projectionReadinessByNodeId
     * @return {Array<string>}
     */
    resolveServiceDiscoveryActiveNodeIds(
      nodeRows,
      projectionReadinessByNodeId,
    ) {
      const activeNodeIds = new Set(
        (Array.isArray(nodeRows) ? nodeRows : ADMIN_CACHE_DUMP.EMPTY)
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
              String(entry.status || EMPTY_STRING).toLowerCase() ===
                STATUS_ACTIVE,
          )
          .map((entry) => entry.nodeId),
      );
      if (
        !(projectionReadinessByNodeId instanceof Map) ||
        projectionReadinessByNodeId.size === 0
      ) {
        return [...activeNodeIds];
      }
      for (const [nodeId, projectionReadiness] of projectionReadinessByNodeId) {
        if (projectionReadiness?.lanes?.serve?.ready === true) {
          activeNodeIds.add(nodeId);
        } else {
          activeNodeIds.delete(nodeId);
        }
      }
      return [...activeNodeIds];
    } /**
     * Resolve local active target partition IDs for table-scoped
     * discovery.
     * @param {Set<string>} partitionIds
     * @param {Array<Object>} serviceRows
     * @return {Set<string>}
     */
    buildDiscoveryLocalTargetPartitionIds(partitionIds, serviceRows) {
      const localPartitionIds = new Set();
      if (!(partitionIds instanceof Set) || partitionIds.size === 0) {
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
     * Return true when a gateway can serve authoritative repair reads.
     * @param {Object|null} gateway
     * @return {boolean}
     */
    isAuthoritativeDiscoveryReadOwner(gateway = null) {
      return Boolean(
        gateway &&
          typeof gateway.executeRead === 'function',
      );
    } /**
     * Resolve the canonical authoritative read owner, including the late
     * runtime owner attached after admin construction.
     * @return {Object|null}
     */
    resolveAuthoritativeDiscoveryReadOwner() {
      if (
        this.isAuthoritativeDiscoveryReadOwner(
          this.controlPlaneSystemTableGateway,
        )
      ) {
        return this.controlPlaneSystemTableGateway;
      }
      const lateGateway =
        this.sqlQueryEngine?.controlPlaneSystemTableGateway ||
        this.sqlQueryEngine?.rebalanceCoordinator
          ?.controlPlaneSystemTableGateway ||
        this.controlPlaneSnapshotOwner?.controlSnapshot
          ?.controlPlaneSystemTableGateway ||
        null;
      if (this.isAuthoritativeDiscoveryReadOwner(lateGateway)) {
        this.controlPlaneSystemTableGateway = lateGateway;
        return lateGateway;
      }
      return null;
    } /**
     * Return true when the injected authoritative system-table read owner is
     * available.
     * @return {boolean}
     */
    hasAuthoritativeDiscoveryReadOwner() {
      return this.resolveAuthoritativeDiscoveryReadOwner() !== null;
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
      const authoritativeReadOwner =
        this.resolveAuthoritativeDiscoveryReadOwner();
      if (!authoritativeReadOwner) {
        return null;
      }
      const now = options.nowMs || Date.now();
      const queryResult = await authoritativeReadOwner.executeRead(
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
      const authoritativeObservation = queryResult?.authoritativeObservation;
      if (!hasCompleteAuthoritativeReadResult(
        queryResult,
        tableName,
        CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE.COMPLETE_TABLE,
      )) {
        throw this.buildAuthoritativeDiscoveryReadError(
          {
            ...queryResult,
            success: false,
            error:
              queryResult?.error ||
              CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR.READ_INCOMPLETE,
            errorCode:
              queryResult?.errorCode ||
              CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR.READ_INCOMPLETE,
          },
          tableName,
        );
      }
      return {
        tableName,
        rows: queryResult.rows,
        authoritativeObservation,
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
      const transportProfile =
        this.resolveAuthoritativeDiscoveryReadTransportProfile(
          controlSnapshotRepairRead,
        );
      const queryTimeoutMs =
        Number.isFinite(options.queryTimeoutMs) &&
        options.queryTimeoutMs > 0 ?
          Math.floor(options.queryTimeoutMs) :
          AUTHORITATIVE_DISCOVERY_REPAIR.QUERY_TIMEOUT_MS;
      const routingReadinessDimension =
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
      return {
        readProfile: LOCAL_STR_REPAIR_REQUIRED,
        queryTimeoutMs,
        sessionId: `${reason || LOCAL_STR_REPAIR}:${tableName}:${now}`,
        workloadClass: transportProfile.workloadClass,
        workClass: transportProfile.workClass,
        deliveryPriority: transportProfile.deliveryPriority,
        routingReadinessDimension,
        authoritativeObservationScope:
          CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE.COMPLETE_TABLE,
      };
    }

    resolveAuthoritativeDiscoveryReadTransportProfile(
      controlSnapshotRepairRead = false,
    ) {
      const workloadClass = controlSnapshotRepairRead ?
        CONTROL_PLANE_WORKLOAD_CLASS.READINESS_CRITICAL_READ :
        CONTROL_PLANE_WORKLOAD_CLASS.ADMIN_DIAGNOSTIC_READ;
      const workloadProfile = buildControlPlaneWorkloadProfile(
        workloadClass,
        {
        },
      );
      return Object.freeze({
        workloadClass: workloadProfile.workloadClass,
        workClass: workloadProfile.workClass,
        deliveryPriority: controlSnapshotRepairRead ?
          CONTROL_PLANE_DELIVERY_PRIORITY.READINESS :
          CONTROL_PLANE_DELIVERY_PRIORITY.BACKGROUND,
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
        typeof queryResult?.source === 'string' ?
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
        typeof queryResult.firstFailedParticipant === 'object' ?
          {
            ...queryResult.firstFailedParticipant,
          } :
          null;
      error.distributedMetrics =
        queryResult?.distributedMetrics &&
        typeof queryResult.distributedMetrics === 'object' ?
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
        localTargetPartitionIds.size === 0
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
            'function'
        ) {
          markDiscoveryLocalPartitionCdcDiagnosticsMissing(state, partitionId);
          continue;
        }
        const diagnostics = partitionService.getCDCSubscriptionDiagnostics();
        if (!diagnostics || typeof diagnostics !== 'object') {
          markDiscoveryLocalPartitionCdcDiagnosticsMissing(state, partitionId);
          continue;
        }
        const subscriberCount = Number(diagnostics.subscriberCount || 0);
        const bufferedEvents = Number(diagnostics.bufferedEvents || 0);
        const replayInFlight = diagnostics.bufferReplayInFlight === true;
        if (subscriberCount <= 0) {
          markDiscoveryLocalPartitionCdcNoSubscriber(state, partitionId);
        }
        if (bufferedEvents > 0 || replayInFlight) {
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
      if (!(partitionIds instanceof Set) || partitionIds.size === 0) {
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
        if (raftRole.length > 0) {
          nodeState.replicaRoles.add(raftRole);
        }
        if (!isActiveVoterReadyPartitionReplica(serviceRow)) {
          nodeState.nonVoterPartitionIds.add(partitionId);
        }
        stateByNodeId.set(nodeId, nodeState);
      }
      return stateByNodeId;
    }
  }

  for (const methodName of Object.getOwnPropertyNames(
    AdminServiceDiscoveryReadinessContextMethods.prototype,
  )) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      AdminServiceDiscovery.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        AdminServiceDiscoveryReadinessContextMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignAdminServiceDiscoveryReadinessContextMethods};
