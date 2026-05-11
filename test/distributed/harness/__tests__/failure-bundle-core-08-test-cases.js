export function registerFailureBundleCore08Tests(context) {
  const {
    it,
    assert,
    buildPriorityRecoveryActuationDecisionInput,
    buildPriorityRecoveryDecisionSnapshot,
    buildPriorityRecoveryObservationSnapshot,
    buildPriorityRecoveryPublicationConvergenceFixture,
    FAILURE_CLASS_LOAD_PRESSURE,
    FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
    join,
    PRIORITY_RECOVERY_ACTUATION_BOUNDARY_SIGNAL_PREFIX,
    PRIORITY_RECOVERY_ACTUATION_FAILURE_DURATION_MS,
    PRIORITY_RECOVERY_ACTUATION_FAILURE_ERROR,
    PRIORITY_RECOVERY_ACTUATION_NEXT_ACTION_SIGNAL_PREFIX,
    PRIORITY_RECOVERY_ACTUATION_OWNER_SIGNAL_PREFIX,
    PRIORITY_RECOVERY_ACTUATION_REPORT_FILENAME,
    PRIORITY_RECOVERY_ACTUATION_SCENARIO_NAME,
    PRIORITY_RECOVERY_ACTUATION_STATE,
    PRIORITY_RECOVERY_ACTUATION_WAIT_MODE_SIGNAL_PREFIX,
    PRIORITY_RECOVERY_DECISION_SET_EXPECTED,
    PRIORITY_RECOVERY_DECISION_SNAPSHOT_EXPECTED,
    PRIORITY_RECOVERY_FAILURE_EXPECTED,
    readFile,
    ReportWriter,
    resolve,
    UTF8_ENCODING,
    writeFailureBundlesForReport,
  } = context;
  let tempDir;
  const refreshState = () => {
    tempDir = context.state.tempDir;
  };

  it(
    'preserves publication gate reasons and projection diagnostics across failure-bundle and triage outputs',
    async () => {
      refreshState();
      const priorityRecoveryReportPath = join(
        tempDir,
        'priority-recovery-report-with-gate-reason-codes.json',
      );
      const writer = new ReportWriter(priorityRecoveryReportPath);
      writer.addResult('node-join-under-load', {
        passed: false,
        duration: 100,
        error: 'convergence timeout',
        details: {
          diagnostics: {
            controlPlaneDiagnostics: {
              publicationConvergence: {
                publicationEpoch: 21,
                publicationStatus: 'PUBLISHED',
                recoveryProtocolState: 'priority_spread_pending',
                priorityPartitionSummary: {
                  satisfied: false,
                  requiredDistinctNodeCount: 3,
                  readyEligibleNodeCount: 2,
                  totalPriorityPartitionCount: 1,
                  blockedPartitions: [{
                    partitionId: 'replica_operations-p1',
                    spreadGap: 1,
                  }],
                },
                projectionDiagnostics: {
                  readinessDecisionMode: 'explicit_dimensions',
                  readinessDecisionDimensions: ['control_plane_writable'],
                  recoveryEligibleProjectionEnabled: true,
                  recoveryEligibleIncludedNodeIds: ['joiner-1'],
                  readinessExcludedNodeIds: [],
                  clusterMemberUnhealthyExcludedNodeIds: ['seed-2'],
                },
              },
              publicationConvergenceGate: {
                publicationEpoch: 21,
                publicationStatus: 'PUBLISHED',
                pendingAckNodeIds: [],
                reasonCodes: ['priority_partitions_not_spread'],
                priorityPartitionSummary: {
                  satisfied: false,
                  blockedPartitions: [{
                    partitionId: 'replica_operations-p1',
                    spreadGap: 1,
                  }],
                },
              },
              activeGate: {
                closureRecordId: 'CL-PR-021',
                closureWitnessClass:
                  'publication_converged_priority_spread_pending',
                progress: {
                  closureRecordId: 'CL-PR-021',
                  closureWitnessClass:
                    'publication_converged_priority_spread_pending',
                },
                bestProgress: {
                  closureRecordId: 'CL-PR-021',
                  closureWitnessClass:
                    'publication_converged_priority_spread_pending',
                },
              },
              priorityRecoveryDecisionSnapshots: {
                schemaVersion: 1,
                publicationEpoch: 21,
                snapshots: [{
                  partitionId: 'replica_operations-p1',
                  semanticState: 'operation_stalled',
                  blockerReasons: [
                    'operation_created_but_no_step_transitions',
                  ],
                  planner: {
                    ready: false,
                    spreadGap: 1,
                  },
                  admission: {
                    decisionDimension: 'controlPlaneRecoveryEligible',
                  },
                }],
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
      const scenarioMarkdown = await readFile(
        resolve(tempDir, scenarioBundles[0].links.markdownPath),
        UTF8_ENCODING,
      );
      const triageMarkdown = await readFile(
        resolve(tempDir, scenarioBundles[0].links.triageMarkdownPath),
        UTF8_ENCODING,
      );

      assert.deepEqual(
        scenarioBundle.publicationConvergence.publicationConvergenceGateReasons,
        ['priority_partitions_not_spread'],
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence.pendingAckNodeIds,
        [],
      );
      assert.equal(
        scenarioBundle.publicationConvergence.closureRecordId,
        'CL-PR-021',
      );
      assert.equal(
        scenarioBundle.publicationConvergence.closureWitnessClass,
        'publication_converged_priority_spread_pending',
      );
      assert.equal(
        triageSummary.publicationConvergence.projectionDiagnostics
          .readinessDecisionMode,
        'explicit_dimensions',
      );
      assert.deepEqual(
        triageSummary.publicationConvergence.publicationConvergenceGateReasons,
        ['priority_partitions_not_spread'],
      );
      assert.match(
        scenarioMarkdown,
        /Pending Ack Nodes: none/,
      );
      assert.match(
        scenarioMarkdown,
        /Publication Gate Reasons: priority_partitions_not_spread/,
      );
      assert.match(
        scenarioMarkdown,
        /Closure Witness Class: publication_converged_priority_spread_pending/,
      );
      assert.match(
        scenarioMarkdown,
        /Projection Diagnostics: mode=explicit_dimensions, dimensions=control_plane_writable, recoveryEligibleProjectionEnabled=true, recoveryEligibleIncluded=joiner-1, readinessExcluded=none, clusterMemberUnhealthyExcluded=seed-2/,
      );
      assert.match(
        triageMarkdown,
        /## Publication Convergence/,
      );
      assert.match(
        triageMarkdown,
        /Publication Gate Reasons: priority_partitions_not_spread/,
      );
      assert.match(
        triageMarkdown,
        /Blocked Partitions: replica_operations-p1/,
      );
      assert.match(
        triageMarkdown,
        /Closure Record Id: CL-PR-021/,
      );
    },
  );

  it(
    'does not let non-priority progress witnesses override generic node-admission wait summaries',
    async () => {
      refreshState();
      const PRIORITY_RECOVERY_PROGRESS_REPORT_PATH = join(
        tempDir,
        'priority-recovery-progress-handoff-report.json',
      );
      const PRIORITY_RECOVERY_PARTITION_ID = 'sql_write_operations-p1';
      const LOAD_WAIT_DOMINANT_REASON = 'nodeAdmissionBlocked';
      const PRIORITY_RECOVERY_CURRENT_OWNER = 'rebalancer_leader';
      const PRIORITY_RECOVERY_BLOCKING_BOUNDARY = 'rebalancer_handoff';
      const PRIORITY_RECOVERY_WAIT_MODE = 'stalled';
      const PRIORITY_RECOVERY_NEXT_ACTION = 'schedule_followup_rebalance';
      const PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE = 'target_creation';
      const PRIORITY_RECOVERY_STEP_AGE_MS = 62050;
      const PRIORITY_RECOVERY_STEP_TIMEOUT_MS = 60000;
      const LOAD_WAIT_REASON_NODE_ADMISSION_BLOCKED = 'nodeAdmissionBlocked';
      const writer = new ReportWriter(PRIORITY_RECOVERY_PROGRESS_REPORT_PATH);
      writer.addResult('node-join-under-load', {
        passed: false,
        duration: 100,
        error: 'convergence timeout',
        loadMetrics: {
          total: 100,
          success: 85,
          failed: 0,
          errors: 0,
          waitReasons: {
            [LOAD_WAIT_REASON_NODE_ADMISSION_BLOCKED]: 55,
          },
        },
        details: {
          diagnostics: {
            controlPlaneDiagnostics: {
              priorityRecoveryObservation: {
                publicationEpoch: 23,
                publicationStatus: 'PUBLISHED',
                recoveryProtocolState: 'priority_spread_pending',
                priorityRecoveryReasonCodes: [
                  'priority_partitions_not_spread',
                ],
                priorityRecoveryBlockedPartitionIds: [
                  'control_plane_publications-p1',
                  'sql_transaction_participants-p1',
                  PRIORITY_RECOVERY_PARTITION_ID,
                ],
                priorityRecoveryBlockedPartitionCount: 3,
                priorityRecoveryUnresolvedPartitionIds: [
                  PRIORITY_RECOVERY_PARTITION_ID,
                ],
                priorityRecoveryUnresolvedPartitionCount: 1,
                priorityRecoveryPartitionWitnesses: [{
                  partitionId: PRIORITY_RECOVERY_PARTITION_ID,
                  semanticStateId: 'operation_stalled',
                  progressContractState: 'blocked',
                  currentOwner: PRIORITY_RECOVERY_CURRENT_OWNER,
                  nextRequiredAction: PRIORITY_RECOVERY_NEXT_ACTION,
                  blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
                  waitMode: PRIORITY_RECOVERY_WAIT_MODE,
                  workflowProgressPhaseId:
                    PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE,
                  stepAgeMs: PRIORITY_RECOVERY_STEP_AGE_MS,
                  stepTimeoutMs: PRIORITY_RECOVERY_STEP_TIMEOUT_MS,
                  retryAfterMs: 5000,
                  lastProgressAtMs: 1234,
                  progressEvidenceSourceIds: ['op-55', 'handoff-1'],
                }],
              },
            },
          },
        },
      });
      await writer.write();
      const report = JSON.parse(
        await readFile(PRIORITY_RECOVERY_PROGRESS_REPORT_PATH, UTF8_ENCODING),
      );

      assert.equal(
        report.scenarios[0].priorityRecoveryProgressSummary.dominantWitness
          .blockingBoundary,
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
      );
      assert.equal(
        report.scenarios[0].priorityRecoveryProgressSummary.dominantWitness
          .waitMode,
        PRIORITY_RECOVERY_WAIT_MODE,
      );

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: report.scenarios,
        reportOutputPath: PRIORITY_RECOVERY_PROGRESS_REPORT_PATH,
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
      const triageMarkdown = await readFile(
        resolve(tempDir, scenarioBundles[0].links.triageMarkdownPath),
        UTF8_ENCODING,
      );

      assert.equal(
        scenarioBundle.summary.dominantReason,
        LOAD_WAIT_DOMINANT_REASON,
      );
      assert.equal(
        triageSummary.summary.dominantReason,
        LOAD_WAIT_DOMINANT_REASON,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.priorityRecoveryProgressSummary ?
          scenarioBundle.publicationConvergence.priorityRecoveryProgressSummary :
          null,
        null,
      );
      assert.doesNotMatch(
        triageMarkdown,
        /partition=sql_write_operations-p1/,
      );
    },
  );

  it(
    'adds recovery witness guidance to load-pressure classification when admission is blocked',
    async () => {
      refreshState();
      const LOAD_PRESSURE_REPORT_PATH = join(
        tempDir,
        'load-pressure-recovery-witness-report.json',
      );
      const SCENARIO_NAME = 'node-join-under-load';
      const LOAD_ROOT_CAUSE_CLASS = 'load';
      const LOAD_DOMINANT_REASON = 'nodeAdmissionBlocked';
      const RETRYABLE_PRESSURE_REASON = 'retryableControlPlanePressure';
      const PRIORITY_RECOVERY_PARTITION_ID = 'replica_operations-p1';
      const PRIORITY_RECOVERY_OPERATION_ID = 'op-load-pressure-recovery';
      const PRIORITY_RECOVERY_SEMANTIC_STATE_ID =
        'spread_satisfied_in_flight';
      const PRIORITY_RECOVERY_WORKFLOW_STEP = 'STOPPING';
      const PRIORITY_RECOVERY_STATUS = 'removing';
      const PRIORITY_RECOVERY_WORKFLOW_STATE = 'remove_phase';
      const PRIORITY_RECOVERY_COMPLETION_STATE =
        'spread_satisfied_in_flight';
      const PRIORITY_RECOVERY_VISIBILITY_STATE = 'cache_visible';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_STATE = 'priority_spread_pending';
      const CONVERGENCE_TIMEOUT_ERROR = 'convergence timeout';
      const PUBLICATION_EPOCH = 6;
      const SCENARIO_DURATION_MS = 100;
      const EMPTY_COUNT = 0;
      const READY_NODE_COUNT = 3;
      const PRIORITY_RECOVERY_WITNESS_COUNT = 1;
      const NODE_ADMISSION_BLOCKED_COUNT = 180;
      const RETRYABLE_PRESSURE_COUNT = 38;
      const LOAD_ACTION_MATCH = /Load traffic is admission-blocked/;
      const LOAD_RECOMMENDATION_MATCH = /priority recovery operation/;
      const DOMINANT_REASON_SIGNAL =
        'dominantReason=' + LOAD_DOMINANT_REASON;
      const PRIORITY_RECOVERY_PARTITION_SIGNAL =
        'priorityRecoveryPartition=' + PRIORITY_RECOVERY_PARTITION_ID;
      const PRIORITY_RECOVERY_SEMANTIC_STATE_SIGNAL =
        'priorityRecoverySemanticState=' +
        PRIORITY_RECOVERY_SEMANTIC_STATE_ID;
      const PRIORITY_RECOVERY_LATEST_STEP_SIGNAL =
        'priorityRecoveryLatestStep=' + PRIORITY_RECOVERY_WORKFLOW_STEP;
      const PRIORITY_RECOVERY_LATEST_STATUS_SIGNAL =
        'priorityRecoveryLatestStatus=' + PRIORITY_RECOVERY_STATUS;
      const writer = new ReportWriter(LOAD_PRESSURE_REPORT_PATH);
      writer.addResult(SCENARIO_NAME, {
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: CONVERGENCE_TIMEOUT_ERROR,
        loadMetrics: {
          total: EMPTY_COUNT,
          success: EMPTY_COUNT,
          failed: EMPTY_COUNT,
          errors: EMPTY_COUNT,
          attemptErrors: RETRYABLE_PRESSURE_COUNT,
          waitReasons: {
            [LOAD_DOMINANT_REASON]: NODE_ADMISSION_BLOCKED_COUNT,
            [RETRYABLE_PRESSURE_REASON]: RETRYABLE_PRESSURE_COUNT,
          },
        },
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: LOAD_ROOT_CAUSE_CLASS,
              dominantReason: LOAD_DOMINANT_REASON,
              reasonCounts: {
                [LOAD_DOMINANT_REASON]: NODE_ADMISSION_BLOCKED_COUNT,
                [RETRYABLE_PRESSURE_REASON]: RETRYABLE_PRESSURE_COUNT,
              },
            },
            controlPlaneDiagnostics: {
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
                  totalPriorityPartitionCount:
                    PRIORITY_RECOVERY_WITNESS_COUNT,
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
                priorityRecoveryPartitionWitnesses: [{
                  partitionId: PRIORITY_RECOVERY_PARTITION_ID,
                  semanticStateId: PRIORITY_RECOVERY_SEMANTIC_STATE_ID,
                  completionState: PRIORITY_RECOVERY_COMPLETION_STATE,
                  workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE,
                  visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE,
                  latestOperationWorkflowStep:
                    PRIORITY_RECOVERY_WORKFLOW_STEP,
                  latestOperationStatus: PRIORITY_RECOVERY_STATUS,
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
          await readFile(LOAD_PRESSURE_REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: LOAD_PRESSURE_REPORT_PATH,
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
        FAILURE_CLASS_LOAD_PRESSURE,
      );
      assert.equal(
        failureClassification.dominantReason,
        LOAD_DOMINANT_REASON,
      );
      assert.ok(
        failureClassification.signals.includes(DOMINANT_REASON_SIGNAL),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_PARTITION_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_SEMANTIC_STATE_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_LATEST_STEP_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_LATEST_STATUS_SIGNAL,
        ),
      );
      assert.match(
        scenarioBundle.summary.failureAction,
        LOAD_ACTION_MATCH,
      );
      assert.match(
        scenarioBundle.summary.operatorRecommendation,
        LOAD_RECOMMENDATION_MATCH,
      );
    },
  );

  it(
    'preserves priority-recovery operation ids from normalized decision operation objects',
    async () => {
      refreshState();
      const OPERATION_EVIDENCE_REPORT_PATH = join(
        tempDir,
        'priority-recovery-operation-evidence-report.json',
      );
      const OPERATION_EVIDENCE_PARTITION_ID = 'control_plane_publications-p1';
      const OPERATION_EVIDENCE_OPERATION_ID =
        'op-priority-operation-evidence';
      const OPERATION_EVIDENCE_PROGRESS_NEXT_ACTION = 'wait';
      const OPERATION_EVIDENCE_WORKFLOW_PHASE = 'target_creation';
      const OPERATION_EVIDENCE_STEP_AGE_MS = 500;
      const OPERATION_EVIDENCE_STEP_TIMEOUT_MS = 30000;
      const writer = new ReportWriter(OPERATION_EVIDENCE_REPORT_PATH);
      writer.addResult('node-join-under-load', {
        passed: false,
        duration: 100,
        error: 'convergence timeout',
        details: {
          diagnostics: {
            controlPlaneDiagnostics: {
              priorityRecoveryDecisionSnapshots: {
                capturedAt: 2000,
                publicationEpoch: 23,
                snapshots: [{
                  partitionId: OPERATION_EVIDENCE_PARTITION_ID,
                  semanticState: 'recovering_in_flight',
                  blockerReasons: [
                    'operation_created_but_no_step_transitions',
                  ],
                  planner: {
                    spreadGap: 1,
                  },
                  coordinator: {
                    operationCount: 1,
                    operation: {
                      operationId: OPERATION_EVIDENCE_OPERATION_ID,
                      workflowStep: 'CREATING',
                      status: 'creating',
                      updatedAtMs: 1500,
                    },
                  },
                  conditions: {
                    pressure: {
                      pressureState: 'none',
                    },
                  },
                  actuation: {
                    state:
                      PRIORITY_RECOVERY_ACTUATION_STATE
                        .DISPATCHED_WAITING_PROGRESS,
                    owner: 'operation_workflow_owner',
                  },
                  progress: {
                    contractState: 'pending',
                    nextAction: OPERATION_EVIDENCE_PROGRESS_NEXT_ACTION,
                    currentOwner: 'operation_workflow_owner',
                    nextRequiredAction: 'wait_for_operation_progress',
                    blockingBoundary: 'workflow_progress',
                    waitMode: 'event_driven',
                    workflowProgressPhaseId:
                      OPERATION_EVIDENCE_WORKFLOW_PHASE,
                    stepAgeMs: OPERATION_EVIDENCE_STEP_AGE_MS,
                    stepTimeoutMs: OPERATION_EVIDENCE_STEP_TIMEOUT_MS,
                    lastProgressAtMs: 1500,
                    evidenceSourceIds: ['operation_context'],
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
          await readFile(OPERATION_EVIDENCE_REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: OPERATION_EVIDENCE_REPORT_PATH,
        outputDir: tempDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );

      assert.deepEqual(
        scenarioBundle.publicationConvergence
          .priorityRecoveryPartitionWitnesses[0].operationIds,
        [OPERATION_EVIDENCE_OPERATION_ID],
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence.priorityRecoveryProgressSummary
          .dominantWitness.operationIds,
        [OPERATION_EVIDENCE_OPERATION_ID],
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryPartitionWitnesses[0].progressContractState,
        'pending',
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryPartitionWitnesses[0].progressNextAction,
        OPERATION_EVIDENCE_PROGRESS_NEXT_ACTION,
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryPartitionWitnesses[0].actuationState,
        PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryPartitionWitnesses[0].currentOwner,
        'operation_workflow_owner',
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryPartitionWitnesses[0].nextRequiredAction,
        'wait_for_operation_progress',
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryPartitionWitnesses[0].workflowProgressPhaseId,
        OPERATION_EVIDENCE_WORKFLOW_PHASE,
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryPartitionWitnesses[0].stepAgeMs,
        OPERATION_EVIDENCE_STEP_AGE_MS,
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryProgressSummary.dominantWitness.currentOwner,
        'operation_workflow_owner',
      );
    },
  );

  it(
    'classifies publication-closed priority actuation as workflow progress',
    async () => {
      refreshState();
      const reportPath = join(
        tempDir,
        PRIORITY_RECOVERY_ACTUATION_REPORT_FILENAME,
      );
      const publicationConvergence =
        buildPriorityRecoveryPublicationConvergenceFixture();
      const decisionSnapshot = buildPriorityRecoveryDecisionSnapshot(
        buildPriorityRecoveryActuationDecisionInput(),
      );
      const priorityRecoveryDecisionSnapshots = {
        capturedAt: PRIORITY_RECOVERY_DECISION_SET_EXPECTED.capturedAt,
        publicationEpoch:
          PRIORITY_RECOVERY_DECISION_SET_EXPECTED.publicationEpoch,
        snapshots: [decisionSnapshot],
        priorityPartitionSummary:
          publicationConvergence.priorityPartitionSummary,
        closureWitness: {
          ...PRIORITY_RECOVERY_DECISION_SET_EXPECTED.closureWitness,
        },
      };
      const priorityRecoveryObservation =
        buildPriorityRecoveryObservationSnapshot({
          publicationConvergence,
          priorityRecoveryDecisionSnapshots,
        });
      const writer = new ReportWriter(reportPath);
      writer.addResult(PRIORITY_RECOVERY_ACTUATION_SCENARIO_NAME, {
        passed: false,
        duration: PRIORITY_RECOVERY_ACTUATION_FAILURE_DURATION_MS,
        error: PRIORITY_RECOVERY_ACTUATION_FAILURE_ERROR,
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: PRIORITY_RECOVERY_FAILURE_EXPECTED.rootCauseClass,
              dominantReason: PRIORITY_RECOVERY_FAILURE_EXPECTED.dominantReason,
            },
            controlPlaneDiagnostics: {
              publicationConvergence,
              priorityRecoveryDecisionSnapshots,
              priorityRecoveryObservation,
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(reportPath, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: reportPath,
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
      const priorityRecoveryWitness =
        scenarioBundle.publicationConvergence
          .priorityRecoveryProgressSummary.dominantWitness;

      assert.equal(
        failureClassification.failureClass,
        PRIORITY_RECOVERY_FAILURE_EXPECTED.failureClass,
      );
      assert.notEqual(
        failureClassification.failureClass,
        FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
      );
      assert.equal(
        failureClassification.dominantReason,
        PRIORITY_RECOVERY_FAILURE_EXPECTED.dominantReason,
      );
      assert.equal(
        priorityRecoveryWitness.actuationState,
        PRIORITY_RECOVERY_DECISION_SNAPSHOT_EXPECTED.actuation.state,
      );
      assert.equal(
        priorityRecoveryWitness.currentOwner,
        PRIORITY_RECOVERY_DECISION_SNAPSHOT_EXPECTED.progress.currentOwner,
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_ACTUATION_OWNER_SIGNAL_PREFIX +
            PRIORITY_RECOVERY_DECISION_SNAPSHOT_EXPECTED.progress.currentOwner,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_ACTUATION_BOUNDARY_SIGNAL_PREFIX +
            PRIORITY_RECOVERY_DECISION_SNAPSHOT_EXPECTED.progress
              .blockingBoundary,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_ACTUATION_WAIT_MODE_SIGNAL_PREFIX +
            PRIORITY_RECOVERY_DECISION_SNAPSHOT_EXPECTED.progress.waitMode,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_ACTUATION_NEXT_ACTION_SIGNAL_PREFIX +
            PRIORITY_RECOVERY_DECISION_SNAPSHOT_EXPECTED.progress
              .nextRequiredAction,
        ),
      );
    },
  );
}
