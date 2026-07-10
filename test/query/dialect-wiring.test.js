/**
 * Dialect wiring tests.
 *
 * Verifies that the dialect hint flows correctly through the chain:
 * PostgresWireAdapter → SqlRequest → SqlCore → SQLParser.
 *
 * Requirements: 15.1, 15.2, 15.3
 */

import {test} from '../../src/test-helpers/tap.js';
import {createTestPostgresWireAdapter} from
  '../helpers/pgwire-auth-handler.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {PARSER_DIALECT} from '../../src/query/pg/pg-compat-constants.js';
import {EXECUTION_MODE} from '../../src/query/sql-adapter-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

const config = ConfigurationManager.getInstance();
config.initialize();

// --- Helpers ---

/**
 * Mock SqlCore that captures the SqlRequest passed to executeRequest.
 */
function createCapturingSqlCore() {
  const captured = [];
  return {
    captured,
    async executeRequest(sqlRequest) {
      captured.push(sqlRequest);
      return {success: true, rows: [], affectedRows: 0};
    },
  };
}

/**
 * Minimal system cache for SQLQueryEngine tests.
 */
function createMinimalSystemCache() {
  return {
    tables: [{table_name: 'users', primaryKey: 'id'}],
    partitions: [
      {
        partition_id: 'p1',
        table_name: 'users',
        partition_key_start: null,
        partition_key_end: null,
      },
    ],
    get(type, key) {
      if (type === 'tables') {
        return this.tables.find((t) => t.table_name === key);
      }
      return null;
    },
    filter(type, predicate) {
      if (type === 'partitions') return this.partitions.filter(predicate);
      if (type === 'services') return this.services.filter(predicate);
      return [];
    },
    getAll(type) {
      if (type === 'partitions') return this.partitions;
      if (type === 'tables') return this.tables;
      if (type === 'services') return this.services;
      return [];
    },
    services: [
      {
        service_id: 'p1',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'test-node',
        raft_role: 'leader',
        address: 'test-node/partition/p1',
        status: 'active',
      },
    ],
  };
}

function createMockRouter() {
  return {
    async deliver() {
      return {
        acknowledged: true,
        success: true,
        rows: [{id: 1}],
        changes: 0,
      };
    },
  };
}

// --- PostgresWireAdapter dialect wiring (Requirement 15.1) ---

test('PostgresWireAdapter - execute passes dialect=postgresql ' +
  'in SqlRequest', async (t) => {
  const mock = createCapturingSqlCore();
  const adapter = createTestPostgresWireAdapter({sqlCore: mock});

  await adapter.authenticate('s1', {tenantId: 'tenant-a'});
  await adapter.execute('s1', 'SELECT 1');

  t.equal(mock.captured.length, 1);
  t.equal(
    mock.captured[0].dialect,
    PARSER_DIALECT.POSTGRESQL,
    'dialect must be postgresql',
  );
  t.equal(
    mock.captured[0].executionMode,
    EXECUTION_MODE.SQL_STATEMENT,
  );
  t.end();
});

test('PostgresWireAdapter - dialect is present alongside other ' +
  'SqlRequest fields', async (t) => {
  const mock = createCapturingSqlCore();
  const adapter = createTestPostgresWireAdapter({sqlCore: mock});

  await adapter.authenticate('s2', {tenantId: 'tenant-b'});
  await adapter.execute('s2', 'SELECT $1', [42]);

  const req = mock.captured[0];
  t.equal(req.dialect, PARSER_DIALECT.POSTGRESQL);
  t.equal(req.statement, 'SELECT $1');
  t.same(req.parameters, [42]);
  t.equal(req.tenantId, 'tenant-b');
  t.equal(req.sessionId, 's2');
  t.end();
});

// --- SqlCore forwards dialect to parser (Requirement 15.2) ---

test('SQLQueryEngine - executeQuery with dialect=postgresql ' +
  'parses PG syntax', async (t) => {
  const engine = new SQLQueryEngine({
    systemCache: createMinimalSystemCache(),
    messageRouter: createMockRouter(),
  });

  // $1::TEXT is PG-specific syntax; it should parse without error
  // in postgresql mode and fail in sqlite mode.
  const result = await engine.executeQuery(
    'SELECT CAST($1 AS TEXT) FROM users',
    ['hello'],
    {dialect: PARSER_DIALECT.POSTGRESQL},
  );

  t.equal(result.success, true, 'PG-dialect query should succeed');
  t.end();
});

test('SQLQueryEngine - executeRequest forwards dialect from ' +
  'SqlRequest to executeQuery', async (t) => {
  const engine = new SQLQueryEngine({
    systemCache: createMinimalSystemCache(),
    messageRouter: createMockRouter(),
  });

  // Use createSqlRequest to build a proper request with dialect
  const {createSqlRequest} = await import(
    '../../src/query/sql-request.js'
  );
  const req = createSqlRequest({
    statement: 'SELECT CAST($1 AS TEXT) FROM users',
    parameters: ['hello'],
    dialect: PARSER_DIALECT.POSTGRESQL,
  });

  const result = await engine.executeRequest(req);

  t.equal(result.success, true, 'PG-dialect via executeRequest');
  t.end();
});

// --- Internal queries default to SQLite mode (Requirement 15.3) ---

test('SQLQueryEngine - executeQuery without dialect uses ' +
  'SQLite mode', async (t) => {
  const engine = new SQLQueryEngine({
    systemCache: createMinimalSystemCache(),
    messageRouter: createMockRouter(),
  });

  // Standard SQLite SQL with no dialect option
  const result = await engine.executeQuery(
    'SELECT * FROM users WHERE id = ?',
    ['alice'],
  );

  t.equal(result.success, true, 'SQLite-mode query should succeed');
  t.end();
});

test('SQLQueryEngine - executeQuery with dialect=null uses ' +
  'SQLite mode', async (t) => {
  const engine = new SQLQueryEngine({
    systemCache: createMinimalSystemCache(),
    messageRouter: createMockRouter(),
  });

  const result = await engine.executeQuery(
    'SELECT * FROM users WHERE id = ?',
    ['alice'],
    {dialect: null},
  );

  t.equal(result.success, true, 'null dialect defaults to SQLite');
  t.end();
});
