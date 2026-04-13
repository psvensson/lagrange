/**
 * Tests for NodeJoiningService CDC subscription functionality.
 * Requirements: 4.1, 4.2, 4.3 - CDC subscriptions keep cache updated.
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {EventEmitter} from 'events';

// Initialize configuration and logging for tests
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-node'},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }

  NodeService.resetInstance();
}

test('subscribeToCDCEvents - subscribes to all CDC event types', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'test-node-1',
    nodeAddress: 'ws://localhost:9090',
    seedNodeAddress: 'http://localhost:8080',
  });

  // Create a mock CDC integration service
  const mockCDC = new EventEmitter();
  service.cdcIntegrationService = mockCDC;

  // Track which events were subscribed to
  const subscribedEvents = [];
  const originalOn = mockCDC.on.bind(mockCDC);
  mockCDC.on = (event, handler) => {
    subscribedEvents.push(event);
    return originalOn(event, handler);
  };

  // Call subscribeToCDCEvents
  await service.subscribeToCDCEvents();

  // Verify all event types are subscribed
  t.ok(subscribedEvents.includes('insert'), 'subscribed to insert events');
  t.ok(subscribedEvents.includes('update'), 'subscribed to update events');
  t.ok(subscribedEvents.includes('delete'), 'subscribed to delete events');
  t.ok(subscribedEvents.includes('upsert'), 'subscribed to upsert events');
  t.equal(subscribedEvents.length, 4, 'subscribed to exactly 4 event types');
});

test('subscribeToCDCEvents - handles CDC events correctly', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'test-node-1',
    nodeAddress: 'ws://localhost:9090',
    seedNodeAddress: 'http://localhost:8080',
  });

  // Create a mock CDC integration service
  const mockCDC = new EventEmitter();
  service.cdcIntegrationService = mockCDC;

  // Subscribe to CDC events
  await service.subscribeToCDCEvents();

  // Emit a test CDC event
  const testEvent = {
    tableName: 'nodes',
    operation: 'insert',
    data: {node_id: 'node-1', status: 'active'},
  };

  // The event should be handled without errors
  t.doesNotThrow(() => {
    mockCDC.emit('insert', testEvent);
  }, 'handles insert event without error');

  t.doesNotThrow(() => {
    mockCDC.emit('update', testEvent);
  }, 'handles update event without error');

  t.doesNotThrow(() => {
    mockCDC.emit('delete', testEvent);
  }, 'handles delete event without error');

  t.doesNotThrow(() => {
    mockCDC.emit('upsert', testEvent);
  }, 'handles upsert event without error');
});

test('subscribeToCDCEvents - throws error if CDC service not available', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'test-node-1',
    nodeAddress: 'ws://localhost:9090',
    seedNodeAddress: 'http://localhost:8080',
  });

  // Don't set cdcIntegrationService
  service.cdcIntegrationService = null;

  // Should throw error
  try {
    await service.subscribeToCDCEvents();
    t.fail('should have thrown error');
  } catch (error) {
    t.ok(error.message.includes('CDC'), 'error mentions CDC');
    t.ok(
      error.message.includes('not available'),
      'error mentions service not available',
    );
  }
});

test('subscribeToCDCEvents - retries on subscription failure', async (t) => {
  initializeTestEnvironment();

  let callCount = 0;
  const service = new NodeJoiningService({
    nodeId: 'test-node-1',
    nodeAddress: 'ws://localhost:9090',
    seedNodeAddress: 'http://localhost:8080',
    sleep: () => Promise.resolve(),
  });

  // Create a mock CDC integration service that fails then succeeds
  const mockCDC = new EventEmitter();
  const originalOn = mockCDC.on.bind(mockCDC);
  mockCDC.on = (event, handler) => {
    callCount++;
    // Fail on first 4 calls (first attempt), succeed after
    if (callCount <= 4) {
      throw new Error('Subscription failed');
    }
    return originalOn(event, handler);
  };
  service.cdcIntegrationService = mockCDC;

  // Should complete without throwing after retry
  await service.subscribeToCDCEvents();

  t.ok(
    service.cdcSubscriptionsActive,
    'cdcSubscriptionsActive set after retry success',
  );
  t.ok(callCount > 4, 'retried after initial failure');
});

test('subscribeToCDCEvents - verifies subscriptions are active', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'test-node-1',
    nodeAddress: 'ws://localhost:9090',
    seedNodeAddress: 'http://localhost:8080',
  });

  // Create a mock CDC integration service
  const mockCDC = new EventEmitter();
  service.cdcIntegrationService = mockCDC;

  // Subscribe to CDC events
  await service.subscribeToCDCEvents();

  // Verify subscriptions are active by checking listener counts
  t.ok(
    mockCDC.listenerCount('insert') > 0,
    'insert event has active listeners',
  );
  t.ok(
    mockCDC.listenerCount('update') > 0,
    'update event has active listeners',
  );
  t.ok(
    mockCDC.listenerCount('delete') > 0,
    'delete event has active listeners',
  );
  t.ok(
    mockCDC.listenerCount('upsert') > 0,
    'upsert event has active listeners',
  );

  // Verify the cdcSubscriptionsActive flag is set
  t.equal(
    service.cdcSubscriptionsActive,
    true,
    'cdcSubscriptionsActive flag is set to true',
  );
});

test('subscribeToCDCEvents - exhausts retries when listeners never register', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'test-node-1',
    nodeAddress: 'ws://localhost:9090',
    seedNodeAddress: 'http://localhost:8080',
    sleep: () => Promise.resolve(),
  });

  // Create a mock CDC integration service that never registers
  const mockCDC = new EventEmitter();
  mockCDC.on = (_event, _handler) => {
    // Don't actually register the listener
    return mockCDC;
  };
  mockCDC.listenerCount = () => 0; // Always return 0 listeners
  mockCDC.removeListener = () => mockCDC;
  service.cdcIntegrationService = mockCDC;

  // Should complete without throwing — retries are exhausted
  // but the method does not block indefinitely
  await service.subscribeToCDCEvents();

  t.ok(
    service.cdcSubscriptionsActive,
    'cdcSubscriptionsActive set even after exhausted retries',
  );
});
