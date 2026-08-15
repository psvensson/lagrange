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
