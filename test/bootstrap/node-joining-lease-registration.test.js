/**
 * Tests that join-time membership publication does not assign the ready lease
 * before the explicit ready-signal checkpoint runs.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  NodeJoiningService,
} from '../../src/bootstrap/node-joining-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-node'},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }

  NodeService.resetInstance();
}

test('registerNodeInCluster defers ready_lease_expires_at until ready signaling',
  async (t) => {
  initializeTestEnvironment();

  let capturedNodeStateUpdate = null;

  const mockCdcIntegrationService = {
    sqlQueryEngine: {},
    upsertSystemTableRow: async () => ({success: true}),
  };

  const mockBudgetService = {
    resolveBudgetRow: (nodeRow) => {
      return {
        budgetRow: {
          ...nodeRow,
          storage_budget_bytes: 100,
          storage_budget_source: 'test',
        },
        resolution: {
          isValid: true,
          budgetBytes: 100,
          source: 'test',
        },
      };
    },
  };

  const service = new NodeJoiningService({
    nodeId: 'joining-test-node',
    nodeAddress: 'ws://localhost:9090',
    seedNodeAddress: 'http://localhost:8080',
  });

  service.cdcIntegrationService = mockCdcIntegrationService;
  service.getNodeStorageBudgetService = () => mockBudgetService;
  service.sendControlPlaneNodeStateUpdate = async (options) => {
    capturedNodeStateUpdate = options;
  };

  await service.registerNodeInCluster();

  t.ok(capturedNodeStateUpdate, 'membership publication should be emitted');
  t.equal(
    capturedNodeStateUpdate.state,
    'connected',
    'join membership should publish CONNECTED before ready signaling',
  );
  t.equal(
    capturedNodeStateUpdate.nodeRow.ready_lease_expires_at,
    undefined,
    'join membership payload should not carry a ready lease before the ready checkpoint',
  );
  });
