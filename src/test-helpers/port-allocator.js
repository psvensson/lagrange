/**
 * Centralized port allocator for tests.
 *
 * Ensures unique ports across all test files by:
 * 1. Using a hash of the test file path to determine a unique port range
 * 2. Providing sequential ports within that range
 *
 * Each test file gets a range of 100 ports, starting from a base determined
 * by hashing the file path. This prevents port conflicts when tests run
 * in parallel.
 */

import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {createServer} from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {
  PORT_RANGE_START,
  PORT_RANGE_END,
  PORTS_PER_TEST_FILE,
  DEFAULT_TEST_FILE_ID,
  TEST_HOST,
} from './port-allocator-constants.js';

/**
 * Calculate the total number of available port ranges.
 */
const TOTAL_RANGES = Math.floor(
  (PORT_RANGE_END - PORT_RANGE_START) / PORTS_PER_TEST_FILE,
);
const TOTAL_PORTS = PORT_RANGE_END - PORT_RANGE_START;
const PORT_ALLOCATOR_NAMESPACE =
  process.env.DDB_TEST_PORT_ALLOCATOR_NAMESPACE || 'default';
const PORT_ALLOCATOR_STATE_DIR = path.join(
  os.tmpdir(),
  'ddb-test-port-allocator',
  PORT_ALLOCATOR_NAMESPACE,
);
const PORT_ALLOCATOR_STATE_FILE = path.join(
  PORT_ALLOCATOR_STATE_DIR,
  'state.json',
);
const PORT_ALLOCATOR_LOCK_DIR = path.join(
  PORT_ALLOCATOR_STATE_DIR,
  'lock',
);
const PORT_ALLOCATOR_LOCK_WAIT_MS = 10;
const PORT_ALLOCATOR_LOCK_ATTEMPTS = 200;
const lockWaitArray = new Int32Array(new SharedArrayBuffer(4));
const PROCESS_SCOPED_TEST_FILE_ID_SEPARATOR = ':pid:';

/**
 * Per-file port counters.
 * Maps test file identifier to current port offset within its range.
 */
const filePortOffsets = new Map();
const processReservedPorts = new Set();
let exitCleanupRegistered = false;

/**
 * Hash a string to get a deterministic number.
 *
 * @param {string} str - String to hash
 * @returns {number} Hash value
 */
function hashString(str) {
  const hash = createHash('md5').update(str).digest();
  return hash.readUInt32BE(0);
}

/**
 * Get the base port for a test file.
 * Uses a hash of the file path to determine a unique range.
 *
 * @param {string} testFileId - Identifier for the test file
 * @returns {number} Base port for this test file's range
 */
function getBasePort(testFileId) {
  const rangeIndex = hashString(testFileId) % TOTAL_RANGES;
  return PORT_RANGE_START + (rangeIndex * PORTS_PER_TEST_FILE);
}

/**
 * Scope allocator ownership to the current process so sequential test
 * processes do not immediately recycle the same deterministic range while the
 * kernel may still reject recent listener ports.
 *
 * @param {string} testFileId
 * @returns {string}
 */
function getProcessScopedTestFileId(testFileId) {
  const normalizedTestFileId =
    typeof testFileId === 'string' && testFileId.length > 0 ?
      testFileId :
      DEFAULT_TEST_FILE_ID;
  return `${normalizedTestFileId}${PROCESS_SCOPED_TEST_FILE_ID_SEPARATOR}${process.pid}`;
}

/**
 * Ensure allocator state directory exists.
 */
function ensureAllocatorStateDir() {
  fs.mkdirSync(PORT_ALLOCATOR_STATE_DIR, {recursive: true});
}

/**
 * Load allocator reservation state from disk.
 *
 * @return {Object} Reservation state.
 */
function loadAllocatorState() {
  try {
    const raw = fs.readFileSync(PORT_ALLOCATOR_STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ?
      parsed :
      {reservations: {}};
  } catch {
    return {reservations: {}};
  }
}

/**
 * Persist allocator reservation state to disk.
 *
 * @param {Object} state - Reservation state.
 */
function saveAllocatorState(state) {
  ensureAllocatorStateDir();
  fs.writeFileSync(PORT_ALLOCATOR_STATE_FILE, JSON.stringify(state), 'utf8');
}

/**
 * Check whether a process is still alive.
 *
 * @param {number} pid - Process identifier.
 * @return {boolean} True if the process still exists.
 */
function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

/**
 * Remove stale reservations for dead worker processes.
 *
 * @param {Object} state - Reservation state.
 */
function pruneDeadReservations(state) {
  const reservations = state?.reservations || {};
  for (const [port, reservation] of Object.entries(reservations)) {
    if (!isProcessAlive(reservation?.pid)) {
      delete reservations[port];
    }
  }
}

/**
 * Execute a critical section while holding the allocator lock.
 *
 * @param {Function} fn - Critical section.
 * @return {*} Result returned by fn().
 */
function withAllocatorLock(fn) {
  ensureAllocatorStateDir();
  let lockHeld = false;

  for (let attempt = 0; attempt < PORT_ALLOCATOR_LOCK_ATTEMPTS; attempt++) {
    try {
      fs.mkdirSync(PORT_ALLOCATOR_LOCK_DIR);
      lockHeld = true;
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error;
      }
      Atomics.wait(lockWaitArray, 0, 0, PORT_ALLOCATOR_LOCK_WAIT_MS);
    }
  }

  if (!lockHeld) {
    throw new Error('Timed out acquiring test port allocator lock');
  }

  try {
    return fn();
  } finally {
    try {
      fs.rmdirSync(PORT_ALLOCATOR_LOCK_DIR);
    } catch {
      // Best-effort lock cleanup only.
    }
  }
}

/**
 * Release this process's reserved ports.
 */
function releaseReservedPorts() {
  if (processReservedPorts.size === 0) {
    return;
  }

  withAllocatorLock(() => {
    const state = loadAllocatorState();
    const reservations = state.reservations || {};

    for (const port of processReservedPorts) {
      const key = String(port);
      if (reservations[key]?.pid === process.pid) {
        delete reservations[key];
      }
    }

    state.reservations = reservations;
    saveAllocatorState(state);
  });

  processReservedPorts.clear();
}

/**
 * Register process-exit cleanup for reserved ports.
 */
function registerExitCleanup() {
  if (exitCleanupRegistered) {
    return;
  }
  exitCleanupRegistered = true;
  process.on('exit', () => {
    try {
      releaseReservedPorts();
    } catch {
      // Best-effort cleanup only.
    }
  });
}

/**
 * Reserve a unique port across concurrent test worker processes.
 *
 * @param {number} requestedPort - Preferred port candidate.
 * @param {string} testFileId - Allocator owner identifier.
 * @return {number} Reserved port.
 */
function reservePort(requestedPort, testFileId) {
  registerExitCleanup();

  return withAllocatorLock(() => {
    const state = loadAllocatorState();
    pruneDeadReservations(state);
    const reservations = state.reservations || {};
    const startOffset =
      ((requestedPort - PORT_RANGE_START) % TOTAL_PORTS + TOTAL_PORTS) %
      TOTAL_PORTS;

    for (let attempt = 0; attempt < TOTAL_PORTS; attempt++) {
      const port = PORT_RANGE_START + ((startOffset + attempt) % TOTAL_PORTS);
      const key = String(port);
      if (reservations[key]) {
        continue;
      }

      reservations[key] = {
        pid: process.pid,
        testFileId,
      };
      state.reservations = reservations;
      saveAllocatorState(state);
      processReservedPorts.add(port);
      return port;
    }

    throw new Error('No available test ports remain in allocator range');
  });
}

/**
 * Get a unique port for a test.
 *
 * @param {string} [testFileId] - Optional test file identifier.
 *   If not provided, uses a default range. Recommended to pass
 *   import.meta.url for consistent per-file allocation.
 * @returns {number} A unique port number
 */
export function getTestPort(testFileId = DEFAULT_TEST_FILE_ID) {
  const processScopedTestFileId = getProcessScopedTestFileId(testFileId);
  const basePort = getBasePort(processScopedTestFileId);
  const currentOffset = filePortOffsets.get(processScopedTestFileId) || 0;

  if (currentOffset >= PORTS_PER_TEST_FILE) {
    throw new Error(
      `Port range exhausted for test file: ${testFileId}. ` +
      `Maximum ${PORTS_PER_TEST_FILE} ports per file.`,
    );
  }

  filePortOffsets.set(processScopedTestFileId, currentOffset + 1);
  return reservePort(basePort + currentOffset, processScopedTestFileId);
}

/**
 * Reset the port counter for a test file.
 * Useful in beforeEach() to ensure consistent port allocation.
 *
 * @param {string} [testFileId] - Test file identifier to reset
 */
export function resetTestPorts(testFileId = DEFAULT_TEST_FILE_ID) {
  filePortOffsets.set(getProcessScopedTestFileId(testFileId), 0);
}

/**
 * Get an available port by actually binding to port 0.
 * This is the most reliable way to get a free port, but requires
 * async operation.
 *
 * @returns {Promise<number>} An available port number
 */
export function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, TEST_HOST, () => {
      const {port} = server.address();
      server.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve(port);
        }
      });
    });
    server.on('error', reject);
  });
}

/**
 * Get multiple available ports.
 *
 * @param {number} count - Number of ports to allocate
 * @returns {Promise<number[]>} Array of available port numbers
 */
export async function getAvailablePorts(count) {
  const ports = [];
  for (let i = 0; i < count; i++) {
    ports.push(await getAvailablePort());
  }
  return ports;
}

/**
 * Create a port allocator bound to a specific test file.
 * This is the recommended way to use the port allocator.
 *
 * @param {string} testFileId - Test file identifier (use import.meta.url)
 * @returns {Object} Port allocator with getPort() and reset() methods
 *
 * @example
 * // At the top of your test file:
 * import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
 * const ports = createPortAllocator(import.meta.url);
 *
 * // In beforeEach:
 * beforeEach(() => {
 *   ports.reset();
 * });
 *
 * // In tests:
 * const port = ports.getPort();
 */
export function createPortAllocator(testFileId) {
  return {
    /**
     * Get the next unique port for this test file.
     * @returns {number} A unique port number
     */
    getPort() {
      return getTestPort(testFileId);
    },

    /**
     * Reset the port counter for this test file.
     */
    reset() {
      resetTestPorts(testFileId);
    },

    /**
     * Get an available port by binding to port 0.
     * @returns {Promise<number>} An available port number
     */
    async getAvailable() {
      return getAvailablePort();
    },
  };
}
