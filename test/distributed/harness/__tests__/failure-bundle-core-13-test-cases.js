export function registerFailureBundleCore13Tests(context) {
  const {
    it,
    assert,
    FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
    PRIORITY_RECOVERY_ACTUATION_BOUNDARY_SIGNAL_PREFIX,
    PRIORITY_RECOVERY_ACTUATION_NEXT_ACTION_SIGNAL_PREFIX,
    PRIORITY_RECOVERY_ACTUATION_OWNER_SIGNAL_PREFIX,
    PRIORITY_RECOVERY_ACTUATION_STATE,
    PRIORITY_RECOVERY_ACTUATION_WAIT_MODE_SIGNAL_PREFIX,
    PRIORITY_RECOVERY_BLOCKER_REASON,
    PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
    PRIORITY_RECOVERY_PROGRESS_OWNER,
    PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK,
    PRIORITY_RECOVERY_SEMANTIC_STATE,
    PRIORITY_RECOVERY_WAIT_MODE,
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
    'keeps missing-active publication debt canonical over reachability and serial wait',
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
      const SNAPSHOT_REACHABILITY_TIMEOUT =
        'snapshot_reachability_timeout';
      const SNAPSHOT_REACHABILITY_SOURCE =
        'selectedSnapshotReachabilityError';
      const SNAPSHOT_REACHABILITY_RECOVERABILITY = 'terminal';
      const SNAPSHOT_NODE_ID = 'ebc4aa0b-06c6-506d-93ea-1dd2deca3f58';
      const SNAPSHOT_REACHABILITY_ERROR =
        'Control snapshot reachability probe timed out for ' +
        SNAPSHOT_NODE_ID;
      const PRIORITY_SPREAD_REASON = 'priority_partitions_not_spread';
      const MISSING_NODE_ONE = '8be8d30f-4499-5eed-865c-71b4d529a67a';
      const MISSING_NODE_TWO = SNAPSHOT_NODE_ID;
      const MISSING_NODE_ONE_REASON =
        STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE + '=' +
        MISSING_NODE_ONE;
      const MISSING_NODE_TWO_REASON =
        STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE + '=' +
        MISSING_NODE_TWO;
      const ACTIVE_GATE_COVERAGE_BLOCKER = 'snapshot_coverage=4/5';
      const ACTIVE_GATE_INACTIVE_BLOCKER = 'inactive_nodes=3';
      const PRIORITY_RECOVERY_PARTITION_ID = 'sql_write_operations-p1';
      const PRIORITY_RECOVERY_CORRELATION_KEY =
        'sql_write_operations-p1|3|operation_unknown';
      const PRIORITY_RECOVERY_OPERATION_ID =
        '57aa5679-15ad-4ea9-84f6-c6e5f906abf0';
      const SERIAL_WAIT_OPERATION_ONE =
        '4c37459a-ceb9-4745-a10a-0169ca521f50';
      const SERIAL_WAIT_OPERATION_TWO =
        'f4cadbdd-f27f-4660-b1a8-556e19ec4271';
      const SERIAL_WAIT_PARTITION_ONE = 'sql_transaction_participants-p1';
      const SERIAL_WAIT_PARTITION_TWO = 'sql_transactions-p1';
      const PRIORITY_RECOVERY_PROGRESS_CLASS =
        PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT;
      const PRIORITY_RECOVERY_SEMANTIC_STATE_ID =
        PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION;
      const PRIORITY_RECOVERY_PROGRESS_CONTRACT_PENDING = 'pending';
      const PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT = 'wait';
      const PRIORITY_RECOVERY_ACTUATION_TRANSITION_DEFERRED =
        PRIORITY_RECOVERY_ACTUATION_STATE.TRANSITION_DEFERRED;
      const PRIORITY_RECOVERY_COMPLETION_BLOCKED = 'blocked';
      const PRIORITY_RECOVERY_WORKFLOW_STATE_NONE = 'none';
      const PRIORITY_RECOVERY_VISIBILITY_NONE = 'none';
      const PRIORITY_RECOVERY_CONVERGENCE_SPREAD_GAP = 'spread_gap';
      const PRIORITY_RECOVERY_WORKFLOW_STEP_UNAVAILABLE = 'unavailable';
      const PRIORITY_RECOVERY_PROGRESS_BLOCKER =
        'priority_recovery_progress_class=' + PRIORITY_RECOVERY_PROGRESS_CLASS;
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
      const PUBLICATION_EPOCH = 3;
      const EXPECTED_NODE_COUNT = 5;
      const ACTIVE_NODE_COUNT = 2;
      const BEST_ACTIVE_NODE_COUNT = 3;
      const INACTIVE_NODE_COUNT = 3;
      const BEST_INACTIVE_NODE_COUNT = 2;
      const SNAPSHOT_COVERAGE_COUNT = 4;
      const PUBLISHED_ACTIVE_COUNT = 3;
      const READY_DISTINCT_NODE_COUNT = 1;
      const REQUIRED_DISTINCT_NODE_COUNT = 3;
      const PRIORITY_SPREAD_GAP = 10;
      const SERIAL_WAIT_SPREAD_GAP = 2;
      const ACTIVE_GATE_ATTEMPTS = 12;
      const ACTIVE_GATE_ELAPSED_MS = 121889;
      const ACTIVE_GATE_ATTEMPTS_SINCE_PROGRESS = 3;
      const PRIORITY_RECOVERY_LAST_PROGRESS_AT_MS = 1777967393857;
      const ONE_COUNT = 1;
      const TWO_COUNT = 2;
      const ZERO_COUNT = 0;
      const PUBLISHED_NODE_ONE = '11601fe0-72d6-5853-8590-ec2881853e72';
      const PUBLISHED_NODE_TWO = '35a891b8-c1a0-5064-9c6e-2acfba61c2a7';
      const PUBLISHED_NODE_THREE = '7493b0ab-a054-5fad-a91b-5e331db29304';
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
        error: 'Not all nodes reached ACTIVE state within 120000ms',
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
                  blockedPartitionCount: EXPECTED_NODE_COUNT,
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
                  semanticStateId: PRIORITY_RECOVERY_SEMANTIC_STATE_ID,
                  blockerReasons: [PRIORITY_RECOVERY_PROGRESS_CLASS],
                  planner: {
                    spreadGap: SERIAL_WAIT_SPREAD_GAP,
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
                      PRIORITY_RECOVERY_WORKFLOW_STATE_NONE,
                    lastProgressAtMs: PRIORITY_RECOVERY_LAST_PROGRESS_AT_MS,
                    stepAgeMs: PRIORITY_RECOVERY_LAST_PROGRESS_AT_MS,
                  },
                  actuation: {
                    state: PRIORITY_RECOVERY_ACTUATION_TRANSITION_DEFERRED,
                    owner:
                      PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
                  },
                  completion: {
                    state: PRIORITY_RECOVERY_COMPLETION_BLOCKED,
                  },
                  observation: {
                    visibilityState: PRIORITY_RECOVERY_VISIBILITY_NONE,
                    workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_NONE,
                    convergenceState:
                      PRIORITY_RECOVERY_CONVERGENCE_SPREAD_GAP,
                    provenance: {
                      capturedAt: PRIORITY_RECOVERY_LAST_PROGRESS_AT_MS,
                    },
                  },
                  admission: {
                    decisionDimension:
                      PRIORITY_RECOVERY_WORKFLOW_STEP_UNAVAILABLE,
                  },
                  coordinator: {
                    operationIds: [PRIORITY_RECOVERY_OPERATION_ID],
                    serialWaitOperationIds: [
                      SERIAL_WAIT_OPERATION_ONE,
                      SERIAL_WAIT_OPERATION_TWO,
                    ],
                    serialWaitPartitionIds: [
                      SERIAL_WAIT_PARTITION_ONE,
                      SERIAL_WAIT_PARTITION_TWO,
                    ],
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
                  selectedSnapshotNodeId: SNAPSHOT_NODE_ID,
                  selectedSnapshotReachabilityError:
                    SNAPSHOT_REACHABILITY_ERROR,
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
                    unresolvedClassIds: [PRIORITY_RECOVERY_PROGRESS_CLASS],
                    unresolvedClassCount: ONE_COUNT,
                    unresolvedSemanticStateIds: [
                      PRIORITY_RECOVERY_SEMANTIC_STATE_ID,
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
                      [PRIORITY_RECOVERY_SEMANTIC_STATE_ID]: [
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
                    PRIORITY_RECOVERY_PROGRESS_BLOCKER,
                  ],
                },
                bestProgress: {
                  expectedNodeCount: EXPECTED_NODE_COUNT,
                  activeNodeCount: BEST_ACTIVE_NODE_COUNT,
                  inactiveNodeCount: BEST_INACTIVE_NODE_COUNT,
                  snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_COUNT,
                  snapshotCoverageComplete: false,
                  publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                  publicationEpoch: PUBLICATION_EPOCH,
                  recoveryProtocolState:
                    RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING,
                  selectedSnapshotNodeId: SNAPSHOT_NODE_ID,
                  selectedPublishedActiveNodeIds: PUBLISHED_NODE_IDS,
                  selectedPublishedActiveCount: PUBLISHED_ACTIVE_COUNT,
                  selectedMissingPublishedNodeIds: MISSING_NODE_IDS,
                  pendingAckCount: ZERO_COUNT,
                  missingPublishedCount: TWO_COUNT,
                  gateReasons: [],
                  prioritySpreadSatisfied: false,
                  prioritySpreadGap: PRIORITY_SPREAD_GAP,
                  priorityBlockedPartitionCount: ONE_COUNT,
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
        SNAPSHOT_REACHABILITY_TIMEOUT,
      );
      assert.equal(
        scenarioBundle.summary.readinessFailure.source,
        SNAPSHOT_REACHABILITY_SOURCE,
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
        publicationConvergence.activeGateSnapshotCoverageBlocker,
        ACTIVE_GATE_COVERAGE_BLOCKER,
      );
      assert.equal(
        activeGateProgress.selectedSnapshotReachabilityError,
        SNAPSHOT_REACHABILITY_ERROR,
      );
      assert.equal(
        activeGateProgress.selectedPublishedActiveCount,
        PUBLISHED_ACTIVE_COUNT,
      );
      assert.deepEqual(
        publicationConvergence.priorityRecoveryProgressClassIds,
        [PRIORITY_RECOVERY_PROGRESS_CLASS],
      );
      assert.deepEqual(
        publicationConvergence.priorityRecoverySemanticStateIds,
        [PRIORITY_RECOVERY_SEMANTIC_STATE_ID],
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
        dominantWitness.correlationKey,
        PRIORITY_RECOVERY_CORRELATION_KEY,
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
        PRIORITY_RECOVERY_SEMANTIC_STATE_ID,
      );
      assert.equal(
        priorityRecoveryWitness.currentOwner,
        PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      );
      assert.equal(
        priorityRecoveryWitness.blockingBoundary,
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
      );
      assert.equal(
        priorityRecoveryWitness.correlationKey,
        PRIORITY_RECOVERY_CORRELATION_KEY,
      );
      assert.deepEqual(
        priorityRecoveryWitness.operationIds,
        [PRIORITY_RECOVERY_OPERATION_ID],
      );
      assert.deepEqual(
        priorityRecoveryWitness.serialWaitOperationIds,
        [SERIAL_WAIT_OPERATION_ONE, SERIAL_WAIT_OPERATION_TWO],
      );
      assert.deepEqual(
        priorityRecoveryWitness.serialWaitPartitionIds,
        [SERIAL_WAIT_PARTITION_ONE, SERIAL_WAIT_PARTITION_TWO],
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
        'activeGateReadinessClass=' + SNAPSHOT_REACHABILITY_TIMEOUT,
      ));
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
        failureClassification.signals.includes(
          'priorityRecoveryProgressClassCount=' + ONE_COUNT,
        ),
      );
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
        failureClassification.signals.includes(PRIORITY_RECOVERY_NEXT_ACTION_SIGNAL),
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
