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
const RUNTIME_SHUTDOWN_REQUIRED = 'REPLICA_RUNTIME_SHUTDOWN_REQUIRED';
const RUNTIME_CLEANUP_CUSTODY_CHANGED = 'REPLICA_RUNTIME_CLEANUP_CUSTODY_CHANGED';
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

// All replica host release paths share this exact-object custody owner. A
// concurrent caller joins the retained attempt; only explicit re-entry after
// failure starts another attempt, keeping the original primary error.
function shutdownExactReplicaRuntime(handler, replicaId, partitionId, service, primary = null) {
  const custody = handler.pendingRuntimeShutdowns;
  let cell = custody.get(service);
  if (!cell) {
    const failure = {primary};
    if (primary !== null) Object.freeze(failure);
    cell = Object.freeze({replicaId, partitionId, failure, attempt: {promise: null}});
    custody.set(service, cell);
  }
  if (cell.replicaId !== replicaId || cell.partitionId !== partitionId) {
    return Promise.reject(Object.assign(new Error(RUNTIME_CLEANUP_CUSTODY_CHANGED), {
      code: RUNTIME_CLEANUP_CUSTODY_CHANGED, deferRetry: true,
    }));
  }
  if (cell.failure.primary === null && primary !== null) {
    cell.failure.primary = primary;
    Object.freeze(cell.failure);
  }
  if (cell.attempt.promise) return cell.attempt.promise;
  const completion = Promise.withResolvers();
  cell.attempt.promise = completion.promise;
  const release = async () => {
    try {
      if (typeof service.shutdown !== 'function') {
        throw Object.assign(new Error(RUNTIME_SHUTDOWN_REQUIRED), {
          code: RUNTIME_SHUTDOWN_REQUIRED, deferRetry: false,
        });
      }
      await service.shutdown();
      if (handler.pendingRuntimeShutdowns !== custody || custody.get(service) !== cell) {
        throw Object.assign(new Error(RUNTIME_CLEANUP_CUSTODY_CHANGED), {
          code: RUNTIME_CLEANUP_CUSTODY_CHANGED, deferRetry: true,
        });
      }
      custody.delete(service);
      return true;
    } catch (cleanup) {
      throw cell.failure.primary === null ? cleanup :
        withRaftOpeningCleanupFailure(cell.failure.primary, cleanup);
    } finally {
      if (cell.attempt.promise === completion.promise) cell.attempt.promise = null;
    }
  };
  release().then(completion.resolve, completion.reject);
  return completion.promise;
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
 * @param {Object} handler - ReplicaHandler.
 * @param {string} replicaId - Requested replica identity.
 * @param {string} partitionId - Requested partition identity.
 * @param {Object|null} service - Returned service, possibly never routed.
 * @param {Error|null} primary - Original CREATE error, when present.
 * @return {Promise<boolean>} Whether an owned service completed shutdown.
 */
async function fenceFailedReplicaCreateRuntime(handler, replicaId, partitionId,
  service = null, primary = null) {
  if (!service) {
    const pending = [...handler.pendingRuntimeShutdowns].filter(([, identity]) =>
      identity.replicaId === replicaId && identity.partitionId === partitionId);
    for (const [retained] of pending) {
      await fenceFailedReplicaCreateRuntime(handler, replicaId, partitionId, retained, primary);
    }
    return pending.length > 0;
  }
  const owner = handler.replicaStateMachine;
  const ownerIncarnation = handler.ownerIncarnation;
  const local = handler.localReplicas.get(replicaId);
  const tracked = handler.localServices.get(replicaId);
  await shutdownExactReplicaRuntime(handler, replicaId, partitionId, service, primary);
  // This includes a factory whose publication failed after partially writing
  // maps: cleanup may remove only the exact records it originally captured.
  if (handler.replicaStateMachine !== owner || handler.ownerIncarnation !== ownerIncarnation ||
      handler.localReplicas.get(replicaId) !== local ||
      handler.localServices.get(replicaId) !== tracked) return true;
  if (tracked === service) {
    handler.localServices.delete(replicaId);
  }
  if (local?.service === service) {
    handler.setLocalReplica(replicaId, {
      service: null,
      createAdmissionOperationId: null,
      createAdmissionToken: null,
      createAttemptToken: null,
    });
  }
  return true;
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
    handler.removalConsensusExitRelease.abort();
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
      const retained = handler.pendingRuntimeShutdowns.get(service);
      const replicaId = retained ? retained.replicaId : service.replicaId;
      const partitionId = retained ? retained.partitionId : service.partitionId;
      try {
        await shutdownExactReplicaRuntime(handler, replicaId, partitionId, service);
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

export {shutdownExactReplicaRuntime, settlePendingReplicaRuntimeCleanup, fenceFailedReplicaCreateRuntime,
  shutdownReplicaHandler};
