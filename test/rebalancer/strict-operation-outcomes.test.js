import {readPlacementCensus} from '../../src/partition/partition-placement-admission-decision.js';
import {buildOperationTransitionOutcome} from '../../src/rebalancer/operation-workflow-transition-outcome.js';
import {admitReplaceTerminalRepair} from '../../src/rebalancer/operation-workflow-replace-terminal-admission.js';
import {
  armTerminalTransitionRepair, runTerminalTransitionRepairAttempt,
  TERMINAL_TRANSITION_REPAIR_CAUSE,
} from '../../src/rebalancer/operation-workflow-terminal-transition-repair.js';
import {OPERATION_RECONCILE_OUTCOME} from '../../src/rebalancer/operation-workflow-reconcile-outcome.js';
// Initial item 02 witness: the production coordinator constructs the repository
// and workflow owner. Their SQL executes in SQLite using production schemas and
// the gateway's mutation planner. Only persistence reply delivery is corrupted.
// The fixture authority witness/readiness/timers are controlled substitutes;
// this proves the local persistence/consumer seam, not Raft or fleet acceptance.
// A file database is needed here so reconstruction discards every volatile owner
// and opens a new SQLite connection, instead of reusing the helper's live store.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {
  generateCreateIndexSQL,
  generateCreateTableSQL,
} from '../../src/bootstrap/system-table-schema-sql.js';
import {
  PARTITIONS_SCHEMA,
  REPLICA_OPERATIONS_SCHEMA,
  STORAGE_RESERVATIONS_SCHEMA,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  ControlPlaneSystemTableGateway,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  createOperation, OperationType, ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {RESERVATION_STATUS} from '../../src/rebalancer/storage-capacity-constants.js';
import {
  REPLICA_OPERATION_UPDATE_DISPOSITION,
} from '../../src/rebalancer/replica-operation-update-disposition.js';
import {
  createMockControlPlaneSystemTableGateway,
  createTestCoordinator,
} from './test-helpers.js';
import {
  createDeterministicTimerQueue,
} from './reservation-dispatch-gate-test-harness.js';

const PARTITION_ID = 'strict-outcomes-p1';
const TARGET_NODE_ID = 'test-node-2';
const RESERVATION_LIFETIME_MS = 60_000;
const INVALID_OUTCOME_CODE = 'INVALID_OPERATION_PERSISTENCE_OUTCOME';
const LOST_REPLY_MESSAGE = 'injected loss after real SQLite persistence';
const SQL_SCHEMAS = [
  REPLICA_OPERATIONS_SCHEMA, STORAGE_RESERVATIONS_SCHEMA, PARTITIONS_SCHEMA,
];
const MUTATION_PLANNER = new ControlPlaneSystemTableGateway();

function openCoordinator(file) {
  const database = new Database(file);
  for (const schema of SQL_SCHEMAS) {
    database.exec(generateCreateTableSQL(schema));
    for (const indexSql of generateCreateIndexSQL(schema)) database.exec(indexSql);
  }
  const sqlEngine = {
    async executeQuery(sql, params = []) {
      try {
        const statement = database.prepare(sql);
        return statement.reader ?
          {success: true, rows: statement.all(...params), rowSetComplete: true} :
          {success: true, changes: statement.run(...params).changes};
      } catch (error) {
        return {success: false, error: error.message, errorCode: error.code};
      }
    },
  };
  // Reuse the canonical gateway fixture's authoritative-read answer shape;
  // mutation decisions and conditional SQL stay with the real producer.
  const gateway = createMockControlPlaneSystemTableGateway(sqlEngine);
  gateway.submitMutation = async (mutation) => {
    const {sql, params} = MUTATION_PLANNER.buildSqlMutationPlan(mutation);
    const result = await sqlEngine.executeQuery(sql, params);
    return result.success ?
      {success: true, partitionResult: {affectedRows: result.changes}} : result;
  };
  gateway.cdcIntegrationService = {
    insertSystemTableRow: (tableName, row) => gateway.submitMutation({
      operation: 'insert', tableName, row,
    }),
    updateSystemTableRow: (tableName, whereClause, data) => gateway.submitMutation({
      operation: 'update', tableName, whereClause, data,
    }),
  };
  const timers = createDeterministicTimerQueue();
  const coordinator = createTestCoordinator({
    sqlQueryEngine: sqlEngine,
    controlPlaneSystemTableGateway: gateway,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });
  return {
    coordinator,
    database,
    gateway,
    async close() {
      try {
        await coordinator.shutdown();
      } finally {
        database.close();
      }
    },
  };
}

function createFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'strict-operation-outcomes-'));
  const file = path.join(directory, 'operations.sqlite');
  let current = openCoordinator(file);
  t.teardown(async () => {
    try {
      await current.close();
    } finally {
      fs.rmSync(directory, {recursive: true, force: true});
    }
  });
  return {
    get current() {
      return current;
    },
    async reopen() {
      await current.close();
      current = null;
      current = openCoordinator(file);
      return current;
    },
  };
}

async function seedOperation(t, fixture, operationId, overrides = {}) {
  const operation = createOperation({
    operationId,
    type: OperationType.ADD,
    partitionId: PARTITION_ID,
    replicaId: `${PARTITION_ID}-${operationId}`,
    sourceNodeId: 'test-node-1',
    targetNodeId: TARGET_NODE_ID,
    ...overrides,
  });
  operation.entityType = overrides.entityType ?? SERVICE_TYPE.PARTITION;
  operation.entityId = overrides.entityId ?? PARTITION_ID;
  if (operation.type === OperationType.GROWTH_PROMOTE) {
    operation.sourceReplicaId = `${operation.replicaId}-peer`;
    operation.promoteReplicaIds = [operation.replicaId, operation.sourceReplicaId];
    Object.assign(operation.stepsHistory[0], {
      sourceReplicaId: operation.sourceReplicaId, promoteReplicaIds: operation.promoteReplicaIds,
    });
  }
  const persisted = await fixture.coordinator.repository.persistNewOperation(operation);
  t.equal(persisted, true, 'seed goes through the real repository and SQLite INSERT');
  if (![OperationType.ADD, OperationType.REPLACE].includes(operation.type)) return operation;
  const now = Date.now();
  const reservation = await fixture.gateway.submitMutation({
    operation: 'insert',
    tableName: SYSTEM_TABLE_NAME.STORAGE_RESERVATIONS,
    row: {
      reservation_id: `res-${operationId}`,
      operation_id: operationId,
      entity_type: operation.entityType,
      entity_id: operation.entityId,
      partition_id: operation.partitionId,
      target_node_id: TARGET_NODE_ID,
      estimated_bytes: 1,
      amplification_factor: 1,
      status: RESERVATION_STATUS.ACTIVE,
      created_at: now,
      updated_at: now,
      expires_at: now + RESERVATION_LIFETIME_MS,
      released_at: null,
    },
  });
  t.equal(reservation.success, true, 'initial reservation uses production schema and SQL planner');
  return operation;
}

function reservationStatus(fixture, operationId) {
  return fixture.database.prepare(
    'SELECT status FROM storage_reservations WHERE operation_id = ?',
  ).get(operationId)?.status ?? null;
}

async function observeAttempt(run) {
  try {
    return {outcome: await run(), error: null};
  } catch (error) {
    return {outcome: null, error};
  }
}

test('strict outcomes positive: real nonterminal update and terminal release', async (t) => {
  const fixture = createFixture(t).current;
  const operation = await seedOperation(t, fixture, 'strict-positive');
  const owner = fixture.coordinator.workflowOwner;
  const progressed = await owner.updateStep(operation, WORKFLOW_STEP.CREATING);
  t.equal(progressed, OPERATION_RECONCILE_OUTCOME.ADVANCED,
    'ordinary nonterminal update still progresses');
  const intermediate =
    await owner.repository.queryAuthoritativeOperationById(operation.operationId);
  t.equal(intermediate.workflowStep, WORKFLOW_STEP.CREATING);
  t.equal(intermediate.completedAt, null, 'nonterminal result need not carry a terminal tuple');
  t.equal(reservationStatus(fixture, operation.operationId), RESERVATION_STATUS.ACTIVE);
  const outcome = await owner.completeOperation(operation);
  t.equal(outcome.committed, true);
  t.equal(outcome.disposition, REPLICA_OPERATION_UPDATE_DISPOSITION.UPDATED);
  const durable = await owner.repository.queryAuthoritativeOperationById(operation.operationId);
  t.equal(durable.workflowStep, WORKFLOW_STEP.ACTIVE);
  t.equal(durable.status, ReplicaStatus.ACTIVE);
  t.ok(Number.isFinite(durable.completedAt));
  t.equal(reservationStatus(fixture, operation.operationId), RESERVATION_STATUS.RELEASED,
    'real terminal release updates only its reservation through the coordinator');
});

// These are deliberately malformed negatives, not substituting ordinary fixture
// answers. Every case first executes real repository persistence. The result is
// corrupted only after the durable write, where the caller cannot infer its fate.
const MALFORMED_REPLIES = [
  ['undefined', () => undefined],
  ['null', () => null],
  ['bare true', () => true],
  ['bare false', () => false],
  ['missing fields', () => ({})],
  ['missing operation', (result) => ({persisted: result.persisted, disposition: result.disposition})],
  ['unknown disposition', (result) => ({...result, disposition: 'unrecognized-disposition'})],
  ['contradictory updated', (result) => ({...result, persisted: false})],
  ['failed without completion', (result) => ({...result, operation: {...result.operation,
    workflowStep: WORKFLOW_STEP.FAILED, status: ReplicaStatus.FAILED, completedAt: null}})],
  ['terminal on creating', (result) => ({...result, operation: {...result.operation,
    workflowStep: WORKFLOW_STEP.CREATING, status: ReplicaStatus.CREATING}})],
  ['wrong status', (result) => ({...result, operation: {...result.operation,
    status: ReplicaStatus.FAILED}})],
  ['wrong entity', (result) => ({...result, operation: {...result.operation,
    entityId: 'different-entity'}})],
  ['wrong requested replica', (result) => ({...result, operation: {...result.operation,
    replicaId: 'different-replica'}})],
  ['refusal with payload', (result) => ({...result, persisted: false,
    disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED})],

];

for (const [label, corrupt] of MALFORMED_REPLIES) {
  test(`strict outcomes malformed ${label}: no commit or release; same-owner retry`, async (t) => {
    const fixture = createFixture(t).current;
    const operation = await seedOperation(t, fixture, `strict-malformed-${label.replaceAll(' ', '-')}`);
    const owner = fixture.coordinator.workflowOwner;
    const persist = owner.repository.persistOperationUpdate.bind(owner.repository);
    let calls = 0;
    owner.repository.persistOperationUpdate = async (...args) => {
      calls++;
      const answer = await persist(...args);
      return calls === 1 ? corrupt(answer) : answer;
    };
    const first = await observeAttempt(() => owner.completeOperation(operation));
    t.equal(calls, 1, 'fault is delivered after one actual repository call');
    t.equal(first.error?.code, INVALID_OUTCOME_CODE,
      'malformed repository answer is a contract error, never terminal success');
    t.not(first.outcome?.committed, true, 'malformed answer does not report a committed transition');
    t.equal(owner.operationWorkflowCoordinator.isTransitionIdempotent(
      operation.operationId, WORKFLOW_STEP.ACTIVE), false,
    'malformed answer cannot commit the deferred workflow mirror');
    t.equal(reservationStatus(fixture, operation.operationId), RESERVATION_STATUS.ACTIVE,
      'malformed answer retains the real reservation');
    const durable = await owner.repository.queryAuthoritativeOperationById(operation.operationId);
    t.equal(durable.workflowStep, WORKFLOW_STEP.ACTIVE,
      'the write happened: uncertainty must not be misreported as rollback');
    let authorityReads = 0;
    const observe = owner.repository.observeOperationTransition.bind(owner.repository);
    owner.repository.observeOperationTransition = async (...args) => {
      authorityReads++;
      return observe(...args);
    };
    const retried = await observeAttempt(() => owner.completeOperation(operation));
    t.equal(retried.error, null, 'the same owner recovers after reply corruption ends');
    t.equal(authorityReads, 1, 'same-step retry reconsults the real authoritative repository');
    t.equal(calls, 1, 'proved replay performs no second write');
    const winner = await owner.repository.queryAuthoritativeOperationById(operation.operationId);
    t.same(winner, durable, 'retry adopts the exact durable winner without rewriting it');
    t.equal(reservationStatus(fixture, operation.operationId), RESERVATION_STATUS.RELEASED,
      'proven durable retry releases the retained reservation');
  });
}

test('strict outcomes thrown post-write reply: same-owner retry re-enters repository', async (t) => {
  const fixture = createFixture(t).current;
  const operation = await seedOperation(t, fixture, 'strict-throw-retry');
  const owner = fixture.coordinator.workflowOwner;
  const persist = owner.repository.persistOperationUpdate.bind(owner.repository);
  let calls = 0;
  owner.repository.persistOperationUpdate = async (...args) => {
    calls++;
    const answer = await persist(...args);
    if (calls === 1) throw new Error(LOST_REPLY_MESSAGE);
    return answer;
  };
  const first = await observeAttempt(() => owner.completeOperation(operation));
  t.equal(first.error?.message, LOST_REPLY_MESSAGE);
  t.equal(owner.operationWorkflowCoordinator.isTransitionIdempotent(
    operation.operationId, WORKFLOW_STEP.ACTIVE), false);
  t.equal(reservationStatus(fixture, operation.operationId), RESERVATION_STATUS.ACTIVE);
  const durable = await owner.repository.queryAuthoritativeOperationById(operation.operationId);
  const retried = await observeAttempt(() => owner.completeOperation(operation));
  t.equal(retried.error, null);
  t.equal(calls, 1, 'authoritative replay after a thrown reply performs no second write');
  t.same(await owner.repository.queryAuthoritativeOperationById(operation.operationId), durable);
  t.equal(reservationStatus(fixture, operation.operationId), RESERVATION_STATUS.RELEASED);
});

test('strict outcomes reopened SQLite: fresh owner recovers exact terminal and retained release',
  async (t) => {
    const fixture = createFixture(t);
    const operationId = 'strict-reconstructed';
    const unrelatedId = 'strict-unrelated';
    let operation = await seedOperation(t, fixture.current, operationId);
    await seedOperation(t, fixture.current, unrelatedId);
    let owner = fixture.current.coordinator.workflowOwner;
    let persist = owner.repository.persistOperationUpdate.bind(owner.repository);
    owner.repository.persistOperationUpdate = async (...args) => {
      await persist(...args);
      throw new Error(LOST_REPLY_MESSAGE);
    };
    const first = await observeAttempt(() => owner.completeOperation(operation));
    t.equal(first.error?.message, LOST_REPLY_MESSAGE);
    const durable = await owner.repository.queryAuthoritativeOperationById(operationId);
    t.equal(reservationStatus(fixture.current, operationId), RESERVATION_STATUS.ACTIVE);
    // Retain only values and the file. No owner, callback, operation instance or
    // workflow/cache map crosses this reconstruction boundary.
    owner = null;
    persist = null;
    operation = null;
    const reopened = await fixture.reopen();
    const recovered =
      await reopened.coordinator.repository.queryAuthoritativeOperationById(operationId);
    t.same(recovered, durable, 'fresh repository decodes the exact winning row from reopened SQLite');
    t.equal(recovered.workflowStep, WORKFLOW_STEP.ACTIVE);
    t.equal(recovered.status, ReplicaStatus.ACTIVE);
    t.ok(Number.isFinite(recovered.completedAt));
    const outcome = await reopened.coordinator.workflowOwner.completeOperation(recovered);
    t.equal(outcome.reconcileOutcome, OPERATION_RECONCILE_OUTCOME.COMPLETED);
    t.same(await reopened.coordinator.repository.queryAuthoritativeOperationById(operationId),
      durable, 'fresh complete entry does not invent history or timestamps');
    t.equal(reservationStatus(reopened, operationId), RESERVATION_STATUS.RELEASED,
      'fresh terminal entry discharges the interrupted terminal release');
    t.equal(reservationStatus(reopened, unrelatedId), RESERVATION_STATUS.ACTIVE,
      'fresh recovery retains the unrelated nonterminal operation obligation');
  });

// Terminal witnesses seed the decision through the real conditional UPDATE;
// only the release interruption is injected. No workflow or SQL authority is
// replaced during replay, competing-intent adoption or owner reconstruction.
async function persistTerminalWitness(fixture, operation, {failed = false} = {}) {
  const now = Date.now();
  const step = failed ? WORKFLOW_STEP.FAILED : WORKFLOW_STEP.ACTIVE;
  const projected = {...operation, workflowStep: step,
    status: failed ? ReplicaStatus.FAILED : ReplicaStatus.ACTIVE,
    updatedAt: now, completedAt: now, errorMessage: failed ? 'durable winner' : null,
    stepsHistory: [...operation.stepsHistory, {step, timestamp: now}]};
  const answer = await fixture.coordinator.repository.persistOperationUpdate(projected,
    {terminalTransition: true, confirmPersistence: false});
  const outcome = buildOperationTransitionOutcome(answer,
    {repository: fixture.coordinator.repository, requestedOperation: projected});
  return {outcome, operation: await fixture.coordinator.repository
    .queryAuthoritativeOperationById(operation.operationId)};
}

for (const type of [OperationType.ADD, OperationType.GROWTH_PROMOTE]) {
  test(`strict outcomes fresh ${type} completion adopts exact reopened winner`, async (t) => {
    const fixture = createFixture(t);
    const operation = await seedOperation(t, fixture.current, `strict-reopen-${type}`, {type});
    const original = await persistTerminalWitness(fixture.current, operation);
    const reopened = await fixture.reopen();
    const outcome = await reopened.coordinator.workflowOwner.completeOperation({...operation});
    t.equal(outcome.committed, false, 'reconstruction makes no new terminal write');
    t.equal(outcome.reconcileOutcome, OPERATION_RECONCILE_OUTCOME.COMPLETED);
    t.same(outcome.operation, original.operation, 'exact terminal history and timestamp survive');
    if (type === OperationType.ADD) {
      t.equal(reservationStatus(reopened, operation.operationId), RESERVATION_STATUS.RELEASED);
    } else {
      t.equal(reservationStatus(reopened, operation.operationId), null,
        'growth does not admit a storage-increasing reservation');
      const census = readPlacementCensus(reopened.database);
      t.equal(census.find((row) => row.operationId === operation.operationId).incomplete, false,
        'durable terminal row clears growth occupancy in the real placement census');
    }
  });
}

test('strict outcomes failed REPLACE repair releases before now-refused write admission',
  async (t) => {
    const fixture = createFixture(t);
    let operation = await seedOperation(t, fixture.current, 'strict-failed-replace',
      {type: OperationType.REPLACE, sourceReplicaId: 'strict-old-replica'});
    const stale = structuredClone(operation);
    const committed = await persistTerminalWitness(fixture.current, operation, {failed: true});
    let owner = fixture.current.coordinator.workflowOwner;
    const persistOptions = {expectedWorkflowStep: WORKFLOW_STEP.PENDING};
    const refusal = await admitReplaceTerminalRepair(owner, committed.operation, persistOptions);
    t.equal(refusal.admitted, false, 'new write admission refuses the old expected-step intent');
    let releaseReads = 0;
    const read = fixture.current.gateway.readAuthoritativeRows.bind(fixture.current.gateway);
    fixture.current.gateway.readAuthoritativeRows = async (table, ...args) => {
      if (table === SYSTEM_TABLE_NAME.STORAGE_RESERVATIONS && ++releaseReads === 1) {
        return {success: false, error: 'interrupted reservation authority read'};
      }
      return read(table, ...args);
    };
    armTerminalTransitionRepair(owner, committed.operation,
      TERMINAL_TRANSITION_REPAIR_CAUSE.PERSIST_NOT_COMMITTED, persistOptions);
    const interrupted = await observeAttempt(() =>
      runTerminalTransitionRepairAttempt(owner, operation.operationId));
    t.equal(interrupted.error?.code, 'RESERVATION_RELEASE_UNCONFIRMED');
    t.equal(releaseReads, 1, 'committed terminal reaches real release despite admission refusal');
    const held = owner.terminalTransitionRepairStateByOperationId.get(operation.operationId);
    t.equal(held.phase, TERMINAL_TRANSITION_REPAIR_CAUSE.TERMINAL_RELEASE_PENDING);
    t.same(held.projectedOperation, committed.operation);
    t.same(held.persistOptions, {}, 'release debt carries no stale new-write admission');
    t.equal(reservationStatus(fixture.current, operation.operationId), RESERVATION_STATUS.ACTIVE);
    await runTerminalTransitionRepairAttempt(owner, operation.operationId);
    t.equal(releaseReads, 2);
    t.equal(owner.terminalTransitionRepairStateByOperationId.has(operation.operationId), false);
    t.equal(reservationStatus(fixture.current, operation.operationId), RESERVATION_STATUS.RELEASED);
    // Reopening and a different attempted failure still adopt the same failure;
    // neither asks new terminal admission nor rewrites the winner's explanation.
    owner = null;
    operation = null;
    const reopened = await fixture.reopen();
    const adopted = await reopened.coordinator.workflowOwner.failOperation(stale, 'other failure');
    t.equal(adopted.disposition, REPLICA_OPERATION_UPDATE_DISPOSITION.TERMINAL_ADOPTED);
    t.equal(adopted.reconcileOutcome, OPERATION_RECONCILE_OUTCOME.FAILED);
    t.same(adopted.operation, committed.operation);
    t.same(await reopened.coordinator.repository.queryAuthoritativeOperationById(stale.operationId),
      committed.operation);
  });

test('strict outcomes accessor corruption is rejected without evaluating the getter', async (t) => {
  const fixture = createFixture(t).current;
  const operation = await seedOperation(t, fixture, 'strict-getter');
  const owner = fixture.coordinator.workflowOwner;
  const persist = owner.repository.persistOperationUpdate.bind(owner.repository);
  let getterCalls = 0;
  owner.repository.persistOperationUpdate = async (...args) => {
    const result = await persist(...args);
    const corrupted = {...result.operation};
    Object.defineProperty(corrupted, 'targetNodeBootIncarnation', {
      enumerable: true,
      get() {
        getterCalls++;
        return 1;
      },
    });
    return {...result, operation: corrupted};
  };
  const attempt = await observeAttempt(() => owner.completeOperation(operation));
  t.equal(attempt.error?.code, INVALID_OUTCOME_CODE);
  t.equal(getterCalls, 0, 'validation rejects accessor before clone or identity comparison');
  t.equal(reservationStatus(fixture, operation.operationId), RESERVATION_STATUS.ACTIVE);
});

test('strict outcomes supported runtime service has no partition identity', async (t) => {
  const fixture = createFixture(t).current;
  const operation = await seedOperation(t, fixture, 'strict-runtime', {
    type: OperationType.REMOVE, partitionId: null,
    entityType: SERVICE_TYPE.RUNTIME_SERVICE, entityId: 'strict-service',
  });
  const outcome = await fixture.coordinator.workflowOwner.completeOperation(operation);
  t.equal(outcome.reconcileOutcome, OPERATION_RECONCILE_OUTCOME.COMPLETED);
  t.equal(outcome.operation.partitionId, null);
  t.equal(outcome.operation.entityId, 'strict-service');
});
