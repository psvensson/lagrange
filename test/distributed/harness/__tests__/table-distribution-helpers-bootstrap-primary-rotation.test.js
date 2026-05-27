import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {
  ensureBenchmarkPartitioningTable,
  TABLE_BOOTSTRAP_VISIBILITY_STATE,
} from '../../scenarios/table-distribution-helpers.js';

const PARTITIONS_SQL_FRAGMENT = 'FROM partitions';
const SERVICES_SQL_FRAGMENT = 'FROM services';
const TABLES_SQL_FRAGMENT = 'FROM tables';
const TEST_CONTROL_QUERY_TIMEOUT_MS = 15000;
const TEST_PARTITION_BOOTSTRAP_ALT_TIMEOUT_MS = 5000;
const TEST_DEFAULT_PARTITION_REPLICA_COUNT = 1;
const TEST_SERVICE_STATUS_ACTIVE = 'active';
const TEST_RAFT_ROLE_LEADER = 'leader';

function buildVisiblePartitionRow(partitionId, options = {}) {
  return {
    partition_id: partitionId,
    replica_count:
      Number.isInteger(options.replicaCount) &&
        options.replicaCount > 0 ?
        options.replicaCount :
        TEST_DEFAULT_PARTITION_REPLICA_COUNT,
    leader_node_id:
      typeof options.leaderNodeId === 'string' &&
        options.leaderNodeId.length > 0 ?
        options.leaderNodeId :
        'seed-1',
  };
}

function buildActiveLeaderServiceRow(partitionId, options = {}) {
  return {
    partition_id: partitionId,
    node_id:
      typeof options.nodeId === 'string' && options.nodeId.length > 0 ?
        options.nodeId :
        'seed-1',
    status: TEST_SERVICE_STATUS_ACTIVE,
    raft_role: TEST_RAFT_ROLE_LEADER,
  };
}

test('benchmark table bootstrap reroutes a timed-out create mutation ' +
  'after an empty visibility sweep', async () => {
  const createCalls = [];
  let repairCount = 0;
  let alternateCreateCommitted = false;
  const originalDateNow = Date.now;
  let fakeNow = 0;
  Date.now = () => fakeNow;
  const seedNode = {
    id: 'seed-1',
    async queryWithTimeout(sql, _params, options = {}) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        createCalls.push({
          nodeId: 'seed-1',
          timeoutMs: options.timeoutMs,
        });
        fakeNow += TEST_CONTROL_QUERY_TIMEOUT_MS;
        throw new Error(
          'Admin API query timed out for node seed-1 on lane control after ' +
          String(options.timeoutMs) + 'ms',
        );
      }
      if (sql.includes('control_snapshot_local(true)')) {
        repairCount += 1;
        return {rows: [{scope: 'local'}]};
      }
      return {rows: []};
    },
  };
  const alternateNode = {
    id: 'node-2',
    async queryWithTimeout(sql, _params, options = {}) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        createCalls.push({
          nodeId: 'node-2',
          timeoutMs: options.timeoutMs,
        });
        alternateCreateCommitted = true;
        return {rows: []};
      }
      if (sql.includes('control_snapshot_local(true)')) {
        repairCount += 1;
        return {rows: [{scope: 'local'}]};
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {
          rows: alternateCreateCommitted ?
            [{table_id: 'tbl-benchmark-events-timeout-rerouted'}] :
            [],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        return {
          rows: alternateCreateCommitted ?
            [buildVisiblePartitionRow(
              'tbl-benchmark-events-timeout-rerouted-p1',
              {leaderNodeId: 'node-2'},
            )] :
            [],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        return {
          rows: alternateCreateCommitted ?
            [buildActiveLeaderServiceRow(
              'tbl-benchmark-events-timeout-rerouted-p1',
              {nodeId: 'node-2'},
            )] :
            [],
        };
      }
      return {rows: []};
    },
  };
  try {
    const ensured = await ensureBenchmarkPartitioningTable(seedNode, {
      tableName: 'benchmark_events',
      requiredBootstrapVisibilityState:
        TABLE_BOOTSTRAP_VISIBILITY_STATE.PARTITIONS_VISIBLE,
      queryNodes: [alternateNode],
    });

    assert.equal(ensured.tableId, 'tbl-benchmark-events-timeout-rerouted');
    assert.equal(ensured.tableBootstrapVisibilityState,
      TABLE_BOOTSTRAP_VISIBILITY_STATE.PARTITIONS_VISIBLE);
    assert.equal(repairCount, 0);
    assert.deepEqual(createCalls, [
      {
        nodeId: 'seed-1',
        timeoutMs: TEST_CONTROL_QUERY_TIMEOUT_MS,
      },
      {
        nodeId: 'node-2',
        timeoutMs: TEST_PARTITION_BOOTSTRAP_ALT_TIMEOUT_MS,
      },
    ]);
  } finally {
    Date.now = originalDateNow;
    fakeNow = 0;
  }
});

test('benchmark table bootstrap applies authoritative repair after a ' +
  'single-node create timeout', async () => {
  let repairCount = 0;
  const seedNode = {
    id: 'seed-1',
    async queryWithTimeout(sql, _params, _options = {}) {
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
        return {
          rows: repairCount > 0 ?
            [{table_id: 'tbl-benchmark-events-repaired'}] :
            [],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        return {
          rows: repairCount > 0 ?
            [buildVisiblePartitionRow('tbl-benchmark-events-repaired-p1')] :
            [],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        return {
          rows: repairCount > 0 ?
            [buildActiveLeaderServiceRow(
              'tbl-benchmark-events-repaired-p1',
            )] :
            [],
        };
      }
      return {rows: []};
    },
  };

  const ensured = await ensureBenchmarkPartitioningTable(seedNode, {
    tableName: 'benchmark_events',
    requiredBootstrapVisibilityState:
      TABLE_BOOTSTRAP_VISIBILITY_STATE.PARTITIONS_VISIBLE,
    queryNodes: [seedNode],
  });

  assert.equal(repairCount, 1);
  assert.equal(ensured.tableId, 'tbl-benchmark-events-repaired');
  assert.equal(ensured.tableBootstrapVisibilityState,
    TABLE_BOOTSTRAP_VISIBILITY_STATE.PARTITIONS_VISIBLE);
  assert.equal(ensured.tableVisibilityRepairApplied, true);
  assert.match(String(ensured.createTimeoutError || ''), /timed out/i);
});
