import {registerTableDistributionHelpersReadPathTailMoreTests} from './table-distribution-helpers-read-path-tail-more-test-cases.js';

export function registerTableDistributionHelpersReadPathTailTests({
  test,
  assert,
  admitBenchmarkLoadNodes,
  createPartitioningBenchmarkLoadNodePlan,
  ensureBenchmarkPartitioningTable,
  queryTableDistribution,
  resolvePartitioningBenchmarkLoadOpsPerSec,
  TABLE_BOOTSTRAP_VISIBILITY_STATE,
  waitForPartitionGrowthAndSpread,
  buildBenchmarkCriticalControlPlaneStabilitySnapshot,
  buildBenchmarkLoadAdmissionSnapshot,
  PARTITIONS_SQL_FRAGMENT,
  SERVICES_SQL_FRAGMENT,
  TABLES_SQL_FRAGMENT,
  TEST_DEFAULT_LEADER_NODE_ID,
  TEST_DEFAULT_PARTITION_REPLICA_COUNT,
  TEST_SERVICE_STATUS_ACTIVE,
  TEST_RAFT_ROLE_LEADER,
  TEST_PARTITION_CONVERGENCE_STATE_READY_REPLICA,
  TEST_PARTITION_CONVERGENCE_STATE_REPLICA_BLOCKED,
  TEST_PARTITION_CONVERGENCE_STATE_ROUTED_ADMISSION_ONLY,
  TEST_PARTITION_CONVERGENCE_STATE_ABSENT,
  TEST_DISPATCH_CONTRIBUTION_STATE_LOCAL_PRIMARY,
  TEST_DISPATCH_CONTRIBUTION_STATE_LOCAL_BLOCKED,
  TEST_DISPATCH_CONTRIBUTION_STATE_ROUTED_SUPPORT,
  TEST_DISPATCH_CONTRIBUTION_STATE_NONE,
  TEST_LOCAL_REPLICA_ROLE_UNKNOWN,
  TEST_DEGRADATION_STATE_UNKNOWN,
  TEST_RETRY_AFTER_NONE_MS,
  TEST_TABLE_ID_BOOTSTRAP_TIMEOUT_MS,
  TEST_CONTROL_QUERY_TIMEOUT_MS,
  TEST_CONTROL_QUERY_FAILOVER_MIN_TIMEOUT_MS,
  TEST_TABLE_ID_BOOTSTRAP_FAILOVER_MIN_TIMEOUT_MS,
  TEST_PARTITION_BOOTSTRAP_ALT_TIMEOUT_MS,
  TEST_CONTROL_QUERY_DEFERRED_OUTCOME,
  TEST_PUBLICATION_EPOCH_PENDING_REASON_CODE,
  TEST_PUBLISHED_CONVERGENCE_PENDING_DIMENSION,
  TEST_SELECTION_OBSERVATION_STATE_OBSERVED,
  TEST_SELECTION_OBSERVATION_STATE_DEFERRED,
  buildVisiblePartitionRow,
  buildActiveLeaderServiceRow,
  buildConvergenceEvaluationExpectation,
  buildPlannerDiagnosticsExpectation,
}) {
test('table-distribution-helpers advances create primary across multiple ' +
  'timed-out query nodes before forcing authoritative repair', async () => {
  const createAttemptNodeIds = [];
  const repairNodeIds = [];
  let repairApplied = false;

  const buildTimedOutCreateError = (nodeId, timeoutMs) => {
    const error = new Error(
      'Admin API query timed out for node ' + nodeId +
      ' on lane control after ' + String(timeoutMs) + 'ms',
    );
    error.retryAfterMs = 5;
    return error;
  };

  const seedNode = {
    id: 'seed-1',
    async queryWithTimeout(sql, _params, options = {}) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        createAttemptNodeIds.push('seed-1');
        throw buildTimedOutCreateError('seed-1', options.timeoutMs);
      }
      if (sql.includes('control_snapshot_local(true)')) {
        repairNodeIds.push('seed-1');
        return {rows: [{scope: 'local'}]};
      }
      return {rows: []};
    },
  };
  const alternateNode = {
    id: 'node-2',
    async queryWithTimeout(sql, _params, options = {}) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        createAttemptNodeIds.push('node-2');
        throw buildTimedOutCreateError('node-2', options.timeoutMs);
      }
      if (sql.includes('control_snapshot_local(true)')) {
        repairNodeIds.push('node-2');
        return {rows: [{scope: 'local'}]};
      }
      return {rows: []};
    },
  };
  const repairNode = {
    id: 'node-3',
    async queryWithTimeout(sql, _params, options = {}) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        createAttemptNodeIds.push('node-3');
        throw buildTimedOutCreateError('node-3', options.timeoutMs);
      }
      if (sql.includes('control_snapshot_local(true)')) {
        repairNodeIds.push('node-3');
        repairApplied = true;
        return {rows: [{scope: 'local'}]};
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {
          rows: repairApplied ?
            [{table_id: 'tbl-benchmark-events-rotated-repair'}] :
            [],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        return {
          rows: repairApplied ?
            [buildVisiblePartitionRow(
              'tbl-benchmark-events-rotated-repair-p1',
              {leaderNodeId: 'node-3'},
            )] :
            [],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        return {
          rows: repairApplied ?
            [buildActiveLeaderServiceRow(
              'tbl-benchmark-events-rotated-repair-p1',
              {nodeId: 'node-3'},
            )] :
            [],
        };
      }
      return {rows: []};
    },
  };

  const ensured = await ensureBenchmarkPartitioningTable(seedNode, {
    tableName: 'benchmark_events',
    requirePartitionVisibility: true,
    queryNodes: [alternateNode, repairNode],
  });

  assert.equal(ensured.tableId, 'tbl-benchmark-events-rotated-repair');
  assert.equal(ensured.tableDistributionTopologyState, 'routable');
  assert.equal(ensured.tableVisibilityRepairApplied, true);
  assert.deepEqual(
    createAttemptNodeIds.slice(0, 3),
    ['seed-1', 'node-2', 'node-3'],
    'timed-out create attempts should continue rotating across the available query-node cohort before repair',
  );
  assert.deepEqual(
    repairNodeIds,
    ['seed-1', 'node-2', 'node-3'],
    'authoritative repair should run across every attempted timed-out create primary once bootstrap visibility never appears',
  );
});

test('table-distribution-helpers preserves pending create visibility ' +
  'without forced repair', async () => {
  let repairCount = 0;
  let tableLookupAttempts = 0;
  let partitionLookupAttempts = 0;
  let serviceLookupAttempts = 0;
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
            [buildVisiblePartitionRow('tbl-benchmark-events-pending-p1')] :
            [],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        serviceLookupAttempts += 1;
        return {
          rows: partitionLookupAttempts >= 2 ?
            [buildActiveLeaderServiceRow('tbl-benchmark-events-pending-p1')] :
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
  assert.equal(ensured.tableDistributionTopologyState, 'routable');
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
  assert.ok(
    serviceLookupAttempts >= 1,
    'pending create visibility should keep polling routable partition service visibility',
  );
});

test('table-distribution-helpers forces authoritative repair after a timed-out ' +
  'create when authoritative confirmation exists without visibility state',
async () => {
  let repairCount = 0;
  const seedNode = {
    id: 'seed-1',
    async queryWithTimeout(sql) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        const error = new Error(
          'Admin API query timed out for node seed-1 on lane control after 15000ms',
        );
        error.retryAfterMs = 5;
        error.authoritativeVisibilityConfirmed = true;
        throw error;
      }
      if (sql.includes('control_snapshot_local(true)')) {
        repairCount += 1;
        return {rows: [{scope: 'local'}]};
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {
          rows: repairCount > 0 ?
            [{table_id: 'tbl-benchmark-events-timeout-authoritative-repair'}] :
            [],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        return {
          rows: repairCount > 0 ?
            [buildVisiblePartitionRow(
              'tbl-benchmark-events-timeout-authoritative-repair-p1',
            )] :
            [],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        return {
          rows: repairCount > 0 ?
            [buildActiveLeaderServiceRow(
              'tbl-benchmark-events-timeout-authoritative-repair-p1',
            )] :
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
  assert.equal(
    ensured.tableId,
    'tbl-benchmark-events-timeout-authoritative-repair',
  );
  assert.equal(ensured.tableVisibilityRepairApplied, true);
  assert.equal(ensured.tableDistributionTopologyState, 'routable');
});

test('table-distribution-helpers waits for routable partition services after ' +
  'partition metadata becomes visible', async () => {
  let serviceLookupAttempts = 0;
  const seedNode = {
    id: 'seed-1',
    async queryWithTimeout(sql) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        return {rows: []};
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {
          rows: [{table_id: 'tbl-benchmark-events-routable'}],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        return {
          rows: [{
            partition_id: 'tbl-benchmark-events-routable-p1',
            replica_count: 1,
            leader_node_id: 'seed-1',
          }],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        serviceLookupAttempts += 1;
        return {
          rows: serviceLookupAttempts >= 3 ?
            [{
              partition_id: 'tbl-benchmark-events-routable-p1',
              node_id: 'seed-1',
              status: 'active',
              raft_role: 'leader',
            }] :
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

  assert.equal(ensured.tableId, 'tbl-benchmark-events-routable');
  assert.equal(ensured.tableDistributionTopologyState, 'routable');
  assert.ok(
    serviceLookupAttempts >= 3,
    'expected bootstrap to wait for routable partition service visibility ' +
      'after partition metadata becomes visible',
  );
});

test('table-distribution-helpers can stop at partition visibility when the ' +
  'caller defers routability to a later admission gate', async () => {
  let serviceLookupAttempts = 0;
  const seedNode = {
    id: 'seed-1',
    async queryWithTimeout(sql) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        return {rows: []};
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {
          rows: [{table_id: 'tbl-benchmark-events-bootstrap-only'}],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        return {
          rows: [{
            partition_id: 'tbl-benchmark-events-bootstrap-only-p1',
            replica_count: 1,
            leader_node_id: 'seed-1',
          }],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        serviceLookupAttempts += 1;
        return {rows: []};
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

  assert.equal(ensured.tableId, 'tbl-benchmark-events-bootstrap-only');
  assert.equal(
    ensured.tableBootstrapVisibilityState,
    TABLE_BOOTSTRAP_VISIBILITY_STATE.PARTITIONS_VISIBLE,
  );
  assert.equal(
    ensured.tableBootstrapVisibilityRequirementState,
    TABLE_BOOTSTRAP_VISIBILITY_STATE.PARTITIONS_VISIBLE,
  );
  assert.equal(
    serviceLookupAttempts,
    0,
    'partition-visible bootstrap should not query service topology when a later admission gate owns routability',
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
    queryTimeoutMs: 5,
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
            [buildVisiblePartitionRow(
              'tbl-benchmark-events-control-repair-p1',
            )] :
            [],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        return {
          rows: repairLanes.includes('control') ?
            [buildActiveLeaderServiceRow(
              'tbl-benchmark-events-control-repair-p1',
            )] :
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
    queryTimeoutMs: 5,
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
      queryTimeoutMs: 5,
    },
  );

  try {
    assert.equal(plan.bootstrapRequiredNodeCount, 2);
    assert.equal(plan.targetNodeCount, 5);
    assert.deepEqual(
      plan.initialNodes.map((node) => node.id),
      ['node-2', 'node-3', 'seed-1'],
      'initial partitioning load should keep replica-bearing backfill alive until the usable-spread target exists',
    );
    assert.deepEqual(
      plan.nodeResolver().map((node) => node.id),
      ['node-2', 'node-3', 'node-4', 'node-5', 'node-7'],
      'live dispatch should keep backfilling toward the usable-spread target even after the bootstrap quorum already exists',
    );
    assert.deepEqual(
      plan.getDiagnostics(),
      buildPlannerDiagnosticsExpectation({
        selectedNodeIds: ['node-2', 'node-3', 'node-4', 'node-5', 'node-7'],
        admissionReadyNodeIds: ['node-2', 'node-3', 'node-4', 'node-5', 'node-7'],
        readyReplicaNodeIds: ['node-2', 'node-3'],
        replicaBearingNodeIds: ['node-2', 'node-3', 'seed-1'],
        partitionCount: 1,
        convergenceStateHistogram: {
          absent: 1,
          ready_replica: 2,
          replica_blocked: 1,
          routed_admission_only: 3,
        },
        localPrimaryNodeIds: ['node-2', 'node-3'],
        routedSupportNodeIds: ['node-4', 'node-5', 'node-7'],
        dispatchContributionHistogram: {
          local_blocked: 1,
          local_primary: 2,
          none: 1,
          routed_support: 3,
        },
        degradationStateHistogram: {
          unknown: 7,
        },
        convergenceEvaluations: [
          buildConvergenceEvaluationExpectation({
            nodeId: 'seed-1',
            state: TEST_PARTITION_CONVERGENCE_STATE_REPLICA_BLOCKED,
            dispatchContributionState:
              TEST_DISPATCH_CONTRIBUTION_STATE_LOCAL_BLOCKED,
            replicaBearing: true,
            localReplicaSeen: true,
          }),
          buildConvergenceEvaluationExpectation({
            nodeId: 'node-2',
            state: TEST_PARTITION_CONVERGENCE_STATE_READY_REPLICA,
            dispatchContributionState:
              TEST_DISPATCH_CONTRIBUTION_STATE_LOCAL_PRIMARY,
            replicaBearing: true,
            localReplicaSeen: true,
            localAdmissionReady: true,
            admissionReady: true,
          }),
          buildConvergenceEvaluationExpectation({
            nodeId: 'node-3',
            state: TEST_PARTITION_CONVERGENCE_STATE_READY_REPLICA,
            dispatchContributionState:
              TEST_DISPATCH_CONTRIBUTION_STATE_LOCAL_PRIMARY,
            replicaBearing: true,
            localReplicaSeen: true,
            localAdmissionReady: true,
            admissionReady: true,
          }),
          buildConvergenceEvaluationExpectation({
            nodeId: 'node-4',
            state: TEST_PARTITION_CONVERGENCE_STATE_ROUTED_ADMISSION_ONLY,
            dispatchContributionState:
              TEST_DISPATCH_CONTRIBUTION_STATE_ROUTED_SUPPORT,
            admissionReady: true,
          }),
          buildConvergenceEvaluationExpectation({
            nodeId: 'node-5',
            state: TEST_PARTITION_CONVERGENCE_STATE_ROUTED_ADMISSION_ONLY,
            dispatchContributionState:
              TEST_DISPATCH_CONTRIBUTION_STATE_ROUTED_SUPPORT,
            admissionReady: true,
          }),
          buildConvergenceEvaluationExpectation({
            nodeId: 'node-6',
          }),
          buildConvergenceEvaluationExpectation({
            nodeId: 'node-7',
            state: TEST_PARTITION_CONVERGENCE_STATE_ROUTED_ADMISSION_ONLY,
            dispatchContributionState:
              TEST_DISPATCH_CONTRIBUTION_STATE_ROUTED_SUPPORT,
            admissionReady: true,
          }),
        ],
      }),
      'planner diagnostics should report the live dispatch set, not only the ' +
        'replica-bearing bootstrap nodes',
    );

    await new Promise((resolve) => {
      setTimeout(resolve, 60);
    });

    assert.deepEqual(
      plan.nodeResolver().map((node) => node.id),
      ['node-2', 'node-3', 'node-4', 'node-5', 'node-7'],
      'refresh should keep routed backfill visible until the target contributor set becomes locally usable',
    );
  } finally {
    plan.stop();
  }
});


  registerTableDistributionHelpersReadPathTailMoreTests({
    test,
    assert,
    admitBenchmarkLoadNodes,
    createPartitioningBenchmarkLoadNodePlan,
    ensureBenchmarkPartitioningTable,
    queryTableDistribution,
    resolvePartitioningBenchmarkLoadOpsPerSec,
    TABLE_BOOTSTRAP_VISIBILITY_STATE,
    waitForPartitionGrowthAndSpread,
    buildBenchmarkCriticalControlPlaneStabilitySnapshot,
    buildBenchmarkLoadAdmissionSnapshot,
    PARTITIONS_SQL_FRAGMENT,
    SERVICES_SQL_FRAGMENT,
    TABLES_SQL_FRAGMENT,
    TEST_DEFAULT_LEADER_NODE_ID,
    TEST_DEFAULT_PARTITION_REPLICA_COUNT,
    TEST_SERVICE_STATUS_ACTIVE,
    TEST_RAFT_ROLE_LEADER,
    TEST_PARTITION_CONVERGENCE_STATE_READY_REPLICA,
    TEST_PARTITION_CONVERGENCE_STATE_REPLICA_BLOCKED,
    TEST_PARTITION_CONVERGENCE_STATE_ROUTED_ADMISSION_ONLY,
    TEST_PARTITION_CONVERGENCE_STATE_ABSENT,
    TEST_DISPATCH_CONTRIBUTION_STATE_LOCAL_PRIMARY,
    TEST_DISPATCH_CONTRIBUTION_STATE_LOCAL_BLOCKED,
    TEST_DISPATCH_CONTRIBUTION_STATE_ROUTED_SUPPORT,
    TEST_DISPATCH_CONTRIBUTION_STATE_NONE,
    TEST_LOCAL_REPLICA_ROLE_UNKNOWN,
    TEST_DEGRADATION_STATE_UNKNOWN,
    TEST_RETRY_AFTER_NONE_MS,
    TEST_TABLE_ID_BOOTSTRAP_TIMEOUT_MS,
    TEST_CONTROL_QUERY_TIMEOUT_MS,
    TEST_CONTROL_QUERY_FAILOVER_MIN_TIMEOUT_MS,
    TEST_TABLE_ID_BOOTSTRAP_FAILOVER_MIN_TIMEOUT_MS,
    TEST_PARTITION_BOOTSTRAP_ALT_TIMEOUT_MS,
    TEST_CONTROL_QUERY_DEFERRED_OUTCOME,
    TEST_PUBLICATION_EPOCH_PENDING_REASON_CODE,
    TEST_PUBLISHED_CONVERGENCE_PENDING_DIMENSION,
    TEST_SELECTION_OBSERVATION_STATE_OBSERVED,
    TEST_SELECTION_OBSERVATION_STATE_DEFERRED,
    buildVisiblePartitionRow,
    buildActiveLeaderServiceRow,
    buildConvergenceEvaluationExpectation,
    buildPlannerDiagnosticsExpectation,
  });
}
