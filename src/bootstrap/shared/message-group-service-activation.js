import {AddressManager} from '../../address/address-manager.js';
import {MessageGroupServiceRowOwner} from
  '../../message-group/message-group-service-row-owner.js';
import {isExactReplicaHandlerRegistered} from
  '../../node/replica-transport-handler-identity.js';
import {
  isRetryableControlPlaneError,
} from '../../control-plane/control-plane-error-classification.js';
import {
  ENTITY_TYPE,
} from '../../constants/index.js';


const MESSAGE_GROUP_SERVICE_ACTIVATION_ERROR = Object.freeze({
  NODE_ID_REQUIRED:
    'Message-group service activation requires nodeId',
  WRITER_REQUIRED:
    'Message-group service activation requires system table writer',
  LIFECYCLE_OWNER_REQUIRED:
    'Message-group service activation requires the replica lifecycle owner',
  ROUTER_REQUIRED:
    'Message-group service activation requires router registration lookup',
  HANDLER_REQUIRED:
    'Message-group service activation requires handler registration',
  ENDPOINTS_REQUIRED:
    'Message-group service activation requires endpoint publication',
  replicaHandlerRequired: (replicaId) =>
    'Message-group service activation requires replica handler ' +
    `registration for ${replicaId}`,
});
function resolveReplicaUnifiedAddress(nodeId, replicaId, service) {
  if (service &&
      typeof service.getUnifiedAddress === 'function') {
    return service.getUnifiedAddress();
  }
  if (typeof service?.unifiedAddress === 'string' &&
      service.unifiedAddress.length > 0) {
    return service.unifiedAddress;
  }
  return AddressManager.getInstance().format(
    nodeId,
    ENTITY_TYPE.MESSAGE_GROUP,
    replicaId,
  );
}

function isTransientActivationError(error) {
  return isRetryableControlPlaneError(error);
}

async function activateMessageGroupServiceRows(options = {}) {
  if (typeof options.nodeId !== 'string' || options.nodeId.length === 0) {
    throw new Error(MESSAGE_GROUP_SERVICE_ACTIVATION_ERROR.NODE_ID_REQUIRED);
  }
  const systemTableWriter = options.systemTableWriter || null;
  if (!systemTableWriter) {
    throw new Error(MESSAGE_GROUP_SERVICE_ACTIVATION_ERROR.WRITER_REQUIRED);
  }
  if (!options.replicaStateMachine) {
    throw new Error(
      MESSAGE_GROUP_SERVICE_ACTIVATION_ERROR.LIFECYCLE_OWNER_REQUIRED,
    );
  }
  const handlerReady = options.messageGroupServiceHandler != null ||
    options.handlerRegistered === true;
  if (handlerReady !== true) {
    throw new Error(MESSAGE_GROUP_SERVICE_ACTIVATION_ERROR.HANDLER_REQUIRED);
  }
  if (options.endpointsPublished !== true) {
    throw new Error(MESSAGE_GROUP_SERVICE_ACTIVATION_ERROR.ENDPOINTS_REQUIRED);
  }
  const isReplicaHandlerRegistered =
    typeof options.isReplicaHandlerRegistered === 'function' ?
      options.isReplicaHandlerRegistered :
      options.messageRouter &&
        typeof options.messageRouter.isRegistered === 'function' ?
        (replicaId, service) => isExactReplicaHandlerRegistered(
          options.messageRouter,
          resolveReplicaUnifiedAddress(options.nodeId, replicaId, service),
          service?.transportHandler,
        ) :
        null;
  if (!isReplicaHandlerRegistered) {
    throw new Error(MESSAGE_GROUP_SERVICE_ACTIVATION_ERROR.ROUTER_REQUIRED);
  }

  const messageGroupServices = options.messageGroupServices instanceof Map ?
    options.messageGroupServices :
    new Map();
  const owner = new MessageGroupServiceRowOwner({
    systemTableWriter,
    replicaStateMachine: options.replicaStateMachine,
    now: typeof options.now === 'function' ?
      options.now :
      () => Date.now(),
  });
  const resolveExtraFields =
    typeof options.resolveExtraFields === 'function' ?
      options.resolveExtraFields :
      () => null;
  const activationEntries = [];
  let activatedCount = 0;

  for (const [replicaId, service] of messageGroupServices.entries()) {
    const groupId = service?.groupId || null;
    if (typeof groupId !== 'string' || groupId.length === 0) {
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
    activationEntries.push({groupId, replicaId, service});
  }

  for (const {groupId, replicaId, service} of activationEntries) {
    try {
      await owner.activateReplica({
        groupId,
        replicaId,
        nodeId: options.nodeId,
        service,
        extraFields: resolveExtraFields(replicaId, service),
        registrationEvidence:
          options.registrationEvidenceByReplicaId?.get?.(replicaId),
        // Checked inside the replica's lifecycle lane immediately before the
        // ACTIVE CAS (the preflight above is only an early refusal).
        isEffectHandlerCurrent: () =>
          isReplicaHandlerRegistered(replicaId, service) === true,
      });
      activatedCount += 1;
    } catch (error) {
      if (options.deferTransientFailures === true &&
          isTransientActivationError(error)) {
        if (typeof options.onDeferredActivation === 'function') {
          await Promise.resolve(options.onDeferredActivation({
            groupId,
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
  activateMessageGroupServiceRows,
  MESSAGE_GROUP_SERVICE_ACTIVATION_ERROR,
};
