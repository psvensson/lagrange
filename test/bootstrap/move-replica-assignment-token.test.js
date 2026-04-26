import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {
  BOOTSTRAP_API_CACHE_VISIBILITY,
  BOOTSTRAP_API_HANDOFF_PHASE,
  BOOTSTRAP_API_HANDOFF_STATUS,
  BOOTSTRAP_API_MOVE_REPLICA_ASSIGNMENT_ERROR,
  BOOTSTRAP_API_MOVE_REPLICA_ASSIGNMENT_HISTORY_PHASE as
  MOVE_REPLICA_ASSIGNMENT_HISTORY_PHASE,
} from '../../src/bootstrap/bootstrap-api-constants.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  STATE,
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

test('BootstrapAPI register-service rejects missing and unknown assignment token', async (t) => {
  const fixture = await bootstrapMoveReplicaAssignment(t);
  const {api, assignment, joiningNodeId} = fixture;

  const missingTokenResponse = await api.getFastify().inject({
    method: 'POST',
    url: '/register-service',
    payload: buildRegisterPayload(joiningNodeId, assignment),
  });
  t.equal(
    missingTokenResponse.statusCode,
    400,
    'register-service should fail closed when assignment token is missing',
  );
  t.equal(
    missingTokenResponse.json().code,
    'ASSIGNMENT_TOKEN_REQUIRED',
    'missing token rejection should emit stable reason code',
  );

  const unknownTokenResponse = await api.getFastify().inject({
    method: 'POST',
    url: '/register-service',
    payload: buildRegisterPayload(joiningNodeId, assignment, {
      assignment_id: '00000000-0000-0000-0000-000000000000',
    }),
  });
  t.equal(
    unknownTokenResponse.statusCode,
    409,
    'register-service should fail closed for unknown assignment token',
  );
  t.equal(
    unknownTokenResponse.json().code,
    'ASSIGNMENT_TOKEN_UNKNOWN',
    'unknown token rejection should emit stable reason code',
  );
});

test('BootstrapAPI register-service rejects mismatched assignment token and revives matching expired reservation', async (t) => {
  const mismatchFixture = await bootstrapMoveReplicaAssignment(t, {
    joiningNodeId: '550e8400-e29b-41d4-a716-446655440322',
  });
  const mismatchResponse = await mismatchFixture.api.getFastify().inject({
    method: 'POST',
    url: '/register-service',
    payload: buildRegisterPayload(
      '550e8400-e29b-41d4-a716-446655440399',
      mismatchFixture.assignment,
      {assignment_id: mismatchFixture.assignment.assignmentId},
    ),
  });
  t.equal(
    mismatchResponse.statusCode,
    409,
    'register-service should fail closed when token node ownership mismatches',
  );
  t.equal(
    mismatchResponse.json().code,
    'ASSIGNMENT_TOKEN_MISMATCH',
    'ownership mismatch should emit stable reason code',
  );

  const revivedFixture = await bootstrapMoveReplicaAssignment(t, {
    joiningNodeId: '550e8400-e29b-41d4-a716-446655440323',
    assignmentLeaseMs: 5,
  });
  await new Promise((resolve) => setTimeout(resolve, 25));
  const revivedResponse = await revivedFixture.api.getFastify().inject({
    method: 'POST',
    url: '/register-service',
    payload: buildRegisterPayload(
      revivedFixture.joiningNodeId,
      revivedFixture.assignment,
      {assignment_id: revivedFixture.assignment.assignmentId},
    ),
  });
  t.equal(
    revivedResponse.statusCode,
    200,
    'register-service should revive the reserved handoff when source ownership still matches',
  );
});

test('BootstrapAPI register-service renews near-expiry reservation before it expires',
  async (t) => {
    const fixture = await bootstrapMoveReplicaAssignment(t, {
      joiningNodeId: '550e8400-e29b-41d4-a716-446655440398',
      assignmentLeaseMs: 40,
    });
    const {api, assignment, joiningNodeId, rows} = fixture;

    const reservationRowBefore = rows.replica_operations.find((row) =>
      row.operation_id === assignment.assignmentId,
    );
    t.ok(reservationRowBefore, 'fixture should persist replica operation reservation');

    const nearExpiry = Date.now() + 5;
    reservationRowBefore.completed_at = nearExpiry;
    reservationRowBefore.updated_at = Date.now();
    const cachedReservation = api.moveReplicaAssignmentReservations.get(
      assignment.assignmentId,
    );
    cachedReservation.leaseExpiresAt = nearExpiry;
    cachedReservation.updatedAt = Date.now();

    const response = await api.getFastify().inject({
      method: 'POST',
      url: '/register-service',
      payload: buildRegisterPayload(joiningNodeId, assignment, {
        assignment_id: assignment.assignmentId,
      }),
    });
    t.equal(
      response.statusCode,
      200,
      'register-service should renew an active reservation before expiry under slow handoff progress',
    );

    const reservationRowAfter = rows.replica_operations.find((row) =>
      row.operation_id === assignment.assignmentId,
    );
    const stepsHistory = JSON.parse(reservationRowAfter?.steps_history || '[]');
    const validatedStep = stepsHistory.find((step) =>
      step.phase === MOVE_REPLICA_ASSIGNMENT_HISTORY_PHASE.VALIDATED,
    );
    t.ok(
      Number(validatedStep?.leaseExpiresAt) > nearExpiry,
      'renewal should persist a later lease expiry in replica_operations history',
    );
    const renewedReservation = api.moveReplicaAssignmentReservations.get(
      assignment.assignmentId,
    );
    t.equal(
      renewedReservation?.status,
      BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED,
      'successful register-service should advance the reservation into committed state',
    );
    t.equal(
      stepsHistory.at(-1)?.phase,
      BOOTSTRAP_API_HANDOFF_PHASE.COMMIT_METADATA,
      'successful handoff should continue from lease validation into metadata commit',
    );
  });

test('BootstrapAPI register-service still rejects expired reservation after source ownership drift', async (t) => {
  const expiredFixture = await bootstrapMoveReplicaAssignment(t, {
    joiningNodeId: '550e8400-e29b-41d4-a716-446655440324',
    assignmentLeaseMs: 5,
  });

  const sourceReplica = expiredFixture.rows.services.find((row) =>
    row.service_id === expiredFixture.assignment.replicaToMove,
  );
  sourceReplica.node_id = 'unexpected-owner-node';

  await new Promise((resolve) => setTimeout(resolve, 25));
  const expiredResponse = await expiredFixture.api.getFastify().inject({
    method: 'POST',
    url: '/register-service',
    payload: buildRegisterPayload(
      expiredFixture.joiningNodeId,
      expiredFixture.assignment,
      {assignment_id: expiredFixture.assignment.assignmentId},
    ),
  });
  t.equal(
    expiredResponse.statusCode,
    409,
    'register-service should fail closed when the expired reservation no longer matches source ownership',
  );
  t.equal(
    expiredResponse.json().code,
    'ASSIGNMENT_TOKEN_EXPIRED',
    'expired reservation rejection should emit stable reason code',
  );
});

test('BootstrapAPI preserves MOVE_REPLICA reservation after source readiness loss until lease expiry',
  async (t) => {
    const fixture = await bootstrapMoveReplicaAssignment(t, {
      joiningNodeId: '550e8400-e29b-41d4-a716-446655440327',
      assignmentLeaseMs: MOVE_REPLICA_LONG_ASSIGNMENT_LEASE_MS,
    });

    const sourceNode = fixture.rows.nodes.find((row) =>
      row.node_id === fixture.assignment.sourceNodeId,
    );
    t.ok(sourceNode, 'fixture should include source node readiness row');

    sourceNode.ready_lease_expires_at = Date.now() - EXPIRED_LEASE_OFFSET_MS;
    sourceNode.connection_state = STATE.DISCONNECTED;

    await fixture.api.expireMoveReplicaAssignmentReservations();

    const reservationRow = fixture.rows.replica_operations.find((row) =>
      row.operation_id === fixture.assignment.assignmentId,
    );
    t.equal(
      reservationRow?.status,
      BOOTSTRAP_API_HANDOFF_STATUS.PREPARING,
      'reservation should stay open while its assignment lease is still active',
    );
    t.equal(
      reservationRow?.workflow_step,
      WORKFLOW_STEP.PENDING,
      'reservation should remain pending while source visibility can still recover',
    );

    const expiredAt = Date.now() - EXPIRED_LEASE_OFFSET_MS;
    reservationRow.lease_expires_at = expiredAt;
    reservationRow.completed_at = expiredAt;
    const cachedReservation = fixture.api.moveReplicaAssignmentReservations.get(
      fixture.assignment.assignmentId,
    );
    cachedReservation.leaseExpiresAt = expiredAt;
    cachedReservation.updatedAt = expiredAt;

    await fixture.api.expireMoveReplicaAssignmentReservations();

    t.equal(
      reservationRow?.status,
      BOOTSTRAP_API_HANDOFF_STATUS.FAILED,
      'reservation should fail after the assignment lease expires without source readiness',
    );
    t.equal(
      reservationRow?.workflow_step,
      WORKFLOW_STEP.FAILED,
      'reservation should persist FAILED workflow step after lease-expired source loss',
    );
    t.equal(
      reservationRow?.error_message,
      BOOTSTRAP_API_MOVE_REPLICA_ASSIGNMENT_ERROR.SOURCE_OWNER_UNAVAILABLE,
      'reservation failure should preserve the source-owner invalidation reason',
    );
  });

test('BootstrapAPI background sweep clears stranded MOVE_REPLICA reservation without a follow-up bootstrap request',
  async (t) => {
    const fixture = await bootstrapMoveReplicaAssignment(t, {
      joiningNodeId: '550e8400-e29b-41d4-a716-446655440328',
      assignmentLeaseMs: MOVE_REPLICA_SHORT_ASSIGNMENT_LEASE_MS,
      assignmentSweepIntervalMs: MOVE_REPLICA_SWEEP_INTERVAL_MS,
      ownsMoveReplicaAssignmentLifecycle: true,
    });

    const sourceNode = fixture.rows.nodes.find((row) =>
      row.node_id === fixture.assignment.sourceNodeId,
    );
    t.ok(sourceNode, 'fixture should include source node readiness row');

    sourceNode.ready_lease_expires_at = Date.now() - EXPIRED_LEASE_OFFSET_MS;
    sourceNode.connection_state = STATE.DISCONNECTED;

    await new Promise((resolve) =>
      setTimeout(resolve, MOVE_REPLICA_SWEEP_WAIT_MS),
    );

    const reservationRow = fixture.rows.replica_operations.find((row) =>
      row.operation_id === fixture.assignment.assignmentId,
    );
    t.equal(
      reservationRow?.status,
      BOOTSTRAP_API_HANDOFF_STATUS.FAILED,
      'background sweep should fail stranded reservation after source readiness loss and lease expiry',
    );
  });

test('BootstrapAPI background sweep preserves expired but revivable MOVE_REPLICA reservation',
  async (t) => {
    const fixture = await bootstrapMoveReplicaAssignment(t, {
      joiningNodeId: '550e8400-e29b-41d4-a716-446655440329',
      assignmentLeaseMs: MOVE_REPLICA_SHORT_ASSIGNMENT_LEASE_MS,
      assignmentSweepIntervalMs: MOVE_REPLICA_SWEEP_INTERVAL_MS,
      ownsMoveReplicaAssignmentLifecycle: true,
    });

    await new Promise((resolve) =>
      setTimeout(resolve, MOVE_REPLICA_SWEEP_WAIT_MS),
    );

    const reservationRow = fixture.rows.replica_operations.find((row) =>
      row.operation_id === fixture.assignment.assignmentId,
    );
    t.equal(
      reservationRow?.status,
      BOOTSTRAP_API_HANDOFF_STATUS.PREPARING,
      'background sweep should not terminalize a merely expired reservation',
    );

    const revivedResponse = await fixture.api.getFastify().inject({
      method: 'POST',
      url: '/register-service',
      payload: buildRegisterPayload(
        fixture.joiningNodeId,
        fixture.assignment,
        {assignment_id: fixture.assignment.assignmentId},
      ),
    });
    t.equal(
      revivedResponse.statusCode,
      200,
      'expired reservation should still be revivable after background sweep',
    );
  });

test('BootstrapAPI defers subsequent bootstrap while an expired non-terminal MOVE_REPLICA reservation remains open',
  async (t) => {
    const fixture = await bootstrapMoveReplicaAssignment(t, {
      joiningNodeId: '550e8400-e29b-41d4-a716-446655440332',
      assignmentLeaseMs: MOVE_REPLICA_SHORT_ASSIGNMENT_LEASE_MS,
      assignmentSweepIntervalMs: MOVE_REPLICA_SWEEP_INTERVAL_MS,
      ownsMoveReplicaAssignmentLifecycle: true,
    });

    await new Promise((resolve) =>
      setTimeout(resolve, MOVE_REPLICA_SWEEP_WAIT_MS),
    );

    const secondBootstrap = await fixture.api.getFastify().inject({
      method: 'POST',
      url: '/bootstrap',
      payload: {
        nodeId: '550e8400-e29b-41d4-a716-446655440333',
        nodeAddress: 'ws://localhost:9129',
      },
    });
    t.equal(
      secondBootstrap.statusCode,
      503,
      'bootstrap should defer while the original MOVE_REPLICA handoff remains non-terminal after lease expiry',
    );
    t.ok(
      secondBootstrap.json().messageGroupAssignment === undefined,
      'deferred bootstrap should not allocate another MOVE_REPLICA assignment after lease expiry',
    );
  });

test('BootstrapAPI sweep reconciles observed target ownership into a committed MOVE_REPLICA handoff',
  async (t) => {
    const fixture = await bootstrapMoveReplicaAssignment(t, {
      joiningNodeId: '550e8400-e29b-41d4-a716-446655440334',
      assignmentLeaseMs: 60_000,
    });
    const {api, assignment, rows, joiningNodeId} = fixture;

    const targetReplica = rows.services.find((row) =>
      row.service_id === assignment.replicaToMove,
    );
    t.ok(targetReplica, 'fixture should include the reserved replica service row');
    targetReplica.node_id = joiningNodeId;
    targetReplica.address =
      `${joiningNodeId}/message-group/${assignment.replicaToMove}`;

    rows.nodes.push({
      node_id: joiningNodeId,
      status: SERVICE_STATUS.ACTIVE,
      connection_state: 'ready',
      last_heartbeat: Date.now(),
      ready_lease_expires_at: Date.now() + 60_000,
    });

    api.messageGroupServices.delete(assignment.replicaToMove);

    await api.expireMoveReplicaAssignmentReservations();

    const reservationRow = rows.replica_operations.find((row) =>
      row.operation_id === assignment.assignmentId,
    );
    t.equal(
      reservationRow?.status,
      'active',
      'observed target ownership should reconcile the reservation to committed',
    );
    t.equal(
      reservationRow?.workflow_step,
      'ACTIVE',
      'reconciled reservation should persist ACTIVE workflow step',
    );

    const nextBootstrap = await api.getFastify().inject({
      method: 'POST',
      url: '/bootstrap',
      payload: {
        nodeId: '550e8400-e29b-41d4-a716-446655440335',
        nodeAddress: 'ws://localhost:9130',
      },
    });
    t.equal(
      nextBootstrap.statusCode,
      200,
      'bootstrap should not remain blocked once observed ownership and target readiness have converged',
    );
  });

test('BootstrapAPI register-service recovers assignment token from cache when reservation storage lookup is unavailable',
  async (t) => {
    const fixture = await bootstrapMoveReplicaAssignment(t, {
      joiningNodeId: '550e8400-e29b-41d4-a716-446655440330',
    });
    const {api, assignment, joiningNodeId} = fixture;

    api.moveReplicaAssignmentReservations.clear();
    const originalExecute = api.executeBootstrapControlPlaneQuery.bind(api);
    api.executeBootstrapControlPlaneQuery = async (sql, params = []) => {
      const statement = String(sql);
      if (statement.includes('FROM replica_operations') &&
          statement.includes('WHERE operation_id = ?') &&
          params[0] === assignment.assignmentId) {
        return {
          success: false,
          error: 'replica_operations partition temporarily unavailable',
        };
      }
      return originalExecute(sql, params);
    };

    const response = await api.getFastify().inject({
      method: 'POST',
      url: '/register-service',
      payload: buildRegisterPayload(joiningNodeId, assignment, {
        assignment_id: assignment.assignmentId,
      }),
    });
    t.equal(
      response.statusCode,
      200,
      'register-service should use cached reservation state when storage lookup is unavailable after restart',
    );
  });

test('BootstrapAPI register-service returns retryable 503 when assignment token lookup is unavailable',
  async (t) => {
    const fixture = await bootstrapMoveReplicaAssignment(t, {
      joiningNodeId: '550e8400-e29b-41d4-a716-446655440331',
    });
    const {api, assignment, joiningNodeId, rows} = fixture;

    api.moveReplicaAssignmentReservations.clear();
    rows.replica_operations = rows.replica_operations.filter((row) =>
      row.operation_id !== assignment.assignmentId,
    );
    const originalExecute = api.executeBootstrapControlPlaneQuery.bind(api);
    api.executeBootstrapControlPlaneQuery = async (sql, params = []) => {
      const statement = String(sql);
      if (statement.includes('FROM replica_operations') &&
          statement.includes('WHERE operation_id = ?') &&
          params[0] === assignment.assignmentId) {
        return {
          success: false,
          error: 'replica_operations partition temporarily unavailable',
        };
      }
      return originalExecute(sql, params);
    };

    const response = await api.getFastify().inject({
      method: 'POST',
      url: '/register-service',
      payload: buildRegisterPayload(joiningNodeId, assignment, {
        assignment_id: assignment.assignmentId,
      }),
    });
    t.equal(
      response.statusCode,
      503,
      'register-service should return a retryable response when token lookup cannot be completed',
    );
    t.equal(
      response.json().code,
      'ASSIGNMENT_TOKEN_LOOKUP_UNAVAILABLE',
      'retryable lookup failure should emit a stable error code',
    );
  });

test('BootstrapAPI defers subsequent bootstrap until committed MOVE_REPLICA target is ready',
  async (t) => {
    const fixture = await bootstrapMoveReplicaAssignment(t, {
      joiningNodeId: '550e8400-e29b-41d4-a716-446655440325',
    });
    const {api, assignment, joiningNodeId, rows} = fixture;
    const targetNodeId = joiningNodeId;

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
      'register-service should complete MOVE_REPLICA handoff',
    );

    const operationAfterCommit = rows.replica_operations.find((row) =>
      row.operation_id === assignment.assignmentId,
    );
    t.equal(
      operationAfterCommit?.status,
      'active',
      'committed handoff should persist active status',
    );
    t.equal(
      operationAfterCommit?.workflow_step,
      'ACTIVE',
      'committed handoff should persist ACTIVE workflow step',
    );

    const secondBootstrap = await api.getFastify().inject({
      method: 'POST',
      url: '/bootstrap',
      payload: {
        nodeId: '550e8400-e29b-41d4-a716-446655440326',
        nodeAddress: 'ws://localhost:9124',
      },
    });
    t.equal(
      secondBootstrap.statusCode,
      503,
      'second bootstrap should defer while the committed target is still unready',
    );
    t.equal(
      secondBootstrap.json().code,
      'BOOTSTRAP_NOT_READY',
      'bootstrap defer should use the canonical not-ready code',
    );
    t.ok(
      (secondBootstrap.json().reasons || [])
        .includes('MOVE_REPLICA_HANDOFF_STABILIZING'),
      'bootstrap defer should surface committed handoff stabilization reason',
    );

    rows.nodes.push({
      node_id: targetNodeId,
      status: SERVICE_STATUS.ACTIVE,
      connection_state: 'ready',
      last_heartbeat: Date.now(),
      ready_lease_expires_at: Date.now() + 60_000,
    });

    const thirdBootstrap = await api.getFastify().inject({
      method: 'POST',
      url: '/bootstrap',
      payload: {
        nodeId: '550e8400-e29b-41d4-a716-446655440326',
        nodeAddress: 'ws://localhost:9124',
      },
    });
    t.equal(
      thirdBootstrap.statusCode,
      200,
      'bootstrap should resume once the committed target becomes ready',
    );

    const operationAfterSecondBootstrap = rows.replica_operations.find((row) =>
      row.operation_id === assignment.assignmentId,
    );
    t.equal(
      operationAfterSecondBootstrap?.status,
      'active',
      'expiry sweep must not rewrite committed handoff to failed',
    );
    t.equal(
      operationAfterSecondBootstrap?.workflow_step,
      'ACTIVE',
      'expiry sweep must preserve committed workflow step',
    );
    t.equal(
      operationAfterSecondBootstrap?.error_message || null,
      null,
      'committed handoff should not gain synthetic expiry failure',
    );
  });

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
      503,
      'bootstrap should defer while the in-memory reservation is open',
    );
    t.ok(
      competingBootstrap.json().messageGroupAssignment === undefined,
      'competing bootstrap should not allocate a second assignment while the in-memory reservation is open',
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

test('BootstrapAPI bootstrap admission defers on cached MOVE_REPLICA reservations without replica_operations SQL rereads',
  async (t) => {
    const fixture = await bootstrapMoveReplicaAssignment(t, {
      joiningNodeId: '550e8400-e29b-41d4-a716-4466554403ae',
    });
    const {api} = fixture;
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
      503,
      'competing bootstrap should defer while the reservation is open',
    );
    t.ok(
      competingBootstrap.json().messageGroupAssignment === undefined,
      'deferred bootstrap should not allocate a competing message group assignment',
    );
    t.equal(
      reservationSelectCount,
      0,
      'bootstrap admission should reuse cache/in-memory reservation summary before falling back to SQL',
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
