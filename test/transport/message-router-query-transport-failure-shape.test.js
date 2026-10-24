// The router's query-transport failure builders read a failure through the
// transport owner's one conversion: a thrown Error (message, code) and a
// delivery answer (error, errorCode) carrying the same facts yield the same
// deferred outcome and the same failure error. A non-Error object's message
// and code fields are its own application fields and are not read.
import {test} from '../../src/test-helpers/tap.js';
import {ROUTER_ERROR_MSG} from '../../src/constants/transport.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {QUERY_TRANSPORT_DELIVERY_STATE} from
  '../../src/transport/message-router-shared-vocabulary.js';
import {ROUTER_CONNECTION_CLOSED_ERROR_CODE} from
  '../../src/transport/transport-error-codes.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

const TEXT = 'Connection to node closed';
const RETRY_HINT_MS = 30;
const MESSAGE_ID = 'query-failure-shape';
const FALLBACK = ROUTER_ERROR_MSG.QUERY_MESSAGE_GROUP_TRANSPORT_REQUIRED;

function thrownFailure() {
  return Object.assign(new Error(TEXT), {code: ROUTER_CONNECTION_CLOSED_ERROR_CODE,
    deferRetry: true, retryAfterMs: RETRY_HINT_MS});
}

const ANSWER = Object.freeze({acknowledged: false, error: TEXT,
  errorCode: ROUTER_CONNECTION_CLOSED_ERROR_CODE, deferRetry: true,
  retryAfterMs: RETRY_HINT_MS});
const ALIAS_ONLY = Object.freeze({acknowledged: false, message: TEXT,
  code: ROUTER_CONNECTION_CLOSED_ERROR_CODE, deferRetry: true});

function errorShape(error) {
  return {message: error.message, code: error.code, deferRetry: error.deferRetry,
    retryAfterMs: error.retryAfterMs};
}

test('query transport failures are read through the owner conversion only',
  async (t) => {
    const router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION,
      nodeId: 'query-failure-shape-node'});
    await router.initialize({startServer: false});
    t.teardown(() => router.shutdown());
    const deferred = (failure) =>
      router.buildCanonicalDeferredQueryTransportOutcome(MESSAGE_ID, MESSAGE_ID, failure);

    const expectedDeferred = {messageId: MESSAGE_ID, correlationId: MESSAGE_ID,
      acknowledged: false, error: TEXT, deferRetry: true, retryAfterMs: RETRY_HINT_MS,
      errorCode: ROUTER_CONNECTION_CLOSED_ERROR_CODE};
    t.same(deferred(thrownFailure()), expectedDeferred,
      'a thrown Error yields the canonical deferred outcome');
    t.same(deferred(ANSWER), expectedDeferred,
      'a delivery answer with the same facts yields the same deferred outcome');
    const aliasDeferred = deferred(ALIAS_ONLY);
    t.same({error: aliasDeferred.error, errorCode: aliasDeferred.errorCode},
      {error: FALLBACK, errorCode: undefined},
      'a non-Error object\'s message and code are not read as the failure');

    const expectedError = {message: TEXT, code: ROUTER_CONNECTION_CLOSED_ERROR_CODE,
      deferRetry: true, retryAfterMs: RETRY_HINT_MS};
    t.same(errorShape(router.buildQueryTransportFailureError(thrownFailure())),
      expectedError, 'a thrown Error yields the failure error');
    t.same(errorShape(router.buildQueryTransportFailureError(ANSWER)), expectedError,
      'a delivery answer with the same facts yields the same failure error');
    const aliasError = router.buildQueryTransportFailureError(ALIAS_ONLY);
    t.same({message: aliasError.message, code: aliasError.code},
      {message: FALLBACK, code: undefined},
      'a non-Error object\'s message and code do not become the failure error');
  });

test('query transport delivery state is the transport owner state', async (t) => {
  const router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: 'query-failure-state-node'});
  await router.initialize({startServer: false});
  t.teardown(() => router.shutdown());
  const state = (failure) => router.resolveQueryTransportDeliveryState(failure);
  const cases = [
    [{acknowledged: true, success: false, deferRetry: true, retryAfterMs: RETRY_HINT_MS},
      QUERY_TRANSPORT_DELIVERY_STATE.SUCCESS,
      'an acknowledged answer is handed to its consumer with its own deferral'],
    [Object.assign(new Error(TEXT), {retryAfterMs: RETRY_HINT_MS}),
      QUERY_TRANSPORT_DELIVERY_STATE.DEFER_RETRY,
      'a thrown failure carrying a retry hint is deferred'],
    [{acknowledged: false, errorCode: ROUTER_CONNECTION_CLOSED_ERROR_CODE},
      QUERY_TRANSPORT_DELIVERY_STATE.DEFER_RETRY,
      'an unacknowledged deferred transport code is deferred'],
    [{acknowledged: false, deferRetry: true, deliveryState: 'failed'},
      QUERY_TRANSPORT_DELIVERY_STATE.HARD_FAILURE,
      'a failed claim is a hard failure even with a retry request'],
    [new Error(TEXT), QUERY_TRANSPORT_DELIVERY_STATE.HARD_FAILURE,
      'a plain thrown failure is a hard failure'],
  ];
  for (const [failure, expected, label] of cases) {
    t.equal(state(failure), expected, label);
  }
  const thrown = new Error(TEXT);
  router.buildQueryTransportFailureError(thrown);
  t.equal(thrown.deferRetry, undefined,
    'a hard failure rethrown to the query caller carries no deferral it did not have');
});
