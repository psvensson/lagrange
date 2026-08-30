// Deterministic witnesses for the readiness-planning-snapshot-identity-owner
// quest. They drive the REAL owners: a production-composition
// ControlPlaneReadinessService with the REAL MembershipPublicationCoordinator
// over a versioned system-table cache on a virtual clock, the REAL planning
// normalizer (buildPriorityRecoveryPlanningProjection, reached as
// normalizeMembershipPublicationPlanningSnapshot from every producer), the REAL
// node-scoped planning memos and the REAL publications winner probe. The only
// instrumentation is a counting wrapper around
// buildTrackedPriorityRecoveryPlanningProjection, so a rebuild is countable.
//
// The defect. The canonical planning snapshot's IDENTITY had no owner. Every
// producer that re-normalised an already-canonical snapshot got a fresh,
// byte-equal object back, so the normalizer's own input-identity memo missed on
// essentially every call and every downstream identity memo missed with it.
// Measured on the shared formation rig: 1430 of 2242 projection calls per 1000
// owner builds were re-normalisations, all byte-identical, and heavy planning
// builds ran at 344.8/s (1724 builds over 5s of virtual time) — within 3% of the
// 355/s measured on the failing five-node GCP seed (forensics 12, run
// 2026-08-30T17-32-03), where the readiness owner's allocation volume starved
// buildLocalControlSnapshot and the ACTIVE gate reported coverage 0/5 with all
// five nodes active.
//
// The cure. The normalizer owns that identity: it records its own output as the
// canonical answer for the floored source generation, so re-normalising a
// canonical snapshot returns the SAME frozen object instead of minting a
// byte-equal copy. renormalisation-is-a-byte-identical-fixed-point is the
// decisive proof that this serves nothing a rebuild would not have produced.
//
// Anchored test names, raw node:test — --test-name-pattern selects them.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  COLUMN,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {ControlPlaneReadinessService} from
  '../../src/control-plane/control-plane-readiness-service.js';
import {MembershipPublicationCoordinator} from
  '../../src/control-plane/membership-publication-coordinator.js';
import {
  MS_PER_SECOND,
  NODE_COUNT,
  PUBLICATION_STATES,
  RATE_CALL_COUNT,
  RATE_STEP_MS,
  T0,
  createFormationShapedCache,
  driveFormationShapedChurn,
  rowsForState,
} from './readiness-planning-formation-rig.js';

// Measured on this exact rig at the base commit (probe-derived identity, one
// fresh canonical snapshot per producer call): 1724 heavy planning builds over
// 5s of virtual time = 344.8/s.
const PRE_CHANGE_HEAVY_BUILDS = 1724;
// Measured after giving the canonical planning snapshot one identity owner:
// 812 heavy planning builds = 162.4/s. Every remaining build is the FIRST
// projection of genuinely new content (a fresh direct snapshot, a fresh merge,
// or a version-key-forced rebuild); no re-normalisation remains.
const AFTER_HEAVY_BUILDS = 812;
// The publications winner read is the one live read the planning memo version
// key performs. The identity owner adds none: it reuses the floored source
// generation the normalizer already computed.
const PUBLICATION_WINNER_READ_BOUND = 824;
const BURST_CALL_COUNT = 40;
const OWNER_NODE_ID = 'node-0';
const FLOOR_WINDOW_MS = 250;
const READINESS_PLANNING_MAX_CONCURRENCY = 1;
const READINESS_PLANNING_MAX_ITEMS_PER_DRAIN = 1;
const AUDIT_CALL_COUNT = 200;
const AUDIT_WRITE_EVERY = 5;

function createService({clock, cache, publicationRows = null}) {
  const readiness = new ControlPlaneReadinessService({
    nodeId: OWNER_NODE_ID,
    systemTableCache: cache,
    now: () => clock.value,
    readinessPlanningScheduleDrainFn: () => {},
    messageRouter: {
      getConnectionState: () => 'connected',
      getConnectedNodes: () => new Set(
        Array.from({length: NODE_COUNT}, (_, index) => `node-${index}`),
      ),
    },
  });
  const coordinator = new MembershipPublicationCoordinator({
    nodeId: OWNER_NODE_ID,
    systemTableCache: cache,
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: readiness,
    now: () => clock.value,
  });
  if (publicationRows) {
    // A publication winner presented WITHOUT a system-table write: the probe
    // path the planning memo version key exists to catch.
    coordinator.getLatestMembershipPublicationEpochStatusForNodeSync = () =>
      publicationRows.winner;
  }
  readiness.syncOwnerDependencies({membershipPublicationService: coordinator});
  const builds = [];
  const build = readiness.buildTrackedPriorityRecoveryPlanningProjection;
  readiness.buildTrackedPriorityRecoveryPlanningProjection = function(...args) {
    builds.push(args[0]);
    return build.apply(this, args);
  };
  return {readiness, coordinator, builds};
}

function createFixture({publicationRows = null} = {}) {
  const clock = {value: T0};
  const cache = createFormationShapedCache(T0);
  return {clock, cache, ...createService({clock, cache, publicationRows})};
}

// The canonical planning snapshot every producer re-normalises.
function canonicalSnapshot(readiness, clock) {
  return readiness.getMembershipPublicationPlanningSnapshotSync(
    OWNER_NODE_ID,
    clock.value,
  );
}

test('stable-inputs-burst-returns-one-canonical-identity', () => {
  const {readiness, clock, builds} = createFixture();
  const canonical = canonicalSnapshot(readiness, clock);
  assert.ok(canonical && typeof canonical === 'object',
    'the rig produces a canonical planning snapshot');
  const buildsBeforeBurst = builds.length;
  const first = readiness.buildPriorityRecoveryPlanningProjection(
    canonical, clock.value);
  for (let call = 2; call <= BURST_CALL_COUNT; call++) {
    assert.equal(
      readiness.buildPriorityRecoveryPlanningProjection(canonical, clock.value),
      first,
      `call ${call} of the stable-input burst serves one canonical identity`);
  }
  assert.equal(first, canonical,
    're-normalising an already canonical snapshot returns that same object');
  assert.equal(builds.length - buildsBeforeBurst, 0,
    `${BURST_CALL_COUNT} re-normalisations of a canonical snapshot rebuild ` +
      'nothing at all');
  assert.ok(Object.isFrozen(first),
    'the shared canonical identity is frozen, so no holder can mutate it');
});

test('renormalisation-is-a-byte-identical-fixed-point', () => {
  // The decisive equivalence: what the identity owner SERVES is byte-identical
  // to what a rebuild would MINT, so reuse can never present different content.
  // Checked over every publication state a winner row can take, on a service
  // whose identity memo is disabled so the rebuild really runs.
  let checked = 0;
  let differences = 0;
  for (const state of PUBLICATION_STATES) {
    const clock = {value: T0};
    const cache = createFormationShapedCache(T0);
    for (const row of rowsForState(state)) {
      cache.applySystemTableChange(TABLES.CONTROL_PLANE_PUBLICATIONS, 'UPDATE',
        {...row, publication_id: 'pub-1'});
    }
    const {readiness} = createService({clock, cache});
    const canonical = canonicalSnapshot(readiness, clock);
    if (!canonical) {
      continue;
    }
    for (let pass = 0; pass < 2; pass++) {
      // Disable the identity memo for this call only: the rebuild must run.
      readiness.planningProjectionByInputSnapshot = null;
      const rebuilt = readiness.buildPriorityRecoveryPlanningProjection(
        canonical, clock.value);
      checked += 1;
      if (rebuilt === canonical) {
        differences += 1;
        continue;
      }
      if (JSON.stringify(rebuilt) !== JSON.stringify(canonical)) {
        differences += 1;
      }
    }
  }
  assert.ok(checked >= PUBLICATION_STATES.length,
    'every publication state contributed a fixed-point check');
  assert.equal(differences, 0,
    'a forced rebuild of a canonical planning snapshot is byte-identical to ' +
      'the snapshot itself, in every publication state');
});

test('renormalisation-fixed-point-holds-across-the-whole-rig', () => {
  // The same claim, measured over the full production-composition sequence
  // rather than a directed matrix: every re-normalisation the rig performs is
  // byte-identical to its input.
  const {checked, differences} = driveFixedPointAudit();
  assert.ok(checked > 0,
    'the formation-shaped sequence re-normalises canonical snapshots');
  assert.equal(differences, 0,
    `all ${checked} re-normalisations across the formation sequence are ` +
      'byte-identical to their input');
});

test('version-key-change-mints-one-fresh-identity', () => {
  // A publication winner that advances WITHOUT a system-table write: the
  // floored source generation cannot see it, so the node-scoped planning memo's
  // live publication component must force exactly one rebuild and a fresh
  // identity. This is the guarantee the identity owner must not absorb.
  const winner = {value: {publicationEpoch: 2, status: 'PUBLISHED'}};
  const {readiness, clock, builds} = createFixture({
    publicationRows: {get winner() {
      return winner.value;
    }},
  });
  const first = readiness.getPriorityRecoveryPlanningAnswerSync(
    OWNER_NODE_ID, clock.value);
  const buildsAfterFirst = builds.length;
  assert.equal(
    readiness.getPriorityRecoveryPlanningAnswerSync(OWNER_NODE_ID, clock.value),
    first,
    'a stable version key serves one planning answer identity');
  assert.equal(builds.length, buildsAfterFirst,
    'the stable-key repeat rebuilds nothing');
  winner.value = {publicationEpoch: 3, status: 'PUBLISHED'};
  const advanced = readiness.getPriorityRecoveryPlanningAnswerSync(
    OWNER_NODE_ID, clock.value);
  assert.notEqual(advanced, first,
    'a publication advance with no table write mints a FRESH identity');
  assert.equal(builds.length, buildsAfterFirst + 1,
    'the publication advance rebuilt exactly once');
  assert.equal(
    readiness.getPriorityRecoveryPlanningAnswerSync(OWNER_NODE_ID, clock.value),
    advanced,
    'the post-advance identity is served while the key holds');
  assert.equal(builds.length, buildsAfterFirst + 1,
    'no further rebuild while the key holds');
});

test('source-generation-change-mints-a-fresh-identity', () => {
  const {readiness, cache, clock, builds} = createFixture();
  const canonical = canonicalSnapshot(readiness, clock);
  const first = readiness.buildPriorityRecoveryPlanningProjection(
    canonical, clock.value);
  const buildsAfterFirst = builds.length;
  cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
    [COLUMN.NODE_ID]: 'node-1',
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.LAST_HEARTBEAT]: clock.value,
  });
  clock.value += FLOOR_WINDOW_MS + 1;
  const next = readiness.buildPriorityRecoveryPlanningProjection(
    canonical, clock.value);
  assert.notEqual(next, first,
    'the next floored generation re-projects the same canonical snapshot to a ' +
      'fresh identity');
  assert.equal(builds.length, buildsAfterFirst + 1,
    'the generation change rebuilt exactly once');
  assert.equal(
    readiness.buildPriorityRecoveryPlanningProjection(next, clock.value),
    next,
    'the new canonical identity is itself the fixed point of the next window');
  assert.equal(builds.length, buildsAfterFirst + 1,
    'no further rebuild inside the new window');
});

test('identity-observable-preserved', () => {
  // The sealed projection-planning identity observable, driven here against the
  // production-composition owner: a stable publication row keeps the memoized
  // answer despite a candidate proposing the next epoch, and a genuine
  // publication-row advance still rebuilds immediately.
  const winner = {value: {publicationEpoch: 3, status: 'PUBLISHED'}};
  const {readiness, clock, coordinator} = createFixture();
  coordinator.getLatestMembershipPublicationEpochStatusForNodeSync = () =>
    winner.value;
  coordinator.deriveClusterMembershipCandidateSync = () => ({
    publicationEpoch: 4,
    status: 'OPEN',
    publishedActiveNodeIds: [OWNER_NODE_ID],
  });
  const first = readiness.getPriorityRecoveryPlanningAnswerSync(
    OWNER_NODE_ID, clock.value);
  assert.equal(
    readiness.getPriorityRecoveryPlanningAnswerSync(OWNER_NODE_ID, clock.value),
    first,
    'a stable publication row keeps the memoized answer despite the ' +
      'next-epoch candidate');
  winner.value = {publicationEpoch: 4, status: 'PUBLISHED'};
  assert.notEqual(
    readiness.getPriorityRecoveryPlanningAnswerSync(OWNER_NODE_ID, clock.value),
    first,
    'a genuine publication-row advance still rebuilds immediately');
});

test('identical-counter-cache-swap-drops-the-canonical-identity', () => {
  // A replacement cache can present IDENTICAL table mutation counters, so the
  // floored generation alone cannot separate the two caches. A canonical
  // snapshot retained across the swap must re-derive rather than be served.
  const {readiness, clock, builds} = createFixture();
  const canonical = canonicalSnapshot(readiness, clock);
  const retained = readiness.buildPriorityRecoveryPlanningProjection(
    canonical, clock.value);
  const buildsBeforeSwap = builds.length;
  assert.equal(
    readiness.buildPriorityRecoveryPlanningProjection(retained, clock.value),
    retained,
    'the retained snapshot is canonical before the swap');
  assert.equal(builds.length, buildsBeforeSwap,
    'the pre-swap re-normalisation rebuilt nothing');
  readiness.syncOwnerDependencies({
    systemTableCache: createFormationShapedCache(T0),
  });
  const afterSwap = readiness.buildPriorityRecoveryPlanningProjection(
    retained, clock.value);
  assert.notEqual(afterSwap, retained,
    'a snapshot retained across a cache swap is NOT served as canonical');
  assert.equal(builds.length, buildsBeforeSwap + 1,
    'the swap forced exactly one re-derivation');
  assert.ok(Object.isFrozen(retained),
    'the retained snapshot was never mutated in place: it is still frozen');
});

test('membership-owner-swap-drops-the-canonical-identity', () => {
  const {readiness, clock, cache, builds} = createFixture();
  const canonical = canonicalSnapshot(readiness, clock);
  const retained = readiness.buildPriorityRecoveryPlanningProjection(
    canonical, clock.value);
  const buildsBeforeSwap = builds.length;
  readiness.syncOwnerDependencies({
    membershipPublicationService: new MembershipPublicationCoordinator({
      nodeId: OWNER_NODE_ID,
      systemTableCache: cache,
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
        upsertSystemTableRow: async () => ({success: true}),
      },
      controlPlaneReadinessService: readiness,
      now: () => clock.value,
    }),
  });
  assert.notEqual(
    readiness.buildPriorityRecoveryPlanningProjection(retained, clock.value),
    retained,
    'a snapshot retained across a membership-owner swap re-derives');
  assert.equal(builds.length, buildsBeforeSwap + 1,
    'the membership-owner swap forced exactly one re-derivation');
});

test('canonical-identity-retains-no-back-reference', () => {
  // The self entry must not hold a reference to its own WeakMap key: the entry
  // has to die with the snapshot it describes rather than pin it. Checked
  // structurally on the entry the owner stores.
  const {readiness, clock} = createFixture();
  const canonical = canonicalSnapshot(readiness, clock);
  const projected = readiness.buildPriorityRecoveryPlanningProjection(
    canonical, clock.value);
  const entry = readiness.planningProjectionByInputSnapshot.get(projected);
  assert.ok(entry, 'the canonical output carries its own identity entry');
  assert.equal(entry.projection, null,
    'the self entry holds no reference back to its own WeakMap key');
  assert.ok(readiness.planningProjectionByInputSnapshot instanceof WeakMap,
    'identity entries live in a WeakMap, so retention is bounded by the ' +
      'lifetime of the snapshots themselves');
});

test('budgets-and-cadence-unchanged', () => {
  const {readiness, clock} = createFixture();
  const queue = readiness.readinessPlanningSnapshotOwner?.queue;
  assert.ok(queue, 'the readiness planning owner still owns its drain queue');
  assert.equal(queue.maxConcurrency, READINESS_PLANNING_MAX_CONCURRENCY,
    'the planning drain concurrency budget is untouched');
  assert.equal(queue.maxItemsPerDrain, READINESS_PLANNING_MAX_ITEMS_PER_DRAIN,
    'the one-heavy-item-per-macrotask drain budget is untouched');
  assert.equal(typeof queue.scheduleDrainFn, 'function',
    'the macrotask-class scheduler is still the drain arm');
  // The identity owner reuses the SHIPPED floored generation. Its 250ms refresh
  // floor, not a new cadence, is what bounds identity reuse.
  const canonical = canonicalSnapshot(readiness, clock);
  const first = readiness.buildPriorityRecoveryPlanningProjection(
    canonical, clock.value);
  clock.value += FLOOR_WINDOW_MS - 1;
  assert.equal(
    readiness.buildPriorityRecoveryPlanningProjection(canonical, clock.value),
    first,
    'inside the shipped 250ms floor the canonical identity holds');
  assert.equal(
    readiness.readMembershipPublicationPlanningMemoVersionKey(
      OWNER_NODE_ID, clock.value).sourceGeneration,
    readiness.readPlanningProjectionSourceGeneration(clock.value),
    'the identity owner and the planning memos read ONE generation component');
});

test('formation-shaped-build-rate-after-identity-owner', () => {
  const {heavyBuilds, publicationWinnerReads} = driveFormationShapedChurn();
  const elapsedSeconds = (RATE_CALL_COUNT * RATE_STEP_MS) / MS_PER_SECOND;
  assert.equal(heavyBuilds, AFTER_HEAVY_BUILDS,
    `heavy planning builds over ${elapsedSeconds}s of virtual time = ` +
      `${heavyBuilds / elapsedSeconds}/s (pre-change: ` +
      `${PRE_CHANGE_HEAVY_BUILDS} = ` +
      `${PRE_CHANGE_HEAVY_BUILDS / elapsedSeconds}/s)`);
  assert.ok(heavyBuilds < PRE_CHANGE_HEAVY_BUILDS,
    'the identity owner is a strict reduction on the measured sequence');
  assert.ok(publicationWinnerReads <= PUBLICATION_WINNER_READ_BOUND,
    `publications winner reads (${publicationWinnerReads}) stay at or below ` +
      `${PUBLICATION_WINNER_READ_BOUND}: the identity owner adds no read`);
});

test('witness-deterministic', () => {
  const first = driveFormationShapedChurn();
  const second = driveFormationShapedChurn();
  assert.deepEqual(second, first,
    'two identical drives produce identical heavy build and publication read ' +
      'counts');
  const auditA = driveFixedPointAudit();
  const auditB = driveFixedPointAudit();
  assert.deepEqual(auditB, auditA,
    'two identical fixed-point audits produce the identical result');
});

// Re-runs the formation sequence with the identity owner disabled and every
// re-normalisation compared against its input, so the fixed-point claim is
// measured on the production-composition path rather than a directed fixture.
function driveFixedPointAudit() {
  const clock = {value: T0};
  const cache = createFormationShapedCache(T0);
  const {readiness} = createService({clock, cache});
  const canonicalOutputs = new WeakSet();
  let checked = 0;
  let differences = 0;
  const project = readiness.buildPriorityRecoveryPlanningProjection;
  readiness.buildPriorityRecoveryPlanningProjection = function(snapshot, at) {
    const wasCanonical = snapshot && typeof snapshot === 'object' &&
      canonicalOutputs.has(snapshot);
    // Force the rebuild so the comparison is against freshly derived content.
    this.planningProjectionByInputSnapshot = null;
    const rebuilt = project.call(this, snapshot, at);
    if (rebuilt && typeof rebuilt === 'object') {
      canonicalOutputs.add(rebuilt);
    }
    if (wasCanonical) {
      checked += 1;
      if (JSON.stringify(rebuilt) !== JSON.stringify(snapshot)) {
        differences += 1;
      }
    }
    return rebuilt;
  };
  const platformNow = Date.now;
  Date.now = () => clock.value;
  try {
    for (let call = 0; call < AUDIT_CALL_COUNT; call++) {
      clock.value += RATE_STEP_MS;
      if (call % AUDIT_WRITE_EVERY === 0) {
        cache.applySystemTableChange(TABLES.SERVICES, 'UPDATE', {
          [COLUMN.SERVICE_ID]: 'service-0',
          [COLUMN.NODE_ID]: OWNER_NODE_ID,
          [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
          [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          revision: call,
        });
      }
      readiness.buildNodeReadinessSyncCurrent(
        `node-${call % NODE_COUNT}`,
        {readinessPlanningOwnerBuild: true},
      );
    }
  } finally {
    Date.now = platformNow;
    readiness.shutdownReadinessPlanningOwner();
  }
  return {checked, differences};
}
