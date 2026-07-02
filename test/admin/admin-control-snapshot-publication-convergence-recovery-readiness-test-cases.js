import {test} from '../../src/test-helpers/tap.js';
import {AdminControlSnapshot} from '../../src/admin/admin-control-snapshot.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  buildCanonicalPublicationRecoveryEvidence,
} from '../../src/control-plane/publication-recovery-evidence.js';
import * as ACTIVE_GATE_SNAPSHOT_TEST_STATE from './admin-control-snapshot-active-gate-fixture-state.js';


test('AdminControlSnapshot maps clean priority recovery readiness debt to publication reconcile',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
      nowFn: () => ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NOW_MS,
    });

    const activeGateOwnerCohort =
      snapshot.resolveActiveGateOwnerCohortSnapshot({
        nodeRows: [
          {
            node_id: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
            status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NODE_STATUS,
            connection_state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_CONNECTION_STATE,
            ready_lease_expires_at:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NOW_MS +
                ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_READY_LEASE_DELTA_MS,
          },
          {
            node_id: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS[0],
            status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NODE_STATUS,
            connection_state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_CONNECTION_STATE,
            ready_lease_expires_at:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NOW_MS +
                ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_READY_LEASE_DELTA_MS,
          },
        ],
        activeNodeViews: {
          effectiveActiveNodeIds: [
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS[0],
          ],
          publishedActiveNodeIds: [
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
          ],
        },
        publicationConvergence: {
          publicationEpoch: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_EPOCH,
          publishedActiveNodeIds: [
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
          ],
          missingPublishedNodeIds: [
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS[0],
          ],
          priorityRecoveryCurrentSummary: {
            unresolvedClassCount:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PRIORITY_RECOVERY_CLEAN_COUNT,
            unresolvedSemanticStateCount:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PRIORITY_RECOVERY_CLEAN_COUNT,
            blockedPartitionCount:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PRIORITY_RECOVERY_CLEAN_COUNT,
          },
        },
        readinessByNodeId: {
          [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS[0]]: {
            reasonCodes: [
              CONTROL_PLANE_READINESS_REASON
                .PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
            ],
          },
        },
      });

    t.match(
      activeGateOwnerCohort,
      {
        state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
        reasonCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
        nextAction: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
        pendingRecoveryNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_EMPTY_NODE_IDS,
        ],
        pendingRecoveryCount:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PRIORITY_RECOVERY_CLEAN_COUNT,
        pendingReconcileNodeIds: [
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS[0],
        ],
        pendingReconcileCount: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_READY_LEASE_COUNT,
      },
      'clean canonical priority recovery evidence should not keep missing publication nodes in owner-recovery wait',
    );
  });

test('AdminControlSnapshot widens owner truth from missing published recovery nodes',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
      nowFn: () => ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NOW_MS,
    });

    const activeNodeViews = snapshot.resolveControlSnapshotNodeViews(
      [{
        node_id: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
        status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NODE_STATUS,
        connection_state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_CONNECTION_STATE,
        ready_lease_expires_at:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NOW_MS +
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_READY_LEASE_DELTA_MS,
      }],
      [],
      [],
      {
        publicationConvergence: {
          status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publicationStatus: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publishedActiveNodeIds: [
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
          ],
          requiredAckNodeIds: [
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
          ],
          acknowledgedNodeIds: [
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
          ],
          pendingAckNodeIds: [],
          priorityPartitionSummary: {
            satisfied: true,
            totalPriorityPartitionCount:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PRIORITY_PARTITION_COUNT,
            missingPartitionIds: [],
            blockedPartitions: [],
          },
          missingPublishedRecoveryActiveNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS,
          ],
        },
      },
      [],
    );

    t.same(
      activeNodeViews.effectiveActiveNodeIds,
      [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NODE_IDS],
      'missing published recovery nodes should count as owner-truth active nodes',
    );
    t.same(
      activeNodeViews.projectedActiveNodeIds,
      [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NODE_IDS],
      'projected nodes should include missing published recovery owner truth',
    );
    t.same(
      activeNodeViews.publishedActiveNodeIds,
      [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID],
      'durable publication membership should remain distinct',
    );
    t.same(
      activeNodeViews.suspectedOrTransitioningNodeIds,
      [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS],
      'missing published recovery nodes should remain transitional diagnostics',
    );
    t.equal(
      activeNodeViews.effectiveSource,
      ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_EFFECTIVE_SOURCE,
      'diagnostics should identify owner truth as the effective source',
    );
  });

test('canonical publication evidence retains active-gate best publication owner truth after a timeout sample',
  async (t) => {
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: {
        publicationEpoch: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_EPOCH,
        pendingAckNodeIds: [],
        pendingAckCount: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PENDING_ACK_COUNT,
        activeGate: {
          progress: {
            expectedNodeCount: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_EXPECTED_NODE_COUNT,
            publicationStatus: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_EVIDENCE_ABSENT,
            recoveryProtocolState:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_EVIDENCE_UNPUBLISHED,
            selectedPublishedActiveNodeIds: [],
            selectedPublishedActiveCount: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PENDING_ACK_COUNT,
            selectedMissingPublishedNodeIds: [],
            pendingAckCount: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PENDING_ACK_COUNT,
            missingPublishedCount: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_CURRENT_MISSING_COUNT,
          },
          bestProgress: {
            expectedNodeCount: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_EXPECTED_NODE_COUNT,
            publicationStatus: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
            recoveryProtocolState:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_EVIDENCE_STEADY,
            selectedPublishedActiveNodeIds: [
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
            ],
            selectedPublishedActiveCount:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_SELECTED_PUBLISHED_COUNT,
            selectedMissingPublishedNodeIds: [
              ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS,
            ],
            pendingAckCount: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PENDING_ACK_COUNT,
            missingPublishedCount: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_BEST_MISSING_COUNT,
            prioritySpreadSatisfied: true,
            priorityRecoveryProgressClasses: {
              unresolvedClassCount: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PENDING_ACK_COUNT,
              unresolvedSemanticStateCount:
                ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PENDING_ACK_COUNT,
              blockedPartitionCount:
                ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PENDING_ACK_COUNT,
            },
          },
        },
      },
    });

    t.match(
      evidence.publicationConvergence,
      {
        publicationStatus: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
        recoveryProtocolState:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_EVIDENCE_STEADY,
        pendingAckCount: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PENDING_ACK_COUNT,
        publishedActiveNodeIds: [
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
        ],
        missingPublishedNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS,
        ],
        missingPublishedCount: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_BEST_MISSING_COUNT,
        freshnessFence: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_FRESHNESS_FENCE_CONSUMER_LAG,
        recoveryOutcome:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_RECOVERY_OUTCOME_WAITING_FOR_CONSUMER,
        streamOutcome: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_STREAM_OUTCOME_STALE,
      },
      'best active-gate publication evidence should keep the exact owner-truth publication blocker',
    );
    t.match(
      evidence.publicationConvergenceGate,
      {
        publicationStatus: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
        recoveryProtocolState:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_EVIDENCE_STEADY,
        missingPublishedNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS,
        ],
        missingPublishedCount: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_BEST_MISSING_COUNT,
      },
      'publication gate evidence should not let the timeout sample inflate the owner blocker',
    );
  });

test('AdminControlSnapshot projects recovery-eligible readiness into diagnostic node coverage',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
      nowFn: () => ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NOW_MS,
    });

    const activeNodeViews = snapshot.resolveControlSnapshotNodeViews(
      [{
        node_id: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
        status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NODE_STATUS,
        connection_state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_CONNECTION_STATE,
        ready_lease_expires_at:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NOW_MS +
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_READY_LEASE_DELTA_MS,
      }],
      [],
      [],
      {
        publishedMembershipObservation: {
          publicationEpoch: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_EPOCH,
          status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publishedActiveNodeIds: [
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
          ],
        },
        readinessByNodeId: {
          [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID]: {
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            },
          },
          [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS[0]]: {
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: false,
              [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
            },
          },
        },
      },
    );

    t.same(
      activeNodeViews.effectiveActiveNodeIds,
      [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID],
      'durable effective nodes should remain scoped to the published row',
    );
    t.same(
      activeNodeViews.projectedActiveNodeIds,
      [
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS[0],
      ],
      'diagnostic projection should include recovery-eligible readiness-only nodes',
    );
  });

test('AdminControlSnapshot projects connected active heartbeat rows when readiness is unavailable',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
      nowFn: () => ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NOW_MS,
    });
    const activeNodeViews = snapshot.resolveControlSnapshotNodeViews(
      [
        {
          node_id: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
          status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NODE_STATUS,
          connection_state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_CONNECTION_STATE,
          ready_lease_expires_at:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NOW_MS +
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_READY_LEASE_DELTA_MS,
        },
        {
          node_id: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS[0],
          status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NODE_STATUS,
          connection_state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_CONNECTED_STATE,
          last_heartbeat:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NOW_MS -
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_RECENT_HEARTBEAT_DELTA_MS,
        },
        {
          node_id: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS[1],
          status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NODE_STATUS,
          connection_state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_CONNECTED_STATE,
          last_heartbeat:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NOW_MS -
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_RECENT_HEARTBEAT_DELTA_MS,
        },
        {
          node_id: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS[2],
          status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NODE_STATUS,
          connection_state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_CONNECTED_STATE,
          last_heartbeat:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NOW_MS -
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_STALE_HEARTBEAT_DELTA_MS,
        },
      ],
      [],
      [{
        endpoint_id: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_ENDPOINT_ID,
        node_id: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
        transport_type: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_ENDPOINT_TRANSPORT,
        status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NODE_STATUS,
        address: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_ENDPOINT_ADDRESS,
      }],
      {
        publishedMembershipObservation: {
          publicationEpoch: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_EPOCH,
          status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publishedActiveNodeIds: [
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
          ],
        },
        readinessByNodeId: {},
      },
    );

    t.same(
      activeNodeViews.effectiveActiveNodeIds,
      [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID],
      'durable effective nodes should remain scoped to the published row',
    );
    t.same(
      activeNodeViews.projectedActiveNodeIds,
      [
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS[0],
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS[1],
      ],
      'diagnostic projection should include active connected nodes with fresh heartbeat evidence',
    );
    t.same(
      activeNodeViews.suspectedOrTransitioningNodeIds,
      [
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS[0],
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS[1],
      ],
      'fresh connected nodes should remain distinct from durable publication',
    );
  });

test('AdminControlSnapshot exports publication convergence gate from live priority recovery readiness',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-1',
      nowFn: () => 1000,
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [{
            nodeId: 'node-1',
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            },
            membershipPublication: {
              publicationEpoch: 12,
              status: 'PUBLISHED',
              publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
              requiredAckNodeIds: ['node-1', 'node-2', 'node-3'],
              acknowledgedNodeIds: ['node-1', 'node-2', 'node-3'],
              priorityPartitionSummary: {
                satisfied: false,
                missingPartitionIds: ['replica_operations-p1'],
                blockedPartitions: [{
                  partitionId: 'replica_operations-p1',
                  requiredDistinctNodeCount: 3,
                  readyDistinctNodeCount: 2,
                  spreadGap: 1,
                }],
              },
            },
            priorityControlPlaneRecovery: {
              active: false,
              reasonCodes: [],
              publicationRecoveryGate: {
                state: 'ready',
                ready: true,
                active: false,
                publicationEpoch: 12,
                publicationStatus: 'PUBLISHED',
                reasonCodes: [],
                priorityPartitionSummary: {
                  satisfied: true,
                  requiredDistinctNodeCount: 3,
                  readyEligibleNodeCount: 3,
                  totalPriorityPartitionCount: 5,
                  missingPartitionIds: [],
                  blockedPartitions: [],
                },
                pendingAckNodeIds: [],
                missingPublishedNodeIds: [],
                prioritySpreadPending: false,
                publicationPending: false,
                ackPending: false,
              },
            },
          }];
        },
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            return {
              publication_id: 'publication-12',
              publication_kind: 'cluster_membership',
              publication_epoch: 12,
              status: 'PUBLISHED',
              published_active_node_ids: ['node-1', 'node-2', 'node-3'],
              required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
              acknowledged_node_ids: ['node-1', 'node-2', 'node-3'],
            };
          },
          getLatestPublishedClusterPublicationSync() {
            return {
              publication_id: 'publication-12',
              publication_kind: 'cluster_membership',
              publication_epoch: 12,
              status: 'PUBLISHED',
              published_active_node_ids: ['node-1', 'node-2', 'node-3'],
              required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
              acknowledged_node_ids: ['node-1', 'node-2', 'node-3'],
            };
          },
        },
      },
    });

    const result = await snapshot.buildLocalControlSnapshot();

    t.match(
      result.controlPlaneDiagnostics.publicationConvergenceGate,
      {
        ready: true,
        prioritySpreadPending: false,
        priorityPartitionSummary: {
          satisfied: true,
          missingPartitionIds: [],
          blockedPartitions: [],
        },
      },
      'control snapshot should export the live readiness-owned convergence gate',
    );
    t.match(
      result.controlPlaneDiagnostics.priorityRecoveryObservation,
      {
        publicationEpoch: 12,
        publicationStatus: 'PUBLISHED',
        recoveryProtocolState: 'priority_spread_pending',
        priorityRecoveryReasonCodes: [
          'priority_partitions_not_spread',
        ],
        priorityRecoveryBlockedPartitionIds: ['replica_operations-p1'],
        priorityRecoveryBlockedPartitionCount: 1,
      },
      'control snapshot should export the shared priority-recovery observation snapshot',
    );
    const priorityRecoveryWitnesses = Array.isArray(
      result.controlPlaneDiagnostics.priorityRecoveryObservation
        ?.priorityRecoveryPartitionWitnesses,
    ) ?
      result.controlPlaneDiagnostics.priorityRecoveryObservation
        .priorityRecoveryPartitionWitnesses :
      [];
    t.ok(
      priorityRecoveryWitnesses.length > 0,
      'control snapshot should export priority-recovery partition witnesses',
    );
    t.equal(
      priorityRecoveryWitnesses[0]?.partitionId,
      'replica_operations-p1',
      'control snapshot should preserve the blocked partition witness id',
    );
    t.ok(
      typeof priorityRecoveryWitnesses[0]?.progressContractState === 'string' &&
        priorityRecoveryWitnesses[0].progressContractState.length > 0,
      'control snapshot should expose witness progress contract state',
    );
    t.ok(
      typeof priorityRecoveryWitnesses[0]?.currentOwner === 'string' &&
        priorityRecoveryWitnesses[0].currentOwner.length > 0,
      'control snapshot should expose witness current owner',
    );
    t.ok(
      typeof priorityRecoveryWitnesses[0]?.actuationState === 'string' &&
        priorityRecoveryWitnesses[0].actuationState.length > 0,
      'control snapshot should expose witness actuation state',
    );
    t.ok(
      typeof priorityRecoveryWitnesses[0]?.nextRequiredAction === 'string' &&
        priorityRecoveryWitnesses[0].nextRequiredAction.length > 0,
      'control snapshot should expose witness next required action',
    );
    t.ok(
      typeof priorityRecoveryWitnesses[0]?.workflowProgressPhaseId === 'string' &&
        priorityRecoveryWitnesses[0].workflowProgressPhaseId.length > 0,
      'control snapshot should expose witness workflow progress phase',
    );
    t.equal(
      priorityRecoveryWitnesses[0]?.stepAgeMs,
      1000,
      'control snapshot should expose witness workflow step age',
    );
    t.ok(
      typeof result.controlPlaneDiagnostics.priorityRecoveryObservation
        ?.pressureConditions?.pressureState === 'string',
      'control snapshot should expose top-level priority-recovery pressure conditions',
    );
  });

test('AdminControlSnapshot refreshes stale readiness publication gates from the shared closure witness',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-1',
      nowFn: () => 1000,
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [{
            nodeId: 'node-1',
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            },
            membershipPublication: {
              publicationEpoch: 12,
              status: 'PUBLISHED',
              publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
              requiredAckNodeIds: ['node-1', 'node-2', 'node-3'],
              acknowledgedNodeIds: ['node-1', 'node-2', 'node-3'],
              priorityPartitionSummary: {
                satisfied: false,
                missingPartitionIds: ['replica_operations-p1'],
                blockedPartitions: [{
                  partitionId: 'replica_operations-p1',
                  requiredDistinctNodeCount: 3,
                  readyDistinctNodeCount: 2,
                  spreadGap: 1,
                }],
              },
            },
            priorityControlPlaneRecovery: {
              active: true,
              reasonCodes: ['priority_partitions_not_spread'],
              publicationRecoveryGate: {
                state: 'priority_spread_pending',
                ready: false,
                active: true,
                publicationEpoch: 12,
                publicationStatus: 'PUBLISHED',
                recoveryProtocolState: 'priority_spread_pending',
                reasonCodes: ['priority_partitions_not_spread'],
                priorityPartitionSummary: {
                  satisfied: false,
                  missingPartitionIds: ['replica_operations-p1'],
                  blockedPartitions: [{
                    partitionId: 'replica_operations-p1',
                    requiredDistinctNodeCount: 3,
                    readyDistinctNodeCount: 2,
                    spreadGap: 1,
                  }],
                },
                pendingAckNodeIds: [],
                missingPublishedNodeIds: [],
                prioritySpreadPending: true,
                publicationPending: false,
                ackPending: false,
              },
            },
          }];
        },
      },
    });
    snapshot.buildPriorityRecoveryDecisionSnapshots = () => ({
      closureWitness: {
        state: 'closure_satisfied_stale_publication',
        prioritySpreadPending: false,
        publicationRefreshRequired: true,
        closureRecordId: 'CL-003',
        closureWitnessClass:
          'publication_converged_priority_spread_pending',
        refreshedPriorityPartitionSummary: {
          satisfied: true,
          requiredDistinctNodeCount: 3,
          readyEligibleNodeCount: 3,
          totalPriorityPartitionCount: 1,
          missingPartitionIds: [],
          blockedPartitions: [],
          blockedPartitionCount: 0,
          largestSpreadGap: 0,
          totalSpreadGap: 0,
        },
      },
      priorityPartitionSummary: {
        satisfied: true,
        requiredDistinctNodeCount: 3,
        readyEligibleNodeCount: 3,
        totalPriorityPartitionCount: 1,
        missingPartitionIds: [],
        blockedPartitions: [],
        blockedPartitionCount: 0,
        largestSpreadGap: 0,
        totalSpreadGap: 0,
      },
      partitionIdsBySemanticState: {},
      snapshots: [],
    });

    const result = await snapshot.buildLocalControlSnapshot();

    t.match(
      result.controlPlaneDiagnostics.publicationConvergenceGate,
      {
        ready: true,
        prioritySpreadPending: false,
        closureRecordId: 'CL-003',
        closureWitnessClass: 'publication_converged_priority_spread_pending',
        priorityPartitionSummary: {
          satisfied: true,
          missingPartitionIds: [],
          blockedPartitions: [],
        },
      },
      'control snapshot should rebuild the convergence gate from the shared closure witness instead of stale per-node readiness state',
    );
    t.match(
      result.controlPlaneDiagnostics.priorityRecoveryObservation,
      {
        prioritySpreadPending: false,
        closureRecordId: 'CL-003',
        closureWitnessClass: 'publication_converged_priority_spread_pending',
        priorityRecoveryBlockedPartitionCount: 0,
        priorityRecoveryUnresolvedPartitionCount: 0,
      },
      'control snapshot should expose the same closure witness in the top-level observation snapshot',
    );
  });

test('AdminControlSnapshot schedules workflow-owner reentry for dispatch-pending priority recovery snapshots',
  async (t) => {
    const scheduledReentries = [];
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.PRIORITY_RECOVERY_REENTRY_NODE_ID,
      nowFn: () => ACTIVE_GATE_SNAPSHOT_TEST_STATE.PRIORITY_RECOVERY_REENTRY_NOW_MS,
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      sqlQueryEngine: {
        rebalanceCoordinator: {
          workflowOwner: {
            schedulePriorityRecoveryDispatchPendingReentry(
              decisionSnapshot,
              operations,
              options,
            ) {
              scheduledReentries.push({
                decisionSnapshot,
                operations,
                options,
              });
              return true;
            },
          },
        },
      },
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [];
        },
      },
    });
    snapshot.buildPriorityRecoveryDecisionSnapshots = () => ({
      priorityPartitionSummary: {
        satisfied: false,
        missingPartitionIds: [
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.PRIORITY_RECOVERY_REENTRY_PARTITION_ID,
        ],
        blockedPartitions: [],
      },
      partitionIdsBySemanticState: {},
      snapshots: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.PRIORITY_RECOVERY_REENTRY_DECISION_SNAPSHOT],
    });

    await snapshot.buildLocalControlSnapshot();

    t.equal(
      scheduledReentries.length,
      1,
      'admin control snapshots should hand dispatch-pending priority recovery snapshots back to the workflow owner',
    );
    t.equal(
      scheduledReentries[0].decisionSnapshot,
      ACTIVE_GATE_SNAPSHOT_TEST_STATE.PRIORITY_RECOVERY_REENTRY_DECISION_SNAPSHOT,
      'admin reentry should preserve the canonical decision snapshot',
    );
    t.same(
      scheduledReentries[0].operations,
      [ACTIVE_GATE_SNAPSHOT_TEST_STATE.PRIORITY_RECOVERY_REENTRY_OPERATION],
      'admin reentry should pass the canonical operation from the decision snapshot',
    );
    t.same(
      scheduledReentries[0].options,
      ACTIVE_GATE_SNAPSHOT_TEST_STATE.PRIORITY_RECOVERY_REENTRY_OPTIONS,
      'admin reentry should allow the workflow owner to retry after its owner lane clears',
    );
  });

test('AdminControlSnapshot does not leak runtime readiness blockers into the exported publication convergence gate',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-1',
      nowFn: () => 1000,
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [{
            nodeId: 'node-1',
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: false,
            },
            membershipPublication: {
              publicationEpoch: 18,
              status: 'PUBLISHED',
              publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
              requiredAckNodeIds: ['node-1', 'node-2', 'node-3'],
              acknowledgedNodeIds: ['node-1', 'node-2', 'node-3'],
              priorityPartitionSummary: {
                satisfied: true,
                missingPartitionIds: [],
                blockedPartitions: [],
              },
            },
            priorityControlPlaneRecovery: {
              active: false,
              state: 'runtime_blocked',
              reasonCodes: ['control_plane_not_writable'],
              publicationGateReasonCodes: [],
              runtimeBlockerReasonCodes: ['control_plane_not_writable'],
              publicationRecoveryGate: {
                state: 'ready',
                ready: true,
                active: false,
                publicationEpoch: 18,
                publicationStatus: 'PUBLISHED',
                reasonCodes: [],
                priorityPartitionSummary: {
                  satisfied: true,
                  missingPartitionIds: [],
                  blockedPartitions: [],
                },
                pendingAckNodeIds: [],
                missingPublishedNodeIds: [],
                prioritySpreadPending: false,
                publicationPending: false,
                ackPending: false,
              },
            },
          }];
        },
      },
    });

    const result = await snapshot.buildLocalControlSnapshot();

    t.match(
      result.controlPlaneDiagnostics.publicationConvergenceGate,
      {
        ready: true,
        prioritySpreadPending: false,
        reasonCodes: [],
      },
      'control snapshot should keep runtime blocker reasons out of the canonical publication gate',
    );
    t.equal(
      result.controlPlaneDiagnostics.publicationConvergence
        ?.priorityRecoveryReasonCodes?.includes('control_plane_not_writable'),
      false,
      'top-level publication convergence should not inherit runtime-only blocker vocabulary',
    );
  });
