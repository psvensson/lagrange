// A managed split/merge's source replication START meets a transport
// failure at the router port. START's re-send is decided from the
// transport's one delivery-failure decision (transport-delivery-failure.js):
// a failure no frame of which left (connect timeout, backpressure, no
// connection) and a wrong owner are retryable, with no START authorization
// in doubt; a failure after the frame may have reached the source (an ACK or
// answer timeout after send, a close after send) is START_ANSWER_UNKNOWN,
// which the workflow resolves by its confirmation read, never by a blind
// re-send; a refusal (the source handler threw) is not retried.
import {test} from '../../src/test-helpers/tap.js';
import {
  deliverProcessedSourceReplicationStart,
  sourceReplicationStartAnswerMayBeLost,
} from '../../src/partition/managed-source-replication-start-delivery.js';
import {isRetryableManagedSplitExecutionFailure} from
  '../../src/partition/managed-split-retry-policy.js';
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

const RETRYABLE_NOT_SENT = [
  ['connect timeout', {errorCode: WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE,
    error: 'WebSocket connection timeout after 2000ms'}],
  ['backpressure', {errorCode: OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
    error: ROUTER_ERROR_MSG.outboundQueueBackpressured('src', 256),
    deferRetry: true, acknowledgement: ACK.NOT_SENT}],
  ['no connection', {errorCode: ROUTER_NO_CONNECTION_ERROR_CODE,
    error: ROUTER_ERROR_MSG.noConnectionToNode('src')}],
  ['ACK wait spent before any frame left', {errorCode:
    ROUTER_MESSAGE_TIMEOUT_ERROR_CODE, error: TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT,
  deferRetry: true, acknowledgement: ACK.NOT_SENT}],
  ['no handler', {acknowledged: true, noHandler: true,
    error: ROUTER_ERROR_MSG.noHandlerForAddress('src/partition/p1')}],
];
const ANSWER_UNKNOWN = [
  ['ACK timeout after send', {errorCode: ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
    error: TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT, deferRetry: true,
    acknowledgement: ACK.UNACKNOWLEDGED}],
  ['answer timeout', {errorCode: ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
    error: ROUTER_ERROR_MSG.PENDING_RESPONSE_TIMEOUT, deferRetry: true,
    acknowledgement: ACK.ACKNOWLEDGED}],
  ['closed after send', {errorCode: ROUTER_CONNECTION_CLOSED_ERROR_CODE,
    error: ROUTER_ERROR_MSG.connectionClosed('src'),
    acknowledgement: ACK.UNACKNOWLEDGED}],
];

async function startThrough(facts) {
  const router = {deliver: async () => buildDeliveryEnvelope(facts)};
  try {
    await deliverProcessedSourceReplicationStart(router, 'src/partition/p1',
      {type: 'START_SPLIT_REPLICATION'}, 'START failed');
  } catch (error) {
    return error;
  }
  return null;
}

for (const [name, facts] of RETRYABLE_NOT_SENT) {
  test(`${name}: START is retryable and no authorization is in doubt`,
    async (t) => {
      const error = await startThrough(facts);
      t.ok(error, 'the refusal surfaces');
      t.equal(error.retryable, true, 'START is retried');
      t.equal(sourceReplicationStartAnswerMayBeLost(error), false,
        'no START authorization is in doubt');
      t.equal(isRetryableManagedSplitExecutionFailure(error), true,
        'the split workflow keeps the job for another attempt');
    });
}

for (const [name, facts] of ANSWER_UNKNOWN) {
  test(`${name}: START's answer is unknown; the workflow confirms it`,
    async (t) => {
      const error = await startThrough(facts);
      t.equal(sourceReplicationStartAnswerMayBeLost(error), true,
        'START_ANSWER_UNKNOWN');
      t.equal(error.retryable, true, 'resolved by the confirmation read');
    });
}

test('rejected: a source handler that threw is not retried', async (t) => {
  const error = await startThrough({errorCode: ROUTER_HANDLER_FAILED_ERROR_CODE,
    error: 'handler threw', acknowledgement: ACK.ACKNOWLEDGED});
  t.equal(error.retryable, false, 'not retried');
  t.equal(sourceReplicationStartAnswerMayBeLost(error), false,
    'a refusal is no unknown answer');
});
