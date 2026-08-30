// Deterministic witnesses for the readiness-planning-publication-version-key
// quest. They drive the REAL readiness-planning memos
// (resolveMemoizedPriorityRecoveryPlanningProjectionSync,
// resolveMemoizedMembershipPublicationPlanningSnapshotSync), the REAL version
// key derivation and the REAL publications winner probe
// (MembershipPublicationCoordinatorReads
// .getLatestMembershipPublicationEpochStatusForNodeSync), plus one
// production-composition ControlPlaneReadinessService owner build on a virtual
// clock. The only doubles sit at genuine collaborator boundaries: the deep
// cluster read and the heavy projection/merge builders, so a rebuild is
// countable.
//
// What changed. The memos used to gate reuse on TWO different things: a stored
// floored planning generation compared against the live one, and a separate
// LIVE publication (epoch, status) probe applied as a staleness VETO after the
// generation already matched. The veto was probe-derived — a value no cached
// entry could carry and no caller could compare — so planning freshness was
// not expressible as a key. It is now ONE version key per memo entry,
// {sourceGeneration, publicationComponent}, whose publication component
// renders exactly the (epoch, status) pair the veto compared.
//
// The decisive proof is version-key-equals-removed-veto-matrix: over every
// ordered pair of publication states, key inequality must agree with the
// removed veto predicate (restored verbatim in this file as the oracle), so no
// projection can be served from a memo whose publication has moved.
//
// observedAt on the real hot path is an ISO STRING (getNodeReadinessSync:
// normalizeIsoTimestamp(now)); these witnesses use real ISO timestamps so the
// wall-time grace gate is exercised as in production.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  ControlPlaneReadinessPublicationPlanningSnapshot,
} from
  '../../src/control-plane/control-plane-readiness-publication-planning-snapshot.js';
import {
  ControlPlaneReadinessPublicationPlanningResolution,
} from
  '../../src/control-plane/control-plane-readiness-publication-planning-resolution.js';
import {
  MembershipPublicationCoordinatorReads,
} from '../../src/control-plane/membership-publication-coordinator-reads.js';
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

const PlanningSnapshot = ControlPlaneReadinessPublicationPlanningSnapshot;
const PlanningResolution = ControlPlaneReadinessPublicationPlanningResolution;
const resolveProjectionMemo =
  PlanningSnapshot.prototype
    .resolveMemoizedPriorityRecoveryPlanningProjectionSync;
const resolveMergeMemo =
  PlanningResolution.prototype
    .resolveMemoizedMembershipPublicationPlanningSnapshotSync;
const probeSync =
  MembershipPublicationCoordinatorReads.prototype
    .getLatestMembershipPublicationEpochStatusForNodeSync;

const T0 = Date.parse('2026-08-30T06:00:00.000Z');
const iso = (offsetMs) => new Date(T0 + offsetMs).toISOString();
const STALE_GRACE_MS = 15000;
const BURST_CALL_COUNT = 40;
const NODE_COUNT = 5;
const PARTITION_ID = 'priority-partition';
const RATE_CALL_COUNT = 1000;
const RATE_STEP_MS = 5;
const RATE_WRITE_EVERY = 5;
const MS_PER_SECOND = 1000;
const READY_LEASE_WINDOW_MS = 60000;
// Pre-change measurement of the identical 1000-call formation-shaped sequence
// against the probe-derived veto (commit f8e161599): 1724 heavy planning
// builds = 344.8/s. Key equality is exactly as strong as the veto it replaces,
// so the rate is unchanged by construction and must never regress above this.
const PRE_CHANGE_HEAVY_BUILD_BOUND = 1724;
// The key comparison derives the publication component only once the
// generation component already matches — the same short-circuit order the
// generation-check + live-veto pair had — so publications winner reads per
// call are unchanged. This ratchets that count for the same sequence.
const PUBLICATION_WINNER_READ_BOUND = 824;
const PROBE_UNAVAILABLE_KEY_COMPONENT = 'publication-probe-unavailable';
const CACHE_KEY_FIELDS = Object.freeze([
  COLUMN.NODE_ID,
  COLUMN.SERVICE_ID,
  'partition_id',
  'operation_id',
  'publication_id',
  'endpoint_id',
  'reservation_id',
]);

// The publication states a winner row can present to the memo guard.
const PUBLICATION_STATES = Object.freeze([
  Object.freeze({label: 'epoch-2-published', epoch: 2, status: 'PUBLISHED'}),
  Object.freeze({
    label: 'epoch-2-acknowledging', epoch: 2, status: 'ACKNOWLEDGING',
  }),
  Object.freeze({label: 'epoch-3-published', epoch: 3, status: 'PUBLISHED'}),
  Object.freeze({
    label: 'epoch-3-acknowledging', epoch: 3, status: 'ACKNOWLEDGING',
  }),
  Object.freeze({label: 'no-membership-row', epoch: null, status: null}),
]);

function publicationRow({epoch, status, nodeIds = ['node-a']}) {
  return {
    publication_id: 'pub-1',
    publication_kind: 'cluster_membership',
    publication_epoch: epoch,
    status,
    published_active_node_ids: JSON.stringify(nodeIds),
    required_ack_node_ids: JSON.stringify(nodeIds),
    acknowledged_node_ids: JSON.stringify(nodeIds),
  };
}

function rowsForState(state) {
  return state.epoch === null ? [] : [publicationRow(state)];
}

function coordinatorService(rows) {
  return {
    systemTableCache: {getAll: () => rows},
    getLatestMembershipPublicationEpochStatusForNodeSync(nodeId, options) {
      return probeSync.call(this, nodeId, options);
    },
  };
}

function probeHost(rows) {
  return {
    membershipPublicationService: coordinatorService(rows),
    readLatestMembershipPublicationEpochStatusProbe:
      PlanningSnapshot.prototype
        .readLatestMembershipPublicationEpochStatusProbe,
  };
}

// The predicate this change REPLACES, restored verbatim from the prior source
// as the equivalence oracle. It is the reference the version key must match.
function removedEpochStatusVeto(storedProbe, livePublicationRows, nodeId) {
  const latestPub = coordinatorService(livePublicationRows)
    .getLatestMembershipPublicationEpochStatusForNodeSync(
      nodeId,
      {requireNodeInclusion: false},
    );
  const latest = {
    epoch: latestPub ? (latestPub.publicationEpoch ?? null) : null,
    status: latestPub ? (latestPub.status ?? null) : null,
  };
  if (!storedProbe) {
    return false;
  }
  return latest.epoch !== storedProbe.epoch ||
    latest.status !== storedProbe.status;
}

function probeFor(rows, nodeId) {
  return PlanningSnapshot.prototype
    .readLatestMembershipPublicationEpochStatusProbe.call(
      probeHost(rows),
      nodeId,
    );
}

function keyComponentFor(rows, nodeId) {
  return PlanningSnapshot.prototype
    .buildMembershipPublicationPlanningMemoKeyComponent.call(
      probeHost(rows),
      nodeId,
    );
}

function sharedMemoMethods(Owner) {
  return {
    readPlanningProjectionSourceGeneration:
      Owner.prototype.readPlanningProjectionSourceGeneration,
    isReadinessPlanningMemoWithinStaleGrace:
      Owner.prototype.isReadinessPlanningMemoWithinStaleGrace,
    readLatestMembershipPublicationEpochStatusProbe:
      Owner.prototype.readLatestMembershipPublicationEpochStatusProbe,
    buildMembershipPublicationPlanningMemoKeyComponent:
      Owner.prototype.buildMembershipPublicationPlanningMemoKeyComponent,
    readMembershipPublicationPlanningMemoVersionKey:
      Owner.prototype.readMembershipPublicationPlanningMemoVersionKey,
    membershipPublicationPlanningMemoVersionKeyMatches:
      Owner.prototype.membershipPublicationPlanningMemoVersionKeyMatches,
  };
}

// Mock readiness service `this` driving the REAL memo, the REAL version key
// derivation and the REAL publication probe. `builds` records every heavy
// projection build so a rebuild is distinguishable from a served entry.
function projectionMemoCtx({nodeId = 'node-a', rows = []} = {}) {
  let clock = T0;
  const builds = [];
  const ctx = {
    nodeId,
    now: () => (clock += 1),
    membershipPublicationPlanningActiveStaleGraceMs: STALE_GRACE_MS,
    membershipPublicationPlanningSourceRevision: 0,
    priorityRecoveryPlanningProjectionMemoByNodeId: new Map(),
    membershipPublicationService: coordinatorService(rows),
    ...sharedMemoMethods(PlanningSnapshot),
    getMembershipPublicationPlanningSnapshotSync: (id) => ({read: id}),
    buildTrackedPriorityRecoveryPlanningProjection: (snapshot) => {
      builds.push(snapshot?.read ?? null);
      return Object.freeze({
        projectionFor: snapshot?.read ?? null,
        build: builds.length,
        publicationEpoch: rows[0] ? rows[0].publication_epoch : null,
        publicationStatus: rows[0] ? rows[0].status : null,
      });
    },
  };
  return {ctx, builds};
}

function mergeMemoCtx({nodeId = 'node-a', rows = []} = {}) {
  let clock = T0;
  const builds = [];
  const ctx = {
    nodeId,
    now: () => (clock += 1),
    membershipPublicationPlanningActiveStaleGraceMs: STALE_GRACE_MS,
    membershipPublicationPlanningSourceRevision: 0,
    membershipPublicationPlanningSnapshotMemoByNodeId: new Map(),
    membershipPublicationService: coordinatorService(rows),
    ...sharedMemoMethods(PlanningResolution),
    resolveMembershipPublicationPlanningSnapshot: (context) => {
      builds.push(context?.nodeId ?? null);
      return Object.freeze({
        mergeFor: context?.nodeId ?? null,
        build: builds.length,
      });
    },
  };
  return {ctx, builds};
}

function replaceRows(rows, state) {
  rows.length = 0;
  for (const row of rowsForState(state)) {
    rows.push(row);
  }
}

test('version-key-equals-removed-veto-matrix', () => {
  let comparisons = 0;
  let disagreements = 0;
  let weakerThanVeto = 0;
  for (const stored of PUBLICATION_STATES) {
    for (const live of PUBLICATION_STATES) {
      comparisons += 1;
      const storedRows = rowsForState(stored);
      const liveRows = rowsForState(live);
      const vetoSaysStale = removedEpochStatusVeto(
        probeFor(storedRows, 'node-a'),
        liveRows,
        'node-a',
      );
      const keySaysStale =
        keyComponentFor(storedRows, 'node-a') !==
        keyComponentFor(liveRows, 'node-a');
      if (vetoSaysStale !== keySaysStale) {
        disagreements += 1;
      }
      if (vetoSaysStale && !keySaysStale) {
        weakerThanVeto += 1;
      }
    }
  }
  assert.equal(comparisons, PUBLICATION_STATES.length ** 2,
    'the matrix covers every ordered pair of publication states');
  assert.equal(weakerThanVeto, 0,
    'key equality is never weaker than the removed veto');
  assert.equal(disagreements, 0,
    'key equality is exactly as strong as the removed veto on every pair');
});

test('version-key-names-probe-unavailable-state', () => {
  const component = PlanningSnapshot.prototype
    .buildMembershipPublicationPlanningMemoKeyComponent.call(
      {
        membershipPublicationService: null,
        readLatestMembershipPublicationEpochStatusProbe:
          PlanningSnapshot.prototype
            .readLatestMembershipPublicationEpochStatusProbe,
      },
      'node-a',
    );
  assert.equal(typeof component, 'string',
    'a service with no probe surface still renders comparable key text');
  assert.equal(component, PROBE_UNAVAILABLE_KEY_COMPONENT,
    'the probe-unavailable service state has one named key component');
  for (const state of PUBLICATION_STATES) {
    assert.notEqual(component, keyComponentFor(rowsForState(state), 'node-a'),
      `the probe-unavailable component never collides with ${state.label}`);
  }
  const componentsByLabel = new Map(PUBLICATION_STATES.map((state) => [
    state.label,
    keyComponentFor(rowsForState(state), 'node-a'),
  ]));
  assert.equal(new Set(componentsByLabel.values()).size,
    PUBLICATION_STATES.length,
    'distinct publication states render distinct key components');
});

test('version-key-carries-generation-and-publication', () => {
  const rows = rowsForState(PUBLICATION_STATES[0]);
  const {ctx} = projectionMemoCtx({rows});
  const versionKey = ctx.readMembershipPublicationPlanningMemoVersionKey
    .call(ctx, 'node-a', iso(1));
  assert.equal(versionKey.sourceGeneration, 0,
    'the key carries the floored planning generation component');
  assert.equal(versionKey.publicationComponent,
    keyComponentFor(rows, 'node-a'),
    'the key carries the live publication (epoch, status) component');
  assert.ok(Object.isFrozen(versionKey),
    'the version key is a frozen record, not mutable memo state');
  assert.equal(
    ctx.membershipPublicationPlanningMemoVersionKeyMatches
      .call(ctx, versionKey, 'node-a', 0),
    true,
    'an unchanged generation and publication match the key');
  assert.equal(
    ctx.membershipPublicationPlanningMemoVersionKeyMatches
      .call(ctx, versionKey, 'node-a', 1),
    false,
    'a rotated generation fails the key even when the publication holds');
});

test('stable-epoch-burst-builds-once', () => {
  const rows = rowsForState(PUBLICATION_STATES[0]);
  const {ctx, builds} = projectionMemoCtx({rows});
  const first = resolveProjectionMemo.call(ctx, 'node-a', iso(1));
  for (let call = 2; call <= BURST_CALL_COUNT; call++) {
    assert.equal(resolveProjectionMemo.call(ctx, 'node-a', iso(call)), first,
      `call ${call} serves the same memoized projection identity`);
  }
  assert.equal(builds.length, 1,
    `${BURST_CALL_COUNT} calls under a stable publication build once`);
});

test('epoch-advance-rebuilds-once', () => {
  const rows = rowsForState(PUBLICATION_STATES[0]);
  const {ctx, builds} = projectionMemoCtx({rows});
  const before = resolveProjectionMemo.call(ctx, 'node-a', iso(1));
  assert.equal(builds.length, 1, 'built once before the advance');
  replaceRows(rows, PUBLICATION_STATES[2]);
  const after = resolveProjectionMemo.call(ctx, 'node-a', iso(2));
  assert.equal(builds.length, 2, 'the epoch advance rebuilt exactly once');
  assert.notEqual(after, before,
    'the advanced entry is not the pre-advance projection');
  assert.equal(after.publicationEpoch, 3,
    'the rebuilt projection carries the advanced epoch');
  assert.equal(resolveProjectionMemo.call(ctx, 'node-a', iso(3)), after,
    'the post-advance entry is served on the next call');
  assert.equal(builds.length, 2,
    'no further rebuild while the epoch is stable');
});

test('status-transition-rebuilds-once', () => {
  const rows = rowsForState(PUBLICATION_STATES[0]);
  const {ctx, builds} = projectionMemoCtx({rows});
  resolveProjectionMemo.call(ctx, 'node-a', iso(1));
  replaceRows(rows, PUBLICATION_STATES[1]);
  const after = resolveProjectionMemo.call(ctx, 'node-a', iso(2));
  assert.equal(builds.length, 2,
    'a status transition within one epoch rebuilt exactly once');
  assert.equal(after.publicationStatus, 'ACKNOWLEDGING',
    'the rebuilt projection carries the transitioned status');
  assert.equal(after.publicationEpoch, 2,
    'the epoch did not move: only the status did');
  assert.equal(resolveProjectionMemo.call(ctx, 'node-a', iso(3)), after,
    'the post-transition entry is served while the status holds');
  assert.equal(builds.length, 2,
    'no further rebuild while the status is stable');
});

test('multi-node-interleave-no-cross-caller-thrash', () => {
  const rows = rowsForState(PUBLICATION_STATES[0]);
  const {ctx, builds} = projectionMemoCtx({rows});
  const nodeIds = ['node-a', 'node-b', 'node-c', 'node-d', 'node-e'];
  const firstByNode = new Map();
  for (const nodeId of nodeIds) {
    firstByNode.set(nodeId, resolveProjectionMemo.call(ctx, nodeId, iso(1)));
  }
  assert.equal(builds.length, nodeIds.length,
    'each publisher node builds its own projection exactly once');
  for (let round = 2; round <= BURST_CALL_COUNT; round++) {
    const nodeId = nodeIds[round % nodeIds.length];
    assert.equal(resolveProjectionMemo.call(ctx, nodeId, iso(round)),
      firstByNode.get(nodeId),
      `interleaved call ${round} serves ${nodeId}'s own memoized projection`);
  }
  assert.equal(builds.length, nodeIds.length,
    'an interleaved multi-node burst adds no rebuild: the memo slot is keyed ' +
      'per publisher and the publication component is publisher-independent');
  for (const nodeId of nodeIds) {
    assert.equal(
      keyComponentFor(rows, nodeId),
      keyComponentFor(rows, 'node-a'),
      `${nodeId} derives the same cluster-winner publication component, so ` +
        'no publisher can invalidate another through it');
  }
});

test('moved-publication-never-served-from-memo', () => {
  let servedStale = 0;
  let pairs = 0;
  for (const stored of PUBLICATION_STATES) {
    for (const live of PUBLICATION_STATES) {
      if (stored.label === live.label) {
        continue;
      }
      pairs += 1;
      const rows = rowsForState(stored);
      const {ctx, builds} = projectionMemoCtx({rows});
      const before = resolveProjectionMemo.call(ctx, 'node-a', iso(1));
      replaceRows(rows, live);
      const after = resolveProjectionMemo.call(ctx, 'node-a', iso(2));
      if (after === before || builds.length !== 2) {
        servedStale += 1;
      }
    }
  }
  assert.equal(pairs,
    PUBLICATION_STATES.length * (PUBLICATION_STATES.length - 1),
    'every ordered pair of DISTINCT publication states is exercised');
  assert.equal(servedStale, 0,
    'every moved (epoch, status) pair forces a rebuild rather than serving ' +
      'the entry it was derived from');
});

test('merge-memo-shares-one-version-key', () => {
  const rows = rowsForState(PUBLICATION_STATES[0]);
  const {ctx, builds} = mergeMemoCtx({rows});
  const first = resolveMergeMemo.call(ctx, 'node-a', iso(1), {}, null);
  assert.equal(resolveMergeMemo.call(ctx, 'node-a', iso(2), {}, null), first,
    'a stable publication serves the memoized merge');
  assert.equal(builds.length, 1,
    'the merge ran once under a stable publication');
  replaceRows(rows, PUBLICATION_STATES[2]);
  const after = resolveMergeMemo.call(ctx, 'node-a', iso(3), {}, null);
  assert.notEqual(after, first, 'an epoch advance re-merges');
  assert.equal(builds.length, 2,
    'the epoch advance re-merged exactly once');
  ctx.membershipPublicationPlanningSourceRevision += 1;
  resolveMergeMemo.call(ctx, 'node-a', iso(4), {}, null);
  assert.equal(builds.length, 3,
    'a planning-source generation change still re-merges independently of ' +
      'the publication component');
});

test('budgets-and-cadence-unchanged', () => {
  const rows = rowsForState(PUBLICATION_STATES[0]);
  const {ctx, builds} = projectionMemoCtx({rows});
  resolveProjectionMemo.call(ctx, 'node-a', iso(1));
  assert.equal(builds.length, 1, 'built once');
  ctx.membershipPublicationPlanningSourceRevision += 1;
  resolveProjectionMemo.call(ctx, 'node-a', iso(2));
  assert.equal(builds.length, 2,
    'a planning-source generation change still invalidates the memo');
  resolveProjectionMemo.call(ctx, 'node-a', iso(3));
  assert.equal(builds.length, 2, 'stable again with no extra build');
  resolveProjectionMemo.call(ctx, 'node-a', iso(3 + STALE_GRACE_MS + 1));
  assert.equal(builds.length, 3,
    'the wall-time stale grace bound is unchanged and still forces a rebuild');
  assert.equal(ctx.membershipPublicationPlanningActiveStaleGraceMs,
    STALE_GRACE_MS,
    'the memo reads its grace from the owner-configured budget, unchanged');
  const mergeRows = rowsForState(PUBLICATION_STATES[0]);
  const merge = mergeMemoCtx({rows: mergeRows});
  resolveMergeMemo.call(merge.ctx, 'node-a', iso(1), {}, null);
  resolveMergeMemo.call(
    merge.ctx, 'node-a', iso(1 + STALE_GRACE_MS + 1), {}, null,
  );
  assert.equal(merge.builds.length, 2,
    'the merge memo keeps the same wall-time stale grace bound');
});

// Production-composition formation-shaped churn on a virtual clock, driving
// the real readiness owner build. Records the MEASURED heavy planning build
// rate and ratchets it against the pre-change measurement.
function createFormationShapedCache(nowMs) {
  const rowsByTable = new Map(Object.values(TABLES).map((table) => [
    table,
    new Map(),
  ]));
  const versions = new Map();
  const listeners = new Set();
  const keyFor = (table, row) => {
    const field = CACHE_KEY_FIELDS.find((candidate) => row?.[candidate]);
    return String(field ? row[field] :
      `${table}:${rowsByTable.get(table)?.size || 0}`);
  };
  const cache = {
    get: (table, key) => rowsByTable.get(table)?.get(String(key)) || null,
    getAll: (table) => [...(rowsByTable.get(table)?.values() || [])],
    filter(table, predicate) {
      return cache.getAll(table).filter(predicate);
    },
    getTableMutationVersion: (table) => versions.get(table) || 0,
    applySystemTableChange(table, operation, row) {
      const rows = rowsByTable.get(table);
      const key = keyFor(table, row);
      if (String(operation).toUpperCase() === 'DELETE') {
        rows?.delete(key);
      } else {
        rows?.set(key, Object.freeze({...rows?.get(key), ...row}));
      }
      versions.set(table, (versions.get(table) || 0) + 1);
      for (const listener of listeners) {
        listener(table, operation, row, null);
      }
    },
    onCacheChange: (listener) => listeners.add(listener),
    offCacheChange: (listener) => listeners.delete(listener),
  };
  for (let index = 0; index < NODE_COUNT; index++) {
    const nodeId = `node-${index}`;
    cache.applySystemTableChange(TABLES.NODES, 'INSERT', {
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.LAST_HEARTBEAT]: nowMs,
      [COLUMN.READY_LEASE_EXPIRES_AT]: nowMs + READY_LEASE_WINDOW_MS,
      connection_state: 'ready',
    });
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      [COLUMN.SERVICE_ID]: `service-${index}`,
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: `${nodeId}/partition/${PARTITION_ID}`,
      partition_id: PARTITION_ID,
      raft_role: index === 0 ? 'leader' : 'follower',
    });
  }
  cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
    partition_id: PARTITION_ID,
    table_name: TABLES.NODES,
    leader_node_id: 'node-0',
  });
  cache.applySystemTableChange(TABLES.CONTROL_PLANE_PUBLICATIONS, 'INSERT',
    publicationRow({
      ...PUBLICATION_STATES[0],
      nodeIds: Array.from({length: NODE_COUNT}, (_, index) => `node-${index}`),
    }));
  return cache;
}

function driveFormationShapedChurn() {
  let clock = T0;
  const cache = createFormationShapedCache(T0);
  const readiness = new ControlPlaneReadinessService({
    nodeId: 'node-0',
    systemTableCache: cache,
    now: () => clock,
    readinessPlanningScheduleDrainFn: () => {},
    messageRouter: {
      getConnectionState: () => 'connected',
      getConnectedNodes: () => new Set(
        Array.from({length: NODE_COUNT}, (_, index) => `node-${index}`),
      ),
    },
  });
  readiness.syncOwnerDependencies({
    membershipPublicationService: new MembershipPublicationCoordinator({
      nodeId: 'node-0',
      systemTableCache: cache,
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
        upsertSystemTableRow: async () => ({success: true}),
      },
      controlPlaneReadinessService: readiness,
      now: () => clock,
    }),
  });
  let heavyBuilds = 0;
  const buildProjection =
    readiness.buildTrackedPriorityRecoveryPlanningProjection;
  readiness.buildTrackedPriorityRecoveryPlanningProjection = function(...args) {
    heavyBuilds += 1;
    return buildProjection.apply(this, args);
  };
  let publicationWinnerReads = 0;
  const readProbe = readiness.readLatestMembershipPublicationEpochStatusProbe;
  readiness.readLatestMembershipPublicationEpochStatusProbe = function(...args) {
    publicationWinnerReads += 1;
    return readProbe.apply(this, args);
  };
  const churnTables = [
    TABLES.NODES,
    TABLES.NODE_ENDPOINTS,
    TABLES.SERVICES,
    TABLES.PARTITIONS,
    TABLES.REPLICA_OPERATIONS,
    TABLES.CONTROL_PLANE_PUBLICATIONS,
  ];
  // The floored planning generation latches on the wall clock, so the virtual
  // clock drives it for the duration of the measured sequence.
  const platformNow = Date.now;
  Date.now = () => clock;
  let writeRevision = 0;
  try {
    for (let call = 0; call < RATE_CALL_COUNT; call++) {
      clock += RATE_STEP_MS;
      if (call % RATE_WRITE_EVERY === 0) {
        writeRevision += 1;
        cache.applySystemTableChange(
          churnTables[writeRevision % churnTables.length],
          'UPDATE',
          {
            revision: writeRevision,
            updated_at: clock,
            node_id: `node-${writeRevision % NODE_COUNT}`,
            endpoint_id: 'endpoint-0',
            service_id: 'service-0',
            partition_id: PARTITION_ID,
            operation_id: 'operation-0',
            publication_id: 'publication-aux',
            publication_kind: 'other',
          },
        );
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
  return {heavyBuilds, publicationWinnerReads};
}

test('formation-shaped-build-rate-at-pre-change-bound', () => {
  const {heavyBuilds, publicationWinnerReads} = driveFormationShapedChurn();
  const elapsedSeconds = (RATE_CALL_COUNT * RATE_STEP_MS) / MS_PER_SECOND;
  assert.ok(heavyBuilds > 0,
    'the formation-shaped sequence exercises the heavy planning builder');
  assert.ok(heavyBuilds <= PRE_CHANGE_HEAVY_BUILD_BOUND,
    `heavy planning builds (${heavyBuilds} over ${elapsedSeconds}s of ` +
      `virtual time = ${heavyBuilds / elapsedSeconds}/s) stay at or below ` +
      `the pre-change measurement of ${PRE_CHANGE_HEAVY_BUILD_BOUND}`);
  assert.ok(publicationWinnerReads <= PUBLICATION_WINNER_READ_BOUND,
    `publication winner reads (${publicationWinnerReads}) stay at or below ` +
      `${PUBLICATION_WINNER_READ_BOUND}: the cheap-component-first key ` +
      'comparison adds no publication read per call');
});

test('witness-deterministic', () => {
  const first = driveFormationShapedChurn();
  const second = driveFormationShapedChurn();
  assert.deepEqual(second, first,
    'two identical drives of the formation-shaped sequence produce identical ' +
      'heavy build and publication read counts');
  const rowsA = rowsForState(PUBLICATION_STATES[0]);
  const rowsB = rowsForState(PUBLICATION_STATES[0]);
  const runA = projectionMemoCtx({rows: rowsA});
  const runB = projectionMemoCtx({rows: rowsB});
  for (let call = 1; call <= BURST_CALL_COUNT; call++) {
    resolveProjectionMemo.call(runA.ctx, 'node-a', iso(call));
    resolveProjectionMemo.call(runB.ctx, 'node-a', iso(call));
  }
  replaceRows(rowsA, PUBLICATION_STATES[2]);
  replaceRows(rowsB, PUBLICATION_STATES[2]);
  resolveProjectionMemo.call(runA.ctx, 'node-a', iso(BURST_CALL_COUNT + 1));
  resolveProjectionMemo.call(runB.ctx, 'node-a', iso(BURST_CALL_COUNT + 1));
  assert.deepEqual(runB.builds, runA.builds,
    'two identical memo drives produce the identical build sequence');
});
