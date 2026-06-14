export function registerFailureBundleMissingActiveDebtOverPendingDispatchTests(context) {
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
    STABILITY_GATE_BLOCKER_PRIORITY_SPREAD_PENDING,
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
    'keeps 175220Z missing-active debt canonical over pending dispatch progress',
    async () => {
      refreshState();
      const SCENARIO_NAME = 'rolling-restart';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_PUBLICATION_PENDING = 'publication_pending';
      const RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING =
        'priority_spread_pending';
      const ACTIVE_GATE_MODE_STARTUP = 'startup';
      const ACTIVE_GATE_STATE_TIMED_OUT = 'timed_out';
      const ACTIVE_GATE_TERMINAL_REASON = 'stalled_no_progress';
      const ACTIVE_GATE_READINESS_CLASS = 'no_progress_terminal';
      const ACTIVE_GATE_READINESS_SOURCE = 'activeGateProgress';
      const ACTIVE_GATE_READINESS_RECOVERABILITY = 'terminal';
      const ACTIVE_GATE_ERROR =
        'Not all nodes reached ACTIVE state within 120000ms';
      const ACTIVE_GATE_COVERAGE_BLOCKER = 'snapshot_coverage=3/5';
      const ACTIVE_GATE_INACTIVE_BLOCKER = 'inactive_nodes=2';
      const PRIORITY_SPREAD_REASON = 'priority_partitions_not_spread';
      const SELECTED_SNAPSHOT_NODE_ID =
        '35a891b8-c1a0-5064-9c6e-2acfba61c2a7';
      const SELECTED_SNAPSHOT_REACHABLE_BY = 'admin_health';
      const EMPTY_REACHABILITY_ERROR = '';
      const MISSING_NODE_ONE = '11601fe0-72d6-5853-8590-ec2881853e72';
      const MISSING_NODE_TWO = 'ebc4aa0b-06c6-506d-93ea-1dd2deca3f58';
      const MISSING_NODE_ONE_REASON =
        STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE + '=' +
        MISSING_NODE_ONE;
      const MISSING_NODE_TWO_REASON =
        STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE + '=' +
        MISSING_NODE_TWO;
      const PRIORITY_RECOVERY_PARTITION_ID = 'sql_write_operations-p1';
      const PRIORITY_RECOVERY_OPERATION_ID =
        'c3fedf19-19e4-4792-8a9f-8e4734cb88ad';
      const SERIAL_WAIT_OPERATION_ID =
        '99dfca41-8b3e-4d05-845d-6ccb71c89a0d';
      const SERIAL_WAIT_PARTITION_ID = 'sql_transaction_participants-p1';
      const PRIORITY_RECOVERY_CORRELATION_KEY =
        PRIORITY_RECOVERY_PARTITION_ID + '|3|' +
        PRIORITY_RECOVERY_OPERATION_ID;
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
      const MISSING_PUBLISHED_SIGNAL =
        'missingPublishedNodeIds=' + MISSING_NODE_ONE + '|' +
        MISSING_NODE_TWO;
      const BENCHMARK_GATE_SKIPPED = 'skipped';
      const PUBLICATION_EPOCH = 3;
      const EXPECTED_NODE_COUNT = 5;
      const ACTIVE_NODE_COUNT = 3;
      const INACTIVE_NODE_COUNT = 2;
      const SNAPSHOT_COVERAGE_COUNT = 3;
      const PUBLISHED_ACTIVE_COUNT = 3;
      const READY_DISTINCT_NODE_COUNT = 1;
      const REQUIRED_DISTINCT_NODE_COUNT = 3;
      const PRIORITY_SPREAD_GAP = 6;
      const PRIORITY_RECOVERY_SPREAD_GAP = 2;
      const PRIORITY_RECOVERY_STEP_AGE_MS = 13893;
      const PRIORITY_RECOVERY_STEP_TIMEOUT_MS = 30000;
      const PRIORITY_RECOVERY_LAST_PROGRESS_AT_MS = 1778003531934;
      const ACTIVE_GATE_ATTEMPTS = 10;
      const ACTIVE_GATE_ELAPSED_MS = 120091;
      const ACTIVE_GATE_ATTEMPTS_SINCE_PROGRESS = 2;
      const ONE_COUNT = 1;
      const TWO_COUNT = 2;
      const ZERO_COUNT = 0;
      const PUBLISHED_NODE_ONE = SELECTED_SNAPSHOT_NODE_ID;
      const PUBLISHED_NODE_TWO = '7493b0ab-a054-5fad-a91b-5e331db29304';
      const PUBLISHED_NODE_THREE = '8be8d30f-4499-5eed-865c-71b4d529a67a';
      const MISSING_NODE_IDS = [MISSING_NODE_ONE, MISSING_NODE_TWO];
      const PUBLISHED_NODE_IDS = [
        PUBLISHED_NODE_ONE,
        PUBLISHED_NODE_TWO,
        PUBLISHED_NODE_THREE,
      ];
      const PUBLICATION_GATE_REASONS = [
        PRIORITY_SPREAD_REASON,
        ACTIVE_GATE_COVERAGE_BLOCKER,
        MISSING_NODE_ONE_REASON,
        MISSING_NODE_TWO_REASON,
      ];
      const EXPECTED_PUBLICATION_GATE_REASONS = [
        PRIORITY_SPREAD_REASON,
        MISSING_NODE_ONE_REASON,
        MISSING_NODE_TWO_REASON,
        ACTIVE_GATE_COVERAGE_BLOCKER,
      ];
      const scenarios = [{
        scenario: SCENARIO_NAME,
        passed: false,
        error: ACTIVE_GATE_ERROR,
        duration: ACTIVE_GATE_ELAPSED_MS,
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: ROOT_CAUSE_CLASS_TOPOLOGY,
              dominantReason: PRIORITY_SPREAD_REASON,
              reasonCounts: {
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
                missingPublishedNodeIds: MISSING_NODE_IDS,
                missingPublishedCount: TWO_COUNT,
                publicationPending: true,
                prioritySpreadPending: true,
                recoveryProtocolState:
                  RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING,
                priorityRecoveryReasonCodes: [PRIORITY_SPREAD_REASON],
                priorityPartitionSummary: {
                  satisfied: false,
                  blockedPartitionCount: ONE_COUNT,
                  largestSpreadGap: PRIORITY_SPREAD_GAP,
                  totalSpreadGap: PRIORITY_SPREAD_GAP,
                },
              },
              publicationConvergenceGate: {
                ready: false,
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: ZERO_COUNT,
                missingPublishedNodeIds: MISSING_NODE_IDS,
                missingPublishedCount: TWO_COUNT,
                publicationPending: true,
                prioritySpreadPending: true,
                recoveryProtocolState: RECOVERY_PROTOCOL_PUBLICATION_PENDING,
                reasons: PUBLICATION_GATE_REASONS,
                reasonCodes: PUBLICATION_GATE_REASONS,
              },
              priorityRecoveryDecisionSnapshots: {
                capturedAt: PRIORITY_RECOVERY_LAST_PROGRESS_AT_MS,
                publicationEpoch: PUBLICATION_EPOCH,
                snapshots: [{
                  partitionId: PRIORITY_RECOVERY_PARTITION_ID,
                  epoch: PUBLICATION_EPOCH,
                  correlationKey: PRIORITY_RECOVERY_CORRELATION_KEY,
                  operationId: PRIORITY_RECOVERY_OPERATION_ID,
                  semanticStateId:
                    PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
                  blockerReasons: [],
                  planner: {
                    spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
                    readyDistinctNodeCount: READY_DISTINCT_NODE_COUNT,
                    requiredDistinctNodeCount: REQUIRED_DISTINCT_NODE_COUNT,
                  },
                  progress: {
                    contractState:
                      PRIORITY_RECOVERY_PROGRESS_CONTRACT_PENDING,
                    nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
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
                    lastProgressAtMs: PRIORITY_RECOVERY_LAST_PROGRESS_AT_MS,
                    stepAgeMs: PRIORITY_RECOVERY_STEP_AGE_MS,
                    stepTimeoutMs: PRIORITY_RECOVERY_STEP_TIMEOUT_MS,
                  },
                  actuation: {
                    state:
                      PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
                    owner:
                      PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
                  },
                  completion: {
                    state: PRIORITY_RECOVERY_COMPLETION_BLOCKED,
                  },
                  observation: {
                    visibilityState:
                      PRIORITY_RECOVERY_VISIBILITY_CACHE_VISIBLE,
                    workflowState: PRIORITY_RECOVERY_WORKFLOW_IN_FLIGHT,
                    convergenceState:
                      PRIORITY_RECOVERY_CONVERGENCE_SPREAD_GAP,
                    latestOperationWorkflowStep:
                      PRIORITY_RECOVERY_LATEST_WORKFLOW_STEP_PENDING,
                    latestOperationStatus:
                      PRIORITY_RECOVERY_LATEST_OPERATION_STATUS_PENDING,
                    provenance: {
                      capturedAt: PRIORITY_RECOVERY_LAST_PROGRESS_AT_MS,
                    },
                  },
                  coordinator: {
                    operationIds: [PRIORITY_RECOVERY_OPERATION_ID],
                    serialWaitOperationIds: [SERIAL_WAIT_OPERATION_ID],
                    serialWaitPartitionIds: [SERIAL_WAIT_PARTITION_ID],
                  },
                }],
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
                  cause: ACTIVE_GATE_READINESS_CLASS,
                  source: ACTIVE_GATE_READINESS_SOURCE,
                  recoverability: ACTIVE_GATE_READINESS_RECOVERABILITY,
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
                  selectedSnapshotAdminReady: true,
                  selectedSnapshotReachableBy: SELECTED_SNAPSHOT_REACHABLE_BY,
                  selectedSnapshotReachabilityError:
                    EMPTY_REACHABILITY_ERROR,
                  selectedPublishedActiveNodeIds: PUBLISHED_NODE_IDS,
                  selectedPublishedActiveCount: PUBLISHED_ACTIVE_COUNT,
                  selectedMissingPublishedNodeIds: MISSING_NODE_IDS,
                  pendingAckCount: ZERO_COUNT,
                  missingPublishedCount: TWO_COUNT,
                  gateReasons: [],
                  prioritySpreadSatisfied: false,
                  prioritySpreadGap: PRIORITY_SPREAD_GAP,
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
                    cause: ACTIVE_GATE_READINESS_CLASS,
                    source: ACTIVE_GATE_READINESS_SOURCE,
                    recoverability: ACTIVE_GATE_READINESS_RECOVERABILITY,
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
      const triageSummary = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.triageJsonPath),
          UTF8_ENCODING,
        ),
      );
      const publicationConvergence = scenarioBundle.publicationConvergence;
      const activeGateProgress = publicationConvergence.activeGate.progress;
      const progressSummary =
        publicationConvergence.priorityRecoveryProgressSummary;
      const dominantWitness = progressSummary.dominantWitness;
      const priorityRecoveryWitness =
        publicationConvergence.priorityRecoveryPartitionWitnesses[ZERO_COUNT];
      const failureClassification =
        scenarioBundle.summary.failureClassification;

      assert.equal(
        scenarioBundle.summary.readinessFailure.classCode,
        ACTIVE_GATE_READINESS_CLASS,
      );
      assert.equal(
        publicationConvergence.publicationStatus,
        PUBLICATION_STATUS_PUBLISHED,
      );
      assert.equal(publicationConvergence.pendingAckCount, ZERO_COUNT);
      assert.equal(publicationConvergence.missingPublishedCount, TWO_COUNT);
      assert.deepEqual(
        publicationConvergence.missingPublishedNodeIds,
        MISSING_NODE_IDS,
      );
      assert.equal(publicationConvergence.publicationPending, true);
      assert.equal(
        publicationConvergence.recoveryProtocolState,
        RECOVERY_PROTOCOL_PUBLICATION_PENDING,
      );
      assert.deepEqual(
        publicationConvergence.publicationConvergenceGateReasons,
        EXPECTED_PUBLICATION_GATE_REASONS,
      );
      assert.equal(
        activeGateProgress.selectedSnapshotNodeId,
        SELECTED_SNAPSHOT_NODE_ID,
      );
      assert.equal(
        activeGateProgress.selectedSnapshotReachabilityError,
        EMPTY_REACHABILITY_ERROR,
      );
      assert.equal(
        activeGateProgress.selectedPublishedActiveCount,
        PUBLISHED_ACTIVE_COUNT,
      );
      assert.deepEqual(
        publicationConvergence.priorityRecoveryProgressClassIds,
        [],
      );
      assert.deepEqual(
        publicationConvergence.priorityRecoverySemanticStateIds,
        [PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT],
      );
      assert.deepEqual(
        publicationConvergence.priorityRecoveryBlockedPartitionIds,
        [PRIORITY_RECOVERY_PARTITION_ID],
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
      assert.deepEqual(
        dominantWitness.operationIds,
        [PRIORITY_RECOVERY_OPERATION_ID],
      );
      assert.equal(
        priorityRecoveryWitness.partitionId,
        PRIORITY_RECOVERY_PARTITION_ID,
      );
      assert.equal(
        priorityRecoveryWitness.semanticStateId,
        PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
      );
      assert.deepEqual(
        priorityRecoveryWitness.serialWaitOperationIds,
        [SERIAL_WAIT_OPERATION_ID],
      );
      assert.deepEqual(
        priorityRecoveryWitness.serialWaitPartitionIds,
        [SERIAL_WAIT_PARTITION_ID],
      );
      assert.equal(
        failureClassification.failureClass,
        FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
      );
      assert.equal(
        failureClassification.dominantReason,
        MISSING_NODE_ONE_REASON,
      );
      assert.notEqual(
        failureClassification.failureClass,
        PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK,
      );
      assert.ok(failureClassification.signals.includes(
        'missingPublishedCount=' + TWO_COUNT,
      ));
      assert.ok(
        failureClassification.signals.includes(MISSING_PUBLISHED_SIGNAL),
      );
      assert.ok(failureClassification.signals.includes(
        'recoveryProtocolState=' + RECOVERY_PROTOCOL_PUBLICATION_PENDING,
      ));
      assert.ok(
        failureClassification.signals.includes(PRIORITY_RECOVERY_OWNER_SIGNAL),
      );
      assert.ok(
        failureClassification.signals.includes(PRIORITY_RECOVERY_BOUNDARY_SIGNAL),
      );
      assert.ok(
        failureClassification.signals.includes(PRIORITY_RECOVERY_WAIT_MODE_SIGNAL),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_NEXT_ACTION_SIGNAL,
        ),
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.failover.blockers.includes(
          STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE,
        ),
        true,
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.convergence.blockers.includes(
          STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE,
        ),
        true,
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.convergence.blockers.includes(
          STABILITY_GATE_BLOCKER_PRIORITY_SPREAD_PENDING,
        ),
        true,
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.restart_recovery.blockers
          .includes(STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE),
        true,
      );
      assert.equal(
        triageSummary.summary.failureClass,
        FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
      );
      assert.equal(
        triageSummary.summary.dominantReason,
        MISSING_NODE_ONE_REASON,
      );
      assert.deepEqual(
        triageSummary.publicationConvergence.missingPublishedNodeIds,
        MISSING_NODE_IDS,
      );
      assert.ok(
        triageSummary.summary.failureClassSignals.includes(
          PRIORITY_RECOVERY_OWNER_SIGNAL,
        ),
      );
      assert.ok(
        triageSummary.summary.failureClassSignals.includes(
          PRIORITY_RECOVERY_BOUNDARY_SIGNAL,
        ),
      );
      assert.ok(
        triageSummary.summary.failureClassSignals.includes(
          PRIORITY_RECOVERY_WAIT_MODE_SIGNAL,
        ),
      );
      assert.ok(
        triageSummary.summary.failureClassSignals.includes(
          PRIORITY_RECOVERY_NEXT_ACTION_SIGNAL,
        ),
      );
    },
  );
}
