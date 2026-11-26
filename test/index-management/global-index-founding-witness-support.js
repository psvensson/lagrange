import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  generateCreateTableSQL,
  getSchemaByTableName,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  buildSystemTableMutationSqlParts,
} from '../../src/cdc/cdc-system-table-mutation-sql-helpers.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {PartitionServiceRowOwner} from '../../src/partition/partition-service-row-owner.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {waitForCondition} from '../partition/partition-service-test-support.js';
import {withFoundingStamp} from '../partition/partition-founding-stamp.js';
import {
  resumeFixtureParticipantAdmission,
} from '../test-helpers/participant-transaction-fixture.js';
import {
  createTransactionPersistenceGateway,
} from '../test-helpers/transaction-persistence-gateway.js';
import {createReadinessServiceForTest} from '../helpers/readiness-service-fixture.js';
import {
  attachAutoCommitLoop,
  createCoordinatorWithLedger,
} from '../partition/placement-create-with-ledger-fixture.js';
import {onLedgerLeader} from '../partition/placement-admission-fixture.js';
import {
  serveRefreshPublication,
} from '../query/schema-provisioning-job-test-support.js';

function createLocalServeClock() {
  return {
    now: 1000,
    setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimeout: (timer) => clearTimeout(timer),
  };
}

const SYSTEM_TABLE_NAMES = [
  TABLES.SCHEMA_OPERATIONS,
  TABLES.TABLES,
  TABLES.PARTITIONS,
  TABLES.INDICES,
  TABLES.SERVICES,
];
const TX_TABLES = new Set([
  TABLES.SQL_TRANSACTIONS,
  TABLES.SQL_TRANSACTION_PARTICIPANTS,
  TABLES.SQL_WRITE_OPERATIONS,
]);

function filterRowForSystemTable(tableName, values) {
  const cols = new Set(getSchemaByTableName(tableName).columns.map((c) => c.name));
  return Object.fromEntries(
    Object.entries(values || {}).filter(([k, v]) => cols.has(k) && v !== undefined),
  );
}

function executeSystemDbMutation(db, mutation) {
  const op = String(mutation.operation || '').toLowerCase();
  const tableName = mutation.tableName;
  if (op === 'insert' || op === 'upsert') {
    const filtered = filterRowForSystemTable(tableName, mutation.row);
    const parts = buildSystemTableMutationSqlParts(CDC_OPERATION.INSERT, filtered);
    const verb = op === 'upsert' ? 'INSERT OR REPLACE' : 'INSERT';
    try {
      const info = db.prepare(
        `${verb} INTO ${tableName} (${parts.columns}) VALUES (${parts.placeholders})`,
      ).run(...parts.values);
      return {success: true, affectedRows: info.changes, visibilityState: 'visible'};
    } catch (err) {
      return {success: false, affectedRows: 0, error: err.message};
    }
  }
  const where = buildSystemTableMutationSqlParts(CDC_OPERATION.DELETE, mutation.whereClause);
  if (op === 'delete') {
    const info = db.prepare(
      `DELETE FROM ${tableName} WHERE ${where.whereStr}`,
    ).run(...where.values);
    return {success: true, affectedRows: info.changes, visibilityState: 'visible'};
  }
  const set = buildSystemTableMutationSqlParts(
    CDC_OPERATION.UPDATE,
    filterRowForSystemTable(tableName, mutation.data),
  );
  const info = db.prepare(
    `UPDATE ${tableName} SET ${set.setClause} WHERE ${where.whereStr}`,
  ).run(...set.values, ...where.values);
  return {success: true, affectedRows: info.changes, visibilityState: 'visible'};
}

function createGatewayHandleForDbAndCache(db, cache, txGateway, {ownsDb = true} = {}) {
  const applyCacheChange = (tableName, operation, rowOrWhere, data) => {
    if (!cache?.applySystemTableChange) return;
    if (operation === 'delete') {
      cache.applySystemTableChange(tableName, CDC_OPERATION.DELETE, rowOrWhere);
      return;
    }
    const merged = data ? {...rowOrWhere, ...data} : rowOrWhere;
    cache.applySystemTableChange(tableName, CDC_OPERATION.UPSERT, merged);
  };

  const gateway = {
    db,
    supportsMutationSubmission: () => true,
    awaitProjectionAt: (position) => Promise.resolve({outcome: 'reached', position}),
    async submitMutation(mutation, mutationOptions = {}) {
      if (TX_TABLES.has(mutation.tableName)) {
        return txGateway.submitMutation(mutation, mutationOptions);
      }
      const res = executeSystemDbMutation(db, mutation);
      if (res.success && res.affectedRows > 0) {
        const op = String(mutation.operation || '').toLowerCase();
        applyCacheChange(
          mutation.tableName,
          op,
          mutation.row || mutation.whereClause,
          mutation.data,
        );
      }
      return {
        ...res,
        position: {
          tableName: mutation.tableName,
          key: mutation.row?.table_id ?? mutation.row?.partition_id ?? mutation.row?.job_id,
          originHlc: `${Date.now()}-1-witness`,
        },
      };
    },
    async readAuthoritativeRows(tableName, sql, params = []) {
      if (TX_TABLES.has(tableName)) {
        return txGateway.readAuthoritativeRows(tableName, sql, params);
      }
      return {success: true, rows: db.prepare(sql).all(...params)};
    },
    async readRows(tableName, sql, params = []) {
      if (TX_TABLES.has(tableName)) {
        return txGateway.readAuthoritativeRows(tableName, sql, params);
      }
      return {success: true, rows: db.prepare(sql).all(...params)};
    },
    async insertSystemTableRow(tableName, data) {
      const res = executeSystemDbMutation(db, {operation: 'upsert', tableName, row: data});
      if (res.success) applyCacheChange(tableName, 'insert', data);
      return res;
    },
    async updateSystemTableRow(tableName, whereClause, data) {
      const res = executeSystemDbMutation(db, {
        operation: 'update',
        tableName,
        whereClause,
        data,
      });
      if (res.success) applyCacheChange(tableName, 'update', whereClause, data);
      return res;
    },
    async deleteSystemTableRow(tableName, whereClause) {
      const res = executeSystemDbMutation(db, {operation: 'delete', tableName, whereClause});
      if (res.success) applyCacheChange(tableName, 'delete', whereClause);
      return res;
    },
    close() {
      if (ownsDb) {
        txGateway.db.close();
        db.close();
      }
    },
  };

  // The harness stores schema_operations in its catalog SQLite DB. Expose
  // that same store through the production local-leader read contract.
  const schemaLeader = {
    partitionId: 'schema_operations-p1', isLeader: true, leadershipTenure: {},
    writeTraffic: {getSnapshot: () => ({committedWrites:
      db.prepare('SELECT total_changes() AS n').get().n})},
    async executeLocalQuery(sql, params) {
      return {success: true, rows: db.prepare(sql).all(...params), rowSetComplete: true,
        partitionId: this.partitionId};
    },
  };
  const cdcService = {
    resolveSystemTablePartitionIds: () => [schemaLeader.partitionId],
    hostedReplicaOwner: {hostedPartitionReplicas: (id) =>
      id === schemaLeader.partitionId ? [schemaLeader] : []},
    insertSystemTableRow: (tableName, data) => gateway.insertSystemTableRow(tableName, data),
    updateSystemTableRow: (tableName, whereClause, data) =>
      gateway.updateSystemTableRow(tableName, whereClause, data),
    deleteSystemTableRow: (tableName, whereClause) =>
      gateway.deleteSystemTableRow(tableName, whereClause),
  };

  return {gateway, cdcService};
}

function createSchemaAwareSystemGateway(catalogDbPath, cache) {
  const db = new Database(catalogDbPath);
  for (const tableName of SYSTEM_TABLE_NAMES) {
    db.exec(generateCreateTableSQL(getSchemaByTableName(tableName)));
  }
  const txGateway = createTransactionPersistenceGateway();
  const handle = createGatewayHandleForDbAndCache(db, cache, txGateway, {ownsDb: true});
  return {
    ...handle,
    txGateway,
  };
}

function normalizeRestartCacheRow(tableName, row) {
  if (tableName !== TABLES.PARTITIONS || row?.partition_key_type !== 'INTEGER') {
    return row;
  }
  return {
    ...row,
    partition_key_start: row.partition_key_start === null || row.partition_key_start === undefined ?
      null :
      Number(row.partition_key_start),
    partition_key_end: row.partition_key_end === null || row.partition_key_end === undefined ?
      null :
      Number(row.partition_key_end),
  };
}

function createRestartCacheAndGatewayFromGateway(existingGateway, partitionServices = null) {
  const db = existingGateway.db;
  const freshCache = new SystemTableCache();
  for (const tableName of SYSTEM_TABLE_NAMES) {
    const rows = db.prepare(`SELECT * FROM ${tableName}`).all();
    for (const row of rows) {
      freshCache.applySystemTableChange(
        tableName,
        CDC_OPERATION.INSERT,
        normalizeRestartCacheRow(tableName, row),
      );
    }
  }
  if (partitionServices) {
    for (const ps of partitionServices.values()) {
      const existingSvc = freshCache.getAll(TABLES.SERVICES).find(
        (s) => s.partition_id === ps.partitionId,
      );
      if (!existingSvc) {
        freshCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
          service_id: ps.replicaId || ps.partitionId,
          service_type: 'partition',
          partition_id: ps.partitionId,
          node_id: ps.nodeId || 'test-node',
          raft_role: 'leader',
          address: `${ps.nodeId || 'test-node'}/partition/${ps.partitionId}`,
          status: 'active',
        });
      }
    }
  }
  const txGateway = existingGateway.txGateway || existingGateway;
  const handle = createGatewayHandleForDbAndCache(db, freshCache, txGateway, {ownsDb: false});
  return {cache: freshCache, ...handle};
}

function serializeBoundaryValue(val) {
  return val === null || val === undefined ? null : String(val);
}

function seedGatewayTableRow(db, t, now) {
  const pkCol = t.partition_key || 'id';
  const schemaDef = t.schema || {columns: [{name: pkCol, type: t.partition_key_type || 'INTEGER'}]};
  executeSystemDbMutation(db, {
    operation: 'upsert',
    tableName: TABLES.TABLES,
    row: {
      table_id: t.table_id || t.table_name,
      table_name: t.table_name,
      schema_definition: JSON.stringify(schemaDef),
      partition_key: pkCol,
      table_policies: '{}',
      partition_count: 1,
      active_partition_version: t.active_partition_version || 1,
      created_at: now,
      updated_at: now,
    },
  });
}

function seedGatewayPartitionRow(db, tables, p, now) {
  const ownerTable = tables.find(
    (t) => (t.table_name || t.table_id) === (p.table_name || p.table_id),
  );
  executeSystemDbMutation(db, {
    operation: 'upsert',
    tableName: TABLES.PARTITIONS,
    row: {
      partition_id: p.partition_id,
      table_id: p.table_id || p.table_name,
      table_name: p.table_name,
      partition_key_start: serializeBoundaryValue(p.partition_key_start),
      partition_key_end: serializeBoundaryValue(p.partition_key_end),
      partition_key_type: p.partition_key_type || ownerTable?.partition_key_type || 'TEXT',
      partition_version: 1,
      replica_count: 1,
      size_bytes: 0,
      leader_node_id: p.leader_node_id || 'test-node',
      state: 'NORMAL',
      created_at: now,
      updated_at: now,
    },
  });
}

function createSeededSchemaAwareGateway(catalogDbPath, tables, partitions, systemCache = null) {
  const result = createSchemaAwareSystemGateway(catalogDbPath, systemCache);
  const now = Date.now();
  for (const t of tables) {
    seedGatewayTableRow(result.gateway.db, t, now);
  }
  for (const p of partitions) {
    seedGatewayPartitionRow(result.gateway.db, tables, p, now);
  }
  return result;
}

function seedRealSystemTableCache(tables, partitions, nodeId = 'test-node') {
  const cache = new SystemTableCache();
  for (const t of tables) {
    cache.applySystemTableChange(TABLES.TABLES, CDC_OPERATION.INSERT, {
      ...t,
      schema_definition: t.schema_definition || (t.schema ? JSON.stringify(t.schema) : undefined),
    });
  }
  for (const p of partitions) {
    const ownerTable = tables.find(
      (t) => (t.table_name || t.table_id) === (p.table_name || p.table_id),
    );
    cache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.INSERT, {
      partition_version: 1,
      replica_count: 1,
      size_bytes: 0,
      leader_node_id: p.leader_node_id || nodeId,
      state: 'NORMAL',
      partition_key_type: p.partition_key_type || ownerTable?.partition_key_type || 'TEXT',
      ...p,
    });
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
      service_id: p.partition_id,
      service_type: 'partition',
      partition_id: p.partition_id,
      node_id: p.leader_node_id || nodeId,
      raft_role: 'leader',
      address: `${p.leader_node_id || nodeId}/partition/${p.partition_id}`,
      status: 'active',
    });
  }
  return cache;
}

function createTargetRouter(partitionServices) {
  return {
    async deliver(address, message) {
      const parts = address.split('/');
      const targetId = parts[1] === 'partition' ? parts[2] : parts[1];
      let target = partitionServices.get(targetId);
      if (!target) {
        for (const svc of partitionServices.values()) {
          if (svc.partitionId === targetId || svc.replicaId === targetId) {
            target = svc;
            break;
          }
        }
      }
      if (!target) {
        return buildDeliveryEnvelope(
          {acknowledged: false, error: `Participant unavailable: ${address}`},
          {success: false, error: `Participant unavailable: ${address}`},
        );
      }
      const response = await target.handleApplicationMessage(message);
      return buildDeliveryEnvelope({acknowledged: true}, response);
    },
  };
}

async function withFoundingPlacementEnvironment(callback) {
  await onLedgerLeader(async (leader, proposed) => {
    const stopAutoCommit = attachAutoCommitLoop(leader, proposed);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lagrange-gsi-2a-'));
    const partitionServices = new Map();
    const cache = new SystemTableCache();
    const clock = createLocalServeClock();
    const state = {
      nodes: [{
        node_id: 'test-node',
        status: 'active',
        boot_incarnation: 1,
        ready_lease_expires_at: Date.now() + 3600000,
      }],
      publications: [serveRefreshPublication(3, ['test-node'])],
    };
    const readinessView = {
      canRead: () => true,
      async readReadinessOwnerRows(tableName) {
        const rows = tableName === TABLES.NODES ? state.nodes : state.publications;
        return {success: true, rows: structuredClone(rows)};
      },
    };
    const readiness = createReadinessServiceForTest({
      nodeId: 'test-node',
      systemTableCache: cache,
      authoritativeControlPlaneView: readinessView,
      now: () => clock.now,
      setTimeoutFn: clock.setTimeout,
      clearTimeoutFn: clock.clearTimeout,
    });
    readiness.answerCommittedNodes = () => ({formation: {state: 'FORMED', latchEpoch: 4}});
    await readiness.readServeEligibility();

    const {gateway, cdcService} = createSchemaAwareSystemGateway(
      path.join(tmpDir, 'catalog.db'),
      cache,
    );
    const coordinator = createCoordinatorWithLedger(leader);
    coordinator.nodeId = 'test-node';
    coordinator.systemTableCache = cache;
    coordinator.controlPlaneReadinessService = readiness;

    const usersSchema = {
      columns: [
        {name: 'id', type: 'INTEGER', primaryKey: true},
        {name: 'email', type: 'TEXT'},
        {name: 'name', type: 'TEXT'},
        {name: 'status', type: 'TEXT'},
      ],
      primaryKey: ['id'],
    };
    await gateway.insertSystemTableRow(TABLES.TABLES, {
      table_id: 'users',
      table_name: 'users',
      schema_definition: JSON.stringify(usersSchema),
      partition_key: 'id',
      table_policies: '{}',
      partition_count: 1,
      active_partition_version: 1,
      created_at: Date.now(),
      updated_at: Date.now(),
    });
    await gateway.insertSystemTableRow(TABLES.PARTITIONS, {
      partition_id: 'users_p0',
      table_id: 'users',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: null,
      partition_key_type: 'INTEGER',
      partition_version: 1,
      replica_count: 1,
      size_bytes: 0,
      leader_node_id: 'test-node',
      state: 'NORMAL',
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    const basePartition = new PartitionService(withFoundingStamp({
      partitionId: 'users_p0',
      tableId: 'users',
      tableName: 'users',
      replicaId: 'users_p0-r1',
      replicaIds: ['users_p0-r1'],
      nodeId: 'test-node',
      systemTableCache: cache,
      dbPath: path.join(tmpDir, 'users_p0.db'),
      keyRange: {start: null, end: null},
      schema: usersSchema,
    }));
    await basePartition.initialize();
    basePartition.startElection();
    await waitForCondition(() => basePartition.role === 'leader', 3000, 5);
    await resumeFixtureParticipantAdmission(basePartition);
    partitionServices.set('users_p0-r1', basePartition);

    const rowOwner = new PartitionServiceRowOwner({systemTableWriter: gateway});
    await rowOwner.registerReplica({
      partitionId: 'users_p0',
      replicaId: 'users_p0-r1',
      nodeId: 'test-node',
      service: basePartition,
      status: 'active',
    });

    const createdReplicas = [];
    coordinator.workflowOwner = {
      async executeOperation(operation) {
        const rawSchemaDef = operation.bootstrapTableMetadata?.schema_definition;
        const schemaDef = typeof rawSchemaDef === 'string' ?
          JSON.parse(rawSchemaDef) :
          null;
        if (!schemaDef) {
          throw new Error('bootstrapTableMetadata.schema_definition is required');
        }
        const ps = new PartitionService({
          partitionId: operation.partitionId,
          tableId: operation.bootstrapTableMetadata.table_id,
          tableName: operation.bootstrapTableMetadata.table_name,
          replicaId: operation.replicaId,
          replicaIds: operation.replicaIds,
          nodeId: operation.targetNodeId,
          bootstrapMembership: operation.bootstrapMembership,
          systemTableCache: cache,
          dbPath: path.join(tmpDir, `${operation.replicaId}.db`),
          keyRange: {
            start: operation.bootstrapPartitionMetadata?.partition_key_start ?? null,
            end: operation.bootstrapPartitionMetadata?.partition_key_end ?? null,
          },
          schema: schemaDef,
        });
        await ps.initialize();
        ps.startElection();
        await waitForCondition(() => ps.role === 'leader', 3000, 5);
        await resumeFixtureParticipantAdmission(ps);
        partitionServices.set(operation.replicaId, ps);
        createdReplicas.push(ps);
        await rowOwner.registerReplica({
          partitionId: operation.partitionId,
          replicaId: operation.replicaId,
          nodeId: operation.targetNodeId,
          service: ps,
          status: 'active',
        });
        await gateway.updateSystemTableRow(
          TABLES.PARTITIONS,
          {partition_id: operation.partitionId},
          {leader_node_id: operation.targetNodeId},
        );
        return {success: true};
      },
    };

    const messageRouter = createTargetRouter(partitionServices);
    const engine = new SQLQueryEngine({
      nodeId: 'test-node',
      systemCache: cache,
      controlPlaneReadinessService: readiness,
      controlPlaneSystemTableGateway: gateway,
      cdcIntegrationService: cdcService,
      messageRouter,
      partitionServicesProvider: () => partitionServices,
      rebalanceCoordinator: coordinator,
      autoStartDistributedTransactionRecovery: false,
      migrationAutoWire: false,
    });
    engine.setRebalanceCoordinator(coordinator);

    try {
      await callback({
        engine,
        leader,
        proposed,
        coordinator,
        cache,
        gateway,
        readiness,
        basePartition,
        partitionServices,
        createdReplicas,
      });
    } finally {
      await engine.shutdown().catch(() => {});
      readiness.shutdown();
      for (const ps of createdReplicas) {
        await ps.shutdown().catch(() => {});
      }
      await basePartition.shutdown().catch(() => {});
      gateway.close();
      await stopAutoCommit();
      fs.rmSync(tmpDir, {recursive: true, force: true});
    }
  });
}

export {
  createRestartCacheAndGatewayFromGateway,
  createSchemaAwareSystemGateway,
  createSeededSchemaAwareGateway,
  createTargetRouter,
  seedRealSystemTableCache,
  withFoundingPlacementEnvironment,
};
