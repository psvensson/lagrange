import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {run} from '../../scenarios/public-path-multinode-baseline.js';
import {
  DATASET_GENERATOR,
  expectedAccountSummary,
  generateDatasetRows,
} from '../../scenarios/public-path-baseline-helpers.js';
import {
  createInvocationIdentity,
} from '../../../../src/service/request-cell-routing-contract.js';
import {REQUEST_CELL_AUTH} from '../constants.js';

// Module-load captures — the harness tree's ambient-intrinsics rule.
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const arrayMap = Function.call.bind(Array.prototype.map);

const RUN_ID = 'public-path-baseline-unit';
const INVOCATION_COUNT = 4;
const PARTITION_COUNT = 2;
const BUILD_DIGEST = `sha256:${'a'.repeat(64)}`;
const CHILD_CALL_SUFFIX = '#call-1';
const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 503;
const SHORT_SPLIT_TIMEOUT_MS = 50;
const SQLITE_METRIC_TAG = 'metrics.partition.sqlite';
const LOCAL_SELECT_SAMPLES_PER_NODE = 4;

const SPREAD_PARTITION_ROWS = Object.freeze([
  {leader_node_id: 'node-1', partition_id: 'p-1', state: 'active'},
  {leader_node_id: 'node-2', partition_id: 'p-2', state: 'active'},
]);
const SINGLE_HOST_PARTITION_ROWS = Object.freeze([
  {leader_node_id: 'node-1', partition_id: 'p-1', state: 'active'},
  {leader_node_id: 'node-1', partition_id: 'p-2', state: 'active'},
]);

function childInvocationIds() {
  const ids = [];
  for (let index = 0; index < INVOCATION_COUNT; index += 1) {
    ids.push(createInvocationIdentity(
      REQUEST_CELL_AUTH.DATABASE, `${RUN_ID}-inv-${index}`,
    ) + CHILD_CALL_SUFFIX);
  }
  return ids;
}

function buildQueryHandler(state) {
  return async (sql) => {
    if (stringStartsWith(sql, 'CREATE TABLE') ||
        stringStartsWith(sql, 'INSERT') ||
        stringStartsWith(sql, 'UPDATE tables')) {
      return {rows: []};
    }
    if (stringStartsWith(sql, 'SELECT table_id FROM tables')) {
      return {rows: [{table_id: 'tbl-1'}]};
    }
    if (stringStartsWith(sql, 'SELECT table_policies FROM tables')) {
      return {rows: [{
        table_policies: JSON.stringify({splitStorageThreshold: 16384}),
      }]};
    }
    if (stringStartsWith(sql, 'SELECT partition_id, leader_node_id')) {
      return {rows: [...state.partitionRows]};
    }
    if (stringStartsWith(sql, 'SELECT binding_version_id')) {
      return {rows: [{
        binding_name: 'account-summary--call--summarize-account-activity',
        binding_version_id: 'bv-1',
      }]};
    }
    if (stringStartsWith(sql, 'SELECT service_id, runtime_kind')) {
      return {rows: [{
        binding_version_id: 'bv-1',
        runtime_kind: state.runtimeKind,
        service_id: 'svc-1',
      }]};
    }
    if (stringStartsWith(sql, 'SELECT invocation_id, slot_id')) {
      const rows = [];
      for (const childId of childInvocationIds()) {
        for (let slot = 0; slot < PARTITION_COUNT; slot += 1) {
          rows.push({
            invocation_id: childId,
            partial_json: '{"count:1":2,"total:1":100}',
            replica_id: `p-${slot + 1}-r1`,
            slot_id: slot,
          });
        }
      }
      return {rows};
    }
    if (stringStartsWith(sql, 'SELECT result_id')) {
      return {
        rows: arrayMap(childInvocationIds(), (childId) =>
          ({result_id: childId})),
      };
    }
    throw new Error(`unexpected stub query: ${sql}`);
  };
}

function buildFetchHandler(state) {
  const rows = generateDatasetRows();
  return async (url, options = {}) => {
    if (!options.headers?.authorization) {
      return {status: HTTP_UNAUTHORIZED, text: async () => 'denied'};
    }
    if (stringEndsWith(url, '/accounts/health')) {
      return {status: HTTP_OK, text: async () => '{"status":"ok"}'};
    }
    const {accountId} = JSON.parse(options.body);
    const summary =
      expectedAccountSummary(rows, accountId, PARTITION_COUNT);
    if (state.parityDrift) {
      summary.totalCents += 1;
    }
    return {status: HTTP_OK, text: async () => JSON.stringify(summary)};
  };
}

function buildLogEntries(nodeIds) {
  const entries = [];
  for (const nodeId of nodeIds) {
    for (let sample = 0; sample < LOCAL_SELECT_SAMPLES_PER_NODE;
      sample += 1) {
      entries.push({
        message: SQLITE_METRIC_TAG,
        metadata: {
          durationMs: 1,
          operation: 'SELECT',
          partitionId: `p-${(sample % PARTITION_COUNT) + 1}`,
          rowCount: DATASET_GENERATOR.rowCount / PARTITION_COUNT,
        },
        node_id: nodeId,
      });
    }
  }
  return entries;
}

function buildStubCluster(state) {
  const queryHandler = buildQueryHandler(state);
  const nodes = arrayMap(['node-1', 'node-2', 'node-3'], (id, index) => ({
    containerId: `container-${id}`,
    id,
    ip: `10.0.0.${index + 1}`,
    query: queryHandler,
    role: index === 0 ? 'seed' : 'member',
  }));
  let snapshotCall = 0;
  return {
    _scenarioOverrides: {
      publicPathBaseline: {
        fetchImpl: buildFetchHandler(state),
        invocationCount: INVOCATION_COUNT,
        logBuffer: () => buildLogEntries(state.localReadNodeIds),
        pipeline: {
          runBuild: async () => ({
            descriptor: {digest: BUILD_DIGEST},
            layoutPath:
              '/tmp/artifacts/public-path-baseline/.lagrange/layout',
          }),
          runDeploy: async () => ({packageId: 'pkg-1'}),
          runGenerate: async () => ({}),
        },
        prepareProject: async () => ({
          artifactsRoot: '/tmp/artifacts',
          projectDirectory: '/tmp/artifacts/public-path-baseline',
        }),
        readManifest: async () => ({
          artifact: {
            digest: BUILD_DIGEST,
            media_type: 'application/wasm',
          },
          runtime: {kind: 'wasm_component'},
        }),
        resourceSnapshot: async () => {
          snapshotCall += 1;
          return {
            cpuPercent: 10 + snapshotCall,
            memoryUsageBytes: 1_000_000 + snapshotCall,
            rxBytes: 100 * snapshotCall,
            txBytes: 200 * snapshotCall,
          };
        },
        runId: RUN_ID,
        sleep: async () => {},
        splitWaitTimeoutMs: state.splitWaitTimeoutMs,
      },
    },
    getNodes: () => nodes,
  };
}

function greenState() {
  return {
    localReadNodeIds: ['node-1', 'node-2'],
    parityDrift: false,
    partitionRows: SPREAD_PARTITION_ROWS,
    runtimeKind: 'wasm_component',
  };
}

describe('public-path-multinode-baseline scenario', () => {
  it('composes the schemaVersion-1 detail on a green run', async () => {
    const detail = await run(buildStubCluster(greenState()));

    assert.equal(detail.schemaVersion, 1);
    assert.match(detail.datasetDigest, /^[0-9a-f]{64}$/u);
    assert.match(detail.generatorDigest, /^[0-9a-f]{64}$/u);
    assert.equal(detail.topology.nodeCount, 3);
    assert.equal(detail.topology.distinctPartitionHosts, 2);
    assert.deepEqual(
      arrayMap(detail.topology.partitions, (entry) => entry.partitionId),
      ['p-1', 'p-2'],
    );
    assert.equal(detail.fidelity.runtimeKind, 'wasm_component');
    assert.equal(detail.fidelity.buildDigest, BUILD_DIGEST);
    assert.equal(detail.parity.invocations, INVOCATION_COUNT);
    assert.equal(detail.parity.mismatches, 0);
    assert.equal(detail.parity.oracle, 'independent-recompute');
    assert.equal(detail.localReadProof.distinctNodes, 2);
    assert.equal(detail.latencyMs.count, INVOCATION_COUNT);
    assert.ok(detail.bytes.finalBytes > 0);
    assert.ok(detail.bytes.partialBytes > 0);
    assert.equal(detail.retries.activationLeasesPublished, null);
    assert.equal(detail.retries.readyCellHits, null);
    assert.ok(detail.unavailableReasons.retries.length > 0);
    assert.equal(detail.resources.perNode.length, 3);
  });

  it('fails when the runtime kind is native_js', async () => {
    const state = greenState();
    state.runtimeKind = 'native_js';

    await assert.rejects(
      run(buildStubCluster(state)),
      /native_js/u,
    );
  });

  it('fails when all partition leaders share one host', async () => {
    const state = greenState();
    state.partitionRows = SINGLE_HOST_PARTITION_ROWS;
    state.splitWaitTimeoutMs = SHORT_SPLIT_TIMEOUT_MS;

    await assert.rejects(
      run(buildStubCluster(state)),
      /no cross-host partition spread/u,
    );
  });

  it('fails when a response diverges from the oracle', async () => {
    const state = greenState();
    state.parityDrift = true;

    await assert.rejects(
      run(buildStubCluster(state)),
      /parity violated/u,
    );
  });

  it('fails when local-read log evidence is missing', async () => {
    const state = greenState();
    state.localReadNodeIds = ['node-1'];

    await assert.rejects(
      run(buildStubCluster(state)),
      /local-read proof violated/u,
    );
  });
});
