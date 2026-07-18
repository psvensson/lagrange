import {test} from '../../src/test-helpers/tap.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  buildCurrentPriorityPlacementObservation,
} from '../../src/admin/admin-control-snapshot-current-priority-placement.js';

const TEST_CAPTURED_AT_MS = 1000;
const TEST_NODE_IDS = Object.freeze(['node-a', 'node-b', 'node-c']);
const TEST_PRIORITY_TABLE_IDS = Object.freeze([
  SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
  SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
  SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
  SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS,
  SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS,
  SYSTEM_TABLE_NAME.SCHEMA_OPERATIONS,
]);

function buildPriorityRows() {
  const partitionRows = [];
  const serviceRows = [];
  for (const tableId of TEST_PRIORITY_TABLE_IDS) {
    const partitionId = INITIAL_PARTITION_IDS[tableId];
    partitionRows.push({
      partition_id: partitionId,
      table_id: tableId,
      leader_node_id: TEST_NODE_IDS[0],
      state: 'NORMAL',
    });
    for (const [index, nodeId] of TEST_NODE_IDS.entries()) {
      const replicaId = partitionId + '-r' + String(index + 1);
      serviceRows.push({
        service_id: replicaId,
        service_type: 'partition',
        partition_id: partitionId,
        replica_id: replicaId,
        node_id: nodeId,
        status: 'active',
        // Partition leadership is owned by partitions.leader_node_id.
        // Durable services rows intentionally collapse leader to follower.
        raft_role: 'follower',
        address: nodeId + '/partition/' + replicaId,
      });
    }
  }
  return {partitionRows, serviceRows};
}

function buildObservation(rows) {
  return buildCurrentPriorityPlacementObservation({
    ...rows,
    capturedAt: TEST_CAPTURED_AT_MS,
    readinessByNodeId: {},
    activeNodeViews: {
      locallyEligibleNodeIds: [...TEST_NODE_IDS],
      effectiveActiveNodeIds: [...TEST_NODE_IDS],
      projectedServingNodeIds: [...TEST_NODE_IDS],
      publishedActiveNodeIds: [...TEST_NODE_IDS],
    },
  });
}

test('current priority placement observes spread and leadership from one capture',
  async (t) => {
    const rows = buildPriorityRows();
    const settled = buildObservation(rows);
    t.equal(settled.state, 'available');
    t.equal(settled.satisfied, true);
    t.equal(settled.priorityPartitionSummary.totalSpreadGap, 0);
    t.equal(settled.leaderCoverage.missingLeaderPartitionCount, 0);

    const schemaPartitionId =
      INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SCHEMA_OPERATIONS];
    const schemaPartition = rows.partitionRows.find(
      (row) => row.partition_id === schemaPartitionId,
    );
    schemaPartition.leader_node_id = null;
    const missingSchemaLeader = buildObservation(rows);
    t.equal(
      missingSchemaLeader.priorityPartitionSummary.totalSpreadGap,
      0,
      'leader loss does not fabricate a replica-placement deficit',
    );
    t.equal(missingSchemaLeader.satisfied, false);
    t.same(
      missingSchemaLeader.leaderCoverage.missingLeaderPartitionIds,
      [schemaPartitionId],
    );

    schemaPartition.leader_node_id = TEST_NODE_IDS[0];
    const schemaLeaderVoter = rows.serviceRows.find(
      (row) =>
        row.partition_id === schemaPartitionId &&
        row.node_id === TEST_NODE_IDS[0],
    );
    schemaLeaderVoter.address = null;
    const addresslessSchemaLeader = buildObservation(rows);
    t.same(
      addresslessSchemaLeader.leaderCoverage.missingLeaderPartitionIds,
      [schemaPartitionId],
      'canonical ownership without an addressed current voter stays blocked',
    );
    schemaLeaderVoter.address =
      TEST_NODE_IDS[0] + '/partition/' + schemaLeaderVoter.replica_id;
    schemaLeaderVoter.status = 'failed';
    const inactiveSchemaLeader = buildObservation(rows);
    t.same(
      inactiveSchemaLeader.leaderCoverage.missingLeaderPartitionIds,
      [schemaPartitionId],
      'canonical ownership without an active current voter stays blocked',
    );
    schemaLeaderVoter.status = 'active';

    const fractionalCapture = buildCurrentPriorityPlacementObservation({
      ...rows,
      capturedAt: TEST_CAPTURED_AT_MS + 0.5,
      readinessByNodeId: {},
      activeNodeViews: {
        locallyEligibleNodeIds: [...TEST_NODE_IDS],
      },
    });
    t.equal(
      fractionalCapture.capturedAt,
      TEST_CAPTURED_AT_MS + 0.5,
      'the observation preserves the enclosing snapshot clock exactly',
    );
    t.end();
  });
