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
import Database from 'better-sqlite3';
import {REPLICA_OPERATIONS_SCHEMA} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {generateCreateTableSQL} from
  '../../src/bootstrap/system-table-schema-sql.js';

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

function createCache(targetRows = []) {
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
  const rows = Array.isArray(targetRows) ? targetRows : [targetRows];
  for (const targetRow of rows.filter(Boolean)) {
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
  const operationRows = [row, ...(options.additionalRows || [])];
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
          const operation = operationRows.find(
            (candidate) => candidate.operation_id === params[0],
          );
          return {success: true, rows: operation ? [operation] : []};
        }
        if (sql.includes('entity_type = ?')) {
          await options.snapshotBarrier;
          if (snapshotFailures > 0) {
            snapshotFailures -= 1;
            throw new Error('operation ledger unavailable');
          }
          return {success: true, rows: operationRows.filter((candidate) =>
            candidate.target_node_id === params[0] &&
              candidate.entity_type === params[1] &&
              candidate.create_admission_state !== null)};
        }
        return {success: true, rows: operationRows.filter((candidate) =>
          candidate.replica_id === params[0] &&
            candidate.target_node_id === params[1])};
      }
      if (tableName === SYSTEM_TABLE_NAME.SERVICES &&
          params[0] === options.deferredLifecycleReplicaId) {
        return {success: false, error: 'lifecycle authority deferred'};
      }
      return lifecycle.readAuthoritativeRows(tableName, sql, params);
    },
    async updateSystemTableRow(tableName, where, data) {
      const operation = operationRows.find((candidate) =>
        matches(candidate, where));
      if (tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS || !operation) {
        return {success: true, outcome: 'no_op'};
      }
      Object.assign(operation, data);
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

function routedCreateRequest(row) {
  const admissionToken = buildReplicaCreateAdmissionToken({
    operationId: row.operation_id,
    replicaId: row.replica_id,
    targetNodeId: row.target_node_id,
    workflowUpdatedAt: row.updated_at,
  });
  return {
    [ReplicaOperationField.OPERATION_ID]: row.operation_id,
    [ReplicaOperationField.OPERATION_TYPE]: OperationType.ADD,
    [ReplicaOperationField.ENTITY_TYPE]: row.entity_type,
    [ReplicaOperationField.ENTITY_ID]: row.entity_id,
    [ReplicaOperationField.PARTITION_ID]: row.partition_id,
    [ReplicaOperationField.REPLICA_ID]: row.replica_id,
    [ReplicaOperationField.CREATE_ADMISSION_TOKEN]: admissionToken,
    [ReplicaOperationField.CREATE_ADMISSION_WORKFLOW_UPDATED_AT]: row.updated_at,
    [ReplicaOperationField.CREATE_ADMISSION_ATTEMPT_TOKEN]:
      buildReplicaCreateAttemptToken(admissionToken, 1),
    [ReplicaOperationField.CREATE_ADMISSION_ATTEMPT_SEQ]: 1,
    [ReplicaOperationField.BOOTSTRAP_MEMBERSHIP]:
      committedStampFor(['leader-replica']),
  };
}

async function createHandlerFixture({row, targetRow, additionalTargetRows = [],
  gatewayOptions, authorityFor} = {}) {
  const cache = createCache([targetRow, ...additionalTargetRows]);
  const authority = authorityFor ? authorityFor(cache) :
    gatewayFixture(cache, row, gatewayOptions);
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

// replica_operations on real SQL, so the startup scan's own predicate runs
// (not a mock's reading of it); services rows stay on the lifecycle store.
function sqlOperationsAuthority(cache, rows, bootIncarnation = 102) {
  const lifecycle = createLifecycleControlPlaneGatewayForCache(cache);
  const db = new Database(':memory:');
  db.exec(generateCreateTableSQL(REPLICA_OPERATIONS_SCHEMA));
  for (const row of rows) {
    const columns = Object.keys(row);
    db.prepare(`INSERT INTO replica_operations (${columns.join(', ')}) ` +
      `VALUES (${columns.map(() => '?').join(', ')})`).run(...Object.values(row));
  }
  const gateway = {
    async readAuthoritativeRows(tableName, sql, params = []) {
      if (tableName === SYSTEM_TABLE_NAME.NODES) {
        return {success: true, rows: [{node_id: rows[0].target_node_id,
          boot_incarnation: bootIncarnation}]};
      }
      if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
        return {success: true, rows: db.prepare(sql).all(...params)};
      }
      return lifecycle.readAuthoritativeRows(tableName, sql, params);
    },
    async updateSystemTableRow(tableName, where, data) {
      if (tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
        return {success: true, outcome: 'no_op'};
      }
      const set = Object.keys(data).map((column) => `${column} = ?`).join(', ');
      const match = Object.keys(where).map((column) => `${column} IS ?`).join(' AND ');
      const changes = db.prepare(`UPDATE replica_operations SET ${set} WHERE ${match}`)
        .run(...Object.values(data), ...Object.values(where)).changes;
      return {success: true, outcome: changes === 1 ? 'applied' : 'no_op'};
    },
    submitMutation: lifecycle.submitMutation,
  };
  const read = (operationId) => db.prepare(
    'SELECT * FROM replica_operations WHERE operation_id = ?').get(operationId);
  return {gateway, read, close: () => db.close()};
}

// A message-group REPLACE admission retained by an older boot (FreshMG B1).
function messageGroupAdmissionRow(operationId, replicaId, state) {
  return operationRow({operation_id: operationId, type: OperationType.REPLACE,
    entity_type: 'message_group', entity_id: 'mg-1', partition_id: 'mg-1',
    replica_id: replicaId, steps_history: '[]', create_admission_state: state});
}

describe('ReplicaHandler retained CREATE admission recovery', () => {
  it('leaves older-boot message-group admissions untouched while it recovers a partition one',
    async () => {
      const partition = operationRow();
      const admitted = messageGroupAdmissionRow('op-mg-admitted', 'mg-fresh-a',
        CREATE_ADMISSION_STATE.ADMITTED);
      const materialized = messageGroupAdmissionRow('op-mg-materialized',
        'mg-fresh-m', CREATE_ADMISSION_STATE.MATERIALIZED);
      let authority = null;
      const fixture = await createHandlerFixture({row: partition,
        targetRow: targetLifecycle(partition), authorityFor: (cache) => {
          authority = sqlOperationsAuthority(cache, [partition, admitted, materialized]);
          return authority;
        }});
      const before = [admitted, materialized].map(({operation_id: id}) =>
        authority.read(id));
      const completed = waitForCreateCompletion(fixture.handler);
      fixture.handler.initialize();
      await fixture.handler.awaitReplicaCreateAdmissionRecoveryBarrier();
      await waitForPhysicalStart(fixture);
      fixture.releaseFactory();
      await completed;
      assert.deepEqual([admitted, materialized].map(({operation_id: id}) =>
        authority.read(id)), before,
      'no takeover, advance or CLOSE of a message-group admission row');
      for (const replicaId of ['mg-fresh-a', 'mg-fresh-m']) {
        assert.equal(fixture.cache.get(SYSTEM_TABLE_NAME.SERVICES, replicaId) ?? null,
          null, `no SERVICES row for ${replicaId}`);
      }
      assert.equal(fixture.physicalStarts(), 1, 'only the partition CREATE starts');
      const recovered = authority.read(partition.operation_id);
      assert.equal(recovered.create_admission_owner_incarnation, 102,
        'the partition admission is still taken over (positive control)');
      assert.equal(recovered.create_admission_state, CREATE_ADMISSION_STATE.ACTIVE);
      await fixture.handler.shutdown();
      authority.close();
    });

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
    const response = await fixture.handler.handleCreateReplica(
      routedCreateRequest(row),
    );
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
      await fixture.handler.awaitReplicaCreateAdmissionRecoveryBarrier();
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

  it('isolates a deferred retained row so a later row recovers once',
    async () => {
      const deferredRow = operationRow();
      const laterToken =
        'replica-create-admission:v1:op-2:replica-2:node-1:12';
      const laterRow = operationRow({
        operation_id: 'op-2',
        replica_id: 'replica-2',
        updated_at: 12,
        create_admission_token: laterToken,
        create_admission_replica_created_at: 21,
        create_admission_attempt_token: `${laterToken}:attempt:1`,
        create_admission_workflow_updated_at: 12,
      });
      const fixture = await createHandlerFixture({
        row: deferredRow,
        targetRow: targetLifecycle(deferredRow),
        additionalTargetRows: [targetLifecycle(laterRow)],
        gatewayOptions: {
          bootIncarnation: 102,
          additionalRows: [laterRow],
          deferredLifecycleReplicaId: deferredRow.replica_id,
        },
      });
      const completed = waitForCreateCompletion(fixture.handler);
      fixture.handler.initialize();
      await fixture.handler.replicaCreateAdmissionRecoveryTask;
      await waitForPhysicalStart(fixture);
      assert.equal(fixture.physicalStarts(), 1,
        'the later valid retained row starts despite the earlier deferral');
      const timer = fixture.handler.replicaCreateAdmissionRecoveryRearmOwner
        .current();
      assert.ok(timer, 'one bounded retry remains for the deferred census');
      assert.equal(timer.hasRef(), false);
      fixture.releaseFactory();
      await completed;
      fixture.handler.startReplicaCreateAdmissionRecovery();
      await fixture.handler.replicaCreateAdmissionRecoveryTask;
      assert.equal(fixture.physicalStarts(), 1,
        'retrying the deferred row does not duplicate the recovered worker');
      await fixture.handler.shutdown();
    });

  it('admits a routed CREATE while an unrelated startup scan is pending',
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
      let releaseSnapshot;
      const snapshotBarrier = new Promise((resolve) => {
        releaseSnapshot = resolve;
      });
      const fixture = await createHandlerFixture({
        row,
        targetRow: null,
        gatewayOptions: {bootIncarnation: 102, snapshotBarrier},
      });
      const completed = waitForCreateCompletion(fixture.handler);
      fixture.handler.initialize();
      const response = await fixture.handler.handleCreateReplica(
        routedCreateRequest(row),
      );
      assert.equal(response.status, 'initiated');
      releaseSnapshot();
      fixture.releaseFactory();
      await completed;
      await fixture.handler.shutdown();
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
