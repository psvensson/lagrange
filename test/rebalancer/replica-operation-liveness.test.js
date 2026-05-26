import {test} from '../../src/test-helpers/tap.js';
import {
  isReplicaOperationInFlight,
  isReplicaOperationStale,
  normalizeReplicaOperationRecord,
  summarizeReplicaOperationLiveness,
} from '../../src/rebalancer/replica-operation-liveness.js';

const COMPLETED_MOVE_ASSIGNMENT_OPERATION_ID =
  'completed-move-assignment';
const COMPLETED_MOVE_ASSIGNMENT_TYPE = 'MOVE_ASSIGNMENT';
const COMPLETED_MOVE_ASSIGNMENT_STATUS = 'active';
const COMPLETED_MOVE_ASSIGNMENT_WORKFLOW_STEP = 'ACTIVE';
const COMPLETED_MOVE_ASSIGNMENT_REPLICA_ID = 'mg-1-r2';
const COMPLETED_MOVE_ASSIGNMENT_SOURCE_NODE_ID = 'seed-node';
const COMPLETED_MOVE_ASSIGNMENT_TARGET_NODE_ID = 'target-node';
const COMPLETED_MOVE_ASSIGNMENT_UPDATED_AT = 100;
const COMPLETED_MOVE_ASSIGNMENT_COMPLETED_AT = 100;
const COMPLETED_MOVE_ASSIGNMENT_NOW_MS = 200;
const MOVE_ASSIGNMENT_IN_FLIGHT_COUNT_ZERO = 0;
const MOVE_ASSIGNMENT_STALE_IN_FLIGHT_COUNT_ZERO = 0;
const MOVE_ASSIGNMENT_NO_IN_FLIGHT_OPERATION_IDS = Object.freeze([]);
const MOVE_ASSIGNMENT_ACTIVE_WITHOUT_COMPLETION_OPERATION_ID =
  'active-move-assignment-without-completion';
const MOVE_ASSIGNMENT_ACTIVE_WITHOUT_COMPLETION_UPDATED_AT = 100;
const MOVE_ASSIGNMENT_ACTIVE_WITHOUT_COMPLETION_NOW_MS = 200;

test(
  'replica-operation-liveness treats completed MOVE_ASSIGNMENT rows as not in flight',
  async (t) => {
    const record = normalizeReplicaOperationRecord({
      operation_id: COMPLETED_MOVE_ASSIGNMENT_OPERATION_ID,
      type: COMPLETED_MOVE_ASSIGNMENT_TYPE,
      replica_id: COMPLETED_MOVE_ASSIGNMENT_REPLICA_ID,
      source_node_id: COMPLETED_MOVE_ASSIGNMENT_SOURCE_NODE_ID,
      target_node_id: COMPLETED_MOVE_ASSIGNMENT_TARGET_NODE_ID,
      status: COMPLETED_MOVE_ASSIGNMENT_STATUS,
      workflow_step: COMPLETED_MOVE_ASSIGNMENT_WORKFLOW_STEP,
      updated_at: COMPLETED_MOVE_ASSIGNMENT_UPDATED_AT,
      completed_at: COMPLETED_MOVE_ASSIGNMENT_COMPLETED_AT,
    }, {
      nowMs: COMPLETED_MOVE_ASSIGNMENT_NOW_MS,
    });

    t.equal(
      isReplicaOperationInFlight(record),
      false,
      'completed bootstrap move-assignment rows should not keep operation drain open',
    );
  },
);

test(
  'replica-operation-liveness keeps active MOVE_ASSIGNMENT rows in flight until completion is observed',
  async (t) => {
    const record = normalizeReplicaOperationRecord({
      operation_id: MOVE_ASSIGNMENT_ACTIVE_WITHOUT_COMPLETION_OPERATION_ID,
      type: COMPLETED_MOVE_ASSIGNMENT_TYPE,
      replica_id: COMPLETED_MOVE_ASSIGNMENT_REPLICA_ID,
      source_node_id: COMPLETED_MOVE_ASSIGNMENT_SOURCE_NODE_ID,
      target_node_id: COMPLETED_MOVE_ASSIGNMENT_TARGET_NODE_ID,
      status: COMPLETED_MOVE_ASSIGNMENT_STATUS,
      workflow_step: COMPLETED_MOVE_ASSIGNMENT_WORKFLOW_STEP,
      updated_at: MOVE_ASSIGNMENT_ACTIVE_WITHOUT_COMPLETION_UPDATED_AT,
    }, {
      nowMs: MOVE_ASSIGNMENT_ACTIVE_WITHOUT_COMPLETION_NOW_MS,
    });

    t.equal(
      isReplicaOperationInFlight(record),
      true,
      'active bootstrap move-assignment rows should remain in flight until completion is durable',
    );
  },
);

test(
  'replica-operation-liveness summary drains report-shaped completed MOVE_ASSIGNMENT rows',
  async (t) => {
    const summary = summarizeReplicaOperationLiveness([{
      operation_id: COMPLETED_MOVE_ASSIGNMENT_OPERATION_ID,
      operation_type: COMPLETED_MOVE_ASSIGNMENT_TYPE,
      replica_id: COMPLETED_MOVE_ASSIGNMENT_REPLICA_ID,
      source_node_id: COMPLETED_MOVE_ASSIGNMENT_SOURCE_NODE_ID,
      target_node_id: COMPLETED_MOVE_ASSIGNMENT_TARGET_NODE_ID,
      status: COMPLETED_MOVE_ASSIGNMENT_STATUS,
      workflow_step: COMPLETED_MOVE_ASSIGNMENT_WORKFLOW_STEP,
      updated_at: COMPLETED_MOVE_ASSIGNMENT_UPDATED_AT,
      completed_at: COMPLETED_MOVE_ASSIGNMENT_COMPLETED_AT,
    }], {
      nowMs: COMPLETED_MOVE_ASSIGNMENT_NOW_MS,
    });

    t.equal(
      summary.inFlightCount,
      MOVE_ASSIGNMENT_IN_FLIGHT_COUNT_ZERO,
      'completed move-assignment rows should not contribute to operation drain summary',
    );
    t.equal(
      summary.staleInFlightCount,
      MOVE_ASSIGNMENT_STALE_IN_FLIGHT_COUNT_ZERO,
      'completed move-assignment rows should not contribute to stale drain summary',
    );
    t.same(
      summary.inFlightOperationIds,
      MOVE_ASSIGNMENT_NO_IN_FLIGHT_OPERATION_IDS,
      'completed move-assignment operation id should not appear in current blockers',
    );
  },
);

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
  'replica-operation-liveness keeps REPLACE rows in flight while source remains active',
  async (t) => {
    const summary = summarizeReplicaOperationLiveness([{
      operation_id: 'replace-source-active',
      type: 'REPLACE',
      partition_id: 'nodes-p1',
      entity_type: 'partition',
      entity_id: 'nodes-p1',
      source_node_id: 'seed-node',
      source_replica_id: 'nodes-p1-r1',
      target_node_id: 'node-2',
      replica_id: 'nodes-p1-r4',
      status: 'active',
      workflow_step: 'ACTIVE',
      updated_at: 100,
    }], {
      nowMs: 200,
      serviceRows: [{
        service_id: 'nodes-p1-r4',
        replica_id: 'nodes-p1-r4',
        service_type: 'partition',
        partition_id: 'nodes-p1',
        node_id: 'node-2',
        status: 'active',
      }, {
        service_id: 'nodes-p1-r1',
        replica_id: 'nodes-p1-r1',
        service_type: 'partition',
        partition_id: 'nodes-p1',
        node_id: 'seed-node',
        status: 'active',
      }],
    });

    t.equal(
      summary.inFlightCount,
      1,
      'REPLACE should stay in flight until source ownership is retired',
    );
  },
);

test(
  'replica-operation-liveness treats observed-completed REPLACE rows as not in flight',
  async (t) => {
    const summary = summarizeReplicaOperationLiveness([{
      operation_id: 'replace-active-source-retired',
      type: 'REPLACE',
      partition_id: 'nodes-p1',
      entity_type: 'partition',
      entity_id: 'nodes-p1',
      source_node_id: 'seed-node',
      source_replica_id: 'nodes-p1-r1',
      target_node_id: 'node-2',
      replica_id: 'nodes-p1-r4',
      status: 'active',
      workflow_step: 'ACTIVE',
      updated_at: 100,
    }, {
      operation_id: 'replace-stopping-source-retired',
      type: 'REPLACE',
      partition_id: 'services-p1',
      entity_type: 'partition',
      entity_id: 'services-p1',
      source_node_id: 'seed-node',
      source_replica_id: 'services-p1-r1',
      target_node_id: 'node-3',
      replica_id: 'services-p1-r4',
      status: 'removing',
      workflow_step: 'STOPPING',
      updated_at: 100,
    }], {
      nowMs: 200,
      serviceRows: [{
        service_id: 'nodes-p1-r4',
        replica_id: 'nodes-p1-r4',
        service_type: 'partition',
        partition_id: 'nodes-p1',
        node_id: 'node-2',
        status: 'active',
      }, {
        service_id: 'services-p1-r4',
        replica_id: 'services-p1-r4',
        service_type: 'partition',
        partition_id: 'services-p1',
        node_id: 'node-3',
        status: 'active',
      }],
    });

    t.equal(
      summary.inFlightCount,
      0,
      'topology-completed REPLACE rows should not keep quiescence open',
    );
    t.same(
      summary.inFlightOperationIds,
      [],
      'completed REPLACE rows should be absent from in-flight diagnostics',
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
      record.sourceReplicaId,
      'sql_transactions-p1-r1',
      'normalization should preserve source-replica metadata for replace liveness',
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

test(
  'isReplicaOperationStale bypasses pre-restart operations when ignorePreRestart is true',
  async (t) => {
    const uptimeSec = process.uptime();
    const nowMs = Date.now();
    const systemBootMs = nowMs - Math.floor(uptimeSec * 1000);

    const oldRecord = normalizeReplicaOperationRecord({
      operation_id: 'old-op',
      type: 'MOVE_ASSIGNMENT',
      replica_id: 'mg-1-r2',
      source_node_id: 'seed-node',
      target_node_id: 'target-node',
      status: 'active',
      workflow_step: 'SYNCING',
      updated_at: systemBootMs - 5000,
    }, {
      nowMs,
    });

    const newRecord = normalizeReplicaOperationRecord({
      operation_id: 'new-op',
      type: 'MOVE_ASSIGNMENT',
      replica_id: 'mg-1-r2',
      source_node_id: 'seed-node',
      target_node_id: 'target-node',
      status: 'active',
      workflow_step: 'SYNCING',
      updated_at: systemBootMs + 1000,
    }, {
      nowMs,
    });

    oldRecord.ageMs = 120000;
    newRecord.ageMs = 120000;

    const testOptions = {
      nowMs,
      stepTimeoutMsByWorkflowStep: {
        SYNCING: 5000,
      },
    };

    t.equal(
      isReplicaOperationStale(oldRecord, testOptions),
      true,
      'old record should be stale without bypass',
    );
    t.equal(
      isReplicaOperationStale(newRecord, testOptions),
      true,
      'new record should be stale without bypass',
    );

    t.equal(
      isReplicaOperationStale(oldRecord, { ...testOptions, ignorePreRestart: true }),
      false,
      'old record should NOT be stale with bypass enabled',
    );
    t.equal(
      isReplicaOperationStale(newRecord, { ...testOptions, ignorePreRestart: true }),
      true,
      'new record should still be stale with bypass enabled',
    );
  },
);

test(
  'isReplicaOperationInFlight ignores pre-restart operations based on owner node service startedAt',
  async (t) => {
    const nowMs = 1000;
    const record = normalizeReplicaOperationRecord({
      operation_id: 'op-1',
      type: 'REPLACE',
      partition_id: 'user_data-p1',
      source_node_id: 'node-A',
      target_node_id: 'node-B',
      status: 'syncing',
      workflow_step: 'SYNCING',
      updated_at: 400, // Pre-restart for node-A, post-restart for node-B
    }, {
      nowMs,
    });

    const testOptions = {
      nowMs,
      ignorePreRestart: true,
      serviceRows: [
        {
          service_id: 's1',
          node_id: 'node-A',
          started_at: 500, // Node A restarted at 500
        },
        {
          service_id: 's2',
          node_id: 'node-B',
          started_at: 300, // Node B started at 300
        }
      ]
    };

    // Owner is node-A (since sourceNodeId is node-A).
    // Node-A's max started_at is 500.
    // record.updatedAt is 400.
    // 400 < 500, so it is pre-restart and should be ignored!
    t.equal(
      isReplicaOperationInFlight(record, testOptions),
      false,
      'operation updated before owner node restart should be ignored',
    );

    // If owner was node-B (e.g. if we set target as owner or node-B started at 300 and we check it)
    const recordWithBOwner = normalizeReplicaOperationRecord({
      operation_id: 'op-2',
      type: 'REPLACE',
      partition_id: 'user_data-p1',
      source_node_id: 'node-B',
      target_node_id: 'node-A',
      status: 'syncing',
      workflow_step: 'SYNCING',
      updated_at: 400,
    }, {
      nowMs,
    });

    // Owner is node-B. Node B started at 300.
    // record.updatedAt is 400.
    // 400 >= 300, so it is NOT pre-restart and should NOT be ignored!
    t.equal(
      isReplicaOperationInFlight(recordWithBOwner, testOptions),
      true,
      'operation updated after owner node restart should not be ignored',
    );
  },
);

