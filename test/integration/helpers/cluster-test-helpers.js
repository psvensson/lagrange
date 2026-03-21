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
import {LogsTableService} from '../../../src/logging/logs-table-service.js';
import {NodeService} from '../../../src/node/node-service.js';
import {AddressManager} from '../../../src/address/address-manager.js';
import {ServiceThreadManager} from '../../../src/threading/service-thread-manager.js';
import {
  clearRegisteredControlPlaneSystemTableGateway,
} from '../../../src/control-plane/control-plane-gateway-registry.js';
import {createPortAllocator} from '../../../src/test-helpers/port-allocator.js';
import {URL} from 'url';

/**
 * Per-test-file allocator to avoid cross-file port collisions when tests
 * execute in parallel worker processes.
 */
const testFilePortAllocator = createPortAllocator(process.argv[1] || import.meta.url);

/**
 * Get a unique port for test use.
 * Each call returns a new port number, incrementing from 18000.
 *
 * @returns {number} A unique port number
 */
export function getUniquePort() {
  return testFilePortAllocator.getPort();
}

/**
 * Reset the port counter to a specific value.
 * Useful for test isolation when running tests in parallel.
 *
 * @param {number} startPort - The port number to reset to
 */
export function resetPortCounter(startPort = 18000) {
  void startPort;
  testFilePortAllocator.reset();
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
 * @param {Object} options.replicaHandler - ReplicaHandler configuration overrides
 */
export function initializeTestEnvironment(options = {}) {
  const {
    nodeId = 'test-node',
    raft = {},
    rebalancer = {},
    replicaHandler = {},
  } = options;

  // Reset all singletons to ensure clean state
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  NodeService.resetInstance();
  AddressManager.resetInstance();
  clearRegisteredControlPlaneSystemTableGateway();

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
      systemPartitionStartDelayMs: 0,
      userPartitionStartDelayMs: 0,
      ...rebalancer,
    },
    replicaHandler: {
      syncTimeoutMs: 10000,
      ...replicaHandler,
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
    LogsTableService.resetInstance();
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
  clearRegisteredControlPlaneSystemTableGateway();
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
 * Get all partition services from bootstrap result/service.
 * Supports in-process and worker-backed test modes.
 *
 * @param {Object} bootstrapResult - Result returned by bootstrap().
 * @param {Object} bootstrapService - BootstrapService instance.
 * @returns {Array<Object>} Partition service instances.
 */
export function getPartitionServices(bootstrapResult, bootstrapService = null) {
  const services = [];
  const seenKeys = new Set();
  const addServices = (source) => {
    if (!source || !source.partitionServices || typeof source.partitionServices.values !== 'function') {
      return;
    }
    for (const service of source.partitionServices.values()) {
      const key = service?.replicaId ||
        service?.serviceId ||
        service?.service_id ||
        service;
      if (seenKeys.has(key)) {
        continue;
      }
      seenKeys.add(key);
      services.push(service);
    }
  };

  addServices(bootstrapResult);
  addServices(bootstrapService);
  return services;
}

/**
 * Get partition ID from a partition service.
 *
 * @param {Object} service - Partition service.
 * @returns {string|null} Partition ID if available.
 */
export function getPartitionId(service) {
  if (!service) {
    return null;
  }
  if (service.partitionId) {
    return service.partitionId;
  }
  if (service.partition_id) {
    return service.partition_id;
  }
  if (typeof service.getPartitionId === 'function') {
    return service.getPartitionId();
  }
  return null;
}

/**
 * Check if a partition service is currently leader.
 *
 * @param {Object} service - Partition service to inspect.
 * @param {Object} bootstrapService - BootstrapService for fresh lookup.
 * @returns {Promise<boolean>} True if leader.
 */
export async function isPartitionLeader(service, bootstrapService = null) {
  if (!service) {
    return false;
  }

  const replicaId = service.replicaId || service.serviceId || service.service_id || null;
  let currentService = service;

  if (replicaId && bootstrapService?.partitionServices?.get) {
    currentService = bootstrapService.partitionServices.get(replicaId) || currentService;
  }

  if (typeof currentService.isLeader === 'boolean') {
    return currentService.isLeader;
  }

  if (typeof currentService.isLeaderReplica === 'function') {
    return Boolean(currentService.isLeaderReplica());
  }

  if (typeof currentService.getStatus === 'function') {
    const status = currentService.getStatus();
    if (status && typeof status.isLeader === 'boolean') {
      return status.isLeader;
    }
    if (status?.raftRole) {
      return status.raftRole === 'leader';
    }
  }

  if (currentService.raftRole) {
    return currentService.raftRole === 'leader';
  }

  return false;
}

/**
 * Temporarily force bootstrap probe SQL dependency to report unavailable.
 * @param {Object} seedApi - BootstrapAPI instance.
 * @param {Object} [options]
 * @param {number} [options.blockedEvaluations]
 * @return {{restore: Function, getRemaining: Function}}
 */
export function installTransientSqlReadinessFixture(seedApi, options = {}) {
  if (!seedApi || typeof seedApi.isSqlEngineDependencyReady !== 'function') {
    throw new Error('seedApi with isSqlEngineDependencyReady() is required');
  }
  const blockedEvaluations = Number.isFinite(options.blockedEvaluations) ?
    Math.max(0, Math.floor(options.blockedEvaluations)) :
    0;
  let remaining = blockedEvaluations;
  const original = seedApi.isSqlEngineDependencyReady.bind(seedApi);
  seedApi.isSqlEngineDependencyReady = () => {
    if (remaining > 0) {
      remaining -= 1;
      return false;
    }
    return original();
  };

  return {
    restore: () => {
      seedApi.isSqlEngineDependencyReady = original;
    },
    getRemaining: () => remaining,
  };
}

/**
 * Temporarily force probe leader-metadata status to report not-ready.
 * @param {Object} seedApi - BootstrapAPI instance.
 * @param {Object} [options]
 * @param {number} [options.blockedEvaluations]
 * @return {{restore: Function, getRemaining: Function}}
 */
export function installTransientLeaderMetadataFixture(seedApi, options = {}) {
  if (!seedApi || typeof seedApi.getLeaderReadinessStatusForProbe !== 'function') {
    throw new Error('seedApi with getLeaderReadinessStatusForProbe() is required');
  }
  const blockedEvaluations = Number.isFinite(options.blockedEvaluations) ?
    Math.max(0, Math.floor(options.blockedEvaluations)) :
    0;
  let remaining = blockedEvaluations;
  const original = seedApi.getLeaderReadinessStatusForProbe.bind(seedApi);
  seedApi.getLeaderReadinessStatusForProbe = () => {
    if (remaining > 0) {
      remaining -= 1;
      return {
        ready: false,
        missingPartitionLeaders: ['partition-fixture'],
        missingMessageGroupLeaders: [],
      };
    }
    return original();
  };

  return {
    restore: () => {
      seedApi.getLeaderReadinessStatusForProbe = original;
    },
    getRemaining: () => remaining,
  };
}

/**
 * Temporarily force bootstrap operation leader checks to report not-ready.
 * @param {Object} seedApi - BootstrapAPI instance.
 * @param {Object} [options]
 * @param {number} [options.blockedCalls]
 * @return {{restore: Function, getRemaining: Function}}
 */
export function installTransientBootstrapLeaderGateFixture(seedApi, options = {}) {
  if (!seedApi || typeof seedApi.waitForServiceLeaders !== 'function') {
    throw new Error('seedApi with waitForServiceLeaders() is required');
  }
  const blockedCalls = Number.isFinite(options.blockedCalls) ?
    Math.max(0, Math.floor(options.blockedCalls)) :
    0;
  let remaining = blockedCalls;
  const original = seedApi.waitForServiceLeaders.bind(seedApi);
  seedApi.waitForServiceLeaders = async () => {
    if (remaining > 0) {
      remaining -= 1;
      return {
        ready: false,
        missingPartitionLeaders: ['partition-fixture'],
        missingMessageGroupLeaders: [],
        missingPartitionLeaderNodes: [],
        missingMessageGroupLeaderNodes: [],
      };
    }
    return original();
  };

  return {
    restore: () => {
      seedApi.waitForServiceLeaders = original;
    },
    getRemaining: () => remaining,
  };
}

/**
 * Flood in-memory logging buffer for class-C saturation scenarios.
 * @param {LoggingService} loggingService
 * @param {Object} [options]
 * @param {number} [options.count]
 * @param {string} [options.message]
 * @return {number} Current buffered entry count.
 */
export function floodBufferedLogs(loggingService, options = {}) {
  const count = Number.isFinite(options.count) ?
    Math.max(0, Math.floor(options.count)) :
    0;
  const message = typeof options.message === 'string' && options.message.length > 0 ?
    options.message :
    'readiness.fixture.log';
  for (let index = 0; index < count; index += 1) {
    loggingService.error(message, {index});
  }
  return loggingService.getBufferSize();
}

/**
 * Wait for a specific partition to elect a leader.
 *
 * @param {Object} bootstrapResult - Result returned by bootstrap().
 * @param {Object} bootstrapService - BootstrapService instance.
 * @param {string} partitionId - Partition ID to check.
 * @param {number} timeoutMs - Wait timeout in milliseconds.
 * @param {number} intervalMs - Poll interval in milliseconds.
 * @returns {Promise<Object|null>} Leader service or null on timeout.
 */
export async function waitForPartitionLeaderElection(
  bootstrapResult,
  bootstrapService,
  partitionId,
  timeoutMs = 5000,
  intervalMs = 50,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const services = getPartitionServices(bootstrapResult, bootstrapService);
    for (const service of services) {
      if (getPartitionId(service) !== partitionId) {
        continue;
      }
      if (await isPartitionLeader(service, bootstrapService)) {
        return service;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

/**
 * Shutdown rebalancers attached to partition services.
 *
 * @param {Map<string, Object>|Array<Object>} partitionServices - Services collection.
 */
export function stopAllRebalancers(partitionServices) {
  if (!partitionServices) {
    return;
  }

  const services = Array.isArray(partitionServices) ?
    partitionServices :
    [...partitionServices.values()];

  for (const service of services) {
    try {
      if (service?.rebalancer?.shutdown) {
        service.rebalancer.shutdown();
      }
    } catch {
      // Best-effort cleanup only.
    }
  }
}

/**
 * Shutdown joining-node resources in best-effort order.
 *
 * @param {Object} joiningService - NodeJoiningService instance.
 * @returns {Promise<void>}
 */
export async function gracefulJoiningShutdown(joiningService) {
  if (!joiningService) {
    return;
  }

  stopAllRebalancers(joiningService.partitionServices);

  if (typeof joiningService.cleanup === 'function') {
    try {
      await joiningService.cleanup();
    } catch {
      // Best-effort cleanup only.
    }
  }

  if (typeof joiningService.shutdown === 'function') {
    try {
      await joiningService.shutdown();
    } catch {
      // Best-effort cleanup only.
    }
  }
}

/**
 * Shutdown seed-node resources in best-effort order.
 *
 * @param {Object} bootstrapService - BootstrapService instance.
 * @param {Object} bootstrapResult - Result returned by bootstrap().
 * @param {Object|null} seedApi - Optional BootstrapAPI instance.
 * @returns {Promise<void>}
 */
export async function gracefulShutdown(bootstrapService, bootstrapResult, seedApi) {
  try {
    if (seedApi && typeof seedApi.shutdown === 'function') {
      await seedApi.shutdown();
    }
  } catch {
    // Best-effort cleanup only.
  }

  try {
    stopAllRebalancers(bootstrapResult?.partitionServices);
    if (bootstrapService && typeof bootstrapService.shutdown === 'function') {
      await bootstrapService.shutdown();
    }
  } catch {
    // Best-effort cleanup only.
  }
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
