// Reproducer of quest cdc-propagation-node-slot-removal (the stale scan tail
// measured in journey job 4216bd0b: 742 drives cut at the tail captured when
// the pass began while 1-10 READY rows were already owed behind it). Owner
// path: PartitionCDCDelivery's obligation lane (driveCdcObligations) composing
// its range (composeCdcShipRange) for its propagation subscriber
// (buildPartitionCdcPropagationSubscriber), on the one lane fixture.
//
// Written to the behaviour after the repair: after a refusal that attempted
// nothing (the subscriber's owner-not-ready answer, raised before any
// recipient is called, so no leaf of the range is covered), the next composed
// vector holds every READY row owed at that moment up to the shipping window
// and byte bound, not only the rows that were owed when the refused pass
// began. The recipient answers are controlled CDC outcomes (an evidence
// ceiling of the source owner); virtual time only.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {buildCommittedCdcOutcome} from '../../src/cdc/cdc-delivery-outcome.js';
import {PARTITION_CDC_OBLIGATION_DRIVE_STATE as DRIVE} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {readOwedCdcObligations} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {clearFixtureSingletons, resetFixtureSingletons, settleTicks} from
  '../test-helpers/participant-transaction-fixture.js';
import {addSourceRow, fixture, primeShipWindow, shipWindowOf} from
  '../test-helpers/partition-cdc-lane-fixture.js';

const WINDOW = 8;

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const owedIds = (f) => readOwedCdcObligations(f.leader.db, {limit: Number.MAX_SAFE_INTEGER})
  .map((obligation) => JSON.parse(obligation.eventJson).data.id);

test('after an owner-not-ready refusal that attempted nothing, driveCdcObligations ships ' +
  'every READY row owed now, up to the window, in one vector', async (t) => {
  const f = await fixture(t, {rows: ['A', 'B'], subscribers: 1});
  primeShipWindow(f, WINDOW);
  let receipts = 0;
  f.behavior = (_index, events, _context, groupId) => {
    receipts += 1;
    return buildCommittedCdcOutcome(events, groupId, {index: receipts, term: 2});
  };
  f.ready = false;
  const refused = await f.drive();
  assert.equal(refused.state, DRIVE.HELD_BY_SUBSCRIBER,
    'precondition: the subscriber refused before calling any recipient');
  assert.equal(f.calls.length, 0, 'precondition: nothing was attempted');
  for (const id of ['C', 'D', 'E', 'F']) addSourceRow(f.leader, id);
  await settleTicks();
  assert.equal(f.calls.length, 0, 'precondition: the rows committed meanwhile were held too');
  assert.deepEqual(owedIds(f), ['A', 'B', 'C', 'D', 'E', 'F'],
    'precondition: six READY rows are owed, fewer than the window');
  f.ready = true;
  const shipped = await f.drive();
  assert.equal(shipped.state, DRIVE.DRAINED);
  assert.deepEqual(f.calls.map((call) => call.ids), [['A', 'B', 'C', 'D', 'E', 'F']],
    'the first vector after the refusal carries the whole owed tail, not the tail ' +
    'captured when the refused pass began');
  assert.equal(shipWindowOf(f), WINDOW, 'the window is unchanged by a refusal');
});
