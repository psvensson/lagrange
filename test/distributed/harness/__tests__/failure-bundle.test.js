import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {ReportWriter} from '../report-writer.js';
import {writeFailureBundlesForReport} from '../failure-bundle.js';
import {registerFailureBundlePlaybackTests} from './failure-bundle-playback-test-cases.js';
import {selectDominantPriorityRecoveryPartitionWitness} from
  '../priority-recovery-summary-normalization.js';

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
              localPrimaryNodeIds: ['node-1', 'node-2'],
              routedSupportNodeIds: ['node-4', 'node-5'],
              readinessReasonHistogram: {
                nodeSlotUnavailable: 8,
                cluster_member_unhealthy: 2,
              },
              convergenceStateHistogram: {
                ready_replica: 2,
                replica_blocked: 1,
                routed_admission_only: 2,
              },
              dispatchContributionHistogram: {
                local_primary: 2,
                local_blocked: 1,
                routed_support: 2,
              },
              degradationStateHistogram: {
                healthy: 2,
                promotion_pending: 1,
                unknown: 2,
              },
              criticalControlPlaneStability: {
                state: 'pending',
                reasonCodes: [
                  'pending_write_growth',
                  'publication_pending',
                ],
                retryAfterMs: 250,
              },
              convergenceEvaluations: [
                {
                  nodeId: 'node-1',
                  state: 'ready_replica',
                  dispatchContributionState: 'local_primary',
                  localReplicaRole: 'leader',
                  localReplicaVoterReady: true,
                  leadershipStable: true,
                  admissionReady: true,
                  replicaBearing: true,
                  degradationState: 'healthy',
                  reasonCodes: [],
                  retryAfterMs: 0,
                },
                {
                  nodeId: 'node-2',
                  state: 'ready_replica',
                  dispatchContributionState: 'local_primary',
                  localReplicaRole: 'follower',
                  localReplicaVoterReady: true,
                  leadershipStable: true,
                  admissionReady: true,
                  replicaBearing: true,
                  degradationState: 'healthy',
                  reasonCodes: [],
                  retryAfterMs: 0,
                },
                {
                  nodeId: 'node-3',
                  state: 'replica_blocked',
                  dispatchContributionState: 'local_blocked',
                  localReplicaRole: 'candidate',
                  localReplicaVoterReady: false,
                  leadershipStable: false,
                  admissionReady: true,
                  replicaBearing: true,
                  degradationState: 'promotion_pending',
                  reasonCodes: ['local_replica_not_voter_ready'],
                  retryAfterMs: 125,
                },
                {
                  nodeId: 'node-4',
                  state: 'routed_admission_only',
                  dispatchContributionState: 'routed_support',
                  localReplicaRole: 'unknown',
                  localReplicaVoterReady: false,
                  leadershipStable: false,
                  admissionReady: true,
                  replicaBearing: false,
                  degradationState: 'unknown',
                  reasonCodes: [],
                  retryAfterMs: 0,
                },
                {
                  nodeId: 'node-5',
                  state: 'routed_admission_only',
                  dispatchContributionState: 'routed_support',
                  localReplicaRole: 'unknown',
                  localReplicaVoterReady: false,
                  leadershipStable: false,
                  admissionReady: true,
                  replicaBearing: false,
                  degradationState: 'unknown',
                  reasonCodes: [],
                  retryAfterMs: 0,
                },
              ],
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
        ['priority_partitions_not_spread', 'publication_epoch_pending'],
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

  it('derives blocked-partition counts from retained priority-partition summaries',
    async () => {
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
        ['control_plane_publications-p1', 'replica_operations-p1'],
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryBlockedPartitionCount,
        2,
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
        ['replica_operations-p1'],
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryBlockedPartitionCount,
        1,
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence
          .priorityRecoveryUnresolvedPartitionIds,
        [],
      );
      assert.equal(
        scenarioBundle.publicationConvergence
          .priorityRecoveryUnresolvedPartitionCount,
        0,
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
        1,
      );
      assert.deepEqual(
        triageSummary.publicationConvergence.priorityRecoveryBlockedPartitionIds,
        ['replica_operations-p1'],
      );
    },
  );

  it(
    'preserves publication gate reasons and projection diagnostics across failure-bundle and triage outputs',
    async () => {
      const priorityRecoveryReportPath = join(
        tempDir,
        'priority-recovery-report-with-gate-reason-codes.json',
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
                publicationEpoch: 21,
                publicationStatus: 'PUBLISHED',
                recoveryProtocolState: 'priority_spread_pending',
                priorityPartitionSummary: {
                  satisfied: false,
                  requiredDistinctNodeCount: 3,
                  readyEligibleNodeCount: 2,
                  totalPriorityPartitionCount: 1,
                  blockedPartitions: [{
                    partitionId: 'replica_operations-p1',
                    spreadGap: 1,
                  }],
                },
                projectionDiagnostics: {
                  readinessDecisionMode: 'explicit_dimensions',
                  readinessDecisionDimensions: ['control_plane_writable'],
                  recoveryEligibleProjectionEnabled: true,
                  recoveryEligibleIncludedNodeIds: ['joiner-1'],
                  readinessExcludedNodeIds: [],
                  clusterMemberUnhealthyExcludedNodeIds: ['seed-2'],
                },
              },
              publicationConvergenceGate: {
                publicationEpoch: 21,
                publicationStatus: 'PUBLISHED',
                pendingAckNodeIds: [],
                reasonCodes: ['priority_partitions_not_spread'],
                priorityPartitionSummary: {
                  satisfied: false,
                  blockedPartitions: [{
                    partitionId: 'replica_operations-p1',
                    spreadGap: 1,
                  }],
                },
              },
              activeGateBestProgress: {
                closureRecordId: 'CL-PR-021',
                closureWitnessClass:
                  'publication_converged_priority_spread_pending',
              },
              priorityRecoveryDecisionSnapshots: {
                schemaVersion: 1,
                publicationEpoch: 21,
                snapshots: [{
                  partitionId: 'replica_operations-p1',
                  semanticState: 'operation_stalled',
                  blockerReasons: [
                    'operation_created_but_no_step_transitions',
                  ],
                  planner: {
                    ready: false,
                    spreadGap: 1,
                  },
                  admission: {
                    decisionDimension: 'controlPlaneRecoveryEligible',
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
      const scenarioMarkdown = await readFile(
        resolve(tempDir, scenarioBundles[0].links.markdownPath),
        UTF8_ENCODING,
      );
      const triageMarkdown = await readFile(
        resolve(tempDir, scenarioBundles[0].links.triageMarkdownPath),
        UTF8_ENCODING,
      );

      assert.deepEqual(
        scenarioBundle.publicationConvergence.publicationConvergenceGateReasons,
        ['priority_partitions_not_spread'],
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence.pendingAckNodeIds,
        [],
      );
      assert.equal(
        scenarioBundle.publicationConvergence.closureRecordId,
        'CL-PR-021',
      );
      assert.equal(
        scenarioBundle.publicationConvergence.closureWitnessClass,
        'publication_converged_priority_spread_pending',
      );
      assert.equal(
        triageSummary.publicationConvergence.projectionDiagnostics
          .readinessDecisionMode,
        'explicit_dimensions',
      );
      assert.deepEqual(
        triageSummary.publicationConvergence.publicationConvergenceGateReasons,
        ['priority_partitions_not_spread'],
      );
      assert.match(
        scenarioMarkdown,
        /Pending Ack Nodes: none/,
      );
      assert.match(
        scenarioMarkdown,
        /Publication Gate Reasons: priority_partitions_not_spread/,
      );
      assert.match(
        scenarioMarkdown,
        /Closure Witness Class: publication_converged_priority_spread_pending/,
      );
      assert.match(
        scenarioMarkdown,
        /Projection Diagnostics: mode=explicit_dimensions, dimensions=control_plane_writable, recoveryEligibleProjectionEnabled=true, recoveryEligibleIncluded=joiner-1, readinessExcluded=none, clusterMemberUnhealthyExcluded=seed-2/,
      );
      assert.match(
        triageMarkdown,
        /## Publication Convergence/,
      );
      assert.match(
        triageMarkdown,
        /Publication Gate Reasons: priority_partitions_not_spread/,
      );
      assert.match(
        triageMarkdown,
        /Blocked Partitions: replica_operations-p1/,
      );
      assert.match(
        triageMarkdown,
        /Closure Record Id: CL-PR-021/,
      );
    },
  );

  it(
    'prefers canonical priority-recovery progress reasons over generic node-admission wait summaries',
    async () => {
      const PRIORITY_RECOVERY_PROGRESS_REPORT_PATH = join(
        tempDir,
        'priority-recovery-progress-handoff-report.json',
      );
      const PRIORITY_RECOVERY_PARTITION_ID = 'sql_write_operations-p1';
      const PRIORITY_RECOVERY_DOMINANT_REASON =
        'priority_recovery_rebalancer_handoff_stalled';
      const PRIORITY_RECOVERY_CURRENT_OWNER = 'rebalancer_leader';
      const PRIORITY_RECOVERY_BLOCKING_BOUNDARY = 'rebalancer_handoff';
      const PRIORITY_RECOVERY_WAIT_MODE = 'stalled';
      const PRIORITY_RECOVERY_NEXT_ACTION = 'schedule_followup_rebalance';
      const PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE = 'target_creation';
      const PRIORITY_RECOVERY_STEP_AGE_MS = 62050;
      const PRIORITY_RECOVERY_STEP_TIMEOUT_MS = 60000;
      const LOAD_WAIT_REASON_NODE_ADMISSION_BLOCKED = 'nodeAdmissionBlocked';
      const writer = new ReportWriter(PRIORITY_RECOVERY_PROGRESS_REPORT_PATH);
      writer.addResult('node-join-under-load', {
        passed: false,
        duration: 100,
        error: 'convergence timeout',
        loadMetrics: {
          total: 100,
          success: 85,
          failed: 0,
          errors: 0,
          waitReasons: {
            [LOAD_WAIT_REASON_NODE_ADMISSION_BLOCKED]: 55,
          },
        },
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
                priorityRecoveryBlockedPartitionIds: [
                  'control_plane_publications-p1',
                  'sql_transaction_participants-p1',
                  PRIORITY_RECOVERY_PARTITION_ID,
                ],
                priorityRecoveryBlockedPartitionCount: 3,
                priorityRecoveryUnresolvedPartitionIds: [
                  PRIORITY_RECOVERY_PARTITION_ID,
                ],
                priorityRecoveryUnresolvedPartitionCount: 1,
                priorityRecoveryPartitionWitnesses: [{
                  partitionId: PRIORITY_RECOVERY_PARTITION_ID,
                  semanticStateId: 'operation_stalled',
                  progressContractState: 'blocked',
                  currentOwner: PRIORITY_RECOVERY_CURRENT_OWNER,
                  nextRequiredAction: PRIORITY_RECOVERY_NEXT_ACTION,
                  blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
                  waitMode: PRIORITY_RECOVERY_WAIT_MODE,
                  workflowProgressPhaseId:
                    PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE,
                  stepAgeMs: PRIORITY_RECOVERY_STEP_AGE_MS,
                  stepTimeoutMs: PRIORITY_RECOVERY_STEP_TIMEOUT_MS,
                  retryAfterMs: 5000,
                  lastProgressAtMs: 1234,
                  progressEvidenceSourceIds: ['op-55', 'handoff-1'],
                }],
              },
            },
          },
        },
      });
      await writer.write();
      const report = JSON.parse(
        await readFile(PRIORITY_RECOVERY_PROGRESS_REPORT_PATH, UTF8_ENCODING),
      );

      assert.equal(
        report.scenarios[0].priorityRecoveryProgressSummary.dominantWitness
          .blockingBoundary,
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
      );
      assert.equal(
        report.scenarios[0].priorityRecoveryProgressSummary.dominantWitness
          .waitMode,
        PRIORITY_RECOVERY_WAIT_MODE,
      );

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: report.scenarios,
        reportOutputPath: PRIORITY_RECOVERY_PROGRESS_REPORT_PATH,
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
      const triageMarkdown = await readFile(
        resolve(tempDir, scenarioBundles[0].links.triageMarkdownPath),
        UTF8_ENCODING,
      );

      assert.equal(
        scenarioBundle.summary.dominantReason,
        PRIORITY_RECOVERY_DOMINANT_REASON,
      );
      assert.equal(
        triageSummary.summary.dominantReason,
        PRIORITY_RECOVERY_DOMINANT_REASON,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.priorityRecoveryProgressSummary
          .dominantWitness.currentOwner,
        PRIORITY_RECOVERY_CURRENT_OWNER,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.priorityRecoveryProgressSummary
          .dominantWitness.blockingBoundary,
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.priorityRecoveryProgressSummary
          .dominantWitness.nextRequiredAction,
        PRIORITY_RECOVERY_NEXT_ACTION,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.priorityRecoveryProgressSummary
          .dominantWitness.workflowProgressPhaseId,
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.priorityRecoveryProgressSummary
          .dominantWitness.stepAgeMs,
        PRIORITY_RECOVERY_STEP_AGE_MS,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.priorityRecoveryProgressSummary
          .dominantWitness.stepTimeoutMs,
        PRIORITY_RECOVERY_STEP_TIMEOUT_MS,
      );
      assert.match(
        triageMarkdown,
        /Progress Summary: partitionCount=1, partition=sql_write_operations-p1, owner=rebalancer_leader, boundary=rebalancer_handoff, waitMode=stalled, nextAction=schedule_followup_rebalance, contractState=blocked, retryAfterMs=5000, lastProgressAtMs=1234/,
      );
    },
  );

  it(
    'emits pressure-shaped dominant reasons when the shared actuation contract says scheduling is blocked by pressure',
    async () => {
      const PRESSURE_REPORT_PATH = join(
        tempDir,
        'priority-recovery-pressure-report.json',
      );
      const PRESSURE_DOMINANT_REASON =
        'priority_recovery_operation_scheduling_persist_blocked_by_pressure';
      const writer = new ReportWriter(PRESSURE_REPORT_PATH);
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
                priorityRecoveryPartitionWitnesses: [{
                  partitionId: 'sql_write_operations-p1',
                  progressContractState: 'pending',
                  currentOwner: 'rebalancer_leader',
                  actuationState: 'persist_blocked_by_pressure',
                  nextRequiredAction: 'create_recovery_operation',
                  blockingBoundary: 'operation_scheduling',
                  waitMode: 'stalled',
                  pressureState: 'write_backlog',
                  pendingWrites: 36,
                  pendingWriteGrowthCount: 1626,
                  lastProgressAtMs: 1234,
                }],
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(PRESSURE_REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: PRESSURE_REPORT_PATH,
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
        scenarioBundle.summary.dominantReason,
        PRESSURE_DOMINANT_REASON,
      );
      assert.equal(
        triageSummary.summary.dominantReason,
        PRESSURE_DOMINANT_REASON,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.priorityRecoveryProgressSummary
          .dominantWitness.actuationState,
        'persist_blocked_by_pressure',
      );
    },
  );

  it(
    'emits retry-shaped dominant reasons when the shared actuation contract says scheduling is waiting on retry',
    async () => {
      const RETRY_REPORT_PATH = join(
        tempDir,
        'priority-recovery-retry-report.json',
      );
      const RETRY_DOMINANT_REASON =
        'priority_recovery_operation_scheduling_persist_failed_retryable';
      const writer = new ReportWriter(RETRY_REPORT_PATH);
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
                priorityRecoveryPartitionWitnesses: [{
                  partitionId: 'sql_write_operations-p1',
                  progressContractState: 'pending',
                  currentOwner: 'rebalancer_leader',
                  actuationState: 'persist_failed_retryable',
                  nextRequiredAction: 'create_recovery_operation',
                  blockingBoundary: 'operation_scheduling',
                  waitMode: 'retry_scheduled',
                  retryAfterMs: 2500,
                  lastProgressAtMs: 1234,
                }],
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(RETRY_REPORT_PATH, UTF8_ENCODING),
        ).scenarios,
        reportOutputPath: RETRY_REPORT_PATH,
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
        scenarioBundle.summary.dominantReason,
        RETRY_DOMINANT_REASON,
      );
      assert.equal(
        triageSummary.summary.dominantReason,
        RETRY_DOMINANT_REASON,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.priorityRecoveryProgressSummary
          .dominantWitness.actuationState,
        'persist_failed_retryable',
      );
    },
  );

  it(
    'breaks same-rank dominant witness ties with actuation specificity before falling back to timestamps',
    async () => {
      const selectedWitness = selectDominantPriorityRecoveryPartitionWitness([
        {
          partitionId: 'plain-scheduling',
          progressContractState: 'blocked',
          actuationState: 'action_required',
          blockingBoundary: 'operation_scheduling',
          waitMode: 'stalled',
          lastProgressAtMs: 1234,
        },
        {
          partitionId: 'pressure-shaped-scheduling',
          progressContractState: 'blocked',
          actuationState: 'persist_blocked_by_pressure',
          blockingBoundary: 'operation_scheduling',
          waitMode: 'stalled',
          lastProgressAtMs: 1234,
        },
      ]);

      assert.equal(
        selectedWitness?.partitionId,
        'pressure-shaped-scheduling',
      );
    },
  );

  registerFailureBundlePlaybackTests({
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
    state: {
      get tempDir() {
        return tempDir;
      },
      get outputDir() {
        return outputDir;
      },
      get reportPath() {
        return reportPath;
      },
    },
    buildPlaybackDerivedFailureResult,
    buildPlaybackActiveGateStageEvent,
    buildStartupModeWitnessProgress,
  });
});
