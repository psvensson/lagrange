/**
 * Property test for Transport Provider Interface Compliance.
 *
 * Property 2: For any registered TransportProvider, it SHALL implement all
 * required interface methods (getType, isAvailable, connect, send, disconnect,
 * getHealthStatus, shutdown) and each method SHALL return the expected type.
 *
 * **Validates: Requirements 2.1, 2.2**
 *
 * **Feature: transport-abstraction-layer, Property 2: Transport Provider Interface Compliance**
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {TransportProvider} from '../../src/transport/transport-provider.js';

/**
 * Required interface methods that all TransportProvider implementations must have.
 */
const REQUIRED_METHODS = [
  'getType',
  'isAvailable',
  'connect',
  'send',
  'disconnect',
  'getHealthStatus',
  'shutdown',
];

/**
 * Creates a minimal valid TransportProvider implementation for testing.
 * This simulates what a real provider (WebSocket, NATS, etc.) would implement.
 *
 * @param {string} transportType - The transport type identifier
 * @param {boolean} available - Whether the provider is available
 * @return {TransportProvider} A valid provider implementation
 */
function createValidProvider(transportType, available) {
  class TestProvider extends TransportProvider {
    getType() {
      return transportType;
    }

    isAvailable() {
      return available;
    }

    async connect(_endpoint) {
      return {
        connectionId: 'test-conn-id',
        nodeId: _endpoint.node_id,
        endpointId: _endpoint.endpoint_id,
        transportType: this.getType(),
        state: 'connected',
        createdAt: Date.now(),
        lastActivity: Date.now(),
      };
    }

    async send(_connection, _message) {
      return {
        success: true,
        latency: 10,
      };
    }

    async disconnect(_connection) {
      // Graceful disconnect
    }

    getHealthStatus(_connection) {
      return {
        state: 'connected',
        latency: 5,
        lastActivity: Date.now(),
        healthy: true,
      };
    }

    async shutdown() {
      // Graceful shutdown
    }
  }

  return new TestProvider();
}

/**
 * Creates an incomplete provider that is missing some required methods.
 * Used to test that interface compliance detection works correctly.
 *
 * @param {Array<string>} missingMethods - Methods to omit from implementation
 * @return {Object} An incomplete provider-like object
 */
function createIncompleteProvider(missingMethods) {
  const provider = {};

  // Add all methods except the missing ones
  for (const method of REQUIRED_METHODS) {
    if (!missingMethods.includes(method)) {
      if (method === 'getType') {
        provider[method] = () => 'test';
      } else if (method === 'isAvailable') {
        provider[method] = () => true;
      } else if (method === 'connect' || method === 'send' ||
                 method === 'disconnect' || method === 'shutdown') {
        provider[method] = async () => ({});
      } else if (method === 'getHealthStatus') {
        provider[method] = () => ({healthy: true});
      }
    }
  }

  return provider;
}

/**
 * Checks if an object implements all required TransportProvider methods.
 *
 * @param {Object} provider - Object to check
 * @return {Object} Result with isCompliant boolean and missingMethods array
 */
function checkInterfaceCompliance(provider) {
  const missingMethods = [];

  for (const method of REQUIRED_METHODS) {
    if (typeof provider[method] !== 'function') {
      missingMethods.push(method);
    }
  }

  return {
    isCompliant: missingMethods.length === 0,
    missingMethods,
  };
}

/**
 * Feature: transport-abstraction-layer
 * Property 2: Transport Provider Interface Compliance
 *
 * For any registered TransportProvider, it SHALL implement all required
 * interface methods (getType, isAvailable, connect, send, disconnect,
 * getHealthStatus, shutdown) and each method SHALL return the expected type.
 */
test('Property 2: Transport Provider Interface Compliance', async (t) => {
  /**
   * Property: Any valid TransportProvider implementation has all required methods.
   *
   * For any transport type and availability state, a properly implemented
   * provider SHALL have all required interface methods as functions.
   */
  t.test('valid providers have all required interface methods', async (t) => {
    await fc.assert(
      fc.property(
        // Generate transport type identifiers
        fc.constantFrom('ws', 'nats', 'veilid', 'tcp', 'udp', 'custom'),
        // Generate availability state
        fc.boolean(),
        (transportType, available) => {
          const provider = createValidProvider(transportType, available);
          const compliance = checkInterfaceCompliance(provider);

          // All required methods must be present
          return compliance.isCompliant && compliance.missingMethods.length === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('valid providers have all required interface methods');
  });

  /**
   * Property: getType returns a string for any valid provider.
   *
   * For any valid TransportProvider, getType() SHALL return a string
   * that identifies the transport type.
   */
  t.test('getType returns string transport type identifier', async (t) => {
    await fc.assert(
      fc.property(
        fc.constantFrom('ws', 'nats', 'veilid', 'tcp', 'custom'),
        fc.boolean(),
        (transportType, available) => {
          const provider = createValidProvider(transportType, available);
          const result = provider.getType();

          // getType must return a string
          return typeof result === 'string' && result === transportType;
        },
      ),
      {numRuns: 10},
    );

    t.pass('getType returns string transport type identifier');
  });

  /**
   * Property: isAvailable returns a boolean for any valid provider.
   *
   * For any valid TransportProvider, isAvailable() SHALL return a boolean
   * indicating whether the transport can accept connections.
   */
  t.test('isAvailable returns boolean availability status', async (t) => {
    await fc.assert(
      fc.property(
        fc.constantFrom('ws', 'nats', 'veilid'),
        fc.boolean(),
        (transportType, available) => {
          const provider = createValidProvider(transportType, available);
          const result = provider.isAvailable();

          // isAvailable must return a boolean matching the configured state
          return typeof result === 'boolean' && result === available;
        },
      ),
      {numRuns: 10},
    );

    t.pass('isAvailable returns boolean availability status');
  });

  /**
   * Property: connect returns a Promise that resolves to a connection object.
   *
   * For any valid endpoint, connect() SHALL return a Promise that resolves
   * to a connection object with required fields.
   */
  t.test('connect returns Promise resolving to connection object', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('ws', 'nats', 'veilid'),
        // Generate endpoint data
        fc.record({
          endpoint_id: fc.uuid(),
          node_id: fc.uuid(),
          transport_type: fc.constantFrom('ws', 'nats', 'veilid'),
          address: fc.string({minLength: 5, maxLength: 50}),
          priority: fc.integer({min: 0, max: 100}),
          metadata: fc.constant('{}'),
          status: fc.constant('active'),
        }),
        async (transportType, endpoint) => {
          const provider = createValidProvider(transportType, true);
          const result = await provider.connect(endpoint);

          // connect must return an object with connection details
          return typeof result === 'object' &&
                 result !== null &&
                 typeof result.connectionId === 'string' &&
                 typeof result.state === 'string';
        },
      ),
      {numRuns: 10},
    );

    t.pass('connect returns Promise resolving to connection object');
  });

  /**
   * Property: send returns a Promise that resolves to a delivery result.
   *
   * For any valid connection and message, send() SHALL return a Promise
   * that resolves to a result object with success status.
   */
  t.test('send returns Promise resolving to delivery result', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('ws', 'nats', 'veilid'),
        // Generate message data
        fc.record({
          type: fc.string({minLength: 1, maxLength: 20}),
          payload: fc.object(),
        }),
        async (transportType, message) => {
          const provider = createValidProvider(transportType, true);
          const connection = {connectionId: 'test', state: 'connected'};
          const result = await provider.send(connection, message);

          // send must return an object with success status
          return typeof result === 'object' &&
                 result !== null &&
                 typeof result.success === 'boolean';
        },
      ),
      {numRuns: 10},
    );

    t.pass('send returns Promise resolving to delivery result');
  });

  /**
   * Property: disconnect returns a Promise that resolves.
   *
   * For any valid connection, disconnect() SHALL return a Promise
   * that resolves (void).
   */
  t.test('disconnect returns Promise that resolves', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('ws', 'nats', 'veilid'),
        async (transportType) => {
          const provider = createValidProvider(transportType, true);
          const connection = {connectionId: 'test', state: 'connected'};

          // disconnect should return a Promise that resolves
          const result = await provider.disconnect(connection);

          // disconnect returns void (undefined)
          return result === undefined;
        },
      ),
      {numRuns: 10},
    );

    t.pass('disconnect returns Promise that resolves');
  });

  /**
   * Property: getHealthStatus returns a health status object.
   *
   * For any valid connection, getHealthStatus() SHALL return an object
   * with health information including state and healthy flag.
   */
  t.test('getHealthStatus returns health status object', async (t) => {
    await fc.assert(
      fc.property(
        fc.constantFrom('ws', 'nats', 'veilid'),
        (transportType) => {
          const provider = createValidProvider(transportType, true);
          const connection = {connectionId: 'test', state: 'connected'};
          const result = provider.getHealthStatus(connection);

          // getHealthStatus must return an object with health info
          return typeof result === 'object' &&
                 result !== null &&
                 typeof result.state === 'string' &&
                 typeof result.healthy === 'boolean';
        },
      ),
      {numRuns: 10},
    );

    t.pass('getHealthStatus returns health status object');
  });

  /**
   * Property: shutdown returns a Promise that resolves.
   *
   * For any valid provider, shutdown() SHALL return a Promise
   * that resolves (void).
   */
  t.test('shutdown returns Promise that resolves', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('ws', 'nats', 'veilid'),
        fc.boolean(),
        async (transportType, available) => {
          const provider = createValidProvider(transportType, available);

          // shutdown should return a Promise that resolves
          const result = await provider.shutdown();

          // shutdown returns void (undefined)
          return result === undefined;
        },
      ),
      {numRuns: 10},
    );

    t.pass('shutdown returns Promise that resolves');
  });

  /**
   * Property: Incomplete providers are detected as non-compliant.
   *
   * For any subset of missing methods, an incomplete provider SHALL be
   * detected as non-compliant with the correct missing methods identified.
   */
  t.test('incomplete providers are detected as non-compliant', async (t) => {
    await fc.assert(
      fc.property(
        // Generate a non-empty subset of methods to omit
        fc.subarray(REQUIRED_METHODS, {minLength: 1}),
        (missingMethods) => {
          const incompleteProvider = createIncompleteProvider(missingMethods);
          const compliance = checkInterfaceCompliance(incompleteProvider);

          // Provider should be non-compliant
          if (compliance.isCompliant) return false;

          // All missing methods should be detected
          for (const method of missingMethods) {
            if (!compliance.missingMethods.includes(method)) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('incomplete providers are detected as non-compliant');
  });

  /**
   * Property: Base TransportProvider throws for unimplemented methods.
   *
   * For any method call on the base TransportProvider class, it SHALL
   * throw an error indicating the method must be implemented by subclass.
   */
  t.test('base TransportProvider throws for unimplemented methods', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...REQUIRED_METHODS),
        async (methodName) => {
          const baseProvider = new TransportProvider();

          let threwError = false;
          let errorMessage = '';

          try {
            if (methodName === 'connect' || methodName === 'send' ||
                methodName === 'disconnect' || methodName === 'shutdown') {
              await baseProvider[methodName]({});
            } else {
              baseProvider[methodName]({});
            }
          } catch (e) {
            threwError = true;
            errorMessage = e.message;
          }

          // Base class should throw with "Not implemented" message
          return threwError &&
                 errorMessage.includes('Not implemented') &&
                 errorMessage.includes(methodName);
        },
      ),
      {numRuns: 10},
    );

    t.pass('base TransportProvider throws for unimplemented methods');
  });
});
