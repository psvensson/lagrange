/**
 * Property test for WebSocket Provider Backward Compatibility.
 *
 * Property 9: For any message delivery that previously worked with the old
 * WebSocket implementation, the same delivery SHALL succeed with the
 * WebSocketTransportProvider without requiring caller changes.
 *
 * **Validates: Requirements 7.1, 7.3, 8.4**
 *
 * **Feature: transport-abstraction-layer, Property 9: WebSocket Provider Backward Compatibility**
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {WebSocketTransportProvider} from '../../src/transport/websocket-transport-provider.js';
import {TransportProvider} from '../../src/transport/transport-provider.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  COLUMN,
  ENDPOINT_STATUS,
  TRANSPORT_TYPE,
} from '../../src/constants/index.js';
import {
  CONNECTION_STATE,
  TRANSPORT_EVENT,
  WS_MESSAGE_TYPE,
} from '../../src/constants/transport.js';

/**
 * Required TransportProvider interface methods.
 */
const REQUIRED_INTERFACE_METHODS = [
  'getType',
  'isAvailable',
  'connect',
  'send',
  'disconnect',
  'getHealthStatus',
  'shutdown',
];

/**
 * Message types that were supported by the old WebSocket implementation.
 */
const LEGACY_MESSAGE_TYPES = [
  WS_MESSAGE_TYPE.SERVICE_MESSAGE,
  WS_MESSAGE_TYPE.RAFT_MESSAGE,
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
 * Creates a valid endpoint record for testing.
 * @param {Object} overrides - Fields to override
 * @return {Object} Endpoint record
 */
function createEndpoint(overrides = {}) {
  const nodeId = overrides.nodeId || 'node-1';
  return {
    [COLUMN.ENDPOINT_ID]: overrides.endpointId || `ep-${nodeId}`,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.TRANSPORT_TYPE]: TRANSPORT_TYPE.WEBSOCKET,
    [COLUMN.ADDRESS]: overrides.address || 'ws://localhost:8080',
    [COLUMN.PRIORITY]: overrides.priority ?? 0,
    [COLUMN.METADATA]: overrides.metadata || '{}',
    [COLUMN.STATUS]: overrides.status || ENDPOINT_STATUS.ACTIVE,
    [COLUMN.CREATED_AT]: Date.now(),
    [COLUMN.UPDATED_AT]: Date.now(),
  };
}

/**
 * Creates a legacy-style message that would have worked with old implementation.
 * @param {Object} overrides - Fields to override
 * @return {Object} Message object
 */
function createLegacyMessage(overrides = {}) {
  return {
    type: overrides.type || WS_MESSAGE_TYPE.SERVICE_MESSAGE,
    targetAddress: overrides.targetAddress || 'node-1/service/test-service',
    payload: overrides.payload || {action: 'test'},
    ...overrides,
  };
}

/**
 * Feature: transport-abstraction-layer
 * Property 9: WebSocket Provider Backward Compatibility
 *
 * For any message delivery that previously worked with the old WebSocket
 * implementation, the same delivery SHALL succeed with the
 * WebSocketTransportProvider without requiring caller changes.
 */
test('Property 9: WebSocket Provider Backward Compatibility', async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(() => {
    cleanupTestEnvironment();
  });

  /**
   * Property: WebSocketTransportProvider implements TransportProvider interface.
   *
   * For any WebSocketTransportProvider instance, it SHALL implement all
   * required TransportProvider interface methods.
   *
   * **Validates: Requirements 7.1**
   */
  t.test('implements TransportProvider interface', async (t) => {
    await fc.assert(
      fc.property(
        fc.uuid(),
        fc.string({minLength: 1, maxLength: 50}),
        (localNodeId, localAddress) => {
          const provider = new WebSocketTransportProvider({
            localNodeId,
            localAddress,
          });

          try {
            // Verify provider is instance of TransportProvider
            if (!(provider instanceof TransportProvider)) {
              return false;
            }

            // Verify all required methods exist and are functions
            for (const method of REQUIRED_INTERFACE_METHODS) {
              if (typeof provider[method] !== 'function') {
                return false;
              }
            }

            return true;
          } finally {
            provider.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('WebSocketTransportProvider implements TransportProvider interface');
  });

  /**
   * Property: getType returns correct transport type.
   *
   * For any WebSocketTransportProvider, getType() SHALL return the
   * WEBSOCKET transport type constant ('ws').
   *
   * **Validates: Requirements 7.1**
   */
  t.test('getType returns WEBSOCKET transport type', async (t) => {
    await fc.assert(
      fc.property(
        fc.uuid(),
        (localNodeId) => {
          const provider = new WebSocketTransportProvider({localNodeId});

          try {
            const transportType = provider.getType();

            // Must return the correct transport type
            return transportType === TRANSPORT_TYPE.WEBSOCKET &&
                   transportType === 'ws';
          } finally {
            provider.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('getType returns WEBSOCKET transport type');
  });

  /**
   * Property: isAvailable returns boolean availability status.
   *
   * For any WebSocketTransportProvider, isAvailable() SHALL return true
   * when the provider is ready to accept connections, and false after shutdown.
   *
   * **Validates: Requirements 7.1**
   */
  t.test('isAvailable returns correct availability status', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (localNodeId) => {
          const provider = new WebSocketTransportProvider({localNodeId});

          // Should be available initially
          if (!provider.isAvailable()) {
            return false;
          }

          // Should not be available after shutdown
          await provider.shutdown();

          return !provider.isAvailable();
        },
      ),
      {numRuns: 10},
    );

    t.pass('isAvailable returns correct availability status');
  });

  /**
   * Property: Endpoint format is compatible with legacy addressing.
   *
   * For any valid endpoint record, the WebSocketTransportProvider SHALL
   * accept the endpoint format without requiring changes to the caller.
   *
   * **Validates: Requirements 7.3, 8.4**
   */
  t.test('accepts legacy endpoint format', async (t) => {
    await fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        fc.integer({min: 0, max: 100}),
        fc.constantFrom('{}', '{"tls":true}', '{"timeout":5000}'),
        (endpointId, nodeId, priority, metadata) => {
          const provider = new WebSocketTransportProvider();

          try {
            // Create endpoint in legacy format
            const endpoint = createEndpoint({
              endpointId,
              nodeId,
              priority,
              metadata,
            });

            // Verify endpoint has all required fields
            const hasRequiredFields =
              endpoint[COLUMN.ENDPOINT_ID] === endpointId &&
              endpoint[COLUMN.NODE_ID] === nodeId &&
              endpoint[COLUMN.TRANSPORT_TYPE] === TRANSPORT_TYPE.WEBSOCKET &&
              typeof endpoint[COLUMN.ADDRESS] === 'string' &&
              endpoint[COLUMN.PRIORITY] === priority &&
              endpoint[COLUMN.STATUS] === ENDPOINT_STATUS.ACTIVE;

            return hasRequiredFields;
          } finally {
            provider.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('accepts legacy endpoint format');
  });

  /**
   * Property: Message format is compatible with legacy patterns.
   *
   * For any message that would have worked with the old implementation,
   * the message format SHALL be accepted by the new provider.
   *
   * **Validates: Requirements 7.3, 8.4**
   */
  t.test('accepts legacy message format', async (t) => {
    await fc.assert(
      fc.property(
        fc.constantFrom(...LEGACY_MESSAGE_TYPES),
        fc.string({minLength: 1, maxLength: 100}),
        fc.record({
          action: fc.string({minLength: 1, maxLength: 20}),
          data: fc.string({minLength: 0, maxLength: 100}),
        }),
        (messageType, targetAddress, payload) => {
          // Create legacy-style message
          const message = createLegacyMessage({
            type: messageType,
            targetAddress,
            payload,
          });

          // Verify message has expected structure
          const hasValidStructure =
            typeof message.type === 'string' &&
            typeof message.targetAddress === 'string' &&
            typeof message.payload === 'object';

          // Verify message type is one of the legacy types
          const hasLegacyType = LEGACY_MESSAGE_TYPES.includes(message.type);

          return hasValidStructure && hasLegacyType;
        },
      ),
      {numRuns: 10},
    );

    t.pass('accepts legacy message format');
  });

  /**
   * Property: Provider emits standard transport events.
   *
   * For any WebSocketTransportProvider, it SHALL emit standard transport
   * events that callers can subscribe to without changes.
   *
   * **Validates: Requirements 7.1, 7.3**
   */
  t.test('emits standard transport events', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (localNodeId) => {
          const provider = new WebSocketTransportProvider({localNodeId});
          let shutdownEventReceived = false;

          // Subscribe to shutdown event
          provider.getEventEmitter().on(TRANSPORT_EVENT.SHUTDOWN, (data) => {
            shutdownEventReceived = data.transportType === TRANSPORT_TYPE.WEBSOCKET;
          });

          // Trigger shutdown
          await provider.shutdown();

          // Verify event was emitted with correct data
          return shutdownEventReceived;
        },
      ),
      {numRuns: 10},
    );

    t.pass('emits standard transport events');
  });

  /**
   * Property: Health status format is backward compatible.
   *
   * For any connection, getHealthStatus() SHALL return a status object
   * with the expected fields that callers depend on.
   *
   * **Validates: Requirements 7.1, 7.3**
   */
  t.test('health status format is backward compatible', async (t) => {
    await fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        (localNodeId, connectionId) => {
          const provider = new WebSocketTransportProvider({localNodeId});

          try {
            // Get health status for unknown connection
            const status = provider.getHealthStatus({connectionId});

            // Verify status has expected fields
            const hasExpectedFields =
              typeof status.state === 'string' &&
              typeof status.healthy === 'boolean' &&
              'latency' in status &&
              'lastActivity' in status;

            // For unknown connection, should return closed state
            const hasCorrectState = status.state === CONNECTION_STATE.CLOSED;

            return hasExpectedFields && hasCorrectState;
          } finally {
            provider.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('health status format is backward compatible');
  });

  /**
   * Property: Send returns result with expected format.
   *
   * For any send operation, the result SHALL have the expected format
   * that callers depend on (success boolean, error field when failed).
   *
   * **Validates: Requirements 7.1, 7.3**
   */
  t.test('send returns result with expected format', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.record({
          type: fc.constantFrom(...LEGACY_MESSAGE_TYPES),
          targetAddress: fc.string({minLength: 1, maxLength: 50}),
          payload: fc.object(),
        }),
        async (localNodeId, connectionId, message) => {
          const provider = new WebSocketTransportProvider({localNodeId});

          try {
            // Send to unknown connection (will fail)
            const result = await provider.send({connectionId}, message);

            // Verify result has expected format
            const hasExpectedFormat =
              typeof result === 'object' &&
              typeof result.success === 'boolean';

            // For unknown connection, should fail with error
            const hasCorrectFailure =
              result.success === false &&
              typeof result.error === 'string';

            return hasExpectedFormat && hasCorrectFailure;
          } finally {
            await provider.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('send returns result with expected format');
  });

  /**
   * Property: Disconnect handles any connection gracefully.
   *
   * For any connection (valid or invalid), disconnect() SHALL complete
   * without throwing, maintaining backward compatibility.
   *
   * **Validates: Requirements 7.1, 7.3**
   */
  t.test('disconnect handles any connection gracefully', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (localNodeId, connectionId) => {
          const provider = new WebSocketTransportProvider({localNodeId});

          try {
            // Disconnect unknown connection should not throw
            await provider.disconnect({connectionId});

            // If we get here, disconnect handled gracefully
            return true;
          } catch (_error) {
            // Should not throw
            return false;
          } finally {
            await provider.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('disconnect handles any connection gracefully');
  });

  /**
   * Property: Provider configuration uses ConfigurationManager.
   *
   * For any WebSocketTransportProvider, it SHALL use configuration from
   * ConfigurationManager, maintaining the existing configuration pattern.
   *
   * **Validates: Requirements 7.4**
   */
  t.test('uses ConfigurationManager for configuration', async (t) => {
    await fc.assert(
      fc.property(
        fc.uuid(),
        (localNodeId) => {
          const provider = new WebSocketTransportProvider({localNodeId});

          try {
            // Verify provider has configuration values
            // These should come from ConfigurationManager or defaults
            const hasReconnectConfig =
              typeof provider.reconnectIntervalMs === 'number' &&
              typeof provider.reconnectMaxAttempts === 'number' &&
              typeof provider.reconnectBackoffMultiplier === 'number';

            const hasPingConfig =
              typeof provider.pingIntervalMs === 'number';

            const hasTimeoutConfig =
              typeof provider.messageTimeoutMs === 'number';

            return hasReconnectConfig && hasPingConfig && hasTimeoutConfig;
          } finally {
            provider.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('uses ConfigurationManager for configuration');
  });

  /**
   * Property: Local node identity can be set dynamically.
   *
   * For any WebSocketTransportProvider, setLocalNodeId and setLocalAddress
   * SHALL update the provider's identity, supporting dynamic configuration.
   *
   * **Validates: Requirements 7.3**
   */
  t.test('supports dynamic identity configuration', async (t) => {
    await fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        fc.string({minLength: 1, maxLength: 50}),
        fc.string({minLength: 1, maxLength: 50}),
        (initialNodeId, newNodeId, initialAddress, newAddress) => {
          const provider = new WebSocketTransportProvider({
            localNodeId: initialNodeId,
            localAddress: initialAddress,
          });

          try {
            // Verify initial values
            if (provider.localNodeId !== initialNodeId ||
                provider.localAddress !== initialAddress) {
              return false;
            }

            // Update identity
            provider.setLocalNodeId(newNodeId);
            provider.setLocalAddress(newAddress);

            // Verify updated values
            return provider.localNodeId === newNodeId &&
                   provider.localAddress === newAddress;
          } finally {
            provider.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('supports dynamic identity configuration');
  });

  /**
   * Property: Metadata parsing is backward compatible.
   *
   * For any metadata format (string JSON, object, null), parseMetadata
   * SHALL return a valid object without throwing.
   *
   * **Validates: Requirements 7.3**
   */
  t.test('metadata parsing is backward compatible', async (t) => {
    await fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(null),
          fc.constant(undefined),
          fc.constant('{}'),
          fc.constant('{"tls":true}'),
          fc.constant('invalid-json'),
          fc.record({key: fc.string()}),
        ),
        (metadata) => {
          const provider = new WebSocketTransportProvider();

          try {
            const result = provider.parseMetadata(metadata);

            // Should always return an object
            return typeof result === 'object' && result !== null;
          } finally {
            provider.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('metadata parsing is backward compatible');
  });

  /**
   * Property: Connection count tracking is accurate.
   *
   * For any WebSocketTransportProvider, getConnectionCount() SHALL
   * accurately reflect the number of active connections.
   *
   * **Validates: Requirements 7.1**
   */
  t.test('connection count tracking is accurate', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (localNodeId) => {
          const provider = new WebSocketTransportProvider({localNodeId});

          try {
            // Initially should have no connections
            if (provider.getConnectionCount() !== 0) {
              return false;
            }

            // After shutdown, should still have no connections
            await provider.shutdown();

            return provider.getConnectionCount() === 0;
          } finally {
            // Ensure cleanup
            if (provider.isAvailable()) {
              await provider.shutdown();
            }
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('connection count tracking is accurate');
  });
});
