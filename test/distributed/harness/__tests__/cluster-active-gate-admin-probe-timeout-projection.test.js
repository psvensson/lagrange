import assert from 'node:assert';

import {test} from '../../../../src/test-helpers/tap.js';
import {
  createCluster,
  NODE_ROLES,
} from './cluster-test-helpers.js';

const ADMIN_PROBE_SELECTED_RECOVERY_TEST_NAME =
  'Unit: active gate projects selected recovery over one admin probe timeout';
const ADMIN_PROBE_SEED_ID = 'seed-1';
const ADMIN_PROBE_JOINER_ID = 'joiner-1';
const ADMIN_PROBE_NODE_IDS = Object.freeze([
  ADMIN_PROBE_SEED_ID,
  ADMIN_PROBE_JOINER_ID,
]);
const ADMIN_PROBE_PUBLISHED_NODE_IDS = Object.freeze([
  ADMIN_PROBE_SEED_ID,
]);
const ADMIN_PROBE_PENDING_RECOVERY_NODE_IDS = Object.freeze([
  ADMIN_PROBE_JOINER_ID,
]);
const ADMIN_PROBE_HTTP_OK = 200;
const ADMIN_PROBE_DEADLINE_MS = 5000;
const ADMIN_PROBE_BEST_COVERAGE_NODE_COUNT = 1;
const ADMIN_PROBE_SINGLE_COUNT = 1;
const ADMIN_PROBE_ZERO_COUNT = 0;
const ADMIN_PROBE_RETRY_AFTER_MS = 100;
const ADMIN_PROBE_DOCKER_SOCKET = '/var/run/docker.sock';
const ADMIN_PROBE_IMAGE = 'distributed-db:test';
const ADMIN_PROBE_PUBLICATION_STATUS = 'PUBLISHED';
const ADMIN_PROBE_HANDOFF_STATE_PENDING = 'pending';
const ADMIN_PROBE_HANDOFF_REASON_OWNER_RECONCILE =
  'owner_reconcile_pending';
const ADMIN_PROBE_HANDOFF_NEXT_WAIT_OWNER_RECOVERY =
  'wait_owner_recovery';
const ADMIN_PROBE_HANDOFF_OUTCOME_WRITE_DEFERRED = 'write_deferred';
const ADMIN_PROBE_OBSERVATION_REPAIR_DEFERRED = 'repair_deferred';
const ADMIN_PROBE_OBSERVATION_RETRY = 'retry';
const ADMIN_PROBE_OBSERVATION_SELECTED_TIMEOUT = 'selected_timeout';
const ADMIN_PROBE_STARTUP_SNAPSHOT_READY = 'startup_snapshot_ready';
const ADMIN_PROBE_ACTIVE_STATE = 'active';
const ADMIN_PROBE_TIMEOUT_MESSAGE =
  'Node admin readiness probe timed out for ' + ADMIN_PROBE_JOINER_ID;
const ADMIN_PROBE_SELECTED_SNAPSHOT_TIMEOUT =
  'Control snapshot query timed out for ' + ADMIN_PROBE_SEED_ID;

test(ADMIN_PROBE_SELECTED_RECOVERY_TEST_NAME, async () => {
  const cluster = createCluster({
    size: ADMIN_PROBE_NODE_IDS.length,
    docker: {socketPath: ADMIN_PROBE_DOCKER_SOCKET},
    image: ADMIN_PROBE_IMAGE,
  });

  cluster._nodes.set(ADMIN_PROBE_SEED_ID, {
    id: ADMIN_PROBE_SEED_ID,
    role: NODE_ROLES.SEED,
    async probeBootstrapReadiness() {
      return {
        status: ADMIN_PROBE_HTTP_OK,
        state: ADMIN_PROBE_ACTIVE_STATE,
        reasons: [],
      };
    },
  });
  cluster._nodes.set(ADMIN_PROBE_JOINER_ID, {
    id: ADMIN_PROBE_JOINER_ID,
    role: NODE_ROLES.JOINER,
    async probeBootstrapReadiness() {
      return {
        status: ADMIN_PROBE_HTTP_OK,
        state: ADMIN_PROBE_ACTIVE_STATE,
        reasons: [],
      };
    },
    async getReachabilityDiagnostics() {
      throw new Error(ADMIN_PROBE_TIMEOUT_MESSAGE);
    },
  });

  cluster._probeControlSnapshotCoverage = async () => {
    return {
      completeCoverage: false,
      expectedNodeCount: ADMIN_PROBE_NODE_IDS.length,
      bestCoverageNodeCount: ADMIN_PROBE_BEST_COVERAGE_NODE_COUNT,
      selectedNodeId: ADMIN_PROBE_SEED_ID,
      selectedAdminReady: true,
      selectedError: ADMIN_PROBE_SELECTED_SNAPSHOT_TIMEOUT,
      selectedSnapshotRepairDeferred: true,
      selectedSnapshotObservationMode:
        ADMIN_PROBE_OBSERVATION_REPAIR_DEFERRED,
      selectedSnapshotObservationNextAction: ADMIN_PROBE_OBSERVATION_RETRY,
      selectedSnapshotObservationRetryAfterMs: ADMIN_PROBE_RETRY_AFTER_MS,
      selectedSnapshotObservationReasonCodes: [
        ADMIN_PROBE_OBSERVATION_SELECTED_TIMEOUT,
      ],
      selectedPublicationConvergence: {
        publicationStatus: ADMIN_PROBE_PUBLICATION_STATUS,
        publishedActiveNodeIds: [...ADMIN_PROBE_PUBLISHED_NODE_IDS],
        pendingAckNodeIds: [],
        priorityPartitionSummary: {
          satisfied: true,
          blockedPartitionCount: ADMIN_PROBE_ZERO_COUNT,
          totalSpreadGap: ADMIN_PROBE_ZERO_COUNT,
        },
      },
      selectedPublishedActiveNodeIds: [...ADMIN_PROBE_PUBLISHED_NODE_IDS],
      selectedPublicationActiveGateHandoff: {
        state: ADMIN_PROBE_HANDOFF_STATE_PENDING,
        reasonCode: ADMIN_PROBE_HANDOFF_REASON_OWNER_RECONCILE,
        nextAction: ADMIN_PROBE_HANDOFF_NEXT_WAIT_OWNER_RECOVERY,
        runtimePromotionAllowed: false,
        pendingRecoveryNodeIds: [
          ...ADMIN_PROBE_PENDING_RECOVERY_NODE_IDS,
        ],
      },
      selectedMembershipPublicationHandoffOutcome: {
        state: ADMIN_PROBE_HANDOFF_OUTCOME_WRITE_DEFERRED,
        reasonCode: ADMIN_PROBE_HANDOFF_REASON_OWNER_RECONCILE,
        enqueued: false,
        retryAfterMs: ADMIN_PROBE_RETRY_AFTER_MS,
      },
      selectedControlPlaneOwnerQueueDepth: {
        pendingWrites: ADMIN_PROBE_SINGLE_COUNT,
        pendingWriteGrowthCount: ADMIN_PROBE_ZERO_COUNT,
      },
    };
  };

  const result = await cluster._probeClusterActiveState(
    Date.now() + ADMIN_PROBE_DEADLINE_MS,
  );
  const projectedJoiner = result.nodeDiagnostics.find(
    (diagnostic) => diagnostic.nodeId === ADMIN_PROBE_JOINER_ID,
  );

  assert.equal(result.allActive, true);
  assert.equal(projectedJoiner?.active, true);
  assert.equal(projectedJoiner?.state, ADMIN_PROBE_ACTIVE_STATE);
  assert.equal(
    projectedJoiner?.reasons.includes(ADMIN_PROBE_STARTUP_SNAPSHOT_READY),
    true,
  );
  assert.equal(result.snapshotCoverage.completeCoverage, false);
});
