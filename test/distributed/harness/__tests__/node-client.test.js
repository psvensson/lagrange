import assert from 'node:assert/strict';
import {test} from '../../../../src/test-helpers/tap.js';
import {NodeClient} from '../node-client.js';
import {NODE_CLIENT_CONTROL_SNAPSHOT_SQL} from '../constants.js';

const ZERO = 0;
const ONE = 1;
const DEFAULT_LOAD_TIMEOUT_MS = 2000;
const DEFAULT_CONTROL_TIMEOUT_MS = 15000;
const DEFAULT_SNAPSHOT_TIMEOUT_MS = 2000;

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
            },
          }],
        },
      ],
    });
    const client = new NodeClient();

    await client.queryLoad(recorder.node, 'SELECT 1');
    await client.queryControl(recorder.node, 'SELECT 2');
    await client.probeReadiness(recorder.node, 'preflight');
    await client.fetchControlSnapshot(recorder.node);

    const calls = recorder.getRecordedQueryCalls();
    assert.equal(calls.length, 3, 'expected load/control/snapshot query calls');
    assert.equal(calls[0].sql, 'SELECT 1');
    assert.equal(calls[0].queryOptions.timeoutMs, DEFAULT_LOAD_TIMEOUT_MS);
    assert.equal(calls[1].sql, 'SELECT 2');
    assert.equal(calls[1].queryOptions.timeoutMs, DEFAULT_CONTROL_TIMEOUT_MS);
    assert.equal(calls[2].queryOptions.timeoutMs, DEFAULT_SNAPSHOT_TIMEOUT_MS);
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
    replicaOperations: {
      inFlightCount: 0,
      statusHistogram: {},
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
