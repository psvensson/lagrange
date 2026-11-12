// ReplicaHandler's existing publication record supplies one producer lease.
// The lease captures local admission before asynchronous construction and is
// consumed by the exact constructed runtime, never by an ID-only reread.
import {bindPartitionRuntimeLifecycle, createPartitionRuntimePublication,
  matchesRuntimeIncarnation, runtimePublicationRefused} from
  '../partition/partition-runtime-publication.js';
import {isReplicaAdmissionCurrent} from './replica-state-machine-serialization.js';
import {buildReplicaLifecycleMutationPredicateFromRow,
  buildReplicaLifecycleMutationPredicateFromState,
  isReplicaLifecycleMutationPredicate} from './replica-state-machine-lifecycle-observation.js';

function createReplicaRuntimePublication(handler, row, admission,
  expectedPredecessor = null) {
  const owner = handler.replicaStateMachine;
  const predicate = buildReplicaLifecycleMutationPredicateFromRow(row);
  if (!owner || !isReplicaLifecycleMutationPredicate(predicate) ||
      predicate.node_id !== handler.nodeId || !admission) {
    throw runtimePublicationRefused(row?.service_id);
  }
  const replicaId = predicate.service_id;
  const localReplicas = handler.localReplicas;
  const localServices = handler.localServices;
  const local = localReplicas.get(replicaId) || null;
  const predecessor = handler.getTrackedService(replicaId);
  const ownerIncarnation = handler.ownerIncarnation;
  const lifecycleIncarnation = owner.ownerIncarnation;
  const originalAdmission = Object.freeze({revision: admission.revision,
    sourceState: admission.sourceState});
  if (predecessor !== expectedPredecessor) throw runtimePublicationRefused(replicaId);
  return createPartitionRuntimePublication({incarnation: predicate,
    assertSourceCurrent() {
      if (handler.shuttingDown || handler.ownerIncarnation !== ownerIncarnation ||
          handler.replicaStateMachine !== owner ||
          owner.ownerIncarnation !== lifecycleIncarnation ||
          handler.localReplicas !== localReplicas || handler.localServices !== localServices ||
          owner.replicaMutationAdmissionClosed === true ||
          owner.serviceRowPersistInFlightByServiceId.has(replicaId) ||
          owner.activationEffectByReplicaId?.has(replicaId) ||
          !isReplicaAdmissionCurrent(owner, replicaId, originalAdmission) ||
          (handler.localReplicas.get(replicaId) || null) !== local ||
          handler.getTrackedService(replicaId) !== predecessor) {
        throw runtimePublicationRefused(replicaId);
      }
    },
    assertLifecycleOwner(_service, suppliedOwner) {
      if (suppliedOwner !== owner) throw runtimePublicationRefused(replicaId);
    },
    assertDestination(_service, destination) {
      if (destination.handler !== handler || destination.owner !== owner ||
          destination.localReplicas !== localReplicas || destination.localServices !== localServices) {
        throw runtimePublicationRefused(replicaId);
      }
    },
  });
}

function publishReplicaRuntime(handler, replicaInfo, expectedPredecessor = null) {
  const {replicaId, service, sourceEvidence, lifecycleOwner} = replicaInfo;
  const existing = handler.localReplicas.get(replicaId);
  if (handler.shuttingDown || !service || !sourceEvidence ||
      lifecycleOwner !== handler.replicaStateMachine ||
      sourceEvidence.service_id !== replicaId ||
      sourceEvidence.node_id !== handler.nodeId ||
      !matchesRuntimeIncarnation(service.runtimePublication?.incarnation, sourceEvidence)) {
    throw runtimePublicationRefused(replicaId);
  }
  const destination = Object.freeze({handler, owner: lifecycleOwner,
    localReplicas: handler.localReplicas, localServices: handler.localServices,
    hostServices: replicaInfo.hostServices});
  service.runtimePublication.assertDestination(service, destination);
  if (existing?.service === service && existing.runtimeBinding === service.runtimeBinding &&
      existing.runtimeBinding?.owner === lifecycleOwner &&
      handler.getTrackedService(replicaId) === service &&
      service.runtimePublication.isPublished(service, existing.runtimeBinding)) {
    service.runtimePublication.assertCurrent(service);
    return existing;
  }
  const predecessor = service.runtimePublication.publicationPredecessor(service,
    destination, expectedPredecessor);
  if (handler.getTrackedService(replicaId) !== predecessor ||
      lifecycleOwner.serviceRowPersistInFlightByServiceId.has(replicaId) ||
      lifecycleOwner.activationEffectByReplicaId?.has(replicaId)) {
    throw runtimePublicationRefused(replicaId);
  }
  const binding = bindPartitionRuntimeLifecycle(service, lifecycleOwner, sourceEvidence);
  const ownerIncarnation = handler.ownerIncarnation;
  const hostServices = replicaInfo.hostServices;
  const hostPredecessor = hostServices?.get(replicaId);
  const assertDestinationCurrent = () => {
    const tracked = buildReplicaLifecycleMutationPredicateFromState(
      lifecycleOwner.getState(replicaId));
    if (handler.shuttingDown || handler.ownerIncarnation !== ownerIncarnation ||
        handler.replicaStateMachine !== lifecycleOwner ||
        handler.localReplicas !== destination.localReplicas ||
        handler.localServices !== destination.localServices ||
        binding.ownerIncarnation !== lifecycleOwner.ownerIncarnation ||
        lifecycleOwner.replicaMutationAdmissionClosed === true ||
        !matchesRuntimeIncarnation(binding.incarnation, tracked)) {
      throw runtimePublicationRefused(replicaId);
    }
  };
  return service.runtimePublication.publish(service, binding, destination, () => {
    assertDestinationCurrent();
    const published = handler.setLocalReplica(replicaId, {
      replicaId, partitionId: sourceEvidence.partition_id,
      tableName: replicaInfo.tableName,
      status: sourceEvidence.status,
      service, runtimeBinding: binding,
      createAdmissionOperationId: replicaInfo.createAdmissionOperationId,
      createAdmissionToken: replicaInfo.createAdmissionToken,
      createAttemptToken: sourceEvidence.create_attempt_token,
    });
    assertDestinationCurrent();
    handler.localServices.set(replicaId, service);
    assertDestinationCurrent();
    if (hostServices) {
      if (hostServices.get(replicaId) !== hostPredecessor) throw runtimePublicationRefused(replicaId);
      hostServices.set(replicaId, service);
    }
    return published;
  }, () => {
    const local = handler.localReplicas.get(replicaId);
    assertDestinationCurrent();
    if (local?.runtimeBinding !== binding || local.service !== service ||
        handler.getTrackedService(replicaId) !== service ||
        hostServices && hostServices.get(replicaId) !== service) {
      throw runtimePublicationRefused(replicaId);
    }
  });
}

export {createReplicaRuntimePublication, publishReplicaRuntime};
