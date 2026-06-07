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
    const indexSource = readFileSync('src/index.js', 'utf8');
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
