import {unavailableRetainedRepairPorts} from '../test-helpers/retained-repair-ports.js';
import {completePartitionConstructionFixture} from '../test-helpers/replica-handler-identity-fixture.js';
// Item 03 proves committed-admission release through the real loopback route
// and native partition. Faults affect only the answering leader's authoritative
// operation read. The historical Quest's sealed proof remains in its record.

import assert from 'node:assert/strict';
import {AsyncLocalStorage} from 'node:async_hooks';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {CREATE_ADMISSION_STATE} from '../../src/node/replica-create-admission-state.js';
import {runtimeBuildProvenance} from '../../src/diagnostics/runtime-build-provenance.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {
  PARTICIPANT_CUTOVER_BOUND,
  PARTICIPANT_CUTOVER_OUTCOME as RELEASE_OUTCOME,
  PARTICIPANT_RELEASE_ACTION,
  PARTICIPANT_RELEASE_MISSING_FACT,
  PARTICIPANT_RELEASE_RESULT_FIELD,
  PARTICIPANT_RELEASE_TRIGGER,
} from '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {readPartitionWriteOrigin} from
  '../../src/partition/partition-participant-transaction-store.js';
import {deliveryAnswerOf} from '../../src/transport/transport-semantic-outcome.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {SQL_TRANSACTIONS_SCHEMA} from
  '../../src/bootstrap/system-table-workflow-schema-definitions.js';
import {TABLES} from '../../src/constants/tables.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {ReplicaOperationRepository} from '../../src/rebalancer/replica-operation-repository.js';
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
import {createLoopbackTransport, waitForCondition} from
  '../partition/partition-service-test-support.js';
import {withFoundingStamp} from '../partition/partition-founding-stamp.js';
import {committedStampFor, genesisStampFor, withBootstrapStamp} from
  './replica-handler-bootstrap-stamps.js';

const NODE_ID = 'fresh-authority-native-node';
const PARTITION_ID = 'sql_transactions-p1';
const SYNC_TIMEOUT_MS = 4000;
const TEST_TIMEOUT_MS = 60000;
const OBSERVATION_GRACE_MS = 2000;
const OBSERVATION_TIMEOUT_MS = SYNC_TIMEOUT_MS + OBSERVATION_GRACE_MS;
const NOT_GENESIS_REASON = 'create_operation_not_genesis_founding';
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

// Scope the gateway fault to the release route. Worker/recovery validation
// shares the operation lookup SQL and must continue to read the real row.
function faultingGateway(cache, operationRow, releaseRead, fault) {
  const lifecycle = createLifecycleControlPlaneGatewayForCache(cache);
  const matches = (row, where) => Object.entries(where).every(
    ([field, value]) => row?.[field] === value);
  return {lifecycle, gateway: {
    async readAuthoritativeRows(tableName, sql, params) {
      if (tableName === SYSTEM_TABLE_NAME.NODES) {
        return {success: true, rows: [{node_id: NODE_ID, boot_incarnation: 101}]};
      }
      if (tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
        const result = await lifecycle.readAuthoritativeRows(tableName, sql, params);
        if (tableName === SYSTEM_TABLE_NAME.SERVICES && sql.includes('WHERE service_id = ?')) {
          return {...result, rowSetComplete: result.success === true};
        }
        return result;
      }
      const release = releaseRead.getStore();
      if (release && sql.includes('WHERE operation_id = ?') &&
          params[0] === release.request.createAdmissionIdentity.operationId) {
        release.row = {...operationRow};
        if (fault.hold) {
          const held = fault.hold;
          fault.hold = null;
          fault.held = release;
          await held.promise;
        } else if (fault.remaining > 0) {
          fault.remaining -= 1;
          fault.refused += 1;
          release.authorityRefused = true;
          return ROUTING_REFUSAL;
        }
      }
      return {success: true, rowSetComplete: true,
        rows: operationRowsFor(operationRow, sql, params)};
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

function observeReleaseRoute(releaseRead, transport, serviceOf) {
  const deliveries = [];
  const deliver = transport.deliver.bind(transport);
  transport.deliver = async (address, request, options) => {
    if (request?.action !== PARTICIPANT_RELEASE_ACTION.RELEASE ||
        request.trigger !== PARTICIPANT_RELEASE_TRIGGER.FRESH_CREATE) {
      return deliver(address, request, options);
    }
    const release = {request, sentAtMs: Date.now(),
      origin: readPartitionWriteOrigin(serviceOf().db)};
    deliveries.push(release);
    return releaseRead.run(release, async () => {
      const delivery = await deliver(address, request, options);
      release.answer = deliveryAnswerOf(delivery)?.[PARTICIPANT_RELEASE_RESULT_FIELD];
      release.answeredAtMs = Date.now();
      return delivery;
    });
  };
  return deliveries;
}

async function runCreate(t, {label, refusals = 0, holdRead = false, notGenesis = false}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `fresh-authority-${label}-`));
  const operationId = `op-fresh-authority-${label}`;
  const replicaId = `${PARTITION_ID}-r-${label}`;
  const cache = seedCache(operationId, replicaId);
  const operationRow = structuredClone(cache.get(
    SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, operationId));
  if (notGenesis) {
    operationRow.steps_history = JSON.stringify([{
      [OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP]: committedStampFor([replicaId]),
    }]);
  }
  const held = holdRead ? Promise.withResolvers() : null;
  const fault = {hold: held, held: null, remaining: refusals, refused: 0};
  const releaseRead = new AsyncLocalStorage();
  const {gateway, lifecycle} = faultingGateway(cache, operationRow, releaseRead, fault);
  const transport = createLoopbackTransport();
  const opened = [];
  const releases = observeReleaseRoute(releaseRead, transport, () => opened[0]);
  const handler = new ReplicaHandler({
    nodeId: NODE_ID, ownerIncarnation: 101,
    cdcIntegrationService: {}, controlPlaneSystemTableGateway: gateway,
    systemTableCache: cache, messageRouter: transport, dataDir: directory,
    // As production's partition factory: construct and initialize.
    createPartitionService: async (options) => {
      const service = new PartitionService(withFoundingStamp({
        ...options, transport, systemTableCache: cache}));
      completePartitionConstructionFixture(service, options);
      await service.initialize();
      // The lone founder of this fixture group leads (as a founded group's
      // first election would); the subject is the release, not the election.
      await service.raft.campaign();
      opened.push(service);
      return service;
    },
  });
  handler.registerWithRouter(transport);
  const created = [];
  const failed = [];
  const onCreated = (event) => created.push({...event, observedAtMs: Date.now()});
  const onFailed = (event) => failed.push(event);
  handler.on('replicaCreated', onCreated);
  handler.on('replicaCreationFailed', onFailed);
  t.after(async () => {
    held?.resolve();
    handler.off('replicaCreated', onCreated);
    handler.off('replicaCreationFailed', onFailed);
    try {
      await handler.shutdown();
    } finally {
      releaseRead.disable();
      fs.rmSync(directory, {recursive: true, force: true});
    }
  });
  handler.initialize();
  await handler.awaitReplicaCreateAdmissionRecoveryBarrier();
  await runtimeBuildProvenance();
  const workflowUpdatedAt = operationRow.updated_at;
  const admissionToken = buildReplicaCreateAdmissionToken({operationId, replicaId,
    targetNodeId: NODE_ID, workflowUpdatedAt});
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
  const tasks = [...handler.operationTasks];
  assert.equal(tasks.length, 1, 'CREATE registered its detached work');
  const deadlineAtMs = handler.inProgressOperations.get(operationId).startedAt + SYNC_TIMEOUT_MS;
  const original = {deadlineAtMs, settledAtMs: null};
  void Promise.all(tasks).then(() => {
    original.settledAtMs = Date.now();
  }, (error) => {
    original.error = error;
  });
  return {created, failed, fault, handler, operationId, replicaId, operationRow,
    admissionToken, opened, releases, original, cache, gateway, store: lifecycle.store,
    restoreAuthority() {
      fault.remaining = 0;
      held?.resolve();
    }};
}

async function observe(predicate, description, timeoutMs = OBSERVATION_TIMEOUT_MS) {
  assert.ok(await waitForCondition(predicate, timeoutMs), description);
}

function assertRetainedIdentity(run, row) {
  const service = run.opened[0];
  assert.equal(run.opened.length, 1, 'one physical service was constructed');
  assert.equal(run.handler.localServices.get(run.replicaId), service);
  assert.equal(service.isShutdown, false, 'the admitted runtime stays open');
  assert.equal(service.createAdmissionOperationId, run.operationId);
  assert.equal(service.createAdmissionToken, run.admissionToken);
  assert.equal(run.operationRow.create_admission_token, run.admissionToken);
  assert.equal(row.create_attempt_token, buildReplicaCreateAttemptToken(run.admissionToken, 1));
  assert.equal(service.createAttemptToken, row.create_attempt_token);
  assert.equal(run.operationRow.create_admission_attempt_token, row.create_attempt_token);
  assert.equal(row.created_at, run.operationRow.create_admission_replica_created_at);
  assert.equal(row.cleanup_token, null);
  assert.equal(run.failed.length, 0, 'unavailable authority does not publish failure');
  assert.ok(run.store.mutations.every((mutation) =>
    mutation.tableName !== TABLES.SERVICES ||
    (mutation.operation !== 'delete' &&
      (mutation.row ?? mutation.data)?.status !== ReplicaStatus.FAILED)),
  'unavailable authority neither fails nor removes the service');
}

function isAuthorityDeferral({answer}) {
  return answer?.outcome === RELEASE_OUTCOME.UNAVAILABLE &&
    answer.missingFact === PARTICIPANT_RELEASE_MISSING_FACT.CREATE_ADMISSION_AUTHORITY;
}

async function observeOriginalReturn(run, description) {
  await observe(() => run.original.settledAtMs !== null || run.original.error, description);
  assert.ifError(run.original.error);
  return run.original.settledAtMs;
}

function assertSyncingCreate(run) {
  assert.equal(run.created.length, 0);
  const syncing = run.store.durableRow(TABLES.SERVICES, run.replicaId);
  assert.equal(syncing?.status, ReplicaStatus.SYNCING);
  assert.equal(run.operationRow.create_admission_state, CREATE_ADMISSION_STATE.MATERIALIZED);
  assertRetainedIdentity(run, syncing);
  return syncing;
}

async function restoreAndObserveActive(run, originalRequest, syncing) {
  const restoredAtMs = Date.now();
  assert.ok(restoredAtMs >= originalRequest.deadlineAtMs,
    'the original deadline passed before authority was restored');
  run.restoreAuthority();
  await observe(() => run.created.length || run.failed.length, 'normal admission recovery settled');
  assert.equal(run.created.length, 1, run.failed[0]?.error);
  assert.equal(run.created[0].operationId, run.operationId);
  assert.equal(run.created[0].replicaId, run.replicaId);
  const released = run.releases.find(({answer}) => answer?.outcome === RELEASE_OUTCOME.CUT_OVER);
  assert.ok(released, 'the real release owner completed cutover');
  assert.ok(released.sentAtMs >= restoredAtMs &&
    released.request.deadlineAtMs > originalRequest.deadlineAtMs,
  'a separate recovery turn released after authority returned');
  assert.deepEqual(released.request.createAdmissionIdentity,
    originalRequest.createAdmissionIdentity);
  assert.notEqual(readPartitionWriteOrigin(run.opened[0].db), null,
    'the native origin was committed');
  const active = run.store.durableRow(TABLES.SERVICES, run.replicaId);
  assert.equal(active?.status, ReplicaStatus.ACTIVE);
  assert.equal(active.created_at, syncing.created_at);
  assert.equal(run.operationRow.create_admission_state, CREATE_ADMISSION_STATE.ACTIVE);
  assertRetainedIdentity(run, active);
}

test('an authority read unavailable N times delays the fresh create, which ' +
  'completes within the existing deadline (real create path, real port)',
{timeout: TEST_TIMEOUT_MS}, async (t) => {
  environment(t);
  const run = await runCreate(t, {label: 'recovering', refusals: 3});
  const settledAtMs = await observeOriginalReturn(run, 'the original finite CREATE worker returned');
  assert.equal(run.fault.refused, 3, 'the authority refused the release read 3 times');
  const refusals = run.releases.filter(isAuthorityDeferral);
  assert.equal(refusals.length, 3, 'the real route returned typed authority deferral');
  assert.equal(run.failed.length, 0, run.failed[0]?.error);
  assert.equal(run.created.length, 1, 'the original worker published the terminal event');
  const [created] = run.created;
  assert.equal(created.operationId, run.operationId);
  const released = run.releases.find(({answer}) => answer?.outcome === RELEASE_OUTCOME.CUT_OVER);
  assert.ok(released, 'the real release route completed cutover');
  assert.equal(released.request.deadlineAtMs, run.original.deadlineAtMs);
  assert.ok(released.answeredAtMs <= created.observedAtMs &&
    created.observedAtMs <= settledAtMs && settledAtMs <= run.original.deadlineAtMs,
  `release replied at ${released.answeredAtMs}, ACTIVE at ${created.observedAtMs}, ` +
    `CREATE worker returned at ${settledAtMs}, original deadline ${run.original.deadlineAtMs}`);
  const row = run.store.durableRow(TABLES.SERVICES, run.replicaId);
  assert.equal(row?.status, ReplicaStatus.ACTIVE, 'the replica is ACTIVE');
});

test('prompt release refusals exhaust the original CREATE retry window and recovery ' +
  'activates the exact retained service after authority returns',
{timeout: TEST_TIMEOUT_MS}, async (t) => {
  environment(t);
  const run = await runCreate(t, {label: 'refused-through-deadline', refusals: Infinity});
  const settledAtMs = await observeOriginalReturn(run, 'the original deferral-only worker returned');
  const {deadlineAtMs} = run.original;
  const attempts = run.releases.filter(({request}) => request.deadlineAtMs === deadlineAtMs);
  const refusedReads = attempts.filter(({authorityRefused}) => authorityRefused);
  assert.ok(refusedReads.length > 1, 'the original caller reread the refused authority');
  assert.deepEqual(attempts.filter(isAuthorityDeferral), refusedReads,
    'every injected refusal returned the matching typed authority answer');
  for (const attempt of attempts) {
    // Committed membership and current leader are prerequisites to the
    // authority read. Their retryable refusals still spend the same deadline.
    assert.ok(attempt.answer?.outcome === RELEASE_OUTCOME.UNAVAILABLE ||
      attempt.answer?.outcome === RELEASE_OUTCOME.NOT_LEADER, JSON.stringify(attempt.answer));
    assert.equal(attempt.origin, null, 'authority refusal did not permit cutover');
    assert.ok(attempt.answeredAtMs >= attempt.sentAtMs && attempt.answeredAtMs <= deadlineAtMs,
      'each routed reply returned inside the original deadline');
  }
  const last = attempts.at(-1);
  const retryAfterMs = last.answer.outcome === RELEASE_OUTCOME.NOT_LEADER ?
    PARTICIPANT_CUTOVER_BOUND.PAUSE_RETRY_AFTER_MS : last.answer.retryAfterMs;
  assert.ok(retryAfterMs > 0, JSON.stringify(last.answer));
  const nextRetryAtMs = last.answeredAtMs + retryAfterMs;
  // A scheduled final retry can also wake at the deadline. In that case no
  // request reaches the route, and the worker returns at or after the deadline.
  assert.ok(nextRetryAtMs >= deadlineAtMs || settledAtMs >= deadlineAtMs,
    `last routed reply at ${last.answeredAtMs}; retry due ${nextRetryAtMs}; ` +
    `worker returned at ${settledAtMs}; original deadline ${deadlineAtMs}`);
  assert.ok(settledAtMs >= last.answeredAtMs && settledAtMs < deadlineAtMs + OBSERVATION_GRACE_MS,
    'the worker returned with all original release replies resolved');
  await observe(() => Date.now() > deadlineAtMs, 'authority remained unavailable through deadline');
  const syncing = assertSyncingCreate(run);

  await restoreAndObserveActive(run, last.request, syncing);
});

test('a held release read expires the original CREATE wait and recovery activates ' +
  'the exact retained service after authority returns',
{timeout: TEST_TIMEOUT_MS}, async (t) => {
  environment(t);
  const run = await runCreate(t, {label: 'held', holdRead: true});
  await observe(() => run.fault.held, 'the registered release reached its authority read');
  const {request, row: heldOperation, origin} = run.fault.held;
  assert.equal(request.deadlineAtMs, run.original.deadlineAtMs);
  assert.equal(origin, null, 'the founder has no write origin when release starts');
  assert.equal(heldOperation.create_admission_state, CREATE_ADMISSION_STATE.MATERIALIZED);
  const settledAtMs = await observeOriginalReturn(run,
    'original detached CREATE returned with its read still held');
  assert.ok(settledAtMs >= request.deadlineAtMs &&
    settledAtMs < request.deadlineAtMs + OBSERVATION_GRACE_MS,
  `original work settled at ${settledAtMs} for deadline ${request.deadlineAtMs}`);
  assert.equal(run.fault.held.answer, undefined, 'original release has no reply yet');
  const syncing = assertSyncingCreate(run);

  await restoreAndObserveActive(run, request, syncing);
  assert.equal(run.fault.held.answer?.outcome, RELEASE_OUTCOME.UNAVAILABLE);
  assert.equal(run.fault.held.answer.missingFact,
    PARTICIPANT_RELEASE_MISSING_FACT.RELEASE_DEADLINE);
});

test('readable no-origin founding contradiction fails CREATE with a cleanup ' +
  'claim and the real guarded REMOVE completes',
{timeout: TEST_TIMEOUT_MS}, async (t) => {
  environment(t);
  const run = await runCreate(t, {label: 'not-genesis', notGenesis: true});
  await observe(() => run.created.length || run.failed.length, 'contradictory CREATE settled');
  assert.equal(run.created.length, 0);
  assert.equal(run.failed.length, 1);
  assert.equal(run.failed[0].operationId, run.operationId);
  const refused = run.releases.find(({answer}) =>
    answer?.outcome === RELEASE_OUTCOME.OPERATOR_REQUIRED);
  assert.ok(refused, 'the real release owner required operator authority');
  assert.equal(refused.answer.reason, NOT_GENESIS_REASON);
  assert.equal(refused.answer.missingFact,
    PARTICIPANT_RELEASE_MISSING_FACT.FRESH_STORAGE_OR_OPERATOR_AUTHORITY);
  assert.equal(refused.origin, null);
  assert.equal(refused.row.type, OperationType.ADD);
  assert.equal(refused.row.completed_at, null);
  assert.equal(refused.row.create_admission_state, CREATE_ADMISSION_STATE.MATERIALIZED);
  assert.equal(refused.row.create_admission_token, run.admissionToken);
  assert.equal(run.operationRow.create_admission_state, CREATE_ADMISSION_STATE.FAILED);
  const row = run.store.durableRow(TABLES.SERVICES, run.replicaId);
  assert.equal(row?.status, ReplicaStatus.FAILED, 'the replica is FAILED');
  assert.equal(row?.cleanup_token, buildFailedCreateCleanupToken(run.operationId),
    'no FAILED row with cleanup_token null after admission input existed');
  // Read the exact native target generation through the production repository.
  // The fixture models the subsequent coordinator ledger terminal transition.
  const repository = new ReplicaOperationRepository({
    ...unavailableRetainedRepairPorts(),
    nodeId: NODE_ID, systemTableCache: run.cache, controlPlaneSystemTableGateway: run.gateway,
    logger: run.handler.logger,
  });
  const owner = {repository};
  const operation = repository.rowToOperation(run.operationRow);
  const admission = await admitCreateTerminalFailure(owner, operation);
  assert.equal(admission.admitted, true, 'the operation owner admits the authoritative FAILED');
  assert.equal(admission.expectedWorkflowStep, operation.workflowStep);
  const claim = admission.stepMetadata?.[
    OPERATION_METADATA_KEY.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION];
  assert.ok(claim, 'the admitted failure records the cleanup generation');
  assert.equal(claim.created_at, row.created_at);
  assert.equal(claim.state_entered_at, row.state_entered_at);
  assert.equal(claim.create_attempt_token, row.create_attempt_token);
  assert.equal(claim.cleanup_token, row.cleanup_token);
  const decision = await decideFailedCreateTargetCleanup(owner, {...operation,
    workflowStep: WORKFLOW_STEP.FAILED, status: ReplicaStatus.FAILED, completedAt: Date.now(),
    stepsHistory: [...operation.stepsHistory, {...admission.stepMetadata}]});
  assert.equal(decision.cleanupEligible, true,
    'the cleanup decision is ELIGIBLE with the recorded lifecycle precondition');
  assert.deepEqual(decision.lifecyclePrecondition, claim);
  const request = {operationId: `cleanup-${run.operationId}`,
    partitionId: PARTITION_ID, replicaId: run.replicaId,
    [ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION]:
      decision.lifecyclePrecondition};
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
