import {ControlPlaneField} from './control-plane-constants.js';

const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const OWN_DATA_VALUE_FIELD = 'value';

// Routed identity is read only from own data properties: an inherited,
// accessor or polluted field is absent, never coerced.
function readOwnData(source, field) {
  if (!source || typeof source !== 'object') {
    return undefined;
  }
  const descriptor = objectGetOwnPropertyDescriptor(source, field);
  return descriptor && objectHasOwn(descriptor, OWN_DATA_VALUE_FIELD) ?
    descriptor.value :
    undefined;
}

/**
 * The routed wire shape of one node lifecycle publication request. The
 * routed reporter serializes a request into NODE_STATE_UPDATE publication
 * options, and the receiving message-group replica rebuilds the identical
 * request from the message; neither side makes a lifecycle decision.
 */

/**
 * Publication options for NodeStatePublicationOwner carrying one request.
 * Identity (node id, address, boot incarnation) is stamped by the sender.
 * @param {Object} request - Node lifecycle publication request.
 * @return {Object}
 */
function nodeStateUpdateOptionsFromLifecycleRequest(request = {}) {
  return {
    state: request.state,
    capabilities: request.capabilities,
    heartbeatAt: request.heartbeatAt,
    heartbeatOnly: request.heartbeatOnly === true,
    nodeRow: request.telemetry,
    nodeStatePublicationMode: request.publicationMode,
    requireDurableCompletion: request.requireDurableCompletion === true,
  };
}

/**
 * Rebuild the node lifecycle publication request from a routed
 * NODE_STATE_UPDATE message.
 * @param {Object} payload - NODE_STATE_UPDATE message payload.
 * @return {Object}
 */
function nodeLifecycleRequestFromMessage(payload) {
  return {
    nodeId: readOwnData(payload, ControlPlaneField.NODE_ID),
    bootIncarnation: readOwnData(payload, ControlPlaneField.BOOT_INCARNATION),
    state: readOwnData(payload, ControlPlaneField.STATE),
    heartbeatOnly: readOwnData(payload, ControlPlaneField.HEARTBEAT_ONLY) === true,
    heartbeatAt: readOwnData(payload, ControlPlaneField.HEARTBEAT_AT),
    nodeAddress: readOwnData(payload, ControlPlaneField.NODE_ADDRESS),
    capabilities: readOwnData(payload, ControlPlaneField.CAPABILITIES),
    telemetry: readOwnData(payload, ControlPlaneField.NODE_ROW) || null,
    publicationMode: readOwnData(
      payload,
      ControlPlaneField.NODE_STATE_PUBLICATION_MODE,
    ),
  };
}

export {
  nodeLifecycleRequestFromMessage,
  nodeStateUpdateOptionsFromLifecycleRequest,
};
