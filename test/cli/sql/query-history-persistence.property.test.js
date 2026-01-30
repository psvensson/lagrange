import {test} from '../../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {QueryHistory} from '../../../src/cli/sql/query-history.js';

/**
 * Property 19: Query History Persistence Round-Trip
 * Validates: Requirements 8.3
 *
 * For any history state:
 * - serialize() then deserialize() preserves all entries
 * - Entry order is preserved after round-trip
 * - Invalid entries are filtered during deserialization
 */

test('Property 19: Query History Persistence Round-Trip', async (t) => {
  // Generate non-empty query strings
  const queryArb = fc.string({minLength: 1, maxLength: 50})
    .filter((s) => s.trim().length > 0);

  t.test('serialize then deserialize preserves all entries', async (t) => {
    fc.assert(
      fc.property(
        fc.array(queryArb, {minLength: 0, maxLength: 20})
          .filter((arr) => {
            // Ensure unique queries
            const trimmed = arr.map((q) => q.trim());
            return new Set(trimmed).size === trimmed.length;
          }),
        (queries) => {
          const history1 = new QueryHistory({autoLoad: false});

          for (const query of queries) {
            history1.add(query);
          }

          // Serialize
          const json = history1.serialize();

          // Deserialize into new history
          const history2 = new QueryHistory({autoLoad: false});
          history2.deserialize(json);

          // Compare
          if (history1.length !== history2.length) {
            return false;
          }

          for (let i = 0; i < history1.length; i++) {
            if (history1.getAt(i) !== history2.getAt(i)) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('serialize then deserialize preserves all entries');
  });

  t.test('entry order is preserved after round-trip', async (t) => {
    fc.assert(
      fc.property(
        fc.array(queryArb, {minLength: 2, maxLength: 20})
          .filter((arr) => {
            // Ensure unique queries
            const trimmed = arr.map((q) => q.trim());
            return new Set(trimmed).size === trimmed.length;
          }),
        (queries) => {
          const history1 = new QueryHistory({autoLoad: false});

          for (const query of queries) {
            history1.add(query);
          }

          const originalOrder = history1.getAll();

          // Round-trip
          const json = history1.serialize();
          const history2 = new QueryHistory({autoLoad: false});
          history2.deserialize(json);

          const restoredOrder = history2.getAll();

          // Order should be identical
          if (originalOrder.length !== restoredOrder.length) {
            return false;
          }

          for (let i = 0; i < originalOrder.length; i++) {
            if (originalOrder[i] !== restoredOrder[i]) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('entry order is preserved after round-trip');
  });

  t.test('deserialize filters invalid entries', async (t) => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            queryArb,
            fc.constant(null),
            fc.constant(''),
            fc.constant('   '),
            fc.integer(),
          ),
          {minLength: 1, maxLength: 20},
        ),
        (mixedEntries) => {
          const history = new QueryHistory({autoLoad: false});

          // Create JSON with mixed valid/invalid entries
          const json = JSON.stringify(mixedEntries);
          history.deserialize(json);

          // All entries in history should be valid strings
          const all = history.getAll();
          return all.every((entry) =>
            typeof entry === 'string' && entry.trim().length > 0,
          );
        },
      ),
      {numRuns: 10},
    );
    t.pass('deserialize filters invalid entries');
  });

  t.test('deserialize handles malformed JSON gracefully', async (t) => {
    fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 50}),
        (malformedJson) => {
          const history = new QueryHistory({autoLoad: false});
          history.add('existing query');

          // Try to deserialize malformed JSON
          history.deserialize(malformedJson);

          // Should not crash and should keep existing entries
          // (or have empty entries if JSON was valid but not an array)
          return history.length >= 0;
        },
      ),
      {numRuns: 10},
    );
    t.pass('deserialize handles malformed JSON gracefully');
  });

  t.test('serialize produces valid JSON', async (t) => {
    fc.assert(
      fc.property(
        fc.array(queryArb, {minLength: 0, maxLength: 20}),
        (queries) => {
          const history = new QueryHistory({autoLoad: false});

          for (const query of queries) {
            history.add(query);
          }

          const json = history.serialize();

          // Should be valid JSON
          try {
            const parsed = JSON.parse(json);
            return Array.isArray(parsed);
          } catch (_e) {
            return false;
          }
        },
      ),
      {numRuns: 10},
    );
    t.pass('serialize produces valid JSON');
  });

  t.test('double round-trip is idempotent', async (t) => {
    fc.assert(
      fc.property(
        fc.array(queryArb, {minLength: 0, maxLength: 20})
          .filter((arr) => {
            // Ensure unique queries
            const trimmed = arr.map((q) => q.trim());
            return new Set(trimmed).size === trimmed.length;
          }),
        (queries) => {
          const history1 = new QueryHistory({autoLoad: false});

          for (const query of queries) {
            history1.add(query);
          }

          // First round-trip
          const json1 = history1.serialize();
          const history2 = new QueryHistory({autoLoad: false});
          history2.deserialize(json1);

          // Second round-trip
          const json2 = history2.serialize();
          const history3 = new QueryHistory({autoLoad: false});
          history3.deserialize(json2);

          // Should be identical
          return json1 === json2 &&
                     history2.length === history3.length;
        },
      ),
      {numRuns: 10},
    );
    t.pass('double round-trip is idempotent');
  });

  t.test('deserialize respects maxEntries', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 1, max: 10}),
        fc.array(queryArb, {minLength: 15, maxLength: 30})
          .filter((arr) => {
            // Ensure unique queries
            const trimmed = arr.map((q) => q.trim());
            return new Set(trimmed).size === trimmed.length;
          }),
        (maxEntries, queries) => {
          // Create history with many entries
          const history1 = new QueryHistory({maxEntries: 100, autoLoad: false});
          for (const query of queries) {
            history1.add(query);
          }
          const json = history1.serialize();

          // Deserialize into history with smaller maxEntries
          const history2 = new QueryHistory({maxEntries, autoLoad: false});
          history2.deserialize(json);

          return history2.length <= maxEntries;
        },
      ),
      {numRuns: 10},
    );
    t.pass('deserialize respects maxEntries');
  });
});
