/**
 * Constants for the test port allocator.
 */

/**
 * Start of the ephemeral port range.
 * Using IANA-defined ephemeral port range to avoid conflicts.
 */
export const PORT_RANGE_START = 49152;

/**
 * End of the ephemeral port range.
 * Leaving some buffer before 65535.
 */
export const PORT_RANGE_END = 65000;

/**
 * Number of ports allocated per test file.
 * Each test file gets its own range of this many ports.
 */
export const PORTS_PER_TEST_FILE = 100;

/**
 * Default test file identifier when none is provided.
 */
export const DEFAULT_TEST_FILE_ID = 'default';

/**
 * Localhost address for binding test servers.
 */
export const TEST_HOST = '127.0.0.1';
