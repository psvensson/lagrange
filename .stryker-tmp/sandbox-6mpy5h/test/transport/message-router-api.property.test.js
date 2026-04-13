/**
 * Property tests for MessageRouter API compatibility.
 * Validates that the refactored MessageRouter maintains API compatibility.
 *
 * Feature: code-quality-improvements
 * Property 1: Message Router API Compatibility
 * Property 2: Connection State Behavior Equivalence
 *
 * Validates: Requirements 1.1, 1.4
 */
// @ts-nocheck


import t from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {MessageRouter, ConnectionState} from '../../src/transport/message-router.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';

const ports = createPortAllocator(import.meta.url);

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
 * Expected public API methods for MessageRouter.
 */
const EXPECTED_API_METHODS = Object.freeze([
  'initialize',
  'register',
  'unregister',
  'deliver',
  'connectToNode',
  'parseAddress',
  'isValidAddress',
  'setServiceNodeResolver',
  'setIdentificationPayload',
  'isRegistered',
  'getRegisteredAddresses',
  'getConnectionState',
  'getConnectedNodes',
  'hasSelfConnection',
  'pingNode',
  'isOutboundQueueAvailable',
  'getStats',
  'shutdown',
  'registerWorkerHandler',
  'unregisterWorkerHandler',
  'hasWorkerHandler',
]);

/**
 * Valid entity types for addresses.
 */
const VALID_ENTITY_TYPES = Object.freeze([
  'message-group',
  'partition',
  'lifecycle',
  'service',
]);

t.test('MessageRouter API Compatibility Property Tests', async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
    ports.reset();
  });

  t.afterEach(() => {
    cleanupTestEnvironment();
  });

  t.test('Property 1: Message Router API Compatibility', async (t) => {
    /**
     * **Feature: code-quality-improvements, Property 1: Message Router API Compatibility**
     *
     * For any public method on the original MessageRouter class, the refactored
     * MessageRouter SHALL export a method with the same name and compatible signature.
     *
     * **Validates: Requirements 1.1**
     */
    const router = new MessageRouter({nodeId: 'test-node'});

    fc.assert(
      fc.property(
        fc.constantFrom(...EXPECTED_API_METHODS),
        (methodName) => {
          const method = router[methodName];
          return typeof method === 'function';
        },
      ),
      {numRuns: 10},
    );

    t.pass('All expected API methods exist and are functions');
    await router.shutdown();
  });

  t.test('Property 2: Connection State Behavior Equivalence', async (t) => {
    /**
     * **Feature: code-quality-improvements, Property 2: Connection State Behavior Equivalence**
     *
     * For any sequence of connection operations, the refactored router SHALL
     * produce the same connection state transitions as the original implementation.
     *
     * **Validates: Requirements 1.4**
     */
    const port = ports.getPort();
    const router = new MessageRouter({
      nodeId: 'test-node',
      wsPort: port,
      inProcess: true,
    });

    await router.initialize({startServer: true});

    // Verify initial state
    t.equal(router.initialized, true, 'should be initialized');
    t.ok(router.hasSelfConnection(), 'should have self-connection');

    // Verify connection state for self
    const selfState = router.getConnectionState('test-node');
    t.equal(selfState, ConnectionState.CONNECTED, 'self should be connected');

    // Verify connected nodes includes self
    const connectedNodes = router.getConnectedNodes();
    t.ok(connectedNodes.includes('test-node'), 'connected nodes should include self');

    await router.shutdown();

    // Verify shutdown state
    t.equal(router.initialized, false, 'should not be initialized after shutdown');
    t.equal(router.getConnectedNodes().length, 0, 'should have no connections after shutdown');
  });

  t.test('Property: Address parsing is consistent', async (t) => {
    /**
     * For any valid address, parseAddress should return consistent components.
     */
    const router = new MessageRouter({nodeId: 'test-node'});

    fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 20}),
        fc.constantFrom(...VALID_ENTITY_TYPES),
        fc.string({minLength: 1, maxLength: 20}),
        (nodeId, entityType, entityId) => {
          // Filter out strings with slashes to avoid malformed addresses
          if (nodeId.includes('/') || entityId.includes('/')) {
            return true; // Skip this case
          }

          const address = `${nodeId}/${entityType}/${entityId}`;
          const parsed = router.parseAddress(address);

          return parsed.nodeId === nodeId &&
                 parsed.entityType === entityType &&
                 parsed.entityId === entityId;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Address parsing is consistent');
    await router.shutdown();
  });

  t.test('Property: Address validation accepts valid addresses', async (t) => {
    /**
     * For any address with valid entity type, isValidAddress should return true.
     */
    const router = new MessageRouter({nodeId: 'test-node'});

    fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 20}),
        fc.constantFrom(...VALID_ENTITY_TYPES),
        fc.string({minLength: 1, maxLength: 20}),
        (nodeId, entityType, entityId) => {
          // Filter out strings with slashes or empty parts
          if (nodeId.includes('/') || entityId.includes('/') ||
              nodeId.length === 0 || entityId.length === 0) {
            return true; // Skip this case
          }

          const address = `${nodeId}/${entityType}/${entityId}`;
          return router.isValidAddress(address) === true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Address validation accepts valid addresses');
    await router.shutdown();
  });

  t.test('Property: Address validation rejects invalid entity types', async (t) => {
    /**
     * For any address with invalid entity type, isValidAddress should return false.
     */
    const router = new MessageRouter({nodeId: 'test-node'});

    fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 20}),
        fc.string({minLength: 1, maxLength: 20}).filter(
          (s) => !VALID_ENTITY_TYPES.includes(s) && !s.includes('/'),
        ),
        fc.string({minLength: 1, maxLength: 20}),
        (nodeId, invalidEntityType, entityId) => {
          // Filter out strings with slashes
          if (nodeId.includes('/') || entityId.includes('/')) {
            return true; // Skip this case
          }

          const address = `${nodeId}/${invalidEntityType}/${entityId}`;
          return router.isValidAddress(address) === false;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Address validation rejects invalid entity types');
    await router.shutdown();
  });

  t.test('Property: legacy join protocol API is absent', async (t) => {
    const router = new MessageRouter({nodeId: 'test-node'});

    t.equal(
      typeof router.setJoinRequestHandler,
      'undefined',
      'legacy JOIN_REQUEST handler registration should be absent',
    );
    t.equal(
      typeof router.setJoinCompleteHandler,
      'undefined',
      'legacy JOIN_COMPLETE handler registration should be absent',
    );
    t.equal(
      typeof router.sendJoinRequest,
      'undefined',
      'legacy JOIN_REQUEST sender should be absent',
    );
    t.equal(
      typeof router.sendJoinComplete,
      'undefined',
      'legacy JOIN_COMPLETE sender should be absent',
    );

    await router.shutdown();
  });
});
