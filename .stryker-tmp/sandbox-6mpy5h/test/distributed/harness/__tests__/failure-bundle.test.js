// @ts-nocheck
import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {ReportWriter} from '../report-writer.js';
import {writeFailureBundlesForReport} from '../failure-bundle.js';

const UTF8_ENCODING = 'utf8';

function buildRuntimeFailureScenario() {
  const workflowId = 'split-tbl-users-users-p1-v2';
  return {
    scenario: 'postgres-baseline-comparison',
    passed: false,
    error: 'verify failed',
    loadMetrics: {
      total: 100,
      success: 90,
      failed: 10,
      errors: 4,
      attemptErrors: 3,
      latency: {p50: 1, p95: 3, p99: 9},
      opsPerSec: 20,
      distinctErrors: [
        'NodeClient queryLoad failed (node=node-1, channel=load): timeout',
      ],
      perNode: {
        'node-1': {
          dispatched: 10,
          success: 7,
          attemptErrors: 3,
          admissionSignals: 1,
          queuePressureSignals: 2,
          rejected: 0,
        },
      },
    },
    details: {
      diagnostics: {
        failure: {
          rootCauseClass: 'verify',
          dominantReason: 'leader_mismatch',
          reasonCounts: {
            leader_mismatch: 2,
            snapshot_timeout: 1,
          },
          affectedNodeIds: ['node-1'],
        },
        failedPhase: {
          phase: 'verify',
          artifacts: {
            partitionGrowth: {
              failureMode: 'replica_spread_stalled',
              baselinePartitionCount: 1,
              currentPartitionCount: 3,
              additionalPartitionCount: 2,
              replicaNodeCount: 4,
              sampleCount: 12,
              transientQueryErrors: 1,
              lastQueryError: 'none',
            },
            partitioningPlanner: {
              selectedNodeIds: ['node-1', 'node-2', 'node-3', 'node-4', 'node-5'],
              readyReplicaNodeIds: ['node-1', 'node-2'],
              admissionReadyNodeIds: ['node-1', 'node-2', 'node-3', 'node-4', 'node-5'],
              readinessReasonHistogram: {
                nodeSlotUnavailable: 8,
                cluster_member_unhealthy: 2,
              },
            },
            nodeReasonsByNodeId: {
              'node-1': ['leader_mismatch'],
            },
          },
        },
        controlPlaneDiagnostics: {
          logsTable: {
            pendingWriteGrowthCount: 2,
            retainedBacklogGrowthCount: 1,
          },
          cdcReplay: {
            replayBufferGrowthCount: 3,
            replayRetryDepth: 2,
          },
        },
        rootCauseBundle: {
          snapshotsByNodeId: {
            'node-1': {
              nodeId: 'node-1',
              address: '10.0.0.1',
              capturedAtMs: 1,
              controlPlaneDiagnostics: {
                schemaVersion: 1,
                publicationConvergence: {
                  publicationEpoch: 7,
                  publicationStatus: 'pending',
                  publishedActiveNodeIds: ['node-1', 'node-2'],
                  requiredAckNodeIds: ['node-1', 'node-2'],
                  acknowledgedNodeIds: ['node-1'],
                  pendingAckNodeIds: ['node-2'],
                },
                publicationMode: {
                  currentMode: 'conservative_fanout',
                  reasonCode: 'grouped_delivery_failed',
                  recentTransitions: [{
                    mode: 'conservative_fanout',
                    reasonCode: 'grouped_delivery_failed',
                  }],
                },
                heartbeatPublication: {
                  publicationPath: 'node_state_reporter',
                  targetAddress: 'seed-1/message-group/mg-1',
                  targetNodeId: 'seed-1',
                  targetServiceType: 'message-group',
                  targetServiceId: 'mg-1',
                  lastAttemptAt: '2026-03-07T00:00:04.000Z',
                  lastSuccessAt: '2026-03-07T00:00:04.010Z',
                  lastFailureAt: '2026-03-07T00:00:03.000Z',
                  lastFailureStage: 'register',
                  lastFailureReason: 'control-plane route unavailable',
                  consecutiveFailures: 2,
                },
                readinessByNodeId: {
                  'node-1': {
                    nodeId: 'node-1',
                    nodeEvidence: {
                      lastHeartbeat: 1000,
                      heartbeatAgeMs: 5000,
                      readyLeaseExpiresAt: 1500,
                      readyLeaseAgeMs: 4500,
                    },
                    dimensions: {
                      processAlive: true,
                      clusterMemberHealthy: true,
                      routingReady: true,
                      loadReady: true,
                      placementEligible: false,
                      controlPlaneWritable: false,
                      metadataPublicationHealthy: false,
                    },
                    reasons: [{
                      code: 'metadata_publication_degraded',
                    }],
                  },
                },
                nodeLivenessByNodeId: {
                  'node-1': {
                    lastHeartbeat: 1000,
                    heartbeatAgeMs: 5000,
                    readyLeaseExpiresAt: 1500,
                    readyLeaseAgeMs: 4500,
                  },
                },
                readinessTransitionsByNodeId: {
                  'node-1': [{
                    nodeId: 'node-1',
                    observedAt: '2026-03-07T00:00:05.000Z',
                    observedAtMs: Date.parse('2026-03-07T00:00:05.000Z'),
                    previousServeEligible: true,
                    serveEligible: false,
                    previousRepairEligible: true,
                    repairEligible: false,
                    previousReasonCodes: [],
                    reasonCodes: ['metadata_publication_degraded'],
                    flippedDimensions: ['serveEligible', 'repairEligible'],
                    rawInputs: {
                      heartbeatAgeMs: 5000,
                      readyLeaseLagMs: 4500,
                      controlPlaneWritable: false,
                    },
                  }],
                },
                placementEligibilityByNodeId: {
                  'node-1': {
                    nodeId: 'node-1',
                    placementEligible: false,
                    failedDimensions: [
                      'controlPlaneWritable',
                      'metadataPublicationHealthy',
                      'placementEligible',
                    ],
                    reasonCodes: ['metadata_publication_degraded'],
                    reasons: [{
                      code: 'metadata_publication_degraded',
                    }],
                  },
                },
                workflowAdmissionsByWorkflowId: {
                  [workflowId]: {
                    workflowId,
                    workflowType: 'managed_split',
                    transitionState: 'failed',
                    tableId: 'tbl-users',
                    tableName: 'users',
                    topologySnapshotCapturedAt: '2026-03-07T00:00:02.000Z',
                    sourceLeaderNodeId: 'node-1',
                    candidateTargetNodeIds: ['node-1', 'node-2'],
                    sourceRoutableNodeIds: ['node-1', 'node-2'],
                    eligibleNodeIds: ['node-2'],
                    ineligibleNodes: [{
                      nodeId: 'node-1',
                    }],
                    estimatedBytes: 128,
                    admissionDecisionAt: '2026-03-07T00:00:06.000Z',
                    admission: {
                      decisionType: 'blocked',
                    },
                    blockingReasons: [{
                      code: 'metadata_publication_degraded',
                    }],
                    failedAt: '2026-03-07T00:00:07.000Z',
                    timeoutClassification: {
                      classification: 'cache_visibility_timeout',
                      boundaryHit: true,
                      nestedOperation: 'table_partition_metadata_wait',
                    },
                  },
                },
                timeoutClassifications: [{
                  workflowId,
                  workflowType: 'managed_split',
                  transitionState: 'failed',
                  timeoutClassification: {
                    classification: 'cache_visibility_timeout',
                    boundaryHit: true,
                    nestedOperation: 'table_partition_metadata_wait',
                  },
                }],
              },
            },
          },
          adminQueryTraceByNodeId: {
            'node-1': [{
              nodeId: 'node-1',
              queryId: 'q-timeout-1',
              lane: 'load',
              operation: 'queryLoad',
              timeoutMs: 4000,
              durationMs: 4000,
              startedAtMs: Date.parse('2026-03-07T00:00:01.000Z'),
              timeoutAtMs: Date.parse('2026-03-07T00:00:05.000Z'),
              outcome: 'timeout',
              error: 'Admin API query timed out',
            }],
          },
        },
      },
    },
  };
}

function buildNoProgressFailureScenario() {
  return {
    scenario: 'postgres-baseline-comparison',
    passed: false,
    error: 'pre-load gate stalled',
    details: {
      diagnostics: {
        failure: {
          rootCauseClass: 'topology',
          dominantReason: 'stalled_no_progress:20',
          reasonCounts: {
            'stalled_no_progress:20': 1,
          },
          affectedNodeIds: ['seed-1'],
        },
        failedPhase: {
          phase: 'pre_load_gate',
          artifacts: {},
        },
        noProgress: {
          reasonCode: 'stalled_no_progress',
          phase: 'pre_load_gate',
          stalledReason: 'stalled_no_progress:20',
          lastProgressEvent: {
            message: 'waiting for quiescent benchmark topology',
          },
          lastMeaningfulChange: {
            message: 'benchmark table ready on system-under-test',
          },
          failedNoProgress: {
            message: 'pre-load gate aborted for no progress',
            details: {
              budgetMs: 20,
              attempts: 3,
            },
          },
        },
      },
    },
  };
}

function buildLoadLaneTimeoutFailureScenario() {
  const nodeId = '11601fe0-72d6-5853-8590-ec2881853e72';
  return {
    scenario: 'seven-node-postgres-baseline-partition-split',
    passed: false,
    error:
      'postgres-baseline-comparison failed in phase verify: ' +
      'load run completed with failed operations; ' +
      'load run completed with operation errors',
    loadMetrics: {
      total: 251,
      success: 178,
      failed: 73,
      errors: 73,
      attemptErrors: 73,
      latency: {p50: 6, p95: 120, p99: 4000},
      opsPerSec: 42,
      distinctErrors: [
        'NodeClient queryLoad failed (node=11601fe0-72d6-5853-8590-ec2881853e72, ' +
          'channel=load, timeoutClass=timeout, code=timeout): ' +
          'Admin API query timed out for node 11601fe0-72d6-5853-8590-ec2881853e72 ' +
          'on lane load after 4000ms',
        'NodeClient queryLoad failed (node=11601fe0-72d6-5853-8590-ec2881853e72, ' +
          'channel=load, timeoutClass=none, code=circuit_open): ' +
          'circuit breaker is open',
      ],
      perNode: {
        [nodeId]: {
          dispatched: 251,
          success: 178,
          attemptErrors: 73,
          admissionSignals: 18,
          queuePressureSignals: 127544,
          rejected: 0,
        },
      },
    },
    details: {
      diagnostics: {
        failure: {
          rootCauseClass: 'load',
          dominantReason: 'load run completed with failed operations',
          reasonCounts: {
            'load run completed with failed operations': 1,
            'load run completed with operation errors': 1,
          },
          affectedNodeIds: [nodeId],
        },
        failedPhase: {
          phase: 'verify',
          artifacts: {
            assertionStatus: {
              failed: true,
            },
          },
        },
        rootCauseBundle: {
          schemaVersion: 1,
          rootCauseCode: 'load_failure',
          rootCauseClass: 'load',
          adminQueryTraceByNodeId: {
            [nodeId]: [{
              nodeId,
              queryId: 'q-load-timeout-1',
              lane: 'load',
              operation: 'queryLoad',
              timeoutMs: 4000,
              durationMs: 4000,
              outcome: 'timeout',
              timeoutClass: 'timeout',
              errorCode: 'timeout',
              error:
                'Admin API query timed out for node ' +
                `${nodeId} on lane load after 4000ms`,
            }, {
              nodeId,
              queryId: 'q-load-circuit-open-1',
              lane: 'load',
              operation: 'queryLoad',
              timeoutMs: 4000,
              durationMs: 3,
              outcome: 'error',
              timeoutClass: 'none',
              errorCode: 'circuit_open',
              error: 'circuit breaker is open',
            }],
          },
          playback: {
            artifactsDir: 'artifacts',
          },
        },
      },
    },
  };
}

function buildPlaybackDerivedFailureResult() {
  return {
    passed: false,
    duration: 1000,
    error: 'Expected no failed load operations during node join: observed 4',
    loadMetrics: {
      total: 100,
      success: 96,
      failed: 4,
      errors: 4,
      attemptErrors: 8,
      latency: {p50: 8, p95: 40, p99: 90},
      opsPerSec: 25,
      waitReasons: {
        nodeSlotUnavailable: 2,
        nodeAdmissionBlocked: 9,
        retryableControlPlanePressure: 0,
        timeoutWaits: 1,
        queueCapacityRejected: 0,
      },
      perNode: {
        'node-1': {
          dispatched: 60,
          success: 57,
          attemptErrors: 3,
          admissionSignals: 2,
        },
      },
    },
    details: {
      diagnostics: {
        failedPhase: {
          phase: 'verify_load',
          artifacts: {},
        },
      },
    },
  };
}

function buildPlaybackActiveGateStageEvent({
  readinessMode = 'startup',
  activeGateAdmissionState = {
    mode: 'blocked',
    blockedNodeIds: ['seed-1'],
    reasonCode: 'metadata_publication_degraded',
  },
  activeGateCurrentProgress,
} = {}) {
  return {
    timestamp: 5000,
    type: 'cluster.stage',
    scope: 'cluster',
    entityId: 'cluster',
    details: {
      stage: 'setup.cluster.waiting-active',
      nodeDiagnostics: [],
      snapshotCoverage: {
        completeCoverage: true,
        bestCoverageNodeCount: 2,
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
        },
      },
      publicationConvergenceGate: {
        ready: false,
        reasons: [],
        publicationStatus: 'PUBLISHED',
        pendingAckNodeIds: [],
        missingPublishedNodeIds: [],
      },
      activeGateNoProgress: {
        enabled: true,
        mode: readinessMode,
        maxAttempts: 45,
        attemptsSinceProgress: 22,
        stalled: false,
        currentProgress: activeGateCurrentProgress || {
          expectedNodeCount: 2,
          activeNodeCount: 2,
          inactiveNodeCount: 0,
          snapshotCoverageNodeCount: 2,
          snapshotCoverageComplete: false,
          publicationStatus: 'PUBLISHED',
          pendingAckCount: 0,
          missingPublishedCount: 1,
          gateReasons: [],
          selectedSnapshotReachableBy: 'admin_health',
          selectedSnapshotError: 'metadata_publication_degraded',
          selectedReachabilityError: null,
          selectedError: null,
        },
      },
      activeGateAdmissionState,
    },
  };
}

function buildStartupModeWitnessProgress({
  snapshotCoverageNodeCount = 0,
  isTimeoutError = true,
  readinessDelay = null,
} = {}) {
  const selectedSnapshotReachableBy = 'admin_health';
  const selectedSnapshotError = isTimeoutError ?
    'Admin API query timed out for node seed-1 on lane snapshot after 30ms' :
    'metadata_publication_degraded';
  const progress = {
    expectedNodeCount: 2,
    activeNodeCount: 2,
    inactiveNodeCount: 0,
    snapshotCoverageNodeCount,
    snapshotCoverageComplete: false,
    publicationStatus: 'PUBLISHED',
    pendingAckCount: 0,
    missingPublishedCount: 1,
    gateReasons: [],
    prioritySpreadSatisfied: false,
    selectedSnapshotReachableBy,
    selectedSnapshotError,
    selectedReachabilityError: null,
    selectedError: null,
  };
  if (readinessDelay &&
      typeof readinessDelay === 'object' &&
      !Array.isArray(readinessDelay)) {
    progress.readinessDelay = readinessDelay;
  } else if (isTimeoutError === true &&
      readinessDelay === null) {
    progress.readinessDelay = {
      timedOut: true,
      cause: 'snapshot_timeout',
      source: 'selectedSnapshotError',
      recoverability: 'terminal',
      error: selectedSnapshotError,
    };
  } else if (isTimeoutError === false &&
      readinessDelay === null) {
    progress.readinessDelay = {
      timedOut: false,
      cause: 'none',
      source: 'selectedSnapshotError',
      recoverability: 'recoverable',
      error: selectedSnapshotError,
    };
  }
  return progress;
}

function buildConvergenceDiagnosticsOnlyScenario() {
  return {
    scenario: 'rolling-restart',
    passed: false,
    error: 'Convergence timeout after 120000ms',
    details: {
      diagnostics: {
        failure: {
          rootCauseClass: 'topology',
          dominantReason: 'convergence_timeout',
          reasonCounts: {
            convergence_timeout: 1,
          },
          affectedNodeIds: ['seed-1', 'joiner-1'],
        },
        failedPhase: {
          phase: 'pre_load_gate',
          artifacts: {},
        },
        snapshotNodeId: 'seed-1',
        controlPlaneDiagnostics: {
          publicationConvergence: {
            publicationEpoch: 8,
            publicationStatus: 'ack_pending',
            pendingAckNodeIds: ['joiner-1'],
            requiredAckNodeIds: ['seed-1', 'joiner-1', 'joiner-2'],
            acknowledgedNodeIds: ['seed-1', 'joiner-2'],
            publishedActiveNodeIds: ['seed-1', 'joiner-2'],
            recoveryProtocolState: 'publication_pending',
            priorityRecoveryReasonCodes: [
              'publication_epoch_pending',
              'priority_partitions_not_spread',
            ],
          },
          publicationMode: {
            currentMode: 'recovering',
            reasonCode: 'publication_ack_pending',
          },
          readinessByNodeId: {
            'joiner-1': {
              nodeId: 'joiner-1',
              dimensions: {
                serveEligible: false,
                repairEligible: true,
              },
              reasons: [{
                code: 'control_plane_publication_pending',
              }],
            },
          },
        },
      },
    },
  };
}

describe('failure-bundle', () => {
  let tempDir;
  let outputDir;
  let reportPath;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), `failure-bundle-test-${randomUUID()}-`));
    outputDir = join(tempDir, 'artifacts');
    reportPath = join(tempDir, 'report.report.json');
  });

  afterEach(async () => {
    await rm(tempDir, {recursive: true, force: true});
  });

  it('writes scenario and run failure bundles for runtime failures and links them from the report',
    async () => {
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
        triageSummary.partitioning.failureMode,
        'replica_spread_stalled',
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
        reportJson.scenarios[0].publicationConvergence.pendingAckCount,
        1,
      );

      const markdown = await readFile(
        resolve(tempDir, scenario.failureBundle.markdownPath),
        UTF8_ENCODING,
      );
      assert.match(markdown, /## Node Diagnostics/);
      assert.match(markdown, /## Publication Convergence/);
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
      assert.match(triageMarkdown, /## Partitioning/);
      assert.match(triageMarkdown, /replica_spread_stalled/);
    });

  it('writes no-progress diagnostics into failure bundles', async () => {
    const scenarioDir = join(outputDir, 'postgres-baseline-comparison');
    await mkdir(scenarioDir, {recursive: true});
    await writeFile(join(scenarioDir, 'seed-1.log'), 'progress stalled\n');

    const scenario = buildNoProgressFailureScenario();
    const failureBundle = await writeFailureBundlesForReport({
      scenarios: [scenario],
      reportOutputPath: reportPath,
      outputDir,
      reportSummary: {total: 1, fail: 1, pass: 0},
      standardSummary: {scenarios: []},
      benchmarkRegressionGate: {status: 'skipped'},
      workspaceRoot: tempDir,
    });

    const scenarioBundle = JSON.parse(
      await readFile(resolve(tempDir, scenario.failureBundle.jsonPath), UTF8_ENCODING),
    );
    assert.equal(scenarioBundle.diagnostics.noProgress.reasonCode, 'stalled_no_progress');
    assert.equal(
      scenarioBundle.diagnostics.noProgress.failedNoProgress.details.budgetMs,
      20,
    );

    const markdown = await readFile(
      resolve(tempDir, scenario.failureBundle.markdownPath),
      UTF8_ENCODING,
    );
    assert.match(markdown, /## No Progress/);
    assert.equal(failureBundle.scenarioBundles.length, 1);
  });

  it('captures load-lane timeout and circuit-open verify failures as targeted diagnostics',
    async () => {
      const scenarioDir = join(
        outputDir,
        'seven-node-postgres-baseline-partition-split',
      );
      await mkdir(scenarioDir, {recursive: true});
      await writeFile(
        join(
          scenarioDir,
          '11601fe0-72d6-5853-8590-ec2881853e72.log',
        ),
        'load lane timeout\n',
      );

      const scenario = buildLoadLaneTimeoutFailureScenario();
      await writeFailureBundlesForReport({
        scenarios: [scenario],
        reportOutputPath: reportPath,
        outputDir,
        reportSummary: {total: 1, fail: 1, pass: 0},
        standardSummary: {scenarios: []},
        benchmarkRegressionGate: {status: 'skipped'},
        workspaceRoot: tempDir,
      });

      const scenarioBundle = JSON.parse(
        await readFile(resolve(tempDir, scenario.failureBundle.jsonPath), UTF8_ENCODING),
      );
      const nodeId = '11601fe0-72d6-5853-8590-ec2881853e72';

      assert.equal(scenarioBundle.summary.phase, 'verify');
      assert.equal(
        scenarioBundle.summary.rootCauseClass,
        'load',
      );
      assert.equal(
        scenarioBundle.topFailures.topReasons[0].reason,
        'load run completed with failed operations',
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics[nodeId].loadMetrics.attemptErrors,
        73,
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics[nodeId].errors.some((entry) =>
          entry.includes('timeoutClass=timeout'),
        ),
        true,
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics[nodeId].errors.some((entry) =>
          entry.includes('circuit breaker is open'),
        ),
        true,
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics[nodeId].adminQueryTrace[0].timeoutClass,
        'timeout',
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics[nodeId].adminQueryTrace[1].errorCode,
        'circuit_open',
      );
      assert.equal(
        scenarioBundle.controlPlane,
        null,
        'load-lane verify failures should remain diagnosable even without snapshotsByNodeId',
      );

      const markdown = await readFile(
        resolve(tempDir, scenario.failureBundle.markdownPath),
        UTF8_ENCODING,
      );
      assert.match(markdown, /operation=queryLoad/);
      assert.match(markdown, /timeoutClass=timeout/);
      assert.match(markdown, /circuit breaker is open/);
    });

  it('maps direct convergence diagnostics into control-plane bundle fields',
    async () => {
      const scenarioDir = join(outputDir, 'rolling-restart');
      await mkdir(scenarioDir, {recursive: true});
      await writeFile(join(scenarioDir, 'seed-1.log'), 'convergence timeout\n');

      const scenario = buildConvergenceDiagnosticsOnlyScenario();
      await writeFailureBundlesForReport({
        scenarios: [scenario],
        reportOutputPath: reportPath,
        outputDir,
        reportSummary: {total: 1, fail: 1, pass: 0},
        standardSummary: {scenarios: []},
        benchmarkRegressionGate: {status: 'skipped'},
        workspaceRoot: tempDir,
      });

      const scenarioBundle = JSON.parse(
        await readFile(resolve(tempDir, scenario.failureBundle.jsonPath), UTF8_ENCODING),
      );
      assert.equal(
        scenarioBundle.controlPlane.publicationConvergence.publicationStatus,
        'ack_pending',
      );
      assert.equal(
        scenarioBundle.controlPlane.publicationModeByNodeId['seed-1'].currentMode,
        'recovering',
      );
      assert.equal(
        scenarioBundle.publicationConvergence.pendingAckCount,
        1,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.recoveryProtocolState,
        'publication_pending',
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence.priorityRecoveryReasonCodes,
        ['publication_epoch_pending', 'priority_partitions_not_spread'],
      );
      assert.equal(
        scenarioBundle.summary.failureClassification.failureClass,
        'publication_convergence_blocked',
      );
      assert.equal(
        scenarioBundle.summary.failureClassification.signals.includes(
          'recoveryProtocolState=publication_pending',
        ),
        true,
      );
      assert.equal(
        scenarioBundle.recoveryReadiness.pendingAckRepairEligibleNodeIds[0],
        'joiner-1',
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics['joiner-1'].readiness.reasons[0].code,
        'control_plane_publication_pending',
      );
    });

  it('includes bottleneck estimates in scenario failure bundle summaries',
    async () => {
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

  it('derives root-cause, readiness reasons, and first-fault timeline from playback events',
    async () => {
      const scenarioDir = join(outputDir, 'node-join-under-load');
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
              nodeDiagnostics: [{
                nodeId: 'node-1',
                reasons: ['local_query_transport_not_ready'],
              }],
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
              nodeDiagnostics: [{
                nodeId: 'node-2',
                reasons: ['READINESS_STABLE_WINDOW_PENDING'],
              }],
            },
          }),
        ].join('\n') + '\n',
      );

      const writer = new ReportWriter(reportPath);
      writer.addResult('node-join-under-load', buildPlaybackDerivedFailureResult());
      const scenarioEntry = writer.scenarios[0];

      const {scenarioBundles, runBundle} = await writeFailureBundlesForReport({
        scenarios: writer.scenarios,
        reportOutputPath: reportPath,
        outputDir,
        reportSummary: {total: 1, fail: 1, pass: 0},
        standardSummary: {scenarios: []},
        benchmarkRegressionGate: {status: 'skipped'},
        workspaceRoot: tempDir,
      });
      await writer.write({failureBundle: runBundle});

      assert.equal(scenarioBundles.length, 1);
      const scenarioBundle = JSON.parse(
        await readFile(resolve(tempDir, scenarioBundles[0].links.jsonPath), UTF8_ENCODING),
      );
      assert.equal(scenarioBundle.summary.rootCauseClass, 'load');
      assert.equal(scenarioBundle.summary.dominantReason, 'nodeAdmissionBlocked');
      assert.deepEqual(scenarioBundle.readiness.nodeReasonsByNodeId, {
        'node-1': ['local_query_transport_not_ready'],
        'node-2': ['READINESS_STABLE_WINDOW_PENDING'],
      });
      assert.equal(
        scenarioBundle.diagnostics.firstFaultTimeline
          .markers.queuePressureOnset.deltaFromLoadStartMs,
        30,
      );
      assert.equal(
        scenarioBundle.diagnostics.firstFaultTimeline
          .markers.attemptErrorOnset.deltaFromLoadStartMs,
        50,
      );
      assert.equal(
        scenarioBundle.diagnostics.firstFaultTimeline
          .markers.hardFailureOnset.deltaFromLoadStartMs,
        70,
      );
      assert.deepEqual(
        scenarioBundle.diagnostics.firstFaultTimeline.orderedMarkers
          .map((entry) => entry.marker),
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

      const reportJson = JSON.parse(await readFile(reportPath, UTF8_ENCODING));
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

  it('derives publication convergence from playback active-gate diagnostics',
    async () => {
      const scenarioDir = join(outputDir, 'seed-restart-under-load');
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
              nodeDiagnostics: [{
                nodeId: 'seed-1',
                reasons: [],
              }, {
                nodeId: 'joiner-1',
                reasons: [],
              }],
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
                    readinessDecisionMode:
                      'cluster_member_or_recovery_eligible',
                    readinessDecisionDimensions: [
                      'clusterMemberHealthy',
                      'controlPlaneRecoveryEligible',
                      'controlPlaneWritable',
                    ],
                    recoveryEligibleProjectionEnabled: true,
                    recoveryEligibleIncludedNodeIds: ['joiner-1'],
                    readinessExcludedNodeIds: ['seed-2'],
                    clusterMemberUnhealthyExcludedNodeIds: ['seed-2'],
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
                  snapshots: [{
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
                      eligibleNodeIds: ['joiner-1'],
                      decisionDimension: 'repairEligible',
                    },
                    readiness: {
                      learnerPromotion: {
                        activeLearnerNodeIds: [],
                        promotableLearnerNodeIds: [],
                      },
                    },
                  }, {
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
                      eligibleNodeIds: ['joiner-1'],
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
                  }],
                  blockerPartitionIdsByReason: {
                    eligible_but_no_operation_created:
                      ['control_plane_publications-p1'],
                    operation_created_but_no_step_transitions:
                      ['replica_operations-p1'],
                    learner_active_but_never_promotable:
                      ['replica_operations-p1'],
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
              activeGateProgress: {
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
                blockers: ['publication_gate=priority_control_plane_spread_pending'],
                blockerSignature:
                  'publication_gate=priority_control_plane_spread_pending',
              },
              activeGateBestProgress: {
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
                blockers: ['publication_gate=priority_control_plane_spread_pending'],
                blockerSignature:
                  'publication_gate=priority_control_plane_spread_pending',
              },
              activeGateNoProgress: {
                enabled: true,
                mode: 'load',
                maxAttempts: 45,
                attemptsSinceProgress: 22,
                stalled: false,
              },
              activeGateBlockerHistory: [{
                signature: 'publication_gate=priority_control_plane_spread_pending',
                blockers: ['publication_gate=priority_control_plane_spread_pending'],
                count: 11,
                firstAttempt: 20,
                firstElapsedMs: 20000,
                lastAttempt: 40,
                lastElapsedMs: 40000,
              }],
              priorityRecoveryInvariants: {
                invariants: [{
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
                }, {
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
                }],
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

      const writer = new ReportWriter(reportPath);
      writer.addResult(
        'seed-restart-under-load',
        buildPlaybackDerivedFailureResult(),
      );

      const {scenarioBundles, runBundle} = await writeFailureBundlesForReport({
        scenarios: writer.scenarios,
        reportOutputPath: reportPath,
        outputDir,
        reportSummary: {total: 1, fail: 1, pass: 0},
        standardSummary: {scenarios: []},
        benchmarkRegressionGate: {status: 'skipped'},
        workspaceRoot: tempDir,
      });
      await writer.write({failureBundle: runBundle});

      assert.equal(scenarioBundles.length, 1);
      const scenarioBundle = JSON.parse(
        await readFile(resolve(tempDir, scenarioBundles[0].links.jsonPath), UTF8_ENCODING),
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
        scenarioBundle.publicationConvergence.activeGateNoProgress
          .attemptsSinceProgress,
        22,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.activeGateProgress
          .gateReasonCount,
        1,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.activeGateBlockerHistory[0]
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
          'learner_active_but_never_promotable',
          'operation_created_but_no_step_transitions',
        ],
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence.priorityRecoveryBlockedPartitionIds,
        ['control_plane_publications-p1', 'replica_operations-p1'],
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence.priorityRecoveryPartitionWitnesses,
        [{
          partitionId: 'control_plane_publications-p1',
          semanticState: 'blocked_unclassified',
          blockerReasons: ['eligible_but_no_operation_created'],
          spreadGap: 1,
          decisionDimension: 'repairEligible',
          eligibleNodeCount: 1,
          recoveryEligibleExcludedNodeIds: [],
          activeLearnerNodeIds: [],
          promotableLearnerNodeIds: [],
          operationIds: [],
          latestOperationWorkflowStep: null,
          latestOperationStatus: null,
          latestOperationTimelineStep: null,
        }, {
          partitionId: 'replica_operations-p1',
          semanticState: 'recovering_in_flight',
          blockerReasons: [
            'operation_created_but_no_step_transitions',
            'learner_active_but_never_promotable',
          ],
          spreadGap: 1,
          decisionDimension: 'controlPlaneRecoveryEligible',
          eligibleNodeCount: 1,
          recoveryEligibleExcludedNodeIds: [],
          activeLearnerNodeIds: ['joiner-1'],
          promotableLearnerNodeIds: [],
          operationIds: ['op-1'],
          latestOperationWorkflowStep: 'DISPATCHED',
          latestOperationStatus: 'open',
          latestOperationTimelineStep: 'CREATE_REPLICA',
        }],
      );
      assert.equal(
        scenarioBundle.publicationConvergence.priorityRecoveryInvariantFailingIds[0],
        'priority_recovery_cluster_active_requires_publication_convergence_and_priority_spread',
      );
      assert.equal(
        scenarioBundle.publicationConvergence.priorityRecoveryInvariantFailures[0]
          .reasonCode,
        'priority_recovery_cluster_marked_active_without_convergence',
      );
      assert.equal(
        scenarioBundle.controlPlane.priorityRecoveryDecisionSnapshots.snapshotCount,
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

      const reportJson = JSON.parse(await readFile(reportPath, UTF8_ENCODING));
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
        reportJson.scenarios[0].publicationConvergence.activeGateNoProgress
          .maxAttempts,
        45,
      );
      assert.equal(
        reportJson.scenarios[0].publicationConvergence
          .projectionDiagnostics.recoveryEligibleProjectionEnabled,
        true,
      );
      assert.equal(
        reportJson.scenarios[0].publicationConvergence
          .priorityRecoveryProgressClassCount,
        3,
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
        resolve(tempDir, scenarioBundles[0].links.markdownPath),
        UTF8_ENCODING,
      );
      assert.match(
        scenarioMarkdown,
          /Priority Recovery Partition Witnesses: control_plane_publications-p1#state=blocked_unclassified#gap=1#blockers=eligible_but_no_operation_created#decision=repairEligible#eligible=1, replica_operations-p1#state=recovering_in_flight#gap=1#blockers=operation_created_but_no_step_transitions\|learner_active_but_never_promotable#decision=controlPlaneRecoveryEligible#eligible=1#ops=op-1#step=CREATE_REPLICA#status=open#learners=joiner-1/,
      );
    });

  it('classifies startup playback active-gate no-progress witness as CL-006 and preserves admission state',
    async () => {
      const scenarioDir = join(outputDir, 'seed-restart-under-load');
      await mkdir(scenarioDir, {recursive: true});
      const activeGateAdmissionState = {
        mode: 'blocked',
        blockedNodeCount: 2,
        blockedNodeIds: ['seed-1', 'joiner-1'],
      };
      await writeFile(
        join(scenarioDir, 'events.ndjson'),
        [
          JSON.stringify(buildPlaybackActiveGateStageEvent({
            readinessMode: 'startup',
            activeGateAdmissionState,
            activeGateCurrentProgress:
              buildStartupModeWitnessProgress({
                snapshotCoverageNodeCount: 2,
                isTimeoutError: false,
              }),
          })),
        ].join('\n') + '\n',
      );

      const writer = new ReportWriter(reportPath);
      writer.addResult(
        'seed-restart-under-load',
        buildPlaybackDerivedFailureResult(),
      );

      const {scenarioBundles, runBundle} = await writeFailureBundlesForReport({
        scenarios: writer.scenarios,
        reportOutputPath: reportPath,
        outputDir,
        reportSummary: {total: 1, fail: 1, pass: 0},
        standardSummary: {scenarios: []},
        benchmarkRegressionGate: {status: 'skipped'},
        workspaceRoot: tempDir,
      });
      await writer.write({failureBundle: runBundle});

      assert.equal(scenarioBundles.length, 1);
      const scenarioBundle = JSON.parse(
        await readFile(resolve(tempDir, scenarioBundles[0].links.jsonPath), UTF8_ENCODING),
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
        scenarioBundle.controlPlane.activeGateNoProgress
          .currentProgress.selectedSnapshotReachableBy,
        'admin_health',
      );
      assert.equal(
        scenarioBundle.summary.readinessFailure?.mode,
        'startup',
      );
      assert.equal(
        scenarioBundle.summary.readinessFailure?.cause,
        'none',
      );
      assert.equal(
        scenarioBundle.summary.failureAction,
        null,
      );
    });

  it('classifies startup playback active-gate timeout witness with explicit readiness delay metadata',
    async () => {
      const scenarioDir = join(outputDir, 'seed-restart-under-load-timeout');
      await mkdir(scenarioDir, {recursive: true});
      await writeFile(
        join(scenarioDir, 'events.ndjson'),
        [
          JSON.stringify(buildPlaybackActiveGateStageEvent({
            readinessMode: 'startup',
            activeGateCurrentProgress: buildStartupModeWitnessProgress({
              snapshotCoverageNodeCount: 0,
              isTimeoutError: true,
            }),
          })),
        ].join('\n') + '\n',
      );

      const writer = new ReportWriter(reportPath);
      writer.addResult(
        'seed-restart-under-load-timeout',
        buildPlaybackDerivedFailureResult(),
      );

      const {scenarioBundles, runBundle} = await writeFailureBundlesForReport({
        scenarios: writer.scenarios,
        reportOutputPath: reportPath,
        outputDir,
        reportSummary: {total: 1, fail: 1, pass: 0},
        standardSummary: {scenarios: []},
        benchmarkRegressionGate: {status: 'skipped'},
        workspaceRoot: tempDir,
      });
      await writer.write({failureBundle: runBundle});

      assert.equal(scenarioBundles.length, 1);
      const scenarioBundle = JSON.parse(
        await readFile(resolve(tempDir, scenarioBundles[0].links.jsonPath), UTF8_ENCODING),
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
        scenarioBundle.publicationConvergence.activeGateReadinessDelay?.recoverability,
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
          resolve(tempDir, scenarioBundles[0].links.triageJsonPath),
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

      const reportJson = JSON.parse(await readFile(reportPath, UTF8_ENCODING));
      assert.equal(
        reportJson.scenarios[0].readinessFailure.classCode,
        'snapshot_timeout',
      );
      assert.equal(
        reportJson.scenarios[0].failureAction,
        'Snapshot/reachability timeout is blocking convergence.',
      );

      const scenarioMarkdown = await readFile(
        resolve(tempDir, scenarioBundles[0].links.markdownPath),
        UTF8_ENCODING,
      );
      assert.match(scenarioMarkdown, /## Readiness Guidance/);
      assert.match(scenarioMarkdown, /Snapshot\/reachability timeout is blocking convergence/);

      const triageMarkdown = await readFile(
        resolve(tempDir, scenarioBundles[0].links.triageMarkdownPath),
        UTF8_ENCODING,
      );
      assert.match(triageMarkdown, /Readiness Failure: class=snapshot_timeout/);
      assert.match(
        triageMarkdown,
        /Operator Recommendation: Inspect snapshot query latency, admin readiness, and host\/network stability before rerun/,
      );
    });

  it('does not classify startup-only active-gate witness in load-mode playback details',
    async () => {
      const scenarioDir = join(outputDir, 'seed-restart-under-load-load');
      await mkdir(scenarioDir, {recursive: true});
      await writeFile(
        join(scenarioDir, 'events.ndjson'),
        [
          JSON.stringify(buildPlaybackActiveGateStageEvent({
            readinessMode: 'load',
            activeGateCurrentProgress:
              buildStartupModeWitnessProgress({
                snapshotCoverageNodeCount: 2,
                isTimeoutError: false,
              }),
          })),
        ].join('\n') + '\n',
      );

      const writer = new ReportWriter(reportPath);
      writer.addResult(
        'seed-restart-under-load-load',
        buildPlaybackDerivedFailureResult(),
      );

      const {scenarioBundles, runBundle} = await writeFailureBundlesForReport({
        scenarios: writer.scenarios,
        reportOutputPath: reportPath,
        outputDir,
        reportSummary: {total: 1, fail: 1, pass: 0},
        standardSummary: {scenarios: []},
        benchmarkRegressionGate: {status: 'skipped'},
        workspaceRoot: tempDir,
      });
      await writer.write({failureBundle: runBundle});

      assert.equal(scenarioBundles.length, 1);
      const scenarioBundle = JSON.parse(
        await readFile(resolve(tempDir, scenarioBundles[0].links.jsonPath), UTF8_ENCODING),
      );

      assert.equal(
        scenarioBundle.publicationConvergence.closureRecordId,
        null,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.closureWitnessClass,
        null,
      );
      assert.equal(
        scenarioBundle.controlPlane.activeGateNoProgress.mode,
        'load',
      );
    });

  it('prefers the richest playback active-gate diagnostics over a later timeout-only sample',
    async () => {
      const scenarioDir = join(outputDir, 'seed-restart-under-load');
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

      const writer = new ReportWriter(reportPath);
      writer.addResult(
        'seed-restart-under-load',
        buildPlaybackDerivedFailureResult(),
      );

      const {scenarioBundles, runBundle} = await writeFailureBundlesForReport({
        scenarios: writer.scenarios,
        reportOutputPath: reportPath,
        outputDir,
        reportSummary: {total: 1, fail: 1, pass: 0},
        standardSummary: {scenarios: []},
        benchmarkRegressionGate: {status: 'skipped'},
        workspaceRoot: tempDir,
      });
      await writer.write({failureBundle: runBundle});

      assert.equal(scenarioBundles.length, 1);
      const scenarioBundle = JSON.parse(
        await readFile(resolve(tempDir, scenarioBundles[0].links.jsonPath), UTF8_ENCODING),
      );

      assert.equal(
        scenarioBundle.controlPlane.publicationConvergence.publicationStatus,
        'PUBLISHED',
      );
      assert.equal(
        scenarioBundle.controlPlane.activeGateSnapshotCoverage.bestCoverageNodeCount,
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
});
