// Host custody of exact replica objects whose shutdown has not completed.
// Routing entries may disappear or name a successor; neither settles release.
// The service remains the resource-release owner. No storage deletion is authorized here.
import {withRaftOpeningCleanupFailure} from '../raft/raft-operation-port.js';
import {REPLICA_CLEANUP_ERROR_CODE} from './replica-cleanup-constants.js';
import {REPLICA_HANDLER_EVENT, REPLICA_HANDLER_LOG_MSG} from './replica-handler-constants.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {cancelParticipantAppliedPositionObservations} from
  './participant-release-applied-position-observation.js';

const RUNTIME_CLEANUP_PENDING = 'Replica runtime cleanup is still pending';
const RUNTIME_SHUTDOWN_FAILED = 'Replica handler still owns failed runtime shutdowns';
const RELEASED_REPLICA_CREATE_ADMISSION_OWNER = null;
const AggregateErrorConstructor = AggregateError;
const objectDefineProperty = Object.defineProperty;
const symbolIterator = Symbol.iterator;

function appendFailure(failures, error) {
  objectDefineProperty(failures, failures.length,
    {value: error, writable: true, enumerable: true, configurable: true});
}

function exactFailureIterable(failures) {
  return {
    [symbolIterator]() {
      let index = 0;
      return {next() {
        if (index >= failures.length) return {done: true};
        const value = failures[index];
        index += 1;
        return {done: false, value};
      }};
    },
  };
}

/** Continue prior release before fresh physical work; this grants no CREATE authority.
 * @param {Object} handler - ReplicaHandler.
 * @param {string} replicaId - Identity being created.
 * @param {string} partitionId - Requested partition identity.
 * @return {Promise<void>} Refused while any exact old release remains unfinished.
 */
async function settlePendingReplicaRuntimeCleanup(handler, replicaId, partitionId) {
  try {
    await fenceFailedReplicaCreateRuntime(handler, replicaId, partitionId);
  } catch (cause) {
    throw Object.assign(new Error(RUNTIME_CLEANUP_PENDING, {cause}), {
      code: REPLICA_CLEANUP_ERROR_CODE.CLEANUP_IN_PROGRESS,
      replicaId, partitionId, deferRetry: true,
      ...(cause.consensus ? {consensus: cause.consensus} : {}),
    });
  }
  // A different partition's debt cannot be consumed by this request.
  for (const pending of handler.pendingRuntimeShutdowns.values()) {
    if (pending.replicaId === replicaId) {
      throw Object.assign(new Error(RUNTIME_CLEANUP_PENDING), {
        code: REPLICA_CLEANUP_ERROR_CODE.CLEANUP_IN_PROGRESS,
        replicaId, partitionId: pending.partitionId, deferRetry: true,
      });
    }
  }
}

/** Fence and release an exact failed CREATE, or retry its retained untracked object.
 * A replica under a snapshot-install episode is claimed first (the failure
 * of the create that owns it, or its superseded admission): the fence acts
 * after the episode's step in flight settled.
 * @param {Object} handler - ReplicaHandler.
 * @param {string} replicaId - Requested replica identity.
 * @param {string} partitionId - Requested partition identity.
 * @param {Object|null} fenced - Returned service, possibly never routed.
 * @param {Error|null} primary - Original CREATE error, when present.
 * @return {Promise<boolean>} Whether an owned service completed shutdown.
 */
async function fenceFailedReplicaCreateRuntime(handler, replicaId, partitionId,
  fenced = null, primary = null) {
  const service = await handler.snapshotInstallOwner.claimForCreateFailure(
    replicaId, fenced);
  const services = new Set(service ? [service] : []);
  for (const [retained, identity] of handler.pendingRuntimeShutdowns) {
    if (identity.replicaId === replicaId && identity.partitionId === partitionId) {
      services.add(retained);
    }
  }
  const errors = [];
  await Promise.all([...services].map(async (retained) => {
    try {
      await releaseReplicaRuntime(handler, retained, replicaId, partitionId, primary);
      detachReleasedRuntime(handler, retained, replicaId);
    } catch (error) {
      appendFailure(errors, error);
    }
  }));
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    throw new AggregateErrorConstructor(exactFailureIterable(errors), RUNTIME_SHUTDOWN_FAILED);
  }
  return services.size > 0;
}

/** Consume physical release debt without claiming an episode or granting deletion.
 * The caller first quiesces the episode; recreation calls from its own episode.
 * @param {Object} handler - Host custody owner.
 * @param {string} replicaId - Exact replica.
 * @param {string} partitionId - Exact partition.
 * @param {Object|null} service - Captured predecessor, never a replacement lookup.
 * @return {Promise<void>} All captured and retained objects released.
 */
async function releaseReplicaCleanupDebt(handler, replicaId, partitionId, service = null) {
  const services = new Set(service ? [service] : []);
  for (const [runtime, identity] of handler.pendingRuntimeShutdowns) {
    if (identity.replicaId === replicaId && identity.partitionId === partitionId) {
      services.add(runtime);
    }
  }
  const errors = [];
  await Promise.all([...services].map(async (runtime) => {
    try {
      await releaseReplicaRuntime(handler, runtime, replicaId, partitionId);
    } catch (error) {
      appendFailure(errors, error);
    }
  }));
  if (errors.length === 0) return;
  const cause = errors.length === 1 ? errors[0] :
    new AggregateErrorConstructor(exactFailureIterable(errors), RUNTIME_SHUTDOWN_FAILED);
  throw Object.assign(new Error(RUNTIME_CLEANUP_PENDING, {cause}), {
    code: REPLICA_CLEANUP_ERROR_CODE.RUNTIME_RELEASE_DEFERRED,
    errorCode: REPLICA_CLEANUP_ERROR_CODE.RUNTIME_RELEASE_DEFERRED,
    replicaId, partitionId, deferRetry: true,
  });
}

// Never claims an episode: an episode's own factory continuation must be able
// to release its product without waiting on itself. Register before invoking
// shutdown; concurrent callers join the exact same physical release.
/** Release one exact runtime, retaining failures and joining concurrent callers.
 * @param {Object} handler - Host custody owner.
 * @param {Object} service - Exact physical resource owner.
 * @param {string} replicaId - Replica identity.
 * @param {string} partitionId - Partition identity.
 * @param {Error|null} primary - Original opening failure.
 * @return {Promise<void>} Physical shutdown completion, never episode settlement.
 */
function releaseReplicaRuntime(handler, service, replicaId, partitionId, primary = null) {
  let retained = handler.pendingRuntimeShutdowns.get(service);
  if (retained === undefined) {
    retained = {replicaId, partitionId, primary, releaseInFlight: null, lastFailure: null};
    handler.pendingRuntimeShutdowns.set(service, retained);
  }
  if (retained.releaseInFlight) return retained.releaseInFlight;
  const {promise, resolve, reject} = Promise.withResolvers();
  retained.releaseInFlight = promise;
  const release = async () => {
    try {
      await service.shutdown();
    } catch (cleanup) {
      retained.lastFailure = cleanup;
      throw retained.primary === null ? cleanup :
        withRaftOpeningCleanupFailure(retained.primary, cleanup);
    }
    handler.pendingRuntimeShutdowns.delete(service);
  };
  release().then(resolve, (error) => {
    retained.releaseInFlight = null;
    reject(error);
  });
  return promise;
}

function detachReleasedRuntime(handler, service, replicaId) {
  if (handler.localServices.get(replicaId) === service) {
    handler.localServices.delete(replicaId);
  }
  if (handler.localReplicas.get(replicaId)?.service === service) {
    handler.setLocalReplica(replicaId, {
      service: null,
      createAdmissionOperationId: null,
      createAdmissionToken: null,
      createAttemptToken: null,
    });
  }
}

/** Shut down through the existing host owner; failed releases remain reachable.
 * @param {Object} handler - ReplicaHandler.
 * @param {Object} options - Existing injected owner dependencies.
 * @return {Promise<void>} Joined shutdown, rejected while resources remain.
 */
function shutdownReplicaHandler(handler, options) {
  if (handler.shutdownPromise) return handler.shutdownPromise;
  handler.shuttingDown = true;
  handler.initialized = false;
  const {promise, resolve, reject} = Promise.withResolvers();
  handler.shutdownPromise = promise;
  cancelParticipantAppliedPositionObservations(handler);
  const release = async () => {
    handler.logger.info(REPLICA_HANDLER_LOG_MSG.SHUTTING_DOWN, {nodeId: handler.nodeId});
    handler.replicaCreateAdmissionRecoveryRearmOwner.cancel();
    await Promise.allSettled([
      handler.replicaCreateAdmissionRecoveryTask,
      handler.participantReleaseRecovery.shutdown(),
    ].filter(Boolean));
    // The stop claims every snapshot-install episode and waits for each
    // one's step in flight; nothing is installed or opened afterwards.
    await handler.snapshotInstallOwner.shutdown();
    handler.removalConsensusExitRelease?.abort();
    for (const progress of handler.creationProgressByReplica.values()) {
      handler.creationProgressReporter.fail(progress,
        REPLICA_HANDLER_LOG_MSG.SHUTTING_DOWN, {stage: ReplicaStatus.FAILED});
    }
    await Promise.allSettled([...handler.operationTasks]);
    const services = new Set([
      ...handler.pendingRuntimeShutdowns.keys(),
      ...handler.localServices.values(),
      ...[...handler.localReplicas.values()].map((replica) => replica?.service).filter(Boolean),
    ]);
    const errors = [];
    for (const service of services) {
      try {
        await releaseReplicaRuntime(handler, service, service.replicaId, service.partitionId);
      } catch (error) {
        appendFailure(errors, error);
      }
    }
    const observationFailures = cancelParticipantAppliedPositionObservations(handler);
    for (let index = 0; index < observationFailures.length; index += 1) {
      appendFailure(errors, observationFailures[index]);
    }
    if (errors.length > 0) {
      throw new AggregateErrorConstructor(
        exactFailureIterable(errors), RUNTIME_SHUTDOWN_FAILED);
    }
    handler.creationProgressByReplica.clear();
    handler.inProgressOperations.clear();
    handler.localServices.clear();
    handler.localReplicas.clear();
    options.ReplicaCreateAdmissionOwner?.release?.(handler.replicaCreateAdmissionOwner);
    handler.replicaCreateAdmissionOwner = RELEASED_REPLICA_CREATE_ADMISSION_OWNER;
    handler.emit(REPLICA_HANDLER_EVENT.SHUTDOWN, {nodeId: handler.nodeId});
  };
  release().then(resolve, (error) => {
    if (handler.shutdownPromise === promise) handler.shutdownPromise = null;
    reject(error);
  });
  return promise;
}

export {settlePendingReplicaRuntimeCleanup, fenceFailedReplicaCreateRuntime,
  shutdownReplicaHandler, releaseReplicaRuntime, releaseReplicaCleanupDebt};
