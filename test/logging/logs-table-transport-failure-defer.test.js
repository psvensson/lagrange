// The logs sink decides a failed logs-table write from the transport's one
// delivery-failure decision (transport-delivery-failure.js) plus its one
// fact: a re-write of a deferred entry is an UPSERT by its log_id, so every
// re-send is identity-keyed. A transport failure that did not leave (connect
// timeout, backpressure, no connection), a wrong owner, and an ambiguous one
// (a timeout or close after send) defer the pending entries for a later
// re-write instead of spending the inline retries and dropping them; a
// refusal (the handler threw) is not deferred. A text alone decides nothing.
import {test} from '../../src/test-helpers/tap.js';
import {shouldDeferWriteError} from
  '../../src/logging/logs-table-service-flush-helpers.js';
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
import {TRANSPORT_ACKNOWLEDGEMENT as ACK} from
  '../../src/transport/transport-semantic-outcome.js';

const routerError = (message, facts) =>
  Object.assign(new Error(message), facts);

test('transport failures defer the logs write by their outcome', async (t) => {
  for (const [name, error] of [
    ['connect timeout', routerError('WebSocket connection timeout after 2000ms',
      {code: WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE})],
    ['no connection', routerError(ROUTER_ERROR_MSG.noConnectionToNode('n2'),
      {code: ROUTER_NO_CONNECTION_ERROR_CODE})],
    ['backpressure', routerError(
      ROUTER_ERROR_MSG.outboundQueueBackpressured('n2', 256),
      {code: OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE})],
    ['closed after send', routerError(ROUTER_ERROR_MSG.connectionClosed('n2'),
      {code: ROUTER_CONNECTION_CLOSED_ERROR_CODE,
        acknowledgement: ACK.UNACKNOWLEDGED})],
    ['answer timeout', routerError(ROUTER_ERROR_MSG.PENDING_RESPONSE_TIMEOUT,
      {code: ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
        acknowledgement: ACK.ACKNOWLEDGED})],
    ['no handler', routerError(ROUTER_ERROR_MSG.noHandlerForAddress('a'),
      {noHandler: true})],
  ]) {
    t.equal(shouldDeferWriteError(error), true, `${name}: deferred`);
  }
});

test('a refusal is not deferred, and a text alone decides nothing',
  async (t) => {
    t.equal(shouldDeferWriteError(routerError('handler threw',
      {code: ROUTER_HANDLER_FAILED_ERROR_CODE})), false, 'handler failure');
    for (const text of [ROUTER_ERROR_MSG.connectionClosed('n2'),
      ROUTER_ERROR_MSG.noConnectionToNode('n2'),
      TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT]) {
      t.equal(shouldDeferWriteError(new Error(text)), false,
        `"${text}" alone`);
    }
  });
