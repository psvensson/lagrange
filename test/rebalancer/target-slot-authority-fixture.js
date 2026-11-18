import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {REPLICA_OPERATIONS_SCHEMA} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {generateCreateIndexSQL, generateCreateTableSQL} from
  '../../src/bootstrap/system-table-schema-sql.js';
import {TABLES} from '../../src/constants/tables.js';
import {NODE_STATE} from '../../src/constants/node-state.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {createOperation, OperationType} from
  '../../src/rebalancer/replica-status.js';
import {EntityType, NodeStatus} from '../../src/rebalancer/unified-rebalancer.js';
import {
  buildSpreadScenarioHelpers,
  createAllowAllStorageAdmissionService,
  createMockCache,
  createMockControlPlaneReadinessService,
  createTestCoordinator,
  initializeSpreadTestEnvironment,
} from './test-helpers.js';

const SOURCE_NODE_ID = '0001';
const TARGET_NODE_ID = '0002';
const THIRD_NODE_ID = '0003';
const HELD_PARTITION_IDS = ['tables-p1', 'indices-p1'];
const CONTENDER_PARTITION_ID = 'config-p1';
const READY_LEASE_MS = 600_000;
const NODE_SCOPED_INCOMPLETE_PREDICATE =
  'WHERE (source_node_id = ? OR target_node_id = ?)';

function buildTargetSlotWorld() {
  const nodes = [SOURCE_NODE_ID, TARGET_NODE_ID, THIRD_NODE_ID].map((nodeId) => ({
    node_id: nodeId,
    status: NodeStatus.ACTIVE,
    connection_state: NODE_STATE.READY,
    ready_lease_expires_at: Date.now() + READY_LEASE_MS,
  }));
  const partitionIds = ['nodes-p1', ...HELD_PARTITION_IDS, CONTENDER_PARTITION_ID];
  const partitions = partitionIds.map((partitionId) => ({
    partition_id: partitionId,
    replica_count: 3,
  }));
  const services = partitionIds.flatMap((partitionId) => {
    const hostIds = partitionId === 'nodes-p1' ?
      [SOURCE_NODE_ID, TARGET_NODE_ID, THIRD_NODE_ID] : [SOURCE_NODE_ID];
    return hostIds.map((nodeId, index) => buildSpreadScenarioHelpers({
      partitionId,
      serviceType: EntityType.PARTITION,
      addressPrefix: `${nodeId}/partition/`,
      freeNodeIds: [TARGET_NODE_ID, THIRD_NODE_ID],
    }).createReplicaRow(
      `${partitionId}-r${index + 1}`, nodeId,
      index === 0 ? RAFT_ROLE.LEADER : RAFT_ROLE.FOLLOWER,
    ));
  });
  return {nodes, partitions, services};
}

function replaceSqliteRows(database, rows) {
  const tableName = REPLICA_OPERATIONS_SCHEMA.tableName;
  const columnNames = REPLICA_OPERATIONS_SCHEMA.columns.map((column) => column.name);
  database.exec(`DELETE FROM ${tableName}`);
  for (const row of rows) {
    const columns = columnNames.filter(
      (column) => Object.hasOwn(row, column) && row[column] !== undefined,
    );
    database.prepare(
      `INSERT INTO ${tableName} (${columns.join(', ')}) ` +
      `VALUES (${columns.map(() => '?').join(', ')})`,
    ).run(...columns.map((column) => row[column]));
  }
}

function installNativeIncompleteOperationRead(coordinator, database, readCalls) {
  const gateway = coordinator.repository.controlPlaneSystemTableGateway;
  const originalRead = gateway.readAuthoritativeRows.bind(gateway);
  gateway.readAuthoritativeRows = async (tableName, sql, params = [], options = {}) => {
    if (tableName !== TABLES.REPLICA_OPERATIONS ||
        !sql.includes(NODE_SCOPED_INCOMPLETE_PREDICATE)) {
      return originalRead(tableName, sql, params, options);
    }
    // The generic fixture parses equalities independently, turning the real
    // source-or-target predicate into AND. Read its separate persisted store
    // without that predicate; SQLite evaluates the original SQL and parameters.
    const persisted = await originalRead(tableName,
      `SELECT * FROM ${REPLICA_OPERATIONS_SCHEMA.tableName}`, [], options);
    assert.equal(persisted.success, true);
    assert.ok(Array.isArray(persisted.rows));
    replaceSqliteRows(database, persisted.rows);
    const rows = database.prepare(sql).all(...params);
    readCalls.push({
      sql, params: [...params], operationIds: rows.map((row) => row.operation_id),
    });
    return {...persisted, rows};
  };
}

function observeTargetSlotCalls(coordinator, cache, slotCalls) {
  const original = coordinator.ensureSystemPartitionTargetNodeSlotAllowed.bind(coordinator);
  coordinator.ensureSystemPartitionTargetNodeSlotAllowed = (...args) => {
    const observation = coordinator.repository.lastIncompleteOperationObservation;
    const call = {
      observationIsArray: Array.isArray(observation),
      observedOperationIds: Array.isArray(observation) ?
        observation.map((operation) => operation.operationId) : [],
      cachedOperationIds: cache.getAll(TABLES.REPLICA_OPERATIONS)
        .map((row) => row.operation_id),
      recentIntentCount: coordinator.recentOperationIntents.size,
    };
    slotCalls.push(call);
    try {
      call.decision = original(...args);
      return call.decision;
    } catch (error) {
      call.error = error;
      throw error;
    }
  };
}

/**
 * Real coordinator/repository admission with delayed cache delivery. The
 * existing fixture supplies readiness, storage, committed membership and
 * mutation transport. Production SQL runs in SQLite for the node-scoped owner
 * read. No global-budget or target-slot decision is replaced. This proves
 * admission/persistence at those ports, not cluster effect dispatch.
 * @param {Object} options - Held-row count and initial publication selection.
 * @return {Promise<Object>} Fixture with explicit publication and teardown.
 */
async function createTargetSlotAuthorityFixture({heldCount, publishHeldRows = false}) {
  initializeSpreadTestEnvironment(SOURCE_NODE_ID);
  const cache = createMockCache(buildTargetSlotWorld());
  const publishRow = cache.upsert.bind(cache);
  const persistedRows = new Map();
  cache.upsert = (tableName, rowOrKey, maybeRow) => {
    if (tableName !== TABLES.REPLICA_OPERATIONS) {
      return publishRow(tableName, rowOrKey, maybeRow);
    }
    const row = typeof rowOrKey === 'object' ? rowOrKey : maybeRow;
    persistedRows.set(row.operation_id, {...row});
    return row;
  };
  const coordinator = createTestCoordinator({
    nodeId: SOURCE_NODE_ID,
    systemTableCache: cache,
    controlPlaneReadinessService: createMockControlPlaneReadinessService({
      systemTableCache: cache,
    }),
    storageAdmissionService: createAllowAllStorageAdmissionService(),
    enableTimeouts: false,
  });
  const database = new Database(':memory:');
  const readCalls = [];
  const slotCalls = [];
  const heldOperations = [];
  const close = async () => {
    try {
      await coordinator.shutdown();
    } finally {
      database.close();
    }
  };
  try {
    database.exec(generateCreateTableSQL(REPLICA_OPERATIONS_SCHEMA));
    for (const indexSql of generateCreateIndexSQL(REPLICA_OPERATIONS_SCHEMA)) {
      database.exec(indexSql);
    }
    installNativeIncompleteOperationRead(coordinator, database, readCalls);
    observeTargetSlotCalls(coordinator, cache, slotCalls);
    assert.ok(heldCount > 0 && heldCount <= HELD_PARTITION_IDS.length);
    for (const partitionId of HELD_PARTITION_IDS.slice(0, heldCount)) {
      const operation = createOperation({
        operationId: `held-target-slot-${partitionId}`,
        type: OperationType.ADD,
        partitionId,
        sourceNodeId: SOURCE_NODE_ID,
        targetNodeId: TARGET_NODE_ID,
        replicaId: `${partitionId}-r2`,
      });
      operation.entityType = EntityType.PARTITION;
      operation.entityId = partitionId;
      assert.equal(await coordinator.repository.persistNewOperation(operation), true);
      heldOperations.push(operation);
    }
    const publishOperation = (operationId) => {
      const row = persistedRows.get(operationId);
      assert.ok(row, 'publication must use an actual repository-produced row');
      return publishRow(TABLES.REPLICA_OPERATIONS, row);
    };
    if (publishHeldRows) {
      for (const operation of heldOperations) publishOperation(operation.operationId);
    }
    assert.equal(coordinator.recentOperationIntents.size, 0);
    assert.equal(persistedRows.size, heldCount);
    return {
      coordinator, cache, heldOperations, persistedRows, readCalls, slotCalls,
      publishOperation, close,
      createContender: () => coordinator.createOperation({
        type: OperationType.ADD,
        entityType: EntityType.PARTITION,
        entityId: CONTENDER_PARTITION_ID,
        partitionId: CONTENDER_PARTITION_ID,
        nodeId: TARGET_NODE_ID,
        replicaId: `${CONTENDER_PARTITION_ID}-r2`,
        enforceConcurrentOperationBudget: true,
      }),
    };
  } catch (error) {
    await close();
    throw error;
  }
}

export {createTargetSlotAuthorityFixture};
