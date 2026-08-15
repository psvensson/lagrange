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
import {
  getSharedSyncSectionRegistry,
} from '../../src/diagnostics/event-loop-gap-watchdog.js';
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

// One instrumented stack for the sweep-memo tests: a version-aware bridge
// over the mock cache counting both filter and getAll reads, wired through
// readiness, coordinator, and rebalancer.
function createVersionedRebalancerStack(entityId) {
  const nodeCache = createMockCache({
    nodes: [{node_id: SWEEP_NODE_ID, status: 'active',
      connection_state: 'ready'}],
    services: [],
    partitions: [{partition_id: entityId, table_id: 'p-sweep'}],
    replicaOperations: [],
  });
  const versioned = createVersionedCacheStub();
  const getAllCallsByTable = new Map();
  const cache = {
    ...nodeCache,
    getTableMutationVersion:
      versioned.getTableMutationVersion.bind(versioned),
    bump: versioned.bump.bind(versioned),
    filter(tableName, predicate) {
      versioned.filter(tableName);
      return nodeCache.filter(tableName, predicate);
    },
    getAll(tableName) {
      getAllCallsByTable.set(
        tableName,
        (getAllCallsByTable.get(tableName) || 0) + 1,
      );
      return nodeCache.getAll(tableName);
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
    entityId,
    entityType: EntityType.PARTITION,
    nodeId: SWEEP_NODE_ID,
    systemTableCache: cache,
    rebalanceCoordinator: coordinator,
    controlPlaneReadinessService: readinessService,
  });
  return {
    cache,
    rebalancer,
    getAllCallsByTable,
    filterCallCount: () => versioned.filterCallCount,
    shutdown() {
      rebalancer.shutdown();
      if (typeof coordinator.shutdown === 'function') {
        coordinator.shutdown();
      }
    },
  };
}

test('the global topology-blocking in-flight view scans once per ledger ' +
  'generation', async (t) => {
  const stack = createVersionedRebalancerStack('p-sweep-1');
  t.teardown(() => stack.shutdown());

  const before = stack.filterCallCount();
  for (let index = 0; index < SWEEP_CALL_COUNT; index++) {
    stack.rebalancer.getGlobalTopologyBlockingInFlightOperations();
  }
  t.equal(stack.filterCallCount() - before, 1,
    'repeated global topology-blocking reads share one ledger scan');

  stack.cache.bump('replica_operations');
  stack.rebalancer.getGlobalTopologyBlockingInFlightOperations();
  t.equal(stack.filterCallCount() - before, 2,
    'a ledger write invalidates the scan memo');
  t.end();
});

test('the current-priority-placement observation builds once per ' +
  'source-table generation', async (t) => {
  const stack = createVersionedRebalancerStack('p-sweep-1');
  t.teardown(() => stack.shutdown());
  const {cache, rebalancer, getAllCallsByTable} = stack;

  const planningSnapshot = Object.freeze({
    publishedActiveNodeIds: [SWEEP_NODE_ID],
  });
  const readyNodeIds = new Set([SWEEP_NODE_ID]);
  const before = getAllCallsByTable.get('services') || 0;
  const observations = [];
  for (let index = 0; index < SWEEP_CALL_COUNT; index++) {
    observations.push(
      rebalancer.buildCurrentPriorityPlacementPlanningObservation(
        planningSnapshot,
        {readyNodeIds, observedAt: 1000 + index},
      ),
    );
  }
  t.equal(getAllCallsByTable.get('services') - before, 1,
    'a synchronous sweep of identical observation builds shares one ' +
      'full-table read');
  t.equal(observations[0], observations[SWEEP_CALL_COUNT - 1],
    'the sweep shares one frozen observation object');

  cache.bump('services');
  const afterWrite =
    rebalancer.buildCurrentPriorityPlacementPlanningObservation(
      planningSnapshot,
      {readyNodeIds, observedAt: 2000},
    );
  t.equal(getAllCallsByTable.get('services') - before, 2,
    'a source-table write invalidates the observation memo');
  t.not(afterWrite, observations[0],
    'the invalidated memo yields a fresh observation');

  rebalancer.buildCurrentPriorityPlacementPlanningObservation(
    planningSnapshot,
    {readyNodeIds: new Set(), observedAt: 3000},
  );
  t.equal(getAllCallsByTable.get('services') - before, 3,
    'a different ready-node view never reuses another variant’s memo');
  t.end();
});

test('the spread-blocker recovery gate builds once per planning snapshot ' +
  'identity', async (t) => {
  const stack = createVersionedRebalancerStack('p-sweep-1');
  t.teardown(() => stack.shutdown());
  const planningSnapshot = Object.freeze({
    publishedActiveNodeIds: Object.freeze([SWEEP_NODE_ID]),
    priorityPartitionSummary: Object.freeze({satisfied: false}),
  });
  stack.rebalancer.controlPlaneReadinessService
    .getMembershipPublicationPlanningAnswerSync = () => planningSnapshot;
  const readGateBuilds = () => {
    const site = getSharedSyncSectionRegistry()
      .sites.get('publication_recovery_gate_snapshot_build');
    return site ? site.count : 0;
  };
  const before = readGateBuilds();
  for (let index = 0; index < SWEEP_CALL_COUNT; index++) {
    stack.rebalancer.getControlPlanePrioritySpreadBlocker();
  }
  t.equal(readGateBuilds() - before, 1,
    'repeated spread-blocker evaluations of one snapshot share one gate ' +
      'build');

  stack.rebalancer.controlPlaneReadinessService
    .getMembershipPublicationPlanningAnswerSync =
      () => Object.freeze({...planningSnapshot});
  stack.rebalancer.getControlPlanePrioritySpreadBlocker();
  t.equal(readGateBuilds() - before, 2,
    'a new snapshot identity rebuilds the gate');
  t.end();
});

test('the async membership-planning snapshot derives once per source-table ' +
  'generation across concurrent callers', async (t) => {
  const cache = createVersionedCacheStub();
  let derivations = 0;
  const readiness = new ControlPlaneReadinessService({
    nodeId: SWEEP_NODE_ID,
    systemTableCache: cache,
    membershipPublicationService: {
      async deriveClusterMembershipCandidate() {
        derivations += 1;
        return {
          publicationEpoch: 1,
          status: 'PUBLISHED',
          publishedActiveNodeIds: [SWEEP_NODE_ID],
        };
      },
    },
  });

  await Promise.all(
    Array.from({length: SWEEP_CALL_COUNT}, () =>
      readiness.getMembershipPublicationPlanningSnapshot(
        SWEEP_NODE_ID,
        1000,
      )),
  );
  t.equal(derivations, 1,
    'concurrent in-flight reads share one async derivation');

  await readiness.getMembershipPublicationPlanningSnapshot(
    SWEEP_NODE_ID,
    2000,
  );
  t.equal(derivations, 1,
    'a settled derivation keeps serving its generation');

  cache.bump('nodes');
  await readiness.getMembershipPublicationPlanningSnapshot(
    SWEEP_NODE_ID,
    3000,
  );
  t.equal(derivations, 2,
    'a source-table write invalidates the async derivation memo');

  await readiness.getMembershipPublicationPlanningSnapshot(
    'node-other',
    4000,
  );
  t.equal(derivations, 3,
    'a different publisher never reuses another publisher’s memo');
  t.end();
});
