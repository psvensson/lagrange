// A membership epoch names at least one member, and what a published member
// list means has one owner.
//
// Witnessed on the rs-raft cutover (membership-consistency test 2): the seed's
// first reconcile ran before its READY heartbeat committed, derived a
// candidate with no member, and published epoch 1 with an empty member set.
// Two readers then disagreed about that row: the rebalancer normalized the
// row itself and read "published, nobody" (an empty set), while the
// publication snapshot owner (resolvePublishedActiveNodeIds) read "no
// published membership" (null).
//
// The publication owner defers a candidate with no member (a typed reason)
// until its prerequisite, the member's READY heartbeat, has committed; the
// heartbeat is a reconcile wake. The rebalancer picks the published row and
// asks the snapshot owner what its member list means.
//
// Composition: the real membership publication coordinator over a real
// system-table cache; the commit order is controlled by applying each commit
// (a node row, a publication) to the cache, never by racing a clock. The
// publications owner is the in-memory table the coordinator persists through
// (its rows are the cache's rows). Red on the pre-fix tree: the first
// reconcile publishes an empty epoch, and the rebalancer reads an empty
// published row as "published, nobody".

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {SystemTableCache, CDC_OPERATIONS} from
  '../../src/cache/system-table-cache.js';
import {
  MembershipPublicationCoordinator,
} from '../../src/control-plane/membership-publication-coordinator.js';
import * as MEMBERSHIP_RECONCILE from
  '../../src/control-plane/membership-publication-coordinator-reconcile.js';
import {buildMembershipPublicationRow} from
  '../../src/control-plane/membership-publication-planning-evidence.js';
import {MEMBERSHIP_PUBLICATION_STATUS} from
  '../../src/control-plane/membership-publication-row-contract.js';
import {resolvePublishedActiveNodeIds} from
  '../../src/control-plane/active-node-publication-snapshots.js';
import {NODE_STATUS} from '../../src/node/node-constants.js';
import {STATE, TABLES} from '../../src/constants/index.js';
import {
  createMockControlPlaneReadinessService,
  createTestRebalancer,
} from '../rebalancer/test-helpers.js';

const SEED_NODE_ID = 'seed-node';
const JOINER_NODE_ID = 'joiner-node';
const DEPARTED_NODE_ID = 'departed-node';
const READY_LEASE_MS = 10000;
const NOW_MS = 1000;
const QUIET_LOGGER = Object.freeze({warn() {}, info() {}, debug() {}, error() {}});

// A node row as its owner commits it: registered (connected), then READY
// once its heartbeat takes the ready lease.
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

function publicationRows(cache) {
  return (cache.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS) || [])
    .map((row) => ({
      epoch: row.publication_epoch,
      members: [...row.published_active_node_ids].sort(),
    }))
    .sort((left, right) => left.epoch - right.epoch);
}

// The publications table the coordinator reads and persists through; a
// persisted row is a committed row of the cache.
function createPublicationsOwner(cache) {
  return {
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
  };
}

// One node process's publication owner over the cluster's durable rows; a
// restart is a new coordinator over the same rows.
function startPublicationOwner(cache) {
  return new MembershipPublicationCoordinator({
    nodeId: SEED_NODE_ID,
    systemTableCache: cache,
    controlPlanePublicationsOwner: createPublicationsOwner(cache),
    logger: QUIET_LOGGER,
    now: () => NOW_MS,
  });
}

test('no epoch is published without a member: formation defers until the ' +
  'READY heartbeat commits, restart does not reintroduce it, later changes ' +
  'publish', async () => {
  const cache = new SystemTableCache();
  const coordinator = startPublicationOwner(cache);

  // Formation: the seed is registered, its READY heartbeat not committed.
  commitNodeRow(cache, SEED_NODE_ID, STATE.CONNECTED);
  const beforeReady = await coordinator.reconcileClusterMembership({});
  assert.deepEqual(publicationRows(cache), [],
    'no epoch is published before the seed\'s READY heartbeat commits');
  assert.equal(beforeReady.deferred, true,
    'the reconcile answers a typed deferral');
  assert.equal(beforeReady.reason,
    MEMBERSHIP_RECONCILE.EMPTY_PUBLICATION_CANDIDATE_REASON,
    'the deferral names why: the candidate has no member');

  // The READY heartbeat commits; its wake runs the reconcile.
  commitNodeRow(cache, SEED_NODE_ID, STATE.READY);
  await coordinator.reconcileClusterMembership({});
  assert.deepEqual(publicationRows(cache),
    [{epoch: 1, members: [SEED_NODE_ID]}], 'the first epoch names the seed');

  // Restart: a new publication owner over the same durable rows, the seed
  // registered again and its READY heartbeat not yet committed.
  commitNodeRow(cache, SEED_NODE_ID, STATE.CONNECTED);
  const restarted = startPublicationOwner(cache);
  await restarted.reconcileClusterMembership({});
  assert.deepEqual(publicationRows(cache),
    [{epoch: 1, members: [SEED_NODE_ID]}],
    'a restart does not publish an epoch without a member');

  // The restarted seed's READY heartbeat and a joiner's commit: a
  // membership change, published as the next epoch.
  commitNodeRow(cache, SEED_NODE_ID, STATE.READY);
  commitNodeRow(cache, JOINER_NODE_ID, STATE.READY);
  await restarted.reconcileClusterMembership({});
  assert.deepEqual(publicationRows(cache).at(-1),
    {epoch: 2, members: [JOINER_NODE_ID, SEED_NODE_ID].sort()},
    'a later membership change is published as the next epoch');
});

function publishedRow(epoch, nodeIds) {
  return buildMembershipPublicationRow({
    candidate: {
      publicationEpoch: epoch,
      publishedActiveNodeIds: nodeIds,
      publisherNodeId: SEED_NODE_ID,
      requiredAckNodeIds: nodeIds,
      acknowledgedNodeIds: nodeIds,
    },
    status: MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
    nowMs: NOW_MS + epoch,
    publicationId: `membership-publication-${epoch}`,
  });
}

// One cache, read by the rebalancer (through the real publication
// coordinator's synchronous accessors) and by the snapshot owner over the
// cache's rows: the two must give one answer.
function readBothReaders(rows) {
  const cache = new SystemTableCache();
  for (const row of rows) {
    cache.applySystemTableChange(
      TABLES.CONTROL_PLANE_PUBLICATIONS, CDC_OPERATIONS.INSERT, row);
  }
  const controlPlaneReadinessService = {
    ...createMockControlPlaneReadinessService({systemTableCache: cache}),
    membershipPublicationService: startPublicationOwner(cache),
  };
  const rebalancer = createTestRebalancer({
    systemTableCache: cache, controlPlaneReadinessService,
  });
  const rebalancerSet = rebalancer.getPublishedActiveNodeIdSet();
  const ownerIds = resolvePublishedActiveNodeIds({
    publicationRows: cache.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS) || [],
  });
  rebalancer.shutdown();
  return {
    rebalancer: rebalancerSet === null ? null : [...rebalancerSet].sort(),
    owner: ownerIds === null ? null : [...ownerIds].sort(),
  };
}

test('the rebalancer and the publication snapshot owner agree on every ' +
  'publication state', () => {
  // An empty published row is durable state a pre-fix owner could write, so
  // a replay can still present it.
  const emptied = readBothReaders([
    publishedRow(1, [DEPARTED_NODE_ID]),
    publishedRow(2, []),
  ]);
  assert.deepEqual(emptied.rebalancer, emptied.owner,
    'a published empty member list: the rebalancer gives the snapshot ' +
    'owner\'s answer');

  assert.deepEqual(readBothReaders([]), {rebalancer: null, owner: null},
    'no publication: both read no published membership');
  assert.deepEqual(readBothReaders([publishedRow(1, [SEED_NODE_ID])]),
    {rebalancer: [SEED_NODE_ID], owner: [SEED_NODE_ID]},
    'published members: both read the members');
});
