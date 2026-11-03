/**
 * Quest serve-eligibility-committed-epoch-read, attempt 1, routing witness.
 *
 * User-table routing on the serve dimension consumes the readiness owner's
 * committed-epoch serve-eligibility answer, never the readiness projection's
 * dimension and never a bootstrap grace. System-table routing decides on raft
 * leadership: the candidate hint is service status and address only; live
 * transport is applied by the delivery layer (reconnect deferral,
 * fall-through); the cached leader orders candidates, the target proves
 * leadership. No readiness filter, no fail-open, no priority-recovery
 * bootstrap bypass.
 */
import fs from 'node:fs';
import {test} from '../../src/test-helpers/tap.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {ERRORS, SERVICE_STATUS, SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {
  QUERY_RESPONSE_TYPE,
  QUERY_ROUTING_DIAGNOSTIC_REASON,
} from '../../src/query/query-constants.js';
import {createMockMessageRouter} from './query-executor-mock-message-router.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  buildControlPlaneReadAuthority,
} from '../../src/control-plane/control-plane-system-table-gateway-read-contracts.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';

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

test('system-table routing decides on leadership (live transport applies at ' +
  'delivery), with ' +
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

test('system-table candidates are not filtered by transport or readiness; ' +
  'delivery applies live transport', async (t) => {
  const partitionId = 'control_plane_publications-p1';
  const executor = new QueryExecutor({
    nodeId: LOCAL_NODE_ID,
    messageRouter: connectedRouter([LEADER_NODE_ID]),
    systemCache: createCache(partitionId),
    controlPlaneReadinessService: readinessService({}),
  });
  const snapshot = executor.getPartitionRoutingSnapshot(partitionId);
  t.same(snapshot.routableServices.map((service) => service.node_id),
    [LEADER_NODE_ID, FOLLOWER_NODE_ID],
    'both replicas are candidates; the disconnected one gets the delivery ' +
    'layer reconnect deferral, not a routing exclusion');
  t.end();
});

// Re-derived witness (R09 supersession of the sealed "routable = [LEADER]"
// transport witness, quest serve-eligibility-committed-epoch-read D2): a
// system-table candidate whose transport is down stays in the candidate set
// and receives the delivery layer's reconnect deferral (a cut delivery
// budget), and the read falls through to the connected replica.
test('a system-table candidate with transport down receives the delivery ' +
  'layer reconnect deferral and the read falls through', async (t) => {
  const partitionId = 'control_plane_publications-p1';
  const leaderAddress = `${LEADER_NODE_ID}/partition/${partitionId}`;
  const followerAddress = `${FOLLOWER_NODE_ID}/partition/${partitionId}`;
  const deliveries = [];
  const messageRouter = {
    getConnectionState: (nodeId) =>
      nodeId === FOLLOWER_NODE_ID ? 'connected' : 'disconnected',
    deliver: async (address, _message, options) => {
      deliveries.push({address, timeoutMs: options?.timeoutMs});
      if (address === leaderAddress) {
        return buildDeliveryEnvelope({
          acknowledged: false,
          error: `Connection to node ${LEADER_NODE_ID} closed`,
          errorCode: 'ROUTER_CONNECTION_CLOSED',
          retryAfterMs: 50,
          deferRetry: true,
        });
      }
      return buildDeliveryEnvelope({acknowledged: true},
        {success: true, rows: [{publication_id: 'p'}]});
    },
  };
  const executor = new QueryExecutor({
    nodeId: LOCAL_NODE_ID,
    messageRouter,
    systemCache: createCache(partitionId),
    controlPlaneReadinessService: readinessService({}),
  });
  executor.leaderRetryDelayMs = 1;

  const result = await executor.executeOnPartition(
    partitionId,
    'SELECT * FROM control_plane_publications',
    [],
    true,
    false,
    false,
    {
      timeoutMs: 6000,
      routingReadinessDimension:
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    },
  );

  t.equal(result.success, true, 'the read is answered by the live replica');
  t.same(deliveries.filter((d) => d.address === leaderAddress),
    [{address: leaderAddress, timeoutMs: 1}],
    'the disconnected candidate gets the reconnect-defer delivery budget');
  t.ok(deliveries.some((d) => d.address === followerAddress),
    'delivery falls through to the connected replica');
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

// Guardrail 1 (lead, 2026-11-02): the structural route is only the candidate
// hint. With a stale cached leader, a system-table write lands on the live
// leader through the target's typed redirect, or answers the typed
// NOT_LEADER refusal; never a wrong-leader answer, never an empty
// readiness-filtered candidate set.
function staleLeaderExecutor(answerOfStaleLeader) {
  const partitionId = 'sql_transactions-p1';
  const deliveries = [];
  const staleAddress = `${LEADER_NODE_ID}/partition/${partitionId}`;
  const liveAddress = `${FOLLOWER_NODE_ID}/partition/${partitionId}`;
  const readiness = readinessService({});
  const router = connectedRouter([LEADER_NODE_ID, FOLLOWER_NODE_ID]);
  router.deliver = async (address) => {
    deliveries.push(address);
    if (address === staleAddress) {
      return buildDeliveryEnvelope({acknowledged: true},
        answerOfStaleLeader(liveAddress));
    }
    return buildDeliveryEnvelope({acknowledged: true},
      {success: true, rows: [], changes: 1, answeredBy: liveAddress});
  };
  const executor = new QueryExecutor({
    nodeId: LOCAL_NODE_ID,
    messageRouter: router,
    // The cache still names the old leader.
    systemCache: createCache(partitionId),
    controlPlaneReadinessService: readiness,
  });
  executor.queryTimeoutMs = 2000;
  executor.leaderRetryDelayMs = 1;
  return {executor, partitionId, deliveries, staleAddress, liveAddress,
    readiness};
}

test('a stale cached system-table leader redirects the write to the live ' +
  'leader without consulting readiness', async (t) => {
  const {executor, partitionId, deliveries, staleAddress, liveAddress,
    readiness} = staleLeaderExecutor((liveAddress) => ({
    success: false, redirect: QUERY_RESPONSE_TYPE.LEADER_REDIRECT,
    leaderAddress: liveAddress}));
  const result = await executor.executeOnPartition(partitionId,
    'UPDATE sql_transactions SET status = ? WHERE transaction_id = ?',
    ['active', 'tx-1'], false, true, false);
  t.equal(result.success, true, 'the write succeeds on the live leader');
  t.same(deliveries.slice(0, 2), [staleAddress, liveAddress],
    'the stale leader is tried first and its redirect is followed');
  t.equal(readiness.calls.readinessReads + readiness.calls.answers, 0,
    'no readiness was consulted');
  t.end();
});

test('a stale cached system-table leader that knows no leader answers ' +
  'NOT_LEADER; the write lands on the live leader or fails typed, never on ' +
  'the stale one', async (t) => {
  const {executor, partitionId, deliveries, staleAddress, liveAddress} =
    staleLeaderExecutor(() => ({
      success: false, error: ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE,
      failureCode: 'not_leader'}));
  const result = await executor.executeOnPartition(partitionId,
    'UPDATE sql_transactions SET status = ? WHERE transaction_id = ?',
    ['active', 'tx-1'], false, true, false);
  t.equal(deliveries[0], staleAddress,
    'the candidate set was not empty: the cached leader was tried first');
  if (result.success === true) {
    t.equal(deliveries[deliveries.length - 1], liveAddress,
      'the success came from the live leader');
  } else {
    t.ok(String(result.error || '').length > 0, 'the refusal is typed');
    t.notEqual(result.reasonCode,
      QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS,
      'never a readiness-filtered empty candidate set');
  }
  t.end();
});

// Construction contract (lead decision 2026-11-02): an executor without a
// readiness owner routes no user table and answers the typed serve
// unavailability; there is no constructor fallback and no second path. System
// tables still route on leadership and live transport.
test('an executor without a readiness owner routes no user table, typed',
  async (t) => {
    const userPartitionId = 'p-user-no-owner';
    const executor = new QueryExecutor({
      nodeId: LOCAL_NODE_ID,
      messageRouter: connectedRouter([LEADER_NODE_ID, FOLLOWER_NODE_ID]),
      systemCache: createCache(userPartitionId),
    });
    const snapshot = executor.getPartitionRoutingSnapshot(userPartitionId);
    t.equal(snapshot.routableServiceCount, 0, 'no user-table candidate');
    t.equal(snapshot.deniedByNodeId?.[LEADER_NODE_ID]?.reasonCode ?? null,
      QUERY_ROUTING_DIAGNOSTIC_REASON.SERVE_ELIGIBILITY_UNAVAILABLE,
      'the denial is the typed serve unavailability');
    const systemExecutor = new QueryExecutor({
      nodeId: LOCAL_NODE_ID,
      messageRouter: connectedRouter([LEADER_NODE_ID, FOLLOWER_NODE_ID]),
      systemCache: createCache('nodes-p1'),
    });
    t.equal(
      systemExecutor.getPartitionRoutingSnapshot('nodes-p1').routableServiceCount,
      2, 'system tables still route on leadership and live transport');
    t.end();
  });

// Stream B reproducer evidence (5946c4d2f, 2026-11-02): authoritative
// replica_operations reads were refused as all_services_filtered_by_readiness
// (controlPlaneRecoveryEligible, planning_snapshot_refresh_pending) and the
// ledger REPLACE stuck ACTIVE. A leader-required authoritative read of a
// system table reaches the live leader whatever the readiness projection says.
test('a leader-required authoritative replica_operations read reaches the ' +
  'live leader while the projection says planning_snapshot_refresh_pending',
async (t) => {
  const partitionId = 'replica_operations-p1';
  const readiness = readinessService({});
  const deliveries = [];
  const router = connectedRouter([LEADER_NODE_ID, FOLLOWER_NODE_ID]);
  router.deliver = async (address) => {
    deliveries.push(address);
    return buildDeliveryEnvelope({acknowledged: true}, {
      success: true, rows: [{operation_id: 'op-1'}],
    });
  };
  const executor = new QueryExecutor({
    nodeId: LOCAL_NODE_ID,
    messageRouter: router,
    systemCache: createCache(partitionId),
    controlPlaneReadinessService: readiness,
  });
  executor.queryTimeoutMs = 2000;
  const readAuthority = buildControlPlaneReadAuthority({
    authoritativeReadMode:
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
    leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
    routingReadinessDimension:
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  });
  const result = await executor.executeOnPartition(partitionId,
    'SELECT * FROM replica_operations', [], true, true, false, {
      readAuthority,
      routingReadinessDimension:
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    });
  t.equal(result.success, true, 'the authoritative read is answered');
  t.equal(deliveries[0], `${LEADER_NODE_ID}/partition/${partitionId}`,
    'the read is delivered to the live leader');
  t.equal(readiness.calls.readinessReads + readiness.calls.answers, 0,
    'no readiness projection filtered the system-table read');
  t.end();
});
