/**
 * Comprehensive adversarial negative test suite for the system-table SQL
 * ingress boundary across all 46 system tables, all 6 client entry surfaces,
 * and all parser/lexer evasion vectors.
 */
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import Database from 'better-sqlite3';
import {test} from '../../src/test-helpers/tap.js';
import {TABLES} from '../../src/constants/tables.js';
import {
  SYSTEM_TABLE_NAME,
  isSystemTableName,
} from '../../src/bootstrap/system-table-schema-shared-constants.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  EXECUTION_MODE,
  createSqlRequest,
} from '../../src/query/sql-request.js';
import {ADAPTER_TYPE} from '../../src/query/sql-adapter-constants.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';
import {
  STATEMENT_INGRESS,
  STATEMENT_INGRESS_FIELD,
} from '../../src/query/sql-statement-ingress.js';
import {createBoundApplicationDatabaseRuntime} from
  '../../src/query/application-database.js';
import {TableCreationService} from
  '../../src/query/table-creation-service.js';
import {
  MIGRATION_PIPELINE_ERROR_MSG,
  MigrationPipeline,
} from '../../src/migration/migration-pipeline.js';
import {MigrationCoordinator} from
  '../../src/migration/migration-coordinator.js';
import {PARTITION_SERVICE_REMOTE_QUERY_METHODS} from
  '../../src/partition/partition-service-remote-query-methods.js';
import {PARTITION_SERVICE_MIGRATION_OPERATION} from
  '../../src/partition/partition-service-constants.js';
import {classifyPartitionStatementHead} from
  '../../src/partition/partition-statement-admission.js';
import {PARTITION_STATEMENT_KIND} from
  '../../src/partition/partition-statement-admission-constants.js';
import {ExchangeManager} from
  '../../src/query/distributed/exchange-manager.js';
import {TRANSACTION_SCHEMA_ENFORCEMENT_ERROR} from
  '../../src/query/distributed/distributed-transaction-schema-enforcement.js';
import {AdminWebSocketAPI} from '../../src/admin/admin-websocket-api.js';
import {
  PgWireProtocolHandler,
  buildBackendKeyData,
} from '../../src/runtime/pgwire-protocol-handler.js';
import {
  PG_BACKEND_MSG,
  PG_FRONTEND_MSG,
  PG_PROTOCOL_VERSION,
} from '../../src/runtime/pgwire-protocol-constants.js';
import {resolveFailureSqlState} from
  '../../src/runtime/pgwire-result-mapper.js';
import {SqlQueryLoopRuntimeModule} from
  '../../src/runtime/sql-query-loop-runtime-module.js';
import {isValidParallelReduceConfig} from
  '../../src/runtime/sql-query-loop-parallel-reduce.js';
import {PREPARE_STATUS} from '../../src/runtime/runtime-driver.js';
import {createTestPostgresWireAdapter} from
  '../helpers/pgwire-auth-handler.js';
import {createTransactionPersistenceGateway} from
  '../test-helpers/transaction-persistence-gateway.js';
import {answerParticipantTransactionRequest} from
  '../test-helpers/participant-protocol-double.js';
import {buildDeliveryEnvelope} from
  '../../src/transport/transport-semantic-outcome.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}
const logging = LoggingService.getInstance();
if (!logging.isInitialized()) {
  logging.initialize({level: 'error'});
}

const ALL_SYSTEM_TABLES = Object.freeze(Object.values(TABLES));
const USER_TABLE_NAME = 'app_items';

function buildSystemTargetVariants(tableName) {
  return [
    tableName,
    `"global"."${tableName}"`,
  ];
}

function buildEngineWriteVectors(targetName) {
  return [
    {
      sql: `INSERT INTO ${targetName} (id) VALUES ('adv-1')`,
      expectedErrorCode: QUERY_ERROR_CODE.SYSTEM_TABLE_WRITE_REFUSED,
    },
    {
      sql: `INSERT OR REPLACE INTO ${targetName} (id) VALUES ('adv-replace')`,
      expectedErrorCode: QUERY_ERROR_CODE.SYSTEM_TABLE_WRITE_REFUSED,
    },
    {
      sql: `INSERT OR IGNORE INTO ${targetName} (id) VALUES ('adv-ignore')`,
      expectedErrorCode: QUERY_ERROR_CODE.SYSTEM_TABLE_WRITE_REFUSED,
    },
    {
      sql: `UPDATE ${targetName} SET id = 'adv-2' WHERE id = 'adv-1'`,
      expectedErrorCode: QUERY_ERROR_CODE.SYSTEM_TABLE_WRITE_REFUSED,
    },
    {
      sql: `DELETE FROM ${targetName} WHERE id = 'adv-1'`,
      expectedErrorCode: QUERY_ERROR_CODE.SYSTEM_TABLE_WRITE_REFUSED,
    },
    {
      sql: `ALTER TABLE ${targetName} ADD COLUMN adv_col TEXT`,
      expectedErrorCode: QUERY_ERROR_CODE.SYSTEM_TABLE_WRITE_REFUSED,
    },
    {
      sql: `DROP TABLE ${targetName}`,
      expectedErrorCode: QUERY_ERROR_CODE.SYSTEM_TABLE_WRITE_REFUSED,
    },
    {
      sql: `DROP TABLE IF EXISTS ${targetName}`,
      expectedErrorCode: QUERY_ERROR_CODE.SYSTEM_TABLE_WRITE_REFUSED,
    },
    {
      sql: `/* c-style comment */ UPDATE ${targetName} SET id = 'adv-3'`,
      expectedErrorCode: QUERY_ERROR_CODE.SYSTEM_TABLE_WRITE_REFUSED,
    },
    {
      sql: `-- line comment\nDELETE FROM ${targetName} WHERE id = 'adv-1'`,
      expectedErrorCode: QUERY_ERROR_CODE.SYSTEM_TABLE_WRITE_REFUSED,
    },
    {
      sql: `CREATE TABLE ${targetName} (id TEXT PRIMARY KEY)`,
      expectedErrorCode: QUERY_ERROR_CODE.SYSTEM_TABLE_NAME_RESERVED,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS ${targetName} (id TEXT PRIMARY KEY)`,
      expectedErrorCode: QUERY_ERROR_CODE.SYSTEM_TABLE_NAME_RESERVED,
    },
  ];
}

function buildPartitionWriteVectors(targetName) {
  return [
    `INSERT INTO ${targetName} (id) VALUES ('adv-1')`,
    `UPDATE ${targetName} SET id = 'adv-2' WHERE id = 'adv-1'`,
    `DELETE FROM ${targetName} WHERE id = 'adv-1'`,
    `CREATE TABLE ${targetName} (id TEXT PRIMARY KEY)`,
    `ALTER TABLE ${targetName} ADD COLUMN adv_col TEXT`,
    `DROP TABLE ${targetName}`,
    `/* comment */ DELETE FROM ${targetName} WHERE id = 'adv-1'`,
    `/* comment */ ALTER TABLE ${targetName} ADD COLUMN adv_col TEXT`,
    `/* comment */ DROP TABLE ${targetName}`,
    `-- line comment\nUPDATE ${targetName} SET id = 'adv-2'`,
    `\uFEFFINSERT INTO ${targetName} (id) VALUES ('adv-bom')`,
    `REPLACE INTO ${targetName} (id) VALUES ('adv-replace')`,
    `WITH cte AS (SELECT 1) DELETE FROM ${targetName}`,
  ];
}

function createAdversarialSystemCache() {
  const tableNames = [...ALL_SYSTEM_TABLES, USER_TABLE_NAME];
  const tables = tableNames.map((name) => ({
    table_name: name,
    table_id: name,
    primaryKey: 'id',
    schema_definition: JSON.stringify({
      columns: [{name: 'id', type: 'TEXT', primaryKey: true}],
    }),
  }));
  const partitions = tableNames.map((name) => ({
    partition_id: `${name}-p1`,
    table_id: name,
    table_name: name,
    partition_key_start: null,
    partition_key_end: null,
    leader_node_id: 'test-node',
  }));
  const services = partitions.map((p) => ({
    service_id: p.partition_id,
    service_type: 'partition',
    partition_id: p.partition_id,
    node_id: 'test-node',
    raft_role: 'leader',
    address: `test-node/partition/${p.partition_id}`,
    status: 'active',
  }));
  return {
    get(type, key) {
      return type === 'tables' ?
        tables.find((t) => t.table_name === key || t.table_id === key) || null :
        null;
    },
    filter(type, predicate) {
      if (type === 'partitions') return partitions.filter(predicate);
      if (type === 'services') return services.filter(predicate);
      if (type === 'tables') return tables.filter(predicate);
      return [];
    },
    getAll(type) {
      if (type === 'partitions') return partitions;
      if (type === 'tables') return tables;
      if (type === 'services') return services;
      return [];
    },
  };
}

function createAdversarialEngine() {
  const delivered = [];
  const systemCache = createAdversarialSystemCache();
  const gateway = createTransactionPersistenceGateway();
  const tableCreationService = new TableCreationService({
    systemTableCache: systemCache,
    controlPlaneSystemTableGateway: gateway,
    partitionProvisioner: async () => {
      throw new Error('partitionProvisioner must not run for system tables');
    },
  });
  const migrationCoordinator = new MigrationCoordinator({
    systemTableCache: systemCache,
    sqlCore: {
      async executeQuery() {
        throw new Error('migration sqlCore must not run for system tables');
      },
    },
  });
  const migrationPipeline = new MigrationPipeline({migrationCoordinator});
  const engine = new SQLQueryEngine({
    systemCache,
    tableCreationService,
    migrationPipeline,
    messageRouter: {
      async deliver(address, message) {
        if (message.type === 'QUERY') {
          delivered.push({address, message});
          const isUserRead =
            typeof message.sql === 'string' &&
            message.sql.includes(USER_TABLE_NAME) &&
            message.sql.trim().toUpperCase().startsWith('SELECT');
          return buildDeliveryEnvelope(
            {acknowledged: true},
            {
              success: true,
              rows: isUserRead ? [{id: 'item-1'}] : [],
              changes: isUserRead ? 0 : 1,
            },
          );
        }
        if (message.type === 'TRANSACTION') {
          return buildDeliveryEnvelope(
            {acknowledged: true},
            answerParticipantTransactionRequest(message),
          );
        }
        return buildDeliveryEnvelope({acknowledged: true}, {success: true});
      },
    },
    controlPlaneSystemTableGateway: gateway,
  });
  return {
    engine,
    delivered,
    tableCreationService,
    migrationPipeline,
    migrationCoordinator,
  };
}

class MockPgSocket extends EventEmitter {
  constructor() {
    super();
    this.written = [];
  }

  write(buf) {
    this.written.push(Buffer.from(buf));
    return true;
  }

  end() {}

  destroy() {}

  findMessages(type) {
    const all = Buffer.concat(this.written);
    const msgs = [];
    let offset = 0;
    while (offset + 5 <= all.length) {
      const msgType = all[offset];
      const len = all.readInt32BE(offset + 1);
      const total = 1 + len;
      if (offset + total > all.length) break;
      if (msgType === type) {
        msgs.push(all.subarray(offset, offset + total));
      }
      offset += total;
    }
    return msgs;
  }
}

function buildPgFrontendMsg(type, payload) {
  const len = 4 + payload.length;
  const buf = Buffer.allocUnsafe(1 + len);
  buf[0] = type;
  buf.writeInt32BE(len, 1);
  payload.copy(buf, 5);
  return buf;
}

function buildPgStartupMsg(user = 'admin') {
  const parts = ['user', user];
  const size = 8 + parts.reduce((n, s) => n + Buffer.byteLength(s) + 1, 0) + 1;
  const buf = Buffer.alloc(size);
  buf.writeInt32BE(size, 0);
  buf.writeInt32BE(PG_PROTOCOL_VERSION.CODE, 4);
  let offset = 8;
  for (const part of parts) {
    offset += buf.write(part, offset, 'utf8');
    buf[offset++] = 0;
  }
  return buf;
}

function buildPgSimpleQueryMsg(sql) {
  const payload = Buffer.alloc(Buffer.byteLength(sql, 'utf8') + 1);
  payload.write(sql, 0, 'utf8');
  return buildPgFrontendMsg(PG_FRONTEND_MSG.QUERY, payload);
}

function buildPgExtendedBatch(sql) {
  const qBytes = Buffer.byteLength(sql, 'utf8');
  const parsePayload = Buffer.alloc(1 + qBytes + 1 + 2);
  parsePayload.write(sql, 1, 'utf8');
  const bindPayload = Buffer.alloc(1 + 1 + 2 + 2 + 2);
  const execPayload = Buffer.alloc(1 + 4);
  const syncPayload = Buffer.alloc(0);
  return Buffer.concat([
    buildPgFrontendMsg(PG_FRONTEND_MSG.PARSE, parsePayload),
    buildPgFrontendMsg(PG_FRONTEND_MSG.BIND, bindPayload),
    buildPgFrontendMsg(PG_FRONTEND_MSG.EXECUTE, execPayload),
    buildPgFrontendMsg(PG_FRONTEND_MSG.SYNC, syncPayload),
  ]);
}

test('all 46 system tables resolve exact-case logical table identity with or without global prefix',
  async (t) => {
    const schemaNames = Object.values(SYSTEM_TABLE_NAME);
    t.equal(ALL_SYSTEM_TABLES.length, schemaNames.length);
    for (const tableName of ALL_SYSTEM_TABLES) {
      for (const variant of [tableName, `global.${tableName}`]) {
        t.equal(
          isSystemTableName(variant),
          true,
          `isSystemTableName(${variant}) must be true`,
        );
      }
      t.equal(
        isSystemTableName(tableName.toUpperCase()),
        false,
        `exact-case identity preserves ${tableName.toUpperCase()} as distinct from ${tableName}`,
      );
    }
    t.equal(isSystemTableName('user_orders'), false);
    t.equal(isSystemTableName('global.user_orders'), false);
    t.ok(MIGRATION_PIPELINE_ERROR_MSG.INVALID_ALTER_TABLE_AST);
    t.ok(ADAPTER_TYPE);
    t.ok(Buffer.isBuffer(buildBackendKeyData(1, 2)));
  });

test('Surface 1: SQLQueryEngine.executeRequest refuses all system tables and ' +
  'evasion vectors across SQL_STATEMENT, STAGE, and PLAN modes (including nested stageCtx.call)',
async (t) => {
  const {engine, delivered, tableCreationService} = createAdversarialEngine();
  t.teardown(() => tableCreationService.shutdown());

  for (const tableName of ALL_SYSTEM_TABLES) {
    for (const variant of buildSystemTargetVariants(tableName)) {
      const tableVectors = [
        {
          sql: `INSERT INTO ${variant} (id) VALUES ('x')`,
          expectedErrorCode: QUERY_ERROR_CODE.SYSTEM_TABLE_WRITE_REFUSED,
        },
        {
          sql: `ALTER TABLE ${variant} ADD COLUMN injected TEXT`,
          expectedErrorCode: QUERY_ERROR_CODE.SYSTEM_TABLE_WRITE_REFUSED,
        },
        {
          sql: `DROP TABLE ${variant}`,
          expectedErrorCode: QUERY_ERROR_CODE.SYSTEM_TABLE_WRITE_REFUSED,
        },
        {
          sql: `CREATE TABLE ${variant} (id TEXT PRIMARY KEY)`,
          expectedErrorCode: QUERY_ERROR_CODE.SYSTEM_TABLE_NAME_RESERVED,
        },
      ];
      for (const vector of tableVectors) {
        const res = await engine.executeRequest(createSqlRequest({
          statement: vector.sql,
          parameters: [],
          sessionId: 'adv-sql-stmt',
          executionMode: EXECUTION_MODE.SQL_STATEMENT,
        }));
        t.equal(res.success, false, `SQL_STATEMENT refused: ${vector.sql}`);
        t.equal(res.errorCode, vector.expectedErrorCode);
      }
    }
  }

  for (const variant of buildSystemTargetVariants(TABLES.NODES)) {
    for (const vector of buildEngineWriteVectors(variant)) {
      const stmtRes = await engine.executeRequest(createSqlRequest({
        statement: vector.sql,
        parameters: [],
        sessionId: 'adv-stmt',
        executionMode: EXECUTION_MODE.SQL_STATEMENT,
      }));
      t.equal(stmtRes.success, false, `SQL_STATEMENT vector refused: ${vector.sql}`);
      t.equal(stmtRes.errorCode, vector.expectedErrorCode);

      const stageRes = await engine.executeRequest(Object.freeze({
        ...createSqlRequest({
          statement: vector.sql,
          parameters: [],
          sessionId: 'adv-stage',
          executionMode: EXECUTION_MODE.STAGE,
        }),
        handler: async (rows) => rows,
      }));
      t.equal(stageRes.success, false, `STAGE vector refused: ${vector.sql}`);
      t.equal(stageRes.errorCode, vector.expectedErrorCode);

      const planRes = await engine.executeRequest(Object.freeze({
        ...createSqlRequest({
          statement: vector.sql,
          parameters: [],
          sessionId: 'adv-plan',
          executionMode: EXECUTION_MODE.PLAN,
        }),
        plan: {
          kind: 'useBroadcast',
          ref: 'shared-ref',
        },
      }));
      t.equal(planRes.success, false, `PLAN vector refused: ${vector.sql}`);
      t.equal(planRes.errorCode, vector.expectedErrorCode);
    }
  }

  t.equal(delivered.length, 0, 'zero system-table mutations routed to partitions');

  // Verify PLAN mode checkPlanRequestStatement does NOT execute user-table writes as a side effect
  const userWritePlanRes = await engine.executeRequest(Object.freeze({
    ...createSqlRequest({
      statement: `INSERT INTO ${USER_TABLE_NAME} (id) VALUES ('must-not-run')`,
      parameters: [],
      sessionId: 'adv-plan-user-write',
      executionMode: EXECUTION_MODE.PLAN,
    }),
    plan: {
      kind: 'useBroadcast',
      ref: 'shared-ref',
    },
  }));
  t.equal(userWritePlanRes.success, true);
  t.equal(
    delivered.length,
    0,
    'checkPlanRequestStatement must not execute non-SELECT user-table writes',
  );

  // Verify STAGE handler invoking nested stageCtx.call("DELETE FROM nodes WHERE id = 'n1'") fails
  const nestedStageRes = await engine.executeRequest(Object.freeze({
    ...createSqlRequest({
      statement: `SELECT * FROM ${USER_TABLE_NAME}`,
      parameters: [],
      sessionId: 'adv-nested-stage',
      executionMode: EXECUTION_MODE.STAGE,
    }),
    handler: async (_batch, stageCtx) => {
      await stageCtx.call(
        `DELETE FROM ${TABLES.NODES} WHERE id = 'n1'`,
        [],
        async (rows) => rows,
      );
      return 'should-not-succeed';
    },
  }));
  t.equal(nestedStageRes.success, false, 'STAGE nested stageCtx.call write to nodes refused');
  t.equal(nestedStageRes.errorCode, QUERY_ERROR_CODE.SYSTEM_TABLE_WRITE_REFUSED);

  // Verify PLAN (reduceByKey) handler invoking nested stageCtx.call("DELETE FROM nodes WHERE id = 'n1'") fails
  const exchangeManager = new ExchangeManager();
  exchangeManager.route('k1', {id: 'item-1'});
  const nestedPlanRes = await engine.executeRequest(Object.freeze({
    ...createSqlRequest({
      statement: `SELECT * FROM ${USER_TABLE_NAME}`,
      parameters: [],
      sessionId: 'adv-nested-plan',
      executionMode: EXECUTION_MODE.PLAN,
    }),
    exchangeManager,
    plan: {
      kind: 'reduceByKey',
    },
    handler: async (_group, stageCtx) => {
      for await (const _row of stageCtx.call(
        `DELETE FROM ${TABLES.NODES} WHERE id = 'n1'`,
        [],
      )) {
        // iterator mode
      }
      return 'should-not-succeed';
    },
  }));
  t.equal(nestedPlanRes.success, false, 'PLAN nested stageCtx.call write to nodes refused');
  t.equal(nestedPlanRes.errorCode, QUERY_ERROR_CODE.SYSTEM_TABLE_WRITE_REFUSED);
});

test('Surface 2: PostgresWireAdapter and PgWireProtocolHandler (Simple Q and ' +
  'Extended Parse/Bind/Execute) refuse system-table writes and DDL', async (t) => {
  const {engine, delivered, tableCreationService} = createAdversarialEngine();
  t.teardown(() => tableCreationService.shutdown());
  const adapter = createTestPostgresWireAdapter({sqlCore: engine});
  await adapter.authenticate('pg-adv', {tenantId: 'tenant-adv'});

  for (const tableName of ALL_SYSTEM_TABLES) {
    const res = await adapter.execute(
      'pg-adv',
      `DELETE FROM ${tableName} WHERE id = '1'`,
    );
    t.equal(res.success, false, `PG adapter refused ${tableName}`);
    t.equal(res.errorCode, QUERY_ERROR_CODE.SYSTEM_TABLE_WRITE_REFUSED);
    t.equal(resolveFailureSqlState(res), '42501');
  }

  const socket = new MockPgSocket();
  const handler = new PgWireProtocolHandler({
    adapter,
    socket,
    logger: {debug() {}, info() {}, warn() {}, error() {}},
  });
  handler.start();
  socket.emit('data', buildPgStartupMsg('admin'));
  await handler._processing;

  for (const vector of buildEngineWriteVectors(TABLES.NODES)) {
    const beforeErrors = socket.findMessages(PG_BACKEND_MSG.ERROR_RESPONSE).length;
    socket.emit('data', buildPgSimpleQueryMsg(vector.sql));
    await handler._processing;
    const afterSimpleErrors =
      socket.findMessages(PG_BACKEND_MSG.ERROR_RESPONSE).length;
    t.ok(afterSimpleErrors > beforeErrors, `Simple Q emitted ErrorResponse: ${vector.sql}`);

    socket.emit('data', buildPgExtendedBatch(vector.sql));
    await handler._processing;
    const afterExtErrors =
      socket.findMessages(PG_BACKEND_MSG.ERROR_RESPONSE).length;
    t.ok(
      afterExtErrors > afterSimpleErrors,
      `Extended Parse/Bind/Execute emitted ErrorResponse: ${vector.sql}`,
    );
  }

  handler.destroy();
  t.equal(delivered.length, 0, 'no partition received a statement from PG wire');
});

test('Surface 3: AdminWebSocketAPI refuses system-table writes and DDL across ' +
  'all system tables and evasion vectors', async (t) => {
  const {engine, delivered, tableCreationService} = createAdversarialEngine();
  t.teardown(() => tableCreationService.shutdown());
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    sqlQueryEngine: engine,
  });
  t.teardown(() => api.shutdown());

  for (const tableName of ALL_SYSTEM_TABLES) {
    const res = await api.executeQueryWithTimeout(
      `UPDATE ${tableName} SET id = 'x'`,
      [],
      `admin-${tableName}`,
    );
    t.equal(res.success, false, `AdminWebSocketAPI refused ${tableName}`);
    t.equal(res.errorCode, QUERY_ERROR_CODE.SYSTEM_TABLE_WRITE_REFUSED);
  }

  for (const vector of buildEngineWriteVectors(`"global"."${TABLES.TABLES}"`)) {
    const res = await api.executeQueryWithTimeout(vector.sql, [], 'admin-evasion');
    t.equal(res.success, false, `AdminWebSocketAPI refused vector: ${vector.sql}`);
    t.equal(res.errorCode, vector.expectedErrorCode);
  }

  t.equal(delivered.length, 0);
});

test('Surface 4: ApplicationDatabase db.query and db.transaction refuse ' +
  'system-table writes and DDL across all system tables and evasion vectors',
async (t) => {
  const {engine, delivered, tableCreationService} = createAdversarialEngine();
  t.teardown(() => tableCreationService.shutdown());
  const runtime = createBoundApplicationDatabaseRuntime(engine);
  t.teardown(() => runtime.close());
  const db = runtime.openApplicationDatabase({applicationId: 'adv-app'});

  for (const tableName of ALL_SYSTEM_TABLES) {
    await assert.rejects(
      db.query(`INSERT INTO ${tableName} (id) VALUES ('x')`),
      {code: QUERY_ERROR_CODE.SYSTEM_TABLE_WRITE_REFUSED},
    );
  }

  for (const vector of buildEngineWriteVectors(TABLES.SERVICES)) {
    await assert.rejects(
      db.query(vector.sql),
      {code: vector.expectedErrorCode},
    );
    await assert.rejects(
      db.transaction(async (tx) => tx.query(vector.sql)),
      {code: vector.expectedErrorCode},
    );
  }

  t.equal(delivered.length, 0);
});

test('Surface 5: Runtime service queryExecutor and SqlQueryLoopRuntimeModule ' +
  'refuse system tables across all modes and parallelReduce configs',
async (t) => {
  const {engine, delivered, tableCreationService} = createAdversarialEngine();
  t.teardown(() => tableCreationService.shutdown());

  for (const tableName of ALL_SYSTEM_TABLES) {
    const res = await engine.executeQuery(
      `ALTER TABLE ${tableName} ADD COLUMN bad TEXT`,
      [],
      {sessionId: 'svc-sess', issuingServiceId: 'svc-runtime-1'},
    );
    t.equal(res.success, false);
    t.equal(res.errorCode, QUERY_ERROR_CODE.SYSTEM_TABLE_WRITE_REFUSED);

    t.equal(
      isValidParallelReduceConfig({
        shardSqlBySlot: {1: 'SELECT 1', 2: 'SELECT 2'},
        coordinationTable: tableName,
        leaseMs: 1000,
        coordinatorSlot: 1,
        resultId: 'r1',
        resultSnapshotColumn: 'snapshot_json',
      }, 'user_results'),
      false,
      `coordinationTable=${tableName} rejected`,
    );
    t.equal(
      isValidParallelReduceConfig({
        shardSqlBySlot: {1: 'SELECT 1', 2: 'SELECT 2'},
        coordinationTable: `global.${tableName}`,
        leaseMs: 1000,
        coordinatorSlot: 1,
        resultId: 'r1',
        resultSnapshotColumn: 'snapshot_json',
      }, 'user_results'),
      false,
      `coordinationTable=global.${tableName} rejected`,
    );
    t.equal(
      isValidParallelReduceConfig({
        shardSqlBySlot: {1: 'SELECT 1', 2: 'SELECT 2'},
        coordinationTable: 'user_slots',
        leaseMs: 1000,
        coordinatorSlot: 1,
        resultId: 'r1',
        resultSnapshotColumn: 'snapshot_json',
      }, tableName),
      false,
      `resultTable=${tableName} rejected`,
    );
  }

  const loopModule = new SqlQueryLoopRuntimeModule();
  const badCoordPrep = await loopModule.prepare({
    serviceId: 'svc-loop-1',
    runtimeConfig: JSON.stringify({
      sql: 'SELECT 1',
      reduce: {groupBy: 'k', aggregate: 'count', limit: 5},
      resultTable: 'user_results',
      parallelReduce: {
        shardSqlBySlot: {1: 'SELECT 1', 2: 'SELECT 2'},
        coordinationTable: TABLES.CALL_CELL_REDUCE_SLOTS,
        leaseMs: 1000,
        coordinatorSlot: 1,
        resultId: 'r1',
        resultSnapshotColumn: 'snapshot_json',
      },
    }),
  });
  t.equal(badCoordPrep.status, PREPARE_STATUS.FAILED);

  const badResultPrep = await loopModule.prepare({
    serviceId: 'svc-loop-2',
    runtimeConfig: JSON.stringify({
      sql: 'SELECT 1',
      reduce: {groupBy: 'k', aggregate: 'count', limit: 5},
      resultTable: TABLES.NODES,
    }),
  });
  t.equal(badResultPrep.status, PREPARE_STATUS.FAILED);
  t.equal(delivered.length, 0);
});

test('Surface 6: PartitionService.handleRemoteQuery, executeMigrationAlterQuery, ' +
  'MigrationPipeline, and MigrationCoordinator refuse all system tables and ' +
  'lexer-evasion vectors while admitting read-only CTEs', async (t) => {
  const {
    tableCreationService,
    migrationPipeline,
    migrationCoordinator,
  } = createAdversarialEngine();
  t.teardown(() => tableCreationService.shutdown());

  // Verify read-only CTE is classified as READ and write CTE as WRITE
  const readCte = 'WITH cte AS (SELECT 1) SELECT * FROM nodes';
  const writeCte = 'WITH cte AS (SELECT 1) DELETE FROM nodes';
  t.equal(
    classifyPartitionStatementHead(readCte).kind,
    PARTITION_STATEMENT_KIND.READ,
  );
  t.equal(
    classifyPartitionStatementHead(writeCte).kind,
    PARTITION_STATEMENT_KIND.WRITE,
  );

  const applied = [];
  const reads = [];
  for (const tableName of ALL_SYSTEM_TABLES) {
    const db = new Database(':memory:');
    t.teardown(() => db.close());
    const partition = Object.assign(
      Object.create(PARTITION_SERVICE_REMOTE_QUERY_METHODS),
      {
        role: 'leader',
        tableName,
        tableId: tableName,
        db,
        partitionId: `${tableName}-p1`,
        replicaId: `${tableName}-p1-r1`,
        timeSource: {now: () => 1000},
        logger: {debug() {}, error() {}, warn() {}, info() {}},
        resolveLeaderAddress() {
          return null;
        },
        async proposeWrite(op) {
          applied.push(op);
          return {success: true, changes: 1};
        },
        async executeQuery(sql, _params, options) {
          if (classifyPartitionStatementHead(sql).kind ===
              PARTITION_STATEMENT_KIND.READ) {
            reads.push({tableName, sql, options});
            return {success: true, rows: [{id: 'r1'}], count: 1};
          }
          applied.push(sql);
          return {success: true, changes: 1};
        },
      },
    );

    const readCteRes = await partition.handleRemoteQuery({
      type: 'QUERY',
      sql: `WITH cte AS (SELECT 1) SELECT * FROM ${tableName}`,
      params: [],
      [STATEMENT_INGRESS_FIELD]: STATEMENT_INGRESS.CLIENT,
    });
    t.equal(
      readCteRes.success,
      true,
      `Read-only CTE admitted on ${tableName}`,
    );

    for (const sql of buildPartitionWriteVectors(tableName)) {
      const res = await partition.handleRemoteQuery({
        type: 'QUERY',
        sql,
        params: [],
        [STATEMENT_INGRESS_FIELD]: STATEMENT_INGRESS.CLIENT,
      });
      t.equal(res.success, false, `Partition refused client vector on ${tableName}: ${sql}`);
      t.equal(res.errorCode, QUERY_ERROR_CODE.SYSTEM_TABLE_WRITE_REFUSED);
    }

    const expectedSchemaRefusalCode =
      tableName === TABLES.SQL_TRANSACTIONS ?
        TRANSACTION_SCHEMA_ENFORCEMENT_ERROR.MIGRATION :
        QUERY_ERROR_CODE.SYSTEM_TABLE_WRITE_REFUSED;

    const alterRemote = await partition.handleRemoteQuery({
      type: 'QUERY',
      sql: `ALTER TABLE ${tableName} ADD COLUMN extra TEXT`,
      params: [],
      migrationOperation: PARTITION_SERVICE_MIGRATION_OPERATION.ALTER_TABLE,
    });
    t.equal(alterRemote.success, false, `Partition refused MIGRATION_ALTER_TABLE on ${tableName}`);
    t.equal(alterRemote.errorCode, expectedSchemaRefusalCode);

    const alterDirect = await partition.executeMigrationAlterQuery(
      `ALTER TABLE ${tableName} ADD COLUMN extra TEXT`,
    );
    t.equal(alterDirect.success, false, `executeMigrationAlterQuery refused ${tableName}`);
    t.equal(alterDirect.errorCode, expectedSchemaRefusalCode);

    await t.rejects(
      migrationPipeline.handleAlterTable({
        type: 'ALTER_TABLE',
        table: tableName,
        rawSql: `ALTER TABLE ${tableName} ADD COLUMN extra TEXT`,
        operation: {
          action: 'add',
          resource: 'column',
          columnName: 'extra',
          dataType: 'TEXT',
        },
      }),
      {code: QUERY_ERROR_CODE.SYSTEM_TABLE_WRITE_REFUSED},
      `MigrationPipeline refused ${tableName}`,
    );

    await t.rejects(
      migrationCoordinator.initiateMigration(tableName, {
        migrationType: 'ADD_COLUMN',
        columnName: 'extra',
        dataType: 'TEXT',
      }),
      {code: QUERY_ERROR_CODE.SYSTEM_TABLE_WRITE_REFUSED},
      `MigrationCoordinator refused ${tableName}`,
    );
  }

  t.equal(reads.length, ALL_SYSTEM_TABLES.length, 'all 46 read-only CTEs succeeded');
  t.equal(applied.length, 0, 'zero system-table writes reached partition apply');
});
