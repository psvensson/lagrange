import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  OWNER_OUTCOME_FRESHNESS,
  OWNER_OUTCOME_STATE,
} from '../../src/control-plane/owner-outcome-contract.js';
import {
  PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION,
  PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON,
  PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE,
  PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION,
  PUBLICATION_ACTIVE_GATE_HANDOFF_REASON,
  PUBLICATION_ACTIVE_GATE_HANDOFF_STATE,
  PUBLICATION_OPERATION_WORKFLOW_HANDOFF_REASON,
  PUBLICATION_OPERATION_WORKFLOW_HANDOFF_STATE,
  buildPublicationActiveGateHandoffContract,
  buildPublicationActiveGateOwnerOutcomeEnvelope,
  hasPublicationActiveGateOwnerReconcileSignal,
  projectPublicationActiveGateHandoffToOwnerCohort,
  resolvePublicationActiveGateMembershipPublicationTarget,
  selectPublicationActiveGateHandoffContract,
} from '../../src/control-plane/publication-active-gate-handoff-contract.js';

const TEST_PUBLICATION_EPOCH = 7;
const TEST_NODE_1 = 'node-1';
const TEST_NODE_2 = 'node-2';
const TEST_NODE_3 = 'node-3';
const TEST_NODE_4 = 'node-4';
const TEST_NODE_5 = 'node-5';
const TEST_PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const TEST_PUBLICATION_REVISION = 70;
const TEST_SNAPSHOT_COVERAGE_REVISION = 71;
const TEST_SNAPSHOT_COVERAGE_UNAVAILABLE = 'unavailable';
const TEST_STALE_SNAPSHOT_REVISION_STATE = 'stale';
const TEST_ACTIVE_GATE_BUDGET = Object.freeze({
  state: 'available',
  activeGateState: 'timed_out',
});
const TEST_RECOVERY_WAIT_NODE_IDS = Object.freeze([TEST_NODE_5]);
const TEST_SEED_PUBLISHED_NODE_IDS = Object.freeze([TEST_NODE_1]);
const TEST_SELECTED_MISSING_PUBLICATION_NODE_IDS = Object.freeze([
  TEST_NODE_2,
  TEST_NODE_3,
  TEST_NODE_4,
  TEST_NODE_5,
]);
const TEST_SELECTED_HANDOFF_EXPECTED_NODE_IDS = Object.freeze([
  TEST_NODE_1,
  TEST_NODE_2,
  TEST_NODE_3,
  TEST_NODE_4,
  TEST_NODE_5,
]);
const TEST_PUBLICATION_STATUS_OPEN = 'OPEN';
const TEST_PUBLICATION_PENDING = true;
const TEST_RECOVERY_PROTOCOL_UNPUBLISHED_OBSERVATION =
  'unpublished_observation';
const TEST_PUBLICATION_ACK_CLOSED_COUNT = 0;
const TEST_PENDING_ACK_COUNT = 1;
const TEST_JOINED_PENDING_RECONCILE_COUNT = 2;
const TEST_RUNTIME_PROMOTION_DENIED = false;
const TEST_JOINED_NODE_ID_SEPARATOR = ',';
const TEST_EMPTY_NODE_IDS = Object.freeze([]);
const TEST_OPERATION_WORKFLOW_OWNER = 'operation_workflow_owner';
const TEST_OPERATION_WORKFLOW_BOUNDARY = 'workflow_progress';
const TEST_PUBLICATION_OWNER = 'topology_publication_owner';
const TEST_PUBLICATION_BOUNDARY = 'publication_convergence';
const TEST_OPERATION_WORKFLOW_ADVANCE_ACTION = 'advance_existing_operation';
const TEST_OPERATION_WORKFLOW_ACTUATION_STATE = 'persisted_not_dispatched';
const TEST_OPERATION_WORKFLOW_WAIT_MODE = 'event_driven';
const TEST_OPERATION_WORKFLOW_PROGRESS_PHASE = 'dispatch_pending';
const TEST_OPERATION_WORKFLOW_PARTITION_ID = 'control_plane_publications-p1';
const TEST_OPERATION_WORKFLOW_OPERATION_ID = 'operator-1';
const TEST_CROSS_OWNER_HANDOFF_CONTRACT_FIELD =
  'crossOwnerHandoffContract';
const TEST_ACTIVE_GATE_OWNER = 'active_gate_owner';
const TEST_ACTIVE_GATE_PROMOTION_BOUNDARY = 'active_gate_promotion_gate';
const TEST_SELECTED_SNAPSHOT_TIMEOUT_REASON = 'selected_timeout';
const TEST_SELECTED_SNAPSHOT_SOURCE_TIMEOUT_REASON =
  'selected_snapshot_source_timeout';
const TEST_SELECTED_SNAPSHOT_OBSERVATION_MODE_REPAIR_DEFERRED =
  'repair_deferred';
const TEST_SELECTED_SNAPSHOT_OBSERVATION_STATE_DEFERRED_REFRESH =
  'deferred_refresh';
const TEST_SELECTED_SNAPSHOT_OBSERVATION_CONTRACT_STATE_DEFERRED =
  'deferred';
const TEST_SELECTED_SNAPSHOT_OBSERVATION_NEXT_ACTION_RETRY = 'retry';
const TEST_SELECTED_SNAPSHOT_OBSERVATION_RETRY_AFTER_MS = 100;
const TEST_CONTROL_PLANE_OWNER_RECOVERY_RETRY_AFTER_MS = 1000;
const TEST_JOINED_PENDING_RECONCILE_NODE_IDS = [
  TEST_NODE_2,
  TEST_NODE_3,
].join(TEST_JOINED_NODE_ID_SEPARATOR);

test('publication active-gate handoff contract schedules owner reconcile from one decision table',
  async (t) => {
    const contract = buildPublicationActiveGateHandoffContract({
      nodeRows: [
        {node_id: TEST_NODE_1},
        {node_id: TEST_NODE_2},
        {node_id: TEST_NODE_3},
      ],
      activeNodeViews: {
        effectiveActiveNodeIds: [TEST_NODE_1, TEST_NODE_2, TEST_NODE_3],
        publishedActiveNodeIds: [TEST_NODE_1],
      },
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publishedActiveNodeIds: [TEST_NODE_1],
        missingPublishedNodeIds: [TEST_NODE_2, TEST_NODE_3],
      },
    });

    t.match(contract, {
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      expectedNodeIds: [TEST_NODE_1, TEST_NODE_2, TEST_NODE_3],
      publishedActiveNodeIds: [TEST_NODE_1],
      missingPublishedNodeIds: [TEST_NODE_2, TEST_NODE_3],
      pendingRecoveryNodeIds: [],
      pendingReconcileNodeIds: [TEST_NODE_2, TEST_NODE_3],
      runtimePromotionAllowed: false,
      state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
      reasonCode:
        PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
      nextAction:
        PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
          .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
      activeGateCatchupFence: {
        state:
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.CATCHUP_PENDING,
        targetNodeIds: [TEST_NODE_1, TEST_NODE_2, TEST_NODE_3],
        durablePublication: {
          publicationEpoch: TEST_PUBLICATION_EPOCH,
          nodeIds: [TEST_NODE_1],
          missingNodeIds: [TEST_NODE_2, TEST_NODE_3],
        },
        missingProofReasons: [
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON
            .DURABLE_PUBLICATION_INCOMPLETE,
        ],
        nextLegalAction:
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION
            .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
      },
    });
    t.match(contract[TEST_CROSS_OWNER_HANDOFF_CONTRACT_FIELD], {
      producerOwnerOutcome: {
        owner: TEST_PUBLICATION_OWNER,
        boundary: TEST_PUBLICATION_BOUNDARY,
        state: OWNER_OUTCOME_STATE.PENDING,
        outcome: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
        reasonCodes: [
          PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
        ],
        freshness: OWNER_OUTCOME_FRESHNESS.STALE,
        revision: TEST_PUBLICATION_EPOCH,
        terminal: false,
      },
      consumerPrecondition: {
        consumerOwner: TEST_ACTIVE_GATE_OWNER,
        consumerBoundary: TEST_ACTIVE_GATE_PROMOTION_BOUNDARY,
        observedNextAction:
          PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
            .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
        promotionAllowed: false,
      },
      freshnessRevisionRequirement: {
        requiredFreshness: OWNER_OUTCOME_FRESHNESS.FRESH,
        observedFreshness: OWNER_OUTCOME_FRESHNESS.STALE,
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        revisionObserved: true,
        requirementSatisfied: false,
      },
      acknowledgementRule: {
        requiredAckNodeIds: [TEST_NODE_1, TEST_NODE_2, TEST_NODE_3],
        acknowledgedNodeIds: [TEST_NODE_1],
        pendingAckNodeIds: [TEST_NODE_2, TEST_NODE_3],
        acknowledgementSatisfied: false,
      },
      retryDeferBehavior: {
        deferConsumer: true,
        ownerReconcileRequired: true,
      },
      terminalCondition: {
        terminal: false,
        terminalState: OWNER_OUTCOME_STATE.PENDING,
      },
    });
    t.ok(
      contract[TEST_CROSS_OWNER_HANDOFF_CONTRACT_FIELD]
        .diagnosticVocabulary.state.includes(
          PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
        ),
      'cross-owner handoff diagnostic vocabulary should include the current state',
    );
    t.ok(
      contract[TEST_CROSS_OWNER_HANDOFF_CONTRACT_FIELD]
        .diagnosticVocabulary.reasonCode.includes(
          PUBLICATION_ACTIVE_GATE_HANDOFF_REASON
            .OWNER_RECONCILE_PENDING,
        ),
      'cross-owner handoff diagnostic vocabulary should include the current reason code',
    );
  });

test('publication active-gate handoff emits classified workflow backpressure defer',
  async (t) => {
    const contract = buildPublicationActiveGateHandoffContract({
      nodeRows: [
        {node_id: TEST_NODE_1},
        {node_id: TEST_NODE_2},
        {node_id: TEST_NODE_3},
      ],
      activeNodeViews: {
        effectiveActiveNodeIds: [TEST_NODE_1, TEST_NODE_2, TEST_NODE_3],
        publishedActiveNodeIds: [TEST_NODE_1],
      },
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publishedActiveNodeIds: [TEST_NODE_1],
        missingPublishedNodeIds: [TEST_NODE_2, TEST_NODE_3],
        priorityRecoveryObservation: {
          priorityRecoveryPartitionWitnesses: [{
            partitionId: TEST_OPERATION_WORKFLOW_PARTITION_ID,
            currentOwner: TEST_OPERATION_WORKFLOW_OWNER,
            blockingBoundary: TEST_OPERATION_WORKFLOW_BOUNDARY,
            nextRequiredAction: TEST_OPERATION_WORKFLOW_ADVANCE_ACTION,
            actuationState: TEST_OPERATION_WORKFLOW_ACTUATION_STATE,
            waitMode: TEST_OPERATION_WORKFLOW_WAIT_MODE,
            workflowProgressPhaseId: TEST_OPERATION_WORKFLOW_PROGRESS_PHASE,
            operationIds: [TEST_OPERATION_WORKFLOW_OPERATION_ID],
          }],
        },
      },
    });

    t.match(contract.operationWorkflowHandoff, {
      state: PUBLICATION_OPERATION_WORKFLOW_HANDOFF_STATE.DEFERRED,
      reasonCode:
        PUBLICATION_OPERATION_WORKFLOW_HANDOFF_REASON
          .CLASSIFIED_BACKPRESSURE,
      publicationOwner: TEST_PUBLICATION_OWNER,
      publicationBoundary: TEST_PUBLICATION_BOUNDARY,
      downstreamOwner: TEST_OPERATION_WORKFLOW_OWNER,
      downstreamBoundary: TEST_OPERATION_WORKFLOW_BOUNDARY,
      downstreamRequiredAction: TEST_OPERATION_WORKFLOW_ADVANCE_ACTION,
      publicationNextAction:
        PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
          .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
      runtimePromotionAllowed: TEST_RUNTIME_PROMOTION_DENIED,
      actuationState: TEST_OPERATION_WORKFLOW_ACTUATION_STATE,
      waitMode: TEST_OPERATION_WORKFLOW_WAIT_MODE,
      workflowProgressPhaseId: TEST_OPERATION_WORKFLOW_PROGRESS_PHASE,
      partitionIds: [TEST_OPERATION_WORKFLOW_PARTITION_ID],
      operationIds: [TEST_OPERATION_WORKFLOW_OPERATION_ID],
    });
  });

test('publication active-gate handoff waits on selected-timeout snapshot owner evidence',
  async (t) => {
    const contract = buildPublicationActiveGateHandoffContract({
      expectedNodeIds: [TEST_NODE_1, TEST_NODE_2],
      activeNodeViews: {
        effectiveActiveNodeIds: [TEST_NODE_1, TEST_NODE_2],
        snapshotCoverageRevision: TEST_SNAPSHOT_COVERAGE_REVISION,
      },
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        status: TEST_PUBLICATION_STATUS_PUBLISHED,
        publicationRevision: TEST_PUBLICATION_REVISION,
        publishedActiveNodeIds: [TEST_NODE_1, TEST_NODE_2],
        missingPublishedNodeIds: [],
      },
      readinessByNodeId: {
        [TEST_NODE_2]: {
          reasonCodes: [TEST_SELECTED_SNAPSHOT_TIMEOUT_REASON],
        },
      },
    });

    t.match(contract, {
      pendingRecoveryNodeIds: [TEST_NODE_2],
      pendingReconcileNodeIds: [],
      state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
      reasonCode:
        PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
      nextAction:
        PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.WAIT_OWNER_RECOVERY,
      runtimePromotionAllowed: false,
    });
    t.match(contract[TEST_CROSS_OWNER_HANDOFF_CONTRACT_FIELD], {
      producerOwnerOutcome: {
        state: OWNER_OUTCOME_STATE.PENDING,
        reasonCodes: [
          PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
        ],
      },
      retryDeferBehavior: {
        deferConsumer: true,
        ownerRecoveryWaitRequired: true,
        ownerReconcileRequired: false,
      },
    });
  });

test('publication active-gate selector maps mixed deferred selected snapshot timeout to owner reconcile',
  async (t) => {
    const selected = selectPublicationActiveGateHandoffContract({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        status: TEST_PUBLICATION_STATUS_PUBLISHED,
        publishedActiveNodeIds: [TEST_NODE_1],
        activeGate: {
          progress: {
            selectedPublishedActiveNodeIds: [TEST_NODE_1],
            selectedMissingPublishedNodeIds: [
              TEST_NODE_2,
              TEST_NODE_3,
              TEST_NODE_4,
              TEST_NODE_5,
            ],
            selectedSnapshotNodeId: TEST_NODE_5,
            selectedSnapshotSourceCause:
              TEST_SELECTED_SNAPSHOT_SOURCE_TIMEOUT_REASON,
            selectedSnapshotObservationMode:
              TEST_SELECTED_SNAPSHOT_OBSERVATION_MODE_REPAIR_DEFERRED,
            selectedSnapshotObservationState:
              TEST_SELECTED_SNAPSHOT_OBSERVATION_STATE_DEFERRED_REFRESH,
            selectedSnapshotObservationContractState:
              TEST_SELECTED_SNAPSHOT_OBSERVATION_CONTRACT_STATE_DEFERRED,
            selectedSnapshotObservationNextAction:
              TEST_SELECTED_SNAPSHOT_OBSERVATION_NEXT_ACTION_RETRY,
            selectedSnapshotObservationReasonCodes:
              TEST_SELECTED_SNAPSHOT_TIMEOUT_REASON,
          },
        },
      },
    });
    const target = resolvePublicationActiveGateMembershipPublicationTarget({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publishedActiveNodeIds: [TEST_NODE_1],
      },
      publicationActiveGateHandoff: selected,
    });

    t.match(
      selected,
      {
        expectedNodeIds: [...TEST_SELECTED_HANDOFF_EXPECTED_NODE_IDS],
        publishedActiveNodeIds: [TEST_NODE_1],
        missingPublishedNodeIds: [
          TEST_NODE_2,
          TEST_NODE_3,
          TEST_NODE_4,
          TEST_NODE_5,
        ],
        pendingRecoveryNodeIds: [TEST_NODE_5],
        pendingReconcileNodeIds: [
          TEST_NODE_2,
          TEST_NODE_3,
          TEST_NODE_4,
        ],
        state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
        reasonCode:
          PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
        nextAction:
          PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
            .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
        runtimePromotionAllowed: false,
      },
      'mixed deferred selected snapshot timeout should keep non-recovery publication debt',
    );
    t.equal(
      target.reconcileRequired,
      true,
      'mixed selected snapshot owner debt should schedule membership publication reconcile',
    );
    t.same(
      target.pendingRecoveryNodeIds,
      [TEST_NODE_5],
      'selected snapshot timeout owner debt should stay visible on the target',
    );
    t.same(
      target.pendingReconcileNodeIds,
      [
        TEST_NODE_2,
        TEST_NODE_3,
        TEST_NODE_4,
      ],
      'target should expose selected missing nodes that are not pending owner recovery',
    );
    t.same(
      target.publishedActiveNodeIds,
      [
        TEST_NODE_1,
        TEST_NODE_2,
        TEST_NODE_3,
        TEST_NODE_4,
      ],
      'owner reconcile target should widen publication to the non-recovery active cohort',
    );
    t.equal(
      hasPublicationActiveGateOwnerReconcileSignal({
        publicationActiveGateHandoff: selected,
      }),
      true,
      'selected snapshot timeout should still wake the owner handoff path',
    );
  });

test('publication active-gate selector preserves pure deferred selected snapshot owner recovery wait',
  async (t) => {
    const selected = selectPublicationActiveGateHandoffContract({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        status: TEST_PUBLICATION_STATUS_PUBLISHED,
        publishedActiveNodeIds: [TEST_NODE_1],
        activeGate: {
          progress: {
            selectedPublishedActiveNodeIds: [TEST_NODE_1],
            selectedMissingPublishedNodeIds: [TEST_NODE_5],
            selectedSnapshotNodeId: TEST_NODE_5,
            selectedSnapshotSourceCause:
              TEST_SELECTED_SNAPSHOT_SOURCE_TIMEOUT_REASON,
            selectedSnapshotObservationMode:
              TEST_SELECTED_SNAPSHOT_OBSERVATION_MODE_REPAIR_DEFERRED,
            selectedSnapshotObservationState:
              TEST_SELECTED_SNAPSHOT_OBSERVATION_STATE_DEFERRED_REFRESH,
            selectedSnapshotObservationContractState:
              TEST_SELECTED_SNAPSHOT_OBSERVATION_CONTRACT_STATE_DEFERRED,
            selectedSnapshotObservationNextAction:
              TEST_SELECTED_SNAPSHOT_OBSERVATION_NEXT_ACTION_RETRY,
            selectedSnapshotObservationReasonCodes:
              TEST_SELECTED_SNAPSHOT_TIMEOUT_REASON,
          },
        },
      },
    });
    const target = resolvePublicationActiveGateMembershipPublicationTarget({
      publicationActiveGateHandoff: selected,
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publishedActiveNodeIds: [TEST_NODE_1],
      },
    });

    t.match(
      selected,
      {
        expectedNodeIds: [TEST_NODE_1, TEST_NODE_5],
        pendingRecoveryNodeIds: [TEST_NODE_5],
        pendingReconcileNodeIds: [],
        nextAction:
          PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.WAIT_OWNER_RECOVERY,
      },
      'pure selected snapshot timeout should remain owner recovery wait',
    );
    t.equal(
      target.reconcileRequired,
      false,
      'pure selected snapshot owner recovery should not schedule membership publication reconcile',
    );
  });

test('publication active-gate handoff floors selected timeout owner recovery retry',
  async (t) => {
    const diagnostics = {
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        status: TEST_PUBLICATION_STATUS_PUBLISHED,
        publishedActiveNodeIds: [TEST_NODE_1],
        activeGate: {
          progress: {
            selectedPublishedActiveNodeIds: [TEST_NODE_1],
            selectedMissingPublishedNodeIds: [TEST_NODE_5],
            selectedSnapshotNodeId: TEST_NODE_5,
            selectedSnapshotSourceCause:
              TEST_SELECTED_SNAPSHOT_SOURCE_TIMEOUT_REASON,
            selectedSnapshotObservationMode:
              TEST_SELECTED_SNAPSHOT_OBSERVATION_MODE_REPAIR_DEFERRED,
            selectedSnapshotObservationState:
              TEST_SELECTED_SNAPSHOT_OBSERVATION_STATE_DEFERRED_REFRESH,
            selectedSnapshotObservationContractState:
              TEST_SELECTED_SNAPSHOT_OBSERVATION_CONTRACT_STATE_DEFERRED,
            selectedSnapshotObservationNextAction:
              TEST_SELECTED_SNAPSHOT_OBSERVATION_NEXT_ACTION_RETRY,
            selectedSnapshotObservationReasonCodes:
              TEST_SELECTED_SNAPSHOT_TIMEOUT_REASON,
            selectedSnapshotObservationRetryAfterMs:
              TEST_SELECTED_SNAPSHOT_OBSERVATION_RETRY_AFTER_MS,
          },
        },
      },
    };
    const selected = selectPublicationActiveGateHandoffContract(diagnostics);
    const envelope = buildPublicationActiveGateOwnerOutcomeEnvelope(
      diagnostics,
    );
    const target = resolvePublicationActiveGateMembershipPublicationTarget({
      publicationActiveGateHandoff: selected,
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publishedActiveNodeIds: [TEST_NODE_1],
      },
    });

    t.match(selected, {
      nextAction:
        PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.WAIT_OWNER_RECOVERY,
      pendingRecoveryNodeIds: [TEST_NODE_5],
      retryAfterMs: TEST_CONTROL_PLANE_OWNER_RECOVERY_RETRY_AFTER_MS,
    });
    t.equal(
      diagnostics.publicationConvergence.activeGate.progress
        .selectedSnapshotObservationRetryAfterMs,
      TEST_SELECTED_SNAPSHOT_OBSERVATION_RETRY_AFTER_MS,
      'selected snapshot observation should stay diagnostic retry input',
    );
    t.equal(
      target.handoffContract.retryAfterMs,
      TEST_CONTROL_PLANE_OWNER_RECOVERY_RETRY_AFTER_MS,
      'membership handoff target should preserve owner recovery retry floor',
    );
    t.match(envelope, {
      retryAfterMs: TEST_CONTROL_PLANE_OWNER_RECOVERY_RETRY_AFTER_MS,
      evidence: {
        retryAfterMs: TEST_CONTROL_PLANE_OWNER_RECOVERY_RETRY_AFTER_MS,
        crossOwnerHandoffContract: {
          producerOwnerOutcome: {
            retryAfterMs: TEST_CONTROL_PLANE_OWNER_RECOVERY_RETRY_AFTER_MS,
          },
          retryDeferBehavior: {
            retryAfterMs: TEST_CONTROL_PLANE_OWNER_RECOVERY_RETRY_AFTER_MS,
            ownerRecoveryWaitRequired: true,
          },
        },
      },
    });
  });

test('publication active-gate handoff emits reconcile contract for unpublished publication pending',
  async (t) => {
    const contract = buildPublicationActiveGateHandoffContract({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_ACK_CLOSED_COUNT,
        publicationPending: TEST_PUBLICATION_PENDING,
        recoveryProtocolState:
          TEST_RECOVERY_PROTOCOL_UNPUBLISHED_OBSERVATION,
        pendingAckCount: TEST_PUBLICATION_ACK_CLOSED_COUNT,
        pendingAckNodeIds: [...TEST_EMPTY_NODE_IDS],
        missingPublishedCount: TEST_PUBLICATION_ACK_CLOSED_COUNT,
        missingPublishedNodeIds: [...TEST_EMPTY_NODE_IDS],
        publishedActiveNodeIds: [...TEST_EMPTY_NODE_IDS],
      },
      activeGate: {
        progress: {
          expectedNodeCount:
            TEST_SELECTED_HANDOFF_EXPECTED_NODE_IDS.length,
        },
      },
    });

    t.match(contract, {
      expectedNodeIds: [...TEST_EMPTY_NODE_IDS],
      publishedActiveNodeIds: [...TEST_EMPTY_NODE_IDS],
      missingPublishedNodeIds: [...TEST_EMPTY_NODE_IDS],
      pendingRecoveryNodeIds: [...TEST_EMPTY_NODE_IDS],
      pendingReconcileNodeIds: [...TEST_EMPTY_NODE_IDS],
      pendingReconcileCount: TEST_PUBLICATION_ACK_CLOSED_COUNT,
      runtimePromotionAllowed: false,
      state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
      reasonCode:
        PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
      nextAction:
        PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
          .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
      activeGateCatchupFence: {
        state:
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.CATCHUP_BLOCKED,
        nextLegalAction:
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION
            .OBSERVE_ACTIVE_GATE_TARGETS,
      },
    });
    t.equal(
      hasPublicationActiveGateOwnerReconcileSignal({
        publicationActiveGateHandoff: contract,
      }),
      true,
      'unpublished pending publication should expose owner reconcile signal',
    );
  });

test('publication active-gate handoff preserves nested selected missing publication evidence',
  async (t) => {
    const contract = buildPublicationActiveGateHandoffContract({
      activeNodeViews: {
        effectiveActiveNodeIds: [TEST_NODE_1, TEST_NODE_2],
        snapshotCoverageNodeIds: [TEST_NODE_1, TEST_NODE_2],
        snapshotCoverageRevision: TEST_SNAPSHOT_COVERAGE_REVISION,
      },
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        status: TEST_PUBLICATION_STATUS_PUBLISHED,
        publishedActiveNodeIds: [...TEST_SEED_PUBLISHED_NODE_IDS],
        activeGateProgress: {
          selectedPublishedActiveNodeIds: [
            ...TEST_SEED_PUBLISHED_NODE_IDS,
          ],
          selectedMissingPublishedNodeIds: [
            ...TEST_SELECTED_MISSING_PUBLICATION_NODE_IDS,
          ],
        },
      },
    });

    t.match(contract, {
      expectedNodeIds: [...TEST_SELECTED_HANDOFF_EXPECTED_NODE_IDS],
      publishedActiveNodeIds: [...TEST_SEED_PUBLISHED_NODE_IDS],
      missingPublishedNodeIds: [
        ...TEST_SELECTED_MISSING_PUBLICATION_NODE_IDS,
      ],
      pendingReconcileNodeIds: [
        ...TEST_SELECTED_MISSING_PUBLICATION_NODE_IDS,
      ],
      runtimePromotionAllowed: false,
      state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
      reasonCode:
        PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
      nextAction:
        PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
          .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
      activeGateCatchupFence: {
        state:
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.CATCHUP_PENDING,
        targetNodeIds: [...TEST_SELECTED_HANDOFF_EXPECTED_NODE_IDS],
        durablePublication: {
          nodeIds: [...TEST_SEED_PUBLISHED_NODE_IDS],
          missingNodeIds: [
            ...TEST_SELECTED_MISSING_PUBLICATION_NODE_IDS,
          ],
        },
        nextLegalAction:
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION
            .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
      },
    });
  });

test('publication active-gate handoff reconcile target covers expected owner cohort',
  async (t) => {
    const target = resolvePublicationActiveGateMembershipPublicationTarget({
      publicationActiveGateHandoff: {
        expectedNodeIds: [TEST_NODE_1, TEST_NODE_2],
        publishedActiveNodeIds: [TEST_NODE_1],
        pendingReconcileNodeIds: [TEST_NODE_2],
        pendingRecoveryNodeIds: [...TEST_RECOVERY_WAIT_NODE_IDS],
        nextAction:
          PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
            .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
      },
      activeGateOwnerCohort: {
        expectedNodeIds: [TEST_NODE_1, TEST_NODE_2],
        publishedActiveNodeIds: [TEST_NODE_1],
        pendingReconcileNodeIds: [TEST_NODE_2],
        pendingRecoveryNodeIds: [...TEST_RECOVERY_WAIT_NODE_IDS],
        nextAction:
          PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
            .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
      },
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publishedActiveNodeIds: [TEST_NODE_1],
        missingPublishedNodeIds: [
          TEST_NODE_2,
          TEST_NODE_3,
          TEST_NODE_4,
          TEST_NODE_5,
        ],
        membershipLifecycleSummary: {
          projectedServingNodeIds: [
            TEST_NODE_1,
            TEST_NODE_2,
            TEST_NODE_3,
            TEST_NODE_4,
            TEST_NODE_5,
          ],
          locallyEligibleNodeIds: [
            TEST_NODE_1,
            TEST_NODE_2,
            TEST_NODE_3,
            TEST_NODE_4,
            TEST_NODE_5,
          ],
          recoveryActiveNodeIds: [
            TEST_NODE_1,
            TEST_NODE_2,
            TEST_NODE_3,
            TEST_NODE_4,
            TEST_NODE_5,
          ],
          missingPublishedRecoveryActiveNodeIds: [
            TEST_NODE_2,
            TEST_NODE_3,
            TEST_NODE_4,
            TEST_NODE_5,
          ],
        },
      },
    });

    t.same(
      target.publishedActiveNodeIds,
      [
        TEST_NODE_1,
        TEST_NODE_2,
        TEST_NODE_3,
        TEST_NODE_4,
      ],
      'owner reconcile target should publish the expected handoff cohort and exclude recovery-pending nodes',
    );
    t.same(
      target.pendingReconcileNodeIds,
      [TEST_NODE_2],
      'pending reconcile diagnostics should keep the selected handoff projection',
    );
  });

test('publication active-gate selector preserves pending diagnostics while widening target',
  async (t) => {
    const selectedHandoff = selectPublicationActiveGateHandoffContract({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publishedActiveNodeIds: [TEST_NODE_1],
        expectedNodeIds: [
          TEST_NODE_1,
          TEST_NODE_2,
          TEST_NODE_3,
        ],
        missingPublishedNodeIds: [
          TEST_NODE_2,
          TEST_NODE_3,
          TEST_NODE_4,
          TEST_NODE_5,
        ],
      },
      activeGateOwnerCohort: {
        state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
        reasonCode:
          PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
        publishedActiveNodeIds: [TEST_NODE_1],
        missingPublishedNodeIds: [TEST_NODE_2],
        pendingReconcileNodeIds: [TEST_NODE_2],
        nextAction:
          PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
            .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
      },
    });
    const target =
      resolvePublicationActiveGateMembershipPublicationTarget(
        selectedHandoff,
      );

    t.same(
      target.publishedActiveNodeIds,
      [
        TEST_NODE_1,
        TEST_NODE_2,
        TEST_NODE_3,
        TEST_NODE_4,
        TEST_NODE_5,
      ],
      'selected owner handoff should publish the full expected owner cohort',
    );
    t.same(
      target.pendingReconcileNodeIds,
      [TEST_NODE_2],
      'selected owner handoff should preserve the current progress subset for diagnostics',
    );
  });

test('publication active-gate selector accepts flattened active-gate progress handoff',
  async (t) => {
    const selectedHandoff = selectPublicationActiveGateHandoffContract({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: TEST_PUBLICATION_STATUS_OPEN,
        publishedActiveNodeIds: [TEST_NODE_1],
        pendingAckNodeIds: [],
        pendingAckCount: TEST_PENDING_ACK_COUNT,
        missingPublishedNodeIds: [
          TEST_NODE_2,
          TEST_NODE_3,
          TEST_NODE_4,
          TEST_NODE_5,
        ],
        activeGate: {
          progress: {
            publicationActiveGateHandoffState:
              PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
            publicationActiveGateHandoffReasonCode:
              PUBLICATION_ACTIVE_GATE_HANDOFF_REASON
                .OWNER_RECONCILE_PENDING,
            publicationActiveGateHandoffNextAction:
              PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
                .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
            publicationActiveGateHandoffRuntimePromotionAllowed:
              TEST_RUNTIME_PROMOTION_DENIED,
            publicationActiveGateHandoffPendingReconcileNodeIds: [
              TEST_NODE_2,
            ],
            publicationActiveGateHandoffPendingReconcileCount:
              TEST_PENDING_ACK_COUNT,
            selectedPublishedActiveNodeIds: [TEST_NODE_1],
            selectedMissingPublishedNodeIds: [
              TEST_NODE_2,
              TEST_NODE_3,
              TEST_NODE_4,
              TEST_NODE_5,
            ],
          },
        },
      },
    });
    const target =
      resolvePublicationActiveGateMembershipPublicationTarget(
        selectedHandoff,
      );

    t.equal(
      hasPublicationActiveGateOwnerReconcileSignal(selectedHandoff),
      true,
      'flattened active-gate progress should retain the owner reconcile signal',
    );
    t.same(
      target.publishedActiveNodeIds,
      [
        TEST_NODE_1,
        TEST_NODE_2,
        TEST_NODE_3,
        TEST_NODE_4,
        TEST_NODE_5,
      ],
      'flattened active-gate progress should publish the full selected missing cohort',
    );
    t.same(
      target.pendingReconcileNodeIds,
      [TEST_NODE_2],
      'flattened active-gate progress should preserve the selected pending reconcile node',
    );
  });

test('publication active-gate selector maps flattened owner reconcile cohort',
  async (t) => {
    const selectedHandoff = selectPublicationActiveGateHandoffContract({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: TEST_PUBLICATION_STATUS_PUBLISHED,
        publishedActiveNodeIds: [TEST_NODE_1],
        activeGate: {
          progress: {
            publicationActiveGateHandoffState:
              PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
            publicationActiveGateHandoffReasonCode:
              PUBLICATION_ACTIVE_GATE_HANDOFF_REASON
                .OWNER_RECONCILE_PENDING,
            publicationActiveGateHandoffNextAction:
              PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
                .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
            publicationActiveGateHandoffRuntimePromotionAllowed:
              TEST_RUNTIME_PROMOTION_DENIED,
            publicationActiveGateHandoffPendingReconcileNodeIds: [
              TEST_NODE_2,
            ],
            publicationActiveGateHandoffPendingReconcileCount:
              TEST_PENDING_ACK_COUNT,
            activeGateOwnerCohortState:
              PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
            activeGateOwnerCohortReasonCode:
              PUBLICATION_ACTIVE_GATE_HANDOFF_REASON
                .OWNER_RECONCILE_PENDING,
            activeGateOwnerCohortMissingPublishedNodeIds: [
              TEST_NODE_2,
            ],
            activeGateOwnerCohortMissingPublishedCount:
              TEST_PENDING_ACK_COUNT,
            activeGateOwnerCohortPendingRecoveryNodeIds:
              TEST_EMPTY_NODE_IDS,
            activeGateOwnerCohortPendingRecoveryCount:
              TEST_PUBLICATION_ACK_CLOSED_COUNT,
            activeGateOwnerCohortPendingReconcileNodeIds: [
              TEST_NODE_2,
            ],
            activeGateOwnerCohortPendingReconcileCount:
              TEST_PENDING_ACK_COUNT,
          },
        },
      },
    });
    const target =
      resolvePublicationActiveGateMembershipPublicationTarget({
        publicationActiveGateHandoff: selectedHandoff,
        publicationConvergence: {
          publicationEpoch: TEST_PUBLICATION_EPOCH,
          publishedActiveNodeIds: [TEST_NODE_1],
        },
      });

    t.match(
      selectedHandoff,
      {
        expectedNodeIds: [TEST_NODE_1, TEST_NODE_2],
        publishedActiveNodeIds: [TEST_NODE_1],
        missingPublishedNodeIds: [TEST_NODE_2],
        pendingRecoveryNodeIds: [...TEST_EMPTY_NODE_IDS],
        pendingReconcileNodeIds: [TEST_NODE_2],
        state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
        reasonCode:
          PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
        nextAction:
          PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
            .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
        runtimePromotionAllowed: TEST_RUNTIME_PROMOTION_DENIED,
      },
      'flattened owner cohort evidence should project the missing active node',
    );
    t.equal(
      target.reconcileRequired,
      true,
      'flattened owner cohort evidence should schedule membership publication reconcile',
    );
    t.same(
      target.publishedActiveNodeIds,
      [TEST_NODE_1, TEST_NODE_2],
      'flattened owner cohort target should publish the pending active node',
    );
    t.same(
      target.handoffContract.activeGateCatchupFence.targetNodeIds,
      [TEST_NODE_1, TEST_NODE_2],
      'catch-up fence should retain the full owner reconcile cohort',
    );
  });

test('publication active-gate selector preserves flattened pending recovery ids',
  async (t) => {
    const selectedHandoff = selectPublicationActiveGateHandoffContract({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: TEST_PUBLICATION_STATUS_OPEN,
        publishedActiveNodeIds: [TEST_NODE_1, TEST_NODE_2],
        missingPublishedNodeIds: [...TEST_EMPTY_NODE_IDS],
        activeGate: {
          progress: {
            publicationActiveGateHandoffState:
              PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
            publicationActiveGateHandoffReasonCode:
              PUBLICATION_ACTIVE_GATE_HANDOFF_REASON
                .OWNER_RECONCILE_PENDING,
            publicationActiveGateHandoffNextAction:
              PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.WAIT_OWNER_RECOVERY,
            publicationActiveGateHandoffRuntimePromotionAllowed:
              TEST_RUNTIME_PROMOTION_DENIED,
            publicationActiveGateHandoffPendingRecoveryNodeIds: [
              TEST_NODE_2,
            ],
            publicationActiveGateHandoffPendingRecoveryCount:
              TEST_PENDING_ACK_COUNT,
            publicationActiveGateHandoffPendingReconcileNodeIds:
              TEST_EMPTY_NODE_IDS,
            publicationActiveGateHandoffPendingReconcileCount:
              TEST_PUBLICATION_ACK_CLOSED_COUNT,
            selectedPublishedActiveNodeIds: [TEST_NODE_1, TEST_NODE_2],
            selectedMissingPublishedNodeIds: [...TEST_EMPTY_NODE_IDS],
          },
        },
      },
    });
    const target =
      resolvePublicationActiveGateMembershipPublicationTarget(
        selectedHandoff,
      );

    t.match(
      selectedHandoff,
      {
        nextAction:
          PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.WAIT_OWNER_RECOVERY,
        pendingRecoveryCount: TEST_PENDING_ACK_COUNT,
        pendingRecoveryNodeIds: [TEST_NODE_2],
        pendingReconcileCount: TEST_PUBLICATION_ACK_CLOSED_COUNT,
        pendingReconcileNodeIds: [...TEST_EMPTY_NODE_IDS],
        runtimePromotionAllowed: TEST_RUNTIME_PROMOTION_DENIED,
      },
      'flattened active-gate progress should preserve selected owner recovery debt',
    );
    t.same(
      target.pendingReconcileNodeIds,
      [...TEST_EMPTY_NODE_IDS],
      'owner recovery debt should not become membership reconcile debt',
    );
    t.equal(
      target.reconcileRequired,
      false,
      'owner recovery waits should not become membership publication writes',
    );
    t.same(
      target.pendingRecoveryNodeIds,
      [TEST_NODE_2],
      'owner recovery waits should remain visible on the owner target',
    );
    t.equal(
      hasPublicationActiveGateOwnerReconcileSignal(selectedHandoff),
      true,
      'owner recovery waits should still wake the selected owner command path',
    );
  });

test('publication active-gate selector preserves joined pending reconcile ids after publication ack closure',
  async (t) => {
    const selectedHandoff = selectPublicationActiveGateHandoffContract({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: TEST_PUBLICATION_STATUS_PUBLISHED,
        pendingAckNodeIds: [...TEST_EMPTY_NODE_IDS],
        pendingAckCount: TEST_PUBLICATION_ACK_CLOSED_COUNT,
        publishedActiveNodeIds: [TEST_NODE_1],
        missingPublishedNodeIds: [
          TEST_NODE_2,
          TEST_NODE_3,
          TEST_NODE_4,
          TEST_NODE_5,
        ],
        activeGate: {
          progress: {
            publicationActiveGateHandoffState:
              PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
            publicationActiveGateHandoffReasonCode:
              PUBLICATION_ACTIVE_GATE_HANDOFF_REASON
                .OWNER_RECONCILE_PENDING,
            publicationActiveGateHandoffNextAction:
              PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
                .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
            publicationActiveGateHandoffRuntimePromotionAllowed:
              TEST_RUNTIME_PROMOTION_DENIED,
            publicationActiveGateHandoffPendingReconcileNodeIds:
              TEST_JOINED_PENDING_RECONCILE_NODE_IDS,
            publicationActiveGateHandoffPendingReconcileCount:
              TEST_JOINED_PENDING_RECONCILE_COUNT,
          },
        },
      },
    });
    const target =
      resolvePublicationActiveGateMembershipPublicationTarget(
        selectedHandoff,
      );

    t.same(
      target.publishedActiveNodeIds,
      [
        TEST_NODE_1,
        TEST_NODE_2,
        TEST_NODE_3,
        TEST_NODE_4,
        TEST_NODE_5,
      ],
      'joined active-gate progress should publish the full selected missing cohort',
    );
    t.same(
      target.pendingReconcileNodeIds,
      [TEST_NODE_2, TEST_NODE_3],
      'joined active-gate progress should preserve only the selected pending reconcile nodes',
    );
  });

test('publication active-gate selector prefers drained explicit handoff over stale flattened progress',
  async (t) => {
    const drainedHandoff = {
      state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.COMPLETE,
      reasonCode: PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.COMPLETE,
      nextAction:
        PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.ADMIT_ACTIVE_GATE,
      runtimePromotionAllowed: true,
      expectedNodeIds: [...TEST_SELECTED_HANDOFF_EXPECTED_NODE_IDS],
      publishedActiveNodeIds: [...TEST_SELECTED_HANDOFF_EXPECTED_NODE_IDS],
      pendingReconcileNodeIds: [...TEST_EMPTY_NODE_IDS],
      pendingReconcileCount: TEST_PUBLICATION_ACK_CLOSED_COUNT,
    };
    const selectedHandoff = selectPublicationActiveGateHandoffContract({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: TEST_PUBLICATION_STATUS_PUBLISHED,
        publicationActiveGateHandoff: drainedHandoff,
        publishedActiveNodeIds: [...TEST_SELECTED_HANDOFF_EXPECTED_NODE_IDS],
        missingPublishedNodeIds: [...TEST_EMPTY_NODE_IDS],
        activeGate: {
          progress: {
            publicationActiveGateHandoffState:
              PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
            publicationActiveGateHandoffReasonCode:
              PUBLICATION_ACTIVE_GATE_HANDOFF_REASON
                .OWNER_RECONCILE_PENDING,
            publicationActiveGateHandoffNextAction:
              PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
                .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
            publicationActiveGateHandoffRuntimePromotionAllowed:
              TEST_RUNTIME_PROMOTION_DENIED,
            publicationActiveGateHandoffPendingReconcileNodeIds:
              TEST_JOINED_PENDING_RECONCILE_NODE_IDS,
            publicationActiveGateHandoffPendingReconcileCount:
              TEST_JOINED_PENDING_RECONCILE_COUNT,
          },
        },
      },
    });
    const target =
      resolvePublicationActiveGateMembershipPublicationTarget(
        selectedHandoff,
      );

    t.match(
      selectedHandoff,
      {
        state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.COMPLETE,
        reasonCode: PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.COMPLETE,
        nextAction:
          PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.ADMIT_ACTIVE_GATE,
        runtimePromotionAllowed: true,
      },
      'drained explicit handoff should outrank stale flattened pending progress',
    );
    t.equal(
      hasPublicationActiveGateOwnerReconcileSignal(selectedHandoff),
      false,
      'drained explicit handoff should clear the owner reconcile signal',
    );
    t.equal(
      target.reconcileRequired,
      false,
      'drained explicit handoff should not schedule another membership publication reconcile',
    );
  });

test('publication active-gate handoff keeps recovery-pending nodes out of reconcile',
  async (t) => {
    const contract = buildPublicationActiveGateHandoffContract({
      activeNodeViews: {
        effectiveActiveNodeIds: [TEST_NODE_1, TEST_NODE_2],
        publishedActiveNodeIds: [TEST_NODE_1],
      },
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publishedActiveNodeIds: [TEST_NODE_1],
        missingPublishedNodeIds: [TEST_NODE_2],
      },
      readinessByNodeId: {
        [TEST_NODE_2]: {
          reasonCodes: [
            CONTROL_PLANE_READINESS_REASON
              .PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
          ],
        },
      },
    });

    t.match(contract, {
      pendingRecoveryNodeIds: [TEST_NODE_2],
      pendingReconcileNodeIds: [],
      runtimePromotionAllowed: false,
      state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
      reasonCode:
        PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
      nextAction:
        PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.WAIT_OWNER_RECOVERY,
    });
  });

test('publication active-gate handoff projection preserves the legacy owner cohort surface',
  async (t) => {
    const contract = buildPublicationActiveGateHandoffContract({
      activeNodeViews: {
        effectiveActiveNodeIds: [TEST_NODE_1, TEST_NODE_2],
        publishedActiveNodeIds: [TEST_NODE_1],
      },
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publishedActiveNodeIds: [TEST_NODE_1],
        missingPublishedNodeIds: [TEST_NODE_2],
      },
    });
    const ownerCohort = projectPublicationActiveGateHandoffToOwnerCohort(
      contract,
      {
        readyLeaseNodeIds: [TEST_NODE_1],
        activeGateBudget: TEST_ACTIVE_GATE_BUDGET,
      },
    );

    t.match(ownerCohort, {
      state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
      reasonCode:
        PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
      topologyEpoch: TEST_PUBLICATION_EPOCH,
      readyLeaseNodeIds: [TEST_NODE_1],
      pendingReconcileNodeIds: [TEST_NODE_2],
      activeGateBudget: TEST_ACTIVE_GATE_BUDGET,
    });
    t.equal(
      hasPublicationActiveGateOwnerReconcileSignal({
        publicationActiveGateHandoff: contract,
      }),
      true,
    );
  });

test('publication active-gate handoff completes only when durable publication covers the expected cohort',
  async (t) => {
    const contract = buildPublicationActiveGateHandoffContract({
      expectedNodeIds: [TEST_NODE_1, TEST_NODE_2],
      activeNodeViews: {
        effectiveActiveNodeIds: [TEST_NODE_1, TEST_NODE_2],
        snapshotCoverageRevision: TEST_SNAPSHOT_COVERAGE_REVISION,
      },
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        status: TEST_PUBLICATION_STATUS_PUBLISHED,
        publicationRevision: TEST_PUBLICATION_REVISION,
        publishedActiveNodeIds: [TEST_NODE_1, TEST_NODE_2],
        missingPublishedNodeIds: [],
      },
    });

    t.match(contract, {
      missingPublishedNodeIds: [],
      pendingReconcileNodeIds: [],
      runtimePromotionAllowed: true,
      state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.COMPLETE,
      reasonCode: PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.COMPLETE,
      nextAction:
        PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.ADMIT_ACTIVE_GATE,
      activeGateCatchupFence: {
        state:
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.PROMOTION_ALLOWED,
        catchupState:
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.CATCHUP_READY,
        promotionState:
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.PROMOTION_ALLOWED,
        durablePublication: {
          publicationEpoch: TEST_PUBLICATION_EPOCH,
          publicationRevision: TEST_PUBLICATION_REVISION,
        },
        snapshotCoverage: {
          revision: TEST_SNAPSHOT_COVERAGE_REVISION,
          coveredNodeCount: 2,
        },
        missingProofReasons: [],
        nextLegalAction:
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION
            .PROMOTE_ACTIVE_GATE,
        promotionAllowed: true,
      },
    });
  });

test('publication active-gate handoff denies promotion when the publication epoch is unobserved even though the catch-up fence is satisfied',
  async (t) => {
    const contract = buildPublicationActiveGateHandoffContract({
      expectedNodeIds: [TEST_NODE_1, TEST_NODE_2],
      activeNodeViews: {
        effectiveActiveNodeIds: [TEST_NODE_1, TEST_NODE_2],
        snapshotCoverageRevision: TEST_SNAPSHOT_COVERAGE_REVISION,
      },
      publicationConvergence: {
        status: TEST_PUBLICATION_STATUS_PUBLISHED,
        publicationRevision: TEST_PUBLICATION_REVISION,
        publishedActiveNodeIds: [TEST_NODE_1, TEST_NODE_2],
        missingPublishedNodeIds: [],
      },
    });

    t.match(contract, {
      runtimePromotionAllowed: false,
      state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.DEGRADED,
      reasonCode:
        PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.PUBLICATION_EPOCH_UNOBSERVED,
      nextAction:
        PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.OBSERVE_OWNER_HANDOFF,
      activeGateCatchupFence: {
        promotionAllowed: true,
      },
    },
    'an unobserved publication epoch must block promotion through the freshness gate, not the coverage fence');
    t.ok(
      contract.retryAfterMs > 0,
      'freshness-denied promotion must schedule a positive re-observation wake',
    );
    t.match(
      contract[TEST_CROSS_OWNER_HANDOFF_CONTRACT_FIELD]
        .freshnessRevisionRequirement,
      {
        revisionObserved: false,
        requirementSatisfied: false,
      },
      'the cross-owner contract should report the revision requirement unsatisfied',
    );
  });


test('publication active-gate catch-up fence keeps seed-only publication pending while active targets are present',
  async (t) => {
    const contract = buildPublicationActiveGateHandoffContract({
      activeNodeViews: {
        effectiveActiveNodeIds: [TEST_NODE_1, TEST_NODE_2],
        snapshotCoverageRevision: TEST_SNAPSHOT_COVERAGE_REVISION,
      },
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        status: TEST_PUBLICATION_STATUS_PUBLISHED,
        publicationRevision: TEST_PUBLICATION_REVISION,
        publishedActiveNodeIds: [TEST_NODE_1],
      },
    });

    t.match(contract.activeGateCatchupFence, {
      state: PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.CATCHUP_PENDING,
      targetNodeIds: [TEST_NODE_1, TEST_NODE_2],
      presence: {
        complete: true,
        presentNodeIds: [TEST_NODE_1, TEST_NODE_2],
      },
      durablePublication: {
        nodeIds: [TEST_NODE_1],
        missingNodeIds: [TEST_NODE_2],
      },
      missingProofReasons: [
        PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON
          .DURABLE_PUBLICATION_INCOMPLETE,
      ],
      nextLegalAction:
        PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION
          .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
      promotionAllowed: false,
    });
    t.equal(contract.runtimePromotionAllowed, false);
  });

test('publication active-gate catch-up fence denies durable publication without snapshot coverage',
  async (t) => {
    const contract = buildPublicationActiveGateHandoffContract({
      expectedNodeIds: [TEST_NODE_1, TEST_NODE_2],
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        status: TEST_PUBLICATION_STATUS_PUBLISHED,
        publicationRevision: TEST_PUBLICATION_REVISION,
        publishedActiveNodeIds: [TEST_NODE_1, TEST_NODE_2],
        missingPublishedNodeIds: [],
      },
    });

    t.match(contract, {
      runtimePromotionAllowed: false,
      state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.DEGRADED,
      reasonCode:
        PUBLICATION_ACTIVE_GATE_HANDOFF_REASON
          .PUBLISHED_ACTIVE_COVERAGE_INCOMPLETE,
      nextAction:
        PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.OBSERVE_OWNER_HANDOFF,
      activeGateCatchupFence: {
        state:
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.PROMOTION_DENIED,
        catchupState:
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.CATCHUP_READY,
        promotionState:
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.PROMOTION_DENIED,
        targetNodeIds: [TEST_NODE_1, TEST_NODE_2],
        durablePublication: {
          publicationEpoch: TEST_PUBLICATION_EPOCH,
          publicationRevision: TEST_PUBLICATION_REVISION,
          covered: true,
        },
        snapshotCoverage: {
          state:
            TEST_SNAPSHOT_COVERAGE_UNAVAILABLE,
          covered: false,
        },
        missingProofReasons: [
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON
            .SNAPSHOT_COVERAGE_UNAVAILABLE,
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON
            .TARGET_PRESENCE_INCOMPLETE,
        ],
        nextLegalAction:
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION
            .OBSERVE_SNAPSHOT_COVERAGE,
        promotionAllowed: false,
      },
    });
  });

test('publication active-gate catch-up fence never promotes stale snapshot coverage',
  async (t) => {
    const contract = buildPublicationActiveGateHandoffContract({
      expectedNodeIds: [TEST_NODE_1, TEST_NODE_2],
      activeNodeViews: {
        effectiveActiveNodeIds: [TEST_NODE_1, TEST_NODE_2],
        snapshotCoverageRevision: TEST_SNAPSHOT_COVERAGE_REVISION,
        snapshotRevisionState: TEST_STALE_SNAPSHOT_REVISION_STATE,
      },
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        status: TEST_PUBLICATION_STATUS_PUBLISHED,
        publicationRevision: TEST_PUBLICATION_REVISION,
        publishedActiveNodeIds: [TEST_NODE_1, TEST_NODE_2],
        missingPublishedNodeIds: [],
      },
    });

    t.match(contract, {
      runtimePromotionAllowed: false,
      activeGateCatchupFence: {
        state:
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.CATCHUP_BLOCKED,
        catchupState:
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.CATCHUP_READY,
        promotionState:
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.PROMOTION_DENIED,
        snapshotCoverage: {
          stale: true,
          revision: TEST_SNAPSHOT_COVERAGE_REVISION,
        },
        missingProofReasons: [
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON
            .SNAPSHOT_COVERAGE_STALE,
        ],
        nextLegalAction:
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION
            .REFRESH_SNAPSHOT_COVERAGE,
        promotionAllowed: false,
      },
    });
  });

test('publication active-gate handoff re-drives an OPEN publication awaiting recovery-eligible acks (CL-001)',
  async (t) => {
    // No published-set deficit (every expected node is published), but the
    // owner-driven path reports a still-pending recovery-eligible ack. The
    // contract must route a reconcile so the OPEN publication can CLOSE, rather
    // than falling through to COMPLETE/ADMIT.
    const contract = buildPublicationActiveGateHandoffContract({
      nodeRows: [{node_id: TEST_NODE_1}, {node_id: TEST_NODE_2}],
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publishedActiveNodeIds: [TEST_NODE_1, TEST_NODE_2],
      },
      ownerAckCompletionPendingNodeIds: [TEST_NODE_2],
    });
    t.match(contract, {
      missingPublishedNodeIds: [],
      state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
      reasonCode:
        PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
      nextAction:
        PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
          .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
      runtimePromotionAllowed: false,
    });
  });

test('publication active-gate handoff leaves the served path unchanged when no ack-completion signal is supplied (CL-001 scoping)',
  async (t) => {
    // The served/active-gate snapshot path does not populate
    // ownerAckCompletionPendingNodeIds, so the new rule must NOT fire there.
    const contract = buildPublicationActiveGateHandoffContract({
      nodeRows: [{node_id: TEST_NODE_1}, {node_id: TEST_NODE_2}],
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publishedActiveNodeIds: [TEST_NODE_1, TEST_NODE_2],
      },
    });
    t.not(
      contract.nextAction,
      PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
        .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
      'no ack-completion signal -> no owner reconcile requested',
    );
  });
