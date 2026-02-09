/**
 * Unit tests for MessageRouter JOIN_REQUEST and JOIN_COMPLETE handling.
 * Tests task 18.2: Implement JOIN_REQUEST handler in seed node.
 * Tests task 18.3: Implement JOIN_COMPLETE handler in seed node.
 *
 * Requirements: 13.2, 13.3, 13.7
 * - 13.2: THE joining node SHALL send a JOIN_REQUEST message with its nodeId and address
 * - 13.3: THE seed node SHALL respond with a JOIN_RESPONSE containing message group
 *         replica assignment and Raft peer information
 * - 13.7: AFTER SystemCacheProxy is ready, THE joining node SHALL send a JOIN_COMPLETE
 *         message to the seed node
 */

import {test} from '../../src/test-helpers/tap.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {ROUTER_MESSAGE_TYPE} from '../../src/constants/transport.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

// Initialize configuration and logging for tests
const config = ConfigurationManager.getInstance();
config.initialize({});
const loggingService = LoggingService.getInstance();
if (!loggingService.isInitialized()) {
  loggingService.initialize({level: 'error'});
}

test('MessageRouter - setJoinRequestHandler sets handler', async (t) => {
  const router = new MessageRouter({nodeId: 'test-node'});
  await router.initialize();

  let _handlerCalled = false;
  const mockHandler = (_message) => {
    _handlerCalled = true;
    return {
      type: ROUTER_MESSAGE_TYPE.JOIN_RESPONSE,
      success: true,
      messageGroupAssignment: {
        groupId: 'mg-1',
        replicaId: 'mg-1-r-test',
        raftPeers: [],
      },
      error: null,
    };
  };

  router.setJoinRequestHandler(mockHandler);

  // Verify handler is set
  t.ok(router.joinRequestHandler, 'handler should be set');

  await router.shutdown();
  t.end();
});

test('MessageRouter - setJoinRequestHandler clears handler with null', async (t) => {
  const router = new MessageRouter({nodeId: 'test-node'});
  await router.initialize();

  const mockHandler = () => ({});
  router.setJoinRequestHandler(mockHandler);
  t.ok(router.joinRequestHandler, 'handler should be set');

  router.setJoinRequestHandler(null);
  t.equal(router.joinRequestHandler, null, 'handler should be cleared');

  await router.shutdown();
  t.end();
});

test('MessageRouter - joinRequestHandler initialized to null', async (t) => {
  const router = new MessageRouter({nodeId: 'test-node'});
  await router.initialize();

  t.equal(router.joinRequestHandler, null, 'handler should be null by default');

  await router.shutdown();
  t.end();
});

// Tests for JOIN_COMPLETE handling - Requirement 13.7

test('MessageRouter - setJoinCompleteHandler sets handler', async (t) => {
  const router = new MessageRouter({nodeId: 'test-node'});
  await router.initialize();

  let _handlerCalled = false;
  const mockHandler = (_message) => {
    _handlerCalled = true;
    return {
      type: ROUTER_MESSAGE_TYPE.JOIN_COMPLETE_ACK,
      success: true,
      nextSteps: ['Step 1', 'Step 2'],
    };
  };

  router.setJoinCompleteHandler(mockHandler);

  // Verify handler is set
  t.ok(router.joinCompleteHandler, 'handler should be set');

  await router.shutdown();
  t.end();
});

test('MessageRouter - setJoinCompleteHandler clears handler with null', async (t) => {
  const router = new MessageRouter({nodeId: 'test-node'});
  await router.initialize();

  const mockHandler = () => ({});
  router.setJoinCompleteHandler(mockHandler);
  t.ok(router.joinCompleteHandler, 'handler should be set');

  router.setJoinCompleteHandler(null);
  t.equal(router.joinCompleteHandler, null, 'handler should be cleared');

  await router.shutdown();
  t.end();
});

test('MessageRouter - joinCompleteHandler initialized to null', async (t) => {
  const router = new MessageRouter({nodeId: 'test-node'});
  await router.initialize();

  t.equal(router.joinCompleteHandler, null, 'handler should be null by default');

  await router.shutdown();
  t.end();
});
