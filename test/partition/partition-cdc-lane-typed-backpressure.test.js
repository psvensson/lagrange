// Witnesses of quest cdc-propagation-node-slot-removal at the source lane, after
// the model amendment of 2026-11-14: PartitionCDCDelivery's obligation lane
// (driveCdcObligations) of several partition leaders handing ranges through
// their propagation subscribers to the one real topology owner.
//
// - C-1, both directions: a wave whose every uncovered leaf was refused by
//   typed backpressure reaches the lane as backpressure (window unchanged,
//   the hint paces the retry); one genuinely failed leaf among them keeps it
//   unknown (window halves, the transient delay).
// - CR-1 at the lane: a leaf attempted with a genuine failure and refused by
//   typed backpressure in a later foreground attempt of the same wave was an
//   attempt (window halves, no longer vector follows it).
// - C-3: a covered source leaf pins the range (the identical vector is
//   presented again and the source is not applied again).
// - C-2: lanes beyond a router destination bound receive the router's typed
//   backpressure, not a wait behind another lane's wave.
// - A source-group leader change failing every wave at once: each lane keeps
//   its debt and retries by its own rule; the in-flight set returns to zero.
// - Two real lanes on two partitions of one table do not wait for each other.
//
// Real source ledger, subscription, acknowledgement and topology owners;
// recipient and transport answers are built by their owners and controlled
// (never a native commit). The router destination bound is the double's
// stated bound, answered with the transport owner's outbound-queue rejection.
// Virtual time only.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {TABLES} from '../../src/constants/index.js';
import {PARTITION_CDC_OBLIGATION_DRIVE_STATE as DRIVE,
  PARTITION_CDC_OBLIGATION_REASON as REASON} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {countCdcObligations} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {PARTITION_SERVICE_DEFAULT} from '../../src/partition/partition-service-constants.js';
import {LATENCY_PROPAGATION_MODE} from '../../src/topology/latency-topology-constants.js';
import {CDC_GROUP_PROPAGATION_RETRY} from
  '../../src/topology/cdc-group-propagation-constants.js';
import {LEAF, addRequiredGroup, multiLaneTopologyFixture} from
  '../test-helpers/cdc-topology-progress-fixture.js';
import {settleTicks, track} from '../test-helpers/participant-transaction-fixture.js';
import {setupConfig, teardownConfig} from '../topology/cdc-group-propagation-service-harness.js';

const HOLD = null;
const INITIAL_RETRY_MS = PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS;
const WINDOW = 4;
const SMALL_HINT_MS = 15;
const LARGE_HINT_MS = 35;
const DESTINATION_BOUND = 2;

beforeEach(() => setupConfig(LATENCY_PROPAGATION_MODE.SAFE));
afterEach(teardownConfig);

const idsOf = (calls) => calls.map((call) => call.ids);

function primeWindow(lane, rows) {
  lane.diagnostics();
  lane.leader.cdcDelivery.obligationLane.shipWindow = rows;
}

// The lane with no drive in flight: a wave's foreground retries take real
// time, so a drive started by a committed entry is awaited here.
async function idle(lane) {
  do await settleTicks(); while (lane.leader.cdcDelivery.obligationLane.inFlight);
}

function laneView(lane) {
  const {lastDrive, retryArmed, shipWindow} = lane.diagnostics();
  return {state: lastDrive?.state, retryDelayMs: lastDrive?.retryDelayMs, retryArmed,
    shipWindow};
}

async function twoTargetLane(t, rows) {
  const f = await multiLaneTopologyFixture(t, [{tableName: TABLES.SERVICES, rows}]);
  addRequiredGroup(f);
  const [lane] = f.lanes;
  primeWindow(lane, WINDOW);
  return {f, lane};
}

test('every uncovered target refused by typed backpressure reaches the lane as ' +
  'backpressure: the window is unchanged and the smallest hint paces the retry', async (t) => {
  const {f, lane} = await twoTargetLane(t, ['svc-1', 'svc-2']);
  let refusing = true;
  f.answer = (call) => refusing ?
    {leaf: call.targetGroupId === 'progress-group-c' ? LEAF.OUTBOUND_BACKPRESSURE :
      LEAF.BACKPRESSURE, hintMs: call.targetGroupId === 'progress-group-c' ?
      SMALL_HINT_MS : LARGE_HINT_MS} : LEAF.NATIVE;
  const held = await lane.drive();
  assert.equal(held.state, DRIVE.HELD_BY_SUBSCRIBER);
  assert.deepEqual(laneView(lane), {state: DRIVE.HELD_BY_SUBSCRIBER,
    retryDelayMs: SMALL_HINT_MS, retryArmed: true, shipWindow: WINDOW},
  'typed backpressure: the window is unchanged and the smallest hint is the delay');

  // C-3: the source leaf committed, so the identical range is presented again
  // even though a row was committed meanwhile, and the source is not applied
  // again.
  lane.addRow('svc-3');
  await idle(lane);
  refusing = false;
  f.clock.advance(SMALL_HINT_MS);
  await idle(lane);
  assert.deepEqual(idsOf(f.callsOf(lane)).slice(-4),
    [['svc-1', 'svc-2'], ['svc-1', 'svc-2'], ['svc-3'], ['svc-3']],
    'the retry presents the identical vector to both targets, then the later row');
  assert.deepEqual(f.sourceBatches[0], ['svc-1', 'svc-2']);
  assert.equal(f.sourceBatches.filter((batch) => batch.includes('svc-1')).length, 1,
    'the covered source is not applied again');
});

test('one genuinely failed target among backpressured ones keeps the answer unknown: the ' +
  'window halves and the transient delay applies', async (t) => {
  const {f, lane} = await twoTargetLane(t, ['svc-1', 'svc-2']);
  f.answer = (call) => call.targetGroupId === 'progress-group-c' ? LEAF.CONNECTION_CLOSED :
    {leaf: LEAF.BACKPRESSURE, hintMs: SMALL_HINT_MS};
  await lane.drive();
  assert.deepEqual(laneView(lane), {state: DRIVE.HELD_BY_SUBSCRIBER,
    retryDelayMs: INITIAL_RETRY_MS, retryArmed: true, shipWindow: WINDOW / 2});
});

// CR-1 at the lane: the first foreground attempt of the wave is sent and fails
// (an effect is possible), the later ones are refused by typed backpressure
// (the vector still in flight).
test('a wave whose leaves failed genuinely and were then refused by typed backpressure in ' +
  'its later attempts was an attempt: the window halves, the transient delay applies and no ' +
  'longer vector follows', async (t) => {
  const f = await multiLaneTopologyFixture(t,
    [{tableName: TABLES.SERVICES, rows: ['svc-1', 'svc-2']}]);
  const attempts = CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS;
  const [lane] = f.lanes;
  primeWindow(lane, 2 * WINDOW);
  let refusing = true;
  f.sourceAnswer = () => !refusing ? LEAF.NATIVE :
    f.sourceBatches.length === 1 ? LEAF.UNKNOWN : LEAF.BACKPRESSURE;
  f.answer = () => !refusing ? LEAF.NATIVE :
    f.router.calls.length === 1 ? LEAF.CONNECTION_CLOSED : LEAF.OUTBOUND_BACKPRESSURE;
  await lane.drive();
  assert.deepEqual(f.sourceBatches, Array.from({length: attempts}, () => ['svc-1', 'svc-2']),
    'precondition: the two owed rows were attempted as one vector in every attempt');
  assert.deepEqual(laneView(lane), {state: DRIVE.HELD_BY_SUBSCRIBER,
    retryDelayMs: INITIAL_RETRY_MS, retryArmed: true, shipWindow: WINDOW});
  refusing = false;
  lane.addRow('svc-3');
  lane.addRow('svc-4');
  await idle(lane);
  assert.deepEqual(f.sourceBatches.slice(attempts), [['svc-1', 'svc-2'], ['svc-3', 'svc-4']],
    'the captured tail is kept: the vector after an attempted, uncovered range is that ' +
    'range, though the halved window would hold the rows committed since');
});

test('lanes beyond a router destination bound receive typed backpressure while the lanes ' +
  'inside it stay in flight', async (t) => {
  const tables = [TABLES.SERVICES, TABLES.PARTITIONS, TABLES.NODES, TABLES.REPLICA_OPERATIONS];
  const f = await multiLaneTopologyFixture(t,
    tables.map((tableName) => ({tableName, rows: [`${tableName}-1`]})));
  // The double's destination bound: the delivery being asked counts itself.
  f.answer = () => f.router.calls.filter((call) => call.held).length <= DESTINATION_BOUND ?
    HOLD : {leaf: LEAF.OUTBOUND_BACKPRESSURE, hintMs: SMALL_HINT_MS};
  const inside = f.lanes.slice(0, DESTINATION_BOUND).map((lane) => track(lane.drive()));
  await settleTicks();
  const beyond = [];
  for (const lane of f.lanes.slice(DESTINATION_BOUND)) beyond.push(await lane.drive());
  assert.deepEqual(beyond.map((outcome) => outcome.state),
    beyond.map(() => DRIVE.HELD_BY_SUBSCRIBER));
  assert.deepEqual(f.lanes.slice(DESTINATION_BOUND).map(laneView),
    beyond.map(() => ({state: DRIVE.HELD_BY_SUBSCRIBER, retryDelayMs: SMALL_HINT_MS,
      retryArmed: true, shipWindow: 1})),
    'the router\'s typed backpressure reaches each lane beyond the bound');
  assert.deepEqual(inside.map((drive) => drive.settled), [false, false],
    'the lanes inside the bound are still in flight');
});

test('a source-group leader change failing every wave at once leaves each lane its debt ' +
  'and its own retry, and the in-flight set returns to zero', async (t) => {
  const tables = [TABLES.SERVICES, TABLES.PARTITIONS, TABLES.NODES];
  const f = await multiLaneTopologyFixture(t,
    tables.map((tableName) => ({tableName, rows: [`${tableName}-1`]})));
  let leaderChanged = true;
  f.sourceAnswer = () => leaderChanged ? LEAF.UNKNOWN : LEAF.NATIVE;
  const outcomes = await Promise.all(f.lanes.map((lane) => lane.drive()));
  await settleTicks();
  assert.deepEqual(outcomes.map((outcome) => [outcome.state, outcome.retryDelayMs]),
    outcomes.map(() => [DRIVE.HELD_BY_SUBSCRIBER, INITIAL_RETRY_MS]));
  assert.deepEqual(f.lanes.map((lane) => countCdcObligations(lane.leader.db)),
    f.lanes.map(() => ({owed: 1, delivered: 0})), 'every lane keeps its debt');
  assert.equal(f.topology.inFlightDurableWaves.size, 0, 'the in-flight set is back to zero');
  leaderChanged = false;
  f.clock.advance(INITIAL_RETRY_MS);
  await settleTicks();
  assert.deepEqual(f.lanes.map((lane) => lane.diagnostics().lastDrive?.state),
    f.lanes.map(() => DRIVE.DRAINED), 'every lane drains on its own retry');
  for (const lane of f.lanes) {
    await lane.leader.cdcDelivery.flushCdcAcknowledgements(REASON.FLUSH_DEADLINE);
  }
  await settleTicks();
  assert.deepEqual(f.lanes.map((lane) => countCdcObligations(lane.leader.db)),
    f.lanes.map(() => ({owed: 0, delivered: 1})));
});

test('two lanes leading two partitions of one table: one is delivered while the other\'s ' +
  'wave is held', async (t) => {
  const f = await multiLaneTopologyFixture(t, [
    {tableName: TABLES.NODES, partitionId: 'nodes-p1', rows: ['p1-1']},
    {tableName: TABLES.NODES, partitionId: 'nodes-p2', rows: ['p2-1']},
  ]);
  const [held, other] = f.lanes;
  f.answer = (call) => call.sourcePartition === held.partitionId ? HOLD : LEAF.NATIVE;
  const heldDrive = track(held.drive());
  await settleTicks();
  assert.deepEqual(idsOf(f.callsOf(held)), [['p1-1']], 'precondition: p1\'s wave is held');
  const outcome = await other.drive();
  assert.equal(outcome.state, DRIVE.DRAINED);
  assert.deepEqual(idsOf(f.callsOf(other)), [['p2-1']]);
  assert.deepEqual(f.router.calls.map((call) => call.sourcePartition), ['nodes-p1', 'nodes-p2'],
    'each lane carries its own partition identity');
  assert.equal(heldDrive.settled, false);
});
