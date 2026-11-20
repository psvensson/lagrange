import {readPlacementCensus} from '../../src/partition/partition-placement-admission-decision.js';
import {buildOperationTransitionOutcome} from '../../src/rebalancer/operation-workflow-transition-outcome.js';
import {admitReplaceTerminalRepair} from '../../src/rebalancer/operation-workflow-replace-terminal-admission.js';
import {
  armTerminalTransitionRepair, runTerminalTransitionRepairAttempt,
  TERMINAL_TRANSITION_REPAIR_CAUSE,
} from '../../src/rebalancer/operation-workflow-terminal-transition-repair.js';
import {OPERATION_RECONCILE_OUTCOME} from '../../src/rebalancer/operation-workflow-reconcile-outcome.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED} from
  '../../src/rebalancer/operation-workflow-recovery-reconcile-shared.js';
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
  SERVICES_SCHEMA,
  STORAGE_RESERVATIONS_SCHEMA,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  ControlPlaneSystemTableGateway, CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
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
  createTestCoordinator, createTestRebalancer,
} from './test-helpers.js';
import {
  createDeterministicTimerQueue,
} from './reservation-dispatch-gate-test-harness.js';
import {buildPriorityDrainSupersededReadinessService} from
  './rebalance-coordinator-stopping-reconcile-fixtures.js';

const {
  PRIORITY_RECOVERY_BLOCKER_REASON,
  PRIORITY_RECOVERY_COMPLETION_STATE,
  PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE,
} = OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED;
const PARTITION_ID = 'strict-outcomes-p1';
const TARGET_NODE_ID = 'test-node-2';
const RESERVATION_LIFETIME_MS = 60_000;
const INVALID_OUTCOME_CODE = 'INVALID_OPERATION_PERSISTENCE_OUTCOME';
const LOST_REPLY_MESSAGE = 'injected loss after real SQLite persistence';
const SQL_SCHEMAS = [
  REPLICA_OPERATIONS_SCHEMA, STORAGE_RESERVATIONS_SCHEMA, PARTITIONS_SCHEMA,
  SERVICES_SCHEMA,
];
const MUTATION_PLANNER = new ControlPlaneSystemTableGateway();

function openCoordinator(file, coordinatorOptions) {
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
    ...coordinatorOptions,
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

function createFixture(t, coordinatorOptions = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'strict-operation-outcomes-'));
  const file = path.join(directory, 'operations.sqlite');
  let current = openCoordinator(file, coordinatorOptions);
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
      current = openCoordinator(file, coordinatorOptions);
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
      target_node_id: operation.targetNodeId,
      reason_code: fixture.coordinator.getReservationReasonCode(operation.type),
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

function interruptServicesRead(fixture) {
  const read = fixture.gateway.readAuthoritativeRows.bind(fixture.gateway);
  fixture.gateway.readAuthoritativeRows = async (tableName, ...args) => {
    if (tableName === SYSTEM_TABLE_NAME.SERVICES) {
      return {success: false, error: 'injected SERVICES authority outage'};
    }
    return read(tableName, ...args);
  };
  return () => { fixture.gateway.readAuthoritativeRows = read; };
}

test('ADD terminal failure retains the operation during exact target read unavailability', async (t) => {
  const fixture = createFixture(t).current;
  const operation = await seedOperation(t, fixture, 'add-target-read-unavailable');
  const owner = fixture.coordinator.workflowOwner;
  await owner.updateStep(operation, WORKFLOW_STEP.SYNCING);
  const restoreServicesRead = interruptServicesRead(fixture);

  const observation = await owner.repository.getActualReplicaObservation(
    operation.replicaId, operation.partitionId, operation.targetNodeId);
  t.equal(observation.state, 'unavailable',
    'the real repository classifies the failed authoritative read');
  const refused = await owner.failOperation(operation, 'Create timed out');
  const retained = await owner.repository.queryAuthoritativeOperationById(
    operation.operationId);
  t.equal(refused.committed, false, 'failure is refused without exact lifecycle');
  t.equal(retained.workflowStep, WORKFLOW_STEP.SYNCING);
  t.equal(retained.completedAt, null);
  t.equal(reservationStatus(fixture, operation.operationId), RESERVATION_STATUS.ACTIVE);

  restoreServicesRead();
  const restored = await owner.repository.getActualReplicaObservation(
    operation.replicaId, operation.partitionId, operation.targetNodeId);
  t.equal(restored.state, 'absent', 'the restored exact SQL read confirms absence');
  const settled = await owner.failOperation(operation, 'Create timed out');
  const terminal = await owner.repository.queryAuthoritativeOperationById(
    operation.operationId);
  t.equal(settled.committed, true);
  t.equal(terminal.workflowStep, WORKFLOW_STEP.FAILED);
  t.equal(reservationStatus(fixture, operation.operationId), RESERVATION_STATUS.RELEASED);
});

test('priority ADD dispatch reports a refused failure as unsettled', async (t) => {
  const partitionId = 'sql_transactions-p1';
  const operationId = 'priority-add-dispatch-unsettled';
  const fixture = createFixture(t, {
    controlPlaneReadinessService: buildPriorityDrainSupersededReadinessService(
      partitionId, operationId),
  }).current;
  const {coordinator, gateway} = fixture;
  const operation = await seedOperation(t, fixture, operationId, {
    partitionId, entityId: partitionId, replicaId: `${partitionId}-r3`,
  });
  const owner = coordinator.workflowOwner;
  await owner.updateStep(operation, WORKFLOW_STEP.SENDING);
  const read = gateway.readAuthoritativeRows.bind(gateway);
  let targetReads = 0;
  gateway.readAuthoritativeRows = async (tableName, sql, values, options) => {
    if (tableName === SYSTEM_TABLE_NAME.SERVICES &&
        values[0] === operation.replicaId && ++targetReads > 1) {
      return {success: false, error: 'target authority lost after supersession'};
    }
    return read(tableName, sql, values, options);
  };

  const refused = await coordinator.dispatchOperation(operation);
  t.ok(targetReads > 1, 'dispatch observed absence before failure admission lost authority');
  t.equal(refused.operationId, operationId);
  t.equal(refused.skipped, true, 'dispatch reports the nonterminal refusal as a skip');
  t.equal(refused.reconcileOutcome, OPERATION_RECONCILE_OUTCOME.REFUSED);
  const retained = await owner.repository.queryAuthoritativeOperationById(operationId);
  t.equal(retained.workflowStep, WORKFLOW_STEP.SENDING);
  t.equal(reservationStatus(fixture, operationId), RESERVATION_STATUS.ACTIVE);

  gateway.readAuthoritativeRows = read;
  const settled = await coordinator.dispatchOperation(operation);
  t.equal(settled.operationId, operationId);
  t.equal(settled.reconcileOutcome, OPERATION_RECONCILE_OUTCOME.FAILED);
  const durable = await owner.repository.queryAuthoritativeOperationById(operationId);
  t.equal(durable.workflowStep, WORKFLOW_STEP.FAILED);
  t.match(durable.errorMessage, /eligible cohort/i);
  t.equal(reservationStatus(fixture, operationId), RESERVATION_STATUS.RELEASED);
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
  ['missing history', (result) => {
    const operation = {...result.operation};
    delete operation.stepsHistory;
    return {...result, operation};
  }],
  ['invalid timestamp', (result) => ({...result, operation: {...result.operation, updatedAt: null}})],
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
  ['adopted different replica', (result) => ({...result, persisted: false,
    disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.TERMINAL_ADOPTED,
    operation: {...result.operation, replicaId: 'different-incarnation'}})],
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
function terminalWitnessProjection(operation, failed) {
  const now = Date.now();
  const step = failed ? WORKFLOW_STEP.FAILED : WORKFLOW_STEP.ACTIVE;
  return {...operation, workflowStep: step,
    status: failed ? ReplicaStatus.FAILED : ReplicaStatus.ACTIVE,
    updatedAt: now, completedAt: now, errorMessage: failed ? 'durable winner' : null,
    stepsHistory: [...operation.stepsHistory, {step, timestamp: now}]};
}

async function persistTerminalWitness(fixture, operation, {failed = false} = {}) {
  const projected = terminalWitnessProjection(operation, failed);
  const answer = await fixture.coordinator.repository.persistOperationUpdate(projected,
    {terminalTransition: true, confirmPersistence: false});
  const outcome = buildOperationTransitionOutcome(answer,
    {repository: fixture.coordinator.repository, requestedOperation: projected});
  return {outcome, operation: await fixture.coordinator.repository
    .queryAuthoritativeOperationById(operation.operationId)};
}

test('retained FAILED ADD repair waits for exact target authority before a new write', async (t) => {
  const fixture = createFixture(t).current;
  const operation = await seedOperation(t, fixture, 'retained-add-target-unavailable');
  const owner = fixture.coordinator.workflowOwner;
  const projected = terminalWitnessProjection(operation, true);
  const restoreServicesRead = interruptServicesRead(fixture);
  armTerminalTransitionRepair(owner, projected,
    TERMINAL_TRANSITION_REPAIR_CAUSE.PERSIST_NOT_COMMITTED,
    {expectedWorkflowStep: WORKFLOW_STEP.PENDING});
  await runTerminalTransitionRepairAttempt(owner, operation.operationId);
  const retained = await owner.repository.queryAuthoritativeOperationById(
    operation.operationId);
  t.equal(retained.workflowStep, WORKFLOW_STEP.PENDING);
  t.equal(retained.completedAt, null);
  t.equal(reservationStatus(fixture, operation.operationId), RESERVATION_STATUS.ACTIVE);
  t.equal(owner.terminalTransitionRepairStateByOperationId.has(operation.operationId), true);

  restoreServicesRead();
  await runTerminalTransitionRepairAttempt(owner, operation.operationId);
  const settled = await owner.repository.queryAuthoritativeOperationById(
    operation.operationId);
  t.equal(settled.workflowStep, WORKFLOW_STEP.FAILED);
  t.equal(reservationStatus(fixture, operation.operationId), RESERVATION_STATUS.RELEASED);
});

test('retained durable FAILED ADD releases during a target authority outage', async (t) => {
  const fixture = createFixture(t).current;
  const operation = await seedOperation(t, fixture, 'durable-add-target-unavailable');
  const owner = fixture.coordinator.workflowOwner;
  const winner = await persistTerminalWitness(fixture, operation, {failed: true});
  t.equal(winner.outcome.committed, true);
  interruptServicesRead(fixture);
  armTerminalTransitionRepair(owner, winner.operation,
    TERMINAL_TRANSITION_REPAIR_CAUSE.PERSIST_NOT_COMMITTED,
    {expectedWorkflowStep: WORKFLOW_STEP.PENDING});
  await runTerminalTransitionRepairAttempt(owner, operation.operationId);
  const settled = await owner.repository.queryAuthoritativeOperationById(
    operation.operationId);
  t.same(settled, winner.operation);
  t.equal(reservationStatus(fixture, operation.operationId), RESERVATION_STATUS.RELEASED);
});

test('priority superseded-target failure requires an exact authoritative observation', async (t) => {
  const partitionId = 'sql_transactions-p1';
  const operationId = 'superseded-target-authority';
  const fixture = createFixture(t, {
    controlPlaneReadinessService: buildPriorityDrainSupersededReadinessService(
      partitionId, operationId),
  }).current;
  const operation = await seedOperation(t, fixture, operationId, {
    type: OperationType.REPLACE,
    partitionId, entityId: partitionId,
    sourceReplicaId: `${partitionId}-r1`,
    replicaId: `${partitionId}-r2`,
  });
  const owner = fixture.coordinator.workflowOwner;
  const priorityContext = {
    priorityPartitionSummary: {satisfied: false},
    effectiveEligibleNodeIds: ['current-cohort-node'],
    decisionSnapshot: {
      blockerReasons: [PRIORITY_RECOVERY_BLOCKER_REASON.RECOVERY_ELIGIBLE_EXCLUDED],
    },
  };
  const decide = () => owner.getPriorityRecoverySupersededTargetErrorFromContext(
    operation, priorityContext);
  const decideRemotely = () => owner.resolvePriorityRecoveryRemoteSupersededTargetDrainError(
    operation, priorityContext);
  const clockBase = Date.now();
  owner.timeSource = {now: () => clockBase + 3_600_000};
  const staleDrainSource = () => owner.buildPriorityRecoveryOperationDrainSourceSnapshot(
    operation, PRIORITY_RECOVERY_COMPLETION_STATE.CONVERGED);
  const staleState = PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE.RETIREMENT_UNPROVEN_STALE;
  const restoreServicesRead = interruptServicesRead(fixture);
  t.equal(await decide(), null, 'unavailable target authority defers supersession');
  t.equal(await decideRemotely(), null, 'remote supersession also defers');
  t.not((await staleDrainSource()).state, staleState,
    'unavailable target authority cannot infer stale, unmaterialized failure');
  restoreServicesRead();
  t.match(await decide(), /eligible cohort/i, 'genuine absence still permits supersession');
  t.match(await decideRemotely(), /eligible cohort/i, 'remote drain accepts genuine absence');
  t.equal((await staleDrainSource()).state, staleState, 'genuine absence can be stale');

  const now = Date.now();
  const inserted = await fixture.gateway.submitMutation({
    operation: 'insert',
    tableName: SYSTEM_TABLE_NAME.SERVICES,
    row: {
      service_id: operation.replicaId,
      replica_id: operation.replicaId,
      service_type: SERVICE_TYPE.PARTITION,
      partition_id: operation.partitionId,
      node_id: operation.targetNodeId,
      status: ReplicaStatus.CREATING,
      created_at: now,
      updated_at: now,
    },
  });
  t.equal(inserted.success, true);
  t.equal(await decide(), null, 'a materialized SQL target defers despite an empty cache');
  t.equal(await decideRemotely(), null, 'remote drain defers a materialized SQL target');
  t.not((await staleDrainSource()).state, staleState,
    'a materialized SQL target cannot enter the stale-target failure lane');
});

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
    const resumed = await reopened.coordinator.workflowOwner.runReplaceStoppingOwner(stale);
    t.equal(resumed.success, false, 'STOPPING adapter cannot turn adopted failure into success');
    t.equal(resumed.reconcileOutcome, OPERATION_RECONCILE_OUTCOME.FAILED);
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

test('strict outcomes runtime service preserves its encoded logical entity identity', async (t) => {
  const fixture = createFixture(t).current;
  const operation = await seedOperation(t, fixture, 'strict-runtime', {
    type: OperationType.REMOVE, partitionId: 'strict-service',
    entityType: SERVICE_TYPE.RUNTIME_SERVICE, entityId: 'strict-service',
  });
  const outcome = await fixture.coordinator.workflowOwner.completeOperation(operation);
  t.equal(outcome.reconcileOutcome, OPERATION_RECONCILE_OUTCOME.COMPLETED);
  t.equal(outcome.operation.partitionId, 'strict-service');
  t.equal(outcome.operation.entityId, 'strict-service');
});

test('strict outcomes real SQLite refusal and reinsertion retain obligations', async (t) => {
  const fixture = createFixture(t).current;
  const operation = await seedOperation(t, fixture, 'strict-dispositions');
  const owner = fixture.coordinator.workflowOwner;
  const requested = {...operation, workflowStep: WORKFLOW_STEP.CREATING,
    status: ReplicaStatus.CREATING};
  const refused = await owner.repository.persistOperationUpdate(requested,
    {expectedWorkflowStep: WORKFLOW_STEP.ACTIVE, confirmPersistence: false});
  t.equal(refused.disposition, REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED);
  t.equal(refused.operation, null);
  t.equal(buildOperationTransitionOutcome(refused).reconcileOutcome,
    OPERATION_RECONCILE_OUTCOME.REFUSED);
  t.equal(reservationStatus(fixture, operation.operationId), RESERVATION_STATUS.ACTIVE);
  fixture.database.prepare('DELETE FROM replica_operations WHERE operation_id = ?')
    .run(operation.operationId);
  const reinserted = await owner.completeOperation(operation);
  t.equal(reinserted.disposition, REPLICA_OPERATION_UPDATE_DISPOSITION.REINSERTED);
  t.equal(reinserted.reconcileOutcome, OPERATION_RECONCILE_OUTCOME.WAITING);
  t.equal(reservationStatus(fixture, operation.operationId), RESERVATION_STATUS.ACTIVE,
    'reinsertion cannot release a retained reservation');
  t.ok(owner.terminalTransitionRepairStateByOperationId.has(operation.operationId));
  const durable = await owner.repository.queryAuthoritativeOperationById(operation.operationId);
  const replay = await owner.completeOperation(operation);
  t.equal(replay.disposition, REPLICA_OPERATION_UPDATE_DISPOSITION.IDEMPOTENT_REPLAY);
  t.equal(replay.reconcileOutcome, OPERATION_RECONCILE_OUTCOME.COMPLETED);
  t.same(replay.operation, durable, 'a later authoritative observation proves exact reinsertion');
  t.equal(reservationStatus(fixture, operation.operationId), RESERVATION_STATUS.RELEASED);
});

for (const corruptHistory of [false, true]) {
  test(`strict outcomes recovered real write checks exact history: corrupt=${corruptHistory}`,
    async (t) => {
      const fixture = createFixture(t).current;
      const operation = await seedOperation(t, fixture, `strict-recovered-${corruptHistory}`);
      const owner = fixture.coordinator.workflowOwner;
      const submit = fixture.gateway.submitMutation.bind(fixture.gateway);
      let deliveries = 0;
      fixture.gateway.submitMutation = async (mutation, options) => {
        const answer = await submit(mutation, options);
        if (mutation.operation !== 'update' || !mutation.data?.workflow_step) return answer;
        const changedRows = answer.partitionResult?.affectedRows;
        if (changedRows > 0) deliveries += changedRows;
        if (corruptHistory && changedRows > 0) {
          fixture.database.prepare(
            'UPDATE replica_operations SET steps_history = ? WHERE operation_id = ?',
          ).run(JSON.stringify([{step: WORKFLOW_STEP.FAILED, timestamp: 1}]),
            operation.operationId);
        }
        const participant = {error: 'query_admission_deferred',
          errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE', retryAfterMs: 250,
          deferRetry: true, failedTable: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS};
        return {success: false, ...participant,
          firstFailedParticipant: participant, participantFailures: [participant]};
      };
      const attempted = await observeAttempt(() => owner.completeOperation(operation));
      t.equal(deliveries, 1,
        'the conditional SQL changes the durable row exactly once despite retryable reply loss');
      if (corruptHistory) {
        t.ok(attempted.error, 'matching step/time with different history cannot prove recovery');
        t.equal(reservationStatus(fixture, operation.operationId), RESERVATION_STATUS.ACTIVE);
      } else {
        t.equal(attempted.error, null);
        t.equal(attempted.outcome.disposition, REPLICA_OPERATION_UPDATE_DISPOSITION.RECOVERED);
        t.equal(attempted.outcome.reconcileOutcome, OPERATION_RECONCILE_OUTCOME.COMPLETED);
        t.equal(reservationStatus(fixture, operation.operationId), RESERVATION_STATUS.RELEASED);
        t.throws(() => {
          attempted.outcome.operation.stepsHistory[0].step = 'MUTATED';
        }, TypeError,
        'returned evidence snapshot cannot be mutated through nested history');
      }
    });
}

for (const fault of ['malformed-read', 'zero-change', 'lost-release-reply']) {
  test(`strict outcomes real storage release ${fault} retains or proves its exact obligation`,
    async (t) => {
      const fixture = createFixture(t).current;
      const operation = await seedOperation(t, fixture, `strict-release-${fault}`);
      const owner = fixture.coordinator.workflowOwner;
      const execute = fixture.coordinator.sqlQueryEngine.executeQuery
        .bind(fixture.coordinator.sqlQueryEngine);
      const read = fixture.gateway.readAuthoritativeRows.bind(fixture.gateway);
      if (fault === 'malformed-read') {
        fixture.gateway.readAuthoritativeRows = async (table, ...args) =>
          table === SYSTEM_TABLE_NAME.STORAGE_RESERVATIONS ?
            {success: true, rows: null} : read(table, ...args);
      } else {
        fixture.coordinator.sqlQueryEngine.executeQuery = async (sql, params, options) => {
          if (!sql.includes('UPDATE storage_reservations')) return execute(sql, params, options);
          if (fault === 'zero-change') return {success: true, changes: 0};
          await execute(sql, params, options);
          return {success: false, error: 'lost storage release reply'};
        };
      }
      const attempted = await observeAttempt(() => owner.completeOperation(operation));
      if (fault === 'lost-release-reply') {
        t.equal(attempted.error, null, 'exact final row proves the release despite lost reply');
        t.equal(reservationStatus(fixture, operation.operationId), RESERVATION_STATUS.RELEASED);
      } else {
        t.equal(attempted.error?.code, 'RESERVATION_RELEASE_UNCONFIRMED');
        t.equal(reservationStatus(fixture, operation.operationId), RESERVATION_STATUS.ACTIVE);
        t.ok(owner.terminalTransitionRepairStateByOperationId.has(operation.operationId));
        fixture.gateway.readAuthoritativeRows = read;
        fixture.coordinator.sqlQueryEngine.executeQuery = execute;
        await runTerminalTransitionRepairAttempt(owner, operation.operationId);
        t.equal(reservationStatus(fixture, operation.operationId), RESERVATION_STATUS.RELEASED);
        t.equal(owner.terminalTransitionRepairStateByOperationId.has(operation.operationId), false);
      }
    });
}

for (const apply of [false, true]) {
  test(`strict outcomes uncounted success consults actual SQL: effect=${apply}`, async (t) => {
    const fixture = createFixture(t).current;
    const operation = await seedOperation(t, fixture, `strict-uncounted-${apply}`);
    const submit = fixture.gateway.submitMutation.bind(fixture.gateway);
    fixture.gateway.submitMutation = async (mutation, options) => {
      if (mutation.operation !== 'update' || !mutation.data?.workflow_step) {
        return submit(mutation, options);
      }
      if (apply) await submit(mutation, options);
      return {success: true};
    };
    const outcome = await fixture.coordinator.workflowOwner.completeOperation(operation);
    t.equal(outcome.committed, false, 'an uncounted answer never proves a new committed write');
    t.equal(outcome.disposition, apply ? REPLICA_OPERATION_UPDATE_DISPOSITION.IDEMPOTENT_REPLAY :
      REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED);
    t.equal(reservationStatus(fixture, operation.operationId), apply ?
      RESERVATION_STATUS.RELEASED : RESERVATION_STATUS.ACTIVE);
    t.equal(fixture.coordinator.workflowOwner.terminalTransitionRepairStateByOperationId
      .has(operation.operationId), !apply, 'uncertain effects retain their existing repair owner');
  });
}


test('strict outcomes queued terminal writers return the exact durable winner', async (t) => {
  const fixture = createFixture(t).current;
  const operation = await seedOperation(t, fixture, 'strict-queued-terminal');
  const owner = fixture.coordinator.workflowOwner;
  const atomic = owner.executeAtomicTransition.bind(owner);
  let release;
  const bothProjected = new Promise((resolve) => {
    release = resolve;
  });
  let queued = 0;
  owner.executeAtomicTransition = async (...args) => {
    queued++;
    if (queued === 2) release();
    await bothProjected;
    return atomic(...args);
  };
  const outcomes = await Promise.all([
    owner.completeOperation(structuredClone(operation)),
    owner.completeOperation(structuredClone(operation)),
  ]);
  const winner = await fixture.coordinator.repository.queryOperationById(operation.operationId);
  t.equal(outcomes.filter((outcome) => outcome.committed).length, 1,
    'only one writer reports a newly committed transition');
  for (const outcome of outcomes) {
    t.equal(outcome.reconcileOutcome, OPERATION_RECONCILE_OUTCOME.COMPLETED);
    t.same(outcome.operation, winner, 'each caller receives the exact durable winner');
  }
  t.equal(winner.stepsHistory.filter((entry) => entry.step === WORKFLOW_STEP.ACTIVE).length, 1,
    'the losing caller manufactures no second terminal history entry');
  t.equal(reservationStatus(fixture, operation.operationId), RESERVATION_STATUS.RELEASED);
});

for (const history of ['{broken', '{}', 'null']) {
  test(`strict outcomes reject corrupt durable history ${history}`, async (t) => {
    const fixture = createFixture(t);
    const operation = await seedOperation(t, fixture.current, `strict-bad-history-${history}`);
    fixture.current.database.prepare(
      'UPDATE replica_operations SET steps_history = ? WHERE operation_id = ?',
    ).run(history, operation.operationId);
    const reopened = await fixture.reopen();
    const attempt = await observeAttempt(() =>
      reopened.coordinator.workflowOwner.completeOperation(operation));
    t.equal(attempt.error?.code, INVALID_OUTCOME_CODE);
    t.equal(reservationStatus(reopened, operation.operationId), RESERVATION_STATUS.ACTIVE);
    t.equal(reopened.database.prepare(
      'SELECT steps_history FROM replica_operations WHERE operation_id = ?',
    ).get(operation.operationId).steps_history, history, 'corrupt evidence is preserved');
  });
}


for (const count of [true, '1', 1.5, -1, null]) {
  test(`strict outcomes malformed changed count ${String(count)} cannot prove new progress`,
    async (t) => {
      const fixture = createFixture(t).current;
      const operation = await seedOperation(t, fixture, `strict-count-${String(count)}`);
      const submit = fixture.gateway.submitMutation.bind(fixture.gateway);
      fixture.gateway.submitMutation = async (mutation, options) => {
        const result = await submit(mutation, options);
        return mutation.operation === 'update' && mutation.data?.workflow_step ?
          {success: true, changes: count} : result;
      };
      const outcome = await fixture.coordinator.workflowOwner.completeOperation(operation);
      t.equal(outcome.committed, false);
      t.equal(outcome.disposition, REPLICA_OPERATION_UPDATE_DISPOSITION.IDEMPOTENT_REPLAY);
      t.equal(fixture.coordinator.stats.operationsCompleted, 0,
        'a separately observed replay does not manufacture local commit credit');
      t.equal(reservationStatus(fixture, operation.operationId), RESERVATION_STATUS.RELEASED);
    });
}

test('strict outcomes interrupted release eventually wakes real terminal subscribers', async (t) => {
  const fixture = createFixture(t).current;
  const partitionId = 'replica_operations-p1';
  const operation = await seedOperation(t, fixture, 'strict-release-wake',
    {partitionId, entityId: partitionId});
  const {coordinator} = fixture;
  const rebalancer = createTestRebalancer({entityId: partitionId,
    entityType: SERVICE_TYPE.PARTITION, rebalanceCoordinator: coordinator});
  rebalancer.isLeader = true;
  const wakes = [];
  rebalancer.enqueueRebalanceCheck = (reason) => {
    wakes.push(['rebalance', reason]);
  };
  rebalancer.enqueueMembershipPublicationReconcile = (reason) => {
    wakes.push(['membership', reason]);
  };
  rebalancer.bindCoordinatorProgressListeners(coordinator);
  t.teardown(() => rebalancer.unbindCoordinatorProgressListeners());
  const key = coordinator.buildOperationIntentKey({type: operation.type,
    nodeId: operation.targetNodeId, replicaId: operation.replicaId},
  operation.entityType, operation.entityId);
  coordinator.rememberOperationIntents([key], operation);
  const read = fixture.gateway.readAuthoritativeRows.bind(fixture.gateway);
  let interrupted = false;
  fixture.gateway.readAuthoritativeRows = async (table, ...args) => {
    if (table === SYSTEM_TABLE_NAME.STORAGE_RESERVATIONS && !interrupted) {
      interrupted = true;
      return {success: false, error: 'interrupted release before terminal wake'};
    }
    return read(table, ...args);
  };
  const first = await observeAttempt(() => coordinator.workflowOwner.completeOperation(operation));
  t.equal(first.error?.code, 'RESERVATION_RELEASE_UNCONFIRMED');
  t.equal(wakes.length, 0, 'dependent terminal subscribers remain asleep while release is held');
  t.equal(coordinator.recentOperationIntents.has(key), true);
  t.equal(coordinator.stats.operationsCompleted, 1, 'the real committed result receives one credit');
  await runTerminalTransitionRepairAttempt(coordinator.workflowOwner, operation.operationId);
  t.same(wakes.map(([kind]) => kind), ['rebalance', 'membership']);
  t.equal(coordinator.recentOperationIntents.has(key), false, 'actual intent pruner receives the wake');
  t.equal(coordinator.stats.operationsCompleted, 1, 'repair does not recount the committed result');
  await coordinator.workflowOwner.completeOperation(operation);
  t.equal(coordinator.stats.operationsCompleted, 1, 'idempotent replay never adds commit credit');
  t.equal(coordinator.workflowOwner.terminalTransitionRepairStateByOperationId.size, 0,
    'notification credit state ends with its release obligation');
});

for (const deferred of [false, true]) {
  test(`strict outcomes reservation sweeps retain malformed/deferred terminal evidence: ${deferred}`,
    async (t) => {
      const fixture = createFixture(t).current;
      const operation = await seedOperation(t, fixture, `strict-sweep-${deferred}`);
      fixture.database.prepare('UPDATE storage_reservations SET expires_at = 0').run();
      fixture.coordinator.repository.getOperationByIdVisibilityObservation = async () => ({
        operation: {...operation, workflowStep: WORKFLOW_STEP.FAILED,
          status: ReplicaStatus.FAILED, completedAt: deferred ? Date.now() : null},
        deferredOutcome: deferred ? {reasonCode: 'authority unavailable'} : null,
      });
      const attempt = await observeAttempt(() => fixture.coordinator.reconcileReservations());
      if (!deferred) t.equal(attempt.error?.code, INVALID_OUTCOME_CODE);
      else t.equal(attempt.error, null);
      t.equal(reservationStatus(fixture, operation.operationId), RESERVATION_STATUS.ACTIVE,
        'neither expiry nor orphan sweep discharges unproved terminal evidence');
    });
}


test('strict outcomes owner-unavailable release cannot consume a local empty fallback', async (t) => {
  const fixture = createFixture(t).current;
  const operation = await seedOperation(t, fixture, 'strict-required-release');
  const read = fixture.gateway.readAuthoritativeRows.bind(fixture.gateway);
  let fallbackReads = 0;
  fixture.gateway.readAuthoritativeRows = async (table, sql, params, options) => {
    if (table !== SYSTEM_TABLE_NAME.STORAGE_RESERVATIONS) return read(table, sql, params, options);
    if (options.authoritativeReadMode ===
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED) {
      return {success: false, error: 'reservation authority unavailable'};
    }
    fallbackReads++;
    return {success: true, rows: []};
  };
  const attempted = await observeAttempt(() =>
    fixture.coordinator.workflowOwner.completeOperation(operation));
  t.equal(attempted.error?.code, 'RESERVATION_RELEASE_UNCONFIRMED');
  t.equal(fallbackReads, 0);
  t.equal(reservationStatus(fixture, operation.operationId), RESERVATION_STATUS.ACTIVE);
  t.ok(fixture.coordinator.workflowOwner.terminalTransitionRepairStateByOperationId
    .has(operation.operationId));
});

test('strict outcomes crash after release before notification resumes through owner rebind', async (t) => {
  const fixture = createFixture(t);
  const partitionId = 'replica_operations-p1';
  const operation = await seedOperation(t, fixture.current, 'strict-post-release-crash',
    {partitionId, entityId: partitionId});
  const committed = await persistTerminalWitness(fixture.current, operation);
  // Commit and actual storage release exist, but no terminal workflow notification
  // was delivered before discarding the coordinator and reopening its SQLite file.
  await fixture.current.coordinator.releaseReservationForOperation(committed.operation);
  const rebalancer = createTestRebalancer({entityId: partitionId,
    entityType: SERVICE_TYPE.PARTITION, rebalanceCoordinator: fixture.current.coordinator});
  rebalancer.isLeader = true;
  const wakes = [];
  rebalancer.enqueueRebalanceCheck = (reason) => {
    wakes.push(['rebalance', reason]);
  };
  rebalancer.enqueueMembershipPublicationReconcile = (reason) => {
    wakes.push(['membership', reason]);
  };
  t.teardown(() => rebalancer.unbindCoordinatorProgressListeners());
  const reopened = await fixture.reopen();
  rebalancer.setRebalanceCoordinator(reopened.coordinator);
  t.same(wakes.map(([kind]) => kind), ['rebalance', 'membership'],
    'existing coordinator attachment wakes both dependent owners without a terminal event replay');
  t.equal(reservationStatus(reopened, operation.operationId), RESERVATION_STATUS.RELEASED);
  t.equal(readPlacementCensus(reopened.database)
    .find((row) => row.operationId === operation.operationId).incomplete, false);
  t.equal(reopened.coordinator.recentOperationIntents.size, 0,
    'the volatile intent cache is empty after process reconstruction');
});


test('strict outcomes known terminal preimage cannot become recovered progress after zero-effect reply loss',
  async (t) => {
    const fixture = createFixture(t).current;
    const operation = await seedOperation(t, fixture, 'strict-zero-effect-lost-reply');
    const committed = await persistTerminalWitness(fixture, operation);
    const submit = fixture.gateway.submitMutation.bind(fixture.gateway);
    let mutationAttempts = 0;
    fixture.gateway.submitMutation = async (mutation, options) => {
      const result = await submit(mutation, options);
      if (mutation.operation !== 'update' || !mutation.data?.workflow_step) return result;
      mutationAttempts++;
      t.equal(result.partitionResult.affectedRows, 0,
        'the immutable terminal row cannot be changed by another identical terminal CAS');
      const participant = {error: 'query_admission_deferred',
        errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE', retryAfterMs: 250,
        deferRetry: true, failedTable: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS};
      return {success: false, ...participant,
        firstFailedParticipant: participant, participantFailures: [participant]};
    };
    const persisted = await fixture.coordinator.repository.persistOperationUpdate(
      structuredClone(committed.operation), {terminalTransition: true});
    const replay = buildOperationTransitionOutcome(persisted);
    t.equal(replay.disposition, REPLICA_OPERATION_UPDATE_DISPOSITION.IDEMPOTENT_REPLAY);
    t.equal(replay.committed, false, 'preexisting settlement is never new recovered progress');
    t.equal(mutationAttempts, 0, 'known replay does not send an unnecessary mutation');
    t.same(replay.operation, committed.operation);
  });

test('strict outcomes competing terminal writer between preimage and SQL cannot be overwritten',
  async (t) => {
    const fixture = createFixture(t).current;
    const operation = await seedOperation(t, fixture, 'strict-terminal-race');
    const repository = fixture.coordinator.repository;
    const now = Date.now();
    const winner = {...operation, workflowStep: WORKFLOW_STEP.FAILED,
      status: ReplicaStatus.FAILED, updatedAt: now, completedAt: now,
      errorMessage: 'competing durable failure',
      stepsHistory: [...operation.stepsHistory, {step: WORKFLOW_STEP.FAILED, timestamp: now}]};
    const submit = fixture.gateway.submitMutation.bind(fixture.gateway);
    let injected = false;
    let loserChanges = null;
    fixture.gateway.submitMutation = async (mutation, options) => {
      if (!injected && mutation.operation === 'update' && mutation.data?.workflow_step) {
        injected = true;
        const committed = await submit({operation: 'update',
          tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
          whereClause: repository.buildReplicaOperationUpdateWhereClause(winner, null,
            {terminalTransition: true}),
          data: repository.buildReplicaOperationUpdateData(winner)}, options);
        t.equal(committed.partitionResult.affectedRows, 1, 'competing SQL terminal CAS commits');
        const lost = await submit(mutation, options);
        loserChanges = lost.partitionResult.affectedRows;
        return lost;
      }
      return submit(mutation, options);
    };
    const outcome = await fixture.coordinator.workflowOwner.completeOperation(operation);
    t.equal(loserChanges, 0, 'the actual losing SQLite CAS changes no row');
    t.equal(outcome.committed, false);
    t.equal(outcome.disposition, REPLICA_OPERATION_UPDATE_DISPOSITION.TERMINAL_ADOPTED);
    t.equal(outcome.reconcileOutcome, OPERATION_RECONCILE_OUTCOME.FAILED);
    t.equal(outcome.operation.errorMessage, winner.errorMessage);
    t.same(outcome.operation.stepsHistory, winner.stepsHistory);
    t.same(await repository.queryAuthoritativeOperationById(operation.operationId),
      outcome.operation);
    t.equal(reservationStatus(fixture, operation.operationId), RESERVATION_STATUS.RELEASED);
  });


test('strict outcomes priority claim consumes the exact confirmed operation', async (t) => {
  const fixture = createFixture(t).current;
  const operation = await seedOperation(t, fixture, 'strict-priority-claim');
  const owner = fixture.coordinator.workflowOwner;
  const claimed = await owner.claimPriorityDispatchTransition(operation);
  const durable = await owner.repository.queryAuthoritativeOperationById(operation.operationId);
  t.equal(claimed, operation, 'the caller retains its operation object');
  t.equal(durable.workflowStep, WORKFLOW_STEP.SENDING, 'the real conditional claim commits');
  t.same(claimed, durable, 'lease, history and semantic fields come from the confirmed row');
  t.equal(reservationStatus(fixture, operation.operationId), RESERVATION_STATUS.ACTIVE);
});


test('strict outcomes unreadable terminal preimage cannot earn recovered credit from a later row',
  async (t) => {
    const fixture = createFixture(t).current;
    const operation = await seedOperation(t, fixture, 'strict-unreadable-preimage');
    const terminal = await persistTerminalWitness(fixture, operation);
    const repository = fixture.coordinator.repository;
    const read = fixture.gateway.executeQuery.bind(fixture.gateway);
    const submit = fixture.gateway.submitMutation.bind(fixture.gateway);
    let unavailable = true;
    let mutationAttempts = 0;
    let refusedReads = 0;
    fixture.gateway.executeQuery = async (sql, params, options) => {
      if (unavailable && sql.includes('SELECT') && sql.includes('replica_operations')) {
        refusedReads++;
        return {success: false, error: 'injected preimage authority unavailable'};
      }
      return read(sql, params, options);
    };
    fixture.gateway.submitMutation = async (mutation, options) => {
      const result = await submit(mutation, options);
      if (mutation.operation !== 'update' || !mutation.data?.workflow_step) return result;
      mutationAttempts++;
      t.equal(result.partitionResult.affectedRows, 0, 'the existing terminal cannot be rewritten');
      unavailable = false;
      const participant = {error: 'query_admission_deferred',
        errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE', retryAfterMs: 250,
        deferRetry: true, failedTable: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS};
      return {success: false, ...participant,
        firstFailedParticipant: participant, participantFailures: [participant]};
    };
    const attempt = await observeAttempt(() => repository.persistOperationUpdate(
      structuredClone(terminal.operation), {terminalTransition: true}));
    t.ok(refusedReads > 0, 'the real read transport refused preimage authority');
    t.equal(attempt.error?.deferRetry, true, 'unproved preimage remains explicit uncertainty');
    t.equal(attempt.outcome, null, 'later visibility cannot manufacture recovered progress');
    t.equal(mutationAttempts, 0, 'no mutation is submitted without the required preimage');
    t.equal(reservationStatus(fixture, operation.operationId), RESERVATION_STATUS.ACTIVE);
    unavailable = false;
    const replay = await repository.persistOperationUpdate(structuredClone(terminal.operation),
      {terminalTransition: true});
    t.equal(replay.disposition, REPLICA_OPERATION_UPDATE_DISPOSITION.IDEMPOTENT_REPLAY);
    t.equal(buildOperationTransitionOutcome(replay).committed, false);
    t.same(replay.operation, terminal.operation, 'fresh authority proves the original exact winner');
  });
