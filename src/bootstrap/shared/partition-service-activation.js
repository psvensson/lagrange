import {AddressManager} from '../../address/address-manager.js';
import {PartitionServiceRowOwner} from
  '../../partition/partition-service-row-owner.js';
import {
  isRetryableControlPlaneError,
} from '../../control-plane/control-plane-error-classification.js';
import {
  ENTITY_TYPE,
  TYPEOF,
} from '../../constants/index.js';

const PARTITION_SERVICE_ACTIVATION_ERROR = Object.freeze({
  NODE_ID_REQUIRED:
    'Partition service activation requires nodeId',
  WRITER_REQUIRED:
    'Partition service activation requires system table writer',
  ROUTER_REQUIRED:
    'Partition service activation requires router registration lookup',
  runtimeRequired: (replicaId) =>
    `Partition service activation requires initialized runtime for ${replicaId}`,
  replicaHandlerRequired: (replicaId) =>
    `Partition service activation requires replica handler ` +
    `registration for ${replicaId}`,
});
function resolveReplicaUnifiedAddress(nodeId, replicaId, service) {
  if (service &&
      typeof service.getUnifiedAddress === TYPEOF.FUNCTION) {
    return service.getUnifiedAddress();
  }
  if (typeof service?.unifiedAddress === TYPEOF.STRING &&
      service.unifiedAddress.length > 0) {
    return service.unifiedAddress;
  }
  return AddressManager.getInstance().format(
    nodeId,
    ENTITY_TYPE.PARTITION,
    replicaId,
  );
}

function isTransientActivationError(error) {
  return isRetryableControlPlaneError(error);
}

async function activatePartitionServiceRows(options = {}) {
  if (typeof options.nodeId !== TYPEOF.STRING || options.nodeId.length === 0) {
    throw new Error(PARTITION_SERVICE_ACTIVATION_ERROR.NODE_ID_REQUIRED);
  }
  if (!options.systemTableWriter) {
    throw new Error(PARTITION_SERVICE_ACTIVATION_ERROR.WRITER_REQUIRED);
  }
  const isReplicaHandlerRegistered =
    typeof options.isReplicaHandlerRegistered === TYPEOF.FUNCTION ?
      options.isReplicaHandlerRegistered :
      options.messageRouter &&
        typeof options.messageRouter.isRegistered === TYPEOF.FUNCTION ?
        (replicaId, service) => {
          return options.messageRouter.isRegistered(
            resolveReplicaUnifiedAddress(options.nodeId, replicaId, service),
          );
        } :
        null;
  if (!isReplicaHandlerRegistered) {
    throw new Error(PARTITION_SERVICE_ACTIVATION_ERROR.ROUTER_REQUIRED);
  }

  const isPartitionServiceReady =
    typeof options.isPartitionServiceReady === TYPEOF.FUNCTION ?
      options.isPartitionServiceReady :
      (_replicaId, service) => service?.initialized !== false;

  const partitionServices = options.partitionServices instanceof Map ?
    options.partitionServices :
    new Map();
  const owner = new PartitionServiceRowOwner({
    systemTableWriter: options.systemTableWriter,
    now: typeof options.now === TYPEOF.FUNCTION ?
      options.now :
      () => Date.now(),
  });
  let activatedCount = 0;

  for (const [replicaId, service] of partitionServices.entries()) {
    const partitionId = service?.partitionId || null;
    if (typeof partitionId !== TYPEOF.STRING || partitionId.length === 0) {
      continue;
    }
    const runtimeReady = await Promise.resolve(
      isPartitionServiceReady(replicaId, service),
    );
    if (runtimeReady !== true) {
      throw new Error(
        PARTITION_SERVICE_ACTIVATION_ERROR.runtimeRequired(replicaId),
      );
    }
    const handlerRegistered = await Promise.resolve(
      isReplicaHandlerRegistered(replicaId, service),
    );
    if (handlerRegistered !== true) {
      throw new Error(
        PARTITION_SERVICE_ACTIVATION_ERROR.replicaHandlerRequired(
          replicaId,
        ),
      );
    }

    try {
      await owner.activateReplica({
        partitionId,
        replicaId,
        nodeId: options.nodeId,
        service,
      });
      activatedCount += 1;
    } catch (error) {
      if (options.deferTransientFailures === true &&
          isTransientActivationError(error)) {
        if (typeof options.onDeferredActivation === TYPEOF.FUNCTION) {
          await Promise.resolve(options.onDeferredActivation({
            partitionId,
            replicaId,
            nodeId: options.nodeId,
            error,
          }));
        }
        continue;
      }
      throw error;
    }
  }

  return activatedCount;
}

export {
  activatePartitionServiceRows,
  PARTITION_SERVICE_ACTIVATION_ERROR,
};
