/**
 * Guard for the data-local call activation pin consumption in the
 * placement planner: LIVE activation lease rows become deterministic
 * `activationPinNodeIds` on the runtime-service policy (the REAL
 * getRuntimeServicePolicy seam over the canonical cache rows), and the
 * REAL MovePlanner target-state calculation forces live-pinned available
 * nodes into the placement target — so the planner both ACTIVATES a
 * replica on the pinned node and REFRAINS from reclaiming it while the
 * lease lasts. Expired leases stop pinning (the reclaim story needs no
 * new mechanism), and pins never target unavailable nodes.
 */

import {test} from '../../src/test-helpers/tap.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {MovePlanner} from '../../src/rebalancer/move-planner.js';
import {
  buildActivationLeaseId,
  liveActivationPinNodeIds,
} from '../../src/service/call-activation-lease-owner.js';

const SERVICE_ID = 'svc-data-local';
const OTHER_SERVICE_ID = 'svc-other';
const NOW_MS = 1_700_000_000_000;
const NODE_IDS = ['node-a', 'node-b', 'node-c', 'node-d'];
const PINNED_NODE = 'node-d';
const TARGET_REPLICA_COUNT = 3;

function leaseRow(serviceId, nodeId, expiresAt) {
  return {
    lease_expires_at: expiresAt,
    lease_id: buildActivationLeaseId(serviceId, nodeId),
    node_id: nodeId,
    requested_at: NOW_MS - 1000,
    service_id: serviceId,
  };
}

function cacheWithLeases(rows) {
  return {
    getAll: (tableName) =>
      (tableName === SYSTEM_TABLE_NAME.CALL_ACTIVATION_LEASES ? rows : []),
  };
}

test('live leases become deterministic pins; expired and foreign leases ' +
  'do not', (t) => {
  const rows = [
    leaseRow(SERVICE_ID, PINNED_NODE, NOW_MS + 30000),
    leaseRow(SERVICE_ID, 'node-b', NOW_MS - 1),
    leaseRow(OTHER_SERVICE_ID, 'node-c', NOW_MS + 30000),
  ];
  t.same(
    liveActivationPinNodeIds({
      nowMs: NOW_MS,
      serviceId: SERVICE_ID,
      systemTableCache: cacheWithLeases(rows),
    }),
    [PINNED_NODE],
    'only this service\'s LIVE lease pins, deterministically',
  );
  t.same(
    liveActivationPinNodeIds({
      nowMs: NOW_MS + 60000,
      serviceId: SERVICE_ID,
      systemTableCache: cacheWithLeases(rows),
    }),
    [],
    'a lapsed lease stops pinning — reclaim needs no new mechanism',
  );
  t.end();
});

function makePlanner() {
  return new MovePlanner({
    entityId: SERVICE_ID,
    entityType: 'runtime_service',
    moveStateProvider: {
      getAvailableNodes: () => NODE_IDS.map((nodeId) => ({
        cpu_usage_percent: 0,
        disk_usage_percent: 0,
        memory_usage_percent: 0,
        node_id: nodeId,
        status: 'active',
      })),
      getCurrentReplicas: () => [],
      getGlobalTopologyBlockingInFlightOperations: () => [],
      getHealthyReplicas: (replicas) => replicas,
      getInFlightOperations: () => [],
      getPartitionDescriptorEpochEvidence: () => null,
      getTerminalFailedReplaceTargetReplicaIds: () => new Set(),
      hasPendingAddForNode: () => false,
      hasPendingMove: () => false,
    },
  });
}

test('the planner forces live-pinned available nodes into the placement ' +
  'target', async (t) => {
  const planner = makePlanner();
  const basePolicy = {
    spreadAcrossNodes: true,
    targetReplicaCount: TARGET_REPLICA_COUNT,
  };
  const unpinned = await planner.calculateTargetState([], basePolicy);
  t.equal(unpinned.targetNodes.length, TARGET_REPLICA_COUNT,
    'without pins the target holds the policy replica count');

  const pinned = await planner.calculateTargetState([], {
    ...basePolicy,
    activationPinNodeIds: [PINNED_NODE],
  });
  t.ok(pinned.targetNodes.includes(PINNED_NODE),
    'the live-pinned node joins the placement target deterministically');
  t.ok(
    pinned.targetNodes.length >= unpinned.targetNodes.length,
    'pinning extends the target; it never evicts policy placements',
  );

  const foreign = await planner.calculateTargetState([], {
    ...basePolicy,
    activationPinNodeIds: ['node-not-in-cluster'],
  });
  t.equal(foreign.targetNodes.includes('node-not-in-cluster'), false,
    'a pin can never target a node the planner does not consider available');
  t.end();
});

test('a REAL UnifiedRebalancer policy pass attaches live pins from the ' +
  'cache — the loop the production refresh() drives', async (t) => {
  const {UnifiedRebalancer} = await import(
    '../../src/rebalancer/unified-rebalancer.js');

  const cache = {
    get: () => null,
    getAll: (tableName) =>
      (tableName === SYSTEM_TABLE_NAME.CALL_ACTIVATION_LEASES ?
        [leaseRow(SERVICE_ID, PINNED_NODE, Date.now() + 30000),
          leaseRow(SERVICE_ID, 'node-b', Date.now() - 1)] :
        []),
    filter: () => [],
  };
  const rebalancer = new UnifiedRebalancer({
    cdcIntegrationService: {
      insertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    entityId: SERVICE_ID,
    entityType: 'runtime_service',
    messageRouter: {
      deliver: async () => ({success: true}),
      register() {},
      send: async () => ({success: true}),
    },
    nodeId: 'planner-node',
    rebalanceCoordinator: {
      createOperation: async () => ({success: true}),
      waitForReplicaOperationCacheVisibility: async () => true,
    },
    systemTableCache: cache,
    tablePolicyService: {
      getMessageGroupPolicy: async () => ({targetReplicaCount: 3}),
      getPolicyForPartition: () => ({targetReplicaCount: 3}),
    },
  });
  const policy = await rebalancer.getPolicy();
  t.same(policy.activationPinNodeIds, [PINNED_NODE],
    'the real policy pass reads the live lease rows into deterministic ' +
      'pins — the engagement witness for the production refresh loop');
  t.equal(policy.targetReplicaCount > 0, true,
    'the pin attach never displaces the policy replica target');
  t.end();
});
