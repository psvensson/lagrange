import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  run,
} from '../../scenarios/seven-node-load-during-partitioning.js';

const SQL_FROM_PARTITIONS = 'FROM partitions';
const SQL_FROM_SERVICES = 'FROM services';
const LOAD_OPERATIONS = Object.freeze(['INSERT', 'SELECT', 'UPDATE', 'DELETE']);

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

describe('seven-node-load-during-partitioning scenario', () => {
  it('proves workload progress continues while partitions are added', async () => {
    let sampleStage = 0;
    let loadCancelled = false;
    let metricTotal = 0;
    const calls = [];

    const seedNode = {
      id: 'seed-1',
      role: 'seed',
      query: async (sql) => {
        if (sql.includes(SQL_FROM_PARTITIONS)) {
          sampleStage = Math.min(sampleStage + 1, 4);
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
      startLoad: (options) => {
        calls.push(['startLoad', options]);
        return {
          getMetrics: () => {
            metricTotal += 10;
            return {
              total: metricTotal,
              success: Math.floor(metricTotal * 0.8),
              failed: Math.ceil(metricTotal * 0.2),
            };
          },
          cancel: () => {
            loadCancelled = true;
          },
          waitComplete: async () => ({
            total: 200,
            success: 160,
            failed: 40,
          }),
        };
      },
      assertConsistency: async () => {
        calls.push('assertConsistency');
      },
    };

    const result = await run(cluster, {
      partitioningPollIntervalMs: 1,
      partitioningTimeoutMs: 2000,
      minOpsAfterPartitioning: 15,
      minSuccessRate: 0.7,
    });

    assert.equal(loadCancelled, true, 'scenario should stop load after evidence is captured');
    assert.ok(result.partitioningEvidence, 'partitioning evidence should be captured');
    assert.equal(result.partitioningEvidence.additionalPartitionCount, 2);
    assert.ok(result.partitioningEvidence.replicaNodeCount >= 6);
    assert.ok(result.partitioningEvidence.operationsAfterPartitioning >= 15);
    assert.equal(result.loadMetrics.total, 200);
    assert.ok(result.successRate >= 0.7);
    assert.deepEqual(calls[0], 'waitForConvergence');
    assert.equal(calls[1][0], 'startLoad');
    assert.deepEqual(
      calls[1][1].operations,
      LOAD_OPERATIONS,
      'scenario should begin with mixed load before observing partitioning',
    );
    assert.deepEqual(calls[2], 'assertConsistency');
  });
});
