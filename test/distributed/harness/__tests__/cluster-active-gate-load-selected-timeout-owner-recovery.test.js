import assert from 'node:assert';

import {test} from '../../../../src/test-helpers/tap.js';
import {
  createCluster,
  NODE_ROLES,
} from './cluster-test-helpers.js';

const LOAD_OWNER_RECOVERY_TEST_NAME =
  'Unit: load active gate consumes selected timeout owner recovery';
const LOAD_OWNER_RECOVERY_NODE_TIMEOUT = 'node-timeout';
const LOAD_OWNER_RECOVERY_NODE_DEGRADED_A = 'node-degraded-a';
const LOAD_OWNER_RECOVERY_NODE_SELECTED = 'node-selected';
const LOAD_OWNER_RECOVERY_NODE_ACTIVE = 'node-active';
const LOAD_OWNER_RECOVERY_NODE_DEGRADED_B = 'node-degraded-b';
const LOAD_OWNER_RECOVERY_NODE_IDS = Object.freeze([
  LOAD_OWNER_RECOVERY_NODE_TIMEOUT,
  LOAD_OWNER_RECOVERY_NODE_DEGRADED_A,
  LOAD_OWNER_RECOVERY_NODE_SELECTED,
  LOAD_OWNER_RECOVERY_NODE_ACTIVE,
  LOAD_OWNER_RECOVERY_NODE_DEGRADED_B,
]);
const LOAD_OWNER_RECOVERY_PENDING_RECOVERY_NODE_IDS = Object.freeze([
  LOAD_OWNER_RECOVERY_NODE_SELECTED,
]);
const LOAD_OWNER_RECOVERY_PROJECTED_NODE_IDS = Object.freeze([
  LOAD_OWNER_RECOVERY_NODE_TIMEOUT,
  LOAD_OWNER_RECOVERY_NODE_DEGRADED_A,
  LOAD_OWNER_RECOVERY_NODE_SELECTED,
  LOAD_OWNER_RECOVERY_NODE_DEGRADED_B,
]);
const LOAD_OWNER_RECOVERY_HTTP_OK = 200;
const LOAD_OWNER_RECOVERY_HTTP_UNAVAILABLE = 503;
const LOAD_OWNER_RECOVERY_DEADLINE_MS = 5000;
const LOAD_OWNER_RECOVERY_BEST_COVERAGE_NODE_COUNT = 1;
const LOAD_OWNER_RECOVERY_SINGLE_COUNT = 1;
const LOAD_OWNER_RECOVERY_ZERO_COUNT = 0;
const LOAD_OWNER_RECOVERY_RETRY_AFTER_MS = 15000;
const LOAD_OWNER_RECOVERY_DOCKER_SOCKET = '/var/run/docker.sock';
const LOAD_OWNER_RECOVERY_IMAGE = 'distributed-db:test';
const LOAD_OWNER_RECOVERY_HANDOFF_STATE_PENDING = 'pending';
const LOAD_OWNER_RECOVERY_HANDOFF_REASON_OWNER_RECONCILE =
  'owner_reconcile_pending';
const LOAD_OWNER_RECOVERY_HANDOFF_NEXT_WAIT_OWNER_RECOVERY =
  'wait_owner_recovery';
const LOAD_OWNER_RECOVERY_HANDOFF_OUTCOME_WRITE_DEFERRED =
  'write_deferred';
const LOAD_OWNER_RECOVERY_OBSERVATION_REPAIR_DEFERRED = 'repair_deferred';
const LOAD_OWNER_RECOVERY_OBSERVATION_RETRY = 'retry';
const LOAD_OWNER_RECOVERY_OBSERVATION_SELECTED_TIMEOUT = 'selected_timeout';
const LOAD_OWNER_RECOVERY_ACTIVE_STATE = 'active';
const LOAD_OWNER_RECOVERY_DEGRADED_STATE = 'degraded';
const LOAD_OWNER_RECOVERY_DEGRADED_PHASE = 'DEGRADED';
const LOAD_OWNER_RECOVERY_PRIORITY_RECOVERY_PENDING =
  'PRIORITY_CONTROL_PLANE_RECOVERY_PENDING';
const LOAD_OWNER_RECOVERY_PROJECTION_SOURCE =
  'load_publication_gate_projection';
const LOAD_OWNER_RECOVERY_PROJECTION_REASON = 'load_publication_gate_ready';
const LOAD_OWNER_RECOVERY_SELECTED_SNAPSHOT_TIMEOUT =
  'Admin API query timed out for node ' +
  LOAD_OWNER_RECOVERY_NODE_SELECTED +
  ' on lane snapshot after 15000ms';
const LOAD_OWNER_RECOVERY_READINESS_TIMEOUT =
  'Node readiness probe timed out for ' + LOAD_OWNER_RECOVERY_NODE_TIMEOUT;

function makeTrafficReadyNode(id, role) {
  return {
    id,
    role,
    async probeTrafficReadiness() {
      return {
        status: LOAD_OWNER_RECOVERY_HTTP_OK,
        state: LOAD_OWNER_RECOVERY_ACTIVE_STATE,
        reasons: [],
      };
    },
    async getReachabilityDiagnostics() {
      return {
        adminReady: true,
      };
    },
  };
}

function makeTrafficDegradedNode(id, role) {
  return {
    id,
    role,
    async probeTrafficReadiness() {
      return {
        status: LOAD_OWNER_RECOVERY_HTTP_UNAVAILABLE,
        state: LOAD_OWNER_RECOVERY_DEGRADED_STATE,
        phase: LOAD_OWNER_RECOVERY_DEGRADED_PHASE,
        reasons: [
          LOAD_OWNER_RECOVERY_PRIORITY_RECOVERY_PENDING,
        ],
      };
    },
    async getReachabilityDiagnostics() {
      return {
        adminReady: true,
      };
    },
  };
}

function makeTrafficTimeoutNode(id, role) {
  return {
    id,
    role,
    async probeTrafficReadiness() {
      throw new Error(LOAD_OWNER_RECOVERY_READINESS_TIMEOUT);
    },
  };
}

test(LOAD_OWNER_RECOVERY_TEST_NAME, async () => {
  const cluster = createCluster({
    size: LOAD_OWNER_RECOVERY_NODE_IDS.length,
    docker: {socketPath: LOAD_OWNER_RECOVERY_DOCKER_SOCKET},
    image: LOAD_OWNER_RECOVERY_IMAGE,
  });

  cluster._nodes.set(
    LOAD_OWNER_RECOVERY_NODE_TIMEOUT,
    makeTrafficTimeoutNode(LOAD_OWNER_RECOVERY_NODE_TIMEOUT, NODE_ROLES.SEED),
  );
  cluster._nodes.set(
    LOAD_OWNER_RECOVERY_NODE_DEGRADED_A,
    makeTrafficDegradedNode(
      LOAD_OWNER_RECOVERY_NODE_DEGRADED_A,
      NODE_ROLES.JOINER,
    ),
  );
  cluster._nodes.set(
    LOAD_OWNER_RECOVERY_NODE_SELECTED,
    makeTrafficDegradedNode(
      LOAD_OWNER_RECOVERY_NODE_SELECTED,
      NODE_ROLES.JOINER,
    ),
  );
  cluster._nodes.set(
    LOAD_OWNER_RECOVERY_NODE_ACTIVE,
    makeTrafficReadyNode(LOAD_OWNER_RECOVERY_NODE_ACTIVE, NODE_ROLES.JOINER),
  );
  cluster._nodes.set(
    LOAD_OWNER_RECOVERY_NODE_DEGRADED_B,
    makeTrafficDegradedNode(
      LOAD_OWNER_RECOVERY_NODE_DEGRADED_B,
      NODE_ROLES.JOINER,
    ),
  );

  cluster._probeControlSnapshotCoverage = async () => {
    return {
      completeCoverage: false,
      expectedNodeCount: LOAD_OWNER_RECOVERY_NODE_IDS.length,
      bestCoverageNodeCount: LOAD_OWNER_RECOVERY_BEST_COVERAGE_NODE_COUNT,
      selectedNodeId: LOAD_OWNER_RECOVERY_NODE_SELECTED,
      selectedAdminReady: true,
      selectedReachableBy: 'admin_health',
      selectedError: LOAD_OWNER_RECOVERY_SELECTED_SNAPSHOT_TIMEOUT,
      selectedSnapshotRepairDeferred: true,
      selectedSnapshotObservationMode:
        LOAD_OWNER_RECOVERY_OBSERVATION_REPAIR_DEFERRED,
      selectedSnapshotObservationNextAction:
        LOAD_OWNER_RECOVERY_OBSERVATION_RETRY,
      selectedSnapshotObservationRetryAfterMs:
        LOAD_OWNER_RECOVERY_RETRY_AFTER_MS,
      selectedSnapshotObservationReasonCodes: [
        LOAD_OWNER_RECOVERY_OBSERVATION_SELECTED_TIMEOUT,
      ],
      selectedPublicationConvergence: null,
      selectedPublishedActiveNodeIds: [],
      selectedMissingPublishedNodeIds: [],
      selectedPublicationActiveGateHandoff: {
        state: LOAD_OWNER_RECOVERY_HANDOFF_STATE_PENDING,
        reasonCode: LOAD_OWNER_RECOVERY_HANDOFF_REASON_OWNER_RECONCILE,
        nextAction: LOAD_OWNER_RECOVERY_HANDOFF_NEXT_WAIT_OWNER_RECOVERY,
        runtimePromotionAllowed: false,
        publishedActiveNodeIds: [...LOAD_OWNER_RECOVERY_NODE_IDS],
        missingPublishedNodeIds: [],
        pendingRecoveryNodeIds: [
          ...LOAD_OWNER_RECOVERY_PENDING_RECOVERY_NODE_IDS,
        ],
      },
      selectedMembershipPublicationHandoffOutcome: {
        state: LOAD_OWNER_RECOVERY_HANDOFF_OUTCOME_WRITE_DEFERRED,
        reasonCode: LOAD_OWNER_RECOVERY_HANDOFF_REASON_OWNER_RECONCILE,
        enqueued: false,
        retryAfterMs: LOAD_OWNER_RECOVERY_RETRY_AFTER_MS,
      },
      selectedControlPlaneOwnerQueueDepth: {
        pendingWrites: LOAD_OWNER_RECOVERY_SINGLE_COUNT,
        pendingWriteGrowthCount: LOAD_OWNER_RECOVERY_ZERO_COUNT,
      },
    };
  };

  const result = await cluster._probeClusterActiveState(
    Date.now() + LOAD_OWNER_RECOVERY_DEADLINE_MS,
    {mode: 'load'},
  );

  assert.equal(result.allActive, true);
  assert.equal(result.snapshotCoverage.completeCoverage, false);
  assert.deepEqual(result.snapshotCoverage.selectedPublishedActiveNodeIds, []);
  assert.equal(result.publicationConvergenceGate.ready, true);

  for (const diagnostic of result.nodeDiagnostics) {
    assert.equal(diagnostic.active, true);
    assert.equal(diagnostic.state, LOAD_OWNER_RECOVERY_ACTIVE_STATE);
    if (!LOAD_OWNER_RECOVERY_PROJECTED_NODE_IDS.includes(diagnostic.nodeId)) {
      continue;
    }
    assert.equal(
      diagnostic.activitySource,
      LOAD_OWNER_RECOVERY_PROJECTION_SOURCE,
    );
    assert.equal(
      diagnostic.reasons.includes(LOAD_OWNER_RECOVERY_PROJECTION_REASON),
      true,
    );
  }
});
