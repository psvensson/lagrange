#!/usr/bin/env node
// C0 diagnostic only. Real owner/repository/schema/SQLite; test gateway replaces
// distributed SQL/Raft. SIGKILL proves process loss, NOT power-loss durability.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import Database from 'better-sqlite3';
import {refuseUnderProbe} from '../../src/test-helpers/probe-guard.js';
import {UNIFIED_SERVICE_TYPE, WORKFLOW_STEP} from '../../src/constants/index.js';
import {REPLICA_OPERATIONS_SCHEMA, STORAGE_RESERVATIONS_SCHEMA} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {generateCreateTableSQL, generateCreateIndexSQL} from
  '../../src/bootstrap/system-table-schema-sql.js';
import {OperationType, ReplicaStatus, WORKFLOW_STEP_TO_STATUS} from '../../src/rebalancer/replica-status.js';
import {TEST_OPERATION_ID, TEST_TARGET_NODE_ID, createCoordinatorWithStorage,
  createDeterministicTimerQueue, initializeConfig} from
  '../../test/rebalancer/reservation-dispatch-gate-test-harness.js';

refuseUnderProbe('cutover workflow process-loss diagnostic');
const script = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(script), '../..');
const [mode, arg, caseName] = process.argv.slice(2);
const targetStep = (name) => name === 'terminal_committed' ?
  WORKFLOW_STEP.FAILED : WORKFLOW_STEP.SENDING;
const targetStatus = (name) => name === 'terminal_committed' ?
  ReplicaStatus.FAILED : WORKFLOW_STEP_TO_STATUS[WORKFLOW_STEP.SENDING];

async function worker(dbPath, scenario) {
  initializeConfig();
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  for (const schema of [REPLICA_OPERATIONS_SCHEMA, STORAGE_RESERVATIONS_SCHEMA]) {
    db.exec(generateCreateTableSQL(schema));
    for (const sql of generateCreateIndexSQL(schema)) db.exec(sql);
  }
  let coordinator;
  let armed = false;
  let mutationAttempts = 0;
  let mutationChanges = 0;
  const row = () => db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?')
    .get(TEST_OPERATION_ID) || null;
  const observations = () => ({
    pid: process.pid,
    row: row(),
    reservationRows: db.prepare('SELECT * FROM storage_reservations').all(),
    inTransaction: db.inTransaction,
    mirrorStep: coordinator?.operationWorkflowCoordinator
      .getWorkflowById(TEST_OPERATION_ID)?.step ?? null,
    committedMark: coordinator?.operationWorkflowCoordinator
      .isTransitionIdempotent(TEST_OPERATION_ID, targetStep(scenario)) ?? false,
    mutationAttempts, mutationChanges,
  });
  const pause = async (point) => {
    process.send({kind: 'cut', point, observation: observations()});
    await new Promise(() => {});
  };
  const engine = {
    reservations: {get size() {
      return db.prepare('SELECT COUNT(*) FROM storage_reservations').pluck().get();
    }},
    async executeQuery(sql, params = []) {
      const isStepWrite = armed && /^UPDATE\s+replica_operations\s+SET/iu.test(sql) &&
        /workflow_step\s*=/iu.test(sql);
      if (isStepWrite) {
        mutationAttempts++;
        if (scenario === 'before_sql') await pause('before_sql');
        if (scenario === 'readonly_refusal') db.pragma('query_only = ON');
        if (scenario === 'uncommitted_sql') db.exec('BEGIN IMMEDIATE');
      }
      try {
        const statement = db.prepare(sql);
        if (statement.reader) return {success: true, rows: statement.all(...params)};
        const result = statement.run(...params);
        if (isStepWrite) {
          mutationChanges += result.changes;
          if (scenario === 'uncommitted_sql') await pause('uncommitted_sql');
          if (scenario === 'committed_answer_lost' || scenario === 'terminal_committed') {
            await pause('committed_answer_lost');
          }
        }
        return {success: true, affectedRows: result.changes,
          changes: result.changes, lastInsertRowid: Number(result.lastInsertRowid)};
      } catch (error) {
        return {success: false, error: error.message, errorCode: error.code};
      }
    },
  };
  const timers = createDeterministicTimerQueue();
  coordinator = createCoordinatorWithStorage({sqlQueryEngine: engine,
    setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn}).coordinator;
  const physicalCalls = [];
  coordinator.workflowOwner.executeOperationInternal = async () => {
    physicalCalls.push('executeOperationInternal');
    throw new Error('physical execution is outside this diagnostic');
  };
  coordinator.messageRouter.deliver = async () => {
    physicalCalls.push('deliver');
    throw new Error('network delivery is outside this diagnostic');
  };
  try {
    if (scenario.startsWith('inspect:')) {
      const previousCase = scenario.slice('inspect:'.length);
      const operation = await coordinator.repository.queryAuthoritativeOperationById(TEST_OPERATION_ID);
      assert.ok(operation, 'reopen must read the existing row through the real repository');
      const terminal = coordinator.repository.isOperationTerminal(operation);
      if (!terminal) coordinator.workflowOwner.ensureOperationWorkflow(operation);
      const beforeRetry = {
        row: row(), terminal,
        mirrorStep: coordinator.operationWorkflowCoordinator
          .getWorkflowById(TEST_OPERATION_ID)?.step ?? null,
        nextMarkedCommitted: coordinator.operationWorkflowCoordinator
          .isTransitionIdempotent(TEST_OPERATION_ID, targetStep(previousCase)),
        progressRecords: coordinator.workflowOwner.operationProgressStore
          .listOperationProgressRecords().length,
      };
      let replay = null;
      if (!terminal) replay = await transition(operation, previousCase);
      process.send({kind: 'result', beforeRetry, afterRetry: row(), replay,
        pid: process.pid, physicalCalls, reservationRows: observations().reservationRows});
      return;
    }
    await coordinator.createOperation({
      type: OperationType.ADD, operationIntentId: TEST_OPERATION_ID,
      replicaIntentId: 'sys-postgres-wire-r1',
      partitionId: 'sys-postgres-wire', nodeId: TEST_TARGET_NODE_ID,
      entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE, entityId: 'sys-postgres-wire',
      emitOperationCreated: false,
    });
    const operation = await coordinator.repository.queryAuthoritativeOperationById(TEST_OPERATION_ID);
    assert.equal(operation?.workflowStep, WORKFLOW_STEP.PENDING);
    assert.equal(physicalCalls.length, 0);
    armed = true;
    try {
      const result = await transition(operation, scenario);
      if (scenario === 'readonly_refusal') {
        assert.equal(result?.committed, false, 'read-only failure must not be committed');
        await pause('readonly_refusal');
      }
      if (scenario === 'after_mark') await pause('after_mark');
      throw new Error(`scenario did not reach its selected cut: ${scenario}`);
    } catch (error) {
      if (scenario !== 'readonly_refusal') throw error;
      assert.equal(coordinator.operationWorkflowCoordinator
        .isTransitionIdempotent(TEST_OPERATION_ID, targetStep(scenario)), false);
      process.send({kind: 'refusal', error: error.message});
      await pause('readonly_refusal');
    }
  } finally {
    armed = false;
    await coordinator.shutdown();
    db.close();
    process.disconnect?.();
  }

  async function transition(operation, name) {
    const step = targetStep(name);
    const terminal = name === 'terminal_committed';
    const now = Date.now();
    const projected = {...operation, workflowStep: step, status: targetStatus(name),
      updatedAt: now, completedAt: terminal ? now : null,
      stepsHistory: [...operation.stepsHistory, {step, previousStep: operation.workflowStep,
        reason: 'c0_process_loss', timestamp: now}]};
    return coordinator.workflowOwner.executeAtomicTransition(operation, step,
      'c0_process_loss', () => coordinator.repository.persistOperationUpdate(projected, {
        confirmPersistence: false, disableSystemWriteSession: true,
        returnDisposition: true, expectedWorkflowStep: WORKFLOW_STEP.PENDING,
        terminalTransition: terminal,
      }));
  }
}

function childRun(dbPath, scenario, killAtCut) {
  return new Promise((resolve, reject) => {
    const child = fork(script, ['worker', dbPath, scenario], {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    const record = {scenario, pid: child.pid, messages: [], stdout: '', stderr: ''};
    const deadline = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`child did not complete the named boundary: ${scenario}`));
    }, 30000);
    for (const stream of ['stdout', 'stderr']) child[stream].on('data', (chunk) => {
      record[stream] += chunk.toString();
      if (record[stream].length > 1000000) child.kill('SIGKILL');
    });
    child.on('message', (message) => {
      record.messages.push(message);
      if (killAtCut && message.kind === 'cut') child.kill('SIGKILL');
    });
    child.on('error', (error) => {clearTimeout(deadline); reject(error);});
    child.on('exit', (code, signal) => {
      clearTimeout(deadline);
      record.exitCode = code; record.signal = signal;
      resolve(record);
    });
  });
}

if (mode === 'worker') {
  worker(arg, caseName).catch((error) => {
    console.error(error.stack); process.exitCode = 2; process.disconnect?.();
  });
} else {
  assert.ok(mode && /^[a-f0-9]{40}$/u.test(arg || ''), 'output path and source SHA required');
  const output = path.resolve(mode);
  fs.mkdirSync(path.dirname(output), {recursive: true});
  const scratch = fs.mkdtempSync(path.join(path.dirname(output), 'process-cuts-'));
  const report = {schema: 'cutover-workflow-process-loss/1', sourceSha: arg,
    measurementStatus: 'not_measured', cases: [],
    proofCeiling: 'real operation owner/repository/schema and file-backed SQLite across SIGKILL; test gateway replaces SQL/Raft transport; no cluster, power loss or FreshMG membership proof',
    substitutions: ['existing reservation-dispatch harness readiness/cache/transport doubles',
      'canonical repository SQL executes directly against file-backed SQLite',
      'IPC cut at selected SQL/owner boundary; parent kills only its own child',
      'terminal row classified before live-workflow recovery'],
    runtimeSourceChanged: false, independentReview: false, distributedAcceptance: false};
  try {
    for (const name of ['before_sql', 'uncommitted_sql', 'committed_answer_lost',
      'after_mark', 'readonly_refusal', 'terminal_committed']) {
      const dbPath = path.join(scratch, `${name}.sqlite`);
      const before = await childRun(dbPath, name, true);
      const entry = {name, before}; report.cases.push(entry);
      const cut = before.messages.find((m) => m.kind === 'cut');
      assert.ok(cut, `child must reach the intended cut: ${JSON.stringify(before)}`);
      assert.equal(before.signal, 'SIGKILL');
      const after = await childRun(dbPath, `inspect:${name}`, false);
      entry.after = after;
      assert.equal(after.exitCode, 0, JSON.stringify(after));
      const result = after.messages.find((m) => m.kind === 'result');
      assert.ok(result); assert.notEqual(result.pid, cut.observation.pid);
      assert.equal(result.physicalCalls.length, 0);
      const committed = ['committed_answer_lost', 'after_mark', 'terminal_committed'].includes(name);
      assert.equal(result.beforeRetry.row.workflow_step, committed ? targetStep(name) : WORKFLOW_STEP.PENDING);
      assert.equal(result.beforeRetry.progressRecords, 0, 'fresh process has no volatile progress');
      if (name !== 'terminal_committed') {
        assert.equal(result.beforeRetry.nextMarkedCommitted, committed);
        assert.equal(result.afterRetry.workflow_step, WORKFLOW_STEP.SENDING);
        assert.equal(result.replay.committed, !committed);
      } else {
        assert.equal(result.beforeRetry.terminal, true);
        assert.equal(result.beforeRetry.mirrorStep, null);
      }
      assert.equal(result.reservationRows.length, 1);
      assert.equal(result.reservationRows[0].reservation_id,
        cut.observation.reservationRows[0].reservation_id);
      entry.passed = true;
    }
    report.measurementStatus = 'measured';
  } catch (error) {
    report.measurementStatus = 'failed';
    report.error = {name: error.name, message: error.message, stack: error.stack};
    process.exitCode = 1;
  } finally {
    report.sourceDigests = Object.fromEntries([
      'src/rebalancer/operation-workflow-transition-orchestration.js',
      'src/rebalancer/operation-workflow-owner-execution-lane.js',
      'src/rebalancer/replica-operation-repository-mutation-update-methods.js',
      'src/rebalancer/operation-workflow-persistence.js',
      'src/workflow/durable-workflow-coordinator.js',
      'test/rebalancer/reservation-dispatch-gate-test-harness.js',
    ].map((file) => [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]));
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  }
}
