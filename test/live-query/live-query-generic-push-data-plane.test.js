/**
 * End-to-end tests for Live Query Generic Push Data Plane (Stages D1–D6).
 *
 * Requirements:
 * - D1: Canonical plan dependencies and PartitionResolver narrowing
 * - D2 & D3: Gap-free attachAfterVersion hydration frontier & deduplication
 * - D4: Push-backed single-table incremental deltas & complex/join re-execution
 * - D5: Dynamic topology reconfiguration (split/merge)
 * - D6: Subscription teardown & antipolling hygiene
 */

import {test} from '../../src/test-helpers/tap.js';
import {LiveQueryManager, QueryGroup} from '../../src/live-query/live-query-manager.js';
import {createLiveQueryStartupWiring} from '../../src/live-query/live-query-startup-wiring.js';
import {LIVE_QUERY_EVENT, LIVE_QUERY_OPERATION} from '../../src/live-query/live-query-constants.js';

function createMockClient(id = 'client-1') {
  const messages = [];
  return {
    id,
    messages,
    send: (msg) => messages.push(typeof msg === 'string' ? JSON.parse(msg) : msg),
  };
}

function createTableCache(tables, partitions) {
  const tableMap = new Map(tables.map((t) => [t.table_name, t]));
  return {
    get: (table, key) => (table === 'tables' ? tableMap.get(key) || null : null),
    find: (table, pred) => (table === 'tables' ? tables.find(pred) || null : null),
    filter: (table, pred) => {
      if (table === 'partitions') {
        return partitions.filter(pred || (() => true));
      }
      return [];
    },
  };
}

// -----------------------------------------------------------------------------
// D1: Canonical Plan Dependencies & Selective Partition Routing
// -----------------------------------------------------------------------------

test('D1: narrows single declared primary key to candidate partition', async (t) => {
  const tables = [
    {table_name: 'orders', primary_key: 'order_id', partition_key_type: 'INTEGER'},
  ];
  const partitions = [
    {partition_id: 'p1', table_name: 'orders', partition_key_start: null, partition_key_end: 100, partition_key_type: 'INTEGER'},
    {partition_id: 'p2', table_name: 'orders', partition_key_start: 100, partition_key_end: 200, partition_key_type: 'INTEGER'},
    {partition_id: 'p3', table_name: 'orders', partition_key_start: 200, partition_key_end: null, partition_key_type: 'INTEGER'},
  ];
  const systemCache = createTableCache(tables, partitions);

  const group = new QueryGroup({
    parsedQuery: {
      type: 'SELECT',
      from: {name: 'orders'},
      where: {
        type: 'binary',
        operator: '=',
        left: {type: 'column_ref', column: 'order_id'},
        right: {type: 'literal', value: 150},
      },
    },
    systemCache,
  });

  const matching = await group.findPartitionsForQuery();
  t.equal(matching.size, 1, 'should narrow to exactly 1 partition');
  t.ok(matching.has('p2'), 'should resolve partition p2 containing 150');
  t.notOk(matching.has('p1'), 'should not resolve p1');
  t.notOk(matching.has('p3'), 'should not resolve p3');
});

test('D1: narrows compound primary key when all keys match', async (t) => {
  const tables = [
    {table_name: 'order_items', primary_key: 'order_id,item_id', partition_key_type: 'COMPOSITE'},
  ];
  const partitions = [
    {partition_id: 'p1', table_name: 'order_items', partition_key_start: null, partition_key_end: '["100","0"]', partition_key_type: 'COMPOSITE'},
    {partition_id: 'p2', table_name: 'order_items', partition_key_start: '["100","0"]', partition_key_end: null, partition_key_type: 'COMPOSITE'},
  ];
  const systemCache = createTableCache(tables, partitions);

  const group = new QueryGroup({
    parsedQuery: {
      type: 'SELECT',
      from: {name: 'order_items'},
      where: {
        type: 'binary',
        operator: 'AND',
        left: {
          type: 'binary',
          operator: '=',
          left: {type: 'column_ref', column: 'order_id'},
          right: {type: 'literal', value: '050'},
        },
        right: {
          type: 'binary',
          operator: '=',
          left: {type: 'column_ref', column: 'item_id'},
          right: {type: 'literal', value: '1'},
        },
      },
    },
    systemCache,
  });

  const matching = await group.findPartitionsForQuery();
  t.equal(matching.size, 1, 'should resolve 1 partition for composite key');
  t.ok(matching.has('p1'), 'should match partition p1');
});

test('D1: range predicate narrows to overlapping partitions', async (t) => {
  const tables = [
    {table_name: 'orders', primary_key: 'order_id', partition_key_type: 'INTEGER'},
  ];
  const partitions = [
    {partition_id: 'p1', table_name: 'orders', partition_key_start: null, partition_key_end: 100, partition_key_type: 'INTEGER'},
    {partition_id: 'p2', table_name: 'orders', partition_key_start: 100, partition_key_end: 200, partition_key_type: 'INTEGER'},
    {partition_id: 'p3', table_name: 'orders', partition_key_start: 200, partition_key_end: null, partition_key_type: 'INTEGER'},
  ];
  const systemCache = createTableCache(tables, partitions);

  const group = new QueryGroup({
    parsedQuery: {
      type: 'SELECT',
      from: {name: 'orders'},
      where: {
        type: 'binary',
        operator: '>=',
        left: {type: 'column_ref', column: 'order_id'},
        right: {type: 'literal', value: 150},
      },
    },
    systemCache,
  });

  const matching = await group.findPartitionsForQuery();
  t.equal(matching.size, 2, 'should match p2 and p3');
  t.ok(matching.has('p2'), 'should match p2');
  t.ok(matching.has('p3'), 'should match p3');
  t.notOk(matching.has('p1'), 'should exclude p1');
});

test('D1: contradictory predicate narrows to zero partitions', async (t) => {
  const tables = [
    {table_name: 'orders', primary_key: 'order_id', partition_key_type: 'INTEGER'},
  ];
  const partitions = [
    {partition_id: 'p1', table_name: 'orders', partition_key_start: null, partition_key_end: 100, partition_key_type: 'INTEGER'},
    {partition_id: 'p2', table_name: 'orders', partition_key_start: 100, partition_key_end: null, partition_key_type: 'INTEGER'},
  ];
  const systemCache = createTableCache(tables, partitions);

  const group = new QueryGroup({
    parsedQuery: {
      type: 'SELECT',
      from: {name: 'orders'},
      where: {
        type: 'binary',
        operator: 'AND',
        left: {
          type: 'binary',
          operator: '=',
          left: {type: 'column_ref', column: 'order_id'},
          right: {type: 'literal', value: 10},
        },
        right: {
          type: 'binary',
          operator: '=',
          left: {type: 'column_ref', column: 'order_id'},
          right: {type: 'literal', value: 20},
        },
      },
    },
    systemCache,
  });

  const matching = await group.findPartitionsForQuery();
  t.equal(matching.size, 0, 'contradictory predicate resolves to 0 partitions');
});

test('D1: extracts join tables and subscribes to partitions of both tables', async (t) => {
  const tables = [
    {table_name: 'orders', primary_key: 'order_id', partition_key_type: 'INTEGER'},
    {table_name: 'customers', primary_key: 'customer_id', partition_key_type: 'INTEGER'},
    {table_name: 'unrelated', primary_key: 'id', partition_key_type: 'INTEGER'},
  ];
  const partitions = [
    {partition_id: 'p_ord_1', table_name: 'orders', partition_key_start: null, partition_key_end: 100, partition_key_type: 'INTEGER'},
    {partition_id: 'p_ord_2', table_name: 'orders', partition_key_start: 100, partition_key_end: null, partition_key_type: 'INTEGER'},
    {partition_id: 'p_cust_1', table_name: 'customers', partition_key_start: null, partition_key_end: null, partition_key_type: 'INTEGER'},
    {partition_id: 'p_unrelated_1', table_name: 'unrelated', partition_key_start: null, partition_key_end: null, partition_key_type: 'INTEGER'},
  ];
  const systemCache = createTableCache(tables, partitions);

  const group = new QueryGroup({
    parsedQuery: {
      type: 'SELECT',
      from: {name: 'orders'},
      joins: [
        {
          joinType: 'INNER',
          table: {name: 'customers'},
          condition: {
            type: 'binary',
            operator: '=',
            left: {type: 'column_ref', table: 'orders', column: 'customer_id'},
            right: {type: 'column_ref', table: 'customers', column: 'customer_id'},
          },
        },
      ],
      where: {
        type: 'binary',
        operator: '=',
        left: {type: 'column_ref', table: 'orders', column: 'order_id'},
        right: {type: 'literal', value: 50},
      },
    },
    systemCache,
  });

  t.same(group.tables.sort(), ['customers', 'orders'].sort(), 'should extract both tables');
  t.ok(group.isComplex, 'join query is marked complex (Tier 2)');

  const matching = await group.findPartitionsForQuery();
  t.ok(matching.has('p_ord_1'), 'should match orders partition p_ord_1');
  t.notOk(matching.has('p_ord_2'), 'should exclude orders partition p_ord_2');
  t.ok(matching.has('p_cust_1'), 'should match customers partition p_cust_1');
  t.notOk(matching.has('p_unrelated_1'), 'must never subscribe to unrelated table partitions');
});

// -----------------------------------------------------------------------------
// D2 & D3: Gap-Free Frontier Handshake & Deduplication
// -----------------------------------------------------------------------------

test('D2 & D3: gap-free attachAfterVersion handshake deduplicates overlap and applies newer', async (t) => {
  const tables = [
    {table_name: 'orders', primary_key: 'id', partition_key_type: 'INTEGER'},
  ];
  const partitions = [
    {partition_id: 'p1', table_name: 'orders', partition_key_start: null, partition_key_end: null, partition_key_type: 'INTEGER'},
  ];
  const systemCache = createTableCache(tables, partitions);

  let cdcHandler = null;
  const subscribeToPartition = async (partitionId, queryId, handler) => {
    cdcHandler = handler;
    return {status: 'ok', versionContext: {streamVersion: 10}};
  };

  const client = createMockClient('c1');
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
    systemCache,
  });

  group.addClient(client);

  // 1. Arm listener in buffering mode before snapshot
  group.startHydration();
  await group.updatePartitionSubscriptions(subscribeToPartition, null);

  // 2. Incoming CDC events arrive during snapshot execution
  cdcHandler({
    operation: 'INSERT',
    data: {id: 1, amount: 150},
    logIndex: 10, // <= attachAfterVersion (already in snapshot)
    hlc_timestamp: '10:0:node1',
  });
  cdcHandler({
    operation: 'INSERT',
    data: {id: 2, amount: 200},
    logIndex: 20, // <= attachAfterVersion (already in snapshot)
    hlc_timestamp: '20:0:node1',
  });
  cdcHandler({
    operation: 'INSERT',
    data: {id: 3, amount: 250},
    logIndex: 30, // > attachAfterVersion (committed after snapshot read)
    hlc_timestamp: '30:0:node1',
  });

  // 3. Snapshot executes and records attachAfterVersion = 20
  group.partitionFrontiers.set('p1', 20);

  // 4. Drain buffered events: version <= 20 deduplicated; version 30 applied
  group.drainBufferedEvents();

  t.equal(group.lifecycleState, 'LIVE', 'group transitioned to LIVE');
  t.equal(client.messages.length, 1, 'only one delta delivered (deduplicated version <= 20)');
  t.equal(client.messages[0].row.id, 3, 'applied event with logIndex 30');

  // 5. Subsequent live event (logIndex 40) is delivered immediately
  await group.handleCDCEvent({
    operation: 'INSERT',
    data: {id: 4, amount: 300},
    logIndex: 40,
    hlc_timestamp: '40:0:node1',
  }, 'p1');

  t.equal(client.messages.length, 2, 'second live event delivered promptly');
  t.equal(client.messages[1].row.id, 4, 'second live event received');
});

// -----------------------------------------------------------------------------
// D4: Push-Backed Deltas & Tier 2 Complex Re-Execution
// -----------------------------------------------------------------------------

test('D4 Tier 1: emits push-backed single-table incremental deltas', async (t) => {
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
    deltaFormat: true,
  });

  // INSERT matching predicate
  const insertRes = group.evaluateChange({
    operation: 'INSERT',
    data: {id: 1, amount: 150},
    hlc_timestamp: '1:0:node1',
  });
  t.equal(insertRes.type, LIVE_QUERY_EVENT.ADDED, 'INSERT matching predicate emits added');
  t.equal(insertRes.operation, LIVE_QUERY_OPERATION.INSERT);
  t.same(insertRes.data, {id: 1, amount: 150});

  // DELETE matching predicate
  const deleteRes = group.evaluateChange({
    operation: 'DELETE',
    old_data: {id: 1, amount: 150},
    hlc_timestamp: '2:0:node1',
  });
  t.equal(deleteRes.type, LIVE_QUERY_EVENT.REMOVED, 'DELETE matching predicate emits removed');
  t.equal(deleteRes.operation, LIVE_QUERY_OPERATION.DELETE);
  t.same(deleteRes.data, {id: 1, amount: 150});

  // UPDATE: entering predicate (old did not match, new matches)
  const enterRes = group.evaluateChange({
    operation: 'UPDATE',
    old_data: {id: 2, amount: 50},
    data: {id: 2, amount: 150},
    hlc_timestamp: '3:0:node1',
  });
  t.equal(enterRes.type, LIVE_QUERY_EVENT.ADDED, 'UPDATE entering filter emits added');
  t.equal(enterRes.operation, LIVE_QUERY_OPERATION.INSERT);
  t.same(enterRes.data, {id: 2, amount: 150});

  // UPDATE: exiting predicate (old matched, new does not match)
  const exitRes = group.evaluateChange({
    operation: 'UPDATE',
    old_data: {id: 2, amount: 150},
    data: {id: 2, amount: 50},
    hlc_timestamp: '4:0:node1',
  });
  t.equal(exitRes.type, LIVE_QUERY_EVENT.REMOVED, 'UPDATE exiting filter emits removed');
  t.equal(exitRes.operation, LIVE_QUERY_OPERATION.DELETE);
  t.same(exitRes.data, {id: 2, amount: 150});

  // UPDATE: staying in predicate (both match)
  const stayRes = group.evaluateChange({
    operation: 'UPDATE',
    old_data: {id: 2, amount: 150},
    data: {id: 2, amount: 250},
    hlc_timestamp: '5:0:node1',
  });
  t.equal(stayRes.type, LIVE_QUERY_EVENT.MODIFIED, 'UPDATE staying in filter emits modified');
  t.equal(stayRes.operation, LIVE_QUERY_OPERATION.UPDATE);
  t.same(stayRes.data, {id: 2, amount: 250});
  t.same(stayRes.oldData, {id: 2, amount: 150});
});

test('D4 Tier 2: complex queries with ORDER BY, LIMIT re-execute on push without polling', async (t) => {
  let executeCount = 0;
  let currentRows = [{id: 1, amount: 200}];

  const mockSqlEngine = {
    executeQuery: async (_sql) => {
      executeCount++;
      return {rows: [...currentRows], count: currentRows.length};
    },
  };

  const client = createMockClient('c1');
  const group = new QueryGroup({
    parsedQuery: {
      type: 'SELECT',
      from: {name: 'orders'},
      orderBy: [{expression: {type: 'column_ref', column: 'amount'}, direction: 'DESC'}],
      limit: {count: 5},
    },
    sqlQueryEngine: mockSqlEngine,
  });

  group.addClient(client);
  t.ok(group.isComplex, 'query is classified as complex Tier 2');

  // Trigger CDC push mutation
  currentRows = [{id: 2, amount: 300}, {id: 1, amount: 200}];
  await group.handleCDCEvent({
    operation: 'INSERT',
    data: {id: 2, amount: 300},
    logIndex: 5,
  }, 'p1');

  t.equal(executeCount, 1, 'query re-executed exactly once in response to CDC push');
  t.equal(client.messages.length, 1, 'reset snapshot notification emitted');
  t.equal(client.messages[0].type, LIVE_QUERY_EVENT.RESET);
  t.equal(client.messages[0].rows.length, 2);
  t.equal(client.messages[0].rows[0].id, 2);
});

// -----------------------------------------------------------------------------
// D5: Dynamic Topology Reconfiguration (Split / Merge)
// -----------------------------------------------------------------------------

test('D5: dynamic partition split reconfigures subscriptions without client resubscription', async (t) => {
  let partitions = [
    {partition_id: 'p1', table_name: 'orders', partition_key_start: null, partition_key_end: null, partition_key_type: 'INTEGER'},
  ];
  const tables = [
    {table_name: 'orders', primary_key: 'id', partition_key_type: 'INTEGER'},
  ];

  const systemCache = {
    get: (table, key) => (table === 'tables' && key === 'orders' ? tables[0] : null),
    find: (table, pred) => (table === 'tables' ? tables.find(pred) : null),
    filter: (table, _pred) => (table === 'partitions' ? partitions : []),
  };

  const subscribedPartitions = new Set();
  const unsubscribedPartitions = new Set();

  const manager = new LiveQueryManager({systemCache});
  manager.initialize({
    subscribeToPartition: async (partitionId) => {
      subscribedPartitions.add(partitionId);
    },
    unsubscribeFromPartition: async (partitionId) => {
      unsubscribedPartitions.add(partitionId);
    },
  });

  const client = createMockClient('c1');
  const reg = await manager.registerLiveQuery({from: {name: 'orders'}}, client);

  t.ok(subscribedPartitions.has('p1'), 'subscribed to initial partition p1');
  t.equal(manager.clientSubscriptions.get('c1').size, 1);

  // Trigger partition split in system metadata: p1 -> p1a, p1b
  partitions = [
    {partition_id: 'p1a', table_name: 'orders', partition_key_start: null, partition_key_end: 100, partition_key_type: 'INTEGER'},
    {partition_id: 'p1b', table_name: 'orders', partition_key_start: 100, partition_key_end: null, partition_key_type: 'INTEGER'},
  ];

  await manager.handlePartitionTopologyChange({
    operation: 'UPDATE',
    old: {table_name: 'orders'},
    new: {table_name: 'orders'},
  });

  t.ok(unsubscribedPartitions.has('p1'), 'unsubscribed from retired partition p1');
  t.ok(subscribedPartitions.has('p1a'), 'subscribed to new child partition p1a');
  t.ok(subscribedPartitions.has('p1b'), 'subscribed to new child partition p1b');

  // Verify client subscription is intact without resubscription
  t.ok(manager.clientSubscriptions.get('c1').has(reg.queryId), 'client subscription preserved');
  manager.shutdown();
});

// -----------------------------------------------------------------------------
// D6: Subscription Teardown & Antipolling Hygiene
// -----------------------------------------------------------------------------

test('D6: zero background polling queries while idle, and complete partition teardown on unsubscribe', async (t) => {
  let executeQueryCalls = 0;
  const mockSqlEngine = {
    executeQuery: async () => {
      executeQueryCalls++;
      return {rows: [{id: 1, status: 'open'}], count: 1};
    },
  };

  const tables = [
    {table_name: 'orders', primary_key: 'id', partition_key_type: 'INTEGER'},
  ];
  const partitions = [
    {partition_id: 'p1', table_name: 'orders', partition_key_start: null, partition_key_end: null, partition_key_type: 'INTEGER'},
  ];
  const systemCache = createTableCache(tables, partitions);

  const activeSubscriptions = new Set();
  const wiring = createLiveQueryStartupWiring({
    nodeId: 'test-node',
    systemTableCache: systemCache,
    sqlQueryEngine: mockSqlEngine,
    subscribeToPartition: async (partitionId) => {
      activeSubscriptions.add(partitionId);
    },
    unsubscribeFromPartition: async (partitionId) => {
      activeSubscriptions.delete(partitionId);
    },
  });

  const client = createMockClient('c1');
  const reg = await wiring.liveQueryManager.registerLiveQuery({from: {name: 'orders'}}, client);

  // Snapshot was executed once on initial registration
  t.equal(executeQueryCalls, 1, 'initial snapshot executed once');
  t.equal(activeSubscriptions.size, 1, 'partition CDC subscription active');

  // Idle observation window (50ms)
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Antipolling check: executeQuery calls must remain exactly 1 (zero idle polling reads)
  t.equal(executeQueryCalls, 1, 'ZERO repeated background SELECT polls during idle window');

  // Teardown: unsubscribe the client
  wiring.liveQueryManager.unregisterLiveQuery(reg.queryId, 'c1');

  // Verify all partition CDC listeners immediately detached
  t.equal(activeSubscriptions.size, 0, 'zero orphan partition CDC subscribers remain');
  t.equal(wiring.liveQueryManager.queryGroups.size, 0, 'query group removed');

  wiring.shutdown();
});
