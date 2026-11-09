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
// The cure. The normalizer owns that identity: once a real rebuild has been
// observed to come back content-equal to its input, that input (and the rebuild
// it produced) become canonical, and the NEXT re-normalisation is served rather
// than minting the next link of a fresh-object chain.
//
// The fixed point is VERIFIED, never assumed. An independent audit found the
// assumption false on release-0.2 formation paths, and
// renormalisation-fixed-point-is-not-universal measures how false: 15235 of
// 21600 planning-snapshot shapes (70.5%) re-normalise to different content, and
// the narrowest cheap structural precondition still admits 3405 divergent
// shapes. So no precondition is used; the guard is the comparison itself, paid
// for with the rebuild the call already performed.
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

import {
  getSharedSyncSectionRegistry,
} from '../../src/diagnostics/event-loop-gap-watchdog.js';
import {MembershipPublicationCoordinator} from
  '../../src/control-plane/membership-publication-coordinator.js';
import {buildPublicationRecoveryProtocolSnapshot} from
  '../../src/control-plane/recovery-protocol-snapshot.js';
import {readPriorityRecoveryPlanningAnswerCallRetention} from
  '../../src/control-plane/priority-recovery-planning-answer-origin.js';
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

import {
  createReadinessServiceForTest,
  readinessCollaboratorFake,
  readinessCollaboratorFakes,
} from '../helpers/readiness-service-fixture.js';
// Measured on this exact rig at the base commit (probe-derived identity, one
// fresh canonical snapshot per producer call): 1724 heavy planning builds over
// 5s of virtual time = 344.8/s.
const PRE_CHANGE_HEAVY_BUILDS = 1724;
// Measured after giving the canonical planning snapshot one VERIFIED identity
// owner plus Q2 semantic source classification was 585 heavy builds. The
// direct-publication custody repair tightens this to 565 (113/s), with every
// fresh node evaluation retained. Each remaining build is either
// the first projection of genuinely new content, or the one verification
// rebuild that makes a snapshot canonical.
const AFTER_HEAVY_BUILDS = 565;
// The publication recovery gate snapshot was the largest instrumented site on
// the failing seed (586/s). It must not regress: measured 4118 -> 3184 builds
// over the same sequence after frozen observation gates gained identity reuse.
const PRE_CHANGE_GATE_BUILDS = 4118;
// R09 direct-publication custody: same rig, tighter than the prior 3184.
const AFTER_GATE_BUILDS = 3164;
// The publications winner read is the one live read the planning memo version
// key performs. The identity owner adds none: it reuses the floored source
// generation the normalizer already computed.
const PUBLICATION_WINNER_READ_BOUND = 824;
const BURST_CALL_COUNT = 40;
const OWNER_NODE_ID = 'node-0';
const FLOOR_WINDOW_MS = 250;
// One source-owner-forced rebuild, the publication merge, and the verification
// that makes the fresh projection canonical for re-normalising sub-builders.
const VERSION_KEY_ADVANCE_BUILDS = 3;
const READINESS_PLANNING_MAX_CONCURRENCY = 1;
const READINESS_PLANNING_MAX_ITEMS_PER_DRAIN = 1;
const AUDIT_CALL_COUNT = 200;
const AUDIT_WRITE_EVERY = 5;
const GATE_BUILD_SECTION = 'publication_recovery_gate_snapshot_build';
// The planning-snapshot shape space. Publication status and epoch are the two
// axes the gate builder's owner-stream defaults key on, so they are exhaustive;
// everything else the gate consumes is swept deterministically around them.
const SHAPE_STATUSES = Object.freeze([undefined, null, '', 'PUBLISHED',
  'ACKNOWLEDGING', 'OPEN', 'UNKNOWN', 'SUPERSEDED']);
const SHAPE_EPOCHS = Object.freeze([undefined, null, 0, 1, 2, 2.7, -1, '3',
  Number.NaN]);
const SHAPE_LEGACY_STATUSES = Object.freeze([undefined, 'PUBLISHED']);
const SHAPE_OBSERVATION_STATES = Object.freeze([undefined, null, '',
  'observed', 'unpublished_observation']);
const SHAPE_PROTOCOL_STATES = Object.freeze([undefined, null, '',
  'steady_published', 'recovering']);
const SHAPE_NODE_LISTS = Object.freeze([undefined, Object.freeze([]),
  Object.freeze(['node-0']), Object.freeze(['node-0', 'node-1'])]);
const SHAPE_ACK_COUNTS = Object.freeze([undefined, 0, 2]);
const SHAPE_ACK_EVIDENCE_STATES = Object.freeze([undefined, 'count_only',
  'required_ack_node_list']);
const SHAPE_TARGET_NODE_IDS = Object.freeze([undefined, 'node-0', 'node-9']);
const SHAPE_PARTITION_SUMMARIES = Object.freeze([undefined, null,
  Object.freeze({total: 2, spread: 1})]);
const SHAPE_EXCLUSIONS = Object.freeze([undefined, false, true]);
const SHAPE_REASON_CODES = Object.freeze(['priority_partitions_not_spread']);
const SHAPE_ROUNDS = 300;
const SHAPE_SEED = 1;
const SHAPE_MULTIPLIER = 1103515245;
const SHAPE_INCREMENT = 12345;
const SHAPE_MODULUS = 2147483647;
const SHAPE_REASON_CODE_MODULUS = 3;
const SHAPE_SPACE_SIZE = SHAPE_STATUSES.length * SHAPE_EPOCHS.length *
  SHAPE_ROUNDS;
// Measured: normalisation is NOT idempotent for most planning-snapshot shapes,
// and the narrowest cheap structural precondition still admits thousands that
// diverge. That is why the guard is a verification, not a precondition.
const SHAPE_SPACE_DIVERGENT = 15235;
const PRECONDITION_UNSOUND_SHAPES = 3405;

function createPublicationCoordinator({readiness, cache, clock}) {
  return new MembershipPublicationCoordinator({
    nodeId: OWNER_NODE_ID,
    systemTableCache: cache,
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: readiness,
    now: () => clock.value,
  });
}

function createService({clock, cache}) {
  const readiness = createReadinessServiceForTest({
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
  const coordinator = createPublicationCoordinator({readiness, cache, clock});
  readiness.syncOwnerDependencies({membershipPublicationService: coordinator});
  const builds = [];
  const build = readiness.buildTrackedPriorityRecoveryPlanningProjection;
  readiness.buildTrackedPriorityRecoveryPlanningProjection = function(...args) {
    builds.push(args[0]);
    return build.apply(this, args);
  };
  return {readiness, coordinator, builds};
}

function createFixture() {
  const clock = {value: T0};
  const cache = createFormationShapedCache(T0);
  return {clock, cache, ...createService({clock, cache})};
}

// The canonical planning snapshot every producer re-normalises.
function canonicalSnapshot(readiness, clock) {
  return readiness.deriveMembershipPublicationPlanningSnapshotSync(
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
  // Call 1 performs the ONE rebuild that verifies the fixed point, and returns
  // that rebuild — byte for byte what this call returned before the cure.
  const verified = readiness.buildPriorityRecoveryPlanningProjection(
    canonical, clock.value);
  assert.equal(builds.length - buildsBeforeBurst, 1,
    'the first re-normalisation rebuilds exactly once, to verify');
  assert.equal(JSON.stringify(verified), JSON.stringify(canonical),
    'the verification rebuild is content-equal to its input');
  const served = readiness.buildPriorityRecoveryPlanningProjection(
    canonical, clock.value);
  for (let call = 3; call <= BURST_CALL_COUNT; call++) {
    assert.equal(
      readiness.buildPriorityRecoveryPlanningProjection(canonical, clock.value),
      served,
      `call ${call} of the stable-input burst serves one canonical identity`);
  }
  assert.equal(served, canonical,
    'once verified, re-normalising a canonical snapshot returns that object');
  assert.equal(builds.length - buildsBeforeBurst, 1,
    `${BURST_CALL_COUNT} re-normalisations cost ONE build in total; before ` +
      'the cure each minted a fresh byte-equal identity');
  assert.equal(
    readiness.buildPriorityRecoveryPlanningProjection(verified, clock.value),
    verified,
    'the verification rebuild is canonical too, by the same proof');
  assert.ok(Object.isFrozen(served),
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

test('version-key-change-mints-one-fresh-identity', (t) => {
  // Drive the canonical publication owner boundary. Q2 removes the competing
  // live winner probe, so a winner change without its source-owner event is no
  // longer a supported second authority.
  const {readiness, cache, clock, builds} = createFixture();
  t.after(() => readiness.shutdown());
  const work = tracePublicationPlanningWork(readiness);
  const expectedNodeIds = Array.from({length: NODE_COUNT}, (_, index) => `node-${index}`);
  const first = readiness.getPriorityRecoveryPlanningAnswerSync(
    OWNER_NODE_ID, clock.value);
  assertPublicationAdvanceWork(work, expectedNodeIds);
  work.length = 0;
  const buildsAfterFirst = builds.length;
  assert.equal(
    readiness.getPriorityRecoveryPlanningAnswerSync(OWNER_NODE_ID, clock.value),
    first,
    'a stable version key serves one planning answer identity');
  assert.equal(builds.length, buildsAfterFirst,
    'the stable-key repeat rebuilds nothing');
  assert.equal(work.length, 0, 'the cold-key repeat performs no fresh observations');
  work.length = 0;
  cache.applySystemTableChange(TABLES.CONTROL_PLANE_PUBLICATIONS, 'UPDATE', {
    publication_id: 'pub-1',
    publication_kind: 'cluster_membership',
    publication_epoch: 3,
    status: 'PUBLISHED',
  });
  const advanced = readiness.getPriorityRecoveryPlanningAnswerSync(
    OWNER_NODE_ID, clock.value);
  assert.notEqual(advanced, first,
    'an owner-observed publication advance mints a FRESH identity');
  // R09: 2cd37024e added the mandatory fresh bulk evaluations. The old
  // flat total-three premise is explicitly superseded by complete accounting:
  // three candidate-owner builds plus two for EACH independently expected node.
  assertPublicationAdvanceWork(work, expectedNodeIds);
  assert.equal(builds.length,
    buildsAfterFirst + VERSION_KEY_ADVANCE_BUILDS + 2 * NODE_COUNT);
  const malformed = [
    work.filter((event) => event.nodeId !== expectedNodeIds[0]),
    work.filter((event) => event.scope === 'candidate'),
    [...work, {kind: 'build', scope: 'candidate'}],
    [...work, {kind: 'build', scope: 'node', nodeId: 'unexpected-node', source: 'direct_publication_row'}],
    [...work, {kind: 'unclassified'}],
  ];
  for (const events of malformed) {
    assert.throws(() => assertPublicationAdvanceWork(events, expectedNodeIds),
      'omission, extra and unclassified work cannot disappear from measurement');
  }
  work.length = 0;
  const buildsAfterAdvance = builds.length;
  assert.equal(
    readiness.getPriorityRecoveryPlanningAnswerSync(OWNER_NODE_ID, clock.value),
    advanced,
    'the post-advance identity is served while the key holds');
  assert.equal(work.length, 0, 'stable repeats do no candidate or nested fresh work');
  assert.equal(builds.length, buildsAfterAdvance,
    'no further rebuild while the key holds');
});

test('derived-identity-is-generation-gated', () => {
  // A DERIVED entry hands back a different object than the caller passed in,
  // so its reuse carries the node-typed semantic PlanningIdentity.
  const {readiness, cache, clock, builds} = createFixture();
  const raw = Object.freeze({targetNodeId: OWNER_NODE_ID});
  const first = readiness.buildPriorityRecoveryPlanningProjection(
    raw, clock.value);
  assert.notEqual(first, raw,
    'a raw planning snapshot is not its own projection, so the entry is ' +
      'derived rather than canonical');
  const buildsAfterFirst = builds.length;
  assert.equal(
    readiness.buildPriorityRecoveryPlanningProjection(raw, clock.value),
    first,
    'the derived projection is reused inside one generation');
  assert.equal(builds.length, buildsAfterFirst,
    'the in-generation repeat rebuilt nothing');
  clock.value += FLOOR_WINDOW_MS - 1;
  assert.equal(
    readiness.buildPriorityRecoveryPlanningProjection(raw, clock.value),
    first,
    'passage through the retired floor does not rotate semantic currency');
  assert.equal(builds.length, buildsAfterFirst,
    'still no rebuild while semantic inputs are stable');
  cache.applySystemTableChange(TABLES.SERVICES, 'UPDATE', {
    [COLUMN.SERVICE_ID]: 'service-0',
    [COLUMN.NODE_ID]: OWNER_NODE_ID,
    [COLUMN.ADDRESS]: 'node-0/partition/priority-partition-v2',
  });
  assert.notEqual(
    readiness.buildPriorityRecoveryPlanningProjection(raw, clock.value),
    first,
    'a node-local service semantic change re-derives rather than reusing');
  assert.equal(builds.length, buildsAfterFirst + 1,
    'the generation change re-derived exactly once');
});

test('verified-canonical-identity-is-generation-independent', () => {
  // A SELF entry is a PROOF that this snapshot is its own projection, and the
  // proof does not expire with the floored generation: the projection is a pure
  // function of the snapshot, this node's id and the admission fence, and all
  // three are gated. The test does not take that on trust — it shadow-compares
  // the served identity against a forced rebuild after the rotation.
  const {readiness, cache, clock, builds} = createFixture();
  const canonical = canonicalSnapshot(readiness, clock);
  readiness.buildPriorityRecoveryPlanningProjection(canonical, clock.value);
  const buildsAfterVerification = builds.length;
  cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
    [COLUMN.NODE_ID]: 'node-1',
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.LAST_HEARTBEAT]: clock.value,
  });
  clock.value += FLOOR_WINDOW_MS + 1;
  const served = readiness.buildPriorityRecoveryPlanningProjection(
    canonical, clock.value);
  assert.equal(served, canonical,
    'the verified canonical identity survives the generation rotation');
  assert.equal(builds.length, buildsAfterVerification,
    'no rebuild is needed to serve a proven fixed point');
  const entries = readiness.planningProjectionByInputSnapshot;
  readiness.planningProjectionByInputSnapshot = null;
  const forcedRebuild =
    readiness.buildTrackedPriorityRecoveryPlanningProjection(canonical);
  readiness.planningProjectionByInputSnapshot = entries;
  assert.equal(JSON.stringify(served), JSON.stringify(forcedRebuild),
    'and what it serves after the rotation is byte-identical to what a ' +
      'forced rebuild in the new generation would produce');
});

test('identity-observable-preserved', () => {
  // The sealed projection-planning identity observable, driven here against the
  // production-composition owner: a stable publication row keeps the memoized
  // answer despite a candidate proposing the next epoch, and a genuine
  // publication-row advance still rebuilds immediately.
  const {readiness, cache, clock, coordinator} = createFixture();
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
  cache.applySystemTableChange(TABLES.CONTROL_PLANE_PUBLICATIONS, 'UPDATE', {
    publication_id: 'pub-1',
    publication_kind: 'cluster_membership',
    publication_epoch: 4,
    status: 'PUBLISHED',
  });
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
  readiness.syncOwnerDependencies(readinessCollaboratorFakes({
    systemTableCache: createFormationShapedCache(T0),
  }));
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
  readiness.buildPriorityRecoveryPlanningProjection(canonical, clock.value);
  const entry = readiness.planningProjectionByInputSnapshot.get(canonical);
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
  const versionKey = readiness.readMembershipPublicationPlanningMemoVersionKey(
    OWNER_NODE_ID,
    clock.value,
  );
  assert.equal(versionKey.sourceGeneration, null,
    'typed semantic currency retires the scalar floor from memo admission');
  assert.deepEqual(
    versionKey.planningIdentity,
    readiness.readPlanningProjectionIdentity(OWNER_NODE_ID, clock.value),
    'the identity owner and planning memos share one node-typed currency');
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

test('gate-snapshot-build-rate-does-not-regress', () => {
  // The verification rebuild is real work, so the LARGEST instrumented site on
  // the failing seed has to be measured too, not assumed neutral.
  const before = readGateBuildCount();
  driveFormationShapedChurn();
  const gateBuilds = readGateBuildCount() - before;
  assert.equal(gateBuilds, AFTER_GATE_BUILDS,
    'publication recovery gate snapshot builds over the same sequence ' +
      `(pre-change: ${PRE_CHANGE_GATE_BUILDS})`);
  assert.ok(gateBuilds < PRE_CHANGE_GATE_BUILDS,
    'the verified identity owner reduces gate snapshot builds as well as ' +
      'planning projection builds');
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

function readGateBuildCount() {
  const site = getSharedSyncSectionRegistry().sites.get(GATE_BUILD_SECTION);
  return site ? site.count : 0;
}

test('renormalisation-fixed-point-is-not-universal', () => {
  // The refutation that forces the guard to be a VERIFICATION rather than a
  // precondition. Two decisive axes exhaustively crossed with a wide sweep of
  // every other gate input: most shapes are NOT fixed points, and the narrowest
  // cheap structural precondition still admits thousands that are not.
  const {shapes, divergent, accepted, acceptedDivergent} = auditShapeSpace();
  assert.equal(shapes, SHAPE_SPACE_SIZE,
    'the shape space is exhaustive on status x epoch and swept elsewhere');
  assert.ok(divergent > 0,
    'normalisation is not universally idempotent');
  assert.equal(divergent, SHAPE_SPACE_DIVERGENT,
    `${divergent} of ${shapes} shapes re-normalise to different content`);
  assert.ok(acceptedDivergent > 0,
    'the cheap structural precondition (status is a non-empty string AND ' +
      'epoch is an integer) is UNSOUND: it admits shapes that diverge, so no ' +
      'precondition may stand in for the verification');
  assert.equal(acceptedDivergent, PRECONDITION_UNSOUND_SHAPES,
    `the precondition accepts ${accepted} shapes, ${acceptedDivergent} of ` +
      'which are not fixed points');
});

test('every-adopted-identity-is-verified-over-the-shape-space', () => {
  // The positive: over that same space, drive the REAL owner and shadow-compare
  // every served identity against a forced rebuild of the same input. A shape
  // that is not a fixed point must never be served.
  const {servedHits, divergences} = auditShapeSpaceThroughOwner();
  assert.ok(servedHits > 0,
    'the shape space exercises the identity owner');
  assert.equal(divergences, 0,
    `all ${servedHits} served identities are byte-identical to a forced ` +
      'rebuild of the same input, across the whole shape space');
});

test('shadow-audit-over-the-rig-finds-no-divergence', () => {
  // The verifier's audit in miniature: run the production-composition sequence
  // with every identity hit shadow-compared against a forced rebuild.
  const {hits, divergences} = shadowAuditFormationChurn();
  assert.ok(hits > 0,
    'the formation-shaped sequence serves identities to shadow-compare');
  assert.equal(divergences, 0,
    `all ${hits} identity hits across the formation-shaped owner-build ` +
      'sequence serve exactly what a forced rebuild would produce');
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
  driveOwnerBuildSequence({readiness, cache, clock});
  return {checked, differences};
}

// A service with no cache content, used to drive raw planning-snapshot shapes
// through the REAL normalizer.
function createShapeSpaceService() {
  return createReadinessServiceForTest({
    nodeId: OWNER_NODE_ID,
    systemTableCache: {
      get: () => null,
      getAll: () => [],
      filter: () => [],
      getTableMutationVersion: () => 0,
      onCacheChange: () => {},
    },
    now: () => T0,
    readinessPlanningScheduleDrainFn: () => {},
  });
}

// Two decisive axes (publication status, publication epoch) exhaustively
// crossed with a deterministic sweep of every other input the recovery gate
// consumes. The sweep is seeded, so the space is identical on every run.
function forEachPlanningShape(visit) {
  let seed = SHAPE_SEED;
  const pick = (list, salt) => list[(seed * salt) % list.length];
  for (const publicationStatus of SHAPE_STATUSES) {
    for (const publicationEpoch of SHAPE_EPOCHS) {
      for (let round = 0; round < SHAPE_ROUNDS; round++) {
        seed = (seed * SHAPE_MULTIPLIER + SHAPE_INCREMENT) % SHAPE_MODULUS;
        const shape = {};
        const put = (key, value) => {
          if (value !== undefined) {
            shape[key] = value;
          }
        };
        put('publicationStatus', publicationStatus);
        put('publicationEpoch', publicationEpoch);
        put('status', pick(SHAPE_LEGACY_STATUSES, 3));
        put('publicationObservationState', pick(SHAPE_OBSERVATION_STATES, 5));
        put('recoveryProtocolState', pick(SHAPE_PROTOCOL_STATES, 7));
        put('requiredAckNodeIds', pick(SHAPE_NODE_LISTS, 11));
        put('acknowledgedNodeIds', pick(SHAPE_NODE_LISTS, 13));
        put('pendingAckNodeIds', pick(SHAPE_NODE_LISTS, 17));
        put('pendingAckCount', pick(SHAPE_ACK_COUNTS, 19));
        put('pendingAckEvidenceState', pick(SHAPE_ACK_EVIDENCE_STATES, 23));
        put('targetNodeId', pick(SHAPE_TARGET_NODE_IDS, 29));
        put('priorityPartitionSummary', pick(SHAPE_PARTITION_SUMMARIES, 31));
        put('publicationExcludesTargetNode', pick(SHAPE_EXCLUSIONS, 37));
        put('publishedActiveNodeIds', pick(SHAPE_NODE_LISTS, 41));
        put('missingPublishedNodeIds', pick(SHAPE_NODE_LISTS, 43));
        if (seed % SHAPE_REASON_CODE_MODULUS === 0) {
          shape.priorityRecoveryReasonCodes = SHAPE_REASON_CODES;
        }
        visit(Object.freeze(shape));
      }
    }
  }
}

// Is this projection its own rebuild? Forces the rebuild with the identity
// owner disabled, so the comparison is against genuinely derived content.
function rebuildsToItself(readiness, projection) {
  readiness.planningProjectionByInputSnapshot = null;
  const rebuilt =
    readiness.buildTrackedPriorityRecoveryPlanningProjection(projection);
  return JSON.stringify(rebuilt) === JSON.stringify(projection);
}

// The cheap structural precondition this quest considered and REJECTED.
function cheapFixedPointPrecondition(projection) {
  return typeof projection.publicationStatus === 'string' &&
    projection.publicationStatus.length > 0 &&
    Number.isInteger(projection.publicationEpoch);
}

function auditShapeSpace() {
  const readiness = createShapeSpaceService();
  let shapes = 0;
  let divergent = 0;
  let accepted = 0;
  let acceptedDivergent = 0;
  forEachPlanningShape((shape) => {
    shapes += 1;
    readiness.planningProjectionByInputSnapshot = null;
    const projection =
      readiness.buildPriorityRecoveryPlanningProjection(shape, T0);
    if (!projection) {
      return;
    }
    const fixed = rebuildsToItself(readiness, projection);
    if (!fixed) {
      divergent += 1;
    }
    if (cheapFixedPointPrecondition(projection)) {
      accepted += 1;
      if (!fixed) {
        acceptedDivergent += 1;
      }
    }
  });
  return {shapes, divergent, accepted, acceptedDivergent};
}

// Drive every shape through the REAL owner and shadow-compare whatever a second
// call is SERVED from an identity entry against a forced rebuild of that input.
function auditShapeSpaceThroughOwner() {
  const readiness = createShapeSpaceService();
  let servedHits = 0;
  let divergences = 0;
  forEachPlanningShape((shape) => {
    readiness.planningProjectionByInputSnapshot = null;
    const first = readiness.buildPriorityRecoveryPlanningProjection(shape, T0);
    if (!first) {
      return;
    }
    for (const input of [shape, first]) {
      const entries = readiness.planningProjectionByInputSnapshot;
      if (!entries || !entries.get(input)) {
        continue;
      }
      const served =
        readiness.buildPriorityRecoveryPlanningProjection(input, T0);
      servedHits += 1;
      readiness.planningProjectionByInputSnapshot = null;
      const rebuilt =
        readiness.buildTrackedPriorityRecoveryPlanningProjection(input);
      readiness.planningProjectionByInputSnapshot = entries;
      if (JSON.stringify(served) !== JSON.stringify(rebuilt)) {
        divergences += 1;
      }
    }
  });
  return {servedHits, divergences};
}

// The verifier's audit in miniature: patch the identity lookup so every HIT is
// shadow-compared against a forced rebuild of the very same input, then run the
// production-composition formation sequence.
function shadowAuditFormationChurn() {
  const clock = {value: T0};
  const cache = createFormationShapedCache(T0);
  const {readiness} = createService({clock, cache});
  let hits = 0;
  let divergences = 0;
  const readCanonical = readiness.readCanonicalPlanningProjection;
  readiness.readCanonicalPlanningProjection = function(input, ...rest) {
    const served = readCanonical.call(this, input, ...rest);
    if (!served) {
      return served;
    }
    hits += 1;
    const entries = this.planningProjectionByInputSnapshot;
    this.planningProjectionByInputSnapshot = null;
    const rebuilt = this.buildTrackedPriorityRecoveryPlanningProjection(input);
    this.planningProjectionByInputSnapshot = entries;
    if (JSON.stringify(served) !== JSON.stringify(rebuilt)) {
      divergences += 1;
    }
    return served;
  };
  driveOwnerBuildSequence({readiness, cache, clock});
  return {hits, divergences};
}

// The formation-shaped owner-build sequence the audits share: a source-table
// write every fifth call, one readiness owner build per call, on the virtual
// clock the floored planning generation latches against.
function driveOwnerBuildSequence({readiness, cache, clock}) {
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
}

// The direct row is already the selected planning source. Its synchronous
// answer must have the same context custody as the existing asynchronous path.
test('direct sync answers preserve async shape and exact context custody', async (t) => {
  const publications = [null, undefined, {},
    {status: 'PUBLISHED', publicationEpoch: 3},
    {status: 'OPEN', publicationEpoch: null, publishedActiveNodeIds: [OWNER_NODE_ID]}];
  const options = {membershipPublicationPlanningSource: 'direct_publication_row'};
  let retainedCases = 0;
  for (const retain of [false, true]) {
    for (const publication of publications) {
      const left = createFixture();
      const right = createFixture();
      t.after(() => left.readiness.shutdown());
      t.after(() => right.readiness.shutdown());
      if (retain) {
        for (const world of [left, right]) {
          world.cache.applySystemTableChange(TABLES.CONTROL_PLANE_PUBLICATIONS, 'UPDATE', {
            publication_id: 'pub-1', publication_kind: 'cluster_membership',
            publication_epoch: 9, status: 'ACKNOWLEDGING', acknowledged_node_ids: '[]',
            published_active_node_ids: JSON.stringify([OWNER_NODE_ID]),
          });
          const prior = world.readiness.getPriorityRecoveryPlanningAnswerSync(
            OWNER_NODE_ID, world.clock.value);
          assert.equal(world.readiness.isPriorityControlPlaneRecoveryActive(prior), true);
          world.readiness.storeActivePriorityRecoveryPlanningSnapshot(
            OWNER_NODE_ID, prior, world.clock.value);
          assert.equal(world.readiness.getActivePriorityRecoveryPlanningSnapshot(
            OWNER_NODE_ID, world.clock.value), prior);
        }
      }
      const sync = left.readiness.resolveNodeMembershipPublicationPlanningAnswerSync(
        OWNER_NODE_ID, left.clock.value, publication, options);
      const asyncAnswer = await right.readiness.resolveNodeMembershipPublicationPlanningAnswer(
        OWNER_NODE_ID, right.clock.value, publication, options);
      assert.deepEqual(sync, asyncAnswer, `async parity with retained=${retain}`);
      const usedRetention = readPriorityRecoveryPlanningAnswerCallRetention(
        left.readiness, OWNER_NODE_ID);
      assert.equal(usedRetention, readPriorityRecoveryPlanningAnswerCallRetention(
        right.readiness, OWNER_NODE_ID));
      if (retain && usedRetention) retainedCases += 1;
      if (!sync) continue;
      const context = {nodeId: OWNER_NODE_ID, observedAt: left.clock.value,
        membershipPublication: publication ?? null, membershipPublicationPlanningSnapshot: sync};
      let merges = 0;
      const merge = left.readiness.resolveMembershipPublicationPlanningSnapshot;
      left.readiness.resolveMembershipPublicationPlanningSnapshot = function(...args) {
        merges += 1;
        return merge.apply(this, args);
      };
      const same = left.readiness
        .resolveMemoizedMembershipPublicationPlanningSnapshotForContextSync(context);
      assert.equal(same, sync);
      let asyncMerges = 0;
      const asyncMerge = right.readiness.resolveMembershipPublicationPlanningSnapshot;
      right.readiness.resolveMembershipPublicationPlanningSnapshot = function(...args) {
        asyncMerges += 1;
        return asyncMerge.apply(this, args);
      };
      right.readiness.resolveMemoizedMembershipPublicationPlanningSnapshotForContextSync(
        {...context, membershipPublicationPlanningSnapshot: asyncAnswer});
      assert.equal(merges, asyncMerges,
        `sync context reuse matches async for publication=${JSON.stringify(publication)}`);
      if (publication !== undefined) {
        assert.equal(merges, 0, 'the exact typed final answer is not merged again');
      }
      const beforeOtherOwner = asyncMerges;
      right.readiness.membershipPublicationPlanningSnapshotContextMemo = new WeakMap();
      right.readiness.resolveMemoizedMembershipPublicationPlanningSnapshotForContextSync(context);
      assert.equal(asyncMerges, beforeOtherOwner + 1,
        'another owner cannot reuse completed-answer context from this owner');
      const exactContextMerges = merges;
      for (const change of [{nodeId: 'node-1'}, {observedAt: left.clock.value + 1},
        {membershipPublication: {status: 'PUBLISHED', publicationEpoch: 7}}]) {
        left.readiness.membershipPublicationPlanningSnapshotContextMemo = new WeakMap();
        left.readiness.resolveMemoizedMembershipPublicationPlanningSnapshotForContextSync(
          {...context, ...change});
      }
      assert.equal(merges, exactContextMerges + 3,
        'different node, observation time or publication re-enters the owner');
    }
  }
  assert.ok(retainedCases > 0, 'the matrix actually exercises retained-answer selection');
});

function currentPublicationContext({readiness, clock}, nodeId = OWNER_NODE_ID) {
  return {nodeId, observedAt: clock.value,
    membershipPublication: readiness.getMembershipPublicationDiagnosticsSync(nodeId, clock.value)};
}

test('owned protocol input is bounded by the exact published domain', (t) => {
  const world = createFixture();
  t.after(() => world.readiness.shutdown());
  const {readiness} = world;
  const context = currentPublicationContext(world);
  const memo = readiness.membershipPublicationDiagnosticsMemo;
  assert.ok(Object.isFrozen(context.membershipPublication));
  assert.ok(Object.isFrozen(context.membershipPublication.publishedActiveNodeIds));
  const first = readiness.buildMembershipPublicationProtocolInput(context);
  assert.equal(readiness.buildMembershipPublicationProtocolInput(context), first);
  const second = readiness.buildMembershipPublicationProtocolInput({...context, nodeId: 'node-1'});
  assert.notEqual(second, first, 'target-specific inputs never share identity');
  for (const nodeId of context.membershipPublication.publishedActiveNodeIds) {
    readiness.buildMembershipPublicationPlanningSnapshot({...context, nodeId});
  }
  const retained = memo.protocolSnapshotsByNodeId.size;
  assert.equal(retained, context.membershipPublication.publishedActiveNodeIds.length);
  for (let index = 0; index < 40; index++) {
    const nodeId = `unpublished-${index}`;
    const answer = readiness.buildMembershipPublicationPlanningSnapshot({...context, nodeId});
    assert.ok(answer, 'out-of-domain nodes still receive a complete direct planning answer');
  }
  assert.equal(memo.protocolSnapshotsByNodeId.size, retained,
    'arbitrary target requests cannot grow the owned representation memo');
  const mutable = {...context.membershipPublication};
  readiness.membershipPublicationDiagnosticsMemo = {diagnostics: mutable};
  const mutableContext = {...context, membershipPublication: mutable};
  assert.notEqual(readiness.buildMembershipPublicationProtocolInput(mutableContext),
    readiness.buildMembershipPublicationProtocolInput(mutableContext),
    'even an exact memo reference cannot retain mutable input');
  assert.equal(readiness.membershipPublicationDiagnosticsMemo.protocolSnapshotsByNodeId, undefined);
  readiness.membershipPublicationDiagnosticsMemo = memo;
  for (const publication of [{...context.membershipPublication},
    Object.freeze({...context.membershipPublication})]) {
    const unowned = {...context, membershipPublication: publication};
    assert.notEqual(readiness.buildMembershipPublicationProtocolInput(unowned),
      readiness.buildMembershipPublicationProtocolInput(unowned),
      'mutable and unowned frozen input is constructed on every call');
  }
});

function assertFullPublicationProjection(readiness, context) {
  const served = readiness.buildMembershipPublicationPlanningSnapshot(context);
  const raw = buildPublicationRecoveryProtocolSnapshot(context.membershipPublication,
    {targetNodeId: context.nodeId});
  const fresh = raw ? readiness.normalizeMembershipPublicationPlanningSnapshot(raw) : null;
  assert.deepEqual(served, fresh, 'reused input agrees with a fresh canonical derivation');
  return served;
}

test('protocol reuse respects semantic currency and admission denial then recovery', (t) => {
  const world = createFixture();
  t.after(() => world.readiness.shutdown());
  const {readiness, cache, builds} = world;
  const context = currentPublicationContext(world);
  const raw = readiness.buildMembershipPublicationProtocolInput(context);
  let normalizations = 0;
  const normalize = readiness.normalizeMembershipPublicationPlanningSnapshot;
  readiness.normalizeMembershipPublicationPlanningSnapshot = function(...args) {
    normalizations += 1;
    return normalize.apply(this, args);
  };
  readiness.buildMembershipPublicationPlanningSnapshot(context);
  readiness.buildMembershipPublicationPlanningSnapshot(context);
  assert.equal(normalizations, 2, 'every use still crosses the current normalizer');
  const before = builds.length;
  cache.applySystemTableChange(TABLES.SERVICES, 'UPDATE', {
    [COLUMN.SERVICE_ID]: 'service-0', [COLUMN.NODE_ID]: OWNER_NODE_ID,
    [COLUMN.ADDRESS]: 'node-0/partition/priority-partition-v2',
  });
  assertFullPublicationProjection(readiness, context);
  assert.ok(builds.length > before, 'changed semantic currency engages fresh normalization');
  const deniedFence = Object.freeze({allowed: false, state: 'identity_mismatch',
    reasonCodes: ['cluster_incarnation_identity_mismatch']});
  readiness.syncOwnerDependencies({localClusterIncarnationFenceProvider: () => deniedFence});
  const denied = assertFullPublicationProjection(readiness, context);
  assert.equal(denied.admissionState, 'blocked');
  assert.deepEqual(denied.admissionReasonCodes, ['cluster_incarnation_identity_mismatch']);
  assert.equal(denied.clusterIncarnationFence, deniedFence);
  const admittedFence = Object.freeze({allowed: true, state: 'ready', reasonCodes: []});
  readiness.syncOwnerDependencies({localClusterIncarnationFenceProvider: () => admittedFence});
  const admitted = assertFullPublicationProjection(readiness, context);
  assert.equal(admitted.admissionState, 'admitted');
  assert.deepEqual(admitted.admissionReasonCodes, []);
  assert.equal(admitted.clusterIncarnationFence, admittedFence);
  assert.equal(readiness.buildMembershipPublicationProtocolInput(context), raw,
    'only pure raw representation survives changing admission evidence');
});

test('protocol reuse follows actual publication owner replacement and retirement', (t) => {
  const world = createFixture();
  t.after(() => world.readiness.shutdown());
  const {readiness, cache, clock} = world;
  const context = currentPublicationContext(world);
  const raw = readiness.buildMembershipPublicationProtocolInput(context);
  cache.applySystemTableChange(TABLES.CONTROL_PLANE_PUBLICATIONS, 'UPDATE', {
    publication_id: 'pub-1', publication_kind: 'cluster_membership',
    publication_epoch: 7, status: 'PUBLISHED',
  });
  const changed = currentPublicationContext(world);
  assert.equal(assertFullPublicationProjection(readiness, changed).publicationEpoch, 7);
  assert.notEqual(readiness.buildMembershipPublicationProtocolInput(changed), raw);
  const oldMemo = readiness.membershipPublicationDiagnosticsMemo;
  const replacementCache = createFormationShapedCache(clock.value);
  replacementCache.applySystemTableChange(TABLES.CONTROL_PLANE_PUBLICATIONS, 'UPDATE', {
    publication_id: 'pub-1', publication_kind: 'cluster_membership',
    publication_epoch: 11, status: 'PUBLISHED',
  });
  // A re-wiring is validated: the fixture completes the partial cache.
  readiness.syncOwnerDependencies({systemTableCache:
    readinessCollaboratorFake('systemTableCache', replacementCache)});
  assert.equal(readiness.membershipPublicationDiagnosticsMemo, null);
  const cacheChanged = currentPublicationContext(world);
  assert.notEqual(readiness.membershipPublicationDiagnosticsMemo, oldMemo);
  assert.equal(assertFullPublicationProjection(readiness, cacheChanged).publicationEpoch, 7,
    'the unchanged publication owner still supplies the authoritative current answer');
  const replacement = createPublicationCoordinator({readiness, cache: replacementCache, clock});
  readiness.syncOwnerDependencies({membershipPublicationService: replacement});
  assert.equal(readiness.membershipPublicationDiagnosticsMemo, null);
  const ownerChanged = currentPublicationContext(world);
  assert.equal(assertFullPublicationProjection(readiness, ownerChanged).publicationEpoch, 11,
    'the new canonical publication owner supplies its different current contents');
  assert.notEqual(ownerChanged.membershipPublication, cacheChanged.membershipPublication);
  readiness.shutdown();
  assert.equal(readiness.membershipPublicationDiagnosticsMemo, null);
});

test('complete accounting rejects the actual fresh-bulk omission schedule', (t) => {
  const {readiness, clock} = createFixture();
  t.after(() => readiness.shutdown());
  // On this cold fixture the retired pre-2cd fresh-miss behavior returned no
  // nodes. Engage that missing work at the actual caller boundary, not only by
  // changing a recorded measurement vector.
  readiness.getAllNodeReadinessSync = () => [];
  const work = tracePublicationPlanningWork(readiness);
  readiness.getPriorityRecoveryPlanningAnswerSync(OWNER_NODE_ID, clock.value);
  assert.equal(work.length, VERSION_KEY_ADVANCE_BUILDS,
    'the defective schedule still does the three candidate builds');
  const expectedNodeIds = Array.from({length: NODE_COUNT}, (_, index) => `node-${index}`);
  assert.throws(() => assertPublicationAdvanceWork(work, expectedNodeIds),
    'missing completed node observations fail even though total work fell to three');
});

function tracePublicationPlanningWork(readiness) {
  const work = [];
  const frames = [];
  const buildNode = readiness.buildNodeReadinessSyncCurrent;
  readiness.buildNodeReadinessSyncCurrent = function(nodeId, options = {}) {
    const frame = {scope: 'node', nodeId, source: options.membershipPublicationPlanningSource};
    frames.push(frame);
    try {
      const snapshot = buildNode.call(this, nodeId, options);
      work.push({kind: 'observation', ...frame, snapshot});
      return snapshot;
    } finally {
      frames.pop();
    }
  };
  const buildProjection = readiness.buildTrackedPriorityRecoveryPlanningProjection;
  readiness.buildTrackedPriorityRecoveryPlanningProjection = function(...args) {
    work.push({kind: 'build', ...(frames.at(-1) ?? {scope: 'candidate'})});
    return buildProjection.apply(this, args);
  };
  return work;
}

function assertPublicationAdvanceWork(work, expectedNodeIds) {
  const observations = new Map(expectedNodeIds.map((id) => [id, 0]));
  const nodeBuilds = new Map(expectedNodeIds.map((id) => [id, 0]));
  let candidateBuilds = 0;
  let totalBuilds = 0;
  for (const event of work) {
    assert.ok(event.kind === 'build' || event.kind === 'observation', 'every event is classified');
    if (event.kind === 'build') totalBuilds += 1;
    if (event.scope === 'candidate') {
      assert.equal(event.kind, 'build');
      candidateBuilds += 1;
    } else {
      assert.equal(event.scope, 'node');
      assert.equal(event.source, 'direct_publication_row');
      assert.ok(observations.has(event.nodeId), 'every node is in the independent expected domain');
      if (event.kind === 'observation') {
        assert.equal(event.snapshot?.nodeId, event.nodeId, 'the requested node snapshot returned');
        for (const dimension of ['clusterMemberHealthy', 'controlPlaneWritable', 'serveEligible']) {
          assert.equal(typeof event.snapshot?.dimensions?.[dimension], 'boolean');
        }
        assert.ok(Array.isArray(event.snapshot.reasons), 'the completed result includes its reasons');
      }
      const counts = event.kind === 'observation' ? observations : nodeBuilds;
      counts.set(event.nodeId, counts.get(event.nodeId) + 1);
    }
  }
  assert.equal(candidateBuilds, VERSION_KEY_ADVANCE_BUILDS);
  for (const nodeId of expectedNodeIds) {
    assert.equal(observations.get(nodeId), 1, `one fresh evaluation for ${nodeId}`);
    assert.equal(nodeBuilds.get(nodeId), 2, `projection and verification for ${nodeId}`);
  }
  assert.equal(totalBuilds, VERSION_KEY_ADVANCE_BUILDS + 2 * expectedNodeIds.length,
    'every build contributes to the complete total');
}
