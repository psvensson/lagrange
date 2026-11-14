// Range-shipping reproducers of quest cdc-obligation-range-shipping (design
// note 2026-11-11 section 4.8, R1-1, R1-2, R1-3, R1-5; R1-4 is the wire-shape
// witness in test/topology/cdc-group-propagation-service.test.js) and the
// quest's open counterexamples. Owner path: PartitionCDCDelivery's obligation
// lane (driveCdcObligations) handing owed rows to its durable subscribers
// (buildPartitionCdcPropagationSubscriber and a second, non-propagation
// acknowledging subscriber), acknowledged by committed CDC_DELIVERED. The
// recipient answers are the CDC outcome owner's receipts, controlled here: an
// evidence ceiling of the source owner, never of a native recipient commit.
//
// Written against the range-shipping contract: a durable subscriber is handed
// (events, deliveryContext) with events a dense vector in (log_index, ordinal)
// order. The recorder notes which shape it was handed so the original lane,
// which hands one event, is observed rather than crashed.
//
// Record S-1 (2026-11-14) superseded the sealed wave bound: the lane ships under
// a shipping window that starts at one entry and doubles after each committed
// range it cut. The reproducers whose property is stated for a steady lane
// (one wave carries the whole owed run) therefore make the window their stated
// precondition (primeShipWindow); R1-1 keeps its steady bound and gains the
// cold-start bound of S-1; the window's own dynamics are proved from a cold
// start in partition-cdc-obligation-ship-window.test.js.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {buildCommittedCdcOutcome, cdcCommitWaitIdentity, unknownCdcAcceptance} from
  '../../src/cdc/cdc-delivery-outcome.js';
import {PARTITION_CDC_OBLIGATION_BOUND as BOUND,
  PARTITION_CDC_OBLIGATION_DRIVE_STATE as DRIVE,
  PARTITION_CDC_OBLIGATION_FLUSH_STATE as FLUSH,
  PARTITION_CDC_OBLIGATION_REASON as REASON} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {countCdcObligations, readOwedCdcObligations} from
  '../../src/partition/partition-cdc-obligation-ledger.js';
import {applyCommitted, clearFixtureSingletons, resetFixtureSingletons, settleTicks, track} from
  '../test-helpers/participant-transaction-fixture.js';
import {acknowledgingCdcSubscriber} from '../test-helpers/acknowledging-cdc-subscriber.js';
import {PAYLOAD_SENTINEL, TABLE, addSourceEntry, addSourceRow, currentLaneOf as laneOf,
  fixture, insertOperation, primeShipWindow, shipWindowOf} from
  '../test-helpers/partition-cdc-lane-fixture.js';
import {RECIPIENT_FAULT, assertRecipientLogs, installRecipientModel, runLaneToQuiescence} from
  '../test-helpers/partition-cdc-range-recipient-model.js';
import {PARTITION_CDC_OBLIGATION_SQL as SQL} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {PARTITION_SERVICE_EVENT} from '../../src/partition/partition-service-constants.js';
import {CDC_PIPELINE_METRIC} from '../../src/constants/cdc-lifecycle-constants.js';

const SHAPE = Object.freeze({VECTOR: 'vector', SINGLE_EVENT: 'single-event'});
const RECEIPT_TERM = 2;
const ACK_COMMIT_ROUNDS = 32;
const MAX_DRIVES = 16;
const LARGE_ROW_BYTES = 2 * 1024 * 1024;
// A window wide enough that it never cuts the small ledgers of the steady
// reproducers below.
const STEADY_WINDOW = BOUND.ACK_BATCH_MAX_EVENTS;

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const idsOf = (count, prefix) => Array.from({length: count}, (_unused, index) =>
  `${prefix}-${String(index).padStart(4, '0')}`);

// What one durable subscriber invocation was handed.
function received(delivered) {
  return Array.isArray(delivered) ? {shape: SHAPE.VECTOR, events: delivered} :
    {shape: SHAPE.SINGLE_EVENT, events: [delivered]};
}

function observe(index, delivered) {
  const {shape, events} = received(delivered);
  return {index, shape, keys: events.map((event) => event.eventKey),
    ids: events.map((event) => event.data.id), values: events.map((event) => event.data.value),
    positions: events.map((event) => [event.sourceLogIndex, event.sourceOrdinal]),
    digest: cdcCommitWaitIdentity(events)};
}

// Record every invocation of the fixture's propagation subscribers and answer
// through `answer(index, delivered)`: COMMITTED (the outcome owner's receipt
// over exactly what was handed) or another owner-built answer.
const COMMITTED = Symbol('committed');
function recordVectors(f, answer = () => COMMITTED) {
  f.vectors = [];
  let receipts = 0;
  f.propagate = (index, delivered, _context, groupId) => {
    f.vectors.push(observe(index, delivered));
    const chosen = answer(index, delivered);
    if (chosen !== COMMITTED) return chosen;
    receipts += 1;
    return buildCommittedCdcOutcome(received(delivered).events, groupId,
      {index: receipts, term: RECEIPT_TERM});
  };
  f.afterPropagation = (index, delivered) => f.hooks.push(observe(index, delivered));
  f.committedAcks = new Set();
}

const keysOf = (vectors) => vectors.flatMap((vector) => vector.keys);
const shapesOf = (vectors) => [...new Set(vectors.map((vector) => vector.shape))];
const ledgerOrder = (f) => readOwedCdcObligations(f.leader.db, {limit: Number.MAX_SAFE_INTEGER})
  .map((obligation) => obligation.eventKey);
const diagnostics = (f) => f.leader.cdcDelivery.getCdcObligationDiagnostics();

// Commit every CDC_DELIVERED the lane proposed, flushing its open batch, until
// nothing is open; each commit is applied through the real application owner.
async function commitAcknowledgements(f) {
  for (let round = 0; round < ACK_COMMIT_ROUNDS; round += 1) {
    const open = f.acks().filter((ack) => !f.committedAcks.has(ack.entryId));
    if (open.length === 0) {
      if (diagnostics(f).batchEvents === 0) return;
      track(f.leader.cdcDelivery.flushCdcAcknowledgements(REASON.FLUSH_DEADLINE));
    }
    for (const ack of open) {
      f.committedAcks.add(ack.entryId);
      assert.equal(applyCommitted(f.leader, ack), null, 'the CDC_DELIVERED applied');
    }
    await settleTicks();
  }
}

async function driveAndCommitUntilDrained(f) {
  const states = [];
  for (let drive = 0; drive < MAX_DRIVES; drive += 1) {
    states.push((await f.drive()).state);
    await commitAcknowledgements(f);
    if (countCdcObligations(f.leader.db).owed === 0 && !diagnostics(f).inFlight) break;
  }
  return states;
}

test('R1-1 driveCdcObligations ships 600 owed rows in at most ceil(600 / ' +
  'ACK_BATCH_MAX_EVENTS) subscriber calls, every row once in log order', async (t) => {
  const rows = idsOf(600, 'r11');
  const f = await fixture(t, {rows, subscribers: 1});
  const expected = ledgerOrder(f);
  recordVectors(f);
  primeShipWindow(f, STEADY_WINDOW);
  await driveAndCommitUntilDrained(f);
  const bound = Math.ceil(rows.length / BOUND.ACK_BATCH_MAX_EVENTS);
  assert.ok(f.vectors.length <= bound,
    `subscriber calls to drain ${rows.length} owed rows: ${f.vectors.length} (bound ${bound})`);
  assert.deepEqual(shapesOf(f.vectors), [SHAPE.VECTOR]);
  assert.deepEqual(keysOf(f.vectors), expected,
    'every owed row handed exactly once, in (log_index, ordinal) order');
  assert.deepEqual(countCdcObligations(f.leader.db), {owed: 0, delivered: rows.length});
});

// Record S-1: from a cold window (one entry) a backlog of B rows drains in at
// most ceil(B / bound) + log2(bound) waves; nothing is cut by bytes or holes here.
test('R1-1 from a cold shipping window 600 owed rows drain in at most ceil(600 / ' +
  'ACK_BATCH_MAX_EVENTS) + log2(ACK_BATCH_MAX_EVENTS) subscriber calls, every row once in ' +
  'log order', async (t) => {
  const rows = idsOf(600, 'r11c');
  const f = await fixture(t, {rows, subscribers: 1});
  const expected = ledgerOrder(f);
  recordVectors(f);
  await driveAndCommitUntilDrained(f);
  const bound = Math.ceil(rows.length / BOUND.ACK_BATCH_MAX_EVENTS) +
    Math.log2(BOUND.ACK_BATCH_MAX_EVENTS);
  assert.ok(f.vectors.length <= bound,
    `subscriber calls to drain ${rows.length} owed rows: ${f.vectors.length} (bound ${bound})`);
  assert.deepEqual(f.vectors.map((vector) => vector.keys.length),
    [1, 2, 4, 8, 16, 32, 64, 128, 256, 89],
    'the window doubles after every committed range it cut, up to the count bound');
  assert.deepEqual(keysOf(f.vectors), expected,
    'every owed row handed exactly once, in (log_index, ordinal) order');
  assert.deepEqual(countCdcObligations(f.leader.db), {owed: 0, delivered: rows.length});
});

test('R1-2 under virtual time, with each wave costing W = 2000 ms and one row committed ' +
  'per 1000 ms, owed depth after every wave stays within 2W/1000 + 1', async (t) => {
  const waveMs = 2000;
  const commitEveryMs = 1000;
  const runMs = 120000;
  const depthBound = (2 * waveMs) / commitEveryMs + 1;
  const f = await fixture(t, {rows: ['r12-seed'], subscribers: 1});
  recordVectors(f);
  const start = f.clock.now();
  const handed = new Set();
  const depths = [];
  let committed = 1;
  const committedPropagate = f.propagate;
  f.propagate = (index, delivered, context, groupId) => {
    for (const event of received(delivered).events) handed.add(event.eventKey);
    // The wave's cost advances the observed clock only; no timer fires.
    f.clock.elapseWithoutCallbacks(waveMs);
    const elapsed = f.clock.now() - start;
    while (elapsed <= runMs && committed - 1 < Math.floor(elapsed / commitEveryMs)) {
      addSourceRow(f.leader, `r12-${String(committed).padStart(4, '0')}`);
      committed += 1;
    }
    depths.push(committed - handed.size);
    return committedPropagate(index, delivered, context, groupId);
  };
  const outcome = await f.drive();
  const worst = Math.max(...depths);
  assert.ok(worst <= depthBound,
    `owed depth after a wave: max ${worst} over ${depths.length} waves (bound ${depthBound}); ` +
    `depth by wave ${JSON.stringify(depths)}`);
  assert.equal(outcome.state, DRIVE.DRAINED);
  assert.deepEqual(shapesOf(f.vectors), [SHAPE.VECTOR]);
  assert.deepEqual(keysOf(f.vectors), ledgerOrder(f),
    'every committed row handed exactly once, in (log_index, ordinal) order');
});

test('R1-3 a partially covered vector is presented again unchanged, the covered leaf is not ' +
  'handed it again, and no CDC_DELIVERED precedes the last receipt', async (t) => {
  const f = await fixture(t, {rows: ['A', 'B', 'C'], subscribers: 2});
  const expected = ledgerOrder(f);
  let unknownAnswered = false;
  primeShipWindow(f, STEADY_WINDOW);
  recordVectors(f, (index) => {
    if (index !== 1 || unknownAnswered) return COMMITTED;
    unknownAnswered = true;
    return unknownCdcAcceptance();
  });
  assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
  assert.equal(diagnostics(f).pendingAcknowledgements, 0);
  assert.equal(diagnostics(f).batchEvents, 0);
  assert.equal((await f.leader.cdcDelivery.flushCdcAcknowledgements(REASON.FLUSH_DEADLINE))
    .state, FLUSH.EMPTY, 'nothing is acknowledgeable before every leaf answered committed');
  assert.equal(f.acks().length, 0);
  assert.deepEqual(countCdcObligations(f.leader.db), {owed: 3, delivered: 0});

  await f.drive();
  const leafA = f.vectors.filter((vector) => vector.index === 0);
  const leafB = f.vectors.filter((vector) => vector.index === 1);
  assert.equal(leafA.length, 1, `deliveries to the covered leaf A: ${leafA.length}`);
  assert.equal(leafB.length, 2, `deliveries to leaf B: ${leafB.length}`);
  assert.deepEqual(leafA[0].keys, expected, 'leaf A was handed the whole owed range');
  assert.equal(leafB[0].digest, leafB[1].digest, 'the retry presents the same vector');
  assert.equal(leafB[0].digest, leafA[0].digest);
  await commitAcknowledgements(f);
  assert.deepEqual(countCdcObligations(f.leader.db), {owed: 0, delivered: 3});
});

test('R1-5 guard: a 2 MiB row among small rows is handed whole and acknowledged; nothing is ' +
  'refused, split or dropped', async (t) => {
  const f = await fixture(t, {rows: ['s1', 's2'], subscribers: 1, statements: [
    {entryId: 'progress-large', sql: `INSERT INTO ${TABLE} (id, value) VALUES (?, ?)`,
      params: ['large', 'x'.repeat(LARGE_ROW_BYTES)]},
    {entryId: 'progress-s3', sql: `INSERT INTO ${TABLE} (id, value) VALUES (?, ?)`,
      params: ['s3', 'small']},
  ]});
  const expected = ledgerOrder(f);
  recordVectors(f);
  await driveAndCommitUntilDrained(f);
  assert.deepEqual(keysOf(f.vectors), expected);
  const large = f.vectors.flatMap((vector) => vector.values)
    .filter((value) => value.length === LARGE_ROW_BYTES);
  assert.equal(large.length, 1, 'the large row reached the subscriber whole, once');
  assert.deepEqual(countCdcObligations(f.leader.db), {owed: 0, delivered: 4});
});

test('R1-5 a row above the shipping byte bound ships alone between vectors and is ' +
  'acknowledged', async (t) => {
  const byteBound = BOUND.SHIP_MAX_BYTES;
  assert.ok(Number.isSafeInteger(byteBound) && byteBound > 0,
    `the lane names its shipping byte bound: PARTITION_CDC_OBLIGATION_BOUND.SHIP_MAX_BYTES = ${
      byteBound}`);
  const insert = (id, value) => ({entryId: `progress-${id}`,
    sql: `INSERT INTO ${TABLE} (id, value) VALUES (?, ?)`, params: [id, value]});
  const f = await fixture(t, {rows: ['s1', 's2'], subscribers: 1, statements: [
    insert('over', 'x'.repeat(byteBound)), insert('s3', 'small'), insert('s4', 'small')]});
  const expected = ledgerOrder(f);
  recordVectors(f);
  primeShipWindow(f, STEADY_WINDOW);
  await driveAndCommitUntilDrained(f);
  assert.deepEqual(f.vectors.map((vector) => vector.ids), [['s1', 's2'], ['over'], ['s3', 's4']]);
  assert.deepEqual(keysOf(f.vectors), expected);
  assert.deepEqual(countCdcObligations(f.leader.db), {owed: 0, delivered: 5});
});

test('counterexample: several versions of one key in one vector keep their order, values and ' +
  'distinct occurrence identities', async (t) => {
  const statement = (entryId, sql, params, wallMs) => ({entryId, sql, params, wallMs});
  const update = `UPDATE ${TABLE} SET value = ? WHERE id = ?`;
  const f = await fixture(t, {rows: [], subscribers: 1, statements: [
    statement('k-insert', `INSERT INTO ${TABLE} (id, value) VALUES (?, ?)`, ['K', 'v1'], 1000),
    statement('k-update-2', update, ['v2', 'K'], 1001),
    statement('k-update-3', update, ['v3', 'K'], 1002),
    statement('other-insert', `INSERT INTO ${TABLE} (id, value) VALUES (?, ?)`,
      ['other', 'o1'], 1003),
  ]});
  const expected = ledgerOrder(f);
  recordVectors(f);
  primeShipWindow(f, STEADY_WINDOW);
  await driveAndCommitUntilDrained(f);
  assert.equal(f.vectors.length, 1, `subscriber calls: ${f.vectors.length}`);
  assert.deepEqual(f.vectors[0].keys, expected);
  assert.deepEqual(f.vectors[0].ids, ['K', 'K', 'K', 'other']);
  assert.deepEqual(f.vectors[0].values, ['v1', 'v2', 'v3', 'o1']);
  assert.equal(new Set(f.vectors[0].keys).size, 4, 'no occurrence is merged');
  assert.deepEqual(countCdcObligations(f.leader.db), {owed: 0, delivered: 4});
});

test('counterexample: a hydrated prefix is acknowledged without delivery and the rest ships ' +
  'as one vector', async (t) => {
  const rows = idsOf(10, 'hydrated');
  const f = await fixture(t, {rows, subscribers: 1});
  const owed = readOwedCdcObligations(f.leader.db, {limit: Number.MAX_SAFE_INTEGER});
  recordVectors(f);
  primeShipWindow(f, STEADY_WINDOW);
  const through = owed[4].logIndex;
  assert.equal(f.leader.cdcDelivery.acknowledgeHydratedObligationsThrough(through).acknowledged, 5);
  await driveAndCommitUntilDrained(f);
  assert.equal(f.vectors.length, 1, `subscriber calls: ${f.vectors.length}`);
  assert.deepEqual(f.vectors[0].keys, owed.slice(5).map((obligation) => obligation.eventKey),
    'only rows above the hydrated applied index are handed, in order');
  assert.deepEqual(countCdcObligations(f.leader.db), {owed: 0, delivered: rows.length});
});

test('counterexample: acknowledgement backpressure on the first row ends the pass without ' +
  'handing it to a subscriber', async (t) => {
  const full = BOUND.ACK_MAX_OUTSTANDING_BATCHES * BOUND.ACK_BATCH_MAX_EVENTS;
  const rows = idsOf(full + 3, 'backpressure');
  const f = await fixture(t, {rows, subscribers: 1});
  const expected = ledgerOrder(f);
  recordVectors(f);
  primeShipWindow(f, STEADY_WINDOW);
  let state = null;
  for (let drive = 0; drive < MAX_DRIVES && state !== DRIVE.ACKNOWLEDGEMENT_BACKPRESSURE;
    drive += 1) {
    const before = f.vectors.length;
    state = (await f.drive()).state;
    if (state === DRIVE.ACKNOWLEDGEMENT_BACKPRESSURE) {
      assert.equal(f.vectors.length, before, 'the backpressured pass hands nothing');
    }
  }
  assert.equal(state, DRIVE.ACKNOWLEDGEMENT_BACKPRESSURE);
  assert.equal(diagnostics(f).outstandingAcknowledgementBatches,
    BOUND.ACK_MAX_OUTSTANDING_BATCHES);
  assert.ok(f.vectors.length <= BOUND.ACK_MAX_OUTSTANDING_BATCHES,
    `subscriber calls to fill ${BOUND.ACK_MAX_OUTSTANDING_BATCHES} outstanding batches: ${
      f.vectors.length}`);
  assert.deepEqual(keysOf(f.vectors), expected.slice(0, full),
    'rows past the backpressure point were not handed');
  const handedBeforeRelease = f.vectors.length;
  await driveAndCommitUntilDrained(f);
  assert.equal(f.vectors.length - handedBeforeRelease, 1,
    `subscriber calls for the 3 rows after release: ${f.vectors.length - handedBeforeRelease}`);
  assert.ok(f.vectors.length <= BOUND.ACK_MAX_OUTSTANDING_BATCHES + 1,
    `subscriber calls for ${rows.length} rows: ${f.vectors.length}`);
  assert.deepEqual(keysOf(f.vectors), expected);
  assert.deepEqual(countCdcObligations(f.leader.db), {owed: 0, delivered: rows.length});
});

test('counterexample: a second, non-propagation durable subscriber is handed the same vector ' +
  'and acknowledgement waits for both', async (t) => {
  const f = await fixture(t, {rows: ['A', 'B', 'C'], subscribers: 1});
  const expected = ledgerOrder(f);
  recordVectors(f);
  primeShipWindow(f, STEADY_WINDOW);
  const second = [];
  f.ready = false;
  const subscriber = acknowledgingCdcSubscriber({canAcceptCDCEvent: () => f.ready,
    onVector: (delivered) => second.push(observe(1, delivered))});
  await f.leader.subscribeToCDCWithHandshake(subscriber, {subscriberId: 'second-durable'});
  await settleTicks();
  f.ready = true;
  await driveAndCommitUntilDrained(f);
  assert.equal(second.length, 1,
    `invocations of the second durable subscriber: ${second.length} (${shapesOf(second)})`);
  assert.equal(second[0].shape, SHAPE.VECTOR);
  assert.deepEqual(second[0].keys, expected);
  assert.deepEqual(f.vectors.map((vector) => vector.digest), [second[0].digest],
    'both durable subscribers are handed one identical vector');
  assert.deepEqual(countCdcObligations(f.leader.db), {owed: 0, delivered: 3});
});

// --- the cut (record S-1, S-2, design decision 1), on the recipient model ---

const idsOfWaves = (model) => model.waves.map((wave) => wave.ids);
const rowsOfWaves = (model) => model.waves.map((wave) => wave.rows);

// The payload reads of the lane (the owed rows with event_json), by limit and
// row count; the positions-only pre-pass uses its own statement.
function observePayloadReads(f) {
  const {db} = f.leader;
  const prepare = db.prepare;
  const reads = [];
  db.prepare = function(sql) {
    const statement = prepare.call(this, sql);
    if (sql !== SQL.SELECT_OWED_AFTER) return statement;
    const all = statement.all;
    statement.all = function(options) {
      const result = all.call(this, options);
      reads.push({limit: options.limit, count: result.length,
        inTransaction: db.inTransaction});
      return result;
    };
    return statement;
  };
  return {reads, restore: () => {
    db.prepare = prepare;
  }};
}

test('the READY ordinals of one ledger entry are never cut apart: an entry ships whole at a ' +
  'window of one row, and a wider window cuts only at entry boundaries', async (t) => {
  const f = await fixture(t, {rows: [], subscribers: 1, populate: (leader) => {
    addSourceEntry(leader, 'entry-a', ['a0', 'a1', 'a2'].map((id) => insertOperation(id)));
    addSourceRow(leader, 'single-1');
    addSourceEntry(leader, 'entry-b', ['b0', 'b1', 'b2', 'b3'].map((id) => insertOperation(id)));
    addSourceRow(leader, 'single-2');
    return 9;
  }});
  const model = installRecipientModel(f);
  await runLaneToQuiescence(f);
  assert.deepEqual(idsOfWaves(model), [['a0', 'a1', 'a2'], ['single-1'],
    ['b0', 'b1', 'b2', 'b3'], ['single-2']]);
  assert.deepEqual(model.waves.map((wave) => wave.window), [1, 2, 4, 8],
    'an entry larger than the window still travels whole; the window alone held the next ' +
    'entry back each time, so it doubled');
  assertRecipientLogs(model);
  assert.deepEqual(countCdcObligations(f.leader.db), {owed: 0, delivered: 9});
});

test('an entry above the shipping byte bound ships alone and whole between ranges; nothing ' +
  'is refused, split or dropped', async (t) => {
  const third = 'x'.repeat(Math.ceil(BOUND.SHIP_MAX_BYTES / 3));
  const f = await fixture(t, {rows: ['s1', 's2'], subscribers: 1, populate: (leader) => {
    addSourceEntry(leader, 'big-entry',
      ['g0', 'g1', 'g2'].map((id) => insertOperation(id, third)));
    addSourceRow(leader, 's3');
    addSourceRow(leader, 's4');
    return 5;
  }});
  const model = installRecipientModel(f);
  primeShipWindow(f, STEADY_WINDOW);
  await runLaneToQuiescence(f);
  assert.deepEqual(idsOfWaves(model), [['s1', 's2'], ['g0', 'g1', 'g2'], ['s3', 's4']]);
  assert.equal(shipWindowOf(f), STEADY_WINDOW);
  assertRecipientLogs(model);
  assert.deepEqual(countCdcObligations(f.leader.db), {owed: 0, delivered: 7});
});

test('rows at or below the hydrated index that are not yet pending are acknowledged without ' +
  'delivery by the pre-pass, and the rows above it ship', async (t) => {
  const rows = idsOf(10, 'inside');
  const f = await fixture(t, {rows, subscribers: 1});
  const model = installRecipientModel(f);
  primeShipWindow(f, STEADY_WINDOW);
  // The image position falls inside the page, and the handshake's own drain has
  // not run for these rows: the lane meets them hydrated and not pending.
  const through = model.raw[3].logIndex;
  laneOf(f).hydratedThroughLogIndex = through;
  model.hydratedThroughLogIndex = through;
  assert.equal((await f.drive()).state, DRIVE.DRAINED);
  assert.deepEqual(idsOfWaves(model), [rows.slice(4)],
    'no row at or below the hydrated index reached a subscriber');
  assert.equal(diagnostics(f).pendingAcknowledgements, rows.length,
    'the hydrated rows were acknowledged by the pre-pass, the rest after their receipt');
  await runLaneToQuiescence(f);
  assert.equal(model.waves.length, 1);
  assert.deepEqual(model.acknowledged, model.raw.map((row) => row.eventKey),
    'every row was acknowledged, the hydrated ones without a receipt');
  assertRecipientLogs(model);
  assert.deepEqual(countCdcObligations(f.leader.db), {owed: 0, delivered: rows.length});
});

test('a row pending acknowledgement splits the run: the rows before it ship without the ' +
  'rows after it, and a hole never widens the window', async (t) => {
  const rows = idsOf(6, 'hole');
  const f = await fixture(t, {rows, subscribers: 1});
  const model = installRecipientModel(f);
  // The first row is answered provisional once: the scan passes it, the later
  // rows are delivered and wait for their CDC_DELIVERED (pending).
  model.faults.set(model.raw[0].eventKey, new Map([[0, [RECIPIENT_FAULT.PROVISIONAL]]]));
  assert.equal((await f.drive()).state, DRIVE.PROVISIONAL);
  assert.deepEqual(idsOfWaves(model), [[rows[0]], [rows[1]], rows.slice(2, 4), rows.slice(4)]);
  const windowBefore = shipWindowOf(f);
  assert.equal(windowBefore, 4);
  assert.equal(diagnostics(f).pendingAcknowledgements, 5);
  // The next pass starts at the first row again; the pending rows after it are a hole.
  assert.equal((await f.drive()).state, DRIVE.DRAINED);
  assert.deepEqual(idsOfWaves(model).slice(4), [[rows[0]]],
    'the run ends at the first pending row');
  assert.equal(shipWindowOf(f), windowBefore, 'a run ended by a hole is not window-cut');
  await runLaneToQuiescence(f);
  assertRecipientLogs(model, {ordered: false});
  assert.deepEqual(countCdcObligations(f.leader.db), {owed: 0, delivered: rows.length});
});

test('the retained-delivered bound counts the rows already taken into the range: a range ' +
  'stops where the per-row lane stopped', async (t) => {
  const rows = idsOf(10, 'retained');
  const f = await fixture(t, {rows, subscribers: 1});
  const model = installRecipientModel(f);
  primeShipWindow(f, STEADY_WINDOW);
  // Pending acknowledgements three short of the bound (the lane's own record of
  // delivered rows whose CDC_DELIVERED has not committed).
  const lane = laneOf(f);
  for (let index = 0; index < BOUND.RETAINED_DELIVERED_MAX - 3; index += 1) {
    lane.pending.set(`retained-witness-${index}`, {logIndex: 1, ordinal: index});
  }
  const outcome = await f.drive();
  assert.deepEqual(idsOfWaves(model), [rows.slice(0, 3)],
    'the lowest owed row and two more fit; the fourth would pass the bound');
  assert.equal(outcome.state, DRIVE.ACKNOWLEDGEMENT_BACKPRESSURE);
  assert.equal(outcome.delivered, 3);
  assert.equal(lane.pending.size, BOUND.RETAINED_DELIVERED_MAX,
    'the bound is reached, never passed');
  assert.equal(lane.scan, null, 'a scan stopped by the bound restarts from the lowest owed row');
  assert.equal(shipWindowOf(f), STEADY_WINDOW, 'a bound cut is not a window cut');
});

test('acknowledgement refused inside a covered range leaves the rows from the refused one ' +
  'owed, stops the cursor before it, says so in the drive outcome, and ships them again ' +
  'before any later row', async (t) => {
  const singles = idsOf(BOUND.ACK_BATCH_MAX_EVENTS + 200, 'single');
  const entry = idsOf(320, 'wide');
  const f = await fixture(t, {rows: singles, subscribers: 1});
  // While the wide range is in flight, a row after the one that will be
  // refused is marked pending by hand (the lane never produces this): the
  // cursor must still stop before the refused row.
  let pendingLater = null;
  const model = installRecipientModel(f, {onWave: (wave) => {
    if (wave.rows !== entry.length) return;
    laneOf(f).pending.set(pendingLater.eventKey,
      {logIndex: pendingLater.logIndex, ordinal: pendingLater.ordinal});
  }});
  primeShipWindow(f, STEADY_WINDOW);
  const emitted = [];
  f.leader.on(PARTITION_SERVICE_EVENT.CDC_EVENT, (event) => emitted.push(event.eventKey));
  const deliveredMetric = () =>
    f.leader.cdcPipelineMetrics.getSnapshot()[CDC_PIPELINE_METRIC.EVENTS_DELIVERED];
  // One full batch is proposed and stays outstanding; 200 more rows sit in the open batch.
  assert.equal((await f.drive()).state, DRIVE.PAGE_YIELDED);
  assert.equal((await f.drive()).state, DRIVE.DRAINED);
  assert.deepEqual(rowsOfWaves(model), [BOUND.ACK_BATCH_MAX_EVENTS, 200]);
  assert.equal(diagnostics(f).outstandingAcknowledgementBatches, 1);
  assert.equal(diagnostics(f).batchEvents, 200);
  // A committed entry of 320 events: one range, larger than one acknowledgement batch.
  f.ready = false;
  addSourceEntry(f.leader, 'wide-entry', entry.map((id) => insertOperation(id)));
  addSourceRow(f.leader, 'later-row');
  await settleTicks();
  model.noteLedger();
  f.ready = true;
  const metricBefore = deliveredMetric();
  emitted.length = 0;
  const wideRows = model.raw.filter((row) => row.eventKey.startsWith('txop:'));
  const wideKeys = wideRows.map((row) => row.eventKey);
  assert.equal(wideKeys.length, 320);
  pendingLater = wideRows[315];
  const outcome = await f.drive();
  assert.equal(laneOf(f).pending.delete(pendingLater.eventKey), true);
  assert.deepEqual(model.waves.at(-1).keys, wideKeys, 'the entry shipped whole, as one range');
  // 56 rows fill the open batch (it is proposed: two outstanding), 256 fill the
  // next one, which cannot be proposed; the 313th row is refused.
  assert.equal(outcome.state, DRIVE.ACKNOWLEDGEMENT_BACKPRESSURE);
  assert.equal(outcome.delivered, 312);
  assert.equal(outcome.unacknowledged, 8, 'the outcome counts the covered rows left owed');
  assert.deepEqual(laneOf(f).scan.cursor,
    {logIndex: model.raw.find((row) => row.eventKey === wideKeys[311]).logIndex, ordinal: 311},
    'the cursor stopped before the refused row');
  assert.deepEqual(emitted, wideKeys, 'every member of the covered range was emitted, in order');
  assert.equal(deliveredMetric() - metricBefore, 320);
  assert.equal(diagnostics(f).pendingAcknowledgements, singles.length + 312);
  assert.equal(diagnostics(f).outstandingAcknowledgementBatches,
    BOUND.ACK_MAX_OUTSTANDING_BATCHES);
  const wavesBefore = model.waves.length;
  await runLaneToQuiescence(f);
  assert.deepEqual(model.waves.slice(wavesBefore).map((wave) => wave.keys),
    [wideKeys.slice(312), [model.raw.at(-1).eventKey]],
    'the eight rows left owed ship again together, in order, ahead of the later row');
  assertRecipientLogs(model, {wholeEntries: false});
  assert.deepEqual(countCdcObligations(f.leader.db),
    {owed: 0, delivered: singles.length + 321});
});

test('the lane reads positions first and only the payloads of the range it ships; nothing ' +
  'of a range stays in the lane between attempts', async (t) => {
  const rows = idsOf(300, 'payload');
  const f = await fixture(t, {rows, subscribers: 2});
  const model = installRecipientModel(f);
  // The second leaf refuses the first range once: the lane keeps its cell.
  model.faults.set(model.raw[0].eventKey, new Map([[1, [RECIPIENT_FAULT.UNKNOWN]]]));
  primeShipWindow(f, 4);
  const observed = observePayloadReads(f);
  t.after(observed.restore);
  assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
  assert.deepEqual(observed.reads, [{limit: 4, count: 4, inTransaction: false}],
    'one payload read, of exactly the four rows of the range');
  const lane = laneOf(f);
  assert.ok(lane.currentObligation, 'the partially covered range keeps its cell');
  assert.deepEqual(Object.keys(lane.currentObligation).sort(),
    ['binding', 'branches', 'first', 'last', 'nextSubscriber', 'rows', 'windowCut']);
  const retained = JSON.stringify({cell: lane.currentObligation, scan: lane.scan,
    pending: [...lane.pending], batch: [...lane.batch.groups]});
  assert.equal(retained.includes(PAYLOAD_SENTINEL), false,
    'no payload is retained between attempts');
  observed.reads.length = 0;
  const wavesBefore = model.waves.length;
  await runLaneToQuiescence(f);
  assert.equal(observed.reads.every((read) => read.count === read.limit &&
    read.inTransaction === false), true);
  assert.deepEqual(observed.reads.map((read) => read.count),
    model.waves.slice(wavesBefore).filter((wave) => wave.index === 0).map((wave) => wave.rows),
    'one payload read per composed range, of exactly its rows');
  assert.equal(observed.reads.reduce((sum, read) => sum + read.count, 0), rows.length);
  assertRecipientLogs(model);
});

test('composition is fresh at every drive step: rows a hydration image covers while a ' +
  'range is in flight are not in the next range', async (t) => {
  const rows = idsOf(12, 'fresh');
  const f = await fixture(t, {rows, subscribers: 1});
  let hydrated = false;
  const model = installRecipientModel(f, {onWave: (wave) => {
    // While the second range (two rows) is in flight, an image covers the
    // next four rows.
    if (wave.rows !== 2 || hydrated) return;
    hydrated = true;
    model.hydratedThrough(model.raw[6].logIndex);
  }});
  await runLaneToQuiescence(f);
  assert.equal(hydrated, true);
  assert.deepEqual(idsOfWaves(model), [[rows[0]], rows.slice(1, 3), rows.slice(7, 9),
    rows.slice(9)], 'the range after the handshake starts above the image');
  assertRecipientLogs(model);
  assert.deepEqual(countCdcObligations(f.leader.db), {owed: 0, delivered: rows.length});
});

// The hydrated index is read at every step, not once per scan: here it moves
// while a range is in flight and the handshake's own drain has not run for
// the rows it comes to cover, so the lane meets them hydrated and not pending
// in the same scan.
test('composition reads the hydrated index at every drive step: rows it comes to cover ' +
  'while a range is in flight are acknowledged without delivery by the next step of the ' +
  'same scan', async (t) => {
  const rows = idsOf(12, 'moving');
  const f = await fixture(t, {rows, subscribers: 1});
  let moved = false;
  const model = installRecipientModel(f, {onWave: (wave) => {
    if (wave.rows !== 2 || moved) return;
    moved = true;
    const through = model.raw[6].logIndex;
    laneOf(f).hydratedThroughLogIndex = through;
    model.hydratedThroughLogIndex = through;
  }});
  const outcome = await f.drive();
  assert.equal(outcome.state, DRIVE.DRAINED, 'one drive shipped every range');
  assert.equal(moved, true);
  assert.deepEqual(idsOfWaves(model), [[rows[0]], rows.slice(1, 3), rows.slice(7, 11),
    [rows[11]]], 'the four rows the index came to cover were not shipped');
  assert.equal(diagnostics(f).pendingAcknowledgements, rows.length,
    'they were acknowledged by the pre-pass');
  await runLaneToQuiescence(f);
  assert.equal(model.waves.length, 4);
  assertRecipientLogs(model);
  assert.deepEqual(countCdcObligations(f.leader.db), {owed: 0, delivered: rows.length});
});
