import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';
import {filterConcurrentAddBudgetOperations} from './rebalance-coordinator-priority-budget-helper.js';
import {normalizeServiceRow} from '../control-plane/system-row-normalizers.js';
import {
  applyUserTableLeaderPlacementCure,
} from './user-table-leader-placement-cure.js';

const {
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  OperationType,
  SERVICE_TYPE,
  SYSTEM_TABLE_NAME,
} = REBALANCE_COORDINATOR_SHARED;

function checkTimeouts(coordinator) {
  if (!coordinator.workflowOwner) {
    return;
  }
  return coordinator.workflowOwner.checkTimeouts();
}

function reconcileOrphanedOperations(coordinator) {
  if (!coordinator.workflowOwner) {
    return;
  }
  return coordinator.workflowOwner.reconcileOrphanedOperations();
}

function getTimeoutForStep(coordinator, step, operation = null) {
  return coordinator.workflowOwner.getTimeoutForStep(step, operation);
}

async function reconcileTimeoutOperation(coordinator, operation, now) {
  return coordinator.workflowOwner.reconcileTimeoutOperation(operation, now);
}

async function reconcileOperationLifecycle(coordinator, operation) {
  return coordinator.workflowOwner.reconcileOperationLifecycle(operation);
}

function handleExecutorOutcome(coordinator, outcome) {
  return coordinator.workflowOwner.handleExecutorOutcome(outcome);
}

async function reconcileExecutorOutcome(coordinator, outcome) {
  return coordinator.workflowOwner.reconcileExecutorOutcome(outcome);
}

function isPreSyncStep(coordinator, step) {
  return coordinator.workflowOwner.isPreSyncStep(step);
}

async function reconcileRecoveryOperation(coordinator, op) {
  return coordinator.workflowOwner.reconcileRecoveryOperation(op);
}

function resolveCoordinatorLocalPartitionServices(coordinator) {
  const provided =
    coordinator?.cdcIntegrationService?.partitionServicesProvider?.();
  return provided instanceof Map ? provided : null;
}

function resolvePartitionServiceCureContext(coordinator, service) {
  if (!service.userTableLeaderPlacementCureContext) {
    service.userTableLeaderPlacementCureContext = {
      entityId: service.partitionId,
      entityType: SERVICE_TYPE.PARTITION,
      getCurrentReplicas: () =>
        coordinator.systemTableCache.filter(
          SYSTEM_TABLE_NAME.SERVICES,
          (row) => {
            const norm = normalizeServiceRow(row);
            return norm.serviceType === SERVICE_TYPE.PARTITION &&
              norm.partitionId === service.partitionId;
          },
        ),
      get isLeader() {
        return service.isLeader === true;
      },
      get isShuttingDown() {
        return Boolean(service.isShutdown);
      },
      isStabilized: () => true,
      get logger() {
        return coordinator.logger;
      },
      get messageRouter() {
        return coordinator.messageRouter;
      },
      nodeId: coordinator.nodeId,
      replicaId: service.replicaId,
      get systemTableCache() {
        return coordinator.systemTableCache;
      },
      userTableLeaderPlacementCureState: null,
    };
  }
  return service.userTableLeaderPlacementCureContext;
}

function isEligibleCoordinatorCurePartitionService(service) {
  return Boolean(service) && !service.rebalancer;
}

function isReadyLeaderPartitionService(service) {
  return service.isLeader === true &&
    !service.isShutdown &&
    service.isMetadataPublicationReady?.() !== false;
}

async function reconcileSinglePartitionLeaderPlacementCure(
  coordinator,
  service,
  nowMs,
) {
  if (!isEligibleCoordinatorCurePartitionService(service)) {
    return;
  }
  if (!isReadyLeaderPartitionService(service)) {
    delete service.userTableLeaderPlacementCureContext;
    return;
  }
  const context = resolvePartitionServiceCureContext(coordinator, service);
  await applyUserTableLeaderPlacementCure(context, {nowMs});
}

async function reconcileCoordinatorPartitionLeaderPlacementCure(coordinator) {
  if (!coordinator || coordinator.isShuttingDown) {
    return;
  }
  const partitionServices =
    resolveCoordinatorLocalPartitionServices(coordinator);
  if (!(partitionServices instanceof Map) || partitionServices.size === 0) {
    return;
  }
  const nowMs = coordinator.nowFn();
  for (const service of partitionServices.values()) {
    await reconcileSinglePartitionLeaderPlacementCure(
      coordinator,
      service,
      nowMs,
    );
  }
}

async function reconcileMessageGroupMembershipDebt(coordinator) {
  const result =
    await coordinator.workflowOwner.reconcileMessageGroupMembershipDebt();
  await reconcileCoordinatorPartitionLeaderPlacementCure(coordinator);
  return result;
}

async function reconcileSyncingOperation(coordinator, operation) {
  return coordinator.workflowOwner.reconcileSyncingOperation(operation);
}

function getObservedReplicaStatusFromCache(
  coordinator,
  replicaId,
  partitionId,
  targetNodeId,
  options = {},
) {
  return coordinator.repository.getObservedReplicaStatusFromCache(
    replicaId,
    partitionId,
    targetNodeId,
    options,
  );
}

async function getActualReplicaStatus(coordinator, replicaId, partitionId, targetNodeId) {
  return coordinator.repository.getActualReplicaStatus(
    replicaId,
    partitionId,
    targetNodeId,
  );
}

function emitReplicaStatusDivergence(
  coordinator,
  replicaId,
  authoritativeStatus,
  reason,
) {
  return coordinator.repository.emitReplicaStatusDivergence(
    replicaId,
    authoritativeStatus,
    reason,
  );
}

async function getOperation(coordinator, operationId) {
  return coordinator.queryOperationById(operationId);
}

async function getAllOperations(coordinator) {
  return coordinator.repository.getAllOperations();
}

async function getOperationsByPartition(coordinator, partitionId) {
  return coordinator.getOperationsByEntity(SERVICE_TYPE.PARTITION, partitionId);
}

async function getOperationsByEntity(coordinator, entityType, entityId, options = {}) {
  if (options?.visibilityReadMode === REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED) {
    const observation = await coordinator.getEntityAuthoritativeOperationObservation(
      entityType, entityId,
    );
    return coordinator.requireEntityOperationRows(observation, entityType, entityId);
  }
  return coordinator.repository.getOperationsByEntity(entityType, entityId);
}

async function getInFlightOperations(coordinator) {
  return coordinator.queryIncompleteOperations();
}

function getConcurrentAddCount(coordinator, options = {}) {
  return coordinator.queryIncompleteOperations(options).then((inFlight) =>
    filterConcurrentAddBudgetOperations(coordinator, inFlight, options),
  ).then((operations) => operations.length);
}

function getConcurrentRemoveCount(coordinator, options = {}) {
  return coordinator.queryIncompleteOperations(options).then((inFlight) =>
    inFlight.filter((operation) => operation?.type === OperationType.REMOVE).length,
  );
}

export {
  checkTimeouts,
  reconcileOrphanedOperations,
  getTimeoutForStep,
  reconcileTimeoutOperation,
  reconcileOperationLifecycle,
  handleExecutorOutcome,
  reconcileExecutorOutcome,
  isPreSyncStep,
  reconcileRecoveryOperation,
  reconcileMessageGroupMembershipDebt,
  reconcileSyncingOperation,
  getObservedReplicaStatusFromCache,
  getActualReplicaStatus,
  emitReplicaStatusDivergence,
  getOperation,
  getAllOperations,
  getOperationsByPartition,
  getOperationsByEntity,
  getInFlightOperations,
  getConcurrentAddCount,
  getConcurrentRemoveCount,
};
