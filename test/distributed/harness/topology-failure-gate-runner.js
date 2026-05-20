import {
  assertInvariantGate,
  evaluateInvariants,
} from '../../../src/control-plane/invariant-engine.js';
import {
  OPERATION_LIFECYCLE_EVENT_TYPE,
  advanceOperationLifecycle,
  createInitialOperationProgress,
} from '../../../src/rebalancer/operation-lifecycle.js';
import {
  createOperationProgressStore,
} from '../../../src/rebalancer/operation-progress-store.js';
import {
  TOPOLOGY_FAILURE_GATE_ASSERTION,
  listTopologyFailureGateEntries,
} from './topology-failure-gate-matrix.js';
import {
  createDeterministicSimulator,
} from './deterministic-simulator.js';

const TOPOLOGY_FAILURE_GATE_RUNNER_NUM_ZERO = 0;
const TOPOLOGY_FAILURE_GATE_RUNNER_NUM_ONE = 1;
const TOPOLOGY_FAILURE_GATE_RUNNER_NUM_TWO = 2;
const TOPOLOGY_FAILURE_GATE_RUNNER_NUM_THREE = 3;
const TOPOLOGY_FAILURE_GATE_RUNNER_NUM_FOUR = 4;
const TOPOLOGY_FAILURE_GATE_RUNNER_NUM_FIVE = 5;
const TOPOLOGY_FAILURE_GATE_RUNNER_OWNER = 'operation_workflow_owner';
const TOPOLOGY_FAILURE_GATE_RUNNER_NODE = 'gate-runner-node';
const TOPOLOGY_FAILURE_GATE_RUNNER_EVENT_SOURCE = 'topology_failure_gate';
const TOPOLOGY_FAILURE_GATE_RUNNER_PUBLICATION_ID = 'gate-publication';
const TOPOLOGY_FAILURE_GATE_RUNNER_PUBLICATION_EPOCH = 'gate-publication-epoch';
const TOPOLOGY_FAILURE_GATE_RUNNER_FAILURE_STATE_NONE = 'none';
const TOPOLOGY_FAILURE_GATE_RUNNER_REPORT_VERSION =
  'topology_failure_gate_report_v1';

const TOPOLOGY_FAILURE_GATE_RUNNER_EVENT_SEQUENCE = Object.freeze([
  OPERATION_LIFECYCLE_EVENT_TYPE.DISPATCH_REQUESTED,
  OPERATION_LIFECYCLE_EVENT_TYPE.DISPATCH_ACCEPTED,
  OPERATION_LIFECYCLE_EVENT_TYPE.PUBLICATION_ACCEPTED,
  OPERATION_LIFECYCLE_EVENT_TYPE.ACTIVE_GATE_VISIBLE,
  OPERATION_LIFECYCLE_EVENT_TYPE.OPERATION_COMPLETE,
]);

function buildGateOperationId(entry) {
  return `${entry.gateId}-operation`;
}

function buildGateLifecycleEvent(entry, type, sequence) {
  return Object.freeze({
    eventId: `${entry.gateId}-${type}-${sequence}`,
    type,
    operationId: buildGateOperationId(entry),
    ownerId: TOPOLOGY_FAILURE_GATE_RUNNER_OWNER,
    sourceRevision: `${TOPOLOGY_FAILURE_GATE_RUNNER_EVENT_SOURCE}-${sequence}`,
    payload: Object.freeze({
      publicationId: TOPOLOGY_FAILURE_GATE_RUNNER_PUBLICATION_ID,
      publicationEpoch: TOPOLOGY_FAILURE_GATE_RUNNER_PUBLICATION_EPOCH,
    }),
    evidence: Object.freeze({
      operationKey: buildGateOperationId(entry),
      owner: TOPOLOGY_FAILURE_GATE_RUNNER_OWNER,
      sourceRevision:
        `${TOPOLOGY_FAILURE_GATE_RUNNER_EVENT_SOURCE}-${sequence}`,
    }),
  });
}

function runOperationProgressLifecycle(entry) {
  const store = createOperationProgressStore();
  let progress = createInitialOperationProgress({
    operationId: buildGateOperationId(entry),
    ownerId: TOPOLOGY_FAILURE_GATE_RUNNER_OWNER,
  });
  for (const [index, type] of
    TOPOLOGY_FAILURE_GATE_RUNNER_EVENT_SEQUENCE.entries()) {
    const event = buildGateLifecycleEvent(
      entry,
      type,
      index + TOPOLOGY_FAILURE_GATE_RUNNER_NUM_ONE,
    );
    const advanced = advanceOperationLifecycle(progress, event);
    const persisted = store.compareAndSwapOperationProgress({
      expectedVersion: progress.version,
      progress: advanced.operationProgress,
    });
    for (const emittedEvent of advanced.emittedEvents) {
      store.appendEvent(emittedEvent);
    }
    progress = persisted.progress;
  }
  return store;
}

function buildPublicationProgressRecords(entry) {
  const retainedRetry = entry.durableAssertions.includes(
    TOPOLOGY_FAILURE_GATE_ASSERTION.IV_PUB_1,
  );
  return Object.freeze([
    Object.freeze({
      publicationId:
        `${TOPOLOGY_FAILURE_GATE_RUNNER_PUBLICATION_ID}-${entry.gateId}`,
      publicationEpoch: TOPOLOGY_FAILURE_GATE_RUNNER_PUBLICATION_EPOCH,
      accepted: true,
      visibleAtActiveGate: retainedRetry !== true,
      retainedRetry,
      outcome: entry.expectedDurableOutcome,
    }),
  ]);
}

function buildSnapshotCoverageSamples(entry) {
  return Object.freeze([
    Object.freeze({
      sampleId: `${entry.gateId}-coverage-1`,
      sequence: TOPOLOGY_FAILURE_GATE_RUNNER_NUM_ONE,
      coverageNodeCount: TOPOLOGY_FAILURE_GATE_RUNNER_NUM_TWO,
      failureState: TOPOLOGY_FAILURE_GATE_RUNNER_FAILURE_STATE_NONE,
    }),
    Object.freeze({
      sampleId: `${entry.gateId}-coverage-2`,
      sequence: TOPOLOGY_FAILURE_GATE_RUNNER_NUM_TWO,
      coverageNodeCount: TOPOLOGY_FAILURE_GATE_RUNNER_NUM_FOUR,
      failureState: TOPOLOGY_FAILURE_GATE_RUNNER_FAILURE_STATE_NONE,
    }),
    Object.freeze({
      sampleId: `${entry.gateId}-coverage-3`,
      sequence: TOPOLOGY_FAILURE_GATE_RUNNER_NUM_THREE,
      coverageNodeCount: TOPOLOGY_FAILURE_GATE_RUNNER_NUM_FIVE,
      failureState: TOPOLOGY_FAILURE_GATE_RUNNER_FAILURE_STATE_NONE,
    }),
  ]);
}

function buildTopologyFailureGateInvariantState(entry, store) {
  return Object.freeze({
    operationProgressRecords: store.listOperationProgressRecords(),
    publicationProgressRecords: buildPublicationProgressRecords(entry),
    snapshotCoverageSamples: buildSnapshotCoverageSamples(entry),
  });
}

function runDeterministicGateScenario(entry) {
  const simulator = createDeterministicSimulator();
  simulator.registerNode(TOPOLOGY_FAILURE_GATE_RUNNER_NODE);
  simulator.schedule({
    to: TOPOLOGY_FAILURE_GATE_RUNNER_NODE,
    type: entry.scenario,
    delayMs: TOPOLOGY_FAILURE_GATE_RUNNER_NUM_ZERO,
    payload: {
      gateId: entry.gateId,
    },
  });
  simulator.runUntilIdle();
  return simulator.getEventLog();
}

async function runTopologyFailureGate(entry) {
  const store = runOperationProgressLifecycle(entry);
  const invariantState = buildTopologyFailureGateInvariantState(entry, store);
  const invariantResults = evaluateInvariants(invariantState);
  assertInvariantGate(invariantResults);
  return Object.freeze({
    reportVersion: TOPOLOGY_FAILURE_GATE_RUNNER_REPORT_VERSION,
    gateId: entry.gateId,
    scenario: entry.scenario,
    owner: entry.owner,
    boundary: entry.boundary,
    expectedDurableOutcome: entry.expectedDurableOutcome,
    durableAssertions: entry.durableAssertions,
    invariantResults,
    invariantState,
    eventLog: runDeterministicGateScenario(entry),
    passed: true,
  });
}

async function runTopologyFailureGateMatrix(options = {}) {
  const entries = listTopologyFailureGateEntries(options.configPathOrName);
  const results = await Promise.all(entries.map(runTopologyFailureGate));
  return Object.freeze({
    reportVersion: TOPOLOGY_FAILURE_GATE_RUNNER_REPORT_VERSION,
    gateCount: results.length,
    passedCount: results.filter((result) => result.passed).length,
    results: Object.freeze(results),
  });
}

export {
  buildTopologyFailureGateInvariantState,
  runTopologyFailureGate,
  runTopologyFailureGateMatrix,
};
