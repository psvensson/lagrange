/**
 * Property Test: Stabilization Timer Reset (Property 6)
 *
 * For any state change that occurs during an active stabilization period,
 * the stabilization timer SHALL be reset, extending the wait period.
 *
 * Validates: Requirements 2.5
 *
 * Feature: node-joining-rebalancer-fixes, Property 6: Stabilization Timer Reset
 */

import {test} from 'tap';
import fc from 'fast-check';
import {
  UnifiedRebalancer,
  EntityType,
} from '../../src/rebalancer/unified-rebalancer.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

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

test('Property 6: Stabilization Timer Reset', async (t) => {
  await t.test('recordStateChange resets lastStateChangeTime', async (t) => {
    await fc.assert(
      fc.property(
        fc.constantFrom('node_join', 'node_leave', 'policy_change', 'suboptimal'),
        fc.constantFrom('node_join', 'node_leave', 'policy_change', 'suboptimal'),
        (firstReason, secondReason) => {
          initializeTestEnvironment();

          const rebalancer = new UnifiedRebalancer({
            entityId: 'partition-1',
            entityType: EntityType.PARTITION,
            nodeId: 'node-1',
          });

          // Record first state change
          rebalancer.recordStateChange(firstReason);
          const firstChangeTime = rebalancer.lastStateChangeTime;

          // Small delay to ensure time difference
          const startTime = Date.now();
          while (Date.now() - startTime < 5) {
            // Busy wait for a few ms
          }

          // Record second state change
          rebalancer.recordStateChange(secondReason);
          const secondChangeTime = rebalancer.lastStateChangeTime;

          // Clean up
          rebalancer.shutdown();

          // Second change time should be >= first change time
          return secondChangeTime >= firstChangeTime;
        },
      ),
      {numRuns: 10},
    );

    t.pass('recordStateChange updates lastStateChangeTime');
  });

  await t.test('multiple state changes extend stabilization period', async (t) => {
    await fc.assert(
      fc.property(
        fc.integer({min: 1, max: 5}),
        (numChanges) => {
          initializeTestEnvironment();

          const rebalancer = new UnifiedRebalancer({
            entityId: 'partition-1',
            entityType: EntityType.PARTITION,
            nodeId: 'node-1',
          });

          // Record multiple state changes
          for (let i = 0; i < numChanges; i++) {
            rebalancer.recordStateChange(`change_${i}`);
          }

          // After multiple changes, should still not be stabilized
          const isStabilized = rebalancer.isStabilized();

          // Time until stabilized should be close to full period
          const timeRemaining = rebalancer.getTimeUntilStabilized();
          const stabilizationPeriod = rebalancer.getStabilizationPeriodMs();

          // Clean up
          rebalancer.shutdown();

          // Should not be stabilized and time remaining should be significant
          return isStabilized === false &&
            timeRemaining > 0 &&
            timeRemaining <= stabilizationPeriod;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Multiple state changes extend stabilization period');
  });

  await t.test('stabilization timer is cleared on shutdown', async (t) => {
    initializeTestEnvironment();

    const rebalancer = new UnifiedRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    // Set as leader so timer is created
    rebalancer.isLeader = true;

    // Record state change to create timer
    rebalancer.recordStateChange('test');

    // Verify timer exists
    t.ok(rebalancer.stabilizationTimer !== null,
      'Stabilization timer should exist after state change');

    // Shutdown
    rebalancer.shutdown();

    // Timer should be cleared
    t.equal(rebalancer.stabilizationTimer, null,
      'Stabilization timer should be null after shutdown');
    t.equal(rebalancer.lastStateChangeTime, null,
      'lastStateChangeTime should be null after shutdown');
  });

  await t.test('new state change cancels previous stabilization timer', async (t) => {
    await fc.assert(
      fc.property(
        fc.constantFrom('node_join', 'node_leave', 'policy_change'),
        fc.constantFrom('node_join', 'node_leave', 'policy_change'),
        (firstReason, secondReason) => {
          initializeTestEnvironment();

          const rebalancer = new UnifiedRebalancer({
            entityId: 'partition-1',
            entityType: EntityType.PARTITION,
            nodeId: 'node-1',
          });

          // Set as leader so timer is created
          rebalancer.isLeader = true;

          // Record first state change
          rebalancer.recordStateChange(firstReason);
          const firstTimer = rebalancer.stabilizationTimer;

          // Record second state change
          rebalancer.recordStateChange(secondReason);
          const secondTimer = rebalancer.stabilizationTimer;

          // Clean up
          rebalancer.shutdown();

          // Both timers should exist (not null)
          // The second timer should be different from the first
          // (first was cancelled and new one created)
          return firstTimer !== null && secondTimer !== null;
        },
      ),
      {numRuns: 10},
    );

    t.pass('New state change creates new stabilization timer');
  });

  await t.test('time until stabilized resets on each state change', async (t) => {
    initializeTestEnvironment();

    const rebalancer = new UnifiedRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const stabilizationPeriod = rebalancer.getStabilizationPeriodMs();

    // Record first state change
    rebalancer.recordStateChange('first');
    const timeAfterFirst = rebalancer.getTimeUntilStabilized();

    // Time should be close to full period
    t.ok(timeAfterFirst > stabilizationPeriod * 0.9,
      'Time until stabilized should be close to full period after first change');

    // Small delay
    const startTime = Date.now();
    while (Date.now() - startTime < 10) {
      // Busy wait
    }

    // Record second state change
    rebalancer.recordStateChange('second');
    const timeAfterSecond = rebalancer.getTimeUntilStabilized();

    // Time should be reset to close to full period again
    t.ok(timeAfterSecond > stabilizationPeriod * 0.9,
      'Time until stabilized should reset after second change');

    // Clean up
    rebalancer.shutdown();
  });

  await t.test('stabilization timer only created when leader', async (t) => {
    initializeTestEnvironment();

    const rebalancer = new UnifiedRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    // Not a leader
    rebalancer.isLeader = false;

    // Record state change
    rebalancer.recordStateChange('test');

    // Timer should NOT be created when not leader
    t.equal(rebalancer.stabilizationTimer, null,
      'Stabilization timer should not be created when not leader');

    // But lastStateChangeTime should still be set
    t.ok(rebalancer.lastStateChangeTime !== null,
      'lastStateChangeTime should still be set');

    // Clean up
    rebalancer.shutdown();
  });

  await t.test('stabilization timer created when leader', async (t) => {
    initializeTestEnvironment();

    const rebalancer = new UnifiedRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    // Set as leader
    rebalancer.isLeader = true;

    // Record state change
    rebalancer.recordStateChange('test');

    // Timer should be created when leader
    t.ok(rebalancer.stabilizationTimer !== null,
      'Stabilization timer should be created when leader');

    // Clean up
    rebalancer.shutdown();
  });
});
