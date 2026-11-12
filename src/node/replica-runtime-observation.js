// A borrowed observation of the existing runtime publication and lifecycle
// owners. It never creates runtime-to-row provenance from a logical ID.
import {buildReplicaLifecycleMutationPredicateFromState,
  isReplicaLifecycleMutationPredicate} from
  './replica-state-machine-lifecycle-observation.js';
import {captureReplicaAdmission, isReplicaAdmissionCurrent,
  REPLICA_RUNTIME_OBSERVATION_CHANGED} from
  './replica-state-machine-serialization.js';
import {isReplicaServiceHandlerBound} from './replica-transport-handler-identity.js';

import {matchesRuntimeIncarnation} from
  '../partition/partition-runtime-publication.js';

function runtimeObservationChangedError(replicaId) {
  return Object.assign(new Error(`Replica runtime observation changed for ${replicaId}`), {
    code: REPLICA_RUNTIME_OBSERVATION_CHANGED,
    errorCode: REPLICA_RUNTIME_OBSERVATION_CHANGED,
    deferRetry: false,
  });
}

function captureReplicaRuntimeObservation(handler, replicaId) {
  const local = handler.localReplicas.get(replicaId) || null;
  const service = handler.getTrackedService(replicaId);
  const owner = handler.replicaStateMachine;
  if (!local || !service || !owner) return null;
  const tracked = owner.getState(replicaId);
  const predicate = tracked ? buildReplicaLifecycleMutationPredicateFromState(tracked) : null;
  const binding = local.runtimeBinding;
  const sourceAvailable = binding?.service === service && binding.owner === owner &&
    binding.ownerIncarnation === owner.ownerIncarnation &&
    isReplicaLifecycleMutationPredicate(predicate) &&
    matchesRuntimeIncarnation(binding.incarnation, predicate);
  return Object.freeze({handler, replicaId, local, service, port: service.raft,
    owner, ownerIncarnation: handler.ownerIncarnation, binding,
    admission: captureReplicaAdmission(owner, replicaId),
    sourceEvidence: sourceAvailable ? Object.freeze({...predicate,
      address: tracked.serviceAddress}) : null,
    timestamp: owner.now(),
  });
}

function isReplicaRuntimeObservationCurrent(observation, requireAdmission = true) {
  if (!observation) return false;
  const {handler, replicaId, local, service, port, owner, binding} = observation;
  if (handler.shuttingDown || handler.ownerIncarnation !== observation.ownerIncarnation ||
      handler.replicaStateMachine !== owner ||
      handler.localReplicas.get(replicaId) !== local ||
      handler.getTrackedService(replicaId) !== service || service.raft !== port ||
      local.runtimeBinding !== binding || binding?.service !== service ||
      binding.owner !== owner || binding.ownerIncarnation !== owner.ownerIncarnation ||
      !isReplicaServiceHandlerBound(service, owner)) return false;
  if (requireAdmission && !isReplicaAdmissionCurrent(owner, replicaId, observation.admission)) {
    return false;
  }
  const tracked = owner.getState(replicaId);
  return Boolean(tracked) && matchesRuntimeIncarnation(binding.incarnation,
    buildReplicaLifecycleMutationPredicateFromState(tracked));
}

export {captureReplicaRuntimeObservation, isReplicaRuntimeObservationCurrent,
  runtimeObservationChangedError};
