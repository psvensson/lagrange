// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  run,
} from '../../scenarios/seven-node-load-during-partitioning.js';

const SQL_FROM_PARTITIONS = 'FROM partitions';
const SQL_FROM_SERVICES = 'FROM services';
const SQL_FROM_TABLES = 'FROM tables';
const SQL_UPDATE_TABLE_POLICIES = 'UPDATE tables SET table_policies';
const LOAD_OPERATIONS =
  Object.freeze(['INSERT', 'SELECT', 'UPDATE', 'DELETE']);
const MOCK_TABLE_ID = 'tbl-logs-001';
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

describe('seven-node-load-during-partitioning scenario', () => {
  it('applies table policies and proves workload progress during splits',
    async () => {
      let sampleStage = 0;
      let loadStarted = false;
      let loadCancelled = false;
      let metricTotal = 0;
      let tablePoliciesApplied = false;
      const calls = [];

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        query: async (sql) => {
          if (sql.includes(SQL_UPDATE_TABLE_POLICIES)) {
            tablePoliciesApplied = true;
            return {rows: []};
          }
          if (sql.includes(SQL_FROM_TABLES)) {
            return {
              rows: [{
                table_id: MOCK_TABLE_ID,
                table_policies: tablePoliciesApplied ?
                  TABLE_POLICIES_JSON :
                  '{}',
              }],
            };
          }
          if (sql.includes(SQL_FROM_PARTITIONS)) {
            if (!loadStarted) {
              return {rows: partitionRowsForStage(1)};
            }
            sampleStage = Math.min(sampleStage + 1, 4);
            return {rows: partitionRowsForStage(sampleStage)};
          }
          if (sql.includes(SQL_FROM_SERVICES)) {
            return {
              rows: serviceRowsForStage(sampleStage || 1),
            };
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
        waitForConsistencyConvergence: async (options) => {
          calls.push(['waitForConsistencyConvergence', options]);
        },
      };

      const result = await run(cluster, {
        partitioningPollIntervalMs: 1,
        partitioningTimeoutMs: 2000,
        minAdditionalPartitions: 2,
        minOpsAfterPartitioning: 15,
        minSuccessRate: 0.7,
      });

      assert.equal(
        tablePoliciesApplied,
        true,
        'scenario should apply table split policies before load',
      );
      assert.equal(
        loadCancelled,
        true,
        'scenario should stop load after evidence is captured',
      );
      assert.ok(
        result.partitioningEvidence,
        'partitioning evidence should be captured',
      );
      assert.equal(
        result.partitioningEvidence.additionalPartitionCount, 2,
      );
      assert.ok(
        result.partitioningEvidence.replicaNodeCount >= 5,
      );
      assert.ok(
        result.partitioningEvidence.operationsAfterPartitioning >= 15,
      );
      assert.equal(result.loadMetrics.total, 200);
      assert.ok(result.successRate >= 0.7);
      assert.deepEqual(calls[0], 'waitForConvergence');
      assert.deepEqual(calls[1], 'waitForControlPlaneQuiescence');
      assert.equal(calls[2][0], 'startLoad');
      assert.deepEqual(
        calls[2][1].nodes.map((node) => node.id),
        ['node-2', 'node-3', 'seed-1'],
        'scenario should bootstrap load on the current table replica quorum',
      );
      assert.equal(typeof calls[2][1].nodeResolver, 'function');
      assert.equal(
        calls[2][1].adaptiveDispatchGuardrail?.enabled,
        true,
        'scenario should enable adaptive dispatch pacing for partitioning load',
      );
      assert.deepEqual(
        calls[2][1].operations,
        LOAD_OPERATIONS,
        'scenario should begin with mixed load',
      );
      assert.equal(
        calls[2][1].opsPerSec,
        30,
        'scenario should scale partitioning load to the bootstrap node set',
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

  it('fails early with structured diagnostics when split attempts never start',
    async () => {
      let metricTotal = 0;
      let tablePoliciesApplied = false;

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        query: async (sql) => {
          if (sql.includes(SQL_UPDATE_TABLE_POLICIES)) {
            tablePoliciesApplied = true;
            return {rows: []};
          }
          if (sql.includes('control_snapshot_local')) {
            return {
              rows: [{
                controlPlaneDiagnostics: {
                  workflowAdmissionsByWorkflowId: {},
                  placementEligibilityByNodeId: {
                    'seed-1': {
                      placementEligible: false,
                      reasonCodes: ['routing_not_ready'],
                    },
                  },
                },
              }],
            };
          }
          if (sql.includes(SQL_FROM_TABLES)) {
            return {
              rows: [{
                table_id: MOCK_TABLE_ID,
                table_policies: tablePoliciesApplied ?
                  TABLE_POLICIES_JSON :
                  '{}',
              }],
            };
          }
          if (sql.includes(SQL_FROM_PARTITIONS)) {
            return {rows: [{partition_id: 'logs-p1'}]};
          }
          if (sql.includes(SQL_FROM_SERVICES)) {
            return {
              rows: [
                {partition_id: 'logs-p1', node_id: 'seed-1', status: 'active'},
                {partition_id: 'logs-p1', node_id: 'node-2', status: 'active'},
                {partition_id: 'logs-p1', node_id: 'node-3', status: 'active'},
              ],
            };
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
        waitForConvergence: async () => ({settledAfterMs: 1}),
        startLoad: () => ({
          getMetrics: () => {
            metricTotal += 1;
            return {
              total: metricTotal,
              success: metricTotal,
              failed: 0,
            };
          },
          cancel: () => {},
          waitComplete: async () => ({
            total: metricTotal,
            success: metricTotal,
            failed: 0,
          }),
        }),
      };

      await assert.rejects(
        run(cluster, {
          partitioningPollIntervalMs: 1,
          splitAttemptTimeoutMs: 10,
          partitioningTimeoutMs: 2000,
        }),
        (error) => {
          assert.match(
            String(error?.message || ''),
            /split-attempt evidence/i,
          );
          assert.equal(
            error?.diagnostics?.failure?.dominantReason,
            'no_split_attempt_evidence',
          );
          assert.ok(
            error?.diagnostics?.failure?.loadMetrics?.total >= 1,
            'failure diagnostics should preserve the latest load total',
          );
          assert.equal(
            error?.diagnostics?.failure?.loadMetrics?.success,
            error?.diagnostics?.failure?.loadMetrics?.total,
          );
          assert.equal(
            error?.diagnostics?.failure?.loadMetrics?.failed,
            0,
          );
          assert.equal(
            error?.diagnostics?.failure?.loadMetricsAtFirstPartitioning,
            null,
          );
          assert.deepEqual(
            error?.diagnostics?.failure?.distributionSnapshot,
            {
              partitionCount: 1,
              partitionIds: ['logs-p1'],
              replicaNodeCount: 3,
              replicaNodeIds: ['node-2', 'node-3', 'seed-1'],
            },
          );
          return true;
        },
      );
    });
});
