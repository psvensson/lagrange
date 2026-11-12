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
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {createReadOnlyCache} from '../../src/cache/read-only-system-table-cache.js';
import {installSourceImage} from '../../src/cache/system-table-cache-source-image.js';
import {eventOf, sourceRangeOf} from '../../src/partition/partition-cdc-obligation-vector.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {CONFIG_SCHEMA, INITIAL_PARTITION_IDS} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {TABLES} from '../../src/constants/index.js';
import {
  PARTITION_CDC_COMMAND,
  PARTITION_CDC_OBLIGATION_BOUND,
  PARTITION_CDC_OBLIGATION_DRIVE_STATE,
  PARTITION_CDC_OBLIGATION_FAILURE_CODE,
} from '../../src/partition/partition-cdc-obligation-constants.js';
import {buildCdcAcknowledgementCommand, cdcObligationEventKeyDigest, readCdcLedgerIncarnation,
  readCdcObligation} from
  '../../src/partition/partition-cdc-obligation-ledger.js';
import {proposeCdcAcknowledgement} from '../../src/partition/partition-cdc-obligation.js';
import {buildProvisionalCdcOutcome} from '../../src/cdc/cdc-delivery-outcome.js';
import {
  CDC_TABLE, GENERATION_ORIGIN_INDEX, PARTITION_ID, REPLICAS, applyCommitted,
  clearFixtureSingletons, committedQueryOf, durableAppliedIndex,
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
    const applied = new Set();
    // Range shipping: the acknowledged prefix advances by whole vectors (a
    // subscriber that refuses one row holds the vector that carries it), so
    // the prefix both subscribers acknowledge is committed and pumped before
    // the held rows exist. The reclamation rule under test is unchanged.
    for (let index = 0; index < W_D1B_WRITES; index += 1) {
      if (index === W_D1B_HELD_FROM) {
        await settleTicks();
        await pump(timeSource, leader, proposed, applied);
      }
      const command = upsertOf(leader, 'b', index);
      keys.push(eventKeyOf(command));
      if (index >= W_D1B_HELD_FROM) heldKeys.add(eventKeyOf(command));
      applyCommitted(leader, command);
    }
    await settleTicks();
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
      outsideLane: 0,
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

// Recipient isolation: acknowledgement is taken at the frontier (the lowest
// recipient cursor), so it is always a contiguous prefix of the ledger. A row
// the recipient cannot complete (provisional coverage) therefore holds every
// later row OWED rather than delivered-and-retained: the retained-delivered
// bound of decision D1 is never approached from the lane, nothing is dropped,
// and once the row completes everything is reclaimed. (Before, the lane
// delivered and acknowledged past the row up to RETAINED_DELIVERED_MAX and
// then answered ACKNOWLEDGEMENT_BACKPRESSURE.)
test('W-D1f: pending work under budget - an owed row the lane cannot complete (provisional ' +
  'coverage) keeps every later row owed (none is delivered-and-retained above it), nothing ' +
  'is dropped, and once the row completes everything is reclaimed', async () => {
  const timeSource = new VirtualTimeSource();
  const {leader, proposed} = await startLeader({timeSource, ...CDC});
  try {
    const gate = {holding: true, hole: null, drives: new Set()};
    const acknowledging = acknowledgingCdcSubscriber();
    // Range shipping: provisional coverage is over the exact vector, so the
    // one row the lane cannot complete is given a body above the shipping
    // byte bound and ships as a vector of its own (the hole stays one row);
    // the lane still delivers past it, up to the retained-delivered bound.
    await leader.subscribeToCDCWithHandshake(async (events) =>
      gate.holding && events.some((event) => event.eventKey === gate.hole) ?
        buildProvisionalCdcOutcome(events, W_D1F_RETRY_MS) : acknowledging(events),
    {subscriberId: 'f'});
    for (let index = 0; index < W_D1F_WRITES; index += 1) {
      const command = upsertOf(leader, 'f', index);
      if (index === 0) {
        gate.hole = eventKeyOf(command);
        command.params = [command.params[0], 'h'.repeat(BOUND.SHIP_MAX_BYTES + 1)];
      }
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
        retainedDelivered,
        noneDropped: held.owed + held.delivered === W_D1F_WRITES},
      boundBelowTraffic: BOUND.RETAINED_DELIVERED_MAX < W_D1F_WRITES,
      backpressured: gate.drives.has(DRIVE.ACKNOWLEDGEMENT_BACKPRESSURE),
      released: {rows: released.rows, owed: released.owed, delivered: released.delivered,
        reclaimed: released.progress?.reclaimed ?? null},
    }, {
      held: {holeRetained: 0, nothingReclaimed: true, retainedDelivered: 0, noneDropped: true},
      boundBelowTraffic: true,
      backpressured: false,
      released: {rows: 0, owed: 0, delivered: W_D1F_WRITES, reclaimed: String(W_D1F_WRITES)},
    });
  } finally {
    await shutdownAll(leader);
  }
});

// These controls cross the actual cache boundary, so they use a production
// schema/key. Earlier ledger-only tests deliberately retain the id/value model.
const LOCAL_CDC_TABLE = TABLES.CONFIG;
const LOCAL_CDC = Object.freeze({tableName: LOCAL_CDC_TABLE, schema: CONFIG_SCHEMA,
  partitionId: INITIAL_PARTITION_IDS[LOCAL_CDC_TABLE]});
const LOCAL_IMAGE_SQL = `SELECT * FROM ${LOCAL_CDC_TABLE}`;

function localUpsertOf(leader, tag, index) {
  const command = committedQueryOf(`${tag}-${index}`,
    `INSERT OR REPLACE INTO ${LOCAL_CDC_TABLE} ` +
    '(config_key, config_value, value_type, default_value, created_at) VALUES (?, ?, ?, ?, ?)');
  command.params = [`r-${index}`, `${tag}-${index}`, 'string', '', 1];
  command.timestamp = leader.hlcClock.now().toString();
  return command;
}

test('W-D1g: local committed application preserves the exact ledger occurrence and range ' +
  'through the real writable cache when the partition holds a read-only view', async () => {
  const {leader} = await startLeader(LOCAL_CDC);
  const cache = new SystemTableCache({timeSource: leader.timeSource});
  try {
    leader.systemTableCache = createReadOnlyCache(cache);
    leader.cdcIntegrationService = {cacheMutationTarget: cache};
    const command = localUpsertOf(leader, 'g', 1);
    assert.equal(applyCommitted(leader, command), null);
    assert.equal(cache.get(LOCAL_CDC_TABLE, 'r-1').config_value, 'g-1');
    const owed = readCdcObligation(leader.db, eventKeyOf(command));
    const sourceRange = sourceRangeOf(leader, [owed]);
    const incoming = eventOf(owed, 0);
    const retained = cache.sourceOrder.tables.get(LOCAL_CDC_TABLE).get('r-1');
    assert.equal(retained.eventKey, owed.eventKey);
    assert.equal(retained.logIndex, owed.logIndex);
    assert.equal(retained.ordinal, owed.ordinal);
    assert.equal(retained.incarnation, readCdcLedgerIncarnation(leader.db));
    assert.equal(cache.sourceOrder.positionOf(leader.partitionId).position, null,
      'local visibility does not fabricate a contiguous image prefix');
    cache.sourceOrder.requireListed(leader.partitionId, LOCAL_CDC_TABLE);
    const token = cache.sourceOrder.beginImage(leader.partitionId);
    assert.equal(installSourceImage(cache, token, {sourcePartition: leader.partitionId,
      tableName: LOCAL_CDC_TABLE, incarnation: sourceRange.incarnation,
      appliedIndex: owed.logIndex - 1, rows: []}).admission, 'install');
    assert.equal(cache.has(LOCAL_CDC_TABLE, 'r-1'), false, 'an earlier image really replaces the local effect');
    assert.equal(cache.applySourceCdcEvent(incoming, sourceRange, leader.timeSource.now()).state,
      'applied');
    assert.equal(cache.get(LOCAL_CDC_TABLE, 'r-1').config_value, 'g-1');
    assert.equal(cache.applySourceCdcEvent(incoming, sourceRange, leader.timeSource.now()).state,
      'covered');
    assert.equal(ledgerFactsOf(leader).owed, 1, 'local cache visibility never acknowledges the ledger');
  } finally {
    await shutdownAll(leader);
  }
});

test('W-D1h: a real cache notification scheduling failure retains source and local recovery debt',
  async () => {
    const {leader} = await startLeader(LOCAL_CDC);
    let notifications = 0;
    const failures = [];
    const cache = new SystemTableCache({timeSource: leader.timeSource,
      scheduleCacheChangeNotification(callback) {
        notifications += 1;
        if (notifications === 1) throw new Error('controlled cache notification failure');
        callback();
      }});
    cache.logger = {debug() {}, warn() {}, info() {}, error(message, fields) {
      failures.push({message, ...fields});
    }};
    cache.onCacheChange(() => {});
    leader.cdcIntegrationService = {cacheMutationTarget: cache};
    try {
      for (const index of [1, 2]) {
        assert.equal(applyCommitted(leader, localUpsertOf(leader, 'cache-failure', index)), null,
          'committed SQL application completes');
      }
      assert.equal(notifications, 2, 'later committed occurrences still reach the real cache');
      assert.equal(failures.length, 1);
      assert.equal(failures[0].error, 'controlled cache notification failure');
      const cell = cache.sourceOrder.positionOf(leader.partitionId);
      assert.equal(cell.state, 'gap');
      assert.equal(cell.position, null);
      assert.equal(cell.relist, 'no_relister', 'local recovery debt survives until relister binding');
      const facts = ledgerFactsOf(leader);
      assert.equal(facts.owed, 2, 'cache refusal cannot discharge durable obligations');
      assert.equal(facts.delivered, 0);
      assert.equal(leader.db.prepare(LOCAL_IMAGE_SQL).all().length, 2);
    } finally {
      await shutdownAll(leader);
    }
  });

test('W-D1i: a noncanonical local source cannot bind table effects; canonical source still progresses',
  async () => {
    const cache = new SystemTableCache();
    let source;
    try {
      ({leader: source} = await startLeader({...LOCAL_CDC, partitionId: PARTITION_ID}));
      source.cdcIntegrationService = {cacheMutationTarget: cache};
      const wrong = localUpsertOf(source, 'wrong-source', 1);
      assert.equal(source.partitionId, PARTITION_ID,
        'the real committed source is internally consistent but not the system table source');
      assert.equal(applyCommitted(source, wrong), null);
      assert.equal(source.db.prepare(LOCAL_IMAGE_SQL).all().length, 1,
        'cache admission cannot rewrite the already committed SQL owner');
      assert.equal(ledgerFactsOf(source).owed, 1, 'the actual source still retains delivery debt');
      assert.equal(cache.has(LOCAL_CDC_TABLE, 'r-1'), false);
      assert.equal(cache.sourceOrder.cells.size, 0, 'invalid source does not acquire a cache cell');
      assert.equal(cache.sourceOrder.tables.has(LOCAL_CDC_TABLE), false);
      await shutdownAll(source);
      source = null;
      ({leader: source} = await startLeader(LOCAL_CDC));
      source.cdcIntegrationService = {cacheMutationTarget: cache};
      const canonical = localUpsertOf(source, 'canonical-source', 1);
      assert.equal(applyCommitted(source, canonical), null);
      assert.equal(cache.get(LOCAL_CDC_TABLE, 'r-1').config_value, 'canonical-source-1');
      assert.equal(cache.sourceOrder.cells.size, 1);
      assert.equal(cache.sourceOrder.cells.has(source.partitionId), true);
      assert.equal(ledgerFactsOf(source).owed, 1);
    } finally {
      if (source !== null && source !== undefined) await shutdownAll(source);
    }
  });
