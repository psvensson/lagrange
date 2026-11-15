// Witness for quest cdc-oversized-entry-range-scan:
// 1. Shipping one ordinal from an oversized Raft entry of 512, 1024, or 4096
//    owed events performs a constant O(1) number of SQLite read queries per
//    wave (<= 4 queries, independent of entry fan-out) instead of rescanning
//    every remaining ordinal in pages of shipWindow + 2 (172, 343, 1367
//    position queries per wave).
// 2. Once committed CDC_DELIVERED acknowledgements bring the remaining owed
//    bytes of an initially oversized entry within SHIP_MAX_BYTES, the next
//    wave classifies the remaining owed ordinals as one whole-entry unit
//    (S-12 / S-13) and ships them together in one vector.
// 3. Skipping a 300-row pending or hydrated prefix in firstReadyRow uses paged
//    position queries (<= 4 queries) instead of 300 single-row queries, and
//    drainPendingHydratedObligations reads positions only without reading
//    event_json payloads.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {CDC_OPERATION} from '../../src/constants/index.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {
  PARTITION_CDC_OBLIGATION_BOUND as BOUND,
  PARTITION_CDC_OBLIGATION_DRIVE_STATE as DRIVE,
  PARTITION_CDC_OBLIGATION_SQL as SQL,
} from '../../src/partition/partition-cdc-obligation-constants.js';
import * as ledger from '../../src/partition/partition-cdc-obligation-ledger.js';
import {
  countCdcObligations,
  ensureCdcObligationLedger,
  insertCdcObligation,
} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {
  clearFixtureSingletons,
  resetFixtureSingletons,
} from '../test-helpers/participant-transaction-fixture.js';
import {
  TABLE,
  addSourceEntry,
  currentLaneOf as laneOf,
  fixture,
  insertOperation,
  primeShipWindow,
  shipWindowOf,
} from '../test-helpers/partition-cdc-lane-fixture.js';
import {
  RECIPIENT_FAULT,
  assertRecipientLogs,
  commitOpenAcknowledgements,
  installRecipientModel,
  runLaneToQuiescence,
} from '../test-helpers/partition-cdc-range-recipient-model.js';

const SCALING_EVENT_COUNTS = Object.freeze([512, 1024, 4096]);
const ONE_KIB_VALUE = 'x'.repeat(1024);
const SIXTY_KIB_VALUE = 'y'.repeat(60 * 1024);
const FIVE_EVENTS_ENTRY = Object.freeze(['e0', 'e1', 'e2', 'e3', 'e4']);
const PREFIX_ROWS = 300;
const TAIL_ROWS = 5;
const MAX_QUERIES_PER_WAVE = 4;
const OVERSIZED_LOG_INDEX = 1;
const OVERSIZED_TERM = 1;

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const idsOf = (count, prefix) => Array.from({length: count}, (_unused, index) =>
  `${prefix}-${String(index).padStart(4, '0')}`);

function populateOversizedEntry(leader, count, tag = 'oversized-scaling') {
  ensureCdcObligationLedger(leader.db);
  const timestamp = new HLCTimestamp(1000, 0, 'source-progress-component').toString();
  const insertAll = leader.db.transaction(() => {
    for (let ordinal = 0; ordinal < count; ordinal += 1) {
      const id = `${tag}-${String(ordinal).padStart(4, '0')}`;
      insertCdcObligation(leader.db, {
        eventKey: `txop:${tag}:${ordinal}`,
        logIndex: OVERSIZED_LOG_INDEX,
        term: OVERSIZED_TERM,
        ordinal,
        entryId: `commit:${tag}`,
        eventJson: JSON.stringify({
          tableName: TABLE,
          operation: CDC_OPERATION.INSERT,
          data: {id, value: ONE_KIB_VALUE},
          sourcePartition: leader.partitionId,
          timestamp,
        }),
      });
    }
  });
  insertAll();
  return count;
}

function observeLedgerQueries(db) {
  const prepare = db.prepare;
  const counts = {
    positionsAfter: 0,
    entryBytes: 0,
    payloadsAfter: 0,
  };
  const reset = () => {
    counts.positionsAfter = 0;
    counts.entryBytes = 0;
    counts.payloadsAfter = 0;
  };
  const snapshot = () => ({
    positionsAfter: counts.positionsAfter,
    entryBytes: counts.entryBytes,
    payloadsAfter: counts.payloadsAfter,
    totalRangeReads: counts.positionsAfter + counts.entryBytes + counts.payloadsAfter,
  });
  db.prepare = function(sql) {
    const statement = prepare.call(this, sql);
    if (sql === SQL.SELECT_OWED_POSITIONS_AFTER) {
      const all = statement.all;
      statement.all = function(...args) {
        counts.positionsAfter += 1;
        return all.apply(this, args);
      };
    } else if (sql === SQL.SELECT_OWED_ENTRY_BYTES) {
      const get = statement.get;
      statement.get = function(...args) {
        counts.entryBytes += 1;
        return get.apply(this, args);
      };
    } else if (sql === SQL.SELECT_OWED_AFTER) {
      const all = statement.all;
      statement.all = function(...args) {
        counts.payloadsAfter += 1;
        return all.apply(this, args);
      };
    }
    return statement;
  };
  return {
    counts,
    reset,
    snapshot,
    restore: () => {
      db.prepare = prepare;
    },
  };
}

test('R1 oversized entry scaling: shipping 1 event from a single Raft entry with 512, 1024, ' +
  'or 4096 owed events executes a constant O(1) number of SQLite read queries (<= 4 per wave) ' +
  'and cuts on the byte bound', async (t) => {
  const wave1Snapshots = [];
  const wave2Snapshots = [];
  for (const eventCount of SCALING_EVENT_COUNTS) {
    const tag = `scale-${eventCount}`;
    const f = await fixture(t, {
      rows: [],
      subscribers: 1,
      populate: (leader) => populateOversizedEntry(leader, eventCount, tag),
    });
    const observed = observeLedgerQueries(f.leader.db);
    t.after(observed.restore);
    const waveSnapshots = [];
    const windowCutByWave = [];
    const model = installRecipientModel(f, {
      onWave: () => {
        waveSnapshots.push(observed.snapshot());
        windowCutByWave.push(laneOf(f).currentObligation?.windowCut ?? null);
        observed.reset();
      },
    });
    // Hold on the second ordinal so one drive executes Wave 1 (ordinal 0,
    // committed) and composes Wave 2 (ordinal 1, held by backpressure).
    model.faults.set(`txop:${tag}:1`, new Map([[0, [RECIPIENT_FAULT.BACKPRESSURE]]]));
    observed.reset();
    const outcome = await f.drive();
    assert.equal(outcome.state, DRIVE.HELD_BY_SUBSCRIBER, `M=${eventCount}: held at wave 2`);
    assert.equal(outcome.delivered, 1, `M=${eventCount}: wave 1 delivered ordinal 0`);
    assert.deepEqual(
      model.waves.map((wave) => wave.ids),
      [[`${tag}-0000`], [`${tag}-0001`]],
      `M=${eventCount}: each wave ships one ordinal in order`,
    );
    assert.deepEqual(
      windowCutByWave,
      [false, false],
      `M=${eventCount}: oversized entry waves are cut by the byte bound, never the window`,
    );
    assert.equal(shipWindowOf(f), 1, `M=${eventCount}: shipWindow stays 1 after byte-bound cut`);
    assert.equal(waveSnapshots.length, 2, `M=${eventCount}: observed two wave compositions`);
    const [wave1, wave2] = waveSnapshots;
    wave1Snapshots.push({eventCount, ...wave1});
    wave2Snapshots.push({eventCount, ...wave2});
  }
  for (const [index, eventCount] of SCALING_EVENT_COUNTS.entries()) {
    const wave1 = wave1Snapshots[index];
    const wave2 = wave2Snapshots[index];
    assert.ok(
      wave1.positionsAfter <= MAX_QUERIES_PER_WAVE &&
      wave1.totalRangeReads <= MAX_QUERIES_PER_WAVE,
      `M=${eventCount} wave 1 SQLite queries: ${JSON.stringify(wave1)} ` +
      `(all wave1=${JSON.stringify(wave1Snapshots)}, wave2=${JSON.stringify(wave2Snapshots)}; ` +
      `expected <= ${MAX_QUERIES_PER_WAVE})`,
    );
    assert.ok(
      wave2.positionsAfter <= MAX_QUERIES_PER_WAVE &&
      wave2.totalRangeReads <= MAX_QUERIES_PER_WAVE,
      `M=${eventCount} wave 2 SQLite queries: ${JSON.stringify(wave2)} ` +
      `(expected <= ${MAX_QUERIES_PER_WAVE})`,
    );
  }
  assert.equal(
    new Set(wave1Snapshots.map((entry) => entry.totalRangeReads)).size,
    1,
    `wave 1 query count is constant across M=512, 1024, 4096: ${JSON.stringify(wave1Snapshots)}`,
  );
  assert.equal(
    new Set(wave2Snapshots.map((entry) => entry.totalRangeReads)).size,
    1,
    `wave 2 query count is constant across M=512, 1024, 4096: ${JSON.stringify(wave2Snapshots)}`,
  );
});

test('R2 oversized-to-whole transition (S-12 / S-13): once committed CDC_DELIVERED reduces an ' +
  'oversized entry\'s remaining owed bytes within SHIP_MAX_BYTES, the remaining ordinals ' +
  'ship together as one whole-entry unit', async (t) => {
  const f = await fixture(t, {
    rows: [],
    subscribers: 1,
    populate: (leader) => {
      // 5 events * ~60 KiB = ~300 KiB > 256 KiB initially; 4 events = ~240 KiB <= 256 KiB.
      addSourceEntry(
        leader,
        'transition-entry',
        FIVE_EVENTS_ENTRY.map((id) => insertOperation(id, SIXTY_KIB_VALUE)),
      );
      return FIVE_EVENTS_ENTRY.length;
    },
  });
  const model = installRecipientModel(f);
  const entryLogIndex = model.raw[0].logIndex;
  assert.equal(
    typeof ledger.readOwedCdcEntryBytes,
    'function',
    'ledger exports readOwedCdcEntryBytes(db, logIndex)',
  );
  const initialEntryBytes = ledger.readOwedCdcEntryBytes(f.leader.db, entryLogIndex);
  assert.ok(
    initialEntryBytes > BOUND.SHIP_MAX_BYTES,
    `initial owed entry bytes (${initialEntryBytes}) exceed SHIP_MAX_BYTES (${BOUND.SHIP_MAX_BYTES})`,
  );
  const secondKey = model.raw[1].eventKey;
  model.faults.set(secondKey, new Map([[0, [RECIPIENT_FAULT.BACKPRESSURE]]]));

  // Wave 1 ships ordinal 0 alone; Wave 2 composes ordinal 1 alone (since
  // ordinal 0's CDC_DELIVERED is not yet committed) and holds on backpressure.
  const firstDrive = await f.drive();
  assert.equal(firstDrive.state, DRIVE.HELD_BY_SUBSCRIBER);
  assert.equal(firstDrive.delivered, 1);
  assert.deepEqual(
    model.waves.map((wave) => wave.ids),
    [['e0'], ['e1']],
    'while all 5 ordinals are owed in the ledger, ordinals 0 and 1 each compose alone',
  );
  assert.equal(shipWindowOf(f), 1, 'byte-bound cut leaves shipWindow at 1');

  // Commit CDC_DELIVERED for ordinal 0: remaining owed bytes for the entry are
  // now 4 * ~60 KiB = ~240 KiB <= SHIP_MAX_BYTES (256 KiB).
  const mark = model.waves.length;
  await commitOpenAcknowledgements(f);
  const remainingEntryBytes = ledger.readOwedCdcEntryBytes(f.leader.db, entryLogIndex);
  assert.ok(
    remainingEntryBytes > 0 && remainingEntryBytes <= BOUND.SHIP_MAX_BYTES,
    `remaining owed entry bytes (${remainingEntryBytes}) fit within SHIP_MAX_BYTES`,
  );
  assert.deepEqual(
    model.waves.slice(mark).map((wave) => wave.ids),
    [['e1', 'e2', 'e3', 'e4']],
    'remaining 4 ordinals fit within SHIP_MAX_BYTES and ship together as one atomic unit',
  );

  await runLaneToQuiescence(f);
  assertRecipientLogs(model);
  assert.deepEqual(countCdcObligations(f.leader.db), {owed: 0, delivered: 5});
});

test('R3 pending/hydrated prefix paging and position-only drainPendingHydratedObligations: ' +
  'skipping 300 pending or hydrated rows uses paged position queries (<= 4) and ' +
  'drainPendingHydratedObligations never reads event_json payloads', async (t) => {
  const pendingRows = idsOf(PREFIX_ROWS + TAIL_ROWS, 'pending-prefix');
  const fPending = await fixture(t, {rows: pendingRows, subscribers: 1});
  const pendingModel = installRecipientModel(fPending);
  primeShipWindow(fPending, BOUND.ACK_BATCH_MAX_EVENTS);
  const pendingLane = laneOf(fPending);
  for (let index = 0; index < PREFIX_ROWS; index += 1) {
    const row = pendingModel.raw[index];
    pendingLane.pending.set(row.eventKey, {logIndex: row.logIndex, ordinal: row.ordinal});
  }
  const observedPending = observeLedgerQueries(fPending.leader.db);
  t.after(observedPending.restore);
  observedPending.reset();
  const pendingOutcome = await fPending.drive();
  const pendingSnapshot = observedPending.snapshot();
  assert.equal(pendingOutcome.state, DRIVE.DRAINED);
  assert.deepEqual(
    pendingModel.waves.map((wave) => wave.ids),
    [pendingRows.slice(PREFIX_ROWS)],
    'the 300 pending rows are skipped and the 5 READY rows ship together',
  );
  assert.ok(
    pendingSnapshot.positionsAfter <= MAX_QUERIES_PER_WAVE,
    `skipping 300 pending rows used ${pendingSnapshot.positionsAfter} position queries ` +
    `(expected <= ${MAX_QUERIES_PER_WAVE})`,
  );

  const hydratedRows = idsOf(PREFIX_ROWS + TAIL_ROWS, 'hydrated-prefix');
  const fHydrated = await fixture(t, {rows: hydratedRows, subscribers: 1});
  const hydratedModel = installRecipientModel(fHydrated);
  primeShipWindow(fHydrated, BOUND.ACK_BATCH_MAX_EVENTS);
  const throughLogIndex = hydratedModel.raw[PREFIX_ROWS - 1].logIndex;
  laneOf(fHydrated).hydratedThroughLogIndex = throughLogIndex;
  hydratedModel.hydratedThroughLogIndex = throughLogIndex;
  const observedHydrated = observeLedgerQueries(fHydrated.leader.db);
  t.after(observedHydrated.restore);
  observedHydrated.reset();

  const hydratedOutcome = await fHydrated.drive();
  const hydratedDriveSnapshot = observedHydrated.snapshot();
  assert.equal(hydratedOutcome.state, DRIVE.DRAINED);
  assert.deepEqual(
    hydratedModel.waves.map((wave) => wave.ids),
    [hydratedRows.slice(PREFIX_ROWS)],
  );
  assert.ok(
    hydratedDriveSnapshot.positionsAfter <= MAX_QUERIES_PER_WAVE,
    `driving past 300 hydrated rows in firstReadyRow used ${
      hydratedDriveSnapshot.positionsAfter} position queries (expected <= ${MAX_QUERIES_PER_WAVE})`,
  );
  await runLaneToQuiescence(fHydrated);
  assertRecipientLogs(hydratedModel);
  assert.deepEqual(
    countCdcObligations(fHydrated.leader.db),
    {owed: 0, delivered: hydratedRows.length},
  );

  const drainRows = idsOf(PREFIX_ROWS + TAIL_ROWS, 'drain-hydrated');
  const fDrain = await fixture(t, {rows: drainRows, subscribers: 1});
  const drainModel = installRecipientModel(fDrain);
  primeShipWindow(fDrain, BOUND.ACK_BATCH_MAX_EVENTS);
  const observedDrain = observeLedgerQueries(fDrain.leader.db);
  t.after(observedDrain.restore);
  observedDrain.reset();

  const drainThrough = drainModel.raw[PREFIX_ROWS - 1].logIndex;
  const drained = drainModel.hydratedThrough(drainThrough);
  const drainSnapshot = observedDrain.snapshot();
  assert.equal(drained.acknowledged, PREFIX_ROWS, 'all 300 hydrated rows acknowledged');
  assert.equal(
    drainSnapshot.payloadsAfter,
    0,
    'drainPendingHydratedObligations must not read event_json payloads ' +
    `(observed ${drainSnapshot.payloadsAfter} SELECT_OWED_AFTER queries)`,
  );
  assert.equal(
    drainSnapshot.positionsAfter,
    1,
    'drainPendingHydratedObligations reads owed positions in one query',
  );
  await runLaneToQuiescence(fDrain);
  assertRecipientLogs(drainModel);
  assert.deepEqual(
    countCdcObligations(fDrain.leader.db),
    {owed: 0, delivered: drainRows.length},
  );
});
