/**
 * The control snapshot's post-publication discount of stale replica
 * operations reads priority recovery's partitions from the classification
 * owner (classifySystemPartition().priorityControlPlane), never a hand list:
 * every priority control-plane table is discounted - schema_operations
 * included, which the retired hand list omitted - and an ordinary user table
 * is not.
 */
import {test} from '../../src/test-helpers/tap.js';
import {AdminControlSnapshot} from '../../src/admin/admin-control-snapshot.js';
import {PRIORITY_CONTROL_PLANE_TABLE_IDS} from
  '../../src/bootstrap/system-partition-classification.js';
import {TABLES} from '../../src/constants/index.js';

const NOW_MS = 200000;
const STALE_AGE_MS = 120000;

function staleOperation(partitionId) {
  return {
    operation_id: `op-${partitionId}`,
    operation_type: 'REPLACE',
    partition_id: partitionId,
    entity_type: 'partition',
    entity_id: partitionId,
    source_node_id: 'node-1',
    target_node_id: 'node-2',
    replica_id: `${partitionId}-r4`,
    status: 'pending',
    workflow_step: 'PENDING',
    created_at: NOW_MS - STALE_AGE_MS,
    updated_at: NOW_MS - STALE_AGE_MS,
  };
}

function discountOf(partitionIds) {
  const snapshot = new AdminControlSnapshot({
    nodeId: 'node-1',
    nowFn: () => NOW_MS,
    startupRecoveryCoordinator: {evaluate: () => ({ready: true})},
  });
  const summary = snapshot.buildControlSnapshotReplicaOperationSummary(
    partitionIds.map(staleOperation), {
      serviceRows: [],
      controlPlaneDiagnostics: {publicationConvergence: {
        publicationStatus: 'PUBLISHED',
        pendingAckNodeIds: [],
        priorityPartitionSummary: {satisfied: true},
      }},
    });
  return {stale: summary.staleInFlightCount,
    discounted: summary.staleInFlightDiscountCount};
}

test('every priority control-plane partition is discounted after ' +
  'publication, schema_operations included; a user table is not', async (t) => {
  const priority = [...PRIORITY_CONTROL_PLANE_TABLE_IDS]
    .map((tableId) => `${tableId}-p1`);
  t.ok(priority.includes(`${TABLES.SCHEMA_OPERATIONS}-p1`),
    'precondition: schema_operations is a priority control-plane table');
  const perPartition = Object.fromEntries(priority.map((partitionId) =>
    [partitionId, discountOf([partitionId]).discounted]));
  t.same(perPartition, Object.fromEntries(priority.map((partitionId) =>
    [partitionId, 1])), 'each priority partition is discounted');
  t.same(discountOf(['user_table-p1']), {stale: 1, discounted: 0},
    'an ordinary partition still counts');
});
