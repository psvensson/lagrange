import {test} from '../../src/test-helpers/tap.js';
import {
  buildMembershipPublicationActiveSnapshot,
  resolveCanonicalActiveNodeIds,
  resolvePublishedActiveNodeIds,
} from '../../src/control-plane/active-node-projection.js';
import {
  buildPublicationRecoveryProtocolSnapshot,
} from '../../src/control-plane/recovery-protocol-snapshot.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';

const ACTIVE_NODE_ADMISSION_STATE_BLOCKED = 'blocked';
const ACTIVE_NODE_ADMISSION_REASON_CLUSTER_INTEGRITY =
  'cluster_incarnation_identity_mismatch';
const ACTIVE_NODE_PARTICIPATION_REASON_READINESS_EXCLUDED =
  'readiness_excluded';
const ACTIVE_NODE_PARTICIPATION_REASON_CLUSTER_MEMBER_UNHEALTHY =
  'cluster_member_unhealthy';
const ACTIVE_NODE_BLOCKED_FENCE = Object.freeze({
  state: 'identity_mismatch',
  allowed: false,
  reasonCodes: Object.freeze([ACTIVE_NODE_ADMISSION_REASON_CLUSTER_INTEGRITY]),
});

export function registerActiveNodeProjectionMembershipPublicationTests() {
  test('active-node projection prefers the durable published active-node set when a publication epoch is closed',
    async (t) => {
      const activeNodeIds = resolveCanonicalActiveNodeIds({
        nodeRows: [
          {
            node_id: 'node-1',
            status: 'active',
            connection_state: 'ready',
            ready_lease_expires_at: 2000,
          },
          {
            node_id: 'node-2',
            status: 'active',
            connection_state: 'ready',
            ready_lease_expires_at: 2000,
          },
          {
            node_id: 'node-3',
            status: 'active',
            connection_state: 'ready',
            ready_lease_expires_at: 2000,
          },
        ],
        serviceRows: [
          {
            service_id: 'svc-node-1',
            service_type: 'message_group',
            node_id: 'node-1',
            status: 'active',
          },
          {
            service_id: 'svc-node-2',
            service_type: 'message_group',
            node_id: 'node-2',
            status: 'active',
          },
          {
            service_id: 'svc-node-3',
            service_type: 'message_group',
            node_id: 'node-3',
            status: 'active',
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
        readinessEntries: [
          {
            nodeId: 'node-1',
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            },
          },
          {
            nodeId: 'node-2',
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            },
          },
          {
            nodeId: 'node-3',
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            },
          },
        ],
        latestPublicationRow: {
          publication_epoch: 14,
          status: 'PUBLISHED',
          published_active_node_ids: ['node-1', 'node-3'],
        },
        nowMs: 1000,
      });

      t.same(
        activeNodeIds,
        ['node-1', 'node-3'],
        'projection should prefer the durable published active-node set over repaired cache observation once the epoch is closed',
      );
    });
  test('active-node projection builds a canonical membership publication snapshot from publication rows',
    async (t) => {
      const snapshot = buildMembershipPublicationActiveSnapshot({
        publication_epoch: 19,
        status: 'PUBLISHED',
        source_topology_epoch: 7,
        source_snapshot_version: 23,
        published_active_node_ids: ['node-a'],
        required_ack_node_ids: ['node-a', 'node-b'],
        acknowledged_node_ids: ['node-a'],
        priority_partition_summary: {
          satisfied: false,
          missingPartitionIds: ['sql_transactions-p1'],
        },
        recovery_active_node_ids: ['node-a', 'node-b'],
        recovery_active_node_source: 'recovery_eligible_projection',
        membership_lifecycle_summary: {
          projectionDiagnostics: {
            recoveryEligibleIncludedNodeIds: ['node-b'],
          },
        },
      });

      t.match(snapshot, {
        publicationEpoch: 19,
        status: 'PUBLISHED',
        publicationStatus: 'PUBLISHED',
        sourceTopologyEpoch: 7,
        sourceSnapshotVersion: 23,
        publishedActiveNodeIdsPresent: true,
        publishedActiveNodeIds: ['node-a'],
        requiredAckNodeIds: ['node-a', 'node-b'],
        acknowledgedNodeIds: ['node-a'],
        recoveryActiveNodeIds: ['node-a', 'node-b'],
        recoveryActiveNodeSource: 'recovery_eligible_projection',
        missingPublishedRecoveryActiveNodeIds: ['node-b'],
      });
      t.same(
        snapshot?.projectionDiagnostics,
        {
          recoveryEligibleIncludedNodeIds: ['node-b'],
        },
        'canonical publication snapshots should preserve projection diagnostics once at the owner boundary',
      );
    });

  test('active-node projection excludes an admission-blocked target from the concrete recovery cohort',
    async (t) => {
      const snapshot = buildMembershipPublicationActiveSnapshot({
        publication_epoch: 23,
        status: 'PUBLISHED',
        target_node_id: 'node-c',
        admission_state: ACTIVE_NODE_ADMISSION_STATE_BLOCKED,
        admission_reason_codes: [
          ACTIVE_NODE_ADMISSION_REASON_CLUSTER_INTEGRITY,
        ],
        cluster_incarnation_fence: ACTIVE_NODE_BLOCKED_FENCE,
        published_active_node_ids: ['node-a', 'node-b', 'node-c'],
        membership_lifecycle_summary: {
          publishedActiveNodeIds: ['node-a', 'node-b', 'node-c'],
          projectedServingNodeIds: ['node-a', 'node-b', 'node-c'],
          locallyEligibleNodeIds: ['node-a', 'node-b', 'node-c'],
          participationByNodeId: {
            'node-c': {
              nodeId: 'node-c',
              state: 'recovery_pending_publish',
              admissionState: ACTIVE_NODE_ADMISSION_STATE_BLOCKED,
              admissionReasonCodes: [
                ACTIVE_NODE_ADMISSION_REASON_CLUSTER_INTEGRITY,
              ],
              clusterIncarnationFence: ACTIVE_NODE_BLOCKED_FENCE,
            },
          },
        },
        recovery_active_node_ids: ['node-a', 'node-b', 'node-c'],
        recovery_active_node_source: 'recovery_eligible_projection',
      });

      t.same(
        snapshot?.publishedActiveNodeIds,
        ['node-a', 'node-b', 'node-c'],
        'the durable publication snapshot should remain observable while admission is blocked',
      );
      t.same(
        snapshot?.concreteEligibleNodeIds,
        ['node-a', 'node-b'],
        'the concrete recovery cohort should exclude the blocked target node',
      );
      t.same(
        snapshot?.recoveryActiveNodeIds,
        ['node-a', 'node-b'],
        'the recovery-active cohort should follow the admitted participation set',
      );
      t.same(
        snapshot?.missingPublishedRecoveryActiveNodeIds,
        [],
        'removing the blocked target from the admitted cohort should not fabricate a missing-publication gap',
      );
    });

  test('active-node projection excludes a readiness-blocked target from the concrete recovery cohort',
    async (t) => {
      const membershipPublication = {
        publication_epoch: 29,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-a', 'node-b'],
        membership_lifecycle_summary: {
          publishedActiveNodeIds: ['node-a', 'node-b'],
          projectedServingNodeIds: ['node-a', 'node-b'],
          locallyEligibleNodeIds: ['node-a', 'node-b'],
          recoveryActiveNodeIds: ['node-a', 'node-b', 'node-c'],
          recoveryActiveNodeSource: 'recovery_eligible_projection',
          missingPublishedRecoveryActiveNodeIds: ['node-c'],
          projectionDiagnostics: {
            readinessExcludedNodeIds: ['node-c'],
            clusterMemberUnhealthyExcludedNodeIds: ['node-c'],
          },
        },
        recovery_active_node_ids: ['node-a', 'node-b', 'node-c'],
        recovery_active_node_source: 'recovery_eligible_projection',
        missing_published_recovery_active_node_ids: ['node-c'],
      };
      const snapshot = buildMembershipPublicationActiveSnapshot(
        membershipPublication,
      );
      const recoveryProtocolSnapshot = buildPublicationRecoveryProtocolSnapshot(
        membershipPublication,
      );

      t.same(
        snapshot?.publishedActiveNodeIds,
        ['node-a', 'node-b'],
        'the durable published active set should remain observable',
      );
      t.same(
        snapshot?.projectionDiagnostics,
        {
          readinessExcludedNodeIds: ['node-c'],
          clusterMemberUnhealthyExcludedNodeIds: ['node-c'],
        },
        'projection diagnostics should preserve the readiness exclusion reason',
      );
      t.same(
        snapshot?.concreteEligibleNodeIds,
        ['node-a', 'node-b'],
        'the concrete recovery cohort should exclude readiness-blocked nodes',
      );
      t.same(
        snapshot?.recoveryActiveNodeIds,
        ['node-a', 'node-b'],
        'the recovery-active cohort should follow projection readiness',
      );
      t.same(
        snapshot?.missingPublishedRecoveryActiveNodeIds,
        [],
        'a readiness-excluded target should not fabricate a missing-publication gap',
      );
      t.same(
        recoveryProtocolSnapshot?.participationByNodeId?.['node-c']?.reasons,
        [
          ACTIVE_NODE_PARTICIPATION_REASON_READINESS_EXCLUDED,
          ACTIVE_NODE_PARTICIPATION_REASON_CLUSTER_MEMBER_UNHEALTHY,
        ],
        'participation evidence should keep the concrete readiness-blocking reason',
      );
    });

  test('active-node projection preserves explicit published-membership presence even when the node array is absent',
    async (t) => {
      const snapshot = buildMembershipPublicationActiveSnapshot({
        publicationEpoch: 11,
        status: 'OPEN',
        publishedActiveNodeIdsPresent: true,
        membershipLifecycleSummary: {
          recoveryActiveNodeIds: ['node-a'],
          recoveryActiveNodeSource: 'locally_eligible_projection',
        },
      });

      t.equal(snapshot?.publishedActiveNodeIdsPresent, true);
      t.same(snapshot?.publishedActiveNodeIds, []);
      t.same(snapshot?.recoveryActiveNodeIds, ['node-a']);
      t.equal(
        snapshot?.recoveryActiveNodeSource,
        'locally_eligible_projection',
      );
    });
  test('active-node projection augments stale explicit recovery-active node ids with fresher locally eligible projection',
    async (t) => {
      const snapshot = buildMembershipPublicationActiveSnapshot({
        publication_epoch: 27,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-a', 'node-b', 'node-c'],
        recovery_active_node_ids: ['node-a', 'node-b', 'node-c'],
        recovery_active_node_source: 'published_membership',
        membership_lifecycle_summary: {
          projectedServingNodeIds: ['node-a', 'node-b', 'node-c', 'node-d'],
          locallyEligibleNodeIds: ['node-a', 'node-b', 'node-c', 'node-d'],
        },
      });

      t.same(
        snapshot?.recoveryActiveNodeIds,
        ['node-a', 'node-b', 'node-c', 'node-d'],
        'stale explicit recovery-active node ids should not suppress fresher projected eligibility',
      );
      t.same(
        snapshot?.missingPublishedRecoveryActiveNodeIds,
        ['node-d'],
        'the publication snapshot should keep exposing which fresher recovery-active nodes still need publication convergence',
      );
    });

  test('resolvePublishedActiveNodeIds only trusts durable published membership rows',
    async (t) => {
      const publishedActiveNodeIds = resolvePublishedActiveNodeIds({
        latestPublicationRow: {
          publication_epoch: 12,
          status: 'ACK_PENDING',
          published_active_node_ids: ['node-1', 'node-2', 'node-3'],
          required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
          acknowledged_node_ids: ['node-1'],
        },
        latestPublishedPublicationRow: {
          publication_epoch: 11,
          status: 'PUBLISHED',
          published_active_node_ids: ['node-1', 'node-2'],
          required_ack_node_ids: ['node-1', 'node-2'],
          acknowledged_node_ids: ['node-1', 'node-2'],
        },
      });

      t.same(
        publishedActiveNodeIds,
        ['node-1', 'node-2'],
        'published membership should fall back to the last durable published epoch instead of an in-flight row',
      );
    });
}
