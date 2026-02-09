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
import {createServer} from 'node:net';
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

/**
 * Per-file port counters.
 * Maps test file identifier to current port offset within its range.
 */
const filePortOffsets = new Map();

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
 * Get a unique port for a test.
 *
 * @param {string} [testFileId] - Optional test file identifier.
 *   If not provided, uses a default range. Recommended to pass
 *   import.meta.url for consistent per-file allocation.
 * @returns {number} A unique port number
 */
export function getTestPort(testFileId = DEFAULT_TEST_FILE_ID) {
  const basePort = getBasePort(testFileId);
  const currentOffset = filePortOffsets.get(testFileId) || 0;

  if (currentOffset >= PORTS_PER_TEST_FILE) {
    throw new Error(
      `Port range exhausted for test file: ${testFileId}. ` +
      `Maximum ${PORTS_PER_TEST_FILE} ports per file.`,
    );
  }

  filePortOffsets.set(testFileId, currentOffset + 1);
  return basePort + currentOffset;
}

/**
 * Reset the port counter for a test file.
 * Useful in beforeEach() to ensure consistent port allocation.
 *
 * @param {string} [testFileId] - Test file identifier to reset
 */
export function resetTestPorts(testFileId = DEFAULT_TEST_FILE_ID) {
  filePortOffsets.set(testFileId, 0);
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
