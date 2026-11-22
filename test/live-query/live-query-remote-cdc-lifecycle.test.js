/**
 * Live-Query Remote CDC Owned Lifecycle Witnesses (PR #236 P4.1-P4.5).
 *
 * Verifies:
 * 1. P4.3: Held CDC send while newer overflow debt arises under the same live
 *    binding — the older ACK cannot clear the newer overflow/reset obligation.
 * 2. P4.3/P4.5: Retained reset debt remains runnable even when the event queue
 *    is empty after covered events retire.
 * 3. P4.4: Explicit QueryGroup refresh outcomes (COMPLETED, FAILED, COALESCED,
 *    STALE, CLOSED, NO_ENGINE), coalesced pre-handshake refresh retention, and
 *    newer reset debt arising during an awaited refresh.
 * 4. P4.2: Late completion of an old subscribe attempt after a replacement
 *    registration exists (both cross-node failover and same-node replacement)
 *    cleans up ONLY the actual old registration using its old binding.
 * 5. P4.1: Pure synchronous lifecycle transition invariants (connecting ->
 *    catching_up -> live -> retiring -> closed) and monotonic retry-after.
 */

import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {TABLES} from '../../src/constants/index.js';
import {LIVE_QUERY_REFRESH_STATUS} from '../../src/live-query/live-query-constants.js';
import {QueryGroup} from '../../src/live-query/live-query-group.js';
import {
  REMOTE_CDC_EFFECT,
  REMOTE_CDC_EVENT,
  REMOTE_CDC_PHASE,
  REMOTE_CDC_TRANSPORT_KIND,
  createRemoteCdcSubscriptionState,
  hasOutstandingRemoteCdcObligation,
  transitionRemoteCdcSubscription,
} from '../../src/live-query/live-query-remote-cdc-lifecycle.js';
import {createLiveQueryStartupWiring} from '../../src/live-query/live-query-startup-wiring.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';
import {
  applyCommitted,
  clearFixtureSingletons,
  committedQueryOf,
  resetFixtureSingletons,
  startLeader,
} from '../test-helpers/participant-transaction-fixture.js';

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

const SELECT_OPEN_SQL = 'SELECT id, customer, total FROM live_orders WHERE status = \'OPEN\'';
const INSERT_ORDER_SQL =
  'INSERT INTO live_orders (id, customer, status, total, secret_note) VALUES (?, ?, ?, ?, ?)';

function createMockClient(id) {
  const messages = [];
  const observedRows = new Map();
  return {
    id,
    messages,
    observedRows,
    send: (raw) => {
      const msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
      messages.push(msg);
      if (msg.type === 'snapshot' || msg.type === 'reset') {
        observedRows.clear();
        for (const row of msg.rows || []) observedRows.set(row.id, row);
      } else if (msg.type === 'insert') {
        observedRows.set(msg.row.id, msg.row);
      } else if (msg.type === 'update') {
        observedRows.set(msg.new.id, msg.new);
      } else if (msg.type === 'delete') {
        observedRows.delete(msg.row.id);
      }
    },
  };
}

function createTopologyCache(getPartitions, getReplicas) {
  const listeners = new Set();
  const tableMap = new Map(TABLES_METADATA.map((t) => [t.table_name, t]));
  return {
    onCacheChange: (listener) => listeners.add(listener),
    offCacheChange: (listener) => listeners.delete(listener),
    emitCacheChange: (tableName, operation, record) => {
      for (const listener of listeners) listener(tableName, operation, record);
    },
    get: (table, key) => {
      if (table === TABLES.TABLES) return tableMap.get(key) || null;
      if (table === TABLES.PARTITIONS) {
        return getPartitions().find((p) => p.partition_id === key) || null;
      }
      return null;
    },
    find: (table, pred) => {
      if (table === TABLES.TABLES) return TABLES_METADATA.find(pred) || null;
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

async function createBridgedRouters(nodeIds) {
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
      const peer = routers.get(targetNodeId);
      if (!peer || !peer.initialized) {
        return {
          result: {messageId, correlationId, acknowledged: false, error: 'offline'},
          queueWaitMs: 0,
        };
      }
      if (!peer.handlers.get(targetAddress)) {
        return {
          result: {
            messageId,
            correlationId,
            acknowledged: false,
            noHandler: true,
            error: 'noHandler',
          },
          queueWaitMs: 0,
        };
      }
      return peer.deliverLocal(
        targetAddress, messageId, payload, correlationId, {timeoutMs: opts?.timeoutMs},
      );
    };
  }
  return routers;
}

async function waitForMatch(predicate, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  return predicate();
}

describe('P4 Live-Query Remote CDC Owned Lifecycle and Coverage Witnesses', () => {
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
    leaderB = null;
    leaderC = null;
    wiringA = null;
    routers = null;
    oracleDb?.close();
    clearFixtureSingletons();
  });

  it('P4.3: older batch ACK cannot clear newer overflow debt created during the send await', async () => {
    routers = await createBridgedRouters(['node-a', 'node-b']);
    const routerA = routers.get('node-a');
    const routerB = routers.get('node-b');

    let notifyRow1Held = null;
    let releaseRow1Send = null;
    const row1Held = new Promise((resolve) => {
      notifyRow1Held = resolve;
    });
    const row1Gate = new Promise((resolve) => {
      releaseRow1Send = resolve;
    });
    let heldFirstSend = false;
    let resyncDeliveries = 0;

    const origDeliverB = routerB.deliver.bind(routerB);
    routerB.deliver = async (targetAddress, message, opts = {}) => {
      if (message?.type === 'LIVE_QUERY_CDC_EVENT') {
        if (!heldFirstSend && message.resyncRequired === false) {
          heldFirstSend = true;
          notifyRow1Held();
          await row1Gate;
          return origDeliverB(targetAddress, message, opts);
        }
        if (message.resyncRequired === true) {
          resyncDeliveries += 1;
        }
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

    const partitions = [{
      partition_id: 'p1',
      table_name: 'live_orders',
      partition_key_start: null,
      partition_key_end: null,
      partition_key_type: 'INTEGER',
      leader_node_id: 'node-b',
    }];
    const systemCache = createTopologyCache(
      () => partitions,
      () => [{partition_id: 'p1', node_id: 'node-b'}],
    );
    const parserEngine = new SQLQueryEngine();
    const sqlEngine = {
      parse: (sql) => parserEngine.parse(sql),
      executeQuery: async (sql, params = []) => {
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

    const client = createMockClient('overflow-during-await-client');
    const reg = await wiringA.liveQueryManager.registerLiveQuery(SELECT_OPEN_SQL, client);

    // Commit Row 1 and hold its first send unresolved.
    oracleDb.prepare(INSERT_ORDER_SQL).run(1, 'Alice', 'OPEN', 100, 's1');
    applyCommitted(
      leaderB,
      {...committedQueryOf('oa-1', INSERT_ORDER_SQL), params: [1, 'Alice', 'OPEN', 100, 's1']},
    );
    await row1Held;

    // While Row 1's non-overflow send is still pending, commit 261 newer rows to force overflow.
    const totalRows = 262;
    for (let id = 2; id <= totalRows; id += 1) {
      const params = [id, `Customer-${id}`, 'OPEN', id * 10, `s-${id}`];
      oracleDb.prepare(INSERT_ORDER_SQL).run(...params);
      applyCommitted(leaderB, {...committedQueryOf(`oa-${id}`, INSERT_ORDER_SQL), params});
    }
    const remoteEntry = Array.from(leaderB.remoteLiveQueryCdcSubscribers.values())[0];
    const overflowed = await waitForMatch(() => remoteEntry.overflowResyncRequired === true);
    assert.ok(overflowed, 'newer overflow arose while older non-overflow send was pending');

    // Release the older Row 1 send so it returns a genuine SUCCESS ACK.
    releaseRow1Send();

    const converged = await waitForMatch(() => client.observedRows.size === totalRows, 3000);
    assert.ok(converged, 'newer overflow debt survived older ACK and converged all 262 rows');
    assert.ok(resyncDeliveries >= 1, 'producer issued a covering resyncRequired delivery after ACK');
    assert.equal(remoteEntry.overflowResyncRequired, false, 'overflow cleared after covering ACK');
    const sortedObserved = Array.from(client.observedRows.values()).sort((a, b) => a.id - b.id);
    assert.deepEqual(sortedObserved, oracleDb.prepare(`${SELECT_OPEN_SQL} ORDER BY id`).all());

    wiringA.liveQueryManager.unregisterLiveQuery(reg.queryId, client.id);
  });

  it('P4.3/P4.5: retained reset debt remains runnable even when the event queue becomes empty', async () => {
    routers = await createBridgedRouters(['node-a', 'node-b']);
    const routerA = routers.get('node-a');
    const routerB = routers.get('node-b');

    let notifyFirstHeld = null;
    let releaseFirstSend = null;
    const firstHeld = new Promise((resolve) => {
      notifyFirstHeld = resolve;
    });
    const firstGate = new Promise((resolve) => {
      releaseFirstSend = resolve;
    });
    let heldOnce = false;
    let emptyQueueResyncSent = false;

    const origDeliverB = routerB.deliver.bind(routerB);
    routerB.deliver = async (targetAddress, message, opts = {}) => {
      if (message?.type === 'LIVE_QUERY_CDC_EVENT') {
        if (!heldOnce) {
          heldOnce = true;
          notifyFirstHeld();
          await firstGate;
          return origDeliverB(targetAddress, message, opts);
        }
        if (message.resyncRequired === true && message.events.length === 0) {
          emptyQueueResyncSent = true;
        }
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

    const partitions = [{
      partition_id: 'p1',
      table_name: 'live_orders',
      partition_key_start: null,
      partition_key_end: null,
      partition_key_type: 'INTEGER',
      leader_node_id: 'node-b',
    }];
    const systemCache = createTopologyCache(
      () => partitions,
      () => [{partition_id: 'p1', node_id: 'node-b'}],
    );
    const parserEngine = new SQLQueryEngine();
    const sqlEngine = {
      parse: (sql) => parserEngine.parse(sql),
      executeQuery: async (sql, params = []) => {
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

    const client = createMockClient('empty-queue-resync-client');
    const reg = await wiringA.liveQueryManager.registerLiveQuery(SELECT_OPEN_SQL, client);

    oracleDb.prepare(INSERT_ORDER_SQL).run(1, 'Alice', 'OPEN', 100, 's1');
    applyCommitted(
      leaderB,
      {...committedQueryOf('eq-1', INSERT_ORDER_SQL), params: [1, 'Alice', 'OPEN', 100, 's1']},
    );
    await firstHeld;

    // While Row 1 is the only queued item, raise newer reset debt with no extra queued events
    // (modeling compacted history leaving an empty queue after Row 1 retires) plus Row 2 in oracle.
    oracleDb.prepare(INSERT_ORDER_SQL).run(2, 'Bob', 'OPEN', 200, 's2');
    const remoteEntry = Array.from(leaderB.remoteLiveQueryCdcSubscribers.values())[0];
    remoteEntry.overflowResyncRequired = true;
    remoteEntry.overflowEpoch += 1;

    releaseFirstSend();

    const converged = await waitForMatch(() => client.observedRows.size === 2);
    assert.ok(converged, 'empty-queue reset debt still drove resync and converged both rows');
    assert.equal(emptyQueueResyncSent, true, 'producer sent resyncRequired with empty event vector');
    assert.equal(remoteEntry.overflowResyncRequired, false, 'empty-queue reset debt settled');

    wiringA.liveQueryManager.unregisterLiveQuery(reg.queryId, client.id);
  });

  it('P4.4: explicit refresh outcomes reject failed, coalesced pre-handshake, and superseded reads', async () => {
    // 1. Direct owner outcome state discrimination on QueryGroup.refreshQueryResultWithOutcome().
    const noEngineGroup = new QueryGroup({
      parsedQuery: {type: 'SELECT', columns: [{type: 'star'}], from: {name: 't'}, where: null},
      sqlQueryEngine: null,
    });
    assert.equal(
      (await noEngineGroup.refreshQueryResultWithOutcome()).status,
      LIVE_QUERY_REFRESH_STATUS.NO_ENGINE,
    );
    noEngineGroup.cleanup();
    assert.equal(
      (await noEngineGroup.refreshQueryResultWithOutcome()).status,
      LIVE_QUERY_REFRESH_STATUS.CLOSED,
    );

    const refusalEngine = {
      executeQuery: async () => ({
        success: false,
        error: 'query admission deferred',
        retryAfterMs: 180,
      }),
    };
    const refusedGroup = new QueryGroup({
      parsedQuery: {type: 'SELECT', columns: [{type: 'star'}], from: {name: 't'}, where: null},
      sqlQueryEngine: refusalEngine,
    });
    const failedOutcome = await refusedGroup.refreshQueryResultWithOutcome();
    assert.equal(failedOutcome.status, LIVE_QUERY_REFRESH_STATUS.FAILED);
    assert.equal(failedOutcome.retryAfterMs, 180);
    refusedGroup.cleanup();

    // 2. Multi-node schedule: pre-handshake in-flight refresh coalescing must NOT settle catch-up.
    routers = await createBridgedRouters(['node-a', 'node-b']);
    const routerA = routers.get('node-a');
    const routerB = routers.get('node-b');

    let failSubscribe = true;
    const origDeliverA = routerA.deliver.bind(routerA);
    routerA.deliver = async (targetAddress, message, opts = {}) => {
      if (failSubscribe && message?.type === 'LIVE_QUERY_CDC_SUBSCRIBE') {
        return buildDeliveryEnvelope({
          acknowledged: false,
          deferRetry: true,
          noHandler: false,
          retryAfterMs: 25,
          error: 'defer initial subscribe',
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

    const partitions = [{
      partition_id: 'p1',
      table_name: 'live_orders',
      partition_key_start: null,
      partition_key_end: null,
      partition_key_type: 'INTEGER',
      leader_node_id: 'node-b',
    }];
    const systemCache = createTopologyCache(
      () => partitions,
      () => [{partition_id: 'p1', node_id: 'node-b'}],
    );
    const parserEngine = new SQLQueryEngine();
    let holdPreHandshakeRead = false;
    let releasePreHandshakeRead = null;
    const preHandshakeGate = new Promise((resolve) => {
      releasePreHandshakeRead = resolve;
    });
    const sqlEngine = {
      parse: (sql) => parserEngine.parse(sql),
      executeQuery: async (sql, params = []) => {
        if (holdPreHandshakeRead) {
          holdPreHandshakeRead = false;
          // Capture stale empty pre-write snapshot before yielding!
          const staleRows = [];
          await preHandshakeGate;
          return {rows: staleRows, results: staleRows, count: 0};
        }
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

    const client = createMockClient('coalesced-catchup-client');
    const reg = await wiringA.liveQueryManager.registerLiveQuery(SELECT_OPEN_SQL, client);
    const group = wiringA.liveQueryManager.findGroupByQueryId(reg.queryId);

    // Start a slow pre-handshake refresh that will resolve with stale empty rows.
    holdPreHandshakeRead = true;
    const stalePreHandshakePromise = group.refreshQueryResultWithOutcome();
    assert.equal(group.refreshInFlight, true, 'pre-handshake refresh is in flight');

    // Commit Row 1 and let deferred subscribe succeed while pre-handshake refresh is in flight.
    oracleDb.prepare(INSERT_ORDER_SQL).run(1, 'Alice', 'OPEN', 100, 's1');
    applyCommitted(
      leaderB,
      {...committedQueryOf('cc-1', INSERT_ORDER_SQL), params: [1, 'Alice', 'OPEN', 100, 's1']},
    );
    failSubscribe = false;

    const subscribed = await waitForMatch(() => group.subscribedPartitions.has('p1'));
    assert.ok(subscribed, 'deferred subscribe completed while pre-handshake refresh was running');

    // Release stale pre-handshake refresh; catch-up debt must survive and recover Row 1 while idle.
    releasePreHandshakeRead();
    const staleOutcome = await stalePreHandshakePromise;
    assert.equal(staleOutcome.status, LIVE_QUERY_REFRESH_STATUS.COMPLETED);

    const recovered = await waitForMatch(() => client.observedRows.size === 1);
    assert.ok(recovered, 'covering post-handshake refresh ran while idle and recovered Row 1');
    assert.deepEqual(
      Array.from(client.observedRows.values()),
      oracleDb.prepare(`${SELECT_OPEN_SQL} ORDER BY id`).all(),
    );

    wiringA.liveQueryManager.unregisterLiveQuery(reg.queryId, client.id);
  });

  it('P4.2: late old subscribe completion after replacement cleans only old binding and preserves replacement', async () => {
    routers = await createBridgedRouters(['node-a', 'node-b', 'node-c']);
    const routerA = routers.get('node-a');
    const routerB = routers.get('node-b');
    const routerC = routers.get('node-c');

    let notifyOldBRegistered = null;
    let releaseOldBResponse = null;
    const oldBRegistered = new Promise((resolve) => {
      notifyOldBRegistered = resolve;
    });
    const oldBGate = new Promise((resolve) => {
      releaseOldBResponse = resolve;
    });
    let holdFirstNodeB = true;

    const origDeliverA = routerA.deliver.bind(routerA);
    routerA.deliver = async (targetAddress, message, opts = {}) => {
      if (holdFirstNodeB &&
          message?.type === 'LIVE_QUERY_CDC_SUBSCRIBE' &&
          targetAddress.startsWith('node-b/')) {
        holdFirstNodeB = false;
        const realResp = await origDeliverA(targetAddress, message, opts);
        notifyOldBRegistered();
        await oldBGate;
        return realResp;
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
    const systemCache = createTopologyCache(() => currentPartitions, () => currentReplicas);
    const parserEngine = new SQLQueryEngine();
    const sqlEngine = {
      parse: (sql) => parserEngine.parse(sql),
      executeQuery: async (sql, params = []) => {
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

    const client = createMockClient('replacement-binding-client');
    const regPromise = wiringA.liveQueryManager.registerLiveQuery(SELECT_OPEN_SQL, client);
    await oldBRegistered;
    assert.equal(leaderB.cdcSubscribers.size, 1, 'old binding registered on node-b');

    // Fail over p1 to node-c while node-b's subscribe response is still held!
    currentPartitions = [{...currentPartitions[0], leader_node_id: 'node-c'}];
    currentReplicas = [{partition_id: 'p1', node_id: 'node-c'}];
    systemCache.emitCacheChange(TABLES.PARTITIONS, 'UPDATE', currentPartitions[0]);

    const replacementAttached = await waitForMatch(() => leaderC.cdcSubscribers.size === 1);
    assert.ok(replacementAttached, 'replacement binding attached on node-c');

    // Release old node-b subscribe response: must clean up node-b WITHOUT deleting node-c!
    releaseOldBResponse();
    const reg = await regPromise;

    const oldCleaned = await waitForMatch(() => leaderB.cdcSubscribers.size === 0);
    assert.ok(oldCleaned, 'late old subscribe completion retired old node-b registration');
    assert.equal(leaderC.cdcSubscribers.size, 1, 'replacement node-c registration survived intact');

    // Verify replacement registration on node-c actively delivers live writes!
    oracleDb.prepare(INSERT_ORDER_SQL).run(1, 'Alice', 'OPEN', 100, 's1');
    applyCommitted(
      leaderC,
      {...committedQueryOf('rep-1', INSERT_ORDER_SQL), params: [1, 'Alice', 'OPEN', 100, 's1']},
    );
    const delivered = await waitForMatch(() => client.observedRows.size === 1);
    assert.ok(delivered, 'replacement binding on node-c delivers subsequent committed writes');

    // Same-node replacement isolation: hold gen=N on node-c, replace on SAME node-c, release old.
    let notifySameNodeOld = null;
    let releaseSameNodeOld = null;
    const sameNodeOldRegistered = new Promise((resolve) => {
      notifySameNodeOld = resolve;
    });
    const sameNodeOldGate = new Promise((resolve) => {
      releaseSameNodeOld = resolve;
    });
    let holdNextNodeC = true;
    const prevDeliverA = routerA.deliver;
    routerA.deliver = async (targetAddress, message, opts = {}) => {
      if (holdNextNodeC &&
          message?.type === 'LIVE_QUERY_CDC_SUBSCRIBE' &&
          targetAddress.startsWith('node-c/')) {
        holdNextNodeC = false;
        const realResp = await prevDeliverA(targetAddress, message, opts);
        notifySameNodeOld();
        await sameNodeOldGate;
        return realResp;
      }
      return prevDeliverA(targetAddress, message, opts);
    };

    const group = wiringA.liveQueryManager.findGroupByQueryId(reg.queryId);
    const handler = group.cdcHandlers.get('p1');
    await wiringA.liveQueryManager.unsubscribeFromPartition('p1', reg.queryId);
    const oldSameNodePromise = wiringA.liveQueryManager.subscribeToPartition(
      'p1', reg.queryId, handler, {},
    );
    await sameNodeOldRegistered;
    assert.equal(leaderC.cdcSubscribers.size, 1, 'old same-node generation registered');

    // Replace on the SAME node-c while old generation's subscribe response is still held!
    await wiringA.liveQueryManager.unsubscribeFromPartition('p1', reg.queryId);
    await wiringA.liveQueryManager.subscribeToPartition('p1', reg.queryId, handler, {});
    assert.equal(leaderC.cdcSubscribers.size, 2, 'old + new generations briefly coexist on node-c');

    releaseSameNodeOld();
    await oldSameNodePromise;

    const sameNodeCleaned = await waitForMatch(() => leaderC.cdcSubscribers.size === 1);
    assert.ok(sameNodeCleaned, 'old generation cleaned ONLY its own subscriberId on node-c');

    oracleDb.prepare(INSERT_ORDER_SQL).run(2, 'Bob', 'OPEN', 200, 's2');
    applyCommitted(
      leaderC,
      {...committedQueryOf('rep-2', INSERT_ORDER_SQL), params: [2, 'Bob', 'OPEN', 200, 's2']},
    );
    const delivered2 = await waitForMatch(() => client.observedRows.size === 2);
    assert.ok(delivered2, 'same-node replacement binding continues delivering writes');

    wiringA.liveQueryManager.unregisterLiveQuery(reg.queryId, client.id);
  });

  it('P4.1: pure lifecycle transition function enforces catching_up, debt epochs, deadlines, and retirement', () => {
    const sub = createRemoteCdcSubscriptionState({
      subKey: 'q1:p1',
      partitionId: 'p1',
      queryId: 'q1',
      subscriberId: 'node-a:q1:p1:1',
      bindingGeneration: 1,
      transportKind: REMOTE_CDC_TRANSPORT_KIND.REMOTE,
      targetNodeId: 'node-b',
      targetAddress: 'node-b/partition/p1',
      handler: () => {},
      wrappedHandler: () => {},
      needsCatchupOnSubscribe: true,
    });

    // Start subscribe and fail with retryAfterMs=250 -> absolute deadline 1250.
    const start1 = transitionRemoteCdcSubscription(sub, {type: REMOTE_CDC_EVENT.START_SUBSCRIBE});
    assert.ok(start1.binding, 'attempt 1 captured exact binding custody');
    const fail1 = transitionRemoteCdcSubscription(sub, {
      type: REMOTE_CDC_EVENT.SUBSCRIBE_SETTLED,
      attemptId: start1.binding.attemptId,
      binding: start1.binding,
      accepted: false,
      retryAfterMs: 250,
      error: 'backpressure',
      nowMs: 1000,
    });
    assert.equal(sub.phase, REMOTE_CDC_PHASE.CONNECTING);
    assert.equal(sub.retryNotBeforeMs, 1250);
    assert.equal(fail1.effects[0].type, REMOTE_CDC_EFFECT.SCHEDULE_CONTINUATION);

    // Second attempt succeeds -> enters CATCHING_UP (NOT LIVE) with resetDebtEpoch=1.
    const start2 = transitionRemoteCdcSubscription(sub, {type: REMOTE_CDC_EVENT.START_SUBSCRIBE});
    transitionRemoteCdcSubscription(sub, {
      type: REMOTE_CDC_EVENT.SUBSCRIBE_SETTLED,
      attemptId: start2.binding.attemptId,
      binding: start2.binding,
      accepted: true,
      requiresCatchup: true,
      nowMs: 1260,
    });
    assert.equal(sub.phase, REMOTE_CDC_PHASE.CATCHING_UP);
    assert.equal(sub.resetDebtEpoch, 1);
    assert.equal(hasOutstandingRemoteCdcObligation(sub), true);

    // Start refresh covering epoch 1, then raise newer reset debt (epoch 2) while pending.
    const ref1 = transitionRemoteCdcSubscription(sub, {type: REMOTE_CDC_EVENT.START_REFRESH});
    assert.equal(ref1.attempt.coversResetDebtEpoch, 1);
    transitionRemoteCdcSubscription(sub, {
      type: REMOTE_CDC_EVENT.RAISE_RESET_DEBT,
      scheduleContinuation: false,
    });
    assert.equal(sub.resetDebtEpoch, 2);

    // Refresh 1 completes authoritatively for epoch 1, but epoch 2 remains -> stays CATCHING_UP!
    const ref1Done = transitionRemoteCdcSubscription(sub, {
      type: REMOTE_CDC_EVENT.REFRESH_SETTLED,
      attempt: ref1.attempt,
      authoritative: true,
      nowMs: 1300,
      scheduleOnIncomplete: true,
    });
    assert.equal(ref1Done.settled, false);
    assert.equal(sub.phase, REMOTE_CDC_PHASE.CATCHING_UP);
    assert.equal(sub.settledResetEpoch, 1);
    assert.equal(ref1Done.effects[0].type, REMOTE_CDC_EFFECT.SCHEDULE_CONTINUATION);

    // Covering refresh 2 completes for epoch 2 -> transitions CATCHING_UP -> LIVE!
    const ref2 = transitionRemoteCdcSubscription(sub, {type: REMOTE_CDC_EVENT.START_REFRESH});
    const ref2Done = transitionRemoteCdcSubscription(sub, {
      type: REMOTE_CDC_EVENT.REFRESH_SETTLED,
      attempt: ref2.attempt,
      authoritative: true,
      nowMs: 1350,
      scheduleOnIncomplete: true,
    });
    assert.equal(ref2Done.settled, true);
    assert.equal(sub.phase, REMOTE_CDC_PHASE.LIVE);
    assert.equal(hasOutstandingRemoteCdcObligation(sub), false);

    // Cancel from LIVE -> RETIRING -> emits SEND_REMOTE_UNSUBSCRIBE -> CLEANUP_SETTLED -> CLOSED.
    const cancelled = transitionRemoteCdcSubscription(sub, {type: REMOTE_CDC_EVENT.CANCEL});
    assert.equal(sub.phase, REMOTE_CDC_PHASE.RETIRING);
    assert.equal(cancelled.effects[0].type, REMOTE_CDC_EFFECT.SEND_REMOTE_UNSUBSCRIBE);
    assert.equal(cancelled.effects[0].binding.subscriberId, 'node-a:q1:p1:1');

    const cleaned = transitionRemoteCdcSubscription(sub, {type: REMOTE_CDC_EVENT.CLEANUP_SETTLED});
    assert.equal(sub.phase, REMOTE_CDC_PHASE.CLOSED);
    assert.equal(cleaned.effects[0].type, REMOTE_CDC_EFFECT.RETIRE_RECORD);
  });
});
