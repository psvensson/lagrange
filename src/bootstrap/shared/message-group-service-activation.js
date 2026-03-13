import {AddressManager} from '../../address/address-manager.js';
import {MessageGroupServiceRowOwner} from
  '../../message-group/message-group-service-row-owner.js';
import {
  ENTITY_TYPE,
  TYPEOF,
} from '../../constants/index.js';

const MESSAGE_GROUP_SERVICE_ACTIVATION_ERROR = Object.freeze({
  NODE_ID_REQUIRED:
    'Message-group service activation requires nodeId',
  WRITER_REQUIRED:
    'Message-group service activation requires system table writer',
  ROUTER_REQUIRED:
    'Message-group service activation requires router registration lookup',
  HANDLER_REQUIRED:
    'Message-group service activation requires handler registration',
  ENDPOINTS_REQUIRED:
    'Message-group service activation requires endpoint publication',
  replicaHandlerRequired: (replicaId) =>
    `Message-group service activation requires replica handler ` +
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
    ENTITY_TYPE.MESSAGE_GROUP,
    replicaId,
  );
}

async function activateMessageGroupServiceRows(options = {}) {
  if (typeof options.nodeId !== TYPEOF.STRING || options.nodeId.length === 0) {
    throw new Error(MESSAGE_GROUP_SERVICE_ACTIVATION_ERROR.NODE_ID_REQUIRED);
  }
  if (!options.systemTableWriter) {
    throw new Error(MESSAGE_GROUP_SERVICE_ACTIVATION_ERROR.WRITER_REQUIRED);
  }
  if (options.handlerRegistered !== true) {
    throw new Error(MESSAGE_GROUP_SERVICE_ACTIVATION_ERROR.HANDLER_REQUIRED);
  }
  if (options.endpointsPublished !== true) {
    throw new Error(MESSAGE_GROUP_SERVICE_ACTIVATION_ERROR.ENDPOINTS_REQUIRED);
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
    throw new Error(MESSAGE_GROUP_SERVICE_ACTIVATION_ERROR.ROUTER_REQUIRED);
  }

  const messageGroupServices = options.messageGroupServices instanceof Map ?
    options.messageGroupServices :
    new Map();
  const owner = new MessageGroupServiceRowOwner({
    systemTableWriter: options.systemTableWriter,
    now: typeof options.now === TYPEOF.FUNCTION ?
      options.now :
      () => Date.now(),
  });
  const resolveExtraFields =
    typeof options.resolveExtraFields === TYPEOF.FUNCTION ?
      options.resolveExtraFields :
      () => null;
  let activatedCount = 0;

  for (const [replicaId, service] of messageGroupServices.entries()) {
    const groupId = service?.groupId || null;
    if (typeof groupId !== TYPEOF.STRING || groupId.length === 0) {
      continue;
    }
    const handlerRegistered = await Promise.resolve(
      isReplicaHandlerRegistered(replicaId, service),
    );
    if (handlerRegistered !== true) {
      throw new Error(
        MESSAGE_GROUP_SERVICE_ACTIVATION_ERROR.replicaHandlerRequired(
          replicaId,
        ),
      );
    }

    await owner.activateReplica({
      groupId,
      replicaId,
      nodeId: options.nodeId,
      service,
      extraFields: resolveExtraFields(replicaId, service),
    });
    activatedCount += 1;
  }

  return activatedCount;
}

export {
  activateMessageGroupServiceRows,
  MESSAGE_GROUP_SERVICE_ACTIVATION_ERROR,
};
