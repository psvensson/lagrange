// The shipping unit of the partition CDC obligation lane (quest
// cdc-obligation-range-shipping, supersession record 5: S-12 the unit, S-13
// the one cut authority, S-14 the evidence).
//
// A ledger entry whose owed ordinals together fit the lane's byte bound is one
// unit and travels whole; an entry whose owed ordinals together exceed it
// ships one ordinal per vector, in ordinal order, as the lane before ranges
// shipped every entry. Every cut reason (the shipping window, the byte bound,
// the retained-delivered bound, a row that is not READY, the captured tail,
// the pinned cell's cap) cuts only where a unit ends.
//
// Literal anchors: each cut reason against an entry that is NOT first in its
// range (the position the earlier witnesses left open), and the oversized
// entry. Then the property, over generated ledgers and schedules: every
// composition of the lane is observed where it reads the payloads of the
// range it chose, together with the ledger and the lane as they stand at that
// instant, and is held to the unit rule by a reference written here (raw SQL
// over the ledger, the lane's pending set and hydrated index), never through
// the lane's own cut.
//
// Owner path: PartitionCDCDelivery's obligation lane on the lane fixture, with
// the real application, ledger, subscription and acknowledgement owners; the
// recipients are the recipient model (an evidence ceiling of the source lane,
// never of a native message-group commit).
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {PARTITION_CDC_OBLIGATION_BOUND as BOUND,
  PARTITION_CDC_OBLIGATION_DRIVE_STATE as DRIVE,
  PARTITION_CDC_OBLIGATION_SQL as SQL} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {countCdcObligations} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {cdcProgressHoldsCoverage} from
  '../../src/partition/partition-cdc-obligation-progress.js';
import {clearFixtureSingletons, resetFixtureSingletons, settleTicks} from
  '../test-helpers/participant-transaction-fixture.js';
import {addSourceEntry, addSourceRow, currentLaneOf as laneOf, fixture, insertOperation,
  primeShipWindow, shipWindowOf} from '../test-helpers/partition-cdc-lane-fixture.js';
import {RECIPIENT_FAULT, assertRecipientLogs, commitOpenAcknowledgements,
  installRecipientModel, runLaneToQuiescence} from
  '../test-helpers/partition-cdc-range-recipient-model.js';

// A window wide enough that it never cuts the small ledgers below.
const STEADY_WINDOW = BOUND.ACK_BATCH_MAX_EVENTS;
const SIBLINGS = Object.freeze(['s0', 's1', 's2']);
// Payloads by their share of the byte bound; the stored event adds a few
// hundred bytes of envelope to each.
const bytesOf = (share) => 'x'.repeat(Math.ceil(BOUND.SHIP_MAX_BYTES * share));

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const idsOfWaves = (model, from = 0) => model.waves.slice(from).map((wave) => wave.ids);
const leafWaves = (model, from = 0) =>
  model.waves.slice(from).map((wave) => [wave.index, wave.ids]);
const rawOf = (model, id) => model.raw.find((row) => JSON.parse(row.eventJson).data?.id === id);

// The lane's outstanding acknowledgements, `short` rows short of the
// retained-delivered bound (its own record of delivered rows whose
// CDC_DELIVERED has not committed). Their positions lie above every ledger
// row, so no reclaimed prefix ever settles them.
function holdOutstandingAcknowledgements(lane, short) {
  const keys = Array.from({length: BOUND.RETAINED_DELIVERED_MAX - short},
    (_unused, index) => `outstanding-${index}`);
  for (const [index, key] of keys.entries()) {
    lane.pending.set(key, {logIndex: Number.MAX_SAFE_INTEGER, ordinal: index});
  }
  return () => {
    for (const key of keys) lane.pending.delete(key);
  };
}

// --- every cut reason, against an entry that is not first in its range ---

// The verifier's surviving mutant W6b: the retained-delivered bound judged row
// by row inside an entry that follows another row in the range. The bound is
// asked where a unit begins; the unit's further ordinals travel with it.
test('retained-delivered bound, entry not first in its range: the bound is asked where the ' +
  'entry begins, the whole entry joins, and the bound is passed only by its further ' +
  'ordinals', async (t) => {
  const f = await fixture(t, {rows: ['p0'], subscribers: 1, populate: (leader) => {
    addSourceEntry(leader, 'siblings', SIBLINGS.map((id) => insertOperation(id)));
    addSourceRow(leader, 'after');
    return SIBLINGS.length + 1;
  }});
  const model = installRecipientModel(f);
  primeShipWindow(f, STEADY_WINDOW);
  const lane = laneOf(f);
  // Three short of the bound: the lowest owed row and the entry's first
  // ordinal fit under it; its third ordinal, counted alone, would not.
  const release = holdOutstandingAcknowledgements(lane, 3);
  const outcome = await f.drive();
  assert.deepEqual(idsOfWaves(model), [['p0', ...SIBLINGS]],
    'the entry that is not first in its range ships whole: the bound never cuts it apart');
  assert.equal(outcome.state, DRIVE.ACKNOWLEDGEMENT_BACKPRESSURE,
    'the row after the entry begins a unit at the bound and is held back');
  assert.equal(outcome.delivered, 1 + SIBLINGS.length);
  assert.equal(lane.pending.size, BOUND.RETAINED_DELIVERED_MAX + 1,
    'the bound is passed by the further ordinals of one unit, and by nothing else');
  assert.equal(shipWindowOf(f), STEADY_WINDOW, 'a bound cut is not a window cut');
  release();
  await runLaneToQuiescence(f);
  assert.deepEqual(idsOfWaves(model), [['p0', ...SIBLINGS], ['after']]);
  assertRecipientLogs(model);
});

test('shipping window, entry not first in its range: the window cuts before the entry, ' +
  'never inside it', async (t) => {
  const f = await fixture(t, {rows: ['p0'], subscribers: 1, populate: (leader) => {
    addSourceEntry(leader, 'siblings', SIBLINGS.map((id) => insertOperation(id)));
    return SIBLINGS.length;
  }});
  const model = installRecipientModel(f);
  primeShipWindow(f, 2);
  assert.equal((await f.drive()).state, DRIVE.DRAINED);
  assert.deepEqual(idsOfWaves(model), [['p0'], [...SIBLINGS]],
    'a window of two rows holds the three-row entry back whole; it then ships whole');
  assert.deepEqual(model.waves.map((wave) => wave.window), [2, 4],
    'the window alone held the entry back, so the first range widened it');
  await runLaneToQuiescence(f);
  assertRecipientLogs(model);
});

test('byte bound, entry not first in its range: the byte bound cuts before the entry, ' +
  'never inside it', async (t) => {
  const f = await fixture(t, {rows: [], subscribers: 1, populate: (leader) => {
    addSourceRow(leader, 'half', bytesOf(1 / 2));
    addSourceEntry(leader, 'siblings',
      SIBLINGS.map((id) => insertOperation(id, bytesOf(1 / 4))));
    return 1 + SIBLINGS.length;
  }});
  const model = installRecipientModel(f);
  primeShipWindow(f, STEADY_WINDOW);
  assert.equal((await f.drive()).state, DRIVE.DRAINED);
  assert.deepEqual(idsOfWaves(model), [['half'], [...SIBLINGS]],
    'the entry (three quarters of the bound) does not fit after half the bound: it is held ' +
    'back whole and ships whole');
  assert.equal(shipWindowOf(f), STEADY_WINDOW, 'a byte cut is not a window cut');
  await runLaneToQuiescence(f);
  assertRecipientLogs(model);
});

// The pinned cell's cap asks the same authority. The state is made by hand
// (the lane does not produce a pending ordinal behind READY siblings of a
// whole entry): the entry's last ordinal is pending when the range is first
// composed, so the cell ends inside the entry, and it is READY again when the
// range is presented again. The cap is then no unit boundary, so the cell's
// range is not presented again as it was: a leaf is never handed a strict
// subset of a unit as the ledger and the lane stand at that composition.
test('pinned cap, entry not first in its range: a cap that no longer ends a unit is not ' +
  'used; the range is composed again at unit boundaries', async (t) => {
  const f = await fixture(t, {rows: ['p0'], subscribers: 2, populate: (leader) => {
    addSourceEntry(leader, 'siblings', SIBLINGS.map((id) => insertOperation(id)));
    return SIBLINGS.length;
  }});
  const model = installRecipientModel(f);
  primeShipWindow(f, STEADY_WINDOW);
  const lane = laneOf(f);
  const last = rawOf(model, 's2');
  lane.pending.set(last.eventKey, {logIndex: last.logIndex, ordinal: last.ordinal});
  // The second leaf answers typed backpressure once: the first leaf covers
  // the range and the cell is kept.
  model.faults.set(model.raw[0].eventKey, new Map([[1, [RECIPIENT_FAULT.BACKPRESSURE]]]));
  assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
  assert.deepEqual(leafWaves(model), [[0, ['p0', 's0', 's1']], [1, ['p0', 's0', 's1']]]);
  assert.deepEqual([lane.currentObligation.rows, lane.currentObligation.last.ordinal], [3, 1],
    'the cell ends at the second ordinal of the entry');
  lane.pending.delete(last.eventKey);
  const mark = model.waves.length;
  await f.drive();
  assert.deepEqual(leafWaves(model, mark),
    [[0, ['p0', ...SIBLINGS]], [1, ['p0', ...SIBLINGS]]],
    'the cap fell inside a unit: the range is composed again with the whole entry and ' +
    'goes to every leaf');
  await runLaneToQuiescence(f);
  // The first leaf committed the range that ended at the hand-made pending
  // ordinal, so its log is not held to the unit rule of the whole ledger.
  assertRecipientLogs(model, {wholeUnits: false});
  assert.deepEqual(countCdcObligations(f.leader.db), {owed: 0, delivered: 1 + SIBLINGS.length});
});

// What decides how an entry ships is its durable content, never the lane's
// window: an entry that travelled whole and is held by one leaf is presented
// again whole when failed attempts narrowed the window below its row count
// (the first unit of a range always ships, so the composition is still the
// cell's range and only the uncovered leaf is handed it). The leaf that holds
// its last ordinal is never handed an earlier one alone.
test('shipping window below an entry a leaf holds: the entry is presented again whole, ' +
  'never ordinal by ordinal', async (t) => {
  const entry = ['w0', 'w1', 'w2', 'w3'];
  const f = await fixture(t, {rows: [], subscribers: 2, populate: (leader) => {
    addSourceEntry(leader, 'held-whole', entry.map((id) => insertOperation(id)));
    return entry.length;
  }});
  const model = installRecipientModel(f);
  primeShipWindow(f, entry.length);
  // The second leaf fails the attempt twice: the window halves to two, then one.
  model.faults.set(model.raw[0].eventKey,
    new Map([[1, [RECIPIENT_FAULT.UNKNOWN, RECIPIENT_FAULT.UNKNOWN]]]));
  assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
  assert.equal(shipWindowOf(f), 2);
  assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
  assert.equal(shipWindowOf(f), 1);
  await runLaneToQuiescence(f);
  assert.deepEqual(leafWaves(model), [[0, entry], [1, entry], [1, entry], [1, entry]],
    'every presentation is the whole entry, at a window of four, two and one, and the ' +
    'leaf that holds it is not handed it again');
  assert.deepEqual(model.waves.map((wave) => wave.window), [4, 4, 2, 1]);
  assertRecipientLogs(model);
  assert.deepEqual(countCdcObligations(f.leader.db), {owed: 0, delivered: entry.length});
});

// --- the oversized entry (S-12) ---

test('an entry whose owed ordinals together exceed the byte bound ships one ordinal per ' +
  'vector, in ordinal order, between the ranges around it', async (t) => {
  const oversized = ['g0', 'g1', 'g2', 'g3'];
  const f = await fixture(t, {rows: ['s1', 's2'], subscribers: 1, populate: (leader) => {
    // Four ordinals of half the bound each: any two of them exceed it.
    addSourceEntry(leader, 'oversized',
      oversized.map((id) => insertOperation(id, bytesOf(1 / 2))));
    addSourceRow(leader, 's3');
    addSourceRow(leader, 's4');
    return oversized.length + 2;
  }});
  const model = installRecipientModel(f);
  primeShipWindow(f, STEADY_WINDOW);
  assert.equal((await f.drive()).state, DRIVE.DRAINED, 'one pass ships every range');
  assert.deepEqual(idsOfWaves(model), [['s1', 's2'], ['g0'], ['g1'], ['g2'], ['g3'], ['s3', 's4']],
    'each ordinal of the oversized entry is a vector of its own, in ordinal order; the ' +
    'ordinary rows before and after it travel as ranges');
  assert.equal(shipWindowOf(f), STEADY_WINDOW, 'the byte bound cut these runs, not the window');
  await runLaneToQuiescence(f);
  assert.equal(model.waves.length, 6, 'nothing is shipped twice');
  assertRecipientLogs(model);
  assert.deepEqual(countCdcObligations(f.leader.db),
    {owed: 0, delivered: oversized.length + 4});
});

test('an oversized entry ships one ordinal per vector from a cold window as well, and the ' +
  'window is left alone by it', async (t) => {
  const oversized = ['g0', 'g1', 'g2'];
  const f = await fixture(t, {rows: [], subscribers: 2, populate: (leader) => {
    addSourceEntry(leader, 'oversized',
      oversized.map((id) => insertOperation(id, bytesOf(2 / 3))));
    return oversized.length;
  }});
  const model = installRecipientModel(f);
  assert.equal(shipWindowOf(f), 1);
  assert.equal((await f.drive()).state, DRIVE.DRAINED);
  assert.deepEqual(leafWaves(model), oversized.flatMap((id) => [[0, [id]], [1, [id]]]),
    'every leaf is handed one ordinal per vector, in ordinal order');
  assert.equal(shipWindowOf(f), 1, 'no run of an oversized entry is window-cut');
  await runLaneToQuiescence(f);
  assertRecipientLogs(model);
});

// What the classification reads: the bytes of the entry's rows the ledger
// still owes, a durable fact that only a committed CDC_DELIVERED changes. Here
// the first ordinal's acknowledgement commits while the second ordinal is
// pinned (one leaf covers it); the two ordinals still owed then fit the byte
// bound, so they are one unit. The pinned cell's cap (the second ordinal) no
// longer ends a unit: the range is composed again as the whole unit, and the
// covered leaf is handed the ordinal it holds followed by the later one, never
// an earlier ordinal.
test('an oversized entry whose first ordinals are durably delivered ships its remaining ' +
  'ordinals as one unit once they fit the byte bound; a pinned ordinal is then presented ' +
  'again with its later sibling', async (t) => {
  const f = await fixture(t, {rows: [], subscribers: 2, populate: (leader) => {
    // Three ordinals of somewhat more than a third of the bound: together they
    // exceed it, two of them fit.
    addSourceEntry(leader, 'oversized',
      ['g0', 'g1', 'g2'].map((id) => insertOperation(id, bytesOf(0.34))));
    return 3;
  }});
  const model = installRecipientModel(f);
  primeShipWindow(f, STEADY_WINDOW);
  model.faults.set(rawOf(model, 'g1').eventKey, new Map([[1, [RECIPIENT_FAULT.BACKPRESSURE]]]));
  assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
  assert.deepEqual(leafWaves(model), [[0, ['g0']], [1, ['g0']], [0, ['g1']], [1, ['g1']]],
    'while all three ordinals are owed the entry ships one ordinal per vector');
  const lane = laneOf(f);
  assert.deepEqual([lane.currentObligation.rows, lane.currentObligation.last.ordinal], [1, 1],
    'the second ordinal is pinned: the first leaf covers it');
  const mark = model.waves.length;
  await commitOpenAcknowledgements(f);
  assert.deepEqual(countCdcObligations(f.leader.db), {owed: 2, delivered: 1});
  await f.drive();
  assert.deepEqual(leafWaves(model, mark), [[0, ['g1', 'g2']], [1, ['g1', 'g2']]],
    'the two ordinals still owed are one unit: the covered leaf is handed the ordinal it ' +
    'holds and the later one, in one vector');
  await runLaneToQuiescence(f);
  assertRecipientLogs(model);
  assert.deepEqual(countCdcObligations(f.leader.db), {owed: 0, delivered: 3});
});

// The same reading at the entry's end: once every other ordinal of an
// oversized entry is durably delivered, the one ordinal still owed fits the
// byte bound by itself, so it is an ordinary unit and may share a range with
// the rows after it. Its entry's ordinals still never share a vector.
test('the last owed ordinal of an oversized entry is an ordinary unit once its siblings ' +
  'are durably delivered: it travels with the row after it', async (t) => {
  const f = await fixture(t, {rows: [], subscribers: 1, populate: (leader) => {
    addSourceEntry(leader, 'oversized',
      ['g0', 'g1'].map((id) => insertOperation(id, bytesOf(0.55))));
    addSourceRow(leader, 'after');
    return 3;
  }});
  const model = installRecipientModel(f);
  primeShipWindow(f, STEADY_WINDOW);
  // The recipient answers typed backpressure once for the second ordinal:
  // nothing is attempted, and the first ordinal's acknowledgement commits
  // before the second is composed again.
  model.faults.set(rawOf(model, 'g1').eventKey, new Map([[0, [RECIPIENT_FAULT.BACKPRESSURE]]]));
  assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
  assert.deepEqual(idsOfWaves(model), [['g0'], ['g1']],
    'while both ordinals are owed each is a vector of its own');
  await commitOpenAcknowledgements(f);
  assert.deepEqual(countCdcObligations(f.leader.db), {owed: 2, delivered: 1});
  await runLaneToQuiescence(f);
  assert.deepEqual(idsOfWaves(model), [['g0'], ['g1'], ['g1', 'after']],
    'the ordinal still owed fits the bound by itself and travels with the next row');
  assertRecipientLogs(model);
  assert.deepEqual(countCdcObligations(f.leader.db), {owed: 0, delivered: 3});
});

// --- the property (S-14) ---
//
// Generated ledgers: entries of one to many ordinals, below and above the byte
// bound, at every position of the scan. Generated schedules: a starting window,
// recipient faults keyed by row identity (re-presentation, pinning, a window
// that narrows under a pinned range), acknowledgements committed between
// compositions, and by family: the lane near the retained-delivered bound, a
// hydration handshake in flight, provisional coverage, a new tenure. The
// generator is seeded and uses no wall-clock time; every assertion names the
// seed.

const HOLDING_FAULTS = Object.freeze([RECIPIENT_FAULT.UNKNOWN,
  RECIPIENT_FAULT.COMMITTED_UNKNOWN, RECIPIENT_FAULT.THROW, RECIPIENT_FAULT.BACKPRESSURE]);
// Which entries a leaf must never be left at an earlier ordinal of. Provisional
// coverage and a new tenure present an ordinal of a per-ordinal entry again
// after a later one, as the lane before ranges did for every entry; an entry
// that travels whole is never presented that way.
const HELD_SCOPE = Object.freeze({EVERY_ENTRY: 'every entry', WHOLE_ENTRIES: 'whole entries'});
const FAMILY = Object.freeze({
  HOLDING: {name: 'faults that hold the lane', faults: HOLDING_FAULTS, ordered: true,
    held: HELD_SCOPE.EVERY_ENTRY, perOrdinalSequence: true,
    seeds: [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112]},
  RETAINED: {name: 'the lane near the retained-delivered bound', faults: HOLDING_FAULTS,
    ordered: true, held: HELD_SCOPE.EVERY_ENTRY, perOrdinalSequence: true, retained: true,
    seeds: [201, 202, 203, 204, 205, 206, 207, 208]},
  HYDRATION: {name: 'a hydration handshake in flight', faults: HOLDING_FAULTS, ordered: true,
    held: HELD_SCOPE.EVERY_ENTRY, perOrdinalSequence: false, hydration: true,
    seeds: [301, 302, 303, 304, 305, 306, 307, 308]},
  PASSING: {name: 'faults including provisional coverage',
    faults: [...HOLDING_FAULTS, RECIPIENT_FAULT.PROVISIONAL], ordered: false,
    held: HELD_SCOPE.WHOLE_ENTRIES, perOrdinalSequence: false,
    seeds: [401, 402, 403, 404, 405, 406, 407, 408]},
  RESTART: {name: 'a new tenure in the middle of the backlog', faults: HOLDING_FAULTS,
    ordered: true, held: HELD_SCOPE.WHOLE_ENTRIES, perOrdinalSequence: false, restart: true,
    seeds: [501, 502, 503, 504, 505, 506, 507, 508]},
});
const FAULTED_ROW_SHARE = 0.15;
const START_WINDOWS = Object.freeze([1, 1, 2, 3, 5, 8, STEADY_WINDOW]);
const COMMIT_SHARES = Object.freeze([0, 0.3, 1]);
const OWED_SNAPSHOT_SQL = 'SELECT event_key, log_index, ordinal, ' +
  'length(CAST(event_json AS BLOB)) AS bytes FROM _cdc_obligations WHERE delivered = 0 ' +
  'ORDER BY log_index, ordinal';
const RETAINED_SNAPSHOT_SQL =
  'SELECT COUNT(*) AS count FROM _cdc_obligations WHERE delivered = 1';

// What the generated cases exercised, counted over the whole file: the last
// test fails when a kind the property is stated for never occurred.
const exercised = {compositions: 0, windowHeldEntryBack: 0, bytesHeldEntryBack: 0,
  retainedHeldEntryBack: 0, ordinalShippedAlone: 0, entryWiderThanWindow: 0,
  pinnedPresentedAgain: 0, becameWhole: 0, acknowledgedBetweenCompositions: 0};

// Mulberry32: a small deterministic generator; the seed is the whole state.
function generatorOf(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const below = (random, bound) => Math.floor(random() * bound);
const pick = (random, values) => values[below(random, values.length)];
const isBefore = (left, right) => left.logIndex < right.logIndex ||
  (left.logIndex === right.logIndex && left.ordinal < right.ordinal);

// The payload shares (of the byte bound) of one generated entry's ordinals.
function entrySharesOf(random) {
  const kind = random();
  if (kind < 0.28) return [0];
  if (kind < 0.38) return Array.from({length: 12 + below(random, 20)}, () => 0);
  if (kind < 0.56) return Array.from({length: 2 + below(random, 5)}, () => 0);
  if (kind < 0.7) {
    // Whole and heavy: nine tenths of the bound over two to four ordinals.
    const ordinals = 2 + below(random, 3);
    return Array.from({length: ordinals}, () => 0.9 / ordinals);
  }
  if (kind < 0.82) {
    // Above the bound until its first ordinal is durably delivered.
    return random() < 0.5 ? [0.36, 0.36, 0.36] : [0.3, 0.3, 0.3, 0.3];
  }
  if (kind < 0.94) {
    // Above the bound to its last ordinal: any two of them exceed it.
    return Array.from({length: 2 + below(random, 2)}, () => 0.51 + random() * 0.05);
  }
  return [1.01];
}

function planOf(seed, family) {
  const random = generatorOf(seed);
  const entries = Array.from({length: 8 + below(random, 7)}, (_unused, index) =>
    ({tag: `p${seed}-${index}`, shares: entrySharesOf(random)}));
  const rows = entries.reduce((sum, entry) => sum + entry.shares.length, 0);
  return {seed, random, entries, rows, leaves: 1 + below(random, 3),
    window: pick(random, START_WINDOWS), commitShare: pick(random, COMMIT_SHARES),
    retainedShort: family.retained ? 1 + below(random, 6) : null,
    imageThrough: below(random, rows), imageAt: below(random, rows),
    restartAtRound: family.restart ? 1 + below(random, 3) : null};
}

function commitEntry(leader, entry) {
  const value = (share, id) => share === 0 ? `${id}:small` : `${id}:`.padEnd(
    Math.ceil(BOUND.SHIP_MAX_BYTES * share), 'x');
  if (entry.shares.length === 1) {
    addSourceRow(leader, `${entry.tag}-0`, value(entry.shares[0], `${entry.tag}-0`));
  } else {
    addSourceEntry(leader, entry.tag, entry.shares.map((share, ordinal) =>
      insertOperation(`${entry.tag}-${ordinal}`, value(share, `${entry.tag}-${ordinal}`))));
  }
  return entry.shares.length;
}

// Every composition of the lane, observed where it reads the payloads of the
// range it chose (the one payload read of a composition, in its synchronous
// span): the range, and the ledger and the lane as they stand at that instant.
function observeCompositions(f) {
  const {db} = f.leader;
  const prepare = db.prepare;
  const compositions = [];
  const isRangeRead = (options) => options.limit !== Number.MAX_SAFE_INTEGER &&
    options.ordinal !== Number.MAX_SAFE_INTEGER &&
    options.throughOrdinal !== Number.MAX_SAFE_INTEGER;
  db.prepare = function(sql) {
    const statement = prepare.call(this, sql);
    if (sql !== SQL.SELECT_OWED_AFTER) return statement;
    const all = statement.all;
    statement.all = function(options) {
      const rows = all.call(this, options);
      if (isRangeRead(options)) {
        const lane = f.leader.cdcDelivery.obligationLane;
        const cell = lane.currentObligation;
        compositions.push({
          range: rows.map((row) => row.event_key),
          owed: prepare.call(db, OWED_SNAPSHOT_SQL).all().map((row) => ({
            eventKey: row.event_key, logIndex: Number(row.log_index),
            ordinal: Number(row.ordinal), bytes: Number(row.bytes)})),
          retained: Number(prepare.call(db, RETAINED_SNAPSHOT_SQL).get().count),
          pending: new Set(lane.pending.keys()),
          hydratedThrough: lane.hydratedThroughLogIndex || 0,
          cursor: lane.scan?.cursor ? {...lane.scan.cursor} : null,
          window: lane.shipWindow,
          pinnedRows: cell !== null && cdcProgressHoldsCoverage(cell) ? cell.rows : null,
        });
      }
      return rows;
    };
    return statement;
  };
  return {compositions, restore: () => {
    db.prepare = prepare;
  }};
}

// The unit rule, for one composition, from the ledger and the lane as they
// stood: the reference of the property.
function assertComposition(composition, where, seenPerOrdinal) {
  const {owed, range, pending, window} = composition;
  const ready = (row) => !pending.has(row.eventKey) && row.logIndex > composition.hydratedThrough;
  const owedBytesOf = new Map();
  for (const row of owed) {
    owedBytesOf.set(row.logIndex, (owedBytesOf.get(row.logIndex) ?? 0) + row.bytes);
  }
  const perOrdinal = (row) => owedBytesOf.get(row.logIndex) > BOUND.SHIP_MAX_BYTES;
  const at = owed.findIndex((row) => row.eventKey === range[0]);
  const rows = owed.slice(Math.max(at, 0), Math.max(at, 0) + range.length);
  assert.deepEqual(rows.map((row) => row.eventKey), range,
    `${where}: a range is consecutive owed rows, in ledger order`);
  assert.ok(rows.every(ready), `${where}: every row of a range is READY`);
  for (const row of owed.slice(0, at)) {
    assert.ok(!ready(row) || (composition.cursor !== null && !isBefore(composition.cursor, row)),
      `${where}: units are composed in ledger order: the range begins at the first READY ` +
      'row after the scan cursor');
  }
  const next = owed[at + rows.length];
  const sibling = next !== undefined && next.logIndex === rows.at(-1).logIndex && ready(next);
  if (rows.some(perOrdinal)) {
    assert.equal(rows.length, 1,
      `${where}: an entry above the byte bound ships one ordinal per vector`);
  } else {
    assert.equal(sibling, false,
      `${where}: no range holds a strict subset of a unit (a READY sibling of its last row ` +
      'was left behind)');
  }
  const bytes = rows.reduce((sum, row) => sum + row.bytes, 0);
  const entries = new Set(rows.map((row) => row.logIndex)).size;
  assert.ok(bytes <= BOUND.SHIP_MAX_BYTES + Math.max(...rows.map((row) => row.bytes)),
    `${where}: a vector never exceeds the byte bound plus one ordinal (${bytes})`);
  if (entries > 1) {
    assert.ok(bytes <= BOUND.SHIP_MAX_BYTES,
      `${where}: a range of several units holds at most the byte bound (${bytes})`);
    assert.ok(rows.length <= window,
      `${where}: a range of several units holds at most the window (${rows.length} > ${window})`);
  }
  rows.forEach((row, taken) => {
    if (taken === 0 || row.logIndex === rows[taken - 1].logIndex) return;
    assert.ok(pending.size + taken + composition.retained < BOUND.RETAINED_DELIVERED_MAX,
      `${where}: the retained-delivered bound is asked where a unit begins`);
  });
  noteExercised(composition, {rows, bytes, entries, next, sibling, perOrdinal, ready,
    seenPerOrdinal});
}

// What one composition exercised (see `exercised`).
function noteExercised(composition, facts) {
  exercised.compositions += 1;
  noteRangeShape(composition, facts);
  noteHeldBackEntry(composition, facts);
}

function noteRangeShape(composition, {rows, entries, sibling, perOrdinal, seenPerOrdinal}) {
  if (composition.pinnedRows === rows.length) exercised.pinnedPresentedAgain += 1;
  if (entries === 1 && rows.length > composition.window) exercised.entryWiderThanWindow += 1;
  if (perOrdinal(rows[0])) {
    seenPerOrdinal.add(rows[0].logIndex);
    if (sibling) exercised.ordinalShippedAlone += 1;
  } else if (seenPerOrdinal.has(rows[0].logIndex) && rows.length > 1) {
    exercised.becameWhole += 1;
  }
}

// The unit after the range, when it is a whole entry of several READY
// ordinals that the range left behind; null otherwise.
function heldBackEntryOf(composition, {rows, next, perOrdinal, ready}) {
  if (next === undefined || !ready(next) || perOrdinal(next) || perOrdinal(rows[0])) return null;
  if (next.logIndex === rows.at(-1).logIndex) return null;
  const unit = composition.owed.filter((row) => row.logIndex === next.logIndex && ready(row));
  return unit.length < 2 ? null : unit;
}

// Which bound held a whole entry back that is not first in its range.
function noteHeldBackEntry(composition, facts) {
  const unit = heldBackEntryOf(composition, facts);
  if (unit === null) return;
  const {rows, bytes} = facts;
  if (composition.pending.size + rows.length + composition.retained >=
      BOUND.RETAINED_DELIVERED_MAX) {
    exercised.retainedHeldEntryBack += 1;
  } else if (bytes + unit.reduce((sum, row) => sum + row.bytes, 0) > BOUND.SHIP_MAX_BYTES) {
    exercised.bytesHeldEntryBack += 1;
  } else if (rows.length + unit.length > composition.window) {
    exercised.windowHeldEntryBack += 1;
  }
}

// The raw ledger by entry: {entries: log index -> {rows, bytes}, rowOf}.
function ledgerEntriesOf(model) {
  const entries = new Map();
  for (const row of model.raw) {
    const entry = entries.get(row.logIndex) ?? {rows: [], bytes: 0};
    entry.rows.push(row);
    entry.bytes += Buffer.byteLength(row.eventJson);
    entries.set(row.logIndex, entry);
  }
  return {entries, rowOf: new Map(model.raw.map((row) => [row.eventKey, row]))};
}

// Above the bound to its last ordinal (its last two ordinals exceed it): the
// entry never becomes one unit.
function alwaysPerOrdinal(entry) {
  return entry.rows.length > 1 && entry.rows.slice(-2).reduce((sum, row) =>
    sum + Buffer.byteLength(row.eventJson), 0) > BOUND.SHIP_MAX_BYTES;
}

// Of each entry one committed command touches: the last ordinal it carries
// and how many.
function entriesCarriedBy(command, rowOf) {
  const carried = new Map();
  for (const member of command.members) {
    const row = rowOf.get(member.eventKey);
    carried.set(row.logIndex,
      {ordinal: row.ordinal, rows: (carried.get(row.logIndex)?.rows ?? 0) + 1});
  }
  return carried;
}

// One leaf's committed command log against the unit rule: two ordinals of an
// entry that is above the bound to its last ordinal never share a vector
// (its last owed ordinal alone is an ordinary unit and may have company of
// other entries; every composition is held to the exact rule by the
// reference), and (within the family's scope) the leaf is never left at an
// earlier ordinal of an entry than one it holds.
function assertLeafLog(log, ledger, family, where) {
  const held = new Map();
  const sequences = new Map();
  for (const command of log) {
    for (const [logIndex, {ordinal, rows}] of entriesCarriedBy(command, ledger.rowOf)) {
      const entry = ledger.entries.get(logIndex);
      if (alwaysPerOrdinal(entry)) {
        assert.equal(rows, 1,
          `${where}: two ordinals of an entry above the byte bound never share a vector`);
        const sequence = sequences.get(logIndex) ?? [];
        if (sequence.at(-1) !== ordinal) sequence.push(ordinal);
        sequences.set(logIndex, sequence);
      }
      const before = held.get(logIndex) ?? -1;
      if (family.held === HELD_SCOPE.EVERY_ENTRY || entry.bytes <= BOUND.SHIP_MAX_BYTES) {
        assert.ok(ordinal >= before,
          `${where}: a recipient that holds ordinal ${before} of entry ${logIndex} is ` +
          `never left at an earlier one (${ordinal})`);
      }
      held.set(logIndex, Math.max(ordinal, before));
    }
  }
  return sequences;
}

// The recipients' side of the property, from each leaf's committed command
// log and the raw ledger.
function assertRecipientUnits(model, family, label) {
  const ledger = ledgerEntriesOf(model);
  model.logs.forEach((log, leaf) => {
    const sequences = assertLeafLog(log, ledger, family, `${label}: leaf ${leaf}`);
    if (!family.perOrdinalSequence) return;
    for (const [logIndex, sequence] of sequences) {
      assert.deepEqual(sequence, ledger.entries.get(logIndex).rows.map((row) => row.ordinal),
        `${label}: leaf ${leaf}: the delivery sequence of oversized entry ${logIndex} is the ` +
        'per-ordinal reference: every ordinal alone, in ordinal order');
    }
  });
}

async function startNewTenure(f) {
  f.ready = false;
  f.leader.controllablePort.setRole(RAFT_ROLE.FOLLOWER);
  f.leader.controllablePort.setRole(RAFT_ROLE.LEADER);
  await settleTicks();
  f.ready = true;
}

async function runCase(t, family, seed) {
  const plan = planOf(seed, family);
  const label = `seed ${seed} (${family.name})`;
  const f = await fixture(t, {rows: [], subscribers: plan.leaves,
    populate: (leader) => plan.entries.reduce((owed, entry) =>
      owed + commitEntry(leader, entry), 0)});
  const observed = observeCompositions(f);
  t.after(observed.restore);
  let image = family.hydration === true;
  const model = installRecipientModel(f, {onWave: (wave) => {
    if (!image || !wave.keys.includes(model.raw[plan.imageAt].eventKey)) return;
    image = false;
    model.hydratedThrough(model.raw[plan.imageThrough].logIndex);
  }});
  assert.equal(model.raw.length, plan.rows, label);
  for (const row of model.raw) {
    if (plan.random() >= FAULTED_ROW_SHARE) continue;
    model.faults.set(row.eventKey, new Map([[below(plan.random, plan.leaves),
      Array.from({length: 1 + below(plan.random, 2)}, () => pick(plan.random, family.faults))]]));
  }
  // Acknowledgements committed between compositions: while a vector is with a
  // recipient, the CDC_DELIVERED of the ranges before it commit.
  const answer = f.propagate;
  f.propagate = async (index, events, context, groupId) => {
    if (plan.random() < plan.commitShare) {
      const before = countCdcObligations(f.leader.db).delivered;
      await commitOpenAcknowledgements(f);
      if (countCdcObligations(f.leader.db).delivered > before) {
        exercised.acknowledgedBetweenCompositions += 1;
      }
    }
    return answer(index, events, context, groupId);
  };
  primeShipWindow(f, plan.window);
  let release = plan.retainedShort === null ? null :
    holdOutstandingAcknowledgements(laneOf(f), plan.retainedShort);
  await runLaneToQuiescence(f, {label, maxRounds: 2000, eachRound: async (round) => {
    if (round === plan.restartAtRound) await startNewTenure(f);
    if (release !== null && countCdcObligations(f.leader.db).owed === 0) {
      release();
      release = null;
    }
  }});
  // What the recipients were handed, then every composition against the
  // reference, then the model's general claims.
  assertRecipientUnits(model, family, label);
  const seenPerOrdinal = new Set();
  observed.compositions.forEach((composition, index) =>
    assertComposition(composition, `${label}: composition ${index}`, seenPerOrdinal));
  assertRecipientLogs(model, {label, ordered: family.ordered});
  assert.deepEqual(countCdcObligations(f.leader.db), {owed: 0, delivered: plan.rows}, label);
}

for (const family of Object.values(FAMILY)) {
  for (const seed of family.seeds) {
    test(`unit property, ${family.name}, seed ${seed}: no composed range holds a strict ` +
      'subset of a unit, units are composed in ledger order, an oversized entry ships per ' +
      'ordinal, and no vector exceeds the byte bound plus one ordinal', async (t) => {
      await runCase(t, family, seed);
    });
  }
}

test('unit property: the generated cases exercised every cut reason against a whole entry ' +
  'that is not first in its range, the oversized entry, re-presentation and ' +
  'acknowledgements between compositions', (t) => {
  t.diagnostic(`exercised: ${JSON.stringify(exercised)}`);
  for (const [kind, count] of Object.entries(exercised)) {
    assert.ok(count > 0, `the generated cases never exercised: ${kind} ` +
      `(${JSON.stringify(exercised)})`);
  }
});
