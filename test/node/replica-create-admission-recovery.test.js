import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, it} from 'node:test';

import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {
  CREATE_ADMISSION_STATE,
} from '../../src/node/replica-create-admission-owner.js';
import {OperationType, ReplicaStatus} from
  '../../src/rebalancer/replica-status.js';
import {ReplicaOperationField} from
  '../../src/rebalancer/replica-operation-constants.js';
import {
  buildReplicaCreateAdmissionToken,
  buildReplicaCreateAttemptToken,
} from '../../src/rebalancer/replica-create-admission-token.js';
import {
  createLifecycleControlPlaneGatewayForCache,
} from '../test-helpers/lifecycle-state-store.js';
import {bindRegisteredReplicaHandler} from
  '../test-helpers/replica-handler-identity-fixture.js';
import {committedStampFor} from './replica-handler-bootstrap-stamps.js';

const tempDirs = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) =>
    fs.rm(directory, {recursive: true, force: true})));
});

function matches(row, where) {
  return Object.entries(where).every(([field, value]) => row?.[field] === value);
}

function operationRow(overrides = {}) {
  const admissionToken = 'replica-create-admission:v1:op-1:replica-1:node-1:11';
  return {
    operation_id: 'op-1',
    type: OperationType.ADD,
    entity_type: 'partition',
    entity_id: 'partition-1',
    partition_id: 'partition-1',
    replica_id: 'replica-1',
    source_node_id: 'seed-node',
    target_node_id: 'node-1',
    status: ReplicaStatus.CREATING,
    workflow_step: 'SENDING',
    created_at: 10,
    updated_at: 11,
    completed_at: null,
    error_message: null,
    steps_history: JSON.stringify([{
      bootstrapMembership: committedStampFor(['leader-replica']),
    }]),
    create_admission_state: CREATE_ADMISSION_STATE.MATERIALIZED,
    create_admission_token: admissionToken,
    create_admission_replica_created_at: 20,
    create_admission_attempt_token: `${admissionToken}:attempt:1`,
    create_admission_previous_attempt_token: null,
    create_admission_attempt_seq: 1,
    create_admission_workflow_updated_at: 11,
    create_admission_owner_incarnation: 101,
    ...overrides,
  };
}

function createCache(targetRow = null) {
  const cache = new SystemTableCache();
  cache.applySystemTableChange(SYSTEM_TABLE_NAME.TABLES, 'INSERT', {
    table_id: 'table-1',
    table_name: 'test_table',
    schema_definition: JSON.stringify({
      columns: [{name: 'id', type: 'TEXT', primaryKey: true}],
    }),
  });
  cache.applySystemTableChange(SYSTEM_TABLE_NAME.PARTITIONS, 'INSERT', {
    partition_id: 'partition-1',
    table_id: 'table-1',
    partition_key_start: null,
    partition_key_end: null,
    leader_node_id: 'leader-node',
  });
  cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
    service_id: 'leader-replica',
    service_type: 'partition',
    partition_id: 'partition-1',
    node_id: 'leader-node',
    replica_id: 'leader-replica',
    group_id: null,
    raft_role: 'leader',
    status: ReplicaStatus.ACTIVE,
    address: 'leader-node/partition/leader-replica',
    cleanup_token: null,
    create_attempt_token: null,
    created_at: 1,
    state_entered_at: 1,
    updated_at: 1,
  });
  if (targetRow) {
    cache.applySystemTableChange(
      SYSTEM_TABLE_NAME.SERVICES,
      'INSERT',
      targetRow,
    );
  }
  return cache;
}

function targetLifecycle(row, overrides = {}) {
  return {
    service_id: row.replica_id,
    service_type: 'partition',
    partition_id: row.partition_id,
    node_id: row.target_node_id,
    replica_id: row.replica_id,
    group_id: null,
    raft_role: null,
    status: ReplicaStatus.CREATING,
    address: `${row.target_node_id}/partition/${row.replica_id}`,
    cleanup_token: null,
    create_attempt_token: row.create_admission_attempt_token,
    created_at: row.create_admission_replica_created_at,
    state_entered_at: 20,
    updated_at: 20,
    ...overrides,
  };
}

function gatewayFixture(cache, row, options = {}) {
  const lifecycle = createLifecycleControlPlaneGatewayForCache(cache);
  let bootIncarnation = options.bootIncarnation ?? 102;
  let snapshotFailures = options.snapshotFailures ?? 0;
  const gateway = {
    async readAuthoritativeRows(tableName, sql, params) {
      if (tableName === SYSTEM_TABLE_NAME.NODES) {
        return {success: true, rows: [{
          node_id: row.target_node_id,
          boot_incarnation: bootIncarnation,
        }]};
      }
      if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
        if (sql.includes('WHERE operation_id = ?')) {
          return {success: true, rows:
            row.operation_id === params[0] ? [row] : []};
        }
        if (params.length === 1) {
          if (snapshotFailures > 0) {
            snapshotFailures -= 1;
            throw new Error('operation ledger unavailable');
          }
          return {success: true, rows:
            row.target_node_id === params[0] &&
              row.create_admission_state !== null ? [row] : []};
        }
        return {success: true, rows:
          row.replica_id === params[0] && row.target_node_id === params[1] ?
            [row] : []};
      }
      return lifecycle.readAuthoritativeRows(tableName, sql, params);
    },
    async updateSystemTableRow(tableName, where, data) {
      if (tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS ||
          !matches(row, where)) {
        return {success: true, outcome: 'no_op'};
      }
      Object.assign(row, data);
      return {success: true, outcome: 'applied'};
    },
    submitMutation: lifecycle.submitMutation,
  };
  return {
    gateway,
    setBootIncarnation(value) {
      bootIncarnation = value;
    },
  };
}

async function createHandlerFixture({row, targetRow, gatewayOptions} = {}) {
  const cache = createCache(targetRow);
  const authority = gatewayFixture(cache, row, gatewayOptions);
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'create-recovery-'));
  tempDirs.push(dataDir);
  let physicalStarts = 0;
  let releaseFactory;
  const factoryGate = new Promise((resolve) => {
    releaseFactory = resolve;
  });
  const handler = new ReplicaHandler({
    nodeId: row.target_node_id,
    ownerIncarnation: gatewayOptions?.bootIncarnation ?? 102,
    cdcIntegrationService: {},
    controlPlaneSystemTableGateway: authority.gateway,
    systemTableCache: cache,
    dataDir,
    createPartitionService: async (factoryOptions) => {
      physicalStarts += 1;
      await factoryGate;
      return bindRegisteredReplicaHandler({
        partitionId: factoryOptions.partitionId,
        replicaId: factoryOptions.replicaId,
        initialized: true,
        role: 'follower',
        async shutdown() {},
        async syncFromLeader() {},
      }, factoryOptions);
    },
  });
  return {
    authority,
    cache,
    handler,
    releaseFactory,
    physicalStarts: () => physicalStarts,
  };
}

async function waitForPhysicalStart(fixture) {
  for (let turn = 0; fixture.physicalStarts() === 0 && turn < 40; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function waitForCreateCompletion(handler) {
  return new Promise((resolve, reject) => {
    handler.once('replicaCreated', resolve);
    handler.once('replicaCreationFailed', (event) => {
      reject(new Error(event?.error || 'replica creation failed'));
    });
  });
}

describe('ReplicaHandler retained CREATE admission recovery', () => {
  it('terminal-first routed CREATE performs no physical work', async () => {
    const row = operationRow({
      status: ReplicaStatus.FAILED,
      workflow_step: 'FAILED',
      completed_at: 12,
      create_admission_state: null,
      create_admission_token: null,
      create_admission_replica_created_at: null,
      create_admission_attempt_token: null,
      create_admission_previous_attempt_token: null,
      create_admission_attempt_seq: null,
      create_admission_workflow_updated_at: null,
      create_admission_owner_incarnation: null,
    });
    const fixture = await createHandlerFixture({row, targetRow: null});
    fixture.handler.initialize();
    await fixture.handler.awaitReplicaCreateAdmissionRecoveryBarrier();
    const admissionToken = buildReplicaCreateAdmissionToken({
      operationId: row.operation_id,
      replicaId: row.replica_id,
      targetNodeId: row.target_node_id,
      workflowUpdatedAt: row.updated_at,
    });
    const response = await fixture.handler.handleCreateReplica({
      [ReplicaOperationField.OPERATION_ID]: row.operation_id,
      [ReplicaOperationField.OPERATION_TYPE]: OperationType.ADD,
      [ReplicaOperationField.ENTITY_TYPE]: row.entity_type,
      [ReplicaOperationField.ENTITY_ID]: row.entity_id,
      [ReplicaOperationField.PARTITION_ID]: row.partition_id,
      [ReplicaOperationField.REPLICA_ID]: row.replica_id,
      [ReplicaOperationField.CREATE_ADMISSION_TOKEN]: admissionToken,
      [ReplicaOperationField.CREATE_ADMISSION_WORKFLOW_UPDATED_AT]:
        row.updated_at,
      [ReplicaOperationField.CREATE_ADMISSION_ATTEMPT_TOKEN]:
        buildReplicaCreateAttemptToken(admissionToken, 1),
      [ReplicaOperationField.CREATE_ADMISSION_ATTEMPT_SEQ]: 1,
      [ReplicaOperationField.BOOTSTRAP_MEMBERSHIP]:
        committedStampFor(['leader-replica']),
    });
    assert.equal(response.status, 'error');
    assert.match(response.error, /Terminal/u);
    assert.equal(fixture.physicalStarts(), 0);
    assert.equal(row.create_admission_state, null);
    await fixture.handler.shutdown();
  });

  it('takes over CREATING work on the current boot and starts one worker',
    async () => {
      const row = operationRow();
      const fixture = await createHandlerFixture({
        row,
        targetRow: targetLifecycle(row),
      });
      const completed = waitForCreateCompletion(fixture.handler);
      fixture.handler.initialize();
      await fixture.handler.awaitReplicaCreateAdmissionRecoveryBarrier();
      await waitForPhysicalStart(fixture);
      assert.equal(row.create_admission_owner_incarnation, 102);
      assert.equal(fixture.physicalStarts(), 1);
      fixture.releaseFactory();
      await completed;
      assert.equal(row.create_admission_state, CREATE_ADMISSION_STATE.ACTIVE);
      await fixture.handler.shutdown();
    });

  it('completes the operation-first ROTATING half-write before restart',
    async () => {
      const base = operationRow();
      const previousAttempt = base.create_admission_attempt_token;
      const currentAttempt = `${base.create_admission_token}:attempt:2`;
      const row = operationRow({
        create_admission_state: CREATE_ADMISSION_STATE.ROTATING,
        create_admission_attempt_token: currentAttempt,
        create_admission_previous_attempt_token: previousAttempt,
        create_admission_attempt_seq: 2,
      });
      const fixture = await createHandlerFixture({
        row,
        targetRow: targetLifecycle(row, {
          status: ReplicaStatus.FAILED,
          create_attempt_token: previousAttempt,
        }),
      });
      const completed = waitForCreateCompletion(fixture.handler);
      fixture.handler.initialize();
      await fixture.handler.awaitReplicaCreateAdmissionRecoveryBarrier();
      await waitForPhysicalStart(fixture);
      assert.equal(row.create_admission_state,
        CREATE_ADMISSION_STATE.MATERIALIZED);
      assert.equal(fixture.cache.get(
        SYSTEM_TABLE_NAME.SERVICES,
        row.replica_id,
      ).create_attempt_token, currentAttempt);
      assert.equal(fixture.physicalStarts(), 1);
      fixture.releaseFactory();
      await completed;
      assert.equal(row.create_admission_state, CREATE_ADMISSION_STATE.ACTIVE);
      await fixture.handler.shutdown();
    });

  it('finishes the lifecycle-first ROTATING half-write and resumes once',
    async () => {
      const base = operationRow();
      const previousAttempt = base.create_admission_attempt_token;
      const currentAttempt = `${base.create_admission_token}:attempt:2`;
      const row = operationRow({
        create_admission_state: CREATE_ADMISSION_STATE.ROTATING,
        create_admission_attempt_token: currentAttempt,
        create_admission_previous_attempt_token: previousAttempt,
        create_admission_attempt_seq: 2,
      });
      const fixture = await createHandlerFixture({
        row,
        targetRow: targetLifecycle(row, {
          create_attempt_token: currentAttempt,
        }),
      });
      const completed = waitForCreateCompletion(fixture.handler);
      fixture.handler.initialize();
      await fixture.handler.awaitReplicaCreateAdmissionRecoveryBarrier();
      await waitForPhysicalStart(fixture);
      assert.equal(row.create_admission_state,
        CREATE_ADMISSION_STATE.MATERIALIZED);
      assert.equal(fixture.physicalStarts(), 1);
      fixture.releaseFactory();
      await completed;
      assert.equal(row.create_admission_state, CREATE_ADMISSION_STATE.ACTIVE);
      await fixture.handler.shutdown();
    });

  it('closes a materialized admission when its lifecycle row was removed',
    async () => {
      const row = operationRow();
      const fixture = await createHandlerFixture({row, targetRow: null});
      fixture.handler.initialize();
      await assert.rejects(
        fixture.handler.awaitReplicaCreateAdmissionRecoveryBarrier(),
        /refused resurrection/,
      );
      assert.equal(row.create_admission_state, CREATE_ADMISSION_STATE.CLOSED);
      assert.equal(fixture.physicalStarts(), 0);
      await fixture.handler.shutdown();
    });

  it('keeps an unavailable scan retryable and cancels its unref timer',
    async () => {
      const row = operationRow();
      const fixture = await createHandlerFixture({
        row,
        targetRow: targetLifecycle(row),
        gatewayOptions: {bootIncarnation: 102, snapshotFailures: 1},
      });
      fixture.handler.initialize();
      await fixture.handler.replicaCreateAdmissionRecoveryTask;
      const timer = fixture.handler.replicaCreateAdmissionRecoveryRearmOwner
        .current();
      assert.ok(timer);
      assert.equal(timer.hasRef(), false);
      await fixture.handler.shutdown();
      assert.equal(fixture.handler.replicaCreateAdmissionRecoveryRearmOwner
        .current(), null);
      assert.equal(fixture.physicalStarts(), 0);
    });

  it('does not make direct bootstrap recovery depend on the operation ledger',
    async () => {
      const row = operationRow({
        create_admission_state: null,
        create_admission_token: null,
        create_admission_replica_created_at: null,
        create_admission_attempt_token: null,
        create_admission_previous_attempt_token: null,
        create_admission_attempt_seq: null,
        create_admission_workflow_updated_at: null,
        create_admission_owner_incarnation: null,
      });
      const fixture = await createHandlerFixture({
        row,
        targetRow: null,
        gatewayOptions: {bootIncarnation: 102, snapshotFailures: 1},
      });
      fixture.handler.initialize();
      await fixture.handler.replicaCreateAdmissionRecoveryTask;
      const completed = waitForCreateCompletion(fixture.handler);
      const response = await fixture.handler.handleCreateReplica({
        [ReplicaOperationField.OPERATION_ID]: 'bootstrap-op',
        [ReplicaOperationField.PARTITION_ID]: row.partition_id,
        [ReplicaOperationField.REPLICA_ID]: row.replica_id,
        [ReplicaOperationField.BOOTSTRAP_MEMBERSHIP]:
          committedStampFor(['leader-replica']),
      });
      assert.equal(response.status, 'initiated');
      await waitForPhysicalStart(fixture);
      assert.equal(fixture.physicalStarts(), 1);
      fixture.releaseFactory();
      await completed;
      await fixture.handler.shutdown();
    });
});
