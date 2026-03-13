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
import {QUERY_DEFAULTS} from '../../../../src/query/query-constants.js';


describe('postgres-baseline-comparison scenario', () => {
  it('returns baseline comparison metrics and cleans up benchmark containers', async () => {
    const commandLog = [];
    const providerCalls = [];
    const createdContainers = [];
    const stoppedContainers = [];
    const removedContainers = [];
    const baselineSql = [];
    const baselineLoadCalls = [];
    let loadGeneratorCalls = 0;

    const provider = {
      createContainer: async (options) => {
        providerCalls.push('createContainer');
        createdContainers.push(options);
        const index = createdContainers.length;
        return {
          containerId: `benchmark-postgres-${index}`,
          ip: `172.18.0.${76 + index}`,
          name: `benchmark-postgres-${index}`,
        };
      },
      execInContainer: async (_containerId, cmd) => {
        providerCalls.push('execInContainer');
        const command = String(cmd[2] || '');
        commandLog.push(command);

        if (command.includes('pg_isready')) {
          return {
            exitCode: 0,
            stdout: 'accepting connections',
            stderr: '',
          };
        }
        if (command.includes('pg_stat_replication')) {
          return {
            exitCode: 0,
            stdout: '2\n',
            stderr: '',
          };
        }

        return {
          exitCode: 0,
          stdout: '',
          stderr: '',
        };
      },
      stopContainer: async (containerId) => {
        providerCalls.push('stopContainer');
        stoppedContainers.push(containerId);
      },
      removeContainer: async (containerId) => {
        providerCalls.push('removeContainer');
        removedContainers.push(containerId);
      },
    };

    const cluster = {
      _config: {
        benchmark: {
          baselineImage: 'postgres:16',
          durationSeconds: 10,
          clients: 4,
          jobs: 2,
          loadOpsPerSec: 80,
          loadDuration: '10s',
          loadMaxInFlight: 96,
          tableName: 'benchmark_events',
          replicationFactor: 3,
          syncReplicaAcks: 1,
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
          createLoadGenerator: (nodes, options) => {
            const callIndex = loadGeneratorCalls++;
            baselineLoadCalls.push({nodes, options, callIndex});
            return {
              start: () => ({
                waitComplete: async () => (
                  callIndex === 0 ?
                    {
                      total: 120,
                      success: 118,
                      failed: 0,
                      errors: 0,
                      attemptErrors: 2,
                      opsPerSec: 84,
                      latency: {
                        p50: 3,
                        p95: 7,
                        p99: 15,
                      },
                    } :
                    {
                      total: 118,
                      success: 118,
                      failed: 0,
                      errors: 0,
                      opsPerSec: 100,
                      latency: {
                        avg: 12.5,
                        p50: 6,
                        p95: 11,
                        p99: 14,
                      },
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

    const result = await run(cluster);

    assert.ok(result.loadMetrics, 'scenario should return loadMetrics');
    assert.ok(result.details, 'scenario should return details payload');
    assert.equal(result.details.baseline.engine, 'postgres');
    assert.equal(result.details.baseline.metrics.opsPerSec, 100);
    assert.equal(result.details.comparison.sutOpsPerSec, 84);
    assert.equal(
      result.details.benchmark.sutLoadNodeCount,
      1,
      'scenario should report one queryable SUT load node in single-node cluster',
    );
    assert.equal(
      result.details.comparison.throughputRatioSutToBaseline,
      0.84,
    );
    assert.equal(
      result.details.comparison.p99LatencyRatioSutToBaselineAvg,
      1.2,
    );
    assert.equal(
      result.details.baseline.replicationFactor,
      3,
      'scenario should report replicated baseline factor',
    );
    assert.equal(
      result.details.verification.verdict,
      'consistent',
      'scenario should report verification verdict',
    );
    assert.equal(
      result.details.verification.confidence,
      'high',
      'scenario should report verification confidence',
    );
    assert.equal(
      result.details.policy.insufficientEvidence,
      'soft',
      'scenario should report assertion policy mapping',
    );

    assert.ok(
      commandLog.some((command) => command.includes('pg_isready')),
      'scenario should wait for baseline postgres readiness',
    );
    assert.ok(
      commandLog.some((command) => command.includes('synchronous_standby_names')),
      'scenario should configure synchronous replication on baseline primary',
    );
    assert.ok(
      createdContainers.some((container) =>
        String(container?.command?.[2] || '').includes('pg_basebackup')),
      'scenario should initialize replicas with pg_basebackup bootstrap command',
    );
    assert.ok(
      createdContainers.some((container) =>
        String(container?.command?.[2] || '').includes(
          'export PATH="$PATH:/usr/lib/postgresql/$PG_MAJOR/bin"',
        )),
      'scenario should export postgres binary path before invoking entrypoint',
    );
    assert.ok(
      baselineSql.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS')),
      'scenario should prepare benchmark_events table on baseline',
    );
    assert.ok(
      baselineLoadCalls.length === 2,
      'scenario should run shared load generator for both sut and postgres baseline',
    );
    assert.equal(
      baselineLoadCalls[0]?.options?.tableName,
      'benchmark_events',
      'sut shared load should target benchmark_events table',
    );
    assert.equal(
      baselineLoadCalls[1]?.options?.tableName,
      'benchmark_events',
      'baseline shared load should target benchmark_events table',
    );
    assert.equal(
      baselineLoadCalls[0]?.nodes?.[0]?.id,
      'seed-1',
      'sut load should run through queryable SUT nodes',
    );
    assert.equal(
      createdContainers.length,
      3,
      'scenario should create one primary and two replica benchmark containers',
    );
    assert.ok(
      createdContainers.some((container) =>
        String(container.name || '').includes('-primary')),
      'scenario should name one benchmark primary container',
    );
    assert.ok(
      createdContainers.some((container) =>
        String(container.name || '').includes('-replica-1')),
      'scenario should name the first benchmark replica container',
    );
    assert.ok(
      createdContainers.some((container) =>
        String(container.name || '').includes('-replica-2')),
      'scenario should name the second benchmark replica container',
    );
    assert.equal(
      stoppedContainers.length,
      3,
      'scenario should stop all benchmark containers in teardown',
    );
    assert.equal(
      removedContainers.length,
      3,
      'scenario should remove all benchmark containers in teardown',
    );
  });

  it('retries benchmark table creation after preflight cache repair when provisioning cohort state is transiently stale', async () => {
    const tableProbeSql =
      'SELECT count(*) FROM benchmark_events WHERE 1 = 0';
    let createAttempts = 0;
    let preflightSnapshotCalls = 0;
    let benchmarkTableVisible = false;
    let loadGeneratorCalls = 0;

    const provider = {
      createContainer: async () => ({
        containerId: 'benchmark-postgres-1',
        ip: '172.18.0.80',
        name: 'benchmark-postgres-1',
      }),
      execInContainer: async (_containerId, cmd) => {
        const command = String(cmd[2] || '');
        if (command.includes('pg_isready')) {
          return {
            exitCode: 0,
            stdout: 'accepting connections',
            stderr: '',
          };
        }
        if (command.includes('pg_stat_replication')) {
          return {
            exitCode: 0,
            stdout: '0\n',
            stderr: '',
          };
        }
        return {
          exitCode: 0,
          stdout: '',
          stderr: '',
        };
      },
      stopContainer: async () => {},
      removeContainer: async () => {},
    };

    const seedNode = asNodeHandle({
      id: 'seed-1',
      role: 'seed',
      query: async function(sql) {
        const statement = String(sql);
        if (statement === 'SELECT 1') {
          return {rows: [{value: 1}]};
        }
        if (statement === tableProbeSql) {
          return benchmarkTableVisible ?
            {rows: [{count: 0}]} :
            {rows: []};
        }
        if (statement.includes('FROM replica_operations') &&
            statement.includes('status NOT IN')) {
          return {rows: []};
        }
        if (statement.includes('FROM services')) {
          return benchmarkTableVisible ?
            {
              rows: [{
                partition_id: 'p1',
                node_id: this.id,
                status: 'active',
              }],
            } :
            {rows: []};
        }
        if (statement.includes('FROM tables')) {
          return benchmarkTableVisible ?
            {
              rows: [{
                table_id: 'tbl-benchmark',
                schema_version: '1740589945123',
              }],
            } :
            {rows: []};
        }
        if (statement.startsWith('UPDATE partitions SET table_name')) {
          return {rows: [], changes: 1};
        }
        if (statement.includes('FROM partitions')) {
          return benchmarkTableVisible ?
            {rows: [{partition_id: 'p1'}]} :
            {rows: []};
        }
        return {rows: []};
      },
      queryWithTimeout: async function(sql, params = [], _options = {}) {
        const statement = String(sql);
        if (statement === PREFLIGHT_CRITICAL_PATH_SNAPSHOT_SQL) {
          preflightSnapshotCalls += 1;
          return {
            rows: [buildPreflightCriticalPathSnapshotPayload(this)],
          };
        }
        if (statement === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
          return {
            rows: [buildControlSnapshotPayload(this.id)],
          };
        }
        if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
            statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
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
                    appliedSchemaVersion: '1740589945123',
                  },
                }],
              }],
            }],
          };
        }
        if (statement.startsWith(
          'CREATE TABLE IF NOT EXISTS benchmark_events',
        )) {
          createAttempts += 1;
          if (createAttempts === 1) {
            const error = new Error(
              'Admin API query failed for node seed-1 on lane control: ' +
                'Unable to satisfy minimum routable provisioning cohort ' +
                'for partition tbl-benchmark-p1: required=3, provisionable=2, ' +
                'target=3, rejected=node-b:insufficient_placement_eligible_nodes,' +
                'control_plane_write_unhealthy,cluster_member_unhealthy',
            );
            error.code = 'operation_error';
            throw error;
          }
          benchmarkTableVisible = true;
          return {rows: []};
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
    });

    const cluster = {
      _config: {
        benchmark: {
          baselineImage: 'postgres:16',
          durationSeconds: 1,
          clients: 1,
          jobs: 1,
          loadOpsPerSec: 10,
          loadDuration: '1s',
          loadMaxInFlight: 4,
          loadQueryTimeoutMs: 1000,
          controlQueryTimeoutMs: 1000,
          readyTimeoutMs: 1000,
          readyPollIntervalMs: 25,
          quiescentTimeoutMs: 1000,
          quiescentPollIntervalMs: 25,
          quiescentStableWindowMs: 0,
          tableName: 'benchmark_events',
          replicationFactor: 1,
          syncReplicaAcks: 0,
          strictDiscovery: false,
          strictParity: false,
          strictPreloadReadiness: false,
        },
        convergence: {
          settleTimeoutMs: 1000,
          quietWindowMs: 100,
          targetVoterCount: 1,
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
            loadGeneratorCalls += 1;
            const isBaselineLoad =
              String(nodes?.[0]?.id || '').startsWith(
                'postgres-baseline-load-node-',
              );
            return {
              start: () => ({
                waitComplete: async () => (
                  isBaselineLoad ?
                    {
                      total: 10,
                      success: 10,
                      failed: 0,
                      errors: 0,
                      opsPerSec: 10,
                      latency: {
                        avg: 2,
                        p50: 2,
                        p95: 3,
                        p99: 4,
                      },
                    } :
                    {
                      total: 10,
                      success: 10,
                      failed: 0,
                      errors: 0,
                      opsPerSec: 10,
                      latency: {
                        avg: 2,
                        p50: 2,
                        p95: 3,
                        p99: 4,
                      },
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

    const result = await run(cluster);

    assert.ok(result.loadMetrics, 'scenario should still complete successfully');
    assert.equal(
      createAttempts,
      2,
      'benchmark table create should be retried once after cache repair',
    );
    assert.equal(
      preflightSnapshotCalls,
      1,
      'retry path should force one preflight snapshot repair before retrying',
    );
    assert.ok(
      loadGeneratorCalls >= 2,
      'scenario should proceed through both SUT and baseline load phases',
    );
  });

  it('records required schema version watermark in benchmark details', async () => {
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

    let loadGeneratorCalls = 0;
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
          createLoadGenerator: (_nodes) => {
            const callIndex = loadGeneratorCalls++;
            return {
              start: () => ({
                waitComplete: async () => (
                  callIndex === 0 ?
                    {
                      total: 100,
                      success: 100,
                      failed: 0,
                      errors: 0,
                      opsPerSec: 50,
                      latency: {avg: 4, p50: 3, p95: 6, p99: 7},
                    } :
                    {
                      total: 100,
                      success: 100,
                      failed: 0,
                      errors: 0,
                      opsPerSec: 100,
                      latency: {avg: 1, p50: 1, p95: 2, p99: 2},
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
            return {
              rows: [{
                table_id: 'tbl-benchmark',
                schema_version: '1740589945123:7:seed-1',
                updated_at: 1740589945123,
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
      }]),
      waitForConvergence: async () => ({settledAfterMs: 1}),
      assertConsistency: async () => {},
    };

    const result = await run(cluster);
    assert.equal(
      typeof result.details?.benchmark?.requiredSchemaVersion,
      'string',
      'benchmark details should include required schema/version watermark',
    );
    assert.ok(
      result.details.benchmark.requiredSchemaVersion.length > 0,
      'required schema/version watermark should be non-empty',
    );
  });

  it('fails strict benchmark mode when required schema version watermark is unavailable',
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
        getNodes: () => [{
          id: 'seed-1',
          role: 'seed',
          query: async (sql) => {
            const statement = String(sql);
            if (statement === 'SELECT 1') {
              return {rows: [{value: 1}]};
            }
            if (statement === 'SELECT count(*) FROM benchmark_events WHERE 1 = 0') {
              return {rows: [{count: 0}]};
            }
            if (statement.includes('FROM replica_operations') &&
              statement.includes('status NOT IN')) {
              return {rows: []};
            }
            if (statement.includes('FROM tables')) {
              return {rows: [{}]};
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
        }],
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      await assert.rejects(
        run(cluster),
        /required schema version|required watermark|required_schema_version/i,
      );
      assert.equal(
        loadCalls.length,
        0,
        'strict mode should fail before starting load when watermark is unavailable',
      );
    });

  it('routes benchmark metadata lookups through canonical fallback for non-owner nodes',
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
          if (statement.includes('FROM tables') ||
            statement.includes('FROM partitions')) {
            throw new Error('local system table partition is not available');
          }
          if (statement.startsWith('UPDATE partitions SET table_name')) {
            return {rows: [], changes: 1};
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
            forceLocalSystemTableReadShortcut: true,
            readyTimeoutMs: 120,
            readyPollIntervalMs: 5,
            quiescentTimeoutMs: 120,
            quiescentPollIntervalMs: 5,
            quiescentStableWindowMs: 0,
          },
          nodeClient: {
            channelPolicies: {
              control: {
                circuitBreakerThreshold: 1000,
              },
            },
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
      assert.equal(
        result.details.benchmark.systemTableReadPath.mode,
        'canonical_fallback',
        'benchmark metadata reads should use canonical fallback path',
      );
      assert.deepEqual(
        loadCalls[0],
        ['seed-1', 'joiner-1'],
        'non-owner nodes should still participate in load fanout',
      );
    });

  it('does not fan out mutating benchmark table writes to fallback nodes', async () => {
    const loadCalls = [];
    const seedMutationStatements = [];
    const joinerMutationStatements = [];
    const benchmarkTableProbeSql = 'SELECT count(*) FROM benchmark_events WHERE 1 = 0';
    const benchmarkTableDdlPrefix = 'CREATE TABLE IF NOT EXISTS benchmark_events';
    const benchmarkTablePolicyPrefix = 'UPDATE tables SET table_policies';
    const benchmarkPartitionRepairPrefix = 'UPDATE partitions SET table_name';
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
        if (statement.startsWith(benchmarkTableDdlPrefix)) {
          seedMutationStatements.push(statement);
          throw new Error('query timed out');
        }
        if (statement.startsWith(benchmarkTablePolicyPrefix) ||
          statement.startsWith(benchmarkPartitionRepairPrefix)) {
          seedMutationStatements.push(statement);
          return {rows: [], changes: 1};
        }
        if (statement.includes('FROM tables')) {
          return {rows: [{table_id: 'tbl-benchmark', updated_at: 1740589945123}]};
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
          return {rows: [{count: 0}]};
        }
        if (statement.includes('FROM replica_operations') &&
          statement.includes('status NOT IN')) {
          return {rows: []};
        }
        if (statement.startsWith(benchmarkTableDdlPrefix) ||
          statement.startsWith(benchmarkTablePolicyPrefix) ||
          statement.startsWith(benchmarkPartitionRepairPrefix)) {
          joinerMutationStatements.push(statement);
          return {rows: [], changes: 1};
        }
        if (statement.includes('FROM tables')) {
          return {rows: [{table_id: 'tbl-benchmark', updated_at: 1740589945123}]};
        }
        if (statement.includes('FROM partitions')) {
          return {rows: [{partition_id: 'p1'}]};
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
          forceLocalSystemTableReadShortcut: true,
          readyTimeoutMs: 120,
          readyPollIntervalMs: 5,
          quiescentTimeoutMs: 120,
          quiescentPollIntervalMs: 5,
          quiescentStableWindowMs: 0,
        },
        nodeClient: {
          channelPolicies: {
            control: {
              circuitBreakerThreshold: 1000,
            },
          },
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
            return {
              start: () => ({
                waitComplete: async () => ({
                  total: 100,
                  success: 100,
                  failed: 0,
                  errors: 0,
                  opsPerSec: 100,
                  latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                }),
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

    await assert.rejects(run(cluster), /timed out|timeout/i);
    assert.ok(
      seedMutationStatements.some((statement) =>
        statement.startsWith(benchmarkTableDdlPrefix)),
      'canonical node should receive benchmark table create mutation',
    );
    assert.equal(
      joinerMutationStatements.length,
      0,
      'mutating benchmark table writes should not fan out to fallback nodes',
    );
    assert.equal(
      loadCalls.length,
      0,
      'failed mutating write should fail pre-load before load generation starts',
    );
  });

  it('uses an explicit create-table timeout budget above the provisioning timeout',
    async () => {
      const ddlTimeouts = [];
      const benchmarkTableProbeSql =
        'SELECT count(*) FROM benchmark_events WHERE 1 = 0';
      const benchmarkTableDdlPrefix =
        'CREATE TABLE IF NOT EXISTS benchmark_events';
      const benchmarkTablePolicyPrefix = 'UPDATE tables SET table_policies';
      const benchmarkPartitionRepairPrefix = 'UPDATE partitions SET table_name';
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
          if (statement.startsWith(benchmarkTableDdlPrefix) ||
            statement.startsWith(benchmarkTablePolicyPrefix) ||
            statement.startsWith(benchmarkPartitionRepairPrefix)) {
            return {rows: [], changes: 1};
          }
          if (statement.includes('FROM tables')) {
            return {rows: [{table_id: 'tbl-benchmark', updated_at: 1740589945123}]};
          }
          if (statement.includes('FROM partitions')) {
            return {rows: [{partition_id: 'p1'}]};
          }
          return {rows: []};
        },
        queryWithTimeout: async function(sql, params = [], options = {}) {
          const statement = String(sql);
          if (statement.startsWith(benchmarkTableDdlPrefix)) {
            ddlTimeouts.push({
              lane: options.lane,
              timeoutMs: options.timeoutMs,
            });
          }
          return this.query(statement, params);
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
            controlQueryTimeoutMs: 15000,
            replicationFactor: 1,
            syncReplicaAcks: 0,
            forceLocalSystemTableReadShortcut: true,
            readyTimeoutMs: 120,
            readyPollIntervalMs: 5,
            quiescentTimeoutMs: 120,
            quiescentPollIntervalMs: 5,
            quiescentStableWindowMs: 0,
          },
          nodeClient: {
            channelPolicies: {
              control: {
                circuitBreakerThreshold: 1000,
              },
            },
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
            createLoadGenerator: () => ({
              start: () => ({
                waitComplete: async () => ({
                  total: 100,
                  success: 100,
                  failed: 0,
                  errors: 0,
                  opsPerSec: 100,
                  latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                }),
              }),
            }),
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([seedNode]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      await run(cluster);

      assert.deepEqual(ddlTimeouts, [{
        lane: 'control',
        timeoutMs: QUERY_DEFAULTS.TABLE_CREATE_PROVISION_TIMEOUT_MS + 5000,
      }]);
    });

  it('resolveBenchmarkConfig merges defaults with explicit overrides', () => {
    const cluster = {
      _config: {
        benchmark: {
          baselineImage: 'postgres:15',
          clients: 16,
          jobs: 8,
          loadDuration: '45s',
          loadMaxInFlight: 240,
          controlQueryTimeoutMs: 12000,
          replicationFactor: 5,
          syncReplicaAcks: 2,
          cacheBaselineMetrics: false,
          refreshBaselineMetrics: true,
          baselineCacheTtlMs: 60000,
        },
      },
    };

    const resolved = resolveBenchmarkConfig(cluster);

    assert.equal(resolved.baselineImage, 'postgres:15');
    assert.equal(resolved.clients, 16);
    assert.equal(resolved.jobs, 8);
    assert.equal(resolved.loadDuration, '45s');
    assert.equal(resolved.loadMaxInFlight, 240);
    assert.equal(resolved.controlQueryTimeoutMs, 12000);
    assert.equal(resolved.baselineLoadNodeCount, 16);
    assert.equal(resolved.replicationFactor, 5);
    assert.equal(resolved.syncReplicaAcks, 2);
    assert.equal(resolved.cacheBaselineMetrics, false);
    assert.equal(resolved.refreshBaselineMetrics, true);
    assert.equal(resolved.baselineCacheTtlMs, 60000);
    assert.equal(typeof resolved.durationSeconds, 'number');
    assert.equal(typeof resolved.user, 'string');
    assert.equal(Object.isFrozen(resolved), true);
  });

  it('emits load parity contract with configured and effective sections',
    async () => {
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
            return {exitCode: 0, stdout: '2\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 10,
            clients: 4,
            jobs: 2,
            loadOpsPerSec: 80,
            loadDuration: '10s',
            loadMaxInFlight: 96,
            loadNodeMaxInFlight: 2,
            tableName: 'benchmark_events',
            replicationFactor: 3,
            syncReplicaAcks: 1,
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
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
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
          queryWithTimeout: async function(sql) {
            const statement = String(sql);
            if (statement === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
              return {
                rows: [buildControlSnapshotPayload('seed-1', {
                  cdcTelemetry: {
                    subscriberCount: 2,
                    bufferedEvents: 0,
                    catchupLagEvents: 0,
                    authoritativeFallback: {
                      schemaVersion: 1,
                      nodeId: 'seed-1',
                      windowMs: 60000,
                      totalCount: 4,
                      windowCount: 2,
                      windowRatePerMinute: 2,
                      phases: {
                        bootstrap: {windowCount: 0, totalCount: 0},
                        recovery: {windowCount: 1, totalCount: 2},
                        steady_state: {windowCount: 1, totalCount: 2},
                      },
                    },
                  },
                })],
              };
            }
            return this.query(sql);
          },
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

      const result = await run(cluster);
      assert.ok(
        result.details.parity,
        'scenario should emit parity contract in details',
      );
      assert.equal(
        typeof result.details.parity.configured,
        'object',
        'parity contract should include configured section',
      );
      assert.equal(
        typeof result.details.parity.effective,
        'object',
        'parity contract should include effective section',
      );
    });

  it('fails when strict parity mode detects sut/baseline parity mismatch',
    async () => {
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
            return {exitCode: 0, stdout: '2\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 5,
            clients: 8,
            jobs: 2,
            loadOpsPerSec: 40,
            loadDuration: '5s',
            loadMaxInFlight: 64,
            tableName: 'benchmark_events',
            replicationFactor: 3,
            syncReplicaAcks: 1,
            strictParity: true,
            failOnLoadParityMismatch: false,
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
        getNodes: () => asNodeHandles([{
          id: 'seed-1',
          role: 'seed',
          queryWithTimeout: async function(sql) {
            const statement = String(sql);
            if (statement === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
              return {
                rows: [buildControlSnapshotPayload('seed-1', {
                  cdcTelemetry: {
                    subscriberCount: 2,
                    bufferedEvents: 0,
                    catchupLagEvents: 0,
                    authoritativeFallback: {
                      schemaVersion: 1,
                      nodeId: 'seed-1',
                      windowMs: 60000,
                      totalCount: 4,
                      windowCount: 2,
                      windowRatePerMinute: 2,
                      phases: {
                        bootstrap: {windowCount: 0, totalCount: 0},
                        recovery: {windowCount: 1, totalCount: 2},
                        steady_state: {windowCount: 1, totalCount: 2},
                      },
                    },
                  },
                })],
              };
            }
            return this.query(sql);
          },
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

      await assert.rejects(
        run(cluster),
        /strict_parity_mismatch/i,
      );
    });

  it('fails when internal signal thresholds are breached', async () => {
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
          return {exitCode: 0, stdout: '2\n', stderr: ''};
        }
        return {exitCode: 0, stdout: '', stderr: ''};
      },
      stopContainer: async () => {},
      removeContainer: async () => {},
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
          loadNodeMaxInFlight: 2,
          tableName: 'benchmark_events',
          replicationFactor: 1,
          syncReplicaAcks: 0,
          internalSignalThresholds: {
            failOnThresholdBreach: true,
            errorsByClass: {
              operation_failed: 1,
            },
            warningsByClass: {
              critical_rebalancing_state: 1,
            },
          },
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
                      attemptErrors: 0,
                      opsPerSec: 50,
                      latency: {avg: 4, p50: 3, p95: 6, p99: 7},
                      distinctErrors: ['Operation failed', 'Operation failed'],
                    }
                ),
              }),
            };
          },
          getInternalSignalMessages: () => ([
            'Critical rebalancing state detected',
            'Critical rebalancing state detected',
          ]),
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

    await assert.rejects(
      run(cluster),
      /internal_signal_threshold_breach/i,
    );
  });

  it('emits cdc telemetry fields for subscriber count, buffered events, and lag',
    async () => {
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
            return {exitCode: 0, stdout: '2\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
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
            getCdcTelemetryByNode: () => ({
              'seed-1': {
                subscriberCount: 2,
                bufferedEvents: 0,
                catchupLagEvents: 0,
              },
            }),
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([{
          id: 'seed-1',
          role: 'seed',
          queryWithTimeout: async function(sql) {
            const statement = String(sql);
            if (statement === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
              return {
                rows: [buildControlSnapshotPayload('seed-1', {
                  cdcTelemetry: {
                    subscriberCount: 2,
                    bufferedEvents: 0,
                    catchupLagEvents: 0,
                    authoritativeFallback: {
                      schemaVersion: 1,
                      nodeId: 'seed-1',
                      windowMs: 60000,
                      totalCount: 4,
                      windowCount: 2,
                      windowRatePerMinute: 2,
                      phases: {
                        bootstrap: {windowCount: 0, totalCount: 0},
                        recovery: {windowCount: 1, totalCount: 2},
                        steady_state: {windowCount: 1, totalCount: 2},
                      },
                    },
                  },
                })],
              };
            }
            return this.query(sql);
          },
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

      const result = await run(cluster);
      const cdcTelemetry = result?.details?.benchmark?.cdcTelemetry;
      assert.ok(cdcTelemetry, 'benchmark details should include cdc telemetry');
      assert.equal(typeof cdcTelemetry.summary.totalSubscriberCount, 'number');
      assert.equal(typeof cdcTelemetry.summary.totalBufferedEvents, 'number');
      assert.equal(typeof cdcTelemetry.summary.maxCatchupLagEvents, 'number');
    });

  it('summarizes authoritative fallback telemetry in benchmark details',
    async () => {
      const provider = {
        createContainer: async () => ({
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
            return {exitCode: 0, stdout: '2\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
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
        },
        _scenarioOverrides: {
          postgresBaselineComparison: {
            createPostgresPool: () => ({
              query: async () => ({rows: []}),
              end: async () => {},
            }),
            createLoadGenerator: (nodes) => {
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
            getCdcTelemetryByNode: () => ({
              'seed-1': {
                subscriberCount: 2,
                bufferedEvents: 0,
                catchupLagEvents: 0,
                authoritativeFallback: {
                  schemaVersion: 1,
                  nodeId: 'seed-1',
                  windowMs: 60000,
                  totalCount: 4,
                  windowCount: 2,
                  windowRatePerMinute: 2,
                  phases: {
                    bootstrap: {windowCount: 0, totalCount: 0},
                    recovery: {windowCount: 1, totalCount: 2},
                    steady_state: {windowCount: 1, totalCount: 2},
                  },
                },
              },
            }),
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

      const result = await run(cluster);
      const authoritativeFallback =
        result?.details?.benchmark?.cdcTelemetry?.summary?.authoritativeFallback;

      assert.ok(authoritativeFallback,
        'benchmark details should include authoritative fallback summary');
      assert.equal(authoritativeFallback.totalCount, 4);
      assert.equal(authoritativeFallback.windowCount, 2);
      assert.equal(authoritativeFallback.steadyStateWindowCount, 1);
    });

  it('fails strict report schema check when cdc telemetry fields are missing',
    async () => {
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
            return {exitCode: 0, stdout: '2\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
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
            strictCdcTelemetrySchema: true,
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
            getCdcTelemetryByNode: () => ({
              'seed-1': {
                subscriberCount: 2,
                bufferedEvents: 0,
              },
            }),
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

      await assert.rejects(
        run(cluster),
        /cdc_telemetry_schema_missing/i,
      );
    });

  it('uses shared discovery snapshots during load admission and keeps route-safe nodes admitted',
    async () => {
      let loadWindowOpen = false;
      const loadWindowDiscoveryCallsByNodeId = {
        'seed-1': 0,
        'joiner-1': 0,
      };
      const requiredSchemaVersion = '1740589945123:7:seed-1';
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

      function buildReplicaReadiness(nodeId) {
        const readyReadiness = {
          workloadReady: true,
          benchmarkReady: true,
          routingReady: true,
          schemaReady: true,
          topologyReady: true,
          replicaOpsInFlight: 2,
          leadershipStable: true,
          tableName: DEFAULT_DISCOVERY_TABLE_NAME,
          appliedSchemaVersion: requiredSchemaVersion,
          reasons: [],
        };
        if (!loadWindowOpen || nodeId !== 'joiner-1') {
          return readyReadiness;
        }
        return {
          ...readyReadiness,
          topologyReady: false,
          reasons: [{
            code: 'local_replica_not_voter_ready',
            detail: 'p1',
          }],
        };
      }

      function buildReplicaBenchmarkAdmission(nodeId) {
        const readyAdmission = {
          tableName: DEFAULT_DISCOVERY_TABLE_NAME,
          nodeId,
          state: 'ready',
          routingReady: true,
          schemaReady: true,
          topologyReady: true,
          localReplicaRole: 'voter',
          degradedByOperationIds: [],
          reasons: [],
        };
        if (!loadWindowOpen || nodeId !== 'joiner-1') {
          return readyAdmission;
        }
        return {
          ...readyAdmission,
          state: 'blocked',
          topologyReady: false,
          localReplicaRole: 'candidate',
          reasons: [{
            code: 'local_replica_not_voter_ready',
            detail: 'p1',
          }],
        };
      }

      function buildDiscoverySnapshot(sourceNodeId) {
        const capturedAt = Date.now();
        const replicas = ['seed-1', 'joiner-1'].map((nodeId) => ({
          endpointId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE + '-ep-' + nodeId,
          serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
          nodeId,
          address: '127.0.0.1',
          port: DEFAULT_DISCOVERY_REPLICA_PORT,
          healthStatus: DEFAULT_DISCOVERY_HEALTH,
          updatedAt: capturedAt,
          metadata: {},
          readiness: buildReplicaReadiness(nodeId),
          benchmarkAdmission: buildReplicaBenchmarkAdmission(nodeId),
        }));
        return {
          schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
          nodeId: sourceNodeId,
          capturedAt,
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
            desiredReplicaCount: replicas.length,
            desiredReplicaCountByServiceId: {
              [NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE]: replicas.length,
            },
            observedReplicaCount: replicas.length,
            healthyReplicaCount: replicas.length,
            unhealthyReplicaCount: 0,
            health: DEFAULT_DISCOVERY_HEALTH,
            nodeCount: replicas.length,
            nodes: replicas.map((replica) => replica.nodeId),
            replicas,
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
            if (statement ===
              `SELECT count(*) FROM ${DEFAULT_DISCOVERY_TABLE_NAME} WHERE 1 = 0`) {
              return {rows: [{count: 0}]};
            }
            if (statement.includes('FROM tables')) {
              return {
                rows: [{
                  table_id: 'tbl-benchmark',
                  schema_version: requiredSchemaVersion,
                  updated_at: 1740589945123,
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
            if (statement === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
              return {
                rows: [buildControlSnapshotPayload(this.id, {
                  leaders: {p1: 'seed-1'},
                  replicaOperations: {
                    inFlightCount: 0,
                    statusHistogram: {},
                  },
                })],
              };
            }
            if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
                statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
              if (loadWindowOpen === true) {
                loadWindowDiscoveryCallsByNodeId[this.id] += 1;
              }
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
            strictDiscovery: true,
            requiredSutLoadNodeCount: 2,
            loadRebalanceMonitorPollIntervalMs: 5,
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
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
              if (isBaselineLoad) {
                return {
                  start: () => ({
                    waitComplete: async () => ({
                      total: 100,
                      success: 100,
                      failed: 0,
                      errors: 0,
                      opsPerSec: 100,
                      latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                    }),
                  }),
                };
              }
              return {
                start: () => {
                  loadWindowOpen = true;
                  return {
                    waitComplete: async () => new Promise((resolve) => {
                      setTimeout(() => {
                        resolve({
                          total: 100,
                          success: 100,
                          failed: 0,
                          errors: 0,
                          opsPerSec: 50,
                          latency: {avg: 4, p50: 3, p95: 6, p99: 7},
                        });
                      }, 35);
                    }),
                  };
                },
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
      const loadRoutingAdmission =
        result.details.benchmark.rebalancingPressure.load.routingAdmission;
      assert.ok(
        loadRoutingAdmission.sampleCount > 0,
        'monitor should emit routing-admission samples during load window',
      );
      assert.equal(
        loadRoutingAdmission.stateByNodeId['joiner-1'].ready,
        true,
        'route-safe node should stay admitted despite local topology-only blockers',
      );
      assert.equal(
        loadRoutingAdmission.blockedSampleCount,
        0,
        'topology-only benchmark admission blockers should not block load routing',
      );
      assert.equal(
        loadWindowDiscoveryCallsByNodeId['joiner-1'],
        0,
        'monitor should reuse one shared service-discovery snapshot per poll',
      );
      assert.ok(
        loadWindowDiscoveryCallsByNodeId['seed-1'] > 0,
        'monitor should still query one discovery source during load',
      );
    });

  it('fails when load-phase rebalancing thrash breaches benchmark pinning policy',
    async () => {
      let loadWindowOpen = false;
      let loadCancelled = false;
      let loadSnapshotCount = 0;
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
            return {exitCode: 0, stdout: '2\n', stderr: ''};
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
          if (String(sql) === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
            if (!loadWindowOpen) {
              return {
                rows: [buildControlSnapshotPayload(this.id, {
                  leaders: {p1: 'seed-1'},
                  replicaOperations: {
                    inFlightCount: 0,
                    statusHistogram: {},
                  },
                })],
              };
            }
            loadSnapshotCount++;
            const leaderNodeId = loadSnapshotCount % 2 === 0 ? 'seed-1' : 'join-2';
            return {
              rows: [buildControlSnapshotPayload(this.id, {
                leaders: {p1: leaderNodeId},
                replicaOperations: {
                  inFlightCount: 2,
                  statusHistogram: {creating: 2},
                },
              })],
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
            pinRebalancingDuringLoad: true,
            rebalanceHysteresisCooldownMs: 20,
            rebalanceHysteresisMinDelta: 2,
            loadRebalanceMonitorPollIntervalMs: 5,
            loadRebalanceMaxReplicaOpsInFlight: 0,
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
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
              if (isBaselineLoad) {
                return {
                  start: () => ({
                    waitComplete: async () => ({
                      total: 100,
                      success: 100,
                      failed: 0,
                      errors: 0,
                      opsPerSec: 100,
                      latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                    }),
                  }),
                };
              }
              return {
                start: () => {
                  loadWindowOpen = true;
                  let resolveRun;
                  const runPromise = new Promise((resolve) => {
                    resolveRun = resolve;
                  });
                  const timeoutId = setTimeout(() => {
                    resolveRun({
                      total: 100,
                      success: 100,
                      failed: 0,
                      errors: 0,
                      opsPerSec: 50,
                      latency: {avg: 4, p50: 3, p95: 6, p99: 7},
                    });
                  }, 50);
                  return {
                    waitComplete: async () => runPromise,
                    cancel: () => {
                      loadCancelled = true;
                      clearTimeout(timeoutId);
                      resolveRun({
                        total: 20,
                        success: 20,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 20,
                        latency: {avg: 5, p50: 4, p95: 7, p99: 8},
                      });
                    },
                  };
                },
              };
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([seedNode]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      await assert.rejects(
        run(cluster),
        /rebalancing_window_pinning_violation/i,
      );
      assert.equal(
        loadCancelled,
        true,
        'load run should be cancelled when pinning policy is violated',
      );
    });

  it('fails the load phase when node heartbeats stop advancing during the benchmark window',
    async () => {
      let loadWindowOpen = false;
      let loadSnapshotCount = 0;
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
            return {exitCode: 0, stdout: '2\n', stderr: ''};
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
          if (String(sql) === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
            loadSnapshotCount++;
            const heartbeatAgeMs = loadWindowOpen ?
              25 + (loadSnapshotCount * 5) :
              5;
            return {
              rows: [buildControlSnapshotPayload(this.id, {
                leaders: {p1: 'seed-1'},
                replicaOperations: {
                  inFlightCount: 0,
                  statusHistogram: {},
                },
                controlPlaneDiagnostics: {
                  nodeLivenessByNodeId: {
                    'seed-1': {
                      lastHeartbeat: 1000,
                      heartbeatAgeMs,
                      readyLeaseExpiresAt: 1200,
                      readyLeaseAgeMs: heartbeatAgeMs - 5,
                    },
                  },
                },
              })],
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
            loadRebalanceMonitorPollIntervalMs: 5,
            heartbeatFreshnessMaxStallMs: 20,
            heartbeatFreshnessMinSamples: 2,
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
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
              if (isBaselineLoad) {
                return {
                  start: () => ({
                    waitComplete: async () => ({
                      total: 100,
                      success: 100,
                      failed: 0,
                      errors: 0,
                      opsPerSec: 100,
                      latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                    }),
                  }),
                };
              }
              return {
                start: () => {
                  loadWindowOpen = true;
                  return {
                    waitComplete: async () => new Promise((resolve) => {
                      setTimeout(() => {
                        resolve({
                          total: 100,
                          success: 100,
                          failed: 0,
                          errors: 0,
                          opsPerSec: 50,
                          latency: {avg: 4, p50: 3, p95: 6, p99: 7},
                        });
                      }, 50);
                    }),
                  };
                },
              };
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([seedNode]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      await assert.rejects(
        run(cluster),
        /heartbeat_freshness_invariant_failed/i,
      );
      assert.ok(
        loadSnapshotCount >= 2,
        'load monitor should observe multiple stale-heartbeat samples before failing',
      );
    });

  it('skips baseline execution when system-under-test load already has hard operation failures',
    async () => {
      let baselineContainerCreates = 0;
      let baselineLoadCalls = 0;
      const provider = {
        createContainer: async (_options) => {
          baselineContainerCreates++;
          return {
            containerId: 'benchmark-postgres-1',
            ip: '172.18.0.80',
            name: 'benchmark-postgres-1',
          };
        },
        execInContainer: async (_containerId, _cmd) => ({
          exitCode: 0,
          stdout: '',
          stderr: '',
        }),
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      const seedNode = {
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
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
              if (isBaselineLoad) {
                baselineLoadCalls++;
              }
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
                        success: 99,
                        failed: 1,
                        errors: 1,
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
        getNodes: () => asNodeHandles([seedNode]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      await assert.rejects(
        run(cluster),
        (error) => {
          assert.match(
            String(error?.message || ''),
            /load run completed with failed operations/i,
          );
          assert.equal(
            error?.diagnostics?.failedPhase?.phase,
            'load',
            'hard load failures should fail the load phase before baseline work',
          );
          return true;
        },
      );
      assert.equal(
        baselineContainerCreates,
        0,
        'baseline containers should not be created after deterministic SUT load failure',
      );
      assert.equal(
        baselineLoadCalls,
        0,
        'baseline load should not start after deterministic SUT load failure',
      );
    });

  it('emits periodic system-under-test and baseline load heartbeats to the phase event sink',
    async () => {
      const sinkEvents = [];
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

      const createHeartbeatRun = (metrics) => ({
        start: () => {
          let snapshotCount = 0;
          return {
            waitComplete: async () => new Promise((resolve) => {
              setTimeout(() => resolve(metrics), 30);
            }),
            getMetrics: () => {
              snapshotCount += 1;
              return {
                ...metrics,
                total: snapshotCount * 5,
                success: snapshotCount * 5,
                failed: 0,
                errors: 0,
                attemptErrors: 0,
                dispatchedOperations: snapshotCount * 5,
                targetOperations: 30,
                undispatchedOperations: Math.max(0, 30 - (snapshotCount * 5)),
              };
            },
          };
        },
      });

      const seedNode = {
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
      };

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 5,
            clients: 1,
            jobs: 1,
            loadOpsPerSec: 30,
            loadDuration: '5s',
            loadMaxInFlight: 16,
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
            progressHeartbeatIntervalMs: 5,
            phaseEventSink: (event) => {
              sinkEvents.push({...event});
            },
            createPostgresPool: () => ({
              query: async () => ({rows: []}),
              end: async () => {},
            }),
            createLoadGenerator: (nodes) => {
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
              return createHeartbeatRun({
                total: 30,
                success: 30,
                failed: 0,
                errors: 0,
                attemptErrors: 0,
                opsPerSec: isBaselineLoad ? 60 : 45,
                latency: {avg: 2, p50: 2, p95: 4, p99: 5},
              });
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([seedNode]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      await run(cluster);

      const progressMessages = sinkEvents
        .filter((event) => event.type === 'phase.progress')
        .map((event) => String(event.message || ''));
      assert.ok(
        progressMessages.includes('system-under-test load heartbeat'),
        'phase sink should receive system-under-test load heartbeats',
      );
      assert.ok(
        progressMessages.includes('baseline load heartbeat'),
        'phase sink should receive baseline load heartbeats',
      );
    });

  it('allows fault-injection override to bypass load pinning protection',
    async () => {
      let loadWindowOpen = false;
      let loadSnapshotCount = 0;
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
            return {exitCode: 0, stdout: '2\n', stderr: ''};
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
          if (String(sql) === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
            if (!loadWindowOpen) {
              return {
                rows: [buildControlSnapshotPayload(this.id, {
                  leaders: {p1: 'seed-1'},
                  replicaOperations: {
                    inFlightCount: 0,
                    statusHistogram: {},
                  },
                })],
              };
            }
            loadSnapshotCount++;
            const leaderNodeId = loadSnapshotCount % 2 === 0 ? 'seed-1' : 'join-2';
            return {
              rows: [buildControlSnapshotPayload(this.id, {
                leaders: {p1: leaderNodeId},
                replicaOperations: {
                  inFlightCount: 2,
                  statusHistogram: {creating: 2},
                },
              })],
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
            pinRebalancingDuringLoad: true,
            allowLoadRebalancePinningBypass: true,
            rebalanceHysteresisCooldownMs: 20,
            rebalanceHysteresisMinDelta: 2,
            loadRebalanceMonitorPollIntervalMs: 5,
            loadRebalanceMaxReplicaOpsInFlight: 0,
            postLoadDrainTimeoutMs: 120,
            postLoadDrainPollIntervalMs: 5,
            postLoadDrainStableWindowMs: 0,
            postLoadDrainNoProgressTimeoutMs: 40,
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
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
              return {
                start: () => {
                  if (!isBaselineLoad) {
                    loadWindowOpen = true;
                  }
                  return {
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
                  };
                },
              };
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([seedNode]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      assert.equal(
        result.details.benchmark.rebalancingPressure.load.pinning.bypassed,
        true,
      );
    });

  it('fails strict benchmark mode on sustained critical rebalancing while bypassed',
    async () => {
      let loadWindowOpen = false;
      let loadSnapshotCount = 0;
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
            return {exitCode: 0, stdout: '2\n', stderr: ''};
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
          if (String(sql) === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
            if (!loadWindowOpen) {
              return {
                rows: [buildControlSnapshotPayload(this.id, {
                  leaders: {p1: 'seed-1'},
                  replicaOperations: {
                    inFlightCount: 0,
                    statusHistogram: {},
                  },
                })],
              };
            }
            loadSnapshotCount++;
            const leaderNodeId = loadSnapshotCount % 2 === 0 ? 'seed-1' : 'join-2';
            return {
              rows: [buildControlSnapshotPayload(this.id, {
                leaders: {p1: leaderNodeId},
                replicaOperations: {
                  inFlightCount: 2,
                  statusHistogram: {creating: 2},
                },
              })],
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
            strictDiscovery: true,
            requiredSutLoadNodeCount: 1,
            pinRebalancingDuringLoad: true,
            allowLoadRebalancePinningBypass: true,
            rebalanceHysteresisCooldownMs: 20,
            rebalanceHysteresisMinDelta: 2,
            loadRebalanceMonitorPollIntervalMs: 5,
            loadRebalanceMaxReplicaOpsInFlight: 0,
            postLoadDrainTimeoutMs: 120,
            postLoadDrainPollIntervalMs: 5,
            postLoadDrainStableWindowMs: 0,
            postLoadDrainNoProgressTimeoutMs: 40,
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
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
              return {
                start: () => {
                  if (!isBaselineLoad) {
                    loadWindowOpen = true;
                  }
                  return {
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
                        new Promise((resolve) => {
                          setTimeout(() => {
                            resolve({
                              total: 100,
                              success: 100,
                              failed: 0,
                              errors: 0,
                              opsPerSec: 50,
                              latency: {avg: 4, p50: 3, p95: 6, p99: 7},
                            });
                          }, 40);
                        })
                    ),
                  };
                },
              };
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([seedNode]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const timing = installVirtualScenarioTiming(cluster);
      await assert.rejects(scenarioRun(cluster), (error) => {
        assert.match(
          String(error?.message || error),
          /internal_signal_threshold_breach.*critical_rebalancing_state/i,
        );
        const reasonCounts = error?.diagnostics?.failure?.reasonCounts || {};
        const reasonKeys = Object.keys(reasonCounts);
        assert.ok(
          reasonKeys.some((reason) =>
            /internal_signal_threshold_breach.*critical_rebalancing_state/i.test(
              reason,
            )),
          'failure artifact should include threshold reason count for critical rebalancing',
        );
        return true;
      });
      assert.ok(
        timing.getSleepCalls().length > 0,
        'critical rebalancing failure path should use virtual poll sleeps instead of wall-clock waiting',
      );
    });

  it('fails strict overload policy when queue and reject contracts are violated',
    async () => {
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
            strictOverloadPolicy: true,
            overloadPolicy: {
              maxRejectedOperations: 0,
              maxQueueDelayP99Ms: 5,
            },
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
                        rejectedOperations: 5,
                        rejectedByReason: {
                          queueFull: 5,
                        },
                        queueDelay: {
                          avg: 20,
                          p50: 10,
                          p95: 90,
                          p99: 120,
                          max: 140,
                        },
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

      await assert.rejects(
        run(cluster),
        /overload_policy_violation/i,
      );
    });

  it('fails strict write-pressure threshold with dedicated reason code',
    async () => {
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
            strictWritePressure: true,
            writePressureThresholds: {
              maxAttemptedWrites: 10,
            },
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
                        controlPlaneWrites: {
                          attempted: 50,
                          coalesced: 0,
                          unchangedSkipped: 0,
                          failed: 0,
                          timeouts: 0,
                        },
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

      await assert.rejects(
        run(cluster),
        /write_pressure_threshold_exceeded/i,
      );
    });

  it('records write-pressure threshold breaches in non-strict mode without hard fail',
    async () => {
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
            strictWritePressure: false,
            writePressureThresholds: {
              maxAttemptedWrites: 10,
            },
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
                        controlPlaneWrites: {
                          attempted: 50,
                          coalesced: 0,
                          unchangedSkipped: 0,
                          failed: 0,
                          timeouts: 0,
                        },
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

      const result = await run(cluster);
      assert.equal(
        result.details.benchmark.writePressure.breached,
        true,
        'non-strict run should still record write-pressure breach',
      );
      assert.equal(
        result.details.benchmark.writePressure.strictWritePressure,
        false,
        'non-strict run should not hard-fail on write-pressure breach',
      );
    });

  it('fails strict authoritative fallback policy on sustained steady-state fallback',
    async () => {
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
            strictAuthoritativeFallback: true,
            authoritativeFallbackThresholds: {
              maxSteadyStateWindowCount: 1,
            },
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
            getCdcTelemetryByNode: () => ({
              'seed-1': {
                subscriberCount: 2,
                bufferedEvents: 0,
                catchupLagEvents: 0,
                authoritativeFallback: {
                  schemaVersion: 1,
                  nodeId: 'seed-1',
                  windowMs: 60000,
                  totalCount: 4,
                  windowCount: 2,
                  windowRatePerMinute: 2,
                  phases: {
                    bootstrap: {windowCount: 0, totalCount: 0},
                    recovery: {windowCount: 1, totalCount: 2},
                    steady_state: {windowCount: 2, totalCount: 2},
                  },
                },
              },
            }),
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

      await assert.rejects(
        run(cluster),
        /authoritative_fallback_threshold_exceeded/i,
      );
    });

  it('records authoritative fallback breaches in non-strict mode without hard fail',
    async () => {
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
            strictAuthoritativeFallback: false,
            authoritativeFallbackThresholds: {
              maxSteadyStateWindowCount: 1,
            },
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
            getCdcTelemetryByNode: () => ({
              'seed-1': {
                subscriberCount: 2,
                bufferedEvents: 0,
                catchupLagEvents: 0,
                authoritativeFallback: {
                  schemaVersion: 1,
                  nodeId: 'seed-1',
                  windowMs: 60000,
                  totalCount: 4,
                  windowCount: 2,
                  windowRatePerMinute: 2,
                  phases: {
                    bootstrap: {windowCount: 0, totalCount: 0},
                    recovery: {windowCount: 0, totalCount: 0},
                    steady_state: {windowCount: 2, totalCount: 4},
                  },
                },
              },
            }),
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

      const result = await run(cluster);
      assert.equal(
        result.details.benchmark.authoritativeFallbackResult.breached,
        true,
        'non-strict run should still record authoritative fallback breach',
      );
      assert.equal(
        result.details.benchmark.authoritativeFallbackResult.strictAuthoritativeFallback,
        false,
        'non-strict run should not hard-fail on authoritative fallback breach',
      );
      assert.equal(
        result.details.benchmark.authoritativeFallbackResult.observed.steadyStateWindowCount,
        2,
      );
    });

  it('emits mismatch reason codes for fanout and budget parity gaps',
    async () => {
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
            return {exitCode: 0, stdout: '2\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 10,
            clients: 4,
            jobs: 2,
            loadOpsPerSec: 80,
            loadDuration: '10s',
            loadMaxInFlight: 96,
            tableName: 'benchmark_events',
            replicationFactor: 3,
            syncReplicaAcks: 1,
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
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
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

      const result = await run(cluster);
      assert.equal(
        result.details.parity.status,
        'mismatched',
        'parity should classify fanout and budget mismatch as mismatched',
      );
      const reasonCodes = result.details.parity.reasons
        .map((reason) => reason.code);
      assert.ok(
        reasonCodes.includes('load_fanout_mismatch'),
        'parity reasons should include load fanout mismatch code',
      );
      assert.ok(
        reasonCodes.includes('per_node_budget_mismatch'),
        'parity reasons should include per-node budget mismatch code',
      );
    });

  it('emits one resolved load admission policy view in scenario details',
    async () => {
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
            return {exitCode: 0, stdout: '2\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 10,
            clients: 4,
            jobs: 2,
            loadOpsPerSec: 80,
            loadDuration: '10s',
            loadMaxInFlight: 96,
            loadNodeMaxInFlight: 2,
            tableName: 'benchmark_events',
            replicationFactor: 3,
            syncReplicaAcks: 1,
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
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
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

      const result = await run(cluster);
      assert.ok(
        result.details.effectiveAdmissionPolicy,
        'scenario should emit effective admission policy details',
      );
      assert.equal(
        result.details.effectiveAdmissionPolicy.sources.benchmark.loadNodeMaxInFlight,
        2,
        'effective admission policy should report benchmark source values',
      );
      assert.equal(
        result.details.effectiveAdmissionPolicy.resolved.loadMaxInFlightPerNode,
        2,
        'effective admission policy should report resolved per-node load cap',
      );
    });

  it('diagnoses conflicting admission policy sources for load node budget',
    async () => {
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
            return {exitCode: 0, stdout: '2\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 10,
            clients: 4,
            jobs: 2,
            loadOpsPerSec: 80,
            loadDuration: '10s',
            loadMaxInFlight: 96,
            loadNodeMaxInFlight: 2,
            tableName: 'benchmark_events',
            replicationFactor: 3,
            syncReplicaAcks: 1,
          },
          nodeClient: {
            channelPolicies: {
              load: {
                maxInFlightPerNode: 5,
              },
            },
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
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
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

      const result = await run(cluster);
      const conflictCodes = result.details.effectiveAdmissionPolicy.conflicts
        .map((conflict) => conflict.code);
      assert.ok(
        conflictCodes.includes('load_node_max_in_flight_conflict'),
        'effective admission policy should diagnose benchmark/channel conflict',
      );
    });

  it('emits explicit diagnostics coverage unavailability reason when diagnostics are absent',
    async () => {
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
            return {exitCode: 0, stdout: '2\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 10,
            clients: 4,
            jobs: 2,
            loadOpsPerSec: 80,
            loadDuration: '10s',
            loadMaxInFlight: 96,
            loadNodeMaxInFlight: 2,
            tableName: 'benchmark_events',
            replicationFactor: 3,
            syncReplicaAcks: 1,
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
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
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

      const result = await run(cluster);
      assert.ok(
        result.details.diagnosticsCoverage,
        'scenario should include diagnosticsCoverage block',
      );
      assert.equal(
        result.details.diagnosticsCoverage.status,
        'unavailable',
        'diagnostics coverage should report unavailable when no diagnostics exist',
      );
      assert.equal(
        result.details.diagnosticsCoverage.reason,
        'not_reported',
        'diagnostics coverage should include explicit unavailability reason',
      );
      assert.equal(
        result.details.diagnosticsCoverage.sampleCount,
        0,
        'diagnostics coverage should report zero samples when unavailable',
      );
    });

  it('propagates diagnostics sample counts when write-path diagnostics are present',
    async () => {
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
            return {exitCode: 0, stdout: '2\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 10,
            clients: 4,
            jobs: 2,
            loadOpsPerSec: 80,
            loadDuration: '10s',
            loadMaxInFlight: 96,
            loadNodeMaxInFlight: 2,
            tableName: 'benchmark_events',
            replicationFactor: 3,
            syncReplicaAcks: 1,
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
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
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
        waitForConvergence: async () => ({
          settledAfterMs: 1,
          diagnostics: {
            writePath: {
              sampleCounts: {
                raftPropose: 5,
                transportDeliver: 7,
                sqlite: 11,
              },
            },
          },
        }),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      assert.equal(
        result.details.diagnosticsCoverage.status,
        'available',
        'diagnostics coverage should report available when diagnostics exist',
      );
      assert.equal(
        result.details.diagnosticsCoverage.sampleCount,
        23,
        'diagnostics coverage should report total propagated sample count',
      );
      assert.deepEqual(
        result.details.diagnosticsCoverage.writePathSamples,
        {
          raftPropose: 5,
          transportDeliver: 7,
          sqlite: 11,
        },
        'diagnostics coverage should include write-path sample counts',
      );
    });

  it('buildComparison calculates ratios using baseline metrics', () => {
    const comparison = buildComparison(
      {
        opsPerSec: 120,
        latency: {p99: 24},
      },
      {
        tps: 80,
        latencyAverageMs: 12,
      },
    );

    assert.equal(comparison.sutOpsPerSec, 120);
    assert.equal(comparison.baselineTps, 80);
    assert.equal(comparison.throughputRatioSutToBaseline, 1.5);
    assert.equal(comparison.p99LatencyRatioSutToBaselineAvg, 2);
  });

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
