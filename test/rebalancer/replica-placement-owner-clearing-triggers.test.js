// Every waiting reason on the placement admission path has a clearing
// trigger that exists in code, and the four owner events fire when their
// condition clears (quest replica-placement-admission-owner, design
// sections 2.3 and 2.7, constraint every-refusal-has-a-clearing-trigger; WP-E
// falsifier F11 and owner decision D5 condition 1).
//
// REAL: the owners that produce each trigger - the partition write path and
// its participant cutover pause, the PressureGovernor, the storage capacity
// projection - and the one refusal-to-trigger table. DOUBLES: the consensus
// port (the test commits), the transport pressure sensor and the capacity
// owner's cache rows.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {REPLICA_OPERATIONS_SCHEMA, SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CDC_OPERATION, COLUMN, TABLES} from '../../src/constants/index.js';
import {ServeEligibilityOwner} from '../../src/control-plane/serve-eligibility-owner.js';
import {PRESSURE_GOVERNOR_ACTION, PRESSURE_WORK_CLASS, PressureGovernor} from
  '../../src/control-plane/pressure-governor.js';
import {PRESSURE_GOVERNOR_EVENT} from
  '../../src/control-plane/pressure-governor-release-watch.js';
import {PARTITION_SERVICE_EVENT} from '../../src/partition/partition-service-constants.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from
  '../../src/partition/partition-write-kernel.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {requestPlacementAdmission} from
  '../../src/partition/partition-placement-admission.js';
import {StorageCapacityAccountingService} from
  '../../src/rebalancer/storage-capacity-accounting-service.js';
import {
  PLACEMENT_CLEARING_TRIGGER, PLACEMENT_REFUSAL, PLACEMENT_TRIGGER, PLACEMENT_WAITING_REASON,
} from '../../src/rebalancer/replica-placement-owner-constants.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {
  awaitProposal, clearFixtureSingletons, resetFixtureSingletons,
  resumeFixtureParticipantAdmission, shutdownAll, startLeader,
} from '../test-helpers/participant-transaction-fixture.js';
import {LEDGER_PARTITION_ID, NODE, placementStatement} from
  '../partition/placement-admission-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const POLL_WAIT_MS = 60;
const CAPACITY_OWNER = StorageCapacityAccountingService.prototype;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Where each trigger is subscribed: the owner API that must exist in code
// (the static half of the WP-G check, pinned here so a removed owner API
// fails at once). RESYNC is the one declared cadence and clears nothing.
const TRIGGER_SOURCES = Object.freeze({
  [PLACEMENT_TRIGGER.LEDGER_COMMIT]: () =>
    typeof PARTITION_SERVICE_EVENT.ENTRY_COMMITTED === 'string' &&
    typeof PartitionService.prototype.on === 'function',
  [PLACEMENT_TRIGGER.NODES_OR_FORMATION]: () =>
    typeof ServeEligibilityOwner.prototype.subscribe === 'function',
  [PLACEMENT_TRIGGER.SERVICES_CHANGED]: () =>
    typeof SystemTableCache.prototype.onCacheApplyChange === 'function',
  [PLACEMENT_TRIGGER.PARTITIONS_CHANGED]: () =>
    typeof SystemTableCache.prototype.onCacheApplyChange === 'function',
  [PLACEMENT_TRIGGER.TARGET_CAPACITY_CHANGED]: () => typeof CAPACITY_OWNER
    .subscribeCapacitySemanticChanges === 'function',
  [PLACEMENT_TRIGGER.WRITE_PATH_RELEASED]: () =>
    typeof PARTITION_SERVICE_EVENT.WRITE_PATH_RELEASED === 'string',
  [PLACEMENT_TRIGGER.PRESSURE_RELEASED]: () =>
    typeof PressureGovernor.prototype.watchPressureRelease === 'function',
  [PLACEMENT_TRIGGER.LEADERSHIP_START]: () =>
    typeof PartitionService.prototype.setRebalancerLeadershipSink === 'function',
});

test('F11: every refusal and waiting reason maps to a trigger whose subscription exists, ' +
  'and none clears on RESYNC or a retry delay', () => {
  const reasons = [...Object.values(PLACEMENT_REFUSAL),
    ...Object.values(PLACEMENT_WAITING_REASON),
    ...Object.values(PARTITION_WRITE_LEADERSHIP_REFUSAL)];
  const unmapped = reasons.filter((reason) =>
    !Object.hasOwn(PLACEMENT_CLEARING_TRIGGER, reason));
  assert.deepEqual(unmapped, []);
  const triggers = Object.values(PLACEMENT_CLEARING_TRIGGER);
  assert.ok(triggers.every((trigger) => trigger === null ||
    Object.values(PLACEMENT_TRIGGER).includes(trigger)));
  assert.equal(triggers.includes(PLACEMENT_TRIGGER.RESYNC), false);
  assert.equal(Object.keys(PLACEMENT_CLEARING_TRIGGER).some((reason) =>
    /retry/iu.test(reason)), false);
  // A definite answer needs no trigger; every other reason has one.
  assert.deepEqual(Object.entries(PLACEMENT_CLEARING_TRIGGER)
    .filter(([, trigger]) => trigger === null).map(([reason]) => reason).sort(), [
    PLACEMENT_REFUSAL.ALREADY_FOUNDED, PLACEMENT_REFUSAL.HOLD_NOT_HELD,
    PLACEMENT_REFUSAL.SYSTEM_PARTITION_SEED_FOUNDED, PLACEMENT_REFUSAL.TARGET_CLAIM_TAKEN,
  ].sort());
  const used = new Set(triggers.filter((trigger) => trigger !== null));
  assert.deepEqual([...used].filter((trigger) => !TRIGGER_SOURCES[trigger]?.()), []);
});

test('WRITE_PATH_RELEASED: the cutover pause refuses the admission typed and its release ' +
  'emits the event once', async () => {
  const {leader, proposed} = await startLeader({tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    schema: REPLICA_OPERATIONS_SCHEMA, releaseAdmission: false}, LEDGER_PARTITION_ID);
  try {
    const released = [];
    leader.on(PARTITION_SERVICE_EVENT.WRITE_PATH_RELEASED, (event) => released.push(event));
    const body = placementStatement({partitionId: 'tables-p1', target: NODE.B});
    const paused = await requestPlacementAdmission(leader, {entryId: 'paused-1', body});
    assert.equal(paused.failureCode, PARTITION_WRITE_LEADERSHIP_REFUSAL.CUTOVER_PAUSED);
    assert.equal(PLACEMENT_CLEARING_TRIGGER[paused.failureCode],
      PLACEMENT_TRIGGER.WRITE_PATH_RELEASED);
    assert.equal(proposed.length, 0);
    assert.deepEqual(released, []);
    await resumeFixtureParticipantAdmission(leader);
    assert.equal(released.length, 1);
    assert.equal(released[0].partitionId, LEDGER_PARTITION_ID);
    // Resuming an open admission is no new release.
    await resumeFixtureParticipantAdmission(leader);
    assert.equal(released.length, 1);
    void requestPlacementAdmission(leader, {entryId: 'paused-2', body});
    assert.ok(await awaitProposal(proposed, (entry) => entry.entryId === 'paused-2'));
  } finally {
    await shutdownAll(leader);
  }
});

test('PRESSURE_RELEASED: a watcher of a deferred request is told once when the governor ' +
  'stops deferring it, never while pressure lasts', async () => {
  const sensor = {backpressured: true};
  const governor = new PressureGovernor({nodeId: 'pressure-node',
    messageRouter: {getOutboundPressureSummary: () => ({...sensor})}});
  try {
    const request = {workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
      resourceKeys: ['transport:outbound']};
    assert.equal(governor.evaluate(request).action, PRESSURE_GOVERNOR_ACTION.DEFER);
    const releases = [];
    const cancelled = [];
    governor.watchPressureRelease(request, (event) => releases.push(event));
    const cancel = governor.watchPressureRelease(request, (event) => cancelled.push(event));
    cancel();
    await sleep(POLL_WAIT_MS);
    assert.deepEqual(releases, []);
    sensor.backpressured = false;
    await sleep(POLL_WAIT_MS);
    assert.equal(releases.length, 1);
    assert.equal(releases[0].event, PRESSURE_GOVERNOR_EVENT.PRESSURE_RELEASED);
    assert.equal(releases[0].decision.action, PRESSURE_GOVERNOR_ACTION.ALLOW);
    assert.deepEqual(cancelled, []);
    // Told once: the watch is spent and the poll stops.
    sensor.backpressured = true;
    await sleep(POLL_WAIT_MS);
    sensor.backpressured = false;
    await sleep(POLL_WAIT_MS);
    assert.equal(releases.length, 1);
    assert.equal(governor.admissionPollTimer, null);
  } finally {
    governor.dispose();
  }
});

test('TARGET_CAPACITY_CHANGED: capacity freed by a released reservation reaches the ' +
  'capacity owner\'s subscribers', () => {
  const timeSource = new VirtualTimeSource({startMs: 1_000});
  const operation = {[COLUMN.OPERATION_ID]: 'operation-a', [COLUMN.STATUS]: 'pending',
    type: 'ADD', workflow_step: 'PENDING'};
  const rowsByTable = new Map([
    [TABLES.NODES, [{[COLUMN.NODE_ID]: NODE.B, [COLUMN.STORAGE_BUDGET_BYTES]: 1_000}]],
    [TABLES.PARTITIONS, []], [TABLES.SERVICES, []],
    [TABLES.STORAGE_RESERVATIONS, [{[COLUMN.AMPLIFICATION_FACTOR]: 1,
      [COLUMN.ESTIMATED_BYTES]: 900, [COLUMN.EXPIRES_AT]: 1_000 + 60_000,
      [COLUMN.OPERATION_ID]: 'operation-a', [COLUMN.RESERVATION_ID]: 'reservation-a',
      [COLUMN.STATUS]: 'active', [COLUMN.TARGET_NODE_ID]: NODE.B}]],
    [TABLES.REPLICA_OPERATIONS, [operation]],
  ]);
  const service = new StorageCapacityAccountingService({timeSource,
    systemTableCache: {getAll: (tableName) => rowsByTable.get(tableName) || []}});
  try {
    const changes = [];
    service.subscribeCapacitySemanticChanges((change) => changes.push(change));
    const held = service.getCapacitySemanticIdentity(NODE.B);
    assert.equal(held.projection.capacity.reservedBytes, 900);
    const baseline = changes.length;
    // The reservation is released by its own committed row change.
    const released = {...rowsByTable.get(TABLES.STORAGE_RESERVATIONS)[0],
      [COLUMN.STATUS]: 'released'};
    rowsByTable.set(TABLES.STORAGE_RESERVATIONS, [released]);
    service.recordCapacitySourceChange(TABLES.STORAGE_RESERVATIONS, CDC_OPERATION.UPDATE,
      released);
    assert.equal(changes.length, baseline + 1);
    const [change] = changes.slice(baseline);
    assert.equal(change.nodeId, NODE.B);
    assert.equal(change.projection.capacity.reservedBytes, 0);
    assert.equal(PLACEMENT_CLEARING_TRIGGER[PLACEMENT_WAITING_REASON
      .TARGET_STORAGE_CONSTRAINED], PLACEMENT_TRIGGER.TARGET_CAPACITY_CHANGED);
  } finally {
    service.shutdownCapacitySemanticProjection();
  }
});
