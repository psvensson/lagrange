import {createReplicaHandlerFixture} from
  './replica-handler-construction-fixture.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach} from 'node:test';

import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
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
} from './lifecycle-state-store.js';
import {bindRegisteredReplicaHandler} from
  './replica-handler-identity-fixture.js';
import {committedStampFor} from '../node/replica-handler-bootstrap-stamps.js';
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

function createCache(targetRows = [], {partitionId = 'partition-1',
  tableId = 'table-1', tableName = 'test_table'} = {}) {
  const cache = new SystemTableCache();
  cache.applySystemTableChange(SYSTEM_TABLE_NAME.TABLES, 'INSERT', {
    table_id: tableId,
    table_name: tableName,
    schema_definition: JSON.stringify({
      columns: [{name: 'id', type: 'TEXT', primaryKey: true}],
    }),
  });
  cache.applySystemTableChange(SYSTEM_TABLE_NAME.PARTITIONS, 'INSERT', {
    partition_id: partitionId,
    table_id: tableId,
    partition_key_start: null,
    partition_key_end: null,
    leader_node_id: 'leader-node',
  });
  cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
    service_id: 'leader-replica',
    service_type: 'partition',
    partition_id: partitionId,
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
  let bootReadFailures = 0;
  let snapshotFailures = options.snapshotFailures ?? 0;
  const gateway = {
    async readAuthoritativeRows(tableName, sql, params) {
      if (tableName === SYSTEM_TABLE_NAME.NODES) {
        if (bootReadFailures > 0) {
          bootReadFailures -= 1;
          return {success: false, error: 'nodes authority deferred'};
        }
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
    failNextBootReads(count = 1) {
      bootReadFailures = count;
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
  gatewayOptions, authorityFor, timeSource, executorOutcomeEmitter, tableId, tableName} = {}) {
  const cache = createCache([targetRow, ...additionalTargetRows],
    {partitionId: row.partition_id, tableId, tableName});
  const authority = authorityFor ? authorityFor(cache) :
    gatewayFixture(cache, row, gatewayOptions);
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'create-recovery-'));
  tempDirs.push(dataDir);
  let physicalStarts = 0;
  let physicalShutdowns = 0;
  let releaseFactory;
  const factoryGate = new Promise((resolve) => {
    releaseFactory = resolve;
  });
  const replicaStateMachine = timeSource ? new ReplicaStateMachine({
    nodeId: row.target_node_id,
    ownerIncarnation: gatewayOptions?.bootIncarnation ?? 102,
    cdcIntegrationService: {},
    controlPlaneSystemTableGateway: authority.gateway,
    systemTableCache: cache,
    timeSource,
  }) : undefined;
  const factoryEvidence = [];
  const handler = createReplicaHandlerFixture(ReplicaHandler, {
    nodeId: row.target_node_id,
    ownerIncarnation: gatewayOptions?.bootIncarnation ?? 102,
    cdcIntegrationService: {},
    controlPlaneSystemTableGateway: authority.gateway,
    systemTableCache: cache,
    dataDir,
    timeSource,
    replicaStateMachine,
    executorOutcomeEmitter,
    createPartitionService: async (factoryOptions) => {
      physicalStarts += 1;
      if (authority.read) {
        const owner = handler.getReplicaCreateAdmissionOwner();
        const claim = owner.activePhysicalWorkerOperationIds.get(row.operation_id);
        factoryEvidence.push({
          operation: authority.read(row.operation_id),
          lifecycle: authority.lifecycleStore?.durableRow(
            SYSTEM_TABLE_NAME.SERVICES, row.replica_id),
          worker: owner.snapshotInstallAuthority(claim),
          workerIncarnation: owner.ownerIncarnation,
        });
      }
      await factoryGate;
      return bindRegisteredReplicaHandler({
        partitionId: factoryOptions.partitionId,
        replicaId: factoryOptions.replicaId,
        initialized: true,
        role: 'follower',
        async shutdown() {
          physicalShutdowns += 1;
        },
        async syncFromLeader() {},
        // A CREATE target asks its leader to admit it after its SYNCING commit
        // (replica-admission-from-committed-operation); this double admits.
        async requestReplicaAdmission(operationId) {
          return {operationId, state: 'admitted', lastOutcome: 'proposed'};
        },
      }, factoryOptions);
    },
  });
  return {
    authority,
    cache,
    handler,
    releaseFactory,
    physicalStarts: () => physicalStarts,
    physicalShutdowns: () => physicalShutdowns,
    factoryEvidence,
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
  let currentBoot = bootIncarnation;
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
          boot_incarnation: currentBoot}]};
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
  return {gateway, read, lifecycleStore: lifecycle.store,
    setBootIncarnation(value) {
      currentBoot = value;
    }, close: () => db.close()};
}


export {createHandlerFixture, operationRow, routedCreateRequest,
  sqlOperationsAuthority, targetLifecycle, waitForCreateCompletion, waitForPhysicalStart};
