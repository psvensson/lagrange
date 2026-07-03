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
import {ConfigurationManager} from '../../../src/config/configuration-manager.js';

// Bind 127.0.0.1 explicitly: in CI containers 'localhost' can resolve to ::1
// for the server bind while cross-router dials go to 127.0.0.1, producing
// ECONNREFUSED from an address-family mismatch.
ConfigurationManager.resetInstance();
ConfigurationManager.getInstance().initialize({
  node: {id: 'message-router-setup-test'},
  transport: {wsHost: '127.0.0.1'},
});

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

    it('tags a port-bind EADDRINUSE conflict retryable (rejoin race)',
      async () => {
        // A rejoiner can race a still-draining prior listener on the same ws
        // port. The bind conflict is transient, so the join retry loop must see
        // it as retryable instead of exiting the node (NODE_EXIT). Bind the port
        // once, then a second create on the SAME port surfaces a real EADDRINUSE.
        const port = ports.getPort();
        const holder = await MessageRouterSetup.create({
          nodeId: 'eaddrinuse-holder',
          nodeAddress: `ws://localhost:${port}`,
          wsPort: port,
        });
        createdRouters.push(holder);

        await assert.rejects(
          async () => {
            const conflicting = await MessageRouterSetup.create({
              nodeId: 'eaddrinuse-rejoiner',
              nodeAddress: `ws://localhost:${port}`,
              wsPort: port,
            });
            createdRouters.push(conflicting);
          },
          (err) => {
            assert.strictEqual(
              err.code,
              'EADDRINUSE',
              'the bind-conflict code must survive the init-failure re-wrap',
            );
            assert.strictEqual(
              err.retryable,
              true,
              'a transient port-bind conflict must be classified retryable',
            );
            return true;
          },
        );
      });

    it('keeps external transport admission closed until explicitly enabled',
      async () => {
        const gatedPort = ports.getPort();
        const peerPort = ports.getPort();
        const gatedRouter = await MessageRouterSetup.create({
          nodeId: 'gated-node',
          nodeAddress: `ws://localhost:${gatedPort}`,
          wsPort: gatedPort,
          externalAdmissionEnabled: false,
        });
        const peerRouter = await MessageRouterSetup.create({
          nodeId: 'peer-node',
          nodeAddress: `ws://localhost:${peerPort}`,
          wsPort: peerPort,
        });
        createdRouters.push(gatedRouter, peerRouter);

        await peerRouter.connectToNode(
          'gated-node',
          `ws://127.0.0.1:${gatedPort}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 50));

        assert.ok(
          !gatedRouter.getConnectedNodes().includes('peer-node'),
          'gated router should reject remote connections until admission opens',
        );
        assert.notStrictEqual(
          peerRouter.getConnectionState('gated-node'),
          'connected',
          'peer connection should not remain established while admission is closed',
        );

        gatedRouter.setExternalAdmissionEnabled(true);
        await peerRouter.connectToNode(
          'gated-node',
          `ws://127.0.0.1:${gatedPort}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 50));

        assert.ok(
          gatedRouter.getConnectedNodes().includes('peer-node'),
          'gated router should accept remote connections after admission opens',
        );
        assert.strictEqual(
          peerRouter.getConnectionState('gated-node'),
          'connected',
          'peer connection should establish once admission is enabled',
        );
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

    it('should preserve a distinct advertised websocket identity address', async () => {
      const router = await MessageRouterSetup.create({
        nodeId: 'advertised-address-node',
        nodeAddress: 'joiner-host:8080',
        advertisedNodeWsAddress: 'ws://172.20.0.42:8082',
      });
      createdRouters.push(router);

      assert.strictEqual(
        router.nodeAddress,
        'joiner-host:8080',
        'router local nodeAddress should remain the configured node address',
      );
      assert.strictEqual(
        router.advertisedAddress,
        'ws://172.20.0.42:8082',
        'router identification should use the canonical advertised websocket address',
      );
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
