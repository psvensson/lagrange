import {test} from '../../src/test-helpers/tap.js';
import {
  isReplicaOperationInFlight,
  normalizeReplicaOperationRecord,
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
