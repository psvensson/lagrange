/**
 * Property test for Loopback Connection Maintenance (Property 4).
 *
 * Feature: worker-process-replica-isolation, Property 4: Loopback Connection Maintenance
 *
 * For any worker process registered with the main process, there SHALL exist
 * a corresponding loopback connection in the MessageRouter's connection registry.
 *
 * **Validates: Requirements 2.5**
 *
 * @module test/transport/loopback-connection.property.test.js
 */

import {describe, it, beforeEach, afterEach, mock} from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';
import {MessageRouter} from '../../src/transport/message-router.js';
import {WORKER_ENTITY_TYPE} from '../../src/worker/worker-constants.js';

describe('Property 4: Loopback Connection Maintenance', () => {
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

  it('should maintain handler for local worker addresses', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (replicaId) => {
          const address = `node-1/${WORKER_ENTITY_TYPE.PARTITION}/${replicaId}`;
          const deliverFn = mock.fn(async () => ({status: 'ok'}));

          router.registerWorkerHandler(address, deliverFn);

          // Verify handler exists (loopback routing)
          assert.ok(
            router.handlers.has(address),
            'Handler should exist for local worker',
          );

          // Verify handler is callable
          const handler = router.handlers.get(address);
          const result = await handler({payload: 'test'});
          assert.strictEqual(result.status, 'ok');
        },
      ),
      {numRuns: 10},
    );
  });

  it('should route local messages through registered handlers', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.record({
          type: fc.string({minLength: 1, maxLength: 20}),
          data: fc.string({minLength: 0, maxLength: 50}),
        }),
        async (replicaId, payload) => {
          const address = `node-1/${WORKER_ENTITY_TYPE.PARTITION}/${replicaId}`;
          const receivedPayloads = [];
          const deliverFn = mock.fn(async (envelope) => {
            receivedPayloads.push(envelope.payload);
            return {status: 'ok'};
          });

          router.registerWorkerHandler(address, deliverFn);

          // Invoke handler directly (simulating local routing)
          const handler = router.handlers.get(address);
          await handler({payload});

          assert.strictEqual(receivedPayloads.length, 1);
          assert.deepStrictEqual(receivedPayloads[0], payload);
        },
      ),
      {numRuns: 10},
    );
  });

  it('should maintain separate handlers for multiple local workers', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.uuid(), {minLength: 2, maxLength: 5}),
        async (replicaIds) => {
          const handlers = new Map();

          // Register handlers for all local workers
          for (const replicaId of replicaIds) {
            const address = `node-1/${WORKER_ENTITY_TYPE.PARTITION}/${replicaId}`;
            const deliverFn = mock.fn(async () => ({replicaId}));
            handlers.set(replicaId, deliverFn);
            router.registerWorkerHandler(address, deliverFn);
          }

          // Verify all handlers exist
          for (const replicaId of replicaIds) {
            const address = `node-1/${WORKER_ENTITY_TYPE.PARTITION}/${replicaId}`;
            assert.ok(router.handlers.has(address));
          }

          // Verify each handler routes to correct worker
          for (const replicaId of replicaIds) {
            const address = `node-1/${WORKER_ENTITY_TYPE.PARTITION}/${replicaId}`;
            const handler = router.handlers.get(address);
            const result = await handler({});
            assert.strictEqual(result.replicaId, replicaId);
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('should remove handler when worker unregisters', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (replicaId) => {
          const address = `node-1/${WORKER_ENTITY_TYPE.PARTITION}/${replicaId}`;
          const deliverFn = mock.fn(async () => ({status: 'ok'}));

          router.registerWorkerHandler(address, deliverFn);
          assert.ok(router.handlers.has(address));

          router.unregisterWorkerHandler(address);
          assert.strictEqual(router.handlers.has(address), false);
        },
      ),
      {numRuns: 10},
    );
  });

  it('should support both partition and message-group workers on same node', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (partitionReplicaId, msgGroupReplicaId) => {
          const partitionAddress =
            `node-1/${WORKER_ENTITY_TYPE.PARTITION}/${partitionReplicaId}`;
          const msgGroupAddress =
            `node-1/${WORKER_ENTITY_TYPE.MESSAGE_GROUP}/${msgGroupReplicaId}`;

          const partitionDeliverFn = mock.fn(async () => ({type: 'partition'}));
          const msgGroupDeliverFn = mock.fn(async () => ({type: 'message-group'}));

          router.registerWorkerHandler(partitionAddress, partitionDeliverFn);
          router.registerWorkerHandler(msgGroupAddress, msgGroupDeliverFn);

          // Both should have handlers
          assert.ok(router.handlers.has(partitionAddress));
          assert.ok(router.handlers.has(msgGroupAddress));

          // Both should route correctly
          const partitionHandler = router.handlers.get(partitionAddress);
          const msgGroupHandler = router.handlers.get(msgGroupAddress);

          const partitionResult = await partitionHandler({});
          const msgGroupResult = await msgGroupHandler({});

          assert.strictEqual(partitionResult.type, 'partition');
          assert.strictEqual(msgGroupResult.type, 'message-group');
        },
      ),
      {numRuns: 10},
    );
  });

  it('should handle handler replacement for same address', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (replicaId) => {
          const address = `node-1/${WORKER_ENTITY_TYPE.PARTITION}/${replicaId}`;

          const deliverFn1 = mock.fn(async () => ({version: 1}));
          const deliverFn2 = mock.fn(async () => ({version: 2}));

          // Register first handler
          router.registerWorkerHandler(address, deliverFn1);
          let handler = router.handlers.get(address);
          let result = await handler({});
          assert.strictEqual(result.version, 1);

          // Replace with second handler
          router.registerWorkerHandler(address, deliverFn2);
          handler = router.handlers.get(address);
          result = await handler({});
          assert.strictEqual(result.version, 2);

          // Only one handler should exist
          assert.strictEqual(
            [...router.handlers.keys()].filter((k) => k === address).length,
            1,
          );
        },
      ),
      {numRuns: 10},
    );
  });
});
