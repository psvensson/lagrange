/**
 * Shared helper functions for integration tests.
 * Extracted from seed-node-bootstrap.integration.test.js and
 * admin-cdc-propagation.integration.test.js.
 *
 * These helpers provide consistent patterns for:
 * - Test environment initialization and cleanup
 * - In-process HTTP communication with BootstrapAPI
 * - Polling for conditions with timeout
 * - Unique port allocation to avoid conflicts
 *
 * Requirements: 4.1, 7.3, 7.4
 */

import {ConfigurationManager} from '../../../src/config/configuration-manager.js';
import {LoggingService} from '../../../src/logging/logging-service.js';
import {NodeService} from '../../../src/node/node-service.js';
import {AddressManager} from '../../../src/address/address-manager.js';
import {ServiceThreadManager} from '../../../src/threading/service-thread-manager.js';
import {URL} from 'url';

/**
 * Global port counter to ensure unique ports across tests.
 * Starting at 18000 to avoid conflicts with common ports.
 */
let portCounter = 18000;

/**
 * Get a unique port for test use.
 * Each call returns a new port number, incrementing from 18000.
 *
 * @returns {number} A unique port number
 */
export function getUniquePort() {
  return portCounter++;
}

/**
 * Reset the port counter to a specific value.
 * Useful for test isolation when running tests in parallel.
 *
 * @param {number} startPort - The port number to reset to
 */
export function resetPortCounter(startPort = 18000) {
  portCounter = startPort;
}

/**
 * Initialize test environment with fast Raft elections.
 * Resets all singletons and configures logging to error level.
 *
 * This function should be called in beforeEach() to ensure
 * clean state for each test.
 *
 * @param {Object} options - Optional configuration overrides
 * @param {string} options.nodeId - Node ID for configuration (default: 'test-node')
 * @param {Object} options.raft - Raft configuration overrides
 * @param {Object} options.rebalancer - Rebalancer configuration overrides
 */
export function initializeTestEnvironment(options = {}) {
  const {
    nodeId = 'test-node',
    raft = {},
    rebalancer = {},
  } = options;

  // Reset all singletons to ensure clean state
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  NodeService.resetInstance();
  AddressManager.resetInstance();
  ServiceThreadManager.resetInstance();

  // Initialize configuration with fast Raft elections
  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: nodeId},
    logging: {level: 'error'},
    transport: {wsHost: '127.0.0.1'},
    raft: {
      electionTimeoutMinMs: 100,
      electionTimeoutMaxMs: 200,
      heartbeatIntervalMs: 50,
      ...raft,
    },
    rebalancer: {
      periodicCheckIntervalMs: 1000,
      periodicCheckJitterMs: 100,
      stabilizationPeriodMs: 1000,
      ...rebalancer,
    },
  });

  // Initialize logging at error level to reduce noise
  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

/**
 * Clean up test environment.
 * Shuts down all services and resets singletons.
 *
 * This function should be called in afterEach() to ensure
 * proper cleanup after each test.
 *
 * All errors are caught and ignored to prevent cleanup failures
 * from masking test failures.
 */
export async function cleanupTestEnvironment() {
  try {
    await NodeService.getInstance().shutdown().catch(() => {});
  } catch {
    // Ignore shutdown errors
  }
  try {
    await ServiceThreadManager.getInstance().shutdown().catch(() => {});
  } catch {
    // Ignore shutdown errors
  }
  try {
    await LoggingService.getInstance().shutdown().catch(() => {});
  } catch {
    // Ignore shutdown errors
  }

  // Reset all singletons
  NodeService.resetInstance();
  ServiceThreadManager.resetInstance();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  AddressManager.resetInstance();
}

/**
 * Create in-process HTTP POST function for BootstrapAPI.
 * Uses Fastify inject() to avoid real HTTP connections.
 *
 * This allows tests to communicate with BootstrapAPI without
 * starting a real HTTP server, avoiding port conflicts and
 * network overhead.
 *
 * @param {Object} seedApi - The BootstrapAPI instance
 * @returns {Function} Async function that performs HTTP POST requests
 */
export function createInProcHttpPost(seedApi) {
  return async (url, body) => {
    const {pathname} = new URL(url);
    const res = await seedApi.getFastify().inject({
      method: 'POST',
      url: pathname,
      payload: body,
    });
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(`HTTP ${res.statusCode}: ${res.payload}`);
    }
    return res.json();
  };
}

/**
 * Wait for a condition with timeout.
 * Polls at short intervals to detect condition quickly.
 *
 * @param {Function} condition - Async function that returns true when condition is met
 * @param {number} timeoutMs - Maximum time to wait in milliseconds (default: 2000)
 * @param {number} intervalMs - Polling interval in milliseconds (default: 25)
 * @returns {Promise<boolean>} True if condition was met, false if timeout
 */
export async function waitFor(condition, timeoutMs = 2000, intervalMs = 25) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

/**
 * Wait for a specific event in an array of events.
 * Useful for waiting for CDC events or other async notifications.
 *
 * @param {Array} events - Array of events to search
 * @param {Function} predicate - Function that returns true for matching event
 * @param {number} timeoutMs - Maximum time to wait in milliseconds (default: 3000)
 * @param {number} intervalMs - Polling interval in milliseconds (default: 50)
 * @returns {Promise<Object|null>} The matching event or null if timeout
 */
export async function waitForEvent(events, predicate, timeoutMs = 3000, intervalMs = 50) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const match = events.find(predicate);
    if (match) {
      return match;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

/**
 * Wait for partition leaders to be elected.
 * Polls the system table cache until all system partitions have leaders.
 *
 * @param {Object} systemTableCache - The system table cache instance
 * @param {number} timeoutMs - Maximum time to wait in milliseconds (default: 2000)
 * @param {number} intervalMs - Polling interval in milliseconds (default: 50)
 * @returns {Promise<boolean>} True if all leaders elected, false if timeout
 */
export async function waitForLeaders(systemTableCache, timeoutMs = 2000, intervalMs = 50) {
  const systemPartitions = [
    'nodes-p1',
    'services-p1',
    'tables-p1',
    'partitions-p1',
    'message_groups-p1',
    'replica_operations-p1',
  ];

  return waitFor(async () => {
    const services = systemTableCache.getAll('services') || [];
    return systemPartitions.every((partition) =>
      services.some((s) => s.partition_id === partition && s.raft_role === 'leader'),
    );
  }, timeoutMs, intervalMs);
}

/**
 * Default test configuration values.
 * These values are optimized for fast test execution.
 */
export const TEST_CONFIG = {
  // Raft configuration for fast elections
  raft: {
    electionTimeoutMinMs: 100,
    electionTimeoutMaxMs: 200,
    heartbeatIntervalMs: 50,
  },
  // Bootstrap configuration for fast initialization
  bootstrap: {
    leadershipWaitTimeoutMs: 1000,
    leadershipWaitInitialDelayMs: 10,
    leadershipWaitMaxDelayMs: 100,
    replicaStaggerDelayMs: 20,
  },
  // Rebalancer configuration
  rebalancer: {
    periodicCheckIntervalMs: 1000,
    periodicCheckJitterMs: 100,
    stabilizationPeriodMs: 1000,
  },
  // Test timeouts
  timeouts: {
    testTimeout: 2000,
    waitForCondition: 2000,
    pollInterval: 25,
  },
};
