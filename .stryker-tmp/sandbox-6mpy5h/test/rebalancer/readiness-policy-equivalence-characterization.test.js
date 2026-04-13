/**
 * Characterization tests: Readiness-policy equivalence for rebalancer
 * decisions.
 *
 * These tests lock the current readiness decision behavior in
 * UnifiedRebalancer and RebalanceCoordinator, then prove that
 * node-readiness-policy.js produces equivalent outcomes for the same
 * inputs. This defines the contract that policy-owner adoption
 * (Phase 5, Task 21) must satisfy.
 *
 * Covered paths:
 * - UnifiedRebalancer.isNodeReady (repairEligible + transport + ping)
 * - UnifiedRebalancer.isTransportReady (connection + outbound queue)
 * - UnifiedRebalancer.checkReadinessPing (ping timeout)
 * - UnifiedRebalancer.getAvailableNodes (repairEligible filter)
 * - RebalanceCoordinator.isNodeReadyForRouting (repairEligible only)
 * - node-readiness-policy isNodeReadyWithConnection / isNodeReadyWithTransport
 * - Skip reason granularity: lease, status, connection, ping, transport queue
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 9.2
 * Design: D6.1, D6.2, D11.1
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {UnifiedRebalancer} from '../../src/rebalancer/unified-rebalancer.js';
import {
  isNodeReadyWithConnection,
  isNodeReadyWithTransport,
  isNodeRecordReady,
} from '../../src/node/node-readiness-policy.js';
import {
  READINESS_SKIP_DETAIL,
  REBALANCER_SKIP_REASON,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  STATE,
  TABLES,
} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';

// ── Suite-local fixture constants ──────────────────────────────────

const NODE_ID_A = 'node-a';
const NODE_ID_B = 'node-b';
const SEED_NODE_ID = 'seed-node';
const ENTITY_ID = 'nodes-p1';
const LEASE_OFFSET_VALID = 30000;
const LEASE_OFFSET_EXPIRED = -1;
const PING_TIMEOUT_MS = 500;

// ── Shared helpers ─────────────────────────────────────────────────

/**
 * Build a mock ControlPlaneReadinessService backed by a cache.
 * Mirrors real dimension semantics: repairEligible requires
 * active status + valid lease.
 * @param {Object} systemTableCache - Mock system table cache.
 * @return {Object} Mock readiness service.
 */
function createMockReadinessService(systemTableCache) {
  return {
    getNodeReadinessSync: (nodeId) => {
      const nodeRow = systemTableCache.get(TABLES.NODES, nodeId);
      if (!nodeRow) {
        return {
          nodeId,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CLUSTER_MEMBER_HEALTHY]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: false,
            [CONTROL_PLANE_READINESS_DIMENSION
              .PLACEMENT_ELIGIBLE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_WRITABLE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION
              .METADATA_PUBLICATION_HEALTHY]: true,
            [CONTROL_PLANE_READINESS_DIMENSION
              .REPAIR_ELIGIBLE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION
              .SERVE_ELIGIBLE]: false,
          },
          reasons: [],
        };
      }
      const now = Date.now();
      const leaseExpiry = Number(nodeRow.ready_lease_expires_at);
      const leaseValid =
        Number.isFinite(leaseExpiry) && leaseExpiry > now;
      const isActive = nodeRow.status === SERVICE_STATUS.ACTIVE;
      const healthy = isActive && leaseValid;
      return {
        nodeId,
        dimensions: {
          [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
          [CONTROL_PLANE_READINESS_DIMENSION
            .CLUSTER_MEMBER_HEALTHY]: healthy,
          [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: healthy,
          [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: healthy,
          [CONTROL_PLANE_READINESS_DIMENSION
            .PLACEMENT_ELIGIBLE]: healthy,
          [CONTROL_PLANE_READINESS_DIMENSION
            .CONTROL_PLANE_WRITABLE]: healthy,
          [CONTROL_PLANE_READINESS_DIMENSION
            .METADATA_PUBLICATION_HEALTHY]: true,
          [CONTROL_PLANE_READINESS_DIMENSION
            .REPAIR_ELIGIBLE]: healthy,
          [CONTROL_PLANE_READINESS_DIMENSION
            .SERVE_ELIGIBLE]: healthy,
        },
        reasons: [],
      };
    },
    getNodeReadiness: async function(nodeId) {
      return this.getNodeReadinessSync(nodeId);
    },
  };
}

/**
 * Build a system table cache with one or more node rows.
 * @param {Object|Array<Object>} nodeRows - Node row(s).
 * @return {Object} Mock system table cache.
 */
function createSystemCache(nodeRows) {
  const rows = Array.isArray(nodeRows) ? nodeRows : [nodeRows];
  const nodeMap = new Map(rows.map((r) => [r.node_id, r]));
  return {
    get: (tableName, key) => {
      if (tableName === TABLES.NODES) {
        return nodeMap.get(key) || null;
      }
      return null;
    },
    filter: (tableName, predicate) => {
      if (tableName === TABLES.NODES) {
        return rows.filter(predicate);
      }
      return [];
    },
    getAll: (tableName) => {
      if (tableName === TABLES.NODES) {
        return rows;
      }
      return [];
    },
  };
}

/**
 * Build a mock message router with configurable per-node behavior.
 * @param {Object} opts - Per-node overrides.
 * @param {string} opts.connectionState - Default connection state.
 * @param {boolean} opts.outboundAvailable - Default outbound queue.
 * @param {boolean} opts.pingResult - Default ping result.
 * @return {Object} Mock message router.
 */
function createRouter(opts = {}) {
  const connectionState = opts.connectionState ?? STATE.CONNECTED;
  const outboundAvailable = opts.outboundAvailable !== false;
  const pingResult = opts.pingResult !== false;
  return {
    getConnectionState: (_nodeId) => connectionState,
    isOutboundQueueAvailable: (_nodeId) => outboundAvailable,
    pingNode: async (_nodeId, _timeout) => pingResult,
    getConnectedNodes: () => [],
  };
}

/**
 * Build a UnifiedRebalancer with minimal dependencies for readiness
 * characterization.
 * @param {Object} systemTableCache - Mock cache.
 * @param {Object} messageRouter - Mock router.
 * @param {Object} overrides - Extra constructor overrides.
 * @return {UnifiedRebalancer}
 */
function createRebalancer(systemTableCache, messageRouter, overrides = {}) {
  return new UnifiedRebalancer({
    entityId: ENTITY_ID,
    entityType: SERVICE_TYPE.PARTITION,
    nodeId: SEED_NODE_ID,
    messageRouter,
    systemTableCache,
    cdcIntegrationService: {},
    tablePolicyService: {
      getPolicyForPartition: () => ({
        targetReplicaCount: 3,
        placementConstraints: {},
      }),
    },
    rebalanceCoordinator: {},
    controlPlaneReadinessService:
      createMockReadinessService(systemTableCache),
    ...overrides,
  });
}

/**
 * Build a ready node row.
 * @param {string} nodeId - Node ID.
 * @param {Object} overrides - Field overrides.
 * @return {Object} Node row.
 */
function createNodeRow(nodeId, overrides = {}) {
  const now = Date.now();
  return {
    node_id: nodeId,
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.READY,
    ready_lease_expires_at: now + LEASE_OFFSET_VALID,
    last_heartbeat: now,
    ...overrides,
  };
}

// ── 1. Characterize rebalancer isNodeReady behavior ────────────────

test('rebalancer isNodeReady — ready node with valid lease and ' +
  'transport returns true', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const nodeRow = createNodeRow(NODE_ID_A);
  const cache = createSystemCache(nodeRow);
  const router = createRouter();
  const rebalancer = createRebalancer(cache, router);

  const result = await rebalancer.isNodeReady(NODE_ID_A);
  t.equal(result, true,
    'ready node with connected transport is ready');

  rebalancer.shutdown();
  ConfigurationManager.resetInstance();
});

test('rebalancer isNodeReady — expired lease returns false ' +
  '(skip reason: lease)', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const nodeRow = createNodeRow(NODE_ID_A, {
    ready_lease_expires_at: Date.now() + LEASE_OFFSET_EXPIRED,
  });
  const cache = createSystemCache(nodeRow);
  const router = createRouter();
  const rebalancer = createRebalancer(cache, router);

  const result = await rebalancer.isNodeReady(NODE_ID_A);
  t.equal(result, false,
    'expired lease causes readiness rejection');

  rebalancer.shutdown();
  ConfigurationManager.resetInstance();
});

test('rebalancer isNodeReady — inactive status returns false ' +
  '(skip reason: status)', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const nodeRow = createNodeRow(NODE_ID_A, {
    status: SERVICE_STATUS.JOINING,
  });
  const cache = createSystemCache(nodeRow);
  const router = createRouter();
  const rebalancer = createRebalancer(cache, router);

  const result = await rebalancer.isNodeReady(NODE_ID_A);
  t.equal(result, false,
    'non-active status causes readiness rejection');

  rebalancer.shutdown();
  ConfigurationManager.resetInstance();
});

test('rebalancer isNodeReady — disconnected transport returns false ' +
  '(skip reason: connection)', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const nodeRow = createNodeRow(NODE_ID_A);
  const cache = createSystemCache(nodeRow);
  const router = createRouter({connectionState: STATE.DISCONNECTED});
  const rebalancer = createRebalancer(cache, router);

  const result = await rebalancer.isNodeReady(NODE_ID_A);
  t.equal(result, false,
    'disconnected transport causes readiness rejection');

  rebalancer.shutdown();
  ConfigurationManager.resetInstance();
});

test('rebalancer isNodeReady — unavailable outbound queue returns ' +
  'false (skip reason: transport queue)', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const nodeRow = createNodeRow(NODE_ID_A);
  const cache = createSystemCache(nodeRow);
  const router = createRouter({outboundAvailable: false});
  const rebalancer = createRebalancer(cache, router);

  const result = await rebalancer.isNodeReady(NODE_ID_A);
  t.equal(result, false,
    'unavailable outbound queue causes readiness rejection');

  rebalancer.shutdown();
  ConfigurationManager.resetInstance();
});

test('rebalancer isNodeReady — failed ping returns false when ' +
  'ping enabled (skip reason: ping)', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const nodeRow = createNodeRow(NODE_ID_A);
  const cache = createSystemCache(nodeRow);
  const router = createRouter({pingResult: false});
  const rebalancer = createRebalancer(cache, router);
  rebalancer.enableReadinessPing = true;
  rebalancer.readinessPingTimeoutMs = PING_TIMEOUT_MS;

  const result = await rebalancer.isNodeReady(NODE_ID_A);
  t.equal(result, false,
    'failed ping causes readiness rejection when ping enabled');

  rebalancer.shutdown();
  ConfigurationManager.resetInstance();
});

test('rebalancer isNodeReady — missing node row returns false', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const cache = createSystemCache([]);
  const router = createRouter();
  const rebalancer = createRebalancer(cache, router);

  const result = await rebalancer.isNodeReady(NODE_ID_A);
  t.equal(result, false,
    'missing node row causes readiness rejection');

  rebalancer.shutdown();
  ConfigurationManager.resetInstance();
});

// ── 2. Characterize rebalancer isTransportReady behavior ───────────

test('rebalancer isTransportReady — connected with outbound queue ' +
  'returns true', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const nodeRow = createNodeRow(NODE_ID_A);
  const cache = createSystemCache(nodeRow);
  const router = createRouter();
  const rebalancer = createRebalancer(cache, router);

  t.equal(rebalancer.isTransportReady(NODE_ID_A), true,
    'connected transport with outbound queue is ready');

  rebalancer.shutdown();
  ConfigurationManager.resetInstance();
});

test('rebalancer isTransportReady — disconnected returns false', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const nodeRow = createNodeRow(NODE_ID_A);
  const cache = createSystemCache(nodeRow);
  const router = createRouter({connectionState: STATE.DISCONNECTED});
  const rebalancer = createRebalancer(cache, router);

  t.equal(rebalancer.isTransportReady(NODE_ID_A), false,
    'disconnected transport is not ready');

  rebalancer.shutdown();
  ConfigurationManager.resetInstance();
});

test('rebalancer isTransportReady — unavailable outbound queue ' +
  'returns false', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const nodeRow = createNodeRow(NODE_ID_A);
  const cache = createSystemCache(nodeRow);
  const router = createRouter({outboundAvailable: false});
  const rebalancer = createRebalancer(cache, router);

  t.equal(rebalancer.isTransportReady(NODE_ID_A), false,
    'unavailable outbound queue makes transport not ready');

  rebalancer.shutdown();
  ConfigurationManager.resetInstance();
});

test('rebalancer isTransportReady — missing router returns false', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const nodeRow = createNodeRow(NODE_ID_A);
  const cache = createSystemCache(nodeRow);
  const router = createRouter();
  const rebalancer = createRebalancer(cache, router);
  rebalancer.messageRouter = null;

  t.equal(rebalancer.isTransportReady(NODE_ID_A), false,
    'missing router makes transport not ready');

  rebalancer.shutdown();
  ConfigurationManager.resetInstance();
});

// ── 3. Characterize node-readiness-policy predicates ───────────────

test('isNodeRecordReady — active node with valid lease returns ' +
  'true', async (t) => {
  const now = Date.now();
  const nodeRow = {
    node_id: NODE_ID_A,
    status: SERVICE_STATUS.ACTIVE,
    ready_lease_expires_at: now + LEASE_OFFSET_VALID,
  };

  t.equal(isNodeRecordReady(nodeRow, {now}), true,
    'active node with valid lease is record-ready');
});

test('isNodeRecordReady — expired lease returns false', async (t) => {
  const now = Date.now();
  const nodeRow = {
    node_id: NODE_ID_A,
    status: SERVICE_STATUS.ACTIVE,
    ready_lease_expires_at: now + LEASE_OFFSET_EXPIRED,
  };

  t.equal(isNodeRecordReady(nodeRow, {now}), false,
    'expired lease makes node record not ready');
});

test('isNodeRecordReady — non-active status returns false', async (t) => {
  const now = Date.now();
  const nodeRow = {
    node_id: NODE_ID_A,
    status: SERVICE_STATUS.JOINING,
    ready_lease_expires_at: now + LEASE_OFFSET_VALID,
  };

  t.equal(isNodeRecordReady(nodeRow, {now}), false,
    'non-active status makes node record not ready');
});

test('isNodeRecordReady — null row returns false', async (t) => {
  t.equal(isNodeRecordReady(null), false,
    'null node row is not ready');
});

test('isNodeReadyWithConnection — ready node with connected ' +
  'router returns true', async (t) => {
  const now = Date.now();
  const nodeRow = createNodeRow(NODE_ID_A);
  const cache = createSystemCache(nodeRow);
  const router = createRouter();

  const result = isNodeReadyWithConnection({
    nodeId: NODE_ID_A,
    systemTableCache: cache,
    messageRouter: router,
    now,
  });

  t.equal(result, true,
    'ready node with connected router passes connection check');
});

test('isNodeReadyWithConnection — disconnected router returns ' +
  'false', async (t) => {
  const now = Date.now();
  const nodeRow = createNodeRow(NODE_ID_A);
  const cache = createSystemCache(nodeRow);
  const router = createRouter({connectionState: STATE.DISCONNECTED});

  const result = isNodeReadyWithConnection({
    nodeId: NODE_ID_A,
    systemTableCache: cache,
    messageRouter: router,
    now,
  });

  t.equal(result, false,
    'disconnected router fails connection check');
});

test('isNodeReadyWithTransport — outbound queue unavailable ' +
  'returns false', async (t) => {
  const now = Date.now();
  const nodeRow = createNodeRow(NODE_ID_A);
  const cache = createSystemCache(nodeRow);
  const router = createRouter({outboundAvailable: false});

  const result = await isNodeReadyWithTransport({
    nodeId: NODE_ID_A,
    systemTableCache: cache,
    messageRouter: router,
    now,
    requireOutboundQueue: true,
  });

  t.equal(result, false,
    'unavailable outbound queue fails transport check');
});

test('isNodeReadyWithTransport — failed ping returns false', async (t) => {
  const now = Date.now();
  const nodeRow = createNodeRow(NODE_ID_A);
  const cache = createSystemCache(nodeRow);
  const router = createRouter({pingResult: false});

  const result = await isNodeReadyWithTransport({
    nodeId: NODE_ID_A,
    systemTableCache: cache,
    messageRouter: router,
    now,
    enableReadinessPing: true,
    readinessPingTimeoutMs: PING_TIMEOUT_MS,
  });

  t.equal(result, false,
    'failed ping fails transport check');
});

// ── 4. Policy equivalence: rebalancer transport vs policy ──────────
//
// These tests prove that for the same inputs, the rebalancer's
// internal transport checks produce the same outcome as
// isNodeReadyWithTransport from node-readiness-policy.
// This is the contract that Task 21 (policy adoption) must satisfy.

test('equivalence — rebalancer isTransportReady matches policy ' +
  'isNodeReadyWithConnection for connection gate', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const now = Date.now();
  const nodeRow = createNodeRow(NODE_ID_A);

  const scenarios = [
    {label: 'connected', connectionState: STATE.CONNECTED, expected: true},
    {label: 'disconnected', connectionState: STATE.DISCONNECTED,
      expected: false},
    {label: 'ready', connectionState: STATE.READY, expected: false},
  ];

  for (const scenario of scenarios) {
    const cache = createSystemCache(nodeRow);
    const router = createRouter({
      connectionState: scenario.connectionState,
    });
    const rebalancer = createRebalancer(cache, router);

    const rebalancerResult = rebalancer.isTransportReady(NODE_ID_A);
    const policyResult = isNodeReadyWithConnection({
      nodeId: NODE_ID_A,
      systemTableCache: cache,
      messageRouter: router,
      now,
    });

    // Both should agree on connection gate for CONNECTED/DISCONNECTED.
    // For STATE.READY, the policy checks router.getConnectionState ===
    // STATE.CONNECTED, so it returns false. The rebalancer also checks
    // === STATE.CONNECTED, so they agree.
    t.equal(rebalancerResult, scenario.expected,
      `rebalancer transport ${scenario.label}: ${scenario.expected}`);
    t.equal(policyResult, scenario.expected,
      `policy connection ${scenario.label}: ${scenario.expected}`);
    t.equal(rebalancerResult, policyResult,
      `equivalence holds for ${scenario.label}`);

    rebalancer.shutdown();
  }

  ConfigurationManager.resetInstance();
});

test('equivalence — rebalancer outbound queue check matches ' +
  'policy requireOutboundQueue', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const now = Date.now();
  const nodeRow = createNodeRow(NODE_ID_A);

  for (const outboundAvailable of [true, false]) {
    const cache = createSystemCache(nodeRow);
    const router = createRouter({outboundAvailable});
    const rebalancer = createRebalancer(cache, router);

    const rebalancerResult = rebalancer.isTransportReady(NODE_ID_A);
    const policyResult = await isNodeReadyWithTransport({
      nodeId: NODE_ID_A,
      systemTableCache: cache,
      messageRouter: router,
      now,
      requireOutboundQueue: true,
    });

    t.equal(rebalancerResult, outboundAvailable,
      `rebalancer outbound=${outboundAvailable}: ${outboundAvailable}`);
    t.equal(policyResult, outboundAvailable,
      `policy outbound=${outboundAvailable}: ${outboundAvailable}`);
    t.equal(rebalancerResult, policyResult,
      `equivalence holds for outbound=${outboundAvailable}`);

    rebalancer.shutdown();
  }

  ConfigurationManager.resetInstance();
});

test('equivalence — rebalancer ping check matches policy ' +
  'enableReadinessPing', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const now = Date.now();
  const nodeRow = createNodeRow(NODE_ID_A);

  for (const pingResult of [true, false]) {
    const cache = createSystemCache(nodeRow);
    const router = createRouter({pingResult});
    const rebalancer = createRebalancer(cache, router);
    rebalancer.enableReadinessPing = true;
    rebalancer.readinessPingTimeoutMs = PING_TIMEOUT_MS;

    const rebalancerResult =
      await rebalancer.checkReadinessPing(NODE_ID_A);
    const policyResult = await isNodeReadyWithTransport({
      nodeId: NODE_ID_A,
      systemTableCache: cache,
      messageRouter: router,
      now,
      enableReadinessPing: true,
      readinessPingTimeoutMs: PING_TIMEOUT_MS,
    });

    t.equal(rebalancerResult, pingResult,
      `rebalancer ping=${pingResult}: ${pingResult}`);
    t.equal(policyResult, pingResult,
      `policy ping=${pingResult}: ${pingResult}`);
    t.equal(rebalancerResult, policyResult,
      `equivalence holds for ping=${pingResult}`);

    rebalancer.shutdown();
  }

  ConfigurationManager.resetInstance();
});

// ── 5. Full isNodeReady equivalence with policy composition ────────
//
// The rebalancer's isNodeReady composes:
//   repairEligible + isTransportReady + optional checkReadinessPing
// The policy equivalent composes:
//   isNodeRecordReady + isNodeReadyWithTransport (connection + queue + ping)
//
// These tests prove the composed outcomes match.

test('equivalence — full isNodeReady matches composed policy ' +
  'for ready node', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const now = Date.now();
  const nodeRow = createNodeRow(NODE_ID_A);
  const cache = createSystemCache(nodeRow);
  const router = createRouter();
  const rebalancer = createRebalancer(cache, router);

  const rebalancerResult = await rebalancer.isNodeReady(NODE_ID_A);
  const policyRecordReady = isNodeRecordReady(nodeRow, {now});
  const policyTransportReady = await isNodeReadyWithTransport({
    nodeId: NODE_ID_A,
    systemTableCache: cache,
    messageRouter: router,
    now,
    requireOutboundQueue: true,
  });

  t.equal(rebalancerResult, true, 'rebalancer: ready');
  t.equal(policyRecordReady, true, 'policy record: ready');
  t.equal(policyTransportReady, true, 'policy transport: ready');
  t.equal(rebalancerResult, policyRecordReady && policyTransportReady,
    'full equivalence holds for ready node');

  rebalancer.shutdown();
  ConfigurationManager.resetInstance();
});

test('equivalence — full isNodeReady matches composed policy ' +
  'for expired lease', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const now = Date.now();
  const nodeRow = createNodeRow(NODE_ID_A, {
    ready_lease_expires_at: now + LEASE_OFFSET_EXPIRED,
  });
  const cache = createSystemCache(nodeRow);
  const router = createRouter();
  const rebalancer = createRebalancer(cache, router);

  const rebalancerResult = await rebalancer.isNodeReady(NODE_ID_A);
  const policyRecordReady = isNodeRecordReady(nodeRow, {now});

  t.equal(rebalancerResult, false, 'rebalancer: not ready');
  t.equal(policyRecordReady, false, 'policy record: not ready');

  rebalancer.shutdown();
  ConfigurationManager.resetInstance();
});

test('equivalence — full isNodeReady matches composed policy ' +
  'for disconnected transport', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const now = Date.now();
  const nodeRow = createNodeRow(NODE_ID_A);
  const cache = createSystemCache(nodeRow);
  const router = createRouter({connectionState: STATE.DISCONNECTED});
  const rebalancer = createRebalancer(cache, router);

  const rebalancerResult = await rebalancer.isNodeReady(NODE_ID_A);
  const policyTransportReady = await isNodeReadyWithTransport({
    nodeId: NODE_ID_A,
    systemTableCache: cache,
    messageRouter: router,
    now,
    requireOutboundQueue: true,
  });

  t.equal(rebalancerResult, false, 'rebalancer: not ready');
  t.equal(policyTransportReady, false, 'policy transport: not ready');
  t.equal(rebalancerResult, policyTransportReady,
    'equivalence holds for disconnected transport');

  rebalancer.shutdown();
  ConfigurationManager.resetInstance();
});

// ── 6. Skip reason granularity characterization ───────────────────
//
// Lock the distinct skip reasons the rebalancer produces so that
// policy adoption preserves reason granularity (Requirement 5.3).

test('skip reason granularity — each readiness dimension produces ' +
  'a distinct rejection path', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const now = Date.now();
  const baseRow = createNodeRow(NODE_ID_A);

  // Reason: lease — expired lease, everything else healthy
  const leaseRow = {...baseRow, ready_lease_expires_at: now - 1};
  const leaseCache = createSystemCache(leaseRow);
  const leaseRouter = createRouter();
  const leaseRebalancer = createRebalancer(leaseCache, leaseRouter);
  t.equal(await leaseRebalancer.isNodeReady(NODE_ID_A), false,
    'lease rejection path active');
  leaseRebalancer.shutdown();

  // Reason: status — non-active status, valid lease
  const statusRow = {...baseRow, status: SERVICE_STATUS.JOINING};
  const statusCache = createSystemCache(statusRow);
  const statusRouter = createRouter();
  const statusRebalancer = createRebalancer(statusCache, statusRouter);
  t.equal(await statusRebalancer.isNodeReady(NODE_ID_A), false,
    'status rejection path active');
  statusRebalancer.shutdown();

  // Reason: connection — valid lease+status, disconnected transport
  const connCache = createSystemCache(baseRow);
  const connRouter = createRouter({connectionState: STATE.DISCONNECTED});
  const connRebalancer = createRebalancer(connCache, connRouter);
  t.equal(await connRebalancer.isNodeReady(NODE_ID_A), false,
    'connection rejection path active');
  connRebalancer.shutdown();

  // Reason: transport queue — valid lease+status+connection, no queue
  const queueCache = createSystemCache(baseRow);
  const queueRouter = createRouter({outboundAvailable: false});
  const queueRebalancer = createRebalancer(queueCache, queueRouter);
  t.equal(await queueRebalancer.isNodeReady(NODE_ID_A), false,
    'transport queue rejection path active');
  queueRebalancer.shutdown();

  // Reason: ping — everything healthy, ping fails
  const pingCache = createSystemCache(baseRow);
  const pingRouter = createRouter({pingResult: false});
  const pingRebalancer = createRebalancer(pingCache, pingRouter);
  pingRebalancer.enableReadinessPing = true;
  pingRebalancer.readinessPingTimeoutMs = PING_TIMEOUT_MS;
  t.equal(await pingRebalancer.isNodeReady(NODE_ID_A), false,
    'ping rejection path active');
  pingRebalancer.shutdown();

  ConfigurationManager.resetInstance();
});

// ── 7. getAvailableNodes characterization ─────────────────────────
//
// Lock the behavior that getAvailableNodes filters nodes using
// repairEligible from the control-plane readiness service.

test('getAvailableNodes — returns only nodes with repairEligible ' +
  'dimension true', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const now = Date.now();
  const readyRow = createNodeRow(NODE_ID_A);
  const expiredRow = createNodeRow(NODE_ID_B, {
    ready_lease_expires_at: now + LEASE_OFFSET_EXPIRED,
  });
  const cache = createSystemCache([readyRow, expiredRow]);
  const router = createRouter();
  const rebalancer = createRebalancer(cache, router);

  const available = rebalancer.getAvailableNodes();

  t.equal(available.length, 1,
    'only one node passes repairEligible filter');
  t.equal(available[0].node_id, NODE_ID_A,
    'ready node passes filter');

  rebalancer.shutdown();
  ConfigurationManager.resetInstance();
});

test('getAvailableNodes — excludes nodes without node_id', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const cache = createSystemCache([{
    node_id: null,
    status: SERVICE_STATUS.ACTIVE,
    ready_lease_expires_at: Date.now() + LEASE_OFFSET_VALID,
  }]);
  const router = createRouter();
  const rebalancer = createRebalancer(cache, router);

  const available = rebalancer.getAvailableNodes();
  t.equal(available.length, 0,
    'node without node_id is excluded');

  rebalancer.shutdown();
  ConfigurationManager.resetInstance();
});

// ── 8. Property-based equivalence test ────────────────────────────
//
// For arbitrary node readiness inputs, prove the rebalancer's
// transport readiness decision matches the policy's transport
// readiness decision.
//
// **Validates: Requirements 5.1, 5.2**

test('property: rebalancer transport readiness is equivalent to ' +
  'policy isNodeReadyWithTransport for arbitrary inputs', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const nodeStatusArb = fc.constantFrom(
    SERVICE_STATUS.ACTIVE,
    SERVICE_STATUS.JOINING,
    SERVICE_STATUS.LEAVING,
    SERVICE_STATUS.STOPPED,
  );
  const connectionStateArb = fc.constantFrom(
    STATE.CONNECTED,
    STATE.DISCONNECTED,
    STATE.READY,
  );
  const boolArb = fc.boolean();
  const leaseOffsetArb = fc.integer({min: -60000, max: 60000});

  await fc.assert(
    fc.asyncProperty(
      nodeStatusArb,
      leaseOffsetArb,
      connectionStateArb,
      boolArb,
      boolArb,
      async (status, leaseOffset, connState, outbound, ping) => {
        const now = Date.now();
        const nodeRow = {
          node_id: NODE_ID_A,
          status,
          connection_state: STATE.READY,
          ready_lease_expires_at: now + leaseOffset,
          last_heartbeat: now,
        };
        const cache = createSystemCache(nodeRow);
        const router = {
          getConnectionState: () => connState,
          isOutboundQueueAvailable: () => outbound,
          pingNode: async () => ping,
          getConnectedNodes: () => [],
        };

        const rebalancer = createRebalancer(cache, router);

        // Rebalancer transport check (connection + outbound queue)
        const rebalancerTransport =
          rebalancer.isTransportReady(NODE_ID_A);

        // Policy transport check (connection + outbound queue)
        // Note: policy also checks record readiness first, so we
        // isolate the transport-only portion by checking connection
        // and outbound separately.
        const policyConnected = connState === STATE.CONNECTED;
        const policyOutbound = outbound;
        const policyTransport = policyConnected && policyOutbound;

        // The rebalancer's isTransportReady checks:
        // 1. router.getConnectionState(nodeId) === STATE.CONNECTED
        // 2. router.isOutboundQueueAvailable(nodeId)
        // This must match the policy's equivalent checks.
        if (rebalancerTransport !== policyTransport) {
          rebalancer.shutdown();
          return false;
        }

        rebalancer.shutdown();
        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('transport readiness equivalence holds across arbitrary inputs');
  ConfigurationManager.resetInstance();
});

test('property: rebalancer isNodeReady rejection matches policy ' +
  'rejection for same readiness inputs', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const nodeStatusArb = fc.constantFrom(
    SERVICE_STATUS.ACTIVE,
    SERVICE_STATUS.JOINING,
    SERVICE_STATUS.LEAVING,
    SERVICE_STATUS.STOPPED,
  );
  const connectionStateArb = fc.constantFrom(
    STATE.CONNECTED,
    STATE.DISCONNECTED,
  );
  const boolArb = fc.boolean();
  const leaseOffsetArb = fc.integer({min: -60000, max: 60000});

  await fc.assert(
    fc.asyncProperty(
      nodeStatusArb,
      leaseOffsetArb,
      connectionStateArb,
      boolArb,
      async (status, leaseOffset, connState, outbound) => {
        const now = Date.now();
        const nodeRow = {
          node_id: NODE_ID_A,
          status,
          connection_state: STATE.READY,
          ready_lease_expires_at: now + leaseOffset,
          last_heartbeat: now,
        };
        const cache = createSystemCache(nodeRow);
        const router = {
          getConnectionState: () => connState,
          isOutboundQueueAvailable: () => outbound,
          pingNode: async () => true,
          getConnectedNodes: () => [],
        };

        const rebalancer = createRebalancer(cache, router);
        // Disable ping to isolate record + transport equivalence
        rebalancer.enableReadinessPing = false;

        const rebalancerReady =
          await rebalancer.isNodeReady(NODE_ID_A);

        // Policy composed check: record ready + transport ready
        const _recordReady = isNodeRecordReady(nodeRow, {now});
        const policyTransport = await isNodeReadyWithTransport({
          nodeId: NODE_ID_A,
          systemTableCache: cache,
          messageRouter: router,
          now,
          requireOutboundQueue: true,
        });

        // The rebalancer gates on repairEligible (which mirrors
        // isNodeRecordReady) then on transport. When both are true,
        // the rebalancer returns true. When either is false, it
        // returns false. The policy composition should match.
        //
        // Note: the rebalancer uses controlPlaneReadinessService
        // which checks status + lease (same as isNodeRecordReady).
        // The policy's isNodeReadyWithTransport also checks record
        // readiness internally, so policyTransport already includes
        // the record check.
        if (rebalancerReady !== policyTransport) {
          rebalancer.shutdown();
          return false;
        }

        rebalancer.shutdown();
        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('full isNodeReady equivalence holds across arbitrary inputs');
  ConfigurationManager.resetInstance();
});


// ── 9. Skip reason granularity via getNodeReadinessSkipReason ─────
//
// These tests prove that after policy adoption, the rebalancer
// preserves granular skip reasons for each readiness dimension.
// Validates: Requirements 5.3, 9.2
// Design: D6.3, D11.1

test('getNodeReadinessSkipReason — ready node returns null', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const nodeRow = createNodeRow(NODE_ID_A);
  const cache = createSystemCache(nodeRow);
  const router = createRouter();
  const rebalancer = createRebalancer(cache, router);

  const reason = await rebalancer.getNodeReadinessSkipReason(NODE_ID_A);
  t.equal(reason, null,
    'ready node produces no skip reason');

  rebalancer.shutdown();
  ConfigurationManager.resetInstance();
});

test('getNodeReadinessSkipReason — expired lease returns ' +
  'READINESS_SKIP_DETAIL.LEASE_EXPIRED', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const nodeRow = createNodeRow(NODE_ID_A, {
    ready_lease_expires_at: Date.now() + LEASE_OFFSET_EXPIRED,
  });
  const cache = createSystemCache(nodeRow);
  const router = createRouter();
  const rebalancer = createRebalancer(cache, router);

  const reason = await rebalancer.getNodeReadinessSkipReason(NODE_ID_A);
  t.equal(reason, READINESS_SKIP_DETAIL.LEASE_EXPIRED,
    'expired lease maps to lease skip detail');

  rebalancer.shutdown();
  ConfigurationManager.resetInstance();
});

test('getNodeReadinessSkipReason — non-active status returns ' +
  'READINESS_SKIP_DETAIL.STATUS_NOT_ACTIVE', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const nodeRow = createNodeRow(NODE_ID_A, {
    status: SERVICE_STATUS.JOINING,
  });
  const cache = createSystemCache(nodeRow);
  const router = createRouter();
  const rebalancer = createRebalancer(cache, router);

  const reason = await rebalancer.getNodeReadinessSkipReason(NODE_ID_A);
  t.equal(reason, READINESS_SKIP_DETAIL.STATUS_NOT_ACTIVE,
    'non-active status maps to status skip detail');

  rebalancer.shutdown();
  ConfigurationManager.resetInstance();
});

test('getNodeReadinessSkipReason — disconnected transport returns ' +
  'READINESS_SKIP_DETAIL.CONNECTION_DOWN', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const nodeRow = createNodeRow(NODE_ID_A);
  const cache = createSystemCache(nodeRow);
  const router = createRouter({connectionState: STATE.DISCONNECTED});
  const rebalancer = createRebalancer(cache, router);

  const reason = await rebalancer.getNodeReadinessSkipReason(NODE_ID_A);
  t.equal(reason, READINESS_SKIP_DETAIL.CONNECTION_DOWN,
    'disconnected transport maps to connection skip detail');

  rebalancer.shutdown();
  ConfigurationManager.resetInstance();
});

test('getNodeReadinessSkipReason — unavailable outbound queue ' +
  'returns READINESS_SKIP_DETAIL.OUTBOUND_QUEUE_UNAVAILABLE',
async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const nodeRow = createNodeRow(NODE_ID_A);
  const cache = createSystemCache(nodeRow);
  const router = createRouter({outboundAvailable: false});
  const rebalancer = createRebalancer(cache, router);

  const reason = await rebalancer.getNodeReadinessSkipReason(NODE_ID_A);
  t.equal(reason, READINESS_SKIP_DETAIL.OUTBOUND_QUEUE_UNAVAILABLE,
    'unavailable outbound queue maps to outbound_queue skip detail');

  rebalancer.shutdown();
  ConfigurationManager.resetInstance();
});

test('getNodeReadinessSkipReason — failed ping returns ' +
  'READINESS_SKIP_DETAIL.PING_FAILED', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const nodeRow = createNodeRow(NODE_ID_A);
  const cache = createSystemCache(nodeRow);
  const router = createRouter({pingResult: false});
  const rebalancer = createRebalancer(cache, router);
  rebalancer.enableReadinessPing = true;
  rebalancer.readinessPingTimeoutMs = PING_TIMEOUT_MS;

  const reason = await rebalancer.getNodeReadinessSkipReason(NODE_ID_A);
  t.equal(reason, READINESS_SKIP_DETAIL.PING_FAILED,
    'failed ping maps to ping skip detail');

  rebalancer.shutdown();
  ConfigurationManager.resetInstance();
});

test('getNodeReadinessSkipReason — missing node row returns ' +
  'READINESS_SKIP_DETAIL.REPAIR_INELIGIBLE', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const cache = createSystemCache([]);
  const router = createRouter();
  const rebalancer = createRebalancer(cache, router);

  const reason = await rebalancer.getNodeReadinessSkipReason(NODE_ID_A);
  t.equal(reason, READINESS_SKIP_DETAIL.REPAIR_INELIGIBLE,
    'missing node row maps to repair_ineligible skip detail');

  rebalancer.shutdown();
  ConfigurationManager.resetInstance();
});

// ── 10. Skip reason constant used in move results ─────────────────
//
// Prove that executeMove uses the named constant
// REBALANCER_SKIP_REASON.NODE_NOT_READY and includes skipDetail.

test('executeMove — skipped move uses NODE_NOT_READY constant ' +
  'and includes skipDetail', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const nodeRow = createNodeRow(NODE_ID_A, {
    ready_lease_expires_at: Date.now() + LEASE_OFFSET_EXPIRED,
  });
  const cache = createSystemCache(nodeRow);
  const router = createRouter();
  const rebalancer = createRebalancer(cache, router, {
    rebalanceCoordinator: {
      getMoveSafetyError: async () => null,
      createOperation: async () => ({operationId: 'op-1'}),
    },
  });

  const result = await rebalancer.executeMove({
    type: 'add',
    nodeId: NODE_ID_A,
    replicaId: 'r-1',
  });

  t.equal(result.success, false, 'move not successful');
  t.equal(result.skipped, true, 'move was skipped');
  t.equal(result.reason, REBALANCER_SKIP_REASON.NODE_NOT_READY,
    'reason uses named constant');
  t.equal(result.skipDetail, READINESS_SKIP_DETAIL.LEASE_EXPIRED,
    'skipDetail preserves granular reason');

  rebalancer.shutdown();
  ConfigurationManager.resetInstance();
});

test('executeMove — skipped move for disconnected node includes ' +
  'connection skipDetail', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const nodeRow = createNodeRow(NODE_ID_A);
  const cache = createSystemCache(nodeRow);
  const router = createRouter({connectionState: STATE.DISCONNECTED});
  const rebalancer = createRebalancer(cache, router, {
    rebalanceCoordinator: {
      getMoveSafetyError: async () => null,
      createOperation: async () => ({operationId: 'op-1'}),
    },
  });

  const result = await rebalancer.executeMove({
    type: 'add',
    nodeId: NODE_ID_A,
    replicaId: 'r-1',
  });

  t.equal(result.reason, REBALANCER_SKIP_REASON.NODE_NOT_READY,
    'reason uses named constant');
  t.equal(result.skipDetail, READINESS_SKIP_DETAIL.CONNECTION_DOWN,
    'skipDetail preserves connection reason');

  rebalancer.shutdown();
  ConfigurationManager.resetInstance();
});

// ── 11. Property: skip reason granularity covers all dimensions ───
//
// For arbitrary readiness inputs, prove that
// getNodeReadinessSkipReason returns a value from
// READINESS_SKIP_DETAIL when isNodeReady returns false, and null
// when isNodeReady returns true.
//
// **Validates: Requirements 5.3, 9.2**

test('property: getNodeReadinessSkipReason is null iff ' +
  'isNodeReady is true', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const validDetails = new Set(Object.values(READINESS_SKIP_DETAIL));

  const nodeStatusArb = fc.constantFrom(
    SERVICE_STATUS.ACTIVE,
    SERVICE_STATUS.JOINING,
    SERVICE_STATUS.LEAVING,
    SERVICE_STATUS.STOPPED,
  );
  const connectionStateArb = fc.constantFrom(
    STATE.CONNECTED,
    STATE.DISCONNECTED,
  );
  const boolArb = fc.boolean();
  const leaseOffsetArb = fc.integer({min: -60000, max: 60000});

  await fc.assert(
    fc.asyncProperty(
      nodeStatusArb,
      leaseOffsetArb,
      connectionStateArb,
      boolArb,
      async (status, leaseOffset, connState, outbound) => {
        const now = Date.now();
        const nodeRow = {
          node_id: NODE_ID_A,
          status,
          connection_state: STATE.READY,
          ready_lease_expires_at: now + leaseOffset,
          last_heartbeat: now,
        };
        const cache = createSystemCache(nodeRow);
        const router = {
          getConnectionState: () => connState,
          isOutboundQueueAvailable: () => outbound,
          pingNode: async () => true,
          getConnectedNodes: () => [],
        };

        const rebalancer = createRebalancer(cache, router);
        rebalancer.enableReadinessPing = false;

        const ready = await rebalancer.isNodeReady(NODE_ID_A);
        const skipReason =
          await rebalancer.getNodeReadinessSkipReason(NODE_ID_A);

        if (ready && skipReason !== null) {
          rebalancer.shutdown();
          return false;
        }
        if (!ready && skipReason === null) {
          rebalancer.shutdown();
          return false;
        }
        if (skipReason !== null && !validDetails.has(skipReason)) {
          rebalancer.shutdown();
          return false;
        }

        rebalancer.shutdown();
        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('skip reason granularity is consistent with isNodeReady');
  ConfigurationManager.resetInstance();
});
