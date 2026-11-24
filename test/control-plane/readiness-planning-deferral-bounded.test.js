// Deterministic witness for bounded readiness-planning deferral under
// semantic planning currency (PLACEMENT-03).
//
// Under semantic planning, every completed snapshot is admitted strictly by
// its immutable typed PlanningIdentity plus the positive-decision live veto;
// stale completions are never stored or served. Non-semantic source churn
// (continuous REPLICA_OPERATIONS writes) does not rotate PlanningIdentity, so
// live user-table partitions stay routable with zero
// planning_snapshot_refresh_pending denials, while genuine mid-build
// transport-topology flaps or live-veto moves fail closed without ever
// serving a stale build.
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

import {MembershipPublicationCoordinator} from
  '../../src/control-plane/membership-publication-coordinator.js';
import {NodeLivenessSemanticProjectionOwner} from
  '../../src/control-plane/node-liveness-semantic-projection-owner.js';
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

import {createReadinessServiceForTest} from '../helpers/readiness-service-fixture.js';
import {serveAnswerFromMock} from './serve-eligibility-test-support.js';
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
// R09 direct-publication custody tightens the same complete rig from 585.
const SEALED_RIG_HEAVY_BUILDS = 565;
// The number of serve admissions this audit OBSERVES on this drive (23
// routing samples x 3 replicas = 69 reuse admissions under semantic
// planning, down from 646 when the retired legacy lane re-checked
// canReuseCompletedSnapshot on every stale rebuild).
const SEALED_SERVE_ADMISSION_OBSERVATIONS = 69;
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
function createSemanticChurnDrive(options = {}) {
  const {flapTransportOnCapture = false} = options;
  const state = {clock: T0, healthy: true, transientPeer: 0};
  const cache = createFormationShapedCache(T0);
  for (let index = 0; index < NODE_COUNT; index++) {
    cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
      [COLUMN.NODE_ID]: `node-${index}`,
      [COLUMN.LAST_HEARTBEAT]: T0,
      [COLUMN.READY_LEASE_EXPIRES_AT]: T0 + READY_LEASE_WINDOW_MS,
    });
  }
  installUserTablePartition(cache);
  const pendingDrains = [];
  const buildRecords = [];
  const livenessOwner = new NodeLivenessSemanticProjectionOwner({
    localNodeId: LEADER_NODE_ID,
    now: () => state.clock,
    setTimeoutFn: () => ({unref() {}}),
    clearTimeoutFn: () => {},
    readNodeEvidence: (nodeId) => ({nodeRow: cache.get(TABLES.NODES, nodeId)}),
    thresholds: {staleHeartbeatMaxAgeMs: STALE_HEARTBEAT_MAX_AGE_MS},
  });
  const service = {
    nodeId: LEADER_NODE_ID,
    clusterMemberStaleHeartbeatMaxAgeMs: STALE_HEARTBEAT_MAX_AGE_MS,
    messageRouter: {
      getConnectedNodes: () => {
        const connected = [];
        for (let index = 0; index < NODE_COUNT; index++) {
          connected.push(`node-${index}`);
        }
        if (flapTransportOnCapture) {
          state.transientPeer += 1;
          if (state.transientPeer % 2 === 1) connected.push('joiner-transient');
        }
        return new Set(connected);
      },
    },
    nodeLivenessSemanticProjectionOwner: livenessOwner,
    getNodeLivenessSemanticIdentity: (nodeId, nowMs) =>
      livenessOwner.getNodeLivenessSemanticIdentity(nodeId, nowMs),
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
  cache.onCacheChange((tableName, operation, record, metadata) => {
    if (tableName === TABLES.NODES && record?.[COLUMN.NODE_ID]) {
      livenessOwner.recordNodeSourceChange(record[COLUMN.NODE_ID], state.clock);
    }
    owner.recordTableChange(
      tableName,
      operation,
      record,
      metadata?.tableMutationRevision ?? null,
    );
  });
  const readinessService = {
    answerServeEligibility(id) {
      return serveAnswerFromMock(this, id);
    },
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

async function measureDrive(options = {}) {
  const drive = createSemanticChurnDrive(options);
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
        (entry) => !(entry.live && entry.tokenStatus === TOKEN_STATUS.CURRENT),
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
  assert.equal(first.servedCount, SEALED_SERVE_ADMISSION_OBSERVATIONS,
    'the audit observes every serve admission the read path makes');
});

// Under continuous non-semantic REPLICA_OPERATIONS churn, every completed
// build lands CURRENT and is reused by typed PlanningIdentity.
test('semantic-churn-keeps-completions-current', async () => {
  const measured = await measureDrive();
  assert.ok(measured.buildCount > 0,
    'the drive builds readiness snapshots for the partition replicas');
  assert.equal(measured.staleCompletionCount, 0,
    'semantic planning never stores a STALE completion');
  assert.equal(measured.staleServedCount, 0,
    'semantic planning never serves a STALE completion');
  assert.equal(measured.unprovenAdmissions, 0,
    'every served completion holds both live veto and CURRENT status');
});

// Continuous non-semantic churn never denies a live user-table partition.
test('user-table-partition-routable-under-semantic-churn', async () => {
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

// The real write-delivery loop does not report PARTITION_SERVICE_NOT_FOUND.
test('write-path-terminal-verdict-cleared', async () => {
  const drive = createSemanticChurnDrive();
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

// PLACEMENT-03 safety oracle: when transport topology flaps on every capture,
// semantic planning fails closed instead of storing or serving STALE builds.
test('transport-flap-mid-build-never-serves-stale-completion', async () => {
  const measured = await measureDrive({flapTransportOnCapture: true});
  assert.equal(measured.completionCount, 0,
    'rejected mid-build topology-flap completions are never stored');
  assert.equal(measured.staleCompletionCount, 0,
    'no STALE completion record is retained in diagnostics');
  assert.equal(measured.staleServedCount, 0,
    'no STALE completion is ever served');
  assert.equal(measured.servedCount, 0,
    'readers fail closed until a build completes on a stable identity');
});

// The differential audit: every served snapshot is compared against a forced
// rebuild of the same owner at serve time.
test('served-snapshot-divergence-audit', async () => {
  const drive = createSemanticChurnDrive();
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

// THE SAFETY NEGATIVE. Semantic planning never serves a false positive.
test('live-veto-move-still-denies', async () => {
  const drive = createSemanticChurnDrive();
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
  const readiness = createReadinessServiceForTest({
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
