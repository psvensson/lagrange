// Shared drive for the readiness-admission-transitions-observed witnesses.
//
// It composes the REAL ReadinessPlanningSnapshotOwner (semantic planning
// enabled, because the traced joiner ran that path), the REAL QueryExecutor
// routing surface and the shared formation-shaped versioned cache, on a
// virtual clock. Every condition that stops a new build being admitted is
// driven through a production seam of the owner's own service contract -
// the router's connected-node view, the node-liveness semantic identity
// owner, the node lifecycle state machine, the cache's deferred-listener
// window, the owner's cache-replacement and liveness-change entry points and
// the clock - never by reaching into the owner's private state.
//
// Two witnesses share it: the planning-owner transition witness under
// test/control-plane and the routing-denial witness under test/query. It also
// owns the deterministic scenario whose digest is the frozen oracle of main's
// decisions.
//
// HOW THE FROZEN ORACLES ARE RE-MEASURED. Copy this file and
// `readiness-planning-formation-rig.js` onto a checkout of the sealed-at
// commit and run `runAdmissionScenario`/`captureDenialEntry`; the digests in
// the witnesses are what that produces. Every seam this file adds is off by
// default or produces the same service surface main sees, so the scenario is
// the same program on both trees.
import {createHash} from 'node:crypto';
import {
  COLUMN,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {ReadinessPlanningSnapshotOwner} from
  '../../src/control-plane/readiness-planning-snapshot-owner.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {
  T0,
  createFormationShapedCache,
} from './readiness-planning-formation-rig.js';

const VICTIM_NODE_ID = 'node-1';
const SEED_NODE_ID = 'node-0';
const USER_TABLE_NAME = 'ratings';
const USER_PARTITION_ID = 'ratings-p1';
const REPLICA_NODE_IDS = Object.freeze(['node-1']);
const CLUSTER_NODE_IDS = Object.freeze([
  'node-0', 'node-1', 'node-2', 'node-3', 'node-4',
]);
const STALE_HEARTBEAT_MAX_AGE_MS = 30_000;
const DRAIN_ROUNDS = 40;
const DIGEST_ALGORITHM = 'sha256';
const DIGEST_ENCODING = 'hex';
const DEFERRED_TOKEN_STATUS = 'stale';
const INVALID_CONNECTED_NODES = 42;
const LIFECYCLE_ACTIVE = 'active';
const LIFECYCLE_DRAINING = 'draining';
// A joiner flapping in and out of the router's connected set: the production
// shape of a transport fingerprint, and therefore a planning token, that
// rotates while a build is in flight. Off by default.
const TRANSIENT_PEER_NODE_ID = 'joiner-transient';

// The three read shapes one owner key is served under at once. The first two
// are different build variants (the dimension is in the build-options key);
// the third is the same build variant as PLANNING_READ_OPTIONS read as a
// routed read, which is the only shape the sealed CL-012 bridge may serve.
const PLANNING_READ_OPTIONS = Object.freeze({});
const RECOVERY_READ_OPTIONS = Object.freeze({
  decisionDimension:
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
});
const ROUTED_READ_OPTIONS = Object.freeze({
  participationKind: CONTROL_PLANE_PARTICIPATION_KIND.ROUTED_READ,
});

// One log sink shared by the owner's service: every line the planning owner
// emits lands here with its level, so a witness can assert the line count as
// well as the payload.
function createLogSink() {
  const lines = [];
  const record = (level) => (message, payload) => {
    lines.push({level, message, payload});
  };
  return {
    lines,
    logger: {
      info: record('info'),
      warn: record('warn'),
      error: record('error'),
      debug: record('debug'),
    },
    messages(message) {
      return lines.filter((line) => line.message === message);
    },
    clear() {
      lines.length = 0;
    },
  };
}

function installUserPartition(cache) {
  cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
    partition_id: USER_PARTITION_ID,
    table_name: USER_TABLE_NAME,
    leader_node_id: VICTIM_NODE_ID,
  });
  for (let index = 0; index < REPLICA_NODE_IDS.length; index++) {
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      [COLUMN.SERVICE_ID]: `ratings-service-${index}`,
      [COLUMN.NODE_ID]: REPLICA_NODE_IDS[index],
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: `${REPLICA_NODE_IDS[index]}/partition/ratings-p1`,
      partition_id: USER_PARTITION_ID,
      raft_role: 'leader',
    });
  }
}

function buildDimensions(ready) {
  const dimensions = {};
  const names = Object.values(CONTROL_PLANE_READINESS_DIMENSION);
  for (let index = 0; index < names.length; index++) {
    dimensions[names[index]] = ready;
  }
  return Object.freeze(dimensions);
}

function createPlanningService(state, cache, sink) {
  return {
    nodeId: VICTIM_NODE_ID,
    logger: sink.logger,
    clusterMemberStaleHeartbeatMaxAgeMs: STALE_HEARTBEAT_MAX_AGE_MS,
    systemTableCache: cache,
    messageRouter: {
      getConnectedNodes: () => {
        if (!state.transportValid) return INVALID_CONNECTED_NODES;
        return state.transientPeer ?
          new Set([...CLUSTER_NODE_IDS, TRANSIENT_PEER_NODE_ID]) :
          new Set(CLUSTER_NODE_IDS);
      },
    },
    // The node's own lifecycle, which the publication guard is captured from.
    nodeLifecycleStateMachine: {getState: () => state.lifecycleState},
    // Present and subscribable, so the owner runs its semantic planning path.
    nodeLivenessSemanticProjectionOwner: {
      subscribe: () => () => {},
    },
    getNodeLivenessSemanticIdentity(nodeId) {
      if (state.livenessUnavailable) {
        throw new Error('node liveness semantic identity unavailable');
      }
      return {
        generation: state.livenessGeneration,
        semanticSignature: `${nodeId}:${state.livenessGeneration}`,
      };
    },
    getNodeRow: (nodeId) => cache.get(TABLES.NODES, nodeId),
    // The production shape of a build-options key: the decision dimension and
    // the authoritative-refresh flag are in it, the participation kind is
    // not - which is exactly why one variant is read under two participation
    // kinds and can be served two different ways at once.
    buildReadinessEvaluationKey: (nodeId, buildOptions = {}) =>
      `${nodeId}|dim=${buildOptions.decisionDimension ||
        CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE}` +
      `|refresh=${buildOptions.allowAuthoritativeRefresh === true}`,
    buildNodeReadinessSyncCurrent(nodeId) {
      state.buildCount += 1;
      state.buildCountByNodeId.set(
        nodeId,
        (state.buildCountByNodeId.get(nodeId) || 0) + 1,
      );
      if (state.mutateDuringBuild) state.mutateDuringBuild();
      const nodeRow = cache.get(TABLES.NODES, nodeId);
      return Object.freeze({
        nodeId,
        observedAt: new Date(state.clock).toISOString(),
        lifecycleState: 'ready',
        dimensions: buildDimensions(true),
        reasons: Object.freeze([]),
        nodeEvidence: Object.freeze({
          lastHeartbeat: Number(nodeRow?.[COLUMN.LAST_HEARTBEAT]) || null,
          readyLeaseExpiresAt:
            Number(nodeRow?.[COLUMN.READY_LEASE_EXPIRES_AT]) || null,
        }),
      });
    },
  };
}

function createDriveState() {
  return {
    clock: T0,
    transportValid: true,
    livenessUnavailable: false,
    livenessGeneration: 1,
    buildCount: 0,
    buildCountByNodeId: new Map(),
    mutateDuringBuild: null,
    transientPeer: false,
    lifecycleState: LIFECYCLE_ACTIVE,
    deferCacheListener: false,
    tickOnRead: false,
  };
}

// The cache's deferred-listener window: the table's mutation version advances
// while the planning owner has not yet been told which record moved, so the
// owner sees an unclassified source change. This is the production shape the
// CL-012 bridge exists for.
function subscribeOwnerToCache(cache, owner, state, deferredChanges) {
  cache.onCacheChange((tableName, operation, record) => {
    if (!state.deferCacheListener) {
      owner.recordTableChange(tableName, operation, record);
      return;
    }
    deferredChanges.push(() =>
      owner.recordTableChange(tableName, operation, record));
  });
}

/**
 * Compose the real planning owner and the real routing surface on a virtual
 * clock.
 * @param {Object} [options] - `storedBridge` installs the stored-snapshot
 *   reuse seam the sealed CL-012 routed-read bridge serves from.
 * @return {Object} The drive.
 */
function createAdmissionDrive(options = {}) {
  const state = createDriveState();
  const sink = createLogSink();
  const cache = createFormationShapedCache(T0);
  installUserPartition(cache);
  const service = createPlanningService(state, cache, sink);
  if (options.storedBridge === true) {
    state.storedSnapshotByOwnerKey = new Map();
    service.getReusableNodeReadinessSnapshotSync = (ownerKey) =>
      state.storedSnapshotByOwnerKey.get(ownerKey) || null;
  }
  const pendingDrains = [];
  const deferredChanges = [];
  const owner = new ReadinessPlanningSnapshotOwner({
    service,
    now: () => {
      if (state.tickOnRead) state.clock += 1;
      return state.clock;
    },
    scheduleDrainFn: (callback) => {
      pendingDrains.push(callback);
      return null;
    },
  });
  subscribeOwnerToCache(cache, owner, state, deferredChanges);
  const readinessService = {
    getNodeReadinessSync: (nodeId, readOptions = {}) => owner.readSync(
      nodeId,
      readOptions,
      () => service.buildNodeReadinessSyncCurrent(nodeId),
    ),
  };
  const executor = new QueryExecutor({
    nodeId: SEED_NODE_ID,
    systemCache: cache,
    controlPlaneReadinessService: readinessService,
    nowFn: () => state.clock,
    messageRouter: {
      getConnectionState: () => 'connected',
      deliver: async () => ({success: false, error: 'participant offline'}),
      sendToNode: async () => ({success: false, error: 'participant offline'}),
    },
  });
  return {
    cache,
    executor,
    owner,
    service,
    sink,
    state,
    advance(ms) {
      state.clock += ms;
    },
    read(nodeId = VICTIM_NODE_ID, readOptions = PLANNING_READ_OPTIONS) {
      return readinessService.getNodeReadinessSync(nodeId, readOptions);
    },
    buildOptionsKey(nodeId = VICTIM_NODE_ID,
      readOptions = PLANNING_READ_OPTIONS) {
      return owner.captureBuildOptionsKey(nodeId, readOptions);
    },
    routingSnapshot() {
      return this.executor.getPartitionRoutingSnapshot(USER_PARTITION_ID);
    },
    async drain(rounds = DRAIN_ROUNDS) {
      for (let round = 0; round < rounds; round++) {
        const batch = pendingDrains.splice(0, pendingDrains.length);
        if (batch.length === 0) return round;
        for (let index = 0; index < batch.length; index++) batch[index]();
        await new Promise((resolve) => setImmediate(resolve));
      }
      return rounds;
    },
    // Break a term of the reuse or publish decision through a production seam.
    setTransportValid(valid) {
      state.transportValid = valid === true;
    },
    setLivenessUnavailable(unavailable) {
      state.livenessUnavailable = unavailable === true;
    },
    rotateLivenessIdentity() {
      state.livenessGeneration += 1;
      owner.recordNodeLivenessChange({nodeId: VICTIM_NODE_ID});
    },
    saturateGeneration() {
      owner.cacheGeneration = Number.MAX_SAFE_INTEGER;
      owner.recordCacheReplacement();
    },
    toggleLifecycleState() {
      state.lifecycleState = state.lifecycleState === LIFECYCLE_ACTIVE ?
        LIFECYCLE_DRAINING :
        LIFECYCLE_ACTIVE;
    },
    // The source moving while a build is in flight - the production shape of
    // a publish the completion-currency check refuses.
    setMutateDuringBuild(mutate) {
      state.mutateDuringBuild = mutate;
    },
    toggleTransientPeer() {
      state.transientPeer = !state.transientPeer;
    },
    setTickOnRead(tick) {
      state.tickOnRead = tick === true;
    },
    setDeferCacheListener(defer) {
      state.deferCacheListener = defer === true;
    },
    writeUnclassifiedSourceChange(revision) {
      state.deferCacheListener = true;
      cache.applySystemTableChange(TABLES.SERVICES, 'UPDATE', {
        [COLUMN.SERVICE_ID]: 'ratings-service-0',
        [COLUMN.NODE_ID]: VICTIM_NODE_ID,
        revision,
      });
    },
    flushDeferredCacheChanges() {
      state.deferCacheListener = false;
      const batch = deferredChanges.splice(0, deferredChanges.length);
      for (let index = 0; index < batch.length; index++) batch[index]();
      return batch.length;
    },
    buildCountFor(nodeId = VICTIM_NODE_ID) {
      return state.buildCountByNodeId.get(nodeId) || 0;
    },
    // Drain until THIS owner key's own build has run: the queue serves one
    // key per round, so a bounded round count is not enough on its own.
    async drainUntilBuilt(nodeId = VICTIM_NODE_ID, rounds = DRAIN_ROUNDS) {
      const before = this.buildCountFor(nodeId);
      for (let round = 0; round < rounds; round += 1) {
        await this.drain(1);
        if (this.buildCountFor(nodeId) > before) return true;
      }
      return false;
    },
    requestBuild(nodeId = VICTIM_NODE_ID,
      readOptions = PLANNING_READ_OPTIONS) {
      owner.requestRefresh(nodeId, readOptions);
    },
    storeBridgeSnapshot(ownerKey, snapshot) {
      state.storedSnapshotByOwnerKey.set(ownerKey, snapshot);
    },
    shutdown() {
      owner.shutdown();
    },
  };
}

function isDeferredSnapshot(snapshot) {
  return snapshot?.readinessPlanningTokenStatus === DEFERRED_TOKEN_STATUS;
}

// The pre-existing shape of one routing-denial entry, with no field this
// quest adds. The oracle compares THIS projection, so a new field can never
// make the differential pass by moving the comparison.
function projectPreExistingDenial(deniedByNodeId) {
  const projected = {};
  for (const nodeId of Object.keys(deniedByNodeId || {})) {
    const entry = deniedByNodeId[nodeId];
    projected[nodeId] = {
      decisionDimension: entry.decisionDimension ?? null,
      observedAt: entry.observedAt ?? null,
      lifecycleState: entry.lifecycleState ?? null,
      reasonCodes: (entry.reasonCodes || []).map(
        (code) => String(code?.code ?? code),
      ),
      failedDimensions: [...(entry.failedDimensions || [])],
    };
  }
  return projected;
}

function projectRouting(snapshot) {
  return {
    reasonCode: snapshot.reasonCode,
    serviceRowCount: snapshot.serviceRowCount,
    activeAddressedServiceCount: snapshot.activeAddressedServiceCount,
    routableServiceCount: snapshot.routableServiceCount,
    canonicalLeaderNodeId: snapshot.canonicalLeaderNodeId,
    canonicalLeaderServiceCount: snapshot.canonicalLeaderServiceCount,
    leaderKnown: snapshot.leaderKnown,
    deniedByNodeId: projectPreExistingDenial(snapshot.deniedByNodeId),
  };
}

// The served answer, as a consumer sees it. `servedObjectIndex` is the
// identity of the object served: a repeat of the previous index is a memo
// hit, a new index a miss-and-store, so the index sequence IS the owner's
// hit/miss/store sequence for this scenario.
function projectServed(snapshot, servedObjects) {
  let servedObjectIndex = servedObjects.indexOf(snapshot);
  if (servedObjectIndex < 0) {
    servedObjects.push(snapshot);
    servedObjectIndex = servedObjects.length - 1;
  }
  return {
    servedObjectIndex,
    deferred: isDeferredSnapshot(snapshot),
    nodeId: snapshot?.nodeId ?? null,
    observedAt: snapshot?.observedAt ?? null,
    tokenStatus: snapshot?.readinessPlanningTokenStatus ?? null,
    dimensions: {...(snapshot?.dimensions || {})},
    reasonCodes: (snapshot?.reasons || []).map(
      (reason) => String(reason?.code ?? reason),
    ),
  };
}

// The owner's own published state for this variant, which is what a dropped
// publish term changes: a refused build is not remembered, so the next read
// has no completed record to reuse.
function projectPublished(drive) {
  const completed = drive.owner.readCompleted(
    VICTIM_NODE_ID,
    drive.buildOptionsKey(),
  );
  return {
    completedPresent: Boolean(completed),
    tokenStatus: completed?.tokenStatus ?? null,
    completedAtMs: completed?.completedAtMs ?? null,
  };
}

// The scenario the oracle digests: every reuse term the owner can be driven
// through, each followed by a return to an admitted record, plus the publish
// decision's own terms, with a routing sample after every step.
const ADMISSION_SCENARIO_STEPS = Object.freeze([
  'cold-read',
  'steady-read',
  'steady-repeat',
  'live-veto-expired',
  'live-veto-repeat',
  'rebuilt-after-veto',
  'transport-topology-invalid',
  'transport-topology-repeat',
  'transport-restored',
  'planning-identity-saturated',
  'planning-identity-restored',
  'freshness-not-current',
  'freshness-refreshed',
  'source-change-unclassified',
  'source-change-classified',
  'publish-refused-by-guard',
  'publish-refused-by-guard-settled',
  'publish-refused-by-unclassified-source',
  'publish-refused-by-unclassified-source-settled',
  'generation-saturated',
]);

async function applyReuseScenarioStep(drive, step) {
  if (step === 'live-veto-expired') {
    drive.advance(STALE_HEARTBEAT_MAX_AGE_MS + 1);
  }
  if (step === 'rebuilt-after-veto') await drive.drain();
  if (step === 'transport-topology-invalid') drive.setTransportValid(false);
  if (step === 'transport-restored') {
    drive.setTransportValid(true);
    await drive.drain();
  }
  if (step === 'planning-identity-saturated') drive.setLivenessUnavailable(true);
  if (step === 'planning-identity-restored') {
    drive.setLivenessUnavailable(false);
    await drive.drain();
  }
  if (step === 'freshness-not-current') drive.rotateLivenessIdentity();
  if (step === 'freshness-refreshed') await drive.drain();
  if (step === 'steady-read') await drive.drain();
}

async function applyPublishScenarioStep(drive, step) {
  if (step === 'source-change-unclassified') {
    drive.writeUnclassifiedSourceChange(1);
  }
  if (step === 'source-change-classified') {
    drive.flushDeferredCacheChanges();
    await drive.drain();
  }
  if (step === 'publish-refused-by-guard') {
    drive.setMutateDuringBuild(() => drive.toggleLifecycleState());
    drive.rotateLivenessIdentity();
    await drive.drain(1);
  }
  if (step === 'publish-refused-by-guard-settled') {
    drive.setMutateDuringBuild(null);
    await drive.drain();
  }
  if (step === 'publish-refused-by-unclassified-source') {
    drive.setMutateDuringBuild(() => drive.writeUnclassifiedSourceChange(2));
    drive.rotateLivenessIdentity();
    await drive.drain(1);
  }
  if (step === 'publish-refused-by-unclassified-source-settled') {
    drive.setMutateDuringBuild(null);
    drive.flushDeferredCacheChanges();
    await drive.drain();
  }
  if (step === 'generation-saturated') drive.saturateGeneration();
}

/**
 * Run the deterministic admission scenario against the real owners.
 * @param {Object} [options] - `tickOnRead` advances the owner's clock on
 *   every read, so an added clock read would move the digest.
 * @return {Object} Observations, digest and the captured log lines.
 */
async function runAdmissionScenario(options = {}) {
  const drive = createAdmissionDrive();
  drive.setTickOnRead(options.tickOnRead === true);
  const servedObjects = [];
  const observations = [];
  try {
    for (const step of ADMISSION_SCENARIO_STEPS) {
      await applyReuseScenarioStep(drive, step);
      await applyPublishScenarioStep(drive, step);
      const served = drive.read();
      observations.push({
        step,
        served: projectServed(served, servedObjects),
        published: projectPublished(drive),
        routing: projectRouting(drive.routingSnapshot()),
        buildCount: drive.state.buildCount,
      });
    }
  } finally {
    drive.shutdown();
  }
  const serialized = JSON.stringify(observations);
  return {
    observations,
    digest: createHash(DIGEST_ALGORITHM).update(serialized)
      .digest(DIGEST_ENCODING),
    lines: drive.sink.lines,
  };
}

/**
 * Drive the traced state - a live user-table partition whose only candidate
 * is denied on a deferred readiness record - and return the denial entry the
 * routing snapshot lists plus the entry the denial LINE carries.
 * @return {Promise<Object>}
 */
async function captureDenialEntry() {
  const drive = createAdmissionDrive();
  const sink = createLogSink();
  try {
    // Routing reads their own build variant (the authoritative-refresh flag
    // is in the build-options key), so that variant is given a completed
    // record of its own first. Only then is the denial made on an INHERITED
    // verdict with an old observedAt, which is the traced shape.
    drive.read();
    drive.routingSnapshot();
    await drive.drain();
    drive.routingSnapshot();
    drive.advance(STALE_HEARTBEAT_MAX_AGE_MS + 1);
    drive.executor.logger = sink.logger;
    const snapshot = drive.routingSnapshot();
    drive.executor.logPartitionRoutingDenial(snapshot);
    const [line] = sink.lines;
    return {
      snapshot,
      snapshotEntry: snapshot.deniedByNodeId[VICTIM_NODE_ID],
      lineEntry: line?.payload?.routingSnapshot
        ?.deniedByNodeId?.[VICTIM_NODE_ID] ?? null,
      lineMessage: line?.message ?? null,
      lineLevel: line?.level ?? null,
      expectedAgeMs: STALE_HEARTBEAT_MAX_AGE_MS + 1,
    };
  } finally {
    drive.shutdown();
  }
}

export {
  PLANNING_READ_OPTIONS,
  RECOVERY_READ_OPTIONS,
  ROUTED_READ_OPTIONS,
  STALE_HEARTBEAT_MAX_AGE_MS,
  VICTIM_NODE_ID,
  captureDenialEntry,
  createAdmissionDrive,
  createLogSink,
  isDeferredSnapshot,
  runAdmissionScenario,
};
