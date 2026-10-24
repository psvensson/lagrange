/**
 * W-D4a negative (CDC decision D4, owner 2026-10-26): today's order on real
 * PartitionService owners - the late subscriber's image is read, 600 events
 * commit and are acknowledged by the earlier subscriber, and only then does
 * the late subscriber register. With no replay window it receives none of
 * the events after its read, the DELETE included: the order, not a window,
 * carries the hand-off. Red on the base, where the 256-slot window replayed
 * the last deliveries (the D4 design probe measured 344 of 600 missing).
 * This file imports no D4 owner, so on the base it runs and fails on the
 * assertion. Positive: cdc-hydration-live-handoff.test.js.
 */
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {
  clearFixtureSingletons, durableAppliedIndex, resetFixtureSingletons, settleTicks,
  shutdownAll, startLeader,
} from '../test-helpers/participant-transaction-fixture.js';
import {acknowledgingCdcSubscriber} from '../test-helpers/acknowledging-cdc-subscriber.js';
import {
  IMAGE_SQL, LATER_EVENTS, commitLaterTraffic, earlierTraffic, measure, pump,
} from '../test-helpers/cdc-hydration-handoff-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

test('W-D4a negative: today\'s order (image read, 600 events acknowledged by the earlier ' +
  'subscriber, then subscribe) loses every event after the read - the order, not a replay ' +
  'window, carries the handoff', async () => {
  const timeSource = new VirtualTimeSource();
  const {leader, proposed} = await startLeader({timeSource});
  try {
    const applied = new Set();
    await earlierTraffic(leader, proposed, timeSource, applied, 1);
    // The read as the seed took it before D4: the rows, then (separately) P.
    const imageRows = leader.db.prepare(IMAGE_SQL).all();
    const position = durableAppliedIndex(leader);
    commitLaterTraffic(leader, 'gap');
    await settleTicks();
    await pump(timeSource, leader, proposed, applied);
    const late = acknowledgingCdcSubscriber();
    await leader.subscribeToCDCWithHandshake(late, {subscriberId: 'B'});
    await pump(timeSource, leader, proposed, applied, 5);
    const measured = measure(leader, late, imageRows, position);
    assert.deepEqual({
      ledgerAbove: measured.ledgerAbove,
      missingAbove: measured.missingAbove,
      deletedRowInView: measured.deletedRowInView,
      lateEvents: late.events.length,
    }, {
      ledgerAbove: LATER_EVENTS,
      missingAbove: LATER_EVENTS,
      deletedRowInView: true,
      lateEvents: 0,
    });
  } finally {
    await shutdownAll(leader);
  }
});
