import {test} from '../../src/test-helpers/tap.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../../src/control-plane/owner-contract-outcome.js';
import {
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
  PRIORITY_RECOVERY_BLOCKER_REASON,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_PROGRESS_OWNER,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_WAIT_MODE,
  PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE,
} from '../../src/control-plane/priority-recovery-diagnostics-constants.js';
import {
  buildPriorityRecoveryDecisionSnapshot,
  buildPriorityRecoveryDecisionSnapshots,
  buildPriorityRecoveryOperationContextFromRecord,
  normalizePriorityRecoveryDispatchPendingDecisionSnapshot,
} from '../../src/control-plane/priority-recovery-snapshot.js';
import {
  OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES,
  OPERATION_WORKFLOW_OUTCOME_VALUES,
  OPERATION_WORKFLOW_OWNER,
  OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
  OPERATION_WORKFLOW_REASON_CODE_VALUES,
} from '../../src/rebalancer/operation-workflow-owner-constants.js';

const TEST_PARTITION_ID = 'priority-recovery-owner-contract-p1';
const TEST_OPERATION_ID = 'priority-recovery-owner-contract-op';
const TEST_CORRELATION_KEY = 'priority-recovery-owner-contract-correlation';
const TEST_SOURCE_REVISION = 'priority-recovery-owner-contract-revision';
const TEST_OWNER_STATE = 'priority_recovery_owner_contract_state';
const TEST_OPERATION_OWNER_OBSERVATION_STATE_OBSERVED =
  'operation_owner_outcome_observed';
const TEST_OPERATION_OWNER_EFFECT_EXECUTION_NOT_EXECUTED = 'not_executed';
const TEST_REBALANCER_HANDOFF_RETRY_OUTCOME =
  'wait_for_rebalancer_handoff_retry';
const TEST_REBALANCER_HANDOFF_RETRY_REASON =
  'remote_handoff_retry_scheduled';
const TEST_PUBLICATION_EPOCH = 2;
const TEST_CAPTURED_AT_MS = 1000000;
const TEST_CREATED_AT_MS = 900000;
const TEST_UPDATED_AT_MS = 960000;
const TEST_RECENT_UPDATED_AT_MS = 999000;
const TEST_READY_DISTINCT_NODE_COUNT = 1;
const TEST_REQUIRED_DISTINCT_NODE_COUNT = 2;
const TEST_SPREAD_GAP = 1;
const TEST_SOURCE_NODE_ID = 'priority-recovery-owner-contract-source';
const TEST_TARGET_NODE_ID = 'priority-recovery-owner-contract-target';
const TEST_REPLICA_ID = 'priority-recovery-owner-contract-replica';
const TEST_ENTITY_TYPE_PARTITION = 'partition';
const TEST_OPERATION_TYPE_REPLACE = 'REPLACE';
const TEST_PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const TEST_WORKFLOW_STEP_PENDING = 'PENDING';
const TEST_WORKFLOW_STEP_SENDING = 'SENDING';
const TEST_OPERATION_STATUS_PENDING = 'pending';
const TEST_TARGET_VISIBILITY_NON_ACTIVE = 'non_active';

function buildPriorityRecoveryOwnerConsumerSnapshot(overrides = {}) {
  return Object.freeze({
    partitionId: TEST_PARTITION_ID,
    operationId: TEST_OPERATION_ID,
    blockerReasons: Object.freeze([]),
    semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
    actuation: Object.freeze({
      owner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      state:
        PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
      workflowProgressPhaseId:
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
    }),
    progress: Object.freeze({
      contractState: OWNER_CONTRACT_STATE.PENDING,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
      waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
      workflowProgressPhaseId:
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
    }),
    ...overrides,
  });
}

function buildPriorityRecoveryOwnerPublicationConvergence() {
  return Object.freeze({
    publicationEpoch: TEST_PUBLICATION_EPOCH,
    publicationStatus: TEST_PUBLICATION_STATUS_PUBLISHED,
    publishedActiveNodeIds: Object.freeze([
      TEST_SOURCE_NODE_ID,
      TEST_TARGET_NODE_ID,
    ]),
    pendingAckNodeIds: Object.freeze([]),
    priorityPartitionSummary: Object.freeze({
      satisfied: false,
      blockedPartitions: Object.freeze([
        Object.freeze({
          partitionId: TEST_PARTITION_ID,
          readyDistinctNodeCount: TEST_READY_DISTINCT_NODE_COUNT,
          requiredDistinctNodeCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
          spreadGap: TEST_SPREAD_GAP,
        }),
      ]),
    }),
  });
}

function buildPriorityRecoveryOwnerCoordinatorExcludesPublicationConvergence() {
  return Object.freeze({
    publicationEpoch: TEST_PUBLICATION_EPOCH,
    publicationStatus: TEST_PUBLICATION_STATUS_PUBLISHED,
    publishedActiveNodeIds: Object.freeze([TEST_SOURCE_NODE_ID]),
    pendingAckNodeIds: Object.freeze([]),
    priorityPartitionSummary: Object.freeze({
      missingPartitionIds: Object.freeze([TEST_PARTITION_ID]),
      requiredDistinctNodeCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
      blockedPartitions: Object.freeze([
        Object.freeze({
          partitionId: TEST_PARTITION_ID,
          readyDistinctNodeCount: TEST_READY_DISTINCT_NODE_COUNT,
          requiredDistinctNodeCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
          spreadGap: TEST_SPREAD_GAP,
        }),
      ]),
    }),
    membershipLifecycleSummary: Object.freeze({
      projectedServingNodeIds: Object.freeze([TEST_SOURCE_NODE_ID]),
      locallyEligibleNodeIds: Object.freeze([TEST_SOURCE_NODE_ID]),
    }),
  });
}

function buildPriorityRecoveryOwnerPendingOperationRow(overrides = {}) {
  return Object.freeze({
    operation_id: TEST_OPERATION_ID,
    partition_id: TEST_PARTITION_ID,
    entity_type: TEST_ENTITY_TYPE_PARTITION,
    operation_type: TEST_OPERATION_TYPE_REPLACE,
    status: TEST_OPERATION_STATUS_PENDING,
    workflow_step: TEST_WORKFLOW_STEP_PENDING,
    source_node_id: TEST_SOURCE_NODE_ID,
    target_node_id: TEST_TARGET_NODE_ID,
    replica_id: TEST_REPLICA_ID,
    created_at: TEST_CREATED_AT_MS,
    updated_at: TEST_UPDATED_AT_MS,
    ...overrides,
  });
}

function buildOperationOwnerOutcome(overrides = {}) {
  const outcome =
    overrides.outcome ||
    OPERATION_WORKFLOW_OUTCOME_VALUES.WAIT_FOR_OWNER_PROGRESS;
  return Object.freeze({
    owner: OPERATION_WORKFLOW_OWNER,
    boundary: OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
    state: TEST_OWNER_STATE,
    outcome,
    nextRequiredAction: outcome,
    effectCommand: OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.NO_OPERATION_EFFECT,
    reasons: Object.freeze([]),
    correlationKey: TEST_CORRELATION_KEY,
    sourceRevision: TEST_SOURCE_REVISION,
    ...overrides,
  });
}

function assertOperationOwnerObservation(t, normalizedSnapshot, expected) {
  t.match(
    normalizedSnapshot.operationOwnerObservation,
    {
      state: TEST_OPERATION_OWNER_OBSERVATION_STATE_OBSERVED,
      owner: OPERATION_WORKFLOW_OWNER,
      boundary: OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
      outcome: expected.outcome,
      nextRequiredAction: expected.outcome,
      effectCommand: expected.effectCommand,
      effectExecution: TEST_OPERATION_OWNER_EFFECT_EXECUTION_NOT_EXECUTED,
      requestedOwnerAction: expected.requestedOwnerAction,
      correlationKey: TEST_CORRELATION_KEY,
      sourceRevision: TEST_SOURCE_REVISION,
    },
    expected.message,
  );
}

test('priority recovery consumes serial wait operation-owner outcome',
  async (t) => {
    const ownerOutcome = buildOperationOwnerOutcome({
      outcome: OPERATION_WORKFLOW_OUTCOME_VALUES.WAIT_FOR_SERIAL_OPERATION,
      reasons: Object.freeze([
        OPERATION_WORKFLOW_REASON_CODE_VALUES.SERIAL_DEPENDENCY_PENDING,
      ]),
    });
    const normalizedSnapshot =
      normalizePriorityRecoveryDispatchPendingDecisionSnapshot(
        buildPriorityRecoveryOwnerConsumerSnapshot(),
        ownerOutcome,
      );

    t.same(
      normalizedSnapshot.blockerReasons,
      [PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT],
    );
    t.equal(
      normalizedSnapshot.semanticState,
      PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
    );
    t.match(normalizedSnapshot.actuation, {
      owner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      state: PRIORITY_RECOVERY_ACTUATION_STATE.TRANSITION_DEFERRED,
    });
    t.match(normalizedSnapshot.progress, {
      contractState: OWNER_CONTRACT_STATE.PENDING,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
      waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
    });
    assertOperationOwnerObservation(t, normalizedSnapshot, {
      outcome: OPERATION_WORKFLOW_OUTCOME_VALUES.WAIT_FOR_SERIAL_OPERATION,
      effectCommand:
        OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.NO_OPERATION_EFFECT,
      requestedOwnerAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      message: 'serial wait should be an inert owner observation',
    });
  });

test('priority recovery maps persisted-not-dispatched dispatch outcome',
  async (t) => {
    const ownerOutcome = buildOperationOwnerOutcome({
      outcome: OPERATION_WORKFLOW_OUTCOME_VALUES.DISPATCH_LOCAL_OWNER,
      effectCommand:
        OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.DISPATCH_LOCAL_OWNER_COMMAND,
      reasons: Object.freeze([
        OPERATION_WORKFLOW_REASON_CODE_VALUES.LOCAL_OWNER_AUTHORITATIVE,
        OPERATION_WORKFLOW_REASON_CODE_VALUES.DISPATCH_NOT_OBSERVED,
      ]),
    });
    const normalizedSnapshot =
      normalizePriorityRecoveryDispatchPendingDecisionSnapshot(
        buildPriorityRecoveryOwnerConsumerSnapshot({
          actuation: Object.freeze({
            owner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
            state:
              PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
            workflowProgressPhaseId:
              PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
          }),
        }),
        ownerOutcome,
      );

    t.match(normalizedSnapshot.actuation, {
      state: PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
    });
    t.match(normalizedSnapshot.progress, {
      contractState: OWNER_CONTRACT_STATE.PENDING,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
      blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
      waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
    });
    assertOperationOwnerObservation(t, normalizedSnapshot, {
      outcome: OPERATION_WORKFLOW_OUTCOME_VALUES.DISPATCH_LOCAL_OWNER,
      effectCommand:
        OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.DISPATCH_LOCAL_OWNER_COMMAND,
      requestedOwnerAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
      message: 'dispatch command should remain a requested owner action only',
    });
  });

test('priority recovery maps stale timeout progress owner outcome to re-entry',
  async (t) => {
    const ownerOutcome = buildOperationOwnerOutcome({
      outcome: OPERATION_WORKFLOW_OUTCOME_VALUES.RECONCILE_STALE_PROGRESS,
      effectCommand:
        OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES
          .RECONCILE_STALE_PROGRESS_COMMAND,
      reasons: Object.freeze([
        OPERATION_WORKFLOW_REASON_CODE_VALUES.TIMEOUT_BUDGET_EXPIRED,
        OPERATION_WORKFLOW_REASON_CODE_VALUES.WORKFLOW_HISTORY_STALE,
      ]),
    });
    const normalizedSnapshot =
      normalizePriorityRecoveryDispatchPendingDecisionSnapshot(
        buildPriorityRecoveryOwnerConsumerSnapshot(),
        ownerOutcome,
      );

    t.same(normalizedSnapshot.blockerReasons, []);
    t.equal(
      normalizedSnapshot.semanticState,
      PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
    );
    t.match(normalizedSnapshot.actuation, {
      owner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      state: PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
    });
    t.match(normalizedSnapshot.progress, {
      contractState: OWNER_CONTRACT_STATE.PENDING,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
      blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
      waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
    });
    assertOperationOwnerObservation(t, normalizedSnapshot, {
      outcome: OPERATION_WORKFLOW_OUTCOME_VALUES.RECONCILE_STALE_PROGRESS,
      effectCommand:
        OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES
          .RECONCILE_STALE_PROGRESS_COMMAND,
      requestedOwnerAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
      message: 'stale reconcile should request owner progression re-entry',
    });
  });

test('priority recovery maps scheduled rebalancer handoff owner outcome',
  async (t) => {
    const ownerOutcome = buildOperationOwnerOutcome({
      outcome: TEST_REBALANCER_HANDOFF_RETRY_OUTCOME,
      effectCommand:
        OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.NO_OPERATION_EFFECT,
      reasons: Object.freeze([
        OPERATION_WORKFLOW_REASON_CODE_VALUES.REMOTE_OWNER_AUTHORITATIVE,
        TEST_REBALANCER_HANDOFF_RETRY_REASON,
      ]),
    });
    const normalizedSnapshot =
      normalizePriorityRecoveryDispatchPendingDecisionSnapshot(
        buildPriorityRecoveryOwnerConsumerSnapshot(),
        ownerOutcome,
      );

    t.same(normalizedSnapshot.blockerReasons, []);
    t.equal(
      normalizedSnapshot.semanticState,
      PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
    );
    t.match(normalizedSnapshot.actuation, {
      owner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      state: PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
    });
    t.match(normalizedSnapshot.progress, {
      contractState: OWNER_CONTRACT_STATE.PENDING,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.REBALANCER_HANDOFF,
      waitMode: PRIORITY_RECOVERY_WAIT_MODE.RETRY_SCHEDULED,
    });
    assertOperationOwnerObservation(t, normalizedSnapshot, {
      outcome: TEST_REBALANCER_HANDOFF_RETRY_OUTCOME,
      effectCommand:
        OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.NO_OPERATION_EFFECT,
      requestedOwnerAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      message: 'scheduled handoff retry should be observed without effects',
    });
  });

test('priority recovery records wait/no-op owner outcome without effects',
  async (t) => {
    const ownerOutcome = buildOperationOwnerOutcome({
      reasons: Object.freeze([
        OPERATION_WORKFLOW_REASON_CODE_VALUES.OWNER_PROGRESS_IN_FLIGHT,
      ]),
    });
    const normalizedSnapshot =
      normalizePriorityRecoveryDispatchPendingDecisionSnapshot(
        buildPriorityRecoveryOwnerConsumerSnapshot(),
        ownerOutcome,
      );

    t.same(normalizedSnapshot.blockerReasons, []);
    t.match(normalizedSnapshot.progress, {
      contractState: OWNER_CONTRACT_STATE.PENDING,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
      waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
    });
    assertOperationOwnerObservation(t, normalizedSnapshot, {
      outcome: OPERATION_WORKFLOW_OUTCOME_VALUES.WAIT_FOR_OWNER_PROGRESS,
      effectCommand:
        OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.NO_OPERATION_EFFECT,
      requestedOwnerAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      message: 'wait/no-op should be observed without executing effects',
    });
  });

test('priority recovery decision snapshots attach owner observation for ' +
  'persisted PENDING dispatch witnesses', async (t) => {
  const decisionSnapshots = buildPriorityRecoveryDecisionSnapshots({
    capturedAt: TEST_CAPTURED_AT_MS,
    publicationConvergence:
      buildPriorityRecoveryOwnerPublicationConvergence(),
    readinessByNodeId: Object.freeze({}),
    workflowAdmissionsByWorkflowId: Object.freeze({}),
    replicaOperationRows: Object.freeze([
      buildPriorityRecoveryOwnerPendingOperationRow(),
    ]),
    replicaOperations: Object.freeze({
      operationTimelineById: Object.freeze({}),
    }),
    serviceRows: Object.freeze([]),
  });
  const targetSnapshot = decisionSnapshots.snapshots.find((entry) =>
    entry.partitionId === TEST_PARTITION_ID &&
    entry.operationId === TEST_OPERATION_ID,
  );

  t.equal(
    targetSnapshot?.conditions?.latestOperationWorkflowStep,
    TEST_WORKFLOW_STEP_PENDING,
    'the fixture should preserve the PENDING workflow step',
  );
  t.equal(
    targetSnapshot?.operationOwnerObservation?.outcome,
    OPERATION_WORKFLOW_OUTCOME_VALUES.ADVANCE_EXISTING_OPERATION,
    'diagnostic snapshots should carry the owner advancement observation',
  );
  t.equal(
    targetSnapshot?.operationOwnerObservation?.requestedOwnerAction,
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
    'diagnostic snapshots should keep owner advancement as the requested action',
  );
  t.same(
    targetSnapshot?.blockerReasons,
    [],
    'owner-observed dispatch-pending diagnostics should clear no-transition blockers',
  );
  t.equal(
    targetSnapshot?.semanticState,
    PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
    'owner-observed dispatch-pending diagnostics should stay in flight',
  );
  t.match(targetSnapshot?.actuation, {
    owner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
    state: PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
  });
});

test('direct priority recovery decision snapshots attach owner observation ' +
  'for persisted PENDING dispatch witnesses', async (t) => {
  const operationContext = buildPriorityRecoveryOperationContextFromRecord(
    buildPriorityRecoveryOwnerPendingOperationRow(),
    {
      nowMs: TEST_CAPTURED_AT_MS,
    },
  );
  const targetSnapshot = buildPriorityRecoveryDecisionSnapshot({
    capturedAt: TEST_CAPTURED_AT_MS,
    partitionId: TEST_PARTITION_ID,
    publicationConvergence:
      buildPriorityRecoveryOwnerPublicationConvergence(),
    operationContexts: Object.freeze([operationContext]),
    operationId: TEST_OPERATION_ID,
    operationContext,
  });

  t.equal(
    targetSnapshot?.conditions?.latestOperationWorkflowStep,
    TEST_WORKFLOW_STEP_PENDING,
    'the direct fixture should preserve the PENDING workflow step',
  );
  t.equal(
    targetSnapshot?.operationOwnerObservation?.outcome,
    OPERATION_WORKFLOW_OUTCOME_VALUES.ADVANCE_EXISTING_OPERATION,
    'direct diagnostic snapshots should carry owner advancement observation',
  );
  t.equal(
    targetSnapshot?.operationOwnerObservation?.requestedOwnerAction,
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
    'direct diagnostic snapshots should request existing operation advance',
  );
  t.same(
    targetSnapshot?.blockerReasons,
    [],
    'direct owner-observed diagnostics should clear no-transition blockers',
  );
  t.equal(
    targetSnapshot?.semanticState,
    PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
    'direct owner-observed diagnostics should stay in flight',
  );
});

test('direct priority recovery decision snapshots attach owner observation ' +
  'for PENDING dispatch witnesses outside the eligible cohort', async (t) => {
  const operationContext = buildPriorityRecoveryOperationContextFromRecord(
    buildPriorityRecoveryOwnerPendingOperationRow({
      updated_at: TEST_RECENT_UPDATED_AT_MS,
    }),
    {
      nowMs: TEST_CAPTURED_AT_MS,
    },
  );
  const targetSnapshot = buildPriorityRecoveryDecisionSnapshot({
    capturedAt: TEST_CAPTURED_AT_MS,
    partitionId: TEST_PARTITION_ID,
    publicationConvergence:
      buildPriorityRecoveryOwnerCoordinatorExcludesPublicationConvergence(),
    operationContexts: Object.freeze([operationContext]),
    operationId: TEST_OPERATION_ID,
    operationContext,
  });

  t.equal(
    targetSnapshot?.conditions?.latestOperationWorkflowStep,
    TEST_WORKFLOW_STEP_PENDING,
    'the direct fixture should preserve the durable PENDING workflow step',
  );
  t.same(
    targetSnapshot?.admission?.effectiveEligibleNodeIds,
    [TEST_SOURCE_NODE_ID],
    'the fixture should keep the target outside the effective eligible cohort',
  );
  t.equal(
    targetSnapshot?.coordinator?.operation?.targetNodeId,
    TEST_TARGET_NODE_ID,
    'the focused operation should still target the excluded node',
  );
  t.equal(
    targetSnapshot?.operationOwnerObservation?.outcome,
    OPERATION_WORKFLOW_OUTCOME_VALUES.ADVANCE_EXISTING_OPERATION,
    'coordinator-excludes dispatch diagnostics should carry owner advancement observation',
  );
  t.equal(
    targetSnapshot?.operationOwnerObservation?.requestedOwnerAction,
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
    'coordinator-excludes dispatch diagnostics should request existing operation advance',
  );
  t.same(
    targetSnapshot?.blockerReasons,
    [],
    'owner-observed coordinator-excludes diagnostics should clear stale blockers',
  );
  t.equal(
    targetSnapshot?.semanticState,
    PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
    'owner-observed coordinator-excludes diagnostics should stay in flight',
  );
  t.match(targetSnapshot?.actuation, {
    owner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
    state: PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
  });
  t.match(targetSnapshot?.progress, {
    currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
    nextRequiredAction:
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
    blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
    waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
  });
});

test('priority recovery decision snapshots attach owner observation for ' +
  'persisted SENDING dispatch witnesses', async (t) => {
  const decisionSnapshots = buildPriorityRecoveryDecisionSnapshots({
    capturedAt: TEST_CAPTURED_AT_MS,
    publicationConvergence:
      buildPriorityRecoveryOwnerPublicationConvergence(),
    readinessByNodeId: Object.freeze({}),
    workflowAdmissionsByWorkflowId: Object.freeze({}),
    replicaOperationRows: Object.freeze([
      buildPriorityRecoveryOwnerPendingOperationRow({
        workflow_step: TEST_WORKFLOW_STEP_SENDING,
      }),
    ]),
    replicaOperations: Object.freeze({
      operationTimelineById: Object.freeze({}),
    }),
    serviceRows: Object.freeze([]),
  });
  const targetSnapshot = decisionSnapshots.snapshots.find((entry) =>
    entry.partitionId === TEST_PARTITION_ID &&
    entry.operationId === TEST_OPERATION_ID,
  );

  t.equal(
    targetSnapshot?.conditions?.latestOperationWorkflowStep,
    TEST_WORKFLOW_STEP_SENDING,
    'the fixture should preserve the SENDING workflow step',
  );
  t.equal(
    targetSnapshot?.operationOwnerObservation?.outcome,
    OPERATION_WORKFLOW_OUTCOME_VALUES.ADVANCE_EXISTING_OPERATION,
    'diagnostic snapshots should carry the sending owner observation',
  );
  t.same(
    targetSnapshot?.blockerReasons,
    [],
    'owner-observed sending diagnostics should clear no-transition blockers',
  );
  t.equal(
    targetSnapshot?.semanticState,
    PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
    'owner-observed sending diagnostics should stay in flight',
  );
  t.match(targetSnapshot?.actuation, {
    owner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
    state:
      PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
  });
});

test('priority recovery decision snapshots attach owner observation for ' +
  'SENDING dispatch witnesses with non-active targets', async (t) => {
  const operationContext = Object.freeze({
    ...buildPriorityRecoveryOperationContextFromRecord(
      buildPriorityRecoveryOwnerPendingOperationRow({
        workflow_step: TEST_WORKFLOW_STEP_SENDING,
      }),
      {
        nowMs: TEST_CAPTURED_AT_MS,
      },
    ),
    targetVisibilityState: TEST_TARGET_VISIBILITY_NON_ACTIVE,
  });
  const targetSnapshot = buildPriorityRecoveryDecisionSnapshot({
    capturedAt: TEST_CAPTURED_AT_MS,
    partitionId: TEST_PARTITION_ID,
    publicationConvergence:
      buildPriorityRecoveryOwnerPublicationConvergence(),
    operationContexts: Object.freeze([operationContext]),
    operationId: TEST_OPERATION_ID,
    operationContext,
  });

  t.equal(
    targetSnapshot?.coordinator?.operation?.targetVisibilityState,
    TEST_TARGET_VISIBILITY_NON_ACTIVE,
    'the fixture should preserve the non-active target visibility state',
  );
  t.equal(
    targetSnapshot?.operationOwnerObservation?.outcome,
    OPERATION_WORKFLOW_OUTCOME_VALUES.ADVANCE_EXISTING_OPERATION,
    'non-active target diagnostics should carry the sending owner observation',
  );
  t.same(
    targetSnapshot?.blockerReasons,
    [],
    'non-active target owner diagnostics should clear no-transition blockers',
  );
});
