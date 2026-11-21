// Process-local CREATE custody. Durable admission remains the authority for
// which operation and physical worker may use this tracked incarnation.
import {CREATE_ADMISSION_ERROR_CODE} from './replica-create-admission-owner.js';
import {isSupersededAdmissionError} from './replica-create-admission-retained-recovery.js';
import {
  awaitBoundedReplicaAdmission, hasDecidedCreateReadiness, learnerAdmissionWaitError,
  LEARNER_ADMISSION_WAIT_OUTCOME,
} from './replica-handler-voter-readiness-methods.js';
import {PARTITION_SERVICE_EVENT} from '../partition/partition-service-constants.js';
import {FRESH_CREATE_RELEASE_UNAVAILABLE} from './replica-handler-release-recovery.js';
import {isExactReplicaHandlerRegistered} from './replica-transport-handler-identity.js';
import {PARTICIPANT_RELEASE_ROUTE_SUFFIX} from
  '../partition/partition-participant-transaction-cutover-constants.js';
import {REPLICA_HANDLER_DEFAULT, REPLICA_HANDLER_PROGRESS, REPLICA_HANDLER_TYPEOF} from
  './replica-handler-constants.js';

const FRESH_CREATE_RELEASE_ROUTE_UNAVAILABLE = 'Fresh CREATE participant release route unavailable';

function requireFreshCreateReleaseRoute(handler) {
  const router = handler.messageRouter;
  if (typeof router?.deliver !== REPLICA_HANDLER_TYPEOF.FUNCTION ||
      !isExactReplicaHandlerRegistered(router,
        handler.nodeId + PARTICIPANT_RELEASE_ROUTE_SUFFIX, handler.registeredRouterHandler)) {
    throw Object.assign(new Error(FRESH_CREATE_RELEASE_ROUTE_UNAVAILABLE),
      {code: FRESH_CREATE_RELEASE_UNAVAILABLE});
  }
}

function armCreateAdmissionRecoveryRearm(handler) {
  if (handler.shuttingDown ||
      handler.replicaCreateAdmissionRecoveryRearmOwner?.current()) return;
  handler.replicaCreateAdmissionRecoveryRearmOwner?.arm?.(
    () => handler.startReplicaCreateAdmissionRecovery(),
    REPLICA_HANDLER_DEFAULT.CREATE_ADMISSION_RECOVERY_RETRY_MS,
  );
}

function lostBootPhysicalWorkerError(message) {
  return Object.assign(
    new Error(message),
    {
      code: CREATE_ADMISSION_ERROR_CODE.DEFERRED,
      errorCode: CREATE_ADMISSION_ERROR_CODE.DEFERRED,
      deferRetry: true,
      bootAuthorityUnavailable: true,
      bootIncarnationSuperseded: true,
    },
  );
}

function replicaCreateWork(handler, request) {
  const {operationId, replicaId, partitionId, createPhysicalWorkerClaim: claim} = request;
  return {
    operationId, replicaId, partitionId, claim,
    tracker: handler.inProgressOperations.get(operationId),
    service: handler.getTrackedService(replicaId),
    openedService: null,
    retiring: false,
    progress: null,
    owner: claim ? handler.getReplicaCreateAdmissionOwner() : null,
  };
}

function ownsReplicaCreateWork(handler, work) {
  const currentService = handler.getTrackedService(work.replicaId);
  return handler.inProgressOperations.get(work.operationId) === work.tracker &&
    (!work.progress?.replicaId ||
      handler.creationProgressByReplica.get(work.replicaId) === work.progress) &&
    (currentService === work.service || work.retiring && currentService === null) &&
    (!work.claim || work.owner.ownsPhysicalWorker(work.claim));
}

function requireReplicaCreateWork(handler, work) {
  if (!ownsReplicaCreateWork(handler, work) || work.openedService?.isShutdown === true) {
    throw Object.assign(new Error(`CREATE work superseded for ${work.replicaId}`), {
      code: CREATE_ADMISSION_ERROR_CODE.STALE,
    });
  }
  handler.throwIfShuttingDown();
}

function releaseReplicaCreateWork(handler, work) {
  if (work.released) return;
  work.released = true;
  stopCreateReadinessWake(work);
  const {operationId, replicaId, progress, tracker, claim, owner} = work;
  if (progress && handler.creationProgressByReplica?.get(replicaId) === progress) {
    handler.clearReplicaCreationProgress(progress);
  }
  if (tracker && handler.inProgressOperations.get(operationId) === tracker) {
    handler.inProgressOperations.delete(operationId);
  }
  if (claim) owner.releasePhysicalWorker(claim);
}

function deferredCreateActivation(work) {
  return Object.assign(new Error(`CREATE activation observation deferred for ${work.replicaId}`),
    {code: CREATE_ADMISSION_ERROR_CODE.DEFERRED});
}

async function observeCreateActivation(handler, work, deadlineAtMs, observe, onExpiry) {
  if (work.activationObservation) throw deferredCreateActivation(work);
  let observed;
  const withinBudget = await awaitBoundedReplicaAdmission(handler, () => {
    const observation = Promise.resolve().then(observe);
    work.activationObservation = observation;
    return observation.then((value) => {
      observed = value;
    }).finally(() => {
      work.activationObservation = null;
      if (work.retained && ownsReplicaCreateWork(handler, work)) {
        armCreateAdmissionRecoveryRearm(handler);
      }
    });
  }, deadlineAtMs);
  if (!withinBudget) throw (onExpiry ? onExpiry() : deferredCreateActivation(work));
  return observed;
}

function stopCreateReadinessWake(work) {
  work.stopReadinessWake?.();
  work.stopReadinessWake = null;
}

function hasDecidedCreateWorkReadiness(handler, work) {
  return hasDecidedCreateReadiness(handler, work.service, work.replicaId,
    work.voterReadinessRequired);
}

function retainCreateReadinessWake(handler, work) {
  const {operationId, replicaId, service} = work;
  const wake = () => {
    if (work.retained && ownsReplicaCreateWork(handler, work) &&
        hasDecidedCreateWorkReadiness(handler, work)) {
      armCreateAdmissionRecoveryRearm(handler);
    }
  };
  // Only real consensus evidence or a settled request can wake a parked
  // readiness observer. The service's existing learner cadence owns delivery.
  const stopConsensus = handler.consensusEvents.subscribe((event) => {
    if (event.replicaId === replicaId) wake();
  });
  const admissionSettled = (event) => {
    if (event.operationId === operationId) wake();
  };
  const serviceWithdrawn = () => armCreateAdmissionRecoveryRearm(handler);
  service.on?.(PARTITION_SERVICE_EVENT.REPLICA_ADMISSION_SETTLED, admissionSettled);
  service.on?.(PARTITION_SERVICE_EVENT.SHUTDOWN_STARTED, serviceWithdrawn);
  const stopService = handler.localServices.subscribeServiceChanges((event) => {
    if (event.replicaId !== replicaId || event.previous !== service || event.service === service) {
      return;
    }
    stopCreateReadinessWake(work);
    armCreateAdmissionRecoveryRearm(handler);
  });
  work.stopReadinessWake = () => {
    stopConsensus();
    stopService();
    service.off?.(PARTITION_SERVICE_EVENT.REPLICA_ADMISSION_SETTLED, admissionSettled);
    service.off?.(PARTITION_SERVICE_EVENT.SHUTDOWN_STARTED, serviceWithdrawn);
  };
  wake();
}

async function waitForMaterializedCreateReadiness(
  handler, work, request, deadlineAtMs, isJoiningExistingGroup) {
  const {replicaId, operationId, partitionId, service, progress} = work;
  const persistLifecycle = !request.skipLifecycleStatusPersistence;
  const joining = isJoiningExistingGroup && persistLifecycle;
  const requireDelivery = joining && typeof operationId === REPLICA_HANDLER_TYPEOF.STRING &&
    operationId.length > 0;
  if (requireDelivery && !work.admissionRequested) {
    await observeCreateActivation(handler, work, deadlineAtMs, async () => {
      await service.requestReplicaAdmission(operationId);
      work.admissionRequested = true;
    }, () => learnerAdmissionWaitError(
      replicaId, LEARNER_ADMISSION_WAIT_OUTCOME.DEADLINE_EXCEEDED));
    requireReplicaCreateWork(handler, work);
  }
  const voterRequired = handler.shouldGateActivationOnVoterReadiness(
    partitionId, operationId, isJoiningExistingGroup, request.explicitOperationType);
  work.waitingForReadiness = voterRequired || joining;
  work.voterReadinessRequired = voterRequired;
  if (voterRequired) {
    handler.updateReplicaCreationProgress(progress, {
      stage: REPLICA_HANDLER_PROGRESS.STAGE_WAITING_VOTER_READY,
    });
    await handler.waitForVoterReadyActivation(replicaId, partitionId, {
      deadlineAtMs,
      expectedService: service,
      isCreateCurrent: () => ownsReplicaCreateWork(handler, work) && !handler.shuttingDown,
    });
  } else if (joining) {
    const result = await handler.waitForLearnerAdmissionActivation(replicaId, partitionId,
      {deadlineAtMs});
    requireReplicaCreateWork(handler, work);
    if (result?.ready !== true) throw learnerAdmissionWaitError(replicaId, result?.outcome);
  }
  requireReplicaCreateWork(handler, work);
  work.waitingForReadiness = false;
  work.admissionReady = true;
}

function canRetainCreateActivation(handler, work, error) {
  return work.tracker && work.claim && !handler.shuttingDown &&
    ownsReplicaCreateWork(handler, work) && !isSupersededAdmissionError(error) &&
    [CREATE_ADMISSION_ERROR_CODE.DEFERRED, FRESH_CREATE_RELEASE_UNAVAILABLE]
      .includes(error?.code);
}

function matchesRetainedCreateActivation(expected, observed) {
  return expected?.operationId === observed.operationId &&
    expected.replicaCreatedAt === observed.replicaCreatedAt &&
    expected.admissionToken === observed.admissionToken &&
    expected.attemptToken === observed.attemptToken &&
    expected.ownerIncarnation === observed.ownerIncarnation;
}

function retireReplicaCreateWork(handler, work, error) {
  work.retiring = true;
  if (work.openedService) {
    return handler.fenceFailedReplicaCreateRuntime(
      work.replicaId, work.partitionId, work.openedService, error);
  }
}

export {
  armCreateAdmissionRecoveryRearm,
  canRetainCreateActivation,
  hasDecidedCreateWorkReadiness,
  lostBootPhysicalWorkerError,
  matchesRetainedCreateActivation,
  observeCreateActivation,
  ownsReplicaCreateWork,
  releaseReplicaCreateWork,
  replicaCreateWork,
  requireFreshCreateReleaseRoute,
  requireReplicaCreateWork,
  retainCreateReadinessWake,
  retireReplicaCreateWork,
  stopCreateReadinessWake,
  waitForMaterializedCreateReadiness,
};
