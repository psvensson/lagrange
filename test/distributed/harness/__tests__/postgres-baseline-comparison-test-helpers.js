import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {
  run,
  resolveBenchmarkConfig,
  buildComparison,
} from '../../scenarios/postgres-baseline-comparison.js';
import {
  NODE_CLIENT_CONTROL_SNAPSHOT_FORCE_REPAIR_SQL,
  NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
  NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
  NODE_CLIENT_SERVICE_DISCOVERY_SQL,
  NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
  NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
  SCENARIO_PHASE_SEQUENCE,
} from '../constants.js';

const PROBE_SQL = 'SELECT 1';
const DEFAULT_PROBE_TIMEOUT_MS = 1000;
const DEFAULT_DISCOVERY_HEALTH = 'healthy';
const DEFAULT_DISCOVERY_REPLICA_PORT = 5432;
const DISCOVERY_ADMIN_META_SERVICE_ID = 'sys-admin-meta';
const DISCOVERY_ADMIN_META_PROTOCOL = 'websocket';
const SERVICE_DISCOVERY_SQL_PREFIX = 'SELECT * FROM service_discovery_local(';
const DEFAULT_DISCOVERY_TABLE_NAME = 'benchmark_events';
const PREFLIGHT_CRITICAL_PATH_SNAPSHOT_SQL =
  'SELECT * FROM preflight_critical_path_snapshot_local()';
const PREFLIGHT_CRITICAL_PATH_SNAPSHOT_SCHEMA_VERSION = 1;
const PREFLIGHT_CRITICAL_PATH_SNAPSHOT_ADDRESS_FALLBACK = '127.0.0.1';
const QUIET_MODE_ACTION_ENTER = 'enter';
const QUIET_MODE_ACTION_EXIT = 'exit';
const QUIET_MODE_PHASE_PRE_FLIGHT = SCENARIO_PHASE_SEQUENCE[0];
const QUIET_MODE_PHASE_TEARDOWN =
  SCENARIO_PHASE_SEQUENCE[SCENARIO_PHASE_SEQUENCE.length - 1];

function createVirtualScenarioTiming(startAtMs = 0) {
  let nowMs = Number.isFinite(startAtMs) ? Math.floor(startAtMs) : 0;
  const sleepCalls = [];
  return {
    timing: {
      now: () => nowMs,
      sleep: async (durationMs) => {
        const normalizedDurationMs = Number.isFinite(durationMs) ?
          Math.max(0, Math.floor(durationMs)) :
          0;
        sleepCalls.push(normalizedDurationMs);
        nowMs += normalizedDurationMs;
      },
    },
    now: () => nowMs,
    getSleepCalls: () => [...sleepCalls],
  };
}

function installVirtualScenarioTiming(cluster, options = {}) {
  const controller = createVirtualScenarioTiming(options.startAtMs);
  const scenarioOverrides =
    cluster?._scenarioOverrides?.postgresBaselineComparison || {};
  cluster._scenarioOverrides = {
    ...(cluster?._scenarioOverrides || {}),
    postgresBaselineComparison: {
      ...scenarioOverrides,
      timing: controller.timing,
    },
  };
  return controller;
}

function runWithVirtualScenarioTiming(cluster) {
  installVirtualScenarioTiming(cluster);
  return run(cluster);
}

function isRecord(value) {
  return value !== null && typeof value === 'object';
}

function buildControlSnapshotPayload(nodeId, overrides = {}) {
  const normalizedNodeId = String(nodeId || 'unknown');
  const replicaOperations = {
    inFlightCount: 0,
    statusHistogram: {},
    ...(isRecord(overrides.replicaOperations) ? overrides.replicaOperations : {}),
  };
  return {
    schemaVersion: 1,
    nodeId: normalizedNodeId,
    capturedAt: Date.now(),
    nodes: [normalizedNodeId],
    partitions: ['p1'],
    leaders: {p1: 'seed-1'},
    ...overrides,
    replicaOperations,
  };
}

function hasValidControlSnapshotResult(result) {
  const firstRow = Array.isArray(result?.rows) ? result.rows[0] : null;
  return isRecord(firstRow) &&
    firstRow.schemaVersion === 1 &&
    typeof firstRow.nodeId === 'string' &&
    firstRow.nodeId.length > 0 &&
    Number.isFinite(firstRow.capturedAt) &&
    Array.isArray(firstRow.nodes) &&
    Array.isArray(firstRow.partitions) &&
    isRecord(firstRow.leaders) &&
    isRecord(firstRow.replicaOperations) &&
    Number.isInteger(firstRow.replicaOperations.inFlightCount);
}

function hasValidServiceDiscoveryResult(result) {
  const firstRow = Array.isArray(result?.rows) ? result.rows[0] : null;
  return isRecord(firstRow) &&
    firstRow.schemaVersion === NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION &&
    Array.isArray(firstRow.services);
}

function buildServiceDiscoverySnapshot(adapted) {
  const nodeId = String(adapted.id || 'unknown');
  const discoveryNodeIds = Array.isArray(adapted._discoveryNodeIds) ?
    [...new Set(adapted._discoveryNodeIds.map((value) => String(value)))] :
    [nodeId];
  const serviceId = typeof adapted._discoveryServiceId === 'string' &&
    adapted._discoveryServiceId.length > 0 ?
    adapted._discoveryServiceId :
    NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE;
  const protocol = typeof adapted._discoveryProtocol === 'string' &&
    adapted._discoveryProtocol.length > 0 ?
    adapted._discoveryProtocol :
    NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL;
  const serviceKey = serviceId + '|' + protocol;
  const replicaCount = discoveryNodeIds.length;
  const capturedAt = Date.now();

  return {
    schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
    nodeId,
    capturedAt,
    serviceCount: 1,
    replicaCount,
    services: [{
      serviceKey,
      logicalServiceName: serviceId,
      protocol,
      serviceIds: [serviceId],
      desiredReplicaCount: replicaCount,
      desiredReplicaCountByServiceId: {
        [serviceId]: replicaCount,
      },
      observedReplicaCount: replicaCount,
      healthyReplicaCount: replicaCount,
      unhealthyReplicaCount: 0,
      health: DEFAULT_DISCOVERY_HEALTH,
      nodeCount: replicaCount,
      nodes: discoveryNodeIds,
      replicas: discoveryNodeIds.map((replicaNodeId) => ({
        endpointId: serviceId + '-ep-' + replicaNodeId,
        serviceId,
        nodeId: replicaNodeId,
        address: '127.0.0.1',
        port: DEFAULT_DISCOVERY_REPLICA_PORT,
        healthStatus: DEFAULT_DISCOVERY_HEALTH,
        updatedAt: capturedAt,
        metadata: {},
        readiness: {
          workloadReady: true,
          routingReady: true,
          schemaReady: true,
          replicaOpsInFlight: 0,
          leadershipStable: true,
          tableName: DEFAULT_DISCOVERY_TABLE_NAME,
          reasons: [],
        },
      })),
    }],
  };
}

function buildPreflightCriticalPathSnapshotPayload(node, overrides = {}) {
  const nodeId = String(node?.id || 'unknown');
  const address = typeof node?.ip === 'string' && node.ip.length > 0 ?
    node.ip :
    PREFLIGHT_CRITICAL_PATH_SNAPSHOT_ADDRESS_FALLBACK;
  const capturedAtMs = Date.now();
  return {
    schemaVersion: PREFLIGHT_CRITICAL_PATH_SNAPSHOT_SCHEMA_VERSION,
    capturedAtMs,
    nodeId,
    address,
    routerConnectivity: {
      connectedCount: 0,
      reconnectingCount: 0,
      disconnectedCount: 0,
    },
    controlPlanePartitions: {
      nodes: {
        leaderKnown: true,
        leaderNodeId: nodeId,
        isLeaderLocal: true,
        lastErrorCode: null,
      },
      services: {
        leaderKnown: true,
        leaderNodeId: nodeId,
        isLeaderLocal: true,
        lastErrorCode: null,
      },
      node_endpoints: {
        leaderKnown: true,
        leaderNodeId: nodeId,
        isLeaderLocal: true,
        lastErrorCode: null,
      },
      service_endpoints: {
        leaderKnown: true,
        leaderNodeId: nodeId,
        isLeaderLocal: true,
        lastErrorCode: null,
      },
    },
    cdcHealth: {
      bufferDepth: 0,
      retryCount: 0,
      lastErrorCode: null,
      lastForwardAttemptAtMs: null,
    },
    cacheFreshness: {
      lastAppliedAtMs: null,
      appliedSchemaVersion: null,
      stalenessMs: null,
    },
    rowCounts: {
      sysPostgresWireServiceCount: 0,
      nodeEndpointsCount: 0,
      serviceEndpointsCount: 0,
    },
    discovery: {
      selectedNodeIds: [nodeId],
      excludedByNodeId: {},
    },
    ...overrides,
  };
}

/**
 * Ensure a control snapshot result includes all cluster node
 * IDs from `_discoveryNodeIds`. Test mocks often only include
 * the local node in the `nodes` array, but in a real cluster
 * every node's snapshot sees all active nodes. This prevents
 * false "Active nodes disagree" failures from
 * `assertConsistencyFromSnapshots`.
 */
function ensureSnapshotClusterNodes(result, adapted) {
  if (!Array.isArray(adapted._clusterNodeIds)) {
    return;
  }
  const row = Array.isArray(result?.rows) ? result.rows[0] : null;
  if (!row || !Array.isArray(row.nodes)) {
    return;
  }
  const existing = new Set(row.nodes.map((n) => String(n)));
  for (const nodeId of adapted._clusterNodeIds) {
    const normalized = String(nodeId);
    if (!existing.has(normalized)) {
      row.nodes.push(normalized);
      existing.add(normalized);
    }
  }
}

function asNodeHandle(node) {
  const adapted = {...node};
  if (Array.isArray(node?.discoveryNodeIds)) {
    adapted._discoveryNodeIds =
      node.discoveryNodeIds.map((value) => String(value));
  }
  if (typeof node?.discoveryServiceId === 'string') {
    adapted._discoveryServiceId = node.discoveryServiceId;
  }
  if (typeof node?.discoveryProtocol === 'string') {
    adapted._discoveryProtocol = node.discoveryProtocol;
  }
  const originalQueryWithTimeout =
    typeof adapted.queryWithTimeout === 'function' ?
      adapted.queryWithTimeout.bind(adapted) :
      null;
  adapted.queryWithTimeout = async (sql, params = [], options = {}) => {
    const normalizedSql = String(sql);
    if (normalizedSql === NODE_CLIENT_CONTROL_SNAPSHOT_SQL ||
        normalizedSql === NODE_CLIENT_CONTROL_SNAPSHOT_FORCE_REPAIR_SQL) {
      if (originalQueryWithTimeout) {
        const result = await originalQueryWithTimeout(
          sql, params, options,
        );
        if (hasValidControlSnapshotResult(result)) {
          ensureSnapshotClusterNodes(result, adapted);
          return result;
        }
      }
      return {
        rows: [buildControlSnapshotPayload(adapted.id,
          Array.isArray(adapted._clusterNodeIds) ?
            {nodes: adapted._clusterNodeIds} : {},
        )],
      };
    }

    if (normalizedSql === PREFLIGHT_CRITICAL_PATH_SNAPSHOT_SQL) {
      if (originalQueryWithTimeout) {
        const result = await originalQueryWithTimeout(sql, params, options);
        const firstRow = Array.isArray(result?.rows) ? result.rows[0] : null;
        if (isRecord(firstRow) &&
            firstRow.schemaVersion ===
              PREFLIGHT_CRITICAL_PATH_SNAPSHOT_SCHEMA_VERSION) {
          return result;
        }
      }
      return {
        rows: [buildPreflightCriticalPathSnapshotPayload(adapted)],
      };
    }

    if (normalizedSql === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
        normalizedSql.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
      if (originalQueryWithTimeout) {
        const result = await originalQueryWithTimeout(sql, params, options);
        if (hasValidServiceDiscoveryResult(result)) {
          return result;
        }
      }
      return {
        rows: [buildServiceDiscoverySnapshot(adapted)],
      };
    }

    if (originalQueryWithTimeout) {
      return originalQueryWithTimeout(sql, params, options);
    }
    return adapted.query(sql, params);
  };
  if (typeof adapted.getReachabilityDiagnostics !== 'function') {
    adapted.getReachabilityDiagnostics = async () => {
      try {
        await adapted.queryWithTimeout(PROBE_SQL, [], {
          timeoutMs: DEFAULT_PROBE_TIMEOUT_MS,
        });
        return {
          nodeId: adapted.id,
          reachable: true,
          adminReady: true,
        };
      } catch (error) {
        return {
          nodeId: adapted.id,
          reachable: false,
          adminReady: false,
          lastError: String(error?.message || error),
        };
      }
    };
  }
  return adapted;
}

function asNodeHandles(nodes) {
  const adaptedNodes = nodes.map((node) => asNodeHandle(node));
  const allNodeIds = adaptedNodes.map(
    (node) => String(node.id || 'unknown'),
  );
  for (const node of adaptedNodes) {
    if (!Array.isArray(node._discoveryNodeIds)) {
      node._discoveryNodeIds = allNodeIds;
    }
    node._clusterNodeIds = allNodeIds;
  }
  return adaptedNodes;
}

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
  const preflightSnapshotOverrides =
    options.preflightSnapshotOverrides &&
    typeof options.preflightSnapshotOverrides === 'object' ?
      options.preflightSnapshotOverrides :
      {};
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
          rows: [buildPreflightCriticalPathSnapshotPayload(
            this,
            preflightSnapshotOverrides,
          )],
        };
      }
      if (statement === NODE_CLIENT_CONTROL_SNAPSHOT_SQL ||
          statement === NODE_CLIENT_CONTROL_SNAPSHOT_FORCE_REPAIR_SQL) {
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

export {
  describe,
  it,
  assert,
  mkdtemp,
  rm,
  join,
  tmpdir,
  run,
  runWithVirtualScenarioTiming,
  createVirtualScenarioTiming,
  installVirtualScenarioTiming,
  resolveBenchmarkConfig,
  buildComparison,
  NODE_CLIENT_CONTROL_SNAPSHOT_FORCE_REPAIR_SQL,
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
  buildVersionedStrictReadinessCluster,
};
