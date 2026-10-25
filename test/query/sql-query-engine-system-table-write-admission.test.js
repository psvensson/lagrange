/**
 * System-table write admission at client SQL ingress.
 *
 * A client INSERT/UPDATE/DELETE on a system table is refused
 * SYSTEM_TABLE_WRITE_REFUSED before anything executes, at every client entry
 * (the SqlRequest dispatch behind the admin WebSocket, PG wire and the
 * runtime executors; the embedded application session; runtime-service SQL).
 * The in-process owner route (the control-plane gateway's executeQuery) is
 * admitted and not mis-marked client. A routed statement carries its origin
 * to the partition, which refuses a client system-table write itself.
 */
import {test} from '../../src/test-helpers/tap.js';
import Database from 'better-sqlite3';
import {openParticipantTransactionStore} from
  '../../src/partition/partition-participant-transaction-store.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {createSqlRequest} from '../../src/query/sql-request.js';
import {EXECUTION_MODE} from '../../src/query/sql-adapter-constants.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';
import {
  STATEMENT_INGRESS,
  STATEMENT_INGRESS_FIELD,
  SYSTEM_TABLE_WRITE_ADMISSION,
  admitClientSystemTableWrite,
} from '../../src/query/sql-statement-ingress.js';
import {createApplicationDatabaseExecutionOptions} from
  '../../src/query/application-database-statement-policy.js';
import {PARTITION_SERVICE_REMOTE_QUERY_METHODS} from
  '../../src/partition/partition-service-remote-query-methods.js';
import {resolveFailureSqlState} from '../../src/runtime/pgwire-result-mapper.js';
import {createTestPostgresWireAdapter} from '../helpers/pgwire-auth-handler.js';
import {AdminWebSocketAPI} from '../../src/admin/admin-websocket-api.js';
import {createTransactionPersistenceGateway} from
  '../test-helpers/transaction-persistence-gateway.js';
import {answerParticipantTransactionRequest} from
  '../test-helpers/participant-protocol-double.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';

const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}
const logging = LoggingService.getInstance();
if (!logging.isInitialized()) {
  logging.initialize({level: 'error'});
}

const SYSTEM_TABLE_WRITES = Object.freeze([
  'UPDATE tables SET table_policies = \'{}\' WHERE table_id = \'tbl-1\'',
  'UPDATE "nodes" SET status = \'draining\' WHERE node_id = \'n1\'',
  'DELETE FROM nodes WHERE node_id = \'n1\'',
  'INSERT INTO config (config_key, config_value) VALUES (\'k\', \'v\')',
  'INSERT OR REPLACE INTO logs (log_id, message) VALUES (\'l1\', \'m\')',
]);
const USER_TABLE_WRITE =
  'UPDATE orders SET total = 1 WHERE id = \'a1\'';
const OWNER_SYSTEM_TABLE_WRITE =
  'UPDATE tables SET table_policies = \'{}\' WHERE table_id = \'tbl-1\'';

function partitionRow(partitionId, tableName) {
  return {
    partition_id: partitionId,
    table_name: tableName,
    partition_key_start: null,
    partition_key_end: null,
    leader_node_id: 'test-node',
  };
}

function createSystemCache() {
  const tables = [
    {table_name: 'orders', table_id: 'tbl-orders', primaryKey: 'id'},
    {table_name: 'Logs', table_id: 'tbl-Logs', primaryKey: 'id',
      active_partition_version: 1},
    {table_name: 'tables', table_id: 'tables', primaryKey: 'table_id'},
  ];
  const partitions = [
    partitionRow('orders-p1', 'orders'),
    partitionRow('Logs-p1', 'Logs'),
    partitionRow('tables-p1', 'tables'),
  ];
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
        tables.find((t) => t.table_name === key) || null :
        null;
    },
    filter(type, predicate) {
      if (type === 'partitions') return partitions.filter(predicate);
      if (type === 'services') return services.filter(predicate);
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

function createEngine(queryHandler = null) {
  const delivered = [];
  const engine = new SQLQueryEngine({
    systemCache: createSystemCache(),
    messageRouter: {
      async deliver(address, message) {
        if (message.type === 'QUERY') {
          delivered.push({address, message});
          const answer = queryHandler ? await queryHandler(message) :
            {success: true, rows: [], changes: 1};
          return buildDeliveryEnvelope({acknowledged: true}, answer);
        }
        if (message.type === 'TRANSACTION') {
          return buildDeliveryEnvelope({acknowledged: true},
            answerParticipantTransactionRequest(message));
        }
        throw new Error('unexpected router message: ' + message.type);
      },
    },
    controlPlaneSystemTableGateway: createTransactionPersistenceGateway(),
  });
  return {engine, delivered};
}

function clientRequest(sql, sessionId = 'client-session') {
  return createSqlRequest({
    statement: sql,
    parameters: [],
    sessionId,
    executionMode: EXECUTION_MODE.SQL_STATEMENT,
  });
}

function assertRefused(t, result, label) {
  t.equal(result.success, false, `${label}: refused`);
  t.equal(result.errorCode, QUERY_ERROR_CODE.SYSTEM_TABLE_WRITE_REFUSED,
    `${label}: SYSTEM_TABLE_WRITE_REFUSED`);
}

test('a client system-table write is refused at the SqlRequest dispatch ' +
  'and nothing is routed', async (t) => {
  const {engine, delivered} = createEngine();
  for (const sql of SYSTEM_TABLE_WRITES) {
    const result = await engine.executeRequest(clientRequest(sql));
    assertRefused(t, result, sql);
    t.equal(result.reasonCode, 'client_ingress');
  }
  t.equal(delivered.length, 0, 'no partition received a statement');
});

test('the in-process owner route is admitted and routes with owner origin',
  async (t) => {
    const {engine, delivered} = createEngine();
    const result = await engine.executeQuery(OWNER_SYSTEM_TABLE_WRITE, [], {
      sessionId: 'owner-session',
    });
    t.notOk(result.errorCode === QUERY_ERROR_CODE.SYSTEM_TABLE_WRITE_REFUSED,
      'the gateway route is not refused');
    const routed = delivered.filter((entry) =>
      entry.message.sql?.startsWith('UPDATE tables'));
    t.ok(routed.length >= 1, 'the owner write reached the tables partition');
    t.ok(routed.every((entry) => entry.message[STATEMENT_INGRESS_FIELD] ===
      STATEMENT_INGRESS.IN_PROCESS_OWNER), 'an owner write is never marked client');
  });

test('a client user-table write is admitted and its origin is forwarded',
  async (t) => {
    const {engine, delivered} = createEngine();
    const result = await engine.executeRequest(clientRequest(USER_TABLE_WRITE));
    t.equal(result.success, true, 'user-table write unaffected');
    const routed = delivered.filter((entry) =>
      entry.message.sql?.startsWith('UPDATE orders'));
    t.ok(routed.length >= 1, 'the user write reached its partition');
    t.ok(routed.every((entry) => entry.message[STATEMENT_INGRESS_FIELD] ===
      STATEMENT_INGRESS.CLIENT), 'the routed statement carries client origin');
  });

test('inside an explicit transaction the refusal leaves the transaction open',
  async (t) => {
    const {engine} = createEngine();
    const sessionId = 'tx-session';
    const begin = await engine.executeRequest(clientRequest('BEGIN', sessionId));
    t.equal(begin.success, true, 'BEGIN admitted');
    const refused = await engine.executeRequest(
      clientRequest(OWNER_SYSTEM_TABLE_WRITE, sessionId));
    assertRefused(t, refused, 'transactional system-table write');
    t.ok(engine.transactionCoordinator.getTransaction(sessionId),
      'the transaction is still open');
    const rollback = await engine.executeRequest(
      clientRequest('ROLLBACK', sessionId));
    t.equal(rollback.success, true, 'the transaction still ends normally');
  });

test('an embedded application session is refused', async (t) => {
  const {engine, delivered} = createEngine();
  const result = await engine.executeQuery(
    'DELETE FROM nodes WHERE node_id = \'n1\'', [],
    createApplicationDatabaseExecutionOptions('application:app-1:s1'));
  assertRefused(t, result, 'application session');
  t.equal(delivered.length, 0);
});

test('runtime-service SQL is refused', async (t) => {
  const {engine, delivered} = createEngine();
  const result = await engine.executeQuery(OWNER_SYSTEM_TABLE_WRITE, [], {
    sessionId: 'svc-1',
    issuingServiceId: 'svc-1',
  });
  assertRefused(t, result, 'runtime service');
  t.equal(delivered.length, 0);
});

test('a client write whose target cannot be resolved is refused (fail ' +
  'closed)', async (t) => {
  const admission = admitClientSystemTableWrite({type: 'UPDATE'}, {
    issuingServiceId: 'svc-1',
  });
  t.equal(admission.state, SYSTEM_TABLE_WRITE_ADMISSION.REFUSED);
  t.equal(admission.failure.reasonCode, 'unresolved_target');
  t.equal(admitClientSystemTableWrite({type: 'UPDATE'}, {}).state,
    SYSTEM_TABLE_WRITE_ADMISSION.ADMITTED,
    'an in-process statement is not judged by this admission');
});

test('PG wire refuses a system-table write with SQLSTATE 42501',
  async (t) => {
    const {engine, delivered} = createEngine();
    const adapter = createTestPostgresWireAdapter({sqlCore: engine});
    await adapter.authenticate('pg-1', {tenantId: 'tenant-a'});
    const result = await adapter.execute('pg-1',
      'UPDATE nodes SET status = \'draining\' WHERE node_id = \'n1\'');
    assertRefused(t, result, 'pgwire');
    t.equal(resolveFailureSqlState(result), '42501');
    t.equal(delivered.length, 0);
  });

test('the admin WebSocket query channel refuses a system-table write',
  async (t) => {
    const {engine, delivered} = createEngine();
    const api = new AdminWebSocketAPI({nodeId: 'test-node',
      sqlQueryEngine: engine});
    const result = await api.executeQueryWithTimeout(
      OWNER_SYSTEM_TABLE_WRITE, [], 'admin-q-1');
    assertRefused(t, result, 'admin query');
    t.equal(delivered.length, 0);
    await api.shutdown();
  });

test('a partition refuses a routed client write to its system table',
  async (t) => {
    const applied = [];
    const partition = Object.assign(
      Object.create(PARTITION_SERVICE_REMOTE_QUERY_METHODS), {
        role: 'leader',
        tableName: 'tables',
        partitionId: 'tables-p1',
        replicaId: 'tables-p1-r1',
        logger: {debug() {}, error() {}, warn() {}, info() {}},
        async executeQuery(sql) {
          applied.push(sql);
          return {success: true, changes: 1};
        },
      });
    const clientWrite = await partition.handleRemoteQuery({
      type: 'QUERY',
      sql: OWNER_SYSTEM_TABLE_WRITE,
      params: [],
      [STATEMENT_INGRESS_FIELD]: STATEMENT_INGRESS.CLIENT,
    });
    t.equal(clientWrite.success, false);
    t.equal(clientWrite.errorCode,
      QUERY_ERROR_CODE.SYSTEM_TABLE_WRITE_REFUSED);
    t.notOk('acknowledged' in clientWrite,
      'the partition refusal carries no transport ACK alias');
    t.equal(applied.length, 0, 'nothing applied');
    const ownerWrite = await partition.handleRemoteQuery({
      type: 'QUERY',
      sql: OWNER_SYSTEM_TABLE_WRITE,
      params: [],
      [STATEMENT_INGRESS_FIELD]: STATEMENT_INGRESS.IN_PROCESS_OWNER,
    });
    t.equal(ownerWrite.success, true, 'the owner write applies');
    t.equal(applied.length, 1);
  });

// Catalog identity is exact-case; SQLite identifier folding happens only after
// the logical partition has been selected, inside that partition's database.
test('Logs user DML preserves exact parser identity and client origin through ' +
  'routing and partition execution', async (t) => {
  const db = new Database(':memory:');
  t.teardown(() => db.close());
  openParticipantTransactionStore(db);
  db.exec('CREATE TABLE Logs (id TEXT PRIMARY KEY, total INTEGER)');
  db.prepare('INSERT INTO Logs VALUES (?, ?)').run('a1', 0);
  const partition = Object.assign(
    Object.create(PARTITION_SERVICE_REMOTE_QUERY_METHODS), {
      role: 'leader',
      tableName: 'Logs',
      tableId: 'tbl-Logs',
      systemTableCache: createSystemCache(),
      db,
      partitionId: 'Logs-p1',
      replicaId: 'Logs-p1-r1',
      logger: {debug() {}, error() {}, warn() {}, info() {}},
      async executeQuery(sql, params) {
        return {success: true, changes: db.prepare(sql).run(...params).changes};
      },
    });
  const {engine, delivered} = createEngine((message) =>
    partition.handleRemoteQuery(message));
  const names = ['Logs', '"Logs"'];
  for (const [index, name] of names.entries()) {
    const result = await engine.executeRequest(clientRequest(
      `UPDATE ${name} SET total = ${index + 1} WHERE id = 'a1'`));
    t.equal(result.success, true, `${name} admitted and applied`, {result});
    t.equal(db.prepare('SELECT total FROM Logs').get().total, index + 1,
      `${name} reached the selected user partition database`);
  }
  t.equal(delivered.length, names.length, 'one route per user mutation');
  t.ok(delivered.every(({address, message}) =>
    address.endsWith('/Logs-p1') &&
      message[STATEMENT_INGRESS_FIELD] === STATEMENT_INGRESS.CLIENT),
  'logical user partition and client origin retained');
  t.equal(engine.getTableInfo('Logs').table_id, 'tbl-Logs');
  t.equal(engine.getTableInfo('logs'), null, 'lookup does not alias case');
  const refused = await engine.executeRequest(clientRequest(
    'UPDATE logs SET total = 99 WHERE id = \'a1\''));
  assertRefused(t, refused, 'exact system table');
  t.equal(delivered.length, names.length, 'system write never routed');
  const absent = await engine.executeRequest(clientRequest(
    'UPDATE LOGS SET total = 99 WHERE id = \'a1\''));
  t.equal(absent.success, false, 'distinct missing user name fails lookup');
  t.not(absent.errorCode, QUERY_ERROR_CODE.SYSTEM_TABLE_WRITE_REFUSED,
    'missing uppercase logical name is not a reserved-name alias');
});

test('PG wire CREATE reserved name returns the owner refusal before persistence',
  async (t) => {
    const {engine, delivered} = createEngine();
    const adapter = createTestPostgresWireAdapter({sqlCore: engine});
    await adapter.authenticate('pg-create', {tenantId: 'tenant-a'});
    for (const name of ['logs', '"logs"', '"global.logs"']) {
      const result = await adapter.execute('pg-create',
        `CREATE TABLE ${name} (id TEXT PRIMARY KEY)`);
      t.equal(result.success, false, name);
      t.equal(result.errorCode, QUERY_ERROR_CODE.SYSTEM_TABLE_NAME_RESERVED);
      t.equal(resolveFailureSqlState(result), '42501');
    }
    t.equal(delivered.length, 0, 'no catalog or data mutation reached transport');
  });
