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
import {
  ReplicaOperationField,
  ReplicaOperationReason,
} from '../../src/rebalancer/replica-operation-constants.js';

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
  const deliveries = [];
  let nowMs = options.startNowMs ?? NOW_MS;
  const servicesMap = new Map(partitionIds.map((partitionId) => [
    partitionId,
    {
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
    deliveries,
    isLeader: true,
    isShuttingDown: false,
    logger: {debug: () => {}, error: () => {}, info: () => {}, warn: () => {}},
    messageRouter: {
      deliver: async (target, request, deliveryOptions) => {
        deliveries.push({options: deliveryOptions, request, target});
        return {status: 'completed'};
      },
    },
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

function targetHandoffPartitionIds(deliveries) {
  return deliveries
    .filter(
      (entry) =>
        entry.request[ReplicaOperationField.REASON] ===
          ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION,
    )
    .map((entry) => entry.request[ReplicaOperationField.PARTITION_ID]);
}

test('rotating cursor prevents early failing services from monopolizing the per-pass handoff cap',
  async (t) => {
    const state = buildSystemCohortState();
    const candidateIds = selectNonSeedNonPriorityIds(state, 6);
    const coordinator = buildCoordinatorFixture(state, candidateIds);

    // First two services always fail handoff and remain leaders on node-1.
    const alwaysFailingIds = new Set(candidateIds.slice(0, 2));
    coordinator.messageRouter.deliver = async (target, request, deliveryOptions) => {
      coordinator.deliveries.push({options: deliveryOptions, request, target});
      if (alwaysFailingIds.has(request[ReplicaOperationField.PARTITION_ID])) {
        throw new Error('simulated slow/failing target');
      }
      return {status: 'completed'};
    };

    // Pass 1 establishes census stability for all 6 partitions.
    const pass1 = await reconcileCoordinatorPartitionLeaderPlacementCure(coordinator);
    t.equal(pass1.dispatchedCount, 0);

    // Pass 2 dispatches candidateIds[0] and candidateIds[1] (both fail).
    const pass2 = await reconcileCoordinatorPartitionLeaderPlacementCure(coordinator);
    t.equal(pass2.dispatchedCount, MAX_COORDINATOR_CURE_HANDOFFS_PER_PASS);
    t.same(targetHandoffPartitionIds(coordinator.deliveries), candidateIds.slice(0, 2));

    // Advance past retry suppression so candidateIds[0..1] would be eligible again if cursor reset.
    coordinator.advanceNowBy(LEADER_HANDOFF_RETRY_AFTER_MS + 10);
    coordinator.deliveries.length = 0;

    // Pass 3 must rotate to candidateIds[2] and candidateIds[3], not re-attempt [0..1].
    const pass3 = await reconcileCoordinatorPartitionLeaderPlacementCure(coordinator);
    t.equal(pass3.dispatchedCount, MAX_COORDINATOR_CURE_HANDOFFS_PER_PASS);
    t.same(targetHandoffPartitionIds(coordinator.deliveries), candidateIds.slice(2, 4));

    // Pass 4 rotates to candidateIds[4] and candidateIds[5].
    coordinator.advanceNowBy(LEADER_HANDOFF_RETRY_AFTER_MS + 10);
    coordinator.deliveries.length = 0;
    const pass4 = await reconcileCoordinatorPartitionLeaderPlacementCure(coordinator);
    t.equal(pass4.dispatchedCount, MAX_COORDINATOR_CURE_HANDOFFS_PER_PASS);
    t.same(targetHandoffPartitionIds(coordinator.deliveries), candidateIds.slice(4, 6));
    t.end();
  },
);

test('mid-pass coordinator leadership loss stops subsequent handoffs after await',
  async (t) => {
    const state = buildSystemCohortState();
    const candidateIds = selectNonSeedNonPriorityIds(state, 4);
    const coordinator = buildCoordinatorFixture(state, candidateIds);

    await reconcileCoordinatorPartitionLeaderPlacementCure(coordinator);

    coordinator.messageRouter.deliver = async (target, request, deliveryOptions) => {
      coordinator.deliveries.push({options: deliveryOptions, request, target});
      if (
        request[ReplicaOperationField.REASON] ===
          ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION &&
        request[ReplicaOperationField.PARTITION_ID] === candidateIds[0]
      ) {
        // Coordinator loses leadership while candidate 1 handoff is in flight.
        coordinator.isLeader = false;
      }
      return {status: 'completed'};
    };

    const pass2 = await reconcileCoordinatorPartitionLeaderPlacementCure(coordinator);
    t.equal(pass2.dispatchedCount, 1, 'stops after candidate 1 when coordinator loses leadership');
    t.equal(pass2.cancelled, true);
    t.same(targetHandoffPartitionIds(coordinator.deliveries), [candidateIds[0]]);
    t.end();
  },
);

test('mid-pass service role change, service shutdown, and new in-flight operation revalidate before next dispatch',
  async (t) => {
    const state = buildSystemCohortState();
    const candidateIds = selectNonSeedNonPriorityIds(state, 5);
    const coordinator = buildCoordinatorFixture(state, candidateIds);

    await reconcileCoordinatorPartitionLeaderPlacementCure(coordinator);

    coordinator.messageRouter.deliver = async (target, request, deliveryOptions) => {
      coordinator.deliveries.push({options: deliveryOptions, request, target});
      if (
        request[ReplicaOperationField.REASON] ===
          ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION &&
        request[ReplicaOperationField.PARTITION_ID] === candidateIds[0]
      ) {
        // While candidate 0's handoff was pending:
        // - candidate 1 stepped down (role became follower)
        // - candidate 2 shut down
        // - candidate 3 acquired an in-flight replica operation
        coordinator.servicesMap.get(candidateIds[1]).role = RAFT_ROLE.FOLLOWER;
        coordinator.servicesMap.get(candidateIds[2]).isShutdown = true;
        state.operationRows.push({
          entity_id: candidateIds[3],
          operation_id: `op-${candidateIds[3]}`,
          partition_id: candidateIds[3],
          status: 'syncing',
          type: 'GROWTH_PROMOTE',
          workflow_step: 'SYNCING',
        });
      }
      return {status: 'completed'};
    };

    const pass2 = await reconcileCoordinatorPartitionLeaderPlacementCure(coordinator);
    t.equal(pass2.dispatchedCount, 2);
    t.same(
      targetHandoffPartitionIds(coordinator.deliveries),
      [candidateIds[0], candidateIds[4]],
      'skips demoted, shut-down, and newly in-flight candidates and dispatches candidate 4',
    );
    t.end();
  },
);

test('coordinator shutdown mid-handoff cancels target leg and retains custody.inFlight until promise settles',
  async (t) => {
    const state = buildSystemCohortState();
    const candidateIds = selectNonSeedNonPriorityIds(state, 4);
    const coordinator = buildCoordinatorFixture(state, candidateIds);

    await reconcileCoordinatorPartitionLeaderPlacementCure(coordinator);

    let resolveDemotion = null;
    coordinator.messageRouter.deliver = (target, request, deliveryOptions) => {
      coordinator.deliveries.push({options: deliveryOptions, request, target});
      if (
        request[ReplicaOperationField.REASON] ===
          ReplicaOperationReason.REPLACE_SOURCE_LEADER_HANDOFF &&
        !resolveDemotion
      ) {
        return new Promise((resolve) => {
          resolveDemotion = () => resolve({status: 'completed'});
        });
      }
      return Promise.resolve({status: 'completed'});
    };

    const passPromise = launchCoordinatorPartitionLeaderPlacementCure(coordinator);
    await Promise.resolve();
    t.equal(typeof resolveDemotion, 'function', 'demotion leg is in flight');
    t.equal(coordinator.leaderPlacementCureState.inFlight, true);

    // Trigger coordinator shutdown mid-demotion.
    coordinator.isShuttingDown = true;
    coordinator.emit(REBALANCE_COORDINATOR_EVENT.SHUTDOWN);

    const passResult = await passPromise;
    t.equal(passResult.cancelled, true);
    t.equal(
      coordinator.leaderPlacementCureState.inFlight,
      true,
      'custody.inFlight remains true while underlying demotion delivery is still pending',
    );

    // Complete the underlying demotion leg; target-side leg must be skipped.
    resolveDemotion();
    await coordinator.leaderPlacementCureState.settledPromise;
    t.equal(
      coordinator.leaderPlacementCureState.inFlight,
      false,
      'custody.inFlight clears only after the underlying handoff promise settles',
    );
    t.same(
      targetHandoffPartitionIds(coordinator.deliveries),
      [],
      'target-side STEP_DOWN_REPLICA leg is skipped after cancellation',
    );
    t.equal(
      coordinator.deliveries.length,
      1,
      'no target leg or second candidate was dispatched after shutdown',
    );
    t.end();
  },
);

test('dispatchLeaderHandoff checks isCancelled before target-side step-down leg',
  async (t) => {
    const deliveries = [];
    let cancelled = false;
    const rebalancer = {
      entityId: 'orders-p2',
      isShuttingDown: false,
      logger: {debug: () => {}, error: () => {}, info: () => {}, warn: () => {}},
      messageRouter: {
        deliver: async (target, request, options) => {
          deliveries.push({options, request, target});
          if (
            request[ReplicaOperationField.REASON] ===
              ReplicaOperationReason.REPLACE_SOURCE_LEADER_HANDOFF
          ) {
            cancelled = true;
          }
          return {status: 'completed'};
        },
      },
      nodeId: NODE_1,
      replicaId: 'orders-p2-r1',
    };
    await dispatchLeaderHandoff(
      rebalancer,
      {target: {nodeId: NODE_2, replicaId: 'orders-p2-r2'}},
      NOW_MS,
      {isCancelled: () => cancelled},
    );
    t.equal(deliveries.length, 1, 'only demotion leg ran before cancellation fired');
    t.equal(
      deliveries[0].request[ReplicaOperationField.REASON],
      ReplicaOperationReason.REPLACE_SOURCE_LEADER_HANDOFF,
    );
    t.end();
  },
);

test('new nonterminal replica operation appearing during awaited source demotion skips target leg',
  async (t) => {
    const state = buildSystemCohortState();
    const candidateIds = selectNonSeedNonPriorityIds(state, 2);
    const coordinator = buildCoordinatorFixture(state, candidateIds);

    await reconcileCoordinatorPartitionLeaderPlacementCure(coordinator);

    coordinator.messageRouter.deliver = async (target, request, deliveryOptions) => {
      coordinator.deliveries.push({options: deliveryOptions, request, target});
      if (
        request[ReplicaOperationField.REASON] ===
          ReplicaOperationReason.REPLACE_SOURCE_LEADER_HANDOFF &&
        request[ReplicaOperationField.PARTITION_ID] === candidateIds[0]
      ) {
        state.operationRows.push({
          entity_id: candidateIds[0],
          operation_id: `op-mid-demote-${candidateIds[0]}`,
          partition_id: candidateIds[0],
          status: 'syncing',
          type: 'GROWTH_PROMOTE',
          workflow_step: 'SYNCING',
        });
      }
      return {status: 'completed'};
    };

    const pass2 = await reconcileCoordinatorPartitionLeaderPlacementCure(coordinator);
    t.equal(pass2.dispatchedCount, 2);
    t.same(
      targetHandoffPartitionIds(coordinator.deliveries),
      [candidateIds[1]],
      'candidate 0 target election leg is skipped when a nonterminal op arrives during demotion',
    );
    const candidate0Deliveries = coordinator.deliveries.filter(
      (entry) => entry.request[ReplicaOperationField.PARTITION_ID] === candidateIds[0],
    );
    t.equal(candidate0Deliveries.length, 1);
    t.equal(
      candidate0Deliveries[0].request[ReplicaOperationField.REASON],
      ReplicaOperationReason.REPLACE_SOURCE_LEADER_HANDOFF,
    );
    t.end();
  },
);

test('target follower demotion to learner during awaited source demotion skips target leg',
  async (t) => {
    const state = buildSystemCohortState();
    const candidateIds = selectNonSeedNonPriorityIds(state, 1);
    const coordinator = buildCoordinatorFixture(state, candidateIds);

    await reconcileCoordinatorPartitionLeaderPlacementCure(coordinator);

    coordinator.messageRouter.deliver = async (target, request, deliveryOptions) => {
      coordinator.deliveries.push({options: deliveryOptions, request, target});
      if (
        request[ReplicaOperationField.REASON] ===
          ReplicaOperationReason.REPLACE_SOURCE_LEADER_HANDOFF
      ) {
        for (const row of state.serviceRows) {
          if (row.partition_id === candidateIds[0] && row.node_id !== NODE_1) {
            row.raft_role = RAFT_ROLE.LEARNER;
            row.status = 'syncing';
          }
        }
      }
      return {status: 'completed'};
    };

    await reconcileCoordinatorPartitionLeaderPlacementCure(coordinator);
    t.same(
      targetHandoffPartitionIds(coordinator.deliveries),
      [],
      'target election leg is skipped when target node is no longer an active voter follower',
    );
    t.end();
  },
);

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

  coordinator.messageRouter.deliver = async (target, request, deliveryOptions) => {
    coordinator.deliveries.push({options: deliveryOptions, request, target});
    if (
      request[ReplicaOperationField.REASON] ===
        ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION &&
      request[ReplicaOperationField.PARTITION_ID] === candidateIds[0]
    ) {
      // Another partition in the settled cohort transitions to splitting mid-pass.
      siblingRow.state = 'splitting';
    }
    return {status: 'completed'};
  };

  const pass2 = await reconcileCoordinatorPartitionLeaderPlacementCure(coordinator);
  t.equal(
    pass2.dispatchedCount,
    1,
    'only the first candidate dispatches before the rebuilt census sees the splitting sibling',
  );
  t.same(
    targetHandoffPartitionIds(coordinator.deliveries),
    [candidateIds[0]],
    'subsequent candidates see census_unstable from rebuilt pass census and do not dispatch',
  );
  t.equal(
    coordinator.servicesMap
      .get(candidateIds[1])
      .userTableLeaderPlacementCureContext
      .userTableLeaderPlacementCureState
      .lastLoggedState,
    'census_unstable',
    'candidate 2 recorded census_unstable against the rebuilt pass census',
  );
  t.end();
});
