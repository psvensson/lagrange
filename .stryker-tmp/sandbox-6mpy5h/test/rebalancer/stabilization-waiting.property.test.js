/**
 * Property Test: Stabilization Waiting Before Moves (Property 4)
 *
 * For any state change detected by the Rebalancer (node join or suboptimal state),
 * no moves SHALL be executed until the stabilization period has elapsed.
 *
 * Validates: Requirements 2.2, 2.3
 *
 * Feature: node-joining-rebalancer-fixes, Property 4: Stabilization Waiting
 * Before Moves
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {EntityType, NodeStatus} from '../../src/rebalancer/unified-rebalancer.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {createTestRebalancer, createMockCache} from './test-helpers.js';

// Initialize test environment
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-node'},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

test('Property 4: Stabilization Waiting Before Moves', async (t) => {
  await t.test('isStabilized returns false on fresh rebalancer (bootstrap protection)',
    async (t) => {
      initializeTestEnvironment();

      const rebalancer = createTestRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
      });

      // Fresh rebalancer should NOT be stabilized - this prevents premature
      // rebalancing during bootstrap when the services table may be empty
      t.equal(rebalancer.isStabilized(), false,
        'Should not be stabilized on fresh rebalancer (bootstrap protection)');
    });

  await t.test('isStabilized returns false immediately after state change', async (t) => {
    await fc.assert(
      fc.property(
        fc.constantFrom('node_join', 'node_leave', 'policy_change'),
        (reason) => {
          initializeTestEnvironment();

          const rebalancer = createTestRebalancer({
            entityId: 'partition-1',
            entityType: EntityType.PARTITION,
            nodeId: 'node-1',
          });

          // Record a state change
          rebalancer.recordStateChange(reason);

          // Immediately after state change, should NOT be stabilized
          const isStabilized = rebalancer.isStabilized();

          // Clean up timer
          rebalancer.shutdown();

          return isStabilized === false;
        },
      ),
      {numRuns: 10},
    );

    t.pass('isStabilized returns false immediately after state change');
  });

  await t.test('getTimeUntilStabilized returns positive value after state change',
    async (t) => {
      await fc.assert(
        fc.property(
          fc.constantFrom('node_join', 'node_leave', 'policy_change'),
          (reason) => {
            initializeTestEnvironment();

            const rebalancer = createTestRebalancer({
              entityId: 'partition-1',
              entityType: EntityType.PARTITION,
              nodeId: 'node-1',
            });

            // Record a state change
            rebalancer.recordStateChange(reason);

            // Time until stabilized should be positive
            const timeRemaining = rebalancer.getTimeUntilStabilized();

            // Clean up timer
            rebalancer.shutdown();

            // Should be positive and less than or equal to stabilization period
            return timeRemaining > 0 &&
              timeRemaining <= rebalancer.getStabilizationPeriodMs();
          },
        ),
        {numRuns: 10},
      );

      t.pass('getTimeUntilStabilized returns positive value after state change');
    });

  await t.test('getTimeUntilStabilized returns positive value on fresh rebalancer',
    async (t) => {
      initializeTestEnvironment();

      const rebalancer = createTestRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
      });

      // Fresh rebalancer should have time remaining until stabilized
      // This is bootstrap protection - prevents premature rebalancing
      const timeRemaining = rebalancer.getTimeUntilStabilized();
      t.ok(timeRemaining > 0,
        'Should return positive value on fresh rebalancer (bootstrap protection)');
      t.ok(timeRemaining <= rebalancer.getStabilizationPeriodMs(),
        'Time remaining should not exceed stabilization period');
    });

  await t.test('checkRebalance skips moves during stabilization period', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 1, max: 3}),
        async (nodeCount) => {
          initializeTestEnvironment();

          // Create nodes
          const nodes = Array.from({length: nodeCount}, (_, i) => ({
            node_id: `node-${i}`,
            status: NodeStatus.ACTIVE,
          }));

          // Create services (only 1 replica - needs rebalancing)
          const services = [{
            service_id: 's1',
            partition_id: 'partition-1',
            node_id: 'node-0',
            service_type: 'partition',
            status: 'active',
          }];

          const mockCache = createMockCache({nodes, services});

          const rebalancer = createTestRebalancer({
            entityId: 'partition-1',
            entityType: EntityType.PARTITION,
            nodeId: 'node-0',
            systemTableCache: mockCache,
            cacheData: {nodes, services},
          });

          rebalancer.initialize();
          rebalancer.isLeader = true;

          // Record a state change to start stabilization period
          rebalancer.recordStateChange('node_join');

          // Track if rebalance was called
          let rebalanceCalled = false;
          const originalRebalance = rebalancer.rebalance.bind(rebalancer);
          rebalancer.rebalance = async (...args) => {
            rebalanceCalled = true;
            return originalRebalance(...args);
          };

          // Call checkRebalance - should skip due to stabilization
          await rebalancer.checkRebalance();

          // Clean up
          rebalancer.shutdown();

          // Rebalance should NOT have been called during stabilization
          return rebalanceCalled === false;
        },
      ),
      {numRuns: 10},
    );

    t.pass('checkRebalance skips moves during stabilization period');
  });

  await t.test('stabilization period prevents immediate moves on node join', async (t) => {
    initializeTestEnvironment();

    const nodes = [
      {node_id: 'node-0', status: NodeStatus.ACTIVE},
      {node_id: 'node-1', status: NodeStatus.ACTIVE},
      {node_id: 'node-2', status: NodeStatus.ACTIVE},
    ];

    const services = [{
      service_id: 's1',
      partition_id: 'partition-1',
      node_id: 'node-0',
      service_type: 'partition',
      status: 'active',
    }];

    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-0',
      cacheData: {nodes, services},
    });

    rebalancer.initialize();
    rebalancer.isLeader = true;

    // Simulate node join by recording state change
    rebalancer.recordStateChange('node_join');

    // Verify not stabilized
    t.equal(rebalancer.isStabilized(), false,
      'Should not be stabilized immediately after node join');

    // Clean up
    rebalancer.shutdown();
  });

  await t.test('stabilization period prevents immediate moves on suboptimal state',
    async (t) => {
      initializeTestEnvironment();

      const nodes = [
        {node_id: 'node-0', status: NodeStatus.ACTIVE},
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
      ];

      // Suboptimal: only 1 replica when target is 3
      const services = [{
        service_id: 's1',
        partition_id: 'partition-1',
        node_id: 'node-0',
        service_type: 'partition',
        status: 'active',
      }];

      const rebalancer = createTestRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-0',
        cacheData: {nodes, services},
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;

      // Record state change for suboptimal detection
      rebalancer.recordStateChange('suboptimal_state');

      // Verify not stabilized
      t.equal(rebalancer.isStabilized(), false,
        'Should not be stabilized immediately after suboptimal state detected');

      // Clean up
      rebalancer.shutdown();
    });
});
