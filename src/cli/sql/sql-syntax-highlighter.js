/**
 * SQLSyntaxHighlighter - Syntax highlighting for SQL queries
 *
 * Provides keyword highlighting for SQL statements using
 * blessed-compatible color formatting tags.
 *
 * Requirements: 9.1
 */

/**
 * SQL keywords organized by category
 */
export const SQL_KEYWORDS = {
  // DML keywords
  dml: [
    'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES',
    'UPDATE', 'SET', 'DELETE', 'MERGE', 'UPSERT',
  ],
  // Clauses
  clauses: [
    'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET',
    'DISTINCT', 'ALL', 'AS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  ],
  // Joins
  joins: [
    'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'CROSS',
    'FULL', 'NATURAL', 'ON', 'USING',
  ],
  // Operators
  operators: [
    'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'IS',
    'EXISTS', 'ANY', 'SOME', 'UNION', 'INTERSECT', 'EXCEPT',
  ],
  // Sort directions
  sort: ['ASC', 'DESC', 'NULLS', 'FIRST', 'LAST'],
  // Literals
  literals: ['NULL', 'TRUE', 'FALSE', 'DEFAULT'],
  // Aggregate functions
  aggregates: ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'],
  // DDL keywords (for completeness)
  ddl: [
    'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'TABLE',
    'INDEX', 'VIEW', 'DATABASE', 'SCHEMA',
  ],
  // Constraints
  constraints: [
    'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'UNIQUE',
    'CHECK', 'CONSTRAINT', 'NOT', 'NULL',
  ],
  // Live query extension
  live: ['LIVE'],
};

/**
 * Color scheme for syntax highlighting
 * Uses blessed-compatible color tags
 */
export const HIGHLIGHT_COLORS = {
  keyword: 'blue',
  string: 'green',
  number: 'yellow',
  parameter: 'magenta',
  comment: 'gray',
  function: 'cyan',
};

/**
 * SQLSyntaxHighlighter class for SQL keyword highlighting
 */
export class SQLSyntaxHighlighter {
  /**
   * Creates a new SQLSyntaxHighlighter
   * @param {Object} options - Highlighter options
   * @param {Object} [options.colors] - Custom color scheme
   */
  constructor(options = {}) {
    this.colors = {...HIGHLIGHT_COLORS, ...options.colors};

    // Build combined keyword list
    this.keywords = new Set();
    for (const category of Object.values(SQL_KEYWORDS)) {
      for (const keyword of category) {
        this.keywords.add(keyword.toUpperCase());
      }
    }

    // Build keyword pattern for matching
    const allKeywords = Array.from(this.keywords);
    this.keywordPattern = new RegExp(
      `\\b(${allKeywords.join('|')})\\b`,
      'gi',
    );
  }

  /**
   * Highlight SQL text with color formatting tags
   * Requirements: 9.1
   * @param {string} sql - SQL text to highlight
   * @return {string} Highlighted text with blessed color tags
   */
  highlight(sql) {
    if (!sql) return '';

    let result = sql;

    // Highlight comments first (they should not be further processed)
    result = this.highlightComments(result);

    // Highlight strings (single quotes) - do this early to avoid
    // highlighting keywords inside strings
    result = this.highlightStrings(result);

    // Highlight keywords
    result = this.highlightKeywords(result);

    // Highlight parameters (?) and $n - before numbers to avoid conflicts
    result = this.highlightParameters(result);

    // Highlight numbers
    result = this.highlightNumbers(result);

    return result;
  }

  /**
   * Highlight SQL keywords
   * @param {string} text - Text to process
   * @return {string} Text with highlighted keywords
   */
  highlightKeywords(text) {
    const color = this.colors.keyword;
    return text.replace(this.keywordPattern, (match, keyword, offset, str) => {
      // Don't highlight if inside an already-highlighted section
      const before = str.slice(0, offset);
      const openTags = (before.match(/\{[a-z]+-fg\}/g) || []).length;
      const closeTags = (before.match(/\{\/\}/g) || []).length;
      if (openTags > closeTags) {
        return match; // Inside a tag, don't highlight
      }
      return `{${color}-fg}${keyword.toUpperCase()}{/}`;
    });
  }

  /**
   * Highlight string literals
   * @param {string} text - Text to process
   * @return {string} Text with highlighted strings
   */
  highlightStrings(text) {
    const color = this.colors.string;
    // Match single-quoted strings, handling escaped quotes
    return text.replace(/'(?:[^'\\]|\\.)*'/g, (match) => {
      return `{${color}-fg}${match}{/}`;
    });
  }

  /**
   * Highlight numeric literals
   * @param {string} text - Text to process
   * @return {string} Text with highlighted numbers
   */
  highlightNumbers(text) {
    const color = this.colors.number;
    // Match integers and decimals, but not inside already-highlighted sections
    return text.replace(/\b(\d+(?:\.\d+)?)\b/g, (match, num, offset, str) => {
      // Check if we're inside a color tag
      const before = str.slice(0, offset);
      const openTags = (before.match(/\{[a-z]+-fg\}/g) || []).length;
      const closeTags = (before.match(/\{\/\}/g) || []).length;
      if (openTags > closeTags) {
        return match; // Inside a tag, don't highlight
      }
      return `{${color}-fg}${num}{/}`;
    });
  }

  /**
   * Highlight parameter placeholders
   * @param {string} text - Text to process
   * @return {string} Text with highlighted parameters
   */
  highlightParameters(text) {
    const color = this.colors.parameter;
    // Match ? placeholders and $n style parameters
    return text.replace(/(\?|\$\d+)/g, (match, param, offset, str) => {
      // Check if we're inside a color tag
      const before = str.slice(0, offset);
      const openTags = (before.match(/\{[a-z]+-fg\}/g) || []).length;
      const closeTags = (before.match(/\{\/\}/g) || []).length;
      if (openTags > closeTags) {
        return match;
      }
      return `{${color}-fg}${param}{/}`;
    });
  }

  /**
   * Highlight SQL comments
   * @param {string} text - Text to process
   * @return {string} Text with highlighted comments
   */
  highlightComments(text) {
    const color = this.colors.comment;
    // Match /* */ style comments first (can span multiple lines)
    let result = text.replace(/\/\*[\s\S]*?\*\//g, (match) => {
      return `{${color}-fg}${match}{/}`;
    });
    // Match -- style comments (to end of line)
    result = result.replace(/--[^\n]*/g, (match) => {
      return `{${color}-fg}${match}{/}`;
    });
    return result;
  }

  /**
   * Check if a word is a SQL keyword
   * @param {string} word - Word to check
   * @return {boolean} True if word is a keyword
   */
  isKeyword(word) {
    if (!word) return false;
    return this.keywords.has(word.toUpperCase());
  }

  /**
   * Get all keywords
   * @return {Array<string>} Array of all keywords
   */
  getKeywords() {
    return Array.from(this.keywords);
  }

  /**
   * Get keywords by category
   * @param {string} category - Category name
   * @return {Array<string>} Keywords in category
   */
  getKeywordsByCategory(category) {
    return SQL_KEYWORDS[category] || [];
  }

  /**
   * Strip color tags from highlighted text
   * @param {string} text - Highlighted text
   * @return {string} Plain text without color tags
   */
  stripHighlighting(text) {
    if (!text) return '';
    return text.replace(/\{[a-z]+-fg\}|\{\/\}/g, '');
  }
}
