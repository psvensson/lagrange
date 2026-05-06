export function registerFailureBundleCore01Tests(context) {
  const {
    it,
    assert,
    buildRuntimeFailureScenario,
    isStartupReadinessBlocked,
    join,
    mergePriorityRecoveryDecisionSnapshots,
    mkdir,
    PRIORITY_RECOVERY_BLOCKER_REASON,
    PRIORITY_RECOVERY_HISTORY_PARTITION_ID,
    PRIORITY_RECOVERY_SEMANTIC_STATE,
    PRIORITY_RECOVERY_SERIAL_WAIT_BLOCKING_OPERATION_ID,
    PRIORITY_RECOVERY_SERIAL_WAIT_CURRENT_BLOCKER_CAPTURED_AT_MS,
    PRIORITY_RECOVERY_SERIAL_WAIT_EPOCH,
    PRIORITY_RECOVERY_SERIAL_WAIT_OPERATION_CORRELATION_KEY,
    PRIORITY_RECOVERY_SERIAL_WAIT_OPERATION_ID,
    PRIORITY_RECOVERY_SERIAL_WAIT_OPERATION_STATUS,
    PRIORITY_RECOVERY_SERIAL_WAIT_PARTITION_ID,
    PRIORITY_RECOVERY_SERIAL_WAIT_PROGRESS_CAPTURED_AT_MS,
    PRIORITY_RECOVERY_SERIAL_WAIT_STALE_CAPTURED_AT_MS,
    PRIORITY_RECOVERY_SERIAL_WAIT_SYNTHETIC_CORRELATION_KEY,
    PRIORITY_RECOVERY_TARGET_PROGRESS_AT_MS,
    PRIORITY_RECOVERY_TARGET_PROGRESS_CAPTURED_AT_MS,
    PRIORITY_RECOVERY_TARGET_PROGRESS_CORRELATION_KEY,
    PRIORITY_RECOVERY_TARGET_PROGRESS_EPOCH,
    PRIORITY_RECOVERY_TARGET_PROGRESS_OPERATION_ID,
    PRIORITY_RECOVERY_TARGET_PROGRESS_PARTITION_ID,
    PRIORITY_RECOVERY_TARGET_PROGRESS_STALE_CAPTURED_AT_MS,
    PRIORITY_RECOVERY_TARGET_PROGRESS_STALE_OPERATION_UPDATED_AT_MS,
    PRIORITY_RECOVERY_TARGET_PROGRESS_STATUS,
    readFile,
    ReportWriter,
    resolve,
    UTF8_ENCODING,
    writeFailureBundlesForReport,
    writeFile,
  } = context;
  let tempDir;
  let outputDir;
  let reportPath;
  const refreshState = () => {
    tempDir = context.state.tempDir;
    outputDir = context.state.outputDir;
    reportPath = context.state.reportPath;
  };

  it(
    'summarizes priority-recovery semantic state from the latest partition snapshot',
    () => {
      refreshState();
      const mergedDecisionSnapshots = mergePriorityRecoveryDecisionSnapshots(
        {
          publicationEpoch: 6,
          priorityPartitionSummary: {
            satisfied: true,
            blockedPartitionCount: 0,
            totalSpreadGap: 0,
          },
          snapshots: [{
            partitionId: PRIORITY_RECOVERY_HISTORY_PARTITION_ID,
            epoch: 6,
            correlationKey:
              PRIORITY_RECOVERY_HISTORY_PARTITION_ID + '|6|op-current',
            semanticState: 'converged',
            blockerReasons: [],
            planner: {
              ready: true,
            },
            spreadCompletion: {
              satisfied: true,
            },
            coordinator: {
              operationCount: 1,
              operation: {
                operationId: 'op-current',
                status: 'removed',
                updatedAtMs: 6000,
              },
            },
            observation: {
              provenance: {
                capturedAt: 6000,
              },
            },
          }],
        },
        {
          publicationEpoch: 4,
          snapshots: [{
            partitionId: PRIORITY_RECOVERY_HISTORY_PARTITION_ID,
            epoch: 4,
            correlationKey:
              PRIORITY_RECOVERY_HISTORY_PARTITION_ID + '|4|op-stale',
            semanticState: 'recovering_in_flight',
            blockerReasons: [],
            planner: {
              ready: false,
            },
            spreadCompletion: {
              satisfied: false,
            },
            coordinator: {
              operationCount: 1,
              operation: {
                operationId: 'op-stale',
                status: 'pending',
                updatedAtMs: 4000,
              },
            },
            observation: {
              provenance: {
                capturedAt: 4000,
              },
            },
          }],
        },
      );

      assert.deepEqual(
        mergedDecisionSnapshots.partitionIdsBySemanticState.converged,
        [PRIORITY_RECOVERY_HISTORY_PARTITION_ID],
      );
      assert.deepEqual(
        mergedDecisionSnapshots.partitionIdsBySemanticState.recovering_in_flight,
        [],
      );
      assert.equal(
        mergedDecisionSnapshots.closureWitness.blockedPartitionCount,
        0,
      );
    },
  );

  it(
    'drops stale serial-wait synthetic snapshots behind operation progress',
    () => {
      refreshState();
      const mergedDecisionSnapshots = mergePriorityRecoveryDecisionSnapshots(
        {
          publicationEpoch: PRIORITY_RECOVERY_SERIAL_WAIT_EPOCH,
          snapshots: [{
            partitionId: PRIORITY_RECOVERY_SERIAL_WAIT_PARTITION_ID,
            epoch: PRIORITY_RECOVERY_SERIAL_WAIT_EPOCH,
            correlationKey:
              PRIORITY_RECOVERY_SERIAL_WAIT_OPERATION_CORRELATION_KEY,
            operationId: PRIORITY_RECOVERY_SERIAL_WAIT_OPERATION_ID,
            semanticState:
              PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT,
            blockerReasons: [],
            planner: {
              ready: false,
            },
            spreadCompletion: {
              satisfied: true,
            },
            coordinator: {
              operationCount: 1,
              operation: {
                operationId: PRIORITY_RECOVERY_SERIAL_WAIT_OPERATION_ID,
                status: PRIORITY_RECOVERY_SERIAL_WAIT_OPERATION_STATUS,
                updatedAtMs:
                  PRIORITY_RECOVERY_SERIAL_WAIT_PROGRESS_CAPTURED_AT_MS,
              },
            },
            observation: {
              provenance: {
                capturedAt:
                  PRIORITY_RECOVERY_SERIAL_WAIT_PROGRESS_CAPTURED_AT_MS,
              },
            },
          }],
        },
        {
          publicationEpoch: PRIORITY_RECOVERY_SERIAL_WAIT_EPOCH,
          blockerPartitionIdsByReason: {
            [PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT]: [
              PRIORITY_RECOVERY_SERIAL_WAIT_PARTITION_ID,
            ],
          },
          partitionIdsBySemanticState: {
            [PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION]: [
              PRIORITY_RECOVERY_SERIAL_WAIT_PARTITION_ID,
            ],
          },
          snapshots: [{
            partitionId: PRIORITY_RECOVERY_SERIAL_WAIT_PARTITION_ID,
            epoch: PRIORITY_RECOVERY_SERIAL_WAIT_EPOCH,
            correlationKey:
              PRIORITY_RECOVERY_SERIAL_WAIT_SYNTHETIC_CORRELATION_KEY,
            semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
            blockerReasons: [
              PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT,
            ],
            planner: {
              ready: false,
            },
            spreadCompletion: {
              satisfied: false,
            },
            coordinator: {
              operationCount: 0,
              serialWaitOperationIds: [
                PRIORITY_RECOVERY_SERIAL_WAIT_BLOCKING_OPERATION_ID,
              ],
            },
            observation: {
              provenance: {
                capturedAt:
                  PRIORITY_RECOVERY_SERIAL_WAIT_STALE_CAPTURED_AT_MS,
              },
            },
          }],
        },
      );

      assert.equal(mergedDecisionSnapshots.snapshots.length, 1);
      assert.deepEqual(
        mergedDecisionSnapshots.blockerPartitionIdsByReason[
          PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT
        ],
        [],
      );
      assert.deepEqual(
        mergedDecisionSnapshots.partitionIdsBySemanticState[
          PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION
        ],
        [],
      );
      assert.deepEqual(
        mergedDecisionSnapshots.partitionIdsBySemanticState[
          PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT
        ],
        [PRIORITY_RECOVERY_SERIAL_WAIT_PARTITION_ID],
      );
      assert.equal(
        mergedDecisionSnapshots.closureWitness.blockedPartitionCount,
        0,
      );
    },
  );

  it(
    'keeps current synthetic no-operation snapshots ahead of stale progress',
    () => {
      refreshState();
      const mergedDecisionSnapshots = mergePriorityRecoveryDecisionSnapshots(
        {
          publicationEpoch: PRIORITY_RECOVERY_SERIAL_WAIT_EPOCH,
          blockerPartitionIdsByReason: {
            [PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT]: [
              PRIORITY_RECOVERY_SERIAL_WAIT_PARTITION_ID,
            ],
          },
          partitionIdsBySemanticState: {
            [PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION]: [
              PRIORITY_RECOVERY_SERIAL_WAIT_PARTITION_ID,
            ],
          },
          snapshots: [{
            partitionId: PRIORITY_RECOVERY_SERIAL_WAIT_PARTITION_ID,
            epoch: PRIORITY_RECOVERY_SERIAL_WAIT_EPOCH,
            correlationKey:
              PRIORITY_RECOVERY_SERIAL_WAIT_SYNTHETIC_CORRELATION_KEY,
            semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
            blockerReasons: [
              PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT,
            ],
            planner: {
              ready: false,
            },
            spreadCompletion: {
              satisfied: false,
            },
            coordinator: {
              operationCount: 0,
              serialWaitOperationIds: [
                PRIORITY_RECOVERY_SERIAL_WAIT_BLOCKING_OPERATION_ID,
              ],
            },
            observation: {
              provenance: {
                capturedAt:
                  PRIORITY_RECOVERY_SERIAL_WAIT_CURRENT_BLOCKER_CAPTURED_AT_MS,
              },
            },
          }],
        },
        {
          publicationEpoch: PRIORITY_RECOVERY_SERIAL_WAIT_EPOCH,
          snapshots: [{
            partitionId: PRIORITY_RECOVERY_SERIAL_WAIT_PARTITION_ID,
            epoch: PRIORITY_RECOVERY_SERIAL_WAIT_EPOCH,
            correlationKey:
              PRIORITY_RECOVERY_SERIAL_WAIT_OPERATION_CORRELATION_KEY,
            operationId: PRIORITY_RECOVERY_SERIAL_WAIT_OPERATION_ID,
            semanticState:
              PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT,
            blockerReasons: [],
            planner: {
              ready: false,
            },
            spreadCompletion: {
              satisfied: true,
            },
            coordinator: {
              operationCount: 1,
              operation: {
                operationId: PRIORITY_RECOVERY_SERIAL_WAIT_OPERATION_ID,
                status: PRIORITY_RECOVERY_SERIAL_WAIT_OPERATION_STATUS,
                updatedAtMs:
                  PRIORITY_RECOVERY_SERIAL_WAIT_STALE_CAPTURED_AT_MS,
              },
            },
            observation: {
              provenance: {
                capturedAt:
                  PRIORITY_RECOVERY_SERIAL_WAIT_STALE_CAPTURED_AT_MS,
              },
            },
          }],
        },
      );

      assert.equal(mergedDecisionSnapshots.snapshots.length, 2);
      assert.deepEqual(
        mergedDecisionSnapshots.blockerPartitionIdsByReason[
          PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT
        ],
        [PRIORITY_RECOVERY_SERIAL_WAIT_PARTITION_ID],
      );
      assert.deepEqual(
        mergedDecisionSnapshots.partitionIdsBySemanticState[
          PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION
        ],
        [PRIORITY_RECOVERY_SERIAL_WAIT_PARTITION_ID],
      );
    },
  );

  it(
    'prefers target service progress over same-operation stale no-transition snapshots',
    () => {
      refreshState();
      const mergedDecisionSnapshots = mergePriorityRecoveryDecisionSnapshots(
        {
          publicationEpoch: PRIORITY_RECOVERY_TARGET_PROGRESS_EPOCH,
          blockerPartitionIdsByReason: {
            [PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS]: [
              PRIORITY_RECOVERY_TARGET_PROGRESS_PARTITION_ID,
            ],
          },
          partitionIdsBySemanticState: {
            [PRIORITY_RECOVERY_SEMANTIC_STATE.OPERATION_STALLED]: [
              PRIORITY_RECOVERY_TARGET_PROGRESS_PARTITION_ID,
            ],
          },
          snapshots: [{
            partitionId: PRIORITY_RECOVERY_TARGET_PROGRESS_PARTITION_ID,
            epoch: PRIORITY_RECOVERY_TARGET_PROGRESS_EPOCH,
            correlationKey: PRIORITY_RECOVERY_TARGET_PROGRESS_CORRELATION_KEY,
            operationId: PRIORITY_RECOVERY_TARGET_PROGRESS_OPERATION_ID,
            semanticState:
              PRIORITY_RECOVERY_SEMANTIC_STATE.OPERATION_STALLED,
            blockerReasons: [
              PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS,
            ],
            spreadCompletion: {
              satisfied: false,
            },
            coordinator: {
              operationCount: 1,
              operation: {
                operationId: PRIORITY_RECOVERY_TARGET_PROGRESS_OPERATION_ID,
                status: PRIORITY_RECOVERY_TARGET_PROGRESS_STATUS,
                updatedAtMs:
                  PRIORITY_RECOVERY_TARGET_PROGRESS_STALE_OPERATION_UPDATED_AT_MS,
              },
            },
            observation: {
              provenance: {
                capturedAt:
                  PRIORITY_RECOVERY_TARGET_PROGRESS_STALE_CAPTURED_AT_MS,
              },
            },
          }],
        },
        {
          publicationEpoch: PRIORITY_RECOVERY_TARGET_PROGRESS_EPOCH,
          snapshots: [{
            partitionId: PRIORITY_RECOVERY_TARGET_PROGRESS_PARTITION_ID,
            epoch: PRIORITY_RECOVERY_TARGET_PROGRESS_EPOCH,
            correlationKey: PRIORITY_RECOVERY_TARGET_PROGRESS_CORRELATION_KEY,
            operationId: PRIORITY_RECOVERY_TARGET_PROGRESS_OPERATION_ID,
            semanticState:
              PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT,
            blockerReasons: [],
            spreadCompletion: {
              satisfied: true,
            },
            coordinator: {
              operationCount: 1,
              operation: {
                operationId: PRIORITY_RECOVERY_TARGET_PROGRESS_OPERATION_ID,
                status: PRIORITY_RECOVERY_TARGET_PROGRESS_STATUS,
                updatedAtMs:
                  PRIORITY_RECOVERY_TARGET_PROGRESS_STALE_OPERATION_UPDATED_AT_MS,
                targetServiceProgressAtMs:
                  PRIORITY_RECOVERY_TARGET_PROGRESS_AT_MS,
              },
            },
            progress: {
              lastProgressAtMs: PRIORITY_RECOVERY_TARGET_PROGRESS_AT_MS,
            },
            observation: {
              provenance: {
                capturedAt: PRIORITY_RECOVERY_TARGET_PROGRESS_CAPTURED_AT_MS,
              },
            },
          }],
        },
      );

      assert.equal(mergedDecisionSnapshots.snapshots.length, 1);
      assert.deepEqual(
        mergedDecisionSnapshots.blockerPartitionIdsByReason[
          PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS
        ],
        [],
      );
      assert.deepEqual(
        mergedDecisionSnapshots.partitionIdsBySemanticState[
          PRIORITY_RECOVERY_SEMANTIC_STATE.OPERATION_STALLED
        ],
        [],
      );
      assert.deepEqual(
        mergedDecisionSnapshots.partitionIdsBySemanticState[
          PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT
        ],
        [PRIORITY_RECOVERY_TARGET_PROGRESS_PARTITION_ID],
      );
      assert.equal(
        mergedDecisionSnapshots.closureWitness.blockedPartitionCount,
        0,
      );
    },
  );

  it(
    'does not keep startup readiness blocked once the canonical publication gate is ready',
    () => {
      refreshState();
      assert.equal(
        isStartupReadinessBlocked({
          readinessFailure: {
            mode: 'startup',
            classCode: 'snapshot_reachability_timeout',
            recoverability: 'terminal',
          },
          publicationConvergence: {
            publicationPending: false,
            pendingAckCount: 0,
            blockedNodeCount: 0,
            prioritySpreadPending: false,
            activeGate: {
              ready: true,
            },
          },
        }),
        false,
      );
    },
  );

  it('writes scenario and run failure bundles for runtime failures and links them from the report',
    async () => {
      refreshState();
      const scenarioDir = join(outputDir, 'postgres-baseline-comparison');
      await mkdir(scenarioDir, {recursive: true});
      await writeFile(
        join(scenarioDir, 'node-1.log'),
        [
          'line-1',
          '2026-03-07T00:00:03.000Z [node-1] info: ' +
            '{"level":30,"time":"2026-03-07T00:00:03.000Z",' +
            '"nodeId":"node-1","msg":"Resolved startup auto-rejoin decision",' +
            '"mode":"join","source":"rejoin_hints",' +
            '"startupMode":"durable_rejoin","peerAddress":"seed-1:8080"}',
          '2026-03-07T00:00:03.500Z [node-1] info: ' +
            '{"level":30,"time":"2026-03-07T00:00:03.500Z",' +
            '"nodeId":"node-1","msg":"Startup runtime handoff completed",' +
            '"startupBranch":"join","startupPhase":"READY",' +
            '"bootstrapApiHasSqlQueryEngine":true,' +
            '"bootstrapApiHasMessageRouter":true,' +
            '"bootstrapApiHasStartupRecoveryCoordinator":true,' +
            '"adminRuntimeStarted":true,"adminPort":8081}',
          '2026-03-07T00:00:04.000Z [node-1] info: ' +
            '{"level":40,"time":"2026-03-07T00:00:04.000Z",' +
            '"nodeId":"node-1","pid":1,"subsystem":"query-executor",' +
            '"msg":"Partition routing candidates filtered by readiness",' +
            '"partitionId":"users-p1",' +
            '"routingSnapshot":{' +
              '"reasonCode":"all_services_filtered_by_readiness",' +
              '"routingReadinessDimension":"serveEligible",' +
              '"serviceRowCount":1,' +
              '"activeAddressedServiceCount":1,' +
              '"routableServiceCount":0,' +
              '"leaderKnown":true,' +
              '"canonicalLeaderNodeId":"node-1",' +
              '"deniedByNodeId":{' +
                '"node-1":{' +
                  '"decisionDimension":"serveEligible",' +
                  '"reasonCodes":["cluster_member_unhealthy"],' +
                  '"failedDimensions":[' +
                    '"clusterMemberHealthy","controlPlaneWritable","serveEligible"]' +
                '}' +
              '}' +
            '}}',
          'line-3',
        ].join('\n') + '\n',
      );
      await writeFile(join(scenarioDir, '_timeline.log'), 'timeline\n');
      await writeFile(join(scenarioDir, '_analysis.json'), '{"summary":"ok"}\n');
      await writeFile(
        join(scenarioDir, 'events.ndjson'),
        [
          {
            timestamp: 1709769601000,
            type: 'cluster.stage',
            scope: 'cluster',
            entityId: 'cluster',
            details: {
              stage: 'setup.cluster.active',
              nodeCount: 5,
            },
          },
          {
            timestamp: 1709769602000,
            type: 'load.started',
            scope: 'cluster',
            entityId: 'cluster',
            details: {
              metrics: {
                total: 10,
                attemptErrors: 0,
              },
            },
          },
          {
            timestamp: 1709769602500,
            type: 'partition.created',
            scope: 'topology',
            entityId: 'users-p2',
            details: {
              partitionId: 'users-p2',
              tableName: 'users',
              nodeId: 'node-2',
              status: 'active',
            },
          },
          {
            timestamp: 1709769603000,
            type: 'load.completed',
            scope: 'cluster',
            entityId: 'cluster',
            details: {
              metrics: {
                total: 10,
                attemptErrors: 3,
                waitReasons: {
                  nodeSlotUnavailable: 4,
                },
              },
            },
          },
          {
            timestamp: 1709769603500,
            type: 'node.restart.boundary',
            scope: 'node',
            entityId: 'node-1',
            details: {
              phase: 'after_ready',
              snapshot: {
                nodeId: 'node-1',
                publicationConvergence: {
                  publicationEpoch: 7,
                  pendingAckNodeIds: ['node-2'],
                },
                localReadiness: {
                  reasonCodes: ['control_plane_publication_pending'],
                },
              },
            },
          },
        ].map((entry) => JSON.stringify(entry)).join('\n') + '\n',
      );

      const scenario = buildRuntimeFailureScenario();
      const writer = new ReportWriter(reportPath);
      writer.scenarios.push(scenario);

      const failureBundle = await writeFailureBundlesForReport({
        scenarios: writer.scenarios,
        reportOutputPath: reportPath,
        outputDir,
        reportSummary: {total: 1, fail: 1, pass: 0},
        standardSummary: {scenarios: []},
        benchmarkRegressionGate: {status: 'skipped'},
        workspaceRoot: tempDir,
      });

      await writer.write({
        failureBundle: failureBundle.runBundle,
      });

      assert.ok(scenario.failureBundle?.jsonPath);
      assert.ok(scenario.failureBundle?.triageJsonPath);
      assert.ok(failureBundle.runBundle?.jsonPath);

      const scenarioBundle = JSON.parse(
        await readFile(resolve(tempDir, scenario.failureBundle.jsonPath), UTF8_ENCODING),
      );
      assert.equal(scenarioBundle.summary.phase, 'verify');
      assert.equal(scenarioBundle.topFailures.topReasons[0].reason, 'leader_mismatch');
      assert.equal(scenarioBundle.logs.nodeLogPaths['node-1'],
        'artifacts/postgres-baseline-comparison/node-1.log');
      assert.ok(Array.isArray(scenarioBundle.logs.excerptsByNodeId['node-1']));
      assert.equal(
        scenarioBundle.nodeDiagnostics['node-1'].loadMetrics.attemptErrors,
        3,
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics['node-1'].adminQueryTrace[0].queryId,
        'q-timeout-1',
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics['node-1'].placementEligibility.reasonCodes[0],
        'metadata_publication_degraded',
      );
      assert.equal(
        scenarioBundle.controlPlane.publicationModeByNodeId['node-1'].currentMode,
        'conservative_fanout',
      );
      assert.equal(
        scenarioBundle.controlPlane.heartbeatPublicationByNodeId['node-1'].targetAddress,
        'seed-1/message-group/mg-1',
      );
      assert.equal(
        scenarioBundle.publicationConvergence.pendingAckCount,
        1,
      );
      assert.equal(
        scenarioBundle.summary.failureClassification.failureClass,
        'publication_convergence_blocked',
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.convergence.status,
        'open',
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.convergence.blockers.includes(
          'pending_ack_nodes',
        ),
        true,
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.failover.status,
        'open',
      );
      assert.equal(
        scenarioBundle.controlPlane.workflowAdmissionsByWorkflowId[
          'split-tbl-users-users-p1-v2'
        ].timeoutClassification.classification,
        'cache_visibility_timeout',
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics['node-1'].timelineCorrelation.firstLoadFailureAt,
        '2026-03-07T00:00:05.000Z',
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics['node-1']
          .timelineCorrelation.heartbeatAgeMsAtFirstReadinessFlip,
        5000,
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics['node-1'].readinessTransitions[0].serveEligible,
        false,
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics['node-1'].routingDiagnostics.reasonCode,
        'all_services_filtered_by_readiness',
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics['node-1']
          .decisionArtifacts.latestStartupDecision.startupMode,
        'durable_rejoin',
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics['node-1']
          .decisionArtifacts.latestRuntimeHandoff.startupBranch,
        'join',
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics['node-1'].restartBoundaries[0].phase,
        'after_ready',
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics['node-1']
          .routingDiagnostics.deniedByNodeId['node-1'].reasonCodes[0],
        'cluster_member_unhealthy',
      );
      assert.equal(
        scenarioBundle.recoveryReadiness.routingDimensionCounts.serveEligible,
        1,
      );
      assert.equal(
        scenarioBundle.recoveryReadiness.pendingAckBlockedNodeIds.includes('node-2'),
        true,
      );
      assert.match(
        scenarioBundle.nodeDiagnostics['node-1'].errors[0],
        /node=node-1/i,
      );
      assert.deepEqual(
        scenarioBundle.diagnostics.controlPlaneDiagnostics,
        {
          logsTable: {
            pendingWriteGrowthCount: 2,
            retainedBacklogGrowthCount: 1,
          },
          cdcReplay: {
            replayBufferGrowthCount: 3,
            replayRetryDepth: 2,
          },
        },
      );
      assert.equal(
        scenarioBundle.controlPlane.logsTable.pendingWriteGrowthCount,
        2,
      );
      const triageSummary = JSON.parse(
        await readFile(
          resolve(tempDir, scenario.failureBundle.triageJsonPath),
          UTF8_ENCODING,
        ),
      );
      assert.equal(triageSummary.summary.phase, 'verify');
      assert.equal(
        triageSummary.summary.stabilityGates.convergence.status,
        'open',
      );
      assert.equal(
        triageSummary.summary.stabilityGates.convergence.blockers.includes(
          'pending_ack_nodes',
        ),
        true,
      );
      assert.equal(
        triageSummary.partitioning.failureMode,
        'replica_spread_stalled',
      );
      assert.deepEqual(
        triageSummary.partitioning.localPrimaryNodeIds,
        ['node-1', 'node-2'],
      );
      assert.deepEqual(
        triageSummary.partitioning.routedSupportNodeIds,
        ['node-4', 'node-5'],
      );
      assert.deepEqual(
        triageSummary.partitioning.dispatchContributionHistogram,
        {
          local_primary: 2,
          local_blocked: 1,
          routed_support: 2,
        },
      );
      assert.equal(
        triageSummary.partitioning.criticalControlPlaneStability.state,
        'pending',
      );
      assert.deepEqual(
        triageSummary.partitioning.criticalControlPlaneStability.reasonCodes,
        ['pending_write_growth', 'publication_pending'],
      );
      assert.equal(
        triageSummary.partitioning.convergenceEvaluations[2].state,
        'replica_blocked',
      );
      assert.equal(
        triageSummary.partitioning.convergenceEvaluations[2].retryAfterMs,
        125,
      );
      assert.equal(
        triageSummary.playback.eventSummary.load.startedAt,
        '2024-03-07T00:00:02.000Z',
      );
      assert.equal(
        triageSummary.playback.eventSummary.topology.partitionCreatedCount,
        1,
      );
      assert.equal(
        triageSummary.routingDiagnosticsByNodeId['node-1']
          .routingDiagnostics.reasonCode,
        'all_services_filtered_by_readiness',
      );

      const runBundle = JSON.parse(
        await readFile(resolve(tempDir, failureBundle.runBundle.jsonPath), UTF8_ENCODING),
      );
      assert.equal(runBundle.failedScenarioCount, 1);
      assert.equal(runBundle.scenarios[0].scenario, 'postgres-baseline-comparison');

      const reportJson = JSON.parse(await readFile(reportPath, UTF8_ENCODING));
      assert.equal(reportJson.failureBundle.jsonPath, failureBundle.runBundle.jsonPath);
      assert.equal(
        reportJson.scenarios[0].failureBundle.jsonPath,
        scenario.failureBundle.jsonPath,
      );
      assert.equal(
        reportJson.scenarios[0].failureClassification.failureClass,
        'publication_convergence_blocked',
      );
      assert.equal(
        reportJson.scenarios[0].stabilityGates.convergence.status,
        'open',
      );
      assert.equal(
        reportJson.scenarios[0].publicationConvergence.pendingAckCount,
        1,
      );

      const markdown = await readFile(
        resolve(tempDir, scenario.failureBundle.markdownPath),
        UTF8_ENCODING,
      );
      assert.match(markdown, /## Node Diagnostics/);
      assert.match(markdown, /## Publication Convergence/);
      assert.match(markdown, /## Stability Gates/);
      assert.match(markdown, /convergence: status=open/);
      assert.match(markdown, /## Recovery Readiness/);
      assert.match(markdown, /## Control Plane Diagnostics/);
      assert.match(markdown, /Heartbeat Publication/);
      assert.match(markdown, /Timeline Correlation/);
      assert.match(markdown, /Routing Diagnostics/);
      assert.match(markdown, /Latest Startup Decision/);
      assert.match(markdown, /Restart Boundaries/);
      assert.match(markdown, /cache_visibility_timeout/);
      assert.match(markdown, /operation=queryLoad/);
      const triageMarkdown = await readFile(
        resolve(tempDir, scenario.failureBundle.triageMarkdownPath),
        UTF8_ENCODING,
      );
      assert.match(triageMarkdown, /# Scenario Triage Summary/);
      assert.match(triageMarkdown, /## Stability Gates/);
      assert.match(triageMarkdown, /convergence: status=open/);
      assert.match(triageMarkdown, /pending_ack_nodes/);
      assert.match(triageMarkdown, /## Partitioning/);
      assert.match(triageMarkdown, /replica_spread_stalled/);
      assert.match(triageMarkdown, /Local Primary Nodes: node-1, node-2/);
      assert.match(triageMarkdown, /Routed Support Nodes: node-4, node-5/);
      assert.match(
        triageMarkdown,
        /Dispatch Contribution Histogram: local_primary:2, local_blocked:1, routed_support:2/,
      );
      assert.match(triageMarkdown, /Critical Control-Plane State: pending/);
      assert.match(
        triageMarkdown,
        /Critical Control-Plane Reasons: pending_write_growth, publication_pending/,
      );
      assert.match(triageMarkdown, /node-3, state=replica_blocked, dispatch=local_blocked/);
    });
}
