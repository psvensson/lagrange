/**
 * Tests that joining node registration sets an initial ready lease.
 * Bug: registerNodeInCluster omitted ready_lease_expires_at, causing
 * the lease sweep to mark the node as unavailable before the heartbeat
 * service could start, leaving the rebalancer with availableNodeCount=1.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  NodeJoiningService,
} from '../../src/bootstrap/node-joining-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {TIME_MS} from '../../src/constants/time.js';

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

test('registerNodeInCluster sets ready_lease_expires_at', async (t) => {
  initializeTestEnvironment();

  let capturedNodeData = null;

  const mockCdcIntegrationService = {
    sqlQueryEngine: {},
    upsertSystemTableRow: async (_table, row) => {
      // Also capture from endpoint registration
      return {success: true};
    },
  };

  const mockBudgetService = {
    registerNodeBudget: async ({nodeRow}) => {
      capturedNodeData = nodeRow;
      return {
        result: {success: true},
        budgetRow: nodeRow,
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

  const beforeMs = Date.now();
  await service.registerNodeInCluster();
  const afterMs = Date.now();

  t.ok(capturedNodeData, 'Node data was written');

  const leaseExpiry = capturedNodeData.ready_lease_expires_at;
  t.ok(
    Number.isFinite(leaseExpiry),
    'ready_lease_expires_at must be a finite number, got: ' +
      String(leaseExpiry),
  );

  const minExpected = beforeMs + TIME_MS.CONTROL_PLANE_READY_LEASE;
  const maxExpected = afterMs + TIME_MS.CONTROL_PLANE_READY_LEASE;
  t.ok(
    leaseExpiry >= minExpected && leaseExpiry <= maxExpected,
    'Lease expiry should be now + CONTROL_PLANE_READY_LEASE (' +
      TIME_MS.CONTROL_PLANE_READY_LEASE + 'ms)',
  );
});
