import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {writeFailureBundlesForReport} from '../failure-bundle.js';
import {FAILURE_BUNDLE_FOUNDATION} from '../failure-bundle-foundation.js';

const {
  FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
  FAILURE_CLASS_STARTUP_RECOVERY_BLOCKED,
  ROOT_CAUSE_CLASS_STARTUP,
  ROOT_CAUSE_CLASS_TOPOLOGY,
} = FAILURE_BUNDLE_FOUNDATION;

export function registerFailureBundlePublicationClosureTailTests({
  it,
  assert,
  UTF8_ENCODING,
  state,
}) {
  it(
    'classifies current selected publication-membership deficit ahead of stale startup closure',
    async () => {
      const SCENARIO_NAME = 'rolling-restart';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING =
        'priority_spread_pending';
      const ACTIVE_GATE_MODE_STARTUP = 'startup';
      const ACTIVE_GATE_STATE_TIMED_OUT = 'timed_out';
      const ACTIVE_GATE_TERMINAL_REASON = 'stalled_no_progress';
      const ACTIVE_GATE_COVERAGE_BLOCKER = 'snapshot_coverage=4/5';
      const ACTIVE_GATE_READINESS_CLASS = 'snapshot_timeout';
      const ACTIVE_GATE_READINESS_SOURCE = 'selectedSnapshotError';
      const ACTIVE_GATE_READINESS_RECOVERABILITY = 'terminal';
      const CLOSURE_RECORD_ID = 'CL-003';
      const CLOSURE_WITNESS_CLASS =
        'publication_converged_priority_spread_pending';
      const PUBLICATION_EPOCH = 3;
      const EXPECTED_NODE_COUNT = 5;
      const ACTIVE_NODE_COUNT = 5;
      const SNAPSHOT_COVERAGE_COUNT = 4;
      const ATTEMPT_COUNT = 10;
      const ATTEMPTS_SINCE_PROGRESS = 4;
      const ELAPSED_MS = 124148;
      const ZERO_COUNT = 0;
      const ONE_COUNT = 1;
      const PRIORITY_SPREAD_GAP = 10;
      const FAILURE_REASON = 'BOOTSTRAP_PHASE_INCOMPLETE';
      const PUBLISHED_NODE_IDS = [
        'selected-published-node-1',
        'selected-published-node-2',
        'selected-published-node-3',
      ];
      const MISSING_NODE_IDS = [
        'selected-missing-node-current-1',
        'selected-missing-node-current-2',
      ];
      const SELECTED_SNAPSHOT_NODE_ID = MISSING_NODE_IDS[ZERO_COUNT];
      const PER_NODE_PUBLICATION_DISAGREEMENT_SET = {
        'selected-published-node-1': MISSING_NODE_IDS,
        'selected-published-node-2': MISSING_NODE_IDS,
        'selected-published-node-3': MISSING_NODE_IDS,
        'selected-missing-node-current-1': MISSING_NODE_IDS,
        'selected-missing-node-current-2': MISSING_NODE_IDS,
      };
      const scenarios = [{
        scenario: SCENARIO_NAME,
        passed: false,
        error: 'Not all nodes reached ACTIVE state within 120000ms',
        duration: ELAPSED_MS,
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: ROOT_CAUSE_CLASS_STARTUP,
              dominantReason: FAILURE_REASON,
              reasonCounts: {
                [FAILURE_REASON]: ONE_COUNT,
              },
            },
            controlPlaneDiagnostics: {
              publicationConvergence: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: ZERO_COUNT,
                missingPublishedNodeIds: [],
                missingPublishedCount: ZERO_COUNT,
                publicationPending: false,
                prioritySpreadPending: false,
                recoveryProtocolState: 'steady_published',
                closureRecordId: CLOSURE_RECORD_ID,
                closureWitnessClass: CLOSURE_WITNESS_CLASS,
              },
              activeGate: {
                mode: ACTIVE_GATE_MODE_STARTUP,
                state: ACTIVE_GATE_STATE_TIMED_OUT,
                ready: false,
                attempts: ATTEMPT_COUNT,
                elapsedMs: ELAPSED_MS,
                attemptsSinceProgress: ATTEMPTS_SINCE_PROGRESS,
                coordinatorCyclesSinceProgress: ATTEMPTS_SINCE_PROGRESS,
                closureRecordId: CLOSURE_RECORD_ID,
                closureWitnessClass: CLOSURE_WITNESS_CLASS,
                reasonCode: ACTIVE_GATE_TERMINAL_REASON,
                readinessDelay: {
                  timedOut: true,
                  cause: ACTIVE_GATE_READINESS_CLASS,
                  source: ACTIVE_GATE_READINESS_SOURCE,
                  recoverability: ACTIVE_GATE_READINESS_RECOVERABILITY,
                  error:
                    'Admin API query timed out for ' + SELECTED_SNAPSHOT_NODE_ID,
                },
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
                  selectedSnapshotAdminReady: true,
                  selectedSnapshotReachableBy: 'admin_health',
                  selectedPublishedActiveNodeIds: PUBLISHED_NODE_IDS,
                  selectedPublishedActiveCount: PUBLISHED_NODE_IDS.length,
                  selectedMissingPublishedNodeIds: [],
                  pendingAckCount: ZERO_COUNT,
                  missingPublishedCount: ZERO_COUNT,
                  perNodePublicationDisagreementSet:
                    PER_NODE_PUBLICATION_DISAGREEMENT_SET,
                  gateReasons: [],
                  prioritySpreadSatisfied: false,
                  prioritySpreadGap: PRIORITY_SPREAD_GAP,
                  priorityBlockedPartitionCount: ONE_COUNT,
                  blockers: [ACTIVE_GATE_COVERAGE_BLOCKER],
                },
              },
            },
          },
        },
      }];

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios,
        reportOutputPath: state.reportPath,
        outputDir: state.tempDir,
        reportSummary: {total: ONE_COUNT, fail: ONE_COUNT, pass: ZERO_COUNT},
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
        scenarioBundle.publicationConvergence.missingPublishedCount,
        MISSING_NODE_IDS.length,
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence.missingPublishedNodeIds,
        MISSING_NODE_IDS,
      );
      assert.equal(
        scenarioBundle.summary.failureClassification.failureClass,
        FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
      );
      assert.equal(
        scenarioBundle.summary.failureClassification.rootCauseClass,
        ROOT_CAUSE_CLASS_TOPOLOGY,
      );
      assert.equal(
        scenarioBundle.summary.failureClassification.dominantReason,
        'publication_missing_active_node=' + MISSING_NODE_IDS[ZERO_COUNT],
      );
    },
  );

  it(
    'classifies closed publication startup active-gate coverage as startup readiness',
    async () => {
      const SCENARIO_NAME = 'rolling-restart';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_STEADY_PUBLISHED = 'steady_published';
      const ACTIVE_GATE_MODE_STARTUP = 'startup';
      const ACTIVE_GATE_STATE_TIMED_OUT = 'timed_out';
      const ACTIVE_GATE_TERMINAL_REASON = 'stalled_no_progress';
      const ACTIVE_GATE_COVERAGE_BLOCKER = 'snapshot_coverage=2/5';
      const ACTIVE_GATE_INACTIVE_BLOCKER = 'inactive_nodes=2';
      const CLOSURE_RECORD_ID = 'CL-003';
      const CLOSURE_WITNESS_CLASS =
        'publication_converged_priority_spread_pending';
      const PUBLICATION_EPOCH = 2;
      const EXPECTED_NODE_COUNT = 5;
      const ACTIVE_NODE_COUNT = 3;
      const INACTIVE_NODE_COUNT = 2;
      const SNAPSHOT_COVERAGE_COUNT = 2;
      const NO_PROGRESS_ATTEMPT_COUNT = 12;
      const ATTEMPTS_SINCE_PROGRESS = 6;
      const ELAPSED_MS = 125088;
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
              dominantReason: 'BOOTSTRAP_PHASE_INCOMPLETE',
              reasonCounts: {
                BOOTSTRAP_PHASE_INCOMPLETE: ONE_COUNT,
              },
            },
            controlPlaneDiagnostics: {
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
                closureRecordId: CLOSURE_RECORD_ID,
                closureWitnessClass: CLOSURE_WITNESS_CLASS,
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
                progress: {
                  expectedNodeCount: EXPECTED_NODE_COUNT,
                  activeNodeCount: ACTIVE_NODE_COUNT,
                  inactiveNodeCount: INACTIVE_NODE_COUNT,
                  snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_COUNT,
                  snapshotCoverageComplete: false,
                  publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                  publicationEpoch: PUBLICATION_EPOCH,
                  recoveryProtocolState: RECOVERY_PROTOCOL_STEADY_PUBLISHED,
                  selectedMissingPublishedNodeIds: [],
                  pendingAckCount: ZERO_COUNT,
                  missingPublishedCount: ZERO_COUNT,
                  gateReasons: [],
                  prioritySpreadSatisfied: true,
                  prioritySpreadGap: ZERO_COUNT,
                  priorityBlockedPartitionCount: ZERO_COUNT,
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
        reportOutputPath: state.reportPath,
        outputDir: state.tempDir,
        reportSummary: {total: ONE_COUNT, fail: ONE_COUNT, pass: ZERO_COUNT},
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
      const failureClassification =
        scenarioBundle.summary.failureClassification;

      assert.equal(
        scenarioBundle.publicationConvergence.missingPublishedCount,
        ZERO_COUNT,
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence.publicationConvergenceGateReasons,
        [ACTIVE_GATE_COVERAGE_BLOCKER],
      );
      assert.equal(
        failureClassification.failureClass,
        FAILURE_CLASS_STARTUP_RECOVERY_BLOCKED,
      );
      assert.notEqual(
        failureClassification.failureClass,
        FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
      );
      assert.equal(
        failureClassification.dominantReason,
        'BOOTSTRAP_PHASE_INCOMPLETE',
      );
    },
  );

  const STARTUP_GUIDANCE_TIMEOUT_TEST_NAME =
    'prefers startup readiness guidance over timeout guidance when timeout is only terminal observation debt';
  it(
    STARTUP_GUIDANCE_TIMEOUT_TEST_NAME,
    async () => {
      const SCENARIO_NAME = 'rolling-restart';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_STEADY_PUBLISHED = 'steady_published';
      const ACTIVE_GATE_MODE_STARTUP = 'startup';
      const ACTIVE_GATE_STATE_TIMED_OUT = 'timed_out';
      const ACTIVE_GATE_TERMINAL_REASON = 'stalled_no_progress';
      const ACTIVE_GATE_INACTIVE_BLOCKER = 'inactive_nodes=3';
      const ACTIVE_GATE_COVERAGE_BLOCKER = 'snapshot_coverage=2/5';
      const ACTIVE_GATE_TERMINAL_COVERAGE_BLOCKER = 'snapshot_coverage=0/5';
      const ACTIVE_GATE_SNAPSHOT_ERROR_BLOCKER = 'snapshot_error';
      const ACTIVE_GATE_READINESS_CLASS = 'snapshot_timeout';
      const ACTIVE_GATE_READINESS_SOURCE = 'selectedSnapshotError';
      const ACTIVE_GATE_READINESS_RECOVERABILITY = 'terminal';
      const CLOSURE_RECORD_ID = 'CL-003';
      const CLOSURE_WITNESS_CLASS =
        'publication_converged_priority_spread_pending';
      const PUBLICATION_EPOCH = 4;
      const EXPECTED_NODE_COUNT = 5;
      const ACTIVE_NODE_COUNT = 2;
      const INACTIVE_NODE_COUNT = 3;
      const LAST_MEANINGFUL_COVERAGE_COUNT = 2;
      const CURRENT_COVERAGE_COUNT = 0;
      const NO_PROGRESS_ATTEMPT_COUNT = 12;
      const ATTEMPTS_SINCE_PROGRESS = 3;
      const ELAPSED_MS = 121722;
      const ZERO_COUNT = 0;
      const ONE_COUNT = 1;
      const BENCHMARK_REGRESSION_GATE_STATUS_SKIPPED = 'skipped';
      const STARTUP_DOMINANT_REASON = 'BOOTSTRAP_PHASE_INCOMPLETE';
      const STARTUP_FAILURE_ACTION =
        'Startup readiness is blocking convergence.';
      const STARTUP_OPERATOR_RECOMMENDATION =
        'Inspect inactive-node bootstrap readiness, SQL engine availability, ' +
        'leader metadata, and priority control-plane recovery before rerun.';
      const SNAPSHOT_TIMEOUT_ERROR =
        'Admin API query timed out for node selected-node on lane snapshot ' +
        'after 100ms; fallback lane default failed';
      const activeGateProgress = {
        expectedNodeCount: EXPECTED_NODE_COUNT,
        activeNodeCount: ACTIVE_NODE_COUNT,
        inactiveNodeCount: INACTIVE_NODE_COUNT,
        snapshotCoverageNodeCount: LAST_MEANINGFUL_COVERAGE_COUNT,
        snapshotCoverageComplete: false,
        publicationStatus: PUBLICATION_STATUS_PUBLISHED,
        publicationEpoch: PUBLICATION_EPOCH,
        recoveryProtocolState: RECOVERY_PROTOCOL_STEADY_PUBLISHED,
        selectedSnapshotNodeId: 'selected-node',
        pendingAckCount: ZERO_COUNT,
        missingPublishedCount: ZERO_COUNT,
        gateReasons: [],
        prioritySpreadSatisfied: true,
        prioritySpreadGap: ZERO_COUNT,
        priorityBlockedPartitionCount: ZERO_COUNT,
        blockers: [
          ACTIVE_GATE_INACTIVE_BLOCKER,
          ACTIVE_GATE_COVERAGE_BLOCKER,
        ],
      };
      const activeGateReadinessSnapshot = {
        mode: ACTIVE_GATE_MODE_STARTUP,
        reasonCode: ACTIVE_GATE_TERMINAL_REASON,
        attemptsSinceProgress: ATTEMPTS_SINCE_PROGRESS,
        readinessFailure: {
          mode: ACTIVE_GATE_MODE_STARTUP,
          classCode: ACTIVE_GATE_READINESS_CLASS,
          recoverability: ACTIVE_GATE_READINESS_RECOVERABILITY,
          progressSignal: {
            attemptsSinceProgress: ATTEMPTS_SINCE_PROGRESS,
            maxAttempts: null,
            stalled: false,
          },
          terminalReason: ACTIVE_GATE_TERMINAL_REASON,
          source: ACTIVE_GATE_READINESS_SOURCE,
          cause: ACTIVE_GATE_READINESS_CLASS,
          error: SNAPSHOT_TIMEOUT_ERROR,
        },
        progress: {
          expectedNodeCount: EXPECTED_NODE_COUNT,
          activeNodeCount: ACTIVE_NODE_COUNT,
          inactiveNodeCount: INACTIVE_NODE_COUNT,
          snapshotCoverageNodeCount: CURRENT_COVERAGE_COUNT,
          snapshotCoverageComplete: false,
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          publicationEpoch: PUBLICATION_EPOCH,
          recoveryProtocolState: RECOVERY_PROTOCOL_STEADY_PUBLISHED,
          selectedSnapshotNodeId: 'selected-node',
          selectedSnapshotAdminReady: true,
          selectedSnapshotReachableBy: 'admin_health',
          selectedSnapshotError: SNAPSHOT_TIMEOUT_ERROR,
          pendingAckCount: ZERO_COUNT,
          missingPublishedCount: ZERO_COUNT,
          gateReasons: [],
          prioritySpreadSatisfied: true,
          prioritySpreadGap: ZERO_COUNT,
          priorityBlockedPartitionCount: ZERO_COUNT,
          readinessDelay: {
            timedOut: true,
            cause: ACTIVE_GATE_READINESS_CLASS,
            source: ACTIVE_GATE_READINESS_SOURCE,
            recoverability: ACTIVE_GATE_READINESS_RECOVERABILITY,
            error: SNAPSHOT_TIMEOUT_ERROR,
          },
          blockers: [
            ACTIVE_GATE_INACTIVE_BLOCKER,
            ACTIVE_GATE_TERMINAL_COVERAGE_BLOCKER,
            ACTIVE_GATE_SNAPSHOT_ERROR_BLOCKER,
          ],
        },
        lastMeaningfulProgress: activeGateProgress,
      };
      const activeGate = {
        ...activeGateReadinessSnapshot,
        state: ACTIVE_GATE_STATE_TIMED_OUT,
        ready: false,
        attempts: NO_PROGRESS_ATTEMPT_COUNT,
        elapsedMs: ELAPSED_MS,
        attemptsSinceProgress: ATTEMPTS_SINCE_PROGRESS,
        coordinatorCyclesSinceProgress: ATTEMPTS_SINCE_PROGRESS,
        closureRecordId: CLOSURE_RECORD_ID,
        closureWitnessClass: CLOSURE_WITNESS_CLASS,
        reasonCode: ACTIVE_GATE_TERMINAL_REASON,
        readinessFailure: activeGateReadinessSnapshot.readinessFailure,
        readinessDelay: {
          timedOut: true,
          cause: ACTIVE_GATE_READINESS_CLASS,
          source: ACTIVE_GATE_READINESS_SOURCE,
          recoverability: ACTIVE_GATE_READINESS_RECOVERABILITY,
          error: SNAPSHOT_TIMEOUT_ERROR,
        },
        progress: activeGateProgress,
        bestProgress: activeGateProgress,
        lastMeaningfulProgress: activeGateProgress,
      };
      const scenarios = [{
        scenario: SCENARIO_NAME,
        passed: false,
        error: 'Not all nodes reached ACTIVE state within 120000ms',
        duration: ELAPSED_MS,
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: ROOT_CAUSE_CLASS_STARTUP,
              dominantReason: STARTUP_DOMINANT_REASON,
              reasonCounts: {
                [STARTUP_DOMINANT_REASON]: ONE_COUNT,
                SQL_ENGINE_UNAVAILABLE: ONE_COUNT,
              },
            },
            controlPlaneDiagnostics: {
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
                closureRecordId: CLOSURE_RECORD_ID,
                closureWitnessClass: CLOSURE_WITNESS_CLASS,
              },
            },
            activeGate,
          },
        },
      }];

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios,
        reportOutputPath: state.reportPath,
        outputDir: state.tempDir,
        reportSummary: {total: ONE_COUNT, fail: ONE_COUNT, pass: ZERO_COUNT},
        standardSummary: {scenarios: []},
        benchmarkRegressionGate: {
          status: BENCHMARK_REGRESSION_GATE_STATUS_SKIPPED,
        },
        workspaceRoot: state.tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(state.tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );

      assert.equal(
        scenarioBundle.summary.failureClassification.failureClass,
        FAILURE_CLASS_STARTUP_RECOVERY_BLOCKED,
      );
      assert.equal(
        scenarioBundle.summary.failureClassification.dominantReason,
        STARTUP_DOMINANT_REASON,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.activeGate.readinessFailure
          ?.classCode,
        ACTIVE_GATE_READINESS_CLASS,
      );
      assert.equal(
        scenarioBundle.summary.failureAction,
        STARTUP_FAILURE_ACTION,
      );
      assert.equal(
        scenarioBundle.summary.operatorRecommendation,
        STARTUP_OPERATOR_RECOMMENDATION,
      );
    },
  );
}
