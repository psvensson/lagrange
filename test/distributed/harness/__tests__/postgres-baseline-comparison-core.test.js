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
  probeLoadLaneReadiness,
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
import {
  SUT_LOAD_NODE_ADMISSION_STATE,
  hasLoadLaneConfirmableLocalReadinessBlock,
  normalizeSutLoadNodeAdmissionEvidence,
  adjudicateSutLoadNodeAdmission,
  buildSutLoadNodeAdmissionDecisionTrace,
  shouldPreserveTopologyDeferredAdmission,
  shouldConfirmLocalReadinessViaLoadLane,
} from '../../scenarios/postgres-baseline-node-admission.js';
import {
  RERUN_20260403T102148Z_NODE_ADMISSION_CASES,
} from '../__fixtures__/postgres-baseline-node-admission-replay-fixtures.js';
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

  it('retries canonical benchmark table metadata progression after transient participant failures without rerunning DDL', async () => {
    const tableProbeSql =
      'SELECT count(*) FROM benchmark_events WHERE 1 = 0';
    let createAttempts = 0;
    let metadataLookupAttempts = 0;
    let preflightSnapshotCalls = 0;
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
          return {rows: [{count: 0}]};
        }
        if (statement.includes('FROM replica_operations') &&
            statement.includes('status NOT IN')) {
          return {rows: []};
        }
        if (statement.includes('FROM services')) {
          return {
            rows: [{
              partition_id: 'p1',
              node_id: this.id,
              status: 'active',
            }],
          };
        }
        if (statement.includes('FROM tables')) {
          return {
            rows: [{
              table_id: 'tbl-benchmark',
              schema_version: '1740589945123',
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
          return {rows: []};
        }
        if (statement.includes('FROM tables')) {
          metadataLookupAttempts += 1;
          if (metadataLookupAttempts === 1) {
            const error = new Error(
              'Admin API query failed for node seed-1 on lane control: ' +
                'Distributed operation failed due to participant failures',
            );
            error.code = 'operation_error';
            throw error;
          }
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
        nodeClient: {
          channelPolicies: {
            control: {
              retryBudget: 0,
            },
          },
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
          timing: {
            now: (() => {
              let current = 0;
              return () => current++;
            })(),
            sleep: async () => {},
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
      1,
      'canonical benchmark table DDL should not be rerun when only metadata progression is transiently behind',
    );
    assert.ok(
      metadataLookupAttempts >= 2,
      'metadata lookup should be retried after transient participant failure before the later ready check runs',
    );
    assert.equal(
      preflightSnapshotCalls,
      1,
      'post-create retry path should force one preflight snapshot repair before retrying metadata progression',
    );
    assert.ok(
      loadGeneratorCalls >= 2,
      'scenario should proceed through both SUT and baseline load phases after metadata progression recovers',
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
          nodeClient: {
            channelPolicies: {
              snapshot: {
                retryBudget: 0,
                circuitBreakerThreshold: 10,
              },
            },
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

  it('rechecks transient leadership-unknown invariant before failing strict preload gate',
    async () => {
      let loadGeneratorCalls = 0;
      let preflightSnapshotCalls = 0;
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

      function buildDiscoverySnapshot(sourceNodeId) {
        return {
          schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
          nodeId: sourceNodeId,
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
            nodes: [sourceNodeId],
            replicas: [{
              endpointId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE + '-ep-' + sourceNodeId,
              serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
              nodeId: sourceNodeId,
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
                tableName: DEFAULT_DISCOVERY_TABLE_NAME,
                appliedSchemaVersion: requiredSchemaVersion,
                reasons: [],
              },
            }],
          }],
        };
      }

      function buildTransientLeadershipUnknownSnapshot(node) {
        const unknownPartition = {
          leaderKnown: false,
          leaderNodeId: null,
          isLeaderLocal: false,
          lastErrorCode: 'leader_service_missing',
        };
        return buildPreflightCriticalPathSnapshotPayload(node, {
          controlPlanePartitions: {
            nodes: {...unknownPartition},
            services: {...unknownPartition},
            node_endpoints: {...unknownPartition},
            service_endpoints: {...unknownPartition},
          },
        });
      }

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 1,
            clients: 1,
            jobs: 1,
            loadOpsPerSec: 10,
            loadDuration: '1s',
            loadMaxInFlight: 8,
            loadNodeMaxInFlight: 8,
            tableName: DEFAULT_DISCOVERY_TABLE_NAME,
            replicationFactor: 1,
            syncReplicaAcks: 0,
            strictBenchmarkMode: true,
            strictDiscovery: true,
            strictPreloadReadiness: true,
            requiredSutLoadNodeCount: 1,
            readyTimeoutMs: 120,
            readyPollIntervalMs: 10,
            quiescentTimeoutMs: 120,
            quiescentPollIntervalMs: 10,
            quiescentStableWindowMs: 0,
            preloadRequiredStableMs: 0,
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
          nodeClient: {
            channelPolicies: {
              snapshot: {
                retryBudget: 0,
                circuitBreakerThreshold: 10,
              },
            },
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
                        total: 20,
                        success: 20,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 20,
                        latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                      } :
                      {
                        total: 20,
                        success: 20,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 20,
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
            if (statement.includes('FROM services')) {
              return {
                rows: [{
                  partition_id: 'p1',
                  node_id: 'seed-1',
                  status: 'active',
                }],
              };
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
              return {
                rows: [buildDiscoverySnapshot(this.id)],
              };
            }
            if (statement === PREFLIGHT_CRITICAL_PATH_SNAPSHOT_SQL) {
              preflightSnapshotCalls += 1;
              if (preflightSnapshotCalls === 1) {
                return {
                  rows: [buildTransientLeadershipUnknownSnapshot(this)],
                };
              }
              return {
                rows: [buildPreflightCriticalPathSnapshotPayload(this)],
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
        }]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      assert.ok(
        result?.loadMetrics,
        'scenario should recover from transient leadership-unknown snapshots',
      );
      assert.ok(
        preflightSnapshotCalls >= 2,
        'strict pre-load invariant gate should re-check transient breaches',
      );
      assert.ok(
        loadGeneratorCalls >= 2,
        'scenario should continue through SUT and baseline load phases',
      );
      assert.equal(
        result.details.benchmark.strictBenchmarkGate.invariants.status,
        'ok',
      );
      assert.ok(
        result.details.benchmark.strictBenchmarkGate.invariants.retryAttempts >= 1,
        'strict benchmark gate should record at least one transient retry',
      );
    });

  it('does not hard-fail pre-load invariants when only strict parity is enabled',
    async () => {
      let loadGeneratorCalls = 0;
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

      function buildDiscoverySnapshot(sourceNodeId) {
        return {
          schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
          nodeId: sourceNodeId,
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
            nodes: [sourceNodeId],
            replicas: [{
              endpointId:
                NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE + '-ep-' + sourceNodeId,
              serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
              nodeId: sourceNodeId,
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
                tableName: DEFAULT_DISCOVERY_TABLE_NAME,
                appliedSchemaVersion: requiredSchemaVersion,
                reasons: [],
              },
            }],
          }],
        };
      }

      function buildLeadershipUnknownSnapshot(node) {
        const unknownPartition = {
          leaderKnown: false,
          leaderNodeId: null,
          isLeaderLocal: false,
          lastErrorCode: 'leader_service_missing',
        };
        return buildPreflightCriticalPathSnapshotPayload(node, {
          controlPlanePartitions: {
            nodes: {...unknownPartition},
            services: {...unknownPartition},
            node_endpoints: {...unknownPartition},
            service_endpoints: {...unknownPartition},
          },
        });
      }

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 1,
            clients: 1,
            jobs: 1,
            loadOpsPerSec: 10,
            loadDuration: '1s',
            loadMaxInFlight: 8,
            loadNodeMaxInFlight: 8,
            tableName: DEFAULT_DISCOVERY_TABLE_NAME,
            replicationFactor: 1,
            syncReplicaAcks: 0,
            strictParity: true,
            strictDiscovery: false,
            strictPreloadReadiness: false,
            requiredSutLoadNodeCount: 1,
            readyTimeoutMs: 120,
            readyPollIntervalMs: 10,
            quiescentTimeoutMs: 120,
            quiescentPollIntervalMs: 10,
            quiescentStableWindowMs: 0,
            preloadRequiredStableMs: 0,
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
                        total: 20,
                        success: 20,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 20,
                        latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                      } :
                      {
                        total: 20,
                        success: 20,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 20,
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
            if (statement.includes('FROM services')) {
              return {
                rows: [{
                  partition_id: 'p1',
                  node_id: 'seed-1',
                  status: 'active',
                }],
              };
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
              return {
                rows: [buildDiscoverySnapshot(this.id)],
              };
            }
            if (statement === PREFLIGHT_CRITICAL_PATH_SNAPSHOT_SQL) {
              return {
                rows: [buildLeadershipUnknownSnapshot(this)],
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
        }]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      assert.ok(
        result?.loadMetrics,
        'scenario should continue when strict preload readiness is disabled',
      );
      assert.ok(
        loadGeneratorCalls >= 2,
        'scenario should execute SUT and baseline load phases',
      );
      assert.equal(
        result.details.benchmark.strictBenchmarkGate.invariants,
        null,
        'strict invariant gate should stay disabled outside strict preload mode',
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

    await run(cluster);
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
    assert.ok(
      loadCalls.length > 0,
      'non-strict bootstrap should continue once table and partition metadata are visible',
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

  it('fails pre-load gate when degraded fallback nodes are not strict load-admissible',
    async () => {
      const tableProbeSql =
        `SELECT count(*) FROM ${DEFAULT_DISCOVERY_TABLE_NAME} WHERE 1 = 0`;
      const requiredSchemaVersion = '1740589945123:7:seed-1';
      let sutLoadStarted = false;
      let currentTimeMs = 0;
      let tableProbePassesRemaining = 1;

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

      function buildDiscoverySnapshot(sourceNodeId) {
        const capturedAt = Date.now();
        const degraded = tableProbePassesRemaining === 0;
        return {
          schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
          nodeId: sourceNodeId,
          capturedAt,
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
            nodes: [sourceNodeId],
            replicas: [{
              endpointId:
                NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE + '-ep-' + sourceNodeId,
              serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
              nodeId: sourceNodeId,
              address: '127.0.0.1',
              port: DEFAULT_DISCOVERY_REPLICA_PORT,
              healthStatus: DEFAULT_DISCOVERY_HEALTH,
              updatedAt: capturedAt,
              metadata: {},
              readiness: {
                workloadReady: true,
                benchmarkReady: !degraded,
                routingReady: true,
                schemaReady: true,
                topologyReady: !degraded,
                replicaOpsInFlight: 0,
                leadershipStable: !degraded,
                tableName: DEFAULT_DISCOVERY_TABLE_NAME,
                appliedSchemaVersion: requiredSchemaVersion,
                reasons: degraded ?
                  [{
                    code: 'local_replica_not_voter_ready',
                    detail: 'p1',
                  }] :
                  [],
              },
              benchmarkAdmission: {
                tableName: DEFAULT_DISCOVERY_TABLE_NAME,
                nodeId: sourceNodeId,
                state: degraded ? 'blocked' : 'ready',
                routingReady: true,
                schemaReady: true,
                topologyReady: !degraded,
                localReplicaRole: degraded ? 'candidate' : 'voter',
                degradedByOperationIds: [],
                reasons: degraded ?
                  [{
                    code: 'local_replica_not_voter_ready',
                    detail: 'p1',
                  }] :
                  [],
              },
            }],
          }],
        };
      }

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        query: async function(sql) {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
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
            return {
              rows: [buildDiscoverySnapshot(this.id)],
            };
          }
            if (statement === tableProbeSql) {
              if (tableProbePassesRemaining > 0) {
                tableProbePassesRemaining -= 1;
                return {rows: [{count: 0}]};
              }
              throw new Error(
                'benchmark admission blocked: local_replica_not_voter_ready',
              );
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
            readyTimeoutMs: 20,
            readyPollIntervalMs: 5,
            quiescentTimeoutMs: 20,
            quiescentPollIntervalMs: 5,
            quiescentStableWindowMs: 0,
            preloadRequiredStableMs: 0,
            tableName: DEFAULT_DISCOVERY_TABLE_NAME,
            replicationFactor: 1,
            syncReplicaAcks: 0,
            strictDiscovery: false,
            strictParity: false,
            strictPreloadReadiness: false,
            allowPreloadStallSoftFallback: true,
            requiredSutLoadNodeCount: 1,
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
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
              if (isBaselineLoad) {
                return {
                  start: () => ({
                    waitComplete: async () => ({
                      total: 10,
                      success: 10,
                      failed: 0,
                      errors: 0,
                      opsPerSec: 10,
                      latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                    }),
                  }),
                };
              }
              return {
                start: () => {
                  sutLoadStarted = true;
                  return {
                    waitComplete: async () => {
                      await nodes[0].query(tableProbeSql);
                      return {
                        total: 1,
                        success: 1,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 10,
                        latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                      };
                    },
                  };
                },
              };
            },
            timing: {
              now: () => currentTimeMs,
              sleep: async (delayMs = 0) => {
                currentTimeMs += Math.max(1, Number(delayMs) || 0);
              },
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
        /failed in phase pre_load_gate: degraded pre-load fallback produced no strict load-admissible nodes/i,
      );
      assert.equal(
        sutLoadStarted,
        false,
        'scenario should not start SUT load when degraded fallback nodes are already known to be non-admissible',
      );
    });

  it('retains topology-deferred degraded fallback nodes without forcing load-lane proof',
    async () => {
      const tableProbeSql =
        `SELECT count(*) FROM ${DEFAULT_DISCOVERY_TABLE_NAME} WHERE 1 = 0`;
      const requiredSchemaVersion = '1740589945123:7:seed-1';
      let sutLoadStarted = false;
      let currentTimeMs = 0;
      let tableProbePassesRemaining = 1;

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

      function buildDiscoverySnapshot(sourceNodeId) {
        const capturedAt = Date.now();
        const degraded = tableProbePassesRemaining === 0;
        return {
          schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
          nodeId: sourceNodeId,
          capturedAt,
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
            nodes: [sourceNodeId],
            replicas: [{
              endpointId:
                NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE + '-ep-' + sourceNodeId,
              serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
              nodeId: sourceNodeId,
              address: '127.0.0.1',
              port: DEFAULT_DISCOVERY_REPLICA_PORT,
              healthStatus: DEFAULT_DISCOVERY_HEALTH,
              updatedAt: capturedAt,
              metadata: {},
              readiness: {
                workloadReady: true,
                benchmarkReady: !degraded,
                routingReady: true,
                schemaReady: true,
                topologyReady: !degraded,
                replicaOpsInFlight: degraded ? 1 : 0,
                leadershipStable: true,
                tableName: DEFAULT_DISCOVERY_TABLE_NAME,
                appliedSchemaVersion: requiredSchemaVersion,
                reasons: degraded ?
                  [{
                    code: 'replica_operations_in_flight',
                    detail: 'p1',
                  }] :
                  [],
              },
              benchmarkAdmission: {
                tableName: DEFAULT_DISCOVERY_TABLE_NAME,
                nodeId: sourceNodeId,
                state: degraded ? 'blocked' : 'ready',
                routingReady: true,
                schemaReady: true,
                topologyReady: !degraded,
                localReplicaRole: degraded ? 'candidate' : 'voter',
                degradedByOperationIds: degraded ? ['replica-op-1'] : [],
                reasons: degraded ?
                  [{
                    code: 'replica_operations_in_flight',
                    detail: 'p1',
                  }] :
                  [],
              },
            }],
          }],
        };
      }

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        query: async function(sql) {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
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
            return {
              rows: [buildDiscoverySnapshot(this.id)],
            };
          }
          if (statement === tableProbeSql) {
            if (tableProbePassesRemaining > 0) {
              tableProbePassesRemaining -= 1;
              return {rows: [{count: 0}]};
            }
            throw new Error(
              'NodeClient queryLoadProbe failed ' +
                '(node=seed-1, channel=probe, timeoutClass=none, code=circuit_open): ' +
                'circuit breaker is open',
            );
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
            readyTimeoutMs: 20,
            readyPollIntervalMs: 5,
            quiescentTimeoutMs: 20,
            quiescentPollIntervalMs: 5,
            quiescentStableWindowMs: 0,
            preloadRequiredStableMs: 0,
            tableName: DEFAULT_DISCOVERY_TABLE_NAME,
            replicationFactor: 1,
            syncReplicaAcks: 0,
            strictDiscovery: false,
            strictParity: false,
            strictPreloadReadiness: false,
            allowPreloadStallSoftFallback: true,
            requiredSutLoadNodeCount: 1,
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
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
              if (isBaselineLoad) {
                return {
                  start: () => ({
                    waitComplete: async () => ({
                      total: 10,
                      success: 10,
                      failed: 0,
                      errors: 0,
                      opsPerSec: 10,
                      latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                    }),
                  }),
                };
              }
              return {
                start: () => {
                  sutLoadStarted = true;
                  return {
                    waitComplete: async () => ({
                      total: 1,
                      success: 1,
                      failed: 0,
                      errors: 0,
                      opsPerSec: 10,
                      latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                    }),
                  };
                },
              };
            },
            timing: {
              now: () => currentTimeMs,
              sleep: async (delayMs = 0) => {
                currentTimeMs += Math.max(1, Number(delayMs) || 0);
              },
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
      assert.ok(
        result?.loadMetrics,
        'scenario should continue when degraded fallback nodes are only topology-deferred',
      );
      assert.equal(
        sutLoadStarted,
        true,
        'scenario should start SUT load when degraded fallback keeps a topology-deferred node admitted',
      );
      assert.equal(
        result.details.phaseArtifacts?.pre_load_gate?.preloadFallbackLoadAdmission
          ?.nodeAdmissionTraceByNodeId?.['seed-1']?.derivedState,
        'topology_deferred',
        'pre-load fallback diagnostics should retain the topology-deferred admission state',
      );
    });

  it('retains last-known-good load routing admission through transient probe errors',
    async () => {
      let loadWindowOpen = false;
      let admittedLoadQueryCount = 0;
      let loadWindowDiscoverySuccessCount = 0;
      let loadWindowDiscoveryFailureCount = 0;
      let loadWindowDiscoveryRecoverySuccessCount = 0;
      let pendingTransientDiscoveryFailures = 0;

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
        _discoveryNodeIds: ['seed-1'],
        query: async function(sql) {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            admittedLoadQueryCount += 1;
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
            if (loadWindowOpen && pendingTransientDiscoveryFailures > 0) {
              pendingTransientDiscoveryFailures -= 1;
              loadWindowDiscoveryFailureCount += 1;
              throw new Error('transient discovery outage');
            }
            if (loadWindowOpen) {
              loadWindowDiscoverySuccessCount += 1;
              if (loadWindowDiscoveryFailureCount > 0) {
                loadWindowDiscoveryRecoverySuccessCount += 1;
              }
            }
            return {rows: [buildServiceDiscoverySnapshot(this)]};
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
            requiredSutLoadNodeCount: 1,
            loadRebalanceMonitorPollIntervalMs: 5,
            loadRoutingProbeErrorGraceMs: 200,
          },
          nodeClient: {
            channelPolicies: {
              snapshot: {
                retryBudget: 0,
                circuitBreakerThreshold: 10,
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
                    waitComplete: async () => {
                      await new Promise((resolve) => {
                        setTimeout(resolve, 6);
                      });
                      await nodes[0].query('SELECT 1');
                      while (loadWindowDiscoverySuccessCount < 1) {
                        await new Promise((resolve) => {
                          setTimeout(resolve, 1);
                        });
                      }
                      await new Promise((resolve) => {
                        setTimeout(resolve, 12);
                      });
                      pendingTransientDiscoveryFailures = 1;
                      while (loadWindowDiscoveryFailureCount < 1) {
                        await new Promise((resolve) => {
                          setTimeout(resolve, 1);
                        });
                      }
                      while (loadWindowDiscoveryRecoverySuccessCount < 1) {
                        await new Promise((resolve) => {
                          setTimeout(resolve, 1);
                        });
                      }
                      await nodes[0].query('SELECT 1');
                      return {
                        total: 2,
                        success: 2,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 50,
                        latency: {avg: 4, p50: 3, p95: 6, p99: 7},
                      };
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

      const result = await run(cluster);
      const loadRoutingAdmission =
        result.details.benchmark.rebalancingPressure.load.routingAdmission;
      assert.ok(
        admittedLoadQueryCount > 0,
        'load queries should continue running while transient routing probe errors recover',
      );
      assert.ok(
        loadRoutingAdmission.graceSampleCount > 0,
        'routing admission should record grace-backed samples during transient probe errors',
      );
      assert.equal(
        loadRoutingAdmission.blockedSampleCount,
        0,
        'transient routing probe errors should not immediately block load routing',
      );
      assert.equal(
        loadRoutingAdmission.stateByNodeId['seed-1'].ready,
        true,
        'node should recover back to an admitted routing state after transient probe errors',
      );
      assert.ok(
        loadRoutingAdmission.probeErrors.length > 0,
        'transient probe errors should still be recorded for diagnostics',
      );
    });

  it('blocks load routing after the probe-error grace window expires',
    async () => {
      let loadWindowOpen = false;
      let loadWindowDiscoveryCallCount = 0;

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
        _discoveryNodeIds: ['seed-1'],
        query: async function(sql) {
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
            if (loadWindowOpen) {
              loadWindowDiscoveryCallCount += 1;
              if (loadWindowDiscoveryCallCount >= 2) {
                throw new Error('persistent discovery outage');
              }
            }
            return {rows: [buildServiceDiscoverySnapshot(this)]};
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
            requiredSutLoadNodeCount: 1,
            loadRebalanceMonitorPollIntervalMs: 5,
            loadRoutingProbeErrorGraceMs: 20,
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
                    waitComplete: async () => {
                      await new Promise((resolve) => {
                        setTimeout(resolve, 35);
                      });
                      await nodes[0].query('SELECT 1');
                      return {
                        total: 1,
                        success: 1,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 50,
                        latency: {avg: 4, p50: 3, p95: 6, p99: 7},
                      };
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
        /routing admission blocked: node=seed-1, reasons=routing_probe_error:service_discovery_query_error/i,
      );
    });

  it('widens strict discovery scope when table-id scoped snapshots stay empty',
    async () => {
      const requiredSchemaVersion = '1740589945123:7:seed-1';
      const scopedDiscoverySql =
        "SELECT * FROM service_discovery_local('benchmark_events', 'tbl-benchmark')";
      const tableNameOnlyDiscoverySql =
        "SELECT * FROM service_discovery_local('benchmark_events')";
      const serviceDiscoverySqlCalls = [];
      let loadGeneratorCalls = 0;

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
          readiness: {
            workloadReady: true,
            benchmarkReady: true,
            routingReady: true,
            schemaReady: true,
            topologyReady: true,
            replicaOpsInFlight: 0,
            leadershipStable: true,
            tableName: DEFAULT_DISCOVERY_TABLE_NAME,
            appliedSchemaVersion: requiredSchemaVersion,
            reasons: [],
          },
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
            if (statement.includes('FROM services')) {
              return {
                rows: [{
                  partition_id: 'p1',
                  node_id: 'seed-1',
                  status: 'active',
                }],
              };
            }
            return {rows: []};
          },
          queryWithTimeout: async function(sql, params = [], _options = {}) {
            const statement = String(sql);
            if (statement === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
              return {
                rows: [buildControlSnapshotPayload(this.id, {
                  nodes: ['seed-1', 'joiner-1'],
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
              serviceDiscoverySqlCalls.push(statement);
              if (statement === scopedDiscoverySql) {
                return {
                  rows: [{
                    schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
                    nodeId: this.id,
                    capturedAt: Date.now(),
                    serviceCount: 0,
                    replicaCount: 0,
                    services: [],
                  }],
                };
              }
              return {
                rows: [buildDiscoverySnapshot(this.id)],
              };
            }
            if (statement.startsWith(
              `CREATE TABLE IF NOT EXISTS ${DEFAULT_DISCOVERY_TABLE_NAME}`,
            )) {
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
        };
      }

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 1,
            clients: 1,
            jobs: 1,
            loadOpsPerSec: 10,
            loadDuration: '1s',
            loadMaxInFlight: 8,
            tableName: DEFAULT_DISCOVERY_TABLE_NAME,
            replicationFactor: 1,
            syncReplicaAcks: 0,
            strictDiscovery: true,
            requiredSutLoadNodeCount: 2,
            readyTimeoutMs: 120,
            readyPollIntervalMs: 10,
            quiescentTimeoutMs: 120,
            quiescentPollIntervalMs: 10,
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
                        total: 20,
                        success: 20,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 20,
                        latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                      } :
                      {
                        total: 20,
                        success: 20,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 20,
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
        getNodes: () => asNodeHandles([
          createNode('seed-1', 'seed'),
          createNode('joiner-1', 'joiner'),
        ]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      assert.ok(
        result?.loadMetrics,
        'scenario should complete after widening discovery scope',
      );
      assert.equal(
        result.details.benchmark.sutLoadNodeCount,
        2,
        'strict discovery should admit both SUT load nodes',
      );
      assert.ok(
        serviceDiscoverySqlCalls.includes(scopedDiscoverySql),
        'preflight discovery should attempt table-id scoped query first',
      );
      assert.ok(
        serviceDiscoverySqlCalls.includes(tableNameOnlyDiscoverySql),
        'preflight discovery should retry with table-name scoped query',
      );
      assert.ok(
        loadGeneratorCalls >= 2,
        'scenario should continue through SUT and baseline load phases',
      );
    });

  it('admits topology-blocked replicas during strict discovery when routing and schema are ready',
    async () => {
      const requiredSchemaVersion = '1740589945123:7:seed-1';
      let loadGeneratorCalls = 0;

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

      function buildReplica(nodeId) {
        const isJoiner = nodeId === 'joiner-1';
        return {
          endpointId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE + '-ep-' + nodeId,
          serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
          nodeId,
          address: '127.0.0.1',
          port: DEFAULT_DISCOVERY_REPLICA_PORT,
          healthStatus: DEFAULT_DISCOVERY_HEALTH,
          updatedAt: Date.now(),
          metadata: {},
          readiness: {
            workloadReady: true,
            benchmarkReady: !isJoiner,
            routingReady: true,
            schemaReady: true,
            topologyReady: !isJoiner,
            replicaOpsInFlight: isJoiner ? 1 : 0,
            leadershipStable: !isJoiner,
            tableName: DEFAULT_DISCOVERY_TABLE_NAME,
            appliedSchemaVersion: requiredSchemaVersion,
            reasons: isJoiner ? [{
              code: 'local_replica_not_voter_ready',
              detail: 'p1',
            }] : [],
          },
          benchmarkAdmission: {
            tableName: DEFAULT_DISCOVERY_TABLE_NAME,
            nodeId,
            state: isJoiner ? 'blocked' : 'ready',
            routingReady: true,
            schemaReady: true,
            topologyReady: !isJoiner,
            localReplicaRole: isJoiner ? 'candidate' : 'voter',
            degradedByOperationIds: isJoiner ? ['op-topology-sync'] : [],
            reasons: isJoiner ? [{
              code: 'replica_operation_in_flight',
              detail: 'op-topology-sync:REPLACE:syncing',
            }] : [],
          },
        };
      }

      function buildDiscoverySnapshot(sourceNodeId) {
        const replicas = ['seed-1', 'joiner-1'].map((nodeId) => buildReplica(nodeId));
        return {
          schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
          nodeId: sourceNodeId,
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
            if (statement.includes('FROM services')) {
              return {
                rows: [{
                  partition_id: 'p1',
                  node_id: 'seed-1',
                  status: 'active',
                }],
              };
            }
            return {rows: []};
          },
          queryWithTimeout: async function(sql, params = [], _options = {}) {
            const statement = String(sql);
            if (statement === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
              return {
                rows: [buildControlSnapshotPayload(this.id, {
                  nodes: ['seed-1', 'joiner-1'],
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
              return {
                rows: [buildDiscoverySnapshot(this.id)],
              };
            }
            if (statement.startsWith(
              `CREATE TABLE IF NOT EXISTS ${DEFAULT_DISCOVERY_TABLE_NAME}`,
            )) {
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
        };
      }

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 1,
            clients: 1,
            jobs: 1,
            loadOpsPerSec: 10,
            loadDuration: '1s',
            loadMaxInFlight: 8,
            tableName: DEFAULT_DISCOVERY_TABLE_NAME,
            replicationFactor: 1,
            syncReplicaAcks: 0,
            strictDiscovery: true,
            requiredSutLoadNodeCount: 2,
            readyTimeoutMs: 120,
            readyPollIntervalMs: 10,
            quiescentTimeoutMs: 120,
            quiescentPollIntervalMs: 10,
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
                        total: 20,
                        success: 20,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 20,
                        latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                      } :
                      {
                        total: 20,
                        success: 20,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 20,
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
        getNodes: () => asNodeHandles([
          createNode('seed-1', 'seed'),
          createNode('joiner-1', 'joiner'),
        ]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      assert.ok(
        result?.loadMetrics,
        'scenario should complete with topology-only admission blockers deferred',
      );
      assert.equal(
        result.details.benchmark.sutLoadNodeCount,
        2,
        'strict discovery should keep route-safe topology-blocked node admitted',
      );
      const admissionTrace =
        result.details.benchmark.sutLoadDiscovery?.nodeAdmissionTraceByNodeId?.['joiner-1'];
      assert.equal(
        admissionTrace?.derivedState,
        'topology_deferred',
        'mixed-admission diagnostics should retain per-node derived admission state',
      );
      assert.equal(
        admissionTrace?.normalizedEvidence?.local?.topologyDeferredEligible,
        true,
        'mixed-admission diagnostics should retain normalized topology-deferred evidence',
      );
      assert.equal(
        admissionTrace?.rawEvidence?.localReadiness?.evaluation?.admissionState?.topologyReady,
        false,
        'mixed-admission diagnostics should retain raw topology readiness evidence',
      );
      assert.match(
        String(admissionTrace?.finalAdmissionReason || ''),
        /topology_deferred/i,
        'mixed-admission diagnostics should retain the final admission explanation',
      );
      assert.ok(
        loadGeneratorCalls >= 2,
        'scenario should proceed through SUT and baseline load phases',
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

  it('widens heartbeat freshness tolerance for large strict-parity clusters',
    async () => {
      let loadWindowOpen = false;
      let loadSnapshotCount = 0;
      const discoveryNodeIds = [
        'seed-1',
        'joiner-1',
        'joiner-2',
        'joiner-3',
        'joiner-4',
      ];
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
            return {exitCode: 0, stdout: '4\n', stderr: ''};
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
          _discoveryNodeIds: discoveryNodeIds,
          query: async function(sql) {
            const statement = String(sql);
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
            if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
                statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
              return {rows: [buildServiceDiscoverySnapshot(this)]};
            }
            if (statement === PREFLIGHT_CRITICAL_PATH_SNAPSHOT_SQL) {
              return {
                rows: [buildPreflightCriticalPathSnapshotPayload(this)],
              };
            }
            return {rows: []};
          },
          queryWithTimeout: async function(sql, params = [], _options = {}) {
            if (String(sql) === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
              if (loadWindowOpen) {
                loadSnapshotCount++;
              }
              const heartbeatAgeMs = loadWindowOpen ? 20000 : 5;
              const readyLeaseAgeMs = loadWindowOpen ? 19995 : 0;
              const nodeLivenessByNodeId = Object.fromEntries(
                discoveryNodeIds.map((discoveryNodeId) => [
                  discoveryNodeId,
                  {
                    lastHeartbeat: 1000 + loadSnapshotCount,
                    heartbeatAgeMs,
                    readyLeaseExpiresAt: 32000,
                    readyLeaseAgeMs,
                  },
                ]),
              );
              return {
                rows: [buildControlSnapshotPayload(this.id, {
                  nodes: discoveryNodeIds,
                  leaders: {p1: 'seed-1'},
                  replicaOperations: {
                    inFlightCount: 0,
                    statusHistogram: {},
                  },
                  controlPlaneDiagnostics: {
                    nodeLivenessByNodeId,
                  },
                })],
              };
            }
            return this.query(sql, params);
          },
        };
      }

      const nodes = [
        createNode('seed-1', 'seed'),
        createNode('joiner-1', 'joiner'),
        createNode('joiner-2', 'joiner'),
        createNode('joiner-3', 'joiner'),
        createNode('joiner-4', 'joiner'),
      ];

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 30,
            clients: 2,
            jobs: 1,
            loadOpsPerSec: 40,
            loadDuration: '30s',
            loadMaxInFlight: 64,
            loadNodeMaxInFlight: 2,
            tableName: 'benchmark_events',
            replicationFactor: 1,
            syncReplicaAcks: 0,
            strictParity: true,
            loadRebalanceMonitorPollIntervalMs: 5000,
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
            createLoadGenerator: (loadNodes) => {
              const isBaselineLoad =
                String(loadNodes?.[0]?.id || '').startsWith(
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
        getNodes: () => asNodeHandles(nodes),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      const heartbeatFreshness =
        result.details.benchmark.rebalancingPressure.load.heartbeatFreshness;
      assert.equal(
        heartbeatFreshness.failed,
        false,
        'large strict-parity runs should honor the scaled heartbeat freshness threshold',
      );
      assert.ok(
        loadSnapshotCount >= 2,
        'heartbeat monitor should record multiple load-window samples',
      );
      assert.equal(
        heartbeatFreshness.perNode['seed-1'].currentHeartbeatAgeMs,
        20000,
        'regression should stay above the strict-mode default threshold',
      );
    });

  it('classifies normalized node admission evidence through one adjudicator',
    () => {
      const cases = [
        {
          name: 'admits a ready node without load-lane probing',
          input: {
            nodeId: 'node-admitted',
            adminReady: true,
            localReadiness: {
              requiresConfirmation: true,
              evaluation: {
                ready: true,
                hasAdmission: true,
                reasons: [],
                admissionState: {
                  routingReady: true,
                  schemaReady: true,
                  topologyReady: true,
                },
              },
            },
            loadLaneAttempted: false,
            loadLaneReadiness: {ready: false, reasons: []},
            allowTopologyDeferredSelection: true,
          },
          expectedState: SUT_LOAD_NODE_ADMISSION_STATE.ADMITTED,
          expectedAdmit: true,
          expectedReasons: [],
        },
        {
          name: 'admits topology-deferred benchmark admission',
          input: {
            nodeId: 'node-topology-deferred',
            adminReady: true,
            localReadiness: {
              requiresConfirmation: true,
              evaluation: {
                ready: false,
                hasAdmission: true,
                reasons: ['replica_operations_in_flight=1'],
                admissionState: {
                  routingReady: true,
                  schemaReady: true,
                  topologyReady: false,
                },
              },
            },
            loadLaneAttempted: false,
            loadLaneReadiness: {ready: false, reasons: []},
            allowTopologyDeferredSelection: true,
          },
          expectedState: SUT_LOAD_NODE_ADMISSION_STATE.TOPOLOGY_DEFERRED,
          expectedAdmit: true,
          expectedReasons: [],
        },
        {
          name: 'admits confirmable stale local readiness when load lane confirms',
          input: {
            nodeId: 'node-load-confirmed',
            adminReady: true,
            localReadiness: {
              requiresConfirmation: true,
              evaluation: {
                ready: false,
                hasAdmission: false,
                reasons: [
                  'schema_partition_unavailable=table "benchmark_events" not query-ready on node',
                ],
              },
            },
            loadLaneAttempted: true,
            loadLaneReadiness: {ready: true, reasons: []},
            allowTopologyDeferredSelection: true,
          },
          expectedState: SUT_LOAD_NODE_ADMISSION_STATE.LOAD_LANE_CONFIRMED,
          expectedAdmit: true,
          expectedReasons: [],
        },
        {
          name: 'keeps topology-only local blockers soft without confirming load evidence',
          input: {
            nodeId: 'node-stale-local',
            adminReady: true,
            localReadiness: {
              requiresConfirmation: true,
              evaluation: {
                ready: false,
                hasAdmission: false,
                reasons: [
                  'schema_partition_unavailable=table "benchmark_events" not query-ready on node',
                ],
              },
            },
            loadLaneAttempted: false,
            loadLaneReadiness: {ready: false, reasons: []},
            allowTopologyDeferredSelection: true,
          },
          expectedState: SUT_LOAD_NODE_ADMISSION_STATE.TOPOLOGY_DEFERRED,
          expectedAdmit: true,
          expectedReasons: [],
        },
        {
          name: 'keeps topology-only blockers soft when live proof fails',
          input: {
            nodeId: 'node-load-denied',
            adminReady: true,
            localReadiness: {
              requiresConfirmation: true,
              evaluation: {
                ready: false,
                hasAdmission: false,
                reasons: [
                  'leadership_unstable=leader coverage incomplete for readiness scope',
                ],
              },
            },
            loadLaneAttempted: true,
            loadLaneReadiness: {
              ready: false,
              reasons: ['load_probe_failed:circuit breaker is open'],
            },
            allowTopologyDeferredSelection: true,
          },
          expectedState: SUT_LOAD_NODE_ADMISSION_STATE.TOPOLOGY_DEFERRED,
          expectedAdmit: true,
          expectedReasons: [],
        },
        {
          name: 'keeps voter-ready blockers hard when live proof fails',
          input: {
            nodeId: 'node-voter-blocked',
            adminReady: true,
            localReadiness: {
              requiresConfirmation: true,
              evaluation: {
                ready: false,
                hasAdmission: true,
                reasons: [
                  'local_replica_not_voter_ready=p1',
                ],
                admissionState: {
                  routingReady: true,
                  schemaReady: true,
                  topologyReady: false,
                },
              },
            },
            loadLaneAttempted: true,
            loadLaneReadiness: {
              ready: false,
              reasons: ['load_probe_failed:circuit breaker is open'],
            },
            allowTopologyDeferredSelection: true,
          },
          expectedState: SUT_LOAD_NODE_ADMISSION_STATE.LOAD_LANE_DENIED,
          expectedAdmit: false,
          expectedReasons: [
            'load_probe_failed:circuit breaker is open',
            'self_discovery=local_replica_not_voter_ready=p1',
          ],
        },
        {
          name: 'blocks on admin reachability before admission',
          input: {
            nodeId: 'node-awaiting-admin',
            adminReady: false,
            adminReasons: ['admin_not_ready'],
            localReadiness: {
              requiresConfirmation: false,
              evaluation: {
                ready: true,
                hasAdmission: false,
                reasons: [],
              },
            },
            loadLaneAttempted: false,
            loadLaneReadiness: {ready: false, reasons: []},
            allowTopologyDeferredSelection: true,
          },
          expectedState: SUT_LOAD_NODE_ADMISSION_STATE.AWAITING_ADMIN,
          expectedAdmit: false,
          expectedReasons: ['admin_not_ready'],
        },
      ];

      for (const testCase of cases) {
        const normalizedEvidence = normalizeSutLoadNodeAdmissionEvidence(
          testCase.input,
        );
        const decision = adjudicateSutLoadNodeAdmission(normalizedEvidence);
        assert.equal(
          decision.state,
          testCase.expectedState,
          testCase.name,
        );
        assert.equal(
          decision.admit,
          testCase.expectedAdmit,
          testCase.name + ' admit verdict',
        );
        assert.deepEqual(
          decision.exclusionReasons,
          testCase.expectedReasons,
          testCase.name + ' exclusion reasons',
        );
      }
    });

  it('keeps topology-only local blockers on the soft deferred path', () => {
    const localReadiness = {
      requiresConfirmation: true,
      evaluation: {
        ready: false,
        hasAdmission: false,
        reasons: [
          'leadership_unstable=leader coverage incomplete for readiness scope',
          'schema_partition_unavailable=table "benchmark_events" not query-ready on node',
        ],
      },
    };

    assert.equal(
      hasLoadLaneConfirmableLocalReadinessBlock(localReadiness.evaluation),
      true,
      'topology-only blockers remain explainable to the load lane when proof is needed',
    );
    assert.equal(
      shouldPreserveTopologyDeferredAdmission(localReadiness),
      true,
      'topology-only blockers should stay on the soft deferred path',
    );
    assert.equal(
      shouldConfirmLocalReadinessViaLoadLane(localReadiness, {
        adminReady: true,
        hasTableProbe: true,
        allowSoftDiscoveryNodeFallback: true,
      }),
      false,
      'topology-only blockers should not trigger a hard revalidation probe',
    );
  });

  it('replays captured node-admission failures from rerun-20260403T102148Z',
    () => {
      for (const replayCase of RERUN_20260403T102148Z_NODE_ADMISSION_CASES) {
        const normalizedEvidence = normalizeSutLoadNodeAdmissionEvidence(
          replayCase.input,
        );
        const decision = adjudicateSutLoadNodeAdmission(normalizedEvidence);
        const trace = buildSutLoadNodeAdmissionDecisionTrace(
          replayCase.input,
          decision,
        );
        assert.equal(
          decision.state,
          replayCase.expectedState,
          replayCase.name,
        );
        assert.deepEqual(
          decision.exclusionReasons,
          [...replayCase.expectedReasons],
          replayCase.name + ' exclusion reasons',
        );
        assert.equal(
          trace.derivedState,
          replayCase.expectedState,
          replayCase.name + ' trace state',
        );
        assert.equal(
          trace.finalAdmissionReason,
          decision.explanation,
          replayCase.name + ' trace explanation',
        );
      }
    });

  it('keeps rerun-20260403T102148Z nodes blocked when only the control lane responds',
    async () => {
      const replayEvidence = {
        nodeId: '35a891b8-c1a0-5064-9c6e-2acfba61c2a7',
        localReasons: [
          'leadership_unstable=leader coverage incomplete for readiness scope',
          'schema_partition_unavailable=table "benchmark_events" not query-ready on node',
        ],
        probeFailure:
          'NodeClient queryLoadProbe failed (node=35a891b8-c1a0-5064-9c6e-2acfba61c2a7, channel=probe, timeoutClass=none, code=circuit_open): circuit breaker is open',
      };
      const queryLog = [];
      const node = {
        id: replayEvidence.nodeId,
        queryWithTimeout: async (_sql, _params, options = {}) => {
          queryLog.push({kind: 'direct', lane: String(options?.lane || 'default')});
          throw new Error(replayEvidence.probeFailure);
        },
      };
      const nodeClient = {
        queryLoadProbe: async () => {
          throw new Error(replayEvidence.probeFailure);
        },
        queryLoad: async () => {
          throw new Error(replayEvidence.probeFailure);
        },
        queryControl: async () => {
          queryLog.push({kind: 'control'});
          return {rows: [{value: 1}]};
        },
      };

      const readiness = await probeLoadLaneReadiness(nodeClient, node, {
        tableProbeSql: 'SELECT count(*) FROM benchmark_events WHERE 1 = 0',
        allowControlChannelFallback: true,
      });

      assert.equal(
        readiness.ready,
        false,
        'control-plane success must not upgrade a replay-backed load-lane failure to ready',
      );
      assert.equal(
        readiness.reasons[0]?.startsWith('load_probe_failed:'),
        true,
        'replay-backed failure should remain classified as a load probe failure',
      );
      assert.deepEqual(
        queryLog,
        [{kind: 'direct', lane: 'load'}],
        'replay-backed load readiness may retry the load lane directly after circuit-open, but must not switch proof planes',
      );
      assert.equal(
        replayEvidence.localReasons.length,
        2,
        'artifact-derived local blockers should remain present in the regression fixture',
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
