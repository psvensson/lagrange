// The transport's one delivery-failure decision (transport-delivery-failure.js)
// is exhaustive: every code the router emits and every delivery reason maps,
// under every acknowledgement state, to exactly one named outcome. The
// assertions are generated from the table and from the router's code
// vocabularies, so a new router code or reason fails here until decided.

import {readFileSync, readdirSync} from 'node:fs';
import {test} from '../../src/test-helpers/tap.js';
import * as TRANSPORT_ERROR_CODES from
  '../../src/transport/transport-error-codes.js';
import * as ROUTER_INVARIANT_ERROR_CODES from
  '../../src/transport/transport-router-invariant-error-codes.js';
import {
  TRANSPORT_ACKNOWLEDGEMENT as ACK,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE as REASON,
  buildDeliveryEnvelope,
  classifyThrownDeliveryError,
  forwardedDeliveryAnswer,
} from '../../src/transport/transport-semantic-outcome.js';
import {
  TRANSPORT_DELIVERY_FAILURE as FAILURE,
  TRANSPORT_DELIVERY_FAILURE_BY_CODE,
  TRANSPORT_DELIVERY_FAILURE_BY_REASON,
  buildTransportFailureError,
  classifyTransportDeliveryFailure,
  mayResendAfterTransportFailure,
  transportErrorCodeOf,
} from '../../src/transport/transport-delivery-failure.js';
import {ROUTER_ERROR_MSG, TRANSPORT_ERROR_MSG} from
  '../../src/constants/transport.js';

const OUTCOMES = new Set(Object.values(FAILURE));
const ACKS = Object.values(ACK);
const EMITTED_CODES = [...Object.values(TRANSPORT_ERROR_CODES),
  ...Object.values(ROUTER_INVARIANT_ERROR_CODES)];

function assertRowDecided(t, table, key) {
  const row = Object.hasOwn(table, key) ? table[key] : null;
  t.ok(row !== null, `${key} has a row`);
  for (const acknowledgement of ACKS) {
    t.ok(OUTCOMES.has(row?.[acknowledgement]),
      `${key} x ${acknowledgement} is exactly one named outcome ` +
      `(${row?.[acknowledgement]})`);
  }
  t.ok(typeof row?.reason === 'string' && row.reason.length > 0,
    `${key} carries its reason`);
}

test('every router-emitted code is decided under every acknowledgement',
  async (t) => {
    for (const code of EMITTED_CODES) {
      assertRowDecided(t, TRANSPORT_DELIVERY_FAILURE_BY_CODE, code);
    }
    t.same(Object.keys(TRANSPORT_DELIVERY_FAILURE_BY_CODE).sort(),
      [...EMITTED_CODES].sort(), 'the table decides no code the router lacks');
  });

test('every delivery reason is decided under every acknowledgement',
  async (t) => {
    for (const reason of Object.values(REASON)) {
      assertRowDecided(t, TRANSPORT_DELIVERY_FAILURE_BY_REASON, reason);
    }
  });

// The router's sources raise only codes from its two vocabularies: a code
// written inline at a producer would bypass the table.
test('the router raises no code outside its vocabularies', async (t) => {
  const dir = new URL('../../src/transport/', import.meta.url);
  const inline = [];
  for (const name of readdirSync(dir)) {
    if (!name.startsWith('message-router-') || !name.endsWith('.js')) continue;
    const source = readFileSync(new URL(name, dir), 'utf8');
    for (const match of source.matchAll(/\bcode:\s*'([^']+)'|\.code\s*=\s*'([^']+)'/g)) {
      inline.push(`${name}: ${match[1] ?? match[2]}`);
    }
  }
  t.same(inline, [], 'no inline code literal in a router producer');
});

test('the decisions the consumers rely on', async (t) => {
  const envelope = (facts) => buildDeliveryEnvelope(facts);
  const cases = [
    ['backpressure, no frame', {errorCode:
      TRANSPORT_ERROR_CODES.OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
    error: ROUTER_ERROR_MSG.outboundQueueBackpressured('n2', 1)},
    FAILURE.NOT_SENT],
    ['no connection', {errorCode: TRANSPORT_ERROR_CODES
      .ROUTER_NO_CONNECTION_ERROR_CODE,
    error: ROUTER_ERROR_MSG.noConnectionToNode('n2')}, FAILURE.NOT_SENT],
    ['query transport not ready', {errorCode: TRANSPORT_ERROR_CODES
      .ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE}, FAILURE.NOT_SENT],
    ['connect timeout', {errorCode: TRANSPORT_ERROR_CODES
      .WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE}, FAILURE.NOT_SENT],
    ['closed before send', {errorCode: TRANSPORT_ERROR_CODES
      .ROUTER_CONNECTION_CLOSED_ERROR_CODE, recoverableBeforeSend: true,
    error: ROUTER_ERROR_MSG.connectionClosed('n2')}, FAILURE.NOT_SENT],
    ['closed after the frame left', {errorCode: TRANSPORT_ERROR_CODES
      .ROUTER_CONNECTION_CLOSED_ERROR_CODE,
    acknowledgement: ACK.UNACKNOWLEDGED}, FAILURE.AMBIGUOUS],
    ['ACK wait spent before any frame left', {errorCode: TRANSPORT_ERROR_CODES
      .ROUTER_MESSAGE_TIMEOUT_ERROR_CODE, acknowledgement: ACK.NOT_SENT},
    FAILURE.NOT_SENT],
    ['ACK wait spent after the frame left', {errorCode: TRANSPORT_ERROR_CODES
      .ROUTER_MESSAGE_TIMEOUT_ERROR_CODE, acknowledgement: ACK.UNACKNOWLEDGED,
    error: TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT}, FAILURE.AMBIGUOUS],
    ['answer timeout', {errorCode: TRANSPORT_ERROR_CODES
      .ROUTER_MESSAGE_TIMEOUT_ERROR_CODE, acknowledgement: ACK.ACKNOWLEDGED,
    error: ROUTER_ERROR_MSG.PENDING_RESPONSE_TIMEOUT}, FAILURE.AMBIGUOUS],
    ['no handler', {acknowledged: true, noHandler: true}, FAILURE.WRONG_OWNER],
    ['handler threw', {errorCode: TRANSPORT_ERROR_CODES
      .ROUTER_HANDLER_FAILED_ERROR_CODE}, FAILURE.REJECTED],
    ['negative ACK', {acknowledgement: ACK.REJECTED}, FAILURE.REJECTED],
    ['delivered', {acknowledged: true}, FAILURE.DELIVERED],
  ];
  for (const [name, facts, expected] of cases) {
    const delivery = envelope(facts);
    t.equal(classifyTransportDeliveryFailure(delivery), expected,
      `${name}: envelope`);
    if (expected === FAILURE.DELIVERED) continue;
    const thrown = buildTransportFailureError(
      classifyThrownDeliveryError(buildTransportFailureError(
        delivery.transport, 'x')), 'x');
    t.equal(classifyTransportDeliveryFailure(thrown), expected,
      `${name}: the rethrown Error keeps its outcome`);
    t.equal(classifyTransportDeliveryFailure(
      forwardedDeliveryAnswer(delivery)) !== FAILURE.NOT_TRANSPORT, true,
    `${name}: a forwarding hop's answer stays a transport failure`);
  }
});

test('a text alone, or a value with no transport fact, is no transport ' +
  'failure', async (t) => {
  for (const value of [new Error(ROUTER_ERROR_MSG.noConnectionToNode('n2')),
    new Error(ROUTER_ERROR_MSG.connectionClosed('n2')),
    new Error(TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT),
    {success: false, error: ROUTER_ERROR_MSG.noConnectionToNode('n2')},
    // The canonical field: `errorCode` on an Error is not the convention.
    Object.assign(new Error('x'), {errorCode: TRANSPORT_ERROR_CODES
      .ROUTER_NO_CONNECTION_ERROR_CODE}),
    null, 'No connection to node n2', {}]) {
    t.equal(classifyTransportDeliveryFailure(value), FAILURE.NOT_TRANSPORT,
      `${JSON.stringify(value?.message ?? value)}: not transport`);
  }
  t.equal(transportErrorCodeOf(Object.assign(new Error('x'), {code: 'C'})),
    'C', 'an Error carries code');
  t.equal(transportErrorCodeOf({errorCode: 'C', code: 'D'}), 'C',
    'an answer carries errorCode');
});

test('the re-send rule: identity decides only an ambiguous failure',
  async (t) => {
    for (const identityKeyed of [true, false]) {
      t.equal(mayResendAfterTransportFailure(FAILURE.NOT_SENT,
        {identityKeyed}), true, `not sent (${identityKeyed})`);
      t.equal(mayResendAfterTransportFailure(FAILURE.WRONG_OWNER,
        {identityKeyed}), true, `wrong owner (${identityKeyed})`);
      t.equal(mayResendAfterTransportFailure(FAILURE.AMBIGUOUS,
        {identityKeyed}), identityKeyed, `ambiguous (${identityKeyed})`);
      for (const never of [FAILURE.REJECTED, FAILURE.DELIVERED,
        FAILURE.NOT_TRANSPORT]) {
        t.equal(mayResendAfterTransportFailure(never, {identityKeyed}), false,
          `${never} (${identityKeyed})`);
      }
    }
  });
