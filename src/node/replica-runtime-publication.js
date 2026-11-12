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
  const local = handler.localReplicas.get(row?.service_id) || null;
  const predecessor = handler.getTrackedService(row?.service_id);
  const ownerIncarnation = handler.ownerIncarnation;
  const predicate = buildReplicaLifecycleMutationPredicateFromRow(row);
  if (!owner || !isReplicaLifecycleMutationPredicate(predicate) ||
      row.node_id !== handler.nodeId || predecessor !== expectedPredecessor) {
    throw runtimePublicationRefused(row?.service_id);
  }
  return createPartitionRuntimePublication({incarnation: predicate,
    assertSourceCurrent() {
      if (handler.shuttingDown || handler.ownerIncarnation !== ownerIncarnation ||
          handler.replicaStateMachine !== owner ||
          owner.replicaMutationAdmissionClosed === true ||
          owner.serviceRowPersistInFlightByServiceId.has(row.service_id) ||
          owner.activationEffectByReplicaId?.has(row.service_id) ||
          !isReplicaAdmissionCurrent(owner, row.service_id, admission) ||
          (handler.localReplicas.get(row.service_id) || null) !== local ||
          handler.getTrackedService(row.service_id) !== predecessor) {
        throw runtimePublicationRefused(row.service_id);
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
  if (existing?.service === service && existing.runtimeBinding === service.runtimeBinding &&
      existing.runtimeBinding?.owner === lifecycleOwner &&
      handler.getTrackedService(replicaId) === service) {
    service.runtimePublication.assertCurrent(service);
    return existing;
  }
  if (handler.getTrackedService(replicaId) !== expectedPredecessor ||
      lifecycleOwner.serviceRowPersistInFlightByServiceId.has(replicaId) ||
      lifecycleOwner.activationEffectByReplicaId?.has(replicaId)) {
    throw runtimePublicationRefused(replicaId);
  }
  const binding = bindPartitionRuntimeLifecycle(service, lifecycleOwner, sourceEvidence);
  const ownerIncarnation = handler.ownerIncarnation;
  const hostServices = replicaInfo.hostServices;
  return service.runtimePublication.publish(service, binding, () => {
    const published = handler.setLocalReplica(replicaId, {
      replicaId, partitionId: sourceEvidence.partition_id,
      tableName: replicaInfo.tableName,
      status: sourceEvidence.status,
      service, runtimeBinding: binding,
      createAdmissionOperationId: replicaInfo.createAdmissionOperationId,
      createAdmissionToken: replicaInfo.createAdmissionToken,
      createAttemptToken: sourceEvidence.create_attempt_token,
    });
    handler.localServices.set(replicaId, service);
    if (hostServices) hostServices.set(replicaId, service);
    return published;
  }, () => {
    const local = handler.localReplicas.get(replicaId);
    const tracked = buildReplicaLifecycleMutationPredicateFromState(
      lifecycleOwner.getState(replicaId),
    );
    if (handler.shuttingDown || handler.ownerIncarnation !== ownerIncarnation ||
        handler.replicaStateMachine !== lifecycleOwner ||
        binding.ownerIncarnation !== lifecycleOwner.ownerIncarnation ||
        lifecycleOwner.replicaMutationAdmissionClosed === true ||
        local?.runtimeBinding !== binding || local.service !== service ||
        handler.getTrackedService(replicaId) !== service ||
        hostServices && hostServices.get(replicaId) !== service ||
        !matchesRuntimeIncarnation(binding.incarnation, tracked)) {
      throw runtimePublicationRefused(replicaId);
    }
  });
}

export {createReplicaRuntimePublication, publishReplicaRuntime};
