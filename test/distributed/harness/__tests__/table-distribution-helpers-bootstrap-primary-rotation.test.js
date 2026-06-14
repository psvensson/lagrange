import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {TABLE_DISTRIBUTION_TABLE_BOOTSTRAP_HELPERS} from
  '../../scenarios/table-distribution-helpers-table-bootstrap.js';

const {
  ensureBenchmarkPartitioningTable,
  queryTableId,
  queryPartitionIdsByTableId,
  TABLE_BOOTSTRAP_VISIBILITY_STATE,
  buildTableBootstrapVisibilitySnapshot,
  shouldExtendTableBootstrapForUnavailableCreate,
} = TABLE_DISTRIBUTION_TABLE_BOOTSTRAP_HELPERS;

const PARTITIONS_SQL_FRAGMENT = 'FROM partitions';
const SERVICES_SQL_FRAGMENT = 'FROM services';
const TABLES_SQL_FRAGMENT = 'FROM tables';
const TEST_MULTI_NODE_CREATE_TIMEOUT_MS = 5000;
const TEST_SINGLE_NODE_CREATE_TIMEOUT_MS = 15000;
const TEST_PARTITION_BOOTSTRAP_ALT_TIMEOUT_MS = 5000;
const TEST_PARTITION_BOOTSTRAP_TIMEOUT_MS = 30000;
const TEST_EXHAUSTED_CREATE_TIMEOUT_MS = 30001;
const TEST_SHARED_VISIBILITY_TIMEOUT_MS = 90;
const TEST_BOOTSTRAP_NO_PROGRESS_TIMEOUT_MS = 1000;
const TEST_BOOTSTRAP_READINESS_TIMEOUT_MS = 7;
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
  'before probing timed-out primary visibility', async () => {
  const createCalls = [];
  let seedVisibilityQueryCount = 0;
  let repairCount = 0;
  let successfulAlternateCreateCommitted = false;
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
        fakeNow += options.timeoutMs;
        throw new Error(
          'Admin API query timed out for node seed-1 on lane control after ' +
          String(options.timeoutMs) + 'ms',
        );
      }
      if (sql.includes('control_snapshot_local(true)')) {
        repairCount += 1;
        return {rows: [{scope: 'local'}]};
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        seedVisibilityQueryCount += 1;
        fakeNow += options.timeoutMs;
        throw new Error(
          'Admin API query timed out for node seed-1 on lane snapshot after ' +
          String(options.timeoutMs) + 'ms',
        );
      }
      return {rows: []};
    },
  };
  const unavailableAlternateNode = {
    id: 'node-2',
    async queryWithTimeout(sql, _params, options = {}) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        createCalls.push({
          nodeId: 'node-2',
          timeoutMs: options.timeoutMs,
        });
        throw new Error(
          'Admin API query failed for node node-2 on lane control: ' +
          'SQL query engine not available',
        );
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        throw new Error(
          'Admin API query failed for node node-2 on lane snapshot: ' +
          'SQL query engine not available',
        );
      }
      return {rows: []};
    },
  };
  const successfulAlternateNode = {
    id: 'node-3',
    async queryWithTimeout(sql, _params, options = {}) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        createCalls.push({
          nodeId: 'node-3',
          timeoutMs: options.timeoutMs,
        });
        successfulAlternateCreateCommitted = true;
        return {rows: []};
      }
      if (sql.includes('control_snapshot_local(true)')) {
        repairCount += 1;
        return {rows: [{scope: 'local'}]};
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {
          rows: successfulAlternateCreateCommitted ?
            [{table_id: 'tbl-benchmark-events-timeout-rerouted'}] :
            [],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        return {
          rows: successfulAlternateCreateCommitted ?
            [buildVisiblePartitionRow(
              'tbl-benchmark-events-timeout-rerouted-p1',
              {leaderNodeId: 'node-3'},
            )] :
            [],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        return {
          rows: successfulAlternateCreateCommitted ?
            [buildActiveLeaderServiceRow(
              'tbl-benchmark-events-timeout-rerouted-p1',
              {nodeId: 'node-3'},
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
      queryNodes: [unavailableAlternateNode, successfulAlternateNode],
    });

    assert.equal(ensured.tableId, 'tbl-benchmark-events-timeout-rerouted');
    assert.equal(ensured.tableBootstrapVisibilityState,
      TABLE_BOOTSTRAP_VISIBILITY_STATE.PARTITIONS_VISIBLE);
    assert.ok(
      seedVisibilityQueryCount > 0 &&
        seedVisibilityQueryCount <= createCalls.length + 1,
      'visibility probes should stay bounded while create primary reroutes',
    );
    assert.equal(repairCount, 0);
    assert.deepEqual(createCalls, [
      {
        nodeId: 'seed-1',
        timeoutMs: TEST_MULTI_NODE_CREATE_TIMEOUT_MS,
      },
      {
        nodeId: 'node-2',
        timeoutMs: TEST_PARTITION_BOOTSTRAP_ALT_TIMEOUT_MS,
      },
      {
        nodeId: 'node-3',
        timeoutMs: TEST_PARTITION_BOOTSTRAP_ALT_TIMEOUT_MS,
      },
    ]);
  } finally {
    Date.now = originalDateNow;
    fakeNow = 0;
  }
});

test('benchmark table_id visibility shares one timeout across candidates',
  async () => {
    const originalDateNow = Date.now;
    let fakeNow = 0;
    Date.now = () => fakeNow;
    const queryTimeouts = [];
    const createNode = (nodeId) => ({
      id: nodeId,
      async queryWithTimeout(_sql, _params, options = {}) {
        queryTimeouts.push({
          nodeId,
          timeoutMs: options.timeoutMs,
        });
        fakeNow += options.timeoutMs;
        throw new Error(
          'Admin API query timed out for node ' +
            nodeId +
            ' on lane snapshot after ' +
            String(options.timeoutMs) +
            'ms',
        );
      },
    });
    const seedNode = createNode('seed-1');
    const alternateNode = createNode('node-2');
    const finalNode = createNode('node-3');

    try {
      await assert.rejects(
        queryTableId(seedNode, 'benchmark_events', {
          timeoutMs: TEST_SHARED_VISIBILITY_TIMEOUT_MS,
          queryNodes: [alternateNode, finalNode],
        }),
        /timed out/i,
      );

      assert.deepEqual(queryTimeouts, [
        {nodeId: 'seed-1', timeoutMs: 30},
        {nodeId: 'node-2', timeoutMs: 30},
        {nodeId: 'node-3', timeoutMs: 30},
      ]);
      assert.equal(fakeNow, TEST_SHARED_VISIBILITY_TIMEOUT_MS);
    } finally {
      Date.now = originalDateNow;
    }
  });

test('benchmark partition visibility shares one timeout across candidates',
  async () => {
    const originalDateNow = Date.now;
    let fakeNow = 0;
    Date.now = () => fakeNow;
    const queryTimeouts = [];
    const createNode = (nodeId) => ({
      id: nodeId,
      async queryWithTimeout(_sql, _params, options = {}) {
        queryTimeouts.push({
          nodeId,
          timeoutMs: options.timeoutMs,
        });
        fakeNow += options.timeoutMs;
        throw new Error(
          'Admin API query timed out for node ' +
            nodeId +
            ' on lane snapshot after ' +
            String(options.timeoutMs) +
            'ms',
        );
      },
    });
    const seedNode = createNode('seed-1');
    const alternateNode = createNode('node-2');
    const finalNode = createNode('node-3');

    try {
      await assert.rejects(
        queryPartitionIdsByTableId(seedNode, 'tbl-shared-timeout', {
          timeoutMs: TEST_SHARED_VISIBILITY_TIMEOUT_MS,
          queryNodes: [alternateNode, finalNode],
        }),
        /timed out/i,
      );

      assert.deepEqual(queryTimeouts, [
        {nodeId: 'seed-1', timeoutMs: 30},
        {nodeId: 'node-2', timeoutMs: 30},
        {nodeId: 'node-3', timeoutMs: 30},
      ]);
      assert.equal(fakeNow, TEST_SHARED_VISIBILITY_TIMEOUT_MS);
    } finally {
      Date.now = originalDateNow;
    }
  });

test('benchmark table bootstrap unavailable grace ignores ordinary timeouts',
  async () => {
    const originalDateNow = Date.now;
    Date.now = () => TEST_PARTITION_BOOTSTRAP_TIMEOUT_MS;
    const createQueryNodes = [{id: 'seed-1'}, {id: 'node-2'}];
    const bootstrapVisibilitySnapshot = buildTableBootstrapVisibilitySnapshot();

    try {
      assert.equal(
        shouldExtendTableBootstrapForUnavailableCreate({
          lastCreateError: new Error(
            'Admin API query timed out for node seed-1 on lane control',
          ),
          createQueryNodes,
          bootstrapVisibilitySnapshot,
          deadlineAtMs: TEST_PARTITION_BOOTSTRAP_TIMEOUT_MS,
          unavailableGraceDeadlineAtMs:
            TEST_PARTITION_BOOTSTRAP_TIMEOUT_MS +
            TEST_PARTITION_BOOTSTRAP_TIMEOUT_MS,
        }),
        false,
      );
      assert.equal(
        shouldExtendTableBootstrapForUnavailableCreate({
          lastCreateError: new Error(
            'Admin API query failed for node seed-1 on lane control: ' +
              'SQL query engine not available',
          ),
          createQueryNodes,
          bootstrapVisibilitySnapshot,
          deadlineAtMs: TEST_PARTITION_BOOTSTRAP_TIMEOUT_MS,
          unavailableGraceDeadlineAtMs:
            TEST_PARTITION_BOOTSTRAP_TIMEOUT_MS +
            TEST_PARTITION_BOOTSTRAP_TIMEOUT_MS,
        }),
        true,
      );
    } finally {
      Date.now = originalDateNow;
    }
  });

test('benchmark table bootstrap readiness probes share the no-progress budget',
  async () => {
    const originalDateNow = Date.now;
    Date.now = () => 0;
    const readinessTimeouts = [];
    let createCommitted = false;
    const seedNode = {
      id: 'seed-1',
      async probeBootstrapReadiness(options = {}) {
        readinessTimeouts.push(options.timeoutMs);
        return {reasons: []};
      },
      async queryWithTimeout(sql, _params, _options = {}) {
        if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
          createCommitted = true;
          return {rows: []};
        }
        if (sql.includes(TABLES_SQL_FRAGMENT)) {
          return {
            rows: createCommitted ?
              [{table_id: 'tbl-benchmark-events-readiness-budget'}] :
              [],
          };
        }
        if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
          return {
            rows: createCommitted ?
              [buildVisiblePartitionRow(
                'tbl-benchmark-events-readiness-budget-p1',
              )] :
              [],
          };
        }
        if (sql.includes(SERVICES_SQL_FRAGMENT)) {
          return {
            rows: createCommitted ?
              [buildActiveLeaderServiceRow(
                'tbl-benchmark-events-readiness-budget-p1',
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
        timeoutMs: TEST_SHARED_VISIBILITY_TIMEOUT_MS,
        noProgressTimeoutMs: TEST_BOOTSTRAP_READINESS_TIMEOUT_MS,
      });

      assert.equal(
        ensured.tableId,
        'tbl-benchmark-events-readiness-budget',
      );
      assert.ok(readinessTimeouts.length > 0);
      assert.ok(
        readinessTimeouts.every(
          (timeoutMs) => timeoutMs === TEST_BOOTSTRAP_READINESS_TIMEOUT_MS,
        ),
      );
    } finally {
      Date.now = originalDateNow;
    }
  });

test('benchmark table bootstrap repair queries share remaining deadline',
  async () => {
    const originalDateNow = Date.now;
    let fakeNow = 0;
    Date.now = () => fakeNow;
    const repairTimeouts = [];
    let repairApplied = false;
    const seedNode = {
      id: 'seed-1',
      async queryWithTimeout(sql, _params, options = {}) {
        if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
          if (repairApplied) {
            return {rows: []};
          }
          fakeNow += options.timeoutMs;
          throw new Error(
            'Admin API query timed out for node seed-1 on lane control after ' +
              String(options.timeoutMs) +
              'ms',
          );
        }
        if (sql.includes('control_snapshot_local(true)')) {
          repairTimeouts.push(options.timeoutMs);
          repairApplied = true;
          return {rows: [{scope: 'forced'}]};
        }
        if (sql.includes('control_snapshot_local()')) {
          repairTimeouts.push(options.timeoutMs);
          return {rows: []};
        }
        if (sql.includes(TABLES_SQL_FRAGMENT)) {
          return {
            rows: repairApplied ?
              [{table_id: 'tbl-benchmark-events-repair-budget'}] :
              [],
          };
        }
        if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
          return {
            rows: repairApplied ?
              [buildVisiblePartitionRow(
                'tbl-benchmark-events-repair-budget-p1',
              )] :
              [],
          };
        }
        if (sql.includes(SERVICES_SQL_FRAGMENT)) {
          return {
            rows: repairApplied ?
              [buildActiveLeaderServiceRow(
                'tbl-benchmark-events-repair-budget-p1',
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
        queryNodes: [seedNode],
      });

      assert.equal(ensured.tableId, 'tbl-benchmark-events-repair-budget');
      assert.deepEqual(repairTimeouts, [
        TEST_PARTITION_BOOTSTRAP_TIMEOUT_MS -
          TEST_SINGLE_NODE_CREATE_TIMEOUT_MS,
        TEST_PARTITION_BOOTSTRAP_TIMEOUT_MS -
          TEST_SINGLE_NODE_CREATE_TIMEOUT_MS,
      ]);
    } finally {
      Date.now = originalDateNow;
    }
  });

test('benchmark table bootstrap fails on sustained no-progress before the ' +
  'outer timeout expires', async () => {
  const originalDateNow = Date.now;
  let fakeNow = 0;
  Date.now = () => fakeNow;
  const seedNode = {
    id: 'seed-1',
    async queryWithTimeout(sql, _params, options = {}) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        fakeNow += options.timeoutMs;
        throw new Error(
          'Admin API query failed for node seed-1 on lane control: ' +
          'SQL query engine not available',
        );
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {rows: []};
      }
      return {rows: []};
    },
  };

  try {
    await assert.rejects(
      ensureBenchmarkPartitioningTable(seedNode, {
        tableName: 'benchmark_events',
        requiredBootstrapVisibilityState:
          TABLE_BOOTSTRAP_VISIBILITY_STATE.PARTITIONS_VISIBLE,
        timeoutMs: TEST_PARTITION_BOOTSTRAP_TIMEOUT_MS * 4,
        noProgressTimeoutMs: TEST_BOOTSTRAP_NO_PROGRESS_TIMEOUT_MS,
      }),
      (error) => {
        assert.match(error.message, /table_bootstrap_no_progress/);
        assert.match(error.message, /noProgressTimeoutMs=1000/);
        assert.match(error.message, /lastProgressToken=/);
        return true;
      },
    );
    assert.ok(
      fakeNow < TEST_PARTITION_BOOTSTRAP_TIMEOUT_MS * 4,
      'no-progress failure should stop before the outer bootstrap timeout',
    );
  } finally {
    Date.now = originalDateNow;
    fakeNow = 0;
  }
});

test('benchmark table bootstrap retries recovered create candidates ' +
  'before authoritative repair', async () => {
  const createCalls = [];
  let nodeTwoCreateAttempts = 0;
  let repairCount = 0;
  let nodeTwoCreateCommitted = false;
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
        fakeNow += options.timeoutMs;
        throw new Error(
          'Admin API query timed out for node seed-1 on lane control after ' +
          String(options.timeoutMs) + 'ms',
        );
      }
      if (sql.includes('control_snapshot_local(true)')) {
        repairCount += 1;
        throw new Error('repair should not run without create visibility');
      }
      return {rows: []};
    },
  };
  const recoveredAlternateNode = {
    id: 'node-2',
    async queryWithTimeout(sql, _params, options = {}) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        nodeTwoCreateAttempts += 1;
        createCalls.push({
          nodeId: 'node-2',
          timeoutMs: options.timeoutMs,
        });
        if (nodeTwoCreateAttempts === 1) {
          throw new Error(
            'Admin API query failed for node node-2 on lane control: ' +
            'SQL query engine not available',
          );
        }
        nodeTwoCreateCommitted = true;
        return {rows: []};
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {
          rows: nodeTwoCreateCommitted ?
            [{table_id: 'tbl-benchmark-events-recovered-candidate'}] :
            [],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        return {
          rows: nodeTwoCreateCommitted ?
            [buildVisiblePartitionRow(
              'tbl-benchmark-events-recovered-candidate-p1',
              {leaderNodeId: 'node-2'},
            )] :
            [],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        return {
          rows: nodeTwoCreateCommitted ?
            [buildActiveLeaderServiceRow(
              'tbl-benchmark-events-recovered-candidate-p1',
              {nodeId: 'node-2'},
            )] :
            [],
        };
      }
      return {rows: []};
    },
  };
  const unavailableAlternateNode = {
    id: 'node-3',
    async queryWithTimeout(sql, _params, options = {}) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        createCalls.push({
          nodeId: 'node-3',
          timeoutMs: options.timeoutMs,
        });
        throw new Error(
          'Admin API query failed for node node-3 on lane control: ' +
          'SQL query engine not available',
        );
      }
      return {rows: []};
    },
  };

  try {
    const ensured = await ensureBenchmarkPartitioningTable(seedNode, {
      tableName: 'benchmark_events',
      requiredBootstrapVisibilityState:
        TABLE_BOOTSTRAP_VISIBILITY_STATE.PARTITIONS_VISIBLE,
      queryNodes: [recoveredAlternateNode, unavailableAlternateNode],
    });

    assert.equal(ensured.tableId,
      'tbl-benchmark-events-recovered-candidate');
    assert.equal(ensured.tableBootstrapVisibilityState,
      TABLE_BOOTSTRAP_VISIBILITY_STATE.PARTITIONS_VISIBLE);
    assert.equal(repairCount, 0);
    assert.deepEqual(createCalls, [
      {
        nodeId: 'seed-1',
        timeoutMs: TEST_MULTI_NODE_CREATE_TIMEOUT_MS,
      },
      {
        nodeId: 'node-2',
        timeoutMs: TEST_PARTITION_BOOTSTRAP_ALT_TIMEOUT_MS,
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

test('benchmark table bootstrap extends unavailable create candidates ' +
  'until a candidate recovers', async () => {
  const createCalls = [];
  let nodeTwoCreateAttempts = 0;
  let repairCount = 0;
  let nodeTwoCreateCommitted = false;
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
        fakeNow += options.timeoutMs;
        throw new Error(
          'Admin API query timed out for node seed-1 on lane control after ' +
          String(options.timeoutMs) + 'ms',
        );
      }
      if (sql.includes('control_snapshot_local(true)')) {
        repairCount += 1;
        throw new Error('repair should not run for unavailable create grace');
      }
      return {rows: []};
    },
  };
  const recoveredAlternateNode = {
    id: 'node-2',
    async queryWithTimeout(sql, _params, options = {}) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        nodeTwoCreateAttempts += 1;
        createCalls.push({
          nodeId: 'node-2',
          timeoutMs: options.timeoutMs,
        });
        if (nodeTwoCreateAttempts === 1) {
          fakeNow += 10000;
          throw new Error(
            'Admin API query failed for node node-2 on lane control: ' +
            'SQL query engine not available',
          );
        }
        nodeTwoCreateCommitted = true;
        return {rows: []};
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {
          rows: nodeTwoCreateCommitted ?
            [{table_id: 'tbl-benchmark-events-unavailable-grace'}] :
            [],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        return {
          rows: nodeTwoCreateCommitted ?
            [buildVisiblePartitionRow(
              'tbl-benchmark-events-unavailable-grace-p1',
              {leaderNodeId: 'node-2'},
            )] :
            [],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        return {
          rows: nodeTwoCreateCommitted ?
            [buildActiveLeaderServiceRow(
              'tbl-benchmark-events-unavailable-grace-p1',
              {nodeId: 'node-2'},
            )] :
            [],
        };
      }
      return {rows: []};
    },
  };
  const unavailableAlternateNode = {
    id: 'node-3',
    async queryWithTimeout(sql, _params, options = {}) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        createCalls.push({
          nodeId: 'node-3',
          timeoutMs: options.timeoutMs,
        });
        fakeNow += 15000;
        throw new Error(
          'Admin API query failed for node node-3 on lane control: ' +
          'SQL query engine not available',
        );
      }
      return {rows: []};
    },
  };

  try {
    const ensured = await ensureBenchmarkPartitioningTable(seedNode, {
      tableName: 'benchmark_events',
      requiredBootstrapVisibilityState:
        TABLE_BOOTSTRAP_VISIBILITY_STATE.PARTITIONS_VISIBLE,
      queryNodes: [recoveredAlternateNode, unavailableAlternateNode],
    });

    assert.equal(fakeNow, TEST_MULTI_NODE_CREATE_TIMEOUT_MS + 10000);
    assert.equal(ensured.tableId,
      'tbl-benchmark-events-unavailable-grace');
    assert.equal(ensured.tableBootstrapVisibilityState,
      TABLE_BOOTSTRAP_VISIBILITY_STATE.PARTITIONS_VISIBLE);
    assert.equal(repairCount, 0);
    assert.deepEqual(createCalls, [
      {
        nodeId: 'seed-1',
        timeoutMs: TEST_MULTI_NODE_CREATE_TIMEOUT_MS,
      },
      {
        nodeId: 'node-2',
        timeoutMs: TEST_PARTITION_BOOTSTRAP_ALT_TIMEOUT_MS,
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

test('benchmark table bootstrap preserves post-create visibility budget ' +
  'instead of issuing exhausted create attempts', async () => {
  const createCalls = [];
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
        fakeNow += 20000;
        throw new Error(
          'Admin API query timed out for node seed-1 on lane control after ' +
          String(options.timeoutMs) + 'ms',
        );
      }
      if (sql.includes('control_snapshot_local')) {
        fakeNow = TEST_EXHAUSTED_CREATE_TIMEOUT_MS;
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
        throw new Error('exhausted create budget should be reserved');
      }
      if (sql.includes('control_snapshot_local')) {
        return {rows: [{scope: 'local'}]};
      }
      return {rows: []};
    },
  };

  try {
    await assert.rejects(
      ensureBenchmarkPartitioningTable(seedNode, {
        tableName: 'benchmark_events',
        requiredBootstrapVisibilityState:
          TABLE_BOOTSTRAP_VISIBILITY_STATE.PARTITIONS_VISIBLE,
        queryNodes: [alternateNode],
      }),
      /Timed out waiting for table partition visibility/,
    );

    assert.deepEqual(createCalls, [
      {
        nodeId: 'seed-1',
        timeoutMs: TEST_MULTI_NODE_CREATE_TIMEOUT_MS,
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

test('benchmark table bootstrap applies authoritative repair after a ' +
  'single-node SQL-unavailable create', async () => {
  const createCalls = [];
  let repairCount = 0;
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
        fakeNow = TEST_EXHAUSTED_CREATE_TIMEOUT_MS;
        throw new Error(
          'Admin API query failed for node seed-1 on lane control: ' +
          'SQL query engine not available',
        );
      }
      if (sql.includes('control_snapshot_local(true)')) {
        repairCount += 1;
        return {rows: [{scope: 'local'}]};
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {
          rows: repairCount > 0 ?
            [{table_id: 'tbl-benchmark-events-sql-unavailable-repaired'}] :
            [],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        return {
          rows: repairCount > 0 ?
            [buildVisiblePartitionRow(
              'tbl-benchmark-events-sql-unavailable-repaired-p1',
            )] :
            [],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        return {
          rows: repairCount > 0 ?
            [buildActiveLeaderServiceRow(
              'tbl-benchmark-events-sql-unavailable-repaired-p1',
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
      queryNodes: [seedNode],
    });

    assert.equal(repairCount, 1);
    assert.equal(createCalls.length, 1);
    assert.equal(ensured.tableId,
      'tbl-benchmark-events-sql-unavailable-repaired');
    assert.equal(ensured.tableBootstrapVisibilityState,
      TABLE_BOOTSTRAP_VISIBILITY_STATE.PARTITIONS_VISIBLE);
    assert.equal(ensured.tableVisibilityRepairApplied, true);
  } finally {
    Date.now = originalDateNow;
    fakeNow = 0;
  }
});

test('benchmark table bootstrap applies authoritative repair after ' +
  'SQL-unavailable create candidates exhaust grace', async () => {
  const createCalls = [];
  let repairCount = 0;
  let repairApplied = false;
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
        fakeNow += TEST_MULTI_NODE_CREATE_TIMEOUT_MS;
        throw new Error(
          'Admin API query failed for node seed-1 on lane control: ' +
          'SQL query engine not available',
        );
      }
      if (sql.includes('control_snapshot_local(true)')) {
        repairCount += 1;
        repairApplied = true;
        return {rows: [{scope: 'local'}]};
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {
          rows: repairApplied ?
            [{table_id: 'tbl-benchmark-events-sql-grace-repaired'}] :
            [],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        return {
          rows: repairApplied ?
            [buildVisiblePartitionRow(
              'tbl-benchmark-events-sql-grace-repaired-p1',
            )] :
            [],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        return {
          rows: repairApplied ?
            [buildActiveLeaderServiceRow(
              'tbl-benchmark-events-sql-grace-repaired-p1',
            )] :
            [],
        };
      }
      return {rows: []};
    },
  };
  const unavailableAlternateNode = {
    id: 'node-2',
    async queryWithTimeout(sql, _params, options = {}) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        createCalls.push({
          nodeId: 'node-2',
          timeoutMs: options.timeoutMs,
        });
        fakeNow += TEST_PARTITION_BOOTSTRAP_TIMEOUT_MS -
          TEST_MULTI_NODE_CREATE_TIMEOUT_MS;
        throw new Error(
          'Admin API query failed for node node-2 on lane control: ' +
          'SQL query engine not available',
        );
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {rows: []};
      }
      return {rows: []};
    },
  };

  try {
    const ensured = await ensureBenchmarkPartitioningTable(seedNode, {
      tableName: 'benchmark_events',
      requiredBootstrapVisibilityState:
        TABLE_BOOTSTRAP_VISIBILITY_STATE.PARTITIONS_VISIBLE,
      queryNodes: [unavailableAlternateNode],
      noProgressTimeoutMs: 0,
    });

    assert.equal(repairCount, 1);
    assert.equal(ensured.tableId,
      'tbl-benchmark-events-sql-grace-repaired');
    assert.equal(ensured.tableBootstrapVisibilityState,
      TABLE_BOOTSTRAP_VISIBILITY_STATE.PARTITIONS_VISIBLE);
    assert.equal(ensured.tableVisibilityRepairApplied, true);
    assert.deepEqual(createCalls.map((call) => call.nodeId), [
      'seed-1',
      'node-2',
      'node-2',
      'node-2',
    ]);
  } finally {
    Date.now = originalDateNow;
    fakeNow = 0;
  }
});

test('benchmark table bootstrap repairs and observes visibility when a ' +
  'selected create timeout exhausts the bootstrap deadline', async () => {
  let seedRepairCount = 0;
  let alternateRepairCount = 0;
  let repairApplied = false;
  const originalDateNow = Date.now;
  let fakeNow = 0;
  Date.now = () => fakeNow;
  const seedNode = {
    id: 'seed-1',
    async queryWithTimeout(sql, _params, options = {}) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        fakeNow += TEST_EXHAUSTED_CREATE_TIMEOUT_MS;
        throw new Error(
          'Admin API query timed out for node seed-1 on lane control after ' +
          String(options.timeoutMs) + 'ms',
        );
      }
      if (sql.includes('control_snapshot_local(true)')) {
        seedRepairCount += 1;
        throw new Error('selected repair unavailable after timeout');
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {
          rows: repairApplied ?
            [{table_id: 'tbl-benchmark-events-post-timeout-repaired'}] :
            [],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        return {
          rows: repairApplied ?
            [buildVisiblePartitionRow(
              'tbl-benchmark-events-post-timeout-repaired-p1',
            )] :
            [],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        return {
          rows: repairApplied ?
            [buildActiveLeaderServiceRow(
              'tbl-benchmark-events-post-timeout-repaired-p1',
            )] :
            [],
        };
      }
      return {rows: []};
    },
  };
  const alternateNode = {
    id: 'node-2',
    async queryWithTimeout(sql, _params, _options = {}) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        throw new Error('alternate create should not run after deadline');
      }
      if (sql.includes('control_snapshot_local(true)')) {
        alternateRepairCount += 1;
        repairApplied = true;
        return {rows: [{scope: 'local'}]};
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {
          rows: repairApplied ?
            [{table_id: 'tbl-benchmark-events-post-timeout-repaired'}] :
            [],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        return {
          rows: repairApplied ?
            [buildVisiblePartitionRow(
              'tbl-benchmark-events-post-timeout-repaired-p1',
              {leaderNodeId: 'node-2'},
            )] :
            [],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        return {
          rows: repairApplied ?
            [buildActiveLeaderServiceRow(
              'tbl-benchmark-events-post-timeout-repaired-p1',
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

    assert.ok(seedRepairCount > 0);
    assert.equal(alternateRepairCount, 1);
    assert.equal(ensured.tableId,
      'tbl-benchmark-events-post-timeout-repaired');
    assert.equal(ensured.tableBootstrapVisibilityState,
      TABLE_BOOTSTRAP_VISIBILITY_STATE.PARTITIONS_VISIBLE);
    assert.equal(ensured.tableVisibilityRepairApplied, true);
    assert.match(String(ensured.createTimeoutError || ''), /timed out/i);
  } finally {
    Date.now = originalDateNow;
    fakeNow = 0;
  }
});
