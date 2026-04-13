// @ts-nocheck
import {test} from '../../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {QueryHistory} from '../../../src/cli/sql/query-history.js';

/**
 * Property 17: Query History Consistency
 * Validates: Requirements 8.1, 8.2, 8.5
 *
 * For any sequence of add operations:
 * - Most recently added query is always at index 0
 * - Duplicate queries are moved to front (not duplicated)
 * - getAt(index) returns the query in correct order
 * - Selecting a history item returns the exact query
 */

test('Property 17: Query History Consistency', async (t) => {
  // Generate non-empty query strings
  const queryArb = fc.string({minLength: 1, maxLength: 50})
    .filter((s) => s.trim().length > 0);

  t.test('most recently added query is at index 0', async (t) => {
    fc.assert(
      fc.property(
        fc.array(queryArb, {minLength: 1, maxLength: 20}),
        (queries) => {
          const history = new QueryHistory({autoLoad: false});

          for (const query of queries) {
            history.add(query);
          }

          // Most recent (last added) should be at index 0
          const lastQuery = queries[queries.length - 1].trim();
          return history.getAt(0) === lastQuery;
        },
      ),
      {numRuns: 10},
    );
    t.pass('most recently added query is at index 0');
  });

  t.test('duplicate queries are moved to front not duplicated', async (t) => {
    fc.assert(
      fc.property(
        queryArb,
        fc.array(queryArb, {minLength: 0, maxLength: 10}),
        (duplicateQuery, otherQueries) => {
          const history = new QueryHistory({autoLoad: false});

          // Add the query first
          history.add(duplicateQuery);

          // Add other queries
          for (const query of otherQueries) {
            history.add(query);
          }

          // Add the duplicate again
          history.add(duplicateQuery);

          // Count occurrences of the duplicate
          const all = history.getAll();
          const count = all.filter((q) => q === duplicateQuery.trim()).length;

          // Should appear exactly once and at index 0
          return count === 1 && history.getAt(0) === duplicateQuery.trim();
        },
      ),
      {numRuns: 10},
    );
    t.pass('duplicate queries are moved to front not duplicated');
  });

  t.test('getAt returns queries in correct order', async (t) => {
    fc.assert(
      fc.property(
        fc.array(queryArb, {minLength: 2, maxLength: 10})
          .filter((arr) => {
            // Ensure unique queries for this test
            const trimmed = arr.map((q) => q.trim());
            return new Set(trimmed).size === trimmed.length;
          }),
        (queries) => {
          const history = new QueryHistory({autoLoad: false});

          for (const query of queries) {
            history.add(query);
          }

          // Verify order is reversed (most recent first)
          const reversed = [...queries].reverse().map((q) => q.trim());
          for (let i = 0; i < reversed.length; i++) {
            if (history.getAt(i) !== reversed[i]) {
              return false;
            }
          }
          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('getAt returns queries in correct order');
  });

  t.test('selecting history item returns exact query', async (t) => {
    fc.assert(
      fc.property(
        fc.array(queryArb, {minLength: 1, maxLength: 20}),
        fc.integer({min: 0, max: 19}),
        (queries, indexOffset) => {
          const history = new QueryHistory({autoLoad: false});

          for (const query of queries) {
            history.add(query);
          }

          // Select a valid index
          const index = indexOffset % history.length;
          const selected = history.getAt(index);

          // Selected query should be in the original queries
          const trimmedQueries = queries.map((q) => q.trim());
          return trimmedQueries.includes(selected);
        },
      ),
      {numRuns: 10},
    );
    t.pass('selecting history item returns exact query');
  });

  t.test('history length never exceeds maxEntries', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 1, max: 20}),
        fc.array(queryArb, {minLength: 1, maxLength: 50}),
        (maxEntries, queries) => {
          const history = new QueryHistory({maxEntries, autoLoad: false});

          for (const query of queries) {
            history.add(query);
          }

          return history.length <= maxEntries;
        },
      ),
      {numRuns: 10},
    );
    t.pass('history length never exceeds maxEntries');
  });

  t.test('contains is consistent with getAll', async (t) => {
    fc.assert(
      fc.property(
        fc.array(queryArb, {minLength: 1, maxLength: 20}),
        queryArb,
        (queries, testQuery) => {
          const history = new QueryHistory({autoLoad: false});

          for (const query of queries) {
            history.add(query);
          }

          const all = history.getAll();
          const containsResult = history.contains(testQuery);
          const inAll = all.includes(testQuery.trim());

          return containsResult === inAll;
        },
      ),
      {numRuns: 10},
    );
    t.pass('contains is consistent with getAll');
  });

  t.test('add then getAt(0) returns the added query', async (t) => {
    fc.assert(
      fc.property(
        queryArb,
        (query) => {
          const history = new QueryHistory({autoLoad: false});

          history.add(query);

          return history.getAt(0) === query.trim();
        },
      ),
      {numRuns: 10},
    );
    t.pass('add then getAt(0) returns the added query');
  });
});
