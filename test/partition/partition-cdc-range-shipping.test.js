// Stage 1 of the CDC delivery repair (range shipping; design note
// solve/epics/operation-integrity-and-reliable-formation/
// cdc-delivery-design-note-2026-11-11.md, section 4): one drive ships the owed
// rows after the scan cursor as one bounded vector per wave. Deterministic
// source-lane witnesses on the real application, ledger, subscription and
// acknowledgement owners with controlled recipient answers, on virtual time.
// They prove the bounded repair of the lane only: not head-of-line isolation
// between recipients (Stage 2) and not a recipient's start position (Stage 3).
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {unknownCdcAcceptance} from '../../src/cdc/cdc-delivery-outcome.js';
import {PARTITION_CDC_OBLIGATION_BOUND as BOUND,
  PARTITION_CDC_OBLIGATION_DRIVE_STATE as DRIVE} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {addToBatch} from '../../src/partition/partition-cdc-obligation-lane.js';
import {countCdcObligations} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {clearFixtureSingletons, resetFixtureSingletons, settleTicks} from
  '../test-helpers/participant-transaction-fixture.js';
import {PAYLOAD_SENTINEL, addSourceRow, commitAcknowledgements, fixture, hydrateThroughRow,
  recipientAnswer} from '../test-helpers/cdc-delivery-progress-fixture.js';
import {RESPONSE, addTopologySourceRow, assertDebtWithoutAck, topologyProgressFixture} from
  '../test-helpers/cdc-topology-progress-fixture.js';
import {LATENCY_TOPOLOGY_MESSAGE_TYPE} from
  '../../src/topology/latency-topology-constants.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const HYDRATED_ROWS = 10;
const committedAnswers = (_index, events, _context, groupId) =>
  recipientAnswer(events, groupId, true);
const deliveredIds = (f, index = 0) => f.calls.filter((call) => call.index === index)
  .flatMap((call) => call.ids);

async function driveUntilDrained(f, maxDrives) {
  let outcome;
  for (let drives = 0; drives < maxDrives; drives += 1) {
    outcome = await f.drive();
    if (outcome.state === DRIVE.DRAINED) return outcome;
    assert.equal(outcome.state, DRIVE.PAGE_YIELDED);
    await commitAcknowledgements(f);
  }
  return outcome;
}

test('R1-1 drain cost: 600 owed rows behind a hydrated prefix drain in at most three ' +
  'subscriber calls, each row once, in log order', async (t) => {
  const rows = Array.from({length: 600}, (_unused, index) => `row-${index}`);
  const f = await fixture(t, {rows, subscribers: 1});
  f.behavior = committedAnswers;
  hydrateThroughRow(f, HYDRATED_ROWS);

  const outcome = await driveUntilDrained(f, rows.length);
  assert.equal(outcome.state, DRIVE.DRAINED);
  assert.ok(f.calls.length <= 3, `subscriber calls: ${f.calls.length}`);
  assert.deepEqual(deliveredIds(f), rows.slice(HYDRATED_ROWS),
    'every row above the hydration image delivered once, in log order');
  assert.equal(f.calls.every((call) => call.ids.length <= BOUND.SHIP_MAX_EVENTS), true);
  await commitAcknowledgements(f);
  assert.equal(countCdcObligations(f.leader.db).owed, 0,
    'the hydrated prefix and every shipped row are committed delivered');
});

test('R1-2 keep-up under load: with a wave that costs two row intervals the undelivered ' +
  'depth stays bounded for 120 virtual seconds', async (t) => {
  const WAVE_MS = 2000;
  const ROW_INTERVAL_MS = 1000;
  const RUN_MS = 120000;
  const seed = ['seed-0', 'seed-1', 'seed-2'];
  const f = await fixture(t, {rows: [...seed, 'live-0'], subscribers: 1});
  hydrateThroughRow(f, seed.length);
  const startedAt = f.clock.now();
  const live = ['live-0'];
  const depths = [];
  let delivered = 0;
  // One row commits per ROW_INTERVAL_MS of virtual time, while the run lasts.
  const commitDueRows = () => {
    const due = Math.floor(Math.min(f.clock.now() - startedAt, RUN_MS) / ROW_INTERVAL_MS);
    while (live.length <= due) {
      live.push(`live-${live.length}`);
      addSourceRow(f.leader, live.at(-1));
    }
  };
  f.behavior = (_index, events, _context, groupId) => {
    f.clock.elapseWithoutCallbacks(WAVE_MS);
    commitDueRows();
    delivered += events.length;
    depths.push(live.length - delivered);
    return recipientAnswer(events, groupId, true);
  };

  const outcome = await f.drive();
  assert.equal(outcome.state, DRIVE.DRAINED);
  assert.ok(f.clock.now() - startedAt >= RUN_MS, 'the model ran its 120 virtual seconds');
  const bound = 2 * WAVE_MS / ROW_INTERVAL_MS + 1;
  assert.ok(Math.max(...depths) <= bound,
    `undelivered depth after a wave reached ${Math.max(...depths)}, bound ${bound}`);
  assert.deepEqual(deliveredIds(f), live, 'each committed row delivered once, in log order');
  await commitAcknowledgements(f);
  assert.equal(countCdcObligations(f.leader.db).owed, 0);
});

// The real CDCGroupPropagationService between the lane and two leaves: the
// source group (leaf A) and one target group (leaf B), with a second
// subscriber that commits at once.
test('R1-3 partial coverage keeps the vector: the covered leaf receives one delivery, the ' +
  'retried leaf the identical vector, and nothing is acknowledged before its receipt',
async (t) => {
  const f = await topologyProgressFixture(t);
  f.ready = false;
  for (const id of ['B', 'C', 'D', 'E']) addTopologySourceRow(f, id);
  await settleTicks();
  f.ready = true;
  f.targetMode = RESPONSE.UNKNOWN;

  assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
  assert.equal(f.sourceCalls.length, 1, 'leaf A (the source group) applied the vector once');
  assert.equal(f.sourceCalls[0].length, 5, 'one vector of the five owed rows');
  assert.equal(f.targetCalls.length, 1);
  assertDebtWithoutAck(f, 5);

  f.targetMode = RESPONSE.NATIVE;
  assert.equal((await f.drive()).state, DRIVE.DRAINED);
  assert.equal(f.sourceCalls.length, 1, 'the covered leaf A received exactly one delivery');
  assert.equal(f.targetCalls.length, 2);
  assert.equal(f.targetCalls[0].digest, f.targetCalls[1].digest,
    'leaf B was presented the identical vector twice');
  assert.equal(f.targetCalls[1].digest, f.sourceDigests[0]);
  assert.deepEqual(f.targetCalls[1].eventKeys, f.sourceCalls[0]);
  assert.equal(f.targetCalls[1].type, LATENCY_TOPOLOGY_MESSAGE_TYPE.CDC_PROPAGATION_BATCH);
  assert.equal(f.leader.cdcDelivery.getCdcObligationDiagnostics().pendingAcknowledgements, 5,
    'the five rows are acknowledged together, after leaf B\'s committed receipt');
  assert.deepEqual(countCdcObligations(f.leader.db), {owed: 5, delivered: 0},
    'and are delivered only by the committed CDC_DELIVERED');
});

test('R1-5 oversized row: a row above the shipping byte bound ships alone, is acknowledged, ' +
  'and nothing is refused', async (t) => {
  const oversized = PAYLOAD_SENTINEL.repeat(
    Math.ceil(2 * BOUND.SHIP_MAX_BYTES / PAYLOAD_SENTINEL.length));
  assert.ok(Buffer.byteLength(oversized) > BOUND.SHIP_MAX_BYTES);
  const f = await fixture(t, {rows: ['hydrated', 'before', {id: 'oversized', value: oversized},
    'after-1', 'after-2'], subscribers: 1});
  f.behavior = committedAnswers;
  hydrateThroughRow(f, 1);

  const outcome = await f.drive();
  assert.equal(outcome.state, DRIVE.DRAINED);
  assert.deepEqual(f.calls.map((call) => call.ids),
    [['before'], ['oversized'], ['after-1', 'after-2']],
    'the byte bound schedules; it never refuses and never reorders');
  assert.equal(outcome.delivered, 4);
  assert.equal(outcome.unacknowledged, 0);
  await commitAcknowledgements(f);
  assert.equal(countCdcObligations(f.leader.db).owed, 0);
});

// Stage 2 (recipient isolation) retired the pinned vector cell of Stage 1:
// coverage is now each recipient's own cursor, so a recipient that committed
// a vector is never sent it again, and the retry of a recipient that refused
// ships everything owed after its cursor by then (no digest is pinned).
test('after a refusal the recipient that committed is not sent the vector again, and the ' +
  'refused recipient\'s retry ships everything owed by then, behind a hydrated prefix',
async (t) => {
  const f = await fixture(t, {rows: ['h-1', 'h-2', 'v-1', 'v-2', 'v-3'], subscribers: 2});
  let answerSecond = false;
  f.behavior = (index, events, _context, groupId) => index === 1 && !answerSecond ?
    unknownCdcAcceptance() : recipientAnswer(events, groupId, true);
  const appliedIndex = hydrateThroughRow(f, 2);

  assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
  assert.deepEqual(f.calls.map((call) => [call.index, call.ids]).sort(),
    [[0, ['v-1', 'v-2', 'v-3']], [1, ['v-1', 'v-2', 'v-3']]]);
  const diagnostics = f.leader.cdcDelivery.getCdcObligationDiagnostics();
  assert.equal(JSON.stringify(diagnostics).includes(PAYLOAD_SENTINEL), false,
    'recipient state holds positions and digests, never an event body');
  assert.equal(diagnostics.pendingAcknowledgements, 2,
    'only the hydrated prefix is acknowledged; no shipped row before every receipt');

  f.ready = false;
  addSourceRow(f.leader, 'later-1');
  addSourceRow(f.leader, 'later-2');
  await settleTicks();
  f.leader.cdcDelivery.acknowledgeHydratedObligationsThrough(appliedIndex);
  f.ready = true;
  answerSecond = true;

  assert.equal((await f.drive()).state, DRIVE.DRAINED);
  const first = f.calls.filter((call) => call.index === 0);
  const second = f.calls.filter((call) => call.index === 1);
  assert.deepEqual(first.map((call) => call.ids), [['v-1', 'v-2', 'v-3'], ['later-1', 'later-2']],
    'the recipient that committed is not sent the vector again');
  assert.deepEqual(second.map((call) => call.ids),
    [['v-1', 'v-2', 'v-3'], ['v-1', 'v-2', 'v-3', 'later-1', 'later-2']],
    'the refused recipient is shipped everything owed after its cursor, in order');
  await commitAcknowledgements(f);
  assert.equal(countCdcObligations(f.leader.db).owed, 0);
});

// Acknowledgement is taken at the frontier (the lowest recipient cursor). A
// row the acknowledgement batch cannot take (here: its capacity is spent
// synthetically from the recipient callback, as a hydration acknowledgement
// racing the delivery would) stays owed and unpending, the drive outcome
// counts it, and it is acknowledged later without being shipped again: the
// recipient's cursor already covers it.
test('an acknowledgement the batch bounds hold back is counted in the drive outcome and ' +
  'taken later without a second delivery', async (t) => {
  const f = await fixture(t, {rows: ['r-1', 'r-2', 'r-3'], subscribers: 1});
  const lane = () => f.leader.cdcDelivery.obligationLane;
  let spendCapacity = true;
  f.behavior = (_index, events, _context, groupId) => {
    if (spendCapacity) {
      spendCapacity = false;
      for (let index = 0; index < BOUND.ACK_BATCH_MAX_EVENTS - 1; index += 1) {
        addToBatch(lane(), {eventKey: `synthetic-${index}`, logIndex: 1_000_000, ordinal: index});
      }
      for (let slot = 0; slot < BOUND.ACK_MAX_OUTSTANDING_BATCHES; slot += 1) {
        lane().commands.set(`synthetic-command-${slot}`,
          {command: {entryId: `synthetic-command-${slot}`}, members: [{eventKey: 'synthetic-0'}],
            groups: [], inFlight: true});
      }
    }
    return recipientAnswer(events, groupId, true);
  };

  const held = await f.drive();
  assert.deepEqual(f.calls.map((call) => call.ids), [['r-1', 'r-2', 'r-3']]);
  assert.equal(held.state, DRIVE.ACKNOWLEDGEMENT_BACKPRESSURE);
  assert.equal(held.delivered, 1, 'the batch took one row');
  assert.equal(held.unacknowledged, 2, 'two confirmed rows stay owed, unacknowledged');
  assert.equal(lane().pending.size, 1);
  assert.deepEqual(countCdcObligations(f.leader.db), {owed: 3, delivered: 0});

  lane().commands.clear();
  const retried = await f.drive();
  assert.equal(retried.unacknowledged, 0);
  assert.equal(retried.delivered, 2);
  assert.deepEqual(f.calls.map((call) => call.ids), [['r-1', 'r-2', 'r-3']],
    'the recipient confirmed them already: nothing is shipped again');
  assert.equal(lane().pending.size, 3);
});
