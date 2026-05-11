export function registerFailureBundleCore05Tests(context) {
  const {
    it,
    assert,
    FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
    FAILURE_CLASS_TOPOLOGY_UNSTABLE,
    join,
    mkdir,
    PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK,
    readFile,
    ReportWriter,
    resolve,
    UTF8_ENCODING,
    writeFailureBundlesForReport,
    writeFile,
  } = context;
  let tempDir;
  const refreshState = () => {
    tempDir = context.state.tempDir;
  };

  it(
    'prefers terminal active-gate diagnostics over stale playback priority-recovery evidence',
    async () => {
      refreshState();
      const REPORT_PATH = join(
        tempDir,
        'terminal-active-gate-over-stale-playback-report.json',
      );
      const SCENARIO_NAME = 'rolling-restart';
      const SCENARIO_DIR = join(tempDir, SCENARIO_NAME);
      const STALE_DOMINANT_REASON = 'priority_partitions_not_spread';
      const STALE_PROGRESS_CLASS = 'eligible_but_no_operation_created';
      const STALE_PARTITION_ID = 'sql_transactions-p1';
      const ACTIVE_GATE_BLOCKER = 'inactive_nodes=1';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_STATE_STEADY = 'steady_published';
      const RECOVERY_PROTOCOL_STATE_PRIORITY_PENDING =
        'priority_spread_pending';
      const STARTUP_READINESS_MODE = 'startup';
      const ACTIVE_GATE_STATE_TIMED_OUT = 'timed_out';
      const READINESS_CLASS_NO_PROGRESS = 'no_progress_terminal';
      const TERMINAL_REASON_STALLED = 'stalled_no_progress';
      const EMPTY_COUNT = 0;
      const SINGLE_COUNT = 1;
      const EXPECTED_NODE_COUNT = 5;
      const ACTIVE_NODE_COUNT = 4;
      const FULL_ACTIVE_NODE_COUNT = 5;
      const TERMINAL_ATTEMPT_COUNT = 6;
      const TERMINAL_ELAPSED_MS = 122546;
      const PLAYBACK_CAPTURED_AT_MS = 1700000000000;
      const writer = new ReportWriter(REPORT_PATH);
      await mkdir(SCENARIO_DIR, {recursive: true});
      await writeFile(
        join(SCENARIO_DIR, 'events.ndjson'),
        JSON.stringify({
          timestamp: PLAYBACK_CAPTURED_AT_MS,
          type: 'cluster.stage',
          details: {
            stage: 'setup.cluster.active',
            snapshotCoverage: {
              completeCoverage: true,
              bestCoverageNodeCount: EXPECTED_NODE_COUNT,
              selectedNodeId: 'seed-1',
              selectedCapturedAtMs: PLAYBACK_CAPTURED_AT_MS,
              selectedObservedNodeIds: [
                'seed-1',
                'seed-2',
                'seed-3',
                'seed-4',
                'seed-5',
              ],
              selectedPublicationConvergence: {
                publicationEpoch: 4,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                recoveryProtocolState:
                  RECOVERY_PROTOCOL_STATE_PRIORITY_PENDING,
                priorityRecoveryReasonCodes: [STALE_DOMINANT_REASON],
                priorityPartitionSummary: {
                  satisfied: false,
                  blockedPartitionCount: SINGLE_COUNT,
                  blockedPartitions: [{
                    partitionId: STALE_PARTITION_ID,
                    spreadGap: SINGLE_COUNT,
                  }],
                },
                pendingAckNodeIds: [],
              },
              selectedPublishedMembershipObservation: {
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
              },
            },
            publicationConvergenceGate: {
              publicationEpoch: 4,
              publicationStatus: PUBLICATION_STATUS_PUBLISHED,
              recoveryProtocolState:
                RECOVERY_PROTOCOL_STATE_PRIORITY_PENDING,
              reasonCodes: [STALE_DOMINANT_REASON],
              prioritySpreadPending: true,
              ready: false,
              pendingAckNodeIds: [],
              priorityPartitionSummary: {
                satisfied: false,
                blockedPartitionCount: SINGLE_COUNT,
                blockedPartitions: [{
                  partitionId: STALE_PARTITION_ID,
                  spreadGap: SINGLE_COUNT,
                }],
              },
            },
            activeGateProgress: {
              expectedNodeCount: EXPECTED_NODE_COUNT,
              activeNodeCount: FULL_ACTIVE_NODE_COUNT,
              inactiveNodeCount: EMPTY_COUNT,
              snapshotCoverageNodeCount: EXPECTED_NODE_COUNT,
              snapshotCoverageComplete: true,
              publicationStatus: PUBLICATION_STATUS_PUBLISHED,
              recoveryProtocolState:
                RECOVERY_PROTOCOL_STATE_PRIORITY_PENDING,
              pendingAckCount: EMPTY_COUNT,
              missingPublishedCount: EMPTY_COUNT,
              gateReasonCount: EMPTY_COUNT,
              gateReasons: [],
              prioritySpreadSatisfied: false,
              priorityBlockedPartitionCount: SINGLE_COUNT,
              priorityRecoveryProgressClasses: {
                unresolvedClassIds: [STALE_PROGRESS_CLASS],
                unresolvedClassCount: SINGLE_COUNT,
                unresolvedSemanticStateIds: ['needs_operation'],
                unresolvedSemanticStateCount: SINGLE_COUNT,
                blockedPartitionIds: [STALE_PARTITION_ID],
                blockedPartitionCount: SINGLE_COUNT,
              },
              priorityRecoveryUnresolvedClassCount: SINGLE_COUNT,
              priorityRecoveryUnresolvedSemanticStateCount: SINGLE_COUNT,
              priorityRecoveryBlockedPartitionCount: SINGLE_COUNT,
              blockers: [
                'priority_recovery_progress_class=' + STALE_PROGRESS_CLASS,
              ],
            },
          },
        }) + '\n',
      );
      writer.addResult(SCENARIO_NAME, {
        passed: false,
        duration: 100,
        error: 'Not all nodes reached ACTIVE state within 120000ms',
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: 'topology',
              dominantReason: STALE_DOMINANT_REASON,
              reasonCounts: {
                [STALE_DOMINANT_REASON]: SINGLE_COUNT,
                priority_recovery_progress_class: SINGLE_COUNT,
              },
            },
            activeGate: {
              mode: STARTUP_READINESS_MODE,
              state: ACTIVE_GATE_STATE_TIMED_OUT,
              ready: false,
              attempts: TERMINAL_ATTEMPT_COUNT,
              elapsedMs: TERMINAL_ELAPSED_MS,
              attemptsSinceProgress: 5,
              coordinatorCyclesSinceProgress: 5,
              reasonCode: TERMINAL_REASON_STALLED,
              progress: {
                expectedNodeCount: EXPECTED_NODE_COUNT,
                activeNodeCount: ACTIVE_NODE_COUNT,
                inactiveNodeCount: SINGLE_COUNT,
                snapshotCoverageNodeCount: EXPECTED_NODE_COUNT,
                snapshotCoverageComplete: true,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                publicationEpoch: 4,
                recoveryProtocolState: RECOVERY_PROTOCOL_STATE_STEADY,
                pendingAckCount: EMPTY_COUNT,
                missingPublishedCount: EMPTY_COUNT,
                gateReasonCount: EMPTY_COUNT,
                gateReasons: [],
                prioritySpreadSatisfied: true,
                prioritySpreadGap: EMPTY_COUNT,
                priorityBlockedPartitionCount: EMPTY_COUNT,
                priorityRecoveryProgressClasses: {
                  unresolvedClassIds: [],
                  unresolvedClassCount: EMPTY_COUNT,
                  unresolvedSemanticStateIds: [],
                  unresolvedSemanticStateCount: EMPTY_COUNT,
                  blockedPartitionIds: [],
                  blockedPartitionCount: EMPTY_COUNT,
                },
                priorityRecoveryUnresolvedClassCount: EMPTY_COUNT,
                priorityRecoveryUnresolvedSemanticStateCount: EMPTY_COUNT,
                priorityRecoveryBlockedPartitionCount: EMPTY_COUNT,
                readinessDelay: {
                  timedOut: false,
                  cause: 'none',
                  source: null,
                  recoverability: null,
                  error: null,
                },
                blockers: [ACTIVE_GATE_BLOCKER],
                blockerSignature: ACTIVE_GATE_BLOCKER,
              },
              blockerHistory: [{
                blockers: [ACTIVE_GATE_BLOCKER],
                signature: ACTIVE_GATE_BLOCKER,
                count: TERMINAL_ATTEMPT_COUNT,
                firstAttempt: SINGLE_COUNT,
                lastAttempt: TERMINAL_ATTEMPT_COUNT,
              }],
              admissionState: {
                strong_active: ACTIVE_NODE_COUNT,
                blocked: SINGLE_COUNT,
              },
              readinessFailure: {
                mode: STARTUP_READINESS_MODE,
                classCode: READINESS_CLASS_NO_PROGRESS,
                progressSignal: {
                  attemptsSinceProgress: 5,
                  stalled: false,
                },
                terminalReason: TERMINAL_REASON_STALLED,
                cause: 'none',
              },
            },
            priorityRecoveryInvariants: {
              failingInvariantIds: [],
              passed: true,
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
        FAILURE_CLASS_TOPOLOGY_UNSTABLE,
      );
      assert.notEqual(
        failureClassification.failureClass,
        PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK,
      );
      assert.equal(failureClassification.dominantReason, ACTIVE_GATE_BLOCKER);
      assert.equal(
        scenarioBundle.publicationConvergence.publicationStatus,
        PUBLICATION_STATUS_PUBLISHED,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.recoveryProtocolState,
        RECOVERY_PROTOCOL_STATE_STEADY,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.prioritySpreadPending,
        false,
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryProgressClassCount,
        EMPTY_COUNT,
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryBlockedPartitionCount,
        EMPTY_COUNT,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.activeGate.state,
        ACTIVE_GATE_STATE_TIMED_OUT,
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence.activeGateProgress.blockers,
        [ACTIVE_GATE_BLOCKER],
      );
      assert.equal(
        scenarioBundle.publicationConvergence.activeGate.readinessFailure
          .classCode,
        READINESS_CLASS_NO_PROGRESS,
      );
    },
  );

  it(
    'replays playback snapshot priority-recovery evidence when a stale observation collapses active replace work to needs-operation',
    async () => {
      refreshState();
      const priorityRecoveryReportPath = join(
        tempDir,
        'priority-recovery-report-with-playback-replay-cutover.json',
      );
      const scenarioName = 'node-join-under-load';
      const scenarioDir = join(tempDir, scenarioName);
      const playbackTimestampMs = 5000;
      const staleObservationTimestampMs = 4900;
      const replayPartitionId = 'replica_operations-p1';
      const replayOperationId = 'op-replay-active-replace';
      const replaySourceNodeId = 'seed-1';
      const replayTargetNodeId = 'joiner-1';
      const replayReplicaId = 'replica_operations-p1-r4';
      await mkdir(scenarioDir, {recursive: true});
      await writeFile(
        join(scenarioDir, 'snapshots.ndjson'),
        JSON.stringify({
          timestamp: playbackTimestampMs,
          replicaOperations: [{
            operation_id: replayOperationId,
            partition_id: replayPartitionId,
            entity_type: 'partition',
            operation_type: 'REPLACE',
            status: 'active',
            workflow_step: 'ACTIVE',
            source_node_id: replaySourceNodeId,
            target_node_id: replayTargetNodeId,
            replica_id: replayReplicaId,
            created_at: 4000,
            updated_at: 4500,
          }],
          services: [{
            partition_id: replayPartitionId,
            node_id: replayTargetNodeId,
            replica_id: replayReplicaId,
            status: 'active',
            raft_role: 'follower',
          }],
        }) + '\n',
      );

      const writer = new ReportWriter(priorityRecoveryReportPath);
      writer.addResult(scenarioName, {
        passed: false,
        duration: 100,
        error: 'convergence timeout',
        details: {
          diagnostics: {
            controlPlaneDiagnostics: {
              priorityRecoveryObservation: {
                publicationEpoch: 31,
                publicationStatus: 'PUBLISHED',
                recoveryProtocolState: 'priority_spread_pending',
                priorityRecoveryReasonCodes: [
                  'priority_partitions_not_spread',
                ],
                pendingAckNodeIds: [],
                pendingAckCount: 0,
                publicationConvergenceGateReasons: [
                  'priority_partitions_not_spread',
                ],
                priorityPartitionSummary: {
                  satisfied: false,
                  requiredDistinctNodeCount: 3,
                  readyEligibleNodeCount: 2,
                  totalPriorityPartitionCount: 1,
                  blockedPartitionCount: 1,
                  largestSpreadGap: 1,
                  totalSpreadGap: 1,
                  missingPartitionIds: [replayPartitionId],
                  blockedPartitions: [{
                    partitionId: replayPartitionId,
                    spreadGap: 1,
                  }],
                },
                priorityRecoveryBlockedPartitionIds: [replayPartitionId],
                priorityRecoveryBlockedPartitionCount: 1,
                priorityRecoveryUnresolvedPartitionIds: [replayPartitionId],
                priorityRecoveryUnresolvedPartitionCount: 1,
                priorityRecoveryProgressClassIds: [
                  'eligible_but_no_operation_created',
                ],
                priorityRecoveryProgressClassCount: 1,
                priorityRecoverySemanticStateIds: ['needs_operation'],
                priorityRecoverySemanticStateCount: 1,
                priorityRecoveryPartitionWitnesses: [{
                  partitionId: replayPartitionId,
                  operationIds: [],
                  semanticStateId: 'needs_operation',
                  blockerReasonCodes: [
                    'eligible_but_no_operation_created',
                  ],
                  workflowState: 'none',
                  visibilityState: 'none',
                  currentOwner: 'rebalancer_leader',
                  nextRequiredAction: 'create_recovery_operation',
                  blockingBoundary: 'operation_scheduling',
                  waitMode: 'event_driven',
                  completionState: 'blocked',
                }],
              },
              priorityRecoveryDecisionSnapshots: {
                schemaVersion: 1,
                capturedAt: staleObservationTimestampMs,
                publicationEpoch: 31,
                snapshots: [{
                  partitionId: replayPartitionId,
                  semanticState: 'needs_operation',
                  blockerReasons: [
                    'eligible_but_no_operation_created',
                  ],
                  planner: {
                    ready: false,
                    spreadGap: 1,
                  },
                  completion: {
                    state: 'blocked',
                    blocked: true,
                  },
                  observation: {
                    workflowState: 'none',
                    visibilityState: 'none',
                    convergenceState: 'spread_gap',
                    provenance: {
                      capturedAt: staleObservationTimestampMs,
                    },
                  },
                  coordinator: {
                    operationCount: 0,
                    operationIds: [],
                  },
                }],
              },
              publicationConvergence: {
                publicationEpoch: 31,
                publicationStatus: 'PUBLISHED',
                pendingAckNodeIds: [],
                publishedActiveNodeIds: [
                  replaySourceNodeId,
                  replayTargetNodeId,
                ],
                recoveryProtocolState: 'priority_spread_pending',
                priorityRecoveryReasonCodes: [
                  'priority_partitions_not_spread',
                ],
                priorityPartitionSummary: {
                  satisfied: false,
                  requiredDistinctNodeCount: 3,
                  readyEligibleNodeCount: 2,
                  totalPriorityPartitionCount: 1,
                  blockedPartitions: [{
                    partitionId: replayPartitionId,
                    spreadGap: 1,
                  }],
                },
              },
              publicationConvergenceGate: {
                publicationEpoch: 31,
                publicationStatus: 'PUBLISHED',
                pendingAckNodeIds: [],
                reasonCodes: ['priority_partitions_not_spread'],
                priorityPartitionSummary: {
                  satisfied: false,
                  blockedPartitions: [{
                    partitionId: replayPartitionId,
                    spreadGap: 1,
                  }],
                },
              },
            },
          },
        },
      });
      await writer.write();
      const report = JSON.parse(
        await readFile(priorityRecoveryReportPath, UTF8_ENCODING),
      );

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: report.scenarios,
        reportOutputPath: priorityRecoveryReportPath,
        outputDir: tempDir,
        reportSummary: report.summary,
        standardSummary: report.standardSummary,
        benchmarkRegressionGate: report.benchmarkRegressionGate,
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

      assert.deepEqual(
        scenarioBundle.controlPlane.priorityRecoveryDecisionSnapshots
          .snapshots[0].coordinator.operationIds,
        [replayOperationId],
      );
      assert.equal(
        scenarioBundle.controlPlane.priorityRecoveryDecisionSnapshots
          .snapshotCount,
        1,
      );
      assert.deepEqual(
        scenarioBundle.controlPlane.priorityRecoveryDecisionSnapshots
          .partitionIdsBySemanticState.needs_operation,
        [],
      );
      assert.equal(
        scenarioBundle.controlPlane.priorityRecoveryDecisionSnapshots
          .snapshots[0].semanticState,
        'spread_satisfied_in_flight',
      );
      assert.equal(
        scenarioBundle.controlPlane.priorityRecoveryDecisionSnapshots
          .snapshots[0].observation.workflowState,
        'remove_phase',
      );
      assert.equal(
        scenarioBundle.controlPlane.priorityRecoveryDecisionSnapshots
          .snapshots[0].completion.state,
        'spread_satisfied_in_flight',
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryPartitionWitnesses[0]?.partitionId,
        replayPartitionId,
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryPartitionWitnesses[0]?.semanticStateId,
        'spread_satisfied_in_flight',
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence
          .priorityRecoveryUnresolvedPartitionIds,
        [],
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence
          .priorityRecoveryProgressClassIds,
        [],
      );
      assert.equal(
        triageSummary.publicationConvergence
          .priorityRecoveryUnresolvedPartitionCount,
        0,
      );
      assert.equal(
        scenarioBundle.summary.dominantReason,
        null,
      );
    },
  );

  it(
    'does not classify spread-satisfied witness summaries as blocked priority-recovery progress',
    async () => {
      refreshState();
      const NON_BLOCKING_WITNESS_REPORT_PATH = join(
        tempDir,
        'priority-recovery-non-blocking-witness-report.json',
      );
      const NON_BLOCKING_PARTITION_ID = 'control_plane_publications-p1';
      const NON_BLOCKING_OPERATION_ID = 'op-spread-satisfied-active';
      const writer = new ReportWriter(NON_BLOCKING_WITNESS_REPORT_PATH);
      writer.addResult('node-join-under-load', {
        passed: false,
        duration: 100,
        error: 'convergence timeout',
        details: {
          diagnostics: {
            controlPlaneDiagnostics: {
              priorityRecoveryObservation: {
                publicationEpoch: 32,
                publicationStatus: 'PUBLISHED',
                recoveryProtocolState: 'steady_published',
                priorityRecoveryReasonCodes: [],
                priorityPartitionSummary: {
                  satisfied: true,
                  requiredDistinctNodeCount: 3,
                  readyEligibleNodeCount: 3,
                  totalPriorityPartitionCount: 1,
                  blockedPartitionCount: 0,
                  largestSpreadGap: 0,
                  totalSpreadGap: 0,
                  missingPartitionIds: [],
                  blockedPartitions: [],
                },
                priorityRecoveryBlockedPartitionIds: [],
                priorityRecoveryBlockedPartitionCount: 0,
                priorityRecoveryUnresolvedPartitionIds: [],
                priorityRecoveryUnresolvedPartitionCount: 0,
                priorityRecoveryProgressClassIds: [],
                priorityRecoveryProgressClassCount: 0,
                priorityRecoverySemanticStateIds: [],
                priorityRecoverySemanticStateCount: 0,
                priorityRecoveryPartitionWitnesses: [{
                  partitionId: NON_BLOCKING_PARTITION_ID,
                  semanticStateId: 'spread_satisfied_in_flight',
                  completionState: 'converged',
                  workflowState: 'remove_phase',
                  visibilityState: 'cache_visible',
                  operationIds: [NON_BLOCKING_OPERATION_ID],
                }],
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(NON_BLOCKING_WITNESS_REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: NON_BLOCKING_WITNESS_REPORT_PATH,
        outputDir: tempDir,
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

      assert.equal(
        scenarioBundle.summary.dominantReason,
        null,
      );
      assert.equal(
        triageSummary.summary.dominantReason,
        null,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.priorityRecoveryProgressSummary
          .partitionCount,
        1,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.priorityRecoveryProgressSummary
          .dominantWitness.partitionId,
        NON_BLOCKING_PARTITION_ID,
      );
    },
  );

  it(
    'classifies stalled priority recovery after publication closure separately from publication convergence',
    async () => {
      refreshState();
      const PRIORITY_RECOVERY_STALLED_REPORT_PATH = join(
        tempDir,
        'priority-recovery-operation-stalled-report.json',
      );
      const PRIORITY_RECOVERY_PARTITION_ID = 'replica_operations-p1';
      const PRIORITY_RECOVERY_OPERATION_ID = 'op-priority-stalled';
      const PRIORITY_RECOVERY_PROGRESS_CLASS_ID =
        'operation_created_but_no_step_transitions';
      const PRIORITY_RECOVERY_SEMANTIC_STATE_ID = 'operation_stalled';
      const PRIORITY_RECOVERY_REASON_CODE =
        'priority_partitions_not_spread';
      const PRIORITY_RECOVERY_WORKFLOW_STATE = 'remove_phase';
      const PRIORITY_RECOVERY_COMPLETION_STATE = 'converged';
      const LOAD_ROOT_CAUSE_CLASS = 'load';
      const LOAD_DOMINANT_REASON = 'nodeAdmissionBlocked';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_STATE_STEADY = 'steady_published';
      const CONVERGENCE_TIMEOUT_ERROR = 'convergence timeout';
      const CLOSURE_WITNESS_STATE_PENDING = 'closure_pending';
      const SCENARIO_NAME = 'node-join-under-load';
      const PUBLICATION_EPOCH = 6;
      const SNAPSHOT_SCHEMA_VERSION = 1;
      const SCENARIO_DURATION_MS = 100;
      const EMPTY_COUNT = 0;
      const READY_NODE_COUNT = 3;
      const PRIORITY_RECOVERY_STALLED_COUNT = 1;
      const FAILURE_ACTION_MATCH = /Priority recovery progress is stalled/;
      const OPERATOR_RECOMMENDATION_MATCH = /operation workflow owner/;
      const PRIORITY_RECOVERY_SEMANTIC_STATE_SIGNAL =
        'priorityRecoverySemanticState=' +
        PRIORITY_RECOVERY_SEMANTIC_STATE_ID;
      const PRIORITY_RECOVERY_PROGRESS_CLASS_SIGNAL =
        'priorityRecoveryProgressClass=' +
        PRIORITY_RECOVERY_PROGRESS_CLASS_ID;
      const PRIORITY_RECOVERY_PARTITION_SIGNAL =
        'priorityRecoveryPartition=' + PRIORITY_RECOVERY_PARTITION_ID;
      const writer = new ReportWriter(PRIORITY_RECOVERY_STALLED_REPORT_PATH);
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
                [LOAD_DOMINANT_REASON]: PRIORITY_RECOVERY_STALLED_COUNT,
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
                recoveryProtocolState: RECOVERY_PROTOCOL_STATE_STEADY,
                priorityRecoveryReasonCodes: [
                  PRIORITY_RECOVERY_REASON_CODE,
                ],
                priorityPartitionSummary: {
                  satisfied: true,
                  requiredDistinctNodeCount: READY_NODE_COUNT,
                  readyEligibleNodeCount: READY_NODE_COUNT,
                  totalPriorityPartitionCount:
                    PRIORITY_RECOVERY_STALLED_COUNT,
                  blockedPartitionCount: EMPTY_COUNT,
                  largestSpreadGap: EMPTY_COUNT,
                  totalSpreadGap: EMPTY_COUNT,
                  missingPartitionIds: [],
                  blockedPartitions: [],
                },
                priorityRecoveryProgressClassIds: [
                  PRIORITY_RECOVERY_PROGRESS_CLASS_ID,
                ],
                priorityRecoveryProgressClassCount:
                  PRIORITY_RECOVERY_STALLED_COUNT,
                priorityRecoverySemanticStateIds: [
                  PRIORITY_RECOVERY_SEMANTIC_STATE_ID,
                ],
                priorityRecoverySemanticStateCount:
                  PRIORITY_RECOVERY_STALLED_COUNT,
                priorityRecoveryBlockedPartitionIds: [
                  PRIORITY_RECOVERY_PARTITION_ID,
                ],
                priorityRecoveryBlockedPartitionCount:
                  PRIORITY_RECOVERY_STALLED_COUNT,
                priorityRecoveryUnresolvedPartitionIds: [
                  PRIORITY_RECOVERY_PARTITION_ID,
                ],
                priorityRecoveryUnresolvedPartitionCount:
                  PRIORITY_RECOVERY_STALLED_COUNT,
                priorityRecoveryPartitionWitnesses: [{
                  partitionId: PRIORITY_RECOVERY_PARTITION_ID,
                  semanticStateId: PRIORITY_RECOVERY_SEMANTIC_STATE_ID,
                  completionState: PRIORITY_RECOVERY_COMPLETION_STATE,
                  workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE,
                  operationIds: [PRIORITY_RECOVERY_OPERATION_ID],
                }],
              },
              priorityRecoveryDecisionSnapshots: {
                schemaVersion: SNAPSHOT_SCHEMA_VERSION,
                publicationEpoch: PUBLICATION_EPOCH,
                closureWitness: {
                  publicationEpoch: PUBLICATION_EPOCH,
                  state: CLOSURE_WITNESS_STATE_PENDING,
                  prioritySpreadPending: true,
                  summarySpreadPending: false,
                  blockedPartitionIds: [PRIORITY_RECOVERY_PARTITION_ID],
                  unresolvedSemanticStateIds: [
                    PRIORITY_RECOVERY_SEMANTIC_STATE_ID,
                  ],
                },
                partitionIdsBySemanticState: {
                  [PRIORITY_RECOVERY_SEMANTIC_STATE_ID]: [
                    PRIORITY_RECOVERY_PARTITION_ID,
                  ],
                },
                snapshots: [{
                  partitionId: PRIORITY_RECOVERY_PARTITION_ID,
                  semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_ID,
                  blockerReasons: [PRIORITY_RECOVERY_PROGRESS_CLASS_ID],
                  operationIds: [PRIORITY_RECOVERY_OPERATION_ID],
                }],
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(PRIORITY_RECOVERY_STALLED_REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: PRIORITY_RECOVERY_STALLED_REPORT_PATH,
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
      assert.equal(
        failureClassification.rootCauseClass,
        LOAD_ROOT_CAUSE_CLASS,
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_SEMANTIC_STATE_SIGNAL,
        ),
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
      assert.match(
        scenarioBundle.summary.failureAction,
        FAILURE_ACTION_MATCH,
      );
      assert.match(
        scenarioBundle.summary.operatorRecommendation,
        OPERATOR_RECOMMENDATION_MATCH,
      );
    },
  );
}
