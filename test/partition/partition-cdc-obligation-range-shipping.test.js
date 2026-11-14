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
import {TABLE, addSourceRow, fixture} from '../test-helpers/partition-cdc-lane-fixture.js';

const SHAPE = Object.freeze({VECTOR: 'vector', SINGLE_EVENT: 'single-event'});
const RECEIPT_TERM = 2;
const ACK_COMMIT_ROUNDS = 32;
const MAX_DRIVES = 16;
const LARGE_ROW_BYTES = 2 * 1024 * 1024;

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
  await driveAndCommitUntilDrained(f);
  const bound = Math.ceil(rows.length / BOUND.ACK_BATCH_MAX_EVENTS);
  assert.ok(f.vectors.length <= bound,
    `subscriber calls to drain ${rows.length} owed rows: ${f.vectors.length} (bound ${bound})`);
  assert.deepEqual(shapesOf(f.vectors), [SHAPE.VECTOR]);
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
  const second = [];
  f.ready = false;
  const subscriber = acknowledgingCdcSubscriber({canAcceptCDCEvent: () => f.ready,
    onEvent: (delivered) => second.push(observe(1, delivered))});
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
