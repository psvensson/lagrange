import {registerFailureBundlePlaybackStartupTests} from './failure-bundle-playback-startup-test-cases.js';

export function registerFailureBundlePlaybackTests({
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
  const EXPECTED_UNAVAILABLE_STATE = 'unavailable';
  const RETRY_HANDOFF_PLAYBACK_TEST_NAME =
    'uses later retryable operation handoff logs over stale selected-snapshot timeout evidence';

  it('derives root-cause, readiness reasons, and first-fault timeline from playback events', async () => {
    const scenarioDir = join(state.outputDir, 'node-join-under-load');
    await mkdir(scenarioDir, {recursive: true});
    await writeFile(
      join(scenarioDir, 'events.ndjson'),
      [
        JSON.stringify({
          timestamp: 1000,
          type: 'cluster.stage',
          scope: 'cluster',
          entityId: 'cluster',
          details: {
            stage: 'setup.cluster.waiting-active',
            nodeDiagnostics: [
              {
                nodeId: 'node-1',
                reasons: ['local_query_transport_not_ready'],
              },
            ],
          },
        }),
        JSON.stringify({
          timestamp: 2000,
          type: 'load.started',
          scope: 'load',
          entityId: 'load-run',
          details: {
            options: {opsPerSec: 50, duration: '30s'},
          },
        }),
        JSON.stringify({
          timestamp: 2010,
          type: 'load.progress',
          scope: 'load',
          entityId: 'load-run',
          details: {
            metrics: {
              failed: 0,
              errors: 0,
              attemptErrors: 0,
              waitReasons: {
                nodeSlotUnavailable: 0,
                nodeAdmissionBlocked: 0,
                queueCapacityRejected: 0,
              },
            },
          },
        }),
        JSON.stringify({
          timestamp: 2030,
          type: 'load.progress',
          scope: 'load',
          entityId: 'load-run',
          details: {
            metrics: {
              failed: 0,
              errors: 0,
              attemptErrors: 0,
              waitReasons: {
                nodeSlotUnavailable: 0,
                nodeAdmissionBlocked: 2,
                queueCapacityRejected: 0,
              },
            },
          },
        }),
        JSON.stringify({
          timestamp: 2050,
          type: 'load.progress',
          scope: 'load',
          entityId: 'load-run',
          details: {
            metrics: {
              failed: 0,
              errors: 0,
              attemptErrors: 3,
              waitReasons: {
                nodeSlotUnavailable: 0,
                nodeAdmissionBlocked: 3,
                queueCapacityRejected: 0,
              },
            },
          },
        }),
        JSON.stringify({
          timestamp: 2070,
          type: 'load.progress',
          scope: 'load',
          entityId: 'load-run',
          details: {
            metrics: {
              failed: 1,
              errors: 1,
              attemptErrors: 4,
              waitReasons: {
                nodeSlotUnavailable: 0,
                nodeAdmissionBlocked: 4,
                queueCapacityRejected: 0,
              },
            },
          },
        }),
        JSON.stringify({
          timestamp: 2080,
          type: 'cluster.stage',
          scope: 'cluster',
          entityId: 'cluster',
          details: {
            stage: 'setup.cluster.waiting-active',
            nodeDiagnostics: [
              {
                nodeId: 'node-2',
                reasons: ['READINESS_STABLE_WINDOW_PENDING'],
              },
            ],
          },
        }),
      ].join('\n') + '\n',
    );

    const writer = new ReportWriter(state.reportPath);
    writer.addResult(
      'node-join-under-load',
      buildPlaybackDerivedFailureResult(),
    );
    const scenarioEntry = writer.scenarios[0];

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
    assert.equal(scenarioBundle.summary.rootCauseClass, 'load');
    assert.equal(scenarioBundle.summary.dominantReason, 'nodeAdmissionBlocked');
    assert.deepEqual(scenarioBundle.readiness.nodeReasonsByNodeId, {
      'node-1': ['local_query_transport_not_ready'],
      'node-2': ['READINESS_STABLE_WINDOW_PENDING'],
    });
    assert.equal(
      scenarioBundle.diagnostics.firstFaultTimeline.markers.queuePressureOnset
        .deltaFromLoadStartMs,
      30,
    );
    assert.equal(
      scenarioBundle.diagnostics.firstFaultTimeline.markers.attemptErrorOnset
        .deltaFromLoadStartMs,
      50,
    );
    assert.equal(
      scenarioBundle.diagnostics.firstFaultTimeline.markers.hardFailureOnset
        .deltaFromLoadStartMs,
      70,
    );
    assert.deepEqual(
      scenarioBundle.diagnostics.firstFaultTimeline.orderedMarkers.map(
        (entry) => entry.marker,
      ),
      ['queuePressureOnset', 'attemptErrorOnset', 'hardFailureOnset'],
    );

    assert.equal(
      scenarioEntry.details.diagnostics.failure.rootCauseClass,
      'load',
    );
    assert.equal(
      scenarioEntry.details.diagnostics.failure.dominantReason,
      'nodeAdmissionBlocked',
    );
    assert.ok(
      scenarioEntry.details.diagnostics.firstFaultTimeline,
      'report scenario entry should include derived first-fault timeline',
    );

    const reportJson = JSON.parse(
      await readFile(state.reportPath, UTF8_ENCODING),
    );
    assert.equal(
      reportJson.scenarios[0].details.diagnostics.failure.rootCauseClass,
      'load',
    );
    assert.equal(
      reportJson.scenarios[0].details.diagnostics.failure.dominantReason,
      'nodeAdmissionBlocked',
    );
    assert.ok(
      reportJson.scenarios[0].details.diagnostics.firstFaultTimeline,
      'written report should persist derived first-fault timeline',
    );
  });

  it('derives publication convergence from playback active-gate diagnostics', async () => {
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
            nodeDiagnostics: [
              {
                nodeId: 'seed-1',
                reasons: [],
              },
              {
                nodeId: 'joiner-1',
                reasons: [],
              },
            ],
            snapshotCoverage: {
              completeCoverage: true,
              expectedNodeCount: 2,
              selectedNodeId: 'seed-1',
              selectedCapturedAtMs: 4990,
              selectedObservedNodeIds: ['seed-1', 'joiner-1'],
              selectedControlPlaneDiagnosticsAvailable: true,
              selectedPublicationConvergence: {
                publicationEpoch: 3,
                publicationStatus: 'PUBLISHED',
                pendingAckNodeIds: [],
                publishedActiveNodeIds: ['seed-1', 'joiner-1'],
                projectionDiagnostics: {
                  readinessDecisionMode: 'cluster_member_or_recovery_eligible',
                  readinessDecisionDimensions: [
                    'clusterMemberHealthy',
                    'controlPlaneRecoveryEligible',
                    'controlPlaneWritable',
                  ],
                  recoveryEligibleProjectionEnabled: true,
                  recoveryEligibleIncludedNodeIds: ['joiner-1'],
                  readinessExcludedNodeIds: ['seed-2'],
                  clusterMemberUnhealthyExcludedNodeIds: ['seed-2'],
                  retentionGraceMisses: [
                    {nodeId: 'seed-2', reason: 'stale_lease_and_heartbeat'},
                  ],
                },
                priorityPartitionSummary: {
                  satisfied: false,
                  requiredDistinctNodeCount: 3,
                  readyEligibleNodeCount: 2,
                  totalPriorityPartitionCount: 5,
                  missingPartitionIds: [
                    'control_plane_publications-p1',
                    'replica_operations-p1',
                  ],
                  blockedPartitionCount: 2,
                  largestSpreadGap: 1,
                  totalSpreadGap: 2,
                },
              },
              selectedPriorityRecoveryDecisionSnapshots: {
                schemaVersion: 1,
                capturedAt: 5000,
                publicationEpoch: 3,
                snapshots: [
                  {
                    partitionId: 'control_plane_publications-p1',
                    epoch: 3,
                    operationId: null,
                    correlationKey:
                      'control_plane_publications-p1|3|operation_unknown',
                    semanticState: 'blocked_unclassified',
                    blockerReasons: ['eligible_but_no_operation_created'],
                    planner: {
                      spreadGap: 1,
                    },
                    admission: {
                      eligibleNodeIds: [],
                      effectiveEligibleNodeIds: ['joiner-1', 'joiner-2'],
                      decisionDimension: 'repairEligible',
                    },
                    readiness: {
                      learnerPromotion: {
                        activeLearnerNodeIds: [],
                        promotableLearnerNodeIds: [],
                      },
                    },
                  },
                  {
                    partitionId: 'replica_operations-p1',
                    epoch: 3,
                    operationId: 'op-1',
                    correlationKey: 'replica_operations-p1|3|op-1',
                    semanticState: 'recovering_in_flight',
                    blockerReasons: [
                      'operation_created_but_no_step_transitions',
                      'learner_active_but_never_promotable',
                    ],
                    planner: {
                      spreadGap: 1,
                    },
                    admission: {
                      eligibleNodeIds: [],
                      effectiveEligibleNodeIds: [
                        'joiner-1',
                        'joiner-2',
                        'joiner-3',
                      ],
                      decisionDimension: 'controlPlaneRecoveryEligible',
                    },
                    coordinator: {
                      operationIds: ['op-1'],
                      operation: {
                        operationId: 'op-1',
                        status: 'open',
                        workflowStep: 'DISPATCHED',
                        latestTimelineStep: 'CREATE_REPLICA',
                        updatedAtMs: 5100,
                      },
                    },
                    readiness: {
                      learnerPromotion: {
                        activeLearnerNodeIds: ['joiner-1'],
                        promotableLearnerNodeIds: [],
                      },
                    },
                  },
                ],
                blockerPartitionIdsByReason: {
                  eligible_but_no_operation_created: [
                    'control_plane_publications-p1',
                  ],
                  operation_created_but_no_step_transitions: [
                    'replica_operations-p1',
                  ],
                  learner_active_but_never_promotable: [
                    'replica_operations-p1',
                  ],
                  publication_recovery_eligible_but_coordinator_excludes_node:
                    [],
                },
              },
            },
            publicationConvergenceGate: {
              ready: false,
              reasons: ['priority_control_plane_spread_pending'],
              publicationStatus: 'PUBLISHED',
              pendingAckNodeIds: [],
              missingPublishedNodeIds: [],
              priorityPartitionSummary: {
                satisfied: false,
                requiredDistinctNodeCount: 3,
                readyEligibleNodeCount: 2,
                totalPriorityPartitionCount: 5,
                missingPartitionIds: [
                  'control_plane_publications-p1',
                  'replica_operations-p1',
                ],
                blockedPartitionCount: 2,
                largestSpreadGap: 1,
                totalSpreadGap: 2,
              },
            },
            activeGate: {
              mode: 'load',
              state: 'waiting',
              maxAttempts: 45,
              attemptsSinceProgress: 22,
              progress: {
                expectedNodeCount: 2,
                activeNodeCount: 2,
                inactiveNodeCount: 0,
                snapshotCoverageNodeCount: 2,
                snapshotCoverageComplete: true,
                publicationStatus: 'PUBLISHED',
                pendingAckCount: 0,
                missingPublishedCount: 0,
                gateReasonCount: 1,
                gateReasons: ['priority_control_plane_spread_pending'],
                prioritySpreadSatisfied: false,
                prioritySpreadGap: 2,
                blockers: [
                  'publication_gate=priority_control_plane_spread_pending',
                ],
                blockerSignature:
                  'publication_gate=priority_control_plane_spread_pending',
              },
              bestProgress: {
                expectedNodeCount: 2,
                activeNodeCount: 2,
                inactiveNodeCount: 0,
                snapshotCoverageNodeCount: 2,
                snapshotCoverageComplete: true,
                publicationStatus: 'PUBLISHED',
                pendingAckCount: 0,
                missingPublishedCount: 0,
                gateReasonCount: 1,
                gateReasons: ['priority_control_plane_spread_pending'],
                prioritySpreadSatisfied: false,
                prioritySpreadGap: 2,
                blockers: [
                  'publication_gate=priority_control_plane_spread_pending',
                ],
                blockerSignature:
                  'publication_gate=priority_control_plane_spread_pending',
              },
              blockerHistory: [
                {
                  signature:
                    'publication_gate=priority_control_plane_spread_pending',
                  blockers: [
                    'publication_gate=priority_control_plane_spread_pending',
                  ],
                  count: 11,
                  firstAttempt: 20,
                  firstElapsedMs: 20000,
                  lastAttempt: 40,
                  lastElapsedMs: 40000,
                },
              ],
            },
            priorityRecoveryInvariants: {
              invariants: [
                {
                  id: 'priority_recovery_bootstrap_ready_allows_join_during_priority_recovery',
                  reasonCode:
                    'priority_recovery_bootstrap_join_not_admitted_during_recovery',
                  severity: 'error',
                  scope: 'cluster',
                  owningSubsystem: 'distributed_harness_cluster_active_gate',
                  passed: true,
                  details: {
                    mode: 'load',
                    prioritySpreadPending: true,
                    bootstrapAdmittedNodeIds: ['joiner-1'],
                  },
                },
                {
                  id:
                    'priority_recovery_cluster_active_requires_publication_' +
                    'convergence_and_priority_spread',
                  reasonCode:
                    'priority_recovery_cluster_marked_active_without_convergence',
                  severity: 'error',
                  scope: 'cluster',
                  owningSubsystem: 'distributed_harness_cluster_active_gate',
                  passed: false,
                  details: {
                    mode: 'load',
                    allActive: true,
                    publicationConvergenceReady: false,
                  },
                },
              ],
              failingInvariantIds: [
                'priority_recovery_cluster_active_requires_publication_' +
                  'convergence_and_priority_spread',
              ],
              passed: false,
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
    assert.deepEqual(
      scenarioBundle.controlPlane.publicationConvergenceGate.reasons,
      ['priority_control_plane_spread_pending'],
    );
    assert.equal(
      scenarioBundle.publicationConvergence.prioritySpreadPending,
      true,
    );
    assert.equal(
      scenarioBundle.publicationConvergence.closureRecordId,
      'CL-003',
    );
    assert.equal(
      scenarioBundle.publicationConvergence.closureWitnessClass,
      'publication_converged_priority_spread_pending',
    );
    assert.equal(
      scenarioBundle.publicationConvergence.activeGate
        .attemptsSinceProgress,
      22,
    );
    assert.equal(
      scenarioBundle.publicationConvergence.activeGateProgress.gateReasonCount,
      1,
    );
    assert.equal(
      scenarioBundle.publicationConvergence.activeGate.blockerHistory[0]
        .signature,
      'publication_gate=priority_control_plane_spread_pending',
    );
    assert.deepEqual(
      scenarioBundle.publicationConvergence.projectionDiagnostics,
      {
        readinessDecisionMode: 'cluster_member_or_recovery_eligible',
        readinessDecisionDimensions: [
          'clusterMemberHealthy',
          'controlPlaneRecoveryEligible',
          'controlPlaneWritable',
        ],
        recoveryEligibleProjectionEnabled: true,
        recoveryEligibleIncludedNodeIds: ['joiner-1'],
        readinessExcludedNodeIds: ['seed-2'],
        clusterMemberUnhealthyExcludedNodeIds: ['seed-2'],
        retentionGraceMisses: [
          {nodeId: 'seed-2', reason: 'stale_lease_and_heartbeat'},
        ],
      },
    );
    assert.equal(
      scenarioBundle.publicationConvergence.priorityRecoveryProgressClassCount,
      3,
    );
    assert.deepEqual(
      scenarioBundle.publicationConvergence.priorityRecoveryProgressClassIds,
      [
        'eligible_but_no_operation_created',
        'operation_created_but_no_step_transitions',
        'learner_active_but_never_promotable',
      ],
    );
    assert.deepEqual(
      scenarioBundle.publicationConvergence.priorityRecoveryBlockedPartitionIds,
      ['control_plane_publications-p1', 'replica_operations-p1'],
    );
    assert.deepEqual(
      scenarioBundle.publicationConvergence
        .priorityRecoveryUnresolvedPartitionIds,
      ['control_plane_publications-p1', 'replica_operations-p1'],
    );
    assert.deepEqual(
      scenarioBundle.publicationConvergence.priorityRecoveryPartitionWitnesses.map(
        (witness) => {
          return {
            partitionId: witness.partitionId,
            semanticStateId: witness.semanticStateId,
            progressClassIds: witness.progressClassIds,
            blockerReasonCodes: witness.blockerReasonCodes,
            spreadGap: witness.spreadGap,
            decisionDimension: witness.decisionDimension,
            eligibleNodeIds: witness.eligibleNodeIds,
            recoveryEligibleExcludedNodeIds:
              witness.recoveryEligibleExcludedNodeIds,
            activeLearnerNodeIds: witness.activeLearnerNodeIds,
            promotableLearnerNodeIds: witness.promotableLearnerNodeIds,
            operationIds: witness.operationIds,
            completionState: witness.completionState,
            workflowState: witness.workflowState,
            visibilityState: witness.visibilityState,
            convergenceState: witness.convergenceState,
            workflowSource: witness.workflowSource,
            snapshotCapturedAt: witness.snapshotCapturedAt,
            latestOperationWorkflowStep: witness.latestOperationWorkflowStep,
            latestOperationStatus: witness.latestOperationStatus,
          };
        },
      ),
      [
        {
          partitionId: 'control_plane_publications-p1',
          semanticStateId: 'blocked_unclassified',
          progressClassIds: ['eligible_but_no_operation_created'],
          blockerReasonCodes: ['eligible_but_no_operation_created'],
          spreadGap: 1,
          decisionDimension: 'repairEligible',
          eligibleNodeIds: ['joiner-1', 'joiner-2'],
          recoveryEligibleExcludedNodeIds: [],
          activeLearnerNodeIds: [],
          promotableLearnerNodeIds: [],
          operationIds: [],
          completionState: EXPECTED_UNAVAILABLE_STATE,
          workflowState: EXPECTED_UNAVAILABLE_STATE,
          visibilityState: EXPECTED_UNAVAILABLE_STATE,
          convergenceState: EXPECTED_UNAVAILABLE_STATE,
          workflowSource: EXPECTED_UNAVAILABLE_STATE,
          snapshotCapturedAt: 5000,
          latestOperationWorkflowStep: EXPECTED_UNAVAILABLE_STATE,
          latestOperationStatus: EXPECTED_UNAVAILABLE_STATE,
        },
        {
          partitionId: 'replica_operations-p1',
          semanticStateId: 'recovering_in_flight',
          progressClassIds: [
            'learner_active_but_never_promotable',
            'operation_created_but_no_step_transitions',
          ],
          blockerReasonCodes: [
            'learner_active_but_never_promotable',
            'operation_created_but_no_step_transitions',
          ],
          spreadGap: 1,
          decisionDimension: 'controlPlaneRecoveryEligible',
          eligibleNodeIds: ['joiner-1', 'joiner-2', 'joiner-3'],
          recoveryEligibleExcludedNodeIds: [],
          activeLearnerNodeIds: ['joiner-1'],
          promotableLearnerNodeIds: [],
          operationIds: ['op-1'],
          completionState: EXPECTED_UNAVAILABLE_STATE,
          workflowState: EXPECTED_UNAVAILABLE_STATE,
          visibilityState: EXPECTED_UNAVAILABLE_STATE,
          convergenceState: EXPECTED_UNAVAILABLE_STATE,
          workflowSource: EXPECTED_UNAVAILABLE_STATE,
          snapshotCapturedAt: 5000,
          latestOperationWorkflowStep: 'DISPATCHED',
          latestOperationStatus: 'open',
        },
      ],
    );
    assert.equal(
      scenarioBundle.publicationConvergence
        .priorityRecoveryInvariantFailingIds[0],
      'priority_recovery_cluster_active_requires_publication_convergence_and_priority_spread',
    );
    assert.equal(
      scenarioBundle.publicationConvergence.priorityRecoveryInvariantFailures[0]
        .reasonCode,
      'priority_recovery_cluster_marked_active_without_convergence',
    );
    assert.equal(
      scenarioBundle.controlPlane.priorityRecoveryDecisionSnapshots
        .snapshotCount,
      2,
    );
    assert.equal(
      scenarioBundle.controlPlane.priorityRecoveryInvariants.passed,
      false,
    );
    assert.equal(
      scenarioBundle.summary.failureClassification.failureClass,
      'publication_convergence_blocked',
    );
    assert.equal(
      scenarioBundle.summary.stabilityGates.failover.status,
      'closed',
    );
    assert.equal(
      scenarioBundle.summary.stabilityGates.convergence.status,
      'open',
    );
    assert.deepEqual(
      scenarioBundle.summary.stabilityGates.convergence.blockers,
      ['priority_spread_pending', 'closure_record'],
    );
    assert.equal(
      scenarioBundle.summary.stabilityGates.restart_recovery.status,
      'open',
    );
    assert.ok(
      scenarioBundle.summary.failureClassification.signals.includes(
        'closureRecordId=CL-003',
      ),
    );
    assert.ok(
      scenarioBundle.summary.failureClassification.signals.includes(
        'closureWitnessClass=publication_converged_priority_spread_pending',
      ),
    );

    const reportJson = JSON.parse(
      await readFile(state.reportPath, UTF8_ENCODING),
    );
    assert.equal(
      reportJson.scenarios[0].publicationConvergence.prioritySpreadPending,
      true,
    );
    assert.equal(
      reportJson.scenarios[0].publicationConvergence.closureRecordId,
      'CL-003',
    );
    assert.equal(
      reportJson.scenarios[0].publicationConvergence.closureWitnessClass,
      'publication_converged_priority_spread_pending',
    );
    assert.equal(
      reportJson.scenarios[0].publicationConvergence.activeGate
        .maxAttempts,
      45,
    );
    assert.equal(
      reportJson.scenarios[0].publicationConvergence.projectionDiagnostics
        .recoveryEligibleProjectionEnabled,
      true,
    );
    assert.equal(
      reportJson.scenarios[0].publicationConvergence
        .priorityRecoveryProgressClassCount,
      3,
    );
    assert.deepEqual(
      reportJson.scenarios[0].stabilityGates.convergence.blockers,
      ['priority_spread_pending', 'closure_record'],
    );
    assert.equal(
      reportJson.scenarios[0].failureClassification.failureClass,
      'publication_convergence_blocked',
    );
    assert.ok(
      reportJson.scenarios[0].failureClassification.signals.includes(
        'closureRecordId=CL-003',
      ),
    );

    const scenarioMarkdown = await readFile(
      resolve(state.tempDir, scenarioBundles[0].links.markdownPath),
      UTF8_ENCODING,
    );
    const controlPlanePublicationWitnessPattern = new RegExp(
      [
        'Priority Recovery Partition Witnesses: ',
        'control_plane_publications-p1#state=blocked_unclassified',
        '#gap=1#blockers=eligible_but_no_operation_created',
        '#decision=repairEligible#eligible=2',
      ].join(''),
    );
    assert.match(
      scenarioMarkdown,
      controlPlanePublicationWitnessPattern,
    );
    assert.match(
      scenarioMarkdown,
      /replica_operations-p1#state=recovering_in_flight#gap=1#blockers=(learner_active_but_never_promotable\|operation_created_but_no_step_transitions|operation_created_but_no_step_transitions\|learner_active_but_never_promotable)#decision=controlPlaneRecoveryEligible#eligible=3#ops=op-1#status=open#learners=joiner-1/,
    );
  });

  it(RETRY_HANDOFF_PLAYBACK_TEST_NAME, async () => {
    const SCENARIO_NAME = 'rolling-restart';
    const PLAYBACK_EVENTS_FILENAME = 'events.ndjson';
    const NODE_LOG_FILENAME = 'node-1.log';
    const PLAYBACK_EVENT_TYPE_CLUSTER_STAGE = 'cluster.stage';
    const PLAYBACK_EVENT_SCOPE_CLUSTER = 'cluster';
    const PLAYBACK_EVENT_ENTITY_CLUSTER = 'cluster';
    const PLAYBACK_STAGE_SETUP_CLUSTER_WAITING_ACTIVE =
      'setup.cluster.waiting-active';
    const SELECTED_NODE_ONE_ID = 'node-1';
    const SELECTED_NODE_TWO_ID = 'node-2';
    const SELECTED_NODE_THREE_ID = 'node-3';
    const ACTIVE_GATE_MODE_STARTUP = 'startup';
    const ACTIVE_GATE_STATE_TIMED_OUT = 'timed_out';
    const SNAPSHOT_COVERAGE_BLOCKER = 'snapshot_coverage=3/5';
    const LOG_SUBSYSTEM_REBALANCE_COORDINATOR = 'rebalance-coordinator';
    const FAILURE_BUNDLE_STATUS_SKIPPED = 'skipped';
    const LINE_SEPARATOR = '\n';
    const STALE_STAGE_TIMESTAMP_MS = 1777922922021;
    const STALE_SNAPSHOT_CAPTURED_AT_MS = 1777922920790;
    const STALE_OPERATION_PROGRESS_AT_MS = 1777922869705;
    const RETRY_HANDOFF_PROGRESS_TIME = '2026-05-04T19:28:50.548Z';
    const RETRY_HANDOFF_PROGRESS_AT_MS = 1777922930548;
    const RETRY_HANDOFF_DELAY_MS = 250;
    const PUBLICATION_EPOCH = 4;
    const PARTITION_ID = 'sql_transactions-p1';
    const ACTIVE_REPLACE_PARTITION_ID = 'sql_write_operations-p1';
    const SAFETY_RETRY_PARTITION_ID = 'zz_safety_retry-p1';
    const OPERATION_ID = 'op-retry-handoff';
    const ACTIVE_REPLACE_OPERATION_ID = 'op-active-replace-retry';
    const SAFETY_RETRY_OPERATION_ID = 'op-safety-retry';
    const TARGET_NODE_ID = 'target-node-1';
    const CORRELATION_KEY = 'sql_transactions-p1|4|op-retry-handoff';
    const ACTIVE_REPLACE_CORRELATION_KEY =
      'sql_write_operations-p1|4|op-active-replace-retry';
    const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
    const WORKFLOW_STEP_PENDING = 'PENDING';
    const WORKFLOW_STEP_SENDING = 'SENDING';
    const OPERATION_STATUS_PENDING = 'pending';
    const OPERATION_STATUS_RETRY_DEFERRED = 'retry_deferred';
    const SEMANTIC_STATE_OPERATION_STALLED = 'operation_stalled';
    const BLOCKER_OPERATION_NO_TRANSITIONS =
      'operation_created_but_no_step_transitions';
    const OWNER_OPERATION_WORKFLOW = 'operation_workflow_owner';
    const ACTUATION_STATE_TRANSITION_DEFERRED = 'transition_deferred';
    const ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS =
      'dispatched_waiting_progress';
    const BOUNDARY_WORKFLOW_TIMEOUT = 'workflow_timeout';
    const BOUNDARY_WORKFLOW_PROGRESS = 'workflow_progress';
    const BOUNDARY_REBALANCER_HANDOFF = 'rebalancer_handoff';
    const WAIT_MODE_TIMEOUT_RECONCILE_DUE = 'timeout_reconcile_due';
    const WAIT_MODE_RETRY_SCHEDULED = 'retry_scheduled';
    const NEXT_ACTION_RECONCILE_STALE_OPERATION_PROGRESS =
      'reconcile_stale_operation_progress';
    const NEXT_ACTION_WAIT_FOR_OPERATION_PROGRESS =
      'wait_for_operation_progress';
    const LOG_MESSAGE_OPERATION_DISPATCH_RETRY_DEFERRED =
      'Deferred retryable replica operation dispatch failure';
    const OPERATION_WORKFLOW_BOUNDARY_COORDINATOR_CREATED_REMOTE_HANDOFF =
      'coordinator_created_remote_handoff';
    const OPERATION_WORKFLOW_BOUNDARY_PRIORITY_ACTIVE_REPLACE_RESUME =
      'priority_active_replace_resume';
    const RETRYABLE_ERROR_MESSAGE =
      'Connection closed before message acknowledgement';
    const EXPECTED_NODE_COUNT = 5;
    const ACTIVE_NODE_COUNT = 4;
    const SNAPSHOT_COVERAGE_NODE_COUNT = 3;
    const EXPECTED_PROGRESS_WITNESS_COUNT = 2;
    const ZERO_COUNT = 0;
    const ONE_COUNT = 1;
    const scenarioDir = join(state.outputDir, SCENARIO_NAME);
    await mkdir(scenarioDir, {recursive: true});
    await writeFile(
      join(scenarioDir, PLAYBACK_EVENTS_FILENAME),
      [
        JSON.stringify({
          timestamp: STALE_STAGE_TIMESTAMP_MS,
          type: PLAYBACK_EVENT_TYPE_CLUSTER_STAGE,
          scope: PLAYBACK_EVENT_SCOPE_CLUSTER,
          entityId: PLAYBACK_EVENT_ENTITY_CLUSTER,
          details: {
            stage: PLAYBACK_STAGE_SETUP_CLUSTER_WAITING_ACTIVE,
            snapshotCoverage: {
              completeCoverage: false,
              bestCoverageNodeCount: SNAPSHOT_COVERAGE_NODE_COUNT,
              expectedNodeCount: EXPECTED_NODE_COUNT,
              selectedNodeId: SELECTED_NODE_ONE_ID,
              selectedCapturedAtMs: STALE_SNAPSHOT_CAPTURED_AT_MS,
              selectedObservedNodeIds: [
                SELECTED_NODE_ONE_ID,
                SELECTED_NODE_TWO_ID,
                SELECTED_NODE_THREE_ID,
              ],
              selectedControlPlaneDiagnosticsAvailable: true,
              selectedPublicationConvergence: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                publishedActiveNodeIds: [
                  SELECTED_NODE_ONE_ID,
                  SELECTED_NODE_TWO_ID,
                  SELECTED_NODE_THREE_ID,
                ],
              },
              selectedPriorityRecoveryDecisionSnapshots: {
                publicationEpoch: PUBLICATION_EPOCH,
                capturedAt: STALE_SNAPSHOT_CAPTURED_AT_MS,
                priorityPartitionSummary: {
                  satisfied: false,
                  missingPartitionIds: [
                    PARTITION_ID,
                    ACTIVE_REPLACE_PARTITION_ID,
                  ],
                  blockedPartitionCount: EXPECTED_PROGRESS_WITNESS_COUNT,
                },
                snapshots: [{
                  partitionId: PARTITION_ID,
                  epoch: PUBLICATION_EPOCH,
                  operationId: OPERATION_ID,
                  correlationKey: CORRELATION_KEY,
                  semanticState: SEMANTIC_STATE_OPERATION_STALLED,
                  blockerReasons: [BLOCKER_OPERATION_NO_TRANSITIONS],
                  coordinator: {
                    operationIds: [OPERATION_ID],
                    operation: {
                      operationId: OPERATION_ID,
                      status: OPERATION_STATUS_PENDING,
                      workflowStep: WORKFLOW_STEP_PENDING,
                      updatedAtMs: STALE_OPERATION_PROGRESS_AT_MS,
                    },
                  },
                }, {
                  partitionId: ACTIVE_REPLACE_PARTITION_ID,
                  epoch: PUBLICATION_EPOCH,
                  operationId: ACTIVE_REPLACE_OPERATION_ID,
                  correlationKey: ACTIVE_REPLACE_CORRELATION_KEY,
                  semanticState: SEMANTIC_STATE_OPERATION_STALLED,
                  blockerReasons: [BLOCKER_OPERATION_NO_TRANSITIONS],
                  coordinator: {
                    operationIds: [ACTIVE_REPLACE_OPERATION_ID],
                    operation: {
                      operationId: ACTIVE_REPLACE_OPERATION_ID,
                      status: OPERATION_STATUS_PENDING,
                      workflowStep: WORKFLOW_STEP_PENDING,
                      updatedAtMs: STALE_OPERATION_PROGRESS_AT_MS,
                    },
                  },
                }],
              },
            },
            publicationConvergenceGate: {
              ready: false,
              reasons: [],
              publicationStatus: PUBLICATION_STATUS_PUBLISHED,
              pendingAckNodeIds: [],
              missingPublishedNodeIds: [],
            },
            activeGate: {
              mode: ACTIVE_GATE_MODE_STARTUP,
              state: ACTIVE_GATE_STATE_TIMED_OUT,
              ready: false,
              progress: {
                expectedNodeCount: EXPECTED_NODE_COUNT,
                activeNodeCount: ACTIVE_NODE_COUNT,
                inactiveNodeCount: ONE_COUNT,
                snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_NODE_COUNT,
                snapshotCoverageComplete: false,
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckCount: ZERO_COUNT,
                missingPublishedCount: ZERO_COUNT,
                gateReasons: [],
                prioritySpreadSatisfied: false,
                priorityBlockedPartitionCount: ONE_COUNT,
                priorityRecoveryProgressClasses: {
                  unresolvedClassIds: [BLOCKER_OPERATION_NO_TRANSITIONS],
                  unresolvedClassCount: ONE_COUNT,
                  unresolvedSemanticStateIds: [
                    SEMANTIC_STATE_OPERATION_STALLED,
                  ],
                  unresolvedSemanticStateCount: ONE_COUNT,
                  blockedPartitionIds: [PARTITION_ID],
                  blockedPartitionCount: EXPECTED_PROGRESS_WITNESS_COUNT,
                },
                blockers: [SNAPSHOT_COVERAGE_BLOCKER],
              },
            },
          },
        }),
      ].join(LINE_SEPARATOR) + LINE_SEPARATOR,
    );
    await writeFile(
      join(scenarioDir, NODE_LOG_FILENAME),
      [
        JSON.stringify({
          time: RETRY_HANDOFF_PROGRESS_TIME,
          subsystem: LOG_SUBSYSTEM_REBALANCE_COORDINATOR,
          msg: LOG_MESSAGE_OPERATION_DISPATCH_RETRY_DEFERRED,
          operationId: OPERATION_ID,
          partitionId: PARTITION_ID,
          targetNodeId: TARGET_NODE_ID,
          workflowStep: WORKFLOW_STEP_SENDING,
          delayMs: RETRY_HANDOFF_DELAY_MS,
          errorMessage: RETRYABLE_ERROR_MESSAGE,
          boundary:
            OPERATION_WORKFLOW_BOUNDARY_COORDINATOR_CREATED_REMOTE_HANDOFF,
        }),
        JSON.stringify({
          time: RETRY_HANDOFF_PROGRESS_TIME,
          subsystem: LOG_SUBSYSTEM_REBALANCE_COORDINATOR,
          msg: LOG_MESSAGE_OPERATION_DISPATCH_RETRY_DEFERRED,
          operationId: ACTIVE_REPLACE_OPERATION_ID,
          partitionId: ACTIVE_REPLACE_PARTITION_ID,
          targetNodeId: TARGET_NODE_ID,
          workflowStep: WORKFLOW_STEP_SENDING,
          delayMs: RETRY_HANDOFF_DELAY_MS,
          errorMessage: RETRYABLE_ERROR_MESSAGE,
          boundary:
            OPERATION_WORKFLOW_BOUNDARY_PRIORITY_ACTIVE_REPLACE_RESUME,
        }),
        JSON.stringify({
          time: RETRY_HANDOFF_PROGRESS_TIME,
          subsystem: LOG_SUBSYSTEM_REBALANCE_COORDINATOR,
          msg: LOG_MESSAGE_OPERATION_DISPATCH_RETRY_DEFERRED,
          operationId: SAFETY_RETRY_OPERATION_ID,
          partitionId: SAFETY_RETRY_PARTITION_ID,
          targetNodeId: TARGET_NODE_ID,
          workflowStep: WORKFLOW_STEP_SENDING,
          delayMs: RETRY_HANDOFF_DELAY_MS,
          errorMessage: RETRYABLE_ERROR_MESSAGE,
        }),
      ].join(LINE_SEPARATOR) + LINE_SEPARATOR,
    );

    const scenarioResult = buildPlaybackDerivedFailureResult();
    scenarioResult.details.diagnostics.controlPlaneDiagnostics = {
      publicationConvergence: {
        publicationEpoch: PUBLICATION_EPOCH,
        publicationStatus: PUBLICATION_STATUS_PUBLISHED,
        pendingAckNodeIds: [],
        pendingAckCount: ZERO_COUNT,
        missingPublishedNodeIds: [],
        missingPublishedCount: ZERO_COUNT,
        publicationPending: false,
        prioritySpreadPending: true,
      },
      priorityRecoveryObservation: {
        publicationEpoch: PUBLICATION_EPOCH,
        publicationStatus: PUBLICATION_STATUS_PUBLISHED,
        pendingAckNodeIds: [],
        pendingAckCount: ZERO_COUNT,
        missingPublishedNodeIds: [],
        missingPublishedCount: ZERO_COUNT,
        publicationPending: false,
        prioritySpreadPending: true,
        priorityRecoveryPartitionWitnesses: [{
          partitionId: PARTITION_ID,
          semanticStateId: SEMANTIC_STATE_OPERATION_STALLED,
          progressClassIds: [BLOCKER_OPERATION_NO_TRANSITIONS],
          blockerReasonCodes: [BLOCKER_OPERATION_NO_TRANSITIONS],
          progressContractState: OPERATION_STATUS_PENDING,
          actuationState: ACTUATION_STATE_TRANSITION_DEFERRED,
          currentOwner: OWNER_OPERATION_WORKFLOW,
          actuationOwner: OWNER_OPERATION_WORKFLOW,
          blockingBoundary: BOUNDARY_WORKFLOW_TIMEOUT,
          waitMode: WAIT_MODE_TIMEOUT_RECONCILE_DUE,
          nextRequiredAction:
            NEXT_ACTION_RECONCILE_STALE_OPERATION_PROGRESS,
          operationIds: [OPERATION_ID],
          witnessIds: [OPERATION_ID],
          correlationKey: CORRELATION_KEY,
          lastProgressAtMs: STALE_OPERATION_PROGRESS_AT_MS,
          latestOperationWorkflowStep: WORKFLOW_STEP_PENDING,
          latestOperationStatus: OPERATION_STATUS_PENDING,
        }, {
          partitionId: ACTIVE_REPLACE_PARTITION_ID,
          semanticStateId: SEMANTIC_STATE_OPERATION_STALLED,
          progressClassIds: [BLOCKER_OPERATION_NO_TRANSITIONS],
          blockerReasonCodes: [BLOCKER_OPERATION_NO_TRANSITIONS],
          progressContractState: OPERATION_STATUS_PENDING,
          actuationState: ACTUATION_STATE_TRANSITION_DEFERRED,
          currentOwner: OWNER_OPERATION_WORKFLOW,
          actuationOwner: OWNER_OPERATION_WORKFLOW,
          blockingBoundary: BOUNDARY_WORKFLOW_TIMEOUT,
          waitMode: WAIT_MODE_TIMEOUT_RECONCILE_DUE,
          nextRequiredAction:
            NEXT_ACTION_RECONCILE_STALE_OPERATION_PROGRESS,
          operationIds: [ACTIVE_REPLACE_OPERATION_ID],
          witnessIds: [ACTIVE_REPLACE_OPERATION_ID],
          correlationKey: ACTIVE_REPLACE_CORRELATION_KEY,
          lastProgressAtMs: STALE_OPERATION_PROGRESS_AT_MS,
          latestOperationWorkflowStep: WORKFLOW_STEP_PENDING,
          latestOperationStatus: OPERATION_STATUS_PENDING,
        }],
      },
    };
    const writer = new ReportWriter(state.reportPath);
    writer.addResult(SCENARIO_NAME, scenarioResult);

    const {scenarioBundles, runBundle} = await writeFailureBundlesForReport({
      scenarios: writer.scenarios,
      reportOutputPath: state.reportPath,
      outputDir: state.outputDir,
      reportSummary: {total: ONE_COUNT, fail: ONE_COUNT, pass: ZERO_COUNT},
      standardSummary: {scenarios: []},
      benchmarkRegressionGate: {status: FAILURE_BUNDLE_STATUS_SKIPPED},
      workspaceRoot: state.tempDir,
    });
    await writer.write({failureBundle: runBundle});

    const scenarioBundle = JSON.parse(
      await readFile(
        resolve(state.tempDir, scenarioBundles[ZERO_COUNT].links.jsonPath),
        UTF8_ENCODING,
      ),
    );
    const dominantWitness =
      scenarioBundle.publicationConvergence.priorityRecoveryProgressSummary
        .dominantWitness;
    const progressSummary =
      scenarioBundle.publicationConvergence.priorityRecoveryProgressSummary;

    assert.equal(
      progressSummary.partitionCount,
      EXPECTED_PROGRESS_WITNESS_COUNT,
    );
    assert.equal(
      progressSummary.blockingBoundaryCounts[BOUNDARY_REBALANCER_HANDOFF],
      ONE_COUNT,
    );
    assert.equal(
      progressSummary.blockingBoundaryCounts[BOUNDARY_WORKFLOW_PROGRESS],
      ONE_COUNT,
    );
    assert.equal(
      Object.hasOwn(
        progressSummary.blockingBoundaryCounts,
        BOUNDARY_WORKFLOW_TIMEOUT,
      ),
      false,
    );
    assert.equal(dominantWitness.partitionId, PARTITION_ID);
    assert.equal(dominantWitness.blockingBoundary, BOUNDARY_REBALANCER_HANDOFF);
    assert.equal(dominantWitness.waitMode, WAIT_MODE_RETRY_SCHEDULED);
    assert.equal(
      dominantWitness.nextRequiredAction,
      NEXT_ACTION_WAIT_FOR_OPERATION_PROGRESS,
    );
    assert.equal(
      dominantWitness.actuationState,
      ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
    );
    assert.equal(
      dominantWitness.latestOperationWorkflowStep,
      WORKFLOW_STEP_SENDING,
    );
    assert.equal(
      dominantWitness.latestOperationStatus,
      OPERATION_STATUS_RETRY_DEFERRED,
    );
    assert.equal(dominantWitness.lastProgressAtMs, RETRY_HANDOFF_PROGRESS_AT_MS);
  });


  registerFailureBundlePlaybackStartupTests({
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
  });
}
