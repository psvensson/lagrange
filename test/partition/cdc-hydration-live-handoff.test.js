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
 * The negative (today's order) is cdc-hydration-old-order.test.js.
 * Design: solve/epics/raft-rs-full-cutover/evidence/cdc-lifecycle-2026-10-26/.
 * Supersedes cdc-sliding-window-catchup.exploration.test.js and
 * cdc-subscriber-registration-timing.test.js, deleted with the window and the
 * handshake's buffer catch-up they pinned.
 */
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {
  PARTITION_CDC_COMMAND,
  PARTITION_CDC_OBLIGATION_BOUND,
  PARTITION_CDC_OBLIGATION_DRIVE_STATE,
} from '../../src/partition/partition-cdc-obligation-constants.js';
import {
  OBLIGATION_RETRY_DISPOSITION,
  scheduleDeliveryRetry,
} from '../../src/partition/partition-cdc-obligation-delivery.js';
import {acknowledgedGroupsOf, buildCdcAcknowledgementCommand} from
  '../../src/partition/partition-cdc-obligation-ledger.js';
import {PARTITION_HYDRATION_IMAGE_STATE} from
  '../../src/partition/partition-service-hydration-image-methods.js';
import {
  CDC_TABLE, applyCommitted, clearFixtureSingletons, durableAppliedIndex, resetFixtureSingletons,
  settleTicks, shutdownAll, startLeader,
} from '../test-helpers/participant-transaction-fixture.js';
import {acknowledgingCdcSubscriber} from '../test-helpers/acknowledging-cdc-subscriber.js';
import {
  DELETED_IMAGE_ROW, IMAGE_SQL, LATER_EVENTS, PENDING_EVENTS, commitLaterTraffic,
  earlierTraffic, measure, pump, upsertOf,
} from '../test-helpers/cdc-hydration-handoff-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

function acknowledgementBatchCounts(proposed) {
  const commands = proposed.filter((command) => command.type === PARTITION_CDC_COMMAND.DELIVERED);
  assert.ok(commands.length >= 2, 'the witness must measure multiple ACK commands');
  return commands.map((command) => {
    assert.ok(Array.isArray(acknowledgedGroupsOf(command)), 'Every proposed ACK must be valid');
    return command.acknowledged.reduce((count, group) => count + group.events.length, 0);
  });
}

for (const earlierCount of [1, 3]) {
  test(`W-D4a: subscribe-before-hydrate delivers every ledger event above P (K=${earlierCount} ` +
    'earlier subscribers, one acknowledgement pending at registration, 600 events after P ' +
    'including a DELETE of an image row) through readHydrationImage and the lane', async () => {
    const timeSource = new VirtualTimeSource();
    const {leader, proposed} = await startLeader({timeSource, tableName: CDC_TABLE});
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
      const handshake = await leader.subscribeToCDCWithHandshake(late, {subscriberId: 'B'});
      const image = leader.readHydrationImage(IMAGE_SQL);
      const position = Number(image.appliedIndex);
      const imageHadDeletedRow = image.rows.some((row) => row.id === DELETED_IMAGE_ROW);
      const appliedAtRead = durableAppliedIndex(leader);
      const committedAbove = commitLaterTraffic(leader, 'live');
      await settleTicks();
      await pump(timeSource, leader, proposed, applied);
      assert.deepEqual({
        imageState: image.state,
        positionIsDurableAppliedIndex: position === appliedAtRead,
        pendingAtRegistration: pendingAtRegistration >= 1,
        imageHadDeletedRow,
        handshakeCarriesCatchup: Object.hasOwn(handshake, 'catchup'),
        ...measure(leader, late, image.rows, position, committedAbove),
      }, {
        imageState: PARTITION_HYDRATION_IMAGE_STATE.READ,
        positionIsDurableAppliedIndex: true,
        pendingAtRegistration: true,
        imageHadDeletedRow: true,
        handshakeCarriesCatchup: false,
        committedAbove: LATER_EVENTS,
        missingAbove: 0,
        divergentRows: 0,
        deletedRowInView: false,
        owed: 0,
        outsideLane: 0,
      });
    } finally {
      await shutdownAll(leader);
    }
  });
}

test('W-D4b: acknowledgeHydratedObligationsThrough marks pre-hydration obligations delivered ' +
  'and reclaims them at P while preserving live delivery above P', async () => {
  const timeSource = new VirtualTimeSource();
  const {leader, proposed} = await startLeader({timeSource, tableName: CDC_TABLE});
  try {
    for (let index = 0; index < PENDING_EVENTS; index += 1) {
      applyCommitted(leader, upsertOf(leader, 'seed', index));
    }
    const subscriber = acknowledgingCdcSubscriber();
    await leader.subscribeToCDCWithHandshake(subscriber, {subscriberId: 'seed-sub'});
    const image = leader.readHydrationImage(IMAGE_SQL);
    const position = Number(image.appliedIndex);
    const ackResult = await leader.cdcDelivery.acknowledgeHydratedObligationsThrough(
      image.appliedIndex,
    );
    const committedAbove = commitLaterTraffic(leader, 'post-hydration');
    await settleTicks();
    const applied = new Set();
    await pump(timeSource, leader, proposed, applied);
    assert.deepEqual({
      acknowledged: ackResult.acknowledged >= 1,
      ...measure(leader, subscriber, image.rows, position, committedAbove),
    }, {
      acknowledged: true,
      committedAbove: LATER_EVENTS,
      missingAbove: 0,
      divergentRows: 0,
      deletedRowInView: false,
      owed: 0,
      outsideLane: 0,
    });
  } finally {
    await shutdownAll(leader);
  }
});

test('W-D4c: acknowledgeHydratedObligationsThrough drains > 256 pre-hydration obligations ' +
  'across bounded <= 256-event batches without creating a refused 257-event batch', async () => {
  const timeSource = new VirtualTimeSource();
  const {leader, proposed} = await startLeader({timeSource, tableName: CDC_TABLE});
  try {
    for (let index = 0; index < 600; index += 1) {
      applyCommitted(leader, upsertOf(leader, 'bulk-seed', index));
    }
    const subscriber = acknowledgingCdcSubscriber();
    await leader.subscribeToCDCWithHandshake(subscriber, {subscriberId: 'bulk-sub'});
    const image = leader.readHydrationImage(IMAGE_SQL);
    const position = Number(image.appliedIndex);
    const ackResult = await leader.cdcDelivery.acknowledgeHydratedObligationsThrough(
      image.appliedIndex,
    );
    const committedAbove = commitLaterTraffic(leader, 'post-bulk-hydration');
    await settleTicks();
    const beforePumpDiagnostics = leader.cdcDelivery.getCdcObligationDiagnostics();
    assert.equal(
      beforePumpDiagnostics.lastDrive?.state,
      PARTITION_CDC_OBLIGATION_DRIVE_STATE.ACKNOWLEDGEMENT_BACKPRESSURE,
      'actual-prefix pressure blocks post-hydration delivery while > 256 pre-hydration obligations saturate outstanding acknowledgement batches',
    );
    assert.equal(
      subscriber.events.length,
      0,
      'post-hydration events are held back until prefix acknowledgement batches drain',
    );
    const applied = new Set();
    await pump(timeSource, leader, proposed, applied);
    const batchEventCounts = acknowledgementBatchCounts(proposed);
    const oversized = buildCdcAcknowledgementCommand(leader.partitionId, [{
      logIndex: 1,
      events: Array.from({length: PARTITION_CDC_OBLIGATION_BOUND.ACK_BATCH_MAX_EVENTS + 1},
        (_, ordinal) => ({ordinal, eventKeyDigest: 'a'.repeat(64)})),
    }]);
    assert.throws(() => acknowledgementBatchCounts([...proposed, oversized]),
      /Every proposed ACK must be valid/,
      'a mixed population of valid ACKs and a 257-event ACK must fail measurement');
    const maxBatchEvents = Math.max(0, ...batchEventCounts);
    const diagnostics = leader.cdcDelivery.getCdcObligationDiagnostics();
    assert.equal(ackResult.acknowledged, 600);
    assert.equal(batchEventCounts.length >= 2, true);
    assert.equal(
      maxBatchEvents,
      PARTITION_CDC_OBLIGATION_BOUND.ACK_BATCH_MAX_EVENTS,
      'command.acknowledged batches fill up to ACK_BATCH_MAX_EVENTS (256) without exceeding the bound',
    );
    assert.equal(diagnostics.held, null);
    assert.deepEqual(
      measure(leader, subscriber, image.rows, position, committedAbove),
      {
        committedAbove: LATER_EVENTS,
        missingAbove: 0,
        divergentRows: 0,
        deletedRowInView: false,
        owed: 0,
        outsideLane: 0,
      },
    );
  } finally {
    await shutdownAll(leader);
  }
});

test('W-D4d: prepareCdcObligationProgress attaches logIndex and ' +
  'acknowledgeHydratedObligationsThrough retires an in-flight pre-hydration invocation', async () => {
  const timeSource = new VirtualTimeSource();
  const {leader, proposed} = await startLeader({timeSource, tableName: CDC_TABLE});
  try {
    let unblockDelivery = null;
    let observedCellLogIndex = null;
    let observedInvocationDuringHydration = null;
    const blockingSubscriber = {
      handleCDCEvent: async () => {
        const currentCell = leader.cdcDelivery.obligationLane.currentObligation;
        observedCellLogIndex = currentCell?.logIndex ?? null;
        observedInvocationDuringHydration = leader.cdcDelivery.activeCdcInvocation;
        await new Promise((resolve) => {
          unblockDelivery = resolve;
        });
        return {success: true, completion: 'DURABLE'};
      },
    };
    await leader.subscribeToCDCWithHandshake(blockingSubscriber, {subscriberId: 'blocking-sub'});
    applyCommitted(leader, upsertOf(leader, 'inflight-seed', 0));
    await settleTicks();
    assert.equal(Number.isSafeInteger(observedCellLogIndex) && observedCellLogIndex > 0, true);
    assert.notEqual(observedInvocationDuringHydration, null);

    const image = leader.readHydrationImage(IMAGE_SQL);
    await leader.cdcDelivery.acknowledgeHydratedObligationsThrough(image.appliedIndex);

    assert.equal(observedInvocationDuringHydration.context.signal.aborted, true);
    assert.equal(leader.cdcDelivery.obligationLane.currentObligation, null);
    unblockDelivery?.();
    await settleTicks();
    const applied = new Set();
    await pump(timeSource, leader, proposed, applied);
  } finally {
    await shutdownAll(leader);
  }
});

test('W-D4e: scheduleDeliveryRetry preserves an earlier absolute dueAtMs against a later ' +
  'smaller relative delayMs, and retainedDeliveredBackpressured enforces actual-prefix pressure', async () => {
  const timeSource = new VirtualTimeSource({startMs: 1000});
  const {leader} = await startLeader({timeSource, tableName: CDC_TABLE});
  try {
    const delivery = leader.cdcDelivery;
    delivery.getCdcObligationDiagnostics();
    const lane = delivery.obligationLane;

    // 1. Arm retry timer at t = 1000 with PAGE_YIELDED (delayMs = 50 -> dueAtMs = 1050).
    const firstDelay = scheduleDeliveryRetry(
      delivery,
      null,
      OBLIGATION_RETRY_DISPOSITION.PAGE_YIELDED,
    );
    assert.equal(firstDelay, 50);
    assert.equal(lane.retryTimer.dueAtMs, 1050);
    const firstHandle = lane.retryTimer.handle;

    // Advance clock to t = 1040 and schedule a smaller relative delayMs = 25 -> dueAtMs = 1065 > 1050.
    // The earlier deadline (1050) must NOT be pushed back to 1065.
    timeSource.advance(40);
    const secondDelay = scheduleDeliveryRetry(
      delivery,
      {retryAfterMs: 25, reason: 'BACKPRESSURE'},
      OBLIGATION_RETRY_DISPOSITION.BACKPRESSURE,
    );
    assert.equal(secondDelay, 25);
    assert.equal(
      lane.retryTimer.dueAtMs,
      1050,
      'later dueAtMs (1065) must not push back earlier armed dueAtMs (1050) even when relative delayMs (25 < 50) is smaller',
    );
    assert.equal(lane.retryTimer.handle, firstHandle);

    // An genuinely earlier dueAtMs (t = 1040 + 5 = 1045 < 1050) replaces the timer.
    lane.consecutiveBackpressure = 0;
    const earlierDelay = scheduleDeliveryRetry(
      delivery,
      {retryAfterMs: 5, reason: 'BACKPRESSURE'},
      OBLIGATION_RETRY_DISPOSITION.BACKPRESSURE,
    );
    assert.equal(earlierDelay, 5);
    assert.equal(lane.retryTimer.dueAtMs, 1045);

    // 2. Verify actual-prefix retainedDeliveredBackpressured: when a pre-hydration
    // obligation remains owed at the head of the ledger and lane.pending holds
    // RETAINED_DELIVERED_MAX entries, post-hydration delivery is backpressured.
    applyCommitted(leader, upsertOf(leader, 'prefix-head', 0));
    const image = leader.readHydrationImage(IMAGE_SQL);
    lane.hydratedThroughLogIndex = Number(image.appliedIndex);
    lane.pending.clear();
    lane.commands.clear();
    for (let i = 0; i < PARTITION_CDC_OBLIGATION_BOUND.RETAINED_DELIVERED_MAX; i += 1) {
      lane.pending.set(`synthetic-pending-${i}`, {logIndex: 1, ordinal: i});
    }
    const subscriber = acknowledgingCdcSubscriber();
    await leader.subscribeToCDCWithHandshake(subscriber, {subscriberId: 'pressure-sub'});
    applyCommitted(leader, upsertOf(leader, 'post-hydration-blocked', 1));
    await settleTicks();
    assert.equal(
      leader.cdcDelivery.getCdcObligationDiagnostics().lastDrive?.state,
      PARTITION_CDC_OBLIGATION_DRIVE_STATE.ACKNOWLEDGEMENT_BACKPRESSURE,
      'retainedDeliveredBackpressured stops post-hydration delivery when actual owed head + pending reaches RETAINED_DELIVERED_MAX',
    );
    assert.equal(subscriber.events.length, 0);
  } finally {
    await shutdownAll(leader);
  }
});
