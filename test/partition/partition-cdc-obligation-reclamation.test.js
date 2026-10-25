/**
 * W-D1a-d (CDC decision D1, owner 2026-10-26): reclamation of delivered CDC
 * obligations with compact durable progress, on real PartitionService owners
 * (the controllable consensus port fixture, hosted under CDC_TABLE). The
 * ledger owner (partition-cdc-obligation-ledger.js) reclaims, inside the
 * application transaction of each committed CDC_DELIVERED, every delivered row
 * below the lowest owed one, and records the reclaimed prefix as one compact
 * progress row; the delivery lane (partition-cdc-obligation-delivery.js) and
 * the CDC_DELIVERED application (partition-cdc-obligation.js) are the real
 * paths. Substituted: the consensus port (the test commits each proposed
 * CDC_DELIVERED back, on every replica in one order) and the subscribers (the
 * owner fixture acknowledgingCdcSubscriber). Evidence ceiling: one process,
 * no native rs-raft group.
 * Design: solve/epics/raft-rs-full-cutover/evidence/cdc-lifecycle-2026-10-26/
 * DESIGN-cdc-d1-reclamation-2026-10-28.md.
 */
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {
  PARTITION_CDC_COMMAND,
  PARTITION_CDC_OBLIGATION_BOUND,
  PARTITION_CDC_OBLIGATION_DRIVE_STATE,
  PARTITION_CDC_OBLIGATION_FAILURE_CODE,
} from '../../src/partition/partition-cdc-obligation-constants.js';
import {buildCdcAcknowledgementCommand, cdcObligationEventKeyDigest} from
  '../../src/partition/partition-cdc-obligation-ledger.js';
import {proposeCdcAcknowledgement} from '../../src/partition/partition-cdc-obligation.js';
import {buildProvisionalCdcOutcome} from '../../src/cdc/cdc-delivery-outcome.js';
import {
  CDC_TABLE, GENERATION_ORIGIN_INDEX, PARTITION_ID, REPLICAS, applyCommitted,
  clearFixtureSingletons, durableAppliedIndex,
  resetFixtureSingletons, settleTicks, shutdownAll, startLeader, startReplica,
} from '../test-helpers/participant-transaction-fixture.js';
import {acknowledgingCdcSubscriber} from '../test-helpers/acknowledging-cdc-subscriber.js';
import {
  EARLIER_EVENTS, IMAGE_SQL, LATER_EVENTS, PENDING_EVENTS, commitLaterTraffic, commitOnAll,
  earlierTraffic, eventKeyOf, ledgerFactsOf, measure, pump, upsertOf,
} from '../test-helpers/cdc-hydration-handoff-fixture.js';

const BOUND = PARTITION_CDC_OBLIGATION_BOUND;
const DRIVE = PARTITION_CDC_OBLIGATION_DRIVE_STATE;
const ACK = PARTITION_CDC_COMMAND.DELIVERED;
const CDC = Object.freeze({tableName: CDC_TABLE});
const W_D1A_WRITES = 600;
const W_D1A_SUBSCRIBERS = 3;
const W_D1B_WRITES = 100;
const W_D1B_HELD_FROM = 40;
const W_D1D_WRITES = 2000;
const W_D1D_SAMPLE_EVERY = 250;
const W_D1D_WARM_UP = 500;
const SAMPLE_PUMP_ROUNDS = 3;
// The ledger b-trees may change shape by a page or two as rows come and go;
// a ledger that keeps one row per write grows by hundreds of pages over the
// soak.
const W_D1D_PAGE_SLACK = 4;
const W_D1E_WRITES = 3;
const W_D1E_FAR_ABOVE = 1000;
// More writes after the hole than the retained-delivered bound admits (the
// witness asserts that relation).
const W_D1F_WRITES = 5 * PARTITION_CDC_OBLIGATION_BOUND.ACK_BATCH_MAX_EVENTS + 44;
const W_D1F_RETRY_MS = 50;
const W_D1F_PUMP_ROUNDS = 40;

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

async function subscribed(leader, count, tag) {
  const subscribers = [];
  for (let index = 0; index < count; index += 1) {
    const subscriber = acknowledgingCdcSubscriber();
    subscribers.push(subscriber);
    await leader.subscribeToCDCWithHandshake(subscriber, {subscriberId: `${tag}${index}`});
  }
  return subscribers;
}

const progressOf = (facts) => facts.progress === null ? null :
  {reclaimed: facts.progress.reclaimed, throughLogIndex: facts.progress.throughLogIndex};

test('W-D1a: N committed writes with K acknowledging subscribers leave O(1) ledger rows ' +
  'after the pump (the compact progress, not N rows), the applied index advanced, and ' +
  'every replica of a three-replica group holds the identical ledger for the same ' +
  'committed prefix', async () => {
  const timeSource = new VirtualTimeSource();
  const {leader, proposed} = await startLeader({timeSource, ...CDC});
  const followers = [];
  try {
    followers.push(await startReplica(REPLICAS[1], CDC), await startReplica(REPLICAS[2], CDC));
    const replicas = [leader, ...followers];
    await subscribed(leader, W_D1A_SUBSCRIBERS, 'a');
    const appliedBefore = replicas.map(durableAppliedIndex);
    const failures = [];
    for (let index = 0; index < W_D1A_WRITES; index += 1) {
      failures.push(...commitOnAll(replicas, upsertOf(leader, 'a', index))
        .filter((answer) => answer !== null));
    }
    const lastWriteIndex = durableAppliedIndex(leader);
    const owedBeforePump = ledgerFactsOf(leader);
    await settleTicks();
    await pump(timeSource, leader, proposed, new Set(), undefined, followers);
    const facts = replicas.map(ledgerFactsOf);
    const applied = replicas.map(durableAppliedIndex);
    assert.deepEqual({
      failures,
      owedBeforePump: {rows: owedBeforePump.rows, owed: owedBeforePump.owed},
      rows: facts.map((fact) => fact.rows),
      withinSubscriberBound: facts.every((fact) => fact.rows <= W_D1A_SUBSCRIBERS),
      counts: facts.map((fact) => ({owed: fact.owed, delivered: fact.delivered})),
      progress: facts.map(progressOf),
      appliedAdvanced: applied.every((index, at) => index > appliedBefore[at]) &&
        applied[0] > lastWriteIndex,
      appliedIdentical: applied.every((index) => index === applied[0]),
      ledgerIdentical: facts.every((fact) => fact.image === facts[0].image),
    }, {
      failures: [],
      owedBeforePump: {rows: W_D1A_WRITES, owed: W_D1A_WRITES},
      rows: [0, 0, 0],
      withinSubscriberBound: true,
      counts: replicas.map(() => ({owed: 0, delivered: W_D1A_WRITES})),
      progress: replicas.map(() => ({reclaimed: String(W_D1A_WRITES),
        throughLogIndex: String(lastWriteIndex)})),
      appliedAdvanced: true,
      appliedIdentical: true,
      ledgerIdentical: true,
    });
  } finally {
    await shutdownAll(leader, ...followers);
  }
});

test('W-D1b: a slow subscriber that does not acknowledge keeps its owed rows; nothing at or ' +
  'above its first unacknowledged event is reclaimed while the acknowledged prefix is; once ' +
  'it acknowledges, reclamation catches up', async () => {
  const timeSource = new VirtualTimeSource();
  const {leader, proposed} = await startLeader({timeSource, ...CDC});
  try {
    const gate = {holding: true};
    const heldKeys = new Set();
    const fast = acknowledgingCdcSubscriber();
    const slow = acknowledgingCdcSubscriber({onEvent: (event) => {
      if (gate.holding && heldKeys.has(event.eventKey)) {
        throw new Error('W-D1b slow subscriber holds');
      }
    }});
    await leader.subscribeToCDCWithHandshake(fast, {subscriberId: 'fast'});
    await leader.subscribeToCDCWithHandshake(slow, {subscriberId: 'slow'});
    const keys = [];
    for (let index = 0; index < W_D1B_WRITES; index += 1) {
      const command = upsertOf(leader, 'b', index);
      keys.push(eventKeyOf(command));
      if (index >= W_D1B_HELD_FROM) heldKeys.add(eventKeyOf(command));
      applyCommitted(leader, command);
    }
    await settleTicks();
    const applied = new Set();
    await pump(timeSource, leader, proposed, applied);
    const held = ledgerFactsOf(leader);
    const retained = leader.db.prepare('SELECT event_key, delivered FROM _cdc_obligations ' +
      'ORDER BY log_index, ordinal').all();
    const fastReachedHeld = fast.events.some((event) => heldKeys.has(event.eventKey));
    gate.holding = false;
    await pump(timeSource, leader, proposed, applied);
    const released = ledgerFactsOf(leader);
    assert.deepEqual({
      held: {rows: held.rows, owed: held.owed, delivered: held.delivered,
        reclaimed: held.progress?.reclaimed ?? null},
      retainedKeys: retained.map((row) => row.event_key),
      retainedAllOwed: retained.every((row) => Number(row.delivered) === 0),
      fastReachedHeld,
      released: {rows: released.rows, owed: released.owed, delivered: released.delivered,
        reclaimed: released.progress?.reclaimed ?? null},
    }, {
      held: {rows: W_D1B_WRITES - W_D1B_HELD_FROM, owed: W_D1B_WRITES - W_D1B_HELD_FROM,
        delivered: W_D1B_HELD_FROM, reclaimed: String(W_D1B_HELD_FROM)},
      retainedKeys: keys.slice(W_D1B_HELD_FROM),
      retainedAllOwed: true,
      fastReachedHeld: true,
      released: {rows: 0, owed: 0, delivered: W_D1B_WRITES, reclaimed: String(W_D1B_WRITES)},
    });
  } finally {
    await shutdownAll(leader);
  }
});

test('W-D1c: hydration after reclamation - a late subscriber registers, reads image + P ' +
  'through readHydrationImage, and receives every event committed above P while the rows ' +
  'below P were already reclaimed', async () => {
  const timeSource = new VirtualTimeSource();
  const {leader, proposed} = await startLeader({timeSource, ...CDC});
  try {
    const applied = new Set();
    await earlierTraffic(leader, proposed, timeSource, applied, W_D1A_SUBSCRIBERS);
    for (let index = 0; index < PENDING_EVENTS; index += 1) {
      applyCommitted(leader, upsertOf(leader, 'pend', index));
    }
    await settleTicks();
    const late = acknowledgingCdcSubscriber();
    await leader.subscribeToCDCWithHandshake(late, {subscriberId: 'late'});
    const image = leader.readHydrationImage(IMAGE_SQL);
    const position = Number(image.appliedIndex);
    const atRead = ledgerFactsOf(leader);
    const committedAbove = commitLaterTraffic(leader, 'live');
    await settleTicks();
    await pump(timeSource, leader, proposed, applied);
    const final = ledgerFactsOf(leader);
    const total = EARLIER_EVENTS + PENDING_EVENTS + LATER_EVENTS;
    assert.deepEqual({
      reclaimedBelowPAtRead: Number(atRead.progress?.reclaimed ?? 0) >= EARLIER_EVENTS &&
        Number(atRead.progress?.throughLogIndex ?? Infinity) <= position,
      ...measure(leader, late, image.rows, position, committedAbove),
      final: {rows: final.rows, delivered: final.delivered,
        reclaimed: final.progress?.reclaimed ?? null},
    }, {
      reclaimedBelowPAtRead: true,
      committedAbove: LATER_EVENTS,
      missingAbove: 0,
      divergentRows: 0,
      deletedRowInView: false,
      owed: 0,
      final: {rows: 0, delivered: total, reclaimed: String(total)},
    });
  } finally {
    await shutdownAll(leader);
  }
});

test('W-D1d: growth bound - a soak of M acknowledged writes keeps the ledger at zero rows ' +
  'after each drain and its page count flat after warm-up (no row, no tombstone per write)',
async () => {
  const timeSource = new VirtualTimeSource();
  const {leader, proposed} = await startLeader({timeSource, ...CDC});
  try {
    await subscribed(leader, 1, 'd');
    const applied = new Set();
    const samples = [];
    for (let index = 0; index < W_D1D_WRITES; index += 1) {
      applyCommitted(leader, upsertOf(leader, 'd', index));
      if ((index + 1) % W_D1D_SAMPLE_EVERY === 0) {
        await settleTicks();
        await pump(timeSource, leader, proposed, applied, SAMPLE_PUMP_ROUNDS);
        samples.push({writes: index + 1, ...ledgerFactsOf(leader)});
      }
    }
    const warm = samples.find((sample) => sample.writes === W_D1D_WARM_UP);
    const last = samples.at(-1);
    assert.deepEqual({
      maxRowsAfterDrain: Math.max(...samples.map((sample) => sample.rows)),
      maxRetainedWithinBound: samples.every((sample) =>
        sample.rows <= BOUND.RETAINED_DELIVERED_MAX),
      pagesFlat: last.pages <= warm.pages + W_D1D_PAGE_SLACK,
      pages: {warm: warm.pages <= W_D1D_PAGE_SLACK * 2, grew: last.pages - warm.pages},
      final: {owed: last.owed, delivered: last.delivered,
        reclaimed: last.progress?.reclaimed ?? null},
    }, {
      maxRowsAfterDrain: 0,
      maxRetainedWithinBound: true,
      pagesFlat: true,
      pages: {warm: true, grew: last.pages - warm.pages},
      final: {owed: 0, delivered: W_D1D_WRITES, reclaimed: String(W_D1D_WRITES)},
    });
  } finally {
    await shutdownAll(leader);
  }
});

// A re-proposal of an acknowledgement batch, committed by the real proposer
// path and applied once more: the answer the write commit owner hands back.
async function reproposed(leader, command) {
  const answer = proposeCdcAcknowledgement(leader, command);
  await settleTicks();
  applyCommitted(leader, command);
  return answer;
}

test('W-D1e: acknowledgement-replay distinguishability - a CDC_DELIVERED committed again ' +
  'after reclamation refuses exact identity as compacted; fabricated old coordinates ' +
  'and digests never become successful acknowledgement evidence, while a position ' +
  'above the prefix remains unknown', async () => {
  const timeSource = new VirtualTimeSource();
  const {leader, proposed} = await startLeader({timeSource, ...CDC});
  try {
    await subscribed(leader, 1, 'e');
    for (let index = 0; index < W_D1E_WRITES; index += 1) {
      applyCommitted(leader, upsertOf(leader, 'e', index));
    }
    await settleTicks();
    await pump(timeSource, leader, proposed, new Set());
    const [first] = proposed.filter((entry) => entry.type === ACK);
    const reclaimed = ledgerFactsOf(leader);
    const pick = ({success, delivered, alreadyDelivered, alreadyReclaimed, failureCode}) =>
      ({success, delivered, alreadyDelivered, alreadyReclaimed, failureCode});
    const replay = pick(await reproposed(leader, first));
    const stamp = {timestamp: '', proposedBy: leader.replicaId, proposedAt: 0};
    const above = buildCdcAcknowledgementCommand(PARTITION_ID, [{
      logIndex: durableAppliedIndex(leader) + W_D1E_FAR_ABOVE,
      events: [{ordinal: 0, eventKeyDigest: cdcObligationEventKeyDigest('never-recorded')}]}],
    stamp);
    const unknown = pick(await reproposed(leader, above));
    // The prefix cannot establish that a coordinate ever emitted an event.
    const below = buildCdcAcknowledgementCommand(PARTITION_ID, [{
      logIndex: GENERATION_ORIGIN_INDEX,
      events: [{ordinal: 0, eventKeyDigest: cdcObligationEventKeyDigest('never-recorded')}]}],
    stamp);
    const belowPrefix = pick(await reproposed(leader, below));
    const wrongDigest = buildCdcAcknowledgementCommand(PARTITION_ID, [{
      logIndex: first.acknowledged[0].logIndex,
      events: [{ordinal: first.acknowledged[0].events[0].ordinal,
        eventKeyDigest: cdcObligationEventKeyDigest('wrong-event')}]}], stamp);
    const missingOrdinal = buildCdcAcknowledgementCommand(PARTITION_ID, [{
      logIndex: first.acknowledged[0].logIndex,
      events: [{ordinal: W_D1E_FAR_ABOVE,
        eventKeyDigest: cdcObligationEventKeyDigest('nonexistent-ordinal')}]}], stamp);
    const fabricated = [pick(await reproposed(leader, wrongDigest)),
      pick(await reproposed(leader, missingOrdinal))];
    const compacted = {success: false, delivered: undefined, alreadyDelivered: undefined,
      alreadyReclaimed: undefined,
      failureCode: PARTITION_CDC_OBLIGATION_FAILURE_CODE.IDENTITY_COMPACTED};
    await settleTicks();
    const after = ledgerFactsOf(leader);
    assert.deepEqual({
      reclaimed: {rows: reclaimed.rows, reclaimed: reclaimed.progress?.reclaimed ?? null},
      replay, unknown, belowPrefix, fabricated,
      held: leader.cdcDelivery.getCdcObligationDiagnostics().held,
      after: {rows: after.rows, owed: after.owed, delivered: after.delivered,
        progressUnchanged: after.image === reclaimed.image},
    }, {
      reclaimed: {rows: 0, reclaimed: String(W_D1E_WRITES)},
      replay: compacted,
      unknown: {success: false, delivered: undefined, alreadyDelivered: undefined,
        alreadyReclaimed: undefined,
        failureCode: PARTITION_CDC_OBLIGATION_FAILURE_CODE.UNKNOWN_EVENT},
      belowPrefix: compacted, fabricated: [compacted, compacted],
      held: null,
      after: {rows: 0, owed: 0, delivered: W_D1E_WRITES, progressUnchanged: true},
    });
  } finally {
    await shutdownAll(leader);
  }
});

test('W-D1f: pending work under budget - an owed row the lane cannot complete (provisional ' +
  'coverage) keeps the delivered rows above it, the lane stops delivering past it at ' +
  'RETAINED_DELIVERED_MAX (ACKNOWLEDGEMENT_BACKPRESSURE), nothing is dropped, and once the ' +
  'row completes everything is reclaimed', async () => {
  const timeSource = new VirtualTimeSource();
  const {leader, proposed} = await startLeader({timeSource, ...CDC});
  try {
    const gate = {holding: true, hole: null, drives: new Set()};
    const acknowledging = acknowledgingCdcSubscriber();
    await leader.subscribeToCDCWithHandshake(async (event) =>
      gate.holding && event.eventKey === gate.hole ?
        buildProvisionalCdcOutcome([event], W_D1F_RETRY_MS) : acknowledging(event),
    {subscriberId: 'f'});
    for (let index = 0; index < W_D1F_WRITES; index += 1) {
      const command = upsertOf(leader, 'f', index);
      if (index === 0) gate.hole = eventKeyOf(command);
      applyCommitted(leader, command);
    }
    const applied = new Set();
    for (let round = 0; round < W_D1F_PUMP_ROUNDS; round += 1) {
      await pump(timeSource, leader, proposed, applied, 1);
      gate.drives.add(leader.cdcDelivery.getCdcObligationDiagnostics().lastDrive?.state);
    }
    const held = ledgerFactsOf(leader);
    const retainedDelivered = held.rows - held.owed;
    const holeRetained = leader.db.prepare('SELECT delivered FROM _cdc_obligations ' +
      'WHERE event_key = ?').get(gate.hole)?.delivered ?? null;
    gate.holding = false;
    await pump(timeSource, leader, proposed, applied, W_D1F_PUMP_ROUNDS);
    const released = ledgerFactsOf(leader);
    assert.deepEqual({
      held: {holeRetained,
        nothingReclaimed: held.progress === null,
        retainedWithinBound: retainedDelivered <= BOUND.RETAINED_DELIVERED_MAX,
        retainedReachedBound: retainedDelivered + BOUND.ACK_BATCH_MAX_EVENTS >=
        BOUND.RETAINED_DELIVERED_MAX,
        noneDropped: held.owed + held.delivered === W_D1F_WRITES},
      boundBelowTraffic: BOUND.RETAINED_DELIVERED_MAX < W_D1F_WRITES,
      backpressured: gate.drives.has(DRIVE.ACKNOWLEDGEMENT_BACKPRESSURE),
      released: {rows: released.rows, owed: released.owed, delivered: released.delivered,
        reclaimed: released.progress?.reclaimed ?? null},
    }, {
      held: {holeRetained: 0, nothingReclaimed: true, retainedWithinBound: true,
        retainedReachedBound: true, noneDropped: true},
      boundBelowTraffic: true,
      backpressured: true,
      released: {rows: 0, owed: 0, delivered: W_D1F_WRITES, reclaimed: String(W_D1F_WRITES)},
    });
  } finally {
    await shutdownAll(leader);
  }
});
