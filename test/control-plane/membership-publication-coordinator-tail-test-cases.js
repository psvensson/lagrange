import {registerMembershipPublicationCoordinatorTailAckForNodeTests} from './membership-publication-coordinator-tail-ack-for-node-test-cases.js';
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
          'schema_operations-p1',
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
          {partition_id: 'schema_operations-p1', table_id: 'schema_operations'},
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
          ...['node-1', 'node-2', 'node-3'].map((nodeId, index) => ({
            service_id: `schema-ops-r${index + 1}`,
            node_id: nodeId,
            partition_id: 'schema_operations-p1',
            service_type: 'partition',
            status: 'active',
            raft_role: index === 0 ? 'leader' : 'follower',
            address: `${nodeId}/partition/schema_operations-p1-r${index + 1}`,
          })),
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

  registerMembershipPublicationCoordinatorTailAckForNodeTests({
    test,
    MembershipPublicationCoordinator,
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
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
