export function registerFailureBundleCore12Tests(context) {
  const {
    it,
    assert,
    FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
    PRIORITY_RECOVERY_ACTUATION_BOUNDARY_SIGNAL_PREFIX,
    PRIORITY_RECOVERY_ACTUATION_NEXT_ACTION_SIGNAL_PREFIX,
    PRIORITY_RECOVERY_ACTUATION_OWNER_SIGNAL_PREFIX,
    PRIORITY_RECOVERY_ACTUATION_STATE,
    PRIORITY_RECOVERY_ACTUATION_WAIT_MODE_SIGNAL_PREFIX,
    PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
    PRIORITY_RECOVERY_PROGRESS_OWNER,
    PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK,
    PRIORITY_RECOVERY_SEMANTIC_STATE,
    PRIORITY_RECOVERY_WAIT_MODE,
    PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE,
    readFile,
    resolve,
    ROOT_CAUSE_CLASS_TOPOLOGY,
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
    'keeps startup snapshot reachability subordinate to workflow progress',
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
      const SNAPSHOT_REACHABILITY_TIMEOUT =
        'snapshot_reachability_timeout';
      const SNAPSHOT_REACHABILITY_SOURCE =
        'selectedSnapshotReachabilityError';
      const SNAPSHOT_REACHABILITY_RECOVERABILITY = 'terminal';
      const SNAPSHOT_REACHABILITY_ERROR =
        'Control snapshot reachability probe timed out for snapshot-node';
      const ACTIVE_GATE_COVERAGE_BLOCKER = 'snapshot_coverage=3/5';
      const ACTIVE_GATE_INACTIVE_BLOCKER = 'inactive_nodes=3';
      const PRIORITY_RECOVERY_PARTITION_ID = 'sql_write_operations-p1';
      const PRIORITY_RECOVERY_OPERATION_ID = 'operation-dispatch-pending';
      const PRIORITY_RECOVERY_DOMINANT_REASON =
        'priority_recovery_workflow_progress_event_driven';
      const PRIORITY_SPREAD_REASON = 'priority_partitions_not_spread';
      const PRIORITY_RECOVERY_PROGRESS_CONTRACT_PENDING = 'pending';
      const PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT = 'wait';
      const PRIORITY_RECOVERY_COMPLETION_BLOCKED = 'blocked';
      const PRIORITY_RECOVERY_WORKFLOW_IN_FLIGHT = 'in_flight';
      const PRIORITY_RECOVERY_VISIBILITY_CACHE_VISIBLE = 'cache_visible';
      const PRIORITY_RECOVERY_CONVERGENCE_SPREAD_GAP = 'spread_gap';
      const PRIORITY_RECOVERY_LATEST_WORKFLOW_STEP_PENDING = 'PENDING';
      const PRIORITY_RECOVERY_LATEST_OPERATION_STATUS_PENDING = 'pending';
      const PRIORITY_RECOVERY_OWNER_SIGNAL =
        PRIORITY_RECOVERY_ACTUATION_OWNER_SIGNAL_PREFIX +
        PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER;
      const PRIORITY_RECOVERY_BOUNDARY_SIGNAL =
        PRIORITY_RECOVERY_ACTUATION_BOUNDARY_SIGNAL_PREFIX +
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS;
      const PRIORITY_RECOVERY_WAIT_MODE_SIGNAL =
        PRIORITY_RECOVERY_ACTUATION_WAIT_MODE_SIGNAL_PREFIX +
        PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN;
      const PRIORITY_RECOVERY_NEXT_ACTION_SIGNAL =
        PRIORITY_RECOVERY_ACTUATION_NEXT_ACTION_SIGNAL_PREFIX +
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS;
      const PRIORITY_RECOVERY_SEMANTIC_STATE_SIGNAL =
        'priorityRecoverySemanticState=' +
        PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT;
      const PRIORITY_RECOVERY_PARTITION_SIGNAL =
        'priorityRecoveryPartition=' + PRIORITY_RECOVERY_PARTITION_ID;
      const BENCHMARK_GATE_SKIPPED = 'skipped';
      const PUBLICATION_EPOCH = 3;
      const EXPECTED_NODE_COUNT = 5;
      const ACTIVE_NODE_COUNT = 2;
      const INACTIVE_NODE_COUNT = 3;
      const SNAPSHOT_COVERAGE_COUNT = 3;
      const PUBLISHED_ACTIVE_COUNT = 3;
      const READY_DISTINCT_NODE_COUNT = 1;
      const REQUIRED_DISTINCT_NODE_COUNT = 3;
      const PRIORITY_RECOVERY_SPREAD_GAP = 2;
      const PRIORITY_RECOVERY_STEP_AGE_MS = 10199;
      const PRIORITY_RECOVERY_STEP_TIMEOUT_MS = 30000;
      const PRIORITY_RECOVERY_LAST_PROGRESS_AT_MS = 1777916971404;
      const ACTIVE_GATE_ATTEMPTS = 12;
      const ACTIVE_GATE_ELAPSED_MS = 122644;
      const ACTIVE_GATE_ATTEMPTS_SINCE_PROGRESS = 1;
      const ONE_COUNT = 1;
      const ZERO_COUNT = 0;
      const PUBLISHED_NODE_ONE = 'published-node-one';
      const PUBLISHED_NODE_TWO = 'published-node-two';
      const PUBLISHED_NODE_THREE = 'published-node-three';
      const MISSING_NODE_ONE = 'missing-node-one';
      const MISSING_NODE_TWO = 'missing-node-two';
      const SELECTED_SNAPSHOT_NODE_ID = 'snapshot-node';
      const scenarios = [{
        scenario: SCENARIO_NAME,
        passed: false,
        error: 'Not all nodes reached ACTIVE state within 120000ms',
        duration: ACTIVE_GATE_ELAPSED_MS,
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: ROOT_CAUSE_CLASS_TOPOLOGY,
              dominantReason: PRIORITY_RECOVERY_DOMINANT_REASON,
              reasonCounts: {
                [PRIORITY_RECOVERY_DOMINANT_REASON]: ONE_COUNT,
                [PRIORITY_SPREAD_REASON]: ONE_COUNT,
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
                priorityRecoveryReasonCodes: [PRIORITY_SPREAD_REASON],
                priorityPartitionSummary: {
                  satisfied: false,
                  blockedPartitionCount: ONE_COUNT,
                  totalSpreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
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
              },
              priorityRecoveryObservation: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: ZERO_COUNT,
                blockedNodeIds: [],
                blockedNodeCount: ZERO_COUNT,
                missingPublishedNodeIds: [],
                missingPublishedCount: ZERO_COUNT,
                publicationPending: false,
                prioritySpreadPending: false,
                recoveryProtocolState: RECOVERY_PROTOCOL_STEADY_PUBLISHED,
                priorityRecoveryReasonCodes: [PRIORITY_SPREAD_REASON],
                publicationConvergenceGateReasons: [
                  PRIORITY_SPREAD_REASON,
                  ACTIVE_GATE_COVERAGE_BLOCKER,
                ],
                priorityRecoveryProgressClassIds: [],
                priorityRecoveryProgressClassCount: ZERO_COUNT,
                priorityRecoverySemanticStateIds: [
                  PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
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
                priorityRecoveryPartitionIdsBySemanticState: {
                  [PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT]: [
                    PRIORITY_RECOVERY_PARTITION_ID,
                  ],
                },
                priorityRecoveryPartitionWitnesses: [{
                  partitionId: PRIORITY_RECOVERY_PARTITION_ID,
                  operationId: PRIORITY_RECOVERY_OPERATION_ID,
                  operationIds: [PRIORITY_RECOVERY_OPERATION_ID],
                  semanticStateId:
                    PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
                  spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
                  readyDistinctNodeCount: READY_DISTINCT_NODE_COUNT,
                  requiredDistinctNodeCount: REQUIRED_DISTINCT_NODE_COUNT,
                  progressContractState:
                    PRIORITY_RECOVERY_PROGRESS_CONTRACT_PENDING,
                  progressNextAction:
                    PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
                  actuationState:
                    PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
                  actuationOwner:
                    PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
                  currentOwner:
                    PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
                  blockingBoundary:
                    PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
                  waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
                  nextRequiredAction:
                    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION
                      .WAIT_FOR_OPERATION_PROGRESS,
                  workflowProgressPhaseId:
                    PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
                  stepAgeMs: PRIORITY_RECOVERY_STEP_AGE_MS,
                  stepTimeoutMs: PRIORITY_RECOVERY_STEP_TIMEOUT_MS,
                  lastProgressAtMs: PRIORITY_RECOVERY_LAST_PROGRESS_AT_MS,
                  completionState: PRIORITY_RECOVERY_COMPLETION_BLOCKED,
                  workflowState: PRIORITY_RECOVERY_WORKFLOW_IN_FLIGHT,
                  visibilityState: PRIORITY_RECOVERY_VISIBILITY_CACHE_VISIBLE,
                  convergenceState:
                    PRIORITY_RECOVERY_CONVERGENCE_SPREAD_GAP,
                  latestOperationWorkflowStep:
                    PRIORITY_RECOVERY_LATEST_WORKFLOW_STEP_PENDING,
                  latestOperationStatus:
                    PRIORITY_RECOVERY_LATEST_OPERATION_STATUS_PENDING,
                }],
                priorityPartitionSummary: {
                  satisfied: false,
                  requiredDistinctNodeCount: REQUIRED_DISTINCT_NODE_COUNT,
                  readyDistinctNodeCount: READY_DISTINCT_NODE_COUNT,
                  blockedPartitionCount: ONE_COUNT,
                  largestSpreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
                  totalSpreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
                  blockedPartitions: [{
                    partitionId: PRIORITY_RECOVERY_PARTITION_ID,
                    spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
                    readyDistinctNodeCount: READY_DISTINCT_NODE_COUNT,
                    requiredDistinctNodeCount: REQUIRED_DISTINCT_NODE_COUNT,
                  }],
                },
              },
              activeGate: {
                mode: ACTIVE_GATE_MODE_STARTUP,
                state: ACTIVE_GATE_STATE_TIMED_OUT,
                ready: false,
                attempts: ACTIVE_GATE_ATTEMPTS,
                elapsedMs: ACTIVE_GATE_ELAPSED_MS,
                attemptsSinceProgress: ACTIVE_GATE_ATTEMPTS_SINCE_PROGRESS,
                reasonCode: ACTIVE_GATE_TERMINAL_REASON,
                readinessDelay: {
                  timedOut: true,
                  cause: SNAPSHOT_REACHABILITY_TIMEOUT,
                  source: SNAPSHOT_REACHABILITY_SOURCE,
                  recoverability: SNAPSHOT_REACHABILITY_RECOVERABILITY,
                  error: SNAPSHOT_REACHABILITY_ERROR,
                },
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
                  selectedSnapshotNodeId: SELECTED_SNAPSHOT_NODE_ID,
                  selectedSnapshotReachabilityError:
                    SNAPSHOT_REACHABILITY_ERROR,
                  selectedPublishedActiveNodeIds: [
                    PUBLISHED_NODE_ONE,
                    PUBLISHED_NODE_TWO,
                    PUBLISHED_NODE_THREE,
                  ],
                  selectedPublishedActiveCount: PUBLISHED_ACTIVE_COUNT,
                  selectedMissingPublishedNodeIds: [
                    MISSING_NODE_ONE,
                    MISSING_NODE_TWO,
                  ],
                  pendingAckCount: ZERO_COUNT,
                  missingPublishedCount: INACTIVE_NODE_COUNT,
                  prioritySpreadSatisfied: false,
                  prioritySpreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
                  priorityBlockedPartitionCount: ONE_COUNT,
                  priorityRecoveryProgressClasses: {
                    unresolvedClassIds: [],
                    unresolvedClassCount: ZERO_COUNT,
                    unresolvedSemanticStateIds: [
                      PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
                    ],
                    unresolvedSemanticStateCount: ONE_COUNT,
                    blockedPartitionIds: [PRIORITY_RECOVERY_PARTITION_ID],
                    blockedPartitionCount: ONE_COUNT,
                    partitionIdsBySemanticState: {
                      [PRIORITY_RECOVERY_SEMANTIC_STATE
                        .RECOVERING_IN_FLIGHT]: [
                        PRIORITY_RECOVERY_PARTITION_ID,
                      ],
                    },
                  },
                  readinessDelay: {
                    timedOut: true,
                    cause: SNAPSHOT_REACHABILITY_TIMEOUT,
                    source: SNAPSHOT_REACHABILITY_SOURCE,
                    recoverability: SNAPSHOT_REACHABILITY_RECOVERABILITY,
                    error: SNAPSHOT_REACHABILITY_ERROR,
                  },
                  blockers: [
                    ACTIVE_GATE_INACTIVE_BLOCKER,
                    ACTIVE_GATE_COVERAGE_BLOCKER,
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
        benchmarkRegressionGate: {status: BENCHMARK_GATE_SKIPPED},
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const publicationConvergence = scenarioBundle.publicationConvergence;
      const progressSummary =
        publicationConvergence.priorityRecoveryProgressSummary;
      const dominantWitness = progressSummary.dominantWitness;
      const failureClassification =
        scenarioBundle.summary.failureClassification;

      assert.equal(
        scenarioBundle.summary.readinessFailure.classCode,
        SNAPSHOT_REACHABILITY_TIMEOUT,
      );
      assert.equal(
        scenarioBundle.summary.readinessFailure.source,
        SNAPSHOT_REACHABILITY_SOURCE,
      );
      assert.equal(publicationConvergence.pendingAckCount, ZERO_COUNT);
      assert.equal(publicationConvergence.blockedNodeCount, ZERO_COUNT);
      assert.deepEqual(publicationConvergence.missingPublishedNodeIds, []);
      assert.deepEqual(
        publicationConvergence.publicationConvergenceGateReasons,
        [PRIORITY_SPREAD_REASON, ACTIVE_GATE_COVERAGE_BLOCKER],
      );
      assert.equal(
        publicationConvergence.activeGateSnapshotCoverageBlocker,
        ACTIVE_GATE_COVERAGE_BLOCKER,
      );
      assert.equal(
        dominantWitness.partitionId,
        PRIORITY_RECOVERY_PARTITION_ID,
      );
      assert.equal(
        dominantWitness.actuationState,
        PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
      );
      assert.equal(
        dominantWitness.workflowProgressPhaseId,
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
      );
      assert.equal(
        dominantWitness.currentOwner,
        PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      );
      assert.equal(
        dominantWitness.blockingBoundary,
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
      );
      assert.equal(
        dominantWitness.waitMode,
        PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
      );
      assert.equal(
        dominantWitness.nextRequiredAction,
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      );
      assert.equal(
        failureClassification.failureClass,
        PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK,
      );
      assert.notEqual(
        failureClassification.failureClass,
        FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
      );
      assert.equal(
        failureClassification.dominantReason,
        PRIORITY_RECOVERY_DOMINANT_REASON,
      );
      assert.ok(
        failureClassification.signals.includes(ACTIVE_GATE_COVERAGE_BLOCKER),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_SEMANTIC_STATE_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_PARTITION_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(PRIORITY_RECOVERY_OWNER_SIGNAL),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_BOUNDARY_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_WAIT_MODE_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_NEXT_ACTION_SIGNAL,
        ),
      );
    },
  );
}
