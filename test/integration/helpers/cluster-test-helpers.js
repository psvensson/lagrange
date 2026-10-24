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
import {BootstrapService} from '../../../src/bootstrap/bootstrap-service.js';
import {NodeJoiningService} from '../../../src/bootstrap/node-joining-service.js';
import {readSeedStartupStorageAdmission} from
  '../../../src/bootstrap/seed-startup-storage-admission.js';
import {resolveAutoRejoinStartupDecision} from
  '../../../src/bootstrap/rejoin-hints.js';
import {acquireDataDirectoryProcessOwner} from
  '../../../src/storage/data-directory-process-owner.js';
import {
  clearRegisteredControlPlaneSystemTableGateway,
} from '../../../src/control-plane/control-plane-gateway-registry.js';
import {createPortAllocator} from '../../../src/test-helpers/port-allocator.js';
import {scaleByMachineFactor} from './test-machine-factor.js';
import {URL} from 'url';
import {mkdirSync, mkdtempSync, rmSync} from 'fs';
import {tmpdir} from 'os';
import {join, resolve} from 'path';

/**
 * Per-test-file allocator to avoid cross-file port collisions when tests
 * execute in parallel worker processes.
 */
const STACK_PREFIX = 'at ';
const FILE_SCHEME_PREFIX = 'file://';
const TEST_FILE_PATTERN = /((?:file:\/\/)?[^\s()]+\.test\.js)/;
const DEFAULT_TEST_FILE_ID = process.argv[1] || import.meta.url;
const testFilePortAllocators = new Map();

export const EMPTY_REPLICA_STATE_MACHINE_HANDLE = Object.freeze({
  stopTimeoutChecker() {},
  async clear() {},
});

/**
 * Install the minimum lifecycle-owner handle required by phase-only seed
 * fixtures. These fixtures replace the registration phase itself, but the
 * workflow still enforces that a lifecycle owner exists before crossing the
 * registration checkpoint, and (since e29e46abf) the registration step itself
 * acquires the replica handler and the SQL query engine before the phase it
 * replaces; with the phases stubbed there is no cache for either to bind.
 * @param {BootstrapService} bootstrap Phase-only bootstrap fixture.
 * @return {BootstrapService} The same fixture for fluent setup.
 */
export function installMinimumSeedBootstrapLifecycleFixture(bootstrap) {
  bootstrap.replicaStateMachine = EMPTY_REPLICA_STATE_MACHINE_HANDLE;
  bootstrap.acquireReplicaHandler = () => {};
  bootstrap.seedRuntimeBridgeOwner.acquireSqlQueryEngine = () => null;
  return bootstrap;
}

function normalizeTestFileId(candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0) {
    return DEFAULT_TEST_FILE_ID;
  }
  return candidate.startsWith(FILE_SCHEME_PREFIX) ?
    candidate :
    candidate;
}

function resolveCallerTestFileId() {
  const stack = new Error().stack || '';
  const lines = stack.split('\n');
  for (const rawLine of lines) {
    const line = String(rawLine || '').trim();
    if (!line.startsWith(STACK_PREFIX)) {
      continue;
    }
    if (line.includes('cluster-test-helpers.js')) {
      continue;
    }
    const match = line.match(TEST_FILE_PATTERN);
    if (!match?.[1]) {
      continue;
    }
    return normalizeTestFileId(match[1]);
  }
  return DEFAULT_TEST_FILE_ID;
}

function getTestFilePortAllocator(testFileId) {
  const normalizedTestFileId = normalizeTestFileId(testFileId);
  if (!testFilePortAllocators.has(normalizedTestFileId)) {
    testFilePortAllocators.set(
      normalizedTestFileId,
      createPortAllocator(normalizedTestFileId),
    );
  }
  return testFilePortAllocators.get(normalizedTestFileId);
}

/**
 * Get a unique port for test use.
 * Each call returns a new port number, incrementing from 18000.
 *
 * @returns {number} A unique port number
 */
export function getUniquePort() {
  return getTestFilePortAllocator(resolveCallerTestFileId()).getPort();
}

/**
 * Reserve one runtime's REST, admin WS and transport WS ports as the
 * consecutive block the listener-port model derives (see
 * getTestListenerPorts in src/test-helpers/port-allocator.js).
 *
 * @returns {{restApiPort: number, adminWebSocketPort: number,
 *   transportWebSocketPort: number}} The runtime's listener ports.
 */
export function getUniqueListenerPorts() {
  return getTestFilePortAllocator(resolveCallerTestFileId()).getListenerPorts();
}

/**
 * Reset the port counter to a specific value.
 * Useful for test isolation when running tests in parallel.
 *
 * @param {number} startPort - The port number to reset to
 */
export function resetPortCounter(startPort = 18000) {
  void startPort;
  getTestFilePortAllocator(resolveCallerTestFileId()).reset();
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
 * @param {Object} options.timeout - Timeout configuration overrides
 */
export function initializeTestEnvironment(options = {}) {
  const {
    nodeId = 'test-node',
    raft = {},
    rebalancer = {},
    replicaHandler = {},
    timeout = {},
    storage = {},
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
    timeout: {
      ...timeout,
    },
    // Unique per-test data dir: the production default is the shared,
    // cwd-relative './data', which concurrent test lanes would collide on
    // (same SQLite file paths).
    storage: {
      dataDir: mkdtempSync(join(tmpdir(), 'lagrange-itest-data-')),
      ...storage,
    },
  });

  // Initialize logging at error level to reduce noise
  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

function assertMatchingVirginSeedDataDirectories(dataDir, managerDir) {
  if (typeof dataDir === 'string' && managerDir &&
      resolve(dataDir) !== resolve(managerDir)) {
    throw new Error(
      'Virgin seed fixture dataDir must match its data-directory manager',
    );
  }
}

function resolveVirginSeedDataDirectory(options, suppliedManagerDir) {
  const suppliedDataDir = typeof options.dataDir === 'string' ?
    options.dataDir : null;
  return {
    dataDir: suppliedDataDir || suppliedManagerDir ||
      mkdtempSync(join(tmpdir(), 'lagrange-virgin-seed-')),
    ownsDataDir: suppliedDataDir === null && suppliedManagerDir === null,
  };
}

function createVirginSeedDataDirectoryManager(
  suppliedManager, dataDir) {
  return suppliedManager || {
    isInitialized: () => true,
    getDataDir: () => dataDir,
    getPartitionsDir: () => join(dataDir, 'partitions'),
    ensurePartitionDirExists(partitionId) {
      mkdirSync(join(dataDir, 'partitions', partitionId), {recursive: true});
    },
    getPartitionDbPath(partitionId, replicaId) {
      return join(dataDir, 'partitions', partitionId, `${replicaId}.db`);
    },
  };
}

/**
 * Bind the fixture's startup custody to the seed's shutdown, in production
 * order (lagrange-runtime-startup.js: the cleanup ledger releases the data
 * directory process owner after BootstrapService.shutdown, and only when that
 * shutdown succeeded, exactly as bindDataDirectoryProcessOwner does). A
 * fixture-owned data directory is removed only after that successful release;
 * a failed shutdown retains both, as production's requiresSuccessfulCleanup
 * custody does.
 * @param {BootstrapService} bootstrap Seed bootstrap service.
 * @param {Object} custody {dataDir, ownsDataDir, directoryOwner}; a null
 *   directoryOwner means the caller supplied, and keeps, its own owner.
 */
function bindVirginSeedStartupCustody(bootstrap, custody) {
  const shutdown = bootstrap.shutdown.bind(bootstrap);
  bootstrap.shutdown = async (...args) => {
    const result = await shutdown(...args);
    custody.directoryOwner?.release();
    if (custody.ownsDataDir) {
      rmSync(custody.dataDir, {recursive: true, force: true});
    }
    return result;
  };
}

// The startup authorities each fixture-built seed consumed, for read-back.
const seedStartupAuthorities = new WeakMap();

/**
 * The production seed startup authorities for a data directory, read in
 * production order: the data directory process owner
 * (lagrange-runtime-startup.js acquireLagrangeRuntime), then the startup
 * membership decision (resolveStartupJoinDecision ->
 * resolveAutoRejoinStartupDecision), then, in startSeedNode, the durable
 * SERVICES-identity admission. Supplied options win, as they do for the
 * fixture; an owner this call acquired is released if a later read fails.
 * @param {string} dataDir Seed data directory.
 * @param {Object} options {nodeId, nodeAddress} plus optional
 *   dataDirectoryProcessOwner / membershipOwnerOutcome.
 * @param {Function} admit Refuses an admission this fixture must not start.
 * @return {Promise<Object>} {dataDirectoryProcessOwner, acquiredOwner,
 *   startupDecision (null when the outcome was supplied),
 *   membershipOwnerOutcome, startupServicesAdmission}.
 */
async function acquireSeedStartupAuthority(dataDir, options, admit) {
  const acquiredOwner = Object.hasOwn(options, 'dataDirectoryProcessOwner') ?
    null : acquireDataDirectoryProcessOwner(dataDir);
  try {
    const suppliedOutcome = Object.hasOwn(options, 'membershipOwnerOutcome');
    const startupDecision = suppliedOutcome ? null :
      await resolveAutoRejoinStartupDecision({
        dataDir,
        nodeId: options.nodeId,
        nodeAddress: options.nodeAddress,
      });
    const startupServicesAdmission = await readSeedStartupStorageAdmission(
      dataDir,
      (acquisition) => acquisition,
    );
    admit(startupServicesAdmission);
    return {
      dataDirectoryProcessOwner: acquiredOwner ??
        options.dataDirectoryProcessOwner,
      acquiredOwner,
      startupDecision,
      membershipOwnerOutcome: suppliedOutcome ?
        options.membershipOwnerOutcome : startupDecision.membershipOwnerOutcome,
      startupServicesAdmission,
    };
  } catch (error) {
    acquiredOwner?.release();
    throw error;
  }
}

function admitVirginSeedStorage(startupServicesAdmission) {
  if (startupServicesAdmission.empty !== true) {
    throw new Error('Virgin seed fixture found durable SERVICES identity');
  }
}

function admitRetainedSeedStorage(startupServicesAdmission) {
  if (startupServicesAdmission.empty === true) {
    throw new Error('Retained seed fixture found no durable SERVICES identity');
  }
}

async function createSeedBootstrapServiceFixture(options, admit) {
  const nodeId = options.nodeId;
  const nodeAddress = options.nodeAddress;
  const suppliedManager = options.dataDirectoryManager;
  const suppliedManagerDir = suppliedManager?.isInitialized?.() === true ?
    suppliedManager.getDataDir() : null;
  assertMatchingVirginSeedDataDirectories(options.dataDir, suppliedManagerDir);
  const {dataDir, ownsDataDir} = resolveVirginSeedDataDirectory(
    options,
    suppliedManagerDir,
  );
  const manager = createVirginSeedDataDirectoryManager(
    suppliedManager,
    dataDir,
  );
  const authority = await acquireSeedStartupAuthority(dataDir, options, admit);
  let bootstrap;
  try {
    bootstrap = new BootstrapService({
      ...options,
      bootIncarnation: options.bootIncarnation ?? 1,
      nodeId,
      nodeAddress,
      dataDir,
      dataDirectoryManager: manager,
      dataDirectoryProcessOwner: authority.dataDirectoryProcessOwner,
      startupServicesAdmission: authority.startupServicesAdmission,
      membershipOwnerOutcome: authority.membershipOwnerOutcome,
    });
  } catch (error) {
    authority.acquiredOwner?.release();
    throw error;
  }
  bindVirginSeedStartupCustody(bootstrap, {dataDir, ownsDataDir,
    directoryOwner: authority.acquiredOwner});
  seedStartupAuthorities.set(bootstrap, authority);
  return bootstrap;
}

/**
 * The startup authorities a fixture-built seed consumed, as the readers
 * answered them (startupDecision is the membership owner's full decision).
 * @param {BootstrapService} bootstrap A seed built by this module.
 * @return {Object|null} The authorities, or null for any other seed.
 */
export function seedStartupAuthorityOf(bootstrap) {
  return seedStartupAuthorities.get(bootstrap) ?? null;
}

/**
 * Construct a seed bootstrap fixture only after the production durable
 * SERVICES-identity reader positively proves a virgin data directory, holding
 * the production data directory process owner for the seed's lifetime.
 * Direct BootstrapService construction deliberately remains fail closed.
 * @param {Object} options BootstrapService options.
 * @return {Promise<BootstrapService>} Admitted bootstrap fixture.
 */
export function createVirginSeedBootstrapService(options = {}) {
  return createSeedBootstrapServiceFixture(options, admitVirginSeedStorage);
}

// One composed virgin seed run to the fresh-seed continuation hold: owner,
// membership decision, storage admission, original attempt and every seed
// replica. Measured at most 9.7s per seed on the 1.00x controller
// (2026-10-25, return-value-completeness; the round-5 verifier measured
// <= 8.5s). Production has no seed-start budget constant to derive this from:
// startup acquisition is bounded by its abort signal (awaitStartupAcquisition),
// not by a duration.
const VIRGIN_SEED_COMPOSE_REFERENCE_MS = 10000;

/**
 * The work-bound budget for composing a number of virgin seeds, scaled by
 * the machine factor.
 * @param {number} seedCount Seeds the test composes.
 * @return {number} Budget in milliseconds.
 */
export function virginSeedComposeBudgetMs(seedCount) {
  return seedCount * scaleByMachineFactor(VIRGIN_SEED_COMPOSE_REFERENCE_MS);
}

/**
 * A virgin seed fixture owned by one test: its shutdown is bound to the
 * test's after hook, and that shutdown releases the directory custody and
 * then removes a fixture-owned directory (bindVirginSeedStartupCustody).
 * @param {Object} t The test context (node:test or tap).
 * @param {Object} options BootstrapService options.
 * @return {Promise<BootstrapService>} Admitted bootstrap fixture.
 */
export async function createOwnedVirginSeedBootstrapService(t, options = {}) {
  const bootstrap = await createVirginSeedBootstrapService(options);
  t.after(() => bootstrap.shutdown());
  return bootstrap;
}

/**
 * The same production composition for a seed's later start on a data
 * directory an earlier start left durable SERVICES identity in.
 * @param {Object} options BootstrapService options; dataDir is required.
 * @return {Promise<BootstrapService>} Admitted bootstrap fixture.
 */
export function createRetainedSeedBootstrapService(options) {
  return createSeedBootstrapServiceFixture(options, admitRetainedSeedStorage);
}

/**
 * A virgin seed bootstrap fixture that has entered the original seed attempt
 * the way production does before its first seed phase
 * (BootstrapService.bootstrap / startSeedNode -> prepareOriginalSeedAttempt).
 * For tests that drive seed phases directly: every phase consumes this one
 * attempt. Shut it down to release the attempt and its directory custody.
 * @param {Object} options BootstrapService options.
 * @return {Promise<BootstrapService>} Prepared bootstrap fixture.
 */
export async function createPreparedVirginSeedBootstrapService(options = {}) {
  const bootstrap = await createVirginSeedBootstrapService(options);
  try {
    await bootstrap.prepareOriginalSeedAttempt();
  } catch (error) {
    await bootstrap.shutdown();
    throw error;
  }
  return bootstrap;
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
 * Own the physical storage identity of in-process joining-node fixtures.
 * A logical node keeps one canonical directory across retry attempts; a
 * distinct logical node cannot accidentally share it.
 * @return {Object} Joining-node fixture owner.
 */
export function createJoiningNodeFixtureOwner() {
  const directoryByNode = new Map();
  const nodeByDirectory = new Map();
  const ownedDirectories = new Set();
  const services = new Set();
  // Each create() is one boot lifecycle of that node: like the production
  // boot incarnation owner, a retry never reuses an issued incarnation.
  const issuedIncarnationByNode = new Map();

  function resolveNodeDirectory(nodeId, explicitDataDir) {
    if (typeof nodeId !== 'string' || nodeId.length === 0) {
      throw new Error('Joining-node fixture requires nodeId');
    }
    const existing = directoryByNode.get(nodeId);
    const explicit = typeof explicitDataDir === 'string' &&
      explicitDataDir.length > 0 ? resolve(explicitDataDir) : null;
    if (existing) {
      if (explicit && explicit !== existing) {
        throw new Error('Joining-node retry must reuse its canonical dataDir');
      }
      return existing;
    }
    const dataDir = explicit || resolve(mkdtempSync(
      join(tmpdir(), 'lagrange-joining-node-'),
    ));
    const incumbentNodeId = nodeByDirectory.get(dataDir);
    if (incumbentNodeId && incumbentNodeId !== nodeId) {
      throw new Error('Distinct joining nodes cannot share a physical dataDir');
    }
    directoryByNode.set(nodeId, dataDir);
    nodeByDirectory.set(dataDir, nodeId);
    if (!explicit) ownedDirectories.add(dataDir);
    return dataDir;
  }

  return {
    create(options = {}) {
      const dataDir = resolveNodeDirectory(options.nodeId, options.dataDir);
      const bootIncarnation = options.bootIncarnation ??
        (issuedIncarnationByNode.get(options.nodeId) ?? 0) + 1;
      issuedIncarnationByNode.set(options.nodeId, Math.max(bootIncarnation,
        issuedIncarnationByNode.get(options.nodeId) ?? 0));
      const service = new NodeJoiningService({
        ...options,
        bootIncarnation,
        dataDir,
      });
      services.add(service);
      return service;
    },
    getDataDir(nodeId) {
      return directoryByNode.get(nodeId) || null;
    },
    assertDistinctNodePaths() {
      if (new Set(directoryByNode.values()).size !== directoryByNode.size) {
        throw new Error('Joining-node fixture paths are not unique');
      }
      return true;
    },
    async shutdownAttempt(service) {
      if (!services.has(service)) return;
      services.delete(service);
      await gracefulJoiningShutdown(service);
    },
    async shutdownAll() {
      for (const service of [...services].reverse()) {
        await gracefulJoiningShutdown(service);
      }
      services.clear();
      for (const dataDir of ownedDirectories) {
        rmSync(dataDir, {recursive: true, force: true});
      }
      ownedDirectories.clear();
    },
  };
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
