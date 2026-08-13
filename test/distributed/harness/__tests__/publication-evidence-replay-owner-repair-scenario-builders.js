export function buildPublicationEvidenceReplayOwnerRepairScenarioBuilders(context) {
  const {
    ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE,
    build114859ZNodeRows,
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
    REPLAY_TEST_114859Z_ADMIN_HEALTH,
    REPLAY_TEST_114859Z_AUTHORITATIVE_REPAIR_FAILED,
    REPLAY_TEST_114859Z_CLOSURE_RECORD_ID,
    REPLAY_TEST_114859Z_CLOSURE_WITNESS_CLASS,
    REPLAY_TEST_114859Z_CONTROL_PLANE_BACKPRESSURE,
    REPLAY_TEST_114859Z_CORRELATION_KEY,
    REPLAY_TEST_114859Z_DISPATCH_PENDING,
    REPLAY_TEST_114859Z_EVENT_DRIVEN_WAIT_MODE,
    REPLAY_TEST_114859Z_EXPECTED_NODE_COUNT,
    REPLAY_TEST_114859Z_EXTRA_REPLICA_ORDINAL,
    REPLAY_TEST_114859Z_FILLER_PARTITION_SUFFIX,
    REPLAY_TEST_114859Z_FILLER_TABLE_PREFIX,
    REPLAY_TEST_114859Z_FIRST_REPAIR_RETRY_AFTER_MS,
    REPLAY_TEST_114859Z_MAX_REPAIR_RETRY_AFTER_MS,
    REPLAY_TEST_114859Z_MISSING_PUBLISHED_NODE_IDS,
    REPLAY_TEST_114859Z_NODE_ENDPOINT_ROWS,
    REPLAY_TEST_114859Z_NODE_ID,
    REPLAY_TEST_114859Z_NODES_TABLE,
    REPLAY_TEST_114859Z_OBSERVATION_REASON_CODES,
    REPLAY_TEST_114859Z_OPERATION_STATUS_PENDING,
    REPLAY_TEST_114859Z_OPERATION_WORKFLOW_OWNER,
    REPLAY_TEST_114859Z_OWNER_RPC_LANE,
    REPLAY_TEST_114859Z_PARTITION_ROW_COUNT,
    REPLAY_TEST_114859Z_PERSISTED_NOT_DISPATCHED,
    REPLAY_TEST_114859Z_PRESSURE_OR_TIMEOUT,
    REPLAY_TEST_114859Z_PRIORITY_RECOVERY_STATE,
    REPLAY_TEST_114859Z_PRIORITY_SPREAD_GAP,
    REPLAY_TEST_114859Z_PUBLICATION_EPOCH,
    REPLAY_TEST_114859Z_PUBLISHED_NODE_IDS,
    REPLAY_TEST_114859Z_RECOVERING_IN_FLIGHT,
    REPLAY_TEST_114859Z_REPAIR_REASON,
    REPLAY_TEST_114859Z_SECONDARY_ACTIVE_PRIORITY_TABLE_IDS,
    REPLAY_TEST_114859Z_SEED_REPLICA_ORDINALS,
    REPLAY_TEST_114859Z_SELECTED_OBSERVED_NODE_IDS,
    REPLAY_TEST_114859Z_SELECTED_REPAIR_RETRY_AFTER_MS,
    REPLAY_TEST_114859Z_SELECTED_SNAPSHOT_COVERAGE_NODE_COUNT,
    REPLAY_TEST_114859Z_SQL_WRITE_OPERATION_ID,
    REPLAY_TEST_114859Z_SQL_WRITE_PARTITION_ID,
    REPLAY_TEST_114859Z_TERTIARY_ACTIVE_PRIORITY_TABLE_IDS,
    REPLAY_TEST_114859Z_TIMESTAMP_MS,
    REPLAY_TEST_114859Z_WAIT_FOR_OPERATION_PROGRESS,
    REPLAY_TEST_114859Z_WORKFLOW_PROGRESS_BOUNDARY,
    REPLAY_TEST_114859Z_WORKFLOW_STEP_PENDING,
    REPLAY_TEST_123850Z_ACKNOWLEDGED_NODE_IDS,
    REPLAY_TEST_123850Z_ACTION_REQUIRED,
    REPLAY_TEST_123850Z_AUTHORITATIVE_REPAIR_FAILED,
    REPLAY_TEST_123850Z_BLOCKED_PARTITION_SPREAD_GAP,
    REPLAY_TEST_123850Z_CONTROL_PLANE_BACKPRESSURE,
    REPLAY_TEST_123850Z_CREATE_RECOVERY_OPERATION,
    REPLAY_TEST_123850Z_DISPATCH_PENDING,
    REPLAY_TEST_123850Z_ELIGIBLE_NO_OPERATION,
    REPLAY_TEST_123850Z_EVENT_DRIVEN_WAIT_MODE,
    REPLAY_TEST_123850Z_EXPECTED_NODE_COUNT,
    REPLAY_TEST_123850Z_FILLER_PARTITION_SUFFIX,
    REPLAY_TEST_123850Z_FILLER_TABLE_PREFIX,
    REPLAY_TEST_123850Z_MISSING_PUBLISHED_NODE_IDS,
    REPLAY_TEST_123850Z_NODE_ENDPOINT_ROWS,
    REPLAY_TEST_123850Z_NODE_ID,
    REPLAY_TEST_123850Z_NODE_IDS,
    REPLAY_TEST_123850Z_NODES_TABLE,
    REPLAY_TEST_123850Z_OBSERVATION_REASON_CODES,
    REPLAY_TEST_123850Z_OPERATION_NO_TRANSITIONS,
    REPLAY_TEST_123850Z_OPERATION_SCHEDULING_BOUNDARY,
    REPLAY_TEST_123850Z_OPERATION_SCHEDULING_STATE,
    REPLAY_TEST_123850Z_OPERATION_STALLED_STATE,
    REPLAY_TEST_123850Z_OPERATION_STATUS_PENDING,
    REPLAY_TEST_123850Z_OPERATION_STATUS_UNAVAILABLE,
    REPLAY_TEST_123850Z_OPERATION_WORKFLOW_OWNER,
    REPLAY_TEST_123850Z_OWNER_RPC_LANE,
    REPLAY_TEST_123850Z_PARTITION_ROW_COUNT,
    REPLAY_TEST_123850Z_PENDING_ACK_COUNT,
    REPLAY_TEST_123850Z_PENDING_ACK_NODE_IDS,
    REPLAY_TEST_123850Z_PRESSURE_OR_TIMEOUT,
    REPLAY_TEST_123850Z_PRIORITY_SPREAD_GAP,
    REPLAY_TEST_123850Z_PUBLICATION_EPOCH,
    REPLAY_TEST_123850Z_PUBLICATION_RECOVERY_STATE,
    REPLAY_TEST_123850Z_PUBLISHED_NODE_IDS,
    REPLAY_TEST_123850Z_REACHABILITY_ERROR,
    REPLAY_TEST_123850Z_READY_DISTINCT_NODE_COUNT,
    REPLAY_TEST_123850Z_READY_LEASE_EXTENSION_MS,
    REPLAY_TEST_123850Z_REBALANCER_LEADER,
    REPLAY_TEST_123850Z_RECONCILE_STALE_OPERATION,
    REPLAY_TEST_123850Z_REPAIR_DEFERRAL_COUNT,
    REPLAY_TEST_123850Z_REPAIR_REASON,
    REPLAY_TEST_123850Z_REPAIR_RETRY_AFTER_MS,
    REPLAY_TEST_123850Z_REQUIRED_DISTINCT_NODE_COUNT,
    REPLAY_TEST_123850Z_SCHEDULING_CORRELATION_KEY,
    REPLAY_TEST_123850Z_SEED_REPLICA_ORDINALS,
    REPLAY_TEST_123850Z_SELECTED_ACTIVE_PRIORITY_TABLE_IDS,
    REPLAY_TEST_123850Z_SELECTED_OBSERVED_NODE_IDS,
    REPLAY_TEST_123850Z_SELECTED_REPLICA_ORDINAL,
    REPLAY_TEST_123850Z_SELECTED_SNAPSHOT_COVERAGE_NODE_COUNT,
    REPLAY_TEST_123850Z_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
    REPLAY_TEST_123850Z_SQL_WRITE_CORRELATION_KEY,
    REPLAY_TEST_123850Z_SQL_WRITE_OPERATION_ID,
    REPLAY_TEST_123850Z_SQL_WRITE_PARTITION_ID,
    REPLAY_TEST_123850Z_TIMEOUT_RECONCILE_DUE,
    REPLAY_TEST_123850Z_TIMESTAMP_MS,
    REPLAY_TEST_123850Z_TRANSITION_DEFERRED,
    REPLAY_TEST_123850Z_WORKFLOW_PHASE_NONE,
    REPLAY_TEST_123850Z_WORKFLOW_STEP_AGE_MS,
    REPLAY_TEST_123850Z_WORKFLOW_STEP_PENDING,
    REPLAY_TEST_123850Z_WORKFLOW_STEP_TIMEOUT_MS,
    REPLAY_TEST_123850Z_WORKFLOW_TIMEOUT_BOUNDARY,
    REPLAY_TEST_132033Z_AUTHORITATIVE_REPAIR_FAILED,
    REPLAY_TEST_132033Z_CONTROL_PLANE_BACKPRESSURE,
    REPLAY_TEST_132033Z_CONTROL_PLANE_CORRELATION_KEY,
    REPLAY_TEST_132033Z_CONTROL_PLANE_OPERATION_ID,
    REPLAY_TEST_132033Z_CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
    REPLAY_TEST_132033Z_CONTROL_PLANE_STEP_AGE_MS,
    REPLAY_TEST_132033Z_CONTROL_PLANE_STEP_TIMEOUT_MS,
    REPLAY_TEST_132033Z_DISPATCHED_WAITING_PROGRESS,
    REPLAY_TEST_132033Z_DURABLE_SPREAD_GAP,
    REPLAY_TEST_132033Z_EVENT_DRIVEN_WAIT_MODE,
    REPLAY_TEST_132033Z_EXTRA_REPLICA_ORDINAL,
    REPLAY_TEST_132033Z_FILLER_PARTITION_SUFFIX,
    REPLAY_TEST_132033Z_FILLER_TABLE_PREFIX,
    REPLAY_TEST_132033Z_NODE_ID,
    REPLAY_TEST_132033Z_NODE_IDS,
    REPLAY_TEST_132033Z_NODES_TABLE,
    REPLAY_TEST_132033Z_OPERATION_STATUS_ACTIVE,
    REPLAY_TEST_132033Z_OPERATION_STATUS_REMOVING,
    REPLAY_TEST_132033Z_OPERATION_WORKFLOW_OWNER,
    REPLAY_TEST_132033Z_OWNER_QUEUE_PENDING_WRITES,
    REPLAY_TEST_132033Z_OWNER_RPC_LANE,
    REPLAY_TEST_132033Z_PARTITION_ROW_COUNT,
    REPLAY_TEST_132033Z_PRESSURE_OR_TIMEOUT,
    REPLAY_TEST_132033Z_PRIORITY_PARTITION_IDS,
    REPLAY_TEST_132033Z_READY_LEASE_EXTENSION_MS,
    REPLAY_TEST_132033Z_REPAIR_DEFERRAL_COUNT,
    REPLAY_TEST_132033Z_REPAIR_REASON,
    REPLAY_TEST_132033Z_REPAIR_RETRY_AFTER_MS,
    REPLAY_TEST_132033Z_REPLAY_READY_DISTINCT_NODE_COUNT,
    REPLAY_TEST_132033Z_REPLAY_READY_REPLICA_COUNT,
    REPLAY_TEST_132033Z_REPLAY_SPREAD_GAP,
    REPLAY_TEST_132033Z_REQUIRED_DISTINCT_NODE_COUNT,
    REPLAY_TEST_132033Z_SECONDARY_ACTIVE_PRIORITY_TABLE_IDS,
    REPLAY_TEST_132033Z_SEED_REPLICA_ORDINALS,
    REPLAY_TEST_132033Z_SELECTED_ACTIVE_PRIORITY_TABLE_IDS,
    REPLAY_TEST_132033Z_SOURCE_REMOVAL,
    REPLAY_TEST_132033Z_SPREAD_SATISFIED_IN_FLIGHT,
    REPLAY_TEST_132033Z_SQL_WRITE_CORRELATION_KEY,
    REPLAY_TEST_132033Z_SQL_WRITE_OPERATION_ID,
    REPLAY_TEST_132033Z_SQL_WRITE_PARTITION_ID,
    REPLAY_TEST_132033Z_SQL_WRITE_STEP_AGE_MS,
    REPLAY_TEST_132033Z_SQL_WRITE_STEP_TIMEOUT_MS,
    REPLAY_TEST_132033Z_TIMESTAMP_MS,
    REPLAY_TEST_132033Z_WAIT_FOR_OPERATION_PROGRESS,
    REPLAY_TEST_132033Z_WORKFLOW_PROGRESS_BOUNDARY,
    REPLAY_TEST_132033Z_WORKFLOW_STEP_ACTIVE,
    REPLAY_TEST_132033Z_WORKFLOW_STEP_STOPPING,
    REPLAY_TEST_132033Z_WRITE_BACKLOG,
    REPLAY_TEST_PARTITION_STATE_NORMAL,
    SERVICE_STATUS,
    STATE,
  } = context;

  function build114859ZPartitionRows() {
    const partitionRows = buildPriorityPartitionRows();
    for (
      let index = partitionRows.length;
      index < REPLAY_TEST_114859Z_PARTITION_ROW_COUNT;
      index += 1
    ) {
      const ordinal = index + 1;
      const tableId = `${REPLAY_TEST_114859Z_FILLER_TABLE_PREFIX}${ordinal}`;
      partitionRows.push({
        table_id: tableId,
        table_name: tableId,
        partition_id: `${tableId}${REPLAY_TEST_114859Z_FILLER_PARTITION_SUFFIX}`,
        state: REPLAY_TEST_PARTITION_STATE_NORMAL,
      });
    }
    return partitionRows;
  }

  function build114859ZServiceRows(partitionRows) {
    const serviceRows = [];
    for (const partitionRow of partitionRows) {
      for (const replicaOrdinal of REPLAY_TEST_114859Z_SEED_REPLICA_ORDINALS) {
        serviceRows.push(buildReplayServiceRow({
          nodeId: REPLAY_TEST_114859Z_NODE_ID.SEED,
          partitionId: partitionRow.partition_id,
          replicaOrdinal,
          raftRole: RAFT_ROLE.FOLLOWER,
          status: SERVICE_STATUS.ACTIVE,
        }));
      }
    }
    for (const tableId of REPLAY_TEST_114859Z_SECONDARY_ACTIVE_PRIORITY_TABLE_IDS) {
      serviceRows.push(buildReplayServiceRow({
        nodeId: REPLAY_TEST_114859Z_NODE_ID.SECONDARY,
        partitionId: INITIAL_PARTITION_IDS[tableId],
        replicaOrdinal: REPLAY_TEST_114859Z_EXTRA_REPLICA_ORDINAL,
        raftRole: RAFT_ROLE.FOLLOWER,
        status: SERVICE_STATUS.ACTIVE,
      }));
    }
    for (const tableId of REPLAY_TEST_114859Z_TERTIARY_ACTIVE_PRIORITY_TABLE_IDS) {
      serviceRows.push(buildReplayServiceRow({
        nodeId: REPLAY_TEST_114859Z_NODE_ID.TERTIARY,
        partitionId: INITIAL_PARTITION_IDS[tableId],
        replicaOrdinal: REPLAY_TEST_114859Z_EXTRA_REPLICA_ORDINAL,
        raftRole: RAFT_ROLE.FOLLOWER,
        status: SERVICE_STATUS.ACTIVE,
      }));
    }
    return serviceRows;
  }

  function build114859ZRepairLogLine(options) {
    return JSON.stringify({
      nodeId: options.nodeId,
      reason: REPLAY_TEST_114859Z_REPAIR_REASON,
      failedTables: [
        REPLAY_TEST_114859Z_NODES_TABLE,
      ],
      causeChain: [
        REPLAY_TEST_114859Z_CONTROL_PLANE_BACKPRESSURE,
      ],
      failureClass: REPLAY_TEST_114859Z_PRESSURE_OR_TIMEOUT,
      failureCount: options.failureCount,
      retryAfterMs: options.retryAfterMs,
      readSource: REPLAY_TEST_114859Z_OWNER_RPC_LANE,
      msg: REPLAY_TEST_114859Z_AUTHORITATIVE_REPAIR_FAILED,
    });
  }

  function build114859ZPriorityRecoveryWitness() {
    return {
      partitionId: REPLAY_TEST_114859Z_SQL_WRITE_PARTITION_ID,
      semanticStateId: REPLAY_TEST_114859Z_RECOVERING_IN_FLIGHT,
      currentOwner: REPLAY_TEST_114859Z_OPERATION_WORKFLOW_OWNER,
      blockingBoundary: REPLAY_TEST_114859Z_WORKFLOW_PROGRESS_BOUNDARY,
      waitMode: REPLAY_TEST_114859Z_EVENT_DRIVEN_WAIT_MODE,
      nextRequiredAction: REPLAY_TEST_114859Z_WAIT_FOR_OPERATION_PROGRESS,
      actuationState: REPLAY_TEST_114859Z_PERSISTED_NOT_DISPATCHED,
      workflowProgressPhaseId: REPLAY_TEST_114859Z_DISPATCH_PENDING,
      latestOperationWorkflowStep: REPLAY_TEST_114859Z_WORKFLOW_STEP_PENDING,
      latestOperationStatus: REPLAY_TEST_114859Z_OPERATION_STATUS_PENDING,
      operationIds: [
        REPLAY_TEST_114859Z_SQL_WRITE_OPERATION_ID,
      ],
      correlationKey: REPLAY_TEST_114859Z_CORRELATION_KEY,
    };
  }

  function build114859ZFailureBundle() {
    return {
      publicationConvergence: {
        publicationEpoch: REPLAY_TEST_114859Z_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        recoveryProtocolState: REPLAY_TEST_114859Z_PRIORITY_RECOVERY_STATE,
        publishedActiveNodeIds: REPLAY_TEST_114859Z_PUBLISHED_NODE_IDS,
        pendingAckNodeIds: [],
        acknowledgedNodeIds: REPLAY_TEST_114859Z_PUBLISHED_NODE_IDS,
        missingPublishedNodeIds: REPLAY_TEST_114859Z_MISSING_PUBLISHED_NODE_IDS,
        missingPublishedCount: REPLAY_TEST_114859Z_MISSING_PUBLISHED_NODE_IDS.length,
        prioritySpreadPending: true,
        closureRecordId: REPLAY_TEST_114859Z_CLOSURE_RECORD_ID,
        closureWitnessClass: REPLAY_TEST_114859Z_CLOSURE_WITNESS_CLASS,
        priorityPartitionSummary: {
          satisfied: false,
          blockedPartitionCount: PRIORITY_CONTROL_PLANE_TABLE_IDS.size,
          largestSpreadGap: REPLAY_TEST_114859Z_PRIORITY_SPREAD_GAP,
          totalSpreadGap: REPLAY_TEST_114859Z_PRIORITY_SPREAD_GAP,
        },
      },
      controlPlane: {
        activeGateSnapshotCoverage: {
          expectedNodeCount: REPLAY_TEST_114859Z_EXPECTED_NODE_COUNT,
          bestCoverageNodeCount:
          REPLAY_TEST_114859Z_SELECTED_SNAPSHOT_COVERAGE_NODE_COUNT,
          selectedSnapshotNodeId: REPLAY_TEST_114859Z_NODE_ID.SELECTED_STALE,
          selectedAdminReady: true,
          selectedSnapshotAdminReady: true,
          selectedReachableBy: REPLAY_TEST_114859Z_ADMIN_HEALTH,
          selectedSnapshotReachableBy: REPLAY_TEST_114859Z_ADMIN_HEALTH,
          selectedSnapshotObservationMode:
          ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
          selectedSnapshotObservationState:
          CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.STALE_BUT_USABLE,
          selectedSnapshotObservationContractState: OWNER_CONTRACT_STATE.PENDING,
          selectedSnapshotObservationRefreshState:
          CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.IDLE,
          selectedSnapshotObservationNextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
          selectedSnapshotObservationReasonCodes:
          REPLAY_TEST_114859Z_OBSERVATION_REASON_CODES,
          selectedSnapshotRepairDeferred: true,
          selectedObservedNodeIds: REPLAY_TEST_114859Z_SELECTED_OBSERVED_NODE_IDS,
          selectedPublishedActiveNodeIds: REPLAY_TEST_114859Z_PUBLISHED_NODE_IDS,
          selectedMissingPublishedNodeIds:
          REPLAY_TEST_114859Z_MISSING_PUBLISHED_NODE_IDS,
        },
        priorityRecoveryObservation: {
          publicationEpoch: REPLAY_TEST_114859Z_PUBLICATION_EPOCH,
          priorityRecoveryPartitionWitnesses: [
            build114859ZPriorityRecoveryWitness(),
          ],
        },
      },
      logs: {
        excerptsByNodeId: {
          [REPLAY_TEST_114859Z_NODE_ID.SELECTED_STALE]: [
            build114859ZRepairLogLine({
              nodeId: REPLAY_TEST_114859Z_NODE_ID.SELECTED_STALE,
              failureCount: 1,
              retryAfterMs: REPLAY_TEST_114859Z_FIRST_REPAIR_RETRY_AFTER_MS,
            }),
            build114859ZRepairLogLine({
              nodeId: REPLAY_TEST_114859Z_NODE_ID.SELECTED_STALE,
              failureCount: 2,
              retryAfterMs: REPLAY_TEST_114859Z_SELECTED_REPAIR_RETRY_AFTER_MS,
            }),
          ],
          [REPLAY_TEST_114859Z_NODE_ID.SECONDARY]: [
            build114859ZRepairLogLine({
              nodeId: REPLAY_TEST_114859Z_NODE_ID.SECONDARY,
              failureCount: NUM.FOUR,
              retryAfterMs: REPLAY_TEST_114859Z_MAX_REPAIR_RETRY_AFTER_MS,
            }),
          ],
        },
      },
    };
  }

  function build114859ZSnapshot() {
    const partitionRows = build114859ZPartitionRows();
    return {
      timestamp: REPLAY_TEST_114859Z_TIMESTAMP_MS,
      nodes: build114859ZNodeRows(),
      nodeEndpoints: REPLAY_TEST_114859Z_NODE_ENDPOINT_ROWS,
      partitions: partitionRows,
      services: build114859ZServiceRows(partitionRows),
    };
  }

  function build123850ZNodeRows() {
    return REPLAY_TEST_123850Z_NODE_IDS.map((nodeId) => ({
      node_id: nodeId,
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      last_heartbeat: REPLAY_TEST_123850Z_TIMESTAMP_MS,
      ready_lease_expires_at:
      REPLAY_TEST_123850Z_TIMESTAMP_MS +
      REPLAY_TEST_123850Z_READY_LEASE_EXTENSION_MS,
    }));
  }

  function build123850ZPartitionRows() {
    const partitionRows = buildPriorityPartitionRows();
    for (
      let index = partitionRows.length;
      index < REPLAY_TEST_123850Z_PARTITION_ROW_COUNT;
      index += 1
    ) {
      const ordinal = index + 1;
      const tableId = `${REPLAY_TEST_123850Z_FILLER_TABLE_PREFIX}${ordinal}`;
      partitionRows.push({
        table_id: tableId,
        table_name: tableId,
        partition_id: `${tableId}${REPLAY_TEST_123850Z_FILLER_PARTITION_SUFFIX}`,
        state: REPLAY_TEST_PARTITION_STATE_NORMAL,
      });
    }
    return partitionRows;
  }

  function build123850ZServiceRows(partitionRows) {
    const serviceRows = [];
    for (const partitionRow of partitionRows) {
      for (const replicaOrdinal of REPLAY_TEST_123850Z_SEED_REPLICA_ORDINALS) {
        serviceRows.push(buildReplayServiceRow({
          nodeId: REPLAY_TEST_123850Z_NODE_ID.SEED,
          partitionId: partitionRow.partition_id,
          replicaOrdinal,
          raftRole: RAFT_ROLE.FOLLOWER,
          status: SERVICE_STATUS.ACTIVE,
        }));
      }
    }
    for (const tableId of REPLAY_TEST_123850Z_SELECTED_ACTIVE_PRIORITY_TABLE_IDS) {
      serviceRows.push(buildReplayServiceRow({
        nodeId: REPLAY_TEST_123850Z_NODE_ID.SELECTED_TIMEOUT,
        partitionId: INITIAL_PARTITION_IDS[tableId],
        replicaOrdinal: REPLAY_TEST_123850Z_SELECTED_REPLICA_ORDINAL,
        raftRole: RAFT_ROLE.FOLLOWER,
        status: SERVICE_STATUS.ACTIVE,
      }));
    }
    return serviceRows;
  }

  function build123850ZRepairLogLine() {
    return JSON.stringify({
      nodeId: REPLAY_TEST_123850Z_NODE_ID.PENDING_ACK,
      reason: REPLAY_TEST_123850Z_REPAIR_REASON,
      failedTables: [
        REPLAY_TEST_123850Z_NODES_TABLE,
      ],
      causeChain: [
        REPLAY_TEST_123850Z_CONTROL_PLANE_BACKPRESSURE,
      ],
      failureClass: REPLAY_TEST_123850Z_PRESSURE_OR_TIMEOUT,
      failureCount: REPLAY_TEST_123850Z_REPAIR_DEFERRAL_COUNT,
      retryAfterMs: REPLAY_TEST_123850Z_REPAIR_RETRY_AFTER_MS,
      readSource: REPLAY_TEST_123850Z_OWNER_RPC_LANE,
      msg: REPLAY_TEST_123850Z_AUTHORITATIVE_REPAIR_FAILED,
    });
  }

  function build123850ZOperationSchedulingWitness() {
    return {
      partitionId: REPLAY_TEST_123850Z_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
      semanticStateId: REPLAY_TEST_123850Z_OPERATION_SCHEDULING_STATE,
      spreadGap: REPLAY_TEST_123850Z_BLOCKED_PARTITION_SPREAD_GAP,
      readyDistinctNodeCount: REPLAY_TEST_123850Z_READY_DISTINCT_NODE_COUNT,
      requiredDistinctNodeCount: REPLAY_TEST_123850Z_REQUIRED_DISTINCT_NODE_COUNT,
      progressClassIds: [
        REPLAY_TEST_123850Z_ELIGIBLE_NO_OPERATION,
      ],
      blockerReasonCodes: [
        REPLAY_TEST_123850Z_ELIGIBLE_NO_OPERATION,
      ],
      actuationState: REPLAY_TEST_123850Z_ACTION_REQUIRED,
      currentOwner: REPLAY_TEST_123850Z_REBALANCER_LEADER,
      actuationOwner: REPLAY_TEST_123850Z_REBALANCER_LEADER,
      nextRequiredAction: REPLAY_TEST_123850Z_CREATE_RECOVERY_OPERATION,
      blockingBoundary: REPLAY_TEST_123850Z_OPERATION_SCHEDULING_BOUNDARY,
      waitMode: REPLAY_TEST_123850Z_EVENT_DRIVEN_WAIT_MODE,
      workflowProgressPhaseId: REPLAY_TEST_123850Z_WORKFLOW_PHASE_NONE,
      latestOperationWorkflowStep: REPLAY_TEST_123850Z_OPERATION_STATUS_UNAVAILABLE,
      latestOperationStatus: REPLAY_TEST_123850Z_OPERATION_STATUS_UNAVAILABLE,
      correlationKey: REPLAY_TEST_123850Z_SCHEDULING_CORRELATION_KEY,
      operationIds: [],
    };
  }

  function build123850ZWorkflowTimeoutWitness() {
    return {
      partitionId: REPLAY_TEST_123850Z_SQL_WRITE_PARTITION_ID,
      semanticStateId: REPLAY_TEST_123850Z_OPERATION_STALLED_STATE,
      spreadGap: REPLAY_TEST_123850Z_BLOCKED_PARTITION_SPREAD_GAP,
      readyDistinctNodeCount: REPLAY_TEST_123850Z_READY_DISTINCT_NODE_COUNT,
      requiredDistinctNodeCount: REPLAY_TEST_123850Z_REQUIRED_DISTINCT_NODE_COUNT,
      progressClassIds: [
        REPLAY_TEST_123850Z_OPERATION_NO_TRANSITIONS,
      ],
      blockerReasonCodes: [
        REPLAY_TEST_123850Z_OPERATION_NO_TRANSITIONS,
      ],
      actuationState: REPLAY_TEST_123850Z_TRANSITION_DEFERRED,
      currentOwner: REPLAY_TEST_123850Z_OPERATION_WORKFLOW_OWNER,
      actuationOwner: REPLAY_TEST_123850Z_OPERATION_WORKFLOW_OWNER,
      nextRequiredAction: REPLAY_TEST_123850Z_RECONCILE_STALE_OPERATION,
      blockingBoundary: REPLAY_TEST_123850Z_WORKFLOW_TIMEOUT_BOUNDARY,
      waitMode: REPLAY_TEST_123850Z_TIMEOUT_RECONCILE_DUE,
      workflowProgressPhaseId: REPLAY_TEST_123850Z_DISPATCH_PENDING,
      stepAgeMs: REPLAY_TEST_123850Z_WORKFLOW_STEP_AGE_MS,
      stepTimeoutMs: REPLAY_TEST_123850Z_WORKFLOW_STEP_TIMEOUT_MS,
      latestOperationWorkflowStep: REPLAY_TEST_123850Z_WORKFLOW_STEP_PENDING,
      latestOperationStatus: REPLAY_TEST_123850Z_OPERATION_STATUS_PENDING,
      operationIds: [
        REPLAY_TEST_123850Z_SQL_WRITE_OPERATION_ID,
      ],
      correlationKey: REPLAY_TEST_123850Z_SQL_WRITE_CORRELATION_KEY,
    };
  }

  function build123850ZFailureBundle() {
    const blockedPartitions = [
      REPLAY_TEST_123850Z_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
      REPLAY_TEST_123850Z_SQL_WRITE_PARTITION_ID,
    ].map((partitionId) => ({
      partitionId,
      requiredDistinctNodeCount: REPLAY_TEST_123850Z_REQUIRED_DISTINCT_NODE_COUNT,
      readyDistinctNodeCount: REPLAY_TEST_123850Z_READY_DISTINCT_NODE_COUNT,
      spreadGap: REPLAY_TEST_123850Z_BLOCKED_PARTITION_SPREAD_GAP,
    }));
    return {
      publicationConvergence: {
        publicationEpoch: REPLAY_TEST_123850Z_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING,
        recoveryProtocolState: REPLAY_TEST_123850Z_PUBLICATION_RECOVERY_STATE,
        publishedActiveNodeIds: REPLAY_TEST_123850Z_PUBLISHED_NODE_IDS,
        requiredAckNodeIds: REPLAY_TEST_123850Z_PUBLISHED_NODE_IDS,
        acknowledgedNodeIds: REPLAY_TEST_123850Z_ACKNOWLEDGED_NODE_IDS,
        pendingAckNodeIds: REPLAY_TEST_123850Z_PENDING_ACK_NODE_IDS,
        pendingAckCount: REPLAY_TEST_123850Z_PENDING_ACK_COUNT,
        missingPublishedNodeIds: [],
        missingPublishedCount: 0,
        prioritySpreadPending: true,
        priorityPartitionSummary: {
          satisfied: false,
          requiredDistinctNodeCount:
          REPLAY_TEST_123850Z_REQUIRED_DISTINCT_NODE_COUNT,
          readyEligibleNodeCount:
          REPLAY_TEST_123850Z_REQUIRED_DISTINCT_NODE_COUNT,
          totalPriorityPartitionCount: PRIORITY_CONTROL_PLANE_TABLE_IDS.size,
          missingPartitionIds: blockedPartitions.map((blockedPartition) =>
            blockedPartition.partitionId,
          ),
          blockedPartitions,
          blockedPartitionCount: blockedPartitions.length,
          largestSpreadGap: REPLAY_TEST_123850Z_BLOCKED_PARTITION_SPREAD_GAP,
          totalSpreadGap: REPLAY_TEST_123850Z_PRIORITY_SPREAD_GAP,
        },
      },
      controlPlane: {
        activeGateSnapshotCoverage: {
          expectedNodeCount: REPLAY_TEST_123850Z_EXPECTED_NODE_COUNT,
          bestCoverageNodeCount:
          REPLAY_TEST_123850Z_SELECTED_SNAPSHOT_COVERAGE_NODE_COUNT,
          selectedSnapshotNodeId:
          REPLAY_TEST_123850Z_NODE_ID.SELECTED_TIMEOUT,
          selectedAdminReady: false,
          selectedSnapshotAdminReady: false,
          selectedSnapshotReachabilityError:
          REPLAY_TEST_123850Z_REACHABILITY_ERROR,
          selectedSnapshotObservationMode:
          ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
          selectedSnapshotObservationState:
          CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.STALE_BUT_USABLE,
          selectedSnapshotObservationContractState: OWNER_CONTRACT_STATE.PENDING,
          selectedSnapshotObservationRefreshState:
          CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.IDLE,
          selectedSnapshotObservationNextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
          selectedSnapshotObservationReasonCodes:
          REPLAY_TEST_123850Z_OBSERVATION_REASON_CODES,
          selectedSnapshotRepairDeferred: true,
          selectedObservedNodeIds: REPLAY_TEST_123850Z_SELECTED_OBSERVED_NODE_IDS,
          selectedPublishedActiveNodeIds: REPLAY_TEST_123850Z_PUBLISHED_NODE_IDS,
          selectedMissingPublishedNodeIds:
          REPLAY_TEST_123850Z_MISSING_PUBLISHED_NODE_IDS,
        },
        priorityRecoveryObservation: {
          publicationEpoch: REPLAY_TEST_123850Z_PUBLICATION_EPOCH,
          priorityRecoveryPartitionWitnesses: [
            build123850ZOperationSchedulingWitness(),
            build123850ZWorkflowTimeoutWitness(),
          ],
        },
      },
      logs: {
        excerptsByNodeId: {
          [REPLAY_TEST_123850Z_NODE_ID.PENDING_ACK]: [
            build123850ZRepairLogLine(),
          ],
        },
      },
    };
  }

  function build123850ZSnapshot() {
    const partitionRows = build123850ZPartitionRows();
    return {
      timestamp: REPLAY_TEST_123850Z_TIMESTAMP_MS,
      nodes: build123850ZNodeRows(),
      nodeEndpoints: REPLAY_TEST_123850Z_NODE_ENDPOINT_ROWS,
      partitions: partitionRows,
      services: build123850ZServiceRows(partitionRows),
    };
  }

  function build132033ZNodeRows() {
    return REPLAY_TEST_132033Z_NODE_IDS.map((nodeId) => ({
      node_id: nodeId,
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      last_heartbeat: REPLAY_TEST_132033Z_TIMESTAMP_MS,
      ready_lease_expires_at:
      REPLAY_TEST_132033Z_TIMESTAMP_MS +
      REPLAY_TEST_132033Z_READY_LEASE_EXTENSION_MS,
    }));
  }

  function build132033ZPartitionRows() {
    const partitionRows = buildPriorityPartitionRows();
    for (
      let index = partitionRows.length;
      index < REPLAY_TEST_132033Z_PARTITION_ROW_COUNT;
      index += 1
    ) {
      const ordinal = index + 1;
      const tableId = `${REPLAY_TEST_132033Z_FILLER_TABLE_PREFIX}${ordinal}`;
      partitionRows.push({
        table_id: tableId,
        table_name: tableId,
        partition_id: `${tableId}${REPLAY_TEST_132033Z_FILLER_PARTITION_SUFFIX}`,
        state: REPLAY_TEST_PARTITION_STATE_NORMAL,
      });
    }
    return partitionRows;
  }

  function build132033ZServiceRows(partitionRows) {
    const serviceRows = [];
    for (const partitionRow of partitionRows) {
      for (const replicaOrdinal of REPLAY_TEST_132033Z_SEED_REPLICA_ORDINALS) {
        serviceRows.push(buildReplayServiceRow({
          nodeId: REPLAY_TEST_132033Z_NODE_ID.SEED,
          partitionId: partitionRow.partition_id,
          replicaOrdinal,
          raftRole: RAFT_ROLE.FOLLOWER,
          status: SERVICE_STATUS.ACTIVE,
        }));
      }
    }
    for (const tableId of REPLAY_TEST_132033Z_SECONDARY_ACTIVE_PRIORITY_TABLE_IDS) {
      serviceRows.push(buildReplayServiceRow({
        nodeId: REPLAY_TEST_132033Z_NODE_ID.SECONDARY,
        partitionId: INITIAL_PARTITION_IDS[tableId],
        replicaOrdinal: REPLAY_TEST_132033Z_EXTRA_REPLICA_ORDINAL,
        raftRole: RAFT_ROLE.FOLLOWER,
        status: SERVICE_STATUS.ACTIVE,
      }));
    }
    for (const tableId of REPLAY_TEST_132033Z_SELECTED_ACTIVE_PRIORITY_TABLE_IDS) {
      serviceRows.push(buildReplayServiceRow({
        nodeId: REPLAY_TEST_132033Z_NODE_ID.SELECTED_TIMEOUT,
        partitionId: INITIAL_PARTITION_IDS[tableId],
        replicaOrdinal: REPLAY_TEST_132033Z_EXTRA_REPLICA_ORDINAL,
        raftRole: RAFT_ROLE.FOLLOWER,
        status: SERVICE_STATUS.ACTIVE,
      }));
    }
    return serviceRows;
  }

  function build132033ZRepairLogLine(nodeId) {
    return JSON.stringify({
      nodeId,
      reason: REPLAY_TEST_132033Z_REPAIR_REASON,
      failedTables: [
        REPLAY_TEST_132033Z_NODES_TABLE,
      ],
      causeChain: [
        REPLAY_TEST_132033Z_CONTROL_PLANE_BACKPRESSURE,
      ],
      failureClass: REPLAY_TEST_132033Z_PRESSURE_OR_TIMEOUT,
      failureCount: REPLAY_TEST_132033Z_REPAIR_DEFERRAL_COUNT,
      retryAfterMs: REPLAY_TEST_132033Z_REPAIR_RETRY_AFTER_MS,
      readSource: REPLAY_TEST_132033Z_OWNER_RPC_LANE,
      msg: REPLAY_TEST_132033Z_AUTHORITATIVE_REPAIR_FAILED,
    });
  }

  function build132033ZPriorityRecoveryWitness(options) {
    return {
      partitionId: options.partitionId,
      semanticStateId: REPLAY_TEST_132033Z_SPREAD_SATISFIED_IN_FLIGHT,
      progressClassIds: [],
      spreadGap: REPLAY_TEST_132033Z_DURABLE_SPREAD_GAP,
      requiredDistinctNodeCount:
      REPLAY_TEST_132033Z_REQUIRED_DISTINCT_NODE_COUNT,
      transportPressureState: REPLAY_TEST_132033Z_WRITE_BACKLOG,
      actuationState: REPLAY_TEST_132033Z_DISPATCHED_WAITING_PROGRESS,
      actuationOwner: REPLAY_TEST_132033Z_OPERATION_WORKFLOW_OWNER,
      currentOwner: REPLAY_TEST_132033Z_OPERATION_WORKFLOW_OWNER,
      nextRequiredAction: REPLAY_TEST_132033Z_WAIT_FOR_OPERATION_PROGRESS,
      blockingBoundary: REPLAY_TEST_132033Z_WORKFLOW_PROGRESS_BOUNDARY,
      waitMode: REPLAY_TEST_132033Z_EVENT_DRIVEN_WAIT_MODE,
      workflowProgressPhaseId: REPLAY_TEST_132033Z_SOURCE_REMOVAL,
      stepAgeMs: options.stepAgeMs,
      stepTimeoutMs: options.stepTimeoutMs,
      pressureState: REPLAY_TEST_132033Z_WRITE_BACKLOG,
      pendingWrites: REPLAY_TEST_132033Z_OWNER_QUEUE_PENDING_WRITES,
      latestOperationWorkflowStep: options.latestOperationWorkflowStep,
      latestOperationStatus: options.latestOperationStatus,
      operationIds: [
        options.operationId,
      ],
      correlationKey: options.correlationKey,
    };
  }

  function build132033ZControlPlanePublicationWitness() {
    return build132033ZPriorityRecoveryWitness({
      partitionId: REPLAY_TEST_132033Z_CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
      operationId: REPLAY_TEST_132033Z_CONTROL_PLANE_OPERATION_ID,
      correlationKey: REPLAY_TEST_132033Z_CONTROL_PLANE_CORRELATION_KEY,
      latestOperationWorkflowStep: REPLAY_TEST_132033Z_WORKFLOW_STEP_ACTIVE,
      latestOperationStatus: REPLAY_TEST_132033Z_OPERATION_STATUS_ACTIVE,
      stepAgeMs: REPLAY_TEST_132033Z_CONTROL_PLANE_STEP_AGE_MS,
      stepTimeoutMs: REPLAY_TEST_132033Z_CONTROL_PLANE_STEP_TIMEOUT_MS,
    });
  }

  function build132033ZSqlWriteWitness() {
    return build132033ZPriorityRecoveryWitness({
      partitionId: REPLAY_TEST_132033Z_SQL_WRITE_PARTITION_ID,
      operationId: REPLAY_TEST_132033Z_SQL_WRITE_OPERATION_ID,
      correlationKey: REPLAY_TEST_132033Z_SQL_WRITE_CORRELATION_KEY,
      latestOperationWorkflowStep: REPLAY_TEST_132033Z_WORKFLOW_STEP_STOPPING,
      latestOperationStatus: REPLAY_TEST_132033Z_OPERATION_STATUS_REMOVING,
      stepAgeMs: REPLAY_TEST_132033Z_SQL_WRITE_STEP_AGE_MS,
      stepTimeoutMs: REPLAY_TEST_132033Z_SQL_WRITE_STEP_TIMEOUT_MS,
    });
  }

  function build132033ZBlockedPartitions() {
    return REPLAY_TEST_132033Z_PRIORITY_PARTITION_IDS.map((partitionId) => ({
      partitionId,
      requiredDistinctNodeCount:
      REPLAY_TEST_132033Z_REQUIRED_DISTINCT_NODE_COUNT,
      readyDistinctNodeCount:
      REPLAY_TEST_132033Z_REPLAY_READY_DISTINCT_NODE_COUNT,
      readyReplicaCount: REPLAY_TEST_132033Z_REPLAY_READY_REPLICA_COUNT,
      spreadGap: REPLAY_TEST_132033Z_REPLAY_SPREAD_GAP,
      // CL-021 witness pass-through (source commit 89147e21): per-row
      // exclusion attribution now survives summary normalization; this
      // snapshot has no excluded replicas so every partition reports {}.
      exclusionReasonCounts: Object.create(null),
    }));
  }

  return {
    build114859ZPartitionRows,
    build114859ZServiceRows,
    build114859ZRepairLogLine,
    build114859ZPriorityRecoveryWitness,
    build114859ZFailureBundle,
    build114859ZSnapshot,
    build123850ZNodeRows,
    build123850ZPartitionRows,
    build123850ZServiceRows,
    build123850ZRepairLogLine,
    build123850ZOperationSchedulingWitness,
    build123850ZWorkflowTimeoutWitness,
    build123850ZFailureBundle,
    build123850ZSnapshot,
    build132033ZNodeRows,
    build132033ZPartitionRows,
    build132033ZServiceRows,
    build132033ZRepairLogLine,
    build132033ZPriorityRecoveryWitness,
    build132033ZControlPlanePublicationWitness,
    build132033ZSqlWriteWitness,
    build132033ZBlockedPartitions,
  };
}
