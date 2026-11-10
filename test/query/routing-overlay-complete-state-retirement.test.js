import test from 'node:test';
import assert from 'node:assert/strict';

import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CACHE_CDC_OPERATIONS} from '../../src/cache/cache-constants.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {
  createCommittedServeEligibilityOwner,
} from '../control-plane/serve-eligibility-test-support.js';
import {
  createMockMessageRouter,
} from './sql-query-engine-test-support.js';

function buildPartitionRow({
  partitionId = 'users-p1',
  tableName = 'users',
  leaderNodeId = 'node-1',
  replicaCount = 1,
  partitionVersion = 1,
  state = 'NORMAL',
  updatedAt = 100,
} = {}) {
  return {
    partition_id: partitionId,
    table_name: tableName,
    leader_node_id: leaderNodeId,
    replica_count: replicaCount,
    partition_version: partitionVersion,
    state,
    updated_at: updatedAt,
  };
}

function buildPartitionServiceRow({
  serviceId = 'users-p1-r1',
  partitionId = 'users-p1',
  nodeId = 'node-1',
  raftRole = 'leader',
  status = SERVICE_STATUS.ACTIVE,
  address = `${nodeId}/partition/${serviceId}`,
  updatedAt = 100,
} = {}) {
  return {
    service_id: serviceId,
    replica_id: serviceId,
    service_type: SERVICE_TYPE.PARTITION,
    partition_id: partitionId,
    node_id: nodeId,
    raft_role: raftRole,
    status,
    address,
    updated_at: updatedAt,
  };
}

function createAuthoritativeViewStub(getSnapshot) {
  return {
    async readRows(tableName) {
      const snapshot = getSnapshot();
      if (tableName === TABLES.PARTITIONS) {
        return {success: true, rows: snapshot.partitions};
      }
      if (tableName === TABLES.SERVICES) {
        return {success: true, rows: snapshot.services};
      }
      return {success: false, rows: []};
    },
  };
}

test('mixed-age-counterexample-resolved: delayed deletion of excluded stale service does not retire overlay on surviving service advance',
  async () => {
    const partitionId = 'users-p1';
    const systemCache = new SystemTableCache({
      scheduleCacheChangeNotification: () => {},
    });

    // Initial cache state: partition exists, contains active service A and stale service B.
    systemCache.applySystemTableChange(
      TABLES.PARTITIONS,
      CACHE_CDC_OPERATIONS.INSERT,
      buildPartitionRow({partitionId, replicaCount: 1, updatedAt: 100}),
    );
    systemCache.applySystemTableChange(
      TABLES.SERVICES,
      CACHE_CDC_OPERATIONS.INSERT,
      buildPartitionServiceRow({
        partitionId,
        serviceId: 'users-p1-r1',
        nodeId: 'node-1',
        updatedAt: 50,
      }),
    );
    systemCache.applySystemTableChange(
      TABLES.SERVICES,
      CACHE_CDC_OPERATIONS.INSERT,
      buildPartitionServiceRow({
        partitionId,
        serviceId: 'users-p1-r2',
        nodeId: 'stale-node',
        updatedAt: 50,
      }),
    );

    // Authoritative snapshot excludes stale service B (users-p1-r2).
    const authoritativeSnapshot = {
      partitions: [buildPartitionRow({partitionId, replicaCount: 1, updatedAt: 100})],
      services: [
        buildPartitionServiceRow({
          partitionId,
          serviceId: 'users-p1-r1',
          nodeId: 'node-1',
          updatedAt: 100,
        }),
      ],
    };

    const engine = new SQLQueryEngine({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      systemCache,
      messageRouter: createMockMessageRouter(),
      authoritativeControlPlaneView: createAuthoritativeViewStub(() => authoritativeSnapshot),
      autoStartDistributedTransactionRecovery: false,
    });

    assert.equal(await engine.refreshAuthoritativeRoutingOverlay(partitionId), true);
    assert.equal(engine.authoritativeRoutingOverlayEntries.has(partitionId), true);
    assert.equal(
      engine.shouldAuthoritativeRoutingOverlayMaskCacheServices(partitionId),
      true,
      'overlay must mask cache services when authoritative snapshot excludes stale cached route',
    );
    assert.deepEqual(
      engine.queryExecutor.getPartitionServiceRows(partitionId).map((row) => row.service_id),
      ['users-p1-r1'],
      'QueryExecutor must see only active service users-p1-r1',
    );

    // CDC update arrives for surviving service A (users-p1-r1), advancing its timestamp above overRefTs.
    // Stale service B (users-p1-r2) is NOT deleted yet (delayed deletion).
    systemCache.applySystemTableChange(
      TABLES.SERVICES,
      CACHE_CDC_OPERATIONS.UPDATE,
      buildPartitionServiceRow({
        partitionId,
        serviceId: 'users-p1-r1',
        nodeId: 'node-1',
        updatedAt: 120,
      }),
    );

    // The overlay MUST NOT be retired while un-deleted stale service B remains in SystemTableCache.
    assert.equal(
      engine.authoritativeRoutingOverlayEntries.has(partitionId),
      true,
      'authoritative overlay must NOT be retired while un-deleted stale service B remains cached',
    );
    assert.equal(
      engine.shouldAuthoritativeRoutingOverlayMaskCacheServices(partitionId),
      true,
      'stale cached services must remain masked',
    );

    const serviceRows = engine.queryExecutor.getPartitionServiceRows(partitionId);
    assert.equal(
      serviceRows.some((row) => row.service_id === 'users-p1-r2'),
      false,
      'QueryExecutor must NOT resurrect stale route users-p1-r2 under mixed-age cache updates',
    );
    assert.equal(
      serviceRows.some((row) => row.service_id === 'users-p1-r1'),
      true,
      'QueryExecutor must route to surviving service users-p1-r1',
    );
  });

test('real-engine-cache-executor-composition: executor routing and queries observe active overlay and updated surviving service',
  async () => {
    const partitionId = 'users-p1';
    const systemCache = new SystemTableCache({
      scheduleCacheChangeNotification: () => {},
    });

    systemCache.applySystemTableChange(
      TABLES.PARTITIONS,
      CACHE_CDC_OPERATIONS.INSERT,
      buildPartitionRow({partitionId, replicaCount: 1, updatedAt: 100}),
    );
    systemCache.applySystemTableChange(
      TABLES.SERVICES,
      CACHE_CDC_OPERATIONS.INSERT,
      buildPartitionServiceRow({
        partitionId,
        serviceId: 'users-p1-r1',
        nodeId: 'node-1',
        address: 'node-1/partition/users-p1-r1',
        updatedAt: 50,
      }),
    );
    systemCache.applySystemTableChange(
      TABLES.SERVICES,
      CACHE_CDC_OPERATIONS.INSERT,
      buildPartitionServiceRow({
        partitionId,
        serviceId: 'users-p1-r2',
        nodeId: 'stale-node',
        address: 'stale-node/partition/users-p1-r2',
        updatedAt: 50,
      }),
    );

    const authoritativeSnapshot = {
      partitions: [buildPartitionRow({partitionId, replicaCount: 1, updatedAt: 100})],
      services: [
        buildPartitionServiceRow({
          partitionId,
          serviceId: 'users-p1-r1',
          nodeId: 'node-1',
          address: 'node-1/partition/users-p1-r1',
          updatedAt: 100,
        }),
      ],
    };

    const engine = new SQLQueryEngine({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      systemCache,
      messageRouter: createMockMessageRouter(),
      authoritativeControlPlaneView: createAuthoritativeViewStub(() => authoritativeSnapshot),
      autoStartDistributedTransactionRecovery: false,
    });

    assert.equal(await engine.refreshAuthoritativeRoutingOverlay(partitionId), true);

    // Cache update arrives for users-p1-r1 with a new node and address (e.g. replica relocation)
    systemCache.applySystemTableChange(
      TABLES.PARTITIONS,
      CACHE_CDC_OPERATIONS.UPDATE,
      buildPartitionRow({
        partitionId,
        leaderNodeId: 'node-3',
        replicaCount: 1,
        updatedAt: 130,
      }),
    );
    systemCache.applySystemTableChange(
      TABLES.SERVICES,
      CACHE_CDC_OPERATIONS.UPDATE,
      buildPartitionServiceRow({
        partitionId,
        serviceId: 'users-p1-r1',
        nodeId: 'node-3',
        address: 'node-3/partition/users-p1-r1',
        updatedAt: 130,
      }),
    );

    // Stale service users-p1-r2 is still in cache.
    // QueryExecutor must observe users-p1-r1 (updated to node-3) and NOT stale users-p1-r2.
    const partitionServices = engine.queryExecutor.getPartitionServiceRows(partitionId);
    assert.equal(partitionServices.length, 1);
    assert.equal(partitionServices[0].service_id, 'users-p1-r1');
    assert.equal(partitionServices[0].node_id, 'node-3');
    assert.equal(partitionServices[0].address, 'node-3/partition/users-p1-r1');

    const routableNodeIds = engine.getRoutablePartitionServiceNodeIds(partitionId);
    assert.deepEqual(routableNodeIds, ['node-3'], 'routing destinations must include only node-3');

    const routingSnapshot = engine.queryExecutor.getPartitionRoutingSnapshot(partitionId);
    assert.equal(routingSnapshot.leaderKnown, true);
    assert.equal(routingSnapshot.canonicalLeaderNodeId, 'node-3');
  });

test('newer-complete-authority-progress: genuine cache convergence or newer complete authority cleanly retires overlay',
  async () => {
    const partitionId = 'users-p1';
    const systemCache = new SystemTableCache({
      scheduleCacheChangeNotification: () => {},
    });

    systemCache.applySystemTableChange(
      TABLES.PARTITIONS,
      CACHE_CDC_OPERATIONS.INSERT,
      buildPartitionRow({partitionId, replicaCount: 1, updatedAt: 100}),
    );
    systemCache.applySystemTableChange(
      TABLES.SERVICES,
      CACHE_CDC_OPERATIONS.INSERT,
      buildPartitionServiceRow({
        partitionId,
        serviceId: 'users-p1-r1',
        nodeId: 'node-1',
        updatedAt: 50,
      }),
    );
    systemCache.applySystemTableChange(
      TABLES.SERVICES,
      CACHE_CDC_OPERATIONS.INSERT,
      buildPartitionServiceRow({
        partitionId,
        serviceId: 'users-p1-r2',
        nodeId: 'stale-node',
        updatedAt: 50,
      }),
    );

    const authoritativeSnapshot = {
      partitions: [buildPartitionRow({partitionId, replicaCount: 1, updatedAt: 100})],
      services: [
        buildPartitionServiceRow({
          partitionId,
          serviceId: 'users-p1-r1',
          nodeId: 'node-1',
          updatedAt: 100,
        }),
      ],
    };

    const engine = new SQLQueryEngine({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      systemCache,
      messageRouter: createMockMessageRouter(),
      authoritativeControlPlaneView: createAuthoritativeViewStub(() => authoritativeSnapshot),
      autoStartDistributedTransactionRecovery: false,
    });

    assert.equal(await engine.refreshAuthoritativeRoutingOverlay(partitionId), true);
    assert.equal(engine.authoritativeRoutingOverlayEntries.has(partitionId), true);

    // 1) Update users-p1-r1 in cache
    systemCache.applySystemTableChange(
      TABLES.SERVICES,
      CACHE_CDC_OPERATIONS.UPDATE,
      buildPartitionServiceRow({
        partitionId,
        serviceId: 'users-p1-r1',
        nodeId: 'node-1',
        updatedAt: 120,
      }),
    );
    assert.equal(engine.authoritativeRoutingOverlayEntries.has(partitionId), true);

    // 2) Stale service users-p1-r2 is finally deleted from cache.
    systemCache.applySystemTableChange(
      TABLES.SERVICES,
      CACHE_CDC_OPERATIONS.DELETE,
      {
        partition_id: partitionId,
        service_id: 'users-p1-r2',
        updated_at: 120,
      },
    );

    // Now no un-deleted stale baseline service remains, and users-p1-r1 has advanced.
    // Overlay must retire cleanly.
    assert.equal(
      engine.authoritativeRoutingOverlayEntries.has(partitionId),
      false,
      'overlay must cleanly retire once delayed deletion of stale service completes',
    );
    assert.equal(
      engine.shouldAuthoritativeRoutingOverlayMaskCacheServices(partitionId),
      false,
      'masking must be removed once overlay retires',
    );
    assert.deepEqual(
      engine.queryExecutor.getPartitionServiceRows(partitionId).map((row) => row.service_id),
      ['users-p1-r1'],
      'QueryExecutor must observe users-p1-r1 directly from cache',
    );
  });

test('deletion-recreation-and-cache-replacement: partition drop evicts overlay and cache replacement rebinds listeners',
  async () => {
    const partitionId = 'users-p1';
    const systemCache = new SystemTableCache({
      scheduleCacheChangeNotification: () => {},
    });

    systemCache.applySystemTableChange(
      TABLES.PARTITIONS,
      CACHE_CDC_OPERATIONS.INSERT,
      buildPartitionRow({partitionId, replicaCount: 1, updatedAt: 100}),
    );
    systemCache.applySystemTableChange(
      TABLES.SERVICES,
      CACHE_CDC_OPERATIONS.INSERT,
      buildPartitionServiceRow({partitionId, serviceId: 'users-p1-r1', updatedAt: 100}),
    );

    const authoritativeSnapshot = {
      partitions: [buildPartitionRow({partitionId, replicaCount: 1, updatedAt: 100})],
      services: [buildPartitionServiceRow({partitionId, serviceId: 'users-p1-r1', updatedAt: 100})],
    };

    const engine = new SQLQueryEngine({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      systemCache,
      messageRouter: createMockMessageRouter(),
      authoritativeControlPlaneView: createAuthoritativeViewStub(() => authoritativeSnapshot),
      autoStartDistributedTransactionRecovery: false,
    });

    assert.equal(await engine.refreshAuthoritativeRoutingOverlay(partitionId), true);
    assert.equal(engine.authoritativeRoutingOverlayEntries.has(partitionId), true);

    // 1) Partition deletion: partition row is deleted from cache
    systemCache.applySystemTableChange(
      TABLES.SERVICES,
      CACHE_CDC_OPERATIONS.DELETE,
      {partition_id: partitionId, service_id: 'users-p1-r1', updated_at: 110},
    );
    systemCache.applySystemTableChange(
      TABLES.PARTITIONS,
      CACHE_CDC_OPERATIONS.DELETE,
      {partition_id: partitionId, table_name: 'users', updated_at: 110},
    );

    assert.equal(
      engine.authoritativeRoutingOverlayEntries.has(partitionId),
      false,
      'partition drop must evict the authoritative routing overlay',
    );

    // 2) Partition recreation: new partition row and service inserted
    systemCache.applySystemTableChange(
      TABLES.PARTITIONS,
      CACHE_CDC_OPERATIONS.INSERT,
      buildPartitionRow({partitionId, partitionVersion: 1, replicaCount: 1, updatedAt: 120}),
    );
    systemCache.applySystemTableChange(
      TABLES.SERVICES,
      CACHE_CDC_OPERATIONS.INSERT,
      buildPartitionServiceRow({partitionId, serviceId: 'users-p1-r-new', updatedAt: 120}),
    );

    assert.equal(engine.authoritativeRoutingOverlayEntries.has(partitionId), false);
    assert.deepEqual(
      engine.queryExecutor.getPartitionServiceRows(partitionId).map((r) => r.service_id),
      ['users-p1-r-new'],
      'recreated partition must read fresh services from cache without stale overlay interference',
    );

    // 3) Cache replacement: engine.setSystemCache(newCache)
    const replacementCache = new SystemTableCache({
      scheduleCacheChangeNotification: () => {},
    });
    assert.equal(systemCache.applyListeners.size, 1);
    assert.equal(replacementCache.applyListeners.size, 0);

    engine.setSystemCache(replacementCache);

    assert.equal(
      systemCache.applyListeners.size,
      0,
      'old cache listeners must be detached after setSystemCache',
    );
    assert.equal(
      replacementCache.applyListeners.size,
      1,
      'replacement cache must receive the apply listener',
    );
    assert.equal(engine.authoritativeRoutingOverlayEntries.size, 0);
  });

test('subscription-and-refresh-cleanup: shutdown detaches listener and releases in-flight refreshes idempotently',
  async () => {
    const partitionId = 'users-p1';
    const systemCache = new SystemTableCache({
      scheduleCacheChangeNotification: () => {},
    });

    let resolveRead;
    const delayedReadPromise = new Promise((resolve) => {
      resolveRead = resolve;
    });

    const engine = new SQLQueryEngine({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      systemCache,
      messageRouter: createMockMessageRouter(),
      authoritativeControlPlaneView: {
        async readRows(tableName) {
          await delayedReadPromise;
          if (tableName === TABLES.PARTITIONS) {
            return {
              success: true,
              rows: [buildPartitionRow({partitionId, replicaCount: 1, updatedAt: 100})],
            };
          }
          if (tableName === TABLES.SERVICES) {
            return {
              success: true,
              rows: [buildPartitionServiceRow({partitionId, serviceId: 'users-p1-r1', updatedAt: 100})],
            };
          }
          return {success: false, rows: []};
        },
      },
      autoStartDistributedTransactionRecovery: false,
    });

    assert.equal(systemCache.applyListeners.size, 1);

    // Start an in-flight refresh
    const inFlightRefresh = engine.refreshAuthoritativeRoutingOverlay(partitionId);

    // Shutdown while refresh is in flight
    await engine.shutdown();

    assert.equal(
      systemCache.applyListeners.size,
      0,
      'shutdown must detach cache apply listeners',
    );
    assert.equal(engine.authoritativeRoutingOverlayCacheApplyListener, null);
    assert.equal(engine.authoritativeRoutingOverlayCacheApplyUnsubscribe, null);
    assert.equal(engine.authoritativeRoutingOverlayEntries.size, 0);

    // Resolve the delayed control plane read
    resolveRead();
    const result = await inFlightRefresh;

    assert.equal(result, false, 'in-flight refresh must resolve false on shut-down engine');
    assert.equal(
      engine.authoritativeRoutingOverlayEntries.size,
      0,
      'in-flight refresh must NOT store overlay entry into a shut-down engine',
    );

    // Idempotent second shutdown
    await engine.shutdown();
    assert.equal(engine.authoritativeRoutingOverlayEntries.size, 0);

    // Calling setSystemCache after shutdown must not attach listeners
    const freshCache = new SystemTableCache({
      scheduleCacheChangeNotification: () => {},
    });
    engine.setSystemCache(freshCache);
    assert.equal(freshCache.applyListeners.size, 0);
  });
