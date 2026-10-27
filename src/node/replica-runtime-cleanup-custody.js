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
  const retainedPrimary = primary ?? handler.pendingRuntimeShutdowns.get(service)?.primary ?? null;
  handler.pendingRuntimeShutdowns.set(service, {replicaId, partitionId, primary: retainedPrimary});
  try {
    if (typeof service.shutdown === 'function') {
      await service.shutdown();
    }
  } catch (cleanup) {
    throw retainedPrimary === null ? cleanup :
      withRaftOpeningCleanupFailure(retainedPrimary, cleanup);
  }
  handler.pendingRuntimeShutdowns.delete(service);
  if (handler.localServices.get(replicaId) === service) {
    handler.localServices.delete(replicaId);
  }
  if (handler.localReplicas.get(replicaId)?.service === service) {
    handler.setLocalReplica(replicaId, {service: null});
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
        if (typeof service.shutdown === 'function') await service.shutdown();
        handler.pendingRuntimeShutdowns.delete(service);
      } catch (error) {
        appendFailure(errors, error);
        // Even a later routing change cannot discard the failed instance.
        if (!handler.pendingRuntimeShutdowns.has(service)) {
          handler.pendingRuntimeShutdowns.set(service,
            {replicaId: service.replicaId, partitionId: service.partitionId});
        }
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
  shutdownReplicaHandler};
