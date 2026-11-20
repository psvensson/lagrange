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

async function seedOperation(t, fixture, operationId) {
  const operation = createOperation({
    operationId,
    type: OperationType.ADD,
    partitionId: PARTITION_ID,
    replicaId: `${PARTITION_ID}-${operationId}`,
    sourceNodeId: 'test-node-1',
    targetNodeId: TARGET_NODE_ID,
  });
  operation.entityType = SERVICE_TYPE.PARTITION;
  operation.entityId = PARTITION_ID;
  const persisted = await fixture.coordinator.repository.persistNewOperation(operation);
  t.equal(persisted, true, 'seed goes through the real repository and SQLite INSERT');
  const now = Date.now();
  const reservation = await fixture.gateway.submitMutation({
    operation: 'insert',
    tableName: SYSTEM_TABLE_NAME.STORAGE_RESERVATIONS,
    row: {
      reservation_id: `res-${operationId}`,
      operation_id: operationId,
      entity_type: SERVICE_TYPE.PARTITION,
      entity_id: PARTITION_ID,
      partition_id: PARTITION_ID,
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
  ).get(operationId).status;
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
  t.equal(progressed, true, 'ordinary nonterminal update still progresses');
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
    const retried = await observeAttempt(() => owner.completeOperation(operation));
    t.equal(retried.error, null, 'the same owner recovers after reply corruption ends');
    t.ok(calls > 1, 'same-step retry re-enters persistence instead of trusting the deferred mirror');
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
  t.ok(calls > 1, 'a thrown attempt cannot make the same-step retry skip persistence');
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
    await reopened.coordinator.reconcileReservations();
    t.equal(reservationStatus(reopened, operationId), RESERVATION_STATUS.RELEASED,
      'existing reservation recovery owner discharges the interrupted terminal release');
    t.equal(reservationStatus(reopened, unrelatedId), RESERVATION_STATUS.ACTIVE,
      'fresh recovery retains the unrelated nonterminal operation obligation');
  });
