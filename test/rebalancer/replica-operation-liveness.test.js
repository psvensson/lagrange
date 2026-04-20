import {test} from '../../src/test-helpers/tap.js';
import {
  isReplicaOperationInFlight,
  normalizeReplicaOperationRecord,
  summarizeReplicaOperationLiveness,
} from '../../src/rebalancer/replica-operation-liveness.js';

test(
  'replica-operation-liveness treats observed-converged MOVE_ASSIGNMENT rows as not in flight',
  async (t) => {
    const record = normalizeReplicaOperationRecord({
      operation_id: 'assignment-1',
      type: 'MOVE_ASSIGNMENT',
      replica_id: 'mg-1-r2',
      source_node_id: 'seed-node',
      target_node_id: 'target-node',
      status: 'creating',
      workflow_step: 'PENDING',
      updated_at: 100,
    }, {
      nowMs: 200,
    });

    t.equal(
      isReplicaOperationInFlight(record, {
        serviceRows: [{
          service_id: 'mg-1-r2',
          replica_id: 'mg-1-r2',
          service_type: 'message_group',
          node_id: 'target-node',
          status: 'active',
        }],
      }),
      false,
      'canonical target ownership should suppress stale in-flight classification',
    );
  },
);

test(
  'replica-operation-liveness still reports MOVE_ASSIGNMENT as in flight without target ownership',
  async (t) => {
    const record = normalizeReplicaOperationRecord({
      operation_id: 'assignment-2',
      type: 'MOVE_ASSIGNMENT',
      replica_id: 'mg-1-r3',
      source_node_id: 'seed-node',
      target_node_id: 'target-node',
      status: 'creating',
      workflow_step: 'PENDING',
      updated_at: 100,
    }, {
      nowMs: 200,
    });

    t.equal(
      isReplicaOperationInFlight(record, {
        serviceRows: [{
          service_id: 'mg-1-r3',
          replica_id: 'mg-1-r3',
          service_type: 'message_group',
          node_id: 'seed-node',
          status: 'active',
        }],
      }),
      true,
      'in-flight classification should remain when canonical ownership has not moved to the target',
    );
  },
);

test(
  'replica-operation-liveness treats observed-converged message-group ADD rows as not in flight',
  async (t) => {
    const record = normalizeReplicaOperationRecord({
      operation_id: 'add-mg-1',
      type: 'ADD',
      entity_type: 'message_group',
      entity_id: 'mg-1',
      replica_id: 'mg-1-r2',
      source_node_id: 'seed-node',
      target_node_id: 'target-node',
      status: 'creating',
      workflow_step: 'CREATING',
      updated_at: 100,
    }, {
      nowMs: 200,
    });

    t.equal(
      isReplicaOperationInFlight(record, {
        serviceRows: [{
          service_id: 'mg-1-r2',
          replica_id: 'mg-1-r2',
          service_type: 'message_group',
          group_id: 'mg-1',
          node_id: 'target-node',
          status: 'active',
        }],
      }),
      false,
      'an ADD should stop blocking once the target message-group replica is active on the target node',
    );
  },
);

test(
  'replica-operation-liveness keeps REPLACE ACTIVE remove-dispatch rows in flight',
  async (t) => {
    const summary = summarizeReplicaOperationLiveness([{
      operation_id: 'replace-1',
      type: 'REPLACE',
      partition_id: 'nodes-p1',
      entity_type: 'partition',
      entity_id: 'nodes-p1',
      source_node_id: 'seed-node',
      target_node_id: 'node-2',
      replica_id: 'nodes-p1-r4',
      status: 'active',
      workflow_step: 'ACTIVE',
      updated_at: 100,
    }], {
      nowMs: 200,
    });

    t.equal(
      summary.inFlightCount,
      1,
      'REPLACE ACTIVE should stay visible while source removal is still pending',
    );
    t.same(
      summary.inFlightOperationIds,
      ['replace-1'],
      'REPLACE ACTIVE should remain in the in-flight operation set',
    );
    t.same(
      summary.stepHistogram,
      {
        ACTIVE: 1,
      },
      'REPLACE ACTIVE should still contribute to in-flight step diagnostics',
    );
  },
);

test(
  'normalizeReplicaOperationRecord infers priority recovery identity from replicaId and steps history',
  async (t) => {
    const record = normalizeReplicaOperationRecord({
      operation_id: 'op-sql-transactions-r4',
      type: '',
      status: 'syncing',
      workflow_step: 'SYNCING',
      replica_id: 'sql_transactions-p1-r4',
      steps_history: JSON.stringify([{
        step: 'PENDING',
        sourceReplicaId: 'sql_transactions-p1-r1',
        replicaIds: [
          'sql_transactions-p1-r2',
          'sql_transactions-p1-r3',
          'sql_transactions-p1-r4',
        ],
        peerAddresses: [
          'seed-node/partition/sql_transactions-p1-r2',
          'seed-node/partition/sql_transactions-p1-r3',
          'node-4/partition/sql_transactions-p1-r4',
        ],
      }, {
        step: 'SYNCING',
        readinessSnapshot: {
          nodeId: 'node-4',
        },
      }]),
      updated_at: 100,
    }, {
      nowMs: 200,
    });

    t.equal(
      record.partitionId,
      'sql_transactions-p1',
      'normalization should recover the partition id from the replica id when the row omits it',
    );
    t.equal(
      record.entityId,
      'sql_transactions-p1',
      'normalization should keep entity ownership aligned with the inferred partition id',
    );
    t.equal(
      record.type,
      'REPLACE',
      'normalization should infer the replace workflow from source-replica metadata',
    );
    t.equal(
      record.targetNodeId,
      'node-4',
      'normalization should recover the target node from peer addresses or readiness history',
    );
  },
);

test(
  'normalizeReplicaOperationRecord infers REMOVE type for failed source-removal rows without canonical columns',
  async (t) => {
    const record = normalizeReplicaOperationRecord({
      operation_id: 'op-replica-operations-r2',
      type: '',
      status: 'failed',
      workflow_step: 'FAILED',
      replica_id: 'replica_operations-p1-r2',
      steps_history: JSON.stringify([{
        step: 'PENDING',
        readinessSnapshot: {
          nodeId: 'seed-node',
        },
      }, {
        step: 'STOPPING',
        readinessSnapshot: {
          nodeId: 'seed-node',
        },
      }, {
        step: 'FAILED',
        readinessSnapshot: {
          nodeId: 'seed-node',
        },
      }]),
      updated_at: 100,
    }, {
      nowMs: 200,
    });

    t.equal(
      record.partitionId,
      'replica_operations-p1',
      'failed source-removal rows should still retain the owning partition identity',
    );
    t.equal(
      record.type,
      'REMOVE',
      'failed stop/remove rows should infer REMOVE when the persisted type is absent',
    );
    t.equal(
      record.targetNodeId,
      'seed-node',
      'failed source-removal rows should keep their target/source node identity for diagnostics',
    );
  },
);
