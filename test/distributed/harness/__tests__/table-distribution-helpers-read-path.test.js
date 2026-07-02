import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {
  admitBenchmarkLoadNodes,
  createPartitioningBenchmarkLoadNodePlan,
  ensureBenchmarkPartitioningTable,
  queryTableDistribution,
  resolvePartitioningBenchmarkLoadOpsPerSec,
  TABLE_BOOTSTRAP_VISIBILITY_STATE,
  waitForPartitionGrowthAndSpread,
} from '../../scenarios/table-distribution-helpers.js';
import {
  buildBenchmarkCriticalControlPlaneStabilitySnapshot,
  buildBenchmarkLoadAdmissionSnapshot,
} from '../benchmark-partition-convergence.js';
import {registerTableDistributionHelpersReadPathTailTests} from './table-distribution-helpers-read-path-tail-test-cases.js';

const PARTITIONS_SQL_FRAGMENT = 'FROM partitions';
const SERVICES_SQL_FRAGMENT = 'FROM services';
const TABLES_SQL_FRAGMENT = 'FROM tables';
const TEST_DEFAULT_LEADER_NODE_ID = 'seed-1';
const TEST_DEFAULT_PARTITION_REPLICA_COUNT = 1;
const TEST_SERVICE_STATUS_ACTIVE = 'active';
const TEST_RAFT_ROLE_LEADER = 'leader';
const TEST_PARTITION_CONVERGENCE_STATE_READY_REPLICA = 'ready_replica';
const TEST_PARTITION_CONVERGENCE_STATE_REPLICA_BLOCKED =
  'replica_blocked';
const TEST_PARTITION_CONVERGENCE_STATE_ROUTED_ADMISSION_ONLY =
  'routed_admission_only';
const TEST_PARTITION_CONVERGENCE_STATE_ABSENT = 'absent';
const TEST_DISPATCH_CONTRIBUTION_STATE_LOCAL_PRIMARY = 'local_primary';
const TEST_DISPATCH_CONTRIBUTION_STATE_LOCAL_BLOCKED = 'local_blocked';
const TEST_DISPATCH_CONTRIBUTION_STATE_ROUTED_SUPPORT = 'routed_support';
const TEST_DISPATCH_CONTRIBUTION_STATE_NONE = 'none';
const TEST_LOCAL_REPLICA_ROLE_UNKNOWN = 'unknown';
const TEST_DEGRADATION_STATE_UNKNOWN = 'unknown';
const TEST_RETRY_AFTER_NONE_MS = 0;
const TEST_TABLE_ID_BOOTSTRAP_TIMEOUT_MS = 10000;
const TEST_CONTROL_QUERY_TIMEOUT_MS = 15000;
const TEST_MULTI_NODE_CREATE_TIMEOUT_MS = 5000;
const TEST_CONTROL_QUERY_FAILOVER_MIN_TIMEOUT_MS =
  Math.floor(TEST_CONTROL_QUERY_TIMEOUT_MS / 2) + 1;
const TEST_TABLE_ID_BOOTSTRAP_FAILOVER_MIN_TIMEOUT_MS =
  Math.floor(TEST_TABLE_ID_BOOTSTRAP_TIMEOUT_MS / 2) + 1;
const TEST_PARTITION_BOOTSTRAP_ALT_TIMEOUT_MS =
  TEST_CONTROL_QUERY_TIMEOUT_MS - TEST_TABLE_ID_BOOTSTRAP_TIMEOUT_MS;
const TEST_CONTROL_QUERY_DEFERRED_OUTCOME = 'deferred';
const TEST_PUBLICATION_EPOCH_PENDING_REASON_CODE = 'publication_epoch_pending';
const TEST_PUBLISHED_CONVERGENCE_PENDING_DIMENSION =
  'publishedConvergencePending';
const TEST_SELECTION_OBSERVATION_STATE_OBSERVED = 'observed';
const TEST_SELECTION_OBSERVATION_STATE_DEFERRED = 'deferred';

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
        TEST_DEFAULT_LEADER_NODE_ID,
  };
}

function buildActiveLeaderServiceRow(partitionId, options = {}) {
  return {
    partition_id: partitionId,
    node_id:
      typeof options.nodeId === 'string' &&
        options.nodeId.length > 0 ?
        options.nodeId :
        TEST_DEFAULT_LEADER_NODE_ID,
    status: TEST_SERVICE_STATUS_ACTIVE,
    raft_role: TEST_RAFT_ROLE_LEADER,
  };
}

function buildConvergenceEvaluationExpectation(options = {}) {
  return {
    nodeId: String(options.nodeId || ''),
    state: String(options.state || TEST_PARTITION_CONVERGENCE_STATE_ABSENT),
    dispatchContributionState:
      String(
        options.dispatchContributionState ||
          TEST_DISPATCH_CONTRIBUTION_STATE_NONE,
      ),
    replicaBearing: options.replicaBearing === true,
    localReplicaSeen: options.localReplicaSeen === true,
    localAdmissionReady: options.localAdmissionReady === true,
    admissionReady: options.admissionReady === true,
    routingReady: options.routingReady === true,
    schemaReady: options.schemaReady === true,
    topologyReady: options.topologyReady === true,
    localReplicaRole:
      typeof options.localReplicaRole === 'string' &&
      options.localReplicaRole.length > 0 ?
        options.localReplicaRole :
        TEST_LOCAL_REPLICA_ROLE_UNKNOWN,
    localReplicaVoterReady: options.localReplicaVoterReady === true,
    leadershipStable: options.leadershipStable === true,
    degradationState:
      typeof options.degradationState === 'string' &&
      options.degradationState.length > 0 ?
        options.degradationState :
        TEST_DEGRADATION_STATE_UNKNOWN,
    degradedByOperationIds: Array.isArray(options.degradedByOperationIds) ?
      options.degradedByOperationIds :
      [],
    reasonCodes: Array.isArray(options.reasonCodes) ?
      options.reasonCodes :
      [],
    discoveryReasonCodes: Array.isArray(options.discoveryReasonCodes) ?
      options.discoveryReasonCodes :
      [],
    loadLaneReasonCodes: Array.isArray(options.loadLaneReasonCodes) ?
      options.loadLaneReasonCodes :
      [],
    retryAfterMs: Number.isInteger(options.retryAfterMs) ?
      options.retryAfterMs :
      TEST_RETRY_AFTER_NONE_MS,
  };
}

function buildPlannerDiagnosticsExpectation(options = {}) {
  const selectedNodeIds = Array.isArray(options.selectedNodeIds) ?
    options.selectedNodeIds :
    [];
  const admissionReadyNodeIds = Array.isArray(options.admissionReadyNodeIds) ?
    options.admissionReadyNodeIds :
    [];
  const readyReplicaNodeIds = Array.isArray(options.readyReplicaNodeIds) ?
    options.readyReplicaNodeIds :
    [];
  const replicaBearingNodeIds = Array.isArray(options.replicaBearingNodeIds) ?
    options.replicaBearingNodeIds :
    [];
  const localPrimaryNodeIds = Array.isArray(options.localPrimaryNodeIds) ?
    options.localPrimaryNodeIds :
    [];
  const routedSupportNodeIds = Array.isArray(options.routedSupportNodeIds) ?
    options.routedSupportNodeIds :
    [];
  return {
    selectedNodeCount: selectedNodeIds.length,
    selectedNodeIds,
    admissionReadyNodeCount: admissionReadyNodeIds.length,
    admissionReadyNodeIds,
    readyReplicaNodeCount: readyReplicaNodeIds.length,
    readyReplicaNodeIds,
    replicaBearingNodeCount: replicaBearingNodeIds.length,
    replicaBearingNodeIds,
    partitionCount: Number(options.partitionCount || 0),
    readinessReasonHistogram:
      options.readinessReasonHistogram &&
      typeof options.readinessReasonHistogram === 'object' ?
        options.readinessReasonHistogram :
        null,
    convergenceStateHistogram:
      options.convergenceStateHistogram &&
      typeof options.convergenceStateHistogram === 'object' ?
        options.convergenceStateHistogram :
        null,
    localPrimaryNodeCount: localPrimaryNodeIds.length,
    localPrimaryNodeIds,
    routedSupportNodeCount: routedSupportNodeIds.length,
    routedSupportNodeIds,
    dispatchContributionHistogram:
      options.dispatchContributionHistogram &&
      typeof options.dispatchContributionHistogram === 'object' ?
        options.dispatchContributionHistogram :
        null,
    degradationStateHistogram:
      options.degradationStateHistogram &&
      typeof options.degradationStateHistogram === 'object' ?
        options.degradationStateHistogram :
        null,
    selectionObservationState:
      typeof options.selectionObservationState === 'string' &&
      options.selectionObservationState.length > 0 ?
        options.selectionObservationState :
        TEST_SELECTION_OBSERVATION_STATE_OBSERVED,
    selectionObservationRetryAfterMs:
      Number.isInteger(options.selectionObservationRetryAfterMs) ?
        options.selectionObservationRetryAfterMs :
        0,
    selectionObservationError:
      typeof options.selectionObservationError === 'string' ?
        options.selectionObservationError :
        null,
    selectionObservationReasonCodes:
      Array.isArray(options.selectionObservationReasonCodes) ?
        options.selectionObservationReasonCodes :
        [],
    criticalControlPlaneStability:
      options.criticalControlPlaneStability &&
      typeof options.criticalControlPlaneStability === 'object' ?
        options.criticalControlPlaneStability :
        buildBenchmarkCriticalControlPlaneStabilitySnapshot(),
    convergenceEvaluations: Array.isArray(options.convergenceEvaluations) ?
      options.convergenceEvaluations :
      [],
  };
}

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

test('table-distribution-helpers keeps timed-out create mutations ' +
  'single-flight across the full benchmark node set', async () => {
  const createCalls = [];
  const fallbackNodes = Array.from({length: 6}, (_value, index) => {
    const nodeId = 'node-' + String(index + 2);
    const visibilityNode = index === 5;
    return {
      id: nodeId,
      async queryWithTimeout(sql, _params, options = {}) {
        if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
          createCalls.push({
            nodeId,
            timeoutMs: options.timeoutMs,
          });
          throw new Error('unexpected create mutation replay on ' + nodeId);
        }
        if (!visibilityNode) {
          return {rows: []};
        }
        if (sql.includes(TABLES_SQL_FRAGMENT)) {
          return {
            rows: [{table_id: 'tbl-benchmark-events-meaningful'}],
          };
        }
        if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
          return {
            rows: [
              buildVisiblePartitionRow(
                'tbl-benchmark-events-meaningful-p1',
                {leaderNodeId: nodeId},
              ),
            ],
          };
        }
        if (sql.includes(SERVICES_SQL_FRAGMENT)) {
          return {
            rows: [
              buildActiveLeaderServiceRow(
                'tbl-benchmark-events-meaningful-p1',
                {nodeId},
              ),
            ],
          };
        }
        return {rows: []};
      },
    };
  });
  const seedNode = {
    id: 'seed-1',
    async queryWithTimeout(sql, _params, options = {}) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        createCalls.push({
          nodeId: 'seed-1',
          timeoutMs: options.timeoutMs,
        });
        throw new Error(
          'Admin API query timed out for node seed-1 on lane control after ' +
          String(options.timeoutMs) + 'ms',
        );
      }
      return {rows: []};
    },
  };

  const ensured = await ensureBenchmarkPartitioningTable(seedNode, {
    tableName: 'benchmark_events',
    requirePartitionVisibility: true,
    queryNodes: fallbackNodes,
  });

  assert.equal(ensured.tableId, 'tbl-benchmark-events-meaningful');
  assert.deepEqual(createCalls, [{
    nodeId: 'seed-1',
    timeoutMs: TEST_MULTI_NODE_CREATE_TIMEOUT_MS,
  }]);
});

test('table-distribution-helpers reroutes a timed-out create mutation once ' +
  'the full visibility sweep still finds no table metadata', async () => {
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
      requirePartitionVisibility: true,
      queryNodes: [alternateNode],
    });

    assert.equal(ensured.tableId, 'tbl-benchmark-events-timeout-rerouted');
    assert.equal(ensured.tableDistributionTopologyState, 'routable');
    assert.equal(repairCount, 0);
    assert.equal(createCalls.length, 2);
    assert.deepEqual(createCalls[0], {
      nodeId: 'seed-1',
      timeoutMs: TEST_MULTI_NODE_CREATE_TIMEOUT_MS,
    });
    assert.deepEqual(createCalls[1], {
      nodeId: 'node-2',
      timeoutMs: TEST_PARTITION_BOOTSTRAP_ALT_TIMEOUT_MS,
    });
  } finally {
    Date.now = originalDateNow;
    fakeNow = 0;
  }
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

test('table-distribution-helpers avoids forced control snapshot repair when ' +
  'the local snapshot already exposes a deferred observation contract', async () => {
  const snapshotCalls = [];
  const seedNode = {
    id: 'seed-1',
    async queryWithTimeout(sql, _params, options = {}) {
      snapshotCalls.push({
        sql,
        lane: options.lane,
      });
      if (sql.includes('control_snapshot_local(true)')) {
        return {rows: [{scope: 'forced'}]};
      }
      if (sql.includes('control_snapshot_local()')) {
        return {
          rows: [{
            snapshotObservation: {
              state: 'deferred_refresh',
              contractState: 'deferred',
            },
          }],
        };
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

  await queryTableDistribution(seedNode, {
    tableName: 'benchmark_events',
  });

  assert.ok(
    snapshotCalls.some((entry) => entry.sql.includes('control_snapshot_local()')),
    'expected the helper to consult the local control snapshot first',
  );
  assert.equal(
    snapshotCalls.some((entry) => entry.sql.includes('control_snapshot_local(true)')),
    false,
    'explicit deferred snapshot observations should suppress forced control snapshot repair',
  );
});

test('table-distribution-helpers retries benchmark table bootstrap on ' +
  'transient participant failures until metadata becomes visible', async () => {
  let createAttempts = 0;
  let tableLookupAttempts = 0;
  let partitionLookupAttempts = 0;
  let serviceLookupAttempts = 0;
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
            [buildVisiblePartitionRow('tbl-benchmark-events-1-p1')] :
            [],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        serviceLookupAttempts += 1;
        return {
          rows: partitionLookupAttempts >= 2 ?
            [buildActiveLeaderServiceRow('tbl-benchmark-events-1-p1')] :
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
  assert.equal(ensured.tableDistributionTopologyState, 'routable');
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
  assert.ok(
    serviceLookupAttempts >= 1,
    'expected bootstrap to wait for routable partition service visibility after partition metadata appears',
  );
});

test('table-distribution-helpers fails over create mutations only ' +
  'for reachability-shaped bootstrap errors', async () => {
  const createTimeoutBudgets = [];
  const seedNode = {
    id: 'seed-1',
    async queryWithTimeout(sql, _params, options = {}) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        createTimeoutBudgets.push({
          nodeId: 'seed-1',
          timeoutMs: options.timeoutMs,
        });
        throw new Error('connect ECONNREFUSED 127.0.0.1:8081');
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {rows: []};
      }
      return {rows: []};
    },
  };
  const alternateNode = {
    id: 'node-2',
    async queryWithTimeout(sql, _params, options = {}) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        createTimeoutBudgets.push({
          nodeId: 'node-2',
          timeoutMs: options.timeoutMs,
        });
        return {rows: []};
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {
          rows: [{table_id: 'tbl-benchmark-events-budget'}],
        };
      }
      return {rows: []};
    },
  };

  const ensured = await ensureBenchmarkPartitioningTable(seedNode, {
    tableName: 'benchmark_events',
    queryNodes: [alternateNode],
  });

  assert.equal(ensured.tableId, 'tbl-benchmark-events-budget');
  assert.equal(createTimeoutBudgets.length, 2);
  assert.equal(createTimeoutBudgets[0].nodeId, 'seed-1');
  assert.equal(
    createTimeoutBudgets[0].timeoutMs,
    TEST_MULTI_NODE_CREATE_TIMEOUT_MS,
  );
  assert.equal(createTimeoutBudgets[1].nodeId, 'node-2');
  assert.equal(
    createTimeoutBudgets[1].timeoutMs,
    TEST_MULTI_NODE_CREATE_TIMEOUT_MS,
  );
});

test('table-distribution-helpers reroutes pre-execution control-plane ' +
  'mutation defers to another benchmark query node', async () => {
  const createTimeoutBudgets = [];
  const seedNode = {
    id: 'seed-1',
    async queryWithTimeout(sql, _params, options = {}) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        createTimeoutBudgets.push({
          nodeId: 'seed-1',
          timeoutMs: options.timeoutMs,
        });
        const error = new Error('control_plane_pressure_degraded');
        error.code = 'CONTROL_PLANE_PRESSURE_DEGRADED';
        error.deferRetry = true;
        error.outcome = TEST_CONTROL_QUERY_DEFERRED_OUTCOME;
        error.retryAfterMs = 250;
        error.reasonCode = TEST_PUBLICATION_EPOCH_PENDING_REASON_CODE;
        error.reasonCodes = [TEST_PUBLICATION_EPOCH_PENDING_REASON_CODE];
        error.failedDimensions = [
          TEST_PUBLISHED_CONVERGENCE_PENDING_DIMENSION,
        ];
        error.runtimeAuthority = {
          state: 'establishing',
          visibility: {
            state: 'pending_publication',
          },
        };
        throw error;
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {rows: []};
      }
      return {rows: []};
    },
  };
  const alternateNode = {
    id: 'node-2',
    async queryWithTimeout(sql, _params, options = {}) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        createTimeoutBudgets.push({
          nodeId: 'node-2',
          timeoutMs: options.timeoutMs,
        });
        return {rows: []};
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {
          rows: [{table_id: 'tbl-benchmark-events-deferred'}],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        return {
          rows: [
            buildVisiblePartitionRow('tbl-benchmark-events-deferred-p1'),
          ],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        return {
          rows: [
            buildActiveLeaderServiceRow('tbl-benchmark-events-deferred-p1'),
          ],
        };
      }
      return {rows: []};
    },
  };

  const ensured = await ensureBenchmarkPartitioningTable(seedNode, {
    tableName: 'benchmark_events',
    requirePartitionVisibility: true,
    queryNodes: [alternateNode],
  });

  assert.equal(ensured.tableId, 'tbl-benchmark-events-deferred');
  assert.equal(createTimeoutBudgets.length, 2);
  assert.equal(createTimeoutBudgets[0].nodeId, 'seed-1');
  assert.equal(
    createTimeoutBudgets[0].timeoutMs,
    TEST_MULTI_NODE_CREATE_TIMEOUT_MS,
  );
  assert.equal(createTimeoutBudgets[1].nodeId, 'node-2');
  assert.equal(
    createTimeoutBudgets[1].timeoutMs,
    TEST_MULTI_NODE_CREATE_TIMEOUT_MS,
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
    // Generous ceiling, not a duration: the mocks defer once with
    // retryAfterMs 5 and the helper checks its wall-clock deadline before
    // each retry, so a 5ms budget lost the race under parallel-suite load
    // (event-loop lag ate the whole budget before attempt 2 could run).
    // The test still completes in a few ms once the retries succeed.
    queryTimeoutMs: 2000,
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
  let serviceLookupAttempts = 0;
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
            [buildVisiblePartitionRow('tbl-benchmark-events-2-p1')] :
            [],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        serviceLookupAttempts += 1;
        return {
          rows: partitionLookupAttempts >= 2 ?
            [buildActiveLeaderServiceRow('tbl-benchmark-events-2-p1')] :
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
  assert.equal(ensured.tableDistributionTopologyState, 'routable');
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
  assert.ok(
    serviceLookupAttempts >= 1,
    'bootstrap should keep polling until routable partition service visibility becomes visible',
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
          rows: [buildVisiblePartitionRow('tbl-benchmark-events-3-p1', {
            leaderNodeId: 'node-2',
          })],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        return {
          rows: [buildActiveLeaderServiceRow('tbl-benchmark-events-3-p1', {
            nodeId: 'node-2',
          })],
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
    tableLookupCalls
      .slice(0, 4)
      .map((entry) => entry.nodeId),
    ['seed-1', 'node-2', 'seed-1', 'node-2'],
    'table bootstrap visibility should continue to alternate snapshot nodes when primary reads are empty before any distribution follow-up reads',
  );
  assert.ok(
    tableLookupCalls.length >= 4,
    'expected distribution follow-up reads to preserve the alternate snapshot observation path',
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
            [buildVisiblePartitionRow('tbl-benchmark-events-repaired-p1')] :
            [],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        return {
          rows: repairCount > 0 ?
            [buildActiveLeaderServiceRow('tbl-benchmark-events-repaired-p1')] :
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
  assert.equal(ensured.tableDistributionTopologyState, 'routable');
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

test('table-distribution-helpers forces authoritative repair after a timed-out ' +
  'create even when the latest mutation contract is still pending', async () => {
  let repairCount = 0;
  const seedNode = {
    id: 'seed-1',
    async queryWithTimeout(sql) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        const error = new Error(
          'Admin API query timed out for node seed-1 on lane control after 15000ms',
        );
        error.retryAfterMs = 5;
        error.contractState = 'pending';
        throw error;
      }
      if (sql.includes('control_snapshot_local(true)')) {
        repairCount += 1;
        return {rows: [{scope: 'local'}]};
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {
          rows: repairCount > 0 ?
            [{table_id: 'tbl-benchmark-events-timeout-pending-repair'}] :
            [],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        return {
          rows: repairCount > 0 ?
            [buildVisiblePartitionRow(
              'tbl-benchmark-events-timeout-pending-repair-p1',
            )] :
            [],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        return {
          rows: repairCount > 0 ?
            [buildActiveLeaderServiceRow(
              'tbl-benchmark-events-timeout-pending-repair-p1',
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
    'tbl-benchmark-events-timeout-pending-repair',
  );
  assert.equal(ensured.tableVisibilityRepairApplied, true);
  assert.equal(ensured.tableDistributionTopologyState, 'routable');
});

test('table-distribution-helpers repairs missing partition rows after ' +
  'table_id visibility is already present', async () => {
  let repairCount = 0;
  let partitionLookupAttempts = 0;
  const seedNode = {
    id: 'seed-1',
    async queryWithTimeout(sql) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        return {rows: []};
      }
      if (sql.includes('control_snapshot_local(true)')) {
        repairCount += 1;
        return {rows: [{scope: 'local'}]};
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {
          rows: [{table_id: 'tbl-benchmark-events-partition-repaired'}],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        partitionLookupAttempts += 1;
        return {
          rows: repairCount > 0 ?
            [buildVisiblePartitionRow(
              'tbl-benchmark-events-partition-repaired-p1',
            )] :
            [],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        return {
          rows: repairCount > 0 ?
            [buildActiveLeaderServiceRow(
              'tbl-benchmark-events-partition-repaired-p1',
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
  assert.ok(partitionLookupAttempts >= 2);
  assert.equal(ensured.tableId, 'tbl-benchmark-events-partition-repaired');
  assert.equal(ensured.tableDistributionTopologyState, 'routable');
  assert.equal(ensured.tableVisibilityRepairApplied, true);
});

test('table-distribution-helpers repairs the snapshot-visible cohort when ' +
  'bootstrap sees table_id without partitions off the create primary',
async () => {
  const repairedNodeIds = [];
  const originalDateNow = Date.now;
  let fakeNow = 0;
  Date.now = () => fakeNow;
  const seedNode = {
    id: 'seed-1',
    async queryWithTimeout(sql, _params, options = {}) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        fakeNow += options.timeoutMs;
        const error = new Error(
          'Admin API query timed out for node seed-1 on lane control after ' +
          String(options.timeoutMs) + 'ms',
        );
        error.retryAfterMs = 5;
        throw error;
      }
      if (sql.includes('control_snapshot_local(true)')) {
        repairedNodeIds.push('seed-1');
        return {rows: [{scope: 'local'}]};
      }
      return {rows: []};
    },
  };
  let alternateRepairApplied = false;
  const alternateNode = {
    id: 'node-2',
    async queryWithTimeout(sql) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        throw new Error('unexpected create mutation replay on node-2');
      }
      if (sql.includes('control_snapshot_local(true)')) {
        repairedNodeIds.push('node-2');
        alternateRepairApplied = true;
        return {rows: [{scope: 'local'}]};
      }
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {
          rows: [{table_id: 'tbl-benchmark-events-alt-bootstrap-repair'}],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        return {
          rows: alternateRepairApplied ?
            [buildVisiblePartitionRow(
              'tbl-benchmark-events-alt-bootstrap-repair-p1',
              {leaderNodeId: 'node-2'},
            )] :
            [],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        return {
          rows: alternateRepairApplied ?
            [buildActiveLeaderServiceRow(
              'tbl-benchmark-events-alt-bootstrap-repair-p1',
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
      requirePartitionVisibility: true,
      queryNodes: [alternateNode],
    });

    assert.equal(ensured.tableId, 'tbl-benchmark-events-alt-bootstrap-repair');
    assert.equal(ensured.tableDistributionTopologyState, 'routable');
    assert.equal(ensured.tableVisibilityRepairApplied, true);
    assert.deepEqual(
      repairedNodeIds,
      ['seed-1', 'node-2'],
      'partition repair should widen from the timed-out create primary to the snapshot-visible alternate node',
    );
  } finally {
    Date.now = originalDateNow;
    fakeNow = 0;
  }
});


registerTableDistributionHelpersReadPathTailTests({
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
