// Canonical router failure vocabulary shared by the router and every
// delivery-outcome consumer. Keeping these codes below both owners prevents
// either side from maintaining a partial, divergent copy.

const OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE =
  'ROUTER_OUTBOUND_QUEUE_BACKPRESSURED';
const ROUTER_CONNECTION_CLOSED_ERROR_CODE = 'ROUTER_CONNECTION_CLOSED';
// The registered handler threw: the router reached it and it produced no
// answer. One code for the LOCAL throw and the remote SERVICE_RESPONSE error.
const ROUTER_HANDLER_FAILED_ERROR_CODE = 'ROUTER_HANDLER_FAILED';
const ROUTER_MESSAGE_TIMEOUT_ERROR_CODE = 'ROUTER_MESSAGE_TIMEOUT';
const ROUTER_NO_CONNECTION_ERROR_CODE = 'ROUTER_NO_CONNECTION';
const ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE = 'ROUTER_QUERY_TRANSPORT_NOT_READY';
const WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE = 'WS_CONNECT_TIMEOUT';
// The router's refusals of a delivery its caller built wrongly (a lifetime or
// callback that is not one, a payload the wire cannot encode, a messageId
// already waiting): raised before any frame leaves and never cured by a
// re-send of the same delivery.
const ROUTER_DELIVERY_LIFETIME_INVALID_ERROR_CODE =
  'router_delivery_lifetime_invalid';
const ROUTER_DELIVERY_ENCODING_INVALID_ERROR_CODE =
  'router_delivery_encoding_invalid';
const ROUTER_DUPLICATE_PENDING_ACK_ERROR_CODE = 'router_duplicate_pending_ack';
const ROUTER_DUPLICATE_PENDING_RESPONSE_ERROR_CODE =
  'router_duplicate_pending_response';

export {
  OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
  ROUTER_CONNECTION_CLOSED_ERROR_CODE,
  ROUTER_DELIVERY_ENCODING_INVALID_ERROR_CODE,
  ROUTER_DELIVERY_LIFETIME_INVALID_ERROR_CODE,
  ROUTER_DUPLICATE_PENDING_ACK_ERROR_CODE,
  ROUTER_DUPLICATE_PENDING_RESPONSE_ERROR_CODE,
  ROUTER_HANDLER_FAILED_ERROR_CODE,
  ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
  ROUTER_NO_CONNECTION_ERROR_CODE,
  ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
  WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE,
};
