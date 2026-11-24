import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  CDC_OPERATIONS,
  SystemTableCache,
  getSharedRowReadStats,
  resetSharedRowReadStats,
} from '../../src/cache/system-table-cache.js';
import {
  ReadOnlySystemTableCache,
  createReadOnlyCache,
} from '../../src/cache/read-only-system-table-cache.js';
import {createSystemCacheClient} from '../../src/cache/system-cache-client.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {SYSTEM_TABLE_CACHE_MUTATION_MODE} from
  '../../src/cache/cache-constants.js';

const TARGET_PARTITION_ID = 'partition-target-rf3';

function initTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'node-1'},
    logging: {level: 'error'},
  });
  LoggingService.getInstance().initialize({level: 'error'});
}

function cleanupTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

function buildServiceRow(overrides = {}) {
  const serviceId = overrides.service_id || 'svc-default';
  const partitionId =
    Object.prototype.hasOwnProperty.call(overrides, 'partition_id') ?
      overrides.partition_id :
      TARGET_PARTITION_ID;
  const nodeId = overrides.node_id || 'node-1';
  return {
    service_id: serviceId,
    replica_id: overrides.replica_id || serviceId,
    partition_id: partitionId,
    node_id: nodeId,
    service_type: overrides.service_type || SERVICE_TYPE.PARTITION,
    address: overrides.address || `${nodeId}/partition/${serviceId}`,
    status: overrides.status || 'active',
    raft_role: overrides.raft_role || 'follower',
    raft_term: overrides.raft_term ?? 1,
    updated_at: overrides.updated_at ?? 1000,
    ...overrides,
  };
}

test('servicesForPartition and getPartitionServiceRows perform constant O(RF) ' +
  'row visits unchanged by adding 500 unrelated service rows', async (t) => {
  initTestEnvironment();
  const notifications = [];
  const cache = new SystemTableCache({
    scheduleCacheChangeNotification: (cb) => notifications.push(cb),
  });
  const readOnlyCache = createReadOnlyCache(cache);
  const directClient = createSystemCacheClient({cache: readOnlyCache});

  try {
    // Insert 3 replica service rows (RF=3) for TARGET_PARTITION_ID.
    const rfNodes = ['node-1', 'node-2', 'node-3'];
    for (let i = 0; i < rfNodes.length; i += 1) {
      cache.applySystemTableChange(
        TABLES.SERVICES,
        CDC_OPERATIONS.INSERT,
        buildServiceRow({
          service_id: `svc-target-r${i + 1}`,
          partition_id: TARGET_PARTITION_ID,
          node_id: rfNodes[i],
          raft_role: i === 0 ? 'leader' : 'follower',
        }),
      );
    }

    let filterCalls = 0;
    const origFilter = cache.filter.bind(cache);
    cache.filter = (...args) => {
      filterCalls += 1;
      return origFilter(...args);
    };

    const executor = new QueryExecutor({
      nodeId: 'node-1',
      systemCache: readOnlyCache,
    });

    // Baseline measurement with only the 3 target service rows in the cache.
    resetSharedRowReadStats();
    const baselineIndexed = readOnlyCache.servicesForPartition(TARGET_PARTITION_ID);
    const baselineCacheVisits = getSharedRowReadStats().engagements;
    t.equal(baselineIndexed.length, 3, 'returns all 3 RF replicas for target partition');
    t.equal(Object.isFrozen(baselineIndexed), true, 'returned partition array is frozen');
    t.equal(baselineIndexed.every((row) => Object.isFrozen(row)), true,
      'each cached service row in the partition index is deeply frozen');
    t.equal(baselineCacheVisits, 3, 'visits exactly RF=3 rows before adding unrelated rows');

    resetSharedRowReadStats();
    const baselineExecutorRows = executor.getPartitionServiceRows(TARGET_PARTITION_ID);
    const baselineExecutorVisits = getSharedRowReadStats().engagements;
    t.equal(baselineExecutorRows.length, 3,
      'QueryExecutor.getPartitionServiceRows resolves all 3 replicas');
    t.equal(baselineExecutorVisits, 3,
      'QueryExecutor.getPartitionServiceRows visits exactly RF=3 rows');
    t.equal(filterCalls, 0,
      'QueryExecutor.getPartitionServiceRows makes 0 calls to SystemTableCache.filter()');

    // Now insert 500 unrelated service rows across other partitions and message groups.
    for (let i = 0; i < 500; i += 1) {
      const isMessageGroup = i % 10 === 0;
      cache.applySystemTableChange(
        TABLES.SERVICES,
        CDC_OPERATIONS.INSERT,
        buildServiceRow({
          service_id: `svc-unrelated-${i}`,
          partition_id: isMessageGroup ? null : `partition-other-${Math.floor(i / 3)}`,
          service_type: isMessageGroup ? 'message_group' : SERVICE_TYPE.PARTITION,
          node_id: `node-${(i % 3) + 1}`,
          updated_at: 2000 + i,
        }),
      );
    }
    t.equal(cache.count(TABLES.SERVICES), 503,
      'SERVICES table now holds 503 total service rows');

    // Re-measure with 500 unrelated service rows present.
    resetSharedRowReadStats();
    const afterIndexed = readOnlyCache.servicesForPartition(TARGET_PARTITION_ID);
    const afterCacheVisits = getSharedRowReadStats().engagements;
    t.equal(afterIndexed.length, 3, 'still returns the 3 target partition services');
    t.equal(afterCacheVisits, baselineCacheVisits,
      'adding 500 unrelated service rows does NOT increase rows visited by servicesForPartition (constant O(RF)=3)');

    resetSharedRowReadStats();
    const afterClientIndexed = directClient.servicesForPartition(TARGET_PARTITION_ID);
    const afterClientVisits = getSharedRowReadStats().engagements;
    t.equal(afterClientIndexed.length, 3,
      'SystemCacheClient forwards servicesForPartition');
    t.equal(afterClientVisits, baselineCacheVisits,
      'SystemCacheClient servicesForPartition visits constant O(RF)=3 rows');

    resetSharedRowReadStats();
    const afterExecutorRows = executor.getPartitionServiceRows(TARGET_PARTITION_ID);
    const afterExecutorVisits = getSharedRowReadStats().engagements;
    t.equal(afterExecutorRows.length, 3,
      'QueryExecutor.getPartitionServiceRows still returns the 3 target replicas');
    t.equal(afterExecutorVisits, baselineExecutorVisits,
      'adding 500 unrelated service rows does NOT increase rows visited by getPartitionServiceRows (constant O(RF)=3)');
    t.equal(filterCalls, 0,
      'SystemTableCache.filter() is still called 0 times');

    // Unknown or empty partitionId visits 0 rows.
    resetSharedRowReadStats();
    const missingRows = readOnlyCache.servicesForPartition('partition-nonexistent');
    const emptyRows = readOnlyCache.servicesForPartition('');
    t.same(missingRows, [], 'unknown partition returns empty frozen array');
    t.same(emptyRows, [], 'empty partitionId returns empty frozen array');
    t.equal(Object.isFrozen(missingRows), true, 'empty result is frozen');
    t.equal(getSharedRowReadStats().engagements, 0,
      'missing/empty partition lookup visits 0 rows');
  } finally {
    cleanupTestEnvironment();
  }
});

test('SystemTableCache updates SERVICES rows and the partition service index ' +
  'atomically before notifying apply and change observers', async (t) => {
  initTestEnvironment();
  const deferredQueue = [];
  const cache = new SystemTableCache({
    scheduleCacheChangeNotification: (cb) => deferredQueue.push(cb),
  });
  const readOnly = new ReadOnlySystemTableCache(cache);

  const applyObservations = [];
  const deferredObservations = [];

  cache.onCacheApplyChange((tableName, operation, record) => {
    if (tableName !== TABLES.SERVICES) return;
    const partitionId = record.partition_id;
    const indexed = readOnly.servicesForPartition(partitionId);
    applyObservations.push({
      operation,
      serviceId: record.service_id,
      partitionId,
      indexedIds: indexed.map((row) => row.service_id),
      indexedStatuses: indexed.map((row) => row.status),
      indexedRoles: indexed.map((row) => row.raft_role),
    });
  });

  readOnly.onCacheChange((tableName, operation, record) => {
    if (tableName !== TABLES.SERVICES) return;
    const partitionId = record.partition_id;
    const indexed = readOnly.servicesForPartition(partitionId);
    deferredObservations.push({
      operation,
      serviceId: record.service_id,
      partitionId,
      indexedIds: indexed.map((row) => row.service_id),
      indexedStatuses: indexed.map((row) => row.status),
    });
  });

  const flushDeferred = () => {
    while (deferredQueue.length > 0) {
      deferredQueue.shift()();
    }
  };

  try {
    // 1. INSERT
    cache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATIONS.INSERT,
      buildServiceRow({
        service_id: 'svc-a',
        partition_id: 'p-1',
        status: 'creating',
        raft_role: 'learner',
        updated_at: 1000,
      }),
    );
    flushDeferred();
    t.same(applyObservations[0], {
      operation: CDC_OPERATIONS.INSERT,
      serviceId: 'svc-a',
      partitionId: 'p-1',
      indexedIds: ['svc-a'],
      indexedStatuses: ['creating'],
      indexedRoles: ['learner'],
    }, 'synchronous apply listener sees INSERT already reflected in servicesForPartition');
    t.same(deferredObservations[0], {
      operation: CDC_OPERATIONS.INSERT,
      serviceId: 'svc-a',
      partitionId: 'p-1',
      indexedIds: ['svc-a'],
      indexedStatuses: ['creating'],
    }, 'deferred listener sees INSERT already reflected in servicesForPartition');

    // 2. UPDATE status & role
    cache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATIONS.UPDATE,
      buildServiceRow({
        service_id: 'svc-a',
        partition_id: 'p-1',
        status: 'active',
        raft_role: 'leader',
        updated_at: 2000,
      }),
    );
    flushDeferred();
    t.same(applyObservations[1], {
      operation: CDC_OPERATIONS.UPDATE,
      serviceId: 'svc-a',
      partitionId: 'p-1',
      indexedIds: ['svc-a'],
      indexedStatuses: ['active'],
      indexedRoles: ['leader'],
    }, 'observer sees updated status and role in servicesForPartition before notification');

    // 3. UPSERT in AUTHORITATIVE_RECONCILIATION mode + partition reassignment
    cache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATIONS.UPSERT,
      buildServiceRow({
        service_id: 'svc-a',
        partition_id: 'p-2',
        status: 'active',
        raft_role: 'follower',
        updated_at: 3000,
      }),
      {
        mutationMode:
          SYSTEM_TABLE_CACHE_MUTATION_MODE.AUTHORITATIVE_RECONCILIATION,
      },
    );
    flushDeferred();
    t.same(readOnly.servicesForPartition('p-1'), [],
      'old partition p-1 entry is cleaned up when a key moves to p-2');
    t.same(
      readOnly.servicesForPartition('p-2').map((r) => r.service_id),
      ['svc-a'],
      'new partition p-2 index holds the reassigned service before notification',
    );

    // 4. Anti-entropy authoritative absence sweep DELETE
    const sweepResult = cache.reconcileAgainstAuthoritativeTruth({
      [TABLES.SERVICES]: [],
    });
    flushDeferred();
    t.equal(sweepResult.removed.length, 1, 'anti-entropy sweep removed svc-a');
    t.same(applyObservations[3], {
      operation: CDC_OPERATIONS.DELETE,
      serviceId: 'svc-a',
      partitionId: 'p-2',
      indexedIds: [],
      indexedStatuses: [],
      indexedRoles: [],
    }, 'anti-entropy sweep updates partition service index before notifying observers');

    // 5. Re-insert at higher timestamp and clear()
    cache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATIONS.INSERT,
      buildServiceRow({
        service_id: 'svc-b',
        partition_id: 'p-3',
        updated_at: 5000,
      }),
    );
    t.equal(readOnly.servicesForPartition('p-3').length, 1,
      'p-3 has 1 indexed service before clear()');
    cache.clear();
    t.same(readOnly.servicesForPartition('p-3'), [],
      'clear() empties the partition service index');
  } finally {
    cleanupTestEnvironment();
  }
});

test('getPartitionServiceRows preserves routing overlay precedence and ' +
  'complete-overlay masking over indexed cache services', async (t) => {
  initTestEnvironment();
  const cache = new SystemTableCache();
  const readOnlyCache = createReadOnlyCache(cache);

  try {
    // Seed 2 partition services + 1 non-partition service sharing partition_id in cache.
    cache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATIONS.INSERT,
      buildServiceRow({
        service_id: 'svc-p1-r1',
        partition_id: TARGET_PARTITION_ID,
        node_id: 'node-1',
        address: 'node-1/partition/svc-p1-r1-stale',
        raft_role: 'follower',
        raft_term: 2,
        updated_at: 1000,
      }),
    );
    cache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATIONS.INSERT,
      buildServiceRow({
        service_id: 'svc-p1-r2',
        partition_id: TARGET_PARTITION_ID,
        node_id: 'node-2',
        address: 'node-2/partition/svc-p1-r2',
        raft_role: 'follower',
        raft_term: 2,
        updated_at: 1000,
      }),
    );
    cache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATIONS.INSERT,
      buildServiceRow({
        service_id: 'svc-non-partition',
        partition_id: TARGET_PARTITION_ID,
        node_id: 'node-3',
        service_type: 'custom_worker',
        updated_at: 1000,
      }),
    );

    const overlayRows = [
      buildServiceRow({
        service_id: 'svc-p1-r1',
        partition_id: TARGET_PARTITION_ID,
        node_id: 'node-1',
        address: 'node-1/partition/svc-p1-r1-overlay-fresh',
        raft_role: 'leader',
        raft_term: 5,
        updated_at: 2000,
      }),
    ];
    let maskCache = false;

    const executor = new QueryExecutor({
      nodeId: 'node-1',
      systemCache: readOnlyCache,
    });
    executor.getOverlayPartitionServices = () => overlayRows;
    executor.shouldOverlayMaskCacheServices = () => maskCache;

    // 1. Overlay row overrides stale cache row for svc-p1-r1 while keeping svc-p1-r2
    // and filtering out non-partition service_type.
    const mergedRows = executor.getPartitionServiceRows(TARGET_PARTITION_ID);
    t.equal(mergedRows.length, 2,
      'returns 2 partition services (excluding non-partition service_type)');
    const r1 = mergedRows.find((r) => r.service_id === 'svc-p1-r1');
    const r2 = mergedRows.find((r) => r.service_id === 'svc-p1-r2');
    t.equal(r1?.address, 'node-1/partition/svc-p1-r1-overlay-fresh',
      'overlay service row takes precedence over cached service row with same service_id');
    t.equal(r1?.raft_term, 5, 'overlay raft_term is preserved');
    t.equal(r2?.address, 'node-2/partition/svc-p1-r2',
      'unmasked cached peer replica is still included from servicesForPartition');

    // 2. When overlayMasksCacheServices is true, only overlay rows are returned.
    maskCache = true;
    const maskedRows = executor.getPartitionServiceRows(TARGET_PARTITION_ID);
    t.same(
      maskedRows.map((r) => r.service_id),
      ['svc-p1-r1'],
      'complete overlay mask suppresses cached rows from servicesForPartition',
    );
  } finally {
    cleanupTestEnvironment();
  }
});
