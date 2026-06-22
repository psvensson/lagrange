const LOCAL_STR_CONSTRUCTOR = 'constructor';

// Sanctioned local-only-truth seed literal for the priority control-plane
// operation-row analog of CL-016/CL-035. See applyLocalPriorityOperationProgressRow.
const PRIORITY_LOCAL_PROGRESS_LITERAL = Object.freeze({
  UPSERT: 'UPSERT',
  CAUSE_PREFIX: 'priority-local-progress:',
});

function assignReplicaOperationRepositoryRowMethods(
  ReplicaOperationRepository,
  options = {},
) {
  const {
    NUM,
    OPERATION_METADATA_KEY,
    OperationType,
    REBALANCE_COORDINATOR_LOG_MSG,
    REPLICA_OPERATION_REPOSITORY_LITERAL,
    REPLICA_OPERATION_SEMANTIC_PHASE,
    ReplicaOperationField,
    SERVICE_TYPE,
    SYSTEM_TABLE_NAME,
    TYPEOF,
    WORKFLOW_STEP,
    buildReplicaOperationSemanticWitnesses,
    getOperationMetadataObject,
    getOperationMetadataString,
    getOperationMetadataStringArray,
    isPriorityControlPlanePartition,
    isReplaceRemoveDispatchPhase,
    isSystemTablePartition,
    isTerminalReplicaOperationRecord,
    resolveReplicaOperationSemanticPhase,
  } = options;

  class ReplicaOperationRepositoryRowMethods {
  /**
   * Translate a raw SQL/cache row into a normalized operation object.
   * @param {object} row
   * @return {object}
   */
  rowToOperation(row) {
    let stepsHistory = [];
    if (row.steps_history) {
      try {
        stepsHistory = JSON.parse(row.steps_history);
      } catch (error) {
        this.logger.error(REBALANCE_COORDINATOR_LOG_MSG.STEPS_HISTORY_PARSE_ERROR, {
          operationId: row.operation_id,
          error: error.message,
        });
        stepsHistory = [];
      }
    }
    const operation = {
      operationId: row.operation_id,
      type: row.type,
      partitionId: row.partition_id,
      entityType: row.entity_type || SERVICE_TYPE.PARTITION,
      entityId: row.entity_id || row.partition_id,
      replicaId: row.replica_id,
      sourceNodeId: row.source_node_id,
      targetNodeId: row.target_node_id,
      status: row.status,
      workflowStep: row.workflow_step,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      errorMessage: row.error_message,
      stepsHistory,
    };
    operation.semanticPhase = resolveReplicaOperationSemanticPhase(
      operation.type,
      operation.workflowStep,
      operation.status,
    );
    operation.witnesses = buildReplicaOperationSemanticWitnesses(
      operation.type,
      operation.workflowStep,
      operation.status,
    );
    operation.sourceReplicaId = this.getReplaceSourceReplicaId(operation);
    const replicaIds = getOperationMetadataStringArray(
      stepsHistory,
      OPERATION_METADATA_KEY.REPLICA_IDS,
    );
    if (replicaIds.length > NUM.ZERO) {
      operation[ReplicaOperationField.REPLICA_IDS] = replicaIds;
    }
    const peerAddresses = getOperationMetadataStringArray(
      stepsHistory,
      OPERATION_METADATA_KEY.PEER_ADDRESSES,
    );
    if (peerAddresses.length > NUM.ZERO) {
      operation[ReplicaOperationField.PEER_ADDRESSES] = peerAddresses;
    }
    const bootstrapTableMetadata = getOperationMetadataObject(
      stepsHistory,
      OPERATION_METADATA_KEY.BOOTSTRAP_TABLE_METADATA,
    );
    if (bootstrapTableMetadata) {
      operation[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] = bootstrapTableMetadata;
    }
    const bootstrapPartitionMetadata = getOperationMetadataObject(
      stepsHistory,
      OPERATION_METADATA_KEY.BOOTSTRAP_PARTITION_METADATA,
    );
    if (bootstrapPartitionMetadata) {
      operation[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA] = bootstrapPartitionMetadata;
    }
    return operation;
  }
  /**
   * Check whether an operation is in a terminal state.
   * Accepts both translated operation objects and raw rows.
   * @param {object} operation
   * @return {boolean}
   */
  isOperationTerminal(operation) {
    if (!operation) {
      return false;
    }
    return isTerminalReplicaOperationRecord(operation);
  }
  /**
   * Resolve the owner node ID from an operation or raw row.
   * @param {object} operation
   * @return {string|null}
   */
  resolveOperationOwnerNodeId(operation) {
    const partitionId = String(operation?.partitionId || operation?.partition_id || '');
    const sourceNodeId = String(operation?.sourceNodeId || operation?.source_node_id || '');
    const targetNodeId = String(operation?.targetNodeId || operation?.target_node_id || '');
    const semanticPhase =
      operation?.semanticPhase ||
      resolveReplicaOperationSemanticPhase(
        operation?.type || null,
        operation?.workflowStep || operation?.workflow_step || null,
        operation?.status || null,
      );
    const isUnsettledReplace =
      operation?.type === OperationType.REPLACE &&
      targetNodeId.length > NUM.ZERO &&
      semanticPhase !== REPLICA_OPERATION_SEMANTIC_PHASE.SETTLED &&
      semanticPhase !== REPLICA_OPERATION_SEMANTIC_PHASE.FAILED;
    const isSystemReplace =
      isUnsettledReplace &&
      isSystemTablePartition({partitionId});
    const isPriorityReplace =
      isUnsettledReplace &&
      isPriorityControlPlanePartition({partitionId});
    if (isSystemReplace || isPriorityReplace) {
      // Keep canonical ownership on the target from initial dispatch through
      // source removal so the replacement host can survive transient source
      // loss without handing ownership back to a degraded source.
      return targetNodeId;
    }
    if (sourceNodeId.length > NUM.ZERO) {
      return sourceNodeId;
    }
    if (targetNodeId.length > NUM.ZERO) {
      return targetNodeId;
    }
    return null;
  }
  /**
   * Check whether an operation is owned by this node.
   * @param {object} operation
   * @return {boolean}
   */
  isOperationLocallyOwned(operation) {
    return this.resolveOperationOwnerNodeId(operation) === this.nodeId;
  }
  /**
   * Seed the owner's locally-decided operation-row truth into the LOCAL cache
   * when the durable replica_operations write defers under formation/recovery
   * pressure (the write routes through the very control-plane partition being
   * spread, so it cannot land within budget). Without this, the durable
   * workflow_step the system cache projects — and that every other reader and
   * downstream gate observes — stalls at the pre-deferral step forever even
   * though the owner has locally advanced the operation, deadlocking control-
   * plane spread during 2-node+ formation.
   *
   * This is the replica_operations-row analog of the sanctioned SERVICES-row
   * seeds CL-016 (priority local-commit fallback) and CL-035 (raft_role seed):
   * scoped to owner-local priority control-plane partitions and superseded
   * later by the durable write's CDC round-trip (newer updated_at wins in the
   * cache merge). The durable distributed write is NOT short-circuited — it
   * still retries and, once the partition reaches quorum, becomes the
   * authoritative cluster-wide truth.
   *
   * @param {object} operation - Projected operation snapshot to seed.
   * @return {boolean} Whether the local row was applied.
   */
  applyLocalPriorityOperationProgressRow(operation) {
    if (
      !operation ||
      !operation.operationId ||
      !operation.partitionId ||
      !this.systemTableCache ||
      typeof this.systemTableCache.applySystemTableChange !== TYPEOF.FUNCTION ||
      !isPriorityControlPlanePartition({partitionId: operation.partitionId}) ||
      !this.isOperationLocallyOwned(operation)
    ) {
      return false;
    }
    this.systemTableCache.applySystemTableChange(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      PRIORITY_LOCAL_PROGRESS_LITERAL.UPSERT,
      this.buildReplicaOperationRow(operation),
      {causeId: `${PRIORITY_LOCAL_PROGRESS_LITERAL.CAUSE_PREFIX}${operation.operationId}`},
    );
    return true;
  }
  /**
   * Extract the source replica ID for a REPLACE operation.
   * @param {object} operation
   * @return {string|null}
   */
  getReplaceSourceReplicaId(operation) {
    if (!operation || operation.type !== OperationType.REPLACE) {
      return null;
    }
    if (operation.sourceReplicaId) {
      return operation.sourceReplicaId;
    }
    if (!Array.isArray(operation.stepsHistory)) {
      return null;
    }
    return getOperationMetadataString(
      operation.stepsHistory,
      OPERATION_METADATA_KEY.SOURCE_REPLICA_ID,
    );
  }
  /**
   * Check whether a REPLACE operation is in the remove phase.
   * @param {object} operation
   * @return {boolean}
   */
  isReplaceRemovePhase(operation) {
    return (
      operation?.type === OperationType.REPLACE && operation?.workflowStep === WORKFLOW_STEP.ACTIVE
    );
  }
  /**
   * Check whether a REPLACE operation is currently dispatching source removal.
   * This includes the initial ACTIVE dispatch and STOPPING reconciliation
   * re-dispatch while removal completion is still being observed.
   * @param {object} operation
   * @return {boolean}
   */
  isReplaceRemoveDispatchPhase(operation) {
    return isReplaceRemoveDispatchPhase(operation);
  }
  /**
   * Extract the target replica ID for a REPLACE operation.
   * @param {object} operation
   * @return {string|null}
   */
  getReplaceTargetReplicaId(operation) {
    if (operation?.type !== OperationType.REPLACE) {
      return null;
    }
    const sourceReplicaId = this.getReplaceSourceReplicaId(operation);
    if (typeof sourceReplicaId !== TYPEOF.STRING || sourceReplicaId.length === NUM.ZERO) {
      return null;
    }
    if (typeof operation?.replicaId !== TYPEOF.STRING || operation.replicaId.length === NUM.ZERO) {
      return null;
    }
    if (operation.replicaId === sourceReplicaId) {
      return null;
    }
    return operation.replicaId;
  } // ── Cache Read Methods ──────────────────────────────────────────
  /**
   * Get a single replica_operations row from cache by operation ID.
   * @param {string} operationId
   * @return {object|null}
   */
  getReplicaOperationRowFromCache(operationId) {
    if (!this.systemTableCache || !operationId) {
      return null;
    }
    if (typeof this.systemTableCache.get === TYPEOF.FUNCTION) {
      return this.systemTableCache.get(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, operationId) || null;
    }
    if (typeof this.systemTableCache.getAll === TYPEOF.FUNCTION) {
      const rows = this.systemTableCache.getAll(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) || [];
      return rows.find((row) => row?.operation_id === operationId) || null;
    }
    return null;
  }
  /**
   * Filter replica_operations rows from cache using a predicate.
   * @param {Function} predicate
   * @return {Array|null} null when cache is unavailable
   */
  filterReplicaOperationRowsFromCache(predicate) {
    if (!this.systemTableCache || typeof predicate !== TYPEOF.FUNCTION) {
      return null;
    }
    if (typeof this.systemTableCache.filter === TYPEOF.FUNCTION) {
      return this.systemTableCache.filter(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, predicate) || [];
    }
    if (typeof this.systemTableCache.getAll === TYPEOF.FUNCTION) {
      const rows = this.systemTableCache.getAll(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) || [];
      return rows.filter(predicate);
    }
    return null;
  }
  /**
   * Return true when one cache observation boundary exists for
   * replica_operations.
   * @return {boolean}
   */
  hasReplicaOperationCacheObservationBoundary() {
    return Boolean(
      this.systemTableCache &&
      (typeof this.systemTableCache.filter === TYPEOF.FUNCTION ||
        typeof this.systemTableCache.getAll === TYPEOF.FUNCTION),
    );
  }
  }

  for (
    const methodName of Object.getOwnPropertyNames(
      ReplicaOperationRepositoryRowMethods.prototype,
    )
  ) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      ReplicaOperationRepository.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        ReplicaOperationRepositoryRowMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignReplicaOperationRepositoryRowMethods};
