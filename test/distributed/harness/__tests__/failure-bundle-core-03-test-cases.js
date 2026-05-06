export function registerFailureBundleCore03Tests(context) {
  const {
    it,
    assert,
    FAILURE_CLASS_CACHE_STALE,
    FAILURE_CLASS_CDC_DEGRADED,
    FAILURE_CLASS_STARTUP_RECOVERY_BLOCKED,
    FAILURE_CLASS_TOPOLOGY_UNSTABLE,
    FAILURE_CLASS_UNKNOWN,
    join,
    PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK,
    readFile,
    ReportWriter,
    resolve,
    UTF8_ENCODING,
    writeFailureBundlesForReport,
  } = context;
  let tempDir;
  let outputDir;
  const refreshState = () => {
    tempDir = context.state.tempDir;
    outputDir = context.state.outputDir;
  };

  it('classifies post-active convergence timeouts before retained startup readiness evidence',
    async () => {
      refreshState();
      const POST_ACTIVE_CONVERGENCE_REPORT_PATH = join(
        tempDir,
        'post-active-convergence-barrier-report.json',
      );
      const SCENARIO_NAME = 'rolling-restart';
      const CONVERGENCE_TIMEOUT_ERROR =
        'Convergence timeout after 120000ms. Max over-target: 69818ms.';
      const CONVERGENCE_TIMEOUT_REASON = 'convergence_timeout';
      const FAILURE_BARRIER_PHASE_CONVERGENCE = 'convergence';
      const FAILURE_BARRIER_SIGNAL = 'failureBarrier=convergence';
      const FAILURE_BARRIER_REASON_SIGNAL =
        'failureBarrierReason=' + CONVERGENCE_TIMEOUT_REASON;
      const POST_ACTIVE_CONVERGENCE_ACTION_MATCH =
        /Post-active topology convergence timed out/;
      const POST_ACTIVE_CONVERGENCE_RECOMMENDATION_MATCH =
        /final leader ownership/;
      const ROOT_CAUSE_CLASS_STARTUP = 'startup';
      const ROOT_CAUSE_CLASS_TOPOLOGY = 'topology';
      const READINESS_TIMEOUT_REASON =
        'readiness_probe_timeout_fallback=Node readiness probe timed out for seed-1';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_STATE_STEADY = 'steady_published';
      const STARTUP_READINESS_MODE = 'startup';
      const SNAPSHOT_REACHABILITY_TIMEOUT =
        'snapshot_reachability_timeout';
      const SNAPSHOT_REACHABILITY_SOURCE =
        'selectedSnapshotReachabilityError';
      const TERMINAL_RECOVERABILITY = 'terminal';
      const SNAPSHOT_REACHABILITY_ERROR =
        'Control snapshot reachability probe timed out for seed-1';
      const PUBLICATION_EPOCH = 5;
      const SCENARIO_DURATION_MS = 100;
      const EXPECTED_NODE_COUNT = 5;
      const ACTIVE_NODE_COUNT = 5;
      const SNAPSHOT_COVERAGE_NODE_COUNT = 5;
      const EMPTY_COUNT = 0;
      const SINGLE_COUNT = 1;
      const writer = new ReportWriter(POST_ACTIVE_CONVERGENCE_REPORT_PATH);
      writer.addResult(SCENARIO_NAME, {
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: CONVERGENCE_TIMEOUT_ERROR,
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: ROOT_CAUSE_CLASS_STARTUP,
              dominantReason: READINESS_TIMEOUT_REASON,
              reasonCounts: {
                [READINESS_TIMEOUT_REASON]: SINGLE_COUNT,
              },
            },
            controlPlaneDiagnostics: {
              publicationConvergence: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: EMPTY_COUNT,
                blockedNodeIds: [],
                blockedNodeCount: EMPTY_COUNT,
                publicationPending: false,
                prioritySpreadPending: false,
                publishedActiveNodeIds: [],
                recoveryProtocolState: RECOVERY_PROTOCOL_STATE_STEADY,
                priorityRecoveryReasonCodes: [],
                priorityRecoveryProgressClassCount: EMPTY_COUNT,
                priorityRecoveryInvariantFailingIds: [],
              },
              activeGateProgress: {
                expectedNodeCount: EXPECTED_NODE_COUNT,
                activeNodeCount: ACTIVE_NODE_COUNT,
                inactiveNodeCount: EMPTY_COUNT,
                snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_NODE_COUNT,
                snapshotCoverageComplete: true,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                recoveryProtocolState: RECOVERY_PROTOCOL_STATE_STEADY,
                pendingAckCount: EMPTY_COUNT,
                missingPublishedCount: EMPTY_COUNT,
                gateReasonCount: EMPTY_COUNT,
                gateReasons: [],
                prioritySpreadSatisfied: true,
                priorityRecoveryProgressClasses: {
                  unresolvedClassIds: [],
                  unresolvedClassCount: EMPTY_COUNT,
                  unresolvedSemanticStateIds: [],
                  unresolvedSemanticStateCount: EMPTY_COUNT,
                  blockedPartitionIds: [],
                  blockedPartitionCount: EMPTY_COUNT,
                },
                readinessDelay: {
                  timedOut: true,
                  cause: SNAPSHOT_REACHABILITY_TIMEOUT,
                  source: SNAPSHOT_REACHABILITY_SOURCE,
                  recoverability: TERMINAL_RECOVERABILITY,
                  error: SNAPSHOT_REACHABILITY_ERROR,
                },
              },
              activeGateNoProgress: {
                mode: STARTUP_READINESS_MODE,
                attemptsSinceProgress: SINGLE_COUNT,
                stalled: false,
                readinessDelay: {
                  timedOut: true,
                  cause: SNAPSHOT_REACHABILITY_TIMEOUT,
                  source: SNAPSHOT_REACHABILITY_SOURCE,
                  recoverability: TERMINAL_RECOVERABILITY,
                  error: SNAPSHOT_REACHABILITY_ERROR,
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
            POST_ACTIVE_CONVERGENCE_REPORT_PATH,
            UTF8_ENCODING,
          ),
        ).scenarios,
        reportOutputPath: POST_ACTIVE_CONVERGENCE_REPORT_PATH,
        outputDir,
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
      assert.equal(
        failureClassification.rootCauseClass,
        ROOT_CAUSE_CLASS_TOPOLOGY,
      );
      assert.equal(
        failureClassification.dominantReason,
        CONVERGENCE_TIMEOUT_REASON,
      );
      assert.ok(
        failureClassification.signals.includes(FAILURE_BARRIER_SIGNAL),
      );
      assert.ok(
        failureClassification.signals.includes(FAILURE_BARRIER_REASON_SIGNAL),
      );
      assert.notEqual(
        failureClassification.failureClass,
        FAILURE_CLASS_STARTUP_RECOVERY_BLOCKED,
      );
      assert.equal(
        scenarioBundle.diagnostics.failure.failureBarrier.phase,
        FAILURE_BARRIER_PHASE_CONVERGENCE,
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.failover.status,
        'closed',
      );
      assert.match(
        scenarioBundle.summary.failureAction,
        POST_ACTIVE_CONVERGENCE_ACTION_MATCH,
      );
      assert.match(
        scenarioBundle.summary.operatorRecommendation,
        POST_ACTIVE_CONVERGENCE_RECOMMENDATION_MATCH,
      );
    });

  it('classifies open post-rebalance closure before stale priority recovery evidence',
    async () => {
      refreshState();
      const REPORT_PATH = join(
        tempDir,
        'post-rebalance-closure-owner-report.json',
      );
      const SCENARIO_NAME = 'rolling-restart';
      const CONVERGENCE_TIMEOUT_ERROR =
        'Convergence timeout after 120000ms. Max over-target: 151321ms.';
      const CONVERGENCE_TIMEOUT_REASON = 'convergence_timeout';
      const ROOT_CAUSE_CLASS_TOPOLOGY = 'topology';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_STATE_STEADY = 'steady_published';
      const POST_REBALANCE_CLOSURE_STATE_OPEN = 'open';
      const POST_REBALANCE_CLOSURE_STATE_SOFT_CLOSED = 'soft_closed';
      const MEMBERSHIP_TRIM_BLOCKER_ID = 'membership_trim_open';
      const NO_OVER_TARGET_BLOCKER_ID = 'no_over_target_open';
      const OPERATION_DRAIN_SOFT_CLOSURE_ID =
        'operation_drain_soft_closed';
      const MEMBERSHIP_TRIM_DIMENSION = 'membership_trim';
      const NO_OVER_TARGET_DIMENSION = 'no_over_target';
      const OPERATION_DRAIN_DIMENSION = 'operation_drain';
      const MEMBERSHIP_TRIM_REASON = 'published_membership_trim_debt';
      const OVERTARGET_REASON = 'overtarget_budget_exceeded';
      const STALE_REPLICA_OPERATIONS_REASON =
        'ignored_stale_replica_operations';
      const PRIORITY_RECOVERY_PARTITION_ID = 'replica_operations-p1';
      const PRIORITY_RECOVERY_PROGRESS_CLASS = 'operation_stalled';
      const PRIORITY_RECOVERY_SEMANTIC_STATE = 'recovering_in_flight';
      const SCENARIO_DURATION_MS = 100;
      const PUBLICATION_EPOCH = 7;
      const EMPTY_COUNT = 0;
      const SINGLE_COUNT = 1;
      const POST_REBALANCE_STATE_SIGNAL =
        'postRebalanceClosureState=' +
        POST_REBALANCE_CLOSURE_STATE_OPEN;
      const POST_REBALANCE_BLOCKER_SIGNAL =
        'postRebalanceBlocker=' + MEMBERSHIP_TRIM_BLOCKER_ID;
      const POST_REBALANCE_DIMENSION_SIGNAL =
        'postRebalanceDimension=' + MEMBERSHIP_TRIM_DIMENSION;
      const POST_REBALANCE_REASON_SIGNAL =
        'postRebalanceReason=' + MEMBERSHIP_TRIM_REASON;
      const POST_REBALANCE_SOFT_CLOSURE_SIGNAL =
        'postRebalanceSoftClosure=' + OPERATION_DRAIN_SOFT_CLOSURE_ID;
      const POST_REBALANCE_ACTION_MATCH =
        /Post-rebalance topology closure remains open/;
      const POST_REBALANCE_RECOMMENDATION_MATCH =
        /membership trim debt/;
      const writer = new ReportWriter(REPORT_PATH);
      writer.addResult(SCENARIO_NAME, {
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: CONVERGENCE_TIMEOUT_ERROR,
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: ROOT_CAUSE_CLASS_TOPOLOGY,
              dominantReason: CONVERGENCE_TIMEOUT_REASON,
              reasonCounts: {
                [CONVERGENCE_TIMEOUT_REASON]: SINGLE_COUNT,
              },
            },
            postRebalanceClosure: {
              state: POST_REBALANCE_CLOSURE_STATE_OPEN,
              blockers: [
                {
                  id: MEMBERSHIP_TRIM_BLOCKER_ID,
                  dimension: MEMBERSHIP_TRIM_DIMENSION,
                  reasonCodes: [MEMBERSHIP_TRIM_REASON],
                },
                {
                  id: NO_OVER_TARGET_BLOCKER_ID,
                  dimension: NO_OVER_TARGET_DIMENSION,
                  reasonCodes: [OVERTARGET_REASON],
                },
              ],
              softClosures: [
                {
                  id: OPERATION_DRAIN_SOFT_CLOSURE_ID,
                  dimension: OPERATION_DRAIN_DIMENSION,
                  reasonCodes: [STALE_REPLICA_OPERATIONS_REASON],
                },
              ],
              dimensions: {
                [OPERATION_DRAIN_DIMENSION]: {
                  dimension: OPERATION_DRAIN_DIMENSION,
                  state: POST_REBALANCE_CLOSURE_STATE_SOFT_CLOSED,
                  reasonCodes: [STALE_REPLICA_OPERATIONS_REASON],
                },
              },
            },
            controlPlaneDiagnostics: {
              hasExplicitPriorityRecoveryObservation: true,
              publicationConvergence: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: EMPTY_COUNT,
                blockedNodeIds: [],
                blockedNodeCount: EMPTY_COUNT,
                publicationPending: false,
                prioritySpreadPending: false,
                recoveryProtocolState: RECOVERY_PROTOCOL_STATE_STEADY,
                priorityRecoveryReasonCodes: [],
                priorityRecoveryProgressClassCount: EMPTY_COUNT,
                priorityRecoverySemanticStateCount: EMPTY_COUNT,
                priorityRecoveryBlockedPartitionCount: EMPTY_COUNT,
                priorityRecoveryUnresolvedPartitionCount: EMPTY_COUNT,
                priorityRecoveryInvariantFailingIds: [],
              },
              priorityRecoveryObservation: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: EMPTY_COUNT,
                blockedNodeIds: [],
                blockedNodeCount: EMPTY_COUNT,
                publicationPending: false,
                prioritySpreadPending: false,
                recoveryProtocolState: RECOVERY_PROTOCOL_STATE_STEADY,
                priorityRecoveryReasonCodes: [],
                priorityRecoveryProgressClassIds: [
                  PRIORITY_RECOVERY_PROGRESS_CLASS,
                ],
                priorityRecoveryProgressClassCount: SINGLE_COUNT,
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
        outputDir,
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
      assert.equal(
        failureClassification.rootCauseClass,
        ROOT_CAUSE_CLASS_TOPOLOGY,
      );
      assert.equal(
        failureClassification.dominantReason,
        CONVERGENCE_TIMEOUT_REASON,
      );
      assert.notEqual(
        failureClassification.failureClass,
        PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK,
      );
      assert.ok(
        failureClassification.signals.includes(
          POST_REBALANCE_STATE_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          POST_REBALANCE_BLOCKER_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          POST_REBALANCE_DIMENSION_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          POST_REBALANCE_REASON_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          POST_REBALANCE_SOFT_CLOSURE_SIGNAL,
        ),
      );
      assert.equal(
        scenarioBundle.summary.postRebalanceClosure.state,
        POST_REBALANCE_CLOSURE_STATE_OPEN,
      );
      assert.equal(
        scenarioBundle.diagnostics.postRebalanceClosure.state,
        POST_REBALANCE_CLOSURE_STATE_OPEN,
      );
      assert.match(
        scenarioBundle.summary.failureAction,
        POST_REBALANCE_ACTION_MATCH,
      );
      assert.match(
        scenarioBundle.summary.operatorRecommendation,
        POST_REBALANCE_RECOMMENDATION_MATCH,
      );
    });

  it('classifies convergence timeouts with closed playback publication before readiness-only evidence',
    async () => {
      refreshState();
      const REPORT_PATH = join(
        tempDir,
        'closed-playback-convergence-barrier-report.json',
      );
      const SCENARIO_NAME = 'rolling-restart';
      const CONVERGENCE_TIMEOUT_ERROR =
        'Convergence timeout after 120000ms. Max over-target: 8444ms.';
      const CONVERGENCE_TIMEOUT_REASON = 'convergence_timeout';
      const FAILURE_BARRIER_PHASE_CONVERGENCE = 'convergence';
      const FAILURE_BARRIER_SIGNAL = 'failureBarrier=convergence';
      const FAILURE_BARRIER_REASON_SIGNAL =
        'failureBarrierReason=' + CONVERGENCE_TIMEOUT_REASON;
      const ROOT_CAUSE_CLASS_TOPOLOGY = 'topology';
      const READINESS_NODE_ID = 'seed-1';
      const READINESS_TIMEOUT_REASON =
        'readiness_probe_timeout_fallback=Node readiness probe timed out for ' +
        READINESS_NODE_ID;
      const STARTUP_SNAPSHOT_READY_REASON = 'startup_snapshot_ready';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_STATE_STEADY = 'steady_published';
      const PUBLICATION_EPOCH = 5;
      const SCENARIO_DURATION_MS = 100;
      const EMPTY_COUNT = 0;
      const writer = new ReportWriter(REPORT_PATH);
      writer.addResult(SCENARIO_NAME, {
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: CONVERGENCE_TIMEOUT_ERROR,
        details: {
          diagnostics: {
            failedPhase: {
              artifacts: {
                nodeReasonsByNodeId: {
                  [READINESS_NODE_ID]: [
                    READINESS_TIMEOUT_REASON,
                    STARTUP_SNAPSHOT_READY_REASON,
                  ],
                },
              },
            },
            controlPlaneDiagnostics: {
              publicationConvergence: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: EMPTY_COUNT,
                blockedNodeIds: [],
                blockedNodeCount: EMPTY_COUNT,
                publicationPending: false,
                prioritySpreadPending: false,
                publishedActiveNodeIds: [],
                recoveryProtocolState: RECOVERY_PROTOCOL_STATE_STEADY,
                priorityRecoveryReasonCodes: [],
                priorityRecoveryProgressClassCount: EMPTY_COUNT,
                priorityRecoverySemanticStateCount: EMPTY_COUNT,
                priorityRecoveryBlockedPartitionCount: EMPTY_COUNT,
                priorityRecoveryUnresolvedPartitionCount: EMPTY_COUNT,
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
        outputDir,
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
      assert.equal(
        failureClassification.rootCauseClass,
        ROOT_CAUSE_CLASS_TOPOLOGY,
      );
      assert.equal(
        failureClassification.dominantReason,
        CONVERGENCE_TIMEOUT_REASON,
      );
      assert.ok(
        failureClassification.signals.includes(FAILURE_BARRIER_SIGNAL),
      );
      assert.ok(
        failureClassification.signals.includes(FAILURE_BARRIER_REASON_SIGNAL),
      );
      assert.notEqual(
        failureClassification.failureClass,
        FAILURE_CLASS_STARTUP_RECOVERY_BLOCKED,
      );
      assert.equal(
        scenarioBundle.diagnostics.failure.failureBarrier.phase,
        FAILURE_BARRIER_PHASE_CONVERGENCE,
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.convergence.status,
        'closed',
      );
    });

  it('classifies final observer revision lag as cache stale',
    async () => {
      refreshState();
      const REPORT_PATH = join(tempDir, 'observer-revision-lag-report.json');
      const SCENARIO_NAME = 'rolling-restart';
      const OBSERVER_REVISION_LAG_ERROR =
        'Observer snapshot revisions lag for final consistency';
      const OBSERVER_REVISION_LAG_REASON =
        'observer_snapshot_revision_lag';
      const OBSERVER_REVISION_LAG_STATE = 'observer_revision_lag';
      const SCENARIO_DURATION_MS = 100;
      const writer = new ReportWriter(REPORT_PATH);
      writer.addResult(SCENARIO_NAME, {
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: OBSERVER_REVISION_LAG_ERROR,
        details: {
          diagnostics: {
            controlPlaneDiagnostics: {
              finalConsistency: {
                state: OBSERVER_REVISION_LAG_STATE,
                reasonCode: OBSERVER_REVISION_LAG_REASON,
              },
              mismatch: {
                reasonCode: OBSERVER_REVISION_LAG_REASON,
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
        outputDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );

      assert.equal(
        scenarioBundle.summary.failureClassification.failureClass,
        FAILURE_CLASS_CACHE_STALE,
      );
      assert.equal(
        scenarioBundle.summary.failureClassification.dominantReason,
        OBSERVER_REVISION_LAG_REASON,
      );
    });

  it('classifies final authority visibility lag as cache stale',
    async () => {
      refreshState();
      const REPORT_PATH = join(tempDir, 'authority-visibility-lag-report.json');
      const SCENARIO_NAME = 'rolling-restart';
      const AUTHORITY_VISIBILITY_LAG_ERROR =
        'Partition leader authority mismatch for p1';
      const AUTHORITY_VISIBILITY_LAG_REASON =
        'observer_authority_visibility_lag';
      const AUTHORITY_VISIBILITY_LAG_STATE =
        'observer_authority_visibility_lag';
      const SCENARIO_DURATION_MS = 100;
      const writer = new ReportWriter(REPORT_PATH);
      writer.addResult(SCENARIO_NAME, {
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: AUTHORITY_VISIBILITY_LAG_ERROR,
        details: {
          diagnostics: {
            controlPlaneDiagnostics: {
              finalConsistency: {
                state: AUTHORITY_VISIBILITY_LAG_STATE,
                reasonCode: AUTHORITY_VISIBILITY_LAG_REASON,
              },
              mismatch: {
                reasonCode: AUTHORITY_VISIBILITY_LAG_REASON,
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
        outputDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );

      assert.equal(
        scenarioBundle.summary.failureClassification.failureClass,
        FAILURE_CLASS_CACHE_STALE,
      );
      assert.equal(
        scenarioBundle.summary.failureClassification.dominantReason,
        AUTHORITY_VISIBILITY_LAG_REASON,
      );
    });

  it('classifies final CDC visibility lag from structured diagnostics',
    async () => {
      refreshState();
      const REPORT_PATH = join(tempDir, 'final-cdc-lag-report.json');
      const SCENARIO_NAME = 'rolling-restart';
      const CDC_VISIBILITY_LAG_REASON = 'cdc_visibility_lag';
      const SCENARIO_DURATION_MS = 100;
      const writer = new ReportWriter(REPORT_PATH);
      writer.addResult(SCENARIO_NAME, {
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: 'final consistency cdc visibility lag',
        details: {
          diagnostics: {
            controlPlaneDiagnostics: {
              finalConsistency: {
                state: CDC_VISIBILITY_LAG_REASON,
                reasonCode: CDC_VISIBILITY_LAG_REASON,
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
        outputDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );

      assert.equal(
        scenarioBundle.summary.failureClassification.failureClass,
        FAILURE_CLASS_CDC_DEGRADED,
      );
      assert.equal(
        scenarioBundle.summary.failureClassification.dominantReason,
        CDC_VISIBILITY_LAG_REASON,
      );
    });

  it('does not use legacy leader-message inference when structured final state is unknown',
    async () => {
      refreshState();
      const REPORT_PATH = join(tempDir, 'unknown-final-state-report.json');
      const SCENARIO_NAME = 'rolling-restart';
      const UNKNOWN_FINAL_STATE = 'unknown_final_consistency_state';
      const SCENARIO_DURATION_MS = 100;
      const writer = new ReportWriter(REPORT_PATH);
      writer.addResult(SCENARIO_NAME, {
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: 'Leader identities disagree for p1',
        details: {
          diagnostics: {
            controlPlaneDiagnostics: {
              finalConsistency: {
                state: UNKNOWN_FINAL_STATE,
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
        outputDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );

      assert.equal(
        scenarioBundle.summary.failureClassification.failureClass,
        FAILURE_CLASS_UNKNOWN,
      );
      assert.equal(
        scenarioBundle.summary.failureClassification.dominantReason,
        UNKNOWN_FINAL_STATE,
      );
    });

  it('keeps legacy leader-message compatibility without structured diagnostics',
    async () => {
      refreshState();
      const REPORT_PATH = join(tempDir, 'legacy-leader-message-report.json');
      const SCENARIO_NAME = 'rolling-restart';
      const LEGACY_LEADER_REASON = 'leader_identities_disagree';
      const SCENARIO_DURATION_MS = 100;
      const writer = new ReportWriter(REPORT_PATH);
      writer.addResult(SCENARIO_NAME, {
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: 'Leader identities disagree for p1',
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: REPORT_PATH,
        outputDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );

      assert.equal(
        scenarioBundle.summary.failureClassification.failureClass,
        FAILURE_CLASS_TOPOLOGY_UNSTABLE,
      );
      assert.equal(
        scenarioBundle.summary.failureClassification.dominantReason,
        LEGACY_LEADER_REASON,
      );
    });

  it('includes bottleneck estimates in scenario failure bundle summaries',
    async () => {
      refreshState();
      const reportPath = join(tempDir, 'report.json');
      const writer = new ReportWriter(reportPath);
      writer.addResult('postgres-baseline-comparison', {
        passed: false,
        duration: 100,
        error: 'load failed',
        loadMetrics: {
          total: 400,
          success: 380,
          failed: 20,
          errors: 20,
          attemptErrors: 120,
          latency: {avg: 12, p50: 10, p95: 14, p99: 18},
          queueDelay: {avg: 80, p50: 60, p95: 900, p99: 1200, max: 1400},
          opsPerSec: 20,
          targetOperations: 1000,
          dispatchedOperations: 400,
          undispatchedOperations: 600,
          waitReasons: {
            nodeSlotUnavailable: 20,
            nodeAdmissionBlocked: 5,
            retryableControlPlanePressure: 4,
            timeoutWaits: 3,
            queueCapacityRejected: 0,
          },
        },
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: 'load',
              dominantReason: 'dispatch_backlog',
              reasonCounts: {
                dispatch_backlog: 1,
              },
              affectedNodeIds: [],
            },
            failedPhase: {
              phase: 'load',
              errors: [],
              artifacts: {},
            },
          },
        },
      });
      await writer.write();
      const report = JSON.parse(await readFile(reportPath, UTF8_ENCODING));

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: report.scenarios,
        reportOutputPath: reportPath,
        outputDir: tempDir,
        reportSummary: report.summary,
        standardSummary: report.standardSummary,
        benchmarkRegressionGate: report.benchmarkRegressionGate,
        workspaceRoot: tempDir,
      });
      assert.equal(scenarioBundles.length, 1);

      const bundlePath = resolve(tempDir, scenarioBundles[0].links.jsonPath);
      const scenarioBundle = JSON.parse(await readFile(bundlePath, UTF8_ENCODING));
      assert.deepEqual(scenarioBundle.summary.bottleneckEstimate, {
        kind: 'dispatch_queue_backlog',
        primaryEvidence: {
          undispatchedOperations: 600,
          undispatchedRatio: 0.6,
          queueDelayP95Ms: 900,
        },
        likelyWaitingTimeSource: 'dispatch_queue',
      });
    });
}
