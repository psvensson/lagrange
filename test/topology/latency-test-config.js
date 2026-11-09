import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

export function setupLatencyTestConfig(overrides = {}) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'node-a'},
    logging: {level: 'error'},
    latency: {
      groupThresholdMs: 100,
      recalcIntervalMs: 1000,
      recalcJitterRatio: 0.1,
      pingTimeoutMs: 50,
      pingRetryCount: 2,
      smoothingAlpha: 0.5,
      propagationMode: 'safe',
      ...overrides,
    },
  });
  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

export function teardownLatencyTestConfig() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}
