import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {BOOTSTRAP_API_CACHE_VISIBILITY} from '../../src/bootstrap/bootstrap-api-constants.js';
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

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: cache,
    messageGroupServices,
    moveReplicaAssignmentLeaseMs: options.assignmentLeaseMs,
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

test('BootstrapAPI register-service rejects expired and mismatched assignment token', async (t) => {
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

  const expiredFixture = await bootstrapMoveReplicaAssignment(t, {
    joiningNodeId: '550e8400-e29b-41d4-a716-446655440323',
    assignmentLeaseMs: 5,
  });
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
    'register-service should fail closed when assignment lease is expired',
  );
  t.equal(
    expiredResponse.json().code,
    'ASSIGNMENT_TOKEN_EXPIRED',
    'expired token rejection should emit stable reason code',
  );
});

test('BootstrapAPI does not expire committed MOVE_REPLICA operations on subsequent bootstrap',
  async (t) => {
    const fixture = await bootstrapMoveReplicaAssignment(t, {
      joiningNodeId: '550e8400-e29b-41d4-a716-446655440325',
    });
    const {api, assignment, joiningNodeId, rows} = fixture;

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
    t.equal(secondBootstrap.statusCode, 200, 'second bootstrap should succeed');

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

test('BootstrapAPI register-service accepts storage-visible row when cache is stale',
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
      200,
      'register-service should succeed when services row is visible in storage',
    );
    t.equal(
      response.json().success,
      true,
      'register-service should return success payload',
    );
    t.ok(
      storageVisibilityLookups > 0,
      'register-service should check authoritative storage visibility',
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
