// A forwarding hop's transport describes its own hop (design section 5). The
// first hop's handler delivers to the second hop and answers through the
// transport owner's forwarded-answer rule. Property, over an enumerated
// per-field matrix of second-hop replies carrying transport field names: the
// caller's transport is the first hop's own DELIVERED outcome, no reply field
// reaches it, the caller's answer is the second hop's answer with every value
// it supplied, and the envelope is a fixed point of the owner builder.
import assert from 'node:assert/strict';
import {test} from '../../src/test-helpers/tap.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {
  TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELDS,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE,
  TRANSPORT_DELIVERY_OUTCOME_STATE,
  buildDeliveryEnvelope,
  buildTransportDeliveryOutcome,
  forwardedDeliveryAnswer,
} from '../../src/transport/transport-semantic-outcome.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

const STATE = TRANSPORT_DELIVERY_OUTCOME_STATE;
const RETRY_HINT_MS = 250;
const HOP1 = 'forward-hop-1';
const HOP2 = 'forward-hop-2';
const HOP1_ADDRESS = `${HOP1}/service/forwarder`;
const HOP2_ADDRESS = `${HOP2}/service/recipient`;
const FIELD_VALUES = Object.freeze({
  deliveryState: [STATE.DELIVERED, STATE.DEFERRED, STATE.FAILED, '', null, 1],
  deferRetry: [true, false, 'yes'],
  errorCode: [null, '', 'x', 'ROUTER_CONNECTION_CLOSED', 'router_no_connection'],
  noHandler: [true, false, 1],
  reasonCode: [null, TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.ACK_REJECTED],
  retryAfterMs: [null, 0, -5, RETRY_HINT_MS, String(RETRY_HINT_MS)],
});
const BASES = Object.freeze({
  ANSWER: {success: true},
  APPLICATION_DEFERRAL: {success: false, deferRetry: true, retryAfterMs: RETRY_HINT_MS},
  CODE_FIELD: {success: false, code: 'ROUTER_CONNECTION_CLOSED'},
});

function* replies() {
  for (const [base, value] of Object.entries(BASES)) {
    yield {name: `${base}`, reply: {...value}};
    for (const [field, values] of Object.entries(FIELD_VALUES)) {
      for (const candidate of values) {
        yield {name: `${base} ${field}=${JSON.stringify(candidate)}`,
          reply: {...value, [field]: candidate}};
      }
    }
  }
}

function metadataOf(outcome) {
  return Object.fromEntries(TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELDS.map((field) =>
    [field, outcome[field]]));
}

test('forwarding-hop matrix enumerates every owner metadata field', async (t) => {
  t.same(Object.keys(FIELD_VALUES).sort(),
    [...TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELDS].sort());
});

test('a forwarded delivery keeps hop1 transport its own and is a fixed point',
  async (t) => {
    const hop1 = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION, nodeId: HOP1});
    const hop2 = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION, nodeId: HOP2});
    await hop1.initialize({startServer: false});
    await hop2.initialize({startServer: false});
    t.teardown(async () => {
      await hop1.shutdown();
      await hop2.shutdown();
    });
    let reply;
    hop2.register(HOP2_ADDRESS, () => reply);
    hop1.register(HOP1_ADDRESS, async () =>
      forwardedDeliveryAnswer(await hop2.deliver(HOP2_ADDRESS, {type: 'HOP'})));
    const ownHop = metadataOf(buildTransportDeliveryOutcome({acknowledged: true}));

    let size = 0;
    const violations = [];
    for (const entry of replies()) {
      size += 1;
      reply = entry.reply;
      const second = await hop2.deliver(HOP2_ADDRESS, {type: 'HOP'});
      const forwarded = await hop1.deliver(HOP1_ADDRESS, {type: 'HOP'});
      const problems = [];
      try {
        assert.deepStrictEqual(metadataOf(forwarded.transport), ownHop);
        assert.deepStrictEqual(metadataOf(second.transport), ownHop);
      } catch {
        problems.push('a reply field reached a transport outcome');
      }
      try {
        assert.deepStrictEqual(forwarded.answer, forwardedDeliveryAnswer(second));
        assert.deepStrictEqual(forwarded.answer, entry.reply);
      } catch {
        problems.push('the forwarded answer is not the second hop answer');
      }
      try {
        assert.deepStrictEqual(buildDeliveryEnvelope(forwarded.transport, forwarded.answer),
          forwarded);
      } catch {
        problems.push('not a fixed point');
      }
      if (problems.length > 0) violations.push(`${entry.name}: ${problems.join(', ')}`);
    }
    t.equal(size, 3 * (1 + 6 + 3 + 5 + 3 + 2 + 5), 'the whole matrix was forwarded');
    t.same(violations, [], 'every forwarded delivery keeps each hop in its own namespace');
  });
