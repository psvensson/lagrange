export function registerFailureBundlePlaybackStartupTests({
  it,
  assert,
  join,
  mkdir,
  writeFile,
  readFile,
  resolve,
  ReportWriter,
  writeFailureBundlesForReport,
  UTF8_ENCODING,
  state,
  buildPlaybackDerivedFailureResult,
  buildPlaybackActiveGateStageEvent,
  buildStartupModeWitnessProgress,
}) {
  it('classifies startup playback active-gate no-progress witness as CL-006 and preserves admission state', async () => {
    const scenarioDir = join(state.outputDir, 'seed-restart-under-load');
    await mkdir(scenarioDir, {recursive: true});
    const activeGateAdmissionState = {
      mode: 'blocked',
      blockedNodeCount: 2,
      blockedNodeIds: ['seed-1', 'joiner-1'],
    };
    await writeFile(
      join(scenarioDir, 'events.ndjson'),
      [
        JSON.stringify(
          buildPlaybackActiveGateStageEvent({
            readinessMode: 'startup',
            activeGateAdmissionState,
            activeGateCurrentProgress: buildStartupModeWitnessProgress({
              snapshotCoverageNodeCount: 2,
              isTimeoutError: false,
            }),
          }),
        ),
      ].join('\n') + '\n',
    );

    const writer = new ReportWriter(state.reportPath);
    writer.addResult(
      'seed-restart-under-load',
      buildPlaybackDerivedFailureResult(),
    );

    const {scenarioBundles, runBundle} = await writeFailureBundlesForReport({
      scenarios: writer.scenarios,
      reportOutputPath: state.reportPath,
      outputDir: state.outputDir,
      reportSummary: {total: 1, fail: 1, pass: 0},
      standardSummary: {scenarios: []},
      benchmarkRegressionGate: {status: 'skipped'},
      workspaceRoot: state.tempDir,
    });
    await writer.write({failureBundle: runBundle});

    assert.equal(scenarioBundles.length, 1);
    const scenarioBundle = JSON.parse(
      await readFile(
        resolve(state.tempDir, scenarioBundles[0].links.jsonPath),
        UTF8_ENCODING,
      ),
    );

    assert.equal(
      scenarioBundle.publicationConvergence.closureRecordId,
      'CL-006',
    );
    assert.equal(
      scenarioBundle.publicationConvergence.closureWitnessClass,
      'startup_active_publication_lag',
    );
    assert.deepEqual(
      scenarioBundle.controlPlane.activeGateAdmissionState,
      activeGateAdmissionState,
    );
    assert.equal(
      scenarioBundle.controlPlane.activeGate.progress
        .selectedSnapshotReachableBy,
      'admin_health',
    );
    assert.equal(
      scenarioBundle.publicationConvergence.activeGate.readinessFailure?.mode,
      undefined,
    );
    assert.equal(
      scenarioBundle.publicationConvergence.activeGate.readinessFailure?.cause,
      undefined,
    );
    assert.equal(scenarioBundle.summary.failureAction, null);
    assert.equal(
      scenarioBundle.summary.stabilityGates.restart_recovery.status,
      'open',
    );
    assert.equal(
      scenarioBundle.summary.stabilityGates.restart_recovery.blockers.includes(
        'startup_readiness_blocked',
      ),
      true,
    );
  });

  it('classifies startup playback active-gate timeout witness with explicit readiness delay metadata', async () => {
    const scenarioDir = join(
      state.outputDir,
      'seed-restart-under-load-timeout',
    );
    await mkdir(scenarioDir, {recursive: true});
    await writeFile(
      join(scenarioDir, 'events.ndjson'),
      [
        JSON.stringify(
          buildPlaybackActiveGateStageEvent({
            readinessMode: 'startup',
            activeGateCurrentProgress: buildStartupModeWitnessProgress({
              snapshotCoverageNodeCount: 0,
              isTimeoutError: true,
            }),
          }),
        ),
      ].join('\n') + '\n',
    );

    const writer = new ReportWriter(state.reportPath);
    writer.addResult(
      'seed-restart-under-load-timeout',
      buildPlaybackDerivedFailureResult(),
    );

    const {scenarioBundles, runBundle} = await writeFailureBundlesForReport({
      scenarios: writer.scenarios,
      reportOutputPath: state.reportPath,
      outputDir: state.outputDir,
      reportSummary: {total: 1, fail: 1, pass: 0},
      standardSummary: {scenarios: []},
      benchmarkRegressionGate: {status: 'skipped'},
      workspaceRoot: state.tempDir,
    });
    await writer.write({failureBundle: runBundle});

    assert.equal(scenarioBundles.length, 1);
    const scenarioBundle = JSON.parse(
      await readFile(
        resolve(state.tempDir, scenarioBundles[0].links.jsonPath),
        UTF8_ENCODING,
      ),
    );

    assert.equal(
      scenarioBundle.publicationConvergence.closureRecordId,
      'CL-004',
    );
    assert.equal(
      scenarioBundle.publicationConvergence.closureWitnessClass,
      'startup_active_snapshot_timeout',
    );
    assert.equal(
      scenarioBundle.publicationConvergence.activeGateReadinessDelay?.timedOut,
      true,
    );
    assert.equal(
      scenarioBundle.publicationConvergence.activeGateReadinessDelay?.cause,
      'snapshot_timeout',
    );
    assert.equal(
      scenarioBundle.publicationConvergence.activeGateReadinessDelay
        ?.recoverability,
      'terminal',
    );
    assert.equal(
      scenarioBundle.summary.failureClassification.signals.includes(
        'activeGateReadinessDelay=timeout',
      ),
      true,
    );
    assert.equal(
      scenarioBundle.summary.failureClassification.signals.includes(
        'activeGateReadinessCause=snapshot_timeout',
      ),
      true,
    );
    assert.equal(
      scenarioBundle.summary.failureClassification.signals.includes(
        'activeGateReadinessRecoverability=terminal',
      ),
      true,
    );

    assert.equal(
      scenarioBundle.summary.readinessFailure?.classCode,
      'snapshot_timeout',
    );
    assert.equal(
      scenarioBundle.summary.readinessFailure?.recoverability,
      'terminal',
    );
    assert.equal(
      scenarioBundle.summary.failureAction,
      'Snapshot/reachability timeout is blocking convergence.',
    );
    assert.equal(
      scenarioBundle.summary.operatorRecommendation,
      'Inspect snapshot query latency, admin readiness, and host/network stability before rerun.',
    );

    const triageSummary = JSON.parse(
      await readFile(
        resolve(state.tempDir, scenarioBundles[0].links.triageJsonPath),
        UTF8_ENCODING,
      ),
    );
    assert.equal(
      triageSummary.summary.readinessFailure?.classCode,
      'snapshot_timeout',
    );
    assert.equal(
      triageSummary.summary.failureAction,
      'Snapshot/reachability timeout is blocking convergence.',
    );
    assert.equal(
      triageSummary.summary.stabilityGates.restart_recovery.status,
      'open',
    );
    assert.equal(
      triageSummary.summary.stabilityGates.restart_recovery.blockers.includes(
        'closure_record',
      ),
      true,
    );

    const reportJson = JSON.parse(
      await readFile(state.reportPath, UTF8_ENCODING),
    );
    assert.equal(
      reportJson.scenarios[0].readinessFailure.classCode,
      'snapshot_timeout',
    );
    assert.equal(
      reportJson.scenarios[0].failureAction,
      'Snapshot/reachability timeout is blocking convergence.',
    );
    assert.equal(
      reportJson.scenarios[0].stabilityGates.restart_recovery.status,
      'open',
    );

    const scenarioMarkdown = await readFile(
      resolve(state.tempDir, scenarioBundles[0].links.markdownPath),
      UTF8_ENCODING,
    );
    assert.match(scenarioMarkdown, /## Stability Gates/);
    assert.match(scenarioMarkdown, /restart_recovery: status=open/);
    assert.match(scenarioMarkdown, /## Readiness Guidance/);
    assert.match(
      scenarioMarkdown,
      /Snapshot\/reachability timeout is blocking convergence/,
    );

    const triageMarkdown = await readFile(
      resolve(state.tempDir, scenarioBundles[0].links.triageMarkdownPath),
      UTF8_ENCODING,
    );
    assert.match(triageMarkdown, /Readiness Failure: class=snapshot_timeout/);
    assert.match(
      triageMarkdown,
      /Operator Recommendation: Inspect snapshot query latency, admin readiness, and host\/network stability before rerun/,
    );
    assert.match(triageMarkdown, /restart_recovery: status=open/);
    assert.match(triageMarkdown, /closure_record/);
  });

  it('classifies zero-coverage startup snapshot errors before inactive-node fallback', async () => {
    const SCENARIO_NAME = 'seed-restart-zero-coverage-snapshot-error';
    const STARTUP_READINESS_MODE = 'startup';
    const EXPECTED_NODE_COUNT = 5;
    const ACTIVE_NODE_COUNT = 4;
    const SNAPSHOT_COVERAGE_NODE_COUNT = 0;
    const MISSING_PUBLISHED_COUNT = 0;
    const STARTUP_SNAPSHOT_TIMEOUT_RECORD_ID = 'CL-004';
    const STARTUP_SNAPSHOT_TIMEOUT_WITNESS_CLASS =
      'startup_active_snapshot_timeout';
    const SNAPSHOT_TIMEOUT_CLASS_CODE = 'snapshot_timeout';
    const SNAPSHOT_TIMEOUT_SIGNAL = 'activeGateReadinessCause=snapshot_timeout';
    const SNAPSHOT_TIMEOUT_ACTION =
      'Snapshot/reachability timeout is blocking convergence.';
    const scenarioDir = join(state.outputDir, SCENARIO_NAME);
    await mkdir(scenarioDir, {recursive: true});
    await writeFile(
      join(scenarioDir, 'events.ndjson'),
      [
        JSON.stringify(
          buildPlaybackActiveGateStageEvent({
            readinessMode: STARTUP_READINESS_MODE,
            activeGateCurrentProgress: buildStartupModeWitnessProgress({
              expectedNodeCount: EXPECTED_NODE_COUNT,
              activeNodeCount: ACTIVE_NODE_COUNT,
              snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_NODE_COUNT,
              isTimeoutError: true,
              missingPublishedCount: MISSING_PUBLISHED_COUNT,
            }),
          }),
        ),
      ].join('\n') + '\n',
    );

    const writer = new ReportWriter(state.reportPath);
    writer.addResult(
      SCENARIO_NAME,
      buildPlaybackDerivedFailureResult(),
    );

    const {scenarioBundles} = await writeFailureBundlesForReport({
      scenarios: writer.scenarios,
      reportOutputPath: state.reportPath,
      outputDir: state.outputDir,
      reportSummary: {total: 1, fail: 1, pass: 0},
      standardSummary: {scenarios: []},
      benchmarkRegressionGate: {status: 'skipped'},
      workspaceRoot: state.tempDir,
    });

    const scenarioBundle = JSON.parse(
      await readFile(
        resolve(state.tempDir, scenarioBundles[0].links.jsonPath),
        UTF8_ENCODING,
      ),
    );

    assert.equal(
      scenarioBundle.publicationConvergence.closureRecordId,
      STARTUP_SNAPSHOT_TIMEOUT_RECORD_ID,
    );
    assert.equal(
      scenarioBundle.publicationConvergence.closureWitnessClass,
      STARTUP_SNAPSHOT_TIMEOUT_WITNESS_CLASS,
    );
    assert.equal(
      scenarioBundle.publicationConvergence.activeGateProgress
        .activeNodeCount,
      ACTIVE_NODE_COUNT,
    );
    assert.equal(
      scenarioBundle.publicationConvergence.activeGateProgress
        .snapshotCoverageNodeCount,
      SNAPSHOT_COVERAGE_NODE_COUNT,
    );
    assert.equal(
      scenarioBundle.summary.readinessFailure?.classCode,
      SNAPSHOT_TIMEOUT_CLASS_CODE,
    );
    assert.equal(
      scenarioBundle.summary.failureClassification.signals.includes(
        SNAPSHOT_TIMEOUT_SIGNAL,
      ),
      true,
    );
    assert.equal(
      scenarioBundle.summary.failureAction,
      SNAPSHOT_TIMEOUT_ACTION,
    );
  });

  it('maps closure-witness-only startup convergence failures to a non-unknown root cause', async () => {
    const CLOSURE_WITNESS_ONLY_PUBLICATION_DEBT_COUNT = 0;
    const scenarioDir = join(
      state.outputDir,
      'seed-restart-under-load-topology',
    );
    await mkdir(scenarioDir, {recursive: true});
    await writeFile(
      join(scenarioDir, 'events.ndjson'),
      [
        JSON.stringify(
          buildPlaybackActiveGateStageEvent({
            readinessMode: 'startup',
            activeGateCurrentProgress: buildStartupModeWitnessProgress({
              snapshotCoverageNodeCount: 0,
              isTimeoutError: true,
              missingPublishedCount: CLOSURE_WITNESS_ONLY_PUBLICATION_DEBT_COUNT,
            }),
          }),
        ),
      ].join('\n') + '\n',
    );

    const writer = new ReportWriter(state.reportPath);
    writer.addResult('seed-restart-under-load-topology', {
      ...buildPlaybackDerivedFailureResult(),
      loadMetrics: null,
    });

    const {scenarioBundles, runBundle} = await writeFailureBundlesForReport({
      scenarios: writer.scenarios,
      reportOutputPath: state.reportPath,
      outputDir: state.outputDir,
      reportSummary: {total: 1, fail: 1, pass: 0},
      standardSummary: {scenarios: []},
      benchmarkRegressionGate: {status: 'skipped'},
      workspaceRoot: state.tempDir,
    });
    await writer.write({failureBundle: runBundle});

    const scenarioBundle = JSON.parse(
      await readFile(
        resolve(state.tempDir, scenarioBundles[0].links.jsonPath),
        UTF8_ENCODING,
      ),
    );
    assert.equal(scenarioBundle.summary.rootCauseClass, 'topology');
    assert.equal(scenarioBundle.diagnostics.failure.rootCauseClass, 'topology');
    assert.equal(
      scenarioBundle.topFailures.topReasons[0].reason,
      'closure_witness_startup_active_snapshot_timeout',
    );

    const triageSummary = JSON.parse(
      await readFile(
        resolve(state.tempDir, scenarioBundles[0].links.triageJsonPath),
        UTF8_ENCODING,
      ),
    );
    assert.equal(triageSummary.summary.rootCauseClass, 'topology');

    const reportJson = JSON.parse(
      await readFile(state.reportPath, UTF8_ENCODING),
    );
    assert.equal(
      reportJson.scenarios[0].details.diagnostics.failure.rootCauseClass,
      'topology',
    );
  });

  it('does not classify startup-only active-gate witness in load-mode playback details', async () => {
    const scenarioDir = join(state.outputDir, 'seed-restart-under-load-load');
    await mkdir(scenarioDir, {recursive: true});
    await writeFile(
      join(scenarioDir, 'events.ndjson'),
      [
        JSON.stringify(
          buildPlaybackActiveGateStageEvent({
            readinessMode: 'load',
            activeGateCurrentProgress: buildStartupModeWitnessProgress({
              snapshotCoverageNodeCount: 2,
              isTimeoutError: false,
            }),
          }),
        ),
      ].join('\n') + '\n',
    );

    const writer = new ReportWriter(state.reportPath);
    writer.addResult(
      'seed-restart-under-load-load',
      buildPlaybackDerivedFailureResult(),
    );

    const {scenarioBundles, runBundle} = await writeFailureBundlesForReport({
      scenarios: writer.scenarios,
      reportOutputPath: state.reportPath,
      outputDir: state.outputDir,
      reportSummary: {total: 1, fail: 1, pass: 0},
      standardSummary: {scenarios: []},
      benchmarkRegressionGate: {status: 'skipped'},
      workspaceRoot: state.tempDir,
    });
    await writer.write({failureBundle: runBundle});

    assert.equal(scenarioBundles.length, 1);
    const scenarioBundle = JSON.parse(
      await readFile(
        resolve(state.tempDir, scenarioBundles[0].links.jsonPath),
        UTF8_ENCODING,
      ),
    );

    assert.equal(scenarioBundle.publicationConvergence.closureRecordId, null);
    assert.equal(
      scenarioBundle.publicationConvergence.closureWitnessClass,
      null,
    );
    assert.equal(scenarioBundle.controlPlane.activeGate.mode, 'load');
  });

  it('prefers the richest playback active-gate diagnostics over a later timeout-only sample', async () => {
    const scenarioDir = join(state.outputDir, 'seed-restart-under-load');
    await mkdir(scenarioDir, {recursive: true});
    await writeFile(
      join(scenarioDir, 'events.ndjson'),
      [
        JSON.stringify({
          timestamp: 5000,
          type: 'cluster.stage',
          scope: 'cluster',
          entityId: 'cluster',
          details: {
            stage: 'setup.cluster.waiting-active',
            snapshotCoverage: {
              completeCoverage: true,
              expectedNodeCount: 2,
              bestCoverageNodeCount: 2,
              selectedNodeId: 'seed-1',
              selectedCapturedAtMs: 4990,
              selectedObservedNodeIds: ['seed-1', 'joiner-1'],
              selectedControlPlaneDiagnosticsAvailable: true,
              selectedPublicationConvergence: {
                publicationEpoch: 7,
                publicationStatus: 'PUBLISHED',
                pendingAckNodeIds: [],
                publishedActiveNodeIds: ['seed-1', 'joiner-1'],
                priorityPartitionSummary: {
                  satisfied: false,
                  requiredDistinctNodeCount: 3,
                  readyEligibleNodeCount: 2,
                  totalPriorityPartitionCount: 5,
                  missingPartitionIds: ['replica_operations-p1'],
                },
              },
            },
            publicationConvergenceGate: {
              ready: false,
              reasons: ['priority_control_plane_spread_pending'],
            },
          },
        }),
        JSON.stringify({
          timestamp: 9000,
          type: 'cluster.stage',
          scope: 'cluster',
          entityId: 'cluster',
          details: {
            stage: 'setup.cluster.waiting-active',
            snapshotCoverage: {
              completeCoverage: false,
              expectedNodeCount: 2,
              bestCoverageNodeCount: 0,
              selectedNodeId: 'seed-1',
              selectedCapturedAtMs: null,
              selectedObservedNodeIds: [],
              selectedControlPlaneDiagnosticsAvailable: false,
              selectedPublicationConvergence: null,
              selectedError:
                'Admin API query timed out for node seed-1 on lane snapshot after 1ms',
            },
            publicationConvergenceGate: {
              ready: false,
              reasons: [
                'publication_convergence_missing',
                'publication_not_published=unknown',
              ],
            },
          },
        }),
      ].join('\n') + '\n',
    );

    const writer = new ReportWriter(state.reportPath);
    writer.addResult(
      'seed-restart-under-load',
      buildPlaybackDerivedFailureResult(),
    );

    const {scenarioBundles, runBundle} = await writeFailureBundlesForReport({
      scenarios: writer.scenarios,
      reportOutputPath: state.reportPath,
      outputDir: state.outputDir,
      reportSummary: {total: 1, fail: 1, pass: 0},
      standardSummary: {scenarios: []},
      benchmarkRegressionGate: {status: 'skipped'},
      workspaceRoot: state.tempDir,
    });
    await writer.write({failureBundle: runBundle});

    assert.equal(scenarioBundles.length, 1);
    const scenarioBundle = JSON.parse(
      await readFile(
        resolve(state.tempDir, scenarioBundles[0].links.jsonPath),
        UTF8_ENCODING,
      ),
    );

    assert.equal(
      scenarioBundle.controlPlane.publicationConvergence.publicationStatus,
      'PUBLISHED',
    );
    assert.equal(
      scenarioBundle.controlPlane.activeGateSnapshotCoverage
        .bestCoverageNodeCount,
      2,
    );
    assert.deepEqual(
      scenarioBundle.controlPlane.publicationConvergenceGate.reasons,
      ['priority_control_plane_spread_pending'],
    );
    assert.equal(
      scenarioBundle.publicationConvergence.closureRecordId,
      'CL-003',
    );
    assert.equal(
      scenarioBundle.publicationConvergence.closureWitnessClass,
      'publication_converged_priority_spread_pending',
    );
  });

  it('prefers load-readiness stable playback closure over stale waiting-active priority evidence', async () => {
    const SCENARIO_NAME = 'seed-restart-under-load';
    const PLAYBACK_EVENTS_FILENAME = 'events.ndjson';
    const PLAYBACK_EVENT_TYPE_CLUSTER_STAGE = 'cluster.stage';
    const PLAYBACK_SCOPE_CLUSTER = 'cluster';
    const PLAYBACK_ENTITY_CLUSTER = 'cluster';
    const PLAYBACK_STAGE_WAITING_ACTIVE = 'setup.cluster.waiting-active';
    const PLAYBACK_STAGE_LOAD_READINESS_STABLE =
      'scenario.load-readiness.stable';
    const PRIORITY_PARTITION_ID = 'replica_operations-p1';
    const STALE_EVENT_TIMESTAMP_MS = 5000;
    const STABLE_EVENT_TIMESTAMP_MS = 8000;
    const STALE_CAPTURED_AT_MS = 4990;
    const STABLE_CAPTURED_AT_MS = 7990;
    const STALE_PUBLICATION_EPOCH = 4;
    const STABLE_PUBLICATION_EPOCH = 5;
    const EXPECTED_NODE_COUNT = 5;
    const COMPLETE_COVERAGE_NODE_COUNT = 5;
    const ZERO_COUNT = 0;
    const ONE_COUNT = 1;
    const NODE_IDS = ['node-1', 'node-2', 'node-3', 'node-4', 'node-5'];
    const STALE_SELECTED_NODE_ID = NODE_IDS[ZERO_COUNT];
    const STABLE_SELECTED_NODE_ID = NODE_IDS[ONE_COUNT];
    const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
    const RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING =
      'priority_spread_pending';
    const RECOVERY_PROTOCOL_STEADY_PUBLISHED = 'steady_published';
    const REASON_PRIORITY_PARTITIONS_NOT_SPREAD =
      'priority_partitions_not_spread';
    const BLOCKED_REASON =
      'operation_created_but_no_step_transitions';
    const ACTIVE_GATE_MODE_LOAD = 'load';
    const ACTIVE_GATE_STATE_READY = 'ready';
    const ACTIVE_GATE_BLOCKER_READY = 'ready';
    const SEMANTIC_STATE_OPERATION_STALLED = 'operation_stalled';
    const SEMANTIC_STATE_CONVERGED = 'converged';
    const STALE_CLOSURE_STATE = 'closure_pending';
    const STABLE_CLOSURE_STATE = 'closure_satisfied_fresh';
    const BENCHMARK_REGRESSION_GATE_STATUS_SKIPPED = 'skipped';
    const STABILITY_GATE_STATUS_CLOSED = 'closed';
    const scenarioDir = join(state.outputDir, SCENARIO_NAME);
    await mkdir(scenarioDir, {recursive: true});
    await writeFile(
      join(scenarioDir, PLAYBACK_EVENTS_FILENAME),
      [
        JSON.stringify({
          timestamp: STALE_EVENT_TIMESTAMP_MS,
          type: PLAYBACK_EVENT_TYPE_CLUSTER_STAGE,
          scope: PLAYBACK_SCOPE_CLUSTER,
          entityId: PLAYBACK_ENTITY_CLUSTER,
          details: {
            stage: PLAYBACK_STAGE_WAITING_ACTIVE,
            snapshotCoverage: {
              completeCoverage: true,
              bestCoverageNodeCount: COMPLETE_COVERAGE_NODE_COUNT,
              expectedNodeCount: EXPECTED_NODE_COUNT,
              selectedNodeId: STALE_SELECTED_NODE_ID,
              selectedCapturedAtMs: STALE_CAPTURED_AT_MS,
              selectedObservedNodeIds: NODE_IDS,
              selectedControlPlaneDiagnosticsAvailable: true,
              selectedPublicationConvergence: {
                publicationEpoch: STALE_PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                publishedActiveNodeIds: NODE_IDS,
                recoveryProtocolState:
                  RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING,
                prioritySpreadPending: true,
                priorityRecoveryReasonCodes: [
                  REASON_PRIORITY_PARTITIONS_NOT_SPREAD,
                ],
                priorityPartitionSummary: {
                  satisfied: false,
                  blockedPartitionCount: ONE_COUNT,
                  totalPriorityPartitionCount: ONE_COUNT,
                  blockedPartitions: [{
                    partitionId: PRIORITY_PARTITION_ID,
                    blockerReasonCodes: [BLOCKED_REASON],
                  }],
                },
              },
              selectedPriorityRecoveryDecisionSnapshots: {
                publicationEpoch: STALE_PUBLICATION_EPOCH,
                priorityPartitionSummary: {
                  satisfied: false,
                  blockedPartitionCount: ONE_COUNT,
                  totalPriorityPartitionCount: ONE_COUNT,
                },
                snapshots: [{
                  partitionId: PRIORITY_PARTITION_ID,
                  semanticState: SEMANTIC_STATE_OPERATION_STALLED,
                  blockerReasons: [BLOCKED_REASON],
                }],
                closureWitness: {
                  state: STALE_CLOSURE_STATE,
                  prioritySpreadPending: true,
                  blockedPartitionIds: [PRIORITY_PARTITION_ID],
                  satisfiedPartitionIds: [],
                },
              },
            },
            publicationConvergenceGate: {
              ready: false,
              reasons: [REASON_PRIORITY_PARTITIONS_NOT_SPREAD],
              publicationStatus: PUBLICATION_STATUS_PUBLISHED,
              pendingAckNodeIds: [],
              missingPublishedNodeIds: [],
              priorityPartitionSummary: {
                satisfied: false,
                blockedPartitionCount: ONE_COUNT,
                totalPriorityPartitionCount: ONE_COUNT,
              },
            },
            activeGate: {
              mode: ACTIVE_GATE_MODE_LOAD,
              state: ACTIVE_GATE_STATE_READY,
              ready: true,
              progress: {
                expectedNodeCount: EXPECTED_NODE_COUNT,
                activeNodeCount: EXPECTED_NODE_COUNT,
                inactiveNodeCount: ZERO_COUNT,
                snapshotCoverageNodeCount: COMPLETE_COVERAGE_NODE_COUNT,
                snapshotCoverageComplete: true,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckCount: ZERO_COUNT,
                missingPublishedCount: ZERO_COUNT,
                gateReasons: [],
                blockers: [ACTIVE_GATE_BLOCKER_READY],
                blockerSignature: ACTIVE_GATE_BLOCKER_READY,
              },
            },
          },
        }),
        JSON.stringify({
          timestamp: STABLE_EVENT_TIMESTAMP_MS,
          type: PLAYBACK_EVENT_TYPE_CLUSTER_STAGE,
          scope: PLAYBACK_SCOPE_CLUSTER,
          entityId: PLAYBACK_ENTITY_CLUSTER,
          details: {
            stage: PLAYBACK_STAGE_LOAD_READINESS_STABLE,
            snapshotCoverage: {
              completeCoverage: true,
              bestCoverageNodeCount: COMPLETE_COVERAGE_NODE_COUNT,
              expectedNodeCount: EXPECTED_NODE_COUNT,
              selectedNodeId: STABLE_SELECTED_NODE_ID,
              selectedCapturedAtMs: STABLE_CAPTURED_AT_MS,
              selectedObservedNodeIds: NODE_IDS,
              selectedControlPlaneDiagnosticsAvailable: true,
              selectedPublicationConvergence: {
                publicationEpoch: STABLE_PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                publishedActiveNodeIds: NODE_IDS,
                recoveryProtocolState: RECOVERY_PROTOCOL_STEADY_PUBLISHED,
                prioritySpreadPending: false,
                priorityRecoveryReasonCodes: [],
                priorityPartitionSummary: {
                  satisfied: true,
                  blockedPartitionCount: ZERO_COUNT,
                  totalPriorityPartitionCount: ONE_COUNT,
                  blockedPartitions: [],
                },
              },
              selectedPriorityRecoveryDecisionSnapshots: {
                publicationEpoch: STABLE_PUBLICATION_EPOCH,
                priorityPartitionSummary: {
                  satisfied: true,
                  blockedPartitionCount: ZERO_COUNT,
                  totalPriorityPartitionCount: ONE_COUNT,
                },
                snapshots: [{
                  partitionId: PRIORITY_PARTITION_ID,
                  semanticState: SEMANTIC_STATE_CONVERGED,
                  blockerReasons: [],
                }],
                closureWitness: {
                  state: STABLE_CLOSURE_STATE,
                  prioritySpreadPending: false,
                  blockedPartitionIds: [],
                  satisfiedPartitionIds: [PRIORITY_PARTITION_ID],
                },
              },
            },
            publicationConvergenceGate: {
              ready: true,
              reasons: [],
              publicationStatus: PUBLICATION_STATUS_PUBLISHED,
              pendingAckNodeIds: [],
              missingPublishedNodeIds: [],
              priorityPartitionSummary: {
                satisfied: true,
                blockedPartitionCount: ZERO_COUNT,
                totalPriorityPartitionCount: ONE_COUNT,
              },
            },
          },
        }),
      ].join('\n') + '\n',
    );

    const writer = new ReportWriter(state.reportPath);
    writer.addResult(
      SCENARIO_NAME,
      buildPlaybackDerivedFailureResult(),
    );

    const {scenarioBundles, runBundle} = await writeFailureBundlesForReport({
      scenarios: writer.scenarios,
      reportOutputPath: state.reportPath,
      outputDir: state.outputDir,
      reportSummary: {total: 1, fail: 1, pass: 0},
      standardSummary: {scenarios: []},
      benchmarkRegressionGate: {
        status: BENCHMARK_REGRESSION_GATE_STATUS_SKIPPED,
      },
      workspaceRoot: state.tempDir,
    });
    await writer.write({failureBundle: runBundle});

    const scenarioBundle = JSON.parse(
      await readFile(
        resolve(state.tempDir, scenarioBundles[0].links.jsonPath),
        UTF8_ENCODING,
      ),
    );
    const reportJson = JSON.parse(
      await readFile(state.reportPath, UTF8_ENCODING),
    );

    assert.equal(
      scenarioBundle.controlPlane.publicationConvergence.publicationEpoch,
      STABLE_PUBLICATION_EPOCH,
    );
    assert.equal(
      scenarioBundle.controlPlane.activeGateObservedAtMs,
      STABLE_EVENT_TIMESTAMP_MS,
    );
    assert.equal(
      scenarioBundle.controlPlane.priorityRecoveryDecisionSnapshots
        .closureWitness.state,
      STABLE_CLOSURE_STATE,
    );
    assert.equal(
      scenarioBundle.publicationConvergence.prioritySpreadPending,
      false,
    );
    assert.deepEqual(
      scenarioBundle.publicationConvergence.priorityRecoveryReasonCodes,
      [],
    );
    assert.equal(
      scenarioBundle.summary.stabilityGates.convergence.status,
      STABILITY_GATE_STATUS_CLOSED,
    );
    assert.equal(
      reportJson.scenarios[0].publicationConvergence.prioritySpreadPending,
      false,
    );
  });

  it('prefers terminal load-readiness waiting playback evidence over stale setup priority evidence', async () => {
    const SCENARIO_NAME = 'rolling-restart';
    const PLAYBACK_EVENTS_FILENAME = 'events.ndjson';
    const PLAYBACK_EVENT_TYPE_CLUSTER_STAGE = 'cluster.stage';
    const PLAYBACK_SCOPE_CLUSTER = 'cluster';
    const PLAYBACK_ENTITY_CLUSTER = 'cluster';
    const PLAYBACK_STAGE_WAITING_ACTIVE = 'setup.cluster.waiting-active';
    const PLAYBACK_STAGE_LOAD_READINESS_WAITING =
      'scenario.load-readiness.waiting';
    const STALE_EVENT_TIMESTAMP_MS = 5000;
    const TERMINAL_EVENT_TIMESTAMP_MS = 9000;
    const STALE_CAPTURED_AT_MS = 4990;
    const TERMINAL_CAPTURED_AT_MS = 8990;
    const STALE_PUBLICATION_EPOCH = 4;
    const TERMINAL_PUBLICATION_EPOCH = 8;
    const EXPECTED_NODE_COUNT = 5;
    const COMPLETE_COVERAGE_NODE_COUNT = 5;
    const ZERO_COUNT = 0;
    const ONE_COUNT = 1;
    const NODE_IDS = ['node-1', 'node-2', 'node-3', 'node-4', 'node-5'];
    const STALE_SELECTED_NODE_ID = NODE_IDS[ZERO_COUNT];
    const TERMINAL_SELECTED_NODE_ID = NODE_IDS[ONE_COUNT];
    const PENDING_ACK_NODE_ID = NODE_IDS[2];
    const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
    const PUBLICATION_STATUS_ACK_PENDING = 'ACK_PENDING';
    const RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING =
      'priority_spread_pending';
    const RECOVERY_PROTOCOL_STEADY_PUBLISHED = 'steady_published';
    const REASON_PRIORITY_PARTITIONS_NOT_SPREAD =
      'priority_partitions_not_spread';
    const REASON_PUBLICATION_PENDING_ACK = 'publication_pending_ack=1';
    const PRIORITY_PARTITION_ID = 'replica_operations-p1';
    const BLOCKED_REASON =
      'operation_created_but_no_step_transitions';
    const SEMANTIC_STATE_OPERATION_STALLED = 'operation_stalled';
    const SEMANTIC_STATE_CONVERGED = 'converged';
    const ACTIVE_GATE_MODE_STARTUP = 'startup';
    const ACTIVE_GATE_MODE_LOAD = 'load';
    const ACTIVE_GATE_STATE_READY = 'ready';
    const ACTIVE_GATE_STATE_TIMED_OUT = 'timed_out';
    const ACTIVE_GATE_BLOCKER_READY = 'ready';
    const SNAPSHOT_REACHABILITY_ERROR =
      'Control snapshot reachability probe timed out for node-2';
    const FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED =
      'publication_convergence_blocked';
    const BENCHMARK_REGRESSION_GATE_STATUS_SKIPPED = 'skipped';
    const scenarioDir = join(state.outputDir, SCENARIO_NAME);
    await mkdir(scenarioDir, {recursive: true});
    await writeFile(
      join(scenarioDir, PLAYBACK_EVENTS_FILENAME),
      [
        JSON.stringify({
          timestamp: STALE_EVENT_TIMESTAMP_MS,
          type: PLAYBACK_EVENT_TYPE_CLUSTER_STAGE,
          scope: PLAYBACK_SCOPE_CLUSTER,
          entityId: PLAYBACK_ENTITY_CLUSTER,
          details: {
            stage: PLAYBACK_STAGE_WAITING_ACTIVE,
            snapshotCoverage: {
              completeCoverage: true,
              bestCoverageNodeCount: COMPLETE_COVERAGE_NODE_COUNT,
              expectedNodeCount: EXPECTED_NODE_COUNT,
              selectedNodeId: STALE_SELECTED_NODE_ID,
              selectedCapturedAtMs: STALE_CAPTURED_AT_MS,
              selectedObservedNodeIds: NODE_IDS,
              selectedControlPlaneDiagnosticsAvailable: true,
              selectedPublicationConvergence: {
                publicationEpoch: STALE_PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                publishedActiveNodeIds: NODE_IDS,
                recoveryProtocolState:
                  RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING,
                prioritySpreadPending: true,
                priorityRecoveryReasonCodes: [
                  REASON_PRIORITY_PARTITIONS_NOT_SPREAD,
                ],
                priorityPartitionSummary: {
                  satisfied: false,
                  blockedPartitionCount: ONE_COUNT,
                  totalPriorityPartitionCount: ONE_COUNT,
                  blockedPartitions: [{
                    partitionId: PRIORITY_PARTITION_ID,
                    blockerReasonCodes: [BLOCKED_REASON],
                  }],
                },
              },
              selectedPriorityRecoveryDecisionSnapshots: {
                publicationEpoch: STALE_PUBLICATION_EPOCH,
                priorityPartitionSummary: {
                  satisfied: false,
                  blockedPartitionCount: ONE_COUNT,
                },
                snapshots: [{
                  partitionId: PRIORITY_PARTITION_ID,
                  semanticState: SEMANTIC_STATE_OPERATION_STALLED,
                  blockerReasons: [BLOCKED_REASON],
                }],
              },
            },
            publicationConvergenceGate: {
              ready: false,
              reasons: [REASON_PRIORITY_PARTITIONS_NOT_SPREAD],
              publicationStatus: PUBLICATION_STATUS_PUBLISHED,
              pendingAckNodeIds: [],
              missingPublishedNodeIds: [],
              priorityPartitionSummary: {
                satisfied: false,
                blockedPartitionCount: ONE_COUNT,
              },
            },
            activeGate: {
              mode: ACTIVE_GATE_MODE_STARTUP,
              state: ACTIVE_GATE_STATE_READY,
              ready: true,
              progress: {
                expectedNodeCount: EXPECTED_NODE_COUNT,
                activeNodeCount: EXPECTED_NODE_COUNT,
                inactiveNodeCount: ZERO_COUNT,
                snapshotCoverageNodeCount: COMPLETE_COVERAGE_NODE_COUNT,
                snapshotCoverageComplete: true,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckCount: ZERO_COUNT,
                missingPublishedCount: ZERO_COUNT,
                gateReasons: [],
                prioritySpreadSatisfied: false,
                priorityRecoveryProgressClasses: {
                  unresolvedClassIds: [BLOCKED_REASON],
                  unresolvedClassCount: ONE_COUNT,
                  blockedPartitionIds: [PRIORITY_PARTITION_ID],
                  blockedPartitionCount: ONE_COUNT,
                },
                blockers: [ACTIVE_GATE_BLOCKER_READY],
              },
            },
          },
        }),
        JSON.stringify({
          timestamp: TERMINAL_EVENT_TIMESTAMP_MS,
          type: PLAYBACK_EVENT_TYPE_CLUSTER_STAGE,
          scope: PLAYBACK_SCOPE_CLUSTER,
          entityId: PLAYBACK_ENTITY_CLUSTER,
          details: {
            stage: PLAYBACK_STAGE_LOAD_READINESS_WAITING,
            snapshotCoverage: {
              completeCoverage: true,
              bestCoverageNodeCount: COMPLETE_COVERAGE_NODE_COUNT,
              expectedNodeCount: EXPECTED_NODE_COUNT,
              selectedNodeId: TERMINAL_SELECTED_NODE_ID,
              selectedCapturedAtMs: TERMINAL_CAPTURED_AT_MS,
              selectedObservedNodeIds: NODE_IDS,
              selectedControlPlaneDiagnosticsAvailable: true,
              selectedReachabilityError: SNAPSHOT_REACHABILITY_ERROR,
              selectedPublicationConvergence: {
                publicationEpoch: TERMINAL_PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_ACK_PENDING,
                pendingAckNodeIds: [PENDING_ACK_NODE_ID],
                publishedActiveNodeIds: NODE_IDS,
                recoveryProtocolState: RECOVERY_PROTOCOL_STEADY_PUBLISHED,
                prioritySpreadPending: false,
                priorityRecoveryReasonCodes: [],
                priorityPartitionSummary: {
                  satisfied: true,
                  blockedPartitionCount: ZERO_COUNT,
                  totalPriorityPartitionCount: ONE_COUNT,
                  blockedPartitions: [],
                },
              },
              selectedPriorityRecoveryDecisionSnapshots: {
                publicationEpoch: TERMINAL_PUBLICATION_EPOCH,
                priorityPartitionSummary: {
                  satisfied: true,
                  blockedPartitionCount: ZERO_COUNT,
                },
                snapshots: [{
                  partitionId: PRIORITY_PARTITION_ID,
                  semanticState: SEMANTIC_STATE_CONVERGED,
                  blockerReasons: [],
                }],
              },
            },
            publicationConvergenceGate: {
              ready: false,
              reasons: [REASON_PUBLICATION_PENDING_ACK],
              publicationStatus: PUBLICATION_STATUS_ACK_PENDING,
              pendingAckNodeIds: [PENDING_ACK_NODE_ID],
              missingPublishedNodeIds: [],
              priorityPartitionSummary: {
                satisfied: true,
                blockedPartitionCount: ZERO_COUNT,
              },
            },
            activeGate: {
              mode: ACTIVE_GATE_MODE_LOAD,
              state: ACTIVE_GATE_STATE_TIMED_OUT,
              progress: {
                expectedNodeCount: EXPECTED_NODE_COUNT,
                activeNodeCount: EXPECTED_NODE_COUNT,
                inactiveNodeCount: ZERO_COUNT,
                snapshotCoverageNodeCount: COMPLETE_COVERAGE_NODE_COUNT,
                snapshotCoverageComplete: true,
                publicationEpoch: TERMINAL_PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_ACK_PENDING,
                recoveryProtocolState: RECOVERY_PROTOCOL_STEADY_PUBLISHED,
                selectedSnapshotNodeId: TERMINAL_SELECTED_NODE_ID,
                selectedSnapshotReachabilityError:
                  SNAPSHOT_REACHABILITY_ERROR,
                selectedPublishedActiveNodeIds: NODE_IDS,
                pendingAckCount: ONE_COUNT,
                missingPublishedCount: ZERO_COUNT,
                gateReasons: [REASON_PUBLICATION_PENDING_ACK],
                prioritySpreadSatisfied: true,
                priorityRecoveryProgressClasses: {
                  unresolvedClassIds: [],
                  unresolvedClassCount: ZERO_COUNT,
                  blockedPartitionIds: [],
                  blockedPartitionCount: ZERO_COUNT,
                },
                blockers: [REASON_PUBLICATION_PENDING_ACK],
              },
            },
          },
        }),
      ].join('\n') + '\n',
    );

    const writer = new ReportWriter(state.reportPath);
    writer.addResult(
      SCENARIO_NAME,
      buildPlaybackDerivedFailureResult(),
    );

    const {scenarioBundles, runBundle} = await writeFailureBundlesForReport({
      scenarios: writer.scenarios,
      reportOutputPath: state.reportPath,
      outputDir: state.outputDir,
      reportSummary: {total: 1, fail: 1, pass: 0},
      standardSummary: {scenarios: []},
      benchmarkRegressionGate: {
        status: BENCHMARK_REGRESSION_GATE_STATUS_SKIPPED,
      },
      workspaceRoot: state.tempDir,
    });
    await writer.write({failureBundle: runBundle});

    const scenarioBundle = JSON.parse(
      await readFile(
        resolve(state.tempDir, scenarioBundles[0].links.jsonPath),
        UTF8_ENCODING,
      ),
    );
    const reportJson = JSON.parse(
      await readFile(state.reportPath, UTF8_ENCODING),
    );

    assert.equal(
      scenarioBundle.controlPlane.activeGateObservedAtMs,
      TERMINAL_EVENT_TIMESTAMP_MS,
    );
    assert.equal(
      scenarioBundle.publicationConvergence.publicationEpoch,
      TERMINAL_PUBLICATION_EPOCH,
    );
    assert.equal(
      scenarioBundle.publicationConvergence.pendingAckCount,
      ONE_COUNT,
    );
    assert.deepEqual(
      scenarioBundle.publicationConvergence.pendingAckNodeIds,
      [PENDING_ACK_NODE_ID],
    );
    assert.equal(
      scenarioBundle.publicationConvergence.prioritySpreadPending,
      false,
    );
    assert.equal(
      scenarioBundle.summary.failureClassification.failureClass,
      FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
    );
    assert.equal(
      reportJson.scenarios[0].publicationConvergence.publicationEpoch,
      TERMINAL_PUBLICATION_EPOCH,
    );
    assert.equal(
      reportJson.scenarios[0].failureClassification.failureClass,
      FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
    );
  });

  it('prefers a later terminal active-gate playback state over earlier stalled waiting-active details', async () => {
    const scenarioDir = join(state.outputDir, 'node-join-under-load');
    await mkdir(scenarioDir, {recursive: true});
    await writeFile(
      join(scenarioDir, 'events.ndjson'),
      [
        JSON.stringify({
          timestamp: 5000,
          type: 'cluster.stage',
          scope: 'cluster',
          entityId: 'cluster',
          details: {
            stage: 'setup.cluster.waiting-active',
            nodeDiagnostics: [
              {
                nodeId: 'node-1',
                active: false,
                state: 'inactive',
              },
              {
                nodeId: 'node-2',
                active: false,
                state: 'inactive',
              },
            ],
            snapshotCoverage: {
              completeCoverage: true,
              bestCoverageNodeCount: 2,
              expectedNodeCount: 2,
              selectedNodeId: 'node-1',
              selectedCapturedAtMs: 4990,
              selectedObservedNodeIds: ['node-1', 'node-2'],
              selectedControlPlaneDiagnosticsAvailable: true,
              selectedPublicationConvergence: {
                publicationEpoch: 4,
                publicationStatus: 'PUBLISHED',
                pendingAckNodeIds: [],
                publishedActiveNodeIds: ['node-1', 'node-2'],
                priorityPartitionSummary: {
                  satisfied: true,
                  blockedPartitionCount: 0,
                  totalSpreadGap: 0,
                },
              },
            },
            publicationConvergenceGate: {
              ready: true,
              reasons: [],
              publicationStatus: 'PUBLISHED',
              pendingAckNodeIds: [],
              missingPublishedNodeIds: [],
              priorityPartitionSummary: {
                satisfied: true,
                blockedPartitionCount: 0,
                totalSpreadGap: 0,
              },
            },
            activeGateProgress: {
              expectedNodeCount: 2,
              activeNodeCount: 0,
              inactiveNodeCount: 2,
              snapshotCoverageNodeCount: 2,
              snapshotCoverageComplete: true,
              publicationStatus: 'PUBLISHED',
              pendingAckCount: 0,
              missingPublishedCount: 0,
              gateReasons: [],
              blockers: ['inactive_nodes=2'],
              blockerSignature: 'inactive_nodes=2',
            },
            activeGate: {
              mode: 'load',
              state: 'stalled',
              maxAttempts: 30,
              attemptsSinceProgress: 30,
              reasonCode: 'stalled_no_progress',
              stalledReason: 'active_wait_no_progress_coordinator_cycles=30',
              progress: {
                expectedNodeCount: 2,
                activeNodeCount: 0,
                inactiveNodeCount: 2,
                snapshotCoverageNodeCount: 2,
                snapshotCoverageComplete: true,
                publicationStatus: 'PUBLISHED',
                pendingAckCount: 0,
                missingPublishedCount: 0,
                gateReasons: [],
                blockers: ['inactive_nodes=2'],
                blockerSignature: 'inactive_nodes=2',
              },
            },
          },
        }),
        JSON.stringify({
          timestamp: 7000,
          type: 'cluster.stage',
          scope: 'cluster',
          entityId: 'cluster',
          details: {
            stage: 'setup.cluster.active',
            nodeCount: 2,
            snapshotCoverage: {
              completeCoverage: true,
              bestCoverageNodeCount: 2,
              expectedNodeCount: 2,
              selectedNodeId: 'node-1',
              selectedCapturedAtMs: 6990,
              selectedObservedNodeIds: ['node-1', 'node-2'],
              selectedControlPlaneDiagnosticsAvailable: true,
              selectedPublicationConvergence: {
                publicationEpoch: 4,
                publicationStatus: 'PUBLISHED',
                pendingAckNodeIds: [],
                publishedActiveNodeIds: ['node-1', 'node-2'],
                priorityPartitionSummary: {
                  satisfied: true,
                  blockedPartitionCount: 0,
                  totalSpreadGap: 0,
                },
              },
            },
            publicationConvergenceGate: {
              ready: true,
              reasons: [],
              publicationStatus: 'PUBLISHED',
              pendingAckNodeIds: [],
              missingPublishedNodeIds: [],
              priorityPartitionSummary: {
                satisfied: true,
                blockedPartitionCount: 0,
                totalSpreadGap: 0,
              },
            },
            activeGate: {
              mode: 'load',
              state: 'ready',
              ready: true,
              softSuccess: false,
              attempts: 31,
              elapsedMs: 42000,
              attemptsSinceProgress: 0,
              progress: {
                expectedNodeCount: 2,
                activeNodeCount: 2,
                inactiveNodeCount: 0,
                snapshotCoverageNodeCount: 2,
                snapshotCoverageComplete: true,
                publicationStatus: 'PUBLISHED',
                pendingAckCount: 0,
                missingPublishedCount: 0,
                gateReasons: [],
                blockers: ['ready'],
                blockerSignature: 'ready',
              },
            },
          },
        }),
      ].join('\n') + '\n',
    );

    const writer = new ReportWriter(state.reportPath);
    writer.addResult(
      'node-join-under-load',
      buildPlaybackDerivedFailureResult(),
    );

    const {scenarioBundles, runBundle} = await writeFailureBundlesForReport({
      scenarios: writer.scenarios,
      reportOutputPath: state.reportPath,
      outputDir: state.outputDir,
      reportSummary: {total: 1, fail: 1, pass: 0},
      standardSummary: {scenarios: []},
      benchmarkRegressionGate: {status: 'skipped'},
      workspaceRoot: state.tempDir,
    });
    await writer.write({failureBundle: runBundle});

    const scenarioBundle = JSON.parse(
      await readFile(
        resolve(state.tempDir, scenarioBundles[0].links.jsonPath),
        UTF8_ENCODING,
      ),
    );
    const reportJson = JSON.parse(
      await readFile(state.reportPath, UTF8_ENCODING),
    );

    assert.equal(
      scenarioBundle.publicationConvergence.activeGate.state,
      'ready',
    );
    assert.equal(
      scenarioBundle.controlPlane.activeGate.state,
      'ready',
    );
    assert.equal(
      reportJson.scenarios[0].publicationConvergence.activeGate.state,
      'ready',
    );
  });
}
