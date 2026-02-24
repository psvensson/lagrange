import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {LeaseService} from '../../src/control-plane/lease-service.js';

function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({});
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

test('LeaseService does not overlap periodic sweeps when a sweep is still in-flight',
  async (t) => {
    initEnv();

    let inFlightSweeps = 0;
    let maxInFlightSweeps = 0;
    const releaseSweeps = [];

    const service = new LeaseService({
      nodeId: 'node-a',
      cdcIntegrationService: {
        upsertSystemTableRow: async () => ({success: true}),
      },
      systemTableCache: {
        getAll: () => [],
      },
      sqlQueryEngine: {
        executeQuery: async () => {
          inFlightSweeps += 1;
          maxInFlightSweeps = Math.max(maxInFlightSweeps, inFlightSweeps);
          return new Promise((resolve) => {
            releaseSweeps.push(() => {
              inFlightSweeps -= 1;
              resolve({success: true, rows: []});
            });
          });
        },
      },
      messageGroupServices: new Set([
        {isLeaderReplica: () => true},
      ]),
    });
    service.initialize();
    service.sweepIntervalMs = 5;
    service.start();

    try {
      await new Promise((resolve) => setTimeout(resolve, 30));
      t.equal(
        maxInFlightSweeps,
        1,
        'lease sweep loop should keep at most one in-flight sweep',
      );
    } finally {
      service.stop();
      while (releaseSweeps.length > 0) {
        const release = releaseSweeps.shift();
        release();
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });
