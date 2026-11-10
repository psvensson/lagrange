// Production-bound witness, quest fresh-create-failure-after-committed-admission
// (receipt superseded under R09 on 2026-11-02: an INDUCED authority-read
// unavailability replaces the live lottery). A real ReplicaHandler runs the real
// CREATE path of a fresh sql_transactions-p1 founder: durable create admission,
// a real PartitionService on the real raft-rs operation port, the voter-ready
// activation, and releaseFreshCreate through the real release client, the real
// loopback route and the real participant cutover owner. The one injected fault
// is at the owner boundary: the control-plane gateway's authoritative read of
// the MATERIALIZED replica_operations row answers unavailable (the
// readiness-routing refusal of run b26d2c090), N times then the row, or forever.
// Nothing else is faked: no release answer, membership, origin or token.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {runtimeBuildProvenance} from '../../src/diagnostics/runtime-build-provenance.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {SQL_TRANSACTIONS_SCHEMA} from
  '../../src/bootstrap/system-table-workflow-schema-definitions.js';
import {TABLES} from '../../src/constants/tables.js';
import {OPERATION_METADATA_KEY, OperationType, ReplicaStatus} from
  '../../src/rebalancer/replica-status.js';
import {
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  buildReplicaCreateAdmissionToken,
  buildReplicaCreateAttemptToken,
} from '../../src/rebalancer/replica-create-admission-token.js';
import {buildFailedCreateCleanupToken} from
  '../../src/rebalancer/failed-create-cleanup-token.js';
import {admitCreateTerminalFailure, decideFailedCreateTargetCleanup} from
  '../../src/rebalancer/operation-workflow-replace-terminal-admission.js';
import {createLifecycleControlPlaneGatewayForCache} from
  '../test-helpers/lifecycle-state-store.js';
import {createLoopbackTransport} from '../partition/partition-service-test-support.js';
import {withFoundingStamp} from '../partition/partition-founding-stamp.js';
import {genesisStampFor, withBootstrapStamp} from './replica-handler-bootstrap-stamps.js';

const NODE_ID = 'fresh-authority-native-node';
const PARTITION_ID = 'sql_transactions-p1';
const SYNC_TIMEOUT_MS = 4000;
const TEST_TIMEOUT_MS = 60000;
const ROUTING_REFUSAL = Object.freeze({success: false, outcome: 'owner_not_ready',
  error: 'all_services_filtered_by_readiness'});

function environment(t) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  // The existing create deadline, configured (not changed) for the fixture.
  ConfigurationManager.getInstance().initialize({node: {id: NODE_ID},
    replicaHandler: {syncTimeoutMs: SYNC_TIMEOUT_MS}});
  LoggingService.getInstance().initialize({level: 'error'});
  t.after(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
}

function seedCache(operationId, replicaId) {
  const cache = new SystemTableCache();
  cache.applySystemTableChange(SYSTEM_TABLE_NAME.TABLES, 'INSERT', {
    table_id: TABLES.SQL_TRANSACTIONS, table_name: TABLES.SQL_TRANSACTIONS,
    schema_definition: JSON.stringify(SQL_TRANSACTIONS_SCHEMA)});
  cache.applySystemTableChange(SYSTEM_TABLE_NAME.PARTITIONS, 'INSERT', {
    partition_id: PARTITION_ID, table_id: TABLES.SQL_TRANSACTIONS,
    partition_key_start: null, partition_key_end: null, leader_node_id: null,
    replica_count: 1});
  const now = Date.now();
  cache.applySystemTableChange(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, 'INSERT', {
    operation_id: operationId, type: OperationType.ADD,
    entity_type: 'partition', entity_id: PARTITION_ID,
    partition_id: PARTITION_ID, replica_id: replicaId,
    source_node_id: NODE_ID, target_node_id: NODE_ID,
    status: ReplicaStatus.PENDING, workflow_step: 'SENDING',
    created_at: now, updated_at: now, completed_at: null,
    // The founding create carries its GENESIS stamp in its first step, as the
    // provisioning owner writes it (the leader's release authority reads it).
    steps_history: JSON.stringify([{[OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP]:
      genesisStampFor([replicaId], {[replicaId]: NODE_ID})}]),
    create_admission_state: null, create_admission_token: null,
    create_admission_replica_created_at: null, create_admission_attempt_token: null,
    create_admission_previous_attempt_token: null, create_admission_attempt_seq: null,
    create_admission_workflow_updated_at: null, create_admission_owner_incarnation: null,
  });
  return cache;
}

function operationRowsFor(operationRow, sql, params) {
  const row = {...operationRow};
  if (sql.includes('WHERE operation_id = ?')) {
    return row.operation_id === params[0] ? [row] : [];
  }
  if (sql.includes('entity_type = ?')) {
    return row.target_node_id === params[0] && row.entity_type === params[1] &&
      row.create_admission_state ? [row] : [];
  }
  return row.replica_id === params[0] && row.target_node_id === params[1] ? [row] : [];
}

// The control-plane gateway as the create path consumes it, with the one
// fault: once the replica's runtime has opened (armed by the partition
// factory), the authority read of the operation row answers unavailable.
function faultingGateway(cache, operationRow, refusals) {
  const lifecycle = createLifecycleControlPlaneGatewayForCache(cache);
  const matches = (row, where) => Object.entries(where).every(
    ([field, value]) => row?.[field] === value);
  const fault = {armed: false, remaining: refusals, refused: 0};
  return {fault, lifecycle, gateway: {
    async readAuthoritativeRows(tableName, sql, params) {
      if (tableName === SYSTEM_TABLE_NAME.NODES) {
        return {success: true, rows: [{node_id: NODE_ID, boot_incarnation: 101}]};
      }
      if (tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
        return lifecycle.readAuthoritativeRows(tableName, sql, params);
      }
      if (sql.includes('WHERE operation_id = ?') && fault.armed && fault.remaining > 0) {
        fault.remaining -= 1;
        fault.refused += 1;
        return ROUTING_REFUSAL;
      }
      return {success: true, rows: operationRowsFor(operationRow, sql, params)};
    },
    async updateSystemTableRow(tableName, where, data) {
      if (tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS ||
          !matches(operationRow, where)) {
        return {success: true, outcome: 'no_op'};
      }
      Object.assign(operationRow, data);
      return {success: true, outcome: 'applied'};
    },
    submitMutation: lifecycle.submitMutation,
  }};
}

async function runCreate(t, {label, refusals}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `fresh-authority-${label}-`));
  const operationId = `op-fresh-authority-${label}`;
  const replicaId = `${PARTITION_ID}-r-${label}`;
  const cache = seedCache(operationId, replicaId);
  const operationRow = structuredClone(cache.get(
    SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, operationId));
  const {gateway, fault, lifecycle} = faultingGateway(cache, operationRow, refusals);
  const transport = createLoopbackTransport();
  const handler = new ReplicaHandler({
    nodeId: NODE_ID, ownerIncarnation: 101,
    cdcIntegrationService: {}, controlPlaneSystemTableGateway: gateway,
    systemTableCache: cache, messageRouter: transport, dataDir: directory,
    // As production's partition factory: construct and initialize.
    createPartitionService: async (options) => {
      const service = new PartitionService(withFoundingStamp({
        ...options, transport, systemTableCache: cache}));
      await service.initialize();
      // The lone founder of this fixture group leads (as a founded group's
      // first election would); the subject is the release, not the election.
      await service.raft.campaign();
      fault.armed = true;
      return service;
    },
  });
  handler.registerWithRouter(transport);
  t.after(async () => {
    await handler.shutdown().catch(() => {});
    fs.rmSync(directory, {recursive: true, force: true});
  });
  const settled = new Promise((resolve) => {
    handler.once('replicaCreated', () => resolve({created: true}));
    handler.once('replicaCreationFailed', (event) => resolve({created: false, event}));
  });
  handler.initialize();
  await handler.awaitReplicaCreateAdmissionRecoveryBarrier();
  await runtimeBuildProvenance();
  const workflowUpdatedAt = operationRow.updated_at;
  const admissionToken = buildReplicaCreateAdmissionToken({operationId, replicaId,
    targetNodeId: NODE_ID, workflowUpdatedAt});
  const startedAt = Date.now();
  const response = await handler.handleCreateReplica(withBootstrapStamp({
    [ReplicaOperationField.OPERATION_ID]: operationId,
    [ReplicaOperationField.OPERATION_TYPE]: OperationType.ADD,
    [ReplicaOperationField.ENTITY_TYPE]: 'partition',
    [ReplicaOperationField.ENTITY_ID]: PARTITION_ID,
    [ReplicaOperationField.PARTITION_ID]: PARTITION_ID,
    [ReplicaOperationField.REPLICA_ID]: replicaId,
    [ReplicaOperationField.CREATE_ADMISSION_TOKEN]: admissionToken,
    [ReplicaOperationField.CREATE_ADMISSION_WORKFLOW_UPDATED_AT]: workflowUpdatedAt,
    [ReplicaOperationField.CREATE_ADMISSION_ATTEMPT_TOKEN]:
      buildReplicaCreateAttemptToken(admissionToken, 1),
    [ReplicaOperationField.CREATE_ADMISSION_ATTEMPT_SEQ]: 1,
  }, genesisStampFor([replicaId], {[replicaId]: NODE_ID})));
  assert.equal(response.status, ReplicaOperationResponseStatus.INITIATED,
    `setup: the create was admitted (${JSON.stringify(response)})`);
  // The release client's waits are unref'd timers; hold the loop open.
  const keepAlive = setInterval(() => {}, 250);
  const outcome = await settled.finally(() => clearInterval(keepAlive));
  return {outcome, elapsedMs: Date.now() - startedAt, fault, handler, operationId,
    replicaId, operationRow, store: lifecycle.store};
}

test('an authority read unavailable N times delays the fresh create, which ' +
  'completes within the existing deadline (real create path, real port)',
{timeout: TEST_TIMEOUT_MS}, async (t) => {
  environment(t);
  const run = await runCreate(t, {label: 'recovering', refusals: 3});
  assert.equal(run.fault.refused, 3, 'the authority refused the release read 3 times');
  assert.equal(run.outcome.created, true,
    `the create completed (${run.outcome.event?.error ?? ''})`);
  assert.ok(run.elapsedMs < SYNC_TIMEOUT_MS + 1000,
    `within the existing create deadline (${run.elapsedMs} ms)`);
  const row = run.store.durableRow(TABLES.SERVICES, run.replicaId);
  assert.equal(row?.status, ReplicaStatus.ACTIVE, 'the replica is ACTIVE');
});

test('an authority read unavailable forever fails the fresh create at the ' +
  'existing deadline with a cleanup claim, and the claimed REMOVE completes',
{timeout: TEST_TIMEOUT_MS}, async (t) => {
  environment(t);
  const run = await runCreate(t, {label: 'permanent', refusals: Infinity});
  assert.ok(run.fault.refused >= 2, 'the release re-read the refused authority');
  assert.equal(run.outcome.created, false, 'the create failed');
  assert.ok(run.elapsedMs >= SYNC_TIMEOUT_MS - 500 && run.elapsedMs < SYNC_TIMEOUT_MS + 2000,
    `it failed at the existing create deadline (${run.elapsedMs} ms)`);
  assert.match(String(run.outcome.event?.error),
    /create_admission_authority/u, 'the failure names the typed missing fact');
  const row = run.store.durableRow(TABLES.SERVICES, run.replicaId);
  assert.equal(row?.status, ReplicaStatus.FAILED, 'the replica is FAILED');
  assert.equal(row?.cleanup_token, buildFailedCreateCleanupToken(run.operationId),
    'no FAILED row with cleanup_token null after admission input existed');
  // The operation owner's admission of that FAILED and its cleanup decision
  // (real admitCreateTerminalFailure / decideFailedCreateTargetCleanup) over
  // the observation of the resulting durable row: ELIGIBLE with the recorded
  // lifecycle precondition (verifier N2).
  const observation = {state: 'observed', lifecycleStatus: row.status,
    lifecyclePrecondition: Object.fromEntries(Object.entries(row))};
  const owner = {repository: {getActualReplicaObservation: async () => observation}};
  const operation = {operationId: run.operationId, type: OperationType.ADD,
    entityType: 'partition', partitionId: PARTITION_ID, replicaId: run.replicaId,
    targetNodeId: NODE_ID, workflowStep: 'SYNCING',
    createAdmissionAttemptToken: row.create_attempt_token};
  const admission = await admitCreateTerminalFailure(owner, operation);
  assert.equal(admission.admitted, true, 'the operation owner admits the FAILED');
  const decision = await decideFailedCreateTargetCleanup(owner, {...operation,
    workflowStep: 'FAILED', status: ReplicaStatus.FAILED, completedAt: Date.now(),
    stepsHistory: [{...admission.stepMetadata}]});
  assert.equal(decision.cleanupEligible, true,
    'the cleanup decision is ELIGIBLE with the recorded lifecycle precondition');
  const request = {operationId: `cleanup-${run.operationId}`,
    partitionId: PARTITION_ID, replicaId: run.replicaId,
    [ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION]: row};
  const accepted = await run.handler.handleRemoveReplica(request);
  assert.equal(accepted.status, ReplicaOperationResponseStatus.INITIATED,
    `the claimed REMOVE is accepted (${JSON.stringify(accepted)})`);
  let completed = null;
  for (let attempt = 0; attempt < 50 && completed === null; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const replay = await run.handler.handleRemoveReplica(request);
    if (replay.status === ReplicaOperationResponseStatus.COMPLETED) completed = replay;
  }
  assert.ok(completed, 'the claimed REMOVE completes');
});
