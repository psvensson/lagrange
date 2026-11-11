/**
 * Quest provisioning-admission-ledger-hold-transient-wait (run-24 head).
 *
 * R09 supersession alignment: sealed quest
 * `serve-eligibility-committed-epoch-read`
 * (`solve/quests/serve-eligibility-committed-epoch-read/quest.json`, commit
 * `2f83f97fdc48`) explicitly deleted internal `SQLQueryEngine` provisioning
 * admission-convergence polling (`waitForProvisionTargetNodeIds` sleep loop
 * and `isWholeClusterTransientProvisioningHold`), delegating retry pacing to
 * `SchemaProvisioningJobOwner`. Under the sealed F10/C6 contract:
 *  - While a whole-cluster transient ledger hold is active (`nowMs < holdUntilMs`),
 *    `provisionInitialTablePartition` performs zero internal sleep/polling
 *    (`sleepCalls === 0`) and fails immediately with
 *    `TABLE_PARTITION_PROVISIONING_RETRYABLE` so `SchemaProvisioningJobOwner`
 *    paces the retry.
 *  - Once the caller/`SchemaProvisioningJobOwner` retries at
 *    `nowMs >= holdUntilMs`, `provisionInitialTablePartition` succeeds in one
 *    pass (`resolvedReplicaCount: 3`, dispatching all three target nodes).
 *  - Permanent/hard rejections and coordinator interlock precheck fidelity
 *    (Subtests 2-5) remain enforced unchanged.
 */

import {test} from '../../src/test-helpers/tap.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  applyRebalanceCoordinatorLedgerInterlockAdmissionMethods,
} from '../../src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js';
import {TABLES} from '../../src/constants/index.js';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

import {
  createMockMessageRouter,
  createProvisioningReadyService,
} from './sql-query-engine-test-support.js';

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
  const clock = {nowMs: 0};
  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    controlPlaneReadinessService: createProvisioningReadyService(cache),
    // Compressed virtual geometry: convergence window << provisioning budget.
    tablePartitionProvisioningTimeoutMs: 400,
    tablePartitionProvisioningPollIntervalMs: 1,
    tablePartitionTargetNodeConvergenceTimeoutMs: 10,
    nowFn: () => clock.nowMs,
  });
  engine.sleep = async (durationMs) => {
    clock.nowMs += durationMs;
  };
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};
  return {clock, engine};
}

test('run-24 (R09 F10/C6): whole-cluster transient operation-ledger hold ' +
  'fails fast with TABLE_PARTITION_PROVISIONING_RETRYABLE and zero internal ' +
  'polling, then caller retry after hold clears succeeds', async (t) => {
  const partitionId = 'tbl-run24-ledger-hold-p1';
  const localNodeId = 'node-a';
  const holdUntilMs = 40;
  const createdTargetNodeIds = [];
  const {services, cache} = createClusterFixture({
    nodeIds: ['node-a', 'node-b', 'node-c'],
  });

  let sleepCalls = 0;
  let clockRef = null;
  const rebalanceCoordinator = createHoldingRebalanceCoordinator({
    isHoldEngaged: () => clockRef.nowMs < holdUntilMs,
    createdTargetNodeIds,
    services,
    localNodeId,
  });
  const {clock, engine} = createEngineFixture(t, {
    rebalanceCoordinator,
    cache,
    localNodeId,
  });
  clockRef = clock;
  const originalSleep = engine.sleep.bind(engine);
  engine.sleep = async (durationMs) => {
    sleepCalls += 1;
    return originalSleep(durationMs);
  };

  await t.rejects(
    engine.provisionInitialTablePartition({
      partitionId,
      replicaCount: 3,
      minimumRoutableReplicaCount: 2,
      minimumRoutableReplicaCountWasDefaulted: true,
    }),
    {
      code: QUERY_ERROR_CODE.TABLE_PARTITION_PROVISIONING_RETRYABLE,
      message: /minimum routable provisioning cohort/,
    },
    'active whole-cluster ledger hold fails immediately as retryable',
  );
  t.equal(sleepCalls, 0, 'zero internal query-engine polling while hold is active');
  t.same(createdTargetNodeIds, [], 'nothing was planned while hold is active');

  // SchemaProvisioningJobOwner / caller retries once the ledger hold clears.
  clock.nowMs = holdUntilMs;
  const summary = await engine.provisionInitialTablePartition({
    partitionId,
    replicaCount: 3,
    minimumRoutableReplicaCount: 2,
    minimumRoutableReplicaCountWasDefaulted: true,
  });

  t.equal(sleepCalls, 0, 'retry succeeds in one pass with zero internal polling');
  t.equal(summary.resolvedReplicaCount, 3, 'all three replicas resolved');
  t.same(
    createdTargetNodeIds.slice().sort(),
    ['node-a', 'node-b', 'node-c'],
    'all three target nodes planned on retry',
  );
  t.same(
    services.map((service) => service.node_id).sort(),
    ['node-a', 'node-b', 'node-c'],
    'all three replicas dispatched once the ledger hold cleared',
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
  const {engine} = createEngineFixture(t, {
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
  const {engine} = createEngineFixture(t, {
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
    async queryOperationProjectionById(operationId) {
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

test('run-25: the provisioning PRECHECK consults the ledger interlock — a ' +
  'precheck that admits what createOperation refuses defeats the ' +
  'convergence wait (RED on the run-25 head)', async (t) => {
  const {applyRebalanceCoordinatorOperationCreationMethods} = await import(
    '../../src/rebalancer/rebalance-coordinator-operation-creation.js'
  );
  const {applyRebalanceCoordinatorOperationCreationAdmissionMethods} =
    await import(
      '../../src/rebalancer/rebalance-coordinator-operation-creation-admission.js'
    );
  class CoordinatorFixture {
    constructor() {
      // Storage admission always admits — run-25's live shape.
      this.provisioningAdmissionPolicy = {
        async ensureProvisioningAdmissionAllowed() {},
      };
      this.controlPlaneReadinessService = {
        readCurrentPlanningProjectionIdentity() {
          return Object.freeze({
            globalPlanningGeneration: 1,
            nodePlanningGeneration: 1,
            saturated: false,
          });
        },
      };
    }
    normalizeMoveType(type) {
      return type;
    }
    isEmergencyPriorityControlPlanePartition() {
      return false;
    }
    isOperationTerminal() {
      return false;
    }
    isLiveOperationLedgerInterlockOperation() {
      return true;
    }
    async queryIncompleteOperations() {
      // A live ledger self-move is in flight (REPLACE of the ledger
      // partition) — the exact run-24/25 formation window.
      return [
        {
          operationId: 'op-ledger-self-move',
          type: 'REPLACE',
          partitionId: 'replica_operations-p1',
          status: 'executing',
        },
      ];
    }
    getIncompleteOperationObservation() {
      return {deferredOutcome: null};
    }
    createConcurrentOperationBudgetError(normalizedMoveType, budget, options) {
      return new Error(options.message);
    }
    async ensureNoConflictingInFlightReplaceForRemove() {}
    async ensurePriorityControlPlaneRemoveLaneAvailable() {}
    async ensurePrioritySurplusRemovePlacementFenceAllowed() {}
    async ensureEntityAddLikeCreateLaneAvailable() {}
    async ensureCriticalPartitionCreateLaneAvailable() {}
    async ensureCreateTopologyGuardAllowed() {}
    resolveEntitySizeBytes() {
      return 0;
    }
    assertLocalControlPlaneMutationReady() {}
  }
  applyRebalanceCoordinatorOperationCreationAdmissionMethods(
    CoordinatorFixture,
  );
  applyRebalanceCoordinatorOperationCreationMethods(CoordinatorFixture);
  const {applyRebalanceCoordinatorLedgerInterlockAdmissionMethods:
    applyInterlock} = await import(
    '../../src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js'
  );
  applyInterlock(CoordinatorFixture);
  const coordinator = new CoordinatorFixture();
  coordinator.observeReplicaOperationMutationRoute = () => ({allowed: true});

  const decision = await coordinator.checkProvisioningAdmission({
    type: 'ADD',
    partitionId: 'tbl-run25-user-table-p1',
    nodeId: 'node-b',
  });
  t.equal(
    decision.allowed,
    false,
    'the precheck DEFERS while a ledger self-move is live — it predicts ' +
      'what createOperation would refuse instead of lying to the ' +
      'convergence wait',
  );
  t.match(
    decision.admissionResult?.blockingReasons?.[0]?.code ||
      decision.admissionResult?.blockingReasons?.[0] ||
      decision.admissionResult?.reason,
    /operation_ledger_self_move/,
    'the deferral carries the transient ledger-hold reason the ' +
      'provisioning transient-wait classifies on',
  );
});
