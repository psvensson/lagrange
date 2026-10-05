// A create that fails terminally AFTER its target was admitted as a voter
// (the ack-loss wedge, F3 (d)): the target's SYNCING row is durable, the
// leader admitted it on that row, its port is closed and its FAILED write may
// never land. The existing owner of failed-create target cleanup - the
// planner's FAILED_REPLICA cure, fed by the terminal failed create targets of
// the rebalancer's replica state - must cover an ADD as it covers a REPLACE,
// so the closed voter is removed (REMOVE -> REMOVING -> the row-driven
// RemoveNode) instead of leaving a group leaderless with it in its ConfState.
//
// M2: the cure never names a LIVE target (its row ACTIVE), and an ADD whose
// target went live is never failed at all: the operation owner's one
// post-intent no-fail guard (shared with REPLACE) completes it instead -
// even when the SYNCING step timer fires after the promotion.

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MovePlanner} from '../../src/rebalancer/move-planner.js';
import {UnifiedRebalancerReplicaState} from
  '../../src/rebalancer/unified-rebalancer-replica-state.js';
import {
  MOVE_REASON,
  REBALANCER_ENTITY_TYPE,
  REBALANCER_MOVE_TYPE,
} from '../../src/rebalancer/rebalancer-constants.js';
import {OperationType, ReplicaStatus} from
  '../../src/rebalancer/replica-status.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {REBALANCE_COORDINATOR_LOG_MSG} from
  '../../src/rebalancer/rebalancer-constants.js';
import {createTestCoordinator} from './test-helpers.js';

const PARTITION_ID = 'orders-p1';
const TARGET_ID = 'orders-p1-r4';
const TARGET_NODE = 'node-4';

function operationRow(type, status) {
  return {
    operation_id: `op-${type}-${status}`,
    type,
    partition_id: PARTITION_ID,
    replica_id: TARGET_ID,
    target_node_id: TARGET_NODE,
    status,
    workflow_step: status === ReplicaStatus.FAILED ?
      WORKFLOW_STEP.FAILED : WORKFLOW_STEP.SYNCING,
    created_at: 1,
    updated_at: 1,
    entity_type: REBALANCER_ENTITY_TYPE.PARTITION,
    entity_id: PARTITION_ID,
  };
}

// The real terminal-target read over a replica_operations projection and
// the target's services row (null: no row).
function terminalFailedTargets(operations, targetStatus = null) {
  const host = Object.create(UnifiedRebalancerReplicaState.prototype);
  host.entityId = PARTITION_ID;
  host.entityType = REBALANCER_ENTITY_TYPE.PARTITION;
  host.nowFn = () => 2;
  host.systemTableCache = {
    filter: (_table, predicate) => operations.filter(predicate),
    get: (table, replicaId) => table === 'services' &&
      replicaId === TARGET_ID && targetStatus !== null ?
      {replica_id: TARGET_ID, node_id: TARGET_NODE, status: targetStatus} :
      null,
  };
  return host.getTerminalFailedReplaceTargetReplicaIds();
}

// The planner's moves with the FAILED ADD's target beside the other
// replicas: above the target count (three others) or at it (two others).
const OTHERS_ABOVE_TARGET = Object.freeze(['node-1', 'node-2', 'node-3']);
function plannedMoves(targetStatus, {others = OTHERS_ABOVE_TARGET} = {}) {
  const currentReplicas = others.map(
    (nodeId, index) => ({replica_id: `orders-p1-r${index + 1}`,
      node_id: nodeId, status: ReplicaStatus.ACTIVE}));
  currentReplicas.push({replica_id: TARGET_ID, node_id: TARGET_NODE,
    status: targetStatus});
  const targets = terminalFailedTargets(
    [operationRow(OperationType.ADD, ReplicaStatus.FAILED)], targetStatus);
  const planner = new MovePlanner({
    entityId: PARTITION_ID,
    entityType: REBALANCER_ENTITY_TYPE.PARTITION,
    moveStateProvider: {
      getAvailableNodes: () => [],
      getCurrentReplicas: () => currentReplicas,
      getHealthyReplicas: (replicas) => replicas.filter((replica) =>
        replica.status === ReplicaStatus.ACTIVE),
      getInFlightOperations: () => [],
      getGlobalTopologyBlockingInFlightOperations: () => [],
      getTerminalFailedReplaceTargetReplicaIds: () => targets,
      hasPendingMove: () => false,
      hasPendingAddForNode: () => false,
    },
  });
  return planner.calculateMoves(currentReplicas, {
    targetReplicaCount: 3,
    targetNodes: others.length === 3 ? others : [...others, TARGET_NODE],
    degraded: false,
  });
}

test('a terminally failed ADD leaves no admitted-but-closed target', async (t) => {
  t.beforeEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({});
    LoggingService.getInstance().initialize({level: 'error'});
  });

  for (const type of [OperationType.ADD, OperationType.REPLACE]) {
    await t.test(`a FAILED ${type} names its target for cleanup`, async (t) => {
      t.same([...terminalFailedTargets(
        [operationRow(type, ReplicaStatus.FAILED)])], [TARGET_ID]);
    });
  }

  await t.test('an in-flight ADD does not', async (t) => {
    t.same([...terminalFailedTargets(
      [operationRow(OperationType.ADD, ReplicaStatus.SYNCING)])], []);
  });

  await t.test('the planner removes the admitted-but-closed (SYNCING, never ' +
    'active) target of a FAILED ADD', async (t) => {
    t.same(plannedMoves(ReplicaStatus.SYNCING), [{
      type: REBALANCER_MOVE_TYPE.REMOVE, replicaId: TARGET_ID,
      nodeId: TARGET_NODE, reason: MOVE_REASON.REPLICA_FAILED}]);
  });

  for (const type of [OperationType.ADD, OperationType.REPLACE]) {
    await t.test(`M2: a FAILED ${type} whose target is live (ACTIVE) names ` +
      'no cleanup target', async (t) => {
      t.same([...terminalFailedTargets([operationRow(type,
        ReplicaStatus.FAILED)], ReplicaStatus.ACTIVE)], []);
    });
  }

  await t.test('M2: the planner never plans a failed-target REMOVE of a ' +
    'FAILED ADD\'s live voter', async (t) => {
    t.notOk(plannedMoves(ReplicaStatus.ACTIVE, {others: ['node-1', 'node-2']})
      .some((move) => move.type === REBALANCER_MOVE_TYPE.REMOVE &&
        move.replicaId === TARGET_ID),
    'at the target count: no REMOVE of the healthy voter');
    t.notOk(plannedMoves(ReplicaStatus.ACTIVE).some((move) =>
      move.reason === MOVE_REASON.REPLICA_FAILED),
    'above it: the surplus is ordinary placement, never a failed-target cure');
  });
});

// The real operation owner (coordinator workflow owner) with the target's
// authoritative services row read through its repository.
async function addHarness() {
  const target = {status: ReplicaStatus.SYNCING};
  const coordinator = createTestCoordinator({
    nodeId: 'node-1',
    enableTimeouts: false,
    sqlQueryResults: {
      get 'FROM services WHERE service_id = ?'() {
        return {success: true, affectedRows: 1, rows: [{
          service_id: TARGET_ID, replica_id: TARGET_ID,
          partition_id: PARTITION_ID, node_id: TARGET_NODE,
          service_type: 'partition', status: target.status,
          raft_role: target.status === ReplicaStatus.ACTIVE ? 'follower' :
            'learner',
          address: `${TARGET_NODE}/partition/${TARGET_ID}`}]};
      },
    },
  });
  const owner = coordinator.workflowOwner;
  const operation = await coordinator.createOperation({
    type: OperationType.ADD,
    partitionId: PARTITION_ID,
    entityType: 'partition',
    entityId: PARTITION_ID,
    nodeId: TARGET_NODE,
    replicaId: TARGET_ID,
  });
  await owner.updateStep(operation, WORKFLOW_STEP.SYNCING);
  return {coordinator, owner, operation, target};
}

test('M2: an ADD whose target went live is never failed; it completes',
  async (t) => {
    t.beforeEach(() => {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
      ConfigurationManager.getInstance().initialize({});
      LoggingService.getInstance().initialize({level: 'error'});
    });

    await t.test('the SYNCING step timer fires after the promotion: the ADD ' +
      'completes, not FAILED', async (t) => {
      const harness = await addHarness();
      try {
        const clock = {offsetMs: 0};
        harness.owner.timeSource = {now: () => Date.now() + clock.offsetMs};
        // The target is promoted (its row ACTIVE) as the timer fires: after
        // the timeout's progress reconcile read SYNCING, before its failure.
        const warn = harness.owner.logger.warn.bind(harness.owner.logger);
        harness.owner.logger.warn = (message, context) => {
          if (message === REBALANCE_COORDINATOR_LOG_MSG.OPERATION_TIMED_OUT) {
            harness.target.status = ReplicaStatus.ACTIVE;
          }
          return warn(message, context);
        };
        clock.offsetMs = 3_600_000;
        await harness.owner.checkTimeouts();
        const persisted = await harness.coordinator.getOperation(
          harness.operation.operationId);
        t.equal(harness.target.status, ReplicaStatus.ACTIVE,
          'the timer fired after the promotion');
        t.equal(persisted.workflowStep, WORKFLOW_STEP.ACTIVE,
          'the ADD completed');
        t.not(persisted.status, ReplicaStatus.FAILED, 'never FAILED');
      } finally {
        await harness.coordinator.shutdown();
      }
    });

    await t.test('any failure of an ADD whose target is live is refused and ' +
      'completed', async (t) => {
      const harness = await addHarness();
      try {
        harness.target.status = ReplicaStatus.ACTIVE;
        await harness.owner.failOperation(harness.operation,
          'Timeout in SYNCING step after 300001ms');
        const persisted = await harness.coordinator.getOperation(
          harness.operation.operationId);
        t.equal(persisted.workflowStep, WORKFLOW_STEP.ACTIVE);
      } finally {
        await harness.coordinator.shutdown();
      }
    });

    await t.test('an ADD whose target is not live still fails', async (t) => {
      const harness = await addHarness();
      try {
        await harness.owner.failOperation(harness.operation,
          'Timeout in SYNCING step after 300001ms');
        const persisted = await harness.coordinator.getOperation(
          harness.operation.operationId);
        t.equal(persisted.workflowStep, WORKFLOW_STEP.FAILED);
      } finally {
        await harness.coordinator.shutdown();
      }
    });
  });
