import {test} from '../../../../src/test-helpers/tap.js';
import {
  createCluster,
  NODE_ROLES,
} from './cluster-test-helpers.js';

const TRANSPORT_CLOSED_TEST_NAME =
  'Unit: active gate consumes selected transport-closed owner recovery';
const TRANSPORT_CLOSED_SEED_ID = 'seed-1';
const TRANSPORT_CLOSED_SELECTED_ID = 'selected-1';
const TRANSPORT_CLOSED_JOINER_ID = 'joiner-1';
const TRANSPORT_CLOSED_NODE_IDS = Object.freeze([
  TRANSPORT_CLOSED_SEED_ID,
  TRANSPORT_CLOSED_SELECTED_ID,
  TRANSPORT_CLOSED_JOINER_ID,
]);
const TRANSPORT_CLOSED_PENDING_RECOVERY_NODE_IDS = Object.freeze([
  TRANSPORT_CLOSED_SELECTED_ID,
]);
const TRANSPORT_CLOSED_HTTP_OK = 200;
const TRANSPORT_CLOSED_DEADLINE_MS = 5000;
const TRANSPORT_CLOSED_BEST_COVERAGE_NODE_COUNT = 1;
const TRANSPORT_CLOSED_SINGLE_COUNT = 1;
const TRANSPORT_CLOSED_ZERO_COUNT = 0;
const TRANSPORT_CLOSED_RETRY_AFTER_MS = 100;
const TRANSPORT_CLOSED_DOCKER_SOCKET = '/var/run/docker.sock';
const TRANSPORT_CLOSED_IMAGE = 'distributed-db:test';
const TRANSPORT_CLOSED_PUBLICATION_STATUS = 'PUBLISHED';
const TRANSPORT_CLOSED_HANDOFF_STATE_PENDING = 'pending';
const TRANSPORT_CLOSED_HANDOFF_REASON_OWNER_RECONCILE =
  'owner_reconcile_pending';
const TRANSPORT_CLOSED_HANDOFF_NEXT_WAIT_OWNER_RECOVERY =
  'wait_owner_recovery';
const TRANSPORT_CLOSED_HANDOFF_OUTCOME_WRITE_DEFERRED = 'write_deferred';
const TRANSPORT_CLOSED_OBSERVATION_REPAIR_DEFERRED = 'repair_deferred';
const TRANSPORT_CLOSED_OBSERVATION_RETRY = 'retry';
const TRANSPORT_CLOSED_OBSERVATION_REASON = 'selected_transport_closed';
const TRANSPORT_CLOSED_ACTIVE_STATE = 'active';
const TRANSPORT_CLOSED_PROJECTION_SOURCE = 'startup_snapshot_projection';
const TRANSPORT_CLOSED_PROJECTION_REASON = 'startup_snapshot_ready';
const TRANSPORT_CLOSED_SELECTED_SNAPSHOT_ERROR =
  'Admin API query failed for node ' +
  TRANSPORT_CLOSED_SELECTED_ID +
  ' on lane snapshot: WebSocket was closed before the connection was ' +
  'established';
const TRANSPORT_CLOSED_READINESS_TIMEOUT =
  'Node readiness probe timed out for ' + TRANSPORT_CLOSED_JOINER_ID;

function makeActiveNode(id, role) {
  return {
    id,
    role,
    async probeBootstrapReadiness() {
      return {
        status: TRANSPORT_CLOSED_HTTP_OK,
        state: TRANSPORT_CLOSED_ACTIVE_STATE,
        reasons: [],
      };
    },
  };
}

function makeReadinessTimeoutNode(id, role) {
  return {
    id,
    role,
    async probeBootstrapReadiness() {
      throw new Error(TRANSPORT_CLOSED_READINESS_TIMEOUT);
    },
  };
}

test(TRANSPORT_CLOSED_TEST_NAME, async (t) => {
  const cluster = createCluster({
    size: TRANSPORT_CLOSED_NODE_IDS.length,
    docker: {socketPath: TRANSPORT_CLOSED_DOCKER_SOCKET},
    image: TRANSPORT_CLOSED_IMAGE,
  });

  cluster._nodes.set(
    TRANSPORT_CLOSED_SEED_ID,
    makeActiveNode(TRANSPORT_CLOSED_SEED_ID, NODE_ROLES.SEED),
  );
  cluster._nodes.set(
    TRANSPORT_CLOSED_SELECTED_ID,
    makeActiveNode(TRANSPORT_CLOSED_SELECTED_ID, NODE_ROLES.JOINER),
  );
  cluster._nodes.set(
    TRANSPORT_CLOSED_JOINER_ID,
    makeReadinessTimeoutNode(TRANSPORT_CLOSED_JOINER_ID, NODE_ROLES.JOINER),
  );

  cluster._probeControlSnapshotCoverage = async () => {
    return {
      completeCoverage: false,
      expectedNodeCount: TRANSPORT_CLOSED_NODE_IDS.length,
      bestCoverageNodeCount: TRANSPORT_CLOSED_BEST_COVERAGE_NODE_COUNT,
      selectedNodeId: TRANSPORT_CLOSED_SELECTED_ID,
      selectedAdminReady: true,
      selectedError: TRANSPORT_CLOSED_SELECTED_SNAPSHOT_ERROR,
      selectedSnapshotRepairDeferred: true,
      selectedSnapshotObservationMode:
        TRANSPORT_CLOSED_OBSERVATION_REPAIR_DEFERRED,
      selectedSnapshotObservationNextAction:
        TRANSPORT_CLOSED_OBSERVATION_RETRY,
      selectedSnapshotObservationRetryAfterMs:
        TRANSPORT_CLOSED_RETRY_AFTER_MS,
      selectedSnapshotObservationReasonCodes: [
        TRANSPORT_CLOSED_OBSERVATION_REASON,
      ],
      selectedPublicationConvergence: {
        publicationStatus: TRANSPORT_CLOSED_PUBLICATION_STATUS,
        publishedActiveNodeIds: [...TRANSPORT_CLOSED_NODE_IDS],
        pendingAckNodeIds: [],
        priorityPartitionSummary: {
          satisfied: true,
          blockedPartitionCount: TRANSPORT_CLOSED_ZERO_COUNT,
          totalSpreadGap: TRANSPORT_CLOSED_ZERO_COUNT,
        },
      },
      selectedPublishedActiveNodeIds: [...TRANSPORT_CLOSED_NODE_IDS],
      selectedPublicationActiveGateHandoff: {
        state: TRANSPORT_CLOSED_HANDOFF_STATE_PENDING,
        reasonCode: TRANSPORT_CLOSED_HANDOFF_REASON_OWNER_RECONCILE,
        nextAction: TRANSPORT_CLOSED_HANDOFF_NEXT_WAIT_OWNER_RECOVERY,
        runtimePromotionAllowed: false,
        pendingRecoveryNodeIds: [
          ...TRANSPORT_CLOSED_PENDING_RECOVERY_NODE_IDS,
        ],
      },
      selectedMembershipPublicationHandoffOutcome: {
        state: TRANSPORT_CLOSED_HANDOFF_OUTCOME_WRITE_DEFERRED,
        reasonCode: TRANSPORT_CLOSED_HANDOFF_REASON_OWNER_RECONCILE,
        enqueued: false,
        retryAfterMs: TRANSPORT_CLOSED_RETRY_AFTER_MS,
      },
      selectedControlPlaneOwnerQueueDepth: {
        pendingWrites: TRANSPORT_CLOSED_SINGLE_COUNT,
        pendingWriteGrowthCount: TRANSPORT_CLOSED_ZERO_COUNT,
      },
    };
  };

  const result = await cluster._probeClusterActiveState(
    Date.now() + TRANSPORT_CLOSED_DEADLINE_MS,
  );
  const projectedJoiner = result.nodeDiagnostics.find(
    (diagnostic) => diagnostic.nodeId === TRANSPORT_CLOSED_JOINER_ID,
  );

  t.equal(result.allActive, true);
  t.equal(projectedJoiner?.active, true);
  t.equal(projectedJoiner?.state, TRANSPORT_CLOSED_ACTIVE_STATE);
  t.equal(
    projectedJoiner?.activitySource,
    TRANSPORT_CLOSED_PROJECTION_SOURCE,
  );
  t.equal(
    projectedJoiner?.reasons.includes(TRANSPORT_CLOSED_PROJECTION_REASON),
    true,
  );
  t.equal(result.snapshotCoverage.completeCoverage, false);
});
