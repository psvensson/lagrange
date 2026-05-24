import './move-replica-assignment-token-cache-visibility-test-cases.js';
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

test('BootstrapAPI sweep preserves expired local-source MOVE_REPLICA reservation when service row is missing',
  async (t) => {
    const fixture = await bootstrapMoveReplicaAssignment(t, {
      joiningNodeId: MISSING_SOURCE_ROW_JOINING_NODE_ID,
      assignmentLeaseMs: MOVE_REPLICA_SHORT_ASSIGNMENT_LEASE_MS,
    });
    const {api, assignment, joiningNodeId, rows} = fixture;
    const expiredAt = Date.now() - EXPIRED_LEASE_OFFSET_MS;
    const reservationRow = rows.replica_operations.find((row) =>
      row.operation_id === assignment.assignmentId,
    );
    const cachedReservation = api.moveReplicaAssignmentReservations.get(
      assignment.assignmentId,
    );

    rows.services = rows.services.filter((row) =>
      row.service_id !== assignment.replicaToMove,
    );
    reservationRow.lease_expires_at = expiredAt;
    reservationRow.completed_at = expiredAt;
    cachedReservation.leaseExpiresAt = expiredAt;
    cachedReservation.updatedAt = expiredAt;

    await api.expireMoveReplicaAssignmentReservations();

    t.equal(
      reservationRow?.status,
      BOOTSTRAP_API_HANDOFF_STATUS.PREPARING,
      'sweep should preserve a local-source assignment when only the service row is missing',
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
      'register-service should revive the preserved local-source assignment',
    );
  });

test('BootstrapAPI sweep preserves expired source-owned MOVE_REPLICA reservation across source visibility gap',
  async (t) => {
    const fixture = await bootstrapMoveReplicaAssignment(t, {
      joiningNodeId: MISSING_LOCAL_SOURCE_JOINING_NODE_ID,
      assignmentLeaseMs: MOVE_REPLICA_SHORT_ASSIGNMENT_LEASE_MS,
    });
    const {api, assignment, rows} = fixture;
    const expiredAt = Date.now() - EXPIRED_LEASE_OFFSET_MS;
    const reservationRow = rows.replica_operations.find((row) =>
      row.operation_id === assignment.assignmentId,
    );
    const cachedReservation = api.moveReplicaAssignmentReservations.get(
      assignment.assignmentId,
    );

    rows.services = rows.services.filter((row) =>
      row.service_id !== assignment.replicaToMove,
    );
    api.messageGroupServices.delete(assignment.replicaToMove);
    reservationRow.lease_expires_at = expiredAt;
    reservationRow.completed_at = expiredAt;
    cachedReservation.leaseExpiresAt = expiredAt;
    cachedReservation.updatedAt = expiredAt;

    await api.expireMoveReplicaAssignmentReservations();

    t.equal(
      reservationRow?.status,
      BOOTSTRAP_API_HANDOFF_STATUS.PREPARING,
      'source-owned assignment should outlive a source service visibility gap',
    );
    t.equal(
      reservationRow?.workflow_step,
      WORKFLOW_STEP.PENDING,
      'visibility gap should not terminalize the source-owned handoff',
    );
    t.equal(
      reservationRow?.error_message,
      null,
      'visibility gap should not persist a synthetic source-owner failure',
    );
  });

test('BootstrapAPI sweep preserves source-owned MOVE_REPLICA reservation across stale ready lease visibility gap',
  async (t) => {
    const fixture = await bootstrapMoveReplicaAssignment(t, {
      joiningNodeId: STALE_SOURCE_READY_LEASE_JOINING_NODE_ID,
      assignmentLeaseMs: MOVE_REPLICA_SHORT_ASSIGNMENT_LEASE_MS,
    });
    const {api, assignment, rows} = fixture;
    const expiredAt = Date.now() - EXPIRED_LEASE_OFFSET_MS;
    const staleHeartbeatAt = expiredAt + EXPIRED_LEASE_OFFSET_MS;
    const sourceNode = rows.nodes.find((row) =>
      row.node_id === assignment.sourceNodeId,
    );
    const reservationRow = rows.replica_operations.find((row) =>
      row.operation_id === assignment.assignmentId,
    );
    const cachedReservation = api.moveReplicaAssignmentReservations.get(
      assignment.assignmentId,
    );

    t.ok(sourceNode, 'fixture should include the source node row');
    rows.services = rows.services.filter((row) =>
      row.service_id !== assignment.replicaToMove,
    );
    api.messageGroupServices.delete(assignment.replicaToMove);
    sourceNode.connection_state = STATE.READY;
    sourceNode.last_heartbeat = staleHeartbeatAt;
    sourceNode.ready_lease_expires_at = expiredAt;
    reservationRow.lease_expires_at = expiredAt;
    reservationRow.completed_at = expiredAt;
    cachedReservation.leaseExpiresAt = expiredAt;
    cachedReservation.updatedAt = expiredAt;

    await api.expireMoveReplicaAssignmentReservations();

    t.equal(
      reservationRow?.status,
      BOOTSTRAP_API_HANDOFF_STATUS.PREPARING,
      'source-owned assignment should outlive a stale ready-lease visibility gap',
    );
    t.equal(
      reservationRow?.workflow_step,
      WORKFLOW_STEP.PENDING,
      'stale ready-lease visibility gap should remain revivable',
    );
    t.equal(
      reservationRow?.error_message,
      null,
      'stale ready-lease visibility gap should not synthesize source-owner failure',
    );
  });

test('BootstrapAPI sweep preserves source-owned MOVE_REPLICA when source service row remains active across stale ready lease',
  async (t) => {
    const fixture = await bootstrapMoveReplicaAssignment(t, {
      joiningNodeId: SOURCE_OWNER_STALE_READY_LEASE_JOINING_NODE_ID,
      assignmentLeaseMs: MOVE_REPLICA_SHORT_ASSIGNMENT_LEASE_MS,
    });
    const {api, assignment, rows} = fixture;
    const expiredAt = Date.now() - EXPIRED_LEASE_OFFSET_MS;
    const sourceServiceRow = rows.services.find((row) =>
      row.service_id === assignment.replicaToMove,
    );
    const sourceNode = rows.nodes.find((row) =>
      row.node_id === assignment.sourceNodeId,
    );
    const reservationRow = rows.replica_operations.find((row) =>
      row.operation_id === assignment.assignmentId,
    );
    const cachedReservation = api.moveReplicaAssignmentReservations.get(
      assignment.assignmentId,
    );

    t.ok(sourceServiceRow, 'fixture should include the source service row');
    t.ok(sourceNode, 'fixture should include the source node row');
    sourceServiceRow.node_id = assignment.sourceNodeId;
    sourceServiceRow.status = SERVICE_STATUS.ACTIVE;
    api.messageGroupServices.delete(assignment.replicaToMove);
    sourceNode.status = SERVICE_STATUS.ACTIVE;
    sourceNode.connection_state = STATE.READY;
    sourceNode.last_heartbeat = expiredAt - EXPIRED_LEASE_OFFSET_MS;
    sourceNode.ready_lease_expires_at = expiredAt;
    reservationRow.lease_expires_at = expiredAt;
    reservationRow.completed_at = expiredAt;
    cachedReservation.leaseExpiresAt = expiredAt;
    cachedReservation.updatedAt = expiredAt;

    await api.expireMoveReplicaAssignmentReservations();

    t.equal(
      reservationRow?.status,
      BOOTSTRAP_API_HANDOFF_STATUS.PREPARING,
      'source-owned assignment should outlive stale source ready-lease evidence',
    );
    t.equal(
      reservationRow?.workflow_step,
      WORKFLOW_STEP.PENDING,
      'stale source ready-lease evidence should not terminalize the handoff',
    );
    t.equal(
      reservationRow?.error_message,
      null,
      'stale source ready-lease evidence should not synthesize source-owner failure',
    );
  });

test('BootstrapAPI sweep ignores stale cache source owner when authoritative services omit the row',
  async (t) => {
    const fixture = await bootstrapMoveReplicaAssignment(t, {
      joiningNodeId: STALE_CACHE_SOURCE_OWNER_JOINING_NODE_ID,
      assignmentLeaseMs: MOVE_REPLICA_SHORT_ASSIGNMENT_LEASE_MS,
    });
    const {api, assignment, rows} = fixture;
    const expiredAt = Date.now() - EXPIRED_LEASE_OFFSET_MS;
    const sourceServiceRow = rows.services.find((row) =>
      row.service_id === assignment.replicaToMove,
    );
    const reservationRow = rows.replica_operations.find((row) =>
      row.operation_id === assignment.assignmentId,
    );
    const cachedReservation = api.moveReplicaAssignmentReservations.get(
      assignment.assignmentId,
    );
    const originalAuthoritativeRows =
      api.getBootstrapAuthoritativeTableRows.bind(api);

    t.ok(sourceServiceRow, 'fixture should include the source service cache row');
    sourceServiceRow.node_id = STALE_CACHE_SOURCE_OWNER_NODE_ID;
    api.messageGroupServices.delete(assignment.replicaToMove);
    api.getBootstrapAuthoritativeTableRows = (tableName) => {
      if (tableName !== TABLES.SERVICES) {
        return originalAuthoritativeRows(tableName);
      }
      return rows.services.filter((row) =>
        row.service_id !== assignment.replicaToMove,
      );
    };
    reservationRow.lease_expires_at = expiredAt;
    reservationRow.completed_at = expiredAt;
    cachedReservation.leaseExpiresAt = expiredAt;
    cachedReservation.updatedAt = expiredAt;

    await api.expireMoveReplicaAssignmentReservations();

    t.equal(
      reservationRow?.status,
      BOOTSTRAP_API_HANDOFF_STATUS.PREPARING,
      'authoritative service absence should beat a stale cache owner row',
    );
    t.equal(
      reservationRow?.workflow_step,
      WORKFLOW_STEP.PENDING,
      'stale cache owner row should not terminalize the source-owned handoff',
    );
    t.equal(
      reservationRow?.error_message,
      null,
      'stale cache owner row should not synthesize source-owner failure',
    );
  });

test('BootstrapAPI admission message-group view ignores stale service cache when owner truth omits row',
  async (t) => {
    const fixture = await bootstrapMoveReplicaAssignment(t, {
      joiningNodeId: ADMISSION_OWNER_TRUTH_JOINING_NODE_ID,
    });
    const {api, assignment, rows} = fixture;
    const staleSourceRow = rows.services.find((row) =>
      row.service_id === assignment.replicaToMove,
    );
    const originalAuthoritativeRows =
      api.bootstrapTopologySnapshotOwner
        .getBootstrapAuthoritativeTableRows
        .bind(api.bootstrapTopologySnapshotOwner);

    t.ok(staleSourceRow, 'fixture should include a stale cache source row');
    api.bootstrapTopologySnapshotOwner.getBootstrapAuthoritativeTableRows =
      (tableName) => {
        if (tableName !== TABLES.SERVICES) {
          return originalAuthoritativeRows(tableName);
        }
        return rows.services.filter((row) =>
          row.service_id !== assignment.replicaToMove,
        );
      };

    const admissionRows =
      api.getBootstrapAdmissionTableRows(TABLES.SERVICES);
    const admissionGroups = api.getMessageGroups();

    t.notOk(
      admissionRows.some((row) =>
        row.service_id === assignment.replicaToMove,
      ),
      'bootstrap admission rows should follow owner truth over stale cache rows',
    );
    t.notOk(
      admissionGroups.some((group) =>
        (group.replicas || []).some((replica) =>
          replica.replica_id === assignment.replicaToMove,
        ),
      ),
      'bootstrap admission message groups should not resurrect stale cache replicas',
    );
  });

test('BootstrapAPI sweep preserves expired MOVE_REPLICA reservation across active-owner visibility drift',
  async (t) => {
    const fixture = await bootstrapMoveReplicaAssignment(t, {
      joiningNodeId: SWEEP_OWNER_DRIFT_JOINING_NODE_ID,
      assignmentLeaseMs: MOVE_REPLICA_SHORT_ASSIGNMENT_LEASE_MS,
    });
    const {api, assignment, rows} = fixture;
    const expiredAt = Date.now() - EXPIRED_LEASE_OFFSET_MS;
    const sourceServiceRow = rows.services.find((row) =>
      row.service_id === assignment.replicaToMove,
    );
    const sourceNode = rows.nodes.find((row) =>
      row.node_id === assignment.sourceNodeId,
    );
    const reservationRow = rows.replica_operations.find((row) =>
      row.operation_id === assignment.assignmentId,
    );
    const cachedReservation = api.moveReplicaAssignmentReservations.get(
      assignment.assignmentId,
    );

    t.ok(sourceServiceRow, 'fixture should include source service row');
    t.ok(sourceNode, 'fixture should include source node row');
    sourceServiceRow.node_id = SWEEP_OWNER_DRIFT_NODE_ID;
    sourceNode.status = SERVICE_STATUS.ACTIVE;
    sourceNode.connection_state = STATE.READY;
    sourceNode.last_heartbeat = Date.now();
    sourceNode.ready_lease_expires_at =
      Date.now() + MOVE_REPLICA_LONG_ASSIGNMENT_LEASE_MS;
    reservationRow.lease_expires_at = expiredAt;
    reservationRow.completed_at = expiredAt;
    cachedReservation.leaseExpiresAt = expiredAt;
    cachedReservation.updatedAt = expiredAt;

    await api.expireMoveReplicaAssignmentReservations();

    t.equal(
      reservationRow?.status,
      BOOTSTRAP_API_HANDOFF_STATUS.PREPARING,
      'sweep should not terminalize active-owner drift while source remains visible',
    );
    t.equal(
      reservationRow?.workflow_step,
      WORKFLOW_STEP.PENDING,
      'active-owner drift should stay pending for target registration recovery',
    );
    t.equal(
      reservationRow?.error_message,
      null,
      'active-owner drift should not synthesize source-owner failure',
    );
  });

test('BootstrapAPI sweep preserves expired MOVE_REPLICA reservation while target adoption is connected',
  async (t) => {
    const fixture = await bootstrapMoveReplicaAssignment(t, {
      joiningNodeId: TARGET_ADOPTION_VISIBILITY_JOINING_NODE_ID,
      assignmentLeaseMs: MOVE_REPLICA_SHORT_ASSIGNMENT_LEASE_MS,
    });
    const {api, assignment, joiningNodeId, rows} = fixture;
    const expiredAt = Date.now() - EXPIRED_LEASE_OFFSET_MS;
    const sourceNode = rows.nodes.find((row) =>
      row.node_id === assignment.sourceNodeId,
    );
    const reservationRow = rows.replica_operations.find((row) =>
      row.operation_id === assignment.assignmentId,
    );
    const cachedReservation = api.moveReplicaAssignmentReservations.get(
      assignment.assignmentId,
    );

    t.ok(sourceNode, 'fixture should include source node row');
    rows.services = rows.services.filter((row) =>
      row.service_id !== assignment.replicaToMove,
    );
    api.messageGroupServices.delete(assignment.replicaToMove);
    sourceNode.connection_state = STATE.DISCONNECTED;
    sourceNode.ready_lease_expires_at = expiredAt;
    rows.nodes.push({
      node_id: joiningNodeId,
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.CONNECTED,
      last_heartbeat: Date.now(),
      ready_lease_expires_at: null,
    });
    reservationRow.lease_expires_at = expiredAt;
    reservationRow.completed_at = expiredAt;
    cachedReservation.leaseExpiresAt = expiredAt;
    cachedReservation.updatedAt = expiredAt;

    await api.expireMoveReplicaAssignmentReservations();

    t.equal(
      reservationRow?.status,
      BOOTSTRAP_API_HANDOFF_STATUS.PREPARING,
      'sweep should preserve an expired assignment when target adoption is connected',
    );
    t.equal(
      reservationRow?.workflow_step,
      WORKFLOW_STEP.PENDING,
      'target adoption should keep the handoff pending for registration retry',
    );
    t.equal(
      reservationRow?.error_message,
      null,
      'target adoption should not synthesize source-owner failure',
    );
  });

test('BootstrapAPI sweep source-visibility fallback preserves no-owner MOVE_REPLICA',
  async (t) => {
    const fixture = await bootstrapMoveReplicaAssignment(t, {
      joiningNodeId: SOURCE_VISIBILITY_FALLBACK_JOINING_NODE_ID,
      assignmentLeaseMs: MOVE_REPLICA_SHORT_ASSIGNMENT_LEASE_MS,
    });
    const {api, assignment, rows} = fixture;
    const now = Date.now();
    const expiredAt = now - EXPIRED_LEASE_OFFSET_MS;
    const sourceNode = rows.nodes.find((row) =>
      row.node_id === assignment.sourceNodeId,
    );
    const reservationRow = rows.replica_operations.find((row) =>
      row.operation_id === assignment.assignmentId,
    );
    const cachedReservation = api.moveReplicaAssignmentReservations.get(
      assignment.assignmentId,
    );

    t.ok(sourceNode, 'fixture should include source node row');
    rows.services = rows.services.filter((row) =>
      row.service_id !== assignment.replicaToMove,
    );
    api.messageGroupServices.delete(assignment.replicaToMove);
    sourceNode.status = SERVICE_STATUS.ACTIVE;
    sourceNode.connection_state = STATE.READY;
    sourceNode.last_heartbeat = now;
    sourceNode.ready_lease_expires_at =
      now + MOVE_REPLICA_LONG_ASSIGNMENT_LEASE_MS;
    reservationRow.lease_expires_at = expiredAt;
    reservationRow.completed_at = expiredAt;
    cachedReservation.leaseExpiresAt = expiredAt;
    cachedReservation.updatedAt = expiredAt;

    const shouldPreserve =
      api.moveReplicaAssignmentOwner
        .shouldPreserveMoveReplicaAssignmentSweepSourceVisibilityGap(
          cachedReservation,
          MOVE_REPLICA_ASSIGNMENT_INVALIDATION_REASON.SOURCE_OWNER_UNAVAILABLE,
          now,
        );

    t.equal(
      shouldPreserve,
      true,
      'source readiness should preserve a no-owner assignment without target adoption',
    );
  });

test('BootstrapAPI MOVE_REPLICA revival uses supplied readiness timestamp',
  async (t) => {
    const fixture = await bootstrapMoveReplicaAssignment(t, {
      joiningNodeId: CAN_REVIVE_SUPPLIED_NOW_JOINING_NODE_ID,
      assignmentLeaseMs: MOVE_REPLICA_SHORT_ASSIGNMENT_LEASE_MS,
    });
    const {api, assignment, rows} = fixture;
    const sourceNode = rows.nodes.find((row) =>
      row.node_id === assignment.sourceNodeId,
    );
    const cachedReservation = api.moveReplicaAssignmentReservations.get(
      assignment.assignmentId,
    );
    const originalDateNow = Date.now;

    t.ok(sourceNode, 'fixture should include source node row');
    sourceNode.status = SERVICE_STATUS.ACTIVE;
    sourceNode.connection_state = STATE.DISCONNECTED;
    sourceNode.last_heartbeat =
      CAN_REVIVE_SUPPLIED_NOW_MS + CAN_REVIVE_HEARTBEAT_OFFSET_MS;
    sourceNode.ready_lease_expires_at =
      CAN_REVIVE_SUPPLIED_NOW_MS + CAN_REVIVE_READY_LEASE_OFFSET_MS;
    cachedReservation.leaseExpiresAt =
      CAN_REVIVE_SUPPLIED_NOW_MS - EXPIRED_LEASE_OFFSET_MS;
    cachedReservation.updatedAt =
      CAN_REVIVE_SUPPLIED_NOW_MS - EXPIRED_LEASE_OFFSET_MS;
    Date.now = () =>
      CAN_REVIVE_SUPPLIED_NOW_MS + CAN_REVIVE_WALL_CLOCK_OFFSET_MS;
    t.teardown(() => {
      Date.now = originalDateNow;
    });

    t.equal(
      api.canReviveExpiredMoveReplicaAssignmentReservation(
        cachedReservation,
        CAN_REVIVE_SUPPLIED_NOW_MS,
      ),
      true,
      'revival should evaluate source readiness at the supplied sweep timestamp',
    );
  });

test('BootstrapAPI sweep defers expired remote-source MOVE_REPLICA invalidation to source owner',
  async (t) => {
    initializeTestEnvironment();
    const now = Date.now();
    const expiredAt = now - EXPIRED_LEASE_OFFSET_MS;
    const rows = {
      services: [],
      nodes: [
        {
          node_id: REMOTE_SOURCE_SWEEP_SOURCE_NODE_ID,
          status: SERVICE_STATUS.ACTIVE,
          connection_state: STATE.READY,
          last_heartbeat: now,
          ready_lease_expires_at: now + MOVE_REPLICA_LONG_ASSIGNMENT_LEASE_MS,
        },
        {
          node_id: REMOTE_SOURCE_SWEEP_TARGET_NODE_ID,
          status: SERVICE_STATUS.ACTIVE,
          connection_state: STATE.READY,
          last_heartbeat: now,
          ready_lease_expires_at: now + MOVE_REPLICA_LONG_ASSIGNMENT_LEASE_MS,
        },
      ],
      partitions: [],
      tables: [],
      message_groups: [],
      replica_operations: [
        {
          operation_id: REMOTE_SOURCE_SWEEP_ASSIGNMENT_ID,
          type: BOOTSTRAP_API_ASSIGNMENT.OPERATION_TYPE,
          partition_id: REMOTE_SOURCE_SWEEP_GROUP_ID,
          replica_id: REMOTE_SOURCE_SWEEP_REPLICA_ID,
          source_node_id: REMOTE_SOURCE_SWEEP_SOURCE_NODE_ID,
          target_node_id: REMOTE_SOURCE_SWEEP_TARGET_NODE_ID,
          status: BOOTSTRAP_API_HANDOFF_STATUS.PREPARING,
          workflow_step: WORKFLOW_STEP.PENDING,
          created_at: now,
          updated_at: now,
          completed_at: expiredAt,
          lease_expires_at: expiredAt,
          error_message: null,
          steps_history: JSON.stringify([]),
          entity_type: SERVICE_TYPE.MESSAGE_GROUP,
          entity_id: REMOTE_SOURCE_SWEEP_GROUP_ID,
        },
      ],
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
        return (rows[tableName] || []).find((row) =>
          row.service_id === id ||
          row.node_id === id ||
          row.operation_id === id,
        ) || null;
      },
      filter(tableName, predicate) {
        return (rows[tableName] || []).filter(predicate);
      },
      getReadyNodes() {
        return [
          REMOTE_SOURCE_SWEEP_SOURCE_NODE_ID,
          REMOTE_SOURCE_SWEEP_TARGET_NODE_ID,
        ];
      },
    };
    const api = new BootstrapAPI({
      seedNodeId: REMOTE_SOURCE_SWEEP_TARGET_NODE_ID,
      seedNodeAddress: REMOTE_SOURCE_SWEEP_NODE_ADDRESS,
      systemTableCache,
      messageGroupServices: new Map(),
      cdcIntegrationService: createCdcIntegrationServiceFixture(rows),
    });
    await api.initialize(0, {listen: false});
    api.setSqlQueryEngine({
      async executeQuery() {
        return {success: true, rows: rows.replica_operations};
      },
    });
    t.teardown(async () => {
      await api.shutdown();
    });

    await api.expireMoveReplicaAssignmentReservations();

    const reservationRow = rows.replica_operations.find((row) =>
      row.operation_id === REMOTE_SOURCE_SWEEP_ASSIGNMENT_ID,
    );
    t.equal(
      reservationRow?.status,
      BOOTSTRAP_API_HANDOFF_STATUS.PREPARING,
      'target-local sweep should not terminalize a remote-source assignment',
    );
    t.equal(
      reservationRow?.workflow_step,
      WORKFLOW_STEP.PENDING,
      'remote-source assignment should remain source-owned after target sweep',
    );
    t.equal(
      reservationRow?.error_message,
      null,
      'target-local sweep should not persist a synthetic source-owner failure',
    );
  });

test('BootstrapAPI admits subsequent bootstrap after expired non-terminal MOVE_REPLICA reservation lease',
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
      200,
      'bootstrap should resume after the original MOVE_REPLICA handoff lease expires',
    );
    t.not(
      secondBootstrap.json().messageGroupAssignment?.assignmentId,
      fixture.assignment.assignmentId,
      'resumed bootstrap should allocate a fresh MOVE_REPLICA assignment lease',
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

test('BootstrapAPI excludes committed MOVE_REPLICA target while admitting unrelated bootstrap',
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
        nodeId: AUTHORITATIVE_TARGET_READY_SECOND_NODE_ID,
        nodeAddress: AUTHORITATIVE_TARGET_READY_SECOND_NODE_ADDRESS,
      },
    });
    t.equal(
      secondBootstrap.statusCode,
      200,
      'second bootstrap should proceed while committed target readiness converges',
    );
    t.not(
      secondBootstrap.json().messageGroupAssignment?.replicaToMove,
      assignment.replicaToMove,
      'second bootstrap should exclude the committed target replica',
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
      'bootstrap should keep admitting unrelated joiners once the committed target is ready',
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

test('BootstrapAPI bootstrap admission accepts committed MOVE_REPLICA target readiness from authoritative owner truth',
  async (t) => {
    const fixture = await bootstrapMoveReplicaAssignment(t, {
      joiningNodeId: AUTHORITATIVE_TARGET_READY_JOINING_NODE_ID,
    });
    const {api, assignment, joiningNodeId, rows} = fixture;
    const observedAtMs = Date.now() + MOVE_REPLICA_LONG_ASSIGNMENT_LEASE_MS;
    const targetServiceRow = {
      service_id: assignment.replicaToMove,
      service_type: SERVICE_TYPE.MESSAGE_GROUP,
      node_id: joiningNodeId,
      group_id: assignment.groupId,
      replica_id: assignment.replicaToMove,
      raft_role: RAFT_ROLE.FOLLOWER,
      status: SERVICE_STATUS.ACTIVE,
      address: `${joiningNodeId}/message-group/${assignment.replicaToMove}`,
      updated_at: observedAtMs,
    };
    const targetNodeRow = {
      node_id: joiningNodeId,
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      last_heartbeat: observedAtMs,
      ready_lease_expires_at:
        observedAtMs + MOVE_REPLICA_LONG_ASSIGNMENT_LEASE_MS,
      updated_at: observedAtMs,
    };
    const reservation =
      api.moveReplicaAssignmentReservations.get(assignment.assignmentId);
    t.ok(reservation, 'fixture should retain the MOVE_REPLICA reservation');
    Object.assign(reservation, {
      status: BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED,
      updatedAt: observedAtMs,
      completedAt: observedAtMs,
      leaseExpiresAt: observedAtMs + MOVE_REPLICA_LONG_ASSIGNMENT_LEASE_MS,
    });

    const operationRow = rows.replica_operations.find((row) =>
      row.operation_id === assignment.assignmentId,
    );
    t.ok(operationRow, 'fixture should persist the MOVE_REPLICA operation row');
    Object.assign(operationRow, {
      status: BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED,
      workflow_step: WORKFLOW_STEP.ACTIVE,
      updated_at: observedAtMs,
      completed_at: observedAtMs,
    });

    api.getBootstrapAuthoritativeTableRows = (tableName) => {
      if (tableName === TABLES.SERVICES) {
        return [targetServiceRow];
      }
      if (tableName === TABLES.NODES) {
        return [targetNodeRow];
      }
      return [];
    };

    t.equal(
      api.isMoveReplicaAssignmentTargetReady(reservation, observedAtMs),
      true,
      'authoritative service and node rows should prove the committed target ready',
    );

    const blockingReservations =
      await api.getBlockingMoveReplicaBootstrapAdmissions(observedAtMs);
    t.equal(
      blockingReservations.length,
      0,
      'committed target readiness from owner truth should clear bootstrap admission',
    );

    const nextBootstrap = await api.getFastify().inject({
      method: 'POST',
      url: BOOTSTRAP_TEST_ROUTE,
      payload: {
        nodeId: AUTHORITATIVE_TARGET_READY_SECOND_NODE_ID,
        nodeAddress: AUTHORITATIVE_TARGET_READY_SECOND_NODE_ADDRESS,
      },
    });
    t.equal(
      nextBootstrap.statusCode,
      SUCCESS_HTTP_STATUS_CODE,
      'bootstrap should not defer on stale cache when authoritative target ownership is ready',
    );
  });
