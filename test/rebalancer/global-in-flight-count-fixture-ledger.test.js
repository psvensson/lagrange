// The planner fixture answers the global in-flight operation count from its
// own modelled ledger through the production read: the rebalancer's
// getGlobalInFlightOperationCount, the production gateway and CDC read path,
// and the production SELECT run over the ledger rows. A test that creates
// operations sees them counted; a terminal operation is not.
import {test} from '../../src/test-helpers/tap.js';
import {
  createMockCoordinator,
  createTestCoordinator,
  createTestRebalancer,
  initializeSpreadTestEnvironment,
} from './test-helpers.js';
import {EntityType, MoveType} from '../../src/rebalancer/unified-rebalancer.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';

const PARTITION_ID = 'partition-1';

// The coordinator request the rebalancer builds for an ADD move: the
// operation type is the rebalancer's own mapping of the move type.
function addRequest(rebalancer, nodeId) {
  return {
    type: rebalancer.resolveCoordinatorOperationType(MoveType.ADD),
    partitionId: PARTITION_ID,
    entityType: EntityType.PARTITION,
    entityId: PARTITION_ID,
    nodeId,
    replicaId: `${PARTITION_ID}-${nodeId}`,
  };
}

test('the mock coordinator\'s created operations are the counted ledger',
  async (t) => {
    initializeSpreadTestEnvironment('node-1');
    const coordinator = createMockCoordinator();
    const rebalancer = createTestRebalancer({
      entityId: PARTITION_ID,
      rebalanceCoordinator: coordinator,
    });
    t.equal(await rebalancer.getGlobalInFlightOperationCount(), 0,
      'an empty ledger answers zero, not unavailable');
    await coordinator.createOperation(addRequest(rebalancer, 'node-2'));
    await coordinator.createOperation(addRequest(rebalancer, 'node-3'));
    t.equal(await rebalancer.getGlobalInFlightOperationCount(), 2,
      'both created operations are in flight');
    const [first] = coordinator.testReplicaOperationLedger.rows();
    coordinator.testReplicaOperationLedger.commit({
      ...first,
      status: 'active',
      workflow_step: WORKFLOW_STEP.ACTIVE,
      completed_at: first.created_at,
    });
    t.equal(await rebalancer.getGlobalInFlightOperationCount(), 1,
      'a terminal ADD is not counted by the production predicate');
    rebalancer.shutdown();
  });

test('a real test coordinator\'s tracked operations are the counted ledger',
  async (t) => {
    initializeSpreadTestEnvironment('node-1');
    const coordinator = createTestCoordinator({nodeId: 'node-1'});
    const rebalancer = createTestRebalancer({
      entityId: PARTITION_ID,
      rebalanceCoordinator: coordinator,
    });
    t.equal(await rebalancer.getGlobalInFlightOperationCount(), 0,
      'an empty ledger answers zero');
    const now = Date.now();
    coordinator.testReplicaOperationLedger.commit({
      operation_id: 'op-committed-elsewhere',
      type: rebalancer.resolveCoordinatorOperationType(MoveType.ADD),
      partition_id: PARTITION_ID,
      entity_type: EntityType.PARTITION,
      entity_id: PARTITION_ID,
      replica_id: `${PARTITION_ID}-node-2`,
      source_node_id: '',
      target_node_id: 'node-2',
      status: 'pending',
      workflow_step: WORKFLOW_STEP.PENDING,
      created_at: now,
      updated_at: now,
      steps_history: '[]',
    });
    t.equal(await rebalancer.getGlobalInFlightOperationCount(), 1,
      'a row another writer committed is counted');
    rebalancer.shutdown();
    await coordinator.shutdown?.();
  });
