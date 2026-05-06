export function registerFailureBundleCore04Tests(context) {
  const {
    it,
    assert,
    join,
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

  it('derives blocked-partition counts from retained priority-partition summaries',
    async () => {
      refreshState();
      const priorityRecoveryReportPath = join(
        tempDir,
        'priority-recovery-report.json',
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
                publicationEpoch: 14,
                publicationStatus: 'PUBLISHED',
                pendingAckNodeIds: [],
                publishedActiveNodeIds: ['seed-1', 'joiner-1'],
                recoveryProtocolState: 'priority_spread_pending',
                priorityRecoveryReasonCodes: [
                  'priority_partitions_not_spread',
                ],
                priorityPartitionSummary: {
                  satisfied: false,
                  requiredDistinctNodeCount: 3,
                  readyEligibleNodeCount: 1,
                  totalPriorityPartitionCount: 5,
                  blockedPartitions: [{
                    partitionId: 'control_plane_publications-p1',
                    spreadGap: 1,
                  }, {
                    partitionId: 'replica_operations-p1',
                    spreadGap: 2,
                  }],
                  missingPartitionIds: [
                    'control_plane_publications-p1',
                    'replica_operations-p1',
                  ],
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
      const bundlePath = resolve(tempDir, scenarioBundles[0].links.jsonPath);
      const scenarioBundle = JSON.parse(
        await readFile(bundlePath, UTF8_ENCODING),
      );

      assert.equal(
        scenarioBundle.publicationConvergence.priorityPartitionSummary
          .blockedPartitionCount,
        2,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.priorityPartitionSummary
          .largestSpreadGap,
        2,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.priorityPartitionSummary
          .totalSpreadGap,
        3,
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence.priorityRecoveryBlockedPartitionIds,
        ['control_plane_publications-p1', 'replica_operations-p1'],
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryUnresolvedPartitionCount,
        0,
      );
    });

  it(
    'distinguishes convergence-blocked partitions from unresolved decision partitions',
    async () => {
      refreshState();
      const priorityRecoveryReportPath = join(
        tempDir,
        'priority-recovery-report-with-decision-mismatch.json',
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
                publicationEpoch: 15,
                publicationStatus: 'PUBLISHED',
                pendingAckNodeIds: [],
                publishedActiveNodeIds: ['seed-1', 'joiner-1'],
                recoveryProtocolState: 'priority_spread_pending',
                priorityRecoveryReasonCodes: [
                  'priority_partitions_not_spread',
                ],
                priorityPartitionSummary: {
                  satisfied: false,
                  requiredDistinctNodeCount: 3,
                  readyEligibleNodeCount: 2,
                  totalPriorityPartitionCount: 5,
                  blockedPartitions: [{
                    partitionId: 'control_plane_publications-p1',
                    spreadGap: 2,
                  }, {
                    partitionId: 'replica_operations-p1',
                    spreadGap: 1,
                  }],
                },
              },
              priorityRecoveryDecisionSnapshots: {
                schemaVersion: 1,
                publicationEpoch: 15,
                snapshots: [{
                  partitionId: 'control_plane_publications-p1',
                  semanticState: 'spread_satisfied_in_flight',
                  planner: {
                    ready: false,
                    spreadGap: 2,
                  },
                }, {
                  partitionId: 'replica_operations-p1',
                  semanticState: 'recovering_in_flight',
                  planner: {
                    ready: false,
                    spreadGap: 1,
                  },
                  coordinator: {
                    operationCount: 1,
                    operationIds: ['op-1'],
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
      const bundlePath = resolve(tempDir, scenarioBundles[0].links.jsonPath);
      const scenarioBundle = JSON.parse(
        await readFile(bundlePath, UTF8_ENCODING),
      );

      assert.deepEqual(
        scenarioBundle.publicationConvergence.priorityRecoveryBlockedPartitionIds,
        ['replica_operations-p1'],
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryBlockedPartitionCount,
        1,
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence.priorityPartitionSummary
          .blockedPartitions.map((partition) => partition.partitionId),
        ['control_plane_publications-p1', 'replica_operations-p1'],
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence
          .priorityRecoveryUnresolvedPartitionIds,
        ['replica_operations-p1'],
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryUnresolvedPartitionCount,
        1,
      );
    });

  it(
    'prefers canonical priority-recovery observation over conflicting raw diagnostics',
    async () => {
      refreshState();
      const priorityRecoveryReportPath = join(
        tempDir,
        'priority-recovery-report-with-canonical-observation.json',
      );
      const writer = new ReportWriter(priorityRecoveryReportPath);
      writer.addResult('node-join-under-load', {
        passed: false,
        duration: 100,
        error: 'convergence timeout',
        details: {
          diagnostics: {
            controlPlaneDiagnostics: {
              priorityRecoveryObservation: {
                publicationEpoch: 22,
                publicationStatus: 'PUBLISHED',
                recoveryProtocolState: 'priority_spread_pending',
                priorityRecoveryReasonCodes: [
                  'priority_partitions_not_spread',
                ],
                pendingAckNodeIds: [],
                pendingAckCount: 0,
                publicationConvergenceGateReasons: [
                  'priority_control_plane_spread_pending',
                ],
                closureRecordId: 'CL-OBS-022',
                closureWitnessClass:
                  'publication_converged_priority_spread_pending',
                priorityPartitionSummary: {
                  satisfied: false,
                  requiredDistinctNodeCount: 3,
                  readyEligibleNodeCount: 2,
                  totalPriorityPartitionCount: 1,
                  blockedPartitionCount: 1,
                  largestSpreadGap: 1,
                  totalSpreadGap: 1,
                  missingPartitionIds: ['replica_operations-p1'],
                  blockedPartitions: [{
                    partitionId: 'replica_operations-p1',
                    spreadGap: 1,
                  }],
                },
                priorityRecoveryBlockedPartitionIds: [
                  'replica_operations-p1',
                ],
                priorityRecoveryBlockedPartitionCount: 1,
                priorityRecoveryUnresolvedPartitionIds: [],
                priorityRecoveryUnresolvedPartitionCount: 0,
                priorityRecoveryProgressClassIds: [
                  'operation_created_but_no_step_transitions',
                ],
                priorityRecoveryProgressClassCount: 1,
                priorityRecoverySemanticStateIds: ['operation_stalled'],
                priorityRecoverySemanticStateCount: 1,
                projectionDiagnostics: {
                  readinessDecisionMode: 'explicit_dimensions',
                  readinessDecisionDimensions: ['control_plane_writable'],
                  recoveryEligibleProjectionEnabled: true,
                  recoveryEligibleIncludedNodeIds: ['joiner-1'],
                  readinessExcludedNodeIds: [],
                  clusterMemberUnhealthyExcludedNodeIds: [],
                },
              },
              publicationConvergence: {
                publicationEpoch: 22,
                publicationStatus: 'PUBLISHED',
                pendingAckNodeIds: [],
                publishedActiveNodeIds: ['seed-1', 'joiner-1'],
                recoveryProtocolState: 'priority_spread_pending',
                priorityRecoveryReasonCodes: [
                  'priority_partitions_not_spread',
                ],
                priorityPartitionSummary: {
                  satisfied: false,
                  requiredDistinctNodeCount: 3,
                  readyEligibleNodeCount: 2,
                  totalPriorityPartitionCount: 2,
                  blockedPartitions: [{
                    partitionId: 'control_plane_publications-p1',
                    spreadGap: 2,
                  }, {
                    partitionId: 'replica_operations-p1',
                    spreadGap: 1,
                  }],
                },
              },
              publicationConvergenceGate: {
                publicationEpoch: 22,
                publicationStatus: 'PUBLISHED',
                pendingAckNodeIds: [],
                reasonCodes: ['priority_partitions_not_spread'],
                priorityPartitionSummary: {
                  satisfied: false,
                  blockedPartitions: [{
                    partitionId: 'control_plane_publications-p1',
                    spreadGap: 2,
                  }, {
                    partitionId: 'replica_operations-p1',
                    spreadGap: 1,
                  }],
                },
              },
              priorityRecoveryDecisionSnapshots: {
                schemaVersion: 1,
                publicationEpoch: 22,
                snapshots: [{
                  partitionId: 'control_plane_publications-p1',
                  semanticState: 'operation_stalled',
                  blockerReasons: [
                    'operation_created_but_no_step_transitions',
                  ],
                  planner: {
                    ready: false,
                    spreadGap: 2,
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

      assert.deepEqual(
        scenarioBundle.publicationConvergence.priorityRecoveryBlockedPartitionIds,
        ['control_plane_publications-p1'],
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryBlockedPartitionCount,
        1,
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence
          .priorityRecoveryUnresolvedPartitionIds,
        ['control_plane_publications-p1'],
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryUnresolvedPartitionCount,
        1,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.closureRecordId,
        'CL-OBS-022',
      );
      assert.equal(
        scenarioBundle.publicationConvergence.closureWitnessClass,
        'publication_converged_priority_spread_pending',
      );
      assert.equal(
        triageSummary.publicationConvergence.priorityPartitionSummary
          .blockedPartitionCount,
        2,
      );
      assert.deepEqual(
        triageSummary.publicationConvergence.priorityRecoveryBlockedPartitionIds,
        ['control_plane_publications-p1'],
      );
    },
  );

  it(
    'rebuilds stale embedded priority-recovery observation from canonical publication evidence',
    async () => {
      refreshState();
      const PRIORITY_RECOVERY_REPORT_PATH = join(
        tempDir,
        'priority-recovery-report-with-stale-embedded-observation.json',
      );
      const CLOSURE_RECORD_ID = 'CL-003';
      const CLOSURE_WITNESS_CLASS =
        'publication_converged_priority_spread_pending';
      const STALE_PRIORITY_RECOVERY_PROGRESS_CLASS =
        'eligible_but_no_operation_created';
      const STALE_PRIORITY_RECOVERY_BLOCKER =
        'priority_recovery_progress_class=' +
        STALE_PRIORITY_RECOVERY_PROGRESS_CLASS;
      const writer = new ReportWriter(PRIORITY_RECOVERY_REPORT_PATH);
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
                prioritySpreadPending: true,
                priorityPartitionSummary: {
                  satisfied: false,
                  blockedPartitionCount: 1,
                  blockedPartitions: [{
                    partitionId: 'replica_operations-p1',
                    spreadGap: 1,
                  }],
                },
                priorityRecoveryBlockedPartitionIds: [
                  'replica_operations-p1',
                ],
                priorityRecoveryBlockedPartitionCount: 1,
                priorityRecoveryUnresolvedPartitionIds: [],
                priorityRecoveryUnresolvedPartitionCount: 0,
              },
              publicationConvergence: {
                publicationEpoch: 23,
                publicationStatus: 'PUBLISHED',
                recoveryProtocolState: 'steady_published',
                priorityRecoveryReasonCodes: [
                  'priority_partitions_not_spread',
                ],
                priorityPartitionSummary: {
                  satisfied: false,
                  blockedPartitionCount: 1,
                  blockedPartitions: [{
                    partitionId: 'replica_operations-p1',
                    spreadGap: 1,
                  }],
                },
                pendingAckNodeIds: [],
                publishedActiveNodeIds: ['seed-1', 'joiner-1'],
              },
              publicationConvergenceGate: {
                publicationEpoch: 23,
                publicationStatus: 'PUBLISHED',
                recoveryProtocolState: 'priority_spread_pending',
                reasonCodes: ['priority_partitions_not_spread'],
                priorityPartitionSummary: {
                  satisfied: false,
                  blockedPartitionCount: 1,
                  blockedPartitions: [{
                    partitionId: 'replica_operations-p1',
                    spreadGap: 1,
                  }],
                },
                pendingAckNodeIds: [],
                prioritySpreadPending: true,
                ready: false,
                active: true,
              },
              activeGateProgress: {
                expectedNodeCount: 2,
                activeNodeCount: 2,
                inactiveNodeCount: 0,
                snapshotCoverageNodeCount: 2,
                snapshotCoverageComplete: true,
                publicationStatus: 'PUBLISHED',
                recoveryProtocolState: 'priority_spread_pending',
                pendingAckCount: 0,
                missingPublishedCount: 0,
                gateReasonCount: 0,
                gateReasons: [],
                prioritySpreadSatisfied: false,
                priorityBlockedPartitionCount: 1,
                priorityRecoveryProgressClasses: {
                  partitionIdsByClass: {
                    [STALE_PRIORITY_RECOVERY_PROGRESS_CLASS]: [
                      'replica_operations-p1',
                    ],
                  },
                  unresolvedClassIds: [
                    STALE_PRIORITY_RECOVERY_PROGRESS_CLASS,
                  ],
                  unresolvedClassCount: 1,
                  partitionIdsBySemanticState: {
                    needs_operation: ['replica_operations-p1'],
                  },
                  unresolvedSemanticStateIds: ['needs_operation'],
                  unresolvedSemanticStateCount: 1,
                  blockedPartitionIds: ['replica_operations-p1'],
                  blockedPartitionCount: 1,
                },
                priorityRecoveryUnresolvedClassCount: 1,
                priorityRecoveryUnresolvedSemanticStateCount: 1,
                priorityRecoveryBlockedPartitionCount: 1,
                blockers: [STALE_PRIORITY_RECOVERY_BLOCKER],
                blockerSignature: STALE_PRIORITY_RECOVERY_BLOCKER,
              },
              priorityRecoveryDecisionSnapshots: {
                schemaVersion: 1,
                publicationEpoch: 23,
                closureWitness: {
                  state: 'closure_satisfied_stale_publication',
                  prioritySpreadPending: false,
                  publicationRefreshRequired: true,
                  closureRecordId: CLOSURE_RECORD_ID,
                  closureWitnessClass: CLOSURE_WITNESS_CLASS,
                  refreshedPriorityPartitionSummary: {
                    satisfied: true,
                    requiredDistinctNodeCount: 3,
                    readyEligibleNodeCount: 3,
                    totalPriorityPartitionCount: 1,
                    missingPartitionIds: [],
                    blockedPartitions: [],
                    blockedPartitionCount: 0,
                    largestSpreadGap: 0,
                    totalSpreadGap: 0,
                  },
                },
                priorityPartitionSummary: {
                  satisfied: true,
                  requiredDistinctNodeCount: 3,
                  readyEligibleNodeCount: 3,
                  totalPriorityPartitionCount: 1,
                  missingPartitionIds: [],
                  blockedPartitions: [],
                  blockedPartitionCount: 0,
                  largestSpreadGap: 0,
                  totalSpreadGap: 0,
                },
                partitionIdsBySemanticState: {},
                snapshots: [],
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(PRIORITY_RECOVERY_REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: PRIORITY_RECOVERY_REPORT_PATH,
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
        scenarioBundle.publicationConvergence.prioritySpreadPending,
        false,
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence.priorityRecoveryReasonCodes,
        [],
      );
      assert.equal(
        scenarioBundle.publicationConvergence.closureRecordId,
        CLOSURE_RECORD_ID,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.closureWitnessClass,
        CLOSURE_WITNESS_CLASS,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.priorityPartitionSummary
          .satisfied,
        true,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.priorityPartitionSummary
          .blockedPartitionCount,
        0,
      );
      assert.equal(
        scenarioBundle.controlPlane.publicationConvergenceGate.ready,
        true,
      );
      assert.equal(
        scenarioBundle.controlPlane.publicationConvergenceGate
          .prioritySpreadPending,
        false,
      );
      assert.equal(
        scenarioBundle.controlPlane.publicationConvergenceGate.closureRecordId,
        CLOSURE_RECORD_ID,
      );
      assert.equal(
        scenarioBundle.controlPlane.priorityRecoveryObservation
          .activeGateProgress.prioritySpreadSatisfied,
        true,
      );
      assert.equal(
        scenarioBundle.controlPlane.priorityRecoveryObservation
          .activeGateProgress.priorityRecoveryBlockedPartitionCount,
        0,
      );
      assert.deepEqual(
        scenarioBundle.controlPlane.priorityRecoveryObservation
          .activeGateProgress.blockers,
        ['ready'],
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence.priorityPartitionSummary
          .blockedPartitions || [],
        [],
      );
      assert.equal(
        triageSummary.publicationConvergence.prioritySpreadPending,
        false,
      );
      assert.deepEqual(
        triageSummary.publicationConvergence.priorityRecoveryReasonCodes,
        [],
      );
    },
  );
}
