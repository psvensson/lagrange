/**
 * Transport type constants for the transport abstraction layer.
 * These define the supported transport protocols for node communication.
 */
const TRANSPORT_TYPE = Object.freeze({
  WEBSOCKET: 'ws',
  NATS: 'nats',
  VEILID: 'veilid',
});

/**
 * Endpoint status constants for node_endpoints table.
 * Indicates whether an endpoint is currently usable.
 */
const ENDPOINT_STATUS = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
});

export {TRANSPORT_TYPE, ENDPOINT_STATUS};
