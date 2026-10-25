import {test} from '../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {MessageRouter} from '../../src/transport/message-router.js';
import {
  OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
  ROUTER_NO_CONNECTION_ERROR_CODE,
  WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE,
} from '../../src/transport/message-router-shared-vocabulary.js';
import {deliveryTransportOf,
  TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELDS,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE,
  TRANSPORT_DELIVERY_OUTCOME_STATE,
  buildDeliveryEnvelope,
  buildHandlerFailedError,
  buildSupersededDeliveryOutcome,
  buildTransportDeliveryOutcome,
  classifyThrownDeliveryError,
  deliveryAnswerOf,
  deliveryReadingOf,
  forwardedDeliveryAnswer,
  isDeliveredTransportDeliveryOutcome,
  isSupersededTransportDeliveryOutcome,
} from '../../src/transport/transport-semantic-outcome.js';
import {ROUTER_HANDLER_FAILED_ERROR_CODE} from '../../src/transport/transport-error-codes.js';
import {isCompletedReplicaOperationAnswer} from
  '../../src/rebalancer/replica-operation-constants.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

test('transport delivery outcome grammar classifies deferred and failed deliveries',
  async (t) => {
    const deferred = buildTransportDeliveryOutcome({
      acknowledged: false,
      error: 'connection closed',
      errorCode: 'ROUTER_CONNECTION_CLOSED',
      retryAfterMs: 250,
    });
    const failed = buildTransportDeliveryOutcome({
      acknowledged: false,
      error: 'handler missing',
      noHandler: true,
    });

    t.same(
      deferred,
      {
        messageId: null,
        correlationId: null,
        recoverableBeforeSend: false,
        error: 'connection closed',
        errorCode: 'ROUTER_CONNECTION_CLOSED',
        retryAfterMs: 250,
        deliveryState: TRANSPORT_DELIVERY_OUTCOME_STATE.DEFERRED,
        deferRetry: true,
        noHandler: false,
        reasonCode:
          TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.CONNECTION_CLOSED,
      },
      'deferred delivery should expose one canonical deferred grammar',
    );
    t.equal(
      failed.deliveryState,
      TRANSPORT_DELIVERY_OUTCOME_STATE.FAILED,
      'non-deferred delivery failures should stay failed',
    );
    t.equal(
      failed.reasonCode,
      TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.NO_HANDLER,
      'no-handler failures should classify to the shared no_handler reason',
    );
  });

test('transport delivery outcome fails closed when ACK contradicts delivery metadata',
  async (t) => {
    const cases = [
      {
        label: 'explicit deferral',
        value: {acknowledged: true, deferRetry: true, retryAfterMs: 25},
        expectedState: TRANSPORT_DELIVERY_OUTCOME_STATE.DEFERRED,
      },
      {
        label: 'connection failure',
        value: {
          acknowledged: true,
          errorCode: 'ROUTER_CONNECTION_CLOSED',
        },
        expectedState: TRANSPORT_DELIVERY_OUTCOME_STATE.DEFERRED,
      },
      {
        label: 'no connection',
        value: {
          acknowledged: true,
          errorCode: ROUTER_NO_CONNECTION_ERROR_CODE,
        },
        expectedState: TRANSPORT_DELIVERY_OUTCOME_STATE.DEFERRED,
      },
      {
        label: 'queue backpressure',
        value: {
          acknowledged: true,
          errorCode: OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
        },
        expectedState: TRANSPORT_DELIVERY_OUTCOME_STATE.DEFERRED,
      },
      {
        label: 'connect timeout',
        value: {
          acknowledged: true,
          errorCode: WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE,
        },
        expectedState: TRANSPORT_DELIVERY_OUTCOME_STATE.FAILED,
      },
      {
        label: 'explicit failed delivery state',
        value: {acknowledged: true, deliveryState: 'failed'},
        expectedState: TRANSPORT_DELIVERY_OUTCOME_STATE.FAILED,
      },
    ];

    for (const {label, value, expectedState} of cases) {
      const outcome = buildTransportDeliveryOutcome(value);
      t.equal(outcome.deliveryState, expectedState,
        `${label}: ACK cannot erase contradictory transport state`);
    }
    // A replica-operation status is an answer field: transport never reads it.
    t.equal(buildTransportDeliveryOutcome({acknowledged: true, status: 'completed',
      error: 'connection failed'}).deliveryState, TRANSPORT_DELIVERY_OUTCOME_STATE.DELIVERED,
    'a completed-with-error answer shape is not a transport input');
    t.equal(isCompletedReplicaOperationAnswer({status: 'completed', error: 'boom'}), false,
      'the replica-operation answer predicate refuses a completed status with an error');
    t.equal(isCompletedReplicaOperationAnswer({status: 'completed'}), true,
      'the replica-operation answer predicate accepts a clean completion');
  });

test('message router normalizes local delivery results onto the shared delivery grammar',
  async (t) => {
    const router = new MessageRouter({
      bootIncarnation: TEST_BOOT_INCARNATION,
      nodeId: 'transport-delivery-test'});
    await router.initialize({startServer: false});

    router.register(
      'transport-delivery-test/service/test-service',
      () => ({success: true, rows: [{id: 'r1'}]}),
    );

    const result = await router.deliver(
      'transport-delivery-test/service/test-service',
      {type: 'TEST'},
    );

    t.equal(
      result.transport.deliveryState,
      TRANSPORT_DELIVERY_OUTCOME_STATE.DELIVERED,
      'delivered messages should expose the shared delivered state',
    );
    t.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(result)), true, 'delivery should remain acknowledged');
    t.same(result.answer, {success: true, rows: [{id: 'r1'}]},
      'the handler answer travels beside the transport, intact');
    t.same(Object.keys(result).sort(), ['answer', 'transport'],
      'the delivery is the one {transport, answer} envelope');

    await router.shutdown();
  });

// Owner rule for each delivery-outcome metadata field. A new metadata field
// must be classified here before the property below can pass.
const FIELD_RULE = Object.freeze({COMPUTED: 'computed', PRESERVED: 'preserved'});
const METADATA_FIELD_RULES = Object.freeze({
  deliveryState: FIELD_RULE.COMPUTED,
  deferRetry: FIELD_RULE.PRESERVED,
  errorCode: FIELD_RULE.PRESERVED,
  noHandler: FIELD_RULE.PRESERVED,
  reasonCode: FIELD_RULE.PRESERVED,
  retryAfterMs: FIELD_RULE.PRESERVED,
});
const ABSENT = Symbol('absent');
const RETRY_HINT_MS = 250;
const STATE = TRANSPORT_DELIVERY_OUTCOME_STATE;
const REASON = TRANSPORT_DELIVERY_OUTCOME_REASON_CODE;
const CLOSED_CODE = 'ROUTER_CONNECTION_CLOSED';
// Enumerated values per metadata field, plus a code application field and the
// completed-with-error evidence: canonical, contradictory and wrong-type.
const METADATA_FIELD_VALUES = Object.freeze({
  deliveryState: [ABSENT, undefined, STATE.DELIVERED, STATE.DEFERRED, STATE.FAILED, '', null,
    1,
    'DELIVERED'],
  deferRetry: [ABSENT, true, false, 'true', 'yes'],
  errorCode: [ABSENT, null, '', 'x', 'X', CLOSED_CODE, CLOSED_CODE.toLowerCase(),
    WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE],
  noHandler: [ABSENT, true, false, 1],
  reasonCode: [ABSENT, null, REASON.ACK_REJECTED],
  retryAfterMs: [ABSENT, null, 0, -5, RETRY_HINT_MS, 12.5, String(RETRY_HINT_MS)],
});
const EXTRA_DIMENSIONS = Object.freeze({
  acknowledged: [true, false],
  code: [ABSENT, ROUTER_NO_CONNECTION_ERROR_CODE.toLowerCase()],
  status: [ABSENT, 'completed'],
  error: [ABSENT, 'boom'],
});

function* enumerateMatrix(dimensions) {
  const entries = Object.entries(dimensions);
  function* expand(index, value) {
    if (index === entries.length) {
      yield {...value};
      return;
    }
    const [field, values] = entries[index];
    for (const candidate of values) {
      if (candidate === ABSENT) {
        yield* expand(index + 1, value);
      } else {
        yield* expand(index + 1, {...value, [field]: candidate});
      }
    }
  }
  yield* expand(0, {});
}

function deepEquals(actual, expected) {
  try {
    assert.deepStrictEqual(actual, expected);
    return true;
  } catch {
    return false;
  }
}

// Building again is the identity, and the outcome has the closed key set.
const CLOSED_TRANSPORT_KEYS = Object.freeze(['messageId', 'correlationId', 'recoverableBeforeSend',
  'deliveryState', 'error', ...TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELDS.filter(
    (field) => field !== 'deliveryState')].sort());

function fixedPointViolations(once) {
  return [
    ...(deepEquals(buildTransportDeliveryOutcome(once), once) ? [] : ['not idempotent']),
    ...(deepEquals(Object.keys(once).sort(), CLOSED_TRANSPORT_KEYS) ? [] :
      ['outcome keys are not the closed transport key set']),
  ];
}

// An own undefined delivery-state claim is no claim.
function undefinedClaimViolations(input, once) {
  if (!Object.hasOwn(input, 'deliveryState') || input.deliveryState !== undefined) {
    return [];
  }
  const {deliveryState: _absent, ...withoutClaim} = input;
  return deepEquals(once, buildTransportDeliveryOutcome(withoutClaim)) ? [] :
    ['an undefined claim differs from an absent one'];
}

function rewrittenFields(input, once) {
  return Object.entries(METADATA_FIELD_RULES)
    .filter(([field, rule]) => rule === FIELD_RULE.PRESERVED &&
      Object.hasOwn(input, field) && !Object.is(once[field], input[field]))
    .map(([field]) => `${field} rewritten`);
}

function stateClaimViolations(input, once) {
  const violations = [];
  if (!Object.values(STATE).includes(once.deliveryState)) {
    violations.push('unnamed delivery state');
  }
  const claim = input.deliveryState === undefined ? ABSENT : input.deliveryState;
  const failingClaim = claim !== ABSENT && claim !== STATE.DEFERRED &&
    claim !== STATE.DELIVERED;
  if (failingClaim && once.deliveryState !== STATE.FAILED) {
    violations.push('failed or unnamed claim did not fail');
  }
  if (claim === STATE.DELIVERED && once.deliveryState === STATE.DEFERRED) {
    violations.push('delivered claim became a deferral');
  }
  return violations;
}

function describeMatrixViolation(input, once) {
  const violations = [
    ...fixedPointViolations(once),
    ...undefinedClaimViolations(input, once),
    ...rewrittenFields(input, once),
    ...stateClaimViolations(input, once),
  ];
  return violations.length > 0 ?
    `${JSON.stringify(input)}: ${violations.join(', ')}` :
    null;
}

test('transport delivery outcome classifies every metadata field it owns', async (t) => {
  t.same([...TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELDS].sort(),
    Object.keys(METADATA_FIELD_RULES).sort(),
    'every owner metadata field has a computed or preserved rule');
  t.same(Object.keys(METADATA_FIELD_VALUES).sort(),
    Object.keys(METADATA_FIELD_RULES).sort(),
    'every owner metadata field is enumerated by the property matrix');
});

test('buildTransportDeliveryOutcome is a fixed point that never rewrites a supplied value',
  async (t) => {
    let size = 0;
    const violations = [];
    for (const input of enumerateMatrix({...METADATA_FIELD_VALUES, ...EXTRA_DIMENSIONS})) {
      size += 1;
      const violation = describeMatrixViolation(input,
        buildTransportDeliveryOutcome(input));
      if (violation !== null && violations.length < 10) violations.push(violation);
    }
    t.equal(size, 9 * 5 * 8 * 4 * 3 * 7 * 2 * 2 * 2 * 2, 'the whole matrix was enumerated');
    t.same(violations, [], 'every matrix input normalizes once and keeps its values');
  });

test('transport delivery outcome fails an unsupported delivery-state claim', async (t) => {
  const cases = [
    {label: 'failed claim with a retry hint', deferRetry: true,
      value: {acknowledged: true, deliveryState: STATE.FAILED, retryAfterMs: RETRY_HINT_MS}},
    {label: 'delivered claim with a retry hint', deferRetry: true,
      value: {acknowledged: true, deliveryState: STATE.DELIVERED, retryAfterMs: RETRY_HINT_MS}},
    {label: 'delivered claim on an unacknowledged answer', deferRetry: false,
      value: {acknowledged: false, deliveryState: STATE.DELIVERED}},
    {label: 'empty claim', deferRetry: false, value: {acknowledged: true, deliveryState: ''}},
    {label: 'null claim', deferRetry: false, value: {acknowledged: true, deliveryState: null}},
    {label: 'wrong-type claim', deferRetry: false,
      value: {acknowledged: true, deliveryState: 1}},
  ];
  for (const {label, value, deferRetry} of cases) {
    const outcome = buildTransportDeliveryOutcome(value);
    t.same({deliveryState: outcome.deliveryState, reasonCode: outcome.reasonCode,
      deferRetry: outcome.deferRetry},
    {deliveryState: STATE.FAILED, reasonCode: REASON.CONTRADICTORY_DELIVERY_STATE,
      deferRetry}, `${label}: the contradiction fails with its named reason`);
  }
  t.equal(buildTransportDeliveryOutcome({acknowledged: false,
    deliveryState: STATE.DEFERRED}).deliveryState, STATE.DEFERRED,
  'a deferred claim still requests deferral');
});

test('transport delivery outcome emits supplied values and computes absent ones',
  async (t) => {
    const zeroWait = buildTransportDeliveryOutcome({acknowledged: true, retryAfterMs: 0});
    t.same({deliveryState: zeroWait.deliveryState, retryAfterMs: zeroWait.retryAfterMs},
      {deliveryState: STATE.DELIVERED, retryAfterMs: 0},
      'a zero retry value is neutral and emitted as supplied');
    const lowerCase = buildTransportDeliveryOutcome({acknowledged: true,
      errorCode: CLOSED_CODE.toLowerCase()});
    t.same({deliveryState: lowerCase.deliveryState, errorCode: lowerCase.errorCode,
      reasonCode: lowerCase.reasonCode},
    {deliveryState: STATE.DELIVERED, errorCode: CLOSED_CODE.toLowerCase(), reasonCode: null},
    'only the owner constant spells a transport code; another spelling is the answer\'s own');
    const aliased = buildTransportDeliveryOutcome({acknowledged: false,
      code: ROUTER_NO_CONNECTION_ERROR_CODE});
    t.same({deliveryState: aliased.deliveryState, errorCode: aliased.errorCode,
      code: Object.hasOwn(aliased, 'code'), reasonCode: aliased.reasonCode},
    {deliveryState: STATE.FAILED, errorCode: null, code: false,
      reasonCode: REASON.ACK_REJECTED},
    'a code field is not a transport field: never repaired into errorCode, never copied');
    const messageOnly = buildTransportDeliveryOutcome({acknowledged: true,
      status: 'completed', message: 'boom'});
    t.same({deliveryState: messageOnly.deliveryState, error: messageOnly.error,
      message: Object.hasOwn(messageOnly, 'message')},
    {deliveryState: STATE.DELIVERED, error: null, message: false},
    'a message field is never read as the error text, and is not copied');
    const supplied = buildTransportDeliveryOutcome({acknowledged: true, deferRetry: 'true',
      noHandler: 1, reasonCode: REASON.ACK_REJECTED, retryAfterMs: -5});
    t.same({deferRetry: supplied.deferRetry, noHandler: supplied.noHandler,
      reasonCode: supplied.reasonCode, retryAfterMs: supplied.retryAfterMs,
      deliveryState: supplied.deliveryState},
    {deferRetry: 'true', noHandler: 1, reasonCode: REASON.ACK_REJECTED, retryAfterMs: -5,
      deliveryState: STATE.DELIVERED},
    'malformed supplied values reach the caller unchanged for their canonical owner');
  });

test('the transport owner hands supplied values through unchanged',
  async (t) => {
    const classified = buildTransportDeliveryOutcome({acknowledged: true, noHandler: 1,
      errorCode: '', retryAfterMs: 0, deferRetry: false});
    t.same({noHandler: classified.noHandler, errorCode: classified.errorCode,
      retryAfterMs: classified.retryAfterMs, deferRetry: classified.deferRetry},
    {noHandler: 1, errorCode: '', retryAfterMs: 0, deferRetry: false},
    'the builder does not coerce supplied values');
    const error = new Error('Connection closed');
    error.code = CLOSED_CODE;
    const thrown = classifyThrownDeliveryError(error);
    t.same({deliveryState: thrown.deliveryState, errorCode: thrown.errorCode,
      error: thrown.error},
    {deliveryState: STATE.DEFERRED, errorCode: CLOSED_CODE, error: 'Connection closed'},
    'a thrown error converts its message and code into the outcome it carries');
    t.equal(Object.hasOwn(thrown, 'code'), false,
      'a classified thrown error carries its code only as errorCode');
    // Classification attaches no retry hint: a supplied value stays as it is
    // and an absent one stays absent from the evidence (computed null).
    const cases = [
      [{acknowledged: false, deferRetry: true}, STATE.DEFERRED, null,
        'a deferral without a hint carries none'],
      [{acknowledged: false, deferRetry: true, retryAfterMs: 0}, STATE.DEFERRED, 0,
        'a deferral keeps its own zero hint'],
      [{acknowledged: false, deferRetry: true, retryAfterMs: -5}, STATE.DEFERRED, -5,
        'a deferral keeps its own negative hint'],
      [{acknowledged: false, deferRetry: true, retryAfterMs: '7'}, STATE.DEFERRED, '7',
        'a deferral keeps its own wrong-type hint'],
      [Object.assign(new Error('closed'), {deferRetry: true, retryAfterMs: 0}), STATE.DEFERRED,
        0, 'a thrown deferral keeps its own zero hint'],
    ];
    for (const [value, deliveryState, retryAfterMs, label] of cases) {
      const classified = value instanceof Error ? classifyThrownDeliveryError(value) :
        buildTransportDeliveryOutcome(value);
      t.same({deliveryState: classified.deliveryState,
        retryAfterMs: classified.retryAfterMs}, {deliveryState, retryAfterMs}, label);
      t.same(buildTransportDeliveryOutcome(classified), classified,
        `${label}: building again is a fixed point`);
    }
    const once = classifyThrownDeliveryError(error);
    t.same(buildTransportDeliveryOutcome(once), once,
      'building a thrown outcome again is a fixed point');
    t.same({deliveryState: classifyThrownDeliveryError({error: 'not an Error'}).deliveryState,
      reasonCode: classifyThrownDeliveryError(null).reasonCode},
    {deliveryState: STATE.FAILED, reasonCode: REASON.ACK_REJECTED},
    'a thrown value that is not an Error carries no transport fact: failed');
  });

// Absent value fields keep the values the owner computed before supplied
// values were preserved: deferral evidence, the positive retry hint, boolean
// flags and the reason ladder.
const ABSENT_FIELD_DEFAULTS = Object.freeze([
  [{acknowledged: true}, STATE.DELIVERED, false, null, null, null],
  [{acknowledged: false}, STATE.FAILED, false, null, null, REASON.ACK_REJECTED],
  [{acknowledged: false, errorCode: CLOSED_CODE}, STATE.DEFERRED, true,
    CLOSED_CODE, null, REASON.CONNECTION_CLOSED],
  [{acknowledged: false, errorCode: OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE}, STATE.DEFERRED,
    true, OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE, null, REASON.OUTBOUND_QUEUE_BACKPRESSURED],
  [{acknowledged: true, errorCode: WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE}, STATE.FAILED, false,
    WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE, null, REASON.WEBSOCKET_CONNECT_TIMEOUT],
  [{acknowledged: false, errorCode: 'ROUTER_MESSAGE_TIMEOUT'}, STATE.FAILED, false,
    'ROUTER_MESSAGE_TIMEOUT', null, REASON.MESSAGE_TIMEOUT],
  [{acknowledged: true, deliveryState: STATE.DEFERRED}, STATE.DEFERRED, true, null, null,
    REASON.TRANSPORT_DEFERRED],
]);

test('transport delivery outcome computes absent value fields as before', async (t) => {
  for (const [input, deliveryState, deferRetry, errorCode, retryAfterMs, reasonCode] of
    ABSENT_FIELD_DEFAULTS) {
    const outcome = buildTransportDeliveryOutcome(input);
    t.same({deliveryState: outcome.deliveryState, deferRetry: outcome.deferRetry,
      errorCode: outcome.errorCode, noHandler: outcome.noHandler,
      retryAfterMs: outcome.retryAfterMs, reasonCode: outcome.reasonCode},
    {deliveryState, deferRetry, errorCode, noHandler: false, retryAfterMs, reasonCode},
    `${JSON.stringify(input)}: absent fields keep their computed values`);
  }
});

// F-V3: the owner names handler_failed and superseded and its builders.
test('a handler failure is FAILED/handler_failed through the owner builders',
  async (t) => {
    const thrown = buildHandlerFailedError('handler refused');
    t.same({message: thrown.message, code: thrown.code},
      {message: 'handler refused', code: ROUTER_HANDLER_FAILED_ERROR_CODE},
      'buildHandlerFailedError carries the router handler-failed code');
    const outcome = classifyThrownDeliveryError(thrown);
    t.same({deliveryState: outcome.deliveryState, reasonCode: outcome.reasonCode,
      errorCode: outcome.errorCode, error: outcome.error, deferRetry: outcome.deferRetry},
    {deliveryState: STATE.FAILED, reasonCode: REASON.HANDLER_FAILED,
      errorCode: ROUTER_HANDLER_FAILED_ERROR_CODE, error: 'handler refused',
      deferRetry: false},
    'a handler failure is FAILED with reasonCode handler_failed, never deferred');
    t.equal(buildTransportDeliveryOutcome({acknowledged: true,
      errorCode: ROUTER_HANDLER_FAILED_ERROR_CODE}).deliveryState, STATE.FAILED,
    'the handler-failed code conflicts with an acknowledgement: FAILED wins');
  });

test('a superseded delivery is the one named DELIVERED state superseded', async (t) => {
  const superseded = buildSupersededDeliveryOutcome();
  t.same({deliveryState: superseded.deliveryState, reasonCode: superseded.reasonCode},
    {deliveryState: STATE.DELIVERED, reasonCode: REASON.SUPERSEDED},
    'superseded is DELIVERED with reasonCode superseded');
  t.equal(Object.hasOwn(superseded, 'coalesced'), false,
    'the one named state is the reason code; no second coalesced field (F-V4)');
  t.equal(Object.hasOwn(superseded, 'deliverySource'), false,
    'the superseded outcome carries no unread deliverySource (F-V4)');
  t.equal(isSupersededTransportDeliveryOutcome(superseded), true,
    'the owner predicate names it');
  t.equal(isSupersededTransportDeliveryOutcome(buildTransportDeliveryOutcome(
    {acknowledged: true})), false, 'an ordinary delivered outcome is not superseded');
  t.equal(isSupersededTransportDeliveryOutcome(buildTransportDeliveryOutcome(
    {acknowledged: false, reasonCode: REASON.SUPERSEDED})), false,
  'an undelivered outcome is never superseded');
  t.same(buildTransportDeliveryOutcome(superseded), superseded, 'it is a fixed point');
});

test('the delivery envelope carries the transport and, only when delivered, the answer',
  async (t) => {
    const answer = {success: true, rows: [1]};
    const delivered = buildDeliveryEnvelope({messageId: 'm1', correlationId: 'c1',
      acknowledged: true}, answer);
    t.ok(Object.isFrozen(delivered), 'the envelope is frozen');
    t.ok(Object.isFrozen(delivered.transport), 'its transport is frozen');
    t.same(Object.keys(delivered).sort(), ['answer', 'transport'], 'one shape');
    t.equal(delivered.answer, answer, 'the answer is carried as given');
    t.same({messageId: delivered.transport.messageId,
      deliveryState: delivered.transport.deliveryState},
    {messageId: 'm1', deliveryState: STATE.DELIVERED}, 'the transport is built by the owner');
    const failed = buildDeliveryEnvelope({acknowledged: false, error: 'no'}, answer);
    t.same({state: failed.transport.deliveryState, answer: failed.answer},
      {state: STATE.FAILED, answer: null}, 'an undelivered envelope never carries an answer');
    t.equal(buildDeliveryEnvelope({acknowledged: true}).answer, null,
      'an ACK-only delivery has a null answer');
    t.same(buildDeliveryEnvelope(delivered.transport, answer), delivered,
      'building from a built transport is a fixed point');
  });

test('a consumer reads one namespace', async (t) => {
  const delivered = buildDeliveryEnvelope({acknowledged: true}, {error: 'domain'});
  t.same(deliveryReadingOf(delivered), {error: 'domain'},
    'a delivered reading is the answer');
  t.same(deliveryReadingOf(buildDeliveryEnvelope({acknowledged: true})), {},
    'an answer-less delivered reading is an empty answer');
  const deferred = buildDeliveryEnvelope({acknowledged: false, deferRetry: true,
    error: 'later'});
  t.equal(deliveryReadingOf(deferred), deferred.transport,
    'an undelivered reading is the transport outcome itself');
});

test('a forwarder answers with the onward answer or its typed refusal', async (t) => {
  const onward = {success: true, rows: []};
  t.equal(forwardedDeliveryAnswer(buildDeliveryEnvelope({acknowledged: true}, onward)),
    onward, 'a delivered onward hop forwards its answer');
  const refusal = forwardedDeliveryAnswer(buildDeliveryEnvelope({acknowledged: false,
    error: 'closed', errorCode: CLOSED_CODE, retryAfterMs: RETRY_HINT_MS}));
  t.same(refusal, {success: false, error: 'closed', deferRetry: true,
    retryAfterMs: RETRY_HINT_MS, forwardedReasonCode: REASON.CONNECTION_CLOSED},
  'an undelivered onward hop is a typed refusal carrying its deferral at answer level');
  t.equal(isDeliveredTransportDeliveryOutcome(refusal), false,
    'the refusal is an answer, not a transport outcome');
});

// Approved D4: the public envelope has one delivery-state fact, no ACK alias.
test('Q6 D4 public transport contains no acknowledged alias', async (t) => {
  const envelope = buildDeliveryEnvelope({acknowledged: true}, {success: false});
  t.equal(Object.hasOwn(envelope.transport, 'acknowledged'), false,
    'the ACK is internal evidence; only deliveryState crosses the boundary');
  t.equal(envelope.transport.deliveryState, STATE.DELIVERED,
    'a domain refusal still arrived');
});

test('Q6 accessors accept only the router owner envelope', async (t) => {
  const answer = {success: true};
  const envelope = buildDeliveryEnvelope({acknowledged: true}, answer);
  t.equal(deliveryAnswerOf(envelope), answer, 'the owner answer is preserved');
  t.equal(deliveryTransportOf(envelope), envelope.transport, 'the outcome is not reclassified');
  t.equal(buildDeliveryEnvelope(envelope), envelope, 'an envelope is a fixed point');
  const forged = {...envelope};
  const copied = JSON.parse(JSON.stringify(envelope));
  const unreadable = new Proxy({}, {get() {
    throw new Error('must not read');
  }});
  for (const value of [null, undefined, false, {}, forged, copied, unreadable]) {
    t.equal(deliveryTransportOf(value).deliveryState, STATE.FAILED,
      'unowned values cannot supply delivery authority');
    t.equal(deliveryAnswerOf(value), null, 'unowned values supply no answer');
  }
});
