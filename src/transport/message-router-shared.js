/**
 * Owner contract:
 * Owner: MessageRouterShared owns transport vocabulary and shared routing helpers.
 * Inputs: message envelopes, delivery source metadata, queue records, socket signals.
 * Canonical output: MESSAGE_ROUTER_SHARED constants, classifiers, and helper owners.
 * Prohibited fallbacks: no duplicate queue, source, ACK, or pressure classifiers.
 * Primary tests: test/transport/message-router.test.js.
 */
export {MESSAGE_ROUTER_SHARED} from './message-router-connection-authority.js';
