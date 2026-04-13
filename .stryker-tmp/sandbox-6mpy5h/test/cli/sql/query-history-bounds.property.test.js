// @ts-nocheck
import {test} from '../../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {QueryHistory} from '../../../src/cli/sql/query-history.js';

/**
 * Property 18: Query History Bounds
 * Validates: Requirements 8.4
 *
 * For any history configuration and sequence of operations:
 * - History never exceeds maxEntries (default 100)
 * - Oldest entries are removed when limit is reached
 * - getAt returns null for out-of-bounds indices
 */

test('Property 18: Query History Bounds', async (t) => {
  // Generate non-empty query strings
  const queryArb = fc.string({minLength: 1, maxLength: 30})
    .filter((s) => s.trim().length > 0);

  t.test('history never exceeds maxEntries', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 1, max: 50}),
        fc.array(queryArb, {minLength: 1, maxLength: 100}),
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
    t.pass('history never exceeds maxEntries');
  });

  t.test('oldest entries are removed when limit reached', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 2, max: 10}),
        fc.array(queryArb, {minLength: 1, maxLength: 30})
          .filter((arr) => {
            // Ensure unique queries
            const trimmed = arr.map((q) => q.trim());
            return new Set(trimmed).size === trimmed.length;
          }),
        (maxEntries, queries) => {
          const history = new QueryHistory({maxEntries, autoLoad: false});

          for (const query of queries) {
            history.add(query);
          }

          if (queries.length > maxEntries) {
            // Oldest queries should be removed
            const oldestQueries = queries.slice(0, queries.length - maxEntries);
            for (const old of oldestQueries) {
              if (history.contains(old)) {
                return false;
              }
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('oldest entries are removed when limit reached');
  });

  t.test('getAt returns null for negative indices', async (t) => {
    fc.assert(
      fc.property(
        fc.array(queryArb, {minLength: 0, maxLength: 20}),
        fc.integer({min: -100, max: -1}),
        (queries, negativeIndex) => {
          const history = new QueryHistory({autoLoad: false});

          for (const query of queries) {
            history.add(query);
          }

          return history.getAt(negativeIndex) === null;
        },
      ),
      {numRuns: 10},
    );
    t.pass('getAt returns null for negative indices');
  });

  t.test('getAt returns null for indices >= length', async (t) => {
    fc.assert(
      fc.property(
        fc.array(queryArb, {minLength: 0, maxLength: 20}),
        fc.integer({min: 0, max: 50}),
        (queries, indexOffset) => {
          const history = new QueryHistory({autoLoad: false});

          for (const query of queries) {
            history.add(query);
          }

          const outOfBoundsIndex = history.length + indexOffset;
          return history.getAt(outOfBoundsIndex) === null;
        },
      ),
      {numRuns: 10},
    );
    t.pass('getAt returns null for indices >= length');
  });

  t.test('default maxEntries is 100', async (t) => {
    fc.assert(
      fc.property(
        fc.array(queryArb, {minLength: 101, maxLength: 150})
          .filter((arr) => {
            // Ensure unique queries
            const trimmed = arr.map((q) => q.trim());
            return new Set(trimmed).size === trimmed.length;
          }),
        (queries) => {
          const history = new QueryHistory({autoLoad: false});

          for (const query of queries) {
            history.add(query);
          }

          return history.length === 100;
        },
      ),
      {numRuns: 10},
    );
    t.pass('default maxEntries is 100');
  });

  t.test('most recent entries are preserved when limit reached', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 2, max: 10}),
        fc.array(queryArb, {minLength: 1, maxLength: 30})
          .filter((arr) => {
            // Ensure unique queries
            const trimmed = arr.map((q) => q.trim());
            return new Set(trimmed).size === trimmed.length;
          }),
        (maxEntries, queries) => {
          const history = new QueryHistory({maxEntries, autoLoad: false});

          for (const query of queries) {
            history.add(query);
          }

          // Most recent queries should be preserved
          const recentQueries = queries.slice(-maxEntries).reverse();
          for (let i = 0; i < Math.min(recentQueries.length, maxEntries); i++) {
            if (history.getAt(i) !== recentQueries[i].trim()) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('most recent entries are preserved when limit reached');
  });

  t.test('length is always non-negative', async (t) => {
    fc.assert(
      fc.property(
        fc.array(queryArb, {minLength: 0, maxLength: 20}),
        (queries) => {
          const history = new QueryHistory({autoLoad: false});

          for (const query of queries) {
            history.add(query);
          }

          history.clear();

          return history.length >= 0;
        },
      ),
      {numRuns: 10},
    );
    t.pass('length is always non-negative');
  });
});
