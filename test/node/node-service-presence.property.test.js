/**
 * Property Test: Node Service Presence
 * **Property 2: Node Service Presence**
 * **Validates: Requirements 1.3**
 *
 * *For any* node in the system, it should always have exactly one Node Service running.
 *
 * This property test verifies that:
 * 1. Every initialized node has exactly one NodeService instance (singleton)
 * 2. The NodeService is always present after node initialization
 * 3. Multiple initialization attempts don't create multiple instances
 * 4. The NodeService has valid identity after initialization
 */

import {test} from 'tap';
import fc from 'fast-check';
import {NodeService, NodeStatus} from '../../src/node/node-service.js';
import {ServiceThreadManager} from '../../src/threading/service-thread-manager.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {AddressManager} from '../../src/address/address-manager.js';

test('Property 2: Node Service Presence', async (t) => {
  t.beforeEach(async () => {
    // Reset all singletons before each test
    await NodeService.getInstance().shutdown().catch(() => {});
    await ServiceThreadManager.getInstance().shutdown().catch(() => {});
    NodeService.resetInstance();
    ServiceThreadManager.resetInstance();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    AddressManager.resetInstance();

    // Initialize infrastructure
    const config = ConfigurationManager.getInstance();
    config.initialize({node: {id: 'test-node'}});

    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});
  });

  t.afterEach(async () => {
    await NodeService.getInstance().shutdown().catch(() => {});
    await ServiceThreadManager.getInstance().shutdown().catch(() => {});
    NodeService.resetInstance();
    ServiceThreadManager.resetInstance();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    AddressManager.resetInstance();
  });

  /**
   * Property: For any number of getInstance calls, the NodeService
   * should always return the same singleton instance.
   */
  t.test('singleton ensures exactly one NodeService instance', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 2, max: 50}),
        (callCount) => {
          // Get multiple references to NodeService
          const instances = [];
          for (let i = 0; i < callCount; i++) {
            instances.push(NodeService.getInstance());
          }

          // All references should be the same instance
          const firstInstance = instances[0];
          return instances.every((inst) => inst === firstInstance);
        },
      ),
      {numRuns: 10},
    );

    t.pass('singleton ensures exactly one NodeService instance');
  });

  /**
   * Property: For any node ID, after initialization the NodeService
   * should be present and active.
   */
  t.test('NodeService is present and active after initialization', async (t) => {
    fc.assert(
      fc.property(
        fc.uuid(),
        (nodeId) => {
          // Reset and reinitialize for each property check
          NodeService.resetInstance();

          const nodeService = NodeService.getInstance();
          nodeService.initialize({nodeId});

          // Should be initialized
          const isInitialized = nodeService.isInitialized();

          // Should be active
          const isActive = nodeService.getStatus() === NodeStatus.ACTIVE;

          // Should have the correct node ID
          const hasCorrectId = nodeService.getNodeId() === nodeId;

          // Should have a node address
          const hasAddress = typeof nodeService.getNodeAddress() === 'string' &&
            nodeService.getNodeAddress().length > 0;

          return isInitialized && isActive && hasCorrectId && hasAddress;
        },
      ),
      {numRuns: 10},
    );

    t.pass('NodeService is present and active after initialization');
  });

  /**
   * Property: For any sequence of node IDs used in initialization attempts,
   * only the first initialization should take effect (idempotent).
   */
  t.test('multiple initialization attempts are idempotent', async (t) => {
    fc.assert(
      fc.property(
        fc.array(fc.uuid(), {minLength: 2, maxLength: 10}),
        (nodeIds) => {
          // Reset for clean state
          NodeService.resetInstance();

          const nodeService = NodeService.getInstance();

          // First initialization with first nodeId
          nodeService.initialize({nodeId: nodeIds[0]});
          const firstNodeId = nodeService.getNodeId();

          // Attempt multiple re-initializations with different nodeIds
          for (let i = 1; i < nodeIds.length; i++) {
            nodeService.initialize({nodeId: nodeIds[i]});
          }

          // NodeId should still be the first one
          const nodeIdUnchanged = nodeService.getNodeId() === firstNodeId;

          // Should still be exactly one instance
          const stillSingleton = NodeService.getInstance() === nodeService;

          // Should still be active
          const stillActive = nodeService.getStatus() === NodeStatus.ACTIVE;

          // Should still be initialized
          const stillInitialized = nodeService.isInitialized();

          return nodeIdUnchanged && stillSingleton && stillActive && stillInitialized;
        },
      ),
      {numRuns: 10},
    );

    t.pass('multiple initialization attempts are idempotent');
  });

  /**
   * Property: For any node, getInstance should always return a valid
   * NodeService object with the expected interface.
   */
  t.test('NodeService has complete interface', async (t) => {
    fc.assert(
      fc.property(
        fc.constant(null), // No input needed, just checking interface
        () => {
          const nodeService = NodeService.getInstance();

          // Check that all required methods exist
          const hasStartService = typeof nodeService.startService === 'function';
          const hasStopService = typeof nodeService.stopService === 'function';
          const hasGetNodeStats = typeof nodeService.getNodeStats === 'function';
          const hasGetServiceHealth = typeof nodeService.getServiceHealth === 'function';
          const hasRouteServiceMessage = typeof nodeService.routeServiceMessage === 'function';
          const hasGetNodeId = typeof nodeService.getNodeId === 'function';
          const hasGetNodeAddress = typeof nodeService.getNodeAddress === 'function';
          const hasGetStatus = typeof nodeService.getStatus === 'function';
          const hasIsInitialized = typeof nodeService.isInitialized === 'function';
          const hasShutdown = typeof nodeService.shutdown === 'function';

          return hasStartService && hasStopService && hasGetNodeStats &&
                 hasGetServiceHealth && hasRouteServiceMessage &&
                 hasGetNodeId && hasGetNodeAddress && hasGetStatus &&
                 hasIsInitialized && hasShutdown;
        },
      ),
      {numRuns: 10},
    );

    t.pass('NodeService has complete interface');
  });

  /**
   * Property: For any initialized node, the status should always be
   * one of the valid NodeStatus values.
   */
  t.test('NodeService status is always valid', async (t) => {
    fc.assert(
      fc.property(
        fc.uuid(),
        (nodeId) => {
          NodeService.resetInstance();

          const nodeService = NodeService.getInstance();
          nodeService.initialize({nodeId});

          const status = nodeService.getStatus();
          const validStatuses = Object.values(NodeStatus);

          return validStatuses.includes(status);
        },
      ),
      {numRuns: 10},
    );

    t.pass('NodeService status is always valid');
  });
});
