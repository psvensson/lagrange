/**
 * Isolated bootstrap lifecycle coverage for WebSocket server reentry.
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';

const ports = createPortAllocator(import.meta.url);

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-bootstrap-node'},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }

  NodeService.resetInstance();
}

test('Bootstrap lifecycle - startWebSocketServer after bootstrap is a no-op',
  {timeout: 120000}, async (t) => {
    initializeTestEnvironment();

    const wsPort = ports.getPort();
    const nodeId = `test-node-${Date.now()}`;
    const bootstrap = new BootstrapService({
      nodeId,
      nodeAddress: `ws://localhost:${wsPort}`,
      wsPort,
      config: {
        leadershipWaitTimeoutMs: 5000,
        leadershipWaitInitialDelayMs: 10,
        partitionDbPath: ':memory:',
      },
    });

    try {
      const result = await bootstrap.bootstrap();

      t.equal(result.success, true, 'bootstrap should succeed');
      t.ok(result.messageRouter.server, 'WebSocket server should be running');
      t.ok(result.messageRouter.hasSelfConnection(),
        'self-connection should be established');
      t.equal(
        result.messageRouter.isExternalAdmissionEnabled(),
        true,
        'bootstrap should open external transport admission before returning success',
      );

      await bootstrap.startWebSocketServer();

      t.ok(result.messageRouter.server,
        'WebSocket server should still be running after reentry');
      t.ok(result.messageRouter.hasSelfConnection(),
        'self-connection should still be established after reentry');
      t.equal(
        result.messageRouter.isExternalAdmissionEnabled(),
        true,
        'WebSocket server reentry should preserve external transport admission',
      );
    } finally {
      await bootstrap.shutdown();
    }
  });
