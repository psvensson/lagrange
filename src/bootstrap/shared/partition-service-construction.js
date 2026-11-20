// The host registry is published by the lifecycle caller once it owns the
// initialized replica. Keeping the previous entry in the handoff makes a
// pending construction unable to adopt or remove a later generation.
import {CREATE_ADMISSION_ERROR_CODE} from '../../node/replica-create-admission-owner.js';
import {isExactReplicaHandlerRegistered} from '../../node/replica-transport-handler-identity.js';
import {PARTITION_SERVICE_EVENT} from '../../partition/partition-service-constants.js';

const INVALID_PARTITION_CONSTRUCTION =
  'Partition factory did not provide one exact construction handoff';
const CONSTRUCTION_RETAINED = Symbol('partition-construction-retained');
const SUPERSEDED_PARTITION_CONSTRUCTION = 'Partition construction was superseded';

function supersededPartitionConstruction(replicaId) {
  return Object.assign(new Error(SUPERSEDED_PARTITION_CONSTRUCTION),
    {code: CREATE_ADMISSION_ERROR_CODE.STALE, replicaId});
}

function invalidPartitionConstruction(replicaId) {
  return Object.assign(new Error(INVALID_PARTITION_CONSTRUCTION),
    {code: CREATE_ADMISSION_ERROR_CODE.INVALID, replicaId});
}

function createPartitionConstructionHandoff(replicaId, requireCurrent) {
  let opened = null;
  let commit;
  let invalidCapture = false;
  return Object.freeze({
    get opened() {
      return opened;
    },
    retain(service, publish) {
      if (invalidCapture || opened !== null || !service) {
        invalidCapture = true;
        throw invalidPartitionConstruction(replicaId);
      }
      opened = service;
      if (typeof publish !== 'function') throw invalidPartitionConstruction(replicaId);
      requireCurrent();
      commit = publish;
      return Object.freeze({[CONSTRUCTION_RETAINED]: true, service, publish});
    },
    publish(service) {
      if (invalidCapture || service !== opened || typeof commit !== 'function') {
        throw invalidPartitionConstruction(replicaId);
      }
      requireCurrent();
      const publish = commit;
      commit = null;
      publish();
    },
  });
}

function isPartitionConstructionAcknowledged(acknowledgement, service, publish) {
  return acknowledgement?.[CONSTRUCTION_RETAINED] === true &&
    acknowledgement.service === service && acknowledgement.publish === publish;
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
  const acknowledgement = options.onPartitionConstructed?.(service, publish);
  if (!isPartitionConstructionAcknowledged(acknowledgement, service, publish)) {
    throw invalidPartitionConstruction(replicaId);
  }
  // initialize registers its transport synchronously on entry. A live
  // handler already at the address belongs to another runtime.
  if ((previous && previous.isShutdown !== true) ||
      transport.getRegisteredHandler(unifiedAddress)) {
    throw supersededPartitionConstruction(replicaId);
  }
}

export {createPartitionConstructionHandoff, exposePartitionConstruction,
  supersededPartitionConstruction};
