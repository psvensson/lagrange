// Repeated normalization across a forwarding hop is stable. The second hop's
// router outcome is re-emitted by the first hop's handler through the MG
// response wrapper (buildLatencyCdcPropagationResult, the wrapper the MG
// forwarder's answer travels in) and normalized again by the first router.
// Property, over an enumerated per-field matrix: the outcome the caller
// receives carries the second hop's delivery decision and metadata unchanged,
// keeps every value the reply supplied, and is a fixed point of the owner.
import assert from 'node:assert/strict';
import {test} from '../../src/test-helpers/tap.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {buildLatencyCdcPropagationResult} from
  '../../src/message-group/message-group-service-runtime-support.js';
import {
  TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELDS,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE,
  TRANSPORT_DELIVERY_OUTCOME_STATE,
  buildTransportDeliveryOutcome,
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

test('a forwarded outcome keeps the second hop decision and is a fixed point',
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
      buildLatencyCdcPropagationResult(await hop2.deliver(HOP2_ADDRESS, {type: 'HOP'})));

    let size = 0;
    const violations = [];
    for (const entry of replies()) {
      size += 1;
      reply = entry.reply;
      const second = await hop2.deliver(HOP2_ADDRESS, {type: 'HOP'});
      const forwarded = await hop1.deliver(HOP1_ADDRESS, {type: 'HOP'});
      const problems = [];
      try {
        assert.deepStrictEqual(metadataOf(forwarded), metadataOf(second));
      } catch {
        problems.push('second hop decision changed');
      }
      for (const field of Object.keys(entry.reply)) {
        if (field !== 'deliveryState' && !Object.is(forwarded[field], entry.reply[field])) {
          problems.push(`${field} rewritten`);
        }
      }
      try {
        assert.deepStrictEqual(buildTransportDeliveryOutcome(forwarded), forwarded);
      } catch {
        problems.push('not a fixed point');
      }
      if (problems.length > 0) violations.push(`${entry.name}: ${problems.join(', ')}`);
    }
    t.equal(size, 3 * (1 + 6 + 3 + 5 + 3 + 2 + 5), 'the whole matrix was forwarded');
    t.same(violations, [], 'every forwarded outcome is stable across the hop');
  });
