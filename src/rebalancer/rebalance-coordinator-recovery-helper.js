import {RAFT_ROLE} from '../raft/constants.js';
import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';
import {
  USER_TABLE_LEADER_PLACEMENT_CURE_STATE,
  buildSharedLeaderPlacementPassCensus,
  dispatchLeaderHandoff,
  evaluateRebalancerLeaderPlacementCurePass,
  readPartitionServiceRows,
  refreshSharedPassInFlightReplicaOperations,
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

function isCoordinatorCureActive(coordinator) {
  return Boolean(coordinator) &&
    !coordinator.isShuttingDown &&
    coordinator.isLeader !== false;
}

function isPartitionServiceLeader(service) {
  if (service.isLeader === false) {
    return false;
  }
  if (service.role !== undefined && service.role !== RAFT_ROLE.LEADER) {
    return false;
  }
  return service.isLeader === true || service.role === RAFT_ROLE.LEADER;
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
        return isPartitionServiceLeader(service);
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
  return isPartitionServiceLeader(service) &&
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
      nextCursorIndex: CURE_COUNT_ZERO,
      nextCursorPartitionId: null,
      settledPromise: IDLE_CURE_PASS_PROMISE,
    };
  } else {
    coordinator.leaderPlacementCureState.maxDispatchesPerPass =
      maxDispatchesPerPass;
  }
  return coordinator.leaderPlacementCureState;
}

function resolvePassStartIndex(services, custody) {
  if (services.length === CURE_COUNT_ZERO) {
    return CURE_COUNT_ZERO;
  }
  if (custody.nextCursorPartitionId !== null) {
    const matchIndex = services.findIndex(
      (service) => service?.partitionId === custody.nextCursorPartitionId,
    );
    if (matchIndex >= CURE_COUNT_ZERO) {
      return matchIndex;
    }
  }
  return Number.isSafeInteger(custody.nextCursorIndex) &&
    custody.nextCursorIndex >= CURE_COUNT_ZERO ?
    custody.nextCursorIndex % services.length :
    CURE_COUNT_ZERO;
}

function advanceCurePassCursor(custody, services, currentIndex) {
  if (services.length === CURE_COUNT_ZERO) {
    custody.nextCursorIndex = CURE_COUNT_ZERO;
    custody.nextCursorPartitionId = null;
    return;
  }
  const nextIndex = (currentIndex + CURE_COUNT_ONE) % services.length;
  custody.nextCursorIndex = nextIndex;
  custody.nextCursorPartitionId = services[nextIndex]?.partitionId ?? null;
}

function canDispatchServiceCureHandoff(coordinator, service, sharedPassCensus) {
  return isCoordinatorCureActive(coordinator) &&
    isEligibleCoordinatorCurePartitionService(service) &&
    isReadyLeaderPartitionService(service) &&
    !sharedPassCensus.inFlightReplicaOperationPartitionIds.has(
      service.partitionId,
    );
}

function createHandoffCancellationPredicate(
  coordinator,
  service,
  cancelController,
) {
  return () => {
    if (cancelController.cancelled) {
      return true;
    }
    if (coordinator?.isShuttingDown) {
      return true;
    }
    return Boolean(service?.isShutdown);
  };
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
  return decision ? {context, decision, service} : null;
}

async function continueCoordinatorCurePassWithHandoffs(passState) {
  const {
    cancelController,
    coordinator,
    custody,
    firstStep,
    maxDispatchesPerPass,
    nextOffset,
    nowMs,
    services,
    sharedPassCensus,
    startIndex,
  } = passState;
  let {dispatchedCount, evaluatedCount} = passState;
  dispatchedCount += CURE_COUNT_ONE;
  cancelController.dispatchedCount = dispatchedCount;
  cancelController.evaluatedCount = evaluatedCount;
  await dispatchLeaderHandoff(firstStep.context, firstStep.decision, nowMs, {
    isCancelled: createHandoffCancellationPredicate(
      coordinator,
      firstStep.service,
      cancelController,
    ),
  });
  let refreshedInFlightSinceLastWait = false;
  for (
    let offset = nextOffset;
    offset < services.length;
    offset += CURE_COUNT_ONE
  ) {
    if (
      cancelController.cancelled ||
      !isCoordinatorCureActive(coordinator) ||
      dispatchedCount >= maxDispatchesPerPass
    ) {
      break;
    }
    const stepNowMs = coordinator.nowFn();
    if (!refreshedInFlightSinceLastWait) {
      refreshSharedPassInFlightReplicaOperations(
        coordinator.systemTableCache,
        sharedPassCensus,
        stepNowMs,
      );
      refreshedInFlightSinceLastWait = true;
    }
    const serviceIndex = (startIndex + offset) % services.length;
    const service = services[serviceIndex];
    advanceCurePassCursor(custody, services, serviceIndex);
    const step = evaluateSinglePartitionCureStep(
      coordinator,
      service,
      stepNowMs,
      sharedPassCensus,
    );
    if (!step) {
      continue;
    }
    evaluatedCount += CURE_COUNT_ONE;
    cancelController.evaluatedCount = evaluatedCount;
    if (
      step.decision.state ===
        USER_TABLE_LEADER_PLACEMENT_CURE_STATE.DISPATCH_HANDOFF &&
      !cancelController.cancelled &&
      canDispatchServiceCureHandoff(coordinator, service, sharedPassCensus)
    ) {
      dispatchedCount += CURE_COUNT_ONE;
      cancelController.dispatchedCount = dispatchedCount;
      await dispatchLeaderHandoff(step.context, step.decision, stepNowMs, {
        isCancelled: createHandoffCancellationPredicate(
          coordinator,
          service,
          cancelController,
        ),
      });
      refreshedInFlightSinceLastWait = false;
    }
  }
  return {
    cancelled: Boolean(
      cancelController.cancelled || !isCoordinatorCureActive(coordinator),
    ),
    dispatchedCount,
    evaluatedCount,
  };
}

function startCoordinatorPartitionLeaderPlacementCurePass(
  coordinator,
  custody,
) {
  const partitionServices =
    resolveCoordinatorLocalPartitionServices(coordinator);
  if (
    !(partitionServices instanceof Map) ||
    partitionServices.size === CURE_COUNT_ZERO
  ) {
    return {
      cancelController: null,
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
  const startIndex = resolvePassStartIndex(services, custody);
  let evaluatedCount = CURE_COUNT_ZERO;
  for (
    let offset = CURE_COUNT_ZERO;
    offset < services.length;
    offset += CURE_COUNT_ONE
  ) {
    if (!isCoordinatorCureActive(coordinator)) {
      break;
    }
    const serviceIndex = (startIndex + offset) % services.length;
    const service = services[serviceIndex];
    advanceCurePassCursor(custody, services, serviceIndex);
    const step = evaluateSinglePartitionCureStep(
      coordinator,
      service,
      nowMs,
      sharedPassCensus,
    );
    if (!step) {
      continue;
    }
    evaluatedCount += CURE_COUNT_ONE;
    if (
      step.decision.state ===
        USER_TABLE_LEADER_PLACEMENT_CURE_STATE.DISPATCH_HANDOFF &&
      canDispatchServiceCureHandoff(coordinator, service, sharedPassCensus)
    ) {
      const cancelController = {
        cancelled: false,
        dispatchedCount: CURE_COUNT_ZERO,
        evaluatedCount,
      };
      return {
        cancelController,
        inFlightPromise: continueCoordinatorCurePassWithHandoffs({
          cancelController,
          coordinator,
          custody,
          dispatchedCount: CURE_COUNT_ZERO,
          evaluatedCount,
          firstStep: step,
          maxDispatchesPerPass: custody.maxDispatchesPerPass,
          nextOffset: offset + CURE_COUNT_ONE,
          nowMs,
          services,
          sharedPassCensus,
          startIndex,
        }),
        settledResult: IDLE_CURE_PASS_RESULT,
      };
    }
  }
  return {
    cancelController: null,
    inFlightPromise: null,
    settledResult: {
      cancelled: !isCoordinatorCureActive(coordinator),
      dispatchedCount: CURE_COUNT_ZERO,
      evaluatedCount,
    },
  };
}

function bindInFlightCoordinatorCurePromise(
  coordinator,
  custody,
  rawPromise,
  cancelController,
) {
  let cancelPass = NOOP_CANCEL_PASS;
  const cancelPromise = new Promise((resolve) => {
    cancelPass = () => {
      cancelController.cancelled = true;
      resolve({
        cancelled: true,
        dispatchedCount: cancelController.dispatchedCount,
        evaluatedCount: cancelController.evaluatedCount,
      });
    };
  });
  custody.cancelInFlightPass = cancelPass;
  custody.inFlight = true;
  const onShutdown = () => {
    cancelPass();
  };
  coordinator.once?.(REBALANCE_COORDINATOR_EVENT.SHUTDOWN, onShutdown);
  let settledPromise = IDLE_CURE_PASS_PROMISE;
  const cleanupUnderlyingPass = () => {
    coordinator.removeListener?.(
      REBALANCE_COORDINATOR_EVENT.SHUTDOWN,
      onShutdown,
    );
    if (custody.settledPromise === settledPromise) {
      custody.cancelInFlightPass = NOOP_CANCEL_PASS;
      custody.inFlight = false;
      custody.lastPromise = IDLE_CURE_PASS_PROMISE;
      custody.settledPromise = IDLE_CURE_PASS_PROMISE;
    }
  };
  settledPromise = rawPromise.then(
    () => {
      cleanupUnderlyingPass();
    },
    () => {
      cleanupUnderlyingPass();
    },
  );
  const passPromise = Promise.race([rawPromise, cancelPromise])
    .then((passResult) => {
      custody.lastPassResult = passResult;
      return passResult;
    });
  custody.lastPromise = passPromise;
  custody.settledPromise = settledPromise;
  coordinator.leaderPlacementCureSweepPromise = passPromise;
  return passPromise;
}

function launchCoordinatorPartitionLeaderPlacementCure(coordinator) {
  if (!coordinator) {
    return IDLE_CURE_PASS_PROMISE;
  }
  const custody = resolveCoordinatorLeaderPlacementCureCustody(coordinator);
  if (!isCoordinatorCureActive(coordinator)) {
    if (coordinator.isShuttingDown) {
      custody.cancelInFlightPass();
    }
    return custody.inFlight ? custody.lastPromise : IDLE_CURE_PASS_PROMISE;
  }
  if (custody.inFlight === true) {
    return custody.lastPromise;
  }
  const passStart = startCoordinatorPartitionLeaderPlacementCurePass(
    coordinator,
    custody,
  );
  if (passStart.inFlightPromise !== null) {
    return bindInFlightCoordinatorCurePromise(
      coordinator,
      custody,
      passStart.inFlightPromise,
      passStart.cancelController,
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
