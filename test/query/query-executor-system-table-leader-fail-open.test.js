import {test} from '../../src/test-helpers/tap.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {SERVICE_STATUS, SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {
  QUERY_ROUTING_DIAGNOSTIC_REASON,
} from '../../src/query/query-constants.js';
import {createMockMessageRouter} from './query-executor-mock-message-router.js';

const LEADER_NODE_ID = 'node-leader-fail-open';
const FOLLOWER_NODE_ID = 'node-follower-fail-open';

function createDenyingReadinessService() {
  return {
    getNodeReadinessSync() {
      return {
        observedAt: '2026-03-11T00:00:00.000Z',
        lifecycleState: SERVICE_STATUS.ACTIVE,
        dimensions: {
          serveEligible: false,
          repairEligible: false,
          controlPlaneRecoveryEligible: false,
        },
        reasons: [{code: 'planning_snapshot_refresh_pending'}],
      };
    },
  };
}

function createCache(partitionId) {
  return {
    partitions: [
      {partition_id: partitionId, leader_node_id: LEADER_NODE_ID},
    ],
    services: [
      {
        service_id: `${partitionId}-r1`,
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: LEADER_NODE_ID,
        raft_role: 'leader',
        address: `${LEADER_NODE_ID}/partition/${partitionId}`,
        status: SERVICE_STATUS.ACTIVE,
      },
      {
        service_id: `${partitionId}-r2`,
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: FOLLOWER_NODE_ID,
        raft_role: 'follower',
        address: `${FOLLOWER_NODE_ID}/partition/${partitionId}`,
        status: SERVICE_STATUS.ACTIVE,
      },
    ],
    get(type, key) {
      if (type === TABLES.PARTITIONS) {
        return this.partitions.find((p) => p.partition_id === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === 'services') return this.services.filter(predicate);
      if (type === 'partitions') return this.partitions.filter(predicate);
      return [];
    },
  };
}

function createExecutor(partitionId) {
  return new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createCache(partitionId),
    controlPlaneReadinessService: createDenyingReadinessService(),
  });
}

test('an all-readiness-denied system-table partition fails open to the ' +
  'canonical raft leader only', async (t) => {
  const partitionId = 'nodes-p1';
  const executor = createExecutor(partitionId);
  const snapshot = executor.getPartitionRoutingSnapshot(partitionId);
  t.equal(
    snapshot.reasonCode,
    QUERY_ROUTING_DIAGNOSTIC_REASON.SYSTEM_TABLE_LEADER_FAIL_OPEN,
    'the routing snapshot names the fail-open with a typed reason',
  );
  t.equal(snapshot.routableServiceCount, 1,
    'exactly the canonical leader service is admitted');
  t.equal(snapshot.routableServices[0].node_id, LEADER_NODE_ID,
    'the admitted candidate is the canonical raft leader');
  t.ok(snapshot.deniedByNodeId[LEADER_NODE_ID],
    'the readiness denial stays visible in diagnostics');
  t.end();
});

test('an all-readiness-denied ordinary partition stays fully filtered',
  async (t) => {
    const partitionId = 'p-user-table-1';
    const executor = createExecutor(partitionId);
    const snapshot = executor.getPartitionRoutingSnapshot(partitionId);
    t.equal(
      snapshot.reasonCode,
      QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS,
      'ordinary tables keep the strict readiness filter',
    );
    t.equal(snapshot.routableServiceCount, 0,
      'no candidate is admitted for an ordinary table');
    t.end();
  });

test('the fail-open goes dormant when any candidate is readiness-routable',
  async (t) => {
    const partitionId = 'nodes-p1';
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createCache(partitionId),
      controlPlaneReadinessService: {
        getNodeReadinessSync() {
          return {
            observedAt: '2026-03-11T00:00:00.000Z',
            lifecycleState: SERVICE_STATUS.ACTIVE,
            dimensions: {
              serveEligible: true,
              repairEligible: true,
              controlPlaneRecoveryEligible: true,
            },
            reasons: [],
          };
        },
      },
    });
    const snapshot = executor.getPartitionRoutingSnapshot(partitionId);
    t.equal(snapshot.reasonCode, QUERY_ROUTING_DIAGNOSTIC_REASON.OK,
      'normal readiness routing resumes untouched');
    t.equal(snapshot.routableServiceCount, 2,
      'every readiness-routable candidate is served, not only the leader');
    t.end();
  });
