#!/usr/bin/env node
// C0 read-only evidence: real owner/repository policies/ports/lane/store; explicit I/O doubles.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {EventEmitter} from 'node:events';
import {refuseUnderProbe} from '../../src/test-helpers/probe-guard.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {OperationWorkflowOwner} from '../../src/rebalancer/operation-workflow-owner.js';
import {ReplicaOperationRepository} from '../../src/rebalancer/replica-operation-repository.js';
import {createOperationProgressStore} from '../../src/rebalancer/operation-progress-store.js';
import {DurableWorkflowCoordinator} from '../../src/workflow/durable-workflow-coordinator.js';
import {OperationLane} from '../../src/workflow/operation-lane.js';
import {persistOperationWorkflowTransitionToDurableRow} from '../../src/rebalancer/operation-workflow-persistence.js';
import {resolveOperationWorkflowPublicationFenceState} from '../../src/rebalancer/operation-workflow-port-freshness.js';
import {OperationType, ReplicaStatus, createOperation} from '../../src/rebalancer/replica-status.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import * as P from '../../src/control-plane/priority-recovery-diagnostics-constants.js';
import {OPERATION_PROGRESS_EVENT_TYPE} from '../../src/rebalancer/operation-progress-events.js';
import {OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES, OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE} from '../../src/rebalancer/operation-workflow-owner-constants.js';

refuseUnderProbe('cutover owner-entry baseline harness');
const [output, sourceSha] = process.argv.slice(2);
assert.ok(output && /^[a-f0-9]{40}$/u.test(sourceSha || ''), 'output path and exact checkout SHA required');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const report = {
  schema: 'cutover-owner-entry-baseline/1', sourceSha,
  measurementStatus: 'not_measured', runtimeSourceChanged: false,
  independentReview: false, distributedAcceptance: false,
  proofCeiling: 'real owner entries, repository policies and decision/effect ports with supplied repository rows; no actual SQL, Raft, physical CREATE or cluster',
  substitutions: ['repository query I/O supplies fixed read-only rows; all repository policy methods are real', 'transport/physical-effect tripwires', 'two-party promise barrier after actual progress load at an existing awaited port'],
  cases: {},
};
const sourcePaths = [
  'src/rebalancer/operation-workflow-owner.js',
  'src/rebalancer/operation-workflow-owner-ports.js',
  'src/rebalancer/operation-workflow-owner-adapter.js',
  'src/rebalancer/operation-workflow-recovery-reconcile.js',
  'src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js',
  'src/rebalancer/operation-workflow-owner-retry-registry.js',
  'src/rebalancer/replica-operation-repository.js',
  'src/rebalancer/replica-operation-repository-row-methods.js',
  'src/rebalancer/operation-progress-store.js',
  'src/rebalancer/operation-lifecycle-event-resolution.js',
  'src/rebalancer/operation-lifecycle.js',
  'src/rebalancer/operation-workflow-persistence.js',
  'src/rebalancer/operation-workflow-port-freshness.js',
  'src/workflow/operation-lane.js',
  'src/workflow/durable-workflow-coordinator.js',
];
report.sourceDigests = Object.fromEntries(sourcePaths.map(file => [file,
  createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]));
function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return {promise, resolve};
}
const fixtures = [];
function fixture(label, barrier = false) {
  const now = Date.now();
  const operation = createOperation({operationId: `c0-${label}`, type: OperationType.REPLACE,
    partitionId: 'replica_operations-p1', replicaId: `replica_operations-p1-${label}`,
    sourceNodeId: 'c0-source-owner', targetNodeId: 'c0-target'});
  Object.assign(operation, {workflowStep: WORKFLOW_STEP.PENDING, status: ReplicaStatus.PENDING,
    createdAt: now, updatedAt: now, leaseExpiresAt: now + 300000,
    completedAt: null, stepsHistory: [], entityType: 'partition', entityId: 'replica_operations-p1'});
  const stored = structuredClone(operation);
  const store = createOperationProgressStore();
  const calls = {writes: [], loads: [], runs: [], results: [], errors: [], physical: []};
  const logger = {debug() {}, info() {}, warn() {}, error(...args) { calls.errors.push(args); }};
  const first = deferred(), second = deferred(), release = deferred();
  const instrumentedStore = {
    ...store,
    loadOperationProgress(op, ctx) {
      const value = store.loadOperationProgress(op, ctx);
      calls.loads.push(value);
      if (calls.loads.length === 1) first.resolve();
      if (calls.loads.length === 2) second.resolve();
      return barrier ? release.promise.then(() => value) : value;
    },
    compareAndSwapOperationProgress(write) {
      const result = store.compareAndSwapOperationProgress(write);
      calls.writes.push(result);
      return result;
    },
  };
  const coordinator = new DurableWorkflowCoordinator({
    persistWorkflow: persistOperationWorkflowTransitionToDurableRow,
    isTerminalWorkflow: workflow => workflow.terminal === true,
  });
  const lane = new OperationLane({workflowCoordinator: coordinator});
  // Real phase/owner/terminal policies, not a hand-built substitute for them.
  const repository = new ReplicaOperationRepository({nodeId: 'c0-observer', logger});
  repository.queryAuthoritativeOperationById = async () => structuredClone(stored);
  repository.queryOperationById = async () => structuredClone(stored);
  const owner = new OperationWorkflowOwner({
    repository, operationLane: lane, operationWorkflowCoordinator: coordinator,
    operationProgressStore: instrumentedStore, nodeId: 'c0-observer',
    logger, emitter: new EventEmitter(), config: {pendingTimeoutMs: 300000}, stats: {},
    isShuttingDown: () => false, isInitialized: () => true,
    getActualReplicaStatus: async () => { calls.physical.push('replica-status'); throw new Error('unexpected physical observation'); },
    messageRouter: {deliver: async () => { calls.physical.push('transport'); throw new Error('unexpected transport effect'); }},
    setTimeoutFn: (fn, delayMs) => ({fn, delayMs}), clearTimeoutFn() {},
  });
  // Observe the real promises without replacing results or decision/effect ports.
  const run = owner.runOperationWorkflowOwnerAdapter.bind(owner);
  owner.runOperationWorkflowOwnerAdapter = (...args) => {
    const promise = run(...args).then(result => { calls.results.push(result); return result; });
    calls.runs.push(promise);
    return promise;
  };
  assert.equal(owner.recordOperationDispatchDeferredRetry(operation.operationId,
    {nextAttemptAt: now + 300000}, now), true);
  const snapshot = {
    operationId: operation.operationId,
    coordinator: {operation},
    actuation: {owner: P.PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      state: P.PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
      workflowProgressPhaseId: P.PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING},
    progress: {currentOwner: P.PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      nextRequiredAction: P.PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      blockingBoundary: P.PRIORITY_RECOVERY_BLOCKING_BOUNDARY.REBALANCER_HANDOFF,
      waitMode: P.PRIORITY_RECOVERY_WAIT_MODE.RETRY_SCHEDULED,
      workflowProgressPhaseId: P.PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING},
  };
  const f = {owner, repository, operation, snapshot, coordinator, store, ...calls, first, second, release,
    evidence: () => owner.buildPriorityRecoveryDispatchPendingReentryEvidence(snapshot, operation),
    schedule: () => owner.schedulePriorityRecoveryDispatchPendingReentry(snapshot, [operation]),
    summary: () => ({
      canonicalOwnerNodeId: repository.resolveOperationOwnerNodeId(operation),
      loads: calls.loads.map(v => v.version), writes: calls.writes.map(v => ({applied: v.applied, state: v.state})),
      eventTypes: store.listOperationProgressEvents().map(v => v.type),
      effectCommands: calls.results.flatMap(v => v.commands.map(c => c.effectCommand)),
      physicalCalls: calls.physical, errors: calls.errors,
    }),
  };
  fixtures.push(f);
  return f;
}
try {
  ConfigurationManager.resetInstance();
  ConfigurationManager.getInstance().initialize({rebalancer: {minimumReplicaBytes: 10, partitionReplicaOverheadBytes: 5}});
  const single = fixture('single');
  assert.equal(single.evidence().remoteRetryActive, true, 'real deferred retry owner must engage');
  assert.equal(single.owner.resolvePriorityRecoveryDispatchPendingReentryAction(single.snapshot, single.operation),
    'record_remote_retry_progress');
  single.schedule();
  assert.equal(single.runs.length, 1);
  await Promise.all(single.runs);
  assert.equal(single.writes[0].applied, true);
  assert.deepEqual(single.store.listOperationProgressEvents().map(e => e.type), [OPERATION_PROGRESS_EVENT_TYPE.RETRY_REQUESTED]);
  assert.deepEqual(single.results.flatMap(r => r.commands.map(c => c.effectCommand)),
    [OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.NO_OPERATION_EFFECT]);
  assert.equal(single.physical.length, 0);
  report.cases.singleRemoteRetry = single.summary();

  const held = fixture('held');
  const heldGate = deferred();
  const heldRun = held.owner.operationWorkflowRunExclusive(
    held.owner.getOperationOwnerSingleFlightKey(held.operation.operationId), () => heldGate.promise);
  assert.equal(held.owner.isOperationOwnerLaneHeld(held.operation.operationId), true);
  assert.equal(held.owner.resolvePriorityRecoveryDispatchPendingReentryAction(held.snapshot, held.operation), 'skip');
  held.schedule();
  assert.equal(held.runs.length, 0);
  heldGate.resolve();
  await heldRun;
  report.cases.ownerLaneFirst = held.summary();

  const overlapping = fixture('overlap', true);
  overlapping.schedule();
  assert.equal(overlapping.runs.length, 1, 'scheduler entered the real remote-retry route');
  await overlapping.first.promise;
  assert.equal(overlapping.owner._remoteRetryProgressLocks.has(overlapping.operation.operationId), true);
  assert.equal(overlapping.owner.isOperationOwnerLaneHeld(overlapping.operation.operationId), false);
  const arm = overlapping.owner.armCoordinatorCreatedOperation(overlapping.operation);
  await overlapping.second.promise;
  assert.equal(overlapping.owner.isOperationOwnerLaneHeld(overlapping.operation.operationId), true);
  overlapping.release.resolve();
  await Promise.all([arm, ...overlapping.runs]);
  assert.equal(overlapping.writes.filter(w => w.applied).length, 1);
  assert.equal(overlapping.writes.filter(w => !w.applied).length, 1);
  assert.equal(overlapping.physical.length, 0);
  assert.ok(overlapping.results.every(r => r.commands.every(c =>
    c.effectCommand === OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.NO_OPERATION_EFFECT)),
  'actual remote-retry evidence must not be replaced with local-dispatch evidence');
  report.cases.remoteRetryFirst = overlapping.summary();

  // The earlier length-callback witness is not the complete history fence.
  const durable = {stepsHistory: [{step: WORKFLOW_STEP.SENDING}]};
  const good = {workflowId: 'history-control', durableBasisStepCount: 1,
    transitionHistory: [{nextStep: WORKFLOW_STEP.SENDING}, {nextStep: WORKFLOW_STEP.CREATING}]};
  const divergent = {...good, transitionHistory: [{nextStep: WORKFLOW_STEP.REMOVED}, {nextStep: WORKFLOW_STEP.CREATING}]};
  assert.equal(await persistOperationWorkflowTransitionToDurableRow(divergent), divergent);
  const goodFence = resolveOperationWorkflowPublicationFenceState(durable, good);
  const divergentFence = resolveOperationWorkflowPublicationFenceState(durable, divergent);
  assert.equal(goodFence, OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE.CURRENT);
  assert.equal(divergentFence, OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE.STALE);
  report.cases.historyFence = {lengthCallbackAcceptsDivergent: true, goodFence, divergentFence,
    proofCeiling: 'existing callback plus real downstream fence; not a disk-crash proof'};

  report.measurementStatus = 'measured';
  report.finding = 'Owner-entry overlap reproduces a volatile progress CAS conflict; active remote-retry evidence selects NO_OPERATION_EFFECT, not duplicate dispatch. The existing publication fence rejects a divergent history prefix.';
  report.classification = 'projection-concurrency-under-controlled-await; physical-safety-defect-not-proven';
  report.openQuestions = ['all real repository/lease/timer outcome changes around this interval',
    'whether duplicate local progress events affect any downstream permission',
    'full durable failure/restart behavior and independent review'];
} catch (error) {
  report.measurementStatus = 'harness_failed';
  report.error = {name: error.name, message: error.message, stack: error.stack};
  report.partialCases = fixtures.map(f => f.summary());
  process.exitCode = 2;
} finally {
  for (const f of fixtures) { f.release.resolve(); f.owner.shutdown(); f.repository.markShuttingDown(); }
  fs.mkdirSync(path.dirname(path.resolve(output)), {recursive: true});
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
