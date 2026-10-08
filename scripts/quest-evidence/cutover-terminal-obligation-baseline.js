#!/usr/bin/env node
// C0 classification only: real repository/owner/SQLite, not distributed Raft.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import Database from 'better-sqlite3';
import {refuseUnderProbe} from '../../src/test-helpers/probe-guard.js';
import {REPLICA_OPERATIONS_SCHEMA, STORAGE_RESERVATIONS_SCHEMA} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {generateCreateTableSQL, generateCreateIndexSQL} from
  '../../src/bootstrap/system-table-schema-sql.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {WORKFLOW_STEP, SERVICE_TYPE} from '../../src/constants/index.js';
import {createCoordinatorWithStorage, createDeterministicTimerQueue,
  initializeConfig} from '../../test/rebalancer/reservation-dispatch-gate-test-harness.js';

refuseUnderProbe('terminal membership obligation owner-entry diagnostic');
const [output, sourceSha] = process.argv.slice(2);
assert.ok(output && /^[a-f0-9]{40}$/u.test(sourceSha || ''), 'output and exact SHA required');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const directory = path.dirname(path.resolve(output));
fs.mkdirSync(directory, {recursive: true});
const scratch = fs.mkdtempSync(path.join(directory, 'terminal-obligation-'));
const dbPath = path.join(scratch, 'operations.sqlite');
const group = 'mg-c0-terminal';
const operationId = 'c0-terminal-membership-operation';
const laneKey = `message-group:${group}`;
const localNode = 'c0-membership-owner';
const queries = [];
const physicalCalls = [];
let coordinator;
let db;
const report = {schema: 'cutover-terminal-obligation-baseline/1', sourceSha,
  measurementStatus: 'not_measured', runtimeSourceChanged: false,
  independentReview: false, distributedAcceptance: false,
  proofCeiling: 'actual repository and ordinary owner entrypoints after SQLite reopen; supplied admission history, no Raft, promotion, physical CREATE or full cluster startup',
  substitutions: ['canonical SQLite tables in place of distributed SQL/Raft gateway',
    'existing test-harness readiness/cache/transport facts and deterministic timers',
    'fixture supplies an admitted membership tuple; no claim that parked planner admitted it',
    'physical execution and transport are forbidden tripwires'], observations: {}};

function row() {
  return db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?').get(operationId);
}
function obligation(input) {
  return Object.fromEntries(Object.entries(input).filter(([key]) =>
    key.startsWith('message_group_') || ['source_replica_id', 'replica_id', 'operation_id'].includes(key)));
}
function open() {
  db = new Database(dbPath);
  db.pragma('journal_mode=WAL');
  db.pragma('synchronous=FULL');
  for (const schema of [REPLICA_OPERATIONS_SCHEMA, STORAGE_RESERVATIONS_SCHEMA]) {
    db.exec(generateCreateTableSQL(schema));
    for (const sql of generateCreateIndexSQL(schema)) db.exec(sql);
  }
  const engine = {
    reservations: {get size() {return db.prepare('SELECT COUNT(*) FROM storage_reservations').pluck().get();}},
    async executeQuery(sql, params = []) {
      queries.push({sql, params});
      try {
        const statement = db.prepare(sql);
        if (statement.reader) return {success: true, rows: statement.all(...params)};
        const result = statement.run(...params);
        return {success: true, affectedRows: result.changes, changes: result.changes};
      } catch (error) {
        return {success: false, error: error.message, errorCode: error.code};
      }
    },
  };
  const timers = createDeterministicTimerQueue();
  coordinator = createCoordinatorWithStorage({nodeId: localNode, sqlQueryEngine: engine,
    setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn}).coordinator;
  coordinator.workflowOwner.executeOperationInternal = async () => {
    physicalCalls.push('executeOperationInternal');
    throw new Error('physical execution outside terminal diagnostic');
  };
  coordinator.messageRouter.deliver = async () => {
    physicalCalls.push('deliver');
    throw new Error('transport outside terminal diagnostic');
  };
}
async function close() {
  if (coordinator) await coordinator.shutdown();
  coordinator = null;
  if (db) db.close();
  db = null;
}
function pending(id, target) {
  return {operationId: id, type: OperationType.REPLACE, partitionId: group,
    entityType: SERVICE_TYPE.MESSAGE_GROUP, entityId: group,
    sourceReplicaId: `${group}-r1`, replicaId: target, targetClaimKey: null,
    sourceNodeId: localNode, targetNodeId: 'c0-fresh-target-node',
    membershipPublicationEpoch: 17, status: ReplicaStatus.PENDING,
    workflowStep: WORKFLOW_STEP.PENDING, createdAt: 10, updatedAt: 10,
    completedAt: null, errorMessage: null, stepsHistory: [],
    messageGroupMembershipLaneKey: laneKey,
    messageGroupMembershipPhase: 'learner_requested',
    messageGroupMembershipObligationState: 'intent_recorded',
    messageGroupMembershipIdentity: JSON.stringify({groupId: group,
      targetReplicaId: target, targetPeerId: 44}),
    messageGroupLearnerStamp: null, messageGroupVoterStamp: null,
    messageGroupRemovalStamp: null,
    messageGroupSourceLifecycleClaim: JSON.stringify({replicaId: `${group}-r1`,
      createdAt: 3, stateEnteredAt: 4, createAttemptToken: 'c0-source-attempt'})};
}

try {
  initializeConfig();
  open();
  const inserted = await coordinator.repository.persistNewOperation(
    pending(operationId, `${group}-r4`), {returnDisposition: true});
  assert.equal(inserted.disposition, 'inserted', 'real canonical repository insert must engage');
  const live = await coordinator.repository.queryAuthoritativeOperationById(operationId);
  assert.equal(coordinator.repository.isOperationTerminal(live), false);
  const before = obligation(row());
  const settled = {...live, status: ReplicaStatus.FAILED, workflowStep: WORKFLOW_STEP.FAILED,
    updatedAt: 11, completedAt: 11, errorMessage: 'c0 ordinary settlement',
    stepsHistory: [{step: WORKFLOW_STEP.FAILED, previousStep: WORKFLOW_STEP.PENDING,
      timestamp: 11, reason: 'c0_terminal_obligation'}]};
  const terminalResult = await coordinator.repository.persistOperationUpdate(settled, {
    returnDisposition: true, terminalTransition: true, expectedWorkflowStep: WORKFLOW_STEP.PENDING,
    confirmPersistence: false, disableSystemWriteSession: true});
  assert.equal(row().workflow_step, WORKFLOW_STEP.FAILED, 'terminal repository write must engage');
  assert.deepEqual(obligation(row()), before, 'ordinary settlement retains exact membership tuple');
  report.observations.settlement = {result: terminalResult, row: row()};
  await close();
  open();
  const restored = await coordinator.repository.queryAuthoritativeOperationById(operationId);
  assert.equal(coordinator.repository.isOperationTerminal(restored), true);
  assert.equal(coordinator.workflowOwner.operationProgressStore.listOperationProgressRecords().length, 0);
  const beforeEntries = row();
  const owner = coordinator.workflowOwner;
  // Unlike the earlier process-loss diagnostic, do not prefilter terminal rows.
  const armed = await owner.armCoordinatorCreatedOperation(restored);
  const observed = await owner.reconcileObservedProgressOperation(operationId);
  report.observations.entries = {armed, observed,
    mirror: coordinator.operationWorkflowCoordinator.getWorkflowById(operationId),
    physicalCalls: [...physicalCalls], progress: owner.operationProgressStore.listOperationProgressRecords()};
  assert.equal(armed === true || armed?.applied === true, false, 'terminal arm cannot grant new execution');
  assert.equal(physicalCalls.length, 0, 'actual owner entrypoints must suppress physical work');
  assert.equal(row().workflow_step, WORKFLOW_STEP.FAILED);
  assert.deepEqual(obligation(row()), obligation(beforeEntries));
  const conflict = await coordinator.repository.persistNewOperation(
    pending('c0-terminal-second-operation', `${group}-r5`), {returnDisposition: true});
  report.observations.secondOperation = conflict;
  assert.equal(conflict.disposition, 'membership_lane_conflict');
  assert.equal(conflict.operation.operationId, operationId);
  assert.equal(db.prepare('SELECT COUNT(*) FROM replica_operations WHERE message_group_membership_lane_key = ?')
    .pluck().get(laneKey), 1);
  assert.deepEqual(obligation(row()), before);
  report.observations.finalRow = row();
  report.observations.queries = queries;
  report.measurementStatus = 'measured';
  report.membershipRecoveryImplemented = false;
  report.interpretation = 'Ordinary owner entries do not gain execution and SQL retains the exact membership lane. This does not prove resumption of the parked membership protocol; its active recovery driver remains a FreshMG product obligation.';
} catch (error) {
  report.measurementStatus = 'failed';
  report.error = {name: error.name, message: error.message, stack: error.stack};
  report.observations.physicalCalls = physicalCalls;
  report.observations.queries = queries;
  process.exitCode = 1;
} finally {
  await close();
  report.sourceDigests = Object.fromEntries([
    'src/rebalancer/operation-workflow-owner.js',
    'src/rebalancer/operation-workflow-owner-execution-lane.js',
    'src/rebalancer/operation-workflow-recovery-observation.js',
    'src/rebalancer/operation-workflow-owner-ports.js',
    'src/rebalancer/replica-operation-repository-mutation-update-methods.js',
    'src/rebalancer/replica-operation-repository-mutation-persistence-methods.js',
    'test/rebalancer/reservation-dispatch-gate-test-harness.js',
  ].map((file) => [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]));
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
