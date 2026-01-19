import {test} from 'tap';
import {
  SQLSyntaxHighlighter,
  SQL_KEYWORDS,
  HIGHLIGHT_COLORS,
} from '../../../src/cli/sql/sql-syntax-highlighter.js';

test('SQLSyntaxHighlighter', async (t) => {
  t.test('constructor initializes with default colors', async (t) => {
    const highlighter = new SQLSyntaxHighlighter();

    t.equal(highlighter.colors.keyword, 'blue');
    t.equal(highlighter.colors.string, 'green');
    t.equal(highlighter.colors.number, 'yellow');
  });

  t.test('constructor accepts custom colors', async (t) => {
    const highlighter = new SQLSyntaxHighlighter({
      colors: {keyword: 'cyan'},
    });

    t.equal(highlighter.colors.keyword, 'cyan');
    t.equal(highlighter.colors.string, 'green'); // Default preserved
  });

  t.test('highlight returns empty string for null/undefined', async (t) => {
    const highlighter = new SQLSyntaxHighlighter();

    t.equal(highlighter.highlight(null), '');
    t.equal(highlighter.highlight(undefined), '');
    t.equal(highlighter.highlight(''), '');
  });

  t.test('highlight highlights SELECT keyword', async (t) => {
    const highlighter = new SQLSyntaxHighlighter();

    const result = highlighter.highlight('SELECT * FROM users');

    t.ok(result.includes('{blue-fg}SELECT{/}'));
    t.ok(result.includes('{blue-fg}FROM{/}'));
  });

  t.test('highlight is case-insensitive for keywords', async (t) => {
    const highlighter = new SQLSyntaxHighlighter();

    const result1 = highlighter.highlight('select * from users');
    const result2 = highlighter.highlight('Select * From Users');

    t.ok(result1.includes('{blue-fg}SELECT{/}'));
    t.ok(result1.includes('{blue-fg}FROM{/}'));
    t.ok(result2.includes('{blue-fg}SELECT{/}'));
    t.ok(result2.includes('{blue-fg}FROM{/}'));
  });

  t.test('highlight highlights INSERT keyword', async (t) => {
    const highlighter = new SQLSyntaxHighlighter();

    const result = highlighter.highlight('INSERT INTO users VALUES (1)');

    t.ok(result.includes('{blue-fg}INSERT{/}'));
    t.ok(result.includes('{blue-fg}INTO{/}'));
    t.ok(result.includes('{blue-fg}VALUES{/}'));
  });

  t.test('highlight highlights UPDATE keyword', async (t) => {
    const highlighter = new SQLSyntaxHighlighter();

    const result = highlighter.highlight('UPDATE users SET name = ?');

    t.ok(result.includes('{blue-fg}UPDATE{/}'));
    t.ok(result.includes('{blue-fg}SET{/}'));
  });

  t.test('highlight highlights DELETE keyword', async (t) => {
    const highlighter = new SQLSyntaxHighlighter();

    const result = highlighter.highlight('DELETE FROM users WHERE id = 1');

    t.ok(result.includes('{blue-fg}DELETE{/}'));
    t.ok(result.includes('{blue-fg}FROM{/}'));
    t.ok(result.includes('{blue-fg}WHERE{/}'));
  });

  t.test('highlight highlights WHERE clause keywords', async (t) => {
    const highlighter = new SQLSyntaxHighlighter();

    const result = highlighter.highlight('SELECT * FROM users WHERE id = 1 AND name LIKE ?');

    t.ok(result.includes('{blue-fg}WHERE{/}'));
    t.ok(result.includes('{blue-fg}AND{/}'));
    t.ok(result.includes('{blue-fg}LIKE{/}'));
  });

  t.test('highlight highlights JOIN keywords', async (t) => {
    const highlighter = new SQLSyntaxHighlighter();

    const result = highlighter.highlight(
      'SELECT * FROM users LEFT JOIN orders ON users.id = orders.user_id',
    );

    t.ok(result.includes('{blue-fg}LEFT{/}'));
    t.ok(result.includes('{blue-fg}JOIN{/}'));
    t.ok(result.includes('{blue-fg}ON{/}'));
  });

  t.test('highlight highlights ORDER BY keywords', async (t) => {
    const highlighter = new SQLSyntaxHighlighter();

    const result = highlighter.highlight('SELECT * FROM users ORDER BY name ASC');

    t.ok(result.includes('{blue-fg}ORDER{/}'));
    t.ok(result.includes('{blue-fg}BY{/}'));
    t.ok(result.includes('{blue-fg}ASC{/}'));
  });

  t.test('highlight highlights string literals', async (t) => {
    const highlighter = new SQLSyntaxHighlighter();

    const result = highlighter.highlight('SELECT * FROM users WHERE name = \'John\'');

    t.ok(result.includes('{green-fg}\'John\'{/}'));
  });

  t.test('highlight handles escaped quotes in strings', async (t) => {
    const highlighter = new SQLSyntaxHighlighter();

    const result = highlighter.highlight('SELECT * FROM users WHERE name = \'O\\\'Brien\'');

    t.ok(result.includes('{green-fg}'));
  });

  t.test('highlight highlights numeric literals', async (t) => {
    const highlighter = new SQLSyntaxHighlighter();

    const result = highlighter.highlight('SELECT * FROM users WHERE id = 123');

    t.ok(result.includes('{yellow-fg}123{/}'));
  });

  t.test('highlight highlights decimal numbers', async (t) => {
    const highlighter = new SQLSyntaxHighlighter();

    const result = highlighter.highlight('SELECT * FROM products WHERE price > 19.99');

    t.ok(result.includes('{yellow-fg}19.99{/}'));
  });

  t.test('highlight highlights parameter placeholders', async (t) => {
    const highlighter = new SQLSyntaxHighlighter();

    const result = highlighter.highlight('SELECT * FROM users WHERE id = ?');

    t.ok(result.includes('{magenta-fg}?{/}'));
  });

  t.test('highlight highlights $n style parameters', async (t) => {
    const highlighter = new SQLSyntaxHighlighter();

    const result = highlighter.highlight('SELECT * FROM users WHERE id = $1 AND name = $2');

    t.ok(result.includes('{magenta-fg}$1{/}'));
    t.ok(result.includes('{magenta-fg}$2{/}'));
  });

  t.test('highlight highlights NULL keyword', async (t) => {
    const highlighter = new SQLSyntaxHighlighter();

    const result = highlighter.highlight('SELECT * FROM users WHERE email IS NULL');

    t.ok(result.includes('{blue-fg}IS{/}'));
    t.ok(result.includes('{blue-fg}NULL{/}'));
  });

  t.test('highlight highlights TRUE and FALSE', async (t) => {
    const highlighter = new SQLSyntaxHighlighter();

    const result = highlighter.highlight('SELECT * FROM users WHERE active = TRUE');

    t.ok(result.includes('{blue-fg}TRUE{/}'));
  });

  t.test('highlight highlights LIVE keyword', async (t) => {
    const highlighter = new SQLSyntaxHighlighter();

    const result = highlighter.highlight('LIVE SELECT * FROM users');

    t.ok(result.includes('{blue-fg}LIVE{/}'));
    t.ok(result.includes('{blue-fg}SELECT{/}'));
  });

  t.test('highlight highlights aggregate functions', async (t) => {
    const highlighter = new SQLSyntaxHighlighter();

    const result = highlighter.highlight('SELECT COUNT(*), SUM(amount), AVG(price) FROM orders');

    t.ok(result.includes('{blue-fg}COUNT{/}'));
    t.ok(result.includes('{blue-fg}SUM{/}'));
    t.ok(result.includes('{blue-fg}AVG{/}'));
  });

  t.test('highlight highlights -- comments', async (t) => {
    const highlighter = new SQLSyntaxHighlighter();

    const result = highlighter.highlight('SELECT * FROM users -- get all users');

    t.ok(result.includes('{gray-fg}-- get all users{/}'));
  });

  t.test('highlight highlights /* */ comments', async (t) => {
    const highlighter = new SQLSyntaxHighlighter();

    const result = highlighter.highlight('SELECT /* columns */ * FROM users');

    t.ok(result.includes('{gray-fg}/* columns */{/}'));
  });

  t.test('isKeyword returns true for SQL keywords', async (t) => {
    const highlighter = new SQLSyntaxHighlighter();

    t.equal(highlighter.isKeyword('SELECT'), true);
    t.equal(highlighter.isKeyword('select'), true);
    t.equal(highlighter.isKeyword('FROM'), true);
    t.equal(highlighter.isKeyword('WHERE'), true);
    t.equal(highlighter.isKeyword('INSERT'), true);
  });

  t.test('isKeyword returns false for non-keywords', async (t) => {
    const highlighter = new SQLSyntaxHighlighter();

    t.equal(highlighter.isKeyword('users'), false);
    t.equal(highlighter.isKeyword('name'), false);
    t.equal(highlighter.isKeyword(''), false);
    t.equal(highlighter.isKeyword(null), false);
  });

  t.test('getKeywords returns all keywords', async (t) => {
    const highlighter = new SQLSyntaxHighlighter();
    const keywords = highlighter.getKeywords();

    t.ok(keywords.includes('SELECT'));
    t.ok(keywords.includes('FROM'));
    t.ok(keywords.includes('WHERE'));
    t.ok(keywords.length > 50); // Should have many keywords
  });

  t.test('getKeywordsByCategory returns category keywords', async (t) => {
    const highlighter = new SQLSyntaxHighlighter();

    const dmlKeywords = highlighter.getKeywordsByCategory('dml');
    t.ok(dmlKeywords.includes('SELECT'));
    t.ok(dmlKeywords.includes('INSERT'));

    const joinKeywords = highlighter.getKeywordsByCategory('joins');
    t.ok(joinKeywords.includes('JOIN'));
    t.ok(joinKeywords.includes('LEFT'));
  });

  t.test('getKeywordsByCategory returns empty for unknown category', async (t) => {
    const highlighter = new SQLSyntaxHighlighter();

    const keywords = highlighter.getKeywordsByCategory('unknown');
    t.same(keywords, []);
  });

  t.test('stripHighlighting removes color tags', async (t) => {
    const highlighter = new SQLSyntaxHighlighter();
    const highlighted = highlighter.highlight('SELECT * FROM users');

    const stripped = highlighter.stripHighlighting(highlighted);

    t.equal(stripped, 'SELECT * FROM users');
  });

  t.test('stripHighlighting handles empty input', async (t) => {
    const highlighter = new SQLSyntaxHighlighter();

    t.equal(highlighter.stripHighlighting(''), '');
    t.equal(highlighter.stripHighlighting(null), '');
  });

  t.test('SQL_KEYWORDS constant has expected categories', async (t) => {
    t.ok(SQL_KEYWORDS.dml);
    t.ok(SQL_KEYWORDS.clauses);
    t.ok(SQL_KEYWORDS.joins);
    t.ok(SQL_KEYWORDS.operators);
    t.ok(SQL_KEYWORDS.sort);
    t.ok(SQL_KEYWORDS.literals);
    t.ok(SQL_KEYWORDS.aggregates);
    t.ok(SQL_KEYWORDS.ddl);
    t.ok(SQL_KEYWORDS.live);
  });

  t.test('HIGHLIGHT_COLORS constant has expected colors', async (t) => {
    t.equal(HIGHLIGHT_COLORS.keyword, 'blue');
    t.equal(HIGHLIGHT_COLORS.string, 'green');
    t.equal(HIGHLIGHT_COLORS.number, 'yellow');
    t.equal(HIGHLIGHT_COLORS.parameter, 'magenta');
    t.equal(HIGHLIGHT_COLORS.comment, 'gray');
  });
});
