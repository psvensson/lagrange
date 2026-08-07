/**
 * Existing-group ADD topology-guard regression tests (rebalancer safety-audit
 * finding 8, quest existing-group-add-topology-guard).
 *
 * Receipts:
 * - self-only-cohort-add-deferred: an explicit ADD join into a NON-fresh
 *   partition that resolves to a self-only cohort (no dispatched hints, cache
 *   lag) is deferred through the retryable topology-missing classification —
 *   the same authoritative hydration retry loop the REPLACE guard (CL-013)
 *   already uses — instead of solo-bootstrapping an isolated raft group. The
 *   fresh-bootstrap window stays exempt so CREATE TABLE first cohorts can
 *   still form.
 * - cohort-stamp-authoritative-read: coordinator cohort stamping merges the
 *   same authoritative services-owner rows the create-time admission guard
 *   reads, so a standard-path ADD persists the full cohort even while the
 *   local cache view lags behind the owner.
 * - dead-leader-branch-preserved: with sibling peers resolved but no viable
 *   leader, existingReplicaCount stays 0 (voter-mode re-formation) for both
 *   REPLACE and ADD — the dead-leader recovery branch is NOT closed.
 *
 * Every receipt test is red-on-revert: reverting the ADD arm of the join
 * guard flips the first test red; reverting cohort stamping to the
 * cache-only read flips the second test red; the third test pins the branch
 * the quest must preserve.
 */

import {test} from '../../src/test-helpers/tap.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {RebalanceCoordinator} from
  '../../src/rebalancer/rebalance-coordinator.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  ReplicaOperationField,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  REBALANCE_COORDINATOR_EVENT,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  STORAGE_ADMISSION_DECISION_TYPE,
} from '../../src/rebalancer/storage-admission-constants.js';
import {
  createMockCache,
  createMockCdcService,
  createMockMessageRouter,
  createMockPolicyService,
  createMockControlPlaneReadinessService,
  createMockTransactionCoordinator,
} from './test-helpers.js';

const TEST_SCHEMA = Object.freeze({
  columns: [{name: 'id', type: 'TEXT', primaryKey: true}],
});
const ESTABLISHED_PARTITION_AGE_MS = 60000;
const ESTABLISHED_PARTITION_UPDATE_DELAY_MS = 5000;
const HANDLER_SYNC_TIMEOUT_MS = 250;
const COORDINATOR_VISIBILITY_TIMEOUT_MS = 25;
const COORDINATOR_VISIBILITY_RETRY_DELAY_MS = 5;

const ADD_PARTITION_ID = 'p-add-guard';
const ADD_REPLICA_ID = `${ADD_PARTITION_ID}-r4`;
const ADD_TABLE_ID = 'table-add-guard';
const SEED_NODE_ID = 'node-seed';
const JOIN_NODE_ID = 'node-learner';

const COHORT_PARTITION_ID = 'p-cohort-stamp';
const COHORT_TARGET_NODE_ID = 'node-cohort-target';
const COHORT_TARGET_REPLICA_ID = `${COHORT_PARTITION_ID}-r3`;
const COHORT_REPLICA_ONE_ID = `${COHORT_PARTITION_ID}-r1`;
const COHORT_REPLICA_TWO_ID = `${COHORT_PARTITION_ID}-r2`;

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({logging: {level: 'error'}});
  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

function getTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'add-topology-guard-test-'));
}

/**
 * Seed a cache with table + established (non-fresh) partition metadata but no
 * sibling SERVICES rows — the cache-lag view the guard must not trust.
 */
function createEstablishedPartitionCache({partitionId, tableId}) {
  const cache = new SystemTableCache();
  cache.applySystemTableChange(SYSTEM_TABLE_NAME.TABLES, 'INSERT', {
    table_id: tableId,
    table_name: 'test_table',
    schema_definition: JSON.stringify(TEST_SCHEMA),
  });
  const createdAt = Date.now() - ESTABLISHED_PARTITION_AGE_MS;
  cache.applySystemTableChange(SYSTEM_TABLE_NAME.PARTITIONS, 'INSERT', {
    partition_id: partitionId,
    table_id: tableId,
    partition_key_start: null,
    partition_key_end: null,
    leader_node_id: SEED_NODE_ID,
    created_at: createdAt,
    updated_at: createdAt + ESTABLISHED_PARTITION_UPDATE_DELAY_MS,
  });
  return cache;
}

function seedSiblingServiceRow(cache, {partitionId, replicaId, nodeId}) {
  const now = Date.now();
  cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
    service_id: replicaId,
    service_type: SERVICE_TYPE.PARTITION,
    partition_id: partitionId,
    node_id: nodeId,
    status: ReplicaStatus.ACTIVE,
    raft_role: 'follower',
    address: `${nodeId}/partition/${replicaId}`,
    created_at: now,
    updated_at: now,
  });
}

function createCapturingPartitionServiceFactory(captured) {
  return async (options) => {
    captured.options = options;
    return {
      partitionId: options.partitionId,
      replicaId: options.replicaId,
      initialized: true,
      async shutdown() {},
      async syncFromLeader() {},
    };
  };
}

function createJoinHandler({cache, captured}) {
  const handler = new ReplicaHandler({
    nodeId: JOIN_NODE_ID,
    cdcIntegrationService: {
      async insertSystemTableRow() {
        return {success: true};
      },
      async updateSystemTableRow() {
        return {success: true};
      },
      async upsertSystemTableRow() {
        return {success: true};
      },
      async deleteSystemTableRow() {
        return {success: true};
      },
    },
    systemTableCache: cache,
    dataDir: getTempDir(),
    createPartitionService: createCapturingPartitionServiceFactory(captured),
  });
  handler.initialize();
  handler.syncTimeoutMs = HANDLER_SYNC_TIMEOUT_MS;
  return handler;
}

function waitForReplicaEvent(handler, successEvent, failureEvent) {
  return new Promise((resolve, reject) => {
    handler.once(successEvent, resolve);
    handler.once(failureEvent, (event) => {
      reject(new Error(event?.error || 'operation failed'));
    });
  });
}

// --- self-only-cohort-add-deferred ---

test('self-only-cohort-add-deferred: explicit ADD into an established ' +
  'partition with a self-only resolved cohort defers retryably instead of ' +
  'solo-bootstrapping an isolated group',
async (t) => {
  initializeTestEnvironment();
  const cache = createEstablishedPartitionCache({
    partitionId: ADD_PARTITION_ID,
    tableId: ADD_TABLE_ID,
  });
  const captured = {options: null};
  const handler = createJoinHandler({cache, captured});

  try {
    // No hydration authority is wired in this fixture: the retry loop
    // exhausts its budget and surfaces the retryable topology-missing class,
    // which is exactly the deferral contract (the operation is re-driven
    // after authoritative hydration rather than dispatched self-only).
    let failure = null;
    handler.once('replicaCreationFailed', (event) => {
      failure = event;
    });
    const unexpectedCreate = waitForReplicaEvent(
      handler,
      'replicaCreated',
      'replicaCreated',
    ).then(() => {
      throw new Error('self-only ADD must not create a replica');
    });
    await handler.handleCreateReplica({
      operationId: 'op-add-self-only',
      operationType: OperationType.ADD,
      partitionId: ADD_PARTITION_ID,
      replicaId: ADD_REPLICA_ID,
    });
    await Promise.race([
      unexpectedCreate,
      new Promise((resolve) => {
        const deadline = Date.now() + HANDLER_SYNC_TIMEOUT_MS * 2;
        const poll = () => {
          if (failure || Date.now() >= deadline) {
            resolve();
            return;
          }
          setTimeout(poll, HANDLER_SYNC_TIMEOUT_MS / 10);
        };
        poll();
      }),
    ]);

    t.equal(
      captured.options,
      null,
      'no partition service created — self-only ADD bootstrap deferred',
    );
    t.match(
      String(failure?.error || ''),
      /join topology unavailable/,
      'failure carries the retryable topology-missing class that routes ' +
        'into the authoritative hydration retry loop',
    );
  } finally {
    handler.shutdown();
  }
});

test('self-only-cohort-add-deferred: the fresh-bootstrap window stays ' +
  'exempt — a first-cohort ADD on a fresh partition may form the group',
async (t) => {
  initializeTestEnvironment();
  const cache = new SystemTableCache();
  cache.applySystemTableChange(SYSTEM_TABLE_NAME.TABLES, 'INSERT', {
    table_id: ADD_TABLE_ID,
    table_name: 'test_table',
    schema_definition: JSON.stringify(TEST_SCHEMA),
  });
  const now = Date.now();
  cache.applySystemTableChange(SYSTEM_TABLE_NAME.PARTITIONS, 'INSERT', {
    partition_id: ADD_PARTITION_ID,
    table_id: ADD_TABLE_ID,
    partition_key_start: null,
    partition_key_end: null,
    leader_node_id: null,
    created_at: now,
    updated_at: now,
  });
  const captured = {options: null};
  const handler = createJoinHandler({cache, captured});

  try {
    const outcome = waitForReplicaEvent(
      handler,
      'replicaCreated',
      'replicaCreationFailed',
    );
    await handler.handleCreateReplica({
      operationId: 'op-add-fresh',
      operationType: OperationType.ADD,
      partitionId: ADD_PARTITION_ID,
      replicaId: ADD_REPLICA_ID,
    });
    await outcome;

    t.ok(
      captured.options,
      'fresh-bootstrap ADD still creates the partition service',
    );
    t.equal(
      captured.options.isJoiningExistingGroup,
      false,
      'fresh cohort formation keeps voter bootstrap mode',
    );
  } finally {
    handler.shutdown();
  }
});

// --- dead-leader-branch-preserved ---

test('dead-leader-branch-preserved: sibling peers with no viable leader ' +
  'keep existingReplicaCount at 0 (voter-mode re-formation) for REPLACE ' +
  'and ADD alike',
async (t) => {
  initializeTestEnvironment();
  const cache = createEstablishedPartitionCache({
    partitionId: ADD_PARTITION_ID,
    tableId: ADD_TABLE_ID,
  });
  seedSiblingServiceRow(cache, {
    partitionId: ADD_PARTITION_ID,
    replicaId: `${ADD_PARTITION_ID}-r1`,
    nodeId: 'node-unreachable',
  });
  const captured = {options: null};
  const handler = createJoinHandler({cache, captured});

  try {
    for (const operationType of [
      OperationType.REPLACE,
      OperationType.ADD,
    ]) {
      const context = handler.resolveReplicaContext(
        ADD_PARTITION_ID,
        ADD_REPLICA_ID,
        {explicitOperationType: operationType},
      );
      t.equal(
        context.existingReplicaCount,
        0,
        `${operationType}: no viable leader resolves to the dead-leader ` +
          're-formation branch (0), not a leader-join count',
      );
      t.ok(
        context.replicaIds.length > 1,
        `${operationType}: sibling peers are present — only the leader ` +
          'viability branch is exercised',
      );
    }
  } finally {
    handler.shutdown();
  }
});

// --- cohort-stamp-authoritative-read ---

function createCohortServiceRow(replicaId, nodeId) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: COHORT_PARTITION_ID,
    group_id: null,
    node_id: nodeId,
    service_type: SERVICE_TYPE.PARTITION,
    status: 'active',
    raft_role: 'follower',
    address: `${nodeId}/partition/${replicaId}`,
  };
}

function createCohortSqlEngine({authoritativeServices}) {
  const operations = new Map();
  return {
    operations,
    executeQuery: async (sql, params = []) => {
      if (
        sql.includes('SELECT * FROM services') &&
        sql.includes('service_type = ?')
      ) {
        const rows = authoritativeServices.filter(
          (row) => row.partition_id === params[1],
        );
        return {success: true, rows};
      }
      if (sql.includes('INSERT INTO replica_operations')) {
        const [
          operationId, type, partitionId, replicaId, targetClaimKey,
          sourceNodeId, targetNodeId, status, workflowStep, createdAt,
          updatedAt, completedAt, errorMessage, stepsHistory, entityType,
          entityId,
        ] = params;
        operations.set(operationId, {
          operation_id: operationId,
          type,
          partition_id: partitionId,
          replica_id: replicaId,
          target_claim_key: targetClaimKey,
          source_node_id: sourceNodeId,
          target_node_id: targetNodeId,
          status,
          workflow_step: workflowStep,
          created_at: createdAt,
          updated_at: updatedAt,
          completed_at: completedAt,
          error_message: errorMessage,
          steps_history: stepsHistory,
          entity_type: entityType,
          entity_id: entityId,
        });
        return {success: true, changes: 1};
      }
      if (sql.includes('replica_operations')) {
        return {success: true, rows: [...operations.values()]};
      }
      return {success: true, rows: []};
    },
  };
}

test('cohort-stamp-authoritative-read: a standard-path ADD persists the ' +
  'authoritative cohort while the cache view lags the services owner',
async (t) => {
  initializeTestEnvironment();
  const authoritativeServices = [
    createCohortServiceRow(COHORT_REPLICA_ONE_ID, 'node-cohort-a'),
    createCohortServiceRow(COHORT_REPLICA_TWO_ID, 'node-cohort-b'),
  ];
  // Cache lag: the local cache shows NO sibling service rows for the
  // partition; only the authoritative owner read knows the group.
  const cache = createMockCache({services: []});
  const sqlEngine = createCohortSqlEngine({authoritativeServices});
  const coordinator = new RebalanceCoordinator({
    nodeId: 'node-cohort-coordinator',
    systemTableCache: cache,
    cdcIntegrationService: createMockCdcService(),
    controlPlaneSystemTableGateway: {
      readAuthoritativeRows: async (_tableName, sql, params = []) =>
        sqlEngine.executeQuery(sql, params),
      readRows: async (_tableName, sql, params = []) =>
        sqlEngine.executeQuery(sql, params),
      executeQuery: async (sql, params = []) =>
        sqlEngine.executeQuery(sql, params),
    },
    tablePolicyService: createMockPolicyService(),
    messageRouter: createMockMessageRouter(),
    sqlQueryEngine: sqlEngine,
    transactionCoordinator: createMockTransactionCoordinator(),
    controlPlaneReadinessService: createMockControlPlaneReadinessService({
      systemTableCache: cache,
    }),
    storageAdmissionService: {
      checkAdd: async () => ({
        allowed: true,
        decisionType: STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
      }),
      checkReplace: async () => ({
        allowed: true,
        decisionType: STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
      }),
    },
    storageAccountingService: {
      estimateReplicaBytes: () => 1,
    },
    authoritativeVisibilityTimeoutMs: COORDINATOR_VISIBILITY_TIMEOUT_MS,
    authoritativeVisibilityRetryDelayMs:
      COORDINATOR_VISIBILITY_RETRY_DELAY_MS,
    enableTimeouts: false,
  });
  coordinator.initialize();

  try {
    const createdEvents = [];
    coordinator.on(REBALANCE_COORDINATOR_EVENT.OPERATION_CREATED, (event) => {
      createdEvents.push(event.operation);
    });
    const operation = await coordinator.createOperation({
      type: OperationType.ADD,
      partitionId: COHORT_PARTITION_ID,
      nodeId: COHORT_TARGET_NODE_ID,
      entityType: SERVICE_TYPE.PARTITION,
      entityId: COHORT_PARTITION_ID,
      emitOperationCreated: true,
    });

    t.equal(
      operation[ReplicaOperationField.REPLICA_ID],
      COHORT_TARGET_REPLICA_ID,
      'the ADD target allocates the next canonical replica id from the ' +
        'authoritative cohort (a cache-only read would allocate -r1)',
    );
    t.same(
      operation[ReplicaOperationField.REPLICA_IDS],
      [COHORT_REPLICA_ONE_ID, COHORT_REPLICA_TWO_ID, COHORT_TARGET_REPLICA_ID],
      'the stamped cohort includes the authoritative sibling rows the ' +
        'lagging cache could not see',
    );
    t.equal(
      createdEvents.length,
      1,
      'the operation persisted and emitted its created event',
    );
  } finally {
    await coordinator.shutdown();
  }
});
