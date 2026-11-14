/**
 * The seed's hydration -> live CDC hand-off order (CDC decision D4, owner
 * 2026-10-26): SeedCacheHydrationPhase registers each system table's CDC
 * subscribers on every local replica of its partition BEFORE it reads that
 * table's image through the partition's hydration image owner
 * (readHydrationImage), applies the image after the read, and records the
 * image position P per table. The leader wait follows every table's handoff
 * (it evaluates the hydrated cache, not live CDC). The repair re-read reads
 * through the same owner and registers nothing (its subscribers exist).
 * The partition-level gap-freedom of this order is W-D4a
 * (test/partition/cdc-hydration-live-handoff.test.js); here the partitions
 * are recording doubles of that owner's two surfaces.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {SeedCacheHydrationPhase} from
  '../../src/bootstrap/phases/seed-cache-hydration-phase.js';
import {CACHE_HYDRATION_TABLES} from '../../src/cache/cache-constants.js';
import {
  INITIAL_PARTITION_IDS,
  getInitialReplicaIds,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {PARTITION_HYDRATION_IMAGE_STATE} from
  '../../src/partition/partition-service-hydration-image-methods.js';
import {buildCdcSubscriptionHandshake} from '../../src/partition/partition-cdc-delivery.js';
import {PARTITION_SERVICE_CDC} from '../../src/partition/partition-service-constants.js';
import {SeedRuntimeBridgeOwner} from '../../src/bootstrap/owners/seed-runtime-bridge-owner.js';
import {BootstrapNodeReadyRebalanceOwner} from
  '../../src/bootstrap/owners/bootstrap-node-ready-rebalance-owner.js';
import {BOOTSTRAP_ERROR} from '../../src/bootstrap/bootstrap-constants.js';
import {SERVICE_STATUS, TABLES} from '../../src/constants/index.js';

const SEED_NODE_ID = 'seed-handoff-node';
const LEADER_WAIT_REACHED = 'leader wait reached';
const LANE_RETRIES = 3;
const NODE_READY_DELAY_MS = 600000;
const READY_LEASE_MS = 600000;
const silentLogger = Object.freeze({debug() {}, info() {}, warn() {}, error() {}});
const positionOf = (tableName) => `${tableName.length + 100}`;
const handedOffTables = CACHE_HYDRATION_TABLES.filter((tableName) =>
  INITIAL_PARTITION_IDS[tableName] && (getInitialReplicaIds(tableName) || []).length > 0);

function recordingSeed({imageState = PARTITION_HYDRATION_IMAGE_STATE.READ} = {}) {
  const log = [];
  const partitionServices = new Map();
  for (const tableName of handedOffTables) {
    getInitialReplicaIds(tableName).forEach((replicaId, index) => {
      partitionServices.set(replicaId, {
        partitionId: INITIAL_PARTITION_IDS[tableName],
        replicaId,
        isLeader: index === 0,
        async subscribeToCDCWithHandshake(_subscriber, options = {}) {
          log.push(['register', tableName, replicaId]);
          return buildCdcSubscriptionHandshake({status: PARTITION_SERVICE_CDC.HANDSHAKE_STATUS_OK,
            subscriberId: options.subscriberId, subscriptionEpoch: 1, streamVersion: 0});
        },
        readHydrationImage(sql) {
          log.push(['read', tableName, sql]);
          return imageState === PARTITION_HYDRATION_IMAGE_STATE.READ ?
            {state: imageState, rows: [{id: `${tableName}-row`, updated_at_hlc: '1000:0:seed'}],
              appliedIndex: positionOf(tableName)} :
            {state: imageState, rows: [], reason: null};
        },
        cdcDelivery: {
          async acknowledgeHydratedObligationsThrough(appliedIndex) {
            log.push(['acknowledgeHydrated', tableName, appliedIndex]);
            return {acknowledged: 1};
          },
        },
      });
    });
  }
  const messageGroup = {
    groupId: 'mg-1',
    async subscribeToCDC() {},
    async applyCDCEvent(tableName, _op, _row, options) {
      log.push(['apply', tableName, options?.timestamp ?? null]);
    },
  };
  const delegates = {
    getLogger: () => silentLogger,
    getConfig: () => ({}),
    getNodeId: () => SEED_NODE_ID,
    getPartitionServices: () => partitionServices,
    getMessageGroupServices: () => new Map([['mg-1-r1', messageGroup]]),
    getSystemTableCache: () => ({}),
    getLeaderMessageGroupService: () => messageGroup,
  };
  return {log, messageGroup, delegates};
}

function firstIndex(log, kind, tableName) {
  return log.findIndex((entry) => entry[0] === kind && entry[1] === tableName);
}
function lastIndex(log, kind, tableName) {
  return log.findLastIndex((entry) => entry[0] === kind && entry[1] === tableName);
}

test('seed handoff: each table\'s subscribers register on every replica before its image ' +
  'is read through readHydrationImage, the image applies after the read, and P is recorded ' +
  'per table', async () => {
  const {log, messageGroup, delegates} = recordingSeed();
  const phase = new SeedCacheHydrationPhase({delegates, runtimeBridgeOwner: {}});
  const result = await phase.hydrateFromLocalPartitions({}, messageGroup, {
    registerSubscribers: (tableName) => phase.subscribeToInitialSystemTableCDC(tableName),
  });
  const perTable = handedOffTables.map((tableName, index) => ({
    tableName,
    registeredReplicas: log.filter((entry) => entry[0] === 'register' &&
      entry[1] === tableName).length,
    registeredBeforeRead: lastIndex(log, 'register', tableName) <
      firstIndex(log, 'read', tableName),
    readBeforeApply: firstIndex(log, 'read', tableName) < firstIndex(log, 'apply', tableName),
    applyBeforeAcknowledge: lastIndex(log, 'apply', tableName) <
      firstIndex(log, 'acknowledgeHydrated', tableName),
    readBeforeNextTable: index === handedOffTables.length - 1 ||
      lastIndex(log, 'acknowledgeHydrated', tableName) <
        firstIndex(log, 'register', handedOffTables[index + 1]),
    recordedPosition: result.tables[tableName]?.appliedIndex ?? null,
  }));
  assert.deepEqual({success: result.success, perTable}, {
    success: true,
    perTable: handedOffTables.map((tableName) => ({
      tableName,
      registeredReplicas: getInitialReplicaIds(tableName).length,
      registeredBeforeRead: true,
      readBeforeApply: true,
      applyBeforeAcknowledge: true,
      readBeforeNextTable: true,
      recordedPosition: positionOf(tableName),
    })),
  });
});

test('seed handoff: the repair re-read consumes readHydrationImage and registers nothing',
  async () => {
    const {log, messageGroup, delegates} = recordingSeed();
    const phase = new SeedCacheHydrationPhase({delegates, runtimeBridgeOwner: {}});
    const result = await phase.hydrateFromLocalPartitions({}, messageGroup);
    assert.deepEqual({
      registrations: log.filter((entry) => entry[0] === 'register').length,
      reads: log.filter((entry) => entry[0] === 'read').length,
      positions: handedOffTables.map((tableName) => result.tables[tableName]?.appliedIndex),
    }, {
      registrations: 0,
      reads: handedOffTables.length,
      positions: handedOffTables.map(positionOf),
    });
  });

test('seed handoff: an image the owner refuses (no leader) fails the table typed and ' +
  'applies nothing', async () => {
  const {log, messageGroup, delegates} = recordingSeed(
    {imageState: PARTITION_HYDRATION_IMAGE_STATE.NOT_LEADER});
  const phase = new SeedCacheHydrationPhase({delegates, runtimeBridgeOwner: {}});
  const result = await phase.hydrateFromLocalPartitions({}, messageGroup);
  assert.deepEqual({
    success: result.success,
    failedTables: result.errors.length,
    applied: log.filter((entry) => entry[0] === 'apply').length,
    error: result.tables[handedOffTables[0]].error,
  }, {
    success: false,
    failedTables: handedOffTables.length,
    applied: 0,
    error: `Hydration image not read: ${PARTITION_HYDRATION_IMAGE_STATE.NOT_LEADER}`,
  });
});

test('seed handoff: phaseCacheHydration completes every table\'s handoff before the leader ' +
  'wait', async () => {
  const {log, delegates} = recordingSeed();
  const phase = new SeedCacheHydrationPhase({delegates, runtimeBridgeOwner: {}});
  phase.verifyCacheHydration = () => {
    log.push(['verify']);
  };
  phase.waitForSystemServiceLeadersInCache = async () => {
    log.push(['leaderWait']);
    throw new Error(LEADER_WAIT_REACHED);
  };
  await assert.rejects(phase.phaseCacheHydration(), new RegExp(LEADER_WAIT_REACHED));
  const leaderWait = log.findIndex((entry) => entry[0] === 'leaderWait');
  assert.deepEqual({
    handoffsBeforeLeaderWait: handedOffTables.every((tableName) =>
      lastIndex(log, 'apply', tableName) < leaderWait &&
      lastIndex(log, 'register', tableName) < firstIndex(log, 'read', tableName)),
    verifyBeforeLeaderWait: log.findIndex((entry) => entry[0] === 'verify') < leaderWait,
  }, {handoffsBeforeLeaderWait: true, verifyBeforeLeaderWait: true});
});

test('seed handoff: before the latency owners exist the lane retries a nodes event whose ' +
  'propagation is refused (LATENCY_TOPOLOGY_MISSING); beforePropagation runs on every retry ' +
  'and the node-ready rebalance trigger it calls is idempotent (one schedule)', async () => {
  const subscribers = [];
  const partition = {
    partitionId: INITIAL_PARTITION_IDS[TABLES.NODES],
    isLeader: true,
    async subscribeToCDCWithHandshake(subscriber, options = {}) {
      subscribers.push(subscriber);
      return buildCdcSubscriptionHandshake({status: PARTITION_SERVICE_CDC.HANDSHAKE_STATUS_OK,
        subscriberId: options.subscriberId, subscriptionEpoch: 1, streamVersion: 0});
    },
  };
  const executed = [];
  const rebalanceOwner = new BootstrapNodeReadyRebalanceOwner({delegates: {
    getLogger: () => silentLogger,
    getLocalNodeId: () => SEED_NODE_ID,
    getNodeReadyRebalanceDelayMs: () => NODE_READY_DELAY_MS,
    executeNodeReadyRebalance: (reason) => executed.push(reason),
  }});
  const messageGroup = {groupId: 'mg-1', initialized: true, async subscribeToCDC() {}};
  const delegates = {
    getLogger: () => silentLogger,
    getNodeId: () => SEED_NODE_ID,
    getMessageGroupServices: () => new Map([['mg-1-r1', messageGroup]]),
    getPartitionServices: () => new Map([[getInitialReplicaIds(TABLES.NODES)[0], partition]]),
    getSystemTableCache: () => ({get: () => null}),
    getLatencyTopology: () => null,
    resolveOperationalMessageGroupSelectionAsync: async () => ({service: messageGroup}),
    handleNodeReadyRebalanceTrigger: (event, previousRow) =>
      rebalanceOwner.handleNodeReadyRebalanceTrigger(event, previousRow),
  };
  const bridge = new SeedRuntimeBridgeOwner({delegates});
  delegates.propagatePartitionCDCEvent = (service, events, context) =>
    bridge.propagatePartitionCDCEvent(service, events, context);
  const phase = new SeedCacheHydrationPhase({delegates, runtimeBridgeOwner: bridge});
  await phase.subscribeToInitialSystemTableCDC(TABLES.NODES);
  const event = {tableName: TABLES.NODES, operation: 'UPDATE',
    data: {node_id: 'remote-node', status: SERVICE_STATUS.ACTIVE,
      ready_lease_expires_at: Date.now() + READY_LEASE_MS}};
  const refusals = [];
  try {
    for (let retry = 0; retry < LANE_RETRIES; retry += 1) {
      await subscribers[0](Object.freeze([event]))
        .catch((error) => refusals.push(error.message));
    }
    assert.deepEqual({
      refusals,
      scheduled: rebalanceOwner.pendingNodeReadyRebalanceTimers.size,
      executed: executed.length,
    }, {
      refusals: Array(LANE_RETRIES).fill(BOOTSTRAP_ERROR.LATENCY_TOPOLOGY_MISSING),
      scheduled: 1,
      executed: 0,
    });
  } finally {
    rebalanceOwner.clearNodeReadyRebalanceState();
  }
});

// --- the node-ready hook over a vector (quest cdc-obligation-range-shipping,
// record S-4b) ---
//
// The seed's NODES subscriber, registered through the real phase, with the
// real node-ready rebalance owner behind its trigger. The node cache is a
// recording double that merges an applied row as the system table cache does
// for NODES ({...existing, ...incoming}; a DELETE removes the row), and the
// propagation double applies a vector's members to it in order, as the source
// leaf of a wave does. One-event delivery is the same subscriber handed
// vectors of one, the cache applied between them.
async function nodeReadyHookSeed() {
  const subscribers = [];
  const partition = {
    partitionId: INITIAL_PARTITION_IDS[TABLES.NODES],
    isLeader: true,
    async subscribeToCDCWithHandshake(subscriber, options = {}) {
      subscribers.push(subscriber);
      return buildCdcSubscriptionHandshake({status: PARTITION_SERVICE_CDC.HANDSHAKE_STATUS_OK,
        subscriberId: options.subscriberId, subscriptionEpoch: 1, streamVersion: 0});
    },
  };
  const rebalanceOwner = new BootstrapNodeReadyRebalanceOwner({delegates: {
    getLogger: () => silentLogger,
    getLocalNodeId: () => SEED_NODE_ID,
    getNodeReadyRebalanceDelayMs: () => NODE_READY_DELAY_MS,
    executeNodeReadyRebalance: () => {},
  }});
  const nodeRows = new Map();
  const triggers = [];
  const messageGroup = {groupId: 'mg-1', initialized: true, async subscribeToCDC() {}};
  const delegates = {
    getLogger: () => silentLogger,
    getNodeId: () => SEED_NODE_ID,
    getMessageGroupServices: () => new Map([['mg-1-r1', messageGroup]]),
    getPartitionServices: () => new Map([[getInitialReplicaIds(TABLES.NODES)[0], partition]]),
    getSystemTableCache: () => ({get: (_table, nodeId) => nodeRows.get(nodeId) ?? null}),
    resolveOperationalMessageGroupSelectionAsync: async () => ({service: messageGroup}),
    handleNodeReadyRebalanceTrigger: (event, previousRow) => {
      const scheduled = rebalanceOwner.handleNodeReadyRebalanceTrigger(event, previousRow);
      triggers.push({nodeId: event.data.node_id, operation: event.operation,
        status: event.data.status ?? null, previousRow: previousRow && {...previousRow},
        scheduled});
    },
    propagatePartitionCDCEvent: async (_service, events) => {
      for (const event of events) {
        if (event.operation === 'DELETE') nodeRows.delete(event.data.node_id);
        else {
          nodeRows.set(event.data.node_id,
            {...nodeRows.get(event.data.node_id), ...event.data});
        }
      }
    },
  };
  const phase = new SeedCacheHydrationPhase({delegates, runtimeBridgeOwner: {}});
  await phase.subscribeToInitialSystemTableCDC(TABLES.NODES);
  return {subscriber: subscribers[0], nodeRows, triggers, rebalanceOwner};
}

const LEASE = 4102444800000; // far in the future: the lease never lapses in the witness
const nodeRow = (nodeId, status, extra = {}) => ({node_id: nodeId, status, ...extra});
const nodesEvent = (operation, data) => ({tableName: TABLES.NODES, operation, data});
const NODE_READY_VECTORS = Object.freeze({
  'a node made ready and then renewed': {
    cached: [nodeRow('n1', 'joining', {address: 'n1:1'})],
    events: [
      nodesEvent('UPDATE', nodeRow('n1', SERVICE_STATUS.ACTIVE, {ready_lease_expires_at: LEASE})),
      nodesEvent('UPDATE', nodeRow('n1', SERVICE_STATUS.ACTIVE,
        {ready_lease_expires_at: LEASE + 1, last_heartbeat: 5})),
    ],
    scheduled: [true, false],
  },
  'a partial row first, ready second': {
    cached: [nodeRow('n1', 'joining', {address: 'n1:1', ready_lease_expires_at: LEASE})],
    events: [
      nodesEvent('UPDATE', {node_id: 'n1', address: 'n1:2'}),
      nodesEvent('UPDATE', {node_id: 'n1', status: SERVICE_STATUS.ACTIVE}),
    ],
    scheduled: [false, true],
  },
  'a node deleted and inserted ready again': {
    cached: [nodeRow('n1', SERVICE_STATUS.ACTIVE, {ready_lease_expires_at: LEASE})],
    events: [
      nodesEvent('DELETE', {node_id: 'n1'}),
      nodesEvent('INSERT', nodeRow('n1', SERVICE_STATUS.ACTIVE,
        {ready_lease_expires_at: LEASE + 2})),
    ],
    scheduled: null,
  },
  'two nodes interleaved': {
    cached: [nodeRow('n1', 'joining'), nodeRow('n2', 'joining')],
    events: [
      nodesEvent('UPDATE', nodeRow('n1', SERVICE_STATUS.ACTIVE, {ready_lease_expires_at: LEASE})),
      nodesEvent('UPDATE', nodeRow('n2', SERVICE_STATUS.ACTIVE, {ready_lease_expires_at: LEASE})),
      nodesEvent('UPDATE', nodeRow('n1', SERVICE_STATUS.ACTIVE,
        {ready_lease_expires_at: LEASE + 3})),
    ],
    scheduled: [true, true, false],
  },
});

for (const [name, {cached, events, scheduled}] of Object.entries(NODE_READY_VECTORS)) {
  test(`seed node-ready hook: ${name} - one vector triggers exactly as the same events ` +
    'delivered one at a time', async () => {
    const perEvent = await nodeReadyHookSeed();
    const vector = await nodeReadyHookSeed();
    try {
      for (const seed of [perEvent, vector]) {
        for (const row of cached) seed.nodeRows.set(row.node_id, {...row});
      }
      for (const event of events) await perEvent.subscriber(Object.freeze([event]));
      await vector.subscriber(Object.freeze([...events]));
      assert.equal(perEvent.triggers.length, events.length);
      assert.deepEqual(vector.triggers, perEvent.triggers,
        'each member saw the previous row and took the decision of one-event delivery');
      assert.deepEqual([...vector.nodeRows], [...perEvent.nodeRows]);
      // Literal anchors, independent of the one-event run.
      assert.deepEqual(vector.triggers[0].previousRow,
        cached.find((row) => row.node_id === events[0].data.node_id),
        'the first member of a node reads the cached row');
      if (scheduled !== null) {
        assert.deepEqual(vector.triggers.map((trigger) => trigger.scheduled), scheduled);
      }
    } finally {
      perEvent.rebalanceOwner.clearNodeReadyRebalanceState();
      vector.rebalanceOwner.clearNodeReadyRebalanceState();
    }
  });
}

test('seed node-ready hook: the second member of a node reads the first member merged over ' +
  'the cached row, and a member after a DELETE reads no row', async () => {
  const merged = await nodeReadyHookSeed();
  const deleted = await nodeReadyHookSeed();
  try {
    const partial = NODE_READY_VECTORS['a partial row first, ready second'];
    merged.nodeRows.set('n1', {...partial.cached[0]});
    await merged.subscriber(Object.freeze([...partial.events]));
    assert.deepEqual(merged.triggers[1].previousRow,
      {node_id: 'n1', status: 'joining', address: 'n1:2', ready_lease_expires_at: LEASE});
    const removed = NODE_READY_VECTORS['a node deleted and inserted ready again'];
    deleted.nodeRows.set('n1', {...removed.cached[0]});
    await deleted.subscriber(Object.freeze([...removed.events]));
    assert.equal(deleted.triggers[1].previousRow, null);
  } finally {
    merged.rebalanceOwner.clearNodeReadyRebalanceState();
    deleted.rebalanceOwner.clearNodeReadyRebalanceState();
  }
});
