/**
 * Existing-group ADD topology-guard regression tests (rebalancer safety-audit
 * finding 8, quest existing-group-add-topology-guard).
 *
 * Superseded under R09 by owner decision O1 (2026-09-26): a join's
 * membership is its COMMITTED stamp (the leader's committed configuration)
 * and a founder's is its GENESIS stamp; services rows are the address book
 * only. The receipts below keep their names; their expectations are the O1
 * ones - a create without a stamp is refused STAMP_INVALID (never a
 * self-only group, never a row-derived cohort), the stamp kind decides the
 * join mode (no row-derived dead-leader re-formation), and the coordinator
 * stamps the leader's answer, not a merge of cached and authoritative rows.
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
  OPERATION_METADATA_KEY,
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  REBALANCE_COORDINATOR_EVENT,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  STORAGE_ADMISSION_DECISION_TYPE,
} from '../../src/rebalancer/storage-admission-constants.js';
import {
  committedStampFor,
  genesisStampFor,
  withBootstrapStamp,
} from '../node/replica-handler-bootstrap-stamps.js';
import {withFixtureCommittedMembership} from
  './committed-membership-fixture.js';
import {
  createLifecycleCdcServiceForCache,
  createLifecycleControlPlaneGatewayForCache,
} from
  '../test-helpers/lifecycle-state-store.js';
import {
  buildReplicaCreateAdmissionToken,
  buildReplicaCreateAttemptToken,
} from '../../src/rebalancer/replica-create-admission-token.js';
import {
  createCoordinatorSqlStore,
  createMockCache,
  createMockCdcService,
  createMockControlPlaneSystemTableGateway,
  createMockMessageRouter,
  createMockPolicyService,
  createMockControlPlaneReadinessService,
  createMockTransactionCoordinator,
} from './test-helpers.js';
import {
  createRegisteredPartitionFactoryFixture,
  registerCompletedFreshCreateReleaseFixture,
} from '../test-helpers/replica-handler-identity-fixture.js';
import {waitForCondition} from '../partition/partition-service-test-support.js';
import {installCommittedOperationMutationFixture} from './operation-outcome-fixture.js';
import {runtimeBuildProvenance} from
  '../../src/diagnostics/runtime-build-provenance.js';

const TEST_SCHEMA = Object.freeze({
  columns: [{name: 'id', type: 'TEXT', primaryKey: true}],
});
const ESTABLISHED_PARTITION_AGE_MS = 60000;
const ESTABLISHED_PARTITION_UPDATE_DELAY_MS = 5000;
const HANDLER_SYNC_TIMEOUT_MS = 250;
const CREATE_EVENT_OBSERVATION_MS = HANDLER_SYNC_TIMEOUT_MS * 2;
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
    return createRegisteredPartitionFactoryFixture({
      partitionId: options.partitionId,
      replicaId: options.replicaId,
      initialized: true,
      async shutdown() {},
      async syncFromLeader() {},
    }, options);
  };
}

function createJoinHandler({cache, captured}) {
  const lifecycleGateway = createLifecycleControlPlaneGatewayForCache(cache);
  const operationRows = new Map();
  const matches = (row, where) => Object.entries(where).every(
    ([field, value]) => row?.[field] === value,
  );
  const controlPlaneSystemTableGateway = {
    async readAuthoritativeRows(tableName, sql, params = []) {
      if (tableName === SYSTEM_TABLE_NAME.NODES) {
        return {success: true, rows: [{
          node_id: JOIN_NODE_ID,
          boot_incarnation: 1,
        }]};
      }
      if (tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
        return lifecycleGateway.readAuthoritativeRows(tableName, sql, params);
      }
      if (sql.includes('WHERE operation_id = ?')) {
        const row = operationRows.get(params[0]);
        return {success: true, rows: row ? [{...row}] : []};
      }
      return {success: true, rows: [...operationRows.values()].filter(
        (row) => row.target_node_id === params[0] &&
          row.create_admission_state !== null,
      ).map((row) => ({...row}))};
    },
    async updateSystemTableRow(tableName, where, data) {
      if (tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
        return lifecycleGateway.submitMutation({
          operation: 'update', tableName, whereClause: where, data,
        });
      }
      const row = operationRows.get(where.operation_id);
      if (!row || !matches(row, where)) {
        return {success: true, outcome: 'observed_state_changed',
          partitionResult: {affectedRows: 0}};
      }
      Object.assign(row, data);
      return {success: true, outcome: 'applied',
        partitionResult: {affectedRows: 1}};
    },
    submitMutation: lifecycleGateway.submitMutation,
  };
  const handler = new ReplicaHandler({
    nodeId: JOIN_NODE_ID,
    ownerIncarnation: 1,
    cdcIntegrationService: createLifecycleCdcServiceForCache(cache),
    systemTableCache: cache,
    controlPlaneSystemTableGateway,
    dataDir: getTempDir(),
    createPartitionService: createCapturingPartitionServiceFactory(captured),
  });
  // The capturing factory has no native cutover. Isolate topology while
  // exercising the exact registered release route and admission identity.
  registerCompletedFreshCreateReleaseFixture(handler);
  handler.initialize();
  handler.testOperationRows = operationRows;
  handler.syncTimeoutMs = HANDLER_SYNC_TIMEOUT_MS;
  return handler;
}

function admittedCreateRequest(handler, request) {
  const updatedAt = Date.now();
  const admissionToken = buildReplicaCreateAdmissionToken({
    operationId: request.operationId,
    replicaId: request.replicaId,
    targetNodeId: JOIN_NODE_ID,
    workflowUpdatedAt: updatedAt,
  });
  handler.testOperationRows.set(request.operationId, {
    operation_id: request.operationId,
    type: request.operationType,
    entity_type: SERVICE_TYPE.PARTITION,
    entity_id: request.partitionId,
    partition_id: request.partitionId,
    replica_id: request.replicaId,
    target_node_id: JOIN_NODE_ID,
    workflow_step: 'SENDING',
    updated_at: updatedAt,
    completed_at: null,
    create_admission_state: null,
    create_admission_token: null,
    create_admission_replica_created_at: null,
    create_admission_attempt_token: null,
    create_admission_previous_attempt_token: null,
    create_admission_attempt_seq: null,
    create_admission_workflow_updated_at: null,
    create_admission_owner_incarnation: null,
  });
  return {
    ...request,
    entityType: SERVICE_TYPE.PARTITION,
    entityId: request.partitionId,
    createAdmissionToken: admissionToken,
    createAdmissionWorkflowUpdatedAt: updatedAt,
    createAdmissionAttemptToken:
      buildReplicaCreateAttemptToken(admissionToken, 1),
    createAdmissionAttemptSeq: 1,
  };
}

function observeCreateEvents(handler) {
  const events = [];
  const created = (event) => events.push({created: true, event});
  const failed = (event) => events.push({created: false, event});
  handler.on('replicaCreated', created);
  handler.on('replicaCreationFailed', failed);
  return {
    events,
    close() {
      handler.off('replicaCreated', created);
      handler.off('replicaCreationFailed', failed);
    },
  };
}

async function closeJoinHandler(handler) {
  try {
    await handler.shutdown();
  } finally {
    fs.rmSync(handler.dataDir, {recursive: true, force: true});
  }
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

  const observed = observeCreateEvents(handler);
  try {
    await handler.handleCreateReplica(admittedCreateRequest(handler, {
      operationId: 'op-add-self-only',
      operationType: OperationType.ADD,
      partitionId: ADD_PARTITION_ID,
      replicaId: ADD_REPLICA_ID,
    }));
    const settled = await waitForCondition(
      () => observed.events.length > 0, CREATE_EVENT_OBSERVATION_MS);
    t.ok(settled, 'CREATE reported its topology refusal');
    t.equal(observed.events[0]?.created, false, 'self-only ADD did not create a replica');

    t.equal(
      captured.options,
      null,
      'no partition service created — self-only ADD bootstrap deferred',
    );
    t.match(
      String(observed.events[0]?.event?.error ?? ''),
      /membership-stamp-invalid/,
      'a create without a committed-membership stamp is refused ' +
        'STAMP_INVALID (O1)',
    );
  } finally {
    observed.close();
    await closeJoinHandler(handler);
  }
});

test('self-only-cohort-add-deferred: the fresh-bootstrap window stays ' +
  'exempt — a first-cohort ADD on a fresh partition may form the group',
async (t) => {
  initializeTestEnvironment();
  await runtimeBuildProvenance();
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

  const observed = observeCreateEvents(handler);
  try {
    const response = await handler.handleCreateReplica(admittedCreateRequest(handler,
      withBootstrapStamp({
        operationId: 'op-add-fresh',
        operationType: OperationType.ADD,
        partitionId: ADD_PARTITION_ID,
        replicaId: ADD_REPLICA_ID,
      }, genesisStampFor([ADD_REPLICA_ID]))));
    t.equal(response.status, ReplicaOperationResponseStatus.INITIATED,
      'the founder request was admitted');
    const settled = await waitForCondition(
      () => observed.events.length > 0, CREATE_EVENT_OBSERVATION_MS);
    t.ok(settled, 'CREATE completed through its registered release route');
    t.equal(observed.events[0]?.created, true,
      observed.events[0]?.event?.error ?? 'CREATE activated the founder');

    t.ok(
      captured.options,
      'fresh-bootstrap ADD still creates the partition service',
    );
    t.equal(
      captured.options?.isJoiningExistingGroup,
      false,
      'fresh cohort formation keeps voter bootstrap mode',
    );
  } finally {
    observed.close();
    await closeJoinHandler(handler);
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
        {
          explicitOperationType: operationType,
          bootstrapMembership: committedStampFor([`${ADD_PARTITION_ID}-r1`]),
        },
      );
      t.ok(
        context.existingReplicaCount > 0,
        `${operationType}: the COMMITTED stamp is a join; an unreachable ` +
          'leader row no longer re-forms the group from rows (O1)',
      );
      t.ok(
        context.replicaIds.length > 1,
        `${operationType}: sibling peers are present — only the leader ` +
          'viability branch is exercised',
      );
    }
  } finally {
    await closeJoinHandler(handler);
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
  const authority = createMockCache({services: authoritativeServices});
  const ledger = createCoordinatorSqlStore(authority);
  const sqlEngine = {executeQuery: async (sql, params) => ledger.execute(sql, params)};
  const gateway = createMockControlPlaneSystemTableGateway(sqlEngine);
  gateway.submitMutation = (mutation) => ledger.submitMutation(mutation);
  installCommittedOperationMutationFixture(gateway);
  const coordinator = new RebalanceCoordinator({
    nodeId: 'node-cohort-coordinator',
    systemTableCache: cache,
    cdcIntegrationService: createMockCdcService(),
    controlPlaneSystemTableGateway: gateway,
    tablePolicyService: createMockPolicyService(),
    // The group's leader answers the committed-membership read with the
    // committed configuration: the services owner's authoritative members.
    messageRouter: withFixtureCommittedMembership(createMockMessageRouter(),
      authority),
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
  coordinator.isPlacementAdmissionManagedEntityType = () => false;

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
    });

    t.equal(
      operation[ReplicaOperationField.REPLICA_ID],
      COHORT_TARGET_REPLICA_ID,
      'the ADD target allocates the next canonical replica id from the ' +
        'authoritative cohort (a cache-only read would allocate -r1)',
    );
    t.same(
      [...operation[ReplicaOperationField.REPLICA_IDS]].sort(),
      [COHORT_REPLICA_ONE_ID, COHORT_REPLICA_TWO_ID, COHORT_TARGET_REPLICA_ID],
      'the stamp names the leader\'s committed members, which the lagging ' +
        'cache could not see, plus the target',
    );
    const persisted = ledger.execute(
      'SELECT * FROM replica_operations WHERE operation_id = ?', [operation.operationId]);
    t.equal(persisted.rowSetComplete, true, 'the committed exact operation lookup is complete');
    t.equal(persisted.rows?.length, 1, 'one operation is committed for the returned identity');
    const [first] = JSON.parse(persisted.rows?.[0]?.steps_history ?? '[]');
    t.same(
      first?.[OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP],
      operation[ReplicaOperationField.BOOTSTRAP_MEMBERSHIP],
      'the committed history carries the exact bootstrap membership',
    );
    t.equal(
      createdEvents.length,
      1,
      'the operation persisted and emitted its created event',
    );
  } finally {
    try {
      await coordinator.shutdown();
    } finally {
      ledger.suspend();
    }
  }
});
