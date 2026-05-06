export function registerFailureBundleCore16Tests(context) {
  const {
    it,
    assert,
    CONTROL_PLANE_READINESS_REASON,
    FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
    PRIORITY_RECOVERY_ACTUATION_STATE,
    PRIORITY_RECOVERY_BLOCKER_REASON,
    PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
    PRIORITY_RECOVERY_PROGRESS_OWNER,
    PRIORITY_RECOVERY_SEMANTIC_STATE,
    PRIORITY_RECOVERY_WAIT_MODE,
    readFile,
    resolve,
    ROOT_CAUSE_CLASS_TOPOLOGY,
    STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE,
    UTF8_ENCODING,
    writeFailureBundlesForReport,
  } = context;
  let tempDir;
  let reportPath;
  const refreshState = () => {
    tempDir = context.state.tempDir;
    reportPath = context.state.reportPath;
  };

  it(
    'keeps current active-gate ACK closure ahead of stale best-progress debt',
    async () => {
      refreshState();
      const SCENARIO_NAME = 'rolling-restart';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING =
        'priority_spread_pending';
      const ACTIVE_GATE_MODE_STARTUP = 'startup';
      const ACTIVE_GATE_STATE_TIMED_OUT = 'timed_out';
      const ACTIVE_GATE_TERMINAL_REASON = 'stalled_no_progress';
      const GENERIC_PUBLICATION_REASON =
        CONTROL_PLANE_READINESS_REASON.PUBLICATION_EPOCH_PENDING;
      const PRIORITY_SPREAD_REASON = 'priority_partitions_not_spread';
      const PRIORITY_RECOVERY_PARTITION_ID = 'sql_write_operations-p1';
      const PRIORITY_RECOVERY_PROGRESS_CLASS =
        PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT;
      const PRIORITY_RECOVERY_SEMANTIC_STATE_ID =
        PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION;
      const ACTIVE_GATE_COVERAGE_BLOCKER = 'snapshot_coverage=3/5';
      const ACTIVE_GATE_INACTIVE_BLOCKER = 'inactive_nodes=2';
      const PUBLISHED_NODE_ONE = 'published-node-one';
      const PUBLISHED_NODE_TWO = 'published-node-two';
      const PUBLISHED_NODE_THREE = 'published-node-three';
      const MISSING_NODE_ONE = 'missing-node-one';
      const MISSING_NODE_TWO = 'missing-node-two';
      const PUBLICATION_EPOCH = 3;
      const EXPECTED_NODE_COUNT = 5;
      const ACTIVE_NODE_COUNT = 3;
      const INACTIVE_NODE_COUNT = 2;
      const SNAPSHOT_COVERAGE_COUNT = 3;
      const STALE_PENDING_ACK_COUNT = 2;
      const ONE_COUNT = 1;
      const ZERO_COUNT = 0;
      const scenarios = [{
        scenario: SCENARIO_NAME,
        passed: false,
        error: 'Not all nodes reached ACTIVE state within 120000ms',
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: ROOT_CAUSE_CLASS_TOPOLOGY,
              dominantReason: GENERIC_PUBLICATION_REASON,
              reasonCounts: {
                [GENERIC_PUBLICATION_REASON]: STALE_PENDING_ACK_COUNT,
                [PRIORITY_SPREAD_REASON]: STALE_PENDING_ACK_COUNT,
              },
            },
            controlPlaneDiagnostics: {
              hasExplicitPriorityRecoveryObservation: true,
              publicationConvergence: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: ZERO_COUNT,
                missingPublishedNodeIds: [],
                missingPublishedCount: ZERO_COUNT,
                publicationPending: false,
                prioritySpreadPending: true,
                recoveryProtocolState:
                  RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING,
                priorityRecoveryReasonCodes: [PRIORITY_SPREAD_REASON],
              },
              priorityRecoveryObservation: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: STALE_PENDING_ACK_COUNT,
                missingPublishedNodeIds: [MISSING_NODE_ONE, MISSING_NODE_TWO],
                missingPublishedCount: STALE_PENDING_ACK_COUNT,
                publicationPending: true,
                prioritySpreadPending: true,
                recoveryProtocolState:
                  RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING,
                priorityRecoveryReasonCodes: [
                  PRIORITY_SPREAD_REASON,
                  GENERIC_PUBLICATION_REASON,
                ],
                publicationConvergenceGateReasons: [
                  PRIORITY_SPREAD_REASON,
                  GENERIC_PUBLICATION_REASON,
                ],
                priorityRecoveryProgressClassIds: [
                  PRIORITY_RECOVERY_PROGRESS_CLASS,
                ],
                priorityRecoveryProgressClassCount: ONE_COUNT,
                priorityRecoverySemanticStateIds: [
                  PRIORITY_RECOVERY_SEMANTIC_STATE_ID,
                ],
                priorityRecoverySemanticStateCount: ONE_COUNT,
                priorityRecoveryBlockedPartitionIds: [
                  PRIORITY_RECOVERY_PARTITION_ID,
                ],
                priorityRecoveryBlockedPartitionCount: ONE_COUNT,
                priorityRecoveryUnresolvedPartitionIds: [
                  PRIORITY_RECOVERY_PARTITION_ID,
                ],
                priorityRecoveryUnresolvedPartitionCount: ONE_COUNT,
                priorityRecoveryPartitionWitnesses: [{
                  partitionId: PRIORITY_RECOVERY_PARTITION_ID,
                  semanticStateId: PRIORITY_RECOVERY_SEMANTIC_STATE_ID,
                  progressClassIds: [PRIORITY_RECOVERY_PROGRESS_CLASS],
                  blockerReasonCodes: [PRIORITY_RECOVERY_PROGRESS_CLASS],
                  progressContractState: 'pending',
                  actuationState:
                    PRIORITY_RECOVERY_ACTUATION_STATE.TRANSITION_DEFERRED,
                  currentOwner:
                    PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
                  actuationOwner:
                    PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
                  blockingBoundary:
                    PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
                  waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
                  nextRequiredAction:
                    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION
                      .WAIT_FOR_OPERATION_PROGRESS,
                }],
              },
              activeGate: {
                mode: ACTIVE_GATE_MODE_STARTUP,
                state: ACTIVE_GATE_STATE_TIMED_OUT,
                ready: false,
                reasonCode: ACTIVE_GATE_TERMINAL_REASON,
                progress: {
                  expectedNodeCount: EXPECTED_NODE_COUNT,
                  activeNodeCount: ACTIVE_NODE_COUNT,
                  inactiveNodeCount: INACTIVE_NODE_COUNT,
                  snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_COUNT,
                  snapshotCoverageComplete: false,
                  publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                  publicationEpoch: PUBLICATION_EPOCH,
                  recoveryProtocolState:
                    RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING,
                  selectedPublishedActiveNodeIds: [
                    PUBLISHED_NODE_ONE,
                    PUBLISHED_NODE_TWO,
                    PUBLISHED_NODE_THREE,
                  ],
                  selectedMissingPublishedNodeIds: [
                    MISSING_NODE_ONE,
                    MISSING_NODE_TWO,
                  ],
                  pendingAckCount: ZERO_COUNT,
                  missingPublishedCount: STALE_PENDING_ACK_COUNT,
                  gateReasons: [],
                  prioritySpreadSatisfied: false,
                  prioritySpreadGap: EXPECTED_NODE_COUNT,
                  priorityBlockedPartitionCount: ONE_COUNT,
                  priorityRecoveryProgressClasses: {
                    unresolvedClassIds: [PRIORITY_RECOVERY_PROGRESS_CLASS],
                    unresolvedClassCount: ONE_COUNT,
                    unresolvedSemanticStateIds: [
                      PRIORITY_RECOVERY_SEMANTIC_STATE_ID,
                    ],
                    unresolvedSemanticStateCount: ONE_COUNT,
                    blockedPartitionIds: [PRIORITY_RECOVERY_PARTITION_ID],
                    blockedPartitionCount: ONE_COUNT,
                  },
                  blockers: [
                    ACTIVE_GATE_INACTIVE_BLOCKER,
                    ACTIVE_GATE_COVERAGE_BLOCKER,
                    'priority_recovery_progress_class=' +
                      PRIORITY_RECOVERY_PROGRESS_CLASS,
                  ],
                },
                bestProgress: {
                  expectedNodeCount: EXPECTED_NODE_COUNT,
                  activeNodeCount: EXPECTED_NODE_COUNT,
                  inactiveNodeCount: ZERO_COUNT,
                  snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_COUNT,
                  snapshotCoverageComplete: false,
                  publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                  publicationEpoch: PUBLICATION_EPOCH,
                  recoveryProtocolState:
                    RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING,
                  selectedPublishedActiveNodeIds: [
                    PUBLISHED_NODE_ONE,
                    PUBLISHED_NODE_TWO,
                    PUBLISHED_NODE_THREE,
                    MISSING_NODE_ONE,
                    MISSING_NODE_TWO,
                  ],
                  selectedMissingPublishedNodeIds: [],
                  pendingAckCount: STALE_PENDING_ACK_COUNT,
                  missingPublishedCount: ZERO_COUNT,
                  gateReasons: [],
                  prioritySpreadSatisfied: false,
                  prioritySpreadGap: EXPECTED_NODE_COUNT,
                  priorityBlockedPartitionCount: ONE_COUNT,
                },
              },
            },
          },
        },
      }];

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios,
        reportOutputPath: reportPath,
        outputDir: tempDir,
        reportSummary: {total: ONE_COUNT, fail: ONE_COUNT, pass: ZERO_COUNT},
        standardSummary: {scenarios: []},
        benchmarkRegressionGate: {status: 'skipped'},
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const publicationConvergence = scenarioBundle.publicationConvergence;
      const failureClassification =
        scenarioBundle.summary.failureClassification;

      assert.equal(publicationConvergence.pendingAckCount, ZERO_COUNT);
      assert.deepEqual(publicationConvergence.pendingAckNodeIds, []);
      assert.equal(
        publicationConvergence.missingPublishedCount,
        STALE_PENDING_ACK_COUNT,
      );
      assert.deepEqual(
        publicationConvergence.missingPublishedNodeIds,
        [MISSING_NODE_ONE, MISSING_NODE_TWO],
      );
      assert.equal(publicationConvergence.publicationPending, true);
      assert.equal(
        publicationConvergence.publicationConvergenceGateReasons.includes(
          GENERIC_PUBLICATION_REASON,
        ),
        false,
      );
      assert.ok(
        publicationConvergence.publicationConvergenceGateReasons.includes(
          ACTIVE_GATE_COVERAGE_BLOCKER,
        ),
      );
      assert.ok(
        publicationConvergence.publicationConvergenceGateReasons.includes(
          STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE + '=' +
            MISSING_NODE_ONE,
        ),
      );
      assert.equal(
        failureClassification.failureClass,
        FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
      );
      assert.equal(
        failureClassification.dominantReason,
        STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE + '=' +
          MISSING_NODE_ONE,
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.convergence.blockers.includes(
          STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE,
        ),
        true,
      );
    },
  );
}
