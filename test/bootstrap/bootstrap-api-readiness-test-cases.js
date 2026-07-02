/**
 * Tests for Bootstrap API.
 * Requirements: 1.2, 7.2, 7.3, 7.4
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI, BootstrapStrategy} from '../../src/bootstrap/bootstrap-api.js';
import {
  BOOTSTRAP_API_READINESS_FIELD,
  BOOTSTRAP_API_RESPONSE_FIELD,
  BOOTSTRAP_API_ROUTE,
} from '../../src/bootstrap/bootstrap-api-constants.js';
import {
  BOOTSTRAP_PHASE,
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from '../../src/bootstrap/bootstrap-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  HTTP_STATUS,
} from '../../src/constants/index.js';
import {BootstrapReadinessState} from '../../src/bootstrap/bootstrap-readiness-state.js';
import {
  LIFECYCLE_LEGACY_STATE,
  LIFECYCLE_PHASE,
  LIFECYCLE_REASON,
} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {
  STARTUP_RECOVERY_STAGE,
  StartupRecoveryCoordinator,
} from '../../src/bootstrap/startup-recovery-coordinator.js';
import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE,
} from '../../src/control-plane/startup-authority-snapshot-owner.js';

const TEST_BOOTSTRAP_JOIN_AUTHORITY_BLOCKER =
  'control_snapshot_authority_unavailable';
const TEST_BOOTSTRAP_PHASE_CONTACTING_SEED = 'contacting_seed';
const TEST_HTTP_METHOD_GET = 'GET';
const TEST_HTTP_METHOD_POST = 'POST';
const TEST_SEED_NODE_ID = 'seed-node-1';
const TEST_SEED_NODE_ADDRESS = 'ws://localhost:8080';
const TEST_BOOTSTRAP_REQUEST_NODE_ID =
  '550e8400-e29b-41d4-a716-446655440210';
const TEST_BOOTSTRAP_REQUEST_NODE_ADDRESS = 'ws://localhost:9210';
const TEST_BOOTSTRAP_RESPONSE_GROUP_ID = 'mg-seed-authority';
const TEST_READY_STABLE_WINDOW_MS = 0;
const TEST_READY_RETRY_AFTER_MS = 250;
const TEST_STARTUP_AUTHORITY_STATE = 'seed_locally_ready_unpublished';
const TEST_STARTUP_AUTHORITY_PUBLICATION_STATE = 'unpublished';
const TEST_STARTUP_AUTHORITY_FAILURE_STATE = 'none';
const TEST_STARTUP_AUTHORITY_OBSERVATION_PENDING =
  'startup_authority_observation_pending';
const TEST_STARTUP_AUTHORITY_NODE_IDS = Object.freeze([
  TEST_SEED_NODE_ID,
]);
const TEST_SEED_CONTACT_STARTUP_AUTHORITY = Object.freeze({
  state: TEST_STARTUP_AUTHORITY_STATE,
  ready: false,
  authorityAvailable: true,
  publication: Object.freeze({
    observationState: TEST_STARTUP_AUTHORITY_PUBLICATION_STATE,
  }),
  canonicalStartupNodeIds: TEST_STARTUP_AUTHORITY_NODE_IDS,
  failure: Object.freeze({
    state: TEST_STARTUP_AUTHORITY_FAILURE_STATE,
  }),
});
const TEST_BOOTSTRAP_INIT_RUNTIME_WIRING_RECOVERY_REASONS = Object.freeze([
  LIFECYCLE_REASON.BOOTSTRAP_PHASE_INCOMPLETE,
  LIFECYCLE_REASON.SQL_ENGINE_UNAVAILABLE,
  BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE,
  BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
  LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
]);

// Initialize configuration and logging for tests
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-seed-node', restApiPort: 9999},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function createEmptySystemTableCache() {
  return {
    get() {
      return null;
    },
    getAll() {
      return [];
    },
    filter() {
      return [];
    },
    find() {
      return null;
    },
    getReadyNodes() {
      return [];
    },
  };
}

function createSatisfiedControlPlaneReadinessService() {
  const diagnostics = Object.freeze({
    publicationEpoch: 1,
    status: 'PUBLISHED',
    publishedActiveNodeIds: Object.freeze(['seed-node-1']),
    priorityPartitionSummary: Object.freeze({
      satisfied: true,
      requiredDistinctNodeCount: 3,
      readyEligibleNodeCount: 3,
      totalPriorityPartitionCount: 5,
      missingPartitionIds: Object.freeze([]),
      blockedPartitions: Object.freeze([]),
    }),
  });
  return {
    async getMembershipPublicationDiagnostics() {
      return diagnostics;
    },
    getMembershipPublicationDiagnosticsSync() {
      return diagnostics;
    },
  };
}


const TRANSITIONAL_PRIORITY_RECOVERY_FAILURE_REASON =
  PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.PLANNING_INCOMPLETE;
const TRANSITIONAL_PRIORITY_RECOVERY_PROTOCOL_STATE = 'publication_pending';
const TRANSITIONAL_PRIORITY_RECOVERY_PUBLICATION_STATUS = 'OPEN';
const TRANSITIONAL_PRIORITY_RECOVERY_REASON_CODES = Object.freeze([
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
]);
const TRANSITIONAL_PRIORITY_RECOVERY_STARTUP_NODE_IDS = Object.freeze([
  'seed-node-1',
  'node-2',
]);
const TRANSITIONAL_PRIORITY_RECOVERY_PARTITION_SUMMARY = Object.freeze({
  satisfied: false,
  missingPartitionIds: Object.freeze(['control_plane_publications-p1']),
});
const TRANSITIONAL_PRIORITY_RECOVERY_GATE = Object.freeze({
  active: true,
  state: 'publication_pending',
  reasonCodes: TRANSITIONAL_PRIORITY_RECOVERY_REASON_CODES,
  publicationStatus: TRANSITIONAL_PRIORITY_RECOVERY_PUBLICATION_STATUS,
  priorityPartitionSummary: TRANSITIONAL_PRIORITY_RECOVERY_PARTITION_SUMMARY,
});

function createTransitionalPriorityRecoveryFailureControlPlaneReadinessService() {
  return {
    getPriorityControlPlaneRecoveryHealthSync() {
      return {
        healthy: false,
        reasonCode: LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
        details: {
          failureReason: TRANSITIONAL_PRIORITY_RECOVERY_FAILURE_REASON,
          publicationRecoveryGate: TRANSITIONAL_PRIORITY_RECOVERY_GATE,
          publicationStatus:
            TRANSITIONAL_PRIORITY_RECOVERY_PUBLICATION_STATUS,
          priorityPartitionSummary:
            TRANSITIONAL_PRIORITY_RECOVERY_PARTITION_SUMMARY,
          recoveryProtocolState:
            TRANSITIONAL_PRIORITY_RECOVERY_PROTOCOL_STATE,
          priorityRecoveryReasonCodes:
            TRANSITIONAL_PRIORITY_RECOVERY_REASON_CODES,
          canonicalStartupNodeIds:
            TRANSITIONAL_PRIORITY_RECOVERY_STARTUP_NODE_IDS,
        },
      };
    },
    getStartupAuthoritySnapshotSync() {
      return {
        state: 'authority_unavailable',
        ready: false,
        authorityAvailable: false,
        publication: {
          observationState: 'observation_unavailable',
        },
        priorityRecoveryReasonCodes:
          TRANSITIONAL_PRIORITY_RECOVERY_REASON_CODES,
        canonicalStartupNodeIds:
          TRANSITIONAL_PRIORITY_RECOVERY_STARTUP_NODE_IDS,
        publicationRecoveryGate: TRANSITIONAL_PRIORITY_RECOVERY_GATE,
        failure: {
          state: 'present',
          reason: TRANSITIONAL_PRIORITY_RECOVERY_FAILURE_REASON,
        },
      };
    },
    getMembershipPublicationDiagnosticsSync() {
      return {
        publicationEpoch: 14,
        status: TRANSITIONAL_PRIORITY_RECOVERY_PUBLICATION_STATUS,
        priorityPartitionSummary:
          TRANSITIONAL_PRIORITY_RECOVERY_PARTITION_SUMMARY,
      };
    },
  };
}

export function registerBootstrapApiReadinessTests() {
  test('BootstrapAPI - handleBootstrapRequest includes seed startup authority',
    async (t) => {
      initializeTestEnvironment();

      let observedStartupAuthorityNodeId =
      TEST_STARTUP_AUTHORITY_OBSERVATION_PENDING;
      const api = new BootstrapAPI({
        seedNodeId: TEST_SEED_NODE_ID,
        seedNodeAddress: TEST_SEED_NODE_ADDRESS,
        systemTableCache: createEmptySystemTableCache(),
        controlPlaneReadinessService: {
          getStartupAuthoritySnapshotSync(seedNodeId) {
            observedStartupAuthorityNodeId = seedNodeId;
            return TEST_SEED_CONTACT_STARTUP_AUTHORITY;
          },
        },
      });

      api.waitForServiceLeaders = async () => ({ready: true});
      api.determineAndReserveMessageGroupAssignment = async () => ({
        strategy: BootstrapStrategy.CREATE_SELF_HOSTED,
        groupId: TEST_BOOTSTRAP_RESPONSE_GROUP_ID,
      });
      api.buildBootstrapResponseTopologySnapshotEnvelope = () => ({
        systemTableSnapshots: {},
        topologySnapshotMeta: null,
      });
      api.getClusterConfiguration = () => ({});
      api.getReadyNodes = () => [];
      api.getTablePolicies = () => ({});
      api.getLatencyTopologyHints = () => null;

      await api.initialize(TEST_READY_STABLE_WINDOW_MS, {listen: false});

      const response = await api.getFastify().inject({
        method: TEST_HTTP_METHOD_POST,
        url: BOOTSTRAP_API_ROUTE.BOOTSTRAP,
        payload: {
          nodeId: TEST_BOOTSTRAP_REQUEST_NODE_ID,
          nodeAddress: TEST_BOOTSTRAP_REQUEST_NODE_ADDRESS,
        },
      });

      t.equal(response.statusCode, HTTP_STATUS.OK,
        'bootstrap request should succeed');
      t.equal(
        observedStartupAuthorityNodeId,
        TEST_SEED_NODE_ID,
        'bootstrap response authority should be resolved for the seed node',
      );
      const body = JSON.parse(response.body);
      t.same(
        body[BOOTSTRAP_API_RESPONSE_FIELD.STARTUP_AUTHORITY],
        TEST_SEED_CONTACT_STARTUP_AUTHORITY,
        'bootstrap response should include the seed startup authority snapshot',
      );

      await api.shutdown();
    });

  test('BootstrapAPI - keeps legacy /health available while readiness remains blocked',
    async (t) => {
      initializeTestEnvironment();

      const bootstrapService = {
        phase: BOOTSTRAP_PHASE.INFRASTRUCTURE,
      };
      const api = new BootstrapAPI({
        seedNodeId: 'seed-node-1',
        seedNodeAddress: 'ws://localhost:8080',
        systemTableCache: createEmptySystemTableCache(),
        bootstrapService,
      });

      await api.initialize(0, {listen: false});

      const healthResponse = await api.getFastify().inject({
        method: 'GET',
        url: '/health',
      });
      t.equal(healthResponse.statusCode, 200,
        'legacy /health should remain available during readiness migration');
      const healthBody = JSON.parse(healthResponse.body);
      t.equal(healthBody.status, 'initializing',
        'legacy /health should continue reporting bootstrap initialization');

      const readyResponse = await api.getFastify().inject({
        method: 'GET',
        url: '/readyz',
      });
      t.equal(readyResponse.statusCode, 503,
        '/readyz should still gate join readiness independently of /health');

      await api.shutdown();
    });

  test('BootstrapAPI - exposes explicit liveness, startup, and readiness probes', async (t) => {
    initializeTestEnvironment();

    const readinessSnapshot = {
      ready: false,
      phase: 'INIT',
      phaseRank: 0,
      state: 'bootstrapping',
      reasons: ['BOOTSTRAP_PHASE_INCOMPLETE'],
      retryAfterMs: 250,
      transitionCount: 1,
      stableWindowMs: 10000,
      stableElapsedMs: 0,
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
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: createEmptySystemTableCache(),
      bootstrapService: {
        phase: BOOTSTRAP_PHASE.INFRASTRUCTURE,
      },
      readinessState,
    });

    await api.initialize(0, {listen: false});

    const liveResponse = await api.getFastify().inject({
      method: 'GET',
      url: '/livez',
    });
    t.equal(liveResponse.statusCode, 200, 'livez should return 200');
    const liveBody = JSON.parse(liveResponse.body);
    t.equal(liveBody.alive, true, 'livez should expose alive=true');
    t.equal(liveBody.nodeId, 'seed-node-1', 'livez should include node id');

    const startupResponse = await api.getFastify().inject({
      method: 'GET',
      url: '/startupz',
    });
    t.equal(startupResponse.statusCode, 503,
      'startupz should return 503 before bootstrap completes');
    const startupBody = JSON.parse(startupResponse.body);
    t.equal(startupBody.started, false, 'startupz should expose started=false');
    t.equal(startupBody.phase, 'INIT', 'startupz should expose lifecycle phase');
    t.equal(startupBody.state, 'bootstrapping', 'startupz should expose readiness state');

    const readyResponse = await api.getFastify().inject({
      method: 'GET',
      url: '/readyz',
    });
    t.equal(readyResponse.statusCode, 503, 'readyz should return 503 while not ready');
    const readyBody = JSON.parse(readyResponse.body);
    t.equal(readyBody.ready, false, 'readyz should expose ready=false');
    t.equal(readyBody.phase, 'INIT', 'readyz should expose lifecycle phase');
    t.equal(readyBody.phaseRank, 0,
      'readyz should expose lifecycle phase rank');
    t.same(readyBody.reasons, ['BOOTSTRAP_PHASE_INCOMPLETE'],
      'readyz should expose blocker reasons');
    t.equal(readyBody.retryAfterMs, 250, 'readyz should expose retry hint');
    t.type(readyBody.readinessEpoch, 'number',
      'readyz should expose readiness epoch');
    t.type(readyBody.stableWindowMs, 'number',
      'readyz should expose stable window size');
    t.equal(readyBody.stableElapsedMs, 0,
      'readyz should expose current stable elapsed time');

    const bootstrapReadyResponse = await api.getFastify().inject({
      method: 'GET',
      url: '/bootstrap/ready',
    });
    t.equal(bootstrapReadyResponse.statusCode, 503,
      'bootstrap readiness probe should return 503 while not ready');
    const bootstrapReadyBody = JSON.parse(bootstrapReadyResponse.body);
    t.equal(bootstrapReadyBody.ready, false,
      'bootstrap readiness probe should expose ready=false');
    t.equal(bootstrapReadyBody.phase, 'INIT',
      'bootstrap readiness probe should expose lifecycle phase');
    t.equal(bootstrapReadyBody.phaseRank, 0,
      'bootstrap readiness probe should expose lifecycle phase rank');
    t.equal(bootstrapReadyBody.scope, 'bootstrap_join',
      'bootstrap readiness probe should declare bootstrap_join scope');

    await api.shutdown();
  });

  test('BootstrapAPI - bootstrap join readiness tolerates isolated leader metadata blockers',
    async (t) => {
      initializeTestEnvironment();

      const readinessSnapshot = {
        ready: false,
        phase: 'CONTROL_READY',
        state: 'warming',
        reasons: [BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE],
        retryAfterMs: 250,
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
        seedNodeId: 'seed-node-1',
        seedNodeAddress: 'ws://localhost:8080',
        systemTableCache: createEmptySystemTableCache(),
        readinessState,
        controlPlaneReadinessService: createSatisfiedControlPlaneReadinessService(),
      });

      await api.initialize(0, {listen: false});

      const strictReadyResponse = await api.getFastify().inject({
        method: 'GET',
        url: '/readyz',
      });
      t.equal(strictReadyResponse.statusCode, 503,
        'strict readiness should stay blocked on missing leader metadata');

      const bootstrapReadyResponse = await api.getFastify().inject({
        method: 'GET',
        url: '/bootstrap/ready',
      });
      t.equal(bootstrapReadyResponse.statusCode, 200,
        'bootstrap join readiness should allow CONTROL_READY leader metadata lag');
      const bootstrapReadyBody = JSON.parse(bootstrapReadyResponse.body);
      t.equal(bootstrapReadyBody.ready, true,
        'bootstrap join readiness should project ready=true for startup gate');
      t.same(bootstrapReadyBody.reasons, [],
        'bootstrap join readiness should clear tolerated blocker reasons');

      await api.shutdown();
    });

  test('BootstrapAPI - bootstrap join readiness tolerates isolated local query transport blockers',
    async (t) => {
      initializeTestEnvironment();

      const readinessSnapshot = {
        ready: false,
        phase: 'CONTROL_READY',
        state: 'warming',
        reasons: [LIFECYCLE_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY],
        retryAfterMs: 250,
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
        seedNodeId: 'seed-node-1',
        seedNodeAddress: 'ws://localhost:8080',
        systemTableCache: createEmptySystemTableCache(),
        readinessState,
        controlPlaneReadinessService: createSatisfiedControlPlaneReadinessService(),
      });

      await api.initialize(0, {listen: false});

      const strictReadyResponse = await api.getFastify().inject({
        method: 'GET',
        url: '/readyz',
      });
      t.equal(strictReadyResponse.statusCode, 503,
        'strict readiness should stay blocked on local query transport lag');

      const bootstrapReadyResponse = await api.getFastify().inject({
        method: 'GET',
        url: '/bootstrap/ready',
      });
      t.equal(bootstrapReadyResponse.statusCode, 200,
        'bootstrap join readiness should allow CONTROL_READY local query transport lag');
      const bootstrapReadyBody = JSON.parse(bootstrapReadyResponse.body);
      t.equal(bootstrapReadyBody.ready, true,
        'bootstrap join readiness should project ready=true while local query transport wiring catches up');
      t.same(bootstrapReadyBody.reasons, [],
        'bootstrap join readiness should clear tolerated local query transport blockers');

      await api.shutdown();
    });

  test('BootstrapAPI - bootstrap join readiness keeps transitional recovery authority open when startup authority is still converging',
    async (t) => {
      initializeTestEnvironment();

      const readinessSnapshot = {
        ready: false,
        phase: 'DEGRADED',
        state: 'degraded',
        reasons: [
          BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE,
          LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
        ],
        retryAfterMs: 250,
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
        seedNodeAddress: 'ws://localhost:8080',
        systemTableCache: createEmptySystemTableCache(),
        readinessState,
        controlPlaneReadinessService:
        createTransitionalPriorityRecoveryFailureControlPlaneReadinessService(),
      });

      await api.initialize(0, {listen: false});

      const strictReadyResponse = await api.getFastify().inject({
        method: 'GET',
        url: '/readyz',
      });
      t.equal(strictReadyResponse.statusCode, 503,
        'strict readiness should remain blocked while recovery is still pending');

      const bootstrapReadyResponse = await api.getFastify().inject({
        method: 'GET',
        url: '/bootstrap/ready',
      });
      t.equal(bootstrapReadyResponse.statusCode, 200,
        'bootstrap join readiness should stay open while transitional recovery authority exists');
      const bootstrapReadyBody = JSON.parse(bootstrapReadyResponse.body);
      t.equal(bootstrapReadyBody.ready, true,
        'bootstrap join readiness should project ready=true from transitional recovery authority');
      t.same(bootstrapReadyBody.reasons, [],
        'bootstrap join readiness should clear tolerated transitional recovery blockers');

      await api.shutdown();
    });

  test('BootstrapAPI - bootstrap join readiness uses seed-contact startup authority when local control-plane service is absent',
    async (t) => {
      initializeTestEnvironment();

      const readinessState = new BootstrapReadinessState({
        readyStableWindowMs: TEST_READY_STABLE_WINDOW_MS,
      });
      const api = new BootstrapAPI({
        seedNodeId: TEST_SEED_NODE_ID,
        seedNodeAddress: TEST_SEED_NODE_ADDRESS,
        systemTableCache: createEmptySystemTableCache(),
        bootstrapStartupAdapter: {
          phase: BOOTSTRAP_PHASE.COMPLETE,
          messageRouter: {},
          bootstrapResponse: {
            [BOOTSTRAP_API_RESPONSE_FIELD.STARTUP_AUTHORITY]:
            TEST_SEED_CONTACT_STARTUP_AUTHORITY,
          },
        },
        readinessState,
        startupRecoveryCoordinator: new StartupRecoveryCoordinator({
          readinessState,
        }),
        sqlQueryEngine: {},
      });

      api.getLeaderReadinessStatusForProbe = () => ({ready: true});

      await api.initialize(TEST_READY_STABLE_WINDOW_MS, {listen: false});

      const bootstrapReadyResponse = await api.getFastify().inject({
        method: TEST_HTTP_METHOD_GET,
        url: BOOTSTRAP_API_ROUTE.BOOTSTRAP_READY,
      });
      t.equal(
        bootstrapReadyResponse.statusCode,
        HTTP_STATUS.OK,
        'bootstrap join readiness should open from seed-contact authority',
      );
      const bootstrapReadyBody = JSON.parse(bootstrapReadyResponse.body);
      t.equal(
        bootstrapReadyBody.ready,
        true,
        'bootstrap join readiness should project ready=true',
      );
      t.equal(
        bootstrapReadyBody.controlPlaneRecoveryReady,
        true,
        'seed-authorized bootstrap INIT should be recovery-ready for restart admission',
      );
      t.same(
        bootstrapReadyBody.reasons,
        [],
        'bootstrap join readiness should clear tolerated recovery blockers',
      );
      t.equal(
        bootstrapReadyBody[
          BOOTSTRAP_API_READINESS_FIELD.BOOTSTRAP_JOIN_PROJECTION
        ]?.canProjectReady,
        true,
        'bootstrap join projection should record the seed-authorized decision',
      );

      await api.shutdown();
    });

  test('BootstrapAPI - bootstrap join readiness uses startup-adapter seed-contact authority during retryable join contact',
    async (t) => {
      initializeTestEnvironment();

      const readinessSnapshot = {
        ready: false,
        phase: 'DEGRADED',
        state: 'degraded',
        reasons: [
          BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE,
          LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
        ],
        retryAfterMs: 250,
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
      const startupAdapter = {
        phase: 'contacting_seed',
        bootstrapResponse: null,
        getSeedContactStartupAuthoritySnapshot() {
          return TEST_SEED_CONTACT_STARTUP_AUTHORITY;
        },
      };

      const api = new BootstrapAPI({
        seedNodeId: TEST_SEED_NODE_ID,
        seedNodeAddress: TEST_SEED_NODE_ADDRESS,
        systemTableCache: createEmptySystemTableCache(),
        bootstrapStartupAdapter: startupAdapter,
        readinessState,
        startupRecoveryCoordinator: new StartupRecoveryCoordinator({
          readinessState,
        }),
      });

      await api.initialize(TEST_READY_STABLE_WINDOW_MS, {listen: false});

      const bootstrapReadyResponse = await api.getFastify().inject({
        method: TEST_HTTP_METHOD_GET,
        url: BOOTSTRAP_API_ROUTE.BOOTSTRAP_READY,
      });
      t.equal(
        bootstrapReadyResponse.statusCode,
        HTTP_STATUS.OK,
        'bootstrap join readiness should open from retryable seed-contact authority',
      );
      const bootstrapReadyBody = JSON.parse(bootstrapReadyResponse.body);
      t.equal(
        bootstrapReadyBody.controlPlaneRecoveryReady,
        true,
        'startup recovery should classify the degraded metadata phase as recovery-ready',
      );
      t.equal(
        bootstrapReadyBody.startupAuthorityAvailable,
        true,
        'readiness should expose the retained startup authority',
      );
      t.same(
        bootstrapReadyBody.reasons,
        [],
        'bootstrap join readiness should clear tolerated retryable contact blockers',
      );

      await api.shutdown();
    });

  test('BootstrapAPI - bootstrap join readiness uses seed-contact authority during bootstrap INIT runtime wiring',
    async (t) => {
      initializeTestEnvironment();

      const readinessSnapshot = {
        ready: false,
        phase: LIFECYCLE_PHASE.INIT,
        state: LIFECYCLE_LEGACY_STATE.BOOTSTRAPPING,
        reasons: TEST_BOOTSTRAP_INIT_RUNTIME_WIRING_RECOVERY_REASONS,
        retryAfterMs: TEST_READY_RETRY_AFTER_MS,
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
      const startupAdapter = {
        phase: TEST_BOOTSTRAP_PHASE_CONTACTING_SEED,
        bootstrapResponse: null,
        getSeedContactStartupAuthoritySnapshot() {
          return TEST_SEED_CONTACT_STARTUP_AUTHORITY;
        },
      };

      const api = new BootstrapAPI({
        seedNodeId: TEST_SEED_NODE_ID,
        seedNodeAddress: TEST_SEED_NODE_ADDRESS,
        systemTableCache: createEmptySystemTableCache(),
        bootstrapStartupAdapter: startupAdapter,
        readinessState,
        startupRecoveryCoordinator: new StartupRecoveryCoordinator({
          readinessState,
        }),
      });

      await api.initialize(TEST_READY_STABLE_WINDOW_MS, {listen: false});

      const strictReadyResponse = await api.getFastify().inject({
        method: TEST_HTTP_METHOD_GET,
        url: BOOTSTRAP_API_ROUTE.READYZ,
      });
      t.equal(
        strictReadyResponse.statusCode,
        HTTP_STATUS.SERVICE_UNAVAILABLE,
        'strict readiness should stay closed while runtime wiring is incomplete',
      );

      const bootstrapReadyResponse = await api.getFastify().inject({
        method: TEST_HTTP_METHOD_GET,
        url: BOOTSTRAP_API_ROUTE.BOOTSTRAP_READY,
      });
      t.equal(
        bootstrapReadyResponse.statusCode,
        HTTP_STATUS.OK,
        'bootstrap join readiness should open from seed-contact authority during INIT',
      );
      const bootstrapReadyBody = JSON.parse(bootstrapReadyResponse.body);
      t.equal(
        bootstrapReadyBody.controlPlaneRecoveryReady,
        true,
        'startup recovery should classify seed-authorized INIT as recovery-ready',
      );
      t.equal(
        bootstrapReadyBody.startupAuthorityAvailable,
        true,
        'readiness should expose the retained seed-contact startup authority',
      );
      t.same(
        bootstrapReadyBody.reasons,
        [],
        'bootstrap join readiness should clear bootstrap-init recovery blockers',
      );
      t.equal(
        bootstrapReadyBody[
          BOOTSTRAP_API_READINESS_FIELD.BOOTSTRAP_JOIN_PROJECTION
        ]?.canProjectReady,
        true,
        'bootstrap join projection should record the authorized INIT decision',
      );

      await api.shutdown();
    });

  test('BootstrapAPI - bootstrap join readiness surfaces projection blocker',
    async (t) => {
      initializeTestEnvironment();

      const readinessSnapshot = {
        ready: false,
        phase: 'DEGRADED',
        state: 'degraded',
        reasons: [
          BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE,
          LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
        ],
        retryAfterMs: 250,
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
        seedNodeAddress: 'ws://localhost:8080',
        systemTableCache: createEmptySystemTableCache(),
        readinessState,
      });

      await api.initialize(0, {listen: false});

      const bootstrapReadyResponse = await api.getFastify().inject({
        method: 'GET',
        url: '/bootstrap/ready',
      });
      t.equal(bootstrapReadyResponse.statusCode, 503,
        'bootstrap join readiness should remain closed when authority is unavailable');
      const bootstrapReadyBody = JSON.parse(bootstrapReadyResponse.body);
      t.equal(
        bootstrapReadyBody[
          BOOTSTRAP_API_READINESS_FIELD.BOOTSTRAP_JOIN_PROJECTION
        ]?.blockerReason,
        TEST_BOOTSTRAP_JOIN_AUTHORITY_BLOCKER,
        'bootstrap readiness should expose the join projection blocker',
      );

      await api.shutdown();
    });

  test('BootstrapAPI - readiness probes surface monotonic progress metadata',
    async (t) => {
      initializeTestEnvironment();

      const readinessSnapshot = {
        ready: false,
        phase: 'JOIN_READY',
        phaseRank: 2,
        state: 'warming',
        reasons: [LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING],
        retryAfterMs: 250,
        stableWindowMs: 1000,
        stableElapsedMs: 400,
        stableSinceMs: 1700000000000,
        transitionCount: 7,
        timestamp: 1700000000400,
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
        seedNodeId: 'seed-node-1',
        seedNodeAddress: 'ws://localhost:8080',
        systemTableCache: createEmptySystemTableCache(),
        readinessState,
        controlPlaneReadinessService: createSatisfiedControlPlaneReadinessService(),
      });

      await api.initialize(0, {listen: false});

      const bootstrapReadyResponse = await api.getFastify().inject({
        method: 'GET',
        url: '/bootstrap/ready',
      });
      const bootstrapReadyBody = JSON.parse(bootstrapReadyResponse.body);
      t.equal(bootstrapReadyBody.phaseRank, 2,
        'bootstrap readiness should expose phase rank');
      t.equal(bootstrapReadyBody.readinessEpoch, 7,
        'bootstrap readiness should expose readiness epoch');
      t.equal(bootstrapReadyBody.stableWindowMs, 1000,
        'bootstrap readiness should expose stable window');
      t.equal(bootstrapReadyBody.stableElapsedMs, 400,
        'bootstrap readiness should expose stable elapsed time');
      t.equal(bootstrapReadyBody.stableSinceMs, 1700000000000,
        'bootstrap readiness should expose stable-window origin');

      await api.shutdown();
    });

  test('BootstrapAPI - readyz allows isolated message-group leader lag', async (t) => {
    initializeTestEnvironment();

    const readinessState = new BootstrapReadinessState({
      readyStableWindowMs: 0,
    });
    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: createEmptySystemTableCache(),
      bootstrapService: {
        phase: BOOTSTRAP_PHASE.COMPLETE,
        messageRouter: {},
      },
      readinessState,
      sqlQueryEngine: {
        async executeQuery() {
          return {success: true, rows: []};
        },
      },
      controlPlaneReadinessService: createSatisfiedControlPlaneReadinessService(),
    });

    api.getMissingServiceLeaders = () => {
      return {
        missingPartitionLeaders: [],
        missingPartitionLeaderNodes: [],
        missingPartitionLeaderAddresses: [],
        missingMessageGroupLeaders: ['mg-1'],
        missingMessageGroupLeaderNodes: ['mg-1'],
        missingMessageGroupLeaderAddresses: ['mg-1'],
      };
    };

    await api.initialize(0, {listen: false});

    const leaderStatus = api.getLeaderReadinessStatusForProbe();
    t.equal(leaderStatus.ready, true,
      'message-group leader lag alone should not block traffic readiness');
    t.same(
      leaderStatus.nonBlockingMissingMessageGroupLeaders,
      ['mg-1'],
      'probe diagnostics should retain non-blocking message-group gaps',
    );
    t.same(
      leaderStatus.missingMessageGroupLeaders,
      [],
      'blocking readiness subset should exclude message-group leader gaps',
    );

    const readyResponse = await api.getFastify().inject({
      method: 'GET',
      url: '/readyz',
    });
    t.equal(readyResponse.statusCode, 200,
      'readyz should stay green when only message-group leaders are lagging');
    const readyBody = JSON.parse(readyResponse.body);
    t.equal(readyBody.ready, true,
      'readyz should project ready=true when partition routing metadata is complete');
    t.same(readyBody.reasons, [],
      'readyz should not report message-group lag as a hard blocker');

    await api.shutdown();
  });

  test('BootstrapAPI - readiness probes surface startup recovery coordinator fields',
    async (t) => {
      initializeTestEnvironment();

      const readinessSnapshot = {
        ready: false,
        phase: 'CONTROL_READY',
        phaseRank: 1,
        state: 'warming',
        reasons: ['local_query_transport_not_ready'],
        retryAfterMs: 250,
        timestamp: 1700000000400,
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
        seedNodeId: 'seed-node-1',
        seedNodeAddress: 'ws://localhost:8080',
        systemTableCache: createEmptySystemTableCache(),
        readinessState,
        startupRecoveryCoordinator: {
          evaluate() {
            return {
              controlPlaneRecoveryReady: true,
              metadataPublicationReady: true,
              backgroundWorkReady: false,
              recoveryBlocked: false,
              recoveryStage: STARTUP_RECOVERY_STAGE.CONTROL_PLANE_RECOVERY_READY,
              recoveryStageRank: 2,
            };
          },
        },
      });

      await api.initialize(0, {listen: false});

      const bootstrapReadyResponse = await api.getFastify().inject({
        method: 'GET',
        url: '/bootstrap/ready',
      });
      const bootstrapReadyBody = JSON.parse(bootstrapReadyResponse.body);
      t.equal(bootstrapReadyBody.controlPlaneRecoveryReady, true);
      t.equal(bootstrapReadyBody.metadataPublicationReady, true);
      t.equal(bootstrapReadyBody.backgroundWorkReady, false);
      t.equal(bootstrapReadyBody.recoveryBlocked, false);
      t.equal(
        bootstrapReadyBody.recoveryStage,
        STARTUP_RECOVERY_STAGE.CONTROL_PLANE_RECOVERY_READY,
      );
      t.equal(bootstrapReadyBody.recoveryStageRank, 2);

      await api.shutdown();
    });
}
