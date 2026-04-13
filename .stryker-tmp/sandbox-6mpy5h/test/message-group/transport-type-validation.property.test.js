/**
 * Property-based test for Transport Type Validation.
 * Property 1: For any transport object passed to MessageGroupService constructor,
 * if the transport is not WebSocket-based (lacks deliver/initialize methods or
 * is InMemoryTransport), the constructor SHALL throw an error.
 * Validates: Requirements 1.2
 */
// @ts-nocheck


import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {MessageGroupService} from '../../src/message-group/message-group-service.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

/**
 * Create a valid WebSocket-based transport (MessageRouter-like).
 * Must include setServiceNodeResolver to pass isWebSocketBasedTransport check.
 * @return {Object} Valid transport.
 */
function createValidMessageRouter() {
  return {
    async initialize() {},
    async deliver() {
      return {acknowledged: true};
    },
    setServiceNodeResolver() {},
    async shutdown() {},
  };
}

/**
 * Feature: remove-inmemory-transport-from-message-groups
 * Property 1: Transport Type Validation
 * For any transport object passed to MessageGroupService constructor,
 * if the transport is not WebSocket-based, the constructor SHALL throw an error.
 * Validates: Requirements 1.2
 */
test('Property 1: Transport Type Validation - valid transports accepted', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.uuid(),
      fc.uuid(),
      async (groupId, replicaId) => {
        // Only MessageRouter is a valid transport now
        const transport = createValidMessageRouter();

        // Property: Valid WebSocket-based transports should be accepted
        const service = new MessageGroupService({
          groupId,
          replicaId,
          transport,
        });

        t.ok(service, 'Service should be created with valid transport');
        t.equal(service.transport, transport, 'Transport should be set');

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: remove-inmemory-transport-from-message-groups
 * Property 1: Transport Type Validation
 * Transports without WebSocket markers should be rejected.
 * Validates: Requirements 1.2
 */
test('Property 1: Transport Type Validation - invalid transports rejected', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.uuid(),
      fc.uuid(),
      async (groupId, replicaId) => {
        // Create transport without WebSocket markers (like InMemoryTransport)
        const invalidTransport = {
          async initialize() {},
          async deliver() {
            return {acknowledged: true};
          },
          async shutdown() {},
          // Missing setMessageRouter AND setServiceNodeResolver
        };

        // Property: Invalid transports should throw error
        t.throws(
          () => new MessageGroupService({
            groupId,
            replicaId,
            transport: invalidTransport,
          }),
          /requires WebSocket-based transport/,
          'Should reject transport without WebSocket markers',
        );

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: remove-inmemory-transport-from-message-groups
 * Property 1: Transport Type Validation
 * Null or undefined transport should be rejected.
 * Validates: Requirements 1.2
 */
test('Property 1: Transport Type Validation - null/undefined rejected', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.uuid(),
      fc.uuid(),
      fc.constantFrom(null, undefined),
      async (groupId, replicaId, transport) => {
        // Property: Null/undefined transport should throw error
        t.throws(
          () => new MessageGroupService({
            groupId,
            replicaId,
            transport,
          }),
          /requires transport.*WebSocket transport is mandatory/,
          'Should reject null/undefined transport',
        );

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: remove-inmemory-transport-from-message-groups
 * Property 1: Transport Type Validation
 * Transports missing deliver method should be rejected.
 * Validates: Requirements 1.2
 */
test('Property 1: Transport Type Validation - missing deliver rejected', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.uuid(),
      fc.uuid(),
      async (groupId, replicaId) => {
        // Create transport missing deliver method
        const invalidTransport = {
          async initialize() {},
          setMessageRouter() {},
          async shutdown() {},
          // Missing deliver method
        };

        // Property: Transport without deliver should throw error
        t.throws(
          () => new MessageGroupService({
            groupId,
            replicaId,
            transport: invalidTransport,
          }),
          /requires WebSocket-based transport/,
          'Should reject transport without deliver method',
        );

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: remove-inmemory-transport-from-message-groups
 * Property 1: Transport Type Validation
 * Transports missing initialize method should be rejected.
 * Validates: Requirements 1.2
 */
test('Property 1: Transport Type Validation - missing initialize rejected', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.uuid(),
      fc.uuid(),
      async (groupId, replicaId) => {
        // Create transport missing initialize method
        const invalidTransport = {
          async deliver() {
            return {acknowledged: true};
          },
          setMessageRouter() {},
          async shutdown() {},
          // Missing initialize method
        };

        // Property: Transport without initialize should throw error
        t.throws(
          () => new MessageGroupService({
            groupId,
            replicaId,
            transport: invalidTransport,
          }),
          /requires WebSocket-based transport/,
          'Should reject transport without initialize method',
        );

        return true;
      },
    ),
    {numRuns: 10},
  );
});
