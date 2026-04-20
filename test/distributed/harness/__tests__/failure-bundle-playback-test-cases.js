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
  it("derives root-cause, readiness reasons, and first-fault timeline from playback events", async () => {
    const scenarioDir = join(state.outputDir, "node-join-under-load");
    await mkdir(scenarioDir, { recursive: true });
    await writeFile(
      join(scenarioDir, "events.ndjson"),
      [
        JSON.stringify({
          timestamp: 1000,
          type: "cluster.stage",
          scope: "cluster",
          entityId: "cluster",
          details: {
            stage: "setup.cluster.waiting-active",
            nodeDiagnostics: [
              {
                nodeId: "node-1",
                reasons: ["local_query_transport_not_ready"],
              },
            ],
          },
        }),
        JSON.stringify({
          timestamp: 2000,
          type: "load.started",
          scope: "load",
          entityId: "load-run",
          details: {
            options: { opsPerSec: 50, duration: "30s" },
          },
        }),
        JSON.stringify({
          timestamp: 2010,
          type: "load.progress",
          scope: "load",
          entityId: "load-run",
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
          type: "load.progress",
          scope: "load",
          entityId: "load-run",
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
          type: "load.progress",
          scope: "load",
          entityId: "load-run",
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
          type: "load.progress",
          scope: "load",
          entityId: "load-run",
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
          type: "cluster.stage",
          scope: "cluster",
          entityId: "cluster",
          details: {
            stage: "setup.cluster.waiting-active",
            nodeDiagnostics: [
              {
                nodeId: "node-2",
                reasons: ["READINESS_STABLE_WINDOW_PENDING"],
              },
            ],
          },
        }),
      ].join("\n") + "\n",
    );

    const writer = new ReportWriter(state.reportPath);
    writer.addResult(
      "node-join-under-load",
      buildPlaybackDerivedFailureResult(),
    );
    const scenarioEntry = writer.scenarios[0];

    const { scenarioBundles, runBundle } = await writeFailureBundlesForReport({
      scenarios: writer.scenarios,
      reportOutputPath: state.reportPath,
      outputDir: state.outputDir,
      reportSummary: { total: 1, fail: 1, pass: 0 },
      standardSummary: { scenarios: [] },
      benchmarkRegressionGate: { status: "skipped" },
      workspaceRoot: state.tempDir,
    });
    await writer.write({ failureBundle: runBundle });

    assert.equal(scenarioBundles.length, 1);
    const scenarioBundle = JSON.parse(
      await readFile(
        resolve(state.tempDir, scenarioBundles[0].links.jsonPath),
        UTF8_ENCODING,
      ),
    );
    assert.equal(scenarioBundle.summary.rootCauseClass, "load");
    assert.equal(scenarioBundle.summary.dominantReason, "nodeAdmissionBlocked");
    assert.deepEqual(scenarioBundle.readiness.nodeReasonsByNodeId, {
      "node-1": ["local_query_transport_not_ready"],
      "node-2": ["READINESS_STABLE_WINDOW_PENDING"],
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
      ["queuePressureOnset", "attemptErrorOnset", "hardFailureOnset"],
    );

    assert.equal(
      scenarioEntry.details.diagnostics.failure.rootCauseClass,
      "load",
    );
    assert.equal(
      scenarioEntry.details.diagnostics.failure.dominantReason,
      "nodeAdmissionBlocked",
    );
    assert.ok(
      scenarioEntry.details.diagnostics.firstFaultTimeline,
      "report scenario entry should include derived first-fault timeline",
    );

    const reportJson = JSON.parse(
      await readFile(state.reportPath, UTF8_ENCODING),
    );
    assert.equal(
      reportJson.scenarios[0].details.diagnostics.failure.rootCauseClass,
      "load",
    );
    assert.equal(
      reportJson.scenarios[0].details.diagnostics.failure.dominantReason,
      "nodeAdmissionBlocked",
    );
    assert.ok(
      reportJson.scenarios[0].details.diagnostics.firstFaultTimeline,
      "written report should persist derived first-fault timeline",
    );
  });

  it("derives publication convergence from playback active-gate diagnostics", async () => {
    const scenarioDir = join(state.outputDir, "seed-restart-under-load");
    await mkdir(scenarioDir, { recursive: true });
    await writeFile(
      join(scenarioDir, "events.ndjson"),
      [
        JSON.stringify({
          timestamp: 5000,
          type: "cluster.stage",
          scope: "cluster",
          entityId: "cluster",
          details: {
            stage: "setup.cluster.waiting-active",
            nodeDiagnostics: [
              {
                nodeId: "seed-1",
                reasons: [],
              },
              {
                nodeId: "joiner-1",
                reasons: [],
              },
            ],
            snapshotCoverage: {
              completeCoverage: true,
              expectedNodeCount: 2,
              selectedNodeId: "seed-1",
              selectedCapturedAtMs: 4990,
              selectedObservedNodeIds: ["seed-1", "joiner-1"],
              selectedControlPlaneDiagnosticsAvailable: true,
              selectedPublicationConvergence: {
                publicationEpoch: 3,
                publicationStatus: "PUBLISHED",
                pendingAckNodeIds: [],
                publishedActiveNodeIds: ["seed-1", "joiner-1"],
                projectionDiagnostics: {
                  readinessDecisionMode: "cluster_member_or_recovery_eligible",
                  readinessDecisionDimensions: [
                    "clusterMemberHealthy",
                    "controlPlaneRecoveryEligible",
                    "controlPlaneWritable",
                  ],
                  recoveryEligibleProjectionEnabled: true,
                  recoveryEligibleIncludedNodeIds: ["joiner-1"],
                  readinessExcludedNodeIds: ["seed-2"],
                  clusterMemberUnhealthyExcludedNodeIds: ["seed-2"],
                },
                priorityPartitionSummary: {
                  satisfied: false,
                  requiredDistinctNodeCount: 3,
                  readyEligibleNodeCount: 2,
                  totalPriorityPartitionCount: 5,
                  missingPartitionIds: [
                    "control_plane_publications-p1",
                    "replica_operations-p1",
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
                    partitionId: "control_plane_publications-p1",
                    epoch: 3,
                    operationId: null,
                    correlationKey:
                      "control_plane_publications-p1|3|operation_unknown",
                    semanticState: "blocked_unclassified",
                    blockerReasons: ["eligible_but_no_operation_created"],
                    planner: {
                      spreadGap: 1,
                    },
                    admission: {
                      eligibleNodeIds: [],
                      effectiveEligibleNodeIds: ["joiner-1", "joiner-2"],
                      decisionDimension: "repairEligible",
                    },
                    readiness: {
                      learnerPromotion: {
                        activeLearnerNodeIds: [],
                        promotableLearnerNodeIds: [],
                      },
                    },
                  },
                  {
                    partitionId: "replica_operations-p1",
                    epoch: 3,
                    operationId: "op-1",
                    correlationKey: "replica_operations-p1|3|op-1",
                    semanticState: "recovering_in_flight",
                    blockerReasons: [
                      "operation_created_but_no_step_transitions",
                      "learner_active_but_never_promotable",
                    ],
                    planner: {
                      spreadGap: 1,
                    },
                    admission: {
                      eligibleNodeIds: [],
                      effectiveEligibleNodeIds: [
                        "joiner-1",
                        "joiner-2",
                        "joiner-3",
                      ],
                      decisionDimension: "controlPlaneRecoveryEligible",
                    },
                    coordinator: {
                      operationIds: ["op-1"],
                      operation: {
                        operationId: "op-1",
                        status: "open",
                        workflowStep: "DISPATCHED",
                        latestTimelineStep: "CREATE_REPLICA",
                        updatedAtMs: 5100,
                      },
                    },
                    readiness: {
                      learnerPromotion: {
                        activeLearnerNodeIds: ["joiner-1"],
                        promotableLearnerNodeIds: [],
                      },
                    },
                  },
                ],
                blockerPartitionIdsByReason: {
                  eligible_but_no_operation_created: [
                    "control_plane_publications-p1",
                  ],
                  operation_created_but_no_step_transitions: [
                    "replica_operations-p1",
                  ],
                  learner_active_but_never_promotable: [
                    "replica_operations-p1",
                  ],
                  publication_recovery_eligible_but_coordinator_excludes_node:
                    [],
                },
              },
            },
            publicationConvergenceGate: {
              ready: false,
              reasons: ["priority_control_plane_spread_pending"],
              publicationStatus: "PUBLISHED",
              pendingAckNodeIds: [],
              missingPublishedNodeIds: [],
              priorityPartitionSummary: {
                satisfied: false,
                requiredDistinctNodeCount: 3,
                readyEligibleNodeCount: 2,
                totalPriorityPartitionCount: 5,
                missingPartitionIds: [
                  "control_plane_publications-p1",
                  "replica_operations-p1",
                ],
                blockedPartitionCount: 2,
                largestSpreadGap: 1,
                totalSpreadGap: 2,
              },
            },
            activeGateProgress: {
              expectedNodeCount: 2,
              activeNodeCount: 2,
              inactiveNodeCount: 0,
              snapshotCoverageNodeCount: 2,
              snapshotCoverageComplete: true,
              publicationStatus: "PUBLISHED",
              pendingAckCount: 0,
              missingPublishedCount: 0,
              gateReasonCount: 1,
              gateReasons: ["priority_control_plane_spread_pending"],
              prioritySpreadSatisfied: false,
              prioritySpreadGap: 2,
              blockers: [
                "publication_gate=priority_control_plane_spread_pending",
              ],
              blockerSignature:
                "publication_gate=priority_control_plane_spread_pending",
            },
            activeGateBestProgress: {
              expectedNodeCount: 2,
              activeNodeCount: 2,
              inactiveNodeCount: 0,
              snapshotCoverageNodeCount: 2,
              snapshotCoverageComplete: true,
              publicationStatus: "PUBLISHED",
              pendingAckCount: 0,
              missingPublishedCount: 0,
              gateReasonCount: 1,
              gateReasons: ["priority_control_plane_spread_pending"],
              prioritySpreadSatisfied: false,
              prioritySpreadGap: 2,
              blockers: [
                "publication_gate=priority_control_plane_spread_pending",
              ],
              blockerSignature:
                "publication_gate=priority_control_plane_spread_pending",
            },
            activeGateNoProgress: {
              enabled: true,
              mode: "load",
              maxAttempts: 45,
              attemptsSinceProgress: 22,
              stalled: false,
            },
            activeGateBlockerHistory: [
              {
                signature:
                  "publication_gate=priority_control_plane_spread_pending",
                blockers: [
                  "publication_gate=priority_control_plane_spread_pending",
                ],
                count: 11,
                firstAttempt: 20,
                firstElapsedMs: 20000,
                lastAttempt: 40,
                lastElapsedMs: 40000,
              },
            ],
            priorityRecoveryInvariants: {
              invariants: [
                {
                  id: "priority_recovery_bootstrap_ready_allows_join_during_priority_recovery",
                  reasonCode:
                    "priority_recovery_bootstrap_join_not_admitted_during_recovery",
                  severity: "error",
                  scope: "cluster",
                  owningSubsystem: "distributed_harness_cluster_active_gate",
                  passed: true,
                  details: {
                    mode: "load",
                    prioritySpreadPending: true,
                    bootstrapAdmittedNodeIds: ["joiner-1"],
                  },
                },
                {
                  id:
                    "priority_recovery_cluster_active_requires_publication_" +
                    "convergence_and_priority_spread",
                  reasonCode:
                    "priority_recovery_cluster_marked_active_without_convergence",
                  severity: "error",
                  scope: "cluster",
                  owningSubsystem: "distributed_harness_cluster_active_gate",
                  passed: false,
                  details: {
                    mode: "load",
                    allActive: true,
                    publicationConvergenceReady: false,
                  },
                },
              ],
              failingInvariantIds: [
                "priority_recovery_cluster_active_requires_publication_" +
                  "convergence_and_priority_spread",
              ],
              passed: false,
            },
          },
        }),
      ].join("\n") + "\n",
    );

    const writer = new ReportWriter(state.reportPath);
    writer.addResult(
      "seed-restart-under-load",
      buildPlaybackDerivedFailureResult(),
    );

    const { scenarioBundles, runBundle } = await writeFailureBundlesForReport({
      scenarios: writer.scenarios,
      reportOutputPath: state.reportPath,
      outputDir: state.outputDir,
      reportSummary: { total: 1, fail: 1, pass: 0 },
      standardSummary: { scenarios: [] },
      benchmarkRegressionGate: { status: "skipped" },
      workspaceRoot: state.tempDir,
    });
    await writer.write({ failureBundle: runBundle });

    assert.equal(scenarioBundles.length, 1);
    const scenarioBundle = JSON.parse(
      await readFile(
        resolve(state.tempDir, scenarioBundles[0].links.jsonPath),
        UTF8_ENCODING,
      ),
    );

    assert.equal(
      scenarioBundle.controlPlane.publicationConvergence.publicationStatus,
      "PUBLISHED",
    );
    assert.deepEqual(
      scenarioBundle.controlPlane.publicationConvergenceGate.reasons,
      ["priority_control_plane_spread_pending"],
    );
    assert.equal(
      scenarioBundle.publicationConvergence.prioritySpreadPending,
      true,
    );
    assert.equal(
      scenarioBundle.publicationConvergence.closureRecordId,
      "CL-003",
    );
    assert.equal(
      scenarioBundle.publicationConvergence.closureWitnessClass,
      "publication_converged_priority_spread_pending",
    );
    assert.equal(
      scenarioBundle.publicationConvergence.activeGateNoProgress
        .attemptsSinceProgress,
      22,
    );
    assert.equal(
      scenarioBundle.publicationConvergence.activeGateProgress.gateReasonCount,
      1,
    );
    assert.equal(
      scenarioBundle.publicationConvergence.activeGateBlockerHistory[0]
        .signature,
      "publication_gate=priority_control_plane_spread_pending",
    );
    assert.deepEqual(
      scenarioBundle.publicationConvergence.projectionDiagnostics,
      {
        readinessDecisionMode: "cluster_member_or_recovery_eligible",
        readinessDecisionDimensions: [
          "clusterMemberHealthy",
          "controlPlaneRecoveryEligible",
          "controlPlaneWritable",
        ],
        recoveryEligibleProjectionEnabled: true,
        recoveryEligibleIncludedNodeIds: ["joiner-1"],
        readinessExcludedNodeIds: ["seed-2"],
        clusterMemberUnhealthyExcludedNodeIds: ["seed-2"],
      },
    );
    assert.equal(
      scenarioBundle.publicationConvergence.priorityRecoveryProgressClassCount,
      3,
    );
    assert.deepEqual(
      scenarioBundle.publicationConvergence.priorityRecoveryProgressClassIds,
      [
        "eligible_but_no_operation_created",
        "learner_active_but_never_promotable",
        "operation_created_but_no_step_transitions",
      ],
    );
    assert.deepEqual(
      scenarioBundle.publicationConvergence.priorityRecoveryBlockedPartitionIds,
      ["control_plane_publications-p1", "replica_operations-p1"],
    );
    assert.deepEqual(
      scenarioBundle.publicationConvergence.priorityRecoveryPartitionWitnesses,
      [
        {
          partitionId: "control_plane_publications-p1",
          semanticState: "blocked_unclassified",
          blockerReasons: ["eligible_but_no_operation_created"],
          spreadGap: 1,
          decisionDimension: "repairEligible",
          eligibleNodeCount: 2,
          recoveryEligibleExcludedNodeIds: [],
          activeLearnerNodeIds: [],
          promotableLearnerNodeIds: [],
          operationIds: [],
          latestOperationWorkflowStep: null,
          latestOperationStatus: null,
          latestOperationTimelineStep: null,
        },
        {
          partitionId: "replica_operations-p1",
          semanticState: "recovering_in_flight",
          blockerReasons: [
            "operation_created_but_no_step_transitions",
            "learner_active_but_never_promotable",
          ],
          spreadGap: 1,
          decisionDimension: "controlPlaneRecoveryEligible",
          eligibleNodeCount: 3,
          recoveryEligibleExcludedNodeIds: [],
          activeLearnerNodeIds: ["joiner-1"],
          promotableLearnerNodeIds: [],
          operationIds: ["op-1"],
          latestOperationWorkflowStep: "DISPATCHED",
          latestOperationStatus: "open",
          latestOperationTimelineStep: "CREATE_REPLICA",
        },
      ],
    );
    assert.equal(
      scenarioBundle.publicationConvergence
        .priorityRecoveryInvariantFailingIds[0],
      "priority_recovery_cluster_active_requires_publication_convergence_and_priority_spread",
    );
    assert.equal(
      scenarioBundle.publicationConvergence.priorityRecoveryInvariantFailures[0]
        .reasonCode,
      "priority_recovery_cluster_marked_active_without_convergence",
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
      "publication_convergence_blocked",
    );
    assert.equal(
      scenarioBundle.summary.stabilityGates.failover.status,
      "closed",
    );
    assert.equal(
      scenarioBundle.summary.stabilityGates.convergence.status,
      "open",
    );
    assert.deepEqual(
      scenarioBundle.summary.stabilityGates.convergence.blockers,
      ["priority_spread_pending", "closure_record"],
    );
    assert.equal(
      scenarioBundle.summary.stabilityGates.restart_recovery.status,
      "open",
    );
    assert.ok(
      scenarioBundle.summary.failureClassification.signals.includes(
        "closureRecordId=CL-003",
      ),
    );
    assert.ok(
      scenarioBundle.summary.failureClassification.signals.includes(
        "closureWitnessClass=publication_converged_priority_spread_pending",
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
      "CL-003",
    );
    assert.equal(
      reportJson.scenarios[0].publicationConvergence.closureWitnessClass,
      "publication_converged_priority_spread_pending",
    );
    assert.equal(
      reportJson.scenarios[0].publicationConvergence.activeGateNoProgress
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
      ["priority_spread_pending", "closure_record"],
    );
    assert.equal(
      reportJson.scenarios[0].failureClassification.failureClass,
      "publication_convergence_blocked",
    );
    assert.ok(
      reportJson.scenarios[0].failureClassification.signals.includes(
        "closureRecordId=CL-003",
      ),
    );

    const scenarioMarkdown = await readFile(
      resolve(state.tempDir, scenarioBundles[0].links.markdownPath),
      UTF8_ENCODING,
    );
    const priorityRecoveryWitnessPattern = new RegExp(
      [
        "Priority Recovery Partition Witnesses: ",
        "control_plane_publications-p1#state=blocked_unclassified",
        "#gap=1#blockers=eligible_but_no_operation_created",
        "#decision=repairEligible#eligible=2, ",
        "replica_operations-p1#state=recovering_in_flight",
        "#gap=1#blockers=",
        "operation_created_but_no_step_transitions",
        "\\|learner_active_but_never_promotable",
        "#decision=controlPlaneRecoveryEligible#eligible=3",
        "#ops=op-1#step=CREATE_REPLICA#status=open",
        "#learners=joiner-1",
      ].join(""),
    );
    assert.match(
      scenarioMarkdown,
      priorityRecoveryWitnessPattern,
    );
  });

  it("classifies startup playback active-gate no-progress witness as CL-006 and preserves admission state", async () => {
    const scenarioDir = join(state.outputDir, "seed-restart-under-load");
    await mkdir(scenarioDir, { recursive: true });
    const activeGateAdmissionState = {
      mode: "blocked",
      blockedNodeCount: 2,
      blockedNodeIds: ["seed-1", "joiner-1"],
    };
    await writeFile(
      join(scenarioDir, "events.ndjson"),
      [
        JSON.stringify(
          buildPlaybackActiveGateStageEvent({
            readinessMode: "startup",
            activeGateAdmissionState,
            activeGateCurrentProgress: buildStartupModeWitnessProgress({
              snapshotCoverageNodeCount: 2,
              isTimeoutError: false,
            }),
          }),
        ),
      ].join("\n") + "\n",
    );

    const writer = new ReportWriter(state.reportPath);
    writer.addResult(
      "seed-restart-under-load",
      buildPlaybackDerivedFailureResult(),
    );

    const { scenarioBundles, runBundle } = await writeFailureBundlesForReport({
      scenarios: writer.scenarios,
      reportOutputPath: state.reportPath,
      outputDir: state.outputDir,
      reportSummary: { total: 1, fail: 1, pass: 0 },
      standardSummary: { scenarios: [] },
      benchmarkRegressionGate: { status: "skipped" },
      workspaceRoot: state.tempDir,
    });
    await writer.write({ failureBundle: runBundle });

    assert.equal(scenarioBundles.length, 1);
    const scenarioBundle = JSON.parse(
      await readFile(
        resolve(state.tempDir, scenarioBundles[0].links.jsonPath),
        UTF8_ENCODING,
      ),
    );

    assert.equal(
      scenarioBundle.publicationConvergence.closureRecordId,
      "CL-006",
    );
    assert.equal(
      scenarioBundle.publicationConvergence.closureWitnessClass,
      "startup_active_publication_lag",
    );
    assert.deepEqual(
      scenarioBundle.controlPlane.activeGateAdmissionState,
      activeGateAdmissionState,
    );
    assert.equal(
      scenarioBundle.controlPlane.activeGateNoProgress.currentProgress
        .selectedSnapshotReachableBy,
      "admin_health",
    );
    assert.equal(scenarioBundle.summary.readinessFailure?.mode, "startup");
    assert.equal(scenarioBundle.summary.readinessFailure?.cause, "none");
    assert.equal(scenarioBundle.summary.failureAction, null);
    assert.equal(
      scenarioBundle.summary.stabilityGates.restart_recovery.status,
      "open",
    );
    assert.equal(
      scenarioBundle.summary.stabilityGates.restart_recovery.blockers.includes(
        "startup_readiness_blocked",
      ),
      true,
    );
  });

  it("classifies startup playback active-gate timeout witness with explicit readiness delay metadata", async () => {
    const scenarioDir = join(
      state.outputDir,
      "seed-restart-under-load-timeout",
    );
    await mkdir(scenarioDir, { recursive: true });
    await writeFile(
      join(scenarioDir, "events.ndjson"),
      [
        JSON.stringify(
          buildPlaybackActiveGateStageEvent({
            readinessMode: "startup",
            activeGateCurrentProgress: buildStartupModeWitnessProgress({
              snapshotCoverageNodeCount: 0,
              isTimeoutError: true,
            }),
          }),
        ),
      ].join("\n") + "\n",
    );

    const writer = new ReportWriter(state.reportPath);
    writer.addResult(
      "seed-restart-under-load-timeout",
      buildPlaybackDerivedFailureResult(),
    );

    const { scenarioBundles, runBundle } = await writeFailureBundlesForReport({
      scenarios: writer.scenarios,
      reportOutputPath: state.reportPath,
      outputDir: state.outputDir,
      reportSummary: { total: 1, fail: 1, pass: 0 },
      standardSummary: { scenarios: [] },
      benchmarkRegressionGate: { status: "skipped" },
      workspaceRoot: state.tempDir,
    });
    await writer.write({ failureBundle: runBundle });

    assert.equal(scenarioBundles.length, 1);
    const scenarioBundle = JSON.parse(
      await readFile(
        resolve(state.tempDir, scenarioBundles[0].links.jsonPath),
        UTF8_ENCODING,
      ),
    );

    assert.equal(
      scenarioBundle.publicationConvergence.closureRecordId,
      "CL-004",
    );
    assert.equal(
      scenarioBundle.publicationConvergence.closureWitnessClass,
      "startup_active_snapshot_timeout",
    );
    assert.equal(
      scenarioBundle.publicationConvergence.activeGateReadinessDelay?.timedOut,
      true,
    );
    assert.equal(
      scenarioBundle.publicationConvergence.activeGateReadinessDelay?.cause,
      "snapshot_timeout",
    );
    assert.equal(
      scenarioBundle.publicationConvergence.activeGateReadinessDelay
        ?.recoverability,
      "terminal",
    );
    assert.equal(
      scenarioBundle.summary.failureClassification.signals.includes(
        "activeGateReadinessDelay=timeout",
      ),
      true,
    );
    assert.equal(
      scenarioBundle.summary.failureClassification.signals.includes(
        "activeGateReadinessCause=snapshot_timeout",
      ),
      true,
    );
    assert.equal(
      scenarioBundle.summary.failureClassification.signals.includes(
        "activeGateReadinessRecoverability=terminal",
      ),
      true,
    );

    assert.equal(
      scenarioBundle.summary.readinessFailure?.classCode,
      "snapshot_timeout",
    );
    assert.equal(
      scenarioBundle.summary.readinessFailure?.recoverability,
      "terminal",
    );
    assert.equal(
      scenarioBundle.summary.failureAction,
      "Snapshot/reachability timeout is blocking convergence.",
    );
    assert.equal(
      scenarioBundle.summary.operatorRecommendation,
      "Inspect snapshot query latency, admin readiness, and host/network stability before rerun.",
    );

    const triageSummary = JSON.parse(
      await readFile(
        resolve(state.tempDir, scenarioBundles[0].links.triageJsonPath),
        UTF8_ENCODING,
      ),
    );
    assert.equal(
      triageSummary.summary.readinessFailure?.classCode,
      "snapshot_timeout",
    );
    assert.equal(
      triageSummary.summary.failureAction,
      "Snapshot/reachability timeout is blocking convergence.",
    );
    assert.equal(
      triageSummary.summary.stabilityGates.restart_recovery.status,
      "open",
    );
    assert.equal(
      triageSummary.summary.stabilityGates.restart_recovery.blockers.includes(
        "closure_record",
      ),
      true,
    );

    const reportJson = JSON.parse(
      await readFile(state.reportPath, UTF8_ENCODING),
    );
    assert.equal(
      reportJson.scenarios[0].readinessFailure.classCode,
      "snapshot_timeout",
    );
    assert.equal(
      reportJson.scenarios[0].failureAction,
      "Snapshot/reachability timeout is blocking convergence.",
    );
    assert.equal(
      reportJson.scenarios[0].stabilityGates.restart_recovery.status,
      "open",
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

  it("maps closure-witness-only startup convergence failures to a non-unknown root cause", async () => {
    const scenarioDir = join(
      state.outputDir,
      "seed-restart-under-load-topology",
    );
    await mkdir(scenarioDir, { recursive: true });
    await writeFile(
      join(scenarioDir, "events.ndjson"),
      [
        JSON.stringify(
          buildPlaybackActiveGateStageEvent({
            readinessMode: "startup",
            activeGateCurrentProgress: buildStartupModeWitnessProgress({
              snapshotCoverageNodeCount: 0,
              isTimeoutError: true,
            }),
          }),
        ),
      ].join("\n") + "\n",
    );

    const writer = new ReportWriter(state.reportPath);
    writer.addResult("seed-restart-under-load-topology", {
      ...buildPlaybackDerivedFailureResult(),
      loadMetrics: null,
    });

    const { scenarioBundles, runBundle } = await writeFailureBundlesForReport({
      scenarios: writer.scenarios,
      reportOutputPath: state.reportPath,
      outputDir: state.outputDir,
      reportSummary: { total: 1, fail: 1, pass: 0 },
      standardSummary: { scenarios: [] },
      benchmarkRegressionGate: { status: "skipped" },
      workspaceRoot: state.tempDir,
    });
    await writer.write({ failureBundle: runBundle });

    const scenarioBundle = JSON.parse(
      await readFile(
        resolve(state.tempDir, scenarioBundles[0].links.jsonPath),
        UTF8_ENCODING,
      ),
    );
    assert.equal(scenarioBundle.summary.rootCauseClass, "topology");
    assert.equal(scenarioBundle.diagnostics.failure.rootCauseClass, "topology");
    assert.equal(
      scenarioBundle.topFailures.topReasons[0].reason,
      "closure_witness_startup_active_snapshot_timeout",
    );

    const triageSummary = JSON.parse(
      await readFile(
        resolve(state.tempDir, scenarioBundles[0].links.triageJsonPath),
        UTF8_ENCODING,
      ),
    );
    assert.equal(triageSummary.summary.rootCauseClass, "topology");

    const reportJson = JSON.parse(
      await readFile(state.reportPath, UTF8_ENCODING),
    );
    assert.equal(
      reportJson.scenarios[0].details.diagnostics.failure.rootCauseClass,
      "topology",
    );
  });

  it("does not classify startup-only active-gate witness in load-mode playback details", async () => {
    const scenarioDir = join(state.outputDir, "seed-restart-under-load-load");
    await mkdir(scenarioDir, { recursive: true });
    await writeFile(
      join(scenarioDir, "events.ndjson"),
      [
        JSON.stringify(
          buildPlaybackActiveGateStageEvent({
            readinessMode: "load",
            activeGateCurrentProgress: buildStartupModeWitnessProgress({
              snapshotCoverageNodeCount: 2,
              isTimeoutError: false,
            }),
          }),
        ),
      ].join("\n") + "\n",
    );

    const writer = new ReportWriter(state.reportPath);
    writer.addResult(
      "seed-restart-under-load-load",
      buildPlaybackDerivedFailureResult(),
    );

    const { scenarioBundles, runBundle } = await writeFailureBundlesForReport({
      scenarios: writer.scenarios,
      reportOutputPath: state.reportPath,
      outputDir: state.outputDir,
      reportSummary: { total: 1, fail: 1, pass: 0 },
      standardSummary: { scenarios: [] },
      benchmarkRegressionGate: { status: "skipped" },
      workspaceRoot: state.tempDir,
    });
    await writer.write({ failureBundle: runBundle });

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
    assert.equal(scenarioBundle.controlPlane.activeGateNoProgress.mode, "load");
  });

  it("prefers the richest playback active-gate diagnostics over a later timeout-only sample", async () => {
    const scenarioDir = join(state.outputDir, "seed-restart-under-load");
    await mkdir(scenarioDir, { recursive: true });
    await writeFile(
      join(scenarioDir, "events.ndjson"),
      [
        JSON.stringify({
          timestamp: 5000,
          type: "cluster.stage",
          scope: "cluster",
          entityId: "cluster",
          details: {
            stage: "setup.cluster.waiting-active",
            snapshotCoverage: {
              completeCoverage: true,
              expectedNodeCount: 2,
              bestCoverageNodeCount: 2,
              selectedNodeId: "seed-1",
              selectedCapturedAtMs: 4990,
              selectedObservedNodeIds: ["seed-1", "joiner-1"],
              selectedControlPlaneDiagnosticsAvailable: true,
              selectedPublicationConvergence: {
                publicationEpoch: 7,
                publicationStatus: "PUBLISHED",
                pendingAckNodeIds: [],
                publishedActiveNodeIds: ["seed-1", "joiner-1"],
                priorityPartitionSummary: {
                  satisfied: false,
                  requiredDistinctNodeCount: 3,
                  readyEligibleNodeCount: 2,
                  totalPriorityPartitionCount: 5,
                  missingPartitionIds: ["replica_operations-p1"],
                },
              },
            },
            publicationConvergenceGate: {
              ready: false,
              reasons: ["priority_control_plane_spread_pending"],
            },
          },
        }),
        JSON.stringify({
          timestamp: 9000,
          type: "cluster.stage",
          scope: "cluster",
          entityId: "cluster",
          details: {
            stage: "setup.cluster.waiting-active",
            snapshotCoverage: {
              completeCoverage: false,
              expectedNodeCount: 2,
              bestCoverageNodeCount: 0,
              selectedNodeId: "seed-1",
              selectedCapturedAtMs: null,
              selectedObservedNodeIds: [],
              selectedControlPlaneDiagnosticsAvailable: false,
              selectedPublicationConvergence: null,
              selectedError:
                "Admin API query timed out for node seed-1 on lane snapshot after 1ms",
            },
            publicationConvergenceGate: {
              ready: false,
              reasons: [
                "publication_convergence_missing",
                "publication_not_published=unknown",
              ],
            },
          },
        }),
      ].join("\n") + "\n",
    );

    const writer = new ReportWriter(state.reportPath);
    writer.addResult(
      "seed-restart-under-load",
      buildPlaybackDerivedFailureResult(),
    );

    const { scenarioBundles, runBundle } = await writeFailureBundlesForReport({
      scenarios: writer.scenarios,
      reportOutputPath: state.reportPath,
      outputDir: state.outputDir,
      reportSummary: { total: 1, fail: 1, pass: 0 },
      standardSummary: { scenarios: [] },
      benchmarkRegressionGate: { status: "skipped" },
      workspaceRoot: state.tempDir,
    });
    await writer.write({ failureBundle: runBundle });

    assert.equal(scenarioBundles.length, 1);
    const scenarioBundle = JSON.parse(
      await readFile(
        resolve(state.tempDir, scenarioBundles[0].links.jsonPath),
        UTF8_ENCODING,
      ),
    );

    assert.equal(
      scenarioBundle.controlPlane.publicationConvergence.publicationStatus,
      "PUBLISHED",
    );
    assert.equal(
      scenarioBundle.controlPlane.activeGateSnapshotCoverage
        .bestCoverageNodeCount,
      2,
    );
    assert.deepEqual(
      scenarioBundle.controlPlane.publicationConvergenceGate.reasons,
      ["priority_control_plane_spread_pending"],
    );
    assert.equal(
      scenarioBundle.publicationConvergence.closureRecordId,
      "CL-003",
    );
    assert.equal(
      scenarioBundle.publicationConvergence.closureWitnessClass,
      "publication_converged_priority_spread_pending",
    );
  });
}
