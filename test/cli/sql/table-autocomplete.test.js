import {test} from 'tap';
import {
  TableAutocomplete,
  TABLE_CONTEXTS,
} from '../../../src/cli/sql/table-autocomplete.js';

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

test('TableAutocomplete', async (t) => {
  t.test('constructor initializes with cache', async (t) => {
    const cache = createMockCache(['users', 'orders']);
    const autocomplete = new TableAutocomplete(cache);

    t.ok(autocomplete.cache);
  });

  t.test('getSuggestions returns empty for non-table context', async (t) => {
    const cache = createMockCache(['users', 'orders']);
    const autocomplete = new TableAutocomplete(cache);

    const suggestions = autocomplete.getSuggestions({
      word: 'use',
      position: 10,
      fullText: 'SELECT * use',
    });

    t.same(suggestions, []);
  });

  t.test('getSuggestions returns matches after FROM', async (t) => {
    const cache = createMockCache(['users', 'orders', 'products']);
    const autocomplete = new TableAutocomplete(cache);

    const suggestions = autocomplete.getSuggestions({
      word: 'use',
      position: 17,
      fullText: 'SELECT * FROM use',
    });

    t.same(suggestions, ['users']);
  });

  t.test('getSuggestions returns matches after INTO', async (t) => {
    const cache = createMockCache(['users', 'orders']);
    const autocomplete = new TableAutocomplete(cache);

    const suggestions = autocomplete.getSuggestions({
      word: 'use',
      position: 15,
      fullText: 'INSERT INTO use',
    });

    t.same(suggestions, ['users']);
  });

  t.test('getSuggestions returns matches after UPDATE', async (t) => {
    const cache = createMockCache(['users', 'orders']);
    const autocomplete = new TableAutocomplete(cache);

    const suggestions = autocomplete.getSuggestions({
      word: 'use',
      position: 10,
      fullText: 'UPDATE use',
    });

    t.same(suggestions, ['users']);
  });

  t.test('getSuggestions returns matches after JOIN', async (t) => {
    const cache = createMockCache(['users', 'orders', 'user_roles']);
    const autocomplete = new TableAutocomplete(cache);

    const suggestions = autocomplete.getSuggestions({
      word: 'user',
      position: 30,
      fullText: 'SELECT * FROM orders JOIN user',
    });

    t.same(suggestions, ['user_roles', 'users']);
  });

  t.test('getSuggestions is case-insensitive', async (t) => {
    const cache = createMockCache(['Users', 'ORDERS']);
    const autocomplete = new TableAutocomplete(cache);

    const suggestions = autocomplete.getSuggestions({
      word: 'use',
      position: 17,
      fullText: 'SELECT * FROM use',
    });

    t.same(suggestions, ['Users']);
  });

  t.test('getSuggestions returns all tables with empty prefix', async (t) => {
    const cache = createMockCache(['users', 'orders', 'products']);
    const autocomplete = new TableAutocomplete(cache);

    const suggestions = autocomplete.getSuggestions({
      word: '',
      position: 14,
      fullText: 'SELECT * FROM ',
    });

    t.equal(suggestions.length, 3);
  });

  t.test('getSuggestions limits results to 10', async (t) => {
    const tables = Array.from({length: 20}, (_, i) => `table${i}`);
    const cache = createMockCache(tables);
    const autocomplete = new TableAutocomplete(cache);

    const suggestions = autocomplete.getSuggestions({
      word: 'table',
      position: 19,
      fullText: 'SELECT * FROM table',
    });

    t.equal(suggestions.length, 10);
  });

  t.test('isTableContext returns true for FROM', async (t) => {
    const autocomplete = new TableAutocomplete(null);

    t.equal(autocomplete.isTableContext('SELECT * FROM '), true);
    t.equal(autocomplete.isTableContext('select * from '), true);
  });

  t.test('isTableContext returns true for INTO', async (t) => {
    const autocomplete = new TableAutocomplete(null);

    t.equal(autocomplete.isTableContext('INSERT INTO '), true);
  });

  t.test('isTableContext returns true for UPDATE', async (t) => {
    const autocomplete = new TableAutocomplete(null);

    t.equal(autocomplete.isTableContext('UPDATE '), true);
  });

  t.test('isTableContext returns true for JOIN', async (t) => {
    const autocomplete = new TableAutocomplete(null);

    t.equal(autocomplete.isTableContext('SELECT * FROM users JOIN '), true);
    t.equal(autocomplete.isTableContext('LEFT JOIN '), true);
  });

  t.test('isTableContext returns false for other contexts', async (t) => {
    const autocomplete = new TableAutocomplete(null);

    t.equal(autocomplete.isTableContext('SELECT '), false);
    t.equal(autocomplete.isTableContext('WHERE '), false);
    t.equal(autocomplete.isTableContext('SET '), false);
  });

  t.test('getTableNames returns names from cache', async (t) => {
    const cache = createMockCache(['users', 'orders', 'products']);
    const autocomplete = new TableAutocomplete(cache);

    const names = autocomplete.getTableNames();

    t.same(names, ['users', 'orders', 'products']);
  });

  t.test('getTableNames returns empty without cache', async (t) => {
    const autocomplete = new TableAutocomplete(null);

    const names = autocomplete.getTableNames();

    t.same(names, []);
  });

  t.test('getTableNames filters out null/undefined names', async (t) => {
    const cache = {
      getTables() {
        return [
          {table_name: 'users'},
          {table_name: null},
          {table_name: 'orders'},
          {},
        ];
      },
    };
    const autocomplete = new TableAutocomplete(cache);

    const names = autocomplete.getTableNames();

    t.same(names, ['users', 'orders']);
  });

  t.test('isValidTableName returns true for existing table', async (t) => {
    const cache = createMockCache(['users', 'orders']);
    const autocomplete = new TableAutocomplete(cache);

    t.equal(autocomplete.isValidTableName('users'), true);
    t.equal(autocomplete.isValidTableName('USERS'), true);
  });

  t.test('isValidTableName returns false for non-existing table', async (t) => {
    const cache = createMockCache(['users', 'orders']);
    const autocomplete = new TableAutocomplete(cache);

    t.equal(autocomplete.isValidTableName('products'), false);
    t.equal(autocomplete.isValidTableName(''), false);
    t.equal(autocomplete.isValidTableName(null), false);
  });

  t.test('getBestSuggestion returns first match', async (t) => {
    const cache = createMockCache(['users', 'user_roles', 'user_sessions']);
    const autocomplete = new TableAutocomplete(cache);

    const best = autocomplete.getBestSuggestion('user');

    t.equal(best, 'user_roles');
  });

  t.test('getBestSuggestion returns null for no matches', async (t) => {
    const cache = createMockCache(['users', 'orders']);
    const autocomplete = new TableAutocomplete(cache);

    const best = autocomplete.getBestSuggestion('xyz');

    t.equal(best, null);
  });

  t.test('getCompletion returns full table name', async (t) => {
    const cache = createMockCache(['users', 'orders']);
    const autocomplete = new TableAutocomplete(cache);

    const completion = autocomplete.getCompletion('use');

    t.equal(completion, 'users');
  });

  t.test('getCompletion returns null for no matches', async (t) => {
    const cache = createMockCache(['users', 'orders']);
    const autocomplete = new TableAutocomplete(cache);

    const completion = autocomplete.getCompletion('xyz');

    t.equal(completion, null);
  });

  t.test('detectContext returns context info', async (t) => {
    const autocomplete = new TableAutocomplete(null);

    const context = autocomplete.detectContext('SELECT * FROM use', 17);

    t.equal(context.keyword, 'FROM');
    t.equal(context.prefix, 'use');
  });

  t.test('detectContext returns null for non-table context', async (t) => {
    const autocomplete = new TableAutocomplete(null);

    const context = autocomplete.detectContext('SELECT * WHERE', 14);

    t.equal(context, null);
  });

  t.test('detectContext handles empty prefix', async (t) => {
    const autocomplete = new TableAutocomplete(null);

    const context = autocomplete.detectContext('SELECT * FROM ', 14);

    t.equal(context.keyword, 'FROM');
    t.equal(context.prefix, '');
  });

  t.test('TABLE_CONTEXTS constant has expected values', async (t) => {
    t.ok(TABLE_CONTEXTS.includes('FROM'));
    t.ok(TABLE_CONTEXTS.includes('INTO'));
    t.ok(TABLE_CONTEXTS.includes('UPDATE'));
    t.ok(TABLE_CONTEXTS.includes('JOIN'));
    t.ok(TABLE_CONTEXTS.includes('TABLE'));
  });

  t.test('handles cache errors gracefully', async (t) => {
    const cache = {
      getTables() {
        throw new Error('Cache error');
      },
    };
    const autocomplete = new TableAutocomplete(cache);

    const names = autocomplete.getTableNames();

    t.same(names, []);
  });

  t.test('getTableSuggestions sorts alphabetically', async (t) => {
    const cache = createMockCache(['users', 'user_sessions', 'user_roles']);
    const autocomplete = new TableAutocomplete(cache);

    const suggestions = autocomplete.getTableSuggestions('user');

    t.same(suggestions, ['user_roles', 'user_sessions', 'users']);
  });
});
