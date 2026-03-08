/**
 * Tests for MessageRouterSetup component.
 *
 * Validates that the shared message router setup correctly creates and
 * configures MessageRouter instances for both bootstrap and joining paths.
 */

import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert';
import {MessageRouterSetup} from '../../../src/bootstrap/shared/message-router-setup.js';
import {DependencyError} from '../../../src/bootstrap/bootstrap-errors.js';
import {NodeService} from '../../../src/node/node-service.js';
import {createPortAllocator} from '../../../src/test-helpers/port-allocator.js';

const ports = createPortAllocator(import.meta.url);

describe('MessageRouterSetup', () => {
  let createdRouters = [];

  beforeEach(() => {
    createdRouters = [];
  });

  afterEach(async () => {
    // Clean up any created routers
    for (const router of createdRouters) {
      try {
        await router.shutdown();
      } catch (err) {
        console.warn('router.shutdown failed', err);
      }
    }
    createdRouters = [];
  });

  describe('create()', () => {
    it('should throw DependencyError when nodeId is not provided', async () => {
      await assert.rejects(
        async () => {
          await MessageRouterSetup.create({
            nodeAddress: 'ws://localhost:9999',
            wsPort: 9999,
          });
        },
        (err) => {
          assert.ok(err instanceof DependencyError);
          assert.strictEqual(err.serviceName, 'MessageRouterSetup');
          assert.strictEqual(err.dependencyName, 'nodeId');
          return true;
        },
      );
    });

    it('should create MessageRouter without wsPort (no server)', async () => {
      const router = await MessageRouterSetup.create({
        nodeId: 'test-node-no-port',
        nodeAddress: 'ws://localhost:9999',
      });
      createdRouters.push(router);

      assert.ok(router);
      assert.strictEqual(router.nodeId, 'test-node-no-port');
      assert.strictEqual(router.initialized, true);
      // No self-connection without wsPort - hasSelfConnection returns falsy
      assert.ok(!router.hasSelfConnection());
    });

    it('should create MessageRouter with wsPort and establish self-connection', async () => {
      const port = ports.getPort();
      const router = await MessageRouterSetup.create({
        nodeId: 'test-node-with-port',
        nodeAddress: `ws://localhost:${port}`,
        wsPort: port,
      });
      createdRouters.push(router);

      assert.ok(router);
      assert.strictEqual(router.nodeId, 'test-node-with-port');
      assert.strictEqual(router.initialized, true);
      assert.strictEqual(router.hasSelfConnection(), true);
    });

    it('should configure service node resolver', async () => {
      const router = await MessageRouterSetup.create({
        nodeId: 'resolver-test-node',
        nodeAddress: 'ws://localhost:9999',
      });
      createdRouters.push(router);

      // The resolver should extract nodeId from address pattern "${nodeId}/..."
      assert.ok(router.resolveServiceNode);

      // Test the resolver function
      const resolvedNodeId = router.resolveServiceNode('some-node/message_group/replica-1');
      assert.strictEqual(resolvedNodeId, 'some-node');

      // Test with address that doesn't match pattern
      const noMatch = router.resolveServiceNode('no-slash-address');
      assert.strictEqual(noMatch, null);
    });

    it('should pass identifyPayload to MessageRouter', async () => {
      const identifyPayload = {role: 'joining', version: '1.0'};
      const router = await MessageRouterSetup.create({
        nodeId: 'identify-test-node',
        nodeAddress: 'ws://localhost:9999',
        identifyPayload,
      });
      createdRouters.push(router);

      assert.deepStrictEqual(router.identifyPayload, identifyPayload);
    });

    it('should normalize raw endpoint rows to websocket delivery addresses', async () => {
      const originalGetInstance = NodeService.getInstance;

      try {
        NodeService.getInstance = () => ({
          getReadOnlySystemTableCache() {
            return {
              filter(tableName, predicate) {
                if (tableName !== 'node_endpoints') {
                  return [];
                }
                const row = {
                  node_id: 'target-node',
                  status: 'active',
                  transport_type: 'ws',
                  address: 'target-host:8080',
                  priority: 0,
                };
                return predicate(row) ? [row] : [];
              },
              get() {
                return null;
              },
            };
          },
          getSystemTableCache() {
            return null;
          },
        });

        const router = await MessageRouterSetup.create({
          nodeId: 'resolver-normalization-test-node',
          nodeAddress: 'ws://localhost:9999',
        });
        createdRouters.push(router);

        assert.strictEqual(
          router.resolveNodeAddressForDelivery('target-node'),
          'ws://target-host:8082',
        );
      } finally {
        NodeService.getInstance = originalGetInstance;
      }
    });

    it('should throw error when server initialization fails on port conflict', async () => {
      const port = ports.getPort();

      // Create first router on the port
      const router1 = await MessageRouterSetup.create({
        nodeId: 'first-node',
        nodeAddress: `ws://localhost:${port}`,
        wsPort: port,
      });
      createdRouters.push(router1);

      // Try to create second router on same port - should fail
      await assert.rejects(
        async () => {
          const router2 = await MessageRouterSetup.create({
            nodeId: 'second-node',
            nodeAddress: `ws://localhost:${port}`,
            wsPort: port,
          });
          createdRouters.push(router2);
        },
        (err) => {
          assert.ok(err.message.includes('MessageRouter initialization failed'));
          return true;
        },
      );
    });
  });
});
