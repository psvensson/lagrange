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
import {MessageRouter} from '../../src/transport/message-router.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {TABLES} from '../../src/constants/index.js';
import {
  compilePredicate,
} from '../../src/live-query/live-query-service.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';
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

  it('compiles predicates through SQLite and fails closed on unknown expressions', () => {
    const unknownNode = {type: 'UNKNOWN_EXPRESSION_NODE', val: 123};
    assert.throws(
      () => compilePredicate(unknownNode),
      {code: 'UNSUPPORTED_SQL_FEATURE'},
    );

    const unknownOp = {
      type: 'binary',
      operator: 'CUSTOM_UNKNOWN_OP',
      left: {type: 'literal', value: 1},
      right: {type: 'literal', value: 1},
    };
    assert.throws(
      () => compilePredicate(unknownOp),
      {code: 'UNSUPPORTED_SQL_FEATURE'},
    );

    const isNullPred = compilePredicate({
      type: 'binary',
      operator: 'IS NULL',
      left: {type: 'column_ref', column: 'val'},
    });
    assert.equal(isNullPred({val: null}), true);
    assert.equal(isNullPred({val: 10}), false);
    isNullPred.close();

    const isNotNullPred = compilePredicate({
      type: 'binary',
      operator: 'IS NOT NULL',
      left: {type: 'column_ref', column: 'val'},
    });
    assert.equal(isNotNullPred({val: 10}), true);
    assert.equal(isNotNullPred({val: null}), false);
    isNotNullPred.close();

    const betweenPred = compilePredicate({
      type: 'between',
      expression: {type: 'column_ref', column: 'score'},
      low: {type: 'literal', value: 10},
      high: {type: 'literal', value: 20},
    });
    assert.equal(betweenPred({score: 15}), true);
    assert.equal(betweenPred({score: 5}), false);
    betweenPred.close();

    const paramExpr = {
      type: 'binary',
      operator: '=',
      left: {type: 'column_ref', column: 'status'},
      right: {type: 'parameter', index: 1},
    };
    const activePred = compilePredicate(paramExpr, ['ACTIVE']);
    const inactivePred = compilePredicate(paramExpr, ['INACTIVE']);
    assert.equal(activePred({status: 'ACTIVE'}), true);
    assert.equal(inactivePred({status: 'ACTIVE'}), false);
    activePred.close();
    inactivePred.close();
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

function createRemoteTopologyCache(tables, getPartitions, getReplicas) {
  const listeners = new Set();
  const tableMap = new Map(tables.map((t) => [t.table_name, t]));
  return {
    onCacheChange: (listener) => listeners.add(listener),
    offCacheChange: (listener) => listeners.delete(listener),
    emitCacheChange: (tableName, operation, record) => {
      for (const listener of listeners) {
        listener(tableName, operation, record);
      }
    },
    get: (table, key) => {
      if (table === TABLES.TABLES) return tableMap.get(key) || null;
      if (table === TABLES.PARTITIONS) {
        return getPartitions().find((p) => p.partition_id === key) || null;
      }
      return null;
    },
    find: (table, pred) => {
      if (table === TABLES.TABLES) return tables.find(pred) || null;
      if (table === TABLES.PARTITIONS) return getPartitions().find(pred) || null;
      return null;
    },
    filter: (table, pred) => {
      if (table === TABLES.PARTITIONS) return getPartitions().filter(pred || (() => true));
      if (table === TABLES.PARTITION_REPLICAS) return getReplicas().filter(pred || (() => true));
      return [];
    },
  };
}

async function createBridgedRouters(nodeIds, capturedCdcDeliveries) {
  const routers = new Map();
  for (const nodeId of nodeIds) {
    const router = new MessageRouter({
      bootIncarnation: TEST_BOOT_INCARNATION,
      nodeId,
      inProcess: true,
    });
    await router.initialize({startServer: false});
    routers.set(nodeId, router);
  }
  for (const router of routers.values()) {
    router.deliverRemote = async (
      targetAddress, messageId, payload, targetNodeId, correlationId, opts,
    ) => {
      if (payload?.type === 'LIVE_QUERY_CDC_EVENT') {
        capturedCdcDeliveries.push(payload);
      }
      const peer = routers.get(targetNodeId);
      if (!peer || !peer.initialized) {
        return {result: {messageId, correlationId, acknowledged: false, error: 'offline'}, queueWaitMs: 0};
      }
      if (!peer.handlers.get(targetAddress)) {
        return {result: {messageId, correlationId, acknowledged: false, noHandler: true, error: 'noHandler'}, queueWaitMs: 0};
      }
      return peer.deliverLocal(
        targetAddress,
        messageId,
        payload,
        correlationId,
        {timeoutMs: opts?.timeoutMs},
      );
    };
  }
  return routers;
}

function applyClientMessageToView(rowMap, msg) {
  if (msg.type === 'snapshot' || msg.type === 'reset') {
    rowMap.clear();
    for (const row of msg.rows || []) rowMap.set(row.id, row);
    return;
  }
  if (msg.type === 'insert') {
    rowMap.set(msg.row.id, msg.row);
    return;
  }
  if (msg.type === 'update') {
    rowMap.set(msg.new.id, msg.new);
    return;
  }
  if (msg.type === 'delete') {
    rowMap.delete(msg.row.id);
  }
}

async function waitForMessageMatch(predicate, timeoutMs = 1500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 15));
  }
  return predicate();
}

describe('Unit J6: Multi-node remote producer CDC delivery and leader failover', () => {
  let oracleDb;
  let routers;
  let leaderB;
  let leaderC;
  let wiringA;

  beforeEach(() => {
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
  });

  afterEach(async () => {
    wiringA?.shutdown();
    if (leaderB) await leaderB.shutdown();
    if (leaderC) await leaderC.shutdown();
    if (routers) {
      for (const router of routers.values()) {
        if (router.initialized) await router.shutdown();
      }
    }
    oracleDb?.close();
    clearFixtureSingletons();
  });

  it('pushes remote PartitionService CDC over MessageRouter, survives leader failover, and unsubscribes cleanly', async () => {
    const capturedCdcDeliveries = [];
    routers = await createBridgedRouters(['node-a', 'node-b', 'node-c'], capturedCdcDeliveries);
    const routerA = routers.get('node-a');
    const routerB = routers.get('node-b');
    const routerC = routers.get('node-c');

    ({leader: leaderB} = await startLeader({
      tableName: 'live_orders',
      schema: TABLE_SCHEMA,
      nodeId: 'node-b',
      replicaId: 'p1',
      transport: routerB,
    }, 'p1'));
    ({leader: leaderC} = await startLeader({
      tableName: 'live_orders',
      schema: TABLE_SCHEMA,
      nodeId: 'node-c',
      replicaId: 'p1',
      transport: routerC,
    }, 'p1'));

    let currentPartitions = [{
      partition_id: 'p1',
      table_name: 'live_orders',
      partition_key_start: null,
      partition_key_end: null,
      partition_key_type: 'INTEGER',
      leader_node_id: 'node-b',
    }];
    let currentReplicas = [{partition_id: 'p1', node_id: 'node-b'}];
    const systemCache = createRemoteTopologyCache(
      TABLES_METADATA,
      () => currentPartitions,
      () => currentReplicas,
    );

    const parserEngine = new SQLQueryEngine();
    const sqlEngine = {
      callCount: 0,
      parse: (sql) => parserEngine.parse(sql),
      executeQuery: async (sql, params = []) => {
        sqlEngine.callCount += 1;
        const rows = oracleDb.prepare(sql).all(...params);
        return {rows, results: rows, count: rows.length};
      },
    };

    wiringA = createLiveQueryStartupWiring({
      nodeId: 'node-a',
      systemTableCache: systemCache,
      sqlQueryEngine: sqlEngine,
      partitionServicesProvider: () => new Map(),
      messageRouter: routerA,
    });

    const client = createMockClient('remote-client');
    const observedRows = new Map();
    const origSend = client.send;
    client.send = (msg) => {
      origSend(msg);
      applyClientMessageToView(observedRows, client.messages[client.messages.length - 1]);
    };

    const sql = 'SELECT id, customer, total FROM live_orders WHERE status = \'OPEN\'';
    const reg = await wiringA.liveQueryManager.registerLiveQuery(sql, client);
    assert.equal(sqlEngine.callCount, 1, 'initial snapshot executes once');
    assert.equal(leaderB.cdcSubscribers.size, 1, 'Node B partition has remote subscriber');
    assert.equal(leaderC.cdcSubscribers.size, 0, 'Node C partition has no subscriber yet');

    const commitOnLeader = async (leader, entryId, statementSql, params, expectedMsgCount) => {
      oracleDb.prepare(statementSql).run(...params);
      applyCommitted(leader, {...committedQueryOf(entryId, statementSql), params});
      const delivered = await waitForMessageMatch(() => client.messages.length >= expectedMsgCount);
      assert.ok(delivered, `expected client message ${expectedMsgCount} for ${entryId}`);
      const sortedObserved = Array.from(observedRows.values()).sort((a, b) => a.id - b.id);
      assert.deepEqual(sortedObserved, oracleDb.prepare(`${sql} ORDER BY id`).all());
    };

    await commitOnLeader(
      leaderB,
      'rw1',
      'INSERT INTO live_orders (id, customer, status, total, secret_note) VALUES (?, ?, ?, ?, ?)',
      [1, 'Alice', 'OPEN', 100, 's1'],
      2,
    );
    await commitOnLeader(
      leaderB, 'rw2', 'UPDATE live_orders SET total = ? WHERE id = ?', [250, 1], 3,
    );
    await commitOnLeader(
      leaderB,
      'rw3',
      'INSERT INTO live_orders (id, customer, status, total, secret_note) VALUES (?, ?, ?, ?, ?)',
      [2, 'Bob', 'OPEN', 300, 's2'],
      4,
    );
    await commitOnLeader(
      leaderB, 'rw4', 'DELETE FROM live_orders WHERE id = ?', [2], 5,
    );

    assert.equal(sqlEngine.callCount, 1, 'incremental remote CDC updates perform zero polling reads');
    assert.equal(capturedCdcDeliveries.length, 4, 'all 4 mutations pushed over MessageRouter');
    for (const delivery of capturedCdcDeliveries) {
      assert.ok(delivery.events.length > 0, 'delivered CDC vector non-empty');
      for (const evt of delivery.events) {
        assert.ok(Number.isFinite(evt.logIndex), 'CDC event carries committed Raft logIndex');
      }
    }

    const idleBaselineCalls = sqlEngine.callCount;
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(sqlEngine.callCount, idleBaselineCalls, 'zero background polling reads during idle');

    // Fail over p1 leadership from node-b to node-c.
    currentPartitions = [{...currentPartitions[0], leader_node_id: 'node-c'}];
    currentReplicas = [{partition_id: 'p1', node_id: 'node-c'}];
    systemCache.emitCacheChange(TABLES.PARTITIONS, 'UPDATE', currentPartitions[0]);

    const rebound = await waitForMessageMatch(
      () => leaderB.cdcSubscribers.size === 0 && leaderC.cdcSubscribers.size === 1,
    );
    assert.ok(rebound, 'wiringA re-binds remote CDC subscription from node-b to node-c');

    const msgCountBeforeFailoverWrite = client.messages.length;
    await commitOnLeader(
      leaderC,
      'rw5',
      'INSERT INTO live_orders (id, customer, status, total, secret_note) VALUES (?, ?, ?, ?, ?)',
      [3, 'Carol', 'OPEN', 400, 's3'],
      msgCountBeforeFailoverWrite + 1,
    );

    wiringA.liveQueryManager.unregisterLiveQuery(reg.queryId, client.id);
    const unsubscribed = await waitForMessageMatch(() => leaderC.cdcSubscribers.size === 0);
    assert.ok(unsubscribed, 'Node A sent LIVE_QUERY_CDC_UNSUBSCRIBE to Node C on unregister');
  });

  it('Schedule A: recovers Row 1 after canonical DEFERRED (noHandler: false) without manual refresh', async () => {
    const capturedCdcDeliveries = [];
    routers = await createBridgedRouters(['node-a', 'node-b'], capturedCdcDeliveries);
    const routerA = routers.get('node-a');
    const routerB = routers.get('node-b');

    let deferEventDelivery = true;
    const origDeliverB = routerB.deliver.bind(routerB);
    routerB.deliver = async (targetAddress, message, opts = {}) => {
      if (deferEventDelivery && message?.type === 'LIVE_QUERY_CDC_EVENT') {
        return buildDeliveryEnvelope({
          acknowledged: false,
          deferRetry: true,
          noHandler: false,
          retryAfterMs: 25,
          error: 'temporary transport disconnect',
        });
      }
      return origDeliverB(targetAddress, message, opts);
    };

    ({leader: leaderB} = await startLeader({
      tableName: 'live_orders',
      schema: TABLE_SCHEMA,
      nodeId: 'node-b',
      replicaId: 'p1',
      transport: routerB,
    }, 'p1'));

    const currentPartitions = [{
      partition_id: 'p1',
      table_name: 'live_orders',
      partition_key_start: null,
      partition_key_end: null,
      partition_key_type: 'INTEGER',
      leader_node_id: 'node-b',
    }];
    const systemCache = createRemoteTopologyCache(
      TABLES_METADATA,
      () => currentPartitions,
      () => [{partition_id: 'p1', node_id: 'node-b'}],
    );
    const parserEngine = new SQLQueryEngine();
    const sqlEngine = {
      callCount: 0,
      parse: (sql) => parserEngine.parse(sql),
      executeQuery: async (sql, params = []) => {
        sqlEngine.callCount += 1;
        const rows = oracleDb.prepare(sql).all(...params);
        return {rows, results: rows, count: rows.length};
      },
    };

    wiringA = createLiveQueryStartupWiring({
      nodeId: 'node-a',
      systemTableCache: systemCache,
      sqlQueryEngine: sqlEngine,
      partitionServicesProvider: () => new Map(),
      messageRouter: routerA,
    });

    const client = createMockClient('deferred-recovery-client');
    const observedRows = new Map();
    const origSend = client.send;
    client.send = (msg) => {
      origSend(msg);
      applyClientMessageToView(observedRows, client.messages[client.messages.length - 1]);
    };

    const sql = 'SELECT id, customer, total FROM live_orders WHERE status = \'OPEN\'';
    const reg = await wiringA.liveQueryManager.registerLiveQuery(sql, client);

    // Commit Row 1 while delivery returns canonical DEFERRED (noHandler: false).
    const insertSql =
      'INSERT INTO live_orders (id, customer, status, total, secret_note) VALUES (?, ?, ?, ?, ?)';
    oracleDb.prepare(insertSql).run(1, 'Alice', 'OPEN', 100, 's1');
    applyCommitted(leaderB, {...committedQueryOf('def-1', insertSql), params: [1, 'Alice', 'OPEN', 100, 's1']});
    await new Promise((r) => setTimeout(r, 40));

    const diag = leaderB.getCDCSubscriptionDiagnostics();
    assert.equal(diag.subscriptions[0].lastDeliveredSequenceNumber, null,
      'producer must NOT advance lastDeliveredSequenceNumber past DEFERRED event');
    assert.equal(observedRows.size, 0, 'Row 1 not yet delivered while DEFERRED');

    // Restore delivery and commit Row 2; both Row 1 and Row 2 must arrive.
    deferEventDelivery = false;
    oracleDb.prepare(insertSql).run(2, 'Bob', 'OPEN', 200, 's2');
    applyCommitted(leaderB, {...committedQueryOf('def-2', insertSql), params: [2, 'Bob', 'OPEN', 200, 's2']});

    const recovered = await waitForMessageMatch(() => observedRows.size === 2);
    assert.ok(recovered, 'live query must recover Row 1 and deliver Row 2');
    const sortedObserved = Array.from(observedRows.values()).sort((a, b) => a.id - b.id);
    assert.deepEqual(sortedObserved, oracleDb.prepare(`${sql} ORDER BY id`).all());

    wiringA.liveQueryManager.unregisterLiveQuery(reg.queryId, client.id);
  });

  it('Schedule B: failed initial subscribe and failed failover rebind stay pending and recover', async () => {
    const capturedCdcDeliveries = [];
    routers = await createBridgedRouters(['node-a', 'node-b', 'node-c'], capturedCdcDeliveries);
    const routerA = routers.get('node-a');
    const routerB = routers.get('node-b');
    const routerC = routers.get('node-c');

    let failSubscribeForNode = 'node-b';
    const origDeliverA = routerA.deliver.bind(routerA);
    routerA.deliver = async (targetAddress, message, opts = {}) => {
      if (message?.type === 'LIVE_QUERY_CDC_SUBSCRIBE' &&
          failSubscribeForNode &&
          targetAddress.startsWith(`${failSubscribeForNode}/`)) {
        return buildDeliveryEnvelope({
          acknowledged: false,
          deferRetry: true,
          noHandler: false,
          retryAfterMs: 25,
          error: 'subscribe deferred',
        });
      }
      return origDeliverA(targetAddress, message, opts);
    };

    ({leader: leaderB} = await startLeader({
      tableName: 'live_orders',
      schema: TABLE_SCHEMA,
      nodeId: 'node-b',
      replicaId: 'p1',
      transport: routerB,
    }, 'p1'));
    ({leader: leaderC} = await startLeader({
      tableName: 'live_orders',
      schema: TABLE_SCHEMA,
      nodeId: 'node-c',
      replicaId: 'p1',
      transport: routerC,
    }, 'p1'));

    let currentPartitions = [{
      partition_id: 'p1',
      table_name: 'live_orders',
      partition_key_start: null,
      partition_key_end: null,
      partition_key_type: 'INTEGER',
      leader_node_id: 'node-b',
    }];
    let currentReplicas = [{partition_id: 'p1', node_id: 'node-b'}];
    const systemCache = createRemoteTopologyCache(
      TABLES_METADATA,
      () => currentPartitions,
      () => currentReplicas,
    );
    const parserEngine = new SQLQueryEngine();
    const sqlEngine = {
      callCount: 0,
      parse: (sql) => parserEngine.parse(sql),
      executeQuery: async (sql, params = []) => {
        sqlEngine.callCount += 1;
        const rows = oracleDb.prepare(sql).all(...params);
        return {rows, results: rows, count: rows.length};
      },
    };

    wiringA = createLiveQueryStartupWiring({
      nodeId: 'node-a',
      systemTableCache: systemCache,
      sqlQueryEngine: sqlEngine,
      partitionServicesProvider: () => new Map(),
      messageRouter: routerA,
    });

    const client = createMockClient('handshake-retry-client');
    const observedRows = new Map();
    const origSend = client.send;
    client.send = (msg) => {
      origSend(msg);
      applyClientMessageToView(observedRows, client.messages[client.messages.length - 1]);
    };

    const sql = 'SELECT id, customer, total FROM live_orders WHERE status = \'OPEN\'';
    const reg = await wiringA.liveQueryManager.registerLiveQuery(sql, client);
    const group = wiringA.liveQueryManager.findGroupByQueryId(reg.queryId);

    assert.equal(client.messages[0].type, 'snapshot', 'initial SQL snapshot succeeds');
    assert.equal(group.subscribedPartitions.has('p1'), false,
      'failed initial handshake must NOT mark partition subscribed');

    // Commit Row 1 while initial handshake is still failing, then clear fault.
    const insertSql =
      'INSERT INTO live_orders (id, customer, status, total, secret_note) VALUES (?, ?, ?, ?, ?)';
    oracleDb.prepare(insertSql).run(1, 'Alice', 'OPEN', 100, 's1');
    applyCommitted(leaderB, {...committedQueryOf('hb-1', insertSql), params: [1, 'Alice', 'OPEN', 100, 's1']});

    failSubscribeForNode = null;
    const initialRecovered = await waitForMessageMatch(
      () => group.subscribedPartitions.has('p1') && observedRows.size === 1,
    );
    assert.ok(initialRecovered, 'retained retry completes subscription and recovers Row 1');

    // Now failover to node-c while replacement subscribe handshake fails.
    failSubscribeForNode = 'node-c';
    currentPartitions = [{...currentPartitions[0], leader_node_id: 'node-c'}];
    currentReplicas = [{partition_id: 'p1', node_id: 'node-c'}];
    systemCache.emitCacheChange(TABLES.PARTITIONS, 'UPDATE', currentPartitions[0]);

    const failedRebindObserved = await waitForMessageMatch(
      () => leaderB.cdcSubscribers.size === 0 && !group.subscribedPartitions.has('p1'),
    );
    assert.ok(failedRebindObserved,
      'failed failover rebind unsubscribes node-b and leaves p1 unsubscribed');

    // Commit Row 2 on leaderC while replacement handshake is pending, then clear fault.
    oracleDb.prepare(insertSql).run(2, 'Bob', 'OPEN', 200, 's2');
    applyCommitted(leaderC, {...committedQueryOf('hb-2', insertSql), params: [2, 'Bob', 'OPEN', 200, 's2']});

    failSubscribeForNode = null;
    const failoverRecovered = await waitForMessageMatch(
      () => group.subscribedPartitions.has('p1') &&
        leaderC.cdcSubscribers.size === 1 &&
        observedRows.size === 2,
    );
    assert.ok(failoverRecovered,
      'retained failover entry completes replacement subscribe and recovers Row 2');
    const sortedObserved = Array.from(observedRows.values()).sort((a, b) => a.id - b.id);
    assert.deepEqual(sortedObserved, oracleDb.prepare(`${sql} ORDER BY id`).all());

    wiringA.liveQueryManager.unregisterLiveQuery(reg.queryId, client.id);
  });
});
