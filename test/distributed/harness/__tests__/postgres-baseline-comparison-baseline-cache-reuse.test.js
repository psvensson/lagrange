import {
  describe,
  it,
  assert,
  mkdtemp,
  rm,
  join,
  tmpdir,
  runWithVirtualScenarioTiming as run,
  asNodeHandles,
} from './postgres-baseline-comparison-test-helpers.js';
import {
} from '../../scenarios/postgres-baseline-node-admission.js';
import {
} from '../__fixtures__/postgres-baseline-node-admission-replay-fixtures.js';


describe('postgres-baseline-comparison scenario', () => {
  it('reuses cached baseline metrics for repeated runs on same machine/profile',
    async () => {
      const outputDir = await mkdtemp(
        join(tmpdir(), 'postgres-baseline-cache-test-'),
      );
      const createdContainers = [];
      let baselineLoadCalls = 0;
      let sutLoadCalls = 0;
      const baselineSql = [];
      const provider = {
        createContainer: async (options) => {
          createdContainers.push(options);
          const index = createdContainers.length;
          return {
            containerId: `benchmark-postgres-${index}`,
            ip: `172.18.0.${80 + index}`,
            name: `benchmark-postgres-${index}`,
          };
        },
        execInContainer: async (_containerId, cmd) => {
          const command = String(cmd[2] || '');
          if (command.includes('pg_isready')) {
            return {exitCode: 0, stdout: 'accepting connections', stderr: ''};
          }
          if (command.includes('pg_stat_replication')) {
            return {exitCode: 0, stdout: '2\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      const cluster = {
        _config: {
          outputDir,
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 10,
            clients: 4,
            jobs: 2,
            loadOpsPerSec: 80,
            loadDuration: '10s',
            tableName: 'benchmark_events',
            replicationFactor: 3,
            syncReplicaAcks: 1,
            cacheBaselineMetrics: true,
            refreshBaselineMetrics: false,
          },
          convergence: {
            settleTimeoutMs: 1000,
            quietWindowMs: 100,
            targetVoterCount: 3,
          },
          resourceLimits: {
            memory: '1g',
            cpus: '1.0',
          },
          timeouts: {
            nodeStartup: 1000,
          },
        },
        _scenarioOverrides: {
          postgresBaselineComparison: {
            createPostgresPool: () => ({
              query: async (sql) => {
                baselineSql.push(String(sql));
                return {rows: []};
              },
              end: async () => {},
            }),
            createLoadGenerator: (nodes) => {
              const firstNodeId = String(nodes?.[0]?.id || '');
              const isBaselineLoad = firstNodeId.startsWith(
                'postgres-baseline-load-node-',
              );
              if (isBaselineLoad) {
                baselineLoadCalls++;
              } else {
                sutLoadCalls++;
              }
              return {
                start: () => ({
                  waitComplete: async () => (
                    isBaselineLoad ?
                      {
                        total: 118,
                        success: 118,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 100,
                        latency: {avg: 12.5, p50: 6, p95: 11, p99: 14},
                      } :
                      {
                        total: 120,
                        success: 118,
                        failed: 0,
                        errors: 0,
                        attemptErrors: 2,
                        opsPerSec: 84,
                        latency: {p50: 3, p95: 7, p99: 15},
                      }
                  ),
                }),
              };
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([{
          id: 'seed-1',
          role: 'seed',
          query: async (sql) => {
            const statement = String(sql);
            if (statement.includes('FROM tables')) {
              return {rows: [{table_id: 'tbl-benchmark', updated_at: 1740589945123}]};
            }
            if (statement.startsWith('UPDATE partitions SET table_name')) {
              return {rows: [], changes: 1};
            }
            if (statement.includes('FROM partitions')) {
              return {rows: [{partition_id: 'p1'}]};
            }
            return {rows: []};
          },
        }]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      try {
        const first = await run(cluster);
        assert.equal(first.details.baseline.cache.hit, false);
        assert.equal(first.details.baseline.cache.reason, 'cache-stored');
        assert.equal(createdContainers.length, 3);
        assert.equal(baselineLoadCalls, 1);
        assert.equal(sutLoadCalls, 1);
        assert.ok(
          baselineSql.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS')),
          'scenario should prepare baseline benchmark table before load',
        );

        const second = await run(cluster);
        assert.equal(second.details.baseline.cache.hit, true);
        assert.equal(second.details.baseline.cache.reason, 'cache-hit');
        assert.equal(createdContainers.length, 3);
        assert.equal(baselineLoadCalls, 1);
        assert.equal(sutLoadCalls, 2);
      } finally {
        await rm(outputDir, {recursive: true, force: true});
      }
    });

  it('reuses baseline cache across equivalent runs with different report filenames',
    async () => {
      const outputRoot = await mkdtemp(
        join(tmpdir(), 'postgres-baseline-cache-report-name-test-'),
      );
      const createdContainers = [];
      let baselineLoadCalls = 0;
      let sutLoadCalls = 0;
      const provider = {
        createContainer: async (options) => {
          createdContainers.push(options);
          const index = createdContainers.length;
          return {
            containerId: `benchmark-postgres-${index}`,
            ip: `172.18.0.${80 + index}`,
            name: `benchmark-postgres-${index}`,
          };
        },
        execInContainer: async (_containerId, cmd) => {
          const command = String(cmd[2] || '');
          if (command.includes('pg_isready')) {
            return {exitCode: 0, stdout: 'accepting connections', stderr: ''};
          }
          if (command.includes('pg_stat_replication')) {
            return {exitCode: 0, stdout: '2\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      const buildCluster = (outputDir) => ({
        _config: {
          outputDir,
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 10,
            clients: 4,
            jobs: 2,
            loadOpsPerSec: 80,
            loadDuration: '10s',
            tableName: 'benchmark_events',
            replicationFactor: 3,
            syncReplicaAcks: 1,
            cacheBaselineMetrics: true,
            refreshBaselineMetrics: false,
          },
          convergence: {
            settleTimeoutMs: 1000,
            quietWindowMs: 100,
            targetVoterCount: 3,
          },
          resourceLimits: {
            memory: '1g',
            cpus: '1.0',
          },
          timeouts: {
            nodeStartup: 1000,
          },
        },
        _scenarioOverrides: {
          postgresBaselineComparison: {
            createPostgresPool: () => ({
              query: async () => ({rows: []}),
              end: async () => {},
            }),
            createLoadGenerator: (nodes) => {
              const firstNodeId = String(nodes?.[0]?.id || '');
              const isBaselineLoad = firstNodeId.startsWith(
                'postgres-baseline-load-node-',
              );
              if (isBaselineLoad) {
                baselineLoadCalls++;
              } else {
                sutLoadCalls++;
              }
              return {
                start: () => ({
                  waitComplete: async () => (
                    isBaselineLoad ?
                      {
                        total: 118,
                        success: 118,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 100,
                        latency: {avg: 12.5, p50: 6, p95: 11, p99: 14},
                      } :
                      {
                        total: 120,
                        success: 118,
                        failed: 0,
                        errors: 0,
                        attemptErrors: 2,
                        opsPerSec: 84,
                        latency: {p50: 3, p95: 7, p99: 15},
                      }
                  ),
                }),
              };
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([{
          id: 'seed-1',
          role: 'seed',
          query: async (sql) => {
            const statement = String(sql);
            if (statement.includes('FROM tables')) {
              return {rows: [{table_id: 'tbl-benchmark', updated_at: 1740589945123}]};
            }
            if (statement.startsWith('UPDATE partitions SET table_name')) {
              return {rows: [], changes: 1};
            }
            if (statement.includes('FROM partitions')) {
              return {rows: [{partition_id: 'p1'}]};
            }
            return {rows: []};
          },
        }]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      });

      try {
        const first = await run(buildCluster(
          join(outputRoot, 'postgres-baseline-a.report.json'),
        ));
        assert.equal(first.details.baseline.cache.hit, false);
        assert.equal(first.details.baseline.cache.reason, 'cache-stored');
        assert.equal(baselineLoadCalls, 1);
        assert.equal(sutLoadCalls, 1);

        const second = await run(buildCluster(
          join(outputRoot, 'postgres-baseline-b.report.json'),
        ));
        assert.equal(
          second.details.baseline.cache.key,
          first.details.baseline.cache.key,
          'cache identity key should remain stable across report filename changes',
        );
        assert.equal(
          second.details.baseline.cache.path,
          first.details.baseline.cache.path,
          'cache path should be anchored independent of report filename',
        );
        assert.equal(second.details.baseline.cache.hit, true);
        assert.equal(second.details.baseline.cache.reason, 'cache-hit');
        assert.equal(
          baselineLoadCalls,
          1,
          'equivalent rerun with different report filename should reuse baseline cache',
        );
      } finally {
        await rm(outputRoot, {recursive: true, force: true});
      }
    });
});
