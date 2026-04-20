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
  it('admits discovered nodes when control-lane probes clear stale blockers after load-lane denial',
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
        getReachabilityDiagnostics: async function() {
          return {
            nodeId: this.id,
            reachable: true,
            adminReady: true,
          };
        },
      };

      const joinerNode = {
        id: 'joiner-1',
        role: 'joiner',
        queryWithTimeout: async function(sql, _params = [], options = {}) {
          const statement = String(sql);
          if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
            statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
            return {
              rows: [buildJoinerLocalSnapshot(this.id)],
            };
          }
          if (String(options?.lane || '') === 'load' &&
            (statement === 'SELECT 1' || statement === benchmarkTableProbeSql)) {
            throw new Error(
              'serve not ready: load lane admission denied on node joiner-1',
            );
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
        'sut load should admit nodes when control-lane benchmark probes clear stale local blockers',
      );
      assert.equal(
        result.details.benchmark.sutLoadDiscovery.reachableNodeIds
          .includes('joiner-1'),
        true,
        'diagnostics should keep control-lane-confirmed nodes in the reachable load set',
      );
    });

  it('excludes discovered nodes when canonical benchmark readiness is false',
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

      function buildDiscoverySnapshot(nodeId) {
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
              endpointId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE + '-ep-joiner-1',
              serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
              nodeId: 'joiner-1',
              address: '127.0.0.1',
              port: DEFAULT_DISCOVERY_REPLICA_PORT,
              healthStatus: DEFAULT_DISCOVERY_HEALTH,
              updatedAt: Date.now(),
              metadata: {},
              readiness: {
                workloadReady: false,
                benchmarkReady: false,
                routingReady: true,
                schemaReady: true,
                topologyReady: false,
                replicaOpsInFlight: 2,
                leadershipStable: false,
                tableName: 'benchmark_events',
                reasons: [{
                  code: 'replica_operations_in_flight',
                  detail: '2',
                }, {
                  code: 'leadership_unstable',
                  detail: 'leader coverage incomplete for readiness scope',
                }],
              },
            }],
          }],
        };
      }

      function createNode(nodeId, role) {
        return {
          id: nodeId,
          role,
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
                rows: [buildDiscoverySnapshot(this.id)],
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
        };
      }

      const seedNode = createNode('seed-1', 'seed');
      const joinerNode = createNode('joiner-1', 'joiner');

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
            strictDiscovery: true,
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
        getNodes: () => [seedNode, joinerNode],
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      await assert.rejects(
        run(cluster),
        /insufficient_reachable_nodes.*joiner-1:(?:replica_operations_in_flight=2\|leadership_unstable|leadership_unstable[^|]*\|replica_operations_in_flight=2)/i,
        'strict discovery should fail closed when canonical readiness excludes a required replica',
      );
      assert.equal(
        loadCalls.length,
        0,
        'strict discovery failure should abort before sut load starts',
      );
    });

  it('prefers canonical benchmark admission over optimistic readiness booleans',
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

      function createNode(nodeId, role) {
        return {
          id: nodeId,
          role,
          _discoveryNodeIds: ['seed-1', 'joiner-1'],
          query: async (sql) => {
            const statement = String(sql);
            if (statement === 'SELECT 1') {
              return {rows: [{value: 1}]};
            }
            if (statement.includes('FROM tables')) {
              return {
                rows: [{table_id: 'tbl-benchmark', updated_at: 1740589945123}],
              };
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
          queryWithTimeout: async function(sql, params = [], _options = {}) {
            const statement = String(sql);
            if (statement === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
              return {
                rows: [buildControlSnapshotPayload(this.id)],
              };
            }
            if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
                statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
              const snapshot = buildServiceDiscoverySnapshot(this);
              const joinerReplica = snapshot.services[0].replicas.find((replica) =>
                replica.nodeId === 'joiner-1');
              joinerReplica.readiness = {
                workloadReady: true,
                benchmarkReady: true,
                routingReady: true,
                schemaReady: true,
                topologyReady: true,
                replicaOpsInFlight: 0,
                leadershipStable: true,
                tableName: DEFAULT_DISCOVERY_TABLE_NAME,
                reasons: [],
              };
              joinerReplica.benchmarkAdmission = {
                tableName: DEFAULT_DISCOVERY_TABLE_NAME,
                nodeId: 'joiner-1',
                state: 'blocked',
                routingReady: true,
                schemaReady: true,
                topologyReady: true,
                localReplicaRole: 'follower',
                degradedByOperationIds: [],
                reasons: [{
                  code: 'local_replica_not_voter_ready',
                  detail: 'p1',
                }],
              };
              return {
                rows: [snapshot],
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
        };
      }

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
        getNodes: () => asNodeHandles([
          createNode('seed-1', 'seed'),
          createNode('joiner-1', 'joiner'),
        ]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      assert.deepEqual(
        loadCalls[0],
        ['seed-1'],
        'sut load should exclude nodes blocked by canonical benchmark admission',
      );
      assert.ok(
        result.details.benchmark.sutLoadDiscovery.sourceResults
          .some((sourceResult) =>
            Array.isArray(
              sourceResult.excludedReadinessByNodeId?.['joiner-1'],
            ) &&
            sourceResult.excludedReadinessByNodeId['joiner-1']
              .includes('local_replica_not_voter_ready=p1')),
        'discovery diagnostics should expose canonical benchmark admission reasons',
      );
    });

  it('reports legacy readiness fallback when runtime admission is absent',
    async () => {
      const loadCalls = [];
      const provider = {
        createContainer: async () => ({
          containerId: 'benchmark-postgres-1',
          ip: '172.18.0.80',
          name: 'benchmark-postgres-1',
        }),
        execInContainer: async () => ({
          exitCode: 0,
          stdout: '',
          stderr: '',
        }),
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      function createNode(nodeId, role) {
        return {
          id: nodeId,
          role,
          _discoveryNodeIds: ['seed-1', 'joiner-1'],
          query: async (sql) => {
            const statement = String(sql);
            if (statement === 'SELECT 1') {
              return {rows: [{value: 1}]};
            }
            if (statement === `SELECT count(*) FROM ${DEFAULT_DISCOVERY_TABLE_NAME} WHERE 1 = 0`) {
              return {rows: [{count: 0}]};
            }
            if (statement.includes('FROM tables')) {
              return {
                rows: [{table_id: 'tbl-benchmark', updated_at: 1740589945123}],
              };
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
          queryWithTimeout: async function(sql, params = [], _options = {}) {
            const statement = String(sql);
            if (statement === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
              return {
                rows: [buildControlSnapshotPayload(this.id)],
              };
            }
            if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
                statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
              const snapshot = buildServiceDiscoverySnapshot(this);
              for (const replica of snapshot.services[0].replicas) {
                replica.readiness = {
                  workloadReady: true,
                  benchmarkReady: true,
                  routingReady: true,
                  schemaReady: true,
                  topologyReady: true,
                  replicaOpsInFlight: 0,
                  leadershipStable: true,
                  tableName: DEFAULT_DISCOVERY_TABLE_NAME,
                  reasons: [],
                };
                delete replica.benchmarkAdmission;
              }
              return {
                rows: [snapshot],
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
        };
      }

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
            tableName: DEFAULT_DISCOVERY_TABLE_NAME,
            replicationFactor: 1,
            syncReplicaAcks: 0,
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
        getNodes: () => asNodeHandles([
          createNode('seed-1', 'seed'),
          createNode('joiner-1', 'joiner'),
        ]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      assert.deepEqual(
        loadCalls[0],
        ['seed-1', 'joiner-1'],
        'compatibility fallback still admits nodes when only legacy readiness exists',
      );
      assert.deepEqual(
        result.details.runtimeAdmissionOwnership.selection.legacyFallbackNodeIds,
        ['joiner-1', 'seed-1'],
        'scenario should surface legacy discovery selection fallback nodes',
      );
      assert.deepEqual(
        result.details.runtimeAdmissionOwnership.localReplicaConfirmation.
          legacyFallbackNodeIds,
        ['joiner-1', 'seed-1'],
        'scenario should surface local replica confirmation fallback nodes',
      );
    });

  it('excludes reachable nodes that are not discovered pg replicas', async () => {
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
        if (String(sql) === 'SELECT 1') {
          return {rows: [{value: 1}]};
        }
        return {rows: []};
      },
    };
    const nonReplicaNode = {
      id: 'joiner-2',
      role: 'joiner',
      discoveryNodeIds: ['seed-1', 'joiner-1'],
      query: async (sql) => {
        if (String(sql) === 'SELECT 1') {
          return {rows: [{value: 1}]};
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
      getNodes: () => asNodeHandles([seedNode, joinerNode, nonReplicaNode]),
      waitForConvergence: async () => ({settledAfterMs: 1}),
      assertConsistency: async () => {},
    };

    const result = await run(cluster);
    assert.deepEqual(
      loadCalls[0],
      ['seed-1', 'joiner-1'],
      'sut load should include only discovered postgres replica nodes',
    );
    assert.equal(
      result.details.benchmark.sutEligibleLoadNodeCount,
      2,
      'benchmark details should report eligible nodes from discovery snapshot',
    );
  });

});
