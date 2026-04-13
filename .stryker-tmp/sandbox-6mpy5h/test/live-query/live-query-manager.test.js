/**
 * Tests for LiveQueryManager - Query grouping and CDC subscriptions.
 * Requirements: 33.4, 33.5, 33.6, 33.7, 33.8, 33.9, 33.10, 33.11, 33.12
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {LiveQueryManager, QueryGroup} from '../../src/live-query/live-query-manager.js';

// Mock system cache
function createMockSystemCache(partitions = []) {
  return {
    get: (table, key) => {
      if (table === 'tables') {
        return {table_name: key, primary_key: 'id'};
      }
      return null;
    },
    find: (table, _predicate) => {
      if (table === 'tables') {
        return {table_name: 'orders', primary_key: 'customer_id'};
      }
      return null;
    },
    filter: (table, _predicate) => {
      if (table === 'partitions') {
        return partitions;
      }
      return [];
    },
  };
}

// Mock client
function createMockClient(id = 'client-1') {
  const messages = [];
  return {
    id,
    messages,
    send: (msg) => messages.push(JSON.parse(msg)),
  };
}

test('QueryGroup - creates with parsed query', async (t) => {
  const parsedQuery = {
    type: 'SELECT',
    from: {name: 'orders'},
    where: {
      type: 'binary',
      operator: '=',
      left: {type: 'column_ref', column: 'id'},
      right: {type: 'literal', value: 1},
    },
  };

  const group = new QueryGroup({parsedQuery});

  t.ok(group.queryId, 'should have queryId');
  t.equal(group.table, 'orders', 'should extract table');
  t.ok(group.predicate, 'should have predicate');
});

test('QueryGroup - adds and removes clients', async (t) => {
  const group = new QueryGroup({
    parsedQuery: {from: {name: 'test'}},
  });

  const client1 = createMockClient('c1');
  const client2 = createMockClient('c2');

  group.addClient(client1);
  t.equal(group.clients.size, 1, 'should have 1 client');

  group.addClient(client2);
  t.equal(group.clients.size, 2, 'should have 2 clients');

  const shouldRemove = group.removeClient('c1');
  t.equal(shouldRemove, false, 'should not remove group');
  t.equal(group.clients.size, 1, 'should have 1 client');

  const shouldRemove2 = group.removeClient('c2');
  t.equal(shouldRemove2, true, 'should remove group');
  t.equal(group.clients.size, 0, 'should have 0 clients');
});


test('QueryGroup - renews client subscription', async (t) => {
  const group = new QueryGroup({
    parsedQuery: {from: {name: 'test'}},
  });

  const client = createMockClient('c1');
  group.addClient(client);

  const result = group.renewClient('c1', 'cursor-123');

  t.ok(result, 'should return result');
  t.equal(result.queryId, group.queryId, 'should have queryId');
  t.ok(result.expiresAt > Date.now(), 'should have future expiry');
});

test('QueryGroup - detects expired subscriptions', async (t) => {
  const group = new QueryGroup({
    parsedQuery: {from: {name: 'test'}},
  });

  const client = createMockClient('c1');
  group.addClient(client);

  // Set TTL to very short and backdate renewal
  const subscription = group.clients.get('c1');
  subscription.ttlMs = 10;
  subscription.lastRenewal = Date.now() - 100;

  const expired = group.getExpiredClients();
  t.same(expired, ['c1'], 'should detect expired client');
});

test('QueryGroup - finds partitions for key value', async (t) => {
  const partitions = [
    {partition_id: 'p1', table_name: 'orders', partition_key_start: null, partition_key_end: 100},
    {partition_id: 'p2', table_name: 'orders', partition_key_start: 100, partition_key_end: 200},
    {partition_id: 'p3', table_name: 'orders', partition_key_start: 200, partition_key_end: null},
  ];

  const group = new QueryGroup({
    parsedQuery: {
      from: {name: 'orders'},
      where: {
        type: 'binary',
        operator: '=',
        left: {type: 'column_ref', column: 'id'},
        right: {type: 'literal', value: 150},
      },
    },
    systemCache: createMockSystemCache(partitions),
  });

  // Set partition key column
  group.partitionKeyColumn = 'id';

  const found = await group.findPartitionsForQuery();

  t.equal(found.size, 1, 'should find 1 partition');
  t.ok(found.has('p2'), 'should find partition p2');
});

test('QueryGroup - finds all partitions when no key filter', async (t) => {
  const partitions = [
    {partition_id: 'p1', table_name: 'orders', partition_key_start: null, partition_key_end: 100},
    {partition_id: 'p2', table_name: 'orders', partition_key_start: 100, partition_key_end: null},
  ];

  const group = new QueryGroup({
    parsedQuery: {
      from: {name: 'orders'},
      where: {
        type: 'binary',
        operator: '=',
        left: {type: 'column_ref', column: 'status'},
        right: {type: 'literal', value: 'active'},
      },
    },
    systemCache: createMockSystemCache(partitions),
  });

  group.partitionKeyColumn = 'id';

  const found = await group.findPartitionsForQuery();

  t.equal(found.size, 2, 'should find all partitions');
});

test('QueryGroup - evaluates CDC INSERT event', async (t) => {
  const group = new QueryGroup({
    parsedQuery: {
      from: {name: 'orders'},
      where: {
        type: 'binary',
        operator: '>',
        left: {type: 'column_ref', column: 'amount'},
        right: {type: 'literal', value: 100},
      },
    },
  });

  const result = group.evaluateChange({
    operation: 'INSERT',
    data: {id: 1, amount: 150},
    hlc_timestamp: '123:0:node1',
  });

  t.ok(result, 'should produce result');
  t.equal(result.type, 'insert', 'should be insert');
  t.same(result.row, {id: 1, amount: 150}, 'should have row');
});

test('QueryGroup - ignores non-matching INSERT', async (t) => {
  const group = new QueryGroup({
    parsedQuery: {
      from: {name: 'orders'},
      where: {
        type: 'binary',
        operator: '>',
        left: {type: 'column_ref', column: 'amount'},
        right: {type: 'literal', value: 100},
      },
    },
  });

  const result = group.evaluateChange({
    operation: 'INSERT',
    data: {id: 1, amount: 50},
    hlc_timestamp: '123:0:node1',
  });

  t.equal(result, null, 'should not produce result');
});

test('QueryGroup - evaluates UPDATE entering predicate', async (t) => {
  const group = new QueryGroup({
    parsedQuery: {
      from: {name: 'orders'},
      where: {
        type: 'binary',
        operator: '=',
        left: {type: 'column_ref', column: 'status'},
        right: {type: 'literal', value: 'active'},
      },
    },
  });

  const result = group.evaluateChange({
    operation: 'UPDATE',
    data: {id: 1, status: 'active'},
    old_data: {id: 1, status: 'pending'},
    hlc_timestamp: '123:0:node1',
  });

  t.ok(result, 'should produce result');
  t.equal(result.type, 'insert', 'should be insert (entering predicate)');
});

test('QueryGroup - evaluates UPDATE exiting predicate', async (t) => {
  const group = new QueryGroup({
    parsedQuery: {
      from: {name: 'orders'},
      where: {
        type: 'binary',
        operator: '=',
        left: {type: 'column_ref', column: 'status'},
        right: {type: 'literal', value: 'active'},
      },
    },
  });

  const result = group.evaluateChange({
    operation: 'UPDATE',
    data: {id: 1, status: 'completed'},
    old_data: {id: 1, status: 'active'},
    hlc_timestamp: '123:0:node1',
  });

  t.ok(result, 'should produce result');
  t.equal(result.type, 'delete', 'should be delete (exiting predicate)');
});

test('QueryGroup - evaluates UPDATE staying in predicate', async (t) => {
  const group = new QueryGroup({
    parsedQuery: {
      from: {name: 'orders'},
      where: {
        type: 'binary',
        operator: '=',
        left: {type: 'column_ref', column: 'status'},
        right: {type: 'literal', value: 'active'},
      },
    },
  });

  const result = group.evaluateChange({
    operation: 'UPDATE',
    data: {id: 1, status: 'active', amount: 200},
    old_data: {id: 1, status: 'active', amount: 100},
    hlc_timestamp: '123:0:node1',
  });

  t.ok(result, 'should produce result');
  t.equal(result.type, 'update', 'should be update');
  t.ok(result.old, 'should have old row');
  t.ok(result.new, 'should have new row');
});

test('QueryGroup - evaluates DELETE event', async (t) => {
  const group = new QueryGroup({
    parsedQuery: {
      from: {name: 'orders'},
      where: {
        type: 'binary',
        operator: '=',
        left: {type: 'column_ref', column: 'status'},
        right: {type: 'literal', value: 'active'},
      },
    },
  });

  const result = group.evaluateChange({
    operation: 'DELETE',
    old_data: {id: 1, status: 'active'},
    hlc_timestamp: '123:0:node1',
  });

  t.ok(result, 'should produce result');
  t.equal(result.type, 'delete', 'should be delete');
});

test('QueryGroup - fans out CDC events to clients', async (t) => {
  const group = new QueryGroup({
    parsedQuery: {
      from: {name: 'orders'},
      where: null, // Match all
    },
  });

  const client1 = createMockClient('c1');
  const client2 = createMockClient('c2');

  group.addClient(client1);
  group.addClient(client2);

  group.handleCDCEvent({
    operation: 'INSERT',
    data: {id: 1, name: 'test'},
    hlc_timestamp: '123:0:node1',
  });

  t.equal(client1.messages.length, 1, 'client1 should receive message');
  t.equal(client2.messages.length, 1, 'client2 should receive message');
  t.equal(client1.messages[0].type, 'insert', 'should be insert');
});


test('LiveQueryManager - registers live query', async (t) => {
  const manager = new LiveQueryManager({
    systemCache: createMockSystemCache([
      {
        partition_id: 'p1', table_name: 'orders',
        partition_key_start: null,
        partition_key_end: null,
      },
    ]),
    nodeId: 'test-node',
  });

  manager.initialize({
    subscribeToPartition: async () => {},
    unsubscribeFromPartition: async () => {},
  });

  const client = createMockClient('c1');
  const parsedQuery = {
    from: {name: 'orders'},
    where: null,
  };

  const result = await manager.registerLiveQuery(parsedQuery, client);

  t.ok(result.queryId, 'should have queryId');
  t.ok(result.expiresAt > Date.now(), 'should have future expiry');
  t.equal(manager.queryGroups.size, 1, 'should have 1 group');

  manager.shutdown();
});

test('LiveQueryManager - groups identical queries', async (t) => {
  const manager = new LiveQueryManager({
    systemCache: createMockSystemCache([
      {
        partition_id: 'p1', table_name: 'orders',
        partition_key_start: null,
        partition_key_end: null,
      },
    ]),
    nodeId: 'test-node',
  });

  manager.initialize({
    subscribeToPartition: async () => {},
    unsubscribeFromPartition: async () => {},
  });

  const client1 = createMockClient('c1');
  const client2 = createMockClient('c2');
  const parsedQuery = {
    from: {name: 'orders'},
    where: {
      type: 'binary',
      operator: '=',
      left: {type: 'column_ref', column: 'status'},
      right: {type: 'literal', value: 'active'},
    },
  };

  const result1 = await manager.registerLiveQuery(parsedQuery, client1);
  const result2 = await manager.registerLiveQuery(parsedQuery, client2);

  t.equal(result1.queryId, result2.queryId, 'should share same queryId');
  t.equal(manager.queryGroups.size, 1, 'should have 1 group');

  const group = manager.queryGroups.values().next().value;
  t.equal(group.clients.size, 2, 'group should have 2 clients');

  manager.shutdown();
});

test('LiveQueryManager - enforces query limit per client', async (t) => {
  const manager = new LiveQueryManager({
    systemCache: createMockSystemCache([
      {partition_id: 'p1', table_name: 'orders', partition_key_start: null,
        partition_key_end: null,
      },
    ]),
    nodeId: 'test-node',
  });

  manager.maxQueriesPerClient = 2;
  manager.initialize({
    subscribeToPartition: async () => {},
    unsubscribeFromPartition: async () => {},
  });

  const client = createMockClient('c1');

  // Register 2 queries (different predicates)
  await manager.registerLiveQuery({from: {name: 'orders'}, where: null}, client);
  await manager.registerLiveQuery({
    from: {name: 'orders'},
    where: {
      type: 'binary', operator: '=',
      left: {type: 'column_ref', column: 'id'},
      right: {type: 'literal', value: 1},
    },
  }, client);

  // Third should fail
  try {
    await manager.registerLiveQuery({
      from: {name: 'orders'},
      where: {
        type: 'binary', operator: '=',
        left: {type: 'column_ref', column: 'id'},
        right: {type: 'literal', value: 2},
      },
    }, client);
    t.fail('should throw');
  } catch (error) {
    t.match(error.message, /Maximum concurrent live queries exceeded/, 'should throw limit error');
  }

  manager.shutdown();
});

test('LiveQueryManager - renews subscription', async (t) => {
  const manager = new LiveQueryManager({
    systemCache: createMockSystemCache([
      {partition_id: 'p1', table_name: 'orders', partition_key_start: null,
        partition_key_end: null,
      },
    ]),
    nodeId: 'test-node',
  });

  manager.initialize({
    subscribeToPartition: async () => {},
    unsubscribeFromPartition: async () => {},
  });

  const client = createMockClient('c1');
  const result = await manager.registerLiveQuery({from: {name: 'orders'}}, client);

  const renewed = manager.renewLiveQuery(result.queryId, 'c1', 'cursor-123');

  t.ok(renewed, 'should return renewal result');
  t.ok(renewed.expiresAt > Date.now(), 'should have future expiry');

  manager.shutdown();
});

test('LiveQueryManager - unregisters subscription', async (t) => {
  const manager = new LiveQueryManager({
    systemCache: createMockSystemCache([
      {partition_id: 'p1', table_name: 'orders', partition_key_start: null,
        partition_key_end: null,
      },
    ]),
    nodeId: 'test-node',
  });

  manager.initialize({
    subscribeToPartition: async () => {},
    unsubscribeFromPartition: async () => {},
  });

  const client = createMockClient('c1');
  const result = await manager.registerLiveQuery({from: {name: 'orders'}}, client);

  manager.unregisterLiveQuery(result.queryId, 'c1');

  t.equal(manager.queryGroups.size, 0, 'should remove empty group');

  manager.shutdown();
});

test('LiveQueryManager - handles client disconnection', async (t) => {
  const manager = new LiveQueryManager({
    systemCache: createMockSystemCache([
      {partition_id: 'p1', table_name: 'orders', partition_key_start: null,
        partition_key_end: null,
      },
    ]),
    nodeId: 'test-node',
  });

  manager.initialize({
    subscribeToPartition: async () => {},
    unsubscribeFromPartition: async () => {},
  });

  const client = createMockClient('c1');
  await manager.registerLiveQuery({from: {name: 'orders'}}, client);
  await manager.registerLiveQuery({
    from: {name: 'orders'},
    where: {
      type: 'binary', operator: '=',
      left: {type: 'column_ref', column: 'id'},
      right: {type: 'literal', value: 1},
    },
  }, client);

  t.equal(manager.queryGroups.size, 2, 'should have 2 groups');

  manager.handleClientDisconnection('c1');

  t.equal(manager.queryGroups.size, 0, 'should remove all groups');
  t.equal(manager.clientSubscriptions.size, 0, 'should clear subscriptions');

  manager.shutdown();
});

test('LiveQueryManager - cleans up expired subscriptions', async (t) => {
  const manager = new LiveQueryManager({
    systemCache: createMockSystemCache([
      {partition_id: 'p1', table_name: 'orders', partition_key_start: null,
        partition_key_end: null,
      },
    ]),
    nodeId: 'test-node',
  });

  manager.cleanupIntervalMs = 100000; // Don't auto-run
  manager.initialize({
    subscribeToPartition: async () => {},
    unsubscribeFromPartition: async () => {},
  });

  const client = createMockClient('c1');
  await manager.registerLiveQuery({from: {name: 'orders'}}, client);

  // Expire the subscription
  const group = manager.queryGroups.values().next().value;
  const subscription = group.clients.get('c1');
  subscription.ttlMs = 10;
  subscription.lastRenewal = Date.now() - 100;

  // Manually trigger cleanup
  manager.cleanupExpiredSubscriptions();

  t.equal(manager.queryGroups.size, 0, 'should remove expired group');

  manager.shutdown();
});

test('LiveQueryManager - gets statistics', async (t) => {
  const manager = new LiveQueryManager({
    systemCache: createMockSystemCache([
      {partition_id: 'p1', table_name: 'orders', partition_key_start: null,
        partition_key_end: null,
      },
    ]),
    nodeId: 'test-node',
  });

  manager.initialize({
    subscribeToPartition: async () => {},
    unsubscribeFromPartition: async () => {},
  });

  const client1 = createMockClient('c1');
  const client2 = createMockClient('c2');

  await manager.registerLiveQuery({from: {name: 'orders'}}, client1);
  await manager.registerLiveQuery({from: {name: 'orders'}}, client2);

  const stats = manager.getStats();

  t.equal(stats.queryGroupCount, 1, 'should have 1 group');
  t.equal(stats.totalClientSubscriptions, 2, 'should have 2 subscriptions');
  t.equal(stats.uniqueClients, 2, 'should have 2 unique clients');

  manager.shutdown();
});


test('LiveQueryManager - handles partition topology change', async (t) => {
  let currentPartitions = [
    {partition_id: 'p1', table_name: 'orders', partition_key_start: null,
      partition_key_end: null,
    },
  ];

  const subscriptions = new Map();

  const manager = new LiveQueryManager({
    systemCache: {
      get: () => ({table_name: 'orders', primary_key: 'id'}),
      find: () => ({table_name: 'orders', primary_key: 'id'}),
      filter: () => currentPartitions,
    },
    nodeId: 'test-node',
  });

  manager.initialize({
    subscribeToPartition: async (partitionId, queryId, handler) => {
      subscriptions.set(partitionId, {queryId, handler});
    },
    unsubscribeFromPartition: async (partitionId) => {
      subscriptions.delete(partitionId);
    },
  });

  const client = createMockClient('c1');
  await manager.registerLiveQuery({from: {name: 'orders'}}, client);

  t.equal(subscriptions.size, 1, 'should have 1 subscription');
  t.ok(subscriptions.has('p1'), 'should subscribe to p1');

  // Simulate partition split
  currentPartitions = [
    {partition_id: 'p1a', table_name: 'orders', partition_key_start: null, partition_key_end: 100},
    {partition_id: 'p1b', table_name: 'orders', partition_key_start: 100, partition_key_end: null},
  ];

  await manager.handlePartitionTopologyChange({
    operation: 'INSERT',
    new: {partition_id: 'p1a', table_name: 'orders'},
  });

  t.equal(subscriptions.size, 2, 'should have 2 subscriptions after split');
  t.ok(subscriptions.has('p1a'), 'should subscribe to p1a');
  t.ok(subscriptions.has('p1b'), 'should subscribe to p1b');

  manager.shutdown();
});

test('QueryGroup - updates subscriptions on partition change', async (t) => {
  let currentPartitions = [
    {partition_id: 'p1', table_name: 'orders', partition_key_start: null,
      partition_key_end: null,
    },
  ];

  const subscriptions = new Map();

  const group = new QueryGroup({
    parsedQuery: {from: {name: 'orders'}},
    systemCache: {
      get: () => ({table_name: 'orders', primary_key: 'id'}),
      find: () => ({table_name: 'orders', primary_key: 'id'}),
      filter: () => currentPartitions,
    },
  });

  // Initial subscription
  await group.updatePartitionSubscriptions(
    async (partitionId, queryId, handler) => {
      subscriptions.set(partitionId, {queryId, handler});
    },
    async (partitionId) => {
      subscriptions.delete(partitionId);
    },
  );

  t.equal(group.subscribedPartitions.size, 1, 'should have 1 partition');
  t.ok(group.subscribedPartitions.has('p1'), 'should have p1');

  // Simulate merge - p1 and p2 become p3
  currentPartitions = [
    {partition_id: 'p3', table_name: 'orders', partition_key_start: null,
      partition_key_end: null,
    },
  ];

  await group.updatePartitionSubscriptions(
    async (partitionId, queryId, handler) => {
      subscriptions.set(partitionId, {queryId, handler});
    },
    async (partitionId) => {
      subscriptions.delete(partitionId);
    },
  );

  t.equal(group.subscribedPartitions.size, 1, 'should have 1 partition after merge');
  t.ok(group.subscribedPartitions.has('p3'), 'should have p3');
  t.notOk(group.subscribedPartitions.has('p1'), 'should not have p1');
});


test('LiveQueryManager - resumes from cursor', async (t) => {
  const manager = new LiveQueryManager({
    systemCache: createMockSystemCache([
      {partition_id: 'p1', table_name: 'orders', partition_key_start: null,
        partition_key_end: null,
      },
    ]),
    nodeId: 'test-node',
  });

  manager.initialize({
    subscribeToPartition: async () => {},
    unsubscribeFromPartition: async () => {},
  });

  const client = createMockClient('c1');
  await manager.registerLiveQuery({from: {name: 'orders'}}, client);

  // Simulate disconnect
  manager.handleClientDisconnection('c1');

  // Re-register the query group
  const client2 = createMockClient('c2');
  await manager.registerLiveQuery({from: {name: 'orders'}}, client2);

  // Resume with cursor
  const cursor = `${Date.now()}:0:node1`;
  const resumed = await manager.resumeLiveQuery(
    manager.queryGroups.values().next().value.queryId,
    'c3',
    cursor,
  );

  t.ok(resumed, 'should return resume result');
  t.equal(resumed.resumed, true, 'should indicate resumed');
  t.equal(resumed.fromCursor, cursor, 'should include cursor');

  manager.shutdown();
});

test('LiveQueryManager - rejects old cursor', async (t) => {
  const manager = new LiveQueryManager({
    systemCache: createMockSystemCache([
      {partition_id: 'p1', table_name: 'orders', partition_key_start: null,
        partition_key_end: null,
      },
    ]),
    nodeId: 'test-node',
  });

  manager.cursorRetentionMs = 1000; // 1 second retention
  manager.initialize({
    subscribeToPartition: async () => {},
    unsubscribeFromPartition: async () => {},
  });

  const client = createMockClient('c1');
  await manager.registerLiveQuery({from: {name: 'orders'}}, client);

  const queryId = manager.queryGroups.values().next().value.queryId;

  // Try to resume with old cursor
  const oldCursor = `${Date.now() - 10000}:0:node1`; // 10 seconds ago

  try {
    await manager.resumeLiveQuery(queryId, 'c2', oldCursor);
    t.fail('should throw');
  } catch (error) {
    t.match(error.message, /Cursor too old/, 'should reject old cursor');
  }

  manager.shutdown();
});
