import {
  SYSTEM_TABLE_NAME,
} from '../system-table-schemas-constants.js';
import {
  UNIFIED_SERVICE_TYPE,
} from '../../constants/unified-service-lifecycle.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../rebalancer/replica-status.js';
import {
  runtimeServiceDispatchedReplicaBelongsToEntity,
} from '../../rebalancer/runtime-service-replica-identity.js';
import {
  resolveRuntimeServiceTargetReplicaCount,
} from '../../rebalancer/runtime-service-policy.js';
import {
  WASM_SERVICE_DEFINITION_STATUS,
} from '../../wasm-service/wasm-service-constants.js';

const LEGACY_REPLACE_REPLICA_PREFIX = 'replace-replica-';
const LEGACY_CLEANUP_OPERATION_PREFIX =
  'legacy-runtime-target-cleanup-';
const LEGACY_CLEANUP_OPERATION_ATTEMPT_LIMIT = 2;

function getRowValue(row, snakeCaseKey, camelCaseKey) {
  return row?.[snakeCaseKey] ?? row?.[camelCaseKey] ?? null;
}

function isLegacyRuntimeTargetRow(row) {
  const serviceId = getRowValue(row, 'service_id', 'serviceId');
  const serviceType = getRowValue(row, 'service_type', 'serviceType');
  const status = row?.status;
  return (
    serviceType === UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE &&
    typeof serviceId === 'string' &&
    serviceId.startsWith(LEGACY_REPLACE_REPLICA_PREFIX) &&
    status !== ReplicaStatus.REMOVED
  );
}

function normalizeOperationRow(coordinator, row) {
  if (typeof coordinator?.rowToOperation === 'function') {
    return coordinator.rowToOperation(row);
  }
  return {
    ...row,
    operationId: getRowValue(row, 'operation_id', 'operationId'),
    entityType: getRowValue(row, 'entity_type', 'entityType'),
    entityId: getRowValue(row, 'entity_id', 'entityId'),
    partitionId: getRowValue(row, 'partition_id', 'partitionId'),
    replicaId: getRowValue(row, 'replica_id', 'replicaId'),
    targetNodeId: getRowValue(row, 'target_node_id', 'targetNodeId'),
    workflowStep: getRowValue(row, 'workflow_step', 'workflowStep'),
  };
}

/**
 * Reconcile runtime targets produced by the pre-canonical REPLACE contract.
 *
 * This component is deliberately timerless. RuntimeServiceRebalancerOwner
 * invokes it from the same level-triggered refresh loop that owns desired
 * runtime placement. The durable cleanup is a normal coordinator REMOVE, so
 * restart/replay adopt the same deterministic operation instead of relying on
 * process-local memory.
 */
class RuntimeServiceLegacyTargetReconciler {
  constructor(options = {}) {
    this.systemTableCache = options.systemTableCache;
    this.rebalanceCoordinator = options.rebalanceCoordinator;
    this.logger = options.logger || console;
    this._running = false;
    this._requested = false;
    this._promise = Promise.resolve();
    this._reportedExhaustedCleanupOperationIds = new Set();
  }

  schedule() {
    this._requested = true;
    if (this._running) {
      return this._promise;
    }
    this._running = true;
    this._promise = (async () => {
      while (this._requested) {
        this._requested = false;
        await this._reconcileOnce();
      }
    })().finally(() => {
      this._running = false;
    });
    return this._promise;
  }

  waitForIdle() {
    return this._promise;
  }

  _filter(tableName, predicate) {
    if (typeof this.systemTableCache?.filter !== 'function') {
      return [];
    }
    const rows = this.systemTableCache.filter(tableName, predicate);
    return Array.isArray(rows) ? rows : [];
  }

  _isTerminal(operation) {
    if (typeof this.rebalanceCoordinator?.isOperationTerminal === 'function') {
      return this.rebalanceCoordinator.isOperationTerminal(operation);
    }
    return (
      operation?.workflowStep === 'COMPLETED' ||
      operation?.workflowStep === 'FAILED'
    );
  }

  _findLegacyReplaceOperation(operationRows, legacyReplicaId) {
    const matches = operationRows
      .map((row) => normalizeOperationRow(this.rebalanceCoordinator, row))
      .filter((operation) =>
        operation?.type === OperationType.REPLACE &&
        operation?.entityType === UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE &&
        operation?.replicaId === legacyReplicaId);
    if (matches.some((operation) => !this._isTerminal(operation))) {
      return null;
    }
    return matches
      .sort((left, right) =>
        Number(right?.updatedAt || 0) - Number(left?.updatedAt || 0))[0] ||
      null;
  }

  _hasCanonicalCoverage(serviceRows, entityId, desiredReplicaCount) {
    if (desiredReplicaCount <= 0) {
      return true;
    }
    const activeCanonicalReplicaIds = new Set(
      serviceRows
        .filter((row) => {
          const serviceId = getRowValue(row, 'service_id', 'serviceId');
          return (
            getRowValue(row, 'service_type', 'serviceType') ===
              UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE &&
            row?.status === ReplicaStatus.ACTIVE &&
            runtimeServiceDispatchedReplicaBelongsToEntity(
              serviceId,
              entityId,
            )
          );
        })
        .map((row) => getRowValue(row, 'service_id', 'serviceId')),
    );
    return activeCanonicalReplicaIds.size >= desiredReplicaCount;
  }

  _resolveCleanupOperationId(
    operationRows,
    cleanupOperationId,
    legacyReplicaId,
  ) {
    let highestAttempt = 0;
    const cleanupOperations = operationRows.filter((operation) => {
      if (
        operation?.type !== OperationType.REMOVE ||
        operation?.entityType !== UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE ||
        operation?.replicaId !== legacyReplicaId
      ) {
        return false;
      }
      if (operation.operationId === cleanupOperationId) {
        highestAttempt = Math.max(highestAttempt, 1);
        return true;
      }
      const retryPrefix = `${cleanupOperationId}-retry-`;
      if (!operation.operationId?.startsWith(retryPrefix)) {
        return false;
      }
      const retryOrdinal = Number(
        operation.operationId.slice(retryPrefix.length),
      );
      if (!Number.isInteger(retryOrdinal) || retryOrdinal < 2) {
        return false;
      }
      highestAttempt = Math.max(highestAttempt, retryOrdinal);
      return true;
    });
    if (cleanupOperations.some((operation) => !this._isTerminal(operation))) {
      return null;
    }
    if (highestAttempt === 0) {
      return cleanupOperationId;
    }
    if (highestAttempt >= LEGACY_CLEANUP_OPERATION_ATTEMPT_LIMIT) {
      if (!this._reportedExhaustedCleanupOperationIds.has(
        cleanupOperationId,
      )) {
        this._reportedExhaustedCleanupOperationIds.add(cleanupOperationId);
        this.logger.error?.(
          'Legacy runtime-service target cleanup retry budget exhausted',
          {
            cleanupOperationId,
            legacyReplicaId,
            attemptLimit: LEGACY_CLEANUP_OPERATION_ATTEMPT_LIMIT,
          },
        );
      }
      return null;
    }
    return `${cleanupOperationId}-retry-${highestAttempt + 1}`;
  }

  async _reconcileOnce() {
    if (typeof this.rebalanceCoordinator?.createOperation !== 'function') {
      return;
    }
    const serviceRows = this._filter(
      SYSTEM_TABLE_NAME.SERVICES,
      () => true,
    );
    const legacyRows = serviceRows.filter(isLegacyRuntimeTargetRow);
    if (legacyRows.length === 0) {
      return;
    }
    const operationRows = this._filter(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      () => true,
    );
    const definitionRows = this._filter(
      SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS,
      () => true,
    );
    const definitionById = new Map(
      definitionRows.map((row) => [
        getRowValue(row, 'service_id', 'serviceId'),
        row,
      ]),
    );
    const normalizedOperationRows = operationRows.map((row) =>
      normalizeOperationRow(this.rebalanceCoordinator, row),
    );

    for (const legacyRow of legacyRows) {
      const legacyReplicaId =
        getRowValue(legacyRow, 'service_id', 'serviceId');
      const replaceOperation = this._findLegacyReplaceOperation(
        normalizedOperationRows,
        legacyReplicaId,
      );
      if (!replaceOperation?.operationId || !replaceOperation?.entityId) {
        continue;
      }
      const definition = definitionById.get(replaceOperation.entityId);
      const definitionActive =
        definition?.status === WASM_SERVICE_DEFINITION_STATUS.ACTIVE;
      const desiredReplicaCount = definitionActive ?
        resolveRuntimeServiceTargetReplicaCount(definition) :
        0;
      if (!this._hasCanonicalCoverage(
        serviceRows,
        replaceOperation.entityId,
        desiredReplicaCount,
      )) {
        continue;
      }

      const baseCleanupOperationId =
        `${LEGACY_CLEANUP_OPERATION_PREFIX}${replaceOperation.operationId}`;
      const cleanupOperationId = this._resolveCleanupOperationId(
        normalizedOperationRows,
        baseCleanupOperationId,
        legacyReplicaId,
      );
      if (!cleanupOperationId) {
        continue;
      }
      try {
        await this.rebalanceCoordinator.createOperation({
          type: OperationType.REMOVE,
          partitionId:
            replaceOperation.partitionId || replaceOperation.entityId,
          entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
          entityId: replaceOperation.entityId,
          nodeId:
            getRowValue(legacyRow, 'node_id', 'nodeId') ||
            replaceOperation.targetNodeId,
          replicaId: legacyReplicaId,
          operationIntentId: cleanupOperationId,
        });
        normalizedOperationRows.push({
          operationId: cleanupOperationId,
          type: OperationType.REMOVE,
          entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
          replicaId: legacyReplicaId,
          workflowStep: 'SENDING',
        });
      } catch (error) {
        this.logger.warn?.(
          'Legacy runtime-service target cleanup reconciliation failed',
          {
            operationId: replaceOperation.operationId,
            replicaId: legacyReplicaId,
            error: error?.message,
          },
        );
      }
    }
  }
}

export {
  LEGACY_CLEANUP_OPERATION_PREFIX,
  RuntimeServiceLegacyTargetReconciler,
};
