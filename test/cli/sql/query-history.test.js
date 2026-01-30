import {test} from '../../../src/test-helpers/tap.js';
import {
  QueryHistory,
  DEFAULT_MAX_ENTRIES,
  DEFAULT_PERSIST_PATH,
} from '../../../src/cli/sql/query-history.js';

test('QueryHistory', async (t) => {
  t.test('constructor initializes with default values', async (t) => {
    const history = new QueryHistory({autoLoad: false});

    t.equal(history.maxEntries, DEFAULT_MAX_ENTRIES);
    t.equal(history.length, 0);
  });

  t.test('constructor accepts custom maxEntries', async (t) => {
    const history = new QueryHistory({maxEntries: 50, autoLoad: false});

    t.equal(history.maxEntries, 50);
  });

  t.test('add adds query to front of history', async (t) => {
    const history = new QueryHistory({autoLoad: false});

    history.add('SELECT * FROM users');
    history.add('SELECT * FROM orders');

    t.equal(history.getAt(0), 'SELECT * FROM orders');
    t.equal(history.getAt(1), 'SELECT * FROM users');
  });

  t.test('add trims whitespace', async (t) => {
    const history = new QueryHistory({autoLoad: false});

    history.add('  SELECT * FROM users  ');

    t.equal(history.getAt(0), 'SELECT * FROM users');
  });

  t.test('add ignores empty queries', async (t) => {
    const history = new QueryHistory({autoLoad: false});

    history.add('');
    history.add('   ');
    history.add(null);
    history.add(undefined);

    t.equal(history.length, 0);
  });

  t.test('add moves duplicate to front', async (t) => {
    const history = new QueryHistory({autoLoad: false});

    history.add('query1');
    history.add('query2');
    history.add('query3');
    history.add('query1'); // Duplicate

    t.equal(history.length, 3);
    t.equal(history.getAt(0), 'query1');
    t.equal(history.getAt(1), 'query3');
    t.equal(history.getAt(2), 'query2');
  });

  t.test('add enforces maxEntries limit', async (t) => {
    const history = new QueryHistory({maxEntries: 3, autoLoad: false});

    history.add('query1');
    history.add('query2');
    history.add('query3');
    history.add('query4');

    t.equal(history.length, 3);
    t.equal(history.getAt(0), 'query4');
    t.equal(history.getAt(2), 'query2');
  });

  t.test('getAt returns query at index', async (t) => {
    const history = new QueryHistory({autoLoad: false});
    history.add('query1');
    history.add('query2');

    t.equal(history.getAt(0), 'query2');
    t.equal(history.getAt(1), 'query1');
  });

  t.test('getAt returns null for invalid index', async (t) => {
    const history = new QueryHistory({autoLoad: false});
    history.add('query1');

    t.equal(history.getAt(-1), null);
    t.equal(history.getAt(5), null);
  });

  t.test('getAll returns copy of entries', async (t) => {
    const history = new QueryHistory({autoLoad: false});
    history.add('query1');
    history.add('query2');

    const all = history.getAll();

    t.same(all, ['query2', 'query1']);

    // Verify it's a copy
    all.push('query3');
    t.equal(history.length, 2);
  });

  t.test('length returns entry count', async (t) => {
    const history = new QueryHistory({autoLoad: false});

    t.equal(history.length, 0);

    history.add('query1');
    t.equal(history.length, 1);

    history.add('query2');
    t.equal(history.length, 2);
  });

  t.test('clear removes all entries', async (t) => {
    const history = new QueryHistory({autoLoad: false});
    history.add('query1');
    history.add('query2');

    history.clear();

    t.equal(history.length, 0);
  });

  t.test('contains returns true for existing query', async (t) => {
    const history = new QueryHistory({autoLoad: false});
    history.add('SELECT * FROM users');

    t.equal(history.contains('SELECT * FROM users'), true);
    t.equal(history.contains('  SELECT * FROM users  '), true);
  });

  t.test('contains returns false for non-existing query', async (t) => {
    const history = new QueryHistory({autoLoad: false});
    history.add('SELECT * FROM users');

    t.equal(history.contains('SELECT * FROM orders'), false);
    t.equal(history.contains(''), false);
    t.equal(history.contains(null), false);
  });

  t.test('search returns matching queries', async (t) => {
    const history = new QueryHistory({autoLoad: false});
    history.add('SELECT * FROM users');
    history.add('SELECT * FROM orders');
    history.add('INSERT INTO users VALUES (1)');

    const results = history.search('users');

    t.equal(results.length, 2);
    t.ok(results.includes('SELECT * FROM users'));
    t.ok(results.includes('INSERT INTO users VALUES (1)'));
  });

  t.test('search is case-insensitive', async (t) => {
    const history = new QueryHistory({autoLoad: false});
    history.add('SELECT * FROM users');

    const results = history.search('USERS');

    t.equal(results.length, 1);
  });

  t.test('search returns all for empty pattern', async (t) => {
    const history = new QueryHistory({autoLoad: false});
    history.add('query1');
    history.add('query2');

    const results = history.search('');

    t.equal(results.length, 2);
  });

  t.test('serialize returns JSON string', async (t) => {
    const history = new QueryHistory({autoLoad: false});
    history.add('query1');
    history.add('query2');

    const json = history.serialize();

    t.equal(json, '["query2","query1"]');
  });

  t.test('deserialize loads from JSON string', async (t) => {
    const history = new QueryHistory({autoLoad: false});

    history.deserialize('["query1","query2"]');

    t.equal(history.length, 2);
    t.equal(history.getAt(0), 'query1');
    t.equal(history.getAt(1), 'query2');
  });

  t.test('deserialize handles invalid JSON', async (t) => {
    const history = new QueryHistory({autoLoad: false});
    history.add('existing');

    history.deserialize('not valid json');

    // Should keep existing entries
    t.equal(history.length, 1);
  });

  t.test('deserialize filters invalid entries', async (t) => {
    const history = new QueryHistory({autoLoad: false});

    history.deserialize('["valid", null, "", 123, "also valid"]');

    t.equal(history.length, 2);
    t.equal(history.getAt(0), 'valid');
    t.equal(history.getAt(1), 'also valid');
  });

  t.test('deserialize respects maxEntries', async (t) => {
    const history = new QueryHistory({maxEntries: 2, autoLoad: false});

    history.deserialize('["q1","q2","q3","q4"]');

    t.equal(history.length, 2);
  });

  t.test('getMostRecent returns first entry', async (t) => {
    const history = new QueryHistory({autoLoad: false});
    history.add('query1');
    history.add('query2');

    t.equal(history.getMostRecent(), 'query2');
  });

  t.test('getMostRecent returns null for empty history', async (t) => {
    const history = new QueryHistory({autoLoad: false});

    t.equal(history.getMostRecent(), null);
  });

  t.test('remove removes specific query', async (t) => {
    const history = new QueryHistory({autoLoad: false});
    history.add('query1');
    history.add('query2');
    history.add('query3');

    const removed = history.remove('query2');

    t.equal(removed, true);
    t.equal(history.length, 2);
    t.equal(history.contains('query2'), false);
  });

  t.test('remove returns false for non-existing query', async (t) => {
    const history = new QueryHistory({autoLoad: false});
    history.add('query1');

    const removed = history.remove('nonexistent');

    t.equal(removed, false);
    t.equal(history.length, 1);
  });

  t.test('resolvePath expands home directory', async (t) => {
    const history = new QueryHistory({autoLoad: false});
    const resolved = history.resolvePath('~/test/path');

    t.ok(resolved.includes('test/path'));
    t.ok(!resolved.startsWith('~'));
  });

  t.test('resolvePath handles non-home paths', async (t) => {
    const history = new QueryHistory({autoLoad: false});

    t.equal(history.resolvePath('/absolute/path'), '/absolute/path');
    t.equal(history.resolvePath('relative/path'), 'relative/path');
    t.equal(history.resolvePath(null), null);
  });

  t.test('DEFAULT_MAX_ENTRIES constant is 100', async (t) => {
    t.equal(DEFAULT_MAX_ENTRIES, 100);
  });

  t.test('DEFAULT_PERSIST_PATH constant is correct', async (t) => {
    t.equal(DEFAULT_PERSIST_PATH, '~/.ddb-admin/query_history.json');
  });
});
