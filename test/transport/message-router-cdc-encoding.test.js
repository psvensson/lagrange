import assert from 'node:assert/strict';
import {test} from 'node:test';
import {encodeDeliveryMessage} from '../../src/transport/message-router-delivery-encoding.js';
import {withDeliveryLifetime} from '../../src/transport/message-router-delivery-lifetime.js';
import {CDC_DELIVERY_REMAINING_MS, createCdcDeliveryBudget, prepareCdcDeliveryMessage} from
  '../../src/cdc/cdc-delivery-budget.js';
import {captureCdcEvents} from '../../src/cdc/cdc-event-envelope.js';
import {CDC_OPERATION} from '../../src/constants/cdc.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {ROUTER_MESSAGE_TYPE, TRANSPORT_EVENT} from '../../src/constants/transport.js';
import {ROUTER_MESSAGE_TIMEOUT_ERROR_CODE} from '../../src/transport/transport-error-codes.js';
import {acknowledgeThenRespondFrames} from '../test-helpers/message-router-remote-answer.js';
import {CDC_ROUTER_TEST, cdcRouterFixture, controlledCdcPeer, nextTurn, realCdcPeer}
  from '../test-helpers/message-router-cdc-fixture.js';

const CASE_TIMEOUT_MS = 2000;
const ENCODING_COST_MS = 900;
const BODY_TEXT = 'Unicode: 🧭 å 漢字; apparent slot: "cdcDeliveryRemainingMs":999999 }}';

function payload() {
  return {type: 'transport-encoding-probe', [CDC_DELIVERY_REMAINING_MS]: 1,
    events: captureCdcEvents([{tableName: 'encoding_table', operation: CDC_OPERATION.INSERT,
      data: {id: 'wire-row', text: BODY_TEXT}, timestamp: 'preserved-source-stamp',
      eventKey: 'wire-occurrence', sourcePartition: 'wire-source'}])};
}

function options(extra = {}) {
  return {timeoutMs: CDC_ROUTER_TEST.BUDGET_MS,
    deliveryDurationField: CDC_DELIVERY_REMAINING_MS,
    prepareDeliveryMessage: prepareCdcDeliveryMessage, ...extra};
}

test('actual encoder stamps the remaining grant after complete body/UTF8 preparation',
  {timeout: CASE_TIMEOUT_MS}, async (t) => {
    const f = await cdcRouterFixture(t);
    const input = payload();
    const before = JSON.stringify(input.events);
    const bytes = await withDeliveryLifetime(f.router, options(), (owned) => {
      const encoded = encodeDeliveryMessage({type: ROUTER_MESSAGE_TYPE.SERVICE_MESSAGE,
        messageId: 'encoded-duration', payload: input}, owned.deliveryLifetime);
      // This controlled clock cut models time spent in already completed body
      // serialization/UTF8 preparation. It is not a measured CPU cost claim.
      f.clock.elapse(ENCODING_COST_MS);
      return encoded.stamp();
    });
    const decoded = JSON.parse(bytes.toString());
    assert.equal(decoded.payload[CDC_DELIVERY_REMAINING_MS],
      CDC_ROUTER_TEST.BUDGET_MS - ENCODING_COST_MS);
    assert.deepEqual(decoded.payload.events, input.events);
    assert.equal(JSON.stringify(input.events), before);
    assert.equal(bytes.length, Buffer.byteLength(JSON.stringify(decoded)),
      'private scalar workspace adds no bytes or whitespace to the text frame');
    // Actual receiver-budget owner, with a component service lifetime and an
    // independently offset clock. This is not a native recipient service proof.
    const receiverClock = new VirtualTimeSource({startMs: 50000});
    const receiver = {timeSource: receiverClock, initialized: true, isShutdown: false,
      raft: {}, cdcCommitLifetime: {}, groupId: 'receiver-budget',
      deliveryTimeoutMs: CDC_ROUTER_TEST.BUDGET_MS};
    const grant = createCdcDeliveryBudget(receiver,
      {receivedRemainingMs: decoded.payload[CDC_DELIVERY_REMAINING_MS]});
    assert.equal(grant.remainingMs(), CDC_ROUTER_TEST.BUDGET_MS - ENCODING_COST_MS);
    receiverClock.advance(1);
    assert.equal(grant.remainingMs(), CDC_ROUTER_TEST.BUDGET_MS - ENCODING_COST_MS - 1);
  });

test('stamp reuses the already encoded body instead of reading/encoding its descendants again',
  {timeout: CASE_TIMEOUT_MS}, async (t) => {
    const f = await cdcRouterFixture(t);
    const body = {text: BODY_TEXT};
    let rereads = 0;
    const input = {body};
    const bytes = await withDeliveryLifetime(f.router, options(), (owned) => {
      const encoded = encodeDeliveryMessage({payload: input}, owned.deliveryLifetime);
      // Encoding-only discriminator: production callers supply immutable
      // captured descendants. Removing this test-owned read after encode proves
      // stamp does not perform another full-body pass; it grants no mutable-input API.
      Object.defineProperty(body, 'text', {enumerable: true, get() {
        rereads += 1;
        throw new Error('body was read again after encoding');
      }});
      f.clock.elapse(ENCODING_COST_MS);
      return encoded.stamp();
    });
    assert.equal(rereads, 0);
    assert.equal(JSON.parse(bytes.toString()).payload.body.text, BODY_TEXT);
  });

test('actual router debits final preparer work and preserves text-frame bytes',
  {timeout: CASE_TIMEOUT_MS}, async (t) => {
    const f = await cdcRouterFixture(t);
    const peer = await controlledCdcPeer(f);
    const input = payload();
    let preparations = 0;
    const result = f.router.deliver(CDC_ROUTER_TEST.ADDRESS,
      {...input, messageId: 'prepared-duration'}, options({prepareDeliveryMessage: (message, ms) => {
        preparations += 1;
        if (preparations === 2) f.clock.elapse(ENCODING_COST_MS);
        return prepareCdcDeliveryMessage(message, ms);
      }}));
    const write = await peer.nextWrite(0);
    await write.handedOff;
    assert.equal(preparations, 2, 'the existing preparer is consulted before encoding and stamp');
    assert.equal(write.frame.payload[CDC_DELIVERY_REMAINING_MS],
      CDC_ROUTER_TEST.BUDGET_MS - ENCODING_COST_MS);
    assert.deepEqual(write.frame.payload.events, input.events);
    assert.equal(write.options.binary, false);
    assert.equal(write.bytes.length, Buffer.byteLength(JSON.stringify(write.frame)));
    peer.ack('prepared-duration', {transportProbe: 'encoding'});
    write.release();
    assert.equal((await result).acknowledged, true);
  });

test('pre-send encoding exhaustion has zero ws effects without waiting for a timer callback',
  {timeout: CASE_TIMEOUT_MS}, async (t) => {
    const f = await cdcRouterFixture(t);
    const peer = await controlledCdcPeer(f);
    let preparations = 0;
    const result = await f.router.deliver(CDC_ROUTER_TEST.ADDRESS, payload(),
      options({prepareDeliveryMessage: (message, ms) => {
        preparations += 1;
        if (preparations === 2) f.clock.elapse(CDC_ROUTER_TEST.BUDGET_MS);
        return prepareCdcDeliveryMessage(message, ms);
      }}));
    assert.equal(preparations, 2, 'the actual final-stamp preparation boundary was reached');
    assert.equal(result.acknowledged, false);
    assert.equal(result.errorCode, ROUTER_MESSAGE_TIMEOUT_ERROR_CODE);
    await nextTurn();
    assert.equal(peer.writes.length, 0);
    assert.equal(f.router.pendingMessages.size, 0);
    assert.equal(f.router.pendingResponses.size, 0);
    assert.equal(f.router.getOutboundQueue(CDC_ROUTER_TEST.PEER).inFlight, 0);
  });

test('encoder refuses a changed non-scalar preparer field before any send',
  {timeout: CASE_TIMEOUT_MS}, async (t) => {
    const f = await cdcRouterFixture(t);
    let preparations = 0;
    await assert.rejects(withDeliveryLifetime(f.router, options({
      prepareDeliveryMessage: (message, ms) => {
        preparations += 1;
        return prepareCdcDeliveryMessage({...message, changed: preparations}, ms);
      },
    }), (owned) => encodeDeliveryMessage({payload: {stable: true}},
      owned.deliveryLifetime).stamp()), {code: 'router_delivery_encoding_invalid'});
    assert.equal(preparations, 2);
  });

test('encoder requires an own positive finite duration without invoking wrapper accessors',
  {timeout: CASE_TIMEOUT_MS}, async (t) => {
    const f = await cdcRouterFixture(t);
    const invalid = [0, -0, -1, NaN, Infinity, -Infinity, null, undefined, true, '1', 1n, Object(1)];
    for (const value of invalid) {
      await assert.rejects(withDeliveryLifetime(f.router, options({
        prepareDeliveryMessage: (message) => ({...message, [CDC_DELIVERY_REMAINING_MS]: value}),
      }), (owned) => encodeDeliveryMessage({payload: {body: 'stable'}},
        owned.deliveryLifetime).stamp()), {code: 'router_delivery_encoding_invalid'});
    }
    let reads = 0;
    const accessor = {};
    Object.defineProperty(accessor, CDC_DELIVERY_REMAINING_MS, {enumerable: true, get() {
      reads += 1;
      return CDC_ROUTER_TEST.BUDGET_MS;
    }});
    const inherited = Object.create({[CDC_DELIVERY_REMAINING_MS]: CDC_ROUTER_TEST.BUDGET_MS});
    for (const prepared of [accessor, inherited]) {
      await assert.rejects(withDeliveryLifetime(f.router, options({
        prepareDeliveryMessage: () => prepared,
      }), (owned) => encodeDeliveryMessage({payload: {body: 'stable'}},
        owned.deliveryLifetime).stamp()), {code: 'router_delivery_encoding_invalid'});
    }
    assert.equal(reads, 0);
  });

test('encoder preserves positive numeric extrema within the actual enclosing grant',
  {timeout: CASE_TIMEOUT_MS}, async (t) => {
    const f = await cdcRouterFixture(t);
    for (const value of [Number.MIN_VALUE, Number.MAX_VALUE]) {
      const bytes = await withDeliveryLifetime(f.router, options({
        prepareDeliveryMessage: (message) => ({...message, [CDC_DELIVERY_REMAINING_MS]: value}),
      }), (owned) => encodeDeliveryMessage({payload: {body: BODY_TEXT}},
        owned.deliveryLifetime).stamp());
      const decoded = JSON.parse(bytes.toString());
      assert.equal(decoded.payload[CDC_DELIVERY_REMAINING_MS],
        Math.min(value, CDC_ROUTER_TEST.BUDGET_MS));
      assert.equal(bytes.length, Buffer.byteLength(JSON.stringify(decoded)));
    }
  });

test('real ws receives the duration payload as unchanged Unicode JSON text with no padding',
  {timeout: CASE_TIMEOUT_MS}, async (t) => {
    const f = await cdcRouterFixture(t);
    const peer = await realCdcPeer(f);
    const received = Promise.withResolvers();
    peer.on(TRANSPORT_EVENT.MESSAGE, (data, isBinary) => {
      const frame = JSON.parse(data.toString());
      if (frame.type !== ROUTER_MESSAGE_TYPE.SERVICE_MESSAGE) return;
      received.resolve({data, isBinary, frame});
      for (const answer of acknowledgeThenRespondFrames(frame.messageId,
        {transportProbe: 'real-ws'})) peer.send(JSON.stringify(answer));
    });
    const input = payload();
    const result = await f.router.deliver(CDC_ROUTER_TEST.ADDRESS, input, options());
    const wire = await received.promise;
    assert.equal(result.acknowledged, true);
    assert.equal(result.transportProbe, 'real-ws');
    assert.equal(wire.isBinary, false);
    assert.deepEqual(wire.frame.payload.events, input.events);
    assert.equal(wire.frame.payload[CDC_DELIVERY_REMAINING_MS], CDC_ROUTER_TEST.BUDGET_MS);
    assert.equal(wire.data.length, Buffer.byteLength(JSON.stringify(wire.frame)));
    assert.equal(f.router.getOutboundQueue(CDC_ROUTER_TEST.PEER).inFlight, 0);
    // This is a real text-frame/callback positive. It does not measure a held
    // kernel write, compression limiter shutdown, native MG commit or source ACK.
  });
