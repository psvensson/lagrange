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
import {requireReplicaRuntimeProducer} from './replica-runtime-producer.js';

function createReplicaRuntimePublication(producer, row, admission,
  expectedPredecessor = null) {
  const predicate = buildReplicaLifecycleMutationPredicateFromRow(row);
  if (!isReplicaLifecycleMutationPredicate(predicate) || !admission) {
    throw runtimePublicationRefused(row?.service_id);
  }
  const replicaId = predicate.service_id;
  requireReplicaRuntimeProducer(producer, replicaId);
  const {handler, owner, localReplicas, localServices, nodeId} = producer;
  if (predicate.node_id !== nodeId) throw runtimePublicationRefused(replicaId);
  const local = localReplicas.get(replicaId) || null;
  const predecessor = handler.getTrackedService(replicaId);
  const originalAdmission = Object.freeze({revision: admission.revision,
    sourceState: admission.sourceState});
  if (predecessor !== expectedPredecessor) throw runtimePublicationRefused(replicaId);
  const assertAdmissionCurrent = () => {
    producer.assertCurrent();
    if (owner.serviceRowPersistInFlightByServiceId.has(replicaId) ||
        owner.activationEffectByReplicaId?.has(replicaId) ||
        !isReplicaAdmissionCurrent(owner, replicaId, originalAdmission)) {
      throw runtimePublicationRefused(replicaId);
    }
  };
  return createPartitionRuntimePublication({incarnation: predicate,
    assertSourceCurrent() {
      assertAdmissionCurrent();
      if ((handler.localReplicas.get(replicaId) || null) !== local ||
          handler.getTrackedService(replicaId) !== predecessor) {
        throw runtimePublicationRefused(replicaId);
      }
    },
    assertTransitionCurrent: assertAdmissionCurrent,
    assertLifecycleOwner(_service, suppliedOwner) {
      if (suppliedOwner !== owner) throw runtimePublicationRefused(replicaId);
    },
    assertDestination(_service, destination) {
      if (destination.handler !== handler || destination.owner !== owner ||
          destination.localReplicas !== localReplicas || destination.localServices !== localServices ||
          destination.hostServices !== undefined && destination.hostServices !== producer.hostServices) {
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
  return service.runtimePublication.publish(service, binding, destination, (assertTransition) => {
    let expectedLocal = existing;
    let expectedService = predecessor;
    let expectedHost = hostPredecessor;
    let published = null;
    const assertProgressCurrent = () => {
      assertTransition();
      assertDestinationCurrent();
      if (destination.localReplicas.get(replicaId) !== expectedLocal ||
          handler.getTrackedService(replicaId) !== expectedService ||
          hostServices && hostServices.get(replicaId) !== expectedHost ||
          published !== null && (published.runtimeBinding !== binding || published.service !== service)) {
        throw runtimePublicationRefused(replicaId);
      }
    };
    assertProgressCurrent();
    published = handler.setLocalReplica(replicaId, {
      replicaId, partitionId: sourceEvidence.partition_id,
      tableName: replicaInfo.tableName,
      status: sourceEvidence.status,
      service, runtimeBinding: binding,
      createAdmissionOperationId: replicaInfo.createAdmissionOperationId,
      createAdmissionToken: replicaInfo.createAdmissionToken,
      createAttemptToken: sourceEvidence.create_attempt_token,
    });
    expectedLocal = published;
    assertProgressCurrent();
    destination.localServices.set(replicaId, service);
    expectedService = service;
    assertProgressCurrent();
    if (hostServices) {
      hostServices.set(replicaId, service);
      expectedHost = service;
    }
    assertProgressCurrent();
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
