/**
 * Tests for Bootstrap API.
 * Requirements: 1.2, 7.2, 7.3, 7.4
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI, BootstrapStrategy} from '../../src/bootstrap/bootstrap-api.js';
import {
  BOOTSTRAP_API_LOG_MSG,
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
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {BootstrapReadinessState} from '../../src/bootstrap/bootstrap-readiness-state.js';
import {
  LIFECYCLE_LEGACY_STATE,
  LIFECYCLE_PHASE,
  LIFECYCLE_REASON,
} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {STARTUP_JOIN_MODE} from '../../src/bootstrap/rejoin-hints-constants.js';
import {
  STARTUP_RECOVERY_STAGE,
  StartupRecoveryCoordinator,
} from '../../src/bootstrap/startup-recovery-coordinator.js';
import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../../src/control-plane/control-plane-workload-profile.js';
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
const TEST_REGISTER_SERVICE_RETRY_AFTER_MS = 1000;
const TEST_SQL_ENGINE_UNAVAILABLE_ERROR = 'SQL query engine not available';
const TEST_REGISTER_SERVICE_NODE_ID = 'joiner-node-1';
const TEST_REGISTER_SERVICE_GROUP_ID = 'mg-1';
const TEST_REGISTER_SERVICE_REPLICA_ID = 'mg-1-r1';
const TEST_DURABLE_REJOIN_GROUP_ID = 'mg-durable';
const TEST_DURABLE_REJOIN_REPLICA_ID = 'mg-durable-r1';
const TEST_DURABLE_REJOIN_PEER_REPLICA_ID = 'mg-durable-r2';
const TEST_DURABLE_REJOIN_SECOND_PEER_REPLICA_ID = 'mg-durable-r3';
const TEST_DURABLE_REJOIN_PEER_NODE_ID = 'peer-node-1';
const TEST_DURABLE_REJOIN_SECOND_PEER_NODE_ID = 'peer-node-2';
const TEST_DURABLE_REJOIN_MESSAGE_GROUP_ADDRESS =
  'joiner-node-1/message-group/mg-durable-r1';
const TEST_DURABLE_REJOIN_PEER_MESSAGE_GROUP_ADDRESS =
  'peer-node-1/message-group/mg-durable-r2';
const TEST_DURABLE_REJOIN_SECOND_PEER_MESSAGE_GROUP_ADDRESS =
  'peer-node-2/message-group/mg-durable-r3';
const TEST_DURABLE_REJOIN_SERVICES_PARTITION_ID = 'services-p1';
const TEST_DURABLE_REJOIN_SERVICES_REPLICA_ID = 'services-p1-r1';
const TEST_DURABLE_REJOIN_LOCAL_READ_FAILURE =
  'durable rejoin assignment should not query local authoritative partitions';
const TEST_DURABLE_REJOIN_LOCAL_READ_COUNT_NONE = 0;
const TEST_DURABLE_REJOIN_BOUNDED_ASSIGNMENT_ASSERTION =
  'durable rejoin assignment should use bounded published/cache topology rows';
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
    t.equal(
      capturedOptions.workloadClass,
      CONTROL_PLANE_WORKLOAD_CLASS.BOOTSTRAP_CONTROL_PLANE_READ,
      'bootstrap gateway queries should use the shared bootstrap read workload class',
    );
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
    t.equal(capturedOptions.routingReadinessDimension, 'controlPlaneRecoveryEligible',
      'bootstrap gateway queries should use recovery eligibility routing semantics');
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
    t.equal(
      capturedOptions.workloadClass,
      CONTROL_PLANE_WORKLOAD_CLASS.BOOTSTRAP_CONTROL_PLANE_MUTATION,
      'bootstrap gateway mutations should use the shared bootstrap mutation workload class',
    );
    t.equal(capturedOptions.deliveryPriority, 'critical',
      'bootstrap gateway mutations should still use critical delivery');
    t.equal(capturedOptions.allowPressureDefer, true,
      'bootstrap gateway mutations should defer under pressure');
    t.equal(capturedOptions.allowPressureDegrade, false,
      'bootstrap gateway mutations should not silently degrade');
    t.equal(capturedOptions.pressureRetryAfterMs, 375,
      'bootstrap gateway mutations should propagate retry hints');
    t.equal(capturedOptions.routingReadinessDimension, 'controlPlaneRecoveryEligible',
      'bootstrap gateway mutations should use recovery eligibility routing semantics');
  });

test('BootstrapAPI - bootstrap control-plane mutations use runtime-owner CDC when present',
  async (t) => {
    initializeTestEnvironment();

    let capturedRow = null;
    const cdcIntegrationService = {
      async upsertSystemTableRow(tableName, row) {
        capturedRow = {tableName, row};
        return {success: true, outcome: 'applied-via-runtime-owner'};
      },
    };
    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: createEmptySystemTableCache(),
      runtimeOwner: {
        get cdcIntegrationService() {
          return cdcIntegrationService;
        },
      },
    });

    const result = await api.executeBootstrapControlPlaneMutation({
      operation: 'upsert',
      tableName: TABLES.SERVICES,
      row: {
        service_id: 'svc-runtime-owner',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        node_id: 'seed-node-1',
      },
    });

    t.match(result, {
      success: true,
      outcome: 'applied-via-runtime-owner',
      completionState: 'applied',
      contractState: 'ready',
      nextAction: 'proceed',
    },
    'runtime-owner CDC should satisfy bootstrap mutation ingress');
    t.same(capturedRow, {
      tableName: TABLES.SERVICES,
      row: {
        service_id: 'svc-runtime-owner',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        node_id: 'seed-node-1',
      },
    }, 'default gateway should route mutations through runtime-owner CDC');
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
        service_id: TEST_REGISTER_SERVICE_REPLICA_ID,
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        node_id: TEST_REGISTER_SERVICE_NODE_ID,
        group_id: TEST_REGISTER_SERVICE_GROUP_ID,
        replica_id: TEST_REGISTER_SERVICE_REPLICA_ID,
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

test('BootstrapAPI - register-service returns typed retryable 503 while SQL engine is unavailable',
  async (t) => {
    initializeTestEnvironment();

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: createEmptySystemTableCache(),
      sqlQueryEngine: null,
      runtimeOwner: {
        getSqlQueryEngine() {
          return null;
        },
      },
    });

    await api.initialize(0, {listen: false});

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

    t.equal(
      response.statusCode,
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      'register-service should fail closed while startup SQL runtime is not wired',
    );
    const body = JSON.parse(response.body);
    t.same(
      body,
      {
        success: false,
        error: TEST_SQL_ENGINE_UNAVAILABLE_ERROR,
        code: BOOTSTRAP_PIPELINE_ERROR_CODE.SQL_ENGINE_UNAVAILABLE,
        retryAfterMs: TEST_REGISTER_SERVICE_RETRY_AFTER_MS,
      },
      'register-service should expose a typed retryable startup dependency response',
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

test('BootstrapAPI - register-service falls back to bootstrap-scoped SQL ' +
  'mutation routing when CDC mutation helpers are not ready yet',
async (t) => {
  initializeTestEnvironment();

  const sqlCalls = [];
  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: createEmptySystemTableCache(),
    sqlQueryEngine: {
      async executeQuery(sql, params, options) {
        sqlCalls.push({sql, params, options});
        return {success: true, affectedRows: 1};
      },
    },
    cdcIntegrationService: null,
  });

  await api.initialize(0, {listen: false});
  api.waitForRegisteredServiceCacheVisibility = async () => {};

  const response = await api.getFastify().inject({
    method: 'POST',
    url: '/register-service',
    payload: {
      service_id: 'mg-1-r1',
      service_type: SERVICE_TYPE.MESSAGE_GROUP,
      node_id: 'joiner-node-1',
      group_id: 'mg-1',
      replica_id: 'mg-1-r1',
      status: SERVICE_STATUS.STOPPED,
    },
  });

  t.equal(response.statusCode, 200,
    'register-service should not fail just because the bootstrap seed has not wired CDC mutations yet');
  t.equal(sqlCalls.length, 1,
    'bootstrap register-service should route through the SQL fallback once');
  t.match(
    sqlCalls[0].sql,
    /^INSERT OR REPLACE INTO services \(/,
    'register-service should persist through the canonical services table',
  );
  t.equal(
    sqlCalls[0].options.phaseScope,
    'bootstrap',
    'bootstrap writes should opt into the explicit startup fallback scope',
  );
  t.equal(
    sqlCalls[0].options.skipCacheWait,
    true,
    'bootstrap SQL fallback should rely on the later visibility gate instead of inline cache waits',
  );

  await api.shutdown();
});

test('BootstrapAPI - register-service reuses runtime owner SQL engine ' +
  'when bootstrap wiring has not attached one yet',
async (t) => {
  initializeTestEnvironment();

  const submittedMutations = [];
  const runtimeOwnerSqlQueryEngine = {
    async executeQuery() {
      return {success: true, affectedRows: 1};
    },
  };
  const api = new BootstrapAPI({
    seedNodeId: 'joiner-node-1',
    seedNodeAddress: 'ws://localhost:8081',
    systemTableCache: createEmptySystemTableCache(),
    sqlQueryEngine: null,
    cdcIntegrationService: null,
    runtimeOwner: {
      getSqlQueryEngine() {
        return runtimeOwnerSqlQueryEngine;
      },
    },
    controlPlaneSystemTableGateway: {
      async submitMutation(mutation) {
        submittedMutations.push(mutation);
        return {success: true, affectedRows: 1};
      },
    },
  });

  await api.initialize(0, {listen: false});
  api.waitForRegisteredServiceCacheVisibility = async () => {};

  const response = await api.getFastify().inject({
    method: 'POST',
    url: '/register-service',
    payload: {
      service_id: 'mg-1-r1',
      service_type: SERVICE_TYPE.MESSAGE_GROUP,
      node_id: 'joiner-node-1',
      group_id: 'mg-1',
      replica_id: 'mg-1-r1',
      status: SERVICE_STATUS.ACTIVE,
      address: 'joiner-node-1/message-group/mg-1-r1',
    },
  });

  t.equal(response.statusCode, 200,
    'register-service should succeed when the runtime owner already exposes the SQL engine');
  t.equal(submittedMutations.length, 1,
    'register-service should continue into canonical mutation ingress once the runtime owner exposes the engine');
  t.equal(
    submittedMutations[0].tableName,
    TABLES.SERVICES,
    'runtime owner SQL fallback should preserve the canonical services-table target',
  );

  await api.shutdown();
});

test('BootstrapAPI - register-service acknowledges plain self-hosted registration without waiting for cache visibility',
  async (t) => {
    initializeTestEnvironment();

    let visibilityChecks = 0;
    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: createEmptySystemTableCache(),
      sqlQueryEngine: {
        async executeQuery() {
          return {success: true, rows: []};
        },
      },
      cdcIntegrationService: null,
    });

    await api.initialize(0, {listen: false});
    api.waitForRegisteredServiceCacheVisibility = async () => {
      visibilityChecks += 1;
      throw new Error('plain self-hosted register-service should not wait for cache visibility');
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
        status: SERVICE_STATUS.ACTIVE,
        address: 'joiner-node-1/message-group/mg-1-r1',
      },
    });

    t.equal(response.statusCode, 200,
      'plain self-hosted register-service should return as soon as the durable write succeeds');
    t.equal(visibilityChecks, 0,
      'plain self-hosted register-service should skip the cache visibility gate');

    await api.shutdown();
  });

test('BootstrapAPI - durable rejoin reuses existing message group without assignment reservation sweep',
  async (t) => {
    initializeTestEnvironment();

    const cacheData = {
      [TABLES.PARTITIONS]: [
        {
          partition_id: TEST_DURABLE_REJOIN_SERVICES_PARTITION_ID,
          table_id: TABLES.SERVICES,
          table_name: TABLES.SERVICES,
        },
      ],
      [TABLES.SERVICES]: [
        {
          service_id: TEST_DURABLE_REJOIN_REPLICA_ID,
          service_type: SERVICE_TYPE.MESSAGE_GROUP,
          node_id: TEST_REGISTER_SERVICE_NODE_ID,
          group_id: TEST_DURABLE_REJOIN_GROUP_ID,
          replica_id: TEST_DURABLE_REJOIN_REPLICA_ID,
          address: TEST_DURABLE_REJOIN_MESSAGE_GROUP_ADDRESS,
          status: SERVICE_STATUS.ACTIVE,
        },
        {
          service_id: TEST_DURABLE_REJOIN_PEER_REPLICA_ID,
          service_type: SERVICE_TYPE.MESSAGE_GROUP,
          node_id: TEST_DURABLE_REJOIN_PEER_NODE_ID,
          group_id: TEST_DURABLE_REJOIN_GROUP_ID,
          replica_id: TEST_DURABLE_REJOIN_PEER_REPLICA_ID,
          address: TEST_DURABLE_REJOIN_PEER_MESSAGE_GROUP_ADDRESS,
          status: SERVICE_STATUS.ACTIVE,
        },
        {
          service_id: TEST_DURABLE_REJOIN_SECOND_PEER_REPLICA_ID,
          service_type: SERVICE_TYPE.MESSAGE_GROUP,
          node_id: TEST_DURABLE_REJOIN_SECOND_PEER_NODE_ID,
          group_id: TEST_DURABLE_REJOIN_GROUP_ID,
          replica_id: TEST_DURABLE_REJOIN_SECOND_PEER_REPLICA_ID,
          address: TEST_DURABLE_REJOIN_SECOND_PEER_MESSAGE_GROUP_ADDRESS,
          status: SERVICE_STATUS.ACTIVE,
        },
      ],
      [TABLES.MESSAGE_GROUPS]: [],
    };
    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: {
        get() {
          return null;
        },
        getAll(tableName) {
          return cacheData[tableName] || [];
        },
        filter(tableName, predicate) {
          return (cacheData[tableName] || []).filter(predicate);
        },
      },
    });

    await api.initialize(0, {listen: false});
    let reservationSweepCalled = false;
    let localAuthoritativeReadCount = 0;
    api.partitionServices = new Map([
      [
        TEST_DURABLE_REJOIN_SERVICES_REPLICA_ID,
        {
          partitionId: TEST_DURABLE_REJOIN_SERVICES_PARTITION_ID,
          initialized: true,
          replicaId: TEST_DURABLE_REJOIN_SERVICES_REPLICA_ID,
          db: {
            prepare() {
              localAuthoritativeReadCount++;
              throw new Error(TEST_DURABLE_REJOIN_LOCAL_READ_FAILURE);
            },
          },
        },
      ],
    ]);
    api.expireMoveReplicaAssignmentReservations = async () => {
      reservationSweepCalled = true;
      throw new Error('durable rejoin should not sweep move-replica reservations');
    };

    const assignment = await api.determineAndReserveMessageGroupAssignment(
      TEST_REGISTER_SERVICE_NODE_ID,
      {startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN},
    );

    t.equal(
      assignment.reuseExistingGroup,
      true,
      'durable rejoin should reuse its known message group',
    );
    t.equal(
      assignment.groupId,
      TEST_DURABLE_REJOIN_GROUP_ID,
      'durable rejoin should return the existing group assignment',
    );
    t.same(
      assignment.startupReplicaIds,
      [TEST_DURABLE_REJOIN_REPLICA_ID],
      'durable rejoin should preserve the local startup replica IDs',
    );
    t.equal(
      reservationSweepCalled,
      false,
      'durable rejoin should bypass move-replica reservation sweep when reuse is known',
    );
    t.equal(
      localAuthoritativeReadCount,
      TEST_DURABLE_REJOIN_LOCAL_READ_COUNT_NONE,
      TEST_DURABLE_REJOIN_BOUNDED_ASSIGNMENT_ASSERTION,
    );

    await api.shutdown();
  });

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
