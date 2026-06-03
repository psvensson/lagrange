export function registerFailureBundleCore09Tests(context) {
  const {
    it,
    ACTIVE_GATE_CANONICAL_MISSING_DURING_COVERAGE_TEST_NAME,
    ACTIVE_GATE_SELECTED_COVERAGE_CLEARS_STALE_MISSING_TEST_NAME,
    assert,
    buildPublicationConvergenceSummary,
    CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
    CONTROL_PLANE_QUIESCENCE_CANDIDATE_WINDOW_RESET_REASON,
    CONTROL_PLANE_QUIESCENCE_REASON,
    CONTROL_PLANE_QUIESCENCE_STATE,
    CONTROL_PLANE_READINESS_REASON,
    FAILURE_CLASS_DISCOVERY_UNAVAILABLE,
    FAILURE_CLASS_TOPOLOGY_UNSTABLE,
    hasPublicationMissingActiveNodeBlocker,
    join,
    PRIORITY_RECOVERY_ACTUATION_STATE,
    readFile,
    ReportWriter,
    resolve,
    selectDominantPriorityRecoveryPartitionWitness,
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
    'preserves priority-recovery closure witnesses through normalized decision snapshot merges',
    async () => {
      refreshState();
      const CLOSURE_EVIDENCE_REPORT_PATH = join(
        tempDir,
        'priority-recovery-closure-evidence-report.json',
      );
      const CLOSURE_EVIDENCE_PARTITION_ID = 'control_plane_publications-p1';
      const CLOSURE_EVIDENCE_RECORD_ID = 'CL-003';
      const CLOSURE_EVIDENCE_WITNESS_CLASS =
        'publication_converged_priority_spread_pending';
      const writer = new ReportWriter(CLOSURE_EVIDENCE_REPORT_PATH);
      writer.addResult('node-join-under-load', {
        passed: false,
        duration: 100,
        error: 'convergence timeout',
        details: {
          diagnostics: {
            controlPlaneDiagnostics: {
              publicationConvergence: {
                publicationEpoch: 24,
                publicationStatus: 'PUBLISHED',
                publishedActiveNodeIds: ['seed-1', 'joiner-1', 'joiner-2'],
                pendingAckNodeIds: [],
                priorityPartitionSummary: {
                  satisfied: false,
                  requiredDistinctNodeCount: 3,
                  readyEligibleNodeCount: 3,
                  totalPriorityPartitionCount: 5,
                  missingPartitionIds: [CLOSURE_EVIDENCE_PARTITION_ID],
                  blockedPartitions: [{
                    partitionId: CLOSURE_EVIDENCE_PARTITION_ID,
                    spreadGap: 1,
                    requiredDistinctNodeCount: 3,
                    readyDistinctNodeCount: 2,
                  }],
                  blockedPartitionCount: 1,
                  largestSpreadGap: 1,
                  totalSpreadGap: 1,
                },
              },
              priorityRecoveryDecisionSnapshots: {
                capturedAt: 3000,
                publicationEpoch: 24,
                priorityPartitionSummary: {
                  satisfied: false,
                  requiredDistinctNodeCount: 3,
                  readyEligibleNodeCount: 3,
                  totalPriorityPartitionCount: 5,
                  missingPartitionIds: [CLOSURE_EVIDENCE_PARTITION_ID],
                  blockedPartitions: [{
                    partitionId: CLOSURE_EVIDENCE_PARTITION_ID,
                    spreadGap: 1,
                    requiredDistinctNodeCount: 3,
                    readyDistinctNodeCount: 2,
                  }],
                  blockedPartitionCount: 1,
                  largestSpreadGap: 1,
                  totalSpreadGap: 1,
                },
                snapshots: [{
                  partitionId: CLOSURE_EVIDENCE_PARTITION_ID,
                  semanticState: 'spread_satisfied_in_flight',
                  blockerReasons: [],
                  planner: {
                    spreadGap: 1,
                    ready: false,
                  },
                  spreadCompletion: {
                    satisfied: true,
                  },
                  publication: {
                    concreteEligibleNodeIds: [
                      'seed-1',
                      'joiner-1',
                      'joiner-2',
                    ],
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
          await readFile(CLOSURE_EVIDENCE_REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: CLOSURE_EVIDENCE_REPORT_PATH,
        outputDir: tempDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );

      assert.equal(
        scenarioBundle.controlPlane.priorityRecoveryDecisionSnapshots
          .priorityPartitionSummary.blockedPartitionCount,
        1,
      );
      assert.equal(
        scenarioBundle.controlPlane.priorityRecoveryDecisionSnapshots
          .closureWitness.state,
        'closure_satisfied_stale_publication',
      );
      assert.equal(
        scenarioBundle.controlPlane.priorityRecoveryDecisionSnapshots
          .closureWitness.closureRecordId,
        CLOSURE_EVIDENCE_RECORD_ID,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.closureRecordId,
        CLOSURE_EVIDENCE_RECORD_ID,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.closureWitnessClass,
        CLOSURE_EVIDENCE_WITNESS_CLASS,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.prioritySpreadPending,
        false,
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence.priorityRecoveryReasonCodes,
        [],
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence.publicationConvergenceGateReasons,
        [],
      );
      assert.equal(
        scenarioBundle.publicationConvergence.priorityPartitionSummary.satisfied,
        true,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.priorityPartitionSummary
          .blockedPartitionCount,
        0,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.priorityRecoveryBlockedPartitionCount,
        0,
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryUnresolvedPartitionCount,
        0,
      );
    },
  );

  it(
    'preserves operation owner observation on priority recovery partition witnesses',
    async () => {
      refreshState();
      const OWNER_OBSERVATION_REPORT_PATH = join(
        tempDir,
        'priority-recovery-owner-observation-report.json',
      );
      const OWNER_OBSERVATION_PARTITION_ID = 'sql_write_operations-p1';
      const OWNER_OBSERVATION_OPERATION_ID = 'owner-observation-op';
      const OWNER_OBSERVATION_OWNER = 'operation_workflow_owner';
      const OWNER_OBSERVATION_BOUNDARY = 'workflow_progress';
      const OWNER_OBSERVATION_PHASE = 'dispatch_pending';
      const OWNER_OBSERVATION_CONTRACT_STATE = 'pending';
      const OWNER_OBSERVATION_EFFECT_COMMAND =
        'advance_existing_operation_command';
      const OWNER_OBSERVATION_EFFECT_EXECUTION = 'not_executed';
      const OWNER_OBSERVATION_REQUESTED_ACTION =
        'advance_existing_operation';
      const writer = new ReportWriter(OWNER_OBSERVATION_REPORT_PATH);
      writer.addResult('rolling-restart', {
        passed: false,
        duration: 100,
        error: 'startup active gate timeout',
        details: {
          diagnostics: {
            controlPlaneDiagnostics: {
              priorityRecoveryDecisionSnapshots: {
                capturedAt: 3000,
                publicationEpoch: 24,
                snapshots: [{
                  partitionId: OWNER_OBSERVATION_PARTITION_ID,
                  operationId: OWNER_OBSERVATION_OPERATION_ID,
                  semanticState: 'recovering_in_flight',
                  blockerReasons: [],
                  progress: {
                    currentOwner: OWNER_OBSERVATION_OWNER,
                    blockingBoundary: OWNER_OBSERVATION_BOUNDARY,
                    workflowProgressPhaseId: OWNER_OBSERVATION_PHASE,
                    progressContract: {
                      state: OWNER_OBSERVATION_CONTRACT_STATE,
                    },
                  },
                  operationOwnerObservation: {
                    currentOwner: OWNER_OBSERVATION_OWNER,
                    blockingBoundary: OWNER_OBSERVATION_BOUNDARY,
                    workflowProgressPhaseId: OWNER_OBSERVATION_PHASE,
                    progressContractState:
                      OWNER_OBSERVATION_CONTRACT_STATE,
                    effectCommand: OWNER_OBSERVATION_EFFECT_COMMAND,
                    effectExecution: OWNER_OBSERVATION_EFFECT_EXECUTION,
                    requestedOwnerAction:
                      OWNER_OBSERVATION_REQUESTED_ACTION,
                  },
                  progressContract: {
                    state: OWNER_OBSERVATION_CONTRACT_STATE,
                    currentOwner: OWNER_OBSERVATION_OWNER,
                  },
                  progressSummary: {
                    progressContract: {
                      state: OWNER_OBSERVATION_CONTRACT_STATE,
                      currentOwner: OWNER_OBSERVATION_OWNER,
                    },
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
          await readFile(OWNER_OBSERVATION_REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: OWNER_OBSERVATION_REPORT_PATH,
        outputDir: tempDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const normalizedSnapshot =
        scenarioBundle.controlPlane.priorityRecoveryDecisionSnapshots
          .snapshots.find((snapshot) =>
            snapshot.partitionId === OWNER_OBSERVATION_PARTITION_ID,
          );
      const partitionWitness =
        scenarioBundle.publicationConvergence
          .priorityRecoveryPartitionWitnesses.find((witness) =>
            witness.partitionId === OWNER_OBSERVATION_PARTITION_ID,
          );

      assert.equal(
        normalizedSnapshot.operationOwnerObservation.currentOwner,
        OWNER_OBSERVATION_OWNER,
      );
      assert.equal(
        normalizedSnapshot.operationOwnerObservation.blockingBoundary,
        OWNER_OBSERVATION_BOUNDARY,
      );
      assert.equal(
        normalizedSnapshot.operationOwnerObservation
          .workflowProgressPhaseId,
        OWNER_OBSERVATION_PHASE,
      );
      assert.equal(
        normalizedSnapshot.operationOwnerObservation
          .progressContractState,
        OWNER_OBSERVATION_CONTRACT_STATE,
      );
      assert.equal(
        normalizedSnapshot.progressContract.state,
        OWNER_OBSERVATION_CONTRACT_STATE,
      );
      assert.equal(
        normalizedSnapshot.progress.progressContract.state,
        OWNER_OBSERVATION_CONTRACT_STATE,
      );
      assert.equal(
        normalizedSnapshot.progressSummary.progressContract.state,
        OWNER_OBSERVATION_CONTRACT_STATE,
      );
      assert.equal(
        partitionWitness.operationOwnerObservation.effectCommand,
        OWNER_OBSERVATION_EFFECT_COMMAND,
      );
      assert.equal(
        partitionWitness.operationOwnerObservation.effectExecution,
        OWNER_OBSERVATION_EFFECT_EXECUTION,
      );
      assert.equal(
        partitionWitness.operationOwnerObservation.requestedOwnerAction,
        OWNER_OBSERVATION_REQUESTED_ACTION,
      );
    },
  );

  it(
    'preserves pressure-shaped witness details without overriding an active priority-spread gate',
    async () => {
      refreshState();
      const PRESSURE_REPORT_PATH = join(
        tempDir,
        'priority-recovery-pressure-report.json',
      );
      const PRESSURE_DOMINANT_REASON = 'priority_partitions_not_spread';
      const writer = new ReportWriter(PRESSURE_REPORT_PATH);
      writer.addResult('node-join-under-load', {
        passed: false,
        duration: 100,
        error: 'convergence timeout',
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
                priorityRecoveryPartitionWitnesses: [{
                  partitionId: 'sql_write_operations-p1',
                  progressContractState: 'pending',
                  currentOwner: 'rebalancer_leader',
                  actuationState:
                    PRIORITY_RECOVERY_ACTUATION_STATE.TRANSITION_DEFERRED,
                  nextRequiredAction: 'create_recovery_operation',
                  blockingBoundary: 'operation_scheduling',
                  waitMode: 'stalled',
                  pressureState: 'write_backlog',
                  pendingWrites: 36,
                  pendingWriteGrowthCount: 1626,
                  lastProgressAtMs: 1234,
                }],
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(PRESSURE_REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: PRESSURE_REPORT_PATH,
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
        PRESSURE_DOMINANT_REASON,
      );
      assert.equal(
        triageSummary.summary.dominantReason,
        PRESSURE_DOMINANT_REASON,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.priorityRecoveryProgressSummary ?
          scenarioBundle.publicationConvergence.priorityRecoveryProgressSummary :
          null,
        null,
      );
    },
  );

  it(
    'preserves retry-shaped witness details without overriding an active priority-spread gate',
    async () => {
      refreshState();
      const RETRY_REPORT_PATH = join(
        tempDir,
        'priority-recovery-retry-report.json',
      );
      const RETRY_DOMINANT_REASON = 'priority_partitions_not_spread';
      const writer = new ReportWriter(RETRY_REPORT_PATH);
      writer.addResult('node-join-under-load', {
        passed: false,
        duration: 100,
        error: 'convergence timeout',
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
                priorityRecoveryPartitionWitnesses: [{
                  partitionId: 'sql_write_operations-p1',
                  progressContractState: 'pending',
                  currentOwner: 'rebalancer_leader',
                  actuationState:
                    PRIORITY_RECOVERY_ACTUATION_STATE.TRANSITION_DEFERRED,
                  nextRequiredAction: 'create_recovery_operation',
                  blockingBoundary: 'operation_scheduling',
                  waitMode: 'retry_scheduled',
                  retryAfterMs: 2500,
                  lastProgressAtMs: 1234,
                }],
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(RETRY_REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: RETRY_REPORT_PATH,
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
        RETRY_DOMINANT_REASON,
      );
      assert.equal(
        triageSummary.summary.dominantReason,
        RETRY_DOMINANT_REASON,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.priorityRecoveryProgressSummary ?
          scenarioBundle.publicationConvergence.priorityRecoveryProgressSummary :
          null,
        null,
      );
    },
  );

  it(
    'breaks same-rank dominant witness ties with actuation specificity before falling back to timestamps',
    async () => {
      refreshState();
      const selectedWitness = selectDominantPriorityRecoveryPartitionWitness([
        {
          partitionId: 'plain-scheduling',
          progressContractState: 'blocked',
          actuationState: 'action_required',
          blockingBoundary: 'operation_scheduling',
          waitMode: 'stalled',
          lastProgressAtMs: 1234,
        },
        {
          partitionId: 'pressure-shaped-scheduling',
          progressContractState: 'blocked',
          actuationState:
            PRIORITY_RECOVERY_ACTUATION_STATE.TRANSITION_DEFERRED,
          blockingBoundary: 'operation_scheduling',
          waitMode: 'stalled',
          lastProgressAtMs: 1234,
        },
      ]);

      assert.equal(
        selectedWitness?.partitionId,
        'pressure-shaped-scheduling',
      );
    },
  );

  it(
    'classifies control-plane quiescence diagnostics from owner snapshot',
    async () => {
      refreshState();
      const SCENARIO_NAME = 'rolling-restart';
      const ROOT_CAUSE_CLASS_DISCOVERY = 'discovery';
      const CONTROL_PLANE_QUIESCENCE_ERROR =
        'Control plane did not quiesce within 120000ms';
      const SNAPSHOT_TIMEOUT_REASON =
        'snapshot_query_error=Admin API query timed out';
      const CONTROL_PLANE_PRESSURE_REASON =
        'control_plane_pressure=Admin API query timed out';
      const QUIESCENCE_STATE_SIGNAL =
        'quiescenceState=' +
        CONTROL_PLANE_QUIESCENCE_STATE.CONTROL_PLANE_PRESSURE;
      const QUIESCENCE_BLOCKER_SIGNAL =
        'quiescenceBlocker=' +
        CONTROL_PLANE_QUIESCENCE_REASON.CONTROL_PLANE_PRESSURE;
      const QUIESCENCE_REASON_SIGNAL =
        'quiescenceReason=' +
        CONTROL_PLANE_QUIESCENCE_REASON.CONTROL_PLANE_PRESSURE;
      const QUIESCENCE_MARKDOWN_PATTERN =
        /- Quiescence: state=control_plane_pressure/;
      const SCENARIO_DURATION_MS = 100;
      const EMPTY_ELAPSED_MS = 0;
      const IN_FLIGHT_COUNT = 5;
      const SINGLE_REASON_COUNT = 1;
      const scenarios = [{
        scenario: SCENARIO_NAME,
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: CONTROL_PLANE_QUIESCENCE_ERROR,
        details: {
          diagnostics: {
            quiescence: {
              state:
                CONTROL_PLANE_QUIESCENCE_STATE.CONTROL_PLANE_PRESSURE,
              canonicalBlocker:
                CONTROL_PLANE_QUIESCENCE_REASON.CONTROL_PLANE_PRESSURE,
              reasonCodes: [
                CONTROL_PLANE_QUIESCENCE_REASON.CONTROL_PLANE_PRESSURE,
                CONTROL_PLANE_QUIESCENCE_REASON.SNAPSHOT_QUERY_ERROR,
              ],
              reasons: [
                CONTROL_PLANE_PRESSURE_REASON,
                SNAPSHOT_TIMEOUT_REASON,
              ],
              stableElapsedMs: EMPTY_ELAPSED_MS,
              leaderQuietElapsedMs: EMPTY_ELAPSED_MS,
              inFlightCount: IN_FLIGHT_COUNT,
            },
          },
        },
      }];

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios,
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
      const markdown = await readFile(
        resolve(tempDir, scenarioBundles[0].links.markdownPath),
        UTF8_ENCODING,
      );
      const failureClassification =
        scenarioBundle.summary.failureClassification;

      assert.equal(
        scenarioBundle.summary.dominantReason,
        CONTROL_PLANE_QUIESCENCE_REASON.CONTROL_PLANE_PRESSURE,
      );
      assert.equal(
        scenarioBundle.summary.rootCauseClass,
        ROOT_CAUSE_CLASS_DISCOVERY,
      );
      assert.equal(
        failureClassification.failureClass,
        FAILURE_CLASS_DISCOVERY_UNAVAILABLE,
      );
      assert.equal(
        failureClassification.dominantReason,
        CONTROL_PLANE_QUIESCENCE_REASON.CONTROL_PLANE_PRESSURE,
      );
      assert.ok(
        failureClassification.signals.includes(QUIESCENCE_STATE_SIGNAL),
      );
      assert.ok(
        failureClassification.signals.includes(QUIESCENCE_BLOCKER_SIGNAL),
      );
      assert.ok(
        failureClassification.signals.includes(QUIESCENCE_REASON_SIGNAL),
      );
      assert.equal(
        scenarioBundle.diagnostics.failure.quiescence.state,
        CONTROL_PLANE_QUIESCENCE_STATE.CONTROL_PLANE_PRESSURE,
      );
      assert.equal(
        scenarioBundle.topFailures.reasonCounts[
          CONTROL_PLANE_QUIESCENCE_REASON.SNAPSHOT_QUERY_ERROR
        ],
        SINGLE_REASON_COUNT,
      );
      assert.match(markdown, QUIESCENCE_MARKDOWN_PATTERN);
    },
  );

  it(
    'classifies pending quiescence stable window from owner snapshot',
    async () => {
      refreshState();
      const SCENARIO_NAME = 'rolling-restart';
      const ROOT_CAUSE_CLASS_TOPOLOGY = 'topology';
      const CONTROL_PLANE_QUIESCENCE_ERROR =
        'Control plane did not quiesce within 120000ms';
      const QUIESCENCE_STATE_SIGNAL =
        'quiescenceState=' +
        CONTROL_PLANE_QUIESCENCE_STATE.QUIESCENCE_CANDIDATE;
      const QUIESCENCE_CANDIDATE_WINDOW_RESET_SIGNAL =
        'quiescenceCandidateWindowReset=' +
        CONTROL_PLANE_QUIESCENCE_CANDIDATE_WINDOW_RESET_REASON
          .OPERATION_DRAIN_PROGRESSING;
      const SCENARIO_DURATION_MS = 100;
      const EMPTY_ELAPSED_MS = 0;
      const IN_FLIGHT_COUNT = 3;
      const EFFECTIVE_IN_FLIGHT_COUNT = 0;
      const STALE_IN_FLIGHT_COUNT = IN_FLIGHT_COUNT;
      const scenarios = [{
        scenario: SCENARIO_NAME,
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: CONTROL_PLANE_QUIESCENCE_ERROR,
        details: {
          diagnostics: {
            quiescence: {
              state:
                CONTROL_PLANE_QUIESCENCE_STATE.QUIESCENCE_CANDIDATE,
              canonicalBlocker: null,
              reasonCodes: [],
              reasons: [],
              stableElapsedMs: EMPTY_ELAPSED_MS,
              leaderQuietElapsedMs: EMPTY_ELAPSED_MS,
              inFlightCount: IN_FLIGHT_COUNT,
              effectiveInFlightCount: EFFECTIVE_IN_FLIGHT_COUNT,
              staleInFlightCount: STALE_IN_FLIGHT_COUNT,
              candidateWindowReset: {
                reason:
                  CONTROL_PLANE_QUIESCENCE_CANDIDATE_WINDOW_RESET_REASON
                    .OPERATION_DRAIN_PROGRESSING,
                state:
                  CONTROL_PLANE_QUIESCENCE_STATE.OPERATION_DRAIN_PROGRESSING,
                canonicalBlocker:
                  CONTROL_PLANE_QUIESCENCE_REASON
                    .REPLICA_OPERATIONS_IN_FLIGHT,
                reasonCodes: [
                  CONTROL_PLANE_QUIESCENCE_REASON
                    .REPLICA_OPERATIONS_IN_FLIGHT,
                ],
                reasons: [],
                observedAtMs: SCENARIO_DURATION_MS,
              },
            },
          },
        },
      }];

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios,
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

      assert.equal(
        scenarioBundle.summary.dominantReason,
        CONTROL_PLANE_QUIESCENCE_STATE.QUIESCENCE_CANDIDATE,
      );
      assert.equal(
        scenarioBundle.summary.rootCauseClass,
        ROOT_CAUSE_CLASS_TOPOLOGY,
      );
      assert.equal(
        failureClassification.failureClass,
        FAILURE_CLASS_TOPOLOGY_UNSTABLE,
      );
      assert.equal(
        failureClassification.dominantReason,
        CONTROL_PLANE_QUIESCENCE_STATE.QUIESCENCE_CANDIDATE,
      );
      assert.ok(
        failureClassification.signals.includes(QUIESCENCE_STATE_SIGNAL),
      );
      assert.ok(
        failureClassification.signals.includes(
          QUIESCENCE_CANDIDATE_WINDOW_RESET_SIGNAL,
        ),
      );
      assert.equal(
        scenarioBundle.diagnostics.failure.quiescence.effectiveInFlightCount,
        EFFECTIVE_IN_FLIGHT_COUNT,
      );
    },
  );

  it(
    'normalizes active-gate publication debt over stale top-level counts',
    () => {
      refreshState();
      const PUBLICATION_EPOCH = 91;
      const PUBLICATION_STATUS_ACK_PENDING = 'ACK_PENDING';
      const PENDING_ACK_COUNT = 1;
      const MISSING_PUBLISHED_COUNT = 2;
      const MISSING_NODE_ONE = 'missing-node-1';
      const MISSING_NODE_TWO = 'missing-node-2';
      const ZERO_COUNT = 0;
      const controlPlane = {
        publicationConvergence: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_ACK_PENDING,
          pendingAckNodeIds: [],
          pendingAckCount: ZERO_COUNT,
        },
        priorityRecoveryObservation: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_ACK_PENDING,
          pendingAckNodeIds: [],
          pendingAckCount: ZERO_COUNT,
          activeGate: {
            progress: {
              publicationEpoch: PUBLICATION_EPOCH,
              publicationStatus: PUBLICATION_STATUS_ACK_PENDING,
              pendingAckCount: PENDING_ACK_COUNT,
              missingPublishedCount: MISSING_PUBLISHED_COUNT,
              selectedMissingPublishedNodeIds: [
                MISSING_NODE_ONE,
                MISSING_NODE_TWO,
              ],
            },
          },
        },
      };

      const publicationConvergence =
        buildPublicationConvergenceSummary(controlPlane);

      assert.equal(
        publicationConvergence.pendingAckCount,
        PENDING_ACK_COUNT,
      );
      assert.equal(
        publicationConvergence.missingPublishedCount,
        MISSING_PUBLISHED_COUNT,
      );
      assert.deepEqual(
        publicationConvergence.missingPublishedNodeIds,
        [MISSING_NODE_ONE, MISSING_NODE_TWO],
      );
    },
  );

  it(
    ACTIVE_GATE_SELECTED_COVERAGE_CLEARS_STALE_MISSING_TEST_NAME,
    () => {
      refreshState();
      const PUBLICATION_EPOCH = 93;
      const PUBLICATION_STATUS_ACK_PENDING = 'ACK_PENDING';
      const PENDING_ACK_NODE_ID = 'pending-ack-node';
      const STALE_MISSING_NODE_ONE = 'stale-missing-node-1';
      const STALE_MISSING_NODE_TWO = 'stale-missing-node-2';
      const SELECTED_NODE_ONE = 'selected-node-1';
      const SELECTED_NODE_TWO = 'selected-node-2';
      const SELECTED_NODE_THREE = 'selected-node-3';
      const SELECTED_NODE_FOUR = 'selected-node-4';
      const SELECTED_NODE_FIVE = 'selected-node-5';
      const EXPECTED_NODE_COUNT = 5;
      const PENDING_ACK_COUNT = 1;
      const STALE_MISSING_COUNT = 2;
      const ZERO_COUNT = 0;
      const controlPlane = {
        publicationConvergence: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_ACK_PENDING,
          pendingAckNodeIds: [PENDING_ACK_NODE_ID],
          pendingAckCount: PENDING_ACK_COUNT,
          missingPublishedNodeIds: [
            STALE_MISSING_NODE_ONE,
            STALE_MISSING_NODE_TWO,
          ],
          missingPublishedCount: STALE_MISSING_COUNT,
          publicationPending: true,
        },
        priorityRecoveryObservation: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_ACK_PENDING,
          pendingAckNodeIds: [PENDING_ACK_NODE_ID],
          pendingAckCount: PENDING_ACK_COUNT,
          missingPublishedNodeIds: [
            STALE_MISSING_NODE_ONE,
            STALE_MISSING_NODE_TWO,
          ],
          missingPublishedCount: STALE_MISSING_COUNT,
          publicationPending: true,
          activeGate: {
            progress: {
              publicationEpoch: PUBLICATION_EPOCH,
              publicationStatus: PUBLICATION_STATUS_ACK_PENDING,
              expectedNodeCount: EXPECTED_NODE_COUNT,
              selectedPublishedActiveNodeIds: [
                SELECTED_NODE_ONE,
                SELECTED_NODE_TWO,
                SELECTED_NODE_THREE,
                SELECTED_NODE_FOUR,
                SELECTED_NODE_FIVE,
              ],
              selectedPublishedActiveCount: EXPECTED_NODE_COUNT,
              selectedMissingPublishedNodeIds: [],
              pendingAckCount: PENDING_ACK_COUNT,
              missingPublishedCount: STALE_MISSING_COUNT,
              gateReasons: [],
              blockers: [],
            },
          },
        },
      };

      const publicationConvergence =
        buildPublicationConvergenceSummary(controlPlane);

      assert.equal(
        publicationConvergence.pendingAckCount,
        PENDING_ACK_COUNT,
      );
      assert.deepEqual(
        publicationConvergence.pendingAckNodeIds,
        [PENDING_ACK_NODE_ID],
      );
      assert.equal(
        publicationConvergence.missingPublishedCount,
        ZERO_COUNT,
      );
      assert.deepEqual(publicationConvergence.missingPublishedNodeIds, []);
      assert.equal(
        hasPublicationMissingActiveNodeBlocker(publicationConvergence),
        false,
      );
    },
  );

  it(
    ACTIVE_GATE_CANONICAL_MISSING_DURING_COVERAGE_TEST_NAME,
    () => {
      refreshState();
      const PUBLICATION_EPOCH = 98;
      const ACTIVE_GATE_MODE_STARTUP = 'startup';
      const PUBLICATION_STATUS_ACK_PENDING = 'ACK_PENDING';
      const RECOVERY_PROTOCOL_PUBLICATION_PENDING = 'publication_pending';
      const SNAPSHOT_COVERAGE_BLOCKER = 'snapshot_coverage=2/5';
      const PUBLICATION_GATE_REASON =
        CONTROL_PLANE_READINESS_REASON.PUBLICATION_EPOCH_PENDING;
      const PRIORITY_SPREAD_REASON =
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD;
      const PENDING_ACK_NODE_ID = 'pending-ack-node';
      const MISSING_NODE_ONE = 'missing-published-node-1';
      const MISSING_NODE_TWO = 'missing-published-node-2';
      const EXPECTED_NODE_COUNT = 5;
      const ACTIVE_NODE_COUNT = 3;
      const INACTIVE_NODE_COUNT = 2;
      const SNAPSHOT_COVERAGE_NODE_COUNT = 2;
      const PENDING_ACK_COUNT = 1;
      const MISSING_PUBLISHED_COUNT = 2;
      const ZERO_COUNT = 0;
      const controlPlane = {
        publicationConvergence: {
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLICATION_STATUS_ACK_PENDING,
          recoveryProtocolState: RECOVERY_PROTOCOL_PUBLICATION_PENDING,
          pendingAckNodeIds: [PENDING_ACK_NODE_ID],
          pendingAckCount: PENDING_ACK_COUNT,
          missingPublishedNodeIds: [MISSING_NODE_ONE, MISSING_NODE_TWO],
          missingPublishedCount: MISSING_PUBLISHED_COUNT,
          publicationPending: true,
          prioritySpreadPending: true,
          priorityRecoveryReasonCodes: [
            PRIORITY_SPREAD_REASON,
            PUBLICATION_GATE_REASON,
          ],
          publicationRecoveryGate: {
            ready: false,
            publicationEpoch: PUBLICATION_EPOCH,
            publicationStatus: PUBLICATION_STATUS_ACK_PENDING,
            recoveryProtocolState: RECOVERY_PROTOCOL_PUBLICATION_PENDING,
            pendingAckNodeIds: [PENDING_ACK_NODE_ID],
            pendingAckCount: PENDING_ACK_COUNT,
            missingPublishedNodeIds: [MISSING_NODE_ONE, MISSING_NODE_TWO],
            missingPublishedCount: MISSING_PUBLISHED_COUNT,
            publicationPending: true,
            prioritySpreadPending: true,
            reasons: [PRIORITY_SPREAD_REASON, PUBLICATION_GATE_REASON],
            reasonCodes: [PRIORITY_SPREAD_REASON, PUBLICATION_GATE_REASON],
          },
        },
        activeGate: {
          mode: ACTIVE_GATE_MODE_STARTUP,
          ready: false,
          progress: {
            expectedNodeCount: EXPECTED_NODE_COUNT,
            activeNodeCount: ACTIVE_NODE_COUNT,
            inactiveNodeCount: INACTIVE_NODE_COUNT,
            snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_NODE_COUNT,
            snapshotCoverageComplete: false,
            publicationStatus: PUBLICATION_STATUS_ACK_PENDING,
            publicationEpoch: PUBLICATION_EPOCH,
            recoveryProtocolState: RECOVERY_PROTOCOL_PUBLICATION_PENDING,
            selectedMissingPublishedNodeIds: [
              MISSING_NODE_ONE,
              MISSING_NODE_TWO,
            ],
            pendingAckNodeIds: [PENDING_ACK_NODE_ID],
            pendingAckCount: PENDING_ACK_COUNT,
            missingPublishedCount: MISSING_PUBLISHED_COUNT,
            gateReasons: [PUBLICATION_GATE_REASON],
            prioritySpreadSatisfied: false,
            prioritySpreadGap: MISSING_PUBLISHED_COUNT,
            priorityBlockedPartitionCount: ZERO_COUNT,
            blockers: [SNAPSHOT_COVERAGE_BLOCKER],
          },
        },
      };

      const publicationConvergence =
        buildPublicationConvergenceSummary(controlPlane);

      assert.equal(
        publicationConvergence.activeGateSnapshotCoveragePending,
        true,
      );
      assert.equal(
        publicationConvergence.pendingAckCount,
        PENDING_ACK_COUNT,
      );
      assert.deepEqual(
        publicationConvergence.pendingAckNodeIds,
        [PENDING_ACK_NODE_ID],
      );
      assert.equal(
        publicationConvergence.missingPublishedCount,
        MISSING_PUBLISHED_COUNT,
      );
      assert.deepEqual(
        publicationConvergence.missingPublishedNodeIds,
        [MISSING_NODE_ONE, MISSING_NODE_TWO],
      );
      assert.equal(publicationConvergence.publicationPending, true);
      assert.equal(publicationConvergence.prioritySpreadPending, true);
      assert.equal(
        hasPublicationMissingActiveNodeBlocker(publicationConvergence),
        true,
      );
    },
  );
}
