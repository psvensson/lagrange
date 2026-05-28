import {test} from '../../src/test-helpers/tap.js';
import {AdminControlSnapshot} from '../../src/admin/admin-control-snapshot.js';
import {TABLES} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  buildCanonicalPublicationRecoveryEvidence,
} from '../../src/control-plane/publication-recovery-evidence.js';
import * as ACTIVE_GATE_SNAPSHOT_TEST_STATE from './admin-control-snapshot-active-gate-fixture-state.js';

const PUBLICATION_CONVERGENCE_QUERY_ENGINE_NODE_ID = 'node-1';
const PUBLICATION_CONVERGENCE_QUERY_ENGINE_NOW_MS = 1000;
const PUBLICATION_CONVERGENCE_QUERY_ENGINE_EPOCH = 12;
const PUBLICATION_CONVERGENCE_QUERY_ENGINE_STATUS = 'ACK_PENDING';
const PUBLICATION_CONVERGENCE_QUERY_ENGINE_STATE_AVAILABLE = 'available';
const PUBLICATION_CONVERGENCE_QUERY_ENGINE_STATE_UNAVAILABLE = 'unavailable';
const PUBLICATION_CONVERGENCE_QUERY_ENGINE_REASON_AVAILABLE =
  'sql_query_engine_available';
const PUBLICATION_CONVERGENCE_QUERY_ENGINE_REASON_UNAVAILABLE =
  'sql_query_engine_unavailable';

function buildPublicationConvergenceQueryEnginePublication() {
  return {
    publicationEpoch: PUBLICATION_CONVERGENCE_QUERY_ENGINE_EPOCH,
    status: PUBLICATION_CONVERGENCE_QUERY_ENGINE_STATUS,
    publishedActiveNodeIds: [PUBLICATION_CONVERGENCE_QUERY_ENGINE_NODE_ID],
    requiredAckNodeIds: [PUBLICATION_CONVERGENCE_QUERY_ENGINE_NODE_ID],
    acknowledgedNodeIds: [PUBLICATION_CONVERGENCE_QUERY_ENGINE_NODE_ID],
  };
}

test('AdminControlSnapshot routes publication convergence through the shared recovery protocol snapshot',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-1',
      nowFn: () => 1000,
    });

    const diagnostics = snapshot.resolvePublicationConvergenceDiagnostics([], {
      publicationEpoch: 12,
      status: 'ACK_PENDING',
      publishedActiveNodeIds: ['node-1'],
      requiredAckNodeIds: ['node-1', 'node-2'],
      acknowledgedNodeIds: ['node-1'],
      priorityPartitionSummary: {
        satisfied: false,
        missingPartitionIds: ['replica_operations-p1'],
      },
      membershipLifecycleSummary: {
        publishedActiveNodeIds: ['node-1'],
        projectedServingNodeIds: ['node-1', 'node-2'],
        locallyEligibleNodeIds: ['node-1', 'node-2'],
        recoveryActiveNodeIds: ['node-1', 'node-2'],
        recoveryActiveNodeSource: 'recovery_eligible_projection',
        missingPublishedRecoveryActiveNodeIds: ['node-2'],
      },
    });

    t.equal(
      diagnostics?.recoveryProtocolState,
      'publication_pending',
      'admin convergence diagnostics should expose the shared recovery protocol phase',
    );
    t.same(
      diagnostics?.priorityRecoveryReasonCodes,
      [
        'publication_epoch_pending',
        'priority_partitions_not_spread',
      ],
      'admin convergence diagnostics should preserve canonical protocol reasons',
    );
    t.match(
      diagnostics?.participationByNodeId || {},
      {
        'node-1': {
          state: 'recovery_pending_publish',
        },
        'node-2': {
          state: 'recovery_pending_publish',
          recoveryActive: true,
        },
      },
      'admin convergence diagnostics should preserve canonical node participation',
    );
  });

test('AdminControlSnapshot exposes SQL query engine availability in publication convergence diagnostics',
  async (t) => {
    const unavailableSnapshot = new AdminControlSnapshot({
      nodeId: PUBLICATION_CONVERGENCE_QUERY_ENGINE_NODE_ID,
      nowFn: () => PUBLICATION_CONVERGENCE_QUERY_ENGINE_NOW_MS,
    });
    const unavailableDiagnostics =
      unavailableSnapshot.resolvePublicationConvergenceDiagnostics(
        [],
        buildPublicationConvergenceQueryEnginePublication(),
      );

    t.match(
      unavailableDiagnostics,
      {
        queryEngineAvailable: false,
        queryEngineAvailability: {
          state: PUBLICATION_CONVERGENCE_QUERY_ENGINE_STATE_UNAVAILABLE,
          reasonCode:
            PUBLICATION_CONVERGENCE_QUERY_ENGINE_REASON_UNAVAILABLE,
        },
      },
      'publication convergence should identify unavailable SQL query engine before active-gate visibility waits',
    );

    const availableSnapshot = new AdminControlSnapshot({
      nodeId: PUBLICATION_CONVERGENCE_QUERY_ENGINE_NODE_ID,
      nowFn: () => PUBLICATION_CONVERGENCE_QUERY_ENGINE_NOW_MS,
    });
    const availableDiagnostics =
      availableSnapshot.resolvePublicationConvergenceDiagnostics(
        [],
        buildPublicationConvergenceQueryEnginePublication(),
        {
          queryEngineAvailable: true,
        },
      );

    t.match(
      availableDiagnostics,
      {
        queryEngineAvailable: true,
        queryEngineAvailability: {
          state: PUBLICATION_CONVERGENCE_QUERY_ENGINE_STATE_AVAILABLE,
          reasonCode: PUBLICATION_CONVERGENCE_QUERY_ENGINE_REASON_AVAILABLE,
        },
      },
      'publication convergence should identify executable SQL query engine before active-gate visibility waits',
    );
  });

test('AdminControlSnapshot uses authoritative published fallback when readiness has stale seed-only publication',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      nowFn: () => ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NOW_MS,
    });

    const diagnostics = snapshot.resolvePublicationConvergenceDiagnostics(
      [{
        nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
        membershipPublication: {
          publicationEpoch: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
          status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
          requiredAckNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
          acknowledgedNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
        },
      }],
      {
        publication_id:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_ID,
        publication_kind:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
        publication_epoch:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
        status:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
        published_active_node_ids: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        required_ack_node_ids: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        acknowledged_node_ids: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
      },
    );

    t.match(
      diagnostics,
      {
        publicationEpoch:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
        status:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
      },
      'producer convergence diagnostics should prefer the wider durable published fallback over stale readiness publication',
    );
  });

test('AdminControlSnapshot carries authoritative published fallback through local snapshot diagnostics',
  async (t) => {
    const nodeRows = ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS.map((nodeId) => ({
      node_id: nodeId,
      status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NODE_STATUS,
      connection_state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_CONNECTION_STATE,
      ready_lease_expires_at:
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NOW_MS +
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_READY_LEASE_DELTA_MS,
    }));
    const serviceRows = ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS.map(
      (nodeId) => ({
        service_id: nodeId,
        node_id: nodeId,
        status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NODE_STATUS,
      }),
    );
    const durablePublishedPublicationRow = {
      publication_id:
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_ID,
      publication_kind:
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
      publication_epoch:
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
      status:
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
      published_active_node_ids: [
        ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
      ],
      required_ack_node_ids: [
        ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
      ],
      acknowledged_node_ids: [
        ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
      ],
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      nowFn: () => ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NOW_MS,
      systemTableCache: {
        getAll(tableName) {
          if (tableName === TABLES.NODES) {
            return nodeRows;
          }
          if (tableName === TABLES.SERVICES) {
            return serviceRows;
          }
          return ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS;
        },
      },
      sqlQueryEngine: {
        executeRequest() {},
      },
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [{
            nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]:
                true,
            },
            membershipPublication: {
              publicationEpoch: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
              status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
              publishedActiveNodeIds: [
                ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
              ],
              requiredAckNodeIds: [
                ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
              ],
              acknowledgedNodeIds: [
                ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
              ],
            },
          }];
        },
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            return durablePublishedPublicationRow;
          },
          getLatestPublishedClusterPublicationSync() {
            return durablePublishedPublicationRow;
          },
        },
      },
    });

    const result = await snapshot.buildLocalControlSnapshot();

    t.same(
      result.controlPlaneDiagnostics.publicationConvergence
        ?.publishedActiveNodeIds,
      [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS],
      'producer diagnostics should carry durable published membership through local snapshot assembly',
    );
    t.same(
      result.controlPlaneDiagnostics.publishedMembershipObservation
        ?.publishedActiveNodeIds,
      [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS],
      'strict published membership observation should remain aligned with producer diagnostics',
    );
    t.equal(
      result.controlPlaneDiagnostics.publicationConvergence
        ?.queryEngineAvailable,
      true,
      'producer diagnostics should carry SQL query engine availability from the control snapshot instance',
    );
    t.equal(
      result.controlPlaneDiagnostics.publicationActiveGateHandoff
        ?.pendingReconcileCount,
      ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_CLEARED_PENDING_COUNT,
      'active-gate handoff should not retain reconcile debt after producer diagnostics observe durable membership',
    );
  });

test('AdminControlSnapshot keeps priority recovery readiness ahead of generic durable fallback without handoff',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      nowFn: () => ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NOW_MS,
    });

    const diagnostics = snapshot.resolvePublicationConvergenceDiagnostics(
      [{
        nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
        priorityControlPlaneRecovery:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PRIORITY_RECOVERY,
        membershipPublication: {
          publicationEpoch: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
          status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
          requiredAckNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
          acknowledgedNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
        },
      }],
      {
        publication_id:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_ID,
        publication_kind:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
        publication_epoch:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
        status:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
        published_active_node_ids: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        required_ack_node_ids: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        acknowledged_node_ids: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
      },
      {
        preferAuthoritativePublicationRead:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_AUTHORITATIVE_READ,
      },
    );

    t.match(
      diagnostics,
      {
        publicationEpoch:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
        status:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
        ],
      },
      'generic durable fallback should not override readiness owner-recovery evidence without an active-gate handoff',
    );
  });

test('AdminControlSnapshot uses authoritative handoff reconcile fallback when readiness has priority recovery',
  async (t) => {
    const durablePublishedPublicationRow = {
      publication_id:
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_ID,
      publication_kind:
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
      publication_epoch:
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
      status:
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
      published_active_node_ids: [
        ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
      ],
      required_ack_node_ids: [
        ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
      ],
      acknowledged_node_ids: [
        ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
      ],
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      nowFn: () => ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NOW_MS,
      systemTableCache: {
        getAll() {
          return ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS;
        },
      },
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [{
            nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
            priorityControlPlaneRecovery:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PRIORITY_RECOVERY,
            membershipPublication: {
              publicationEpoch:
                ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
              status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
              publishedActiveNodeIds: [
                ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
              ],
              requiredAckNodeIds: [
                ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
              ],
              acknowledgedNodeIds: [
                ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
              ],
            },
          }];
        },
        membershipPublicationService: {
          async getLatestClusterPublication() {
            return durablePublishedPublicationRow;
          },
        },
      },
    });

    const result = await snapshot.buildLocalControlSnapshot({
      preferAuthoritativePublicationRead:
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_AUTHORITATIVE_READ,
      publicationActiveGateHandoff: {
        schemaVersion: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
        publicationEpoch: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
        expectedNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
        ],
        missingPublishedNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
        pendingReconcileNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
        pendingReconcileCount:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT,
        runtimePromotionAllowed:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
        state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
        reasonCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
        nextAction: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
      },
    });

    t.match(
      result.controlPlaneDiagnostics.publicationConvergence,
      {
        publicationEpoch:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
        status:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
      },
      'authoritative active-gate handoff fallback should override stale readiness owner-recovery publication only when it covers the handoff target',
    );
  });

test('AdminControlSnapshot exposes publication owner-truth active cohort in control snapshot nodes',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
      nowFn: () => ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NOW_MS,
      systemTableCache: {
        getAll(tableId) {
          if (tableId === TABLES.NODES) {
            return [{
              node_id: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
              status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NODE_STATUS,
              connection_state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_CONNECTION_STATE,
              ready_lease_expires_at:
                ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NOW_MS +
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_READY_LEASE_DELTA_MS,
            }];
          }
          return [];
        },
      },
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [];
        },
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            return ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_ROW;
          },
          getLatestPublishedClusterPublicationSync() {
            return ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_ROW;
          },
        },
      },
    });

    const result = await snapshot.buildLocalControlSnapshot();

    t.same(
      result.nodes,
      [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NODE_IDS],
      'snapshot nodes should include durable and recently admitted owner truth',
    );
    t.same(
      result.projectedNodes,
      [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NODE_IDS],
      'projected nodes should expose the owner-truth active cohort',
    );
    t.same(
      result.publishedNodes,
      [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID],
      'durable published nodes should remain publication-scoped',
    );
    t.same(
      result.suspectedOrTransitioningNodes,
      [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS],
      'recently admitted nodes should remain distinct from durable publication',
    );
    t.match(
      result.controlPlaneDiagnostics.activeNodeViews,
      {
        effectiveNodeIds: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NODE_IDS],
        projectedNodeIds: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NODE_IDS],
        publishedNodeIds: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID],
        effectiveSource: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_EFFECTIVE_SOURCE,
      },
      'diagnostics should identify publication owner truth as the widened source',
    );
    t.match(
      result.controlPlaneDiagnostics.activeGateOwnerCohort,
      {
        schemaVersion: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
        state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
        reasonCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
        topologyEpoch: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_EPOCH,
        expectedNodeIds: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NODE_IDS],
        expectedNodeCount: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_EXPECTED_NODE_COUNT,
        readyLeaseNodeIds: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID],
        readyLeaseNodeCount: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_READY_LEASE_COUNT,
        publishedActiveNodeIds: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID],
        publishedActiveNodeCount:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_SELECTED_PUBLISHED_COUNT,
        missingPublishedNodeIds: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS],
        missingPublishedCount: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_BEST_MISSING_COUNT,
        pendingReconcileNodeIds: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS],
        pendingReconcileCount: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_BEST_MISSING_COUNT,
        activeGateBudget: {
          state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_BUDGET_STATE_UNAVAILABLE,
        },
      },
      'active-gate owner cohort diagnostics should keep published coverage distinct from PUBLISHED status',
    );
    t.match(
      result.controlPlaneDiagnostics.publicationActiveGateHandoff,
      {
        schemaVersion: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
        publicationEpoch: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_EPOCH,
        expectedNodeIds: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NODE_IDS],
        publishedActiveNodeIds: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID],
        missingPublishedNodeIds: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS],
        pendingReconcileNodeIds: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS],
        runtimePromotionAllowed:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
        state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
        reasonCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
        nextAction: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
      },
      'control-plane diagnostics should expose the canonical publication-to-active-gate handoff contract',
    );
    t.match(
      result.controlPlaneDiagnostics.activeGateCatchupFence,
      {
        schemaVersion: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
        state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_CATCHUP_FENCE_STATE_PENDING,
        targetNodeIds: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NODE_IDS],
        durablePublication: {
          publicationEpoch: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_EPOCH,
          nodeIds: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID],
          missingNodeIds: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS],
        },
        missingProofReasons: [
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_CATCHUP_FENCE_REASON_DURABLE_INCOMPLETE,
        ],
        nextLegalAction: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION_RECONCILE,
        promotionAllowed: false,
      },
      'control-plane diagnostics should carry the owner-owned active-gate catch-up fence',
    );
    t.same(
      result.controlPlaneDiagnostics.publicationConvergence
        .activeGateCatchupFence,
      result.controlPlaneDiagnostics.activeGateCatchupFence,
      'publication convergence diagnostics should display the same catch-up fence without rebuilding promotion state',
    );
    t.match(
      result.controlPlaneDiagnostics.activeGateOwnerCohort
        .activeGateCatchupFence,
      {
        state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_CATCHUP_FENCE_STATE_PENDING,
        targetNodeIds: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NODE_IDS],
        missingProofReasons: [
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_CATCHUP_FENCE_REASON_DURABLE_INCOMPLETE,
        ],
        nextLegalAction: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION_RECONCILE,
        promotionAllowed: false,
      },
      'active-gate owner cohort diagnostics should carry the same catch-up fence',
    );
  });

test('AdminControlSnapshot normalizes active-gate owner cohort budget state',
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
          publishedActiveNodeIds: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID],
        },
        publicationConvergence: {
          publicationEpoch: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_EPOCH,
          publishedActiveNodeIds: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID],
          missingPublishedNodeIds: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS[0]],
        },
        readinessByNodeId: {
          [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS[0]]: {
            reasonCodes: [
              CONTROL_PLANE_READINESS_REASON
                .PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
            ],
          },
        },
        activeGate: {
          state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_GATE_STATE_STALLED,
          reasonCode:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_GATE_REASON_STALLED_NO_PROGRESS,
          elapsedMs: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_BUDGET_ELAPSED_MS,
          attempts: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_BUDGET_ATTEMPTS,
          maxAttempts: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_BUDGET_MAX_ATTEMPTS,
          attemptsSinceProgress:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_BUDGET_ATTEMPTS_SINCE_PROGRESS,
          coordinatorCyclesSinceProgress:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_BUDGET_COORDINATOR_CYCLES,
        },
      });

    t.match(
      activeGateOwnerCohort,
      {
        state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
        reasonCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
        pendingRecoveryNodeIds: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS[0]],
        pendingReconcileNodeIds: [],
        activeGateBudget: {
          state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_BUDGET_STATE_AVAILABLE,
          activeGateState: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_GATE_STATE_STALLED,
          reasonCode:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_GATE_REASON_STALLED_NO_PROGRESS,
          elapsedMs: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_BUDGET_ELAPSED_MS,
          attempts: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_BUDGET_ATTEMPTS,
          maxAttempts: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_BUDGET_MAX_ATTEMPTS,
          attemptsSinceProgress:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_BUDGET_ATTEMPTS_SINCE_PROGRESS,
          coordinatorCyclesSinceProgress:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_BUDGET_COORDINATOR_CYCLES,
        },
      },
      'active-gate owner cohort diagnostics should normalize bounded budget fields',
    );
  });
