/**
 * Unit tests for MessageGroupTransport.
 * Tests message routing through message groups for location transparency.
 */

import {test} from 'tap';
import {
  MessageGroupTransport,
  MGTransportMessageType,
} from '../../src/transport/message-group-transport.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

// Initialize configuration and logging for tests (module level)
ConfigurationManager.resetInstance();
LoggingService.resetInstance();
const config = ConfigurationManager.getInstance();
config.initialize({node: {id: 'test-node'}});
const logger = LoggingService.getInstance();
logger.initialize({level: 'error'});

test('MessageGroupTransport', async (t) => {
  t.test('constructor creates transport with default options', async (t) => {
    const transport = new MessageGroupTransport();

    t.ok(transport.transportId, 'should have transport ID');
    t.ok(transport.localAddress, 'should have local address');
    t.equal(transport.initialized, false, 'should not be initialized');
    t.equal(transport.messageCount, 0, 'should have zero messages');
  });

  t.test('constructor accepts custom options', async (t) => {
    const transport = new MessageGroupTransport({
      localAddress: 'custom-address',
      localNodeId: 'node-1',
    });

    t.equal(transport.localAddress, 'custom-address', 'should use custom address');
    t.equal(transport.localNodeId, 'node-1', 'should use custom node ID');
  });

  t.test('initialize sets initialized flag', async (t) => {
    const transport = new MessageGroupTransport();

    await transport.initialize();

    t.equal(transport.initialized, true, 'should be initialized');

    await transport.shutdown();
  });

  t.test('initialize is idempotent', async (t) => {
    const transport = new MessageGroupTransport();

    await transport.initialize();
    await transport.initialize();

    t.equal(transport.initialized, true, 'should remain initialized');

    await transport.shutdown();
  });

  t.test('setMessageGroupProvider sets provider function', async (t) => {
    const transport = new MessageGroupTransport();
    const provider = () => ({groupId: 'mg-1'});

    transport.setMessageGroupProvider(provider);

    t.equal(transport.getLocalMessageGroup, provider, 'should set provider');
  });

  t.test('setMessageGroupProvider throws for non-function', async (t) => {
    const transport = new MessageGroupTransport();

    t.throws(() => {
      transport.setMessageGroupProvider('not-a-function');
    }, /must be a function/, 'should throw for invalid provider');
  });

  t.test('setServiceLocationResolver sets resolver function', async (t) => {
    const transport = new MessageGroupTransport();
    const resolver = () => ({nodeId: 'node-1'});

    transport.setServiceLocationResolver(resolver);

    t.equal(transport.resolveServiceLocation, resolver, 'should set resolver');
  });

  t.test('setServiceLocationResolver throws for non-function', async (t) => {
    const transport = new MessageGroupTransport();

    t.throws(() => {
      transport.setServiceLocationResolver('not-a-function');
    }, /must be a function/, 'should throw for invalid resolver');
  });

  t.test('register adds message handler', async (t) => {
    const transport = new MessageGroupTransport();
    const handler = () => ({acknowledged: true});

    transport.register('service-1', handler);

    t.ok(transport.isRegistered('service-1'), 'should be registered');
  });

  t.test('register throws for non-function handler', async (t) => {
    const transport = new MessageGroupTransport();

    t.throws(() => {
      transport.register('service-1', 'not-a-function');
    }, /Handler must be a function/, 'should throw for invalid handler');
  });

  t.test('unregister removes message handler', async (t) => {
    const transport = new MessageGroupTransport();
    const handler = () => ({acknowledged: true});

    transport.register('service-1', handler);
    transport.unregister('service-1');

    t.notOk(transport.isRegistered('service-1'), 'should not be registered');
  });

  t.test('deliver to local handler succeeds', async (t) => {
    const transport = new MessageGroupTransport({
      localAddress: 'source-service',
    });
    let receivedMessage = null;

    transport.register('target-service', (envelope) => {
      receivedMessage = envelope;
      return {acknowledged: true, data: 'response'};
    });

    const result = await transport.deliver('target-service', {
      type: 'test',
      data: 'hello',
    });

    t.ok(result.acknowledged, 'should be acknowledged');
    t.equal(result.deliveryType, 'local', 'should be local delivery');
    t.ok(receivedMessage, 'should receive message');
    t.equal(receivedMessage.payload.data, 'hello', 'should have correct data');
    t.equal(receivedMessage.isLocal, true, 'should be marked as local');

    await transport.shutdown();
  });

  t.test('deliver auto-initializes transport', async (t) => {
    const transport = new MessageGroupTransport();
    transport.register('service', () => ({acknowledged: true}));

    t.equal(transport.initialized, false, 'should not be initialized');

    await transport.deliver('service', {type: 'test'});

    t.equal(transport.initialized, true, 'should be initialized after deliver');

    await transport.shutdown();
  });

  t.test('deliver returns error when no message group provider', async (t) => {
    const transport = new MessageGroupTransport();
    await transport.initialize();

    const result = await transport.deliver('remote-service', {
      type: 'test',
    });

    t.notOk(result.acknowledged, 'should not be acknowledged');
    t.ok(result.error, 'should have error');
    t.match(result.error, /No message group provider/, 'should mention provider');

    await transport.shutdown();
  });

  t.test('deliver returns error when message group unavailable', async (t) => {
    const transport = new MessageGroupTransport();
    transport.setMessageGroupProvider(() => null);
    await transport.initialize();

    const result = await transport.deliver('remote-service', {
      type: 'test',
    });

    t.notOk(result.acknowledged, 'should not be acknowledged');
    t.ok(result.error, 'should have error');
    t.match(result.error, /No local message group/, 'should mention message group');

    await transport.shutdown();
  });

  t.test('deliver routes through message group', async (t) => {
    const transport = new MessageGroupTransport({
      localAddress: 'source-service',
      localNodeId: 'node-1',
    });

    let sentMessage = null;
    const mockMessageGroup = {
      groupId: 'mg-1',
      sendMessage: async (target, message) => {
        sentMessage = {target, message};
        return {status: 'delivered'};
      },
    };

    transport.setMessageGroupProvider(() => mockMessageGroup);
    await transport.initialize();

    const result = await transport.deliver('remote-service', {
      type: 'test',
      data: 'hello',
    });

    t.ok(result.acknowledged, 'should be acknowledged');
    t.equal(result.deliveryType, 'message_group', 'should be message group delivery');
    t.ok(sentMessage, 'should send through message group');
    t.equal(sentMessage.target, 'remote-service', 'should have correct target');

    await transport.shutdown();
  });

  t.test('handleIncomingMessage routes to handler', async (t) => {
    const transport = new MessageGroupTransport();
    let receivedMessage = null;

    transport.register('target-service', (envelope) => {
      receivedMessage = envelope;
      return {acknowledged: true};
    });

    const result = await transport.handleIncomingMessage({
      messageId: 'msg-1',
      targetAddress: 'target-service',
      sourceAddress: 'source-service',
      sourceNodeId: 'node-2',
      payload: {data: 'hello'},
      timestamp: Date.now(),
    });

    t.ok(result.acknowledged, 'should be acknowledged');
    t.ok(receivedMessage, 'should receive message');
    t.equal(receivedMessage.payload.data, 'hello', 'should have correct data');

    await transport.shutdown();
  });

  t.test('handleIncomingMessage returns error for unknown target', async (t) => {
    const transport = new MessageGroupTransport();

    const result = await transport.handleIncomingMessage({
      messageId: 'msg-1',
      targetAddress: 'unknown-service',
      payload: {data: 'hello'},
    });

    t.notOk(result.acknowledged, 'should not be acknowledged');
    t.ok(result.error, 'should have error');

    await transport.shutdown();
  });

  t.test('handleIncomingMessage emits unhandledMessage event', async (t) => {
    const transport = new MessageGroupTransport();
    let emittedEnvelope = null;

    transport.on('unhandledMessage', (envelope) => {
      emittedEnvelope = envelope;
    });

    await transport.handleIncomingMessage({
      messageId: 'msg-1',
      targetAddress: 'unknown-service',
      payload: {data: 'hello'},
    });

    t.ok(emittedEnvelope, 'should emit event');
    t.equal(emittedEnvelope.messageId, 'msg-1', 'should have message ID');

    await transport.shutdown();
  });

  t.test('sendAppendEntries sends Raft message', async (t) => {
    const transport = new MessageGroupTransport();
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
      MGTransportMessageType.RAFT_APPEND_ENTRIES,
      'should send append entries type',
    );

    await transport.shutdown();
  });

  t.test('sendRequestVote sends Raft vote request', async (t) => {
    const transport = new MessageGroupTransport();
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
      MGTransportMessageType.RAFT_REQUEST_VOTE,
      'should send request vote type',
    );

    await transport.shutdown();
  });

  t.test('broadcast sends to multiple targets', async (t) => {
    const transport = new MessageGroupTransport({
      localAddress: 'self',
    });
    const received = [];

    transport.register('target-1', () => {
      received.push('target-1');
      return {acknowledged: true};
    });
    transport.register('target-2', () => {
      received.push('target-2');
      return {acknowledged: true};
    });
    transport.register('self', () => {
      received.push('self');
      return {acknowledged: true};
    });

    const results = await transport.broadcast(
      ['target-1', 'target-2', 'self'],
      {type: 'test'},
    );

    t.equal(results.length, 2, 'should send to 2 targets (excluding self)');
    t.ok(received.includes('target-1'), 'should send to target-1');
    t.ok(received.includes('target-2'), 'should send to target-2');
    t.notOk(received.includes('self'), 'should not send to self');

    await transport.shutdown();
  });

  t.test('getRegisteredAddresses returns all addresses', async (t) => {
    const transport = new MessageGroupTransport();

    transport.register('service-1', () => ({}));
    transport.register('service-2', () => ({}));

    const addresses = transport.getRegisteredAddresses();

    t.equal(addresses.length, 2, 'should have two addresses');
    t.ok(addresses.includes('service-1'), 'should include service-1');
    t.ok(addresses.includes('service-2'), 'should include service-2');

    await transport.shutdown();
  });

  t.test('getStats returns transport statistics', async (t) => {
    const transport = new MessageGroupTransport({
      localAddress: 'test-address',
      localNodeId: 'test-node',
    });
    transport.register('service', () => ({}));
    transport.setMessageGroupProvider(() => ({}));

    const stats = transport.getStats();

    t.ok(stats.transportId, 'should have transport ID');
    t.equal(stats.localAddress, 'test-address', 'should have local address');
    t.equal(stats.localNodeId, 'test-node', 'should have local node ID');
    t.equal(stats.registeredServices, 1, 'should have one service');
    t.equal(stats.hasMessageGroupProvider, true, 'should have provider');

    await transport.shutdown();
  });

  t.test('shutdown clears all state', async (t) => {
    const transport = new MessageGroupTransport();
    transport.register('service', () => ({}));
    await transport.initialize();

    await transport.shutdown();

    t.equal(transport.initialized, false, 'should not be initialized');
    t.equal(transport.messageHandlers.size, 0, 'should have no handlers');
  });

  t.test('emits initialized event', async (t) => {
    const transport = new MessageGroupTransport();
    let eventData = null;

    transport.on('initialized', (data) => {
      eventData = data;
    });

    await transport.initialize();

    t.ok(eventData, 'should emit event');
    t.ok(eventData.transportId, 'should have transport ID');

    await transport.shutdown();
  });

  t.test('emits shutdown event', async (t) => {
    const transport = new MessageGroupTransport();
    let eventData = null;

    transport.on('shutdown', (data) => {
      eventData = data;
    });

    await transport.shutdown();

    t.ok(eventData, 'should emit event');
    t.ok(eventData.transportId, 'should have transport ID');
  });

  t.test('MGTransportMessageType enum has expected values', async (t) => {
    t.equal(MGTransportMessageType.RAFT_APPEND_ENTRIES, 'mg_raft_append_entries');
    t.equal(MGTransportMessageType.RAFT_REQUEST_VOTE, 'mg_raft_request_vote');
    t.equal(MGTransportMessageType.SERVICE_MESSAGE, 'mg_service_message');
    t.equal(MGTransportMessageType.SERVICE_RESPONSE, 'mg_service_response');
  });

  t.test('handles handler errors gracefully', async (t) => {
    const transport = new MessageGroupTransport();

    transport.register('error-service', () => {
      throw new Error('Handler error');
    });

    const result = await transport.deliver('error-service', {type: 'test'});

    t.notOk(result.acknowledged, 'should not be acknowledged');
    t.ok(result.error, 'should have error message');

    await transport.shutdown();
  });

  t.test('increments message count on deliver', async (t) => {
    const transport = new MessageGroupTransport();
    transport.register('service', () => ({acknowledged: true}));

    t.equal(transport.messageCount, 0, 'should start at zero');

    await transport.deliver('service', {type: 'test'});
    t.equal(transport.messageCount, 1, 'should increment');

    await transport.deliver('service', {type: 'test'});
    t.equal(transport.messageCount, 2, 'should increment again');

    await transport.shutdown();
  });
});
