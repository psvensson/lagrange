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
import {buildPresentOperationVisibility} from
  '../../src/rebalancer/replica-operation-repository-operation-visibility.js';
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

function seedCache(operationId, replicaId, genesis) {
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
      genesis}]),
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

// `coFounders`: founders the genesis stamp names beside the replica (none
// exists: a founder of three whose peers never came up).
async function runCreate(t, {label, refusals, coFounders = []}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `fresh-authority-${label}-`));
  const operationId = `op-fresh-authority-${label}`;
  const replicaId = `${PARTITION_ID}-r-${label}`;
  const founders = [replicaId, ...coFounders];
  const genesis = genesisStampFor(founders, Object.fromEntries(
    founders.map((founder) => [founder, NODE_ID])));
  const cache = seedCache(operationId, replicaId, genesis);
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
  }, genesis));
  assert.equal(response.status, ReplicaOperationResponseStatus.INITIATED,
    `setup: the create was admitted (${JSON.stringify(response)})`);
  // The release client's waits are unref'd timers; hold the loop open.
  const keepAlive = setInterval(() => {}, 250);
  const outcome = await settled.finally(() => clearInterval(keepAlive));
  return {outcome, elapsedMs: Date.now() - startedAt, fault, handler, operationId,
    replicaId, operationRow, store: lifecycle.store,
    dbPath: handler.getPartitionDbPath(PARTITION_ID, replicaId)};
}

const REMOVE_POLL_MS = 100;

// Send the REMOVE and replay it: the COMPLETED answer, or null when the
// removal is still not complete after `polls` replays. Every failure the
// removal reported meanwhile is collected (its typed deferral).
async function driveRemove(run, request, polls) {
  const failures = [];
  const onFailure = (event) => failures.push(event.error);
  run.handler.on('replicaRemovalFailed', onFailure);
  try {
    const accepted = await run.handler.handleRemoveReplica(request);
    assert.equal(accepted.status, ReplicaOperationResponseStatus.INITIATED,
      `the REMOVE is accepted (${JSON.stringify(accepted)})`);
    for (let attempt = 0; attempt < polls; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, REMOVE_POLL_MS));
      const replay = await run.handler.handleRemoveReplica(request);
      if (replay.status === ReplicaOperationResponseStatus.COMPLETED) {
        return {completed: replay, failures};
      }
    }
    return {completed: null, failures};
  } finally {
    run.handler.off('replicaRemovalFailed', onFailure);
  }
}

function claimedRemoveRequest(run, row) {
  return {operationId: `cleanup-${run.operationId}`,
    partitionId: PARTITION_ID, replicaId: run.replicaId,
    [ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION]: row};
}

// A failed fresh create of the permanent-refusal fixture and its FAILED row.
async function failedCreate(t, options) {
  const run = await runCreate(t, {refusals: Infinity, ...options});
  assert.equal(run.outcome.created, false, 'setup: the create failed');
  const row = run.store.durableRow(TABLES.SERVICES, run.replicaId);
  assert.equal(row?.status, ReplicaStatus.FAILED, 'setup: the replica is FAILED');
  assert.equal(row?.cleanup_token, buildFailedCreateCleanupToken(run.operationId),
    'setup: the FAILED row carries the cleanup claim');
  assert.equal(fs.existsSync(run.dbPath), true,
    'setup: the replica database exists');
  return {run, row};
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
  const operation = {operationId: run.operationId, type: OperationType.ADD,
    entityType: 'partition', partitionId: PARTITION_ID, replicaId: run.replicaId,
    targetNodeId: NODE_ID, workflowStep: 'SYNCING',
    createAdmissionAttemptToken: row.create_attempt_token};
  // The repository's two reads the admission consults: the target's
  // actual observation and the operation's durable row (its step).
  const owner = {repository: {getActualReplicaObservation: async () => observation,
    queryReplicaOperationPersistenceAuthorityObservation: async () =>
      buildPresentOperationVisibility(operation)}};
  const admission = await admitCreateTerminalFailure(owner, operation);
  assert.equal(admission.admitted, true, 'the operation owner admits the FAILED');
  const decision = await decideFailedCreateTargetCleanup(owner, {...operation,
    workflowStep: 'FAILED', status: ReplicaStatus.FAILED, completedAt: Date.now(),
    stepsHistory: [{...admission.stepMetadata}]});
  assert.equal(decision.cleanupEligible, true,
    'the cleanup decision is ELIGIBLE with the recorded lifecycle precondition');
  assert.equal(fs.existsSync(run.dbPath), true,
    'the failed sole founder left its replica database');
  const {completed, failures} = await driveRemove(run,
    claimedRemoveRequest(run, row), 50);
  assert.ok(completed, `the claimed REMOVE completes (${failures.join('; ')})`);
  assert.equal(fs.existsSync(run.dbPath), false,
    'the sole founder\'s group is retired: its database is gone');
});

// Negative controls of the sole-founder group retirement (2026-11-11): each
// of its two durable facts is required, and an unreadable record holds.
const HOLD_POLLS = 12;
const DEFERRED_WITHOUT_EVIDENCE = /has no evidence it left consensus/u;

function assertHeld(run, driven, reason, label) {
  assert.equal(driven.completed, null, `${label}: the REMOVE does not complete`);
  assert.ok(driven.failures.length >= 1, `${label}: the removal deferred`);
  assert.match(driven.failures.at(-1), reason,
    `${label}: the typed reason (${driven.failures.at(-1)})`);
  assert.equal(fs.existsSync(run.dbPath), true,
    `${label}: nothing retired - the replica database is kept`);
}

test('a failed founder whose own durable configuration names three members ' +
  'never retires its group on its own: the claimed REMOVE stays deferred',
{timeout: TEST_TIMEOUT_MS}, async (t) => {
  environment(t);
  const {run, row} = await failedCreate(t, {label: 'of-three', coFounders: [
    `${PARTITION_ID}-r-absent-b`, `${PARTITION_ID}-r-absent-c`]});
  const driven = await driveRemove(run, claimedRemoveRequest(run, row),
    HOLD_POLLS);
  assertHeld(run, driven, DEFERRED_WITHOUT_EVIDENCE, 'of three');
  assert.match(driven.failures.at(-1),
    /group_unanswered, sole_founder_record_not_sole_founder/u,
    'nobody answered for the group and the record is not a sole founder\'s');
});

test('a failed sole founder whose database cannot be read holds: unreadable ' +
  'is never teardown', {timeout: TEST_TIMEOUT_MS}, async (t) => {
  environment(t);
  const {run, row} = await failedCreate(t, {label: 'unreadable'});
  for (const suffix of ['-wal', '-shm']) {
    fs.rmSync(`${run.dbPath}${suffix}`, {force: true});
  }
  fs.writeFileSync(run.dbPath, Buffer.alloc(8192, 0x5a));
  const driven = await driveRemove(run, claimedRemoveRequest(run, row),
    HOLD_POLLS);
  assertHeld(run, driven, /sole_founder_record_unreadable/u, 'unreadable');
});

test('an ordinary REMOVE (no failed-create claim) of a sole member without ' +
  'a port never retires the last voter', {timeout: TEST_TIMEOUT_MS},
async (t) => {
  environment(t);
  const {run} = await failedCreate(t, {label: 'unclaimed'});
  const driven = await driveRemove(run, {operationId: 'remove-unclaimed',
    partitionId: PARTITION_ID, replicaId: run.replicaId}, HOLD_POLLS);
  assertHeld(run, driven, DEFERRED_WITHOUT_EVIDENCE, 'unclaimed');
  assert.match(driven.failures.at(-1),
    /group_unanswered, sole_founder_not_failed_create_claim/u,
    'the sole-founder retirement refuses a removal that is not the claim');
});
