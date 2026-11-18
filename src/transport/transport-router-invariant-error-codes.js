// The router's refusals of a delivery its caller built wrongly (a lifetime or
// callback that is not one, a payload the wire cannot encode, a messageId
// already waiting): raised before any frame leaves and never cured by a
// re-send of the same delivery. They reach a caller as a delivery's errorCode,
// so the transport's delivery-failure table decides them beside the
// router's failure vocabulary (transport-error-codes.js).
const ROUTER_DELIVERY_LIFETIME_INVALID_ERROR_CODE =
  'router_delivery_lifetime_invalid';
const ROUTER_DELIVERY_ENCODING_INVALID_ERROR_CODE =
  'router_delivery_encoding_invalid';
const ROUTER_DUPLICATE_PENDING_ACK_ERROR_CODE = 'router_duplicate_pending_ack';
const ROUTER_DUPLICATE_PENDING_RESPONSE_ERROR_CODE =
  'router_duplicate_pending_response';

export {
  ROUTER_DELIVERY_ENCODING_INVALID_ERROR_CODE,
  ROUTER_DELIVERY_LIFETIME_INVALID_ERROR_CODE,
  ROUTER_DUPLICATE_PENDING_ACK_ERROR_CODE,
  ROUTER_DUPLICATE_PENDING_RESPONSE_ERROR_CODE,
};
