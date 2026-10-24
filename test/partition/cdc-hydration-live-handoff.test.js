/**
 * W-D4a (CDC decision D4, owner 2026-10-26): the hand-off from hydration to
 * live CDC at the partition boundary, on real PartitionService owners (the
 * controllable consensus port fixture). The production handoff is
 * subscribe-before-hydrate: `subscribeToCDCWithHandshake` registers the
 * subscriber, then `readHydrationImage` reads the image and the durable
 * applied index P in one synchronous span on the leader. Every ledger event
 * above P must then reach the subscriber through the obligation lane - with
 * more traffic after P than any replay window held, with K earlier
 * subscribers acknowledging, and with an acknowledgement pending (acknowledged,
 * CDC_DELIVERED not committed) at the registration.
 *
 * The sliding window is still present here (the owner ordered it removed
 * only after W-D4a and W-D4b pass; W-D4b is blocked, see the D4 evidence), so
 * this witness asserts the gap-freedom above P, which the window cannot
 * provide past its capacity, not the absence of window replays at or below P.
 * Design: solve/epics/raft-rs-full-cutover/evidence/cdc-lifecycle-2026-10-26/.
 */
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {PARTITION_HYDRATION_IMAGE_STATE} from
  '../../src/partition/partition-service-hydration-image-methods.js';
import {
  applyCommitted, clearFixtureSingletons, durableAppliedIndex, resetFixtureSingletons,
  settleTicks, shutdownAll, startLeader,
} from '../test-helpers/participant-transaction-fixture.js';
import {acknowledgingCdcSubscriber} from '../test-helpers/acknowledging-cdc-subscriber.js';
import {
  DELETED_IMAGE_ROW, IMAGE_SQL, LATER_EVENTS, PENDING_EVENTS, commitLaterTraffic,
  earlierTraffic, measure, pump, upsertOf,
} from '../test-helpers/cdc-hydration-handoff-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

for (const earlierCount of [1, 3]) {
  test(`W-D4a: subscribe-before-hydrate delivers every ledger event above P (K=${earlierCount} ` +
    'earlier subscribers, one acknowledgement pending at registration, 600 events after P ' +
    'including a DELETE of an image row) through readHydrationImage and the lane', async () => {
    const timeSource = new VirtualTimeSource();
    const {leader, proposed} = await startLeader({timeSource});
    try {
      const applied = new Set();
      await earlierTraffic(leader, proposed, timeSource, applied, earlierCount);
      for (let index = 0; index < PENDING_EVENTS; index += 1) {
        applyCommitted(leader, upsertOf(leader, 'pend', index));
      }
      await settleTicks();
      const pendingAtRegistration =
        leader.cdcDelivery.getCdcObligationDiagnostics().pendingAcknowledgements;
      const late = acknowledgingCdcSubscriber();
      await leader.subscribeToCDCWithHandshake(late, {subscriberId: 'B'});
      const image = leader.readHydrationImage(IMAGE_SQL);
      const position = Number(image.appliedIndex);
      const imageHadDeletedRow = image.rows.some((row) => row.id === DELETED_IMAGE_ROW);
      const appliedAtRead = durableAppliedIndex(leader);
      commitLaterTraffic(leader, 'live');
      await settleTicks();
      await pump(timeSource, leader, proposed, applied);
      assert.deepEqual({
        imageState: image.state,
        positionIsDurableAppliedIndex: position === appliedAtRead,
        pendingAtRegistration: pendingAtRegistration >= 1,
        imageHadDeletedRow,
        ...measure(leader, late, image.rows, position),
      }, {
        imageState: PARTITION_HYDRATION_IMAGE_STATE.READ,
        positionIsDurableAppliedIndex: true,
        pendingAtRegistration: true,
        imageHadDeletedRow: true,
        ledgerAbove: LATER_EVENTS,
        missingAbove: 0,
        divergentRows: 0,
        deletedRowInView: false,
        owed: 0,
      });
    } finally {
      await shutdownAll(leader);
    }
  });
}
