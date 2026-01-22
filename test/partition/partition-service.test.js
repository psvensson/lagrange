/**
 * Unit tests for PartitionService.
 * Tests SQLite-backed Raft group for data storage.
 * Requirements: 3.2, 3.3, 3.4, 3.5, 4.4
 */

import {test, beforeEach, afterEach} from 'tap';
import {
  PartitionService,
  PartitionState,
  RaftRole,
  CDCOperation,
} from '../../src/partition/partition-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('PartitionService - constructor requires partitionId', async (t) => {
  t.throws(() => {
    new PartitionService({tableId: 'test-table', replicaId: 'r1'});
  }, /requires partitionId/);
});

test('PartitionService - constructor requires tableId', async (t) => {
  t.throws(() => {
    new PartitionService({partitionId: 'p1', replicaId: 'r1'});
  }, /requires tableId/);
});

test('PartitionService - constructor requires replicaId', async (t) => {
  t.throws(() => {
    new PartitionService({partitionId: 'p1', tableId: 'test-table'});
  }, /requires replicaId/);
});

test('PartitionService - initializes with in-memory database', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition-1',
    tableId: 'test-table',
    replicaId: 'replica-1',
    nodeId: 'node-1',
    dbPath: ':memory:',
  });

  await partition.initialize();

  t.equal(partition.initialized, true);
  t.equal(partition.partitionId, 'test-partition-1');
  t.equal(partition.tableId, 'test-table');
  t.equal(partition.replicaId, 'replica-1');
  // Single replica becomes leader immediately
  t.equal(partition.getRole(), RaftRole.LEADER);
  t.equal(partition.getState(), PartitionState.NORMAL);

  await partition.shutdown();
});


test('PartitionService - creates table from schema', async (t) => {
  const schema = {
    columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'name', type: 'TEXT', notNull: true},
      {name: 'value', type: 'INTEGER', defaultValue: 0},
    ],
  };

  const partition = new PartitionService({
    partitionId: 'test-partition-2',
    tableId: 'users',
    tableName: 'users',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'], // Single replica becomes leader
    schema,
    dbPath: ':memory:',
  });

  await partition.initialize();

  // Single replica becomes leader immediately
  await Promise.resolve();

  // Verify table was created by inserting data
  const result = await partition.insertData('users', {
    id: 'user-1',
    name: 'Test User',
    value: 42,
  });

  t.equal(result.success, true);
  t.equal(result.changes, 1);

  await partition.shutdown();
});

test('PartitionService - executeQuery for SELECT', async (t) => {
  const schema = {
    columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'name', type: 'TEXT'},
    ],
  };

  const partition = new PartitionService({
    partitionId: 'test-partition-3',
    tableId: 'items',
    tableName: 'items',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'], // Single replica becomes leader
    schema,
    dbPath: ':memory:',
  });

  await partition.initialize();

  // Single replica becomes leader immediately
  await Promise.resolve();

  // Insert some data first
  await partition.insertData('items', {id: 'item-1', name: 'Item One'});
  await partition.insertData('items', {id: 'item-2', name: 'Item Two'});

  // Query the data
  const result = await partition.executeQuery('SELECT * FROM items');

  t.equal(result.success, true);
  t.equal(result.count, 2);
  t.equal(result.rows.length, 2);
  t.equal(result.partitionId, 'test-partition-3');

  await partition.shutdown();
});

test('PartitionService - updateData modifies records', async (t) => {
  const schema = {
    columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'status', type: 'TEXT'},
    ],
  };

  const partition = new PartitionService({
    partitionId: 'test-partition-4',
    tableId: 'tasks',
    tableName: 'tasks',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    schema,
    dbPath: ':memory:',
  });

  await partition.initialize();
  // Single replica becomes leader immediately
  await Promise.resolve();

  await partition.insertData('tasks', {id: 'task-1', status: 'pending'});

  const updateResult = await partition.updateData(
    'tasks',
    {id: 'task-1'},
    {status: 'completed'},
  );

  t.equal(updateResult.success, true);
  t.equal(updateResult.changes, 1);

  const selectResult = await partition.executeQuery(
    'SELECT status FROM tasks WHERE id = ?',
    ['task-1'],
  );

  t.equal(selectResult.rows[0].status, 'completed');

  await partition.shutdown();
});

test('PartitionService - deleteData removes records', async (t) => {
  const schema = {
    columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'data', type: 'TEXT'},
    ],
  };

  const partition = new PartitionService({
    partitionId: 'test-partition-5',
    tableId: 'records',
    tableName: 'records',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    schema,
    dbPath: ':memory:',
  });

  await partition.initialize();
  // Single replica becomes leader immediately
  await Promise.resolve();

  await partition.insertData('records', {id: 'rec-1', data: 'test'});
  await partition.insertData('records', {id: 'rec-2', data: 'test2'});

  const deleteResult = await partition.deleteData('records', {id: 'rec-1'});

  t.equal(deleteResult.success, true);
  t.equal(deleteResult.changes, 1);

  const selectResult = await partition.executeQuery('SELECT * FROM records');
  t.equal(selectResult.count, 1);
  t.equal(selectResult.rows[0].id, 'rec-2');

  await partition.shutdown();
});

test('PartitionService - generates CDC events on insert', async (t) => {
  const schema = {
    columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'value', type: 'INTEGER'},
    ],
  };

  const partition = new PartitionService({
    partitionId: 'test-partition-6',
    tableId: 'cdc_test',
    tableName: 'cdc_test',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    schema,
    dbPath: ':memory:',
  });

  await partition.initialize();
  // Single replica becomes leader immediately
  await Promise.resolve();

  const cdcEvents = [];
  partition.subscribeToCDC((event) => {
    cdcEvents.push(event);
  });

  await partition.insertData('cdc_test', {id: 'cdc-1', value: 100});

  t.equal(cdcEvents.length, 1);
  t.equal(cdcEvents[0].operation, CDCOperation.INSERT);
  t.equal(cdcEvents[0].tableName, 'cdc_test');
  t.equal(cdcEvents[0].sourcePartition, 'test-partition-6');

  await partition.shutdown();
});

test('PartitionService - generates CDC events on update', async (t) => {
  const schema = {
    columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'value', type: 'INTEGER'},
    ],
  };

  const partition = new PartitionService({
    partitionId: 'test-partition-7',
    tableId: 'cdc_test',
    tableName: 'cdc_test',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    schema,
    dbPath: ':memory:',
  });

  await partition.initialize();
  // Single replica becomes leader immediately
  await Promise.resolve();

  await partition.insertData('cdc_test', {id: 'cdc-1', value: 100});

  const cdcEvents = [];
  partition.subscribeToCDC((event) => {
    cdcEvents.push(event);
  });

  await partition.updateData('cdc_test', {id: 'cdc-1'}, {value: 200});

  t.equal(cdcEvents.length, 1);
  t.equal(cdcEvents[0].operation, CDCOperation.UPDATE);

  await partition.shutdown();
});

test('PartitionService - generates CDC events on delete', async (t) => {
  const schema = {
    columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'value', type: 'INTEGER'},
    ],
  };

  const partition = new PartitionService({
    partitionId: 'test-partition-8',
    tableId: 'cdc_test',
    tableName: 'cdc_test',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    schema,
    dbPath: ':memory:',
  });

  await partition.initialize();
  // Single replica becomes leader immediately
  await Promise.resolve();

  await partition.insertData('cdc_test', {id: 'cdc-1', value: 100});

  const cdcEvents = [];
  partition.subscribeToCDC((event) => {
    cdcEvents.push(event);
  });

  await partition.deleteData('cdc_test', {id: 'cdc-1'});

  t.equal(cdcEvents.length, 1);
  t.equal(cdcEvents[0].operation, CDCOperation.DELETE);
  // Verify DELETE CDC event contains the primary key from whereClause
  t.equal(cdcEvents[0].data.id, 'cdc-1', 'DELETE CDC event should contain primary key');

  await partition.shutdown();
});

test('PartitionService - calculates partition size', async (t) => {
  const schema = {
    columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'data', type: 'TEXT'},
    ],
  };

  const partition = new PartitionService({
    partitionId: 'test-partition-9',
    tableId: 'size_test',
    tableName: 'size_test',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    schema,
    dbPath: ':memory:',
  });

  await partition.initialize();
  // Single replica becomes leader immediately
  await Promise.resolve();

  const initialSize = partition.getSize();
  t.ok(initialSize >= 0, 'Initial size should be non-negative');

  // Insert some data
  for (let i = 0; i < 10; i++) {
    await partition.insertData('size_test', {
      id: `item-${i}`,
      data: 'x'.repeat(1000),
    });
  }

  // Force size update
  await partition.updatePartitionSize();

  const newSize = partition.getSize();
  t.ok(newSize > initialSize, 'Size should increase after inserts');

  await partition.shutdown();
});

test('PartitionService - key range management', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition-10',
    tableId: 'range_test',
    replicaId: 'replica-1',
    keyRange: {start: 'a', end: 'm'},
    dbPath: ':memory:',
  });

  await partition.initialize();

  const range = partition.getKeyRange();
  t.equal(range.start, 'a');
  t.equal(range.end, 'm');

  t.equal(partition.isKeyInRange('b'), true);
  t.equal(partition.isKeyInRange('l'), true);
  t.equal(partition.isKeyInRange('a'), true);
  t.equal(partition.isKeyInRange('m'), false); // end is exclusive
  t.equal(partition.isKeyInRange('z'), false);

  await partition.shutdown();
});

test('PartitionService - full key range (null, null)', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition-11',
    tableId: 'full_range_test',
    replicaId: 'replica-1',
    keyRange: {start: null, end: null},
    dbPath: ':memory:',
  });

  await partition.initialize();

  t.equal(partition.isKeyInRange('anything'), true);
  t.equal(partition.isKeyInRange(''), true);
  t.equal(partition.isKeyInRange(0), true);
  t.equal(partition.isKeyInRange(null), true);

  await partition.shutdown();
});

test('PartitionService - getStatus returns complete status', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition-12',
    tableId: 'status_test',
    tableName: 'status_test',
    replicaId: 'replica-1',
    nodeId: 'node-1',
    replicaIds: ['replica-1', 'replica-2', 'replica-3'],
    dbPath: ':memory:',
  });

  await partition.initialize();

  const status = partition.getStatus();

  t.equal(status.partitionId, 'test-partition-12');
  t.equal(status.tableId, 'status_test');
  t.equal(status.replicaId, 'replica-1');
  t.equal(status.nodeId, 'node-1');
  t.equal(status.replicaCount, 3);
  t.equal(status.initialized, true);
  t.equal(status.state, PartitionState.NORMAL);
  t.ok(status.sizeBytes >= 0);

  await partition.shutdown();
});

test('PartitionService - single replica becomes leader', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition-13',
    tableId: 'leader_test',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    dbPath: ':memory:',
  });

  await partition.initialize();

  // Single replica should become leader immediately
  await Promise.resolve();

  t.equal(partition.isLeaderReplica(), true);
  t.equal(partition.getRole(), RaftRole.LEADER);
  t.equal(partition.getLeaderId(), 'replica-1');

  await partition.shutdown();
});

test('PartitionService - unsubscribe from CDC', async (t) => {
  const schema = {
    columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
    ],
  };

  const partition = new PartitionService({
    partitionId: 'test-partition-14',
    tableId: 'unsub_test',
    tableName: 'unsub_test',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    schema,
    dbPath: ':memory:',
  });

  await partition.initialize();
  // Single replica should become leader immediately
  await Promise.resolve();

  const cdcEvents = [];
  const subscriber = (event) => cdcEvents.push(event);

  partition.subscribeToCDC(subscriber);
  await partition.insertData('unsub_test', {id: 'item-1'});
  t.equal(cdcEvents.length, 1);

  partition.unsubscribeFromCDC(subscriber);
  await partition.insertData('unsub_test', {id: 'item-2'});
  t.equal(cdcEvents.length, 1); // No new events after unsubscribe

  await partition.shutdown();
});

// Tests for liferaft-based architecture (Requirements 14.1, 14.2, 14.3, 14.4)

test('PartitionService - handleTransportMessage routes Raft packets to liferaft', async (t) => {
  // Mock transport to avoid null reference errors when liferaft tries to respond
  const mockTransport = {
    register: () => {},
    unregister: () => {},
    deliver: () => Promise.resolve({acknowledged: true}),
  };

  const partition = new PartitionService({
    partitionId: 'test-partition-15',
    tableId: 'raft_test',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    transport: mockTransport,
    dbPath: ':memory:',
  });

  await partition.initialize();

  // Track if raft.emit was called with the packet
  let emittedData = null;
  let emittedEvent = null;

  // Replace raft.emit to track calls without triggering liferaft's state machine
  partition.raft.emit = (event, data, _write) => {
    if (event === 'data') {
      emittedEvent = event;
      emittedData = data;
    }
    // Don't call original emit to avoid triggering liferaft's state machine
    return true;
  };

  // Send a Raft packet (vote request)
  const raftPacket = {
    type: 'vote',
    term: 1,
    address: 'node2/partition/replica-2',
    state: 1,
    leader: '',
    last: {term: 0, index: 0},
  };

  const result = await partition.handleTransportMessage({payload: raftPacket});

  t.equal(result.acknowledged, true, 'Raft packet should be acknowledged');
  t.equal(emittedEvent, 'data', 'Should emit data event to liferaft');
  t.ok(emittedData, 'Raft packet should be emitted to liferaft');
  t.equal(emittedData.type, 'vote', 'Packet type should be preserved');
  t.equal(emittedData.term, 1, 'Packet term should be preserved');

  await partition.shutdown();
});

test('PartitionService - handleTransportMessage handles application messages', async (t) => {
  const schema = {
    columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'value', type: 'INTEGER'},
    ],
  };

  const partition = new PartitionService({
    partitionId: 'test-partition-16',
    tableId: 'app_msg_test',
    tableName: 'app_msg_test',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    schema,
    dbPath: ':memory:',
  });

  await partition.initialize();
  // Single replica becomes leader immediately
  await Promise.resolve();

  // Send a FORWARD_WRITE application message
  const forwardWriteMsg = {
    payload: {
      type: 'FORWARD_WRITE',
      operation: {
        type: 'INSERT',
        tableName: 'app_msg_test',
        data: {id: 'item-1', value: 42},
        sql: 'INSERT INTO app_msg_test (id, value) VALUES (?, ?)',
        params: ['item-1', 42],
      },
    },
  };

  const result = await partition.handleTransportMessage(forwardWriteMsg);

  t.equal(result.success, true, 'FORWARD_WRITE should succeed');
  t.equal(result.changes, 1, 'One row should be inserted');

  // Verify data was inserted
  const queryResult = await partition.executeQuery(
    'SELECT * FROM app_msg_test WHERE id = ?',
    ['item-1'],
  );
  t.equal(queryResult.rows.length, 1);
  t.equal(queryResult.rows[0].value, 42);

  await partition.shutdown();
});

test('PartitionService - handleTransportMessage rejects unknown message types', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition-17',
    tableId: 'unknown_msg_test',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    dbPath: ':memory:',
  });

  await partition.initialize();

  // Send an unknown message type
  const unknownMsg = {
    payload: {
      type: 'UNKNOWN_TYPE',
      data: 'some data',
    },
  };

  const result = await partition.handleTransportMessage(unknownMsg);

  t.equal(result.acknowledged, false, 'Unknown message should not be acknowledged');
  t.ok(result.error, 'Error message should be present');
  t.match(result.error, /Unknown message type/, 'Error should mention unknown type');

  await partition.shutdown();
});

test('PartitionService - liferaft instance is created with correct configuration', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition-18',
    tableId: 'liferaft_config_test',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'node-1',
    dbPath: ':memory:',
  });

  await partition.initialize();

  // Verify liferaft instance exists
  t.ok(partition.raft, 'Liferaft instance should exist');

  // Verify unified address format is used
  t.equal(partition.getUnifiedAddress(), 'node-1/partition/replica-1');

  await partition.shutdown();
});

test('PartitionService - buildPeerAddress returns correct format', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition-19',
    tableId: 'peer_addr_test',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'node-1',
    dbPath: ':memory:',
  });

  await partition.initialize();

  // Test with simple peer ID (should add nodeId prefix)
  const addr1 = partition.buildPeerAddress('replica-2');
  t.equal(addr1, 'node-1/partition/replica-2', 'Should build correct address');

  // Test with already-formatted address (should return as-is)
  const addr2 = partition.buildPeerAddress('node-2/partition/replica-3');
  t.equal(addr2, 'node-2/partition/replica-3', 'Should return formatted address as-is');

  await partition.shutdown();
});

test('PartitionService - emits leaderElected event for single replica', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition-20',
    tableId: 'leader_event_test',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'node-1',
    dbPath: ':memory:',
  });

  let leaderEvent = null;
  partition.on('leaderElected', (event) => {
    leaderEvent = event;
  });

  await partition.initialize();

  // Single replica should emit leaderElected event
  t.ok(leaderEvent, 'leaderElected event should be emitted');
  t.equal(leaderEvent.leaderId, 'replica-1', 'Leader should be this replica');
  t.equal(leaderEvent.partitionId, 'test-partition-20', 'Partition ID should match');

  await partition.shutdown();
});
