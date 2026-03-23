/**
 * Tests for Bootstrap API.
 * Requirements: 1.2, 7.2, 7.3, 7.4
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI, BootstrapStrategy} from '../../src/bootstrap/bootstrap-api.js';
import {
  BOOTSTRAP_API_ERROR,
  BOOTSTRAP_API_LOG_MSG,
} from '../../src/bootstrap/bootstrap-api-constants.js';
import {
  BOOTSTRAP_PHASE,
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from '../../src/bootstrap/bootstrap-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {CACHE_HYDRATION_TABLES} from '../../src/cache/cache-constants.js';
import {
  ENDPOINT_STATUS,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STATE,
  TABLES,
  TRANSPORT_TYPE,
} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {BootstrapReadinessState} from '../../src/bootstrap/bootstrap-readiness-state.js';
import {LIFECYCLE_REASON} from '../../src/bootstrap/lifecycle-controller-constants.js';

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

test('BootstrapAPI - initialization', async (t) => {
  initializeTestEnvironment();

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: createEmptySystemTableCache(),
  });

  t.equal(api.isInitialized(), false, 'should not be initialized before init');

  // Initialize on random port
  await api.initialize(0, {listen: false});

  t.equal(api.isInitialized(), true, 'should be initialized after init');
  t.ok(api.getFastify(), 'should have fastify instance');

  await api.shutdown();
  t.equal(api.isInitialized(), false, 'should not be initialized after shutdown');
});

test('BootstrapAPI - health endpoint', async (t) => {
  initializeTestEnvironment();

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: createEmptySystemTableCache(),
    sqlQueryEngine: {executeQuery: async () => ({success: true})},
  });

  await api.initialize(0, {listen: false});

  const response = await api.getFastify().inject({
    method: 'GET',
    url: '/health',
  });

  t.equal(response.statusCode, 200, 'should return 200');
  const body = JSON.parse(response.body);
  t.equal(body.status, 'healthy', 'should return healthy status');
  t.equal(body.nodeId, 'seed-node-1', 'should return seed node ID');

  await api.shutdown();
});

test('BootstrapAPI - move-assignment sweep only starts on the lifecycle owner',
  async (t) => {
    initializeTestEnvironment();

    const joinerApi = new BootstrapAPI({
      seedNodeId: 'joiner-node-1',
      seedNodeAddress: 'ws://localhost:8081',
      systemTableCache: createEmptySystemTableCache(),
      ownsMoveReplicaAssignmentLifecycle: false,
    });

    joinerApi.startMoveReplicaAssignmentSweep();
    t.equal(
      joinerApi.moveReplicaAssignmentSweepTimer,
      null,
      'joiner-local bootstrap API should not start sweeping seed-owned move assignments',
    );

    const seedApi = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: createEmptySystemTableCache(),
      ownsMoveReplicaAssignmentLifecycle: true,
      moveReplicaAssignmentSweepIntervalMs: 1000,
    });

    seedApi.startMoveReplicaAssignmentSweep();
    t.ok(
      seedApi.moveReplicaAssignmentSweepTimer,
      'seed-side bootstrap API should start the move-assignment sweep timer',
    );

    await joinerApi.shutdown();
    await seedApi.shutdown();
  });

test('BootstrapAPI - health reports initializing before SQL engine is ready', async (t) => {
  initializeTestEnvironment();

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: createEmptySystemTableCache(),
  });

  await api.initialize(0, {listen: false});

  // No sqlQueryEngine set — health should report not ready
  const before = await api.getFastify().inject({
    method: 'GET',
    url: '/health',
  });

  t.equal(before.statusCode, 200,
    'should return 200 for liveness even before SQL engine is available');
  const beforeBody = JSON.parse(before.body);
  t.equal(beforeBody.status, 'initializing',
    'should report initializing status');
  t.equal(beforeBody.ready, false,
    'should expose readiness=false before SQL engine is available');

  // After setting the SQL engine, health should be 200
  api.setSqlQueryEngine({executeQuery: async () => ({success: true})});

  const after = await api.getFastify().inject({
    method: 'GET',
    url: '/health',
  });

  t.equal(after.statusCode, 200,
    'should return 200 after SQL engine is set');
  const afterBody = JSON.parse(after.body);
  t.equal(afterBody.status, 'healthy',
    'should report healthy status');
  t.equal(afterBody.ready, true,
    'should expose readiness=true after SQL engine is set');

  await api.shutdown();
});

test('BootstrapAPI - setSqlQueryEngine propagates to current partition services',
  async (t) => {
    initializeTestEnvironment();

    const observedEngines = [];
    const partitionServices = new Map([
      ['partition-1', {
        setSqlQueryEngine(engine) {
          observedEngines.push(engine);
        },
      }],
    ]);
    const sqlQueryEngine = {executeQuery: async () => ({success: true})};
    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: createEmptySystemTableCache(),
      partitionServices,
    });

    api.setSqlQueryEngine(sqlQueryEngine);

    t.equal(
      observedEngines.length,
      1,
      'setSqlQueryEngine should fan out to existing partition services',
    );
    t.equal(
      observedEngines[0],
      sqlQueryEngine,
      'partition services should receive the exact engine instance',
    );
  });

test('BootstrapAPI - bootstrap control-plane queries use the canonical gateway with shared admission policy',
  async (t) => {
    initializeTestEnvironment();

    let capturedSql = null;
    let capturedParams = null;
    let capturedOptions = null;
    const controlPlaneSystemTableGateway = {
      async executeQuery(sql, params, options) {
        capturedSql = sql;
        capturedParams = params;
        capturedOptions = options;
        return {success: true, rows: []};
      },
    };
    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: createEmptySystemTableCache(),
      controlPlaneSystemTableGateway,
      bootstrapAdmissionRetryAfterMs: 375,
    });

    const result = await api.executeBootstrapControlPlaneQuery(
      'SELECT * FROM services WHERE service_id = ?',
      ['svc-1'],
    );

    t.same(result, {success: true, rows: []},
      'gateway result should be returned unchanged');
    t.equal(capturedSql, 'SELECT * FROM services WHERE service_id = ?',
      'bootstrap queries should execute through the gateway');
    t.same(capturedParams, ['svc-1'],
      'bootstrap queries should preserve parameters');
    t.equal(capturedOptions.owner, 'bootstrap-api',
      'bootstrap gateway queries should identify the bootstrap owner');
    t.equal(capturedOptions.workClass, 'critical',
      'bootstrap gateway queries should reserve critical protected capacity');
    t.equal(capturedOptions.deliveryPriority, 'critical',
      'bootstrap gateway queries should still use critical transport delivery');
    t.equal(capturedOptions.enforcePressureAdmission, true,
      'bootstrap gateway queries should enforce shared pressure admission');
    t.equal(capturedOptions.allowPressureDefer, true,
      'bootstrap gateway queries should defer under pressure instead of failing deep in the stack');
    t.equal(capturedOptions.allowPressureDegrade, false,
      'bootstrap gateway writes should not silently degrade');
    t.equal(capturedOptions.pressureRetryAfterMs, 375,
      'bootstrap gateway queries should propagate retry hints');
    t.equal(capturedOptions.routingReadinessDimension, 'repairEligible',
      'bootstrap gateway queries should keep repair-eligible routing semantics');
  });

test('BootstrapAPI - bootstrap control-plane mutations use the canonical gateway with shared admission policy',
  async (t) => {
    initializeTestEnvironment();

    let capturedMutation = null;
    let capturedOptions = null;
    const controlPlaneSystemTableGateway = {
      async submitMutation(mutation, options) {
        capturedMutation = mutation;
        capturedOptions = options;
        return {success: true, outcome: 'applied'};
      },
    };
    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: createEmptySystemTableCache(),
      controlPlaneSystemTableGateway,
      bootstrapAdmissionRetryAfterMs: 375,
    });

    const result = await api.executeBootstrapControlPlaneMutation({
      operation: 'upsert',
      tableName: TABLES.SERVICES,
      row: {
        service_id: 'svc-1',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        node_id: 'seed-node-1',
      },
    });

    t.same(result, {success: true, outcome: 'applied'},
      'gateway mutation result should be returned unchanged');
    t.same(capturedMutation, {
      operation: 'upsert',
      tableName: TABLES.SERVICES,
      row: {
        service_id: 'svc-1',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        node_id: 'seed-node-1',
      },
    }, 'bootstrap mutations should execute through the gateway');
    t.equal(capturedOptions.owner, 'bootstrap-api',
      'bootstrap gateway mutations should identify the bootstrap owner');
    t.equal(capturedOptions.workClass, 'critical',
      'bootstrap gateway mutations should reserve critical protected capacity');
    t.equal(capturedOptions.deliveryPriority, 'critical',
      'bootstrap gateway mutations should still use critical delivery');
    t.equal(capturedOptions.allowPressureDefer, true,
      'bootstrap gateway mutations should defer under pressure');
    t.equal(capturedOptions.allowPressureDegrade, false,
      'bootstrap gateway mutations should not silently degrade');
    t.equal(capturedOptions.pressureRetryAfterMs, 375,
      'bootstrap gateway mutations should propagate retry hints');
    t.equal(capturedOptions.routingReadinessDimension, 'repairEligible',
      'bootstrap gateway mutations should keep repair-eligible routing semantics');
  });

test('BootstrapAPI - MOVE_REPLICA handoff insert persists through canonical mutation ingress',
  async (t) => {
    initializeTestEnvironment();

    let capturedMutation = null;
    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: createEmptySystemTableCache(),
      controlPlaneSystemTableGateway: {
        async submitMutation(mutation) {
          capturedMutation = mutation;
          return {success: true, affectedRows: 1};
        },
      },
    });

    await api.insertMoveReplicaHandoffOperation({
      operationId: 'op-1',
      type: 'ADD',
      partitionId: 'mg-1',
      replicaId: 'mg-1-r1',
      sourceNodeId: 'seed-node-1',
      targetNodeId: 'joiner-1',
      status: 'preparing',
      workflowStep: 'CREATING',
      createdAt: 100,
      updatedAt: 100,
      completedAt: null,
      leaseExpiresAt: null,
      errorMessage: null,
      stepsHistory: [],
      entityType: SERVICE_TYPE.MESSAGE_GROUP,
      entityId: 'mg-1',
    });

    t.same(capturedMutation, {
      operation: 'insert',
      tableName: TABLES.REPLICA_OPERATIONS,
      row: {
        operation_id: 'op-1',
        type: 'ADD',
        partition_id: 'mg-1',
        replica_id: 'mg-1-r1',
        source_node_id: 'seed-node-1',
        target_node_id: 'joiner-1',
        status: 'preparing',
        workflow_step: 'CREATING',
        created_at: 100,
        updated_at: 100,
        completed_at: null,
        lease_expires_at: null,
        error_message: null,
        steps_history: '[]',
        entity_type: SERVICE_TYPE.MESSAGE_GROUP,
        entity_id: 'mg-1',
      },
    }, 'handoff inserts should go through the shared mutation gateway');
  });

test('BootstrapAPI - MOVE_REPLICA handoff update persists through canonical mutation ingress',
  async (t) => {
    initializeTestEnvironment();

    let capturedMutation = null;
    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: createEmptySystemTableCache(),
      controlPlaneSystemTableGateway: {
        async submitMutation(mutation) {
          capturedMutation = mutation;
          return {success: true, affectedRows: 1};
        },
      },
    });

    await api.updateMoveReplicaHandoffOperation({
      operationId: 'op-1',
      status: 'committed',
      workflowStep: 'ACTIVE',
      updatedAt: 250,
      completedAt: 250,
      leaseExpiresAt: 250,
      errorMessage: null,
      stepsHistory: [{phase: 'commit', timestamp: 250}],
    });

    t.same(capturedMutation, {
      operation: 'update',
      tableName: TABLES.REPLICA_OPERATIONS,
      whereClause: {
        operation_id: 'op-1',
      },
      data: {
        status: 'committed',
        workflow_step: 'ACTIVE',
        updated_at: 250,
        completed_at: 250,
        lease_expires_at: 250,
        error_message: null,
        steps_history: JSON.stringify([{phase: 'commit', timestamp: 250}]),
      },
    }, 'handoff updates should go through the shared mutation gateway');
  });

test('BootstrapAPI - register-service returns retryable 503 when the control-plane gateway defers',
  async (t) => {
    initializeTestEnvironment();
    const warnEvents = [];

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: createEmptySystemTableCache(),
      sqlQueryEngine: {executeQuery: async () => ({success: true})},
      controlPlaneSystemTableGateway: {
        async submitMutation() {
          return {
            success: false,
            error: 'Distributed operation failed due to participant failures',
            errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
            pressureAction: 'defer',
            pressureReason: 'transport_backpressure',
            retryAfterMs: 250,
            tableName: TABLES.SERVICES,
            pressureSummary: {
              backpressured: true,
            },
          };
        },
        async executeQuery() {
          return {success: true, rows: []};
        },
      },
    });

    await api.initialize(0, {listen: false});
    api.serviceRegistrationHandoffOwner.delegates
      .getRegisterServiceWriteRetryTimeoutMs = () => 0;
    api.logger = {
      debug() {},
      info() {},
      warn(message, details) {
        warnEvents.push({message, details});
      },
      error() {},
    };

    const response = await api.getFastify().inject({
      method: 'POST',
      url: '/register-service',
      payload: {
        service_id: 'mg-1-r1',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        node_id: 'joiner-node-1',
        group_id: 'mg-1',
        replica_id: 'mg-1-r1',
      },
    });

    t.equal(response.statusCode, 503,
      'register-service should surface a retryable response when the control-plane query path defers');
    const body = JSON.parse(response.body);
    t.equal(body.success, false,
      'register-service should fail closed under shared-pressure deferral');
    t.equal(body.code, 'CONTROL_PLANE_PRESSURE_DEGRADED',
      'register-service should propagate the typed gateway error code');
    t.equal(body.retryAfterMs, 250,
      'register-service should expose the retry hint from the gateway');
    t.equal(
      body.error,
      'Distributed operation failed due to participant failures',
      'register-service should preserve the canonical failure message',
    );
    t.ok(
      warnEvents.some((event) =>
        event.message === BOOTSTRAP_API_LOG_MSG.SERVICE_REGISTRATION_DEFERRED,
      ),
      'register-service should classify deferred services publication separately',
    );
    t.notOk(
      warnEvents.some((event) =>
        event.message ===
          BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_VALIDATION_FAILED,
      ),
      'retryable services publication defer should not be mislabeled as assignment validation',
    );

    await api.shutdown();
  });

test('BootstrapAPI - register-service retries deferred services publication before failing outward',
  async (t) => {
    initializeTestEnvironment();

    let mutationAttempts = 0;
    let fakeNow = 0;
    const retryEvents = [];
    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: createEmptySystemTableCache(),
      sqlQueryEngine: {executeQuery: async () => ({success: true})},
      controlPlaneSystemTableGateway: {
        async submitMutation() {
          mutationAttempts += 1;
          if (mutationAttempts === 1) {
            return {
              success: false,
              error: 'control_plane_pressure_degraded',
              errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
              pressureAction: 'defer',
              pressureReason: 'transport_backpressure',
              retryAfterMs: 250,
              tableName: TABLES.SERVICES,
            };
          }
          return {success: true, affectedRows: 1};
        },
        async executeQuery() {
          return {success: true, rows: []};
        },
      },
    });

    await api.initialize(0, {listen: false});
    api.serviceRegistrationHandoffOwner.delegates
      .getRegisterServiceWriteRetryTimeoutMs = () => 1000;
    api.serviceRegistrationHandoffOwner.delegates.getNow = () => fakeNow;
    api.serviceRegistrationHandoffOwner.delegates.getSleep = () =>
      async (delayMs) => {
        fakeNow += delayMs;
      };
    api.waitForRegisteredServiceCacheVisibility = async () => {};
    api.logger = {
      debug() {},
      info() {},
      warn(message, details) {
        retryEvents.push({message, details});
      },
      error() {},
    };

    const response = await api.getFastify().inject({
      method: 'POST',
      url: '/register-service',
      payload: {
        service_id: 'mg-1-r1',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        node_id: 'joiner-node-1',
        group_id: 'mg-1',
        replica_id: 'mg-1-r1',
      },
    });

    t.equal(response.statusCode, 200,
      'register-service should absorb one retryable services write defer');
    t.equal(mutationAttempts, 2,
      'register-service should retry the canonical services write once');
    t.same(
      retryEvents.filter((event) =>
        event.message === BOOTSTRAP_API_LOG_MSG.SERVICE_REGISTRATION_WRITE_RETRY,
      ).map((event) => event.details.retryAfterMs),
      [250],
      'retry diagnostics should preserve the gateway retry hint',
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

test('BootstrapAPI - readyz still blocks missing partition leader metadata', async (t) => {
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
  });

  api.getMissingServiceLeaders = () => {
    return {
      missingPartitionLeaders: ['nodes-p1'],
      missingPartitionLeaderNodes: ['nodes-p1'],
      missingPartitionLeaderAddresses: ['nodes-p1'],
      missingMessageGroupLeaders: ['mg-1'],
      missingMessageGroupLeaderNodes: ['mg-1'],
      missingMessageGroupLeaderAddresses: ['mg-1'],
    };
  };

  await api.initialize(0, {listen: false});

  const leaderStatus = api.getLeaderReadinessStatusForProbe();
  t.equal(leaderStatus.ready, false,
    'missing partition leader metadata should still block readiness');
  t.same(
    leaderStatus.missingPartitionLeaders,
    ['nodes-p1'],
    'blocking readiness subset should retain partition leader gaps',
  );

  const readyResponse = await api.getFastify().inject({
    method: 'GET',
    url: '/readyz',
  });
  t.equal(readyResponse.statusCode, 503,
    'readyz should remain blocked when partition leader metadata is missing');
  const readyBody = JSON.parse(readyResponse.body);
  t.equal(readyBody.ready, false,
    'readyz should expose ready=false when partition routing is incomplete');
  t.ok(
    readyBody.reasons.includes(BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE),
    'readyz should continue reporting the leader metadata blocker',
  );

  await api.shutdown();
});

test('BootstrapAPI - readyz tolerates non-traffic control-plane partition lag',
  async (t) => {
    initializeTestEnvironment();

    const systemTableCache = {
      ...createEmptySystemTableCache(),
      getAll(tableName) {
        if (tableName === TABLES.PARTITIONS) {
          return [
            {partition_id: 'nodes-p1', table_id: TABLES.NODES},
            {partition_id: 'tables-p1', table_id: TABLES.TABLES},
            {partition_id: 'partitions-p1', table_id: TABLES.PARTITIONS},
            {partition_id: 'services-p1', table_id: TABLES.SERVICES},
            {partition_id: 'node_endpoints-p1', table_id: TABLES.NODE_ENDPOINTS},
            {partition_id: 'config-p1', table_id: TABLES.CONFIG},
            {partition_id: 'message_groups-p1', table_id: TABLES.MESSAGE_GROUPS},
          ];
        }
        return [];
      },
    };
    const readinessState = new BootstrapReadinessState({
      readyStableWindowMs: 0,
    });
    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache,
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
    });

    api.getMissingServiceLeaders = () => {
      return {
        missingPartitionLeaders: ['config-p1', 'message_groups-p1'],
        missingPartitionLeaderNodes: ['config-p1', 'message_groups-p1'],
        missingPartitionLeaderAddresses: ['config-p1', 'message_groups-p1'],
        missingMessageGroupLeaders: [],
        missingMessageGroupLeaderNodes: [],
        missingMessageGroupLeaderAddresses: [],
      };
    };

    await api.initialize(0, {listen: false});

    const leaderStatus = api.getLeaderReadinessStatusForProbe();
    t.equal(leaderStatus.ready, true,
      'config and message-group metadata lag should not block traffic readiness');
    t.same(
      leaderStatus.missingPartitionLeaders,
      [],
      'blocking readiness subset should exclude non-traffic partition lag',
    );

    const readyResponse = await api.getFastify().inject({
      method: 'GET',
      url: '/readyz',
    });
    t.equal(readyResponse.statusCode, 200,
      'readyz should stay green when only non-traffic control-plane partitions lag');
    const readyBody = JSON.parse(readyResponse.body);
    t.equal(readyBody.ready, true,
      'readyz should project ready=true when traffic routing tables are complete');
    t.same(readyBody.reasons, [],
      'readyz should not report tolerated control-plane lag as a hard blocker');

    await api.shutdown();
  });

test('BootstrapAPI - bootstrap join readiness keeps blocking when additional blockers exist',
  async (t) => {
    initializeTestEnvironment();

    const readinessSnapshot = {
      ready: false,
      phase: 'CONTROL_READY',
      state: 'warming',
      reasons: [
        BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE,
        BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
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
      seedNodeId: 'seed-node-1',
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
      'bootstrap join readiness should remain blocked when other blockers exist');
    const bootstrapReadyBody = JSON.parse(bootstrapReadyResponse.body);
    t.equal(bootstrapReadyBody.ready, false,
      'bootstrap join readiness should expose ready=false with hard blockers');
    t.same(
      bootstrapReadyBody.reasons.sort(),
      readinessSnapshot.reasons.sort(),
      'bootstrap join readiness should preserve blocking reasons',
    );

    await api.shutdown();
  });

test('BootstrapAPI - bootstrap join readiness allows stable-window-only join-ready projection',
  async (t) => {
    initializeTestEnvironment();

    const readinessSnapshot = {
      ready: false,
      phase: 'JOIN_READY',
      state: 'warming',
      reasons: [LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING],
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
    });

    await api.initialize(0, {listen: false});

    const strictReadyResponse = await api.getFastify().inject({
      method: 'GET',
      url: '/readyz',
    });
    t.equal(strictReadyResponse.statusCode, 503,
      'strict readiness should remain blocked during the stable window');

    const bootstrapReadyResponse = await api.getFastify().inject({
      method: 'GET',
      url: '/bootstrap/ready',
    });
    t.equal(bootstrapReadyResponse.statusCode, 200,
      'bootstrap join readiness should stay green during stable-window-only warming');
    const bootstrapReadyBody = JSON.parse(bootstrapReadyResponse.body);
    t.equal(bootstrapReadyBody.ready, true,
      'bootstrap join readiness should project ready=true during stable-window-only warming');
    t.same(bootstrapReadyBody.reasons, [],
      'bootstrap join readiness should clear stable-window-only reasons');

    await api.shutdown();
  });

test('BootstrapAPI - readiness stays gated until startup dependencies and stable window complete',
  async (t) => {
    initializeTestEnvironment();

    const bootstrapService = {
      phase: BOOTSTRAP_PHASE.INFRASTRUCTURE,
    };

    const readinessCache = {
      get() {
        return null;
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
      getAll(tableName) {
        if (tableName === TABLES.PARTITIONS) {
          return [{
            partition_id: 'partition-1',
            table_name: TABLES.NODES,
            leader_node_id: 'seed-node-1',
          }];
        }
        if (tableName === TABLES.MESSAGE_GROUPS) {
          return [{
            group_id: 'mg-1',
            leader_node_id: 'seed-node-1',
          }];
        }
        if (tableName === TABLES.SERVICES) {
          return [
            {
              service_id: 'partition-1-leader',
              service_type: SERVICE_TYPE.PARTITION,
              partition_id: 'partition-1',
              node_id: 'seed-node-1',
              address: 'seed-node-1/partition/partition-1-leader',
              raft_role: RAFT_ROLE.LEADER,
              status: SERVICE_STATUS.ACTIVE,
            },
            {
              service_id: 'mg-1-leader',
              service_type: SERVICE_TYPE.MESSAGE_GROUP,
              group_id: 'mg-1',
              node_id: 'seed-node-1',
              address: 'seed-node-1/message-group/mg-1-leader',
              raft_role: RAFT_ROLE.LEADER,
              status: SERVICE_STATUS.ACTIVE,
            },
          ];
        }
        return [];
      },
    };

    let nowMs = 1000;
    const readinessState = new BootstrapReadinessState({
      readyStableWindowMs: 50,
      demotionFailureThreshold: 2,
      now: () => nowMs,
      retryAfterMs: 250,
    });

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: readinessCache,
      bootstrapService,
      readinessState,
    });

    await api.initialize(0, {listen: false});

    let response = await api.getFastify().inject({
      method: 'GET',
      url: '/readyz',
    });
    t.equal(response.statusCode, 503,
      'readyz should stay unavailable while bootstrap phase is incomplete');
    let body = JSON.parse(response.body);
    t.ok(body.reasons.includes('BOOTSTRAP_PHASE_INCOMPLETE'),
      'should expose bootstrap-phase blocker while startup incomplete');

    bootstrapService.phase = BOOTSTRAP_PHASE.COMPLETE;
    response = await api.getFastify().inject({
      method: 'GET',
      url: '/readyz',
    });
    t.equal(response.statusCode, 503,
      'readyz should remain unavailable while SQL engine is missing');
    body = JSON.parse(response.body);
    t.ok(body.reasons.includes(BOOTSTRAP_PIPELINE_ERROR_CODE.SQL_ENGINE_UNAVAILABLE),
      'should expose SQL engine blocker before routing is available');

    api.setSqlQueryEngine({executeQuery: async () => ({success: true})});
    response = await api.getFastify().inject({
      method: 'GET',
      url: '/readyz',
    });
    t.equal(response.statusCode, 503,
      'readyz should remain unavailable while runtime wiring is incomplete');
    body = JSON.parse(response.body);
    t.ok(body.reasons.includes(BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY),
      'should expose runtime-wiring blocker before message router is present');

    api.messageRouter = {};
    response = await api.getFastify().inject({
      method: 'GET',
      url: '/readyz',
    });
    t.equal(response.statusCode, 503,
      'readyz should require sustained success window before promotion');
    body = JSON.parse(response.body);
    t.ok(body.reasons.includes('READINESS_STABLE_WINDOW_PENDING'),
      'should report stable-window pending before promotion threshold elapses');

    nowMs += 60;
    response = await api.getFastify().inject({
      method: 'GET',
      url: '/readyz',
    });
    t.equal(response.statusCode, 200,
      'readyz should promote after sustained success window elapses');
    body = JSON.parse(response.body);
    t.equal(body.ready, true, 'readyz should expose ready=true after promotion');

    await api.shutdown();
  });

test('BootstrapAPI - readyz blocks on local query transport readiness before promotion',
  async (t) => {
    initializeTestEnvironment();

    const readinessCache = {
      get() {
        return null;
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
      getAll(tableName) {
        if (tableName === TABLES.PARTITIONS) {
          return [{
            partition_id: 'partition-1',
            table_name: TABLES.NODES,
            leader_node_id: 'seed-node-1',
          }];
        }
        if (tableName === TABLES.MESSAGE_GROUPS) {
          return [{
            group_id: 'mg-1',
            leader_node_id: 'seed-node-1',
          }];
        }
        if (tableName === TABLES.SERVICES) {
          return [{
            service_id: 'partition-1-leader',
            service_type: SERVICE_TYPE.PARTITION,
            partition_id: 'partition-1',
            node_id: 'seed-node-1',
            address: 'seed-node-1/partition/partition-1-leader',
            raft_role: RAFT_ROLE.LEADER,
            status: SERVICE_STATUS.ACTIVE,
          }];
        }
        return [];
      },
    };

    let nowMs = 1000;
    let localTransportReady = false;
    const readinessState = new BootstrapReadinessState({
      readyStableWindowMs: 50,
      demotionFailureThreshold: 2,
      now: () => nowMs,
      retryAfterMs: 250,
    });

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: readinessCache,
      bootstrapService: {
        phase: BOOTSTRAP_PHASE.COMPLETE,
      },
      readinessState,
      sqlQueryEngine: {executeQuery: async () => ({success: true})},
      messageRouter: {
        getQueryDataPlaneTransportReadiness() {
          return localTransportReady ?
            {ready: true, state: 'ready'} :
            {
              ready: false,
              state: 'deferred',
              reason: 'Query/data-plane message-group transport is not configured',
              retryAfterMs: 75,
            };
        },
      },
    });

    await api.initialize(0, {listen: false});

    let response = await api.getFastify().inject({
      method: 'GET',
      url: '/readyz',
    });
    t.equal(response.statusCode, 503,
      'readyz should stay unavailable while local query transport is deferred');
    let body = JSON.parse(response.body);
    t.ok(
      body.reasons.includes(LIFECYCLE_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY),
      'readyz should expose the local query transport blocker',
    );

    localTransportReady = true;
    response = await api.getFastify().inject({
      method: 'GET',
      url: '/readyz',
    });
    t.equal(response.statusCode, 503,
      'readyz should still honor the stable window after transport recovers');
    body = JSON.parse(response.body);
    t.ok(
      body.reasons.includes(LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING),
      'readyz should move from transport gating into the stable window',
    );

    nowMs += 60;
    response = await api.getFastify().inject({
      method: 'GET',
      url: '/readyz',
    });
    t.equal(response.statusCode, 200,
      'readyz should promote once local query transport is ready and the stable window elapses');
    body = JSON.parse(response.body);
    t.equal(body.ready, true, 'readyz should expose ready=true after promotion');

    await api.shutdown();
  });

test('BootstrapAPI - transitions probes to draining non-ready state during shutdown',
  async (t) => {
    initializeTestEnvironment();

    const drainDeadlineMs = Date.now() + 5000;
    const readySnapshot = {
      ready: true,
      phase: 'TRAFFIC_READY',
      state: 'join_ready',
      reasons: [],
      retryAfterMs: 0,
      timestamp: Date.now(),
      draining: false,
      drainDeadlineMs: null,
    };
    const drainingSnapshot = {
      ready: false,
      phase: 'DEGRADED',
      state: 'degraded',
      reasons: ['NODE_DRAINING'],
      retryAfterMs: 100,
      timestamp: Date.now(),
      draining: true,
      drainDeadlineMs,
    };
    let draining = false;
    const readinessState = {
      evaluate() {
        return draining ? drainingSnapshot : readySnapshot;
      },
      getSnapshot() {
        return draining ? drainingSnapshot : readySnapshot;
      },
      beginDrain() {
        draining = true;
        return drainingSnapshot;
      },
      recordProbeResult() {},
    };

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-drain',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: createEmptySystemTableCache(),
      bootstrapService: {
        phase: BOOTSTRAP_PHASE.COMPLETE,
      },
      readinessState,
      messageRouter: {},
      sqlQueryEngine: {executeQuery: async () => ({success: true})},
    });

    await api.initialize(0, {listen: false});

    let response = await api.getFastify().inject({
      method: 'GET',
      url: '/readyz',
    });
    t.equal(response.statusCode, 200,
      'readyz should be healthy before draining signal');

    api.markDraining({
      drainDeadlineMs,
      reasonCode: 'NODE_DRAINING',
    });

    response = await api.getFastify().inject({
      method: 'GET',
      url: '/readyz',
    });
    const body = JSON.parse(response.body);
    t.equal(response.statusCode, 503,
      'readyz should become non-ready after draining signal');
    t.equal(body.draining, true,
      'readyz payload should expose draining=true during shutdown');
    t.equal(body.drainDeadlineMs, drainDeadlineMs,
      'readyz payload should include drain deadline');
    t.ok(body.reasons.includes('NODE_DRAINING'),
      'readyz payload should include node-draining reason');

    await api.shutdown();
  });

test('BootstrapAPI - bootstrap validation', async (t) => {
  initializeTestEnvironment();

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: createEmptySystemTableCache(),
  });

  await api.initialize(0, {listen: false});

  // Test missing nodeId
  let response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {nodeAddress: 'ws://localhost:9090'},
  });

  t.equal(response.statusCode, 400, 'should return 400 for missing nodeId');
  let body = JSON.parse(response.body);
  t.ok(body.error.includes('nodeId'), 'error should mention nodeId');

  // Test invalid nodeId
  response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {nodeId: 'invalid-uuid', nodeAddress: 'ws://localhost:9090'},
  });

  t.equal(response.statusCode, 400, 'should return 400 for invalid nodeId');
  body = JSON.parse(response.body);
  t.ok(body.error.includes('UUID'), 'error should mention UUID');

  // Test missing nodeAddress
  response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {nodeId: '550e8400-e29b-41d4-a716-446655440000'},
  });

  t.equal(response.statusCode, 400, 'should return 400 for missing nodeAddress');
  body = JSON.parse(response.body);
  t.ok(body.error.includes('nodeAddress'), 'error should mention nodeAddress');

  await api.shutdown();
});

test('BootstrapAPI - liveness remains true while readiness degrades on repeated control writes',
  async (t) => {
    initializeTestEnvironment();

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: createEmptySystemTableCache(),
      bootstrapService: {
        phase: BOOTSTRAP_PHASE.COMPLETE,
        messageRouter: {},
      },
      readinessState: new BootstrapReadinessState(),
      controlPlaneWriteHealthProvider: () => ({
        healthy: false,
        reasonCode: LIFECYCLE_REASON.OBSERVABILITY_BACKLOG,
        details: {
          source: 'heartbeat_service',
          consecutiveFailures: 5,
          failureThreshold: 3,
        },
      }),
    });

    await api.initialize(0, {listen: false});
    api.setSqlQueryEngine({executeQuery: async () => ({success: true})});
    api.getLeaderReadinessStatusForProbe = () => ({ready: true});

    const liveResponse = await api.getFastify().inject({
      method: 'GET',
      url: '/livez',
    });
    t.equal(liveResponse.statusCode, 200,
      'liveness should stay green despite control-plane write degradation');

    const readyResponse = await api.getFastify().inject({
      method: 'GET',
      url: '/readyz',
    });
    t.equal(readyResponse.statusCode, 503,
      'readiness should degrade when control-plane write failures persist');
    const readyBody = JSON.parse(readyResponse.body);
    t.equal(readyBody.ready, false, 'readyz should expose degraded readiness');
    t.ok(
      Array.isArray(readyBody.reasons) &&
        readyBody.reasons.includes(LIFECYCLE_REASON.OBSERVABILITY_BACKLOG),
      'readiness should include structured control-plane degradation reason',
    );

    await api.shutdown();
  });

test('BootstrapAPI - bootstrap conflict detection', async (t) => {
  initializeTestEnvironment();

  // Create a mock system table cache that tracks registered nodes
  const registeredNodes = new Map();
  const mockSystemTableCache = {
    get(tableName, key) {
      if (tableName === 'nodes') {
        return registeredNodes.get(key) || null;
      }
      return null;
    },
    getAll(tableName) {
      if (tableName === 'nodes') {
        return Array.from(registeredNodes.values());
      }
      return [];
    },
    getReadyNodes() {
      return [];
    },
    // Helper to simulate node registration (via CDC in production)
    _registerNode(nodeId, nodeAddress) {
      registeredNodes.set(nodeId, {node_id: nodeId, node_address: nodeAddress});
    },
  };

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: mockSystemTableCache,
  });

  await api.initialize(0, {listen: false});

  // First bootstrap should succeed
  const nodeId = '550e8400-e29b-41d4-a716-446655440000';
  let response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {nodeId, nodeAddress: 'ws://localhost:9090'},
  });

  t.equal(response.statusCode, 200, 'first bootstrap should succeed');

  // Simulate the node being registered via CDC (in production this happens via system table)
  mockSystemTableCache._registerNode(nodeId, 'ws://localhost:9090');

  // Second bootstrap with same nodeId should fail
  response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {nodeId, nodeAddress: 'ws://localhost:9091'},
  });

  t.equal(response.statusCode, 409, 'duplicate nodeId should return 409');
  const body = JSON.parse(response.body);
  t.ok(body.error.includes('already registered'), 'error should mention already registered');

  // Bootstrap with seed node ID should fail
  response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {
      nodeId: 'seed-node-1',
      nodeAddress: 'ws://localhost:9092',
    },
  });

  // seed-node-1 is not a valid UUID, so it should fail validation first
  t.equal(response.statusCode, 400, 'seed node ID should fail validation');

  await api.shutdown();
});

test('BootstrapAPI - returns bootstrap not ready before touching cache', async (t) => {
  initializeTestEnvironment();

  const readinessSnapshot = {
    ready: false,
    state: 'bootstrapping',
    reasons: ['BOOTSTRAP_PHASE_INCOMPLETE'],
    retryAfterMs: 350,
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
    systemTableCache: null,
    bootstrapService: {
      phase: BOOTSTRAP_PHASE.INFRASTRUCTURE,
    },
    readinessState,
  });

  await api.initialize(0, {listen: false});

  const response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {
      nodeId: '550e8400-e29b-41d4-a716-446655440010',
      nodeAddress: 'ws://localhost:9090',
    },
  });

  t.equal(response.statusCode, 503,
    'should return 503 while bootstrap service is not complete');
  const body = JSON.parse(response.body);
  t.equal(body.error, BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
    'should return bootstrap not ready error');
  t.equal(body.code, BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
    'should include bootstrap-not-ready pipeline code');
  t.equal(body.phase, BOOTSTRAP_PHASE.INFRASTRUCTURE,
    'should include current bootstrap phase');
  t.equal(body.retryAfterMs, 350,
    'should include retry hint while bootstrap is not ready');
  t.same(body.reasons, ['BOOTSTRAP_PHASE_INCOMPLETE'],
    'should include machine-readable blocker reasons');

  await api.shutdown();
});

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

test('BootstrapAPI - returns bootstrap not ready while partition leaders are still settling', async (t) => {
  initializeTestEnvironment();

  const mockSystemTableCache = {
    getAll(tableName) {
      if (tableName === TABLES.PARTITIONS) {
        return [{
          partition_id: 'partition-1',
          table_name: 'nodes',
        }];
      }
      if (tableName === TABLES.MESSAGE_GROUPS) {
        return [{
          group_id: 'mg-1',
        }];
      }
      if (tableName === TABLES.SERVICES) {
        return [{
          service_id: 'svc-1',
          service_type: SERVICE_TYPE.PARTITION,
          partition_id: 'partition-1',
          raft_role: RAFT_ROLE.FOLLOWER,
          status: SERVICE_STATUS.ACTIVE,
        }];
      }
      return [];
    },
    get() {
      return null;
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

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: mockSystemTableCache,
  });

  await api.initialize(0, {listen: false});

  const response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {
      nodeId: '550e8400-e29b-41d4-a716-446655440000',
      nodeAddress: 'ws://localhost:9090',
    },
  });

  t.equal(response.statusCode, 503,
    'should block bootstrap admission while partition leader metadata is incomplete');
  const body = JSON.parse(response.body);
  t.equal(body.success, false, 'should return the canonical not-ready bootstrap envelope');
  t.equal(body.leaderReadiness.ready, false,
    'should expose degraded leader readiness in the bootstrap response');
  t.equal(body.leaderReadiness.missingPartitionLeaders[0], 'partition-1',
    'should report missing partition leader diagnostics');
  t.equal(body.leaderReadiness.missingMessageGroupLeaders[0], 'mg-1',
    'should report missing message-group leader diagnostics');

  await api.shutdown();
});

test('BootstrapAPI - allows bootstrap when only message-group leaders are missing',
  async (t) => {
    initializeTestEnvironment();

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: createEmptySystemTableCache(),
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

    const response = await api.getFastify().inject({
      method: 'POST',
      url: '/bootstrap',
      payload: {
        nodeId: '550e8400-e29b-41d4-a716-446655440000',
        nodeAddress: 'ws://localhost:9090',
      },
    });

    t.equal(response.statusCode, 200,
      'bootstrap should proceed when only message-group leaders are lagging');
    const body = JSON.parse(response.body);
    t.equal(body.success, true, 'should return success');
    t.ok(body.messageGroupAssignment, 'should still include assignment metadata');

    await api.shutdown();
  });

test('BootstrapAPI - waitForServiceLeaders returns promptly when leaders are missing',
  async (t) => {
    initializeTestEnvironment();

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: createEmptySystemTableCache(),
      bootstrapService: {
        config: {
          leadershipWaitTimeoutMs: 1000,
          leadershipWaitInitialDelayMs: 100,
          leadershipWaitMaxDelayMs: 100,
          leadershipWaitBackoffMultiplier: 2,
        },
      },
      partitionServices: new Map([['partition-1', {partitionId: 'partition-1'}]]),
      messageGroupServices: new Map([['mg-1', {groupId: 'mg-1'}]]),
    });

    api.getMissingServiceLeaders = () => {
      return {
        missingPartitionLeaders: ['partition-1'],
        missingPartitionLeaderNodes: ['partition-1'],
        missingPartitionLeaderAddresses: ['partition-1'],
        missingMessageGroupLeaders: ['mg-1'],
        missingMessageGroupLeaderNodes: ['mg-1'],
        missingMessageGroupLeaderAddresses: ['mg-1'],
      };
    };

    const start = Date.now();
    const status = await api.waitForServiceLeaders();
    const elapsedMs = Date.now() - start;

    t.equal(status.ready, false, 'should report leaders as not ready');
    t.ok(elapsedMs < 200,
      `should return quickly without waiting full timeout (elapsed=${elapsedMs}ms)`);
  });

test('BootstrapAPI - successful bootstrap with CREATE_SELF_HOSTED', async (t) => {
  initializeTestEnvironment();

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    messageGroupServices: new Map(),
    systemTableCache: createEmptySystemTableCache(),
  });

  await api.initialize(0, {listen: false});

  const nodeId = '550e8400-e29b-41d4-a716-446655440001';
  const response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {nodeId, nodeAddress: 'ws://localhost:9090'},
  });

  t.equal(response.statusCode, 200, 'bootstrap should succeed');

  const body = JSON.parse(response.body);
  t.equal(body.success, true, 'should return success');
  t.equal(body.seedNodeId, 'seed-node-1', 'should return seed node ID');
  t.ok(body.messageGroupAssignment, 'should have message group assignment');
  t.equal(
    body.messageGroupAssignment.strategy,
    BootstrapStrategy.CREATE_SELF_HOSTED,
    'should use CREATE_SELF_HOSTED strategy when no movable replicas',
  );
  t.equal(body.messageGroupAssignment.replicaCount, 3, 'should have 3 replicas');
  t.ok(body.clusterConfig, 'should have cluster config');
  t.ok(body.timestamp, 'should have timestamp');

  await api.shutdown();
});

test('BootstrapAPI - bootstrap with MOVE_REPLICA strategy', async (t) => {
  initializeTestEnvironment();

  // System table cache with message group services for MOVE_REPLICA assignment
  // The system cache (fed by CDC) is the single source of truth
  const mockSystemTableCache = {
    data: {
      message_groups: [],
      services: [
        {
          service_id: 'mg-1-r1',
          service_type: SERVICE_TYPE.MESSAGE_GROUP,
          node_id: 'seed-node-1',
          group_id: 'mg-1',
          replica_id: 'mg-1-r1',
          address: 'seed-node-1/message-group/mg-1-r1',
          raft_role: RAFT_ROLE.FOLLOWER,
          status: SERVICE_STATUS.ACTIVE,
        },
        {
          service_id: 'mg-1-r2',
          service_type: SERVICE_TYPE.MESSAGE_GROUP,
          node_id: 'seed-node-1',
          group_id: 'mg-1',
          replica_id: 'mg-1-r2',
          address: 'seed-node-1/message-group/mg-1-r2',
          raft_role: RAFT_ROLE.FOLLOWER,
          status: SERVICE_STATUS.ACTIVE,
        },
        {
          service_id: 'mg-1-r3',
          service_type: SERVICE_TYPE.MESSAGE_GROUP,
          node_id: 'seed-node-1',
          group_id: 'mg-1',
          replica_id: 'mg-1-r3',
          address: 'seed-node-1/message-group/mg-1-r3',
          raft_role: RAFT_ROLE.FOLLOWER,
          status: SERVICE_STATUS.ACTIVE,
        },
      ],
      nodes: [],
      partitions: [],
    },
    getAll(table) {
      return this.data[table] || [];
    },
    get(table, id) {
      const items = this.data[table] || [];
      return items.find((item) => item[`${table.slice(0, -1)}_id`] === id);
    },
    filter(table, predicate) {
      return (this.data[table] || []).filter(predicate);
    },
    getReadyNodes() {
      return [];
    },
  };

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: mockSystemTableCache,
  });

  await api.initialize(0, {listen: false});

  const nodeId = '550e8400-e29b-41d4-a716-446655440002';
  const response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {nodeId, nodeAddress: 'ws://localhost:9090'},
  });

  t.equal(response.statusCode, 200, 'bootstrap should succeed');

  const body = JSON.parse(response.body);
  t.equal(body.success, true, 'should return success');
  t.ok(body.messageGroupAssignment, 'should have message group assignment');
  t.equal(
    body.messageGroupAssignment.strategy,
    BootstrapStrategy.MOVE_REPLICA,
    'should use MOVE_REPLICA strategy when movable replicas exist',
  );
  t.equal(body.messageGroupAssignment.groupId, 'mg-1', 'should target existing group');
  t.equal(
    body.messageGroupAssignment.sourceNodeId,
    'seed-node-1',
    'should identify source node',
  );
  t.ok(body.messageGroupAssignment.replicaToMove, 'should identify replica to move');
  t.ok(body.messageGroupAssignment.replicaAddresses, 'should have replica addresses');

  await api.shutdown();
});

test('BootstrapAPI - cluster state endpoint', async (t) => {
  initializeTestEnvironment();

  // Create a mock system table cache that tracks registered nodes
  const registeredNodes = new Map();
  const mockSystemTableCache = {
    get(tableName, key) {
      if (tableName === 'nodes') {
        return registeredNodes.get(key) || null;
      }
      return null;
    },
    getAll(tableName) {
      if (tableName === 'nodes') {
        return Array.from(registeredNodes.values());
      }
      return [];
    },
    getReadyNodes() {
      return [];
    },
    // Helper to simulate node registration (via CDC in production)
    _registerNode(nodeId, nodeAddress) {
      registeredNodes.set(nodeId, {node_id: nodeId, node_address: nodeAddress});
    },
  };

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: mockSystemTableCache,
  });

  await api.initialize(0, {listen: false});

  // Bootstrap a node first
  const nodeId = '550e8400-e29b-41d4-a716-446655440003';
  await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {nodeId, nodeAddress: 'ws://localhost:9090'},
  });

  // Simulate the node being registered via CDC
  mockSystemTableCache._registerNode(nodeId, 'ws://localhost:9090');

  // Get cluster state
  const response = await api.getFastify().inject({
    method: 'GET',
    url: '/cluster/state',
  });

  t.equal(response.statusCode, 200, 'should return 200');

  const body = JSON.parse(response.body);
  t.equal(body.seedNodeId, 'seed-node-1', 'should return seed node ID');
  t.equal(body.nodeCount, 2, 'should have 2 nodes (seed + new)');
  t.ok(Array.isArray(body.nodes), 'should have nodes array');
  t.ok(body.nodes.find((n) => n.isSeed), 'should have seed node');
  t.ok(body.nodes.find((n) => n.nodeId === nodeId), 'should have new node');

  await api.shutdown();
});

test('BootstrapAPI - buildSystemTableSnapshots', async (t) => {
  initializeTestEnvironment();

  // Create a mock system table cache with sample data
  const mockSystemTableCache = {
    data: {
      nodes: [
        {node_id: 'node-1', node_address: 'ws://localhost:8080', status: 'active'},
        {node_id: 'node-2', node_address: 'ws://localhost:8081', status: 'active'},
      ],
      partitions: [
        {partition_id: 'p1', table_name: 'users', key_range_start: 0, key_range_end: 100},
        {partition_id: 'p2', table_name: 'orders', key_range_start: 0, key_range_end: 100},
      ],
      services: [
        {service_id: 's1', service_type: 'partition', partition_id: 'p1', node_id: 'node-1'},
        {service_id: 's2', service_type: 'message_group', group_id: 'mg-1', node_id: 'node-1'},
      ],
      tables: [
        {table_id: 'users', table_name: 'users', schema: '{}'},
        {table_id: 'orders', table_name: 'orders', schema: '{}'},
      ],
      message_groups: [
        {group_id: 'mg-1', group_name: 'message_group_1', replica_count: 3},
      ],
      replica_operations: [
        {operation_id: 'op-1', operation_type: 'add_replica', status: 'pending'},
      ],
      indices: [],
      config: [],
      logs: [],
      live_queries: [],
      contexts: [],
      code: [],
    },
    getAll(table) {
      return this.data[table] || [];
    },
    getReadyNodes() {
      return [];
    },
  };

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: mockSystemTableCache,
  });

  await api.initialize(0, {listen: false});

  // Call buildSystemTableSnapshots
  const snapshots = api.buildSystemTableSnapshots();

  // Verify all system tables are present
  t.ok(snapshots, 'should return snapshots object');
  for (const tableName of CACHE_HYDRATION_TABLES) {
    t.ok(Array.isArray(snapshots[tableName]), `${tableName} should be an array`);
  }
  t.notOk(snapshots[TABLES.LOGS], 'logs table is excluded from default snapshots');

  // Verify data is correct
  t.equal(snapshots.nodes.length, 2, 'should have 2 nodes');
  t.equal(snapshots.partitions.length, 2, 'should have 2 partitions');
  t.equal(snapshots.services.length, 2, 'should have 2 services');
  t.equal(snapshots.tables.length, 2, 'should have 2 tables');
  t.equal(snapshots.message_groups.length, 1, 'should have 1 message group');
  t.equal(snapshots.replica_operations.length, 1, 'should have 1 replica operation');

  // Verify specific data
  t.equal(snapshots.nodes[0].node_id, 'node-1', 'should have correct node data');
  t.equal(snapshots.partitions[0].partition_id, 'p1', 'should have correct partition data');

  await api.shutdown();
});

test('BootstrapAPI - buildSystemTableSnapshots handles empty cache', async (t) => {
  initializeTestEnvironment();

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: createEmptySystemTableCache(),
  });

  await api.initialize(0, {listen: false});

  // Call buildSystemTableSnapshots with empty cache
  const snapshots = api.buildSystemTableSnapshots();

  // Verify all system tables are present but empty
  t.ok(snapshots, 'should return snapshots object');
  for (const tableName of CACHE_HYDRATION_TABLES) {
    t.ok(Array.isArray(snapshots[tableName]), `${tableName} should be an array`);
  }

  // Verify all arrays are empty
  for (const tableName of CACHE_HYDRATION_TABLES) {
    t.equal(snapshots[tableName].length, 0, `${tableName} should be empty`);
  }

  await api.shutdown();
});

test(
  'BootstrapAPI - buildSystemTableSnapshots prefers authoritative local partition rows',
  async (t) => {
    initializeTestEnvironment();

    const staleEndpointRow = {
      endpoint_id: 'pg-seed',
      service_id: 'sys-postgres-wire',
      node_id: 'seed-node-1',
      protocol: 'tcp',
      address: 'seed-host',
      port: 5432,
      health_status: 'healthy',
      metadata: '{}',
      created_at: 1,
      updated_at: 10,
    };
    const authoritativeRows = [
      staleEndpointRow,
      {
        endpoint_id: 'pg-peer',
        service_id: 'sys-postgres-wire',
        node_id: 'peer-node-2',
        protocol: 'tcp',
        address: 'peer-host',
        port: 5432,
        health_status: 'healthy',
        metadata: '{}',
        created_at: 2,
        updated_at: 20,
      },
    ];
    const cacheData = {
      [TABLES.PARTITIONS]: [
        {
          partition_id: 'service_endpoints-p1',
          table_name: TABLES.SERVICE_ENDPOINTS,
        },
      ],
      [TABLES.SERVICES]: [
        {
          service_id: 'service_endpoints-p1-r1',
          partition_id: 'service_endpoints-p1',
          service_type: SERVICE_TYPE.PARTITION,
          raft_role: RAFT_ROLE.LEADER,
          status: SERVICE_STATUS.ACTIVE,
          node_id: 'seed-node-1',
          address: 'seed-node-1/partition/service_endpoints-p1-r1',
        },
      ],
      [TABLES.SERVICE_ENDPOINTS]: [staleEndpointRow],
    };
    const mockCache = {
      get() {
        return null;
      },
      getAll(tableName) {
        return cacheData[tableName] || [];
      },
      filter(tableName, predicate) {
        return (cacheData[tableName] || []).filter(predicate);
      },
      getReadyNodes() {
        return [];
      },
    };

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: mockCache,
      partitionServices: new Map([
        ['service_endpoints-p1-r1', {
          partitionId: 'service_endpoints-p1',
          replicaId: 'service_endpoints-p1-r1',
          initialized: true,
          db: {
            prepare(sql) {
              t.equal(
                sql,
                `SELECT * FROM ${TABLES.SERVICE_ENDPOINTS}`,
                'bootstrap snapshots should read the local partition directly',
              );
              return {
                all() {
                  return authoritativeRows;
                },
              };
            },
          },
        }],
      ]),
    });

    await api.initialize(0, {listen: false});

    const snapshots = api.buildSystemTableSnapshots();

    t.same(
      snapshots.service_endpoints.map((row) => row.node_id).sort(),
      ['peer-node-2', 'seed-node-1'],
      'authoritative local partition rows should replace stale cache snapshots',
    );

    await api.shutdown();
  },
);

test(
  'BootstrapAPI - message group assignment prefers authoritative local services rows',
  async (t) => {
    initializeTestEnvironment();

    const cacheServices = [
      {
        service_id: 'mg-1-r1',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        node_id: 'seed-node-1',
        group_id: 'mg-1',
        replica_id: 'mg-1-r1',
        address: 'seed-node-1/message-group/mg-1-r1',
        raft_role: RAFT_ROLE.FOLLOWER,
        status: SERVICE_STATUS.ACTIVE,
        created_at: 1,
        updated_at: 10,
      },
      {
        service_id: 'mg-1-r2',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        node_id: 'seed-node-1',
        group_id: 'mg-1',
        replica_id: 'mg-1-r2',
        address: 'seed-node-1/message-group/mg-1-r2',
        raft_role: RAFT_ROLE.FOLLOWER,
        status: SERVICE_STATUS.ACTIVE,
        created_at: 1,
        updated_at: 10,
      },
      {
        service_id: 'mg-1-r3',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        node_id: 'seed-node-1',
        group_id: 'mg-1',
        replica_id: 'mg-1-r3',
        address: 'seed-node-1/message-group/mg-1-r3',
        raft_role: RAFT_ROLE.FOLLOWER,
        status: SERVICE_STATUS.ACTIVE,
        created_at: 1,
        updated_at: 10,
      },
    ];
    const authoritativeServices = [
      {
        ...cacheServices[0],
        node_id: 'node-2',
        address: 'node-2/message-group/mg-1-r1',
        updated_at: 20,
      },
      {
        ...cacheServices[1],
        updated_at: 20,
      },
      {
        ...cacheServices[2],
        updated_at: 20,
      },
    ];
    const cacheData = {
      [TABLES.PARTITIONS]: [
        {
          partition_id: 'services-p1',
          table_name: TABLES.SERVICES,
        },
      ],
      [TABLES.SERVICES]: cacheServices,
      [TABLES.MESSAGE_GROUPS]: [],
    };
    const mockCache = {
      get() {
        return null;
      },
      getAll(tableName) {
        return cacheData[tableName] || [];
      },
      filter(tableName, predicate) {
        return (cacheData[tableName] || []).filter(predicate);
      },
      getReadyNodes() {
        return ['seed-node-1', 'node-2'];
      },
    };

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: mockCache,
      partitionServices: new Map([
        ['services-p1-r1', {
          partitionId: 'services-p1',
          replicaId: 'services-p1-r1',
          initialized: true,
          db: {
            prepare(sql) {
              t.equal(
                sql,
                `SELECT * FROM ${TABLES.SERVICES}`,
                'message group assignment should use the same authoritative services read as bootstrap snapshots',
              );
              return {
                all() {
                  return authoritativeServices;
                },
              };
            },
          },
        }],
      ]),
    });

    await api.initialize(0, {listen: false});

    const messageGroups = api.getMessageGroups();
    t.same(
      messageGroups[0]?.replicas?.map((replica) => replica.node_id).sort(),
      ['node-2', 'seed-node-1', 'seed-node-1'],
      'message group topology should come from authoritative local services rows',
    );

    const assignment = api.determineMessageGroupAssignment('new-node-1');
    t.equal(
      assignment.strategy,
      BootstrapStrategy.MOVE_REPLICA,
      'assignment should still use MOVE_REPLICA when one source node has two replicas',
    );
    t.not(
      assignment.replicaToMove,
      'mg-1-r1',
      'assignment must not reserve a replica that authoritative services rows already show as moved',
    );
    t.ok(
      ['mg-1-r2', 'mg-1-r3'].includes(assignment.replicaToMove),
      'assignment should choose one of the replicas still owned by the seed',
    );

    await api.shutdown();
  },
);

test('BootstrapAPI - buildSystemTableSnapshots handles missing cache', async (t) => {
  initializeTestEnvironment();

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: null, // No cache
  });

  await api.initialize(0, {listen: false});

  // Call buildSystemTableSnapshots with missing cache should throw
  t.throws(
    () => api.buildSystemTableSnapshots(),
    /BootstrapAPI requires systemTableCache/,
    'should throw error when cache is missing',
  );

  await api.shutdown();
});

test('BootstrapAPI - handleBootstrapRequest includes systemTableSnapshots', async (t) => {
  initializeTestEnvironment();

  // Create a mock system table cache with sample data
  // Must include partition and message group leaders with addresses for bootstrap to succeed
  const mockCache = {
    get() {
      return null;
    },
    getAll(tableName) {
      if (tableName === TABLES.NODES) {
        return [{node_id: 'seed-node-1', node_address: 'ws://localhost:8080'}];
      }
      if (tableName === TABLES.PARTITIONS) {
        return [{
          partition_id: 'p1',
          table_name: 'nodes',
          leader_node_id: 'seed-node-1',
        }];
      }
      if (tableName === TABLES.SERVICES) {
        return [
          {
            service_id: 'partition-leader',
            service_type: SERVICE_TYPE.PARTITION,
            partition_id: 'p1',
            node_id: 'seed-node-1',
            address: 'seed-node-1/partition/partition-leader',
            raft_role: RAFT_ROLE.LEADER,
            status: SERVICE_STATUS.ACTIVE,
          },
          {
            service_id: 'message-group-leader',
            service_type: SERVICE_TYPE.MESSAGE_GROUP,
            group_id: 'mg1',
            node_id: 'seed-node-1',
            address: 'seed-node-1/message-group/message-group-leader',
            raft_role: RAFT_ROLE.LEADER,
            status: SERVICE_STATUS.ACTIVE,
          },
        ];
      }
      if (tableName === TABLES.TABLES) {
        return [{table_id: 't1', table_name: 'nodes'}];
      }
      if (tableName === TABLES.MESSAGE_GROUPS) {
        return [{group_id: 'mg1', leader_node_id: 'seed-node-1'}];
      }
      if (tableName === TABLES.REPLICA_OPERATIONS) {
        return [];
      }
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

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'http://localhost:8080',
    wsPort: 9090,
    systemTableCache: mockCache,
    messageGroupServices: new Map(),
  });

  await api.initialize(0, {listen: false});

  const response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {
      nodeId: '550e8400-e29b-41d4-a716-446655440000',
      nodeAddress: 'ws://localhost:9090',
    },
  });

  t.equal(response.statusCode, 200, 'should return 200');
  const body = JSON.parse(response.body);

  t.equal(body.success, true, 'should return success');
  t.ok(body.systemTableSnapshots, 'should include systemTableSnapshots');
  t.ok(body.topologySnapshotMeta, 'should include topologySnapshotMeta');
  t.ok(Array.isArray(body.systemTableSnapshots.nodes), 'nodes should be an array');
  t.ok(Array.isArray(body.systemTableSnapshots.partitions),
    'partitions should be an array');
  t.ok(Array.isArray(body.systemTableSnapshots.services),
    'services should be an array');
  t.ok(Array.isArray(body.systemTableSnapshots.tables), 'tables should be an array');
  t.ok(Array.isArray(body.systemTableSnapshots.message_groups),
    'message_groups should be an array');
  t.ok(Array.isArray(body.systemTableSnapshots.replica_operations),
    'replica_operations should be an array');

  t.equal(body.systemTableSnapshots.nodes.length, 1,
    'should have 1 node in snapshot');
  t.equal(body.systemTableSnapshots.partitions.length, 1,
    'should have 1 partition in snapshot');
  t.equal(body.systemTableSnapshots.services.length, 2,
    'should have 2 services in snapshot');
  t.equal(body.topologySnapshotMeta.topologyEpoch, 0,
    'bootstrap response should include the published topology epoch');
  t.same(
    body.topologySnapshotMeta.hydrationTables,
    CACHE_HYDRATION_TABLES,
    'bootstrap response should advertise the sanctioned hydration tables',
  );

  await api.shutdown();
});

test('BootstrapAPI - getReadyNodes includes seed node when lease expired', async (t) => {
  initializeTestEnvironment();

  const now = Date.now();
  const expiredLease = now - 1000; // Expired 1 second ago

  // Create cache where seed node has expired lease
  const mockCache = {
    get: () => null,
    getAll: (tableName) => {
      if (tableName === TABLES.NODES) {
        return [
          {
            node_id: 'seed-node-1',
            status: 'active',
            connection_state: STATE.READY,
            ready_lease_expires_at: expiredLease, // Expired
          },
          {
            node_id: 'other-node',
            status: 'active',
            connection_state: STATE.READY,
            ready_lease_expires_at: now + 10000, // Valid
          },
        ];
      }
      return [];
    },
    filter: (tableName, predicate) => {
      const all = mockCache.getAll(tableName);
      return all.filter(predicate);
    },
    find: () => null,
    getReadyNodes: function() {
      // Simulate the real getReadyNodes which filters by lease
      const currentTime = Date.now();
      return this.filter(TABLES.NODES, (node) => {
        return node.connection_state === STATE.READY &&
          node.ready_lease_expires_at &&
          node.ready_lease_expires_at > currentTime;
      }).map((n) => n.node_id);
    },
  };

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: mockCache,
  });

  await api.initialize(0, {listen: false});

  const readyNodes = api.getReadyNodes();

  // Should include seed node even though its lease expired
  t.ok(readyNodes.includes('seed-node-1'),
    'should include seed node despite expired lease');
  t.ok(readyNodes.includes('other-node'),
    'should include other ready nodes');
  t.equal(readyNodes.length, 2, 'should have 2 ready nodes');

  await api.shutdown();
});

test('BootstrapAPI - getReadyNodes does not duplicate seed node', async (t) => {
  initializeTestEnvironment();

  const now = Date.now();
  const validLease = now + 10000;

  // Create cache where seed node has valid lease
  const mockCache = {
    get: () => null,
    getAll: (tableName) => {
      if (tableName === TABLES.NODES) {
        return [
          {
            node_id: 'seed-node-1',
            connection_state: STATE.READY,
            ready_lease_expires_at: validLease, // Valid
          },
        ];
      }
      return [];
    },
    filter: (tableName, predicate) => {
      const all = mockCache.getAll(tableName);
      return all.filter(predicate);
    },
    find: () => null,
    getReadyNodes: function() {
      const currentTime = Date.now();
      return this.filter(TABLES.NODES, (node) => {
        return node.connection_state === STATE.READY &&
          node.ready_lease_expires_at &&
          node.ready_lease_expires_at > currentTime;
      }).map((n) => n.node_id);
    },
  };

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: mockCache,
  });

  await api.initialize(0, {listen: false});

  const readyNodes = api.getReadyNodes();

  // Should not duplicate seed node
  t.equal(readyNodes.filter((n) => n === 'seed-node-1').length, 1,
    'should not duplicate seed node');
  t.equal(readyNodes.length, 1, 'should have exactly 1 ready node');

  await api.shutdown();
});

test('BootstrapAPI - getReadyNodes handles empty cache', async (t) => {
  initializeTestEnvironment();

  // Create cache with no nodes
  const mockCache = {
    get: () => null,
    getAll: () => [],
    filter: () => [],
    find: () => null,
    getReadyNodes: () => [],
  };

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: mockCache,
  });

  await api.initialize(0, {listen: false});

  const readyNodes = api.getReadyNodes();

  // Should still include seed node
  t.ok(readyNodes.includes('seed-node-1'),
    'should include seed node even with empty cache');
  t.equal(readyNodes.length, 1, 'should have exactly 1 ready node (seed)');

  await api.shutdown();
});

test('BootstrapAPI - getReadyNodes requires canonical websocket endpoint visibility for non-seed nodes',
  async (t) => {
    initializeTestEnvironment();

    const now = Date.now();
    const validLease = now + 10000;
    const mockCache = {
      get: () => null,
      getAll: (tableName) => {
        if (tableName === TABLES.NODES) {
          return [
            {
              node_id: 'seed-node-1',
              status: 'active',
              connection_state: STATE.READY,
              ready_lease_expires_at: validLease,
            },
            {
              node_id: 'node-2',
              status: 'active',
              connection_state: STATE.READY,
              ready_lease_expires_at: validLease,
            },
            {
              node_id: 'node-3',
              status: 'active',
              connection_state: STATE.READY,
              ready_lease_expires_at: validLease,
            },
          ];
        }
        if (tableName === TABLES.NODE_ENDPOINTS) {
          return [{
            endpoint_id: 'node-3-ws',
            node_id: 'node-3',
            transport_type: TRANSPORT_TYPE.WEBSOCKET,
            status: ENDPOINT_STATUS.ACTIVE,
            address: 'ws://node-3:8082',
          }];
        }
        return [];
      },
      filter: (tableName, predicate) => {
        const all = mockCache.getAll(tableName);
        return all.filter(predicate);
      },
      find: () => null,
      getReadyNodes: () => ['seed-node-1', 'node-2', 'node-3'],
    };

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: mockCache,
    });

    await api.initialize(0, {listen: false});

    const readyNodes = api.getReadyNodes();

    t.same(
      readyNodes.sort(),
      ['node-3', 'seed-node-1'],
      'non-seed nodes should need canonical websocket endpoints before bootstrap advertises them as ready',
    );

    await api.shutdown();
  });


test('BootstrapAPI - buildSystemTableSnapshots includes node_endpoints', async (t) => {
  initializeTestEnvironment();

  // Create a mock system table cache with node_endpoints data
  // Validates: Requirements 6.10, 8.1 - node_endpoints table included in bootstrap snapshots
  const mockSystemTableCache = {
    data: {
      nodes: [
        {node_id: 'node-1', node_address: 'ws://localhost:8080', status: 'active'},
      ],
      partitions: [
        {partition_id: 'p1', table_name: 'nodes'},
      ],
      services: [
        {service_id: 's1', service_type: 'partition', partition_id: 'p1', node_id: 'node-1'},
      ],
      tables: [
        {table_id: 'nodes', table_name: 'nodes', schema: '{}'},
      ],
      message_groups: [
        {group_id: 'mg-1', group_name: 'message_group_1', replica_count: 3},
      ],
      replica_operations: [],
      indices: [],
      config: [],
      logs: [],
      live_queries: [],
      contexts: [],
      code: [],
      node_endpoints: [
        {
          endpoint_id: 'ep-1',
          node_id: 'node-1',
          transport_type: 'ws',
          address: 'ws://localhost:8080',
          priority: 0,
          metadata: '{}',
          status: 'active',
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        {
          endpoint_id: 'ep-2',
          node_id: 'node-1',
          transport_type: 'nats',
          address: 'nats://localhost:4222',
          priority: 1,
          metadata: '{}',
          status: 'active',
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      ],
    },
    getAll(table) {
      return this.data[table] || [];
    },
    getReadyNodes() {
      return [];
    },
  };

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: mockSystemTableCache,
  });

  await api.initialize(0, {listen: false});

  // Call buildSystemTableSnapshots
  const snapshots = api.buildSystemTableSnapshots();

  // Verify node_endpoints is present and is an array
  t.ok(snapshots, 'should return snapshots object');
  t.ok(Array.isArray(snapshots.node_endpoints), 'node_endpoints should be an array');

  // Verify node_endpoints data is correct
  t.equal(snapshots.node_endpoints.length, 2, 'should have 2 node endpoints');
  t.equal(snapshots.node_endpoints[0].endpoint_id, 'ep-1',
    'should have correct endpoint_id');
  t.equal(snapshots.node_endpoints[0].transport_type, 'ws',
    'should have correct transport_type');
  t.equal(snapshots.node_endpoints[1].transport_type, 'nats',
    'should have correct transport_type for second endpoint');

  await api.shutdown();
});

test('BootstrapAPI - handleBootstrapRequest includes node_endpoints in snapshots', async (t) => {
  initializeTestEnvironment();

  // Create a mock system table cache with node_endpoints data
  // Validates: Requirements 6.10, 8.1 - node_endpoints included in bootstrap response
  const mockCache = {
    get() {
      return null;
    },
    getAll(tableName) {
      if (tableName === TABLES.NODES) {
        return [{node_id: 'seed-node-1', node_address: 'ws://localhost:8080'}];
      }
      if (tableName === TABLES.PARTITIONS) {
        return [{
          partition_id: 'p1',
          table_name: 'nodes',
          leader_node_id: 'seed-node-1',
        }];
      }
      if (tableName === TABLES.SERVICES) {
        return [
          {
            service_id: 'partition-leader',
            service_type: SERVICE_TYPE.PARTITION,
            partition_id: 'p1',
            node_id: 'seed-node-1',
            address: 'seed-node-1/partition/partition-leader',
            raft_role: RAFT_ROLE.LEADER,
            status: SERVICE_STATUS.ACTIVE,
          },
          {
            service_id: 'message-group-leader',
            service_type: SERVICE_TYPE.MESSAGE_GROUP,
            group_id: 'mg1',
            node_id: 'seed-node-1',
            address: 'seed-node-1/message-group/message-group-leader',
            raft_role: RAFT_ROLE.LEADER,
            status: SERVICE_STATUS.ACTIVE,
          },
        ];
      }
      if (tableName === TABLES.TABLES) {
        return [{table_id: 't1', table_name: 'nodes'}];
      }
      if (tableName === TABLES.MESSAGE_GROUPS) {
        return [{group_id: 'mg1', leader_node_id: 'seed-node-1'}];
      }
      if (tableName === TABLES.NODE_ENDPOINTS) {
        return [
          {
            endpoint_id: 'ep-seed-1',
            node_id: 'seed-node-1',
            transport_type: 'ws',
            address: 'ws://localhost:8080',
            priority: 0,
            metadata: '{}',
            status: 'active',
            created_at: Date.now(),
            updated_at: Date.now(),
          },
        ];
      }
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

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'http://localhost:8080',
    wsPort: 9090,
    systemTableCache: mockCache,
    messageGroupServices: new Map(),
  });

  await api.initialize(0, {listen: false});

  const response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {
      nodeId: '550e8400-e29b-41d4-a716-446655440000',
      nodeAddress: 'ws://localhost:9090',
    },
  });

  t.equal(response.statusCode, 200, 'should return 200');
  const body = JSON.parse(response.body);

  t.equal(body.success, true, 'should return success');
  t.ok(body.systemTableSnapshots, 'should include systemTableSnapshots');
  t.ok(Array.isArray(body.systemTableSnapshots.node_endpoints),
    'node_endpoints should be an array in bootstrap response');
  t.equal(body.systemTableSnapshots.node_endpoints.length, 1,
    'should have 1 node endpoint in snapshot');
  t.equal(body.systemTableSnapshots.node_endpoints[0].endpoint_id, 'ep-seed-1',
    'should have correct endpoint_id in bootstrap response');
  t.equal(body.systemTableSnapshots.node_endpoints[0].transport_type, 'ws',
    'should have correct transport_type in bootstrap response');

  await api.shutdown();
});

test('BootstrapAPI - handleBootstrapRequest includes latency topology hints',
  async (t) => {
    initializeTestEnvironment();

    const mockCache = {
      get() {
        return null;
      },
      getAll(tableName) {
        if (tableName === TABLES.NODES) {
          return [{node_id: 'seed-node-1', node_address: 'ws://localhost:8080'}];
        }
        if (tableName === TABLES.PARTITIONS) {
          return [{
            partition_id: 'p1',
            table_name: 'nodes',
            leader_node_id: 'seed-node-1',
          }];
        }
        if (tableName === TABLES.SERVICES) {
          return [
            {
              service_id: 'partition-leader',
              service_type: SERVICE_TYPE.PARTITION,
              partition_id: 'p1',
              node_id: 'seed-node-1',
              address: 'seed-node-1/partition/partition-leader',
              raft_role: RAFT_ROLE.LEADER,
              status: SERVICE_STATUS.ACTIVE,
            },
            {
              service_id: 'message-group-leader',
              service_type: SERVICE_TYPE.MESSAGE_GROUP,
              group_id: 'mg1',
              node_id: 'seed-node-1',
              address: 'seed-node-1/message-group/message-group-leader',
              raft_role: RAFT_ROLE.LEADER,
              status: SERVICE_STATUS.ACTIVE,
            },
          ];
        }
        if (tableName === TABLES.TABLES) {
          return [{table_id: 't1', table_name: 'nodes'}];
        }
        if (tableName === TABLES.MESSAGE_GROUPS) {
          return [{group_id: 'mg1', leader_node_id: 'seed-node-1'}];
        }
        if (tableName === TABLES.LATENCY_GROUPS) {
          return [
            {group_id: 'g-1', representative_node_id: 'seed-node-1'},
            {group_id: 'g-2', representative_node_id: 'seed-node-2'},
          ];
        }
        if (tableName === TABLES.INTER_GROUP_LATENCIES) {
          return [
            {
              source_group_id: 'g-1',
              target_group_id: 'g-2',
              latency_ms: 42,
              sample_count: 3,
            },
          ];
        }
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

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'http://localhost:8080',
      wsPort: 9090,
      systemTableCache: mockCache,
      messageGroupServices: new Map(),
    });

    await api.initialize(0, {listen: false});

    const response = await api.getFastify().inject({
      method: 'POST',
      url: '/bootstrap',
      payload: {
        nodeId: '550e8400-e29b-41d4-a716-446655440123',
        nodeAddress: 'ws://localhost:9090',
      },
    });

    t.equal(response.statusCode, 200, 'should return 200');
    const body = JSON.parse(response.body);

    t.ok(body.latencyTopologyHints, 'should include latencyTopologyHints');
    t.equal(body.latencyTopologyHints.suggestedGroupId, null,
      'should include suggestedGroupId');
    t.equal(body.latencyTopologyHints.groupCount, 2,
      'should include latency group count');
    t.equal(body.latencyTopologyHints.interGroupEdgeCount, 1,
      'should include inter-group edge count');
    t.equal(body.latencyTopologyHints.propagationMode, 'safe',
      'should include configured propagation mode');
    t.ok(body.latencyTopologyHints.timestamp > 0,
      'should include topology hint timestamp');

    await api.shutdown();
  });
