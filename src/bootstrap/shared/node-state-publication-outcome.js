import {
  buildOwnerContractOutcome,
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../../control-plane/owner-contract-outcome.js';
import {
  CONTROL_PLANE_MESSAGE_COMPLETION_KIND,
} from '../../control-plane/control-plane-constants.js';
import {
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE,
  classifyTransportDeliveryOutcome,
} from '../../transport/transport-semantic-outcome.js';
import {
  JOINING_ERROR_MSG,
} from '../node-joining-constants.js';

const LOCAL_STR_SLASH = '/';

const NODE_STATE_UPDATE_PUBLICATION_PATH = 'node_state_reporter';

const NODE_STATE_UPDATE_PUBLICATION_DEFER_STATE = Object.freeze({
  NONE: 'none',
  PENDING: 'pending',
});

const NODE_STATE_UPDATE_PUBLICATION_DEFER_REASON = Object.freeze({
  NONE: 'none',
  PUBLICATION_PRESSURE: 'publication_pressure',
});

const NODE_STATE_UPDATE_PUBLICATION_RETRY_TARGET = Object.freeze({
  NONE: 'none',
  SAME_TARGET: 'same_target',
  ALTERNATE_TARGET: 'alternate_target',
  DEFERRED_SLOT: 'deferred_slot',
});

const NODE_STATE_PUBLICATION_OWNER_LITERAL = Object.freeze({
  DURABLE_COMPLETION_MISSING:
    'Node-state publication did not reach its durable completion owner',
  FAILED: 'failed',
  SHUTTING_DOWN: 'shutting_down',
  STOPPED: 'stopped',
  NO_CONNECTION_TO_NODE: 'No connection to node',
  CONNECTION_TO_NODE: 'Connection to node',
  CLOSED: 'closed',
  MESSAGE_TIMEOUT: 'Message timeout',
  NO_HANDLER_REGISTERED_FOR_ADDRESS: 'No handler registered for address',
  FAILED_CLUSTER_MESH_RECONCILIATION:
    'Failed to reconcile cluster mesh during node-state publication',
});

function createNodeStateUpdateDeferredPublicationState(overrides = {}) {
  return {
    state: NODE_STATE_UPDATE_PUBLICATION_DEFER_STATE.NONE,
    reason: NODE_STATE_UPDATE_PUBLICATION_DEFER_REASON.NONE,
    retryAfterMs: 0,
    nextAttemptAtMs: 0,
    message: null,
    publicationMode: null,
    publicationDiagnostics: null,
    completionKind: CONTROL_PLANE_MESSAGE_COMPLETION_KIND.NOT_OBSERVED,
    completionCompleted: false,
    ...overrides,
  };
}

function buildNodeStateUpdatePublicationOutcome(overrides = {}) {
  const publicationOutcome = {
    contractState: OWNER_CONTRACT_STATE.READY,
    nextAction: OWNER_CONTRACT_NEXT_ACTION.PROCEED,
    reasonCodes: Object.freeze([]),
    retryAfterMs: 0,
    nextAttemptAtMs: 0,
    publicationMode: null,
    publicationDiagnostics: null,
    ...overrides,
  };
  const contractOutcome = buildOwnerContractOutcome({
    contractState: publicationOutcome.contractState,
    nextAction: publicationOutcome.nextAction,
  });
  const reasonCodes = Array.isArray(publicationOutcome.reasonCodes) ?
    Object.freeze([...publicationOutcome.reasonCodes]) :
    Object.freeze([]);
  return Object.freeze({
    ...publicationOutcome,
    contractState: contractOutcome.contractState,
    nextAction: contractOutcome.nextAction,
    reasonCodes,
  });
}

function buildNodeStateUpdatePublicationDiagnostics(
  targetAddress,
  publicationMode,
) {
  const targetAddressParts = String(targetAddress || '').split('/');
  return Object.freeze({
    publicationPath: NODE_STATE_UPDATE_PUBLICATION_PATH,
    targetAddress,
    targetNodeId: targetAddressParts[0] || null,
    targetServiceType: targetAddressParts[1] || null,
    targetServiceId: targetAddressParts.slice(2).join(LOCAL_STR_SLASH) ||
      null,
    nodeStatePublicationMode: publicationMode,
  });
}

function buildNodeStateUpdateDeliveryError(deliveryResult, targetAddress) {
  const deliveryOutcome =
    classifyTransportDeliveryOutcome(deliveryResult);
  const defaultErrorMessage =
    deliveryOutcome?.reasonCode ===
      TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.NO_HANDLER ?
      `${NODE_STATE_PUBLICATION_OWNER_LITERAL.NO_HANDLER_REGISTERED_FOR_ADDRESS} ${targetAddress}` :
      JOINING_ERROR_MSG.CONTROL_PLANE_MESSAGE_WAS_NOT_ACKNOWLEDGED;
  const deliveryError = new Error(
    deliveryOutcome?.error || defaultErrorMessage,
  );
  if (typeof deliveryOutcome?.errorCode === 'string') {
    deliveryError.code = deliveryOutcome.errorCode;
  }
  if (deliveryOutcome?.deferRetry === true) {
    deliveryError.deferRetry = true;
  }
  if (Number.isFinite(deliveryOutcome?.retryAfterMs)) {
    deliveryError.retryAfterMs = Math.max(
      0,
      Math.floor(deliveryOutcome.retryAfterMs),
    );
  }
  return deliveryError;
}

function buildNodeStateUpdatePublicationFailureAction(overrides = {}) {
  const failureAction = {
    retryTarget: NODE_STATE_UPDATE_PUBLICATION_RETRY_TARGET.NONE,
    retryAfterMs: 0,
    reasonCodes: Object.freeze([]),
    ...overrides,
  };
  const contractOutcome = buildOwnerContractOutcome({
    contractState: failureAction.contractState,
    nextAction: failureAction.nextAction,
  });
  const reasonCodes = Array.isArray(failureAction.reasonCodes) ?
    Object.freeze([...failureAction.reasonCodes]) :
    Object.freeze([]);
  return Object.freeze({
    ...failureAction,
    contractState: contractOutcome.contractState,
    nextAction: contractOutcome.nextAction,
    reasonCodes,
  });
}

function resolveNodeStateUpdateRetryAfterMs(error, failureAction) {
  if (Number.isFinite(error?.retryAfterMs)) {
    return Math.max(0, Math.floor(error.retryAfterMs));
  }
  if (
    Number.isFinite(failureAction?.retryAfterMs) &&
    failureAction.retryAfterMs > 0
  ) {
    return Math.floor(failureAction.retryAfterMs);
  }
  return null;
}

function buildNodeStateUpdatePublicationFailureError(
  error,
  publicationDiagnostics,
  failureAction,
) {
  const wrappedError = new Error(
    JOINING_ERROR_MSG.controlPlaneMessageFailed(error.message),
  );
  wrappedError.cause = error;
  wrappedError.publicationDiagnostics = publicationDiagnostics;
  wrappedError.contractState = failureAction.contractState;
  wrappedError.nextAction = failureAction.nextAction;
  wrappedError.reasonCodes = failureAction.reasonCodes;
  if (typeof error?.code === 'string' && error.code.length > 0) {
    wrappedError.code = error.code;
  }
  if (error?.deferRetry === true) {
    wrappedError.deferRetry = true;
  }
  const retryAfterMs = resolveNodeStateUpdateRetryAfterMs(error, failureAction);
  if (Number.isFinite(retryAfterMs)) {
    wrappedError.retryAfterMs = retryAfterMs;
  }
  return wrappedError;
}

export {
  NODE_STATE_PUBLICATION_OWNER_LITERAL,
  NODE_STATE_UPDATE_PUBLICATION_DEFER_REASON,
  NODE_STATE_UPDATE_PUBLICATION_DEFER_STATE,
  NODE_STATE_UPDATE_PUBLICATION_PATH,
  NODE_STATE_UPDATE_PUBLICATION_RETRY_TARGET,
  buildNodeStateUpdateDeliveryError,
  buildNodeStateUpdatePublicationDiagnostics,
  buildNodeStateUpdatePublicationFailureAction,
  buildNodeStateUpdatePublicationFailureError,
  buildNodeStateUpdatePublicationOutcome,
  createNodeStateUpdateDeferredPublicationState,
};
