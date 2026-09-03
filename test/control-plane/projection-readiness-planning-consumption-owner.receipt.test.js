// Receipt tests for quest projection-readiness-planning-consumption-owner:
// planning/candidate consumption of projection-readiness state routes through
// the single semantic owner. An entry embedding the owner-built core is
// consumed as that core BY REFERENCE plus a cheap entry-local planning
// envelope (the priority-recovery-pending publication overlay); fresh entry
// identity never causes readiness re-normalization. The contract-less
// fallback (full normalization) is preserved and doubles as the equivalence
// oracle: stripping the embedded core reproduces the pre-repair path.
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
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  buildProjectionReadinessState,
  resolveProjectionReadinessStateForEntry,
} from '../../src/control-plane/projection-readiness-state.js';
import {
  resolveProjectedActiveNodeIds,
} from '../../src/control-plane/active-node-projection.js';
import {
  getSharedSyncSectionRegistry,
} from '../../src/diagnostics/event-loop-gap-watchdog.js';
import {
  buildDeferredSnapshot,
} from '../../src/control-plane/readiness-planning-publication-contract.js';

const CLOCK_START_MS = 350000;
const ENTRY_MEMO_MISS_SECTION = 'projection_readiness_entry_memo_miss_build';
const OWNER_BUILD_SECTION = 'projection_readiness_owner_build';
const RECOVERY_DIMENSION =
  CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;

function withMutationVersions(cache) {
  const versionByTable = new Map();
  const wrapped = Object.create(cache);
  wrapped.getTableMutationVersion = (tableName) =>
    versionByTable.get(tableName) || 0;
  wrapped.applySystemTableChange = (tableName, operation, row) => {
    const result = cache.applySystemTableChange(tableName, operation, row);
    versionByTable.set(tableName, (versionByTable.get(tableName) || 0) + 1);
    return result;
  };
  wrapped.bumpTableMutationVersion = (tableName) =>
    versionByTable.set(tableName, (versionByTable.get(tableName) || 0) + 1);
  return wrapped;
}

function buildFixture(nodeId, {connected = true} = {}) {
  const cache = withMutationVersions(createCache({
    nodes: [{
      ...createActiveNode(nodeId),
      [COLUMN.CONNECTION_STATE]: connected ? STATE.CONNECTED : STATE.UNKNOWN,
      [COLUMN.LAST_HEARTBEAT]: CLOCK_START_MS - 100,
      [COLUMN.READY_LEASE_EXPIRES_AT]: CLOCK_START_MS + 60000,
    }],
    services: [createMessageGroupService(nodeId)],
  }));
  const clock = {nowMs: CLOCK_START_MS};
  const service = new ControlPlaneReadinessService({
    nodeId,
    systemTableCache: cache,
    cacheMutationTarget: cache,
    messageRouter: {
      getConnectionState: () =>
        connected ? STATE.CONNECTED : STATE.DISCONNECTED,
    },
    storageAccountingService: createAccountingService({
      [nodeId]: {nodeId, budgetBytes: 1000, pressureState: 'normal'},
    }),
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => (clock.nowMs += 40),
  });
  return {service, cache, clock};
}

function sectionCount(site) {
  const registry = getSharedSyncSectionRegistry();
  return registry.snapshot().sites[site]?.count || 0;
}

// The decision surface the planning/candidate consumers actually read from a
// resolved entry state (evaluateProjectionReadinessDimensions +
// resolveProjectionReadinessRuntimeAuthorityProjection + repair-evidence
// helpers). B1 pins envelope-vs-rebuild equality on exactly this surface.
const CONSUMED_BOOLEAN_READS = Object.freeze([
  ['internalReady', (state) => state.lanes?.internal?.ready],
  ['ownerEvidenceAvailable',
    (state) => state.evidence?.ownerEvidenceAvailable],
  ['clusterMemberHealthy', (state) => state.evidence?.clusterMemberHealthy],
  ['processAlive', (state) => state.evidence?.processAlive],
  ['recoveryEligible', (state) => state.evidence?.recoveryEligible],
  ['readinessRecoveryEligible',
    (state) => state.readiness?.recoveryEligible],
  ['runtimeAuthorityRepairEligible',
    (state) => state.evidence?.runtimeAuthority?.repairEligible],
  ['runtimeAuthorityRecoveryEligible',
    (state) => state.evidence?.runtimeAuthority?.recoveryEligible],
]);

function consumedSurface(state) {
  const surface = {};
  for (const [name, read] of CONSUMED_BOOLEAN_READS) {
    surface[name] = read(state) === true;
  }
  surface.runtimeAuthorityState =
    state.evidence?.runtimeAuthority?.state ?? null;
  return surface;
}

function stripContract(entry) {
  const {projectionReadinessContract: _omitted, ...rest} = entry;
  return rest;
}

// An entry whose owner core is genuinely NOT recovery-eligible, with the
// planning overlay spliced the way buildPublicationPlanningReadinessEntry
// does — the exact production shape the attribution measured. The core is a
// real owner-shape state built through the production builder from a source
// with no recovery eligibility.
function buildOverlaidEntry(nodeId) {
  const source = {
    nodeId,
    dimensions: {
      [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
      [RECOVERY_DIMENSION]: false,
    },
  };
  const core = buildProjectionReadinessState(source);
  return {
    ...source,
    dimensions: {...source.dimensions, [RECOVERY_DIMENSION]: true},
    projectionReadinessContract: core,
  };
}

// ---- B2 + B1(a): fresh identity is irrelevant; owner core by reference ----

test('B2: fresh entry objects at one node+generation resolve to the SAME ' +
  'owned core reference with zero re-normalization', async (t) => {
  const nodeId = 'seed-node';
  const {service} = buildFixture(nodeId);
  const snapshot = await service.evaluateNodeReadiness(nodeId, {});
  const core = snapshot.projectionReadinessContract;
  const missesBefore = sectionCount(ENTRY_MEMO_MISS_SECTION);
  const ownerBuildsBefore = sectionCount(OWNER_BUILD_SECTION);
  const resolutions = [];
  for (let i = 0; i < 50; i += 1) {
    const freshEntry = {...snapshot};
    resolutions.push(resolveProjectionReadinessStateForEntry(freshEntry));
  }
  t.equal(sectionCount(ENTRY_MEMO_MISS_SECTION), missesBefore,
    '50 fresh-identity resolutions caused ZERO entry-identity ' +
    'normalizations');
  t.equal(sectionCount(OWNER_BUILD_SECTION), ownerBuildsBefore,
    'and zero additional owner builds — consumption, not construction');
  t.equal(resolutions[0], core,
    'resolution IS the embedded owner core by reference');
  t.equal(resolutions[49], resolutions[0],
    'entry A !== entry B, same node+generation => same core reference');
  t.end();
});

// ---- B1: candidate-level outputs equal to the pre-repair oracle -----------

test('B1: projected-active outputs equal the pre-repair full-rebuild oracle ' +
  'across the fixture matrix (healthy, degraded, overlaid)', async (t) => {
  const nodeId = 'seed-node';
  const healthy = buildFixture(nodeId);
  const healthySnapshot = await healthy.service.evaluateNodeReadiness(
    nodeId, {});
  const degraded = buildFixture(nodeId, {connected: false});
  const degradedSnapshot = await degraded.service.evaluateNodeReadiness(
    nodeId, {});
  const overlaid = buildOverlaidEntry(nodeId);
  t.not(overlaid.projectionReadinessContract.evidence.recoveryEligible, true,
    'overlaid-case core is genuinely NOT recovery-eligible (non-vacuous)');
  const matrix = [
    ['healthy', {...healthySnapshot}],
    ['degraded', {...degradedSnapshot}],
    ['overlaid', overlaid],
  ];
  const nodeRow = {
    ...createActiveNode(nodeId),
    [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
    [COLUMN.LAST_HEARTBEAT]: CLOCK_START_MS - 100,
    [COLUMN.READY_LEASE_EXPIRES_AT]: CLOCK_START_MS + 60000,
  };
  for (const [label, entry] of matrix) {
    // Consumed-surface equality: envelope/core consumption vs the full
    // rebuild the pre-repair path performed on the same entry content.
    const composed = resolveProjectionReadinessStateForEntry(entry);
    const rebuilt = buildProjectionReadinessState(stripContract(entry));
    t.same(consumedSurface(composed), consumedSurface(rebuilt),
      `${label}: consumed decision surface equals the full-rebuild oracle`);
    // Consumer-level equality: the real exported projection consumer,
    // with-contract entries vs contract-stripped (pre-repair) entries.
    for (const allowRecovery of [true, false]) {
      const projectionOptions = {
        nodeRows: [nodeRow],
        connectedNodeIds: [nodeId],
        allowControlPlaneRecoveryEligibleProjection: allowRecovery,
      };
      const withContract = resolveProjectedActiveNodeIds({
        ...projectionOptions,
        readinessByNodeId: {[nodeId]: {...entry}},
      });
      const oracle = resolveProjectedActiveNodeIds({
        ...projectionOptions,
        readinessByNodeId: {[nodeId]: stripContract(entry)},
      });
      t.same(withContract, oracle,
        `${label} (allowRecovery=${allowRecovery}): projected-active node ` +
        'ids equal the pre-repair oracle');
    }
  }
  t.end();
});

// ---- B3: entry-local planning differences still matter --------------------

test('B3: the planning overlay still changes the resolved state while the ' +
  'shared core is untouched (no over-hoisting)', (t) => {
  const nodeId = 'seed-node';
  const overlaidEntry = buildOverlaidEntry(nodeId);
  const core = overlaidEntry.projectionReadinessContract;
  t.not(core.evidence.recoveryEligible, true,
    'fixture: the core is NOT recovery-eligible');
  const baseEntry = {
    ...overlaidEntry,
    dimensions: {...overlaidEntry.dimensions, [RECOVERY_DIMENSION]: false},
  };
  const base = resolveProjectionReadinessStateForEntry(baseEntry);
  const overlaidState = resolveProjectionReadinessStateForEntry(overlaidEntry);
  t.equal(base, core, 'non-overlaid entry resolves to the core itself');
  t.not(overlaidState, core,
    'the overlaid entry resolves to a distinct planning envelope');
  t.equal(overlaidState.evidence.recoveryEligible, true,
    'the envelope reflects the entry-local planning fact');
  t.equal(overlaidState.planningRecoveryEligibleOverride, true,
    'the override provenance is visible, never silent');
  t.equal(overlaidState.evidence.runtimeAuthority,
    core.evidence.runtimeAuthority,
    'the envelope SHARES the core sub-records by reference');
  t.equal(core.evidence.recoveryEligible === true, false,
    'the shared core itself was never mutated to apply the overlay');
  t.ok(Object.isFrozen(overlaidState) && Object.isFrozen(core),
    'core and envelope both immutable');
  t.end();
});

// ---- B4: authoritative invalidation propagates immediately ----------------

test('B4: a readiness generation change is consumed immediately — no stale ' +
  'planning result from an old entry', async (t) => {
  const nodeId = 'seed-node';
  const {service, cache} = buildFixture(nodeId);
  const first = await service.evaluateNodeReadiness(nodeId, {});
  const resolvedFirst = resolveProjectionReadinessStateForEntry({...first});
  // With the per-node generation model (quest projection-readiness-per-node-
  // generation-granularity) the authoritative change is the node's own row
  // changing, not a bare table-version bump.
  cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
    ...createActiveNode(nodeId),
    [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
    [COLUMN.LAST_HEARTBEAT]: CLOCK_START_MS - 50,
    [COLUMN.READY_LEASE_EXPIRES_AT]: CLOCK_START_MS + 60000,
  });
  const second = await service.evaluateNodeReadiness(nodeId, {});
  t.not(second.projectionReadinessContract,
    first.projectionReadinessContract,
    'the authoritative change rebuilt the owner core');
  const resolvedSecond = resolveProjectionReadinessStateForEntry({...second});
  t.equal(resolvedSecond, second.projectionReadinessContract,
    'a fresh entry from the new generation resolves to the NEW core');
  t.not(resolvedSecond, resolvedFirst,
    'no stale state crosses the generation boundary');
  t.end();
});

// ---- B5: cross-node isolation preserved -----------------------------------

test('B5: entries for two nodes consume their own per-node cores', async (t) => {
  const a = buildFixture('node-a');
  const b = buildFixture('node-b');
  const snapshotA = await a.service.evaluateNodeReadiness('node-a', {});
  const snapshotB = await b.service.evaluateNodeReadiness('node-b', {});
  const resolvedA = resolveProjectionReadinessStateForEntry({...snapshotA});
  const resolvedB = resolveProjectionReadinessStateForEntry({...snapshotB});
  t.equal(resolvedA, snapshotA.projectionReadinessContract,
    'node-a consumes its own core');
  t.equal(resolvedB, snapshotB.projectionReadinessContract,
    'node-b consumes its own core');
  t.not(resolvedA, resolvedB, 'no cross-node sharing revived');
  t.end();
});

// ---- B1 hardening: deferred planning stubs are NOT owner cores ------------
// Independent verification findings (review 56422fa5): duck-typed admission
// accepted the hand-rolled DEFERRED snapshot contracts. The null-source stub
// (readSync miss after bootstrap) carries empty lanes and crashed the
// projection; the completed-source live-veto stub disagrees with its entry's
// own top-level evidence and flipped a projection admission. Both must take
// the full-rebuild fallback — the exact pre-repair behavior — while genuine
// owner products keep reference consumption.

test('B1-hardening: real deferred planning stubs take the fallback and ' +
  'match the pre-repair oracle (no crash, no admission flip)', async (t) => {
  const nodeId = 'seed-node';
  const {service} = buildFixture(nodeId);
  const completedSnapshot = await service.evaluateNodeReadiness(nodeId, {});
  const token = Object.freeze({tokenKey: 'receipt-token'});
  const stubs = [
    ['null-source deferred', buildDeferredSnapshot(null, token, nodeId)],
    ['completed-source live-veto deferred',
      buildDeferredSnapshot(completedSnapshot, token, nodeId)],
  ];
  const nodeRow = {
    ...createActiveNode(nodeId),
    [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
    [COLUMN.LAST_HEARTBEAT]: CLOCK_START_MS - 100,
    [COLUMN.READY_LEASE_EXPIRES_AT]: CLOCK_START_MS + 60000,
  };
  for (const [label, deferredEntry] of stubs) {
    t.ok(deferredEntry.projectionReadinessContract &&
      typeof deferredEntry.projectionReadinessContract === 'object',
    `${label}: fixture really embeds a stub contract`);
    const missesBefore = sectionCount(ENTRY_MEMO_MISS_SECTION);
    const withEmbedded = resolveProjectedActiveNodeIds({
      nodeRows: [nodeRow],
      connectedNodeIds: [nodeId],
      readinessByNodeId: {[nodeId]: {...deferredEntry}},
      allowControlPlaneRecoveryEligibleProjection: true,
    });
    const oracle = resolveProjectedActiveNodeIds({
      nodeRows: [nodeRow],
      connectedNodeIds: [nodeId],
      readinessByNodeId: {[nodeId]: stripContract({...deferredEntry})},
      allowControlPlaneRecoveryEligibleProjection: true,
    });
    t.same(withEmbedded, oracle,
      `${label}: projection equals the pre-repair full-rebuild oracle`);
    t.ok(sectionCount(ENTRY_MEMO_MISS_SECTION) > missesBefore,
      `${label}: the stub took the full-rebuild fallback — never admitted ` +
      'as an owner core');
  }
  t.equal(resolveProjectionReadinessStateForEntry({...completedSnapshot}),
    completedSnapshot.projectionReadinessContract,
    'genuine owner cores keep reference consumption');
  t.end();
});

// ---- B6 + PERF: derivation count never determines normalize count ---------

test('B6/PERF: repeated planning consumption with fresh entries causes zero ' +
  'entry-identity normalization; the contract-less oracle path still pays',
async (t) => {
  const nodeId = 'seed-node';
  const {service} = buildFixture(nodeId);
  const snapshot = await service.evaluateNodeReadiness(nodeId, {});
  const nodeRow = {
    ...createActiveNode(nodeId),
    [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
    [COLUMN.LAST_HEARTBEAT]: CLOCK_START_MS - 100,
    [COLUMN.READY_LEASE_EXPIRES_AT]: CLOCK_START_MS + 60000,
  };
  const missesBefore = sectionCount(ENTRY_MEMO_MISS_SECTION);
  const ownerBuildsBefore = sectionCount(OWNER_BUILD_SECTION);
  const rounds = 200;
  for (let i = 0; i < rounds; i += 1) {
    // Fresh identity map + fresh entry each round — the planning storm shape.
    resolveProjectedActiveNodeIds({
      nodeRows: [nodeRow],
      connectedNodeIds: [nodeId],
      readinessByNodeId: {[nodeId]: {...snapshot}},
      allowControlPlaneRecoveryEligibleProjection: true,
    });
  }
  t.equal(sectionCount(ENTRY_MEMO_MISS_SECTION), missesBefore,
    `${rounds} planning rounds with fresh entries => ZERO entry-identity ` +
    'normalizations (candidate count does not determine normalize count)');
  t.equal(sectionCount(OWNER_BUILD_SECTION), ownerBuildsBefore,
    'and zero owner builds — consumption only');
  // Control: the preserved contract-less fallback still normalizes, so the
  // oracle path (and genuinely contract-less callers) remain intact.
  resolveProjectionReadinessStateForEntry(stripContract({...snapshot}));
  t.equal(sectionCount(ENTRY_MEMO_MISS_SECTION), missesBefore + 1,
    'a genuinely contract-less entry still pays exactly one full ' +
    'normalization (fallback preserved)');
  t.end();
});
