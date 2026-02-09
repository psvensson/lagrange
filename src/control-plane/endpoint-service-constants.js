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
  REGISTERED: 'Endpoint registered',
  REMOVED: 'Endpoint removed',
  STOPPED: 'EndpointService stopped',
});

const ENDPOINT_SVC_ERROR_MSG = Object.freeze({
  MISSING_NODE_ID: 'EndpointService requires nodeId',
  MISSING_CDC: 'EndpointService requires cdcIntegrationService',
  MISSING_CACHE: 'EndpointService requires systemTableCache',
  NOT_INITIALIZED: 'EndpointService must be initialized first',
  MISSING_ENDPOINT_ID: 'Endpoint ID is required',
});

const ENDPOINT_SVC_EVENT = Object.freeze({
  REGISTERED: 'endpointRegistered',
  REMOVED: 'endpointRemoved',
});

export {
  ENDPOINT_SUBSYSTEM,
  ENDPOINT_SVC_STATE,
  ENDPOINT_SVC_LOG_MSG,
  ENDPOINT_SVC_ERROR_MSG,
  ENDPOINT_SVC_EVENT,
};
