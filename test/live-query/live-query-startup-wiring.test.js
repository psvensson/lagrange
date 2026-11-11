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
      // This node hosts no replica of the partition: it observes the cache.
      partitionServicesProvider: () => new Map(),
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
    assert.equal(client.messages[0].data.id, 7);

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

  // A partition of an obligation-recording (system) table delivers durable
  // vectors that every subscriber must acknowledge with a committed receipt;
  // a live query registered there could never answer and would hold the
  // partition's whole delivery lane. The wiring therefore never registers a
  // live query on such a partition: it observes through the cache. A user
  // table's partition is found among the node's hosted replicas (the
  // production provider is keyed by replica id) by its partition id.
  it('never registers a live query on an obligation-recording partition', async () => {
    const registered = [];
    const partitionOf = (tableName, partitionId) => ({
      tableName, partitionId,
      async subscribeToCDCWithHandshake(handler, options) {
        registered.push({tableName, subscriberId: options.subscriberId});
        return {status: 'ok', subscriberId: options.subscriberId};
      },
    });
    const hosted = new Map([
      ['nodes-p1-r1', partitionOf(TABLES.NODES, 'nodes-p1')],
      ['services-p1-r1', partitionOf(TABLES.SERVICES, 'services-p1')],
      ['partition-orders-r2', partitionOf('orders', 'partition-orders')],
    ]);
    const cache = createMockSystemCache([
      {partition_id: 'nodes-p1', table_name: TABLES.NODES},
      {partition_id: 'partition-orders', table_name: 'orders'},
    ]);
    const wiring = createLiveQueryStartupWiring({
      nodeId: 'node-4',
      systemTableCache: cache,
      sqlQueryEngine: null,
      partitionServicesProvider: () => hosted,
    });
    const observed = [];
    const subscribe = wiring.liveQueryManager.subscribeToPartition;

    await subscribe('nodes-p1', 'query-system', (change) => observed.push(change));
    await subscribe('services-p1', 'query-system', () => {});
    assert.deepEqual(registered, [], 'no registration on a system-table partition');
    await subscribe('partition-orders', 'query-user', () => {});
    assert.deepEqual(registered, [{tableName: 'orders', subscriberId: 'query-user'}],
      'a user-table partition (ordinary events), found by partition id, is subscribed');

    cache.emitCacheChange(TABLES.NODES, 'UPDATE', {partition_id: 'nodes-p1', node_id: 'n-1'});
    assert.equal(observed.length, 1, 'the system-table live query observes through the cache');
    wiring.shutdown();
  });

  // The node's hosted replicas are the one provider of a partition. A
  // provider that answers nothing is a typed refusal, never a quieter path.
  it('refuses a subscription typed when the hosted-partition provider is unavailable',
    async () => {
      const cache = createMockSystemCache([
        {partition_id: 'partition-orders', table_name: 'orders'},
      ]);
      const subscribeWith = (partitionServicesProvider) => createLiveQueryStartupWiring({
        nodeId: 'node-5', systemTableCache: cache, sqlQueryEngine: null,
        partitionServicesProvider,
      });
      for (const wiring of [subscribeWith(undefined), subscribeWith(() => null)]) {
        const observed = [];
        await assert.rejects(
          wiring.liveQueryManager.subscribeToPartition(
            'partition-orders', 'query-1', (change) => observed.push(change)),
          {code: 'LIVE_QUERY_PARTITION_PROVIDER_UNAVAILABLE'},
          'an unavailable provider is not read as "not hosted here"');
        cache.emitCacheChange('orders', 'INSERT', {id: 1});
        assert.deepEqual(observed, [], 'a refused subscription observes nothing');
        wiring.shutdown();
      }
    });

  // A hosted partition delivers its own CDC envelope (tableName, operation,
  // timestamp, sourcePartition, data); the wiring hands the query group one
  // change shape: operation, data (the deleted row on a DELETE),
  // hlc_timestamp. Unsubscribe retires exactly
  // the handler it registered, on the partition it registered it on.
  it('normalizes a hosted partition event to one change shape and retires its handler',
    async () => {
      const handlers = new Set();
      const partition = {
        tableName: 'orders', partitionId: 'partition-orders',
        async subscribeToCDCWithHandshake(handler, options) {
          handlers.add(handler);
          return {status: 'ok', subscriberId: options.subscriberId};
        },
        unsubscribeFromCDC(handler) {
          handlers.delete(handler);
        },
      };
      const cache = createMockSystemCache([
        {partition_id: 'partition-orders', table_name: 'orders'},
      ]);
      const wiring = createLiveQueryStartupWiring({
        nodeId: 'node-6', systemTableCache: cache, sqlQueryEngine: null,
        partitionServicesProvider: () => new Map([['partition-orders-r1', partition]]),
      });
      const changes = [];
      await wiring.liveQueryManager.subscribeToPartition(
        'partition-orders', 'query-1', (change) => changes.push(change));
      assert.equal(handlers.size, 1);
      const [delivered] = handlers;
      delivered({tableName: 'orders', operation: 'delete', timestamp: '7:0:n1',
        sourcePartition: 'partition-orders', data: {id: 3}});
      assert.equal(changes.length, 1);
      const [change] = changes;
      assert.equal(change.operation, 'DELETE');
      assert.deepEqual(change.data, {id: 3}, 'a DELETE names its deleted row as data');
      assert.equal(change.hlc_timestamp, '7:0:n1');
      assert.equal(change.partitionId, 'partition-orders');
      assert.equal(Object.hasOwn(change, 'old_data'), false, 'one row field');
      await wiring.liveQueryManager.unsubscribeFromPartition('partition-orders', 'query-1');
      assert.equal(handlers.size, 0, 'the registered handler was retired');
      wiring.shutdown();
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
});
