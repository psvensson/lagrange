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
import {SystemTableCache} from '../../src/cache/system-table-cache.js';

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
// real node-ready rebalance owner behind its trigger and the real system
// table cache as the node cache. The propagation double applies a vector's
// members to that cache in order through the cache's own merge
// (applySystemTableChange), as the source leaf of a wave does. One-event
// delivery is the same subscriber handed vectors of one, the cache applied
// between them: what the hook works out for a later member of a vector is
// compared with what the real cache held when that member arrived alone.
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
  const cache = new SystemTableCache();
  const triggers = [];
  const messageGroup = {groupId: 'mg-1', initialized: true, async subscribeToCDC() {}};
  const delegates = {
    getLogger: () => silentLogger,
    getNodeId: () => SEED_NODE_ID,
    getMessageGroupServices: () => new Map([['mg-1-r1', messageGroup]]),
    getPartitionServices: () => new Map([[getInitialReplicaIds(TABLES.NODES)[0], partition]]),
    getSystemTableCache: () => cache,
    resolveOperationalMessageGroupSelectionAsync: async () => ({service: messageGroup}),
    handleNodeReadyRebalanceTrigger: (event, previousRow) => {
      const scheduled = rebalanceOwner.handleNodeReadyRebalanceTrigger(event, previousRow);
      triggers.push({nodeId: event.data.node_id, operation: event.operation,
        status: event.data.status ?? null, previousRow: previousRow && {...previousRow},
        scheduled});
    },
    propagatePartitionCDCEvent: async (_service, events) => {
      for (const event of events) {
        cache.applySystemTableChange(TABLES.NODES, event.operation,
          structuredClone(event.data));
      }
    },
  };
  const phase = new SeedCacheHydrationPhase({delegates, runtimeBridgeOwner: {}});
  await phase.subscribeToInitialSystemTableCDC(TABLES.NODES);
  const cacheRow = (row) => cache.applySystemTableChange(TABLES.NODES, 'INSERT', {...row});
  const cachedRows = () => cache.getAll(TABLES.NODES)
    .map((row) => ({...row})).sort((left, right) => left.node_id.localeCompare(right.node_id));
  return {subscriber: subscribers[0], cacheRow, cachedRows, triggers, rebalanceOwner};
}

const LEASE = 4102444800000; // far in the future: the lease never lapses in the witness
const nodeRow = (nodeId, status, extra = {}) => ({node_id: nodeId, status, ...extra});
const nodesEvent = (operation, data) => ({tableName: TABLES.NODES, operation, data});
// Rows carry an increasing last_heartbeat, the node owner's liveness
// watermark: without one it keeps its previous observation of the node.
const NODE_READY_VECTORS = Object.freeze({
  'a node made ready and then renewed': {
    cached: [nodeRow('n1', 'joining', {address: 'n1:1', last_heartbeat: 1})],
    events: [
      nodesEvent('UPDATE', nodeRow('n1', SERVICE_STATUS.ACTIVE,
        {ready_lease_expires_at: LEASE, last_heartbeat: 2})),
      nodesEvent('UPDATE', nodeRow('n1', SERVICE_STATUS.ACTIVE,
        {ready_lease_expires_at: LEASE + 1, last_heartbeat: 3})),
    ],
    scheduled: [true, false],
  },
  'a partial row first, ready second': {
    cached: [nodeRow('n1', 'joining',
      {address: 'n1:1', ready_lease_expires_at: LEASE, last_heartbeat: 1})],
    events: [
      nodesEvent('UPDATE', {node_id: 'n1', address: 'n1:2', last_heartbeat: 2}),
      nodesEvent('UPDATE', {node_id: 'n1', status: SERVICE_STATUS.ACTIVE, last_heartbeat: 3}),
    ],
    scheduled: [false, true],
  },
  'a node deleted and inserted ready again': {
    cached: [nodeRow('n1', SERVICE_STATUS.ACTIVE,
      {ready_lease_expires_at: LEASE, last_heartbeat: 1})],
    events: [
      nodesEvent('DELETE', {node_id: 'n1'}),
      nodesEvent('INSERT', nodeRow('n1', SERVICE_STATUS.ACTIVE,
        {ready_lease_expires_at: LEASE + 2, last_heartbeat: 3})),
    ],
    scheduled: null,
  },
  'a first-ever node inserted, deleted and inserted again': {
    cached: [],
    events: [
      nodesEvent('INSERT', nodeRow('n1', 'joining', {last_heartbeat: 1, updated_at: 10})),
      nodesEvent('DELETE', {node_id: 'n1'}),
      nodesEvent('INSERT', nodeRow('n1', SERVICE_STATUS.ACTIVE,
        {ready_lease_expires_at: LEASE, last_heartbeat: 3, updated_at: 30})),
    ],
    scheduled: null,
  },
  'two nodes interleaved': {
    cached: [nodeRow('n1', 'joining', {last_heartbeat: 1}),
      nodeRow('n2', 'joining', {last_heartbeat: 1})],
    events: [
      nodesEvent('UPDATE', nodeRow('n1', SERVICE_STATUS.ACTIVE,
        {ready_lease_expires_at: LEASE, last_heartbeat: 2})),
      nodesEvent('UPDATE', nodeRow('n2', SERVICE_STATUS.ACTIVE,
        {ready_lease_expires_at: LEASE, last_heartbeat: 2})),
      nodesEvent('UPDATE', nodeRow('n1', SERVICE_STATUS.ACTIVE,
        {ready_lease_expires_at: LEASE + 3, last_heartbeat: 3})),
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
        for (const row of cached) seed.cacheRow(row);
      }
      for (const event of events) await perEvent.subscriber(Object.freeze([event]));
      await vector.subscriber(Object.freeze([...events]));
      assert.equal(perEvent.triggers.length, events.length);
      assert.deepEqual(vector.triggers, perEvent.triggers,
        'each member saw the previous row and took the decision of one-event delivery');
      assert.deepEqual(vector.cachedRows(), perEvent.cachedRows(),
        'the real cache holds the same rows after the vector as after one-event delivery');
      // Literal anchors, independent of the one-event run.
      assert.deepEqual(vector.triggers[0].previousRow,
        cached.find((row) => row.node_id === events[0].data.node_id) ?? null,
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
    merged.cacheRow(partial.cached[0]);
    await merged.subscriber(Object.freeze([...partial.events]));
    assert.deepEqual(merged.triggers[1].previousRow, {node_id: 'n1', status: 'joining',
      address: 'n1:2', ready_lease_expires_at: LEASE, last_heartbeat: 2});
    const removed = NODE_READY_VECTORS['a node deleted and inserted ready again'];
    deleted.cacheRow(removed.cached[0]);
    await deleted.subscriber(Object.freeze([...removed.events]));
    assert.equal(deleted.triggers[1].previousRow, null);
  } finally {
    merged.rebalanceOwner.clearNodeReadyRebalanceState();
    deleted.rebalanceOwner.clearNodeReadyRebalanceState();
  }
});

// Supersession record 3, S-9: the previous row the hook compares a member
// against is what the node cache itself would hold after the earlier members
// of the vector, worked out by the cache owner's own apply path. These are the
// places where that path is not an overlay; each is stated literally and as
// equality with one-event delivery through the real cache.
const NODE_READY_MERGE_ANCHORS = Object.freeze({
  // The cache replaces the row: the old ready lease is gone for the next member.
  'an INSERT over a cached row, then another member': {
    cached: [nodeRow('n1', 'joining',
      {address: 'n1:1', ready_lease_expires_at: LEASE, last_heartbeat: 1})],
    events: [
      nodesEvent('INSERT', nodeRow('n1', 'joining', {last_heartbeat: 2})),
      nodesEvent('UPDATE', {node_id: 'n1', status: SERVICE_STATUS.ACTIVE, last_heartbeat: 3}),
    ],
    decisions: [false, false],
    secondPrevious: {node_id: 'n1', status: 'joining', last_heartbeat: 2},
  },
  // The cache rejects the older member: the next member reads the cached row.
  'a member the cache rejects as older than the cached row': {
    cached: [nodeRow('n1', SERVICE_STATUS.ACTIVE,
      {ready_lease_expires_at: LEASE, last_heartbeat: 1, updated_at: 30})],
    events: [
      nodesEvent('UPDATE', nodeRow('n1', 'joining', {last_heartbeat: 2, updated_at: 10})),
      nodesEvent('UPDATE', nodeRow('n1', SERVICE_STATUS.ACTIVE,
        {ready_lease_expires_at: LEASE + 1, last_heartbeat: 3, updated_at: 20})),
    ],
    decisions: [false, true],
    secondPrevious: {node_id: 'n1', status: SERVICE_STATUS.ACTIVE, ready_lease_expires_at: LEASE,
      last_heartbeat: 1, updated_at: 30},
  },
  'a first-ever row with no cached predecessor': {
    cached: [],
    events: [
      nodesEvent('INSERT', nodeRow('n1', 'joining', {last_heartbeat: 1})),
      nodesEvent('UPDATE', nodeRow('n1', SERVICE_STATUS.ACTIVE,
        {ready_lease_expires_at: LEASE, last_heartbeat: 2})),
    ],
    decisions: [false, true],
    secondPrevious: {node_id: 'n1', status: 'joining', last_heartbeat: 1},
  },
});

// What the trigger owner was handed and decided, member by member, from
// trigger `from` on; and the nodes with a rebalance pending afterwards.
const triggersOf = (seed, from = 0) => seed.triggers.slice(from).map((trigger) => ({
  nodeId: trigger.nodeId, operation: trigger.operation, previousRow: trigger.previousRow,
  scheduled: trigger.scheduled}));
const pendingOf = (seed) =>
  [...seed.rebalanceOwner.pendingNodeReadyRebalanceTimers.keys()].sort();

for (const [name, anchor] of Object.entries(NODE_READY_MERGE_ANCHORS)) {
  test(`seed node-ready hook, cache apply path: ${name} - one vector triggers exactly as ` +
    'one-event delivery through the real cache', async () => {
    const perEvent = await nodeReadyHookSeed();
    const vector = await nodeReadyHookSeed();
    try {
      for (const seed of [perEvent, vector]) {
        for (const row of anchor.cached) seed.cacheRow(row);
      }
      for (const event of anchor.events) await perEvent.subscriber(Object.freeze([event]));
      await vector.subscriber(Object.freeze([...anchor.events]));
      assert.deepEqual(triggersOf(vector), triggersOf(perEvent),
        'every member is handed the previous row and takes the decision of one-event delivery');
      assert.deepEqual(vector.triggers.map((trigger) => trigger.scheduled), anchor.decisions);
      assert.deepEqual(vector.triggers[1].previousRow, anchor.secondPrevious,
        'the second member reads what the cache\'s own apply path left after the first');
      assert.deepEqual(pendingOf(vector), pendingOf(perEvent));
      assert.deepEqual(vector.cachedRows(), perEvent.cachedRows());
    } finally {
      perEvent.rebalanceOwner.clearNodeReadyRebalanceState();
      vector.rebalanceOwner.clearNodeReadyRebalanceState();
    }
  });
}

// --- the differential: generated member sequences, real cache on both sides ---
//
// A seeded generator (no wall clock; the seed is the whole state) writes a
// history and a vector of NODES members for two nodes: INSERT, UPDATE and
// DELETE, full and partial rows, ready and not ready, and members older than
// what came before (a lower version and heartbeat). The history reaches both
// sides one event at a time. The vector then reaches one side one event at a
// time and the other as one vector, and both are presented a second time, as
// a lane does when it retries. Compared: the node-ready decision for every
// member, in order, the rebalances pending afterwards, the rows the real
// cache holds, and the previous row every member is handed. The previous row
// is compared for the members of nodes the cache holds no delete tombstone
// for: the hook's replay starts from the cached row and cannot read a
// tombstone (the residual pins below state that difference).
function nodeEventGenerator(seed) {
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (values) => values[Math.floor(random() * values.length)];
  let tick = 1;
  const member = () => {
    const nodeId = pick(['g1', 'g2']);
    const operation = pick(['INSERT', 'UPDATE', 'UPDATE', 'UPDATE', 'DELETE']);
    if (operation === 'DELETE') return nodesEvent('DELETE', {node_id: nodeId});
    tick += 1;
    const older = random() < 0.2;
    const data = {node_id: nodeId};
    if (operation === 'INSERT' || random() < 0.7) {
      data.status = pick(['joining', SERVICE_STATUS.ACTIVE, SERVICE_STATUS.ACTIVE]);
    }
    if (random() < 0.6) data.ready_lease_expires_at = LEASE + tick;
    if (random() < 0.8) data.last_heartbeat = older ? 1 : tick;
    if (random() < 0.7) data.updated_at = older ? 2 : tick * 10;
    if (random() < 0.3) data.address = `${nodeId}:${tick}`;
    return nodesEvent(operation, data);
  };
  const sequence = (length) => Array.from({length}, member);
  return {history: sequence(Math.floor(random() * 4)),
    vector: sequence(2 + Math.floor(random() * 5))};
}

const NODE_READY_DIFFERENTIAL_SEEDS = Object.freeze(
  Array.from({length: 48}, (_unused, index) => 7001 + index));

for (const seed of NODE_READY_DIFFERENTIAL_SEEDS) {
  test(`seed node-ready hook differential, seed ${seed}: one vector triggers as one-event ` +
    'delivery through the real cache, when first presented and when presented again',
  async () => {
    const scenario = nodeEventGenerator(seed);
    const perEvent = await nodeReadyHookSeed();
    const vector = await nodeReadyHookSeed();
    const context = (stage) => `seed ${seed}, ${stage}: ${JSON.stringify(scenario)}`;
    try {
      for (const event of scenario.history) {
        await perEvent.subscriber(Object.freeze([event]));
        await vector.subscriber(Object.freeze([event]));
      }
      assert.deepEqual(triggersOf(vector), triggersOf(perEvent), context('history'));
      const isDelete = (event) => event.operation === 'DELETE';
      const deleted = new Set(scenario.history.filter(isDelete)
        .map((event) => event.data.node_id));
      const notDeleted = (seed, from) => triggersOf(seed, from)
        .filter((trigger) => !deleted.has(trigger.nodeId));
      for (const presentation of ['first presentation', 'retry']) {
        const from = perEvent.triggers.length;
        assert.equal(vector.triggers.length, from, context(presentation));
        for (const event of scenario.vector) await perEvent.subscriber(Object.freeze([event]));
        await vector.subscriber(Object.freeze([...scenario.vector]));
        assert.equal(vector.triggers.length - from, scenario.vector.length,
          context(`${presentation}: the hook ran for every member`));
        assert.deepEqual(triggersOf(vector, from).map((trigger) => trigger.scheduled),
          triggersOf(perEvent, from).map((trigger) => trigger.scheduled),
          context(`${presentation}: the same node-ready triggers, in order`));
        assert.deepEqual(notDeleted(vector, from), notDeleted(perEvent, from),
          context(`${presentation}: every member is handed the same previous row`));
        assert.deepEqual(pendingOf(vector), pendingOf(perEvent),
          context(`${presentation}: the same rebalances pending`));
        assert.deepEqual(vector.cachedRows(), perEvent.cachedRows(),
          context(`${presentation}: the same rows in the real cache`));
        // A node this vector deleted is under a tombstone when it is presented again.
        for (const event of scenario.vector.filter(isDelete)) deleted.add(event.data.node_id);
      }
    } finally {
      perEvent.rebalanceOwner.clearNodeReadyRebalanceState();
      vector.rebalanceOwner.clearNodeReadyRebalanceState();
    }
  });
}

// The retry, stated literally: the hook runs again for every member of a
// vector that is presented again, as it ran on every drive attempt when the
// lane delivered one event at a time.
test('seed node-ready hook: a vector presented again runs the hook for every member again, ' +
  'against the rows the cache then holds', async () => {
  const perEvent = await nodeReadyHookSeed();
  const vector = await nodeReadyHookSeed();
  try {
    const {cached, events} = NODE_READY_VECTORS['a node made ready and then renewed'];
    for (const seed of [perEvent, vector]) {
      for (const row of cached) seed.cacheRow(row);
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      for (const event of events) await perEvent.subscriber(Object.freeze([event]));
      await vector.subscriber(Object.freeze([...events]));
    }
    assert.equal(vector.triggers.length, 2 * events.length,
      'the hook ran for every member on both presentations');
    assert.deepEqual(triggersOf(vector), triggersOf(perEvent));
    assert.deepEqual(vector.triggers[2].previousRow, vector.cachedRows()[0],
      'on the retry the first member reads the row the first presentation left in the cache');
    assert.deepEqual(pendingOf(vector), pendingOf(perEvent));
  } finally {
    perEvent.rebalanceOwner.clearNodeReadyRebalanceState();
    vector.rebalanceOwner.clearNodeReadyRebalanceState();
  }
});

// RESIDUAL PINS (supersession record 3, S-9), reported with a proposed
// owner-side export, not repaired here. The hook's replay starts from the row
// the node cache holds; a delete tombstone the node cache also holds is not
// readable through the cache's public surface. Under a tombstone the real
// cache refuses a write older than the delete, so one-event delivery reads no
// row for the next member, while the replay, which has no tombstone, takes the
// write. Two states reach it: a vector that deleted the node is presented
// again, and an older write is delivered again after an earlier delete. The
// pins state both sides' previous rows literally and that the decisions agree
// in these cases; an export that lets the cache preview its own row removes
// the difference (the vector side then equals the one-event side).
const tombstoneRows = Object.freeze({
  first: nodeRow('n1', 'joining', {last_heartbeat: 1, updated_at: 10}),
  second: {node_id: 'n1', address: 'n1:2', last_heartbeat: 2, updated_at: 15},
  third: nodeRow('n1', SERVICE_STATUS.ACTIVE,
    {ready_lease_expires_at: LEASE, last_heartbeat: 3, updated_at: 20}),
});

test('seed node-ready hook, residual pin: a vector that deleted its node, presented again',
  async () => {
    const perEvent = await nodeReadyHookSeed();
    const vector = await nodeReadyHookSeed();
    try {
      const events = [nodesEvent('INSERT', tombstoneRows.first),
        nodesEvent('UPDATE', tombstoneRows.second), nodesEvent('UPDATE', tombstoneRows.third),
        nodesEvent('DELETE', {node_id: 'n1'})];
      for (const event of events) await perEvent.subscriber(Object.freeze([event]));
      await vector.subscriber(Object.freeze([...events]));
      assert.deepEqual(triggersOf(vector), triggersOf(perEvent),
        'the first presentation is the same either way');
      const from = events.length;
      for (const event of events) await perEvent.subscriber(Object.freeze([event]));
      await vector.subscriber(Object.freeze([...events]));
      const previous = (seed) => seed.triggers.slice(from, from + 3)
        .map((trigger) => trigger.previousRow);
      assert.deepEqual(previous(perEvent), [null, null, null],
        'one-event delivery: the tombstone refuses the writes older than the delete');
      assert.deepEqual(previous(vector),
        [null, tombstoneRows.first, {...tombstoneRows.first, ...tombstoneRows.second}],
        'one vector: the replay has no tombstone and takes them');
      assert.deepEqual(vector.triggers.map((trigger) => trigger.scheduled),
        perEvent.triggers.map((trigger) => trigger.scheduled),
        'the node-ready decisions agree');
      assert.deepEqual(pendingOf(vector), pendingOf(perEvent));
    } finally {
      perEvent.rebalanceOwner.clearNodeReadyRebalanceState();
      vector.rebalanceOwner.clearNodeReadyRebalanceState();
    }
  });

test('seed node-ready hook, residual pin: older writes delivered again after an earlier ' +
  'delete of the node', async () => {
  const perEvent = await nodeReadyHookSeed();
  const vector = await nodeReadyHookSeed();
  try {
    const history = [nodesEvent('INSERT', tombstoneRows.third),
      nodesEvent('DELETE', {node_id: 'n1'})];
    for (const event of history) {
      await perEvent.subscriber(Object.freeze([event]));
      await vector.subscriber(Object.freeze([event]));
    }
    const events = [nodesEvent('INSERT', tombstoneRows.first),
      nodesEvent('UPDATE', tombstoneRows.second)];
    const from = history.length;
    for (const event of events) await perEvent.subscriber(Object.freeze([event]));
    await vector.subscriber(Object.freeze([...events]));
    const previous = (seed) => seed.triggers.slice(from).map((trigger) => trigger.previousRow);
    assert.deepEqual(previous(perEvent), [null, null],
      'one-event delivery: the tombstone refuses the older INSERT');
    assert.deepEqual(previous(vector), [null, tombstoneRows.first],
      'one vector: the replay has no tombstone and takes it');
    assert.deepEqual(vector.triggers.map((trigger) => trigger.scheduled),
      perEvent.triggers.map((trigger) => trigger.scheduled),
      'the node-ready decisions agree');
    assert.deepEqual(vector.cachedRows(), perEvent.cachedRows());
  } finally {
    perEvent.rebalanceOwner.clearNodeReadyRebalanceState();
    vector.rebalanceOwner.clearNodeReadyRebalanceState();
  }
});
