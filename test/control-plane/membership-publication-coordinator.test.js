import {test} from '../../src/test-helpers/tap.js';
import {
  acknowledgeMembershipPublication,
  buildMembershipPublicationRow,
  deriveMembershipPublicationCandidate,
  MembershipPublicationCoordinator,
} from '../../src/control-plane/membership-publication-coordinator.js';
import {
  MEMBERSHIP_LIFECYCLE_STATE,
  isValidMembershipLifecycleTransition,
} from '../../src/control-plane/membership-lifecycle-constants.js';
import {ControlPlanePublicationsOwner} from
  '../../src/control-plane/owners/control-plane-publications-owner.js';

test('membership lifecycle model encodes the hard-cutover publication transitions',
  async (t) => {
    t.equal(
      isValidMembershipLifecycleTransition(
        MEMBERSHIP_LIFECYCLE_STATE.CAUGHT_UP,
        MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING,
      ),
      true,
      'caught-up members should be allowed to enter the publish-pending state',
    );
    t.equal(
      isValidMembershipLifecycleTransition(
        MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING,
        MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE,
      ),
      true,
      'publish-pending members should be allowed to become published active',
    );
    t.equal(
      isValidMembershipLifecycleTransition(
        MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE,
        MEMBERSHIP_LIFECYCLE_STATE.ADMITTED,
      ),
      false,
      'published-active members should not regress to admitted',
    );
  });

test('deriveMembershipPublicationCandidate increments publication epochs monotonically when the active membership changes',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      sourceTopologyEpoch: 11,
      sourceSnapshotVersion: 19,
      latestPublicationRow: {
        publication_epoch: 7,
        published_active_node_ids: ['node-1'],
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {nodeId: 'node-1', dimensions: {clusterMemberHealthy: true}},
        {nodeId: 'node-2', dimensions: {clusterMemberHealthy: true}},
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
      ],
      nowMs: 1000,
    });

    t.equal(
      candidate.publicationEpoch,
      8,
      'publication epochs should advance from the last durable epoch when the canonical active set changes',
    );
    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1', 'node-2'],
      'the candidate should carry the canonical active node set forward in sorted order',
    );
    t.match(
      candidate.membershipLifecycleSummary,
      {
        lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING,
        publishedActiveNodeIds: ['node-1', 'node-2'],
        projectedServingNodeIds: ['node-1', 'node-2'],
        locallyEligibleNodeIds: ['node-1', 'node-2'],
        memberStatesByNodeId: {
          'node-1': 'serving',
          'node-2': 'joining',
        },
      },
      'new publication candidates should carry an explicit publish-pending lifecycle summary',
    );
  });

test('deriveMembershipPublicationCandidate retains healthy connected nodes when endpoint metadata lags',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      latestPublicationRow: {
        publication_epoch: 7,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1', 'node-2'],
        priority_partition_summary: {
          satisfied: false,
          requiredDistinctNodeCount: 3,
          readyEligibleNodeCount: 2,
          totalPriorityPartitionCount: 5,
          missingPartitionIds: ['control_plane_publications-p1'],
          blockedPartitions: [],
        },
      },
      latestPublishedPublicationRow: {
        publication_epoch: 7,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1', 'node-2'],
        priority_partition_summary: {
          satisfied: false,
          requiredDistinctNodeCount: 3,
          readyEligibleNodeCount: 2,
          totalPriorityPartitionCount: 5,
          missingPartitionIds: ['control_plane_publications-p1'],
          blockedPartitions: [],
        },
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          nodeEvidence: {
            transportConnected: true,
          },
          dimensions: {clusterMemberHealthy: true},
        },
        {
          nodeId: 'node-2',
          nodeEvidence: {
            transportConnected: true,
          },
          dimensions: {clusterMemberHealthy: true},
        },
        {
          nodeId: 'node-3',
          nodeEvidence: {
            transportConnected: true,
          },
          dimensions: {
            clusterMemberHealthy: true,
            controlPlaneRecoveryEligible: true,
          },
        },
      ],
      connectedNodeIds: ['node-3'],
      nowMs: 1000,
    });

    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1', 'node-2', 'node-3'],
      'live connected healthy nodes should remain promotable until endpoint metadata catches up',
    );
    t.match(
      candidate.membershipLifecycleSummary,
      {
        projectedServingNodeIds: ['node-1', 'node-2', 'node-3'],
        locallyEligibleNodeIds: ['node-1', 'node-2', 'node-3'],
      },
      'lifecycle diagnostics should preserve the widened connected-node projection',
    );
  });

test('deriveMembershipPublicationCandidate ignores stale published membership when deriving the next active set',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      sourceTopologyEpoch: 11,
      sourceSnapshotVersion: 19,
      latestPublicationRow: {
        publication_epoch: 7,
        published_active_node_ids: ['node-1'],
        required_ack_node_ids: ['node-1'],
        acknowledged_node_ids: ['node-1'],
        status: 'PUBLISHED',
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {nodeId: 'node-1', dimensions: {clusterMemberHealthy: true}},
        {nodeId: 'node-2', dimensions: {clusterMemberHealthy: true}},
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
      ],
      nowMs: 1000,
    });

    t.equal(
      candidate.changed,
      true,
      'a stale published membership row should not suppress detection of newly active members',
    );
    t.equal(
      candidate.publicationEpoch,
      8,
      'the next publication epoch should advance from the stale published epoch',
    );
    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1', 'node-2'],
      'the next publication candidate should be derived from current active members instead of the stale published set',
    );
  });

test('deriveMembershipPublicationCandidate promotes healthy projected members while publication acknowledgements are still pending',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      latestPublicationRow: {
        publication_epoch: 7,
        status: 'ACK_PENDING',
        published_active_node_ids: ['node-1', 'node-2'],
        required_ack_node_ids: ['node-1', 'node-2'],
        acknowledged_node_ids: ['node-1'],
      },
      latestPublishedPublicationRow: {
        publication_epoch: 6,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1', 'node-2'],
        required_ack_node_ids: ['node-1', 'node-2'],
        acknowledged_node_ids: ['node-1', 'node-2'],
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-3',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-3',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
        {
          endpoint_id: 'node-3-ws',
          node_id: 'node-3',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-3:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
        {service_id: 'svc-3', node_id: 'node-3', status: 'active'},
      ],
      nowMs: 1000,
    });

    t.equal(
      candidate.publicationEpoch,
      8,
      'convergence-time promotions should advance the publication epoch from the latest durable epoch',
    );
    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1', 'node-2', 'node-3'],
      'healthy projected members should be promoted even while the current publication epoch is still awaiting acknowledgements',
    );
    t.match(
      candidate.membershipLifecycleSummary,
      {
        lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING,
        publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
        memberStatesByNodeId: {
          'node-1': 'serving',
          'node-2': 'serving',
          'node-3': 'joining',
        },
      },
      'the promoted member should remain publish-pending while the new epoch converges',
    );
  });

test('deriveMembershipPublicationCandidate promotes recovery-eligible projected members while publication is not converged',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      latestPublicationRow: {
        publication_epoch: 7,
        status: 'ACK_PENDING',
        published_active_node_ids: ['node-1', 'node-2'],
        required_ack_node_ids: ['node-1', 'node-2'],
        acknowledged_node_ids: ['node-1'],
      },
      latestPublishedPublicationRow: {
        publication_epoch: 6,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1', 'node-2'],
        required_ack_node_ids: ['node-1', 'node-2'],
        acknowledged_node_ids: ['node-1', 'node-2'],
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-3',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-3',
          dimensions: {
            processAlive: false,
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: false,
            serveEligible: false,
          },
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
        {
          endpoint_id: 'node-3-ws',
          node_id: 'node-3',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-3:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
        {service_id: 'svc-3', node_id: 'node-3', status: 'active'},
      ],
      nowMs: 1000,
    });

    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1', 'node-2', 'node-3'],
      'ack-pending convergence should accept projected members that are recovery-eligible even before full traffic eligibility converges',
    );
    t.equal(
      candidate.membershipLifecycleSummary?.lifecycleState,
      MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING,
      'promoted recovery-eligible members should stay publish-pending until acknowledgements close the new epoch',
    );
  });

test('deriveMembershipPublicationCandidate does not block recovery-eligible promotion while recovery epochs are open',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      latestPublicationRow: {
        publication_epoch: 7,
        status: 'ACK_PENDING',
        published_active_node_ids: ['node-1'],
        required_ack_node_ids: ['node-1'],
        acknowledged_node_ids: ['node-1'],
      },
      latestPublishedPublicationRow: {
        publication_epoch: 6,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1'],
        required_ack_node_ids: ['node-1'],
        acknowledged_node_ids: ['node-1'],
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-3',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            processAlive: false,
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: false,
            serveEligible: false,
          },
        },
        {
          nodeId: 'node-3',
          dimensions: {
            processAlive: false,
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: false,
            serveEligible: false,
          },
        },
      ],
      recoveryEpochsByNodeId: {
        'node-2': [
          {
            epochId: 'node-2:1',
            open: true,
          },
        ],
        'node-3': [
          {
            epochId: 'node-3:1',
            open: true,
          },
        ],
      },
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
        {
          endpoint_id: 'node-3-ws',
          node_id: 'node-3',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-3:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
        {service_id: 'svc-3', node_id: 'node-3', status: 'active'},
      ],
      nowMs: 1000,
    });

    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1', 'node-2', 'node-3'],
      'open recovery epochs should not prevent promotion once recovery-eligible readiness is true',
    );
    t.match(
      candidate.membershipLifecycleSummary?.memberStatesByNodeId,
      {
        'node-2': 'catching_up',
        'node-3': 'catching_up',
      },
      'promoted members with open recovery epochs should remain marked as catching_up until convergence closes',
    );
  });

test('deriveMembershipPublicationCandidate promotes recovery-eligible joiners when publication health is still pending',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      latestPublicationRow: {
        publication_epoch: 17,
        status: 'ACK_PENDING',
        published_active_node_ids: ['node-1'],
        required_ack_node_ids: ['node-1'],
        acknowledged_node_ids: ['node-1'],
      },
      latestPublishedPublicationRow: {
        publication_epoch: 16,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1'],
        required_ack_node_ids: ['node-1'],
        acknowledged_node_ids: ['node-1'],
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            clusterMemberHealthy: false,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: false,
            repairEligible: false,
            serveEligible: false,
          },
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
      ],
      nowMs: 1000,
    });

    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1', 'node-2'],
      'ack-pending convergence should not deadlock on clusterMemberHealthy when controlPlaneRecoveryEligible is already true',
    );
    t.match(
      candidate.membershipLifecycleSummary?.memberStatesByNodeId,
      {
        'node-1': 'serving',
        'node-2': 'joining',
      },
      'recovery-eligible joiners should remain lifecycle-visible while the publication epoch converges',
    );
    t.match(
      candidate.membershipLifecycleSummary?.projectionDiagnostics,
      {
        readinessDecisionMode: 'cluster_member_or_recovery_eligible',
        readinessDecisionDimensions: [
          'clusterMemberHealthy',
          'controlPlaneRecoveryEligible',
        ],
        recoveryEligibleProjectionEnabled: true,
        recoveryEligibleIncludedNodeIds: ['node-2'],
        readinessExcludedNodeIds: [],
        clusterMemberUnhealthyExcludedNodeIds: [],
      },
      'membership lifecycle diagnostics should capture that projection included the joiner via recovery eligibility',
    );
  });

test('deriveMembershipPublicationCandidate reopens a stale published membership for recovery-eligible joiners',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      latestPublicationRow: {
        publication_epoch: 17,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1'],
        required_ack_node_ids: ['node-1'],
        acknowledged_node_ids: ['node-1'],
      },
      latestPublishedPublicationRow: {
        publication_epoch: 17,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1'],
        required_ack_node_ids: ['node-1'],
        acknowledged_node_ids: ['node-1'],
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: true,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            clusterMemberHealthy: false,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: false,
            repairEligible: false,
            serveEligible: false,
          },
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
      ],
      nowMs: 1000,
    });

    t.equal(
      candidate.changed,
      true,
      'a stale published baseline should reopen when recovery-eligible joiners are visible',
    );
    t.equal(
      candidate.publicationEpoch,
      18,
      'the reopened publication should advance from the last published epoch',
    );
    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1', 'node-2'],
      'recovery-eligible joiners should be promoted even when the latest epoch is currently published',
    );
    t.match(
      candidate.membershipLifecycleSummary?.projectionDiagnostics,
      {
        readinessDecisionMode: 'cluster_member_or_recovery_eligible',
        recoveryEligibleProjectionEnabled: true,
        recoveryEligibleIncludedNodeIds: ['node-2'],
      },
      'the reopened publication should record that recovery eligibility drove the projection',
    );
    t.equal(
      candidate.membershipLifecycleSummary?.recoveryProtocolState,
      'publication_pending',
      'the reopened publication should expose the shared recovery protocol phase',
    );
    t.match(
      candidate.membershipLifecycleSummary?.participationByNodeId,
      {
        'node-1': {
          state: 'published_active',
        },
        'node-2': {
          state: 'recovery_pending_publish',
          recoverySource: 'recovery_eligible_projection',
        },
      },
      'the publication candidate should preserve canonical node participation states',
    );
  });


test('deriveMembershipPublicationCandidate keeps the latest in-flight publication membership as a convergence floor',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      latestPublicationRow: {
        publication_epoch: 11,
        status: 'ACK_PENDING',
        published_active_node_ids: [
          'node-1',
          'node-2',
          'node-3',
          'node-4',
          'node-5',
        ],
        required_ack_node_ids: [
          'node-1',
          'node-2',
          'node-3',
          'node-4',
          'node-5',
        ],
        acknowledged_node_ids: ['node-1', 'node-2'],
      },
      latestPublishedPublicationRow: {
        publication_epoch: 10,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1'],
        required_ack_node_ids: ['node-1'],
        acknowledged_node_ids: ['node-1'],
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-3',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-4',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-5',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
          },
        },
        {
          nodeId: 'node-3',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
          },
        },
        {
          nodeId: 'node-4',
          dimensions: {
            clusterMemberHealthy: false,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
          },
        },
        {
          nodeId: 'node-5',
          dimensions: {
            clusterMemberHealthy: false,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
          },
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
        {
          endpoint_id: 'node-3-ws',
          node_id: 'node-3',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-3:8082',
        },
        {
          endpoint_id: 'node-4-ws',
          node_id: 'node-4',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-4:8082',
        },
        {
          endpoint_id: 'node-5-ws',
          node_id: 'node-5',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-5:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
        {service_id: 'svc-3', node_id: 'node-3', status: 'active'},
        {service_id: 'svc-4', node_id: 'node-4', status: 'active'},
        {service_id: 'svc-5', node_id: 'node-5', status: 'active'},
      ],
      nowMs: 1000,
    });

    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1', 'node-2', 'node-3', 'node-4', 'node-5'],
      'open/ack-pending publication membership should remain the baseline floor during convergence',
    );
    t.same(
      candidate.requiredAckNodeIds,
      ['node-1', 'node-2', 'node-3', 'node-4', 'node-5'],
      'ack requirement should remain aligned with the in-flight publication baseline',
    );
    t.equal(
      candidate.changed,
      false,
      'transient projection regressions should not reopen the epoch with a narrower membership set',
    );
    t.equal(
      candidate.publicationEpoch,
      11,
      'stable convergence floors should keep the current publication epoch until acknowledgements close it',
    );
  });

test('deriveMembershipPublicationCandidate derives the active-node set from authoritative owner rows',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      sourceTopologyEpoch: 12,
      sourceSnapshotVersion: 21,
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-3',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {nodeId: 'node-1', dimensions: {clusterMemberHealthy: true}},
        {nodeId: 'node-2', dimensions: {clusterMemberHealthy: true}},
        {nodeId: 'node-3', dimensions: {clusterMemberHealthy: false}},
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
        {
          endpoint_id: 'node-3-ws',
          node_id: 'node-3',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-3:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
        {service_id: 'svc-3', node_id: 'node-3', status: 'active'},
      ],
      nowMs: 1000,
    });

    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1', 'node-2'],
      'the publication candidate should exclude readiness-unhealthy members even if cache-visible services still exist',
    );
    t.same(
      candidate.requiredAckNodeIds,
      ['node-1', 'node-2'],
      'the acknowledgement set should match the published active-node set for cluster membership publication',
    );
  });

test('deriveMembershipPublicationCandidate does not reopen membership publications when source epochs are unspecified',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      latestPublicationRow: {
        publication_epoch: 7,
        source_topology_epoch: 0,
        source_snapshot_version: 0,
        published_active_node_ids: ['node-1', 'node-2'],
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {nodeId: 'node-1', dimensions: {clusterMemberHealthy: true}},
        {nodeId: 'node-2', dimensions: {clusterMemberHealthy: true}},
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
      ],
      nowMs: 1000,
    });

    t.equal(
      candidate.changed,
      false,
      'missing source epoch metadata should not force a new publication when the active membership is unchanged',
    );
    t.equal(
      candidate.publicationEpoch,
      7,
      'the durable publication epoch should be reused when only unspecified source metadata differs',
    );
  });

test('deriveMembershipPublicationCandidate derives priority spread summary from canonical partition rows',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      latestPublicationRow: {
        publication_epoch: 12,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1', 'node-2', 'node-3'],
        required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
        acknowledged_node_ids: ['node-1', 'node-2', 'node-3'],
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-3',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-3',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
        {
          endpoint_id: 'node-3-ws',
          node_id: 'node-3',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-3:8082',
        },
      ],
      serviceRows: [
        {
          service_id: 'cp-publications-r1',
          node_id: 'node-1',
          partition_id: 'control_plane_publications-p1',
          service_type: 'partition',
          status: 'active',
          raft_role: 'leader',
          address: 'node-1/partition/control_plane_publications-p1-r1',
        },
        {
          service_id: 'cp-publications-r2',
          node_id: 'node-2',
          partition_id: 'control_plane_publications-p1',
          service_type: 'partition',
          status: 'active',
          raft_role: 'follower',
          address: 'node-2/partition/control_plane_publications-p1-r2',
        },
        {
          service_id: 'cp-publications-r3',
          node_id: 'node-3',
          partition_id: 'control_plane_publications-p1',
          service_type: 'partition',
          status: 'active',
          raft_role: 'follower',
          address: 'node-3/partition/control_plane_publications-p1-r3',
        },
        {
          service_id: 'replica-ops-r1',
          node_id: 'node-1',
          partition_id: 'replica_operations-p1',
          service_type: 'partition',
          status: 'active',
          raft_role: 'leader',
          address: 'node-1/partition/replica_operations-p1-r1',
        },
        {
          service_id: 'replica-ops-r2',
          node_id: 'node-1',
          partition_id: 'replica_operations-p1',
          service_type: 'partition',
          status: 'active',
          raft_role: 'follower',
          address: 'node-1/partition/replica_operations-p1-r2',
        },
        {
          service_id: 'replica-ops-r3',
          node_id: 'node-1',
          partition_id: 'replica_operations-p1',
          service_type: 'partition',
          status: 'active',
          raft_role: 'follower',
          address: 'node-1/partition/replica_operations-p1-r3',
        },
      ],
      nowMs: 1000,
    });

    t.match(
      candidate.priorityPartitionSummary,
      {
        satisfied: false,
        requiredDistinctNodeCount: 3,
      },
      'candidate derivation should emit an explicit spread summary for priority control-plane partitions',
    );
    t.same(
      candidate.priorityPartitionSummary?.missingPartitionIds,
      [
        'replica_operations-p1',
        'sql_transaction_participants-p1',
        'sql_transactions-p1',
        'sql_write_operations-p1',
      ],
      'the spread summary should fail closed for concentrated or missing priority partitions',
    );
  });

test('deriveMembershipPublicationCandidate tracks split child priority partitions by table lineage',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      latestPublicationRow: {
        publication_epoch: 12,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1', 'node-2', 'node-3'],
        required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
        acknowledged_node_ids: ['node-1', 'node-2', 'node-3'],
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-3',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-3',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
        {
          endpoint_id: 'node-3-ws',
          node_id: 'node-3',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-3:8082',
        },
      ],
      partitionRows: [
        {
          partition_id: 'control_plane_publications_p_a_left',
          table_id: 'control_plane_publications',
        },
        {
          partition_id: 'control_plane_publications_p_b_right',
          table_id: 'control_plane_publications',
        },
        {partition_id: 'replica_operations-p1', table_id: 'replica_operations'},
        {partition_id: 'sql_transactions-p1', table_id: 'sql_transactions'},
        {
          partition_id: 'sql_transaction_participants-p1',
          table_id: 'sql_transaction_participants',
        },
        {
          partition_id: 'sql_write_operations-p1',
          table_id: 'sql_write_operations',
        },
      ],
      serviceRows: [
        {
          service_id: 'cp-left-r1',
          node_id: 'node-1',
          partition_id: 'control_plane_publications_p_a_left',
          service_type: 'partition',
          status: 'active',
          raft_role: 'leader',
          address: 'node-1/partition/control_plane_publications_p_a_left-r1',
        },
        {
          service_id: 'cp-left-r2',
          node_id: 'node-2',
          partition_id: 'control_plane_publications_p_a_left',
          service_type: 'partition',
          status: 'active',
          raft_role: 'follower',
          address: 'node-2/partition/control_plane_publications_p_a_left-r2',
        },
        {
          service_id: 'cp-left-r3',
          node_id: 'node-3',
          partition_id: 'control_plane_publications_p_a_left',
          service_type: 'partition',
          status: 'active',
          raft_role: 'follower',
          address: 'node-3/partition/control_plane_publications_p_a_left-r3',
        },
        {
          service_id: 'cp-right-r1',
          node_id: 'node-1',
          partition_id: 'control_plane_publications_p_b_right',
          service_type: 'partition',
          status: 'active',
          raft_role: 'leader',
          address: 'node-1/partition/control_plane_publications_p_b_right-r1',
        },
        {
          service_id: 'cp-right-r2',
          node_id: 'node-2',
          partition_id: 'control_plane_publications_p_b_right',
          service_type: 'partition',
          status: 'active',
          raft_role: 'follower',
          address: 'node-2/partition/control_plane_publications_p_b_right-r2',
        },
        {
          service_id: 'cp-right-r3',
          node_id: 'node-3',
          partition_id: 'control_plane_publications_p_b_right',
          service_type: 'partition',
          status: 'active',
          raft_role: 'follower',
          address: 'node-3/partition/control_plane_publications_p_b_right-r3',
        },
        {
          service_id: 'replica-ops-r1',
          node_id: 'node-1',
          partition_id: 'replica_operations-p1',
          service_type: 'partition',
          status: 'active',
          raft_role: 'leader',
          address: 'node-1/partition/replica_operations-p1-r1',
        },
        {
          service_id: 'replica-ops-r2',
          node_id: 'node-2',
          partition_id: 'replica_operations-p1',
          service_type: 'partition',
          status: 'active',
          raft_role: 'follower',
          address: 'node-2/partition/replica_operations-p1-r2',
        },
        {
          service_id: 'replica-ops-r3',
          node_id: 'node-3',
          partition_id: 'replica_operations-p1',
          service_type: 'partition',
          status: 'active',
          raft_role: 'follower',
          address: 'node-3/partition/replica_operations-p1-r3',
        },
        {
          service_id: 'sql-tx-r1',
          node_id: 'node-1',
          partition_id: 'sql_transactions-p1',
          service_type: 'partition',
          status: 'active',
          raft_role: 'leader',
          address: 'node-1/partition/sql_transactions-p1-r1',
        },
        {
          service_id: 'sql-tx-r2',
          node_id: 'node-2',
          partition_id: 'sql_transactions-p1',
          service_type: 'partition',
          status: 'active',
          raft_role: 'follower',
          address: 'node-2/partition/sql_transactions-p1-r2',
        },
        {
          service_id: 'sql-tx-r3',
          node_id: 'node-3',
          partition_id: 'sql_transactions-p1',
          service_type: 'partition',
          status: 'active',
          raft_role: 'follower',
          address: 'node-3/partition/sql_transactions-p1-r3',
        },
        {
          service_id: 'sql-part-r1',
          node_id: 'node-1',
          partition_id: 'sql_transaction_participants-p1',
          service_type: 'partition',
          status: 'active',
          raft_role: 'leader',
          address: 'node-1/partition/sql_transaction_participants-p1-r1',
        },
        {
          service_id: 'sql-part-r2',
          node_id: 'node-2',
          partition_id: 'sql_transaction_participants-p1',
          service_type: 'partition',
          status: 'active',
          raft_role: 'follower',
          address: 'node-2/partition/sql_transaction_participants-p1-r2',
        },
        {
          service_id: 'sql-part-r3',
          node_id: 'node-3',
          partition_id: 'sql_transaction_participants-p1',
          service_type: 'partition',
          status: 'active',
          raft_role: 'follower',
          address: 'node-3/partition/sql_transaction_participants-p1-r3',
        },
        {
          service_id: 'sql-write-r1',
          node_id: 'node-1',
          partition_id: 'sql_write_operations-p1',
          service_type: 'partition',
          status: 'active',
          raft_role: 'leader',
          address: 'node-1/partition/sql_write_operations-p1-r1',
        },
        {
          service_id: 'sql-write-r2',
          node_id: 'node-2',
          partition_id: 'sql_write_operations-p1',
          service_type: 'partition',
          status: 'active',
          raft_role: 'follower',
          address: 'node-2/partition/sql_write_operations-p1-r2',
        },
        {
          service_id: 'sql-write-r3',
          node_id: 'node-3',
          partition_id: 'sql_write_operations-p1',
          service_type: 'partition',
          status: 'active',
          raft_role: 'follower',
          address: 'node-3/partition/sql_write_operations-p1-r3',
        },
      ],
      nowMs: 1000,
    });

    t.match(
      candidate.priorityPartitionSummary,
      {
        satisfied: true,
        requiredDistinctNodeCount: 3,
      },
      'priority spread should evaluate against live split children instead of hard-coded base partition ids',
    );
    t.notOk(
      candidate.priorityPartitionSummary?.missingPartitionIds.includes(
        'control_plane_publications-p1',
      ),
      'split lineage should not reintroduce synthetic missing base partition ids',
    );
  });

test('buildMembershipPublicationRow persists the durable publication shape with transition history',
  async (t) => {
    const publicationRow = buildMembershipPublicationRow({
      publicationId: 'publication-8',
      nowMs: 1500,
      candidate: {
        publicationKind: 'cluster_membership',
        publicationEpoch: 8,
        publisherNodeId: 'seed-node',
        sourceTopologyEpoch: 11,
        sourceSnapshotVersion: 19,
        publishedActiveNodeIds: ['node-1', 'node-2'],
        requiredAckNodeIds: ['node-1', 'node-2'],
        priorityPartitionSummary: {
          satisfied: true,
          missingPartitionIds: [],
        },
        reasonCode: 'authoritative_membership_changed',
      },
    });

    t.match(publicationRow, {
      publication_id: 'publication-8',
      publication_kind: 'cluster_membership',
      publication_epoch: 8,
      publisher_node_id: 'seed-node',
      source_topology_epoch: 11,
      source_snapshot_version: 19,
      status: 'OPEN',
      reason_code: 'authoritative_membership_changed',
      published_active_node_ids: ['node-1', 'node-2'],
      required_ack_node_ids: ['node-1', 'node-2'],
      acknowledged_node_ids: [],
      membership_lifecycle_summary: {
        lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING,
        epochBoundary: 'publication_pending',
        publishedActiveNodeIds: ['node-1', 'node-2'],
        memberStatesByNodeId: {
          'node-1': 'joining',
          'node-2': 'joining',
        },
      },
    });
    t.match(publicationRow.transition_history, [
      {
        state: 'OPEN',
        reasonCode: 'authoritative_membership_changed',
        at: 1500,
      },
    ]);
  });

test('buildMembershipPublicationRow derives a stable publication id from the candidate when none is provided',
  async (t) => {
    const firstPublicationRow = buildMembershipPublicationRow({
      nowMs: 1500,
      candidate: {
        publicationKind: 'cluster_membership',
        publicationEpoch: 8,
        publisherNodeId: 'node-1',
        sourceTopologyEpoch: 11,
        sourceSnapshotVersion: 19,
        publishedActiveNodeIds: ['node-1', 'node-2'],
        requiredAckNodeIds: ['node-1', 'node-2'],
        reasonCode: 'authoritative_membership_changed',
      },
    });
    const secondPublicationRow = buildMembershipPublicationRow({
      nowMs: 1600,
      candidate: {
        publicationKind: 'cluster_membership',
        publicationEpoch: 8,
        publisherNodeId: 'node-2',
        sourceTopologyEpoch: 11,
        sourceSnapshotVersion: 19,
        publishedActiveNodeIds: ['node-2', 'node-1'],
        requiredAckNodeIds: ['node-2', 'node-1'],
        reasonCode: 'authoritative_membership_changed',
      },
    });

    t.equal(
      firstPublicationRow.publication_id,
      secondPublicationRow.publication_id,
      'equivalent membership publication candidates should converge on one durable publication id',
    );
    t.match(
      firstPublicationRow.publication_id,
      /^membership-publication:8:/,
      'derived publication ids should remain readable and epoch-scoped',
    );
  });

test('acknowledgeMembershipPublication is idempotent and only closes the epoch after the final required acknowledgement',
  async (t) => {
    const initialRow = {
      publication_id: 'publication-9',
      publication_kind: 'cluster_membership',
      publication_epoch: 9,
      status: 'ACK_PENDING',
      required_ack_node_ids: ['node-1', 'node-2'],
      acknowledged_node_ids: ['node-1'],
      membership_lifecycle_summary: {
        projectionDiagnostics: {
          readinessDecisionMode: 'cluster_member_or_recovery_eligible',
          recoveryEligibleProjectionEnabled: true,
          recoveryEligibleIncludedNodeIds: ['node-2'],
        },
      },
      transition_history: [
        {state: 'OPEN', at: 1000, reasonCode: 'authoritative_membership_changed'},
        {state: 'ACK_PENDING', at: 1100, reasonCode: 'authoritative_membership_changed'},
      ],
    };

    const duplicateAckRow = acknowledgeMembershipPublication({
      publicationRow: initialRow,
      nodeId: 'node-1',
      nowMs: 1200,
    });
    const completedRow = acknowledgeMembershipPublication({
      publicationRow: duplicateAckRow,
      nodeId: 'node-2',
      nowMs: 1300,
    });

    t.same(
      duplicateAckRow.acknowledged_node_ids,
      ['node-1'],
      'duplicate acknowledgement writes should not duplicate node IDs',
    );
    t.equal(
      duplicateAckRow.status,
      'ACK_PENDING',
      'the epoch should remain open until every required acknowledgement is durable',
    );
    t.same(
      completedRow.acknowledged_node_ids,
      ['node-1', 'node-2'],
      'the final acknowledgement should close the required acknowledgement set',
    );
    t.equal(
      completedRow.status,
      'PUBLISHED',
      'the publication should only become published after the final required acknowledgement',
    );
    t.match(
      completedRow.membership_lifecycle_summary,
      {
        lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE,
        epochBoundary: 'published_membership',
        memberStatesByNodeId: {
          'node-1': 'serving',
          'node-2': 'serving',
        },
        projectionDiagnostics: {
          readinessDecisionMode: 'cluster_member_or_recovery_eligible',
          recoveryEligibleProjectionEnabled: true,
          recoveryEligibleIncludedNodeIds: ['node-2'],
        },
      },
      'the lifecycle summary should advance to published-active when the final acknowledgement closes the epoch',
    );
  });

test('acknowledgeMembershipPublication ignores acknowledgements from non-required nodes',
  async (t) => {
    const initialRow = {
      publication_id: 'publication-9',
      publication_kind: 'cluster_membership',
      publication_epoch: 9,
      status: 'ACK_PENDING',
      required_ack_node_ids: ['node-1', 'node-2'],
      acknowledged_node_ids: ['node-1'],
      transition_history: [
        {state: 'OPEN', at: 1000, reasonCode: 'authoritative_membership_changed'},
        {state: 'ACK_PENDING', at: 1100, reasonCode: 'authoritative_membership_changed'},
      ],
    };

    const ignoredRow = acknowledgeMembershipPublication({
      publicationRow: initialRow,
      nodeId: 'node-3',
      nowMs: 1200,
    });
    const completedRow = acknowledgeMembershipPublication({
      publicationRow: ignoredRow,
      nodeId: 'node-2',
      nowMs: 1300,
    });

    t.same(
      ignoredRow.acknowledged_node_ids,
      ['node-1'],
      'non-required acknowledgements should not widen the required acknowledgement set',
    );
    t.equal(
      ignoredRow.status,
      'ACK_PENDING',
      'non-required acknowledgements should not close the publication epoch',
    );
    t.same(
      completedRow.acknowledged_node_ids,
      ['node-1', 'node-2'],
      'the publication should still close when the remaining required node acknowledges',
    );
    t.equal(
      completedRow.status,
      'PUBLISHED',
      'required acknowledgements should still close the publication epoch after ignored nodes',
    );
  });

test('deriveMembershipPublicationCandidate freezes the authoritative membership under broad suspicion instead of shrinking it',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      latestPublicationRow: {
        publication_epoch: 15,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1', 'node-2', 'node-3', 'node-4'],
        required_ack_node_ids: ['node-1', 'node-2', 'node-3', 'node-4'],
        acknowledged_node_ids: ['node-1', 'node-2', 'node-3', 'node-4'],
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
      ],
      nowMs: 1000,
    });

    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1', 'node-2', 'node-3', 'node-4'],
      'broad suspicion should retain the last published active-node set',
    );
    t.same(
      candidate.membershipLifecycleSummary.suspectedOrTransitioningNodeIds,
      ['node-2', 'node-3', 'node-4'],
      'suspected published members should be surfaced explicitly instead of being removed immediately',
    );
    t.match(
      candidate.membershipLifecycleSummary.membershipFreeze,
      {
        active: true,
        reasonCode: 'broad_suspicion',
        retainedPublishedNodeIds: ['node-1', 'node-2', 'node-3', 'node-4'],
      },
      'the candidate should record the membership-freeze decision for diagnostics and controller ownership',
    );
  });

test('getLatestPublicationRow accepts publication owner results returned as {rows}',
  async (t) => {
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: 'seed-node',
      controlPlanePublicationsOwner: {
        async listPublications() {
          return {
            rows: [
              {
                publication_id: 'publication-11',
                publication_kind: 'cluster_membership',
                publication_epoch: 11,
                published_active_node_ids: ['node-1', 'node-2'],
                required_ack_node_ids: ['node-1', 'node-2'],
                status: 'PUBLISHED',
              },
            ],
          };
        },
      },
    });

    const latestPublication = await coordinator.getLatestPublicationRow();

    t.match(latestPublication, {
      publicationEpoch: 11,
      publicationKind: 'cluster_membership',
      publishedActiveNodeIds: ['node-1', 'node-2'],
    });
  });

test('getLatestPublicationForNodeSync reads the latest publication from the cache',
  async (t) => {
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: 'seed-node',
      systemTableCache: {
        getAll(tableName) {
          if (tableName !== 'control_plane_publications') {
            return [];
          }
          return [
            {
              publication_id: 'publication-12',
              publication_kind: 'cluster_membership',
              publication_epoch: 12,
              published_active_node_ids: ['node-1', 'node-2'],
              required_ack_node_ids: ['node-1', 'node-2'],
              acknowledged_node_ids: ['node-1'],
              membership_lifecycle_summary: {
                lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING,
                epochBoundary: 'publication_pending',
              },
              status: 'ACK_PENDING',
            },
          ];
        },
      },
    });

    const latestPublication = coordinator.getLatestPublicationForNodeSync('node-2');

    t.match(latestPublication, {
      publicationEpoch: 12,
      status: 'ACK_PENDING',
      publishedActiveNodeIds: ['node-1', 'node-2'],
      membershipLifecycleSummary: {
        lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING,
        epochBoundary: 'publication_pending',
      },
    });
    t.end();
  });

test('acknowledgeMembershipPublicationForNode acknowledges a required node from cache',
  async (t) => {
    const persistedRows = [];
    const getPublicationCalls = [];
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: 'seed-node',
      systemTableCache: {
        getAll(tableName) {
          if (tableName !== 'control_plane_publications') {
            return [];
          }
          return [
            {
              publication_id: 'publication-20',
              publication_kind: 'cluster_membership',
              publication_epoch: 20,
              status: 'OPEN',
              published_active_node_ids: ['node-1', 'node-2'],
              required_ack_node_ids: ['node-1', 'node-2'],
              acknowledged_node_ids: [],
            },
          ];
        },
      },
      controlPlanePublicationsOwner: {
        async getPublication(publicationId) {
          getPublicationCalls.push(publicationId);
          return {
            publication_id: 'publication-20',
            publication_kind: 'cluster_membership',
            publication_epoch: 20,
            status: 'OPEN',
            published_active_node_ids: ['node-1', 'node-2'],
            required_ack_node_ids: ['node-1', 'node-2'],
            acknowledged_node_ids: [],
          };
        },
        async upsertPublication(row) {
          persistedRows.push(row);
        },
      },
    });

    const publicationRow =
      await coordinator.acknowledgeMembershipPublicationForNode('node-1');

    t.equal(
      persistedRows.length,
      1,
      'cache-rooted required nodes should result in one acknowledgement persistence',
    );
    t.match(
      persistedRows[0],
      {
        publication_id: 'publication-20',
        status: 'ACK_PENDING',
        acknowledged_node_ids: ['node-1'],
      },
      'required node acknowledgement should be persisted with updated status',
    );
    t.equal(
      getPublicationCalls.length,
      1,
      'owner read should be used when writing the acknowledgement',
    );
    t.equal(
      publicationRow?.acknowledged_node_ids?.[0],
      'node-1',
      'acknowledge result should include the acknowledging node',
    );
    t.end();
  });

test('acknowledgeMembershipPublicationForNode refreshes from authoritative when cache misses node requirement',
  async (t) => {
    const listPublicationsCalls = [];
    const getPublicationCalls = [];
    const persistedRows = [];
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: 'seed-node',
      systemTableCache: {
        getAll(tableName) {
          if (tableName !== 'control_plane_publications') {
            return [];
          }
          return [
            {
              publication_id: 'publication-21',
              publication_kind: 'cluster_membership',
              publication_epoch: 21,
              status: 'ACK_PENDING',
              published_active_node_ids: ['node-1', 'node-2'],
              required_ack_node_ids: ['node-other'],
              acknowledged_node_ids: [],
            },
          ];
        },
      },
      controlPlanePublicationsOwner: {
        async listPublications(options = {}) {
          listPublicationsCalls.push(options);
          return {
            rows: [
              {
                publication_id: 'publication-21',
                publication_kind: 'cluster_membership',
                publication_epoch: 21,
                status: 'ACK_PENDING',
                published_active_node_ids: ['node-1', 'node-2'],
                required_ack_node_ids: ['node-1'],
                acknowledged_node_ids: [],
              },
            ],
          };
        },
        async getPublication(publicationId) {
          getPublicationCalls.push(publicationId);
          return {
            publication_id: 'publication-21',
            publication_kind: 'cluster_membership',
            publication_epoch: 21,
            status: 'ACK_PENDING',
            published_active_node_ids: ['node-1', 'node-2'],
            required_ack_node_ids: ['node-1'],
            acknowledged_node_ids: [],
          };
        },
        async upsertPublication(row) {
          persistedRows.push(row);
        },
      },
    });

    const publicationRow =
      await coordinator.acknowledgeMembershipPublicationForNode('node-1');

    t.equal(
      listPublicationsCalls.length,
      1,
      'stale cache rows should trigger an authoritative publication list refresh',
    );
    t.match(
      listPublicationsCalls[0],
      {
        preferOwnerRpcRead: true,
      },
      'authoritative refresh should request owner-rpc preferred reads',
    );
    t.equal(
      persistedRows.length,
      1,
      'authoritative-refresh row should be acknowledged when the node becomes required',
    );
    t.equal(
      getPublicationCalls.length,
      1,
      'authoritative acknowledgement should still re-read the publication by id',
    );
    t.equal(
      publicationRow?.acknowledged_node_ids?.[0],
      'node-1',
      'refresh+ack should persist the node acknowledgement',
    );
    t.end();
  });

test('acknowledgeMembershipPublicationForNode is no-op when node is not required',
  async (t) => {
    const listPublicationsCalls = [];
    const getPublicationCalls = [];
    const persistedRows = [];
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: 'seed-node',
      systemTableCache: {
        getAll(tableName) {
          if (tableName !== 'control_plane_publications') {
            return [];
          }
          return [
            {
              publication_id: 'publication-23',
              publication_kind: 'cluster_membership',
              publication_epoch: 23,
              status: 'OPEN',
              published_active_node_ids: ['node-1', 'node-2'],
              required_ack_node_ids: ['node-1'],
              acknowledged_node_ids: [],
            },
          ];
        },
      },
      controlPlanePublicationsOwner: {
        async listPublications(options) {
          listPublicationsCalls.push(options);
          return {
            rows: [
              {
                publication_id: 'publication-23',
                publication_kind: 'cluster_membership',
                publication_epoch: 23,
                status: 'OPEN',
                published_active_node_ids: ['node-1', 'node-2'],
                required_ack_node_ids: ['node-1'],
                acknowledged_node_ids: [],
              },
            ],
          };
        },
        async getPublication(publicationId) {
          getPublicationCalls.push(publicationId);
          return {
            publication_id: 'publication-23',
            publication_kind: 'cluster_membership',
            publication_epoch: 23,
            status: 'OPEN',
            published_active_node_ids: ['node-1', 'node-2'],
            required_ack_node_ids: ['node-1'],
            acknowledged_node_ids: [],
          };
        },
        async upsertPublication(row) {
          persistedRows.push(row);
        },
      },
    });

    const publicationRow =
      await coordinator.acknowledgeMembershipPublicationForNode('node-3');

    t.equal(
      listPublicationsCalls.length,
      1,
      'non-required target should still allow owner refresh attempt before returning no-op',
    );
    t.match(
      listPublicationsCalls[0],
      {
        preferOwnerRpcRead: true,
      },
      'owner refresh should use owner-rpc read preference',
    );
    t.equal(
      getPublicationCalls.length,
      0,
      'non-required nodes should not fetch publication by id for acknowledgement',
    );
    t.equal(
      persistedRows.length,
      0,
      'no persistence should occur when the node is not required for acknowledgement',
    );
    t.equal(
      publicationRow?.required_ack_node_ids?.[0],
      'node-1',
      'returned row should remain the authoritative row for required-ack context',
    );
    t.equal(
      publicationRow?.acknowledged_node_ids?.length,
      0,
      'non-required node should not become acknowledged',
    );
    t.end();
  });

test('acknowledgeMembershipPublicationForNode does not persist duplicate node acknowledgements',
  async (t) => {
    const persistedRows = [];
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: 'seed-node',
      systemTableCache: {
        getAll(tableName) {
          if (tableName !== 'control_plane_publications') {
            return [];
          }
          return [
            {
              publication_id: 'publication-22',
              publication_kind: 'cluster_membership',
              publication_epoch: 22,
              status: 'ACK_PENDING',
              published_active_node_ids: ['node-1', 'node-2'],
              required_ack_node_ids: ['node-1', 'node-2'],
              acknowledged_node_ids: ['node-1'],
            },
          ];
        },
      },
      controlPlanePublicationsOwner: {
        async upsertPublication(row) {
          persistedRows.push(row);
        },
      },
    });

    const publicationRow =
      await coordinator.acknowledgeMembershipPublicationForNode('node-1');

    t.equal(
      persistedRows.length,
      0,
      'duplicate acknowledgements should not persist',
    );
    t.equal(
      publicationRow?.acknowledged_node_ids?.length,
      1,
      'duplicate acknowledgements should return the existing row unchanged',
    );
    t.end();
  });

test('getDispatchRetryRowsForNode refreshes through the replica-operation owner when priority recovery leaves cache empty',
  async (t) => {
    const authoritativeQueryOptions = [];
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: 'node-1',
      systemTableCache: {
        getAll(tableName) {
          if (tableName === 'replica_operations') {
            return [];
          }
          return [];
        },
      },
      controlPlaneReadinessService: {
        getMembershipPublicationDiagnosticsSync() {
          return {
            publicationEpoch: 14,
            publicationStatus: 'PUBLISHED',
            publishedActiveNodeIds: ['node-1'],
            priorityPartitionSummary: {
              requiredDistinctNodeCount: 2,
              readyEligibleNodeCount: 1,
              blockedPartitions: [{
                partitionId: 'replica_operations-p1',
                requiredDistinctNodeCount: 2,
                readyDistinctNodeCount: 1,
                spreadGap: 1,
              }],
              missingPartitionIds: ['replica_operations-p1'],
            },
            membershipLifecycleSummary: {
              locallyEligibleNodeIds: ['node-2'],
              projectedServingNodeIds: ['node-2'],
            },
          };
        },
      },
      replicaOperationRepository: {
        async queryIncompleteOperations(options) {
          authoritativeQueryOptions.push(options);
          return [{
            operationId: 'op-priority-retry-1',
            partitionId: 'replica_operations-p1',
            type: 'REPLACE',
            sourceNodeId: 'node-1',
            targetNodeId: 'node-2',
            status: 'pending',
            workflowStep: 'PENDING',
            stepsHistory: [],
          }];
        },
      },
    });

    const dispatchRows =
      await coordinator.getDispatchRetryRowsForNode('node-2');

    t.same(
      authoritativeQueryOptions,
      [{preferAuthoritativeRead: true}],
      'priority recovery should ask the authoritative replica-operation owner for retry rows',
    );
    t.match(
      dispatchRows,
      [{
        operation_id: 'op-priority-retry-1',
        target_node_id: 'node-2',
        workflow_step: 'PENDING',
      }],
      'owner-selected retry rows should be returned in replica_operations row shape',
    );
    t.end();
  });

test('getDispatchRetryRowsForNode respects canonical target ownership for replace operations',
  async (t) => {
    const authoritativeQueryOptions = [];
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: 'node-2',
      systemTableCache: {
        getAll(tableName) {
          if (tableName === 'replica_operations') {
            return [];
          }
          return [];
        },
      },
      controlPlaneReadinessService: {
        getMembershipPublicationDiagnosticsSync() {
          return {
            publicationEpoch: 15,
            publicationStatus: 'PUBLISHED',
            publishedActiveNodeIds: ['node-1'],
            priorityPartitionSummary: {
              requiredDistinctNodeCount: 2,
              readyEligibleNodeCount: 1,
              blockedPartitions: [{
                partitionId: 'replica_operations-p1',
                requiredDistinctNodeCount: 2,
                readyDistinctNodeCount: 1,
                spreadGap: 1,
              }],
              missingPartitionIds: ['replica_operations-p1'],
            },
            membershipLifecycleSummary: {
              locallyEligibleNodeIds: ['node-2'],
              projectedServingNodeIds: ['node-2'],
            },
          };
        },
      },
      replicaOperationRepository: {
        isOperationLocallyOwned(operation) {
          return operation?.targetNodeId === 'node-2';
        },
        async queryIncompleteOperations(options) {
          authoritativeQueryOptions.push(options);
          return [{
            operationId: 'op-priority-retry-target-owner',
            partitionId: 'replica_operations-p1',
            type: 'REPLACE',
            sourceNodeId: 'node-1',
            targetNodeId: 'node-2',
            status: 'pending',
            workflowStep: 'PENDING',
            stepsHistory: [],
          }];
        },
      },
    });

    const dispatchRows =
      await coordinator.getDispatchRetryRowsForNode('node-2');

    t.same(
      authoritativeQueryOptions,
      [{preferAuthoritativeRead: true}],
      'canonical ownership resolver should allow authoritative refresh for target-owned rows',
    );
    t.match(
      dispatchRows,
      [{
        operation_id: 'op-priority-retry-target-owner',
        target_node_id: 'node-2',
        workflow_step: 'PENDING',
      }],
      'owner-selected retry rows should include target-owned replace operations',
    );
    t.end();
  });

test('getLatestPublishedClusterPublicationSync keeps the last published epoch when a newer publication is still open',
  async (t) => {
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: 'seed-node',
      systemTableCache: {
        getAll(tableName) {
          if (tableName !== 'control_plane_publications') {
            return [];
          }
          return [
            {
              publication_id: 'publication-12',
              publication_kind: 'cluster_membership',
              publication_epoch: 12,
              published_active_node_ids: ['node-1', 'node-2', 'node-3'],
              status: 'PUBLISHED',
            },
            {
              publication_id: 'publication-13',
              publication_kind: 'cluster_membership',
              publication_epoch: 13,
              published_active_node_ids: ['node-1', 'node-2', 'node-3', 'node-4'],
              status: 'OPEN',
            },
          ];
        },
      },
    });

    const latestPublishedPublication =
      coordinator.getLatestPublishedClusterPublicationSync();

    t.match(latestPublishedPublication, {
      publicationEpoch: 12,
      status: 'PUBLISHED',
      publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
    });
  });

test('getLatestPublishedClusterPublication prefers authoritative publication history when requested',
  async (t) => {
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: 'seed-node',
      systemTableCache: {
        getAll(tableName) {
          if (tableName !== 'control_plane_publications') {
            return [];
          }
          return [{
            publication_id: 'publication-13',
            publication_kind: 'cluster_membership',
            publication_epoch: 13,
            published_active_node_ids: ['node-1', 'node-2', 'node-3', 'node-4'],
            status: 'OPEN',
          }];
        },
      },
      controlPlanePublicationsOwner: {
        async listPublicationsFromCache() {
          t.fail('authoritative publication reads should bypass cache-only publication rows');
          return {rows: []};
        },
        async listPublications() {
          return {
            rows: [
              {
                publication_id: 'publication-12',
                publication_kind: 'cluster_membership',
                publication_epoch: 12,
                published_active_node_ids: ['node-1', 'node-2', 'node-3'],
                status: 'PUBLISHED',
              },
              {
                publication_id: 'publication-13',
                publication_kind: 'cluster_membership',
                publication_epoch: 13,
                published_active_node_ids: ['node-1', 'node-2', 'node-3', 'node-4'],
                status: 'OPEN',
              },
            ],
          };
        },
      },
    });

    const latestPublishedPublication =
      await coordinator.getLatestPublishedClusterPublication({
        preferAuthoritativeRead: true,
      });

    t.match(latestPublishedPublication, {
      publicationEpoch: 12,
      status: 'PUBLISHED',
      publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
    });
  });

test('reconcileClusterMembership reuses an unchanged published row instead of resetting it to OPEN',
  async (t) => {
    const latestPublicationRow = {
      publication_id: 'publication-12',
      publication_kind: 'cluster_membership',
      publication_epoch: 12,
      published_active_node_ids: ['node-1', 'node-2'],
      required_ack_node_ids: ['node-1', 'node-2'],
      acknowledged_node_ids: ['node-1', 'node-2'],
      membership_lifecycle_summary: {
        lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE,
        epochBoundary: 'published_membership',
      },
      status: 'PUBLISHED',
      updated_at: 1200,
      published_at: 1200,
      closed_at: 1200,
    };
    let upsertCallCount = 0;
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: 'node-1',
      controlPlanePublicationsOwner: {
        async listPublications() {
          return {rows: [latestPublicationRow]};
        },
        async upsertPublication() {
          upsertCallCount += 1;
        },
      },
      systemTableCache: {
        getAll(tableName) {
          if (tableName === 'nodes') {
            return [{
              node_id: 'node-1',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: 5000,
            }, {
              node_id: 'node-2',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: 5000,
            }];
          }
          if (tableName === 'node_endpoints') {
            return [{
              endpoint_id: 'node-1-ws',
              node_id: 'node-1',
              transport_type: 'ws',
              status: 'active',
              address: 'ws://node-1:8082',
            }, {
              endpoint_id: 'node-2-ws',
              node_id: 'node-2',
              transport_type: 'ws',
              status: 'active',
              address: 'ws://node-2:8082',
            }];
          }
          if (tableName === 'services') {
            return [{
              service_id: 'svc-1',
              node_id: 'node-1',
              status: 'active',
            }, {
              service_id: 'svc-2',
              node_id: 'node-2',
              status: 'active',
            }];
          }
          if (tableName === 'control_plane_publications') {
            return [latestPublicationRow];
          }
          return [];
        },
      },
      now: () => 1500,
    });

    const result = await coordinator.reconcileClusterMembership();

    t.equal(
      upsertCallCount,
      0,
      'unchanged published membership should not be rewritten through the publication owner',
    );
    t.match(
      result.publicationRow,
      {
        publicationId: 'publication-12',
        publicationEpoch: 12,
        status: 'PUBLISHED',
        publishedActiveNodeIds: ['node-1', 'node-2'],
        acknowledgedNodeIds: ['node-1', 'node-2'],
      },
      'the durable published membership should remain the observed truth when the candidate is unchanged',
    );
  });

test('deriveMembershipPublicationCandidate counts promotable learners toward priority spread quorum',
  async (t) => {
    const priorityTableIds = [
      'control_plane_publications',
      'replica_operations',
      'sql_transaction_participants',
      'sql_transactions',
      'sql_write_operations',
    ];
    const serviceRows = priorityTableIds.flatMap((tableId, index) => {
      const partitionId = `${tableId}-p1`;
      return [{
        service_id: `${tableId}-leader-${index}`,
        node_id: 'node-1',
        partition_id: partitionId,
        service_type: 'partition',
        status: 'active',
        raft_role: 'leader',
        address: `node-1/partition/${partitionId}-r1`,
      }, {
        service_id: `${tableId}-learner-${index}`,
        node_id: 'node-2',
        partition_id: partitionId,
        service_type: 'partition',
        status: 'active',
        raft_role: 'learner',
        address: `node-2/partition/${partitionId}-r2`,
      }];
    });
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      latestPublicationRow: {
        publication_epoch: 12,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1'],
        required_ack_node_ids: ['node-1'],
        acknowledged_node_ids: ['node-1'],
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
      ],
      serviceRows,
      nowMs: 1000,
    });

    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1', 'node-2'],
      'promotable learners should be included in the published active set while priority spread recovery is pending',
    );
    t.match(
      candidate.priorityPartitionSummary,
      {
        satisfied: true,
        requiredDistinctNodeCount: 2,
        missingPartitionIds: [],
        blockedPartitions: [],
      },
      'active promotable learners should satisfy the derived priority spread quorum',
    );
  });

test('reconcileClusterMembership refreshes priority spread metadata when membership is unchanged',
  async (t) => {
    const latestPublicationRow = {
      publication_id: 'publication-12',
      publication_kind: 'cluster_membership',
      publication_epoch: 12,
      published_active_node_ids: ['node-1', 'node-2', 'node-3'],
      required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
      acknowledged_node_ids: ['node-1', 'node-2', 'node-3'],
      membership_lifecycle_summary: {
        lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE,
        epochBoundary: 'published_membership',
      },
      status: 'PUBLISHED',
      updated_at: 1200,
      published_at: 1200,
      closed_at: 1200,
    };
    const persistedRows = [];
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: 'node-1',
      controlPlanePublicationsOwner: {
        async listPublications() {
          return {rows: [latestPublicationRow]};
        },
        async upsertPublication(row) {
          persistedRows.push(row);
        },
      },
      systemTableCache: {
        getAll(tableName) {
          if (tableName === 'nodes') {
            return [{
              node_id: 'node-1',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: 5000,
            }, {
              node_id: 'node-2',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: 5000,
            }, {
              node_id: 'node-3',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: 5000,
            }];
          }
          if (tableName === 'node_endpoints') {
            return [{
              endpoint_id: 'node-1-ws',
              node_id: 'node-1',
              transport_type: 'ws',
              status: 'active',
              address: 'ws://node-1:8082',
            }, {
              endpoint_id: 'node-2-ws',
              node_id: 'node-2',
              transport_type: 'ws',
              status: 'active',
              address: 'ws://node-2:8082',
            }, {
              endpoint_id: 'node-3-ws',
              node_id: 'node-3',
              transport_type: 'ws',
              status: 'active',
              address: 'ws://node-3:8082',
            }];
          }
          if (tableName === 'services') {
            return [{
              service_id: 'cp-publications-r1',
              node_id: 'node-1',
              partition_id: 'control_plane_publications-p1',
              service_type: 'partition',
              status: 'active',
              raft_role: 'leader',
              address: 'node-1/partition/control_plane_publications-p1-r1',
            }, {
              service_id: 'cp-publications-r2',
              node_id: 'node-2',
              partition_id: 'control_plane_publications-p1',
              service_type: 'partition',
              status: 'active',
              raft_role: 'follower',
              address: 'node-2/partition/control_plane_publications-p1-r2',
            }, {
              service_id: 'cp-publications-r3',
              node_id: 'node-3',
              partition_id: 'control_plane_publications-p1',
              service_type: 'partition',
              status: 'active',
              raft_role: 'follower',
              address: 'node-3/partition/control_plane_publications-p1-r3',
            }, {
              service_id: 'replica-ops-r1',
              node_id: 'node-1',
              partition_id: 'replica_operations-p1',
              service_type: 'partition',
              status: 'active',
              raft_role: 'leader',
              address: 'node-1/partition/replica_operations-p1-r1',
            }, {
              service_id: 'replica-ops-r2',
              node_id: 'node-1',
              partition_id: 'replica_operations-p1',
              service_type: 'partition',
              status: 'active',
              raft_role: 'follower',
              address: 'node-1/partition/replica_operations-p1-r2',
            }, {
              service_id: 'replica-ops-r3',
              node_id: 'node-1',
              partition_id: 'replica_operations-p1',
              service_type: 'partition',
              status: 'active',
              raft_role: 'follower',
              address: 'node-1/partition/replica_operations-p1-r3',
            }];
          }
          if (tableName === 'control_plane_publications') {
            return [latestPublicationRow];
          }
          return [];
        },
      },
      now: () => 1500,
    });

    const result = await coordinator.reconcileClusterMembership();

    t.equal(
      persistedRows.length,
      1,
      'unchanged active membership should still refresh missing priority spread metadata',
    );
    t.match(
      result.publicationRow,
      {
        publicationEpoch: 12,
        status: 'PUBLISHED',
        priorityPartitionSummary: {
          satisfied: false,
        },
      },
      'metadata-only refreshes should update the existing epoch rather than reopening membership publication',
    );
  });

test('reconcileClusterMembership uses authoritative readiness when published priority spread is still blocked',
  async (t) => {
    const latestPublicationRow = {
      publication_id: 'publication-12',
      publication_kind: 'cluster_membership',
      publication_epoch: 12,
      published_active_node_ids: ['node-1', 'node-2'],
      required_ack_node_ids: ['node-1', 'node-2'],
      acknowledged_node_ids: ['node-1', 'node-2'],
      priority_partition_summary: {
        satisfied: false,
        requiredDistinctNodeCount: 2,
        readyEligibleNodeCount: 2,
      },
      membership_lifecycle_summary: {
        lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE,
        epochBoundary: 'published_membership',
      },
      status: 'PUBLISHED',
      updated_at: 1200,
      published_at: 1200,
      closed_at: 1200,
    };
    const persistedRows = [];
    const readinessRefreshModes = [];
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: 'node-1',
      controlPlanePublicationsOwner: {
        async listPublications() {
          return {rows: [latestPublicationRow]};
        },
        async upsertPublication(row) {
          persistedRows.push(row);
        },
      },
      controlPlaneReadinessService: {
        async getAllNodeReadiness(options = {}) {
          readinessRefreshModes.push(options.allowAuthoritativeRefresh === true);
          if (options.allowAuthoritativeRefresh === true) {
            return [{
              nodeId: 'node-1',
              dimensions: {clusterMemberHealthy: true},
            }, {
              nodeId: 'node-2',
              dimensions: {clusterMemberHealthy: true},
            }, {
              nodeId: 'node-3',
              dimensions: {
                clusterMemberHealthy: false,
                controlPlaneRecoveryEligible: true,
                controlPlaneWritable: false,
              },
            }];
          }
          return [{
            nodeId: 'node-1',
            dimensions: {clusterMemberHealthy: true},
          }, {
            nodeId: 'node-2',
            dimensions: {clusterMemberHealthy: true},
          }];
        },
        getRecoveryEpochHistoryByNodeId() {
          return {};
        },
      },
      systemTableCache: {
        getAll(tableName) {
          if (tableName === 'nodes') {
            return [{
              node_id: 'node-1',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: 5000,
            }, {
              node_id: 'node-2',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: 5000,
            }, {
              node_id: 'node-3',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: 5000,
            }];
          }
          if (tableName === 'node_endpoints') {
            return [{
              endpoint_id: 'node-1-ws',
              node_id: 'node-1',
              transport_type: 'ws',
              status: 'active',
              address: 'ws://node-1:8082',
            }, {
              endpoint_id: 'node-2-ws',
              node_id: 'node-2',
              transport_type: 'ws',
              status: 'active',
              address: 'ws://node-2:8082',
            }, {
              endpoint_id: 'node-3-ws',
              node_id: 'node-3',
              transport_type: 'ws',
              status: 'active',
              address: 'ws://node-3:8082',
            }];
          }
          if (tableName === 'services') {
            return [{
              service_id: 'svc-1',
              node_id: 'node-1',
              status: 'active',
            }, {
              service_id: 'svc-2',
              node_id: 'node-2',
              status: 'active',
            }, {
              service_id: 'svc-3',
              node_id: 'node-3',
              status: 'active',
            }];
          }
          if (tableName === 'control_plane_publications') {
            return [latestPublicationRow];
          }
          return [];
        },
      },
      now: () => 1500,
    });

    const result = await coordinator.reconcileClusterMembership();

    t.same(
      readinessRefreshModes,
      [true],
      'priority-spread recovery should refresh readiness authoritatively before re-deriving membership',
    );
    t.equal(
      persistedRows.length,
      1,
      'reconciliation should persist a new publication once authoritative readiness exposes a promotable recovery node',
    );
    t.match(
      result.candidate,
      {
        publicationEpoch: 13,
        publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
        requiredAckNodeIds: ['node-1', 'node-2', 'node-3'],
      },
      'the reopened publication candidate should promote the recovery-eligible node into the published membership set',
    );
    t.equal(
      result.publicationRow?.status,
      'OPEN',
      'the persisted publication row should reopen the membership epoch',
    );
  });

test('reconcileClusterMembership enables recovery-eligible projection while priority spread remains blocked even when discovery rows lag',
  async (t) => {
    const latestPublicationRow = {
      publication_id: 'publication-14',
      publication_kind: 'cluster_membership',
      publication_epoch: 14,
      published_active_node_ids: ['node-1', 'node-2'],
      required_ack_node_ids: ['node-1', 'node-2'],
      acknowledged_node_ids: ['node-1', 'node-2'],
      priority_partition_summary: {
        satisfied: false,
        requiredDistinctNodeCount: 2,
        readyEligibleNodeCount: 2,
        missingPartitionIds: [
          'control_plane_publications-p1',
          'replica_operations-p1',
        ],
      },
      membership_lifecycle_summary: {
        lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE,
        epochBoundary: 'published_membership',
      },
      status: 'PUBLISHED',
      updated_at: 1200,
      published_at: 1200,
      closed_at: 1200,
    };
    const persistedRows = [];
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: 'node-1',
      controlPlanePublicationsOwner: {
        async listPublications() {
          return {rows: [latestPublicationRow]};
        },
        async upsertPublication(row) {
          persistedRows.push(row);
        },
      },
      controlPlaneReadinessService: {
        async getAllNodeReadiness(options = {}) {
          if (options.allowAuthoritativeRefresh === true) {
            return [{
              nodeId: 'node-1',
              dimensions: {clusterMemberHealthy: true},
            }, {
              nodeId: 'node-2',
              dimensions: {clusterMemberHealthy: true},
            }, {
              nodeId: 'node-3',
              dimensions: {
                clusterMemberHealthy: false,
                controlPlaneRecoveryEligible: true,
                controlPlaneWritable: false,
              },
            }];
          }
          return [{
            nodeId: 'node-1',
            dimensions: {clusterMemberHealthy: true},
          }, {
            nodeId: 'node-2',
            dimensions: {clusterMemberHealthy: true},
          }];
        },
        getRecoveryEpochHistoryByNodeId() {
          return {};
        },
      },
      systemTableCache: {
        getAll(tableName) {
          if (tableName === 'nodes') {
            return [{
              node_id: 'node-1',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: 5000,
            }, {
              node_id: 'node-2',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: 5000,
            }, {
              node_id: 'node-3',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: 5000,
            }];
          }
          if (tableName === 'node_endpoints') {
            return [{
              endpoint_id: 'node-1-ws',
              node_id: 'node-1',
              transport_type: 'ws',
              status: 'active',
              address: 'ws://node-1:8082',
            }, {
              endpoint_id: 'node-2-ws',
              node_id: 'node-2',
              transport_type: 'ws',
              status: 'active',
              address: 'ws://node-2:8082',
            }];
          }
          if (tableName === 'services') {
            return [{
              service_id: 'svc-1',
              node_id: 'node-1',
              status: 'active',
            }, {
              service_id: 'svc-2',
              node_id: 'node-2',
              status: 'active',
            }];
          }
          if (tableName === 'control_plane_publications') {
            return [latestPublicationRow];
          }
          return [];
        },
      },
      now: () => 1500,
    });

    const result = await coordinator.reconcileClusterMembership();

    t.equal(
      persistedRows.length,
      1,
      'priority spread reconciliation should reopen membership when only recovery-eligible evidence is available for missing nodes',
    );
    t.match(
      result.candidate,
      {
        publicationEpoch: 15,
        publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
        requiredAckNodeIds: ['node-1', 'node-2', 'node-3'],
        membershipLifecycleSummary: {
          projectionDiagnostics: {
            readinessDecisionMode: 'cluster_member_or_recovery_eligible',
            recoveryEligibleProjectionEnabled: true,
            recoveryEligibleIncludedNodeIds: ['node-3'],
          },
        },
      },
      'priority-spread repair should promote recovery-eligible nodes into the reopened published membership even when endpoint/service rows lag',
    );
    t.equal(
      result.publicationRow?.status,
      'OPEN',
      'reopened membership should remain OPEN until acknowledgements confirm the widened set',
    );
  });

test('reconcileClusterMembership can widen publication using liveness fallback while priority spread remains blocked',
  async (t) => {
    const latestPublicationRow = {
      publication_id: 'publication-16',
      publication_kind: 'cluster_membership',
      publication_epoch: 16,
      published_active_node_ids: ['node-1', 'node-2'],
      required_ack_node_ids: ['node-1', 'node-2'],
      acknowledged_node_ids: ['node-1', 'node-2'],
      priority_partition_summary: {
        satisfied: false,
        requiredDistinctNodeCount: 2,
        readyEligibleNodeCount: 2,
        missingPartitionIds: [
          'control_plane_publications-p1',
          'replica_operations-p1',
        ],
      },
      membership_lifecycle_summary: {
        lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE,
        epochBoundary: 'published_membership',
      },
      status: 'PUBLISHED',
      updated_at: 1200,
      published_at: 1200,
      closed_at: 1200,
    };
    const persistedRows = [];
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: 'node-1',
      controlPlanePublicationsOwner: {
        async listPublications() {
          return {rows: [latestPublicationRow]};
        },
        async upsertPublication(row) {
          persistedRows.push(row);
        },
      },
      controlPlaneReadinessService: {
        async getAllNodeReadiness(options = {}) {
          if (options.allowAuthoritativeRefresh === true) {
            return [{
              nodeId: 'node-1',
              dimensions: {clusterMemberHealthy: true},
            }, {
              nodeId: 'node-2',
              dimensions: {clusterMemberHealthy: true},
            }, {
              nodeId: 'node-3',
              dimensions: {
                clusterMemberHealthy: false,
                controlPlaneRecoveryEligible: false,
                controlPlaneWritable: false,
              },
            }];
          }
          return [{
            nodeId: 'node-1',
            dimensions: {clusterMemberHealthy: true},
          }, {
            nodeId: 'node-2',
            dimensions: {clusterMemberHealthy: true},
          }];
        },
        getRecoveryEpochHistoryByNodeId() {
          return {};
        },
      },
      systemTableCache: {
        getAll(tableName) {
          if (tableName === 'nodes') {
            return [{
              node_id: 'node-1',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: 5000,
            }, {
              node_id: 'node-2',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: 5000,
            }, {
              node_id: 'node-3',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: 5000,
            }];
          }
          if (tableName === 'node_endpoints') {
            return [{
              endpoint_id: 'node-1-ws',
              node_id: 'node-1',
              transport_type: 'ws',
              status: 'active',
              address: 'ws://node-1:8082',
            }, {
              endpoint_id: 'node-2-ws',
              node_id: 'node-2',
              transport_type: 'ws',
              status: 'active',
              address: 'ws://node-2:8082',
            }, {
              endpoint_id: 'node-3-ws',
              node_id: 'node-3',
              transport_type: 'ws',
              status: 'active',
              address: 'ws://node-3:8082',
            }];
          }
          if (tableName === 'services') {
            return [{
              service_id: 'svc-1',
              node_id: 'node-1',
              status: 'active',
            }, {
              service_id: 'svc-2',
              node_id: 'node-2',
              status: 'active',
            }, {
              service_id: 'svc-3',
              node_id: 'node-3',
              status: 'active',
            }];
          }
          if (tableName === 'control_plane_publications') {
            return [latestPublicationRow];
          }
          return [];
        },
      },
      now: () => 1500,
    });

    const result = await coordinator.reconcileClusterMembership();

    t.equal(
      persistedRows.length,
      1,
      'priority-spread repair should persist a widened publication when fresh liveness evidence is present',
    );
    t.match(
      result.candidate,
      {
        publicationEpoch: 17,
        publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
        requiredAckNodeIds: ['node-1', 'node-2', 'node-3'],
      },
      'liveness fallback should reopen membership for spread recovery even when authoritative readiness temporarily fails closed',
    );
  });

test('reconcileClusterMembership retries transient priority spread refresh write failures when membership is unchanged',
  async (t) => {
    let upsertCallCount = 0;
    let durableRow = {
      publication_id: 'publication-12',
      publication_kind: 'cluster_membership',
      publication_epoch: 12,
      published_active_node_ids: ['node-1', 'node-2', 'node-3'],
      required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
      acknowledged_node_ids: ['node-1', 'node-2', 'node-3'],
      membership_lifecycle_summary: {
        lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE,
        epochBoundary: 'published_membership',
      },
      status: 'PUBLISHED',
      updated_at: 1200,
      published_at: 1200,
      closed_at: 1200,
    };
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: 'node-1',
      controlPlanePublicationsOwner: {
        async listPublications() {
          return {rows: [durableRow]};
        },
        async getPublication(publicationId, options) {
          t.equal(
            publicationId,
            'publication-12',
            'metadata refresh retries should re-read the same publication row',
          );
          t.match(options, {
            preferOwnerRpcRead: true,
          }, 'metadata refresh retries should prefer owner-rpc reads');
          return durableRow;
        },
        async upsertPublication(row) {
          upsertCallCount += 1;
          if (upsertCallCount === 1) {
            const error = new Error('Distributed operation failed due to participant failures');
            error.code = 'DISTRIBUTED_PARTICIPANT_FAILURE';
            throw error;
          }
          durableRow = row;
        },
      },
      systemTableCache: {
        getAll(tableName) {
          if (tableName === 'nodes') {
            return [{
              node_id: 'node-1',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: 5000,
            }, {
              node_id: 'node-2',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: 5000,
            }, {
              node_id: 'node-3',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: 5000,
            }];
          }
          if (tableName === 'node_endpoints') {
            return [{
              endpoint_id: 'node-1-ws',
              node_id: 'node-1',
              transport_type: 'ws',
              status: 'active',
              address: 'ws://node-1:8082',
            }, {
              endpoint_id: 'node-2-ws',
              node_id: 'node-2',
              transport_type: 'ws',
              status: 'active',
              address: 'ws://node-2:8082',
            }, {
              endpoint_id: 'node-3-ws',
              node_id: 'node-3',
              transport_type: 'ws',
              status: 'active',
              address: 'ws://node-3:8082',
            }];
          }
          if (tableName === 'services') {
            return [{
              service_id: 'cp-publications-r1',
              node_id: 'node-1',
              partition_id: 'control_plane_publications-p1',
              service_type: 'partition',
              status: 'active',
              raft_role: 'leader',
              address: 'node-1/partition/control_plane_publications-p1-r1',
            }, {
              service_id: 'cp-publications-r2',
              node_id: 'node-2',
              partition_id: 'control_plane_publications-p1',
              service_type: 'partition',
              status: 'active',
              raft_role: 'follower',
              address: 'node-2/partition/control_plane_publications-p1-r2',
            }, {
              service_id: 'cp-publications-r3',
              node_id: 'node-3',
              partition_id: 'control_plane_publications-p1',
              service_type: 'partition',
              status: 'active',
              raft_role: 'follower',
              address: 'node-3/partition/control_plane_publications-p1-r3',
            }, {
              service_id: 'replica-ops-r1',
              node_id: 'node-1',
              partition_id: 'replica_operations-p1',
              service_type: 'partition',
              status: 'active',
              raft_role: 'leader',
              address: 'node-1/partition/replica_operations-p1-r1',
            }, {
              service_id: 'replica-ops-r2',
              node_id: 'node-1',
              partition_id: 'replica_operations-p1',
              service_type: 'partition',
              status: 'active',
              raft_role: 'follower',
              address: 'node-1/partition/replica_operations-p1-r2',
            }, {
              service_id: 'replica-ops-r3',
              node_id: 'node-1',
              partition_id: 'replica_operations-p1',
              service_type: 'partition',
              status: 'active',
              raft_role: 'follower',
              address: 'node-1/partition/replica_operations-p1-r3',
            }];
          }
          if (tableName === 'control_plane_publications') {
            return [durableRow];
          }
          return [];
        },
      },
      now: () => 1500,
    });

    const result = await coordinator.reconcileClusterMembership();

    t.equal(
      upsertCallCount,
      2,
      'transient priority spread refresh write failures should retry within the existing persistence budget',
    );
    t.match(
      durableRow,
      {
        publication_epoch: 12,
        status: 'PUBLISHED',
        priority_partition_summary: {
          satisfied: false,
        },
      },
      'the retried metadata refresh should persist the updated priority spread summary on the existing epoch',
    );
    t.match(
      result.publicationRow,
      {
        publicationEpoch: 12,
        status: 'PUBLISHED',
        priorityPartitionSummary: {
          satisfied: false,
        },
      },
      'the caller should receive the refreshed priority spread summary after retry',
    );
  });

test('reconcileClusterMembership falls back to authoritative publication rows when the cache is empty',
  async (t) => {
    const latestPublicationRow = {
      publication_id: 'publication-12',
      publication_kind: 'cluster_membership',
      publication_epoch: 12,
      published_active_node_ids: ['node-1', 'node-2'],
      required_ack_node_ids: ['node-1', 'node-2'],
      acknowledged_node_ids: ['node-1', 'node-2'],
      membership_lifecycle_summary: {
        lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE,
        epochBoundary: 'published_membership',
      },
      status: 'PUBLISHED',
      updated_at: 1200,
      published_at: 1200,
      closed_at: 1200,
    };
    let upsertCallCount = 0;
    let cacheReadCount = 0;
    let authoritativeReadCount = 0;
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: 'node-1',
      controlPlanePublicationsOwner: {
        async listPublicationsFromCache() {
          cacheReadCount += 1;
          return {rows: []};
        },
        async listPublications() {
          authoritativeReadCount += 1;
          return {rows: [latestPublicationRow]};
        },
        async upsertPublication() {
          upsertCallCount += 1;
        },
      },
      systemTableCache: {
        getAll(tableName) {
          if (tableName === 'nodes') {
            return [{
              node_id: 'node-1',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: 5000,
            }, {
              node_id: 'node-2',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: 5000,
            }];
          }
          if (tableName === 'node_endpoints') {
            return [{
              endpoint_id: 'node-1-ws',
              node_id: 'node-1',
              transport_type: 'ws',
              status: 'active',
              address: 'ws://node-1:8082',
            }, {
              endpoint_id: 'node-2-ws',
              node_id: 'node-2',
              transport_type: 'ws',
              status: 'active',
              address: 'ws://node-2:8082',
            }];
          }
          if (tableName === 'services') {
            return [{
              service_id: 'svc-1',
              node_id: 'node-1',
              status: 'active',
            }, {
              service_id: 'svc-2',
              node_id: 'node-2',
              status: 'active',
            }];
          }
          if (tableName === 'control_plane_publications') {
            return [];
          }
          return [];
        },
      },
      now: () => 1500,
    });

    const result = await coordinator.reconcileClusterMembership();

    t.equal(
      cacheReadCount,
      1,
      'the coordinator should consult the cache-backed publication owner first',
    );
    t.equal(
      authoritativeReadCount,
      1,
      'an empty publication cache should fall back to the authoritative owner read',
    );
    t.equal(
      upsertCallCount,
      0,
      'the authoritative published row should prevent opening a duplicate epoch',
    );
    t.match(
      result.publicationRow,
      {
        publicationId: 'publication-12',
        publicationEpoch: 12,
        status: 'PUBLISHED',
        publishedActiveNodeIds: ['node-1', 'node-2'],
        acknowledgedNodeIds: ['node-1', 'node-2'],
      },
      'the authoritative published publication should be reused when the cache is empty',
    );
  });

test('reconcileClusterMembership prefers owner-rpc publication reads during authoritative repair',
  async (t) => {
    let authoritativeReadOptions = null;
    const latestPublicationRow = {
      publication_id: 'publication-12',
      publication_kind: 'cluster_membership',
      publication_epoch: 12,
      published_active_node_ids: ['node-1', 'node-2'],
      required_ack_node_ids: ['node-1', 'node-2'],
      acknowledged_node_ids: ['node-1', 'node-2'],
      membership_lifecycle_summary: {
        lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE,
        epochBoundary: 'published_membership',
      },
      status: 'PUBLISHED',
      updated_at: 1200,
      published_at: 1200,
      closed_at: 1200,
    };
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: 'node-1',
      controlPlanePublicationsOwner: {
        async listPublications(options = {}) {
          authoritativeReadOptions = options;
          return {rows: [latestPublicationRow]};
        },
      },
      systemTableCache: {
        getAll(tableName) {
          if (tableName === 'nodes') {
            return [{
              node_id: 'node-1',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: 5000,
            }, {
              node_id: 'node-2',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: 5000,
            }];
          }
          if (tableName === 'node_endpoints') {
            return [{
              endpoint_id: 'node-1-ws',
              node_id: 'node-1',
              transport_type: 'ws',
              status: 'active',
              address: 'ws://node-1:8082',
            }, {
              endpoint_id: 'node-2-ws',
              node_id: 'node-2',
              transport_type: 'ws',
              status: 'active',
              address: 'ws://node-2:8082',
            }];
          }
          if (tableName === 'services') {
            return [{
              service_id: 'svc-1',
              node_id: 'node-1',
              status: 'active',
            }, {
              service_id: 'svc-2',
              node_id: 'node-2',
              status: 'active',
            }];
          }
          return [];
        },
      },
      now: () => 1500,
    });

    await coordinator.reconcileClusterMembership({
      preferAuthoritativeRead: true,
    });

    t.match(authoritativeReadOptions, {
      preferAuthoritativeRead: true,
      preferOwnerRpcRead: true,
    }, 'authoritative publication repair should request owner-rpc preferred reads');
  });

test('acknowledgePublication persists canonical snake_case fields when the latest publication was read from cache',
  async (t) => {
    const persistedRows = [];
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: 'node-1',
      controlPlanePublicationsOwner: {
        async upsertPublication(row) {
          persistedRows.push(row);
        },
      },
    });

    await coordinator.acknowledgePublication(
      'publication-13',
      'node-2',
      {
        publicationRow: {
          publicationId: 'publication-13',
          publicationKind: 'cluster_membership',
          publicationEpoch: 13,
          status: 'ACK_PENDING',
          publishedActiveNodeIds: ['node-1', 'node-2'],
          requiredAckNodeIds: ['node-1', 'node-2'],
          acknowledgedNodeIds: ['node-1'],
          membershipLifecycleSummary: {
            lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING,
            epochBoundary: 'publication_pending',
          },
          updatedAt: 1200,
          createdAt: 1100,
        },
        nowMs: 1300,
      },
    );

    t.equal(persistedRows.length, 1);
    t.match(
      persistedRows[0],
      {
        publication_id: 'publication-13',
        publication_kind: 'cluster_membership',
        publication_epoch: 13,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1', 'node-2'],
        required_ack_node_ids: ['node-1', 'node-2'],
        acknowledged_node_ids: ['node-1', 'node-2'],
      },
      'acknowledgement writes should preserve canonical system-table field names',
    );
  });

test('acknowledgePublication refreshes the authoritative publication row before persisting acknowledgements',
  async (t) => {
    const persistedRows = [];
    let getPublicationOptions = null;
    let durableRow = {
      publication_id: 'publication-14',
      publication_kind: 'cluster_membership',
      publication_epoch: 14,
      status: 'ACK_PENDING',
      published_active_node_ids: ['node-1', 'node-2', 'node-3'],
      required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
      acknowledged_node_ids: ['node-1', 'node-2'],
    };
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: 'node-3',
      controlPlanePublicationsOwner: {
        async getPublication(publicationId, options = {}) {
          getPublicationOptions = options;
          t.equal(
            publicationId,
            'publication-14',
            'acknowledgements should re-read the latest authoritative publication row',
          );
          return durableRow;
        },
        async upsertPublication(row) {
          persistedRows.push(row);
          durableRow = row;
        },
      },
    });

    await coordinator.acknowledgePublication(
      'publication-14',
      'node-3',
      {
        publicationRow: {
          publicationId: 'publication-14',
          publicationKind: 'cluster_membership',
          publicationEpoch: 14,
          status: 'OPEN',
          publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
          requiredAckNodeIds: ['node-1', 'node-2', 'node-3'],
          acknowledgedNodeIds: [],
        },
        nowMs: 1400,
      },
    );

    t.equal(persistedRows.length, 1);
    t.match(
      persistedRows[0],
      {
        publication_id: 'publication-14',
        publication_epoch: 14,
        status: 'PUBLISHED',
        acknowledged_node_ids: ['node-1', 'node-2', 'node-3'],
      },
      'stale cache acknowledgements should merge from the authoritative publication row before persisting',
    );
    t.match(getPublicationOptions, {
      preferOwnerRpcRead: true,
    }, 'acknowledgement refresh should request owner-rpc preferred publication reads');
  });

test('acknowledgePublication unwraps owner read envelopes before persisting acknowledgements',
  async (t) => {
    const persistedRows = [];
    let durableRow = {
      publication_id: 'publication-15',
      publication_kind: 'cluster_membership',
      publication_epoch: 15,
      status: 'ACK_PENDING',
      published_active_node_ids: ['node-1', 'node-2', 'node-3'],
      required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
      acknowledged_node_ids: ['node-1', 'node-2'],
    };
    const publicationsOwner = new ControlPlanePublicationsOwner({
      controlPlaneSystemTableGateway: {
        async readAuthoritativeRows(_tableName, _sql, params) {
          t.same(
            params,
            ['publication-15'],
            'owner reads should look up the authoritative publication by id',
          );
          return {
            success: true,
            rows: [durableRow],
          };
        },
        async upsertSystemTableRow(_tableName, row) {
          persistedRows.push(row);
          durableRow = row;
        },
      },
    });
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: 'node-3',
      controlPlanePublicationsOwner: publicationsOwner,
    });

    await coordinator.acknowledgePublication(
      'publication-15',
      'node-3',
      {
        publicationRow: {
          publicationId: 'publication-15',
          publicationKind: 'cluster_membership',
          publicationEpoch: 15,
          status: 'OPEN',
          publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
          requiredAckNodeIds: ['node-1', 'node-2', 'node-3'],
          acknowledgedNodeIds: [],
        },
        nowMs: 1500,
      },
    );

    t.equal(persistedRows.length, 1);
    t.match(
      persistedRows[0],
      {
        publication_id: 'publication-15',
        publication_epoch: 15,
        status: 'PUBLISHED',
        acknowledged_node_ids: ['node-1', 'node-2', 'node-3'],
      },
      'gateway read envelopes should be unwrapped to their row before acknowledgement persistence',
    );
  });

test('acknowledgePublication does not persist duplicate acknowledgements that are already durable',
  async (t) => {
    let upsertCallCount = 0;
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: 'node-1',
      controlPlanePublicationsOwner: {
        async getPublication(publicationId) {
          t.equal(
            publicationId,
            'publication-16',
            'duplicate acknowledgements should still read the latest publication row',
          );
          return {
            publication_id: 'publication-16',
            publication_kind: 'cluster_membership',
            publication_epoch: 16,
            status: 'ACK_PENDING',
            published_active_node_ids: ['node-1', 'node-2'],
            required_ack_node_ids: ['node-1', 'node-2'],
            acknowledged_node_ids: ['node-1'],
          };
        },
        async upsertPublication() {
          upsertCallCount += 1;
        },
      },
    });

    const publicationRow = await coordinator.acknowledgePublication(
      'publication-16',
      'node-1',
      {
        publicationRow: {
          publicationId: 'publication-16',
          publicationKind: 'cluster_membership',
          publicationEpoch: 16,
          status: 'OPEN',
          publishedActiveNodeIds: ['node-1', 'node-2'],
          requiredAckNodeIds: ['node-1', 'node-2'],
          acknowledgedNodeIds: [],
        },
        nowMs: 1600,
      },
    );

    t.equal(
      upsertCallCount,
      0,
      'duplicate acknowledgements should not rewrite the durable publication row',
    );
    t.match(
      publicationRow,
      {
        publication_id: 'publication-16',
        acknowledged_node_ids: ['node-1'],
        status: 'ACK_PENDING',
      },
      'the durable acknowledgement state should be returned without a redundant write',
    );
  });

test('acknowledgePublication retries when a concurrent durable rewrite drops merged acknowledgements',
  async (t) => {
    let upsertCallCount = 0;
    let durableRow = {
      publication_id: 'publication-17',
      publication_kind: 'cluster_membership',
      publication_epoch: 17,
      status: 'ACK_PENDING',
      published_active_node_ids: ['node-1', 'node-2', 'node-3'],
      required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
      acknowledged_node_ids: ['node-1'],
      updated_at: 1700,
    };
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: 'node-2',
      controlPlanePublicationsOwner: {
        async getPublication(publicationId, options) {
          t.equal(
            publicationId,
            'publication-17',
            'durable merge retries should read the authoritative publication by id',
          );
          t.match(options, {
            preferOwnerRpcRead: true,
          }, 'durable merge retries should prefer owner-rpc reads');
          return durableRow;
        },
        async upsertPublication(row) {
          upsertCallCount += 1;
          if (upsertCallCount === 1) {
            durableRow = {
              ...row,
              status: 'ACK_PENDING',
              acknowledged_node_ids: ['node-1', 'node-3'],
              updated_at: 1701,
            };
            return;
          }
          durableRow = row;
        },
      },
    });

    const publicationRow = await coordinator.acknowledgePublication(
      'publication-17',
      'node-2',
      {
        publicationRow: {
          publicationId: 'publication-17',
          publicationKind: 'cluster_membership',
          publicationEpoch: 17,
          status: 'OPEN',
          publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
          requiredAckNodeIds: ['node-1', 'node-2', 'node-3'],
          acknowledgedNodeIds: [],
        },
        nowMs: 1702,
      },
    );

    t.equal(
      upsertCallCount,
      2,
      'a dropped durable acknowledgement should trigger one retry with the merged set',
    );
    t.match(
      durableRow,
      {
        publication_id: 'publication-17',
        status: 'PUBLISHED',
        acknowledged_node_ids: ['node-1', 'node-2', 'node-3'],
      },
      'the retried durable publication row should retain the full acknowledgement union',
    );
    t.match(
      publicationRow,
      {
        publication_id: 'publication-17',
        status: 'PUBLISHED',
        acknowledged_node_ids: ['node-1', 'node-2', 'node-3'],
      },
      'the caller should receive the merged durable publication row after retry',
    );
  });

test('deriveClusterMembershipCandidate prefers authoritative reads when membership publication is still in flight',
  async (t) => {
    const tableReadOptions = [];
    const readinessOptions = [];
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: 'node-1',
      controlPlaneReadinessService: {
        async getAllNodeReadiness(options = {}) {
          readinessOptions.push(options);
          return [];
        },
        messageRouter: {
          getConnectedNodes() {
            return [];
          },
        },
      },
    });
    coordinator.readTableRows = async (_tableName, options = {}) => {
      tableReadOptions.push(options);
      return [];
    };

    await coordinator.deriveClusterMembershipCandidate({
      latestPublicationRow: {
        publication_epoch: 12,
        status: 'ACK_PENDING',
        published_active_node_ids: ['node-1', 'node-2'],
        required_ack_node_ids: ['node-1', 'node-2'],
        acknowledged_node_ids: ['node-1'],
      },
      latestPublishedPublicationRow: {
        publication_epoch: 11,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1'],
        required_ack_node_ids: ['node-1'],
        acknowledged_node_ids: ['node-1'],
      },
    });

    t.equal(
      tableReadOptions.length,
      4,
      'deriveClusterMembershipCandidate should read the canonical membership tables once each',
    );
    t.equal(
      tableReadOptions.every((options) =>
        options.preferAuthoritativeRead === true),
      true,
      'in-flight membership publications should force authoritative table reads',
    );
    t.same(
      readinessOptions,
      [{allowAuthoritativeRefresh: true}],
      'readiness should refresh from the authoritative owner during in-flight publication convergence',
    );
  });
