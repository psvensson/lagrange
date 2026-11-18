import {SERVICE_TYPE} from '../constants/service.js';
import {UNIFIED_SERVICE_TYPE} from '../constants/unified-service-lifecycle.js';
import {REPLICA_CLEANUP_AUTHORITY_KIND} from '../node/replica-cleanup-constants.js';
import {readStateField} from '../utils/state-field-read.js';
import {isVoterRaftRole} from '../raft/replica-voter-readiness.js';
import {isUnclaimedPreRuntimeFailedCreateRow} from
  './failed-create-cleanup-token.js';
import {runtimeServiceReplicaBelongsToEntity} from
  './runtime-service-replica-identity.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';

const NO_REPLICA_LIFECYCLE_PRECONDITION = Object.freeze({});

function readCanonicalRowString(row, primaryField, aliasField) {
  const primary = row?.[primaryField];
  if (typeof primary === 'string' && primary.trim().length > 0) {
    return primary.trim();
  }
  if (aliasField) {
    const alias = row?.[aliasField];
    if (typeof alias === 'string' && alias.trim().length > 0) {
      return alias.trim();
    }
  }
  return null;
}

function readCanonicalRowLower(row, primaryField, aliasField) {
  const val = readCanonicalRowString(row, primaryField, aliasField);
  return val ? val.toLowerCase() : null;
}

function decodeCanonicalObservedReplicaRow(row) {
  if (!row || typeof row !== 'object') {
    return null;
  }
  const serviceId = readCanonicalRowString(row, 'service_id', 'serviceId');
  const replicaId = readCanonicalRowString(row, 'replica_id', 'replicaId');
  const serviceType = readCanonicalRowLower(row, 'service_type', 'serviceType');
  const nodeId = readCanonicalRowString(row, 'node_id', 'nodeId');
  const partitionId = readCanonicalRowString(row, 'partition_id', 'partitionId');
  const groupId = readCanonicalRowString(row, 'group_id', 'groupId');
  const status = readCanonicalRowLower(row, 'status');
  const raftRole = readCanonicalRowLower(row, 'raft_role', 'raftRole');
  const address = readCanonicalRowString(row, 'address');
  const previousState = readCanonicalRowLower(row, 'previous_state', 'previousState');
  const cleanupToken = readCanonicalRowString(row, 'cleanup_token', 'cleanupToken');
  const createAttemptToken = readCanonicalRowString(
    row,
    'create_attempt_token',
    'createAttemptToken',
  );
  const createdAt = Number.isFinite(row.created_at) ?
    row.created_at :
    Number.isFinite(row.createdAt) ?
      row.createdAt :
      null;
  const stateEnteredAt = Number.isFinite(row.state_entered_at) ?
    row.state_entered_at :
    Number.isFinite(row.stateEnteredAt) ?
      row.stateEnteredAt :
      null;

  return Object.freeze({
    serviceId,
    replicaId,
    serviceType,
    nodeId,
    partitionId,
    groupId,
    status,
    raftRole,
    address,
    previousState,
    cleanupToken,
    createAttemptToken,
    createdAt,
    stateEnteredAt,
  });
}

function buildObservedReplicaLifecyclePrecondition(row) {
  const decoded = decodeCanonicalObservedReplicaRow(row);
  if (
    !decoded ||
    !decoded.status ||
    !decoded.nodeId ||
    !Number.isFinite(decoded.createdAt) ||
    !Number.isFinite(decoded.stateEnteredAt)
  ) {
    return NO_REPLICA_LIFECYCLE_PRECONDITION;
  }
  if (decoded.serviceType === UNIFIED_SERVICE_TYPE.PARTITION) {
    if (!decoded.partitionId) {
      return NO_REPLICA_LIFECYCLE_PRECONDITION;
    }
  } else if (decoded.serviceType === SERVICE_TYPE.MESSAGE_GROUP) {
    if (!decoded.groupId) {
      return NO_REPLICA_LIFECYCLE_PRECONDITION;
    }
  } else if (!decoded.partitionId && !decoded.groupId) {
    return NO_REPLICA_LIFECYCLE_PRECONDITION;
  }
  return Object.freeze({
    service_id: decoded.serviceId,
    replica_id: decoded.replicaId,
    group_id: decoded.groupId,
    partition_id: decoded.partitionId,
    node_id: decoded.nodeId,
    service_type: decoded.serviceType,
    status: decoded.status,
    cleanup_token: decoded.cleanupToken,
    create_attempt_token: decoded.createAttemptToken,
    created_at: decoded.createdAt,
    state_entered_at: decoded.stateEnteredAt,
  });
}

function assignReplicaOperationRepositoryObservationMethods(
  ReplicaOperationRepository,
  options = {},
) {
  const {
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
    COORDINATOR_OWNER_COMPONENT,
    READ_MODEL_DIVERGENCE_TYPE,
    REBALANCE_COORDINATOR_EVENT,
    REBALANCE_COORDINATOR_LOG_MSG,
    REPLICA_OPERATION_CANONICAL_STATUS_READ_QUERY_OPTIONS,
    REPLICA_OPERATION_LOCAL_STATUS_READ_QUERY_OPTIONS,
    REPLICA_OPERATION_REQUIRED_STATUS_READ_QUERY_OPTIONS,
    REPLICA_OPERATION_REPOSITORY_LITERAL,
    ReplicaStatus,
    SQL,
    SYSTEM_TABLE_NAME,
    buildDivergenceEvent,
    readAuthoritativeControlPlaneRows,
  } = options;

  class ReplicaOperationRepositoryObservationMethods {
    /**
     * Normalize one observed services row into workflow replica lifecycle.
     *
     * Partition replicas that report `status=active` but still carry a learner
     * role are not fully operational for REPLACE progression yet; they remain in
     * the syncing phase until promotion. Conversely, a `syncing` partition row
     * with a non-learner role and routable address has crossed the same
     * voter-ready boundary used before the replica handler emits ACTIVE, so the
     * coordinator treats it as active even when the status write is lagging.
     *
     * @param {Object} row
     * @return {string|null}
     */
    normalizeObservedReplicaLifecycle(row) {
      const decoded = decodeCanonicalObservedReplicaRow(row);
      if (!decoded || !decoded.status) {
        return null;
      }
      if (decoded.serviceType === SERVICE_TYPE.PARTITION_CLEANUP) {
        if (decoded.status === REPLICA_CLEANUP_AUTHORITY_KIND.COMPLETE) {
          return ReplicaStatus.REMOVED;
        }
        if (decoded.status === REPLICA_CLEANUP_AUTHORITY_KIND.OWNED) {
          return ReplicaStatus.REMOVING;
        }
        return decoded.status;
      }
      if (decoded.serviceType !== SERVICE_TYPE.PARTITION) {
        return decoded.status;
      }
      if (decoded.status === ReplicaStatus.ACTIVE) {
        if (!isVoterRaftRole(decoded.raftRole)) {
          return ReplicaStatus.SYNCING;
        }
        return ReplicaStatus.ACTIVE;
      }
      if (
        decoded.status === ReplicaStatus.SYNCING &&
        isVoterRaftRole(decoded.raftRole) &&
        decoded.address
      ) {
        return ReplicaStatus.ACTIVE;
      }
      return decoded.status;
    }

    /**
     * Extract canonical target identity from an observed services row
     * independently of lifecycle generation timestamps.
     *
     * @param {Object} row
     * @return {Object|null}
     */
    buildObservedReplicaTargetIdentity(row) {
      const decoded = decodeCanonicalObservedReplicaRow(row);
      if (!decoded) return null;
      return Object.freeze({
        replicaId: decoded.replicaId,
        serviceId: decoded.serviceId,
        partitionId: decoded.partitionId,
        nodeId: decoded.nodeId,
        serviceType: decoded.serviceType,
        status: decoded.status,
      });
    }

    /**
     * Reject a services row that does not identify the exact target replica,
     * entity scope, and node.
     *
     * @param {Object} row
     * @param {string} replicaId
     * @param {string} partitionId
     * @param {string} targetNodeId
     * @return {boolean}
     * @private
     */
    _doesObservedReplicaIdentityMatch(decoded, expectedReplica) {
      if (expectedReplica.length === 0) return false;
      const actualReplica = decoded.replicaId ? decoded.replicaId.toLowerCase() : null;
      const actualService = decoded.serviceId ? decoded.serviceId.toLowerCase() : null;
      if (!actualReplica && !actualService) return false;
      if (actualReplica && actualReplica !== expectedReplica) return false;
      if (actualService && actualService !== expectedReplica) {
        return decoded.serviceType === UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE;
      }
      return true;
    }

    _doesObservedEntityMatch(decoded, expectedPartition) {
      if (expectedPartition.length === 0) return false;
      if (decoded.serviceType === UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE) {
        return this.doesObservedRuntimeServiceEntityMatch(
          expectedPartition,
          decoded,
        );
      }
      if (decoded.serviceType === SERVICE_TYPE.MESSAGE_GROUP) {
        return decoded.groupId?.toLowerCase() === expectedPartition;
      }
      return decoded.partitionId?.toLowerCase() === expectedPartition;
    }

    doesObservedReplicaRowMatchTarget(row, replicaId, partitionId, targetNodeId) {
      const decoded = decodeCanonicalObservedReplicaRow(row);
      if (!decoded) return false;
      const expectedNode = this.normalizeObservedTargetIdentifier(targetNodeId);
      if (expectedNode.length === 0 || decoded.nodeId?.toLowerCase() !== expectedNode) {
        return false;
      }
      const expectedReplica = this.normalizeObservedTargetIdentifier(replicaId);
      if (!this._doesObservedReplicaIdentityMatch(decoded, expectedReplica)) return false;
      const expectedPartition = this.normalizeObservedTargetIdentifier(partitionId);
      return this._doesObservedEntityMatch(decoded, expectedPartition);
    }

    normalizeObservedTargetIdentifier(value) {
      return typeof value === 'string' ? value.trim().toLowerCase() : '';
    }

    doesObservedRuntimeServiceEntityMatch(expectedEntityId, observedIdentity) {
      if (observedIdentity.partitionId !== null &&
          observedIdentity.partitionId !== expectedEntityId) {
        return false;
      }
      const runtimeReplicaId = observedIdentity.replicaId !== null ?
        observedIdentity.replicaId : observedIdentity.serviceId;
      return runtimeServiceReplicaBelongsToEntity(
        runtimeReplicaId, expectedEntityId);
    }

    /**
     * Get one observed replica row from cache.
   * @param {string} replicaId
   * @param {string} partitionId
   * @param {string} targetNodeId
   * @param {Object} [options={}]
   * @return {Object|null}
   */
    getObservedReplicaRowFromCache(
      replicaId,
      partitionId,
      targetNodeId,
    ) {
      if (!this.systemTableCache) {
        return null;
      }
      const normalizedReplicaId = typeof replicaId === 'string' ? replicaId : '';
      const normalizedPartitionId = typeof partitionId === 'string' ? partitionId : '';
      const normalizedTargetNodeId = typeof targetNodeId === 'string' ? targetNodeId : '';
      const rowMatchesTarget = (row) =>
        this.doesObservedReplicaRowMatchTarget(
          row,
          normalizedReplicaId,
          normalizedPartitionId,
          normalizedTargetNodeId,
        );
      if (
        normalizedReplicaId.length > 0 &&
        typeof this.systemTableCache.get === 'function'
      ) {
        const cachedRow = this.systemTableCache.get(
          SYSTEM_TABLE_NAME.SERVICES,
          normalizedReplicaId,
        );
        if (rowMatchesTarget(cachedRow)) {
          return cachedRow;
        }
      }
      const readAllServiceRows = () => {
        if (typeof this.systemTableCache.getAll === 'function') {
          return this.systemTableCache.getAll(SYSTEM_TABLE_NAME.SERVICES) || [];
        }
        if (typeof this.systemTableCache.filter === 'function') {
          return this.systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES, () => true) || [];
        }
        return [];
      };
      const serviceRows = readAllServiceRows();
      if (normalizedReplicaId.length > 0) {
        const exactReplicaRow = serviceRows.find((row) => rowMatchesTarget(row));
        if (exactReplicaRow) {
          return exactReplicaRow;
        }
      }
      return null;
    }
    /**
   * Get observed replica status from cache.
   * @param {string} replicaId
   * @param {string} partitionId
   * @param {string} targetNodeId
   * @param {Object} [options={}]
   * @return {string|null}
   */
    resolveObservedReplicaLifecycleStatus(observedRow, options = {}) {
      if (
        options?.ignoreUnclaimedPreRuntimeFailedCreate === true &&
        isUnclaimedPreRuntimeFailedCreateRow(observedRow)
      ) {
        return null;
      }
      return this.normalizeObservedReplicaLifecycle(observedRow);
    }

    getObservedReplicaStatusFromCache(
      replicaId,
      partitionId,
      targetNodeId,
      options = {},
    ) {
      return this.resolveObservedReplicaLifecycleStatus(
        this.getObservedReplicaRowFromCache(
          replicaId,
          partitionId,
          targetNodeId,
          options,
        ),
        options,
      );
    }
    /**
   * Align one exact SERVICES row from authoritative storage into the local
   * cache before its operation owner releases terminal workflow state.
   *
     * @param {string} replicaId
     * @param {string} targetNodeId
     * @return {Promise<boolean>}
     */
    async refreshAuthoritativeReplicaCacheRow(replicaId, targetNodeId) {
      const refreshAuthoritativeCacheRow =
        this.cdcIntegrationService?.refreshAuthoritativeCacheRow;
      if (
        typeof refreshAuthoritativeCacheRow !==
          REPLICA_OPERATION_REPOSITORY_LITERAL.FUNCTION
      ) {
        return false;
      }
      return (
        await refreshAuthoritativeCacheRow.call(
          this.cdcIntegrationService,
          SYSTEM_TABLE_NAME.SERVICES,
          replicaId,
          {
            expectedFields: {
              status: ReplicaStatus.ACTIVE,
              node_id: targetNodeId,
            },
          },
        )
      ) === true;
    }
    /**
   * Resolve the authoritative services read contract for one status probe.
   * @param {Object} [readOptions={}]
   * @return {Object}
   */
    resolveActualReplicaStatusReadQueryOptions(readOptions = {}) {
      if (
        readOptions?.authoritativeReadMode ===
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY
      ) {
        return REPLICA_OPERATION_LOCAL_STATUS_READ_QUERY_OPTIONS;
      }
      if (
        readOptions?.authoritativeReadMode ===
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED
      ) {
        return REPLICA_OPERATION_REQUIRED_STATUS_READ_QUERY_OPTIONS;
      }
      return REPLICA_OPERATION_CANONICAL_STATUS_READ_QUERY_OPTIONS;
    }
    /**
     * Run the authoritative replica-status reads (exact-id probe, then the
     * optional partition+node secondary lookup) and fold their outcomes into
     * one attempted/failed/row summary for observation classification.
     * @param {string} replicaId
     * @param {string} partitionId
     * @param {string} targetNodeId
     * @param {Object} readOptions
     * @return {Promise<{observedRow: Object|null,
     *   authoritativeReadAttempted: boolean,
     *   authoritativeReadFailed: boolean}>}
     * @private
     */
    async readAuthoritativeReplicaRowForObservation(
      replicaId,
      partitionId,
      targetNodeId,
      readOptions,
    ) {
      const statusReadQueryOptions =
        this.resolveActualReplicaStatusReadQueryOptions(readOptions);
      let observedRow = null;
      let authoritativeReadAttempted = false;
      let authoritativeReadFailed = false;
      let authoritativeTargetMismatch = false;
      const recordAuthoritativeResult = (result, matchesRow) => {
        if (!result || typeof result !== 'object') {
          return;
        }
        authoritativeReadAttempted = true;
        if (result.success !== true) {
          authoritativeReadFailed = true;
          return;
        }
        if (Array.isArray(result.rows) && result.rows.length > 0) {
          observedRow = result.rows.find(matchesRow) || null;
          if (!observedRow) {
            authoritativeTargetMismatch = true;
          }
        }
      };
      if (replicaId) {
        recordAuthoritativeResult(
          await readAuthoritativeControlPlaneRows(
            this.controlPlaneSystemTableGateway,
            SYSTEM_TABLE_NAME.SERVICES,
            SQL.SELECT_REPLICA_STATUS,
            [replicaId],
            statusReadQueryOptions,
          ),
          (row) => this.doesObservedReplicaRowMatchTarget(
            row, replicaId, partitionId, targetNodeId),
        );
      }
      return {
        observedRow,
        authoritativeReadAttempted,
        authoritativeReadFailed,
        authoritativeTargetMismatch,
      };
    }

    /**
     * Classify a successful-but-empty authoritative read. ABSENT is positive
     * retirement evidence and terminates retiring operations, so absence must
     * be corroborated: while the local cache still holds a live (not
     * removed/failed) row for this replica, the stores have diverged and
     * absence is NOT proven. Fail closed to UNAVAILABLE so the stopping
     * reconcile takes its defer/retry lane and re-dispatches the real
     * deletion owner instead of resting terminal on stale actuals.
     * @param {string} replicaId
     * @param {string} partitionId
     * @param {string} targetNodeId
     * @param {Object} readOptions
     * @return {Object} Frozen observation.
     * @private
     */
    classifyCorroboratedReplicaAbsence(
      replicaId,
      partitionId,
      targetNodeId,
      readOptions,
    ) {
      const contradictingCacheRow = this.getObservedReplicaRowFromCache(
        replicaId,
        partitionId,
        targetNodeId,
        readOptions,
      );
      const contradictingLifecycle = contradictingCacheRow ?
        this.normalizeObservedReplicaLifecycle(contradictingCacheRow) :
        null;
      if (
        contradictingLifecycle !== null &&
        contradictingLifecycle !== ReplicaStatus.REMOVED &&
        contradictingLifecycle !== ReplicaStatus.FAILED
      ) {
        return Object.freeze({
          state: REPLICA_OPERATION_REPOSITORY_LITERAL.UNAVAILABLE,
          source: REPLICA_OPERATION_REPOSITORY_LITERAL
            .AUTHORITATIVE_ABSENT_CACHE_BLOCKING,
        });
      }
      return Object.freeze({
        state: REPLICA_OPERATION_REPOSITORY_LITERAL.ABSENT,
        source: REPLICA_OPERATION_REPOSITORY_LITERAL.AUTHORITATIVE,
      });
    }

    /**
     * Get authoritative replica observation via SQL.
     * @param {string} replicaId
     * @param {string} partitionId
     * @param {string} targetNodeId
     * @param {Object} [readOptions={}]
     * @return {Promise<Object>}
     */
    async getActualReplicaObservation(
      replicaId,
      partitionId,
      targetNodeId,
      readOptions = {},
    ) {
      const {
        observedRow,
        authoritativeReadAttempted,
        authoritativeReadFailed,
        authoritativeTargetMismatch,
      } = await this.readAuthoritativeReplicaRowForObservation(
        replicaId,
        partitionId,
        targetNodeId,
        readOptions,
      );
      if (observedRow) {
        const decoded = decodeCanonicalObservedReplicaRow(observedRow);
        return Object.freeze({
          state: REPLICA_OPERATION_REPOSITORY_LITERAL.OBSERVED,
          source: REPLICA_OPERATION_REPOSITORY_LITERAL.AUTHORITATIVE,
          lifecycleStatus: this.resolveObservedReplicaLifecycleStatus(
            observedRow,
            readOptions,
          ),
          previousState: decoded?.previousState || null,
          observedTargetIdentity:
            this.buildObservedReplicaTargetIdentity(observedRow),
          lifecyclePrecondition:
            buildObservedReplicaLifecyclePrecondition(observedRow),
        });
      }
      if (
        authoritativeReadAttempted === true &&
        authoritativeReadFailed !== true &&
        authoritativeTargetMismatch !== true
      ) {
        return this.classifyCorroboratedReplicaAbsence(
          replicaId,
          partitionId,
          targetNodeId,
          readOptions,
        );
      }
      return Object.freeze({
        state: REPLICA_OPERATION_REPOSITORY_LITERAL.UNAVAILABLE,
        source: REPLICA_OPERATION_REPOSITORY_LITERAL.UNAVAILABLE,
      });
    }
    /**
   * Get authoritative replica status via SQL, with cache
   * fallback for degraded conditions.
   * @param {string} replicaId
   * @param {string} partitionId
   * @param {string} targetNodeId
   * @param {Object} [readOptions={}]
   * @return {Promise<string|null>}
   */
    async getActualReplicaStatus(
      replicaId,
      partitionId,
      targetNodeId,
      readOptions = {},
    ) {
      const observation = await this.getActualReplicaObservation(
        replicaId,
        partitionId,
        targetNodeId,
        readOptions,
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
      typeof this.systemTableCache.get !== 'function'
      ) {
        return;
      }
      const cachedRow = this.systemTableCache.get(SYSTEM_TABLE_NAME.SERVICES, replicaId);
      const cachedStatus = readStateField(cachedRow?.status);
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
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
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
