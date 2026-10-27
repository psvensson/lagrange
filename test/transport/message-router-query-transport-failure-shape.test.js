// The router's query transport, restated for the delivery envelope (design
// section 3.1 Q3). A resolved query transport hands back its record of the
// inner delivery, whose envelope passes through unchanged: a DELIVERED
// transport with the partition's answer, including the answer's own
// deferral. A rejected query transport is a thrown Error, read through the
// transport owner's one thrown-error conversion: a deferred outcome becomes
// the router's deferral, anything else rejects. There is no second state
// enum: the transport owner's delivery state is the one vocabulary.
import {test} from '../../src/test-helpers/tap.js';
import {ROUTER_ERROR_MSG} from '../../src/constants/transport.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {ROUTER_CONNECTION_CLOSED_ERROR_CODE} from
  '../../src/transport/transport-error-codes.js';
import {
  TRANSPORT_DELIVERY_OUTCOME_STATE as STATE,
  buildDeliveryEnvelope,
} from '../../src/transport/transport-semantic-outcome.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

const TEXT = 'Connection to node closed';
const RETRY_HINT_MS = 30;
const MESSAGE_ID = 'query-failure-shape';
const FALLBACK = ROUTER_ERROR_MSG.QUERY_MESSAGE_GROUP_TRANSPORT_REQUIRED;
const QUERY = Object.freeze({type: 'QUERY', sql: 'SELECT 1', params: []});

function thrownFailure() {
  return Object.assign(new Error(TEXT), {code: ROUTER_CONNECTION_CLOSED_ERROR_CODE,
    deferRetry: true, retryAfterMs: RETRY_HINT_MS});
}

function errorShape(error) {
  return {message: error.message, code: error.code, deferRetry: error.deferRetry,
    retryAfterMs: error.retryAfterMs};
}

async function startRouter(t, nodeId) {
  const router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION, nodeId});
  await router.initialize({startServer: false});
  t.teardown(() => router.shutdown());
  return router;
}

test('query transport failures are read through the owner conversion only',
  async (t) => {
    const router = await startRouter(t, 'query-failure-shape-node');
    const deferred = (failure) =>
      router.buildCanonicalDeferredQueryTransportOutcome(MESSAGE_ID, MESSAGE_ID, failure);
    t.same(deferred(thrownFailure()), {messageId: MESSAGE_ID, correlationId: MESSAGE_ID,
      acknowledged: false, error: TEXT, deferRetry: true, retryAfterMs: RETRY_HINT_MS,
      errorCode: ROUTER_CONNECTION_CLOSED_ERROR_CODE},
    'a thrown Error yields the canonical deferred outcome');
    const notAnError = deferred({message: TEXT, code: ROUTER_CONNECTION_CLOSED_ERROR_CODE,
      deferRetry: true});
    t.same({error: notAnError.error, errorCode: notAnError.errorCode},
      {error: FALLBACK, errorCode: undefined},
      'a value that is not an Error carries no failure fact');
    t.same(errorShape(router.buildQueryTransportFailureError(thrownFailure())),
      {message: TEXT, code: ROUTER_CONNECTION_CLOSED_ERROR_CODE, deferRetry: true,
        retryAfterMs: RETRY_HINT_MS},
      'a thrown Error yields the failure error');
  });

test('the query transport passes its inner delivery through and rejects hard failures',
  async (t) => {
    const router = await startRouter(t, 'query-failure-state-node');
    let send;
    router.setQueryMessageGroupServiceResolver(() => ({sendMessage: () => send()}));
    const answer = {success: false, deferRetry: true, retryAfterMs: RETRY_HINT_MS};
    send = async () => ({delivery: buildDeliveryEnvelope({acknowledged: true}, answer)});
    const delivered = await router.deliver('node-2/partition/p1', QUERY);
    t.same({state: delivered.transport.deliveryState, answer: delivered.answer},
      {state: STATE.DELIVERED, answer},
      'a delivered answer is handed to its consumer with its own deferral');
    send = async () => {
      throw Object.assign(new Error(TEXT), {retryAfterMs: RETRY_HINT_MS});
    };
    t.equal((await router.deliver('node-2/partition/p1', QUERY)).transport.deliveryState,
      STATE.DEFERRED, 'a thrown failure carrying a retry hint is deferred');
    send = async () => {
      throw Object.assign(new Error(TEXT), {code: ROUTER_CONNECTION_CLOSED_ERROR_CODE});
    };
    t.equal((await router.deliver('node-2/partition/p1', QUERY)).transport.deliveryState,
      STATE.DEFERRED, 'a thrown deferred transport code is deferred');
    const hard = new Error(TEXT);
    send = async () => {
      throw hard;
    };
    const rejected = await router.deliver('node-2/partition/p1', QUERY).then(
      () => null, (error) => error);
    t.equal(rejected, hard, 'a plain thrown failure rejects to the query caller');
    t.equal(hard.deferRetry, undefined,
      'a hard failure rethrown to the query caller carries no deferral it did not have');
  });
