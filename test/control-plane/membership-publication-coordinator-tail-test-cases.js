import {registerMembershipPublicationCoordinatorTailMoreTests} from './membership-publication-coordinator-tail-more-test-cases.js';

export function registerMembershipPublicationCoordinatorTailTests({
  test,
  acknowledgeMembershipPublication,
  buildMembershipPublicationRow,
  deriveMembershipPublicationCandidate,
  MembershipPublicationCoordinator,
  MEMBERSHIP_LIFECYCLE_STATE,
  isValidMembershipLifecycleTransition,
  ControlPlaneReadinessService,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  ControlPlanePublicationsOwner,
}) {
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

  test('buildMembershipPublicationRow honors ack-complete candidate publication status',
    async (t) => {
      const PUBLICATION_ID = 'publication-ack-complete-row';
      const PUBLICATION_KIND = 'cluster_membership';
      const PUBLICATION_EPOCH = 9;
      const PUBLISHER_NODE_ID = 'seed-node';
      const NOW_MS = 1700;
      const PUBLISHED_STATUS = 'PUBLISHED';
      const NODE_IDS = Object.freeze([
        'node-1',
        'node-2',
      ]);
      const REASON_CODE = 'required_acknowledgements_completed';

      const publicationRow = buildMembershipPublicationRow({
        publicationId: PUBLICATION_ID,
        nowMs: NOW_MS,
        candidate: {
          publicationKind: PUBLICATION_KIND,
          publicationEpoch: PUBLICATION_EPOCH,
          publicationStatus: PUBLISHED_STATUS,
          publisherNodeId: PUBLISHER_NODE_ID,
          publishedActiveNodeIds: [...NODE_IDS],
          requiredAckNodeIds: [...NODE_IDS],
          acknowledgedNodeIds: [...NODE_IDS],
          reasonCode: REASON_CODE,
        },
      });

      t.match(publicationRow, {
        publication_id: PUBLICATION_ID,
        publication_kind: PUBLICATION_KIND,
        publication_epoch: PUBLICATION_EPOCH,
        publisher_node_id: PUBLISHER_NODE_ID,
        status: PUBLISHED_STATUS,
        published_at: NOW_MS,
        closed_at: NOW_MS,
        acknowledged_node_ids: [...NODE_IDS],
        membership_lifecycle_summary: {
          lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE,
          publishedActiveNodeIds: [...NODE_IDS],
          memberStatesByNodeId: {
            'node-1': 'serving',
            'node-2': 'serving',
          },
        },
      });
      t.match(publicationRow.transition_history, [
        {
          state: PUBLISHED_STATUS,
          reasonCode: REASON_CODE,
          at: NOW_MS,
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
        nodeId: 'node-1',
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
      let durablePublicationRow = {
        publication_id: 'publication-20',
        publication_kind: 'cluster_membership',
        publication_epoch: 20,
        status: 'OPEN',
        published_active_node_ids: ['node-1', 'node-2'],
        required_ack_node_ids: ['node-1', 'node-2'],
        acknowledged_node_ids: [],
      };
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
            return durablePublicationRow;
          },
          async upsertPublication(row) {
            persistedRows.push(row);
            durablePublicationRow = row;
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
        3,
        'owner reads should merge and verify the acknowledgement write',
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
      let durablePublicationRow = {
        publication_id: 'publication-21',
        publication_kind: 'cluster_membership',
        publication_epoch: 21,
        status: 'ACK_PENDING',
        published_active_node_ids: ['node-1', 'node-2'],
        required_ack_node_ids: ['node-1'],
        acknowledged_node_ids: [],
      };
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
            return durablePublicationRow;
          },
          async upsertPublication(row) {
            persistedRows.push(row);
            durablePublicationRow = row;
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
          authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED,
        },
        'authoritative refresh should prefer owner-rpc publication history',
      );
      t.equal(
        persistedRows.length,
        1,
        'authoritative-refresh row should be acknowledged when the node becomes required',
      );
      t.equal(
        getPublicationCalls.length,
        3,
        'authoritative acknowledgement should merge and verify the publication by id',
      );
      t.equal(
        publicationRow?.acknowledged_node_ids?.[0],
        'node-1',
        'refresh+ack should persist the node acknowledgement',
      );
      t.end();
    });

  test('acknowledgeMembershipPublicationForNode refreshes owner-rpc publication history when the local publication cache is empty',
    async (t) => {
      const PUBLICATIONS_TABLE = 'control_plane_publications';
      const PUBLICATION_ID = 'publication-20-owner';
      const PUBLICATION_KIND = 'cluster_membership';
      const PUBLICATION_EPOCH = 20;
      const ACK_PENDING_STATUS = 'ACK_PENDING';
      const FIRST_NODE_ID = 'node-1';
      const SECOND_NODE_ID = 'node-2';
      const REQUIRED_NODE_IDS = Object.freeze([
        FIRST_NODE_ID,
        SECOND_NODE_ID,
      ]);
      const listPublicationsCalls = [];
      const getPublicationCalls = [];
      const persistedRows = [];
      let durablePublicationRow = {
        publication_id: PUBLICATION_ID,
        publication_kind: PUBLICATION_KIND,
        publication_epoch: PUBLICATION_EPOCH,
        status: ACK_PENDING_STATUS,
        published_active_node_ids: [...REQUIRED_NODE_IDS],
        required_ack_node_ids: [...REQUIRED_NODE_IDS],
        acknowledged_node_ids: [SECOND_NODE_ID],
      };
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'seed-node',
        systemTableCache: {
          getAll(tableName) {
            if (tableName !== PUBLICATIONS_TABLE) {
              return [];
            }
            return [];
          },
        },
        controlPlanePublicationsOwner: {
          async listPublications(options = {}) {
            listPublicationsCalls.push(options);
            return {
              rows: [durablePublicationRow],
            };
          },
          async getPublication(publicationId) {
            getPublicationCalls.push(publicationId);
            return durablePublicationRow;
          },
          async upsertPublication(row) {
            persistedRows.push(row);
            durablePublicationRow = row;
          },
        },
      });

      const publicationRow =
      await coordinator.acknowledgeMembershipPublicationForNode(FIRST_NODE_ID);

      t.equal(
        listPublicationsCalls.length,
        1,
        'empty publication cache should trigger one authoritative publication list refresh',
      );
      t.match(
        listPublicationsCalls[0],
        {
          authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED,
        },
        'empty-cache acknowledgement refresh should prefer owner-rpc publication history',
      );
      t.equal(
        getPublicationCalls.length,
        3,
        'empty-cache acknowledgement should still merge and verify the durable publication row',
      );
      t.match(
        persistedRows[0],
        {
          publication_id: PUBLICATION_ID,
          status: 'PUBLISHED',
          acknowledged_node_ids: [...REQUIRED_NODE_IDS],
        },
        'owner-rpc refresh should acknowledge the durable empty-cache publication row',
      );
      t.match(
        publicationRow,
        {
          publication_id: PUBLICATION_ID,
          status: 'PUBLISHED',
          acknowledged_node_ids: [...REQUIRED_NODE_IDS],
        },
        'caller should receive the empty-cache durable publication row after acknowledgement',
      );
      t.end();
    });

  test('acknowledgeMembershipPublicationForNode refreshes owner-rpc publication history when cache still shows pending target acknowledgement',
    async (t) => {
      const PUBLICATIONS_TABLE = 'control_plane_publications';
      const PUBLICATION_KIND = 'cluster_membership';
      const STALE_PUBLICATION_ID = 'publication-29-stale';
      const FRESH_PUBLICATION_ID = 'publication-30';
      const STALE_PUBLICATION_EPOCH = 29;
      const FRESH_PUBLICATION_EPOCH = 30;
      const ACK_PENDING_STATUS = 'ACK_PENDING';
      const PUBLISHED_STATUS = 'PUBLISHED';
      const FIRST_NODE_ID = 'node-1';
      const SECOND_NODE_ID = 'node-2';
      const REQUIRED_NODE_IDS = Object.freeze([
        FIRST_NODE_ID,
        SECOND_NODE_ID,
      ]);
      const listPublicationsCalls = [];
      const getPublicationCalls = [];
      const persistedRows = [];
      let durablePublicationRow = {
        publication_id: FRESH_PUBLICATION_ID,
        publication_kind: PUBLICATION_KIND,
        publication_epoch: FRESH_PUBLICATION_EPOCH,
        status: ACK_PENDING_STATUS,
        published_active_node_ids: [...REQUIRED_NODE_IDS],
        required_ack_node_ids: [...REQUIRED_NODE_IDS],
        acknowledged_node_ids: [SECOND_NODE_ID],
      };
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'seed-node',
        systemTableCache: {
          getAll(tableName) {
            if (tableName !== PUBLICATIONS_TABLE) {
              return [];
            }
            return [
              {
                publication_id: STALE_PUBLICATION_ID,
                publication_kind: PUBLICATION_KIND,
                publication_epoch: STALE_PUBLICATION_EPOCH,
                status: ACK_PENDING_STATUS,
                published_active_node_ids: [...REQUIRED_NODE_IDS],
                required_ack_node_ids: [...REQUIRED_NODE_IDS],
                acknowledged_node_ids: [],
              },
            ];
          },
        },
        controlPlanePublicationsOwner: {
          async listPublications(options = {}) {
            listPublicationsCalls.push(options);
            return {
              rows: [durablePublicationRow],
            };
          },
          async getPublication(publicationId) {
            getPublicationCalls.push(publicationId);
            return durablePublicationRow;
          },
          async upsertPublication(row) {
            persistedRows.push(row);
            durablePublicationRow = row;
          },
        },
      });

      const publicationRow =
      await coordinator.acknowledgeMembershipPublicationForNode(FIRST_NODE_ID);

      t.equal(
        listPublicationsCalls.length,
        1,
        'pending-target-ack cache rows should refresh the latest publication from the owner',
      );
      t.match(
        listPublicationsCalls[0],
        {
          authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED,
        },
        'pending-target-ack refresh should prefer owner-rpc publication history',
      );
      t.equal(
        getPublicationCalls.length,
        3,
        'refreshed acknowledgement should still merge and verify the durable row',
      );
      t.match(
        persistedRows[0],
        {
          publication_id: FRESH_PUBLICATION_ID,
          status: PUBLISHED_STATUS,
          acknowledged_node_ids: [...REQUIRED_NODE_IDS],
        },
        'owner-rpc refresh should acknowledge the newer publication epoch instead of the stale cache row',
      );
      t.match(
        publicationRow,
        {
          publication_id: FRESH_PUBLICATION_ID,
          status: PUBLISHED_STATUS,
          acknowledged_node_ids: [...REQUIRED_NODE_IDS],
        },
        'caller should receive the refreshed durable publication row',
      );
      t.end();
    });

  test('acknowledgeMembershipPublicationForNode refreshes from authoritative when cache has terminal stale publication',
    async (t) => {
      const PUBLICATIONS_TABLE = 'control_plane_publications';
      const PUBLICATION_KIND = 'cluster_membership';
      const STALE_PUBLICATION_ID = 'publication-25-stale';
      const FRESH_PUBLICATION_ID = 'publication-26';
      const STALE_PUBLICATION_EPOCH = 25;
      const FRESH_PUBLICATION_EPOCH = 26;
      const PUBLISHED_STATUS = 'PUBLISHED';
      const ACK_PENDING_STATUS = 'ACK_PENDING';
      const FIRST_NODE_ID = 'node-1';
      const SECOND_NODE_ID = 'node-2';
      const REQUIRED_NODE_IDS = Object.freeze([
        FIRST_NODE_ID,
        SECOND_NODE_ID,
      ]);
      const listPublicationsCalls = [];
      const getPublicationCalls = [];
      const persistedRows = [];
      let durablePublicationRow = {
        publication_id: FRESH_PUBLICATION_ID,
        publication_kind: PUBLICATION_KIND,
        publication_epoch: FRESH_PUBLICATION_EPOCH,
        status: ACK_PENDING_STATUS,
        published_active_node_ids: [...REQUIRED_NODE_IDS],
        required_ack_node_ids: [...REQUIRED_NODE_IDS],
        acknowledged_node_ids: [SECOND_NODE_ID],
      };
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'seed-node',
        systemTableCache: {
          getAll(tableName) {
            if (tableName !== PUBLICATIONS_TABLE) {
              return [];
            }
            return [
              {
                publication_id: STALE_PUBLICATION_ID,
                publication_kind: PUBLICATION_KIND,
                publication_epoch: STALE_PUBLICATION_EPOCH,
                status: PUBLISHED_STATUS,
                published_active_node_ids: [...REQUIRED_NODE_IDS],
                required_ack_node_ids: [...REQUIRED_NODE_IDS],
                acknowledged_node_ids: [...REQUIRED_NODE_IDS],
              },
            ];
          },
        },
        controlPlanePublicationsOwner: {
          async listPublications(options = {}) {
            listPublicationsCalls.push(options);
            return {
              rows: [durablePublicationRow],
            };
          },
          async getPublication(publicationId) {
            getPublicationCalls.push(publicationId);
            return durablePublicationRow;
          },
          async upsertPublication(row) {
            persistedRows.push(row);
            durablePublicationRow = row;
          },
        },
      });

      const publicationRow =
      await coordinator.acknowledgeMembershipPublicationForNode(FIRST_NODE_ID);

      t.equal(
        listPublicationsCalls.length,
        1,
        'terminal cache rows should trigger an authoritative publication list refresh',
      );
      t.match(
        listPublicationsCalls[0],
        {
          authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED,
        },
        'terminal-cache refresh should prefer owner-rpc publication history',
      );
      t.equal(
        persistedRows.length,
        1,
        'newer authoritative rows should be acknowledged when stale cache is terminal',
      );
      t.equal(
        getPublicationCalls.length,
        3,
        'terminal-cache acknowledgement should merge and verify the publication by id',
      );
      t.match(
        persistedRows[0],
        {
          publication_id: FRESH_PUBLICATION_ID,
          status: PUBLISHED_STATUS,
          acknowledged_node_ids: [...REQUIRED_NODE_IDS],
        },
        'fresh publication should close once the missing node acknowledgement is added',
      );
      t.match(
        publicationRow,
        {
          publication_id: FRESH_PUBLICATION_ID,
          status: PUBLISHED_STATUS,
          acknowledged_node_ids: [...REQUIRED_NODE_IDS],
        },
        'acknowledgement result should reflect the refreshed durable publication row',
      );
      t.end();
    });

  test('acknowledgeMembershipPublicationForNode rechecks durable state when cache already has the node ack',
    async (t) => {
      const listPublicationsCalls = [];
      const persistedRows = [];
      let durablePublicationRow = {
        publication_id: 'publication-24',
        publication_kind: 'cluster_membership',
        publication_epoch: 24,
        status: 'ACK_PENDING',
        published_active_node_ids: ['node-1', 'node-2'],
        required_ack_node_ids: ['node-1', 'node-2'],
        acknowledged_node_ids: [],
      };
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'seed-node',
        systemTableCache: {
          getAll(tableName) {
            if (tableName !== 'control_plane_publications') {
              return [];
            }
            return [
              {
                publication_id: 'publication-24',
                publication_kind: 'cluster_membership',
                publication_epoch: 24,
                status: 'ACK_PENDING',
                published_active_node_ids: ['node-1', 'node-2'],
                required_ack_node_ids: ['node-1', 'node-2'],
                acknowledged_node_ids: ['node-1'],
              },
            ];
          },
        },
        controlPlanePublicationsOwner: {
          async listPublications(options = {}) {
            listPublicationsCalls.push(options);
            return {rows: [durablePublicationRow]};
          },
          async getPublication() {
            return durablePublicationRow;
          },
          async upsertPublication(row) {
            persistedRows.push(row);
            durablePublicationRow = row;
          },
        },
      });

      const publicationRow =
      await coordinator.acknowledgeMembershipPublicationForNode('node-1');

      t.equal(
        listPublicationsCalls.length,
        1,
        'in-flight duplicate acknowledgements should verify durable publication state',
      );
      t.equal(
        persistedRows.length,
        1,
        'missing durable acknowledgement should be restored even when cache had the node ack',
      );
      t.match(
        publicationRow,
        {
          publication_id: 'publication-24',
          status: 'ACK_PENDING',
          acknowledged_node_ids: ['node-1'],
        },
        'acknowledgement result should reflect the repaired durable row',
      );
      t.end();
    });

  test('acknowledgeMembershipPublicationForNode retries when durable readback drops a merged acknowledgement',
    async (t) => {
      let upsertCallCount = 0;
      let durablePublicationRow = {
        publication_id: 'publication-25',
        publication_kind: 'cluster_membership',
        publication_epoch: 25,
        status: 'ACK_PENDING',
        published_active_node_ids: ['node-1', 'node-2', 'node-3'],
        required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
        acknowledged_node_ids: ['node-1', 'node-3'],
        updated_at: 2500,
      };
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'seed-node',
        systemTableCache: {
          getAll(tableName) {
            if (tableName !== 'control_plane_publications') {
              return [];
            }
            return [
              {
                publication_id: 'publication-25',
                publication_kind: 'cluster_membership',
                publication_epoch: 25,
                status: 'ACK_PENDING',
                published_active_node_ids: ['node-1', 'node-2', 'node-3'],
                required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
                acknowledged_node_ids: ['node-1'],
              },
            ];
          },
        },
        controlPlanePublicationsOwner: {
          async getPublication() {
            return durablePublicationRow;
          },
          async upsertPublication(row) {
            upsertCallCount += 1;
            if (upsertCallCount === 1) {
              durablePublicationRow = {
                ...row,
                status: 'ACK_PENDING',
                acknowledged_node_ids: ['node-1', 'node-2'],
                updated_at: 2501,
              };
              return;
            }
            durablePublicationRow = row;
          },
        },
      });

      const publicationRow =
      await coordinator.acknowledgeMembershipPublicationForNode('node-2');

      t.equal(
        upsertCallCount,
        2,
        'membership acknowledgement path should retry dropped durable acknowledgement unions',
      );
      t.match(
        durablePublicationRow,
        {
          publication_id: 'publication-25',
          status: 'PUBLISHED',
          acknowledged_node_ids: ['node-1', 'node-2', 'node-3'],
        },
        'readback retry should preserve every merged acknowledgement',
      );
      t.match(
        publicationRow,
        {
          publication_id: 'publication-25',
          status: 'PUBLISHED',
          acknowledged_node_ids: ['node-1', 'node-2', 'node-3'],
        },
        'caller should receive the verified durable publication row',
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
          authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED,
        },
        'owner refresh should prefer owner-rpc publication history',
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

  test('acknowledgeMembershipPublicationForNode closes duplicate fully acknowledged open rows',
    async (t) => {
      const PUBLICATIONS_TABLE = 'control_plane_publications';
      const PUBLICATION_ID = 'publication-23';
      const PUBLICATION_KIND = 'cluster_membership';
      const PUBLICATION_EPOCH = 23;
      const OPEN_STATUS = 'OPEN';
      const PUBLISHED_STATUS = 'PUBLISHED';
      const FIRST_NODE_ID = 'node-1';
      const SECOND_NODE_ID = 'node-2';
      const REQUIRED_NODE_IDS = Object.freeze([
        FIRST_NODE_ID,
        SECOND_NODE_ID,
      ]);
      const persistedRows = [];
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'seed-node',
        systemTableCache: {
          getAll(tableName) {
            if (tableName !== PUBLICATIONS_TABLE) {
              return [];
            }
            return [
              {
                publication_id: PUBLICATION_ID,
                publication_kind: PUBLICATION_KIND,
                publication_epoch: PUBLICATION_EPOCH,
                status: OPEN_STATUS,
                published_active_node_ids: [...REQUIRED_NODE_IDS],
                required_ack_node_ids: [...REQUIRED_NODE_IDS],
                acknowledged_node_ids: [...REQUIRED_NODE_IDS],
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
      await coordinator.acknowledgeMembershipPublicationForNode(FIRST_NODE_ID);

      t.equal(
        persistedRows.length,
        1,
        'fully acknowledged open rows should be repaired by the next duplicate acknowledgement',
      );
      t.match(
        persistedRows[0],
        {
          publication_id: PUBLICATION_ID,
          status: PUBLISHED_STATUS,
          acknowledged_node_ids: [...REQUIRED_NODE_IDS],
        },
        'duplicate acknowledgement should close the publication when every required ack is already present',
      );
      t.equal(
        publicationRow?.status,
        PUBLISHED_STATUS,
        'acknowledge result should return the repaired published row',
      );
      t.end();
    });


  registerMembershipPublicationCoordinatorTailMoreTests({
    test,
    acknowledgeMembershipPublication,
    buildMembershipPublicationRow,
    deriveMembershipPublicationCandidate,
    MembershipPublicationCoordinator,
    MEMBERSHIP_LIFECYCLE_STATE,
    isValidMembershipLifecycleTransition,
    ControlPlaneReadinessService,
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
    REPLICA_OPERATION_VISIBILITY_READ_MODE,
    ControlPlanePublicationsOwner,
  });
}
