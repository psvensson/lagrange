import {test} from '../../src/test-helpers/tap.js';
import {
  MEMBERSHIP_EPOCH_FENCE_STATE,
  MEMBERSHIP_EPOCH_REASON_CODE,
  MEMBERSHIP_EPOCH_SNAPSHOT_AVAILABILITY_STATE,
  MEMBERSHIP_EPOCH_SOURCE_STATE,
  buildMembershipEpochFence,
  buildMembershipEpochSnapshot,
  isMembershipEpochFenceCurrent,
} from '../../src/control-plane/membership-epoch-contract.js';
import {
  buildMembershipPublicationEvidenceSnapshot,
  deriveMembershipPublicationCandidate,
} from '../../src/control-plane/membership-publication-planning-evidence.js';

const TEST_PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const TEST_NODE_STATUS_ACTIVE = 'active';
const TEST_NODE_CONNECTION_READY = 'ready';
const TEST_TRANSPORT_WS = 'ws';
const TEST_ENDPOINT_STATUS_ACTIVE = 'active';
const TEST_ENDPOINT_SUFFIX = '-ws';
const TEST_ENDPOINT_ADDRESS = 'ws://node-1:8082';
const TEST_PUBLISHER_NODE_ID = 'seed-node';
const TEST_NODE_ONE_ID = 'node-1';
const TEST_PUBLICATION_EPOCH_CURRENT = 5;
const TEST_PUBLICATION_EPOCH_STALE = 4;
const TEST_PUBLICATION_EPOCH_FUTURE = 6;
const TEST_LATEST_PUBLICATION_EPOCH = 7;
const TEST_SOURCE_TOPOLOGY_EPOCH = 11;
const TEST_SOURCE_SNAPSHOT_VERSION = 19;
const TEST_EVIDENCE_TOPOLOGY_EPOCH = 23;
const TEST_EVIDENCE_SNAPSHOT_VERSION = 37;
const TEST_READY_LEASE_EXPIRES_AT = 5000;

function buildPublishedMembershipRow(options = {}) {
  return {
    publication_epoch: options.publicationEpoch || TEST_LATEST_PUBLICATION_EPOCH,
    status: TEST_PUBLICATION_STATUS_PUBLISHED,
    source_topology_epoch: options.sourceTopologyEpoch || TEST_SOURCE_TOPOLOGY_EPOCH,
    source_snapshot_version:
      options.sourceSnapshotVersion || TEST_SOURCE_SNAPSHOT_VERSION,
    published_active_node_ids: [TEST_NODE_ONE_ID],
    required_ack_node_ids: [TEST_NODE_ONE_ID],
    acknowledged_node_ids: [TEST_NODE_ONE_ID],
  };
}

function buildSingleNodePlanningOptions() {
  const latestPublishedPublicationRow = buildPublishedMembershipRow();
  return {
    publisherNodeId: TEST_PUBLISHER_NODE_ID,
    sourceTopologyEpoch: TEST_SOURCE_TOPOLOGY_EPOCH,
    sourceSnapshotVersion: TEST_SOURCE_SNAPSHOT_VERSION,
    latestPublicationRow: latestPublishedPublicationRow,
    latestPublishedPublicationRow,
    nodeRows: [
      {
        node_id: TEST_NODE_ONE_ID,
        status: TEST_NODE_STATUS_ACTIVE,
        connection_state: TEST_NODE_CONNECTION_READY,
        ready_lease_expires_at: TEST_READY_LEASE_EXPIRES_AT,
      },
    ],
    readinessEntries: [
      {
        nodeId: TEST_NODE_ONE_ID,
        dimensions: {
          clusterMemberHealthy: true,
        },
      },
    ],
    nodeEndpointRows: [
      {
        endpoint_id: `${TEST_NODE_ONE_ID}${TEST_ENDPOINT_SUFFIX}`,
        node_id: TEST_NODE_ONE_ID,
        transport_type: TEST_TRANSPORT_WS,
        status: TEST_ENDPOINT_STATUS_ACTIVE,
        address: TEST_ENDPOINT_ADDRESS,
      },
    ],
  };
}

test('buildMembershipEpochFence classifies current stale future and unknown publication epochs',
  async (t) => {
    const membershipEpochSnapshot = buildMembershipEpochSnapshot({
      latestPublishedPublicationRow: {
        publication_epoch: TEST_PUBLICATION_EPOCH_CURRENT,
      },
    });

    const currentFence = buildMembershipEpochFence({
      membershipEpochSnapshot,
      publicationEpoch: TEST_PUBLICATION_EPOCH_CURRENT,
    });
    t.equal(currentFence.state, MEMBERSHIP_EPOCH_FENCE_STATE.CURRENT);
    t.same(currentFence.reasonCodes, [
      MEMBERSHIP_EPOCH_REASON_CODE.OBSERVED_EPOCH_CURRENT,
    ]);
    t.equal(isMembershipEpochFenceCurrent(currentFence), true);

    const staleFence = buildMembershipEpochFence({
      membershipEpochSnapshot,
      publicationEpoch: TEST_PUBLICATION_EPOCH_STALE,
    });
    t.equal(staleFence.state, MEMBERSHIP_EPOCH_FENCE_STATE.STALE);
    t.same(staleFence.reasonCodes, [
      MEMBERSHIP_EPOCH_REASON_CODE.OBSERVED_EPOCH_STALE,
    ]);

    const futureFence = buildMembershipEpochFence({
      membershipEpochSnapshot,
      publicationEpoch: TEST_PUBLICATION_EPOCH_FUTURE,
    });
    t.equal(futureFence.state, MEMBERSHIP_EPOCH_FENCE_STATE.FUTURE);
    t.same(futureFence.reasonCodes, [
      MEMBERSHIP_EPOCH_REASON_CODE.OBSERVED_EPOCH_FUTURE,
    ]);

    const unknownFence = buildMembershipEpochFence({
      membershipEpochSnapshot: buildMembershipEpochSnapshot({
        sourceTopologyEpoch: TEST_SOURCE_TOPOLOGY_EPOCH,
      }),
      publicationEpoch: TEST_PUBLICATION_EPOCH_CURRENT,
    });
    t.equal(unknownFence.state, MEMBERSHIP_EPOCH_FENCE_STATE.UNKNOWN);
    t.same(unknownFence.reasonCodes, [
      MEMBERSHIP_EPOCH_REASON_CODE.SNAPSHOT_UNAVAILABLE,
    ]);
  });

test('buildMembershipPublicationEvidenceSnapshot exposes canonical membership epoch snapshot',
  async (t) => {
    const evidenceSnapshot = buildMembershipPublicationEvidenceSnapshot({
      latestPublicationRow: buildPublishedMembershipRow({
        publicationEpoch: TEST_PUBLICATION_EPOCH_FUTURE,
      }),
      latestPublishedPublicationRow: buildPublishedMembershipRow({
        publicationEpoch: TEST_PUBLICATION_EPOCH_CURRENT,
      }),
      sourceTopologyEpoch: TEST_EVIDENCE_TOPOLOGY_EPOCH,
      sourceSnapshotVersion: TEST_EVIDENCE_SNAPSHOT_VERSION,
    });

    t.match(evidenceSnapshot.membershipEpochSnapshot, {
      availabilityState:
        MEMBERSHIP_EPOCH_SNAPSHOT_AVAILABILITY_STATE.PUBLICATION_AVAILABLE,
      sourceState: MEMBERSHIP_EPOCH_SOURCE_STATE.LATEST_PUBLISHED_PUBLICATION,
      publicationEpoch: TEST_PUBLICATION_EPOCH_CURRENT,
      sourceTopologyEpoch: TEST_EVIDENCE_TOPOLOGY_EPOCH,
      sourceSnapshotVersion: TEST_EVIDENCE_SNAPSHOT_VERSION,
    });
    t.same(evidenceSnapshot.membershipEpochSnapshot.reasonCodes, [
      MEMBERSHIP_EPOCH_REASON_CODE.PUBLICATION_EPOCH_AVAILABLE,
      MEMBERSHIP_EPOCH_REASON_CODE.SOURCE_EVIDENCE_AVAILABLE,
    ]);
  });

test('deriveMembershipPublicationCandidate exposes membership epoch snapshot and fence',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate(
      buildSingleNodePlanningOptions(),
    );

    t.match(candidate.membershipEpochSnapshot, {
      availabilityState:
        MEMBERSHIP_EPOCH_SNAPSHOT_AVAILABILITY_STATE.PUBLICATION_AVAILABLE,
      publicationEpoch: TEST_LATEST_PUBLICATION_EPOCH,
      sourceTopologyEpoch: TEST_SOURCE_TOPOLOGY_EPOCH,
      sourceSnapshotVersion: TEST_SOURCE_SNAPSHOT_VERSION,
    });
    t.match(candidate.membershipEpochFence, {
      state: MEMBERSHIP_EPOCH_FENCE_STATE.CURRENT,
      current: true,
      observedPublicationEpoch: TEST_LATEST_PUBLICATION_EPOCH,
      snapshotPublicationEpoch: TEST_LATEST_PUBLICATION_EPOCH,
    });
  });
