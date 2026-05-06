export function registerFailureBundleCore11Tests(context) {
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
    PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK,
    PRIORITY_RECOVERY_SEMANTIC_STATE,
    PRIORITY_RECOVERY_WAIT_MODE,
    readFile,
    resolve,
    ROOT_CAUSE_CLASS_STARTUP,
    STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE,
    STABILITY_GATE_BLOCKER_PUBLICATION_PENDING,
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
    'separates active-gate snapshot coverage from serial priority recovery progress',
    async () => {
      refreshState();
      const SCENARIO_NAME = 'rolling-restart';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_STEADY_PUBLISHED = 'steady_published';
      const ACTIVE_GATE_MODE_LOAD = 'load';
      const ACTIVE_GATE_STATE_STALLED = 'stalled';
      const GENERIC_PUBLICATION_REASON = 'publication_epoch_pending';
      const MISSING_NODE_ID = 'node-missing-published';
      const PUBLISHED_NODE_ID = 'node-published';
      const SELECTED_SNAPSHOT_NODE_ID = 'node-snapshot';
      const MISSING_NODE_REASON =
        STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE + '=' +
        MISSING_NODE_ID;
      const ACTIVE_GATE_INACTIVE_BLOCKER = 'inactive_nodes=5';
      const ACTIVE_GATE_COVERAGE_BLOCKER = 'snapshot_coverage=4/5';
      const ACTIVE_GATE_MISSING_BLOCKER = 'publication_gate=' +
        MISSING_NODE_REASON;
      const PRIORITY_RECOVERY_PARTITION_ID = 'sql_transactions-p1';
      const PRIORITY_RECOVERY_PROGRESS_CLASS =
        'priority_operation_serial_wait';
      const PRIORITY_RECOVERY_SEMANTIC_STATE = 'needs_operation';
      const PRIORITY_RECOVERY_OWNER = 'operation_workflow_owner';
      const PRIORITY_RECOVERY_BOUNDARY = 'workflow_progress';
      const PRIORITY_RECOVERY_WAIT_MODE = 'event_driven';
      const PRIORITY_RECOVERY_NEXT_ACTION = 'wait_for_operation_progress';
      const PRIORITY_RECOVERY_CONTRACT_STATE = 'pending';
      const PRIORITY_RECOVERY_ACTUATION_STATE = 'transition_deferred';
      const PUBLICATION_EPOCH = 25;
      const EXPECTED_NODE_COUNT = 5;
      const SNAPSHOT_COVERAGE_COUNT = 4;
      const ONE_COUNT = 1;
      const ZERO_COUNT = 0;
      const scenarios = [{
        scenario: SCENARIO_NAME,
        passed: false,
        error: 'Cluster ACTIVE wait stalled with no meaningful progress',
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: ROOT_CAUSE_CLASS_STARTUP,
              dominantReason:
                CONTROL_PLANE_READINESS_REASON
                  .PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
              reasonCounts: {
                [CONTROL_PLANE_READINESS_REASON
                  .PRIORITY_CONTROL_PLANE_RECOVERY_PENDING]: ONE_COUNT,
                [GENERIC_PUBLICATION_REASON]: ONE_COUNT,
              },
            },
            controlPlaneDiagnostics: {
              hasExplicitPriorityRecoveryObservation: true,
              priorityRecoveryObservation: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: ZERO_COUNT,
                blockedNodeIds: [],
                blockedNodeCount: ZERO_COUNT,
                missingPublishedNodeIds: [MISSING_NODE_ID],
                missingPublishedCount: ONE_COUNT,
                publicationPending: true,
                prioritySpreadPending: false,
                recoveryProtocolState: RECOVERY_PROTOCOL_STEADY_PUBLISHED,
                priorityRecoveryReasonCodes: [GENERIC_PUBLICATION_REASON],
                publicationConvergenceGateReasons: [
                  GENERIC_PUBLICATION_REASON,
                  MISSING_NODE_REASON,
                ],
                priorityRecoveryProgressClassIds: [
                  PRIORITY_RECOVERY_PROGRESS_CLASS,
                ],
                priorityRecoveryProgressClassCount: ONE_COUNT,
                priorityRecoverySemanticStateIds: [
                  PRIORITY_RECOVERY_SEMANTIC_STATE,
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
                  progressClassIds: [PRIORITY_RECOVERY_PROGRESS_CLASS],
                  blockerReasonCodes: [PRIORITY_RECOVERY_PROGRESS_CLASS],
                  progressContractState: PRIORITY_RECOVERY_CONTRACT_STATE,
                  currentOwner: PRIORITY_RECOVERY_OWNER,
                  blockingBoundary: PRIORITY_RECOVERY_BOUNDARY,
                  waitMode: PRIORITY_RECOVERY_WAIT_MODE,
                  nextRequiredAction: PRIORITY_RECOVERY_NEXT_ACTION,
                  actuationState: PRIORITY_RECOVERY_ACTUATION_STATE,
                  actuationOwner: PRIORITY_RECOVERY_OWNER,
                }],
                priorityPartitionSummary: {
                  satisfied: true,
                  requiredDistinctNodeCount: EXPECTED_NODE_COUNT,
                  readyEligibleNodeCount: SNAPSHOT_COVERAGE_COUNT,
                  totalPriorityPartitionCount: EXPECTED_NODE_COUNT,
                  blockedPartitionCount: ZERO_COUNT,
                  largestSpreadGap: ZERO_COUNT,
                  totalSpreadGap: ZERO_COUNT,
                  missingPartitionIds: [],
                  blockedPartitions: [],
                },
              },
              activeGate: {
                mode: ACTIVE_GATE_MODE_LOAD,
                state: ACTIVE_GATE_STATE_STALLED,
                ready: false,
                progress: {
                  expectedNodeCount: EXPECTED_NODE_COUNT,
                  activeNodeCount: ZERO_COUNT,
                  inactiveNodeCount: EXPECTED_NODE_COUNT,
                  snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_COUNT,
                  snapshotCoverageComplete: false,
                  publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                  publicationEpoch: PUBLICATION_EPOCH,
                  recoveryProtocolState: RECOVERY_PROTOCOL_STEADY_PUBLISHED,
                  selectedSnapshotNodeId: SELECTED_SNAPSHOT_NODE_ID,
                  selectedPublishedActiveNodeIds: [PUBLISHED_NODE_ID],
                  selectedMissingPublishedNodeIds: [MISSING_NODE_ID],
                  pendingAckCount: ZERO_COUNT,
                  missingPublishedCount: ONE_COUNT,
                  gateReasons: [MISSING_NODE_REASON],
                  prioritySpreadSatisfied: true,
                  prioritySpreadGap: ZERO_COUNT,
                  priorityBlockedPartitionCount: ZERO_COUNT,
                  blockers: [
                    ACTIVE_GATE_INACTIVE_BLOCKER,
                    ACTIVE_GATE_COVERAGE_BLOCKER,
                    ACTIVE_GATE_MISSING_BLOCKER,
                  ],
                },
              },
              activeGateProgress: {
                expectedNodeCount: EXPECTED_NODE_COUNT,
                activeNodeCount: ZERO_COUNT,
                inactiveNodeCount: EXPECTED_NODE_COUNT,
                snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_COUNT,
                snapshotCoverageComplete: false,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                publicationEpoch: PUBLICATION_EPOCH,
                recoveryProtocolState: RECOVERY_PROTOCOL_STEADY_PUBLISHED,
                selectedSnapshotNodeId: SELECTED_SNAPSHOT_NODE_ID,
                selectedPublishedActiveNodeIds: [PUBLISHED_NODE_ID],
                selectedMissingPublishedNodeIds: [MISSING_NODE_ID],
                pendingAckCount: ZERO_COUNT,
                missingPublishedCount: ONE_COUNT,
                gateReasons: [MISSING_NODE_REASON],
                prioritySpreadSatisfied: true,
                prioritySpreadGap: ZERO_COUNT,
                priorityBlockedPartitionCount: ZERO_COUNT,
                blockers: [
                  ACTIVE_GATE_INACTIVE_BLOCKER,
                  ACTIVE_GATE_COVERAGE_BLOCKER,
                  ACTIVE_GATE_MISSING_BLOCKER,
                ],
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
      const failureClassification =
        scenarioBundle.summary.failureClassification;

      assert.equal(
        scenarioBundle.publicationConvergence.missingPublishedCount,
        ONE_COUNT,
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence.missingPublishedNodeIds,
        [MISSING_NODE_ID],
      );
      assert.equal(
        scenarioBundle.publicationConvergence.publicationPending,
        true,
      );
      assert.ok(
        scenarioBundle.publicationConvergence.publicationConvergenceGateReasons
          .includes(ACTIVE_GATE_COVERAGE_BLOCKER),
      );
      assert.ok(
        scenarioBundle.publicationConvergence.publicationConvergenceGateReasons
          .includes(MISSING_NODE_REASON),
      );
      assert.equal(
        failureClassification.failureClass,
        FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
      );
      assert.equal(
        failureClassification.dominantReason,
        MISSING_NODE_REASON,
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.convergence.blockers.includes(
          STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE,
        ),
        true,
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.convergence.blockers.includes(
          STABILITY_GATE_BLOCKER_PUBLICATION_PENDING,
        ),
        false,
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.restart_recovery.blockers.includes(
          STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE,
        ),
        true,
      );
    },
  );

  it(
    'keeps startup active-gate snapshot coverage from restoring stale publication debt',
    async () => {
      refreshState();
      const SCENARIO_NAME = 'rolling-restart';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_STEADY_PUBLISHED = 'steady_published';
      const RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING =
        'priority_spread_pending';
      const ACTIVE_GATE_MODE_STARTUP = 'startup';
      const ACTIVE_GATE_STATE_TIMED_OUT = 'timed_out';
      const ACTIVE_GATE_TERMINAL_REASON = 'stalled_no_progress';
      const ACTIVE_GATE_STALLED_REASON =
        'active_wait_no_progress_coordinator_cycles=2';
      const GENERIC_PUBLICATION_REASON =
        CONTROL_PLANE_READINESS_REASON.PUBLICATION_EPOCH_PENDING;
      const MISSING_NODE_ONE = 'selected-missing-node-1';
      const MISSING_NODE_TWO = 'selected-missing-node-2';
      const PUBLISHED_NODE_ONE = 'published-node-1';
      const PUBLISHED_NODE_TWO = 'published-node-2';
      const PUBLISHED_NODE_THREE = 'published-node-3';
      const SELECTED_SNAPSHOT_NODE_ID = MISSING_NODE_ONE;
      const ACTIVE_GATE_COVERAGE_BLOCKER = 'snapshot_coverage=4/5';
      const ACTIVE_GATE_PUBLICATION_BLOCKER =
        'publication_gate=' + GENERIC_PUBLICATION_REASON;
      const PRIORITY_RECOVERY_PARTITION_ID = 'replica_operations-p1';
      const PRIORITY_RECOVERY_OPERATION_ID =
        'operation-timeout-reconcile-due';
      const PRIORITY_RECOVERY_PROGRESS_CLASS =
        PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS;
      const PRIORITY_RECOVERY_PROGRESS_BLOCKER =
        'priority_recovery_progress_class=' + PRIORITY_RECOVERY_PROGRESS_CLASS;
      const PRIORITY_RECOVERY_PROGRESS_CLASS_SIGNAL =
        'priorityRecoveryProgressClass=' + PRIORITY_RECOVERY_PROGRESS_CLASS;
      const PRIORITY_RECOVERY_PARTITION_SIGNAL =
        'priorityRecoveryPartition=' + PRIORITY_RECOVERY_PARTITION_ID;
      const CLOSURE_RECORD_ID = 'CL-003';
      const CLOSURE_WITNESS_CLASS =
        'publication_converged_priority_spread_pending';
      const CLOSURE_STATE = 'closure_satisfied_stale_publication';
      const PUBLICATION_EPOCH = 3;
      const EXPECTED_NODE_COUNT = 5;
      const SNAPSHOT_COVERAGE_COUNT = 4;
      const ACTIVE_NODE_COUNT = 5;
      const SELECTED_PUBLISHED_ACTIVE_COUNT = 3;
      const NO_PROGRESS_ATTEMPT_COUNT = 10;
      const ATTEMPTS_SINCE_PROGRESS = 2;
      const ELAPSED_MS = 123133;
      const ONE_COUNT = 1;
      const ZERO_COUNT = 0;
      const scenarios = [{
        scenario: SCENARIO_NAME,
        passed: false,
        error: 'Not all nodes reached ACTIVE state within 120000ms',
        duration: ELAPSED_MS,
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: ROOT_CAUSE_CLASS_STARTUP,
              dominantReason: GENERIC_PUBLICATION_REASON,
              reasonCounts: {
                [GENERIC_PUBLICATION_REASON]: ONE_COUNT,
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
                prioritySpreadPending: false,
                recoveryProtocolState: RECOVERY_PROTOCOL_STEADY_PUBLISHED,
                priorityRecoveryReasonCodes: [],
                priorityPartitionSummary: {
                  satisfied: true,
                  blockedPartitionCount: ZERO_COUNT,
                  totalSpreadGap: ZERO_COUNT,
                },
              },
              publicationConvergenceGate: {
                ready: true,
                reasons: [],
                reasonCodes: [],
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: ZERO_COUNT,
                missingPublishedNodeIds: [],
                missingPublishedCount: ZERO_COUNT,
                publicationPending: false,
                prioritySpreadPending: false,
                recoveryProtocolState: RECOVERY_PROTOCOL_STEADY_PUBLISHED,
                priorityPartitionSummary: {
                  satisfied: true,
                  blockedPartitionCount: ZERO_COUNT,
                  totalSpreadGap: ZERO_COUNT,
                },
                closureRecordId: CLOSURE_RECORD_ID,
                closureWitnessClass: CLOSURE_WITNESS_CLASS,
              },
              priorityRecoveryObservation: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: ZERO_COUNT,
                missingPublishedNodeIds: [MISSING_NODE_ONE, MISSING_NODE_TWO],
                missingPublishedCount: ATTEMPTS_SINCE_PROGRESS,
                publicationPending: true,
                prioritySpreadPending: false,
                recoveryProtocolState: RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING,
                priorityRecoveryReasonCodes: [GENERIC_PUBLICATION_REASON],
                publicationConvergenceGateReasons: [GENERIC_PUBLICATION_REASON],
                closureRecordId: CLOSURE_RECORD_ID,
                closureWitnessClass: CLOSURE_WITNESS_CLASS,
                priorityRecoveryClosureState: CLOSURE_STATE,
                priorityRecoveryProgressClassIds: [
                  PRIORITY_RECOVERY_PROGRESS_CLASS,
                ],
                priorityRecoveryProgressClassCount: ONE_COUNT,
                priorityRecoverySemanticStateIds: [
                  PRIORITY_RECOVERY_SEMANTIC_STATE.OPERATION_STALLED,
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
                  operationId: PRIORITY_RECOVERY_OPERATION_ID,
                  operationIds: [PRIORITY_RECOVERY_OPERATION_ID],
                  semanticStateId:
                    PRIORITY_RECOVERY_SEMANTIC_STATE.OPERATION_STALLED,
                  progressClassIds: [PRIORITY_RECOVERY_PROGRESS_CLASS],
                  blockerReasonCodes: [PRIORITY_RECOVERY_PROGRESS_CLASS],
                  progressContractState: 'pending',
                  currentOwner:
                    PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
                  blockingBoundary:
                    PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_TIMEOUT,
                  waitMode: PRIORITY_RECOVERY_WAIT_MODE.TIMEOUT_RECONCILE_DUE,
                  nextRequiredAction:
                    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION
                      .RECONCILE_STALE_OPERATION_PROGRESS,
                  actuationState:
                    PRIORITY_RECOVERY_ACTUATION_STATE.TRANSITION_DEFERRED,
                  actuationOwner:
                    PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
                  actuation: {
                    state:
                      PRIORITY_RECOVERY_ACTUATION_STATE.TRANSITION_DEFERRED,
                    owner:
                      PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
                  },
                  progress: {
                    contractState: 'pending',
                    currentOwner:
                      PRIORITY_RECOVERY_PROGRESS_OWNER
                        .OPERATION_WORKFLOW_OWNER,
                    blockingBoundary:
                      PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_TIMEOUT,
                    waitMode:
                      PRIORITY_RECOVERY_WAIT_MODE.TIMEOUT_RECONCILE_DUE,
                    nextRequiredAction:
                      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION
                        .RECONCILE_STALE_OPERATION_PROGRESS,
                  },
                }],
                priorityPartitionSummary: {
                  satisfied: true,
                  requiredDistinctNodeCount: EXPECTED_NODE_COUNT,
                  readyEligibleNodeCount: SNAPSHOT_COVERAGE_COUNT,
                  totalPriorityPartitionCount: EXPECTED_NODE_COUNT,
                  blockedPartitionCount: ZERO_COUNT,
                  largestSpreadGap: ZERO_COUNT,
                  totalSpreadGap: ZERO_COUNT,
                  missingPartitionIds: [],
                  blockedPartitions: [],
                },
              },
              activeGate: {
                mode: ACTIVE_GATE_MODE_STARTUP,
                state: ACTIVE_GATE_STATE_TIMED_OUT,
                ready: false,
                attempts: NO_PROGRESS_ATTEMPT_COUNT,
                elapsedMs: ELAPSED_MS,
                attemptsSinceProgress: ATTEMPTS_SINCE_PROGRESS,
                coordinatorCyclesSinceProgress: ATTEMPTS_SINCE_PROGRESS,
                closureRecordId: CLOSURE_RECORD_ID,
                closureWitnessClass: CLOSURE_WITNESS_CLASS,
                reasonCode: ACTIVE_GATE_TERMINAL_REASON,
                stalledReason: ACTIVE_GATE_STALLED_REASON,
                progress: {
                  expectedNodeCount: EXPECTED_NODE_COUNT,
                  activeNodeCount: ACTIVE_NODE_COUNT,
                  inactiveNodeCount: ZERO_COUNT,
                  snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_COUNT,
                  snapshotCoverageComplete: false,
                  publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                  publicationEpoch: PUBLICATION_EPOCH,
                  recoveryProtocolState:
                    RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING,
                  selectedSnapshotNodeId: SELECTED_SNAPSHOT_NODE_ID,
                  selectedPublishedActiveNodeIds: [
                    PUBLISHED_NODE_ONE,
                    PUBLISHED_NODE_TWO,
                    PUBLISHED_NODE_THREE,
                  ],
                  selectedPublishedActiveCount:
                    SELECTED_PUBLISHED_ACTIVE_COUNT,
                  selectedMissingPublishedNodeIds: [
                    MISSING_NODE_ONE,
                    MISSING_NODE_TWO,
                  ],
                  pendingAckCount: ZERO_COUNT,
                  missingPublishedCount: ATTEMPTS_SINCE_PROGRESS,
                  gateReasons: [GENERIC_PUBLICATION_REASON],
                  prioritySpreadSatisfied: true,
                  prioritySpreadGap: ZERO_COUNT,
                  priorityBlockedPartitionCount: ZERO_COUNT,
                  blockers: [
                    ACTIVE_GATE_COVERAGE_BLOCKER,
                    ACTIVE_GATE_PUBLICATION_BLOCKER,
                  ],
                },
                bestProgress: {
                  expectedNodeCount: EXPECTED_NODE_COUNT,
                  activeNodeCount: ACTIVE_NODE_COUNT,
                  inactiveNodeCount: ZERO_COUNT,
                  snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_COUNT,
                  snapshotCoverageComplete: false,
                  publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                  publicationEpoch: PUBLICATION_EPOCH,
                  recoveryProtocolState:
                    RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING,
                  selectedSnapshotNodeId: SELECTED_SNAPSHOT_NODE_ID,
                  selectedPublishedActiveNodeIds: [
                    PUBLISHED_NODE_ONE,
                    PUBLISHED_NODE_TWO,
                    PUBLISHED_NODE_THREE,
                  ],
                  selectedPublishedActiveCount:
                    SELECTED_PUBLISHED_ACTIVE_COUNT,
                  selectedMissingPublishedNodeIds: [
                    MISSING_NODE_ONE,
                    MISSING_NODE_TWO,
                  ],
                  pendingAckCount: ZERO_COUNT,
                  missingPublishedCount: ATTEMPTS_SINCE_PROGRESS,
                  gateReasons: [],
                  prioritySpreadSatisfied: false,
                  prioritySpreadGap: EXPECTED_NODE_COUNT,
                  priorityBlockedPartitionCount: EXPECTED_NODE_COUNT,
                  priorityRecoveryProgressClasses: {
                    unresolvedClassIds: [PRIORITY_RECOVERY_PROGRESS_CLASS],
                    unresolvedClassCount: ONE_COUNT,
                    unresolvedSemanticStateIds: [
                      PRIORITY_RECOVERY_SEMANTIC_STATE.OPERATION_STALLED,
                    ],
                    unresolvedSemanticStateCount: ONE_COUNT,
                    blockedPartitionIds: [PRIORITY_RECOVERY_PARTITION_ID],
                    blockedPartitionCount: ONE_COUNT,
                    partitionIdsByClass: {
                      [PRIORITY_RECOVERY_PROGRESS_CLASS]: [
                        PRIORITY_RECOVERY_PARTITION_ID,
                      ],
                    },
                    partitionIdsBySemanticState: {
                      [PRIORITY_RECOVERY_SEMANTIC_STATE.OPERATION_STALLED]: [
                        PRIORITY_RECOVERY_PARTITION_ID,
                      ],
                    },
                  },
                  blockers: [
                    ACTIVE_GATE_COVERAGE_BLOCKER,
                    PRIORITY_RECOVERY_PROGRESS_BLOCKER,
                  ],
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
      const activeGateProgress = publicationConvergence.activeGate.progress;
      const activeGateBestProgress =
        publicationConvergence.activeGate.bestProgress;
      const failureClassification =
        scenarioBundle.summary.failureClassification;

      assert.deepEqual(
        publicationConvergence.missingPublishedNodeIds,
        [],
      );
      assert.equal(
        publicationConvergence.missingPublishedCount,
        ZERO_COUNT,
      );
      assert.deepEqual(
        publicationConvergence.publicationConvergenceGateReasons,
        [ACTIVE_GATE_COVERAGE_BLOCKER],
      );
      assert.equal(
        activeGateProgress.missingPublishedCount,
        ZERO_COUNT,
      );
      assert.deepEqual(
        activeGateProgress.selectedMissingPublishedNodeIds,
        [],
      );
      assert.deepEqual(activeGateProgress.gateReasons, []);
      assert.equal(
        activeGateBestProgress.missingPublishedCount,
        ZERO_COUNT,
      );
      assert.deepEqual(
        activeGateBestProgress.selectedMissingPublishedNodeIds,
        [],
      );
      assert.equal(
        activeGateProgress.blockers.includes(ACTIVE_GATE_PUBLICATION_BLOCKER),
        false,
      );
      assert.equal(
        activeGateProgress.blockers.includes(ACTIVE_GATE_COVERAGE_BLOCKER),
        true,
      );
      assert.equal(
        failureClassification.failureClass,
        PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK,
      );
      assert.notEqual(
        failureClassification.dominantReason,
        GENERIC_PUBLICATION_REASON,
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_PROGRESS_CLASS_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_PARTITION_SIGNAL,
        ),
      );
    },
  );
}
