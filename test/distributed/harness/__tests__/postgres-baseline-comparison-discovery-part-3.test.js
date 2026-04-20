import {
  describe,
  it,
  assert,
  mkdtemp,
  rm,
  join,
  tmpdir,
  run as scenarioRun,
  runWithVirtualScenarioTiming as run,
  installVirtualScenarioTiming,
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
  it('requires local self-discovery confirmation before admitting discovered load nodes',
    async () => {
      const loadCalls = [];
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

      const capturedAt = Date.now();
      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        discoveryNodeIds: ['seed-1', 'joiner-1'],
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
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
        queryWithTimeout: async (sql, _params = [], _options = {}) => {
          const statement = String(sql);
          if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
              statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
            return {
              rows: [buildServiceDiscoverySnapshot({
                id: 'seed-1',
                _discoveryNodeIds: ['seed-1', 'joiner-1'],
              })],
            };
          }
          return seedNode.query(statement);
        },
      };
      const joinerNode = {
        id: 'joiner-1',
        role: 'joiner',
        discoveryNodeIds: ['seed-1', 'joiner-1'],
        query: async (sql) => {
          if (String(sql) === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          return {rows: []};
        },
        queryWithTimeout: async (sql, _params = [], _options = {}) => {
          const statement = String(sql);
          if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
              statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
            return {
              rows: [{
                schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
                nodeId: 'joiner-1',
                capturedAt,
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
                  desiredReplicaCount: 2,
                  desiredReplicaCountByServiceId: {
                    [NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE]: 2,
                  },
                  observedReplicaCount: 2,
                  healthyReplicaCount: 2,
                  unhealthyReplicaCount: 0,
                  health: DEFAULT_DISCOVERY_HEALTH,
                  nodeCount: 2,
                  nodes: ['seed-1', 'joiner-1'],
                  replicas: [{
                    endpointId:
                      NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE + '-ep-seed-1',
                    serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
                    nodeId: 'seed-1',
                    address: '127.0.0.1',
                    port: DEFAULT_DISCOVERY_REPLICA_PORT,
                    healthStatus: DEFAULT_DISCOVERY_HEALTH,
                    updatedAt: capturedAt,
                    metadata: {},
                    readiness: {
                      workloadReady: true,
                      benchmarkReady: true,
                      routingReady: true,
                      schemaReady: true,
                      topologyReady: true,
                      replicaOpsInFlight: 0,
                      leadershipStable: true,
                      tableName: DEFAULT_DISCOVERY_TABLE_NAME,
                      reasons: [],
                    },
                  }, {
                    endpointId:
                      NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE + '-ep-joiner-1',
                    serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
                    nodeId: 'joiner-1',
                    address: '127.0.0.1',
                    port: DEFAULT_DISCOVERY_REPLICA_PORT,
                    healthStatus: DEFAULT_DISCOVERY_HEALTH,
                    updatedAt: capturedAt,
                    metadata: {},
                    readiness: {
                      workloadReady: false,
                      benchmarkReady: false,
                      routingReady: true,
                      schemaReady: true,
                      topologyReady: false,
                      replicaOpsInFlight: 1,
                      leadershipStable: false,
                      tableName: DEFAULT_DISCOVERY_TABLE_NAME,
                      reasons: [{
                        code: 'local_replica_not_voter_ready',
                        detail: 'joiner-local-view-lagging',
                      }],
                    },
                    benchmarkAdmission: {
                      tableName: DEFAULT_DISCOVERY_TABLE_NAME,
                      nodeId: 'joiner-1',
                      state: 'blocked',
                      routingReady: true,
                      schemaReady: true,
                      topologyReady: false,
                      localReplicaRole: 'candidate',
                      degradedByOperationIds: [],
                      reasons: [{
                        code: 'local_replica_not_voter_ready',
                        detail: 'joiner-local-view-lagging',
                      }],
                    },
                  }],
                }],
              }],
            };
          }
          return joinerNode.query(statement);
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
            readyTimeoutMs: 120,
            readyPollIntervalMs: 5,
            quiescentTimeoutMs: 1000,
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

      const result = await run(cluster);
      assert.deepEqual(
        loadCalls[0],
        ['seed-1'],
        'sut load should exclude nodes whose local discovery view does not confirm readiness',
      );
      assert.match(
        JSON.stringify(result.details.benchmark.sutLoadDiscovery),
        /local_replica_not_voter_ready/i,
        'discovery diagnostics should include canonical benchmark admission exclusion detail',
      );
    });

  it('requires benchmark table probe success before admitting discovered load nodes',
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
        discoveryNodeIds: ['seed-1', 'joiner-1'],
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
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
        discoveryNodeIds: ['seed-1', 'joiner-1'],
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
        queryWithTimeout: async (sql, _params = [], options = {}) => {
          const statement = String(sql);
          if (options?.lane === 'load' && statement === benchmarkTableProbeSql) {
            throw new Error('benchmark table probe timed out');
          }
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            return {rows: [{count: 0}]};
          }
          return {rows: []};
        },
        getReachabilityDiagnostics: async () => ({
          nodeId: 'joiner-1',
          reachable: true,
          adminReady: true,
          reachableBy: 'admin_health',
        }),
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
            readyTimeoutMs: 120,
            readyPollIntervalMs: 5,
            quiescentTimeoutMs: 1000,
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

      const result = await run(cluster);
      assert.deepEqual(
        loadCalls[0],
        ['seed-1'],
        'sut load should exclude discovered nodes whose load lane probe fails',
      );
      assert.match(
        JSON.stringify(result.details.benchmark.sutLoadDiscovery),
        /load_probe/i,
        'discovery diagnostics should record load-lane probe failures',
      );
    });

  it('requires schema-ready discovery before admitting discovered load nodes',
    async () => {
      const loadCalls = [];
      const discoveryQueryStatements = [];
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

      const buildDiscoverySnapshot = (originNodeId) => ({
        schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
        nodeId: originNodeId,
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
          desiredReplicaCount: 2,
          desiredReplicaCountByServiceId: {
            [NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE]: 2,
          },
          observedReplicaCount: 2,
          healthyReplicaCount: 2,
          unhealthyReplicaCount: 0,
          health: DEFAULT_DISCOVERY_HEALTH,
          nodeCount: 2,
          nodes: ['seed-1', 'joiner-1'],
          replicas: [{
            endpointId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE + '-ep-seed-1',
            serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
            nodeId: 'seed-1',
            address: '127.0.0.1',
            port: DEFAULT_DISCOVERY_REPLICA_PORT,
            healthStatus: DEFAULT_DISCOVERY_HEALTH,
            updatedAt: Date.now(),
            metadata: {},
            readiness: {
              workloadReady: true,
              routingReady: true,
              schemaReady: true,
              replicaOpsInFlight: 0,
              leadershipStable: true,
              tableName: 'benchmark_events',
              reasons: [],
            },
          }, {
            endpointId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE + '-ep-joiner-1',
            serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
            nodeId: 'joiner-1',
            address: '127.0.0.1',
            port: DEFAULT_DISCOVERY_REPLICA_PORT,
            healthStatus: DEFAULT_DISCOVERY_HEALTH,
            updatedAt: Date.now(),
            metadata: {},
            readiness: {
              workloadReady: true,
              routingReady: true,
              schemaReady: false,
              replicaOpsInFlight: 0,
              leadershipStable: true,
              tableName: 'benchmark_events',
              reasons: [{
                code: 'schema_not_ready',
                detail: 'table "benchmark_events" missing',
              }],
            },
          }],
        }],
      });

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        queryWithTimeout: async (sql) => {
          const statement = String(sql);
          if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
            statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
            discoveryQueryStatements.push(statement);
            return {
              rows: [buildDiscoverySnapshot('seed-1')],
            };
          }
          return seedNode.query(sql);
        },
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            return {rows: [{count: 0}]};
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
          if (statement.includes('FROM replica_operations') &&
            statement.includes('status NOT IN')) {
            return {rows: []};
          }
          return {rows: []};
        },
      };
      const joinerNode = {
        id: 'joiner-1',
        role: 'joiner',
        queryWithTimeout: async (sql) => {
          const statement = String(sql);
          if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
            statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
            discoveryQueryStatements.push(statement);
            return {
              rows: [buildDiscoverySnapshot('joiner-1')],
            };
          }
          return joinerNode.query(sql);
        },
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            throw new Error('Table not found: benchmark_events');
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
            readyTimeoutMs: 120,
            readyPollIntervalMs: 5,
            quiescentTimeoutMs: 200,
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

      const result = await run(cluster);
      assert.deepEqual(
        loadCalls[0],
        ['seed-1'],
        'sut load should exclude discovered nodes that are not schema-ready',
      );
      assert.ok(
        result.details.benchmark.sutLoadDiscovery.sourceResults
          .some((sourceResult) =>
            Array.isArray(
              sourceResult.excludedReadinessByNodeId?.['joiner-1'],
            ) &&
            sourceResult.excludedReadinessByNodeId['joiner-1']
              .some((reason) => reason.startsWith('schema_not_ready')),
          ),
        'discovery diagnostics should record schema readiness exclusions',
      );
      const expectedDiscoverySql = SERVICE_DISCOVERY_SQL_PREFIX +
        '\'' + DEFAULT_DISCOVERY_TABLE_NAME + '\')';
      const expectedDiscoverySqlWithTableId = SERVICE_DISCOVERY_SQL_PREFIX +
        '\'' + DEFAULT_DISCOVERY_TABLE_NAME + '\', \'tbl-benchmark\')';
      assert.ok(
        discoveryQueryStatements.length > 0,
        'schema-ready discovery should query service_discovery_local()',
      );
      assert.ok(
        discoveryQueryStatements.every((statement) =>
          statement === expectedDiscoverySql ||
            statement === expectedDiscoverySqlWithTableId),
        'schema-ready discovery should scope service discovery by benchmark table',
      );
    });

  it('admits discovered nodes when load-lane probe confirms stale local schema blockers',
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

      const buildSeedDiscoverySnapshot = (originNodeId) => ({
        schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
        nodeId: originNodeId,
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
          desiredReplicaCount: 2,
          desiredReplicaCountByServiceId: {
            [NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE]: 2,
          },
          observedReplicaCount: 2,
          healthyReplicaCount: 2,
          unhealthyReplicaCount: 0,
          health: DEFAULT_DISCOVERY_HEALTH,
          nodeCount: 2,
          nodes: ['seed-1', 'joiner-1'],
          replicas: [{
            endpointId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE + '-ep-seed-1',
            serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
            nodeId: 'seed-1',
            address: '127.0.0.1',
            port: DEFAULT_DISCOVERY_REPLICA_PORT,
            healthStatus: DEFAULT_DISCOVERY_HEALTH,
            updatedAt: Date.now(),
            metadata: {},
            benchmarkAdmission: {
              state: 'ready',
              routingReady: true,
              schemaReady: true,
              topologyReady: true,
              tableName: 'benchmark_events',
              localReplicaRole: 'voter',
              degradedByOperationIds: [],
              reasons: [],
            },
          }, {
            endpointId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE + '-ep-joiner-1',
            serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
            nodeId: 'joiner-1',
            address: '127.0.0.1',
            port: DEFAULT_DISCOVERY_REPLICA_PORT,
            healthStatus: DEFAULT_DISCOVERY_HEALTH,
            updatedAt: Date.now(),
            metadata: {},
            benchmarkAdmission: {
              state: 'ready',
              routingReady: true,
              schemaReady: true,
              topologyReady: true,
              tableName: 'benchmark_events',
              localReplicaRole: 'voter',
              degradedByOperationIds: [],
              reasons: [],
            },
          }],
        }],
      });

      const buildJoinerLocalSnapshot = (originNodeId) => ({
        schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
        nodeId: originNodeId,
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
          desiredReplicaCount: 1,
          desiredReplicaCountByServiceId: {
            [NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE]: 1,
          },
          observedReplicaCount: 1,
          healthyReplicaCount: 1,
          unhealthyReplicaCount: 0,
          health: DEFAULT_DISCOVERY_HEALTH,
          nodeCount: 1,
          nodes: ['joiner-1'],
          replicas: [{
            endpointId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE + '-ep-joiner-1',
            serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
            nodeId: 'joiner-1',
            address: '127.0.0.1',
            port: DEFAULT_DISCOVERY_REPLICA_PORT,
            healthStatus: DEFAULT_DISCOVERY_HEALTH,
            updatedAt: Date.now(),
            metadata: {},
            readiness: {
              workloadReady: true,
              routingReady: true,
              schemaReady: false,
              topologyReady: false,
              replicaOpsInFlight: 0,
              leadershipStable: false,
              tableName: 'benchmark_events',
              reasons: [{
                code: 'schema_partition_unavailable',
                detail: 'table "benchmark_events" not query-ready on node',
              }, {
                code: 'leadership_unstable',
                detail: 'leader coverage incomplete for readiness scope',
              }],
            },
          }],
        }],
      });

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        queryWithTimeout: async function(sql) {
          const statement = String(sql);
          if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
            statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
            return {
              rows: [buildSeedDiscoverySnapshot(this.id)],
            };
          }
          return this.query(sql);
        },
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            return {rows: [{count: 0}]};
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
          if (statement.includes('FROM replica_operations') &&
            statement.includes('status NOT IN')) {
            return {rows: []};
          }
          return {rows: []};
        },
      };

      const joinerNode = {
        id: 'joiner-1',
        role: 'joiner',
        queryWithTimeout: async function(sql) {
          const statement = String(sql);
          if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
            statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
            return {
              rows: [buildJoinerLocalSnapshot(this.id)],
            };
          }
          return this.query(sql);
        },
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
        getReachabilityDiagnostics: async function() {
          return {
            nodeId: this.id,
            reachable: true,
            adminReady: true,
          };
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
            readyTimeoutMs: 120,
            readyPollIntervalMs: 5,
            quiescentTimeoutMs: 200,
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

      const result = await run(cluster);
      assert.deepEqual(
        loadCalls[0],
        ['seed-1', 'joiner-1'],
        'sut load should admit discovered nodes when load-lane confirmation overrides stale local blockers',
      );
      assert.ok(
        result.details.benchmark.sutLoadDiscovery.reachableNodeIds
          .includes('joiner-1'),
        'diagnostics should report load-lane-confirmed nodes as reachable',
      );
    });

});
