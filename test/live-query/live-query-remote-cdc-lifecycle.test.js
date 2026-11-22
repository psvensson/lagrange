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

  async function setupTwoNodeWiring({
    routerA,
    routerB,
    executeQuery,
    leaderNodes = ['node-b'],
  }) {
    ({leader: leaderB} = await startLeader({
      tableName: 'live_orders',
      schema: TABLE_SCHEMA,
      nodeId: 'node-b',
      replicaId: 'p1',
      transport: routerB,
    }, 'p1'));
    if (leaderNodes.includes('node-c')) {
      ({leader: leaderC} = await startLeader({
        tableName: 'live_orders',
        schema: TABLE_SCHEMA,
        nodeId: 'node-c',
        replicaId: 'p1',
        transport: routers.get('node-c'),
      }, 'p1'));
    }
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
      callCount: 0,
      parse: (sql) => parserEngine.parse(sql),
      executeQuery: async (sql, params = []) => {
        sqlEngine.callCount += 1;
        if (executeQuery) return executeQuery(sql, params, oracleDb);
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
    const switchLeader = (nextLeaderId) => {
      currentPartitions = [{...currentPartitions[0], leader_node_id: nextLeaderId}];
      currentReplicas = [{partition_id: 'p1', node_id: nextLeaderId}];
      systemCache.emitCacheChange(TABLES.PARTITIONS, 'UPDATE', currentPartitions[0]);
    };
    return {systemCache, sqlEngine, switchLeader};
  }

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

    await setupTwoNodeWiring({routerA, routerB});

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

    await setupTwoNodeWiring({routerA, routerB});

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

    let holdPreHandshakeRead = false;
    let releasePreHandshakeRead = null;
    const preHandshakeGate = new Promise((resolve) => {
      releasePreHandshakeRead = resolve;
    });
    await setupTwoNodeWiring({
      routerA,
      routerB,
      executeQuery: async (sql, params, db) => {
        if (holdPreHandshakeRead) {
          holdPreHandshakeRead = false;
          // Capture stale empty pre-write snapshot before yielding!
          const staleRows = [];
          await preHandshakeGate;
          return {rows: staleRows, results: staleRows, count: 0};
        }
        const rows = db.prepare(sql).all(...params);
        return {rows, results: rows, count: rows.length};
      },
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

    const {switchLeader} = await setupTwoNodeWiring({
      routerA,
      routerB,
      leaderNodes: ['node-b', 'node-c'],
    });

    const client = createMockClient('replacement-binding-client');
    const regPromise = wiringA.liveQueryManager.registerLiveQuery(SELECT_OPEN_SQL, client);
    await oldBRegistered;
    assert.equal(leaderB.cdcSubscribers.size, 1, 'old binding registered on node-b');

    // Fail over p1 to node-c while node-b's subscribe response is still held!
    switchLeader('node-c');

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

  it('P4.2: failover during an awaited failover subscribe preserves latest subscribedPartitions and retires old targets', async () => {
    routers = await createBridgedRouters(['node-a', 'node-b', 'node-c', 'node-d']);
    const routerA = routers.get('node-a');
    const routerB = routers.get('node-b');
    const routerD = routers.get('node-d');

    let notifyNodeCRegistered = null;
    let releaseNodeCResponse = null;
    const nodeCRegistered = new Promise((resolve) => {
      notifyNodeCRegistered = resolve;
    });
    const nodeCGate = new Promise((resolve) => {
      releaseNodeCResponse = resolve;
    });
    let holdNodeCOnce = true;

    const origDeliverA = routerA.deliver.bind(routerA);
    routerA.deliver = async (targetAddress, message, opts = {}) => {
      if (holdNodeCOnce &&
          message?.type === 'LIVE_QUERY_CDC_SUBSCRIBE' &&
          targetAddress.startsWith('node-c/')) {
        holdNodeCOnce = false;
        const realResp = await origDeliverA(targetAddress, message, opts);
        notifyNodeCRegistered();
        await nodeCGate;
        return realResp;
      }
      return origDeliverA(targetAddress, message, opts);
    };

    const {switchLeader} = await setupTwoNodeWiring({
      routerA,
      routerB,
      leaderNodes: ['node-b', 'node-c'],
    });
    const {leader: leaderD} = await startLeader({
      tableName: 'live_orders',
      schema: TABLE_SCHEMA,
      nodeId: 'node-d',
      replicaId: 'p1',
      transport: routerD,
    }, 'p1');

    try {
      const client = createMockClient('nested-failover-client');
      const reg = await wiringA.liveQueryManager.registerLiveQuery(SELECT_OPEN_SQL, client);
      const group = wiringA.liveQueryManager.findGroupByQueryId(reg.queryId);
      assert.equal(leaderB.cdcSubscribers.size, 1, 'initial target node-b subscribed');
      assert.equal(group.subscribedPartitions.has('p1'), true);

      // Failover 1 (node-b -> node-c): hold node-c subscribe response after remote registration.
      switchLeader('node-c');
      await nodeCRegistered;
      assert.equal(leaderB.cdcSubscribers.size, 0, 'node-b retired on failover 1');
      assert.equal(leaderC.cdcSubscribers.size, 1, 'node-c registered during awaited failover 1');

      // Failover 2 (node-c -> node-d) completes while failover 1's node-c response is still held!
      switchLeader('node-d');

      const attachedD = await waitForMatch(
        () => leaderD.cdcSubscribers.size === 1 && group.subscribedPartitions.has('p1'),
      );
      assert.ok(attachedD, 'failover 2 subscribed latest target node-d');

      // Release stale failover 1 response from node-c: must NOT demote group.subscribedPartitions!
      releaseNodeCResponse();
      const retiredC = await waitForMatch(() => leaderC.cdcSubscribers.size === 0);
      assert.ok(retiredC, 'stale node-c failover registration retired cleanly');
      await new Promise((resolve) => setTimeout(resolve, 40));

      assert.equal(
        group.subscribedPartitions.has('p1'),
        true,
        'stale failover 1 completion must NOT demote latest target p1 from subscribedPartitions',
      );
      assert.equal(
        group.pendingSubscriptions.has('p1'),
        false,
        'latest live target p1 must NOT be demoted to pendingSubscriptions',
      );
      assert.equal(leaderB.cdcSubscribers.size, 0, 'node-b remains retired');
      assert.equal(leaderC.cdcSubscribers.size, 0, 'node-c remains retired');
      assert.equal(leaderD.cdcSubscribers.size, 1, 'latest target node-d remains subscribed');

      // Verify latest target node-d continues delivering live writes.
      oracleDb.prepare(INSERT_ORDER_SQL).run(1, 'Diana', 'OPEN', 500, 's1');
      applyCommitted(
        leaderD,
        {...committedQueryOf('nf-1', INSERT_ORDER_SQL), params: [1, 'Diana', 'OPEN', 500, 's1']},
      );
      const delivered = await waitForMatch(() => client.observedRows.size === 1);
      assert.ok(delivered, 'latest target node-d delivers live committed write');
      assert.equal(client.observedRows.get(1).customer, 'Diana');

      wiringA.liveQueryManager.unregisterLiveQuery(reg.queryId, client.id);
    } finally {
      await leaderD.shutdown();
    }
  });

  it('P4.4: newer overflow/reset debt arriving during an awaited catch-up refresh survives stale epoch-1 completion and converges while idle', async () => {
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

    let deferEventDelivery = false;
    let resyncRefusedDuringHeldRefresh = false;
    let resyncAcceptedAfterHeldRefresh = false;
    const origDeliverB = routerB.deliver.bind(routerB);
    routerB.deliver = async (targetAddress, message, opts = {}) => {
      if (message?.type === 'LIVE_QUERY_CDC_EVENT') {
        if (deferEventDelivery) {
          return buildDeliveryEnvelope({
            acknowledged: false,
            deferRetry: true,
            noHandler: false,
            retryAfterMs: 25,
            error: 'defer CDC to build overflow',
          });
        }
        const env = await origDeliverB(targetAddress, message, opts);
        if (message.resyncRequired === true) {
          if (env?.answer?.success === false) {
            resyncRefusedDuringHeldRefresh = true;
          } else if (env?.answer?.success === true) {
            resyncAcceptedAfterHeldRefresh = true;
          }
        }
        return env;
      }
      return origDeliverB(targetAddress, message, opts);
    };

    let holdEpoch1CatchupRead = false;
    let epoch1ReadStarted = false;
    let releaseEpoch1Read = null;
    const epoch1ReadGate = new Promise((resolve) => {
      releaseEpoch1Read = resolve;
    });
    const {sqlEngine} = await setupTwoNodeWiring({
      routerA,
      routerB,
      executeQuery: async (sql, params, db) => {
        if (holdEpoch1CatchupRead) {
          holdEpoch1CatchupRead = false;
          // Snapshot ONLY pre-overflow Row 1 before yielding.
          const staleEpoch1Rows = db.prepare(sql).all(...params);
          epoch1ReadStarted = true;
          await epoch1ReadGate;
          return {rows: staleEpoch1Rows, results: staleEpoch1Rows, count: staleEpoch1Rows.length};
        }
        const rows = db.prepare(sql).all(...params);
        return {rows, results: rows, count: rows.length};
      },
    });

    const client = createMockClient('held-refresh-overflow-client');
    const reg = await wiringA.liveQueryManager.registerLiveQuery(SELECT_OPEN_SQL, client);
    assert.deepEqual(client.messages[0].rows, [], 'initial snapshot empty while subscribe deferred');

    // Commit Row 1, hold the post-handshake epoch-1 catch-up read, and let subscribe succeed.
    oracleDb.prepare(INSERT_ORDER_SQL).run(1, 'Alice', 'OPEN', 100, 's1');
    applyCommitted(
      leaderB,
      {...committedQueryOf('hr-1', INSERT_ORDER_SQL), params: [1, 'Alice', 'OPEN', 100, 's1']},
    );
    holdEpoch1CatchupRead = true;
    failSubscribe = false;

    const epoch1Held = await waitForMatch(() => epoch1ReadStarted);
    assert.ok(epoch1Held, 'epoch-1 catch-up refresh is held in flight with Row 1 only');

    // While epoch-1 catch-up refresh is STILL held, trigger overflow (>256 rows) on leaderB
    // and let the resyncRequired delivery reach node-a while epoch-1 refresh is running!
    deferEventDelivery = true;
    const totalRows = 262;
    for (let id = 2; id <= totalRows; id += 1) {
      const params = [id, `Customer-${id}`, 'OPEN', id * 10, `s-${id}`];
      oracleDb.prepare(INSERT_ORDER_SQL).run(...params);
      applyCommitted(leaderB, {...committedQueryOf(`hr-${id}`, INSERT_ORDER_SQL), params});
    }
    const remoteEntry = Array.from(leaderB.remoteLiveQueryCdcSubscribers.values())[0];
    const overflowed = await waitForMatch(() => remoteEntry.overflowResyncRequired === true);
    assert.ok(overflowed, 'overflowResyncRequired raised while epoch-1 catch-up refresh is held');

    deferEventDelivery = false;
    const refusedDuringHeld = await waitForMatch(() => resyncRefusedDuringHeldRefresh);
    assert.ok(
      refusedDuringHeld,
      'receiver refused resyncRequired settlement while epoch-1 refresh was in flight',
    );
    assert.equal(
      remoteEntry.overflowResyncRequired,
      true,
      'producer retained overflowResyncRequired while epoch-1 refresh remained held',
    );

    // Release the stale epoch-1 catch-up read (returns ONLY Row 1): newer epoch-2 debt must
    // survive and converge to all 262 rows while idle with ZERO further writes!
    releaseEpoch1Read();

    const converged = await waitForMatch(
      () => client.observedRows.size === totalRows &&
        resyncAcceptedAfterHeldRefresh &&
        remoteEntry.overflowResyncRequired === false,
      3000,
    );
    assert.ok(converged, 'newer epoch-2 overflow debt survived stale epoch-1 completion while idle');
    const sortedObserved = Array.from(client.observedRows.values()).sort((a, b) => a.id - b.id);
    assert.deepEqual(sortedObserved, oracleDb.prepare(`${SELECT_OPEN_SQL} ORDER BY id`).all());

    const settledCalls = sqlEngine.callCount;
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(sqlEngine.callCount, settledCalls, 'zero idle polling after epoch-2 settles');

    wiringA.liveQueryManager.unregisterLiveQuery(reg.queryId, client.id);
  });

  it('Finding 3B: older held catch-up snapshot cannot erase already-acknowledged ordinary CDC Row 2 while idle', async () => {
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

    let holdCatchupSnapshot = false;
    let catchupSnapshotHeld = false;
    let releaseCatchupSnapshot = null;
    const catchupSnapshotGate = new Promise((resolve) => {
      releaseCatchupSnapshot = resolve;
    });
    const {sqlEngine} = await setupTwoNodeWiring({
      routerA,
      routerB,
      executeQuery: async (sql, params, db) => {
        if (holdCatchupSnapshot) {
          holdCatchupSnapshot = false;
          const staleRows = db.prepare(sql).all(...params);
          catchupSnapshotHeld = true;
          await catchupSnapshotGate;
          return {rows: staleRows, results: staleRows, count: staleRows.length};
        }
        const rows = db.prepare(sql).all(...params);
        return {rows, results: rows, count: rows.length};
      },
    });

    const client = createMockClient('held-snapshot-ordinary-cdc-client');
    const reg = await wiringA.liveQueryManager.registerLiveQuery(SELECT_OPEN_SQL, client);
    const group = wiringA.liveQueryManager.findGroupByQueryId(reg.queryId);
    assert.deepEqual(client.messages[0].rows, [], 'initial snapshot empty while subscribe deferred');

    // 1-2. Commit Row 1, let subscribe succeed, and hold catch-up snapshot containing ONLY Row 1.
    oracleDb.prepare(INSERT_ORDER_SQL).run(1, 'Alice', 'OPEN', 100, 's1');
    applyCommitted(
      leaderB,
      {...committedQueryOf('b3-1', INSERT_ORDER_SQL), params: [1, 'Alice', 'OPEN', 100, 's1']},
    );
    holdCatchupSnapshot = true;
    failSubscribe = false;

    const held = await waitForMatch(() => catchupSnapshotHeld && group.refreshInFlight);
    assert.ok(held, 'catch-up refresh captured Row 1 and is held before applying');
    const frontierBeforeRow2 = group.partitionFrontiers.get('p1') ?? 0;

    // 3-4. Commit and deliver ordinary Row 2 while catch-up refresh remains held.
    oracleDb.prepare(INSERT_ORDER_SQL).run(2, 'Bob', 'OPEN', 200, 's2');
    applyCommitted(
      leaderB,
      {...committedQueryOf('b3-2', INSERT_ORDER_SQL), params: [2, 'Bob', 'OPEN', 200, 's2']},
    );
    const row2Acked = await waitForMatch(() => {
      const diag = leaderB.getCDCSubscriptionDiagnostics().subscriptions[0];
      return client.observedRows.has(2) &&
        Number.isFinite(diag?.lastDeliveredSequenceNumber) &&
        diag.lastDeliveredSequenceNumber >= 1 &&
        (group.partitionFrontiers.get('p1') ?? 0) > frontierBeforeRow2;
    });
    assert.ok(row2Acked, 'ordinary CDC Row 2 delivered, acknowledged, and advanced frontier');
    const remoteEntry = Array.from(leaderB.remoteLiveQueryCdcSubscribers.values())[0];
    assert.equal(remoteEntry.overflowResyncRequired, false, 'Row 2 was ordinary CDC, not overflow');
    const frontierAfterRow2 = group.partitionFrontiers.get('p1');

    // 5-6. Release older held snapshot (Row 1 only) and leave the system idle.
    releaseCatchupSnapshot();
    const converged = await waitForMatch(
      () => !group.refreshInFlight && client.observedRows.size === 2 && group.resultSet.size === 2,
      1200,
    );
    assert.ok(
      converged,
      'older held catch-up snapshot must not erase already-acknowledged ordinary CDC Row 2 while idle',
    );
    const expectedRows = oracleDb.prepare(`${SELECT_OPEN_SQL} ORDER BY id`).all();
    const observedSorted = Array.from(client.observedRows.values()).sort((a, b) => a.id - b.id);
    assert.deepEqual(observedSorted, expectedRows, 'client-visible rows converge to {Row 1, Row 2}');
    const resetMessages = client.messages.filter((m) => m.type === 'reset');
    assert.ok(resetMessages.length >= 1, 'covering reset snapshot broadcast to client');
    const latestResetRows = [...resetMessages.at(-1).rows].sort((a, b) => a.id - b.id);
    assert.deepEqual(latestResetRows, expectedRows, 'latest client reset contains {Row 1, Row 2}');
    assert.deepEqual(
      Array.from(group.resultSet.keys()).sort((a, b) => a - b),
      [1, 2],
      'stored group.resultSet preserves both Row 1 and Row 2',
    );
    assert.equal(
      group.partitionFrontiers.get('p1'),
      frontierAfterRow2,
      'partition frontier remains aligned at Row 2',
    );

    const settledCalls = sqlEngine.callCount;
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(sqlEngine.callCount, settledCalls, 'zero idle polling after convergence');

    wiringA.liveQueryManager.unregisterLiveQuery(reg.queryId, client.id);
  });

  it('Finding 3F-1: uncertain subscribe failure retains cleanup custody so cancel before retry unsubscribes remote partition', async () => {
    routers = await createBridgedRouters(['node-a', 'node-b']);
    const routerA = routers.get('node-a');
    const routerB = routers.get('node-b');

    let loseFirstSubscribeReply = true;
    let unsubscribeDeliveries = 0;
    const origDeliverA = routerA.deliver.bind(routerA);
    routerA.deliver = async (targetAddress, message, opts = {}) => {
      if (message?.type === 'LIVE_QUERY_CDC_UNSUBSCRIBE') {
        unsubscribeDeliveries += 1;
        return origDeliverA(targetAddress, message, opts);
      }
      if (loseFirstSubscribeReply && message?.type === 'LIVE_QUERY_CDC_SUBSCRIBE') {
        loseFirstSubscribeReply = false;
        await origDeliverA(targetAddress, message, opts);
        throw Object.assign(new Error('subscribe response lost'), {retryAfterMs: 400});
      }
      return origDeliverA(targetAddress, message, opts);
    };

    await setupTwoNodeWiring({routerA, routerB});

    const client = createMockClient('uncertain-subscribe-cancel-client');
    const reg = await wiringA.liveQueryManager.registerLiveQuery(SELECT_OPEN_SQL, client);
    const group = wiringA.liveQueryManager.findGroupByQueryId(reg.queryId);

    assert.equal(group.subscribedPartitions.has('p1'), false, 'client remains CONNECTING after lost reply');
    assert.equal(leaderB.cdcSubscribers.size, 1, 'remote partition actually registered the subscriber');
    assert.equal(leaderB.remoteLiveQueryCdcSubscribers.size, 1);

    // Cancel BEFORE the 400ms subscribe retry runs.
    wiringA.liveQueryManager.unregisterLiveQuery(reg.queryId, client.id);

    const cleaned = await waitForMatch(
      () => leaderB.cdcSubscribers.size === 0 && leaderB.remoteLiveQueryCdcSubscribers.size === 0,
      1000,
    );
    assert.ok(
      cleaned,
      'cancel after uncertain subscribe failure must send remote unsubscribe and clear orphan',
    );
    assert.ok(unsubscribeDeliveries >= 1, 'LIVE_QUERY_CDC_UNSUBSCRIBE dispatched for uncertain binding');
  });

  it('Finding 3F-2: refused or deferred remote unsubscribe retains RETIRING retry obligation until confirmed while preserving replacement', async () => {
    routers = await createBridgedRouters(['node-a', 'node-b', 'node-c']);
    const routerA = routers.get('node-a');
    const routerB = routers.get('node-b');

    let nodeBUnsubAttempts = 0;
    let nodeCUnsubAttempts = 0;
    const origDeliverA = routerA.deliver.bind(routerA);
    routerA.deliver = async (targetAddress, message, opts = {}) => {
      if (message?.type === 'LIVE_QUERY_CDC_UNSUBSCRIBE') {
        if (targetAddress.startsWith('node-b/')) {
          nodeBUnsubAttempts += 1;
          if (nodeBUnsubAttempts === 1) {
            return buildDeliveryEnvelope({
              acknowledged: false,
              deferRetry: true,
              noHandler: false,
              retryAfterMs: 30,
              error: 'unsubscribe transport deferred',
            });
          }
          if (nodeBUnsubAttempts === 2) {
            return buildDeliveryEnvelope(
              {acknowledged: true},
              {success: false, unsubscribed: false, retryAfterMs: 30, error: 'partition refused'},
            );
          }
        } else if (targetAddress.startsWith('node-c/')) {
          nodeCUnsubAttempts += 1;
          if (nodeCUnsubAttempts === 1) {
            throw Object.assign(new Error('unsubscribe response timeout'), {retryAfterMs: 30});
          }
        }
      }
      return origDeliverA(targetAddress, message, opts);
    };

    const {switchLeader} = await setupTwoNodeWiring({
      routerA,
      routerB,
      leaderNodes: ['node-b', 'node-c'],
    });

    const client = createMockClient('unsubscribe-retry-client');
    const reg = await wiringA.liveQueryManager.registerLiveQuery(SELECT_OPEN_SQL, client);
    assert.equal(leaderB.cdcSubscribers.size, 1, 'subscribed initially on node-b');

    // Failover p1 from node-b to node-c while node-b unsubscribe fails twice (defer + refusal).
    switchLeader('node-c');

    const replacementLive = await waitForMatch(() => leaderC.cdcSubscribers.size === 1);
    assert.ok(replacementLive, 'replacement subscription attached on node-c');

    oracleDb.prepare(INSERT_ORDER_SQL).run(1, 'Alice', 'OPEN', 100, 's1');
    applyCommitted(
      leaderC,
      {...committedQueryOf('f3-1', INSERT_ORDER_SQL), params: [1, 'Alice', 'OPEN', 100, 's1']},
    );
    const row1Delivered = await waitForMatch(() => client.observedRows.has(1));
    assert.ok(row1Delivered, 'replacement on node-c delivers writes while node-b cleanup retries');

    const oldCleaned = await waitForMatch(
      () => leaderB.cdcSubscribers.size === 0 && leaderB.remoteLiveQueryCdcSubscribers.size === 0,
      1500,
    );
    assert.ok(oldCleaned, 'retiring node-b unsubscribe retried until confirmed removal');
    assert.ok(nodeBUnsubAttempts >= 3, 'retried past both transport deferral and handler refusal');
    assert.equal(leaderC.cdcSubscribers.size, 1, 'replacement node-c subscription preserved intact');

    oracleDb.prepare(INSERT_ORDER_SQL).run(2, 'Bob', 'OPEN', 200, 's2');
    applyCommitted(
      leaderC,
      {...committedQueryOf('f3-2', INSERT_ORDER_SQL), params: [2, 'Bob', 'OPEN', 200, 's2']},
    );
    const row2Delivered = await waitForMatch(() => client.observedRows.size === 2);
    assert.ok(row2Delivered, 'replacement node-c subscription still delivers after old cleanup settles');

    // Direct unregister when unsubscribe throws once must also retry while idle until confirmed.
    wiringA.liveQueryManager.unregisterLiveQuery(reg.queryId, client.id);
    assert.equal(wiringA.liveQueryManager.queryGroups.size, 0, 'local group removed');

    const finalCleaned = await waitForMatch(
      () => leaderC.cdcSubscribers.size === 0 && leaderC.remoteLiveQueryCdcSubscribers.size === 0,
      1500,
    );
    assert.ok(finalCleaned, 'retiring node-c unsubscribe retried after throw until confirmed');
    assert.ok(nodeCUnsubAttempts >= 2, 'node-c unsubscribe retried past initial throw');
  });

  it('P5.3: bounded exhaustive BFS exploration over transitionRemoteCdcSubscription preserves safety, custody, and convergence', () => {
    const MAX_DEPTH = 9;
    const MAX_DEBT_EPOCHS = 3;
    const MAX_ATTEMPTS = 4;

    const cloneSub = (sub) => ({
      ...sub,
      inFlightSubscribe: sub.inFlightSubscribe ? {...sub.inFlightSubscribe} : null,
      inFlightRefresh: sub.inFlightRefresh ? {...sub.inFlightRefresh} : null,
    });

    const stateKey = (sub, wasCancelled) => [
      sub.phase,
      sub.subscribed ? 1 : 0,
      sub.needsCatchupOnSubscribe ? 1 : 0,
      sub.inFlightSubscribe ? sub.inFlightSubscribe.attemptId : 0,
      sub.inFlightRefresh ? sub.inFlightRefresh.coversResetDebtEpoch : -1,
      sub.inFlightCleanups,
      sub.remoteUnsubscribeDispatched ? 1 : 0,
      sub.resetDebtEpoch,
      sub.settledResetEpoch,
      sub.retryNotBeforeMs > 0 ? 1 : 0,
      wasCancelled ? 1 : 0,
    ].join('|');

    const assertIndependentInvariants = (sub, wasCancelled, context) => {
      assert.ok(sub.settledResetEpoch <= sub.resetDebtEpoch,
        `${context}: settledResetEpoch <= resetDebtEpoch`);
      assert.ok(sub.inFlightCleanups >= 0, `${context}: non-negative inFlightCleanups`);
      assert.ok(sub.retryNotBeforeMs >= 0, `${context}: non-negative retryNotBeforeMs`);

      if (sub.phase === REMOTE_CDC_PHASE.LIVE) {
        assert.equal(sub.subscribed, true, `${context}: LIVE requires subscribed === true`);
        assert.equal(sub.settledResetEpoch, sub.resetDebtEpoch,
          `${context}: LIVE forbids unsettled resetDebtEpoch`);
      }
      if (sub.phase === REMOTE_CDC_PHASE.CLOSED) {
        assert.equal(sub.inFlightSubscribe, null, `${context}: CLOSED forbids inFlightSubscribe`);
        assert.equal(sub.inFlightCleanups, 0, `${context}: CLOSED forbids pending inFlightCleanups`);
      }
      if (wasCancelled) {
        assert.ok(
          sub.phase === REMOTE_CDC_PHASE.RETIRING || sub.phase === REMOTE_CDC_PHASE.CLOSED,
          `${context}: cancelled subscription can never re-enter active phase ${sub.phase}`,
        );
      }

      // Every non-terminal/non-LIVE state must either have an in-flight effect or an owned wake.
      const isQuiescent = sub.phase === REMOTE_CDC_PHASE.CLOSED ||
        (sub.phase === REMOTE_CDC_PHASE.LIVE && sub.settledResetEpoch === sub.resetDebtEpoch);
      const hasInFlight = sub.inFlightSubscribe !== null ||
        sub.inFlightRefresh !== null ||
        sub.inFlightCleanups > 0;
      if (!isQuiescent && !hasInFlight) {
        assert.equal(
          hasOutstandingRemoteCdcObligation(sub),
          true,
          `${context}: active non-quiescent state without in-flight work must retain an owned wake`,
        );
      }
    };

    const assertBoundedConvergence = (sub, context) => {
      const sim = cloneSub(sub);
      let steps = 0;
      while (steps < 12 &&
          sim.phase !== REMOTE_CDC_PHASE.LIVE &&
          sim.phase !== REMOTE_CDC_PHASE.CLOSED) {
        steps += 1;
        if (sim.phase === REMOTE_CDC_PHASE.RETIRING) {
          if (sim.inFlightSubscribe !== null) {
            transitionRemoteCdcSubscription(sim, {
              type: REMOTE_CDC_EVENT.SUBSCRIBE_SETTLED,
              attemptId: sim.inFlightSubscribe.attemptId,
              binding: sim.inFlightSubscribe,
              accepted: true,
              nowMs: 5000 + steps,
            });
          } else if (sim.inFlightCleanups > 0) {
            transitionRemoteCdcSubscription(sim, {type: REMOTE_CDC_EVENT.CLEANUP_SETTLED});
          } else {
            break;
          }
          continue;
        }
        if (sim.phase === REMOTE_CDC_PHASE.CONNECTING) {
          if (sim.inFlightSubscribe === null) {
            transitionRemoteCdcSubscription(sim, {type: REMOTE_CDC_EVENT.START_SUBSCRIBE});
          } else {
            transitionRemoteCdcSubscription(sim, {
              type: REMOTE_CDC_EVENT.SUBSCRIBE_SETTLED,
              attemptId: sim.inFlightSubscribe.attemptId,
              binding: sim.inFlightSubscribe,
              accepted: true,
              requiresCatchup: true,
              nowMs: 5000 + steps,
            });
          }
          continue;
        }
        if (sim.phase === REMOTE_CDC_PHASE.CATCHING_UP) {
          if (sim.inFlightRefresh === null) {
            transitionRemoteCdcSubscription(sim, {type: REMOTE_CDC_EVENT.START_REFRESH});
          } else {
            transitionRemoteCdcSubscription(sim, {
              type: REMOTE_CDC_EVENT.REFRESH_SETTLED,
              attempt: sim.inFlightRefresh,
              authoritative: true,
              nowMs: 5000 + steps,
              scheduleOnIncomplete: true,
            });
          }
        }
      }
      assert.ok(
        sim.phase === REMOTE_CDC_PHASE.LIVE || sim.phase === REMOTE_CDC_PHASE.CLOSED,
        `${context}: state must converge to LIVE or CLOSED within bounded steps (got ${sim.phase})`,
      );
    };

    const initial = createRemoteCdcSubscriptionState({
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
      needsCatchupOnSubscribe: false,
    });

    const visited = new Set([stateKey(initial, false)]);
    const observedPhases = new Set([initial.phase]);
    const queue = [{sub: initial, depth: 0, wasCancelled: false}];
    let transitionsChecked = 0;

    while (queue.length > 0) {
      const {sub, depth, wasCancelled} = queue.shift();
      observedPhases.add(sub.phase);
      assertIndependentInvariants(sub, wasCancelled, `depth=${depth}`);
      assertBoundedConvergence(sub, `depth=${depth}`);
      if (depth >= MAX_DEPTH) continue;

      const actions = [];
      if (sub.phase === REMOTE_CDC_PHASE.CONNECTING &&
          sub.inFlightSubscribe === null &&
          sub.nextAttemptId < MAX_ATTEMPTS) {
        actions.push({type: REMOTE_CDC_EVENT.START_SUBSCRIBE});
      }
      if (sub.inFlightSubscribe !== null) {
        actions.push(
          {
            type: REMOTE_CDC_EVENT.SUBSCRIBE_SETTLED,
            attemptId: sub.inFlightSubscribe.attemptId,
            binding: sub.inFlightSubscribe,
            accepted: true,
            requiresCatchup: true,
            nowMs: 1000 + depth * 10,
          },
          {
            type: REMOTE_CDC_EVENT.SUBSCRIBE_SETTLED,
            attemptId: sub.inFlightSubscribe.attemptId,
            binding: sub.inFlightSubscribe,
            accepted: true,
            requiresCatchup: false,
            nowMs: 1000 + depth * 10,
          },
          {
            type: REMOTE_CDC_EVENT.SUBSCRIBE_SETTLED,
            attemptId: sub.inFlightSubscribe.attemptId,
            binding: sub.inFlightSubscribe,
            accepted: false,
            retryAfterMs: 250,
            error: 'deferred',
            nowMs: 1000 + depth * 10,
          },
          {
            type: REMOTE_CDC_EVENT.SUBSCRIBE_SETTLED,
            attemptId: sub.inFlightSubscribe.attemptId,
            binding: sub.inFlightSubscribe,
            accepted: false,
            uncertainRemoteRegistration: true,
            retryAfterMs: null,
            error: 'transport-error',
            nowMs: 1000 + depth * 10,
          },
        );
      }
      if (!wasCancelled && sub.resetDebtEpoch < MAX_DEBT_EPOCHS) {
        actions.push({
          type: REMOTE_CDC_EVENT.RAISE_RESET_DEBT,
          scheduleContinuation: true,
        });
      }
      if (sub.phase === REMOTE_CDC_PHASE.CATCHING_UP &&
          sub.inFlightRefresh === null &&
          sub.nextAttemptId < MAX_ATTEMPTS) {
        actions.push({type: REMOTE_CDC_EVENT.START_REFRESH});
      }
      if (sub.inFlightRefresh !== null) {
        actions.push(
          {
            type: REMOTE_CDC_EVENT.REFRESH_SETTLED,
            attempt: sub.inFlightRefresh,
            authoritative: true,
            nowMs: 1000 + depth * 10,
            scheduleOnIncomplete: true,
          },
          {
            type: REMOTE_CDC_EVENT.REFRESH_SETTLED,
            attempt: sub.inFlightRefresh,
            authoritative: false,
            retryAfterMs: 150,
            error: 'sql-err',
            nowMs: 1000 + depth * 10,
            scheduleOnIncomplete: true,
          },
        );
      }
      if (sub.phase !== REMOTE_CDC_PHASE.CLOSED && !wasCancelled) {
        actions.push({type: REMOTE_CDC_EVENT.CANCEL});
      }
      if (sub.inFlightCleanups > 0) {
        actions.push({type: REMOTE_CDC_EVENT.CLEANUP_SETTLED});
      }

      for (const action of actions) {
        const next = cloneSub(sub);
        const prevNotBefore = next.retryNotBeforeMs;
        const prevDebtEpoch = next.resetDebtEpoch;
        const prevPhase = next.phase;
        const res = transitionRemoteCdcSubscription(next, action);
        transitionsChecked += 1;
        const nextCancelled = wasCancelled || action.type === REMOTE_CDC_EVENT.CANCEL;

        // Verify transition-level contracts.
        if (action.type === REMOTE_CDC_EVENT.SUBSCRIBE_SETTLED &&
            (prevPhase === REMOTE_CDC_PHASE.RETIRING || prevPhase === REMOTE_CDC_PHASE.CLOSED) &&
            (action.accepted || action.uncertainRemoteRegistration)) {
          const unsubEffect = res.effects.find(
            (e) => e.type === REMOTE_CDC_EFFECT.SEND_REMOTE_UNSUBSCRIBE,
          );
          assert.ok(unsubEffect, 'retiring late subscribe MUST emit SEND_REMOTE_UNSUBSCRIBE');
          assert.equal(unsubEffect.binding.subscriberId, action.binding.subscriberId);
          assert.equal(unsubEffect.binding.targetAddress, action.binding.targetAddress);
        }
        if (action.type === REMOTE_CDC_EVENT.REFRESH_SETTLED &&
            action.authoritative &&
            !wasCancelled &&
            action.attempt.coversResetDebtEpoch < prevDebtEpoch) {
          assert.equal(res.settled, false, 'older refresh cannot settle newer debt epoch');
          assert.equal(next.phase, REMOTE_CDC_PHASE.CATCHING_UP);
        }
        if (action.type === REMOTE_CDC_EVENT.SUBSCRIBE_SETTLED &&
            !action.accepted && !wasCancelled) {
          assert.ok(
            next.retryNotBeforeMs >= prevNotBefore,
            'retryNotBeforeMs must never move backwards on subsequent deferral',
          );
          if (action.retryAfterMs) {
            assert.ok(
              next.retryNotBeforeMs >= action.nowMs + action.retryAfterMs,
              'retryNotBeforeMs must honor transport retryAfterMs deadline',
            );
          }
        }

        const key = stateKey(next, nextCancelled);
        if (!visited.has(key)) {
          visited.add(key);
          queue.push({sub: next, depth: depth + 1, wasCancelled: nextCancelled});
        }
      }
    }

    for (const phase of Object.values(REMOTE_CDC_PHASE)) {
      assert.ok(observedPhases.has(phase), `BFS explored phase ${phase}`);
    }
    assert.ok(visited.size >= 100, `explored ${visited.size} distinct reachable lifecycle states`);
    assert.ok(transitionsChecked >= 250, `verified ${transitionsChecked} lifecycle transitions`);
  });
});
