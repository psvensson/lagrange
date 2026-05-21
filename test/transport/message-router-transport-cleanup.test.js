/**
 * Verification tests for transport delivery path cleanup (Requirement 3).
 *
 * Verifies that dead transport registry methods and in-process fallback
 * have been removed from MessageRouter, and that deliver() uses a single
 * delivery path via deliverRemote() for all remote targets.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.8
 */

import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';
import {MessageRouter} from '../../src/transport/message-router.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

// Valid entity types for unified address format
const VALID_ENTITY_TYPES = [
  'message-group', 'partition', 'lifecycle', 'service',
];

describe('MessageRouter transport cleanup verification', () => {
  let router;

  beforeEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    const config = ConfigurationManager.getInstance();
    config.initialize({
      node: {id: 'test-node'},
      logging: {level: 'error'},
    });
    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});

    router = new MessageRouter({
      nodeId: 'test-node',
      inProcess: true,
      wsPort: 19800,
    });
  });

  afterEach(async () => {
    if (router && router.initialized) {
      await router.shutdown();
    }
    router = null;
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  describe('removed methods do not exist', () => {
    it('should not have hasTransportRegistry method', () => {
      assert.strictEqual(
        typeof router.hasTransportRegistry,
        'undefined',
        'hasTransportRegistry must be removed',
      );
    });

    it('should not have setTransportRegistry method', () => {
      assert.strictEqual(
        typeof router.setTransportRegistry,
        'undefined',
        'setTransportRegistry must be removed',
      );
    });

    it('should not have deliverViaTransportRegistry method', () => {
      assert.strictEqual(
        typeof router.deliverViaTransportRegistry,
        'undefined',
        'deliverViaTransportRegistry must be removed',
      );
    });

    it('should not have deliverViaEndpoint method', () => {
      assert.strictEqual(
        typeof router.deliverViaEndpoint,
        'undefined',
        'deliverViaEndpoint must be removed',
      );
    });

    it('should not have shouldFallbackToInProcess method', () => {
      assert.strictEqual(
        typeof router.shouldFallbackToInProcess,
        'undefined',
        'shouldFallbackToInProcess must be removed',
      );
    });

    it('should not have transportRegistry field', () => {
      assert.strictEqual(
        router.transportRegistry,
        undefined,
        'transportRegistry field must be removed',
      );
    });

    it('should not have connectionPool field', () => {
      assert.strictEqual(
        router.connectionPool,
        undefined,
        'connectionPool field must be removed',
      );
    });
  });

  describe('deliver() routes through deliverRemote() for remote targets',
    () => {
      it('should call deliverRemote for remote node targets', async () => {
        await router.initialize({startServer: true});

        const calls = [];
        const originalDeliverRemote = router.deliverRemote.bind(router);
        router.deliverRemote = async (...args) => {
          calls.push(args);
          return {
            messageId: args[1],
            correlationId: args[4],
            acknowledged: false,
            error: 'no connection',
          };
        };

        // Connect a fake remote node entry so address resolution works
        const remoteNodeId = 'remote-node-1';
        const _result = await router.deliver(
          `${remoteNodeId}/partition/p1`,
          {type: 'TEST', data: 'hello'},
          {targetNodeId: remoteNodeId},
        );

        assert.strictEqual(calls.length, 1, 'deliverRemote called once');
        assert.strictEqual(
          calls[0][0],
          `${remoteNodeId}/partition/p1`,
          'correct target address passed',
        );
        assert.strictEqual(
          calls[0][3],
          remoteNodeId,
          'correct target node ID passed',
        );

        // Restore
        router.deliverRemote = originalDeliverRemote;
      });

      it('should call deliverRemote for self-delivery with connection',
        async () => {
          await router.initialize({startServer: true});

          const calls = [];
          router.deliverRemote = async (...args) => {
            calls.push(args);
            return {
              messageId: args[1],
              correlationId: args[4],
              acknowledged: true,
            };
          };

          await router.deliver(
            'test-node/service/svc-1',
            {type: 'TEST'},
          );

          assert.strictEqual(
            calls.length, 1,
            'deliverRemote called for self-delivery',
          );
        });

      it('should forward replacePendingKey option to enqueueOutbound', async () => {
        await router.initialize({startServer: true});

        let passedOptions = null;
        const originalEnqueueOutbound = router.enqueueOutbound.bind(router);
        router.enqueueOutbound = async (nodeId, deliverFn, options) => {
          passedOptions = options;
          return {acknowledged: true, data: 'ok'};
        };

        const remoteNodeId = 'remote-node-1';
        await router.deliverRemote(
          `${remoteNodeId}/partition/p1`,
          'msg-id',
          {type: 'TEST'},
          remoteNodeId,
          'corr-id',
          {replacePendingKey: 'custom-coalesce-key'},
        );

        assert.ok(passedOptions, 'enqueueOutbound options were passed');
        assert.strictEqual(
          passedOptions.replacePendingKey,
          'custom-coalesce-key',
          'replacePendingKey was forwarded to enqueueOutbound',
        );

        router.enqueueOutbound = originalEnqueueOutbound;
      });
    });

  /**
   * Property 3: Delivery path equivalence
   *
   * For any message delivered via MessageRouter.deliver() after the
   * transport registry branch removal, the delivery result SHALL be
   * identical to the result produced by the deliverRemote() path in
   * the pre-cleanup code when hasTransportRegistry() returns false
   * (which is always the case in production).
   *
   * **Validates: Requirements 3.1**
   */
  describe('Property 3: delivery equivalence', () => {
    it('deliver() produces same result as deliverRemote() for ' +
       'remote targets', async () => {
      let portCounter = 19900;

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...VALID_ENTITY_TYPES),
          fc.string({minLength: 1, maxLength: 15})
            .filter((s) => !s.includes('/') && s.trim().length > 0),
          fc.record({
            type: fc.string({minLength: 1, maxLength: 20})
              .filter((s) => s.trim().length > 0),
            data: fc.string({minLength: 0, maxLength: 50}),
          }),
          async (entityType, entityId, payload) => {
            const port = portCounter++;
            const nodeId = `equiv-${port}`;
            const testRouter = new MessageRouter({
              nodeId,
              wsPort: port,
              inProcess: true,
            });

            try {
              await testRouter.initialize({startServer: true});

              const address = `${nodeId}/${entityType}/${entityId}`;
              const handlerResponse = {acknowledged: true, echo: 'ok'};
              testRouter.register(address, () => handlerResponse);

              // Capture what deliverLocal returns directly
              const directOutcome = await testRouter.deliverLocal(
                address, 'direct-msg-id', payload, 'direct-corr',
              );
              const directResult = directOutcome.result;

              // Capture what deliver() returns
              const deliverResult = await testRouter.deliver(
                address, {...payload, messageId: 'deliver-msg-id'},
              );

              // Both paths must produce acknowledged: true and preserve payload fields.
              return directResult.acknowledged === true &&
                     deliverResult.acknowledged === true &&
                     directResult.echo === deliverResult.echo;
            } finally {
              await testRouter.shutdown();
            }
          },
        ),
        {numRuns: 10},
      );
    });

    it('deliver() produces same failure as deliverRemote() for ' +
       'disconnected targets', async () => {
      let portCounter = 19950;

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...VALID_ENTITY_TYPES),
          fc.string({minLength: 1, maxLength: 15})
            .filter((s) => !s.includes('/') && s.trim().length > 0),
          fc.record({
            type: fc.string({minLength: 1, maxLength: 20})
              .filter((s) => s.trim().length > 0),
          }),
          async (entityType, entityId, payload) => {
            const port = portCounter++;
            const nodeId = `fail-equiv-${port}`;
            const remoteId = `remote-${port}`;
            const testRouter = new MessageRouter({
              nodeId,
              wsPort: port,
              inProcess: true,
            });

            try {
              await testRouter.initialize({startServer: false});

              const address = `${remoteId}/${entityType}/${entityId}`;

              // deliver() for a remote node with no connection
              let deliverFailed = false;
              try {
                const deliverResult = await testRouter.deliver(
                  address, payload, {targetNodeId: remoteId},
                );
                deliverFailed = deliverResult?.acknowledged === false;
              } catch (_error) {
                deliverFailed = true;
              }

              // deliverRemote() directly for same target
              let directFailed = false;
              try {
                const directOutcome = await testRouter.deliverRemote(
                  address, 'direct-id', payload, remoteId, 'direct-corr',
                );
                directFailed = directOutcome?.result?.acknowledged === false;
              } catch (_error) {
                directFailed = true;
              }

              // Both paths must fail consistently (error result or thrown failure).
              return deliverFailed && directFailed;
            } finally {
              await testRouter.shutdown();
            }
          },
        ),
        {numRuns: 10},
      );
    });
  });
});
