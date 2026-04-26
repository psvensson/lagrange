import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
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
  if (typeof options.configureApi === 'function') {
    await options.configureApi({
      api,
      rows,
      cache,
      sqlQueryEngine,
      cdcIntegrationService,
    });
  }
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

function configureSyntheticMoveReplicaRegisterServiceHandoff(
  api,
  expectedServiceRow,
  options = {},
) {
  const assignmentId = options.assignmentId || 'assignment-1';
  const sourceNodeId = options.sourceNodeId || 'seed-node-1';

  api.validateMoveReplicaAssignmentToken = async () => ({assignmentId});
  api.assertSingleOwnerReplicaRegistration = () => {};
  api.startMoveReplicaHandoff = async () => ({
    operationId: assignmentId,
    replicaId: expectedServiceRow.replica_id,
    sourceNodeId,
    targetNodeId: expectedServiceRow.node_id,
  });
  api.executeMoveReplicaHandoffPhase = async (
    _handoffContext,
    _phase,
    _workflowStep,
    _status,
    work,
  ) => work();
  api.verifyMoveReplicaHandoffTarget = async () => {};
  api.readCurrentRegisteredServiceRow = async () => null;
  api.removeLocalSourceReplicaForMoveReplica = async () => {};
  api.completeMoveReplicaHandoff = async () => {};
  api.restoreRegisteredServiceRowAfterFailedHandoff = async () => {};
  api.shouldPreserveMoveReplicaHandoffReservation = () => false;
  api.failMoveReplicaHandoff = async () => {};

  return assignmentId;
}

export {
  bootstrapMoveReplicaAssignment,
  buildRegisterPayload,
  configureSyntheticMoveReplicaRegisterServiceHandoff,
  createCdcIntegrationServiceFixture,
  initializeTestEnvironment,
};
