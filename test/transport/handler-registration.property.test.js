/**
 * Property test for replica handler registration on the MessageRouter's
 * registration API (register / isRegistered / unregister).
 *
 * For any partition or message-group replica address, registering a handler
 * SHALL create a handler entry that routes messages to it, and unregistering
 * SHALL remove only that entry. (Formerly pinned through the worker-alias
 * methods of the deleted worker consensus path; re-expressed on the real API.)
 *
 * @module test/transport/handler-registration.property.test.js
 */

import {describe, it, beforeEach, afterEach, mock} from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';
import {MessageRouter} from '../../src/transport/message-router.js';
import {ENTITY_TYPE} from '../../src/constants/index.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

describe('Replica handler registration on the MessageRouter API', () => {
  let router;

  beforeEach(() => {
    router = new MessageRouter({
      bootIncarnation: TEST_BOOT_INCARNATION,
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

  it('should create handler entry for each registered worker', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom(ENTITY_TYPE.PARTITION, ENTITY_TYPE.MESSAGE_GROUP),
        fc.uuid(),
        async (nodeId, entityType, replicaId) => {
          const testRouter = new MessageRouter({
            bootIncarnation: TEST_BOOT_INCARNATION,
            nodeId,
            inProcess: true,
          });

          const address = `${nodeId}/${entityType}/${replicaId}`;
          const deliverFn = mock.fn(async () => ({status: 'ok'}));

          testRouter.register(address, deliverFn);

          assert.ok(
            testRouter.isRegistered(address),
            'Handler should be registered for worker address',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('should route messages to registered worker handler', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.record({
          type: fc.string({minLength: 1, maxLength: 20}),
          data: fc.string({minLength: 0, maxLength: 100}),
        }),
        async (nodeId, replicaId, payload) => {
          const testRouter = new MessageRouter({
            bootIncarnation: TEST_BOOT_INCARNATION,
            nodeId,
            inProcess: true,
          });

          const address = `${nodeId}/${ENTITY_TYPE.PARTITION}/${replicaId}`;
          const receivedMessages = [];
          const deliverFn = mock.fn(async (envelope) => {
            receivedMessages.push(envelope);
            return {status: 'ok'};
          });

          testRouter.register(address, deliverFn);

          // Get handler and invoke it
          const handler = testRouter.handlers.get(address);
          await handler({payload});

          assert.strictEqual(receivedMessages.length, 1);
          assert.deepStrictEqual(receivedMessages[0].payload, payload);
        },
      ),
      {numRuns: 10},
    );
  });

  it('should remove handler when worker unregisters', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (nodeId, replicaId) => {
          const testRouter = new MessageRouter({
            bootIncarnation: TEST_BOOT_INCARNATION,
            nodeId,
            inProcess: true,
          });

          const address = `${nodeId}/${ENTITY_TYPE.PARTITION}/${replicaId}`;
          const deliverFn = mock.fn(async () => ({status: 'ok'}));

          testRouter.register(address, deliverFn);
          assert.ok(testRouter.isRegistered(address));

          testRouter.unregister(address);
          assert.strictEqual(testRouter.isRegistered(address), false);
        },
      ),
      {numRuns: 10},
    );
  });

  // Restored from the deleted message-router-ipc test (verification
  // cutover-repairs-review-2, RA6): a never-registered address.
  it('reports a never-registered address as unregistered, and unregistering ' +
    'it is a no-op', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (nodeId, replicaId) => {
          const testRouter = new MessageRouter({
            bootIncarnation: TEST_BOOT_INCARNATION,
            nodeId,
            inProcess: true,
          });
          const address = `${nodeId}/${ENTITY_TYPE.PARTITION}/${replicaId}`;
          const handlerCount = testRouter.handlers.size;

          assert.strictEqual(testRouter.isRegistered(address), false);
          assert.doesNotThrow(() => testRouter.unregister(address));
          assert.strictEqual(testRouter.isRegistered(address), false);
          assert.strictEqual(testRouter.handlers.size, handlerCount);
        },
      ),
      {numRuns: 10},
    );
  });

  it('should support multiple workers with independent handlers', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.array(fc.uuid(), {minLength: 2, maxLength: 5}),
        async (nodeId, replicaIds) => {
          const testRouter = new MessageRouter({
            bootIncarnation: TEST_BOOT_INCARNATION,
            nodeId,
            inProcess: true,
          });

          const handlers = new Map();

          // Register handlers for all replicas
          for (const replicaId of replicaIds) {
            const address = `${nodeId}/${ENTITY_TYPE.PARTITION}/${replicaId}`;
            const deliverFn = mock.fn(async () => ({replicaId}));
            handlers.set(replicaId, deliverFn);
            testRouter.register(address, deliverFn);
          }

          // Verify all handlers are registered
          for (const replicaId of replicaIds) {
            const address = `${nodeId}/${ENTITY_TYPE.PARTITION}/${replicaId}`;
            assert.ok(testRouter.isRegistered(address));
          }

          // Invoke each handler and verify correct one is called
          for (const replicaId of replicaIds) {
            const address = `${nodeId}/${ENTITY_TYPE.PARTITION}/${replicaId}`;
            const handler = testRouter.handlers.get(address);
            const result = await handler({});

            assert.strictEqual(result.replicaId, replicaId);
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('should handle partition and message-group workers independently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (nodeId, partitionReplicaId, msgGroupReplicaId) => {
          const testRouter = new MessageRouter({
            bootIncarnation: TEST_BOOT_INCARNATION,
            nodeId,
            inProcess: true,
          });

          const partitionAddress =
            `${nodeId}/${ENTITY_TYPE.PARTITION}/${partitionReplicaId}`;
          const msgGroupAddress =
            `${nodeId}/${ENTITY_TYPE.MESSAGE_GROUP}/${msgGroupReplicaId}`;

          const partitionDeliverFn = mock.fn(async () => ({type: 'partition'}));
          const msgGroupDeliverFn = mock.fn(async () => ({type: 'message-group'}));

          testRouter.register(partitionAddress, partitionDeliverFn);
          testRouter.register(msgGroupAddress, msgGroupDeliverFn);

          // Verify both are registered
          assert.ok(testRouter.isRegistered(partitionAddress));
          assert.ok(testRouter.isRegistered(msgGroupAddress));

          // Verify correct handlers are invoked
          const partitionHandler = testRouter.handlers.get(partitionAddress);
          const msgGroupHandler = testRouter.handlers.get(msgGroupAddress);

          const partitionResult = await partitionHandler({});
          const msgGroupResult = await msgGroupHandler({});

          assert.strictEqual(partitionResult.type, 'partition');
          assert.strictEqual(msgGroupResult.type, 'message-group');
        },
      ),
      {numRuns: 10},
    );
  });

  it('should preserve handler count accuracy', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.array(fc.uuid(), {minLength: 1, maxLength: 5}),
        async (nodeId, replicaIds) => {
          const testRouter = new MessageRouter({
            bootIncarnation: TEST_BOOT_INCARNATION,
            nodeId,
            inProcess: true,
          });

          const initialCount = testRouter.handlers.size;

          // Register handlers
          for (const replicaId of replicaIds) {
            const address = `${nodeId}/${ENTITY_TYPE.PARTITION}/${replicaId}`;
            testRouter.register(address, async () => ({}));
          }

          assert.strictEqual(
            testRouter.handlers.size,
            initialCount + replicaIds.length,
            'Handler count should increase by number of registered workers',
          );

          // Unregister handlers
          for (const replicaId of replicaIds) {
            const address = `${nodeId}/${ENTITY_TYPE.PARTITION}/${replicaId}`;
            testRouter.unregister(address);
          }

          assert.strictEqual(
            testRouter.handlers.size,
            initialCount,
            'Handler count should return to initial after unregistering',
          );
        },
      ),
      {numRuns: 10},
    );
  });
});
