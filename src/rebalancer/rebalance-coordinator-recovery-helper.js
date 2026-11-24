import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';
import {
  USER_TABLE_LEADER_PLACEMENT_CURE_STATE,
  buildSharedLeaderPlacementPassCensus,
  dispatchLeaderHandoff,
  evaluateRebalancerLeaderPlacementCurePass,
  readPartitionServiceRows,
} from './user-table-leader-placement-cure.js';

const {
  REBALANCE_COORDINATOR_EVENT,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  SERVICE_TYPE,
} = REBALANCE_COORDINATOR_SHARED;

const MAX_COORDINATOR_CURE_HANDOFFS_PER_PASS = 2;
const CURE_COUNT_ZERO = 0;
const CURE_COUNT_ONE = 1;

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
        readPartitionServiceRows(
          coordinator.systemTableCache,
          service.partitionId,
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

const NOOP_CANCEL_PASS = () => {};
const IDLE_CURE_PASS_RESULT = Object.freeze({
  cancelled: false,
  dispatchedCount: CURE_COUNT_ZERO,
  evaluatedCount: CURE_COUNT_ZERO,
});
const IDLE_CURE_PASS_PROMISE = Promise.resolve(IDLE_CURE_PASS_RESULT);

function resolveCoordinatorMaxCureHandoffsPerPass(coordinator) {
  const configured = coordinator?.maxLeaderPlacementHandoffsPerPass;
  return Number.isSafeInteger(configured) && configured > CURE_COUNT_ZERO ?
    configured :
    MAX_COORDINATOR_CURE_HANDOFFS_PER_PASS;
}

function resolveCoordinatorLeaderPlacementCureCustody(coordinator) {
  const maxDispatchesPerPass =
    resolveCoordinatorMaxCureHandoffsPerPass(coordinator);
  if (!coordinator.leaderPlacementCureState) {
    coordinator.leaderPlacementCureState = {
      cancelInFlightPass: NOOP_CANCEL_PASS,
      inFlight: false,
      lastPassResult: IDLE_CURE_PASS_RESULT,
      lastPromise: IDLE_CURE_PASS_PROMISE,
      maxDispatchesPerPass,
    };
  } else {
    coordinator.leaderPlacementCureState.maxDispatchesPerPass =
      maxDispatchesPerPass;
  }
  return coordinator.leaderPlacementCureState;
}

function evaluateSinglePartitionCureStep(
  coordinator,
  service,
  nowMs,
  sharedPassCensus,
) {
  if (!isEligibleCoordinatorCurePartitionService(service)) {
    return null;
  }
  if (!isReadyLeaderPartitionService(service)) {
    delete service.userTableLeaderPlacementCureContext;
    return null;
  }
  const context = resolvePartitionServiceCureContext(coordinator, service);
  const decision = evaluateRebalancerLeaderPlacementCurePass(context, {
    nowMs,
    sharedPassCensus,
  });
  return decision ? {context, decision} : null;
}

async function continueCoordinatorCurePassWithHandoffs(passState) {
  const {
    coordinator,
    firstStep,
    maxDispatchesPerPass,
    nowMs,
    services,
    sharedPassCensus,
    startIndex,
  } = passState;
  let {dispatchedCount, evaluatedCount} = passState;
  dispatchedCount += CURE_COUNT_ONE;
  await dispatchLeaderHandoff(firstStep.context, firstStep.decision, nowMs);
  for (let index = startIndex; index < services.length; index += CURE_COUNT_ONE) {
    if (coordinator.isShuttingDown || dispatchedCount >= maxDispatchesPerPass) {
      break;
    }
    const step = evaluateSinglePartitionCureStep(
      coordinator,
      services[index],
      nowMs,
      sharedPassCensus,
    );
    if (!step) {
      continue;
    }
    evaluatedCount += CURE_COUNT_ONE;
    if (
      step.decision.state ===
        USER_TABLE_LEADER_PLACEMENT_CURE_STATE.DISPATCH_HANDOFF
    ) {
      dispatchedCount += CURE_COUNT_ONE;
      await dispatchLeaderHandoff(step.context, step.decision, nowMs);
    }
  }
  return {
    cancelled: Boolean(coordinator.isShuttingDown),
    dispatchedCount,
    evaluatedCount,
  };
}

function startCoordinatorPartitionLeaderPlacementCurePass(
  coordinator,
  maxDispatchesPerPass,
) {
  const partitionServices =
    resolveCoordinatorLocalPartitionServices(coordinator);
  if (
    !(partitionServices instanceof Map) ||
    partitionServices.size === CURE_COUNT_ZERO
  ) {
    return {
      inFlightPromise: null,
      settledResult: IDLE_CURE_PASS_RESULT,
    };
  }
  const nowMs = coordinator.nowFn();
  const sharedPassCensus = buildSharedLeaderPlacementPassCensus(
    coordinator,
    nowMs,
  );
  const services = [...partitionServices.values()];
  let evaluatedCount = CURE_COUNT_ZERO;
  for (
    let index = CURE_COUNT_ZERO;
    index < services.length;
    index += CURE_COUNT_ONE
  ) {
    if (coordinator.isShuttingDown) {
      break;
    }
    const step = evaluateSinglePartitionCureStep(
      coordinator,
      services[index],
      nowMs,
      sharedPassCensus,
    );
    if (!step) {
      continue;
    }
    evaluatedCount += CURE_COUNT_ONE;
    if (
      step.decision.state ===
        USER_TABLE_LEADER_PLACEMENT_CURE_STATE.DISPATCH_HANDOFF
    ) {
      return {
        inFlightPromise: continueCoordinatorCurePassWithHandoffs({
          coordinator,
          dispatchedCount: CURE_COUNT_ZERO,
          evaluatedCount,
          firstStep: step,
          maxDispatchesPerPass,
          nowMs,
          services,
          sharedPassCensus,
          startIndex: index + CURE_COUNT_ONE,
        }),
        settledResult: IDLE_CURE_PASS_RESULT,
      };
    }
  }
  return {
    inFlightPromise: null,
    settledResult: {
      cancelled: Boolean(coordinator.isShuttingDown),
      dispatchedCount: CURE_COUNT_ZERO,
      evaluatedCount,
    },
  };
}

function bindInFlightCoordinatorCurePromise(coordinator, custody, rawPromise) {
  let cancelPass = NOOP_CANCEL_PASS;
  const cancelPromise = new Promise((resolve) => {
    cancelPass = () => resolve({
      cancelled: true,
      dispatchedCount: CURE_COUNT_ZERO,
      evaluatedCount: CURE_COUNT_ZERO,
    });
  });
  custody.cancelInFlightPass = cancelPass;
  custody.inFlight = true;
  const onShutdown = () => {
    cancelPass();
  };
  coordinator.once?.(REBALANCE_COORDINATOR_EVENT.SHUTDOWN, onShutdown);
  const passPromise = Promise.race([rawPromise, cancelPromise])
    .then((passResult) => {
      custody.lastPassResult = passResult;
      return passResult;
    })
    .finally(() => {
      coordinator.removeListener?.(
        REBALANCE_COORDINATOR_EVENT.SHUTDOWN,
        onShutdown,
      );
      if (custody.lastPromise === passPromise) {
        custody.cancelInFlightPass = NOOP_CANCEL_PASS;
        custody.inFlight = false;
        custody.lastPromise = IDLE_CURE_PASS_PROMISE;
      }
    });
  custody.lastPromise = passPromise;
  coordinator.leaderPlacementCureSweepPromise = passPromise;
  return passPromise;
}

function launchCoordinatorPartitionLeaderPlacementCure(coordinator) {
  if (!coordinator) {
    return IDLE_CURE_PASS_PROMISE;
  }
  const custody = resolveCoordinatorLeaderPlacementCureCustody(coordinator);
  if (coordinator.isShuttingDown) {
    custody.cancelInFlightPass();
    return custody.lastPromise;
  }
  if (custody.inFlight === true) {
    return custody.lastPromise;
  }
  const passStart = startCoordinatorPartitionLeaderPlacementCurePass(
    coordinator,
    custody.maxDispatchesPerPass,
  );
  if (passStart.inFlightPromise !== null) {
    return bindInFlightCoordinatorCurePromise(
      coordinator,
      custody,
      passStart.inFlightPromise,
    );
  }
  custody.lastPassResult = passStart.settledResult;
  return Promise.resolve(passStart.settledResult);
}

async function reconcileCoordinatorPartitionLeaderPlacementCure(coordinator) {
  return launchCoordinatorPartitionLeaderPlacementCure(coordinator);
}

async function reconcileMessageGroupMembershipDebt(coordinator) {
  const result =
    await coordinator.workflowOwner.reconcileMessageGroupMembershipDebt();
  void launchCoordinatorPartitionLeaderPlacementCure(coordinator);
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

export {
  MAX_COORDINATOR_CURE_HANDOFFS_PER_PASS,
  checkTimeouts,
  reconcileOrphanedOperations,
  getTimeoutForStep,
  reconcileTimeoutOperation,
  reconcileOperationLifecycle,
  handleExecutorOutcome,
  reconcileExecutorOutcome,
  isPreSyncStep,
  reconcileRecoveryOperation,
  launchCoordinatorPartitionLeaderPlacementCure,
  reconcileCoordinatorPartitionLeaderPlacementCure,
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
};
