/**
 * Property Test: Contexts View Type Filtering
 * Property 46: For any context type filter, the filtered result should contain
 * exactly those contexts with matching context_type.
 *
 * **Validates: Requirements 31.2**
 */
// @ts-nocheck


import {test} from '../../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {ContextsView, CONTEXT_TYPES} from '../../../src/cli/views/contexts-view.js';

/**
 * Generate a valid context record
 */
const contextArb = fc.record({
  context_id: fc.uuid(),
  context_type: fc.constantFrom(...CONTEXT_TYPES),
  name: fc.string({minLength: 1, maxLength: 50}).filter((s) => s.trim().length > 0),
  created_at: fc.integer({min: 1000000000000, max: 2000000000000}),
  updated_at: fc.integer({min: 1000000000000, max: 2000000000000}),
});

/**
 * Generate an array of contexts with unique IDs
 */
const contextsArrayArb = fc.array(contextArb, {minLength: 1, maxLength: 20})
  .map((contexts) => {
    // Ensure unique context_ids
    const seen = new Set();
    return contexts.filter((c) => {
      if (seen.has(c.context_id)) return false;
      seen.add(c.context_id);
      return true;
    });
  })
  .filter((arr) => arr.length > 0);

test('Property 46: Contexts View Type Filtering', async (t) => {
  await t.test('filtered results contain only matching type', async (t) => {
    fc.assert(
      fc.property(
        contextsArrayArb,
        fc.constantFrom(...CONTEXT_TYPES),
        (contexts, filterType) => {
          const view = new ContextsView();
          view.setData(contexts);
          view.setTypeFilter(filterType);

          // All filtered results should have the matching type
          return view.filteredData.every(
            (c) => c.context_type.toLowerCase() === filterType.toLowerCase(),
          );
        },
      ),
      {numRuns: 10},
    );
    t.pass('filtered results contain only matching type');
  });

  await t.test('filtered results contain all matching contexts', async (t) => {
    fc.assert(
      fc.property(
        contextsArrayArb,
        fc.constantFrom(...CONTEXT_TYPES),
        (contexts, filterType) => {
          const view = new ContextsView();
          view.setData(contexts);
          view.setTypeFilter(filterType);

          // Count expected matches
          const expectedCount = contexts.filter(
            (c) => c.context_type.toLowerCase() === filterType.toLowerCase(),
          ).length;

          // Filtered data should have exactly the expected count
          return view.filteredData.length === expectedCount;
        },
      ),
      {numRuns: 10},
    );
    t.pass('filtered results contain all matching contexts');
  });

  await t.test('clearing filter restores all contexts', async (t) => {
    fc.assert(
      fc.property(
        contextsArrayArb,
        fc.constantFrom(...CONTEXT_TYPES),
        (contexts, filterType) => {
          const view = new ContextsView();
          view.setData(contexts);

          // Apply filter
          view.setTypeFilter(filterType);

          // Clear filter
          view.clearTypeFilter();

          // Should have all contexts back
          return view.filteredData.length === contexts.length;
        },
      ),
      {numRuns: 10},
    );
    t.pass('clearing filter restores all contexts');
  });

  await t.test('type filter is case insensitive', async (t) => {
    fc.assert(
      fc.property(
        contextsArrayArb,
        fc.constantFrom(...CONTEXT_TYPES),
        (contexts, filterType) => {
          const view = new ContextsView();
          view.setData(contexts);

          // Apply filter with uppercase
          view.setTypeFilter(filterType.toUpperCase());
          const upperCount = view.filteredData.length;

          // Apply filter with lowercase
          view.setTypeFilter(filterType.toLowerCase());
          const lowerCount = view.filteredData.length;

          // Both should give same results
          return upperCount === lowerCount;
        },
      ),
      {numRuns: 10},
    );
    t.pass('type filter is case insensitive');
  });

  await t.test('empty filter returns all contexts', async (t) => {
    fc.assert(
      fc.property(
        contextsArrayArb,
        (contexts) => {
          const view = new ContextsView();
          view.setData(contexts);

          // No filter applied
          return view.filteredData.length === contexts.length;
        },
      ),
      {numRuns: 10},
    );
    t.pass('empty filter returns all contexts');
  });

  await t.test('filter preserves context data integrity', async (t) => {
    fc.assert(
      fc.property(
        contextsArrayArb,
        fc.constantFrom(...CONTEXT_TYPES),
        (contexts, filterType) => {
          const view = new ContextsView();
          view.setData(contexts);
          view.setTypeFilter(filterType);

          // Each filtered context should be identical to original
          return view.filteredData.every((filtered) => {
            const original = contexts.find((c) => c.context_id === filtered.context_id);
            return original &&
              original.context_type === filtered.context_type &&
              original.name === filtered.name &&
              original.created_at === filtered.created_at &&
              original.updated_at === filtered.updated_at;
          });
        },
      ),
      {numRuns: 10},
    );
    t.pass('filter preserves context data integrity');
  });

  await t.test('non-matching type filter returns empty for single-type data', async (t) => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            context_id: fc.uuid(),
            context_type: fc.constant('function'),
            name: fc.string({minLength: 1, maxLength: 20}),
            created_at: fc.integer({min: 1000000000000, max: 2000000000000}),
            updated_at: fc.integer({min: 1000000000000, max: 2000000000000}),
          }),
          {minLength: 1, maxLength: 5},
        ).map((contexts) => {
          // Ensure unique IDs
          const seen = new Set();
          return contexts.filter((c) => {
            if (seen.has(c.context_id)) return false;
            seen.add(c.context_id);
            return true;
          });
        }).filter((arr) => arr.length > 0),
        (contexts) => {
          const view = new ContextsView();
          view.setData(contexts);

          // Filter by a different type
          view.setTypeFilter('service');

          // Should return empty since all contexts are 'function' type
          return view.filteredData.length === 0;
        },
      ),
      {numRuns: 10},
    );
    t.pass('non-matching type filter returns empty for single-type data');
  });

  await t.test('getContextCountByType reflects filtered data', async (t) => {
    fc.assert(
      fc.property(
        contextsArrayArb,
        fc.constantFrom(...CONTEXT_TYPES),
        (contexts, filterType) => {
          const view = new ContextsView();
          view.setData(contexts);
          view.setTypeFilter(filterType);

          const counts = view.getContextCountByType();

          // Sum of counts should equal filtered data length
          const totalCount = Object.values(counts).reduce((sum, c) => sum + c, 0);
          return totalCount === view.filteredData.length;
        },
      ),
      {numRuns: 10},
    );
    t.pass('getContextCountByType reflects filtered data');
  });
});
