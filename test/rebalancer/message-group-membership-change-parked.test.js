// Owner decision 2026-10-04 (raft-rs full cutover): a message group's
// replica membership does not change until the fresh-identity ADD/promote
// path for message groups exists. mg-1 lives entirely on the seed, and the
// message-group placement policy (spread across nodes, target 3) gives the
// planner every reason to move it: on the real planner the shape below plans
// REPLACE mg-1-r1 -> node-2 and mg-1-r2 -> node-3 every round, and each one
// mints an operation whose CREATE_REPLICA opens a GENESIS self-founder that
// elects at once.
//
// Witnessed on the real UnifiedRebalancer and MovePlanner (only the node
// availability projection and storage admission are stubbed, both to
// "everything admitted", so nothing but the refusal can stop a move):
//   - the planner mints zero operations over many planning rounds on an
//     injected clock, and answers the typed refusal;
//   - the refusal is logged once, not once per round;
//   - the periodic check parks: it schedules no further check (no timer is
//     its exit; the refusal ends with a code change, the next quest);
//   - a partition with the same shape still plans (the refusal is scoped to
//     message groups).

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createAllowAllStorageAdmissionService,
  createTestRebalancer,
  initializeSpreadTestEnvironment,
} from './test-helpers.js';
import {EntityType} from '../../src/rebalancer/unified-rebalancer.js';
import {
  REBALANCER_LOG_MSG,
  REBALANCER_SKIP_REASON,
} from '../../src/rebalancer/rebalancer-constants.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';

const SEED = 'node-1';
const NODE_IDS = Object.freeze([SEED, 'node-2', 'node-3']);
const GROUP_ID = 'mg-1';
const PLANNING_ROUNDS = 40;
const ROUND_MS = 5000;

function replicaRows(entityId, serviceType) {
  return [0, 1, 2].map((index) => ({
    service_id: `${entityId}-r${index}`,
    replica_id: `${entityId}-r${index}`,
    service_type: serviceType,
    ...(serviceType === SERVICE_TYPE.MESSAGE_GROUP ?
      {group_id: entityId} : {partition_id: entityId}),
    node_id: SEED,
    status: 'active',
    raft_role: index === 0 ? 'leader' : 'follower',
    address: `${SEED}/${entityId}-r${index}`,
  }));
}

// A leader planner over three admitted nodes with every replica of the
// entity on the seed; the clock and the timers are the test's.
function seedOnlyPlanner({entityId, entityType, serviceType}) {
  initializeSpreadTestEnvironment(SEED);
  const clock = {now: 1_000_000};
  const timers = [];
  const rebalancer = createTestRebalancer({
    entityId,
    entityType,
    nodeId: SEED,
    nowFn: () => clock.now,
    setTimeoutFn: (fn, ms) => {
      timers.push({fn, ms});
      return {unref() {}};
    },
    clearTimeoutFn: () => undefined,
    cacheData: {
      nodes: NODE_IDS.map((nodeId) => ({node_id: nodeId, status: 'active'})),
      services: replicaRows(entityId, serviceType),
      ...(entityType === EntityType.MESSAGE_GROUP ?
        {messageGroups: [{message_group_id: entityId, group_id: entityId}]} :
        {partitions: [{partition_id: entityId, table_id: 't1'}]}),
    },
  });
  const minted = [];
  const createOperation = rebalancer.rebalanceCoordinator.createOperation;
  rebalancer.rebalanceCoordinator.createOperation = async (move) => {
    minted.push(`${move.type}:${move.nodeId}`);
    return createOperation(move);
  };
  const warnings = [];
  const warn = rebalancer.logger.warn.bind(rebalancer.logger);
  rebalancer.logger.warn = (message, context) => {
    warnings.push(message);
    return warn(message, context);
  };
  rebalancer.initialize();
  const nodes = NODE_IDS.map((nodeId) =>
    rebalancer.systemTableCache.get('nodes', nodeId));
  rebalancer.getAvailableNodes = () => nodes;
  rebalancer.movePlanner.storageAdmissionService =
    createAllowAllStorageAdmissionService();
  rebalancer.rebalanceCoordinator.storageAdmissionService =
    rebalancer.movePlanner.storageAdmissionService;
  rebalancer.setLeader(true);
  return {rebalancer, minted, warnings, timers, clock};
}

const parkedWarnings = (warnings) => warnings.filter((message) =>
  message === REBALANCER_LOG_MSG.MESSAGE_GROUP_MEMBERSHIP_CHANGE_PARKED);

test('the message-group planner mints no operation with mg-1 on the seed ' +
  'only, over many planning rounds', async () => {
  const {rebalancer, minted, warnings, clock} = seedOnlyPlanner({
    entityId: GROUP_ID,
    entityType: EntityType.MESSAGE_GROUP,
    serviceType: SERVICE_TYPE.MESSAGE_GROUP,
  });
  try {
    const reasons = new Set();
    for (let round = 0; round < PLANNING_ROUNDS; round += 1) {
      clock.now += ROUND_MS;
      const result = await rebalancer.rebalance();
      reasons.add(result.reason);
    }
    assert.deepEqual(minted, [], 'zero operations minted');
    assert.deepEqual([...reasons],
      [REBALANCER_SKIP_REASON.MESSAGE_GROUP_MEMBERSHIP_CHANGE_UNSUPPORTED],
      'every round answers the typed refusal');
    assert.equal(parkedWarnings(warnings).length, 1,
      'the refusal is logged once, not once per round');
  } finally {
    rebalancer.shutdown();
  }
});

test('fresh-identity closing condition: seed-only mg-1 enters one REPLACE ' +
  'operation instead of the interim membership park', async () => {
  const {rebalancer, minted} = seedOnlyPlanner({
    entityId: GROUP_ID,
    entityType: EntityType.MESSAGE_GROUP,
    serviceType: SERVICE_TYPE.MESSAGE_GROUP,
  });
  try {
    const result = await rebalancer.rebalance();
    assert.notEqual(
      result.reason,
      REBALANCER_SKIP_REASON.MESSAGE_GROUP_MEMBERSHIP_CHANGE_UNSUPPORTED,
      'the approved fresh-identity path must cross the planner refusal',
    );
    assert.equal(minted.length, 1,
      'one planning turn submits exactly one operation to the owner lane');
    assert.match(minted[0], /^REPLACE:/,
      'the admitted operation is count-neutral REPLACE, never ADD or MOVE');
  } finally {
    rebalancer.shutdown();
  }
});

test('the message-group periodic check parks: it schedules no further ' +
  'check and mints nothing', async () => {
  const {rebalancer, minted, warnings, timers, clock} = seedOnlyPlanner({
    entityId: GROUP_ID,
    entityType: EntityType.MESSAGE_GROUP,
    serviceType: SERVICE_TYPE.MESSAGE_GROUP,
  });
  rebalancer.isStabilized = () => true;
  rebalancer.clusterReadinessConfirmed = true;
  try {
    for (let round = 0; round < PLANNING_ROUNDS; round += 1) {
      clock.now += ROUND_MS;
      timers.length = 0;
      await rebalancer.checkRebalance();
      assert.equal(timers.length, 0,
        `round ${round}: a parked check schedules no further check`);
    }
    assert.deepEqual(minted, []);
    assert.equal(parkedWarnings(warnings).length, 1);
  } finally {
    rebalancer.shutdown();
  }
});

test('control: a partition with the same shape still plans its spread',
  async () => {
    const {rebalancer, minted} = seedOnlyPlanner({
      entityId: 'user_table-p1',
      entityType: EntityType.PARTITION,
      serviceType: 'partition',
    });
    try {
      const result = await rebalancer.rebalance();
      assert.notEqual(result.reason,
        REBALANCER_SKIP_REASON.MESSAGE_GROUP_MEMBERSHIP_CHANGE_UNSUPPORTED);
      assert.ok(minted.length > 0,
        `the partition planner mints its spread (${JSON.stringify(result)})`);
    } finally {
      rebalancer.shutdown();
    }
  });
