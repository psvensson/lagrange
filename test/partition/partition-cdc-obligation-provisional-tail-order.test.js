// Witness of quest cdc-propagation-node-slot-removal (the independent
// verifier's counterexample C2): ledger order holds when a lane is held by
// typed backpressure while its scan has passed a provisional row. Owner path:
// PartitionCDCDelivery's obligation lane (driveCdcObligations) composing its
// range for its propagation subscriber, on the one lane fixture. This quest
// does not change when a lane captures its scan tail (range shipping's rule:
// a retry after a hold continues the scan and a range is cut by the tail the
// scan captured); the recipient answers are controlled CDC outcomes (an
// evidence ceiling of the source owner); virtual time only.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {CDC_COMPLETION, unknownCdcAcceptance} from '../../src/cdc/cdc-delivery-outcome.js';
import {PARTITION_CDC_OBLIGATION_DRIVE_STATE as DRIVE} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {clearFixtureSingletons, resetFixtureSingletons, settleTicks} from
  '../test-helpers/participant-transaction-fixture.js';
import {addSourceRow, currentLaneOf, fixture, recipientAnswer} from
  '../test-helpers/partition-cdc-lane-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

// Row A is answered provisional (passed, still owed), row B is refused by
// typed backpressure with no leaf covered, and rows C and D are committed
// while the lane is held: the pass still ends at the tail captured when it
// began, so A is presented again before C and D.
test('a typed-backpressure hold while the scan holds a passed provisional row keeps the ' +
  'captured tail: the provisional row is presented again before rows committed after the hold',
async (t) => {
  const f = await fixture(t, {rows: ['A', 'B'], subscribers: 1});
  const script = {A: ['provisional'], B: ['backpressure']};
  f.behavior = (_index, events, _context, groupId) => {
    const step = (script[events[0].data.group_id] ?? []).shift();
    return step === 'backpressure' ?
      {...unknownCdcAcceptance(CDC_COMPLETION.BACKPRESSURE), retryAfterMs: 20} :
      recipientAnswer(events, groupId, step !== 'provisional');
  };
  assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
  assert.deepEqual(f.calls.map((call) => call.ids), [['A'], ['B']],
    'precondition: A was passed as provisional, B was refused by typed backpressure');
  assert.equal(currentLaneOf(f).scan?.provisional, true,
    'precondition: the scan holds a passed provisional row');
  addSourceRow(f.leader, 'C');
  addSourceRow(f.leader, 'D');
  await settleTicks();
  for (let drive = 0; drive < 12 && (await f.drive()).state !== DRIVE.DRAINED; drive += 1) {
    await settleTicks();
  }
  assert.deepEqual(f.calls.slice(2).map((call) => call.ids), [['B'], ['A'], ['C'], ['D']],
    'the pass ends at its captured tail: B, then the provisional A, then the later rows');
});
