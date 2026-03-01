import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMPARE_SCRIPT = resolve(
  __dirname,
  '../../scripts/compare-latest-baseline-runs.sh',
);
const REPORT_TMP_PREFIX = 'compare-latest-baseline-runs-test-';
const SCENARIO_NAME = 'postgres-baseline-comparison';
const PROFILE_THREE_NODE = '3node';

function buildScenarioResult(options = {}) {
  const details = {
    benchmark: {
      strictMode: options.strictMode === true,
      strictFanoutOptOut: options.strictFanoutOptOut === true,
      strictFanoutOptOutReason: options.strictFanoutOptOutReason || null,
      clusterCandidateLoadNodeCount:
        options.clusterCandidateLoadNodeCount || 0,
      requestedSutLoadNodeCount: options.requestedSutLoadNodeCount || 0,
      requiredSutLoadNodeCount: options.requiredSutLoadNodeCount || 0,
      explicitRequiredSutLoadNodeCount:
        options.explicitRequiredSutLoadNodeCount ?? null,
      saturation: options.saturation || null,
    },
    failure: {
      rootCauseCode: options.rootCauseCode || null,
      rootCauseClass: options.rootCauseClass,
      phase: options.phase,
      affectedNodeIds: options.affectedNodeIds || [],
      reasonCounts: options.reasonCounts || {},
      dominantReason: options.dominantReason || null,
      versionConvergence: options.versionConvergence || null,
      versionLagSummary: options.versionLagSummary || null,
    },
  };
  if (options.rootCauseBundle && typeof options.rootCauseBundle === 'object') {
    details.diagnostics = {
      rootCauseBundle: options.rootCauseBundle,
    };
  }

  return {
    scenario: SCENARIO_NAME,
    passed: options.passed === true,
    error: options.error || null,
    performanceMeasurement: options.performanceMeasurement || {
      available: true,
      validForComparison: options.passed === true,
      invalidReason: options.passed === true ? null : 'correctness_failed',
      observedOpsPerSec: 25,
      observedP99LatencyMs: 3,
    },
    loadMetrics: {
      total: 100,
      failed: 1,
      errors: 1,
      attemptErrors: 0,
      opsPerSec: 25,
      dispatchedOperations: 100,
      undispatchedOperations: 0,
      latency: {
        avg: 1,
        p50: 1,
        p95: 2,
        p99: 3,
      },
      queueDelay: {
        avg: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        max: 0,
      },
    },
    details,
  };
}

function buildReport(scenarioResult) {
  return {
    summary: {
      duration: 1000,
    },
    benchmarkRegressionGate: {
      enabled: false,
      status: 'n/a',
    },
    scenarios: [scenarioResult],
  };
}

async function writeReport(reportDir, fileName, reportPayload) {
  await writeFile(
    join(reportDir, fileName),
    JSON.stringify(reportPayload, null, 2),
    'utf8',
  );
}

describe('compare-latest-baseline-runs.sh', () => {
  let reportDir;

  beforeEach(async () => {
    reportDir = await mkdtemp(join(tmpdir(), REPORT_TMP_PREFIX));
  });

  afterEach(async () => {
    await rm(reportDir, {recursive: true, force: true});
  });

  it('prints root-cause summary for compared runs when failure artifacts exist',
    async () => {
      const previousFile =
        'postgres-baseline-' + PROFILE_THREE_NODE + '-prev.report.json';
      const latestFile =
        'postgres-baseline-' + PROFILE_THREE_NODE + '-latest.report.json';

      await writeReport(
        reportDir,
        previousFile,
        buildReport(
          buildScenarioResult({
            passed: false,
            error: 'strict_preload_readiness_failed',
            rootCauseClass: 'discovery',
            phase: 'pre_load_gate',
            affectedNodeIds: ['seed-1'],
            reasonCounts: {
              benchmark_not_ready: 4,
            },
            strictMode: true,
            strictFanoutOptOut: false,
            clusterCandidateLoadNodeCount: 3,
            requestedSutLoadNodeCount: 3,
            requiredSutLoadNodeCount: 3,
          }),
        ),
      );
      await writeReport(
        reportDir,
        latestFile,
        buildReport(
          buildScenarioResult({
            passed: false,
            error: 'strict_preload_readiness_failed',
            rootCauseClass: 'topology',
            phase: 'pre_load_gate',
            affectedNodeIds: ['seed-1', 'joiner-1'],
            reasonCounts: {
              leadership_unstable: 3,
              in_flight_replica_operations: 2,
            },
            strictMode: true,
            strictFanoutOptOut: true,
            strictFanoutOptOutReason:
              'requiredSutLoadNodeCount=2,clusterCandidateLoadNodeCount=7',
            clusterCandidateLoadNodeCount: 7,
            requestedSutLoadNodeCount: 2,
            requiredSutLoadNodeCount: 2,
            explicitRequiredSutLoadNodeCount: 2,
          }),
        ),
      );

      const result = spawnSync(
        'bash',
        [COMPARE_SCRIPT, '--report-dir', reportDir, '--scenario', SCENARIO_NAME],
        {
          encoding: 'utf8',
        },
      );

      assert.equal(result.status, 0, result.stderr);
      assert.match(
        result.stdout,
        /root_cause\[previous\]: code=.*, class=/i,
        'compare output should include previous root cause summary',
      );
      assert.match(
        result.stdout,
        /root_cause\[latest\]: code=.*, class=/i,
        'compare output should include latest root cause summary',
      );
      assert.match(
        result.stdout,
        /root_cause_delta:/i,
        'compare output should include root cause delta summary',
      );
      assert.match(
        result.stdout,
        /fanout_contract\[previous\]: strict_mode=true/i,
        'compare output should include strict fanout contract summary',
      );
      assert.match(
        result.stdout,
        /fanout_contract\[latest\]: strict_mode=true, opt_out=true/i,
        'compare output should report strict fanout opt-out',
      );
      assert.match(
        result.stdout,
        /fanout_delta:/i,
        'compare output should include fanout contract delta summary',
      );
    });

  it('prints root-cause code and key snapshot deltas when rootCauseBundle exists',
    async () => {
      const previousFile =
        'postgres-baseline-' + PROFILE_THREE_NODE + '-prev.report.json';
      const latestFile =
        'postgres-baseline-' + PROFILE_THREE_NODE + '-latest.report.json';

      await writeReport(
        reportDir,
        previousFile,
        buildReport(
          buildScenarioResult({
            passed: false,
            error: 'strict_preload_readiness_failed',
            rootCauseCode: 'snapshot_missing',
            rootCauseClass: 'unknown',
            phase: 'pre_load_gate',
            rootCauseBundle: {
              schemaVersion: 1,
              rootCauseCode: 'snapshot_missing',
              rootCauseClass: 'unknown',
              snapshotsByNodeId: {
                'seed-1': {
                  nodeId: 'seed-1',
                  missing: {
                    reasonCode: 'snapshot_timeout',
                  },
                },
                'joiner-1': {
                  nodeId: 'joiner-1',
                  cdcHealth: {
                    retryCount: 1,
                  },
                  cacheFreshness: {
                    stalenessMs: 1000,
                  },
                  rowCounts: {
                    sysPostgresWireServiceCount: 1,
                  },
                },
              },
            },
          }),
        ),
      );

      await writeReport(
        reportDir,
        latestFile,
        buildReport(
          buildScenarioResult({
            passed: false,
            error: 'strict_preload_readiness_failed',
            rootCauseCode: 'cache_stale_watermark',
            rootCauseClass: 'cache',
            phase: 'pre_load_gate',
            rootCauseBundle: {
              schemaVersion: 1,
              rootCauseCode: 'cache_stale_watermark',
              rootCauseClass: 'cache',
              snapshotsByNodeId: {
                'seed-1': {
                  nodeId: 'seed-1',
                  cdcHealth: {
                    retryCount: 4,
                  },
                  cacheFreshness: {
                    stalenessMs: 7000,
                  },
                  rowCounts: {
                    sysPostgresWireServiceCount: 3,
                  },
                },
                'joiner-1': {
                  nodeId: 'joiner-1',
                  cdcHealth: {
                    retryCount: 2,
                  },
                  cacheFreshness: {
                    stalenessMs: 6000,
                  },
                  rowCounts: {
                    sysPostgresWireServiceCount: 2,
                  },
                },
              },
            },
          }),
        ),
      );

      const result = spawnSync(
        'bash',
        [COMPARE_SCRIPT, '--report-dir', reportDir, '--scenario', SCENARIO_NAME],
        {
          encoding: 'utf8',
        },
      );

      assert.equal(result.status, 0, result.stderr);
      assert.match(
        result.stdout,
        /root_cause\[previous\]: code=snapshot_missing, class=unknown/i,
        'compare output should include previous rootCauseCode and class',
      );
      assert.match(
        result.stdout,
        /root_cause\[latest\]: code=cache_stale_watermark, class=cache/i,
        'compare output should include latest rootCauseCode and class',
      );
      assert.match(
        result.stdout,
        /root_cause_delta: code_changed=true/i,
        'compare output should include rootCauseCode delta summary',
      );
      assert.match(
        result.stdout,
        /root_cause_signals\[previous\]: snapshot_missing_nodes=1, max_cache_staleness_ms=1000, max_cdc_retry_count=1, sys_postgres_wire_rows=1/i,
        'compare output should include previous key root-cause signals',
      );
      assert.match(
        result.stdout,
        /root_cause_signals\[latest\]: snapshot_missing_nodes=0, max_cache_staleness_ms=7000, max_cdc_retry_count=4, sys_postgres_wire_rows=5/i,
        'compare output should include latest key root-cause signals',
      );
      assert.match(
        result.stdout,
        /root_cause_key_deltas: snapshot_missing_nodes=-1, max_cache_staleness_ms=\+6000, max_cdc_retry_count=\+3, sys_postgres_wire_rows=\+4/i,
        'compare output should include compact key signal deltas',
      );
    });

  it('labels failed-run throughput as invalid for performance comparison',
    async () => {
      const previousFile =
        'postgres-baseline-' + PROFILE_THREE_NODE + '-prev.report.json';
      const latestFile =
        'postgres-baseline-' + PROFILE_THREE_NODE + '-latest.report.json';

      await writeReport(
        reportDir,
        previousFile,
        buildReport(
          buildScenarioResult({
            passed: false,
            error: 'verify failed',
          }),
        ),
      );

      await writeReport(
        reportDir,
        latestFile,
        buildReport(
          buildScenarioResult({
            passed: true,
            performanceMeasurement: {
              available: true,
              validForComparison: true,
              invalidReason: null,
              observedOpsPerSec: 25,
              observedP99LatencyMs: 3,
            },
          }),
        ),
      );

      const result = spawnSync(
        'bash',
        [COMPARE_SCRIPT, '--report-dir', reportDir, '--scenario', SCENARIO_NAME],
        {
          encoding: 'utf8',
        },
      );

      assert.equal(result.status, 0, result.stderr);
      assert.match(
        result.stdout,
        /ops_per_sec: invalid_for_performance previous\(reason=correctness_failed, observed=25\) -> latest\(reason=unknown, observed=25\)/i,
        'load summary should label failed-run throughput as invalid',
      );
      assert.match(
        result.stdout,
        /sut_vs_pg\[previous\]: invalid_for_performance=true, reason=correctness_failed, observed_sut_ops_per_sec=25/i,
        'same-run comparison should label failed-run throughput as invalid',
      );
      assert.match(
        result.stdout,
        /ratio_delta: invalid_for_performance=true/i,
        'ratio delta should not compare invalid failed-run throughput',
      );
    });

  it('prints convergence required-vs-observed version deltas when present',
    async () => {
      const previousFile =
        'postgres-baseline-' + PROFILE_THREE_NODE + '-prev.report.json';
      const latestFile =
        'postgres-baseline-' + PROFILE_THREE_NODE + '-latest.report.json';
      const requiredSchemaVersion = '1740589945123:7:seed-1';

      await writeReport(
        reportDir,
        previousFile,
        buildReport(
          buildScenarioResult({
            passed: false,
            error: 'strict_preload_readiness_failed',
            rootCauseClass: 'discovery',
            phase: 'pre_load_gate',
            affectedNodeIds: ['seed-1', 'joiner-1'],
            reasonCounts: {
              schema_version_lag: 2,
            },
            strictMode: true,
            requiredSutLoadNodeCount: 2,
            versionConvergence: {
              requiredSchemaVersion,
              nodes: {
                'seed-1': {
                  observedSchemaVersion: requiredSchemaVersion,
                  requiredSchemaVersion,
                  unmetReasons: [],
                },
                'joiner-1': {
                  observedSchemaVersion: '1740589945123:6:seed-1',
                  requiredSchemaVersion,
                  unmetReasons: ['schema_version_lag'],
                },
              },
            },
          }),
        ),
      );

      await writeReport(
        reportDir,
        latestFile,
        buildReport(
          buildScenarioResult({
            passed: true,
            rootCauseClass: null,
            phase: null,
            affectedNodeIds: [],
            reasonCounts: {},
            strictMode: true,
            requiredSutLoadNodeCount: 2,
            versionConvergence: {
              requiredSchemaVersion,
              nodes: {
                'seed-1': {
                  observedSchemaVersion: requiredSchemaVersion,
                  requiredSchemaVersion,
                  unmetReasons: [],
                },
                'joiner-1': {
                  observedSchemaVersion: requiredSchemaVersion,
                  requiredSchemaVersion,
                  unmetReasons: [],
                },
              },
            },
          }),
        ),
      );

      const result = spawnSync(
        'bash',
        [COMPARE_SCRIPT, '--report-dir', reportDir, '--scenario', SCENARIO_NAME],
        {
          encoding: 'utf8',
        },
      );

      assert.equal(result.status, 0, result.stderr);
      assert.match(
        result.stdout,
        /convergence\[previous\]: required_schema_version=/i,
        'compare output should include previous convergence summary',
      );
      assert.match(
        result.stdout,
        /convergence\[latest\]: required_schema_version=/i,
        'compare output should include latest convergence summary',
      );
      assert.match(
        result.stdout,
        /convergence_delta:/i,
        'compare output should include convergence delta summary',
      );
      assert.match(
        result.stdout,
        /joiner-1/i,
        'compare output should include node-level convergence details',
      );
    });

  it('prints dominant reason and saturation deltas when failure artifacts exist',
    async () => {
      const previousFile =
        'postgres-baseline-' + PROFILE_THREE_NODE + '-prev.report.json';
      const latestFile =
        'postgres-baseline-' + PROFILE_THREE_NODE + '-latest.report.json';

      await writeReport(
        reportDir,
        previousFile,
        buildReport(
          buildScenarioResult({
            passed: false,
            error: 'strict_preload_readiness_failed',
            rootCauseClass: 'discovery',
            phase: 'pre_load_gate',
            dominantReason: 'schema_version_unknown',
            reasonCounts: {
              schema_version_unknown: 4,
              routing_not_ready: 2,
            },
            saturation: {
              cdcForwardTimeoutCount: 14,
              systemTableQueryTimeoutCount: 7,
              snapshotCollectionErrorCount: 1,
            },
          }),
        ),
      );
      await writeReport(
        reportDir,
        latestFile,
        buildReport(
          buildScenarioResult({
            passed: false,
            error: 'strict_preload_readiness_failed',
            rootCauseClass: 'discovery',
            phase: 'pre_load_gate',
            dominantReason: 'routing_not_ready',
            reasonCounts: {
              routing_not_ready: 3,
            },
            saturation: {
              cdcForwardTimeoutCount: 4,
              systemTableQueryTimeoutCount: 1,
              snapshotCollectionErrorCount: 0,
            },
          }),
        ),
      );

      const result = spawnSync(
        'bash',
        [COMPARE_SCRIPT, '--report-dir', reportDir, '--scenario', SCENARIO_NAME],
        {
          encoding: 'utf8',
        },
      );

      assert.equal(result.status, 0, result.stderr);
      assert.match(
        result.stdout,
        /dominant_reason\[previous\]: schema_version_unknown/i,
        'compare output should include previous dominant reason',
      );
      assert.match(
        result.stdout,
        /dominant_reason\[latest\]: routing_not_ready/i,
        'compare output should include latest dominant reason',
      );
      assert.match(
        result.stdout,
        /dominant_reason_delta:/i,
        'compare output should include dominant reason delta',
      );
      assert.match(
        result.stdout,
        /saturation\[previous\]: cdc_forward_timeouts=14/i,
        'compare output should include previous saturation counters',
      );
      assert.match(
        result.stdout,
        /saturation\[latest\]: cdc_forward_timeouts=4/i,
        'compare output should include latest saturation counters',
      );
      assert.match(
        result.stdout,
        /saturation_delta: cdc_forward_timeouts=-10/i,
        'compare output should include saturation deltas',
      );
    });
});
