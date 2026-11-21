// Post-copy cleanup retains its durable removal intent. It is not a request
// to choose a fresh target or reserve copy capacity on an already serving one.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {withRepairLedger} from './placement-retained-row-repair-fixture.js';
import {NODE, placementStatement, stepLedgerRow} from './placement-admission-fixture.js';
import {createOperationAt, OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {REPLACE_INTENT_FIELD as INTENT} from '../../src/rebalancer/operation-workflow-replace-owner-state.js';
import {REPLICA_OPERATION_UPDATE_DISPOSITION as DISPOSITION} from '../../src/rebalancer/replica-operation-update-disposition.js';
import {requestPlacementAdmission} from '../../src/partition/partition-placement-admission.js';
import {clearFixtureSingletons, resetFixtureSingletons, settleTicks} from '../test-helpers/participant-transaction-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);
const PARTITION_ID = 'retained-post-copy-p1';

async function retainStopping(world) {
  const operation = createOperationAt({operationId: 'post-copy-replace', type: OperationType.REPLACE,
    partitionId: PARTITION_ID, replicaId: `${PARTITION_ID}-target`,
    sourceReplicaId: `${PARTITION_ID}-source`, sourceNodeId: NODE.A, targetNodeId: NODE.B,
    targetNodeBootIncarnation: 1, targetNodeStorageIncarnation: 1}, Date.now());
  operation.entityType = 'partition';
  operation.entityId = PARTITION_ID;
  await world.coordinator.repository.persistNewOperation(operation);
  const active = {...operation, workflowStep: WORKFLOW_STEP.ACTIVE, status: ReplicaStatus.ACTIVE,
    stepsHistory: [...operation.stepsHistory,
      {step: WORKFLOW_STEP.ACTIVE, timestamp: operation.updatedAt}]};
  assert.equal((await world.coordinator.repository.persistOperationUpdate(active,
    {expectedWorkflowStep: WORKFLOW_STEP.PENDING})).persisted, true);
  assert.equal(await world.coordinator.workflowOwner.ensureReplaceRemovalIntentRecorded(active,
    {[INTENT.INTENT]: true, [INTENT.WITNESS_COMMIT_INDEX]: 1,
      [INTENT.WITNESS_REPLICA_ID]: active.replicaId, [INTENT.WITNESS_NODE_ID]: NODE.B}), true);
  const retained = await world.coordinator.getOperation(operation.operationId);
  assert.equal(retained.workflowStep, WORKFLOW_STEP.STOPPING);
  const cache = world.placementOwner.systemTableCache;
  const rows = cache.getAll.bind(cache);
  cache.getAll = (table) => table === 'services' ? [...rows(table),
    {replica_id: retained.replicaId, partition_id: PARTITION_ID, node_id: NODE.B,
      status: 'active', raft_role: 'follower'}] : rows(table);
  await world.gateway.submitMutation({tableName: 'replica_operations', operation: 'delete',
    whereClause: {operation_id: retained.operationId}});
  return retained;
}

async function normal(world) {
  return (await requestPlacementAdmission(world.leader, {entryId: 'post-copy-normal-remove',
    body: placementStatement({partitionId: PARTITION_ID, type: OperationType.REMOVE,
      target: NODE.C, replicaId: `${PARTITION_ID}-other`,
      voterRetirement: {nodeBootIncarnation: 1, replicaCreatedAt: 1}})})).placementResult;
}

for (const first of ['normal', 'retained']) {
  test(`historical STOPPING intent with serving target: ${first} first`, () =>
    withRepairLedger(async (world) => {
      const retained = await retainStopping(world);
      if (first === 'normal') {
        const competitor = await normal(world);
        assert.equal(competitor.outcome, 'ADMITTED');
        const result = await world.coordinator.repository.persistOperationUpdate(retained,
          {expectedWorkflowStep: WORKFLOW_STEP.STOPPING});
        assert.equal(result.disposition, DISPOSITION.REFUSED);
        stepLedgerRow(world.leader, competitor.operationIds[0], WORKFLOW_STEP.FAILED);
        await settleTicks();
        await world.coordinator.repository.retainedPlacementRepairDrain;
      } else {
        const result = await world.coordinator.repository.persistOperationUpdate(retained,
          {expectedWorkflowStep: WORKFLOW_STEP.STOPPING});
        assert.equal(result.disposition, DISPOSITION.REINSERTED);
        assert.equal((await normal(world)).reason, 'PARTITION_BUSY');
      }
      const restored = await world.coordinator.getOperation(retained.operationId);
      assert.equal(restored.workflowStep, WORKFLOW_STEP.STOPPING);
      assert.deepEqual(restored.stepsHistory, retained.stepsHistory,
        'neither target selection nor a new physical CREATE replaces the retained intent');
    }, {partitionId: PARTITION_ID}));
}
