export function registerFailureBundleCore16Tests(context) {
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
  const DIRECT_BLOCKER_TEST_NAME =
    'keeps direct workflow blockers canonical over supporting serial-wait carriers';
  const TERMINAL_FOLLOW_UP_CARRIER_TEST_NAME =
    'keeps direct workflow blockers canonical over terminal rebalancer follow-up carriers';

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
      const PUBLICATION_ACK_CONVERGENCE_EDGE_ID =
        'publication_ack_convergence';
      const MISSING_PUBLISHED_NODES_PRESENT_REASON =
        'missing_published_nodes_present';
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
      const MISSING_NODE_FOUR = 'missing-node-four';
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
        PUBLICATION_ACK_CONVERGENCE_EDGE_ID,
      );
      assert.equal(
        ownerContract.dominantWitness.dominantReason,
        MISSING_PUBLISHED_NODES_PRESENT_REASON,
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

  it(
    DIRECT_BLOCKER_TEST_NAME,
    async () => {
      refreshState();
      const SCENARIO_NAME = 'rolling-restart';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING =
        'priority_spread_pending';
      const ACTIVE_GATE_MODE_STARTUP = 'startup';
      const ACTIVE_GATE_STATE_TIMED_OUT = 'timed_out';
      const ACTIVE_GATE_TERMINAL_REASON = 'stalled_no_progress';
      const ACTIVE_GATE_COVERAGE_BLOCKER = 'snapshot_coverage=2/5';
      const ACTIVE_GATE_INACTIVE_BLOCKER = 'inactive_nodes=2';
      const SCENARIO_ERROR =
        'Not all nodes reached ACTIVE state within 120000ms';
      const SOURCE_PARTITION_ID = 'sql_transactions-p3';
      const CARRIER_PARTITION_ID = 'sql_write_operations-p3';
      const SOURCE_OPERATION_ID = 'op-direct-source-blocker';
      const CARRIER_OPERATION_ID = 'op-supporting-serial-wait-carrier';
      const DIRECT_BLOCKER_DOMINANT_REASON =
        'priority_recovery_workflow_progress_transition_deferred';
      const PRIORITY_SPREAD_REASON = 'priority_partitions_not_spread';
      const PRIORITY_RECOVERY_PROGRESS_CLASS_BLOCKER_PREFIX =
        'priority_recovery_progress_class=';
      const PROGRESS_CONTRACT_STATE_PENDING = 'pending';
      const WORKFLOW_STEP_SENDING = 'SENDING';
      const WORKFLOW_STEP_REMOVED = 'REMOVED';
      const OPERATION_STATUS_PENDING = 'pending';
      const OPERATION_STATUS_REMOVED = 'removed';
      const BENCHMARK_GATE_STATUS_SKIPPED = 'skipped';
      const PUBLICATION_EPOCH = 4;
      const EXPECTED_NODE_COUNT = 5;
      const ACTIVE_NODE_COUNT = 3;
      const INACTIVE_NODE_COUNT = 2;
      const SNAPSHOT_COVERAGE_COUNT = 2;
      const PRIORITY_SPREAD_GAP = 3;
      const SELECTED_PUBLISHED_ACTIVE_NODE_IDS = [
        'published-node-one',
        'published-node-two',
      ];
      const SELECTED_MISSING_PUBLISHED_NODE_IDS = [
        'missing-node-one',
        'missing-node-two',
        'missing-node-three',
      ];
      const SELECTED_MISSING_PUBLISHED_COUNT =
        SELECTED_MISSING_PUBLISHED_NODE_IDS.length;
      const ZERO_COUNT = 0;
      const ONE_COUNT = 1;
      const TWO_COUNT = 2;
      const SOURCE_LAST_PROGRESS_AT_MS = 1778107569901;
      const CARRIER_LAST_PROGRESS_AT_MS = 1778107588977;
      const SOURCE_CORRELATION_KEY =
        SOURCE_PARTITION_ID + '|' + String(PUBLICATION_EPOCH) + '|' +
        SOURCE_OPERATION_ID;
      const CARRIER_CORRELATION_KEY =
        CARRIER_PARTITION_ID + '|' + String(PUBLICATION_EPOCH) + '|' +
        CARRIER_OPERATION_ID;
      const SOURCE_PARTITION_SIGNAL =
        'priorityRecoveryPartition=' + SOURCE_PARTITION_ID;
      const CARRIER_PARTITION_SIGNAL =
        'priorityRecoveryPartition=' + CARRIER_PARTITION_ID;
      const scenarios = [{
        scenario: SCENARIO_NAME,
        passed: false,
        error: SCENARIO_ERROR,
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: ROOT_CAUSE_CLASS_TOPOLOGY,
              dominantReason: DIRECT_BLOCKER_DOMINANT_REASON,
              reasonCounts: {
                [DIRECT_BLOCKER_DOMINANT_REASON]: ONE_COUNT,
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
                priorityPartitionSummary: {
                  satisfied: false,
                  blockedPartitionCount: TWO_COUNT,
                  totalSpreadGap: PRIORITY_SPREAD_GAP,
                },
              },
              priorityRecoveryObservation: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: ZERO_COUNT,
                blockedNodeIds: [],
                blockedNodeCount: ZERO_COUNT,
                missingPublishedNodeIds: [],
                missingPublishedCount: ZERO_COUNT,
                publicationPending: false,
                prioritySpreadPending: true,
                recoveryProtocolState:
                  RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING,
                priorityRecoveryReasonCodes: [PRIORITY_SPREAD_REASON],
                priorityRecoveryProgressClassIds: [
                  PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT,
                  PRIORITY_RECOVERY_BLOCKER_REASON.RECOVERY_ELIGIBLE_EXCLUDED,
                ],
                priorityRecoveryProgressClassCount: TWO_COUNT,
                priorityRecoverySemanticStateIds: [
                  PRIORITY_RECOVERY_SEMANTIC_STATE.COORDINATION_MISMATCH,
                  PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
                ],
                priorityRecoverySemanticStateCount: TWO_COUNT,
                priorityRecoveryBlockedPartitionIds: [
                  SOURCE_PARTITION_ID,
                  CARRIER_PARTITION_ID,
                ],
                priorityRecoveryBlockedPartitionCount: TWO_COUNT,
                priorityRecoveryUnresolvedPartitionIds: [
                  SOURCE_PARTITION_ID,
                  CARRIER_PARTITION_ID,
                ],
                priorityRecoveryUnresolvedPartitionCount: TWO_COUNT,
                priorityRecoveryBlockerPartitionIdsByReason: {
                  [PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT]: [
                    CARRIER_PARTITION_ID,
                  ],
                  [PRIORITY_RECOVERY_BLOCKER_REASON.RECOVERY_ELIGIBLE_EXCLUDED]:
                    [SOURCE_PARTITION_ID],
                },
                priorityRecoveryPartitionIdsBySemanticState: {
                  [PRIORITY_RECOVERY_SEMANTIC_STATE.COORDINATION_MISMATCH]: [
                    SOURCE_PARTITION_ID,
                  ],
                  [PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION]: [
                    CARRIER_PARTITION_ID,
                  ],
                },
                priorityRecoveryPartitionWitnesses: [{
                  partitionId: SOURCE_PARTITION_ID,
                  semanticStateId:
                    PRIORITY_RECOVERY_SEMANTIC_STATE.COORDINATION_MISMATCH,
                  progressClassIds: [
                    PRIORITY_RECOVERY_BLOCKER_REASON
                      .RECOVERY_ELIGIBLE_EXCLUDED,
                  ],
                  blockerReasonCodes: [
                    PRIORITY_RECOVERY_BLOCKER_REASON
                      .RECOVERY_ELIGIBLE_EXCLUDED,
                  ],
                  progressContractState: PROGRESS_CONTRACT_STATE_PENDING,
                  actuationState:
                    PRIORITY_RECOVERY_ACTUATION_STATE
                      .DISPATCHED_WAITING_PROGRESS,
                  currentOwner:
                    PRIORITY_RECOVERY_PROGRESS_OWNER
                      .OPERATION_WORKFLOW_OWNER,
                  actuationOwner:
                    PRIORITY_RECOVERY_PROGRESS_OWNER
                      .OPERATION_WORKFLOW_OWNER,
                  blockingBoundary:
                    PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
                  waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
                  nextRequiredAction:
                    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION
                      .WAIT_FOR_OPERATION_PROGRESS,
                  operationIds: [SOURCE_OPERATION_ID],
                  witnessIds: [SOURCE_OPERATION_ID],
                  correlationKey: SOURCE_CORRELATION_KEY,
                  lastProgressAtMs: SOURCE_LAST_PROGRESS_AT_MS,
                  latestOperationWorkflowStep: WORKFLOW_STEP_SENDING,
                  latestOperationStatus: OPERATION_STATUS_PENDING,
                }, {
                  partitionId: CARRIER_PARTITION_ID,
                  semanticStateId:
                    PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
                  progressClassIds: [
                    PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT,
                  ],
                  blockerReasonCodes: [
                    PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT,
                  ],
                  progressContractState: PROGRESS_CONTRACT_STATE_PENDING,
                  actuationState:
                    PRIORITY_RECOVERY_ACTUATION_STATE.TRANSITION_DEFERRED,
                  currentOwner:
                    PRIORITY_RECOVERY_PROGRESS_OWNER
                      .OPERATION_WORKFLOW_OWNER,
                  actuationOwner:
                    PRIORITY_RECOVERY_PROGRESS_OWNER
                      .OPERATION_WORKFLOW_OWNER,
                  blockingBoundary:
                    PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
                  waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
                  nextRequiredAction:
                    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION
                      .WAIT_FOR_OPERATION_PROGRESS,
                  serialWaitOperationIds: [SOURCE_OPERATION_ID],
                  serialWaitPartitionIds: [SOURCE_PARTITION_ID],
                  operationIds: [CARRIER_OPERATION_ID],
                  witnessIds: [
                    CARRIER_OPERATION_ID,
                    SOURCE_OPERATION_ID,
                  ],
                  correlationKey: CARRIER_CORRELATION_KEY,
                  lastProgressAtMs: CARRIER_LAST_PROGRESS_AT_MS,
                  latestOperationWorkflowStep: WORKFLOW_STEP_REMOVED,
                  latestOperationStatus: OPERATION_STATUS_REMOVED,
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
                  selectedPublishedActiveNodeIds:
                    SELECTED_PUBLISHED_ACTIVE_NODE_IDS,
                  selectedMissingPublishedNodeIds:
                    SELECTED_MISSING_PUBLISHED_NODE_IDS,
                  pendingAckCount: ZERO_COUNT,
                  missingPublishedCount: SELECTED_MISSING_PUBLISHED_COUNT,
                  gateReasons: [],
                  prioritySpreadSatisfied: false,
                  prioritySpreadGap: PRIORITY_SPREAD_GAP,
                  priorityBlockedPartitionCount: TWO_COUNT,
                  priorityRecoveryProgressClasses: {
                    unresolvedClassIds: [
                      PRIORITY_RECOVERY_BLOCKER_REASON
                        .SERIAL_OPERATION_WAIT,
                      PRIORITY_RECOVERY_BLOCKER_REASON
                        .RECOVERY_ELIGIBLE_EXCLUDED,
                    ],
                    unresolvedClassCount: TWO_COUNT,
                    unresolvedSemanticStateIds: [
                      PRIORITY_RECOVERY_SEMANTIC_STATE.COORDINATION_MISMATCH,
                      PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
                    ],
                    unresolvedSemanticStateCount: TWO_COUNT,
                    blockedPartitionIds: [
                      SOURCE_PARTITION_ID,
                      CARRIER_PARTITION_ID,
                    ],
                    blockedPartitionCount: TWO_COUNT,
                  },
                  blockers: [
                    ACTIVE_GATE_INACTIVE_BLOCKER,
                    ACTIVE_GATE_COVERAGE_BLOCKER,
                    PRIORITY_RECOVERY_PROGRESS_CLASS_BLOCKER_PREFIX +
                      PRIORITY_RECOVERY_BLOCKER_REASON
                        .SERIAL_OPERATION_WAIT,
                    PRIORITY_RECOVERY_PROGRESS_CLASS_BLOCKER_PREFIX +
                      PRIORITY_RECOVERY_BLOCKER_REASON
                        .RECOVERY_ELIGIBLE_EXCLUDED,
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
      const progressSummary =
        scenarioBundle.publicationConvergence.priorityRecoveryProgressSummary;
      const dominantWitness = progressSummary.dominantWitness;
      const failureClassification =
        scenarioBundle.summary.failureClassification;

      assert.equal(progressSummary.partitionCount, TWO_COUNT);
      assert.equal(dominantWitness.partitionId, SOURCE_PARTITION_ID);
      assert.deepEqual(
        dominantWitness.blockerReasonCodes,
        [PRIORITY_RECOVERY_BLOCKER_REASON.RECOVERY_ELIGIBLE_EXCLUDED],
      );
      assert.equal(
        dominantWitness.latestOperationWorkflowStep,
        WORKFLOW_STEP_SENDING,
      );
      assert.equal(
        dominantWitness.latestOperationStatus,
        OPERATION_STATUS_PENDING,
      );
      assert.ok(
        failureClassification.signals.includes(SOURCE_PARTITION_SIGNAL),
      );
      assert.equal(
        failureClassification.signals.includes(CARRIER_PARTITION_SIGNAL),
        false,
      );
    },
  );

  it(
    TERMINAL_FOLLOW_UP_CARRIER_TEST_NAME,
    async () => {
      refreshState();
      const SCENARIO_NAME = 'rolling-restart';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING =
        'priority_spread_pending';
      const ACTIVE_GATE_MODE_STARTUP = 'startup';
      const ACTIVE_GATE_STATE_TIMED_OUT = 'timed_out';
      const ACTIVE_GATE_TERMINAL_REASON = 'stalled_no_progress';
      const ACTIVE_GATE_COVERAGE_BLOCKER = 'snapshot_coverage=3/5';
      const ACTIVE_GATE_INACTIVE_BLOCKER = 'inactive_nodes=3';
      const SCENARIO_ERROR =
        'Not all nodes reached ACTIVE state within 120000ms';
      const SOURCE_PARTITION_ID = 'sql_transactions-p1';
      const CARRIER_PARTITION_ID = 'sql_write_operations-p1';
      const SOURCE_OPERATION_ID = 'op-terminal-follow-up-source-blocker';
      const CARRIER_OPERATION_ID = 'op-terminal-follow-up-carrier';
      const PRIORITY_RECOVERY_DOMINANT_REASON =
        'priority_recovery_workflow_progress_event_driven';
      const PRIORITY_SPREAD_REASON = 'priority_partitions_not_spread';
      const PRIORITY_RECOVERY_PROGRESS_CLASS_BLOCKER_PREFIX =
        'priority_recovery_progress_class=';
      const PROGRESS_CONTRACT_STATE_PENDING = 'pending';
      const PROGRESS_CONTRACT_STATE_BLOCKED = 'blocked';
      const WORKFLOW_STEP_ACTIVE = 'ACTIVE';
      const WORKFLOW_STEP_REMOVED = 'REMOVED';
      const OPERATION_STATUS_ACTIVE = 'active';
      const OPERATION_STATUS_REMOVED = 'removed';
      const BENCHMARK_GATE_STATUS_SKIPPED = 'skipped';
      const PUBLICATION_EPOCH = 2;
      const EXPECTED_NODE_COUNT = 5;
      const ACTIVE_NODE_COUNT = 2;
      const INACTIVE_NODE_COUNT = 3;
      const SNAPSHOT_COVERAGE_COUNT = 3;
      const PRIORITY_SPREAD_GAP = 4;
      const SELECTED_PUBLISHED_ACTIVE_NODE_IDS = [
        'published-node-one',
        'published-node-two',
      ];
      const SELECTED_MISSING_PUBLISHED_NODE_IDS = [
        'missing-node-one',
        'missing-node-two',
        'missing-node-three',
      ];
      const SELECTED_MISSING_PUBLISHED_COUNT =
        SELECTED_MISSING_PUBLISHED_NODE_IDS.length;
      const ZERO_COUNT = 0;
      const ONE_COUNT = 1;
      const TWO_COUNT = 2;
      const SOURCE_LAST_PROGRESS_AT_MS = 1778166833516;
      const CARRIER_LAST_PROGRESS_AT_MS = 1778166839785;
      const SOURCE_CORRELATION_KEY =
        SOURCE_PARTITION_ID + '|' + String(PUBLICATION_EPOCH) + '|' +
        SOURCE_OPERATION_ID;
      const CARRIER_CORRELATION_KEY =
        CARRIER_PARTITION_ID + '|' + String(PUBLICATION_EPOCH) + '|' +
        CARRIER_OPERATION_ID;
      const SOURCE_PARTITION_SIGNAL =
        'priorityRecoveryPartition=' + SOURCE_PARTITION_ID;
      const CARRIER_PARTITION_SIGNAL =
        'priorityRecoveryPartition=' + CARRIER_PARTITION_ID;
      const PRIORITY_RECOVERY_OWNER_SIGNAL =
        'priorityRecoveryOwner=' +
        PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER;
      const PRIORITY_RECOVERY_BOUNDARY_SIGNAL =
        'priorityRecoveryBoundary=' +
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS;
      const PRIORITY_RECOVERY_WAIT_MODE_SIGNAL =
        'priorityRecoveryWaitMode=' + PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN;
      const PRIORITY_RECOVERY_NEXT_ACTION_SIGNAL =
        'priorityRecoveryNextAction=' +
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS;
      const scenarios = [{
        scenario: SCENARIO_NAME,
        passed: false,
        error: SCENARIO_ERROR,
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: ROOT_CAUSE_CLASS_TOPOLOGY,
              dominantReason: PRIORITY_RECOVERY_DOMINANT_REASON,
              reasonCounts: {
                [PRIORITY_RECOVERY_DOMINANT_REASON]: ONE_COUNT,
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
                priorityPartitionSummary: {
                  satisfied: false,
                  blockedPartitionCount: TWO_COUNT,
                  totalSpreadGap: PRIORITY_SPREAD_GAP,
                },
              },
              priorityRecoveryObservation: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: ZERO_COUNT,
                blockedNodeIds: [],
                blockedNodeCount: ZERO_COUNT,
                missingPublishedNodeIds: [],
                missingPublishedCount: ZERO_COUNT,
                publicationPending: false,
                prioritySpreadPending: true,
                recoveryProtocolState:
                  RECOVERY_PROTOCOL_PRIORITY_SPREAD_PENDING,
                priorityRecoveryReasonCodes: [PRIORITY_SPREAD_REASON],
                priorityRecoveryProgressClassIds: [
                  PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS,
                  PRIORITY_RECOVERY_BLOCKER_REASON.RECOVERY_ELIGIBLE_EXCLUDED,
                ],
                priorityRecoveryProgressClassCount: TWO_COUNT,
                priorityRecoverySemanticStateIds: [
                  PRIORITY_RECOVERY_SEMANTIC_STATE.COORDINATION_MISMATCH,
                  PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED,
                ],
                priorityRecoverySemanticStateCount: TWO_COUNT,
                priorityRecoveryBlockedPartitionIds: [
                  SOURCE_PARTITION_ID,
                  CARRIER_PARTITION_ID,
                ],
                priorityRecoveryBlockedPartitionCount: TWO_COUNT,
                priorityRecoveryUnresolvedPartitionIds: [
                  SOURCE_PARTITION_ID,
                  CARRIER_PARTITION_ID,
                ],
                priorityRecoveryUnresolvedPartitionCount: TWO_COUNT,
                priorityRecoveryBlockerPartitionIdsByReason: {
                  [PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS]: [
                    SOURCE_PARTITION_ID,
                  ],
                  [PRIORITY_RECOVERY_BLOCKER_REASON.RECOVERY_ELIGIBLE_EXCLUDED]:
                    [SOURCE_PARTITION_ID],
                },
                priorityRecoveryPartitionIdsBySemanticState: {
                  [PRIORITY_RECOVERY_SEMANTIC_STATE.COORDINATION_MISMATCH]: [
                    SOURCE_PARTITION_ID,
                  ],
                  [PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED]: [
                    CARRIER_PARTITION_ID,
                  ],
                },
                priorityRecoveryPartitionWitnesses: [{
                  partitionId: SOURCE_PARTITION_ID,
                  semanticStateId:
                    PRIORITY_RECOVERY_SEMANTIC_STATE.COORDINATION_MISMATCH,
                  progressClassIds: [
                    PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS,
                    PRIORITY_RECOVERY_BLOCKER_REASON
                      .RECOVERY_ELIGIBLE_EXCLUDED,
                  ],
                  blockerReasonCodes: [
                    PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS,
                    PRIORITY_RECOVERY_BLOCKER_REASON
                      .RECOVERY_ELIGIBLE_EXCLUDED,
                  ],
                  progressContractState: PROGRESS_CONTRACT_STATE_PENDING,
                  actuationState:
                    PRIORITY_RECOVERY_ACTUATION_STATE
                      .DISPATCHED_WAITING_PROGRESS,
                  currentOwner:
                    PRIORITY_RECOVERY_PROGRESS_OWNER
                      .OPERATION_WORKFLOW_OWNER,
                  actuationOwner:
                    PRIORITY_RECOVERY_PROGRESS_OWNER
                      .OPERATION_WORKFLOW_OWNER,
                  blockingBoundary:
                    PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
                  waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
                  nextRequiredAction:
                    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION
                      .WAIT_FOR_OPERATION_PROGRESS,
                  operationIds: [SOURCE_OPERATION_ID],
                  witnessIds: [SOURCE_OPERATION_ID],
                  correlationKey: SOURCE_CORRELATION_KEY,
                  lastProgressAtMs: SOURCE_LAST_PROGRESS_AT_MS,
                  latestOperationWorkflowStep: WORKFLOW_STEP_ACTIVE,
                  latestOperationStatus: OPERATION_STATUS_ACTIVE,
                }, {
                  partitionId: CARRIER_PARTITION_ID,
                  semanticStateId:
                    PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED,
                  progressContractState: PROGRESS_CONTRACT_STATE_BLOCKED,
                  actuationState:
                    PRIORITY_RECOVERY_ACTUATION_STATE.TERMINAL_COMPLETED,
                  currentOwner:
                    PRIORITY_RECOVERY_PROGRESS_OWNER.REBALANCER_LEADER,
                  actuationOwner:
                    PRIORITY_RECOVERY_PROGRESS_OWNER.REBALANCER_LEADER,
                  blockingBoundary:
                    PRIORITY_RECOVERY_BLOCKING_BOUNDARY.REBALANCER_HANDOFF,
                  waitMode: PRIORITY_RECOVERY_WAIT_MODE.STALLED,
                  nextRequiredAction:
                    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION
                      .SCHEDULE_FOLLOWUP_REBALANCE,
                  operationIds: [CARRIER_OPERATION_ID],
                  witnessIds: [CARRIER_OPERATION_ID],
                  correlationKey: CARRIER_CORRELATION_KEY,
                  lastProgressAtMs: CARRIER_LAST_PROGRESS_AT_MS,
                  latestOperationWorkflowStep: WORKFLOW_STEP_REMOVED,
                  latestOperationStatus: OPERATION_STATUS_REMOVED,
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
                  selectedPublishedActiveNodeIds:
                    SELECTED_PUBLISHED_ACTIVE_NODE_IDS,
                  selectedMissingPublishedNodeIds:
                    SELECTED_MISSING_PUBLISHED_NODE_IDS,
                  pendingAckCount: ZERO_COUNT,
                  missingPublishedCount: SELECTED_MISSING_PUBLISHED_COUNT,
                  gateReasons: [],
                  prioritySpreadSatisfied: false,
                  prioritySpreadGap: PRIORITY_SPREAD_GAP,
                  priorityBlockedPartitionCount: TWO_COUNT,
                  priorityRecoveryProgressClasses: {
                    unresolvedClassIds: [
                      PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS,
                      PRIORITY_RECOVERY_BLOCKER_REASON
                        .RECOVERY_ELIGIBLE_EXCLUDED,
                    ],
                    unresolvedClassCount: TWO_COUNT,
                    unresolvedSemanticStateIds: [
                      PRIORITY_RECOVERY_SEMANTIC_STATE.COORDINATION_MISMATCH,
                      PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED,
                    ],
                    unresolvedSemanticStateCount: TWO_COUNT,
                    blockedPartitionIds: [
                      SOURCE_PARTITION_ID,
                      CARRIER_PARTITION_ID,
                    ],
                    blockedPartitionCount: TWO_COUNT,
                  },
                  blockers: [
                    ACTIVE_GATE_INACTIVE_BLOCKER,
                    ACTIVE_GATE_COVERAGE_BLOCKER,
                    PRIORITY_RECOVERY_PROGRESS_CLASS_BLOCKER_PREFIX +
                      PRIORITY_RECOVERY_BLOCKER_REASON
                        .OPERATION_NO_TRANSITIONS,
                    PRIORITY_RECOVERY_PROGRESS_CLASS_BLOCKER_PREFIX +
                      PRIORITY_RECOVERY_BLOCKER_REASON
                        .RECOVERY_ELIGIBLE_EXCLUDED,
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
      const progressSummary =
        scenarioBundle.publicationConvergence.priorityRecoveryProgressSummary;
      const dominantWitness = progressSummary.dominantWitness;
      const failureClassification =
        scenarioBundle.summary.failureClassification;

      assert.equal(progressSummary.partitionCount, TWO_COUNT);
      assert.equal(dominantWitness.partitionId, SOURCE_PARTITION_ID);
      assert.deepEqual(
        dominantWitness.blockerReasonCodes,
        [
          PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS,
          PRIORITY_RECOVERY_BLOCKER_REASON.RECOVERY_ELIGIBLE_EXCLUDED,
        ],
      );
      assert.equal(
        dominantWitness.latestOperationWorkflowStep,
        WORKFLOW_STEP_ACTIVE,
      );
      assert.equal(
        dominantWitness.latestOperationStatus,
        OPERATION_STATUS_ACTIVE,
      );
      assert.equal(
        failureClassification.dominantReason,
        PRIORITY_RECOVERY_DOMINANT_REASON,
      );
      assert.ok(
        failureClassification.signals.includes(SOURCE_PARTITION_SIGNAL),
      );
      assert.equal(
        failureClassification.signals.includes(CARRIER_PARTITION_SIGNAL),
        false,
      );
      assert.ok(
        failureClassification.signals.includes(PRIORITY_RECOVERY_OWNER_SIGNAL),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_BOUNDARY_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_WAIT_MODE_SIGNAL,
        ),
      );
      assert.ok(
        failureClassification.signals.includes(
          PRIORITY_RECOVERY_NEXT_ACTION_SIGNAL,
        ),
      );
    },
  );
}
