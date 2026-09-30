/**
 * Constants for EndpointService.
 */

const ENDPOINT_SUBSYSTEM = 'endpoint-service';

const ENDPOINT_SVC_STATE = Object.freeze({
  CREATED: 'created',
  INITIALIZED: 'initialized',
  STOPPED: 'stopped',
});

const ENDPOINT_SVC_LOG_MSG = Object.freeze({
  INITIALIZED: 'EndpointService initialized',
  STOPPED: 'EndpointService stopped',
});

const ENDPOINT_SVC_ERROR_MSG = Object.freeze({
  MISSING_NODE_ID: 'EndpointService requires nodeId',
  MISSING_OWNER: 'EndpointService requires serviceEndpointsOwner',
  NOT_INITIALIZED: 'EndpointService must be initialized first',
});

export {
  ENDPOINT_SUBSYSTEM,
  ENDPOINT_SVC_STATE,
  ENDPOINT_SVC_LOG_MSG,
  ENDPOINT_SVC_ERROR_MSG,
};
