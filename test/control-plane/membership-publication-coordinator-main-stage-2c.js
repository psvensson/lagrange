import {test} from '../../src/test-helpers/tap.js';
import {
  deriveMembershipPublicationCandidate,
  MembershipPublicationCoordinator,
} from '../../src/control-plane/membership-publication-coordinator.js';
import {
  ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME,
} from '../../src/control-plane/membership-publication-coordinator-queue.js';
import {COLUMN, TABLES} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  shouldPreferAuthoritativeMembershipState,
} from '../../src/control-plane/membership-publication-planning-evidence.js';
import {MEMBERSHIP_LIFECYCLE_STATE} from '../../src/control-plane/membership-lifecycle-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
} from '../../src/control-plane/control-plane-publication-merge.js';
import {
  CONTROL_PLANE_CONVERGENCE_CLASS,
  CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME,
} from '../../src/control-plane/control-plane-error-classification.js';
import {
  buildPublicationActiveGateHandoffContract,
  PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION,
  PUBLICATION_ACTIVE_GATE_HANDOFF_REASON,
  PUBLICATION_ACTIVE_GATE_HANDOFF_STATE,
} from '../../src/control-plane/publication-active-gate-handoff-contract.js';
import {MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_CONNECTION_STATE_CONNECTED, MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_NOW_MS, MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PROCESS_DEAD_NODE_ID, MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLICATION_EPOCH, MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID, MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHER_NODE_ID, MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_STATUS_ACK_PENDING, MEMBERSHIP_PUBLICATION_TRIM_CONNECTION_STATE_READY, MEMBERSHIP_PUBLICATION_TRIM_STATUS_PUBLISHED, buildMembershipPublicationAckDeferralNodeRow, buildMembershipPublicationTrimEndpointRow, buildMembershipPublicationTrimServiceRow} from './membership-publication-coordinator-main-stage-1.js';

const PUBLICATION_CONVERGENCE_STALE_PUBLISHED_EPOCH = 29;
const PUBLICATION_CONVERGENCE_REPAIR_NOW_MS = 1000;
const PUBLICATION_CONVERGENCE_REPAIR_PUBLISHER_NODE_ID = 'seed-node';
const PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID = 'node-1';
const PUBLICATION_CONVERGENCE_REPAIR_MISSING_NODE_ID = 'node-2';
const PUBLICATION_CONVERGENCE_REPAIR_ENDPOINT_ID = 'node-1-ws';
const PUBLICATION_CONVERGENCE_REPAIR_SERVICE_ID = 'svc-1';
const PUBLICATION_CONVERGENCE_REPAIR_ENDPOINT_ADDRESS = 'ws://node-1:8082';
const PUBLICATION_CONVERGENCE_REPAIR_TRANSPORT = 'ws';
const PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS = 'active';
const PUBLICATION_CONVERGENCE_REPAIR_READY_CONNECTION = 'ready';
const PUBLICATION_CONVERGENCE_REPAIR_READY_LEASE_EXPIRES_AT = 5000;
const PUBLICATION_CONVERGENCE_AUTH_REFRESH_EPOCH = 31;
const PUBLICATION_CONVERGENCE_AUTH_REFRESH_NODE_ID = 'node-auth-refresh';
const PUBLICATION_CONVERGENCE_AUTH_REFRESH_PRIORITY_SUMMARY = Object.freeze({
  satisfied: true,
  readyEligibleNodeCount: 1,
  totalPriorityPartitionCount: 1,
  blockedPartitionCount: 0,
});
const PUBLICATION_CONVERGENCE_AUTH_REFRESH_PUBLICATION_ID =
  'publication-auth-refresh';
const PUBLICATION_CONVERGENCE_AUTH_REFRESH_MISSING_NODE_ID =
  'node-auth-refresh-missing';
const PUBLICATION_CONVERGENCE_AUTH_REFRESH_READY_LEASE_EXPIRES_AT = 5000;
const PUBLICATION_CONVERGENCE_AUTH_REFRESH_NOW_MS = 2500;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLICATION_ID =
  'publication-handoff-target';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_KIND =
  'cluster_membership';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EPOCH = 41;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NEXT_EPOCH = 42;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NOW_MS = 3200;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_DURABLE_UPDATED_AT = 3201;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_FIRST_NODE_INDEX = 0;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PENDING_START_INDEX = 1;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SINGLE_WRITE_ATTEMPT = 1;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_STALE_READBACK_COUNT = 1;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_FIRST_PERSISTED_INDEX = 0;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NO_ENQUEUE_COUNT = 0;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_AUTHORITATIVE_READ_ERROR =
  'explicit handoff target should not require authoritative node repair';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_BROAD_READ_ERROR =
  'active-gate owner reconcile should not read broad membership tables';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_ALLOW_PENDING_VISIBILITY = true;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_ALLOW_PRESSURE_DEFER = false;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SKIP_CACHE_WAIT = true;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_READ_PROFILE =
  'diagnostics';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_DURABLE_REASON_CODE =
  'durable_handoff_readback';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS = Object.freeze([
  'node-handoff-seed',
  'node-handoff-a',
  'node-handoff-b',
]);
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS = Object.freeze(
  [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS].sort((left, right) =>
    left.localeCompare(right),
  ),
);
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS =
  Object.freeze([
    PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[0],
  ]);
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PENDING_NODE_IDS = Object.freeze(
  PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS.slice(1),
);
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EMPTY_ROWS = Object.freeze([]);
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_REASON_A =
  'ready-node-handoff-a';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_REASON_B =
  'ready-node-handoff-b';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NEWER_EPOCH = 43;
const PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_OTHER_OWNER_KEY =
  'membership-publication:other-cluster';
const PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_BOUND = 1;
const PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_RETRY_AFTER_MS = 1000;
const PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_EMPTY_ENQUEUE_COUNT = 0;
const PUBLICATION_CONVERGENCE_DEFERRED_SKIP_WRITE_READBACK = true;
const PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_OUTCOME_ENQUEUED =
  'enqueued';
const PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_OUTCOME_MERGED =
  'merged';
const PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_OUTCOME_REJECTED =
  'rejected';
const PUBLICATION_CONVERGENCE_CRITICAL_OWNER_RECOVERY_WAKE =
  'owner_recovery_wake';
const PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_BOUNDED_REASON =
  'owner_queue_bounded';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_MERGED_TEST_NAME =
  'reconcileActiveGateMembershipPublication accepts pending owner queue merge';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_MERGED_OUTCOME_MESSAGE =
  'pending owner-key merge should expose an accepted critical convergence retry';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_MERGED_ENQUEUE_MESSAGE =
  'pending owner-key merge should still reach the owner queue once';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_MERGED_CONTEXT_MESSAGE =
  'pending owner-key merge should retain the complete handoff target';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_MERGED_ROW_MESSAGE =
  'pending owner-key merge should retain the complete latest publication row';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_MERGED_ENQUEUE_COUNT = 1;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NODE_A_IDS = Object.freeze([
  PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[0],
  PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[1],
]);
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NODE_B_IDS = Object.freeze([
  PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[0],
  PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[2],
]);
const PUBLICATION_CONVERGENCE_HANDOFF_ONLY_PRELOADED_FIELD =
  'nodeRows';
const PUBLICATION_CONVERGENCE_HANDOFF_ONLY_ALLOW_EMPTY_FIELD =
  'allowEmptyPreloadedRows';
const PUBLICATION_CONVERGENCE_OWNER_QUEUE_RETRYABLE_DRAIN_FAILURE =
  'retryable_drain_failure';
const PUBLICATION_CONVERGENCE_OWNER_QUEUE_DISTRIBUTED_FAILURE =
  'distributed_participant_failure';
const PUBLICATION_CONVERGENCE_OWNER_QUEUE_DISTRIBUTED_FAILURE_CODE =
  'DISTRIBUTED_PARTICIPANT_FAILURE';
const PUBLICATION_CONVERGENCE_OWNER_QUEUE_DISTRIBUTED_FAILURE_MESSAGE =
  'Distributed operation failed due to participant failures';
const PUBLICATION_CONVERGENCE_OWNER_QUEUE_RETRY_AFTER_MS = 37;
const PUBLICATION_CONVERGENCE_OWNER_QUEUE_RETRYING_COUNT = 1;
const PUBLICATION_CONVERGENCE_OWNER_QUEUE_FIRST_CALL_COUNT = 1;
const PUBLICATION_CONVERGENCE_HANDOFF_REPLAY_UNKNOWN_EPOCH = 0;
const PUBLICATION_CONVERGENCE_HANDOFF_REPLAY_UNPUBLISHED_OBSERVATION =
  'unpublished_observation';
const PUBLICATION_CONVERGENCE_HANDOFF_REPLAY_NO_ENQUEUE_COUNT = 0;
const PUBLICATION_CONVERGENCE_HANDOFF_REPLAY_TEST_NAME =
  'reconcileClusterMembership preserves target-blocked active-gate handoff replay';
const PUBLICATION_CONVERGENCE_HANDOFF_REPLAY_CONTRACT_MESSAGE =
  'no-debt publication pending replay should emit an owner reconcile handoff';
const PUBLICATION_CONVERGENCE_HANDOFF_REPLAY_STATE_MESSAGE =
  'empty replay target should remain a typed owner outcome';
const PUBLICATION_CONVERGENCE_HANDOFF_REPLAY_QUEUE_MESSAGE =
  'target-blocked replay should not enqueue downstream owner recovery work';

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

test('deriveMembershipPublicationCandidate defers process-dead recovery joiners from publication acknowledgements',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHER_NODE_ID,
      latestPublicationRow: {
        publication_epoch: MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLICATION_EPOCH,
        status: MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_STATUS_ACK_PENDING,
        published_active_node_ids: [
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID,
        ],
        required_ack_node_ids: [
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID,
        ],
        acknowledged_node_ids: [
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID,
        ],
      },
      latestPublishedPublicationRow: {
        publication_epoch: MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLICATION_EPOCH,
        status: MEMBERSHIP_PUBLICATION_TRIM_STATUS_PUBLISHED,
        published_active_node_ids: [
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID,
        ],
        required_ack_node_ids: [
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID,
        ],
        acknowledged_node_ids: [
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID,
        ],
      },
      nodeRows: [
        buildMembershipPublicationAckDeferralNodeRow(
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID,
          MEMBERSHIP_PUBLICATION_TRIM_CONNECTION_STATE_READY,
        ),
        buildMembershipPublicationAckDeferralNodeRow(
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PROCESS_DEAD_NODE_ID,
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_CONNECTION_STATE_CONNECTED,
        ),
      ],
      readinessEntries: [
        {
          nodeId: MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
        {
          nodeId: MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PROCESS_DEAD_NODE_ID,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]:
              true,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: false,
          },
        },
      ],
      nodeEndpointRows: [
        buildMembershipPublicationTrimEndpointRow(
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID,
        ),
        buildMembershipPublicationTrimEndpointRow(
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PROCESS_DEAD_NODE_ID,
        ),
      ],
      serviceRows: [
        buildMembershipPublicationTrimServiceRow(
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID,
        ),
        buildMembershipPublicationTrimServiceRow(
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PROCESS_DEAD_NODE_ID,
        ),
      ],
      nowMs: MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_NOW_MS,
    });

    t.same(
      candidate.projectedServingNodeIds,
      [
        MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID,
        MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PROCESS_DEAD_NODE_ID,
      ],
      'the recovery-only node should remain visible in the observed projection',
    );
    t.same(
      candidate.publishedActiveNodeIds,
      [MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID],
      'process-dead recovery-only nodes must not enter the ack-required publication set',
    );
    t.same(
      candidate.requiredAckNodeIds,
      [MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID],
      'the publication should not require acknowledgement from the deferred node',
    );
    t.match(
      candidate.projectionDiagnostics,
      {
        recoveryEligibleIncludedNodeIds: [
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PROCESS_DEAD_NODE_ID,
        ],
        publicationAckDeferredNodeIds: [
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PROCESS_DEAD_NODE_ID,
        ],
        publicationAckDeferralReasonCodesByNodeId: {
          [MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PROCESS_DEAD_NODE_ID]: [
            CONTROL_PLANE_READINESS_REASON.PROCESS_NOT_ALIVE,
          ],
        },
      },
      'publication diagnostics should retain the recovery projection and the ack deferral reason',
    );
    t.same(
      candidate.recoveryActiveNodeIds,
      [MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID],
      'deferred recovery projections should not hold the publication recovery gate open as missing published members',
    );
    t.same(
      candidate.missingPublishedRecoveryActiveNodeIds,
      [],
      'deferred recovery projections should not create publication trim debt',
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

test('deriveMembershipPublicationCandidate reopens count-only ACK complete publication when recovery eligibility proves missing members',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHER_NODE_ID,
      latestPublicationRow: {
        publication_epoch: PUBLICATION_CONVERGENCE_STALE_PUBLISHED_EPOCH,
        status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        published_active_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        required_ack_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        acknowledged_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
      },
      latestPublishedPublicationRow: {
        publication_epoch: PUBLICATION_CONVERGENCE_STALE_PUBLISHED_EPOCH,
        status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        published_active_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        required_ack_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        acknowledged_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
      },
      nodeRows: [
        {
          node_id: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          status: PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS,
          connection_state: PUBLICATION_CONVERGENCE_REPAIR_READY_CONNECTION,
          ready_lease_expires_at:
            PUBLICATION_CONVERGENCE_REPAIR_READY_LEASE_EXPIRES_AT,
        },
      ],
      readinessEntries: [
        {
          nodeId: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: true,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
          },
        },
        {
          nodeId: PUBLICATION_CONVERGENCE_REPAIR_MISSING_NODE_ID,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: false,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
          },
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: PUBLICATION_CONVERGENCE_REPAIR_ENDPOINT_ID,
          node_id: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          transport_type: PUBLICATION_CONVERGENCE_REPAIR_TRANSPORT,
          status: PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS,
          address: PUBLICATION_CONVERGENCE_REPAIR_ENDPOINT_ADDRESS,
        },
      ],
      serviceRows: [
        {
          service_id: PUBLICATION_CONVERGENCE_REPAIR_SERVICE_ID,
          node_id: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          status: PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS,
        },
      ],
      nowMs: PUBLICATION_CONVERGENCE_REPAIR_NOW_MS,
    });

    t.equal(
      candidate.changed,
      true,
      'the publication owner should schedule a bounded repair publication',
    );
    t.equal(
      candidate.publicationEpoch,
      PUBLICATION_CONVERGENCE_STALE_PUBLISHED_EPOCH + 1,
      'the repair publication should advance the stale published epoch',
    );
    t.equal(
      candidate.publicationStatus,
      CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
      'missing published members must not remain classified as a closed published publication',
    );
    t.same(
      candidate.publishedActiveNodeIds,
      [
        PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        PUBLICATION_CONVERGENCE_REPAIR_MISSING_NODE_ID,
      ],
      'recovery-eligible readiness is the bounded owner evidence for the missing member',
    );
    t.same(
      candidate.requiredAckNodeIds,
      [
        PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        PUBLICATION_CONVERGENCE_REPAIR_MISSING_NODE_ID,
      ],
      'the reopened publication should require ACK evidence from the repaired cohort',
    );
    t.match(
      candidate.membershipLifecycleSummary?.projectionDiagnostics,
      {
        recoveryEligibleProjectionEnabled: true,
        recoveryEligibleIncludedNodeIds: [
          PUBLICATION_CONVERGENCE_REPAIR_MISSING_NODE_ID,
        ],
      },
      'the repair evidence should be visible in owner diagnostics',
    );
    t.end();
  });

test('deriveMembershipPublicationCandidate reopens count-only ACK complete publication from priority recovery pending reason-only evidence',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHER_NODE_ID,
      latestPublicationRow: {
        publication_epoch: PUBLICATION_CONVERGENCE_STALE_PUBLISHED_EPOCH,
        status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        published_active_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        required_ack_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        acknowledged_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
      },
      latestPublishedPublicationRow: {
        publication_epoch: PUBLICATION_CONVERGENCE_STALE_PUBLISHED_EPOCH,
        status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        published_active_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        required_ack_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        acknowledged_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
      },
      nodeRows: [
        {
          node_id: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          status: PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS,
          connection_state: PUBLICATION_CONVERGENCE_REPAIR_READY_CONNECTION,
          ready_lease_expires_at:
            PUBLICATION_CONVERGENCE_REPAIR_READY_LEASE_EXPIRES_AT,
        },
      ],
      readinessEntries: [
        {
          nodeId: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: true,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
        },
        {
          nodeId: PUBLICATION_CONVERGENCE_REPAIR_MISSING_NODE_ID,
          reasons: [
            {
              code: CONTROL_PLANE_READINESS_REASON
                .PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
            },
          ],
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: PUBLICATION_CONVERGENCE_REPAIR_ENDPOINT_ID,
          node_id: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          transport_type: PUBLICATION_CONVERGENCE_REPAIR_TRANSPORT,
          status: PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS,
          address: PUBLICATION_CONVERGENCE_REPAIR_ENDPOINT_ADDRESS,
        },
      ],
      serviceRows: [
        {
          service_id: PUBLICATION_CONVERGENCE_REPAIR_SERVICE_ID,
          node_id: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          status: PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS,
        },
      ],
      nowMs: PUBLICATION_CONVERGENCE_REPAIR_NOW_MS,
    });

    t.equal(
      candidate.changed,
      true,
      'reason-only priority recovery evidence should reopen stale published membership',
    );
    t.same(
      candidate.publishedActiveNodeIds,
      [
        PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        PUBLICATION_CONVERGENCE_REPAIR_MISSING_NODE_ID,
      ],
      'priority recovery pending reason-only evidence should enter the repair cohort',
    );
    t.match(
      candidate.projectionDiagnostics,
      {
        recoveryEligibleProjectionEnabled: true,
        recoveryEligibleIncludedNodeIds: [
          PUBLICATION_CONVERGENCE_REPAIR_MISSING_NODE_ID,
        ],
      },
      'publication diagnostics should identify the reason-only recovery projection',
    );
    t.end();
  });

test('deriveMembershipPublicationCandidate reopens count-only ACK complete publication from priority recovery pending blocked readiness evidence',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHER_NODE_ID,
      latestPublicationRow: {
        publication_epoch: PUBLICATION_CONVERGENCE_STALE_PUBLISHED_EPOCH,
        status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        published_active_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        required_ack_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        acknowledged_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
      },
      latestPublishedPublicationRow: {
        publication_epoch: PUBLICATION_CONVERGENCE_STALE_PUBLISHED_EPOCH,
        status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        published_active_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        required_ack_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        acknowledged_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
      },
      nodeRows: [
        {
          node_id: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          status: PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS,
          connection_state: PUBLICATION_CONVERGENCE_REPAIR_READY_CONNECTION,
          ready_lease_expires_at:
            PUBLICATION_CONVERGENCE_REPAIR_READY_LEASE_EXPIRES_AT,
        },
      ],
      readinessEntries: [
        {
          nodeId: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: true,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
        },
        {
          nodeId: PUBLICATION_CONVERGENCE_REPAIR_MISSING_NODE_ID,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: false,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: false,
          },
          reasons: [
            {
              code: CONTROL_PLANE_READINESS_REASON
                .PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
            },
          ],
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: PUBLICATION_CONVERGENCE_REPAIR_ENDPOINT_ID,
          node_id: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          transport_type: PUBLICATION_CONVERGENCE_REPAIR_TRANSPORT,
          status: PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS,
          address: PUBLICATION_CONVERGENCE_REPAIR_ENDPOINT_ADDRESS,
        },
      ],
      serviceRows: [
        {
          service_id: PUBLICATION_CONVERGENCE_REPAIR_SERVICE_ID,
          node_id: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          status: PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS,
        },
      ],
      nowMs: PUBLICATION_CONVERGENCE_REPAIR_NOW_MS,
    });

    t.equal(
      candidate.changed,
      true,
      'priority recovery pending readiness should reopen stale published membership even when serve dimensions are blocked',
    );
    t.equal(
      candidate.publicationStatus,
      CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
      'blocked serve readiness should become an open repair publication instead of retaining stale published truth',
    );
    t.same(
      candidate.publishedActiveNodeIds,
      [
        PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        PUBLICATION_CONVERGENCE_REPAIR_MISSING_NODE_ID,
      ],
      'priority recovery pending readiness should enter the repair cohort',
    );
    t.match(
      candidate.projectionDiagnostics,
      {
        recoveryEligibleProjectionEnabled: true,
        recoveryEligibleIncludedNodeIds: [
          PUBLICATION_CONVERGENCE_REPAIR_MISSING_NODE_ID,
        ],
      },
      'publication diagnostics should identify the blocked readiness recovery projection',
    );
    t.end();
  });

const PUBLICATION_CONVERGENCE_HANDOFF_RETRY_OPEN_EPOCH = 2;
const PUBLICATION_CONVERGENCE_HANDOFF_RETRY_PUBLICATION_ID =
  'publication-handoff-retry-open';
const PUBLICATION_CONVERGENCE_HANDOFF_RETRY_NODE_IDS = Object.freeze([
  'node-handoff-retry-seed',
  'node-handoff-retry-a',
  'node-handoff-retry-b',
  'node-handoff-retry-c',
  'node-handoff-retry-d',
]);
const PUBLICATION_CONVERGENCE_HANDOFF_RETRY_SORTED_NODE_IDS = Object.freeze(
  [...PUBLICATION_CONVERGENCE_HANDOFF_RETRY_NODE_IDS].sort((left, right) =>
    left.localeCompare(right),
  ),
);
const PUBLICATION_CONVERGENCE_HANDOFF_RETRY_PUBLISHED_NODE_IDS =
  Object.freeze([
    PUBLICATION_CONVERGENCE_HANDOFF_RETRY_NODE_IDS[
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_FIRST_NODE_INDEX
    ],
  ]);
const PUBLICATION_CONVERGENCE_HANDOFF_RETRY_PENDING_NODE_IDS =
  Object.freeze(
    PUBLICATION_CONVERGENCE_HANDOFF_RETRY_NODE_IDS.slice(
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PENDING_START_INDEX,
    ),
  );
const PUBLICATION_CONVERGENCE_HANDOFF_RETRY_VISIBLE_PERSISTED_COUNT = 2;
const PUBLICATION_CONVERGENCE_HANDOFF_RETRY_VISIBLE_TEST_NAME =
  'reconcileActiveGateMembershipPublication retries owner visibility before deferred handoff';
const PUBLICATION_CONVERGENCE_HANDOFF_RETRY_VISIBLE_STATE_MESSAGE =
  'owner-visible publication after a bounded owner retry should satisfy the handoff';
const PUBLICATION_CONVERGENCE_HANDOFF_RETRY_VISIBLE_ENQUEUE_MESSAGE =
  'visible owner retry should not enqueue another reconcile retry';
const PUBLICATION_CONVERGENCE_HANDOFF_RETRY_VISIBLE_ATTEMPT_MESSAGE =
  'owner retry should perform the bounded second publication write before deferring';
const PUBLICATION_CONVERGENCE_HANDOFF_RETRY_VISIBLE_ROW_MESSAGE =
  'bounded owner retry row should cover the complete OPEN epoch-2 handoff target';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_STALE_VISIBLE_TEST_NAME =
  'reconcileActiveGateMembershipPublication accepts owner-visible publication after stale write readback';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_STALE_VISIBLE_STATE_MESSAGE =
  'owner-visible publication after stale write readback should satisfy the handoff';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_STALE_VISIBLE_ENQUEUE_MESSAGE =
  'visible owner publication should not enqueue another reconcile retry';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_STALE_VISIBLE_ROW_MESSAGE =
  'owner-visible row should cover the complete handoff target';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_READBACK_FAILURE_TEST_NAME =
  'reconcileActiveGateMembershipPublication carries written owner row after visibility read error';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_READBACK_FAILURE_MESSAGE =
  'owner visibility readback failed';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_VISIBLE_READ_CALL_INDEX = 3;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_DEFERRED_ROW_MESSAGE =
  'deferred owner outcome should retain the written publication row';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_DEFERRED_CONTEXT_MESSAGE =
  'queued owner retry should use the written publication row as the latest row';

test(PUBLICATION_CONVERGENCE_HANDOFF_RETRY_VISIBLE_TEST_NAME,
  async (t) => {
    const latestPublicationRow = {
      publication_id: PUBLICATION_CONVERGENCE_HANDOFF_RETRY_PUBLICATION_ID,
      publication_kind: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_KIND,
      publication_epoch: PUBLICATION_CONVERGENCE_HANDOFF_RETRY_OPEN_EPOCH,
      status: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
      published_active_node_ids: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_RETRY_PUBLISHED_NODE_IDS,
      ],
      required_ack_node_ids: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_RETRY_PUBLISHED_NODE_IDS,
      ],
      acknowledged_node_ids: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_RETRY_PUBLISHED_NODE_IDS,
      ],
      priority_partition_summary:
        PUBLICATION_CONVERGENCE_AUTH_REFRESH_PRIORITY_SUMMARY,
    };
    const pending = new Map();
    const enqueued = [];
    const persistedRows = [];
    const coordinator = new MembershipPublicationCoordinator({
      nodeId:
        PUBLICATION_CONVERGENCE_HANDOFF_RETRY_NODE_IDS[
          PUBLICATION_CONVERGENCE_HANDOFF_TARGET_FIRST_NODE_INDEX
        ],
      reconcileQueue: {
        pending,
        enqueue(ownerKey, reason, context, options) {
          enqueued.push({ownerKey, reason, context, options});
          pending.set(ownerKey, {context});
          return true;
        },
      },
      controlPlanePublicationsOwner: {
        async listPublications() {
          return {rows: [latestPublicationRow]};
        },
        async getPublication(publicationId) {
          const persistedRow = persistedRows[persistedRows.length - 1];
          if (!persistedRow) {
            return latestPublicationRow;
          }
          if (publicationId !== persistedRow.publication_id) {
            return latestPublicationRow;
          }
          if (
            persistedRows.length <
            PUBLICATION_CONVERGENCE_HANDOFF_RETRY_VISIBLE_PERSISTED_COUNT
          ) {
            return latestPublicationRow;
          }
          return {
            ...persistedRow,
            reason_code:
              PUBLICATION_CONVERGENCE_HANDOFF_TARGET_DURABLE_REASON_CODE,
            updated_at:
              PUBLICATION_CONVERGENCE_HANDOFF_TARGET_DURABLE_UPDATED_AT,
          };
        },
        async upsertPublication(row) {
          persistedRows.push(row);
          return row;
        },
      },
      systemTableCache: {
        getAll(tableName) {
          if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
            return [latestPublicationRow];
          }
          return [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EMPTY_ROWS];
        },
      },
      now: () => PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NOW_MS,
    });

    const outcome =
      await coordinator.reconcileActiveGateMembershipPublication(
        {
          publicationEpoch: PUBLICATION_CONVERGENCE_HANDOFF_RETRY_OPEN_EPOCH,
          expectedNodeIds: [
            ...PUBLICATION_CONVERGENCE_HANDOFF_RETRY_NODE_IDS,
          ],
          publishedActiveNodeIds: [
            ...PUBLICATION_CONVERGENCE_HANDOFF_RETRY_PUBLISHED_NODE_IDS,
          ],
          pendingReconcileNodeIds: [
            ...PUBLICATION_CONVERGENCE_HANDOFF_RETRY_PENDING_NODE_IDS,
          ],
          nextAction:
            PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
              .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
        },
        {
          publicationWriteMaxAttempts:
            PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SINGLE_WRITE_ATTEMPT,
        },
      );

    t.equal(
      outcome.state,
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME.PUBLISHED_VISIBLE,
      PUBLICATION_CONVERGENCE_HANDOFF_RETRY_VISIBLE_STATE_MESSAGE,
    );
    t.equal(
      enqueued.length,
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NO_ENQUEUE_COUNT,
      PUBLICATION_CONVERGENCE_HANDOFF_RETRY_VISIBLE_ENQUEUE_MESSAGE,
    );
    t.equal(
      persistedRows.length,
      PUBLICATION_CONVERGENCE_HANDOFF_RETRY_VISIBLE_PERSISTED_COUNT,
      PUBLICATION_CONVERGENCE_HANDOFF_RETRY_VISIBLE_ATTEMPT_MESSAGE,
    );
    t.same(
      outcome.publicationRow.publishedActiveNodeIds,
      [...PUBLICATION_CONVERGENCE_HANDOFF_RETRY_SORTED_NODE_IDS],
      PUBLICATION_CONVERGENCE_HANDOFF_RETRY_VISIBLE_ROW_MESSAGE,
    );
  });

test(PUBLICATION_CONVERGENCE_HANDOFF_TARGET_STALE_VISIBLE_TEST_NAME,
  async (t) => {
    const latestPublicationRow = {
      publication_id: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLICATION_ID,
      publication_kind: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_KIND,
      publication_epoch: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EPOCH,
      status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      published_active_node_ids: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
      ],
      required_ack_node_ids: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
      ],
      acknowledged_node_ids: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
      ],
      priority_partition_summary:
        PUBLICATION_CONVERGENCE_AUTH_REFRESH_PRIORITY_SUMMARY,
    };
    const pending = new Map();
    const enqueued = [];
    const persistedRows = [];
    let staleWriteReadbackCount =
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NO_ENQUEUE_COUNT;
    const coordinator = new MembershipPublicationCoordinator({
      nodeId:
        PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[
          PUBLICATION_CONVERGENCE_HANDOFF_TARGET_FIRST_NODE_INDEX
        ],
      reconcileQueue: {
        pending,
        enqueue(ownerKey, reason, context, options) {
          enqueued.push({ownerKey, reason, context, options});
          pending.set(ownerKey, {context});
          return true;
        },
      },
      controlPlanePublicationsOwner: {
        async listPublications() {
          return {rows: [latestPublicationRow]};
        },
        async getPublication(publicationId) {
          const persistedRow =
            persistedRows[
              PUBLICATION_CONVERGENCE_HANDOFF_TARGET_FIRST_PERSISTED_INDEX
            ];
          if (!persistedRow) {
            return latestPublicationRow;
          }
          if (publicationId !== persistedRow.publication_id) {
            return latestPublicationRow;
          }
          staleWriteReadbackCount +=
            PUBLICATION_CONVERGENCE_HANDOFF_TARGET_STALE_READBACK_COUNT;
          if (
            staleWriteReadbackCount ===
            PUBLICATION_CONVERGENCE_HANDOFF_TARGET_STALE_READBACK_COUNT
          ) {
            return latestPublicationRow;
          }
          return {
            ...persistedRow,
            reason_code:
              PUBLICATION_CONVERGENCE_HANDOFF_TARGET_DURABLE_REASON_CODE,
            updated_at:
              PUBLICATION_CONVERGENCE_HANDOFF_TARGET_DURABLE_UPDATED_AT,
          };
        },
        async upsertPublication(row) {
          persistedRows.push(row);
          return row;
        },
      },
      systemTableCache: {
        getAll(tableName) {
          if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
            return [latestPublicationRow];
          }
          return [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EMPTY_ROWS];
        },
      },
      now: () => PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NOW_MS,
    });

    const outcome =
      await coordinator.reconcileActiveGateMembershipPublication(
        {
          publicationEpoch: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EPOCH,
          expectedNodeIds: [
            ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS,
          ],
          publishedActiveNodeIds: [
            ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
          ],
          pendingReconcileNodeIds:
            PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS.slice(
              PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PENDING_START_INDEX,
            ),
          nextAction:
            PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
              .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
        },
        {
          publicationWriteMaxAttempts:
            PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SINGLE_WRITE_ATTEMPT,
        },
      );

    t.equal(
      outcome.state,
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME.PUBLISHED_VISIBLE,
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_STALE_VISIBLE_STATE_MESSAGE,
    );
    t.equal(
      enqueued.length,
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NO_ENQUEUE_COUNT,
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_STALE_VISIBLE_ENQUEUE_MESSAGE,
    );
    t.same(
      outcome.publicationRow.publishedActiveNodeIds,
      [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS],
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_STALE_VISIBLE_ROW_MESSAGE,
    );
  });

test(PUBLICATION_CONVERGENCE_HANDOFF_TARGET_READBACK_FAILURE_TEST_NAME,
  async (t) => {
    const latestPublicationRow = {
      publication_id: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLICATION_ID,
      publication_kind: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_KIND,
      publication_epoch: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EPOCH,
      status: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
      published_active_node_ids: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
      ],
      required_ack_node_ids: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
      ],
      acknowledged_node_ids: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
      ],
      priority_partition_summary:
        PUBLICATION_CONVERGENCE_AUTH_REFRESH_PRIORITY_SUMMARY,
    };
    const pending = new Map();
    const enqueued = [];
    const persistedRows = [];
    let publicationReadCount =
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NO_ENQUEUE_COUNT;
    const coordinator = new MembershipPublicationCoordinator({
      nodeId:
        PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[
          PUBLICATION_CONVERGENCE_HANDOFF_TARGET_FIRST_NODE_INDEX
        ],
      reconcileQueue: {
        pending,
        enqueue(ownerKey, reason, context, options) {
          enqueued.push({ownerKey, reason, context, options});
          pending.set(ownerKey, {context});
          return true;
        },
      },
      controlPlanePublicationsOwner: {
        async listPublications() {
          return {rows: [latestPublicationRow]};
        },
        async getPublication(publicationId) {
          publicationReadCount += 1;
          if (
            publicationReadCount >=
            PUBLICATION_CONVERGENCE_HANDOFF_TARGET_VISIBLE_READ_CALL_INDEX
          ) {
            throw new Error(
              PUBLICATION_CONVERGENCE_HANDOFF_TARGET_READBACK_FAILURE_MESSAGE,
            );
          }
          const persistedRow = persistedRows[
            PUBLICATION_CONVERGENCE_HANDOFF_TARGET_FIRST_PERSISTED_INDEX
          ];
          if (!persistedRow || publicationId !== persistedRow.publication_id) {
            return latestPublicationRow;
          }
          return persistedRow;
        },
        async upsertPublication(row) {
          persistedRows.push(row);
          return row;
        },
      },
      systemTableCache: {
        getAll(tableName) {
          if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
            return [latestPublicationRow];
          }
          return [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EMPTY_ROWS];
        },
      },
      now: () => PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NOW_MS,
    });

    const outcome =
      await coordinator.reconcileActiveGateMembershipPublication(
        {
          publicationEpoch: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EPOCH,
          expectedNodeIds: [
            ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS,
          ],
          publishedActiveNodeIds: [
            ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
          ],
          pendingReconcileNodeIds:
            PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS.slice(
              PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PENDING_START_INDEX,
            ),
          nextAction:
            PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
              .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
        },
      );

    const ownerKey = coordinator.buildOwnerKey();
    t.equal(
      outcome.state,
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME.WRITE_DEFERRED,
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_DEFERRED_ROW_MESSAGE,
    );
    t.same(
      outcome.publicationRow.publishedActiveNodeIds,
      [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS],
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_DEFERRED_ROW_MESSAGE,
    );
    t.same(
      pending.get(ownerKey)?.context?.latestPublicationRow
        ?.publishedActiveNodeIds,
      [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS],
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_DEFERRED_CONTEXT_MESSAGE,
    );
    t.equal(
      outcome.reasonCode,
      PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_DEFERRED_CONTEXT_MESSAGE,
    );
    t.equal(
      outcome.retryAfterMs,
      PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_RETRY_AFTER_MS,
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_DEFERRED_CONTEXT_MESSAGE,
    );
    t.equal(
      enqueued.length,
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_STALE_READBACK_COUNT,
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_DEFERRED_CONTEXT_MESSAGE,
    );
    t.equal(
      pending.get(ownerKey)?.context?.skipPublicationWriteReadback,
      PUBLICATION_CONVERGENCE_DEFERRED_SKIP_WRITE_READBACK,
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_DEFERRED_CONTEXT_MESSAGE,
    );
  });
