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
import {createRemoteLiveQueryCdcCoordinator} from '../../src/live-query/live-query-remote-cdc.js';
import {createLiveQueryStartupWiring} from '../../src/live-query/live-query-startup-wiring.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {
  INSERT_ORDER_SQL,
  SELECT_OPEN_SQL,
  TABLE_SCHEMA,
  createBridgedRouters,
  createGate,
  createMockClient,
  createTopologyCache,
  deferredEnvelope,
  waitForMatch,
} from '../test-helpers/live-query-remote-cdc-fixture.js';
import {
  applyCommitted,
  clearFixtureSingletons,
  committedQueryOf,
  resetFixtureSingletons,
  startLeader,
} from '../test-helpers/participant-transaction-fixture.js';

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
    await wiringA?.shutdown();
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

  function commitOrder(leader, txId, id, customer, total, note = `s-${id}`) {
    const params = [id, customer, 'OPEN', total, note];
    oracleDb.prepare(INSERT_ORDER_SQL).run(...params);
    applyCommitted(leader, {...committedQueryOf(txId, INSERT_ORDER_SQL), params});
  }

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
    const row1Held = createGate();
    const row1Gate = createGate();
    let heldFirstSend = false;
    let resyncDeliveries = 0;

    const origDeliverB = routerB.deliver.bind(routerB);
    routerB.deliver = async (targetAddress, message, opts = {}) => {
      if (message?.type === 'LIVE_QUERY_CDC_EVENT') {
        if (!heldFirstSend && message.resyncRequired === false) {
          heldFirstSend = true;
          row1Held.release();
          await row1Gate.promise;
          return origDeliverB(targetAddress, message, opts);
        }
        if (message.resyncRequired === true) resyncDeliveries += 1;
      }
      return origDeliverB(targetAddress, message, opts);
    };

    await setupTwoNodeWiring({routerA, routerB});

    const client = createMockClient('overflow-during-await-client');
    const reg = await wiringA.liveQueryManager.registerLiveQuery(SELECT_OPEN_SQL, client);

    // Commit Row 1 and hold its first send unresolved.
    commitOrder(leaderB, 'oa-1', 1, 'Alice', 100, 's1');
    await row1Held.promise;

    // While Row 1's non-overflow send is still pending, commit 261 newer rows to force overflow.
    const totalRows = 262;
    for (let id = 2; id <= totalRows; id += 1) {
      commitOrder(leaderB, `oa-${id}`, id, `Customer-${id}`, id * 10);
    }
    const remoteEntry = Array.from(leaderB.remoteLiveQueryCdcSubscribers.values())[0];
    const overflowed = await waitForMatch(() => remoteEntry.overflowResyncRequired === true);
    assert.ok(overflowed, 'newer overflow arose while older non-overflow send was pending');

    // Release the older Row 1 send so it returns a genuine SUCCESS ACK.
    row1Gate.release();

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
    const firstHeld = createGate();
    const firstGate = createGate();
    let heldOnce = false;
    let emptyQueueResyncSent = false;

    const origDeliverB = routerB.deliver.bind(routerB);
    routerB.deliver = async (targetAddress, message, opts = {}) => {
      if (message?.type === 'LIVE_QUERY_CDC_EVENT') {
        if (!heldOnce) {
          heldOnce = true;
          firstHeld.release();
          await firstGate.promise;
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

    commitOrder(leaderB, 'eq-1', 1, 'Alice', 100, 's1');
    await firstHeld.promise;

    // While Row 1 is the only queued item, raise newer reset debt with no extra queued events
    // (modeling compacted history leaving an empty queue after Row 1 retires) plus Row 2 in oracle.
    oracleDb.prepare(INSERT_ORDER_SQL).run(2, 'Bob', 'OPEN', 200, 's2');
    const remoteEntry = Array.from(leaderB.remoteLiveQueryCdcSubscribers.values())[0];
    remoteEntry.overflowResyncRequired = true;
    remoteEntry.overflowEpoch += 1;

    firstGate.release();

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
        return deferredEnvelope(25, 'defer initial subscribe');
      }
      return origDeliverA(targetAddress, message, opts);
    };

    let holdPreHandshakeRead = false;
    const preHandshakeGate = createGate();
    await setupTwoNodeWiring({
      routerA,
      routerB,
      executeQuery: async (sql, params, db) => {
        if (holdPreHandshakeRead) {
          holdPreHandshakeRead = false;
          // Capture stale empty pre-write snapshot before yielding!
          await preHandshakeGate.promise;
          return {rows: [], results: [], count: 0};
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
    commitOrder(leaderB, 'cc-1', 1, 'Alice', 100, 's1');
    failSubscribe = false;

    const subscribed = await waitForMatch(() => group.subscribedPartitions.has('p1'));
    assert.ok(subscribed, 'deferred subscribe completed while pre-handshake refresh was running');

    // Release stale pre-handshake refresh; catch-up debt must survive and recover Row 1 while idle.
    preHandshakeGate.release();
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
    const oldBRegistered = createGate();
    const oldBGate = createGate();
    let holdFirstNodeB = true;

    const origDeliverA = routerA.deliver.bind(routerA);
    routerA.deliver = async (targetAddress, message, opts = {}) => {
      if (holdFirstNodeB &&
          message?.type === 'LIVE_QUERY_CDC_SUBSCRIBE' &&
          targetAddress.startsWith('node-b/')) {
        holdFirstNodeB = false;
        const realResp = await origDeliverA(targetAddress, message, opts);
        oldBRegistered.release();
        await oldBGate.promise;
        return realResp;
      }
      return origDeliverA(targetAddress, message, opts);
    };

    const {switchLeader} = await setupTwoNodeWiring({
      routerA, routerB, leaderNodes: ['node-b', 'node-c'],
    });

    const client = createMockClient('replacement-binding-client');
    const regPromise = wiringA.liveQueryManager.registerLiveQuery(SELECT_OPEN_SQL, client);
    await oldBRegistered.promise;
    assert.equal(leaderB.cdcSubscribers.size, 1, 'old binding registered on node-b');

    // Fail over p1 to node-c while node-b's subscribe response is still held!
    switchLeader('node-c');

    const replacementAttached = await waitForMatch(() => leaderC.cdcSubscribers.size === 1);
    assert.ok(replacementAttached, 'replacement binding attached on node-c');

    // Release old node-b subscribe response: must clean up node-b WITHOUT deleting node-c!
    oldBGate.release();
    const reg = await regPromise;

    const oldCleaned = await waitForMatch(() => leaderB.cdcSubscribers.size === 0);
    assert.ok(oldCleaned, 'late old subscribe completion retired old node-b registration');
    assert.equal(leaderC.cdcSubscribers.size, 1, 'replacement node-c registration survived intact');

    // Verify replacement registration on node-c actively delivers live writes!
    commitOrder(leaderC, 'rep-1', 1, 'Alice', 100, 's1');
    const delivered = await waitForMatch(() => client.observedRows.size === 1);
    assert.ok(delivered, 'replacement binding on node-c delivers subsequent committed writes');

    // Same-node replacement isolation: hold gen=N on node-c, replace on SAME node-c, release old.
    const sameNodeOldRegistered = createGate();
    const sameNodeOldGate = createGate();
    let holdNextNodeC = true;
    const prevDeliverA = routerA.deliver;
    routerA.deliver = async (targetAddress, message, opts = {}) => {
      if (holdNextNodeC &&
          message?.type === 'LIVE_QUERY_CDC_SUBSCRIBE' &&
          targetAddress.startsWith('node-c/')) {
        holdNextNodeC = false;
        const realResp = await prevDeliverA(targetAddress, message, opts);
        sameNodeOldRegistered.release();
        await sameNodeOldGate.promise;
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
    await sameNodeOldRegistered.promise;
    assert.equal(leaderC.cdcSubscribers.size, 1, 'old same-node generation registered');

    // Replace on the SAME node-c while old generation's subscribe response is still held!
    await wiringA.liveQueryManager.unsubscribeFromPartition('p1', reg.queryId);
    await wiringA.liveQueryManager.subscribeToPartition('p1', reg.queryId, handler, {});
    assert.equal(leaderC.cdcSubscribers.size, 2, 'old + new generations briefly coexist on node-c');

    sameNodeOldGate.release();
    await oldSameNodePromise;

    const sameNodeCleaned = await waitForMatch(() => leaderC.cdcSubscribers.size === 1);
    assert.ok(sameNodeCleaned, 'old generation cleaned ONLY its own subscriberId on node-c');

    commitOrder(leaderC, 'rep-2', 2, 'Bob', 200, 's2');
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

    const cleaned = transitionRemoteCdcSubscription(sub, {
      type: REMOTE_CDC_EVENT.CLEANUP_SETTLED,
      binding: cancelled.effects[0].binding,
      bindingGeneration: sub.bindingGeneration,
      success: true,
      nowMs: 1400,
    });
    assert.equal(sub.phase, REMOTE_CDC_PHASE.CLOSED);
    assert.equal(cleaned.effects[0].type, REMOTE_CDC_EFFECT.RETIRE_RECORD);
  });

  it('P4.2: failover during an awaited failover subscribe preserves latest subscribedPartitions and retires old targets', async () => {
    routers = await createBridgedRouters(['node-a', 'node-b', 'node-c', 'node-d']);
    const routerA = routers.get('node-a');
    const routerB = routers.get('node-b');
    const routerD = routers.get('node-d');
    const nodeCRegistered = createGate();
    const nodeCGate = createGate();
    let holdNodeCOnce = true;

    const origDeliverA = routerA.deliver.bind(routerA);
    routerA.deliver = async (targetAddress, message, opts = {}) => {
      if (holdNodeCOnce &&
          message?.type === 'LIVE_QUERY_CDC_SUBSCRIBE' &&
          targetAddress.startsWith('node-c/')) {
        holdNodeCOnce = false;
        const realResp = await origDeliverA(targetAddress, message, opts);
        nodeCRegistered.release();
        await nodeCGate.promise;
        return realResp;
      }
      return origDeliverA(targetAddress, message, opts);
    };

    const {switchLeader} = await setupTwoNodeWiring({
      routerA, routerB, leaderNodes: ['node-b', 'node-c'],
    });
    const {leader: leaderD} = await startLeader({
      tableName: 'live_orders', schema: TABLE_SCHEMA,
      nodeId: 'node-d', replicaId: 'p1', transport: routerD,
    }, 'p1');

    try {
      const client = createMockClient('nested-failover-client');
      const reg = await wiringA.liveQueryManager.registerLiveQuery(SELECT_OPEN_SQL, client);
      const group = wiringA.liveQueryManager.findGroupByQueryId(reg.queryId);
      assert.equal(leaderB.cdcSubscribers.size, 1, 'initial target node-b subscribed');
      assert.equal(group.subscribedPartitions.has('p1'), true);

      // Failover 1 (node-b -> node-c): hold node-c subscribe response after remote registration.
      switchLeader('node-c');
      await nodeCRegistered.promise;
      assert.equal(leaderB.cdcSubscribers.size, 0, 'node-b retired on failover 1');
      assert.equal(leaderC.cdcSubscribers.size, 1, 'node-c registered during awaited failover 1');

      // Failover 2 (node-c -> node-d) completes while failover 1's node-c response is still held!
      switchLeader('node-d');

      const attachedD = await waitForMatch(
        () => leaderD.cdcSubscribers.size === 1 && group.subscribedPartitions.has('p1'),
      );
      assert.ok(attachedD, 'failover 2 subscribed latest target node-d');

      // Release stale failover 1 response from node-c: must NOT demote group.subscribedPartitions!
      nodeCGate.release();
      const retiredC = await waitForMatch(() => leaderC.cdcSubscribers.size === 0);
      assert.ok(retiredC, 'stale node-c failover registration retired cleanly');
      await new Promise((resolve) => setTimeout(resolve, 40));

      assert.equal(
        group.subscribedPartitions.has('p1'), true,
        'stale failover 1 completion must NOT demote latest target p1 from subscribedPartitions',
      );
      assert.equal(
        group.pendingSubscriptions.has('p1'), false,
        'latest live target p1 must NOT be demoted to pendingSubscriptions',
      );
      assert.equal(leaderB.cdcSubscribers.size, 0, 'node-b remains retired');
      assert.equal(leaderC.cdcSubscribers.size, 0, 'node-c remains retired');
      assert.equal(leaderD.cdcSubscribers.size, 1, 'latest target node-d remains subscribed');

      // Verify latest target node-d continues delivering live writes.
      commitOrder(leaderD, 'nf-1', 1, 'Diana', 500, 's1');
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
        return deferredEnvelope(25, 'defer initial subscribe');
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
          return deferredEnvelope(25, 'defer CDC to build overflow');
        }
        const env = await origDeliverB(targetAddress, message, opts);
        if (message.resyncRequired === true) {
          if (env?.answer?.success === false) resyncRefusedDuringHeldRefresh = true;
          else if (env?.answer?.success === true) resyncAcceptedAfterHeldRefresh = true;
        }
        return env;
      }
      return origDeliverB(targetAddress, message, opts);
    };

    let holdEpoch1CatchupRead = false;
    let epoch1ReadStarted = false;
    const epoch1ReadGate = createGate();
    const {sqlEngine} = await setupTwoNodeWiring({
      routerA,
      routerB,
      executeQuery: async (sql, params, db) => {
        if (holdEpoch1CatchupRead) {
          holdEpoch1CatchupRead = false;
          // Snapshot ONLY pre-overflow Row 1 before yielding.
          const staleEpoch1Rows = db.prepare(sql).all(...params);
          epoch1ReadStarted = true;
          await epoch1ReadGate.promise;
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
    commitOrder(leaderB, 'hr-1', 1, 'Alice', 100, 's1');
    holdEpoch1CatchupRead = true;
    failSubscribe = false;

    const epoch1Held = await waitForMatch(() => epoch1ReadStarted);
    assert.ok(epoch1Held, 'epoch-1 catch-up refresh is held in flight with Row 1 only');

    // While epoch-1 catch-up refresh is STILL held, trigger overflow (>256 rows) on leaderB
    // and let the resyncRequired delivery reach node-a while epoch-1 refresh is running!
    deferEventDelivery = true;
    const totalRows = 262;
    for (let id = 2; id <= totalRows; id += 1) {
      commitOrder(leaderB, `hr-${id}`, id, `Customer-${id}`, id * 10);
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
      remoteEntry.overflowResyncRequired, true,
      'producer retained overflowResyncRequired while epoch-1 refresh remained held',
    );

    // Release the stale epoch-1 catch-up read (returns ONLY Row 1): newer epoch-2 debt must
    // survive and converge to all 262 rows while idle with ZERO further writes!
    epoch1ReadGate.release();

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
        return deferredEnvelope(25, 'defer initial subscribe');
      }
      return origDeliverA(targetAddress, message, opts);
    };

    let holdCatchupSnapshot = false;
    let catchupSnapshotHeld = false;
    const catchupSnapshotGate = createGate();
    const {sqlEngine} = await setupTwoNodeWiring({
      routerA,
      routerB,
      executeQuery: async (sql, params, db) => {
        if (holdCatchupSnapshot) {
          holdCatchupSnapshot = false;
          const staleRows = db.prepare(sql).all(...params);
          catchupSnapshotHeld = true;
          await catchupSnapshotGate.promise;
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
    commitOrder(leaderB, 'b3-1', 1, 'Alice', 100, 's1');
    holdCatchupSnapshot = true;
    failSubscribe = false;

    const held = await waitForMatch(() => catchupSnapshotHeld && group.refreshInFlight);
    assert.ok(held, 'catch-up refresh captured Row 1 and is held before applying');
    const frontierBeforeRow2 = group.partitionFrontiers.get('p1') ?? 0;

    // 3-4. Commit and deliver ordinary Row 2 while catch-up refresh remains held.
    commitOrder(leaderB, 'b3-2', 2, 'Bob', 200, 's2');
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
    catchupSnapshotGate.release();
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
      Array.from(group.resultSet.keys()).sort((a, b) => a - b), [1, 2],
      'stored group.resultSet preserves both Row 1 and Row 2',
    );
    assert.equal(
      group.getPartitionFrontier('p1'), frontierAfterRow2,
      'group.getPartitionFrontier remains aligned at Row 2',
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
            return deferredEnvelope(30, 'unsubscribe transport deferred');
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

    commitOrder(leaderC, 'f3-1', 1, 'Alice', 100, 's1');
    const row1Delivered = await waitForMatch(() => client.observedRows.has(1));
    assert.ok(row1Delivered, 'replacement on node-c delivers writes while node-b cleanup retries');

    const oldCleaned = await waitForMatch(
      () => leaderB.cdcSubscribers.size === 0 && leaderB.remoteLiveQueryCdcSubscribers.size === 0,
      1500,
    );
    assert.ok(oldCleaned, 'retiring node-b unsubscribe retried until confirmed removal');
    assert.ok(nodeBUnsubAttempts >= 3, 'retried past both transport deferral and handler refusal');
    assert.equal(leaderC.cdcSubscribers.size, 1, 'replacement node-c subscription preserved intact');

    commitOrder(leaderC, 'f3-2', 2, 'Bob', 200, 's2');
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

  it('Finding 4D-1: graceful shutdown retains and retries deferred/refused remote unsubscribe to completion on a quiet live producer', async () => {
    routers = await createBridgedRouters(['node-a', 'node-b']);
    const routerA = routers.get('node-a');
    const routerB = routers.get('node-b');

    let unsubAttempts = 0;
    let firstAttemptAtMs = 0;
    let secondAttemptAtMs = 0;
    const origDeliverA = routerA.deliver.bind(routerA);
    routerA.deliver = async (targetAddress, message, opts = {}) => {
      if (message?.type === 'LIVE_QUERY_CDC_UNSUBSCRIBE') {
        unsubAttempts += 1;
        if (unsubAttempts === 1) {
          firstAttemptAtMs = Date.now();
          return deferredEnvelope(60, 'unsubscribe deferred before graceful shutdown');
        }
        if (unsubAttempts === 2) secondAttemptAtMs = Date.now();
      }
      return origDeliverA(targetAddress, message, opts);
    };

    await setupTwoNodeWiring({routerA, routerB});

    // Case 1: Cancel while first remote unsubscribe is DEFERRED (retryAfterMs: 60),
    // then immediately invoke graceful consumer shutdown while leaderB stays alive and quiet.
    const client1 = createMockClient('shutdown-deferred-after-cancel');
    const reg1 = await wiringA.liveQueryManager.registerLiveQuery(SELECT_OPEN_SQL, client1);
    assert.equal(leaderB.cdcSubscribers.size, 1, 'consumer subscribed on leaderB');
    assert.equal(leaderB.remoteLiveQueryCdcSubscribers.size, 1);

    wiringA.liveQueryManager.unregisterLiveQuery(reg1.queryId, client1.id);
    const summary1 = await wiringA.shutdown({timeoutMs: 1500});
    assert.deepEqual(
      summary1,
      {settled: true, remainingRetiringCount: 0},
      'graceful shutdown must drain retiring deferred unsubscribe and report settled summary',
    );
    assert.ok(unsubAttempts >= 2, 'shutdown retained and retried deferred remote unsubscribe');
    assert.ok(
      secondAttemptAtMs - firstAttemptAtMs >= 45,
      'shutdown retry respected retryAfterMs not-before bound',
    );
    assert.equal(leaderB.cdcSubscribers.size, 0, 'remote partition subscriber retired while quiet');
    assert.equal(
      leaderB.remoteLiveQueryCdcSubscribers.size,
      0,
      'remoteLiveQueryCdcSubscribers count is zero without requiring another CDC event',
    );
    await assert.rejects(
      () => wiringA.liveQueryManager.registerLiveQuery(SELECT_OPEN_SQL, createMockClient('late')),
      /shutting down/i,
      'new live query admissions are refused once shutdown begins',
    );

    // Case 2: Active subscription + direct LiveQueryManager.shutdown() when first unsubscribe
    // is refused (retryAfterMs: 60) while leaderB stays alive and quiet.
    let managerUnsubAttempts = 0;
    routerA.deliver = async (targetAddress, message, opts = {}) => {
      if (message?.type === 'LIVE_QUERY_CDC_UNSUBSCRIBE') {
        managerUnsubAttempts += 1;
        if (managerUnsubAttempts === 1) {
          return buildDeliveryEnvelope(
            {acknowledged: true},
            {success: false, unsubscribed: false, retryAfterMs: 60, error: 'partition busy'},
          );
        }
      }
      return origDeliverA(targetAddress, message, opts);
    };
    const {systemCache, sqlEngine} = await (async () => {
      const partitions = [{
        partition_id: 'p1', table_name: 'live_orders',
        partition_key_start: null, partition_key_end: null,
        partition_key_type: 'INTEGER', leader_node_id: 'node-b',
      }];
      const replicas = [{partition_id: 'p1', node_id: 'node-b'}];
      const parser = new SQLQueryEngine();
      return {
        systemCache: createTopologyCache(() => partitions, () => replicas),
        sqlEngine: {
          parse: (sql) => parser.parse(sql),
          executeQuery: async () => ({rows: [], results: [], count: 0}),
        },
      };
    })();
    wiringA = createLiveQueryStartupWiring({
      nodeId: 'node-a',
      systemTableCache: systemCache,
      sqlQueryEngine: sqlEngine,
      partitionServicesProvider: () => new Map(),
      messageRouter: routerA,
    });
    const client2 = createMockClient('direct-manager-shutdown');
    await wiringA.liveQueryManager.registerLiveQuery(SELECT_OPEN_SQL, client2);
    assert.equal(leaderB.remoteLiveQueryCdcSubscribers.size, 1, 'active remote subscriber present');

    const summary2 = await wiringA.liveQueryManager.shutdown({timeoutMs: 1500});
    assert.deepEqual(
      summary2,
      {settled: true, remainingRetiringCount: 0},
      'LiveQueryManager.shutdown() must retire active subscription and drain refused unsubscribe',
    );
    assert.ok(managerUnsubAttempts >= 2, 'manager shutdown retried refused unsubscribe');
    assert.equal(leaderB.cdcSubscribers.size, 0, 'remote partition retired by manager shutdown');
    assert.equal(leaderB.remoteLiveQueryCdcSubscribers.size, 0);
    assert.equal(wiringA.liveQueryManager.isInitialized(), false);

    // Case 3: Shutdown while uncertainRemoteRegistration is pending (subscribe reply lost)
    // and first unsubscribe is DEFERRED (retryAfterMs: 60).
    let loseSubscribeReply = true;
    let uncertainUnsubAttempts = 0;
    routerA.deliver = async (targetAddress, message, opts = {}) => {
      if (loseSubscribeReply && message?.type === 'LIVE_QUERY_CDC_SUBSCRIBE') {
        loseSubscribeReply = false;
        await origDeliverA(targetAddress, message, opts);
        throw Object.assign(new Error('subscribe reply lost'), {retryAfterMs: 400});
      }
      if (message?.type === 'LIVE_QUERY_CDC_UNSUBSCRIBE') {
        uncertainUnsubAttempts += 1;
        if (uncertainUnsubAttempts === 1) {
          return deferredEnvelope(60, 'defer uncertain binding unsubscribe');
        }
      }
      return origDeliverA(targetAddress, message, opts);
    };
    wiringA = createLiveQueryStartupWiring({
      nodeId: 'node-a',
      systemTableCache: systemCache,
      sqlQueryEngine: sqlEngine,
      partitionServicesProvider: () => new Map(),
      messageRouter: routerA,
    });
    await wiringA.liveQueryManager.registerLiveQuery(
      SELECT_OPEN_SQL, createMockClient('uncertain-shutdown'),
    );
    assert.equal(leaderB.remoteLiveQueryCdcSubscribers.size, 1, 'uncertain binding exists remotely');

    const summary3 = await wiringA.shutdown({timeoutMs: 1500});
    assert.deepEqual(
      summary3,
      {settled: true, remainingRetiringCount: 0},
      'shutdown must retire uncertainRemoteRegistration bindings and drain deferred cleanup',
    );
    assert.ok(uncertainUnsubAttempts >= 2, 'uncertain binding unsubscribe retried to confirmation');
    assert.equal(leaderB.cdcSubscribers.size, 0);
    assert.equal(leaderB.remoteLiveQueryCdcSubscribers.size, 0);
  });

  it('Finding 4D-2: shutdown enforces finite drain bound when remote partition stays permanently unreachable', async () => {
    routers = await createBridgedRouters(['node-a', 'node-b']);
    const routerA = routers.get('node-a');
    const routerB = routers.get('node-b');

    let unsubAttempts = 0;
    const origDeliverA = routerA.deliver.bind(routerA);
    routerA.deliver = async (targetAddress, message, opts = {}) => {
      if (message?.type === 'LIVE_QUERY_CDC_UNSUBSCRIBE') {
        unsubAttempts += 1;
        return deferredEnvelope(40, 'remote partition permanently unreachable');
      }
      return origDeliverA(targetAddress, message, opts);
    };

    await setupTwoNodeWiring({routerA, routerB});

    const client = createMockClient('bounded-unreachable-shutdown');
    await wiringA.liveQueryManager.registerLiveQuery(SELECT_OPEN_SQL, client);
    assert.equal(leaderB.remoteLiveQueryCdcSubscribers.size, 1);

    const startedAt = Date.now();
    const summary = await wiringA.shutdown({timeoutMs: 180});
    const elapsedMs = Date.now() - startedAt;

    assert.deepEqual(
      summary,
      {settled: false, remainingRetiringCount: 1},
      'permanently unreachable remote unsubscribe reports unsettled summary at finite bound',
    );
    assert.ok(unsubAttempts >= 2, 'shutdown attempted bounded retries before budget expiry');
    assert.ok(
      elapsedMs >= 140 && elapsedMs < 1000,
      `shutdown must terminate cleanly near its finite 180ms bound (elapsed=${elapsedMs}ms)`,
    );

    const attemptsAtShutdown = unsubAttempts;
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.equal(
      unsubAttempts,
      attemptsAtShutdown,
      'zero retry timers or unsubscribes fire after shutdown finalizes',
    );

    // Direct coordinator shutdown bound when an in-flight unsubscribe RPC hangs indefinitely.
    const hangingRouter = {
      register: () => {},
      unregisterExact: () => {},
      deliver: async (_target, msg) => {
        if (msg.type === 'LIVE_QUERY_CDC_SUBSCRIBE') {
          return buildDeliveryEnvelope({acknowledged: true}, {success: true, appliedIndex: 1});
        }
        return new Promise(() => {});
      },
    };
    const coordinator = createRemoteLiveQueryCdcCoordinator({
      nodeId: 'node-direct',
      metadataStore: null,
      messageRouter: hangingRouter,
      findGroupById: () => null,
      resolveLocalPartition: () => null,
      subscribeToPartition: async () => ({}),
      unsubscribeFromPartition: async () => ({}),
      shutdownDrainTimeoutMs: 120,
      logger: {debug: () => {}, warn: () => {}, info: () => {}},
    });
    const subRes = await coordinator.subscribeRemote(
      'p1', 'q-hang', () => {}, async () => {}, {},
      {targetNodeId: 'node-b', targetAddress: 'node-b/partition/p1'},
    );
    assert.equal(subRes.result?.subscribed, true, 'direct coordinator subscribed');

    const hangStart = Date.now();
    const hangSummary = await coordinator.shutdown();
    const hangElapsed = Date.now() - hangStart;
    assert.deepEqual(
      hangSummary,
      {settled: false, remainingRetiringCount: 1},
      'direct coordinator shutdown terminates cleanly even when unsubscribe RPC hangs',
    );
    assert.ok(
      hangElapsed >= 90 && hangElapsed < 800,
      `direct coordinator shutdown honored configured 120ms bound (elapsed=${hangElapsed}ms)`,
    );
  });

  it('P5.3: bounded exhaustive BFS exploration over transitionRemoteCdcSubscription preserves safety, custody, and convergence', () => {
    const MAX_DEPTH = 9;
    const MAX_DEBT_EPOCHS = 2;
    const MAX_CDC_EPOCHS = 2;
    const MAX_ATTEMPTS = 4;

    const cloneSub = (sub) => ({
      ...sub,
      inFlightSubscribe: sub.inFlightSubscribe ? {...sub.inFlightSubscribe} : null,
      inFlightRefresh: sub.inFlightRefresh ? {...sub.inFlightRefresh} : null,
      pendingCleanupBindings: sub.pendingCleanupBindings.map((b) => ({...b})),
    });

    const stateKey = (sub, meta) => [
      sub.phase, sub.subscribed ? 1 : 0, sub.uncertainRemoteRegistration ? 1 : 0,
      sub.needsCatchupOnSubscribe ? 1 : 0,
      sub.inFlightSubscribe ? sub.inFlightSubscribe.attemptId : 0,
      sub.inFlightRefresh ?
        `${sub.inFlightRefresh.coversResetDebtEpoch}:${sub.inFlightRefresh.coversCdcEpoch}` : -1,
      sub.inFlightCleanups, sub.pendingCleanupBindings.length,
      sub.remoteUnsubscribeDispatched ? 1 : 0,
      sub.resetDebtEpoch, sub.settledResetEpoch,
      sub.ordinaryCdcEpoch, sub.requiredCdcEpoch, sub.settledCdcEpoch,
      sub.retryNotBeforeMs > 0 ? 1 : 0,
      meta.wasCancelled ? 1 : 0, meta.hadPossibleReg ? 1 : 0,
      meta.cleanupConfirmed ? 1 : 0, meta.cleanupFailures,
    ].join('|');

    const assertIndependentInvariants = (sub, meta, context) => {
      assert.ok(sub.settledResetEpoch <= sub.resetDebtEpoch, `${context}: settled <= debt`);
      assert.ok(sub.inFlightCleanups >= 0, `${context}: non-negative inFlightCleanups`);
      assert.ok(sub.retryNotBeforeMs >= 0, `${context}: non-negative retryNotBeforeMs`);

      if (sub.phase === REMOTE_CDC_PHASE.LIVE) {
        assert.equal(sub.subscribed, true, `${context}: LIVE requires subscribed === true`);
        assert.equal(sub.settledResetEpoch, sub.resetDebtEpoch, `${context}: LIVE forbids debt`);
        assert.ok(sub.settledCdcEpoch >= sub.requiredCdcEpoch,
          `${context}: LIVE forbids snapshot started before latest acknowledged CDC event`);
      }
      if (sub.phase === REMOTE_CDC_PHASE.CLOSED) {
        assert.equal(sub.inFlightSubscribe, null, `${context}: CLOSED forbids inFlightSubscribe`);
        assert.equal(sub.inFlightCleanups, 0, `${context}: CLOSED forbids inFlightCleanups`);
        assert.equal(sub.pendingCleanupBindings.length, 0, `${context}: CLOSED forbids pending`);
        assert.equal(sub.uncertainRemoteRegistration, false, `${context}: CLOSED clears uncertain`);
        if (meta.hadPossibleReg) {
          assert.equal(meta.cleanupConfirmed, true,
            `${context}: CLOSED after accepted/uncertain registration requires confirmed cleanup`);
        }
      }
      if (meta.wasCancelled) {
        assert.ok(sub.phase === REMOTE_CDC_PHASE.RETIRING || sub.phase === REMOTE_CDC_PHASE.CLOSED,
          `${context}: cancelled subscription can never re-enter active phase ${sub.phase}`);
      }
      const isQuiescent = sub.phase === REMOTE_CDC_PHASE.CLOSED ||
        (sub.phase === REMOTE_CDC_PHASE.LIVE &&
          sub.settledResetEpoch === sub.resetDebtEpoch &&
          sub.settledCdcEpoch >= sub.requiredCdcEpoch);
      const hasInFlight = sub.inFlightSubscribe !== null ||
        sub.inFlightRefresh !== null || sub.inFlightCleanups > 0;
      if (!isQuiescent && !hasInFlight) {
        assert.equal(hasOutstandingRemoteCdcObligation(sub), true,
          `${context}: non-quiescent state without in-flight work must retain an owned wake`);
      }
    };

    const assertBoundedConvergence = (sub, context) => {
      const sim = cloneSub(sub);
      let steps = 0;
      while (steps < 16 &&
          sim.phase !== REMOTE_CDC_PHASE.LIVE && sim.phase !== REMOTE_CDC_PHASE.CLOSED) {
        steps += 1;
        if (sim.phase === REMOTE_CDC_PHASE.RETIRING) {
          if (sim.inFlightSubscribe !== null) {
            transitionRemoteCdcSubscription(sim, {
              type: REMOTE_CDC_EVENT.SUBSCRIBE_SETTLED, attemptId: sim.inFlightSubscribe.attemptId,
              binding: sim.inFlightSubscribe, accepted: true, nowMs: 5000 + steps,
            });
          } else if (sim.inFlightCleanups > 0) {
            transitionRemoteCdcSubscription(sim, {
              type: REMOTE_CDC_EVENT.CLEANUP_SETTLED, bindingGeneration: sim.bindingGeneration,
              success: true, nowMs: 5000 + steps,
            });
          } else if (sim.pendingCleanupBindings.length > 0) {
            transitionRemoteCdcSubscription(sim, {type: REMOTE_CDC_EVENT.START_CLEANUP});
          } else {
            break;
          }
          continue;
        }
        if (sim.phase === REMOTE_CDC_PHASE.CONNECTING) {
          transitionRemoteCdcSubscription(sim, sim.inFlightSubscribe === null ?
            {type: REMOTE_CDC_EVENT.START_SUBSCRIBE} :
            {
              type: REMOTE_CDC_EVENT.SUBSCRIBE_SETTLED, attemptId: sim.inFlightSubscribe.attemptId,
              binding: sim.inFlightSubscribe, accepted: true, requiresCatchup: true,
              nowMs: 5000 + steps,
            });
          continue;
        }
        if (sim.phase === REMOTE_CDC_PHASE.CATCHING_UP) {
          transitionRemoteCdcSubscription(sim, sim.inFlightRefresh === null ?
            {type: REMOTE_CDC_EVENT.START_REFRESH} :
            {
              type: REMOTE_CDC_EVENT.REFRESH_SETTLED, attempt: sim.inFlightRefresh,
              authoritative: true, nowMs: 5000 + steps, scheduleOnIncomplete: true,
            });
        }
      }
      assert.ok(sim.phase === REMOTE_CDC_PHASE.LIVE || sim.phase === REMOTE_CDC_PHASE.CLOSED,
        `${context}: state must converge to LIVE or CLOSED within bounded steps (got ${sim.phase})`);
    };

    const initial = createRemoteCdcSubscriptionState({
      subKey: 'q1:p1', partitionId: 'p1', queryId: 'q1', subscriberId: 'node-a:q1:p1:1',
      bindingGeneration: 1, transportKind: REMOTE_CDC_TRANSPORT_KIND.REMOTE,
      targetNodeId: 'node-b', targetAddress: 'node-b/partition/p1',
      handler: () => {}, wrappedHandler: () => {}, needsCatchupOnSubscribe: false,
    });
    const initMeta = {
      wasCancelled: false, hadPossibleReg: false, cleanupConfirmed: false, cleanupFailures: 0,
    };
    const visited = new Set([stateKey(initial, initMeta)]);
    const observedPhases = new Set([initial.phase]);
    const queue = [{sub: initial, depth: 0, meta: initMeta}];
    let transitionsChecked = 0;
    let observedOrdinaryCdcInRefresh = 0;
    let observedUncertainCancel = 0;
    let observedCleanupRetryToClosed = 0;

    while (queue.length > 0) {
      const {sub, depth, meta} = queue.shift();
      observedPhases.add(sub.phase);
      assertIndependentInvariants(sub, meta, `depth=${depth}`);
      assertBoundedConvergence(sub, `depth=${depth}`);
      if (depth >= MAX_DEPTH) continue;

      const nowMs = 1000 + depth * 10;
      const actions = [];
      if (sub.phase === REMOTE_CDC_PHASE.CONNECTING &&
          sub.inFlightSubscribe === null && sub.nextAttemptId < MAX_ATTEMPTS) {
        actions.push({type: REMOTE_CDC_EVENT.START_SUBSCRIBE});
      }
      if (sub.inFlightSubscribe !== null) {
        const b = sub.inFlightSubscribe;
        const subEv = (extra) => ({
          type: REMOTE_CDC_EVENT.SUBSCRIBE_SETTLED, attemptId: b.attemptId, binding: b, nowMs,
          ...extra,
        });
        actions.push(
          subEv({accepted: true, requiresCatchup: true}),
          subEv({accepted: true, requiresCatchup: false}),
          subEv({accepted: false, retryAfterMs: 250, error: 'deferred'}),
          subEv({accepted: false, uncertainRemoteRegistration: true, error: 'transport-error'}),
        );
      }
      if (!meta.wasCancelled && sub.resetDebtEpoch < MAX_DEBT_EPOCHS) {
        actions.push({type: REMOTE_CDC_EVENT.RAISE_RESET_DEBT, scheduleContinuation: true});
      }
      if (sub.phase === REMOTE_CDC_PHASE.CATCHING_UP &&
          sub.inFlightRefresh === null && sub.nextAttemptId < MAX_ATTEMPTS) {
        actions.push({type: REMOTE_CDC_EVENT.START_REFRESH});
      }
      if (sub.inFlightRefresh !== null) {
        if (!meta.wasCancelled && sub.ordinaryCdcEpoch < MAX_CDC_EPOCHS) {
          actions.push({type: REMOTE_CDC_EVENT.ORDINARY_CDC_DELIVERED});
        }
        const refEv = (extra) => ({
          type: REMOTE_CDC_EVENT.REFRESH_SETTLED, attempt: sub.inFlightRefresh, nowMs,
          scheduleOnIncomplete: true, ...extra,
        });
        actions.push(
          refEv({authoritative: true}),
          refEv({authoritative: false, retryAfterMs: 150, error: 'sql-err'}),
        );
      }
      if (sub.phase !== REMOTE_CDC_PHASE.CLOSED && !meta.wasCancelled) {
        actions.push({type: REMOTE_CDC_EVENT.CANCEL});
      }
      if (sub.inFlightCleanups > 0) {
        const clEv = (extra) => ({
          type: REMOTE_CDC_EVENT.CLEANUP_SETTLED, bindingGeneration: sub.bindingGeneration, nowMs,
          ...extra,
        });
        actions.push(clEv({success: true}));
        if (meta.cleanupFailures < 1) {
          actions.push(clEv({success: false, retryAfterMs: 120, error: 'refused'}));
        }
      }
      if (sub.phase === REMOTE_CDC_PHASE.RETIRING &&
          sub.inFlightCleanups === 0 && sub.pendingCleanupBindings.length > 0) {
        actions.push({type: REMOTE_CDC_EVENT.START_CLEANUP});
      }

      for (const action of actions) {
        const next = cloneSub(sub);
        const prevNotBefore = next.retryNotBeforeMs;
        const prevDebtEpoch = next.resetDebtEpoch;
        const prevRequiredCdc = next.requiredCdcEpoch;
        const prevPhase = next.phase;
        const prevSubscribed = next.subscribed;
        const prevUncertain = next.uncertainRemoteRegistration;
        const res = transitionRemoteCdcSubscription(next, action);
        transitionsChecked += 1;

        const subMayHaveReg = action.type === REMOTE_CDC_EVENT.SUBSCRIBE_SETTLED &&
          (action.accepted || action.uncertainRemoteRegistration);
        const cleanupOk = action.type === REMOTE_CDC_EVENT.CLEANUP_SETTLED &&
          action.success === true;
        const cleanupFail = action.type === REMOTE_CDC_EVENT.CLEANUP_SETTLED &&
          action.success !== true;
        const nextMeta = {
          wasCancelled: meta.wasCancelled || action.type === REMOTE_CDC_EVENT.CANCEL,
          hadPossibleReg: meta.hadPossibleReg || subMayHaveReg,
          cleanupConfirmed: subMayHaveReg ? false : (meta.cleanupConfirmed || cleanupOk),
          cleanupFailures: meta.cleanupFailures + (cleanupFail ? 1 : 0),
        };

        if (action.type === REMOTE_CDC_EVENT.ORDINARY_CDC_DELIVERED &&
            sub.inFlightRefresh !== null) {
          observedOrdinaryCdcInRefresh += 1;
        }
        if (action.type === REMOTE_CDC_EVENT.CANCEL && prevUncertain && !prevSubscribed) {
          observedUncertainCancel += 1;
          assert.ok(res.effects.some((e) => e.type === REMOTE_CDC_EFFECT.SEND_REMOTE_UNSUBSCRIBE),
            'CANCEL after uncertain subscribe MUST emit SEND_REMOTE_UNSUBSCRIBE');
        }
        if (cleanupFail) {
          assert.equal(next.phase, REMOTE_CDC_PHASE.RETIRING, 'failed cleanup stays RETIRING');
          assert.ok(next.pendingCleanupBindings.length > 0, 'failed cleanup retains binding');
          assert.equal(hasOutstandingRemoteCdcObligation(next), true);
        }
        if (cleanupOk && meta.cleanupFailures > 0 && next.phase === REMOTE_CDC_PHASE.CLOSED) {
          observedCleanupRetryToClosed += 1;
        }
        if (subMayHaveReg &&
            (prevPhase === REMOTE_CDC_PHASE.RETIRING || prevPhase === REMOTE_CDC_PHASE.CLOSED)) {
          const unsubEffect = res.effects.find(
            (e) => e.type === REMOTE_CDC_EFFECT.SEND_REMOTE_UNSUBSCRIBE,
          );
          assert.ok(unsubEffect, 'retiring late subscribe MUST emit SEND_REMOTE_UNSUBSCRIBE');
          assert.equal(unsubEffect.binding.subscriberId, action.binding.subscriberId);
        }
        if (action.type === REMOTE_CDC_EVENT.REFRESH_SETTLED && action.authoritative &&
            !meta.wasCancelled &&
            (action.attempt.coversResetDebtEpoch < prevDebtEpoch ||
              action.attempt.coversCdcEpoch < prevRequiredCdc)) {
          assert.equal(res.settled, false, 'older refresh cannot settle newer debt or CDC epoch');
          assert.equal(next.phase, REMOTE_CDC_PHASE.CATCHING_UP);
        }
        if (action.type === REMOTE_CDC_EVENT.SUBSCRIBE_SETTLED && !action.accepted &&
            !meta.wasCancelled) {
          assert.ok(next.retryNotBeforeMs >= prevNotBefore, 'retryNotBeforeMs must be monotonic');
          if (action.retryAfterMs) {
            assert.ok(
              next.retryNotBeforeMs >= action.nowMs + action.retryAfterMs,
              'honors retryAfterMs',
            );
          }
        }

        const key = stateKey(next, nextMeta);
        if (!visited.has(key)) {
          visited.add(key);
          queue.push({sub: next, depth: depth + 1, meta: nextMeta});
        }
      }
    }

    for (const phase of Object.values(REMOTE_CDC_PHASE)) {
      assert.ok(observedPhases.has(phase), `BFS explored phase ${phase}`);
    }
    assert.ok(observedOrdinaryCdcInRefresh > 0, 'BFS explored ORDINARY_CDC_DELIVERED during refreshInFlight');
    assert.ok(observedUncertainCancel > 0, 'BFS explored SUBSCRIBE_SETTLED(uncertain) -> CANCEL');
    assert.ok(observedCleanupRetryToClosed > 0, 'BFS explored CLEANUP_SETTLED(failed -> retry -> ok)');
    assert.ok(visited.size >= 150, `explored ${visited.size} distinct reachable lifecycle states`);
    assert.ok(transitionsChecked >= 400, `verified ${transitionsChecked} lifecycle transitions`);
  });
});
