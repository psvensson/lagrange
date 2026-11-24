import {test} from '../../src/test-helpers/tap.js';
import {
  INITIAL_PARTITION_IDS,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  classifySystemPartition,
} from '../../src/bootstrap/system-partition-classification.js';
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
    usesPriorityRebalanceCadence: () => false,
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
    usesPriorityRebalanceCadence: () => false,
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
    usesPriorityRebalanceCadence: () => false,
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

function buildSystemCohortState() {
  const nodes = [NODE_1, NODE_2, NODE_3];
  const entries = Object.entries(INITIAL_PARTITION_IDS)
    .sort(([, leftId], [, rightId]) => leftId.localeCompare(rightId));
  const sysPartitions = entries.map(([tableId, partitionId]) => ({
    leader_node_id: NODE_1,
    partition_id: partitionId,
    replica_count: 3,
    state: 'normal',
    table_id: tableId,
  }));
  const sysServices = [];
  for (const [, partitionId] of entries) {
    for (const [index, nodeId] of nodes.entries()) {
      sysServices.push({
        node_id: nodeId,
        partition_id: partitionId,
        raft_role: nodeId === NODE_1 ? 'leader' : 'follower',
        service_id: `${partitionId}-r${index + 1}`,
        service_type: 'partition',
        status: 'active',
      });
    }
  }
  return {
    operationRows: [],
    partitionRows: sysPartitions,
    serviceRows: sysServices,
    stabilized: true,
  };
}

function buildSystemPartitionRebalancer(state, partitionId, nodeId = NODE_1) {
  const stub = buildStubRebalancer(state);
  const replicaIndex = [NODE_1, NODE_2, NODE_3].indexOf(nodeId) + 1;
  stub.entityId = partitionId;
  stub.nodeId = nodeId;
  stub.replicaId = `${partitionId}-r${replicaIndex}`;
  stub.getCurrentReplicas = () =>
    state.serviceRows.filter((row) => row.partition_id === partitionId);
  stub.systemTableCache.filter = (tableName, predicate) => {
    const rows = tableName === 'partitions' ?
      state.partitionRows :
      tableName === 'services' ?
        state.serviceRows :
        tableName === 'replica_operations' ?
          state.operationRows :
          [];
    return rows.filter(predicate);
  };
  return stub;
}

function isPriorityOrFormationSystemPartition(partitionId) {
  const classification = classifySystemPartition({partitionId});
  return classification.priorityControlPlane ||
    classification.formationLivenessDependency;
}

async function assertSystemCohortPassOne(t, stubsByPartitionId) {
  let prioritySkippedCount = 0;
  let anchoredOnSeedCount = 0;
  let unstablePassOneCount = 0;
  for (const [partitionId, stub] of stubsByPartitionId.entries()) {
    const first = await applyUserTableLeaderPlacementCure(
      stub, {nowMs: NOW_MS});
    if (isPriorityOrFormationSystemPartition(partitionId)) {
      t.equal(first, null, `${partitionId} stays outside cure fence`);
      prioritySkippedCount += 1;
    } else if (
      first.state === USER_TABLE_LEADER_PLACEMENT_CURE_STATE.ANCHOR_RETAINED
    ) {
      anchoredOnSeedCount += 1;
    } else {
      t.equal(
        first.state,
        USER_TABLE_LEADER_PLACEMENT_CURE_STATE.CENSUS_UNSTABLE,
        `${partitionId} requires two-pass census stability`,
      );
      unstablePassOneCount += 1;
    }
    t.equal(stub.deliveries.length, 0);
  }
  t.equal(prioritySkippedCount, 7);
  t.equal(anchoredOnSeedCount, 13);
  t.equal(unstablePassOneCount, 26);
}

async function assertSystemCohortPassTwoHandoffs(
  t,
  state,
  stubsByPartitionId,
) {
  const handoffTargetsByNode = {[NODE_2]: 0, [NODE_3]: 0};
  const leaderByPartitionId = new Map(
    state.partitionRows.map((row) => [row.partition_id, NODE_1]),
  );
  for (const [partitionId, stub] of stubsByPartitionId.entries()) {
    const second = await applyUserTableLeaderPlacementCure(
      stub, {nowMs: NOW_MS + 1});
    if (second === null) {
      continue;
    }
    if (
      second.state === USER_TABLE_LEADER_PLACEMENT_CURE_STATE.DISPATCH_HANDOFF
    ) {
      handoffTargetsByNode[second.target.nodeId] += 1;
      t.equal(stub.deliveries.length, 2);
      leaderByPartitionId.set(partitionId, second.target.nodeId);
    } else {
      t.equal(
        second.state,
        USER_TABLE_LEADER_PLACEMENT_CURE_STATE.ANCHOR_RETAINED,
      );
      t.equal(stub.deliveries.length, 0);
    }
  }
  t.equal(handoffTargetsByNode[NODE_2], 13);
  t.equal(handoffTargetsByNode[NODE_3], 13);
  return leaderByPartitionId;
}

async function assertSystemCohortPostHandoffQuiescence(
  t,
  state,
  leaderByPartitionId,
) {
  for (const row of state.partitionRows) {
    row.leader_node_id = leaderByPartitionId.get(row.partition_id);
  }
  for (const row of state.serviceRows) {
    const leaderNodeId = leaderByPartitionId.get(row.partition_id);
    row.raft_role = row.node_id === leaderNodeId ? 'leader' : 'follower';
  }
  for (const row of state.partitionRows) {
    if (isPriorityOrFormationSystemPartition(row.partition_id)) {
      continue;
    }
    const leaderNodeId = leaderByPartitionId.get(row.partition_id);
    const settledStub = buildSystemPartitionRebalancer(
      state, row.partition_id, leaderNodeId);
    const passOne = await applyUserTableLeaderPlacementCure(
      settledStub, {nowMs: NOW_MS + 2});
    const passTwo = await applyUserTableLeaderPlacementCure(
      settledStub, {nowMs: NOW_MS + 3});
    t.equal(
      passOne.state,
      USER_TABLE_LEADER_PLACEMENT_CURE_STATE.SPREAD_SATISFIED,
    );
    t.equal(
      passTwo.state,
      USER_TABLE_LEADER_PLACEMENT_CURE_STATE.SPREAD_SATISFIED,
    );
    t.equal(settledStub.deliveries.length, 0);
  }
}

test('46-system-partition cohort deterministically distributes 39 ' +
  'non-priority system partitions 13/13/13 with zero limit cycles while ' +
  'keeping 7 priority/formation partitions untouched', async (t) => {
  const state = buildSystemCohortState();
  t.equal(state.partitionRows.length, 46);

  const metaStub = buildSystemPartitionRebalancer(state, '_meta-p1', NODE_1);
  const metaDecision = await applyUserTableLeaderPlacementCure(
    metaStub, {nowMs: NOW_MS});
  t.equal(
    metaDecision.state,
    USER_TABLE_LEADER_PLACEMENT_CURE_STATE.ANCHOR_RETAINED,
  );
  t.equal(metaStub.deliveries.length, 0);

  const inFlightPartitionId = 'artifact_payloads-p1';
  state.operationRows.push({
    entity_id: inFlightPartitionId,
    operation_id: 'op-inflight-1',
    partition_id: inFlightPartitionId,
    status: 'syncing',
    type: 'GROWTH_PROMOTE',
    workflow_step: 'SYNCING',
  });
  const inFlightStub = buildSystemPartitionRebalancer(
    state, inFlightPartitionId, NODE_1);
  const blockedByOp = await applyUserTableLeaderPlacementCure(
    inFlightStub, {nowMs: NOW_MS});
  t.equal(
    blockedByOp.state,
    USER_TABLE_LEADER_PLACEMENT_CURE_STATE.NO_ELIGIBLE_TARGET,
  );
  t.equal(inFlightStub.deliveries.length, 0);
  state.operationRows.length = 0;

  const stubsByPartitionId = new Map(
    state.partitionRows.map((row) => [
      row.partition_id,
      buildSystemPartitionRebalancer(state, row.partition_id, NODE_1),
    ]),
  );

  await assertSystemCohortPassOne(t, stubsByPartitionId);
  const leaderByPartitionId = await assertSystemCohortPassTwoHandoffs(
    t, state, stubsByPartitionId);
  await assertSystemCohortPostHandoffQuiescence(
    t, state, leaderByPartitionId);
  t.end();
});

test('a non-priority system partition at RF=2 in a 3-node cluster waits ' +
  'until node-3 becomes an active voter before handing off in one hop',
async (t) => {
  const state = buildSystemCohortState();
  const targetPartitionId = 'artifact_payloads-p1';
  for (const row of state.serviceRows) {
    if (isPriorityOrFormationSystemPartition(row.partition_id)) {
      continue;
    }
    if (row.partition_id === targetPartitionId) {
      if (row.node_id === NODE_3) {
        row.raft_role = 'learner';
        row.status = 'syncing';
      }
      continue;
    }
    if (row.node_id !== NODE_1) {
      row.raft_role = 'learner';
      row.status = 'syncing';
    }
  }
  const stub = buildSystemPartitionRebalancer(
    state, targetPartitionId, NODE_1);
  const rf2PassOne = await applyUserTableLeaderPlacementCure(
    stub, {nowMs: NOW_MS});
  const rf2PassTwo = await applyUserTableLeaderPlacementCure(
    stub, {nowMs: NOW_MS + 1});
  t.equal(
    rf2PassOne.state,
    USER_TABLE_LEADER_PLACEMENT_CURE_STATE.NO_ELIGIBLE_TARGET,
  );
  t.equal(
    rf2PassTwo.state,
    USER_TABLE_LEADER_PLACEMENT_CURE_STATE.NO_ELIGIBLE_TARGET,
  );
  t.equal(stub.deliveries.length, 0);

  for (const row of state.serviceRows) {
    if (
      row.partition_id === targetPartitionId &&
      row.node_id === NODE_3
    ) {
      row.raft_role = 'follower';
      row.status = 'active';
    }
  }
  const rf3PassOne = await applyUserTableLeaderPlacementCure(
    stub, {nowMs: NOW_MS + 2});
  t.equal(
    rf3PassOne.state,
    USER_TABLE_LEADER_PLACEMENT_CURE_STATE.CENSUS_UNSTABLE,
  );
  t.equal(stub.deliveries.length, 0);
  const rf3PassTwo = await applyUserTableLeaderPlacementCure(
    stub, {nowMs: NOW_MS + 3});
  t.equal(
    rf3PassTwo.state,
    USER_TABLE_LEADER_PLACEMENT_CURE_STATE.DISPATCH_HANDOFF,
  );
  t.equal(rf3PassTwo.target.nodeId, NODE_2);
  t.equal(stub.deliveries.length, 2);
  t.end();
});
