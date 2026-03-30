/**
 * Isolated bootstrap lifecycle coverage for epoch manager ownership.
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

test(
  'Bootstrap lifecycle - epoch manager initializes from partition assignments ' +
    'and clears on shutdown',
  {timeout: 20000}, async (t) => {
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
      t.ok(result.epochManager, 'should expose the epoch manager in the result');
      t.ok(bootstrap.getEpochManager(),
        'getEpochManager should return the bootstrap-owned manager');

      const epochManager = result.epochManager;
      t.ok(epochManager.isInitialized(), 'epoch manager should be initialized');

      const currentEpoch = epochManager.getCurrentEpoch();
      t.equal(currentEpoch.epoch, 0, 'initial epoch should be 0');
      t.equal(currentEpoch.proposedBy, nodeId,
        'initial epoch should be proposed by the seed node');

      const assignments = currentEpoch.assignments;
      t.ok(Object.keys(assignments).length > 0,
        'initial epoch should include partition assignments');

      for (const [partitionId, nodes] of Object.entries(assignments)) {
        t.ok(nodes.includes(nodeId),
          `partition ${partitionId} should be assigned to the seed node`);
      }
    } finally {
      await bootstrap.shutdown();
    }

    t.equal(bootstrap.getEpochManager(), null,
      'epoch manager should be cleared after shutdown');
  });
