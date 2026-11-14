// Reproducers of quest cdc-propagation-node-slot-removal at the source lane:
// PartitionCDCDelivery's obligation lane (driveCdcObligations) of several
// partition leaders of one node, each handing its owed range through its
// propagation subscriber (buildPartitionCdcPropagationSubscriber) to the one
// real topology owner (CDCGroupPropagationService), acknowledged by committed
// CDC_DELIVERED. Written to the behaviour after the repair:
//
// - a lane whose vector is presented while another lane's wave is in flight
//   is admitted and delivered; nothing the propagation service answers arms
//   that lane's retry timer or hands it a hint;
// - each lane still has at most one wave in flight (its own single flight);
// - a single lane with nothing to contend with behaves exactly as on the base
//   (same answers, acknowledgements, retry dispositions and delays): this
//   differential is green on the unchanged product and must stay green.
//
// Real source ledger, subscription, acknowledgement and topology owners; the
// recipient answers are controlled CDC outcomes (never a native recipient
// commit). Virtual time only.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {TABLES} from '../../src/constants/index.js';
import {PARTITION_CDC_OBLIGATION_DRIVE_STATE as DRIVE,
  PARTITION_CDC_OBLIGATION_REASON as REASON} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {countCdcObligations} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {PARTITION_SERVICE_DEFAULT} from '../../src/partition/partition-service-constants.js';
import {LATENCY_PROPAGATION_MODE} from '../../src/topology/latency-topology-constants.js';
import {RESPONSE, multiLaneTopologyFixture} from
  '../test-helpers/cdc-topology-progress-fixture.js';
import {settleTicks, track} from '../test-helpers/participant-transaction-fixture.js';
import {setupConfig, teardownConfig} from '../topology/cdc-group-propagation-service-harness.js';

const HOLD = null;
const INITIAL_RETRY_MS = PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS;

beforeEach(() => setupConfig(LATENCY_PROPAGATION_MODE.SAFE));
afterEach(teardownConfig);

const idsOf = (calls) => calls.map((call) => call.ids);

// The lane's outcome as the delivery owner recorded it: state and counts, and
// whether its retry timer is armed (and with which delay).
function laneView(lane) {
  const {lastDrive, retryArmed, shipWindow} = lane.diagnostics();
  const retryTimer = lane.leader.cdcDelivery.obligationLane.retryTimer;
  return {state: lastDrive?.state, delivered: lastDrive?.delivered,
    retryDelayMs: lastDrive?.retryDelayMs, retryArmed,
    armedDelayMs: retryArmed ? retryTimer.delayMs : null, shipWindow};
}

// (4) No slot-derived retry.
test('driveCdcObligations of a lane presenting while another lane\'s wave is in flight ' +
  'delivers its range, drains, and has no retry timer armed and no hint from the ' +
  'propagation service', async (t) => {
  const f = await multiLaneTopologyFixture(t, [
    {tableName: TABLES.SERVICES, rows: ['svc-1']},
    {tableName: TABLES.NODES, rows: ['node-1']},
  ]);
  const [held, presenting] = f.lanes;
  f.answer = (call) => call.tableName === held.tableName ? HOLD : RESPONSE.NATIVE;
  const heldDrive = track(held.drive());
  await settleTicks();
  assert.deepEqual(idsOf(f.callsOf(held)), [['svc-1']],
    'precondition: the services wave is in flight at its recipient');
  const outcome = await presenting.drive();
  assert.deepEqual(laneView(presenting), {state: DRIVE.DRAINED, delivered: 1,
    retryDelayMs: undefined, retryArmed: false, armedDelayMs: null, shipWindow: 1},
  'the nodes lane drains: no refusal, no retry timer, no hint');
  assert.equal(outcome.state, DRIVE.DRAINED);
  assert.deepEqual(idsOf(f.callsOf(presenting)), [['node-1']],
    'the nodes range reached its recipient while the services wave was in flight');
  await presenting.leader.cdcDelivery.flushCdcAcknowledgements(REASON.DELIVERY_RETRY);
  await settleTicks();
  assert.deepEqual(countCdcObligations(presenting.leader.db), {owed: 0, delivered: 1},
    'the nodes row is acknowledged delivered');
  assert.equal(heldDrive.settled, false, 'the services wave is still in flight');
});

// (6, lane half) The lane's own single flight still bounds it.
test('each lane keeps at most one wave in flight: drives and committed entries while its ' +
  'wave is held join it, and its next range ships only after it', async (t) => {
  const f = await multiLaneTopologyFixture(t, [
    {tableName: TABLES.SERVICES, rows: ['svc-1']},
    {tableName: TABLES.PARTITIONS, rows: ['part-1']},
  ]);
  const [held, other] = f.lanes;
  const inFlight = new Map();
  const maxInFlight = new Map();
  f.answer = (call) => {
    const count = (inFlight.get(call.tableName) ?? 0) + 1;
    inFlight.set(call.tableName, count);
    maxInFlight.set(call.tableName, Math.max(maxInFlight.get(call.tableName) ?? 0, count));
    if (call.tableName === held.tableName) return HOLD;
    inFlight.set(call.tableName, count - 1);
    return RESPONSE.NATIVE;
  };
  const firstDrive = track(held.drive());
  await settleTicks();
  held.addRow('svc-2');
  const joined = await held.drive();
  await other.drive();
  await settleTicks();
  assert.equal(joined.state, DRIVE.JOINED_IN_FLIGHT, 'a drive while the wave is held joins it');
  assert.deepEqual(idsOf(f.callsOf(held)), [['svc-1']],
    'one services vector in flight; the committed row does not start a second wave');
  const [first] = f.callsOf(held);
  inFlight.set(held.tableName, 0);
  f.answer = () => RESPONSE.NATIVE;
  f.release(first);
  await firstDrive.promise;
  await settleTicks();
  if (f.callsOf(held).length === 1) await held.drive();
  assert.deepEqual(idsOf(f.callsOf(held)), [['svc-1'], ['svc-2']],
    'the next range ships after the first wave, in log order');
  assert.deepEqual(Object.fromEntries(maxInFlight), {[held.tableName]: 1,
    ...(maxInFlight.has(other.tableName) ? {[other.tableName]: 1} : {})},
  'no lane ever had two waves in flight');
});

// (8) A single lane with nothing to contend with: the base's behaviour.
test('a single lane with nothing to contend with ships, acknowledges and drains exactly as ' +
  'on the base', async (t) => {
  const f = await multiLaneTopologyFixture(t, [
    {tableName: TABLES.SERVICES, rows: ['svc-1', 'svc-2']},
  ]);
  const [lane] = f.lanes;
  const outcome = await lane.drive();
  assert.deepEqual({state: outcome.state, delivered: outcome.delivered},
    {state: DRIVE.DRAINED, delivered: 2});
  assert.deepEqual(idsOf(f.router.calls), [['svc-1'], ['svc-2']],
    'the cold window ships one entry, then widens to the rest');
  assert.deepEqual(f.sourceBatches, [['svc-1'], ['svc-2']]);
  assert.deepEqual(laneView(lane), {state: DRIVE.DRAINED, delivered: 2, retryDelayMs: undefined,
    retryArmed: false, armedDelayMs: null, shipWindow: 2});
  assert.equal(lane.diagnostics().pendingAcknowledgements, 2);
  await lane.leader.cdcDelivery.flushCdcAcknowledgements(REASON.FLUSH_DEADLINE);
  await settleTicks();
  assert.deepEqual(countCdcObligations(lane.leader.db), {owed: 0, delivered: 2});
});

test('a single lane with nothing to contend with holds a transiently refused range with ' +
  'the base\'s disposition and delay, and its retry re-presents it without re-applying ' +
  'the covered source', async (t) => {
  const f = await multiLaneTopologyFixture(t, [
    {tableName: TABLES.SERVICES, rows: ['svc-1']},
  ]);
  const [lane] = f.lanes;
  f.answer = () => f.router.calls.length === 1 ? RESPONSE.UNKNOWN : RESPONSE.NATIVE;
  const held = await lane.drive();
  assert.deepEqual({state: held.state, delivered: held.delivered, rows: held.rows,
    retryDelayMs: held.retryDelayMs},
  {state: DRIVE.HELD_BY_SUBSCRIBER, delivered: 0, rows: 1, retryDelayMs: INITIAL_RETRY_MS});
  assert.deepEqual(laneView(lane), {state: DRIVE.HELD_BY_SUBSCRIBER, delivered: 0,
    retryDelayMs: INITIAL_RETRY_MS, retryArmed: true, armedDelayMs: INITIAL_RETRY_MS,
    shipWindow: 1}, 'a transient failure: the base delay, the window stays at one');
  f.clock.advance(INITIAL_RETRY_MS);
  await settleTicks();
  assert.deepEqual(idsOf(f.router.calls), [['svc-1'], ['svc-1']],
    'the retry re-presents the same range to the uncovered target');
  assert.deepEqual(f.sourceBatches, [['svc-1']], 'the covered source is not applied again');
  assert.deepEqual(laneView(lane), {state: DRIVE.DRAINED, delivered: 1, retryDelayMs: undefined,
    retryArmed: false, armedDelayMs: null, shipWindow: 1});
  await lane.leader.cdcDelivery.flushCdcAcknowledgements(REASON.FLUSH_DEADLINE);
  await settleTicks();
  assert.deepEqual(countCdcObligations(lane.leader.db), {owed: 0, delivered: 1});
});
