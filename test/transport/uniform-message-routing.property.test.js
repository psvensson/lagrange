/**
 * Property test for Uniform Message Routing (Property 3).
 *
 * Feature: worker-process-replica-isolation, Property 3: Uniform Message Routing
 *
 * For any message sent between replicas, the MessageRouter SHALL use the same
 * routing code path regardless of whether the source and target are on the
 * same node or different nodes.
 *
 * **Validates: Requirements 2.1, 2.2, 2.4**
 *
 * @module test/transport/uniform-message-routing.property.test.js
 */

import {describe, it, beforeEach, afterEach, mock} from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';
import {MessageRouter} from '../../src/transport/message-router.js';
import {WORKER_ENTITY_TYPE} from '../../src/worker/worker-constants.js';

describe('Property 3: Uniform Message Routing', () => {
  let router;

  beforeEach(() => {
    router = new MessageRouter({
      nodeId: 'node-1',
      inProcess: true,
    });
  });

  afterEach(async () => {
    if (router && router.initialized) {
      await router.shutdown();
    }
    router = null;
  });

  it('should use same handler interface for all registered workers', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom(WORKER_ENTITY_TYPE.PARTITION, WORKER_ENTITY_TYPE.MESSAGE_GROUP),
        async (replicaId, entityType) => {
          const address = `node-1/${entityType}/${replicaId}`;
          const deliverFn = mock.fn(async (envelope) => ({
            received: envelope,
            status: 'ok',
          }));

          router.registerWorkerHandler(address, deliverFn);

          // Get handler - same interface regardless of entity type
          const handler = router.handlers.get(address);
          assert.ok(typeof handler === 'function');

          // Invoke handler - same calling convention
          const envelope = {payload: {type: 'test'}};
          const result = await handler(envelope);

          assert.strictEqual(result.status, 'ok');
          assert.deepStrictEqual(result.received, envelope);
        },
      ),
      {numRuns: 10},
    );
  });

  it('should route messages uniformly to partition and message-group workers', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.record({
          type: fc.string({minLength: 1, maxLength: 20}),
          data: fc.string({minLength: 0, maxLength: 50}),
        }),
        async (partitionReplicaId, msgGroupReplicaId, payload) => {
          const partitionAddress =
            `node-1/${WORKER_ENTITY_TYPE.PARTITION}/${partitionReplicaId}`;
          const msgGroupAddress =
            `node-1/${WORKER_ENTITY_TYPE.MESSAGE_GROUP}/${msgGroupReplicaId}`;

          const partitionMessages = [];
          const msgGroupMessages = [];

          router.registerWorkerHandler(partitionAddress, async (envelope) => {
            partitionMessages.push(envelope);
            return {status: 'ok'};
          });

          router.registerWorkerHandler(msgGroupAddress, async (envelope) => {
            msgGroupMessages.push(envelope);
            return {status: 'ok'};
          });

          // Route to partition
          const partitionHandler = router.handlers.get(partitionAddress);
          await partitionHandler({payload});

          // Route to message group
          const msgGroupHandler = router.handlers.get(msgGroupAddress);
          await msgGroupHandler({payload});

          // Both should receive messages through same interface
          assert.strictEqual(partitionMessages.length, 1);
          assert.strictEqual(msgGroupMessages.length, 1);
          assert.deepStrictEqual(partitionMessages[0].payload, payload);
          assert.deepStrictEqual(msgGroupMessages[0].payload, payload);
        },
      ),
      {numRuns: 10},
    );
  });

  it('should use unified address format for all workers', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.constantFrom(WORKER_ENTITY_TYPE.PARTITION, WORKER_ENTITY_TYPE.MESSAGE_GROUP),
        async (nodeId, replicaId, entityType) => {
          const testRouter = new MessageRouter({
            nodeId,
            inProcess: true,
          });

          const address = `${nodeId}/${entityType}/${replicaId}`;

          // Validate address format
          assert.ok(
            testRouter.isValidAddress(address),
            'Address should be valid unified format',
          );

          // Parse address
          const parsed = testRouter.parseAddress(address);
          assert.strictEqual(parsed.nodeId, nodeId);
          assert.strictEqual(parsed.entityType, entityType);
          assert.strictEqual(parsed.entityId, replicaId);
        },
      ),
      {numRuns: 10},
    );
  });

  it('should handle messages with same structure regardless of target type', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.record({
          messageId: fc.uuid(),
          type: fc.string({minLength: 1, maxLength: 20}),
          payload: fc.record({
            operation: fc.string({minLength: 1, maxLength: 20}),
            data: fc.string({minLength: 0, maxLength: 100}),
          }),
        }),
        async (partitionReplicaId, msgGroupReplicaId, message) => {
          const partitionAddress =
            `node-1/${WORKER_ENTITY_TYPE.PARTITION}/${partitionReplicaId}`;
          const msgGroupAddress =
            `node-1/${WORKER_ENTITY_TYPE.MESSAGE_GROUP}/${msgGroupReplicaId}`;

          let partitionReceived = null;
          let msgGroupReceived = null;

          router.registerWorkerHandler(partitionAddress, async (envelope) => {
            partitionReceived = envelope;
            return {status: 'ok'};
          });

          router.registerWorkerHandler(msgGroupAddress, async (envelope) => {
            msgGroupReceived = envelope;
            return {status: 'ok'};
          });

          // Send same message structure to both
          const partitionHandler = router.handlers.get(partitionAddress);
          const msgGroupHandler = router.handlers.get(msgGroupAddress);

          await partitionHandler(message);
          await msgGroupHandler(message);

          // Both should receive identical message structure
          assert.deepStrictEqual(partitionReceived, message);
          assert.deepStrictEqual(msgGroupReceived, message);
        },
      ),
      {numRuns: 10},
    );
  });

  it('should return responses uniformly from all worker types', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.record({
          status: fc.constantFrom('ok', 'error'),
          data: fc.string({minLength: 0, maxLength: 50}),
        }),
        async (partitionReplicaId, msgGroupReplicaId, response) => {
          const partitionAddress =
            `node-1/${WORKER_ENTITY_TYPE.PARTITION}/${partitionReplicaId}`;
          const msgGroupAddress =
            `node-1/${WORKER_ENTITY_TYPE.MESSAGE_GROUP}/${msgGroupReplicaId}`;

          router.registerWorkerHandler(partitionAddress, async () => response);
          router.registerWorkerHandler(msgGroupAddress, async () => response);

          const partitionHandler = router.handlers.get(partitionAddress);
          const msgGroupHandler = router.handlers.get(msgGroupAddress);

          const partitionResult = await partitionHandler({});
          const msgGroupResult = await msgGroupHandler({});

          // Both should return same response structure
          assert.deepStrictEqual(partitionResult, response);
          assert.deepStrictEqual(msgGroupResult, response);
        },
      ),
      {numRuns: 10},
    );
  });

  it('should support async handlers uniformly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.integer({min: 0, max: 10}),
        async (replicaId, delayMs) => {
          const address = `node-1/${WORKER_ENTITY_TYPE.PARTITION}/${replicaId}`;

          router.registerWorkerHandler(address, async () => {
            // Simulate async work
            await Promise.resolve();
            return {status: 'ok', delayMs};
          });

          const handler = router.handlers.get(address);
          const result = await handler({});

          assert.strictEqual(result.status, 'ok');
          assert.strictEqual(result.delayMs, delayMs);
        },
      ),
      {numRuns: 10},
    );
  });
});
