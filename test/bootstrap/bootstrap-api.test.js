/**
 * Tests for Bootstrap API.
 * Requirements: 1.2, 7.2, 7.3, 7.4
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI, BootstrapStrategy} from '../../src/bootstrap/bootstrap-api.js';
import {
  registerBootstrapApiReadinessTests,
} from './bootstrap-api-readiness-test-cases.js';
import {
  createEmptySystemTableCache,
  initializeTestEnvironment,
} from './bootstrap-api-test-fixtures.js';
import {
  BOOTSTRAP_API_ASSIGNMENT,
  BOOTSTRAP_API_LOG_MSG,
  BOOTSTRAP_API_READINESS_FIELD,
  BOOTSTRAP_API_RESPONSE_FIELD,
  BOOTSTRAP_API_ROUTE,
} from '../../src/bootstrap/bootstrap-api-constants.js';
import {
  SERVICE_REGISTRATION_HANDOFF_ACKNOWLEDGEMENT,
  SERVICE_REGISTRATION_HANDOFF_FIELD,
  SERVICE_REGISTRATION_HANDOFF_NEXT_ACTION,
  SERVICE_REGISTRATION_HANDOFF_OUTCOME,
  SERVICE_REGISTRATION_HANDOFF_OWNER,
  SERVICE_REGISTRATION_HANDOFF_REASON,
} from '../../src/bootstrap/owners/service-registration-handoff-owner.js';
import {
  configureSyntheticMoveReplicaRegisterServiceHandoff,
} from './move-replica-assignment-token-test-helpers.js';
import {
  BOOTSTRAP_PHASE,
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from '../../src/bootstrap/bootstrap-constants.js';
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
  OWNER_OUTCOME_FRESHNESS,
  OWNER_OUTCOME_STATE,
} from '../../src/control-plane/owner-outcome-contract.js';
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
const TEST_CONTROL_PLANE_PRESSURE_DEGRADED_CODE =
  'CONTROL_PLANE_PRESSURE_DEGRADED';
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
            errorCode: TEST_CONTROL_PLANE_PRESSURE_DEGRADED_CODE,
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
    t.equal(body.code, TEST_CONTROL_PLANE_PRESSURE_DEGRADED_CODE,
      'register-service should propagate the typed gateway error code');
    t.equal(body.retryAfterMs, 250,
      'register-service should expose the retry hint from the gateway');
    t.equal(
      body.error,
      'Distributed operation failed due to participant failures',
      'register-service should preserve the canonical failure message',
    );
    t.match(
      body[SERVICE_REGISTRATION_HANDOFF_FIELD.CONTRACT],
      {
        producerOwnerOutcome: {
          owner: SERVICE_REGISTRATION_HANDOFF_OWNER.PRODUCER,
          boundary: SERVICE_REGISTRATION_HANDOFF_OWNER.PRODUCER_BOUNDARY,
          state: OWNER_OUTCOME_STATE.DEFERRED,
          outcome: SERVICE_REGISTRATION_HANDOFF_OUTCOME.DEFERRED,
          reasonCodes: [TEST_CONTROL_PLANE_PRESSURE_DEGRADED_CODE],
          nextAction:
            SERVICE_REGISTRATION_HANDOFF_NEXT_ACTION
              .RETRY_SERVICE_REGISTRATION,
          freshness: OWNER_OUTCOME_FRESHNESS.STALE,
          retryAfterMs: 250,
          terminal: false,
        },
        consumerPrecondition: {
          consumerOwner: SERVICE_REGISTRATION_HANDOFF_OWNER.CONSUMER,
          consumerBoundary:
            SERVICE_REGISTRATION_HANDOFF_OWNER.CONSUMER_BOUNDARY,
          handoffRequired: false,
        },
        acknowledgementRule: {
          serviceRowAcknowledged: false,
          acknowledgementSatisfied: false,
        },
        retryDeferBehavior: {
          retryable: true,
          deferConsumer: true,
        },
        terminalCondition: {
          terminal: false,
          terminalState: OWNER_OUTCOME_STATE.DEFERRED,
        },
      },
      'deferred register-service should surface the producer-consumer handoff contract',
    );
    t.ok(
      body[SERVICE_REGISTRATION_HANDOFF_FIELD.CONTRACT]
        .diagnosticVocabulary.reasonCode.includes(
          SERVICE_REGISTRATION_HANDOFF_REASON
            .SERVICE_REGISTRATION_FAILED,
        ),
      'deferred register-service contract should include canonical reason diagnostics',
    );
    t.match(
      body[SERVICE_REGISTRATION_HANDOFF_FIELD.CONTRACT].producerOwnerOutcome,
      {
        reasonCodes: [TEST_CONTROL_PLANE_PRESSURE_DEGRADED_CODE],
      },
      'deferred register-service contract should retain the typed producer reason',
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
    t.match(
      body,
      {
        success: false,
        error: TEST_SQL_ENGINE_UNAVAILABLE_ERROR,
        code: BOOTSTRAP_PIPELINE_ERROR_CODE.SQL_ENGINE_UNAVAILABLE,
        retryAfterMs: TEST_REGISTER_SERVICE_RETRY_AFTER_MS,
      },
      'register-service should expose a typed retryable startup dependency response',
    );
    t.match(
      body[SERVICE_REGISTRATION_HANDOFF_FIELD.CONTRACT],
      {
        producerOwnerOutcome: {
          owner: SERVICE_REGISTRATION_HANDOFF_OWNER.PRODUCER,
          boundary: SERVICE_REGISTRATION_HANDOFF_OWNER.PRODUCER_BOUNDARY,
          state: OWNER_OUTCOME_STATE.DEFERRED,
          outcome: SERVICE_REGISTRATION_HANDOFF_OUTCOME.DEFERRED,
          reasonCodes: [
            SERVICE_REGISTRATION_HANDOFF_REASON.SQL_ENGINE_UNAVAILABLE,
          ],
          nextAction:
            SERVICE_REGISTRATION_HANDOFF_NEXT_ACTION
              .RETRY_SERVICE_REGISTRATION,
          freshness: OWNER_OUTCOME_FRESHNESS.STALE,
          retryAfterMs: TEST_REGISTER_SERVICE_RETRY_AFTER_MS,
          terminal: false,
        },
        freshnessRevisionRequirement: {
          requiredFreshness: OWNER_OUTCOME_FRESHNESS.FRESH,
          observedFreshness: OWNER_OUTCOME_FRESHNESS.STALE,
          visibilityRequired: false,
          visibilitySatisfied: true,
          requirementSatisfied: false,
        },
        retryDeferBehavior: {
          retryable: true,
          deferConsumer: true,
        },
      },
      'SQL unavailable should return the explicit retryable handoff contract',
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
              errorCode: TEST_CONTROL_PLANE_PRESSURE_DEGRADED_CODE,
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
  const assignmentId = configureSyntheticMoveReplicaRegisterServiceHandoff(
    api,
    {
      service_id: 'mg-1-r1',
      node_id: 'joiner-node-1',
      replica_id: 'mg-1-r1',
    },
  );

  const response = await api.getFastify().inject({
    method: 'POST',
    url: '/register-service',
    payload: {
      service_id: 'mg-1-r1',
      service_type: SERVICE_TYPE.MESSAGE_GROUP,
      node_id: 'joiner-node-1',
      group_id: 'mg-1',
      replica_id: 'mg-1-r1',
      [BOOTSTRAP_API_ASSIGNMENT.FIELD_ID]: assignmentId,
      status: SERVICE_STATUS.STOPPED,
    },
  });

  t.equal(response.statusCode, 200,
    'register-service should not fail just because the bootstrap seed has not wired CDC mutations yet');
  const responseBody = JSON.parse(response.body);
  t.match(
    responseBody[SERVICE_REGISTRATION_HANDOFF_FIELD.CONTRACT],
    {
      producerOwnerOutcome: {
        owner: SERVICE_REGISTRATION_HANDOFF_OWNER.PRODUCER,
        boundary: SERVICE_REGISTRATION_HANDOFF_OWNER.PRODUCER_BOUNDARY,
        state: OWNER_OUTCOME_STATE.READY,
        outcome: SERVICE_REGISTRATION_HANDOFF_OUTCOME.COMMITTED,
        reasonCodes: [
          SERVICE_REGISTRATION_HANDOFF_REASON.SERVICE_REGISTERED,
        ],
        nextAction: SERVICE_REGISTRATION_HANDOFF_NEXT_ACTION.PROCEED,
        freshness: OWNER_OUTCOME_FRESHNESS.FRESH,
        terminal: false,
      },
      consumerPrecondition: {
        consumerOwner: SERVICE_REGISTRATION_HANDOFF_OWNER.CONSUMER,
        consumerBoundary: SERVICE_REGISTRATION_HANDOFF_OWNER.CONSUMER_BOUNDARY,
        handoffRequired: true,
      },
      freshnessRevisionRequirement: {
        requiredFreshness: OWNER_OUTCOME_FRESHNESS.FRESH,
        observedFreshness: OWNER_OUTCOME_FRESHNESS.FRESH,
        visibilityRequired: true,
        visibilitySatisfied: true,
        requirementSatisfied: true,
      },
      acknowledgementRule: {
        serviceRowAcknowledged: true,
        cacheVisibilityAcknowledgement:
          SERVICE_REGISTRATION_HANDOFF_ACKNOWLEDGEMENT.ACKNOWLEDGED,
        sourceRemovalAcknowledgement:
          SERVICE_REGISTRATION_HANDOFF_ACKNOWLEDGEMENT.ACKNOWLEDGED,
        handoffCompletionAcknowledgement:
          SERVICE_REGISTRATION_HANDOFF_ACKNOWLEDGEMENT.ACKNOWLEDGED,
        acknowledgementSatisfied: true,
      },
      retryDeferBehavior: {
        retryable: false,
        deferConsumer: false,
      },
      terminalCondition: {
        terminal: false,
        terminalState: OWNER_OUTCOME_STATE.READY,
      },
    },
    'completed MOVE_REPLICA service registration should expose the fulfilled handoff contract',
  );
  t.ok(
    responseBody[SERVICE_REGISTRATION_HANDOFF_FIELD.CONTRACT]
      .diagnosticVocabulary.nextAction.includes(
        SERVICE_REGISTRATION_HANDOFF_NEXT_ACTION.PROCEED,
      ),
    'fulfilled register-service contract should include next-action diagnostics',
  );
  t.equal(sqlCalls.length, 1,
    'bootstrap register-service should route through the SQL fallback once');
  t.match(
    sqlCalls[0].sql,
    /^INSERT OR REPLACE INTO services \(/,
    'register-service should persist through the canonical services table',
  );
  t.notMatch(
    sqlCalls[0].sql,
    new RegExp(BOOTSTRAP_API_ASSIGNMENT.FIELD_ID),
    'register-service SQL fallback should exclude assignment token metadata',
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
    api.bootstrapTopologySnapshotOwner.cacheAuthoritativeSystemTableSnapshotRows(
      TABLES.SERVICES,
      cacheData[TABLES.SERVICES],
    );
    api.bootstrapTopologySnapshotOwner.cacheAuthoritativeSystemTableSnapshotRows(
      TABLES.MESSAGE_GROUPS,
      cacheData[TABLES.MESSAGE_GROUPS],
    );
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

registerBootstrapApiReadinessTests();
