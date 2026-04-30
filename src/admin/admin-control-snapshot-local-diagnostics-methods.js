const LOCAL_STR_CONSTRUCTOR = 'constructor';

function assignAdminControlSnapshotLocalDiagnosticsMethods(
  AdminControlSnapshot,
  options = {},
) {
  const {
    ADMIN_CACHE_DUMP,
    ADMIN_CONTROL_SNAPSHOT,
    ADMIN_CONTROL_SNAPSHOT_LITERAL,
    ADMIN_ERROR_MESSAGE,
    ADMIN_OPERATIONAL_DIAGNOSTICS,
    CDC_TELEMETRY_MODE,
    COLUMN,
    NUM,
    PARTITION_STATE_UNKNOWN,
    SERVICE_TYPE_PARTITION,
    SQL_DIAGNOSTICS_REPLICA_COUNT,
    STATUS_ACTIVE,
    TABLES,
    TIME_MS,
    TYPEOF,
    firstStringField,
    toNonNegativeInteger,
    uniqueSorted,
  } = options;
  class AdminControlSnapshotLocalDiagnosticsMethods {
    buildLocalCdcTelemetry() {
      const partitionServices = this.resolveLocalPartitionServices ?
        this.resolveLocalPartitionServices() :
        null;
      let subscriberCount = NUM.ZERO;
      let bufferedEvents = NUM.ZERO;
      let catchupLagEvents = NUM.ZERO;
      const catchupThroughputEventsPerSec = NUM.ZERO;
      let catchupDetected = false;
      if (partitionServices instanceof Map) {
        for (const partitionService of partitionServices.values()) {
          if (
            !partitionService ||
            typeof partitionService.getCDCSubscriptionDiagnostics !==
              TYPEOF.FUNCTION
          ) {
            continue;
          }
          const diagnostics = partitionService.getCDCSubscriptionDiagnostics();
          if (!diagnostics || typeof diagnostics !== TYPEOF.OBJECT) {
            continue;
          }
          const partitionSubscriberCount = Number(
            diagnostics.subscriberCount || NUM.ZERO,
          );
          const partitionBufferedEvents = Number(
            diagnostics.bufferedEvents || NUM.ZERO,
          );
          subscriberCount += partitionSubscriberCount;
          bufferedEvents += partitionBufferedEvents;
          catchupLagEvents = Math.max(
            catchupLagEvents,
            partitionBufferedEvents,
          );
          if (
            partitionBufferedEvents > NUM.ZERO ||
            diagnostics.bufferReplayInFlight === true
          ) {
            catchupDetected = true;
          }
        }
      }
      const authoritativeFallback =
        typeof this.cdcIntegrationService
          ?.getAuthoritativeFallbackDiagnostics === TYPEOF.FUNCTION ?
          this.cdcIntegrationService.getAuthoritativeFallbackDiagnostics() :
          {
            schemaVersion: NUM.ONE,
            nodeId: this.nodeId,
            windowMs: TIME_MS.MINUTE,
            totalCount: NUM.ZERO,
            windowCount: NUM.ZERO,
            windowRatePerMinute: NUM.ZERO,
            phases: {
              bootstrap: {
                windowCount: NUM.ZERO,
                totalCount: NUM.ZERO,
              },
              recovery: {
                windowCount: NUM.ZERO,
                totalCount: NUM.ZERO,
              },
              steady_state: {
                windowCount: NUM.ZERO,
                totalCount: NUM.ZERO,
              },
            },
            outcomes: {
              recovered: {
                windowCount: NUM.ZERO,
                totalCount: NUM.ZERO,
              },
              failed: {
                windowCount: NUM.ZERO,
                totalCount: NUM.ZERO,
              },
            },
            byTable: {},
            recentEvents: ADMIN_CACHE_DUMP.EMPTY,
          };
      return {
        subscriberCount,
        bufferedEvents,
        catchupLagEvents,
        catchupThroughputEventsPerSec,
        mode: catchupDetected ?
          CDC_TELEMETRY_MODE.CATCHUP :
          CDC_TELEMETRY_MODE.STEADY,
        authoritativeFallback,
      };
    }
    /**
     * Build node-local CDC diagnostics payload.
     * @return {Object}
     */
    buildLocalCdcDiagnostics() {
      if (
        !this.systemTableCache ||
        typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION
      ) {
        throw new Error(ADMIN_ERROR_MESSAGE.CDC_DIAGNOSTICS_UNAVAILABLE);
      }
      const capturedAt = this.nowFn();
      const partitionRows = this.systemTableCache.getAll(TABLES.PARTITIONS);
      const clusterPartitionIds = uniqueSorted(
        partitionRows
          .map((row) =>
            firstStringField(row, COLUMN.PARTITION_ID, 'partitionId', 'id'),
          )
          .filter(Boolean),
      );
      const partitionDiagnosticsById = {};
      const missingDiagnosticsPartitionIds = [];
      const noSubscriberPartitionIds = [];
      const bufferedPartitionIds = [];
      const partitionServices = this.resolveLocalPartitionServices ?
        this.resolveLocalPartitionServices() :
        null;
      if (partitionServices instanceof Map) {
        for (const [
          partitionServiceKey,
          partitionService,
        ] of partitionServices.entries()) {
          const partitionId =
            firstStringField(
              partitionService,
              COLUMN.PARTITION_ID,
              'partitionId',
              'id',
            ) || String(partitionServiceKey || '');
          if (!partitionId) {
            continue;
          }
          if (
            !partitionService ||
            typeof partitionService.getCDCSubscriptionDiagnostics !==
              TYPEOF.FUNCTION
          ) {
            partitionDiagnosticsById[partitionId] = {
              diagnosticsAvailable: false,
              ready: false,
              subscriberCount: NUM.ZERO,
              bufferedEvents: NUM.ZERO,
              bufferReplayInFlight: false,
            };
            missingDiagnosticsPartitionIds.push(partitionId);
            continue;
          }
          const diagnostics = partitionService.getCDCSubscriptionDiagnostics();
          if (!diagnostics || typeof diagnostics !== TYPEOF.OBJECT) {
            partitionDiagnosticsById[partitionId] = {
              diagnosticsAvailable: false,
              ready: false,
              subscriberCount: NUM.ZERO,
              bufferedEvents: NUM.ZERO,
              bufferReplayInFlight: false,
            };
            missingDiagnosticsPartitionIds.push(partitionId);
            continue;
          }
          const subscriberCount = toNonNegativeInteger(
            diagnostics.subscriberCount,
          );
          const bufferedEvents = toNonNegativeInteger(
            diagnostics.bufferedEvents,
          );
          const bufferReplayInFlight =
            diagnostics.bufferReplayInFlight === true;
          const ready =
            subscriberCount > NUM.ZERO &&
            bufferedEvents === NUM.ZERO &&
            bufferReplayInFlight !== true;
          partitionDiagnosticsById[partitionId] = {
            diagnosticsAvailable: true,
            ready,
            subscriberCount,
            bufferedEvents,
            bufferReplayInFlight,
            diagnostics,
          };
          if (subscriberCount <= NUM.ZERO) {
            noSubscriberPartitionIds.push(partitionId);
          }
          if (bufferedEvents > NUM.ZERO || bufferReplayInFlight === true) {
            bufferedPartitionIds.push(partitionId);
          }
        }
      }
      const localPartitionIds = uniqueSorted(
        Object.keys(partitionDiagnosticsById),
      );
      const diagnosticsAvailablePartitionCount = Object.values(
        partitionDiagnosticsById,
      ).filter((entry) => entry?.diagnosticsAvailable === true).length;
      const readyLocalPartitionCount = Object.values(
        partitionDiagnosticsById,
      ).filter((entry) => entry?.ready === true).length;
      return {
        schemaVersion: ADMIN_OPERATIONAL_DIAGNOSTICS.CDC_SCHEMA_VERSION,
        nodeId: this.nodeId,
        capturedAt,
        telemetry: this.buildLocalCdcTelemetry(),
        clusterPartitionCount: clusterPartitionIds.length,
        clusterPartitionIds,
        localPartitionCount: localPartitionIds.length,
        localPartitionIds,
        diagnosticsAvailablePartitionCount,
        readyLocalPartitionCount,
        missingDiagnosticsPartitionIds: uniqueSorted(
          missingDiagnosticsPartitionIds,
        ),
        noSubscriberPartitionIds: uniqueSorted(noSubscriberPartitionIds),
        bufferedPartitionIds: uniqueSorted(bufferedPartitionIds),
        partitionDiagnosticsById,
      };
    }
    /**
     * Build node-local partition diagnostics payload.
     * @return {Object}
     */
    buildLocalPartitionDiagnostics() {
      if (
        !this.systemTableCache ||
        typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION
      ) {
        throw new Error(ADMIN_ERROR_MESSAGE.PARTITION_DIAGNOSTICS_UNAVAILABLE);
      }
      const capturedAt = this.nowFn();
      const partitionRows = this.systemTableCache.getAll(TABLES.PARTITIONS);
      const serviceRows = this.systemTableCache.getAll(TABLES.SERVICES);
      const replicaOperationRows = this.systemTableCache.getAll(
        TABLES.REPLICA_OPERATIONS,
      );
      const leaderSummary = this.buildControlSnapshotLeaderSummary(
        partitionRows,
        serviceRows,
      );
      const voterCounts = this.buildControlSnapshotVoterCounts(serviceRows);
      const replicaOperations =
        this.buildControlSnapshotReplicaOperationSummary(replicaOperationRows);
      const partitionMetadataById = {};
      for (const partitionRow of partitionRows) {
        const partitionId = firstStringField(
          partitionRow,
          COLUMN.PARTITION_ID,
          'partitionId',
          'id',
        );
        if (!partitionId) {
          continue;
        }
        partitionMetadataById[partitionId] = {
          tableId: firstStringField(
            partitionRow,
            COLUMN.TABLE_ID,
            ADMIN_CONTROL_SNAPSHOT_LITERAL.TABLEID,
          ),
          tableName: firstStringField(
            partitionRow,
            ADMIN_CONTROL_SNAPSHOT_LITERAL.TABLE_NAME,
            ADMIN_CONTROL_SNAPSHOT_LITERAL.TABLENAME,
          ),
          state: firstStringField(
            partitionRow,
            COLUMN.STATE,
            ADMIN_CONTROL_SNAPSHOT_LITERAL.PARTITIONSTATE,
          ),
        };
      }
      const replicasByPartitionId = {};
      for (const serviceRow of serviceRows) {
        const serviceType = firstStringField(
          serviceRow,
          COLUMN.SERVICE_TYPE,
          'type',
          'serviceType',
        );
        if (serviceType !== SERVICE_TYPE_PARTITION) {
          continue;
        }
        const partitionId = firstStringField(
          serviceRow,
          COLUMN.PARTITION_ID,
          'partitionId',
          'id',
        );
        if (!partitionId) {
          continue;
        }
        replicasByPartitionId[partitionId] =
          replicasByPartitionId[partitionId] || [];
        replicasByPartitionId[partitionId].push({
          replicaId: firstStringField(
            serviceRow,
            COLUMN.REPLICA_ID,
            COLUMN.SERVICE_ID,
            ADMIN_CONTROL_SNAPSHOT_LITERAL.REPLICAID,
            ADMIN_CONTROL_SNAPSHOT_LITERAL.ID,
          ),
          nodeId: firstStringField(
            serviceRow,
            COLUMN.NODE_ID,
            ADMIN_CONTROL_SNAPSHOT_LITERAL.NODEID,
          ),
          raftRole: firstStringField(
            serviceRow,
            COLUMN.RAFT_ROLE,
            ADMIN_CONTROL_SNAPSHOT_LITERAL.RAFTROLE,
          ),
          status: firstStringField(
            serviceRow,
            COLUMN.STATUS,
            ADMIN_CONTROL_SNAPSHOT_LITERAL.STATUS,
          ),
          address: firstStringField(
            serviceRow,
            COLUMN.ADDRESS,
            ADMIN_CONTROL_SNAPSHOT_LITERAL.ADDRESS,
          ),
        });
      }
      const partitionIds = uniqueSorted([
        ...Object.keys(partitionMetadataById),
        ...Object.keys(replicasByPartitionId),
      ]);
      const partitionsById = {};
      for (const partitionId of partitionIds) {
        const metadata = partitionMetadataById[partitionId] || {};
        const replicas =
          replicasByPartitionId[partitionId] || ADMIN_CACHE_DUMP.EMPTY;
        const activeReplicaCount = replicas.filter(
          (replica) =>
            String(replica?.status || '').toLowerCase() === STATUS_ACTIVE,
        ).length;
        partitionsById[partitionId] = {
          partitionId,
          tableId: metadata.tableId || null,
          tableName: metadata.tableName || null,
          state: metadata.state || PARTITION_STATE_UNKNOWN,
          leaderNodeId: leaderSummary.leaders[partitionId] || null,
          voterCount: toNonNegativeInteger(voterCounts[partitionId]),
          replicaCount: replicas.length,
          activeReplicaCount,
          replicaRoles: leaderSummary.replicaRoles[partitionId] || {},
          replicaRoleDiagnostics: leaderSummary.replicaRoleDiagnostics[
            partitionId
          ] || {
            canonicalLeaderNodeId: null,
            source: TABLES.PARTITIONS,
            inconsistentReplicaRoles: false,
            replicaLeaderNodeIds: ADMIN_CACHE_DUMP.EMPTY,
            issues: ADMIN_CACHE_DUMP.EMPTY,
          },
          replicas,
        };
      }
      return {
        schemaVersion: ADMIN_OPERATIONAL_DIAGNOSTICS.PARTITION_SCHEMA_VERSION,
        nodeId: this.nodeId,
        capturedAt,
        partitionCount: partitionIds.length,
        leaders: leaderSummary.leaders,
        voterCounts,
        replicaRoleDiagnostics: leaderSummary.replicaRoleDiagnostics,
        replicaOperations,
        partitionsById,
      };
    }
    /**
     * Build node-local cluster SQL diagnostics payload.
     * @return {Object}
     */
    buildLocalSqlDiagnostics() {
      if (
        !this.systemTableCache ||
        typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION
      ) {
        throw new Error(ADMIN_ERROR_MESSAGE.SQL_DIAGNOSTICS_UNAVAILABLE);
      }
      const capturedAt = this.nowFn();
      const nodeRows = this.systemTableCache.getAll(TABLES.NODES);
      const partitionRows = this.systemTableCache.getAll(TABLES.PARTITIONS);
      const tableRows = this.systemTableCache.getAll(TABLES.TABLES);
      const sqlQueryEngine = this.sqlQueryEngine;
      const queryEngineAvailable = Boolean(
        sqlQueryEngine &&
        typeof sqlQueryEngine.executeRequest === TYPEOF.FUNCTION,
      );
      const queryExecutor = sqlQueryEngine?.queryExecutor || null;
      const lastCoordinatorMetrics =
        queryExecutor &&
        typeof queryExecutor.getLastCoordinatorMetrics === TYPEOF.FUNCTION ?
          queryExecutor.getLastCoordinatorMetrics() :
          null;
      let provisionTargetDiagnostics = null;
      if (
        sqlQueryEngine &&
        typeof sqlQueryEngine.resolveProvisionTargetNodeIdsWithDiagnostics ===
          TYPEOF.FUNCTION
      ) {
        const diagnosticsResult =
          sqlQueryEngine.resolveProvisionTargetNodeIdsWithDiagnostics(
            SQL_DIAGNOSTICS_REPLICA_COUNT,
          );
        if (
          diagnosticsResult?.diagnostics &&
          typeof diagnosticsResult.diagnostics === TYPEOF.OBJECT
        ) {
          provisionTargetDiagnostics = diagnosticsResult.diagnostics;
        }
      } else if (
        sqlQueryEngine &&
        typeof sqlQueryEngine.resolveProvisionTargetNodeDiagnostics ===
          TYPEOF.FUNCTION
      ) {
        provisionTargetDiagnostics =
          sqlQueryEngine.resolveProvisionTargetNodeDiagnostics(
            SQL_DIAGNOSTICS_REPLICA_COUNT,
          );
      }
      const activeNodeCount = nodeRows.filter(
        (row) =>
          String(
            firstStringField(row, COLUMN.STATUS, 'state') || '',
          ).toLowerCase() === STATUS_ACTIVE,
      ).length;
      return {
        schemaVersion: ADMIN_OPERATIONAL_DIAGNOSTICS.SQL_SCHEMA_VERSION,
        nodeId: this.nodeId,
        capturedAt,
        queryEngineAvailable,
        cluster: {
          nodeCount: nodeRows.length,
          activeNodeCount,
          partitionCount: partitionRows.length,
          tableCount: tableRows.length,
        },
        queryEngine: {
          timeoutMs: Number.isFinite(Number(sqlQueryEngine?.queryTimeoutMs)) ?
            Number(sqlQueryEngine.queryTimeoutMs) :
            null,
          fanoutMetricsAvailable: lastCoordinatorMetrics !== null,
          lastCoordinatorMetrics,
          provisionTargetDiagnostics,
          transactionRecovery:
            sqlQueryEngine?.lastTransactionRecoveryReplayResult &&
            typeof sqlQueryEngine.lastTransactionRecoveryReplayResult ===
              TYPEOF.OBJECT ?
              sqlQueryEngine.lastTransactionRecoveryReplayResult :
              null,
          trackedWriteSplitEvaluations:
            sqlQueryEngine?.lastWriteSplitEvaluationByTable instanceof Map ?
              sqlQueryEngine.lastWriteSplitEvaluationByTable.size :
              NUM.ZERO,
        },
        splitEvaluation: this.resolveSplitEvaluationDiagnostics(),
      };
    }
    /**
     * Build canonical query_result payload for control snapshot
     * query.
     * @param {Object} [options={}]
     * @return {Object}
     */
    async buildControlSnapshotQueryResult(options = {}) {
      const forceAuthoritativeRepair =
        options.forceAuthoritativeRepair === true;
      const snapshot = await this.resolveLocalControlSnapshot(
        forceAuthoritativeRepair ?
          {
            forceAuthoritativeRepair: true,
            allowAuthoritativeRepair: options.allowAuthoritativeRepair,
            allowAuthoritativeReadinessRefresh:
                options.allowAuthoritativeReadinessRefresh,
            allowStaleReadinessOnCacheChange:
                options.allowStaleReadinessOnCacheChange,
          } :
          {
            allowAuthoritativeRepair: options.allowAuthoritativeRepair,
            allowAuthoritativeReadinessRefresh:
                options.allowAuthoritativeReadinessRefresh,
            allowStaleReadinessOnCacheChange:
                options.allowStaleReadinessOnCacheChange,
          },
      );
      return {
        success: true,
        rows: [snapshot],
        count: NUM.ONE,
        partitions: ADMIN_CACHE_DUMP.EMPTY,
        tableName: ADMIN_CONTROL_SNAPSHOT.TABLE_NAME,
      };
    }
  }
  for (const methodName of Object.getOwnPropertyNames(
    AdminControlSnapshotLocalDiagnosticsMethods.prototype,
  )) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      AdminControlSnapshot.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        AdminControlSnapshotLocalDiagnosticsMethods.prototype,
        methodName,
      ),
    );
  }
}
export {assignAdminControlSnapshotLocalDiagnosticsMethods};
