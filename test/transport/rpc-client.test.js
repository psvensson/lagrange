/**
 * Unit tests for RPCClient.
 * Tests request-response pattern over message groups.
 */

import {test} from '../../src/test-helpers/tap.js';
import {RPCClient} from '../../src/transport/rpc-client.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

// Initialize configuration and logging for tests
ConfigurationManager.resetInstance();
LoggingService.resetInstance();
const config = ConfigurationManager.getInstance();
config.initialize({node: {id: 'test-node'}});
const logger = LoggingService.getInstance();
logger.initialize({level: 'error'});

test('RPCClient', async (t) => {
  t.test('constructor creates client with default options', async (t) => {
    const client = new RPCClient();

    t.equal(client.defaultTimeoutMs, 30000, 'should have default timeout');
    t.equal(client.pendingRequests.size, 0, 'should have no pending requests');
    t.equal(client.messageGroupService, null, 'should have no message group service');
  });

  t.test('constructor accepts custom options', async (t) => {
    const mockService = {sendMessage: async () => ({})};
    const client = new RPCClient({
      messageGroupService: mockService,
      defaultTimeoutMs: 5000,
    });

    t.equal(client.defaultTimeoutMs, 5000, 'should use custom timeout');
    t.equal(client.messageGroupService, mockService, 'should use custom service');
  });

  t.test('setMessageGroupService sets the service', async (t) => {
    const client = new RPCClient();
    const mockService = {sendMessage: async () => ({})};

    client.setMessageGroupService(mockService);

    t.equal(client.messageGroupService, mockService, 'should set service');
  });

  t.test('call throws without message group service', async (t) => {
    const client = new RPCClient();

    await t.rejects(
      client.call('target', {type: 'test'}),
      /No message group service configured/,
      'should throw without service',
    );
  });

  t.test('call sends message with correlation ID', async (t) => {
    let sentMessage = null;
    const mockService = {
      sendMessage: async (target, message) => {
        sentMessage = {target, message};
        return {status: 'delivered'};
      },
    };

    const client = new RPCClient({
      messageGroupService: mockService,
      defaultTimeoutMs: 100,
    });

    // Start the call but don't await (it will timeout)
    const callPromise = client.call('target-service', {type: 'test', data: 'hello'});

    // Give time for message to be sent
    await new Promise((resolve) => setTimeout(resolve, 10));

    t.ok(sentMessage, 'should send message');
    t.equal(sentMessage.target, 'target-service', 'should send to correct target');
    t.ok(sentMessage.message.correlationId, 'should include correlation ID');
    t.equal(sentMessage.message.type, 'test', 'should include request type');
    t.equal(sentMessage.message.data, 'hello', 'should include request data');

    // Clean up - let it timeout
    try {
      await callPromise;
    } catch (_e) {
      // Expected timeout
    }

    await client.shutdown();
  });

  t.test('call resolves when handleResponse is called', async (t) => {
    let capturedCorrelationId = null;
    const mockService = {
      sendMessage: async (_target, message) => {
        capturedCorrelationId = message.correlationId;
        return {status: 'delivered'};
      },
    };

    const client = new RPCClient({
      messageGroupService: mockService,
      defaultTimeoutMs: 1000,
    });

    // Start the call
    const callPromise = client.call('target', {type: 'test'});

    // Give time for message to be sent
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Simulate response
    const matched = client.handleResponse(capturedCorrelationId, {
      status: 'success',
      data: 'response-data',
    });

    t.ok(matched, 'should match pending request');

    const result = await callPromise;

    t.equal(result.status, 'success', 'should resolve with response status');
    t.equal(result.data, 'response-data', 'should resolve with response data');

    await client.shutdown();
  });

  t.test('call rejects on timeout', async (t) => {
    const mockService = {
      sendMessage: async () => ({status: 'delivered'}),
    };

    const client = new RPCClient({
      messageGroupService: mockService,
      defaultTimeoutMs: 50,
    });

    await t.rejects(
      client.call('target', {type: 'test'}),
      /RPC timeout after 50ms/,
      'should reject with timeout error',
    );

    t.equal(client.stats.timeouts, 1, 'should increment timeout counter');

    await client.shutdown();
  });

  t.test('call uses custom timeout from options', async (t) => {
    const mockService = {
      sendMessage: async () => ({status: 'delivered'}),
    };

    const client = new RPCClient({
      messageGroupService: mockService,
      defaultTimeoutMs: 5000,
    });

    await t.rejects(
      client.call('target', {type: 'test'}, {timeout: 50}),
      /RPC timeout after 50ms/,
      'should use custom timeout',
    );

    await client.shutdown();
  });

  t.test('call rejects on send error', async (t) => {
    const mockService = {
      sendMessage: async () => {
        throw new Error('Send failed');
      },
    };

    const client = new RPCClient({
      messageGroupService: mockService,
      defaultTimeoutMs: 1000,
    });

    await t.rejects(
      client.call('target', {type: 'test'}),
      /Send failed/,
      'should reject with send error',
    );

    t.equal(client.stats.errors, 1, 'should increment error counter');

    await client.shutdown();
  });

  t.test('handleResponse returns false for unknown correlation ID', async (t) => {
    const client = new RPCClient();

    const matched = client.handleResponse('unknown-id', {data: 'test'});

    t.notOk(matched, 'should not match unknown ID');
  });

  t.test('handleResponse cleans up pending request', async (t) => {
    let capturedCorrelationId = null;
    const mockService = {
      sendMessage: async (_target, message) => {
        capturedCorrelationId = message.correlationId;
        return {status: 'delivered'};
      },
    };

    const client = new RPCClient({
      messageGroupService: mockService,
      defaultTimeoutMs: 1000,
    });

    const callPromise = client.call('target', {type: 'test'});
    await new Promise((resolve) => setTimeout(resolve, 10));

    t.equal(client.getPendingCount(), 1, 'should have pending request');

    client.handleResponse(capturedCorrelationId, {status: 'ok'});

    t.equal(client.getPendingCount(), 0, 'should remove pending request');

    await callPromise;
    await client.shutdown();
  });

  t.test('getPendingCount returns correct count', async (t) => {
    const mockService = {
      sendMessage: async () => ({status: 'delivered'}),
    };

    const client = new RPCClient({
      messageGroupService: mockService,
      defaultTimeoutMs: 1000,
    });

    t.equal(client.getPendingCount(), 0, 'should start at zero');

    // Start multiple calls without awaiting
    const promises = [
      client.call('target1', {type: 'test'}),
      client.call('target2', {type: 'test'}),
    ];

    await new Promise((resolve) => setTimeout(resolve, 10));

    t.equal(client.getPendingCount(), 2, 'should have two pending');

    // Cancel all
    await client.shutdown();

    // Clean up promises
    for (const p of promises) {
      try {
        await p;
      } catch (_e) {
        // Expected
      }
    }
  });

  t.test('hasPendingRequest checks for correlation ID', async (t) => {
    let capturedCorrelationId = null;
    const mockService = {
      sendMessage: async (_target, message) => {
        capturedCorrelationId = message.correlationId;
        return {status: 'delivered'};
      },
    };

    const client = new RPCClient({
      messageGroupService: mockService,
      defaultTimeoutMs: 1000,
    });

    const callPromise = client.call('target', {type: 'test'});
    await new Promise((resolve) => setTimeout(resolve, 10));

    t.ok(client.hasPendingRequest(capturedCorrelationId), 'should have pending');
    t.notOk(client.hasPendingRequest('unknown'), 'should not have unknown');

    await client.shutdown();
    try {
      await callPromise;
    } catch (_e) {
      // Expected
    }
  });

  t.test('cancelRequest cancels pending request', async (t) => {
    let capturedCorrelationId = null;
    const mockService = {
      sendMessage: async (_target, message) => {
        capturedCorrelationId = message.correlationId;
        return {status: 'delivered'};
      },
    };

    const client = new RPCClient({
      messageGroupService: mockService,
      defaultTimeoutMs: 5000,
    });

    const callPromise = client.call('target', {type: 'test'});
    await new Promise((resolve) => setTimeout(resolve, 10));

    const cancelled = client.cancelRequest(capturedCorrelationId, 'Test cancel');

    t.ok(cancelled, 'should return true for cancelled');

    await t.rejects(
      callPromise,
      /RPC cancelled: Test cancel/,
      'should reject with cancel reason',
    );

    await client.shutdown();
  });

  t.test('cancelRequest returns false for unknown ID', async (t) => {
    const client = new RPCClient();

    const cancelled = client.cancelRequest('unknown-id');

    t.notOk(cancelled, 'should return false for unknown');
  });

  t.test('getStats returns statistics', async (t) => {
    const mockService = {
      sendMessage: async () => ({status: 'delivered'}),
    };

    const client = new RPCClient({
      messageGroupService: mockService,
      defaultTimeoutMs: 50,
    });

    // Trigger a timeout
    try {
      await client.call('target', {type: 'test'});
    } catch (_e) {
      // Expected timeout
    }

    const stats = client.getStats();

    t.equal(stats.requestsSent, 1, 'should track requests sent');
    t.equal(stats.timeouts, 1, 'should track timeouts');
    t.equal(stats.pendingRequests, 0, 'should track pending requests');

    await client.shutdown();
  });

  t.test('shutdown cancels all pending requests', async (t) => {
    const mockService = {
      sendMessage: async () => ({status: 'delivered'}),
    };

    const client = new RPCClient({
      messageGroupService: mockService,
      defaultTimeoutMs: 5000,
    });

    const promises = [
      client.call('target1', {type: 'test'}),
      client.call('target2', {type: 'test'}),
    ];

    await new Promise((resolve) => setTimeout(resolve, 10));
    t.equal(client.getPendingCount(), 2, 'should have pending requests');

    await client.shutdown();

    t.equal(client.getPendingCount(), 0, 'should clear pending requests');

    // All promises should reject
    for (const p of promises) {
      await t.rejects(p, /RPC client shutdown/, 'should reject with shutdown');
    }
  });

  t.test('emits timeout event', async (t) => {
    const mockService = {
      sendMessage: async () => ({status: 'delivered'}),
    };

    const client = new RPCClient({
      messageGroupService: mockService,
      defaultTimeoutMs: 50,
    });

    let timeoutEvent = null;
    client.on('timeout', (event) => {
      timeoutEvent = event;
    });

    try {
      await client.call('target-service', {type: 'test'});
    } catch (_e) {
      // Expected timeout
    }

    t.ok(timeoutEvent, 'should emit timeout event');
    t.ok(timeoutEvent.correlationId, 'should include correlation ID');
    t.equal(timeoutEvent.target, 'target-service', 'should include target');
    t.equal(timeoutEvent.timeoutMs, 50, 'should include timeout');

    await client.shutdown();
  });

  t.test('emits response event', async (t) => {
    let capturedCorrelationId = null;
    const mockService = {
      sendMessage: async (_target, message) => {
        capturedCorrelationId = message.correlationId;
        return {status: 'delivered'};
      },
    };

    const client = new RPCClient({
      messageGroupService: mockService,
      defaultTimeoutMs: 1000,
    });

    let responseEvent = null;
    client.on('response', (event) => {
      responseEvent = event;
    });

    const callPromise = client.call('target', {type: 'test'});
    await new Promise((resolve) => setTimeout(resolve, 10));

    client.handleResponse(capturedCorrelationId, {status: 'ok'});
    await callPromise;

    t.ok(responseEvent, 'should emit response event');
    t.equal(responseEvent.correlationId, capturedCorrelationId, 'should include ID');
    t.ok(responseEvent.latencyMs >= 0, 'should include latency');
    t.same(responseEvent.response, {status: 'ok'}, 'should include response');

    await client.shutdown();
  });

  t.test('emits shutdown event', async (t) => {
    const client = new RPCClient();

    let shutdownEmitted = false;
    client.on('shutdown', () => {
      shutdownEmitted = true;
    });

    await client.shutdown();

    t.ok(shutdownEmitted, 'should emit shutdown event');
  });
});
