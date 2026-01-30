/**
 * Property Test: Stabilization Period Configuration Bounds (Property 3)
 *
 * For any stabilization period configuration value, the effective value
 * SHALL be clamped to the range [1000ms, 10000ms] with a default of 1000ms.
 *
 * Validates: Requirements 2.1
 *
 * Feature: node-joining-rebalancer-fixes, Property 3: Stabilization Period
 * Configuration Bounds
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {EntityType} from '../../src/rebalancer/unified-rebalancer.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {createTestRebalancer} from './test-helpers.js';

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

test('Property 3: Stabilization Period Configuration Bounds', async (t) => {
  await t.test('default stabilization period is 1000ms', async (t) => {
    // Reset and initialize without stabilization config
    initializeTestEnvironment();

    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const effectiveValue = rebalancer.getStabilizationPeriodMs();

    t.equal(effectiveValue, 1000, 'Default stabilization period should be 1000ms');
  });

  await t.test('values within valid range are preserved', async (t) => {
    await fc.assert(
      fc.property(
        // Schema allows 1000-10000, so test within that range
        fc.integer({min: 1000, max: 10000}),
        (configuredValue) => {
          ConfigurationManager.resetInstance();
          const config = ConfigurationManager.getInstance();
          config.initialize({
            node: {id: 'test-node'},
            logging: {level: 'error'},
            rebalancer: {stabilizationPeriodMs: configuredValue},
          });

          const rebalancer = createTestRebalancer({
            entityId: 'partition-1',
            entityType: EntityType.PARTITION,
            nodeId: 'node-1',
          });

          const effectiveValue = rebalancer.getStabilizationPeriodMs();

          // Values within range should be preserved exactly
          return effectiveValue === configuredValue;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Values within range [1000ms, 10000ms] are preserved');
  });

  await t.test('clampStabilizationPeriod clamps values below minimum', async (t) => {
    await fc.assert(
      fc.property(
        fc.integer({min: -10000, max: 999}),
        (inputValue) => {
          initializeTestEnvironment();

          const rebalancer = createTestRebalancer({
            entityId: 'partition-1',
            entityType: EntityType.PARTITION,
            nodeId: 'node-1',
          });

          // Test the clamping method directly
          const clampedValue = rebalancer.clampStabilizationPeriod(inputValue);

          // Values below 1000 should be clamped to 1000
          return clampedValue === 1000;
        },
      ),
      {numRuns: 10},
    );

    t.pass('clampStabilizationPeriod clamps values below minimum to 1000ms');
  });

  await t.test('clampStabilizationPeriod clamps values above maximum', async (t) => {
    await fc.assert(
      fc.property(
        fc.integer({min: 10001, max: 100000}),
        (inputValue) => {
          initializeTestEnvironment();

          const rebalancer = createTestRebalancer({
            entityId: 'partition-1',
            entityType: EntityType.PARTITION,
            nodeId: 'node-1',
          });

          // Test the clamping method directly
          const clampedValue = rebalancer.clampStabilizationPeriod(inputValue);

          // Values above 10000 should be clamped to 10000
          return clampedValue === 10000;
        },
      ),
      {numRuns: 10},
    );

    t.pass('clampStabilizationPeriod clamps values above maximum to 10000ms');
  });

  await t.test('clampStabilizationPeriod preserves values within range', async (t) => {
    await fc.assert(
      fc.property(
        fc.integer({min: 1000, max: 10000}),
        (inputValue) => {
          initializeTestEnvironment();

          const rebalancer = createTestRebalancer({
            entityId: 'partition-1',
            entityType: EntityType.PARTITION,
            nodeId: 'node-1',
          });

          // Test the clamping method directly
          const clampedValue = rebalancer.clampStabilizationPeriod(inputValue);

          // Values within range should be preserved
          return clampedValue === inputValue;
        },
      ),
      {numRuns: 10},
    );

    t.pass('clampStabilizationPeriod preserves values within range');
  });

  await t.test('clampStabilizationPeriod handles non-numeric values', async (t) => {
    initializeTestEnvironment();

    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    // Test with various non-numeric values
    t.equal(rebalancer.clampStabilizationPeriod(undefined), 1000,
      'undefined should return default');
    t.equal(rebalancer.clampStabilizationPeriod(null), 1000,
      'null should return default');
    t.equal(rebalancer.clampStabilizationPeriod(NaN), 1000,
      'NaN should return default');
    t.equal(rebalancer.clampStabilizationPeriod('invalid'), 1000,
      'string should return default');
  });

  await t.test('effective value is always in valid range', async (t) => {
    await fc.assert(
      fc.property(
        fc.integer({min: 1000, max: 10000}),
        (configuredValue) => {
          ConfigurationManager.resetInstance();
          const config = ConfigurationManager.getInstance();
          config.initialize({
            node: {id: 'test-node'},
            logging: {level: 'error'},
            rebalancer: {stabilizationPeriodMs: configuredValue},
          });

          const rebalancer = createTestRebalancer({
            entityId: 'partition-1',
            entityType: EntityType.PARTITION,
            nodeId: 'node-1',
          });

          const effectiveValue = rebalancer.getStabilizationPeriodMs();

          // Property: effective value must always be in range [1000, 10000]
          return effectiveValue >= 1000 && effectiveValue <= 10000;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Effective stabilization period is always in valid range');
  });
});
