/**
 * Property test for Transport Registry Provider Management.
 *
 * Property 3: For any sequence of register and unregister operations on the
 * TransportRegistry, a provider SHALL be retrievable by type if and only if
 * it was registered and not subsequently unregistered.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 *
 * **Feature: transport-abstraction-layer, Property 3: Transport Registry Provider Management**
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {TransportRegistry} from '../../src/transport/transport-registry.js';
import {TransportProvider} from '../../src/transport/transport-provider.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TRANSPORT_TYPE} from '../../src/constants/index.js';

/**
 * Operation types for the property test.
 */
const OPERATION = Object.freeze({
  REGISTER: 'register',
  UNREGISTER: 'unregister',
});

/**
 * Available transport types for testing.
 */
const TRANSPORT_TYPES = [
  TRANSPORT_TYPE.WEBSOCKET,
  TRANSPORT_TYPE.NATS,
  TRANSPORT_TYPE.VEILID,
];

/**
 * Initialize test environment.
 */
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'test-node'},
    logging: {level: 'error'},
  });

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

/**
 * Clean up test environment.
 */
function cleanupTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

/**
 * Creates a mock TransportProvider for testing.
 * @param {string} transportType - The transport type identifier
 * @param {boolean} available - Whether the provider is available
 * @return {TransportProvider} A mock provider implementation
 */
function createMockProvider(transportType, available = true) {
  class MockProvider extends TransportProvider {
    getType() {
      return transportType;
    }

    isAvailable() {
      return available;
    }

    async connect(_endpoint) {
      return {connectionId: 'mock-conn', state: 'connected'};
    }

    async send(_connection, _message) {
      return {success: true};
    }

    async disconnect(_connection) {}

    getHealthStatus(_connection) {
      return {state: 'connected', healthy: true};
    }

    async shutdown() {}
  }

  return new MockProvider();
}

/**
 * Applies a sequence of operations to a registry and tracks expected state.
 * @param {TransportRegistry} registry - The registry to apply operations to
 * @param {Array<Object>} operations - Array of {type, transportType} operations
 * @return {Map<string, boolean>} Expected state: transportType -> isRegistered
 */
function applyOperationsAndTrackState(registry, operations) {
  const expectedState = new Map();

  for (const op of operations) {
    if (op.type === OPERATION.REGISTER) {
      const provider = createMockProvider(op.transportType);
      registry.registerProvider(provider);
      expectedState.set(op.transportType, true);
    } else if (op.type === OPERATION.UNREGISTER) {
      registry.unregisterProvider(op.transportType);
      expectedState.set(op.transportType, false);
    }
  }

  return expectedState;
}

/**
 * Verifies that the registry state matches the expected state.
 * @param {TransportRegistry} registry - The registry to verify
 * @param {Map<string, boolean>} expectedState - Expected state map
 * @return {boolean} True if state matches, false otherwise
 */
function verifyRegistryState(registry, expectedState) {
  for (const [transportType, shouldBeRegistered] of expectedState) {
    const provider = registry.getProvider(transportType);
    const isRegistered = provider !== null;

    if (isRegistered !== shouldBeRegistered) {
      return false;
    }

    // Also verify hasProvider matches
    if (registry.hasProvider(transportType) !== shouldBeRegistered) {
      return false;
    }
  }

  return true;
}

/**
 * Feature: transport-abstraction-layer
 * Property 3: Transport Registry Provider Management
 *
 * For any sequence of register and unregister operations on the TransportRegistry,
 * a provider SHALL be retrievable by type if and only if it was registered and
 * not subsequently unregistered.
 */
test('Property 3: Transport Registry Provider Management', async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(() => {
    cleanupTestEnvironment();
  });

  /**
   * Property: Provider is retrievable after registration.
   *
   * For any transport type, after registering a provider, getProvider SHALL
   * return that provider.
   *
   * **Validates: Requirements 3.1, 3.2**
   */
  t.test('provider is retrievable after registration', async (t) => {
    await fc.assert(
      fc.property(
        fc.constantFrom(...TRANSPORT_TYPES),
        (transportType) => {
          const cache = new SystemTableCache();
          const registry = new TransportRegistry(cache);
          const provider = createMockProvider(transportType);

          // Register the provider
          registry.registerProvider(provider);

          // Provider should be retrievable
          const retrieved = registry.getProvider(transportType);
          return retrieved !== null &&
                 retrieved.getType() === transportType &&
                 registry.hasProvider(transportType) === true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('provider is retrievable after registration');
  });

  /**
   * Property: Provider is not retrievable after unregistration.
   *
   * For any transport type, after registering and then unregistering a provider,
   * getProvider SHALL return null.
   *
   * **Validates: Requirements 3.3**
   */
  t.test('provider is not retrievable after unregistration', async (t) => {
    await fc.assert(
      fc.property(
        fc.constantFrom(...TRANSPORT_TYPES),
        (transportType) => {
          const cache = new SystemTableCache();
          const registry = new TransportRegistry(cache);
          const provider = createMockProvider(transportType);

          // Register then unregister
          registry.registerProvider(provider);
          registry.unregisterProvider(transportType);

          // Provider should not be retrievable
          return registry.getProvider(transportType) === null &&
                 registry.hasProvider(transportType) === false;
        },
      ),
      {numRuns: 10},
    );

    t.pass('provider is not retrievable after unregistration');
  });

  /**
   * Property: Arbitrary sequences of register/unregister maintain correct state.
   *
   * For any sequence of register and unregister operations, the final state
   * of the registry SHALL reflect only the providers that were registered
   * and not subsequently unregistered.
   *
   * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
   */
  t.test('arbitrary operation sequences maintain correct state', async (t) => {
    // Generate arbitrary sequences of register/unregister operations
    const operationArb = fc.record({
      type: fc.constantFrom(OPERATION.REGISTER, OPERATION.UNREGISTER),
      transportType: fc.constantFrom(...TRANSPORT_TYPES),
    });

    await fc.assert(
      fc.property(
        fc.array(operationArb, {minLength: 1, maxLength: 20}),
        (operations) => {
          const cache = new SystemTableCache();
          const registry = new TransportRegistry(cache);

          // Apply operations and track expected state
          const expectedState = applyOperationsAndTrackState(registry, operations);

          // Verify registry matches expected state
          return verifyRegistryState(registry, expectedState);
        },
      ),
      {numRuns: 10},
    );

    t.pass('arbitrary operation sequences maintain correct state');
  });

  /**
   * Property: Re-registration replaces existing provider.
   *
   * For any transport type, registering a new provider of the same type
   * SHALL replace the existing provider.
   *
   * **Validates: Requirements 3.4**
   */
  t.test('re-registration replaces existing provider', async (t) => {
    await fc.assert(
      fc.property(
        fc.constantFrom(...TRANSPORT_TYPES),
        fc.boolean(),
        fc.boolean(),
        (transportType, available1, available2) => {
          const cache = new SystemTableCache();
          const registry = new TransportRegistry(cache);

          // Register first provider
          const provider1 = createMockProvider(transportType, available1);
          registry.registerProvider(provider1);

          // Register second provider of same type
          const provider2 = createMockProvider(transportType, available2);
          registry.registerProvider(provider2);

          // Should have exactly one provider
          if (registry.getProviderCount() !== 1) {
            return false;
          }

          // Retrieved provider should be the second one
          const retrieved = registry.getProvider(transportType);
          return retrieved !== null &&
                 retrieved === provider2 &&
                 retrieved.isAvailable() === available2;
        },
      ),
      {numRuns: 10},
    );

    t.pass('re-registration replaces existing provider');
  });

  /**
   * Property: Unregistering non-existent provider returns false.
   *
   * For any transport type that was never registered, unregisterProvider
   * SHALL return false without error.
   *
   * **Validates: Requirements 3.3**
   */
  t.test('unregistering non-existent provider returns false', async (t) => {
    await fc.assert(
      fc.property(
        fc.constantFrom(...TRANSPORT_TYPES),
        (transportType) => {
          const cache = new SystemTableCache();
          const registry = new TransportRegistry(cache);

          // Unregister without registering first
          const result = registry.unregisterProvider(transportType);

          // Should return false and not throw
          return result === false &&
                 registry.getProvider(transportType) === null;
        },
      ),
      {numRuns: 10},
    );

    t.pass('unregistering non-existent provider returns false');
  });

  /**
   * Property: Multiple providers of different types coexist.
   *
   * For any subset of transport types, registering providers for each type
   * SHALL result in all providers being retrievable independently.
   *
   * **Validates: Requirements 3.1, 3.2**
   */
  t.test('multiple providers of different types coexist', async (t) => {
    await fc.assert(
      fc.property(
        fc.subarray(TRANSPORT_TYPES, {minLength: 1}),
        (typesToRegister) => {
          const cache = new SystemTableCache();
          const registry = new TransportRegistry(cache);
          const providers = new Map();

          // Register providers for each type
          for (const transportType of typesToRegister) {
            const provider = createMockProvider(transportType);
            registry.registerProvider(provider);
            providers.set(transportType, provider);
          }

          // Verify count matches
          if (registry.getProviderCount() !== typesToRegister.length) {
            return false;
          }

          // Verify each provider is retrievable
          for (const [transportType, provider] of providers) {
            const retrieved = registry.getProvider(transportType);
            if (retrieved !== provider) {
              return false;
            }
          }

          // Verify registered types match
          const registeredTypes = registry.getRegisteredTypes();
          if (registeredTypes.length !== typesToRegister.length) {
            return false;
          }

          for (const transportType of typesToRegister) {
            if (!registeredTypes.includes(transportType)) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('multiple providers of different types coexist');
  });

  /**
   * Property: Unregistering one type does not affect others.
   *
   * For any set of registered providers, unregistering one type SHALL NOT
   * affect the retrievability of other registered providers.
   *
   * **Validates: Requirements 3.3, 3.4**
   */
  t.test('unregistering one type does not affect others', async (t) => {
    await fc.assert(
      fc.property(
        // Need at least 2 types to test this property
        fc.subarray(TRANSPORT_TYPES, {minLength: 2}),
        (typesToRegister) => {
          const cache = new SystemTableCache();
          const registry = new TransportRegistry(cache);
          const providers = new Map();

          // Register all providers
          for (const transportType of typesToRegister) {
            const provider = createMockProvider(transportType);
            registry.registerProvider(provider);
            providers.set(transportType, provider);
          }

          // Unregister the first type
          const typeToUnregister = typesToRegister[0];
          registry.unregisterProvider(typeToUnregister);

          // Verify unregistered type is gone
          if (registry.getProvider(typeToUnregister) !== null) {
            return false;
          }

          // Verify other types are still present
          for (let i = 1; i < typesToRegister.length; i++) {
            const transportType = typesToRegister[i];
            const retrieved = registry.getProvider(transportType);
            if (retrieved !== providers.get(transportType)) {
              return false;
            }
          }

          // Verify count is correct
          return registry.getProviderCount() === typesToRegister.length - 1;
        },
      ),
      {numRuns: 10},
    );

    t.pass('unregistering one type does not affect others');
  });

  /**
   * Property: Empty registry returns null for any type.
   *
   * For any transport type, an empty registry SHALL return null from
   * getProvider and false from hasProvider.
   *
   * **Validates: Requirements 3.1**
   */
  t.test('empty registry returns null for any type', async (t) => {
    await fc.assert(
      fc.property(
        fc.constantFrom(...TRANSPORT_TYPES),
        (transportType) => {
          const cache = new SystemTableCache();
          const registry = new TransportRegistry(cache);

          // Empty registry should return null/false
          return registry.getProvider(transportType) === null &&
                 registry.hasProvider(transportType) === false &&
                 registry.getProviderCount() === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('empty registry returns null for any type');
  });
});
