/**
 * Bug test: RebalanceCoordinator must use the shared readiness policy.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NODE_STATE} from '../../src/constants/index.js';
import {createTestCoordinator} from './test-helpers.js';

test('RebalanceCoordinator - readiness requires ACTIVE node status', async (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({});
  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});

  const now = Date.now();
  const coordinator = createTestCoordinator({
    nodeId: 'seed-node',
    enableTimeouts: false,
    cacheData: {
      nodes: [
        {
          node_id: 'node-2',
          status: NODE_STATE.FAILED,
          ws_connection_state: NODE_STATE.READY,
          ready_lease_expires_at: now + 60000,
        },
      ],
    },
  });

  coordinator.initialize();
  try {
    t.equal(
      coordinator.isNodeReadyForRouting('node-2'),
      false,
      'FAILED node must not be considered routable',
    );
  } finally {
    await coordinator.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});
