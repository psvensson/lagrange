// Shared deterministic fixture for the formation-release-handoff witnesses
// (formation-release-handoff-consumer-parity.test.js and
// formation-release-handoff-post-reopen-capture.test.js). It drives the REAL
// owner path — the seed-owned formation-release closure owner behind
// ControlPlaneReadinessService (capture / durable acknowledgement / retention
// across a priority-spread reopen), the durable publication row, and the
// joiner-side consumer projection (projectFormationReleaseHandoff ->
// validateFormationReleaseHandoffConsumerContract) — plus the real
// operation-ledger formation barrier loop (awaitOperationLedgerFormationBarrier)
// on a virtual clock. The only doubles sit at genuine collaborator boundaries:
// the planning answer, the durable publication storage owner, and the message
// router's connection evidence.
//
// Fixture fidelity (GCP run 2026-08-30T02-15-53.462Z): the joiner is a
// DISTINCT process whose admission carries the join-branch cluster-incarnation
// fence the real entrypoint produces (src/entrypoint-runtime-join-decision.js
// persists rejoin hints, then src/entrypoint-runtime-provenance.js resolves the
// fence over them: durable state detected, local identity matched, peer proof
// recovered) — or no fence at all when the barrier reads the seed identity —
// while the seed captured its generation under the fresh seed-branch fence
// (no durable state). The joiner's router evidence is exactly what
// getCurrentPrimaryConnectionBootIncarnation yields after only the acceptor
// IDENTIFY reply: the outbound primary bound with the seed's incarnation plus
// the local boot-incarnation identity; no binding to the other joiner.
//
// Consumer read path (formation-release-handoff-consumer-read-path quest,
// GCP streak 9d5deb4f1): a joiner that hosts no control_plane_publications
// replica reads the authority publication through query routing while every
// replica host is recovery-pending. Its storage owner here runs the REAL
// owner read-option builder, the REAL frozen read-authority token and the
// REAL priority-recovery bootstrap routing grace against the replica host
// exactly as the readiness owner reports it; a refused read unwraps to no row
// (all_services_filtered_by_readiness controlPlaneRecoveryEligible). The
// joiner's system-table cache holds the row its catch-up hydration copied.

import assert from 'node:assert/strict';

import {TABLES} from '../../src/constants/index.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  buildControlPlaneReadAuthority,
} from '../../src/control-plane/control-plane-system-table-gateway-read-contracts.js';
import {
  FORMATION_RELEASE_HANDOFF_STATE,
} from '../../src/control-plane/formation-release-handoff-closure-owner.js';
import {
  ControlPlanePublicationsOwner,
} from '../../src/control-plane/owners/control-plane-publications-owner.js';
import {
  shouldAllowPriorityRecoveryBootstrapRoutingGrace,
} from '../../src/query/query-executor-priority-recovery-bootstrap-routing.js';
import {QUERY_EXECUTOR_SHARED} from '../../src/query/query-executor-shared.js';
import {
  buildClusterIncarnationFence,
} from '../../src/bootstrap/cluster-incarnation-fence.js';
import {
  NodeJoiningReadySignalReadiness,
} from '../../src/bootstrap/node-joining-ready-signal-readiness.js';
import {
  NODE_JOINING_SERVICE_SHARED,
} from '../../src/bootstrap/node-joining-service-shared.js';
import {NodeService} from '../../src/node/node-service.js';

const {STARTUP_JOIN_MODE} = NODE_JOINING_SERVICE_SHARED;
const {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON: RECOVERY_REASON,
  CONTROL_PLANE_READINESS_DIMENSION: DIMENSION,
  CONTROL_PLANE_READINESS_REASON: READINESS_REASON,
  QUERY_EXECUTOR_ROUTING_OPTION_FIELD: ROUTING_OPTION,
} = QUERY_EXECUTOR_SHARED;

// ── hoisted constants ──────────────────────────────────────────────────────
const NOW = 10_000;
const REOPEN_AT = NOW + 500;
const ACK_AT = NOW + 1;
const READY_LEASE_MS = 60_000;
const SEED = 'seed';
const JOINER_A = 'joiner-a';
const JOINER_B = 'joiner-b';
const SEED_ADDRESS = 'seed-host:9000';
const CANONICAL_NODE_IDS = Object.freeze([JOINER_A, JOINER_B, SEED]);
const CAPTURED_EPOCH = 41;
const REGRESSED_EPOCH = 40;
const BOOT_INCARNATION = 1;
const RESTARTED_BOOT_INCARNATION = 2;
const STATE_READY = 'ready';
const STATE_RECOVERY_PENDING = 'recovery_pending';
const STATE_BLOCKED = 'blocked';
const REASON_NOT_SPREAD = 'priority_partitions_not_spread';
const REASON_NOT_WRITABLE = 'control_plane_not_writable';
const ADMISSION_ADMITTED = 'admitted';
const ADMISSION_BLOCKED = 'blocked';
const ADMISSION_UNAVAILABLE = 'unavailable';
const NODE_STATUS_JOINING = 'joining';
const NODE_STATUS_ACTIVE = 'active';
const CONNECTION_CONNECTED = 'connected';
const CONNECTION_READY = 'ready';
const TABLE_NODES = 'nodes';
const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const BARRIER_STATE_SATISFIED = 'ledger_spread_satisfied';
const BARRIER_STATE_WAITING_AUTHORITY = 'waiting_for_startup_authority';
const BARRIER_TIMEOUT_CODE = 'OPERATION_LEDGER_FORMATION_BARRIER_TIMEOUT';
const BARRIER_TIMEOUT_MS = 20;
const BARRIER_POLL_MS = 1;
const FENCE_ABSENT = Symbol('fence-absent');
// Consumer read path: the priority control-plane partition every joiner reads
// the contract from, the typed recovery-routing lanes of the read-authority
// token, and the typed contract-source outcomes of the publication module.
const CPP_PARTITION_ID = 'control_plane_publications-p1';
const RECOVERY_ROUTING_FIELD = 'recoveryRouting';
const RECOVERY_ROUTING_ELIGIBLE_ONLY = 'eligible_only';
const RECOVERY_ROUTING_PRIORITY_RECOVERY_BOOTSTRAP =
  'priority_recovery_bootstrap';
const RECOVERY_ROUTING_ABSENT = 'absent';
const BOOTSTRAP_GRACE_REASON_CODES = Object.freeze([
  READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
  RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
]);

// The two real startup-branch fences (src/bootstrap/cluster-incarnation-fence.js
// as driven by src/lagrange-runtime-startup.js): the seed boots over a fresh
// data directory; the joiner persists rejoin hints (identity + seed peer
// addresses) before resolving its fence.
const SEED_FENCE = buildClusterIncarnationFence({durableStateDetected: false});
const JOINER_FENCE = buildClusterIncarnationFence({
  durableStateDetected: true,
  localIdentityMatched: true,
  peerProofRequired: true,
  peerAddresses: [SEED_ADDRESS],
});
const BLOCKED_JOINER_FENCE = buildClusterIncarnationFence({
  durableStateDetected: true,
  localIdentityMatched: false,
  peerProofRequired: true,
  peerAddresses: [SEED_ADDRESS],
});


// ── fixture ────────────────────────────────────────────────────────────────
function buildAdmission(fence) {
  if (fence === FENCE_ABSENT) {
    return Object.freeze({
      state: ADMISSION_UNAVAILABLE,
      admitted: false,
      reasonCodes: Object.freeze([]),
      clusterIncarnationFence: null,
    });
  }
  return Object.freeze({
    state: fence.allowed === true ? ADMISSION_ADMITTED : ADMISSION_BLOCKED,
    admitted: fence.allowed === true,
    reasonCodes: Object.freeze([...fence.reasonCodes]),
    clusterIncarnationFence: fence,
  });
}

function buildAuthority({
  ready = true,
  state = ready ? STATE_READY : STATE_RECOVERY_PENDING,
  satisfied = ready,
  reasonCodes = ready ? [] : [REASON_NOT_SPREAD],
  publicationEpoch = CAPTURED_EPOCH,
  canonicalNodeIds = CANONICAL_NODE_IDS,
  fence = SEED_FENCE,
} = {}) {
  return Object.freeze({
    state,
    ready,
    authorityAvailable: true,
    publicationEpoch,
    publicationStatus: PUBLICATION_STATUS_PUBLISHED,
    priorityPartitionSummary: Object.freeze({satisfied}),
    priorityRecoveryReasonCodes: Object.freeze([...reasonCodes]),
    canonicalStartupNodeIds: Object.freeze([...canonicalNodeIds]),
    admission: buildAdmission(fence),
  });
}

function buildNode(nodeId, {
  status = NODE_STATUS_JOINING,
  connectionState = CONNECTION_CONNECTED,
  bootIncarnation = BOOT_INCARNATION,
  readyLeaseExpiresAt = null,
} = {}) {
  return Object.freeze({
    node_id: nodeId,
    status,
    connection_state: connectionState,
    boot_incarnation: bootIncarnation,
    ready_lease_expires_at: readyLeaseExpiresAt,
  });
}

function buildReadyNode(nodeId) {
  return buildNode(nodeId, {
    status: NODE_STATUS_ACTIVE,
    connectionState: CONNECTION_READY,
    readyLeaseExpiresAt: NOW + READY_LEASE_MS,
  });
}

function buildRows() {
  return [buildReadyNode(SEED), buildNode(JOINER_A), buildNode(JOINER_B)];
}

function buildCache(rows) {
  return {
    getAll(tableName) {
      return tableName === TABLE_NODES ? rows : [];
    },
    get() {
      return null;
    },
    filter(tableName, predicate) {
      return this.getAll(tableName).filter(predicate);
    },
    onCacheChange() {},
  };
}

// A router whose primary-connection evidence is bound only for `boundNodeIds`
// (the seed binds every peer; a joiner after the acceptor IDENTIFY reply binds
// only the seed). Incarnations default to 1 and may be overridden per node.
function buildRouter({
  localNodeId,
  boundNodeIds,
  localIncarnation = BOOT_INCARNATION,
  incarnations = {},
}) {
  const bound = new Set(boundNodeIds);
  return {
    bound,
    getLocalBootIncarnationIdentity() {
      return Object.freeze({
        nodeId: localNodeId,
        bootIncarnation: localIncarnation,
        connectionId: `local:${localNodeId}:${localIncarnation}`,
      });
    },
    getCurrentPrimaryConnectionBootIncarnation(nodeId) {
      if (!bound.has(nodeId)) return null;
      const bootIncarnation = incarnations[nodeId] ?? BOOT_INCARNATION;
      return Object.freeze({
        nodeId,
        bootIncarnation,
        connectionId: `primary:${nodeId}:${bootIncarnation}`,
      });
    },
    getConnectionState() {
      return CONNECTION_CONNECTED;
    },
  };
}

// The durable store keyed by publication id; it records the read options of
// every durable read so the exemption's scope is observable.
function buildStorageOwner() {
  let durableRow = null;
  const publishers = [];
  const readOptions = [];
  return {
    async upsertPublication(row) {
      durableRow = row;
      publishers.push(row.publisher_node_id);
      return row;
    },
    async getPublication(publicationId, options) {
      readOptions.push(options);
      return this.durableRow(publicationId);
    },
    durableRow(publicationId) {
      return durableRow && durableRow.publication_id === publicationId ?
        durableRow :
        null;
    },
    publisherNodeIds() {
      return [...publishers];
    },
    readOptions() {
      return [...readOptions];
    },
  };
}

// The replica host exactly as the readiness owner reports it to query routing
// during the priority-spread reopen: every liveness dimension holds and only
// recovery eligibility fails, for the two bootstrap-grace reasons. Extra
// failed dimensions/reasons model a host that is genuinely unhealthy.
function buildRecoveryPendingHostReport({
  reasonCodes = BOOTSTRAP_GRACE_REASON_CODES,
  failedDimensions = [DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE],
} = {}) {
  const dimensions = {
    [DIMENSION.PROCESS_ALIVE]: true,
    [DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
    [DIMENSION.LOAD_READY]: true,
    [DIMENSION.CONTROL_PLANE_PUBLISHED]: true,
    [DIMENSION.METADATA_PUBLICATION_HEALTHY]: true,
    [DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
  };
  for (const dimension of failedDimensions) dimensions[dimension] = false;
  return Object.freeze({
    readiness: Object.freeze({
      dimensions: Object.freeze(dimensions),
      reasons: Object.freeze(reasonCodes.map((code) => Object.freeze({code}))),
    }),
    decision: Object.freeze({
      eligible: false,
      failedDimensions: Object.freeze([...failedDimensions]),
      reasonCodes: Object.freeze([...reasonCodes]),
    }),
  });
}

const RECOVERY_PENDING_HOST_REPORT = buildRecoveryPendingHostReport();
const UNHEALTHY_HOST_REPORT = buildRecoveryPendingHostReport({
  reasonCodes: [
    ...BOOTSTRAP_GRACE_REASON_CODES,
    READINESS_REASON.CLUSTER_MEMBER_UNHEALTHY,
  ],
  failedDimensions: [
    DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    DIMENSION.CLUSTER_MEMBER_HEALTHY,
  ],
});

// A joiner hosting no control_plane_publications replica: its durable reads
// route through the real owner read options -> the real frozen read-authority
// token -> the real priority-recovery bootstrap routing grace against the
// reported replica host. A refused read unwraps to no row, as the owner
// reports all_services_filtered_by_readiness controlPlaneRecoveryEligible.
function buildNonHostingStorageOwner(storageOwner, hostReport) {
  const readOptionsOwner = Object.create(ControlPlanePublicationsOwner.prototype);
  const reads = [];
  return {
    reads,
    async upsertPublication(row, options) {
      return storageOwner.upsertPublication(row, options);
    },
    async getPublication(publicationId, options) {
      const readAuthority = buildControlPlaneReadAuthority(
        readOptionsOwner.buildPublicationReadOptions(options),
      );
      const routable = shouldAllowPriorityRecoveryBootstrapRoutingGrace({
        partitionId: CPP_PARTITION_ID,
        partitionRow: null,
        routingReadinessDimension: readAuthority.routingReadinessDimension,
        routingOptions: {
          [ROUTING_OPTION.FOR_READ]: true,
          [ROUTING_OPTION.ALLOW_PRIORITY_RECOVERY_BOOTSTRAP]: false,
          [ROUTING_OPTION.READ_AUTHORITY]: readAuthority,
        },
        readiness: hostReport.readiness,
        decision: hostReport.decision,
      });
      reads.push({
        recoveryRouting: readAuthority[RECOVERY_ROUTING_FIELD] ??
          RECOVERY_ROUTING_ABSENT,
        routable,
      });
      return routable ?
        storageOwner.getPublication(publicationId, options) :
        null;
    },
    publisherNodeIds() {
      return storageOwner.publisherNodeIds();
    },
  };
}

// The joiner's system-table cache after its catch-up hydration copied the
// authority publication row (keyed by publication id, live with the store).
function buildHydratedCache(rows, storageOwner, forgeRow = (row) => row) {
  const cache = buildCache(rows);
  cache.get = (tableName, key) => {
    const row = tableName === TABLES.CONTROL_PLANE_PUBLICATIONS ?
      storageOwner.durableRow(key) :
      null;
    return row ? forgeRow(row) : null;
  };
  return cache;
}

function buildService({nodeId, cache, router, storageOwner, authority}) {
  const service = new ControlPlaneReadinessService({
    nodeId,
    formationReleaseAuthorityNodeId: SEED,
    systemTableCache: cache,
    messageRouter: router,
    membershipPublicationService: {
      controlPlanePublicationsOwner: storageOwner,
    },
    now: () => NOW,
  });
  service.getPriorityRecoveryPlanningAnswerSync = () => ({
    authority: authority(),
  });
  service.getPriorityRecoveryPlanningAnswerForOwnerRead = async () => ({
    authority: authority(),
  });
  service.buildStartupAuthoritySnapshotFromPlanningAnswer = (answer) =>
    answer.authority;
  return service;
}

function buildSeed({rows, storageOwner, transitions = []}) {
  const seedView = {authority: buildAuthority()};
  const seed = buildService({
    nodeId: SEED,
    cache: buildCache(rows),
    router: buildRouter({localNodeId: SEED, boundNodeIds: CANONICAL_NODE_IDS}),
    storageOwner,
    authority: () => seedView.authority,
  });
  seed.logger = {
    info(message, details) {
      transitions.push({message, details});
    },
  };
  return {seed, seedView};
}

function buildJoiner({
  rows,
  storageOwner,
  nodeId = JOINER_A,
  cache = buildCache(rows),
  fence = JOINER_FENCE,
  authority = buildAuthority({ready: false, fence}),
  localIncarnation = BOOT_INCARNATION,
  seedIncarnation = BOOT_INCARNATION,
}) {
  const joinerView = {authority};
  const joiner = buildService({
    nodeId,
    cache,
    router: buildRouter({
      localNodeId: nodeId,
      boundNodeIds: [SEED],
      localIncarnation,
      incarnations: {[SEED]: seedIncarnation},
    }),
    storageOwner,
    authority: () => joinerView.authority,
  });
  return {joiner, joinerView, cache};
}

// A non-hosting joiner over the shared durable store: `hostReport` is the
// replica host as reported to routing, `hydrated` whether its cache holds the
// authority row, `forgeRow` tampers the cached row (negative controls).
function buildNonHostingJoiner({
  rows,
  storageOwner,
  hostReport = RECOVERY_PENDING_HOST_REPORT,
  hydrated = true,
  forgeRow = undefined,
  ...options
}) {
  const routedOwner = buildNonHostingStorageOwner(storageOwner, hostReport);
  const cache = hydrated ?
    buildHydratedCache(rows, storageOwner, forgeRow) :
    buildCache(rows);
  return {
    ...buildJoiner({rows, storageOwner: routedOwner, cache, ...options}),
    routedOwner,
  };
}

// Capture at t0 (non-authorizing), durable acknowledgement, then the
// priority-spread reopen at t0+500 ms with the generation retained.
async function driveSeedCaptureAndReopen({seed, seedView}) {
  const captured = seed.getStartupAuthoritySnapshotSync(SEED, NOW);
  assert.equal(captured.formationReleaseHandoff.releaseAuthorized, false,
    'capture is non-authorizing until durable acknowledgement');
  await seed.formationReleaseHandoffPublicationCoordinator.whenIdle();
  const acknowledged = seed.getStartupAuthoritySnapshotSync(SEED, ACK_AT);
  assert.equal(acknowledged.formationReleaseHandoff.releaseAuthorized, true);
  seedView.authority = buildAuthority({ready: false});
  const reopened = seed.getStartupAuthoritySnapshotSync(SEED, REOPEN_AT);
  assert.equal(reopened.formationReleaseHandoff.state,
    FORMATION_RELEASE_HANDOFF_STATE.ACTIVE);
  assert.equal(reopened.formationReleaseHandoff.releaseAuthorized, true,
    'the seed retains the generation with release authorized across the reopen');
  assert.equal(reopened.formationReleaseHandoff.generation,
    captured.formationReleaseHandoff.generation);
  return reopened.formationReleaseHandoff;
}

async function projectOnJoiner(joiner, at = REOPEN_AT) {
  return joiner.getFormationReleaseStartupAuthoritySnapshot(SEED, at);
}

function assertConsumedActive(snapshot, generation) {
  assert.ok(snapshot.formationReleaseHandoff,
    'the joiner projection must not null a valid retained generation');
  assert.equal(snapshot.formationReleaseHandoff.state,
    FORMATION_RELEASE_HANDOFF_STATE.ACTIVE);
  assert.equal(snapshot.formationReleaseHandoff.releaseAuthorized, true);
  assert.equal(snapshot.formationReleaseHandoff.generation, generation);
  assert.equal(snapshot.ready, true);
  assert.equal(snapshot.state, STATE_READY);
}

function assertFailedClosed(snapshot, label) {
  assert.equal(snapshot.formationReleaseHandoff, null,
    `${label}: a genuinely mismatched contract is not consumed`);
  assert.equal(snapshot.ready, false, `${label}: release stays withheld`);
}

async function buildRetainedFixture(options = {}) {
  const rows = buildRows();
  const storageOwner = buildStorageOwner();
  const transitions = [];
  const seedFixture = buildSeed({rows, storageOwner, transitions});
  const retained = await driveSeedCaptureAndReopen(seedFixture);
  const joinerFixture = buildJoiner({rows, storageOwner, ...options});
  return {rows, storageOwner, transitions, retained, ...seedFixture, ...joinerFixture};
}

function buildBarrierOwner({
  joiner,
  cache,
  clock,
  states,
  nodeId = JOINER_A,
}) {
  NodeService.getInstance().setSystemCacheProxy(cache);
  const owner = Object.create(NodeJoiningReadySignalReadiness.prototype);
  owner.nodeId = nodeId;
  owner.seedNodeId = SEED;
  owner.startupMode = STARTUP_JOIN_MODE.FRESH_JOIN;
  owner.config = {
    priorityPlacementFormationDiscoveryMs: 0,
    priorityPlacementFormationPollMs: BARRIER_POLL_MS,
    priorityPlacementFormationTimeoutMs: BARRIER_TIMEOUT_MS,
    heartbeatIntervalMs: BARRIER_TIMEOUT_MS,
  };
  owner.now = () => clock.now;
  owner.sleep = async (delayMs) => {
    clock.now += delayMs;
  };
  owner.logger = {
    info(_message, details) {
      states.push(details);
    },
    warn() {},
    error() {},
  };
  owner.messageRouter = joiner.messageRouter;
  owner.rebalanceCoordinator = {controlPlaneReadinessService: joiner};
  owner.getNodeCapabilities = () => [];
  owner.sendControlPlaneNodeStateUpdate = async () => {};
  return owner;
}

export {
  ACK_AT,
  BARRIER_STATE_SATISFIED,
  BARRIER_STATE_WAITING_AUTHORITY,
  BARRIER_TIMEOUT_CODE,
  BLOCKED_JOINER_FENCE,
  BOOT_INCARNATION,
  CAPTURED_EPOCH,
  FENCE_ABSENT,
  JOINER_A,
  JOINER_B,
  JOINER_FENCE,
  NOW,
  REASON_NOT_SPREAD,
  REASON_NOT_WRITABLE,
  RECOVERY_PENDING_HOST_REPORT,
  RECOVERY_ROUTING_ELIGIBLE_ONLY,
  RECOVERY_ROUTING_FIELD,
  RECOVERY_ROUTING_PRIORITY_RECOVERY_BOOTSTRAP,
  REGRESSED_EPOCH,
  REOPEN_AT,
  RESTARTED_BOOT_INCARNATION,
  SEED,
  SEED_FENCE,
  STATE_BLOCKED,
  STATE_READY,
  STATE_RECOVERY_PENDING,
  UNHEALTHY_HOST_REPORT,
  assertConsumedActive,
  assertFailedClosed,
  buildAuthority,
  buildBarrierOwner,
  buildCache,
  buildJoiner,
  buildNode,
  buildNonHostingJoiner,
  buildNonHostingStorageOwner,
  buildReadyNode,
  buildRetainedFixture,
  buildRows,
  buildSeed,
  buildStorageOwner,
  projectOnJoiner,
};
