/**
 * Property 73: Straggler Detection
 * Validates: Requirements 26.10
 *
 * The system should detect slow partitions (latency > 2× median) and
 * log warnings for operator attention.
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {StragglerDetector} from '../../src/query/straggler-detector.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

// Initialize configuration
const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}

/**
 * Property 73: Straggler Detection
 * The system should detect slow partitions (latency > 2× median) and
 * log warnings for operator attention.
 * **Validates: Requirements 26.10**
 */
test('Property 73: Straggler Detection', async (t) => {
  await t.test('detects stragglers exceeding 2x median latency', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 10, max: 50}), // Base latency
        fc.integer({min: 3, max: 5}), // Number of fast partitions
        async (baseLatency, fastCount) => {
          const detector = new StragglerDetector({thresholdMultiplier: 2.0});

          // Record fast partitions
          for (let i = 0; i < fastCount; i++) {
            detector.recordCompletion(`fast-${i}`, baseLatency + (i * 2));
          }

          // Check if a slow partition would be detected as straggler
          const slowLatency = baseLatency * 3; // 3x base = definitely > 2x median
          const isStraggler = detector.isStraggler('slow-1', slowLatency);

          // Property: Partition with 3x base latency should be detected as straggler
          return isStraggler === true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Detects stragglers exceeding 2x median latency');
  });

  await t.test('does not flag fast partitions as stragglers', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 10, max: 50}),
        fc.integer({min: 3, max: 5}),
        async (baseLatency, partitionCount) => {
          const detector = new StragglerDetector({thresholdMultiplier: 2.0});

          // Record partitions with similar latencies
          for (let i = 0; i < partitionCount; i++) {
            detector.recordCompletion(`p${i}`, baseLatency + i);
          }

          // Check if a partition with similar latency is flagged
          const similarLatency = baseLatency + partitionCount;
          const isStraggler = detector.isStraggler('similar', similarLatency);

          // Property: Partition with similar latency should not be straggler
          return isStraggler === false;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Does not flag fast partitions as stragglers');
  });

  await t.test('calculates median latency correctly', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({min: 1, max: 100}), {minLength: 3, maxLength: 10}),
        async (latencies) => {
          const detector = new StragglerDetector();

          // Record all latencies
          latencies.forEach((lat, i) => {
            detector.recordCompletion(`p${i}`, lat);
          });

          const median = detector.getMedianLatency();

          // Calculate expected median
          const sorted = [...latencies].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          const expectedMedian = sorted.length % 2 === 0 ?
            (sorted[mid - 1] + sorted[mid]) / 2 :
            sorted[mid];

          // Property: Calculated median should match expected
          return Math.abs(median - expectedMedian) < 0.001;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Calculates median latency correctly');
  });

  await t.test('threshold is 2x median by default', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({min: 10, max: 50}), {minLength: 3, maxLength: 5}),
        async (latencies) => {
          const detector = new StragglerDetector({thresholdMultiplier: 2.0});

          latencies.forEach((lat, i) => {
            detector.recordCompletion(`p${i}`, lat);
          });

          const median = detector.getMedianLatency();
          const threshold = detector.getStragglerThreshold();

          // Property: Threshold should be 2x median
          return Math.abs(threshold - median * 2) < 0.001;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Threshold is 2x median by default');
  });

  await t.test('analyzes results and identifies all stragglers', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 10, max: 30}),
        fc.integer({min: 2, max: 4}),
        async (baseLatency, fastCount) => {
          const detector = new StragglerDetector({thresholdMultiplier: 2.0});

          // Record fast partitions
          const latencies = new Map();
          for (let i = 0; i < fastCount; i++) {
            const lat = baseLatency + i;
            detector.recordCompletion(`fast-${i}`, lat);
            latencies.set(`fast-${i}`, lat);
          }

          // Add a slow partition
          const slowLatency = baseLatency * 4;
          latencies.set('slow-1', slowLatency);

          const stragglers = detector.analyzeResults(latencies);

          // Property: Should identify the slow partition as straggler
          const slowFound = stragglers.some((s) => s.partitionId === 'slow-1');
          return slowFound === true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Analyzes results and identifies all stragglers');
  });

  await t.test('tracks detected stragglers in stats', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 10, max: 30}),
        async (baseLatency) => {
          const detector = new StragglerDetector({thresholdMultiplier: 2.0});

          // Record some fast partitions
          for (let i = 0; i < 3; i++) {
            detector.recordCompletion(`fast-${i}`, baseLatency);
          }

          // Trigger straggler detection
          detector.isStraggler('slow-1', baseLatency * 5);

          const stats = detector.getStats();

          // Property: Stats should track detected stragglers
          return (
            stats.detectedStragglerCount >= 1 &&
            stats.detectedStragglers.includes('slow-1')
          );
        },
      ),
      {numRuns: 10},
    );
    t.pass('Tracks detected stragglers in stats');
  });

  await t.test('reset clears all state', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 10, max: 50}),
        async (baseLatency) => {
          const detector = new StragglerDetector();

          // Add some data
          detector.recordCompletion('p1', baseLatency);
          detector.recordCompletion('p2', baseLatency * 2);
          detector.isStraggler('slow', baseLatency * 5);

          // Reset
          detector.reset();

          const stats = detector.getStats();

          // Property: After reset, all state should be cleared
          return (
            stats.completedCount === 0 &&
            stats.detectedStragglerCount === 0 &&
            stats.medianLatencyMs === 0
          );
        },
      ),
      {numRuns: 10},
    );
    t.pass('Reset clears all state');
  });
});
