import {EventEmitter} from 'node:events';
import {test} from '../../src/test-helpers/tap.js';
import {INITIAL_PARTITION_IDS} from '../../src/bootstrap/system-table-schemas-constants.js';
import {classifySystemPartition} from '../../src/bootstrap/system-partition-classification.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {REBALANCE_COORDINATOR_EVENT} from '../../src/rebalancer/rebalancer-constants.js';
import {
  LEADER_HANDOFF_RETRY_AFTER_MS,
  dispatchLeaderHandoff,
} from '../../src/rebalancer/user-table-leader-placement-cure.js';
import {
  MAX_COORDINATOR_CURE_HANDOFFS_PER_PASS,
  launchCoordinatorPartitionLeaderPlacementCure,
  reconcileCoordinatorPartitionLeaderPlacementCure,
} from '../../src/rebalancer/rebalance-coordinator-recovery-helper.js';
import {pendingTurn} from '../../src/raft/raft-rs-turn-answer.js';

const NOW_MS = 2_000_000;
const NODE_1 = 'node-1';
const NODE_2 = 'node-2';
const NODE_3 = 'node-3';

function isPriorityOrFormationSystemPartition(partitionId) {
  const classification = classifySystemPartition({partitionId});
  return classification.priorityControlPlane ||
    classification.formationLivenessDependency;
}

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
        raft_role: nodeId === NODE_1 ? RAFT_ROLE.LEADER : RAFT_ROLE.FOLLOWER,
        service_id: `${partitionId}-r${index + 1}`,
        service_type: 'partition',
        status: 'active',
      })),
    ),
  };
}

function selectNonSeedNonPriorityIds(state, count) {
  const nonPrioritySorted = state.partitionRows
    .map((row) => row.partition_id)
    .filter((id) => id !== '_meta-p1' && !isPriorityOrFormationSystemPartition(id))
    .sort();
  return nonPrioritySorted
    .filter((_, index) => index % 3 !== 0)
    .slice(0, count);
}

function buildCoordinatorFixture(state, partitionIds, options = {}) {
  const emitter = new EventEmitter();
  const admitted = [];
  const attempted = [];
  let nowMs = options.startNowMs ?? NOW_MS;
  const servicesMap = new Map(partitionIds.map((partitionId) => [
    partitionId + '-r1',
    {
      raft: {readStatus: () => ({role: RAFT_ROLE.LEADER, groupId: partitionId,
        replicaIdentity: partitionId + '-r1', term: 3, runtimeGeneration: 1,
        configurationKey: 'test-voters', lifecycleIncarnation: 'test-open', membershipGenerationIndex: 1})},
      requestLeadershipTransfer(request, admitExecution) {
        attempted.push(partitionId);
        return pendingTurn((async () => {
          await coordinator.beforeAdmission(partitionId);
          if (!admitExecution()) return {outcome: 'CORE_REFUSED', reason: 'transfer-placement-withdrawn'};
          admitted.push(partitionId);
          await coordinator.afterAdmission(partitionId, request);
          return {outcome: 'CORE_OK', reason: 'transfer-requested'};
        })());
      },
      isLeader: true,
      isMetadataPublicationReady: () => true,
      isShutdown: false,
      partitionId,
      rebalancer: null,
      replicaId: `${partitionId}-r1`,
      role: RAFT_ROLE.LEADER,
    },
  ]));
  const coordinator = Object.assign(emitter, {
    cdcIntegrationService: {partitionServicesProvider: () => servicesMap},
    admitted, attempted, beforeAdmission: () => {}, afterAdmission: () => {},
    isLeader: true,
    isShuttingDown: false,
    logger: {debug: () => {}, error: () => {}, info: () => {}, warn: () => {}},
    nodeId: NODE_1,
    nowFn: () => {
      nowMs += 1;
      return nowMs;
    },
    advanceNowBy: (deltaMs) => {
      nowMs += deltaMs;
    },
    servicesMap,
    systemTableCache: {
      filter: (tableName, predicate) => {
        const rows = tableName === 'partitions' ?
          state.partitionRows :
          tableName === 'services' ?
            state.serviceRows :
            tableName === 'replica_operations' ? state.operationRows : [];
        return rows.filter(predicate);
      },
      get: (tableName, key) =>
        tableName === 'partitions' ?
          state.partitionRows.find((row) => row.partition_id === key) || null :
          null,
      servicesForPartition: (partitionId) =>
        state.serviceRows.filter((row) => row.partition_id === partitionId),
    },
  });
  return coordinator;
}

test('rotating cursor prevents early failing services from monopolizing the per-pass handoff cap',
  async (t) => {
    const state = buildSystemCohortState();
    const candidateIds = selectNonSeedNonPriorityIds(state, 6);
    const coordinator = buildCoordinatorFixture(state, candidateIds);

    // First two services always fail handoff and remain leaders on node-1.
    const alwaysFailingIds = new Set(candidateIds.slice(0, 2));
    coordinator.afterAdmission = partitionId => {
      if (alwaysFailingIds.has(partitionId)) throw new Error('injected unknown answer');
    };

    // Pass 1 establishes census stability for all 6 partitions.
    const pass1 = await reconcileCoordinatorPartitionLeaderPlacementCure(coordinator);
    t.equal(pass1.dispatchedCount, 0);

    // Pass 2 dispatches candidateIds[0] and candidateIds[1] (both fail).
    const pass2 = await reconcileCoordinatorPartitionLeaderPlacementCure(coordinator);
    t.equal(pass2.dispatchedCount, MAX_COORDINATOR_CURE_HANDOFFS_PER_PASS);
    t.same(coordinator.admitted, candidateIds.slice(0, 2));

    // Advance past retry suppression so candidateIds[0..1] would be eligible again if cursor reset.
    coordinator.advanceNowBy(LEADER_HANDOFF_RETRY_AFTER_MS + 10);
    coordinator.admitted.length = 0;

    // Pass 3 must rotate to candidateIds[2] and candidateIds[3], not re-attempt [0..1].
    const pass3 = await reconcileCoordinatorPartitionLeaderPlacementCure(coordinator);
    t.equal(pass3.dispatchedCount, MAX_COORDINATOR_CURE_HANDOFFS_PER_PASS);
    t.same(coordinator.admitted, candidateIds.slice(2, 4));

    // Pass 4 rotates to candidateIds[4] and candidateIds[5].
    coordinator.advanceNowBy(LEADER_HANDOFF_RETRY_AFTER_MS + 10);
    coordinator.admitted.length = 0;
    const pass4 = await reconcileCoordinatorPartitionLeaderPlacementCure(coordinator);
    t.equal(pass4.dispatchedCount, MAX_COORDINATOR_CURE_HANDOFFS_PER_PASS);
    t.same(coordinator.admitted, candidateIds.slice(4, 6));
    t.end();
  },
);

test('mid-pass coordinator leadership loss stops subsequent handoffs after await',
  async (t) => {
    const state = buildSystemCohortState();
    const candidateIds = selectNonSeedNonPriorityIds(state, 4);
    const coordinator = buildCoordinatorFixture(state, candidateIds);

    await reconcileCoordinatorPartitionLeaderPlacementCure(coordinator);

    coordinator.afterAdmission = partitionId => {
      if (partitionId === candidateIds[0]) coordinator.isLeader = false;
    };

    const pass2 = await reconcileCoordinatorPartitionLeaderPlacementCure(coordinator);
    t.equal(pass2.dispatchedCount, 1, 'stops after candidate 1 when coordinator loses leadership');
    t.equal(pass2.cancelled, true);
    t.same(coordinator.admitted, [candidateIds[0]]);
    t.end();
  },
);

test('mid-pass service role change, service shutdown, and new in-flight operation revalidate before next dispatch',
  async (t) => {
    const state = buildSystemCohortState();
    const candidateIds = selectNonSeedNonPriorityIds(state, 5);
    const coordinator = buildCoordinatorFixture(state, candidateIds);

    await reconcileCoordinatorPartitionLeaderPlacementCure(coordinator);

    coordinator.afterAdmission = partitionId => {
      if (partitionId === candidateIds[0]) {
        // While candidate 0's handoff was pending:
        // - candidate 1 stepped down (role became follower)
        // - candidate 2 shut down
        // - candidate 3 acquired an in-flight replica operation
        coordinator.servicesMap.get(candidateIds[1] + '-r1').role = RAFT_ROLE.FOLLOWER;
        coordinator.servicesMap.get(candidateIds[2] + '-r1').isShutdown = true;
        state.operationRows.push({
          entity_id: candidateIds[3],
          operation_id: `op-${candidateIds[3]}`,
          partition_id: candidateIds[3],
          status: 'syncing',
          type: 'GROWTH_PROMOTE',
          workflow_step: 'SYNCING',
        });
      }
    };

    const pass2 = await reconcileCoordinatorPartitionLeaderPlacementCure(coordinator);
    t.equal(pass2.dispatchedCount, 2);
    t.same(
      coordinator.admitted,
      [candidateIds[0], candidateIds[4]],
      'skips demoted, shut-down, and newly in-flight candidates and dispatches candidate 4',
    );
    t.end();
  },
);

test('shutdown during queued transfer keeps pass custody until the source refuses', async (t) => {
  const state = buildSystemCohortState();
  const ids = selectNonSeedNonPriorityIds(state, 4);
  const coordinator = buildCoordinatorFixture(state, ids);
  await reconcileCoordinatorPartitionLeaderPlacementCure(coordinator);
  const held = Promise.withResolvers();
  coordinator.beforeAdmission = () => held.promise;
  const pass = launchCoordinatorPartitionLeaderPlacementCure(coordinator);
  t.same(coordinator.attempted, [ids[0]]);
  coordinator.isShuttingDown = true;
  coordinator.emit(REBALANCE_COORDINATOR_EVENT.SHUTDOWN);
  t.equal((await pass).cancelled, true);
  t.equal(coordinator.leaderPlacementCureState.inFlight, true);
  held.resolve();
  await coordinator.leaderPlacementCureState.settledPromise;
  t.equal(coordinator.leaderPlacementCureState.inFlight, false);
  t.same(coordinator.attempted, [ids[0]]);
  t.same(coordinator.admitted, []);
  t.end();
});

test('cancelled placement never enters source execution', async (t) => {
  const state = buildSystemCohortState();
  const [id] = selectNonSeedNonPriorityIds(state, 1);
  const coordinator = buildCoordinatorFixture(state, [id]);
  await reconcileCoordinatorPartitionLeaderPlacementCure(coordinator);
  const context = coordinator.servicesMap.get(id + '-r1').userTableLeaderPlacementCureContext;
  await dispatchLeaderHandoff(context, {target: {nodeId: NODE_2, replicaId: id + '-r2'}},
    NOW_MS, {isCancelled: () => true});
  t.same(coordinator.attempted, []);
  t.end();
});

test('a new in-flight operation blocks a queued source transfer', async (t) => {
  const state = buildSystemCohortState();
  const ids = selectNonSeedNonPriorityIds(state, 2);
  const coordinator = buildCoordinatorFixture(state, ids);
  await reconcileCoordinatorPartitionLeaderPlacementCure(coordinator);
  coordinator.beforeAdmission = partitionId => {
    if (partitionId === ids[0]) state.operationRows.push({
      entity_id: partitionId, partition_id: partitionId, operation_id: 'mid-handoff',
      status: 'syncing', type: 'GROWTH_PROMOTE', workflow_step: 'SYNCING',
    });
  };
  await reconcileCoordinatorPartitionLeaderPlacementCure(coordinator);
  t.same(coordinator.attempted, ids);
  t.same(coordinator.admitted, [ids[1]]);
  t.end();
});

test('a target becoming a learner blocks a queued source transfer', async (t) => {
  const state = buildSystemCohortState();
  const ids = selectNonSeedNonPriorityIds(state, 1);
  const coordinator = buildCoordinatorFixture(state, ids);
  await reconcileCoordinatorPartitionLeaderPlacementCure(coordinator);
  coordinator.beforeAdmission = partitionId => {
    for (const row of state.serviceRows) {
      if (row.partition_id === partitionId && row.node_id !== NODE_1) {
        row.raft_role = RAFT_ROLE.LEARNER;
        row.status = 'syncing';
      }
    }
  };
  await reconcileCoordinatorPartitionLeaderPlacementCure(coordinator);
  t.same(coordinator.attempted, ids);
  t.same(coordinator.admitted, []);
  t.end();
});

test('sibling partition transitioning to splitting during first handoff rebuilds pass census ' +
  'and suppresses second candidate as census_unstable',
async (t) => {
  const state = buildSystemCohortState();
  const candidateIds = selectNonSeedNonPriorityIds(state, 4);
  const coordinator = buildCoordinatorFixture(state, candidateIds);

  // Pass 1 establishes stable cohort fingerprint for all candidates.
  const pass1 = await reconcileCoordinatorPartitionLeaderPlacementCure(coordinator);
  t.equal(pass1.dispatchedCount, 0);

  // Pick a sibling settled non-priority partition outside the candidate slice.
  const candidateSet = new Set(candidateIds);
  const siblingRow = state.partitionRows.find(
    (row) =>
      row.partition_id !== '_meta-p1' &&
      !isPriorityOrFormationSystemPartition(row.partition_id) &&
      !candidateSet.has(row.partition_id),
  );
  t.ok(siblingRow, 'found settled sibling partition in cohort');

  coordinator.afterAdmission = partitionId => {
    if (partitionId === candidateIds[0]) siblingRow.state = 'splitting';
  };

  const pass2 = await reconcileCoordinatorPartitionLeaderPlacementCure(coordinator);
  t.equal(
    pass2.dispatchedCount,
    1,
    'only the first candidate dispatches before the rebuilt census sees the splitting sibling',
  );
  t.same(
    coordinator.admitted,
    [candidateIds[0]],
    'subsequent candidates see census_unstable from rebuilt pass census and do not dispatch',
  );
  t.equal(
    coordinator.servicesMap
      .get(candidateIds[1] + '-r1')
      .userTableLeaderPlacementCureContext
      .userTableLeaderPlacementCureState
      .lastLoggedState,
    'census_unstable',
    'candidate 2 recorded census_unstable against the rebuilt pass census',
  );
  t.end();
});
