import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {createCluster} from './cluster-test-helpers.js';

const TEST_NAME =
  'Unit: _waitForAllActive keeps steady-published selected-membership ' +
  'count in timeout progress diagnostics';
const TEST_CLUSTER_SIZE = 3;
const TEST_TIMEOUT_MS = 5;
const TEST_DOCKER_SOCKET_PATH = '/var/run/docker.sock';
const TEST_IMAGE = 'distributed-db:test';
const TEST_SEED_NODE_ID = 'steady-publication-seed';
const TEST_MISSING_NODE_ID_A = 'steady-publication-missing-a';
const TEST_MISSING_NODE_ID_B = 'steady-publication-missing-b';
const TEST_ACTIVE_STATE = 'active';
const TEST_ADMIN_HEALTH_SOURCE = 'admin_health';
const TEST_PUBLICATION_STATUS = 'PUBLISHED';
const TEST_RECOVERY_PROTOCOL_STATE = 'steady_published';
const TEST_EXPECTED_ERROR_PATTERN = /Not all nodes reached ACTIVE state within/;
const TEST_EMPTY_TEXT = '';
const TEST_MISSING_PUBLISHED_FRAGMENT = 'missingPublished=2';
const TEST_MISSING_PUBLISHED_IDS_FRAGMENT =
  'missingPublishedIds=' +
  TEST_MISSING_NODE_ID_A +
  '|' +
  TEST_MISSING_NODE_ID_B;
const TEST_REGEX_FLAG_UNICODE = 'u';
const TEST_ZERO_COUNT = 0;
const TEST_SINGLE_COUNT = 1;
const TEST_TWO_COUNT = 2;
const TEST_MISSING_PUBLISHED_ASSERTION =
  'timeout progress should keep the selected-membership deficit count';
const TEST_MISSING_PUBLISHED_IDS_ASSERTION =
  'timeout progress should keep the selected missing-published node ids';
const TEST_DIAGNOSTIC_COUNT_ASSERTION =
  'no-progress diagnostics should keep the steady selected-membership count';
const TEST_ACTIVE_NODE_DIAGNOSTICS = Object.freeze([
  Object.freeze({
    nodeId: TEST_SEED_NODE_ID,
    active: true,
    state: TEST_ACTIVE_STATE,
  }),
  Object.freeze({
    nodeId: TEST_MISSING_NODE_ID_A,
    active: true,
    state: TEST_ACTIVE_STATE,
  }),
  Object.freeze({
    nodeId: TEST_MISSING_NODE_ID_B,
    active: true,
    state: TEST_ACTIVE_STATE,
  }),
]);
const TEST_PUBLISHED_ACTIVE_NODE_IDS = Object.freeze([
  TEST_SEED_NODE_ID,
]);
const TEST_MISSING_PUBLISHED_NODE_IDS = Object.freeze([
  TEST_MISSING_NODE_ID_A,
  TEST_MISSING_NODE_ID_B,
]);
const TEST_PRIORITY_PARTITION_SUMMARY = Object.freeze({
  satisfied: true,
  blockedPartitionCount: TEST_ZERO_COUNT,
  totalSpreadGap: TEST_ZERO_COUNT,
});
const TEST_PUBLICATION_DEBT_PROBE = Object.freeze({
  allActive: false,
  nodeDiagnostics: TEST_ACTIVE_NODE_DIAGNOSTICS,
  snapshotCoverage: {
    completeCoverage: false,
    expectedNodeCount: TEST_CLUSTER_SIZE,
    bestCoverageNodeCount: TEST_SINGLE_COUNT,
    selectedNodeId: TEST_SEED_NODE_ID,
    selectedAdminReady: true,
    selectedReachableBy: TEST_ADMIN_HEALTH_SOURCE,
    selectedPublicationConvergence: {
      publicationStatus: TEST_PUBLICATION_STATUS,
      recoveryProtocolState: TEST_RECOVERY_PROTOCOL_STATE,
      pendingAckNodeIds: Object.freeze([]),
      publishedActiveNodeIds: TEST_PUBLISHED_ACTIVE_NODE_IDS,
      priorityPartitionSummary: TEST_PRIORITY_PARTITION_SUMMARY,
    },
    selectedPublishedActiveNodeIds: TEST_PUBLISHED_ACTIVE_NODE_IDS,
    selectedMissingPublishedNodeIds: TEST_MISSING_PUBLISHED_NODE_IDS,
  },
  publicationConvergenceGate: {
    ready: true,
    reasons: Object.freeze([]),
    publicationStatus: TEST_PUBLICATION_STATUS,
    recoveryProtocolState: TEST_RECOVERY_PROTOCOL_STATE,
    pendingAckNodeIds: Object.freeze([]),
    pendingAckCount: TEST_ZERO_COUNT,
    missingPublishedNodeIds: Object.freeze([]),
    missingPublishedCount: TEST_ZERO_COUNT,
    priorityPartitionSummary: TEST_PRIORITY_PARTITION_SUMMARY,
  },
  priorityRecoveryInvariants: {
    invariants: Object.freeze([]),
    failingInvariantIds: Object.freeze([]),
    passed: true,
  },
});

test(TEST_NAME, async () => {
  const cluster = createCluster({
    size: TEST_CLUSTER_SIZE,
    docker: {socketPath: TEST_DOCKER_SOCKET_PATH},
    image: TEST_IMAGE,
    timeouts: {
      convergence: TEST_TIMEOUT_MS,
    },
  });

  cluster._sleep = async () => {};
  cluster._recordClusterStage = () => {};
  cluster._collectFailureLogs = async () => {};
  cluster._probeClusterActiveState = async () => TEST_PUBLICATION_DEBT_PROBE;

  const capturedErrors = [];
  await assert.rejects(
    async () => {
      await cluster._waitForAllActive();
    },
    (error) => {
      capturedErrors.push(error);
      return TEST_EXPECTED_ERROR_PATTERN.test(
        String(error?.message || TEST_EMPTY_TEXT),
      );
    },
  );
  const timeoutError = capturedErrors[TEST_ZERO_COUNT];

  assert.match(
    timeoutError.message,
    new RegExp(TEST_MISSING_PUBLISHED_FRAGMENT, TEST_REGEX_FLAG_UNICODE),
    TEST_MISSING_PUBLISHED_ASSERTION,
  );
  assert.match(
    timeoutError.message,
    new RegExp(
      TEST_MISSING_PUBLISHED_IDS_FRAGMENT,
      TEST_REGEX_FLAG_UNICODE,
    ),
    TEST_MISSING_PUBLISHED_IDS_ASSERTION,
  );
  assert.equal(
    timeoutError?.diagnostics?.noProgress?.currentProgress?.missingPublishedCount,
    TEST_TWO_COUNT,
    TEST_DIAGNOSTIC_COUNT_ASSERTION,
  );
});
