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

test('the planning answer serves one projection identity per floored ' +
  'generation under write churn', async (t) => {
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
  t.equal(second, first,
    'a write within the floor window serves the same projection identity');
  const third =
    readiness.getPriorityRecoveryPlanningAnswerSync(OWNER_NODE_ID, 1400);
  t.not(third, first,
    'the next window observes the write with a fresh projection');
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
  const readiness = new ControlPlaneReadinessService({
    nodeId: OWNER_NODE_ID,
    systemTableCache: cache,
    now: () => 1000,
    membershipPublicationService: {
      // The derived candidate proposes the NEXT epoch by construction while
      // the live row still shows the current one — the memo freshness probe
      // must compare row-vs-row, never row-vs-candidate.
      deriveClusterMembershipCandidateSync() {
        return {
          publicationEpoch: 4,
          status: 'OPEN',
          publishedActiveNodeIds: [OWNER_NODE_ID],
        };
      },
      latestRow: {publicationEpoch: 3, status: 'PUBLISHED'},
      getLatestMembershipPublicationEpochStatusForNodeSync() {
        return this.latestRow;
      },
    },
  });
  const first =
    readiness.getPriorityRecoveryPlanningAnswerSync(OWNER_NODE_ID, 1000);
  const second =
    readiness.getPriorityRecoveryPlanningAnswerSync(OWNER_NODE_ID, 1100);
  t.equal(second, first,
    'a stable publication row keeps the memoized answer despite the ' +
      'next-epoch candidate');
  readiness.membershipPublicationService.latestRow =
    {publicationEpoch: 4, status: 'PUBLISHED'};
  const third =
    readiness.getPriorityRecoveryPlanningAnswerSync(OWNER_NODE_ID, 1150);
  t.not(third, first,
    'a genuine publication-row advance still rebuilds immediately');
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
