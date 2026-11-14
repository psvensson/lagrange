import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TABLES} from '../../src/constants/index.js';
import {createLiveQueryStartupWiring} from
  '../../src/live-query/live-query-startup-wiring.js';

function createMockSystemCache(partitions = []) {
  const listeners = new Set();

  return {
    listeners,
    onCacheChange(listener) {
      listeners.add(listener);
    },
    offCacheChange(listener) {
      return listeners.delete(listener);
    },
    emitCacheChange(tableName, operation, record) {
      for (const listener of listeners) {
        listener(tableName, operation, record);
      }
    },
    get(tableName, key) {
      if (tableName === TABLES.PARTITIONS) {
        return partitions.find((partition) => {
          return partition.partition_id === key;
        }) || null;
      }
      if (tableName === TABLES.TABLES) {
        return {
          table_name: key,
          primary_key: 'id',
        };
      }
      return null;
    },
    find(tableName, predicate) {
      if (tableName !== TABLES.TABLES) {
        return null;
      }
      const row = {
        table_name: 'orders',
        primary_key: 'id',
      };
      return predicate(row) ? row : null;
    },
    filter(tableName, predicate) {
      if (tableName !== TABLES.PARTITIONS) {
        return [];
      }
      return partitions.filter(predicate);
    },
  };
}

function createMockClient(clientId = 'client-1') {
  const messages = [];
  return {
    id: clientId,
    messages,
    send: (payload) => {
      messages.push(JSON.parse(payload));
    },
  };
}

describe('live query startup wiring', () => {
  it('initializes manager and cleanup in one startup-owned path', () => {
    const cache = createMockSystemCache();
    const sqlQueryEngine = {executeQuery: async () => ({results: []})};

    const wiring = createLiveQueryStartupWiring({
      nodeId: 'node-1',
      systemTableCache: cache,
      sqlQueryEngine,
    });

    assert.ok(wiring.liveQueryManager);
    assert.equal(wiring.liveQueryManager.isInitialized(), true);
    assert.equal(wiring.liveQueryManager.systemCache, cache);
    assert.equal(wiring.liveQueryManager.sqlQueryEngine, sqlQueryEngine);

    wiring.shutdown();
    assert.equal(wiring.liveQueryManager.isInitialized(), false);
  });

  it('routes cache CDC changes into live query subscriptions', async () => {
    const cache = createMockSystemCache([
      {
        partition_id: 'partition-orders',
        table_name: 'orders',
        partition_key_start: null,
        partition_key_end: null,
      },
    ]);
    const wiring = createLiveQueryStartupWiring({
      nodeId: 'node-2',
      systemTableCache: cache,
      sqlQueryEngine: null,
    });

    const client = createMockClient('client-live');
    await wiring.liveQueryManager.registerLiveQuery({
      from: {name: 'orders'},
      where: {
        type: 'binary',
        operator: '=',
        left: {type: 'column_ref', column: 'id'},
        right: {type: 'literal', value: 7},
      },
    }, client);

    cache.emitCacheChange('orders', 'INSERT', {
      id: 7,
      status: 'ready',
    });

    assert.equal(client.messages.length, 1);
    assert.equal(client.messages[0].type, 'insert');
    assert.equal(client.messages[0].row.id, 7);

    wiring.shutdown();
  });

  it('removes cache listener on shutdown', () => {
    const cache = createMockSystemCache();
    const wiring = createLiveQueryStartupWiring({
      nodeId: 'node-3',
      systemTableCache: cache,
      sqlQueryEngine: null,
    });

    assert.equal(cache.listeners.size, 1);
    wiring.shutdown();
    assert.equal(cache.listeners.size, 0);
  });

  it('entrypoint wires live query manager in both startup branches', () => {
    const indexSource = readFileSync('src/lagrange-runtime-startup.js', 'utf8');
    const compositionSource = readFileSync(
      'src/entrypoint-runtime-admin-composition.js',
      'utf8',
    );
    const startupWiringCalls =
      compositionSource.match(/createLiveQueryStartupWiring\(/g) || [];
    const adminCompositionCalls =
      indexSource.match(/startAdminRuntimeComposition\(/g) || [];
    const managerOptions =
      `${indexSource}\n${compositionSource}`.match(/liveQueryManager\s*[:,]/g) ||
      [];

    assert.equal(startupWiringCalls.length, 1);
    assert.ok(adminCompositionCalls.length >= 2);
    assert.ok(managerOptions.length >= 1);
  });

  // The partition's one subscriber contract (quest cdc-obligation-range-shipping,
  // record S-3): the subscriber live query registers on a partition is handed
  // (events, deliveryContext), events an ordered vector.
  describe('partition CDC subscriber', () => {
    async function subscribedHandler(handler) {
      let partitionSubscriber = null;
      const partition = {
        async subscribeToCDCWithHandshake(subscriber, options) {
          partitionSubscriber = subscriber;
          return {subscriberId: options.subscriberId, versionContext: {streamVersion: 0}};
        },
        unsubscribeFromCDC() {},
      };
      const wiring = createLiveQueryStartupWiring({
        nodeId: 'node-vector',
        systemTableCache: createMockSystemCache([]),
        sqlQueryEngine: null,
        partitions: new Map([['orders-p1', partition]]),
      });
      await wiring.liveQueryManager.subscribeToPartition('orders-p1', 'query-1', handler, {});
      return {partitionSubscriber, wiring};
    }

    it('hands every member of a vector to the query handler in order, normalized, and ' +
      'waits for each before the next', async () => {
      const seen = [];
      let running = 0;
      const {partitionSubscriber, wiring} = await subscribedHandler(async (change) => {
        running += 1;
        assert.equal(running, 1, 'members are handled one at a time, in order');
        await Promise.resolve();
        seen.push(change);
        running -= 1;
        return {handled: change.data?.id ?? change.old_data?.id};
      });
      const events = Object.freeze([
        {tableName: 'orders', operation: 'insert', data: {id: 'o-1'}, sequenceNumber: 7},
        {tableName: 'orders', operation: 'UPDATE', data: {id: 'o-1', total: 2},
          sourcePartition: 'orders-p1', timestamp: '1000:0:n'},
        {tableName: 'orders', operation: 'DELETE', data: {id: 'o-1'}},
      ]);
      const answer = await partitionSubscriber(events, null);
      assert.deepEqual(seen.map((change) => [change.operation, change.partitionId,
        change.data, change.old_data, change.sequenceNumber, change.hlc_timestamp]), [
        ['INSERT', 'orders-p1', {id: 'o-1'}, null, 7, null],
        ['UPDATE', 'orders-p1', {id: 'o-1', total: 2}, null, null, '1000:0:n'],
        ['DELETE', 'orders-p1', null, {id: 'o-1'}, null, null],
      ]);
      assert.deepEqual(answer, {handled: 'o-1'}, 'the answer is the handler\'s for the last member');
      wiring.shutdown();
    });

    it('a vector of one, as the non-durable producer hands it, reaches the handler ' +
      'synchronously and keeps the handler\'s answer', async () => {
      const seen = [];
      const {partitionSubscriber, wiring} = await subscribedHandler((change) => {
        seen.push(change.data.id);
        return {success: false, reason: 'handler-refusal'};
      });
      const pending = partitionSubscriber(Object.freeze([
        {tableName: 'orders', operation: 'INSERT', data: {id: 'o-9'}}]));
      assert.deepEqual(seen, ['o-9'], 'the handler ran before the subscriber yielded');
      assert.deepEqual(await pending, {success: false, reason: 'handler-refusal'});
      wiring.shutdown();
    });
  });
});
