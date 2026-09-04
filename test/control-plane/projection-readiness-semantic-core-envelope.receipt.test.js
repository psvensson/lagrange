// Receipt tests for quest projection-readiness-evidence-amplification-v4:
// the readiness contract splits into a TIMESTAMP-FREE SEMANTIC CORE (owned,
// generation-keyed, reused by reference) and a fresh per-evaluation ENVELOPE
// (the evaluation snapshot carrying this call's observation time). The v3
// receipts proved soundness under a PINNED clock; production measured reuse
// ~0 because the generation key digested a per-evaluation clock fallback
// (priorityControlPlaneRecovery.enteredAt, GCP 2026-09-03). These receipts
// close that vacuous-engagement hole: a mutation that returns observation
// time to the semantic key reds ENGAGEMENT and INV below.
import {performance} from 'node:perf_hooks';
import {test} from '../../src/test-helpers/tap.js';
import {
  createAccountingService,
  createActiveNode,
  createCache,
  createMessageGroupService,
  createPublicationService,
} from './control-plane-readiness-service-test-support.js';
import {
  COLUMN,
  STATE,
  TABLES,
} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_PUBLICATION_MODE,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  ProjectionReadinessEvidenceOwner,
} from '../../src/control-plane/projection-readiness-evidence-owner.js';
import {
  buildProjectionReadinessGenerationKey,
} from '../../src/control-plane/projection-readiness-evidence-generation.js';

const CLOCK_START_MS = 350000;
// Keep observation time moving without crossing a node-liveness semantic
// deadline; time-only liveness transitions have their own owner receipts.
const CLOCK_STEP_MS = 1;
const ENGAGEMENT_EVALUATIONS = 50;
const PERF_UNIT_EVALUATIONS = 10000;
const PERF_UNIT_GENERATIONS = 20;
const PERF_INTEGRATION_EVALUATIONS = 200;
const PERF_INTEGRATION_GENERATION_STRIDE = 20;

function withMutationVersions(cache) {
  const versionByTable = new Map();
  const bump = (tableName) => {
    versionByTable.set(tableName, (versionByTable.get(tableName) || 0) + 1);
  };
  const wrapped = Object.create(cache);
  wrapped.getTableMutationVersion = (tableName) =>
    versionByTable.get(tableName) || 0;
  wrapped.applySystemTableChange = (tableName, operation, row) => {
    const result = cache.applySystemTableChange(tableName, operation, row);
    bump(tableName);
    return result;
  };
  wrapped.bumpTableMutationVersion = bump;
  return wrapped;
}

// An authoritative change to the node's OWN evidence (its NODES row): with the
// per-node generation model (quest projection-readiness-per-node-generation-
// granularity) a bare table-version bump that changes no observed content no
// longer rotates a node's key, so the receipts model "the generation moved"
// as the real row change it always stood for.
let heartbeatAdvance = 0;
function advanceNodeHeartbeat(cache, nodeId) {
  heartbeatAdvance += 1;
  cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
    ...createActiveNode(nodeId),
    [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
    [COLUMN.LAST_HEARTBEAT]: CLOCK_START_MS - 100 + heartbeatAdvance,
    [COLUMN.READY_LEASE_EXPIRES_AT]: CLOCK_START_MS + 60000,
  });
}

function buildMovingClockFixture(nodeId) {
  const cache = withMutationVersions(createCache({
    nodes: [{
      ...createActiveNode(nodeId),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: CLOCK_START_MS - 100,
      [COLUMN.READY_LEASE_EXPIRES_AT]: CLOCK_START_MS + 60000,
    }],
    services: [createMessageGroupService(nodeId)],
  }));
  const clock = {nowMs: CLOCK_START_MS};
  let publicationReads = 0;
  const publicationService = createPublicationService({
    currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
    reasonCode: null,
    enteredAt: '2026-03-04T00:00:00.000Z',
    recentTransitions: [],
  });
  const countingPublicationService = {
    getPublicationModeDiagnostics() {
      publicationReads += 1;
      return publicationService.getPublicationModeDiagnostics();
    },
  };
  const service = new ControlPlaneReadinessService({
    nodeId,
    systemTableCache: cache,
    cacheMutationTarget: cache,
    messageRouter: {getConnectionState: () => STATE.CONNECTED},
    storageAccountingService: createAccountingService({
      [nodeId]: {nodeId, budgetBytes: 1000, pressureState: 'normal'},
    }),
    cdcGroupPropagationService: countingPublicationService,
    now: () => (clock.nowMs += CLOCK_STEP_MS),
  });
  return {
    service,
    cache,
    clock,
    readPublicationReadCount: () => publicationReads,
  };
}

// ---- INV: observation-time fields are classified out of the semantic key ---

test('INV: observation-time fields never rotate the semantic key; the ' +
  'repair identity timestamp still does', (t) => {
  const base = {
    tableVersions: 'v',
    planningVersionKey: 'p',
    dimensions: {clusterMemberHealthy: true},
    runtimeAuthority: {
      routingReady: true,
      visibility: {published: true, enteredAt: 1000},
      repair: {outcome: 'repaired', recordedAt: '2026-03-04T00:00:01.000Z'},
    },
    priorityControlPlaneRecovery: {active: false, enteredAt: 1000},
    runtimeServeEligible: true,
    publication: {currentMode: 'grouped', enteredAt: '2026-03-04T00:00:00.000Z'},
  };
  const key = buildProjectionReadinessGenerationKey(base);
  // Observational: the exact production rotator — the priority projection's
  // per-evaluation enteredAt clock fallback (GCP 2026-09-03 measurement).
  t.equal(key, buildProjectionReadinessGenerationKey({
    ...base,
    priorityControlPlaneRecovery: {active: false, enteredAt: 2000},
  }), 'priorityRecovery.enteredAt alone never rotates the key');
  t.equal(key, buildProjectionReadinessGenerationKey({
    ...base,
    publication: {currentMode: 'grouped', enteredAt: '2026-03-04T09:00:00.000Z'},
  }), 'publication.enteredAt alone never rotates the key');
  t.equal(key, buildProjectionReadinessGenerationKey({
    ...base,
    runtimeAuthority: {
      ...base.runtimeAuthority,
      visibility: {published: true, enteredAt: 9999},
    },
  }), 'runtimeAuthority.visibility.enteredAt alone never rotates the key');
  t.equal(key, buildProjectionReadinessGenerationKey({
    ...base,
    dimensions: {clusterMemberHealthy: true, observedAt: 12345},
  }), 'an observedAt observation stamp alone never rotates the key');
  t.equal(key, buildProjectionReadinessGenerationKey({
    ...base,
    dimensions: {clusterMemberHealthy: true, observedAtMs: 12345},
  }), 'an observedAtMs observation stamp alone never rotates the key');
  // Semantic: the repair identity is carried by recordedAt (v2 DEP finding E)
  // and MUST keep rotating the key.
  t.not(key, buildProjectionReadinessGenerationKey({
    ...base,
    runtimeAuthority: {
      ...base.runtimeAuthority,
      repair: {outcome: 'repaired', recordedAt: '2026-03-04T00:00:09.000Z'},
    },
  }), 'repair.recordedAt (repair identity) still rotates the key');
  t.end();
});

// ---- ENGAGEMENT: a moving clock cannot defeat semantic reuse ---------------

test('ENGAGEMENT (integration): clock-advancing evaluations of an unchanged ' +
  'semantic generation build once and reuse the SAME core reference',
async (t) => {
  const nodeId = 'seed-node';
  const {service} = buildMovingClockFixture(nodeId);
  const cores = [];
  for (let i = 0; i < ENGAGEMENT_EVALUATIONS; i += 1) {
    const snapshot = await service.evaluateNodeReadiness(nodeId, {});
    cores.push(snapshot.projectionReadinessContract);
  }
  const stats = service.projectionReadinessEvidenceOwner.stats();
  t.equal(stats.normalizeBuildCount, 1,
    `one semantic-core build for ${ENGAGEMENT_EVALUATIONS} clock-advancing ` +
    'evaluations');
  t.ok(stats.reuseHitCount >= ENGAGEMENT_EVALUATIONS - 1,
    'every later evaluation was a reuse hit');
  for (let i = 1; i < cores.length; i += 1) {
    if (cores[i] !== cores[0]) {
      t.fail(`evaluation ${i} returned a different core reference`);
      break;
    }
  }
  t.equal(cores[cores.length - 1], cores[0],
    'the semantic core is reused BY REFERENCE across the whole run');
  t.end();
});

// ---- FRESHNESS: reuse never staleness the envelope observation time --------

test('FRESHNESS (integration): a reused core still ships each call\'s own ' +
  'observation time in the envelope', async (t) => {
  const nodeId = 'seed-node';
  const {service} = buildMovingClockFixture(nodeId);
  const first = await service.evaluateNodeReadiness(nodeId, {});
  const second = await service.evaluateNodeReadiness(nodeId, {});
  t.equal(second.projectionReadinessContract,
    first.projectionReadinessContract,
    'unchanged semantic state: the same immutable core (reference equality)');
  const firstObservedMs = Date.parse(first.observedAt);
  const secondObservedMs = Date.parse(second.observedAt);
  t.ok(Number.isFinite(firstObservedMs) && Number.isFinite(secondObservedMs),
    'both envelopes carry a parseable observedAt');
  t.ok(secondObservedMs > firstObservedMs,
    'the second envelope carries the LATER evaluation time (T2 > T1)');
  t.ok(Object.isFrozen(first.projectionReadinessContract),
    'the shared core stays immutable — freshness comes from the envelope, ' +
    'never from mutating the core');
  t.end();
});

// ---- SEMANTIC-KEY: real dependencies still rotate the core -----------------

test('SEMANTIC-KEY: each semantic dependency class rotates the key while ' +
  'observation time is excluded', (t) => {
  // Quest projection-readiness-per-node-generation-granularity-v2: the key
  // is fully content-covered — the former table-version and planning
  // segments are replaced by the node's own evidence and the digested
  // membership-publication content (both semantic dependency classes).
  const base = {
    membershipPublication: {publicationEpoch: 1, status: 'published'},
    nodeEvidence: {status: 'active', routerConnectionState: 'connected'},
    dimensions: {clusterMemberHealthy: true},
    runtimeAuthority: {routingReady: true},
    priorityControlPlaneRecovery: {active: false, enteredAt: 1000},
    runtimeServeEligible: true,
    publication: {currentMode: 'grouped'},
  };
  const key = buildProjectionReadinessGenerationKey(base);
  const rotations = [
    ['membership-publication content', {...base,
      membershipPublication: {publicationEpoch: 2, status: 'published'}}],
    ['node evidence', {...base,
      nodeEvidence: {status: 'active', routerConnectionState: 'disconnected'}}],
    ['transport/lifecycle dimension',
      {...base, dimensions: {clusterMemberHealthy: false}}],
    ['runtimeAuthority verdict',
      {...base, runtimeAuthority: {routingReady: false}}],
    ['priority-recovery activation', {
      ...base,
      priorityControlPlaneRecovery: {active: true, enteredAt: 1000},
    }],
    ['runtime serve admission', {...base, runtimeServeEligible: false}],
    ['publication mode',
      {...base, publication: {currentMode: 'repair_only'}}],
  ];
  for (const [label, mutated] of rotations) {
    t.not(key, buildProjectionReadinessGenerationKey(mutated),
      `${label} change rotates the semantic key`);
  }
  t.end();
});

test('SEMANTIC-KEY (integration): an authoritative table change rebuilds ' +
  'the core under a moving clock', async (t) => {
  const nodeId = 'seed-node';
  const {service, cache} = buildMovingClockFixture(nodeId);
  const first = await service.evaluateNodeReadiness(nodeId, {});
  await service.evaluateNodeReadiness(nodeId, {});
  advanceNodeHeartbeat(cache, nodeId);
  const third = await service.evaluateNodeReadiness(nodeId, {});
  const stats = service.projectionReadinessEvidenceOwner.stats();
  t.equal(stats.normalizeBuildCount, 2,
    'the semantic change forced exactly one rebuild');
  t.not(third.projectionReadinessContract, first.projectionReadinessContract,
    'the rebuilt core is a new reference');
  t.end();
});

// ---- R2 preserved: cores stay strictly per-node ----------------------------

test('R2 preserved: distinct nodes are never aliased to one semantic core',
  (t) => {
    const owner = new ProjectionReadinessEvidenceOwner();
    const coreA = Object.freeze({node: 'A'});
    const coreB = Object.freeze({node: 'B'});
    const outA = owner.resolveContract('node-A', 'gen', () => coreA, () => true);
    const outB = owner.resolveContract('node-B', 'gen', () => coreB, () => true);
    t.equal(outA, coreA, 'node-A owns its core');
    t.equal(outB, coreB, 'node-B owns its core');
    t.not(outA, outB, 'same generation key string, still no cross-node alias');
    t.equal(owner.stats().ownedNodeCount, 2, 'two independent owned entries');
    t.end();
  });

// ---- SOURCE-FRESHNESS: observation authority is untouched ------------------

test('SOURCE-FRESHNESS: every evaluation still observes through the source ' +
  'owner even while the core is reused', async (t) => {
  const nodeId = 'seed-node';
  const {service, readPublicationReadCount} = buildMovingClockFixture(nodeId);
  const evaluations = 10;
  for (let i = 0; i < evaluations; i += 1) {
    await service.evaluateNodeReadiness(nodeId, {});
  }
  const stats = service.projectionReadinessEvidenceOwner.stats();
  t.equal(stats.normalizeBuildCount, 1, 'one core build across the run');
  t.ok(readPublicationReadCount() >= evaluations,
    'the publication owner was observed on EVERY evaluation — reuse elides ' +
    'only the normalize, never an observation');
  const owner = new ProjectionReadinessEvidenceOwner();
  t.equal(typeof owner.observe, 'undefined',
    'the semantic-core owner has no observe surface');
  t.equal(typeof owner.readNodeRow, 'undefined',
    'the semantic-core owner has no read surface');
  t.end();
});

// ---- PERF: engagement actually moves the work ------------------------------

test('PERF (unit): 10k evaluations across 20 semantic generations build ' +
  '20 cores', (t) => {
  const owner = new ProjectionReadinessEvidenceOwner();
  let builds = 0;
  const evaluationsPerGeneration =
    PERF_UNIT_EVALUATIONS / PERF_UNIT_GENERATIONS;
  for (let i = 0; i < PERF_UNIT_EVALUATIONS; i += 1) {
    const generation = Math.floor(i / evaluationsPerGeneration);
    owner.resolveContract('node-1', `gen-${generation}`, () => {
      builds += 1;
      return Object.freeze({generation});
    }, () => true);
  }
  const stats = owner.stats();
  t.equal(builds, PERF_UNIT_GENERATIONS,
    'core builds equal semantic generations, not evaluations');
  t.equal(stats.reuseHitCount,
    PERF_UNIT_EVALUATIONS - PERF_UNIT_GENERATIONS,
    'every other evaluation reused the owned core');
  t.end();
});

test('PERF (integration): under a moving clock, normalize count tracks ' +
  'semantic generations and the cached run does less normalize work than ' +
  'the uncached one', async (t) => {
  const nodeId = 'seed-node';
  const generations =
    PERF_INTEGRATION_EVALUATIONS / PERF_INTEGRATION_GENERATION_STRIDE;

  const cached = buildMovingClockFixture(nodeId);
  const cachedStartMs = performance.now();
  for (let i = 0; i < PERF_INTEGRATION_EVALUATIONS; i += 1) {
    if (i > 0 && i % PERF_INTEGRATION_GENERATION_STRIDE === 0) {
      advanceNodeHeartbeat(cached.cache, nodeId);
    }
    await cached.service.evaluateNodeReadiness(nodeId, {});
  }
  const cachedMs = performance.now() - cachedStartMs;
  const cachedStats = cached.service.projectionReadinessEvidenceOwner.stats();

  const uncached = buildMovingClockFixture(nodeId);
  uncached.service.projectionReadinessEvidenceOwner = null;
  const uncachedStartMs = performance.now();
  for (let i = 0; i < PERF_INTEGRATION_EVALUATIONS; i += 1) {
    await uncached.service.evaluateNodeReadiness(nodeId, {});
  }
  const uncachedMs = performance.now() - uncachedStartMs;

  t.equal(cachedStats.normalizeBuildCount, generations,
    `${PERF_INTEGRATION_EVALUATIONS} evaluations across ${generations} ` +
    `generations normalized exactly ${generations} times`);
  t.equal(cachedStats.reuseHitCount,
    PERF_INTEGRATION_EVALUATIONS - generations,
    'all remaining evaluations were reuse hits');
  // Timing is reported as evidence, never sealed as a threshold: loaded
  // runners make wall-clock ratios flaky, and the build-count collapse above
  // is the mechanism that moves the cost.
  t.pass(`measured wall clock: cached ${Math.round(cachedMs)}ms ` +
    `(${cachedStats.normalizeBuildCount} normalizes) vs uncached ` +
    `${Math.round(uncachedMs)}ms (${PERF_INTEGRATION_EVALUATIONS} normalizes)`);
  t.end();
});
