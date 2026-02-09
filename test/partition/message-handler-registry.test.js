/**
 * Unit tests for MessageHandlerRegistry.
 *
 * Tests the Map-based handler registry for message routing.
 * Validates Requirements 2.1, 2.2, 2.3.
 */

import {test} from '../../src/test-helpers/tap.js';
import {MessageHandlerRegistry} from '../../src/partition/message-handler-registry.js';

test('MessageHandlerRegistry', async (t) => {
  t.test('register() adds handler to registry', async (t) => {
    const registry = new MessageHandlerRegistry();

    registry.register('TEST_TYPE', async () => ({success: true}));

    t.equal(registry.has('TEST_TYPE'), true, 'handler should be registered');
    t.equal(registry.size, 1, 'registry should have one handler');
  });

  t.test('handle() invokes correct handler for registered type', async (t) => {
    const registry = new MessageHandlerRegistry();
    let handlerCalled = false;
    let receivedMessage = null;

    registry.register('FORWARD_WRITE', async (message) => {
      handlerCalled = true;
      receivedMessage = message;
      return {acknowledged: true, result: 'write-success'};
    });

    const message = {
      payload: {type: 'FORWARD_WRITE', data: 'test-data'},
    };

    const result = await registry.handle(message);

    t.equal(handlerCalled, true, 'handler should be called');
    t.same(receivedMessage, message, 'handler should receive the message');
    t.equal(result.acknowledged, true, 'result should be acknowledged');
    t.equal(result.result, 'write-success', 'result should contain handler output');
  });

  t.test('handle() returns error for unknown message type', async (t) => {
    const registry = new MessageHandlerRegistry();

    registry.register('KNOWN_TYPE', async () => ({success: true}));

    const message = {
      payload: {type: 'UNKNOWN_TYPE'},
    };

    const result = await registry.handle(message);

    t.equal(result.acknowledged, false, 'should not be acknowledged');
    t.equal(
      result.error,
      'Unknown message type: UNKNOWN_TYPE',
      'should return error with unknown type',
    );
  });

  t.test('handle() returns error when payload.type is undefined', async (t) => {
    const registry = new MessageHandlerRegistry();

    registry.register('SOME_TYPE', async () => ({success: true}));

    const message = {payload: {}};

    const result = await registry.handle(message);

    t.equal(result.acknowledged, false, 'should not be acknowledged');
    t.equal(
      result.error,
      'Unknown message type: undefined',
      'should return error with undefined type',
    );
  });

  t.test('handle() returns error when payload is missing', async (t) => {
    const registry = new MessageHandlerRegistry();

    registry.register('SOME_TYPE', async () => ({success: true}));

    const message = {};

    const result = await registry.handle(message);

    t.equal(result.acknowledged, false, 'should not be acknowledged');
    t.equal(
      result.error,
      'Unknown message type: undefined',
      'should return error with undefined type',
    );
  });

  t.test('multiple handlers can be registered', async (t) => {
    const registry = new MessageHandlerRegistry();

    registry.register('TYPE_A', async () => ({type: 'A'}));
    registry.register('TYPE_B', async () => ({type: 'B'}));
    registry.register('TYPE_C', async () => ({type: 'C'}));

    t.equal(registry.size, 3, 'registry should have three handlers');
    t.equal(registry.has('TYPE_A'), true, 'TYPE_A should be registered');
    t.equal(registry.has('TYPE_B'), true, 'TYPE_B should be registered');
    t.equal(registry.has('TYPE_C'), true, 'TYPE_C should be registered');

    const resultA = await registry.handle({payload: {type: 'TYPE_A'}});
    const resultB = await registry.handle({payload: {type: 'TYPE_B'}});

    t.equal(resultA.type, 'A', 'TYPE_A handler should return correct result');
    t.equal(resultB.type, 'B', 'TYPE_B handler should return correct result');
  });

  t.test('clear() removes all handlers', async (t) => {
    const registry = new MessageHandlerRegistry();

    registry.register('TYPE_A', async () => ({type: 'A'}));
    registry.register('TYPE_B', async () => ({type: 'B'}));

    t.equal(registry.size, 2, 'registry should have two handlers');

    registry.clear();

    t.equal(registry.size, 0, 'registry should be empty after clear');
    t.equal(registry.has('TYPE_A'), false, 'TYPE_A should not be registered');
    t.equal(registry.has('TYPE_B'), false, 'TYPE_B should not be registered');
  });

  t.test('handler can be async and return promise', async (t) => {
    const registry = new MessageHandlerRegistry();

    registry.register('ASYNC_TYPE', async (message) => {
      return {
        acknowledged: true,
        data: message.payload.data,
      };
    });

    const message = {
      payload: {type: 'ASYNC_TYPE', data: 'async-data'},
    };

    const result = await registry.handle(message);

    t.equal(result.acknowledged, true, 'async handler should work');
    t.equal(result.data, 'async-data', 'async handler should return data');
  });

  t.test('registering same type overwrites previous handler', async (t) => {
    const registry = new MessageHandlerRegistry();

    registry.register('OVERWRITE_TYPE', async () => ({version: 1}));
    registry.register('OVERWRITE_TYPE', async () => ({version: 2}));

    t.equal(registry.size, 1, 'registry should still have one handler');

    const result = await registry.handle({payload: {type: 'OVERWRITE_TYPE'}});

    t.equal(result.version, 2, 'second handler should be used');
  });
});
