import './move-replica-assignment-token-cache-visibility-test-cases.js';
import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {
  BOOTSTRAP_API_ASSIGNMENT,
  BOOTSTRAP_API_HANDOFF_STATUS,
} from '../../src/bootstrap/bootstrap-api-constants.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  STATE,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {
  createCdcIntegrationServiceFixture,
  initializeTestEnvironment,
} from './move-replica-assignment-token-test-helpers.js';

const MOVE_REPLICA_LONG_ASSIGNMENT_LEASE_MS = 60_000;
const EXPIRED_LEASE_OFFSET_MS = 1;
const REMOTE_SOURCE_SWEEP_ASSIGNMENT_ID =
  '550e8400-e29b-41d4-a716-446655440336';
const REMOTE_SOURCE_SWEEP_SOURCE_NODE_ID =
  '550e8400-e29b-41d4-a716-446655440337';
const REMOTE_SOURCE_SWEEP_TARGET_NODE_ID =
  '550e8400-e29b-41d4-a716-446655440338';
const REMOTE_SOURCE_SWEEP_GROUP_ID = 'mg-remote-source-sweep';
const REMOTE_SOURCE_SWEEP_REPLICA_ID = 'mg-remote-source-sweep-r1';
const REMOTE_SOURCE_SWEEP_NODE_ADDRESS = 'ws://localhost:8080';

test('BootstrapAPI sweep defers expired remote-source MOVE_REPLICA invalidation to source owner',
  async (t) => {
    initializeTestEnvironment();
    const now = Date.now();
    const expiredAt = now - EXPIRED_LEASE_OFFSET_MS;
    const rows = {
      services: [],
      nodes: [
        {
          node_id: REMOTE_SOURCE_SWEEP_SOURCE_NODE_ID,
          status: SERVICE_STATUS.ACTIVE,
          connection_state: STATE.READY,
          last_heartbeat: now,
          ready_lease_expires_at: now + MOVE_REPLICA_LONG_ASSIGNMENT_LEASE_MS,
        },
        {
          node_id: REMOTE_SOURCE_SWEEP_TARGET_NODE_ID,
          status: SERVICE_STATUS.ACTIVE,
          connection_state: STATE.READY,
          last_heartbeat: now,
          ready_lease_expires_at: now + MOVE_REPLICA_LONG_ASSIGNMENT_LEASE_MS,
        },
      ],
      partitions: [],
      tables: [],
      message_groups: [],
      replica_operations: [
        {
          operation_id: REMOTE_SOURCE_SWEEP_ASSIGNMENT_ID,
          type: BOOTSTRAP_API_ASSIGNMENT.OPERATION_TYPE,
          partition_id: REMOTE_SOURCE_SWEEP_GROUP_ID,
          replica_id: REMOTE_SOURCE_SWEEP_REPLICA_ID,
          source_node_id: REMOTE_SOURCE_SWEEP_SOURCE_NODE_ID,
          target_node_id: REMOTE_SOURCE_SWEEP_TARGET_NODE_ID,
          status: BOOTSTRAP_API_HANDOFF_STATUS.PREPARING,
          workflow_step: WORKFLOW_STEP.PENDING,
          created_at: now,
          updated_at: now,
          completed_at: expiredAt,
          lease_expires_at: expiredAt,
          error_message: null,
          steps_history: JSON.stringify([]),
          entity_type: SERVICE_TYPE.MESSAGE_GROUP,
          entity_id: REMOTE_SOURCE_SWEEP_GROUP_ID,
        },
      ],
      indices: [],
      config: [],
      logs: [],
      live_queries: [],
      contexts: [],
      code: [],
      node_endpoints: [],
    };
    const systemTableCache = {
      getAll(tableName) {
        return rows[tableName] || [];
      },
      get(tableName, id) {
        return (rows[tableName] || []).find((row) =>
          row.service_id === id ||
          row.node_id === id ||
          row.operation_id === id,
        ) || null;
      },
      filter(tableName, predicate) {
        return (rows[tableName] || []).filter(predicate);
      },
      getReadyNodes() {
        return [
          REMOTE_SOURCE_SWEEP_SOURCE_NODE_ID,
          REMOTE_SOURCE_SWEEP_TARGET_NODE_ID,
        ];
      },
    };
    const api = new BootstrapAPI({
      seedNodeId: REMOTE_SOURCE_SWEEP_TARGET_NODE_ID,
      seedNodeAddress: REMOTE_SOURCE_SWEEP_NODE_ADDRESS,
      systemTableCache,
      messageGroupServices: new Map(),
      cdcIntegrationService: createCdcIntegrationServiceFixture(rows),
    });
    await api.initialize(0, {listen: false});
    api.setSqlQueryEngine({
      async executeQuery() {
        return {success: true, rows: rows.replica_operations};
      },
    });
    t.teardown(async () => {
      await api.shutdown();
    });

    await api.expireMoveReplicaAssignmentReservations();

    const reservationRow = rows.replica_operations.find((row) =>
      row.operation_id === REMOTE_SOURCE_SWEEP_ASSIGNMENT_ID,
    );
    t.equal(
      reservationRow?.status,
      BOOTSTRAP_API_HANDOFF_STATUS.PREPARING,
      'target-local sweep should not terminalize a remote-source assignment',
    );
    t.equal(
      reservationRow?.workflow_step,
      WORKFLOW_STEP.PENDING,
      'remote-source assignment should remain source-owned after target sweep',
    );
    t.equal(
      reservationRow?.error_message,
      null,
      'target-local sweep should not persist a synthetic source-owner failure',
    );
  });
