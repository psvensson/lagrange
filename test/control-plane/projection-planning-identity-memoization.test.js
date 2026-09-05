/**
 * Identity memoization across the projection-evidence planning path.
 *
 * The profiled GCP run archived as
 * run-2026-08-15T16-36-59-912Z-profiled-manual captured the residual seed
 * freeze (18.3s max gap) inside normalizeProjectionReadinessOwnDataGraph:
 * every deferred planning read minted a fresh evidence graph (so the
 * identity-keyed retention could never hit for evidence-absent joiners),
 * per-node projection state was rebuilt per derivation pass, and the
 * publication recovery gate was rebuilt thousands of times per burst from
 * the same memoized frozen planning snapshot. Each build is a pure frozen
 * derivation of its source, so one build per source identity is exact.
 */
import {test} from '../../src/test-helpers/tap.js';
import {
  ReadinessPlanningSnapshotOwner,
} from '../../src/control-plane/readiness-planning-snapshot-owner.js';
import {
  resolveProjectionReadinessStateForEntry,
} from '../../src/control-plane/projection-readiness-state.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  getSharedSyncSectionRegistry,
} from '../../src/diagnostics/event-loop-gap-watchdog.js';

const OWNER_NODE_ID = 'node-identity-memo';
const JOINER_OWNER_KEY = 'node-identity-joiner';
const GATE_BUILD_SECTION = 'publication_recovery_gate_snapshot_build';
const REPEAT_READS = 10;

function createVersionedTableCache() {
  const versions = new Map();
  return {
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
    filter() {
      return [];
    },
    addListener() {},
  };
}

function readGateBuildCount() {
  const site = getSharedSyncSectionRegistry().sites.get(GATE_BUILD_SECTION);
  return site ? site.count : 0;
}

test('a deferred planning snapshot keeps one identity per owner and token ' +
  'generation', async (t) => {
  const owner = new ReadinessPlanningSnapshotOwner({
    service: {},
    now: () => 1000,
    scheduleDrainFn: () => {},
  });
  t.teardown(() => owner.shutdown());
  // Consume the initial-bootstrap shortcut on a different owner so joiner
  // reads take the deferred path.
  owner.readSync(OWNER_NODE_ID, {}, () => ({nodeId: OWNER_NODE_ID}));

  const reads = [];
  for (let index = 0; index < REPEAT_READS; index++) {
    reads.push(owner.readSync(JOINER_OWNER_KEY, {}, () => {
      throw new Error('deferred read must not build');
    }));
  }
  t.ok(reads[0] && reads[0].readinessPlanningTokenStatus === 'stale',
    'the joiner read defers');
  t.equal(reads[0], reads[REPEAT_READS - 1],
    'repeated deferred reads share one frozen snapshot identity');

  owner.recordTableChange('nodes');
  const afterWrite = owner.readSync(JOINER_OWNER_KEY, {}, () => {
    throw new Error('deferred read must not build');
  });
  t.not(afterWrite, reads[0],
    'a source-table write rotates the deferred snapshot identity');
  t.end();
});

test('per-entry projection readiness state resolves to one frozen build ' +
  'per entry identity', async (t) => {
  const entry = Object.freeze({nodeId: OWNER_NODE_ID, dimensions: {}});
  const first = resolveProjectionReadinessStateForEntry(entry);
  const second = resolveProjectionReadinessStateForEntry(entry);
  t.equal(first, second,
    'the same readiness entry shares one projection state');
  const other = resolveProjectionReadinessStateForEntry(
    Object.freeze({nodeId: 'node-identity-other', dimensions: {}}),
  );
  t.not(other, first,
    'a different entry never reuses another entry’s state');
  t.equal(
    resolveProjectionReadinessStateForEntry(null),
    resolveProjectionReadinessStateForEntry(null),
    'entry-less resolution shares the empty-source state');
  t.end();
});

test('the planning answer fails closed while an observed source revision is ' +
  'unclassified', async (t) => {
  const cache = createVersionedTableCache();
  const readiness = new ControlPlaneReadinessService({
    nodeId: OWNER_NODE_ID,
    systemTableCache: cache,
    now: () => 1000,
    membershipPublicationService: {
      deriveClusterMembershipCandidateSync() {
        return {publishedActiveNodeIds: [OWNER_NODE_ID]};
      },
    },
  });
  const first =
    readiness.getPriorityRecoveryPlanningAnswerSync(OWNER_NODE_ID, 1000);
  cache.bump('nodes');
  readiness.membershipPublicationPlanningSourceRevision += 1;
  const second =
    readiness.getPriorityRecoveryPlanningAnswerSync(OWNER_NODE_ID, 1100);
  t.not(second, first,
    'an unclassified write cannot reuse the pre-write projection identity');
  // While the write stays unclassified the planning identity is saturated:
  // snapshot admission stays fail closed (the identity itself never reads as
  // current), but the projection memo falls back to the floored table-version
  // key, so a second read at the SAME table versions shares the projection
  // instead of re-deriving it (a per-read rebuild under formation write
  // bursts starved the seed: 98% memo misses, 45s CPU per join).
  t.equal(
    readiness.readPlanningProjectionIdentity(OWNER_NODE_ID)?.saturated,
    true,
    'the planning identity stays saturated while the write is unclassified',
  );
  t.equal(
    readiness.readCurrentPlanningProjectionIdentity(OWNER_NODE_ID),
    null,
    'a saturated identity is not a memo currency',
  );
  const third =
    readiness.getPriorityRecoveryPlanningAnswerSync(OWNER_NODE_ID, 1400);
  t.equal(third, second,
    'reads at unchanged table versions share the projection while unclassified');
  cache.bump('nodes');
  readiness.membershipPublicationPlanningSourceRevision += 1;
  // Past the floored key's latch window the moved table version is visible.
  const fourth =
    readiness.getPriorityRecoveryPlanningAnswerSync(OWNER_NODE_ID, 2400);
  t.not(fourth, third,
    'a further write still forces a fresh projection (floored key moved)');
  t.end();
});

test('the planning answer projection keeps one identity per input snapshot ' +
  'and floored generation on the recovery-inactive path', async (t) => {
  const cache = createVersionedTableCache();
  const readiness = new ControlPlaneReadinessService({
    nodeId: OWNER_NODE_ID,
    systemTableCache: cache,
    now: () => 1000,
  });
  const inputSnapshot = Object.freeze({
    publicationEpoch: 2,
    publicationStatus: 'PUBLISHED',
    publishedActiveNodeIds: Object.freeze([OWNER_NODE_ID]),
  });
  const first = readiness.resolvePriorityRecoveryPlanningAnswer(
    OWNER_NODE_ID, 1000, inputSnapshot);
  const second = readiness.resolvePriorityRecoveryPlanningAnswer(
    OWNER_NODE_ID, 1100, inputSnapshot);
  t.equal(second, first,
    'the same input snapshot within one floor window resolves to one ' +
      'projection identity');
  cache.bump('nodes');
  const third = readiness.resolvePriorityRecoveryPlanningAnswer(
    OWNER_NODE_ID, 1400, inputSnapshot);
  t.not(third, first,
    'the next floored generation reprojects');
  t.end();
});

test('the planning answer memo survives a candidate that proposes the next ' +
  'publication epoch', async (t) => {
  const cache = createVersionedTableCache();
  const createMembershipOwner = (latestRow) => ({
    // The derived candidate proposes the NEXT epoch by construction while
    // the owner row still shows the current one.
    deriveClusterMembershipCandidateSync() {
      return {
        publicationEpoch: 4,
        status: 'OPEN',
        publishedActiveNodeIds: [OWNER_NODE_ID],
      };
    },
    getLatestMembershipPublicationEpochStatusForNodeSync() {
      return latestRow;
    },
  });
  const readiness = new ControlPlaneReadinessService({
    nodeId: OWNER_NODE_ID,
    systemTableCache: cache,
    now: () => 1000,
    membershipPublicationService: createMembershipOwner({
      publicationEpoch: 3,
      status: 'PUBLISHED',
    }),
  });
  const first =
    readiness.getPriorityRecoveryPlanningAnswerSync(OWNER_NODE_ID, 1000);
  const second =
    readiness.getPriorityRecoveryPlanningAnswerSync(OWNER_NODE_ID, 1100);
  t.equal(second, first,
    'a stable publication row keeps the memoized answer despite the ' +
      'next-epoch candidate');
  readiness.syncOwnerDependencies({
    membershipPublicationService: createMembershipOwner({
      publicationEpoch: 4,
      status: 'PUBLISHED',
    }),
  });
  const third =
    readiness.getPriorityRecoveryPlanningAnswerSync(OWNER_NODE_ID, 1150);
  t.not(third, first,
    'an owner-observed publication advance rebuilds immediately');
  t.end();
});

test('the startup-authority snapshot resolves to one identity per planning ' +
  'answer', async (t) => {
  const {buildStartupAuthoritySnapshotFromPlanningAnswer} =
    await import(
      '../../src/control-plane/startup-authority-snapshot-owner.js');
  const answer = Object.freeze({
    publicationEpoch: 2,
    publicationStatus: 'PUBLISHED',
    publishedActiveNodeIds: Object.freeze([OWNER_NODE_ID]),
  });
  const first = buildStartupAuthoritySnapshotFromPlanningAnswer(answer);
  const second = buildStartupAuthoritySnapshotFromPlanningAnswer(answer);
  t.equal(first, second,
    'the same planning answer shares one startup-authority snapshot');
  const other = buildStartupAuthoritySnapshotFromPlanningAnswer(
    Object.freeze({...answer, publicationEpoch: 3}),
  );
  t.not(other, first,
    'a different answer identity builds its own snapshot');
  t.end();
});

test('the per-node async planning answer resolves once per node and floored ' +
  'generation across concurrent evaluations', async (t) => {
  const cache = createVersionedTableCache();
  const readiness = new ControlPlaneReadinessService({
    nodeId: OWNER_NODE_ID,
    systemTableCache: cache,
    now: () => 1000,
    membershipPublicationService: {
      async deriveClusterMembershipCandidate(options = {}) {
        return {
          publicationEpoch: 2,
          status: 'PUBLISHED',
          publishedActiveNodeIds: [options.publisherNodeId],
        };
      },
      getLatestMembershipPublicationEpochStatusForNodeSync() {
        return {publicationEpoch: 2, status: 'PUBLISHED'};
      },
    },
  });
  const answers = await Promise.all(
    Array.from({length: REPEAT_READS}, () =>
      readiness.resolveNodeMembershipPublicationPlanningAnswer(
        OWNER_NODE_ID, 1000, null)),
  );
  t.equal(answers[0], answers[REPEAT_READS - 1],
    'concurrent evaluations of one node share one resolved answer identity');
  const again = await readiness.resolveNodeMembershipPublicationPlanningAnswer(
    OWNER_NODE_ID, 1100, null);
  t.equal(again, answers[0],
    'a later read within the floor window serves the same answer');
  const other = await readiness.resolveNodeMembershipPublicationPlanningAnswer(
    'node-identity-other', 1150, null);
  t.not(other, answers[0],
    'a different node resolves its own answer');
  cache.bump('nodes');
  const next = await readiness.resolveNodeMembershipPublicationPlanningAnswer(
    OWNER_NODE_ID, 1400, null);
  t.not(next, answers[0],
    'the next floored generation resolves fresh');
  t.end();
});

test('the planning answer keeps one identity through the retained-merge ' +
  'tail within a floored generation', async (t) => {
  const cache = createVersionedTableCache();
  const readiness = new ControlPlaneReadinessService({
    nodeId: OWNER_NODE_ID,
    systemTableCache: cache,
    now: () => 1000,
  });
  const activeSnapshot = Object.freeze({
    publishedActiveNodeIds: Object.freeze([OWNER_NODE_ID]),
  });
  const stored = readiness.resolvePriorityRecoveryPlanningAnswer(
    OWNER_NODE_ID, 1000, activeSnapshot);
  t.ok(stored, 'the active answer stores a retained snapshot');
  const incomplete = Object.freeze({publicationEpoch: 5});
  const first = readiness.resolvePriorityRecoveryPlanningAnswer(
    OWNER_NODE_ID, 1050, incomplete);
  const second = readiness.resolvePriorityRecoveryPlanningAnswer(
    OWNER_NODE_ID, 1100, incomplete);
  t.equal(second, first,
    'repeated retained-merge answers within one floor window share one ' +
      'identity');
  cache.bump('nodes');
  const third = readiness.resolvePriorityRecoveryPlanningAnswer(
    OWNER_NODE_ID, 1400, incomplete);
  t.not(third, first,
    'the next floored generation re-merges');
  t.end();
});

test('the sync planning derivation keeps one memo slot per publisher under ' +
  'alternating reads', async (t) => {
  const cache = createVersionedTableCache();
  let derivations = 0;
  const readiness = new ControlPlaneReadinessService({
    nodeId: OWNER_NODE_ID,
    systemTableCache: cache,
    now: () => 1000,
    membershipPublicationService: {
      deriveClusterMembershipCandidateSync(options = {}) {
        derivations += 1;
        return {publishedActiveNodeIds: [options.publisherNodeId]};
      },
    },
  });
  readiness.getPriorityRecoveryPlanningSnapshotSync(OWNER_NODE_ID, 1000);
  readiness.getPriorityRecoveryPlanningSnapshotSync('node-identity-b', 1010);
  readiness.getPriorityRecoveryPlanningSnapshotSync(OWNER_NODE_ID, 1020);
  readiness.getPriorityRecoveryPlanningSnapshotSync('node-identity-b', 1030);
  t.equal(derivations, 2,
    'alternating publishers keep one derivation per publisher, not one ' +
      'per alternation');
  t.end();
});

test('the readiness planning owner reuses a completed snapshot within one ' +
  'floored generation under write churn', async (t) => {
  const cache = createVersionedTableCache();
  let clock = 1000;
  let builds = 0;
  const {readMembershipPlanningDerivationVersionKey} =
    await import('../../src/control-plane/membership-planning-version-key.js');
  const owner = new ReadinessPlanningSnapshotOwner({
    service: {
      readPlanningProjectionSourceGeneration: (observedAt) =>
        readMembershipPlanningDerivationVersionKey(cache, observedAt),
    },
    now: () => clock,
    scheduleDrainFn: () => {},
  });
  t.teardown(() => owner.shutdown());
  const build = () => {
    builds += 1;
    return {nodeId: OWNER_NODE_ID, build: builds};
  };
  const first = owner.readSync(OWNER_NODE_ID, {}, build);
  t.equal(builds, 1, 'the first read builds');
  owner.recordTableChange('nodes');
  cache.bump('nodes');
  clock = 1100;
  const second = owner.readSync(OWNER_NODE_ID, {}, build);
  t.equal(second, first,
    'a write within the floor window keeps serving the completed snapshot');
  clock = 1400;
  owner.readSync(OWNER_NODE_ID, {}, build);
  const diagnostics = owner.getDiagnostics();
  t.ok(builds > 1 || diagnostics,
    'the next floored generation stops reusing the stale completion');
  t.not(
    owner.readSync(OWNER_NODE_ID, {}, build),
    first,
    'reads beyond the floor window never serve the pre-write completion');
  t.end();
});

test('the untracked priority planning projection builds its recovery gate ' +
  'once per planning snapshot identity', async (t) => {
  const readiness = new ControlPlaneReadinessService({
    nodeId: OWNER_NODE_ID,
    systemTableCache: {
      get() {
        return null;
      },
      getAll() {
        return [];
      },
      filter() {
        return [];
      },
      addListener() {},
    },
  });
  const planningSnapshot = Object.freeze({
    publicationEpoch: 3,
    publicationStatus: 'PUBLISHED',
    publishedActiveNodeIds: Object.freeze([OWNER_NODE_ID]),
  });
  const before = readGateBuildCount();
  const projections = [];
  for (let index = 0; index < REPEAT_READS; index++) {
    projections.push(
      readiness.buildPriorityRecoveryPlanningProjectionUntracked(
        planningSnapshot,
      ),
    );
  }
  t.equal(readGateBuildCount() - before, 1,
    'repeated projections of one snapshot share one gate build');
  t.ok(projections[0],
    'the projection is produced');

  const rotated = Object.freeze({
    ...planningSnapshot,
    publicationEpoch: 4,
  });
  readiness.buildPriorityRecoveryPlanningProjectionUntracked(rotated);
  t.equal(readGateBuildCount() - before, 2,
    'a new snapshot identity rebuilds the gate');
  t.end();
});
