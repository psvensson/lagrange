export function registerFailureBundlePriorityRecoveryWitnessDominanceTests(context) {
  const {
    it,
    assert,
    CONTROL_PLANE_READINESS_REASON,
    FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
    join,
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
    ReportWriter,
    resolve,
    ROOT_CAUSE_CLASS_TOPOLOGY,
    UTF8_ENCODING,
    writeFailureBundlesForReport,
  } = context;
  let tempDir;
  const refreshState = () => {
    tempDir = context.state.tempDir;
  };

  it(
    'keeps dominant priority recovery timeout witness signals coherent when aggregate arrays include secondary scheduling blockers',
    async () => {
      refreshState();
      const REPORT_PATH = join(
        tempDir,
        'priority-recovery-dominant-timeout-witness-signals-report.json',
      );
      const SCENARIO_NAME = 'rolling-restart';
      const ROOT_CAUSE_CLASS = ROOT_CAUSE_CLASS_TOPOLOGY;
      const DOMINANT_REASON =
        'priority_recovery_workflow_timeout_transition_deferred';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_STATE_STEADY = 'steady_published';
      const DOMINANT_PARTITION_ID = 'sql_transactions-p1';
      const SECONDARY_PARTITION_ID = 'sql_write_operations-p1';
      const DOMINANT_OPERATION_ID = 'op-workflow-timeout';
      const SECONDARY_OPERATION_ID = 'op-scheduling-gap';
      const DOMINANT_PROGRESS_CLASS_ID =
        PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS;
      const SECONDARY_PROGRESS_CLASS_ID =
        PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION;
      const DOMINANT_SEMANTIC_STATE_ID =
        PRIORITY_RECOVERY_SEMANTIC_STATE.OPERATION_STALLED;
      const SECONDARY_SEMANTIC_STATE_ID =
        PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION;
      const PUBLICATION_EPOCH = 3;
      const SCENARIO_DURATION_MS = 100;
      const EXPECTED_NODE_COUNT = 5;
      const TWO_COUNT = 2;
      const ZERO_COUNT = 0;
      const DOMINANT_PROGRESS_CLASS_SIGNAL =
        'priorityRecoveryProgressClass=' + DOMINANT_PROGRESS_CLASS_ID;
      const DOMINANT_SEMANTIC_STATE_SIGNAL =
        'priorityRecoverySemanticState=' + DOMINANT_SEMANTIC_STATE_ID;
      const DOMINANT_PARTITION_SIGNAL =
        'priorityRecoveryPartition=' + DOMINANT_PARTITION_ID;
      const DOMINANT_OWNER_SIGNAL =
        PRIORITY_RECOVERY_ACTUATION_OWNER_SIGNAL_PREFIX +
        PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER;
      const DOMINANT_BOUNDARY_SIGNAL =
        PRIORITY_RECOVERY_ACTUATION_BOUNDARY_SIGNAL_PREFIX +
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_TIMEOUT;
      const DOMINANT_WAIT_MODE_SIGNAL =
        PRIORITY_RECOVERY_ACTUATION_WAIT_MODE_SIGNAL_PREFIX +
        PRIORITY_RECOVERY_WAIT_MODE.TIMEOUT_RECONCILE_DUE;
      const DOMINANT_NEXT_ACTION_SIGNAL =
        PRIORITY_RECOVERY_ACTUATION_NEXT_ACTION_SIGNAL_PREFIX +
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION
          .RECONCILE_STALE_OPERATION_PROGRESS;
      const SECONDARY_PARTITION_SIGNAL =
        'priorityRecoveryPartition=' + SECONDARY_PARTITION_ID;
      const writer = new ReportWriter(REPORT_PATH);
      writer.addResult(SCENARIO_NAME, {
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: 'convergence timeout',
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: ROOT_CAUSE_CLASS,
              dominantReason: DOMINANT_REASON,
              reasonCounts: {
                [DOMINANT_REASON]: 1,
              },
            },
            controlPlaneDiagnostics: {
              hasExplicitPriorityRecoveryObservation: true,
              priorityRecoveryObservation: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: ZERO_COUNT,
                missingPublishedNodeIds: [],
                missingPublishedCount: ZERO_COUNT,
                publicationPending: false,
                prioritySpreadPending: false,
                recoveryProtocolState: RECOVERY_PROTOCOL_STATE_STEADY,
                priorityRecoveryReasonCodes: [],
                priorityPartitionSummary: {
                  satisfied: true,
                  requiredDistinctNodeCount: EXPECTED_NODE_COUNT,
                  readyEligibleNodeCount: EXPECTED_NODE_COUNT,
                  totalPriorityPartitionCount: TWO_COUNT,
                  blockedPartitionCount: ZERO_COUNT,
                  largestSpreadGap: ZERO_COUNT,
                  totalSpreadGap: ZERO_COUNT,
                  missingPartitionIds: [],
                  blockedPartitions: [],
                },
                priorityRecoveryProgressClassIds: [
                  SECONDARY_PROGRESS_CLASS_ID,
                  DOMINANT_PROGRESS_CLASS_ID,
                ],
                priorityRecoveryProgressClassCount: TWO_COUNT,
                priorityRecoverySemanticStateIds: [
                  SECONDARY_SEMANTIC_STATE_ID,
                  DOMINANT_SEMANTIC_STATE_ID,
                ],
                priorityRecoverySemanticStateCount: TWO_COUNT,
                priorityRecoveryBlockedPartitionIds: [
                  SECONDARY_PARTITION_ID,
                  DOMINANT_PARTITION_ID,
                ],
                priorityRecoveryBlockedPartitionCount: TWO_COUNT,
                priorityRecoveryUnresolvedPartitionIds: [
                  SECONDARY_PARTITION_ID,
                  DOMINANT_PARTITION_ID,
                ],
                priorityRecoveryUnresolvedPartitionCount: TWO_COUNT,
                priorityRecoveryBlockerPartitionIdsByReason: {
                  [SECONDARY_PROGRESS_CLASS_ID]: [SECONDARY_PARTITION_ID],
                  [DOMINANT_PROGRESS_CLASS_ID]: [DOMINANT_PARTITION_ID],
                },
                priorityRecoveryPartitionIdsBySemanticState: {
                  [SECONDARY_SEMANTIC_STATE_ID]: [SECONDARY_PARTITION_ID],
                  [DOMINANT_SEMANTIC_STATE_ID]: [DOMINANT_PARTITION_ID],
                },
                priorityRecoveryPartitionWitnesses: [{
                  partitionId: SECONDARY_PARTITION_ID,
                  semanticStateId: SECONDARY_SEMANTIC_STATE_ID,
                  progressClassIds: [SECONDARY_PROGRESS_CLASS_ID],
                  blockerReasonCodes: [SECONDARY_PROGRESS_CLASS_ID],
                  progressContractState: 'pending',
                  currentOwner:
                    PRIORITY_RECOVERY_PROGRESS_OWNER.REBALANCER_LEADER,
                  actuationOwner:
                    PRIORITY_RECOVERY_PROGRESS_OWNER.REBALANCER_LEADER,
                  blockingBoundary:
                    PRIORITY_RECOVERY_BLOCKING_BOUNDARY.OPERATION_SCHEDULING,
                  waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
                  nextRequiredAction:
                    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION
                      .CREATE_RECOVERY_OPERATION,
                  actuationState:
                    PRIORITY_RECOVERY_ACTUATION_STATE.ACTION_REQUIRED,
                  operationIds: [SECONDARY_OPERATION_ID],
                }, {
                  partitionId: DOMINANT_PARTITION_ID,
                  semanticStateId: DOMINANT_SEMANTIC_STATE_ID,
                  progressClassIds: [DOMINANT_PROGRESS_CLASS_ID],
                  blockerReasonCodes: [DOMINANT_PROGRESS_CLASS_ID],
                  progressContractState: 'pending',
                  currentOwner:
                    PRIORITY_RECOVERY_PROGRESS_OWNER
                      .OPERATION_WORKFLOW_OWNER,
                  actuationOwner:
                    PRIORITY_RECOVERY_PROGRESS_OWNER
                      .OPERATION_WORKFLOW_OWNER,
                  blockingBoundary:
                    PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_TIMEOUT,
                  waitMode:
                    PRIORITY_RECOVERY_WAIT_MODE.TIMEOUT_RECONCILE_DUE,
                  nextRequiredAction:
                    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION
                      .RECONCILE_STALE_OPERATION_PROGRESS,
                  actuationState:
                    PRIORITY_RECOVERY_ACTUATION_STATE.TRANSITION_DEFERRED,
                  operationIds: [DOMINANT_OPERATION_ID],
                }],
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: REPORT_PATH,
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
        failureClassification.dominantReason,
        DOMINANT_REASON,
      );
      assert.equal(
        failureClassification.rootCauseClass,
        ROOT_CAUSE_CLASS,
      );
      assert.ok(
        failureClassification.signals.includes(
          DOMINANT_PROGRESS_CLASS_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          DOMINANT_SEMANTIC_STATE_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          DOMINANT_PARTITION_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(DOMINANT_OWNER_SIGNAL),
      );
      assert.ok(
        failureClassification.signals.includes(DOMINANT_BOUNDARY_SIGNAL),
      );
      assert.ok(
        failureClassification.signals.includes(DOMINANT_WAIT_MODE_SIGNAL),
      );
      assert.ok(
        failureClassification.signals.includes(DOMINANT_NEXT_ACTION_SIGNAL),
      );
      assert.equal(
        failureClassification.signals.includes(SECONDARY_PARTITION_SIGNAL),
        false,
      );
    },
  );

  it(
    'classifies post-restart active gate owner evidence separately from publication convergence',
    async () => {
      refreshState();
      const POST_RESTART_ACTIVE_GATE_REPORT_PATH = join(
        tempDir,
        'post-restart-active-gate-owner-evidence-report.json',
      );
      const SCENARIO_NAME = 'rolling-restart';
      const FAILURE_ERROR = 'Not all nodes reached ACTIVE state within 120000ms';
      const ROOT_CAUSE_CLASS_TOPOLOGY = 'topology';
      const PRIORITY_RECOVERY_REASON_CODE = 'priority_partitions_not_spread';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD =
        'priority_spread_pending';
      const STARTUP_READINESS_MODE = 'startup';
      const SNAPSHOT_REACHABILITY_TIMEOUT =
        'snapshot_reachability_timeout';
      const SNAPSHOT_REACHABILITY_SOURCE =
        'selectedSnapshotReachabilityError';
      const TERMINAL_RECOVERABILITY = 'terminal';
      const SNAPSHOT_REACHABILITY_ERROR =
        'Control snapshot reachability probe timed out for seed-1';
      const PRIORITY_RECOVERY_SEMANTIC_STATE = 'recovering_in_flight';
      const PRIORITY_RECOVERY_PARTITION_ID = 'replica_operations-p1';
      const PRIORITY_RECOVERY_OPERATION_ID = 'operation-recovering-in-flight';
      const PRIORITY_RECOVERY_COMPLETION_STATE = 'blocked';
      const PRIORITY_RECOVERY_WORKFLOW_STATE = 'in_flight';
      const PUBLICATION_EPOCH = 5;
      const SNAPSHOT_SCHEMA_VERSION = 1;
      const SCENARIO_DURATION_MS = 100;
      const EXPECTED_NODE_COUNT = 5;
      const ACTIVE_NODE_COUNT = 5;
      const SNAPSHOT_COVERAGE_NODE_COUNT = 5;
      const READY_DISTINCT_NODE_COUNT = 1;
      const REQUIRED_DISTINCT_NODE_COUNT = 3;
      const SPREAD_GAP = 2;
      const EMPTY_COUNT = 0;
      const SINGLE_COUNT = 1;
      const PRIORITY_RECOVERY_SEMANTIC_STATE_SIGNAL =
        'priorityRecoverySemanticState=' +
        PRIORITY_RECOVERY_SEMANTIC_STATE;
      const PRIORITY_RECOVERY_PARTITION_SIGNAL =
        'priorityRecoveryPartition=' + PRIORITY_RECOVERY_PARTITION_ID;
      const writer = new ReportWriter(POST_RESTART_ACTIVE_GATE_REPORT_PATH);
      writer.addResult(SCENARIO_NAME, {
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: FAILURE_ERROR,
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: ROOT_CAUSE_CLASS_TOPOLOGY,
              dominantReason: PRIORITY_RECOVERY_REASON_CODE,
              reasonCounts: {
                [PRIORITY_RECOVERY_REASON_CODE]: SINGLE_COUNT,
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
                recoveryProtocolState: RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD,
                priorityRecoveryReasonCodes: [
                  PRIORITY_RECOVERY_REASON_CODE,
                ],
                priorityPartitionSummary: {
                  satisfied: false,
                  requiredDistinctNodeCount: REQUIRED_DISTINCT_NODE_COUNT,
                  readyEligibleNodeCount: EXPECTED_NODE_COUNT,
                  totalPriorityPartitionCount: SINGLE_COUNT,
                  blockedPartitionCount: SINGLE_COUNT,
                  largestSpreadGap: SPREAD_GAP,
                  totalSpreadGap: SPREAD_GAP,
                  missingPartitionIds: [PRIORITY_RECOVERY_PARTITION_ID],
                  blockedPartitions: [{
                    partitionId: PRIORITY_RECOVERY_PARTITION_ID,
                    spreadGap: SPREAD_GAP,
                    requiredDistinctNodeCount: REQUIRED_DISTINCT_NODE_COUNT,
                    readyDistinctNodeCount: READY_DISTINCT_NODE_COUNT,
                  }],
                },
                priorityRecoveryProgressClassIds: [],
                priorityRecoveryProgressClassCount: EMPTY_COUNT,
                priorityRecoverySemanticStateIds: [
                  PRIORITY_RECOVERY_SEMANTIC_STATE,
                ],
                priorityRecoverySemanticStateCount: SINGLE_COUNT,
                priorityRecoveryBlockedPartitionIds: [
                  PRIORITY_RECOVERY_PARTITION_ID,
                ],
                priorityRecoveryBlockedPartitionCount: SINGLE_COUNT,
                priorityRecoveryUnresolvedPartitionIds: [
                  PRIORITY_RECOVERY_PARTITION_ID,
                ],
                priorityRecoveryUnresolvedPartitionCount: SINGLE_COUNT,
                priorityRecoveryPartitionWitnesses: [{
                  partitionId: PRIORITY_RECOVERY_PARTITION_ID,
                  semanticStateId: PRIORITY_RECOVERY_SEMANTIC_STATE,
                  completionState: PRIORITY_RECOVERY_COMPLETION_STATE,
                  workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE,
                  operationIds: [PRIORITY_RECOVERY_OPERATION_ID],
                }],
              },
              activeGateProgress: {
                expectedNodeCount: EXPECTED_NODE_COUNT,
                activeNodeCount: ACTIVE_NODE_COUNT,
                inactiveNodeCount: EMPTY_COUNT,
                snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_NODE_COUNT,
                snapshotCoverageComplete: true,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                recoveryProtocolState: RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD,
                pendingAckCount: EMPTY_COUNT,
                missingPublishedCount: EMPTY_COUNT,
                gateReasonCount: EMPTY_COUNT,
                gateReasons: [],
                prioritySpreadSatisfied: false,
                priorityRecoveryProgressClasses: {
                  unresolvedClassIds: [],
                  unresolvedClassCount: EMPTY_COUNT,
                  partitionIdsBySemanticState: {
                    [PRIORITY_RECOVERY_SEMANTIC_STATE]: [
                      PRIORITY_RECOVERY_PARTITION_ID,
                    ],
                  },
                  unresolvedSemanticStateIds: [
                    PRIORITY_RECOVERY_SEMANTIC_STATE,
                  ],
                  unresolvedSemanticStateCount: SINGLE_COUNT,
                  blockedPartitionIds: [PRIORITY_RECOVERY_PARTITION_ID],
                  blockedPartitionCount: SINGLE_COUNT,
                },
                readinessDelay: {
                  timedOut: true,
                  cause: SNAPSHOT_REACHABILITY_TIMEOUT,
                  source: SNAPSHOT_REACHABILITY_SOURCE,
                  recoverability: TERMINAL_RECOVERABILITY,
                  error: SNAPSHOT_REACHABILITY_ERROR,
                },
              },
              activeGate: {
                mode: STARTUP_READINESS_MODE,
                state: 'waiting',
                attemptsSinceProgress: SINGLE_COUNT,
                progress: {
                  expectedNodeCount: EXPECTED_NODE_COUNT,
                  activeNodeCount: ACTIVE_NODE_COUNT,
                  inactiveNodeCount: EMPTY_COUNT,
                  snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_NODE_COUNT,
                  snapshotCoverageComplete: true,
                  publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                  pendingAckCount: EMPTY_COUNT,
                  missingPublishedCount: EMPTY_COUNT,
                },
                readinessDelay: {
                  timedOut: true,
                  cause: SNAPSHOT_REACHABILITY_TIMEOUT,
                  source: SNAPSHOT_REACHABILITY_SOURCE,
                  recoverability: TERMINAL_RECOVERABILITY,
                  error: SNAPSHOT_REACHABILITY_ERROR,
                },
              },
              priorityRecoveryDecisionSnapshots: {
                schemaVersion: SNAPSHOT_SCHEMA_VERSION,
                publicationEpoch: PUBLICATION_EPOCH,
                partitionIdsBySemanticState: {
                  [PRIORITY_RECOVERY_SEMANTIC_STATE]: [
                    PRIORITY_RECOVERY_PARTITION_ID,
                  ],
                },
                snapshots: [{
                  partitionId: PRIORITY_RECOVERY_PARTITION_ID,
                  semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE,
                  blockerReasons: [],
                  operationId: PRIORITY_RECOVERY_OPERATION_ID,
                  coordinator: {
                    operationIds: [PRIORITY_RECOVERY_OPERATION_ID],
                    operationCount: SINGLE_COUNT,
                  },
                }],
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(
            POST_RESTART_ACTIVE_GATE_REPORT_PATH,
            UTF8_ENCODING,
          ),
        ).scenarios,
        reportOutputPath: POST_RESTART_ACTIVE_GATE_REPORT_PATH,
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
      assert.notEqual(
        failureClassification.failureClass,
        FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
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
    },
  );

  it(
    'prefers readiness owner priority recovery blockers over load-pressure fallback',
    async () => {
      refreshState();
      const READINESS_OWNER_BLOCKER_REPORT_PATH = join(
        tempDir,
        'readiness-owner-priority-recovery-blocker-report.json',
      );
      const SCENARIO_NAME = 'node-join-under-load';
      const READINESS_NODE_ID = 'seed-1';
      const PRIORITY_RECOVERY_PARTITION_ID = 'replica_operations-p1';
      const NON_DOMINANT_PRIORITY_RECOVERY_PARTITION_ID =
        'control_plane_publications-p1';
      const PRIORITY_RECOVERY_SEMANTIC_STATE_ID = 'operation_stalled';
      const NON_DOMINANT_PRIORITY_RECOVERY_SEMANTIC_STATE_ID =
        'spread_satisfied_in_flight';
      const PRIORITY_RECOVERY_PROGRESS_CLASS_ID =
        'operation_created_but_no_step_transitions';
      const PRIORITY_RECOVERY_REASON_CODE =
        'priority_partitions_not_spread';
      const LOAD_ROOT_CAUSE_CLASS = 'load';
      const LOAD_DOMINANT_REASON = 'nodeAdmissionBlocked';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_STATE = 'priority_spread_pending';
      const CONVERGENCE_TIMEOUT_ERROR = 'convergence timeout';
      const PUBLICATION_EPOCH = 6;
      const SCENARIO_DURATION_MS = 100;
      const EMPTY_COUNT = 0;
      const READY_NODE_COUNT = 3;
      const PRIORITY_PARTITION_COUNT = 1;
      const SPREAD_GAP = 1;
      const PRIORITY_RECOVERY_READINESS_NODE_SIGNAL =
        'priorityRecoveryReadinessNode=' + READINESS_NODE_ID;
      const PRIORITY_RECOVERY_PARTITION_SIGNAL =
        'priorityRecoveryPartition=' + PRIORITY_RECOVERY_PARTITION_ID;
      const NON_DOMINANT_PRIORITY_RECOVERY_PARTITION_SIGNAL =
        'priorityRecoveryPartition=' +
        NON_DOMINANT_PRIORITY_RECOVERY_PARTITION_ID;
      const PRIORITY_RECOVERY_SEMANTIC_STATE_SIGNAL =
        'priorityRecoverySemanticState=' +
        PRIORITY_RECOVERY_SEMANTIC_STATE_ID;
      const PRIORITY_RECOVERY_REASON_SIGNAL =
        'priorityRecoveryReason=' +
        CONTROL_PLANE_READINESS_REASON
          .PRIORITY_CONTROL_PLANE_RECOVERY_PENDING;
      const writer = new ReportWriter(READINESS_OWNER_BLOCKER_REPORT_PATH);
      writer.addResult(SCENARIO_NAME, {
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: CONVERGENCE_TIMEOUT_ERROR,
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: LOAD_ROOT_CAUSE_CLASS,
              dominantReason: LOAD_DOMINANT_REASON,
              reasonCounts: {
                [LOAD_DOMINANT_REASON]: PRIORITY_PARTITION_COUNT,
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
                prioritySpreadPending: false,
                recoveryProtocolState: RECOVERY_PROTOCOL_STATE,
                priorityPartitionSummary: {
                  satisfied: true,
                  requiredDistinctNodeCount: READY_NODE_COUNT,
                  readyEligibleNodeCount: READY_NODE_COUNT,
                  totalPriorityPartitionCount: PRIORITY_PARTITION_COUNT,
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
              readinessByNodeId: {
                [READINESS_NODE_ID]: {
                  reasons: [{
                    code: CONTROL_PLANE_READINESS_REASON
                      .PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
                    details: {
                      active: true,
                      reasonCodes: [PRIORITY_RECOVERY_REASON_CODE],
                      publicationGateReasonCodes: [
                        PRIORITY_RECOVERY_REASON_CODE,
                      ],
                      priorityRecoveryObservation: {
                        priorityRecoveryProgressClassIds: [
                          PRIORITY_RECOVERY_PROGRESS_CLASS_ID,
                        ],
                        priorityRecoverySemanticStateIds: [
                          PRIORITY_RECOVERY_SEMANTIC_STATE_ID,
                        ],
                        priorityRecoveryBlockedPartitionIds: [
                          NON_DOMINANT_PRIORITY_RECOVERY_PARTITION_ID,
                          PRIORITY_RECOVERY_PARTITION_ID,
                        ],
                        priorityRecoveryUnresolvedPartitionIds: [
                          PRIORITY_RECOVERY_PARTITION_ID,
                        ],
                        priorityRecoveryBlockerPartitionIdsByReason: {
                          [PRIORITY_RECOVERY_PROGRESS_CLASS_ID]: [
                            PRIORITY_RECOVERY_PARTITION_ID,
                          ],
                        },
                        priorityRecoveryPartitionIdsBySemanticState: {
                          [PRIORITY_RECOVERY_SEMANTIC_STATE_ID]: [
                            PRIORITY_RECOVERY_PARTITION_ID,
                          ],
                          [NON_DOMINANT_PRIORITY_RECOVERY_SEMANTIC_STATE_ID]: [
                            NON_DOMINANT_PRIORITY_RECOVERY_PARTITION_ID,
                          ],
                        },
                        priorityRecoveryPartitionWitnesses: [{
                          partitionId: PRIORITY_RECOVERY_PARTITION_ID,
                          semanticStateId: PRIORITY_RECOVERY_SEMANTIC_STATE_ID,
                          progressClassIds: [
                            PRIORITY_RECOVERY_PROGRESS_CLASS_ID,
                          ],
                        }],
                      },
                      publicationRecoveryGate: {
                        reasonCodes: [PRIORITY_RECOVERY_REASON_CODE],
                        priorityRecoveryClosureWitness: {
                          prioritySpreadPending: true,
                          blockedPartitionIds: [
                            PRIORITY_RECOVERY_PARTITION_ID,
                          ],
                          unresolvedSemanticStateIds: [
                            PRIORITY_RECOVERY_SEMANTIC_STATE_ID,
                          ],
                        },
                        priorityPartitionSummary: {
                          satisfied: false,
                          blockedPartitions: [{
                            partitionId: PRIORITY_RECOVERY_PARTITION_ID,
                            spreadGap: SPREAD_GAP,
                          }],
                        },
                      },
                    },
                  }],
                },
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(
            READINESS_OWNER_BLOCKER_REPORT_PATH,
            UTF8_ENCODING,
          ),
        ).scenarios,
        reportOutputPath: READINESS_OWNER_BLOCKER_REPORT_PATH,
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
        LOAD_ROOT_CAUSE_CLASS,
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_READINESS_NODE_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_PARTITION_SIGNAL,
        ),
      );
      assert.equal(
        failureClassification.signals.includes(
          NON_DOMINANT_PRIORITY_RECOVERY_PARTITION_SIGNAL,
        ),
        false,
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_SEMANTIC_STATE_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_REASON_SIGNAL,
        ),
      );
    },
  );
}
