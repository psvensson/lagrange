// The first membership publication names its first members, and what a
// published member list means has one owner.
//
// Witnessed on the rs-raft cutover (membership-consistency test 2): the seed's
// first reconcile ran before its READY heartbeat committed, derived a
// candidate with no member, and published epoch 1 with an empty member set.
// Two readers then disagreed about that row: the rebalancer normalized the
// row itself and read "published, nobody" (an empty set), while the
// publication snapshot owner (resolvePublishedActiveNodeIds) read "no
// published membership" (null).
//
// The publication owner defers an empty FIRST candidate with a typed reason;
// the READY heartbeat wakes the reconcile, and epoch 1 names the seed. An
// empty candidate once an epoch exists is a real departure and is published.
// The rebalancer picks the published row and asks the snapshot owner what its
// member list means. Every collaborator here is the real owner over a real
// cache; the planning snapshot is the reconcile's own input seam.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {SystemTableCache, CDC_OPERATIONS} from
  '../../src/cache/system-table-cache.js';
import {
  MembershipPublicationCoordinator,
} from '../../src/control-plane/membership-publication-coordinator.js';
import {
  EMPTY_FIRST_PUBLICATION_CANDIDATE_REASON,
} from '../../src/control-plane/membership-publication-coordinator-reconcile.js';
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
const DEPARTED_NODE_ID = 'departed-node';
const READY_LEASE_MS = 10000;
const NOW_MS = 1000;
const QUIET_LOGGER = Object.freeze({warn() {}, info() {}, debug() {}, error() {}});

function seedPlanningSnapshot(connectionState) {
  const ready = connectionState === STATE.READY;
  return {
    nodeRows: [{
      node_id: SEED_NODE_ID,
      status: NODE_STATUS.ACTIVE,
      connection_state: connectionState,
      ready_lease_expires_at: ready ? NOW_MS + READY_LEASE_MS : null,
    }],
    readinessEntries: ready ? [{
      nodeId: SEED_NODE_ID,
      dimensions: {
        clusterMemberHealthy: true,
        controlPlaneRecoveryEligible: true,
        controlPlaneWritable: true,
        controlPlanePublished: false,
      },
    }] : [],
    serviceRows: [],
    replicaOperationRows: [],
  };
}

// The publications owner over an in-memory table: the reconcile reads its
// rows and persists through it.
function composePublicationOwner() {
  const rows = [];
  const writes = [];
  const owner = {
    async listPublicationsFromCache() {
      return rows.slice();
    },
    async listPublications() {
      return rows.slice();
    },
    async getPublication(publicationId) {
      return rows.find((row) => row.publication_id === publicationId) || null;
    },
    async upsertPublication(row) {
      writes.push(row);
      const index = rows.findIndex((existing) =>
        existing.publication_id === row.publication_id);
      if (index >= 0) {
        rows[index] = row;
      } else {
        rows.push(row);
      }
      return {success: true};
    },
  };
  const coordinator = new MembershipPublicationCoordinator({
    nodeId: SEED_NODE_ID,
    systemTableCache: new SystemTableCache(),
    controlPlanePublicationsOwner: owner,
    logger: QUIET_LOGGER,
    now: () => NOW_MS,
  });
  return {coordinator, writes};
}

test('the first publication defers while its candidate has no member, and ' +
  'names the seed once its READY heartbeat is visible', async () => {
  const {coordinator, writes} = composePublicationOwner();

  const beforeReady = await coordinator.reconcileClusterMembership({
    planningSnapshot: seedPlanningSnapshot(STATE.CONNECTED),
  });
  assert.equal(writes.length, 0,
    'no epoch is published with an empty member set');
  assert.equal(beforeReady.deferred, true,
    'the reconcile answers a typed deferral');
  assert.equal(beforeReady.reason, EMPTY_FIRST_PUBLICATION_CANDIDATE_REASON,
    'the deferral names why: the first candidate has no member');

  const afterReady = await coordinator.reconcileClusterMembership({
    planningSnapshot: seedPlanningSnapshot(STATE.READY),
  });
  assert.equal(afterReady.deferred, undefined,
    'a candidate with a member is not deferred');
  assert.deepEqual(writes.map((row) => row.published_active_node_ids),
    [[SEED_NODE_ID]], 'epoch 1 names the seed');
  assert.equal(afterReady.publicationRow.publicationEpoch, 1,
    'the seed\'s publication is the first epoch');
});

test('an empty candidate once an epoch exists is a departure and is ' +
  'published', async () => {
  const {coordinator, writes} = composePublicationOwner();
  await coordinator.reconcileClusterMembership({
    planningSnapshot: seedPlanningSnapshot(STATE.READY),
  });

  const afterDeparture = await coordinator.reconcileClusterMembership({
    planningSnapshot: seedPlanningSnapshot(STATE.CONNECTED),
  });
  assert.equal(afterDeparture.deferred, undefined,
    'only the first publication defers an empty candidate');
  assert.deepEqual(writes.at(-1).published_active_node_ids, [],
    'the departure is published');
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
function readBothReaders(publicationRows) {
  const cache = new SystemTableCache();
  for (const row of publicationRows) {
    cache.applySystemTableChange(
      TABLES.CONTROL_PLANE_PUBLICATIONS, CDC_OPERATIONS.INSERT, row);
  }
  const controlPlaneReadinessService = {
    ...createMockControlPlaneReadinessService({systemTableCache: cache}),
    membershipPublicationService: new MembershipPublicationCoordinator({
      nodeId: SEED_NODE_ID, systemTableCache: cache, logger: QUIET_LOGGER,
    }),
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
  const none = readBothReaders([]);
  assert.deepEqual(none, {rebalancer: null, owner: null},
    'no publication: both read no published membership');

  const members = readBothReaders([publishedRow(1, [SEED_NODE_ID])]);
  assert.deepEqual(members,
    {rebalancer: [SEED_NODE_ID], owner: [SEED_NODE_ID]},
    'published members: both read the members');

  const emptiedByDeparture = readBothReaders([
    publishedRow(1, [DEPARTED_NODE_ID]),
    publishedRow(2, []),
  ]);
  assert.deepEqual(emptiedByDeparture.rebalancer, emptiedByDeparture.owner,
    'published empty after a real departure: the rebalancer gives the ' +
    'snapshot owner\'s answer');
});
