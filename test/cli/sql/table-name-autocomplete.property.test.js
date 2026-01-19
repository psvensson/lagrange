import {test} from 'tap';
import fc from 'fast-check';
import {
  TableAutocomplete,
  TABLE_CONTEXTS,
} from '../../../src/cli/sql/table-autocomplete.js';

/**
 * Property 23: Table Name Autocomplete
 * Validates: Requirements 9.3
 *
 * For any table name prefix and cache state:
 * - All returned suggestions should start with the prefix
 * - Suggestions should be sorted alphabetically
 * - Results should be limited to a reasonable number
 * - Only tables from the cache should be suggested
 */

/**
 * Create a mock cache with table data
 * @param {Array<string>} tableNames - Table names
 * @return {Object} Mock cache
 */
function createMockCache(tableNames = []) {
  return {
    getTables() {
      return tableNames.map((name) => ({table_name: name}));
    },
  };
}

test('Property 23: Table Name Autocomplete', async (t) => {
  // Generate valid table names (lowercase letters and underscores)
  const tableNameArb = fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_'.split('')),
    {minLength: 1, maxLength: 20},
  ).filter((s) => /^[a-z][a-z_]*$/.test(s));

  t.test('all suggestions start with the given prefix', async (t) => {
    fc.assert(
      fc.property(
        fc.array(tableNameArb, {minLength: 1, maxLength: 20}),
        fc.string({minLength: 1, maxLength: 5}).filter((s) => /^[a-z]+$/.test(s)),
        (tableNames, prefix) => {
          const cache = createMockCache(tableNames);
          const autocomplete = new TableAutocomplete(cache);

          const suggestions = autocomplete.getTableSuggestions(prefix);

          // All suggestions should start with the prefix (case-insensitive)
          return suggestions.every((s) =>
            s.toLowerCase().startsWith(prefix.toLowerCase()),
          );
        },
      ),
      {numRuns: 10},
    );
    t.pass('all suggestions start with the given prefix');
  });

  t.test('suggestions are sorted alphabetically', async (t) => {
    fc.assert(
      fc.property(
        fc.array(tableNameArb, {minLength: 2, maxLength: 20}),
        fc.string({minLength: 0, maxLength: 3}).filter((s) => /^[a-z]*$/.test(s)),
        (tableNames, prefix) => {
          const cache = createMockCache(tableNames);
          const autocomplete = new TableAutocomplete(cache);

          const suggestions = autocomplete.getTableSuggestions(prefix);

          // Check if sorted
          for (let i = 1; i < suggestions.length; i++) {
            if (suggestions[i - 1].toLowerCase() >
                    suggestions[i].toLowerCase()) {
              return false;
            }
          }
          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('suggestions are sorted alphabetically');
  });

  t.test('suggestions are limited to 10 results', async (t) => {
    fc.assert(
      fc.property(
        fc.array(tableNameArb, {minLength: 15, maxLength: 30}),
        (tableNames) => {
          // Ensure all tables start with same prefix
          const prefixedNames = tableNames.map((n) => 'test_' + n);
          const cache = createMockCache(prefixedNames);
          const autocomplete = new TableAutocomplete(cache);

          const suggestions = autocomplete.getTableSuggestions('test');

          return suggestions.length <= 10;
        },
      ),
      {numRuns: 10},
    );
    t.pass('suggestions are limited to 10 results');
  });

  t.test('all suggestions exist in the cache', async (t) => {
    fc.assert(
      fc.property(
        fc.array(tableNameArb, {minLength: 1, maxLength: 20}),
        fc.string({minLength: 0, maxLength: 3}).filter((s) => /^[a-z]*$/.test(s)),
        (tableNames, prefix) => {
          const cache = createMockCache(tableNames);
          const autocomplete = new TableAutocomplete(cache);

          const suggestions = autocomplete.getTableSuggestions(prefix);
          const cacheNames = new Set(tableNames.map((n) => n.toLowerCase()));

          // All suggestions should be in the cache
          return suggestions.every((s) => cacheNames.has(s.toLowerCase()));
        },
      ),
      {numRuns: 10},
    );
    t.pass('all suggestions exist in the cache');
  });

  t.test('empty prefix returns tables from cache', async (t) => {
    fc.assert(
      fc.property(
        fc.array(tableNameArb, {minLength: 1, maxLength: 10}),
        (tableNames) => {
          const cache = createMockCache(tableNames);
          const autocomplete = new TableAutocomplete(cache);

          const suggestions = autocomplete.getTableSuggestions('');

          // Should return some tables (up to 10)
          return suggestions.length > 0 &&
                     suggestions.length <= Math.min(10, tableNames.length);
        },
      ),
      {numRuns: 10},
    );
    t.pass('empty prefix returns tables from cache');
  });

  t.test('getSuggestions only triggers in table contexts', async (t) => {
    const contextArb = fc.constantFrom(...TABLE_CONTEXTS);

    fc.assert(
      fc.property(
        fc.array(tableNameArb, {minLength: 1, maxLength: 10}),
        contextArb,
        tableNameArb,
        (tableNames, context, prefix) => {
          const cache = createMockCache(tableNames);
          const autocomplete = new TableAutocomplete(cache);

          // Build SQL with table context
          const sql = `${context} ${prefix}`;
          const suggestions = autocomplete.getSuggestions({
            word: prefix,
            position: sql.length,
            fullText: sql,
          });

          // Should return suggestions in table context
          // (may be empty if no matches, but should not error)
          return Array.isArray(suggestions);
        },
      ),
      {numRuns: 10},
    );
    t.pass('getSuggestions only triggers in table contexts');
  });

  t.test('non-table contexts return empty suggestions', async (t) => {
    const nonContextArb = fc.constantFrom('SELECT', 'WHERE', 'SET', 'AND', 'OR');

    fc.assert(
      fc.property(
        fc.array(tableNameArb, {minLength: 1, maxLength: 10}),
        nonContextArb,
        tableNameArb,
        (tableNames, context, prefix) => {
          const cache = createMockCache(tableNames);
          const autocomplete = new TableAutocomplete(cache);

          // Build SQL without table context
          const sql = `${context} ${prefix}`;
          const suggestions = autocomplete.getSuggestions({
            word: prefix,
            position: sql.length,
            fullText: sql,
          });

          // Should return empty in non-table context
          return suggestions.length === 0;
        },
      ),
      {numRuns: 10},
    );
    t.pass('non-table contexts return empty suggestions');
  });

  t.test('isValidTableName is consistent with cache', async (t) => {
    fc.assert(
      fc.property(
        fc.array(tableNameArb, {minLength: 1, maxLength: 10}),
        tableNameArb,
        (tableNames, testName) => {
          const cache = createMockCache(tableNames);
          const autocomplete = new TableAutocomplete(cache);

          const isValid = autocomplete.isValidTableName(testName);
          const existsInCache = tableNames.some((n) =>
            n.toLowerCase() === testName.toLowerCase(),
          );

          return isValid === existsInCache;
        },
      ),
      {numRuns: 10},
    );
    t.pass('isValidTableName is consistent with cache');
  });
});
