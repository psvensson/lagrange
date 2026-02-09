/**
 * Unit tests for MessageRouter IPC handler registration.
 *
 * Tests the worker IPC integration methods added to MessageRouter
 * for forwarding messages to worker processes.
 *
 * @see Requirements 7.5, 2.5 - Worker IPC Integration
 */

import {describe, it, beforeEach, afterEach, mock} from 'node:test';
import assert from 'node:assert';
import {MessageRouter} from '../../src/transport/message-router.js';

describe('MessageRouter IPC Handler Registration', () => {
  let router;

  beforeEach(() => {
    router = new MessageRouter({
      nodeId: 'node-1',
      inProcess: true,
    });
  });

  afterEach(async () => {
    if (router && router.initialized) {
      await router.shutdown();
    }
    router = null;
  });

  describe('registerWorkerHandler', () => {
    it('should register a worker handler', () => {
      const deliverFn = mock.fn(async () => ({status: 'ok'}));

      router.registerWorkerHandler('node-1/partition/replica-1', deliverFn);

      assert.ok(router.hasWorkerHandler('node-1/partition/replica-1'));
    });

    it('should throw error if delivery function is not a function', () => {
      assert.throws(() => {
        router.registerWorkerHandler('node-1/partition/replica-1', 'not-a-function');
      }, {
        message: /must be a function/i,
      });
    });

    it('should throw error if address is invalid', () => {
      const deliverFn = mock.fn(async () => ({status: 'ok'}));

      assert.throws(() => {
        router.registerWorkerHandler('invalid-address', deliverFn);
      }, {
        message: /invalid.*address/i,
      });
    });

    it('should forward messages to delivery function', async () => {
      const deliverFn = mock.fn(async (envelope) => ({
        status: 'ok',
        received: envelope.payload,
      }));

      router.registerWorkerHandler('node-1/partition/replica-1', deliverFn);

      // Get the handler and call it directly
      const handler = router.handlers.get('node-1/partition/replica-1');
      const result = await handler({
        payload: {type: 'test', data: 'hello'},
      });

      assert.strictEqual(deliverFn.mock.calls.length, 1);
      assert.strictEqual(result.status, 'ok');
      assert.deepStrictEqual(result.received, {type: 'test', data: 'hello'});
    });
  });

  describe('unregisterWorkerHandler', () => {
    it('should unregister a worker handler', () => {
      const deliverFn = mock.fn(async () => ({status: 'ok'}));

      router.registerWorkerHandler('node-1/partition/replica-1', deliverFn);
      assert.ok(router.hasWorkerHandler('node-1/partition/replica-1'));

      router.unregisterWorkerHandler('node-1/partition/replica-1');
      assert.strictEqual(router.hasWorkerHandler('node-1/partition/replica-1'), false);
    });

    it('should be safe to unregister non-existent handler', () => {
      // Should not throw
      router.unregisterWorkerHandler('node-1/partition/non-existent');
    });
  });

  describe('hasWorkerHandler', () => {
    it('should return false for non-existent handler', () => {
      assert.strictEqual(router.hasWorkerHandler('node-1/partition/replica-1'), false);
    });

    it('should return true for registered handler', () => {
      const deliverFn = mock.fn(async () => ({status: 'ok'}));

      router.registerWorkerHandler('node-1/partition/replica-1', deliverFn);

      assert.strictEqual(router.hasWorkerHandler('node-1/partition/replica-1'), true);
    });
  });

  describe('multiple worker handlers', () => {
    it('should support multiple worker handlers', () => {
      const deliverFn1 = mock.fn(async () => ({replica: 1}));
      const deliverFn2 = mock.fn(async () => ({replica: 2}));
      const deliverFn3 = mock.fn(async () => ({replica: 3}));

      router.registerWorkerHandler('node-1/partition/replica-1', deliverFn1);
      router.registerWorkerHandler('node-1/partition/replica-2', deliverFn2);
      router.registerWorkerHandler('node-1/message-group/replica-3', deliverFn3);

      assert.ok(router.hasWorkerHandler('node-1/partition/replica-1'));
      assert.ok(router.hasWorkerHandler('node-1/partition/replica-2'));
      assert.ok(router.hasWorkerHandler('node-1/message-group/replica-3'));
    });

    it('should route to correct handler', async () => {
      const deliverFn1 = mock.fn(async () => ({replica: 1}));
      const deliverFn2 = mock.fn(async () => ({replica: 2}));

      router.registerWorkerHandler('node-1/partition/replica-1', deliverFn1);
      router.registerWorkerHandler('node-1/partition/replica-2', deliverFn2);

      const handler1 = router.handlers.get('node-1/partition/replica-1');
      const handler2 = router.handlers.get('node-1/partition/replica-2');

      const result1 = await handler1({payload: 'test1'});
      const result2 = await handler2({payload: 'test2'});

      assert.strictEqual(result1.replica, 1);
      assert.strictEqual(result2.replica, 2);
      assert.strictEqual(deliverFn1.mock.calls.length, 1);
      assert.strictEqual(deliverFn2.mock.calls.length, 1);
    });
  });
});
