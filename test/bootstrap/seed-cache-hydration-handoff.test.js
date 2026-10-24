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

const SEED_NODE_ID = 'seed-handoff-node';
const LEADER_WAIT_REACHED = 'leader wait reached';
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
          // The handshake answer as the delivery owner shapes it today; its
          // catch-up leaves with the sliding window (decision D4).
          return {status: 'ok', subscriberId: options.subscriberId, subscriptionEpoch: 1,
            catchup: {mode: 'none', bufferedEventsReplayed: 0}};
        },
        readHydrationImage(sql) {
          log.push(['read', tableName, sql]);
          return imageState === PARTITION_HYDRATION_IMAGE_STATE.READ ?
            {state: imageState, rows: [{id: `${tableName}-row`}],
              appliedIndex: positionOf(tableName)} :
            {state: imageState, rows: [], reason: null};
        },
      });
    });
  }
  const messageGroup = {
    groupId: 'mg-1',
    async subscribeToCDC() {},
    async applyCDCEvent(tableName) {
      log.push(['apply', tableName]);
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
    readBeforeNextTable: index === handedOffTables.length - 1 ||
      lastIndex(log, 'apply', tableName) <
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
