#!/usr/bin/env node
// Read-only first-divergence harness; never a Solver probe or certification.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {refuseUnderProbe} from '../../src/test-helpers/probe-guard.js';
import * as C from '../../src/rebalancer/operation-workflow-owner-constants.js';
import {createOperationWorkflowOwnerAdapter} from
  '../../src/rebalancer/operation-workflow-owner-adapter.js';
import {createOperationProgressStore} from
  '../../src/rebalancer/operation-progress-store.js';
import {persistOperationWorkflowTransitionToDurableRow} from
  '../../src/rebalancer/operation-workflow-persistence.js';

refuseUnderProbe('the cutover transition-authority baseline harness');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = process.argv[2];
const sourceSha = process.argv[3];
assert.ok(output && /^[a-f0-9]{40}$/u.test(sourceSha || ''),
  'usage: node <harness> <output.json> <verified checkout sha>');
const operation = Object.freeze({operationId: 'cutover-authority-witness'});
const revision = 'cutover-boundary-revision';
const evidence = Object.freeze({
  owner: C.OPERATION_WORKFLOW_OWNER,
  boundary: C.OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
  operationKey: operation.operationId,
  correlationKey: operation.operationId,
  sourceRevision: revision,
  durableOperation: {
    recordState: C.OPERATION_WORKFLOW_DURABLE_OPERATION_STATE.AVAILABLE,
    operationKey: operation.operationId,
    terminalState: C.OPERATION_WORKFLOW_TERMINAL_STATE.NON_TERMINAL,
    dispatchState: C.OPERATION_WORKFLOW_DISPATCH_STATE.NOT_OBSERVED,
    sourceRevision: revision,
  },
  workflowHistory: {
    freshnessState: C.OPERATION_WORKFLOW_HISTORY_FRESHNESS_STATE.CURRENT,
    terminalState: C.OPERATION_WORKFLOW_TERMINAL_STATE.NON_TERMINAL,
    transitionState: C.OPERATION_WORKFLOW_TRANSITION_STATE.BLOCKED,
    commandState: C.OPERATION_WORKFLOW_COMMAND_STATE.IDLE,
    sourceRevision: revision,
  },
  ownerLease: {
    authorityState: C.OPERATION_WORKFLOW_OWNER_AUTHORITY_STATE.LOCAL_AUTHORITATIVE,
    freshnessState: C.OPERATION_WORKFLOW_LEASE_FRESHNESS_STATE.CURRENT,
    ownerNodeKey: 'cutover-witness-owner',
    leaseTerm: 9,
  },
  serialDependency: {
    dependencyState: C.OPERATION_WORKFLOW_SERIAL_DEPENDENCY_STATE.CLEAR,
    priorOperationKey: C.OPERATION_WORKFLOW_IDENTIFIER_VARIANTS
      .PRIOR_OPERATION_KEY_UNAVAILABLE,
    sourceRevision: revision,
  },
  timeoutBudget: {
    timeoutState: C.OPERATION_WORKFLOW_TIMEOUT_STATE.ACTIVE,
    staleProgressState: C.OPERATION_WORKFLOW_STALE_PROGRESS_STATE.NOT_OBSERVED,
    sourceRevision: revision,
  },
  publicationFence: {
    fenceState: C.OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE.CURRENT,
    requiredRevision: revision,
    observedRevision: revision,
    sourceRevision: revision,
  },
  dispatchObservation: {
    dispatchState: C.OPERATION_WORKFLOW_DISPATCH_STATE.NOT_OBSERVED,
    wakeState: C.OPERATION_WORKFLOW_WAKE_STATE.OBSERVED,
    commandState: C.OPERATION_WORKFLOW_COMMAND_STATE.IDLE,
    sourceRevision: revision,
  },
});

function harness() {
  const store = createOperationProgressStore();
  const calls = [];
  const writes = [];
  const ports = {
    readDurableOperation: async () => operation,
    loadOperationProgress: (op, context) =>
      store.loadOperationProgress(op, context),
    persistOperationProgress: (write) => {
      const result = store.compareAndSwapOperationProgress(write);
      writes.push(result);
      return result;
    },
    appendOperationProgressEvent: (event) => store.appendEvent(event),
  };
  for (const method of ['dispatchLocalOwner', 'wakeRemoteOwner',
    'advanceExistingOperation', 'reconcileStaleProgress',
    'retainPublicationForRetry', 'markActiveGateVisible',
    'recordTerminalSuccess', 'recordTerminalFailure', 'waitForOwnerProgress']) {
    ports[method] = () => {
      calls.push(method);
      return method !== 'waitForOwnerProgress';
    };
  }
  return {adapter: createOperationWorkflowOwnerAdapter({ports}),
    store, writes, calls};
}

const normal = harness();
await normal.adapter.run(operation, {evidence});
assert.deepEqual(normal.calls, ['dispatchLocalOwner'],
  'positive control must engage the actual local-dispatch adapter branch');
assert.equal(normal.writes[0].applied, true);

// No timers, sleeps, fabricated CAS result or altered production code.
// Both calls enter the real async adapter; its actual store resolves the race.
// This deliberately excludes the enclosing production owner-key lane.
const concurrent = harness();
await Promise.all([
  concurrent.adapter.run(operation, {evidence}),
  concurrent.adapter.run(operation, {evidence}),
]);
const winners = concurrent.writes.filter((write) => write.applied === true);
const losers = concurrent.writes.filter((write) => write.applied === false);
assert.equal(winners.length, 1, 'real store winner must engage');
assert.equal(losers.length, 1, 'real store version conflict must engage');

const basis = [{step: 'sending', previousStep: 'pending', timestamp: 1}];
const baseWorkflow = {
  workflowId: operation.operationId,
  durableBasisStepCount: basis.length,
  durableOperation: {operationId: operation.operationId, stepsHistory: basis},
};
let noAppendRefused = false;
try {
  await persistOperationWorkflowTransitionToDurableRow({
    ...baseWorkflow,
    transitionHistory: [{nextStep: 'sending', previousStep: 'pending', timestamp: 1}],
  });
} catch (error) {
  assert.match(error.message, /does not extend/u);
  noAppendRefused = true;
}
assert.equal(noAppendRefused, true, 'non-extension refusal control must engage');
let conflictingPrefixAccepted = false;
try {
  await persistOperationWorkflowTransitionToDurableRow({
    ...baseWorkflow,
    transitionHistory: [
      {nextStep: 'removed', previousStep: 'forged', timestamp: 1},
      {nextStep: 'creating', previousStep: 'sending', timestamp: 2},
    ],
  });
  conflictingPrefixAccepted = true;
} catch (error) {
  assert.ok(error instanceof Error);
}

const files = [
  'src/rebalancer/operation-workflow-owner-adapter.js',
  'src/rebalancer/operation-progress-store.js',
  'src/rebalancer/operation-workflow-persistence.js',
  'src/rebalancer/operation-workflow-transition-orchestration.js',
  'src/rebalancer/rebalance-coordinator-lifecycle.js',
];
const sourceDigests = Object.fromEntries(files.map((file) => [file,
  createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex'),
]));
const report = {
  schema: 'cutover-authority-boundary-baseline/1',
  sourceSha,
  sourceDigests,
  measurementStatus: 'measured',
  proofCeiling: 'direct adapter/store and persistence callback only',
  productionRaceProven: false,
  sourceChanges: false,
  positiveControl: {dispatchCalls: normal.calls.length,
    progressWriteApplied: normal.writes[0].applied, noAppendRefused},
  conflictWitness: {acceptedProgressWrites: winners.length,
    rejectedProgressWrites: losers.length,
    dispatchCalls: concurrent.calls.filter((name) =>
      name === 'dispatchLocalOwner').length,
    appendedEvents: concurrent.store.listOperationProgressEvents().length,
    effectAfterLosingCas: concurrent.calls.length > winners.length,
    nextOwner: 'OperationWorkflowOwner serialization and adapter interaction'},
  historyWitness: {conflictingPrefixAccepted,
    nextOwner: 'DurableWorkflowCoordinator/repository transition boundary'},
  interpretation: [
    'Volatile progress acceptance is not durable operation permission.',
    'Trace enclosing serialization and downstream guards before claiming a production race.',
    'The callback is not itself the SQL write; trace actual repository commit and restart.',
  ],
};
fs.mkdirSync(path.dirname(path.resolve(output)), {recursive: true});
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.conflictWitness.effectAfterLosingCas ||
  conflictingPrefixAccepted ? 1 : 0;
