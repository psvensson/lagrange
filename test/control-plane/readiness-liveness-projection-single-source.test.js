/**
 * The shared node-liveness projection has one evidence source (fix-f4,
 * Fact 1 of the instrumented join-SLO classification at ab7669fd0).
 *
 * The planning identity rotates on every change of a node's shared liveness
 * component, and a rotation stales every completed planning record of the
 * reading node, for every read kind. Instrumented join runs (local repro of
 * tv-dator runs 2/4/5) showed the owner node's OWN liveness projection
 * flipping healthy <-> invalid several times per second: the planning build
 * projected it from the cache row, and the membership-publication planning
 * read (getAllNodeReadiness with allowAuthoritativeRefresh) projected it from
 * NO row, because the authoritative node read was unavailable
 * ({success:false, error:'authoritative_row_source_unavailable'}) and came
 * back as an empty row set. Each flip rotated the global planning
 * generation, so the REPLACE owner's reads of the seed were served the
 * deferred snapshot ~44 ms after the seed's own current publication, while
 * routed reads were bridged.
 *
 * Invariant: an evaluation over a row that is not the projection's source
 * row (an authoritative or preloaded row, or no row at all) answers for its
 * caller only; it never writes the shared projection, so it never rotates
 * the planning identity, and a read of every participation kind after it is
 * served the completed snapshot exactly as a routed read is.
 */
import {test} from '../../src/test-helpers/tap.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  CDC_OPERATION,
  COLUMN,
  NODE_STATE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STATE,
  TABLES,
} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_PUBLICATION_MODE,
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {NodeLivenessSemanticProjectionOwner} from
  '../../src/control-plane/node-liveness-semantic-projection-owner.js';
import {NodesOwner} from '../../src/control-plane/owners/nodes-owner.js';
import {ControlPlaneReadinessService} from
  '../../src/control-plane/control-plane-readiness-service.js';
import {isEvidenceAbsentReadinessDenialSnapshot} from
  '../../src/control-plane/readiness-denial-classification.js';
import {isDeferredReadinessPlanningSnapshot} from
  '../../src/control-plane/readiness-planning-version-contract.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

ConfigurationManager.getInstance().initialize();

const SELF_NODE_ID = 'node-owner-self';
const PEER_NODE_ID = 'node-seed-peer';
const START_MS = 300000;
const LEASE_MS = 15000;
const HEARTBEAT_AGE_MS = 100;
const WARM_ROUNDS = 20;
const ALTERNATION_CYCLES = 3;
// The production refusal of an authoritative row read (the listNodes result
// recorded on the owner node in the red join runs).
const UNAVAILABLE_AUTHORITATIVE_READ = Object.freeze({
  success: false,
  error: 'authoritative_row_source_unavailable',
});
const DIMENSION =
  CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
const PARTICIPATION_KINDS = Object.values(CONTROL_PLANE_PARTICIPATION_KIND);

function nodeRow(nodeId, heartbeatAtMs) {
  return {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.CONNECTION_STATE]: 'ready',
    [COLUMN.READY_LEASE_EXPIRES_AT]: START_MS + LEASE_MS,
    [COLUMN.LAST_HEARTBEAT]: heartbeatAtMs,
    [COLUMN.CPU_USAGE_PERCENT]: 10,
    [COLUMN.MEMORY_USAGE_PERCENT]: 10,
    [COLUMN.DISK_USAGE_PERCENT]: 10,
  };
}

function macrotask() {
  return new Promise((resolve) => setImmediate(resolve));
}

// The production NodesOwner over a gateway whose authoritative reads answer
// with the case's result (a list read) or that result narrowed to one key (a
// single-row read), and whose projection reads come from the cache: every
// owner method the readiness readers call (listNodes, getNode with its typed
// throw, the cache reads) is the production one.
function createNodesOwner(cache, authoritativeRead) {
  return new NodesOwner({
    controlPlaneSystemTableGateway: {
      async readAuthoritativeRows(_tableName, _sql, params) {
        const result = await authoritativeRead();
        if (params.length === 0 || result?.success !== true) return result;
        return {
          ...result,
          rows: result.rows.filter((row) => row[COLUMN.NODE_ID] === params[0]),
        };
      },
      async readProjectionRows(_tableName, options) {
        return {success: true, rows: options.readFromCache(cache)};
      },
    },
  });
}

async function createRig(authoritativeRead) {
  const clock = {now: START_MS};
  const cache = new SystemTableCache();
  for (const nodeId of [SELF_NODE_ID, PEER_NODE_ID]) {
    cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT,
      nodeRow(nodeId, START_MS - HEARTBEAT_AGE_MS));
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
      [COLUMN.SERVICE_ID]: `p1-${nodeId}`,
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      partition_id: 'p1',
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: `${nodeId}/partition/p1`,
    });
  }
  await macrotask();
  const service = new ControlPlaneReadinessService({
    nodeId: SELF_NODE_ID,
    systemTableCache: cache,
    now: () => clock.now,
    nodesOwner: createNodesOwner(cache, authoritativeRead),
    cdcGroupPropagationService: {
      getPublicationModeDiagnostics: () => ({
        currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
        reasonCode: null,
        enteredAt: new Date(START_MS).toISOString(),
        recentTransitions: [],
      }),
    },
  });
  return {cache, clock, service};
}

function read(service, nodeId, participationKind) {
  return service.getNodeReadinessSync(nodeId, {
    participationKind,
    decisionDimension: DIMENSION,
  });
}

async function warm(service) {
  for (let round = 0; round < WARM_ROUNDS; round += 1) {
    const deferred = [SELF_NODE_ID, PEER_NODE_ID].some((nodeId) =>
      PARTICIPATION_KINDS.some((kind) =>
        isDeferredReadinessPlanningSnapshot(read(service, nodeId, kind))));
    if (!deferred) return true;
    await macrotask();
  }
  return false;
}

function captureIdentity(service) {
  const owner = service.readinessPlanningSnapshotOwner;
  return {
    globalPlanningGeneration:
      owner.semanticGenerationTracker.globalPlanningGeneration,
    livenessGenerations: [SELF_NODE_ID, PEER_NODE_ID].map((nodeId) =>
      service.getNodeLivenessSemanticIdentity(nodeId, START_MS).generation),
  };
}

// A caller-held row at the cache row's own heartbeat watermark, differing
// only in content the projection reads.
function equalWatermarkRow(nodeId, overrides) {
  return {...nodeRow(nodeId, START_MS - HEARTBEAT_AGE_MS), ...overrides};
}

function authoritativeRows(buildRow) {
  return async () => ({
    success: true,
    rows: [SELF_NODE_ID, PEER_NODE_ID].map(buildRow),
  });
}

// Every relation of a caller-held row to the row the shared projection
// last projected (F4 coverage model): unavailable (no row), older, equal
// watermark with different status, equal watermark with different
// connection state, and no heartbeat watermark. `feedbackDivergent` names
// the cases whose row also changes the stored readiness snapshot's feedback
// signature: the planning identity then rotates through the readiness
// feedback channel (F-8, a separate owner decision), so for them only the
// shared liveness projection's half of the property is asserted here.
const NON_SOURCE_ROW_CASES = [
  {
    label: 'the authoritative node read is unavailable',
    authoritativeRead: async () => UNAVAILABLE_AUTHORITATIVE_READ,
  },
  {
    label: 'the authoritative node read returns rows older than the cache\'s',
    authoritativeRead: authoritativeRows((nodeId) =>
      nodeRow(nodeId, START_MS - LEASE_MS)),
  },
  {
    label: 'the authoritative node read returns rows at the cache\'s ' +
      'watermark with another status',
    authoritativeRead: authoritativeRows((nodeId) =>
      equalWatermarkRow(nodeId, {[COLUMN.STATUS]: NODE_STATE.DRAINING})),
    feedbackDivergent: true,
  },
  {
    label: 'the authoritative node read returns rows at the cache\'s ' +
      'watermark with another connection state',
    authoritativeRead: authoritativeRows((nodeId) =>
      equalWatermarkRow(nodeId, {
        [COLUMN.CONNECTION_STATE]: STATE.DISCONNECTED,
      })),
  },
  {
    label: 'the authoritative node read returns rows without a heartbeat ' +
      'watermark',
    authoritativeRead: authoritativeRows((nodeId) => ({
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    })),
    feedbackDivergent: true,
  },
];

function captureLivenessGenerations(service) {
  return captureIdentity(service).livenessGenerations;
}

for (const {label, authoritativeRead, feedbackDivergent} of
  NON_SOURCE_ROW_CASES) {
  test(`an evaluation over a non-source row ${feedbackDivergent ?
    'never moves the shared liveness projection' :
    'never rotates the planning identity nor defers any read kind'} ` +
    `(${label})`, async (t) => {
    const {service} = await createRig(authoritativeRead);
    t.teardown(() => service.shutdown());
    t.equal(await warm(service), true,
      'precondition: every read kind of both nodes is served a completed ' +
      'snapshot');
    // The first publication-planning evaluation may record its own readiness
    // feedback once (a separate owner: the evaluation stores a snapshot built
    // from the row it holds). The invariant is the steady alternation the
    // red runs recorded: planning builds and publication-planning
    // evaluations interleaving, several times per second.
    await service.getAllNodeReadiness({allowAuthoritativeRefresh: true});
    await warm(service);
    const before = captureIdentity(service);
    for (let cycle = 0; cycle < ALTERNATION_CYCLES; cycle += 1) {
      await service.getAllNodeReadiness({allowAuthoritativeRefresh: true});
      t.same(captureLivenessGenerations(service), before.livenessGenerations,
        `cycle ${cycle}: the shared liveness projection did not move`);
      if (!feedbackDivergent) {
        t.same(captureIdentity(service), before,
          `cycle ${cycle}: the planning identity did not move`);
        assertEveryReadKindServed(t, service, `cycle ${cycle}`);
      }
      await warm(service);
    }
  });

  test('a single-row authoritative readiness read over a non-source row ' +
    `never moves the shared liveness projection (${label})`, async (t) => {
    const {service} = await createRig(authoritativeRead);
    t.teardown(() => service.shutdown());
    t.equal(await warm(service), true, 'precondition: settled');
    const before = captureLivenessGenerations(service);
    for (const nodeId of [SELF_NODE_ID, PEER_NODE_ID]) {
      const outcome = await service.getNodeReadiness(nodeId, {
        allowAuthoritativeRefresh: true,
        decisionDimension: DIMENSION,
        maxCachedAgeMs: 0,
      }).then(() => null, (error) => error);
      const unavailable = (await authoritativeRead()).success !== true;
      // The single-row owner read's unavailability outcome is its typed
      // throw (the dispatch path defers on it); rows never throw.
      t.equal(outcome !== null, unavailable,
        `${nodeId}: the single-row read ${unavailable ?
          'surfaces the typed unavailability' : 'answers'}`);
      t.same(captureLivenessGenerations(service), before,
        `${nodeId}: the shared liveness projection did not move`);
    }
  });
}

function assertEveryReadKindServed(t, service, label) {
  for (const nodeId of [SELF_NODE_ID, PEER_NODE_ID]) {
    const routed = isDeferredReadinessPlanningSnapshot(
      read(service, nodeId, CONTROL_PLANE_PARTICIPATION_KIND.ROUTED_READ));
    for (const kind of PARTICIPATION_KINDS) {
      const deferred = isDeferredReadinessPlanningSnapshot(
        read(service, nodeId, kind));
      t.equal(deferred, false,
        `${label}: ${kind} read of ${nodeId} is served the completed snapshot`);
      t.equal(deferred, routed,
        `${label}: ${kind} and routed reads of ${nodeId} agree`);
    }
  }
}

test('the shared liveness projection moves forward only: an absent or ' +
  'older caller-held row answers its caller and records nothing',
async (t) => {
  let sourceRow = nodeRow(PEER_NODE_ID, START_MS - HEARTBEAT_AGE_MS);
  const owner = new NodeLivenessSemanticProjectionOwner({
    localNodeId: SELF_NODE_ID,
    now: () => START_MS,
    setTimeoutFn: () => null,
    clearTimeoutFn: () => {},
    thresholds: {clusterMemberStaleHeartbeatMs: LEASE_MS},
    readNodeEvidence: () => ({nodeRow: sourceRow, transportConnected: true}),
  });
  t.teardown(() => owner.shutdown());
  const changes = [];
  owner.subscribe((change) => changes.push(change));
  const recorded = owner.projectNodeLivenessFromEvidence(PEER_NODE_ID,
    {nodeRow: sourceRow, transportConnected: true}, START_MS);
  const generation =
    owner.getNodeLivenessSemanticIdentity(PEER_NODE_ID, START_MS).generation;
  const changesBefore = changes.length;
  for (const [label, row] of [
    ['absent row', null],
    ['older row', nodeRow(PEER_NODE_ID, START_MS - LEASE_MS * 2)],
  ]) {
    const answered = owner.projectNodeLivenessFromEvidence(PEER_NODE_ID,
      {nodeRow: row, transportConnected: true}, START_MS);
    t.not(answered.heartbeatFreshness.clusterMembership,
      recorded.heartbeatFreshness.clusterMembership,
      `${label}: the caller is answered from its own evidence`);
    t.equal(owner.getNodeLivenessSemanticIdentity(PEER_NODE_ID, START_MS)
      .generation, generation, `${label}: the shared projection did not move`);
  }
  t.equal(changes.length, changesBefore, 'no semantic change was published');
  sourceRow = null;
  owner.recordNodeSourceChange(PEER_NODE_ID, START_MS);
  t.not(owner.getNodeLivenessSemanticIdentity(PEER_NODE_ID, START_MS)
    .generation, generation,
  'the row\'s absence reaches the projection from its source');
});

function createProjectionOwner(sourceRow) {
  return new NodeLivenessSemanticProjectionOwner({
    localNodeId: SELF_NODE_ID,
    now: () => START_MS,
    setTimeoutFn: () => null,
    clearTimeoutFn: () => {},
    thresholds: {clusterMemberStaleHeartbeatMs: LEASE_MS},
    readNodeEvidence: () => ({nodeRow: sourceRow, transportConnected: true}),
  });
}

const PROJECTED_ROW = nodeRow(PEER_NODE_ID, START_MS - HEARTBEAT_AGE_MS);
const WATERMARK_LESS_ROW = Object.freeze({
  [COLUMN.NODE_ID]: PEER_NODE_ID,
  [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
});
// The coverage model's caller-held-row dimension against a projected row,
// with whether the shared projection may take the candidate.
const CALLER_HELD_ROW_CASES = [
  ['strictly newer, other content', PROJECTED_ROW, {
    ...nodeRow(PEER_NODE_ID, START_MS - HEARTBEAT_AGE_MS + 1),
    [COLUMN.STATUS]: NODE_STATE.DRAINING,
  }, true],
  ['equal watermark, same content', PROJECTED_ROW, {...PROJECTED_ROW}, true],
  ['equal watermark, other status', PROJECTED_ROW,
    equalWatermarkRow(PEER_NODE_ID, {[COLUMN.STATUS]: NODE_STATE.DRAINING}),
    false],
  ['equal watermark, other connection state', PROJECTED_ROW,
    equalWatermarkRow(PEER_NODE_ID, {
      [COLUMN.CONNECTION_STATE]: STATE.DISCONNECTED,
    }), false],
  ['no watermark over a watermarked row', PROJECTED_ROW, WATERMARK_LESS_ROW,
    false],
  ['older', PROJECTED_ROW, nodeRow(PEER_NODE_ID, START_MS - LEASE_MS * 2),
    false],
  ['absent', PROJECTED_ROW, null, false],
  ['a watermark over a watermark-less row', WATERMARK_LESS_ROW, PROJECTED_ROW,
    true],
];

test('the shared liveness projection takes a caller-held row only when it ' +
  'is strictly newer by watermark or the same view at the same watermark',
async (t) => {
  for (const [label, projectedRow, candidateRow, recorded] of
    CALLER_HELD_ROW_CASES) {
    const owner = createProjectionOwner(projectedRow);
    const projected = owner.projectNodeLivenessFromEvidence(PEER_NODE_ID,
      {nodeRow: projectedRow, transportConnected: true}, START_MS);
    const answered = owner.projectNodeLivenessFromEvidence(PEER_NODE_ID,
      {nodeRow: candidateRow, transportConnected: true}, START_MS);
    // The oracle for "recorded": the projection now answers every caller
    // with the candidate's own evaluation; not recorded: with the projected
    // row's.
    const shared = owner.projectNodeLiveness(PEER_NODE_ID, START_MS);
    t.same(shared.clusterMembershipSemantics,
      (recorded ? answered : projected).clusterMembershipSemantics,
      `${label}: ${recorded ? 'recorded' : 'answers its caller only'}`);
    if (!recorded) {
      for (let alternation = 0; alternation < 3; alternation += 1) {
        owner.projectNodeLivenessFromEvidence(PEER_NODE_ID,
          {nodeRow: projectedRow, transportConnected: true}, START_MS);
        owner.projectNodeLivenessFromEvidence(PEER_NODE_ID,
          {nodeRow: candidateRow, transportConnected: true}, START_MS);
      }
      t.same(owner.projectNodeLiveness(PEER_NODE_ID, START_MS),
        projected, `${label}: alternating the two views never moves it`);
    }
    owner.shutdown();
  }
});

// F-3 of the round-1 verification: the evidence-absent carve-outs count a
// node deferred over its last ELIGIBLE verdict. That counting window opens
// when the node's own liveness change rotates the planning identity and
// closes when the node's variant rebuild lands its denial. The window's
// bound is that rebuild latency, in planning-queue drains: at most the
// builds queued when the deferral was served. Once the rebuilt denial is
// served, no second deferral of the node is served for the same rotation.
const LIVENESS_LOSS_ADVANCE_MS = LEASE_MS * 4;
const SETTLED_READS_AFTER_DENIAL = 3;
// A dimension the liveness loss denies. controlPlaneRecoveryEligible does
// not: a lapsed member stays recovery-eligible (the pre-existing
// two-authority finding, recorded for its owner in evidence-readiness-f4).
const LIVENESS_DIMENSION =
  CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY;

function readOn(service, nodeId, participationKind) {
  return service.getNodeReadinessSync(nodeId, {
    participationKind,
    decisionDimension: LIVENESS_DIMENSION,
  });
}

test('a rotation caused by a node\'s own liveness change lands that node\'s ' +
  'rebuilt denial within the queued builds, and no second deferral follows',
async (t) => {
  const {clock, service} =
    await createRig(async () => UNAVAILABLE_AUTHORITATIVE_READ);
  t.teardown(() => service.shutdown());
  t.equal(await warm(service), true, 'precondition: settled');
  const kind = CONTROL_PLANE_PARTICIPATION_KIND.REPLICA_OPERATION_OWNER_READ;
  let eligibleBefore = readOn(service, PEER_NODE_ID, kind);
  for (let round = 0; round < WARM_ROUNDS &&
    isDeferredReadinessPlanningSnapshot(eligibleBefore); round += 1) {
    await macrotask();
    eligibleBefore = readOn(service, PEER_NODE_ID, kind);
  }
  t.equal(eligibleBefore.dimensions[LIVENESS_DIMENSION], true,
    'precondition: the last completed verdict is eligible');
  const generationBefore = captureIdentity(service).globalPlanningGeneration;

  clock.now = START_MS + LIVENESS_LOSS_ADVANCE_MS;
  const first = readOn(service, PEER_NODE_ID, kind);
  t.ok(captureIdentity(service).globalPlanningGeneration > generationBefore,
    'the liveness loss rotated the planning identity');
  t.equal(isDeferredReadinessPlanningSnapshot(first), true,
    'the first read after the rotation is a deferral');
  t.equal(isEvidenceAbsentReadinessDenialSnapshot(first), true,
    'over the eligible verdict it is evidence-absent (the window opens)');
  const queuedBuilds = service.readinessPlanningSnapshotOwner.getDiagnostics()
    .pendingOwnerKeys.length;

  let drains = 0;
  let answer = first;
  while (isDeferredReadinessPlanningSnapshot(answer) &&
    drains <= queuedBuilds) {
    await macrotask();
    drains += 1;
    answer = readOn(service, PEER_NODE_ID, kind);
  }
  t.ok(drains <= queuedBuilds, `the rebuilt answer landed within the ${
    queuedBuilds} queued builds (${drains} drains)`);
  t.equal(isDeferredReadinessPlanningSnapshot(answer), false,
    'the rebuilt answer is a completed snapshot');
  t.equal(answer.dimensions[LIVENESS_DIMENSION], false, 'it denies the dimension');
  t.equal(isEvidenceAbsentReadinessDenialSnapshot(answer), false,
    'with substantive reasons (the window closed)');
  for (let index = 0; index < SETTLED_READS_AFTER_DENIAL; index += 1) {
    await macrotask();
    t.equal(isDeferredReadinessPlanningSnapshot(
      readOn(service, PEER_NODE_ID, kind)), false,
    `read ${index + 1} after the denial: no second deferral`);
  }
});
