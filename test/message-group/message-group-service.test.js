/**
 * Unit tests for MessageGroupService.
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import {test, beforeEach, afterEach} from 'tap';
import {
  MessageGroupService,
  MessageStatus,
  RaftRole,
  InMemoryRaftStorage,
} from '../../src/message-group/message-group-service.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {MessageRouter} from '../../src/transport/message-router.js';

// Port counter for unique ports per test
let testPortCounter = 24000;

/**
 * Create a real WebSocket transport for testing.
 * @return {Promise<{router: MessageRouter, nodeId: string, cleanup: Function}>}
 */
async function createTestTransport() {
  const port = testPortCounter++;
  const nodeId = `test-node-${port}`;
  const router = new MessageRouter({nodeId, wsPort: port});
  await router.initialize({startServer: true});
  return {
    router,
    nodeId,
    cleanup: async () => {
      await router.shutdown();
    },
  };
}

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

test('MessageGroupService - constructor requires groupId', async (t) => {
  const {router, cleanup} = await createTestTransport();
  try {
    t.throws(
      () => new MessageGroupService({replicaId: 'r1', transport: router}),
      /requires groupId/,
      'Should throw without groupId',
    );
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - constructor requires replicaId', async (t) => {
  const {router, cleanup} = await createTestTransport();
  try {
    t.throws(
      () => new MessageGroupService({groupId: 'mg-1', transport: router}),
      /requires replicaId/,
      'Should throw without replicaId',
    );
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - constructor requires transport', async (t) => {
  t.throws(
    () => new MessageGroupService({groupId: 'mg-1', replicaId: 'r1'}),
    /requires transport.*WebSocket transport is mandatory/,
    'Should throw without transport',
  );
});

test('MessageGroupService - constructor requires WebSocket-based transport', async (t) => {
  // Create a transport that doesn't have WebSocket markers
  const invalidTransport = {
    deliver: async () => ({acknowledged: true}),
    initialize: async () => {},
    shutdown: async () => {},
    // Missing setMessageRouter and setServiceNodeResolver
  };

  t.throws(
    () => new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'r1',
      transport: invalidTransport,
    }),
    /requires WebSocket-based transport/,
    'Should throw with non-WebSocket transport',
  );
});

test('MessageGroupService - constructor initializes correctly', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      replicaIds: ['mg-1-r1', 'mg-1-r2', 'mg-1-r3'],
      transport: router,
    });

    t.equal(service.groupId, 'mg-1', 'Should set groupId');
    t.equal(service.replicaId, 'mg-1-r1', 'Should set replicaId');
    t.equal(service.nodeId, nodeId, 'Should set nodeId');
    t.equal(service.replicaIds.length, 3, 'Should set replicaIds');
    t.equal(service.initialized, false, 'Should not be initialized');
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - initialize becomes leader for single replica', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
    });

    await service.initialize();

    t.equal(service.initialized, true, 'Should be initialized');
    // Single replica services become leader immediately (no election needed)
    t.equal(service.getRole(), RaftRole.LEADER, 'Should become leader for single replica');

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - sendMessage creates message envelope', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
    });

    await service.initialize();

    const result = await service.sendMessage('target-service', {
      type: 'TEST',
      data: 'hello',
    });

    t.ok(result.messageId, 'Should return messageId');
    t.ok(result.status, 'Should return status');

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - receiveMessage processes message', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
    });

    await service.initialize();

    let receivedMessage = null;
    service.on('messageReceived', (msg) => {
      receivedMessage = msg;
    });

    const result = await service.receiveMessage({
      messageId: 'msg-123',
      payload: {type: 'TEST'},
      sourceGroup: 'mg-2',
      sourceReplica: 'mg-2-r1',
    });

    t.equal(result.messageId, 'msg-123', 'Should return messageId');
    t.equal(result.status, 'received', 'Should return received status');
    t.ok(receivedMessage, 'Should emit messageReceived event');
    t.equal(receivedMessage.messageId, 'msg-123', 'Event should have messageId');

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - receiveMessage detects duplicates', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
    });

    await service.initialize();

    // First receive
    await service.receiveMessage({
      messageId: 'msg-123',
      payload: {type: 'TEST'},
      sourceGroup: 'mg-2',
      sourceReplica: 'mg-2-r1',
    });

    // Acknowledge
    await service.acknowledgeMessage('msg-123');

    // Second receive (duplicate)
    const result = await service.receiveMessage({
      messageId: 'msg-123',
      payload: {type: 'TEST'},
      sourceGroup: 'mg-2',
      sourceReplica: 'mg-2-r1',
    });

    t.equal(result.status, 'duplicate', 'Should detect duplicate');
    t.equal(result.acknowledged, true, 'Should indicate already acknowledged');

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - acknowledgeMessage marks message', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
    });

    await service.initialize();

    let ackEvent = null;
    service.on('messageAcknowledged', (event) => {
      ackEvent = event;
    });

    const result = await service.acknowledgeMessage('msg-123');

    t.equal(result.messageId, 'msg-123', 'Should return messageId');
    t.equal(result.status, MessageStatus.ACKNOWLEDGED, 'Should be acknowledged');
    t.ok(result.logIndex, 'Should have log index');
    t.ok(ackEvent, 'Should emit messageAcknowledged event');

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - subscribeToCDC adds subscription', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
    });

    await service.initialize();

    await service.subscribeToCDC('nodes');
    await service.subscribeToCDC('partitions');

    const status = service.getStatus();
    t.ok(status.cdcSubscriptions.includes('nodes'), 'Should subscribe to nodes');
    t.ok(status.cdcSubscriptions.includes('partitions'), 'Should subscribe to partitions');

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - applyCDCEvent updates cache', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
    });

    await service.initialize();
    await service.subscribeToCDC('nodes');

    let cdcEvent = null;
    service.on('cdcApplied', (event) => {
      cdcEvent = event;
    });

    await service.applyCDCEvent('nodes', 'INSERT', {
      id: 'node-1',
      address: '127.0.0.1:8080',
      status: 'active',
    });

    t.ok(cdcEvent, 'Should emit cdcApplied event');
    t.equal(cdcEvent.tableName, 'nodes', 'Event should have tableName');
    t.equal(cdcEvent.operation, 'INSERT', 'Event should have operation');

    // Verify cache was updated
    const result = await service.querySystemCache('nodes', {key: 'node-1'});
    t.ok(result, 'Should find record in cache');
    t.equal(result.address, '127.0.0.1:8080', 'Should have correct address');

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - querySystemCache returns data', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
    });

    await service.initialize();
    await service.subscribeToCDC('nodes');

    // Insert test data
    await service.applyCDCEvent('nodes', 'INSERT', {
      id: 'node-1',
      status: 'active',
    });
    await service.applyCDCEvent('nodes', 'INSERT', {
      id: 'node-2',
      status: 'inactive',
    });

    // Query by key
    const byKey = await service.querySystemCache('nodes', {key: 'node-1'});
    t.ok(byKey, 'Should find by key');
    t.equal(byKey.id, 'node-1', 'Should return correct record');

    // Query with predicate
    const filtered = await service.querySystemCache('nodes', {
      predicate: (r) => r.status === 'active',
    });
    t.equal(filtered.length, 1, 'Should filter correctly');

    // Query all
    const all = await service.querySystemCache('nodes');
    t.equal(all.length, 2, 'Should return all records');

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - getReadOnlyCache returns wrapper', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
    });

    const cache = service.getReadOnlyCache();
    t.ok(cache, 'Should return cache');

    // Verify it's read-only
    t.throws(
      () => cache.applySystemTableChange('nodes', 'INSERT', {id: 'test'}),
      /not available on read-only cache/,
      'Should block write operations',
    );
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - single replica becomes leader', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      replicaIds: ['mg-1-r1'],
      transport: router,
    });

    let leaderEvent = null;
    service.on('leaderElected', (event) => {
      leaderEvent = event;
    });

    await service.initialize();

    // Single replica becomes leader immediately - no need to wait
    t.equal(service.isLeaderReplica(), true, 'Should become leader');
    t.equal(service.getLeaderId(), 'mg-1-r1', 'Should be own leader');
    t.ok(leaderEvent, 'Should emit leaderElected event');

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - getStatus returns complete status', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
    });

    await service.initialize();

    const status = service.getStatus();

    t.equal(status.groupId, 'mg-1', 'Should have groupId');
    t.equal(status.replicaId, 'mg-1-r1', 'Should have replicaId');
    t.equal(status.nodeId, nodeId, 'Should have nodeId');
    t.ok(status.role, 'Should have role');
    t.equal(typeof status.term, 'number', 'Should have term');
    t.equal(typeof status.logLength, 'number', 'Should have logLength');
    t.equal(status.initialized, true, 'Should be initialized');

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - shutdown cleans up', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
    });

    await service.initialize();

    let shutdownEvent = null;
    service.on('shutdown', (event) => {
      shutdownEvent = event;
    });

    await service.shutdown();

    t.equal(service.initialized, false, 'Should not be initialized');
    t.ok(shutdownEvent, 'Should emit shutdown event');
    t.equal(shutdownEvent.groupId, 'mg-1', 'Event should have groupId');
  } finally {
    await cleanup();
  }
});

test('InMemoryRaftStorage - appendEntry adds entries', async (t) => {
  const storage = new InMemoryRaftStorage();

  const entry1 = storage.appendEntry({type: 'MESSAGE', data: 'test1'});
  const entry2 = storage.appendEntry({type: 'MESSAGE', data: 'test2'});

  t.equal(entry1.index, 1, 'First entry should have index 1');
  t.equal(entry2.index, 2, 'Second entry should have index 2');
  t.equal(storage.getLogLength(), 2, 'Should have 2 entries');
});

test('InMemoryRaftStorage - getEntriesFrom returns entries', async (t) => {
  const storage = new InMemoryRaftStorage();

  storage.appendEntry({type: 'MESSAGE', data: 'test1'});
  storage.appendEntry({type: 'MESSAGE', data: 'test2'});
  storage.appendEntry({type: 'MESSAGE', data: 'test3'});

  const fromStart = storage.getEntriesFrom(1);
  t.equal(fromStart.length, 3, 'Should return all entries from start');

  const fromMiddle = storage.getEntriesFrom(2);
  t.equal(fromMiddle.length, 2, 'Should return entries from index 2');
  t.equal(fromMiddle[0].data.data, 'test2', 'First should be test2');
});

test('InMemoryRaftStorage - getLastEntry returns last', async (t) => {
  const storage = new InMemoryRaftStorage();

  t.equal(storage.getLastEntry(), null, 'Should return null when empty');

  storage.appendEntry({type: 'MESSAGE', data: 'test1'});
  storage.appendEntry({type: 'MESSAGE', data: 'test2'});

  const last = storage.getLastEntry();
  t.equal(last.data.data, 'test2', 'Should return last entry');
});

test('InMemoryRaftStorage - truncateFrom removes entries', async (t) => {
  const storage = new InMemoryRaftStorage();

  storage.appendEntry({type: 'MESSAGE', data: 'test1'});
  storage.appendEntry({type: 'MESSAGE', data: 'test2'});
  storage.appendEntry({type: 'MESSAGE', data: 'test3'});

  storage.truncateFrom(2);

  t.equal(storage.getLogLength(), 1, 'Should have 1 entry after truncate');
  t.equal(storage.getLastEntry().data.data, 'test1', 'Should keep first entry');
});
