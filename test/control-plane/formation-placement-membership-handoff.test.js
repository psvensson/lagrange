import {test} from '../../src/test-helpers/tap.js';
import {
  deriveMembershipPublicationCandidate,
} from '../../src/control-plane/membership-publication-coordinator.js';
import {
  buildStartupAuthoritySnapshotFromPlanningAnswer,
} from '../../src/control-plane/startup-authority-snapshot-owner.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  NODE_STATE,
  STATE,
} from '../../src/constants/index.js';
import {
  resolvePriorityRemoveSafetyMembershipSnapshot,
} from '../../src/rebalancer/operation-workflow-remove-safety-membership.js';

const NOW_MS = 1000;
const READY_LEASE_EXPIRES_AT_MS = 5000;

function buildReadinessEntry(nodeId, dimensions) {
  return {
    nodeId,
    dimensions,
  };
}

test('formation placement hands recovery-eligible JOINING nodes only to startup authority',
  async (t) => {
    const planningOptions = {
      publisherNodeId: 'node-1',
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
          status: NODE_STATE.ACTIVE,
          connection_state: STATE.READY,
          ready_lease_expires_at: READY_LEASE_EXPIRES_AT_MS,
        },
        {
          node_id: 'node-2',
          status: NODE_STATE.JOINING,
          connection_state: STATE.READY,
          ready_lease_expires_at: READY_LEASE_EXPIRES_AT_MS,
          last_heartbeat: NOW_MS,
        },
        {
          node_id: 'node-disconnected',
          status: NODE_STATE.JOINING,
          connection_state: STATE.DISCONNECTED,
        },
        {
          node_id: 'node-not-recovery-eligible',
          status: NODE_STATE.JOINING,
          connection_state: STATE.CONNECTED,
        },
        {
          node_id: 'node-process-dead',
          status: NODE_STATE.JOINING,
          connection_state: STATE.CONNECTED,
        },
      ],
      readinessEntries: [
        buildReadinessEntry('node-1', {
          [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          [CONTROL_PLANE_READINESS_DIMENSION
            .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
        }),
        buildReadinessEntry('node-2', {
          [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: false,
          [CONTROL_PLANE_READINESS_DIMENSION
            .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
        }),
        buildReadinessEntry('node-disconnected', {
          [CONTROL_PLANE_READINESS_DIMENSION
            .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
        }),
        buildReadinessEntry('node-not-recovery-eligible', {
          [CONTROL_PLANE_READINESS_DIMENSION
            .CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
          [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
        }),
        buildReadinessEntry('node-process-dead', {
          [CONTROL_PLANE_READINESS_DIMENSION
            .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: false,
        }),
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
        {
          service_id: 'service-1',
          node_id: 'node-1',
          status: 'active',
        },
      ],
      nowMs: NOW_MS,
    };
    const candidate = deriveMembershipPublicationCandidate(planningOptions);

    t.same(
      candidate.membershipLifecycleSummary.formationPlacementNodeIds,
      ['node-2'],
      'only connected, live, explicitly recovery-eligible JOINING rows enter formation placement',
    );
    t.same(
      candidate.projectedServingNodeIds,
      ['node-1'],
      'formation placement does not widen the generic serving projection',
    );
    t.same(
      candidate.locallyEligibleNodeIds,
      ['node-1'],
      'formation placement does not widen ordinary local placement eligibility',
    );
    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1'],
      'formation placement does not publish JOINING nodes as active',
    );
    t.same(
      candidate.requiredAckNodeIds,
      ['node-1'],
      'formation placement does not widen publication acknowledgement targets',
    );
    t.same(
      resolvePriorityRemoveSafetyMembershipSnapshot(
        candidate,
        {
          priorityPartitionSummary: {
            satisfied: false,
          },
        },
        [],
      ).membershipNodeIds,
      ['node-1'],
      'formation placement does not widen priority remove-safety membership',
    );

    const startupAuthority = buildStartupAuthoritySnapshotFromPlanningAnswer({
      ...candidate,
      priorityPartitionSummary: {
        satisfied: false,
      },
    });
    t.same(
      startupAuthority.canonicalStartupNodeIds,
      ['node-1', 'node-2'],
      'startup authority alone unions the formation placement cohort',
    );

    const withdrawnCandidate = deriveMembershipPublicationCandidate({
      ...planningOptions,
      membershipLifecycleSummary: candidate.membershipLifecycleSummary,
      readinessEntries: planningOptions.readinessEntries.map((entry) =>
        entry.nodeId === 'node-2' ?
          buildReadinessEntry('node-2', {
            ...entry.dimensions,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
          }) :
          entry,
      ),
    });
    t.same(
      withdrawnCandidate.membershipLifecycleSummary.formationPlacementNodeIds,
      [],
      'fresh readiness withdrawal removes a carried formation-only node',
    );
    t.same(
      buildStartupAuthoritySnapshotFromPlanningAnswer({
        ...withdrawnCandidate,
        priorityPartitionSummary: {
          satisfied: false,
        },
      }).canonicalStartupNodeIds,
      ['node-1'],
      'startup authority cannot retain stale formation-only membership',
    );
    t.end();
  });
