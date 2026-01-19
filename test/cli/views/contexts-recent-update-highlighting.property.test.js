/**
 * Property Test: Contexts Recent Update Highlighting
 * Property 47: For any context with updated_at within the last 5 minutes,
 * the row should have warning styling applied.
 *
 * **Validates: Requirements 31.4**
 */

import {test} from 'tap';
import fc from 'fast-check';
import {
  ContextsView,
  CONTEXT_TYPES,
  RECENT_UPDATE_THRESHOLD_MS,
} from '../../../src/cli/views/contexts-view.js';
import {ROW_STATUS} from '../../../src/cli/core/base-view.js';

// Use a fixed reference time for consistent testing
const REFERENCE_TIME = 1700000000000; // Fixed timestamp for testing
const THRESHOLD = RECENT_UPDATE_THRESHOLD_MS;

/**
 * Generate a context with a recent update (within threshold) relative to reference time
 */
const recentContextArb = fc.record({
  context_id: fc.uuid(),
  context_type: fc.constantFrom(...CONTEXT_TYPES),
  name: fc.string({minLength: 1, maxLength: 30}).filter((s) => s.trim().length > 0),
  created_at: fc.integer({min: 1000000000000, max: REFERENCE_TIME - THRESHOLD}),
  // Updated within the threshold (between referenceTime - threshold and referenceTime)
  updated_at: fc.integer({min: REFERENCE_TIME - THRESHOLD, max: REFERENCE_TIME}),
});

/**
 * Generate a context with an old update (outside threshold) relative to reference time
 */
const oldContextArb = fc.record({
  context_id: fc.uuid(),
  context_type: fc.constantFrom(...CONTEXT_TYPES),
  name: fc.string({minLength: 1, maxLength: 30}).filter((s) => s.trim().length > 0),
  created_at: fc.integer({min: 1000000000000, max: REFERENCE_TIME - THRESHOLD - 1}),
  // Updated outside the threshold (older than referenceTime - threshold)
  updated_at: fc.integer({
    min: 1000000000000,
    max: REFERENCE_TIME - THRESHOLD - 1,
  }),
});

/**
 * Generate a context without updated_at
 */
const noUpdateContextArb = fc.record({
  context_id: fc.uuid(),
  context_type: fc.constantFrom(...CONTEXT_TYPES),
  name: fc.string({minLength: 1, maxLength: 30}).filter((s) => s.trim().length > 0),
  created_at: fc.integer({min: 1000000000000, max: REFERENCE_TIME}),
});

test('Property 47: Contexts Recent Update Highlighting', async (t) => {
  await t.test('isRecentlyUpdated returns true for recent contexts', async (t) => {
    fc.assert(
      fc.property(
        recentContextArb,
        (context) => {
          const view = new ContextsView({recentUpdateThreshold: THRESHOLD});
          return view.isRecentlyUpdated(context, REFERENCE_TIME) === true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('isRecentlyUpdated returns true for recent contexts');
  });

  await t.test('isRecentlyUpdated returns false for old contexts', async (t) => {
    fc.assert(
      fc.property(
        oldContextArb,
        (context) => {
          const view = new ContextsView({recentUpdateThreshold: THRESHOLD});
          return view.isRecentlyUpdated(context, REFERENCE_TIME) === false;
        },
      ),
      {numRuns: 10},
    );
    t.pass('isRecentlyUpdated returns false for old contexts');
  });

  await t.test('isRecentlyUpdated returns false for contexts without updated_at', async (t) => {
    fc.assert(
      fc.property(
        noUpdateContextArb,
        (context) => {
          const view = new ContextsView({recentUpdateThreshold: THRESHOLD});
          return view.isRecentlyUpdated(context, REFERENCE_TIME) === false;
        },
      ),
      {numRuns: 10},
    );
    t.pass('isRecentlyUpdated returns false for contexts without updated_at');
  });

  await t.test('threshold boundary is respected', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 1, max: 10}), // Small offset in ms
        (offset) => {
          const view = new ContextsView({recentUpdateThreshold: THRESHOLD});

          // Context exactly at threshold boundary (should be recent)
          const atBoundary = {
            context_id: 'test-1',
            updated_at: REFERENCE_TIME - THRESHOLD,
          };

          // Context just outside threshold (should not be recent)
          const outsideBoundary = {
            context_id: 'test-2',
            updated_at: REFERENCE_TIME - THRESHOLD - offset,
          };

          const atBoundaryResult = view.isRecentlyUpdated(atBoundary, REFERENCE_TIME);
          const outsideResult = view.isRecentlyUpdated(outsideBoundary, REFERENCE_TIME);

          return atBoundaryResult === true && outsideResult === false;
        },
      ),
      {numRuns: 10},
    );
    t.pass('threshold boundary is respected');
  });

  await t.test('custom threshold is respected', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 60000, max: 600000}), // 1-10 minutes
        (customThreshold) => {
          const view = new ContextsView({recentUpdateThreshold: customThreshold});

          // Context within custom threshold
          const withinThreshold = {
            context_id: 'test-1',
            updated_at: REFERENCE_TIME - customThreshold + 1000,
          };

          // Context outside custom threshold
          const outsideThreshold = {
            context_id: 'test-2',
            updated_at: REFERENCE_TIME - customThreshold - 1000,
          };

          const withinResult = view.isRecentlyUpdated(withinThreshold, REFERENCE_TIME);
          const outsideResult = view.isRecentlyUpdated(outsideThreshold, REFERENCE_TIME);

          return withinResult === true && outsideResult === false;
        },
      ),
      {numRuns: 10},
    );
    t.pass('custom threshold is respected');
  });

  await t.test('future timestamps are not considered recent', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 1000, max: 100000}), // Future offset
        (futureOffset) => {
          const view = new ContextsView({recentUpdateThreshold: THRESHOLD});

          const futureContext = {
            context_id: 'test-future',
            updated_at: REFERENCE_TIME + futureOffset,
          };

          // Future timestamps should not be considered "recently updated"
          return view.isRecentlyUpdated(futureContext, REFERENCE_TIME) === false;
        },
      ),
      {numRuns: 10},
    );
    t.pass('future timestamps are not considered recent');
  });

  await t.test('getRowStatus uses isRecentlyUpdated correctly', async (t) => {
    // Test with current time - generate contexts relative to now
    const now = Date.now();

    fc.assert(
      fc.property(
        fc.integer({min: 1000, max: THRESHOLD - 1000}), // Time within threshold
        (recentOffset) => {
          const view = new ContextsView({recentUpdateThreshold: THRESHOLD});

          // Context updated recently (relative to now)
          const recentContext = {
            context_id: 'test-recent',
            updated_at: now - recentOffset,
          };

          // getRowStatus should return WARNING for recent contexts
          return view.getRowStatus(recentContext) === ROW_STATUS.WARNING;
        },
      ),
      {numRuns: 10},
    );
    t.pass('getRowStatus returns WARNING for recent contexts');
  });

  await t.test('getRowStatus returns NORMAL for old contexts', async (t) => {
    const now = Date.now();

    fc.assert(
      fc.property(
        fc.integer({min: THRESHOLD + 1000, max: THRESHOLD + 100000}), // Time outside threshold
        (oldOffset) => {
          const view = new ContextsView({recentUpdateThreshold: THRESHOLD});

          // Context updated long ago (relative to now)
          const oldContext = {
            context_id: 'test-old',
            updated_at: now - oldOffset,
          };

          // getRowStatus should return NORMAL for old contexts
          return view.getRowStatus(oldContext) === ROW_STATUS.NORMAL;
        },
      ),
      {numRuns: 10},
    );
    t.pass('getRowStatus returns NORMAL for old contexts');
  });

  await t.test('getRowStatus returns NORMAL for contexts without updated_at', async (t) => {
    fc.assert(
      fc.property(
        noUpdateContextArb,
        (context) => {
          const view = new ContextsView({recentUpdateThreshold: THRESHOLD});
          return view.getRowStatus(context) === ROW_STATUS.NORMAL;
        },
      ),
      {numRuns: 10},
    );
    t.pass('getRowStatus returns NORMAL for contexts without updated_at');
  });

  await t.test('status bar counts recently updated correctly', async (t) => {
    const now = Date.now();

    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({min: 0, max: 3}), // Number of recent contexts
          fc.integer({min: 0, max: 3}), // Number of old contexts
        ),
        ([recentCount, oldCount]) => {
          const view = new ContextsView({recentUpdateThreshold: THRESHOLD});

          // Create contexts with unique IDs
          const contexts = [];
          for (let i = 0; i < recentCount; i++) {
            contexts.push({
              context_id: `recent-${i}`,
              context_type: 'function',
              name: `recent-${i}`,
              updated_at: now - 1000 * (i + 1), // Recent
            });
          }
          for (let i = 0; i < oldCount; i++) {
            contexts.push({
              context_id: `old-${i}`,
              context_type: 'service',
              name: `old-${i}`,
              updated_at: now - THRESHOLD - 1000 * (i + 1), // Old
            });
          }

          view.setData(contexts);
          const statusBar = view.getStatusBarInfo();

          return statusBar.recentlyUpdatedCount === recentCount;
        },
      ),
      {numRuns: 10},
    );
    t.pass('status bar counts recently updated correctly');
  });
});
