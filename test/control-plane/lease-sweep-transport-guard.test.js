/**
 * Regression: lease sweep must not mark a node as disconnected when
 * the message router reports the node as transport-connected.
 *
 * Root cause: during CDC propagation delays (e.g. under split load),
 * heartbeat CDC events arrive late, causing the cached lease to expire.
 * The lease sweep then marks the node as disconnected, which poisons
 * the connection_state field in the cache. This causes
 * isClusterMemberHealthy to return false for all nodes, blocking
 * split child provisioning admission (§1.4.12 violation).
 *
 * Uses `LeaseService.messageRouter` — the canonical transport owner.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {LeaseService} from '../../src/control-plane/lease-service.js';
import {STATE} from '../../src/constants/index.js';

const NODE_ID_SEED = 'node-seed';
const NODE_ID_CONNECTED = 'node-connected';
const NODE_ID_DISCONNECTED = 'node-disconnected';
const NODE_ID_UNKNOWN = 'node-unknown-transport';
const LEASE_EXPIRED_AT = 99;
const LAST_HEARTBEAT_AT = 90;
const INJECTED_NOW = 100;

function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({});
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function createNodeLeaseOwner(onDisconnect) {
  return {
    disconnectNodeDueToLeaseExpiry: onDisconnect,
  };
}

function createMessageRouter(connectionStateByNodeId) {
  return {
    getConnectionState(nodeId) {
      const state = connectionStateByNodeId[nodeId];
      return state !== undefined ? state : null;
    },
  };
}

function buildExpiredNodeRow(nodeId) {
  return {
    node_id: nodeId,
    ready_lease_expires_at: LEASE_EXPIRED_AT,
    last_heartbeat: LAST_HEARTBEAT_AT,
  };
}

test('lease sweep skips disconnect for transport-connected nodes ' +
  '(§1.4.12 CDC delay resilience)', async (t) => {
  initEnv();

  const disconnectedNodeIds = [];
  const service = new LeaseService({
    nodeId: NODE_ID_SEED,
    now: () => INJECTED_NOW,
    nodeLeaseOwner: createNodeLeaseOwner(async (node) => {
      disconnectedNodeIds.push(node.node_id);
      return {success: true, partitionResult: {affectedRows: 1}};
    }),
    systemTableCache: {getAll: () => []},
    controlPlaneSystemTableGateway: {
      async readRows() {
        return {
          success: true,
          rows: [
            buildExpiredNodeRow(NODE_ID_CONNECTED),
            buildExpiredNodeRow(NODE_ID_DISCONNECTED),
          ],
        };
      },
    },
    messageGroupServices: new Set([
      {isLeaderReplica: () => true},
    ]),
    messageRouter: createMessageRouter({
      [NODE_ID_CONNECTED]: STATE.CONNECTED,
      [NODE_ID_DISCONNECTED]: STATE.DISCONNECTED,
    }),
  });
  service.initialize();

  try {
    const expiredIds = await service.sweepExpiredLeases();

    t.same(
      disconnectedNodeIds,
      [NODE_ID_DISCONNECTED],
      'should only disconnect the transport-disconnected node',
    );
    t.same(
      expiredIds,
      [NODE_ID_DISCONNECTED],
      'only transport-disconnected node should appear in expired list',
    );
  } finally {
    service.stop();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test('lease sweep disconnects nodes when no message router is ' +
  'available (backward compatibility)', async (t) => {
  initEnv();

  const disconnectedNodeIds = [];
  const service = new LeaseService({
    nodeId: NODE_ID_SEED,
    now: () => INJECTED_NOW,
    nodeLeaseOwner: createNodeLeaseOwner(async (node) => {
      disconnectedNodeIds.push(node.node_id);
      return {success: true, partitionResult: {affectedRows: 1}};
    }),
    systemTableCache: {getAll: () => []},
    controlPlaneSystemTableGateway: {
      async readRows() {
        return {
          success: true,
          rows: [
            buildExpiredNodeRow(NODE_ID_CONNECTED),
            buildExpiredNodeRow(NODE_ID_DISCONNECTED),
          ],
        };
      },
    },
    messageGroupServices: new Set([
      {isLeaderReplica: () => true},
    ]),
    // No messageRouter — should fall back to disconnecting all expired
  });
  service.initialize();

  try {
    const expiredIds = await service.sweepExpiredLeases();

    t.same(
      disconnectedNodeIds.sort(),
      [NODE_ID_CONNECTED, NODE_ID_DISCONNECTED].sort(),
      'without router, all expired nodes should be disconnected',
    );
    t.equal(
      expiredIds.length,
      2,
      'both expired nodes should appear in expired list',
    );
  } finally {
    service.stop();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test('lease sweep disconnects nodes with null/unknown router state ' +
  '(no transport evidence)', async (t) => {
  initEnv();

  const disconnectedNodeIds = [];
  const service = new LeaseService({
    nodeId: NODE_ID_SEED,
    now: () => INJECTED_NOW,
    nodeLeaseOwner: createNodeLeaseOwner(async (node) => {
      disconnectedNodeIds.push(node.node_id);
      return {success: true, partitionResult: {affectedRows: 1}};
    }),
    systemTableCache: {getAll: () => []},
    controlPlaneSystemTableGateway: {
      async readRows() {
        return {
          success: true,
          rows: [
            buildExpiredNodeRow(NODE_ID_UNKNOWN),
          ],
        };
      },
    },
    messageGroupServices: new Set([
      {isLeaderReplica: () => true},
    ]),
    messageRouter: createMessageRouter({
      // NODE_ID_UNKNOWN not in map → getConnectionState returns null
    }),
  });
  service.initialize();

  try {
    const expiredIds = await service.sweepExpiredLeases();

    t.same(
      disconnectedNodeIds,
      [NODE_ID_UNKNOWN],
      'node with no transport evidence should be disconnected',
    );
    t.same(
      expiredIds,
      [NODE_ID_UNKNOWN],
      'node with no transport evidence should appear in expired list',
    );
  } finally {
    service.stop();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test('lease sweep fails closed on an out-of-domain "ready" router state ' +
  '(§1.4.12 atom drops the inert || READY disjunct)', async (t) => {
  // Spec node-liveness-veto-consolidation: the guard now routes through the
  // hasLiveTransportEvidence atom, which compares CONNECTED only. The live
  // transport state machine (CONNECTION_STATE: disconnected/connecting/
  // connected/reconnecting/closed) has NO `ready` state — getConnectionState
  // returns connection.state, never 'ready' — so the old inline `|| READY`
  // disjunct was inert over the real live domain. On a hypothetical (non-
  // physical) 'ready' router value the atom is STRICTER (fails closed → the
  // node is swept), a documented, bounded divergence pinned in
  // live-transport-evidence-parity.characterization.test.js. This test locks
  // that fail-closed behavior so the atom stays load-bearing at this site.
  initEnv();

  const disconnectedNodeIds = [];
  const service = new LeaseService({
    nodeId: NODE_ID_SEED,
    now: () => INJECTED_NOW,
    nodeLeaseOwner: createNodeLeaseOwner(async (node) => {
      disconnectedNodeIds.push(node.node_id);
      return {success: true, partitionResult: {affectedRows: 1}};
    }),
    systemTableCache: {getAll: () => []},
    controlPlaneSystemTableGateway: {
      async readRows() {
        return {
          success: true,
          rows: [
            buildExpiredNodeRow(NODE_ID_CONNECTED),
          ],
        };
      },
    },
    messageGroupServices: new Set([
      {isLeaderReplica: () => true},
    ]),
    messageRouter: createMessageRouter({
      [NODE_ID_CONNECTED]: STATE.READY,
    }),
  });
  service.initialize();

  try {
    const expiredIds = await service.sweepExpiredLeases();

    t.same(
      disconnectedNodeIds,
      [NODE_ID_CONNECTED],
      'out-of-domain "ready" is not live transport evidence → node is swept',
    );
    t.same(
      expiredIds,
      [NODE_ID_CONNECTED],
      'out-of-domain "ready" node appears in the expired list',
    );
  } finally {
    service.stop();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});
