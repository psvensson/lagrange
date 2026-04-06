import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  run,
} from '../../scenarios/seven-node-table-partition-distribution.js';

const SQL_FROM_PARTITIONS = 'FROM partitions';
const SQL_FROM_SERVICES = 'FROM services';
const SQL_FROM_TABLES = 'FROM tables';
const SQL_CREATE_TABLE_IF_NOT_EXISTS = 'CREATE TABLE IF NOT EXISTS';
const SQL_UPDATE_TABLE_POLICIES = 'UPDATE tables SET table_policies';
const LOAD_OPERATION_INSERT = 'INSERT';
const TABLE_POLICIES_JSON = JSON.stringify({
  splitStorageThreshold: 16384,
  splitTrafficThreshold: 120,
  mergeStorageThreshold: 1,
  mergeTrafficThreshold: 1,
});

function partitionRowsForStage(stage) {
  if (stage <= 1) {
    return [{partition_id: 'logs-p1'}];
  }
  if (stage === 2) {
    return [{partition_id: 'logs-p1'}, {partition_id: 'logs-p2'}];
  }
  return [
    {partition_id: 'logs-p1'},
    {partition_id: 'logs-p2'},
    {partition_id: 'logs-p3'},
  ];
}

function serviceRowsForStage(stage) {
  if (stage <= 1) {
    return [
      {partition_id: 'logs-p1', node_id: 'seed-1', status: 'active'},
      {partition_id: 'logs-p1', node_id: 'node-2', status: 'active'},
      {partition_id: 'logs-p1', node_id: 'node-3', status: 'active'},
    ];
  }
  if (stage === 2) {
    return [
      {partition_id: 'logs-p1', node_id: 'seed-1', status: 'active'},
      {partition_id: 'logs-p1', node_id: 'node-2', status: 'active'},
      {partition_id: 'logs-p1', node_id: 'node-3', status: 'active'},
      {partition_id: 'logs-p2', node_id: 'node-3', status: 'active'},
      {partition_id: 'logs-p2', node_id: 'node-4', status: 'active'},
      {partition_id: 'logs-p2', node_id: 'node-5', status: 'active'},
    ];
  }
  return [
    {partition_id: 'logs-p1', node_id: 'seed-1', status: 'active'},
    {partition_id: 'logs-p1', node_id: 'node-2', status: 'active'},
    {partition_id: 'logs-p1', node_id: 'node-3', status: 'active'},
    {partition_id: 'logs-p2', node_id: 'node-3', status: 'active'},
    {partition_id: 'logs-p2', node_id: 'node-4', status: 'active'},
    {partition_id: 'logs-p2', node_id: 'node-5', status: 'active'},
    {partition_id: 'logs-p3', node_id: 'node-5', status: 'active'},
    {partition_id: 'logs-p3', node_id: 'node-6', status: 'active'},
    {partition_id: 'logs-p3', node_id: 'node-7', status: 'active'},
  ];
}

describe('seven-node-table-partition-distribution scenario', () => {
  it('observes partition growth and broad spread while write load runs', async () => {
    let sampleStage = 0;
    let loadStarted = false;
    let loadCancelled = false;
    const calls = [];

    const seedNode = {
      id: 'seed-1',
      role: 'seed',
      query: async (sql) => {
        if (sql.includes(SQL_CREATE_TABLE_IF_NOT_EXISTS)) {
          return {rows: []};
        }
        if (sql.includes(SQL_UPDATE_TABLE_POLICIES)) {
          return {rows: []};
        }
        if (sql.includes(SQL_FROM_TABLES)) {
          return {
            rows: [{
              table_id: 'tbl-benchmark-events-1',
              table_policies: TABLE_POLICIES_JSON,
            }],
          };
        }
        if (sql.includes(SQL_FROM_PARTITIONS)) {
          if (!loadStarted) {
            return {rows: partitionRowsForStage(1)};
          }
          sampleStage = Math.min(sampleStage + 1, 3);
          return {rows: partitionRowsForStage(sampleStage)};
        }
        if (sql.includes(SQL_FROM_SERVICES)) {
          return {rows: serviceRowsForStage(sampleStage || 1)};
        }
        return {rows: []};
      },
    };

    const cluster = {
      getNodes: () => [
        seedNode,
        {id: 'node-2', role: 'joiner'},
        {id: 'node-3', role: 'joiner'},
        {id: 'node-4', role: 'joiner'},
        {id: 'node-5', role: 'joiner'},
        {id: 'node-6', role: 'joiner'},
        {id: 'node-7', role: 'joiner'},
      ],
      waitForConvergence: async () => {
        calls.push('waitForConvergence');
        return {settledAfterMs: 1};
      },
      waitForControlPlaneQuiescence: async () => {
        calls.push('waitForControlPlaneQuiescence');
      },
      resolveBenchmarkReadyLoadNodes: async () => {
        return [
          seedNode,
          {id: 'node-2', role: 'joiner'},
          {id: 'node-3', role: 'joiner'},
          {id: 'node-4', role: 'joiner'},
          {id: 'node-5', role: 'joiner'},
        ];
      },
      startLoad: (options) => {
        loadStarted = true;
        calls.push(['startLoad', options]);
        return {
          cancel: () => {
            loadCancelled = true;
          },
          waitComplete: async () => ({
            total: 40,
            success: 34,
            failed: 6,
          }),
        };
      },
      assertConsistency: async () => {
        calls.push('assertConsistency');
      },
      waitForConsistencyConvergence: async (options) => {
        calls.push(['waitForConsistencyConvergence', options]);
      },
    };

    const result = await run(cluster, {
      distributionPollIntervalMs: 1,
      distributionTimeoutMs: 2000,
      minSuccessRate: 0.5,
    });

    assert.equal(loadCancelled, true, 'load should be canceled after distribution is proven');
    assert.equal(result.distribution.additionalPartitionCount, 2);
    assert.ok(result.distribution.replicaNodeCount >= 6);
    assert.equal(result.loadMetrics.total, 40);
    assert.ok(result.successRate >= 0.5);
    assert.deepEqual(calls[0], 'waitForConvergence');
    assert.deepEqual(calls[1], 'waitForControlPlaneQuiescence');
    assert.equal(calls[2][0], 'startLoad');
    assert.deepEqual(
      calls[2][1].nodes.map((node) => node.id),
      ['node-2', 'node-3', 'seed-1'],
      'scenario should bootstrap write load on the current table replica quorum',
    );
    assert.equal(typeof calls[2][1].nodeResolver, 'function');
    assert.equal(
      calls[2][1].adaptiveDispatchGuardrail?.enabled,
      true,
      'scenario should enable adaptive dispatch pacing for partitioning load',
    );
    assert.deepEqual(
      calls[2][1].operations,
      [LOAD_OPERATION_INSERT],
      'scenario should use write-only load for split pressure',
    );
    assert.equal(
      calls[2][1].opsPerSec,
      26,
      'scenario should scale write pressure to the bootstrap table replica quorum',
    );
    assert.equal(
      calls[2][1].tableName,
      'benchmark_events',
      'scenario should default to benchmark load table',
    );
    assert.equal(
      calls[2][1].workloadProfile,
      'benchmark_events_mixed',
      'scenario should use benchmark workload profile',
    );
    assert.deepEqual(calls[3], [
      'waitForConsistencyConvergence',
      {
        timeoutMs: 60000,
        toleratePartitionSkew: true,
        maxPartitionSkew: 2,
      },
    ]);
  });
});
