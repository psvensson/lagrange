import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {
  BOOTSTRAP_API_ASSIGNMENT,
  BOOTSTRAP_API_CACHE_VISIBILITY,
  BOOTSTRAP_API_HANDOFF_PHASE,
  BOOTSTRAP_API_HANDOFF_STATUS,
  BOOTSTRAP_API_MOVE_REPLICA_ASSIGNMENT_ERROR,
  BOOTSTRAP_API_MOVE_REPLICA_ASSIGNMENT_HISTORY_PHASE as
  MOVE_REPLICA_ASSIGNMENT_HISTORY_PHASE,
  BOOTSTRAP_API_MOVE_REPLICA_ASSIGNMENT_INVALIDATION_REASON as
  MOVE_REPLICA_ASSIGNMENT_INVALIDATION_REASON,
} from '../../src/bootstrap/bootstrap-api-constants.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  STATE,
  TABLES,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  bootstrapMoveReplicaAssignment,
  buildRegisterPayload,
  configureSyntheticMoveReplicaRegisterServiceHandoff,
  createCdcIntegrationServiceFixture,
  initializeTestEnvironment,
} from './move-replica-assignment-token-test-helpers.js';

const MOVE_REPLICA_LONG_ASSIGNMENT_LEASE_MS = 60_000;
const MOVE_REPLICA_SHORT_ASSIGNMENT_LEASE_MS = 5;
const MOVE_REPLICA_SWEEP_INTERVAL_MS = 5;
const MOVE_REPLICA_SWEEP_WAIT_MS = 30;
const EXPIRED_LEASE_OFFSET_MS = 1;
const MISSING_SOURCE_ROW_JOINING_NODE_ID =
  '550e8400-e29b-41d4-a716-446655440335';
const MISSING_LOCAL_SOURCE_JOINING_NODE_ID =
  '550e8400-e29b-41d4-a716-446655440339';
const STALE_SOURCE_READY_LEASE_JOINING_NODE_ID =
  '550e8400-e29b-41d4-a716-44665544033a';
const SOURCE_OWNER_STALE_READY_LEASE_JOINING_NODE_ID =
  '550e8400-e29b-41d4-a716-446655440344';
const STALE_CACHE_SOURCE_OWNER_JOINING_NODE_ID =
  '550e8400-e29b-41d4-a716-44665544033b';
const STALE_CACHE_SOURCE_OWNER_NODE_ID =
  '550e8400-e29b-41d4-a716-44665544033c';
const ADMISSION_OWNER_TRUTH_JOINING_NODE_ID =
  '550e8400-e29b-41d4-a716-446655440347';
const SWEEP_OWNER_DRIFT_JOINING_NODE_ID =
  '550e8400-e29b-41d4-a716-44665544033d';
const SWEEP_OWNER_DRIFT_NODE_ID =
  '550e8400-e29b-41d4-a716-44665544033e';
const TARGET_ADOPTION_VISIBILITY_JOINING_NODE_ID =
  '550e8400-e29b-41d4-a716-44665544033f';
const SOURCE_VISIBILITY_FALLBACK_JOINING_NODE_ID =
  '550e8400-e29b-41d4-a716-446655440340';
const CAN_REVIVE_SUPPLIED_NOW_JOINING_NODE_ID =
  '550e8400-e29b-41d4-a716-446655440341';
const EXPIRED_BOOTSTRAP_ADMISSION_JOINING_NODE_ID =
  '550e8400-e29b-41d4-a716-446655440342';
const EXPIRED_BOOTSTRAP_ADMISSION_SECOND_NODE_ID =
  '550e8400-e29b-41d4-a716-446655440343';
const EXPIRED_BOOTSTRAP_ADMISSION_SECOND_NODE_ADDRESS =
  'ws://localhost:9135';
const EXPIRED_TARGET_PROGRESS_JOINING_NODE_ID =
  '550e8400-e29b-41d4-a716-446655440345';
const EXPIRED_TARGET_PROGRESS_SECOND_NODE_ID =
  '550e8400-e29b-41d4-a716-446655440346';
const EXPIRED_TARGET_PROGRESS_SECOND_NODE_ADDRESS =
  'ws://localhost:9136';
const AUTHORITATIVE_TARGET_READY_JOINING_NODE_ID =
  '550e8400-e29b-41d4-a716-446655440348';
const AUTHORITATIVE_TARGET_READY_SECOND_NODE_ID =
  '550e8400-e29b-41d4-a716-446655440349';
const AUTHORITATIVE_TARGET_READY_SECOND_NODE_ADDRESS =
  'ws://localhost:9137';
const BOOTSTRAP_TEST_ROUTE = '/bootstrap';
const SUCCESS_HTTP_STATUS_CODE = 200;
const CAN_REVIVE_SUPPLIED_NOW_MS = 1_000_000;
const CAN_REVIVE_READY_LEASE_OFFSET_MS = 1_000;
const CAN_REVIVE_HEARTBEAT_OFFSET_MS = 2_000;
const CAN_REVIVE_WALL_CLOCK_OFFSET_MS = 5_000;
const EXPLICITLY_CLEARED_READY_LEASE_EXPIRES_AT = null;
const REMOTE_SOURCE_SWEEP_ASSIGNMENT_ID =
  '550e8400-e29b-41d4-a716-446655440336';
const REMOTE_SOURCE_SWEEP_SOURCE_NODE_ID =
  '550e8400-e29b-41d4-a716-446655440337';
const REMOTE_SOURCE_SWEEP_TARGET_NODE_ID =
  '550e8400-e29b-41d4-a716-446655440338';
const REMOTE_SOURCE_SWEEP_GROUP_ID = 'mg-remote-source-sweep';
const REMOTE_SOURCE_SWEEP_REPLICA_ID = 'mg-remote-source-sweep-r1';
const REMOTE_SOURCE_SWEEP_NODE_ADDRESS = 'ws://localhost:8080';

test('BootstrapAPI register-service emits retryable cache visibility timeout response',
  async (t) => {
    initializeTestEnvironment();
    const rows = {
      services: [],
      nodes: [],
      partitions: [],
      tables: [],
      message_groups: [],
      replica_operations: [],
      indices: [],
      config: [],
      logs: [],
      live_queries: [],
      contexts: [],
      code: [],
      node_endpoints: [],
    };
    const systemTableCache = {
      getAll(tableName) {
        return rows[tableName] || [];
      },
      get(_tableName, _id) {
        return null;
      },
      filter(tableName, predicate) {
        return (rows[tableName] || []).filter(predicate);
      },
      getReadyNodes() {
        return ['seed-node-1'];
      },
    };

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache,
      messageGroupServices: new Map(),
      cdcIntegrationService: createCdcIntegrationServiceFixture(rows),
    });
    await api.initialize(0, {listen: false});
    api.setSqlQueryEngine({
      async executeQuery() {
        return {success: true, rows: []};
      },
    });
    const assignmentId = configureSyntheticMoveReplicaRegisterServiceHandoff(
      api,
      {
        service_id: 'mg-2-r1',
        node_id: '550e8400-e29b-41d4-a716-446655440324',
        replica_id: 'mg-2-r1',
      },
    );
    t.teardown(async () => {
      await api.shutdown();
    });

    const originalDateNow = Date.now;
    let fakeNow = 0;
    Date.now = () => {
      fakeNow += 10000;
      return fakeNow;
    };
    t.teardown(() => {
      Date.now = originalDateNow;
    });

    const response = await api.getFastify().inject({
      method: 'POST',
      url: '/register-service',
      payload: {
        service_id: 'mg-2-r1',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        node_id: '550e8400-e29b-41d4-a716-446655440324',
        group_id: 'mg-2',
        replica_id: 'mg-2-r1',
        assignment_id: assignmentId,
        raft_role: RAFT_ROLE.FOLLOWER,
        status: SERVICE_STATUS.ACTIVE,
        address: '550e8400-e29b-41d4-a716-446655440324/message-group/mg-2-r1',
      },
    });

    t.equal(
      response.statusCode,
      503,
      'register-service cache visibility timeout should be retryable',
    );
    const responseBody = response.json();
    t.equal(
      responseBody.code,
      'SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT',
      'response should expose stable retryable timeout code',
    );
    t.equal(
      responseBody.details?.lastVisibilityCheck?.reason,
      BOOTSTRAP_API_CACHE_VISIBILITY.REASON_SERVICE_ROW_MISSING,
      'timeout diagnostics should report missing services row visibility state',
    );
    t.same(
      responseBody.details?.lastVisibilityCheck?.mismatchFields,
      [],
      'timeout diagnostics should report no mismatches when row is absent',
    );
  });

test('BootstrapAPI register-service remains retryable when storage is visible but cache is stale',
  async (t) => {
    initializeTestEnvironment();
    const rows = {
      services: [],
      nodes: [],
      partitions: [],
      tables: [],
      message_groups: [],
      replica_operations: [],
      indices: [],
      config: [],
      logs: [],
      live_queries: [],
      contexts: [],
      code: [],
      node_endpoints: [],
    };
    const systemTableCache = {
      getAll(tableName) {
        return rows[tableName] || [];
      },
      get(_tableName, _id) {
        return null;
      },
      filter(tableName, predicate) {
        return (rows[tableName] || []).filter(predicate);
      },
      getReadyNodes() {
        return ['seed-node-1'];
      },
    };

    const expectedServiceRow = {
      service_id: 'mg-2-r1',
      service_type: SERVICE_TYPE.MESSAGE_GROUP,
      node_id: '550e8400-e29b-41d4-a716-446655440324',
      group_id: 'mg-2',
      replica_id: 'mg-2-r1',
      raft_role: RAFT_ROLE.FOLLOWER,
      status: SERVICE_STATUS.ACTIVE,
      address: '550e8400-e29b-41d4-a716-446655440324/message-group/mg-2-r1',
    };

    let storageVisibilityLookups = 0;
    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache,
      messageGroupServices: new Map(),
      cdcIntegrationService: createCdcIntegrationServiceFixture(rows),
    });
    await api.initialize(0, {listen: false});
    const assignmentId = configureSyntheticMoveReplicaRegisterServiceHandoff(
      api,
      expectedServiceRow,
    );
    api.setSqlQueryEngine({
      async executeQuery(sql) {
        if (sql.includes('INSERT OR REPLACE INTO services')) {
          return {success: true, rows: []};
        }
        if (sql.includes('FROM services') && sql.includes('WHERE service_id = ?')) {
          storageVisibilityLookups += 1;
          return {success: true, rows: [expectedServiceRow]};
        }
        return {success: true, rows: []};
      },
    });
    t.teardown(async () => {
      await api.shutdown();
    });

    const response = await api.getFastify().inject({
      method: 'POST',
      url: '/register-service',
      payload: {
        service_id: expectedServiceRow.service_id,
        service_type: expectedServiceRow.service_type,
        node_id: expectedServiceRow.node_id,
        group_id: expectedServiceRow.group_id,
        replica_id: expectedServiceRow.replica_id,
        assignment_id: assignmentId,
        raft_role: expectedServiceRow.raft_role,
        status: expectedServiceRow.status,
        address: expectedServiceRow.address,
      },
    });

    t.equal(
      response.statusCode,
      503,
      'register-service should remain retryable until the services cache reflects the row',
    );
    const responseBody = response.json();
    t.equal(responseBody.code, 'SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT');
    t.equal(
      responseBody.details?.lastVisibilityCheck?.reason,
      BOOTSTRAP_API_CACHE_VISIBILITY.REASON_STORAGE_ROW_VISIBLE_CACHE_STALE,
      'diagnostics should report storage-visible but cache-stale visibility',
    );
    t.ok(
      storageVisibilityLookups > 0,
      'register-service should check authoritative storage visibility',
    );
  });

test('BootstrapAPI register-service repairs cache-visible hole from authoritative storage',
  async (t) => {
    initializeTestEnvironment();
    const rows = {
      services: [],
      nodes: [],
      partitions: [],
      tables: [],
      message_groups: [],
      replica_operations: [],
      indices: [],
      config: [],
      logs: [],
      live_queries: [],
      contexts: [],
      code: [],
      node_endpoints: [],
    };
    const systemTableCache = {
      getAll(tableName) {
        return rows[tableName] || [];
      },
      get(tableName, id) {
        return (rows[tableName] || []).find((row) => row.service_id === id) || null;
      },
      filter(tableName, predicate) {
        return (rows[tableName] || []).filter(predicate);
      },
      getReadyNodes() {
        return ['seed-node-1'];
      },
      applySystemTableChange(tableName, _operation, data) {
        const tableRows = rows[tableName] || [];
        const key = data?.service_id || null;
        if (!key) {
          return;
        }
        const index = tableRows.findIndex((row) => row.service_id === key);
        if (index === -1) {
          tableRows.push({...data});
        } else {
          tableRows[index] = {
            ...tableRows[index],
            ...data,
          };
        }
      },
    };

    const expectedServiceRow = {
      service_id: 'mg-2-r1',
      service_type: SERVICE_TYPE.MESSAGE_GROUP,
      node_id: '550e8400-e29b-41d4-a716-446655440324',
      group_id: 'mg-2',
      replica_id: 'mg-2-r1',
      raft_role: RAFT_ROLE.FOLLOWER,
      status: SERVICE_STATUS.ACTIVE,
      address: '550e8400-e29b-41d4-a716-446655440324/message-group/mg-2-r1',
    };

    let storageVisibilityLookups = 0;
    let repairAttempts = 0;
    const cdcIntegrationService = createCdcIntegrationServiceFixture(rows, {
      persistMutations: false,
      async repairCacheVisibilityHole(tableName, key, expectPresent, expectedFields) {
        repairAttempts += 1;
        t.equal(tableName, 'services', 'repair should target the services table');
        t.equal(key, expectedServiceRow.service_id, 'repair should target the registered service');
        t.equal(expectPresent, true, 'repair should expect the services row to exist');
        t.same(
          Object.keys(expectedFields).sort(),
          [
            'address',
            'group_id',
            'node_id',
            'replica_id',
            'service_id',
            'service_type',
            'status',
          ],
          'repair should only require the service visibility fields, not timestamp equality',
        );
        systemTableCache.applySystemTableChange(tableName, 'UPSERT', {
          ...expectedFields,
          ...expectedServiceRow,
          created_at: 1234,
          updated_at: 5678,
        });
        return true;
      },
    });

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache,
      messageGroupServices: new Map(),
      cdcIntegrationService,
    });
    await api.initialize(0, {listen: false});
    const assignmentId = configureSyntheticMoveReplicaRegisterServiceHandoff(
      api,
      expectedServiceRow,
    );
    api.setSqlQueryEngine({
      async executeQuery(sql) {
        if (sql.includes('INSERT OR REPLACE INTO services')) {
          return {success: true, rows: []};
        }
        if (sql.includes('FROM services') && sql.includes('WHERE service_id = ?')) {
          storageVisibilityLookups += 1;
          return {success: true, rows: [expectedServiceRow]};
        }
        return {success: true, rows: []};
      },
    });
    t.teardown(async () => {
      await api.shutdown();
    });

    const response = await api.getFastify().inject({
      method: 'POST',
      url: '/register-service',
      payload: {
        service_id: expectedServiceRow.service_id,
        service_type: expectedServiceRow.service_type,
        node_id: expectedServiceRow.node_id,
        group_id: expectedServiceRow.group_id,
        replica_id: expectedServiceRow.replica_id,
        assignment_id: assignmentId,
        raft_role: expectedServiceRow.raft_role,
        status: expectedServiceRow.status,
        address: expectedServiceRow.address,
      },
    });

    t.equal(response.statusCode, 200,
      'register-service should succeed once authoritative repair closes the cache hole');
    t.ok(storageVisibilityLookups > 0,
      'register-service should still verify authoritative storage visibility');
    t.equal(repairAttempts, 1,
      'register-service should use the canonical authoritative repair helper');
  });

test('BootstrapAPI register-service preserves MOVE_REPLICA assignment after retryable cache visibility timeout',
  async (t) => {
    const fixture = await bootstrapMoveReplicaAssignment(t, {
      joiningNodeId: '550e8400-e29b-41d4-a716-4466554403aa',
    });
    const {api, assignment, joiningNodeId, rows} = fixture;
    const originalWaitForVisibility =
      api.waitForRegisteredServiceCacheVisibility.bind(api);
    let visibilityAttempts = 0;

    api.waitForRegisteredServiceCacheVisibility = async (expectedService) => {
      visibilityAttempts += 1;
      if (visibilityAttempts === 1) {
        const error = new Error(
          'Timed out waiting for services cache visibility for retry test',
        );
        error.statusCode = 503;
        error.errorCode = 'SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT';
        error.retryAfterMs = 10;
        error.details = {
          serviceId: expectedService?.service_id || null,
          nodeId: expectedService?.node_id || null,
          lastVisibilityCheck: {
            reason:
              BOOTSTRAP_API_CACHE_VISIBILITY
                .REASON_STORAGE_ROW_VISIBLE_CACHE_STALE,
          },
        };
        throw error;
      }
      return originalWaitForVisibility(expectedService);
    };

    const firstResponse = await api.getFastify().inject({
      method: 'POST',
      url: '/register-service',
      payload: buildRegisterPayload(joiningNodeId, assignment, {
        assignment_id: assignment.assignmentId,
      }),
    });

    t.equal(
      firstResponse.statusCode,
      503,
      'first register-service attempt should remain retryable',
    );
    t.equal(
      firstResponse.json().code,
      'SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT',
      'retryable timeout should surface the stable timeout code',
    );

    const reservationRowAfterRetryableFailure = rows.replica_operations.find((row) =>
      row.operation_id === assignment.assignmentId,
    );
    t.equal(
      reservationRowAfterRetryableFailure?.status,
      'syncing',
      'retryable target-visibility timeout must keep the assignment reservation active',
    );

    const secondResponse = await api.getFastify().inject({
      method: 'POST',
      url: '/register-service',
      payload: buildRegisterPayload(joiningNodeId, assignment, {
        assignment_id: assignment.assignmentId,
      }),
    });

    t.equal(
      secondResponse.statusCode,
      200,
      'same assignment token should still be accepted after a retryable timeout',
    );
  });

test('BootstrapAPI register-service preserves MOVE_REPLICA assignment after retryable participant failure',
  async (t) => {
    // After the gateway-resilience fix, handoff durable-write failures
    // are best-effort: the in-memory reservation is authoritative and
    // the registration succeeds even when updateMoveReplicaHandoffOperation
    // throws.  Per doctrine §5: slower under pressure, never less correct.
    // Boundary: metadata mutation ingress under load.
    const fixture = await bootstrapMoveReplicaAssignment(t, {
      joiningNodeId: '550e8400-e29b-41d4-a716-4466554403ab',
    });
    const {api, assignment, joiningNodeId} = fixture;
    const originalUpdateHandoffOperation =
      api.updateMoveReplicaHandoffOperation.bind(api);
    let updateAttempts = 0;

    api.updateMoveReplicaHandoffOperation = async (handoffContext) => {
      updateAttempts += 1;
      if (updateAttempts === 1) {
        const error = new Error(
          'Distributed operation failed due to participant failures',
        );
        error.statusCode = 503;
        error.errorCode = 'DISTRIBUTED_PARTICIPANT_FAILURE';
        error.retryAfterMs = 1000;
        error.details = {
          tableName: 'replica_operations',
        };
        throw error;
      }
      return originalUpdateHandoffOperation(handoffContext);
    };

    const firstResponse = await api.getFastify().inject({
      method: 'POST',
      url: '/register-service',
      payload: buildRegisterPayload(joiningNodeId, assignment, {
        assignment_id: assignment.assignmentId,
      }),
    });

    t.equal(
      firstResponse.statusCode,
      200,
      'register-service succeeds even when handoff durable write throws ' +
      '(in-memory reservation is authoritative under pressure)',
    );
  });

test('BootstrapAPI bootstrap preserves MOVE_REPLICA assignment after retryable reservation persistence failure',
  async (t) => {
    let insertAttempts = 0;
    const fixture = await bootstrapMoveReplicaAssignment(t, {
      joiningNodeId: '550e8400-e29b-41d4-a716-4466554403ac',
      configureApi: async ({api}) => {
        const originalExecute =
          api.executeBootstrapControlPlaneMutation.bind(api);
        api.executeBootstrapControlPlaneMutation = async (
          mutation,
          options = {},
        ) => {
          if (mutation?.operation === 'insert' &&
              mutation?.tableName === 'replica_operations') {
            insertAttempts += 1;
            return {
              success: false,
              error: 'Distributed operation failed due to participant failures',
              errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
              retryAfterMs: 1000,
              tableName: 'replica_operations',
            };
          }
          return originalExecute(mutation, options);
        };
      },
    });
    const {api, assignment, joiningNodeId, rows} = fixture;

    t.equal(
      insertAttempts,
      1,
      'bootstrap should attempt to persist exactly one assignment reservation row',
    );
    t.notOk(
      rows.replica_operations.find((row) => row.operation_id === assignment.assignmentId),
      'retryable reservation persistence failure should not invent a durable row',
    );
    t.ok(
      api.moveReplicaAssignmentReservations.has(assignment.assignmentId),
      'in-memory reservation should remain authoritative under retryable write pressure',
    );

    const competingBootstrap = await api.getFastify().inject({
      method: 'POST',
      url: '/bootstrap',
      payload: {
        nodeId: '550e8400-e29b-41d4-a716-4466554403ad',
        nodeAddress: 'ws://localhost:9133',
      },
    });
    t.equal(
      competingBootstrap.statusCode,
      200,
      'bootstrap should admit unrelated joiners while the in-memory reservation is open',
    );
    t.not(
      competingBootstrap.json().messageGroupAssignment?.replicaToMove,
      assignment.replicaToMove,
      'competing bootstrap should not allocate the reserved replica',
    );

    const registerResponse = await api.getFastify().inject({
      method: 'POST',
      url: '/register-service',
      payload: buildRegisterPayload(joiningNodeId, assignment, {
        assignment_id: assignment.assignmentId,
      }),
    });
    t.equal(
      registerResponse.statusCode,
      200,
      'register-service should accept the assignment token after retryable reservation write failure',
    );
  });

test('BootstrapAPI bootstrap admission excludes cached MOVE_REPLICA reservations without replica_operations SQL rereads',
  async (t) => {
    const fixture = await bootstrapMoveReplicaAssignment(t, {
      joiningNodeId: '550e8400-e29b-41d4-a716-4466554403ae',
    });
    const {api, assignment} = fixture;
    const originalExecute =
      api.executeBootstrapControlPlaneQuery.bind(api);
    let reservationSelectCount = 0;

    api.executeBootstrapControlPlaneQuery = async (sql, params = []) => {
      if (String(sql).includes('FROM replica_operations') &&
          String(sql).includes('WHERE type = ?')) {
        reservationSelectCount += 1;
      }
      return originalExecute(sql, params);
    };

    const competingBootstrap = await api.getFastify().inject({
      method: 'POST',
      url: '/bootstrap',
      payload: {
        nodeId: '550e8400-e29b-41d4-a716-4466554403af',
        nodeAddress: 'ws://localhost:9134',
      },
    });

    t.equal(
      competingBootstrap.statusCode,
      200,
      'competing bootstrap should proceed while excluding the reservation',
    );
    t.not(
      competingBootstrap.json().messageGroupAssignment?.replicaToMove,
      assignment.replicaToMove,
      'bootstrap should not allocate a competing message group assignment',
    );
    t.equal(
      reservationSelectCount,
      0,
      'bootstrap admission should reuse cache/in-memory reservation summary before falling back to SQL',
    );
  });

test('BootstrapAPI bootstrap admission resumes after expired MOVE_REPLICA reservation lease',
  async (t) => {
    const fixture = await bootstrapMoveReplicaAssignment(t, {
      joiningNodeId: EXPIRED_BOOTSTRAP_ADMISSION_JOINING_NODE_ID,
      assignmentLeaseMs: MOVE_REPLICA_SHORT_ASSIGNMENT_LEASE_MS,
    });
    const {api, assignment} = fixture;

    await new Promise((resolve) =>
      setTimeout(resolve, MOVE_REPLICA_SWEEP_WAIT_MS),
    );

    const expiredReservation =
      api.moveReplicaAssignmentReservations.get(assignment.assignmentId);
    t.equal(
      api.isMoveReplicaAssignmentReservationOpen(expiredReservation),
      false,
      'expired MOVE_REPLICA reservation should not keep bootstrap admission closed',
    );

    const competingBootstrap = await api.getFastify().inject({
      method: 'POST',
      url: '/bootstrap',
      payload: {
        nodeId: EXPIRED_BOOTSTRAP_ADMISSION_SECOND_NODE_ID,
        nodeAddress: EXPIRED_BOOTSTRAP_ADMISSION_SECOND_NODE_ADDRESS,
      },
    });

    t.equal(
      competingBootstrap.statusCode,
      200,
      'bootstrap should admit the next joiner after the old assignment lease expires',
    );
    t.not(
      competingBootstrap.json().messageGroupAssignment?.assignmentId,
      assignment.assignmentId,
      'new bootstrap admission should allocate a fresh assignment lease',
    );
  });

test('BootstrapAPI bootstrap admission excludes expired MOVE_REPLICA while target remains connected',
  async (t) => {
    const fixture = await bootstrapMoveReplicaAssignment(t, {
      joiningNodeId: EXPIRED_TARGET_PROGRESS_JOINING_NODE_ID,
      assignmentLeaseMs: MOVE_REPLICA_SHORT_ASSIGNMENT_LEASE_MS,
    });
    const {api, assignment, joiningNodeId, rows} = fixture;

    rows.nodes.push({
      node_id: joiningNodeId,
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.CONNECTED,
      last_heartbeat: Date.now(),
      ready_lease_expires_at: EXPLICITLY_CLEARED_READY_LEASE_EXPIRES_AT,
    });

    await new Promise((resolve) =>
      setTimeout(resolve, MOVE_REPLICA_SWEEP_WAIT_MS),
    );

    const expiredReservation =
      api.moveReplicaAssignmentReservations.get(assignment.assignmentId);
    t.equal(
      api.isMoveReplicaAssignmentReservationOpen(expiredReservation),
      false,
      'expired MOVE_REPLICA reservation should not report open after lease expiry',
    );
    t.equal(
      api.isMoveReplicaBootstrapAdmissionBlocked(expiredReservation),
      true,
      'connected original target should keep expired MOVE_REPLICA handoff excluded',
    );
    t.equal(
      api.isMoveReplicaBootstrapAdmissionGloballyBlocked(expiredReservation),
      false,
      'target progress should not block unrelated bootstrap admission globally',
    );

    const competingBootstrap = await api.getFastify().inject({
      method: 'POST',
      url: '/bootstrap',
      payload: {
        nodeId: EXPIRED_TARGET_PROGRESS_SECOND_NODE_ID,
        nodeAddress: EXPIRED_TARGET_PROGRESS_SECOND_NODE_ADDRESS,
      },
    });

    t.equal(
      competingBootstrap.statusCode,
      200,
      'bootstrap should admit unrelated joiners while the expired target remains connected',
    );
    t.not(
      competingBootstrap.json().messageGroupAssignment?.replicaToMove,
      assignment.replicaToMove,
      'bootstrap should not allocate a duplicate replica assignment',
    );
  });

test('BootstrapAPI blocking admission refreshes stale in-memory ' +
  'MOVE_REPLICA reservation from durable terminal row when cache visibility is missing',
async (t) => {
  const fixture = await bootstrapMoveReplicaAssignment(t, {
    joiningNodeId: '550e8400-e29b-41d4-a716-4466554403b9',
  });
  const {api, assignment, rows} = fixture;
  const reservationRow = rows.replica_operations.find((row) =>
    row.operation_id === assignment.assignmentId,
  );
  t.ok(reservationRow, 'fixture should persist MOVE_REPLICA reservation row');

  const staleReservation = api.moveReplicaAssignmentReservations.get(
    assignment.assignmentId,
  );
  t.equal(
    staleReservation?.status,
    BOOTSTRAP_API_HANDOFF_STATUS.PREPARING,
    'fixture should keep the original in-memory reservation open',
  );

  const terminalUpdatedAt = Date.now();
  reservationRow.status = BOOTSTRAP_API_HANDOFF_STATUS.FAILED;
  reservationRow.workflow_step = WORKFLOW_STEP.FAILED;
  reservationRow.updated_at = terminalUpdatedAt;
  reservationRow.completed_at = terminalUpdatedAt;
  reservationRow.error_message =
    BOOTSTRAP_API_MOVE_REPLICA_ASSIGNMENT_ERROR.SOURCE_OWNER_UNAVAILABLE;

  const systemTableCache = api.getSystemTableCache();
  const originalFilter = systemTableCache.filter.bind(systemTableCache);
  systemTableCache.filter = (tableName, predicate) => {
    if (tableName === 'replica_operations') {
      return [];
    }
    return originalFilter(tableName, predicate);
  };

  const originalExecute =
    api.executeBootstrapControlPlaneQuery.bind(api);
  let reservationSelectCount = 0;
  api.executeBootstrapControlPlaneQuery = async (sql, params = []) => {
    if (String(sql).includes('FROM replica_operations') &&
        String(sql).includes('WHERE type = ?')) {
      reservationSelectCount += 1;
    }
    return originalExecute(sql, params);
  };

  const blockingReservations =
    await api.getBlockingMoveReplicaBootstrapAdmissions();

  t.equal(
    reservationSelectCount,
    1,
    'collector should refresh from durable replica_operations when cache visibility is missing',
  );
  t.equal(
    blockingReservations.length,
    0,
    'durable failed reservation should clear the stale in-memory bootstrap blocker',
  );
  t.equal(
    api.moveReplicaAssignmentReservations.get(assignment.assignmentId)?.status,
    BOOTSTRAP_API_HANDOFF_STATUS.FAILED,
    'durable terminal status should replace the stale local reservation snapshot',
  );
});

test('BootstrapAPI MOVE_REPLICA reservation SQL fallback backs off after retryable lookup pressure',
  async (t) => {
    const fixture = await bootstrapMoveReplicaAssignment(t, {
      joiningNodeId: '550e8400-e29b-41d4-a716-4466554403b0',
    });
    const {api, assignment, rows} = fixture;
    const cachedReservation =
      api.moveReplicaAssignmentReservations.get(assignment.assignmentId);
    api.moveReplicaAssignmentReservations.delete(assignment.assignmentId);
    rows.replica_operations = [];

    const originalExecute =
      api.executeBootstrapControlPlaneQuery.bind(api);
    let reservationSelectCount = 0;
    api.executeBootstrapControlPlaneQuery = async (sql, params = []) => {
      if (String(sql).includes('FROM replica_operations') &&
          String(sql).includes('WHERE type = ?')) {
        reservationSelectCount += 1;
        return {
          success: false,
          error: 'Distributed operation failed due to participant failures',
          errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
          retryAfterMs: 1000,
          tableName: 'replica_operations',
        };
      }
      return originalExecute(sql, params);
    };

    const firstBlocking =
      await api.getBlockingMoveReplicaBootstrapAdmissions();
    const secondBlocking =
      await api.getBlockingMoveReplicaBootstrapAdmissions();

    t.equal(
      reservationSelectCount,
      1,
      'retryable reservation summary lookup should back off instead of hammering SQL',
    );
    t.same(
      firstBlocking,
      secondBlocking,
      'bounded fallback should return the same locally-known result during backoff',
    );
    t.equal(
      firstBlocking.length,
      0,
      'without cache or durable row visibility the bounded fallback should fail closed to no synthetic reservations',
    );

    api.moveReplicaAssignmentReservations.set(
      assignment.assignmentId,
      cachedReservation,
    );
  });

test('BootstrapAPI register-service timeout diagnostics include mismatch fields', async (t) => {
  initializeTestEnvironment();
  const rows = {
    services: [],
    nodes: [],
    partitions: [],
    tables: [],
    message_groups: [],
    replica_operations: [],
    indices: [],
    config: [],
    logs: [],
    live_queries: [],
    contexts: [],
    code: [],
    node_endpoints: [],
  };
  const staleCacheRow = {
    service_id: 'mg-2-r1',
    service_type: SERVICE_TYPE.MESSAGE_GROUP,
    node_id: 'seed-node-1',
    group_id: 'mg-2',
    replica_id: 'mg-2-r1',
    raft_role: RAFT_ROLE.FOLLOWER,
    status: SERVICE_STATUS.STOPPED,
    address: 'seed-node-1/message-group/mg-2-r1',
    created_at: 100,
    updated_at: 100,
  };
  const systemTableCache = {
    getAll(tableName) {
      return rows[tableName] || [];
    },
    get(tableName, id) {
      if (tableName !== 'services') {
        return null;
      }
      if (id !== staleCacheRow.service_id) {
        return null;
      }
      return staleCacheRow;
    },
    filter(tableName, predicate) {
      return (rows[tableName] || []).filter(predicate);
    },
    getReadyNodes() {
      return ['seed-node-1'];
    },
  };

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache,
    messageGroupServices: new Map(),
    cdcIntegrationService: createCdcIntegrationServiceFixture(rows),
  });
  await api.initialize(0, {listen: false});
  api.setSqlQueryEngine({
    async executeQuery() {
      return {success: true, rows: []};
    },
  });
  const assignmentId = configureSyntheticMoveReplicaRegisterServiceHandoff(
    api,
    {
      service_id: 'mg-2-r1',
      node_id: '550e8400-e29b-41d4-a716-446655440324',
      replica_id: 'mg-2-r1',
    },
  );
  t.teardown(async () => {
    await api.shutdown();
  });

  const originalDateNow = Date.now;
  let fakeNow = 0;
  Date.now = () => {
    fakeNow += 10000;
    return fakeNow;
  };
  t.teardown(() => {
    Date.now = originalDateNow;
  });

  const response = await api.getFastify().inject({
    method: 'POST',
    url: '/register-service',
    payload: {
      service_id: 'mg-2-r1',
      service_type: SERVICE_TYPE.MESSAGE_GROUP,
      node_id: '550e8400-e29b-41d4-a716-446655440324',
      group_id: 'mg-2',
      replica_id: 'mg-2-r1',
      assignment_id: assignmentId,
      raft_role: RAFT_ROLE.FOLLOWER,
      status: SERVICE_STATUS.ACTIVE,
      address: '550e8400-e29b-41d4-a716-446655440324/message-group/mg-2-r1',
    },
  });

  t.equal(response.statusCode, 503, 'cache mismatch timeout should remain retryable');
  const responseBody = response.json();
  t.equal(
    responseBody.details?.lastVisibilityCheck?.reason,
    BOOTSTRAP_API_CACHE_VISIBILITY.REASON_FIELD_MISMATCH,
    'timeout diagnostics should classify stale row mismatch',
  );
  t.ok(
    responseBody.details?.lastVisibilityCheck?.mismatchFields.includes('node_id'),
    'timeout diagnostics should surface node_id mismatch',
  );
  t.equal(
    responseBody.details?.lastVisibilityCheck?.observed?.node_id,
    'seed-node-1',
    'timeout diagnostics should include observed stale owner',
  );
});

test('BootstrapAPI sweep must not invalidate reservation when source ' +
  'replica is present locally but cache row is missing (CDC delay under load)',
async (t) => {
  // Regression: under load, CDC propagation delay can cause the
  // system cache to lack the service row for the source replica.
  // The sweep must not terminate the reservation when the source
  // replica is still present locally in messageGroupServices.
  // Boundary: bootstrap-to-runtime handoff / CDC dissemination.
  const fixture = await bootstrapMoveReplicaAssignment(t, {
    joiningNodeId: '550e8400-e29b-41d4-a716-446655440350',
    assignmentLeaseMs: 60_000,
  });
  const {api, assignment, rows} = fixture;

  // Simulate CDC delay: remove the source replica's service row
  // from the cache fixture so the cache returns null for it.
  const replicaToMove = assignment.replicaToMove;
  const sourceIndex = rows.services.findIndex((row) =>
    row.service_id === replicaToMove,
  );
  t.ok(sourceIndex >= 0, 'fixture should include source replica service row');
  rows.services.splice(sourceIndex, 1);

  // The source replica IS still present locally on the seed.
  t.ok(
    api.messageGroupServices.has(replicaToMove),
    'source replica should still be present locally in messageGroupServices',
  );

  // Run the expiry sweep — this should NOT invalidate the reservation.
  await api.expireMoveReplicaAssignmentReservations();

  const reservationRow = rows.replica_operations.find((row) =>
    row.operation_id === assignment.assignmentId,
  );
  t.equal(
    reservationRow?.status,
    'creating',
    'sweep must not terminate reservation when source replica is locally present',
  );

  // The reservation should still be usable for register-service.
  const response = await api.getFastify().inject({
    method: 'POST',
    url: '/register-service',
    payload: buildRegisterPayload(
      fixture.joiningNodeId,
      assignment,
      {assignment_id: assignment.assignmentId},
    ),
  });
  t.equal(
    response.statusCode,
    200,
    'register-service should succeed after sweep preserves locally-present reservation',
  );
});

test('register-service succeeds when renewal SQL write throws ' +
  'DISTRIBUTED_PARTICIPANT_FAILURE (uses in-memory reservation under pressure)',
async (t) => {
  // Regression: under load, the control-plane gateway throws
  // DISTRIBUTED_PARTICIPANT_FAILURE during the lease renewal write
  // in validateMoveReplicaAssignmentToken.  The renewal is a
  // best-effort lease extension; the in-memory reservation is
  // already valid.  Per doctrine §5 the validation must succeed
  // (slower under pressure, never less correct).
  // Boundary: metadata mutation ingress under load.
  const fixture = await bootstrapMoveReplicaAssignment(t, {
    joiningNodeId: '550e8400-e29b-41d4-a716-446655440360',
    assignmentLeaseMs: 60_000,
  });
  const {api, assignment, joiningNodeId} = fixture;

  // Force the gateway to throw on any SQL write, simulating
  // DISTRIBUTED_PARTICIPANT_FAILURE under load.
  const gateway = api.getControlPlaneSystemTableGateway();
  t.ok(gateway, 'gateway should exist after bootstrap');
  const originalExecuteQuery = gateway.executeQuery.bind(gateway);
  gateway.executeQuery = async (sql, params, options) => {
    if (String(sql).includes('UPDATE replica_operations SET')) {
      throw new Error(
        'Distributed operation failed due to participant failures',
      );
    }
    return originalExecuteQuery(sql, params, options);
  };

  const response = await api.getFastify().inject({
    method: 'POST',
    url: '/register-service',
    payload: buildRegisterPayload(
      joiningNodeId,
      assignment,
      {assignment_id: assignment.assignmentId},
    ),
  });
  t.equal(
    response.statusCode,
    200,
    'register-service must succeed even when renewal write throws ' +
    '(in-memory reservation is authoritative)',
  );
});
