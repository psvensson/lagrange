/**
 * Quest provisioning-admission-ledger-hold-transient-wait (run-24 head).
 *
 * Run-24: the MovieLens demo's FIRST CREATE TABLE arrived ~6s after
 * formation, while the run-20 operation-ledger self-move hold was
 * legitimately engaged (ledger replicas spreading off the seed). EVERY
 * target node was deferred with the transient reason
 * operation_ledger_self_move_in_flight, so provisionable=0 — and the create
 * failed the CLIENT after only the short target-node convergence window
 * (1s default / 10s adaptive), even though the governing client-facing
 * provisioning budget (TABLE_CREATE_PROVISION_TIMEOUT_MS = 30s) had ~24s
 * left and the hold clears in seconds. Internal pacing must not rely on
 * client fidelity (ARCH-0016: load may slow the system, not break it).
 *
 * The contract under test: when the convergence wait expires with ZERO
 * provisionable targets and EVERY rejection is a transient ledger-hold
 * reason, provisioning keeps waiting the hold out under the EXISTING
 * provisioning budget (no raised timeouts — honest budget attribution);
 * a hold that never clears still fails within that budget, and a
 * non-transient whole-cluster rejection still fails fast.
 */

import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  applyRebalanceCoordinatorLedgerInterlockAdmissionMethods,
} from '../../src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js';
import {TABLES} from '../../src/constants/index.js';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

import {createMockMessageRouter} from './sql-query-engine-test-support.js';

const LEDGER_HOLD_REJECTION = Object.freeze({
  allowed: false,
  decisionType: 'deferred',
  admissionResult: {
    allowed: false,
    decisionType: 'deferred',
    blockingReasons: ['operation_ledger_self_move_in_flight'],
  },
});

function createClusterFixture({nodeIds}) {
  const nodes = nodeIds.map((nodeId) => ({node_id: nodeId, status: 'active'}));
  const services = [];
  const cache = {
    onCacheChange() {},
    offCacheChange() {},
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      if (type === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };
  return {nodes, services, cache};
}

function createHoldingRebalanceCoordinator({
  isHoldEngaged,
  createdTargetNodeIds,
  services,
  localNodeId,
  rejection = LEDGER_HOLD_REJECTION,
}) {
  return {
    async checkProvisioningAdmission() {
      if (isHoldEngaged()) {
        return rejection;
      }
      return {
        allowed: true,
        decisionType: 'admitted',
        admissionResult: {allowed: true, decisionType: 'admitted'},
      };
    },
    async createOperation(move) {
      createdTargetNodeIds.push(move.nodeId);
      return {operationId: `op-${move.nodeId}`, ...move};
    },
    async executeOperation(operation) {
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      services.push({
        service_id:
          operation.replicaId || `${operation.partitionId}-${targetNodeId}`,
        replica_id:
          operation.replicaId || `${operation.partitionId}-${targetNodeId}`,
        partition_id: operation.partitionId,
        service_type: 'partition',
        status: 'active',
        node_id: targetNodeId,
        raft_role: targetNodeId === localNodeId ? 'leader' : 'follower',
        address: `${targetNodeId}/partition/${operation.partitionId}`,
      });
      return {success: true};
    },
  };
}

function createEngineFixture(t, {rebalanceCoordinator, cache, localNodeId}) {
  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    // Compressed real geometry: convergence window << provisioning budget.
    tablePartitionProvisioningTimeoutMs: 400,
    tablePartitionProvisioningPollIntervalMs: 1,
    tablePartitionTargetNodeConvergenceTimeoutMs: 10,
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};
  return engine;
}

test('run-24: CREATE TABLE survives a whole-cluster transient ' +
  'operation-ledger hold that outlasts the convergence window but clears ' +
  'inside the provisioning budget (RED on the unfixed head)', async (t) => {
  const partitionId = 'tbl-run24-ledger-hold-p1';
  const localNodeId = 'node-a';
  const createdTargetNodeIds = [];
  const {services, cache} = createClusterFixture({
    nodeIds: ['node-a', 'node-b', 'node-c'],
  });

  // The hold clears only after MANY sleep ticks — far past the 10ms
  // convergence window at 1ms polls, well inside the 400ms budget.
  let sleepCalls = 0;
  const rebalanceCoordinator = createHoldingRebalanceCoordinator({
    isHoldEngaged: () => sleepCalls < 40,
    createdTargetNodeIds,
    services,
    localNodeId,
  });
  const engine = createEngineFixture(t, {
    rebalanceCoordinator,
    cache,
    localNodeId,
  });
  engine.sleep = async () => {
    sleepCalls += 1;
  };

  // The REAL CREATE TABLE geometry (table-creation-service): a defaulted
  // QUORUM minimum below the target count — the shape that skipped the
  // convergence wait entirely in run-24 (enforceEveryProvisioningOperation
  // false), so the create fail-fasted in one admission pass.
  await engine.provisionInitialTablePartition({
    partitionId,
    replicaCount: 3,
    minimumRoutableReplicaCount: 2,
    minimumRoutableReplicaCountWasDefaulted: true,
  });

  t.ok(
    sleepCalls >= 40,
    'provisioning waited out the whole-cluster transient hold internally ' +
      `(${sleepCalls} polls)`,
  );
  t.same(
    createdTargetNodeIds.sort(),
    ['node-a', 'node-b', 'node-c'],
    'all three replicas provisioned once the ledger hold cleared — the ' +
      'client never saw the transient',
  );
});

test('control: a transient hold that NEVER clears still fails within the ' +
  'provisioning budget (bounded — no livelock)', async (t) => {
  const partitionId = 'tbl-run24-hold-never-clears-p1';
  const localNodeId = 'node-a';
  const createdTargetNodeIds = [];
  const {services, cache} = createClusterFixture({
    nodeIds: ['node-a', 'node-b', 'node-c'],
  });
  const rebalanceCoordinator = createHoldingRebalanceCoordinator({
    isHoldEngaged: () => true,
    createdTargetNodeIds,
    services,
    localNodeId,
  });
  const engine = createEngineFixture(t, {
    rebalanceCoordinator,
    cache,
    localNodeId,
  });

  await t.rejects(
    engine.provisionInitialTablePartition({
      partitionId,
      replicaCount: 3,
      minimumRoutableReplicaCount: 2,
      minimumRoutableReplicaCountWasDefaulted: true,
    }),
    /minimum routable provisioning cohort/,
    'an unclearable hold still surfaces the canonical typed failure',
  );
  t.same(createdTargetNodeIds, [], 'nothing was planned under the hold');
});

test('control: a NON-transient whole-cluster rejection fails fast without ' +
  'consuming the transient-hold wait', async (t) => {
  const partitionId = 'tbl-run24-hard-rejection-p1';
  const localNodeId = 'node-a';
  const createdTargetNodeIds = [];
  const {services, cache} = createClusterFixture({
    nodeIds: ['node-a', 'node-b', 'node-c'],
  });
  let sleepCalls = 0;
  const rebalanceCoordinator = createHoldingRebalanceCoordinator({
    isHoldEngaged: () => true,
    createdTargetNodeIds,
    services,
    localNodeId,
    rejection: {
      allowed: false,
      decisionType: 'blocked',
      admissionResult: {
        allowed: false,
        decisionType: 'blocked',
        blockingReasons: ['replica_already_present'],
      },
    },
  });
  const engine = createEngineFixture(t, {
    rebalanceCoordinator,
    cache,
    localNodeId,
  });
  const originalSleep = engine.sleep.bind(engine);
  engine.sleep = async (ms) => {
    sleepCalls += 1;
    return originalSleep(ms);
  };

  await t.rejects(
    engine.provisionInitialTablePartition({
      partitionId,
      replicaCount: 3,
      minimumRoutableReplicaCount: 2,
      minimumRoutableReplicaCountWasDefaulted: true,
    }),
    /minimum routable provisioning cohort/,
    'a hard rejection surfaces the canonical typed failure',
  );
  t.ok(
    sleepCalls < 40,
    'no extended transient-hold wait was consumed for a hard rejection ' +
      `(${sleepCalls} polls)`,
  );
});

test('forensic honesty: the interlock blocking message embeds the HELD ' +
  'ledger partition, not the admitted operation\'s partition (run-24 ' +
  'mislabel)', async (t) => {
  class InterlockFixture {
    normalizeMoveType(type) {
      return type;
    }
    isEmergencyPriorityControlPlanePartition() {
      return false;
    }
    isOperationTerminal() {
      return false;
    }
    async queryOperationById(operationId) {
      // The held ledger self-move is still live: the hold cannot clear.
      return {operationId, status: 'executing'};
    }
    isLiveOperationLedgerInterlockOperation() {
      return true;
    }
    createConcurrentOperationBudgetError(normalizedMoveType, budget, options) {
      return new Error(options.message);
    }
  }
  applyRebalanceCoordinatorLedgerInterlockAdmissionMethods(InterlockFixture);
  const coordinator = new InterlockFixture();
  const state = coordinator.getOperationLedgerInterlockAdmissionState();
  state.heldSelfMoveOperationId = 'op-ledger-self-move';
  state.heldSelfMovePartitionId = 'replica_operations-p1';

  await t.rejects(
    coordinator.runOperationLedgerInterlockAccountedCreate(
      {type: 'ADD', partitionId: 'tbl-user-table-p1'},
      async () => ({operationId: 'op-user-add'}),
    ),
    /replica_operations-p1/,
    'the blocking error names the held LEDGER partition (the state ' +
      'actually examined), not the user table being admitted',
  );
});
