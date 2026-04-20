import assert from 'node:assert/strict';
import {test} from '../../../../src/test-helpers/tap.js';
import {NodeClient} from '../node-client.js';
import {
  NODE_CLIENT_CONTROL_SNAPSHOT_FORCE_REPAIR_SQL,
  NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
  NODE_CLIENT_CONTEXT_KEYS,
  NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
  NODE_CLIENT_SERVICE_DISCOVERY_SQL,
  NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
  NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
} from '../constants.js';

const ZERO = 0;
const ONE = 1;
const DEFAULT_LOAD_TIMEOUT_MS = 4000;
const DEFAULT_CONTROL_TIMEOUT_MS = 15000;
const DEFAULT_SNAPSHOT_TIMEOUT_MS = 15000;
const DISCOVERY_TABLE_BENCHMARK_EVENTS = 'benchmark_events';
const DISCOVERY_TABLE_ID_BENCHMARK_EVENTS = 'table-benchmark-events';

function createRecordingNode(options = {}) {
  const queryResponses = Array.isArray(options.queryResponses) ?
    [...options.queryResponses] :
    [];
  const recordedQueryCalls = [];
  let readinessCalls = 0;

  const node = {
    id: options.id || 'node-1',
    async queryWithTimeout(sql, params = [], queryOptions = {}) {
      recordedQueryCalls.push({
        sql,
        params,
        queryOptions,
      });
      if (queryResponses.length > ZERO) {
        const next = queryResponses.shift();
        if (next instanceof Error) {
          throw next;
        }
        if (typeof next === 'function') {
          return next(sql, params, queryOptions);
        }
        return next;
      }
      return {rows: []};
    },
    async getReachabilityDiagnostics() {
      readinessCalls += ONE;
      return {
        nodeId: options.id || 'node-1',
        reachable: true,
      };
    },
  };

  return {
    node,
    getRecordedQueryCalls: () => [...recordedQueryCalls],
    getReadinessCalls: () => readinessCalls,
  };
}

test('NodeClient routes load/control/probe/snapshot to expected NodeHandle methods',
  async () => {
    const recorder = createRecordingNode({
      queryResponses: [
        {rows: []},
        {rows: []},
        {
          rows: [{
            schemaVersion: 1,
            nodeId: 'node-1',
            capturedAt: 1,
            nodes: ['node-1'],
            partitions: [],
            leaders: {},
            replicaOperations: {
              inFlightCount: 0,
              statusHistogram: {},
              partitionGroupInFlight: {},
            },
          }],
        },
        {
          rows: [{
            schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
            nodeId: 'node-1',
            capturedAt: 1,
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
              health: 'healthy',
              nodeCount: 1,
              nodes: ['node-1'],
              replicas: [{
                endpointId: 'sys-postgres-wire-ep-node-1',
                serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
                nodeId: 'node-1',
                address: '127.0.0.1',
                port: 5432,
                healthStatus: 'healthy',
                updatedAt: 1,
                metadata: {},
              }],
            }],
          }],
        },
      ],
    });
    const client = new NodeClient();

    await client.queryLoad(recorder.node, 'SELECT 1');
    await client.queryControl(recorder.node, 'SELECT 2');
    await client.probeReadiness(recorder.node, 'preflight');
    await client.fetchControlSnapshot(recorder.node);
    await client.fetchServiceDiscovery(recorder.node);

    const calls = recorder.getRecordedQueryCalls();
    assert.equal(calls.length, 4, 'expected load/control/snapshot query calls');
    assert.equal(calls[0].sql, 'SELECT 1');
    assert.equal(calls[0].queryOptions.timeoutMs, DEFAULT_LOAD_TIMEOUT_MS);
    assert.equal(calls[0].queryOptions.lane, 'load');
    assert.equal(calls[1].sql, 'SELECT 2');
    assert.equal(calls[1].queryOptions.timeoutMs, DEFAULT_CONTROL_TIMEOUT_MS);
    assert.equal(calls[1].queryOptions.lane, 'control');
    assert.equal(calls[2].sql, NODE_CLIENT_CONTROL_SNAPSHOT_SQL);
    assert.equal(calls[2].queryOptions.timeoutMs, DEFAULT_SNAPSHOT_TIMEOUT_MS);
    assert.equal(calls[2].queryOptions.lane, 'snapshot');
    assert.equal(calls[3].sql, NODE_CLIENT_SERVICE_DISCOVERY_SQL);
    assert.equal(calls[3].queryOptions.timeoutMs, DEFAULT_SNAPSHOT_TIMEOUT_MS);
    assert.equal(calls[3].queryOptions.lane, 'snapshot');
    assert.equal(recorder.getReadinessCalls(), ONE);
  });

test('NodeClient fetchControlSnapshot uses local snapshot query path only', async () => {
  const expectedSnapshot = {
    schemaVersion: 1,
    nodeId: 'node-local',
    capturedAt: 1,
    nodes: ['node-local'],
    partitions: [],
    leaders: {},
    snapshotRevision: 22,
    snapshotRevisionState: 'stale_usable',
    snapshotExpectedMinimumRevision: 24,
    snapshotRevisionGap: 2,
    snapshotResumeToken: 'control-plane-revision:captured_at:22',
    cdcTelemetry: {
      subscriberCount: 2,
      bufferedEvents: 0,
      catchupLagEvents: 0,
      authoritativeFallback: {
        totalCount: 3,
        windowCount: 1,
      },
    },
    replicaOperations: {
      inFlightCount: 0,
      statusHistogram: {},
      partitionGroupInFlight: {},
      rows: [{
        operationId: 'replace-1',
        partitionId: 'nodes-p1',
        type: 'REPLACE',
        status: 'active',
        workflowStep: 'ACTIVE',
        sourceNodeId: 'seed-node',
        targetNodeId: 'node-2',
        replicaId: 'nodes-p1-r4',
      }],
      operationTimelineById: {
        'op-1': [{
          eventType: 'state',
          step: 'CREATE_REPLICA',
          status: 'creating',
          timestampMs: 1234,
          inFlight: true,
        }],
      },
    },
  };
  let localSnapshotCalls = ZERO;
  let distributedFanoutCalls = ZERO;
  const node = {
    id: 'node-local',
    async queryWithTimeout(sql, _params, _queryOptions) {
      localSnapshotCalls += ONE;
      assert.equal(sql, NODE_CLIENT_CONTROL_SNAPSHOT_SQL);
      return {
        rows: [expectedSnapshot],
      };
    },
    async query(_sql) {
      distributedFanoutCalls += ONE;
      throw new Error('distributed query must not be used for local snapshot');
    },
    async getReachabilityDiagnostics() {
      return {reachable: true};
    },
  };
  const client = new NodeClient();

  const snapshot = await client.fetchControlSnapshot(node);

  assert.equal(localSnapshotCalls, ONE);
  assert.equal(distributedFanoutCalls, ZERO);
  assert.deepEqual(snapshot, expectedSnapshot);
});

test('NodeClient fetchControlSnapshot supports forced authoritative repair context',
  async () => {
    const node = {
      id: 'node-local',
      async queryWithTimeout(sql) {
        assert.equal(sql, NODE_CLIENT_CONTROL_SNAPSHOT_FORCE_REPAIR_SQL);
        return {
          rows: [{
            schemaVersion: 1,
            nodeId: 'node-local',
            capturedAt: 1,
            nodes: ['node-local'],
            partitions: [],
            leaders: {},
            replicaOperations: {
              inFlightCount: 0,
              statusHistogram: {},
              partitionGroupInFlight: {},
            },
          }],
        };
      },
      async getReachabilityDiagnostics() {
        return {reachable: true};
      },
    };
    const client = new NodeClient();

    await client.fetchControlSnapshot(node, {
      [NODE_CLIENT_CONTEXT_KEYS.FORCE_AUTHORITATIVE_REPAIR]: true,
    });
  });

test('NodeClient fetchControlSnapshot validates snapshot schema version', async () => {
  const node = {
    id: 'node-local',
    async queryWithTimeout() {
      return {
        rows: [{
          schemaVersion: 999,
          nodeId: 'node-local',
          capturedAt: 1,
          nodes: [],
          partitions: [],
          leaders: {},
          replicaOperations: {
            inFlightCount: 0,
            statusHistogram: {},
            partitionGroupInFlight: {},
          },
        }],
      };
    },
    async getReachabilityDiagnostics() {
      return {reachable: true};
    },
  };
  const client = new NodeClient();

  await assert.rejects(
    client.fetchControlSnapshot(node),
    (error) => {
      assert.equal(error.channel, 'snapshot');
      assert.equal(error.operation, 'fetchControlSnapshot');
      assert.match(error.message, /schemaVersion/i);
      return true;
    },
  );
});

test('NodeClient fetchControlSnapshot requires query_result rows envelope',
  async () => {
    const node = {
      id: 'node-local',
      async queryWithTimeout() {
        return {
          schemaVersion: 1,
          nodeId: 'node-local',
          capturedAt: 1,
          nodes: ['node-local'],
          partitions: [],
          leaders: {},
          replicaOperations: {
            inFlightCount: 0,
            statusHistogram: {},
            partitionGroupInFlight: {},
          },
        };
      },
      async getReachabilityDiagnostics() {
        return {reachable: true};
      },
    };
    const client = new NodeClient();

    await assert.rejects(
      client.fetchControlSnapshot(node),
      (error) => {
        assert.equal(error.channel, 'snapshot');
        assert.equal(error.operation, 'fetchControlSnapshot');
        assert.match(error.message, /row payload/i);
        return true;
      },
    );
  });

test('NodeClient fetchServiceDiscovery uses local discovery query path only',
  async () => {
    const expectedDiscovery = {
      schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
      nodeId: 'node-local',
      capturedAt: 1,
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
        health: 'healthy',
        nodeCount: 1,
        nodes: ['node-local'],
        replicas: [{
          endpointId: 'sys-postgres-wire-ep-node-local',
          serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
          nodeId: 'node-local',
          address: '127.0.0.1',
          port: 5432,
          healthStatus: 'healthy',
          updatedAt: 1,
          metadata: {},
        }],
      }],
    };
    let localDiscoveryCalls = ZERO;
    let distributedFanoutCalls = ZERO;
    const node = {
      id: 'node-local',
      async queryWithTimeout(sql, _params, _queryOptions) {
        localDiscoveryCalls += ONE;
        assert.equal(sql, NODE_CLIENT_SERVICE_DISCOVERY_SQL);
        return {
          rows: [expectedDiscovery],
        };
      },
      async query(_sql) {
        distributedFanoutCalls += ONE;
        throw new Error('distributed query must not be used for local discovery');
      },
      async getReachabilityDiagnostics() {
        return {reachable: true};
      },
    };
    const client = new NodeClient();

    const discovery = await client.fetchServiceDiscovery(node);

    assert.equal(localDiscoveryCalls, ONE);
    assert.equal(distributedFanoutCalls, ZERO);
    assert.deepEqual(discovery, expectedDiscovery);
  });

test('NodeClient fetchServiceDiscovery requires query_result rows envelope',
  async () => {
    const node = {
      id: 'node-local',
      async queryWithTimeout() {
        return {
          schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
          nodeId: 'node-local',
          capturedAt: 1,
          serviceCount: 0,
          replicaCount: 0,
          services: [],
        };
      },
      async getReachabilityDiagnostics() {
        return {reachable: true};
      },
    };
    const client = new NodeClient();

    await assert.rejects(
      client.fetchServiceDiscovery(node),
      (error) => {
        assert.equal(error.channel, 'snapshot');
        assert.equal(error.operation, 'fetchServiceDiscovery');
        assert.match(error.message, /row payload/i);
        return true;
      },
    );
  });

test('NodeClient fetchServiceDiscovery validates snapshot schema version',
  async () => {
    const node = {
      id: 'node-local',
      async queryWithTimeout() {
        return {
          rows: [{
            schemaVersion: 999,
            nodeId: 'node-local',
            capturedAt: 1,
            serviceCount: 0,
            replicaCount: 0,
            services: [],
          }],
        };
      },
      async getReachabilityDiagnostics() {
        return {reachable: true};
      },
    };
    const client = new NodeClient();

    await assert.rejects(
      client.fetchServiceDiscovery(node),
      (error) => {
        assert.equal(error.channel, 'snapshot');
        assert.equal(error.operation, 'fetchServiceDiscovery');
        assert.match(error.message, /schemaVersion/i);
        return true;
      },
    );
  });

test('NodeClient fetchServiceDiscovery supports table-scoped readiness queries',
  async () => {
    let capturedSql = '';
    const node = {
      id: 'node-local',
      async queryWithTimeout(sql) {
        capturedSql = String(sql);
        return {
          rows: [{
            schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
            nodeId: 'node-local',
            capturedAt: 1,
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
              nodes: ['node-local'],
              replicas: [{
                endpointId: 'sys-postgres-wire-ep-node-local',
                serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
                nodeId: 'node-local',
                address: '127.0.0.1',
                port: 5432,
                healthStatus: 'healthy',
                updatedAt: 1,
                metadata: {},
                readiness: {
                  workloadReady: true,
                  routingReady: true,
                  schemaReady: true,
                  topologyReady: true,
                  benchmarkReady: true,
                  replicaOpsInFlight: 0,
                  leadershipStable: true,
                  tableName: DISCOVERY_TABLE_BENCHMARK_EVENTS,
                  reasons: [],
                },
              }],
            }],
          }],
        };
      },
      async getReachabilityDiagnostics() {
        return {reachable: true};
      },
    };

    const client = new NodeClient();
    const discovery = await client.fetchServiceDiscovery(node, {
      tableName: DISCOVERY_TABLE_BENCHMARK_EVENTS,
      requireReadiness: true,
    });
    assert.equal(
      capturedSql,
      'SELECT * FROM service_discovery_local(\'' +
        DISCOVERY_TABLE_BENCHMARK_EVENTS +
        '\')',
      'expected table-scoped local discovery SQL',
    );
    assert.equal(
      discovery.services[0].replicas[0].readiness.schemaReady,
      true,
    );
  });

test('NodeClient fetchServiceDiscovery supports table-id discovery hints',
  async () => {
    let capturedSql = '';
    const node = {
      id: 'node-local',
      async queryWithTimeout(sql) {
        capturedSql = String(sql);
        return {
          rows: [{
            schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
            nodeId: 'node-local',
            capturedAt: 1,
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
              nodes: ['node-local'],
              replicas: [{
                endpointId: 'sys-postgres-wire-ep-node-local',
                serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
                nodeId: 'node-local',
                address: '127.0.0.1',
                port: 5432,
                healthStatus: 'healthy',
                updatedAt: 1,
                metadata: {},
                readiness: {
                  workloadReady: true,
                  routingReady: true,
                  schemaReady: true,
                  topologyReady: true,
                  benchmarkReady: true,
                  replicaOpsInFlight: 0,
                  leadershipStable: true,
                  tableName: DISCOVERY_TABLE_BENCHMARK_EVENTS,
                  reasons: [],
                },
              }],
            }],
          }],
        };
      },
      async getReachabilityDiagnostics() {
        return {reachable: true};
      },
    };

    const client = new NodeClient();
    await client.fetchServiceDiscovery(node, {
      tableName: DISCOVERY_TABLE_BENCHMARK_EVENTS,
      tableId: DISCOVERY_TABLE_ID_BENCHMARK_EVENTS,
      requireReadiness: true,
    });

    assert.equal(
      capturedSql,
      'SELECT * FROM service_discovery_local(\'' +
        DISCOVERY_TABLE_BENCHMARK_EVENTS +
        '\', \'' +
        DISCOVERY_TABLE_ID_BENCHMARK_EVENTS +
        '\')',
      'expected table-scoped local discovery SQL with table-id hint',
    );
  });

test('NodeClient fetchServiceDiscovery fails closed when readiness is required',
  async () => {
    const node = {
      id: 'node-local',
      async queryWithTimeout() {
        return {
          rows: [{
            schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
            nodeId: 'node-local',
            capturedAt: 1,
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
              nodes: ['node-local'],
              replicas: [{
                endpointId: 'sys-postgres-wire-ep-node-local',
                serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
                nodeId: 'node-local',
                address: '127.0.0.1',
                port: 5432,
                healthStatus: 'healthy',
                updatedAt: 1,
                metadata: {},
              }],
            }],
          }],
        };
      },
      async getReachabilityDiagnostics() {
        return {reachable: true};
      },
    };

    const client = new NodeClient();
    await assert.rejects(
      client.fetchServiceDiscovery(node, {
        requireReadiness: true,
      }),
      /readiness/i,
    );
  });

test('NodeClient fetchServiceDiscovery requires canonical benchmark readiness fields',
  async () => {
    const node = {
      id: 'node-local',
      async queryWithTimeout() {
        return {
          rows: [{
            schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
            nodeId: 'node-local',
            capturedAt: 1,
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
              nodes: ['node-local'],
              replicas: [{
                endpointId: 'sys-postgres-wire-ep-node-local',
                serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
                nodeId: 'node-local',
                address: '127.0.0.1',
                port: 5432,
                healthStatus: 'healthy',
                updatedAt: 1,
                metadata: {},
                readiness: {
                  workloadReady: true,
                  routingReady: true,
                  schemaReady: true,
                  replicaOpsInFlight: 0,
                  leadershipStable: true,
                  tableName: DISCOVERY_TABLE_BENCHMARK_EVENTS,
                  reasons: [],
                },
              }],
            }],
          }],
        };
      },
      async getReachabilityDiagnostics() {
        return {reachable: true};
      },
    };

    const client = new NodeClient();
    await assert.rejects(
      client.fetchServiceDiscovery(node, {
        requireReadiness: true,
      }),
      /benchmarkReady|topologyReady/i,
    );
  });

test('NodeClient normalizes errors with node/channel/operation/timeout metadata',
  async () => {
    const recorder = createRecordingNode({
      id: 'node-x',
      queryResponses: [new Error('operation timed out')],
    });
    const client = new NodeClient();

    await assert.rejects(
      client.queryLoad(recorder.node, 'SELECT fail'),
      (error) => {
        assert.equal(error.nodeId, 'node-x');
        assert.equal(error.channel, 'load');
        assert.equal(error.operation, 'queryLoad');
        assert.equal(error.timeoutClass, 'timeout');
        return true;
      },
    );
  });

test('NodeClient keeps load and control timeout policies independent', async () => {
  const recorder = createRecordingNode();
  const client = new NodeClient();

  await client.queryLoad(recorder.node, 'SELECT load');
  await client.queryControl(recorder.node, 'SELECT control');

  const calls = recorder.getRecordedQueryCalls();
  assert.equal(calls.length, 2);
  assert.equal(calls[0].queryOptions.timeoutMs, DEFAULT_LOAD_TIMEOUT_MS);
  assert.equal(calls[1].queryOptions.timeoutMs, DEFAULT_CONTROL_TIMEOUT_MS);
  assert.notEqual(
    calls[0].queryOptions.timeoutMs,
    calls[1].queryOptions.timeoutMs,
    'load timeout must remain independent from control timeout',
  );
});

test('NodeClient allows per-request retry budget override on control lane',
  async () => {
    let controlCallCount = ZERO;
    const node = {
      id: 'node-retry-override',
      async queryWithTimeout(sql) {
        if (sql !== 'SELECT control') {
          return {rows: []};
        }
        controlCallCount += ONE;
        if (controlCallCount === ONE) {
          throw new Error('transient control failure');
        }
        return {rows: [{ok: true}]};
      },
      async getReachabilityDiagnostics() {
        return {reachable: true};
      },
    };
    const client = new NodeClient();

    await assert.rejects(
      client.queryControl(
        node,
        'SELECT control',
        [],
        {
          [NODE_CLIENT_CONTEXT_KEYS.RETRY_BUDGET]: 0,
        },
      ),
      /transient control failure/i,
    );
    assert.equal(
      controlCallCount,
      ONE,
      'retry override should prevent automatic control retries',
    );
  });

test('NodeClient applies benchmark config overrides to channel policies', async () => {
  const recorder = createRecordingNode();
  const client = new NodeClient({
    benchmarkConfig: {
      loadQueryTimeoutMs: 321,
      controlQueryTimeoutMs: 9123,
      loadNodeMaxInFlight: 1,
      nodeFailureThreshold: 5,
      nodeFailureCooldownMs: 444,
    },
  });

  await client.queryLoad(recorder.node, 'SELECT load');
  await client.queryControl(recorder.node, 'SELECT control');

  const calls = recorder.getRecordedQueryCalls();
  assert.equal(calls[0].queryOptions.timeoutMs, 321);
  assert.equal(calls[1].queryOptions.timeoutMs, 9123);

  const policies = client.getPolicySnapshot();
  assert.equal(policies.load.maxInFlightPerNode, 1);
  assert.equal(policies.load.circuitBreakerThreshold, 5);
  assert.equal(policies.load.cooldownMs, 444);
  assert.equal(
    policies.snapshot.timeoutMs,
    9123,
    'snapshot timeout should track control timeout benchmark override',
  );
});

test('NodeClient load bulkhead prevents stalled node from consuming all load slots',
  async () => {
    let resolveFirstQuery;
    let queryCalls = ZERO;
    const node = {
      id: 'stalled-node',
      async queryWithTimeout() {
        queryCalls += ONE;
        if (queryCalls === ONE) {
          return new Promise((resolve) => {
            resolveFirstQuery = resolve;
          });
        }
        return {rows: []};
      },
      async getReachabilityDiagnostics() {
        return {reachable: true};
      },
    };

    const client = new NodeClient({
      channelPolicies: {
        load: {
          maxInFlightPerNode: 1,
          retryBudget: 0,
        },
      },
    });

    const firstCall = client.queryLoad(node, 'SELECT first');
    await Promise.resolve();

    await assert.rejects(
      client.queryLoad(node, 'SELECT second'),
      (error) => {
        assert.equal(error.code, 'budget_exhausted');
        assert.equal(error.channel, 'load');
        return true;
      },
    );

    resolveFirstQuery({rows: []});
    await firstCall;
    assert.equal(queryCalls, ONE, 'second call should not execute on the node');
  });

test('NodeClient isolates load lane when control lane is saturated', async () => {
  let releaseControl;
  let loadCalls = ZERO;
  const node = {
    id: 'node-lane-isolation',
    async queryWithTimeout(_sql, _params, queryOptions = {}) {
      if (queryOptions.lane === 'control') {
        return new Promise((resolve) => {
          releaseControl = resolve;
        });
      }
      if (queryOptions.lane === 'load') {
        loadCalls += ONE;
        return {rows: [{ok: true}]};
      }
      return {rows: []};
    },
    async getReachabilityDiagnostics() {
      return {reachable: true};
    },
  };

  const client = new NodeClient({
    channelPolicies: {
      control: {
        maxInFlightPerNode: 1,
        retryBudget: 0,
      },
      load: {
        maxInFlightPerNode: 1,
        retryBudget: 0,
      },
    },
  });

  const controlCall = client.queryControl(node, 'SELECT control');
  await Promise.resolve();
  const loadResult = await client.queryLoad(node, 'SELECT load');
  assert.equal(loadResult.rows[0].ok, true);
  assert.equal(loadCalls, ONE, 'load lane should continue while control is saturated');

  releaseControl({rows: [{ok: true}]});
  await controlCall;
});

test('NodeClient isolates snapshot lane when load lane is saturated', async () => {
  let releaseLoad;
  let snapshotCalls = ZERO;
  const node = {
    id: 'node-snapshot-lane',
    async queryWithTimeout(sql, _params, queryOptions = {}) {
      if (queryOptions.lane === 'load') {
        return new Promise((resolve) => {
          releaseLoad = resolve;
        });
      }
      if (queryOptions.lane === 'snapshot' &&
          sql === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
        snapshotCalls += ONE;
        return {
          rows: [{
            schemaVersion: 1,
            nodeId: 'node-snapshot-lane',
            capturedAt: 1,
            nodes: ['node-snapshot-lane'],
            partitions: ['p1'],
            leaders: {p1: 'node-snapshot-lane'},
            replicaOperations: {
              inFlightCount: 0,
              statusHistogram: {},
              partitionGroupInFlight: {},
            },
          }],
        };
      }
      return {rows: []};
    },
    async getReachabilityDiagnostics() {
      return {reachable: true};
    },
  };

  const client = new NodeClient({
    channelPolicies: {
      load: {
        maxInFlightPerNode: 1,
        retryBudget: 0,
      },
      snapshot: {
        maxInFlightPerNode: 1,
        retryBudget: 0,
      },
    },
  });

  const loadCall = client.queryLoad(node, 'SELECT load');
  await Promise.resolve();
  const snapshot = await client.fetchControlSnapshot(node);
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshotCalls, ONE, 'snapshot lane should continue while load is saturated');

  releaseLoad({rows: []});
  await loadCall;
});

test('NodeClient isolates control channel breaker state from load failures',
  async () => {
    let loadCallCount = ZERO;
    let controlCallCount = ZERO;
    const node = {
      id: 'node-breaker',
      async queryWithTimeout(sql) {
        if (sql === 'SELECT load') {
          loadCallCount += ONE;
          throw new Error('load channel timed out');
        }
        if (sql === 'SELECT control') {
          controlCallCount += ONE;
          return {rows: [{ok: true}]};
        }
        return {rows: []};
      },
      async getReachabilityDiagnostics() {
        return {reachable: true};
      },
    };

    const client = new NodeClient({
      channelPolicies: {
        load: {
          circuitBreakerThreshold: 1,
          cooldownMs: 1000,
          retryBudget: 0,
        },
      },
    });

    await assert.rejects(client.queryLoad(node, 'SELECT load'));
    await assert.rejects(
      client.queryLoad(node, 'SELECT load'),
      (error) => {
        assert.equal(error.code, 'circuit_open');
        assert.equal(error.channel, 'load');
        return true;
      },
    );

    const controlResult = await client.queryControl(node, 'SELECT control');
    assert.equal(controlResult.rows[0].ok, true);
    assert.equal(loadCallCount, ONE, 'breaker-open load call should be short-circuited');
    assert.equal(controlCallCount, ONE, 'control channel must remain healthy');
  });

test('NodeClient suppresses breaker opens for transient control errors',
  async () => {
    let controlCallCount = ZERO;
    const node = {
      id: 'node-transient-control',
      async queryWithTimeout(sql) {
        if (sql !== 'SELECT control') {
          return {rows: []};
        }
        controlCallCount += ONE;
        if (controlCallCount === ONE) {
          throw new Error('Table not found: benchmark_events');
        }
        return {rows: [{ok: true}]};
      },
      async getReachabilityDiagnostics() {
        return {reachable: true};
      },
    };

    const client = new NodeClient({
      channelPolicies: {
        control: {
          circuitBreakerThreshold: 1,
          cooldownMs: 1000,
          retryBudget: 0,
        },
      },
    });

    await assert.rejects(
      client.queryControl(
        node,
        'SELECT control',
        [],
        {
          [NODE_CLIENT_CONTEXT_KEYS.TOLERATE_TRANSIENT_ERRORS]: true,
        },
      ),
      /Table not found/i,
    );
    const result = await client.queryControl(
      node,
      'SELECT control',
      [],
      {
        [NODE_CLIENT_CONTEXT_KEYS.TOLERATE_TRANSIENT_ERRORS]: true,
      },
    );
    assert.equal(result.rows[0].ok, true);
    assert.equal(
      controlCallCount,
      2,
      'transient control failures should not trigger breaker short-circuit',
    );
  });

test(
  'NodeClient suppresses breaker opens for transient distributed participant failures',
  async () => {
    let controlCallCount = ZERO;
    const node = {
      id: 'node-transient-participant-failure',
      async queryWithTimeout(sql) {
        if (sql !== 'SELECT control') {
          return {rows: []};
        }
        controlCallCount += ONE;
        if (controlCallCount === ONE) {
          throw new Error('Distributed operation failed due to participant failures');
        }
        return {rows: [{ok: true}]};
      },
      async getReachabilityDiagnostics() {
        return {reachable: true};
      },
    };

    const client = new NodeClient({
      channelPolicies: {
        control: {
          circuitBreakerThreshold: 1,
          cooldownMs: 1000,
          retryBudget: 0,
        },
      },
    });

    await assert.rejects(
      client.queryControl(
        node,
        'SELECT control',
        [],
        {
          [NODE_CLIENT_CONTEXT_KEYS.TOLERATE_TRANSIENT_ERRORS]: true,
        },
      ),
      /participant failures/i,
    );
    const result = await client.queryControl(
      node,
      'SELECT control',
      [],
      {
        [NODE_CLIENT_CONTEXT_KEYS.TOLERATE_TRANSIENT_ERRORS]: true,
      },
    );
    assert.equal(result.rows[0].ok, true);
    assert.equal(
      controlCallCount,
      2,
      'transient participant failures should not trigger breaker short-circuit',
    );
  },
);

test('NodeClient tracks timeout budget mismatches for probe responses', async () => {
  const node = {
    id: 'probe-budget-node',
    async queryWithTimeout() {
      return {rows: []};
    },
    async getReachabilityDiagnostics() {
      return {
        reachable: true,
        probeTimeoutMs: 999,
      };
    },
  };

  const client = new NodeClient();
  await client.probeReadiness(node, 'preflight', {timeoutMs: 100});

  const metrics = client.getMetricsSnapshot();
  assert.equal(
    metrics.probe.timeoutBudgetMismatches,
    ONE,
    'probe timeout budget mismatch should be counted',
  );
});

test('NodeClient tracks timed-out operations still in-flight', async () => {
  const node = {
    id: 'probe-timeout-node',
    async queryWithTimeout() {
      return {rows: []};
    },
    async getReachabilityDiagnostics() {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({reachable: true});
        }, 1000);
      });
    },
  };

  const client = new NodeClient();
  await assert.rejects(
    client.probeReadiness(node, 'preflight', {timeoutMs: 25}),
    /timed out/i,
  );

  const metrics = client.getMetricsSnapshot();
  assert.equal(metrics.probe.timeouts, ONE);
  assert.equal(
    metrics.probe.timedOutInFlight,
    ONE,
    'timed-out while in-flight counter should be incremented',
  );
});

test('NodeClient isolates load-lane probes from load channel breaker state', async () => {
  let loadLaneCallCount = ZERO;
  const node = {
    id: 'load-probe-isolation-node',
    async queryWithTimeout(_sql, _params, options = {}) {
      const lane = String(options?.lane || '');
      if (lane === 'load') {
        loadLaneCallCount += ONE;
        if (loadLaneCallCount === ONE) {
          throw new Error('Admin API query timed out for load probe');
        }
      }
      return {rows: [{ok: true}]};
    },
    async getReachabilityDiagnostics() {
      return {reachable: true};
    },
  };

  const client = new NodeClient({
    channelPolicies: {
      load: {
        circuitBreakerThreshold: 1,
        cooldownMs: 1000,
        retryBudget: 0,
      },
      probe: {
        circuitBreakerThreshold: 1,
        cooldownMs: 1000,
        retryBudget: 0,
      },
    },
  });

  await assert.rejects(
    client.queryLoadProbe(node, 'SELECT 1'),
    /timed out/i,
  );
  const loadResult = await client.queryLoad(node, 'SELECT 1');
  assert.equal(loadResult.rows[0].ok, true);
  await assert.rejects(
    client.queryLoadProbe(node, 'SELECT 1'),
    (error) => error?.code === 'circuit_open',
  );

  const metrics = client.getMetricsSnapshot();
  assert.equal(
    metrics.probe.breakerOpens,
    ONE,
    'probe channel should open its own breaker after probe timeout',
  );
  assert.equal(
    metrics.load.successes,
    ONE,
    'load channel should remain healthy after probe-only breaker open',
  );

  const channelState = client.getChannelStateSnapshot();
  assert.equal(
    channelState.probe['load-probe-isolation-node'].circuitOpen,
    true,
    'probe breaker state should be visible in snapshot',
  );
  assert.equal(
    channelState.load?.['load-probe-isolation-node']?.circuitOpen || false,
    false,
    'load breaker state should remain closed',
  );
});
