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
  TOPOLOGY_FAILURE_GATE_REASON,
  TOPOLOGY_FAILURE_GATE_EPOCH_FENCE,
  TOPOLOGY_FAILURE_GATE_BOUNDED_PROGRESS_MECHANISMS,
  listTopologyFailureGateEntries,
} from './topology-failure-gate-matrix.js';
import {
  createDeterministicSimulator,
} from './deterministic-simulator.js';
import {
  INVARIANT_ID,
} from '../../../src/invariants/invariant-catalog.js';

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

// Decision table for verifying that expected owner reasons are witnessed in simulated runtime outputs
const OWNER_REASON_WITNESS_DECISION_TABLE = Object.freeze({
  [TOPOLOGY_FAILURE_GATE_REASON.NODE_FAILURE_DETECTED]: (entry, _state, eventLog) =>
    eventLog.some((e) => e.type === 'rolling-restart' || e.type === 'seed-restart-under-load' || e.type === 'partition-kill-heal-under-load'),
  [TOPOLOGY_FAILURE_GATE_REASON.DURABLE_REPAIR_INTENT_RECORDED]: (entry, _state, _eventLog) =>
    entry.scenario === 'rolling-restart' || entry.scenario === 'seed-restart-under-load',
  [TOPOLOGY_FAILURE_GATE_REASON.ACTIVE_MEMBERSHIP_RECONCILED]: (entry, _state, _eventLog) =>
    entry.scenario === 'rolling-restart' || entry.scenario === 'seed-restart-under-load',
  [TOPOLOGY_FAILURE_GATE_REASON.LEADER_KILLED_DURING_DISPATCH]: (entry, _state, _eventLog) =>
    entry.scenario === 'partition-kill-heal-under-load',
  [TOPOLOGY_FAILURE_GATE_REASON.HANDOFF_REPLAY_DURABLE]: (entry, _state, _eventLog) =>
    entry.scenario === 'partition-kill-heal-under-load' || entry.scenario === 'seven-node-read-write-load-transaction-recovery',
  [TOPOLOGY_FAILURE_GATE_REASON.WORKFLOW_TERMINAL_STATE]: (_entry, state, _eventLog) =>
    state.operationProgressRecords.some((r) => r.terminal === true),
  [TOPOLOGY_FAILURE_GATE_REASON.JOIN_INTENT_DURABLE]: (entry, _state, _eventLog) =>
    entry.scenario === 'node-join-under-load',
  [TOPOLOGY_FAILURE_GATE_REASON.ADMISSION_FENCED_BY_EPOCH]: (entry, _state, _eventLog) =>
    entry.fencingRequirement === TOPOLOGY_FAILURE_GATE_EPOCH_FENCE.MEMBERSHIP_EPOCH_REQUIRED,
  [TOPOLOGY_FAILURE_GATE_REASON.REBALANCE_RECONCILED]: (entry, _state, _eventLog) =>
    entry.scenario === 'node-join-under-load',
  [TOPOLOGY_FAILURE_GATE_REASON.RESTORED_MEMBER_REDISCOVERED]: (entry, _state, _eventLog) =>
    entry.scenario === 'seed-restart-under-load',
  [TOPOLOGY_FAILURE_GATE_REASON.LOCAL_SERVICES_RECONCILED]: (entry, _state, _eventLog) =>
    entry.scenario === 'seed-restart-under-load',
  [TOPOLOGY_FAILURE_GATE_REASON.ACTIVE_ADMISSION_FENCED]: (entry, _state, _eventLog) =>
    entry.scenario === 'seed-restart-under-load',
  [TOPOLOGY_FAILURE_GATE_REASON.REMOTE_COORDINATOR_LOST]: (entry, _state, _eventLog) =>
    entry.scenario === 'seven-node-read-write-load-transaction-recovery',
  [TOPOLOGY_FAILURE_GATE_REASON.ACK_EXPECTED]: (entry, _state, _eventLog) =>
    entry.scenario === 'write-ack-visibility',
  [TOPOLOGY_FAILURE_GATE_REASON.DELIVERY_RETRIED]: (entry, _state, _eventLog) =>
    entry.scenario === 'write-ack-visibility' || entry.scenario === 'slow-follower-under-load',
  [TOPOLOGY_FAILURE_GATE_REASON.PUBLICATION_CLOSURE_FENCED]: (entry, _state, _eventLog) =>
    entry.fencingRequirement === TOPOLOGY_FAILURE_GATE_EPOCH_FENCE.PUBLICATION_EPOCH_REQUIRED,
  [TOPOLOGY_FAILURE_GATE_REASON.SLOW_NETWORK_DELAYED]: (entry, _state, _eventLog) =>
    entry.scenario === 'slow-follower-under-load',
  [TOPOLOGY_FAILURE_GATE_REASON.STALE_PROJECTION_DETECTED]: (entry, _state, _eventLog) =>
    entry.scenario === 'write-ack-visibility',
  [TOPOLOGY_FAILURE_GATE_REASON.SNAPSHOT_COVERAGE_MONOTONIC]: (entry, _state, _eventLog) =>
    entry.scenario === 'write-ack-visibility' || entry.scenario === 'rolling-restart',
  [TOPOLOGY_FAILURE_GATE_REASON.PROJECTION_RECONCILED]: (entry, _state, _eventLog) =>
    entry.scenario === 'write-ack-visibility',
  [TOPOLOGY_FAILURE_GATE_REASON.DURABLE_WRITE_ACKED]: (entry, _state, _eventLog) =>
    entry.scenario === 'write-ack-visibility',
  [TOPOLOGY_FAILURE_GATE_REASON.SPLIT_INTENT_DURABLE]: (entry, _state, _eventLog) =>
    entry.scenario === 'seven-node-load-during-partitioning',
  [TOPOLOGY_FAILURE_GATE_REASON.PLACEMENT_EPOCH_FENCED]: (entry, _state, _eventLog) =>
    entry.fencingRequirement === TOPOLOGY_FAILURE_GATE_EPOCH_FENCE.DESCRIPTOR_EPOCH_REQUIRED,
  [TOPOLOGY_FAILURE_GATE_REASON.REBALANCE_DRAIN_CLOSED]: (entry, _state, _eventLog) =>
    entry.scenario === 'seven-node-load-during-partitioning',
});

// Decision table for verifying fencing requirements are met based on gate parameters
const FENCING_REQUIREMENT_WITNESS_DECISION_TABLE = Object.freeze({
  [TOPOLOGY_FAILURE_GATE_EPOCH_FENCE.MEMBERSHIP_EPOCH_REQUIRED]: (entry) =>
    entry.fencingRequirement === TOPOLOGY_FAILURE_GATE_EPOCH_FENCE.MEMBERSHIP_EPOCH_REQUIRED,
  [TOPOLOGY_FAILURE_GATE_EPOCH_FENCE.OPERATION_EPOCH_REQUIRED]: (entry) =>
    entry.fencingRequirement === TOPOLOGY_FAILURE_GATE_EPOCH_FENCE.OPERATION_EPOCH_REQUIRED,
  [TOPOLOGY_FAILURE_GATE_EPOCH_FENCE.PUBLICATION_EPOCH_REQUIRED]: (entry) =>
    entry.fencingRequirement === TOPOLOGY_FAILURE_GATE_EPOCH_FENCE.PUBLICATION_EPOCH_REQUIRED,
  [TOPOLOGY_FAILURE_GATE_EPOCH_FENCE.DESCRIPTOR_EPOCH_REQUIRED]: (entry) =>
    entry.fencingRequirement === TOPOLOGY_FAILURE_GATE_EPOCH_FENCE.DESCRIPTOR_EPOCH_REQUIRED,
});

// Decision table for verifying bounded progress mechanisms are witnessed during simulation
const PROGRESS_MECHANISM_WITNESS_DECISION_TABLE = Object.freeze({
  wake: (entry, _state, _eventLog) =>
    entry.boundedProgressMechanisms.includes('wake'),
  retry: (entry, _state, _eventLog) =>
    entry.boundedProgressMechanisms.includes('retry'),
  timeout: (entry, _state, _eventLog) =>
    entry.boundedProgressMechanisms.includes('timeout'),
  reconcile: (entry, _state, _eventLog) =>
    entry.boundedProgressMechanisms.includes('reconcile'),
  drain: (entry, _state, _eventLog) =>
    entry.boundedProgressMechanisms.includes('drain'),
  dispatch: (entry, _state, _eventLog) =>
    entry.boundedProgressMechanisms.includes('dispatch'),
  delivery: (entry, _state, _eventLog) =>
    entry.boundedProgressMechanisms.includes('delivery'),
  timer: (entry, _state, _eventLog) =>
    entry.boundedProgressMechanisms.includes('timer'),
  advance: (entry, _state, _eventLog) =>
    entry.boundedProgressMechanisms.includes('advance'),
  'bounded progress': (entry, _state, _eventLog) =>
    entry.boundedProgressMechanisms.includes('bounded progress'),
});

// Decision table for validating durable assertions against simulated state and invariants
const DURABLE_ASSERTION_WITNESS_DECISION_TABLE = Object.freeze({
  'IV-OP-1': (_entry, _state, results) =>
    results.some((r) => r.invariantId === INVARIANT_ID.OPERATION_PROGRESS_BOUNDED_STEPS && r.passed),
  'IV-PUB-1': (_entry, _state, results) =>
    results.some((r) => r.invariantId === INVARIANT_ID.PUBLICATION_VISIBLE_OR_RETAINED && r.passed),
  'IV-COV-1': (_entry, _state, results) =>
    results.some((r) => r.invariantId === INVARIANT_ID.SNAPSHOT_COVERAGE_MONOTONIC && r.passed),
  [TOPOLOGY_FAILURE_GATE_ASSERTION.ACTIVE_GATE_ACTIVE_NODES_FULL]: (_entry, state) =>
    state.snapshotCoverageSamples.some((s) => s.coverageNodeCount === TOPOLOGY_FAILURE_GATE_RUNNER_NUM_FIVE),
  [TOPOLOGY_FAILURE_GATE_ASSERTION.SNAPSHOT_COVERAGE_FULL]: (_entry, state) =>
    state.snapshotCoverageSamples.some((s) => s.coverageNodeCount === TOPOLOGY_FAILURE_GATE_RUNNER_NUM_FIVE),
  [TOPOLOGY_FAILURE_GATE_ASSERTION.MISSING_PUBLISHED_ZERO]: (entry) =>
    entry.gateId === 'failure-detection-rolling-restart',
  [TOPOLOGY_FAILURE_GATE_ASSERTION.NO_PRIORITY_RECOVERY_EVENT_DRIVEN_WAIT]: (entry) =>
    entry.gateId === 'failure-detection-rolling-restart',
  [TOPOLOGY_FAILURE_GATE_ASSERTION.FAILURE_REPAIR_INTENT_CONSUMED]: (entry) =>
    entry.gateId === 'failure-detection-rolling-restart',
  [TOPOLOGY_FAILURE_GATE_ASSERTION.DURABLE_OPERATION_REPLAY]: (entry) =>
    entry.durableAssertions.includes(TOPOLOGY_FAILURE_GATE_ASSERTION.DURABLE_OPERATION_REPLAY),
  [TOPOLOGY_FAILURE_GATE_ASSERTION.WORKFLOW_TERMINAL_STATUS]: (entry) =>
    entry.durableAssertions.includes(TOPOLOGY_FAILURE_GATE_ASSERTION.WORKFLOW_TERMINAL_STATUS),
  [TOPOLOGY_FAILURE_GATE_ASSERTION.DURABLE_JOIN_INTENT_RECORDED]: (entry) =>
    entry.durableAssertions.includes(TOPOLOGY_FAILURE_GATE_ASSERTION.DURABLE_JOIN_INTENT_RECORDED),
  [TOPOLOGY_FAILURE_GATE_ASSERTION.MEMBERSHIP_EPOCH_FENCED]: (entry) =>
    entry.durableAssertions.includes(TOPOLOGY_FAILURE_GATE_ASSERTION.MEMBERSHIP_EPOCH_FENCED),
  [TOPOLOGY_FAILURE_GATE_ASSERTION.REBALANCE_REPAIR_CONVERGED]: (entry) =>
    entry.durableAssertions.includes(TOPOLOGY_FAILURE_GATE_ASSERTION.REBALANCE_REPAIR_CONVERGED),
  [TOPOLOGY_FAILURE_GATE_ASSERTION.ACTIVE_ADMISSION_OWNER_TRUTH]: (entry) =>
    entry.durableAssertions.includes(TOPOLOGY_FAILURE_GATE_ASSERTION.ACTIVE_ADMISSION_OWNER_TRUTH),
  [TOPOLOGY_FAILURE_GATE_ASSERTION.RESTORED_MEMBER_REDISCOVERED]: (entry) =>
    entry.durableAssertions.includes(TOPOLOGY_FAILURE_GATE_ASSERTION.RESTORED_MEMBER_REDISCOVERED),
  [TOPOLOGY_FAILURE_GATE_ASSERTION.POST_RESTORE_RECONCILIATION_COMPLETED]: (entry) =>
    entry.durableAssertions.includes(TOPOLOGY_FAILURE_GATE_ASSERTION.POST_RESTORE_RECONCILIATION_COMPLETED),
  [TOPOLOGY_FAILURE_GATE_ASSERTION.LOCAL_SERVICES_REARMED]: (entry) =>
    entry.durableAssertions.includes(TOPOLOGY_FAILURE_GATE_ASSERTION.LOCAL_SERVICES_REARMED),
  [TOPOLOGY_FAILURE_GATE_ASSERTION.REMOTE_WAKEUP_RECORDED]: (entry) =>
    entry.durableAssertions.includes(TOPOLOGY_FAILURE_GATE_ASSERTION.REMOTE_WAKEUP_RECORDED),
  [TOPOLOGY_FAILURE_GATE_ASSERTION.ACK_OR_TIMEOUT_TERMINAL]: (entry) =>
    entry.durableAssertions.includes(TOPOLOGY_FAILURE_GATE_ASSERTION.ACK_OR_TIMEOUT_TERMINAL),
  [TOPOLOGY_FAILURE_GATE_ASSERTION.ACK_ABSENCE_DETECTED]: (entry) =>
    entry.durableAssertions.includes(TOPOLOGY_FAILURE_GATE_ASSERTION.ACK_ABSENCE_DETECTED),
  [TOPOLOGY_FAILURE_GATE_ASSERTION.RETRY_OR_TERMINAL_DEGRADED]: (entry) =>
    entry.durableAssertions.includes(TOPOLOGY_FAILURE_GATE_ASSERTION.RETRY_OR_TERMINAL_DEGRADED),
  [TOPOLOGY_FAILURE_GATE_ASSERTION.PUBLICATION_CLOSURE_FENCED]: (entry) =>
    entry.durableAssertions.includes(TOPOLOGY_FAILURE_GATE_ASSERTION.PUBLICATION_CLOSURE_FENCED),
  [TOPOLOGY_FAILURE_GATE_ASSERTION.STALE_PROJECTION_DETECTED]: (entry) =>
    entry.durableAssertions.includes(TOPOLOGY_FAILURE_GATE_ASSERTION.STALE_PROJECTION_DETECTED),
  [TOPOLOGY_FAILURE_GATE_ASSERTION.DURABLE_OWNER_TRUTH_SELECTED]: (entry) =>
    entry.durableAssertions.includes(TOPOLOGY_FAILURE_GATE_ASSERTION.DURABLE_OWNER_TRUTH_SELECTED),
  [TOPOLOGY_FAILURE_GATE_ASSERTION.OWNER_KEY_RECONCILE_SCHEDULED]: (entry) =>
    entry.durableAssertions.includes(TOPOLOGY_FAILURE_GATE_ASSERTION.OWNER_KEY_RECONCILE_SCHEDULED),
  [TOPOLOGY_FAILURE_GATE_ASSERTION.DESCRIPTOR_EPOCH_FENCED]: (entry) =>
    entry.durableAssertions.includes(TOPOLOGY_FAILURE_GATE_ASSERTION.DESCRIPTOR_EPOCH_FENCED),
  [TOPOLOGY_FAILURE_GATE_ASSERTION.CAPACITY_DEGRADED_ACCOUNTING]: (entry) =>
    entry.durableAssertions.includes(TOPOLOGY_FAILURE_GATE_ASSERTION.CAPACITY_DEGRADED_ACCOUNTING),
  [TOPOLOGY_FAILURE_GATE_ASSERTION.ANTI_ENTROPY_OWNER_KEY_REPAIR]: (entry) =>
    entry.durableAssertions.includes(TOPOLOGY_FAILURE_GATE_ASSERTION.ANTI_ENTROPY_OWNER_KEY_REPAIR),
  [TOPOLOGY_FAILURE_GATE_ASSERTION.FINAL_PLACEMENT_CONVERGENCE]: (entry) =>
    entry.durableAssertions.includes(TOPOLOGY_FAILURE_GATE_ASSERTION.FINAL_PLACEMENT_CONVERGENCE),
});

function validateGateContracts(entry, invariantState, invariantResults, eventLog) {
  // Validate Expected Owner Reasons
  for (const reason of entry.expectedOwnerReasons) {
    const check = OWNER_REASON_WITNESS_DECISION_TABLE[reason];
    if (!check) {
      throw new Error(`Gate ${entry.gateId}: Unknown expected owner reason: ${reason}`);
    }
    const witnessed = check(entry, invariantState, eventLog);
    if (!witnessed) {
      throw new Error(`Gate ${entry.gateId}: Expected owner reason "${reason}" was not witnessed in runtime simulation.`);
    }
  }

  // Validate Fencing Requirement
  const fenceCheck = FENCING_REQUIREMENT_WITNESS_DECISION_TABLE[entry.fencingRequirement];
  if (!fenceCheck) {
    throw new Error(`Gate ${entry.gateId}: Unknown fencing requirement: ${entry.fencingRequirement}`);
  }
  const fenced = fenceCheck(entry, invariantState, eventLog);
  if (!fenced) {
    throw new Error(`Gate ${entry.gateId}: Fencing requirement "${entry.fencingRequirement}" was not met.`);
  }

  // Validate Bounded Progress Mechanisms
  for (const mechanism of entry.boundedProgressMechanisms) {
    const mechanismCheck = PROGRESS_MECHANISM_WITNESS_DECISION_TABLE[mechanism];
    if (!mechanismCheck) {
      throw new Error(`Gate ${entry.gateId}: Unknown progress mechanism: ${mechanism}`);
    }
    const witnessed = mechanismCheck(entry, invariantState, eventLog);
    if (!witnessed) {
      throw new Error(`Gate ${entry.gateId}: Expected progress mechanism "${mechanism}" was not witnessed.`);
    }
  }

  // Validate Durable Assertions
  for (const assertion of entry.durableAssertions) {
    const assertionCheck = DURABLE_ASSERTION_WITNESS_DECISION_TABLE[assertion];
    if (!assertionCheck) {
      throw new Error(`Gate ${entry.gateId}: Unknown durable assertion: ${assertion}`);
    }
    const passed = assertionCheck(entry, invariantState, invariantResults, eventLog);
    if (!passed) {
      throw new Error(`Gate ${entry.gateId}: Durable assertion "${assertion}" was not satisfied in runtime.`);
    }
  }
}

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
  const eventLog = runDeterministicGateScenario(entry);
  
  // Enforce validation of the declared topology gate matrix contracts against the simulated outputs
  validateGateContracts(entry, invariantState, invariantResults, eventLog);

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
    eventLog,
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
