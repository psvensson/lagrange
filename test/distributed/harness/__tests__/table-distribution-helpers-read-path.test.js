import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {
  admitBenchmarkLoadNodes,
  createPartitioningBenchmarkLoadNodePlan,
  ensureBenchmarkPartitioningTable,
  queryTableDistribution,
  resolvePartitioningBenchmarkLoadOpsPerSec,
} from '../../scenarios/table-distribution-helpers.js';

const PARTITIONS_SQL_FRAGMENT = 'FROM partitions';
const SERVICES_SQL_FRAGMENT = 'FROM services';
const TABLES_SQL_FRAGMENT = 'FROM tables';

test('table-distribution-helpers falls back to an alternate snapshot node ' +
  'when the primary observation path times out', async () => {
  const primaryCalls = [];
  const fallbackCalls = [];
  const timeoutError = new Error('Admin API query timed out');

  const seedNode = {
    id: 'seed-1',
    async queryWithTimeout(_sql, _params, options = {}) {
      primaryCalls.push({
        lane: options.lane,
      });
      throw timeoutError;
    },
  };

  const alternateNode = {
    id: 'node-2',
    async queryWithTimeout(sql, _params, options = {}) {
      fallbackCalls.push({
        sql,
        lane: options.lane,
      });
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        return {
          rows: [
            {partition_id: 'bench-p1'},
            {partition_id: 'bench-p2'},
          ],
        };
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {
          rows: [{
            table_id: 'tbl-benchmark-events-1',
          }],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        return {
          rows: [
            {partition_id: 'bench-p1', node_id: 'seed-1', status: 'active'},
            {partition_id: 'bench-p1', node_id: 'node-2', status: 'active'},
            {partition_id: 'bench-p2', node_id: 'node-2', status: 'active'},
            {partition_id: 'bench-p2', node_id: 'node-3', status: 'active'},
          ],
        };
      }
      return {rows: []};
    },
  };

  const distribution = await queryTableDistribution(seedNode, {
    tableName: 'benchmark_events',
    queryNodes: [seedNode, alternateNode],
  });

  assert.equal(distribution.partitionCount, 2);
  assert.equal(distribution.replicaNodeCount, 3);
  assert.deepEqual(
    Array.from(distribution.replicaNodeIds).sort(),
    ['node-2', 'node-3', 'seed-1'],
  );
  assert.ok(primaryCalls.length > 0, 'expected primary snapshot path attempt');
  assert.ok(
    primaryCalls.every((entry) => entry.lane === 'snapshot'),
    'primary observation should stay on snapshot lane',
  );
  assert.ok(
    fallbackCalls.length >= 3,
    'expected alternate node to serve the full distribution sample',
  );
  assert.ok(
    fallbackCalls.every((entry) => entry.lane === 'snapshot'),
    'fallback observation should stay on snapshot lane',
  );
});

test('table-distribution-helpers retries benchmark table bootstrap on ' +
  'transient participant failures until metadata becomes visible', async () => {
  let createAttempts = 0;
  let tableLookupAttempts = 0;
  let partitionLookupAttempts = 0;
  const seedNode = {
    id: 'seed-1',
    async query(sql) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        createAttempts += 1;
        if (createAttempts === 1) {
          const error = new Error(
            'Distributed operation failed due to participant failures',
          );
          error.deferRetry = true;
          error.retryAfterMs = 5;
          throw error;
        }
        return {rows: []};
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        tableLookupAttempts += 1;
        return {
          rows: tableLookupAttempts >= 2 ?
            [{table_id: 'tbl-benchmark-events-1'}] :
            [],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        partitionLookupAttempts += 1;
        return {
          rows: partitionLookupAttempts >= 2 ?
            [{partition_id: 'tbl-benchmark-events-1-p1'}] :
            [],
        };
      }
      return {rows: []};
    },
  };

  const ensured = await ensureBenchmarkPartitioningTable(seedNode, {
    tableName: 'benchmark_events',
    requirePartitionVisibility: true,
  });

  assert.equal(ensured.tableId, 'tbl-benchmark-events-1');
  assert.ok(
    createAttempts >= 2,
    'expected transient CREATE TABLE failures to be retried',
  );
  assert.ok(
    tableLookupAttempts >= 2,
    'expected metadata visibility polling after transient CREATE TABLE failure',
  );
  assert.ok(
    partitionLookupAttempts >= 2,
    'expected bootstrap to wait for initial partition visibility after table ID appears',
  );
});

test('table-distribution-helpers retries transaction-active bootstrap ' +
  'failures on the dedicated control lane', async () => {
  const createCalls = [];
  let tableLookupAttempts = 0;
  let partitionLookupAttempts = 0;
  const seedNode = {
    id: 'seed-1',
    async queryWithTimeout(sql, _params, options = {}) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        createCalls.push({
          lane: options.lane,
        });
        if (createCalls.length === 1) {
          throw new Error('Transaction already active on this partition');
        }
        return {rows: []};
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        tableLookupAttempts += 1;
        return {
          rows: tableLookupAttempts >= 2 ?
            [{table_id: 'tbl-benchmark-events-2'}] :
            [],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        partitionLookupAttempts += 1;
        return {
          rows: partitionLookupAttempts >= 2 ?
            [{partition_id: 'tbl-benchmark-events-2-p1'}] :
            [],
        };
      }
      return {rows: []};
    },
  };

  const ensured = await ensureBenchmarkPartitioningTable(seedNode, {
    tableName: 'benchmark_events',
    requirePartitionVisibility: true,
  });

  assert.equal(ensured.tableId, 'tbl-benchmark-events-2');
  assert.ok(createCalls.length >= 2,
    'expected transaction-active create failure to be retried at least once');
  assert.ok(
    createCalls.every((entry) => entry.lane === 'control'),
    'benchmark table bootstrap should stay on the dedicated control lane',
  );
  assert.ok(
    partitionLookupAttempts >= 2,
    'bootstrap should keep polling until initial partition metadata becomes visible',
  );
});

test('table-distribution-helpers checks alternate snapshot nodes when the ' +
  'primary table-id lookup is empty', async () => {
  const tableLookupCalls = [];
  const seedNode = {
    id: 'seed-1',
    async queryWithTimeout(sql, _params, options = {}) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        return {rows: []};
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        tableLookupCalls.push({
          nodeId: 'seed-1',
          lane: options.lane,
        });
        return {rows: []};
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        tableLookupCalls.push({
          nodeId: 'seed-1',
          lane: options.lane,
        });
        return {rows: []};
      }
      return {rows: []};
    },
  };
  const alternateNode = {
    id: 'node-2',
    async queryWithTimeout(sql, _params, options = {}) {
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        tableLookupCalls.push({
          nodeId: 'node-2',
          lane: options.lane,
        });
        return {
          rows: [{table_id: 'tbl-benchmark-events-3'}],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        tableLookupCalls.push({
          nodeId: 'node-2',
          lane: options.lane,
        });
        return {
          rows: [{partition_id: 'tbl-benchmark-events-3-p1'}],
        };
      }
      return {rows: []};
    },
  };

  const ensured = await ensureBenchmarkPartitioningTable(seedNode, {
    tableName: 'benchmark_events',
    requirePartitionVisibility: true,
    queryNodes: [seedNode, alternateNode],
  });

  assert.equal(ensured.tableId, 'tbl-benchmark-events-3');
  assert.deepEqual(
    tableLookupCalls.map((entry) => entry.nodeId),
    ['seed-1', 'node-2', 'seed-1', 'node-2'],
    'table bootstrap visibility should continue to alternate snapshot nodes when primary reads are empty',
  );
  assert.ok(
    tableLookupCalls.every((entry) => entry.lane === 'snapshot'),
    'table-id visibility lookups should stay on snapshot lane',
  );
});

test('table-distribution-helpers admits benchmark-ready load nodes using the ' +
  'benchmark readiness API', async () => {
  const readyNodes = [
    {id: 'seed-1'},
    {id: 'node-2'},
    {id: 'node-3'},
  ];
  const calls = [];
  const cluster = {
    _config: {
      benchmark: {
        replicationFactor: 3,
        readyTimeoutMs: 42000,
        readyPollIntervalMs: 250,
        preloadRequiredStableMs: 1500,
      },
    },
    getNodes: () => [
      {id: 'seed-1'},
      {id: 'node-2'},
      {id: 'node-3'},
      {id: 'node-4'},
      {id: 'node-5'},
      {id: 'node-6'},
      {id: 'node-7'},
    ],
    waitForBenchmarkReadyLoadNodes: async (options) => {
      calls.push(options);
      return readyNodes;
    },
  };

  const admitted = await admitBenchmarkLoadNodes(cluster, {
    tableName: 'benchmark_events',
  });

  assert.deepEqual(admitted, readyNodes);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].tableName, 'benchmark_events');
  assert.equal(calls[0].minNodeCount, 3);
  assert.equal(calls[0].timeoutMs, 42000);
  assert.equal(calls[0].stableWindowMs, 1500);
  assert.equal(calls[0].pollIntervalMs, 250);
});

test('table-distribution-helpers bootstraps partitioning load on the ' +
  'table-local replica quorum and refreshes toward the wider target spread',
async () => {
  let sampleStage = 0;
  const clusterNodes = [
    {id: 'seed-1'},
    {id: 'node-2'},
    {id: 'node-3'},
    {id: 'node-4'},
    {id: 'node-5'},
    {id: 'node-6'},
    {id: 'node-7'},
  ];
  const seedNode = {
    id: 'seed-1',
    async query(sql) {
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {
          rows: [{table_id: 'tbl-benchmark-events-1'}],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        sampleStage = Math.min(sampleStage + 1, 3);
        if (sampleStage === 1) {
          return {rows: [{partition_id: 'bench-p1'}]};
        }
        return {
          rows: [
            {partition_id: 'bench-p1'},
            {partition_id: 'bench-p2'},
          ],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        if (sampleStage <= 1) {
          return {
            rows: [
              {partition_id: 'bench-p1', node_id: 'seed-1', status: 'active'},
              {partition_id: 'bench-p1', node_id: 'node-2', status: 'active'},
              {partition_id: 'bench-p1', node_id: 'node-3', status: 'active'},
            ],
          };
        }
        return {
          rows: [
            {partition_id: 'bench-p1', node_id: 'seed-1', status: 'active'},
            {partition_id: 'bench-p1', node_id: 'node-2', status: 'active'},
            {partition_id: 'bench-p1', node_id: 'node-3', status: 'active'},
            {partition_id: 'bench-p2', node_id: 'node-4', status: 'active'},
            {partition_id: 'bench-p2', node_id: 'node-5', status: 'active'},
            {partition_id: 'bench-p2', node_id: 'node-6', status: 'active'},
          ],
        };
      }
      return {rows: []};
    },
  };
  const cluster = {
    _config: {
      benchmark: {
        replicationFactor: 3,
        readyPollIntervalMs: 5,
        preloadRequiredStableMs: 0,
      },
    },
    getNodes: () => clusterNodes,
    resolveBenchmarkReadyLoadNodes: async () => [
      clusterNodes[1],
      clusterNodes[2],
      clusterNodes[3],
      clusterNodes[4],
      clusterNodes[6],
    ],
  };

  const plan = await createPartitioningBenchmarkLoadNodePlan(
    seedNode,
    cluster,
    {
      tableName: 'benchmark_events',
      tableId: 'tbl-benchmark-events-1',
      requiredNodeCount: 5,
      queryNodes: [seedNode],
      pollIntervalMs: 5,
      stableWindowMs: 0,
    },
  );

  try {
    assert.equal(plan.bootstrapRequiredNodeCount, 3);
    assert.equal(plan.targetNodeCount, 5);
    assert.deepEqual(
      plan.initialNodes.map((node) => node.id),
      ['node-2', 'node-3'],
      'initial partitioning load should stay on the admitted subset of the ' +
      'current table-local replica quorum',
    );

    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });

    assert.deepEqual(
      plan.nodeResolver().map((node) => node.id),
      ['node-2', 'node-3', 'node-4', 'node-5'],
      'refresh should expand only through admitted table-local replica nodes',
    );
  } finally {
    plan.stop();
  }
});

test('table-distribution-helpers waits for at least one admitted ' +
  'table-local writer and excludes unadmitted replica nodes from steady ' +
  'dispatch', async () => {
  let partitionSampleCount = 0;
  let admissionSampleCount = 0;
  const clusterNodes = [
    {id: 'seed-1'},
    {id: 'node-2'},
    {id: 'node-3'},
    {id: 'node-4'},
    {id: 'node-5'},
    {id: 'node-6'},
    {id: 'node-7'},
  ];
  const seedNode = {
    id: 'seed-1',
    async query(sql) {
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {
          rows: [{table_id: 'tbl-benchmark-events-1'}],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        partitionSampleCount += 1;
        if (partitionSampleCount <= 4) {
          return {
            rows: [{partition_id: 'bench-p1'}],
          };
        }
        return {
          rows: [
            {partition_id: 'bench-p1'},
            {partition_id: 'bench-p2'},
          ],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        if (partitionSampleCount <= 4) {
          return {
            rows: [
              {partition_id: 'bench-p1', node_id: 'seed-1', status: 'active'},
              {partition_id: 'bench-p1', node_id: 'node-2', status: 'active'},
              {partition_id: 'bench-p1', node_id: 'node-3', status: 'active'},
            ],
          };
        }
        return {
          rows: [
            {partition_id: 'bench-p1', node_id: 'seed-1', status: 'active'},
            {partition_id: 'bench-p1', node_id: 'node-2', status: 'active'},
            {partition_id: 'bench-p1', node_id: 'node-3', status: 'active'},
            {partition_id: 'bench-p2', node_id: 'node-4', status: 'active'},
            {partition_id: 'bench-p2', node_id: 'node-5', status: 'active'},
            {partition_id: 'bench-p2', node_id: 'node-6', status: 'active'},
          ],
        };
      }
      return {rows: []};
    },
  };
  const cluster = {
    _config: {
      benchmark: {
        replicationFactor: 3,
        readyPollIntervalMs: 5,
        preloadRequiredStableMs: 0,
      },
    },
    getNodes: () => clusterNodes,
    resolveBenchmarkReadyLoadNodes: async () => {
      admissionSampleCount += 1;
      if (admissionSampleCount <= 2) {
        return [];
      }
      if (partitionSampleCount <= 4) {
        return [clusterNodes[1]];
      }
      return [
        clusterNodes[1],
        clusterNodes[3],
        clusterNodes[4],
      ];
    },
  };

  const plan = await createPartitioningBenchmarkLoadNodePlan(
    seedNode,
    cluster,
    {
      tableName: 'benchmark_events',
      tableId: 'tbl-benchmark-events-1',
      requiredNodeCount: 5,
      queryNodes: [seedNode],
      pollIntervalMs: 5,
      stableWindowMs: 0,
    },
  );

  try {
    assert.ok(
      admissionSampleCount >= 3,
      'expected helper to wait for an admitted writer before starting load',
    );
    assert.deepEqual(
      plan.initialNodes.map((node) => node.id),
      ['node-2'],
      'initial partitioning load should start only on admitted table-local nodes',
    );

    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });

    assert.deepEqual(
      plan.nodeResolver().map((node) => node.id),
      ['node-2', 'node-4', 'node-5'],
      'steady dispatch should exclude replica-bearing nodes that are still not benchmark-admitted',
    );
  } finally {
    plan.stop();
  }
});

test('table-distribution-helpers falls back to the legacy cluster load ' +
  'readiness gate when benchmark admission is unavailable', async () => {
  const calls = [];
  const clusterNodes = [
    {id: 'seed-1'},
    {id: 'node-2'},
    {id: 'node-3'},
  ];
  const cluster = {
    _config: {
      benchmark: {
        readyTimeoutMs: 36000,
        preloadRequiredStableMs: 2000,
      },
    },
    getNodes: () => clusterNodes,
    waitForLoadReadinessStability: async (options) => {
      calls.push(options);
    },
  };

  const admitted = await admitBenchmarkLoadNodes(cluster, {
    tableName: 'benchmark_events',
  });

  assert.deepEqual(admitted, clusterNodes);
  assert.deepEqual(calls, [{
    timeoutMs: 36000,
    stableWindowMs: 2000,
  }]);
});

test('table-distribution-helpers scales partitioning load to admitted node ' +
  'capacity with control-plane headroom', async () => {
  assert.equal(
    resolvePartitioningBenchmarkLoadOpsPerSec(140, 3, 7),
    30,
  );
  assert.equal(
    resolvePartitioningBenchmarkLoadOpsPerSec(120, 3, 7),
    26,
  );
  assert.equal(
    resolvePartitioningBenchmarkLoadOpsPerSec(140, 7, 7),
    70,
  );
});
