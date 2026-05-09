export function registerPriorityRecoverySnapshotCore03Tests(context) {
  const {
    buildPriorityRecoveryDecisionSnapshot,
    buildPriorityRecoveryDecisionSnapshots,
    buildPriorityRecoveryObservationSnapshot,
    PRIORITY_RECOVERY_ABSENT_OPERATION,
    PRIORITY_RECOVERY_ACTUATION_STATE_ACTION_REQUIRED,
    PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
    PRIORITY_RECOVERY_ACTUATION_STATE_TRANSITION_DEFERRED,
    PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION,
    PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS,
    PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT,
    PRIORITY_RECOVERY_CREATING_TIMEOUT_MS,
    PRIORITY_RECOVERY_EMPTY_COUNT,
    PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
    PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
    PRIORITY_RECOVERY_FIRST_PARTITION_WITNESS_INDEX,
    PRIORITY_RECOVERY_NEWER_OPERATION_CREATED_AT_MS,
    PRIORITY_RECOVERY_NODE_ID_A,
    PRIORITY_RECOVERY_NODE_ID_B,
    PRIORITY_RECOVERY_NODE_ID_C,
    PRIORITY_RECOVERY_OPERATION_ID_CREATING_REPLACE_STALE,
    PRIORITY_RECOVERY_OPERATION_ID_OBJECT_ONLY,
    PRIORITY_RECOVERY_OPERATION_ID_SERIAL_LANE_ADD,
    PRIORITY_RECOVERY_OPERATION_ID_TARGET_SERVICE_PROGRESS,
    PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
    PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
    PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
    PRIORITY_RECOVERY_PROGRESS_ACTION_ADVANCE_EXISTING_OPERATION,
    PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
    PRIORITY_RECOVERY_PROGRESS_ACTION_OBSERVE_VISIBILITY,
    PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
    PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
    PRIORITY_RECOVERY_PROGRESS_BOUNDARY_VISIBILITY,
    PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
    PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_DEFERRED,
    PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
    PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
    PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_RETRY,
    PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
    PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
    PRIORITY_RECOVERY_PROGRESS_OWNER_VISIBILITY,
    PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
    PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
    PRIORITY_RECOVERY_PROGRESS_PHASE_TARGET_CREATION,
    PRIORITY_RECOVERY_PROGRESS_WAIT_DEFERRED_VISIBILITY,
    PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
    PRIORITY_RECOVERY_PUBLICATION_STATUS_PUBLISHED,
    PRIORITY_RECOVERY_REPLICA_ID_TARGET_SERVICE_PROGRESS,
    PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_SAMPLE_CAPTURED_AT_MS,
    PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
    PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
    PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
    PRIORITY_RECOVERY_SERIAL_WAIT_BLOCKING_OPERATION_MESSAGE,
    PRIORITY_RECOVERY_SERIAL_WAIT_BLOCKING_PARTITION_MESSAGE,
    PRIORITY_RECOVERY_SERIAL_WAIT_OPERATION_IDS_MESSAGE,
    PRIORITY_RECOVERY_SERIAL_WAIT_RELEASE_MESSAGE,
    PRIORITY_RECOVERY_SERIAL_WAIT_RELEASE_PROGRESS_MESSAGE,
    PRIORITY_RECOVERY_SERIAL_WAIT_RELEASE_TEST_NAME,
    PRIORITY_RECOVERY_SERIAL_WAIT_WITNESS_ID_MESSAGE,
    PRIORITY_RECOVERY_SERIAL_WAIT_WITNESS_TEST_NAME,
    PRIORITY_RECOVERY_SINGLE_EMERGENCY_BUDGET_LIMIT,
    PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
    PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
    PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
    PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_REPLACEMENT_REPLICA_ID,
    PRIORITY_RECOVERY_STALE_OPERATION_PROGRESS_AT_MS,
    PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_STATUS_CREATING,
    PRIORITY_RECOVERY_STATUS_FAILED,
    PRIORITY_RECOVERY_STATUS_PENDING,
    PRIORITY_RECOVERY_TARGET_SERVICE_CAPTURED_AT_MS,
    PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_AT_MS,
    PRIORITY_RECOVERY_TARGET_VISIBILITY_ACTIVE_OPERATIONAL,
    PRIORITY_RECOVERY_TERMINAL_REPLACE_OPERATION_CONTEXT,
    PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
    PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
    PRIORITY_RECOVERY_WORKFLOW_STEP_CREATING,
    PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING,
    PUBLICATION_PRIORITY_PARTITION_ID,
    SQL_TRANSACTION_PRIORITY_PARTITION_ID,
    test,
  } = context;

  test('priority recovery decision snapshots count target service creation as ' +
  'operation progress while operation rows lag',
  async (t) => {
    const decisionSnapshots = buildPriorityRecoveryDecisionSnapshots({
      capturedAt: PRIORITY_RECOVERY_TARGET_SERVICE_CAPTURED_AT_MS,
      stepTimeoutMsByWorkflowStep: {
        [PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING]:
          PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
      },
      publicationConvergence: {
        publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        publicationStatus: PRIORITY_RECOVERY_PUBLICATION_STATUS_PUBLISHED,
        publishedActiveNodeIds: [
          PRIORITY_RECOVERY_NODE_ID_A,
          PRIORITY_RECOVERY_NODE_ID_B,
          PRIORITY_RECOVERY_NODE_ID_C,
        ],
        priorityPartitionSummary: {
          blockedPartitions: [{
            partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
            requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            readyDistinctNodeCount:
              PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
            spreadGap: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
          }],
          missingPartitionIds: [PUBLICATION_PRIORITY_PARTITION_ID],
          requiredDistinctNodeCount:
            PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
        },
        membershipLifecycleSummary: {
          projectedServingNodeIds: [
            PRIORITY_RECOVERY_NODE_ID_A,
            PRIORITY_RECOVERY_NODE_ID_B,
            PRIORITY_RECOVERY_NODE_ID_C,
          ],
          locallyEligibleNodeIds: [
            PRIORITY_RECOVERY_NODE_ID_A,
            PRIORITY_RECOVERY_NODE_ID_B,
            PRIORITY_RECOVERY_NODE_ID_C,
          ],
        },
      },
      readinessByNodeId: {},
      workflowAdmissionsByWorkflowId: {},
      replicaOperationRows: [{
        operation_id: PRIORITY_RECOVERY_OPERATION_ID_TARGET_SERVICE_PROGRESS,
        partition_id: PUBLICATION_PRIORITY_PARTITION_ID,
        entity_type: PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
        operation_type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
        status: PRIORITY_RECOVERY_STATUS_PENDING,
        workflow_step: PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING,
        source_node_id: PRIORITY_RECOVERY_NODE_ID_A,
        target_node_id: PRIORITY_RECOVERY_NODE_ID_B,
        replica_id: PRIORITY_RECOVERY_REPLICA_ID_TARGET_SERVICE_PROGRESS,
        created_at: PRIORITY_RECOVERY_STALE_OPERATION_PROGRESS_AT_MS,
        updated_at: PRIORITY_RECOVERY_STALE_OPERATION_PROGRESS_AT_MS,
      }],
      serviceRows: [{
        partition_id: PUBLICATION_PRIORITY_PARTITION_ID,
        replica_id: PRIORITY_RECOVERY_REPLICA_ID_TARGET_SERVICE_PROGRESS,
        service_type: PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
        status: PRIORITY_RECOVERY_STATUS_CREATING,
        node_id: PRIORITY_RECOVERY_NODE_ID_B,
        state_entered_at: PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_AT_MS,
      }],
    });
    const snapshot = decisionSnapshots.snapshots.find((entry) =>
      entry.partitionId === PUBLICATION_PRIORITY_PARTITION_ID &&
      entry.operationId === PRIORITY_RECOVERY_OPERATION_ID_TARGET_SERVICE_PROGRESS,
    );

    t.ok(snapshot, 'target partition snapshot should exist');
    t.same(
      snapshot?.blockerReasons,
      [],
      'fresh target service progress should prevent synthetic no-transition stalls',
    );
    t.equal(
      snapshot?.semanticState,
      PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
      'target service progress should keep lagging operation rows in flight',
    );
    t.match(snapshot?.progress, {
      contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
      nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
      nextRequiredAction:
        PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
      blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
      waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
      workflowProgressPhaseId:
        PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
      stepAgeMs: PRIORITY_RECOVERY_TARGET_SERVICE_CAPTURED_AT_MS -
        PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_AT_MS,
      stepTimeoutMs: PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
      lastProgressAtMs: PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_AT_MS,
    });
    t.match(snapshot?.actuation, {
      state: PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
      owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
      timeoutReconcileDue: false,
      lastProgressAtMs: PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_AT_MS,
    });
    t.equal(
      snapshot?.coordinator?.operation?.targetServiceProgressAtMs,
      PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_AT_MS,
      'operation context should carry target service progress evidence',
    );
  });

  test('priority recovery decision snapshots ignore failed target service ' +
  'timestamps when operation rows lag',
  async (t) => {
    const decisionSnapshots = buildPriorityRecoveryDecisionSnapshots({
      capturedAt: PRIORITY_RECOVERY_TARGET_SERVICE_CAPTURED_AT_MS,
      stepTimeoutMsByWorkflowStep: {
        [PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING]:
          PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
      },
      publicationConvergence: {
        publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        publicationStatus: PRIORITY_RECOVERY_PUBLICATION_STATUS_PUBLISHED,
        publishedActiveNodeIds: [
          PRIORITY_RECOVERY_NODE_ID_A,
          PRIORITY_RECOVERY_NODE_ID_B,
          PRIORITY_RECOVERY_NODE_ID_C,
        ],
        priorityPartitionSummary: {
          blockedPartitions: [{
            partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
            requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            readyDistinctNodeCount:
              PRIORITY_RECOVERY_STALE_READY_DISTINCT_NODE_COUNT,
            spreadGap: PRIORITY_RECOVERY_SINGLE_SPREAD_GAP,
          }],
          missingPartitionIds: [PUBLICATION_PRIORITY_PARTITION_ID],
          requiredDistinctNodeCount:
            PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
        },
        membershipLifecycleSummary: {
          projectedServingNodeIds: [
            PRIORITY_RECOVERY_NODE_ID_A,
            PRIORITY_RECOVERY_NODE_ID_B,
            PRIORITY_RECOVERY_NODE_ID_C,
          ],
          locallyEligibleNodeIds: [
            PRIORITY_RECOVERY_NODE_ID_A,
            PRIORITY_RECOVERY_NODE_ID_B,
            PRIORITY_RECOVERY_NODE_ID_C,
          ],
        },
      },
      readinessByNodeId: {},
      workflowAdmissionsByWorkflowId: {},
      replicaOperationRows: [{
        operation_id: PRIORITY_RECOVERY_OPERATION_ID_TARGET_SERVICE_PROGRESS,
        partition_id: PUBLICATION_PRIORITY_PARTITION_ID,
        entity_type: PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
        operation_type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
        status: PRIORITY_RECOVERY_STATUS_PENDING,
        workflow_step: PRIORITY_RECOVERY_WORKFLOW_STEP_SENDING,
        source_node_id: PRIORITY_RECOVERY_NODE_ID_A,
        target_node_id: PRIORITY_RECOVERY_NODE_ID_B,
        replica_id: PRIORITY_RECOVERY_REPLICA_ID_TARGET_SERVICE_PROGRESS,
        created_at: PRIORITY_RECOVERY_STALE_OPERATION_PROGRESS_AT_MS,
        updated_at: PRIORITY_RECOVERY_STALE_OPERATION_PROGRESS_AT_MS,
      }],
      serviceRows: [{
        partition_id: PUBLICATION_PRIORITY_PARTITION_ID,
        replica_id: PRIORITY_RECOVERY_REPLICA_ID_TARGET_SERVICE_PROGRESS,
        service_type: PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
        status: PRIORITY_RECOVERY_STATUS_FAILED,
        node_id: PRIORITY_RECOVERY_NODE_ID_B,
        state_entered_at: PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_AT_MS,
      }],
    });
    const snapshot = decisionSnapshots.snapshots.find((entry) =>
      entry.partitionId === PUBLICATION_PRIORITY_PARTITION_ID &&
      entry.operationId ===
        PRIORITY_RECOVERY_OPERATION_ID_TARGET_SERVICE_PROGRESS,
    );

    t.ok(snapshot, 'target partition snapshot should exist');
    t.same(
      snapshot?.blockerReasons,
      [PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS],
      'failed target rows should not refresh operation progress',
    );
    t.equal(
      snapshot?.coordinator?.operation?.targetServiceProgressAtMs,
      undefined,
      'failed target row timestamps should stay out of operation context',
    );
    t.match(snapshot?.actuation, {
      state: PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
      owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
      timeoutReconcileDue: true,
      lastProgressAtMs: PRIORITY_RECOVERY_STALE_OPERATION_PROGRESS_AT_MS,
    });
  });

  test('priority recovery observation keeps set-difference ACK debt when ACK ' +
  'lists have equal length but different members',
  async (t) => {
    const observation = buildPriorityRecoveryObservationSnapshot({
      publicationConvergence: {
        publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        publicationStatus: PRIORITY_RECOVERY_PUBLICATION_STATUS_PUBLISHED,
        pendingAckNodeIds: [],
        pendingAckCount: PRIORITY_RECOVERY_EMPTY_COUNT,
      },
      publicationConvergenceGate: {
        publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        publicationStatus: PRIORITY_RECOVERY_PUBLICATION_STATUS_PUBLISHED,
        requiredAckNodeIds: [
          PRIORITY_RECOVERY_NODE_ID_A,
          PRIORITY_RECOVERY_NODE_ID_B,
        ],
        acknowledgedNodeIds: [
          PRIORITY_RECOVERY_NODE_ID_B,
          PRIORITY_RECOVERY_NODE_ID_C,
        ],
        pendingAckNodeIds: [],
        pendingAckCount: PRIORITY_RECOVERY_EMPTY_COUNT,
      },
    });

    t.same(
      observation.pendingAckNodeIds,
      [PRIORITY_RECOVERY_NODE_ID_A],
      'same-size ACK lists should still preserve the missing required node',
    );
    t.equal(observation.pendingAckCount, PRIORITY_RECOVERY_SINGLE_SPREAD_GAP);
  });

  test('priority recovery decision snapshot re-enters workflow progress for overdue creating work',
    async (t) => {
      const capturedAtMs = 62050;
      const snapshot = buildPriorityRecoveryDecisionSnapshot({
        partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
        capturedAt: capturedAtMs,
        stepTimeoutMsByWorkflowStep: {
          [PRIORITY_RECOVERY_WORKFLOW_STEP_CREATING]:
          PRIORITY_RECOVERY_CREATING_TIMEOUT_MS,
        },
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
        operationContexts: [{
          partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
          operationId: 'op-overdue-creating',
          type: 'REPLACE',
          status: PRIORITY_RECOVERY_STATUS_CREATING,
          workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_CREATING,
          targetNodeId: PRIORITY_RECOVERY_NODE_ID_B,
          updatedAtMs: 1000,
          timelineLength: 2,
          timelineStepCount: 2,
        }],
      });

      t.match(snapshot?.progress, {
        contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
        nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
        nextRequiredAction:
        PRIORITY_RECOVERY_PROGRESS_ACTION_ADVANCE_EXISTING_OPERATION,
        blockingBoundary:
        PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
        waitMode:
        PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
        workflowProgressPhaseId:
        PRIORITY_RECOVERY_PROGRESS_PHASE_TARGET_CREATION,
        stepAgeMs: capturedAtMs - 1000,
        stepTimeoutMs: PRIORITY_RECOVERY_CREATING_TIMEOUT_MS,
        lastProgressAtMs: 1000,
      });
      t.match(snapshot?.actuation, {
        state: PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
        owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
        workflowProgressPhaseId:
        PRIORITY_RECOVERY_PROGRESS_PHASE_TARGET_CREATION,
        stepAgeMs: capturedAtMs - 1000,
        stepTimeoutMs: PRIORITY_RECOVERY_CREATING_TIMEOUT_MS,
        lastProgressAtMs: 1000,
        timeoutReconcileDue: true,
      });
      t.match(snapshot?.conditions, {
        pressure: {
          pressureState: PRIORITY_RECOVERY_PRESSURE_STATE_NONE,
        },
      });

      const observationSnapshot = buildPriorityRecoveryObservationSnapshot({
        priorityRecoveryDecisionSnapshots: {
          capturedAt: capturedAtMs,
          publicationEpoch: 3,
          snapshots: [snapshot],
        },
      });
      const partitionSnapshot =
      observationSnapshot.priorityRecoveryPartitionSnapshots[0];

      t.match(partitionSnapshot, {
        progressContractState:
        PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
        progressNextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
        nextRequiredAction:
        PRIORITY_RECOVERY_PROGRESS_ACTION_ADVANCE_EXISTING_OPERATION,
        blockingBoundary:
        PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
        waitMode:
        PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
        workflowProgressPhaseId:
        PRIORITY_RECOVERY_PROGRESS_PHASE_TARGET_CREATION,
        stepAgeMs: capturedAtMs - 1000,
        stepTimeoutMs: PRIORITY_RECOVERY_CREATING_TIMEOUT_MS,
      });
    });

  test('priority recovery decision snapshot emits one visibility-owned deferred progress contract when authoritative reads are deferred',
    async (t) => {
      const snapshot = buildPriorityRecoveryDecisionSnapshot({
        partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
        priorityPartitionSummary: {
          blockedPartitions: [{
            partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
            requiredDistinctNodeCount: 3,
            readyDistinctNodeCount: 1,
            spreadGap: 2,
          }],
        },
        admission: {
          effectiveEligibleNodeIds: [PRIORITY_RECOVERY_NODE_ID_B],
          effectiveEligibleNodeCount: 1,
          ineligibleNodes: [],
        },
        authoritativeOperationReadDeferred: true,
      });

      t.match(snapshot?.progress, {
        contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_DEFERRED,
        nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_RETRY,
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_VISIBILITY,
        nextRequiredAction:
        PRIORITY_RECOVERY_PROGRESS_ACTION_OBSERVE_VISIBILITY,
        blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_VISIBILITY,
        waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_DEFERRED_VISIBILITY,
      });
      t.match(snapshot?.actuation, {
        state: PRIORITY_RECOVERY_ACTUATION_STATE_TRANSITION_DEFERRED,
        owner: PRIORITY_RECOVERY_PROGRESS_OWNER_VISIBILITY,
        timeoutReconcileDue: false,
      });
      t.match(snapshot?.conditions, {
        authoritativeOperationReadDeferred: true,
      });
    });

  test('priority recovery observation snapshots preserve the rebalancer-owned actionable handoff contract after a terminal replace with no follow-up operation',
    async (t) => {
      const decisionSnapshot = buildPriorityRecoveryDecisionSnapshot({
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

      t.match(decisionSnapshot?.progress, {
        contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
        nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
        nextRequiredAction:
        PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
        blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
        waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
        lastProgressAtMs: 1500,
      });
      t.match(decisionSnapshot?.actuation, {
        state: PRIORITY_RECOVERY_ACTUATION_STATE_ACTION_REQUIRED,
        owner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
        lastProgressAtMs: 1500,
        timeoutReconcileDue: false,
      });
      t.ok(
        decisionSnapshot?.progress?.evidenceSourceIds?.includes(
          PRIORITY_RECOVERY_PROGRESS_EVIDENCE_LAST_PROGRESS,
        ),
        'the progress contract should preserve the latest progress timestamp as evidence',
      );

      const observationSnapshot = buildPriorityRecoveryObservationSnapshot({
        priorityRecoveryDecisionSnapshots: {
          capturedAt: 2000,
          publicationEpoch: 9,
          snapshots: [decisionSnapshot],
        },
      });
      const partitionSnapshot =
      observationSnapshot.priorityRecoveryPartitionSnapshots[0];

      t.match(partitionSnapshot, {
        progressContractState:
        PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
        progressNextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
        nextRequiredAction:
        PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
        blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
        waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
        lastProgressAtMs: 1500,
      });
    });

  test('priority recovery observation snapshots preserve operation ids from ' +
  'normalized operation objects',
  async (t) => {
    const observationSnapshot = buildPriorityRecoveryObservationSnapshot({
      priorityRecoveryDecisionSnapshots: {
        capturedAt: 2000,
        publicationEpoch: 9,
        snapshots: [{
          partitionId: PUBLICATION_PRIORITY_PARTITION_ID,
          semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
          blockerReasons: [
            PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS,
          ],
          planner: {
            spreadGap: 1,
          },
          admission: {
            effectiveEligibleNodeIds: [
              PRIORITY_RECOVERY_NODE_ID_B,
              PRIORITY_RECOVERY_NODE_ID_C,
            ],
          },
          coordinator: {
            operationCount: 1,
            operation: {
              operationId: PRIORITY_RECOVERY_OPERATION_ID_OBJECT_ONLY,
              workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_CREATING,
              status: PRIORITY_RECOVERY_STATUS_CREATING,
              updatedAtMs: 1500,
            },
          },
          progress: {
            contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
            currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            nextRequiredAction:
              PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
            blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
            waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
            lastProgressAtMs: 1500,
          },
          observation: {
            workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
            visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
          },
        }],
      },
    });
    const partitionSnapshot =
      observationSnapshot.priorityRecoveryPartitionSnapshots[0];
    const partitionWitness =
      observationSnapshot.priorityRecoveryPartitionWitnesses[0];

    t.same(
      partitionSnapshot.operationIds,
      [PRIORITY_RECOVERY_OPERATION_ID_OBJECT_ONLY],
      'partition snapshots should retain operation id evidence from the ' +
        'normalized operation object',
    );
    t.same(
      partitionWitness.operationIds,
      [PRIORITY_RECOVERY_OPERATION_ID_OBJECT_ONLY],
      'partition witnesses should not report operation absence when operation evidence exists',
    );
    t.ok(
      partitionWitness.witnessIds.includes(
        PRIORITY_RECOVERY_OPERATION_ID_OBJECT_ONLY,
      ),
      'operation ids should remain part of the witness id set for harness diagnostics',
    );
  });

  test(PRIORITY_RECOVERY_SERIAL_WAIT_WITNESS_TEST_NAME, async (t) => {
    const observationSnapshot = buildPriorityRecoveryObservationSnapshot({
      priorityRecoveryDecisionSnapshots: {
        capturedAt: PRIORITY_RECOVERY_SAMPLE_CAPTURED_AT_MS,
        publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
        blockerPartitionIdsByReason: {
          [PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT]: [
            SQL_TRANSACTION_PRIORITY_PARTITION_ID,
          ],
        },
        partitionIdsBySemanticState: {
          [PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION]: [
            SQL_TRANSACTION_PRIORITY_PARTITION_ID,
          ],
        },
        snapshots: [{
          partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
          epoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
          semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
          blockerReasons: [
            PRIORITY_RECOVERY_BLOCKER_REASON_SERIAL_OPERATION_WAIT,
          ],
          planner: {
            ready: false,
            spreadGap: PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
          },
          coordinator: {
            operationCount: PRIORITY_RECOVERY_EMPTY_COUNT,
            operationIds: PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
            operation: PRIORITY_RECOVERY_ABSENT_OPERATION,
            serialWaitOperationCount: PRIORITY_RECOVERY_SINGLE_OPERATION_COUNT,
            serialWaitOperationIds: [
              PRIORITY_RECOVERY_OPERATION_ID_SERIAL_LANE_ADD,
            ],
            serialWaitPartitionIds: [
              PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
            ],
          },
          progress: {
            contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
            currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            nextRequiredAction:
              PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
            blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
            waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
            lastProgressAtMs: PRIORITY_RECOVERY_SAMPLE_CAPTURED_AT_MS,
          },
          actuation: {
            owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
            state: PRIORITY_RECOVERY_ACTUATION_STATE_TRANSITION_DEFERRED,
          },
        }],
      },
    });
    const partitionWitness =
      observationSnapshot.priorityRecoveryPartitionWitnesses[
        PRIORITY_RECOVERY_FIRST_PARTITION_WITNESS_INDEX
      ];

    t.same(
      partitionWitness.operationIds,
      PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
      PRIORITY_RECOVERY_SERIAL_WAIT_OPERATION_IDS_MESSAGE,
    );
    t.same(
      partitionWitness.serialWaitOperationIds,
      [PRIORITY_RECOVERY_OPERATION_ID_SERIAL_LANE_ADD],
      PRIORITY_RECOVERY_SERIAL_WAIT_BLOCKING_OPERATION_MESSAGE,
    );
    t.same(
      partitionWitness.serialWaitPartitionIds,
      [PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID],
      PRIORITY_RECOVERY_SERIAL_WAIT_BLOCKING_PARTITION_MESSAGE,
    );
    t.ok(
      partitionWitness.witnessIds.includes(
        PRIORITY_RECOVERY_OPERATION_ID_SERIAL_LANE_ADD,
      ),
      PRIORITY_RECOVERY_SERIAL_WAIT_WITNESS_ID_MESSAGE,
    );
  });

  test(PRIORITY_RECOVERY_SERIAL_WAIT_RELEASE_TEST_NAME, async (t) => {
    const snapshot = buildPriorityRecoveryDecisionSnapshot({
      partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
      publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
      priorityPartitionSummary: {
        blockedPartitions: [{
          partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
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
      operationContexts: [],
      serialLaneOperationContexts: [{
        partitionId:
        PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
        operationId: PRIORITY_RECOVERY_OPERATION_ID_CREATING_REPLACE_STALE,
        type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
        status: PRIORITY_RECOVERY_STATUS_CREATING,
        workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_CREATING,
        targetNodeId: PRIORITY_RECOVERY_NODE_ID_B,
        targetVisibilityState:
        PRIORITY_RECOVERY_TARGET_VISIBILITY_ACTIVE_OPERATIONAL,
        replicaId:
        PRIORITY_RECOVERY_SQL_TRANSACTION_PARTICIPANTS_REPLACEMENT_REPLICA_ID,
        createdAtMs: PRIORITY_RECOVERY_NEWER_OPERATION_CREATED_AT_MS,
        updatedAtMs: PRIORITY_RECOVERY_NEWER_OPERATION_CREATED_AT_MS,
        latestTimelineStep: PRIORITY_RECOVERY_WORKFLOW_STEP_CREATING,
        latestTimelineStatus: PRIORITY_RECOVERY_STATUS_CREATING,
        latestTimelineInFlight: true,
      }],
    });

    t.same(
      snapshot?.blockerReasons,
      [PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION],
      PRIORITY_RECOVERY_SERIAL_WAIT_RELEASE_MESSAGE,
    );
    t.same(
      snapshot?.coordinator?.serialWaitOperationIds,
      PRIORITY_RECOVERY_EMPTY_OPERATION_IDS,
      PRIORITY_RECOVERY_SERIAL_WAIT_RELEASE_MESSAGE,
    );
    t.match(
      snapshot?.progress,
      {
        contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
        nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
        currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
        nextRequiredAction:
        PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
        blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
        waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
      },
      PRIORITY_RECOVERY_SERIAL_WAIT_RELEASE_PROGRESS_MESSAGE,
    );
  });
}
