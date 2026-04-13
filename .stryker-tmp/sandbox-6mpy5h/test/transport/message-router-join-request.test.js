/**
 * Unit tests for removal of the legacy WebSocket join protocol.
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

const config = ConfigurationManager.getInstance();
config.initialize({});
const loggingService = LoggingService.getInstance();
if (!loggingService.isInitialized()) {
  loggingService.initialize({level: 'error'});
}

test('MessageRouter - does not expose legacy JOIN_REQUEST/JOIN_COMPLETE APIs',
  async (t) => {
    const router = new MessageRouter({nodeId: 'test-node'});
    await router.initialize();

    t.equal(
      typeof router.setJoinRequestHandler,
      'undefined',
      'legacy JOIN_REQUEST handler registration should be removed',
    );
    t.equal(
      typeof router.setJoinCompleteHandler,
      'undefined',
      'legacy JOIN_COMPLETE handler registration should be removed',
    );
    t.equal(
      typeof router.sendJoinRequest,
      'undefined',
      'legacy JOIN_REQUEST sender should be removed',
    );
    t.equal(
      typeof router.sendJoinComplete,
      'undefined',
      'legacy JOIN_COMPLETE sender should be removed',
    );

    await router.shutdown();
    t.end();
  });

test('MessageRouter - does not keep legacy join handler state',
  async (t) => {
    const router = new MessageRouter({nodeId: 'test-node'});
    await router.initialize();

    t.equal(
      Object.hasOwn(router, 'joinRequestHandler'),
      false,
      'router instances should not retain legacy joinRequestHandler state',
    );
    t.equal(
      Object.hasOwn(router, 'joinCompleteHandler'),
      false,
      'router instances should not retain legacy joinCompleteHandler state',
    );

    await router.shutdown();
    t.end();
  });
