/**
 * Quest serve-eligibility-committed-epoch-read, attempt 1, routing witness.
 *
 * User-table routing on the serve dimension consumes the readiness owner's
 * committed-epoch serve-eligibility answer, never the readiness projection's
 * dimension and never a bootstrap grace. System-table routing decides on raft
 * leadership: service status, address and live transport only; the cached
 * leader orders candidates, the target proves leadership. No readiness filter,
 * no fail-open, no priority-recovery bootstrap bypass.
 */
import fs from 'node:fs';
import {test} from '../../src/test-helpers/tap.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {SERVICE_STATUS, SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {
  QUERY_ROUTING_DIAGNOSTIC_REASON,
} from '../../src/query/query-constants.js';
import {createMockMessageRouter} from './query-executor-mock-message-router.js';

const LEADER_NODE_ID = 'node-serve-route-leader';
const FOLLOWER_NODE_ID = 'node-serve-route-follower';
const LOCAL_NODE_ID = 'node-serve-route-local';
const CREATED_AT_MS = 1_700_000_000_000;

function partitionService(partitionId, nodeId, role) {
  return {
    service_id: `${partitionId}-${nodeId}`,
    service_type: SERVICE_TYPE.PARTITION,
    partition_id: partitionId,
    node_id: nodeId,
    raft_role: role,
    address: `${nodeId}/partition/${partitionId}`,
    status: SERVICE_STATUS.ACTIVE,
  };
}

function createCache(partitionId, partitionOverrides = {}) {
  return {
    partitions: [{partition_id: partitionId, leader_node_id: LEADER_NODE_ID,
      ...partitionOverrides}],
    services: [
      partitionService(partitionId, LEADER_NODE_ID, 'leader'),
      partitionService(partitionId, FOLLOWER_NODE_ID, 'follower'),
    ],
    get(type, key) {
      if (type === TABLES.PARTITIONS) {
        return this.partitions.find((p) => p.partition_id === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === TABLES.SERVICES) return this.services.filter(predicate);
      if (type === TABLES.PARTITIONS) return this.partitions.filter(predicate);
      return [];
    },
  };
}

function connectedRouter(connectedNodeIds) {
  const router = createMockMessageRouter();
  router.getConnectionState = (nodeId) =>
    connectedNodeIds.includes(nodeId) ? 'connected' : 'disconnected';
  return router;
}

// The projection denies serving and would satisfy the old bootstrap grace;
// the owner answer is the only serve authority.
function projectionDenyingSnapshot() {
  return {
    observedAt: '2026-11-02T00:00:00.000Z',
    lifecycleState: SERVICE_STATUS.ACTIVE,
    dimensions: {
      processAlive: true,
      routingReady: true,
      loadReady: true,
      metadataPublicationHealthy: true,
      serveEligible: false,
      repairEligible: false,
      controlPlaneRecoveryEligible: true,
    },
    nodeEvidence: {transportConnected: true, readyWhenWritten: true},
    reasons: [{code: 'planning_snapshot_refresh_pending'}],
  };
}

function readinessService(answersByNodeId) {
  const calls = {readinessReads: 0, answers: 0};
  return {
    calls,
    getNodeReadinessSync() {
      calls.readinessReads += 1;
      return projectionDenyingSnapshot();
    },
    answerServeEligibility(nodeId) {
      calls.answers += 1;
      return answersByNodeId[nodeId] || {
        state: 'unavailable', reason: 'no_committed_record', epoch: null,
        retryAfterMs: 1000,
      };
    },
  };
}

const EPOCH = Object.freeze({publicationEpoch: 7,
  publicationId: 'cluster_membership-7', readAtMs: 1});
const ELIGIBLE = Object.freeze({state: 'ready', decision: 'eligible',
  reasons: [], epoch: EPOCH});
const STALE = Object.freeze({state: 'unavailable', reason: 'unavailable_stale',
  epoch: EPOCH, retryAfterMs: 500});

test('user-table serve routing admits a node the committed answer makes ' +
  'eligible although the projection denies it', async (t) => {
  const partitionId = 'p-user-serve-1';
  const readiness = readinessService({
    [LEADER_NODE_ID]: ELIGIBLE, [FOLLOWER_NODE_ID]: ELIGIBLE});
  const executor = new QueryExecutor({
    nodeId: LOCAL_NODE_ID,
    messageRouter: connectedRouter([LEADER_NODE_ID, FOLLOWER_NODE_ID]),
    systemCache: createCache(partitionId),
    controlPlaneReadinessService: readiness,
  });
  const snapshot = executor.getPartitionRoutingSnapshot(partitionId);
  t.equal(snapshot.routableServiceCount, 2,
    'both committed-eligible services route');
  t.equal(readiness.calls.readinessReads, 0,
    'the serve decision reads no readiness projection');
  t.end();
});

test('user-table serve routing refuses on a stale committed answer with the ' +
  'typed reason and its epoch', async (t) => {
  const partitionId = 'p-user-serve-2';
  const executor = new QueryExecutor({
    nodeId: LOCAL_NODE_ID,
    messageRouter: connectedRouter([LEADER_NODE_ID, FOLLOWER_NODE_ID]),
    systemCache: createCache(partitionId),
    controlPlaneReadinessService: readinessService({
      [LEADER_NODE_ID]: STALE, [FOLLOWER_NODE_ID]: STALE}),
  });
  const snapshot = executor.getPartitionRoutingSnapshot(partitionId);
  t.equal(snapshot.routableServiceCount, 0, 'no candidate on a stale answer');
  const denial = snapshot.deniedByNodeId?.[LEADER_NODE_ID] || null;
  t.equal(denial?.reasonCode ?? null,
    QUERY_ROUTING_DIAGNOSTIC_REASON.SERVE_ELIGIBILITY_UNAVAILABLE,
    'the denial is typed serve-eligibility unavailability');
  t.equal(denial?.serveEligibility?.epoch?.publicationEpoch ?? null, 7,
    'the denial carries the epoch it was stale at');
  t.end();
});

test('a user partition in its bootstrap window gets no serve grace (UA-1)',
  async (t) => {
    const partitionId = 'p-user-serve-grace';
    const executor = new QueryExecutor({
      nodeId: LOCAL_NODE_ID,
      messageRouter: connectedRouter([LEADER_NODE_ID, FOLLOWER_NODE_ID]),
      systemCache: createCache(partitionId, {
        created_at: CREATED_AT_MS, updated_at: CREATED_AT_MS}),
      controlPlaneReadinessService: readinessService({
        [LEADER_NODE_ID]: {state: 'ready', decision: 'not_eligible',
          reasons: ['node_not_published'], epoch: EPOCH},
        [FOLLOWER_NODE_ID]: {state: 'ready', decision: 'not_eligible',
          reasons: ['node_not_published'], epoch: EPOCH},
      }),
    });
    const snapshot = executor.getPartitionRoutingSnapshot(partitionId);
    t.equal(snapshot.routableServiceCount, 0,
      'a committed negative is not overridden by a bootstrap grace');
    t.end();
  });

test('system-table routing decides on leadership and live transport, with ' +
  'no readiness filter and no fail-open', async (t) => {
  const partitionId = 'nodes-p1';
  const readiness = readinessService({});
  const executor = new QueryExecutor({
    nodeId: LOCAL_NODE_ID,
    messageRouter: connectedRouter([LEADER_NODE_ID, FOLLOWER_NODE_ID]),
    systemCache: createCache(partitionId),
    controlPlaneReadinessService: readiness,
  });
  const snapshot = executor.getPartitionRoutingSnapshot(partitionId);
  t.equal(snapshot.reasonCode, QUERY_ROUTING_DIAGNOSTIC_REASON.OK,
    'no fail-open reason: nothing was denied');
  t.equal(snapshot.routableServiceCount, 2,
    'every reachable replica is a candidate; the target proves leadership');
  t.equal(snapshot.canonicalLeaderNodeId, LEADER_NODE_ID,
    'the cached leader stays the ordering hint');
  t.equal(readiness.calls.readinessReads + readiness.calls.answers, 0,
    'system-table routing reads no readiness and no serve answer');
  t.end();
});

test('system-table routing drops a replica whose live transport is down',
  async (t) => {
    const partitionId = 'control_plane_publications-p1';
    const executor = new QueryExecutor({
      nodeId: LOCAL_NODE_ID,
      messageRouter: connectedRouter([LEADER_NODE_ID]),
      systemCache: createCache(partitionId),
      controlPlaneReadinessService: readinessService({}),
    });
    const snapshot = executor.getPartitionRoutingSnapshot(partitionId);
    t.same(snapshot.routableServices.map((service) => service.node_id),
      [LEADER_NODE_ID], 'only the reachable replica routes');
    t.end();
  });

test('the priority-recovery bootstrap routing bypass is deleted', async (t) => {
  t.notOk(fs.existsSync(new URL(
    '../../src/query/query-executor-priority-recovery-bootstrap-routing.js',
    import.meta.url)), 'the bypass module no longer exists');
  t.notOk('SYSTEM_TABLE_LEADER_FAIL_OPEN' in QUERY_ROUTING_DIAGNOSTIC_REASON,
    'the fail-open reason no longer exists');
  t.end();
});
