function assignReplicaOperationRepositoryObservationMethods(
  ReplicaOperationRepository,
  options = {},
) {
  const {
    COORDINATOR_OWNER_COMPONENT,
    NUM,
    RAFT_ROLE,
    READ_MODEL_DIVERGENCE_TYPE,
    REBALANCE_COORDINATOR_EVENT,
    REBALANCE_COORDINATOR_LOG_MSG,
    REPLICA_OPERATION_CANONICAL_STATUS_READ_QUERY_OPTIONS,
    REPLICA_OPERATION_REPOSITORY_LITERAL,
    ReplicaStatus,
    SERVICE_TYPE,
    SQL,
    SYSTEM_TABLE_NAME,
    TYPEOF,
    buildDivergenceEvent,
    readAuthoritativeControlPlaneRows,
  } = options;

  class ReplicaOperationRepositoryObservationMethods {
  /**
   * Normalize one observed services row into workflow replica lifecycle.
   *
   * Partition replicas that report `status=active` but still carry a learner
   * role are not fully operational for REPLACE progression yet; they remain in
   * the syncing phase until promotion.
   *
   * @param {Object} row
   * @return {string|null}
   */
    normalizeObservedReplicaLifecycle(row) {
      const status =
      typeof row?.status === 'string' && row.status.length > NUM.ZERO ?
        row.status.toLowerCase() :
        null;
      if (!status) {
        return null;
      }
      if (status !== ReplicaStatus.ACTIVE) {
        return status;
      }
      const serviceType =
      typeof row?.service_type === 'string' ?
        row.service_type.toLowerCase() :
        typeof row?.serviceType === 'string' ?
          row.serviceType.toLowerCase() :
          null;
      if (serviceType !== SERVICE_TYPE.PARTITION) {
        return status;
      }
      const raftRole =
      typeof row?.raft_role === 'string' ?
        row.raft_role.toLowerCase() :
        typeof row?.raftRole === 'string' ?
          row.raftRole.toLowerCase() :
          null;
      if (!raftRole || raftRole === RAFT_ROLE.LEARNER) {
        return ReplicaStatus.SYNCING;
      }
      return status;
    }
    /**
   * Get one observed replica row from cache.
   * @param {string} replicaId
   * @param {string} partitionId
   * @param {string} targetNodeId
   * @return {Object|null}
   */
    getObservedReplicaRowFromCache(replicaId, partitionId, targetNodeId) {
      if (!this.systemTableCache) {
        return null;
      }
      const normalizedReplicaId = typeof replicaId === 'string' ? replicaId : '';
      const normalizedPartitionId = typeof partitionId === 'string' ? partitionId : '';
      const normalizedTargetNodeId = typeof targetNodeId === 'string' ? targetNodeId : '';
      const rowMatchesTarget = (row) => {
        if (!row || typeof row !== 'object') {
          return false;
        }
        const rowNodeId = String(row.node_id || row.nodeId || '');
        if (
          normalizedTargetNodeId.length > NUM.ZERO &&
        rowNodeId.length > NUM.ZERO &&
        rowNodeId !== normalizedTargetNodeId
        ) {
          return false;
        }
        const rowPartitionId = String(row.partition_id || row.partitionId || '');
        if (
          normalizedPartitionId.length > NUM.ZERO &&
        rowPartitionId.length > NUM.ZERO &&
        rowPartitionId !== normalizedPartitionId
        ) {
          return false;
        }
        return true;
      };
      const readAllServiceRows = () => {
        if (typeof this.systemTableCache.getAll === 'function') {
          return this.systemTableCache.getAll(SYSTEM_TABLE_NAME.SERVICES) || [];
        }
        if (typeof this.systemTableCache.filter === 'function') {
          return this.systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES, () => true) || [];
        }
        return [];
      };
      if (
        normalizedReplicaId.length > NUM.ZERO &&
        typeof this.systemTableCache.get === TYPEOF.FUNCTION
      ) {
        const cachedRow = this.systemTableCache.get(
          SYSTEM_TABLE_NAME.SERVICES,
          normalizedReplicaId,
        );
        if (rowMatchesTarget(cachedRow)) {
          return cachedRow;
        }
      }
      const serviceRows = readAllServiceRows();
      if (normalizedReplicaId.length > NUM.ZERO) {
        const exactReplicaRow = serviceRows.find((row) => {
          const rowReplicaId = String(
            row?.service_id || row?.serviceId || row?.replica_id || row?.replicaId || '',
          );
          return rowReplicaId === normalizedReplicaId && rowMatchesTarget(row);
        });
        if (exactReplicaRow) {
          return exactReplicaRow;
        }
      }
      return (
        serviceRows.find((row) => {
          const rowNodeId = String(row?.node_id || row?.nodeId || '');
          const rowPartitionId = String(row?.partition_id || row?.partitionId || '');
          return rowNodeId === normalizedTargetNodeId && rowPartitionId === normalizedPartitionId;
        }) || null
      );
    }
    /**
   * Get observed replica status from cache.
   * @param {string} replicaId
   * @param {string} partitionId
   * @param {string} targetNodeId
   * @return {string|null}
   */
    getObservedReplicaStatusFromCache(replicaId, partitionId, targetNodeId) {
      return this.normalizeObservedReplicaLifecycle(
        this.getObservedReplicaRowFromCache(replicaId, partitionId, targetNodeId),
      );
    }
    /**
   * Get authoritative replica status via SQL, with cache
   * fallback for degraded conditions.
   * @param {string} replicaId
   * @param {string} partitionId
   * @param {string} targetNodeId
   * @return {Promise<Object>}
   */
    async getActualReplicaObservation(replicaId, partitionId, targetNodeId) {
      let observedRow = null;
      let authoritativeReadAttempted = false;
      let authoritativeReadFailed = false;
      const recordAuthoritativeResult = (result) => {
        if (!result || typeof result !== 'object') {
          return;
        }
        authoritativeReadAttempted = true;
        if (result.success !== true) {
          authoritativeReadFailed = true;
          return;
        }
        if (Array.isArray(result.rows) && result.rows.length > NUM.ZERO) {
          observedRow = result.rows[NUM.ZERO];
        }
      };
      if (replicaId) {
        const result = await readAuthoritativeControlPlaneRows(
          this.controlPlaneSystemTableGateway,
          SYSTEM_TABLE_NAME.SERVICES,
          SQL.SELECT_REPLICA_STATUS,
          [replicaId],
          REPLICA_OPERATION_CANONICAL_STATUS_READ_QUERY_OPTIONS,
        );
        recordAuthoritativeResult(result);
      }
      if (!observedRow) {
      // Secondary lookup by partition + node when replicaId
      // yields no row
        const result = await readAuthoritativeControlPlaneRows(
          this.controlPlaneSystemTableGateway,
          SYSTEM_TABLE_NAME.SERVICES,
          SQL.SELECT_REPLICA_BY_PARTITION_NODE,
          [partitionId, targetNodeId],
          REPLICA_OPERATION_CANONICAL_STATUS_READ_QUERY_OPTIONS,
        );
        recordAuthoritativeResult(result);
      }
      if (!observedRow && (!authoritativeReadAttempted || authoritativeReadFailed)) {
        observedRow = this.getObservedReplicaRowFromCache(replicaId, partitionId, targetNodeId);
        if (observedRow) {
          return Object.freeze({
            state: REPLICA_OPERATION_REPOSITORY_LITERAL.OBSERVED,
            source:
            authoritativeReadFailed === true ?
              REPLICA_OPERATION_REPOSITORY_LITERAL.CACHE_FALLBACK_AFTER_AUTHORITATIVE_FAILURE :
              REPLICA_OPERATION_REPOSITORY_LITERAL.CACHE,
            lifecycleStatus: this.normalizeObservedReplicaLifecycle(observedRow),
          });
        }
      }
      if (observedRow) {
        return Object.freeze({
          state: REPLICA_OPERATION_REPOSITORY_LITERAL.OBSERVED,
          source: REPLICA_OPERATION_REPOSITORY_LITERAL.AUTHORITATIVE,
          lifecycleStatus: this.normalizeObservedReplicaLifecycle(observedRow),
        });
      }
      return Object.freeze({
        state:
        authoritativeReadAttempted === true ?
          REPLICA_OPERATION_REPOSITORY_LITERAL.ABSENT :
          REPLICA_OPERATION_REPOSITORY_LITERAL.UNAVAILABLE,
        source:
        authoritativeReadAttempted === true ?
          REPLICA_OPERATION_REPOSITORY_LITERAL.AUTHORITATIVE :
          REPLICA_OPERATION_REPOSITORY_LITERAL.UNAVAILABLE,
      });
    }
    /**
   * Get authoritative replica status via SQL, with cache
   * fallback for degraded conditions.
   * @param {string} replicaId
   * @param {string} partitionId
   * @param {string} targetNodeId
   * @return {Promise<string|null>}
   */
    async getActualReplicaStatus(replicaId, partitionId, targetNodeId) {
      const observation = await this.getActualReplicaObservation(
        replicaId,
        partitionId,
        targetNodeId,
      );
      return observation.state === REPLICA_OPERATION_REPOSITORY_LITERAL.OBSERVED ?
        observation.lifecycleStatus :
        null;
    }
    /**
   * Emit a read-model divergence event when cache and
   * authoritative status disagree.
   * @param {string} replicaId
   * @param {string} authoritativeStatus
   * @param {string} reason
   */
    emitReplicaStatusDivergence(replicaId, authoritativeStatus, reason) {
      if (
        !replicaId ||
      !this.systemTableCache ||
      typeof this.systemTableCache.get !== TYPEOF.FUNCTION
      ) {
        return;
      }
      const cachedRow = this.systemTableCache.get(SYSTEM_TABLE_NAME.SERVICES, replicaId);
      const cachedStatus = cachedRow?.status || null;
      if (cachedStatus === authoritativeStatus) {
        return;
      }
      const divergenceType =
      authoritativeStatus === null ?
        READ_MODEL_DIVERGENCE_TYPE.AUTHORITATIVE_MISSING :
        cachedStatus === null ?
          READ_MODEL_DIVERGENCE_TYPE.CACHE_MISSING :
          READ_MODEL_DIVERGENCE_TYPE.FIELD_MISMATCH;
      const event = buildDivergenceEvent({
        divergenceType,
        tableName: SYSTEM_TABLE_NAME.SERVICES,
        ownerComponent: COORDINATOR_OWNER_COMPONENT,
        reconciliationReason: reason,
        rowKey: replicaId,
        cacheValue: cachedStatus ? {status: cachedStatus} : null,
        authoritativeValue: authoritativeStatus ? {status: authoritativeStatus} : null,
        divergentFields: ['status'],
      });
      this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.READ_MODEL_DIVERGENCE, event);
      if (this.emitter) {
        this.emitter.emit(REBALANCE_COORDINATOR_EVENT.READ_MODEL_DIVERGENCE, event);
      }
    }
  }

  for (
    const methodName of Object.getOwnPropertyNames(
      ReplicaOperationRepositoryObservationMethods.prototype,
    )
  ) {
    if (methodName === 'constructor') {
      continue;
    }
    Object.defineProperty(
      ReplicaOperationRepository.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        ReplicaOperationRepositoryObservationMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignReplicaOperationRepositoryObservationMethods};
