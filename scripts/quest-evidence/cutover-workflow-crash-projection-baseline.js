#!/usr/bin/env node
// C0 diagnostic only: unchanged coordinator/recovery code plus a DISK FIXTURE.
// Not the ReplicaOperationRepository, Raft, distributed failover or power loss.
import assert from 'node:assert/strict';
import {fork, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {refuseUnderProbe} from '../../src/test-helpers/probe-guard.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {DurableWorkflowCoordinator} from '../../src/workflow/durable-workflow-coordinator.js';
import {
  isOperationWorkflowTerminalForPersistence,
  persistOperationWorkflowTransitionToDurableRow,
  recoverOperationWorkflowsFromDurableRows,
} from '../../src/rebalancer/operation-workflow-persistence.js';
import {createOperationProgressStore} from '../../src/rebalancer/operation-progress-store.js';

refuseUnderProbe('the C0 process-crash diagnostic');
const self = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(self), '../..');
const ID = 'c0-crash-operation';
const NOW = 40000;
const WAIT_MS = 10000; // ends on this child exiting or reaching its named IPC cut.
const CASES = Object.freeze([
  'acknowledged', 'before-commit', 'inside-transaction',
  'commit-before-local-mark', 'after-local-mark', 'cas-refused',
  'write-unavailable', 'different-durable-winner',
]);
const FILES = Object.freeze([
  'src/constants/workflow.js', 'src/workflow/workflow-constants.js',
  'src/workflow/durable-workflow-coordinator.js',
  'src/workflow/durable-workflow-storage-ownership.js',
  'src/rebalancer/operation-workflow-persistence.js',
  'src/rebalancer/operation-progress-store.js',
  'src/rebalancer/operation-workflow-transition-orchestration.js',
  'src/rebalancer/operation-workflow-owner-execution-lane.js',
]);

// This fixture's schema and CAS are not a claimed production row/lease owner.
function connect(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
  return db;
}
function initialOperation() {
  return {operationId: ID, workflowStep: WORKFLOW_STEP.PENDING,
    completedAt: null, stepsHistory: [{step: WORKFLOW_STEP.PENDING,
      previousStep: null, timestamp: NOW, reason: 'fixture-admission'}],
    // Opaque obligations are retained, not acted on, by these real loaders.
    messageGroupMembershipLaneKey: 'c0-group',
    messageGroupMembershipObligationState: 'fixture-unresolved',
    messageGroupMembershipIdentity: 'c0-fixed-source-target-pair'};
}
function readRow(db) {
  const row = db.prepare('SELECT revision, body FROM c0_fixture WHERE id=?').get(ID);
  assert.ok(row, 'fixture operation row must exist');
  return {revision: row.revision, operation: JSON.parse(row.body)};
}
function seed(file, terminal = false) {
  const db = connect(file);
  db.exec('CREATE TABLE c0_fixture(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL)');
  const op = initialOperation();
  if (terminal) {
    op.completedAt = NOW + 1;
    op.workflowStep = WORKFLOW_STEP.FAILED;
    op.stepsHistory.push({step: WORKFLOW_STEP.FAILED,
      previousStep: WORKFLOW_STEP.PENDING, timestamp: NOW + 1,
      reason: 'fixture-terminal-with-outstanding-membership'});
  }
  db.prepare('INSERT INTO c0_fixture VALUES (?, ?, ?)').run(ID, 1, JSON.stringify(op));
  db.close();
}
function rebuild(operation) {
  const coordinator = new DurableWorkflowCoordinator({now: () => NOW + 2,
    persistWorkflow: persistOperationWorkflowTransitionToDurableRow,
    isTerminalWorkflow: isOperationWorkflowTerminalForPersistence});
  const result = recoverOperationWorkflowsFromDurableRows(coordinator, [operation]);
  return {coordinator, restored: result.restoredWorkflowIds.has(ID)};
}
function view(coordinator) {
  const workflow = coordinator.getWorkflowById(ID);
  return {step: workflow?.step ?? null,
    historyLength: workflow?.transitionHistory.length ?? 0,
    sendingMarked: coordinator.isTransitionIdempotent(ID, WORKFLOW_STEP.SENDING),
    retainedObligation: workflow?.durableOperation?.messageGroupMembershipObligationState ?? null};
}
function notify(message) {
  return new Promise((resolve, reject) => {
    process.send(message, (error) => error ? reject(error) : resolve());
  });
}
async function worker(kind, file) {
  assert.ok(CASES.includes(kind));
  const db = connect(file);
  const row = readRow(db);
  const {coordinator} = rebuild(row.operation);
  let persistCallbackCalls = 0;
  // Observation wrapper only; the source callback remains unchanged.
  coordinator.persistWorkflow = async (candidate) => {
    persistCallbackCalls += 1;
    return persistOperationWorkflowTransitionToDurableRow(candidate);
  };
  await coordinator.transitionStep(ID, {nextStep: WORKFLOW_STEP.SENDING,
    reason: 'fixture-dispatch'}, {}, {markCommitted: false});
  const projected = {...row.operation, workflowStep: WORKFLOW_STEP.SENDING,
    stepsHistory: [...row.operation.stepsHistory, {step: WORKFLOW_STEP.SENDING,
      previousStep: WORKFLOW_STEP.PENDING, timestamp: NOW + 2,
      reason: 'fixture-dispatch'}]};
  const observations = {kind, beforePersistence: view(coordinator),
    durableBefore: readRow(db), persistCallbackCalls, rowsChanged: null,
    sqlError: null, acknowledged: false};
  if (kind === 'cas-refused' || kind === 'different-durable-winner') {
    const winner = kind === 'different-durable-winner' ? projected : row.operation;
    db.prepare('UPDATE c0_fixture SET revision=2, body=? WHERE id=?')
      .run(JSON.stringify(winner), ID);
  }
  if (kind !== 'before-commit') {
    if (kind === 'write-unavailable') db.exec('PRAGMA query_only=ON');
    try {
      db.exec('BEGIN IMMEDIATE');
      const answer = db.prepare('UPDATE c0_fixture SET revision=revision+1, body=? WHERE id=? AND revision=?')
        .run(JSON.stringify(projected), ID, row.revision);
      observations.rowsChanged = Number(answer.changes);
      if (kind !== 'inside-transaction') db.exec('COMMIT');
    } catch (error) {
      observations.sqlError = {code: error.code, sqliteCode: error.errcode ?? null,
        message: error.message};
    }
  }
  if (kind === 'after-local-mark' || kind === 'acknowledged') {
    assert.equal(observations.rowsChanged, 1);
    coordinator.markTransitionCommitted(ID, WORKFLOW_STEP.SENDING);
  }
  observations.atCut = view(coordinator);
  observations.sqlAtCut = {inTransaction: db.isTransaction,
    row: readRow(db)};
  observations.acknowledged = kind === 'acknowledged';
  // Keep ONLY this child alive until the parent kills its own process.
  process.on('message', () => {});
  await notify(observations);
  if (kind === 'acknowledged') {
    db.close(); process.disconnect();
  }
}
async function recovered(file) {
  const db = connect(file);
  const row = readRow(db);
  const {coordinator, restored} = rebuild(row.operation);
  const beforeReplay = view(coordinator);
  let replayCallbackCalls = 0;
  if (restored && beforeReplay.sendingMarked) {
    coordinator.persistWorkflow = async (candidate) => {
      replayCallbackCalls += 1;
      return persistOperationWorkflowTransitionToDurableRow(candidate);
    };
    await coordinator.transitionStep(ID, {nextStep: WORKFLOW_STEP.SENDING,
      reason: 'fixture-replay'}, {}, {markCommitted: false});
    assert.equal(replayCallbackCalls, 0);
    assert.deepEqual(view(coordinator), beforeReplay);
  }
  const result = {pid: process.pid, row, restored, workflow: view(coordinator),
    replay: {attempted: restored && beforeReplay.sendingMarked, replayCallbackCalls},
    volatileProgressRecords: createOperationProgressStore().listOperationProgressRecords().length};
  db.close();
  return result;
}
async function interrupt(kind, file) {
  return new Promise((resolve, reject) => {
    const child = fork(self, ['--worker', kind, file],
      {stdio: ['ignore', 'pipe', 'pipe', 'ipc']});
    let cut = null; let stdout = ''; let stderr = ''; let problem = null;
    child.stdout.on('data', (bytes) => { stdout += bytes; });
    child.stderr.on('data', (bytes) => { stderr += bytes; });
    child.on('error', (error) => { problem = error; });
    const deadline = setTimeout(() => {
      problem = new Error(`child failed to reach or exit named cut: ${kind}`);
      child.kill('SIGKILL');
    }, WAIT_MS);
    child.on('message', (message) => {
      if (cut !== null) { problem = new Error('duplicate cut'); child.kill('SIGKILL'); return; }
      cut = message;
      if (kind !== 'acknowledged') child.kill('SIGKILL');
    });
    child.on('close', (code, signal) => {
      clearTimeout(deadline);
      if (problem || cut === null) { reject(problem || new Error(`child failed before cut: ${stderr}`)); return; }
      try {
        if (kind === 'acknowledged') assert.equal(code, 0);
        else assert.equal(signal, 'SIGKILL');
        resolve({writerPid: child.pid, cut, exit: {code, signal}, stdout, stderr});
      } catch (error) { reject(error); }
    });
  });
}
function freshReader(file) {
  const child = spawnSync(process.execPath, [self, '--read', file],
    {encoding: 'utf8', timeout: WAIT_MS});
  assert.equal(child.status, 0, child.stderr || String(child.error));
  return {result: JSON.parse(child.stdout), stderr: child.stderr};
}
async function main(output, label) {
  assert.ok(output && /^[a-f0-9]{40}$/u.test(label || ''), 'output and source label SHA required');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'c0-workflow-crash-'));
  const report = {schema: 'c0-workflow-process-crash/1', sourceLabel: label,
    sourceLabelIsCheckoutProof: false, nodeVersion: process.version,
    measurementStatus: 'not_measured', sourceChanges: false,
    proofCeiling: 'real coordinator, transition callback and row-recovery loader; real SQLite fixture and SIGKILL; NOT production repository/Raft/CREATE/cleanup/lease or power-loss proof',
    substitutions: ['node:sqlite fixture instead of production better-sqlite3 and ReplicaOperationRepository',
      'fixture manually invokes the measured mirror/persist/mark order; production orchestration is NOT executed',
      'fixed row and clock; memberships are opaque retained data, not live quorum observations'],
    sourceDigests: Object.fromEntries(FILES.map((file) => [file,
      createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')])),
    cases: []};
  try {
    for (const kind of CASES) {
      const file = path.join(temp, `${kind}.sqlite`);
      seed(file);
      const interrupted = await interrupt(kind, file);
      const restarted = freshReader(file);
      const wasCommitted = ['acknowledged', 'commit-before-local-mark',
        'after-local-mark', 'different-durable-winner'].includes(kind);
      const expectation = wasCommitted ? WORKFLOW_STEP.SENDING : WORKFLOW_STEP.PENDING;
      assert.equal(interrupted.cut.beforePersistence.step, WORKFLOW_STEP.SENDING);
      assert.equal(interrupted.cut.beforePersistence.sendingMarked, false);
      assert.equal(interrupted.cut.durableBefore.operation.workflowStep, WORKFLOW_STEP.PENDING);
      if (['cas-refused', 'different-durable-winner'].includes(kind)) assert.equal(interrupted.cut.rowsChanged, 0);
      if (kind === 'write-unavailable') assert.ok(interrupted.cut.sqlError);
      // Assert the named cut actually engaged, not just its eventual row state.
      assert.notEqual(interrupted.writerPid, restarted.result.pid);
      assert.equal(interrupted.cut.persistCallbackCalls, 1);
      assert.equal(interrupted.cut.sqlAtCut.inTransaction,
        kind === 'inside-transaction', 'named transaction cut must be real');
      const expectedChanges = ['before-commit', 'write-unavailable'].includes(kind) ?
        null : ['cas-refused', 'different-durable-winner'].includes(kind) ? 0 : 1;
      assert.equal(interrupted.cut.rowsChanged, expectedChanges,
        'selected cut must observe the expected SQL write');
      assert.equal(interrupted.cut.atCut.sendingMarked,
        ['after-local-mark', 'acknowledged'].includes(kind),
        'local committed marker must match the selected cut');
      const writerSeesPending = ['before-commit', 'cas-refused', 'write-unavailable']
        .includes(kind);
      assert.equal(interrupted.cut.sqlAtCut.row.operation.workflowStep,
        writerSeesPending ? WORKFLOW_STEP.PENDING : WORKFLOW_STEP.SENDING);
      if (kind === 'write-unavailable') {
        assert.equal(interrupted.cut.sqlError?.sqliteCode, 8,
          'the refusal control must be SQLITE_READONLY, not an arbitrary error');
      } else {
        assert.equal(interrupted.cut.sqlError, null);
      }
      assert.equal(restarted.result.workflow.step, expectation);
      assert.equal(restarted.result.workflow.sendingMarked, wasCommitted);
      assert.equal(restarted.result.row.operation.messageGroupMembershipObligationState, 'fixture-unresolved');
      assert.equal(restarted.result.volatileProgressRecords, 0);
      report.cases.push({kind, passed: true, interrupted, restarted});
    }
    const terminal = path.join(temp, 'terminal.sqlite');
    seed(terminal, true);
    const answer = freshReader(terminal);
    assert.equal(answer.result.restored, false);
    assert.equal(answer.result.workflow.step, null);
    assert.equal(answer.result.row.operation.messageGroupMembershipObligationState, 'fixture-unresolved');
    report.cases.push({kind: 'terminal-row-loader', passed: true, restarted: answer,
      limit: 'ensureOperationWorkflow fallback and downstream terminal guards are not executed'});
    report.measurementStatus = 'measured';
  } catch (error) {
    report.measurementStatus = 'failed';
    report.error = {name: error.name, message: error.message, stack: error.stack};
    process.exitCode = 1;
  } finally {
    // Only fixture files minted by this harness; never repository/lab data.
    fs.rmSync(temp, {recursive: true, force: true});
    fs.mkdirSync(path.dirname(path.resolve(output)), {recursive: true});
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({measurementStatus: report.measurementStatus,
      cases: report.cases.map(({kind, passed}) => ({kind, passed})),
      proofCeiling: report.proofCeiling, error: report.error}, null, 2));
  }
}
if (process.argv[2] === '--worker') await worker(process.argv[3], process.argv[4]);
else if (process.argv[2] === '--read') console.log(JSON.stringify(await recovered(process.argv[3])));
else await main(process.argv[2], process.argv[3]);
