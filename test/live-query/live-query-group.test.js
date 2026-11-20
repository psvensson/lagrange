/**
 * End-to-end LiveQueryGroup witness for aliased vs unaliased queries over
 * tables with declared collations (design coordinator-sqlite-merge §2.11, WP7).
 */

import Database from 'better-sqlite3';

import {LIVE_QUERY_EVENT, LIVE_QUERY_OPERATION} from '../../src/live-query/live-query-constants.js';
import {QueryGroup} from '../../src/live-query/live-query-group.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {renderTableDefinitionSql} from '../../src/query/sql-table-definition.js';
import {test} from '../../src/test-helpers/tap.js';

const USERS_TABLE = 'users';
const PARTITIONS_TABLE = 'partitions';
const TABLES_TABLE = 'tables';

function createUsersBackingStore() {
  const schema = {
    tableName: USERS_TABLE,
    columns: [
      {name: 'id', type: 'INTEGER', collation: 'BINARY', primaryKey: true, notNull: false},
      {name: 'name', type: 'TEXT', collation: 'NOCASE', primaryKey: false, notNull: true},
      {name: 'score', type: 'INTEGER', collation: 'BINARY', primaryKey: false, notNull: true},
    ],
    primaryKey: ['id'],
    tableConstraints: [],
  };
  const db = new Database(':memory:');
  db.exec(renderTableDefinitionSql(USERS_TABLE, schema));
  db.prepare('INSERT INTO users (id, name, score) VALUES (?, ?, ?)').run(1, 'alice', 10);
  db.prepare('INSERT INTO users (id, name, score) VALUES (?, ?, ?)').run(2, 'bob', 20);

  const tableRecord = {
    table_name: USERS_TABLE,
    tableName: USERS_TABLE,
    schema,
    schema_definition: JSON.stringify(schema),
    active_partition_version: 1,
  };
  const partitionRecords = [
    {
      partition_id: 'users-p0',
      partitionId: 'users-p0',
      table_name: USERS_TABLE,
      tableName: USERS_TABLE,
      partition_key_start: null,
      partition_key_end: 100,
      partition_key_type: 'INTEGER',
      partition_version: 1,
      state: 'NORMAL',
    },
    {
      partition_id: 'users-p1',
      partitionId: 'users-p1',
      table_name: USERS_TABLE,
      tableName: USERS_TABLE,
      partition_key_start: 100,
      partition_key_end: null,
      partition_key_type: 'INTEGER',
      partition_version: 1,
      state: 'NORMAL',
    },
  ];
  const systemCache = {
    get: (table, key) => (table === TABLES_TABLE && key === USERS_TABLE ? tableRecord : null),
    find: (table, predicate) => {
      if (table === TABLES_TABLE) {
        return predicate(tableRecord) ? tableRecord : null;
      }
      return null;
    },
    filter: (table, predicate) => {
      if (table === PARTITIONS_TABLE) {
        return partitionRecords.filter(predicate);
      }
      return [];
    },
  };
  const sqlQueryEngine = {
    executeQuery: async (sql, params = []) => ({
      rows: db.prepare(sql).all(...params),
      appliedIndex: 1,
    }),
  };
  return {db, schema, systemCache, sqlQueryEngine};
}

function normalizeNotification(event) {
  if (!event) return null;
  return {
    type: event.type,
    operation: event.operation,
    row: event.row ?? null,
    old: event.old ?? null,
    new: event.new ?? null,
  };
}

test('aliased and unaliased QueryGroup preserve COLLATE NOCASE across initial snapshot and CDC UPDATE/INSERT', async (t) => {
  const {db, systemCache, sqlQueryEngine} = createUsersBackingStore();
  t.teardown(() => db.close());

  const aliasedSql = 'SELECT * FROM users AS u WHERE u.name = \'ALICE\'';
  const unaliasedSql = 'SELECT * FROM users WHERE name = \'ALICE\'';

  const aliasedGroup = new QueryGroup({
    parsedQuery: new SQLParser(aliasedSql).parse(),
    rawSql: aliasedSql,
    systemCache,
    sqlQueryEngine,
  });
  const unaliasedGroup = new QueryGroup({
    parsedQuery: new SQLParser(unaliasedSql).parse(),
    rawSql: unaliasedSql,
    systemCache,
    sqlQueryEngine,
  });
  t.teardown(() => {
    aliasedGroup.cleanup();
    unaliasedGroup.cleanup();
  });

  const aliasedEvents = [];
  const unaliasedEvents = [];
  aliasedGroup.addClient({id: 'c-aliased', send: (msg) => aliasedEvents.push(JSON.parse(msg))});
  unaliasedGroup.addClient({id: 'c-unaliased', send: (msg) => unaliasedEvents.push(JSON.parse(msg))});

  const aliasedSnapshot = await aliasedGroup.initialize({
    subscribeToPartition: async () => ({streamVersion: 1}),
  });
  const unaliasedSnapshot = await unaliasedGroup.initialize({
    subscribeToPartition: async () => ({streamVersion: 1}),
  });

  t.same(
    aliasedSnapshot,
    [{id: 1, name: 'alice', score: 10}],
    'initial snapshot returns matching lowercase alice row',
  );
  t.same(
    aliasedSnapshot,
    unaliasedSnapshot,
    'aliased and unaliased initial snapshots are identical',
  );

  // Incremental CDC UPDATE on unrelated column `score` of row id=1 (`name: 'alice'`).
  // Must emit an UPDATE event (never a spurious DELETE!).
  const cdcUpdate = {
    operation: LIVE_QUERY_OPERATION.UPDATE,
    old_data: {id: 1, name: 'alice', score: 10},
    data: {id: 1, name: 'alice', score: 25},
    hlc_timestamp: '1000:1',
    logIndex: 2,
  };
  const aliasedUpdateResult = await aliasedGroup.handleCDCEvent(cdcUpdate, 'users-p0');
  const unaliasedUpdateResult = await unaliasedGroup.handleCDCEvent(cdcUpdate, 'users-p0');

  t.ok(aliasedUpdateResult, 'aliased group emits an event on CDC UPDATE');
  t.equal(
    aliasedUpdateResult.type,
    LIVE_QUERY_EVENT.UPDATE,
    'aliased group emits UPDATE, never a spurious DELETE',
  );
  t.same(
    normalizeNotification(aliasedUpdateResult),
    normalizeNotification(unaliasedUpdateResult),
    'aliased and unaliased CDC UPDATE events are identical',
  );
  t.same(
    aliasedGroup.resultSet.get(1),
    {id: 1, name: 'alice', score: 25},
    'row id=1 remains in aliased group resultSet after UPDATE',
  );

  // Incremental CDC INSERT of another matching row with mixed case `name: 'Alice'`.
  const cdcInsert = {
    operation: LIVE_QUERY_OPERATION.INSERT,
    data: {id: 3, name: 'Alice', score: 50},
    hlc_timestamp: '1000:2',
    logIndex: 3,
  };
  const aliasedInsertResult = await aliasedGroup.handleCDCEvent(cdcInsert, 'users-p0');
  const unaliasedInsertResult = await unaliasedGroup.handleCDCEvent(cdcInsert, 'users-p0');

  t.ok(aliasedInsertResult, 'aliased group emits an event on CDC INSERT');
  t.equal(aliasedInsertResult.type, LIVE_QUERY_EVENT.INSERT, 'aliased group emits INSERT');
  t.same(
    normalizeNotification(aliasedInsertResult),
    normalizeNotification(unaliasedInsertResult),
    'aliased and unaliased CDC INSERT events are identical',
  );
  t.same(
    Array.from(aliasedGroup.resultSet.entries()),
    Array.from(unaliasedGroup.resultSet.entries()),
    'aliased and unaliased result sets match after CDC UPDATE and INSERT',
  );
  t.same(
    aliasedEvents.map(normalizeNotification),
    unaliasedEvents.map(normalizeNotification),
    'aliased and unaliased client notifications match',
  );
});

test('aliased QueryGroup forwards params and tableAliases to PartitionResolver', async (t) => {
  const {db, systemCache, sqlQueryEngine} = createUsersBackingStore();
  t.teardown(() => db.close());

  const sql = 'SELECT * FROM users AS u WHERE u.id = ?';
  const group = new QueryGroup({
    parsedQuery: new SQLParser(sql).parse(),
    rawSql: sql,
    params: [15],
    systemCache,
    sqlQueryEngine,
  });
  t.teardown(() => group.cleanup());

  const partitions = await group.findPartitionsForQuery();
  t.same(
    Array.from(partitions),
    ['users-p0'],
    'aliased key predicate with positional parameter prunes to the single matching partition',
  );
});

test('self-join QueryGroup with two aliases of the same table registers, initializes snapshot, and refreshes on CDC UPDATE while preserving NOCASE collation', async (t) => {
  const {db, systemCache, sqlQueryEngine} = createUsersBackingStore();
  t.teardown(() => db.close());

  const selfJoinSql =
    'SELECT u1.id, u2.name, u2.score FROM users AS u1 JOIN users AS u2 ON u1.id = u2.id WHERE u2.name = \'ALICE\'';
  const group = new QueryGroup({
    parsedQuery: new SQLParser(selfJoinSql).parse(),
    rawSql: selfJoinSql,
    systemCache,
    sqlQueryEngine,
  });
  t.teardown(() => group.cleanup());

  t.equal(group.isComplex, true, 'self-join QueryGroup is classified as complex (Tier 2)');

  const notifications = [];
  group.addClient({
    id: 'client-self-join',
    send: (msg) => notifications.push(JSON.parse(msg)),
  });

  const subscribedPartitions = [];
  const initialRows = await group.initialize({
    subscribeToPartition: async (partitionId) => {
      subscribedPartitions.push(partitionId);
    },
    options: {attachAfterVersion: 1},
  });

  t.same(
    subscribedPartitions.sort(),
    ['users-p0', 'users-p1'],
    'self-join subscribes to all visible partitions of the joined table',
  );
  t.same(
    initialRows,
    [{id: 1, name: 'alice', score: 10}],
    'initial self-join snapshot matches lowercase alice under NOCASE on u2.name',
  );

  // Apply an update in the backing store and deliver the CDC UPDATE event:
  db.prepare('UPDATE users SET score = 77 WHERE id = 1').run();
  await group.handleCDCEvent(
    {
      operation: LIVE_QUERY_OPERATION.UPDATE,
      old_data: {id: 1, name: 'alice', score: 10},
      data: {id: 1, name: 'alice', score: 77},
      hlc_timestamp: '2000:1',
      logIndex: 2,
    },
    'users-p0',
  );

  t.equal(notifications.length, 1, 'self-join group emits a reset notification on CDC update');
  t.equal(notifications[0].type, LIVE_QUERY_EVENT.RESET, 'Tier 2 refresh emits RESET notification');
  t.same(
    notifications[0].rows,
    [{id: 1, name: 'alice', score: 77}],
    'refreshed self-join rows reflect the updated score',
  );
});
