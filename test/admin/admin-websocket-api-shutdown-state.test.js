import {test} from '../../src/test-helpers/tap.js';
import {AdminWebSocketAPI} from '../../src/admin/admin-websocket-api.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TABLES} from '../../src/constants/index.js';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize();
  LoggingService.getInstance().initialize({level: 'error'});
}

function waitForCacheNotifications() {
  return new Promise((resolve) => setImmediate(resolve));
}

function createDeferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return {promise, resolve};
}

async function pauseFastifyClose(api) {
  await api.initialize(0, {listen: false});
  const closeStarted = createDeferred();
  const releaseClose = createDeferred();
  const originalClose = api.fastify.close.bind(api.fastify);
  api.fastify.close = async () => {
    closeStarted.resolve();
    await releaseClose.promise;
    return originalClose();
  };
  return {closeStarted, releaseClose};
}

function applyTableInsert(cache, tableId) {
  cache.applySystemTableChange('tables', 'INSERT', {
    table_id: tableId,
    table_name: tableId,
  });
}

function createSnapshotMarkerCache(marker, nodeId) {
  const cache = new SystemTableCache();
  cache.snapshotMarker = marker;
  cache.getAll = (tableName) => {
    if (tableName === TABLES.NODES) {
      return [{
        node_id: nodeId,
        node_address: `${marker}-address`,
        cache_owner: marker,
      }];
    }
    if (tableName === TABLES.REPLICA_OPERATIONS) {
      return [{cache_owner: marker}];
    }
    return [];
  };
  cache.count = () => marker === 'replacement' ? 2 : 1;
  return cache;
}

test('AdminWebSocketAPI owns one cache notification subscription across ' +
  'handoff, shutdown, and restart', async (t) => {
  initializeTestEnvironment();

  const initialCache = new SystemTableCache();
  const replacementCache = new SystemTableCache();
  const receivedTableIds = [];
  const api = new AdminWebSocketAPI({
    nodeId: 'admin-cache-subscription-owner',
    systemTableCache: initialCache,
  });
  api.broadcastCDCEvent = (_tableName, _operation, record) => {
    receivedTableIds.push(record.table_id);
  };

  t.equal(initialCache.listeners.size, 1, 'construction binds one listener');
  api.setSystemTableCache(initialCache);
  api.setSystemTableCache(initialCache);
  t.equal(
    initialCache.listeners.size,
    1,
    'repeated same-cache binding remains idempotent',
  );

  api.setSystemTableCache(replacementCache);
  t.equal(initialCache.listeners.size, 0, 'handoff detaches the old cache');
  t.equal(replacementCache.listeners.size, 1, 'handoff binds the new cache once');
  t.equal(
    api.controlSnapshot.systemTableCache,
    replacementCache,
    'control snapshot follows the cache handoff',
  );
  t.equal(
    api.preflightSnapshot.systemTableCache,
    replacementCache,
    'preflight snapshot follows the cache handoff',
  );
  t.equal(
    api.serviceDiscovery.systemTableCache,
    replacementCache,
    'service discovery follows the cache handoff',
  );

  applyTableInsert(initialCache, 'old-cache-row');
  applyTableInsert(replacementCache, 'replacement-cache-row');
  await waitForCacheNotifications();
  t.same(
    receivedTableIds,
    ['replacement-cache-row'],
    'only the replacement cache can deliver after handoff',
  );

  await api.shutdown();
  t.equal(replacementCache.listeners.size, 0, 'shutdown detaches the listener');
  applyTableInsert(replacementCache, 'post-shutdown-row');
  await waitForCacheNotifications();
  t.same(
    receivedTableIds,
    ['replacement-cache-row'],
    'shutdown prevents later cache delivery',
  );

  await api.initialize(0, {listen: false});
  t.equal(
    replacementCache.listeners.size,
    1,
    'restart restores exactly one live subscription',
  );
  applyTableInsert(replacementCache, 'post-restart-row');
  await waitForCacheNotifications();
  t.same(
    receivedTableIds,
    ['replacement-cache-row', 'post-restart-row'],
    'restarted admin delivery remains continuous',
  );

  await api.shutdown();
  t.equal(
    replacementCache.listeners.size,
    0,
    'repeated shutdown leaves no owned subscription behind',
  );
});

test('AdminWebSocketAPI shutdown clears initialized and listening state',
  async (t) => {
    initializeTestEnvironment();

    const api = new AdminWebSocketAPI({
      nodeId: 'admin-shutdown-state-node',
    });

    await api.initialize(0);
    t.equal(api.isInitialized(), true, 'admin API should initialize');
    t.equal(api.isListening(), true, 'admin API should listen before shutdown');

    await api.shutdown();

    t.equal(api.isInitialized(), false, 'shutdown clears initialized state');
    t.equal(api.isListening(), false, 'shutdown clears listening state');
  });

test('AdminWebSocketAPI cache handoff during shutdown cannot rebind a live ' +
  'notification owner', async (t) => {
  initializeTestEnvironment();

  const initialCache = new SystemTableCache();
  const replacementCache = new SystemTableCache();
  const api = new AdminWebSocketAPI({
    nodeId: 'admin-concurrent-shutdown-handoff',
    systemTableCache: initialCache,
    cacheMutationTarget: initialCache,
  });
  const {closeStarted, releaseClose} = await pauseFastifyClose(api);

  const shutdownPromise = api.shutdown();
  await closeStarted.promise;
  api.setSystemTableCache(replacementCache);

  t.equal(
    replacementCache.listeners.size,
    0,
    'a handoff cannot subscribe a replacement while shutdown owns the lane',
  );
  t.equal(
    api.serviceDiscovery.cacheMutationTarget,
    replacementCache,
    'handoff keeps the service-discovery read and mutation owners coherent',
  );

  releaseClose.resolve();
  await shutdownPromise;

  t.equal(
    replacementCache.listeners.size,
    0,
    'completed shutdown leaves the replacement cache detached',
  );
  t.equal(api.isInitialized(), false, 'the serialized shutdown completes');
});

test('AdminWebSocketAPI initialize requested during shutdown restarts after ' +
  'the close transition', async (t) => {
  initializeTestEnvironment();

  const cache = new SystemTableCache();
  const api = new AdminWebSocketAPI({
    nodeId: 'admin-concurrent-shutdown-restart',
    systemTableCache: cache,
  });
  const {closeStarted, releaseClose} = await pauseFastifyClose(api);

  const shutdownPromise = api.shutdown();
  await closeStarted.promise;
  let restartResolved = false;
  const restartPromise = api.initialize(0, {listen: false}).then(() => {
    restartResolved = true;
  });
  await Promise.resolve();

  t.equal(
    restartResolved,
    false,
    'restart remains queued while the prior server is still closing',
  );

  releaseClose.resolve();
  await Promise.all([shutdownPromise, restartPromise]);

  t.equal(api.isInitialized(), true, 'queued restart initializes a new server');
  t.equal(
    cache.listeners.size,
    1,
    'queued restart restores exactly one cache notification owner',
  );

  await api.shutdown();
});

test('AdminWebSocketAPI cache handoff fences cache-bound discovery repair ' +
  'state and in-flight completion', async (t) => {
  initializeTestEnvironment();

  const initialCache = new SystemTableCache();
  const replacementCache = new SystemTableCache();
  const firstReadStarted = createDeferred();
  const releaseFirstRead = createDeferred();
  const secondReadStarted = createDeferred();
  const releaseSecondRead = createDeferred();
  const reconcileOwners = [];
  const gateway = {
    async reconcileAuthoritativeCacheRows(_tableName, _rows, options) {
      reconcileOwners.push({
        cacheMutationTarget: options.cacheMutationTarget,
        systemTableCache: options.systemTableCache,
      });
      return {
        success: true,
        mutationCount: 0,
        authoritativeObservedAtMs: 1,
      };
    },
  };
  const api = new AdminWebSocketAPI({
    nodeId: 'admin-cache-owner-generation-fence',
    systemTableCache: initialCache,
    cacheMutationTarget: initialCache,
    controlPlaneSystemTableGateway: gateway,
  });
  const discovery = api.serviceDiscovery;
  let readCount = 0;
  discovery.canReadAuthoritativeDiscoveryRows = () => true;
  discovery.resolveAuthoritativeDiscoveryRepairTables = () => ['nodes'];
  discovery.readAuthoritativeSystemTableRows = async () => {
    readCount += 1;
    if (readCount === 1) {
      firstReadStarted.resolve();
      await releaseFirstRead.promise;
    } else if (readCount === 2) {
      secondReadStarted.resolve();
      await releaseSecondRead.promise;
    }
    return {
      tableName: 'nodes',
      rows: [],
      authoritativeObservation: {
        scope: 'complete_table',
        observedAtMs: readCount,
      },
    };
  };

  const staleRepair = discovery.ensureAuthoritativeDiscoveryCacheRepair({
    reason: 'cache-owner-handoff-first',
  });
  await firstReadStarted.promise;
  api.setSystemTableCache(replacementCache);

  t.equal(
    discovery.systemTableCache,
    replacementCache,
    'service discovery reads from the replacement cache',
  );
  t.equal(
    discovery.cacheMutationTarget,
    replacementCache,
    'service discovery mutates the paired replacement cache',
  );
  t.equal(
    api.controlSnapshot.cacheMutationTarget,
    replacementCache,
    'control snapshot follows the replacement mutation owner',
  );
  t.equal(
    api.preflightSnapshot.cacheMutationTarget,
    replacementCache,
    'preflight snapshot follows the replacement mutation owner',
  );

  const currentRepair =
    discovery.ensureAuthoritativeDiscoveryCacheRepair({
      reason: 'cache-owner-handoff-second',
    });
  await secondReadStarted.promise;
  releaseFirstRead.resolve();
  const staleResult = await staleRepair;
  t.equal(
    staleResult.applied,
    false,
    'the old-owner repair cannot publish success after handoff',
  );
  t.equal(
    staleResult.staleOwner,
    true,
    'the fenced repair reports its obsolete owner generation',
  );
  t.ok(
    discovery.authoritativeDiscoveryRepairPromise,
    'old-owner finalization cannot clear the overlapping replacement repair',
  );

  releaseSecondRead.resolve();
  const currentResult = await currentRepair;
  t.equal(currentResult.applied, true, 'the new owner performs a fresh repair');
  t.equal(currentResult.reused, false, 'old-owner success is never reused');
  t.equal(readCount, 2, 'the replacement owner issues its own read');
  t.equal(reconcileOwners.length, 1, 'only the current owner reaches reconcile');
  t.equal(
    reconcileOwners[0]?.systemTableCache,
    replacementCache,
    'reconcile reads from the captured replacement owner',
  );
  t.equal(
    reconcileOwners[0]?.cacheMutationTarget,
    replacementCache,
    'reconcile writes through the same captured replacement owner',
  );

  await api.shutdown();
});

test('AdminWebSocketAPI cache handoff fences overlapping authoritative ' +
  'evidence probes by owner generation', async (t) => {
  initializeTestEnvironment();

  const initialCache = new SystemTableCache();
  const replacementCache = new SystemTableCache();
  const firstProbeStarted = createDeferred();
  const releaseFirstProbe = createDeferred();
  const secondProbeStarted = createDeferred();
  const releaseSecondProbe = createDeferred();
  const api = new AdminWebSocketAPI({
    nodeId: 'admin-cache-owner-evidence-probe-fence',
    systemTableCache: initialCache,
    cacheMutationTarget: initialCache,
  });
  const discovery = api.serviceDiscovery;
  let probeCount = 0;
  discovery.canReadAuthoritativeDiscoveryRows = () => true;
  discovery.lastAuthoritativeDiscoveryRepairFailureState = {
    completedAtMs: 11,
    failedTables: [TABLES.NODES],
    requestedTableNames: [TABLES.NODES],
  };
  discovery.readAuthoritativeDiscoveryEvidenceObservation = async () => {
    probeCount += 1;
    if (probeCount === 1) {
      firstProbeStarted.resolve();
      await releaseFirstProbe.promise;
    } else {
      secondProbeStarted.resolve();
      await releaseSecondProbe.promise;
    }
    return {
      tableName: TABLES.NODES,
      rows: [{cache_owner: probeCount === 1 ? 'initial' : 'replacement'}],
      authoritativeObservation: {observedAtMs: probeCount},
    };
  };

  const staleProbe = discovery.probeAuthoritativeDiscoveryEvidenceRevision();
  await firstProbeStarted.promise;
  api.setSystemTableCache(replacementCache);
  discovery.lastAuthoritativeDiscoveryRepairFailureState = {
    completedAtMs: 22,
    failedTables: [TABLES.NODES],
    requestedTableNames: [TABLES.NODES],
  };
  const currentProbe =
    discovery.probeAuthoritativeDiscoveryEvidenceRevision();
  await secondProbeStarted.promise;

  releaseFirstProbe.resolve();
  t.equal(await staleProbe, null, 'the old-owner probe result is discarded');
  t.ok(
    discovery.authoritativeDiscoveryEvidenceProbePromise,
    'old probe finalization cannot clear the overlapping replacement probe',
  );

  releaseSecondProbe.resolve();
  const currentResult = await currentProbe;
  t.equal(
    currentResult.deferredRepairEvidenceRevision,
    22,
    'the replacement probe reports only replacement-owner failure evidence',
  );
  t.equal(probeCount, 2, 'each cache owner receives one bounded probe');

  await api.shutdown();
});

test('AdminWebSocketAPI control snapshot re-drives after an awaited cache ' +
  'owner handoff', async (t) => {
  initializeTestEnvironment();

  const nodeId = 'admin-control-snapshot-owner-fence';
  const initialCache = createSnapshotMarkerCache('initial', nodeId);
  const replacementCache = createSnapshotMarkerCache('replacement', nodeId);
  const diagnosticsStarted = createDeferred();
  const releaseDiagnostics = createDeferred();
  const api = new AdminWebSocketAPI({
    nodeId,
    systemTableCache: initialCache,
    cacheMutationTarget: initialCache,
  });
  const controlSnapshot = api.controlSnapshot;
  let diagnosticsCount = 0;
  controlSnapshot.buildControlPlaneDiagnosticsSnapshot = async () => {
    diagnosticsCount += 1;
    if (diagnosticsCount === 1) {
      diagnosticsStarted.resolve();
      await releaseDiagnostics.promise;
    }
    return {
      publicationConvergence: {},
      priorityRecoveryDecisionSnapshots: {},
      readinessByNodeId: {},
    };
  };
  controlSnapshot.resolveControlSnapshotNodeViews = (nodeRows) => {
    const activeNodeIds = nodeRows.map((row) => `${row.cache_owner}-node`);
    return {
      authoritativeSource: 'cache-owner-test',
      authoritativeActiveNodeIds: activeNodeIds,
      projectedServingNodeIds: activeNodeIds,
      locallyEligibleNodeIds: activeNodeIds,
      suspectedOrTransitioningNodeIds: [],
      membershipFreeze: null,
      effectiveSource: 'cache-owner-test',
      effectiveActiveNodeIds: activeNodeIds,
      projectedActiveNodeIds: activeNodeIds,
      publishedActiveNodeIds: [],
      publishedMembershipAvailable: false,
    };
  };
  controlSnapshot.resolvePublicationActiveGateHandoffContract = () => ({
    activeGateCatchupFence: null,
  });
  controlSnapshot.resolveCanonicalPublicationRecoveryEvidenceDiagnostics =
    () => ({
      publicationConvergence: {},
      publicationConvergenceGate: {},
      priorityRecoveryObservation: {},
    });
  controlSnapshot.resolveActiveGateOwnerCohortSnapshot = () => ({});
  controlSnapshot.buildControlSnapshotLeaderSummary = () => ({
    leaders: {},
    partitionLeaderAuthority: {},
    replicaRoles: {},
    replicaRoleDiagnostics: {},
  });
  controlSnapshot.buildControlSnapshotVoterCounts = () => ({});
  controlSnapshot.buildControlSnapshotReplicaOperationSummary = (rows) =>
    rows.map((row) => row.cache_owner);
  controlSnapshot.buildLocalCdcTelemetry = () => ({});

  const snapshotPromise = controlSnapshot.buildLocalControlSnapshot();
  await diagnosticsStarted.promise;
  api.setSystemTableCache(replacementCache);
  releaseDiagnostics.resolve();
  const snapshot = await snapshotPromise;

  t.same(
    snapshot.nodes,
    [`${replacementCache.snapshotMarker}-node`],
    'returned active nodes come from the replacement owner',
  );
  t.same(
    snapshot.replicaOperations,
    [replacementCache.snapshotMarker],
    'pre-await rows are re-read from the same replacement owner',
  );
  t.equal(
    diagnosticsCount,
    2,
    'the mixed old-owner attempt is discarded and re-driven once',
  );

  await api.shutdown();
});

test('AdminWebSocketAPI preflight snapshot re-drives after an awaited cache ' +
  'owner handoff', async (t) => {
  initializeTestEnvironment();

  const nodeId = 'admin-preflight-snapshot-owner-fence';
  const initialCache = createSnapshotMarkerCache('initial', nodeId);
  const replacementCache = createSnapshotMarkerCache('replacement', nodeId);
  const diagnosticsStarted = createDeferred();
  const releaseDiagnostics = createDeferred();
  const api = new AdminWebSocketAPI({
    nodeId,
    systemTableCache: initialCache,
    cacheMutationTarget: initialCache,
  });
  const preflightSnapshot = api.preflightSnapshot;
  let diagnosticsCount = 0;
  preflightSnapshot.resolveControlPlaneDiagnosticsSnapshot = async () => {
    diagnosticsCount += 1;
    if (diagnosticsCount === 1) {
      diagnosticsStarted.resolve();
      await releaseDiagnostics.promise;
    }
    return {cacheOwner: preflightSnapshot.systemTableCache.snapshotMarker};
  };

  const snapshotPromise =
    preflightSnapshot.buildLocalPreflightCriticalPathSnapshot();
  await diagnosticsStarted.promise;
  api.setSystemTableCache(replacementCache);
  releaseDiagnostics.resolve();
  const snapshot = await snapshotPromise;

  t.equal(
    snapshot.address,
    `${replacementCache.snapshotMarker}-address`,
    'returned preflight address comes from the replacement owner',
  );
  t.equal(
    snapshot.rowCounts.nodeEndpointsCount,
    2,
    'returned preflight row counts come from the replacement owner',
  );
  t.equal(
    snapshot.controlPlaneDiagnostics.cacheOwner,
    replacementCache.snapshotMarker,
    'awaited diagnostics share the returned snapshot owner generation',
  );
  t.equal(
    diagnosticsCount,
    2,
    'the mixed old-owner preflight attempt is discarded and re-driven once',
  );

  await api.shutdown();
});

test('AdminWebSocketAPI resolved preflight re-drives when repair retires its ' +
  'snapshot owner', async (t) => {
  initializeTestEnvironment();

  const nodeId = 'admin-resolved-preflight-owner-fence';
  const initialCache = createSnapshotMarkerCache('initial', nodeId);
  const replacementCache = createSnapshotMarkerCache('replacement', nodeId);
  const repairStarted = createDeferred();
  const releaseRepair = createDeferred();
  const api = new AdminWebSocketAPI({
    nodeId,
    systemTableCache: initialCache,
    cacheMutationTarget: initialCache,
  });
  const preflightSnapshot = api.preflightSnapshot;
  let repairCount = 0;
  preflightSnapshot.evaluateAuthoritativePreflightRepair = () => ({
    shouldRepair: true,
    triggerCodes: [],
  });
  preflightSnapshot.ensureAuthoritativeDiscoveryCacheRepair = async () => {
    repairCount += 1;
    if (repairCount === 1) {
      repairStarted.resolve();
      await releaseRepair.promise;
      return {applied: false, staleOwner: true};
    }
    return {applied: false};
  };

  const snapshotPromise =
    preflightSnapshot.resolvePreflightCriticalPathSnapshot();
  await repairStarted.promise;
  api.setSystemTableCache(replacementCache);
  releaseRepair.resolve();
  const snapshot = await snapshotPromise;

  t.equal(
    snapshot.address,
    `${replacementCache.snapshotMarker}-address`,
    'the resolver cannot return its coherent but retired preflight snapshot',
  );
  t.equal(
    snapshot.rowCounts.nodeEndpointsCount,
    2,
    'the resolved snapshot is rebuilt from the replacement cache owner',
  );
  t.equal(repairCount, 2, 'the complete preflight operation re-drives once');

  await api.shutdown();
});

test('AdminWebSocketAPI resolved control snapshot re-drives when handoff ' +
  'retires its snapshot owner', async (t) => {
  initializeTestEnvironment();

  const nodeId = 'admin-resolved-control-owner-fence';
  const initialCache = createSnapshotMarkerCache('initial', nodeId);
  const replacementCache = createSnapshotMarkerCache('replacement', nodeId);
  const handoffStarted = createDeferred();
  const releaseHandoff = createDeferred();
  const api = new AdminWebSocketAPI({
    nodeId,
    systemTableCache: initialCache,
    cacheMutationTarget: initialCache,
  });
  const controlSnapshot = api.controlSnapshot;
  let handoffCount = 0;
  controlSnapshot.buildLocalControlSnapshot = async () => ({
    cacheOwner: controlSnapshot.systemTableCache.snapshotMarker,
    controlPlaneDiagnostics: {},
  });
  controlSnapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
    shouldRepair: false,
  });
  controlSnapshot.canRunAuthoritativeControlSnapshotRepair = () => false;
  controlSnapshot.triggerMembershipPublicationHandoffOwnerCommand =
    async (snapshot) => {
      handoffCount += 1;
      if (handoffCount === 1) {
        handoffStarted.resolve();
        await releaseHandoff.promise;
      }
      return snapshot;
    };
  controlSnapshot.prepareVisibleMembershipPublicationHandoffRefresh =
    async (snapshot) => ({snapshot, refreshed: false});
  controlSnapshot.resolveSharedControlSnapshot = async (snapshot) => snapshot;

  const snapshotPromise = controlSnapshot.resolveLocalControlSnapshot();
  await handoffStarted.promise;
  api.setSystemTableCache(replacementCache);
  releaseHandoff.resolve();
  const snapshot = await snapshotPromise;

  t.equal(
    snapshot.cacheOwner,
    replacementCache.snapshotMarker,
    'the resolver cannot publish a retired control snapshot after handoff',
  );
  t.equal(handoffCount, 2, 'the complete control operation re-drives once');

  await api.shutdown();
});

test('AdminWebSocketAPI resolved service discovery re-drives when its shared ' +
  'owner await spans cache handoff', async (t) => {
  initializeTestEnvironment();

  const nodeId = 'admin-resolved-discovery-owner-fence';
  const initialCache = createSnapshotMarkerCache('initial', nodeId);
  const replacementCache = createSnapshotMarkerCache('replacement', nodeId);
  const sharedOwnerStarted = createDeferred();
  const releaseSharedOwner = createDeferred();
  const api = new AdminWebSocketAPI({
    nodeId,
    systemTableCache: initialCache,
    cacheMutationTarget: initialCache,
  });
  const discovery = api.serviceDiscovery;
  let sharedOwnerCount = 0;
  discovery.buildLocalServiceDiscoverySnapshot = () => ({
    cacheOwner: discovery.systemTableCache.snapshotMarker,
  });
  discovery.controlPlaneSnapshotOwner = {
    async resolveServiceDiscoverySnapshot(snapshot) {
      sharedOwnerCount += 1;
      if (sharedOwnerCount === 1) {
        sharedOwnerStarted.resolve();
        await releaseSharedOwner.promise;
      }
      return snapshot;
    },
  };

  const snapshotPromise = discovery.resolveServiceDiscoverySnapshot();
  await sharedOwnerStarted.promise;
  api.setSystemTableCache(replacementCache);
  releaseSharedOwner.resolve();
  const snapshot = await snapshotPromise;

  t.equal(
    snapshot.cacheOwner,
    replacementCache.snapshotMarker,
    'shared discovery cannot return a retired cache-owner snapshot',
  );
  t.equal(
    sharedOwnerCount,
    2,
    'the complete service-discovery operation re-drives once',
  );

  await api.shutdown();
});

test('AdminWebSocketAPI resolved control snapshot discards a rejected ' +
  'retired-owner attempt', async (t) => {
  initializeTestEnvironment();

  const nodeId = 'admin-rejected-control-owner-fence';
  const initialCache = createSnapshotMarkerCache('initial', nodeId);
  const replacementCache = createSnapshotMarkerCache('replacement', nodeId);
  const sharedOwnerStarted = createDeferred();
  const releaseSharedOwner = createDeferred();
  const api = new AdminWebSocketAPI({
    nodeId,
    systemTableCache: initialCache,
    cacheMutationTarget: initialCache,
  });
  const controlSnapshot = api.controlSnapshot;
  let sharedOwnerCount = 0;
  controlSnapshot.buildLocalControlSnapshot = async () => ({
    cacheOwner: controlSnapshot.systemTableCache.snapshotMarker,
    controlPlaneDiagnostics: {},
  });
  controlSnapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
    shouldRepair: false,
  });
  controlSnapshot.canRunAuthoritativeControlSnapshotRepair = () => false;
  controlSnapshot.triggerMembershipPublicationHandoffOwnerCommand =
    async (snapshot) => snapshot;
  controlSnapshot.prepareVisibleMembershipPublicationHandoffRefresh =
    async (snapshot) => ({snapshot, refreshed: false});
  controlSnapshot.resolveSharedControlSnapshot = async (snapshot) => {
    sharedOwnerCount += 1;
    if (sharedOwnerCount === 1) {
      sharedOwnerStarted.resolve();
      await releaseSharedOwner.promise;
      throw new Error('retired control owner failed');
    }
    return snapshot;
  };

  const snapshotPromise = controlSnapshot.resolveLocalControlSnapshot();
  await sharedOwnerStarted.promise;
  api.setSystemTableCache(replacementCache);
  releaseSharedOwner.resolve();
  let snapshot = null;
  let caught = null;
  try {
    snapshot = await snapshotPromise;
  } catch (error) {
    caught = error;
  }

  t.equal(caught, null, 'a retired control-owner rejection is discarded');
  t.equal(
    snapshot?.cacheOwner,
    replacementCache.snapshotMarker,
    'the replacement control owner gets a fresh complete attempt',
  );
  t.equal(sharedOwnerCount, 2, 'control re-drives once after stale rejection');

  await api.shutdown();
});

test('AdminWebSocketAPI resolved service discovery discards a rejected ' +
  'retired-owner attempt', async (t) => {
  initializeTestEnvironment();

  const nodeId = 'admin-rejected-discovery-owner-fence';
  const initialCache = createSnapshotMarkerCache('initial', nodeId);
  const replacementCache = createSnapshotMarkerCache('replacement', nodeId);
  const sharedOwnerStarted = createDeferred();
  const releaseSharedOwner = createDeferred();
  const api = new AdminWebSocketAPI({
    nodeId,
    systemTableCache: initialCache,
    cacheMutationTarget: initialCache,
  });
  const discovery = api.serviceDiscovery;
  let sharedOwnerCount = 0;
  discovery.buildLocalServiceDiscoverySnapshot = () => ({
    cacheOwner: discovery.systemTableCache.snapshotMarker,
  });
  discovery.controlPlaneSnapshotOwner = {
    async resolveServiceDiscoverySnapshot(snapshot) {
      sharedOwnerCount += 1;
      if (sharedOwnerCount === 1) {
        sharedOwnerStarted.resolve();
        await releaseSharedOwner.promise;
        throw new Error('retired discovery owner failed');
      }
      return snapshot;
    },
  };

  const snapshotPromise = discovery.resolveServiceDiscoverySnapshot();
  await sharedOwnerStarted.promise;
  api.setSystemTableCache(replacementCache);
  releaseSharedOwner.resolve();
  let snapshot = null;
  let caught = null;
  try {
    snapshot = await snapshotPromise;
  } catch (error) {
    caught = error;
  }

  t.equal(caught, null, 'a retired discovery-owner rejection is discarded');
  t.equal(
    snapshot?.cacheOwner,
    replacementCache.snapshotMarker,
    'the replacement discovery owner gets a fresh complete attempt',
  );
  t.equal(
    sharedOwnerCount,
    2,
    'service discovery re-drives once after stale rejection',
  );

  await api.shutdown();
});

test('AdminWebSocketAPI cache handoff fails closed when a child lacks its ' +
  'typed owner transition', async (t) => {
  initializeTestEnvironment();

  const initialCache = new SystemTableCache();
  const replacementCache = new SystemTableCache();
  const api = new AdminWebSocketAPI({
    nodeId: 'admin-cache-owner-participant-contract',
    systemTableCache: initialCache,
    cacheMutationTarget: initialCache,
  });
  const setControlCacheOwner = api.controlSnapshot.setCacheOwner;
  api.controlSnapshot.setCacheOwner = null;

  let caught = null;
  try {
    api.setSystemTableCache(replacementCache);
  } catch (error) {
    caught = error;
  }
  t.match(
    caught?.message,
    /cache owner transition/i,
    'a missing typed participant rejects the owner transition',
  );
  t.equal(
    api.systemTableCache,
    initialCache,
    'a rejected transition leaves the root read owner unchanged',
  );
  t.equal(
    api.controlSnapshot.systemTableCache,
    initialCache,
    'a rejected transition cannot mutate the child through raw fields',
  );

  api.controlSnapshot.setCacheOwner = setControlCacheOwner;
  api.setSystemTableCache(replacementCache);
  await api.shutdown();
});

test('AdminWebSocketAPI cache handoff fences a repair completing inside the ' +
  'reconcile owner', async (t) => {
  initializeTestEnvironment();

  const initialCache = new SystemTableCache();
  const replacementCache = new SystemTableCache();
  const reconcileStarted = createDeferred();
  const releaseReconcile = createDeferred();
  const reconcileOwners = [];
  const gateway = {
    async reconcileAuthoritativeCacheRows(_tableName, _rows, options) {
      reconcileOwners.push({
        cacheMutationTarget: options.cacheMutationTarget,
        systemTableCache: options.systemTableCache,
      });
      if (reconcileOwners.length === 1) {
        reconcileStarted.resolve();
        await releaseReconcile.promise;
      }
      return {
        success: true,
        mutationCount: 0,
        authoritativeObservedAtMs: reconcileOwners.length,
      };
    },
  };
  const api = new AdminWebSocketAPI({
    nodeId: 'admin-cache-owner-reconcile-fence',
    systemTableCache: initialCache,
    cacheMutationTarget: initialCache,
    controlPlaneSystemTableGateway: gateway,
  });
  const discovery = api.serviceDiscovery;
  discovery.canReadAuthoritativeDiscoveryRows = () => true;
  discovery.resolveAuthoritativeDiscoveryRepairTables = () => ['nodes'];
  discovery.readAuthoritativeSystemTableRows = async () => ({
    tableName: 'nodes',
    rows: [],
    authoritativeObservation: {
      scope: 'complete_table',
      observedAtMs: reconcileOwners.length + 1,
    },
  });

  const staleRepair = discovery.ensureAuthoritativeDiscoveryCacheRepair({
    reason: 'cache-owner-reconcile-first',
  });
  await reconcileStarted.promise;
  api.setSystemTableCache(replacementCache);
  releaseReconcile.resolve();

  const staleResult = await staleRepair;
  t.equal(staleResult.staleOwner, true, 'old reconcile completion is fenced');

  const currentResult = await discovery.ensureAuthoritativeDiscoveryCacheRepair({
    reason: 'cache-owner-reconcile-second',
  });
  t.equal(currentResult.applied, true, 'replacement owner repairs afresh');
  t.equal(reconcileOwners.length, 2, 'each owner receives one reconcile');
  t.equal(
    reconcileOwners[0]?.systemTableCache,
    initialCache,
    'the old reconcile retains its captured read owner',
  );
  t.equal(
    reconcileOwners[0]?.cacheMutationTarget,
    initialCache,
    'the old reconcile retains its captured mutation owner',
  );
  t.equal(
    reconcileOwners[1]?.systemTableCache,
    replacementCache,
    'the new reconcile uses the replacement read owner',
  );
  t.equal(
    reconcileOwners[1]?.cacheMutationTarget,
    replacementCache,
    'the new reconcile uses the replacement mutation owner',
  );

  await api.shutdown();
});

test('AdminWebSocketAPI cache handoff clears old-owner repair failure ' +
  'backoff', async (t) => {
  initializeTestEnvironment();

  const initialCache = new SystemTableCache();
  const replacementCache = new SystemTableCache();
  const gateway = {
    async reconcileAuthoritativeCacheRows() {
      return {
        success: true,
        mutationCount: 0,
        authoritativeObservedAtMs: 2,
      };
    },
  };
  const api = new AdminWebSocketAPI({
    nodeId: 'admin-cache-owner-failure-backoff',
    systemTableCache: initialCache,
    cacheMutationTarget: initialCache,
    controlPlaneSystemTableGateway: gateway,
  });
  const discovery = api.serviceDiscovery;
  let readCount = 0;
  discovery.canReadAuthoritativeDiscoveryRows = () => true;
  discovery.resolveAuthoritativeDiscoveryRepairTables = () => ['nodes'];
  discovery.readAuthoritativeSystemTableRows = async () => {
    readCount += 1;
    if (readCount === 1) {
      throw new Error('old owner transport unavailable');
    }
    return {
      tableName: 'nodes',
      rows: [],
      authoritativeObservation: {
        scope: 'complete_table',
        observedAtMs: 2,
      },
    };
  };

  const failedResult = await discovery.ensureAuthoritativeDiscoveryCacheRepair({
    reason: 'cache-owner-failure-first',
  });
  t.equal(failedResult.applied, false, 'the old-owner repair records failure');
  t.ok(
    failedResult.retryAfterMs > 0,
    'the old owner enters a real bounded failure backoff',
  );

  api.setSystemTableCache(replacementCache);
  const currentResult = await discovery.ensureAuthoritativeDiscoveryCacheRepair({
    reason: 'cache-owner-failure-second',
  });

  t.equal(currentResult.applied, true, 'the replacement owner repairs afresh');
  t.equal(currentResult.reused, false, 'old-owner failure is not reused');
  t.equal(readCount, 2, 'the replacement owner is not deferred by old backoff');

  await api.shutdown();
});

test('AdminWebSocketAPI bind conflict on initialize is tagged retryable',
  async (t) => {
    initializeTestEnvironment();

    const holder = new AdminWebSocketAPI({
      nodeId: 'admin-bind-conflict-holder',
    });
    await holder.initialize(0);
    const port = holder.fastify.server.address().port;

    const contender = new AdminWebSocketAPI({
      nodeId: 'admin-bind-conflict-contender',
    });

    let caught = null;
    try {
      await contender.initialize(port);
    } catch (err) {
      caught = err;
    }

    t.ok(caught, 'a port already in use must surface a bind error');
    t.equal(caught.code, 'EADDRINUSE', 'bind conflict reports EADDRINUSE');
    t.equal(
      caught.retryable,
      true,
      'admin bind conflict is tagged retryable so join re-attempts drain the ' +
        'port instead of fatally exiting the node',
    );

    await holder.shutdown();
  });
