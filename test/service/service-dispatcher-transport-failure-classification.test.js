// The service dispatcher names a failed delivery from the transport's one
// delivery-failure decision (transport-delivery-failure.js): a delivery no
// frame of which left, and a wrong owner, are RETRYABLE (nothing executed);
// one that may have reached the handler is AMBIGUOUS; a refusal (the handler
// threw, a negative ACK) is TERMINAL. Driven from ServiceDispatcher.dispatch,
// the fault injected at the router port with the router's real codes, texts
// and acknowledgement facts.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {ServiceDispatcher} from '../../src/service/service-dispatcher.js';
import {REQUEST_CELL_ROUTE_CLASSIFICATION as CLASS} from
  '../../src/service/request-cell-routing-contract.js';
import {ROUTER_ERROR_MSG, TRANSPORT_ERROR_MSG} from
  '../../src/constants/transport.js';
import {
  OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
  ROUTER_CONNECTION_CLOSED_ERROR_CODE,
  ROUTER_HANDLER_FAILED_ERROR_CODE,
  ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
  ROUTER_NO_CONNECTION_ERROR_CODE,
  WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE,
} from '../../src/transport/transport-error-codes.js';
import {
  TRANSPORT_ACKNOWLEDGEMENT as ACK,
  buildDeliveryEnvelope,
} from '../../src/transport/transport-semantic-outcome.js';

const CASES = [
  ['backpressure', {errorCode: OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
    error: ROUTER_ERROR_MSG.outboundQueueBackpressured('node-a', 256),
    deferRetry: true, acknowledgement: ACK.NOT_SENT}, CLASS.RETRYABLE],
  ['no connection', {errorCode: ROUTER_NO_CONNECTION_ERROR_CODE,
    error: ROUTER_ERROR_MSG.noConnectionToNode('node-a')}, CLASS.RETRYABLE],
  ['connect timeout', {errorCode: WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE,
    error: 'WebSocket connection timeout after 2000ms'}, CLASS.RETRYABLE],
  ['closed before send', {errorCode: ROUTER_CONNECTION_CLOSED_ERROR_CODE,
    error: ROUTER_ERROR_MSG.connectionClosed('node-a'),
    recoverableBeforeSend: true, acknowledgement: ACK.NOT_SENT},
  CLASS.RETRYABLE],
  ['ACK wait spent before any frame left', {errorCode:
    ROUTER_MESSAGE_TIMEOUT_ERROR_CODE, error: TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT,
  acknowledgement: ACK.NOT_SENT}, CLASS.RETRYABLE],
  ['no handler', {acknowledged: true, noHandler: true,
    error: ROUTER_ERROR_MSG.noHandlerForAddress('node-a/service/svc-1')},
  CLASS.RETRYABLE],
  ['closed after the frame left', {errorCode:
    ROUTER_CONNECTION_CLOSED_ERROR_CODE,
  error: ROUTER_ERROR_MSG.connectionClosed('node-a'),
  acknowledgement: ACK.UNACKNOWLEDGED}, CLASS.AMBIGUOUS],
  ['answer timeout', {errorCode: ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
    error: ROUTER_ERROR_MSG.PENDING_RESPONSE_TIMEOUT,
    acknowledgement: ACK.ACKNOWLEDGED}, CLASS.AMBIGUOUS],
  ['handler threw', {errorCode: ROUTER_HANDLER_FAILED_ERROR_CODE,
    error: 'handler threw', acknowledgement: ACK.ACKNOWLEDGED}, CLASS.TERMINAL],
  ['negative ACK', {acknowledgement: ACK.REJECTED, error: 'refused'},
    CLASS.TERMINAL],
];

function dispatcherWithFault(facts) {
  return new ServiceDispatcher({
    messageRouter: {deliver: async () => buildDeliveryEnvelope(facts)},
    leaderResolver: async () => ({targetAddress: 'node-a/service/svc-1',
      targetNodeId: 'node-a'}),
    authenticate: async () => ({principalId: 'p'}),
    authorize: async () => undefined,
  });
}

const envelope = () => ({messageId: 'msg-1', serviceId: 'svc-1',
  serviceType: 'runtime_service', operation: 'query',
  payload: {sql: 'SELECT 1'}, traceId: 'trace-1'});

describe('ServiceDispatcher transport failure classification', () => {
  for (const [name, facts, expected] of CASES) {
    it(`${name} is ${expected}`, async () => {
      await assert.rejects(dispatcherWithFault(facts).dispatch(envelope()),
        (error) => {
          assert.equal(error.classification, expected, name);
          return true;
        });
    });
  }
});
