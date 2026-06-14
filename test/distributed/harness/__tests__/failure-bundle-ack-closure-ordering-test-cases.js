import {registerFailureBundleWorkflowBlockerCarrierDominanceTests} from './failure-bundle-workflow-blocker-carrier-dominance-test-cases.js';

export function registerFailureBundleAckClosureOrderingTests(context) {
  const {
    it,
    assert,
    CONTROL_PLANE_READINESS_REASON,
    FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
    PRIORITY_RECOVERY_ACTUATION_STATE,
    PRIORITY_RECOVERY_BLOCKER_REASON,
    PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
    PRIORITY_RECOVERY_PROGRESS_OWNER,
    PRIORITY_RECOVERY_SEMANTIC_STATE,
    PRIORITY_RECOVERY_WAIT_MODE,
    readFile,
    resolve,
    ROOT_CAUSE_CLASS_STARTUP,
    ROOT_CAUSE_CLASS_TOPOLOGY,
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
  const ACK_CLOSURE_TEST_NAME =
    'keeps current active-gate ACK closure ahead of stale best-progress debt';
  const NEWER_BEST_PROGRESS_ACK_CLOSURE_TEST_NAME =
    'keeps newer best-progress ACK closure ahead of stale current active-gate debt';
  const DIRECT_PENDING_ACK_PUBLICATION_TEST_NAME =
    'keeps direct ACK-pending publication blockers canonical over missing-published startup support';
  const OPEN_PUBLISHING_STALE_ACK_COUNT_TEST_NAME =
    'trusts open publishing gate normalization for stale ACK count-only evidence';

  it(
    DIRECT_PENDING_ACK_PUBLICATION_TEST_NAME,
    async () => {
      refreshState();
      const SCENARIO_NAME = 'rolling-restart';
      const PUBLICATION_STATUS_ACK_PENDING = 'ACK_PENDING';
      const RECOVERY_PROTOCOL_PUBLICATION_PENDING = 'publication_pending';
      const PRIORITY_SPREAD_REASON = 'priority_partitions_not_spread';
      const GENERIC_PUBLICATION_REASON =
        CONTROL_PLANE_READINESS_REASON.PUBLICATION_EPOCH_PENDING;
      const ACTIVE_GATE_MODE_STARTUP = 'startup';
      const ACTIVE_GATE_STATE_TIMED_OUT = 'timed_out';
      const ACTIVE_GATE_TERMINAL_REASON = 'stalled_no_progress';
      const SCENARIO_ERROR =
        'Restarted node did not become recovery-ready within 120000ms';
      const PENDING_ACK_BLOCKER_ALIAS = 'pending_acks_present';
      const PENDING_ACK_OWNER_REASON = 'pending_acks_present';
      const PUBLICATION_PENDING_OWNER_REASON = 'publication_pending';
      const OWNER_TOPOLOGY_PUBLICATION = 'topology_publication_owner';
      const BOUNDARY_PUBLICATION_CONVERGENCE = 'publication_convergence';
      const EDGE_PUBLICATION_ACK_CONVERGENCE =
        'publication_ack_convergence';
      const OWNER_CONTRACT_STATE_BLOCKED = 'blocked';
      const SNAPSHOT_COVERAGE_BLOCKER = 'snapshot_coverage=2/5';
      const INACTIVE_NODE_BLOCKER = 'inactive_nodes=4';
      const ACK_PENDING_NODE_ID = 'ack-pending-node';
      const MISSING_NODE_ONE = 'missing-published-node-1';
      const MISSING_NODE_TWO = 'missing-published-node-2';
      const PUBLISHED_NODE_ONE = 'published-node-1';
      const PUBLISHED_NODE_TWO = 'published-node-2';
      const PUBLISHED_NODE_THREE = 'published-node-3';
      const MISSING_NODE_REASON_ONE =
        STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE +
        '=' + MISSING_NODE_ONE;
      const MISSING_NODE_REASON_TWO =
        STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE +
        '=' + MISSING_NODE_TWO;
      const PUBLICATION_EPOCH = 5;
      const EXPECTED_NODE_COUNT = 5;
      const ACTIVE_NODE_COUNT = 1;
      const INACTIVE_NODE_COUNT = 4;
      const SNAPSHOT_COVERAGE_COUNT = 2;
      const PENDING_ACK_COUNT = 1;
      const MISSING_PUBLISHED_COUNT = 2;
      const ONE_COUNT = 1;
      const TWO_COUNT = 2;
      const ZERO_COUNT = 0;
      const BENCHMARK_GATE_STATUS_SKIPPED = 'skipped';
      const scenarios = [{
        scenario: SCENARIO_NAME,
        passed: false,
        error: SCENARIO_ERROR,
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: ROOT_CAUSE_CLASS_STARTUP,
              dominantReason: MISSING_NODE_REASON_ONE,
              reasonCounts: {
                [MISSING_NODE_REASON_ONE]: PENDING_ACK_COUNT,
                [MISSING_NODE_REASON_TWO]: PENDING_ACK_COUNT,
                [GENERIC_PUBLICATION_REASON]: PENDING_ACK_COUNT,
                [PRIORITY_SPREAD_REASON]: PENDING_ACK_COUNT,
              },
            },
            controlPlaneDiagnostics: {
              hasExplicitPriorityRecoveryObservation: true,
              publicationConvergence: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_ACK_PENDING,
                pendingAckNodeIds: [ACK_PENDING_NODE_ID],
                pendingAckCount: PENDING_ACK_COUNT,
                blockedNodeIds: [],
                blockedNodeCount: ZERO_COUNT,
                missingPublishedNodeIds: [MISSING_NODE_ONE, MISSING_NODE_TWO],
                missingPublishedCount: MISSING_PUBLISHED_COUNT,
                publicationPending: true,
                prioritySpreadPending: false,
                recoveryProtocolState: RECOVERY_PROTOCOL_PUBLICATION_PENDING,
                priorityRecoveryReasonCodes: [
                  GENERIC_PUBLICATION_REASON,
                ],
                publicationRecoveryGate: {
                  ready: false,
                  publicationEpoch: PUBLICATION_EPOCH,
                  publicationStatus: PUBLICATION_STATUS_ACK_PENDING,
                  pendingAckNodeIds: [ACK_PENDING_NODE_ID],
                  pendingAckCount: PENDING_ACK_COUNT,
                  missingPublishedNodeIds: [
                    MISSING_NODE_ONE,
                    MISSING_NODE_TWO,
                  ],
                  missingPublishedCount: MISSING_PUBLISHED_COUNT,
                  publicationPending: true,
                  prioritySpreadPending: false,
                  recoveryProtocolState: RECOVERY_PROTOCOL_PUBLICATION_PENDING,
                  reasons: [
                    GENERIC_PUBLICATION_REASON,
                    MISSING_NODE_REASON_ONE,
                    MISSING_NODE_REASON_TWO,
                  ],
                  reasonCodes: [
                    GENERIC_PUBLICATION_REASON,
                    MISSING_NODE_REASON_ONE,
                    MISSING_NODE_REASON_TWO,
                  ],
                },
              },
              activeGate: {
                mode: ACTIVE_GATE_MODE_STARTUP,
                state: ACTIVE_GATE_STATE_TIMED_OUT,
                ready: false,
                reasonCode: ACTIVE_GATE_TERMINAL_REASON,
                progress: {
                  expectedNodeCount: EXPECTED_NODE_COUNT,
                  activeNodeCount: ACTIVE_NODE_COUNT,
                  inactiveNodeCount: INACTIVE_NODE_COUNT,
                  snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_COUNT,
                  snapshotCoverageComplete: false,
                  publicationStatus: PUBLICATION_STATUS_ACK_PENDING,
                  publicationEpoch: PUBLICATION_EPOCH,
                  recoveryProtocolState:
                    RECOVERY_PROTOCOL_PUBLICATION_PENDING,
                  selectedPublishedActiveNodeIds: [
                    ACK_PENDING_NODE_ID,
                    PUBLISHED_NODE_ONE,
                    PUBLISHED_NODE_TWO,
                    PUBLISHED_NODE_THREE,
                  ],
                  selectedPublishedActiveCount:
                    EXPECTED_NODE_COUNT - PENDING_ACK_COUNT,
                  selectedMissingPublishedNodeIds: [
                    MISSING_NODE_ONE,
                    MISSING_NODE_TWO,
                  ],
                  pendingAckNodeIds: [ACK_PENDING_NODE_ID],
                  pendingAckCount: PENDING_ACK_COUNT,
                  missingPublishedCount: MISSING_PUBLISHED_COUNT,
                  gateReasons: [],
                  prioritySpreadSatisfied: true,
                  prioritySpreadGap: ZERO_COUNT,
                  priorityBlockedPartitionCount: ZERO_COUNT,
                  blockers: [
                    INACTIVE_NODE_BLOCKER,
                    SNAPSHOT_COVERAGE_BLOCKER,
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
        benchmarkRegressionGate: {status: BENCHMARK_GATE_STATUS_SKIPPED},
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[ZERO_COUNT].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const publicationConvergence = scenarioBundle.publicationConvergence;
      const failureClassification =
        scenarioBundle.summary.failureClassification;

      assert.equal(
        publicationConvergence.pendingAckCount,
        PENDING_ACK_COUNT,
      );
      assert.deepEqual(
        publicationConvergence.pendingAckNodeIds,
        [ACK_PENDING_NODE_ID],
      );
      assert.equal(
        publicationConvergence.missingPublishedCount,
        MISSING_PUBLISHED_COUNT,
      );
      assert.deepEqual(
        publicationConvergence.missingPublishedNodeIds,
        [MISSING_NODE_ONE, MISSING_NODE_TWO],
      );
      assert.equal(
        failureClassification.dominantReason,
        PENDING_ACK_OWNER_REASON,
      );
      assert.equal(
        failureClassification.rootCauseClass,
        ROOT_CAUSE_CLASS_TOPOLOGY,
      );
      assert.equal(
        scenarioBundle.summary.rootCauseClass,
        ROOT_CAUSE_CLASS_TOPOLOGY,
      );
      assert.equal(
        scenarioBundle.diagnostics.failure.rootCauseClass,
        ROOT_CAUSE_CLASS_TOPOLOGY,
      );
      assert.equal(
        scenarioBundle.diagnostics.failure.failureBarrier.rootCauseClass,
        ROOT_CAUSE_CLASS_STARTUP,
      );
      assert.equal(
        scenarioBundle.diagnostics.failure.reasonCounts[
          PENDING_ACK_OWNER_REASON
        ],
        TWO_COUNT,
      );
      const ownerContract =
        scenarioBundle.diagnostics.failure.ownerContract;
      assert.equal(
        ownerContract.dominantWitness.edgeId,
        EDGE_PUBLICATION_ACK_CONVERGENCE,
      );
      assert.equal(
        ownerContract.dominantWitness.owner,
        OWNER_TOPOLOGY_PUBLICATION,
      );
      assert.equal(
        ownerContract.dominantWitness.boundary,
        BOUNDARY_PUBLICATION_CONVERGENCE,
      );
      assert.equal(
        ownerContract.dominantWitness.state,
        OWNER_CONTRACT_STATE_BLOCKED,
      );
      assert.equal(
        ownerContract.dominantWitness.dominantReason,
        PENDING_ACK_OWNER_REASON,
      );
      assert.deepEqual(
        ownerContract.dominantWitness.reasons,
        [PUBLICATION_PENDING_OWNER_REASON, PENDING_ACK_OWNER_REASON],
      );
      assert.equal(
        ownerContract.dominantWitness.source.pendingAckCount,
        PENDING_ACK_COUNT,
      );
      assert.equal(
        ownerContract.dominantWitness.source.pendingAckCount,
        publicationConvergence.pendingAckCount,
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.convergence.blockers.includes(
          PENDING_ACK_BLOCKER_ALIAS,
        ),
        true,
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.convergence.blockers.includes(
          STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE,
        ),
        true,
      );
      assert.ok(
        publicationConvergence.publicationConvergenceGateReasons.includes(
          MISSING_NODE_REASON_ONE,
        ),
      );
    },
  );

  it(
    NEWER_BEST_PROGRESS_ACK_CLOSURE_TEST_NAME,
    async () => {
      refreshState();
      const SCENARIO_NAME = 'rolling-restart';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_PUBLICATION_PENDING = 'publication_pending';
      const RECOVERY_PROTOCOL_STEADY_PUBLISHED = 'steady_published';
      const ACTIVE_GATE_MODE_STARTUP = 'startup';
      const ACTIVE_GATE_STATE_TIMED_OUT = 'timed_out';
      const ACTIVE_GATE_TERMINAL_REASON = 'stalled_no_progress';
      const PENDING_ACKS_PRESENT_REASON = 'pending_acks_present';
      const ACTIVE_GATE_SNAPSHOT_COVERAGE_EDGE_ID =
        'active_gate_snapshot_coverage';
      const ACTIVE_GATE_TIMED_OUT_REASON = 'active_gate_timed_out';
      const PUBLICATION_OWNER_STREAM_OUTCOME_STALE = 'stale';
      const PUBLICATION_OWNER_FRESHNESS_FENCE_CONSUMER_LAG =
        'consumer_lag';
      const PUBLICATION_OWNER_RECOVERY_OUTCOME_WAITING_FOR_CONSUMER =
        'waiting_for_consumer';
      const ACTIVE_GATE_COVERAGE_BLOCKER = 'snapshot_coverage=1/5';
      const BEST_PROGRESS_COVERAGE_BLOCKER = 'snapshot_coverage=2/5';
      const ACTIVE_GATE_INACTIVE_BLOCKER = 'inactive_nodes=2';
      const SEED_NODE_ID = 'seed-node';
      const ACK_CLOSED_NODE_ID = 'ack-closed-node';
      const CURRENT_STALE_NODE_ID = 'current-stale-node';
      const MISSING_NODE_ONE = 'missing-node-one';
      const MISSING_NODE_TWO = 'missing-node-two';
      const MISSING_NODE_THREE = 'missing-node-three';
      const STALE_PUBLICATION_EPOCH = 1;
      const CLOSED_PUBLICATION_EPOCH = 2;
      const EXPECTED_NODE_COUNT = 5;
      const ACTIVE_NODE_COUNT = 3;
      const INACTIVE_NODE_COUNT = 2;
      const STALE_SNAPSHOT_COVERAGE_COUNT = 1;
      const CLOSED_SNAPSHOT_COVERAGE_COUNT = 2;
      const STALE_PENDING_ACK_COUNT = 1;
      const ZERO_COUNT = 0;
      const ONE_COUNT = 1;
      const BENCHMARK_GATE_STATUS_SKIPPED = 'skipped';
      const scenarios = [{
        scenario: SCENARIO_NAME,
        passed: false,
        error: 'Not all nodes reached ACTIVE state within 120000ms',
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: ROOT_CAUSE_CLASS_TOPOLOGY,
              dominantReason: PENDING_ACKS_PRESENT_REASON,
              reasonCounts: {
                [PENDING_ACKS_PRESENT_REASON]: ONE_COUNT,
              },
            },
            controlPlaneDiagnostics: {
              publicationConvergence: {
                publicationEpoch: STALE_PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: STALE_PENDING_ACK_COUNT,
                missingPublishedNodeIds: [
                  ACK_CLOSED_NODE_ID,
                  CURRENT_STALE_NODE_ID,
                  MISSING_NODE_ONE,
                  MISSING_NODE_TWO,
                ],
                missingPublishedCount: EXPECTED_NODE_COUNT - ONE_COUNT,
                publicationPending: true,
                prioritySpreadPending: false,
                recoveryProtocolState:
                  RECOVERY_PROTOCOL_PUBLICATION_PENDING,
              },
              activeGate: {
                mode: ACTIVE_GATE_MODE_STARTUP,
                state: ACTIVE_GATE_STATE_TIMED_OUT,
                ready: false,
                reasonCode: ACTIVE_GATE_TERMINAL_REASON,
                progress: {
                  expectedNodeCount: EXPECTED_NODE_COUNT,
                  activeNodeCount: ACTIVE_NODE_COUNT,
                  inactiveNodeCount: INACTIVE_NODE_COUNT,
                  snapshotCoverageNodeCount: STALE_SNAPSHOT_COVERAGE_COUNT,
                  snapshotCoverageComplete: false,
                  publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                  publicationEpoch: STALE_PUBLICATION_EPOCH,
                  recoveryProtocolState:
                    RECOVERY_PROTOCOL_PUBLICATION_PENDING,
                  selectedPublishedActiveNodeIds: [SEED_NODE_ID],
                  selectedMissingPublishedNodeIds: [
                    ACK_CLOSED_NODE_ID,
                    CURRENT_STALE_NODE_ID,
                    MISSING_NODE_ONE,
                    MISSING_NODE_TWO,
                  ],
                  pendingAckCount: STALE_PENDING_ACK_COUNT,
                  missingPublishedCount: EXPECTED_NODE_COUNT - ONE_COUNT,
                  gateReasons: [],
                  prioritySpreadSatisfied: true,
                  prioritySpreadGap: ZERO_COUNT,
                  priorityBlockedPartitionCount: ZERO_COUNT,
                  blockers: [
                    ACTIVE_GATE_INACTIVE_BLOCKER,
                    ACTIVE_GATE_COVERAGE_BLOCKER,
                  ],
                },
                bestProgress: {
                  expectedNodeCount: EXPECTED_NODE_COUNT,
                  activeNodeCount: ACTIVE_NODE_COUNT,
                  inactiveNodeCount: INACTIVE_NODE_COUNT,
                  snapshotCoverageNodeCount: CLOSED_SNAPSHOT_COVERAGE_COUNT,
                  snapshotCoverageComplete: false,
                  publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                  publicationEpoch: CLOSED_PUBLICATION_EPOCH,
                  recoveryProtocolState:
                    RECOVERY_PROTOCOL_PUBLICATION_PENDING,
                  selectedPublishedActiveNodeIds: [
                    SEED_NODE_ID,
                    ACK_CLOSED_NODE_ID,
                  ],
                  selectedMissingPublishedNodeIds: [
                    CURRENT_STALE_NODE_ID,
                    MISSING_NODE_ONE,
                    MISSING_NODE_TWO,
                    MISSING_NODE_THREE,
                  ],
                  pendingAckNodeIds: [],
                  pendingAckCount: ZERO_COUNT,
                  missingPublishedCount: EXPECTED_NODE_COUNT -
                    CLOSED_SNAPSHOT_COVERAGE_COUNT,
                  gateReasons: [],
                  prioritySpreadSatisfied: true,
                  prioritySpreadGap: ZERO_COUNT,
                  priorityBlockedPartitionCount: ZERO_COUNT,
                  blockers: [
                    ACTIVE_GATE_INACTIVE_BLOCKER,
                    BEST_PROGRESS_COVERAGE_BLOCKER,
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
        benchmarkRegressionGate: {status: BENCHMARK_GATE_STATUS_SKIPPED},
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[ZERO_COUNT].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const publicationConvergence = scenarioBundle.publicationConvergence;
      const ownerContract =
        scenarioBundle.diagnostics.failure.ownerContract;

      assert.equal(
        publicationConvergence.publicationEpoch,
        CLOSED_PUBLICATION_EPOCH,
      );
      assert.equal(publicationConvergence.pendingAckCount, ZERO_COUNT);
      assert.deepEqual(publicationConvergence.pendingAckNodeIds, []);
      assert.equal(publicationConvergence.publicationPending, false);
      assert.equal(
        publicationConvergence.recoveryProtocolState,
        RECOVERY_PROTOCOL_STEADY_PUBLISHED,
      );
      assert.equal(
        publicationConvergence.streamOutcome,
        PUBLICATION_OWNER_STREAM_OUTCOME_STALE,
      );
      assert.equal(
        publicationConvergence.freshnessFence,
        PUBLICATION_OWNER_FRESHNESS_FENCE_CONSUMER_LAG,
      );
      assert.equal(
        publicationConvergence.recoveryOutcome,
        PUBLICATION_OWNER_RECOVERY_OUTCOME_WAITING_FOR_CONSUMER,
      );
      assert.equal(
        ownerContract.dominantWitness.edgeId,
        ACTIVE_GATE_SNAPSHOT_COVERAGE_EDGE_ID,
      );
      assert.equal(
        ownerContract.dominantWitness.dominantReason,
        ACTIVE_GATE_TIMED_OUT_REASON,
      );
      assert.equal(
        scenarioBundle.diagnostics.failure.reasonCounts[
          PENDING_ACKS_PRESENT_REASON
        ],
        undefined,
      );
    },
  );

  it(
    OPEN_PUBLISHING_STALE_ACK_COUNT_TEST_NAME,
    async () => {
      refreshState();
      const SCENARIO_NAME = 'rolling-restart';
      const PUBLICATION_STATUS_OPEN = 'OPEN';
      const RECOVERY_PROTOCOL_PUBLICATION_PENDING = 'publication_pending';
      const ACTIVE_GATE_MODE_STARTUP = 'startup';
      const ACTIVE_GATE_STATE_TIMED_OUT = 'timed_out';
      const ACTIVE_GATE_TERMINAL_REASON = 'stalled_no_progress';
      const PENDING_ACKS_PRESENT_REASON = 'pending_acks_present';
      const PUBLICATION_PENDING_OWNER_REASON = 'publication_pending';
      const EDGE_PUBLICATION_ACK_CONVERGENCE =
        'publication_ack_convergence';
      const PUBLICATION_OWNER_STREAM_OUTCOME_PUBLISHING = 'publishing';
      const PUBLICATION_OWNER_ACK_STATE_UNAVAILABLE = 'unavailable';
      const PUBLICATION_OWNER_FRESHNESS_FENCE_PUBLISHING = 'publishing';
      const PUBLICATION_OWNER_RECOVERY_WAITING_FOR_PUBLICATION =
        'waiting_for_publication';
      const ACTIVE_GATE_COVERAGE_BLOCKER = 'snapshot_coverage=2/5';
      const ACTIVE_GATE_INACTIVE_BLOCKER = 'inactive_nodes=3';
      const PUBLICATION_EPOCH = 7;
      const EXPECTED_NODE_COUNT = 5;
      const ACTIVE_NODE_COUNT = 2;
      const INACTIVE_NODE_COUNT = 3;
      const SNAPSHOT_COVERAGE_COUNT = 2;
      const STALE_PENDING_ACK_COUNT = 1;
      const ZERO_COUNT = 0;
      const ONE_COUNT = 1;
      const BENCHMARK_GATE_STATUS_SKIPPED = 'skipped';
      const scenarios = [{
        scenario: SCENARIO_NAME,
        passed: false,
        error: 'Not all nodes reached ACTIVE state within 120000ms',
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: ROOT_CAUSE_CLASS_TOPOLOGY,
              dominantReason: PENDING_ACKS_PRESENT_REASON,
              reasonCounts: {
                [PENDING_ACKS_PRESENT_REASON]: ONE_COUNT,
              },
            },
            controlPlaneDiagnostics: {
              publicationConvergence: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_OPEN,
                pendingAckNodeIds: [],
                pendingAckCount: STALE_PENDING_ACK_COUNT,
                missingPublishedNodeIds: [],
                missingPublishedCount: ZERO_COUNT,
                publicationPending: true,
                prioritySpreadPending: true,
                recoveryProtocolState: RECOVERY_PROTOCOL_PUBLICATION_PENDING,
                priorityRecoveryReasonCodes: [],
              },
              activeGate: {
                mode: ACTIVE_GATE_MODE_STARTUP,
                state: ACTIVE_GATE_STATE_TIMED_OUT,
                ready: false,
                reasonCode: ACTIVE_GATE_TERMINAL_REASON,
                progress: {
                  expectedNodeCount: EXPECTED_NODE_COUNT,
                  activeNodeCount: ACTIVE_NODE_COUNT,
                  inactiveNodeCount: INACTIVE_NODE_COUNT,
                  snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_COUNT,
                  snapshotCoverageComplete: false,
                  publicationStatus: PUBLICATION_STATUS_OPEN,
                  publicationEpoch: PUBLICATION_EPOCH,
                  recoveryProtocolState:
                    RECOVERY_PROTOCOL_PUBLICATION_PENDING,
                  selectedPublishedActiveNodeIds: [],
                  selectedMissingPublishedNodeIds: [],
                  pendingAckNodeIds: [],
                  pendingAckCount: STALE_PENDING_ACK_COUNT,
                  missingPublishedCount: ZERO_COUNT,
                  gateReasons: [],
                  prioritySpreadSatisfied: false,
                  prioritySpreadGap: EXPECTED_NODE_COUNT,
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
        reportOutputPath: reportPath,
        outputDir: tempDir,
        reportSummary: {total: ONE_COUNT, fail: ONE_COUNT, pass: ZERO_COUNT},
        standardSummary: {scenarios: []},
        benchmarkRegressionGate: {status: BENCHMARK_GATE_STATUS_SKIPPED},
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[ZERO_COUNT].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const publicationConvergence = scenarioBundle.publicationConvergence;
      const publicationRecoveryGate =
        publicationConvergence.publicationRecoveryGate;
      const ownerContract =
        scenarioBundle.diagnostics.failure.ownerContract;

      assert.equal(publicationConvergence.pendingAckCount, ZERO_COUNT);
      assert.deepEqual(publicationConvergence.pendingAckNodeIds, []);
      assert.equal(publicationRecoveryGate.pendingAckCount, ZERO_COUNT);
      assert.equal(
        publicationRecoveryGate.streamOutcome,
        PUBLICATION_OWNER_STREAM_OUTCOME_PUBLISHING,
      );
      assert.equal(
        publicationRecoveryGate.ackState,
        PUBLICATION_OWNER_ACK_STATE_UNAVAILABLE,
      );
      assert.equal(
        publicationRecoveryGate.freshnessFence,
        PUBLICATION_OWNER_FRESHNESS_FENCE_PUBLISHING,
      );
      assert.equal(
        publicationRecoveryGate.recoveryOutcome,
        PUBLICATION_OWNER_RECOVERY_WAITING_FOR_PUBLICATION,
      );
      assert.equal(
        ownerContract.dominantWitness.edgeId,
        EDGE_PUBLICATION_ACK_CONVERGENCE,
      );
      assert.equal(
        ownerContract.dominantWitness.dominantReason,
        PUBLICATION_PENDING_OWNER_REASON,
      );
      assert.equal(
        ownerContract.dominantWitness.dominantReason ===
          PENDING_ACKS_PRESENT_REASON,
        false,
      );
    },
  );

  it(
    ACK_CLOSURE_TEST_NAME,
    async () => {
      refreshState();
      const SCENARIO_NAME = 'rolling-restart';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING =
        'priority_spread_pending';
      const ACTIVE_GATE_MODE_STARTUP = 'startup';
      const ACTIVE_GATE_STATE_TIMED_OUT = 'timed_out';
      const ACTIVE_GATE_TERMINAL_REASON = 'stalled_no_progress';
      const GENERIC_PUBLICATION_REASON =
        CONTROL_PLANE_READINESS_REASON.PUBLICATION_EPOCH_PENDING;
      const PRIORITY_SPREAD_REASON = 'priority_partitions_not_spread';
      const PRIORITY_RECOVERY_PARTITION_ID = 'sql_write_operations-p1';
      const PRIORITY_RECOVERY_PROGRESS_CLASS =
        PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT;
      const PRIORITY_RECOVERY_SEMANTIC_STATE_ID =
        PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION;
      const ACTIVE_GATE_COVERAGE_BLOCKER = 'snapshot_coverage=3/5';
      const ACTIVE_GATE_INACTIVE_BLOCKER = 'inactive_nodes=2';
      const PUBLISHED_NODE_ONE = 'published-node-one';
      const PUBLISHED_NODE_TWO = 'published-node-two';
      const PUBLISHED_NODE_THREE = 'published-node-three';
      const MISSING_NODE_ONE = 'missing-node-one';
      const MISSING_NODE_TWO = 'missing-node-two';
      const MISSING_ACTIVE_NODE_REASON_PREFIX =
        STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE + '=';
      const BENCHMARK_GATE_STATUS_SKIPPED = 'skipped';
      const PUBLICATION_EPOCH = 3;
      const EXPECTED_NODE_COUNT = 5;
      const ACTIVE_NODE_COUNT = 3;
      const INACTIVE_NODE_COUNT = 2;
      const SNAPSHOT_COVERAGE_COUNT = 3;
      const STALE_PENDING_ACK_COUNT = 2;
      const ONE_COUNT = 1;
      const ZERO_COUNT = 0;
      const scenarios = [{
        scenario: SCENARIO_NAME,
        passed: false,
        error: 'Not all nodes reached ACTIVE state within 120000ms',
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: ROOT_CAUSE_CLASS_TOPOLOGY,
              dominantReason: GENERIC_PUBLICATION_REASON,
              reasonCounts: {
                [GENERIC_PUBLICATION_REASON]: STALE_PENDING_ACK_COUNT,
                [PRIORITY_SPREAD_REASON]: STALE_PENDING_ACK_COUNT,
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
                prioritySpreadPending: true,
                recoveryProtocolState:
                  RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING,
                priorityRecoveryReasonCodes: [PRIORITY_SPREAD_REASON],
              },
              priorityRecoveryObservation: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: STALE_PENDING_ACK_COUNT,
                missingPublishedNodeIds: [MISSING_NODE_ONE, MISSING_NODE_TWO],
                missingPublishedCount: STALE_PENDING_ACK_COUNT,
                publicationPending: true,
                prioritySpreadPending: true,
                recoveryProtocolState:
                  RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING,
                priorityRecoveryReasonCodes: [
                  PRIORITY_SPREAD_REASON,
                  GENERIC_PUBLICATION_REASON,
                ],
                publicationConvergenceGateReasons: [
                  PRIORITY_SPREAD_REASON,
                  GENERIC_PUBLICATION_REASON,
                ],
                priorityRecoveryProgressClassIds: [
                  PRIORITY_RECOVERY_PROGRESS_CLASS,
                ],
                priorityRecoveryProgressClassCount: ONE_COUNT,
                priorityRecoverySemanticStateIds: [
                  PRIORITY_RECOVERY_SEMANTIC_STATE_ID,
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
                priorityRecoveryPartitionWitnesses: [{
                  partitionId: PRIORITY_RECOVERY_PARTITION_ID,
                  semanticStateId: PRIORITY_RECOVERY_SEMANTIC_STATE_ID,
                  progressClassIds: [PRIORITY_RECOVERY_PROGRESS_CLASS],
                  blockerReasonCodes: [PRIORITY_RECOVERY_PROGRESS_CLASS],
                  progressContractState: 'pending',
                  actuationState:
                    PRIORITY_RECOVERY_ACTUATION_STATE.TRANSITION_DEFERRED,
                  currentOwner:
                    PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
                  actuationOwner:
                    PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
                  blockingBoundary:
                    PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
                  waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
                  nextRequiredAction:
                    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION
                      .WAIT_FOR_OPERATION_PROGRESS,
                }],
              },
              activeGate: {
                mode: ACTIVE_GATE_MODE_STARTUP,
                state: ACTIVE_GATE_STATE_TIMED_OUT,
                ready: false,
                reasonCode: ACTIVE_GATE_TERMINAL_REASON,
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
                  selectedPublishedActiveNodeIds: [
                    PUBLISHED_NODE_ONE,
                    PUBLISHED_NODE_TWO,
                    PUBLISHED_NODE_THREE,
                  ],
                  selectedMissingPublishedNodeIds: [
                    MISSING_NODE_ONE,
                    MISSING_NODE_TWO,
                  ],
                  pendingAckCount: ZERO_COUNT,
                  missingPublishedCount: STALE_PENDING_ACK_COUNT,
                  gateReasons: [],
                  prioritySpreadSatisfied: false,
                  prioritySpreadGap: EXPECTED_NODE_COUNT,
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
                  },
                  blockers: [
                    ACTIVE_GATE_INACTIVE_BLOCKER,
                    ACTIVE_GATE_COVERAGE_BLOCKER,
                    'priority_recovery_progress_class=' +
                      PRIORITY_RECOVERY_PROGRESS_CLASS,
                  ],
                },
                bestProgress: {
                  expectedNodeCount: EXPECTED_NODE_COUNT,
                  activeNodeCount: EXPECTED_NODE_COUNT,
                  inactiveNodeCount: ZERO_COUNT,
                  snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_COUNT,
                  snapshotCoverageComplete: false,
                  publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                  publicationEpoch: PUBLICATION_EPOCH,
                  recoveryProtocolState:
                    RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING,
                  selectedPublishedActiveNodeIds: [
                    PUBLISHED_NODE_ONE,
                    PUBLISHED_NODE_TWO,
                    PUBLISHED_NODE_THREE,
                    MISSING_NODE_ONE,
                    MISSING_NODE_TWO,
                  ],
                  selectedMissingPublishedNodeIds: [],
                  pendingAckCount: STALE_PENDING_ACK_COUNT,
                  missingPublishedCount: ZERO_COUNT,
                  gateReasons: [],
                  prioritySpreadSatisfied: false,
                  prioritySpreadGap: EXPECTED_NODE_COUNT,
                  priorityBlockedPartitionCount: ONE_COUNT,
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
        benchmarkRegressionGate: {status: BENCHMARK_GATE_STATUS_SKIPPED},
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const publicationConvergence = scenarioBundle.publicationConvergence;
      const failureClassification =
        scenarioBundle.summary.failureClassification;

      assert.equal(publicationConvergence.pendingAckCount, ZERO_COUNT);
      assert.deepEqual(publicationConvergence.pendingAckNodeIds, []);
      assert.equal(
        publicationConvergence.missingPublishedCount,
        STALE_PENDING_ACK_COUNT,
      );
      assert.deepEqual(
        publicationConvergence.missingPublishedNodeIds,
        [MISSING_NODE_ONE, MISSING_NODE_TWO],
      );
      assert.equal(publicationConvergence.publicationPending, true);
      assert.equal(
        publicationConvergence.publicationConvergenceGateReasons.includes(
          GENERIC_PUBLICATION_REASON,
        ),
        false,
      );
      assert.ok(
        publicationConvergence.publicationConvergenceGateReasons.includes(
          ACTIVE_GATE_COVERAGE_BLOCKER,
        ),
      );
      assert.ok(
        publicationConvergence.publicationConvergenceGateReasons.includes(
          MISSING_ACTIVE_NODE_REASON_PREFIX + MISSING_NODE_ONE,
        ),
      );
      assert.equal(
        failureClassification.failureClass,
        FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
      );
      assert.equal(
        failureClassification.dominantReason,
        MISSING_ACTIVE_NODE_REASON_PREFIX + MISSING_NODE_ONE,
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.convergence.blockers.includes(
          STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE,
        ),
        true,
      );
    },
  );

  registerFailureBundleWorkflowBlockerCarrierDominanceTests(context);
}
