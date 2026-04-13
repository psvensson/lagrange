// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {
  UnifiedRebalancer,
  EntityType,
} from '../../src/rebalancer/unified-rebalancer.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

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
}

function createMockCache() {
  return {
    get: () => null,
    filter: () => [],
    getAll: () => [],
  };
}

function createMockCoordinator() {
  return {
    getMoveSafetyError: async () => null,
    createOperation: async () => ({
      operationId: 'op-1',
      replicaId: 'tables-p1-r1',
    }),
  };
}

test('UnifiedRebalancer shutdown guard skips rebalance checks after shutdown', async (t) => {
  initializeTestEnvironment();

  const rebalancer = new UnifiedRebalancer({
    entityId: 'tables-p1',
    entityType: EntityType.PARTITION,
    nodeId: 'test-node',
    systemTableCache: createMockCache(),
    cdcIntegrationService: {
      insertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    tablePolicyService: {
      getPolicyForPartition: async () => ({replicaCount: 3}),
    },
    messageRouter: {
      deliver: async () => ({acknowledged: true, success: true, rows: []}),
      pingNode: async () => true,
      isOutboundQueueAvailable: () => true,
    },
    rebalanceCoordinator: createMockCoordinator(),
  });

  rebalancer.initialize();
  rebalancer.setLeader(true);

  let evaluateCalls = 0;
  rebalancer.evaluateState = async () => {
    evaluateCalls++;
    return false;
  };
  rebalancer.scheduleNextCheck = () => {};

  rebalancer.shutdown();
  await rebalancer.checkRebalance();

  t.equal(evaluateCalls, 0, 'shutdown rebalancer should not evaluate state');
});
