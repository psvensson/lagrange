export function buildPublicationEvidenceReplayPublicationPendingScenarioBuilders(context) {
  const {
    ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE,
    build132033ZControlPlanePublicationWitness,
    build132033ZNodeRows,
    build132033ZPartitionRows,
    build132033ZRepairLogLine,
    build132033ZServiceRows,
    build132033ZSqlWriteWitness,
    buildPriorityPartitionRows,
    buildReplayServiceRow,
    CONTROL_PLANE_PUBLICATION_STATUS,
    CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE,
    CONTROL_PLANE_SNAPSHOT_REFRESH_STATE,
    INITIAL_PARTITION_IDS,
    NUM,
    OWNER_CONTRACT_NEXT_ACTION,
    OWNER_CONTRACT_STATE,
    PRIORITY_CONTROL_PLANE_TABLE_IDS,
    RAFT_ROLE,
    REPLAY_TEST_132033Z_CONVERGED,
    REPLAY_TEST_132033Z_CONVERGED_PARTITION_IDS,
    REPLAY_TEST_132033Z_DURABLE_RECOVERY_STATE,
    REPLAY_TEST_132033Z_DURABLE_SPREAD_GAP,
    REPLAY_TEST_132033Z_EMPTY_PENDING_ACK_NODE_IDS,
    REPLAY_TEST_132033Z_EXPECTED_NODE_COUNT,
    REPLAY_TEST_132033Z_MISSING_PUBLISHED_NODE_IDS,
    REPLAY_TEST_132033Z_NODE_ENDPOINT_ROWS,
    REPLAY_TEST_132033Z_NODE_ID,
    REPLAY_TEST_132033Z_OBSERVATION_REASON_CODES,
    REPLAY_TEST_132033Z_PENDING_ACK_COUNT,
    REPLAY_TEST_132033Z_PUBLICATION_EPOCH,
    REPLAY_TEST_132033Z_PUBLICATION_GATE_REASONS,
    REPLAY_TEST_132033Z_PUBLISHED_NODE_IDS,
    REPLAY_TEST_132033Z_REACHABILITY_ERROR,
    REPLAY_TEST_132033Z_READY_ELIGIBLE_NODE_COUNT,
    REPLAY_TEST_132033Z_SELECTED_SNAPSHOT_COVERAGE_NODE_COUNT,
    REPLAY_TEST_132033Z_SPREAD_SATISFIED_IN_FLIGHT,
    REPLAY_TEST_132033Z_SPREAD_SATISFIED_PARTITION_IDS,
    REPLAY_TEST_132033Z_TERMINAL_ACTIVE_NODE_COUNT,
    REPLAY_TEST_132033Z_TERMINAL_INACTIVE_NODE_COUNT,
    REPLAY_TEST_132033Z_TIMESTAMP_MS,
    REPLAY_TEST_140646Z_ACKNOWLEDGED_NODE_IDS,
    REPLAY_TEST_140646Z_ADMIN_HEALTH,
    REPLAY_TEST_140646Z_AUTHORITATIVE_REPAIR_FAILED,
    REPLAY_TEST_140646Z_CLOSURE_PENDING,
    REPLAY_TEST_140646Z_CONTROL_PLANE_BACKPRESSURE,
    REPLAY_TEST_140646Z_DISPATCH_PENDING,
    REPLAY_TEST_140646Z_EMPTY_MISSING_PUBLISHED_NODE_IDS,
    REPLAY_TEST_140646Z_EMPTY_REACHABILITY_ERROR,
    REPLAY_TEST_140646Z_EVENT_DRIVEN_WAIT_MODE,
    REPLAY_TEST_140646Z_EXPECTED_NODE_COUNT,
    REPLAY_TEST_140646Z_EXTRA_REPLICA_ORDINAL,
    REPLAY_TEST_140646Z_FILLER_PARTITION_SUFFIX,
    REPLAY_TEST_140646Z_FILLER_TABLE_PREFIX,
    REPLAY_TEST_140646Z_HIGH_GAP_PARTITION_IDS,
    REPLAY_TEST_140646Z_LOW_GAP_PARTITION_IDS,
    REPLAY_TEST_140646Z_NEEDS_OPERATION,
    REPLAY_TEST_140646Z_NODE_ENDPOINT_ROWS,
    REPLAY_TEST_140646Z_NODE_ID,
    REPLAY_TEST_140646Z_NODE_IDS,
    REPLAY_TEST_140646Z_NODES_TABLE,
    REPLAY_TEST_140646Z_OBSERVATION_REASON_CODES,
    REPLAY_TEST_140646Z_OPERATION_STATUS_PENDING,
    REPLAY_TEST_140646Z_OPERATION_STATUS_UNAVAILABLE,
    REPLAY_TEST_140646Z_OPERATION_WORKFLOW_OWNER,
    REPLAY_TEST_140646Z_OWNER_RPC_LANE,
    REPLAY_TEST_140646Z_PARTITION_ROW_COUNT,
    REPLAY_TEST_140646Z_PENDING_ACK_COUNT,
    REPLAY_TEST_140646Z_PENDING_ACK_NODE_IDS,
    REPLAY_TEST_140646Z_PRESSURE_OR_TIMEOUT,
    REPLAY_TEST_140646Z_PRIORITY_OPERATION_SERIAL_WAIT,
    REPLAY_TEST_140646Z_PRIORITY_PARTITION_IDS,
    REPLAY_TEST_140646Z_PRIORITY_RECOVERY_REASON,
    REPLAY_TEST_140646Z_PRIORITY_SPREAD_GAP,
    REPLAY_TEST_140646Z_PUBLICATION_EPOCH,
    REPLAY_TEST_140646Z_PUBLICATION_EPOCH_PENDING_REASON,
    REPLAY_TEST_140646Z_PUBLICATION_GATE_REASONS,
    REPLAY_TEST_140646Z_PUBLICATION_RECOVERY_STATE,
    REPLAY_TEST_140646Z_PUBLISHED_NODE_IDS,
    REPLAY_TEST_140646Z_QUERY_TIMEOUT,
    REPLAY_TEST_140646Z_READY_DISTINCT_NODE_COUNT_HIGH,
    REPLAY_TEST_140646Z_READY_DISTINCT_NODE_COUNT_LOW,
    REPLAY_TEST_140646Z_READY_ELIGIBLE_NODE_COUNT,
    REPLAY_TEST_140646Z_READY_LEASE_EXTENSION_MS,
    REPLAY_TEST_140646Z_READY_REPLICA_COUNT_HIGH,
    REPLAY_TEST_140646Z_READY_REPLICA_COUNT_LOW,
    REPLAY_TEST_140646Z_RECONCILE_STALE_OPERATION,
    REPLAY_TEST_140646Z_RECOVERING_IN_FLIGHT,
    REPLAY_TEST_140646Z_REPAIR_DEFERRAL_COUNT,
    REPLAY_TEST_140646Z_REPAIR_REASON,
    REPLAY_TEST_140646Z_REPAIR_RETRY_AFTER_MS,
    REPLAY_TEST_140646Z_REPLAY_SPREAD_GAP_HIGH,
    REPLAY_TEST_140646Z_REPLAY_SPREAD_GAP_LOW,
    REPLAY_TEST_140646Z_REQUIRED_DISTINCT_NODE_COUNT,
    REPLAY_TEST_140646Z_SEED_REPLICA_ORDINALS,
    REPLAY_TEST_140646Z_SELECTED_ACTIVE_PRIORITY_TABLE_IDS,
    REPLAY_TEST_140646Z_SELECTED_SNAPSHOT_COVERAGE_NODE_COUNT,
    REPLAY_TEST_140646Z_SPREAD_SATISFIED_IN_FLIGHT,
    REPLAY_TEST_140646Z_SPREAD_SATISFIED_PARTITION_IDS,
    REPLAY_TEST_140646Z_SQL_TRANSACTIONS_CORRELATION_KEY,
    REPLAY_TEST_140646Z_SQL_TRANSACTIONS_OPERATION_ID,
    REPLAY_TEST_140646Z_SQL_TRANSACTIONS_PARTITION_ID,
    REPLAY_TEST_140646Z_SQL_TRANSACTIONS_STEP_AGE_MS,
    REPLAY_TEST_140646Z_SQL_TRANSACTIONS_STEP_TIMEOUT_MS,
    REPLAY_TEST_140646Z_SQL_WRITE_CORRELATION_KEY,
    REPLAY_TEST_140646Z_SQL_WRITE_PARTITION_ID,
    REPLAY_TEST_140646Z_SQL_WRITE_STEP_AGE_MS,
    REPLAY_TEST_140646Z_SQL_WRITE_STEP_TIMEOUT_MS,
    REPLAY_TEST_140646Z_STALE_ACTIVE_PRIORITY_TABLE_IDS,
    REPLAY_TEST_140646Z_TERMINAL_ACTIVE_NODE_COUNT,
    REPLAY_TEST_140646Z_TERMINAL_INACTIVE_NODE_COUNT,
    REPLAY_TEST_140646Z_TIMEOUT_RECONCILE_DUE,
    REPLAY_TEST_140646Z_TIMESTAMP_MS,
    REPLAY_TEST_140646Z_TRANSITION_DEFERRED,
    REPLAY_TEST_140646Z_WAIT_FOR_OPERATION_PROGRESS,
    REPLAY_TEST_140646Z_WORKFLOW_PHASE_NONE,
    REPLAY_TEST_140646Z_WORKFLOW_PROGRESS_BOUNDARY,
    REPLAY_TEST_140646Z_WORKFLOW_STEP_SENDING,
    REPLAY_TEST_140646Z_WORKFLOW_TIMEOUT_BOUNDARY,
    REPLAY_TEST_145246Z_BASELINE_ACTIVE_PRIORITY_TABLE_IDS,
    REPLAY_TEST_145246Z_BLOCKED_UNCLASSIFIED,
    REPLAY_TEST_145246Z_CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
    REPLAY_TEST_145246Z_EXPIRED_READY_LEASE_MS,
    REPLAY_TEST_145246Z_EXTRA_REPLICA_ORDINAL,
    REPLAY_TEST_145246Z_FILLER_PARTITION_SUFFIX,
    REPLAY_TEST_145246Z_FILLER_TABLE_PREFIX,
    REPLAY_TEST_145246Z_NODE_ID,
    REPLAY_TEST_145246Z_NODE_IDS,
    REPLAY_TEST_145246Z_OPERATION_FAILED_TIME_MS,
    REPLAY_TEST_145246Z_OPERATION_STATUS_FAILED,
    REPLAY_TEST_145246Z_PARTITION_ROW_COUNT,
    REPLAY_TEST_145246Z_PUBLISHED_NODE_IDS,
    REPLAY_TEST_145246Z_READY_DISTINCT_NODE_COUNT,
    REPLAY_TEST_145246Z_READY_LEASE_EXTENSION_MS,
    REPLAY_TEST_145246Z_READY_REPLICA_COUNT,
    REPLAY_TEST_145246Z_REBALANCER_CORRELATION_KEY,
    REPLAY_TEST_145246Z_REBALANCER_HANDOFF_BOUNDARY,
    REPLAY_TEST_145246Z_REBALANCER_LEADER,
    REPLAY_TEST_145246Z_REBALANCER_OPERATION_CREATED_AT_MS,
    REPLAY_TEST_145246Z_REBALANCER_OPERATION_ID,
    REPLAY_TEST_145246Z_REBALANCER_REPLICA_ID,
    REPLAY_TEST_145246Z_REBALANCER_STEP_AGE_MS,
    REPLAY_TEST_145246Z_REBALANCER_STEP_TIMEOUT_MS,
    REPLAY_TEST_145246Z_REPLAYED_BLOCKED_PARTITION_IDS,
    REPLAY_TEST_145246Z_REPLICA_OPERATIONS_PARTITION_ID,
    REPLAY_TEST_145246Z_REQUIRED_DISTINCT_NODE_COUNT,
    REPLAY_TEST_145246Z_SCHEDULE_FOLLOWUP_REBALANCE,
    REPLAY_TEST_145246Z_SEED_REPLICA_ORDINALS,
    REPLAY_TEST_145246Z_SERVICE_STATUS_SYNCING,
    REPLAY_TEST_145246Z_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
    REPLAY_TEST_145246Z_SQL_TRANSACTIONS_PARTITION_ID,
    REPLAY_TEST_145246Z_STALLED_WAIT_MODE,
    REPLAY_TEST_145246Z_TERMINAL_FAILED,
    REPLAY_TEST_145246Z_TERMINAL_PHASE,
    REPLAY_TEST_145246Z_TIMESTAMP_MS,
    REPLAY_TEST_145246Z_WORKFLOW_STEP_FAILED,
    REPLAY_TEST_PARTITION_STATE_NORMAL,
    SERVICE_STATUS,
    STATE,
  } = context;

  function build132033ZFailureBundle() {
    return {
      publicationConvergence: {
        publicationEpoch: REPLAY_TEST_132033Z_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        recoveryProtocolState: REPLAY_TEST_132033Z_DURABLE_RECOVERY_STATE,
        publishedActiveNodeIds: REPLAY_TEST_132033Z_PUBLISHED_NODE_IDS,
        pendingAckNodeIds: REPLAY_TEST_132033Z_EMPTY_PENDING_ACK_NODE_IDS,
        pendingAckCount: REPLAY_TEST_132033Z_PENDING_ACK_COUNT,
        missingPublishedNodeIds: REPLAY_TEST_132033Z_MISSING_PUBLISHED_NODE_IDS,
        missingPublishedCount:
        REPLAY_TEST_132033Z_MISSING_PUBLISHED_NODE_IDS.length,
        prioritySpreadPending: false,
        publicationConvergenceGateReasons:
        REPLAY_TEST_132033Z_PUBLICATION_GATE_REASONS,
        priorityPartitionSummary: {
          satisfied: true,
          readyEligibleNodeCount:
          REPLAY_TEST_132033Z_READY_ELIGIBLE_NODE_COUNT,
          totalPriorityPartitionCount: PRIORITY_CONTROL_PLANE_TABLE_IDS.size,
          blockedPartitionCount: NUM.ZERO,
          largestSpreadGap: REPLAY_TEST_132033Z_DURABLE_SPREAD_GAP,
          totalSpreadGap: REPLAY_TEST_132033Z_DURABLE_SPREAD_GAP,
        },
      },
      controlPlane: {
        activeGateProgress: {
          expectedNodeCount: REPLAY_TEST_132033Z_EXPECTED_NODE_COUNT,
          activeNodeCount: REPLAY_TEST_132033Z_TERMINAL_ACTIVE_NODE_COUNT,
          inactiveNodeCount: REPLAY_TEST_132033Z_TERMINAL_INACTIVE_NODE_COUNT,
          snapshotCoverageNodeCount:
          REPLAY_TEST_132033Z_SELECTED_SNAPSHOT_COVERAGE_NODE_COUNT,
          publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
          publicationEpoch: REPLAY_TEST_132033Z_PUBLICATION_EPOCH,
          recoveryProtocolState: REPLAY_TEST_132033Z_DURABLE_RECOVERY_STATE,
          selectedSnapshotNodeId:
          REPLAY_TEST_132033Z_NODE_ID.SELECTED_TIMEOUT,
          selectedSnapshotAdminReady: false,
          selectedSnapshotReachabilityError:
          REPLAY_TEST_132033Z_REACHABILITY_ERROR,
          selectedPublishedActiveNodeIds:
          REPLAY_TEST_132033Z_PUBLISHED_NODE_IDS,
          selectedMissingPublishedNodeIds:
          REPLAY_TEST_132033Z_MISSING_PUBLISHED_NODE_IDS,
          pendingAckCount: REPLAY_TEST_132033Z_PENDING_ACK_COUNT,
          missingPublishedCount:
          REPLAY_TEST_132033Z_MISSING_PUBLISHED_NODE_IDS.length,
          prioritySpreadSatisfied: true,
          prioritySpreadGap: REPLAY_TEST_132033Z_DURABLE_SPREAD_GAP,
        },
        activeGateSnapshotCoverage: {
          expectedNodeCount: REPLAY_TEST_132033Z_EXPECTED_NODE_COUNT,
          bestCoverageNodeCount:
          REPLAY_TEST_132033Z_SELECTED_SNAPSHOT_COVERAGE_NODE_COUNT,
          selectedSnapshotNodeId:
          REPLAY_TEST_132033Z_NODE_ID.SELECTED_TIMEOUT,
          selectedAdminReady: false,
          selectedSnapshotAdminReady: false,
          selectedSnapshotReachabilityError:
          REPLAY_TEST_132033Z_REACHABILITY_ERROR,
          selectedSnapshotObservationMode:
          ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
          selectedSnapshotObservationState:
          CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.STALE_BUT_USABLE,
          selectedSnapshotObservationContractState: OWNER_CONTRACT_STATE.PENDING,
          selectedSnapshotObservationRefreshState:
          CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.IDLE,
          selectedSnapshotObservationNextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
          selectedSnapshotObservationReasonCodes:
          REPLAY_TEST_132033Z_OBSERVATION_REASON_CODES,
          selectedSnapshotRepairDeferred: true,
          selectedObservedNodeIds: REPLAY_TEST_132033Z_PUBLISHED_NODE_IDS,
          selectedPublishedActiveNodeIds:
          REPLAY_TEST_132033Z_PUBLISHED_NODE_IDS,
          selectedMissingPublishedNodeIds:
          REPLAY_TEST_132033Z_MISSING_PUBLISHED_NODE_IDS,
        },
        priorityRecoveryObservation: {
          publicationEpoch: REPLAY_TEST_132033Z_PUBLICATION_EPOCH,
          priorityRecoveryPartitionWitnesses: [
            build132033ZControlPlanePublicationWitness(),
            build132033ZSqlWriteWitness(),
          ],
        },
        priorityRecoveryDecisionSnapshots: {
          publicationEpoch: REPLAY_TEST_132033Z_PUBLICATION_EPOCH,
          partitionIdsBySemanticState: {
            [REPLAY_TEST_132033Z_CONVERGED]:
            REPLAY_TEST_132033Z_CONVERGED_PARTITION_IDS,
            [REPLAY_TEST_132033Z_SPREAD_SATISFIED_IN_FLIGHT]:
            REPLAY_TEST_132033Z_SPREAD_SATISFIED_PARTITION_IDS,
          },
          priorityPartitionSummary: {
            satisfied: true,
            readyEligibleNodeCount:
            REPLAY_TEST_132033Z_READY_ELIGIBLE_NODE_COUNT,
            totalPriorityPartitionCount: PRIORITY_CONTROL_PLANE_TABLE_IDS.size,
            blockedPartitionCount: NUM.ZERO,
            largestSpreadGap: REPLAY_TEST_132033Z_DURABLE_SPREAD_GAP,
            totalSpreadGap: REPLAY_TEST_132033Z_DURABLE_SPREAD_GAP,
          },
        },
      },
      logs: {
        excerptsByNodeId: {
          [REPLAY_TEST_132033Z_NODE_ID.MISSING_REPAIR_ONE]: [
            build132033ZRepairLogLine(
              REPLAY_TEST_132033Z_NODE_ID.MISSING_REPAIR_ONE,
            ),
          ],
          [REPLAY_TEST_132033Z_NODE_ID.MISSING_REPAIR_TWO]: [
            build132033ZRepairLogLine(
              REPLAY_TEST_132033Z_NODE_ID.MISSING_REPAIR_TWO,
            ),
          ],
        },
      },
    };
  }

  function build132033ZSnapshot() {
    const partitionRows = build132033ZPartitionRows();
    return {
      timestamp: REPLAY_TEST_132033Z_TIMESTAMP_MS,
      nodes: build132033ZNodeRows(),
      nodeEndpoints: REPLAY_TEST_132033Z_NODE_ENDPOINT_ROWS,
      partitions: partitionRows,
      services: build132033ZServiceRows(partitionRows),
    };
  }

  function build140646ZNodeRows() {
    return REPLAY_TEST_140646Z_NODE_IDS.map((nodeId) => ({
      node_id: nodeId,
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      last_heartbeat: REPLAY_TEST_140646Z_TIMESTAMP_MS,
      ready_lease_expires_at:
      REPLAY_TEST_140646Z_TIMESTAMP_MS +
      REPLAY_TEST_140646Z_READY_LEASE_EXTENSION_MS,
    }));
  }

  function build140646ZPartitionRows() {
    const partitionRows = buildPriorityPartitionRows();
    for (
      let index = partitionRows.length;
      index < REPLAY_TEST_140646Z_PARTITION_ROW_COUNT;
      index += NUM.ONE
    ) {
      const ordinal = index + NUM.ONE;
      const tableId = `${REPLAY_TEST_140646Z_FILLER_TABLE_PREFIX}${ordinal}`;
      partitionRows.push({
        table_id: tableId,
        table_name: tableId,
        partition_id: `${tableId}${REPLAY_TEST_140646Z_FILLER_PARTITION_SUFFIX}`,
        state: REPLAY_TEST_PARTITION_STATE_NORMAL,
      });
    }
    return partitionRows;
  }

  function build140646ZServiceRows(partitionRows) {
    const serviceRows = [];
    for (const partitionRow of partitionRows) {
      for (const replicaOrdinal of REPLAY_TEST_140646Z_SEED_REPLICA_ORDINALS) {
        serviceRows.push(buildReplayServiceRow({
          nodeId: REPLAY_TEST_140646Z_NODE_ID.SEED,
          partitionId: partitionRow.partition_id,
          replicaOrdinal,
          raftRole: RAFT_ROLE.FOLLOWER,
          status: SERVICE_STATUS.ACTIVE,
        }));
      }
    }
    for (const tableId of REPLAY_TEST_140646Z_SELECTED_ACTIVE_PRIORITY_TABLE_IDS) {
      serviceRows.push(buildReplayServiceRow({
        nodeId: REPLAY_TEST_140646Z_NODE_ID.SELECTED,
        partitionId: INITIAL_PARTITION_IDS[tableId],
        replicaOrdinal: REPLAY_TEST_140646Z_EXTRA_REPLICA_ORDINAL,
        raftRole: RAFT_ROLE.FOLLOWER,
        status: SERVICE_STATUS.ACTIVE,
      }));
    }
    for (const tableId of REPLAY_TEST_140646Z_STALE_ACTIVE_PRIORITY_TABLE_IDS) {
      serviceRows.push(buildReplayServiceRow({
        nodeId: REPLAY_TEST_140646Z_NODE_ID.STALE,
        partitionId: INITIAL_PARTITION_IDS[tableId],
        replicaOrdinal: REPLAY_TEST_140646Z_EXTRA_REPLICA_ORDINAL,
        raftRole: RAFT_ROLE.FOLLOWER,
        status: SERVICE_STATUS.ACTIVE,
      }));
    }
    return serviceRows;
  }

  function build140646ZRepairLogLine(nodeId, causeChain) {
    return JSON.stringify({
      nodeId,
      reason: REPLAY_TEST_140646Z_REPAIR_REASON,
      failedTables: [
        REPLAY_TEST_140646Z_NODES_TABLE,
      ],
      causeChain,
      failureClass: REPLAY_TEST_140646Z_PRESSURE_OR_TIMEOUT,
      failureCount: REPLAY_TEST_140646Z_REPAIR_DEFERRAL_COUNT,
      retryAfterMs: REPLAY_TEST_140646Z_REPAIR_RETRY_AFTER_MS,
      readSource: REPLAY_TEST_140646Z_OWNER_RPC_LANE,
      msg: REPLAY_TEST_140646Z_AUTHORITATIVE_REPAIR_FAILED,
    });
  }

  function build140646ZLowGapBlockedPartition(partitionId) {
    return {
      partitionId,
      requiredDistinctNodeCount:
      REPLAY_TEST_140646Z_REQUIRED_DISTINCT_NODE_COUNT,
      readyDistinctNodeCount:
      REPLAY_TEST_140646Z_READY_DISTINCT_NODE_COUNT_HIGH,
      readyReplicaCount: REPLAY_TEST_140646Z_READY_REPLICA_COUNT_HIGH,
      spreadGap: REPLAY_TEST_140646Z_REPLAY_SPREAD_GAP_LOW,
    };
  }

  function build140646ZHighGapBlockedPartition(partitionId) {
    return {
      partitionId,
      requiredDistinctNodeCount:
      REPLAY_TEST_140646Z_REQUIRED_DISTINCT_NODE_COUNT,
      readyDistinctNodeCount:
      REPLAY_TEST_140646Z_READY_DISTINCT_NODE_COUNT_LOW,
      readyReplicaCount: REPLAY_TEST_140646Z_READY_REPLICA_COUNT_LOW,
      spreadGap: REPLAY_TEST_140646Z_REPLAY_SPREAD_GAP_HIGH,
    };
  }

  function build140646ZBlockedPartitions() {
    return [
      ...REPLAY_TEST_140646Z_LOW_GAP_PARTITION_IDS.map((partitionId) =>
        build140646ZLowGapBlockedPartition(partitionId),
      ),
      ...REPLAY_TEST_140646Z_HIGH_GAP_PARTITION_IDS.map((partitionId) =>
        build140646ZHighGapBlockedPartition(partitionId),
      ),
    ];
  }

  function build140646ZSqlTransactionsWitness() {
    return {
      partitionId: REPLAY_TEST_140646Z_SQL_TRANSACTIONS_PARTITION_ID,
      semanticStateId: REPLAY_TEST_140646Z_RECOVERING_IN_FLIGHT,
      spreadGap: REPLAY_TEST_140646Z_REPLAY_SPREAD_GAP_HIGH,
      readyDistinctNodeCount:
      REPLAY_TEST_140646Z_READY_DISTINCT_NODE_COUNT_LOW,
      requiredDistinctNodeCount:
      REPLAY_TEST_140646Z_REQUIRED_DISTINCT_NODE_COUNT,
      progressClassIds: [],
      blockerReasonCodes: [],
      actuationState: REPLAY_TEST_140646Z_TRANSITION_DEFERRED,
      currentOwner: REPLAY_TEST_140646Z_OPERATION_WORKFLOW_OWNER,
      actuationOwner: REPLAY_TEST_140646Z_OPERATION_WORKFLOW_OWNER,
      nextRequiredAction: REPLAY_TEST_140646Z_RECONCILE_STALE_OPERATION,
      blockingBoundary: REPLAY_TEST_140646Z_WORKFLOW_TIMEOUT_BOUNDARY,
      waitMode: REPLAY_TEST_140646Z_TIMEOUT_RECONCILE_DUE,
      workflowProgressPhaseId: REPLAY_TEST_140646Z_DISPATCH_PENDING,
      stepAgeMs: REPLAY_TEST_140646Z_SQL_TRANSACTIONS_STEP_AGE_MS,
      stepTimeoutMs: REPLAY_TEST_140646Z_SQL_TRANSACTIONS_STEP_TIMEOUT_MS,
      latestOperationWorkflowStep: REPLAY_TEST_140646Z_WORKFLOW_STEP_SENDING,
      latestOperationStatus: REPLAY_TEST_140646Z_OPERATION_STATUS_PENDING,
      operationIds: [
        REPLAY_TEST_140646Z_SQL_TRANSACTIONS_OPERATION_ID,
      ],
      serialWaitOperationIds: [],
      serialWaitPartitionIds: [],
      correlationKey: REPLAY_TEST_140646Z_SQL_TRANSACTIONS_CORRELATION_KEY,
    };
  }

  function build140646ZSqlWriteWitness() {
    return {
      partitionId: REPLAY_TEST_140646Z_SQL_WRITE_PARTITION_ID,
      semanticStateId: REPLAY_TEST_140646Z_NEEDS_OPERATION,
      spreadGap: REPLAY_TEST_140646Z_REPLAY_SPREAD_GAP_HIGH,
      readyDistinctNodeCount:
      REPLAY_TEST_140646Z_READY_DISTINCT_NODE_COUNT_LOW,
      requiredDistinctNodeCount:
      REPLAY_TEST_140646Z_REQUIRED_DISTINCT_NODE_COUNT,
      progressClassIds: [
        REPLAY_TEST_140646Z_PRIORITY_OPERATION_SERIAL_WAIT,
      ],
      blockerReasonCodes: [
        REPLAY_TEST_140646Z_PRIORITY_OPERATION_SERIAL_WAIT,
      ],
      actuationState: REPLAY_TEST_140646Z_TRANSITION_DEFERRED,
      currentOwner: REPLAY_TEST_140646Z_OPERATION_WORKFLOW_OWNER,
      actuationOwner: REPLAY_TEST_140646Z_OPERATION_WORKFLOW_OWNER,
      nextRequiredAction: REPLAY_TEST_140646Z_WAIT_FOR_OPERATION_PROGRESS,
      blockingBoundary: REPLAY_TEST_140646Z_WORKFLOW_PROGRESS_BOUNDARY,
      waitMode: REPLAY_TEST_140646Z_EVENT_DRIVEN_WAIT_MODE,
      workflowProgressPhaseId: REPLAY_TEST_140646Z_WORKFLOW_PHASE_NONE,
      stepAgeMs: REPLAY_TEST_140646Z_SQL_WRITE_STEP_AGE_MS,
      stepTimeoutMs: REPLAY_TEST_140646Z_SQL_WRITE_STEP_TIMEOUT_MS,
      latestOperationWorkflowStep: REPLAY_TEST_140646Z_OPERATION_STATUS_UNAVAILABLE,
      latestOperationStatus: REPLAY_TEST_140646Z_OPERATION_STATUS_UNAVAILABLE,
      operationIds: [],
      serialWaitOperationIds: [
        REPLAY_TEST_140646Z_SQL_TRANSACTIONS_OPERATION_ID,
      ],
      serialWaitPartitionIds: [
        REPLAY_TEST_140646Z_SQL_TRANSACTIONS_PARTITION_ID,
      ],
      correlationKey: REPLAY_TEST_140646Z_SQL_WRITE_CORRELATION_KEY,
    };
  }

  function build140646ZFailureBundle() {
    return {
      publicationConvergence: {
        publicationEpoch: REPLAY_TEST_140646Z_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
        recoveryProtocolState: REPLAY_TEST_140646Z_PUBLICATION_RECOVERY_STATE,
        priorityRecoveryReasonCodes: [
          REPLAY_TEST_140646Z_PRIORITY_RECOVERY_REASON,
          REPLAY_TEST_140646Z_PUBLICATION_EPOCH_PENDING_REASON,
        ],
        publishedActiveNodeIds: REPLAY_TEST_140646Z_PUBLISHED_NODE_IDS,
        requiredAckNodeIds: REPLAY_TEST_140646Z_PUBLISHED_NODE_IDS,
        acknowledgedNodeIds: REPLAY_TEST_140646Z_ACKNOWLEDGED_NODE_IDS,
        pendingAckNodeIds: REPLAY_TEST_140646Z_PENDING_ACK_NODE_IDS,
        pendingAckCount: REPLAY_TEST_140646Z_PENDING_ACK_COUNT,
        missingPublishedNodeIds:
        REPLAY_TEST_140646Z_EMPTY_MISSING_PUBLISHED_NODE_IDS,
        missingPublishedCount:
        REPLAY_TEST_140646Z_EMPTY_MISSING_PUBLISHED_NODE_IDS.length,
        prioritySpreadPending: true,
        publicationConvergenceGateReasons:
        REPLAY_TEST_140646Z_PUBLICATION_GATE_REASONS,
        priorityPartitionSummary: {
          satisfied: false,
          readyEligibleNodeCount:
          REPLAY_TEST_140646Z_READY_ELIGIBLE_NODE_COUNT,
          blockedPartitionCount: PRIORITY_CONTROL_PLANE_TABLE_IDS.size,
          largestSpreadGap: REPLAY_TEST_140646Z_PRIORITY_SPREAD_GAP,
          totalSpreadGap: REPLAY_TEST_140646Z_PRIORITY_SPREAD_GAP,
        },
      },
      controlPlane: {
        activeGateProgress: {
          expectedNodeCount: REPLAY_TEST_140646Z_EXPECTED_NODE_COUNT,
          activeNodeCount: REPLAY_TEST_140646Z_TERMINAL_ACTIVE_NODE_COUNT,
          inactiveNodeCount: REPLAY_TEST_140646Z_TERMINAL_INACTIVE_NODE_COUNT,
          snapshotCoverageNodeCount:
          REPLAY_TEST_140646Z_SELECTED_SNAPSHOT_COVERAGE_NODE_COUNT,
          publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
          publicationEpoch: REPLAY_TEST_140646Z_PUBLICATION_EPOCH,
          recoveryProtocolState: REPLAY_TEST_140646Z_PUBLICATION_RECOVERY_STATE,
          selectedSnapshotNodeId: REPLAY_TEST_140646Z_NODE_ID.SELECTED,
          selectedSnapshotAdminReady: true,
          selectedSnapshotReachableBy: REPLAY_TEST_140646Z_ADMIN_HEALTH,
          selectedSnapshotReachabilityError:
          REPLAY_TEST_140646Z_EMPTY_REACHABILITY_ERROR,
          selectedPublishedActiveNodeIds:
          REPLAY_TEST_140646Z_PUBLISHED_NODE_IDS,
          selectedMissingPublishedNodeIds:
          REPLAY_TEST_140646Z_EMPTY_MISSING_PUBLISHED_NODE_IDS,
          pendingAckCount: REPLAY_TEST_140646Z_PENDING_ACK_COUNT,
          missingPublishedCount:
          REPLAY_TEST_140646Z_EMPTY_MISSING_PUBLISHED_NODE_IDS.length,
          prioritySpreadSatisfied: false,
          prioritySpreadGap: REPLAY_TEST_140646Z_PRIORITY_SPREAD_GAP,
          priorityBlockedPartitionCount:
          REPLAY_TEST_140646Z_HIGH_GAP_PARTITION_IDS.length,
          pendingAckNodeIds: REPLAY_TEST_140646Z_PENDING_ACK_NODE_IDS,
        },
        activeGateSnapshotCoverage: {
          expectedNodeCount: REPLAY_TEST_140646Z_EXPECTED_NODE_COUNT,
          bestCoverageNodeCount:
          REPLAY_TEST_140646Z_SELECTED_SNAPSHOT_COVERAGE_NODE_COUNT,
          selectedSnapshotNodeId: REPLAY_TEST_140646Z_NODE_ID.SELECTED,
          selectedAdminReady: true,
          selectedSnapshotAdminReady: true,
          selectedReachableBy: REPLAY_TEST_140646Z_ADMIN_HEALTH,
          selectedSnapshotReachableBy: REPLAY_TEST_140646Z_ADMIN_HEALTH,
          selectedSnapshotReachabilityError:
          REPLAY_TEST_140646Z_EMPTY_REACHABILITY_ERROR,
          selectedSnapshotObservationMode:
          ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
          selectedSnapshotObservationState:
          CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.STALE_BUT_USABLE,
          selectedSnapshotObservationContractState: OWNER_CONTRACT_STATE.PENDING,
          selectedSnapshotObservationRefreshState:
          CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.IDLE,
          selectedSnapshotObservationNextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
          selectedSnapshotObservationReasonCodes:
          REPLAY_TEST_140646Z_OBSERVATION_REASON_CODES,
          selectedSnapshotRepairDeferred: true,
          selectedPublishedActiveNodeIds:
          REPLAY_TEST_140646Z_PUBLISHED_NODE_IDS,
          selectedMissingPublishedNodeIds:
          REPLAY_TEST_140646Z_EMPTY_MISSING_PUBLISHED_NODE_IDS,
        },
        priorityRecoveryObservation: {
          publicationEpoch: REPLAY_TEST_140646Z_PUBLICATION_EPOCH,
          priorityRecoveryPartitionWitnesses: [
            build140646ZSqlTransactionsWitness(),
            build140646ZSqlWriteWitness(),
          ],
        },
        priorityRecoveryDecisionSnapshots: {
          publicationEpoch: REPLAY_TEST_140646Z_PUBLICATION_EPOCH,
          partitionIdsBySemanticState: {
            [REPLAY_TEST_140646Z_SPREAD_SATISFIED_IN_FLIGHT]:
            REPLAY_TEST_140646Z_SPREAD_SATISFIED_PARTITION_IDS,
            [REPLAY_TEST_140646Z_RECOVERING_IN_FLIGHT]: [
              REPLAY_TEST_140646Z_SQL_TRANSACTIONS_PARTITION_ID,
            ],
            [REPLAY_TEST_140646Z_NEEDS_OPERATION]: [
              REPLAY_TEST_140646Z_SQL_WRITE_PARTITION_ID,
            ],
          },
          blockerPartitionIdsByReason: {
            [REPLAY_TEST_140646Z_PRIORITY_OPERATION_SERIAL_WAIT]: [
              REPLAY_TEST_140646Z_SQL_WRITE_PARTITION_ID,
            ],
          },
          priorityPartitionSummary: {
            satisfied: false,
            readyEligibleNodeCount:
            REPLAY_TEST_140646Z_READY_ELIGIBLE_NODE_COUNT,
            blockedPartitionCount: REPLAY_TEST_140646Z_PRIORITY_PARTITION_IDS.length,
            largestSpreadGap: REPLAY_TEST_140646Z_PRIORITY_SPREAD_GAP,
            totalSpreadGap: REPLAY_TEST_140646Z_PRIORITY_SPREAD_GAP,
          },
          closureWitness: {
            state: REPLAY_TEST_140646Z_CLOSURE_PENDING,
            prioritySpreadPending: true,
            publicationRefreshRequired: false,
            blockedPartitionIds: REPLAY_TEST_140646Z_HIGH_GAP_PARTITION_IDS,
          },
        },
      },
      logs: {
        excerptsByNodeId: {
          [REPLAY_TEST_140646Z_NODE_ID.PENDING_ACK_TWO]: [
            build140646ZRepairLogLine(
              REPLAY_TEST_140646Z_NODE_ID.PENDING_ACK_TWO,
              [
                REPLAY_TEST_140646Z_CONTROL_PLANE_BACKPRESSURE,
              ],
            ),
          ],
          [REPLAY_TEST_140646Z_NODE_ID.SELECTED]: [
            build140646ZRepairLogLine(
              REPLAY_TEST_140646Z_NODE_ID.SELECTED,
              [
                REPLAY_TEST_140646Z_CONTROL_PLANE_BACKPRESSURE,
                REPLAY_TEST_140646Z_QUERY_TIMEOUT,
              ],
            ),
          ],
        },
      },
    };
  }

  function build140646ZSnapshot() {
    const partitionRows = build140646ZPartitionRows();
    return {
      timestamp: REPLAY_TEST_140646Z_TIMESTAMP_MS,
      nodes: build140646ZNodeRows(),
      nodeEndpoints: REPLAY_TEST_140646Z_NODE_ENDPOINT_ROWS,
      partitions: partitionRows,
      services: build140646ZServiceRows(partitionRows),
    };
  }

  function build145246ZNodeRows() {
    return REPLAY_TEST_145246Z_NODE_IDS.map((nodeId) => ({
      node_id: nodeId,
      status: SERVICE_STATUS.ACTIVE,
      connection_state: REPLAY_TEST_145246Z_PUBLISHED_NODE_IDS.includes(nodeId) ?
        STATE.READY :
        STATE.CONNECTED,
      last_heartbeat: REPLAY_TEST_145246Z_TIMESTAMP_MS,
      ready_lease_expires_at: REPLAY_TEST_145246Z_PUBLISHED_NODE_IDS.includes(
        nodeId,
      ) ?
        REPLAY_TEST_145246Z_TIMESTAMP_MS +
        REPLAY_TEST_145246Z_READY_LEASE_EXTENSION_MS :
        REPLAY_TEST_145246Z_EXPIRED_READY_LEASE_MS,
    }));
  }

  function build145246ZPartitionRows() {
    const partitionRows = buildPriorityPartitionRows();
    for (
      let index = partitionRows.length;
      index < REPLAY_TEST_145246Z_PARTITION_ROW_COUNT;
      index += NUM.ONE
    ) {
      const ordinal = index + NUM.ONE;
      const tableId = `${REPLAY_TEST_145246Z_FILLER_TABLE_PREFIX}${ordinal}`;
      partitionRows.push({
        table_id: tableId,
        table_name: tableId,
        partition_id: `${tableId}${REPLAY_TEST_145246Z_FILLER_PARTITION_SUFFIX}`,
        state: REPLAY_TEST_PARTITION_STATE_NORMAL,
      });
    }
    return partitionRows;
  }

  function build145246ZServiceRows(partitionRows) {
    const serviceRows = [];
    for (const partitionRow of partitionRows) {
      for (const replicaOrdinal of REPLAY_TEST_145246Z_SEED_REPLICA_ORDINALS) {
        serviceRows.push(buildReplayServiceRow({
          nodeId: REPLAY_TEST_145246Z_NODE_ID.SEED,
          partitionId: partitionRow.partition_id,
          replicaOrdinal,
          raftRole: RAFT_ROLE.FOLLOWER,
          status: SERVICE_STATUS.ACTIVE,
        }));
      }
    }
    for (const tableId of REPLAY_TEST_145246Z_BASELINE_ACTIVE_PRIORITY_TABLE_IDS) {
      serviceRows.push(buildReplayServiceRow({
        nodeId: REPLAY_TEST_145246Z_NODE_ID.BASELINE,
        partitionId: INITIAL_PARTITION_IDS[tableId],
        replicaOrdinal: REPLAY_TEST_145246Z_EXTRA_REPLICA_ORDINAL,
        raftRole: RAFT_ROLE.FOLLOWER,
        status: SERVICE_STATUS.ACTIVE,
      }));
    }
    serviceRows.push(buildReplayServiceRow({
      nodeId: REPLAY_TEST_145246Z_NODE_ID.BASELINE,
      partitionId:
      REPLAY_TEST_145246Z_REPLICA_OPERATIONS_PARTITION_ID,
      replicaOrdinal: REPLAY_TEST_145246Z_EXTRA_REPLICA_ORDINAL,
      raftRole: RAFT_ROLE.FOLLOWER,
      status: REPLAY_TEST_145246Z_SERVICE_STATUS_SYNCING,
    }));
    return serviceRows;
  }

  function build145246ZReplicaOperationRows() {
    return [
      {
        operation_id: REPLAY_TEST_145246Z_REBALANCER_OPERATION_ID,
        partition_id: REPLAY_TEST_145246Z_CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
        replica_id: REPLAY_TEST_145246Z_REBALANCER_REPLICA_ID,
        source_node_id: REPLAY_TEST_145246Z_NODE_ID.SEED,
        target_node_id: REPLAY_TEST_145246Z_NODE_ID.BASELINE,
        status: REPLAY_TEST_145246Z_OPERATION_STATUS_FAILED,
        workflow_step: REPLAY_TEST_145246Z_WORKFLOW_STEP_FAILED,
        created_at: REPLAY_TEST_145246Z_REBALANCER_OPERATION_CREATED_AT_MS,
        updated_at: REPLAY_TEST_145246Z_OPERATION_FAILED_TIME_MS,
      },
    ];
  }

  function build145246ZBlockedPartition(partitionId) {
    const replayRequiredDistinctNodeCount =
      REPLAY_TEST_145246Z_REQUIRED_DISTINCT_NODE_COUNT + NUM.ONE;
    const highReadyPartitionIds = new Set([
      REPLAY_TEST_145246Z_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
      REPLAY_TEST_145246Z_SQL_TRANSACTIONS_PARTITION_ID,
    ]);
    const readyDistinctNodeCount =
      REPLAY_TEST_145246Z_READY_DISTINCT_NODE_COUNT +
      (highReadyPartitionIds.has(partitionId) ? NUM.ONE : NUM.ZERO);
    const readyReplicaCount =
      REPLAY_TEST_145246Z_READY_REPLICA_COUNT +
      (highReadyPartitionIds.has(partitionId) ? NUM.ONE : NUM.ZERO);
    return {
      partitionId,
      requiredDistinctNodeCount: replayRequiredDistinctNodeCount,
      readyDistinctNodeCount,
      readyReplicaCount,
      spreadGap: replayRequiredDistinctNodeCount - readyDistinctNodeCount,
    };
  }

  function build145246ZReplayedBlockedPartitions() {
    return REPLAY_TEST_145246Z_REPLAYED_BLOCKED_PARTITION_IDS.map((partitionId) =>
      build145246ZBlockedPartition(partitionId),
    );
  }

  function build145246ZRebalancerWitness() {
    return {
      partitionId: REPLAY_TEST_145246Z_CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
      semanticStateId: REPLAY_TEST_145246Z_BLOCKED_UNCLASSIFIED,
      actuationState: REPLAY_TEST_145246Z_TERMINAL_FAILED,
      currentOwner: REPLAY_TEST_145246Z_REBALANCER_LEADER,
      actuationOwner: REPLAY_TEST_145246Z_REBALANCER_LEADER,
      nextRequiredAction: REPLAY_TEST_145246Z_SCHEDULE_FOLLOWUP_REBALANCE,
      blockingBoundary: REPLAY_TEST_145246Z_REBALANCER_HANDOFF_BOUNDARY,
      waitMode: REPLAY_TEST_145246Z_STALLED_WAIT_MODE,
      workflowProgressPhaseId: REPLAY_TEST_145246Z_TERMINAL_PHASE,
      stepAgeMs: REPLAY_TEST_145246Z_REBALANCER_STEP_AGE_MS,
      stepTimeoutMs: REPLAY_TEST_145246Z_REBALANCER_STEP_TIMEOUT_MS,
      latestOperationWorkflowStep: REPLAY_TEST_145246Z_WORKFLOW_STEP_FAILED,
      latestOperationStatus: REPLAY_TEST_145246Z_OPERATION_STATUS_FAILED,
      operationIds: [
        REPLAY_TEST_145246Z_REBALANCER_OPERATION_ID,
      ],
      serialWaitOperationIds: [],
      serialWaitPartitionIds: [],
      correlationKey: REPLAY_TEST_145246Z_REBALANCER_CORRELATION_KEY,
    };
  }

  return {
    build132033ZFailureBundle,
    build132033ZSnapshot,
    build140646ZNodeRows,
    build140646ZPartitionRows,
    build140646ZServiceRows,
    build140646ZRepairLogLine,
    build140646ZLowGapBlockedPartition,
    build140646ZHighGapBlockedPartition,
    build140646ZBlockedPartitions,
    build140646ZSqlTransactionsWitness,
    build140646ZSqlWriteWitness,
    build140646ZFailureBundle,
    build140646ZSnapshot,
    build145246ZNodeRows,
    build145246ZPartitionRows,
    build145246ZServiceRows,
    build145246ZReplicaOperationRows,
    build145246ZBlockedPartition,
    build145246ZReplayedBlockedPartitions,
    build145246ZRebalancerWitness,
  };
}
