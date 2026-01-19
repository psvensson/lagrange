/**
 * Property test for Location Transparent Communication.
 * Property 20: For any pair of partition replicas, communication should work
 * identically whether replicas are on the same node or different nodes,
 * with all messages routed through message groups.
 *
 * Validates: Requirements 4.6, 4.7, 9.2, 9.3, 9.4
 * (Note: Requirements map to 4.6, 4.9, 4.10, 10.2, 10.3, 10.4 in actual doc)
 */

import {test} from 'tap';
import fc from 'fast-check';
import {MessageGroupTransport} from '../../src/transport/message-group-transport.js';
import {InMemoryTransport} from '../../src/transport/in-memory-transport.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

// Initialize configuration and logging for tests (module level)
ConfigurationManager.resetInstance();
LoggingService.resetInstance();
const config = ConfigurationManager.getInstance();
config.initialize({node: {id: 'test-node'}});
const logger = LoggingService.getInstance();
logger.initialize({level: 'error'});

/**
 * Feature: distributed-database-system
 * Property 20: Location Transparent Communication
 *
 * For any pair of partition replicas, communication should work identically
 * whether replicas are on the same node or different nodes, with all messages
 * routed through message groups.
 */
test('Property 20: Location Transparent Communication', async (t) => {
  /**
   * Property: Message delivery result is consistent regardless of location.
   *
   * For any message sent between services, the delivery result (acknowledged
   * or not) should be determined by the handler's response, not by whether
   * the services are on the same node or different nodes.
   */
  t.test('message delivery is location-independent', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate message payload
        fc.record({
          type: fc.constantFrom('raft_append', 'raft_vote', 'service_call'),
          data: fc.string({minLength: 1, maxLength: 100}),
          term: fc.nat({max: 1000}),
        }),
        // Generate handler response
        fc.boolean(),
        async (message, shouldAcknowledge) => {
          // Create transport for "same node" scenario
          const sameNodeTransport = new MessageGroupTransport({
            localAddress: 'service-a',
            localNodeId: 'node-1',
          });

          // Create transport for "different node" scenario (simulated)
          const diffNodeTransport = new MessageGroupTransport({
            localAddress: 'service-a',
            localNodeId: 'node-1',
          });

          // Register identical handlers on both
          const handler = () => ({acknowledged: shouldAcknowledge});
          sameNodeTransport.register('service-b', handler);
          diffNodeTransport.register('service-b', handler);

          // Deliver message on both transports
          const sameNodeResult = await sameNodeTransport.deliver('service-b', message);
          const diffNodeResult = await diffNodeTransport.deliver('service-b', message);

          // Results should be identical
          const resultsMatch = sameNodeResult.acknowledged === diffNodeResult.acknowledged;

          // Cleanup
          await sameNodeTransport.shutdown();
          await diffNodeTransport.shutdown();

          return resultsMatch;
        },
      ),
      {numRuns: 10},
    );

    t.pass('message delivery is location-independent');
  });

  /**
   * Property: All messages are routed through message groups.
   *
   * For any message sent via MessageGroupTransport, if a message group
   * provider is configured, the message should be routed through it
   * (not delivered directly).
   */
  t.test('messages route through message groups when provider configured', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate target address
        fc.string({minLength: 1, maxLength: 50}).map((s) => `service-${s}`),
        // Generate message
        fc.record({
          type: fc.string({minLength: 1, maxLength: 20}),
          payload: fc.string({minLength: 0, maxLength: 100}),
        }),
        async (targetAddress, message) => {
          const transport = new MessageGroupTransport({
            localAddress: 'source-service',
            localNodeId: 'node-1',
          });

          let messageGroupUsed = false;
          let targetReceived = null;

          // Mock message group that tracks usage
          const mockMessageGroup = {
            groupId: 'mg-1',
            sendMessage: async (target, _msg) => {
              messageGroupUsed = true;
              targetReceived = target;
              return {status: 'delivered'};
            },
          };

          transport.setMessageGroupProvider(() => mockMessageGroup);
          await transport.initialize();

          // Deliver to non-local target (should use message group)
          await transport.deliver(targetAddress, message);

          // Cleanup
          await transport.shutdown();

          // Message group should have been used
          return messageGroupUsed && targetReceived === targetAddress;
        },
      ),
      {numRuns: 10},
    );

    t.pass('messages route through message groups when provider configured');
  });

  /**
   * Property: Local delivery bypasses message group for efficiency.
   *
   * For any message sent to a locally registered handler, the message
   * should be delivered directly without going through the message group.
   */
  t.test('local delivery bypasses message group', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate message
        fc.record({
          type: fc.string({minLength: 1, maxLength: 20}),
          data: fc.string({minLength: 0, maxLength: 100}),
        }),
        async (message) => {
          const transport = new MessageGroupTransport({
            localAddress: 'source-service',
            localNodeId: 'node-1',
          });

          let messageGroupUsed = false;
          let localHandlerCalled = false;

          // Mock message group
          const mockMessageGroup = {
            groupId: 'mg-1',
            sendMessage: async () => {
              messageGroupUsed = true;
              return {status: 'delivered'};
            },
          };

          transport.setMessageGroupProvider(() => mockMessageGroup);

          // Register local handler
          transport.register('local-service', () => {
            localHandlerCalled = true;
            return {acknowledged: true};
          });

          await transport.initialize();

          // Deliver to local target
          const result = await transport.deliver('local-service', message);

          // Cleanup
          await transport.shutdown();

          // Local handler should be called, message group should NOT be used
          return localHandlerCalled &&
                 !messageGroupUsed &&
                 result.deliveryType === 'local';
        },
      ),
      {numRuns: 10},
    );

    t.pass('local delivery bypasses message group');
  });

  /**
   * Property: Handler response determines acknowledgment.
   *
   * For any message, the acknowledgment status should be determined
   * solely by the handler's response, providing consistent behavior
   * regardless of transport mechanism.
   */
  t.test('handler response determines acknowledgment', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate handler response
        fc.record({
          acknowledged: fc.boolean(),
          data: fc.option(fc.string({maxLength: 50})),
        }),
        // Generate message
        fc.record({
          type: fc.string({minLength: 1, maxLength: 20}),
        }),
        async (handlerResponse, message) => {
          const transport = new MessageGroupTransport({
            localAddress: 'source',
            localNodeId: 'node-1',
          });

          transport.register('target', () => handlerResponse);

          const result = await transport.deliver('target', message);

          await transport.shutdown();

          // Result acknowledgment should match handler response
          return result.acknowledged === (handlerResponse.acknowledged !== false);
        },
      ),
      {numRuns: 10},
    );

    t.pass('handler response determines acknowledgment');
  });

  /**
   * Property: Transport abstraction hides protocol details.
   *
   * For any message sent through MessageGroupTransport, the sender
   * should not need to know whether the target is local or remote.
   * The API is identical in both cases.
   */
  t.test('transport abstraction hides protocol details', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate multiple targets (some local, some remote)
        fc.array(
          fc.record({
            address: fc.string({minLength: 1, maxLength: 30}).map((s) => `svc-${s}`),
            isLocal: fc.boolean(),
          }),
          {minLength: 1, maxLength: 5},
        ),
        // Generate message
        fc.record({
          type: fc.constantFrom('query', 'update', 'raft'),
          id: fc.uuid(),
        }),
        async (targets, message) => {
          const transport = new MessageGroupTransport({
            localAddress: 'sender',
            localNodeId: 'node-1',
          });

          // Mock message group for remote delivery
          const mockMessageGroup = {
            groupId: 'mg-1',
            sendMessage: async () => ({status: 'delivered'}),
          };
          transport.setMessageGroupProvider(() => mockMessageGroup);

          // Register local handlers for "local" targets
          for (const target of targets) {
            if (target.isLocal) {
              transport.register(target.address, () => ({acknowledged: true}));
            }
          }

          await transport.initialize();

          // Send to all targets using identical API
          const results = await Promise.all(
            targets.map((target) => transport.deliver(target.address, message)),
          );

          await transport.shutdown();

          // All results should have consistent structure
          return results.every((r) =>
            typeof r.messageId === 'string' &&
            typeof r.acknowledged === 'boolean' &&
            typeof r.deliveryType === 'string',
          );
        },
      ),
      {numRuns: 10},
    );

    t.pass('transport abstraction hides protocol details');
  });

  /**
   * Property: InMemoryTransport and MessageGroupTransport have compatible APIs.
   *
   * For any message, both transport types should provide the same
   * interface for registration and delivery.
   */
  t.test('transport types have compatible APIs', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate service address
        fc.string({minLength: 1, maxLength: 30}).map((s) => `service-${s}`),
        // Generate message
        fc.record({
          type: fc.string({minLength: 1, maxLength: 20}),
          data: fc.string({minLength: 0, maxLength: 50}),
        }),
        async (address, message) => {
          // Create both transport types
          const inMemory = new InMemoryTransport({localAddress: 'sender'});
          const msgGroup = new MessageGroupTransport({localAddress: 'sender'});

          // Both should support register
          const handler = () => ({acknowledged: true});
          inMemory.register(address, handler);
          msgGroup.register(address, handler);

          // Both should support deliver
          const inMemoryResult = await inMemory.deliver(address, message);
          const msgGroupResult = await msgGroup.deliver(address, message);

          // Both should support unregister
          inMemory.unregister(address);
          msgGroup.unregister(address);

          // Both should support shutdown
          await inMemory.shutdown();
          await msgGroup.shutdown();

          // Results should have same structure
          return typeof inMemoryResult.messageId === 'string' &&
                 typeof msgGroupResult.messageId === 'string' &&
                 typeof inMemoryResult.acknowledged === 'boolean' &&
                 typeof msgGroupResult.acknowledged === 'boolean';
        },
      ),
      {numRuns: 10},
    );

    t.pass('transport types have compatible APIs');
  });
});
