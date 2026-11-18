/**
 * A system-table cache change names only the row an UPDATE or UPSERT leaves;
 * the row before it is not part of the cache's change notification. A live
 * query therefore decides whether the row was in its result from its own
 * result set (the snapshot plus the changes since), never from a previous
 * row fabricated out of the current one.
 *
 * A row updated out of the query's predicate is a removal carrying the row
 * the subscriber held; a row updated into it is an addition; a row that stays
 * is an update whose oldData is the row the subscriber held.
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {TABLES} from '../../src/constants/index.js';
import {createLiveQueryStartupWiring} from
  '../../src/live-query/live-query-startup-wiring.js';

const TABLE = 'orders';
const PARTITION_ID = 'partition-orders';
const ID_KEYED = Object.freeze({primary_key: 'id'});

function createCache(tableKey = ID_KEYED) {
  const listeners = new Set();
  return {
    onCacheChange: (listener) => listeners.add(listener),
    offCacheChange: (listener) => listeners.delete(listener),
    emit(operation, record) {
      for (const listener of listeners) listener(TABLE, operation, record);
    },
    get(tableName, key) {
      if (tableName === TABLES.PARTITIONS && key === PARTITION_ID) {
        return {partition_id: PARTITION_ID, table_name: TABLE,
          partition_key_start: null, partition_key_end: null};
      }
      if (tableName === TABLES.TABLES) return {table_name: key, ...tableKey};
      return null;
    },
    find: () => null,
    filter: (tableName, predicate) => tableName === TABLES.PARTITIONS ?
      [{partition_id: PARTITION_ID, table_name: TABLE,
        partition_key_start: null, partition_key_end: null}].filter(predicate) :
      [],
  };
}

async function subscribeActiveOrders(snapshotRows, tableKey = ID_KEYED) {
  const cache = createCache(tableKey);
  const wiring = createLiveQueryStartupWiring({
    nodeId: 'node-membership',
    systemTableCache: cache,
    sqlQueryEngine: {executeQuery: async () => ({rows: snapshotRows})},
    partitionServicesProvider: () => new Map(),
  });
  const changes = [];
  const client = {
    id: 'client-membership',
    send: (payload) => {
      const event = JSON.parse(payload);
      if (event.type !== 'snapshot') changes.push(event);
    },
  };
  await wiring.liveQueryManager.registerLiveQuery({
    from: {name: TABLE},
    where: {
      type: 'binary',
      operator: '=',
      left: {type: 'column_ref', column: 'status'},
      right: {type: 'literal', value: 'active'},
    },
  }, client);
  return {cache, wiring, changes};
}

describe('live query membership on a cache UPDATE/UPSERT', () => {
  it('a row updated out of the predicate is removed with the row held', async () => {
    const held = {id: 1, status: 'active', amount: 5};
    const {cache, wiring, changes} = await subscribeActiveOrders([held]);
    cache.emit('UPDATE', {id: 1, status: 'done', amount: 5});
    assert.deepEqual(changes.map((event) => event.type), ['delete']);
    assert.deepEqual(changes[0].data, held, 'the removal names the row held');
    wiring.shutdown();
  });

  it('a row updated into the predicate is added', async () => {
    const {cache, wiring, changes} = await subscribeActiveOrders([]);
    cache.emit('UPDATE', {id: 2, status: 'active'});
    assert.deepEqual(changes.map((event) => event.type), ['insert']);
    assert.deepEqual(changes[0].data, {id: 2, status: 'active'});
    assert.equal(Object.hasOwn(changes[0], 'oldData'), false);
    wiring.shutdown();
  });

  it('an UPSERT entering the predicate is added', async () => {
    const {cache, wiring, changes} = await subscribeActiveOrders([]);
    cache.emit('UPSERT', {id: 3, status: 'active'});
    assert.deepEqual(changes.map((event) => event.type), ['insert']);
    wiring.shutdown();
  });

  it('a row staying in the predicate is an update from the row held', async () => {
    const held = {id: 4, status: 'active', amount: 1};
    const {cache, wiring, changes} = await subscribeActiveOrders([held]);
    cache.emit('UPSERT', {id: 4, status: 'active', amount: 2});
    assert.deepEqual(changes.map((event) => event.type), ['update']);
    assert.deepEqual(changes[0].oldData, held);
    assert.deepEqual(changes[0].data, {id: 4, status: 'active', amount: 2});
    wiring.shutdown();
  });

  it('a row outside the predicate that stays outside produces nothing', async () => {
    const {cache, wiring, changes} = await subscribeActiveOrders([]);
    cache.emit('UPDATE', {id: 5, status: 'done'});
    assert.deepEqual(changes, []);
    wiring.shutdown();
  });
});

// A row's identity in the result is its table's declared primary key, every
// column of it, and nothing else: no other column stands in for a missing key.
describe('live query row identity is the declared primary key', () => {
  it('a composite key names one row by all of its columns', async () => {
    const first = {order_id: 1, item_id: 1, status: 'active', note: 'a'};
    const second = {order_id: 1, item_id: 2, status: 'active', note: 'b'};
    const {cache, wiring, changes} = await subscribeActiveOrders([first, second],
      {primary_key: 'order_id,item_id'});
    cache.emit('UPDATE', {order_id: 1, item_id: 1, status: 'active', note: 'a2'});
    assert.deepEqual(changes.map((event) => event.type), ['update']);
    assert.deepEqual(changes[0].oldData, first, 'the row held under the whole key');
    wiring.shutdown();
  });

  it('a changed row lacking its key ends the subscription with a named error', async () => {
    const held = {order_id: 7, id: 99, status: 'active'};
    const {cache, wiring, changes} = await subscribeActiveOrders([held],
      {primary_key: 'order_id'});
    cache.emit('UPDATE', {id: 99, status: 'done'});
    assert.deepEqual(changes.map((event) => event.type), ['error']);
    assert.match(changes[0].error, /lacks primary key column 'order_id'/);
    cache.emit('UPDATE', {order_id: 7, id: 99, status: 'done'});
    assert.equal(changes.length, 1, 'an ended subscription sends nothing more');
    wiring.shutdown();
  });

  it('a snapshot row lacking its key refuses the registration, typed', async () => {
    await assert.rejects(
      subscribeActiveOrders([{id: 99, status: 'active'}], {primary_key: 'order_id'}),
      {code: 'LIVE_QUERY_ROW_KEY_MISSING', table: TABLE, column: 'order_id'});
  });
});
