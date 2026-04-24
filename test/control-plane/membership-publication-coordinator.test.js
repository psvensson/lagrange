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
import {ControlPlaneReadinessService} from
  '../../src/control-plane/control-plane-readiness-service.js';
import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
} from '../../src/rebalancer/replica-operation-repository.js';
import {ControlPlanePublicationsOwner} from
  '../../src/control-plane/owners/control-plane-publications-owner.js';
import {registerMembershipPublicationCoordinatorTailTests} from './membership-publication-coordinator-tail-test-cases.js';

const MEMBERSHIP_PUBLICATION_ADMISSION_STATE_BLOCKED = 'blocked';
const MEMBERSHIP_PUBLICATION_ADMISSION_REASON_CLUSTER_INTEGRITY =
  'cluster_incarnation_identity_mismatch';
const MEMBERSHIP_PUBLICATION_BLOCKED_FENCE = Object.freeze({
  state: 'identity_mismatch',
  allowed: false,
  reasonCodes: Object.freeze([
    MEMBERSHIP_PUBLICATION_ADMISSION_REASON_CLUSTER_INTEGRITY,
  ]),
});
const MEMBERSHIP_PUBLICATION_PRIORITY_PARTITION_ID =
  'control_plane_publications-p1';
const MEMBERSHIP_PUBLICATION_CLOSURE_RECORD_ID_PRIORITY_SPREAD =
  'CL-003';
const MEMBERSHIP_PUBLICATION_CLOSURE_WITNESS_CLASS_PRIORITY_SPREAD =
  'publication_converged_priority_spread_pending';
const MEMBERSHIP_PUBLICATION_RECOVERY_PROTOCOL_STATE_STEADY_PUBLISHED =
  'steady_published';

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

test('MembershipPublicationCoordinator resolves control-plane publications owner from membership publication runtime owner',
  async (t) => {
    const publicationsOwner = {
      upsertPublication: async () => ({success: true}),
    };
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: 'node-1',
      membershipPublicationRuntimeOwner: {
        getControlPlanePublicationsOwner: () => publicationsOwner,
      },
    });

    t.equal(
      coordinator.controlPlanePublicationsOwner,
      publicationsOwner,
      'steady-state publication paths should reuse the membership runtime owner surface when provided',
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

test('deriveMembershipPublicationCandidate refreshes stale priority spread metadata from in-flight replace evidence',
  async (t) => {
    const priorityTableIds = [
      'control_plane_publications',
      'replica_operations',
      'sql_transaction_participants',
      'sql_transactions',
      'sql_write_operations',
    ];
    const stalePriorityPartitionSummary = {
      satisfied: false,
      requiredDistinctNodeCount: 3,
      readyEligibleNodeCount: 3,
      totalPriorityPartitionCount: priorityTableIds.length,
      missingPartitionIds: priorityTableIds.map((tableId) => `${tableId}-p1`),
      blockedPartitions: priorityTableIds.map((tableId) => ({
        partitionId: `${tableId}-p1`,
        requiredDistinctNodeCount: 3,
        readyDistinctNodeCount: 2,
        spreadGap: 1,
      })),
    };
    const partitionRows = priorityTableIds.map((tableId) => ({
      table_id: tableId,
      table_name: tableId,
      partition_id: `${tableId}-p1`,
      state: 'NORMAL',
    }));
    const serviceRows = priorityTableIds.flatMap((tableId, index) => {
      const partitionId = `${tableId}-p1`;
      return [{
        service_id: `${tableId}-r${index + 1}-a`,
        node_id: 'node-1',
        partition_id: partitionId,
        service_type: 'partition',
        status: 'active',
        raft_role: 'leader',
        address: `node-1/partition/${partitionId}-r1`,
      }, {
        service_id: `${tableId}-r${index + 1}-b`,
        node_id: 'node-2',
        partition_id: partitionId,
        service_type: 'partition',
        status: 'active',
        raft_role: 'follower',
        address: `node-2/partition/${partitionId}-r2`,
      }];
    });
    const replicaOperationRows = priorityTableIds.map((tableId) => ({
      operation_id: `op-refresh-${tableId}`,
      partition_id: `${tableId}-p1`,
      entity_type: 'partition',
      operation_type: 'REPLACE',
      status: 'active',
      workflow_step: 'ACTIVE',
      source_node_id: 'node-2',
      target_node_id: 'node-3',
      replica_id: `${tableId}-p1-r3`,
      created_at: 1000,
      updated_at: 2000,
    }));
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      latestPublicationRow: {
        publication_epoch: 12,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1', 'node-2', 'node-3'],
        required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
        acknowledged_node_ids: ['node-1', 'node-2', 'node-3'],
        priority_partition_summary: stalePriorityPartitionSummary,
      },
      latestPublishedPublicationRow: {
        publication_epoch: 12,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1', 'node-2', 'node-3'],
        required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
        acknowledged_node_ids: ['node-1', 'node-2', 'node-3'],
        priority_partition_summary: stalePriorityPartitionSummary,
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
      partitionRows,
      serviceRows,
      replicaOperationRows,
      nowMs: 3000,
    });

    t.equal(
      candidate.changed,
      false,
      'the active membership can stay stable while metadata still needs refresh',
    );
    t.match(candidate.priorityRecoveryClosureWitness, {
      state: 'closure_satisfied_stale_publication',
      closureRecordId:
        MEMBERSHIP_PUBLICATION_CLOSURE_RECORD_ID_PRIORITY_SPREAD,
      closureWitnessClass:
        MEMBERSHIP_PUBLICATION_CLOSURE_WITNESS_CLASS_PRIORITY_SPREAD,
    });
    t.match(candidate.priorityPartitionSummary, {
      satisfied: true,
      missingPartitionIds: [],
      blockedPartitions: [],
    });
    t.equal(
      candidate.priorityPartitionSummaryChanged,
      true,
      'the coordinator should mark stale durable spread metadata for refresh',
    );
    t.equal(
      candidate.recoveryProtocolState,
      MEMBERSHIP_PUBLICATION_RECOVERY_PROTOCOL_STATE_STEADY_PUBLISHED,
      'priority spread closure should return the protocol to steady published state',
    );
    t.notOk(
      candidate.priorityRecoveryReasonCodes.includes(
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
      ),
      'stale durable spread reasons should clear once the closure witness satisfies publication refresh',
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

test('deriveMembershipPublicationCandidate excludes an admission-blocked publisher from the next published cohort',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      planningSnapshot: {
        publisherNodeId: 'node-3',
        targetNodeId: 'node-3',
        admissionState: MEMBERSHIP_PUBLICATION_ADMISSION_STATE_BLOCKED,
        admissionReasonCodes: [
          MEMBERSHIP_PUBLICATION_ADMISSION_REASON_CLUSTER_INTEGRITY,
        ],
        clusterIncarnationFence: MEMBERSHIP_PUBLICATION_BLOCKED_FENCE,
        latestPublishedPublicationRow: {
          publication_epoch: 30,
          status: 'PUBLISHED',
          published_active_node_ids: ['node-1', 'node-2', 'node-3'],
          required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
          acknowledged_node_ids: ['node-1', 'node-2', 'node-3'],
        },
        latestPublicationRow: {
          publication_epoch: 30,
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
            ready_lease_expires_at: 6000,
          },
          {
            node_id: 'node-2',
            status: 'active',
            connection_state: 'ready',
            ready_lease_expires_at: 6000,
          },
          {
            node_id: 'node-3',
            status: 'active',
            connection_state: 'ready',
            ready_lease_expires_at: 6000,
          },
        ],
        readinessEntries: [
          {nodeId: 'node-1', dimensions: {clusterMemberHealthy: true}},
          {nodeId: 'node-2', dimensions: {clusterMemberHealthy: true}},
          {nodeId: 'node-3', dimensions: {clusterMemberHealthy: true}},
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
      },
    });

    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1', 'node-2'],
      'the next publication cohort should be rebuilt from admitted participation rather than the stale published baseline',
    );
    t.match(
      candidate.targetParticipation,
      {
        nodeId: 'node-3',
        admissionState: MEMBERSHIP_PUBLICATION_ADMISSION_STATE_BLOCKED,
        admitted: false,
        admissionReasonCodes: [
          MEMBERSHIP_PUBLICATION_ADMISSION_REASON_CLUSTER_INTEGRITY,
        ],
      },
      'the candidate should retain explicit admission evidence for the blocked target node',
    );
    t.match(
      candidate.membershipLifecycleSummary?.participationByNodeId,
      {
        'node-3': {
          admissionState: MEMBERSHIP_PUBLICATION_ADMISSION_STATE_BLOCKED,
          admitted: false,
        },
      },
      'the persisted lifecycle summary should carry the admitted-participation cutover state',
    );
  });

test('MembershipPublicationCoordinator reuses startup-owned admission evidence from the readiness planning answer',
  async (t) => {
    const nodeId = 'node-3';
    const readinessService = new ControlPlaneReadinessService({
      nodeId,
      systemTableCache: {
        get() {
          return null;
        },
        getAll() {
          return [];
        },
        filter() {
          return [];
        },
        onCacheChange() {},
      },
      getLocalClusterIncarnationFence: () =>
        MEMBERSHIP_PUBLICATION_BLOCKED_FENCE,
      membershipPublicationService: {
        async getLatestPublicationForNode(targetNodeId) {
          if (targetNodeId !== nodeId) {
            return null;
          }
          return {
            publicationEpoch: 30,
            status: 'PUBLISHED',
            createdAt: 900,
            publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
            requiredAckNodeIds: ['node-1', 'node-2', 'node-3'],
            acknowledgedNodeIds: ['node-1', 'node-2', 'node-3'],
          };
        },
        getLatestPublicationForNodeSync(targetNodeId) {
          if (targetNodeId !== nodeId) {
            return null;
          }
          return {
            publicationEpoch: 30,
            status: 'PUBLISHED',
            createdAt: 900,
            publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
            requiredAckNodeIds: ['node-1', 'node-2', 'node-3'],
            acknowledgedNodeIds: ['node-1', 'node-2', 'node-3'],
          };
        },
      },
      now: () => 1000,
    });
    const coordinator = new MembershipPublicationCoordinator({
      nodeId,
      controlPlaneReadinessService: readinessService,
      now: () => 1000,
    });

    const candidate = await coordinator.deriveClusterMembershipCandidate({
      publisherNodeId: nodeId,
      latestPublishedPublicationRow: {
        publication_epoch: 30,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1', 'node-2', 'node-3'],
        required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
        acknowledged_node_ids: ['node-1', 'node-2', 'node-3'],
      },
      latestPublicationRow: {
        publication_epoch: 30,
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
          ready_lease_expires_at: 6000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 6000,
        },
        {
          node_id: nodeId,
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 6000,
        },
      ],
      readinessEntries: [
        {nodeId: 'node-1', dimensions: {clusterMemberHealthy: true}},
        {nodeId: 'node-2', dimensions: {clusterMemberHealthy: true}},
        {nodeId, dimensions: {clusterMemberHealthy: true}},
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
          node_id: nodeId,
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-3:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
        {service_id: 'svc-3', node_id: nodeId, status: 'active'},
      ],
      nowMs: 1000,
    });

    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1', 'node-2'],
      'nested planning reads should exclude the blocked local node from the next publication cohort',
    );
    t.equal(
      candidate.admissionState,
      MEMBERSHIP_PUBLICATION_ADMISSION_STATE_BLOCKED,
      'the publication candidate should preserve the readiness-owned admission state',
    );
    t.same(
      candidate.admissionReasonCodes,
      [MEMBERSHIP_PUBLICATION_ADMISSION_REASON_CLUSTER_INTEGRITY],
      'the publication candidate should preserve the readiness-owned admission reasons',
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

test('deriveMembershipPublicationCandidate carries forward overlapping ' +
  'durable acknowledgements when reopening a wider membership epoch',
async (t) => {
  const REOPEN_PUBLICATION_EPOCH = 13;
  const REOPEN_PUBLICATION_NOW_MS = 1000;
  const candidate = deriveMembershipPublicationCandidate({
    publisherNodeId: 'seed-node',
    sourceTopologyEpoch: 13,
    sourceSnapshotVersion: 22,
    latestPublicationRow: {
      publication_epoch: 12,
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
      {nodeId: 'node-1', dimensions: {clusterMemberHealthy: true}},
      {nodeId: 'node-2', dimensions: {clusterMemberHealthy: true}},
      {nodeId: 'node-3', dimensions: {clusterMemberHealthy: true}},
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
    nowMs: REOPEN_PUBLICATION_NOW_MS,
  });

  t.equal(
    candidate.publicationEpoch,
    REOPEN_PUBLICATION_EPOCH,
    'widened membership should still advance to the next publication epoch',
  );
  t.same(
    candidate.requiredAckNodeIds,
    ['node-1', 'node-2', 'node-3'],
    'the widened publication should require acknowledgement from the full new membership',
  );
  t.same(
    candidate.acknowledgedNodeIds,
    ['node-1', 'node-2'],
    'durably acknowledged overlap should carry forward into the reopened epoch',
  );

  const publicationRow = buildMembershipPublicationRow({
    candidate,
    nowMs: REOPEN_PUBLICATION_NOW_MS + 1,
  });

  t.match(
    publicationRow,
    {
      status: 'OPEN',
      required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
      acknowledged_node_ids: ['node-1', 'node-2'],
    },
    'the reopened durable row should preserve overlapping acknowledgements while waiting for the new node',
  );
});


registerMembershipPublicationCoordinatorTailTests({
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
