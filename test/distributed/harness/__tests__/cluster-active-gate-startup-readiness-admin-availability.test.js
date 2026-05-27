import assert from 'node:assert';

import {test} from '../../../../src/test-helpers/tap.js';
import {
  createCluster,
  NODE_ROLES,
} from './cluster-test-helpers.js';

const ADMIN_AVAILABILITY_STARTUP_TEST_NAME =
  'Unit: active gate consumes startup admin availability support contract';
const ADMIN_AVAILABILITY_LOAD_TEST_NAME =
  'Unit: active gate consumes load admin availability support contract';
const ADMIN_AVAILABILITY_LOAD_UNREACHABLE_TEST_NAME =
  'Unit: active gate consumes load admin availability unreachable contract';
const ADMIN_AVAILABILITY_SEED_ID = 'seed-1';
const ADMIN_AVAILABILITY_SELECTED_ID = 'selected-1';
const ADMIN_AVAILABILITY_JOINER_ID = 'joiner-1';
const ADMIN_AVAILABILITY_NODE_IDS = Object.freeze([
  ADMIN_AVAILABILITY_SEED_ID,
  ADMIN_AVAILABILITY_SELECTED_ID,
  ADMIN_AVAILABILITY_JOINER_ID,
]);
const ADMIN_AVAILABILITY_PENDING_RECOVERY_NODE_IDS = Object.freeze([
  ADMIN_AVAILABILITY_SELECTED_ID,
]);
const ADMIN_AVAILABILITY_HTTP_OK = 200;
const ADMIN_AVAILABILITY_DEADLINE_MS = 5000;
const ADMIN_AVAILABILITY_BEST_COVERAGE_NODE_COUNT = 1;
const ADMIN_AVAILABILITY_SINGLE_COUNT = 1;
const ADMIN_AVAILABILITY_ZERO_COUNT = 0;
const ADMIN_AVAILABILITY_RETRY_AFTER_MS = 100;
const ADMIN_AVAILABILITY_DOCKER_SOCKET = '/var/run/docker.sock';
const ADMIN_AVAILABILITY_IMAGE = 'distributed-db:test';
const ADMIN_AVAILABILITY_PUBLICATION_STATUS = 'PUBLISHED';
const ADMIN_AVAILABILITY_HANDOFF_STATE_PENDING = 'pending';
const ADMIN_AVAILABILITY_HANDOFF_REASON_OWNER_RECONCILE =
  'owner_reconcile_pending';
const ADMIN_AVAILABILITY_HANDOFF_NEXT_WAIT_OWNER_RECOVERY =
  'wait_owner_recovery';
const ADMIN_AVAILABILITY_HANDOFF_OUTCOME_WRITE_DEFERRED = 'write_deferred';
const ADMIN_AVAILABILITY_OBSERVATION_REPAIR_DEFERRED = 'repair_deferred';
const ADMIN_AVAILABILITY_OBSERVATION_RETRY = 'retry';
const ADMIN_AVAILABILITY_OBSERVATION_SELECTED_TIMEOUT = 'selected_timeout';
const ADMIN_AVAILABILITY_ACTIVE_STATE = 'active';
const ADMIN_AVAILABILITY_PROJECTION_REASON = 'startup_admin_projection';
const ADMIN_AVAILABILITY_LOAD_MODE = 'load';
const ADMIN_AVAILABILITY_ADMIN_ERROR =
  'connect ECONNREFUSED 172.19.0.4:8081';
const ADMIN_AVAILABILITY_ADMIN_UNREACHABLE_ERROR =
  'connect EHOSTUNREACH 172.18.0.4:8081';
const ADMIN_AVAILABILITY_SELECTED_SNAPSHOT_TIMEOUT =
  'Control snapshot query timed out for ' + ADMIN_AVAILABILITY_SELECTED_ID;

function makeActiveNode(id, role) {
  return {
    id,
    role,
    async probeBootstrapReadiness() {
      return {
        status: ADMIN_AVAILABILITY_HTTP_OK,
        state: ADMIN_AVAILABILITY_ACTIVE_STATE,
        reasons: [],
      };
    },
  };
}

async function probeAdminAvailabilityProjection(options = {}) {
  const {
    adminError = ADMIN_AVAILABILITY_ADMIN_ERROR,
    ...probeOptions
  } = options;
  const cluster = createCluster({
    size: ADMIN_AVAILABILITY_NODE_IDS.length,
    docker: {socketPath: ADMIN_AVAILABILITY_DOCKER_SOCKET},
    image: ADMIN_AVAILABILITY_IMAGE,
  });

  cluster._nodes.set(
    ADMIN_AVAILABILITY_SEED_ID,
    makeActiveNode(ADMIN_AVAILABILITY_SEED_ID, NODE_ROLES.SEED),
  );
  cluster._nodes.set(
    ADMIN_AVAILABILITY_SELECTED_ID,
    makeActiveNode(ADMIN_AVAILABILITY_SELECTED_ID, NODE_ROLES.JOINER),
  );
  cluster._nodes.set(ADMIN_AVAILABILITY_JOINER_ID, {
    ...makeActiveNode(ADMIN_AVAILABILITY_JOINER_ID, NODE_ROLES.JOINER),
    async getReachabilityDiagnostics() {
      return {
        adminReady: false,
        reachable: true,
        adminHealth: {error: adminError},
        lastError: adminError,
      };
    },
  });

  cluster._probeControlSnapshotCoverage = async () => {
    return {
      completeCoverage: false,
      expectedNodeCount: ADMIN_AVAILABILITY_NODE_IDS.length,
      bestCoverageNodeCount: ADMIN_AVAILABILITY_BEST_COVERAGE_NODE_COUNT,
      selectedNodeId: ADMIN_AVAILABILITY_SELECTED_ID,
      selectedAdminReady: true,
      selectedError: ADMIN_AVAILABILITY_SELECTED_SNAPSHOT_TIMEOUT,
      selectedSnapshotRepairDeferred: true,
      selectedSnapshotObservationMode:
        ADMIN_AVAILABILITY_OBSERVATION_REPAIR_DEFERRED,
      selectedSnapshotObservationNextAction:
        ADMIN_AVAILABILITY_OBSERVATION_RETRY,
      selectedSnapshotObservationRetryAfterMs:
        ADMIN_AVAILABILITY_RETRY_AFTER_MS,
      selectedSnapshotObservationReasonCodes: [
        ADMIN_AVAILABILITY_OBSERVATION_SELECTED_TIMEOUT,
      ],
      selectedPublicationConvergence: {
        publicationStatus: ADMIN_AVAILABILITY_PUBLICATION_STATUS,
        publishedActiveNodeIds: [...ADMIN_AVAILABILITY_NODE_IDS],
        pendingAckNodeIds: [],
        priorityPartitionSummary: {
          satisfied: true,
          blockedPartitionCount: ADMIN_AVAILABILITY_ZERO_COUNT,
          totalSpreadGap: ADMIN_AVAILABILITY_ZERO_COUNT,
        },
      },
      selectedPublishedActiveNodeIds: [...ADMIN_AVAILABILITY_NODE_IDS],
      selectedPublicationActiveGateHandoff: {
        state: ADMIN_AVAILABILITY_HANDOFF_STATE_PENDING,
        reasonCode: ADMIN_AVAILABILITY_HANDOFF_REASON_OWNER_RECONCILE,
        nextAction: ADMIN_AVAILABILITY_HANDOFF_NEXT_WAIT_OWNER_RECOVERY,
        runtimePromotionAllowed: false,
        pendingRecoveryNodeIds: [
          ...ADMIN_AVAILABILITY_PENDING_RECOVERY_NODE_IDS,
        ],
      },
      selectedMembershipPublicationHandoffOutcome: {
        state: ADMIN_AVAILABILITY_HANDOFF_OUTCOME_WRITE_DEFERRED,
        reasonCode: ADMIN_AVAILABILITY_HANDOFF_REASON_OWNER_RECONCILE,
        enqueued: false,
        retryAfterMs: ADMIN_AVAILABILITY_RETRY_AFTER_MS,
      },
      selectedControlPlaneOwnerQueueDepth: {
        pendingWrites: ADMIN_AVAILABILITY_SINGLE_COUNT,
        pendingWriteGrowthCount: ADMIN_AVAILABILITY_ZERO_COUNT,
      },
    };
  };

  return cluster._probeClusterActiveState(
    Date.now() + ADMIN_AVAILABILITY_DEADLINE_MS,
    probeOptions,
  );
}

function assertAdminAvailabilityProjected(result) {
  const projectedJoiner = result.nodeDiagnostics.find(
    (diagnostic) => diagnostic.nodeId === ADMIN_AVAILABILITY_JOINER_ID,
  );

  assert.equal(result.allActive, true);
  assert.equal(projectedJoiner?.active, true);
  assert.equal(projectedJoiner?.state, ADMIN_AVAILABILITY_ACTIVE_STATE);
  assert.equal(
    projectedJoiner?.activitySource,
    ADMIN_AVAILABILITY_PROJECTION_REASON,
  );
  assert.equal(
    projectedJoiner?.reasons.includes(ADMIN_AVAILABILITY_PROJECTION_REASON),
    true,
  );
  assert.equal(result.snapshotCoverage.completeCoverage, false);
}

test(ADMIN_AVAILABILITY_STARTUP_TEST_NAME, async () => {
  const result = await probeAdminAvailabilityProjection();

  assertAdminAvailabilityProjected(result);
});

test(ADMIN_AVAILABILITY_LOAD_TEST_NAME, async () => {
  const result = await probeAdminAvailabilityProjection({
    mode: ADMIN_AVAILABILITY_LOAD_MODE,
  });

  assertAdminAvailabilityProjected(result);
});

test(ADMIN_AVAILABILITY_LOAD_UNREACHABLE_TEST_NAME, async () => {
  const result = await probeAdminAvailabilityProjection({
    mode: ADMIN_AVAILABILITY_LOAD_MODE,
    adminError: ADMIN_AVAILABILITY_ADMIN_UNREACHABLE_ERROR,
  });

  assertAdminAvailabilityProjected(result);
});
