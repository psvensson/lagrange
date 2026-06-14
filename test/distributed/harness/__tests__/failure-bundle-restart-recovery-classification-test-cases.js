export function registerFailureBundleRestartRecoveryClassificationTests(context) {
  const {
    it,
    assert,
    buildPublicationConvergenceSummary,
    FAILURE_BUNDLE_FOUNDATION,
    FAILURE_CLASS_STARTUP_RECOVERY_BLOCKED,
    join,
    mergeControlPlaneDiagnostics,
    PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK,
    readFile,
    ReportWriter,
    resolve,
    STABILITY_GATE_BLOCKER_ADMIN_REACHABILITY_REFUSED,
    UTF8_ENCODING,
    writeFailureBundlesForReport,
  } = context;
  let tempDir;
  const refreshState = () => {
    tempDir = context.state.tempDir;
  };

  it(
    'classifies restarted-node recovery readiness timeout as restart recovery',
    async () => {
      refreshState();
      const RESTART_RECOVERY_REPORT_PATH = join(
        tempDir,
        'restart-recovery-priority-spread-report.json',
      );
      const SCENARIO_NAME = 'rolling-restart';
      const RESTART_RECOVERY_ERROR =
        'Restarted node did not become recovery-ready within 120000ms';
      const STALE_STARTUP_REASON = 'snapshot_reachability_timeout';
      const ROOT_CAUSE_CLASS_STARTUP = 'startup';
      const ROOT_CAUSE_CLASS_TOPOLOGY = 'topology';
      const FAILURE_BARRIER_PHASE = 'restart_recovery';
      const FAILURE_BARRIER_REASON = 'priority_spread_pending';
      const FAILURE_BARRIER_SIGNAL =
        'failureBarrier=' + FAILURE_BARRIER_PHASE;
      const FAILURE_BARRIER_REASON_SIGNAL =
        'failureBarrierReason=' + FAILURE_BARRIER_REASON;
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD =
        'priority_spread_pending';
      const PRIORITY_RECOVERY_REASON_CODE =
        'priority_partitions_not_spread';
      const PRIORITY_RECOVERY_PARTITION_ID = 'sql_write_operations-p1';
      const NON_DOMINANT_PRIORITY_RECOVERY_PARTITION_ID =
        'control_plane_publications-p1';
      const PRIORITY_RECOVERY_SEMANTIC_STATE = 'needs_operation';
      const PRIORITY_RECOVERY_PROGRESS_CLASS =
        'eligible_but_no_operation_created';
      const PRIORITY_RECOVERY_NEXT_ACTION = 'create_recovery_operation';
      const PRIORITY_RECOVERY_BLOCKING_BOUNDARY = 'operation_scheduling';
      const PRIORITY_RECOVERY_WAIT_MODE = 'stalled';
      const PRIORITY_RECOVERY_PARTITION_SIGNAL =
        'priorityRecoveryPartition=' + PRIORITY_RECOVERY_PARTITION_ID;
      const NON_DOMINANT_PRIORITY_RECOVERY_PARTITION_SIGNAL =
        'priorityRecoveryPartition=' +
        NON_DOMINANT_PRIORITY_RECOVERY_PARTITION_ID;
      const PRIORITY_RECOVERY_UNRESOLVED_PARTITION_SIGNAL =
        'priorityRecoveryUnresolvedPartition=' +
        PRIORITY_RECOVERY_PARTITION_ID;
      const NON_DOMINANT_PRIORITY_RECOVERY_UNRESOLVED_PARTITION_SIGNAL =
        'priorityRecoveryUnresolvedPartition=' +
        NON_DOMINANT_PRIORITY_RECOVERY_PARTITION_ID;
      const PRIORITY_SPREAD_PENDING_SIGNAL = 'prioritySpreadPending=true';
      const EXPECTED_NODE_COUNT = 5;
      const READY_DISTINCT_NODE_COUNT = 2;
      const REQUIRED_DISTINCT_NODE_COUNT = 3;
      const PUBLICATION_EPOCH = 5;
      const SCENARIO_DURATION_MS = 100;
      const OPEN_STABILITY_GATE_STATUS = 'open';
      const EMPTY_COUNT = 0;
      const SINGLE_COUNT = 1;
      const PRIORITY_RECOVERY_BLOCKED_PARTITION_COUNT = 2;
      const SPREAD_GAP = 1;
      const writer = new ReportWriter(RESTART_RECOVERY_REPORT_PATH);
      writer.addResult(SCENARIO_NAME, {
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: RESTART_RECOVERY_ERROR,
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: ROOT_CAUSE_CLASS_STARTUP,
              dominantReason: STALE_STARTUP_REASON,
              reasonCounts: {
                [STALE_STARTUP_REASON]: SINGLE_COUNT,
              },
            },
            controlPlaneDiagnostics: {
              hasExplicitPriorityRecoveryObservation: true,
              priorityRecoveryObservation: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: EMPTY_COUNT,
                publicationPending: false,
                prioritySpreadPending: true,
                recoveryProtocolState:
                  RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD,
                priorityRecoveryReasonCodes: [
                  PRIORITY_RECOVERY_REASON_CODE,
                ],
                priorityPartitionSummary: {
                  satisfied: false,
                  requiredDistinctNodeCount: REQUIRED_DISTINCT_NODE_COUNT,
                  readyEligibleNodeCount: EXPECTED_NODE_COUNT,
                  totalPriorityPartitionCount:
                    PRIORITY_RECOVERY_BLOCKED_PARTITION_COUNT,
                  blockedPartitionCount:
                    PRIORITY_RECOVERY_BLOCKED_PARTITION_COUNT,
                  largestSpreadGap: SPREAD_GAP,
                  totalSpreadGap:
                    SPREAD_GAP * PRIORITY_RECOVERY_BLOCKED_PARTITION_COUNT,
                  missingPartitionIds: [
                    NON_DOMINANT_PRIORITY_RECOVERY_PARTITION_ID,
                    PRIORITY_RECOVERY_PARTITION_ID,
                  ],
                  blockedPartitions: [
                    {
                      partitionId:
                        NON_DOMINANT_PRIORITY_RECOVERY_PARTITION_ID,
                      spreadGap: SPREAD_GAP,
                      requiredDistinctNodeCount: REQUIRED_DISTINCT_NODE_COUNT,
                      readyDistinctNodeCount: READY_DISTINCT_NODE_COUNT,
                    },
                    {
                      partitionId: PRIORITY_RECOVERY_PARTITION_ID,
                      spreadGap: SPREAD_GAP,
                      requiredDistinctNodeCount: REQUIRED_DISTINCT_NODE_COUNT,
                      readyDistinctNodeCount: READY_DISTINCT_NODE_COUNT,
                    },
                  ],
                },
                priorityRecoveryProgressClassIds: [
                  PRIORITY_RECOVERY_PROGRESS_CLASS,
                ],
                priorityRecoveryProgressClassCount: SINGLE_COUNT,
                priorityRecoverySemanticStateIds: [
                  PRIORITY_RECOVERY_SEMANTIC_STATE,
                ],
                priorityRecoverySemanticStateCount: SINGLE_COUNT,
                priorityRecoveryBlockedPartitionIds: [
                  NON_DOMINANT_PRIORITY_RECOVERY_PARTITION_ID,
                  PRIORITY_RECOVERY_PARTITION_ID,
                ],
                priorityRecoveryBlockedPartitionCount:
                  PRIORITY_RECOVERY_BLOCKED_PARTITION_COUNT,
                priorityRecoveryUnresolvedPartitionIds: [
                  NON_DOMINANT_PRIORITY_RECOVERY_PARTITION_ID,
                  PRIORITY_RECOVERY_PARTITION_ID,
                ],
                priorityRecoveryUnresolvedPartitionCount:
                  PRIORITY_RECOVERY_BLOCKED_PARTITION_COUNT,
                priorityRecoveryBlockerPartitionIdsByReason: {
                  [PRIORITY_RECOVERY_PROGRESS_CLASS]: [
                    PRIORITY_RECOVERY_PARTITION_ID,
                  ],
                },
                priorityRecoveryPartitionIdsBySemanticState: {
                  [PRIORITY_RECOVERY_SEMANTIC_STATE]: [
                    PRIORITY_RECOVERY_PARTITION_ID,
                  ],
                },
                priorityRecoveryPartitionWitnesses: [{
                  partitionId: PRIORITY_RECOVERY_PARTITION_ID,
                  semanticStateId: PRIORITY_RECOVERY_SEMANTIC_STATE,
                  progressClassId: PRIORITY_RECOVERY_PROGRESS_CLASS,
                  nextRequiredAction: PRIORITY_RECOVERY_NEXT_ACTION,
                  blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
                  waitMode: PRIORITY_RECOVERY_WAIT_MODE,
                }],
              },
              activeGateProgress: {
                expectedNodeCount: EXPECTED_NODE_COUNT,
                activeNodeCount: EXPECTED_NODE_COUNT,
                inactiveNodeCount: EMPTY_COUNT,
                snapshotCoverageNodeCount: EXPECTED_NODE_COUNT,
                snapshotCoverageComplete: true,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                recoveryProtocolState:
                  RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD,
                pendingAckCount: EMPTY_COUNT,
                missingPublishedCount: EMPTY_COUNT,
                gateReasonCount: EMPTY_COUNT,
                gateReasons: [],
                prioritySpreadSatisfied: false,
                priorityRecoveryProgressClasses: {
                  unresolvedClassIds: [PRIORITY_RECOVERY_PROGRESS_CLASS],
                  unresolvedClassCount: SINGLE_COUNT,
                  partitionIdsByClass: {
                    [PRIORITY_RECOVERY_PROGRESS_CLASS]: [
                      PRIORITY_RECOVERY_PARTITION_ID,
                    ],
                  },
                  unresolvedSemanticStateIds: [
                    PRIORITY_RECOVERY_SEMANTIC_STATE,
                  ],
                  unresolvedSemanticStateCount: SINGLE_COUNT,
                  partitionIdsBySemanticState: {
                    [PRIORITY_RECOVERY_SEMANTIC_STATE]: [
                      PRIORITY_RECOVERY_PARTITION_ID,
                    ],
                  },
                  blockedPartitionIds: [
                    NON_DOMINANT_PRIORITY_RECOVERY_PARTITION_ID,
                    PRIORITY_RECOVERY_PARTITION_ID,
                  ],
                  blockedPartitionCount:
                    PRIORITY_RECOVERY_BLOCKED_PARTITION_COUNT,
                },
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(RESTART_RECOVERY_REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: RESTART_RECOVERY_REPORT_PATH,
        outputDir: tempDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const failureClassification =
        scenarioBundle.summary.failureClassification;

      assert.equal(
        failureClassification.failureClass,
        PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK,
      );
      assert.equal(
        failureClassification.rootCauseClass,
        ROOT_CAUSE_CLASS_TOPOLOGY,
      );
      assert.equal(
        failureClassification.dominantReason,
        FAILURE_BARRIER_REASON,
      );
      assert.ok(
        failureClassification.signals.includes(FAILURE_BARRIER_SIGNAL),
      );
      assert.ok(
        failureClassification.signals.includes(
          FAILURE_BARRIER_REASON_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_PARTITION_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_UNRESOLVED_PARTITION_SIGNAL,
        ),
      );
      assert.equal(
        failureClassification.signals.includes(
          NON_DOMINANT_PRIORITY_RECOVERY_PARTITION_SIGNAL,
        ),
        false,
      );
      assert.equal(
        failureClassification.signals.includes(
          NON_DOMINANT_PRIORITY_RECOVERY_UNRESOLVED_PARTITION_SIGNAL,
        ),
        false,
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_SPREAD_PENDING_SIGNAL,
        ),
      );
      assert.equal(
        scenarioBundle.diagnostics.failure.failureBarrier.phase,
        FAILURE_BARRIER_PHASE,
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.restart_recovery.status,
        OPEN_STABILITY_GATE_STATUS,
      );
      assert.notEqual(
        failureClassification.failureClass,
        FAILURE_CLASS_STARTUP_RECOVERY_BLOCKED,
      );
    },
  );

  it(
    'ignores stale restart-recovery priority spread state after closure',
    async () => {
      refreshState();
      const RESTART_RECOVERY_REPORT_PATH = join(
        tempDir,
        'restart-recovery-stale-priority-spread-report.json',
      );
      const SCENARIO_NAME = 'rolling-restart';
      const RESTART_RECOVERY_ERROR =
        'Restarted node did not become recovery-ready within 120000ms';
      const STALE_STARTUP_REASON = 'snapshot_reachability_timeout';
      const ROOT_CAUSE_CLASS_STARTUP = 'startup';
      const FAILURE_BARRIER_PHASE = 'restart_recovery';
      const FAILURE_BARRIER_REASON = 'startup_readiness_blocked';
      const STALE_PRIORITY_SPREAD_REASON = 'priority_spread_pending';
      const FAILURE_BARRIER_SIGNAL =
        'failureBarrier=' + FAILURE_BARRIER_PHASE;
      const FAILURE_BARRIER_REASON_SIGNAL =
        'failureBarrierReason=' + FAILURE_BARRIER_REASON;
      const STALE_PRIORITY_SPREAD_SIGNAL =
        'failureBarrierReason=' + STALE_PRIORITY_SPREAD_REASON;
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD =
        STALE_PRIORITY_SPREAD_REASON;
      const PUBLICATION_EPOCH = 4;
      const EXPECTED_NODE_COUNT = 5;
      const EMPTY_COUNT = 0;
      const SINGLE_COUNT = 1;
      const SCENARIO_DURATION_MS = 100;
      const writer = new ReportWriter(RESTART_RECOVERY_REPORT_PATH);
      writer.addResult(SCENARIO_NAME, {
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: RESTART_RECOVERY_ERROR,
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: ROOT_CAUSE_CLASS_STARTUP,
              dominantReason: STALE_STARTUP_REASON,
              reasonCounts: {
                [STALE_STARTUP_REASON]: SINGLE_COUNT,
              },
            },
            controlPlaneDiagnostics: {
              hasExplicitPriorityRecoveryObservation: true,
              priorityRecoveryObservation: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: EMPTY_COUNT,
                blockedNodeIds: [],
                blockedNodeCount: EMPTY_COUNT,
                publicationPending: false,
                prioritySpreadPending: false,
                recoveryProtocolState:
                  RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD,
                priorityRecoveryReasonCodes: [],
                priorityPartitionSummary: {
                  satisfied: true,
                  requiredDistinctNodeCount: EMPTY_COUNT,
                  readyEligibleNodeCount: EXPECTED_NODE_COUNT,
                  totalPriorityPartitionCount: EMPTY_COUNT,
                  blockedPartitionCount: EMPTY_COUNT,
                  largestSpreadGap: EMPTY_COUNT,
                  totalSpreadGap: EMPTY_COUNT,
                  missingPartitionIds: [],
                  blockedPartitions: [],
                },
                priorityRecoveryProgressClassIds: [],
                priorityRecoveryProgressClassCount: EMPTY_COUNT,
                priorityRecoverySemanticStateIds: [],
                priorityRecoverySemanticStateCount: EMPTY_COUNT,
                priorityRecoveryBlockedPartitionIds: [],
                priorityRecoveryBlockedPartitionCount: EMPTY_COUNT,
                priorityRecoveryUnresolvedPartitionIds: [],
                priorityRecoveryUnresolvedPartitionCount: EMPTY_COUNT,
              },
              activeGateProgress: {
                expectedNodeCount: EXPECTED_NODE_COUNT,
                activeNodeCount: EXPECTED_NODE_COUNT,
                inactiveNodeCount: EMPTY_COUNT,
                snapshotCoverageNodeCount: EXPECTED_NODE_COUNT,
                snapshotCoverageComplete: true,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                recoveryProtocolState:
                  RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD,
                pendingAckCount: EMPTY_COUNT,
                missingPublishedCount: EMPTY_COUNT,
                gateReasonCount: EMPTY_COUNT,
                gateReasons: [],
                prioritySpreadSatisfied: true,
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(RESTART_RECOVERY_REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: RESTART_RECOVERY_REPORT_PATH,
        outputDir: tempDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const failureClassification =
        scenarioBundle.summary.failureClassification;

      assert.equal(
        failureClassification.failureClass,
        FAILURE_CLASS_STARTUP_RECOVERY_BLOCKED,
      );
      assert.equal(
        failureClassification.rootCauseClass,
        ROOT_CAUSE_CLASS_STARTUP,
      );
      assert.equal(
        failureClassification.dominantReason,
        FAILURE_BARRIER_REASON,
      );
      assert.ok(
        failureClassification.signals.includes(FAILURE_BARRIER_SIGNAL),
      );
      assert.ok(
        failureClassification.signals.includes(
          FAILURE_BARRIER_REASON_SIGNAL,
        ),
      );
      assert.equal(
        failureClassification.signals.includes(
          STALE_PRIORITY_SPREAD_SIGNAL,
        ),
        false,
      );
    },
  );

  it(
    'keeps publication protocol open while stale priority-spread state has ACK debt',
    () => {
      refreshState();
      const PUBLICATION_STATUS_ACK_PENDING = 'ACK_PENDING';
      const RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD =
        'priority_spread_pending';
      const RECOVERY_PROTOCOL_STATE_PUBLICATION_PENDING =
        'publication_pending';
      const PUBLICATION_EPOCH = 4;
      const EXPECTED_NODE_COUNT = 5;
      const ACK_DEBT_COUNT = 1;
      const EMPTY_COUNT = 0;
      const ACK_NODE_ID = 'node-ack-pending';

      const publicationConvergence = buildPublicationConvergenceSummary({
        hasExplicitPriorityRecoveryObservation: true,
        priorityRecoveryObservation: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_ACK_PENDING,
          pendingAckNodeIds: [ACK_NODE_ID],
          pendingAckCount: ACK_DEBT_COUNT,
          blockedNodeIds: [],
          blockedNodeCount: EMPTY_COUNT,
          publicationPending: true,
          prioritySpreadPending: false,
          recoveryProtocolState: RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD,
          priorityRecoveryReasonCodes: [],
          priorityPartitionSummary: {
            satisfied: true,
            requiredDistinctNodeCount: EMPTY_COUNT,
            readyEligibleNodeCount: EXPECTED_NODE_COUNT,
            totalPriorityPartitionCount: EMPTY_COUNT,
            blockedPartitionCount: EMPTY_COUNT,
            largestSpreadGap: EMPTY_COUNT,
            totalSpreadGap: EMPTY_COUNT,
            missingPartitionIds: [],
            blockedPartitions: [],
          },
          priorityRecoveryProgressClassIds: [],
          priorityRecoveryProgressClassCount: EMPTY_COUNT,
          priorityRecoverySemanticStateIds: [],
          priorityRecoverySemanticStateCount: EMPTY_COUNT,
          priorityRecoveryBlockedPartitionIds: [],
          priorityRecoveryBlockedPartitionCount: EMPTY_COUNT,
          priorityRecoveryUnresolvedPartitionIds: [],
          priorityRecoveryUnresolvedPartitionCount: EMPTY_COUNT,
        },
      });

      assert.equal(publicationConvergence.pendingAckCount, ACK_DEBT_COUNT);
      assert.equal(publicationConvergence.publicationPending, true);
      assert.equal(publicationConvergence.prioritySpreadPending, false);
      assert.equal(
        publicationConvergence.recoveryProtocolState,
        RECOVERY_PROTOCOL_STATE_PUBLICATION_PENDING,
      );
    },
  );

  it(
    'classifies restart recovery admin refusal as the terminal owner state',
    async () => {
      refreshState();
      const RESTART_RECOVERY_REPORT_PATH = join(
        tempDir,
        'restart-recovery-admin-refused-report.json',
      );
      const SCENARIO_NAME = 'rolling-restart';
      const RESTARTED_NODE_ID = '11601fe0-72d6-5853-8590-ec2881853e72';
      const FAILURE_BARRIER_PHASE = 'restart_recovery';
      const FAILURE_BARRIER_SIGNAL =
        'failureBarrier=' + FAILURE_BARRIER_PHASE;
      const ADMIN_REFUSED_SIGNAL =
        'failureBarrierReason=' +
        STABILITY_GATE_BLOCKER_ADMIN_REACHABILITY_REFUSED;
      const STALE_PRIORITY_SPREAD_SIGNAL =
        'failureBarrierReason=priority_spread_pending';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD =
        'priority_spread_pending';
      const RECOVERY_PROTOCOL_STATE_STEADY = 'steady_published';
      const PUBLICATION_EPOCH = 4;
      const EXPECTED_NODE_COUNT = 5;
      const EMPTY_COUNT = 0;
      const SCENARIO_DURATION_MS = 100;
      const RESTART_RECOVERY_ERROR =
        'Restarted node did not become recovery-ready within 120000ms ' +
        'for node ' +
        RESTARTED_NODE_ID +
        ' (reachable=true, ready=false, adminReady=false, ' +
        'controlPlaneRecoveryReady=false, ' +
        'publishedControlPlaneEpoch=unknown, ' +
        'expectedPublicationEpoch=none, readinessPhase=INIT, ' +
        'readinessStage=traffic_ready, readinessStageRank=5, ' +
        'readinessReasons=none, recoveryStage=unknown, ' +
        'bootstrapJoinProjectionBlocker=none, ' +
        'bootstrapJoinProjectionRule=init_priority_bypass, ' +
        'reachableBy=bootstrap_health, lastError=Admin API query failed ' +
        'for node ' +
        RESTARTED_NODE_ID +
        ' on lane probe: connect ECONNREFUSED 172.19.0.4:8081)';
      const writer = new ReportWriter(RESTART_RECOVERY_REPORT_PATH);
      writer.addResult(SCENARIO_NAME, {
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: RESTART_RECOVERY_ERROR,
        details: {
          diagnostics: {
            controlPlaneDiagnostics: {
              hasExplicitPriorityRecoveryObservation: true,
              priorityRecoveryObservation: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: EMPTY_COUNT,
                blockedNodeIds: [],
                blockedNodeCount: EMPTY_COUNT,
                publicationPending: false,
                prioritySpreadPending: false,
                recoveryProtocolState:
                  RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD,
                priorityRecoveryReasonCodes: [],
                priorityPartitionSummary: {
                  satisfied: true,
                  requiredDistinctNodeCount: 3,
                  readyEligibleNodeCount: EXPECTED_NODE_COUNT,
                  totalPriorityPartitionCount: EXPECTED_NODE_COUNT,
                  blockedPartitionCount: EMPTY_COUNT,
                  largestSpreadGap: EMPTY_COUNT,
                  totalSpreadGap: EMPTY_COUNT,
                  missingPartitionIds: [],
                  blockedPartitions: [],
                },
                priorityRecoveryProgressClassIds: [],
                priorityRecoveryProgressClassCount: EMPTY_COUNT,
                priorityRecoverySemanticStateIds: [],
                priorityRecoverySemanticStateCount: EMPTY_COUNT,
                priorityRecoveryBlockedPartitionIds: [],
                priorityRecoveryBlockedPartitionCount: EMPTY_COUNT,
                priorityRecoveryUnresolvedPartitionIds: [],
                priorityRecoveryUnresolvedPartitionCount: EMPTY_COUNT,
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(RESTART_RECOVERY_REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: RESTART_RECOVERY_REPORT_PATH,
        outputDir: tempDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const failureClassification =
        scenarioBundle.summary.failureClassification;
      const restartRecoveryGate =
        scenarioBundle.summary.stabilityGates.restart_recovery;

      assert.equal(
        scenarioBundle.summary.dominantReason,
        STABILITY_GATE_BLOCKER_ADMIN_REACHABILITY_REFUSED,
      );
      assert.equal(
        failureClassification.failureClass,
        FAILURE_CLASS_STARTUP_RECOVERY_BLOCKED,
      );
      assert.equal(
        failureClassification.dominantReason,
        STABILITY_GATE_BLOCKER_ADMIN_REACHABILITY_REFUSED,
      );
      assert.ok(
        failureClassification.signals.includes(FAILURE_BARRIER_SIGNAL),
      );
      assert.ok(
        failureClassification.signals.includes(ADMIN_REFUSED_SIGNAL),
      );
      assert.equal(
        failureClassification.signals.includes(STALE_PRIORITY_SPREAD_SIGNAL),
        false,
      );
      assert.equal(
        scenarioBundle.diagnostics.failure.failureBarrier
          .terminalRecoveryReadiness.ownerState,
        STABILITY_GATE_BLOCKER_ADMIN_REACHABILITY_REFUSED,
      );
      assert.equal(
        scenarioBundle.diagnostics.failure.failureBarrier
          .terminalRecoveryReadiness.nodeId,
        RESTARTED_NODE_ID,
      );
      assert.equal(restartRecoveryGate.status, 'open');
      assert.equal(
        restartRecoveryGate.blockers.includes(
          STABILITY_GATE_BLOCKER_ADMIN_REACHABILITY_REFUSED,
        ),
        true,
      );
      assert.equal(
        restartRecoveryGate.evidence.terminalRecoveryReadiness.ownerState,
        STABILITY_GATE_BLOCKER_ADMIN_REACHABILITY_REFUSED,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.recoveryProtocolState,
        RECOVERY_PROTOCOL_STATE_STEADY,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.prioritySpreadPending,
        false,
      );
    },
  );

  it(
    'uses closed best-progress publication evidence when the terminal snapshot probe is degraded',
    () => {
      refreshState();
      const EXPECTED_NODE_COUNT = 5;
      const ACTIVE_NODE_COUNT = 4;
      const INACTIVE_NODE_COUNT = 1;
      const ZERO_COUNT = 0;
      const ONE_COUNT = 1;
      const PUBLICATION_EPOCH = 5;
      const STALE_ACK_NODE_ID = 'joiner-ack-pending';
      const SNAPSHOT_NODE_ID = 'snapshot-node';
      const SNAPSHOT_TIMEOUT_ERROR =
        'Admin API query timed out for node snapshot-node';
      const BEST_PROGRESS_NODE_ID = 'best-progress-node';
      const PUBLICATION_STATUS_ACK_PENDING = 'ACK_PENDING';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_PUBLICATION_PENDING = 'publication_pending';
      const RECOVERY_PROTOCOL_STEADY_PUBLISHED = 'steady_published';
      const ACTIVE_GATE_MODE_STARTUP = 'startup';
      const ACTIVE_GATE_STATE_TIMED_OUT = 'timed_out';
      const REASON_PRIORITY_PARTITIONS_NOT_SPREAD =
        'priority_partitions_not_spread';
      const REASON_PUBLICATION_EPOCH_PENDING = 'publication_epoch_pending';
      const PROGRESS_CLASS_OPERATION_STALLED =
        'operation_created_but_no_step_transitions';
      const SEMANTIC_STATE_OPERATION_STALLED = 'operation_stalled';
      const BLOCKED_PARTITION_ID = 'sql_transaction_participants-p1';
      const STALE_PROGRESS_BLOCKER =
        'priority_recovery_progress_class=' + PROGRESS_CLASS_OPERATION_STALLED;
      const ACTIVE_GATE_BLOCKER_INACTIVE = 'inactive_nodes=1';
      const ACTIVE_GATE_BLOCKER_SNAPSHOT_COVERAGE = 'snapshot_coverage=0/5';
      const ACTIVE_GATE_BLOCKER_SNAPSHOT_ERROR = 'snapshot_error';
      const CLOSED_REASON_COUNTS = {};
      const stalePublicationConvergence = {
        publicationEpoch: PUBLICATION_EPOCH,
        publicationStatus: PUBLICATION_STATUS_ACK_PENDING,
        pendingAckNodeIds: [STALE_ACK_NODE_ID],
        pendingAckCount: ONE_COUNT,
        recoveryProtocolState: RECOVERY_PROTOCOL_PUBLICATION_PENDING,
        priorityRecoveryReasonCodes: [
          REASON_PRIORITY_PARTITIONS_NOT_SPREAD,
          REASON_PUBLICATION_EPOCH_PENDING,
        ],
        publicationPending: true,
        prioritySpreadPending: true,
        priorityPartitionSummary: {
          satisfied: false,
          blockedPartitionCount: ONE_COUNT,
          blockedPartitions: [{
            partitionId: BLOCKED_PARTITION_ID,
            blockerReasonCodes: [PROGRESS_CLASS_OPERATION_STALLED],
          }],
        },
      };
      const stalePriorityRecoveryObservation = {
        ...stalePublicationConvergence,
        priorityRecoveryProgressClassIds: [PROGRESS_CLASS_OPERATION_STALLED],
        priorityRecoveryProgressClassCount: ONE_COUNT,
        priorityRecoverySemanticStateIds: [SEMANTIC_STATE_OPERATION_STALLED],
        priorityRecoverySemanticStateCount: ONE_COUNT,
        priorityRecoveryBlockedPartitionIds: [BLOCKED_PARTITION_ID],
        priorityRecoveryBlockedPartitionCount: ONE_COUNT,
      };
      const staleDecisionSnapshots = {
        publicationEpoch: PUBLICATION_EPOCH,
        priorityPartitionSummary: {
          satisfied: false,
          blockedPartitionCount: ONE_COUNT,
        },
        snapshots: [{
          partitionId: BLOCKED_PARTITION_ID,
          semanticState: SEMANTIC_STATE_OPERATION_STALLED,
          blockerReasons: [PROGRESS_CLASS_OPERATION_STALLED],
        }],
      };
      const activeGate = {
        mode: ACTIVE_GATE_MODE_STARTUP,
        state: ACTIVE_GATE_STATE_TIMED_OUT,
        progress: {
          expectedNodeCount: EXPECTED_NODE_COUNT,
          activeNodeCount: ACTIVE_NODE_COUNT,
          inactiveNodeCount: INACTIVE_NODE_COUNT,
          snapshotCoverageNodeCount: ZERO_COUNT,
          snapshotCoverageComplete: false,
          selectedSnapshotNodeId: SNAPSHOT_NODE_ID,
          selectedSnapshotError: SNAPSHOT_TIMEOUT_ERROR,
          pendingAckCount: ZERO_COUNT,
          missingPublishedCount: ZERO_COUNT,
          gateReasons: [],
          blockers: [
            ACTIVE_GATE_BLOCKER_INACTIVE,
            ACTIVE_GATE_BLOCKER_SNAPSHOT_COVERAGE,
            ACTIVE_GATE_BLOCKER_SNAPSHOT_ERROR,
          ],
        },
        bestProgress: {
          expectedNodeCount: EXPECTED_NODE_COUNT,
          activeNodeCount: ACTIVE_NODE_COUNT,
          inactiveNodeCount: INACTIVE_NODE_COUNT,
          snapshotCoverageNodeCount: EXPECTED_NODE_COUNT,
          snapshotCoverageComplete: true,
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          recoveryProtocolState: RECOVERY_PROTOCOL_STEADY_PUBLISHED,
          selectedSnapshotNodeId: BEST_PROGRESS_NODE_ID,
          pendingAckCount: ZERO_COUNT,
          missingPublishedCount: ZERO_COUNT,
          gateReasons: [],
          prioritySpreadSatisfied: true,
          blockers: [ACTIVE_GATE_BLOCKER_INACTIVE],
        },
      };
      const mergedControlPlane = mergeControlPlaneDiagnostics(
        {
          publicationConvergence: stalePublicationConvergence,
          priorityRecoveryObservation: stalePriorityRecoveryObservation,
          priorityRecoveryDecisionSnapshots: staleDecisionSnapshots,
          activeGate,
        },
        {
          publicationConvergence: stalePublicationConvergence,
          priorityRecoveryObservation: stalePriorityRecoveryObservation,
          priorityRecoveryDecisionSnapshots: staleDecisionSnapshots,
        },
      );
      const publicationConvergence =
        buildPublicationConvergenceSummary(mergedControlPlane);
      const reasonCounts =
        FAILURE_BUNDLE_FOUNDATION.deriveReasonCountsFromPublicationConvergence(
          mergedControlPlane,
        );

      assert.equal(
        publicationConvergence.publicationStatus,
        PUBLICATION_STATUS_PUBLISHED,
      );
      assert.equal(publicationConvergence.pendingAckCount, ZERO_COUNT);
      assert.deepEqual(publicationConvergence.priorityRecoveryReasonCodes, []);
      assert.equal(publicationConvergence.publicationPending, false);
      assert.equal(publicationConvergence.prioritySpreadPending, false);
      assert.equal(
        publicationConvergence.priorityRecoveryProgressClassCount,
        ZERO_COUNT,
      );
      assert.equal(publicationConvergence.closureRecordId, null);
      assert.equal(publicationConvergence.closureWitnessClass, null);
      assert.equal(
        publicationConvergence.activeGateProgress.blockers.includes(
          STALE_PROGRESS_BLOCKER,
        ),
        false,
      );
      assert.deepEqual(reasonCounts, CLOSED_REASON_COUNTS);
    },
  );
}
