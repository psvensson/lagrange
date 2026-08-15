/**
 * Planning-sweep memoization: one derivation per source-table generation.
 *
 * Formation planning sweeps call the synchronous membership-planning
 * candidate derivation once per entity plus dozens of times per priority
 * entity in one synchronous burst, and evaluated the global
 * topology-blocking in-flight view with a full replica_operations scan per
 * call — profiled at ~half and ~16 percent of seed CPU respectively, with
 * 36-41s event-loop freezes blocking spread dispatch acks (live evidence:
 * movielens-lagrange-service-affinity-live-2026-08-15T13-44-18-088Z).
 * Both are memoized on system-table mutation versions; any relevant write
 * invalidates.
 */
import {test} from '../../src/test-helpers/tap.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {EntityType} from '../../src/rebalancer/unified-rebalancer.js';
import {
  createMockCache,
  createMockControlPlaneReadinessService,
  createTestCoordinator,
  createTestRebalancer,
} from './test-helpers.js';

const SWEEP_NODE_ID = 'node-sweep-memo';
const SWEEP_CALL_COUNT = 10;

function createVersionedCacheStub() {
  const versions = new Map();
  let filterCalls = 0;
  return {
    get versionsMap() {
      return versions;
    },
    get filterCallCount() {
      return filterCalls;
    },
    bump(tableName) {
      versions.set(tableName, (versions.get(tableName) || 0) + 1);
    },
    getTableMutationVersion(tableName) {
      return versions.get(tableName) || 0;
    },
    get() {
      return null;
    },
    getAll() {
      return [];
    },
    filter(_tableName) {
      filterCalls += 1;
      return [];
    },
    addListener() {},
  };
}

test('the sync membership-planning snapshot derives once per source-table ' +
  'generation', async (t) => {
  const cache = createVersionedCacheStub();
  let derivations = 0;
  const readiness = new ControlPlaneReadinessService({
    nodeId: SWEEP_NODE_ID,
    systemTableCache: cache,
    membershipPublicationService: {
      deriveClusterMembershipCandidateSync() {
        derivations += 1;
        return {
          publicationEpoch: 1,
          status: 'PUBLISHED',
          publishedActiveNodeIds: [SWEEP_NODE_ID],
        };
      },
    },
  });

  for (let index = 0; index < SWEEP_CALL_COUNT; index++) {
    readiness.getPriorityRecoveryPlanningSnapshotSync(SWEEP_NODE_ID, 1000);
  }
  t.equal(derivations, 1,
    'a synchronous sweep of identical reads shares one derivation');

  cache.bump('nodes');
  readiness.getPriorityRecoveryPlanningSnapshotSync(SWEEP_NODE_ID, 2000);
  t.equal(derivations, 2,
    'a source-table write invalidates the derivation memo');

  readiness.getPriorityRecoveryPlanningSnapshotSync('node-other', 3000);
  t.equal(derivations, 3,
    'a different publisher never reuses another publisher’s memo');
  t.end();
});

test('the global topology-blocking in-flight view scans once per ledger ' +
  'generation', async (t) => {
  const nodeCache = createMockCache({
    nodes: [{node_id: SWEEP_NODE_ID, status: 'active',
      connection_state: 'ready'}],
    services: [],
    partitions: [{partition_id: 'p-sweep-1', table_id: 'p-sweep'}],
    replicaOperations: [],
  });
  const versioned = createVersionedCacheStub();
  // Bridge: version-aware filter over the mock cache's data surface.
  const cache = {
    ...nodeCache,
    getTableMutationVersion:
      versioned.getTableMutationVersion.bind(versioned),
    bump: versioned.bump.bind(versioned),
    filter(tableName, predicate) {
      versioned.filter(tableName);
      return nodeCache.filter(tableName, predicate);
    },
  };
  const readinessService = createMockControlPlaneReadinessService({
    systemTableCache: cache,
  });
  const coordinator = createTestCoordinator({
    nodeId: SWEEP_NODE_ID,
    systemTableCache: cache,
    controlPlaneReadinessService: readinessService,
  });
  const rebalancer = createTestRebalancer({
    entityId: 'p-sweep-1',
    entityType: EntityType.PARTITION,
    nodeId: SWEEP_NODE_ID,
    systemTableCache: cache,
    rebalanceCoordinator: coordinator,
    controlPlaneReadinessService: readinessService,
  });
  t.teardown(() => {
    rebalancer.shutdown();
    if (typeof coordinator.shutdown === 'function') {
      coordinator.shutdown();
    }
  });

  const before = versioned.filterCallCount;
  for (let index = 0; index < SWEEP_CALL_COUNT; index++) {
    rebalancer.getGlobalTopologyBlockingInFlightOperations();
  }
  t.equal(versioned.filterCallCount - before, 1,
    'repeated global topology-blocking reads share one ledger scan');

  cache.bump('replica_operations');
  rebalancer.getGlobalTopologyBlockingInFlightOperations();
  t.equal(versioned.filterCallCount - before, 2,
    'a ledger write invalidates the scan memo');
  t.end();
});
