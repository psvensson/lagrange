const LOCAL_STR_AGEMS = 'ageMs=';
const LOCAL_STR_TIMEOUTMS = 'timeoutMs=';
const LOCAL_STR_CONSTRUCTOR = 'constructor';

function assignAdminServiceDiscoveryReplicaReadinessMethods(
  AdminServiceDiscovery,
  options = {},
) {
  const {
    ADMIN_CACHE_DUMP,
    ADMIN_SERVICE_DISCOVERY_LITERAL,
    BENCHMARK_ADMISSION_STATE,
    BENCHMARK_DEGRADATION_PRIORITY,
    BENCHMARK_DEGRADATION_STATE,
    CANONICAL_LEADER_ROUTING_GAP_STATE,
    COLUMN,
    DEFAULT_STEP_TIMEOUT_MS_BY_WORKFLOW_STEP,
    DISCOVERY_ROUTING_SNAPSHOT_FIELD,
    EMPTY_STRING,
    ENDPOINT_SYNC_HEALTH,
    NUM,
    REPLICA_OPERATION_TYPE,
    SERVICE_DISCOVERY_READINESS_REASON,
    SERVICE_DISCOVERY_REASON_DETAIL_SEPARATOR,
    TYPEOF,
    firstStringField,
    isReplicaOperationInFlight,
    isReplicaOperationStale,
    isReplicaOperationTerminalSuccess,
    normalizeReplicaOperationRecord,
    resolveCanonicalLeaderRoutingGapState,
    uniqueSorted,
  } = options;

  class AdminServiceDiscoveryReplicaReadinessMethods {
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
      const projectionReadiness =
        this.resolveServiceDiscoveryProjectionReadiness(
          nodeId,
          readinessContext,
        );
      const routingReady =
        healthyEndpoint &&
        this.isServiceDiscoveryProjectionServeReady(
          nodeId,
          readinessContext,
          projectionReadiness,
        );
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
        projectionReadiness,
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

    resolveServiceDiscoveryProjectionReadiness(nodeId, readinessContext) {
      const projectionReadinessByNodeId =
        readinessContext.projectionReadinessByNodeId;
      if (
        projectionReadinessByNodeId instanceof Map &&
        projectionReadinessByNodeId.has(nodeId)
      ) {
        return projectionReadinessByNodeId.get(nodeId) || null;
      }
      if (
        projectionReadinessByNodeId &&
        typeof projectionReadinessByNodeId === TYPEOF.OBJECT &&
        projectionReadinessByNodeId[nodeId]
      ) {
        return this.normalizeServiceDiscoveryProjectionReadiness(
          projectionReadinessByNodeId[nodeId],
        );
      }
      return null;
    }

    isServiceDiscoveryProjectionServeReady(
      nodeId,
      readinessContext,
      projectionReadiness,
    ) {
      if (projectionReadiness) {
        return projectionReadiness.lanes?.serve?.ready === true;
      }
      return readinessContext.activeNodeIds.has(nodeId);
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
    AdminServiceDiscoveryReplicaReadinessMethods.prototype,
  )) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      AdminServiceDiscovery.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        AdminServiceDiscoveryReplicaReadinessMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignAdminServiceDiscoveryReplicaReadinessMethods};
