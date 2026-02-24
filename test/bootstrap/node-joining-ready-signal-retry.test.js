import {test} from '../../src/test-helpers/tap.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
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

test('NodeJoiningService retries ready heartbeat before failing join readiness',
  async (t) => {
    initializeTestEnvironment();

    let sendAttempts = 0;
    let startCalls = 0;
    const sleepDelays = [];

    const service = new NodeJoiningService({
      nodeId: 'node-ready-retry',
      nodeAddress: 'ws://localhost:19090',
      seedNodeAddress: 'http://localhost:18080',
      config: {
        readySignalMaxAttempts: 3,
        readySignalRetryDelayMs: 1,
        readySignalRetryBackoffMultiplier: 1,
      },
      sleep: async (delayMs) => {
        sleepDelays.push(delayMs);
      },
    });

    service.heartbeatService = {
      sendHeartbeat: async () => {
        sendAttempts += 1;
        if (sendAttempts < 3) {
          throw new Error('Query timeout after 30000ms');
        }
      },
      start: () => {
        startCalls += 1;
      },
    };

    const originalGetInstance = NodeService.getInstance;
    NodeService.getInstance = () => ({
      getNodeStats: async () => ({
        cpu: {count: 4, usagePercent: 10},
        memory: {totalBytes: 1024, usagePercent: 20},
        diskGb: 100,
        diskUsagePercent: 30,
      }),
    });

    try {
      await service.signalReadyForReplicas();
    } finally {
      NodeService.getInstance = originalGetInstance;
    }

    t.equal(sendAttempts, 3, 'ready signal should retry transient failures');
    t.equal(
      startCalls,
      0,
      'heartbeat loop should remain frozen until control-plane activation barrier',
    );
    t.same(
      sleepDelays,
      [1, 1],
      'ready signal retries should wait between attempts',
    );
  });
