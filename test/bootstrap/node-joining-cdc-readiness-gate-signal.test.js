/**
 * Tests for NodeJoiningService CDC readiness gate in signalReadyForReplicas.
 * Validates: Requirement 5.3 — node SHALL NOT advertise readiness until
 * CDC subscriptions for all CDC-propagated system tables are confirmed
 * active. If timeout expires, advertise with degraded status.
 */

import {test} from '../../src/test-helpers/tap.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';

const READY_LOCAL_QUERY_TRANSPORT = Object.freeze({
  ready: true,
  state: 'ready',
});

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

test('awaitCdcSubscriptionsForReadiness - passes immediately when active',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'test-node-1',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
      sleep: () => Promise.resolve(),
    });

    service.cdcSubscriptionsActive = true;

    const startMs = Date.now();
    await service.awaitCdcSubscriptionsForReadiness();
    const elapsedMs = Date.now() - startMs;

    t.ok(
      elapsedMs < 100,
      'returns immediately when CDC subscriptions already active',
    );
  },
);

test('awaitCdcSubscriptionsForReadiness - waits until flag becomes true',
  async (t) => {
    initializeTestEnvironment();

    let sleepCallCount = 0;
    const service = new NodeJoiningService({
      nodeId: 'test-node-1',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
      sleep: () => {
        sleepCallCount++;
        return Promise.resolve();
      },
    });

    service.cdcSubscriptionsActive = false;

    // Simulate flag becoming true after a few polls
    let nowCounter = 0;
    const baseTime = 1000000;
    service.now = () => {
      nowCounter++;
      // First few calls return early times, then advance past
      // the point where we set the flag
      return baseTime + (nowCounter * 100);
    };

    // Set flag after 3 sleep calls
    const originalSleep = service.sleep;
    service.sleep = async (ms) => {
      await originalSleep(ms);
      if (sleepCallCount >= 3) {
        service.cdcSubscriptionsActive = true;
      }
    };

    await service.awaitCdcSubscriptionsForReadiness();

    t.ok(
      service.cdcSubscriptionsActive,
      'CDC subscriptions became active during wait',
    );
    t.ok(
      sleepCallCount >= 3,
      'polled multiple times before flag became true',
    );
  },
);

test('awaitCdcSubscriptionsForReadiness - proceeds after timeout with warning',
  async (t) => {
    initializeTestEnvironment();

    let sleepCallCount = 0;
    const logMessages = [];
    const service = new NodeJoiningService({
      nodeId: 'test-node-1',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
      sleep: () => {
        sleepCallCount++;
        return Promise.resolve();
      },
    });

    service.cdcSubscriptionsActive = false;

    // Simulate time advancing past the timeout immediately
    let nowCounter = 0;
    service.now = () => {
      nowCounter++;
      // Return a time that exceeds the timeout after first call
      return nowCounter * 50000;
    };

    // Capture log output
    const originalWarn = service.logger.warn.bind(service.logger);
    service.logger.warn = (msg, meta) => {
      logMessages.push({msg, meta});
      return originalWarn(msg, meta);
    };

    await service.awaitCdcSubscriptionsForReadiness();

    t.equal(
      service.cdcSubscriptionsActive,
      false,
      'CDC subscriptions still inactive after timeout',
    );

    const degradedLog = logMessages.find(
      (l) => l.msg.includes('degraded'),
    );
    t.ok(
      degradedLog,
      'logged degraded warning when timeout expired',
    );
  },
);

test('signalReadyForReplicas - calls awaitCdcSubscriptionsForReadiness',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'test-node-1',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
      sleep: () => Promise.resolve(),
    });

    service.cdcSubscriptionsActive = true;

    let gateChecked = false;
    const originalGate =
      service.awaitCdcSubscriptionsForReadiness.bind(service);
    service.awaitCdcSubscriptionsForReadiness = async () => {
      gateChecked = true;
      return originalGate();
    };
    service.messageRouter = {
      getQueryDataPlaneTransportReadiness: () => ({
        ...READY_LOCAL_QUERY_TRANSPORT,
      }),
    };

    // Mock heartbeat service to avoid real network calls
    let heartbeatSent = false;
    service.heartbeatService = {
      sendHeartbeat: async () => {
        heartbeatSent = true;
      },
    };

    // Mock NodeService for stats
    const nodeService = NodeService.getInstance();
    if (!nodeService.isInitialized()) {
      nodeService.initialize({
        nodeId: 'test-node-1',
        nodeAddress: 'ws://localhost:9090',
      });
    }

    await service.signalReadyForReplicas();

    t.ok(gateChecked, 'CDC readiness gate was checked');
    t.ok(heartbeatSent, 'heartbeat was sent after gate passed');
  },
);
