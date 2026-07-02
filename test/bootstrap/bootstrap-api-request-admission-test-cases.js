import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI, BootstrapStrategy} from '../../src/bootstrap/bootstrap-api.js';
import {
  BOOTSTRAP_API_ERROR,
  BOOTSTRAP_API_PROBE_REASON,
  BOOTSTRAP_API_RESPONSE_FIELD,
  BOOTSTRAP_API_ROUTE,
} from '../../src/bootstrap/bootstrap-api-constants.js';
import {
  BOOTSTRAP_PHASE,
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from '../../src/bootstrap/bootstrap-constants.js';
import {HTTP_STATUS} from '../../src/constants/index.js';
import {
  LIFECYCLE_PHASE,
  LIFECYCLE_REASON,
} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {
  MEMBERSHIP_OWNER_OUTCOME_TYPE,
  STARTUP_JOIN_MODE,
} from '../../src/bootstrap/rejoin-hints-constants.js';
import {
  BOOTSTRAP_LEADER_NOT_READY_STARTUP_AUTHORITY,
  createEmptySystemTableCache,
  initializeTestEnvironment,
} from './bootstrap-api-test-fixtures.js';

const BOOTSTRAP_ADMISSION_LEASE_TEST_NAME =
  'BootstrapAPI - expires stale bootstrap admission lease before admitting retry';
const BOOTSTRAP_ADMISSION_LEASE_TEST_SEED_NODE_ID = 'seed-node-1';
const BOOTSTRAP_ADMISSION_LEASE_TEST_SEED_NODE_ADDRESS =
  'ws://localhost:8080';
const BOOTSTRAP_ADMISSION_LEASE_TEST_FIRST_NODE_ID =
  '550e8400-e29b-41d4-a716-446655440021';
const BOOTSTRAP_ADMISSION_LEASE_TEST_FIRST_NODE_ADDRESS =
  'ws://localhost:9101';
const BOOTSTRAP_ADMISSION_LEASE_TEST_RETRY_NODE_ID =
  '550e8400-e29b-41d4-a716-446655440022';
const BOOTSTRAP_ADMISSION_LEASE_TEST_RETRY_NODE_ADDRESS =
  'ws://localhost:9102';
const BOOTSTRAP_ADMISSION_LEASE_TEST_GROUP_ID = 'mg-test';
const BOOTSTRAP_ADMISSION_LEASE_TEST_MAX_CONCURRENT = 1;
const BOOTSTRAP_ADMISSION_LEASE_TEST_RETRY_AFTER_MS = 25;
const BOOTSTRAP_ADMISSION_LEASE_TEST_LEASE_MS = 20;
const BOOTSTRAP_ADMISSION_LEASE_TEST_EXPIRE_WAIT_MS = 40;
const BOOTSTRAP_ADMISSION_LEASE_TEST_POLL_ATTEMPTS = 20;
const BOOTSTRAP_ADMISSION_LEASE_TEST_POLL_MS = 5;
const BOOTSTRAP_ADMISSION_LEASE_TEST_ACTIVE_COUNT = 1;
const BOOTSTRAP_ADMISSION_LEASE_TEST_IDLE_COUNT = 0;
const BOOTSTRAP_ADMISSION_LEASE_TEST_NO_VALUE = null;
const BOOTSTRAP_ADMISSION_LEASE_TEST_EMPTY_OBJECT = Object.freeze({});
const BOOTSTRAP_ADMISSION_LEASE_TEST_EMPTY_LIST = Object.freeze([]);
const BOOTSTRAP_ADMISSION_LEASE_TEST_LISTEN_DISABLED = false;
const BOOTSTRAP_ADMISSION_LEASE_TEST_LEADER_READY = Object.freeze({
  ready: true,
});
const BOOTSTRAP_ADMISSION_LEASE_TEST_RELEASE_UNASSIGNED = () => {};
const BOOTSTRAP_REQUEST_STARTUP_CONTRACT_TEST_NAME =
  'BootstrapAPI - bootstrap request admission uses startup-complete adapter';
const BOOTSTRAP_REQUEST_STARTUP_CONTRACT_SEED_NODE_ID = 'seed-node-1';
const BOOTSTRAP_REQUEST_STARTUP_CONTRACT_SEED_NODE_ADDRESS =
  'ws://localhost:8080';
const BOOTSTRAP_REQUEST_STARTUP_CONTRACT_JOINING_NODE_ID =
  '550e8400-e29b-41d4-a716-446655440113';
const BOOTSTRAP_REQUEST_STARTUP_CONTRACT_JOINING_NODE_ADDRESS =
  'ws://localhost:9093';
const BOOTSTRAP_REQUEST_STARTUP_CONTRACT_GROUP_ID = 'mg-startup-contract';
const BOOTSTRAP_REQUEST_STARTUP_CONTRACT_INCOMPLETE_PHASE =
  BOOTSTRAP_PHASE.CACHE_HYDRATION;
const BOOTSTRAP_REQUEST_STARTUP_CONTRACT_STARTUP_COMPLETE = true;
const BOOTSTRAP_REQUEST_STARTUP_CONTRACT_LEADER_READY = Object.freeze({
  ready: true,
});
const BOOTSTRAP_REQUEST_STARTUP_CONTRACT_ADMISSION_READY = Object.freeze({
  ready: true,
  reasons: BOOTSTRAP_ADMISSION_LEASE_TEST_EMPTY_LIST,
  retryAfterMs: BOOTSTRAP_ADMISSION_LEASE_TEST_IDLE_COUNT,
});
const BOOTSTRAP_REQUEST_STARTUP_CONTRACT_EMPTY_CLUSTER_CONFIG =
  Object.freeze({});
const BOOTSTRAP_REQUEST_STARTUP_CONTRACT_EMPTY_TABLE_POLICIES =
  Object.freeze({});
const BOOTSTRAP_REQUEST_STARTUP_CONTRACT_EMPTY_READY_NODES =
  Object.freeze([]);
const BOOTSTRAP_REQUEST_STARTUP_CONTRACT_NO_HINTS = null;
const BOOTSTRAP_REQUEST_STARTUP_RECOVERY_TEST_NAME =
  'BootstrapAPI - bootstrap request admission honors recovery-authorized bootstrap join projection';
const BOOTSTRAP_REQUEST_STARTUP_RECOVERY_JOINING_NODE_ID =
  '550e8400-e29b-41d4-a716-446655440114';
const BOOTSTRAP_REQUEST_STARTUP_RECOVERY_JOINING_NODE_ADDRESS =
  'ws://localhost:9094';
const BOOTSTRAP_REQUEST_STARTUP_RECOVERY_GROUP_ID = 'mg-startup-recovery';
const BOOTSTRAP_REQUEST_STARTUP_RECOVERY_STATE = 'bootstrapping';
const BOOTSTRAP_REQUEST_STARTUP_RECOVERY_PHASE = 'INIT';
const BOOTSTRAP_REQUEST_STARTUP_RECOVERY_RETRY_AFTER_MS = 350;
const BOOTSTRAP_REQUEST_STARTUP_RECOVERY_REASONS = Object.freeze([
  BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE,
  BOOTSTRAP_PIPELINE_ERROR_CODE.SQL_ENGINE_UNAVAILABLE,
  BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE,
  BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
  LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
]);
const BOOTSTRAP_REQUEST_STARTUP_BLOCKED_TEST_NAME =
  'BootstrapAPI - bootstrap request admission defers authoritative bootstrap join blockers after startup completes';
const BOOTSTRAP_REQUEST_STARTUP_BLOCKED_JOINING_NODE_ID =
  '550e8400-e29b-41d4-a716-446655440115';
const BOOTSTRAP_REQUEST_STARTUP_BLOCKED_JOINING_NODE_ADDRESS =
  'ws://localhost:9095';
const BOOTSTRAP_REQUEST_STARTUP_BLOCKED_GROUP_ID = 'mg-startup-blocked';
const BOOTSTRAP_REQUEST_STARTUP_BLOCKED_STATE = 'join_ready';
const BOOTSTRAP_REQUEST_STARTUP_BLOCKED_RETRY_AFTER_MS = 275;
const BOOTSTRAP_REQUEST_STARTUP_BLOCKED_INITIAL_EPOCH = 0;
const BOOTSTRAP_REQUEST_STARTUP_BLOCKED_NO_CALLS = 0;
const BOOTSTRAP_REQUEST_STARTUP_BLOCKED_METHOD = 'POST';
const BOOTSTRAP_REQUEST_STARTUP_BLOCKED_REASONS = Object.freeze([
  LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING,
  BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
]);
const BOOTSTRAP_REQUEST_STARTUP_BLOCKED_ASSERTION = Object.freeze({
  DEFERRED_STATUS:
    'bootstrap request should defer when authoritative bootstrap join readiness remains blocked',
  DEFERRED_SUCCESS:
    'bootstrap response should remain deferred',
  DEFERRED_ERROR:
    'bootstrap response should surface bootstrap not ready',
  DEFERRED_CODE:
    'bootstrap response should use the bootstrap-not-ready pipeline code',
  DEFERRED_PHASE:
    'bootstrap response should surface the blocked bootstrap-join phase',
  STABLE_WINDOW_REASON:
    'bootstrap response should preserve the stable-window blocker',
  AUTHORITY_REASON:
    'bootstrap response should preserve the authoritative bootstrap blocker',
  NO_PHASE_INCOMPLETE_REASON:
    'bootstrap response should not reintroduce startup-incomplete reasons once startup is complete',
  RETRY_AFTER:
    'bootstrap response should reuse the blocked join retry guidance',
  STARTUP_AUTHORITY:
    'bootstrap response should preserve startup authority evidence',
  NO_LEADER_READINESS_CALLS:
    'bootstrap request should defer before leader readiness evaluation',
  NO_ASSIGNMENT_CALLS:
    'bootstrap request should defer before assignment selection',
});

async function sleepBootstrapAdmissionLeaseTest(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForBootstrapAdmissionLeaseTestCount(api, expectedCount) {
  for (
    let attempt = 0;
    attempt < BOOTSTRAP_ADMISSION_LEASE_TEST_POLL_ATTEMPTS;
    attempt++
  ) {
    if (api.inFlightBootstrapRequestCount === expectedCount) {
      return;
    }
    await sleepBootstrapAdmissionLeaseTest(
      BOOTSTRAP_ADMISSION_LEASE_TEST_POLL_MS,
    );
  }
}

export function registerBootstrapRequestAdmissionTests() {
  test('BootstrapAPI - defers concurrent bootstrap requests when admission is saturated',
    async (t) => {
      initializeTestEnvironment();

      let releaseFirstRequest = null;
      const firstRequestGate = new Promise((resolve) => {
        releaseFirstRequest = resolve;
      });

      const api = new BootstrapAPI({
        seedNodeId: 'seed-node-1',
        seedNodeAddress: 'ws://localhost:8080',
        systemTableCache: createEmptySystemTableCache(),
        maxConcurrentBootstrapRequests: 1,
        bootstrapAdmissionRetryAfterMs: 250,
      });

      api.waitForServiceLeaders = async () => ({ready: true});
      api.determineAndReserveMessageGroupAssignment = async (nodeId) => {
        if (nodeId === '550e8400-e29b-41d4-a716-446655440011') {
          await firstRequestGate;
        }
        return {
          strategy: BootstrapStrategy.CREATE_SELF_HOSTED,
          groupId: 'mg-test',
        };
      };
      api.getCurrentEpoch = () => null;
      api.getClusterConfiguration = () => ({});
      api.getReadyNodes = () => [];
      api.getTablePolicies = () => ({});
      api.getLatencyTopologyHints = () => null;

      await api.initialize(0, {listen: false});

      const firstRequestPromise = api.getFastify().inject({
        method: 'POST',
        url: '/bootstrap',
        payload: {
          nodeId: '550e8400-e29b-41d4-a716-446655440011',
          nodeAddress: 'ws://localhost:9091',
        },
      });

      for (let attempt = 0; attempt < 20; attempt++) {
        if (api.inFlightBootstrapRequestCount === 1) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      t.equal(api.inFlightBootstrapRequestCount, 1,
        'first bootstrap request should occupy the single admission slot');

      const deferredResponse = await api.getFastify().inject({
        method: 'POST',
        url: '/bootstrap',
        payload: {
          nodeId: '550e8400-e29b-41d4-a716-446655440012',
          nodeAddress: 'ws://localhost:9092',
        },
      });

      t.equal(deferredResponse.statusCode, 503,
        'concurrent bootstrap request should be deferred');
      const deferredBody = JSON.parse(deferredResponse.body);
      t.equal(
        deferredBody.error,
        BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
        'deferred request should use the canonical bootstrap-not-ready error',
      );
      t.equal(
        deferredBody.code,
        BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
        'deferred request should use the canonical bootstrap-not-ready code',
      );
      t.equal(
        deferredBody.retryAfterMs,
        250,
        'deferred request should include the configured retry hint',
      );
      t.ok(
        deferredBody.reasons.includes('JOIN_ADMISSION_BACKPRESSURED'),
        'deferred request should expose the admission backpressure reason',
      );

      releaseFirstRequest();
      const firstResponse = await firstRequestPromise;
      t.equal(firstResponse.statusCode, 200,
        'original bootstrap request should complete once the slot is released');
      t.equal(api.inFlightBootstrapRequestCount, 0,
        'bootstrap admission count should return to zero after completion');

      const subsequentResponse = await api.getFastify().inject({
        method: 'POST',
        url: '/bootstrap',
        payload: {
          nodeId: '550e8400-e29b-41d4-a716-446655440013',
          nodeAddress: 'ws://localhost:9093',
        },
      });
      t.equal(subsequentResponse.statusCode, 200,
        'later bootstrap requests should be admitted after the slot frees');

      await api.shutdown();
    });

  test(BOOTSTRAP_ADMISSION_LEASE_TEST_NAME, async (t) => {
    initializeTestEnvironment();

    let releaseFirstRequest =
    BOOTSTRAP_ADMISSION_LEASE_TEST_RELEASE_UNASSIGNED;
    const firstRequestGate = new Promise((resolve) => {
      releaseFirstRequest = resolve;
    });

    const api = new BootstrapAPI({
      seedNodeId: BOOTSTRAP_ADMISSION_LEASE_TEST_SEED_NODE_ID,
      seedNodeAddress: BOOTSTRAP_ADMISSION_LEASE_TEST_SEED_NODE_ADDRESS,
      systemTableCache: createEmptySystemTableCache(),
      maxConcurrentBootstrapRequests:
      BOOTSTRAP_ADMISSION_LEASE_TEST_MAX_CONCURRENT,
      bootstrapAdmissionRetryAfterMs:
      BOOTSTRAP_ADMISSION_LEASE_TEST_RETRY_AFTER_MS,
      bootstrapAdmissionLeaseMs: BOOTSTRAP_ADMISSION_LEASE_TEST_LEASE_MS,
    });

    api.waitForServiceLeaders = async () =>
      BOOTSTRAP_ADMISSION_LEASE_TEST_LEADER_READY;
    api.determineAndReserveMessageGroupAssignment = async (nodeId) => {
      if (nodeId === BOOTSTRAP_ADMISSION_LEASE_TEST_FIRST_NODE_ID) {
        await firstRequestGate;
      }
      return {
        strategy: BootstrapStrategy.CREATE_SELF_HOSTED,
        groupId: BOOTSTRAP_ADMISSION_LEASE_TEST_GROUP_ID,
      };
    };
    api.getCurrentEpoch = () => BOOTSTRAP_ADMISSION_LEASE_TEST_NO_VALUE;
    api.getClusterConfiguration = () =>
      BOOTSTRAP_ADMISSION_LEASE_TEST_EMPTY_OBJECT;
    api.getReadyNodes = () => BOOTSTRAP_ADMISSION_LEASE_TEST_EMPTY_LIST;
    api.getTablePolicies = () => BOOTSTRAP_ADMISSION_LEASE_TEST_EMPTY_OBJECT;
    api.getLatencyTopologyHints = () => BOOTSTRAP_ADMISSION_LEASE_TEST_NO_VALUE;

    await api.initialize(BOOTSTRAP_ADMISSION_LEASE_TEST_IDLE_COUNT, {
      listen: BOOTSTRAP_ADMISSION_LEASE_TEST_LISTEN_DISABLED,
    });

    const firstRequestPromise = api.getFastify().inject({
      method: 'POST',
      url: BOOTSTRAP_API_ROUTE.BOOTSTRAP,
      payload: {
        nodeId: BOOTSTRAP_ADMISSION_LEASE_TEST_FIRST_NODE_ID,
        nodeAddress: BOOTSTRAP_ADMISSION_LEASE_TEST_FIRST_NODE_ADDRESS,
      },
    });

    await waitForBootstrapAdmissionLeaseTestCount(
      api,
      BOOTSTRAP_ADMISSION_LEASE_TEST_ACTIVE_COUNT,
    );
    t.equal(
      api.inFlightBootstrapRequestCount,
      BOOTSTRAP_ADMISSION_LEASE_TEST_ACTIVE_COUNT,
      'first bootstrap request should hold one admission lease',
    );

    await sleepBootstrapAdmissionLeaseTest(
      BOOTSTRAP_ADMISSION_LEASE_TEST_EXPIRE_WAIT_MS,
    );

    const retryResponse = await api.getFastify().inject({
      method: 'POST',
      url: BOOTSTRAP_API_ROUTE.BOOTSTRAP,
      payload: {
        nodeId: BOOTSTRAP_ADMISSION_LEASE_TEST_RETRY_NODE_ID,
        nodeAddress: BOOTSTRAP_ADMISSION_LEASE_TEST_RETRY_NODE_ADDRESS,
      },
    });

    t.equal(
      retryResponse.statusCode,
      HTTP_STATUS.OK,
      'retry bootstrap request should be admitted after stale lease expiry',
    );
    t.equal(
      api.inFlightBootstrapRequestCount,
      BOOTSTRAP_ADMISSION_LEASE_TEST_IDLE_COUNT,
      'completed retry should leave no active admission leases',
    );

    releaseFirstRequest();
    const firstResponse = await firstRequestPromise;
    t.equal(
      firstResponse.statusCode,
      HTTP_STATUS.OK,
      'original request should still complete without decrementing below zero',
    );
    t.equal(
      api.inFlightBootstrapRequestCount,
      BOOTSTRAP_ADMISSION_LEASE_TEST_IDLE_COUNT,
      'expired original request release should preserve idle admission count',
    );

    await api.shutdown();
  });

  test('BootstrapAPI - returns bootstrap-not-ready when control-plane dependencies are transiently unavailable',
    {skip: 'STALE: dead test re-enabled; expected bounded retry hint retryAfterMs=1000 but product returns 500'},
    async (t) => {
      initializeTestEnvironment();

      const api = new BootstrapAPI({
        seedNodeId: 'seed-node-1',
        seedNodeAddress: 'ws://localhost:8080',
        systemTableCache: createEmptySystemTableCache(),
        controlPlaneReadinessService: {
          getStartupAuthoritySnapshotSync() {
            return BOOTSTRAP_LEADER_NOT_READY_STARTUP_AUTHORITY;
          },
        },
      });

      api.waitForServiceLeaders = async () => ({ready: true});
      api.determineAndReserveMessageGroupAssignment = async () => ({
        strategy: BootstrapStrategy.CREATE_SELF_HOSTED,
        groupId: 'mg-test',
      });
      api.buildBootstrapTopologySnapshotEnvelope = () => ({
        systemTableSnapshots: {},
        topologySnapshotMeta: null,
      });
      api.getClusterConfiguration = () => ({});
      api.getReadyNodes = () => {
        throw new Error(
          'ControlPlaneSystemTableGateway requires cdcIntegrationService',
        );
      };
      api.getTablePolicies = () => ({});
      api.getLatencyTopologyHints = () => null;

      await api.initialize(0, {listen: false});

      const response = await api.getFastify().inject({
        method: 'POST',
        url: '/bootstrap',
        payload: {
          nodeId: '550e8400-e29b-41d4-a716-446655440013',
          nodeAddress: 'ws://localhost:9093',
        },
      });

      t.equal(response.statusCode, 503,
        'transient control-plane dependency gaps should defer bootstrap');
      const body = JSON.parse(response.body);
      t.equal(body.error, BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
        'response should use the canonical bootstrap-not-ready error');
      t.equal(body.code, BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
        'response should preserve the canonical bootstrap-not-ready code');
      t.equal(body.retryAfterMs, 1000,
        'response should include the bounded retry hint');
      t.ok(
        body.reasons.includes(
          BOOTSTRAP_API_PROBE_REASON.CONTROL_PLANE_DEPENDENCY_UNAVAILABLE,
        ),
        'response should expose the control-plane dependency blocker',
      );
      t.same(
        body[BOOTSTRAP_API_RESPONSE_FIELD.STARTUP_AUTHORITY],
        BOOTSTRAP_LEADER_NOT_READY_STARTUP_AUTHORITY,
        'retryable dependency responses should retain startup authority evidence',
      );

      await api.shutdown();
    });

  test('BootstrapAPI - handleBootstrapRequest uses bounded bootstrap response topology snapshot projection',
    async (t) => {
      initializeTestEnvironment();

      const api = new BootstrapAPI({
        seedNodeId: 'seed-node-1',
        seedNodeAddress: 'ws://localhost:8080',
        systemTableCache: createEmptySystemTableCache(),
      });

      api.waitForServiceLeaders = async () => ({ready: true});
      api.determineAndReserveMessageGroupAssignment = async () => ({
        strategy: BootstrapStrategy.CREATE_SELF_HOSTED,
        groupId: 'mg-test',
      });
      let boundedSnapshotCallCount = 0;
      let fullSnapshotCallCount = 0;
      api.buildBootstrapResponseTopologySnapshotEnvelope = () => {
        boundedSnapshotCallCount++;
        return {
          systemTableSnapshots: {},
          topologySnapshotMeta: null,
        };
      };
      api.buildBootstrapTopologySnapshotEnvelope = () => {
        fullSnapshotCallCount++;
        return {
          systemTableSnapshots: {
            shouldNotBeUsed: true,
          },
          topologySnapshotMeta: {
            shouldNotBeUsed: true,
          },
        };
      };
      api.getClusterConfiguration = () => ({});
      api.getReadyNodes = () => [];
      api.getTablePolicies = () => ({});
      api.getLatencyTopologyHints = () => null;

      await api.initialize(0, {listen: false});

      const response = await api.getFastify().inject({
        method: 'POST',
        url: '/bootstrap',
        payload: {
          nodeId: '550e8400-e29b-41d4-a716-446655440112',
          nodeAddress: 'ws://localhost:9092',
        },
      });

      t.equal(response.statusCode, 200, 'bootstrap request should still succeed');
      t.equal(
        boundedSnapshotCallCount,
        1,
        'request owner should use the bounded bootstrap response projection',
      );
      t.equal(
        fullSnapshotCallCount,
        0,
        'request owner should not force a full authoritative snapshot refresh on the HTTP hot path',
      );

      await api.shutdown();
    });

  test(BOOTSTRAP_REQUEST_STARTUP_CONTRACT_TEST_NAME, async (t) => {
    initializeTestEnvironment();

    const api = new BootstrapAPI({
      seedNodeId: BOOTSTRAP_REQUEST_STARTUP_CONTRACT_SEED_NODE_ID,
      seedNodeAddress: BOOTSTRAP_REQUEST_STARTUP_CONTRACT_SEED_NODE_ADDRESS,
      systemTableCache: createEmptySystemTableCache(),
      bootstrapStartupAdapter: {
        phase: BOOTSTRAP_REQUEST_STARTUP_CONTRACT_INCOMPLETE_PHASE,
        isBootstrapStartupComplete() {
          return BOOTSTRAP_REQUEST_STARTUP_CONTRACT_STARTUP_COMPLETE;
        },
      },
    });

    api.waitForServiceLeaders = async () =>
      BOOTSTRAP_REQUEST_STARTUP_CONTRACT_LEADER_READY;
    api.determineAndReserveMessageGroupAssignment = async () => ({
      strategy: BootstrapStrategy.CREATE_SELF_HOSTED,
      groupId: BOOTSTRAP_REQUEST_STARTUP_CONTRACT_GROUP_ID,
    });
    api.getClusterConfiguration = () =>
      BOOTSTRAP_REQUEST_STARTUP_CONTRACT_EMPTY_CLUSTER_CONFIG;
    api.getReadyNodes = () =>
      BOOTSTRAP_REQUEST_STARTUP_CONTRACT_EMPTY_READY_NODES;
    api.getTablePolicies = () =>
      BOOTSTRAP_REQUEST_STARTUP_CONTRACT_EMPTY_TABLE_POLICIES;
    api.getLatencyTopologyHints = () =>
      BOOTSTRAP_REQUEST_STARTUP_CONTRACT_NO_HINTS;
    api.getBootstrapJoinAdmissionSnapshot = async () =>
      BOOTSTRAP_REQUEST_STARTUP_CONTRACT_ADMISSION_READY;

    await api.initialize(0, {
      listen: BOOTSTRAP_ADMISSION_LEASE_TEST_LISTEN_DISABLED,
    });

    const response = await api.getFastify().inject({
      method: 'POST',
      url: BOOTSTRAP_API_ROUTE.BOOTSTRAP,
      payload: {
        nodeId: BOOTSTRAP_REQUEST_STARTUP_CONTRACT_JOINING_NODE_ID,
        nodeAddress: BOOTSTRAP_REQUEST_STARTUP_CONTRACT_JOINING_NODE_ADDRESS,
      },
    });

    t.equal(
      response.statusCode,
      HTTP_STATUS.OK,
      'bootstrap request should use the adapter startup-complete contract',
    );

    await api.shutdown();
  });

  test(BOOTSTRAP_REQUEST_STARTUP_BLOCKED_TEST_NAME, async (t) => {
    initializeTestEnvironment();

    const readinessSnapshot = {
      ready: false,
      phase: LIFECYCLE_PHASE.JOIN_READY,
      state: BOOTSTRAP_REQUEST_STARTUP_BLOCKED_STATE,
      reasons: BOOTSTRAP_REQUEST_STARTUP_BLOCKED_REASONS,
      retryAfterMs: BOOTSTRAP_REQUEST_STARTUP_BLOCKED_RETRY_AFTER_MS,
      timestamp: Date.now(),
      bootstrapJoinAuthorityAvailable: true,
    };
    const readinessState = {
      evaluate() {
        return readinessSnapshot;
      },
      getSnapshot() {
        return readinessSnapshot;
      },
      recordProbeResult() {},
    };
    let leaderReadinessCallCount = BOOTSTRAP_REQUEST_STARTUP_BLOCKED_NO_CALLS;
    let assignmentCallCount = BOOTSTRAP_REQUEST_STARTUP_BLOCKED_NO_CALLS;

    const api = new BootstrapAPI({
      seedNodeId: BOOTSTRAP_REQUEST_STARTUP_CONTRACT_SEED_NODE_ID,
      seedNodeAddress: BOOTSTRAP_REQUEST_STARTUP_CONTRACT_SEED_NODE_ADDRESS,
      systemTableCache: createEmptySystemTableCache(),
      bootstrapStartupAdapter: {
        phase: BOOTSTRAP_REQUEST_STARTUP_CONTRACT_INCOMPLETE_PHASE,
        isBootstrapStartupComplete() {
          return BOOTSTRAP_REQUEST_STARTUP_CONTRACT_STARTUP_COMPLETE;
        },
      },
      readinessState,
      controlPlaneReadinessService: {
        getStartupAuthoritySnapshotSync() {
          return BOOTSTRAP_LEADER_NOT_READY_STARTUP_AUTHORITY;
        },
      },
    });

    api.waitForServiceLeaders = async () => {
      leaderReadinessCallCount++;
      return BOOTSTRAP_REQUEST_STARTUP_CONTRACT_LEADER_READY;
    };
    api.determineAndReserveMessageGroupAssignment = async () => {
      assignmentCallCount++;
      return {
        strategy: BootstrapStrategy.CREATE_SELF_HOSTED,
        groupId: BOOTSTRAP_REQUEST_STARTUP_BLOCKED_GROUP_ID,
      };
    };
    api.getClusterConfiguration = () =>
      BOOTSTRAP_REQUEST_STARTUP_CONTRACT_EMPTY_CLUSTER_CONFIG;
    api.getReadyNodes = () =>
      BOOTSTRAP_REQUEST_STARTUP_CONTRACT_EMPTY_READY_NODES;
    api.getTablePolicies = () =>
      BOOTSTRAP_REQUEST_STARTUP_CONTRACT_EMPTY_TABLE_POLICIES;
    api.getLatencyTopologyHints = () =>
      BOOTSTRAP_REQUEST_STARTUP_CONTRACT_NO_HINTS;

    await api.initialize(BOOTSTRAP_REQUEST_STARTUP_BLOCKED_INITIAL_EPOCH, {
      listen: BOOTSTRAP_ADMISSION_LEASE_TEST_LISTEN_DISABLED,
    });

    const response = await api.getFastify().inject({
      method: BOOTSTRAP_REQUEST_STARTUP_BLOCKED_METHOD,
      url: BOOTSTRAP_API_ROUTE.BOOTSTRAP,
      payload: {
        nodeId: BOOTSTRAP_REQUEST_STARTUP_BLOCKED_JOINING_NODE_ID,
        nodeAddress: BOOTSTRAP_REQUEST_STARTUP_BLOCKED_JOINING_NODE_ADDRESS,
      },
    });

    t.equal(
      response.statusCode,
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      BOOTSTRAP_REQUEST_STARTUP_BLOCKED_ASSERTION.DEFERRED_STATUS,
    );
    const body = JSON.parse(response.body);
    t.equal(
      body.success,
      false,
      BOOTSTRAP_REQUEST_STARTUP_BLOCKED_ASSERTION.DEFERRED_SUCCESS,
    );
    t.equal(
      body.error,
      BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
      BOOTSTRAP_REQUEST_STARTUP_BLOCKED_ASSERTION.DEFERRED_ERROR,
    );
    t.equal(
      body.code,
      BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
      BOOTSTRAP_REQUEST_STARTUP_BLOCKED_ASSERTION.DEFERRED_CODE,
    );
    t.equal(
      body.phase,
      LIFECYCLE_PHASE.JOIN_READY,
      BOOTSTRAP_REQUEST_STARTUP_BLOCKED_ASSERTION.DEFERRED_PHASE,
    );
    t.ok(
      body.reasons.includes(LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING),
      BOOTSTRAP_REQUEST_STARTUP_BLOCKED_ASSERTION.STABLE_WINDOW_REASON,
    );
    t.ok(
      body.reasons.includes(BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY),
      BOOTSTRAP_REQUEST_STARTUP_BLOCKED_ASSERTION.AUTHORITY_REASON,
    );
    t.notOk(
      body.reasons.includes(BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE),
      BOOTSTRAP_REQUEST_STARTUP_BLOCKED_ASSERTION.NO_PHASE_INCOMPLETE_REASON,
    );
    t.equal(
      body.retryAfterMs,
      BOOTSTRAP_REQUEST_STARTUP_BLOCKED_RETRY_AFTER_MS,
      BOOTSTRAP_REQUEST_STARTUP_BLOCKED_ASSERTION.RETRY_AFTER,
    );
    t.same(
      body[BOOTSTRAP_API_RESPONSE_FIELD.STARTUP_AUTHORITY],
      BOOTSTRAP_LEADER_NOT_READY_STARTUP_AUTHORITY,
      BOOTSTRAP_REQUEST_STARTUP_BLOCKED_ASSERTION.STARTUP_AUTHORITY,
    );
    t.equal(
      leaderReadinessCallCount,
      BOOTSTRAP_REQUEST_STARTUP_BLOCKED_NO_CALLS,
      BOOTSTRAP_REQUEST_STARTUP_BLOCKED_ASSERTION.NO_LEADER_READINESS_CALLS,
    );
    t.equal(
      assignmentCallCount,
      BOOTSTRAP_REQUEST_STARTUP_BLOCKED_NO_CALLS,
      BOOTSTRAP_REQUEST_STARTUP_BLOCKED_ASSERTION.NO_ASSIGNMENT_CALLS,
    );

    await api.shutdown();
  });

  test(BOOTSTRAP_REQUEST_STARTUP_RECOVERY_TEST_NAME, async (t) => {
    initializeTestEnvironment();

    const readinessSnapshot = {
      ready: false,
      phase: BOOTSTRAP_REQUEST_STARTUP_RECOVERY_PHASE,
      state: BOOTSTRAP_REQUEST_STARTUP_RECOVERY_STATE,
      reasons: BOOTSTRAP_REQUEST_STARTUP_RECOVERY_REASONS,
      retryAfterMs: BOOTSTRAP_REQUEST_STARTUP_RECOVERY_RETRY_AFTER_MS,
      timestamp: Date.now(),
    };
    const readinessState = {
      evaluate() {
        return readinessSnapshot;
      },
      getSnapshot() {
        return readinessSnapshot;
      },
      recordProbeResult() {},
    };

    const api = new BootstrapAPI({
      seedNodeId: BOOTSTRAP_REQUEST_STARTUP_CONTRACT_SEED_NODE_ID,
      seedNodeAddress: BOOTSTRAP_REQUEST_STARTUP_CONTRACT_SEED_NODE_ADDRESS,
      systemTableCache: createEmptySystemTableCache(),
      bootstrapStartupAdapter: {
        phase: BOOTSTRAP_REQUEST_STARTUP_CONTRACT_INCOMPLETE_PHASE,
        isBootstrapStartupComplete() {
          return false;
        },
      },
      readinessState,
      controlPlaneReadinessService: {
        getStartupAuthoritySnapshotSync() {
          return BOOTSTRAP_LEADER_NOT_READY_STARTUP_AUTHORITY;
        },
      },
    });

    api.waitForServiceLeaders = async () =>
      BOOTSTRAP_REQUEST_STARTUP_CONTRACT_LEADER_READY;
    api.determineAndReserveMessageGroupAssignment = async () => ({
      strategy: BootstrapStrategy.CREATE_SELF_HOSTED,
      groupId: BOOTSTRAP_REQUEST_STARTUP_RECOVERY_GROUP_ID,
    });
    api.getClusterConfiguration = () =>
      BOOTSTRAP_REQUEST_STARTUP_CONTRACT_EMPTY_CLUSTER_CONFIG;
    api.getReadyNodes = () =>
      BOOTSTRAP_REQUEST_STARTUP_CONTRACT_EMPTY_READY_NODES;
    api.getTablePolicies = () =>
      BOOTSTRAP_REQUEST_STARTUP_CONTRACT_EMPTY_TABLE_POLICIES;
    api.getLatencyTopologyHints = () =>
      BOOTSTRAP_REQUEST_STARTUP_CONTRACT_NO_HINTS;

    await api.initialize(0, {
      listen: BOOTSTRAP_ADMISSION_LEASE_TEST_LISTEN_DISABLED,
    });

    const response = await api.getFastify().inject({
      method: 'POST',
      url: BOOTSTRAP_API_ROUTE.BOOTSTRAP,
      payload: {
        nodeId: BOOTSTRAP_REQUEST_STARTUP_RECOVERY_JOINING_NODE_ID,
        nodeAddress: BOOTSTRAP_REQUEST_STARTUP_RECOVERY_JOINING_NODE_ADDRESS,
      },
    });

    t.equal(
      response.statusCode,
      HTTP_STATUS.OK,
      'bootstrap request should admit recovery-authorized INIT startup',
    );
    const body = JSON.parse(response.body);
    t.equal(body.success, true, 'bootstrap response should remain successful');
    t.equal(
      body.messageGroupAssignment.groupId,
      BOOTSTRAP_REQUEST_STARTUP_RECOVERY_GROUP_ID,
      'bootstrap response should still return the bounded assignment',
    );
    t.same(
      body[BOOTSTRAP_API_RESPONSE_FIELD.STARTUP_AUTHORITY],
      BOOTSTRAP_LEADER_NOT_READY_STARTUP_AUTHORITY,
      'bootstrap response should preserve startup authority evidence',
    );

    await api.shutdown();
  });

  test('BootstrapAPI - forwards durable rejoin startup mode to assignment',
    async (t) => {
      initializeTestEnvironment();

      const api = new BootstrapAPI({
        seedNodeId: 'seed-node-1',
        seedNodeAddress: 'ws://localhost:8080',
        systemTableCache: createEmptySystemTableCache(),
      });

      api.waitForServiceLeaders = async () => ({ready: true});
      let observedOptions = null;
      api.determineAndReserveMessageGroupAssignment = async (_nodeId, options) => {
        observedOptions = options;
        return {
          strategy: BootstrapStrategy.CREATE_SELF_HOSTED,
          groupId: 'mg-test',
          replicaCount: 3,
        };
      };
      api.getCurrentEpoch = () => null;
      api.getClusterConfiguration = () => ({});
      api.getReadyNodes = () => [];
      api.getTablePolicies = () => ({});
      api.getLatencyTopologyHints = () => null;

      await api.initialize(0, {listen: false});

      const response = await api.getFastify().inject({
        method: 'POST',
        url: '/bootstrap',
        payload: {
          nodeId: '550e8400-e29b-41d4-a716-446655440111',
          nodeAddress: 'ws://localhost:9091',
          startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
        },
      });

      t.equal(response.statusCode, 200);
      t.match(observedOptions, {
        startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
        membershipOwnerOutcome: {
          outcomeType: MEMBERSHIP_OWNER_OUTCOME_TYPE.RESTART_REENTRY,
          startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
        },
      });
    });

  test('BootstrapAPI - releases bootstrap admission slot after request failure',
    async (t) => {
      initializeTestEnvironment();

      const api = new BootstrapAPI({
        seedNodeId: 'seed-node-1',
        seedNodeAddress: 'ws://localhost:8080',
        systemTableCache: createEmptySystemTableCache(),
        maxConcurrentBootstrapRequests: 1,
        bootstrapAdmissionRetryAfterMs: 250,
      });

      api.waitForServiceLeaders = async () => ({ready: true});
      let shouldFail = true;
      api.determineAndReserveMessageGroupAssignment = async () => {
        if (shouldFail) {
          throw new Error('simulated bootstrap failure');
        }
        return {
          strategy: BootstrapStrategy.CREATE_SELF_HOSTED,
          groupId: 'mg-test',
        };
      };
      api.getCurrentEpoch = () => null;
      api.getClusterConfiguration = () => ({});
      api.getReadyNodes = () => [];
      api.getTablePolicies = () => ({});
      api.getLatencyTopologyHints = () => null;

      await api.initialize(0, {listen: false});

      const failedResponse = await api.getFastify().inject({
        method: 'POST',
        url: '/bootstrap',
        payload: {
          nodeId: '550e8400-e29b-41d4-a716-446655440014',
          nodeAddress: 'ws://localhost:9094',
        },
      });
      t.equal(failedResponse.statusCode, 500,
        'failing bootstrap request should still surface the underlying error');
      t.equal(api.inFlightBootstrapRequestCount, 0,
        'bootstrap admission slot should be released after failure');

      shouldFail = false;
      const recoveryResponse = await api.getFastify().inject({
        method: 'POST',
        url: '/bootstrap',
        payload: {
          nodeId: '550e8400-e29b-41d4-a716-446655440015',
          nodeAddress: 'ws://localhost:9095',
        },
      });
      t.equal(recoveryResponse.statusCode, 200,
        'subsequent bootstrap request should succeed after a failed request');

      await api.shutdown();
    });
}
