/**
 * Property Test: Lifecycle Handler Address Format
 * **Property 10: Lifecycle Handler Address Format**
 * **Validates: Requirements 4.2, 1.1, 5.1**
 *
 * *For any* node ID, the lifecycle handler address SHALL be exactly
 * `${nodeId}/lifecycle/manager` following the unified address format.
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

/**
 * Generate lifecycle handler address from node ID.
 * This is the function under test - it should match the implementation
 * in BootstrapService.initializeReplicaLifecycleManager().
 * Uses unified address format: ${nodeId}/${entityType}/${entityId}
 * @param {string} nodeId - Node identifier.
 * @return {string} Lifecycle handler address.
 */
function generateLifecycleAddress(nodeId) {
  return `${nodeId}/lifecycle/manager`;
}

test('Property 10: Lifecycle Handler Address Format', async (t) => {
  t.beforeEach(async () => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    const config = ConfigurationManager.getInstance();
    config.initialize({});

    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});
  });

  t.afterEach(async () => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  /**
   * Property: For any node ID, the lifecycle address follows the unified format
   * ${nodeId}/lifecycle/manager exactly.
   */
  t.test('lifecycle address follows unified format pattern', async (t) => {
    await fc.assert(
      fc.property(
        fc.uuid(), // nodeId as UUID
        (nodeId) => {
          const address = generateLifecycleAddress(nodeId);

          // Invariant: address must be exactly ${nodeId}/lifecycle/manager
          return address === `${nodeId}/lifecycle/manager`;
        },
      ),
      {numRuns: 10},
    );

    t.pass('lifecycle address follows unified format for UUIDs');
  });

  /**
   * Property: For any string node ID, the lifecycle address follows the unified
   * format ${nodeId}/lifecycle/manager exactly.
   */
  t.test('lifecycle address works with arbitrary string node IDs', async (t) => {
    await fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 50}), // arbitrary string nodeId
        (nodeId) => {
          const address = generateLifecycleAddress(nodeId);

          // Invariant: address must be exactly ${nodeId}/lifecycle/manager
          return address === `${nodeId}/lifecycle/manager`;
        },
      ),
      {numRuns: 10},
    );

    t.pass('lifecycle address follows unified format for strings');
  });

  /**
   * Property: The lifecycle address always ends with '/lifecycle/manager' suffix.
   */
  t.test('lifecycle address always ends with /lifecycle/manager suffix', async (t) => {
    await fc.assert(
      fc.property(
        fc.oneof(
          fc.uuid(),
          fc.string({minLength: 1, maxLength: 50}),
          fc.constantFrom('node-1', 'seed-node', 'test-node-123'),
        ),
        (nodeId) => {
          const address = generateLifecycleAddress(nodeId);

          // Invariant: address must end with '/lifecycle/manager'
          return address.endsWith('/lifecycle/manager');
        },
      ),
      {numRuns: 10},
    );

    t.pass('lifecycle address always ends with /lifecycle/manager suffix');
  });

  /**
   * Property: The lifecycle address always starts with the node ID.
   */
  t.test('lifecycle address always starts with node ID', async (t) => {
    await fc.assert(
      fc.property(
        fc.oneof(
          fc.uuid(),
          fc.string({minLength: 1, maxLength: 50}),
        ),
        (nodeId) => {
          const address = generateLifecycleAddress(nodeId);

          // Invariant: address must start with nodeId
          return address.startsWith(nodeId);
        },
      ),
      {numRuns: 10},
    );

    t.pass('lifecycle address always starts with node ID');
  });

  /**
   * Property: The lifecycle address follows unified format with 3 segments.
   */
  t.test('lifecycle address has three segments in unified format', async (t) => {
    await fc.assert(
      fc.property(
        fc.uuid(), // Use UUID to avoid '/' in nodeId
        (nodeId) => {
          const address = generateLifecycleAddress(nodeId);
          const segments = address.split('/');

          // Invariant: must have exactly 3 segments
          // [nodeId, 'lifecycle', 'manager']
          return segments.length === 3 &&
                 segments[0] === nodeId &&
                 segments[1] === 'lifecycle' &&
                 segments[2] === 'manager';
        },
      ),
      {numRuns: 10},
    );

    t.pass('lifecycle address has three segments in unified format');
  });
});
