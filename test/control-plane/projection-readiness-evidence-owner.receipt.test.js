// Receipt tests for quest projection-readiness-evidence-amplification-v3:
// the per-node ProjectionReadinessEvidenceOwner collapses redundant
// normalization for a node whose authoritative generation is unchanged, never
// shares a graph across nodes, invalidates on any covered dependency change,
// and never memoizes a graph built across a mutation window.
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
  PROJECTION_READINESS_GENERATION_TABLES,
  buildProjectionReadinessGenerationKey,
} from '../../src/control-plane/projection-readiness-evidence-generation.js';

// A version-tracking cache wrapper: production's systemTableCache exposes
// getTableMutationVersion, which the simplified test cache does not. This bumps
// a per-table monotonic version on every applied change so the generation key
// behaves as in production.
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
  return wrapped;
}

function buildService(nodeId, cache) {
  return new ControlPlaneReadinessService({
    nodeId,
    systemTableCache: cache,
    cacheMutationTarget: cache,
    messageRouter: {getConnectionState: () => STATE.CONNECTED},
    storageAccountingService: createAccountingService({
      [nodeId]: {nodeId, budgetBytes: 1000, pressureState: 'normal'},
    }),
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => 350000,
  });
}

// ---- DEP: generation-key completeness + observation not elided --------------

test('DEP: the generation key covers the mapped dependency classes and the ' +
  'owner elides no observation (authoritative refresh preserved)', (t) => {
  // Control-plane-derived inputs (incl. the big membershipPublication graph)
  // are covered by the six mapped table mutation versions.
  for (const table of [
    TABLES.NODES, TABLES.SERVICES, TABLES.CONTROL_PLANE_PUBLICATIONS,
    TABLES.PARTITIONS, TABLES.STORAGE_RESERVATIONS, TABLES.REPLICA_OPERATIONS,
  ]) {
    t.ok(PROJECTION_READINESS_GENERATION_TABLES.includes(table),
      `${table} mutation version is in the covering key`);
  }
  // Transport/router (finding A) and SELF lifecycle (finding B) manifest in the
  // dimensions/runtimeAuthority verdicts; publication mode (finding C) is folded
  // directly. Each must move the key.
  const base = {
    tableVersions: 'v', planningVersionKey: 'p',
    dimensions: {clusterMemberHealthy: true}, runtimeAuthority: {routingReady: true},
    priorityControlPlaneRecovery: {active: false}, runtimeServeEligible: true,
    publication: {currentMode: 'grouped'},
  };
  const key = buildProjectionReadinessGenerationKey(base);
  t.not(key, buildProjectionReadinessGenerationKey({
    ...base, dimensions: {clusterMemberHealthy: false}}),
  'a transport/lifecycle-derived dimension change rotates the key');
  t.not(key, buildProjectionReadinessGenerationKey({
    ...base, runtimeAuthority: {routingReady: false}}),
  'a runtimeAuthority change rotates the key');
  t.not(key, buildProjectionReadinessGenerationKey({
    ...base, publication: {currentMode: 'repair_only'}}),
  'a publication-mode change rotates the key');
  t.not(key, buildProjectionReadinessGenerationKey({...base, tableVersions: 'v2'}),
    'a covered table version change rotates the key');
  t.not(key, buildProjectionReadinessGenerationKey({...base, planningVersionKey: 'p2'}),
    'a planning-version change rotates the key');
  // Authoritative refresh is not elided: the evidence owner has no observation
  // or query surface — it only reuses/builds a normalized graph it is handed.
  const owner = new ProjectionReadinessEvidenceOwner();
  t.equal(typeof owner.observe, 'undefined', 'no observe() on the evidence owner');
  t.equal(typeof owner.readNodeRow, 'undefined', 'no read surface on the owner');
  t.end();
});

// ---- R1 / R6 mechanics at the owner unit level ------------------------------

test('R1: same node + same generation key builds once, then reuses', (t) => {
  const owner = new ProjectionReadinessEvidenceOwner();
  const frozen = Object.freeze({tag: 'A'});
  let builds = 0;
  const build = () => {
    builds += 1;
    return frozen;
  };
  const stable = () => true;
  for (let i = 0; i < 500; i += 1) {
    const out = owner.resolveContract('node-1', 'gen-A', build, stable);
    t.equal(out, frozen, 'returns the frozen graph');
  }
  t.equal(builds, 1, 'built exactly once across 500 evaluations');
  const stats = owner.stats();
  t.equal(stats.normalizeBuildCount, 1, 'owner counted one normalize build');
  t.equal(stats.reuseHitCount, 499, 'owner served 499 reuse hits');
  t.equal(stats.ownedNodeCount, 1, 'one owned node entry');
  t.end();
});

test('R2: distinct nodes at the same generation are independently owned ' +
  '(no cross-node alias)', (t) => {
  const owner = new ProjectionReadinessEvidenceOwner();
  const a = Object.freeze({node: 'A'});
  const b = Object.freeze({node: 'B'});
  // Same generation key string, but different nodeId + different observed graph.
  const outA = owner.resolveContract('node-A', 'gen', () => a, () => true);
  const outB = owner.resolveContract('node-B', 'gen', () => b, () => true);
  t.equal(outA, a, 'node-A gets its own graph');
  t.equal(outB, b, 'node-B gets its own graph');
  t.not(outA, outB, 'the two nodes are never aliased to one graph');
  t.equal(owner.stats().ownedNodeCount, 2, 'two independent owned entries');
  // A re-evaluation of each still returns its own graph, not the other's.
  t.equal(owner.resolveContract('node-A', 'gen', () => a, () => true), a,
    'node-A reuse is still node-A');
  t.equal(owner.resolveContract('node-B', 'gen', () => b, () => true), b,
    'node-B reuse is still node-B');
  t.end();
});

test('R6: a generation that moves across the build is NOT memoized', (t) => {
  const owner = new ProjectionReadinessEvidenceOwner();
  const graph = Object.freeze({tag: 'volatile'});
  let builds = 0;
  const build = () => {
    builds += 1;
    return graph;
  };
  // generationStable=false ⇒ observation window straddled a mutation.
  const out = owner.resolveContract('node-1', 'gen-X', build, () => false);
  t.equal(out, graph, 'still returns the freshly built graph');
  t.equal(owner.stats().volatileSkipCount, 1, 'counted as a volatile skip');
  t.equal(owner.stats().ownedNodeCount, 0, 'nothing memoized under a moved key');
  // The next call must rebuild (no stale entry was published).
  owner.resolveContract('node-1', 'gen-X', build, () => false);
  t.equal(builds, 2, 'rebuilt — no stale graph aliased to gen-X');
  t.end();
});

test('owner: no stable nodeId or key ⇒ build without owning', (t) => {
  const owner = new ProjectionReadinessEvidenceOwner();
  let builds = 0;
  const build = () => {
    builds += 1;
    return Object.freeze({});
  };
  owner.resolveContract('', 'gen', build, () => true);
  owner.resolveContract('node-1', '', build, () => true);
  t.equal(builds, 2, 'both built');
  t.equal(owner.stats().ownedNodeCount, 0, 'neither was memoized');
  t.end();
});

// ---- R1 / R4 end-to-end through the real service ----------------------------

test('R1 (integration): repeated evaluateNodeReadiness under one generation ' +
  'normalizes once', async (t) => {
  const nodeId = 'seed-node';
  const cache = withMutationVersions(createCache({
    nodes: [{
      ...createActiveNode(nodeId),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: 349900,
      [COLUMN.READY_LEASE_EXPIRES_AT]: 410000,
    }],
    services: [createMessageGroupService(nodeId)],
  }));
  const service = buildService(nodeId, cache);

  for (let i = 0; i < 50; i += 1) {
    await service.evaluateNodeReadiness(nodeId, {});
  }
  const stats = service.projectionReadinessEvidenceOwner.stats();
  t.equal(stats.normalizeBuildCount, 1,
    'one normalize build for 50 evaluations of an unchanged generation');
  t.ok(stats.reuseHitCount >= 49, 'the rest were reuse hits');
  t.end();
});

test('R3 (integration): owner-cached readiness is byte-identical to uncached',
  async (t) => {
    const nodeId = 'seed-node';
    const build = () => withMutationVersions(createCache({
      nodes: [{
        ...createActiveNode(nodeId),
        [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
        [COLUMN.LAST_HEARTBEAT]: 349900,
        [COLUMN.READY_LEASE_EXPIRES_AT]: 410000,
      }],
      services: [createMessageGroupService(nodeId)],
    }));

    // Uncached: disable the owner so every evaluation normalizes fresh.
    const uncached = buildService(nodeId, build());
    uncached.projectionReadinessEvidenceOwner = null;
    const uncachedSnapshot = await uncached.evaluateNodeReadiness(nodeId, {});

    // Cached: owner active; warm it, then read the reused snapshot.
    const cached = buildService(nodeId, build());
    await cached.evaluateNodeReadiness(nodeId, {});
    const cachedSnapshot = await cached.evaluateNodeReadiness(nodeId, {});
    t.ok(cached.projectionReadinessEvidenceOwner.stats().reuseHitCount >= 1,
      'the second cached evaluation actually reused the normalized contract');

    t.same(
      cachedSnapshot.projectionReadinessContract,
      uncachedSnapshot.projectionReadinessContract,
      'the reused normalized contract is identical to the uncached one');
    t.same(cachedSnapshot.dimensions, uncachedSnapshot.dimensions,
      'dimensions are identical (contract reuse changed no readiness decision)');
    t.end();
  });

test('R5 (integration): a reconstructed evaluator owns its own reuse; no ' +
  'caller-local memo becomes authority', async (t) => {
  const nodeId = 'seed-node';
  const nodes = [{
    ...createActiveNode(nodeId),
    [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
    [COLUMN.LAST_HEARTBEAT]: 349900,
    [COLUMN.READY_LEASE_EXPIRES_AT]: 410000,
  }];
  const services = [createMessageGroupService(nodeId)];
  const first = buildService(nodeId, withMutationVersions(createCache({
    nodes, services,
  })));
  const firstSnapshot = await first.evaluateNodeReadiness(nodeId, {});

  // A freshly reconstructed service/evaluator on equivalent state must produce
  // the same readiness WITHOUT depending on the first instance's owned entry.
  const second = buildService(nodeId, withMutationVersions(createCache({
    nodes, services,
  })));
  const secondSnapshot = await second.evaluateNodeReadiness(nodeId, {});
  t.equal(second.projectionReadinessEvidenceOwner.stats().normalizeBuildCount, 1,
    'the reconstructed evaluator built its own entry (owner is per-service)');
  t.same(secondSnapshot.projectionReadinessContract,
    firstSnapshot.projectionReadinessContract,
    'and reached identical readiness without the first instance');
  t.end();
});

test('PERF (structural): normalize build count is bounded by generation ' +
  'changes, not by consumer fan-out', async (t) => {
  const nodeId = 'seed-node';
  const cache = withMutationVersions(createCache({
    nodes: [{
      ...createActiveNode(nodeId),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: 349900,
      [COLUMN.READY_LEASE_EXPIRES_AT]: 410000,
    }],
    services: [createMessageGroupService(nodeId)],
  }));
  const service = buildService(nodeId, cache);
  for (let i = 0; i < 10; i += 1) {
    await service.evaluateNodeReadiness(nodeId, {});
  }
  const after10 = service.projectionReadinessEvidenceOwner.stats()
    .normalizeBuildCount;
  for (let i = 0; i < 200; i += 1) {
    await service.evaluateNodeReadiness(nodeId, {});
  }
  const after210 = service.projectionReadinessEvidenceOwner.stats()
    .normalizeBuildCount;
  t.equal(after10, 1, '10 consumers ⇒ 1 build');
  t.equal(after210, 1, '210 consumers ⇒ still 1 build (fan-out did not add work)');
  t.end();
});

test('R4 (integration): a covered table mutation forces a rebuild', async (t) => {
  const nodeId = 'seed-node';
  const cache = withMutationVersions(createCache({
    nodes: [{
      ...createActiveNode(nodeId),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: 349900,
      [COLUMN.READY_LEASE_EXPIRES_AT]: 410000,
    }],
    services: [createMessageGroupService(nodeId)],
  }));
  const service = buildService(nodeId, cache);

  await service.evaluateNodeReadiness(nodeId, {});
  await service.evaluateNodeReadiness(nodeId, {});
  const afterReuse = service.projectionReadinessEvidenceOwner.stats();
  t.equal(afterReuse.normalizeBuildCount, 1, 'second eval reused');

  // Mutate a covered table: bumps getTableMutationVersion(NODES) ⇒ key changes.
  cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
    ...createActiveNode(nodeId),
    [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
    [COLUMN.LAST_HEARTBEAT]: 349950,
    [COLUMN.READY_LEASE_EXPIRES_AT]: 420000,
  });
  await service.evaluateNodeReadiness(nodeId, {});
  const afterChange = service.projectionReadinessEvidenceOwner.stats();
  t.equal(afterChange.normalizeBuildCount, 2,
    'the covered mutation rotated the generation and forced one rebuild');
  t.end();
});
