import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {
  BOOTSTRAP_API_CACHE_VISIBILITY,
  BOOTSTRAP_API_HANDOFF_STATUS,
} from '../../src/bootstrap/bootstrap-api-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SERVICE_STATUS, SERVICE_TYPE} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'seed-node-1', restApiPort: 9999},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function createSystemCacheFixture() {
  const now = Date.now();
  const rows = {
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
    nodes: [
      {
        node_id: 'seed-node-1',
        status: SERVICE_STATUS.ACTIVE,
        connection_state: 'ready',
        last_heartbeat: now,
        ready_lease_expires_at: now + 60_000,
      },
    ],
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

  const cache = {
    getAll(table) {
      return rows[table] || [];
    },
    get(table, id) {
      const tableRows = rows[table] || [];
      return tableRows.find((row) =>
        row.service_id === id ||
        row.node_id === id ||
        row.operation_id === id,
      ) || null;
    },
    filter(table, predicate) {
      return (rows[table] || []).filter(predicate);
    },
    getReadyNodes() {
      return ['seed-node-1'];
    },
  };

  return {rows, cache};
}

function createSqlQueryEngineFixture(rows) {
  return {
    async executeQuery(sql, params = []) {
      const statement = String(sql);
      if (statement.includes('INSERT INTO replica_operations')) {
        rows.replica_operations.push({
          operation_id: params[0],
          type: params[1],
          partition_id: params[2],
          replica_id: params[3],
          source_node_id: params[4],
          target_node_id: params[5],
          status: params[6],
          workflow_step: params[7],
          created_at: params[8],
          updated_at: params[9],
          completed_at: params[10],
          error_message: params[11],
          steps_history: params[12],
          entity_type: params[13],
          entity_id: params[14],
        });
        return {success: true, rows: []};
      }

      if (statement.includes('UPDATE replica_operations SET')) {
        const operationId = params[6];
        const row = rows.replica_operations.find((item) =>
          item.operation_id === operationId,
        );
        if (row) {
          row.status = params[0];
          row.workflow_step = params[1];
          row.updated_at = params[2];
          row.completed_at = params[3];
          row.error_message = params[4];
          row.steps_history = params[5];
        }
        return {success: true, rows: []};
      }

      if (statement.includes('FROM replica_operations') &&
          statement.includes('WHERE operation_id = ?')) {
        const operationId = params[0];
        const row = rows.replica_operations.find((item) =>
          item.operation_id === operationId,
        );
        return {success: true, rows: row ? [row] : []};
      }

      if (statement.includes('FROM replica_operations') &&
          statement.includes('WHERE type = ?')) {
        const type = params[0];
        return {
          success: true,
          rows: rows.replica_operations.filter((row) => row.type === type),
        };
      }

      if (statement.includes('INSERT OR REPLACE INTO services')) {
        const [
          serviceId,
          serviceType,
          nodeId,
          partitionId,
          groupId,
          replicaId,
          raftRole,
          status,
          address,
          createdAt,
          updatedAt,
        ] = params;
        const existing = rows.services.find((row) => row.service_id === serviceId);
        const rowPayload = {
          service_id: serviceId,
          service_type: serviceType,
          node_id: nodeId,
          partition_id: partitionId,
          group_id: groupId,
          replica_id: replicaId,
          raft_role: raftRole,
          status,
          address,
          created_at: createdAt,
          updated_at: updatedAt,
        };
        if (existing) {
          Object.assign(existing, rowPayload);
        } else {
          rows.services.push(rowPayload);
        }
        return {success: true, rows: []};
      }

      return {success: true, rows: []};
    },
  };
}

function getPrimaryKeyFieldForSystemTable(tableName, row = null) {
  switch (tableName) {
    case 'services':
      return 'service_id';
    case 'nodes':
    case 'node_endpoints':
    case 'logs':
      return 'node_id';
    case 'replica_operations':
      return 'operation_id';
    case 'message_groups':
      return 'group_id';
    case 'partitions':
      return 'partition_id';
    case 'service_endpoints':
      return 'endpoint_id';
    case 'service_definitions':
      return 'service_id';
    default:
      break;
  }
  for (const candidate of ['service_id', 'node_id', 'operation_id', 'id']) {
    if (typeof row?.[candidate] !== 'undefined' && row?.[candidate] !== null) {
      return candidate;
    }
  }
  return 'id';
}

function createCdcIntegrationServiceFixture(rows, options = {}) {
  const persistMutations = options.persistMutations !== false;
  const findRows = (tableName) => {
    if (!Array.isArray(rows[tableName])) {
      rows[tableName] = [];
    }
    return rows[tableName];
  };
  const findRowIndex = (tableName, primaryKeyField, keyValue) => {
    return findRows(tableName).findIndex((row) => row?.[primaryKeyField] === keyValue);
  };

  return {
    async insertSystemTableRow(tableName, row) {
      if (!persistMutations) {
        return {success: true, affectedRows: 1};
      }
      const tableRows = findRows(tableName);
      tableRows.push({...row});
      return {success: true, affectedRows: 1};
    },

    async upsertSystemTableRow(tableName, row) {
      if (!persistMutations) {
        return {success: true, affectedRows: 1};
      }
      const tableRows = findRows(tableName);
      const primaryKeyField = getPrimaryKeyFieldForSystemTable(tableName, row);
      const keyValue = row?.[primaryKeyField];
      const rowPayload = {...row};
      const existingIndex = findRowIndex(tableName, primaryKeyField, keyValue);
      if (existingIndex === -1) {
        tableRows.push(rowPayload);
      } else {
        tableRows[existingIndex] = {
          ...tableRows[existingIndex],
          ...rowPayload,
        };
      }
      return {success: true, affectedRows: 1};
    },

    async updateSystemTableRow(tableName, whereClause, data) {
      if (!persistMutations) {
        return {success: true, affectedRows: 1};
      }
      const tableRows = findRows(tableName);
      let affectedRows = 0;
      for (const row of tableRows) {
        const matches = Object.entries(whereClause || {}).every(([key, value]) =>
          row?.[key] === value,
        );
        if (!matches) {
          continue;
        }
        Object.assign(row, data);
        affectedRows += 1;
      }
      return {success: true, affectedRows};
    },

    async deleteSystemTableRow(tableName, whereClause) {
      if (!persistMutations) {
        return {success: true, affectedRows: 1};
      }
      const tableRows = findRows(tableName);
      const remainingRows = tableRows.filter((row) =>
        !Object.entries(whereClause || {}).every(([key, value]) => row?.[key] === value),
      );
      const affectedRows = tableRows.length - remainingRows.length;
      rows[tableName] = remainingRows;
      return {success: true, affectedRows};
    },

    async repairCacheVisibilityHole(...args) {
      if (typeof options.repairCacheVisibilityHole === 'function') {
        return options.repairCacheVisibilityHole(...args);
      }
      return false;
    },
  };
}

function buildRegisterPayload(nodeId, assignment, overrides = {}) {
  const replicaId = assignment.replicaToMove;
  return {
    service_id: replicaId,
    service_type: SERVICE_TYPE.MESSAGE_GROUP,
    node_id: nodeId,
    group_id: assignment.groupId,
    replica_id: replicaId,
    raft_role: RAFT_ROLE.FOLLOWER,
    status: SERVICE_STATUS.ACTIVE,
    address: `${nodeId}/message-group/${replicaId}`,
    ...overrides,
  };
}

async function bootstrapMoveReplicaAssignment(t, options = {}) {
  initializeTestEnvironment();
  const messageGroupServices = new Map();
  messageGroupServices.set('mg-1-r1', {groupId: 'mg-1'});
  messageGroupServices.set('mg-1-r2', {groupId: 'mg-1'});
  messageGroupServices.set('mg-1-r3', {groupId: 'mg-1'});

  const {rows, cache} = createSystemCacheFixture();
  const sqlQueryEngine = createSqlQueryEngineFixture(rows);
  const cdcIntegrationService = createCdcIntegrationServiceFixture(rows);

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: cache,
    messageGroupServices,
    cdcIntegrationService,
    moveReplicaAssignmentLeaseMs: options.assignmentLeaseMs,
    moveReplicaAssignmentSweepIntervalMs: options.assignmentSweepIntervalMs,
    ownsMoveReplicaAssignmentLifecycle:
      options.ownsMoveReplicaAssignmentLifecycle === true,
  });
  await api.initialize(0, {listen: false});
  api.setSqlQueryEngine(sqlQueryEngine);
  t.teardown(async () => {
    await api.shutdown();
  });

  const joiningNodeId = options.joiningNodeId ||
    '550e8400-e29b-41d4-a716-446655440321';
  const bootstrapResponse = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {
      nodeId: joiningNodeId,
      nodeAddress: 'ws://localhost:9123',
    },
  });
  t.equal(bootstrapResponse.statusCode, 200, 'bootstrap should succeed');
  const assignment = bootstrapResponse.json().messageGroupAssignment;
  t.equal(assignment.strategy, 'MOVE_REPLICA', 'bootstrap should return MOVE_REPLICA');
  t.type(assignment.assignmentId, 'string', 'bootstrap should return assignmentId');
  t.type(
    assignment.assignmentLeaseExpiresAt,
    'number',
    'bootstrap should return assignment lease expiry metadata',
  );
  t.ok(
    assignment.assignmentLeaseExpiresAt > Date.now(),
    'assignment lease expiry should be in the future',
  );

  return {
    api,
    assignment,
    joiningNodeId,
    rows,
  };
}

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
    const validatedStep = stepsHistory.find((step) => step.phase === 'validated');
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
      'commit_metadata',
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

test('BootstrapAPI expires MOVE_REPLICA reservation when source node loses readiness before lease expiry',
  async (t) => {
    const fixture = await bootstrapMoveReplicaAssignment(t, {
      joiningNodeId: '550e8400-e29b-41d4-a716-446655440327',
      assignmentLeaseMs: 60_000,
    });

    const sourceNode = fixture.rows.nodes.find((row) =>
      row.node_id === fixture.assignment.sourceNodeId,
    );
    t.ok(sourceNode, 'fixture should include source node readiness row');

    sourceNode.ready_lease_expires_at = Date.now() - 1;
    sourceNode.connection_state = 'disconnected';

    await fixture.api.expireMoveReplicaAssignmentReservations();

    const reservationRow = fixture.rows.replica_operations.find((row) =>
      row.operation_id === fixture.assignment.assignmentId,
    );
    t.equal(
      reservationRow?.status,
      'failed',
      'reservation should fail fast when its recorded source node is no longer ready',
    );
    t.equal(
      reservationRow?.workflow_step,
      'FAILED',
      'reservation should persist FAILED workflow step when source ownership is lost',
    );
    t.equal(
      reservationRow?.error_message,
      'assignment source owner unavailable',
      'reservation failure should preserve the source-owner invalidation reason',
    );
  });

test('BootstrapAPI background sweep clears stranded MOVE_REPLICA reservation without a follow-up bootstrap request',
  async (t) => {
    const fixture = await bootstrapMoveReplicaAssignment(t, {
      joiningNodeId: '550e8400-e29b-41d4-a716-446655440328',
      assignmentLeaseMs: 60_000,
      assignmentSweepIntervalMs: 5,
      ownsMoveReplicaAssignmentLifecycle: true,
    });

    const sourceNode = fixture.rows.nodes.find((row) =>
      row.node_id === fixture.assignment.sourceNodeId,
    );
    t.ok(sourceNode, 'fixture should include source node readiness row');

    sourceNode.ready_lease_expires_at = Date.now() - 1;
    sourceNode.connection_state = 'disconnected';

    await new Promise((resolve) => setTimeout(resolve, 30));

    const reservationRow = fixture.rows.replica_operations.find((row) =>
      row.operation_id === fixture.assignment.assignmentId,
    );
    t.equal(
      reservationRow?.status,
      'failed',
      'background sweep should fail stranded reservation after source readiness loss',
    );
  });

test('BootstrapAPI background sweep preserves expired but revivable MOVE_REPLICA reservation',
  async (t) => {
    const fixture = await bootstrapMoveReplicaAssignment(t, {
      joiningNodeId: '550e8400-e29b-41d4-a716-446655440329',
      assignmentLeaseMs: 5,
      assignmentSweepIntervalMs: 5,
      ownsMoveReplicaAssignmentLifecycle: true,
    });

    await new Promise((resolve) => setTimeout(resolve, 30));

    const reservationRow = fixture.rows.replica_operations.find((row) =>
      row.operation_id === fixture.assignment.assignmentId,
    );
    t.equal(
      reservationRow?.status,
      'creating',
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

test('BootstrapAPI defers subsequent bootstrap while an expired non-terminal MOVE_REPLICA reservation is still open',
  async (t) => {
    const fixture = await bootstrapMoveReplicaAssignment(t, {
      joiningNodeId: '550e8400-e29b-41d4-a716-446655440332',
      assignmentLeaseMs: 5,
      assignmentSweepIntervalMs: 5,
      ownsMoveReplicaAssignmentLifecycle: true,
    });

    await new Promise((resolve) => setTimeout(resolve, 30));

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
      'bootstrap should still defer while the original MOVE_REPLICA handoff remains non-terminal after lease expiry',
    );
    t.equal(
      secondBootstrap.json().code,
      'BOOTSTRAP_NOT_READY',
      'deferred bootstrap should use the canonical not-ready code',
    );
    t.ok(
      (secondBootstrap.json().reasons || [])
        .includes('MOVE_REPLICA_HANDOFF_STABILIZING'),
      'deferred bootstrap should surface the open handoff stabilization reason',
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
        systemTableCache.applySystemTableChange(tableName, 'UPSERT', {
          ...expectedFields,
          ...expectedServiceRow,
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
