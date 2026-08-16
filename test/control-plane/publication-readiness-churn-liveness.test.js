import {test} from '../../src/test-helpers/tap.js';
import {
  COLUMN,
  NODE_STATE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {
  ControlPlaneReadinessService,
  MEMBERSHIP_PUBLICATION_PLANNING_SOURCE,
} from
  '../../src/control-plane/control-plane-readiness-service.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {AuthoritativeControlPlaneView} from
  '../../src/control-plane/authoritative-control-plane-view.js';
import {MembershipPublicationCoordinator} from
  '../../src/control-plane/membership-publication-coordinator.js';
import {ReplicaDispatchService} from
  '../../src/control-plane/replica-dispatch-service.js';
import {HeartbeatService} from
  '../../src/control-plane/heartbeat-service.js';
import {ControlPlaneSnapshotOwner} from
  '../../src/control-plane/control-plane-snapshot-owner.js';
import {NodeLifecycleStateMachine} from
  '../../src/node/node-lifecycle-state-machine.js';
import {StorageCapacityAccountingService} from
  '../../src/rebalancer/storage-capacity-accounting-service.js';
import {executeAuthoritativeOwnerRpcRead} from
  '../../src/cdc/cdc-integration-service-owner-rpc-read-execution.js';
import {INITIAL_PARTITION_IDS} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {RECONCILE_REASON} from
  '../../src/workflow/reconcile-queue-constants.js';
import {
  READINESS_PLANNING_DEPENDENCY_REGISTRY,
  ReadinessPlanningSnapshotOwner,
} from
  '../../src/control-plane/readiness-planning-snapshot-owner.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
  CONTROL_PLANE_READ_PURPOSE,
} from
  '../../src/control-plane/control-plane-readiness-constants.js';

const NOW_MS = 1_780_000_000_000;
const NODE_COUNT = 5;
const PARTITION_ID = 'priority-partition';
const CACHE_KEY_FIELDS = Object.freeze([
  COLUMN.NODE_ID,
  COLUMN.SERVICE_ID,
  'partition_id',
  'operation_id',
  'publication_id',
  'endpoint_id',
  'reservation_id',
]);


test('readiness planning dependency registry is complete and explicit',
  async (t) => {
    t.same(
      READINESS_PLANNING_DEPENDENCY_REGISTRY.versionedInputs,
      [
        'cacheGeneration',
        'membershipOwnerGeneration',
        'nodesOwnerGeneration',
        'servicesOwnerGeneration',
        'messageRouterGeneration',
        'nodeLifecycleStateMachineGeneration',
        'storageAccountingServiceGeneration',
        'cdcIntegrationServiceGeneration',
        'cacheMutationTargetGeneration',
        'cdcGroupPropagationServiceGeneration',
        'heartbeatServiceGeneration',
        'controlPlaneSystemTableGatewayGeneration',
        'authoritativeControlPlaneViewGeneration',
        'localClusterIncarnationFenceProviderGeneration',
        TABLES.NODES,
        TABLES.NODE_ENDPOINTS,
        TABLES.SERVICES,
        TABLES.PARTITIONS,
        TABLES.REPLICA_OPERATIONS,
        TABLES.STORAGE_RESERVATIONS,
        TABLES.CONTROL_PLANE_PUBLICATIONS,
        'readinessSnapshotGeneration',
        'recoveryEpochRevision',
        'transportTopologyGeneration',
        'generationSaturated',
        'perOwnerBuildOptionsKey',
      ],
      'every production builder source has one declared version owner',
    );
    t.same(
      READINESS_PLANNING_DEPENDENCY_REGISTRY.positiveDecisionLiveVetoes,
      [
        'snapshotCaptureAge',
        'readyLeaseExpiry',
        'heartbeatExpiry',
        'localQueryTransportDrift',
        'currentNodeTransportHealth',
        'nodeLifecycleState',
        'storageCapacityPolicy',
        'metadataPublicationMode',
        'heartbeatPublicationState',
      ],
      'unversioned clock and transport inputs have named live vetoes',
    );
  });

test('readiness planning inputs reject hostile data and ignore mutated ' +
  'intrinsics', async (t) => {
  let rows = [
    {[COLUMN.NODE_ID]: 'node-0', [COLUMN.STATUS]: NODE_STATE.ACTIVE},
    {[COLUMN.NODE_ID]: 'node-1', [COLUMN.STATUS]: NODE_STATE.JOINING},
  ];
  const scheduled = [];
  const connectedNodes = new Set(['node-0', 'node-1']);
  const service = {
    nodeId: 'node-0',
    systemTableCache: {getAll: () => rows},
    messageRouter: {
      getConnectedNodes: () => connectedNodes,
      getConnectionState: () => 'connected',
    },
    setTimeoutFn: () => ({unref: () => {}}),
    clearTimeoutFn: () => {},
  };
  const owner = new ReadinessPlanningSnapshotOwner({
    service,
    now: () => NOW_MS,
    scheduleDrainFn: (callback) => scheduled.push(callback),
  });
  const replacementNodesOwner = {listNodes: async () => []};
  const syncReadiness = new ControlPlaneReadinessService({
    nodeId: 'node-0',
    systemTableCache: createProductionShapedCache(),
    readinessPlanningScheduleDrainFn: (callback) => scheduled.push(callback),
  });
  const original = {
    arrayJoin: Array.prototype.join,
    arrayMap: Array.prototype.map,
    arraySort: Array.prototype.sort,
    numberIsFinite: Number.isFinite,
    objectHasOwn: Object.hasOwn,
    setIterator: Set.prototype[Symbol.iterator],
    stringConstructor: globalThis.String,
  };
  let token;
  let ownerKeys;
  const replaceProperty = (target, property, value) =>
    Object.defineProperty(target, property, {
      configurable: true,
      value,
      writable: true,
    });
  try {
    replaceProperty(Array.prototype, 'join', () => {
      throw new Error('hostile join');
    });
    replaceProperty(Array.prototype, 'map', () => {
      throw new Error('hostile map');
    });
    replaceProperty(Array.prototype, 'sort', () => {
      throw new Error('hostile sort');
    });
    replaceProperty(Number, 'isFinite', () => false);
    replaceProperty(Object, 'hasOwn', () => false);
    replaceProperty(Set.prototype, Symbol.iterator, () => {
      throw new Error('hostile iterator');
    });
    globalThis.String = () => {
      throw new Error('hostile String');
    };
    token = owner.captureToken();
    ownerKeys = owner.listOwnerKeys();
    syncReadiness.syncOwnerDependencies({nodesOwner: replacementNodesOwner});
  } finally {
    replaceProperty(Array.prototype, 'join', original.arrayJoin);
    replaceProperty(Array.prototype, 'map', original.arrayMap);
    replaceProperty(Array.prototype, 'sort', original.arraySort);
    replaceProperty(Number, 'isFinite', original.numberIsFinite);
    replaceProperty(Object, 'hasOwn', original.objectHasOwn);
    replaceProperty(Set.prototype, Symbol.iterator, original.setIterator);
    globalThis.String = original.stringConstructor;
  }
  t.type(token.tokenKey, 'string',
    'token construction uses captured intrinsics and non-iterating Set reads');
  t.same(ownerKeys, ['node-1', 'node-0'],
    'valid own-data rows retain formation priority under intrinsic mutation');
  t.equal(syncReadiness.nodesOwner, replacementNodesOwner,
    'injected-owner replacement uses captured own-property admission');
  const inheritedReplacement = Object.create({
    servicesOwner: {listServices: async () => []},
  });
  syncReadiness.syncOwnerDependencies(inheritedReplacement);
  t.equal(syncReadiness.servicesOwner, null,
    'inherited replacement fields are rejected');

  let accessorReads = 0;
  const accessorRow = {};
  Object.defineProperty(accessorRow, COLUMN.NODE_ID, {
    enumerable: true,
    get: () => {
      accessorReads++;
      return 'polluted-node';
    },
  });
  rows = [accessorRow];
  t.same(owner.listOwnerKeys(), ['node-0'],
    'accessor rows fail closed to the trusted local owner');
  t.equal(accessorReads, 0, 'hostile row accessors are never invoked');
  rows = new Proxy([], {
    getOwnPropertyDescriptor: () => {
      throw new Error('hostile descriptor');
    },
  });
  t.same(owner.listOwnerKeys(), ['node-0'],
    'proxy arrays fail closed without escaping the owner boundary');

  owner.tableRevisions[TABLES.NODES] = Number.MAX_SAFE_INTEGER;
  owner.recordTableChange(TABLES.NODES);
  const saturated = owner.readSync('node-0', {}, () => ({
    dimensions: {membershipPublicationReady: true},
    reasons: [],
  }));
  t.equal(saturated.readinessPlanningTokenStatus, 'stale',
    'generation saturation can only defer rather than publish stale-positive');
  owner.shutdown();
  syncReadiness.shutdownReadinessPlanningOwner();
});

function createProductionShapedCache() {
  const rowsByTable = new Map(Object.values(TABLES).map((table) => [
    table,
    new Map(),
  ]));
  const listeners = new Set();
  const keyFor = (table, row) => {
    const field = CACHE_KEY_FIELDS.find((candidate) => row?.[candidate]);
    return String(field ? row[field] :
      `${table}:${rowsByTable.get(table)?.size || 0}`);
  };
  const cache = {
    get: (table, key) => rowsByTable.get(table)?.get(String(key)) || null,
    getAll: (table) => [...(rowsByTable.get(table)?.values() || [])],
    filter(table, predicate) {
      return cache.getAll(table).filter(predicate);
    },
    applySystemTableChange(table, operation, row) {
      const rows = rowsByTable.get(table);
      const key = keyFor(table, row);
      if (String(operation).toUpperCase() === 'DELETE') rows?.delete(key);
      else rows?.set(key, Object.freeze({...rows?.get(key), ...row}));
      for (const listener of listeners) listener(table, operation, row, null);
    },
    onCacheChange: (listener) => listeners.add(listener),
    offCacheChange: (listener) => listeners.delete(listener),
  };
  for (let index = 0; index < NODE_COUNT; index++) {
    const nodeId = `node-${index}`;
    cache.applySystemTableChange(TABLES.NODES, 'INSERT', {
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.LAST_HEARTBEAT]: NOW_MS,
      [COLUMN.READY_LEASE_EXPIRES_AT]: NOW_MS + 60_000,
      connection_state: 'ready',
    });
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      [COLUMN.SERVICE_ID]: `service-${index}`,
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: `${nodeId}/partition/${PARTITION_ID}`,
      partition_id: PARTITION_ID,
      raft_role: index === 0 ? 'leader' : 'follower',
    });
  }
  cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
    partition_id: PARTITION_ID,
    table_name: TABLES.NODES,
    leader_node_id: 'node-0',
  });
  return cache;
}

function churnRow(table, revision) {
  const common = {revision, updated_at: NOW_MS + revision};
  if (table === TABLES.NODES) {
    return {...common, node_id: `node-${revision % NODE_COUNT}`};
  }
  if (table === TABLES.NODE_ENDPOINTS) {
    return {...common, endpoint_id: 'endpoint-0', node_id: 'node-0'};
  }
  if (table === TABLES.SERVICES) {
    return {...common, service_id: 'service-0', node_id: 'node-0'};
  }
  if (table === TABLES.PARTITIONS) {
    return {...common, partition_id: PARTITION_ID};
  }
  if (table === TABLES.REPLICA_OPERATIONS) {
    return {...common, operation_id: 'operation-0'};
  }
  if (table === TABLES.STORAGE_RESERVATIONS) {
    return {...common, reservation_id: 'reservation-0'};
  }
  return {...common, publication_id: 'publication-0'};
}

test('readiness churn never performs heavy builds from routing callers',
  async (t) => {
    const cache = createProductionShapedCache();
    const readiness = new ControlPlaneReadinessService({
      nodeId: 'node-0',
      systemTableCache: cache,
      now: () => NOW_MS,
      messageRouter: {
        getConnectionState: () => 'connected',
        getConnectedNodes: () => new Set(
          Array.from({length: NODE_COUNT}, (_, index) => `node-${index}`),
        ),
      },
    });
    const executor = new QueryExecutor({
      nodeId: 'node-0',
      systemCache: cache,
      controlPlaneReadinessService: readiness,
    });
    let heavyBuilds = 0;
    const originalBuild = readiness.buildEvaluatedNodeReadinessSnapshot;
    readiness.buildEvaluatedNodeReadinessSnapshot = function(...args) {
      heavyBuilds++;
      return originalBuild.apply(this, args);
    };

    for (let index = 0; index < NODE_COUNT; index++) {
      readiness.getNodeReadinessSync(`node-${index}`);
    }
    const warmBuilds = heavyBuilds;
    t.equal(warmBuilds, 1, 'cold start permits one bounded bootstrap build');
    const semanticTables = [
      TABLES.NODES,
      TABLES.NODE_ENDPOINTS,
      TABLES.SERVICES,
      TABLES.PARTITIONS,
      TABLES.REPLICA_OPERATIONS,
      TABLES.STORAGE_RESERVATIONS,
      TABLES.CONTROL_PLANE_PUBLICATIONS,
    ];
    for (let revision = 1; revision <= semanticTables.length * 3; revision++) {
      const table = semanticTables[(revision - 1) % semanticTables.length];
      cache.applySystemTableChange(table, 'UPDATE', churnRow(table, revision));
      executor.getPartitionRoutingSnapshot(PARTITION_ID);
    }

    t.equal(
      heavyBuilds,
      warmBuilds,
      'cache churn only marks the planning owner dirty; routing never rebuilds',
    );
    t.ok(
      readiness.getReadinessPlanningDiagnostics().pendingOwnerKeys.length > 0,
      'the latest semantic vector remains queued for bounded background work',
    );
    readiness.shutdownReadinessPlanningOwner();
  });

test('bootstrap routing consumes deferred readiness only with structural ' +
  'row and transport witnesses', async (t) => {
  const partitionId = 'nodes-bootstrap-p1';
  const nodeId = 'node-bootstrap';
  const nodeRow = {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STATUS]: NODE_STATE.ACTIVE,
    [COLUMN.LAST_HEARTBEAT]: NOW_MS,
    [COLUMN.READY_LEASE_EXPIRES_AT]: NOW_MS + 60_000,
    connection_state: 'ready',
  };
  const partitionRow = {
    partition_id: partitionId,
    table_name: TABLES.NODES,
    leader_node_id: null,
    created_at: NOW_MS,
    updated_at: NOW_MS,
  };
  const serviceRow = {
    [COLUMN.SERVICE_ID]: 'nodes-bootstrap-r1',
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: `${nodeId}/partition/nodes-bootstrap-r1`,
    partition_id: partitionId,
    raft_role: 'leader',
  };
  let connected = true;
  let visibleNodeRow = nodeRow;
  const systemCache = {
    get(table, key) {
      return table === TABLES.PARTITIONS && key === partitionId ?
        partitionRow :
        null;
    },
    filter(table, predicate) {
      const rows = table === TABLES.SERVICES ? [serviceRow] : [];
      return rows.filter(predicate);
    },
  };
  const readinessService = {
    getNodeReadinessSync() {
      return {
        nodeId,
        dimensions: Object.freeze({}),
        reasons: [
          CONTROL_PLANE_READINESS_REASON.PLANNING_SNAPSHOT_REFRESH_PENDING,
        ],
      };
    },
    getNodeRow() {
      return visibleNodeRow;
    },
    getNodeTransportState() {
      return {connected};
    },
  };
  const executor = new QueryExecutor({
    nodeId: 'node-local',
    systemCache,
    controlPlaneReadinessService: readinessService,
    messageRouter: {getConnectionState: () => 'connected'},
  });
  const ordinaryCandidates = () => executor.getPartitionServiceCandidates(
    partitionId,
    true,
    false,
    false,
    CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
  );

  const internalCandidates = () => executor.resolvePartitionServiceCandidates(
    partitionId,
    true,
    false,
    false,
    CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
    {readPurpose: CONTROL_PLANE_READ_PURPOSE.READINESS_INTERNAL},
  ).candidates;

  t.equal(ordinaryCandidates().length, 0,
    'ordinary reads cannot bypass a stale readiness decision');
  t.equal(internalCandidates().length, 1,
    'only readiness-internal reads use the structural route');
  connected = false;
  t.equal(internalCandidates().length, 0,
    'transport loss closes the deferred bootstrap route');
  connected = true;
  visibleNodeRow = null;
  t.equal(internalCandidates().length, 0,
    'node deletion closes the deferred bootstrap route');
});

test('versioned readiness owner is latest-wins, fair, and macrotask bounded',
  async (t) => {
    const cache = createProductionShapedCache();
    const scheduled = [];
    let nowMs = NOW_MS;
    let timerSentinel = 0;
    let transportState = 'connected';
    const readiness = new ControlPlaneReadinessService({
      nodeId: 'node-0',
      systemTableCache: cache,
      now: () => nowMs,
      readinessPlanningScheduleDrainFn: (callback) => scheduled.push(callback),
      messageRouter: {
        getConnectionState: () => transportState,
        getConnectedNodes: () => new Set(
          Array.from({length: NODE_COUNT}, (_, index) => `node-${index}`),
        ),
      },
    });
    const publishedOwnerKeys = [];
    const unsubscribe = readiness.subscribeReadinessPlanningSnapshots(
      ({ownerKey}) => publishedOwnerKeys.push(ownerKey),
    );
    for (let index = 0; index < NODE_COUNT; index++) {
      readiness.getNodeReadinessSync(`node-${index}`);
    }
    const buildsByTurn = [];
    const semanticTables = [
      TABLES.NODES,
      TABLES.NODE_ENDPOINTS,
      TABLES.SERVICES,
      TABLES.PARTITIONS,
      TABLES.REPLICA_OPERATIONS,
      TABLES.STORAGE_RESERVATIONS,
      TABLES.CONTROL_PLANE_PUBLICATIONS,
    ];
    for (let revision = 1; revision <= 24; revision++) {
      const table = semanticTables[(revision - 1) % semanticTables.length];
      cache.applySystemTableChange(table, 'UPDATE', churnRow(table, revision));
    }
    t.equal(scheduled.length, 1, 'a mutation burst schedules one macrotask');

    while (scheduled.length > 0) {
      const before = readiness.getReadinessPlanningDiagnostics().buildCount;
      const runTurn = scheduled.shift();
      timerSentinel++;
      runTurn();
      await Promise.resolve();
      await Promise.resolve();
      const after = readiness.getReadinessPlanningDiagnostics().buildCount;
      buildsByTurn.push(after - before);
    }
    const diagnostics = readiness.getReadinessPlanningDiagnostics();
    t.ok(
      buildsByTurn.every((count) => count <= 1),
      'each macrotask executes at most one heavy planning build globally',
    );
    t.equal(
      timerSentinel,
      diagnostics.buildCount,
      'the timer sentinel advances between every heavy item',
    );
    t.same(
      new Set(diagnostics.buildOwnerKeys),
      new Set(Array.from({length: NODE_COUNT}, (_, index) => `node-${index}`)),
      'every persistently dirty owner receives one round-robin build turn',
    );
    t.same(
      new Set(publishedOwnerKeys),
      new Set(Array.from({length: NODE_COUNT}, (_, index) => `node-${index}`)),
      'each completed owner turn emits an independent consumer wake',
    );
    t.ok(
      Object.values(diagnostics.completedTokenStatusByOwnerKey)
        .every((status) => status === 'current'),
      'quiescence publishes the final semantic token for every owner',
    );

    const finalSnapshot = readiness.getNodeReadinessSync('node-0');
    const reference = new ControlPlaneReadinessService({
      nodeId: 'node-0',
      systemTableCache: cache,
      now: () => nowMs,
      messageRouter: readiness.messageRouter,
    });
    const referenceSnapshot = reference.getNodeReadinessSync('node-0');
    t.same(
      finalSnapshot.dimensions,
      referenceSnapshot.dimensions,
      'final completed-token decisions equal a fresh one-shot build',
    );
    t.same(
      finalSnapshot.reasons,
      referenceSnapshot.reasons,
      'final completed-token reason codes equal a fresh one-shot build',
    );

    transportState = 'disconnected';
    const transportVetoed = readiness.getNodeReadinessSync('node-1');
    t.equal(
      transportVetoed.dimensions.serveEligible,
      false,
      'current transport-health drift vetoes a completed positive snapshot',
    );
    transportState = 'connected';
    while (scheduled.length > 0) {
      scheduled.shift()();
      await Promise.resolve();
      await Promise.resolve();
    }
    const transportRecovered = readiness.getNodeReadinessSync('node-1');
    t.equal(
      transportRecovered.dimensions.clusterMemberHealthy,
      true,
      'the same owner queue republishes remote health after reconnection',
    );
    t.equal(
      transportRecovered.readinessPlanningTokenStatus,
      undefined,
      'reconnection recovery returns the current owner snapshot, not deferral',
    );

    nowMs += 61_000;
    const expired = readiness.getNodeReadinessSync('node-0');
    t.equal(
      expired.dimensions.serveEligible,
      false,
      'clock-derived expiry is a live veto against stale-positive readiness',
    );
    t.ok(
      expired.reasons.some((reason) =>
        reason?.code === 'planning_snapshot_refresh_pending'),
      'the stale result carries an explicit refresh-pending reason',
    );
    unsubscribe();
    readiness.shutdownReadinessPlanningOwner();
    reference.shutdownReadinessPlanningOwner();
  });

test('full production-composition storm closes cache, owner-RPC, dependency, ' +
  'and replacement interactions in one fair drain', async (t) => {
  let activeCache = createProductionShapedCache();
  const ownerPartitionId = INITIAL_PARTITION_IDS[TABLES.NODES];
  const installOwnerRoute = (cache) => {
    cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
      partition_id: ownerPartitionId,
      table_name: TABLES.NODES,
      leader_node_id: 'node-0',
    });
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      [COLUMN.SERVICE_ID]: 'nodes-owner-r1',
      replica_id: 'nodes-owner-r1',
      [COLUMN.NODE_ID]: 'node-0',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: `node-0/partition/${ownerPartitionId}`,
      partition_id: ownerPartitionId,
      raft_role: 'leader',
    });
  };
  installOwnerRoute(activeCache);
  const scheduled = [];
  let transportState = 'connected';
  let publicationMode = 'grouped';
  const storageOwner = new StorageCapacityAccountingService({
    systemTableCache: activeCache,
  });
  const lifecycleOwner = new NodeLifecycleStateMachine({
    nodeId: 'node-0',
    initialState: NODE_STATE.ACTIVE,
    now: () => NOW_MS,
  });
  const publicationOwner = {
    getPublicationModeDiagnostics: () => ({
      currentMode: publicationMode,
      reasonCode: publicationMode === 'grouped' ? 'healthy' : 'degraded',
    }),
  };
  const heartbeatOwner = new HeartbeatService({
    nodeId: 'node-0',
    nodeAddress: 'node-0:8080',
    systemTableCache: activeCache,
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    nodeStateReporter: async () => ({
      publicationPath: 'node_state_reporter',
      targetNodeId: 'node-0',
    }),
    now: () => NOW_MS,
  });
  heartbeatOwner.lastHeartbeatPublicationDecision = {publicationMode: 'grouped'};
  heartbeatOwner.heartbeatPublicationDiagnostics.lastSuccessAt =
    new Date(NOW_MS).toISOString();
  heartbeatOwner.heartbeatPublicationDiagnostics.publicationPath =
    'node_state_reporter';
  const messageRouter = {
    getConnectedNodes: () =>
      Array.from({length: NODE_COUNT}, (_, index) => `node-${index}`),
    getConnectionState: () => transportState,
    async deliver() {
      return {
        acknowledged: true,
        success: true,
        rows: activeCache.getAll(TABLES.NODES),
      };
    },
  };
  let cdcIntegrationService = null;
  let internalRpcActive = false;
  const readiness = new ControlPlaneReadinessService({
    nodeId: 'node-0',
    systemTableCache: activeCache,
    now: () => NOW_MS,
    readinessPlanningScheduleDrainFn: (callback) => scheduled.push(callback),
    messageRouter,
    nodeLifecycleStateMachine: lifecycleOwner,
    storageAccountingService: storageOwner,
    cdcGroupPropagationService: publicationOwner,
    heartbeatService: heartbeatOwner,
  });
  const executor = new QueryExecutor({
    nodeId: 'node-0',
    systemCache: activeCache,
    controlPlaneReadinessService: readiness,
    messageRouter,
  });
  executor.readRetryAttempts = 1;
  const ownerRpcService = {
    nodeId: 'node-0',
    logger: {info: () => {}, warn: () => {}, error: () => {}},
    sqlQueryEngine: {queryExecutor: executor},
  };
  let internalOwnerReadCount = 0;
  cdcIntegrationService = {
    async executeAuthoritativeSystemTableRead(table, sql, params, options) {
      if (options.readAuthority?.purpose ===
          CONTROL_PLANE_READ_PURPOSE.READINESS_INTERNAL) {
        internalOwnerReadCount++;
        internalRpcActive = true;
      }
      try {
        return await executeAuthoritativeOwnerRpcRead(
          ownerRpcService,
          table,
          sql,
          params,
          options,
          {},
        );
      } finally {
        internalRpcActive = false;
      }
    },
  };
  const view = new AuthoritativeControlPlaneView({
    nodeId: 'node-0',
    cdcIntegrationService,
    messageRouter,
    pressureGovernor: {
      configure: () => {},
      admit: async () => ({action: 'admit'}),
    },
    now: () => NOW_MS,
  });
  const membershipOwner = new MembershipPublicationCoordinator({
    nodeId: 'node-0',
    systemTableCache: activeCache,
    cdcIntegrationService,
    authoritativeControlPlaneView: view,
    controlPlaneReadinessService: readiness,
    now: () => NOW_MS,
  });
  readiness.syncOwnerDependencies({
    cdcIntegrationService,
    membershipPublicationService: membershipOwner,
  });
  const dispatchService = new ReplicaDispatchService({
    nodeId: 'node-0',
    messageRouter,
    cdcIntegrationService,
    systemTableCache: activeCache,
    controlPlaneReadinessService: readiness,
    storageAccountingService: storageOwner,
    cdcGroupPropagationService: publicationOwner,
    rebalanceCoordinator: {
      executeOperation: async () => ({success: true}),
    },
  });
  let dispatchCompletionWakeCount = 0;
  const publishedCompletionKeys = new Set();
  const unsubscribeCompletionWitness =
    readiness.subscribeReadinessPlanningSnapshots((event) => {
      const ownerKey = event?.ownerKey || '';
      const tokenKey = event?.capturedToken?.tokenKey || '';
      publishedCompletionKeys.add(
        `${ownerKey.length}:${ownerKey}${tokenKey.length}:${tokenKey}`,
      );
    });
  const originalReadyDispatch =
    dispatchService.retryPendingDispatchesForReadyNode.bind(dispatchService);
  dispatchService.retryPendingDispatchesForReadyNode = async (options) => {
    if (options?.source ===
      RECONCILE_REASON.READINESS_PLANNING_SNAPSHOT_PUBLISHED) {
      dispatchCompletionWakeCount++;
    }
    return originalReadyDispatch(options);
  };
  dispatchService.initialize();
  const snapshotOwner = new ControlPlaneSnapshotOwner({
    controlSnapshot: {
      evaluateAuthoritativeControlSnapshotRepair: () => ({
        shouldRepair: false,
        reasonCodes: [],
      }),
    },
  });
  let recursionDepth = 0;
  let maxRecursionDepth = 0;
  const originalParticipation = readiness.getControlPlaneParticipationSync;
  readiness.getControlPlaneParticipationSync = function(...args) {
    recursionDepth++;
    if (internalRpcActive) {
      maxRecursionDepth = Math.max(maxRecursionDepth, recursionDepth);
    }
    try {
      return originalParticipation.apply(this, args);
    } finally {
      recursionDepth--;
    }
  };
  readiness.getNodeReadinessSync('node-0');
  const semanticTables = [
    TABLES.NODES,
    TABLES.NODE_ENDPOINTS,
    TABLES.SERVICES,
    TABLES.PARTITIONS,
    TABLES.REPLICA_OPERATIONS,
    TABLES.STORAGE_RESERVATIONS,
    TABLES.CONTROL_PLANE_PUBLICATIONS,
  ];
  let timerTicks = 0;
  const buildsByTurn = [];
  for (let revision = 1; revision <= semanticTables.length; revision++) {
    const table = semanticTables[revision - 1];
    activeCache.applySystemTableChange(table, 'UPDATE', churnRow(table, revision));
    const rows = await membershipOwner.readTableRows(TABLES.NODES, {
      preferAuthoritativeRead: true,
      readPurpose: CONTROL_PLANE_READ_PURPOSE.READINESS_INTERNAL,
    });
    t.ok(rows.length >= NODE_COUNT,
      `${table} churn traverses the production internal owner-RPC chain`);
    if (scheduled.length > 0) {
      const before = readiness.getReadinessPlanningDiagnostics().buildCount;
      const timerProgress = new Promise((resolve) => {
        setTimeout(() => {
          timerTicks++;
          resolve();
        }, 0);
      });
      scheduled.shift()();
      await timerProgress;
      await Promise.resolve();
      await Promise.resolve();
      buildsByTurn.push(
        readiness.getReadinessPlanningDiagnostics().buildCount - before,
      );
    }
  }

  const replacementLifecycleOwner = new NodeLifecycleStateMachine({
    nodeId: 'node-0',
    initialState: NODE_STATE.JOINING,
    now: () => NOW_MS,
  });
  publicationMode = 'repair_only';
  storageOwner.hardPressurePercent = 0.85;
  heartbeatOwner.heartbeatPublicationDiagnostics.lastSuccessAt =
    new Date(NOW_MS - 1).toISOString();
  readiness.getNodeReadinessSync('node-0');
  readiness.recordReadinessPlanningSnapshotChange('node-0');
  readiness.recordReadinessPlanningRecoveryEpochChange('node-0');
  readiness.syncOwnerDependencies({
    nodeLifecycleStateMachine: replacementLifecycleOwner,
    storageAccountingService: new StorageCapacityAccountingService({
      systemTableCache: activeCache,
    }),
    cdcGroupPropagationService: {...publicationOwner},
    heartbeatService: new HeartbeatService({
      nodeId: 'node-0',
      nodeAddress: 'node-0:8080',
      systemTableCache: activeCache,
      cdcIntegrationService,
      nodeStateReporter: async () => ({
        publicationPath: 'node_state_reporter',
        targetNodeId: 'node-0',
      }),
      now: () => NOW_MS,
    }),
    messageRouter: {...messageRouter},
    cdcIntegrationService: {...cdcIntegrationService},
  });

  const replacementCache = createProductionShapedCache();
  installOwnerRoute(replacementCache);
  activeCache = replacementCache;
  readiness.syncOwnerDependencies({systemTableCache: replacementCache});
  executor.systemCache = replacementCache;
  membershipOwner.systemTableCache = replacementCache;
  transportState = 'disconnected';
  const transportVeto = readiness.getNodeReadinessSync('node-1');
  t.equal(transportVeto.readinessPlanningTokenStatus, 'stale',
    'transport drift vetoes the pre-replacement completion synchronously');
  transportState = 'connected';

  while (scheduled.length > 0) {
    const before = readiness.getReadinessPlanningDiagnostics().buildCount;
    const timerProgress = new Promise((resolve) => {
      setTimeout(() => {
        timerTicks++;
        resolve();
      }, 0);
    });
    scheduled.shift()();
    await timerProgress;
    await Promise.resolve();
    await Promise.resolve();
    buildsByTurn.push(
      readiness.getReadinessPlanningDiagnostics().buildCount - before,
    );
  }
  for (let pass = 0; pass < 3; pass++) {
    await new Promise((resolve) => setImmediate(resolve));
    while (scheduled.length > 0) {
      const before = readiness.getReadinessPlanningDiagnostics().buildCount;
      const timerProgress = new Promise((resolve) => {
        setTimeout(() => {
          timerTicks++;
          resolve();
        }, 0);
      });
      scheduled.shift()();
      await timerProgress;
      await Promise.resolve();
      await Promise.resolve();
      buildsByTurn.push(
        readiness.getReadinessPlanningDiagnostics().buildCount - before,
      );
    }
  }
  const diagnostics = readiness.getReadinessPlanningDiagnostics();
  const finalBuildOptionsKey = readiness.readinessPlanningSnapshotOwner
    .captureBuildOptionsKey('node-0', {});
  const completedBeforeFinal = readiness.readinessPlanningSnapshotOwner
    .readCompleted('node-0', finalBuildOptionsKey);
  t.equal(
    completedBeforeFinal.capturedToken.tokenKey,
    diagnostics.currentToken.tokenKey,
    'the final owner completion is bound to the quiescent semantic token',
  );
  t.equal(
    completedBeforeFinal.positiveDecisionLiveVeto,
    readiness.readinessPlanningSnapshotOwner.capturePositiveDecisionLiveVeto(
      'node-0',
      completedBeforeFinal.snapshot,
      completedBeforeFinal.completedAtMs,
    ),
    'the final positive decision has no unobserved live-veto drift',
  );
  t.equal(
    completedBeforeFinal.buildOptionsKey,
    finalBuildOptionsKey,
    'the final completion is reusable by the ordinary public read contract',
  );
  const finalSnapshot = readiness.getNodeReadinessSync('node-0');
  const freshOwner = new ControlPlaneReadinessService({
    nodeId: 'node-0',
    systemTableCache: activeCache,
    now: () => NOW_MS,
    messageRouter: readiness.messageRouter,
    nodeLifecycleStateMachine: readiness.nodeLifecycleStateMachine,
    storageAccountingService: readiness.storageAccountingService,
    cdcIntegrationService: readiness.cdcIntegrationService,
    cdcGroupPropagationService: readiness.cdcGroupPropagationService,
    heartbeatService: readiness.heartbeatService,
    membershipPublicationService: membershipOwner,
    authoritativeControlPlaneView: readiness.getAuthoritativeControlPlaneView(),
  });
  const freshReference = freshOwner.buildNodeReadinessSyncCurrent('node-0', {
    readinessPlanningOwnerBuild: true,
  });
  const snapshotObservation = await snapshotOwner.resolveControlSnapshot({
    snapshotRevision: diagnostics.currentToken.readinessSnapshotGeneration,
    snapshotResumeToken: diagnostics.currentToken.tokenKey,
  });
  t.ok(internalOwnerReadCount >= semanticTables.length,
    'every storm leg engages the internal owner-RPC route');
  t.equal(maxRecursionDepth, 0,
    'the full internal production chain never re-enters readiness routing');
  t.ok(buildsByTurn.every((count) => count <= 1),
    'one global heavy build is preserved across the coupled storm');
  t.ok(timerTicks >= diagnostics.buildCount,
    'an independent platform timer progresses around every background build');
  t.equal(
    dispatchCompletionWakeCount,
    publishedCompletionKeys.size,
    'real dispatch replay consumes each unique readiness completion once',
  );
  t.equal(
    readiness.heartbeatService.getHeartbeatPublicationDiagnostics()
      .publicationPath,
    null,
    'the replacement is a real heartbeat owner with production diagnostics',
  );
  t.equal(snapshotObservation.snapshotObservation.state, 'fresh',
    'the real snapshot owner observes the quiescent readiness revision');
  const {
    recentTransitions: finalTransitionHistory,
    ...finalDecisionState
  } = finalSnapshot;
  const {
    recentTransitions: _freshTransitionHistory,
    ...freshDecisionState
  } = freshReference;
  t.ok(finalTransitionHistory.length > 0,
    'the production owner retains its bounded transition history');
  t.same(finalDecisionState, freshDecisionState,
    'all quiescent public decision state equals a separately built fresh owner');
  unsubscribeCompletionWitness();
  dispatchService.stop();
  freshOwner.shutdownReadinessPlanningOwner();
  readiness.shutdownReadinessPlanningOwner();
  membershipOwner.shutdown?.();
});

test('mid-build changes and identical-counter owner swaps cannot publish fresh',
  async (t) => {
    const cache = createProductionShapedCache();
    const scheduled = [];
    const connectedNodeIds = new Set();
    const readiness = new ControlPlaneReadinessService({
      nodeId: 'node-0',
      systemTableCache: cache,
      now: () => NOW_MS,
      readinessPlanningScheduleDrainFn: (callback) => scheduled.push(callback),
      messageRouter: {
        getConnectionState: () => 'connected',
        getConnectedNodes: () => connectedNodeIds,
      },
    });
    readiness.getNodeReadinessSync('node-0');
    const before = readiness.getReadinessPlanningDiagnostics().currentToken;
    cache.applySystemTableChange(
      TABLES.CONTROL_PLANE_PUBLICATIONS,
      'UPDATE',
      churnRow(TABLES.CONTROL_PLANE_PUBLICATIONS, 30),
    );
    const originalBuild = readiness.buildNodeReadinessSyncCurrent;
    let injectMidBuildChange = true;
    readiness.buildNodeReadinessSyncCurrent = function(...args) {
      const snapshot = originalBuild.apply(this, args);
      if (injectMidBuildChange) {
        injectMidBuildChange = false;
        cache.applySystemTableChange(
          TABLES.REPLICA_OPERATIONS,
          'UPDATE',
          churnRow(TABLES.REPLICA_OPERATIONS, 31),
        );
      }
      return snapshot;
    };

    scheduled.shift()();
    await Promise.resolve();
    await Promise.resolve();
    t.equal(
      readiness.getReadinessPlanningDiagnostics()
        .completedTokenStatusByOwnerKey['node-0'],
      'stale',
      'a token advance during build marks that completion stale',
    );
    while (scheduled.length > 0) {
      scheduled.shift()();
      await Promise.resolve();
      await Promise.resolve();
    }
    t.equal(
      readiness.getReadinessPlanningDiagnostics()
        .completedTokenStatusByOwnerKey['node-0'],
      'current',
      'one later macrotask completes the final quiescent token',
    );

    const replacementCache = createProductionShapedCache();
    replacementCache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
      [COLUMN.NODE_ID]: 'node-1',
      [COLUMN.STATUS]: NODE_STATE.JOINING,
    });
    readiness.syncOwnerDependencies({systemTableCache: replacementCache});
    readiness.syncOwnerDependencies({membershipPublicationService: {
      getLatestClusterPublicationSync: () => null,
    }});
    await readiness.getNodeReadiness('node-1');
    connectedNodeIds.add('node-1');
    const after = readiness.getReadinessPlanningDiagnostics().currentToken;
    t.not(
      after.tokenKey,
      before.tokenKey,
      'cache/owner identity and non-table generations are part of the token',
    );
    t.equal(after.cacheGeneration, before.cacheGeneration + 1);
    t.equal(
      after.membershipOwnerGeneration,
      before.membershipOwnerGeneration + 1,
    );
    t.equal(
      after.readinessSnapshotGeneration,
      before.readinessSnapshotGeneration + 1,
    );
    t.equal(after.recoveryEpochRevision, before.recoveryEpochRevision + 1);
    t.equal(
      after.transportTopologyGeneration,
      before.transportTopologyGeneration + 1,
    );
    let replacementGatewayCalls = 0;
    const replacementMutationTarget = {};
    const replacementGateway = {
      reconcileAuthoritativeCacheRows: async (
        _tableName,
        _rows,
        options,
      ) => {
        replacementGatewayCalls++;
        t.equal(
          options.cacheMutationTarget,
          replacementMutationTarget,
          'the reconciler invokes the replacement cache mutation target',
        );
        return {mutationCount: 0};
      },
    };
    const replacementDependencies = {
      nodesOwner: {listNodes: async () => []},
      servicesOwner: {listServices: async () => []},
      messageRouter: {
        getConnectionState: () => 'connected',
        getConnectedNodes: () => new Set(['node-1']),
      },
      nodeLifecycleStateMachine: {getState: () => NODE_STATE.ACTIVE},
      storageAccountingService: {getCapacitySnapshotForNodeSync: () => null},
      cdcIntegrationService: {},
      cacheMutationTarget: replacementMutationTarget,
      cdcGroupPropagationService: {
        getPublicationModeDiagnostics: () => ({
          currentMode: 'grouped',
          reasonCode: 'healthy',
        }),
      },
      heartbeatService: {
        getHeartbeatPublicationDiagnostics: () => ({
          publicationPath: 'node_state_reporter',
        }),
      },
      controlPlaneSystemTableGateway: replacementGateway,
      authoritativeControlPlaneView: {
        syncOwnerDependencies: () => {},
        readNodeSnapshot: async () => null,
      },
      localClusterIncarnationFenceProvider: () => null,
    };
    readiness.syncOwnerDependencies(replacementDependencies);
    const dependencyToken =
      readiness.getReadinessPlanningDiagnostics().currentToken;
    for (const ownerName of Object.keys(replacementDependencies)) {
      t.equal(
        dependencyToken.ownerDependencyGenerations[ownerName],
        after.ownerDependencyGenerations[ownerName] + 1,
        `${ownerName} replacement advances its semantic generation`,
      );
    }
    await readiness.authoritativeNodeEvidenceReconciler.applyAuthoritativeRows(
      TABLES.NODES,
      {rows: []},
      [],
      'replacement-owner-proof',
      'refresh_evidence',
    );
    t.equal(
      replacementGatewayCalls,
      1,
      'the already-constructed reconciler invokes the replacement gateway',
    );
    readiness.shutdownReadinessPlanningOwner();
  });

test('mutable lifecycle, capacity, CDC, and heartbeat inputs veto completed ' +
  'snapshots before background rebuild', async (t) => {
  const cache = createProductionShapedCache();
  const scheduled = [];
  let lifecycleState = NODE_STATE.ACTIVE;
  let hardPressurePercent = 0.9;
  let publicationMode = 'grouped';
  let heartbeatSuccessAt = new Date(NOW_MS).toISOString();
  const storageAccountingService = {
    softPressurePercent: 0.8,
    hardPressurePercent,
    minimumReplicaBytes: 1,
    partitionReplicaOverheadBytes: 1,
    messageGroupReplicaOverheadBytes: 1,
    serviceReplicaOverheadBytes: 1,
    getCapacitySnapshotForNodeSync: () => null,
  };
  const cdcGroupPropagationService = {
    getPublicationModeDiagnostics: () => ({
      currentMode: publicationMode,
      reasonCode: publicationMode === 'grouped' ? 'healthy' : 'degraded',
    }),
  };
  let heartbeatPublicationPath = 'node_state_reporter';
  const heartbeatService = {
    lastHeartbeatPublicationDecision: {publicationMode: 'grouped'},
    getHeartbeatPublicationDiagnostics: () => ({
      publicationPath: heartbeatPublicationPath,
      lastSuccessAt: heartbeatSuccessAt,
      consecutiveFailures: 0,
    }),
  };
  const readiness = new ControlPlaneReadinessService({
    nodeId: 'node-0',
    systemTableCache: cache,
    now: () => NOW_MS,
    readinessPlanningScheduleDrainFn: (callback) => scheduled.push(callback),
    nodeLifecycleStateMachine: {getState: () => lifecycleState},
    storageAccountingService,
    cdcGroupPropagationService,
    heartbeatService,
    messageRouter: {
      getConnectionState: () => 'connected',
      getConnectedNodes: () => new Set(['node-0']),
    },
  });
  readiness.getNodeReadinessSync('node-0');
  const assertLiveVeto = (message) => {
    const snapshot = readiness.getNodeReadinessSync('node-0');
    t.equal(snapshot.readinessPlanningTokenStatus, 'stale', message);
  };
  const drain = async () => {
    while (scheduled.length > 0) {
      scheduled.shift()();
      await Promise.resolve();
      await Promise.resolve();
    }
  };

  lifecycleState = NODE_STATE.JOINING;
  assertLiveVeto('lifecycle state drift fails closed synchronously');
  await drain();
  lifecycleState = NODE_STATE.ACTIVE;
  assertLiveVeto('lifecycle recovery also requires a fresh build');
  await drain();

  hardPressurePercent = 0.85;
  storageAccountingService.hardPressurePercent = hardPressurePercent;
  assertLiveVeto('capacity policy drift fails closed synchronously');
  await drain();

  publicationMode = 'repair_only';
  assertLiveVeto('CDC publication-mode drift fails closed synchronously');
  await drain();

  // Heartbeat attempt clocks are routine activity, not semantic readiness
  // input: on a bootstrap seed they change on every (failing) publication
  // attempt, and vetoing on them starved query routing into a formation
  // deadlock. Only a semantic heartbeat transition (path/target/failure
  // kind) still vetoes.
  const beforeClockDrift = readiness.getNodeReadinessSync('node-0')
    .readinessPlanningTokenStatus;
  heartbeatSuccessAt = new Date(NOW_MS - 1).toISOString();
  const clockDrift = readiness.getNodeReadinessSync('node-0');
  t.equal(clockDrift.readinessPlanningTokenStatus, beforeClockDrift,
    'heartbeat attempt-clock drift alone never changes snapshot liveness ' +
      '(the capture-level contract is pinned in ' +
      'readiness-planning-liveness-veto.test.js)');

  heartbeatPublicationPath = 'transport_relay';
  assertLiveVeto('heartbeat publication-path drift fails closed synchronously');
  await drain();
  readiness.shutdownReadinessPlanningOwner();
});

test('every readiness dimension participates in snapshot generation',
  async (t) => {
    const cache = createProductionShapedCache();
    const readiness = new ControlPlaneReadinessService({
      nodeId: 'node-0',
      systemTableCache: cache,
      now: () => NOW_MS,
    });
    const snapshot = readiness.getNodeReadinessSync('node-0');
    let changeCount = 0;
    readiness.recordReadinessPlanningSnapshotChange = () => {
      changeCount++;
    };
    for (const dimension of Object.values(CONTROL_PLANE_READINESS_DIMENSION)) {
      const changed = Object.freeze({
        ...snapshot,
        dimensions: Object.freeze({
          ...snapshot.dimensions,
          [dimension]: snapshot.dimensions[dimension] !== true,
        }),
      });
      readiness.storeReadinessSnapshot('node-0', snapshot, NOW_MS);
      readiness.storeReadinessSnapshot('node-0', changed, NOW_MS);
      t.equal(changeCount, 1,
        `${dimension} alone advances the semantic snapshot generation`);
      changeCount = 0;
      readiness.storeReadinessSnapshot('node-0', snapshot, NOW_MS);
      changeCount = 0;
    }
    readiness.shutdownReadinessPlanningOwner();
  });

test('node deletion and option changes cannot rebase a stale positive snapshot',
  async (t) => {
    const cache = createProductionShapedCache();
    const scheduled = [];
    const readiness = new ControlPlaneReadinessService({
      nodeId: 'node-0',
      systemTableCache: cache,
      now: () => NOW_MS,
      readinessPlanningScheduleDrainFn: (callback) => scheduled.push(callback),
      messageRouter: {
        getConnectionState: () => 'connected',
        getConnectedNodes: () => new Set(['node-0']),
      },
    });
    const originalBuild = readiness.buildNodeReadinessSyncCurrent;
    readiness.buildNodeReadinessSyncCurrent = function(nodeId, options = {}) {
      const snapshot = originalBuild.call(this, nodeId, options);
      return Object.freeze({
        ...snapshot,
        buildOptionWitness:
          options.membershipPublicationPlanningSource ||
          MEMBERSHIP_PUBLICATION_PLANNING_SOURCE.OWNER_ANSWER,
      });
    };
    const direct = readiness.getNodeReadinessSync('node-0', {
      membershipPublicationPlanningSource:
        MEMBERSHIP_PUBLICATION_PLANNING_SOURCE.DIRECT_PUBLICATION_ROW,
    });
    t.equal(
      direct.buildOptionWitness,
      MEMBERSHIP_PUBLICATION_PLANNING_SOURCE.DIRECT_PUBLICATION_ROW,
      'cold completion records the direct-publication build identity',
    );
    const defaultPlanning = readiness.getNodeReadinessSync('node-0');
    t.equal(
      defaultPlanning.readinessPlanningTokenStatus,
      'stale',
      'a different semantic option set cannot reuse that completion',
    );
    while (scheduled.length > 0) {
      scheduled.shift()();
      await Promise.resolve();
      await Promise.resolve();
    }
    t.equal(
      readiness.getNodeReadinessSync('node-0').buildOptionWitness,
      MEMBERSHIP_PUBLICATION_PLANNING_SOURCE.OWNER_ANSWER,
      'the independently scheduled owner publishes the requested option set',
    );
    const repairDecisionOptions = {
      allowAuthoritativeRefresh: true,
      requireFreshOnIneligible: true,
      decisionDimension: CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
    };
    readiness.getNodeReadinessSync('node-0', repairDecisionOptions);
    while (scheduled.length > 0) {
      scheduled.shift()();
      await Promise.resolve();
      await Promise.resolve();
    }
    const serveDecision = readiness.getNodeReadinessSync('node-0', {
      ...repairDecisionOptions,
      decisionDimension: CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
    });
    t.equal(
      serveDecision.readinessPlanningTokenStatus,
      'stale',
      'decision dimension participates in the completed-build identity',
    );

    cache.applySystemTableChange(TABLES.NODES, 'DELETE', {
      [COLUMN.NODE_ID]: 'node-0',
    });
    const deleted = readiness.getNodeReadinessSync('node-0');
    t.equal(
      deleted.dimensions.serveEligible,
      false,
      'a deleted node row cannot preserve positive serve readiness',
    );
    t.equal(
      deleted.readinessPlanningTokenStatus,
      'stale',
      'node deletion remains pending instead of rebasing old evidence current',
    );
    readiness.shutdownReadinessPlanningOwner();
  });

test('completion wakes isolate listeners and transient build failure retries',
  async (t) => {
    const cache = createProductionShapedCache();
    const scheduled = [];
    const readiness = new ControlPlaneReadinessService({
      nodeId: 'node-0',
      systemTableCache: cache,
      now: () => NOW_MS,
      readinessPlanningScheduleDrainFn: (callback) => scheduled.push(callback),
    });
    readiness.getNodeReadinessSync('node-0');
    let laterListenerWakeCount = 0;
    readiness.subscribeReadinessPlanningSnapshots(() => {
      throw new Error('hostile listener');
    });
    readiness.subscribeReadinessPlanningSnapshots(() => {
      laterListenerWakeCount++;
    });
    const originalBuild = readiness.buildNodeReadinessSyncCurrent;
    let failuresRemaining = 1;
    readiness.buildNodeReadinessSyncCurrent = function(...args) {
      if (failuresRemaining > 0) {
        failuresRemaining--;
        const error = new Error('transient readiness build failure');
        error.retryAfterMs = 1;
        throw error;
      }
      return originalBuild.apply(this, args);
    };
    cache.applySystemTableChange(
      TABLES.CONTROL_PLANE_PUBLICATIONS,
      'UPDATE',
      churnRow(TABLES.CONTROL_PLANE_PUBLICATIONS, 70),
    );
    scheduled.shift()();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 10));
    while (scheduled.length > 0) {
      scheduled.shift()();
      await Promise.resolve();
      await Promise.resolve();
    }
    const diagnostics = readiness.getReadinessPlanningDiagnostics();
    t.equal(
      diagnostics.retryableBuildFailureCount,
      1,
      'one failed build is retained by the readiness-independent retry timer',
    );
    t.ok(
      laterListenerWakeCount >= 1,
      'a later subscriber still receives every published wake',
    );
    t.equal(
      diagnostics.snapshotListenerFailureCount,
      laterListenerWakeCount,
      'each throwing-subscriber failure is isolated and diagnosed',
    );
    t.equal(
      diagnostics.completedTokenStatusByOwnerKey['node-0'],
      'current',
      'the retry publishes the final token',
    );
    readiness.shutdownReadinessPlanningOwner();
  });

test('formation work is priority-ordered and shutdown cancels pending builds',
  async (t) => {
    const cache = createProductionShapedCache();
    cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
      [COLUMN.NODE_ID]: 'node-4',
      [COLUMN.STATUS]: NODE_STATE.JOINING,
    });
    const scheduled = [];
    const readiness = new ControlPlaneReadinessService({
      nodeId: 'node-0',
      systemTableCache: cache,
      now: () => NOW_MS,
      readinessPlanningScheduleDrainFn: (callback) => scheduled.push(callback),
      messageRouter: {
        getConnectionState: () => 'connected',
        getConnectedNodes: () => new Set(['node-0', 'node-4']),
      },
    });
    const deferredLocal = readiness.getNodeReadinessSync('node-0');
    t.equal(
      deferredLocal.readinessPlanningTokenStatus,
      'stale',
      'cold local work defers while a connected formation owner is reserved',
    );
    const formation = readiness.getNodeReadinessSync('node-4');
    t.notOk(
      formation.reasons.some((reason) =>
        reason?.code === 'planning_snapshot_refresh_pending'),
      'the connected JOINING owner consumes the single cold build',
    );
    cache.applySystemTableChange(
      TABLES.CONTROL_PLANE_PUBLICATIONS,
      'UPDATE',
      churnRow(TABLES.CONTROL_PLANE_PUBLICATIONS, 80),
    );
    scheduled.shift()();
    await Promise.resolve();
    await Promise.resolve();
    t.equal(
      readiness.getReadinessPlanningDiagnostics().buildOwnerKeys[0],
      'node-4',
      'formation owner is promoted ahead of older background work',
    );
    const buildsBeforeShutdown =
      readiness.getReadinessPlanningDiagnostics().buildCount;
    readiness.shutdownReadinessPlanningOwner();
    while (scheduled.length > 0) {
      scheduled.shift()();
      await Promise.resolve();
    }
    t.equal(
      readiness.getReadinessPlanningDiagnostics().buildCount,
      buildsBeforeShutdown,
      'shutdown prevents every queued heavy build',
    );
  });
