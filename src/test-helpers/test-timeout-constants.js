/**
 * Test timeout constants in milliseconds.
 *
 * This module provides standardized timeout values for tests.
 * All values are in milliseconds for consistency.
 *
 * These constants ensure deterministic test behavior and enforce
 * the testing guidelines:
 * - Unit tests: 2 second hard limit
 * - Integration tests: 30 second limit
 * - Property tests: 10 iterations with {numRuns: 10}
 *
 * @module test-helpers/test-timeout-constants
 */

/**
 * Maximum duration for unit tests (2000ms = 2 seconds).
 *
 * Unit tests must complete within this time limit. Any test exceeding
 * this duration indicates a problem that requires immediate analysis:
 * - Unnecessary setTimeout() or real-time delays
 * - Uncleaned timers keeping the process alive
 * - Actual performance bugs in the implementation
 *
 * @see testing-guidelines.md - Test Duration Hard Limit
 */
export const UNIT_TEST_TIMEOUT_MS = 2000;

/**
 * Maximum duration for integration tests (30000ms = 30 seconds).
 *
 * Integration tests may take longer due to real Raft consensus,
 * multi-replica coordination, and network operations. However,
 * they must still complete within this limit.
 *
 * @see testing-guidelines.md - Integration Test Requirements
 */
export const INTEGRATION_TEST_TIMEOUT_MS = 30000;

/**
 * Test-appropriate timeout for leadership election waits (1000ms = 1 second).
 *
 * Shorter than production default (5000ms) to keep tests fast.
 * Used when waiting for Raft groups to elect a leader in tests.
 *
 * @see src/constants/time.js - DEFAULT_LEADERSHIP_WAIT_TIMEOUT (30000ms production)
 */
export const TEST_LEADERSHIP_WAIT_MS = 1000;

/**
 * Test-appropriate timeout for ACK receipt (5000ms = 5 seconds).
 *
 * Shorter than production default (30000ms) to keep tests fast.
 * Used when waiting for acknowledgment of replica operations.
 *
 * @see src/constants/time.js - DEFAULT_RPC_TIMEOUT (30000ms production)
 */
export const TEST_ACK_TIMEOUT_MS = 5000;

/**
 * Test-appropriate stabilization period (100ms).
 *
 * Shorter than production default (5000ms) to keep tests fast.
 * Used for brief waits to allow system state to stabilize
 * after operations like leadership changes or replica creation.
 *
 * @see src/constants/time.js - CONTROL_PLANE_HEARTBEAT_INTERVAL (5000ms production)
 */
export const TEST_STABILIZATION_MS = 100;

/**
 * Test-appropriate timeout for CDC propagation waits (5000ms = 5 seconds).
 *
 * CDC propagation requires:
 * - Raft consensus on the partition leader
 * - CDC event generation and delivery
 * - System table cache update propagation
 *
 * This timeout is longer than simple query timeouts to account for
 * the full CDC pipeline latency in integration tests.
 *
 * @see Requirements 6.1, 6.2 - Node join replica activation timeouts
 */
export const TEST_CDC_PROPAGATION_WAIT_MS = 5000;

/**
 * Test-appropriate polling interval for bounded polling loops (100ms).
 *
 * Used in wait functions that poll for conditions to be met.
 * Balances responsiveness with CPU usage in tests.
 */
export const TEST_POLL_INTERVAL_MS = 100;
