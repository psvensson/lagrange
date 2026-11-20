// The host registry is published by the lifecycle caller once it owns the
// initialized replica. Keeping the previous entry in the handoff makes a
// pending construction unable to adopt or remove a later generation.
import {CREATE_ADMISSION_ERROR_CODE} from '../../node/replica-create-admission-owner.js';
import {isExactReplicaHandlerRegistered} from '../../node/replica-transport-handler-identity.js';
import {PARTITION_SERVICE_EVENT} from '../../partition/partition-service-constants.js';

const SUPERSEDED_PARTITION_CONSTRUCTION = 'Partition construction was superseded';

function supersededPartitionConstruction(replicaId) {
  return Object.assign(new Error(SUPERSEDED_PARTITION_CONSTRUCTION),
    {code: CREATE_ADMISSION_ERROR_CODE.STALE, replicaId});
}

function exposePartitionConstruction(options, service, registry, onPublished) {
  const {replicaId, unifiedAddress, transport} = service;
  const previous = registry.get(replicaId);
  const publish = () => {
    if (registry.get(replicaId) !== previous || service.isShutdown ||
        !isExactReplicaHandlerRegistered(transport, unifiedAddress, service.transportHandler)) {
      throw supersededPartitionConstruction(replicaId);
    }
    registry.set(replicaId, service);
    service.once(PARTITION_SERVICE_EVENT.SHUTDOWN, () => {
      if (registry.get(replicaId) === service) registry.delete(replicaId);
    });
    onPublished?.();
  };
  options.onPartitionConstructed(service, publish);
  // initialize registers its transport synchronously on entry. A live
  // handler already at the address belongs to another runtime.
  if ((previous && previous.isShutdown !== true) ||
      transport.getRegisteredHandler(unifiedAddress)) {
    throw supersededPartitionConstruction(replicaId);
  }
}

export {exposePartitionConstruction, supersededPartitionConstruction};
