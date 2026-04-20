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

});
