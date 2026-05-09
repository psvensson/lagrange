export function registerPriorityRecoverySnapshotCore05Tests(context) {
  const {
    buildPriorityRecoveryDecisionSnapshot,
    buildPriorityRecoveryObservationSnapshot,
    PRIORITY_RECOVERY_ACTIVE_TARGET_COMPLETION_MESSAGE,
    PRIORITY_RECOVERY_ACTIVE_TARGET_NOT_MISSING_OPERATION_MESSAGE,
    PRIORITY_RECOVERY_ACTIVE_TARGET_PROGRESS_MESSAGE,
    PRIORITY_RECOVERY_ACTIVE_TARGET_SEMANTIC_MESSAGE,
    PRIORITY_RECOVERY_ACTIVE_TARGET_SPREAD_WITNESS_MESSAGE,
    PRIORITY_RECOVERY_ACTUATION_STATE_ACTION_REQUIRED,
    PRIORITY_RECOVERY_ACTUATION_STATE_TERMINAL_COMPLETED,
    PRIORITY_RECOVERY_ACTUATION_STATE_TRANSITION_DEFERRED,
    PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS,
    PRIORITY_RECOVERY_CLOSURE_RECORD_ID,
    PRIORITY_RECOVERY_CLOSURE_WITNESS_CLASS,
    PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE,
    PRIORITY_RECOVERY_COMPLETION_STATE,
    PRIORITY_RECOVERY_EMPTY_COUNT,
    PRIORITY_RECOVERY_FAILED_REPLACE_ACTIVE_TARGET_TEST_NAME,
    PRIORITY_RECOVERY_NODE_ID_A,
    PRIORITY_RECOVERY_NODE_ID_B,
    PRIORITY_RECOVERY_NODE_ID_C,
    PRIORITY_RECOVERY_OPERATION_COMPLETED_AT_MS,
    PRIORITY_RECOVERY_OPERATION_ID_FAILED_REPLACE_ACTIVE_TARGET,
    PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
    PRIORITY_RECOVERY_OPERATION_UPDATED_AT_MS,
    PRIORITY_RECOVERY_PRESSURE_STATE_BACKPRESSURED,
    PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
    PRIORITY_RECOVERY_PRESSURE_STATE_WRITE_BACKLOG,
    PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
    PRIORITY_RECOVERY_PROGRESS_ACTION_NONE,
    PRIORITY_RECOVERY_PROGRESS_BOUNDARY_NONE,
    PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
    PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_BLOCKED,
    PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
    PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_READY,
    PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_PROCEED,
    PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_RETRY,
    PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_STOP,
    PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
    PRIORITY_RECOVERY_PROGRESS_OWNER_NONE,
    PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
    PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
    PRIORITY_RECOVERY_PROGRESS_WAIT_NONE,
    PRIORITY_RECOVERY_PROGRESS_WAIT_RETRY_SCHEDULED,
    PRIORITY_RECOVERY_PROGRESS_WAIT_STALLED,
    PRIORITY_RECOVERY_REASON_OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE,
    PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
    PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
    PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
    PRIORITY_RECOVERY_SINGLE_EMERGENCY_BUDGET_LIMIT,
    PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
    PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
    PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_STATUS_FAILED,
    PRIORITY_RECOVERY_TARGET_VISIBILITY_ACTIVE_OPERATIONAL,
    PRIORITY_RECOVERY_TERMINAL_REPLACE_OPERATION_CONTEXT,
    PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
    PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
    PRIORITY_RECOVERY_WORKFLOW_STEP_FAILED,
    PUBLICATION_PRIORITY_PARTITION_ID,
    test,
  } = context;

  test('priority recovery observation snapshots summarize the current partition state from the latest snapshot instead of historical unions',
    async (t) => {
      const observationSnapshot = buildPriorityRecoveryObservationSnapshot({
        priorityRecoveryDecisionSnapshots: {
          capturedAt: 3000,
          publicationEpoch: 9,
          priorityPartitionSummary: {
            satisfied: true,
            requiredDistinctNodeCount: 3,
            readyEligibleNodeCount: 3,
            totalPriorityPartitionCount: 1,
            missingPartitionIds: [],
            blockedPartitions: [],
          },
          snapshots: [{
            partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
            semanticStateId:
              PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
            blockerReasons: [
              PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS,
            ],
            planner: {
              ready: false,
              requiredDistinctNodeCount: 3,
              spreadGap: 1,
            },
            completion: {
              state: PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
            },
            observation: {
              workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
              visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
              convergenceState: 'converging',
              provenance: {
                capturedAt: 1000,
              },
            },
          }, {
            partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
            semanticStateId:
              PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
            blockerReasons: [],
            planner: {
              ready: true,
              requiredDistinctNodeCount: 3,
              spreadGap: 0,
            },
            completion: {
              state:
              PRIORITY_RECOVERY_COMPLETION_STATE
                .SPREAD_SATISFIED_IN_FLIGHT,
            },
            observation: {
              workflowState: 'remove_phase',
              visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
              convergenceState: 'converged',
              provenance: {
                capturedAt: 2000,
              },
            },
          }],
        },
      });

      t.same(
        observationSnapshot.priorityRecoverySemanticStateIds,
        [],
        'historical blocked semantic states should not remain unresolved once the latest snapshot is spread-satisfied',
      );
      t.same(
        observationSnapshot.priorityRecoveryBlockedPartitionIds,
        [],
        'current blocked partition ids should follow the latest partition snapshot instead of historical unions',
      );
      t.same(
        observationSnapshot.priorityRecoveryPartitionIdsBySemanticState
          .spread_satisfied_in_flight,
        [PUBLICATION_PRIORITY_PARTITION_ID],
        'the latest spread-satisfied snapshot should own the current semantic-state summary',
      );
      t.same(
        observationSnapshot.priorityRecoveryPartitionIdsBySemanticState
          .recovering_in_flight,
        [],
        'the old recovering-in-flight snapshot should remain history only',
      );
      t.equal(
        observationSnapshot.priorityRecoveryPartitionSnapshots[0].semanticStateId,
        PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
        'partition witnesses should align with the current spread-satisfied snapshot',
      );
    });

  test('priority recovery observation snapshots scope the current summary to tracked priority partitions',
    async (t) => {
      const nonPriorityPartitionId =
      'tbl-b932fa03-3835-4a50-87b4-bd158daed0ea-p1';
      const observationSnapshot = buildPriorityRecoveryObservationSnapshot({
        priorityRecoveryDecisionSnapshots: {
          capturedAt: 3000,
          publicationEpoch: 9,
          priorityPartitionSummary: {
            satisfied: true,
            requiredDistinctNodeCount: 3,
            readyEligibleNodeCount: 3,
            totalPriorityPartitionCount: 1,
            missingPartitionIds: [],
            blockedPartitions: [],
          },
          partitionIdsBySemanticState: {
            converged: [],
            spread_satisfied_in_flight: [PUBLICATION_PRIORITY_PARTITION_ID],
            needs_operation: [],
            operation_stalled: [nonPriorityPartitionId],
            learner_promotion_blocked: [],
            coordination_mismatch: [],
            recovering_in_flight: [],
            blocked_unclassified: [],
          },
          snapshots: [{
            partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
            blockerReasons: [],
            planner: {
              ready: true,
              requiredDistinctNodeCount: 3,
              spreadGap: 0,
            },
            completion: {
              state:
              PRIORITY_RECOVERY_COMPLETION_STATE
                .SPREAD_SATISFIED_IN_FLIGHT,
            },
            observation: {
              workflowState: 'remove_phase',
              visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
              convergenceState: 'converged',
              provenance: {
                capturedAt: 2000,
              },
            },
          }, {
            partitionId: nonPriorityPartitionId,
            blockerReasons: [
              PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS,
            ],
            planner: {
              ready: false,
            },
            completion: {
              state: 'operation_stalled',
            },
            observation: {
              workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
              visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
              convergenceState: 'converging',
              provenance: {
                capturedAt: 3000,
              },
            },
          }],
        },
      });

      t.same(
        observationSnapshot.priorityRecoveryProgressClassIds,
        [],
        'non-priority workflow blockers must not survive as current priority-recovery progress classes',
      );
      t.same(
        observationSnapshot.priorityRecoverySemanticStateIds,
        [],
        'non-priority semantic blockers must not survive as current priority-recovery semantic states',
      );
      t.same(
        observationSnapshot.priorityRecoveryBlockedPartitionIds,
        [],
        'non-priority stalled partitions must not remain current priority-recovery blocked partitions',
      );
      t.same(
        observationSnapshot.priorityRecoveryPartitionIdsBySemanticState
          .spread_satisfied_in_flight,
        [PUBLICATION_PRIORITY_PARTITION_ID],
        'tracked priority partitions should continue to own the current semantic-state summary',
      );
      t.same(
        observationSnapshot.priorityRecoveryPartitionIdsBySemanticState
          .operation_stalled,
        [],
        'non-priority partitions should be cut out of the current priority-recovery semantic-state summary',
      );
      t.same(
        observationSnapshot.priorityRecoveryPartitionWitnesses.map(
          (partitionWitness) => partitionWitness.partitionId,
        ),
        [PUBLICATION_PRIORITY_PARTITION_ID],
        'partition witnesses should follow the tracked priority-recovery scope',
      );
    });

  test('priority recovery observation snapshots do not invent semantic state when the decision-layer semantic-state contract is present but omits the partition',
    async (t) => {
      const observationSnapshot = buildPriorityRecoveryObservationSnapshot({
        priorityRecoveryDecisionSnapshots: {
          capturedAt: 2000,
          publicationEpoch: 9,
          partitionIdsBySemanticState: {
            converged: [],
            spread_satisfied_in_flight: [],
            needs_operation: [],
            operation_stalled: [],
            learner_promotion_blocked: [],
            coordination_mismatch: [],
            recovering_in_flight: [],
            blocked_unclassified: [],
          },
          snapshots: [{
            partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
            blockerReasons: [
              PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS,
            ],
            planner: {
              ready: false,
            },
            spreadCompletion: {
              satisfied: false,
            },
            observation: {
              workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
              visibilityState:
              PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
              convergenceState: 'converging',
              provenance: {
                capturedAt: 2000,
              },
            },
            progress: {
              contractState:
              PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_BLOCKED,
              nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_STOP,
              currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
              nextRequiredAction:
              PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
              blockingBoundary:
              PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
              waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_STALLED,
              evidenceSourceIds: [],
            },
            coordinator: {
              operationCount: 1,
            },
          }],
        },
      });
      const partitionSnapshot =
      observationSnapshot.priorityRecoveryPartitionSnapshots[0];

      t.equal(
        partitionSnapshot.semanticStateId,
        null,
        'observation snapshots should leave semantic state unset instead of re-inferring it when the decision layer already published the semantic-state contract',
      );
      t.same(
        observationSnapshot.priorityRecoveryPartitionIdsBySemanticState
          .operation_stalled,
        [],
        'the semantic-state index should remain authoritative rather than being backfilled from local inference',
      );
      t.same(
        partitionSnapshot.progressClassIds,
        [PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS],
        'blocked progress evidence should remain available even when semantic state is intentionally unset',
      );
    });

  test('priority recovery observation snapshots prefer the closure witness over stale publication spread metadata',
    async (t) => {
      const OBSERVATION_STALE_REASON_CODE = 'priority_partitions_not_spread';
      const OBSERVATION_RECOVERY_PROTOCOL_STATE = 'priority_spread_pending';
      const stalePriorityPartitionSummary = {
        satisfied: false,
        requiredDistinctNodeCount: 3,
        readyEligibleNodeCount: 3,
        totalPriorityPartitionCount: 1,
        missingPartitionIds: [PUBLICATION_PRIORITY_PARTITION_ID],
        blockedPartitions: [{
          partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
          requiredDistinctNodeCount: 3,
          readyDistinctNodeCount: 2,
          spreadGap: 1,
        }],
        blockedPartitionCount: 1,
        largestSpreadGap: 1,
        totalSpreadGap: 1,
      };
      const decisionSnapshots = {
        capturedAt: 2000,
        publicationEpoch: 9,
        priorityPartitionSummary: stalePriorityPartitionSummary,
        partitionIdsBySemanticState: {
          converged: [],
          spread_satisfied_in_flight: [PUBLICATION_PRIORITY_PARTITION_ID],
          needs_operation: [],
          operation_stalled: [],
          learner_promotion_blocked: [],
          coordination_mismatch: [],
          recovering_in_flight: [],
          blocked_unclassified: [],
        },
        snapshots: [{
          partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
          publication: {
            concreteEligibleNodeIds: [
              PRIORITY_RECOVERY_NODE_ID_A,
              PRIORITY_RECOVERY_NODE_ID_B,
              PRIORITY_RECOVERY_NODE_ID_C,
            ],
          },
        }],
      };
      const stalePublicationConvergenceGate = {
        state: 'priority_spread_pending',
        ready: false,
        active: true,
        publicationEpoch: 9,
        publicationStatus: 'PUBLISHED',
        recoveryProtocolState: OBSERVATION_RECOVERY_PROTOCOL_STATE,
        reasonCodes: [OBSERVATION_STALE_REASON_CODE],
        priorityPartitionSummary: stalePriorityPartitionSummary,
        pendingAckNodeIds: [],
        missingPublishedNodeIds: [],
        publicationPending: false,
        prioritySpreadPending: true,
      };
      const observationSnapshot = buildPriorityRecoveryObservationSnapshot({
        publicationConvergence: {
          publicationEpoch: 9,
          publicationStatus: 'PUBLISHED',
          recoveryProtocolState: OBSERVATION_RECOVERY_PROTOCOL_STATE,
          publishedActiveNodeIds: [
            PRIORITY_RECOVERY_NODE_ID_A,
            PRIORITY_RECOVERY_NODE_ID_B,
            PRIORITY_RECOVERY_NODE_ID_C,
          ],
          pendingAckNodeIds: [],
          priorityRecoveryReasonCodes: [OBSERVATION_STALE_REASON_CODE],
          priorityPartitionSummary: stalePriorityPartitionSummary,
        },
        publicationConvergenceGate: stalePublicationConvergenceGate,
        priorityRecoveryDecisionSnapshots: decisionSnapshots,
      });

      t.equal(
        observationSnapshot.prioritySpreadPending,
        false,
        'a satisfied closure witness should keep stale spread metadata from reopening the observation gate',
      );
      t.equal(
        observationSnapshot.priorityRecoveryClosureState,
        PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE.SATISFIED_STALE_PUBLICATION,
      );
      t.equal(
        observationSnapshot.closureRecordId,
        PRIORITY_RECOVERY_CLOSURE_RECORD_ID.PRIORITY_SPREAD,
      );
      t.equal(
        observationSnapshot.closureWitnessClass,
        PRIORITY_RECOVERY_CLOSURE_WITNESS_CLASS
          .PUBLICATION_CONVERGED_PRIORITY_SPREAD_PENDING,
      );
      t.same(
        observationSnapshot.priorityRecoveryReasonCodes,
        [],
        'stale publication reason codes should be dropped once the closure witness says spread is satisfied',
      );
      t.same(
        observationSnapshot.publicationConvergenceGateReasons,
        [],
        'the synthesized observation gate should stay ready after applying the closure witness',
      );
      t.match(observationSnapshot.priorityPartitionSummary, {
        satisfied: true,
        blockedPartitionCount: 0,
        largestSpreadGap: 0,
        totalSpreadGap: 0,
      });
      t.same(observationSnapshot.priorityRecoveryBlockedPartitionIds, []);
      t.equal(observationSnapshot.priorityRecoveryBlockedPartitionCount, 0);
      t.same(observationSnapshot.priorityRecoveryUnresolvedPartitionIds, []);
      t.equal(observationSnapshot.priorityRecoveryUnresolvedPartitionCount, 0);
      t.same(
        observationSnapshot.priorityRecoveryPartitionIdsBySemanticState
          .spread_satisfied_in_flight,
        [PUBLICATION_PRIORITY_PARTITION_ID],
      );
    });

  test('priority recovery terminal follow-up stays actionable when logs-table backlog does not hard-block critical recovery',
    async (t) => {
      const snapshot = buildPriorityRecoveryDecisionSnapshot({
        partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
        publicationEpoch: 9,
        priorityPartitionSummary: {
          blockedPartitions: [{
            partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
            requiredDistinctNodeCount: 3,
            readyDistinctNodeCount: 2,
            spreadGap: 1,
          }],
        },
        admission: {
          effectiveEligibleNodeIds: [
            PRIORITY_RECOVERY_NODE_ID_B,
            PRIORITY_RECOVERY_NODE_ID_C,
          ],
          effectiveEligibleNodeCount: 2,
          ineligibleNodes: [],
        },
        logsTable: {
          pendingWrites: 9,
          pendingWriteGrowthCount: 3,
        },
        operationContexts: [PRIORITY_RECOVERY_TERMINAL_REPLACE_OPERATION_CONTEXT],
      });

      t.match(snapshot?.conditions, {
        pressure: {
          pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_WRITE_BACKLOG,
          blocksCriticalRecoveryActuation: false,
        },
      });
      t.match(snapshot?.actuation, {
        state: PRIORITY_RECOVERY_ACTUATION_STATE_ACTION_REQUIRED,
        owner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
        lastProgressAtMs: 1500,
        timeoutReconcileDue: false,
      });
      t.match(snapshot?.progress, {
        contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
        nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
        nextRequiredAction:
        PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
        blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
        waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
        lastProgressAtMs: 1500,
      });
    });

  test('priority recovery terminal follow-up stays retry-scheduled instead of completed when the next operation already has a retry budget',
    async (t) => {
      const snapshot = buildPriorityRecoveryDecisionSnapshot({
        partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
        publicationEpoch: 9,
        priorityPartitionSummary: {
          blockedPartitions: [{
            partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
            requiredDistinctNodeCount: 3,
            readyDistinctNodeCount: 2,
            spreadGap: 1,
          }],
        },
        admission: {
          effectiveEligibleNodeIds: [
            PRIORITY_RECOVERY_NODE_ID_B,
            PRIORITY_RECOVERY_NODE_ID_C,
          ],
          effectiveEligibleNodeCount: 2,
          ineligibleNodes: [],
        },
        completion: {
          state: 'blocked',
          reasonCode: 'blocked',
          retryAfterMs: 2500,
          activeOperationCount: 0,
          temporaryOverflowVoterBudget: 0,
          allowTemporaryOverflowPromotion: false,
          blocked: true,
        },
        operationContexts: [PRIORITY_RECOVERY_TERMINAL_REPLACE_OPERATION_CONTEXT],
      });

      t.match(snapshot?.actuation, {
        state: PRIORITY_RECOVERY_ACTUATION_STATE_TRANSITION_DEFERRED,
        owner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
        lastProgressAtMs: 1500,
        retryAfterMs: 2500,
        timeoutReconcileDue: false,
      });
      t.match(snapshot?.progress, {
        contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
        nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_RETRY,
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
        nextRequiredAction:
        PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
        blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
        waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_RETRY_SCHEDULED,
        lastProgressAtMs: 1500,
        retryAfterMs: 2500,
      });
    });

  test('priority recovery snapshots never report completed actuation while a new recovery action is still required',
    async (t) => {
      const snapshot = buildPriorityRecoveryDecisionSnapshot({
        partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
        publicationEpoch: 9,
        priorityPartitionSummary: {
          blockedPartitions: [{
            partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
            requiredDistinctNodeCount: 3,
            readyDistinctNodeCount: 2,
            spreadGap: 1,
          }],
        },
        admission: {
          effectiveEligibleNodeIds: [
            PRIORITY_RECOVERY_NODE_ID_B,
            PRIORITY_RECOVERY_NODE_ID_C,
          ],
          effectiveEligibleNodeCount: 2,
          ineligibleNodes: [],
        },
        operationContexts: [PRIORITY_RECOVERY_TERMINAL_REPLACE_OPERATION_CONTEXT],
      });

      t.notMatch(snapshot?.actuation, {
        state: PRIORITY_RECOVERY_ACTUATION_STATE_TERMINAL_COMPLETED,
      });
      t.equal(
        snapshot?.progress?.nextRequiredAction,
        PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
        'the shared decision contract should still require one follow-up recovery operation',
      );
    });

  test(PRIORITY_RECOVERY_FAILED_REPLACE_ACTIVE_TARGET_TEST_NAME,
    async (t) => {
      const failedReplaceActiveTargetOperation = {
        partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
        operationId: PRIORITY_RECOVERY_OPERATION_ID_FAILED_REPLACE_ACTIVE_TARGET,
        type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
        status: PRIORITY_RECOVERY_STATUS_FAILED,
        workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_FAILED,
        targetNodeId: PRIORITY_RECOVERY_NODE_ID_B,
        targetVisibilityState:
        PRIORITY_RECOVERY_TARGET_VISIBILITY_ACTIVE_OPERATIONAL,
        updatedAtMs: PRIORITY_RECOVERY_OPERATION_UPDATED_AT_MS,
        completedAtMs: PRIORITY_RECOVERY_OPERATION_COMPLETED_AT_MS,
        timelineLength:
        PRIORITY_RECOVERY_TERMINAL_REPLACE_OPERATION_CONTEXT.timelineLength,
        timelineStepCount:
        PRIORITY_RECOVERY_TERMINAL_REPLACE_OPERATION_CONTEXT
          .timelineStepCount,
        latestTimelineStep: PRIORITY_RECOVERY_WORKFLOW_STEP_FAILED,
        latestTimelineStatus: PRIORITY_RECOVERY_STATUS_FAILED,
        latestTimelineInFlight: false,
      };
      const snapshot = buildPriorityRecoveryDecisionSnapshot({
        partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
        publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        priorityPartitionSummary: {
          blockedPartitions: [{
            partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
            requiredDistinctNodeCount:
            PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            readyDistinctNodeCount:
            PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
            spreadGap: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
          }],
        },
        admission: {
          effectiveEligibleNodeIds: [
            PRIORITY_RECOVERY_NODE_ID_B,
            PRIORITY_RECOVERY_NODE_ID_C,
          ],
          effectiveEligibleNodeCount:
          PRIORITY_RECOVERY_SINGLE_EMERGENCY_BUDGET_LIMIT,
          ineligibleNodes: [],
        },
        operationContexts: [failedReplaceActiveTargetOperation],
      });

      t.same(
        snapshot?.blockerReasons,
        [],
        PRIORITY_RECOVERY_ACTIVE_TARGET_NOT_MISSING_OPERATION_MESSAGE,
      );
      t.match(
        snapshot?.spreadCompletion,
        {
          satisfied: true,
          reasonCode:
          PRIORITY_RECOVERY_REASON_OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE,
          satisfyingOperationIds: [
            PRIORITY_RECOVERY_OPERATION_ID_FAILED_REPLACE_ACTIVE_TARGET,
          ],
          satisfyingOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
          blockingOperationIds: [],
          blockingOperationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
        },
        PRIORITY_RECOVERY_ACTIVE_TARGET_SPREAD_WITNESS_MESSAGE,
      );
      t.equal(
        snapshot?.semanticState,
        PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
        PRIORITY_RECOVERY_ACTIVE_TARGET_SEMANTIC_MESSAGE,
      );
      t.equal(
        snapshot?.completion?.state,
        PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT,
        PRIORITY_RECOVERY_ACTIVE_TARGET_COMPLETION_MESSAGE,
      );
      t.match(
        snapshot?.progress,
        {
          contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_READY,
          nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_PROCEED,
          currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_NONE,
          nextRequiredAction: PRIORITY_RECOVERY_PROGRESS_ACTION_NONE,
          blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_NONE,
          waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_NONE,
        },
        PRIORITY_RECOVERY_ACTIVE_TARGET_PROGRESS_MESSAGE,
      );
    });

  test('priority recovery decision snapshot emits one actuation-required contract when spread is blocked with no operation',
    async (t) => {
      const snapshot = buildPriorityRecoveryDecisionSnapshot({
        partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
        priorityPartitionSummary: {
          blockedPartitions: [{
            partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
            requiredDistinctNodeCount: 3,
            readyDistinctNodeCount: 2,
            spreadGap: 1,
          }],
        },
        admission: {
          effectiveEligibleNodeIds: [PRIORITY_RECOVERY_NODE_ID_B],
          effectiveEligibleNodeCount: 1,
          ineligibleNodes: [],
        },
        operationContexts: [],
      });

      t.match(snapshot?.actuation, {
        state: PRIORITY_RECOVERY_ACTUATION_STATE_ACTION_REQUIRED,
        owner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
        operationCount: 0,
        timeoutReconcileDue: false,
      });
      t.match(snapshot?.conditions, {
        pressure: {
          pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
        },
      });
    });

  test('priority recovery decision snapshot keeps missing follow-up work actionable under logs-table backlog',
    async (t) => {
      const snapshot = buildPriorityRecoveryDecisionSnapshot({
        partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
        priorityPartitionSummary: {
          blockedPartitions: [{
            partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
            requiredDistinctNodeCount: 3,
            readyDistinctNodeCount: 2,
            spreadGap: 1,
          }],
        },
        admission: {
          effectiveEligibleNodeIds: [PRIORITY_RECOVERY_NODE_ID_B],
          effectiveEligibleNodeCount: 1,
          ineligibleNodes: [],
        },
        logsTable: {
          pendingWrites: 9,
          pendingWriteGrowthCount: 3,
        },
        operationContexts: [],
      });

      t.match(snapshot?.conditions, {
        pressure: {
          pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_WRITE_BACKLOG,
          blocksCriticalRecoveryActuation: false,
          pendingWrites: 9,
          pendingWriteGrowthCount: 3,
        },
      });
      t.match(snapshot?.actuation, {
        state: PRIORITY_RECOVERY_ACTUATION_STATE_ACTION_REQUIRED,
        owner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
        operationCount: 0,
        timeoutReconcileDue: false,
      });
      t.match(snapshot?.progress, {
        contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
        nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
        nextRequiredAction:
        PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
        blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
        waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
      });
    });

  test('priority recovery decision snapshot defers missing follow-up actuation only under hard control-plane pressure',
    async (t) => {
      const snapshot = buildPriorityRecoveryDecisionSnapshot({
        partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
        priorityPartitionSummary: {
          blockedPartitions: [{
            partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
            requiredDistinctNodeCount: 3,
            readyDistinctNodeCount: 2,
            spreadGap: 1,
          }],
        },
        admission: {
          effectiveEligibleNodeIds: [PRIORITY_RECOVERY_NODE_ID_B],
          effectiveEligibleNodeCount: 1,
          ineligibleNodes: [],
        },
        logsTable: {
          pendingWrites: 9,
          sharedPressureBackpressured: true,
        },
        operationContexts: [],
      });

      t.match(snapshot?.conditions, {
        pressure: {
          pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_BACKPRESSURED,
          blocksCriticalRecoveryActuation: true,
          pendingWrites: 9,
          sharedPressureBackpressured: true,
        },
      });
      t.match(snapshot?.actuation, {
        state: PRIORITY_RECOVERY_ACTUATION_STATE_TRANSITION_DEFERRED,
        owner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
        operationCount: 0,
        timeoutReconcileDue: false,
      });
      t.match(snapshot?.progress, {
        contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
        nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_RETRY,
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
        nextRequiredAction:
        PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
        blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
        waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_STALLED,
      });
    });

  test('priority recovery decision snapshot defers missing follow-up actuation under transport/query pressure',
    async (t) => {
      const snapshot = buildPriorityRecoveryDecisionSnapshot({
        partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
        priorityPartitionSummary: {
          blockedPartitions: [{
            partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
            requiredDistinctNodeCount: 3,
            readyDistinctNodeCount: 2,
            spreadGap: 1,
          }],
        },
        admission: {
          effectiveEligibleNodeIds: [PRIORITY_RECOVERY_NODE_ID_B],
          effectiveEligibleNodeCount: 1,
          ineligibleNodes: [],
        },
        logsTable: {
          pendingWrites: 9,
          transportPressureBackpressured: true,
          queryPressureBackpressured: true,
        },
        operationContexts: [],
      });

      t.match(snapshot?.conditions, {
        pressure: {
          pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_BACKPRESSURED,
          blocksCriticalRecoveryActuation: true,
          pendingWrites: 9,
          transportPressureBackpressured: true,
          queryPressureBackpressured: true,
        },
      });
      t.match(snapshot?.actuation, {
        state: PRIORITY_RECOVERY_ACTUATION_STATE_TRANSITION_DEFERRED,
        owner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
        operationCount: 0,
        timeoutReconcileDue: false,
      });
      t.match(snapshot?.progress, {
        contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
        nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_RETRY,
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
        nextRequiredAction:
        PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
        blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
        waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_STALLED,
      });
    });

  test('priority recovery decision snapshot classifies retryable missing follow-up work as transition deferred',
    async (t) => {
      const snapshot = buildPriorityRecoveryDecisionSnapshot({
        partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
        priorityPartitionSummary: {
          blockedPartitions: [{
            partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
            requiredDistinctNodeCount: 3,
            readyDistinctNodeCount: 2,
            spreadGap: 1,
          }],
        },
        admission: {
          effectiveEligibleNodeIds: [PRIORITY_RECOVERY_NODE_ID_B],
          effectiveEligibleNodeCount: 1,
          ineligibleNodes: [],
        },
        completion: {
          state: 'blocked',
          reasonCode: 'blocked',
          retryAfterMs: 2500,
          activeOperationCount: 0,
          temporaryOverflowVoterBudget: 0,
          allowTemporaryOverflowPromotion: false,
          blocked: true,
        },
        operationContexts: [],
      });

      t.match(snapshot?.conditions, {
        pressure: {
          pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
        },
      });
      t.match(snapshot?.actuation, {
        state: PRIORITY_RECOVERY_ACTUATION_STATE_TRANSITION_DEFERRED,
        owner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
        operationCount: 0,
        retryAfterMs: 2500,
        timeoutReconcileDue: false,
      });
      t.match(snapshot?.progress, {
        contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
        nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_RETRY,
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
        nextRequiredAction:
        PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
        blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
        waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_RETRY_SCHEDULED,
        retryAfterMs: 2500,
      });
    });
}
