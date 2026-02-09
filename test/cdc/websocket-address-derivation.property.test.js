/**
 * Property test for WebSocket Address Derivation Correctness.
 *
 * Property 3: For any valid node address in "hostname:port" format where port
 * is a positive integer, deriving the WebSocket address SHALL produce a valid
 * "ws://hostname:wsPort" URL where wsPort = port + WS_PORT_OFFSET (1000).
 *
 * **Validates: Requirements 3.8**
 *
 * Feature: test-coverage-improvements
 * Property: WebSocket Address Derivation Correctness
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {CDCEventHandler} from '../../src/cdc/cdc-event-handler.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ENTRYPOINT_DEFAULT} from '../../src/constants/entrypoint.js';
import {PROTOCOL, ADDRESS} from '../../src/constants/index.js';

/**
 * Initialize test environment with required singletons.
 */
function initializeTestEnvironment() {
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

/**
 * Cleanup test environment.
 */
function cleanupTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

beforeEach(() => {
  initializeTestEnvironment();
});

afterEach(() => {
  cleanupTestEnvironment();
});

/**
 * Create a mock event context for testing.
 * @return {Object} Mock event context.
 */
function createMockEventContext() {
  return {
    epochManager: null,
    rebalancer: null,
    messageRouter: null,
    emit: () => {},
    incrementEpochChanges: () => {},
    incrementNodeStateChanges: () => {},
  };
}

/**
 * Arbitrary for generating valid hostnames.
 * Hostnames can be:
 * - Simple names (localhost, myhost)
 * - Domain names (example.com, sub.domain.org)
 * - IPv4 addresses (192.168.1.1)
 */
const hostnameArb = fc.oneof(
  // Simple hostnames (alphanumeric, starting with letter)
  fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,19}$/),
  // Domain names with dots
  fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,9}\.[a-zA-Z]{2,6}$/),
  // IPv4 addresses
  fc.tuple(
    fc.integer({min: 1, max: 255}),
    fc.integer({min: 0, max: 255}),
    fc.integer({min: 0, max: 255}),
    fc.integer({min: 0, max: 255}),
  ).map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`),
);

/**
 * Arbitrary for generating valid port numbers.
 * Ports must be positive integers (1-65535).
 * We limit to 64535 to ensure wsPort (port + 1000) doesn't overflow.
 */
const portArb = fc.integer({min: 1, max: 64535});

/**
 * Arbitrary for generating valid node addresses in "hostname:port" format.
 */
const nodeAddressArb = fc.record({
  hostname: hostnameArb,
  port: portArb,
}).map(({hostname, port}) => ({
  address: `${hostname}${ADDRESS.PORT_SEPARATOR}${port}`,
  hostname,
  port,
}));

/**
 * Property 3: WebSocket Address Derivation Correctness
 *
 * For any valid node address in "hostname:port" format where port is a
 * positive integer, deriving the WebSocket address SHALL produce a valid
 * "ws://hostname:wsPort" URL where wsPort = port + WS_PORT_OFFSET (1000).
 *
 * **Validates: Requirements 3.8**
 */
test('Property: WebSocket address derivation produces correct URL', async (t) => {
  fc.assert(
    fc.property(
      nodeAddressArb,
      ({address, hostname, port}) => {
        const context = createMockEventContext();
        const handler = new CDCEventHandler({
          nodeId: 'test-handler-node',
          eventContext: context,
        });

        // Derive WebSocket address
        const wsAddress = handler.deriveWsAddressFromNodeAddress(address);

        // Calculate expected WebSocket port
        const expectedWsPort = port + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET;
        const expectedWsAddress =
          `${PROTOCOL.WS}${hostname}${ADDRESS.PORT_SEPARATOR}${expectedWsPort}`;

        // Verify the derived address matches expected format
        return wsAddress === expectedWsAddress;
      },
    ),
    {numRuns: 10},
  );

  t.pass('WebSocket address derivation produces correct URL');
});

/**
 * Property: WebSocket address starts with ws:// protocol.
 *
 * For any valid node address, the derived WebSocket address SHALL always
 * start with the "ws://" protocol prefix.
 *
 * **Validates: Requirements 3.8**
 */
test('Property: WebSocket address starts with ws:// protocol', async (t) => {
  fc.assert(
    fc.property(
      nodeAddressArb,
      ({address}) => {
        const context = createMockEventContext();
        const handler = new CDCEventHandler({
          nodeId: 'test-handler-node',
          eventContext: context,
        });

        const wsAddress = handler.deriveWsAddressFromNodeAddress(address);

        // Verify the address starts with ws://
        return wsAddress !== null && wsAddress.startsWith(PROTOCOL.WS);
      },
    ),
    {numRuns: 10},
  );

  t.pass('WebSocket address starts with ws:// protocol');
});

/**
 * Property: WebSocket port is exactly WS_PORT_OFFSET higher than REST port.
 *
 * For any valid node address with port P, the derived WebSocket address
 * SHALL have port P + WS_PORT_OFFSET (1000).
 *
 * **Validates: Requirements 3.8**
 */
test('Property: WebSocket port offset is applied correctly', async (t) => {
  fc.assert(
    fc.property(
      nodeAddressArb,
      ({address, port}) => {
        const context = createMockEventContext();
        const handler = new CDCEventHandler({
          nodeId: 'test-handler-node',
          eventContext: context,
        });

        const wsAddress = handler.deriveWsAddressFromNodeAddress(address);

        // Extract the port from the WebSocket address
        const colonIndex = wsAddress.lastIndexOf(ADDRESS.PORT_SEPARATOR);
        const wsPortStr = wsAddress.substring(colonIndex + 1);
        const wsPort = parseInt(wsPortStr, 10);

        // Verify the port offset is correct
        const expectedWsPort = port + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET;
        return wsPort === expectedWsPort;
      },
    ),
    {numRuns: 10},
  );

  t.pass('WebSocket port offset is applied correctly');
});

/**
 * Property: Hostname is preserved in WebSocket address.
 *
 * For any valid node address with hostname H, the derived WebSocket address
 * SHALL contain the same hostname H.
 *
 * **Validates: Requirements 3.8**
 */
test('Property: Hostname is preserved in WebSocket address', async (t) => {
  fc.assert(
    fc.property(
      nodeAddressArb,
      ({address, hostname}) => {
        const context = createMockEventContext();
        const handler = new CDCEventHandler({
          nodeId: 'test-handler-node',
          eventContext: context,
        });

        const wsAddress = handler.deriveWsAddressFromNodeAddress(address);

        // Extract hostname from WebSocket address (between ws:// and :port)
        const withoutProtocol = wsAddress.substring(PROTOCOL.WS.length);
        const colonIndex = withoutProtocol.lastIndexOf(ADDRESS.PORT_SEPARATOR);
        const extractedHostname = withoutProtocol.substring(0, colonIndex);

        // Verify hostname is preserved
        return extractedHostname === hostname;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Hostname is preserved in WebSocket address');
});

/**
 * Property: Invalid addresses return null.
 *
 * For any invalid node address (null, empty, missing port, non-numeric port),
 * deriving the WebSocket address SHALL return null.
 *
 * **Validates: Requirements 3.8**
 */
test('Property: Invalid addresses return null', async (t) => {
  const invalidAddressArb = fc.oneof(
    // Null and undefined
    fc.constant(null),
    fc.constant(undefined),
    // Empty string
    fc.constant(''),
    // Missing port (no colon)
    fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,9}$/),
    // Empty hostname (colon at start)
    fc.integer({min: 1, max: 65535}).map((port) => `:${port}`),
    // Non-numeric port
    fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,9}:[a-zA-Z]+$/),
    // Zero port
    fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,9}$/).map((h) => `${h}:0`),
    // Negative port
    fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,9}$/).map((h) => `${h}:-1`),
  );

  fc.assert(
    fc.property(
      invalidAddressArb,
      (invalidAddress) => {
        const context = createMockEventContext();
        const handler = new CDCEventHandler({
          nodeId: 'test-handler-node',
          eventContext: context,
        });

        const wsAddress = handler.deriveWsAddressFromNodeAddress(invalidAddress);

        // Invalid addresses should return null
        return wsAddress === null;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Invalid addresses return null');
});

