// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  run,
} from '../../scenarios/seven-node-postgres-baseline-partition-split.js';

const SQL_FROM_PARTITIONS = 'FROM partitions';
const SQL_FROM_TABLES = 'FROM tables';
const SQL_FROM_SERVICES = 'FROM services';

describe('seven-node-postgres-baseline-partition-split scenario', () => {
  it('forces split-oriented benchmark settings and reports split evidence', async () => {
    let baselineRunCount = 0;
    const originalBenchmarkConfig = {
      tableName: 'benchmark_partition_split_events',
      loadDuration: '75s',
      durationSeconds: 75,
      clients: 7,
    };

    const seedNode = {
      id: 'seed-1',
      role: 'seed',
      query: async (sql) => {
        if (sql.includes(SQL_FROM_TABLES)) {
          return {rows: [{table_id: 'tbl-benchmark'}]};
        }
        if (sql.includes(SQL_FROM_PARTITIONS)) {
          return baselineRunCount === 0 ?
            {rows: [{partition_id: 'bench-p1'}]} :
            {rows: [
              {partition_id: 'bench-p1'},
              {partition_id: 'bench-p2'},
            ]};
        }
        if (sql.includes(SQL_FROM_SERVICES)) {
          return baselineRunCount === 0 ?
            {rows: [
              {partition_id: 'bench-p1', node_id: 'seed-1', status: 'active'},
              {partition_id: 'bench-p1', node_id: 'node-2', status: 'active'},
              {partition_id: 'bench-p1', node_id: 'node-3', status: 'active'},
            ]} :
            {rows: [
              {partition_id: 'bench-p1', node_id: 'seed-1', status: 'active'},
              {partition_id: 'bench-p1', node_id: 'node-2', status: 'active'},
              {partition_id: 'bench-p1', node_id: 'node-3', status: 'active'},
              {partition_id: 'bench-p2', node_id: 'node-4', status: 'active'},
              {partition_id: 'bench-p2', node_id: 'node-5', status: 'active'},
              {partition_id: 'bench-p2', node_id: 'node-6', status: 'active'},
            ]};
        }
        return {rows: []};
      },
    };

    const cluster = {
      _config: {
        benchmark: originalBenchmarkConfig,
      },
      _scenarioOverrides: {
        sevenNodePostgresBaselinePartitionSplit: {
          runBaselineComparison: async (activeCluster) => {
            baselineRunCount += 1;
            const benchmarkConfig = activeCluster?._config?.benchmark || {};
            assert.equal(benchmarkConfig.clients, 7);
            assert.equal(benchmarkConfig.loadDuration, '75s');
            assert.equal(
              benchmarkConfig.tableName,
              'benchmark_partition_split_events',
            );
            assert.deepEqual(benchmarkConfig.benchmarkTablePolicies, {
              externalCdcAllowed: false,
              splitStorageThreshold: 16384,
              splitTrafficThreshold: 120,
              mergeStorageThreshold: 1,
              mergeTrafficThreshold: 1,
            });

            return {
              loadMetrics: {
                total: 200,
                success: 200,
                failed: 0,
              },
              details: {
                benchmark: {
                  workload: 'benchmark_events_mixed',
                  operations: ['INSERT', 'SELECT'],
                  tableName: benchmarkConfig.tableName,
                  postLoadDrainStatus: 'ok',
                  rebalancingPressure: {
                    load: {
                      sampleCount: 3,
                      maxReplicaOpsInFlight: 1,
                      maxLeaderChangesWithinCooldown: 1,
                      pinning: {
                        enabled: false,
                        bypassed: false,
                        violated: false,
                        cancelledLoad: false,
                        violationReasons: [],
                      },
                      criticalState: {
                        sustained: false,
                        sustainedEpisodeCount: 0,
                      },
                    },
                  },
                },
                comparison: {
                  throughputRatioSutToBaseline: 1.2,
                  p99LatencyRatioSutToBaselineAvg: 0.9,
                },
                baseline: {
                  replicationFactor: 3,
                },
              },
            };
          },
        },
      },
      getNodes: () => [
        seedNode,
        {id: 'node-2', role: 'joiner'},
        {id: 'node-3', role: 'joiner'},
        {id: 'node-4', role: 'joiner'},
        {id: 'node-5', role: 'joiner'},
        {id: 'node-6', role: 'joiner'},
        {id: 'node-7', role: 'joiner'},
      ],
    };

    const result = await run(cluster);

    assert.equal(baselineRunCount, 1);
    assert.equal(cluster._config.benchmark, originalBenchmarkConfig);
    assert.equal(result.splitEvidence.partitionCount, 2);
    assert.equal(result.splitEvidence.additionalPartitionCount, 1);
    assert.equal(
      result.details.partitioningRebalanceAssessment.replicaNodeCount,
      6,
    );
    assert.equal(
      result.details.queryServingAssessment.throughputImproved,
      true,
    );
    assert.equal(
      result.details.queryServingAssessment.outperformedBaseline,
      true,
    );
  });
});
