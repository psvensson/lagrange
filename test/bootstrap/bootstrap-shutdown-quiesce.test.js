import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';

function createSilentLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

test('BootstrapService cleanup quiesces rebalancers before service shutdown', async (t) => {
  const callOrder = [];
  const service = new BootstrapService({
    nodeId: 'test-node',
    nodeAddress: 'localhost:8080',
  });

  service.logger = createSilentLogger();
  service.messageRouter = {
    unregister: () => {},
    shutdown: async () => {},
  };
  service.transport = service.messageRouter;
  service.replicaHandler = {
    unregisterFromRouter: () => {},
    shutdown: () => {},
  };

  service.rebalanceCoordinator = {
    shutdown: async () => {
      callOrder.push('global-coordinator-shutdown');
    },
  };

  service.partitionServices = new Map([
    ['tables-p1-r1', {
      getUnifiedAddress: () => 'test-node/partition/tables-p1-r1',
      quiesceRebalancing: async () => {
        callOrder.push('partition-quiesce');
      },
      shutdown: async () => {
        callOrder.push('partition-shutdown');
      },
    }],
  ]);

  service.messageGroupServices = new Map([
    ['mg-1-r1', {
      quiesceRebalancing: async () => {
        callOrder.push('message-group-quiesce');
      },
      shutdown: async () => {
        callOrder.push('message-group-shutdown');
      },
    }],
  ]);

  await service.cleanup();

  const partitionQuiesceIndex = callOrder.indexOf('partition-quiesce');
  const partitionShutdownIndex = callOrder.indexOf('partition-shutdown');
  const messageGroupQuiesceIndex = callOrder.indexOf('message-group-quiesce');
  const messageGroupShutdownIndex = callOrder.indexOf('message-group-shutdown');

  t.ok(
    partitionQuiesceIndex >= 0,
    'cleanup should quiesce partition rebalancers',
  );
  t.ok(
    messageGroupQuiesceIndex >= 0,
    'cleanup should quiesce message-group rebalancers',
  );
  t.ok(
    partitionShutdownIndex > partitionQuiesceIndex,
    'partition shutdown should run after partition quiesce',
  );
  t.ok(
    messageGroupShutdownIndex > messageGroupQuiesceIndex,
    'message-group shutdown should run after message-group quiesce',
  );
});
