/**
 * Regression tests for bootstrap replica registration tracing behavior.
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';

const TEST_WS_PORT = 19091;
const TEST_NODE_ID = 'test-trace-node';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  NodeService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {
      id: TEST_NODE_ID,
      address: `ws://127.0.0.1:${TEST_WS_PORT}`,
    },
    logging: {level: 'error'},
  });

  const loggingService = LoggingService.getInstance();
  loggingService.initialize({level: 'error'});
}

function createBootstrapService(config = {}) {
  return new BootstrapService({
    nodeId: TEST_NODE_ID,
    nodeAddress: `ws://127.0.0.1:${TEST_WS_PORT}`,
    wsPort: TEST_WS_PORT,
    config: {
      partitionDbPath: ':memory:',
      ...config,
    },
  });
}

test('Bootstrap replica registration trace is disabled by default', async (t) => {
  initializeTestEnvironment();

  const bootstrapService = createBootstrapService();
  const originalConsoleLog = console.log;
  let consoleLogCalls = 0;
  console.log = () => {
    consoleLogCalls += 1;
  };

  try {
    bootstrapService.writeBootstrapReplicaRegistrationTrace(
      'partition',
      'attempt',
      {replicaId: 'replica-1'},
    );
    t.equal(
      consoleLogCalls,
      0,
      'default trace path should not write directly to console',
    );
  } finally {
    console.log = originalConsoleLog;
    await bootstrapService.shutdown();
  }
});

test('Bootstrap replica registration trace emits via logger when explicitly enabled',
  async (t) => {
    initializeTestEnvironment();

    const bootstrapService = createBootstrapService({
      replicaRegistrationTraceEnabled: true,
    });
    const originalConsoleLog = console.log;
    let consoleLogCalls = 0;
    const debugCalls = [];
    console.log = () => {
      consoleLogCalls += 1;
    };
    bootstrapService.logger = {
      debug: (...args) => {
        debugCalls.push(args);
      },
      info: () => {},
      warn: () => {},
      error: () => {},
    };

    try {
      bootstrapService.writeBootstrapReplicaRegistrationTrace(
        'state',
        'complete',
        {registeredCount: 3},
      );

      t.equal(
        consoleLogCalls,
        0,
        'trace path should avoid direct console writes when enabled',
      );
      t.equal(
        debugCalls.length,
        1,
        'trace path should emit one structured debug event when enabled',
      );
    } finally {
      console.log = originalConsoleLog;
      await bootstrapService.shutdown();
    }
  });
