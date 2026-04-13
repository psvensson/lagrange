// @ts-nocheck
import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {
  admitBenchmarkLoadNodes,
  createPartitioningBenchmarkLoadNodePlan,
  ensureBenchmarkPartitioningTable,
  queryTableDistribution,
  resolvePartitioningBenchmarkLoadOpsPerSec,
  waitForPartitionGrowthAndSpread,
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

test('table-distribution-helpers prefers a fresher alternate snapshot when ' +
  'the primary node returns a stale empty distribution', async () => {
  const primaryCalls = [];
  const alternateCalls = [];

  const seedNode = {
    id: 'seed-1',
    async queryWithTimeout(sql, _params, options = {}) {
      primaryCalls.push({
        sql,
        lane: options.lane,
      });
      if (sql.includes('control_snapshot_local(true)')) {
        return {rows: [{scope: 'local'}]};
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {
          rows: [{table_id: 'tbl-benchmark-events-1'}],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT) ||
          sql.includes(SERVICES_SQL_FRAGMENT)) {
        return {rows: []};
      }
      return {rows: []};
    },
  };

  const alternateNode = {
    id: 'node-2',
    async queryWithTimeout(sql, _params, options = {}) {
      alternateCalls.push({
        sql,
        lane: options.lane,
      });
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {
          rows: [{table_id: 'tbl-benchmark-events-1'}],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        return {
          rows: [{partition_id: 'bench-p1'}],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        return {
          rows: [
            {partition_id: 'bench-p1', node_id: 'seed-1', status: 'active'},
            {partition_id: 'bench-p1', node_id: 'node-2', status: 'active'},
            {partition_id: 'bench-p1', node_id: 'node-3', status: 'active'},
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

  assert.equal(distribution.partitionCount, 1);
  assert.equal(distribution.replicaNodeCount, 3);
  assert.deepEqual(
    Array.from(distribution.replicaNodeIds).sort(),
    ['node-2', 'node-3', 'seed-1'],
  );
  assert.ok(
    primaryCalls.some((entry) => entry.sql.includes('control_snapshot_local(true)')),
    'expected stale primary path to attempt one local snapshot repair',
  );
  assert.ok(
    alternateCalls.length >= 3,
    'expected helper to consult an alternate snapshot node after stale empty primary results',
  );
  assert.ok(
    alternateCalls.every((entry) => entry.lane === 'snapshot'),
    'alternate observation should stay on snapshot lane',
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

test('table-distribution-helpers retries retryable snapshot-read defers until ' +
  'table distribution metadata becomes visible', async () => {
  const snapshotCalls = [];
  let tableLookupAttempts = 0;
  let partitionLookupAttempts = 0;
  let serviceLookupAttempts = 0;
  const seedNode = {
    id: 'seed-1',
    async queryWithTimeout(sql, _params, options = {}) {
      snapshotCalls.push({
        sql,
        lane: options.lane,
      });
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        tableLookupAttempts += 1;
        if (tableLookupAttempts === 1) {
          const error = new Error('query_admission_deferred');
          error.retryAfterMs = 5;
          throw error;
        }
        return {
          rows: [{table_id: 'tbl-benchmark-events-retry'}],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        partitionLookupAttempts += 1;
        if (partitionLookupAttempts === 1) {
          const error = new Error(
            'Distributed operation failed due to participant failures',
          );
          error.deferRetry = true;
          error.retryAfterMs = 5;
          throw error;
        }
        return {
          rows: [{partition_id: 'tbl-benchmark-events-retry-p1'}],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        serviceLookupAttempts += 1;
        if (serviceLookupAttempts === 1) {
          const error = new Error('query_admission_deferred');
          error.retryAfterMs = 5;
          throw error;
        }
        return {
          rows: [
            {
              partition_id: 'tbl-benchmark-events-retry-p1',
              node_id: 'seed-1',
              status: 'active',
            },
            {
              partition_id: 'tbl-benchmark-events-retry-p1',
              node_id: 'node-2',
              status: 'active',
            },
          ],
        };
      }
      return {rows: []};
    },
  };

  const distribution = await queryTableDistribution(seedNode, {
    tableName: 'benchmark_events',
    queryNodes: [seedNode],
  });

  assert.equal(distribution.partitionCount, 1);
  assert.equal(distribution.replicaNodeCount, 2);
  assert.deepEqual(
    Array.from(distribution.replicaNodeIds).sort(),
    ['node-2', 'seed-1'],
  );
  assert.ok(
    tableLookupAttempts >= 2,
    'expected retryable table-id snapshot defers to be retried',
  );
  assert.ok(
    partitionLookupAttempts >= 2,
    'expected retryable partition snapshot failures to be retried',
  );
  assert.ok(
    serviceLookupAttempts >= 2,
    'expected retryable service snapshot defers to be retried',
  );
  assert.ok(
    snapshotCalls.every((entry) => entry.lane === 'snapshot'),
    'retryable distribution reads should stay on the snapshot lane',
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

test('table-distribution-helpers repairs table visibility from authoritative ' +
  'control snapshot after retryable create timeout', async () => {
  let repairCount = 0;
  let tableLookupAttempts = 0;
  let partitionLookupAttempts = 0;
  const seedNode = {
    id: 'seed-1',
    async queryWithTimeout(sql, _params, options = {}) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        const error = new Error(
          'Admin API query timed out for node seed-1 on lane control after 15000ms',
        );
        error.retryAfterMs = 5;
        throw error;
      }
      if (sql.includes('control_snapshot_local(true)')) {
        repairCount += 1;
        return {rows: [{scope: 'local'}]};
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        tableLookupAttempts += 1;
        return {
          rows: repairCount > 0 ?
            [{table_id: 'tbl-benchmark-events-repaired'}] :
            [],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        partitionLookupAttempts += 1;
        return {
          rows: repairCount > 0 ?
            [{partition_id: 'tbl-benchmark-events-repaired-p1'}] :
            [],
        };
      }
      return {rows: []};
    },
  };

  const ensured = await ensureBenchmarkPartitioningTable(seedNode, {
    tableName: 'benchmark_events',
    requirePartitionVisibility: true,
    queryNodes: [seedNode],
  });

  assert.equal(repairCount, 1);
  assert.equal(ensured.tableId, 'tbl-benchmark-events-repaired');
  assert.equal(ensured.tableVisibilityRepairApplied, true);
  assert.match(String(ensured.createTimeoutError || ''), /timed out/i);
  assert.ok(
    tableLookupAttempts >= 1,
    'table bootstrap should re-check table visibility after authoritative repair',
  );
  assert.ok(
    partitionLookupAttempts >= 1,
    'table bootstrap should re-check partition visibility after authoritative repair',
  );
});

test('table-distribution-helpers preserves pending create visibility ' +
  'without forced repair', async () => {
  let repairCount = 0;
  let tableLookupAttempts = 0;
  let partitionLookupAttempts = 0;
  const seedNode = {
    id: 'seed-1',
    async queryWithTimeout(sql) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        return {
          rows: [],
          visibilityState: 'pending_visibility',
          authoritativeVisibilityConfirmed: true,
        };
      }
      if (sql.includes('control_snapshot_local(true)')) {
        repairCount += 1;
        return {rows: [{scope: 'local'}]};
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        tableLookupAttempts += 1;
        return {
          rows: tableLookupAttempts >= 2 ?
            [{table_id: 'tbl-benchmark-events-pending'}] :
            [],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        partitionLookupAttempts += 1;
        return {
          rows: partitionLookupAttempts >= 2 ?
            [{partition_id: 'tbl-benchmark-events-pending-p1'}] :
            [],
        };
      }
      return {rows: []};
    },
  };

  const ensured = await ensureBenchmarkPartitioningTable(seedNode, {
    tableName: 'benchmark_events',
    requirePartitionVisibility: true,
    queryNodes: [seedNode],
  });

  assert.equal(ensured.tableId, 'tbl-benchmark-events-pending');
  assert.equal(repairCount, 0);
  assert.equal(ensured.createVisibilityState, 'pending_visibility');
  assert.equal(ensured.createVisibilityAuthoritativeConfirmed, true);
  assert.equal(
    ensured.tableVisibilityWarning,
    'table_id_visibility_pending_after_authoritative_commit',
  );
  assert.ok(
    tableLookupAttempts >= 2,
    'pending create visibility should keep polling snapshot metadata',
  );
  assert.ok(
    partitionLookupAttempts >= 2,
    'pending create visibility should keep polling partition metadata',
  );
});

test('table-distribution-helpers repairs empty table distribution snapshots ' +
  'from authoritative control state before giving up', async () => {
  let repairCount = 0;
  const seedNode = {
    id: 'seed-1',
    async queryWithTimeout(sql, _params, options = {}) {
      if (sql.includes('control_snapshot_local(true)')) {
        repairCount += 1;
        return {rows: [{scope: 'local'}]};
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {
          rows: [{table_id: 'tbl-benchmark-events-4'}],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        if (repairCount === 0) {
          return {rows: []};
        }
        return {
          rows: [{partition_id: 'tbl-benchmark-events-4-p1'}],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        if (repairCount === 0) {
          return {rows: []};
        }
        return {
          rows: [
            {
              partition_id: 'tbl-benchmark-events-4-p1',
              node_id: 'seed-1',
              status: 'active',
            },
          ],
        };
      }
      return {rows: []};
    },
  };

  const distribution = await queryTableDistribution(seedNode, {
    tableName: 'benchmark_events',
    queryNodes: [seedNode],
  });

  assert.equal(repairCount, 1);
  assert.equal(distribution.partitionCount, 1);
  assert.equal(distribution.replicaNodeCount, 1);
  assert.deepEqual(
    Array.from(distribution.replicaNodeIds),
    ['seed-1'],
  );
});

test('table-distribution-helpers falls back to the control lane when ' +
  'forced snapshot repair is not locally executable on the snapshot lane',
async () => {
  const repairLanes = [];
  const seedNode = {
    id: 'seed-1',
    async queryWithTimeout(sql, _params, options = {}) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        const error = new Error(
          'Admin API query timed out for node seed-1 on lane control after 15000ms',
        );
        error.retryAfterMs = 5;
        throw error;
      }
      if (sql.includes('control_snapshot_local(true)')) {
        repairLanes.push(options.lane);
        if (options.lane === 'snapshot') {
          throw new Error('SQL query engine not available');
        }
        return {rows: [{scope: 'local'}]};
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {
          rows: repairLanes.includes('control') ?
            [{table_id: 'tbl-benchmark-events-control-repair'}] :
            [],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        return {
          rows: repairLanes.includes('control') ?
            [{partition_id: 'tbl-benchmark-events-control-repair-p1'}] :
            [],
        };
      }
      return {rows: []};
    },
  };

  const ensured = await ensureBenchmarkPartitioningTable(seedNode, {
    tableName: 'benchmark_events',
    requirePartitionVisibility: true,
    queryNodes: [seedNode],
  });

  assert.equal(ensured.tableId, 'tbl-benchmark-events-control-repair');
  assert.equal(ensured.tableVisibilityRepairApplied, true);
  assert.deepEqual(
    repairLanes,
    ['snapshot', 'control'],
    'forced repair should fall back to the control lane when snapshot execution is unavailable',
  );
});

test('table-distribution-helpers avoids cross-table service joins while ' +
  'partition rows are still empty', async () => {
  let repairCount = 0;
  const serviceQueries = [];
  const seedNode = {
    id: 'seed-1',
    async queryWithTimeout(sql, _params, options = {}) {
      if (sql.includes('control_snapshot_local(true)')) {
        repairCount += 1;
        return {rows: [{scope: 'local'}]};
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {
          rows: [{table_id: 'tbl-benchmark-events-4b'}],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        if (repairCount === 0) {
          return {rows: []};
        }
        return {
          rows: [{partition_id: 'tbl-benchmark-events-4b-p1'}],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        serviceQueries.push({
          sql,
          lane: options.lane,
        });
        if (sql.includes('JOIN partitions')) {
          throw new Error('service snapshot should not use cross-table joins');
        }
        if (repairCount === 0) {
          return {rows: []};
        }
        return {
          rows: [{
            partition_id: 'tbl-benchmark-events-4b-p1',
            node_id: 'seed-1',
            status: 'active',
          }],
        };
      }
      return {rows: []};
    },
  };

  const distribution = await queryTableDistribution(seedNode, {
    tableName: 'benchmark_events',
    queryNodes: [seedNode],
  });

  assert.equal(repairCount, 1);
  assert.equal(distribution.partitionCount, 1);
  assert.equal(distribution.replicaNodeCount, 1);
  assert.ok(
    serviceQueries.some((entry) => entry.sql.includes('AND 1 = 0')),
    'expected empty-partition reads to avoid unsupported cross-table joins',
  );
  assert.ok(
    serviceQueries.some((entry) => entry.sql.includes('partition_id IN')),
    'expected repair retry to re-scope service reads to concrete partition ids',
  );
  assert.ok(
    serviceQueries.every((entry) => entry.lane === 'snapshot'),
    'table-scoped service reads should stay on snapshot lane while repairing',
  );
});

test('table-distribution-helpers repairs table-scoped service gaps even when ' +
  'other partition services are already visible', async () => {
  let repairCount = 0;
  const serviceQueries = [];
  const seedNode = {
    id: 'seed-1',
    async queryWithTimeout(sql, _params, options = {}) {
      if (sql.includes('control_snapshot_local(true)')) {
        repairCount += 1;
        return {rows: [{scope: 'local'}]};
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {
          rows: [{table_id: 'tbl-benchmark-events-5'}],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        return {
          rows: [{partition_id: 'tbl-benchmark-events-5-p1'}],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        serviceQueries.push({
          sql,
          lane: options.lane,
        });
        if (repairCount === 0) {
          return {
            rows: sql.includes('partition_id IN') ?
              [] :
              [{
                partition_id: 'sys-p1',
                node_id: 'seed-1',
                status: 'active',
              }],
          };
        }
        return {
          rows: [
            {
              partition_id: 'tbl-benchmark-events-5-p1',
              node_id: 'seed-1',
              status: 'active',
            },
            {
              partition_id: 'tbl-benchmark-events-5-p1',
              node_id: 'node-2',
              status: 'active',
            },
          ],
        };
      }
      return {rows: []};
    },
  };

  const distribution = await queryTableDistribution(seedNode, {
    tableName: 'benchmark_events',
    queryNodes: [seedNode],
  });

  assert.equal(repairCount, 1);
  assert.equal(distribution.partitionCount, 1);
  assert.equal(distribution.replicaNodeCount, 2);
  assert.deepEqual(
    Array.from(distribution.replicaNodeIds).sort(),
    ['node-2', 'seed-1'],
  );
  assert.ok(
    serviceQueries.length >= 2,
    'expected service distribution to be re-read after repair',
  );
  assert.ok(
    serviceQueries.every((entry) => entry.sql.includes('partition_id IN')),
    'expected service distribution queries to stay scoped to the target partitions',
  );
  assert.ok(
    serviceQueries.every((entry) => entry.lane === 'snapshot'),
    'table-scoped service reads should stay on snapshot lane',
  );
});

test('table-distribution-helpers prefers non-invalid alternate snapshots ' +
  'over larger invalid follower-only topologies', async () => {
  const seedNode = {
    id: 'seed-1',
    async queryWithTimeout(sql, _params, options = {}) {
      if (sql.includes('control_snapshot_local(true)')) {
        return {rows: [{scope: 'local'}]};
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {
          rows: [{table_id: 'tbl-benchmark-events-invalid-primary'}],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        return {
          rows: [{
            partition_id: 'tbl-benchmark-events-invalid-primary-p1',
            replica_count: 3,
            leader_node_id: 'seed-1',
          }],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        return {
          rows: [
            {
              partition_id: 'tbl-benchmark-events-invalid-primary-p1',
              node_id: 'node-2',
              status: 'active',
              raft_role: 'follower',
            },
            {
              partition_id: 'tbl-benchmark-events-invalid-primary-p1',
              node_id: 'node-3',
              status: 'active',
              raft_role: 'follower',
            },
            {
              partition_id: 'tbl-benchmark-events-invalid-primary-p1',
              node_id: 'node-4',
              status: 'active',
              raft_role: 'follower',
            },
            {
              partition_id: 'tbl-benchmark-events-invalid-primary-p1',
              node_id: 'node-5',
              status: 'active',
              raft_role: 'follower',
            },
          ],
        };
      }
      return {rows: []};
    },
  };

  const alternateNode = {
    id: 'node-2',
    async queryWithTimeout(sql) {
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {
          rows: [{table_id: 'tbl-benchmark-events-invalid-primary'}],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        return {
          rows: [{partition_id: 'tbl-benchmark-events-invalid-primary-p1'}],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        return {
          rows: [
            {
              partition_id: 'tbl-benchmark-events-invalid-primary-p1',
              node_id: 'seed-1',
              status: 'active',
            },
            {
              partition_id: 'tbl-benchmark-events-invalid-primary-p1',
              node_id: 'node-2',
              status: 'active',
            },
            {
              partition_id: 'tbl-benchmark-events-invalid-primary-p1',
              node_id: 'node-3',
              status: 'active',
            },
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

  assert.equal(distribution.topologyState, 'opaque');
  assert.equal(distribution.invalidPartitionCount, 0);
  assert.equal(distribution.serviceCount, 3);
  assert.equal(distribution.replicaNodeCount, 3);
  assert.deepEqual(
    Array.from(distribution.replicaNodeIds).sort(),
    ['node-2', 'node-3', 'seed-1'],
  );
});

test('table-distribution-helpers fails early when follower-only topology ' +
  'flatlines without a visible leader service', async () => {
  const seedNode = {
    id: 'seed-1',
    async queryWithTimeout(sql) {
      if (sql.includes('control_snapshot_local(true)')) {
        return {rows: [{scope: 'local'}]};
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {
          rows: [{table_id: 'tbl-benchmark-events-leader-gap'}],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        return {
          rows: [{
            partition_id: 'tbl-benchmark-events-leader-gap-p1',
            replica_count: 3,
            leader_node_id: 'seed-1',
          }],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        return {
          rows: [
            {
              partition_id: 'tbl-benchmark-events-leader-gap-p1',
              node_id: 'node-2',
              status: 'active',
              raft_role: 'follower',
            },
            {
              partition_id: 'tbl-benchmark-events-leader-gap-p1',
              node_id: 'node-3',
              status: 'active',
              raft_role: 'follower',
            },
            {
              partition_id: 'tbl-benchmark-events-leader-gap-p1',
              node_id: 'node-4',
              status: 'active',
              raft_role: 'follower',
            },
          ],
        };
      }
      return {rows: []};
    },
  };

  await assert.rejects(
    waitForPartitionGrowthAndSpread(seedNode, {
      tableName: 'benchmark_events',
      timeoutMs: 80,
      pollIntervalMs: 5,
      topologyNoProgressTimeoutMs: 10,
      minAdditionalPartitions: 1,
      minDistinctReplicaNodes: 3,
      queryNodes: [seedNode],
    }),
    (error) => {
      assert.match(error.message, /invalid state/i);
      assert.match(error.message, /failureMode=leader_service_missing/i);
      assert.equal(
        error.diagnostics?.partitionGrowth?.failureMode,
        'leader_service_missing',
      );
      assert.equal(
        error.diagnostics?.partitionGrowth?.topologyState,
        'invalid',
      );
      assert.equal(
        error.diagnostics?.partitionGrowth?.leaderServiceMissingPartitionCount,
        1,
      );
      assert.equal(
        error.diagnostics?.partitionGrowth?.overReplicatedPartitionCount,
        0,
      );
      return true;
    },
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
  'current replica quorum and refreshes toward wider benchmark-ready spread',
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
    assert.equal(plan.bootstrapRequiredNodeCount, 2);
    assert.equal(plan.targetNodeCount, 5);
    assert.deepEqual(
      plan.initialNodes.map((node) => node.id),
      ['node-2', 'node-3', 'seed-1'],
      'initial partitioning load should bootstrap on the current ' +
      'replica-bearing quorum',
    );
    assert.deepEqual(
      plan.nodeResolver().map((node) => node.id),
      ['node-2', 'node-3', 'node-4', 'node-5', 'node-7'],
      'live dispatch should immediately widen to the full admission-ready set',
    );
    assert.deepEqual(
      plan.getDiagnostics(),
      {
        selectedNodeCount: 5,
        selectedNodeIds: ['node-2', 'node-3', 'node-4', 'node-5', 'node-7'],
        admissionReadyNodeCount: 5,
        admissionReadyNodeIds: ['node-2', 'node-3', 'node-4', 'node-5', 'node-7'],
        readyReplicaNodeCount: 2,
        readyReplicaNodeIds: ['node-2', 'node-3'],
        replicaBearingNodeCount: 3,
        replicaBearingNodeIds: ['node-2', 'node-3', 'seed-1'],
        partitionCount: 1,
        readinessReasonHistogram: null,
      },
      'planner diagnostics should report the live dispatch set, not only the ' +
        'replica-bearing bootstrap nodes',
    );

    await new Promise((resolve) => {
      setTimeout(resolve, 60);
    });

    assert.deepEqual(
      plan.nodeResolver().map((node) => node.id),
      ['node-2', 'node-3', 'node-4', 'node-5', 'node-7'],
      'refresh should widen beyond the bootstrap quorum once additional ' +
        'benchmark-ready routed nodes appear',
    );
  } finally {
    plan.stop();
  }
});

test('table-distribution-helpers samples benchmark admission but does not ' +
  'block bootstrap once replica quorum exists', async () => {
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
      admissionSampleCount >= 1,
      'expected helper to sample benchmark admission during bootstrap',
    );
    assert.deepEqual(
      plan.initialNodes.map((node) => node.id),
      ['node-2', 'node-3', 'seed-1'],
      'initial partitioning load should start once one admitted writer ' +
      'exists and replica quorum is available',
    );

    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });

    assert.deepEqual(
      plan.nodeResolver().map((node) => node.id),
      ['node-2', 'node-4', 'node-5', 'node-3', 'node-6'],
      'steady dispatch should promote benchmark-admitted nodes first while ' +
      'preferring non-seed replica-bearing nodes over the seed',
    );
  } finally {
    plan.stop();
  }
});

test('table-distribution-helpers can bootstrap partitioning load when ' +
  'benchmark admission enforcement is disabled', async () => {
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
        return {
          rows: [{partition_id: 'bench-p1'}],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        return {
          rows: [
            {partition_id: 'bench-p1', node_id: 'seed-1', status: 'active'},
            {partition_id: 'bench-p1', node_id: 'node-2', status: 'active'},
            {partition_id: 'bench-p1', node_id: 'node-3', status: 'active'},
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
        enforceBenchmarkLoadAdmission: false,
      },
    },
    getNodes: () => clusterNodes,
    resolveBenchmarkReadyLoadNodes: async () => [],
  };

  const plan = await createPartitioningBenchmarkLoadNodePlan(
    seedNode,
    cluster,
    {
      tableName: 'benchmark_events',
      tableId: 'tbl-benchmark-events-1',
      requiredNodeCount: 5,
      queryNodes: [seedNode],
      timeoutMs: 40,
      pollIntervalMs: 5,
      stableWindowMs: 0,
    },
  );

  try {
    assert.deepEqual(
      plan.initialNodes.map((node) => node.id),
      ['node-2', 'node-3', 'seed-1'],
      'disabled admission enforcement should bootstrap on replica-bearing nodes',
    );
  } finally {
    plan.stop();
  }
});

test('table-distribution-helpers still promotes sampled admission-ready ' +
  'routed nodes when benchmark admission enforcement is disabled',
async () => {
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
        return {
          rows: [{partition_id: 'bench-p1'}],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        return {
          rows: [
            {partition_id: 'bench-p1', node_id: 'seed-1', status: 'active'},
            {partition_id: 'bench-p1', node_id: 'node-2', status: 'active'},
            {partition_id: 'bench-p1', node_id: 'node-3', status: 'active'},
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
        enforceBenchmarkLoadAdmission: false,
      },
    },
    getNodes: () => clusterNodes,
    resolveBenchmarkReadyLoadNodes: async () => {
      admissionSampleCount += 1;
      if (admissionSampleCount <= 2) {
        return [clusterNodes[1]];
      }
      return [
        clusterNodes[1],
        clusterNodes[3],
        clusterNodes[4],
        clusterNodes[5],
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
      admissionSampleCount >= 1,
      'disabled enforcement should still sample benchmark admission to widen load safely',
    );
    assert.deepEqual(
      plan.initialNodes.map((node) => node.id),
      ['node-2', 'node-3', 'seed-1'],
      'disabled enforcement should still bootstrap on the current replica-bearing quorum',
    );

    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });

    assert.deepEqual(
      plan.nodeResolver().map((node) => node.id),
      ['node-2', 'node-4', 'node-5', 'node-6', 'node-3'],
      'disabled enforcement should still promote benchmark-admitted routed nodes before falling back to replica-bearing nodes',
    );
  } finally {
    plan.stop();
  }
});

test('table-distribution-helpers promotes admission-ready routed nodes ' +
  'after the replica bootstrap quorum is established', async () => {
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
        return {
          rows: [{partition_id: 'bench-p1'}],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        return {
          rows: [
            {partition_id: 'bench-p1', node_id: 'seed-1', status: 'active'},
            {partition_id: 'bench-p1', node_id: 'node-2', status: 'active'},
            {partition_id: 'bench-p1', node_id: 'node-3', status: 'active'},
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
        return [clusterNodes[1]];
      }
      return [
        clusterNodes[1],
        clusterNodes[3],
        clusterNodes[4],
        clusterNodes[5],
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
    assert.deepEqual(
      plan.initialNodes.map((node) => node.id),
      ['node-2', 'node-3', 'seed-1'],
      'bootstrap should still start on the current replica-bearing quorum',
    );

    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });

    assert.deepEqual(
      plan.nodeResolver().map((node) => node.id),
      ['node-2', 'node-4', 'node-5', 'node-6', 'node-3'],
      'steady dispatch should promote wider admission-ready nodes before ' +
        'falling back to replica-bearing bootstrap nodes',
    );
  } finally {
    plan.stop();
  }
});

test('table-distribution-helpers can bootstrap on a majority-sized replica ' +
  'cohort before wider admission catches up', async () => {
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
        return {
          rows: [{partition_id: 'bench-p1'}],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        return {
          rows: [
            {partition_id: 'bench-p1', node_id: 'seed-1', status: 'active'},
            {partition_id: 'bench-p1', node_id: 'node-2', status: 'active'},
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
      clusterNodes[3],
      clusterNodes[4],
      clusterNodes[5],
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
      timeoutMs: 40,
      pollIntervalMs: 5,
      stableWindowMs: 0,
    },
  );

  try {
    assert.equal(plan.bootstrapRequiredNodeCount, 2);
    assert.deepEqual(
      plan.initialNodes.map((node) => node.id),
      ['node-2', 'seed-1'],
      'bootstrap should start once a majority-sized local replica cohort is active',
    );
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    assert.deepEqual(
      plan.nodeResolver().map((node) => node.id),
      ['node-2', 'node-4', 'node-5', 'node-6', 'seed-1'],
      'refresh should widen to benchmark-admitted nodes after majority bootstrap',
    );
  } finally {
    plan.stop();
  }
});

test('table-distribution-helpers fails when the replica-bearing bootstrap ' +
  'quorum never stabilizes', async () => {
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
        return {
          rows: [{partition_id: 'bench-p1'}],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        return {
          rows: [
            {partition_id: 'bench-p1', node_id: 'seed-1', status: 'active'},
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
    resolveBenchmarkReadyLoadNodes: async () => [],
  };

  await assert.rejects(
    createPartitioningBenchmarkLoadNodePlan(
      seedNode,
      cluster,
      {
        tableName: 'benchmark_events',
        tableId: 'tbl-benchmark-events-1',
        requiredNodeCount: 5,
        queryNodes: [seedNode],
        timeoutMs: 40,
        pollIntervalMs: 5,
        stableWindowMs: 0,
      },
    ),
    (error) => {
      assert.match(
        error.message,
        /Timed out after 40ms waiting for partitioning bootstrap quorum/i,
      );
      assert.match(error.message, /selectedNodeIds=seed-1/i);
      assert.match(error.message, /readyReplicaNodeIds=/i);
      assert.deepEqual(error.diagnostics?.partitioningPlanner, {
        selectedNodeCount: 1,
        selectedNodeIds: ['seed-1'],
        admissionReadyNodeCount: 0,
        admissionReadyNodeIds: [],
        readyReplicaNodeCount: 0,
        readyReplicaNodeIds: [],
        replicaBearingNodeCount: 1,
        replicaBearingNodeIds: ['seed-1'],
        partitionCount: 1,
        readinessReasonHistogram: null,
      });
      return true;
    },
  );
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

test('table-distribution-helpers surfaces planner diagnostics when ' +
  'partition growth times out after load is runnable', async () => {
  let partitionSampleCount = 0;
  const plannerDiagnostics = {
    selectedNodeCount: 5,
    selectedNodeIds: ['node-2', 'node-3', 'node-4', 'node-5', 'node-6'],
    admissionReadyNodeCount: 4,
    admissionReadyNodeIds: ['node-2', 'node-4', 'node-5', 'node-6'],
    readyReplicaNodeCount: 1,
    readyReplicaNodeIds: ['node-2'],
    replicaBearingNodeCount: 3,
    replicaBearingNodeIds: ['node-2', 'node-3', 'seed-1'],
    partitionCount: 3,
    readinessReasonHistogram: {
      leadership_unstable: 4,
    },
  };
  const seedNode = {
    id: 'seed-1',
    async query(sql) {
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        partitionSampleCount += 1;
        if (partitionSampleCount === 1) {
          return {
            rows: [{partition_id: 'bench-p1'}],
          };
        }
        return {
          rows: [
            {partition_id: 'bench-p1'},
            {partition_id: 'bench-p2'},
            {partition_id: 'bench-p3'},
          ],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        if (partitionSampleCount <= 1) {
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
            {partition_id: 'bench-p2', node_id: 'seed-1', status: 'active'},
            {partition_id: 'bench-p2', node_id: 'node-2', status: 'active'},
            {partition_id: 'bench-p2', node_id: 'node-3', status: 'active'},
            {partition_id: 'bench-p3', node_id: 'seed-1', status: 'active'},
            {partition_id: 'bench-p3', node_id: 'node-2', status: 'active'},
            {partition_id: 'bench-p3', node_id: 'node-3', status: 'active'},
          ],
        };
      }
      return {rows: []};
    },
  };

  await assert.rejects(
    waitForPartitionGrowthAndSpread(seedNode, {
      tableName: 'benchmark_events',
      timeoutMs: 40,
      pollIntervalMs: 5,
      minAdditionalPartitions: 2,
      minDistinctReplicaNodes: 5,
      plannerDiagnosticsResolver: () => plannerDiagnostics,
    }),
    (error) => {
      assert.match(error.message, /failureMode=replica_spread_stalled/i);
      assert.match(error.message, /selectedNodeIds=node-2,node-3,node-4,node-5,node-6/i);
      assert.match(error.message, /admissionReadyNodeIds=node-2,node-4,node-5,node-6/i);
      assert.match(error.message, /readinessReasonHistogram=leadership_unstable:4/i);
      assert.deepEqual(error.diagnostics?.partitioningPlanner, plannerDiagnostics);
      assert.equal(
        error.diagnostics?.partitionGrowth?.tableName,
        'benchmark_events',
      );
      assert.equal(
        error.diagnostics?.partitionGrowth?.failureMode,
        'replica_spread_stalled',
      );
      assert.equal(
        error.diagnostics?.partitionGrowth?.baselinePartitionCount,
        1,
      );
      assert.equal(
        error.diagnostics?.partitionGrowth?.currentPartitionCount,
        3,
      );
      assert.equal(
        error.diagnostics?.partitionGrowth?.additionalPartitionCount,
        2,
      );
      assert.equal(
        error.diagnostics?.partitionGrowth?.replicaNodeCount,
        3,
      );
      assert.ok(
        error.diagnostics?.partitionGrowth?.sampleCount >= 2,
        'expected timeout diagnostics to include at least two samples',
      );
      assert.equal(
        error.diagnostics?.partitionGrowth?.transientQueryErrors,
        0,
      );
      assert.equal(
        error.diagnostics?.partitionGrowth?.lastQueryError,
        'none',
      );
      return true;
    },
  );
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
