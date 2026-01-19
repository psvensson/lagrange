/**
 * Unit tests for InMemoryTransport.
 * Tests local message passing for single-node bootstrap.
 */

import {test} from 'tap';
import {InMemoryTransport, TransportMessageType} from
  '../../src/transport/in-memory-transport.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

// Initialize configuration and logging for tests (module level)
ConfigurationManager.resetInstance();
LoggingService.resetInstance();
const config = ConfigurationManager.getInstance();
config.initialize({node: {id: 'test-node'}});
const logger = LoggingService.getInstance();
logger.initialize({level: 'error'});

test('InMemoryTransport', async (t) => {
  t.test('constructor creates transport with default options', async (t) => {
    const transport = new InMemoryTransport();

    t.ok(transport.transportId, 'should have transport ID');
    t.ok(transport.localAddress, 'should have local address');
    t.equal(transport.initialized, false, 'should not be initialized');
    t.equal(transport.getServiceCount(), 0, 'should have no services');
  });

  t.test('constructor accepts custom local address', async (t) => {
    const transport = new InMemoryTransport({
      localAddress: 'custom-address',
    });

    t.equal(transport.localAddress, 'custom-address', 'should use custom address');
  });

  t.test('initialize sets initialized flag', async (t) => {
    const transport = new InMemoryTransport();

    await transport.initialize();

    t.equal(transport.initialized, true, 'should be initialized');
  });

  t.test('initialize is idempotent', async (t) => {
    const transport = new InMemoryTransport();

    await transport.initialize();
    await transport.initialize();

    t.equal(transport.initialized, true, 'should remain initialized');
  });

  t.test('register adds service handler', async (t) => {
    const transport = new InMemoryTransport();
    const handler = () => ({acknowledged: true});

    transport.register('service-1', handler);

    t.equal(transport.getServiceCount(), 1, 'should have one service');
    t.ok(transport.isRegistered('service-1'), 'should be registered');
  });

  t.test('register throws for non-function handler', async (t) => {
    const transport = new InMemoryTransport();

    t.throws(() => {
      transport.register('service-1', 'not-a-function');
    }, /Handler must be a function/, 'should throw for invalid handler');
  });

  t.test('unregister removes service handler', async (t) => {
    const transport = new InMemoryTransport();
    const handler = () => ({acknowledged: true});

    transport.register('service-1', handler);
    transport.unregister('service-1');

    t.equal(transport.getServiceCount(), 0, 'should have no services');
    t.notOk(transport.isRegistered('service-1'), 'should not be registered');
  });

  t.test('deliver sends message to registered service', async (t) => {
    const transport = new InMemoryTransport();
    let receivedMessage = null;

    transport.register('target-service', (envelope) => {
      receivedMessage = envelope;
      return {acknowledged: true};
    });

    const result = await transport.deliver('target-service', {
      type: 'test',
      data: 'hello',
    });

    t.ok(result.acknowledged, 'should be acknowledged');
    t.ok(receivedMessage, 'should receive message');
    t.equal(receivedMessage.payload.data, 'hello', 'should have correct data');
  });

  t.test('deliver returns error for unregistered service', async (t) => {
    const transport = new InMemoryTransport();

    const result = await transport.deliver('unknown-service', {
      type: 'test',
    });

    t.notOk(result.acknowledged, 'should not be acknowledged');
    t.ok(result.error, 'should have error');
  });

  t.test('deliver auto-initializes transport', async (t) => {
    const transport = new InMemoryTransport();
    transport.register('service', () => ({acknowledged: true}));

    t.equal(transport.initialized, false, 'should not be initialized');

    await transport.deliver('service', {type: 'test'});

    t.equal(transport.initialized, true, 'should be initialized after deliver');
  });

  t.test('sendAppendEntries sends Raft message', async (t) => {
    const transport = new InMemoryTransport();
    let receivedType = null;

    transport.register('replica-1', (envelope) => {
      receivedType = envelope.payload.type;
      return {acknowledged: true};
    });

    await transport.sendAppendEntries('replica-1', {
      term: 1,
      leaderId: 'leader',
      entries: [],
    });

    t.equal(
      receivedType,
      TransportMessageType.RAFT_APPEND_ENTRIES,
      'should send append entries type',
    );
  });

  t.test('sendRequestVote sends Raft vote request', async (t) => {
    const transport = new InMemoryTransport();
    let receivedType = null;

    transport.register('replica-1', (envelope) => {
      receivedType = envelope.payload.type;
      return {acknowledged: true};
    });

    await transport.sendRequestVote('replica-1', {
      term: 1,
      candidateId: 'candidate',
      lastLogIndex: 0,
      lastLogTerm: 0,
    });

    t.equal(
      receivedType,
      TransportMessageType.RAFT_REQUEST_VOTE,
      'should send request vote type',
    );
  });

  t.test('broadcast sends to all services except self', async (t) => {
    const transport = new InMemoryTransport({localAddress: 'self'});
    const received = [];

    transport.register('self', () => {
      received.push('self');
      return {acknowledged: true};
    });
    transport.register('other-1', () => {
      received.push('other-1');
      return {acknowledged: true};
    });
    transport.register('other-2', () => {
      received.push('other-2');
      return {acknowledged: true};
    });

    await transport.broadcast({type: 'test'});

    t.notOk(received.includes('self'), 'should not send to self');
    t.ok(received.includes('other-1'), 'should send to other-1');
    t.ok(received.includes('other-2'), 'should send to other-2');
  });

  t.test('getRegisteredAddresses returns all addresses', async (t) => {
    const transport = new InMemoryTransport();

    transport.register('service-1', () => ({}));
    transport.register('service-2', () => ({}));

    const addresses = transport.getRegisteredAddresses();

    t.equal(addresses.length, 2, 'should have two addresses');
    t.ok(addresses.includes('service-1'), 'should include service-1');
    t.ok(addresses.includes('service-2'), 'should include service-2');
  });

  t.test('getStats returns transport statistics', async (t) => {
    const transport = new InMemoryTransport({localAddress: 'test-address'});
    transport.register('service', () => ({}));
    await transport.deliver('service', {type: 'test'});

    const stats = transport.getStats();

    t.ok(stats.transportId, 'should have transport ID');
    t.equal(stats.localAddress, 'test-address', 'should have local address');
    t.equal(stats.registeredServices, 1, 'should have one service');
    t.equal(stats.messageCount, 1, 'should have one message');
  });

  t.test('shutdown clears all state', async (t) => {
    const transport = new InMemoryTransport();
    transport.register('service', () => ({}));
    await transport.initialize();

    await transport.shutdown();

    t.equal(transport.initialized, false, 'should not be initialized');
    t.equal(transport.getServiceCount(), 0, 'should have no services');
  });

  t.test('emits initialized event', async (t) => {
    const transport = new InMemoryTransport();
    let eventData = null;

    transport.on('initialized', (data) => {
      eventData = data;
    });

    await transport.initialize();

    t.ok(eventData, 'should emit event');
    t.ok(eventData.transportId, 'should have transport ID');
  });

  t.test('emits shutdown event', async (t) => {
    const transport = new InMemoryTransport();
    let eventData = null;

    transport.on('shutdown', (data) => {
      eventData = data;
    });

    await transport.shutdown();

    t.ok(eventData, 'should emit event');
    t.ok(eventData.transportId, 'should have transport ID');
  });

  t.test('handles handler errors gracefully', async (t) => {
    const transport = new InMemoryTransport();

    transport.register('error-service', () => {
      throw new Error('Handler error');
    });

    const result = await transport.deliver('error-service', {type: 'test'});

    t.notOk(result.acknowledged, 'should not be acknowledged');
    t.ok(result.error, 'should have error message');
  });
});
