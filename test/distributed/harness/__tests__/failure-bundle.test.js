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
            nodeReasonsByNodeId: {
              'node-1': ['leader_mismatch'],
            },
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
      await writeFile(join(scenarioDir, 'node-1.log'), 'line-1\nline-2\nline-3\n');
      await writeFile(join(scenarioDir, '_timeline.log'), 'timeline\n');
      await writeFile(join(scenarioDir, '_analysis.json'), '{"summary":"ok"}\n');

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
      assert.match(
        scenarioBundle.nodeDiagnostics['node-1'].errors[0],
        /node=node-1/i,
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

      const markdown = await readFile(
        resolve(tempDir, scenario.failureBundle.markdownPath),
        UTF8_ENCODING,
      );
      assert.match(markdown, /## Node Diagnostics/);
      assert.match(markdown, /## Control Plane Diagnostics/);
      assert.match(markdown, /Heartbeat Publication/);
      assert.match(markdown, /Timeline Correlation/);
      assert.match(markdown, /cache_visibility_timeout/);
      assert.match(markdown, /operation=queryLoad/);
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
});
