const LOCAL_STR_CONSTRUCTOR = 'constructor';
const CONTROL_SNAPSHOT_DEFER_INLINE_OWNER_COMMAND_FIELD =
  'deferInlineOwnerCommand';
const BOUNDED_SNAPSHOT_PROBE_DEADLINE_SENTINEL = Symbol(
  'boundedSnapshotProbeDeadline',
);
const BOUNDED_SNAPSHOT_PROBE_MIN_DEADLINE_MS = 2000;
const BOUNDED_SNAPSHOT_PROBE_DEADLINE_SAFETY_MARGIN_MS = 2000;
const BOUNDED_SNAPSHOT_PROBE_SHORT_BUDGET_DIVISOR = 2;
const BOUNDED_SNAPSHOT_PROBE_MIN_SHORT_DEADLINE_MS = 1;

function resolveBoundedSnapshotProbeDeadlineMs(queryTimeoutMs) {
  if (!Number.isFinite(queryTimeoutMs) || queryTimeoutMs <= 0) {
    return 0;
  }
  const flooredQueryTimeoutMs = Math.floor(queryTimeoutMs);
  if (flooredQueryTimeoutMs <= 0) {
    return 0;
  }
  if (
    flooredQueryTimeoutMs <=
    BOUNDED_SNAPSHOT_PROBE_MIN_DEADLINE_MS +
      BOUNDED_SNAPSHOT_PROBE_DEADLINE_SAFETY_MARGIN_MS
  ) {
    return Math.max(
      BOUNDED_SNAPSHOT_PROBE_MIN_SHORT_DEADLINE_MS,
      Math.floor(
        flooredQueryTimeoutMs /
          BOUNDED_SNAPSHOT_PROBE_SHORT_BUDGET_DIVISOR,
      ),
    );
  }
  const marginBoundedMs =
    flooredQueryTimeoutMs - BOUNDED_SNAPSHOT_PROBE_DEADLINE_SAFETY_MARGIN_MS;
  const halfBudgetMs = Math.max(
    BOUNDED_SNAPSHOT_PROBE_MIN_DEADLINE_MS,
    Math.floor(flooredQueryTimeoutMs / 2),
  );
  return Math.min(marginBoundedMs, halfBudgetMs);
}

function buildControlSnapshotResolveOptions(options = {}) {
  const forceAuthoritativeRepair = options.forceAuthoritativeRepair === true;
  return {
    ...(forceAuthoritativeRepair ?
      {forceAuthoritativeRepair: true} :
      {}),
    allowAuthoritativeRepair: options.allowAuthoritativeRepair,
    ...(!forceAuthoritativeRepair ?
      {[CONTROL_SNAPSHOT_DEFER_INLINE_OWNER_COMMAND_FIELD]: true} :
      {}),
    boundedObservationProbe: !forceAuthoritativeRepair,
    queryTimeoutMs: options.queryTimeoutMs,
    allowAuthoritativeReadinessRefresh:
        options.allowAuthoritativeReadinessRefresh,
    allowStaleReadinessOnCacheChange:
        options.allowStaleReadinessOnCacheChange,
    allowAuthoritativePublishedMembershipRecovery:
        options.allowAuthoritativePublishedMembershipRecovery === true,
    ignorePreRestart: options.ignorePreRestart === true,
  };
}

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
    PARTITION_STATE_UNKNOWN,
    SERVICE_TYPE_PARTITION,
    SQL_DIAGNOSTICS_REPLICA_COUNT,
    STATUS_ACTIVE,
    TABLES,
    TIME_MS,
    firstStringField,
    toNonNegativeInteger,
    uniqueSorted,
  } = options;
  class AdminControlSnapshotLocalDiagnosticsMethods {
    buildLocalCdcTelemetry() {
      const partitionServices = this.resolveLocalPartitionServices ?
        this.resolveLocalPartitionServices() :
        null;
      let subscriberCount = 0;
      let bufferedEvents = 0;
      let catchupLagEvents = 0;
      const catchupThroughputEventsPerSec = 0;
      let catchupDetected = false;
      if (partitionServices instanceof Map) {
        for (const partitionService of partitionServices.values()) {
          if (
            !partitionService ||
            typeof partitionService.getCDCSubscriptionDiagnostics !==
              'function'
          ) {
            continue;
          }
          const diagnostics = partitionService.getCDCSubscriptionDiagnostics();
          if (!diagnostics || typeof diagnostics !== 'object') {
            continue;
          }
          const partitionSubscriberCount = Number(
            diagnostics.subscriberCount || 0,
          );
          const partitionBufferedEvents = Number(
            diagnostics.bufferedEvents || 0,
          );
          subscriberCount += partitionSubscriberCount;
          bufferedEvents += partitionBufferedEvents;
          catchupLagEvents = Math.max(
            catchupLagEvents,
            partitionBufferedEvents,
          );
          if (
            partitionBufferedEvents > 0 ||
            diagnostics.bufferReplayInFlight === true
          ) {
            catchupDetected = true;
          }
        }
      }
      const authoritativeFallback =
        typeof this.cdcIntegrationService
          ?.getAuthoritativeFallbackDiagnostics === 'function' ?
          this.cdcIntegrationService.getAuthoritativeFallbackDiagnostics() :
          {
            schemaVersion: 1,
            nodeId: this.nodeId,
            windowMs: TIME_MS.MINUTE,
            totalCount: 0,
            windowCount: 0,
            windowRatePerMinute: 0,
            phases: {
              bootstrap: {
                windowCount: 0,
                totalCount: 0,
              },
              recovery: {
                windowCount: 0,
                totalCount: 0,
              },
              steady_state: {
                windowCount: 0,
                totalCount: 0,
              },
            },
            outcomes: {
              recovered: {
                windowCount: 0,
                totalCount: 0,
              },
              failed: {
                windowCount: 0,
                totalCount: 0,
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
        typeof this.systemTableCache.getAll !== 'function'
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
              'function'
          ) {
            partitionDiagnosticsById[partitionId] = {
              diagnosticsAvailable: false,
              ready: false,
              subscriberCount: 0,
              bufferedEvents: 0,
              bufferReplayInFlight: false,
            };
            missingDiagnosticsPartitionIds.push(partitionId);
            continue;
          }
          const diagnostics = partitionService.getCDCSubscriptionDiagnostics();
          if (!diagnostics || typeof diagnostics !== 'object') {
            partitionDiagnosticsById[partitionId] = {
              diagnosticsAvailable: false,
              ready: false,
              subscriberCount: 0,
              bufferedEvents: 0,
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
            subscriberCount > 0 &&
            bufferedEvents === 0 &&
            bufferReplayInFlight !== true;
          partitionDiagnosticsById[partitionId] = {
            diagnosticsAvailable: true,
            ready,
            subscriberCount,
            bufferedEvents,
            bufferReplayInFlight,
            diagnostics,
          };
          if (subscriberCount <= 0) {
            noSubscriberPartitionIds.push(partitionId);
          }
          if (bufferedEvents > 0 || bufferReplayInFlight === true) {
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
        typeof this.systemTableCache.getAll !== 'function'
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
        typeof this.systemTableCache.getAll !== 'function'
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
        typeof sqlQueryEngine.executeRequest === 'function',
      );
      const queryExecutor = sqlQueryEngine?.queryExecutor || null;
      const lastCoordinatorMetrics =
        queryExecutor &&
        typeof queryExecutor.getLastCoordinatorMetrics === 'function' ?
          queryExecutor.getLastCoordinatorMetrics() :
          null;
      let provisionTargetDiagnostics = null;
      if (
        sqlQueryEngine &&
        typeof sqlQueryEngine.resolveProvisionTargetNodeIdsWithDiagnostics ===
          'function'
      ) {
        const diagnosticsResult =
          sqlQueryEngine.resolveProvisionTargetNodeIdsWithDiagnostics(
            SQL_DIAGNOSTICS_REPLICA_COUNT,
          );
        if (
          diagnosticsResult?.diagnostics &&
          typeof diagnosticsResult.diagnostics === 'object'
        ) {
          provisionTargetDiagnostics = diagnosticsResult.diagnostics;
        }
      } else if (
        sqlQueryEngine &&
        typeof sqlQueryEngine.resolveProvisionTargetNodeDiagnostics ===
          'function'
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
              'object' ?
              sqlQueryEngine.lastTransactionRecoveryReplayResult :
              null,
          trackedWriteSplitEvaluations:
            sqlQueryEngine?.lastWriteSplitEvaluationByTable instanceof Map ?
              sqlQueryEngine.lastWriteSplitEvaluationByTable.size :
              0,
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
      const resolveOptions = buildControlSnapshotResolveOptions(options);
      const snapshot =
        await this.resolveBoundedLocalControlSnapshot(resolveOptions);
      return {
        success: true,
        rows: [snapshot],
        count: 1,
        partitions: ADMIN_CACHE_DUMP.EMPTY,
        tableName: ADMIN_CONTROL_SNAPSHOT.TABLE_NAME,
      };
    }

    async resolveBoundedLocalControlSnapshot(resolveOptions = {}) {
      if (resolveOptions.forceAuthoritativeRepair === true) {
        return this.resolveLocalControlSnapshot(resolveOptions);
      }
      const deadlineMs = resolveBoundedSnapshotProbeDeadlineMs(
        resolveOptions.queryTimeoutMs,
      );
      if (deadlineMs <= 0) {
        return this.resolveLocalControlSnapshot(resolveOptions);
      }
      let deadlineTimer = null;
      const resolvePromise = Promise.resolve(
        this.resolveLocalControlSnapshot(resolveOptions),
      );
      resolvePromise.catch(() => {});
      const deadlinePromise = new Promise((resolve) => {
        deadlineTimer = setTimeout(() => {
          resolve(BOUNDED_SNAPSHOT_PROBE_DEADLINE_SENTINEL);
        }, deadlineMs);
      });
      try {
        const raced = await Promise.race([resolvePromise, deadlinePromise]);
        if (raced !== BOUNDED_SNAPSHOT_PROBE_DEADLINE_SENTINEL) {
          return raced;
        }
        const boundedSnapshot = await this.buildLocalControlSnapshot({
          ...resolveOptions,
          boundedObservationProbe: true,
        });
        return await this.scheduleBoundedMembershipPublicationReconcile(
          boundedSnapshot,
          resolveOptions,
        );
      } finally {
        if (deadlineTimer) {
          clearTimeout(deadlineTimer);
        }
      }
    }

    // When the diagnostic probe degrades to its bounded/cache-only fallback the
    // full resolve (which normally drives the membership-publication owner
    // reconcile as a side effect) is abandoned. Under sustained transport
    // saturation that side effect may never run, so the owner publishes its
    // epoch but never reconciles the remaining active nodes into the published
    // set -> publication_convergence_blocked / consumer_lag forever (the lost
    // wakeup formalised in models/readiness-starvation/PublicationConvergence
    // .tla). Drive the owner reconcile from an independent, BOUNDED
    // owner-command instead: deferInlineOwnerCommand routes the reconcile
    // through the non-blocking enqueue fallback, so it advances convergence
    // even while the read probe is bounded. It is a no-op unless the bounded
    // snapshot's diagnostics already carry the owner-reconcile signal.
    async scheduleBoundedMembershipPublicationReconcile(
      boundedSnapshot,
      resolveOptions = {},
    ) {
      if (
        typeof this.triggerMembershipPublicationHandoffOwnerCommand !==
        'function'
      ) {
        return boundedSnapshot;
      }
      return await this.triggerMembershipPublicationHandoffOwnerCommand(
        boundedSnapshot,
        {
          ...resolveOptions,
          [CONTROL_SNAPSHOT_DEFER_INLINE_OWNER_COMMAND_FIELD]: true,
        },
      );
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
