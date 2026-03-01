import {
  describe,
  it,
  assert,
  mkdtemp,
  rm,
  join,
  tmpdir,
  runWithVirtualScenarioTiming as run,
  resolveBenchmarkConfig,
  buildComparison,
  NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
  NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
  NODE_CLIENT_SERVICE_DISCOVERY_SQL,
  NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
  NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
  SCENARIO_PHASE_SEQUENCE,
  PROBE_SQL,
  DEFAULT_PROBE_TIMEOUT_MS,
  DEFAULT_DISCOVERY_HEALTH,
  DEFAULT_DISCOVERY_REPLICA_PORT,
  DISCOVERY_ADMIN_META_SERVICE_ID,
  DISCOVERY_ADMIN_META_PROTOCOL,
  SERVICE_DISCOVERY_SQL_PREFIX,
  DEFAULT_DISCOVERY_TABLE_NAME,
  PREFLIGHT_CRITICAL_PATH_SNAPSHOT_SQL,
  PREFLIGHT_CRITICAL_PATH_SNAPSHOT_SCHEMA_VERSION,
  PREFLIGHT_CRITICAL_PATH_SNAPSHOT_ADDRESS_FALLBACK,
  QUIET_MODE_ACTION_ENTER,
  QUIET_MODE_ACTION_EXIT,
  QUIET_MODE_PHASE_PRE_FLIGHT,
  QUIET_MODE_PHASE_TEARDOWN,
  isRecord,
  buildControlSnapshotPayload,
  hasValidControlSnapshotResult,
  hasValidServiceDiscoveryResult,
  buildServiceDiscoverySnapshot,
  buildPreflightCriticalPathSnapshotPayload,
  asNodeHandle,
  asNodeHandles,
} from './postgres-baseline-comparison-test-helpers.js';


describe('postgres-baseline-comparison scenario', () => {
  it('waits for benchmark table visibility on load nodes before SUT load',
    async () => {
      const loadCalls = [];
      let joinerTableProbeCount = 0;
      const benchmarkTableProbeSql =
        'SELECT count(*) FROM benchmark_events WHERE 1 = 0';
      const provider = {
        createContainer: async (_options) => ({
          containerId: 'benchmark-postgres-1',
          ip: '172.18.0.80',
          name: 'benchmark-postgres-1',
        }),
        execInContainer: async (_containerId, cmd) => {
          const command = String(cmd[2] || '');
          if (command.includes('pg_isready')) {
            return {exitCode: 0, stdout: 'accepting connections', stderr: ''};
          }
          if (command.includes('pg_stat_replication')) {
            return {exitCode: 0, stdout: '0\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            return {rows: [{count: 0}]};
          }
          if (statement.includes('FROM replica_operations') &&
            statement.includes('status NOT IN')) {
            return {rows: []};
          }
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
      };
      const joinerNode = {
        id: 'joiner-1',
        role: 'joiner',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            joinerTableProbeCount++;
            if (joinerTableProbeCount < 3) {
              throw new Error('Table not found: benchmark_events');
            }
            return {rows: [{count: 0}]};
          }
          return {rows: []};
        },
      };

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 5,
            clients: 2,
            jobs: 1,
            loadOpsPerSec: 40,
            loadDuration: '5s',
            loadMaxInFlight: 64,
            tableName: 'benchmark_events',
            replicationFactor: 1,
            syncReplicaAcks: 0,
            quiescentTimeoutMs: 500,
            quiescentPollIntervalMs: 5,
            quiescentStableWindowMs: 0,
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
              loadCalls.push(nodes.map((node) => node.id));
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
              return {
                start: () => ({
                  waitComplete: async () => (
                    isBaselineLoad ?
                      {
                        total: 100,
                        success: 100,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 100,
                        latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                      } :
                      {
                        total: 100,
                        success: 100,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 50,
                        latency: {avg: 4, p50: 3, p95: 6, p99: 7},
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
        getNodes: () => asNodeHandles([seedNode, joinerNode]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      await run(cluster);
      assert.ok(
        joinerTableProbeCount >= 3,
        'scenario should wait until load nodes can query benchmark table',
      );
      assert.deepEqual(
        loadCalls[0],
        ['seed-1', 'joiner-1'],
        'sut load should start only after benchmark table is visible on all selected nodes',
      );
    });

  it('fails strict pre-load readiness with per-node reasons when queryability is unstable',
    async () => {
      const loadCalls = [];
      const benchmarkTableProbeSql =
        'SELECT count(*) FROM benchmark_events WHERE 1 = 0';
      const provider = {
        createContainer: async (_options) => ({
          containerId: 'benchmark-postgres-1',
          ip: '172.18.0.80',
          name: 'benchmark-postgres-1',
        }),
        execInContainer: async (_containerId, cmd) => {
          const command = String(cmd[2] || '');
          if (command.includes('pg_isready')) {
            return {exitCode: 0, stdout: 'accepting connections', stderr: ''};
          }
          if (command.includes('pg_stat_replication')) {
            return {exitCode: 0, stdout: '0\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            return {rows: [{count: 0}]};
          }
          if (statement.includes('FROM replica_operations') &&
            statement.includes('status NOT IN')) {
            return {rows: []};
          }
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
      };
      const joinerNode = {
        id: 'joiner-1',
        role: 'joiner',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            throw new Error('Route stale for benchmark table probe');
          }
          return {rows: []};
        },
      };

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 5,
            clients: 2,
            jobs: 1,
            loadOpsPerSec: 40,
            loadDuration: '5s',
            loadMaxInFlight: 64,
            tableName: 'benchmark_events',
            replicationFactor: 1,
            syncReplicaAcks: 0,
            strictPreloadReadiness: true,
            quiescentTimeoutMs: 120,
            quiescentPollIntervalMs: 5,
            quiescentStableWindowMs: 0,
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
              loadCalls.push(nodes.map((node) => node.id));
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
              return {
                start: () => ({
                  waitComplete: async () => (
                    isBaselineLoad ?
                      {
                        total: 100,
                        success: 100,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 100,
                        latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                      } :
                      {
                        total: 100,
                        success: 100,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 50,
                        latency: {avg: 4, p50: 3, p95: 6, p99: 7},
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
        getNodes: () => asNodeHandles([seedNode, joinerNode]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      await assert.rejects(
        run(cluster),
        /strict_preload_readiness_failed.*node_reasons=/i,
      );
      assert.equal(
        loadCalls.length,
        0,
        'strict pre-load readiness failure should abort before load starts',
      );
    });

  it(
    'fails strict pre-load readiness when local schema readiness is missing ' +
      'even if peers report ready',
    async () => {
      const loadCalls = [];
      const benchmarkTableProbeSql =
        'SELECT count(*) FROM benchmark_events WHERE 1 = 0';
      const provider = {
        createContainer: async (_options) => ({
          containerId: 'benchmark-postgres-1',
          ip: '172.18.0.80',
          name: 'benchmark-postgres-1',
        }),
        execInContainer: async (_containerId, cmd) => {
          const command = String(cmd[2] || '');
          if (command.includes('pg_isready')) {
            return {exitCode: 0, stdout: 'accepting connections', stderr: ''};
          }
          if (command.includes('pg_stat_replication')) {
            return {exitCode: 0, stdout: '0\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      function buildDiscoveryReplica(nodeId) {
        return {
          endpointId: 'sys-postgres-wire-ep-' + nodeId,
          serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
          nodeId,
          address: '127.0.0.1',
          port: 5432,
          healthStatus: 'healthy',
          updatedAt: Date.now(),
          metadata: {},
          readiness: {
            workloadReady: true,
            benchmarkReady: true,
            routingReady: true,
            schemaReady: true,
            topologyReady: true,
            replicaOpsInFlight: 0,
            leadershipStable: true,
            tableName: 'benchmark_events',
            reasons: [],
          },
        };
      }

      function buildDiscoverySnapshot(nodeId, replicaNodeIds) {
        const replicas = replicaNodeIds.map((replicaNodeId) =>
          buildDiscoveryReplica(replicaNodeId));
        return {
          schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
          nodeId,
          capturedAt: Date.now(),
          serviceCount: 1,
          replicaCount: replicas.length,
          services: [{
            serviceKey:
              NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE +
              '|' +
              NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
            logicalServiceName: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
            protocol: NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
            serviceIds: [NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE],
            nodes: replicaNodeIds,
            replicas,
          }],
        };
      }

      function createNode(nodeId, discoveryReplicaNodeIds) {
        return {
          id: nodeId,
          role: nodeId === 'seed-1' ? 'seed' : 'joiner',
          query: async (sql) => {
            const statement = String(sql);
            if (statement === 'SELECT 1') {
              return {rows: [{value: 1}]};
            }
            if (statement === benchmarkTableProbeSql) {
              return {rows: [{count: 0}]};
            }
            if (statement.includes('FROM replica_operations') &&
              statement.includes('status NOT IN')) {
              return {rows: []};
            }
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
          queryWithTimeout: async function(sql, params = [], _options = {}) {
            const statement = String(sql);
            if (statement === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
              return {
                rows: [buildControlSnapshotPayload(this.id)],
              };
            }
            if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
                statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
              return {
                rows: [buildDiscoverySnapshot(this.id, discoveryReplicaNodeIds)],
              };
            }
            return this.query(statement, params);
          },
          getReachabilityDiagnostics: async () => ({
            nodeId,
            reachable: true,
            adminReady: true,
          }),
        };
      }

      const seedNode = createNode('seed-1', ['seed-1', 'joiner-1']);
      const joinerNode = createNode('joiner-1', ['seed-1']);

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 5,
            clients: 2,
            jobs: 1,
            loadOpsPerSec: 40,
            loadDuration: '5s',
            loadMaxInFlight: 64,
            tableName: 'benchmark_events',
            replicationFactor: 1,
            syncReplicaAcks: 0,
            strictPreloadReadiness: true,
            quiescentTimeoutMs: 240,
            quiescentPollIntervalMs: 5,
            quiescentStableWindowMs: 0,
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
              loadCalls.push(nodes.map((node) => node.id));
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
              return {
                start: () => ({
                  waitComplete: async () => (
                    isBaselineLoad ?
                      {
                        total: 100,
                        success: 100,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 100,
                        latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                      } :
                      {
                        total: 100,
                        success: 100,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 50,
                        latency: {avg: 4, p50: 3, p95: 6, p99: 7},
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
        getNodes: () => [seedNode, joinerNode],
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      await assert.rejects(
        run(cluster),
        /strict_preload_readiness_failed.*(schema_version_unknown|routing_not_ready)/i,
      );
      assert.equal(
        loadCalls.length,
        0,
        'strict pre-load readiness should fail closed before load when local ' +
          'schema readiness is missing',
      );
    });

  it('fails strict pre-load readiness when canonical benchmark readiness is false',
    async () => {
      const loadCalls = [];
      const benchmarkTableProbeSql =
        'SELECT count(*) FROM benchmark_events WHERE 1 = 0';
      const provider = {
        createContainer: async (_options) => ({
          containerId: 'benchmark-postgres-1',
          ip: '172.18.0.80',
          name: 'benchmark-postgres-1',
        }),
        execInContainer: async (_containerId, cmd) => {
          const command = String(cmd[2] || '');
          if (command.includes('pg_isready')) {
            return {exitCode: 0, stdout: 'accepting connections', stderr: ''};
          }
          if (command.includes('pg_stat_replication')) {
            return {exitCode: 0, stdout: '0\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      function buildDiscoverySnapshotWithBenchmarkGap(nodeId) {
        return {
          schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
          nodeId,
          capturedAt: Date.now(),
          serviceCount: 1,
          replicaCount: 2,
          services: [{
            serviceKey:
              NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE +
              '|' +
              NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
            logicalServiceName: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
            protocol: NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
            serviceIds: [NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE],
            nodes: ['seed-1', 'joiner-1'],
            replicas: [{
              endpointId: 'sys-postgres-wire-ep-seed-1',
              serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
              nodeId: 'seed-1',
              address: '127.0.0.1',
              port: 5432,
              healthStatus: 'healthy',
              updatedAt: Date.now(),
              metadata: {},
              readiness: {
                workloadReady: true,
                benchmarkReady: true,
                routingReady: true,
                schemaReady: true,
                topologyReady: true,
                replicaOpsInFlight: 0,
                leadershipStable: true,
                tableName: 'benchmark_events',
                reasons: [],
              },
            }, {
              endpointId: 'sys-postgres-wire-ep-joiner-1',
              serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
              nodeId: 'joiner-1',
              address: '127.0.0.1',
              port: 5432,
              healthStatus: 'healthy',
              updatedAt: Date.now(),
              metadata: {},
              readiness: {
                workloadReady: true,
                benchmarkReady: false,
                routingReady: true,
                schemaReady: true,
                topologyReady: true,
                replicaOpsInFlight: 0,
                leadershipStable: true,
                tableName: 'benchmark_events',
                reasons: [{
                  code: 'benchmark_not_ready',
                  detail: 'benchmark readiness gate not satisfied',
                }],
              },
            }],
          }],
        };
      }

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            return {rows: [{count: 0}]};
          }
          if (statement.includes('FROM replica_operations') &&
            statement.includes('status NOT IN')) {
            return {rows: []};
          }
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
        queryWithTimeout: async function(sql, params = [], _options = {}) {
          const statement = String(sql);
          if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
            statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
            return {
              rows: [buildDiscoverySnapshotWithBenchmarkGap(this.id)],
            };
          }
          return this.query(sql, params);
        },
      };
      const joinerNode = {
        id: 'joiner-1',
        role: 'joiner',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            return {rows: [{count: 0}]};
          }
          return {rows: []};
        },
        queryWithTimeout: async function(sql, params = [], _options = {}) {
          const statement = String(sql);
          if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
            statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
            return {
              rows: [buildDiscoverySnapshotWithBenchmarkGap(this.id)],
            };
          }
          return this.query(sql, params);
        },
      };

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 5,
            clients: 2,
            jobs: 1,
            loadOpsPerSec: 40,
            loadDuration: '5s',
            loadMaxInFlight: 64,
            tableName: 'benchmark_events',
            replicationFactor: 1,
            syncReplicaAcks: 0,
            strictPreloadReadiness: true,
            quiescentTimeoutMs: 120,
            quiescentPollIntervalMs: 5,
            quiescentStableWindowMs: 0,
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
              loadCalls.push(nodes.map((node) => node.id));
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
              return {
                start: () => ({
                  waitComplete: async () => (
                    isBaselineLoad ?
                      {
                        total: 100,
                        success: 100,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 100,
                        latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                      } :
                      {
                        total: 100,
                        success: 100,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 50,
                        latency: {avg: 4, p50: 3, p95: 6, p99: 7},
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
        getNodes: () => asNodeHandles([seedNode, joinerNode]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      await assert.rejects(
        run(cluster),
        /strict_preload_readiness_failed.*schema_version_unknown/i,
      );
      assert.equal(
        loadCalls.length,
        0,
        'strict pre-load readiness should fail before load when schema version evidence is missing',
      );
    });

  function buildVersionedStrictReadinessCluster(options = {}) {
    const loadCalls = [];
    const controlSnapshotCalls = [];
    const tableProbeCalls = [];
    let serviceDiscoveryCallCount = 0;
    const benchmarkTableProbeSql =
      'SELECT count(*) FROM benchmark_events WHERE 1 = 0';
    const requiredSchemaVersion = typeof options.requiredSchemaVersion === 'string' ?
      options.requiredSchemaVersion :
      '1740589945123:7:seed-1';
    const appliedSchemaVersion = typeof options.appliedSchemaVersion === 'string' ?
      options.appliedSchemaVersion :
      requiredSchemaVersion;
    const benchmarkReady = options.benchmarkReady !== false;
    const routingReady = options.routingReady !== false;
    const topologyReady = options.topologyReady !== false;
    const includeTopologyReady = options.includeTopologyReady !== false;
    const throwOnControlSnapshot = options.throwOnControlSnapshot === true;
    const adminQueryTraceSnapshot = Array.isArray(options.adminQueryTraceSnapshot) ?
      options.adminQueryTraceSnapshot :
      [];
    const quiescentTimeoutMs = Number.isInteger(options.quiescentTimeoutMs) &&
      options.quiescentTimeoutMs > 0 ?
      options.quiescentTimeoutMs :
      120;
    const readinessReasons = Array.isArray(options.reasons) ? options.reasons : [];
    const includeAppliedSchemaVersion = options.includeAppliedSchemaVersion !== false;
    const provider = {
      createContainer: async (_options) => ({
        containerId: 'benchmark-postgres-1',
        ip: '172.18.0.80',
        name: 'benchmark-postgres-1',
      }),
      execInContainer: async (_containerId, cmd) => {
        const command = String(cmd[2] || '');
        if (command.includes('pg_isready')) {
          return {exitCode: 0, stdout: 'accepting connections', stderr: ''};
        }
        if (command.includes('pg_stat_replication')) {
          return {exitCode: 0, stdout: '0\n', stderr: ''};
        }
        return {exitCode: 0, stdout: '', stderr: ''};
      },
      stopContainer: async () => {},
      removeContainer: async () => {},
    };

    const seedNode = {
      id: 'seed-1',
      role: 'seed',
      query: async function(sql) {
        const statement = String(sql);
        if (statement === 'SELECT 1') {
          return {rows: [{value: 1}]};
        }
        if (statement === benchmarkTableProbeSql) {
          tableProbeCalls.push(this.id);
          return {rows: [{count: 0}]};
        }
        if (statement.includes('FROM replica_operations') &&
          statement.includes('status NOT IN')) {
          return {rows: []};
        }
        if (statement.includes('FROM tables')) {
          return {
            rows: [{
              table_id: 'tbl-benchmark',
              schema_version: requiredSchemaVersion,
            }],
          };
        }
        if (statement.startsWith('UPDATE partitions SET table_name')) {
          return {rows: [], changes: 1};
        }
        if (statement.includes('FROM partitions')) {
          return {rows: [{partition_id: 'p1'}]};
        }
        return {rows: []};
      },
      queryWithTimeout: async function(sql, params = [], _options = {}) {
        const statement = String(sql);
        if (statement === PREFLIGHT_CRITICAL_PATH_SNAPSHOT_SQL) {
          return {
            rows: [buildPreflightCriticalPathSnapshotPayload(this)],
          };
        }
        if (statement === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
          controlSnapshotCalls.push(this.id);
          if (throwOnControlSnapshot) {
            throw new Error('control snapshot fallback should not be queried');
          }
          return {
            rows: [buildControlSnapshotPayload(this.id)],
          };
        }
        if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
            statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
          serviceDiscoveryCallCount += 1;
          const readiness = {
            workloadReady: true,
            benchmarkReady,
            routingReady,
            schemaReady: true,
            replicaOpsInFlight: 0,
            leadershipStable: true,
            tableName: 'benchmark_events',
            reasons: serviceDiscoveryCallCount > 1 ? readinessReasons : [],
          };
          if (includeTopologyReady) {
            readiness.topologyReady = topologyReady;
          }
          if (includeAppliedSchemaVersion) {
            readiness.appliedSchemaVersion = appliedSchemaVersion;
          }
          return {
            rows: [{
              schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
              nodeId: this.id,
              capturedAt: Date.now(),
              serviceCount: 1,
              replicaCount: 1,
              services: [{
                serviceKey:
                  NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE +
                  '|' +
                  NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
                logicalServiceName: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
                protocol: NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
                serviceIds: [NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE],
                nodes: [this.id],
                replicas: [{
                  endpointId: 'sys-postgres-wire-ep-' + this.id,
                  serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
                  nodeId: this.id,
                  address: '127.0.0.1',
                  port: 5432,
                  healthStatus: 'healthy',
                  updatedAt: Date.now(),
                  metadata: {},
                  readiness,
                }],
              }],
            }],
          };
        }
        return this.query(statement, params);
      },
      getReachabilityDiagnostics: async function() {
        return {
          nodeId: this.id,
          reachable: true,
          adminReady: true,
        };
      },
      getAdminQueryTraceSnapshot: function() {
        return adminQueryTraceSnapshot.map((entry) => ({...entry}));
      },
    };

    const cluster = {
      _config: {
        benchmark: {
          baselineImage: 'postgres:16',
          durationSeconds: 5,
          clients: 2,
          jobs: 1,
          loadOpsPerSec: 40,
          loadDuration: '5s',
          loadMaxInFlight: 64,
          tableName: 'benchmark_events',
          replicationFactor: 1,
          syncReplicaAcks: 0,
          strictPreloadReadiness: true,
          quiescentTimeoutMs,
          quiescentPollIntervalMs: 5,
          quiescentStableWindowMs: 0,
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
            loadCalls.push(nodes.map((node) => node.id));
            const isBaselineLoad =
              String(nodes?.[0]?.id || '').startsWith(
                'postgres-baseline-load-node-',
              );
            return {
              start: () => ({
                waitComplete: async () => (
                  isBaselineLoad ?
                    {
                      total: 100,
                      success: 100,
                      failed: 0,
                      errors: 0,
                      opsPerSec: 100,
                      latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                    } :
                    {
                      total: 100,
                      success: 100,
                      failed: 0,
                      errors: 0,
                      opsPerSec: 50,
                      latency: {avg: 4, p50: 3, p95: 6, p99: 7},
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
      getNodes: () => [seedNode],
      waitForConvergence: async () => ({settledAfterMs: 1}),
      assertConsistency: async () => {},
    };

    return {
      cluster,
      loadCalls,
      controlSnapshotCalls,
      tableProbeCalls,
    };
  }

  it(
    'admits strict pre-load readiness when applied schema version satisfies ' +
      'required watermark even with stale benchmarkReady flag',
    async () => {
      const {cluster, loadCalls} = buildVersionedStrictReadinessCluster({
        benchmarkReady: false,
        appliedSchemaVersion: '1740589945123:7:seed-1',
      });

      const result = await run(cluster);
      assert.equal(
        result.details.benchmark.sutLoadNodeCount,
        1,
        'strict pre-load readiness should admit node when schema version is converged',
      );
      assert.equal(
        loadCalls.length,
        2,
        'strict pre-load readiness pass should run both sut and baseline loads',
      );
    });

  it(
    'fails strict pre-load readiness with schema_version_unknown when applied ' +
      'schema version is missing',
    async () => {
      const {cluster, loadCalls} = buildVersionedStrictReadinessCluster({
        benchmarkReady: true,
        includeAppliedSchemaVersion: false,
      });

      await assert.rejects(
        run(cluster),
        /strict_preload_readiness_failed.*schema_version_unknown/i,
      );
      assert.equal(
        loadCalls.length,
        0,
        'strict pre-load readiness should fail closed before load when applied version is missing',
      );
    });

  it('captures raw discovery readiness reasons in strict version convergence diagnostics',
    async () => {
      const {cluster} = buildVersionedStrictReadinessCluster({
        benchmarkReady: true,
        includeAppliedSchemaVersion: false,
        reasons: [{
          code: 'schema_table_missing',
          detail: 'table "benchmark_events" not found',
        }],
      });

      await assert.rejects(
        run(cluster),
        (error) => {
          const convergenceNode = error?.diagnostics?.failure?.
            versionConvergence?.nodes?.['seed-1'];
          assert.ok(
            convergenceNode && typeof convergenceNode === 'object',
            'strict failure diagnostics should include convergence entry for seed',
          );
          assert.ok(
            Array.isArray(convergenceNode.discoveryReasons),
            'strict convergence entry should include raw discovery reasons',
          );
          assert.ok(
            convergenceNode.discoveryReasons.includes(
              'schema_table_missing=table "benchmark_events" not found',
            ),
            'strict convergence entry should preserve discovery reason detail text',
          );
          return true;
        },
      );
    });

  it(
    'fails strict pre-load readiness with schema_version_lag when applied ' +
      'schema version is below required watermark',
    async () => {
      const {cluster, loadCalls} = buildVersionedStrictReadinessCluster({
        benchmarkReady: true,
        requiredSchemaVersion: '1740589945123:7:seed-1',
        appliedSchemaVersion: '1740589945123:6:seed-1',
      });

      await assert.rejects(
        run(cluster),
        /strict_preload_readiness_failed.*schema_version_lag/i,
      );
      assert.equal(
        loadCalls.length,
        0,
        'strict pre-load readiness should fail closed before load when applied version lags',
      );
    });

  it('fails strict pre-load readiness closed when canonical snapshot omits topology status',
    async () => {
      const {cluster, loadCalls} = buildVersionedStrictReadinessCluster({
        includeTopologyReady: false,
        quiescentTimeoutMs: 120,
      });

      await assert.rejects(
        run(cluster),
        /strict_preload_readiness_failed.*topology_not_ready/i,
      );
      assert.equal(
        loadCalls.length,
        0,
        'strict pre-load readiness should fail closed when canonical topology status is missing',
      );
    });

  it('uses strict canonical snapshot path without fallback probe queries',
    async () => {
      const {cluster, controlSnapshotCalls, tableProbeCalls} =
        buildVersionedStrictReadinessCluster({
          includeAppliedSchemaVersion: false,
          quiescentTimeoutMs: 120,
        });

      await assert.rejects(
        run(cluster),
        /strict_preload_readiness_failed.*schema_version_unknown/i,
      );
      assert.equal(
        controlSnapshotCalls.length,
        0,
        'strict canonical pre-load gate should avoid control snapshot fallback queries',
      );
      assert.equal(
        tableProbeCalls.length,
        0,
        'strict canonical pre-load gate should avoid direct table probe queries',
      );
    });

});
