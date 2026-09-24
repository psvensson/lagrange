// A membership epoch names at least one member, and published membership has
// one semantic owner with two named reads.
//
// Witnessed on the rs-raft cutover (membership-consistency test 2): the seed's
// first reconcile ran before its READY heartbeat committed, derived a
// candidate with no member, and published epoch 1 with an empty member set;
// readers then gave that row different meanings.
//
// The publication owner defers any candidate with no member (a typed reason)
// until a member's READY heartbeat commits; the READY commit wakes the
// reconcile through the replica-dispatch nodes-cache listener. The publication
// snapshot owner (active-node-publication-snapshots.js) exposes exactly two
// reads: (a) published membership, the members of the latest PUBLISHED row
// (null when none; an OPEN or ACK_PENDING row never counts; a PUBLISHED []
// reads as [], "published, nobody"), and (b) the pending candidate, the latest
// row while it still collects acknowledgements, for writers that target it.
// Every reader derives from one of them.
//
// Composition: the real membership publication coordinator, the real replica
// dispatch service and the real rebalancer over one real system-table cache;
// the commit order is controlled by applying each commit to the cache. The
// publications owner is the in-memory table the coordinator persists through
// (its rows are the cache's rows).

import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {SystemTableCache, CDC_OPERATIONS} from
  '../../src/cache/system-table-cache.js';
import {
  MembershipPublicationCoordinator,
} from '../../src/control-plane/membership-publication-coordinator.js';
import * as MEMBERSHIP_RECONCILE from
  '../../src/control-plane/membership-publication-coordinator-reconcile.js';
import * as PUBLICATION_SNAPSHOTS from
  '../../src/control-plane/active-node-publication-snapshots.js';
import {buildMembershipPublicationRow} from
  '../../src/control-plane/membership-publication-planning-evidence.js';
import {
  MEMBERSHIP_PUBLICATION_KIND,
  MEMBERSHIP_PUBLICATION_STATUS,
} from '../../src/control-plane/membership-publication-row-contract.js';
import {ReplicaDispatchService} from
  '../../src/control-plane/replica-dispatch-service.js';
import {buildNodeTrustState} from '../../src/control-plane/node-trust-state.js';
import {NODE_STATUS} from '../../src/node/node-constants.js';
import {STATE, TABLES} from '../../src/constants/index.js';
import {RECONCILE_REASON} from '../../src/workflow/reconcile-queue-constants.js';
import {
  createMockControlPlaneReadinessService,
  createTestRebalancer,
} from '../rebalancer/test-helpers.js';

const SEED_NODE_ID = 'seed-node';
const JOINER_NODE_ID = 'joiner-node';
const DEPARTED_NODE_ID = 'departed-node';
const READY_LEASE_MS = 10000;
const NOW_MS = Date.now();
const SETTLE_TURNS = 100;
const QUIET_LOGGER = Object.freeze({warn() {}, info() {}, debug() {}, error() {}});
const REPOSITORY_ROOT = fileURLToPath(new URL('../../', import.meta.url));

function nodeRow(nodeId, connectionState) {
  return {
    node_id: nodeId,
    node_address: `ws://${nodeId}`,
    status: NODE_STATUS.ACTIVE,
    connection_state: connectionState,
    ready_lease_expires_at:
      connectionState === STATE.READY ? NOW_MS + READY_LEASE_MS : null,
    last_heartbeat: NOW_MS,
  };
}

function commitNodeRow(cache, nodeId, connectionState) {
  cache.applySystemTableChange(
    TABLES.NODES, CDC_OPERATIONS.UPSERT, nodeRow(nodeId, connectionState));
}

function membershipRows(cache) {
  return (cache.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS) || [])
    .map((row) => ({
      epoch: row.publication_epoch,
      members: [...row.published_active_node_ids].sort(),
    }))
    .sort((left, right) => left.epoch - right.epoch);
}

async function yieldTurns(turns) {
  for (let turn = 0; turn < turns; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

// The publications table the coordinator reads and persists through; a
// persisted row is a committed row of the cache.
function startPublicationOwner(cache) {
  return new MembershipPublicationCoordinator({
    nodeId: SEED_NODE_ID,
    systemTableCache: cache,
    logger: QUIET_LOGGER,
    now: () => NOW_MS,
    controlPlanePublicationsOwner: {
      async listPublicationsFromCache() {
        return cache.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS) || [];
      },
      async getPublication(publicationId) {
        return cache.get(TABLES.CONTROL_PLANE_PUBLICATIONS, publicationId) ||
          null;
      },
      async upsertPublication(row) {
        cache.applySystemTableChange(
          TABLES.CONTROL_PLANE_PUBLICATIONS, CDC_OPERATIONS.UPSERT, row);
        return {success: true};
      },
    },
  });
}

// The seed's replica dispatch service, listening to its nodes cache: a READY
// node row is the wake that advances membership publication.
function startReplicaDispatch(cache, coordinator) {
  const dispatch = new ReplicaDispatchService({
    nodeId: SEED_NODE_ID,
    messageRouter: {},
    systemTableCache: cache,
    logger: QUIET_LOGGER,
    rebalanceCoordinator: {},
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      ...createMockControlPlaneReadinessService({systemTableCache: cache}),
      membershipPublicationService: coordinator,
    },
  });
  dispatch.initialize();
  return dispatch;
}

test('formation publishes no epoch before the seed\'s READY heartbeat ' +
  'commits, and the READY commit\'s own wake publishes the seed', async () => {
  const cache = new SystemTableCache();
  const coordinator = startPublicationOwner(cache);
  const dispatch = startReplicaDispatch(cache, coordinator);
  try {
    // Registered, READY heartbeat not yet committed; the priority-recovery
    // progress wake runs the reconcile first (the witnessed order).
    commitNodeRow(cache, SEED_NODE_ID, STATE.CONNECTED);
    coordinator.enqueueClusterMembershipReconcile(
      RECONCILE_REASON.PRIORITY_RECOVERY_PROGRESS);
    await yieldTurns(SETTLE_TURNS);
    assert.deepEqual(membershipRows(cache), [],
      'no epoch is published before the seed\'s READY heartbeat commits');

    // The READY heartbeat commits; nothing calls the reconcile by hand.
    commitNodeRow(cache, SEED_NODE_ID, STATE.READY);
    for (let turn = 0; turn < SETTLE_TURNS &&
      membershipRows(cache).length === 0; turn += 1) {
      await yieldTurns(1);
    }
    assert.deepEqual(membershipRows(cache),
      [{epoch: 1, members: [SEED_NODE_ID]}],
      'the READY commit wakes the reconcile, and the first epoch names the seed');
  } finally {
    dispatch.stop();
    coordinator.stopOwnerMembershipDriver();
  }
});

test('every candidate with no member defers, not only the first', async () => {
  const cache = new SystemTableCache();
  const coordinator = startPublicationOwner(cache);
  commitNodeRow(cache, SEED_NODE_ID, STATE.READY);
  await coordinator.reconcileClusterMembership({});
  assert.deepEqual(membershipRows(cache),
    [{epoch: 1, members: [SEED_NODE_ID]}], 'the first epoch names the seed');

  // A later reconcile whose planning snapshot holds no member (the input the
  // active-gate path supplies): an epoch exists, the candidate is empty.
  const later = await startPublicationOwner(cache).reconcileClusterMembership({
    planningSnapshot: {
      nodeRows: [nodeRow(SEED_NODE_ID, STATE.CONNECTED)],
      readinessEntries: [],
      serviceRows: [],
      replicaOperationRows: [],
    },
  });
  assert.deepEqual(membershipRows(cache),
    [{epoch: 1, members: [SEED_NODE_ID]}],
    'a later empty candidate publishes no epoch without a member');
  assert.equal(later.reason,
    MEMBERSHIP_RECONCILE.EMPTY_PUBLICATION_CANDIDATE_REASON,
    'the later reconcile defers for the typed reason');
});

function latestMembershipRow(cache) {
  return (cache.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS) || [])
    .reduce((latest, row) =>
      (!latest || row.publication_epoch > latest.publication_epoch ?
        row : latest), null);
}

function ownerReads(cache) {
  const publicationRows = cache.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS) || [];
  return {
    published: PUBLICATION_SNAPSHOTS.resolvePublishedActiveNodeIds({
      publicationRows,
    }),
    pending: PUBLICATION_SNAPSHOTS.resolvePendingMembershipCandidate?.({
      publicationRows,
    })?.nodeIds ?? null,
  };
}

// The owner-state transition: a membership candidate the publication owner
// has written but that has not crossed the publication boundary (its required
// acknowledgements are outstanding) is the pending candidate and NOT published
// membership; once its members acknowledge it through the owner's own
// acknowledgement path, it is published and no longer pending. Round-1 B2
// defect: the unpublished first candidate read as published membership.
test('a membership candidate is pending, not published, until its ' +
  'acknowledgements publish it', async () => {
  const cache = new SystemTableCache();
  const coordinator = startPublicationOwner(cache);

  // The first epoch: written, its acknowledgement outstanding.
  commitNodeRow(cache, SEED_NODE_ID, STATE.READY);
  await coordinator.reconcileClusterMembership({});
  assert.equal(latestMembershipRow(cache).status,
    MEMBERSHIP_PUBLICATION_STATUS.OPEN,
    'the first candidate awaits its acknowledgements');
  assert.equal(ownerReads(cache).published, null,
    'an unpublished first candidate is not published membership');
  assert.deepEqual(ownerReads(cache).pending, [SEED_NODE_ID],
    'it is the pending candidate');

  // The real publication condition: the member acknowledges it.
  await coordinator.acknowledgePublication(
    latestMembershipRow(cache).publication_id, SEED_NODE_ID);
  assert.deepEqual(ownerReads(cache),
    {published: [SEED_NODE_ID], pending: null},
    'acknowledged, it is published membership and no longer pending');

  // A later candidate naming a joiner: pending above the published epoch.
  commitNodeRow(cache, JOINER_NODE_ID, STATE.READY);
  await coordinator.reconcileClusterMembership({});
  const candidate = latestMembershipRow(cache);
  assert.deepEqual(ownerReads(cache), {
    published: [SEED_NODE_ID],
    pending: [JOINER_NODE_ID, SEED_NODE_ID].sort(),
  }, 'the joiner is in the pending candidate, not in published membership');
  await coordinator.acknowledgePublication(
    candidate.publication_id, SEED_NODE_ID);
  assert.deepEqual(ownerReads(cache).published, [SEED_NODE_ID],
    'with one acknowledgement outstanding it is still not published');
  await coordinator.acknowledgePublication(
    candidate.publication_id, JOINER_NODE_ID);
  assert.deepEqual(ownerReads(cache), {
    published: [JOINER_NODE_ID, SEED_NODE_ID].sort(),
    pending: null,
  }, 'every acknowledgement in, the joiner is published membership');
});

function membershipRow(epoch, status, nodeIds) {
  return buildMembershipPublicationRow({
    candidate: {
      publicationKind: MEMBERSHIP_PUBLICATION_KIND,
      publicationEpoch: epoch,
      publishedActiveNodeIds: nodeIds,
      publisherNodeId: SEED_NODE_ID,
      requiredAckNodeIds: nodeIds,
      acknowledgedNodeIds: nodeIds,
    },
    status,
    nowMs: NOW_MS + epoch,
    publicationId: `membership-publication-${epoch}`,
  });
}

// The four publication states and the owner's defined answers.
const PUBLICATION_STATES = Object.freeze([
  {
    name: 'no row',
    rows: [],
    published: null,
    pending: null,
  },
  {
    name: 'an OPEN row only',
    rows: [membershipRow(1, MEMBERSHIP_PUBLICATION_STATUS.OPEN,
      [SEED_NODE_ID])],
    published: null,
    pending: [SEED_NODE_ID],
  },
  {
    name: 'PUBLISHED members with an OPEN candidate above',
    rows: [
      membershipRow(1, MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
        [SEED_NODE_ID]),
      membershipRow(2, MEMBERSHIP_PUBLICATION_STATUS.OPEN,
        [JOINER_NODE_ID, SEED_NODE_ID]),
    ],
    published: [SEED_NODE_ID],
    pending: [JOINER_NODE_ID, SEED_NODE_ID],
  },
  {
    name: 'a legacy PUBLISHED [] (pre-fix durable state)',
    rows: [
      membershipRow(1, MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
        [DEPARTED_NODE_ID]),
      membershipRow(2, MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED, []),
    ],
    published: [],
    pending: null,
  },
]);

function cacheWithRows(rows) {
  const cache = new SystemTableCache();
  for (const row of rows) {
    cache.applySystemTableChange(
      TABLES.CONTROL_PLANE_PUBLICATIONS, CDC_OPERATIONS.INSERT, row);
  }
  return cache;
}

test('the publication snapshot owner answers its two reads as defined in ' +
  'every publication state', () => {
  for (const state of PUBLICATION_STATES) {
    const publicationRows = state.rows;
    assert.deepEqual(
      PUBLICATION_SNAPSHOTS.resolvePublishedActiveNodeIds({publicationRows}),
      state.published,
      `${state.name}: published membership is the latest PUBLISHED row's ` +
      'members (an OPEN row never counts)');
    const latestRow = publicationRows.at(-1) || null;
    assert.equal(
      PUBLICATION_SNAPSHOTS.buildMembershipPublicationActiveSnapshot(latestRow)
        ?.publishedActiveNodeIdsPresent ?? false,
      latestRow?.status === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
      `${state.name}: the snapshot marks a list published only on a ` +
      'PUBLISHED row');
    assert.deepEqual(
      PUBLICATION_SNAPSHOTS.resolvePendingMembershipCandidate?.(
        {publicationRows})?.nodeIds ?? null,
      state.pending,
      `${state.name}: the pending candidate is the latest row still ` +
      'collecting acknowledgements');
  }
});

test('the routed readers give the owner\'s answer on the legacy PUBLISHED [] ' +
  'state', async () => {
  const legacy = PUBLICATION_STATES.at(-1);
  const cache = cacheWithRows(legacy.rows);
  commitNodeRow(cache, SEED_NODE_ID, STATE.READY);
  const coordinator = startPublicationOwner(cache);
  const rebalancer = createTestRebalancer({
    systemTableCache: cache,
    controlPlaneReadinessService: {
      ...createMockControlPlaneReadinessService({systemTableCache: cache}),
      membershipPublicationService: coordinator,
    },
  });
  const dispatch = startReplicaDispatch(cache, coordinator);
  try {
    const publishedSet = rebalancer.getPublishedActiveNodeIdSet();
    assert.deepEqual(publishedSet === null ? null : [...publishedSet], [],
      'the rebalancer reads published, nobody');
    assert.deepEqual(rebalancer.getAvailableNodes(), [],
      'and places on nobody');

    const advancement =
      dispatch.resolveReadyNodePublicationAdvancement(SEED_NODE_ID);
    const context = dispatch.buildReadyNodePublicationReconcileContext(
      SEED_NODE_ID, nodeRow(SEED_NODE_ID, STATE.READY), advancement);
    assert.deepEqual(context.publishedActiveNodeIds, [SEED_NODE_ID],
      'the ready-node path extends the published nobody with the READY node');

    const latestRow = legacy.rows.at(-1);
    const trust = buildNodeTrustState({
      nodeId: SEED_NODE_ID,
      membershipPublication: {
        ...PUBLICATION_SNAPSHOTS.buildMembershipPublicationActiveSnapshot(
          latestRow),
        sourceSnapshotVersion: 1,
      },
    }, {publicationRows: legacy.rows});
    assert.equal(trust.membership.state, 'removed',
      'node trust reads published, nobody: the node is not a member');
  } finally {
    rebalancer.shutdown();
    dispatch.stop();
    coordinator.stopOwnerMembershipDriver();
  }
});

// The static census: every source file that reads a membership publication's
// member list is classified. A reader outside the owner derives from one of
// the owner's two reads; the producer side, the owner and the evidence that
// only carries the list are listed with why they are not readers.
const OWNER_READ_CALL = /\b(resolvePublishedActiveNodeIds|resolvePendingMembershipCandidate)\(/u;
const ROUTED_READERS = Object.freeze([
  'src/bootstrap/join-cleanup-publication-context.js',
  'src/control-plane/active-node-projection.js',
  'src/control-plane/control-plane-readiness-service-node-methods.js',
  'src/control-plane/heartbeat-service-lifecycle-methods.js',
  'src/control-plane/membership-publication-coordinator-reconcile.js',
  'src/control-plane/node-trust-state.js',
  'src/control-plane/replica-dispatch-replay-health-readiness.js',
  'src/rebalancer/unified-rebalancer-available-nodes.js',
]);
const NOT_READERS = Object.freeze({
  // The owner itself.
  'src/control-plane/active-node-publication-snapshots.js': 'owner',
  // The publication producer: derives, persists, merges and acknowledges
  // rows; the schema and the row normalizer.
  'src/bootstrap/system-table-runtime-schema-definitions.js': 'schema',
  'src/control-plane/system-row-normalizers.js': 'row normalizer',
  'src/control-plane/control-plane-publication-merge.js': 'producer',
  'src/control-plane/membership-lifecycle-constants.js': 'producer',
  'src/control-plane/membership-lifecycle-controller.js': 'producer',
  'src/control-plane/membership-publication-acknowledgement.js': 'producer',
  'src/control-plane/membership-publication-active-gate-reconcile.js':
    'producer',
  'src/control-plane/membership-publication-candidate-derivation.js':
    'producer',
  'src/control-plane/membership-publication-coordinator-queue.js': 'producer',
  'src/control-plane/membership-publication-lifecycle-summary.js': 'producer',
  'src/control-plane/membership-publication-planning-evidence.js': 'producer',
  'src/control-plane/membership-publication-priority-partition-readiness-data.js':
    'producer',
  'src/control-plane/membership-publication-readiness-repair.js': 'producer',
  'src/control-plane/membership-publication-row-helpers.js': 'producer',
  'src/control-plane/membership-publication-target-selection.js': 'producer',
  'src/control-plane/formation-release-handoff-publication.js':
    'another publication kind',
  // Evidence built from the owner's snapshot or planning projection: it
  // carries the list on, it does not decide what a row means.
  'src/admin/admin-control-snapshot.js': 'projection of the owner',
  'src/admin/admin-control-snapshot-local-build-base.js':
    'projection of the owner',
  'src/admin/admin-control-snapshot-membership-publication-reconcile.js':
    'producer (admin reconcile)',
  'src/admin/admin-control-snapshot-node-view-projection.js':
    'projection of the owner',
  'src/admin/admin-control-snapshot-publication-convergence-diagnostics.js':
    'diagnostic',
  'src/admin/admin-control-snapshot-repair-diagnostics.js': 'diagnostic',
  'src/control-plane/control-plane-readiness-publication-planning-snapshot.js':
    'projection of the owner',
  'src/control-plane/current-priority-placement-observation.js':
    'projection of the owner',
  'src/control-plane/priority-recovery-dispatch-snapshot.js':
    'projection of the owner',
  'src/control-plane/priority-recovery-observation-snapshot.js':
    'projection of the owner',
  'src/control-plane/priority-recovery-snapshot-closure.js':
    'projection of the owner',
  'src/control-plane/publication-active-gate-handoff-contract-constants.js':
    'producer (handoff target)',
  'src/control-plane/publication-active-gate-handoff-contract-decision.js':
    'producer (handoff target)',
  'src/control-plane/publication-active-gate-handoff-contract-evidence.js':
    'producer (handoff target)',
  'src/control-plane/publication-active-gate-handoff-contract-fence.js':
    'producer (handoff target)',
  'src/control-plane/publication-active-gate-handoff-contract.js':
    'producer (handoff target)',
  'src/control-plane/publication-active-gate-handoff-contract-selection.js':
    'producer (handoff target)',
  'src/control-plane/publication-recovery-convergence-builder.js':
    'projection of the owner',
  'src/control-plane/publication-recovery-evidence-values.js':
    'projection of the owner',
  'src/control-plane/publication-recovery-handoff-evidence-normalizers.js':
    'normalizer',
  'src/control-plane/publication-recovery-observation-evidence-normalizers.js':
    'normalizer',
  'src/control-plane/recovery-protocol-snapshot.js': 'projection of the owner',
  'src/diagnostics/topology-convergence-publication-normalizers.js':
    'diagnostic',
  'src/diagnostics/topology-convergence-replay.js': 'diagnostic',
  'src/rebalancer/operation-workflow-remove-safety-evaluator.js':
    'projection of the owner',
  'src/rebalancer/operation-workflow-remove-safety-membership.js':
    'projection of the owner',
  'src/rebalancer/priority-placement-observation-memo.js':
    'projection of the owner',
  'src/rebalancer/unified-rebalancer-critical-topology-methods.js':
    'reads the rebalancer\'s routed set',
  'src/rebalancer/unified-rebalancer-follow-up-decision.js':
    'projection of the owner',
  'src/rebalancer/unified-rebalancer-priority-readiness.js':
    'projection of the owner (planning answer)',
});

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    return path.endsWith('.js') ? [path] : [];
  });
}

test('every reader of a membership publication\'s member list derives from ' +
  'the owner\'s reads', () => {
  for (const reader of ROUTED_READERS) {
    const source = readFileSync(join(REPOSITORY_ROOT, reader), 'utf8');
    assert.match(source, OWNER_READ_CALL,
      `${reader} reads membership through the snapshot owner`);
  }
  const readers = sourceFiles(join(REPOSITORY_ROOT, 'src'))
    .filter((path) => /published_active_node_ids|publishedActiveNodeIds/u
      .test(readFileSync(path, 'utf8')))
    .map((path) => relative(REPOSITORY_ROOT, path).split('\\').join('/'))
    .sort();
  const unclassified = readers.filter((reader) =>
    !ROUTED_READERS.includes(reader) && !Object.hasOwn(NOT_READERS, reader));
  assert.deepEqual(unclassified, [],
    'a new reader of the member list is classified: routed through the ' +
    'owner, or listed with why it is not a reader');
});
