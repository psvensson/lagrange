import {test} from '../../src/test-helpers/tap.js';
import {INITIAL_PARTITION_IDS} from '../../src/bootstrap/system-table-schemas-constants.js';
import {classifySystemPartition} from '../../src/bootstrap/system-partition-classification.js';
import {
  LEADER_HANDOFF_RETRY_AFTER_MS,
  USER_TABLE_LEADER_PLACEMENT_CURE_STATE,
  applyUserTableLeaderPlacementCure,
  evaluateLeaderPlacementCureBehindPrioritySpreadGate,
  evaluateSystemTableLeaderPlacementCure,
  evaluateUserTableLeaderPlacementCure,
  isUserTableLeaderCureGapActionable,
} from '../../src/rebalancer/user-table-leader-placement-cure.js';
import {
  MAX_COORDINATOR_CURE_HANDOFFS_PER_PASS,
  checkTimeouts,
  reconcileCoordinatorPartitionLeaderPlacementCure,
  reconcileMessageGroupMembershipDebt,
} from '../../src/rebalancer/rebalance-coordinator-recovery-helper.js';
import {REBALANCER_PLANNING_GATE_METHODS} from '../../src/rebalancer/rebalancer-planning-gate-methods.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationReason,
} from '../../src/rebalancer/replica-operation-constants.js';

const NOW_MS = 1_000_000;
const TABLE_ID = 'orders';
const P1 = 'orders-p1';
const P2 = 'orders-p2';
const NODE_1 = 'node-1';
const NODE_2 = 'node-2';
const NODE_3 = 'node-3';
const NODE_4 = 'node-4';
const NODE_5 = 'node-5';
const S = USER_TABLE_LEADER_PLACEMENT_CURE_STATE;

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
    previousCensusFingerprint: `${P1}|${NODE_1},${P2}|${NODE_1}`,
    settledPartitions: [settledRow(P1, NODE_1), settledRow(P2, NODE_1)],
    ...overrides,
  };
}

test('concentrated leaders with stable census dispatch a handoff', (t) => {
  const decision = evaluateUserTableLeaderPlacementCure(baseEvidence());
  t.equal(decision.state, S.DISPATCH_HANDOFF);
  t.equal(decision.target.nodeId, NODE_2);
  t.equal(decision.target.replicaId, `${P2}-r2`);
  t.equal(decision.census.distinctLeaderHostCount, 1);
  t.equal(decision.census.requiredLeaderHostCount, 2);
  t.end();
});

test('spread at distinct-host capacity is quiescent', (t) => {
  const decision = evaluateUserTableLeaderPlacementCure(baseEvidence({
    settledPartitions: [settledRow(P1, NODE_1), settledRow(P2, NODE_2)],
  }));
  t.equal(decision.state, S.SPREAD_SATISFIED);
  t.end();
});

test('the first co-located partition anchors its host', (t) => {
  const decision = evaluateUserTableLeaderPlacementCure(baseEvidence({partitionId: P1}));
  t.equal(decision.state, S.ANCHOR_RETAINED);
  t.end();
});

test('a changed census defers the dispatch one pass', (t) => {
  const decision = evaluateUserTableLeaderPlacementCure(baseEvidence({
    previousCensusFingerprint: null,
  }));
  t.equal(decision.state, S.CENSUS_UNSTABLE);
  t.end();
});

test('a recent dispatch suppresses the retry', (t) => {
  const decision = evaluateUserTableLeaderPlacementCure(baseEvidence({
    lastDispatchAtMs: NOW_MS - LEADER_HANDOFF_RETRY_AFTER_MS + 1,
  }));
  t.equal(decision.state, S.RETRY_SUPPRESSED);
  t.end();
});

test('a single settled partition never cures', (t) => {
  const decision = evaluateUserTableLeaderPlacementCure(baseEvidence({
    settledPartitions: [settledRow(P1, NODE_1)],
  }));
  t.equal(decision.state, S.BELOW_MIN_PARTITION_COUNT);
  t.end();
});

test('a host holding one leader is never a shed source', (t) => {
  const decision = evaluateUserTableLeaderPlacementCure(baseEvidence({
    partitionId: 'orders-p3',
    previousCensusFingerprint: `${P1}|${NODE_2},${P2}|${NODE_2},orders-p3|${NODE_1}`,
    settledPartitions: [
      settledRow(P1, NODE_2),
      settledRow(P2, NODE_2),
      settledRow('orders-p3', NODE_1),
    ],
  }));
  t.equal(decision.state, S.NOT_SURPLUS_HOST);
  t.end();
});

test('targets are restricted to voter hosts with zero table leaders', (t) => {
  const decision = evaluateUserTableLeaderPlacementCure(baseEvidence({
    ownVoterFollowers: [],
  }));
  t.equal(decision.state, S.NO_ELIGIBLE_TARGET);
  const ownFollowerOnLeaderHost = evaluateUserTableLeaderPlacementCure(
    baseEvidence({ownVoterFollowers: [{nodeId: NODE_1, replicaId: `${P2}-r1`}]}),
  );
  t.equal(ownFollowerOnLeaderHost.state, S.NO_ELIGIBLE_TARGET);
  t.end();
});

function partitionRows() {
  return [
    {leader_node_id: NODE_1, partition_id: P1, state: 'normal', table_id: TABLE_ID},
    {leader_node_id: NODE_1, partition_id: P2, state: 'normal', table_id: TABLE_ID},
  ];
}

function serviceRows() {
  return [P1, P2].flatMap((partitionId) =>
    [NODE_1, NODE_2, NODE_3].map((nodeId, index) => ({
      node_id: nodeId,
      partition_id: partitionId,
      raft_role: nodeId === NODE_1 ? 'leader' : 'follower',
      service_id: `${partitionId}-r${index + 1}`,
      service_type: 'partition',
      status: 'active',
    })),
  );
}

function buildStubRebalancer(state) {
  const deliveries = [];
  return {
    deliveries,
    entityId: P2,
    entityType: 'partition',
    getCurrentReplicas: () =>
      state.serviceRows.filter((row) => row.partition_id === P2),
    isLeader: true,
    isShuttingDown: false,
    isStabilized: () => state.stabilized,
    logger: {debug: () => {}, error: () => {}, info: () => {}, warn: () => {}},
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
            tableName === 'replica_operations' ? state.operationRows || [] : [];
        return rows.filter(predicate);
      },
      get: (tableName, key) =>
        tableName === 'partitions' ?
          state.partitionRows.find((row) => row.partition_id === key) || null :
          null,
      servicesForPartition: (partitionId) =>
        state.serviceRows.filter((row) => row.partition_id === partitionId),
    },
  };
}

function greenStubState() {
  return {partitionRows: partitionRows(), serviceRows: serviceRows(), stabilized: true};
}

test('the orchestrator dispatches after one stable census pass', async (t) => {
  const [F, R, stepDown] = [
    ReplicaOperationField,
    ReplicaOperationReason,
    ReplicaOperationMessageType.STEP_DOWN_REPLICA,
  ];
  const stub = buildStubRebalancer(greenStubState());
  const first = await applyUserTableLeaderPlacementCure(stub, {nowMs: NOW_MS});
  t.equal(first.state, S.CENSUS_UNSTABLE);
  t.equal(stub.deliveries.length, 0);
  const second = await applyUserTableLeaderPlacementCure(stub, {nowMs: NOW_MS + 1});
  t.equal(second.state, S.DISPATCH_HANDOFF);
  t.equal(stub.deliveries.length, 2);
  const [demotion, {request, target, options}] = stub.deliveries;
  t.equal(demotion.target, `${NODE_1}/service/replica-handler`);
  t.equal(demotion.options.targetNodeId, NODE_1);
  t.equal(demotion.request[F.TYPE], stepDown);
  t.equal(demotion.request[F.REASON], R.REPLACE_SOURCE_LEADER_HANDOFF);
  t.equal(demotion.request[F.PARTITION_ID], P2);
  t.equal(demotion.request[F.REPLICA_ID], `${P2}-r1`);
  t.match(demotion.request[F.OPERATION_ID], /^user-table-leader-spread:.*:demote$/u);
  t.equal(target, `${NODE_2}/service/replica-handler`);
  t.equal(options.targetNodeId, NODE_2);
  t.equal(request[F.TYPE], stepDown);
  t.equal(request[F.REASON], R.REPLACE_TARGET_LEADER_ELECTION);
  t.equal(request[F.PARTITION_ID], P2);
  t.equal(request[F.REPLICA_ID], `${P2}-r2`);
  t.match(request[F.OPERATION_ID], /^user-table-leader-spread:/u);
  t.end();
});

test('a missing own replicaId skips the demotion leg but still ' +
  'dispatches the election', async (t) => {
  const stub = buildStubRebalancer(greenStubState());
  delete stub.replicaId;
  await applyUserTableLeaderPlacementCure(stub, {nowMs: NOW_MS});
  await applyUserTableLeaderPlacementCure(stub, {nowMs: NOW_MS + 1});
  t.equal(stub.deliveries.length, 1);
  t.equal(stub.deliveries[0].request[ReplicaOperationField.REASON],
    ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION);
  t.end();
});

test('a failed demotion leg never blocks the election leg', async (t) => {
  const stub = buildStubRebalancer(greenStubState());
  const delivered = [];
  stub.messageRouter = {
    deliver: async (target, request, options) => {
      if (request[ReplicaOperationField.REASON] ===
          ReplicaOperationReason.REPLACE_SOURCE_LEADER_HANDOFF) {
        throw new Error('local handler unavailable');
      }
      delivered.push({options, request, target});
      return {status: 'completed'};
    },
  };
  await applyUserTableLeaderPlacementCure(stub, {nowMs: NOW_MS});
  await applyUserTableLeaderPlacementCure(stub, {nowMs: NOW_MS + 1});
  t.equal(delivered.length, 1);
  t.equal(delivered[0].request[ReplicaOperationField.REASON],
    ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION);
  t.end();
});

test('system-table partitions are outside the cure fence', async (t) => {
  const state = greenStubState();
  for (const row of state.partitionRows) {
    row.table_id = 'control_plane_publications';
  }
  const stub = buildStubRebalancer(state);
  const decision = await applyUserTableLeaderPlacementCure(stub, {nowMs: NOW_MS});
  t.equal(decision, null);
  t.equal(stub.deliveries.length, 0);
  t.end();
});

test('the cure never runs without leadership or stabilization', async (t) => {
  const notLeader = buildStubRebalancer(greenStubState());
  notLeader.isLeader = false;
  t.equal(await applyUserTableLeaderPlacementCure(notLeader, {nowMs: NOW_MS}), null);
  const unstable = buildStubRebalancer({...greenStubState(), stabilized: false});
  t.equal(await applyUserTableLeaderPlacementCure(unstable, {nowMs: NOW_MS}), null);
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
  const first = await applyUserTableLeaderPlacementCure(stub, {nowMs: NOW_MS});
  t.equal(first.census.settledPartitionCount, 2);
  t.end();
});

function wireCadenceMethods(stub, currentInterval, onIncrease = () => {}) {
  return Object.assign(stub, {
    advanceCheckCadence: REBALANCER_PLANNING_GATE_METHODS.advanceCheckCadence,
    currentInterval,
    increaseCurrentInterval: onIncrease,
    isControlPlanePriorityPartition: () => false,
    periodicCheckIntervalMs: 60_000,
    usesPriorityRebalanceCadence: () => false,
  });
}

test('the quiescent cadence pass drives the cure (red-on-revert)', async (t) => {
  const stub = wireCadenceMethods(buildStubRebalancer(greenStubState()), 1000);
  await stub.advanceCheckCadence(false);
  await stub.advanceCheckCadence(false);
  t.equal(stub.deliveries.length, 2);
  t.end();
});

test('an open actionable gap holds the quiescent cadence flat; a ' +
  'satisfied spread backs off (red-on-revert)', async (t) => {
  let openBackoffCalls = 0;
  const openGap = wireCadenceMethods(
    buildStubRebalancer(greenStubState()),
    90_000,
    () => {
      openBackoffCalls += 1;
    },
  );
  await openGap.advanceCheckCadence(false);
  t.equal(openGap.currentInterval, 60_000);
  t.equal(openBackoffCalls, 0);

  let satisfiedBackoffCalls = 0;
  const satisfied = wireCadenceMethods(
    buildStubRebalancer({
      ...greenStubState(),
      partitionRows: partitionRows().map((row) =>
        row.partition_id === P1 ? {...row, leader_node_id: NODE_2} : row),
    }),
    60_000,
    () => {
      satisfiedBackoffCalls += 1;
    },
  );
  await satisfied.advanceCheckCadence(false);
  t.equal(satisfiedBackoffCalls, 1);
  t.equal(satisfied.deliveries.length, 0);
  t.end();
});

test('gap-actionable classification covers exactly the acting states', (t) => {
  for (const state of [
    S.CENSUS_UNSTABLE,
    S.DISPATCH_HANDOFF,
    S.NO_ELIGIBLE_TARGET,
    S.RETRY_SUPPRESSED,
  ]) {
    t.equal(isUserTableLeaderCureGapActionable({state}), true, state);
  }
  for (const state of [
    S.ANCHOR_RETAINED,
    S.BELOW_MIN_PARTITION_COUNT,
    S.NOT_SURPLUS_HOST,
    S.SPREAD_SATISFIED,
  ]) {
    t.equal(isUserTableLeaderCureGapActionable({state}), false, state);
  }
  t.equal(isUserTableLeaderCureGapActionable(null), false);
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
  const {blocker, stub} = buildGatedStub('control_plane_priority_spread', false);
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
  const {blocker, stub} = buildGatedStub('control_plane_priority_spread', true);
  await evaluateLeaderPlacementCureBehindPrioritySpreadGate(stub, blocker);
  await evaluateLeaderPlacementCureBehindPrioritySpreadGate(stub, blocker);
  t.equal(stub.deliveries.length, 0);
  t.end();
});

function buildSystemCohortState() {
  const entries = Object.entries(INITIAL_PARTITION_IDS)
    .sort(([, leftId], [, rightId]) => leftId.localeCompare(rightId));
  return {
    operationRows: [],
    partitionRows: entries.map(([tableId, partitionId]) => ({
      leader_node_id: NODE_1,
      partition_id: partitionId,
      replica_count: 3,
      state: 'normal',
      table_id: tableId,
    })),
    serviceRows: entries.flatMap(([, partitionId]) =>
      [NODE_1, NODE_2, NODE_3].map((nodeId, index) => ({
        node_id: nodeId,
        partition_id: partitionId,
        raft_role: nodeId === NODE_1 ? 'leader' : 'follower',
        service_id: `${partitionId}-r${index + 1}`,
        service_type: 'partition',
        status: 'active',
      })),
    ),
    stabilized: true,
  };
}

function buildSystemPartitionRebalancer(state, partitionId, nodeId = NODE_1) {
  const stub = buildStubRebalancer(state);
  const replicaIndex =
    [NODE_1, NODE_2, NODE_3, NODE_4, NODE_5].indexOf(nodeId) + 1;
  stub.entityId = partitionId;
  stub.nodeId = nodeId;
  stub.replicaId = `${partitionId}-r${replicaIndex}`;
  stub.getCurrentReplicas = () =>
    state.serviceRows.filter((row) => row.partition_id === partitionId);
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
    const first = await applyUserTableLeaderPlacementCure(stub, {nowMs: NOW_MS});
    if (isPriorityOrFormationSystemPartition(partitionId)) {
      t.equal(first, null);
      prioritySkippedCount += 1;
    } else if (first.state === S.ANCHOR_RETAINED) {
      anchoredOnSeedCount += 1;
    } else {
      t.equal(first.state, S.CENSUS_UNSTABLE);
      unstablePassOneCount += 1;
    }
    t.equal(stub.deliveries.length, 0);
  }
  t.equal(prioritySkippedCount, 7);
  t.equal(anchoredOnSeedCount, 13);
  t.equal(unstablePassOneCount, 26);
}

async function assertSystemCohortPassTwoHandoffs(t, state, stubsByPartitionId) {
  const handoffTargetsByNode = {[NODE_2]: 0, [NODE_3]: 0};
  const leaderByPartitionId = new Map(
    state.partitionRows.map((row) => [row.partition_id, NODE_1]),
  );
  for (const [partitionId, stub] of stubsByPartitionId.entries()) {
    const second = await applyUserTableLeaderPlacementCure(stub, {nowMs: NOW_MS + 1});
    if (second === null) continue;
    if (second.state === S.DISPATCH_HANDOFF) {
      handoffTargetsByNode[second.target.nodeId] += 1;
      t.equal(stub.deliveries.length, 2);
      leaderByPartitionId.set(partitionId, second.target.nodeId);
    } else {
      t.equal(second.state, S.ANCHOR_RETAINED);
      t.equal(stub.deliveries.length, 0);
    }
  }
  t.equal(handoffTargetsByNode[NODE_2], 13);
  t.equal(handoffTargetsByNode[NODE_3], 13);
  return leaderByPartitionId;
}

async function assertSystemCohortPostHandoffQuiescence(t, state, leaderByPartitionId) {
  for (const row of state.partitionRows) {
    row.leader_node_id = leaderByPartitionId.get(row.partition_id);
  }
  for (const row of state.serviceRows) {
    const leaderNodeId = leaderByPartitionId.get(row.partition_id);
    row.raft_role = row.node_id === leaderNodeId ? 'leader' : 'follower';
  }
  for (const row of state.partitionRows) {
    if (isPriorityOrFormationSystemPartition(row.partition_id)) continue;
    const settledStub = buildSystemPartitionRebalancer(
      state,
      row.partition_id,
      leaderByPartitionId.get(row.partition_id),
    );
    const passOne = await applyUserTableLeaderPlacementCure(settledStub, {nowMs: NOW_MS + 2});
    const passTwo = await applyUserTableLeaderPlacementCure(settledStub, {nowMs: NOW_MS + 3});
    t.equal(passOne.state, S.SPREAD_SATISFIED);
    t.equal(passTwo.state, S.SPREAD_SATISFIED);
    t.equal(settledStub.deliveries.length, 0);
  }
}

test('46-system-partition cohort deterministically distributes 39 ' +
  'non-priority system partitions 13/13/13 with zero limit cycles while ' +
  'keeping 7 priority/formation partitions untouched', async (t) => {
  const state = buildSystemCohortState();
  t.equal(state.partitionRows.length, 46);
  const metaStub = buildSystemPartitionRebalancer(state, '_meta-p1', NODE_1);
  const metaDecision = await applyUserTableLeaderPlacementCure(metaStub, {nowMs: NOW_MS});
  t.equal(metaDecision.state, S.ANCHOR_RETAINED);
  t.equal(metaStub.deliveries.length, 0);

  const inFlightPartitionId = 'artifact_payloads-p1';
  state.operationRows.push({
    entity_id: inFlightPartitionId,
    operation_id: `op-${inFlightPartitionId}`,
    partition_id: inFlightPartitionId,
    status: 'syncing',
    type: 'GROWTH_PROMOTE',
    workflow_step: 'SYNCING',
  });
  const inFlightStub = buildSystemPartitionRebalancer(state, inFlightPartitionId, NODE_1);
  const blockedByOwnOp = await applyUserTableLeaderPlacementCure(inFlightStub, {nowMs: NOW_MS});
  t.equal(blockedByOwnOp.state, S.NO_ELIGIBLE_TARGET);
  t.equal(inFlightStub.deliveries.length, 0);
  state.operationRows.length = 0;

  state.operationRows.push({
    entity_id: 'sql_transactions-p1',
    operation_id: 'op-sql_transactions-p1',
    partition_id: 'sql_transactions-p1',
    status: 'syncing',
    type: 'GROWTH_PROMOTE',
    workflow_step: 'SYNCING',
  });
  const settledStub = buildSystemPartitionRebalancer(state, inFlightPartitionId, NODE_1);
  const passOneWithUnrelatedPriorityOp = await applyUserTableLeaderPlacementCure(
    settledStub,
    {nowMs: NOW_MS},
  );
  const passTwoWithUnrelatedPriorityOp = await applyUserTableLeaderPlacementCure(
    settledStub,
    {nowMs: NOW_MS + 1},
  );
  t.equal(passOneWithUnrelatedPriorityOp.state, S.CENSUS_UNSTABLE);
  t.equal(passTwoWithUnrelatedPriorityOp.state, S.DISPATCH_HANDOFF);
  t.equal(settledStub.deliveries.length, 2);
  state.operationRows.length = 0;

  const stubsByPartitionId = new Map(state.partitionRows.map((row) => [
    row.partition_id,
    buildSystemPartitionRebalancer(state, row.partition_id, NODE_1),
  ]));
  await assertSystemCohortPassOne(t, stubsByPartitionId);
  const leaderByPartitionId = await assertSystemCohortPassTwoHandoffs(t, state, stubsByPartitionId);
  await assertSystemCohortPostHandoffQuiescence(t, state, leaderByPartitionId);
  t.end();
});

test('a non-priority system partition at RF=2 in a 3-node cluster waits ' +
  'until node-3 becomes an active voter before handing off in one hop',
async (t) => {
  const state = buildSystemCohortState();
  const targetPartitionId = 'artifact_payloads-p1';
  for (const row of state.serviceRows) {
    if (isPriorityOrFormationSystemPartition(row.partition_id)) continue;
    const shouldDemoteToLearner = row.partition_id === targetPartitionId ?
      row.node_id === NODE_3 :
      row.node_id !== NODE_1;
    if (shouldDemoteToLearner) {
      row.raft_role = 'learner';
      row.status = 'syncing';
    }
  }
  const stub = buildSystemPartitionRebalancer(state, targetPartitionId, NODE_1);
  const rf2PassOne = await applyUserTableLeaderPlacementCure(stub, {nowMs: NOW_MS});
  const rf2PassTwo = await applyUserTableLeaderPlacementCure(stub, {nowMs: NOW_MS + 1});
  t.equal(rf2PassOne.state, S.NO_ELIGIBLE_TARGET);
  t.equal(rf2PassTwo.state, S.NO_ELIGIBLE_TARGET);
  t.equal(stub.deliveries.length, 0);

  for (const row of state.serviceRows) {
    if (row.partition_id === targetPartitionId && row.node_id === NODE_3) {
      row.raft_role = 'follower';
      row.status = 'active';
    }
  }
  const rf3PassOne = await applyUserTableLeaderPlacementCure(stub, {nowMs: NOW_MS + 2});
  t.equal(rf3PassOne.state, S.CENSUS_UNSTABLE);
  t.equal(stub.deliveries.length, 0);
  const rf3PassTwo = await applyUserTableLeaderPlacementCure(stub, {nowMs: NOW_MS + 3});
  t.equal(rf3PassTwo.state, S.DISPATCH_HANDOFF);
  t.equal(rf3PassTwo.target.nodeId, NODE_2);
  t.equal(stub.deliveries.length, 2);
  t.end();
});

test('cohort identity change requires fresh two-pass stability before ' +
  'handoff dispatch', (t) => {
  const baseCohortEvidence = {
    eligibleVoterHosts: new Set([NODE_1, NODE_2, NODE_3]),
    hasInFlightReplicaOperation: false,
    lastDispatchAtMs: null,
    nodeId: NODE_1,
    nowMs: NOW_MS,
    ownVoterFollowers: [
      {nodeId: NODE_2, replicaId: 'sys_b-p1-r2'},
      {nodeId: NODE_3, replicaId: 'sys_b-p1-r3'},
    ],
    partitionId: 'sys_b-p1',
    previousCensusFingerprint: null,
    settledPartitions: [settledRow('sys_a-p1', NODE_1), settledRow('sys_b-p1', NODE_1)],
    targetReplicaCount: 3,
  };
  const pass1 = evaluateSystemTableLeaderPlacementCure(baseCohortEvidence);
  t.equal(pass1.state, S.CENSUS_UNSTABLE);

  const shiftedCohort = [
    settledRow('sys_0-p1', NODE_1),
    settledRow('sys_a-p1', NODE_1),
    settledRow('sys_b-p1', NODE_1),
  ];
  const pass2 = evaluateSystemTableLeaderPlacementCure({
    ...baseCohortEvidence,
    nowMs: NOW_MS + 1,
    previousCensusFingerprint: pass1.census.fingerprint,
    settledPartitions: shiftedCohort,
  });
  t.equal(pass2.state, S.CENSUS_UNSTABLE);
  const pass3 = evaluateSystemTableLeaderPlacementCure({
    ...baseCohortEvidence,
    nowMs: NOW_MS + 2,
    previousCensusFingerprint: pass2.census.fingerprint,
    settledPartitions: shiftedCohort,
  });
  t.equal(pass3.state, S.DISPATCH_HANDOFF);
  t.equal(pass3.target.nodeId, NODE_3);
  t.end();
});

test('5-host cluster with RF=3 qualifies once partition reaches 3 active ' +
  'voters', async (t) => {
  const pAnchor = 'artifact_payloads-p1';
  const pTarget = 'code-p1';
  const mkService = (partitionId, nodeId, idx) => ({
    node_id: nodeId,
    partition_id: partitionId,
    raft_role: nodeId === NODE_1 ? 'leader' : 'follower',
    service_id: `${partitionId}-r${idx + 1}`,
    service_type: 'partition',
    status: 'active',
  });
  const state = {
    operationRows: [],
    partitionRows: [
      {leader_node_id: NODE_1, partition_id: pAnchor, replica_count: 3, state: 'normal', table_id: 'artifact_payloads'},
      {leader_node_id: NODE_1, partition_id: pTarget, replica_count: 3, state: 'normal', table_id: 'code'},
    ],
    serviceRows: [
      ...[NODE_1, NODE_2, NODE_3].map((n, idx) => mkService(pAnchor, n, idx)),
      ...[NODE_1, NODE_4, NODE_5].map((n, idx) => mkService(pTarget, n, idx)),
    ],
    stabilized: true,
  };
  const stub = buildSystemPartitionRebalancer(state, pTarget, NODE_1);
  const pass1 = await applyUserTableLeaderPlacementCure(stub, {nowMs: NOW_MS});
  t.equal(pass1.census.eligibleVoterHostCount, 5);
  t.equal(pass1.census.requiredActiveVoterCount, 3);
  t.equal(pass1.state, S.CENSUS_UNSTABLE);
  const pass2 = await applyUserTableLeaderPlacementCure(stub, {nowMs: NOW_MS + 1});
  t.equal(pass2.state, S.DISPATCH_HANDOFF);
  t.equal(pass2.target.nodeId, NODE_4);
  t.equal(stub.deliveries.length, 2);
  t.end();
});

function buildCoordinatorCureFixture(state, partitionIds) {
  const baseStub = buildStubRebalancer(state);
  const filterCounts = {partitions: 0, replica_operations: 0, services: 0};
  let servicesForPartitionCalls = 0;
  let nowMs = NOW_MS;
  const servicesMap = new Map(partitionIds.map((partitionId) => [
    partitionId,
    {
      isLeader: true,
      isMetadataPublicationReady: () => true,
      isShutdown: false,
      partitionId,
      rebalancer: null,
      replicaId: `${partitionId}-r1`,
    },
  ]));
  return {
    ...baseStub,
    cdcIntegrationService: {partitionServicesProvider: () => servicesMap},
    filterCounts,
    get servicesForPartitionCalls() {
      return servicesForPartitionCalls;
    },
    nowFn: () => {
      nowMs += 1;
      return nowMs;
    },
    systemTableCache: {
      ...baseStub.systemTableCache,
      filter: (tableName, predicate) => {
        filterCounts[tableName] = (filterCounts[tableName] || 0) + 1;
        return baseStub.systemTableCache.filter(tableName, predicate);
      },
      servicesForPartition: (partitionId) => {
        servicesForPartitionCalls += 1;
        return baseStub.systemTableCache.servicesForPartition(partitionId);
      },
    },
    workflowOwner: {
      checkTimeouts: async () => 'timeouts-checked',
      reconcileMessageGroupMembershipDebt: async () => ({available: true, found: 0}),
    },
  };
}

function selectNonPrioritySystemIds(state, count) {
  return state.partitionRows
    .map((row) => row.partition_id)
    .filter((id) => id !== '_meta-p1' && !isPriorityOrFormationSystemPartition(id))
    .slice(0, count);
}

test('coordinator pass bounds active handoffs per pass and uses ' +
  'servicesForPartition without full SERVICES scans', async (t) => {
  const state = buildSystemCohortState();
  const coordinator = buildCoordinatorCureFixture(
    state,
    selectNonPrioritySystemIds(state, 15),
  );
  const pass1 = await reconcileCoordinatorPartitionLeaderPlacementCure(coordinator);
  t.equal(pass1.dispatchedCount, 0);
  t.equal(coordinator.filterCounts.services, 0);
  t.equal(coordinator.filterCounts.partitions, 1);
  t.equal(coordinator.filterCounts.replica_operations, 1);
  t.ok(coordinator.servicesForPartitionCalls > 0);

  const pass2 = await reconcileCoordinatorPartitionLeaderPlacementCure(coordinator);
  t.equal(pass2.dispatchedCount, MAX_COORDINATOR_CURE_HANDOFFS_PER_PASS);
  const targetHandoffsPass2 = coordinator.deliveries.filter(
    (entry) =>
      entry.request[ReplicaOperationField.REASON] ===
        ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION,
  );
  t.equal(targetHandoffsPass2.length, MAX_COORDINATOR_CURE_HANDOFFS_PER_PASS);
  t.equal(coordinator.filterCounts.services, 0);
  t.equal(coordinator.filterCounts.partitions, 2);
  t.equal(
    coordinator.filterCounts.replica_operations,
    3,
    'one scan per pass plus one post-handoff freshness revalidation before candidate 2',
  );
  t.end();
});

test('a held STEP_DOWN_REPLICA handoff never blocks subsequent recovery ' +
  'sweeps', async (t) => {
  const state = buildSystemCohortState();
  const coordinator = buildCoordinatorCureFixture(
    state,
    selectNonPrioritySystemIds(state, 6),
  );
  let releaseHeldHandoff = null;
  coordinator.messageRouter.deliver = (target, request, options) => {
    coordinator.deliveries.push({options, request, target});
    if (
      request[ReplicaOperationField.REASON] ===
        ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION &&
      !releaseHeldHandoff
    ) {
      return new Promise((resolve) => {
        releaseHeldHandoff = () => resolve({status: 'completed'});
      });
    }
    return Promise.resolve({status: 'completed'});
  };

  await reconcileMessageGroupMembershipDebt(coordinator);
  t.equal(coordinator.leaderPlacementCureState.inFlight, false);

  await reconcileMessageGroupMembershipDebt(coordinator);
  await Promise.resolve();
  await Promise.resolve();
  t.equal(coordinator.leaderPlacementCureState.inFlight, true);
  t.equal(typeof releaseHeldHandoff, 'function');
  const deliveriesWhileHeld = coordinator.deliveries.length;

  let debtSweepsWhileHeld = 0;
  let timeoutSweepsWhileHeld = 0;
  coordinator.workflowOwner.reconcileMessageGroupMembershipDebt = async () => {
    debtSweepsWhileHeld += 1;
    return {available: true, found: 0};
  };
  coordinator.workflowOwner.checkTimeouts = async () => {
    timeoutSweepsWhileHeld += 1;
    return 'ok';
  };
  await checkTimeouts(coordinator);
  await reconcileMessageGroupMembershipDebt(coordinator);
  await checkTimeouts(coordinator);
  await reconcileMessageGroupMembershipDebt(coordinator);
  t.equal(timeoutSweepsWhileHeld, 2);
  t.equal(debtSweepsWhileHeld, 2);
  t.equal(coordinator.deliveries.length, deliveriesWhileHeld);

  releaseHeldHandoff();
  await coordinator.leaderPlacementCureSweepPromise;
  t.equal(coordinator.leaderPlacementCureState.inFlight, false);
  t.end();
});
