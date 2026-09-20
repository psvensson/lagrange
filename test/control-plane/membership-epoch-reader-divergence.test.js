// AUDIT-WITNESS-KIND: guard-grid
// This file drives owners over constructed states. It proves GUARD
// behaviour, never that a production producer can reach that state.
// Membership-publication-epoch reader divergence, reproduced on the REAL
// owners (quest critical-spread-overflow-budget-audit, receipt
// epoch-reader-divergence-reproduced-on-real-owners).
//
// Two derivations of one fact meet at the spread-cure authorization:
//   - the MINT side reads the planning owner's current published membership
//     epoch (ControlPlaneReadinessService.getCurrentPublishedMembershipEpochSync);
//   - the VALIDATION side, when enforcement supplies one, would read the
//     partition's own selectLatestPublishedMembershipEpoch over the cached
//     control_plane_publications rows.
//
// This file drives both readers over one row set at a time and asserts each
// returned value. It changes nothing and proposes nothing: the candidate
// canonical models are recorded in the epoch-domain inventory, and the choice
// is the owner's.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  MembershipPublicationCoordinatorReads,
} from '../../src/control-plane/membership-publication-coordinator-reads.js';
import {
  selectLatestPublishedMembershipEpoch,
} from '../../src/control-plane/membership-epoch-contract.js';
import {
  evaluateSpreadCureTransitionAuthorization,
} from '../../src/rebalancer/spread-cure-transition-authorization.js';
import {createCache} from './control-plane-readiness-service-test-support.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  EPOCH_INVENTORY_JSON,
  readJsonArtifact,
} from '../rebalancer/overflow-budget-audit-support.js';

if (!ConfigurationManager.getInstance().isInitialized()) {
  ConfigurationManager.getInstance().initialize({});
}
if (!LoggingService.getInstance().isInitialized()) {
  LoggingService.getInstance().initialize({level: 'error'});
}

const PLANNER_NODE_ID = 'node-a';
const PEER_NODE_ID = 'node-b';
const THIRD_NODE_ID = 'node-c';
const MEMBERSHIP_KIND = 'cluster_membership';
const OTHER_KIND = 'other_kind';
const PUBLISHED = 'PUBLISHED';
const ESTABLISHING = 'ESTABLISHING';
const ABANDONED = 'ABANDONED';
const NOW_MS = 5000;
const ROW_CREATED_BASE_MS = 1000;
const PARTITION_NO_ROW_EPOCH = 0;

function publicationRow(
  epoch,
  status,
  nodeIds = [PLANNER_NODE_ID, PEER_NODE_ID],
  kind = MEMBERSHIP_KIND,
) {
  return {
    publication_id: `pub-${kind}-${epoch}`,
    publication_kind: kind,
    publication_epoch: epoch,
    status,
    published_active_node_ids: JSON.stringify(nodeIds),
    required_ack_node_ids: JSON.stringify(nodeIds),
    acknowledged_node_ids: JSON.stringify(status === PUBLISHED ? nodeIds : []),
    created_at: ROW_CREATED_BASE_MS + epoch,
  };
}

// The planning owner's reader, over the REAL publication coordinator reads.
function plannerEpoch(rows) {
  const reads = Object.create(MembershipPublicationCoordinatorReads.prototype);
  reads.systemTableCache = {getAll: () => rows};
  const owner = new ControlPlaneReadinessService({
    nodeId: PLANNER_NODE_ID,
    systemTableCache: createCache(),
    membershipPublicationService: {
      getLatestPublicationForNodeSync: (nodeId, options) =>
        reads.getLatestPublicationForNodeSync(nodeId, options),
    },
    now: () => NOW_MS,
  });
  return owner.getCurrentPublishedMembershipEpochSync(PLANNER_NODE_ID, NOW_MS);
}

// Each case states the rows, both readers' expected values, and what the
// pair means for an authorization minted from the planner's value. `mint`
// null means the planner could not read an epoch, so nothing is minted.
const DIVERGENCE_CASES = Object.freeze([
  {name: 'no publication row at all',
    rows: [], planner: null, partition: PARTITION_NO_ROW_EPOCH,
    verdict: 'planner-unreadable-no-mint'},
  {name: 'one published membership publication',
    rows: [publicationRow(7, PUBLISHED)], planner: 7, partition: 7,
    verdict: 'agree'},
  {name: 'two published membership publications',
    rows: [publicationRow(6, PUBLISHED), publicationRow(7, PUBLISHED)],
    planner: 7, partition: 7, verdict: 'agree'},
  {name: 'a newer publication is establishing',
    rows: [publicationRow(6, PUBLISHED), publicationRow(7, PUBLISHED),
      publicationRow(8, ESTABLISHING)],
    planner: null, partition: 7, verdict: 'planner-unreadable-no-mint'},
  {name: 'the immediately newer publication is establishing',
    rows: [publicationRow(7, PUBLISHED), publicationRow(8, ESTABLISHING)],
    planner: null, partition: 7, verdict: 'planner-unreadable-no-mint'},
  {name: 'a newer publication excludes the planning node',
    rows: [publicationRow(7, PUBLISHED),
      publicationRow(8, PUBLISHED, [PEER_NODE_ID, THIRD_NODE_ID])],
    planner: null, partition: 8, verdict: 'planner-unreadable-no-mint'},
  {name: 'a newer publication of another kind is published',
    rows: [publicationRow(7, PUBLISHED),
      publicationRow(9, PUBLISHED, [PLANNER_NODE_ID], OTHER_KIND)],
    planner: 7, partition: 9, verdict: 'planner-behind-partition'},
  {name: 'a newer publication was abandoned',
    rows: [publicationRow(7, PUBLISHED), publicationRow(8, ABANDONED)],
    planner: null, partition: 7, verdict: 'planner-unreadable-no-mint'},
  {name: 'epoch zero is a real published epoch',
    rows: [publicationRow(0, PUBLISHED)], planner: 0, partition: 0,
    verdict: 'agree'},
  {name: 'a later join publishes a newer membership epoch',
    rows: [publicationRow(7, PUBLISHED),
      publicationRow(8, PUBLISHED,
        [PLANNER_NODE_ID, PEER_NODE_ID, THIRD_NODE_ID])],
    planner: 8, partition: 8, verdict: 'agree'},
]);

const AUTHORIZED_RESULTING_VOTER_COUNT = 5;
const OBSERVED_VOTER_COUNT = 4;
const DESIRED_REPLICATION_FACTOR = 3;
const OPERATION_ID = 'op-epoch-divergence';
const LOCAL_NODE_ID = 'node-learner';
const LOCAL_REPLICA_ID = 'schema_operations-p1-r5';
const STALE_REASON = 'authorization_membership_generation_stale';
const HONOURED_REASON = 'authorization_honoured';

function authorizationMintedAt(observedMembershipEpoch) {
  return Object.freeze({
    state: 'present',
    raw: null,
    authorization: Object.freeze({
      intent: 'critical_spread_cure',
      desiredReplicationFactor: DESIRED_REPLICATION_FACTOR,
      observedMembershipEpoch,
      observedVoterCount: OBSERVED_VOTER_COUNT,
      authorizedResultingVoterCount: AUTHORIZED_RESULTING_VOTER_COUNT,
      destinationNodeId: LOCAL_NODE_ID,
      destinationReplicaId: LOCAL_REPLICA_ID,
      operationId: OPERATION_ID,
    }),
  });
}

function evaluateAgainstPartitionEpoch(mintedEpoch, partitionEpoch) {
  return evaluateSpreadCureTransitionAuthorization({
    binding: authorizationMintedAt(mintedEpoch),
    operationId: OPERATION_ID,
    localNodeId: LOCAL_NODE_ID,
    localReplicaId: LOCAL_REPLICA_ID,
    partitionDesiredReplicationFactor: DESIRED_REPLICATION_FACTOR,
    partitionMembershipEpoch: partitionEpoch,
    votersAfterPromotion: AUTHORIZED_RESULTING_VOTER_COUNT,
  });
}

test('the two epoch readers diverge on real owners over the stated row sets',
  () => {
    const inventory = readJsonArtifact(EPOCH_INVENTORY_JSON);
    const recorded = new Map(
      inventory.readerDivergence.map((entry) => [entry.name, entry]),
    );
    assert.equal(recorded.size, DIVERGENCE_CASES.length,
      'the inventory records exactly the measured divergence cases');
    for (const testCase of DIVERGENCE_CASES) {
      const planner = plannerEpoch(testCase.rows);
      const partition = selectLatestPublishedMembershipEpoch(testCase.rows);
      assert.equal(planner, testCase.planner,
        `planner-side epoch on: ${testCase.name}`);
      assert.equal(partition, testCase.partition,
        `partition-side epoch on: ${testCase.name}`);
      const entry = recorded.get(testCase.name);
      assert.ok(entry, `the inventory carries the case: ${testCase.name}`);
      assert.equal(entry.plannerEpoch, testCase.planner,
        `inventory planner value on: ${testCase.name}`);
      assert.equal(entry.partitionEpoch, testCase.partition,
        `inventory partition value on: ${testCase.name}`);
      assert.equal(entry.verdict, testCase.verdict,
        `inventory verdict on: ${testCase.name}`);
    }
    // The one row set where the mint happens and the partition already reads
    // higher: a valid authorization would read stale. The refusal is false —
    // nothing about the membership the mint observed has changed.
    const falseStale = DIVERGENCE_CASES.find((testCase) =>
      testCase.verdict === 'planner-behind-partition');
    const falseStaleOutcome =
      evaluateAgainstPartitionEpoch(falseStale.planner, falseStale.partition);
    assert.equal(falseStaleOutcome.reason, STALE_REASON,
      'the kind-filtered planner reader mints an authorization the ' +
        'partition reader would call stale');
    // The same shape after any later join: the mint is at 7, the partition
    // reads 8, so a promotion-time fence refuses every authorization minted
    // before the join.
    const laterJoin = DIVERGENCE_CASES.find((testCase) =>
      testCase.name === 'a later join publishes a newer membership epoch');
    assert.equal(evaluateAgainstPartitionEpoch(7, laterJoin.partition).reason,
      STALE_REASON,
      'an authorization minted before a later join reads stale after it');
    assert.equal(
      evaluateAgainstPartitionEpoch(laterJoin.planner, laterJoin.partition)
        .reason,
      HONOURED_REASON,
      'an authorization minted at the joined epoch is honoured');
  });
