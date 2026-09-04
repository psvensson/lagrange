// Receipt tests for quest projection-readiness-per-node-generation-granularity-v2
// (successor of the parked v1): the ProjectionReadinessEvidenceOwner semantic
// generation is a pure content digest of the node's OWN observed semantic
// inputs — no cluster-wide version segment, no planning segment — so an
// authoritative mutation rotates node N's generation iff it changes N's
// observed semantic inputs. Fixtures use the REAL SystemTableCache (synchronous mutation versions,
// setImmediate listeners) and the REAL MembershipPublicationCoordinator sync
// read over a real membership publication row, driven through the production
// sync-read caller path (buildNodeReadinessSyncCurrent, the
// ReadinessPlanningSnapshotOwner reconcile entry).
//
// DEP-SCOPE map: solve/evidence/projection-readiness-per-node-generation-
// granularity.dep-scope.md.
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
  NODE_STATE,
  SERVICE_STATUS,
  STATE,
  TABLES,
} from '../../src/constants/index.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  MembershipPublicationCoordinator,
  buildMembershipPublicationRow,
} from '../../src/control-plane/membership-publication-coordinator.js';
import {MEMBERSHIP_PUBLICATION_STATUS} from
  '../../src/control-plane/membership-publication-row-contract.js';
import {
  CONTROL_PLANE_PUBLICATION_MODE,
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  ControlPlaneReadinessDiagnosticsEligibility,
} from '../../src/control-plane/control-plane-readiness-diagnostics-eligibility.js';
import {
  PROJECTION_READINESS_MAX_OWN_DATA_DEPTH,
} from '../../src/control-plane/projection-readiness-evidence.js';
import {
  PROJECTION_READINESS_COVERAGE,
  PROJECTION_READINESS_GENERATION_INCOMPLETE_REASON,
  PROJECTION_READINESS_GENERATION_SEGMENT,
  PROJECTION_READINESS_GENERATION_STATE,
  PROJECTION_READINESS_PUBLICATION_MEMO_TABLES,
  PROJECTION_READINESS_SOURCE_FIELD_COVERAGE,
  attributeProjectionReadinessGenerationRotation,
  buildProjectionReadinessGeneration,
  buildProjectionReadinessGenerationKey,
} from '../../src/control-plane/projection-readiness-evidence-generation.js';

const CLOCK_START_MS = 350000;
// Keep observation time moving without crossing a node-liveness semantic
// deadline; this suite isolates mutation-driven planning generation scope.
const CLOCK_STEP_MS = 1;
const LEASE_HORIZON_MS = 60000;
const NODE_COUNT = 5;
const NODE_IDS = Object.freeze(
  Array.from({length: NODE_COUNT}, (_, index) => `node-${index}`));
const SEED = NODE_IDS[0];
const AFFECTED = NODE_IDS[1];
const UNAFFECTED = Object.freeze(NODE_IDS.filter((id) => id !== AFFECTED));
const PUBLICATION_MODE_SNAPSHOT = Object.freeze({
  currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
  reasonCode: null,
  enteredAt: '2026-03-04T00:00:00.000Z',
  recentTransitions: [],
});
const ENGAGEMENT_ROUNDS = 12;
const BOUNDED_WORK_ROUNDS = 10;
// The digest walks each seam field from depth 0 while the normalizer enters
// the whole picked source at depth 0 (a field's value sits at normalizer
// depth 1), so the digest cap is the normalizer's cap minus one.
const DIGEST_DEPTH_CAP = PROJECTION_READINESS_MAX_OWN_DATA_DEPTH - 1;
const HUGE_SPARSE_LENGTH = 5000000;
const REJECTION_BUDGET_MS = 50;
const SEGMENT_INDEX = Object.freeze(Object.fromEntries(
  PROJECTION_READINESS_GENERATION_SEGMENT.map((name, index) => [name, index])));
const NODE_LOCAL_CAUSES = Object.freeze(
  PROJECTION_READINESS_GENERATION_SEGMENT.filter((name) =>
    name !== 'membershipPublication'));
const FORMATION_RELEASE_HANDOFF_PUBLICATION_KIND = 'formation_release_handoff';

function publicationRow(epoch, nowMs, overrides = {}) {
  return buildMembershipPublicationRow({
    candidate: {
      publicationEpoch: epoch,
      publishedActiveNodeIds: NODE_IDS,
      publisherNodeId: SEED,
      requiredAckNodeIds: NODE_IDS,
      acknowledgedNodeIds: NODE_IDS,
      ...overrides,
    },
    status: MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
    nowMs,
    publicationId: `pub-${epoch}`,
  });
}

function nodeRow(nodeId, nowMs, overrides = {}) {
  return {
    ...createActiveNode(nodeId),
    [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
    [COLUMN.LAST_HEARTBEAT]: nowMs - 100,
    [COLUMN.READY_LEASE_EXPIRES_AT]: nowMs + LEASE_HORIZON_MS,
    ...overrides,
  };
}

function flushCacheListeners() {
  return new Promise((resolve) => setImmediate(resolve));
}

// A production-shaped five-node cluster over the REAL cache. The planning
// derivation latch stays LIVE in every receipt (it is no longer a key
// segment, so its fixture-clock behaviour cannot influence reuse).
function buildCluster({realClock = false} = {}) {
  const startMs = realClock ? Date.now() : CLOCK_START_MS;
  const clock = {nowMs: startMs};
  const now = realClock ? () => Date.now() : () => (clock.nowMs += CLOCK_STEP_MS);
  const cache = new SystemTableCache();
  for (const nodeId of NODE_IDS) {
    cache.applySystemTableChange(TABLES.NODES, 'INSERT', nodeRow(nodeId, startMs));
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT',
      createMessageGroupService(nodeId));
  }
  cache.applySystemTableChange(TABLES.CONTROL_PLANE_PUBLICATIONS, 'INSERT',
    publicationRow(1, startMs));
  const coordinator = new MembershipPublicationCoordinator({
    nodeId: SEED,
    systemTableCache: cache,
    now,
  });
  const transport = new Map();
  const publicationMode = {snapshot: PUBLICATION_MODE_SNAPSHOT};
  const service = new ControlPlaneReadinessService({
    nodeId: SEED,
    systemTableCache: cache,
    cacheMutationTarget: cache,
    messageRouter: {
      getConnectionState: (nodeId) => transport.get(nodeId) || STATE.CONNECTED,
    },
    storageAccountingService: createAccountingService(Object.fromEntries(
      NODE_IDS.map((nodeId) =>
        [nodeId, {nodeId, budgetBytes: 1000, pressureState: 'normal'}]))),
    cdcGroupPropagationService: {
      getPublicationModeDiagnostics: () =>
        createPublicationService(publicationMode.snapshot)
          .getPublicationModeDiagnostics(),
    },
    membershipPublicationService: coordinator,
    now,
  });
  const readSync = (nodeId) => service.buildNodeReadinessSyncCurrent(nodeId, {
    readinessPlanningOwnerBuild: true,
  });
  const readAll = () => Object.fromEntries(
    NODE_IDS.map((nodeId) => [nodeId, readSync(nodeId)]));
  const owner = () => service.projectionReadinessEvidenceOwner;
  const coreOf = (snapshot) => snapshot.projectionReadinessContract;
  return {
    cache, service, clock, transport, publicationMode, startMs,
    readSync, readAll, owner, coreOf,
    heartbeat(nodeId, step) {
      cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
        [COLUMN.NODE_ID]: nodeId,
        [COLUMN.LAST_HEARTBEAT]: startMs - 100 + step,
        updated_at: startMs + step,
      });
    },
    serviceTouch(nodeId, step, overrides = {}) {
      cache.applySystemTableChange(TABLES.SERVICES, 'UPDATE', {
        ...createMessageGroupService(nodeId),
        updated_at: startMs + step,
        load_hint: step,
        ...overrides,
      });
    },
  };
}

function nodeBuilds(cluster, nodeId) {
  return cluster.owner().nodeStats(nodeId).buildCount;
}

function nodeReuse(cluster, nodeId) {
  return cluster.owner().nodeStats(nodeId).reuseCount;
}

function nodeLocalBuilds(cluster, nodeId) {
  const byCause = cluster.owner().nodeStats(nodeId).buildCountByCause;
  return NODE_LOCAL_CAUSES.reduce((sum, cause) => sum + byCause[cause], 0);
}

function ownedKey(cluster, nodeId) {
  return cluster.owner().entryByNodeId.get(nodeId)?.key ?? null;
}

function objectDepth(value, depth = 0) {
  if (!value || typeof value !== 'object') return depth;
  let deepest = depth;
  for (const key of Object.keys(value)) {
    deepest = Math.max(deepest, objectDepth(value[key], depth + 1));
  }
  return deepest;
}

// ---- DEP-SCOPE: owner-path source fields pinned + classified --------------

test('DEP-SCOPE: every field reaching the owner seam on both production ' +
  'paths is classified, the global revision is the publication table, and ' +
  'the digested verdicts stay inside the digest depth cap', async (t) => {
  const seen = [];
  const proto = ControlPlaneReadinessDiagnosticsEligibility.prototype;
  const original = proto.computeProjectionReadinessGeneration;
  proto.computeProjectionReadinessGeneration = function(context, source, verdicts) {
    seen.push({
      nodeId: context?.nodeId,
      sourceKeys: Object.keys(source).sort(),
      depths: {
        dimensions: objectDepth(verdicts?.baseDimensions),
        runtimeAuthority: objectDepth(verdicts?.runtimeAuthority),
        priorityControlPlaneRecovery:
          objectDepth(verdicts?.priorityControlPlaneRecovery),
        publication: objectDepth(context?.publication),
        nodeEvidence: objectDepth(context?.nodeEvidence),
        membershipPublication: objectDepth(context?.membershipPublication),
      },
    });
    return original.call(this, context, source, verdicts);
  };
  try {
    const cluster = buildCluster();
    cluster.readAll();
    await cluster.service.evaluateNodeReadiness(AFFECTED, {
      allowAuthoritativeRefresh: true,
    });
  } finally {
    proto.computeProjectionReadinessGeneration = original;
  }
  t.ok(seen.length >= NODE_COUNT + 1,
    `seam reached on the sync path for ${NODE_COUNT} nodes and on the ` +
    `async authoritative path (${seen.length} seam calls)`);
  const classified = Object.keys(PROJECTION_READINESS_SOURCE_FIELD_COVERAGE).sort();
  for (const call of seen) {
    t.same(call.sourceKeys, classified,
      `${call.nodeId}: the seam source is exactly the classified set`);
    for (const [record, depth] of Object.entries(call.depths)) {
      if (record === 'membershipPublication') continue;
      t.ok(depth < DIGEST_DEPTH_CAP,
        `${call.nodeId}: ${record} nests ${depth} < cap ${DIGEST_DEPTH_CAP}`);
    }
  }
  t.same(PROJECTION_READINESS_SOURCE_FIELD_COVERAGE, {
    dimensions: PROJECTION_READINESS_COVERAGE.CONTENT,
    runtimeAuthority: PROJECTION_READINESS_COVERAGE.CONTENT,
    priorityControlPlaneRecovery: PROJECTION_READINESS_COVERAGE.CONTENT,
    runtimeServeEligible: PROJECTION_READINESS_COVERAGE.CONTENT,
    nodeEvidence: PROJECTION_READINESS_COVERAGE.CONTENT,
    membershipPublication: PROJECTION_READINESS_COVERAGE.CONTENT,
  }, 'classification: every owner-path field is CONTENT-covered');
  t.same([...PROJECTION_READINESS_PUBLICATION_MEMO_TABLES],
    [TABLES.CONTROL_PLANE_PUBLICATIONS],
    'the publication table version only stamps the sync diagnostics memo');
  // The cluster-wide-by-content membership publication precedes the node's
  // own segments, so rotation attribution names it first when co-rotating.
  t.same([...PROJECTION_READINESS_GENERATION_SEGMENT],
    ['membershipPublication', 'nodeEvidence', 'dimensions', 'runtimeAuthority',
      'priorityControlPlaneRecovery', 'runtimeServeEligible', 'publication',
      'repair'],
    'key segments: no table version, no planning segment');
  for (const call of seen) {
    t.ok(call.depths.membershipPublication < DIGEST_DEPTH_CAP,
      `${call.nodeId}: membershipPublication nests ` +
      `${call.depths.membershipPublication} < cap ${DIGEST_DEPTH_CAP}`);
  }
  t.end();
});

// ---- DEP-SCOPE: fail-closed -----------------------------------------------

test('DEP-SCOPE (fail-closed): an unclassified seam field, a digest depth ' +
  'overflow, or a value outside the strict normalizer\'s domain is built ' +
  'WITHOUT memoizing and counted by reason — never thrown, never aliased; ' +
  'no version surface is needed for a complete generation', async (t) => {
  const base = {
    membershipPublication: {publicationEpoch: 1},
    nodeEvidence: {status: 'active'}, dimensions: {a: true},
    runtimeAuthority: {b: true}, priorityControlPlaneRecovery: {active: false},
    runtimeServeEligible: true, publication: {currentMode: 'grouped'},
  };
  const classifiedSource = Object.fromEntries(
    Object.keys(PROJECTION_READINESS_SOURCE_FIELD_COVERAGE).map((k) => [k, null]));
  t.equal(buildProjectionReadinessGeneration(base, classifiedSource).state,
    PROJECTION_READINESS_GENERATION_STATE.COMPLETE,
    'a fully classified source is COMPLETE');
  t.same(buildProjectionReadinessGeneration(base,
    {...classifiedSource, capacity: {}}), {
    state: PROJECTION_READINESS_GENERATION_STATE.INCOMPLETE,
    reason: PROJECTION_READINESS_GENERATION_INCOMPLETE_REASON
      .UNCLASSIFIED_SOURCE_FIELD,
  }, 'an unclassified source field makes the generation INCOMPLETE');
  let deep = {leaf: true};
  for (let level = 0; level < DIGEST_DEPTH_CAP + 1; level += 1) deep = {deep};
  t.same(buildProjectionReadinessGeneration(
    {...base, runtimeAuthority: deep}, classifiedSource), {
    state: PROJECTION_READINESS_GENERATION_STATE.INCOMPLETE,
    reason: PROJECTION_READINESS_GENERATION_INCOMPLETE_REASON
      .DIGEST_DEPTH_OVERFLOW,
  }, 'a verdict nesting past the digest cap makes the generation INCOMPLETE');
  t.same(buildProjectionReadinessGeneration(
    {...base, membershipPublication: Object.freeze({deep})}, classifiedSource), {
    state: PROJECTION_READINESS_GENERATION_STATE.INCOMPLETE,
    reason: PROJECTION_READINESS_GENERATION_INCOMPLETE_REASON
      .DIGEST_DEPTH_OVERFLOW,
  }, 'a frozen membership publication past the cap is INCOMPLETE (cached too)');
  t.same(buildProjectionReadinessGeneration(
    {...base, membershipPublication: Object.freeze({deep})}, classifiedSource)
    .reason, PROJECTION_READINESS_GENERATION_INCOMPLETE_REASON
    .DIGEST_DEPTH_OVERFLOW, 'the cached overflow verdict is preserved');
  // F5 (verifier review-599d46d2): a container at field-relative depth
  // cap-1 is the deepest the normalizer accepts; at the cap both fail closed.
  let atCap = {leaf: true};
  for (let level = 0; level < DIGEST_DEPTH_CAP - 1; level += 1) atCap = {atCap};
  t.equal(buildProjectionReadinessGeneration(
    {...base, runtimeAuthority: atCap}, classifiedSource).state,
  PROJECTION_READINESS_GENERATION_STATE.COMPLETE,
  `field-relative depth ${DIGEST_DEPTH_CAP - 1} (normalizer depth ` +
  `${DIGEST_DEPTH_CAP}) is COMPLETE`);
  let pastCap = {leaf: true};
  for (let level = 0; level < DIGEST_DEPTH_CAP; level += 1) pastCap = {pastCap};
  t.equal(buildProjectionReadinessGeneration(
    {...base, runtimeAuthority: pastCap}, classifiedSource).reason,
  PROJECTION_READINESS_GENERATION_INCOMPLETE_REASON.DIGEST_DEPTH_OVERFLOW,
  `field-relative depth ${DIGEST_DEPTH_CAP} (normalizer depth ` +
  `${PROJECTION_READINESS_MAX_OWN_DATA_DEPTH}, INVALID) is INCOMPLETE`);

  // F1 (verifier review-0f76ab4e): a null-prototype container at the cap
  // must fail CLOSED, not throw out of the evaluation — no coercion of any
  // object to a string is ever attempted.
  let nullProto = Object.create(null);
  nullProto.leaf = true;
  for (let level = 0; level < DIGEST_DEPTH_CAP + 1; level += 1) {
    nullProto = {deep: nullProto};
  }
  t.same(buildProjectionReadinessGeneration(
    {...base, runtimeAuthority: nullProto}, classifiedSource), {
    state: PROJECTION_READINESS_GENERATION_STATE.INCOMPLETE,
    reason: PROJECTION_READINESS_GENERATION_INCOMPLETE_REASON
      .DIGEST_DEPTH_OVERFLOW,
  }, 'a null-prototype container at the cap is INCOMPLETE, not a TypeError');
  const coerced = () => {
    throw new Error('coerced');
  };
  const hostile = {toString: coerced, [Symbol.toPrimitive]: coerced};
  let hostileDeep = hostile;
  for (let level = 0; level < DIGEST_DEPTH_CAP + 1; level += 1) {
    hostileDeep = {deep: hostileDeep};
  }
  t.equal(buildProjectionReadinessGeneration(
    {...base, runtimeAuthority: hostileDeep}, classifiedSource).state,
  PROJECTION_READINESS_GENERATION_STATE.INCOMPLETE,
  'a hostile toString/toPrimitive is never invoked on the overflow branch');

  // F2 (verifier review-0f76ab4e): the digest mirrors the strict normalizer's
  // domain — a value the normalizer would reject (whole-source fail-closed
  // to the degenerate core) is INCOMPLETE, never keyed like its plain twin.
  const violation = (label, patch) => t.same(
    buildProjectionReadinessGeneration({...base, ...patch}, classifiedSource), {
      state: PROJECTION_READINESS_GENERATION_STATE.INCOMPLETE,
      reason: PROJECTION_READINESS_GENERATION_INCOMPLETE_REASON
        .DIGEST_DOMAIN_VIOLATION,
    }, `${label} is a domain violation`);
  violation('a Date leaf', {runtimeAuthority: {b: new Date(0)}});
  violation('a class instance', {runtimeAuthority: new (class Verdict {})()});
  violation('a symbol key', {runtimeAuthority: {b: true, [Symbol('s')]: 1}});
  violation('an accessor property', {runtimeAuthority: Object.defineProperty(
    {b: true}, 'g', {get: () => 1, enumerable: true})});
  violation('a non-enumerable key', {runtimeAuthority: Object.defineProperty(
    {b: true}, 'h', {value: 1, enumerable: false})});
  violation('a sparse array', {dimensions: {a: [1, , 3]}}); // eslint-disable-line no-sparse-arrays
  violation('a function leaf', {dimensions: {a: () => true}});
  violation('a subclassed array', {dimensions: {a: new (class L extends Array {})()}});
  violation('a proxy', {runtimeAuthority: new Proxy({b: true}, {})});
  const plainKey = buildProjectionReadinessGenerationKey(base);
  t.equal(buildProjectionReadinessGeneration(base, classifiedSource).key,
    plainKey, 'the plain twin stays COMPLETE with its own key');
  // F4 (verifier review-599d46d2): a rejected value under an EXCLUDED
  // (observation-time) key must still fail closed — the normalizer knows no
  // exclusions and fails the whole source — never alias its plain twin.
  violation('a Date under observedAt', {dimensions: {a: 1, observedAt: new Date(0)}});
  violation('a function under enteredAt',
    {runtimeAuthority: {b: true, enteredAt: () => 1}});
  violation('a Proxy under heartbeatAgeMs',
    {nodeEvidence: {status: 'active', heartbeatAgeMs: new Proxy({}, {})}});
  violation('an accessor under observedAtMs', {dimensions: {a: 1,
    observedAtMs: Object.defineProperty({}, 'g', {get: () => 1, enumerable: true})}});
  violation('a Date under the membership top-level createdAt',
    {membershipPublication: Object.freeze({publicationEpoch: 1, createdAt: new Date(0)})});
  let underExcluded = {leaf: true};
  for (let level = 0; level < DIGEST_DEPTH_CAP + 4; level += 1) {
    underExcluded = {underExcluded};
  }
  t.equal(buildProjectionReadinessGeneration(
    {...base, dimensions: {a: 1, observedAt: underExcluded}}, classifiedSource)
    .reason, PROJECTION_READINESS_GENERATION_INCOMPLETE_REASON
    .DIGEST_DEPTH_OVERFLOW, 'an over-deep container under observedAt overflows');
  t.equal(buildProjectionReadinessGenerationKey(
    {...base, dimensions: {a: 1, observedAt: 5}}),
  buildProjectionReadinessGenerationKey({...base, dimensions: {a: 1, observedAt: 9}}),
  'a plain observation-time value is still omitted from the key text');
  // F6 (verifier review-599d46d2): rejection returns at the first hole like
  // the normalizer; a non-enumerable array INDEX is a data slot the
  // normalizer copies, so it is accepted.
  const hugeSparse = [];
  hugeSparse[HUGE_SPARSE_LENGTH - 1] = 1;
  const rejectStartMs = performance.now();
  t.equal(buildProjectionReadinessGeneration(
    {...base, dimensions: {a: hugeSparse}}, classifiedSource).reason,
  PROJECTION_READINESS_GENERATION_INCOMPLETE_REASON.DIGEST_DOMAIN_VIOLATION,
  'a huge sparse array is rejected');
  t.ok(performance.now() - rejectStartMs < REJECTION_BUDGET_MS,
    'and rejected at the first hole, not after walking every index');
  const nonEnumerableIndex = Object.defineProperty([1, 2], 1,
    {value: 2, enumerable: false});
  t.equal(buildProjectionReadinessGeneration(
    {...base, dimensions: {a: nonEnumerableIndex}}, classifiedSource).state,
  PROJECTION_READINESS_GENERATION_STATE.COMPLETE,
  'a non-enumerable array index is a data slot and stays COMPLETE');

  // F2 (injectivity): strings and keys are length-prefixed, so no value can
  // forge a separator and two different records never share a key.
  const collide = (label, left, right) => t.not(
    buildProjectionReadinessGenerationKey({...base, dimensions: left}),
    buildProjectionReadinessGenerationKey({...base, dimensions: right}),
    `${label} digest differently`);
  collide('record vs separator-forging string', {a: 'x', b: 'y'},
    {a: 'x;b=s:y'});
  collide('array vs separator-forging element', {a: ['a', 'b']},
    {a: ['a,s:b']});
  collide('key forging a pair separator', {'a;b': 'x'}, {a: 'x', b: 'x'});
  collide('nested vs flattened', {a: {b: 'c'}}, {'a=o{b=s:c;}': ''});

  // Integration: a cache WITHOUT a version surface (the simplified unit
  // cache) still memoizes — the key is content, no revision is needed. (v1
  // had to fail closed here and measured 704/864 unowned joiner builds.)
  const nodeId = 'lone-node';
  const unversioned = createCache({
    nodes: [nodeRow(nodeId, CLOCK_START_MS)],
    services: [createMessageGroupService(nodeId)],
  });
  const service = new ControlPlaneReadinessService({
    nodeId,
    systemTableCache: unversioned,
    cacheMutationTarget: unversioned,
    messageRouter: {getConnectionState: () => STATE.CONNECTED},
    storageAccountingService: createAccountingService({
      [nodeId]: {nodeId, budgetBytes: 1000, pressureState: 'normal'},
    }),
    cdcGroupPropagationService: createPublicationService(PUBLICATION_MODE_SNAPSHOT),
    now: () => CLOCK_START_MS,
  });
  const first = await service.evaluateNodeReadiness(nodeId, {});
  const second = await service.evaluateNodeReadiness(nodeId, {});
  const stats = service.projectionReadinessEvidenceOwner.stats();
  t.equal(stats.normalizeBuildCount, 1, 'one build without any version surface');
  t.equal(stats.reuseHitCount, 1, 'and one reuse');
  t.equal(second.projectionReadinessContract, first.projectionReadinessContract,
    'same core reference without a version surface');
  t.same(stats.unownedBuildCountByReason, {}, 'nothing fell back to unowned');

  // Integration: an unclassified field injected at the seam is never
  // memoized, even on the production-shaped cluster.
  const cluster = buildCluster();
  const proto = ControlPlaneReadinessDiagnosticsEligibility.prototype;
  const original = proto.resolveNormalizedProjectionReadinessContract;
  proto.resolveNormalizedProjectionReadinessContract = function(context, source, verdicts) {
    return original.call(this, context, {...source, status: 'injected'}, verdicts);
  };
  try {
    cluster.readAll();
  } finally {
    proto.resolveNormalizedProjectionReadinessContract = original;
  }
  const clusterStats = cluster.owner().stats();
  t.equal(clusterStats.unownedBuildCountByReason[
    PROJECTION_READINESS_GENERATION_INCOMPLETE_REASON.UNCLASSIFIED_SOURCE_FIELD],
  NODE_COUNT, 'every build with the injected field was unowned');
  t.equal(clusterStats.ownedNodeCount, 0,
    'an unclassified field is never silently treated as node-local');
  t.end();
});

// ---- A1 / A2: unrelated-node reuse + affected-node invalidation ----------

test('A1/A2: an authoritative mutation affecting only node A rotates A ' +
  '(which observes the new result) while B returns the SAME core reference ' +
  'without normalizing again', async (t) => {
  const cluster = buildCluster();
  const before = cluster.readAll();
  for (const nodeId of NODE_IDS) {
    t.equal(nodeBuilds(cluster, nodeId), 1, `${nodeId}: one initial build`);
  }
  const keysBefore = Object.fromEntries(
    NODE_IDS.map((nodeId) => [nodeId, ownedKey(cluster, nodeId)]));

  // Writes concerning node A only: its heartbeat row and its service row
  // (the SERVICES version also invalidates every node's stored snapshot, so
  // every read below reaches the owner seam — the owner decides, not the
  // stored-snapshot layer).
  cluster.heartbeat(AFFECTED, 1);
  cluster.serviceTouch(AFFECTED, 1);
  await flushCacheListeners();
  const after = cluster.readAll();

  t.equal(nodeBuilds(cluster, AFFECTED), 2, 'A rebuilt once');
  t.not(keysBefore[AFFECTED], ownedKey(cluster, AFFECTED), 'A generation rotated');
  t.equal(attributeProjectionReadinessGenerationRotation(
    keysBefore[AFFECTED], ownedKey(cluster, AFFECTED)), 'nodeEvidence',
  'A rotated on its own node-scoped stamp');
  t.not(cluster.coreOf(after[AFFECTED]), cluster.coreOf(before[AFFECTED]),
    'A2: A holds a NEW core');
  t.equal(cluster.coreOf(after[AFFECTED]).evidence.raw.nodeEvidence.lastHeartbeat,
    cluster.startMs - 100 + 1, 'A2: the new core carries the new evidence');
  for (const nodeId of UNAFFECTED) {
    t.equal(nodeBuilds(cluster, nodeId), 1, `${nodeId}: no rebuild`);
    t.equal(nodeReuse(cluster, nodeId), 1, `${nodeId}: served by reuse`);
    t.equal(keysBefore[nodeId], ownedKey(cluster, nodeId),
      `${nodeId}: generation unchanged`);
    t.equal(cluster.coreOf(after[nodeId]), cluster.coreOf(before[nodeId]),
      `${nodeId}: SAME semantic-core reference`);
  }

  // A2 (semantic flip): A's row leaves ACTIVE → its verdicts change and its
  // core reflects it immediately; B is still untouched.
  cluster.cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
    [COLUMN.NODE_ID]: AFFECTED,
    [COLUMN.STATUS]: NODE_STATE.STOPPED,
    updated_at: cluster.startMs + 2,
  });
  cluster.serviceTouch(AFFECTED, 2);
  await flushCacheListeners();
  const flipped = cluster.readAll();
  t.equal(nodeBuilds(cluster, AFFECTED), 3, 'A rebuilt on the semantic flip');
  t.equal(flipped[AFFECTED].dimensions[
    CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE], false,
  'A2: A observes processAlive=false');
  t.equal(cluster.coreOf(flipped[AFFECTED]).evidence.processAlive, false,
    'A2: the owned core carries the flipped verdict — no stale entry');
  for (const nodeId of UNAFFECTED) {
    t.equal(nodeBuilds(cluster, nodeId), 1, `${nodeId}: still no rebuild`);
    t.equal(cluster.coreOf(flipped[nodeId]), cluster.coreOf(before[nodeId]),
      `${nodeId}: still the same core reference`);
  }
  t.end();
});

// ---- A3: a membership-publication content change stays cluster-wide ----

test('A3: a membership-publication CONTENT change rotates EVERY node ' +
  'generation and every core observes the new publication', async (t) => {
  const cluster = buildCluster();
  const before = cluster.readAll();
  const keysBefore = Object.fromEntries(
    NODE_IDS.map((nodeId) => [nodeId, ownedKey(cluster, nodeId)]));
  cluster.cache.applySystemTableChange(TABLES.CONTROL_PLANE_PUBLICATIONS,
    'INSERT', publicationRow(2, cluster.startMs + 5));
  await flushCacheListeners();
  const after = cluster.readAll();
  for (const nodeId of NODE_IDS) {
    t.equal(nodeBuilds(cluster, nodeId), 2, `${nodeId}: rebuilt`);
    t.equal(attributeProjectionReadinessGenerationRotation(
      keysBefore[nodeId], ownedKey(cluster, nodeId)), 'membershipPublication',
    `${nodeId}: rotated on the membership-publication content`);
    t.not(cluster.coreOf(after[nodeId]), cluster.coreOf(before[nodeId]),
      `${nodeId}: new core`);
    t.equal(cluster.coreOf(after[nodeId]).evidence.raw.membershipPublication
      .publicationEpoch, 2, `${nodeId}: the core observes epoch 2`);
  }
  t.end();
});

test('A3b: a CONTROL_PLANE_PUBLICATIONS write that leaves the membership ' +
  'diagnostics\' semantic content unchanged rotates NO node — a ' +
  'timestamp-only refresh of the winner row and a non-membership publication ' +
  'row both reuse every core', async (t) => {
  const cluster = buildCluster();
  const before = cluster.readAll();
  const builds = () => NODE_IDS.map((nodeId) => nodeBuilds(cluster, nodeId));
  t.same(builds(), [1, 1, 1, 1, 1], 'one initial build each');

  // (i) the winner row's updated_at moves (the shape of every ack/refresh
  // write that carries no semantic change); the publication table version
  // rotates but the membership diagnostics content does not.
  const versionBefore = cluster.cache.getTableMutationVersion(
    TABLES.CONTROL_PLANE_PUBLICATIONS);
  cluster.cache.applySystemTableChange(TABLES.CONTROL_PLANE_PUBLICATIONS,
    'UPDATE', {publication_id: 'pub-1', updated_at: cluster.startMs + 20});
  cluster.serviceTouch(AFFECTED, 20);
  await flushCacheListeners();
  t.ok(cluster.cache.getTableMutationVersion(TABLES.CONTROL_PLANE_PUBLICATIONS) >
    versionBefore, 'the publication table version rotated');
  const afterRefresh = cluster.readAll();
  t.same(builds(), [1, 1, 1, 1, 1], 'timestamp-only refresh: no node rebuilt');
  for (const nodeId of NODE_IDS) {
    t.equal(cluster.coreOf(afterRefresh[nodeId]), cluster.coreOf(before[nodeId]),
      `${nodeId}: same core reference after the refresh`);
  }

  // (ii) a non-membership publication row (a different publication kind)
  // lands in the same table: the membership winner is unchanged.
  cluster.cache.applySystemTableChange(TABLES.CONTROL_PLANE_PUBLICATIONS,
    'INSERT', {
      publication_id: 'handoff-1',
      publication_kind: FORMATION_RELEASE_HANDOFF_PUBLICATION_KIND,
      publication_epoch: 99,
      status: MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
      created_at: cluster.startMs + 21,
      updated_at: cluster.startMs + 21,
    });
  cluster.serviceTouch(AFFECTED, 21);
  await flushCacheListeners();
  const afterOtherKind = cluster.readAll();
  t.same(builds(), [1, 1, 1, 1, 1], 'non-membership row: no node rebuilt');
  for (const nodeId of NODE_IDS) {
    t.equal(cluster.coreOf(afterOtherKind[nodeId]), cluster.coreOf(before[nodeId]),
      `${nodeId}: same core reference after the other-kind row`);
    t.equal(cluster.coreOf(afterOtherKind[nodeId]).evidence.raw
      .membershipPublication.publicationEpoch, 1,
    `${nodeId}: still the epoch-1 membership publication`);
  }
  t.pass('reads reached the seam: ' +
    `${cluster.owner().stats().reuseHitCount} reuses across both writes`);
  t.end();
});

// ---- A4: bounded affected set ---------------------------------------------

test('A4: a mutation that changes the verdicts of nodes A and C rebuilds ' +
  'exactly A and C while the others reuse', async (t) => {
  const cluster = buildCluster();
  const before = cluster.readAll();
  const [, a, , c] = NODE_IDS;
  for (const nodeId of [a, c]) {
    cluster.serviceTouch(nodeId, 3, {[COLUMN.STATUS]: SERVICE_STATUS.STOPPED});
  }
  await flushCacheListeners();
  const after = cluster.readAll();
  for (const nodeId of [a, c]) {
    t.equal(nodeBuilds(cluster, nodeId), 2, `${nodeId}: rebuilt`);
    t.not(cluster.coreOf(after[nodeId]), cluster.coreOf(before[nodeId]),
      `${nodeId}: new core`);
    t.not(after[nodeId].dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE],
      before[nodeId].dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE],
      `${nodeId}: the serve verdict actually changed`);
  }
  for (const nodeId of NODE_IDS.filter((id) => id !== a && id !== c)) {
    t.equal(nodeBuilds(cluster, nodeId), 1, `${nodeId}: no rebuild`);
    t.equal(cluster.coreOf(after[nodeId]), cluster.coreOf(before[nodeId]),
      `${nodeId}: same core reference`);
  }
  t.end();
});

// ---- A5: live dependencies still rotate ------------------------------------

test('A5: live transport / lifecycle / publication-mode / repair changes ' +
  'rotate the generation exactly as v2 DEP and v4 established, and a raw ' +
  'transport change now rotates even without a boolean flip', async (t) => {
  const cluster = buildCluster();
  const [, , transportNode, lifecycleNode, repairNode] = NODE_IDS;
  cluster.readAll();
  const builds = () => Object.fromEntries(
    NODE_IDS.map((nodeId) => [nodeId, nodeBuilds(cluster, nodeId)]));
  const expectOnly = (label, affected, previous) => {
    const current = builds();
    for (const nodeId of NODE_IDS) {
      const expected = previous[nodeId] + (affected.includes(nodeId) ? 1 : 0);
      t.equal(current[nodeId], expected,
        `${label}: ${nodeId} ${affected.includes(nodeId) ? 'rebuilt' : 'reused'}`);
    }
    return current;
  };
  // Every step also touches A's service row so every read reaches the seam.
  let step = 10;
  const churn = async () => {
    cluster.serviceTouch(AFFECTED, (step += 1));
    await flushCacheListeners();
  };

  // (a) finding A, transport with NO boolean flip: CONNECTED → READY keeps
  // every readiness dimension identical, but the raw evidence changed.
  let previous = builds();
  const beforeTransport = cluster.readSync(transportNode);
  cluster.transport.set(transportNode, STATE.READY);
  await churn();
  const afterTransport = cluster.readAll()[transportNode];
  previous = expectOnly('transport ready', [transportNode], previous);
  t.same(afterTransport.dimensions, beforeTransport.dimensions,
    'no readiness dimension flipped on CONNECTED → READY');
  t.equal(afterTransport.nodeEvidence.routerConnectionState, STATE.READY,
    'yet the raw transport evidence changed');
  const connectingKey = ownedKey(cluster, transportNode);

  // (a') transport DISCONNECTED: a boolean flip on the same node.
  cluster.transport.set(transportNode, STATE.DISCONNECTED);
  await churn();
  cluster.readAll();
  previous = expectOnly('transport disconnected', [transportNode], previous);
  t.equal(attributeProjectionReadinessGenerationRotation(
    connectingKey, ownedKey(cluster, transportNode)), 'nodeEvidence',
  'the transport change rotated the node-scoped stamp first');

  // (b) finding B, lifecycle: a non-running process state for one node.
  const originalLifecycle = cluster.service.getLifecycleState;
  cluster.service.getLifecycleState = function(nodeId, row) {
    return nodeId === lifecycleNode ?
      NODE_STATE.SHUTTING_DOWN :
      originalLifecycle.call(this, nodeId, row);
  };
  await churn();
  cluster.readAll();
  previous = expectOnly('lifecycle', [lifecycleNode], previous);

  // (e) finding E, repair: a repair record for one node (identity by
  // recordedAt, which is deliberately digested).
  const originalRepair = cluster.service.getLatestAuthoritativeReadinessRepair;
  cluster.service.getLatestAuthoritativeReadinessRepair = function(nodeId) {
    return nodeId === repairNode ?
      {nodeId, recordedAt: cluster.startMs + 99, repaired: true,
        reasonCodes: ['stale_service_row']} :
      originalRepair.call(this, nodeId);
  };
  await churn();
  cluster.readAll();
  previous = expectOnly('repair', [repairNode], previous);

  // (c) finding C, publication mode: a service-wide live input, so every
  // node's verdict digest changes — legitimately global by content.
  cluster.publicationMode.snapshot = {
    ...PUBLICATION_MODE_SNAPSHOT,
    currentMode: CONTROL_PLANE_PUBLICATION_MODE.REPAIR_ONLY,
    reasonCode: 'operator_hold',
  };
  await churn();
  cluster.readAll();
  expectOnly('publication mode', NODE_IDS, previous);
  t.end();
});

// ---- A6: publication race --------------------------------------------------

test('A6: an authoritative publication change is never observed stale under ' +
  'a newer generation — sync reads between the cache apply and its deferred ' +
  'listener, and an async build straddling the apply', async (t) => {
  const cluster = buildCluster();
  const before = cluster.readAll();
  t.equal(cluster.coreOf(before[SEED]).evidence.raw.membershipPublication
    .publicationEpoch, 1, 'seed core at epoch 1');

  // Sync race: apply epoch 2 and read BEFORE the setImmediate listener that
  // clears the diagnostics memo has fired. The memo is stamped with the
  // synchronous table version, so it is bypassed and the fresh diagnostics
  // are digested. The same synchronous step also touches A's service row so
  // the read is not absorbed by the CL-012 stored-snapshot layer (whose own
  // invalidation rides the deferred listener — a separate owner, recorded
  // as a finding) and reaches the evidence owner seam under test.
  const keyBeforeRace = ownedKey(cluster, SEED);
  cluster.cache.applySystemTableChange(TABLES.CONTROL_PLANE_PUBLICATIONS,
    'INSERT', publicationRow(2, cluster.startMs + 7));
  cluster.serviceTouch(AFFECTED, 7);
  const raced = cluster.readSync(SEED);
  t.equal(raced.membershipPublication.publicationEpoch, 2,
    'the sync read observed epoch 2 before the listener fired');
  t.equal(nodeBuilds(cluster, SEED), 2, 'the owner rebuilt the seed core');
  t.equal(cluster.coreOf(raced).evidence.raw.membershipPublication
    .publicationEpoch, 2, 'the owned core is fresh');
  const racedKey = ownedKey(cluster, SEED);
  t.equal(attributeProjectionReadinessGenerationRotation(keyBeforeRace, racedKey),
    'membershipPublication', 'the seed entry moved with the publication content');
  await flushCacheListeners();
  const settled = cluster.readSync(SEED);
  t.equal(cluster.coreOf(settled), cluster.coreOf(raced),
    'after the listener, the same fresh core is reused');
  t.equal(ownedKey(cluster, SEED), racedKey, 'generation unchanged');

  // Async race: an evaluation whose observation window straddles a new
  // publication apply is keyed by the content it ACTUALLY observed, so it
  // can never alias old evidence to the new content; the next evaluation,
  // which observes epoch 3, rebuilds and memoizes the fresh graph.
  const originalReadNodeRow = cluster.service.readNodeRow;
  let applied = false;
  cluster.service.readNodeRow = async function(nodeId, options) {
    const row = await originalReadNodeRow.call(this, nodeId, options);
    if (!applied) {
      applied = true;
      cluster.cache.applySystemTableChange(TABLES.CONTROL_PLANE_PUBLICATIONS,
        'INSERT', publicationRow(3, cluster.startMs + 9));
    }
    return row;
  };
  const straddling = await cluster.service.evaluateNodeReadiness(AFFECTED, {});
  cluster.service.readNodeRow = originalReadNodeRow;
  const straddledEpoch = cluster.coreOf(straddling).evidence.raw
    .membershipPublication.publicationEpoch;
  t.equal(straddledEpoch, 2,
    'the straddling build observed epoch 2 (before the apply) and is keyed so');
  await flushCacheListeners();
  const fresh = await cluster.service.evaluateNodeReadiness(AFFECTED, {});
  t.equal(cluster.coreOf(fresh).evidence.raw.membershipPublication
    .publicationEpoch, 3, 'the next evaluation observes epoch 3');
  t.not(cluster.coreOf(fresh), cluster.coreOf(straddling),
    'and never receives the straddled epoch-2 core');
  const again = await cluster.service.evaluateNodeReadiness(AFFECTED, {});
  t.equal(cluster.coreOf(again), cluster.coreOf(fresh),
    'which is then reused by reference');
  t.end();
});

// ---- PLANNING: the planning derivation key is not a semantic input --------

test('PLANNING: a planning-derivation tick that changes no verdict leaves ' +
  'every core reused by reference, and a planning change that flips a ' +
  'verdict still rotates through the digested verdict', async (t) => {
  const cluster = buildCluster();
  const before = cluster.readAll();
  // The latch is read with a numeric clock advanced 1s per probe so each
  // probe refreshes it; the seam's own reads keep the live latch.
  let planningProbeMs = Date.now();
  const planningKey = () => cluster.service
    .readMembershipPlanningDerivationVersionKey(planningProbeMs += 1000);
  // A SERVICES write is in the planning derivation table set, invalidates
  // every stored snapshot, and changes no verdict here.
  const planningBefore = planningKey();
  cluster.serviceTouch(AFFECTED, 30);
  await flushCacheListeners();
  const planningAfter = planningKey();
  t.not(planningAfter, planningBefore, 'the planning derivation key rotated');
  const after = cluster.readAll();
  for (const nodeId of NODE_IDS) {
    t.equal(nodeBuilds(cluster, nodeId), 1, `${nodeId}: no rebuild`);
    t.equal(cluster.coreOf(after[nodeId]), cluster.coreOf(before[nodeId]),
      `${nodeId}: same core reference across the planning tick`);
  }
  // A planning change that flips a verdict: the priority-recovery projection
  // for one node reports active — a digested verdict — so that node rotates.
  const [, , plannedNode] = NODE_IDS;
  const originalPriority = cluster.service.getPriorityControlPlaneRecoveryState;
  cluster.service.getPriorityControlPlaneRecoveryState = function(context) {
    const state = originalPriority.call(this, context);
    return context?.nodeId === plannedNode ?
      Object.freeze({...state, active: true, reasonCodes: ['planning_flip']}) :
      state;
  };
  cluster.serviceTouch(AFFECTED, 31);
  await flushCacheListeners();
  const flipped = cluster.readAll();
  for (const nodeId of NODE_IDS) {
    const expected = nodeId === plannedNode ? 2 : 1;
    t.equal(nodeBuilds(cluster, nodeId), expected,
      `${nodeId}: ${expected === 2 ? 'rotated on the verdict' : 'reused'}`);
  }
  t.not(cluster.coreOf(flipped[plannedNode]), cluster.coreOf(before[plannedNode]),
    'the planned node holds a new core');
  t.equal(cluster.owner().nodeStats(plannedNode).buildCountByCause
    .priorityControlPlaneRecovery, 1, 'attributed to the digested verdict');
  t.end();
});

// ---- ENGAGEMENT: production-shaped churn -----------------------------------

test('ENGAGEMENT: under production-shaped churn (five nodes, moving clock, ' +
  'planning latch live, writes repeatedly concerning one node) the ' +
  'unaffected nodes\' cores actually reuse — reds if the six cluster-wide ' +
  'table versions or the planning segment are restored to the key',
async (t) => {
  const cluster = buildCluster();
  const initial = cluster.readAll();
  let seamReads = 0;
  for (let round = 1; round <= ENGAGEMENT_ROUNDS; round += 1) {
    // Each round: A's heartbeat + A's service row (formation-shaped
    // node-local churn; the SERVICES version pushes every read to the seam).
    cluster.heartbeat(AFFECTED, round);
    cluster.serviceTouch(AFFECTED, round);
    await flushCacheListeners();
    const snapshots = cluster.readAll();
    seamReads += NODE_COUNT;
    for (const nodeId of UNAFFECTED) {
      t.equal(cluster.coreOf(snapshots[nodeId]), cluster.coreOf(initial[nodeId]),
        `round ${round}: ${nodeId} same core reference`);
    }
  }
  const stats = cluster.owner().stats();
  for (const nodeId of UNAFFECTED) {
    t.equal(nodeBuilds(cluster, nodeId), 1,
      `${nodeId}: exactly the initial build across ${ENGAGEMENT_ROUNDS} rounds`);
    t.ok(nodeReuse(cluster, nodeId) >= ENGAGEMENT_ROUNDS,
      `${nodeId}: reused on every round (${nodeReuse(cluster, nodeId)} reuses)`);
    t.equal(nodeLocalBuilds(cluster, nodeId), 0,
      `${nodeId}: zero node-local rotations`);
  }
  t.equal(nodeBuilds(cluster, AFFECTED), 1 + ENGAGEMENT_ROUNDS,
    'A rebuilt once per round (its own evidence changed each round)');
  t.equal(stats.normalizeBuildCount, NODE_COUNT + ENGAGEMENT_ROUNDS,
    `${seamReads + NODE_COUNT} reads normalized ${NODE_COUNT + ENGAGEMENT_ROUNDS} ` +
    'times — not once per read');
  t.same(stats.unownedBuildCountByReason, {}, 'no fail-closed builds fired');
  t.pass(`engagement: ${stats.normalizeBuildCount} builds / ` +
    `${stats.reuseHitCount} reuses over ${seamReads + NODE_COUNT} reads ` +
    `(${Math.round(100 * stats.reuseHitCount / (seamReads + NODE_COUNT))}% reuse)`);
  t.end();
});

// ---- BOUNDED-WORK -----------------------------------------------------------

test('BOUNDED-WORK: builds(N) <= changes to N\'s semantic inputs + 1 — ' +
  'never cluster writes x node count (production wall clock, planning ' +
  'latch live)', async (t) => {
  const cluster = buildCluster({realClock: true});
  cluster.readAll();
  let writes = 0;
  for (let round = 1; round <= BOUNDED_WORK_ROUNDS; round += 1) {
    cluster.heartbeat(AFFECTED, round);
    cluster.serviceTouch(AFFECTED, round);
    writes += 2;
    await flushCacheListeners();
    cluster.readAll();
  }
  // Independent bound: the membership publication content never changed
  // (no publication write), so an unaffected node's inputs never changed.
  const nodeLocalChanges = BOUNDED_WORK_ROUNDS;
  for (const nodeId of UNAFFECTED) {
    t.equal(nodeBuilds(cluster, nodeId), 1,
      `${nodeId}: exactly the initial build (inputs never changed)`);
    t.equal(nodeLocalBuilds(cluster, nodeId), 0,
      `${nodeId}: zero builds attributed to its own segments`);
    t.equal(cluster.owner().nodeStats(nodeId).buildCountByCause
      .membershipPublication, 0,
    `${nodeId}: zero builds attributed to the membership publication`);
  }
  const affectedBuilds = nodeBuilds(cluster, AFFECTED);
  t.ok(affectedBuilds <= 1 + nodeLocalChanges,
    `${AFFECTED}: ${affectedBuilds} builds <= 1 + ${nodeLocalChanges}`);
  const total = cluster.owner().stats().normalizeBuildCount;
  t.ok(total <= NODE_COUNT + nodeLocalChanges,
    `total ${total} builds <= ${NODE_COUNT} + ${nodeLocalChanges}`);
  t.ok(total < writes * NODE_COUNT,
    `total ${total} builds < ${writes} writes x ${NODE_COUNT} nodes ` +
    '(the retired invariant)');
  t.pass(`bounded-work: ${total} builds for ${writes} cluster writes`);
  t.end();
});

// ---- Unit: rotation attribution and key shape ------------------------------

test('unit: rotation attribution names the first differing segment and the ' +
  'node-scoped stamp ignores only the clock-derived ages', (t) => {
  const base = {
    membershipPublication: Object.freeze({
      publicationEpoch: 1, status: 'published', createdAt: 10, updatedAt: 20,
    }),
    nodeEvidence: {
      status: 'active', lastHeartbeat: 100, heartbeatAgeMs: 5,
      readyLeaseExpiresAt: 900, readyLeaseAgeMs: -800, readyNow: true,
    },
    dimensions: {a: true}, runtimeAuthority: {b: true},
    priorityControlPlaneRecovery: {active: false}, runtimeServeEligible: true,
    publication: {currentMode: 'grouped'},
  };
  const key = buildProjectionReadinessGenerationKey(base);
  const rotate = (patch) => attributeProjectionReadinessGenerationRotation(
    key, buildProjectionReadinessGenerationKey({...base, ...patch}));
  t.equal(rotate({membershipPublication: {publicationEpoch: 2, status: 'published'}}),
    'membershipPublication', 'membership content first');
  t.equal(rotate({membershipPublication: {publicationEpoch: 2},
    dimensions: {a: false}}), 'membershipPublication',
  'membership content wins over a co-rotating verdict');
  t.equal(rotate({membershipPublication: Object.freeze({
    publicationEpoch: 1, status: 'published', createdAt: 11, updatedAt: 99})}),
  null, 'membership timestamps alone never rotate (frozen, cached digest)');
  // Object.isFrozen is shallow: a frozen root with an UNFROZEN nested
  // container must not be served a cached digest after that container
  // mutates — the walk verifies deep-frozenness before caching.
  const nested = {acks: ['a']};
  const shallow = Object.freeze({publicationEpoch: 1, nested});
  const keyShallow = buildProjectionReadinessGenerationKey(
    {...base, membershipPublication: shallow});
  nested.acks.push('b');
  t.not(buildProjectionReadinessGenerationKey(
    {...base, membershipPublication: shallow}), keyShallow,
  'a mutated unfrozen nested container is re-digested, never cache-served');
  const deep = Object.freeze({publicationEpoch: 1,
    nested: Object.freeze({acks: Object.freeze(['a'])})});
  const keyDeep = buildProjectionReadinessGenerationKey(
    {...base, membershipPublication: deep});
  t.equal(buildProjectionReadinessGenerationKey(
    {...base, membershipPublication: deep}), keyDeep,
  'a deep-frozen graph digests identically (cached)');
  t.equal(rotate({nodeEvidence: {...base.nodeEvidence, lastHeartbeat: 101}}),
    'nodeEvidence', 'the node-scoped stamp rotates on a row change');
  t.equal(rotate({nodeEvidence: {...base.nodeEvidence, readyNow: false}}),
    'nodeEvidence', 'and on a lease crossing');
  t.equal(rotate({nodeEvidence: {
    ...base.nodeEvidence, heartbeatAgeMs: 999, readyLeaseAgeMs: 0}}), null,
  'the clock-derived ages alone never rotate');
  t.equal(rotate({dimensions: {a: false}}), 'dimensions', 'verdict digests');
  t.equal(rotate({}), null, 'equal keys attribute nothing');
  t.equal(SEGMENT_INDEX.membershipPublication, 0, 'segment table is consistent');
  t.end();
});
