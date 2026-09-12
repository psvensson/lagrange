import assert from 'node:assert/strict';

import {
  observeLagrangeNewOrderContentionState,
} from '../../test/distributed/reference-client/lagrange-new-order-contention-observer.js';

const queries = [];
const clientConfig = [];
let connectCount = 0;
let endCount = 0;

function createClient(config) {
  clientConfig.push(config);
  return {
    async connect() {
      connectCount += 1;
    },
    async end() {
      endCount += 1;
    },
    async query(sql, parameters) {
      queries.push({sql, parameters});
      if (sql.startsWith('SELECT next_order_id')) {
        return {rows: [{next_order_id: '3'}]};
      }
      if (sql.startsWith('SELECT order_id FROM orders')) {
        return {rows: [{order_id: '1'}, {order_id: '2'}]};
      }
      if (sql.startsWith('SELECT order_id FROM new_order')) {
        return {rows: [{order_id: '1'}, {order_id: '2'}]};
      }
      if (sql.startsWith('SELECT order_id, COUNT(*)')) {
        return {
          rows: [
            {order_id: '1', line_count: '2'},
            {order_id: '2', line_count: '3'},
          ],
        };
      }
      if (sql.startsWith('SELECT warehouse_id, item_id')) {
        return {
          rows: [
            {
              warehouse_id: '1',
              item_id: '1',
              quantity: '47',
              ytd_quantity: '3',
              order_count: '1',
              remote_count: '0',
            },
            {
              warehouse_id: '1',
              item_id: '2',
              quantity: '44',
              ytd_quantity: '6',
              order_count: '2',
              remote_count: '0',
            },
          ],
        };
      }
      throw new Error(`unexpected observer SQL: ${sql}`);
    },
  };
}

const observation = await observeLagrangeNewOrderContentionState({
  endpoint: {host: '127.0.0.1', port: 5432},
  connection: {
    user: 'benchmark-user',
    password: 'benchmark-password',
    database: 'benchmark-db',
    ssl: false,
  },
  itemIds: [2, 1, 2],
  createClient,
});

assert.deepEqual(observation, {
  districtNextOrderId: 3,
  orderIds: [1, 2],
  newOrderIds: [1, 2],
  orderLineCountByOrderId: {'1': 2, '2': 3},
  stockRows: [
    {
      warehouseId: 1,
      itemId: 1,
      quantity: 47,
      ytdQuantity: 3,
      orderCount: 1,
      remoteCount: 0,
    },
    {
      warehouseId: 1,
      itemId: 2,
      quantity: 44,
      ytdQuantity: 6,
      orderCount: 2,
      remoteCount: 0,
    },
  ],
});
assert.equal(connectCount, 1);
assert.equal(endCount, 1);
assert.equal(clientConfig.length, 1);
assert.deepEqual(clientConfig[0], {
  host: '127.0.0.1',
  port: 5432,
  user: 'benchmark-user',
  password: 'benchmark-password',
  database: 'benchmark-db',
  ssl: false,
  connectionTimeoutMillis: 10000,
});
assert.equal(queries.length, 5);
assert.deepEqual(queries[0].parameters, [1, 1]);
assert.deepEqual(queries[4].parameters, [1, 1, 2]);
for (const {sql} of queries) assert.match(sql, /^SELECT /u);

await assert.rejects(
  observeLagrangeNewOrderContentionState({
    endpoint: {host: '', port: 5432},
    connection: {user: 'u', database: 'd'},
    itemIds: [1],
    createClient,
  }),
  /requires endpoint.host/u,
);
await assert.rejects(
  observeLagrangeNewOrderContentionState({
    endpoint: {host: '127.0.0.1', port: 5432},
    connection: {user: 'u', database: 'd'},
    itemIds: [0],
    createClient,
  }),
  /itemIds must be positive integers/u,
);

console.log(
  'lagrange-new-order-contention-observer-guard: PASS ' +
  JSON.stringify({queries: queries.length}),
);
