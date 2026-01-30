import {test} from '../../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  SQLSyntaxHighlighter,
  SQL_KEYWORDS,
} from '../../../src/cli/sql/sql-syntax-highlighter.js';

/**
 * Property 22: SQL Keyword Highlighting
 * Validates: Requirements 9.1
 *
 * For any SQL text containing keywords, the highlighter should:
 * - Highlight all SQL keywords with the keyword color
 * - Preserve the original text content (stripping tags returns original)
 * - Be case-insensitive for keyword matching
 * - Not highlight keywords inside strings or comments
 */

test('Property 22: SQL Keyword Highlighting', async (t) => {
  // Get all keywords for testing
  const allKeywords = [];
  for (const category of Object.values(SQL_KEYWORDS)) {
    allKeywords.push(...category);
  }

  t.test('all SQL keywords are highlighted', async (t) => {
    const keywordArb = fc.constantFrom(...allKeywords);

    fc.assert(
      fc.property(
        keywordArb,
        (keyword) => {
          const highlighter = new SQLSyntaxHighlighter();
          const sql = `${keyword} test`;

          const result = highlighter.highlight(sql);

          // Keyword should be highlighted with blue color
          return result.includes(`{blue-fg}${keyword.toUpperCase()}{/}`);
        },
      ),
      {numRuns: 10},
    );
    t.pass('all SQL keywords are highlighted');
  });

  t.test('keyword highlighting is case-insensitive', async (t) => {
    const keywordArb = fc.constantFrom(...allKeywords);
    const caseTransformArb = fc.constantFrom(
      (s) => s.toLowerCase(),
      (s) => s.toUpperCase(),
      (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(),
    );

    fc.assert(
      fc.property(
        keywordArb,
        caseTransformArb,
        (keyword, transform) => {
          const highlighter = new SQLSyntaxHighlighter();
          const transformedKeyword = transform(keyword);
          const sql = `${transformedKeyword} test`;

          const result = highlighter.highlight(sql);

          // Should be highlighted regardless of case
          return result.includes(`{blue-fg}${keyword.toUpperCase()}{/}`);
        },
      ),
      {numRuns: 10},
    );
    t.pass('keyword highlighting is case-insensitive');
  });

  t.test('stripping highlighting returns original text', async (t) => {
    fc.assert(
      fc.property(
        fc.string({minLength: 0, maxLength: 100}),
        (text) => {
          const highlighter = new SQLSyntaxHighlighter();

          const highlighted = highlighter.highlight(text);
          const stripped = highlighter.stripHighlighting(highlighted);

          // Stripped text should match original (with keywords uppercased)
          // Since keywords get uppercased, we need to account for that
          const normalizedOriginal = text.replace(
            new RegExp(`\\b(${allKeywords.join('|')})\\b`, 'gi'),
            (m) => m.toUpperCase(),
          );
          return stripped === normalizedOriginal;
        },
      ),
      {numRuns: 10},
    );
    t.pass('stripping highlighting returns original text');
  });

  t.test('keywords inside strings are not highlighted', async (t) => {
    const keywordArb = fc.constantFrom(...allKeywords);

    fc.assert(
      fc.property(
        keywordArb,
        (keyword) => {
          const highlighter = new SQLSyntaxHighlighter();
          const sql = `SELECT * FROM users WHERE name = '${keyword}'`;

          const result = highlighter.highlight(sql);

          // The keyword inside the string should be in green (string color)
          // not blue (keyword color)
          const stringContent = `'${keyword}'`;
          return result.includes(`{green-fg}${stringContent}{/}`);
        },
      ),
      {numRuns: 10},
    );
    t.pass('keywords inside strings are not highlighted');
  });

  t.test('keywords inside comments are not highlighted as keywords', async (t) => {
    const keywordArb = fc.constantFrom(...allKeywords);

    fc.assert(
      fc.property(
        keywordArb,
        (keyword) => {
          const highlighter = new SQLSyntaxHighlighter();
          const sql = `SELECT * FROM users -- ${keyword} comment`;

          const result = highlighter.highlight(sql);

          // The comment should be gray, and the keyword inside should not
          // be separately highlighted as blue
          const _commentPart = `-- ${keyword} comment`;
          // Check that the comment is highlighted as gray
          return result.includes('{gray-fg}') &&
                     !result.includes(`{gray-fg}-- {blue-fg}${keyword.toUpperCase()}{/}`);
        },
      ),
      {numRuns: 10},
    );
    t.pass('keywords inside comments are not highlighted as keywords');
  });

  t.test('highlighting preserves non-keyword text', async (t) => {
    fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 20}).filter((s) => /^[a-z_][a-z0-9_]*$/i.test(s)),
        (identifier) => {
          // Skip if identifier is a keyword
          const highlighter = new SQLSyntaxHighlighter();
          if (highlighter.isKeyword(identifier)) {
            return true; // Skip this case
          }

          const sql = `SELECT ${identifier} FROM table1`;
          const result = highlighter.highlight(sql);

          // The identifier should appear in the result unchanged
          // (not wrapped in keyword color tags)
          return result.includes(identifier) &&
                     !result.includes(`{blue-fg}${identifier.toUpperCase()}{/}`);
        },
      ),
      {numRuns: 10},
    );
    t.pass('highlighting preserves non-keyword text');
  });

  t.test('multiple keywords in same query are all highlighted', async (t) => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...allKeywords), {minLength: 2, maxLength: 5}),
        (keywords) => {
          const highlighter = new SQLSyntaxHighlighter();
          const sql = keywords.join(' ');

          const result = highlighter.highlight(sql);

          // All keywords should be highlighted
          return keywords.every((kw) =>
            result.includes(`{blue-fg}${kw.toUpperCase()}{/}`),
          );
        },
      ),
      {numRuns: 10},
    );
    t.pass('multiple keywords in same query are all highlighted');
  });
});
