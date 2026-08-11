import {test} from '../../src/test-helpers/tap.js';
import {
  LEADER_HANDOFF_RETRY_AFTER_MS,
  USER_TABLE_LEADER_PLACEMENT_CURE_STATE,
  applyUserTableLeaderPlacementCure,
  evaluateLeaderPlacementCureBehindPrioritySpreadGate,
  evaluateUserTableLeaderPlacementCure,
  isUserTableLeaderCureGapActionable,
} from '../../src/rebalancer/user-table-leader-placement-cure.js';
import {
  REBALANCER_PLANNING_GATE_METHODS,
} from '../../src/rebalancer/rebalancer-planning-gate-methods.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationReason,
} from '../../src/rebalancer/replica-operation-constants.js';

// Deterministic red-on-revert suite for the user-table leader-placement
// cure (quest user-table-leader-placement-spread): leaders concentrated
// on one host must mint exactly one bounded, hysteresis-guarded
// STEP_DOWN_REPLICA / tracked-replacement-election handoff per surplus
// partition, and every guard (census stability, retry suppression,
// anchor retention, zero-leader targeting, user-table fence) must hold.

const NOW_MS = 1_000_000;
const TABLE_ID = 'orders';
const P1 = 'orders-p1';
const P2 = 'orders-p2';
const NODE_1 = 'node-1';
const NODE_2 = 'node-2';
const NODE_3 = 'node-3';

function settledRow(partitionId, leaderNodeId) {
  return {leaderNodeId, partitionId};
}

function baseEvidence(overrides = {}) {
  return {
    eligibleVoterHosts: new Set([NODE_1, NODE_2, NODE_3]),
    lastDispatchAtMs: null,
    nodeId: NODE_1,
    nowMs: NOW_MS,
    ownVoterFollowers: [
      {nodeId: NODE_2, replicaId: `${P2}-r2`},
      {nodeId: NODE_3, replicaId: `${P2}-r3`},
    ],
    partitionId: P2,
    previousCensusFingerprint:
      `${P1}|${NODE_1},${P2}|${NODE_1}`,
    settledPartitions: [
      settledRow(P1, NODE_1),
      settledRow(P2, NODE_1),
    ],
    ...overrides,
  };
}

test('concentrated leaders with stable census dispatch a handoff', (t) => {
  const decision = evaluateUserTableLeaderPlacementCure(baseEvidence());
  t.equal(
    decision.state,
    USER_TABLE_LEADER_PLACEMENT_CURE_STATE.DISPATCH_HANDOFF,
  );
  t.equal(decision.target.nodeId, NODE_2);
  t.equal(decision.target.replicaId, `${P2}-r2`);
  t.equal(decision.census.distinctLeaderHostCount, 1);
  t.equal(decision.census.requiredLeaderHostCount, 2);
  t.end();
});

test('spread at distinct-host capacity is quiescent', (t) => {
  const decision = evaluateUserTableLeaderPlacementCure(baseEvidence({
    settledPartitions: [
      settledRow(P1, NODE_1),
      settledRow(P2, NODE_2),
    ],
  }));
  t.equal(
    decision.state,
    USER_TABLE_LEADER_PLACEMENT_CURE_STATE.SPREAD_SATISFIED,
  );
  t.end();
});

test('the first co-located partition anchors its host', (t) => {
  const decision = evaluateUserTableLeaderPlacementCure(baseEvidence({
    partitionId: P1,
  }));
  t.equal(
    decision.state,
    USER_TABLE_LEADER_PLACEMENT_CURE_STATE.ANCHOR_RETAINED,
  );
  t.end();
});

test('a changed census defers the dispatch one pass', (t) => {
  const decision = evaluateUserTableLeaderPlacementCure(baseEvidence({
    previousCensusFingerprint: null,
  }));
  t.equal(
    decision.state,
    USER_TABLE_LEADER_PLACEMENT_CURE_STATE.CENSUS_UNSTABLE,
  );
  t.end();
});

test('a recent dispatch suppresses the retry', (t) => {
  const decision = evaluateUserTableLeaderPlacementCure(baseEvidence({
    lastDispatchAtMs: NOW_MS - LEADER_HANDOFF_RETRY_AFTER_MS + 1,
  }));
  t.equal(
    decision.state,
    USER_TABLE_LEADER_PLACEMENT_CURE_STATE.RETRY_SUPPRESSED,
  );
  t.end();
});

test('a single settled partition never cures', (t) => {
  const decision = evaluateUserTableLeaderPlacementCure(baseEvidence({
    settledPartitions: [settledRow(P1, NODE_1)],
  }));
  t.equal(
    decision.state,
    USER_TABLE_LEADER_PLACEMENT_CURE_STATE.BELOW_MIN_PARTITION_COUNT,
  );
  t.end();
});

test('a host holding one leader is never a shed source', (t) => {
  const decision = evaluateUserTableLeaderPlacementCure(baseEvidence({
    partitionId: 'orders-p3',
    previousCensusFingerprint:
      `${P1}|${NODE_2},${P2}|${NODE_2},orders-p3|${NODE_1}`,
    settledPartitions: [
      settledRow(P1, NODE_2),
      settledRow(P2, NODE_2),
      settledRow('orders-p3', NODE_1),
    ],
  }));
  t.equal(
    decision.state,
    USER_TABLE_LEADER_PLACEMENT_CURE_STATE.NOT_SURPLUS_HOST,
  );
  t.end();
});

test('targets are restricted to voter hosts with zero table leaders', (t) => {
  const decision = evaluateUserTableLeaderPlacementCure(baseEvidence({
    ownVoterFollowers: [],
  }));
  t.equal(
    decision.state,
    USER_TABLE_LEADER_PLACEMENT_CURE_STATE.NO_ELIGIBLE_TARGET,
  );
  const ownFollowerOnLeaderHost = evaluateUserTableLeaderPlacementCure(
    baseEvidence({
      ownVoterFollowers: [{nodeId: NODE_1, replicaId: `${P2}-r1`}],
    }),
  );
  t.equal(
    ownFollowerOnLeaderHost.state,
    USER_TABLE_LEADER_PLACEMENT_CURE_STATE.NO_ELIGIBLE_TARGET,
  );
  t.end();
});

function partitionRows() {
  return [
    {
      leader_node_id: NODE_1,
      partition_id: P1,
      state: 'normal',
      table_id: TABLE_ID,
    },
    {
      leader_node_id: NODE_1,
      partition_id: P2,
      state: 'normal',
      table_id: TABLE_ID,
    },
  ];
}

function serviceRows() {
  const rows = [];
  for (const partitionId of [P1, P2]) {
    for (const [index, nodeId] of [NODE_1, NODE_2, NODE_3].entries()) {
      rows.push({
        node_id: nodeId,
        partition_id: partitionId,
        raft_role: nodeId === NODE_1 ? 'leader' : 'follower',
        service_id: `${partitionId}-r${index + 1}`,
        service_type: 'partition',
        status: 'active',
      });
    }
  }
  return rows;
}

function buildStubRebalancer(state) {
  const deliveries = [];
  const stub = {
    deliveries,
    entityId: P2,
    entityType: 'partition',
    getCurrentReplicas: () =>
      state.serviceRows.filter((row) => row.partition_id === P2),
    isLeader: true,
    isShuttingDown: false,
    isStabilized: () => state.stabilized,
    logger: {
      debug: () => {},
      error: () => {},
      info: () => {},
      warn: () => {},
    },
    messageRouter: {
      deliver: async (target, request, options) => {
        deliveries.push({options, request, target});
        return {status: 'completed'};
      },
    },
    nodeId: NODE_1,
    replicaId: `${P2}-r1`,
    systemTableCache: {
      filter: (tableName, predicate) => {
        const rows = tableName === 'partitions' ?
          state.partitionRows :
          tableName === 'services' ?
            state.serviceRows :
            [];
        return rows.filter(predicate);
      },
      get: (tableName, key) => {
        if (tableName !== 'partitions') {
          return null;
        }
        return state.partitionRows
          .find((row) => row.partition_id === key) || null;
      },
    },
  };
  return stub;
}

function greenStubState() {
  return {
    partitionRows: partitionRows(),
    serviceRows: serviceRows(),
    stabilized: true,
  };
}

test('the orchestrator dispatches after one stable census pass', async (t) => {
  const stub = buildStubRebalancer(greenStubState());
  const first = await applyUserTableLeaderPlacementCure(
    stub, {nowMs: NOW_MS});
  t.equal(
    first.state,
    USER_TABLE_LEADER_PLACEMENT_CURE_STATE.CENSUS_UNSTABLE,
  );
  t.equal(stub.deliveries.length, 0);
  const second = await applyUserTableLeaderPlacementCure(
    stub, {nowMs: NOW_MS + 1},
  );
  t.equal(
    second.state,
    USER_TABLE_LEADER_PLACEMENT_CURE_STATE.DISPATCH_HANDOFF,
  );
  // The handoff is a PAIR, demote-first: leg 0 demotes the own (source)
  // leader locally so its heartbeats stop; leg 1 arms the target's
  // directed election with nothing left to clobber the 1ms draw (quest
  // user-table-leader-handoff-demotion-pairing, red-on-revert: dropping
  // the demotion leg leaves the election a silent no-op against a
  // stable leader).
  t.equal(stub.deliveries.length, 2);
  const demotion = stub.deliveries[0];
  t.equal(demotion.target, `${NODE_1}/service/replica-handler`);
  t.equal(demotion.options.targetNodeId, NODE_1);
  t.equal(
    demotion.request[ReplicaOperationField.TYPE],
    ReplicaOperationMessageType.STEP_DOWN_REPLICA,
  );
  t.equal(
    demotion.request[ReplicaOperationField.REASON],
    ReplicaOperationReason.REPLACE_SOURCE_LEADER_HANDOFF,
  );
  t.equal(demotion.request[ReplicaOperationField.PARTITION_ID], P2);
  t.equal(demotion.request[ReplicaOperationField.REPLICA_ID], `${P2}-r1`);
  t.match(
    demotion.request[ReplicaOperationField.OPERATION_ID],
    /^user-table-leader-spread:.*:demote$/u,
  );
  const {request, target, options} = stub.deliveries[1];
  t.equal(target, `${NODE_2}/service/replica-handler`);
  t.equal(options.targetNodeId, NODE_2);
  t.equal(
    request[ReplicaOperationField.TYPE],
    ReplicaOperationMessageType.STEP_DOWN_REPLICA,
  );
  t.equal(
    request[ReplicaOperationField.REASON],
    ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION,
  );
  t.equal(request[ReplicaOperationField.PARTITION_ID], P2);
  t.equal(request[ReplicaOperationField.REPLICA_ID], `${P2}-r2`);
  t.match(
    request[ReplicaOperationField.OPERATION_ID],
    /^user-table-leader-spread:/u,
  );
  t.end();
});

test('a missing own replicaId skips the demotion leg but still ' +
  'dispatches the election', async (t) => {
  const stub = buildStubRebalancer(greenStubState());
  delete stub.replicaId;
  await applyUserTableLeaderPlacementCure(stub, {nowMs: NOW_MS});
  await applyUserTableLeaderPlacementCure(stub, {nowMs: NOW_MS + 1});
  t.equal(stub.deliveries.length, 1);
  t.equal(
    stub.deliveries[0].request[ReplicaOperationField.REASON],
    ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION,
  );
  t.end();
});

test('a failed demotion leg never blocks the election leg', async (t) => {
  const stub = buildStubRebalancer(greenStubState());
  const delivered = [];
  stub.messageRouter = {
    deliver: async (target, request, options) => {
      if (
        request[ReplicaOperationField.REASON] ===
          ReplicaOperationReason.REPLACE_SOURCE_LEADER_HANDOFF
      ) {
        throw new Error('local handler unavailable');
      }
      delivered.push({options, request, target});
      return {status: 'completed'};
    },
  };
  await applyUserTableLeaderPlacementCure(stub, {nowMs: NOW_MS});
  await applyUserTableLeaderPlacementCure(stub, {nowMs: NOW_MS + 1});
  t.equal(delivered.length, 1);
  t.equal(
    delivered[0].request[ReplicaOperationField.REASON],
    ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION,
  );
  t.end();
});

test('system-table partitions are outside the cure fence', async (t) => {
  const state = greenStubState();
  for (const row of state.partitionRows) {
    row.table_id = 'control_plane_publications';
  }
  const stub = buildStubRebalancer(state);
  const decision = await applyUserTableLeaderPlacementCure(
    stub, {nowMs: NOW_MS});
  t.equal(decision, null);
  t.equal(stub.deliveries.length, 0);
  t.end();
});

test('the cure never runs without leadership or stabilization', async (t) => {
  const notLeader = buildStubRebalancer(greenStubState());
  notLeader.isLeader = false;
  t.equal(
    await applyUserTableLeaderPlacementCure(notLeader, {nowMs: NOW_MS}),
    null,
  );
  const unstable = buildStubRebalancer({
    ...greenStubState(),
    stabilized: false,
  });
  t.equal(
    await applyUserTableLeaderPlacementCure(unstable, {nowMs: NOW_MS}),
    null,
  );
  t.end();
});

test('transitional sibling rows are excluded from the census', async (t) => {
  const state = greenStubState();
  state.partitionRows.push({
    leader_node_id: NODE_1,
    partition_id: 'orders-p0',
    state: 'splitting',
    table_id: TABLE_ID,
  });
  const stub = buildStubRebalancer(state);
  const first = await applyUserTableLeaderPlacementCure(
    stub, {nowMs: NOW_MS});
  t.equal(first.census.settledPartitionCount, 2);
  t.end();
});

test('the quiescent cadence pass drives the cure (red-on-revert)', async (t) => {
  const stub = buildStubRebalancer(greenStubState());
  Object.assign(stub, {
    advanceCheckCadence: REBALANCER_PLANNING_GATE_METHODS.advanceCheckCadence,
    currentInterval: 1000,
    increaseCurrentInterval: () => {},
    isControlPlanePriorityPartition: () => false,
    periodicCheckIntervalMs: 60_000,
  });
  await stub.advanceCheckCadence(false);
  await stub.advanceCheckCadence(false);
  t.equal(stub.deliveries.length, 2);
  t.end();
});

test('an open actionable gap holds the quiescent cadence flat; a ' +
  'satisfied spread backs off (red-on-revert)', async (t) => {
  const openGap = buildStubRebalancer(greenStubState());
  let openBackoffCalls = 0;
  Object.assign(openGap, {
    advanceCheckCadence: REBALANCER_PLANNING_GATE_METHODS.advanceCheckCadence,
    currentInterval: 90_000,
    increaseCurrentInterval: () => {
      openBackoffCalls += 1;
    },
    isControlPlanePriorityPartition: () => false,
    periodicCheckIntervalMs: 60_000,
  });
  await openGap.advanceCheckCadence(false);
  t.equal(openGap.currentInterval, 60_000,
    'census-unstable pass resets to the base interval');
  t.equal(openBackoffCalls, 0, 'no backoff while the gap is actionable');

  const satisfied = buildStubRebalancer({
    ...greenStubState(),
    partitionRows: partitionRows().map((row) =>
      row.partition_id === P1 ?
        {...row, leader_node_id: NODE_2} :
        row),
  });
  let satisfiedBackoffCalls = 0;
  Object.assign(satisfied, {
    advanceCheckCadence: REBALANCER_PLANNING_GATE_METHODS.advanceCheckCadence,
    currentInterval: 60_000,
    increaseCurrentInterval: () => {
      satisfiedBackoffCalls += 1;
    },
    isControlPlanePriorityPartition: () => false,
    periodicCheckIntervalMs: 60_000,
  });
  await satisfied.advanceCheckCadence(false);
  t.equal(satisfiedBackoffCalls, 1,
    'a satisfied spread keeps the normal quiescent backoff');
  t.equal(satisfied.deliveries.length, 0);
  t.end();
});

test('gap-actionable classification covers exactly the acting states', (t) => {
  const actionable = [
    USER_TABLE_LEADER_PLACEMENT_CURE_STATE.CENSUS_UNSTABLE,
    USER_TABLE_LEADER_PLACEMENT_CURE_STATE.DISPATCH_HANDOFF,
    USER_TABLE_LEADER_PLACEMENT_CURE_STATE.NO_ELIGIBLE_TARGET,
    USER_TABLE_LEADER_PLACEMENT_CURE_STATE.RETRY_SUPPRESSED,
  ];
  for (const state of actionable) {
    t.equal(isUserTableLeaderCureGapActionable({state}), true, state);
  }
  const passive = [
    USER_TABLE_LEADER_PLACEMENT_CURE_STATE.ANCHOR_RETAINED,
    USER_TABLE_LEADER_PLACEMENT_CURE_STATE.BELOW_MIN_PARTITION_COUNT,
    USER_TABLE_LEADER_PLACEMENT_CURE_STATE.NOT_SURPLUS_HOST,
    USER_TABLE_LEADER_PLACEMENT_CURE_STATE.SPREAD_SATISFIED,
  ];
  for (const state of passive) {
    t.equal(isUserTableLeaderCureGapActionable({state}), false, state);
  }
  t.equal(isUserTableLeaderCureGapActionable(null), false,
    'out-of-scope (null) decisions never hold the cadence');
  t.end();
});

function buildGatedStub(gate, backpressured) {
  const stub = buildStubRebalancer(greenStubState());
  Object.assign(stub, {
    resolveTransportBackpressurePlanningGateDecision: () =>
      backpressured ? {gate: 'transport_backpressure'} : null,
  });
  return {blocker: {decision: {gate}}, stub};
}

test('the priority-spread deferral does not starve the cure', async (t) => {
  const {blocker, stub} =
    buildGatedStub('control_plane_priority_spread', false);
  await evaluateLeaderPlacementCureBehindPrioritySpreadGate(stub, blocker);
  await evaluateLeaderPlacementCureBehindPrioritySpreadGate(stub, blocker);
  t.equal(stub.deliveries.length, 2);
  t.end();
});

test('every other planning gate still blocks the cure', async (t) => {
  const {blocker, stub} = buildGatedStub('stabilization', false);
  await evaluateLeaderPlacementCureBehindPrioritySpreadGate(stub, blocker);
  await evaluateLeaderPlacementCureBehindPrioritySpreadGate(stub, blocker);
  t.equal(stub.deliveries.length, 0);
  t.end();
});

test('transport backpressure still blocks the cure', async (t) => {
  const {blocker, stub} =
    buildGatedStub('control_plane_priority_spread', true);
  await evaluateLeaderPlacementCureBehindPrioritySpreadGate(stub, blocker);
  await evaluateLeaderPlacementCureBehindPrioritySpreadGate(stub, blocker);
  t.equal(stub.deliveries.length, 0);
  t.end();
});
