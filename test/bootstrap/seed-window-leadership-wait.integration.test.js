// The seed's bootstrap window writes a partition only after the seed's owned
// leadership wait (SeedPartitionsPhase#waitForPartitionLeadership, inside its
// bootstrap deadline) has observed that partition's leader (line-regression-
// causes stage 4, item C). Since the bootstrap-direct fallback was deleted
// (097888f1a), a window write rides raft only and the raft lane's answer is the
// write's answer; the window's callers are single-shot and bootstrap mode has
// no CDC retry, so one NOT_LEADER on a partition the window did not wait for
// fails the founding attempt, and an attempt with rows written cannot continue.
//
// Each case starts a real fresh seed (the actual public startLagrangeRuntime in
// a new process) with the bootstrap-lane observer: a held partition has no
// observable leader and its raft lane answers the write kernel's own NOT_LEADER
// refusal until the leader appears (seed-bootstrap-lane-observer.js).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {BOOTSTRAP_PIPELINE_ERROR_CODE} from '../../src/bootstrap/bootstrap-constants.js';
import {INITIAL_PARTITION_IDS, SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {SEED_LANE_OBSERVATION, leaderHoldMode} from
  '../test-helpers/seed-bootstrap-lane-observer.js';
import {startObservedFreshSeed} from '../test-helpers/seed-bootstrap-lane-start.js';

const NODE_ID = Object.freeze({
  NORMAL: '550e8400-e29b-41d4-a716-446655449983',
  LATE_DEFINITIONS: '550e8400-e29b-41d4-a716-446655449984',
  LATE_CONFIG: '550e8400-e29b-41d4-a716-446655449985',
  NO_LEADER: '550e8400-e29b-41d4-a716-446655449986',
});
const TEST_TIMEOUT_MS = 240000;
const allocator = createPortAllocator(import.meta.url);

async function startSeed(nodeId, observe) {
  const {report, wallMs} = await startObservedFreshSeed({nodeId,
    ports: allocator.getListenerPorts(), observe});
  const lane = report.observation.bootstrapLane;
  console.log(`# WITNESS seed-window-leadership-wait ${JSON.stringify({observe, wallMs,
    returnedRuntime: report.returnedRuntime, startupError: report.startupError?.message ?? null,
    startupCode: report.startupError?.code ?? null, hold: lane.hold,
    refusedWrites: lane.refusedWrites, unwaitedWindowPartitions: lane.unwaitedWindowPartitions,
    windowPartitions: lane.windowPartitions, heldPartitionWrites: lane.heldPartitionWrites.length,
    directWrites: lane.directWrites.length})}`);
  return {report, lane};
}

function errorChain(record) {
  if (record === null || record === undefined) return [];
  return [record, ...errorChain(record.cause),
    ...(record.errors ?? []).flatMap((entry) => errorChain(entry))];
}

function assertLateLeaderAwaited(report, lane, partitionId) {
  assert.notEqual(lane.hold.releasedAt, null, 'the held leader appeared during the start');
  assert.deepEqual(lane.refusedWrites, [],
    `no write was issued to ${partitionId} before its leader appeared`);
  assert.equal(report.returnedRuntime, true,
    `the start completed (${JSON.stringify(report.startupError?.message)})`);
  assert.ok(lane.heldPartitionWrites.length > 0, `the window wrote ${partitionId} through raft`);
  assert.equal(new Set(lane.heldPartitionWrites).size, lane.heldPartitionWrites.length,
    `each ${partitionId} row was written exactly once`);
  assert.deepEqual(lane.directWrites, [], 'no statement executed outside raft');
}

test('every partition the bootstrap window writes is covered by the leadership wait',
  {timeout: TEST_TIMEOUT_MS}, async () => {
    const {report, lane} = await startSeed(NODE_ID.NORMAL, SEED_LANE_OBSERVATION.COUNT);
    assert.equal(report.returnedRuntime, true,
      `the seed reached service (${JSON.stringify(report.startupError?.message)})`);
    assert.ok(lane.windowPartitions.length > 0, 'the window wrote through raft');
    assert.deepEqual(lane.unwaitedWindowPartitions, [],
      'no window write targets a partition whose leader the seed did not wait for');
  });

test('a window write to service_definitions waits for a leader that appears late',
  {timeout: TEST_TIMEOUT_MS}, async () => {
    const tableName = SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS;
    const {report, lane} = await startSeed(NODE_ID.LATE_DEFINITIONS,
      leaderHoldMode(SEED_LANE_OBSERVATION.DELAY_LEADER, tableName));
    assertLateLeaderAwaited(report, lane, INITIAL_PARTITION_IDS[tableName]);
  });

test('a window write to config waits for a leader that appears late',
  {timeout: TEST_TIMEOUT_MS}, async () => {
    const tableName = SYSTEM_TABLE_NAME.CONFIG;
    const {report, lane} = await startSeed(NODE_ID.LATE_CONFIG,
      leaderHoldMode(SEED_LANE_OBSERVATION.DELAY_LEADER, tableName));
    assertLateLeaderAwaited(report, lane, INITIAL_PARTITION_IDS[tableName]);
  });

test('a leader that never appears fails the start at the deadline, naming the partition',
  {timeout: TEST_TIMEOUT_MS}, async () => {
    const tableName = SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS;
    const partitionId = INITIAL_PARTITION_IDS[tableName];
    const {report, lane} = await startSeed(NODE_ID.NO_LEADER,
      leaderHoldMode(SEED_LANE_OBSERVATION.WITHHOLD_LEADER, tableName));
    const code = BOOTSTRAP_PIPELINE_ERROR_CODE.PARTITION_LEADERSHIP_TIMEOUT;
    assert.equal(report.returnedRuntime, false, 'the start did not complete');
    assert.deepEqual(lane.refusedWrites, [],
      `no write was issued to ${partitionId} without a leader`);
    assert.ok(errorChain(report.startupError).some((entry) => typeof code === 'string' &&
      entry.code === code && String(entry.message).includes(partitionId)),
    `the start failed with the typed leadership deadline naming ${partitionId}`);
  });
