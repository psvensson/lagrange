export function registerPublicationEvidenceReplayRuntimeAndOwnerTests(context) {
  const {
    ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE,
    assert,
    build102455ZFailureBundle,
    build102455ZSnapshot,
    build114859ZFailureBundle,
    build114859ZSnapshot,
    build123850ZFailureBundle,
    build123850ZSnapshot,
    buildFailureBundle,
    buildPriorityServiceRows,
    buildSnapshot,
    collectPriorityServicePartitionIds,
    CONTROL_PLANE_PUBLICATION_STATUS,
    CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE,
    CONTROL_PLANE_SNAPSHOT_REFRESH_STATE,
    countReplayServiceRows,
    formatPublicationEvidenceReplaySummary,
    it,
    join,
    OWNER_CONTRACT_NEXT_ACTION,
    OWNER_CONTRACT_STATE,
    PRIORITY_CONTROL_PLANE_TABLE_IDS,
    PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY,
    PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_CLASSIFICATION,
    PUBLICATION_EVIDENCE_REPLAY_DRIFT_CLASSIFICATION,
    RAFT_ROLE,
    REPLAY_TEST_102455Z_BASELINE_ACTIVE_SERVICE_ROW_COUNT,
    REPLAY_TEST_102455Z_DURABLE_PUBLICATION_EPOCH,
    REPLAY_TEST_102455Z_NODE_ENDPOINT_ROW_COUNT,
    REPLAY_TEST_102455Z_NODE_ID,
    REPLAY_TEST_102455Z_NODE_IDS,
    REPLAY_TEST_102455Z_PARTITION_ROW_COUNT,
    REPLAY_TEST_102455Z_PRIORITY_PARTITION_IDS,
    REPLAY_TEST_102455Z_PUBLICATION_RECOVERY_STATE,
    REPLAY_TEST_102455Z_REPLAYED_BLOCKED_PARTITION_ID,
    REPLAY_TEST_102455Z_REPLAYED_PUBLICATION_EPOCH,
    REPLAY_TEST_102455Z_SEED_ACTIVE_SERVICE_ROW_COUNT,
    REPLAY_TEST_102455Z_SERVICE_ROW_COUNT,
    REPLAY_TEST_102455Z_SERVICE_STATUS_SYNCING,
    REPLAY_TEST_102455Z_SYNCING_LEARNER_SERVICE_ROW_COUNT,
    REPLAY_TEST_102455Z_TEST_NAME,
    REPLAY_TEST_114859Z_CLOSURE_RECORD_ID,
    REPLAY_TEST_114859Z_CLOSURE_WITNESS_CLASS,
    REPLAY_TEST_114859Z_CONTROL_PLANE_BACKPRESSURE,
    REPLAY_TEST_114859Z_CORRELATION_KEY,
    REPLAY_TEST_114859Z_DISPATCH_PENDING,
    REPLAY_TEST_114859Z_EVENT_DRIVEN_WAIT_MODE,
    REPLAY_TEST_114859Z_EXPECTED_NODE_COUNT,
    REPLAY_TEST_114859Z_MAX_REPAIR_RETRY_AFTER_MS,
    REPLAY_TEST_114859Z_MISSING_PUBLISHED_NODE_IDS,
    REPLAY_TEST_114859Z_NODE_ENDPOINT_ROW_COUNT,
    REPLAY_TEST_114859Z_NODE_ID,
    REPLAY_TEST_114859Z_NODE_IDS,
    REPLAY_TEST_114859Z_NODES_TABLE,
    REPLAY_TEST_114859Z_OBSERVATION_REASON_CODES,
    REPLAY_TEST_114859Z_OPERATION_STATUS_PENDING,
    REPLAY_TEST_114859Z_OPERATION_WORKFLOW_OWNER,
    REPLAY_TEST_114859Z_OWNER_RPC_LANE,
    REPLAY_TEST_114859Z_PARTITION_ROW_COUNT,
    REPLAY_TEST_114859Z_PERSISTED_NOT_DISPATCHED,
    REPLAY_TEST_114859Z_PRESSURE_OR_TIMEOUT,
    REPLAY_TEST_114859Z_PRIORITY_PARTITION_IDS,
    REPLAY_TEST_114859Z_PRIORITY_RECOVERY_STATE,
    REPLAY_TEST_114859Z_PUBLICATION_EPOCH,
    REPLAY_TEST_114859Z_PUBLISHED_NODE_IDS,
    REPLAY_TEST_114859Z_RECOVERING_IN_FLIGHT,
    REPLAY_TEST_114859Z_REPAIR_DEFERRAL_COUNT,
    REPLAY_TEST_114859Z_REPAIR_DEFERRAL_STATE,
    REPLAY_TEST_114859Z_REQUIRED_DISTINCT_NODE_COUNT,
    REPLAY_TEST_114859Z_SECONDARY_ACTIVE_SERVICE_ROW_COUNT,
    REPLAY_TEST_114859Z_SEED_ACTIVE_SERVICE_ROW_COUNT,
    REPLAY_TEST_114859Z_SELECTED_REPAIR_DEFERRAL_COUNT,
    REPLAY_TEST_114859Z_SELECTED_REPAIR_RETRY_AFTER_MS,
    REPLAY_TEST_114859Z_SELECTED_SNAPSHOT_COVERAGE_NODE_COUNT,
    REPLAY_TEST_114859Z_SERVICE_ROW_COUNT,
    REPLAY_TEST_114859Z_SQL_WRITE_OPERATION_ID,
    REPLAY_TEST_114859Z_SQL_WRITE_PARTITION_ID,
    REPLAY_TEST_114859Z_TERTIARY_ACTIVE_SERVICE_ROW_COUNT,
    REPLAY_TEST_114859Z_TEST_NAME,
    REPLAY_TEST_114859Z_WAIT_FOR_OPERATION_PROGRESS,
    REPLAY_TEST_114859Z_WORKFLOW_PROGRESS_BOUNDARY,
    REPLAY_TEST_114859Z_WORKFLOW_STEP_PENDING,
    REPLAY_TEST_123850Z_CREATE_RECOVERY_OPERATION,
    REPLAY_TEST_123850Z_DISPATCH_PENDING,
    REPLAY_TEST_123850Z_ELIGIBLE_NO_OPERATION,
    REPLAY_TEST_123850Z_EVENT_DRIVEN_WAIT_MODE,
    REPLAY_TEST_123850Z_EXPECTED_NODE_COUNT,
    REPLAY_TEST_123850Z_MISSING_PUBLISHED_NODE_IDS,
    REPLAY_TEST_123850Z_NODE_ENDPOINT_ROW_COUNT,
    REPLAY_TEST_123850Z_NODE_ID,
    REPLAY_TEST_123850Z_NODE_IDS,
    REPLAY_TEST_123850Z_OBSERVATION_REASON_CODES,
    REPLAY_TEST_123850Z_OPERATION_NO_TRANSITIONS,
    REPLAY_TEST_123850Z_OPERATION_SCHEDULING_BOUNDARY,
    REPLAY_TEST_123850Z_OPERATION_SCHEDULING_STATE,
    REPLAY_TEST_123850Z_OPERATION_STALLED_STATE,
    REPLAY_TEST_123850Z_OPERATION_STATUS_PENDING,
    REPLAY_TEST_123850Z_OPERATION_WORKFLOW_OWNER,
    REPLAY_TEST_123850Z_PARTITION_ROW_COUNT,
    REPLAY_TEST_123850Z_PENDING_ACK_NODE_IDS,
    REPLAY_TEST_123850Z_PRIORITY_PARTITION_IDS,
    REPLAY_TEST_123850Z_PUBLICATION_EPOCH,
    REPLAY_TEST_123850Z_PUBLISHED_NODE_IDS,
    REPLAY_TEST_123850Z_REACHABILITY_ERROR,
    REPLAY_TEST_123850Z_REBALANCER_LEADER,
    REPLAY_TEST_123850Z_RECONCILE_STALE_OPERATION,
    REPLAY_TEST_123850Z_REPAIR_DEFERRAL_COUNT,
    REPLAY_TEST_123850Z_REPAIR_DEFERRAL_STATE,
    REPLAY_TEST_123850Z_SEED_ACTIVE_SERVICE_ROW_COUNT,
    REPLAY_TEST_123850Z_SELECTED_ACTIVE_SERVICE_ROW_COUNT,
    REPLAY_TEST_123850Z_SELECTED_REPAIR_DEFERRAL_COUNT,
    REPLAY_TEST_123850Z_SELECTED_SNAPSHOT_COVERAGE_NODE_COUNT,
    REPLAY_TEST_123850Z_SERVICE_ROW_COUNT,
    REPLAY_TEST_123850Z_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
    REPLAY_TEST_123850Z_SQL_WRITE_CORRELATION_KEY,
    REPLAY_TEST_123850Z_SQL_WRITE_OPERATION_ID,
    REPLAY_TEST_123850Z_SQL_WRITE_PARTITION_ID,
    REPLAY_TEST_123850Z_TEST_NAME,
    REPLAY_TEST_123850Z_TIMEOUT_RECONCILE_DUE,
    REPLAY_TEST_123850Z_TRANSITION_DEFERRED,
    REPLAY_TEST_123850Z_WORKFLOW_STEP_AGE_MS,
    REPLAY_TEST_123850Z_WORKFLOW_STEP_PENDING,
    REPLAY_TEST_123850Z_WORKFLOW_STEP_TIMEOUT_MS,
    REPLAY_TEST_123850Z_WORKFLOW_TIMEOUT_BOUNDARY,
    REPLAY_TEST_CLOSURE_RECORD_ID,
    REPLAY_TEST_CLOSURE_WITNESS_CLASS,
    REPLAY_TEST_CLOSURE_WITNESS_STATE,
    REPLAY_TEST_COMPARISON_LABEL_PATTERN,
    REPLAY_TEST_DURABLE_BLOCKED_PARTITION_ID,
    REPLAY_TEST_ENCODING,
    REPLAY_TEST_FAILURE_BUNDLE_FILE,
    REPLAY_TEST_NEWLINE,
    REPLAY_TEST_NODE_IDS,
    REPLAY_TEST_NOW_MS,
    REPLAY_TEST_OLDER_TIMESTAMP_MS,
    REPLAY_TEST_RUNTIME_DERIVATION_TEST_NAME,
    REPLAY_TEST_SNAPSHOTS_FILE,
    replayPublicationPriorityEvidenceFromReportDir,
    SERVICE_STATUS,
    writeFile,
  } = context;
  let tempDir;
  const refreshState = () => {
    tempDir = context.state.tempDir;
  };

  it(REPLAY_TEST_RUNTIME_DERIVATION_TEST_NAME, async () => {
    refreshState();
    const spreadSatisfiedSnapshot = buildSnapshot(
      REPLAY_TEST_NOW_MS,
      buildPriorityServiceRows(),
    );
    const staleSnapshot = buildSnapshot(REPLAY_TEST_OLDER_TIMESTAMP_MS, []);
    await writeFile(
      join(tempDir, REPLAY_TEST_FAILURE_BUNDLE_FILE),
      JSON.stringify(buildFailureBundle()),
      REPLAY_TEST_ENCODING,
    );
    await writeFile(
      join(tempDir, REPLAY_TEST_SNAPSHOTS_FILE),
      [
        JSON.stringify(staleSnapshot),
        JSON.stringify(spreadSatisfiedSnapshot),
      ].join(REPLAY_TEST_NEWLINE),
      REPLAY_TEST_ENCODING,
    );

    const replaySummary = await replayPublicationPriorityEvidenceFromReportDir(tempDir);

    assert.equal(replaySummary.snapshotTimestamp, REPLAY_TEST_NOW_MS);
    assert.equal(replaySummary.comparison.durableSatisfied, false);
    assert.equal(replaySummary.comparison.replayedSatisfied, true);
    assert.equal(replaySummary.comparison.summaryChanged, true);
    assert.equal(
      replaySummary.comparison.driftClassification,
      PUBLICATION_EVIDENCE_REPLAY_DRIFT_CLASSIFICATION
        .DURABLE_STALE_REPLAYED_SATISFIED,
    );
    assert.deepEqual(replaySummary.comparison.durableBlockedPartitionIds, [
      REPLAY_TEST_DURABLE_BLOCKED_PARTITION_ID,
    ]);
    assert.deepEqual(replaySummary.comparison.replayedBlockedPartitionIds, []);
    assert.equal(
      replaySummary.replayedPublication.closureWitness.state,
      REPLAY_TEST_CLOSURE_WITNESS_STATE,
    );
    assert.equal(
      replaySummary.replayedPublication.closureWitness.closureRecordId,
      REPLAY_TEST_CLOSURE_RECORD_ID,
    );
    assert.equal(
      replaySummary.replayedPublication.closureWitness.closureWitnessClass,
      REPLAY_TEST_CLOSURE_WITNESS_CLASS,
    );
    assert.equal(
      replaySummary.comparison.closureWitnessClassification,
      PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_CLASSIFICATION
        .REFRESH_REQUIRED,
    );
    assert.equal(
      replaySummary.comparison.closureWitnessPublicationRefreshRequired,
      true,
    );
    assert.equal(
      replaySummary.rowCounts.services,
      PRIORITY_CONTROL_PLANE_TABLE_IDS.size * REPLAY_TEST_NODE_IDS.length,
    );
    assert.match(
      formatPublicationEvidenceReplaySummary(replaySummary),
      REPLAY_TEST_COMPARISON_LABEL_PATTERN,
    );
  });

  it(REPLAY_TEST_102455Z_TEST_NAME, async () => {
    refreshState();
    const snapshot = build102455ZSnapshot();

    await writeFile(
      join(tempDir, REPLAY_TEST_FAILURE_BUNDLE_FILE),
      JSON.stringify(build102455ZFailureBundle()),
      REPLAY_TEST_ENCODING,
    );
    await writeFile(
      join(tempDir, REPLAY_TEST_SNAPSHOTS_FILE),
      JSON.stringify(snapshot),
      REPLAY_TEST_ENCODING,
    );

    const replaySummary = await replayPublicationPriorityEvidenceFromReportDir(tempDir);

    assert.deepEqual(
      collectPriorityServicePartitionIds(
        snapshot.services,
        REPLAY_TEST_102455Z_PRIORITY_PARTITION_IDS,
      ),
      REPLAY_TEST_102455Z_PRIORITY_PARTITION_IDS,
    );
    assert.equal(
      countReplayServiceRows(snapshot.services, {
        nodeId: REPLAY_TEST_102455Z_NODE_ID.SEED,
        status: SERVICE_STATUS.ACTIVE,
      }),
      REPLAY_TEST_102455Z_SEED_ACTIVE_SERVICE_ROW_COUNT,
    );
    assert.equal(
      countReplayServiceRows(snapshot.services, {
        nodeId: REPLAY_TEST_102455Z_NODE_ID.BASELINE,
        status: SERVICE_STATUS.ACTIVE,
      }),
      REPLAY_TEST_102455Z_BASELINE_ACTIVE_SERVICE_ROW_COUNT,
    );
    assert.equal(
      countReplayServiceRows(snapshot.services, {
        nodeId: REPLAY_TEST_102455Z_NODE_ID.BASELINE,
        status: REPLAY_TEST_102455Z_SERVICE_STATUS_SYNCING,
        raftRole: RAFT_ROLE.LEARNER,
      }),
      REPLAY_TEST_102455Z_SYNCING_LEARNER_SERVICE_ROW_COUNT,
    );
    assert.equal(
      replaySummary.rowCounts.nodes,
      REPLAY_TEST_102455Z_NODE_IDS.length,
    );
    assert.equal(
      replaySummary.rowCounts.nodeEndpoints,
      REPLAY_TEST_102455Z_NODE_ENDPOINT_ROW_COUNT,
    );
    assert.equal(
      replaySummary.rowCounts.partitions,
      REPLAY_TEST_102455Z_PARTITION_ROW_COUNT,
    );
    assert.equal(
      replaySummary.rowCounts.services,
      REPLAY_TEST_102455Z_SERVICE_ROW_COUNT,
    );
    assert.equal(
      replaySummary.durablePublication.epoch,
      REPLAY_TEST_102455Z_DURABLE_PUBLICATION_EPOCH,
    );
    assert.equal(
      replaySummary.replayedPublication.epoch,
      REPLAY_TEST_102455Z_REPLAYED_PUBLICATION_EPOCH,
    );
    assert.equal(
      replaySummary.replayedPublication.status,
      CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
    );
    assert.equal(
      replaySummary.replayedPublication.recoveryProtocolState,
      REPLAY_TEST_102455Z_PUBLICATION_RECOVERY_STATE,
    );
    assert.equal(replaySummary.comparison.replayedSatisfied, false);
    assert.equal(
      replaySummary.comparison.driftClassification,
      PUBLICATION_EVIDENCE_REPLAY_DRIFT_CLASSIFICATION.REPLAYED_BLOCKED,
    );
    assert.ok(
      replaySummary.comparison.replayedBlockedPartitionIds.includes(
        REPLAY_TEST_102455Z_REPLAYED_BLOCKED_PARTITION_ID,
      ),
    );
  });

  it(REPLAY_TEST_114859Z_TEST_NAME, async () => {
    refreshState();
    const snapshot = build114859ZSnapshot();

    await writeFile(
      join(tempDir, REPLAY_TEST_FAILURE_BUNDLE_FILE),
      JSON.stringify(build114859ZFailureBundle()),
      REPLAY_TEST_ENCODING,
    );
    await writeFile(
      join(tempDir, REPLAY_TEST_SNAPSHOTS_FILE),
      JSON.stringify(snapshot),
      REPLAY_TEST_ENCODING,
    );

    const replaySummary = await replayPublicationPriorityEvidenceFromReportDir(tempDir);

    assert.deepEqual(
      collectPriorityServicePartitionIds(
        snapshot.services,
        REPLAY_TEST_114859Z_PRIORITY_PARTITION_IDS,
      ),
      REPLAY_TEST_114859Z_PRIORITY_PARTITION_IDS,
    );
    assert.equal(
      countReplayServiceRows(snapshot.services, {
        nodeId: REPLAY_TEST_114859Z_NODE_ID.SEED,
        status: SERVICE_STATUS.ACTIVE,
      }),
      REPLAY_TEST_114859Z_SEED_ACTIVE_SERVICE_ROW_COUNT,
    );
    assert.equal(
      countReplayServiceRows(snapshot.services, {
        nodeId: REPLAY_TEST_114859Z_NODE_ID.SECONDARY,
        status: SERVICE_STATUS.ACTIVE,
      }),
      REPLAY_TEST_114859Z_SECONDARY_ACTIVE_SERVICE_ROW_COUNT,
    );
    assert.equal(
      countReplayServiceRows(snapshot.services, {
        nodeId: REPLAY_TEST_114859Z_NODE_ID.TERTIARY,
        status: SERVICE_STATUS.ACTIVE,
      }),
      REPLAY_TEST_114859Z_TERTIARY_ACTIVE_SERVICE_ROW_COUNT,
    );
    assert.equal(
      replaySummary.rowCounts.nodes,
      REPLAY_TEST_114859Z_NODE_IDS.length,
    );
    assert.equal(
      replaySummary.rowCounts.nodeEndpoints,
      REPLAY_TEST_114859Z_NODE_ENDPOINT_ROW_COUNT,
    );
    assert.equal(
      replaySummary.rowCounts.partitions,
      REPLAY_TEST_114859Z_PARTITION_ROW_COUNT,
    );
    assert.equal(
      replaySummary.rowCounts.services,
      REPLAY_TEST_114859Z_SERVICE_ROW_COUNT,
    );
    assert.equal(
      replaySummary.durablePublication.epoch,
      REPLAY_TEST_114859Z_PUBLICATION_EPOCH,
    );
    assert.equal(
      replaySummary.durablePublication.status,
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
    );
    assert.equal(
      replaySummary.durablePublication.closureRecordId,
      REPLAY_TEST_114859Z_CLOSURE_RECORD_ID,
    );
    assert.equal(
      replaySummary.durablePublication.closureWitnessClass,
      REPLAY_TEST_114859Z_CLOSURE_WITNESS_CLASS,
    );
    assert.equal(
      replaySummary.replayedPublication.epoch,
      REPLAY_TEST_114859Z_PUBLICATION_EPOCH,
    );
    assert.equal(
      replaySummary.replayedPublication.status,
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
    );
    assert.equal(
      replaySummary.replayedPublication.recoveryProtocolState,
      REPLAY_TEST_114859Z_PRIORITY_RECOVERY_STATE,
    );
    assert.equal(replaySummary.comparison.replayedSatisfied, false);
    assert.equal(
      replaySummary.comparison.driftClassification,
      PUBLICATION_EVIDENCE_REPLAY_DRIFT_CLASSIFICATION.REPLAYED_BLOCKED,
    );
    assert.ok(
      replaySummary.comparison.replayedBlockedPartitionIds.includes(
        REPLAY_TEST_114859Z_SQL_WRITE_PARTITION_ID,
      ),
    );
    assert.equal(
      replaySummary.selectedSnapshotObservation.availability,
      PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE,
    );
    assert.equal(
      replaySummary.selectedSnapshotObservation.selectedSnapshotNodeId,
      REPLAY_TEST_114859Z_NODE_ID.SELECTED_STALE,
    );
    assert.equal(
      replaySummary.selectedSnapshotObservation.selectedAdminReady,
      true,
    );
    assert.equal(
      replaySummary.selectedSnapshotObservation.selectedSnapshotObservationMode,
      ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
    );
    assert.equal(
      replaySummary.selectedSnapshotObservation.selectedSnapshotObservationState,
      CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.STALE_BUT_USABLE,
    );
    assert.equal(
      replaySummary.selectedSnapshotObservation
        .selectedSnapshotObservationContractState,
      OWNER_CONTRACT_STATE.PENDING,
    );
    assert.equal(
      replaySummary.selectedSnapshotObservation
        .selectedSnapshotObservationRefreshState,
      CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.IDLE,
    );
    assert.equal(
      replaySummary.selectedSnapshotObservation.selectedSnapshotObservationNextAction,
      OWNER_CONTRACT_NEXT_ACTION.WAIT,
    );
    assert.deepEqual(
      replaySummary.selectedSnapshotObservation
        .selectedSnapshotObservationReasonCodes,
      REPLAY_TEST_114859Z_OBSERVATION_REASON_CODES,
    );
    assert.equal(
      replaySummary.selectedSnapshotObservation.selectedSnapshotRepairDeferred,
      true,
    );
    assert.deepEqual(
      replaySummary.selectedSnapshotObservation.selectedPublishedActiveNodeIds,
      REPLAY_TEST_114859Z_PUBLISHED_NODE_IDS,
    );
    assert.deepEqual(
      replaySummary.selectedSnapshotObservation.selectedMissingPublishedNodeIds,
      REPLAY_TEST_114859Z_MISSING_PUBLISHED_NODE_IDS,
    );
    assert.equal(
      replaySummary.selectedSnapshotObservation.selectedPublishedActiveNodeIds.length,
      REPLAY_TEST_114859Z_REQUIRED_DISTINCT_NODE_COUNT,
    );
    assert.equal(
      replaySummary.selectedSnapshotObservation.expectedNodeCount,
      REPLAY_TEST_114859Z_EXPECTED_NODE_COUNT,
    );
    assert.equal(
      replaySummary.selectedSnapshotObservation.bestCoverageNodeCount,
      REPLAY_TEST_114859Z_SELECTED_SNAPSHOT_COVERAGE_NODE_COUNT,
    );
    assert.equal(
      replaySummary.ownerRpcCacheRepair.availability,
      PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE,
    );
    assert.equal(
      replaySummary.ownerRpcCacheRepair.deferralState,
      REPLAY_TEST_114859Z_REPAIR_DEFERRAL_STATE,
    );
    assert.equal(
      replaySummary.ownerRpcCacheRepair.matchingDeferralCount,
      REPLAY_TEST_114859Z_REPAIR_DEFERRAL_COUNT,
    );
    assert.equal(
      replaySummary.ownerRpcCacheRepair.selectedWitnessDeferralCount,
      REPLAY_TEST_114859Z_SELECTED_REPAIR_DEFERRAL_COUNT,
    );
    assert.equal(
      replaySummary.ownerRpcCacheRepair.selectedWitnessLatestRetryAfterMs,
      REPLAY_TEST_114859Z_SELECTED_REPAIR_RETRY_AFTER_MS,
    );
    assert.equal(
      replaySummary.ownerRpcCacheRepair.latestRetryAfterMs,
      REPLAY_TEST_114859Z_MAX_REPAIR_RETRY_AFTER_MS,
    );
    assert.deepEqual(
      replaySummary.ownerRpcCacheRepair.failedTableNames,
      [
        REPLAY_TEST_114859Z_NODES_TABLE,
      ],
    );
    assert.deepEqual(
      replaySummary.ownerRpcCacheRepair.readSources,
      [
        REPLAY_TEST_114859Z_OWNER_RPC_LANE,
      ],
    );
    assert.deepEqual(
      replaySummary.ownerRpcCacheRepair.causeChain,
      [
        REPLAY_TEST_114859Z_CONTROL_PLANE_BACKPRESSURE,
      ],
    );
    assert.deepEqual(
      replaySummary.ownerRpcCacheRepair.failureClasses,
      [
        REPLAY_TEST_114859Z_PRESSURE_OR_TIMEOUT,
      ],
    );
    assert.equal(
      replaySummary.supportingPriorityRecoveryWitness.availability,
      PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE,
    );
    assert.equal(
      replaySummary.supportingPriorityRecoveryWitness.partitionId,
      REPLAY_TEST_114859Z_SQL_WRITE_PARTITION_ID,
    );
    assert.equal(
      replaySummary.supportingPriorityRecoveryWitness.semanticStateId,
      REPLAY_TEST_114859Z_RECOVERING_IN_FLIGHT,
    );
    assert.equal(
      replaySummary.supportingPriorityRecoveryWitness.currentOwner,
      REPLAY_TEST_114859Z_OPERATION_WORKFLOW_OWNER,
    );
    assert.equal(
      replaySummary.supportingPriorityRecoveryWitness.blockingBoundary,
      REPLAY_TEST_114859Z_WORKFLOW_PROGRESS_BOUNDARY,
    );
    assert.equal(
      replaySummary.supportingPriorityRecoveryWitness.waitMode,
      REPLAY_TEST_114859Z_EVENT_DRIVEN_WAIT_MODE,
    );
    assert.equal(
      replaySummary.supportingPriorityRecoveryWitness.nextRequiredAction,
      REPLAY_TEST_114859Z_WAIT_FOR_OPERATION_PROGRESS,
    );
    assert.equal(
      replaySummary.supportingPriorityRecoveryWitness.actuationState,
      REPLAY_TEST_114859Z_PERSISTED_NOT_DISPATCHED,
    );
    assert.equal(
      replaySummary.supportingPriorityRecoveryWitness.workflowProgressPhaseId,
      REPLAY_TEST_114859Z_DISPATCH_PENDING,
    );
    assert.equal(
      replaySummary.supportingPriorityRecoveryWitness.latestOperationWorkflowStep,
      REPLAY_TEST_114859Z_WORKFLOW_STEP_PENDING,
    );
    assert.equal(
      replaySummary.supportingPriorityRecoveryWitness.latestOperationStatus,
      REPLAY_TEST_114859Z_OPERATION_STATUS_PENDING,
    );
    assert.equal(
      replaySummary.supportingPriorityRecoveryWitness.operationId,
      REPLAY_TEST_114859Z_SQL_WRITE_OPERATION_ID,
    );
    assert.equal(
      replaySummary.supportingPriorityRecoveryWitness.correlationKey,
      REPLAY_TEST_114859Z_CORRELATION_KEY,
    );
  });

  it(REPLAY_TEST_123850Z_TEST_NAME, async () => {
    refreshState();
    const snapshot = build123850ZSnapshot();

    await writeFile(
      join(tempDir, REPLAY_TEST_FAILURE_BUNDLE_FILE),
      JSON.stringify(build123850ZFailureBundle()),
      REPLAY_TEST_ENCODING,
    );
    await writeFile(
      join(tempDir, REPLAY_TEST_SNAPSHOTS_FILE),
      JSON.stringify(snapshot),
      REPLAY_TEST_ENCODING,
    );

    const replaySummary = await replayPublicationPriorityEvidenceFromReportDir(tempDir);
    const operationSchedulingWitness =
      replaySummary.priorityRecoveryWitnesses.find((witness) =>
        witness.partitionId ===
        REPLAY_TEST_123850Z_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
      );
    const workflowTimeoutWitness =
      replaySummary.priorityRecoveryWitnesses.find((witness) =>
        witness.partitionId === REPLAY_TEST_123850Z_SQL_WRITE_PARTITION_ID,
      );

    assert.deepEqual(
      collectPriorityServicePartitionIds(
        snapshot.services,
        REPLAY_TEST_123850Z_PRIORITY_PARTITION_IDS,
      ),
      REPLAY_TEST_123850Z_PRIORITY_PARTITION_IDS,
    );
    assert.equal(
      countReplayServiceRows(snapshot.services, {
        nodeId: REPLAY_TEST_123850Z_NODE_ID.SEED,
        status: SERVICE_STATUS.ACTIVE,
      }),
      REPLAY_TEST_123850Z_SEED_ACTIVE_SERVICE_ROW_COUNT,
    );
    assert.equal(
      countReplayServiceRows(snapshot.services, {
        nodeId: REPLAY_TEST_123850Z_NODE_ID.SELECTED_TIMEOUT,
        status: SERVICE_STATUS.ACTIVE,
      }),
      REPLAY_TEST_123850Z_SELECTED_ACTIVE_SERVICE_ROW_COUNT,
    );
    assert.equal(
      replaySummary.rowCounts.nodes,
      REPLAY_TEST_123850Z_NODE_IDS.length,
    );
    assert.equal(
      replaySummary.rowCounts.nodeEndpoints,
      REPLAY_TEST_123850Z_NODE_ENDPOINT_ROW_COUNT,
    );
    assert.equal(
      replaySummary.rowCounts.partitions,
      REPLAY_TEST_123850Z_PARTITION_ROW_COUNT,
    );
    assert.equal(
      replaySummary.rowCounts.services,
      REPLAY_TEST_123850Z_SERVICE_ROW_COUNT,
    );
    assert.equal(
      replaySummary.durablePublication.epoch,
      REPLAY_TEST_123850Z_PUBLICATION_EPOCH,
    );
    assert.equal(
      replaySummary.durablePublication.status,
      CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING,
    );
    assert.equal(
      replaySummary.replayedPublication.epoch,
      REPLAY_TEST_123850Z_PUBLICATION_EPOCH,
    );
    assert.equal(
      replaySummary.replayedPublication.status,
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
    );
    assert.equal(
      replaySummary.replayedPublication.recoveryProtocolState,
      'priority_spread_pending',
    );
    assert.equal(replaySummary.comparison.replayedSatisfied, false);
    assert.equal(
      replaySummary.comparison.driftClassification,
      PUBLICATION_EVIDENCE_REPLAY_DRIFT_CLASSIFICATION.REPLAYED_BLOCKED,
    );
    assert.equal(
      replaySummary.selectedSnapshotObservation.availability,
      PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE,
    );
    assert.equal(
      replaySummary.selectedSnapshotObservation.selectedSnapshotNodeId,
      REPLAY_TEST_123850Z_NODE_ID.SELECTED_TIMEOUT,
    );
    assert.equal(
      replaySummary.selectedSnapshotObservation.selectedAdminReady,
      false,
    );
    assert.equal(
      replaySummary.selectedSnapshotObservation.selectedSnapshotAdminReady,
      false,
    );
    assert.equal(
      replaySummary.selectedSnapshotObservation
        .selectedSnapshotReachabilityError,
      REPLAY_TEST_123850Z_REACHABILITY_ERROR,
    );
    assert.equal(
      replaySummary.selectedSnapshotObservation.bestCoverageNodeCount,
      REPLAY_TEST_123850Z_SELECTED_SNAPSHOT_COVERAGE_NODE_COUNT,
    );
    assert.equal(
      replaySummary.selectedSnapshotObservation.expectedNodeCount,
      REPLAY_TEST_123850Z_EXPECTED_NODE_COUNT,
    );
    assert.equal(
      replaySummary.selectedSnapshotObservation.selectedSnapshotObservationMode,
      ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
    );
    assert.equal(
      replaySummary.selectedSnapshotObservation.selectedSnapshotObservationState,
      CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.STALE_BUT_USABLE,
    );
    assert.deepEqual(
      replaySummary.selectedSnapshotObservation
        .selectedSnapshotObservationReasonCodes,
      REPLAY_TEST_123850Z_OBSERVATION_REASON_CODES,
    );
    assert.deepEqual(
      replaySummary.selectedSnapshotObservation.selectedPublishedActiveNodeIds,
      REPLAY_TEST_123850Z_PUBLISHED_NODE_IDS,
    );
    assert.deepEqual(
      replaySummary.selectedSnapshotObservation.selectedMissingPublishedNodeIds,
      REPLAY_TEST_123850Z_MISSING_PUBLISHED_NODE_IDS,
    );
    assert.equal(
      replaySummary.ownerRpcCacheRepair.availability,
      PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE,
    );
    assert.equal(
      replaySummary.ownerRpcCacheRepair.deferralState,
      REPLAY_TEST_123850Z_REPAIR_DEFERRAL_STATE,
    );
    assert.equal(
      replaySummary.ownerRpcCacheRepair.matchingDeferralCount,
      REPLAY_TEST_123850Z_REPAIR_DEFERRAL_COUNT,
    );
    assert.equal(
      replaySummary.ownerRpcCacheRepair.selectedWitnessDeferralCount,
      REPLAY_TEST_123850Z_SELECTED_REPAIR_DEFERRAL_COUNT,
    );
    assert.deepEqual(
      replaySummary.ownerRpcCacheRepair.nodeIds,
      REPLAY_TEST_123850Z_PENDING_ACK_NODE_IDS,
    );
    assert.equal(
      replaySummary.supportingPriorityRecoveryWitness.partitionId,
      REPLAY_TEST_123850Z_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
    );
    assert.ok(operationSchedulingWitness);
    assert.equal(
      operationSchedulingWitness.semanticStateId,
      REPLAY_TEST_123850Z_OPERATION_SCHEDULING_STATE,
    );
    assert.equal(
      operationSchedulingWitness.currentOwner,
      REPLAY_TEST_123850Z_REBALANCER_LEADER,
    );
    assert.equal(
      operationSchedulingWitness.blockingBoundary,
      REPLAY_TEST_123850Z_OPERATION_SCHEDULING_BOUNDARY,
    );
    assert.equal(
      operationSchedulingWitness.waitMode,
      REPLAY_TEST_123850Z_EVENT_DRIVEN_WAIT_MODE,
    );
    assert.equal(
      operationSchedulingWitness.nextRequiredAction,
      REPLAY_TEST_123850Z_CREATE_RECOVERY_OPERATION,
    );
    assert.deepEqual(
      operationSchedulingWitness.progressClassIds,
      [
        REPLAY_TEST_123850Z_ELIGIBLE_NO_OPERATION,
      ],
    );
    assert.ok(workflowTimeoutWitness);
    assert.equal(
      workflowTimeoutWitness.semanticStateId,
      REPLAY_TEST_123850Z_OPERATION_STALLED_STATE,
    );
    assert.equal(
      workflowTimeoutWitness.currentOwner,
      REPLAY_TEST_123850Z_OPERATION_WORKFLOW_OWNER,
    );
    assert.equal(
      workflowTimeoutWitness.blockingBoundary,
      REPLAY_TEST_123850Z_WORKFLOW_TIMEOUT_BOUNDARY,
    );
    assert.equal(
      workflowTimeoutWitness.waitMode,
      REPLAY_TEST_123850Z_TIMEOUT_RECONCILE_DUE,
    );
    assert.equal(
      workflowTimeoutWitness.nextRequiredAction,
      REPLAY_TEST_123850Z_RECONCILE_STALE_OPERATION,
    );
    assert.equal(
      workflowTimeoutWitness.actuationState,
      REPLAY_TEST_123850Z_TRANSITION_DEFERRED,
    );
    assert.equal(
      workflowTimeoutWitness.workflowProgressPhaseId,
      REPLAY_TEST_123850Z_DISPATCH_PENDING,
    );
    assert.equal(
      workflowTimeoutWitness.latestOperationWorkflowStep,
      REPLAY_TEST_123850Z_WORKFLOW_STEP_PENDING,
    );
    assert.equal(
      workflowTimeoutWitness.latestOperationStatus,
      REPLAY_TEST_123850Z_OPERATION_STATUS_PENDING,
    );
    assert.equal(
      workflowTimeoutWitness.stepAgeMs,
      REPLAY_TEST_123850Z_WORKFLOW_STEP_AGE_MS,
    );
    assert.equal(
      workflowTimeoutWitness.stepTimeoutMs,
      REPLAY_TEST_123850Z_WORKFLOW_STEP_TIMEOUT_MS,
    );
    assert.equal(
      workflowTimeoutWitness.operationId,
      REPLAY_TEST_123850Z_SQL_WRITE_OPERATION_ID,
    );
    assert.equal(
      workflowTimeoutWitness.correlationKey,
      REPLAY_TEST_123850Z_SQL_WRITE_CORRELATION_KEY,
    );
    assert.deepEqual(
      workflowTimeoutWitness.progressClassIds,
      [
        REPLAY_TEST_123850Z_OPERATION_NO_TRANSITIONS,
      ],
    );
  });
}
