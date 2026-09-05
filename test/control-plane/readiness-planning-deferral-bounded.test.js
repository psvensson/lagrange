// Deterministic witness for the readiness-planning token-rotation live-lock
// measured on the five-node GCP run 2026-08-31T00-12-47.
//
// Mechanism: under sustained source churn the planning token advances while
// every build is in flight, publishCompleted stamps every completed build
// TOKEN_STATUS.STALE, and canReuseCompletedSnapshot refused a STALE build
// outright — so every reader received the all-false deferred contract whose
// sole reason is planning_snapshot_refresh_pending, for as long as the churn
// lasted. Measured live: 88s, all three ratings-p1 replica service rows
// present and active, the coordinator its own p1 raft leader, and the leader
// denied in 23 of 23 routing samples; the INSERT (writes have no attempt
// ceiling) retried to its deadline and failed PARTITION_SERVICE_NOT_FOUND.
//
// The drive runs the REAL ReadinessPlanningSnapshotOwner, the REAL floored
// planning version key, the REAL QueryExecutor routing and write-delivery
// paths and a REAL versioned system-table cache, under the forensic's
// proposed token clock: the transport fingerprint rotates on every
// captureToken(), so `tokenCurrent` is false in publishCompleted by
// construction. A transient joiner entering and leaving the router's
// connected set is the production shape of that rotation, and it moves no
// input of any replica's own readiness answer.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  COLUMN,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from
  '../../src/control-plane/control-plane-readiness-constants.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {QUERY_ERROR_MSG} from '../../src/query/query-constants.js';
import {ControlPlaneReadinessService} from
  '../../src/control-plane/control-plane-readiness-service.js';
import {MembershipPublicationCoordinator} from
  '../../src/control-plane/membership-publication-coordinator.js';
import {ReadinessPlanningSnapshotOwner} from
  '../../src/control-plane/readiness-planning-snapshot-owner.js';
import {TOKEN_STATUS} from
  '../../src/control-plane/readiness-planning-version-contract.js';
import {readMembershipPlanningDerivationVersionKey} from
  '../../src/control-plane/membership-planning-version-key.js';
import {
  NODE_COUNT,
  T0,
  createFormationShapedCache,
  driveFormationShapedChurn,
} from './readiness-planning-formation-rig.js';

// The failing user table from the forensic run, verbatim. A user table has no
// system-table classification, so it never reaches the system-table leader
// fail-open and is filtered strictly by readiness.
const USER_TABLE_NAME = 'tbl-67f4035f1e5f9fd2a0245f5d35ff9de9';
const USER_PARTITION_ID = `${USER_TABLE_NAME}-p1`;
const REPLICA_NODE_IDS = Object.freeze(['node-0', 'node-1', 'node-2']);
const LEADER_NODE_ID = 'node-0';
// The failing run's own sampling shape: 23 routing samples over 88s.
const ROUTING_SAMPLE_COUNT = 23;
const SAMPLE_STEP_MS = 4000;
const STALE_HEARTBEAT_MAX_AGE_MS = 300_000;
const READY_LEASE_WINDOW_MS = 600_000;
const DRAIN_ROUNDS = 24;
const COMPOSITION_DRAIN_ROUNDS = 60;
const WRITE_DEADLINE_MS = 150;
const UNHEALTHY_ROUNDS = 3;
const UNHEALTHY_REVISION_BASE = 1000;
const REFRESH_PENDING = 'planning_snapshot_refresh_pending';
const ALL_FILTERED = 'all_services_filtered_by_readiness';
// Tightened after semantic planning currency replaced the raw table-version
// floor. The shared rig is deterministic, so these exact counts make any
// future amplification visible instead of preserving the superseded pre-Q2
// write-driven baseline.
const SEALED_RIG_HEAVY_BUILDS = 585;
const SEALED_RIG_PUBLICATION_WINNER_READS = 0;

// The reconcile queue falls back to `console` when no logging service is
// initialized, and this witness drives thousands of enqueues.
const logging = LoggingService.getInstance();
if (!logging.isInitialized()) {
  logging.initialize({level: 'error'});
}

function readinessDecisionVector(snapshot) {
  return JSON.stringify({
    nodeId: snapshot?.nodeId ?? null,
    dimensions: snapshot?.dimensions ? {...snapshot.dimensions} : null,
    reasons: (snapshot?.reasons || []).map((reason) => reason?.code ?? reason),
  });
}

function installUserTablePartition(cache) {
  cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
    partition_id: USER_PARTITION_ID,
    table_name: USER_TABLE_NAME,
    leader_node_id: LEADER_NODE_ID,
  });
  for (let index = 0; index < REPLICA_NODE_IDS.length; index++) {
    const nodeId = REPLICA_NODE_IDS[index];
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      [COLUMN.SERVICE_ID]: `user-service-${index}`,
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: `${nodeId}/partition/${USER_PARTITION_ID}`,
      partition_id: USER_PARTITION_ID,
      raft_role: nodeId === LEADER_NODE_ID ? 'leader' : 'follower',
    });
  }
}

/**
 * Drive the REAL planning owner under a token that rotates on every capture.
 * @param {Object} [options]
 * @return {Object}
 */
function createTokenChurnDrive(options = {}) {
  const state = {clock: T0, healthy: true, transientPeer: 0};
  const cache = createFormationShapedCache(T0);
  installUserTablePartition(cache);
  const pendingDrains = [];
  const buildRecords = [];
  const service = {
    nodeId: LEADER_NODE_ID,
    clusterMemberStaleHeartbeatMaxAgeMs: STALE_HEARTBEAT_MAX_AGE_MS,
    // The forensic's token clock: a transient joiner flapping in and out of
    // the router's connected set rotates the transport fingerprint on every
    // captureToken(), and therefore the planning token, without moving any
    // input of a replica's own readiness answer.
    messageRouter: {
      getConnectedNodes: () => {
        state.transientPeer += 1;
        const connected = [];
        for (let index = 0; index < NODE_COUNT; index++) {
          connected.push(`node-${index}`);
        }
        if (state.transientPeer % 2 === 1) connected.push('joiner-transient');
        return new Set(connected);
      },
    },
    getNodeRow: (nodeId) => cache.get(TABLES.NODES, nodeId),
    readPlanningProjectionSourceGeneration: (nowMs) =>
      readMembershipPlanningDerivationVersionKey(cache, nowMs),
    buildNodeReadinessSyncCurrent(nodeId) {
      buildRecords.push({nodeId, atMs: state.clock});
      const dimensions = {};
      const names = Object.values(CONTROL_PLANE_READINESS_DIMENSION);
      for (let index = 0; index < names.length; index++) {
        dimensions[names[index]] = state.healthy;
      }
      const nodeRow = cache.get(TABLES.NODES, nodeId);
      return Object.freeze({
        nodeId,
        observedAt: new Date(state.clock).toISOString(),
        lifecycleState: state.healthy ? 'ready' : 'failed',
        dimensions: Object.freeze(dimensions),
        reasons: Object.freeze(state.healthy ?
          [] :
          [Object.freeze({code: 'cluster_member_unhealthy'})]),
        nodeEvidence: Object.freeze({
          lastHeartbeat: Number(nodeRow?.[COLUMN.LAST_HEARTBEAT]) || null,
          readyLeaseExpiresAt:
            Number(nodeRow?.[COLUMN.READY_LEASE_EXPIRES_AT]) || null,
        }),
      });
    },
  };
  const owner = new ReadinessPlanningSnapshotOwner({
    service,
    now: () => state.clock,
    scheduleDrainFn: (callback) => {
      pendingDrains.push(callback);
      return null;
    },
  });
  cache.onCacheChange((tableName, _operation, record) => {
    owner.recordTableChange(tableName, record);
  });
  const readinessService = {
    getNodeReadinessSync: (nodeId, readOptions = {}) => owner.readSync(
      nodeId,
      readOptions,
      () => service.buildNodeReadinessSyncCurrent(nodeId),
    ),
  };
  const executor = new QueryExecutor({
    nodeId: LEADER_NODE_ID,
    systemCache: cache,
    controlPlaneReadinessService: readinessService,
    messageRouter: {
      getConnectionState: () => 'connected',
      deliver: async () => ({success: false, error: 'participant offline'}),
      sendToNode: async () => ({success: false, error: 'participant offline'}),
    },
  });
  const servedCompletions = [];
  const originalCanReuse = owner.canReuseCompletedSnapshot;
  owner.canReuseCompletedSnapshot = function(
    ownerKey,
    completed,
    token,
    buildOptionsKey,
  ) {
    const admitted = originalCanReuse.call(
      this,
      ownerKey,
      completed,
      token,
      buildOptionsKey,
    );
    if (admitted) {
      servedCompletions.push({
        ownerKey,
        tokenStatus: completed.tokenStatus,
        sourceGenerationMatches:
          this.matchesCompletedSourceGeneration(completed),
        live: this.isCompletedSnapshotLive(ownerKey, completed),
        tokenEqual: this.tokensEqual(completed.capturedToken, token),
        vector: readinessDecisionVector(completed.snapshot),
      });
    }
    return admitted;
  };
  return {
    buildRecords,
    cache,
    executor,
    owner,
    servedCompletions,
    service,
    state,
    advance(ms) {
      state.clock += ms;
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
    forceRebuild(nodeId) {
      return service.buildNodeReadinessSyncCurrent(nodeId);
    },
    setHealthy(healthy) {
      state.healthy = healthy;
    },
    shutdown() {
      owner.shutdown();
    },
    options,
  };
}

function readRoutingSample(drive) {
  const snapshot = drive.executor.getPartitionRoutingSnapshot(
    USER_PARTITION_ID,
    CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
  );
  const leaderDenial = snapshot.deniedByNodeId?.[LEADER_NODE_ID] || null;
  return {
    routableServiceCount: snapshot.routableServiceCount,
    activeAddressedServiceCount: snapshot.activeAddressedServiceCount,
    serviceRowCount: snapshot.serviceRowCount,
    canonicalLeaderServiceCount: snapshot.canonicalLeaderServiceCount,
    reasonCode: snapshot.reasonCode,
    leaderReasonCodes: (leaderDenial?.reasonCodes || []).map(
      (code) => String(code?.code ?? code),
    ),
  };
}

/**
 * Sample the user-table partition exactly as the failing write lane did.
 * @param {Object} drive
 * @return {Promise<Array<Object>>}
 */
async function sampleUserPartitionRouting(drive) {
  const samples = [];
  for (let index = 0; index < ROUTING_SAMPLE_COUNT; index++) {
    drive.advance(SAMPLE_STEP_MS);
    // The ratings load wrote continuously through the whole window.
    drive.cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'UPDATE', {
      operation_id: 'ratings-load-operation',
      revision: index + 1,
      updated_at: drive.state.clock,
    });
    await drive.drain();
    samples.push(readRoutingSample(drive));
  }
  return samples;
}

async function measureDrive() {
  const drive = createTokenChurnDrive();
  try {
    drive.executor.getPartitionRoutingSnapshot(USER_PARTITION_ID);
    await drive.drain();
    const samples = await sampleUserPartitionRouting(drive);
    const diagnostics = drive.owner.getDiagnostics();
    const tokenStatuses = Object.values(
      diagnostics.completedTokenStatusByOwnerKey,
    );
    return {
      samples,
      buildCount: diagnostics.buildCount,
      completionCount: tokenStatuses.length,
      staleCompletionCount: tokenStatuses.filter(
        (status) => status === TOKEN_STATUS.STALE,
      ).length,
      servedCount: drive.servedCompletions.length,
      staleServedCount: drive.servedCompletions.filter(
        (entry) => entry.tokenStatus === TOKEN_STATUS.STALE,
      ).length,
      unprovenAdmissions: drive.servedCompletions.filter(
        (entry) => !(entry.live &&
          (entry.tokenEqual || entry.sourceGenerationMatches)),
      ).length,
    };
  } finally {
    drive.shutdown();
  }
}

// Two identical drives produce identical routing samples, build counts,
// completed token statuses and serve-admission counts.
test('witness-deterministic', async () => {
  const first = await measureDrive();
  const second = await measureDrive();
  assert.deepEqual(second.samples, first.samples,
    'two runs produce identical routing samples');
  assert.equal(second.buildCount, first.buildCount,
    'two runs perform identical owner build counts');
  assert.equal(second.staleCompletionCount, first.staleCompletionCount,
    'two runs stamp identical completed token statuses');
  assert.equal(second.servedCount, first.servedCount,
    'two runs admit identical numbers of completed snapshots');
});

// The live-lock precondition: under a token that rotates on every capture no
// build ever lands current, so every completed build is stamped STALE.
test('token-rotation-live-lock-precondition', async () => {
  const measured = await measureDrive();
  assert.ok(measured.buildCount > ROUTING_SAMPLE_COUNT,
    'the drive completes a build for every sampled window');
  assert.equal(measured.staleCompletionCount, measured.completionCount,
    'every completed build is stamped STALE — the live-lock precondition');
});

// RED on HEAD: 23 of 23 samples deny every candidate of a live user-table
// partition, each with the single reason planning_snapshot_refresh_pending.
test('user-table-partition-routable-under-token-churn', async () => {
  const measured = await measureDrive();
  assert.equal(measured.samples.length, ROUTING_SAMPLE_COUNT,
    'the drive samples the partition as often as the failing run did');
  assert.ok(
    measured.samples.every((sample) => sample.serviceRowCount === 3 &&
      sample.activeAddressedServiceCount === 3 &&
      sample.canonicalLeaderServiceCount === 1),
    'all three replica rows stay active and the leader row stays present',
  );
  assert.equal(
    measured.samples.filter(
      (sample) => sample.routableServiceCount === 0,
    ).length,
    0,
    'no sample denies every candidate of a live user-table partition',
  );
  assert.equal(
    measured.samples.filter(
      (sample) => sample.reasonCode === ALL_FILTERED &&
        sample.leaderReasonCodes.length > 0 &&
        sample.leaderReasonCodes.every((code) => code === REFRESH_PENDING),
    ).length,
    0,
    'no sample answers an unbounded planning_snapshot_refresh_pending denial',
  );
});

// RED on HEAD: the real write-delivery loop, whose only retry authority is the
// absolute execution deadline, returns PARTITION_SERVICE_NOT_FOUND.
test('write-path-terminal-verdict-cleared', async () => {
  const drive = createTokenChurnDrive();
  try {
    drive.executor.getPartitionRoutingSnapshot(USER_PARTITION_ID);
    await drive.drain();
    await sampleUserPartitionRouting(drive);
    const result = await drive.executor.executeOnPartition(
      USER_PARTITION_ID,
      'INSERT INTO ratings VALUES (1)',
      [],
      false,
      true,
      false,
      {
        tableName: USER_TABLE_NAME,
        timeoutBudget: {deadlineMs: Date.now() + WRITE_DEADLINE_MS},
      },
    );
    assert.notEqual(
      result?.error,
      QUERY_ERROR_MSG.PARTITION_SERVICE_NOT_FOUND,
      'the write lane does not report the partition service as not found',
    );
  } finally {
    drive.shutdown();
  }
});

// THE SAFETY ORACLE. Every serve admission is independently reconfirmed to
// rest on BOTH sealed bounds — the positive-decision live veto is unmoved AND
// either the token is equal or the floored planning generation matches. The
// completed record's token STATUS is never load-bearing, so the staleness
// class admitted here is exactly the one the sealed floored reuse already
// admits for a build that landed current.
test('serve-admission-never-rests-on-token-status', async () => {
  const measured = await measureDrive();
  assert.ok(measured.staleServedCount > 0,
    'the drive serves snapshots from builds stamped STALE');
  assert.equal(measured.unprovenAdmissions, 0,
    'no completed snapshot is served unless the two sealed bounds hold');
});

// The differential audit: every snapshot served from a STALE-stamped build is
// compared against a forced rebuild of the same owner at serve time.
test('stale-serve-divergence-audit', async () => {
  const drive = createTokenChurnDrive();
  try {
    drive.executor.getPartitionRoutingSnapshot(USER_PARTITION_ID);
    await drive.drain();
    await sampleUserPartitionRouting(drive);
    const audited = drive.servedCompletions;
    const divergences = audited.filter((entry) =>
      readinessDecisionVector(drive.forceRebuild(entry.ownerKey)) !==
        entry.vector);
    assert.ok(audited.length > 0,
      'the audit observes served completed snapshots');
    assert.equal(divergences.length, 0,
      'no served snapshot disagrees with a forced rebuild of the same owner');
  } finally {
    drive.shutdown();
  }
});

// THE SAFETY NEGATIVE. The cure admits staleness, never a false positive.
test('live-veto-move-still-denies', async () => {
  const drive = createTokenChurnDrive();
  try {
    drive.executor.getPartitionRoutingSnapshot(USER_PARTITION_ID);
    await drive.drain();
    await sampleUserPartitionRouting(drive);
    // (i) the live veto moves: every replica's ready lease and heartbeat
    // expire, so no completed build may be served from store.
    for (let index = 0; index < REPLICA_NODE_IDS.length; index++) {
      drive.cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
        [COLUMN.NODE_ID]: REPLICA_NODE_IDS[index],
        [COLUMN.LAST_HEARTBEAT]: T0 - READY_LEASE_WINDOW_MS,
        [COLUMN.READY_LEASE_EXPIRES_AT]: T0 - READY_LEASE_WINDOW_MS,
      });
    }
    drive.advance(SAMPLE_STEP_MS);
    const afterVetoMove = readRoutingSample(drive);
    assert.equal(afterVetoMove.routableServiceCount, 0,
      'a moved positive-decision live veto refuses every completed build');
    // (ii) the built evidence itself says not-ready.
    drive.setHealthy(false);
    for (let round = 0; round < UNHEALTHY_ROUNDS; round++) {
      drive.advance(SAMPLE_STEP_MS);
      drive.cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'UPDATE', {
        operation_id: 'ratings-load-operation',
        revision: UNHEALTHY_REVISION_BASE + round,
        updated_at: drive.state.clock,
      });
      await drive.drain();
    }
    const afterUnhealthy = readRoutingSample(drive);
    assert.equal(afterUnhealthy.routableServiceCount, 0,
      'a node whose evidence says not-ready is never reported routable');
  } finally {
    drive.shutdown();
  }
});

// CONTROL (green on HEAD, must stay green). The real service uses the typed
// planning identity and live veto, so bounded churn can retain a semantically
// current answer without reviving the removed stored-snapshot rebase path.
test('production-composition-control-denial-vocabulary', async () => {
  const state = {clock: T0};
  const cache = createFormationShapedCache(T0);
  installUserTablePartition(cache);
  const pendingDrains = [];
  const readiness = new ControlPlaneReadinessService({
    nodeId: LEADER_NODE_ID,
    systemTableCache: cache,
    now: () => state.clock,
    clusterMemberStaleHeartbeatMaxAgeMs: STALE_HEARTBEAT_MAX_AGE_MS,
    readinessPlanningScheduleDrainFn: (callback) => {
      pendingDrains.push(callback);
      return null;
    },
    messageRouter: {
      getConnectionState: () => 'connected',
      getConnectedNodes: () => new Set(
        Array.from({length: NODE_COUNT}, (_, index) => `node-${index}`),
      ),
    },
  });
  readiness.syncOwnerDependencies({
    membershipPublicationService: new MembershipPublicationCoordinator({
      nodeId: LEADER_NODE_ID,
      systemTableCache: cache,
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
        upsertSystemTableRow: async () => ({success: true}),
      },
      controlPlaneReadinessService: readiness,
      now: () => state.clock,
    }),
  });
  const executor = new QueryExecutor({
    nodeId: LEADER_NODE_ID,
    systemCache: cache,
    controlPlaneReadinessService: readiness,
    messageRouter: {getConnectionState: () => 'connected'},
  });
  const drain = async () => {
    for (let round = 0; round < COMPOSITION_DRAIN_ROUNDS; round++) {
      const batch = pendingDrains.splice(0, pendingDrains.length);
      if (batch.length === 0) return round;
      for (let index = 0; index < batch.length; index++) batch[index]();
      await new Promise((resolve) => setImmediate(resolve));
    }
    return COMPOSITION_DRAIN_ROUNDS;
  };
  try {
    executor.getPartitionRoutingSnapshot(USER_PARTITION_ID);
    await drain();
    const refreshPendingSamples = [];
    for (let index = 0; index < ROUTING_SAMPLE_COUNT; index++) {
      state.clock += SAMPLE_STEP_MS;
      // This control isolates operation-table churn. Keep the owner-produced
      // liveness facts current so the 92-second drive does not also cross the
      // independent 10/30/60-second P deadlines it is not intended to test.
      for (let nodeIndex = 0; nodeIndex < NODE_COUNT; nodeIndex++) {
        cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
          [COLUMN.NODE_ID]: `node-${nodeIndex}`,
          [COLUMN.LAST_HEARTBEAT]: state.clock,
          [COLUMN.READY_LEASE_EXPIRES_AT]:
            state.clock + READY_LEASE_WINDOW_MS,
        });
      }
      cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'UPDATE', {
        operation_id: 'ratings-load-operation',
        revision: index + 1,
        updated_at: state.clock,
      });
      await drain();
      const snapshot = executor.getPartitionRoutingSnapshot(USER_PARTITION_ID);
      const codes = (snapshot.deniedByNodeId?.[LEADER_NODE_ID]?.reasonCodes ||
        []).map((code) => String(code?.code ?? code));
      if (codes.includes(REFRESH_PENDING)) refreshPendingSamples.push(index);
    }
    assert.deepEqual(refreshPendingSamples, [],
      'the production composition never names planning_snapshot_refresh_' +
        'pending as a routing denial for a live user partition');
  } finally {
    readiness.shutdownReadinessPlanningOwner();
  }
});

// THE RATE CONTROL: semantic source classification is allowed to reduce the
// count, and the one-way ratchet records that new deterministic baseline.
test('unchanged-control-rig-build-rate', async () => {
  const measured = driveFormationShapedChurn();
  assert.equal(measured.heavyBuilds, SEALED_RIG_HEAVY_BUILDS,
    'heavy planning builds stay at the sealed identity-owner measurement');
  assert.equal(
    measured.publicationWinnerReads,
    SEALED_RIG_PUBLICATION_WINNER_READS,
    'publication winner reads stay at the sealed measurement',
  );
});
