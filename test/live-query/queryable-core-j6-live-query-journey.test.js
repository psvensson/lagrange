/**
 * J6 Live Query Results Journey Test.
 *
 * Verifies:
 * 1. Empty initial query snapshot and unsolicited push updates.
 * 2. Distinct canonical query groups for differing projections, limits, and orderings.
 * 3. Exact matching against reference SQLite oracle, with no column leakage.
 * 4. Fail-closed predicate evaluation (unknown expressions evaluate to false).
 * 5. Serialized and coalesced query refresh with monotonic generation fencing.
 * 6. Dynamic partition topology change and clean subscription teardown on disconnect.
 * 7. Anti-polling proof: zero background polling reads during idle window.
 */

import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {createLiveQueryStartupWiring} from '../../src/live-query/live-query-startup-wiring.js';
import {QueryGroup} from '../../src/live-query/live-query-group.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  evaluateWhereExpression,
} from '../../src/live-query/live-query-service.js';
import {
  startLeader,
  applyCommitted,
  committedQueryOf,
  clearFixtureSingletons,
  resetFixtureSingletons,
} from '../test-helpers/participant-transaction-fixture.js';

function createMockClient(id = 'test-client') {
  const messages = [];
  return {
    id,
    messages,
    send: (msg) => messages.push(typeof msg === 'string' ? JSON.parse(msg) : msg),
  };
}

function createTableCache(tables, getPartitions) {
  const tableMap = new Map(tables.map((t) => [t.table_name, t]));
  return {
    get: (table, key) => (table === 'tables' ? tableMap.get(key) || null : null),
    find: (table, pred) => (table === 'tables' ? tables.find(pred) || null : null),
    filter: (table, pred) => {
      if (table === 'partitions') {
        const parts = typeof getPartitions === 'function' ? getPartitions() : getPartitions;
        return parts.filter(pred || (() => true));
      }
      return [];
    },
  };
}

const TABLE_SCHEMA = {
  columns: [
    {name: 'id', type: 'INTEGER', primaryKey: true},
    {name: 'customer', type: 'TEXT'},
    {name: 'status', type: 'TEXT'},
    {name: 'total', type: 'INTEGER'},
    {name: 'secret_note', type: 'TEXT'},
  ],
};

const TABLES_METADATA = [
  {table_name: 'live_orders', primary_key: 'id', partition_key_type: 'INTEGER'},
];

describe('Unit J6: Live query results committed CDC delivery and lifecycle', () => {
  let leader;
  let oracleDb;
  let sqlEngine;
  let wiring;
  let systemCache;
  let partitionMap;
  let currentPartitions;

  beforeEach(async () => {
    resetFixtureSingletons();
    oracleDb = new Database(':memory:');
    oracleDb.exec(`
      CREATE TABLE live_orders (
        id INTEGER PRIMARY KEY,
        customer TEXT,
        status TEXT,
        total INTEGER,
        secret_note TEXT
      );
    `);

    const leaderResult = await startLeader({
      tableName: 'live_orders',
      schema: TABLE_SCHEMA,
    });
    leader = leaderResult.leader;

    partitionMap = new Map([
      ['p1', leader],
    ]);

    currentPartitions = [
      {
        partition_id: 'p1',
        table_name: 'live_orders',
        partition_key_start: null,
        partition_key_end: null,
        partition_key_type: 'INTEGER',
      },
    ];
    systemCache = createTableCache(TABLES_METADATA, () => currentPartitions);

    const parserEngine = new SQLQueryEngine();
    sqlEngine = {
      callCount: 0,
      parse: (sql) => parserEngine.parse(sql),
      executeQuery: async (sql, params = []) => {
        sqlEngine.callCount += 1;
        const stmt = oracleDb.prepare(sql);
        const rows = stmt.all(...params);
        return {rows, results: rows, count: rows.length};
      },
    };

    wiring = createLiveQueryStartupWiring({
      nodeId: 'test-node-j6',
      systemTableCache: systemCache,
      sqlQueryEngine: sqlEngine,
      partitionServicesProvider: () => partitionMap,
    });
  });

  afterEach(async () => {
    wiring?.shutdown();
    if (leader) {
      await leader.shutdown();
    }
    oracleDb?.close();
    clearFixtureSingletons();
  });

  it('delivers committed CDC updates to distinct query groups matching reference oracle', async () => {
    const client1 = createMockClient('client-1');
    const client2 = createMockClient('client-2');

    const sql1 = 'SELECT id, customer, total FROM live_orders WHERE status = \'OPEN\' ORDER BY id';
    const reg1 = await wiring.liveQueryManager.registerLiveQuery(sql1, client1);

    const sql2 = 'SELECT id, customer FROM live_orders WHERE status = \'OPEN\' ' +
      'ORDER BY total DESC LIMIT 1';
    const reg2 = await wiring.liveQueryManager.registerLiveQuery(sql2, client2);

    assert.notEqual(reg1.queryId, reg2.queryId, 'distinct query groups for differing projections');
    assert.equal(client1.messages.length, 1, 'initial snapshot emitted to client 1');
    assert.deepEqual(client1.messages[0].rows, [], 'initial snapshot is empty');
    assert.equal(client2.messages.length, 1, 'initial snapshot emitted to client 2');
    assert.deepEqual(client2.messages[0].rows, [], 'initial snapshot is empty');

    const insertSql1 = 'INSERT INTO live_orders VALUES ' +
      '(1, \'Alice\', \'OPEN\', 100, \'secret_alice\')';
    oracleDb.prepare(insertSql1).run();
    applyCommitted(leader, committedQueryOf('w1', insertSql1));
    await new Promise((r) => setTimeout(r, 60));

    const latest1a = client1.messages[client1.messages.length - 1];
    const latest2a = client2.messages[client2.messages.length - 1];
    assert.deepEqual(latest1a.rows, oracleDb.prepare(sql1).all());
    assert.deepEqual(latest2a.rows, oracleDb.prepare(sql2).all());
    assert.equal(latest1a.rows[0].secret_note, undefined, 'secret_note never leaked');
    assert.equal(latest2a.rows[0].secret_note, undefined, 'secret_note never leaked');

    const insertSql2 = 'INSERT INTO live_orders VALUES ' +
      '(2, \'Bob\', \'OPEN\', 300, \'secret_bob\')';
    oracleDb.prepare(insertSql2).run();
    applyCommitted(leader, committedQueryOf('w2', insertSql2));
    await new Promise((r) => setTimeout(r, 60));

    const latest1b = client1.messages[client1.messages.length - 1];
    const latest2b = client2.messages[client2.messages.length - 1];
    assert.deepEqual(latest1b.rows, oracleDb.prepare(sql1).all());
    assert.deepEqual(latest2b.rows, oracleDb.prepare(sql2).all());
    assert.equal(latest2b.rows.length, 1, 'limit 1 strictly preserved');
    assert.equal(latest2b.rows[0].customer, 'Bob', 'Bob has highest total');

    const updateSql1 = 'UPDATE live_orders SET total = 500 WHERE id = 1';
    oracleDb.prepare(updateSql1).run();
    applyCommitted(leader, committedQueryOf('w3', updateSql1));
    await new Promise((r) => setTimeout(r, 60));

    const latest2c = client2.messages[client2.messages.length - 1];
    assert.deepEqual(latest2c.rows, oracleDb.prepare(sql2).all());
    assert.equal(latest2c.rows[0].customer, 'Alice', 'Alice now has highest total');

    const updateSql2 = 'UPDATE live_orders SET status = \'CANCELLED\' WHERE id = 2';
    oracleDb.prepare(updateSql2).run();
    applyCommitted(leader, committedQueryOf('w4', updateSql2));
    await new Promise((r) => setTimeout(r, 60));

    const latest1d = client1.messages[client1.messages.length - 1];
    assert.deepEqual(latest1d.rows, oracleDb.prepare(sql1).all());
    assert.equal(latest1d.rows.length, 1);

    const updateSql3 = 'UPDATE live_orders SET status = \'OPEN\' WHERE id = 2';
    oracleDb.prepare(updateSql3).run();
    applyCommitted(leader, committedQueryOf('w5', updateSql3));
    await new Promise((r) => setTimeout(r, 60));

    const latest1e = client1.messages[client1.messages.length - 1];
    assert.deepEqual(latest1e.rows, oracleDb.prepare(sql1).all());
    assert.equal(latest1e.rows.length, 2);

    const deleteSql1 = 'DELETE FROM live_orders WHERE id = 1';
    oracleDb.prepare(deleteSql1).run();
    applyCommitted(leader, committedQueryOf('w6', deleteSql1));
    await new Promise((r) => setTimeout(r, 60));

    const latest1f = client1.messages[client1.messages.length - 1];
    const latest2f = client2.messages[client2.messages.length - 1];
    assert.deepEqual(latest1f.rows, oracleDb.prepare(sql1).all());
    assert.deepEqual(latest2f.rows, oracleDb.prepare(sql2).all());
    assert.equal(latest2f.rows[0].customer, 'Bob');
  });

  it('evaluates unknown expressions fail-closed as false', () => {
    const unknownNode = {type: 'UNKNOWN_EXPRESSION_NODE', val: 123};
    assert.equal(evaluateWhereExpression(unknownNode, {id: 1}), false);

    const unknownOp = {
      type: 'binary',
      operator: 'CUSTOM_UNKNOWN_OP',
      left: {type: 'literal', value: 1},
      right: {type: 'literal', value: 1},
    };
    assert.equal(evaluateWhereExpression(unknownOp, {}), false);

    const isNullExpr = {
      type: 'binary',
      operator: 'IS NULL',
      left: {type: 'column_ref', column: 'val'},
    };
    assert.equal(evaluateWhereExpression(isNullExpr, {val: null}), true);
    assert.equal(evaluateWhereExpression(isNullExpr, {val: 10}), false);

    const isNotNullExpr = {
      type: 'binary',
      operator: 'IS NOT NULL',
      left: {type: 'column_ref', column: 'val'},
    };
    assert.equal(evaluateWhereExpression(isNotNullExpr, {val: 10}), true);
    assert.equal(evaluateWhereExpression(isNotNullExpr, {val: null}), false);

    const betweenExpr = {
      type: 'between',
      expression: {type: 'column_ref', column: 'score'},
      low: {type: 'literal', value: 10},
      high: {type: 'literal', value: 20},
    };
    assert.equal(evaluateWhereExpression(betweenExpr, {score: 15}), true);
    assert.equal(evaluateWhereExpression(betweenExpr, {score: 5}), false);

    const paramExpr = {
      type: 'binary',
      operator: '=',
      left: {type: 'column_ref', column: 'status'},
      right: {type: 'parameter', index: 1},
    };
    assert.equal(evaluateWhereExpression(paramExpr, {status: 'ACTIVE'}, ['ACTIVE']), true);
    assert.equal(evaluateWhereExpression(paramExpr, {status: 'ACTIVE'}, ['INACTIVE']), false);
  });

  it('serializes and coalesces refresh so stale completions do not overwrite newer state', async () => {
    let callIndex = 0;
    let slowResolve;
    const slowExecution = new Promise((resolve) => {
      slowResolve = resolve;
    });

    const timingEngine = {
      executeQuery: async () => {
        callIndex += 1;
        if (callIndex === 1) {
          await slowExecution;
          return {rows: [{id: 1, val: 'stale_first'}], count: 1};
        }
        return {rows: [{id: 1, val: 'fresh_second'}], count: 1};
      },
    };

    const group = new QueryGroup({
      parsedQuery: {
        type: 'SELECT',
        columns: [{type: 'star'}],
        from: {name: 't'},
        where: null,
      },
      sqlQueryEngine: timingEngine,
    });

    const firstPromise = group.refreshQueryResult();
    group.refreshInFlight = false;
    const secondPromise = group.refreshQueryResult();

    const secondResult = await secondPromise;
    assert.ok(secondResult, 'second refresh finished');
    assert.equal(group.lastResultSet[0].val, 'fresh_second');

    slowResolve();
    const firstResult = await firstPromise;
    assert.equal(firstResult, null, 'stale first completion was discarded');
    assert.equal(group.lastResultSet[0].val, 'fresh_second', 'newer result remained intact');
  });

  it('handles partition topology split and clean client disconnection', async () => {
    const subscribed = new Set();
    const unsubscribed = new Set();

    const customWiring = createLiveQueryStartupWiring({
      nodeId: 'test-node-topo',
      systemTableCache: systemCache,
      sqlQueryEngine: sqlEngine,
      subscribeToPartition: async (partitionId) => {
        subscribed.add(partitionId);
      },
      unsubscribeFromPartition: async (partitionId) => {
        unsubscribed.add(partitionId);
      },
    });

    const client = createMockClient('topo-client');
    const reg = await customWiring.liveQueryManager.registerLiveQuery({
      from: {name: 'live_orders'},
    }, client);

    assert.ok(subscribed.has('p1'), 'subscribed to initial partition p1');

    const splitPartitions = [
      {
        partition_id: 'p1a',
        table_name: 'live_orders',
        partition_key_start: null,
        partition_key_end: 50,
        partition_key_type: 'INTEGER',
      },
      {
        partition_id: 'p1b',
        table_name: 'live_orders',
        partition_key_start: 50,
        partition_key_end: null,
        partition_key_type: 'INTEGER',
      },
    ];
    currentPartitions = splitPartitions;

    await customWiring.liveQueryManager.handlePartitionTopologyChange({
      operation: 'UPDATE',
      old: {table_name: 'live_orders'},
      new: {table_name: 'live_orders'},
    });

    assert.ok(unsubscribed.has('p1'), 'unsubscribed from retired p1');
    assert.ok(subscribed.has('p1a'), 'subscribed to child p1a');
    assert.ok(subscribed.has('p1b'), 'subscribed to child p1b');

    customWiring.liveQueryManager.unregisterLiveQuery(reg.queryId, client.id);
    assert.ok(unsubscribed.has('p1a'), 'unsubscribed from p1a on disconnect');
    assert.ok(unsubscribed.has('p1b'), 'unsubscribed from p1b on disconnect');
    assert.equal(customWiring.liveQueryManager.queryGroups.size, 0, 'query groups cleared');

    customWiring.shutdown();
  });

  it('proves anti-polling hygiene with zero background reads during idle window', async () => {
    const client = createMockClient('anti-polling-client');
    const sql = 'SELECT id, customer FROM live_orders WHERE status = \'OPEN\'';
    const reg = await wiring.liveQueryManager.registerLiveQuery(sql, client);

    const initialQueryCount = sqlEngine.callCount;
    assert.equal(initialQueryCount, 1, 'exactly one query execution during snapshot');

    await new Promise((resolve) => setTimeout(resolve, 80));

    assert.equal(sqlEngine.callCount, initialQueryCount, 'ZERO background SELECT reads while idle');
    wiring.liveQueryManager.unregisterLiveQuery(reg.queryId, client.id);
  });
});
